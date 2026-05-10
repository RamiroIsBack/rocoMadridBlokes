<?php
/**
 * React SPA entry point for /blokes-dev/.
 *
 * Uses wp-load.php (not wp-blog-header.php) to bootstrap WordPress
 * without triggering the query/template system. This way the HTML
 * is generated here directly — no WordPress page or rewrite rule needed.
 *
 * Upload this file as /blokes-dev/index.php on the server.
 */

ob_start();                               // capture any early output from plugins
require dirname(__DIR__) . '/wp-load.php';
ob_end_clean();                           // discard it so our HTML starts clean

nocache_headers();

// Locate built assets in this same directory
$app_dir = __DIR__ . '/';
$app_url = trailingslashit(home_url('blokes-dev'));

$css_files = glob($app_dir . 'assets/*.css') ?: [];
$js_files  = glob($app_dir . 'assets/*.js')  ?: [];
$css_url   = $css_files ? $app_url . 'assets/' . basename($css_files[0]) : '';
$js_url    = $js_files  ? $app_url . 'assets/' . basename($js_files[0])  : '';

// Gather user/subscription data — mirrors the plugin's wp_head hook
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

$spa_url   = home_url('/blokes-dev/');
$site_data = [
    'nonce'        => wp_create_nonce('wp_rest'),
    'clubNonce'    => $club_nonce,
    'isLoggedIn'   => is_user_logged_in(),
    'userId'       => get_current_user_id(),
    'loginUrl'     => wp_login_url($spa_url),
    'logoutUrl'    => wp_logout_url($spa_url),
    'userName'     => $user_name,
    'subscription' => $subscription,
    'appBasename'  => '/blokes-dev',
    'userRole'     => is_super_admin()
                          ? 'superadmin'
                          : (is_user_logged_in() && current_user_can('administrator')
                              ? 'admin'
                              : (is_user_logged_in() ? 'member' : 'guest')),
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
