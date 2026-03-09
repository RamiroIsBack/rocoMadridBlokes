# Local Testing Guide

## 1. Start the Development Server

The React app is already running at **http://127.0.0.1:5173** (or **http://localhost:5173**).

## 2. Configure WordPress Connection

You have two options:

### Option A: Use Your Live SiteGround WordPress
1. Open `.env` file in the project root
2. Set `VITE_WORDPRESS_URL=https://your-siteground-domain.com`
3. Make sure your WordPress has:
   - The `wordpress-blokes-extension.php` plugin installed
   - Advanced Custom Fields plugin with the field group configured
   - Application Passwords enabled for API authentication

### Option B: Set Up Local WordPress (for testing without internet)
1. Install XAMPP/WAMP or LocalWP
2. Create a WordPress site
3. Install ACF plugin and import the field group
4. Copy the `wordpress-blokes-extension.php` to `wp-content/plugins/`
5. Activate the plugin
6. Update `.env` with your local WordPress URL

## 3. Test the Application

### Main Page (`/`)
- Shows all blokes with filtering by category
- Each card displays color indicator and interactive icons
- Click icons to test interaction tracking

### Admin Page (`/blokesAdmin`)
- Login with WordPress credentials (Application Password)
- Create new blokes with:
  - Title and description
  - Color selection (green/blue/yellow/red)
  - Image upload to WordPress media library
  - Category selection

### Statistics Page (`/blokesStats`)
- View analytics of all blokes
- Filter by category, color, date range
- See interaction counts for each icon type

## 4. Quick Test Without WordPress

If you just want to see the UI without WordPress connection:
1. Edit `src/hooks/useWordPressPosts.js`
2. Temporarily comment out the fetch call and return mock data
3. The app will display sample cards with all features

## 5. Troubleshooting

- **Connection errors**: Check `.env` file and WordPress REST API
- **Authentication issues**: Verify Application Passwords in WordPress
- **Image upload problems**: Ensure WordPress media library permissions
- **Interaction tracking**: Check browser console for API errors

## 6. Next Steps for Production

1. Deploy the React app to your hosting (SiteGround)
2. Install WordPress plugin on your live site
3. Configure ACF fields as per DEPLOYMENT_GUIDE.md
4. Update environment variables for production
5. Test with real data

The complete system is ready for use. Start with Option A (connecting to your live WordPress) to see the full integration working.