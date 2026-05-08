<?php
/**
 * Plugin Name: Progreso and Blokes Extension
 * Plugin URI:  https://rocomadrid.com
 * Description: Blokes REST API + Progreso community stats for Rocoteca Madrid. Replaces Blokes Extension v1.5.0 — activate this, deactivate the other.
 * Version:     1.1.0
 * Author:      Rocoteca Madrid
 * License:     GPL v2 or later
 *
 * HOW TO DEPLOY:
 *   1. Upload this file to /wp-content/plugins/
 *   2. In WP Admin → Plugins: activate "Rocoteca Extension"
 *   3. Deactivate "Blokes Extension" (the old file stays as backup, just inactive)
 *   Never run both plugins simultaneously — they register the same routes and functions.
 */

if (!defined('ABSPATH')) exit;

// ============================================================
//  SPA hosting — serves React app for registered slugs
// ============================================================

// Add slugs here to enable WordPress hosting for that path.
// When ready for production, add 'blokes' to this array.
$GLOBALS['blokes_app_slugs'] = ['blokes-dev'];

add_action('init', function() {
    foreach ($GLOBALS['blokes_app_slugs'] as $slug) {
        add_rewrite_rule("^{$slug}/(.*)$", "index.php?pagename={$slug}", 'top');
    }
});

add_filter('show_admin_bar', function($show) {
    if (is_page($GLOBALS['blokes_app_slugs'])) return false;
    return $show;
});

add_action('template_redirect', function() {
    if (!is_page($GLOBALS['blokes_app_slugs'])) return;

    $slug    = get_post_field('post_name', get_queried_object_id());
    $app_dir = trailingslashit(ABSPATH) . $slug . '/';
    $app_url = trailingslashit(home_url($slug));

    $css_files = glob($app_dir . 'assets/*.css');
    $js_files  = glob($app_dir . 'assets/*.js');
    $css_url   = $css_files ? $app_url . 'assets/' . basename($css_files[0]) : '';
    $js_url    = $js_files  ? $app_url . 'assets/' . basename($js_files[0])  : '';

    header('Content-Type: text/html; charset=UTF-8');
    ?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<?php if ($css_url): ?>
<link rel="stylesheet" href="<?php echo esc_url($css_url); ?>">
<?php endif; ?>
<?php wp_head(); ?>
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
});

// ============================================================
//  REST API — inject extra fields into blokes responses
// ============================================================

add_filter('rest_prepare_blokes', function($response, $post, $request) {
    $data = $response->get_data();
    $data['bloke_colorPresa']      = get_post_meta($post->ID, 'bloke_colorPresa', true);
    $data['bloke_completion_count'] = (int) get_post_meta($post->ID, '_bloke_completion_count', true);
    $response->set_data($data);
    return $response;
}, 10, 3);

