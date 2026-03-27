# Blokes Frontend Deployment Guide

## Quick Deploy to Root (public_html)

This version is configured to work in the ROOT of your domain (not in a subfolder).

### Steps:

1. **Build**:
   ```bash
   cd standAloneReactBlokes
   npm install
   npm run build
   ```

2. **Upload to public_html**:
   - Go to SiteGround File Manager → public_html
   - Upload all files from `dist/` folder
   - Include the `.htaccess` file

3. **Test**:
   - Main site: `https://rocomadrid.com/`
   - Setter: `https://rocomadrid.com/setter` (password: settingforfun)
   - Stats: `https://rocomadrid.com/stats` (password: settingforfun)

## Files in dist/:
```
dist/
├── index.html
├── .htaccess
└── assets/
    ├── index-*.js
    └── index-*.css
```

## Configuration

The app is pre-configured to connect to: `https://rocomadrid.com`

### To change the WordPress URL:

Edit `.env`:
```
VITE_WORDPRESS_URL=https://your-wordpress-domain.com
```

Then rebuild with `npm run build` and re-upload.

## Troubleshooting

### Images not loading
- Check WordPress media library has images
- Verify SiteGround CDN is working

### Can't access setter/stats pages
- Password: `settingforfun`
- Use incognito mode to test

### WordPress connection issues
- Verify WordPress REST API: `https://rocomadrid.com/wp-json/wp/v2/posts`
- Check blokes-extension plugin is active
