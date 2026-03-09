#!/usr/bin/env node

/**
 * Test script to verify WordPress REST API connection
 */

import fetch from 'node-fetch';
import {
    config
} from 'dotenv';

config();

const WORDPRESS_URL = process.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com';

async function testWordPressConnection() {
    console.log('Testing WordPress REST API connection...');
    console.log(`URL: ${WORDPRESS_URL}`);

    try {
        // Test 1: Check if WordPress is accessible
        console.log('\n1. Testing basic WordPress accessibility...');
        const wpResponse = await fetch(`${WORDPRESS_URL}/wp-json/`);

        if (!wpResponse.ok) {
            throw new Error(`WordPress not accessible: HTTP ${wpResponse.status}`);
        }

        const wpData = await wpResponse.json();
        console.log(`   ✓ WordPress version: ${wpData?.version || 'Unknown'}`);
        console.log(`   ✓ Site name: ${wpData?.name || 'Unknown'}`);

        // Test 2: Check posts endpoint
        console.log('\n2. Testing posts endpoint...');
        const postsResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=1`);

        if (!postsResponse.ok) {
            console.log(`   ⚠ Posts endpoint error: HTTP ${postsResponse.status}`);
        } else {
            const posts = await postsResponse.json();
            console.log(`   ✓ Posts endpoint working (${posts.length} posts found)`);
        }

        // Test 3: Check categories
        console.log('\n3. Testing categories endpoint...');
        const categoriesResponse = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/categories`);

        if (!categoriesResponse.ok) {
            console.log(`   ⚠ Categories endpoint error: HTTP ${categoriesResponse.status}`);
        } else {
            const categories = await categoriesResponse.json();
            console.log(`   ✓ Categories endpoint working (${categories.length} categories found)`);

            // List categories
            categories.forEach(cat => {
                console.log(`     - ${cat.name} (ID: ${cat.id})`);
            });
        }

        // Test 4: Check ACF if available
        console.log('\n4. Testing ACF endpoint...');
        const acfResponse = await fetch(`${WORDPRESS_URL}/wp-json/acf/v3/`);

        if (!acfResponse.ok) {
            console.log(`   ⚠ ACF plugin may not be installed or activated`);
        } else {
            console.log(`   ✓ ACF plugin detected`);
        }

        console.log('\n✅ WordPress connection test completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Install Advanced Custom Fields plugin');
        console.log('2. Create categories: PUZLE, TECNICO, ENTRENAMIENTO, COORDINACION');
        console.log('3. Create ACF field group for posts');
        console.log('4. Update category IDs in useWordPressPosts.js');

    } catch (error) {
        console.error('\n❌ WordPress connection test failed:');
        console.error(error.message);
        process.exit(1);
    }
}

// Run test
testWordPressConnection();