// Inject auth data for the React SPA
add_action('wp_head', function() {
    switch_to_blog(3);
    $club_nonce = wp_create_nonce('wp_rest');

    // Fetch subscription info while on the club subsite
    $subscription = null;
    if (is_user_logged_in() && class_exists('RocoMadrid_SF_Stats')) {
        $me  = get_current_user_id();
        $all = RocoMadrid_SF_Stats::get_all_subscription_data();
        $active_sub = null;
        $any_sub    = null;
        foreach ($all as $sub) {
            $uid = intval(get_post_meta($sub['id'], '_customer_user', true));
            if (!$uid && !empty($sub['email'])) {
                $u = get_user_by('email', $sub['email']); if ($u) $uid = $u->ID;
            }
            if ($uid !== $me) continue;
            $info = array('status' => $sub['status'] ?? 'unknown', 'name' => $sub['producto'] ?? '');
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
        $cu = wp_get_current_user();
        $first = trim((string) ($cu->first_name ?? ''));
        if ($first) {
            $user_name = $first;
        } else {
            $parts = explode(' ', trim((string) ($cu->display_name ?? '')));
            $user_name = $parts[0] ?? '';
        }
    }
    $spa_url = home_url('/blokes/');
    $data = array(
        'nonce'        => wp_create_nonce('wp_rest'),
        'clubNonce'    => $club_nonce,
        'isLoggedIn'   => is_user_logged_in(),
        'userId'       => get_current_user_id(),
        'loginUrl'     => wp_login_url($spa_url),
        'logoutUrl'    => wp_logout_url($spa_url),
        'userName'     => $user_name,
        'subscription' => $subscription,
    );
    echo '<script>window.blokesSiteData = ' . wp_json_encode($data) . ';</script>' . "\n";
});

// After login: honour explicit redirect_to; non-admins always go to the SPA
add_filter('login_redirect', function($redirect_to, $requested, $user) {
    if (is_wp_error($user)) return $redirect_to;
    if (!empty($requested)) return $requested;
    if (!user_can($user, 'manage_options')) return home_url('/blokes/');
    return $redirect_to;
}, 10, 3);

// After logout: always return to the SPA, never to wp-login.php?loggedout=true
add_filter('logout_redirect', function($redirect_to, $requested_redirect_to, $user) {
    if (!empty($requested_redirect_to)) return $requested_redirect_to;
    return home_url('/blokes/');
}, 10, 3);

// Allow redirecting back to the blokes frontend domains after login
add_filter('allowed_redirect_hosts', function($hosts) {
    $hosts[] = 'blokes.ramirosantamaria.com';
    $hosts[] = '127.0.0.1';
    return $hosts;
});

// ============================================================
//  REST routes — blokes/v1  (unchanged from v1.5.1)
// ============================================================

add_action('rest_api_init', function() {

    register_rest_route('blokes/v1', '/interact/(?P<id>\d+)', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_record_interaction',
        'permission_callback' => '__return_true',
        'args' => array(
            'type' => array(
                'required'          => true,
                'validate_callback' => function($param) {
                    return in_array($param, ['star_1', 'star_2', 'star_3', 'skull']);
                }
            )
        )
    ));

    register_rest_route('blokes/v1', '/all', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_get_all',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('blokes/v1', '/create', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_create_with_acf',
        'permission_callback' => function() { return is_user_logged_in(); },
    ));

    register_rest_route('blokes/v1', '/update-acf/(?P<id>\d+)', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_update_acf',
        'permission_callback' => function() { return is_user_logged_in(); },
    ));

    register_rest_route('blokes/v1', '/hall-of-fame', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'blokes_get_hall_of_fame',
            'permission_callback' => '__return_true',
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'blokes_save_hall_of_fame',
            'permission_callback' => function() { return is_user_logged_in(); },
        ),
    ));

    register_rest_route('blokes/v1', '/my-completions', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_get_my_completions',
        'permission_callback' => function() { return is_user_logged_in(); },
    ));

    register_rest_route('blokes/v1', '/rate/(?P<id>\d+)', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_rate_bloke',
        'permission_callback' => '__return_true',
        'args' => array(
            'type' => array(
                'required'          => true,
                'validate_callback' => function($param) {
                    return in_array($param, ['star_1', 'star_2', 'star_3', 'skull']);
                }
            ),
            'previousType' => array(
                'required' => false,
                'default'  => null,
            ),
        )
    ));

    register_rest_route('blokes/v1', '/completions/(?P<id>\d+)/toggle', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_toggle_completion',
        'permission_callback' => function() { return is_user_logged_in(); },
    ));

    register_rest_route('blokes/v1', '/delete/(?P<id>\d+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'blokes_delete_with_media',
        'permission_callback' => function() { return is_user_logged_in(); },
    ));

    // ── Progreso/v1 — community stats (new namespace, public) ────────────────

    // Returns community completion totals grouped by color.
    // Used by ProgresoPage "Blokes más encadenados" section.
    register_rest_route('progreso/v1', '/stats/completions-by-color', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_completions_by_color',
        'permission_callback' => '__return_true',
    ));

    // ── Progreso/v1 — entrenamientos (admin, requires manage_options) ────────
    register_rest_route('progreso/v1', '/alumnos', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_alumnos',
        'permission_callback' => function() {
            return is_user_logged_in() && current_user_can('manage_options');
        },
        'args' => array(
            'dia'        => array('required' => false),
            'horario'    => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'edad'       => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'frecuencia' => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'turno'      => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'status'     => array('required' => false, 'default' => 'active', 'sanitize_callback' => 'sanitize_text_field'),
        ),
    ));

    register_rest_route('progreso/v1', '/clases', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_clases',
        'permission_callback' => function() {
            return is_user_logged_in() && current_user_can('manage_options');
        },
    ));

    // ── Training log ─────────────────────────────────────────────────────────
    register_rest_route('progreso/v1', '/training', array(
        'methods'             => 'POST',
        'callback'            => 'progreso_log_training',
        'permission_callback' => function() {
            return is_user_logged_in() && current_user_can('manage_options');
        },
        'args' => array(
            'user_id'  => array('required' => true,  'type' => 'integer'),
            'test_id'  => array('required' => true,  'type' => 'integer'),
            'value_kg' => array('required' => true,  'type' => 'number'),
        ),
    ));

    register_rest_route('progreso/v1', '/training/summary', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_training_summary',
        'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('progreso/v1', '/training/(?P<user_id>\d+)', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_training',
        'permission_callback' => function($request) {
            if (!is_user_logged_in()) return false;
            return current_user_can('manage_options') ||
                   get_current_user_id() === intval($request['user_id']);
        },
    ));

    register_rest_route('progreso/v1', '/training/entry/(?P<id>\d+)', array(
        'methods'             => 'PUT',
        'callback'            => 'progreso_update_training',
        'permission_callback' => function() {
            return is_user_logged_in() && current_user_can('manage_options');
        },
        'args' => array(
            'value_kg' => array('required' => true, 'type' => 'number'),
        ),
    ));

    register_rest_route('progreso/v1', '/training/class-progress', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_class_progress',
        'permission_callback' => 'is_user_logged_in',
    ));
});

