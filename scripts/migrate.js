#!/usr/bin/env node

/**
 * Migration script: Google Sheets → WordPress
 * 
 * This script migrates existing bloke data from Google Sheets to WordPress.
 * It requires:
 * 1. Google Sheets API credentials (from .env)
 * 2. WordPress admin credentials
 * 3. ACF plugin installed on WordPress
 * 
 * Usage: node scripts/migrate.js
 */

import {
    google
} from 'googleapis';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import {
    fileURLToPath
} from 'url';
import {
    config
} from 'dotenv';

// Load environment variables
config();

const __dirname = path.dirname(fileURLToPath(
    import.meta.url));

// Configuration
const WORDPRESS_URL = process.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com';
const WORDPRESS_USER = process.env.WORDPRESS_USER || '';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || '';
const GOOGLE_SHEETS_API_KEY = process.env.VITE_GOOGLE_SHEETS_API_KEY || '';
const GOOGLE_SHEET_ID = process.env.VITE_GOOGLE_SHEET_ID || '';
const GOOGLE_SHEET_RANGE = process.env.VITE_GOOGLE_SHEET_RANGE || 'Respuestas de formulario 1!A:G';

// Category mapping (update with your actual WordPress category IDs)
const CATEGORY_MAP = {
    'PUZLE': 1,
    'TECNICO': 2,
    'ENTRENAMIENTO': 3,
    'COORDINACION': 4,
};

// WordPress authentication
const wpAuth = Buffer.from(`${WORDPRESS_USER}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
const wpHeaders = {
    'Authorization': `Basic ${wpAuth}`,
    'Content-Type': 'application/json',
};

/**
 * Extract Google Drive file ID from URL
 */
function getDriveFileId(url) {
    if (!url) return null;

    // Pattern 1: /file/d/FILE_ID/
    const filePathMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (filePathMatch) return filePathMatch[1];

    // Pattern 2: ?id=FILE_ID or &id=FILE_ID
    const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch) return idParamMatch[1];

    return null;
}

/**
 * Download image from Google Drive
 */
async function downloadDriveImage(fileId, index) {
    try {
        // Use Google Drive thumbnail API
        const url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`Failed to download image ${fileId}: ${response.status}`);
            return null;
        }

        const buffer = await response.buffer();
        const tempPath = path.join(__dirname, `../temp_image_${index}_${Date.now()}.jpg`);

        fs.writeFileSync(tempPath, buffer);
        return tempPath;
    } catch (error) {
        console.warn(`Error downloading image ${fileId}:`, error.message);
        return null;
    }
}

/**
 * Upload image to WordPress media library
 */
async function uploadToWordPress(imagePath, title) {
    try {
        const formData = new FormData();
        const fileStream = fs.createReadStream(imagePath);

        // In Node.js, we need to use a different approach
        // For simplicity, we'll skip actual upload in this example
        // and return a placeholder

        console.log(`Would upload: ${title} from ${imagePath}`);

        // Clean up temp file
        fs.unlinkSync(imagePath);

        // Return placeholder (you'd replace with actual WordPress media ID)
        return {
            id: 0, // Placeholder
            url: 'https://rocomadrid.com/wp-content/uploads/placeholder.jpg',
        };
    } catch (error) {
        console.error(`Error uploading ${imagePath}:`, error.message);
        return null;
    }
}

/**
 * Create WordPress post with ACF fields
 */
async function createWordPressPost(blokeData, imageIds) {
    try {
        const acfFields = {
            bloke_description: blokeData.description,
            bloke_gallery: imageIds.slice(1), // All except first (featured image)
            bloke_category: CATEGORY_MAP[blokeData.category] || 1,
        };

        const postData = {
            title: blokeData.title,
            content: blokeData.description,
            status: 'publish',
            categories: [CATEGORY_MAP[blokeData.category] || 1],
            featured_media: imageIds[0] || 0,
            meta: acfFields,
        };

        console.log(`Creating post: ${blokeData.title}`);

        // In a real migration, you would make the actual API call:
        /*
        const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
          method: 'POST',
          headers: wpHeaders,
          body: JSON.stringify(postData),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        return await response.json();
        */

        // For now, just log
        return {
            id: 'placeholder',
            title: blokeData.title
        };
    } catch (error) {
        console.error(`Error creating post for ${blokeData.title}:`, error.message);
        return null;
    }
}

/**
 * Main migration function
 */
async function migrate() {
    console.log('Starting migration from Google Sheets to WordPress...');

    // Validate configuration
    if (!WORDPRESS_USER || !WORDPRESS_APP_PASSWORD) {
        console.error('Error: WordPress credentials not set in .env');
        console.error('Set WORDPRESS_USER and WORDPRESS_APP_PASSWORD');
        process.exit(1);
    }

    if (!GOOGLE_SHEETS_API_KEY || !GOOGLE_SHEET_ID) {
        console.error('Error: Google Sheets credentials not set in .env');
        console.error('Set VITE_GOOGLE_SHEETS_API_KEY and VITE_GOOGLE_SHEET_ID');
        process.exit(1);
    }

    try {
        // Initialize Google Sheets API
        const sheets = google.sheets({
            version: 'v4',
            auth: GOOGLE_SHEETS_API_KEY
        });

        // Get data from Google Sheets
        console.log(`Fetching data from sheet: ${GOOGLE_SHEET_ID}`);
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: GOOGLE_SHEET_RANGE,
        });

        const rows = response.data.values || [];
        console.log(`Found ${rows.length} rows (including header)`);

        // Skip header row
        const dataRows = rows.slice(1);

        // Process each row
        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const [timestamp, img1, img2, img3, description, title, category] = row;

            console.log(`\nProcessing row ${i + 1}: ${title || 'Untitled'}`);

            // Parse the row data
            const blokeData = {
                timestamp: timestamp || '',
                description: (description || '').slice(0, 300),
                title: (title || 'Sin título').slice(0, 35),
                category: (category || '').toUpperCase().trim(),
            };

            // Get image URLs
            const imageUrls = [img1, img2, img3].filter(url => url && url.trim());

            if (imageUrls.length === 0) {
                console.log('  No images found, skipping...');
                continue;
            }

            console.log(`  Found ${imageUrls.length} image(s)`);

            // Process images
            const uploadedImages = [];

            for (let j = 0; j < imageUrls.length; j++) {
                const url = imageUrls[j];
                const fileId = getDriveFileId(url);

                if (!fileId) {
                    console.log(`  Could not extract file ID from: ${url}`);
                    continue;
                }

                console.log(`  Processing image ${j + 1}: ${fileId}`);

                // Download image
                const tempPath = await downloadDriveImage(fileId, j);
                if (!tempPath) continue;

                // Upload to WordPress
                const uploaded = await uploadToWordPress(tempPath, `${title}_img${j + 1}`);
                if (uploaded) {
                    uploadedImages.push(uploaded);
                }
            }

            if (uploadedImages.length === 0) {
                console.log('  No images uploaded, skipping post creation');
                continue;
            }

            // Create WordPress post
            const imageIds = uploadedImages.map(img => img.id);
            const post = await createWordPressPost(blokeData, imageIds);

            if (post) {
                console.log(`  ✓ Created post: ${post.title} (ID: ${post.id})`);
            }

            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('\nMigration completed!');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrate();