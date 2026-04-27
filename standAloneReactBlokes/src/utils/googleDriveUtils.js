/**
 * Converts any Google Drive sharing URL to a thumbnail URL usable in <img> tags.
 *
 * Handles these input formats from Google Form file uploads:
 *   - https://drive.google.com/open?id=FILE_ID
 *   - https://drive.google.com/file/d/FILE_ID/view
 *   - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *   - https://drive.google.com/uc?id=FILE_ID
 *   - https://drive.google.com/uc?export=view&id=FILE_ID
 *
 * @param {string} url - Raw Google Drive URL from the spreadsheet cell
 * @param {number} [width=600] - Desired thumbnail width in pixels
 * @returns {string|null} - Usable thumbnail URL, or null if input is invalid
 */
export function getDriveImageUrl(url, width = 600) {
  if (!url || typeof url !== 'string') return null

  const trimmed = url.trim()
  if (!trimmed) return null

  let fileId = null

  // Pattern 1: /file/d/FILE_ID/
  const filePathMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (filePathMatch) {
    fileId = filePathMatch[1]
  }

  // Pattern 2: ?id=FILE_ID or &id=FILE_ID
  if (!fileId) {
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    if (idParamMatch) {
      fileId = idParamMatch[1]
    }
  }

  if (!fileId) return null

  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`
}

/**
 * Maps a raw Google Sheets row array to a normalized card object.
 *
 * Expected column order (A through G):
 *   A (index 0) = Timestamp
 *   B (index 1) = Image 1 URL  (Google Drive link, may be empty)
 *   C (index 2) = Image 2 URL  (optional)
 *   D (index 3) = Image 3 URL  (optional)
 *   E (index 4) = Description  (max 300 characters)
 *   F (index 5) = Title/Name   (max 20 characters)
 *   G (index 6) = Category     (PUZLE | TECNICO | ENTRENAMIENTO | COORDINACION)
 *
 * If your Google Form questions are in a different order, update the
 * destructuring below to match the actual column positions in your sheet.
 *
 * @param {string[]} row - Array of cell values from the Sheets API
 * @param {number} index - Row index used as fallback ID
 * @returns {Object} - Normalized card data
 */
export function parseSheetRow(row, index) {
  const [timestamp, img1, img2, img3, description, title, category] = row

  const images = [img1, img2, img3]
    .map((url) => getDriveImageUrl(url))
    .filter(Boolean)

  return {
    id: `row-${index}`,
    timestamp: timestamp || '',
    images,
    description: (description || '').slice(0, 300),
    title: (title || 'Sin título').slice(0, 35),
    category: (category || '').toUpperCase().trim(),
  }
}