// ============================================================
//  blokes/v1 callbacks  (identical to v1.5.1 local)
// ============================================================

function blokes_record_interaction($request) {
    $post_id = intval($request['id']);
    $type    = sanitize_text_field($request['type']);

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    $interactions = get_field('bloke_interactions', $post_id);
    if (!is_array($interactions)) {
        $interactions = array('star_1' => 0, 'star_2' => 0, 'star_3' => 0, 'skull' => 0);
    }

    $interactions[$type] = isset($interactions[$type]) ? intval($interactions[$type]) + 1 : 1;
    update_field('bloke_interactions', $interactions, $post_id);

    return array(
        'success'      => true,
        'post_id'      => $post_id,
        'type'         => $type,
        'interactions' => $interactions,
    );
}

function blokes_get_all($request) {
    $query = new WP_Query(array(
        'post_type'      => 'blokes',
        'posts_per_page' => -1,
        'post_status'    => 'publish',
    ));
    $blokes = array();
    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id  = get_the_ID();
            $blokes[] = array(
                'id'      => $post_id,
                'title'   => get_the_title(),
                'content' => get_the_content(),
                'acf'     => get_fields($post_id),
            );
        }
        wp_reset_postdata();
    }
    return $blokes;
}

function blokes_create_with_acf($request) {
    $title          = sanitize_text_field($request->get_param('title'));
    $content        = sanitize_textarea_field($request->get_param('content'));
    $category_id    = intval($request->get_param('category_id'));
    $featured_media = intval($request->get_param('featured_media'));
    $acf_fields     = $request->get_param('acf');

    $post_id = wp_insert_post(array(
        'post_type'     => 'blokes',
        'post_title'    => $title,
        'post_content'  => $content,
        'post_status'   => 'publish',
        'post_category' => $category_id ? array($category_id) : array(),
    ));

    if (is_wp_error($post_id)) return $post_id;

    if ($featured_media) set_post_thumbnail($post_id, $featured_media);

    if (is_array($acf_fields)) {
        foreach ($acf_fields as $field_name => $field_value) {
            update_field($field_name, $field_value, $post_id);
        }
        if (isset($acf_fields['bloke_colorPresa'])) {
            update_post_meta($post_id, 'bloke_colorPresa', sanitize_text_field($acf_fields['bloke_colorPresa']));
        }
    }

    return array('success' => true, 'post_id' => $post_id, 'title' => $title);
}

function blokes_update_acf($request) {
    $post_id        = intval($request['id']);
    $acf_fields     = $request->get_param('acf');
    $title          = $request->get_param('title');
    $featured_media = $request->get_param('featured_media');

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    if ($title !== null && $title !== '') {
        wp_update_post(array('ID' => $post_id, 'post_title' => sanitize_text_field($title)));
    }

    if ($featured_media !== null) {
        $media_id = intval($featured_media);
        $media_id > 0 ? set_post_thumbnail($post_id, $media_id) : delete_post_thumbnail($post_id);
    }

    if (is_array($acf_fields)) {
        foreach ($acf_fields as $field_name => $field_value) {
            update_field($field_name, $field_value, $post_id);
        }
        if (isset($acf_fields['bloke_colorPresa'])) {
            update_post_meta($post_id, 'bloke_colorPresa', sanitize_text_field($acf_fields['bloke_colorPresa']));
        }
    }

    return array('success' => true, 'post_id' => $post_id, 'acf' => get_fields($post_id));
}

function blokes_get_hall_of_fame($request) {
    $data = get_option('blokes_hall_of_fame', array());
    return is_array($data) ? $data : array();
}

function blokes_save_hall_of_fame($request) {
    $blokes = $request->get_param('blokes');
    if (!is_array($blokes)) {
        return new WP_Error('invalid_data', 'blokes must be an array', array('status' => 400));
    }
    $clean = array();
    foreach (array_slice($blokes, 0, 10) as $b) {
        if (!is_array($b)) continue;
        $clean[] = array(
            'postId'            => intval($b['postId'] ?? 0),
            'title'             => sanitize_text_field($b['title'] ?? ''),
            'color'             => sanitize_text_field($b['color'] ?? ''),
            'sala'              => sanitize_text_field($b['sala'] ?? ''),
            'equipador'         => sanitize_text_field($b['equipador'] ?? ''),
            'totalInteractions' => intval($b['totalInteractions'] ?? 0),
            'timestamp'         => sanitize_text_field($b['timestamp'] ?? ''),
        );
    }
    update_option('blokes_hall_of_fame', $clean, false);
    return array('success' => true, 'count' => count($clean));
}

