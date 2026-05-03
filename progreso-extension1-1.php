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
<?php wp_footer(); ?>
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
    $data = array(
        'nonce'      => wp_create_nonce('wp_rest'),
        'isLoggedIn' => is_user_logged_in(),
        'loginUrl'   => wp_login_url(),
    );
    echo '<script>window.blokesSiteData = ' . wp_json_encode($data) . ';</script>' . "\n";
});

// Respect redirect_to after login even for admin users
add_filter('login_redirect', function($redirect_to, $requested, $user) {
    if (!empty($requested) && !is_wp_error($user)) {
        return $requested;
    }
    return $redirect_to;
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
            'dia'      => array('required' => false),
            'horario'  => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'edad'     => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'producto' => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'turno'    => array('required' => false, 'sanitize_callback' => 'sanitize_text_field'),
            'status'   => array('required' => false, 'default' => 'active', 'sanitize_callback' => 'sanitize_text_field'),
        ),
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
function progreso_get_alumnos($request) {
    if (!class_exists('RocoMadrid_SF_Stats')) {
        return new WP_Error('class_not_found', 'RocoMadrid_SF_Stats not available. Call this endpoint on the club subsite.', array('status' => 503));
    }

    $dia = $request->get_param('dia');
    $filtros = array(
        'dia'      => is_array($dia) ? $dia : ($dia ? array($dia) : array()),
        'horario'  => $request->get_param('horario') ?: '',
        'edad'     => $request->get_param('edad') ?: '',
        'producto' => $request->get_param('producto') ?: '',
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

    return rest_ensure_response(array(
        'success' => true,
        'data'    => array(
            'alumnos' => $filtered,
            'total'   => count($filtered),
        ),
    ));
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
