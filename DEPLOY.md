# Blokes Frontend Deployment Guide

## Quick Deploy

### Option 1: Upload via FTP/File Manager (Recommended)

1. **Build the project** (already done):
   ```bash
   npm run build
   ```

2. **Upload to SiteGround**:
   - Go to SiteGround File Manager → public_html
   - Create folder `blokes` if it doesn't exist
   - Upload all files from `dist/` folder to `/blokes/`
   - Make sure to upload `.htaccess` as well

3. **Test**:
   - Public site: `https://rocomadrid.com/blokes/`
   - Setter page: `https://rocomadrid.com/blokes/setter`
   - Stats page: `https://rocomadrid.com/blokes/stats`

### Option 2: Using SiteGround Site Tools

1. **Navigate to**: SiteGround → Site Tools → File Manager
2. **Go to**: public_html → create `blokes` folder
3. **Upload**: Select all files from `dist/` and upload
4. **Set permissions**: 644 for files, 755 for folders

## Files to Upload

From the `dist/` folder:
```
dist/
├── index.html
├── .htaccess
└── assets/
    ├── index-*.js
    └── index-*.css
```

## Important Notes

- The app is pre-configured to connect to: `https://rocomadrid.com`
- WordPress must have the blokes-extension plugin installed
- Routes:
  - `/blokes/` - Main gallery
  - `/blokes/setter` - Add new problems (password: settingforfun)
  - `/blokes/stats` - Statistics (password: settingforfun)

## Troubleshooting

### Images not loading
1. Check WordPress media library has images
2. Verify SiteGround CDN is working
3. Check browser console for errors

### Can't access setter/stats pages
- Password is: `settingforfun`
- Clear browser session or use incognito mode

### WordPress connection issues
- Verify WordPress REST API works: `https://rocomadrid.com/wp-json/wp/v2/posts`
- Check the blokes-extension plugin is active