function blokes_get_my_completions($request) {
    $user_id    = get_current_user_id();
    $saved      = get_user_meta($user_id, '_blokes_completed', true);
    $my_ids     = is_array($saved) ? array_values(array_map('intval', $saved)) : array();
    $log        = get_user_meta($user_id, '_blokes_completion_log', true);
    if (!is_array($log)) $log = array();
    $my_ratings = get_user_meta($user_id, '_blokes_my_ratings', true);
    if (!is_array($my_ratings)) $my_ratings = array();
    $rating_log = get_user_meta($user_id, '_blokes_rating_log', true);
    if (!is_array($rating_log)) $rating_log = array();
    return array(
        'myIds'     => $my_ids,
        'log'       => $log,
        'myRatings' => $my_ratings,
        'ratingLog' => $rating_log,
        'nonce'     => wp_create_nonce('wp_rest'),
    );
}

function blokes_toggle_completion($request) {
    $post_id = intval($request['id']);
    $user_id = get_current_user_id();

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    $saved         = get_user_meta($user_id, '_blokes_completed', true);
    $completed_ids = is_array($saved) ? array_map('intval', $saved) : array();
    $log           = get_user_meta($user_id, '_blokes_completion_log', true);
    if (!is_array($log)) $log = array();

    if (in_array($post_id, $completed_ids)) {
        $completed_ids = array_values(array_diff($completed_ids, array($post_id)));
        $log           = array_values(array_filter($log, function($e) use ($post_id) {
            return intval($e['postId']) !== $post_id;
        }));
        $completed = false;
        $count     = max(0, (int) get_post_meta($post_id, '_bloke_completion_count', true) - 1);
    } else {
        $completed_ids[] = $post_id;
        $color = sanitize_text_field(get_field('bloke_color', $post_id) ?: 'green');
        $sala  = sanitize_text_field(get_field('bloke_sala',  $post_id) ?: 'entrada');
        $log[] = array(
            'postId'    => $post_id,
            'color'     => $color,
            'sala'      => $sala,
            'timestamp' => current_time('c'),
        );
        $completed = true;
        $count     = (int) get_post_meta($post_id, '_bloke_completion_count', true) + 1;
    }

    update_user_meta($user_id, '_blokes_completed', $completed_ids);
    update_user_meta($user_id, '_blokes_completion_log', $log);
    update_post_meta($post_id, '_bloke_completion_count', $count);

    return array('completed' => $completed, 'count' => $count);
}

function blokes_rate_bloke($request) {
    $post_id  = intval($request['id']);
    $type     = sanitize_text_field($request->get_param('type'));
    $previous = sanitize_text_field($request->get_param('previousType') ?: '');

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    $interactions = get_field('bloke_interactions', $post_id);
    if (!is_array($interactions)) {
        $interactions = array('star_1' => 0, 'star_2' => 0, 'star_3' => 0, 'skull' => 0);
    }

    if ($previous && $previous !== $type && isset($interactions[$previous])) {
        $interactions[$previous] = max(0, intval($interactions[$previous]) - 1);
    }
    $interactions[$type] = intval($interactions[$type] ?? 0) + 1;
    $new_rating = $type;

    update_field('bloke_interactions', $interactions, $post_id);

    if (is_user_logged_in()) {
        $user_id    = get_current_user_id();
        $my_ratings = get_user_meta($user_id, '_blokes_my_ratings', true);
        if (!is_array($my_ratings)) $my_ratings = array();
        $rating_log = get_user_meta($user_id, '_blokes_rating_log', true);
        if (!is_array($rating_log)) $rating_log = array();

        $key        = strval($post_id);
        $rating_log = array_values(array_filter($rating_log, function($e) use ($post_id) {
            return intval($e['postId']) !== $post_id;
        }));
        $my_ratings[$key] = $new_rating;
        $rating_log[] = array(
            'postId'    => $post_id,
            'type'      => $new_rating,
            'timestamp' => current_time('c'),
        );

        update_user_meta($user_id, '_blokes_my_ratings', $my_ratings);
        update_user_meta($user_id, '_blokes_rating_log', $rating_log);
    }

    return array('rating' => $new_rating, 'interactions' => $interactions);
}

function blokes_delete_with_media($request) {
    $post_id = intval($request['id']);

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    $deleted_media = array();

    $featured_media_id = get_post_thumbnail_id($post_id);
    if ($featured_media_id) {
        $deleted_media[] = $featured_media_id;
        wp_delete_attachment($featured_media_id, true);
    }

    $gallery = get_field('bloke_gallery', $post_id);
    if (is_array($gallery)) {
        foreach ($gallery as $attachment_id) {
            if (is_numeric($attachment_id)) {
                $deleted_media[] = $attachment_id;
                wp_delete_attachment($attachment_id, true);
            }
        }
    }

    $deleted = wp_delete_post($post_id, true);
    if ($deleted) {
        return array(
            'success'       => true,
            'post_id'       => $post_id,
            'deleted_media' => $deleted_media,
            'message'       => 'Bloke and associated media deleted successfully',
        );
    }
    return new WP_Error('delete_failed', 'Failed to delete bloke', array('status' => 500));
}

