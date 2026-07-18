<?php
/**
 * React SPA entry point — serves /blokes/ or /blokes-dev/.
 * Auto-detects the app slug from the request URI.
 * Requires progreso-extension1-1.php plugin to be active for full role/data support.
 */

ob_start();
require dirname(__DIR__) . '/wp-load.php';
ob_end_clean();

nocache_headers();

// Detect which slug we're serving from the request URI
$_path  = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
$_parts = explode('/', $_path);
$slug   = !empty($_parts[0]) ? $_parts[0] : 'blokes';

// Locate built assets in this same directory
$app_dir = __DIR__ . '/';
$app_url = trailingslashit(home_url($slug));

$css_files = glob($app_dir . 'assets/*.css') ?: [];
$js_files  = glob($app_dir . 'assets/*.js')  ?: [];
$css_url   = $css_files ? $app_url . 'assets/' . basename($css_files[0]) : '';
$js_url    = $js_files  ? $app_url . 'assets/' . basename($js_files[0])  : '';

// Subscription data (club WP, blog 3)
switch_to_blog(3);
$club_nonce   = wp_create_nonce('wp_rest');
$subscription = null;

if (is_user_logged_in() && class_exists('RocoMadrid_SF_Stats')) {
    $me         = get_current_user_id();
    $all        = RocoMadrid_SF_Stats::get_all_subscription_data();
    $active_sub = null;
    $any_sub    = null;

    foreach ($all as $sub) {
        $uid = intval(get_post_meta($sub['id'], '_customer_user', true));
        if (!$uid && !empty($sub['email'])) {
            $u = get_user_by('email', $sub['email']);
            if ($u) $uid = $u->ID;
        }
        if ($uid !== $me) continue;
        $info = [
            'status'  => $sub['status']   ?? 'unknown',
            'name'    => $sub['producto'] ?? '',
            'dia'     => $sub['dia']      ?? '',
            'horario' => $sub['horario']  ?? '',
        ];
        if ($sub['status'] === 'active') { $active_sub = $info; break; }
        if (!$any_sub) $any_sub = $info;
    }

    $found = $active_sub ?? $any_sub;
    if ($found) {
        $found['renewUrl'] = function_exists('wc_get_account_endpoint_url')
            ? wc_get_account_endpoint_url('subscriptions')
            : home_url('/mi-cuenta/');
        $subscription = $found;
    }
}
restore_current_blog();

$user_name = '';
if (is_user_logged_in()) {
    $cu    = wp_get_current_user();
    $first = trim((string) ($cu->first_name ?? ''));
    if ($first) {
        $user_name = $first;
    } else {
        $parts     = explode(' ', trim((string) ($cu->display_name ?? '')));
        $user_name = $parts[0] ?? '';
    }
}

$app_role = function_exists('blokes_get_app_role')
    ? blokes_get_app_role()
    : (is_user_logged_in() ? 'member' : 'guest');

$spa_url   = home_url('/' . $slug . '/');
$site_data = [
    'nonce'           => wp_create_nonce('wp_rest'),
    'clubNonce'       => $club_nonce,
    'isLoggedIn'      => is_user_logged_in(),
    'userId'          => get_current_user_id(),
    'loginUrl'        => wp_login_url($spa_url),
    'logoutUrl'       => wp_logout_url($spa_url),
    'userName'        => $user_name,
    'subscription'    => $subscription,
    'appBasename'     => '/' . $slug,
    'userRole'        => $app_role,
    'canSupervise'    => function_exists('blokes_can_supervise') ? blokes_can_supervise() : false,
    'emailLists'      => (function_exists('blokes_get_email_lists') && in_array($app_role, ['socio', 'superadmin']))
                             ? blokes_get_email_lists() : null,
    'fichajeEmbedUrl' => '',
    'profileComplete' => is_user_logged_in() && function_exists('blokes_is_profile_complete')
                             ? blokes_is_profile_complete(get_current_user_id()) : false,
    'userNickname'    => is_user_logged_in() && function_exists('blokes_get_user_nickname')
                             ? blokes_get_user_nickname(get_current_user_id()) : '',
];

header('Content-Type: text/html; charset=UTF-8');
?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<?php if ($css_url): ?>
<link rel="stylesheet" href="<?php echo esc_url($css_url); ?>">
<?php endif; ?>
<script>window.blokesSiteData = <?php echo wp_json_encode($site_data); ?>;</script>
</head>
<body>
<div id="root"></div>
<?php if ($js_url): ?>
<script type="module" src="<?php echo esc_url($js_url); ?>"></script>
<?php endif; ?>
</body>
</html>
<?php
exit;