// ============================================================
//  progreso/v1 callbacks  (new)
// ============================================================

/**
 * Calls RocoMadrid_SF_Stats::get_all_subscription_data() directly.
 * Only works when called on the club subsite (blog_id=3) where the class is loaded.
 */
function progreso_frecuencia_to_producto($frecuencia) {
    if ($frecuencia === 'single')  return 'Single Days';
    if ($frecuencia === 'classes') return 'Classes';
    return '';
}

function progreso_get_alumnos($request) {
    if (!class_exists('RocoMadrid_SF_Stats')) {
        return new WP_Error('class_not_found', 'RocoMadrid_SF_Stats not available. Call this endpoint on the club subsite.', array('status' => 503));
    }

    $dia        = $request->get_param('dia');
    $frecuencia = $request->get_param('frecuencia') ?: '';
    $filtros = array(
        'dia'      => is_array($dia) ? $dia : ($dia ? array($dia) : array()),
        'horario'  => $request->get_param('horario') ?: '',
        'edad'     => $request->get_param('edad') ?: '',
        'producto' => progreso_frecuencia_to_producto($frecuencia),
        'turno'    => $request->get_param('turno') ?: '',
        'status'   => $request->get_param('status') ?: 'active',
    );

    $all_data = RocoMadrid_SF_Stats::get_all_subscription_data();

    $filtered = array_values(array_filter($all_data, function($sub) use ($filtros) {
        if ($filtros['status'] !== 'all' && $sub['status'] !== $filtros['status']) return false;
        if (!empty($filtros['dia']) && !in_array($sub['dia'], $filtros['dia'])) return false;
        if ($filtros['horario']  && $sub['horario']  !== $filtros['horario'])  return false;
        if ($filtros['edad']     && $sub['edad']     !== $filtros['edad'])     return false;
        if ($filtros['producto'] && $sub['producto'] !== $filtros['producto']) return false;
        if ($filtros['turno']    && $sub['turno']    !== $filtros['turno'])    return false;
        return true;
    }));

    // Enrich each alumno with frecuencia and user_id
    $filtered = array_map(function($sub) {
        $sub['frecuencia'] = ($sub['producto'] === 'Single Days') ? 'single'
                           : (($sub['producto'] === 'Classes')    ? 'classes' : '');
        // Try _customer_user meta first (standard WooCommerce Subscriptions)
        $uid = intval(get_post_meta($sub['id'], '_customer_user', true));
        // Fallback: look up WP user by billing email
        if ($uid === 0 && !empty($sub['email'])) {
            $wp_user = get_user_by('email', $sub['email']);
            if ($wp_user) $uid = $wp_user->ID;
        }
        $sub['user_id'] = $uid;
        return $sub;
    }, $filtered);

    return rest_ensure_response(array(
        'success' => true,
        'data'    => array(
            'alumnos' => $filtered,
            'total'   => count($filtered),
        ),
    ));
}

function progreso_get_clases($request) {
    if (!class_exists('RocoMadrid_Step_Form') || !function_exists('wc_get_product')) {
        return new WP_Error('not_available', 'WooCommerce or RocoMadrid not available.', array('status' => 503));
    }

    $afternoon_hour = class_exists('RocoMadrid_SF_Settings')
        ? intval(RocoMadrid_SF_Settings::get_afternoon_hour())
        : 16;

    $product_single_id  = RocoMadrid_Step_Form::product_dias_sueltos_id();
    $product_classes_id = RocoMadrid_Step_Form::product_tarifas_id();

    // Build subscriber counts per class (dia|horario|edad) from active subscriptions
    $sub_counts = array();
    if (class_exists('RocoMadrid_SF_Stats')) {
        foreach (RocoMadrid_SF_Stats::get_all_subscription_data() as $sub) {
            if ($sub['status'] !== 'active') continue;
            $key = $sub['dia'] . '|' . $sub['horario'] . '|' . ($sub['edad'] ?: 'Adultos');
            $sub_counts[$key] = isset($sub_counts[$key]) ? $sub_counts[$key] + 1 : 1;
        }
    }

    $orden_dias = array('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Lunes-Miércoles','Martes-Jueves');
    $sort_by_day = function($a, $b) use ($orden_dias) {
        $pa = array_search($a, $orden_dias); $pb = array_search($b, $orden_dias);
        return (($pa === false ? 999 : $pa) - ($pb === false ? 999 : $pb));
    };

    $clases       = array();
    $dias_single  = array();
    $dias_classes = array();
    $horarios     = array();
    $edades       = array();

    $types = array(
        'single'  => array('product_id' => $product_single_id,  'taxonomy' => 'pa_dia-suelto'),
        'classes' => array('product_id' => $product_classes_id, 'taxonomy' => 'pa_dias'),
    );

    foreach ($types as $tipo => $cfg) {
        $product = wc_get_product($cfg['product_id']);
        if (!$product) continue;

        foreach ($product->get_children() as $vid) {
            $variation = wc_get_product($vid);
            if (!$variation) continue;

            $attrs = $variation->get_attributes();

            // Resolve term display names from slugs
            $dia_slug     = isset($attrs[$cfg['taxonomy']]) ? $attrs[$cfg['taxonomy']] : '';
            $horario_slug = isset($attrs['pa_horario'])     ? $attrs['pa_horario']     : '';
            $edad_slug    = isset($attrs['pa_edad'])        ? $attrs['pa_edad']        : '';

            $dia_term     = $dia_slug     ? get_term_by('slug', $dia_slug,     $cfg['taxonomy']) : null;
            $horario_term = $horario_slug ? get_term_by('slug', $horario_slug, 'pa_horario')     : null;
            $edad_term    = $edad_slug    ? get_term_by('slug', $edad_slug,    'pa_edad')        : null;

            $dia     = $dia_term     ? $dia_term->name     : ucfirst($dia_slug);
            $horario = $horario_term ? $horario_term->name : $horario_slug;
            $edad    = $edad_term    ? $edad_term->name    : ($edad_slug ? ucfirst($edad_slug) : 'Adultos');

            $hora  = intval(substr($horario, 0, 2));
            $turno = ($hora < $afternoon_hour) ? 'Morning' : 'Afternoon';

            $key     = $dia . '|' . $horario . '|' . $edad;
            $alumnos = isset($sub_counts[$key]) ? $sub_counts[$key] : 0;

            $clases[] = array(
                'id'           => $vid,
                'tipo'         => $tipo,
                'dia'          => $dia,
                'horario'      => $horario,
                'turno'        => $turno,
                'edad'         => $edad,
                'precio'       => floatval($variation->get_regular_price()),
                'stock'        => $variation->get_stock_quantity(),
                'stock_status' => $variation->get_stock_status(),
                'sku'          => $variation->get_sku(),
                'status'       => $variation->get_status(),
                'alumnos'      => $alumnos,
            );

            if ($dia) {
                if ($tipo === 'single'  && !in_array($dia, $dias_single))  $dias_single[]  = $dia;
                if ($tipo === 'classes' && !in_array($dia, $dias_classes)) $dias_classes[] = $dia;
            }
            if ($horario && !in_array($horario, $horarios)) $horarios[] = $horario;
            if ($edad    && !in_array($edad,    $edades))   $edades[]   = $edad;
        }
    }

    usort($dias_single,  $sort_by_day);
    usort($dias_classes, $sort_by_day);
    sort($horarios);
    sort($edades);

    return rest_ensure_response(array(
        'success' => true,
        'data'    => array(
            'clases'  => $clases,
            'options' => array(
                'dias_single'  => $dias_single,
                'dias_classes' => $dias_classes,
                'horarios'     => $horarios,
                'edades'       => $edades,
            ),
        ),
    ));
}

// ============================================================
//  Training log helpers + callbacks
// ============================================================

function progreso_training_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_training_log';
}

function progreso_ensure_training_table() {
    global $wpdb;
    $table = progreso_training_table();
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table) return;
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id        bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id   bigint(20) UNSIGNED NOT NULL,
        test_id   tinyint(2)          NOT NULL,
        value_kg  decimal(6,2)        NOT NULL,
        logged_at datetime            NOT NULL,
        logged_by bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        KEY user_test (user_id, test_id),
        KEY logged_at (logged_at)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
}

function progreso_log_training($request) {
    global $wpdb;
    progreso_ensure_training_table();
    $user_id  = intval($request->get_param('user_id'));
    $test_id  = intval($request->get_param('test_id'));
    $value_kg = floatval($request->get_param('value_kg'));
    if ($user_id <= 0 || $test_id < 1 || $test_id > 6 || $value_kg <= 0) {
        return new WP_Error('invalid_data',
            "Datos inválidos. user_id={$user_id} test_id={$test_id} value_kg={$value_kg}",
            array('status' => 400));
    }
    $ok = $wpdb->insert(progreso_training_table(), array(
        'user_id'   => $user_id,
        'test_id'   => $test_id,
        'value_kg'  => $value_kg,
        'logged_at' => current_time('mysql'),
        'logged_by' => get_current_user_id(),
    ), array('%d', '%d', '%f', '%s', '%d'));
    if (!$ok) return new WP_Error('db_error', 'Error al guardar.', array('status' => 500));
    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id));
}

function progreso_get_training($request) {
    global $wpdb;
    progreso_ensure_training_table();
    $user_id = intval($request['user_id']);
    $rows    = $wpdb->get_results($wpdb->prepare(
        'SELECT id, test_id, value_kg, logged_at FROM ' . progreso_training_table() .
        ' WHERE user_id = %d ORDER BY test_id ASC, logged_at ASC',
        $user_id
    ), ARRAY_A);
    $by_test = array();
    foreach ($rows as $row) {
        $tid = intval($row['test_id']);
        $by_test[$tid][] = array(
            'id'        => intval($row['id']),
            'value_kg'  => floatval($row['value_kg']),
            'logged_at' => $row['logged_at'],
        );
    }
    return rest_ensure_response(array('success' => true, 'data' => array('user_id' => $user_id, 'tests' => $by_test)));
}

function progreso_update_training($request) {
    global $wpdb;
    progreso_ensure_training_table();
    $entry_id = intval($request['id']);
    $value_kg = floatval($request->get_param('value_kg'));

    if ($value_kg <= 0) {
        return new WP_Error('invalid_data', 'Valor inválido.', array('status' => 400));
    }

    // Only allow editing entries from the current month
    $row = $wpdb->get_row($wpdb->prepare(
        'SELECT id, logged_at FROM ' . progreso_training_table() . ' WHERE id = %d',
        $entry_id
    ), ARRAY_A);

    if (!$row) {
        return new WP_Error('not_found', 'Entrada no encontrada.', array('status' => 404));
    }

    $entry_month   = substr($row['logged_at'], 0, 7); // "YYYY-MM"
    $current_month = current_time('Y-m');
    if ($entry_month !== $current_month) {
        return new WP_Error('locked', 'Solo se pueden editar entradas del mes actual.', array('status' => 403));
    }

    $wpdb->update(
        progreso_training_table(),
        array('value_kg' => $value_kg),
        array('id' => $entry_id),
        array('%f'),
        array('%d')
    );

    return rest_ensure_response(array('success' => true, 'id' => $entry_id, 'value_kg' => $value_kg));
}

function progreso_training_summary() {
    global $wpdb;
    progreso_ensure_training_table();
    $since = date('Y-m-d', strtotime('-12 months'));
    $rows  = $wpdb->get_results($wpdb->prepare(
        "SELECT test_id,
                DATE_FORMAT(logged_at, '%%Y-%%m') AS month,
                AVG(value_kg)                     AS avg_kg,
                COUNT(DISTINCT user_id)            AS user_count
         FROM " . progreso_training_table() . "
         WHERE logged_at >= %s
         GROUP BY test_id, month
         ORDER BY test_id ASC, month ASC",
        $since
    ), ARRAY_A);
    $by_test = array();
    foreach ($rows as $row) {
        $tid = intval($row['test_id']);
        $by_test[$tid][$row['month']] = array(
            'avg_kg'     => round(floatval($row['avg_kg']), 2),
            'user_count' => intval($row['user_count']),
        );
    }
    return rest_ensure_response(array('success' => true, 'data' => array('tests' => $by_test)));
}

/**
 * Returns total community completions grouped by bloke color.
 * Reads _bloke_completion_count post meta (updated by toggle endpoint).
 */
function progreso_completions_by_color() {
    $post_ids = get_posts(array(
        'post_type'      => 'blokes',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'fields'         => 'ids',
    ));

    $by_color = array();
    foreach ($post_ids as $id) {
        $color = sanitize_text_field(get_field('bloke_color', $id) ?: 'green');
        $count = (int) get_post_meta($id, '_bloke_completion_count', true);
        $by_color[$color] = ($by_color[$color] ?? 0) + $count;
    }

    return rest_ensure_response($by_color);
}

function progreso_get_class_progress() {
    global $wpdb;
    $me = get_current_user_id();
    if (!$me || !class_exists('RocoMadrid_SF_Stats')) {
        return rest_ensure_response(array('data' => array('class' => null, 'members' => array())));
    }

    $all = RocoMadrid_SF_Stats::get_all_subscription_data();

    // Find my active subscription to determine my class
    $my_class = null;
    foreach ($all as $sub) {
        if ($sub['status'] !== 'active') continue;
        $uid = intval(get_post_meta($sub['id'], '_customer_user', true));
        if (!$uid && !empty($sub['email'])) {
            $u = get_user_by('email', $sub['email']); if ($u) $uid = $u->ID;
        }
        if ($uid === $me) { $my_class = $sub; break; }
    }

    if (!$my_class || empty($my_class['dia']) || empty($my_class['horario'])) {
        return rest_ensure_response(array('data' => array('class' => null, 'members' => array())));
    }

    $dia = $my_class['dia']; $horario = $my_class['horario'];
    $my_days = array_map('trim', explode('-', $dia));

    // Two students share a class when their horario matches and at least one day overlaps
    // e.g. "Lunes" and "Lunes-Miércoles" at the same time are in the same class
    $uid_to_name = array();
    foreach ($all as $sub) {
        if ($sub['status'] !== 'active') continue;
        if ($sub['horario'] !== $horario) continue;
        $sub_days = array_map('trim', explode('-', $sub['dia'] ?? ''));
        if (empty(array_intersect($my_days, $sub_days))) continue;
        $uid = intval(get_post_meta($sub['id'], '_customer_user', true));
        if (!$uid && !empty($sub['email'])) {
            $u = get_user_by('email', $sub['email']); if ($u) $uid = $u->ID;
        }
        if ($uid > 0 && !isset($uid_to_name[$uid])) {
            $u = get_user_by('id', $uid);
            if ($u) {
                $first = trim((string) ($u->first_name ?? ''));
                $last  = trim((string) ($u->last_name  ?? ''));
                $full  = trim("$first $last");
                $name  = $full ?: trim((string) ($u->display_name ?? '')) ?: trim($sub['cliente'] ?? '') ?: 'Compañero';
            } else {
                $name = trim($sub['cliente'] ?? '') ?: 'Compañero';
            }
            $uid_to_name[$uid] = $name;
        }
    }

    if (empty($uid_to_name)) {
        return rest_ensure_response(array('data' => array(
            'class'   => array('dia' => $dia, 'horario' => $horario),
            'members' => array(),
        )));
    }

    progreso_ensure_training_table();
    $table = progreso_training_table();
    $uids  = array_keys($uid_to_name);
    $ph    = implode(',', array_fill(0, count($uids), '%d'));

    $rows = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT user_id, test_id, value_kg, logged_at FROM {$table} WHERE user_id IN ({$ph}) ORDER BY user_id, test_id, logged_at ASC",
            ...$uids
        ),
        ARRAY_A
    );

    $by_user = array();
    foreach ($rows as $row) {
        $uid = intval($row['user_id']); $tid = intval($row['test_id']);
        $by_user[$uid][$tid][] = array('v' => floatval($row['value_kg']), 'm' => substr($row['logged_at'], 0, 7));
    }

    $members = array();
    foreach ($uid_to_name as $uid => $name) {
        $tests = array();
        foreach ($by_user[$uid] ?? array() as $tid => $entries) {
            $baseline = $entries[0]['v']; $latest = $entries[count($entries) - 1]['v'];
            $pct = $baseline > 0 ? (($latest - $baseline) / $baseline) * 100 : 0;
            $months = count(array_unique(array_column($entries, 'm')));
            $tests[$tid] = array('pct' => round($pct, 1), 'months' => $months);
        }
        $bloke_log = get_user_meta($uid, '_blokes_completion_log', true);
        if (!is_array($bloke_log)) $bloke_log = array();
        $bloke_by_color = array();
        foreach ($bloke_log as $entry) {
            $color = sanitize_text_field($entry['color'] ?? 'green');
            $bloke_by_color[$color] = ($bloke_by_color[$color] ?? 0) + 1;
        }

        $rating_log = get_user_meta($uid, '_blokes_rating_log', true);
        if (!is_array($rating_log)) $rating_log = array();
        $rating_by_type = array('star_1' => 0, 'star_2' => 0, 'star_3' => 0, 'skull' => 0);
        foreach ($rating_log as $entry) {
            $type = sanitize_text_field($entry['type'] ?? '');
            if (array_key_exists($type, $rating_by_type)) $rating_by_type[$type]++;
        }

        $members[] = array(
            'is_me'          => ($uid === $me),
            'name'           => $name,
            'tests'          => $tests,
            'bloke_total'    => count($bloke_log),
            'bloke_by_color' => $bloke_by_color,
            'rating_total'   => array_sum($rating_by_type),
            'rating_by_type' => $rating_by_type,
        );
    }

    // Top blokes: aggregate completions across all classmates
    $bloke_counts = array();
    foreach (array_keys($uid_to_name) as $uid) {
        $log = get_user_meta($uid, '_blokes_completion_log', true);
        if (!is_array($log)) continue;
        foreach ($log as $entry) {
            $pid = intval($entry['postId'] ?? 0);
            if ($pid > 0) $bloke_counts[$pid] = ($bloke_counts[$pid] ?? 0) + 1;
        }
    }
    arsort($bloke_counts);
    $top_blokes = array();
    // Post data lives on the main blog; switch context to fetch titles/colors
    switch_to_blog(get_main_site_id());
    foreach (array_slice($bloke_counts, 0, 8, true) as $pid => $count) {
        $title = get_the_title($pid);
        $color = sanitize_text_field(get_field('bloke_color', $pid) ?: 'green');
        if ($title) $top_blokes[] = array('post_id' => $pid, 'title' => $title, 'color' => $color, 'count' => $count);
    }
    restore_current_blog();

    return rest_ensure_response(array('data' => array(
        'class'      => array('dia' => $dia, 'horario' => $horario),
        'members'    => $members,
        'top_blokes' => $top_blokes,
    )));
}
