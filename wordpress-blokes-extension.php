<?php
/**
 * Plugin Name: Blokes Extension
 * Plugin URI: https://rocomadrid.com
 * Description: Custom REST API for Blokes climbing problems (custom post type) - v1.5.1
 * Version: 1.5.1
 * Author: Rocoteca Madrid
 * License: GPL v2 or later
 */

// Exit if accessed directly
if (!defined('ABSPATH')) exit;

/**
 * Inject bloke_colorPresa into the WP REST API response for blokes.
 * Using rest_prepare_{post_type} instead of register_post_meta to avoid
 * interfering with the _embed functionality that returns featured images.
 */
add_filter('rest_prepare_blokes', function($response, $post, $request) {
    $data = $response->get_data();
    $data['bloke_colorPresa'] = get_post_meta($post->ID, 'bloke_colorPresa', true);
    $data['bloke_completion_count'] = (int) get_post_meta($post->ID, '_bloke_completion_count', true);
    $response->set_data($data);
    return $response;
}, 10, 3);

// Inject auth data for the React SPA so it can make cookie-authenticated REST calls
add_action('wp_head', function() {
    $data = array(
        'nonce'      => wp_create_nonce('wp_rest'),
        'isLoggedIn' => is_user_logged_in(),
        'loginUrl'   => wp_login_url(home_url('/blokes/')),
    );
    echo '<script>window.blokesSiteData = ' . wp_json_encode($data) . ';</script>' . "\n";
});

/**
 * Register custom REST API endpoints for blokes
 */
add_action('rest_api_init', function() {
    // Endpoint to record icon clicks (public - no auth required)
    register_rest_route('blokes/v1', '/interact/(?P<id>\d+)', array(
        'methods' => 'POST',
        'callback' => 'blokes_record_interaction',
        'permission_callback' => '__return_true',
        'args' => array(
            'type' => array(
                'required' => true,
                'validate_callback' => function($param) {
                    return in_array($param, ['star_1', 'star_2', 'star_3', 'skull']);
                }
            )
        )
    ));
    
    // Endpoint to get all blokes with ACF fields
    register_rest_route('blokes/v1', '/all', array(
        'methods' => 'GET',
        'callback' => 'blokes_get_all',
        'permission_callback' => '__return_true'
    ));
    
    // Endpoint to create bloke with ACF fields
    register_rest_route('blokes/v1', '/create', array(
        'methods' => 'POST',
        'callback' => 'blokes_create_with_acf',
        'permission_callback' => function() {
            return is_user_logged_in();
        }
    ));
    
    // Endpoint to update ACF fields for existing bloke
    register_rest_route('blokes/v1', '/update-acf/(?P<id>\d+)', array(
        'methods' => 'POST',
        'callback' => 'blokes_update_acf',
        'permission_callback' => function() {
            return is_user_logged_in();
        }
    ));
    
    // Hall of Fame - get & save
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

    // Get current user's completed blokes (requires cookie auth + nonce)
    register_rest_route('blokes/v1', '/my-completions', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_get_my_completions',
        'permission_callback' => function() { return is_user_logged_in(); },
    ));

    // Toggle a bloke as done/not-done for the current user
    register_rest_route('blokes/v1', '/completions/(?P<id>\d+)/toggle', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_toggle_completion',
        'permission_callback' => function() { return is_user_logged_in(); },
    ));

    // Endpoint to delete a bloke and its associated media
    register_rest_route('blokes/v1', '/delete/(?P<id>\d+)', array(
        'methods' => 'DELETE',
        'callback' => 'blokes_delete_with_media',
        'permission_callback' => function() {
            return is_user_logged_in();
        }
    ));
});

/**
 * Record an interaction (icon click) - public endpoint
 */
function blokes_record_interaction($request) {
    $post_id = intval($request['id']);
    $type = sanitize_text_field($request['type']);
    
    // Validate post exists and is a bloke
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }
    
    // Get current interactions from ACF
    $interactions = get_field('bloke_interactions', $post_id);
    if (!is_array($interactions)) {
        $interactions = array(
            'star_1' => 0,
            'star_2' => 0,
            'star_3' => 0,
            'skull' => 0
        );
    }
    
    // Increment the count
    if (isset($interactions[$type])) {
        $interactions[$type] = intval($interactions[$type]) + 1;
    } else {
        $interactions[$type] = 1;
    }
    
    // Update via ACF
    update_field('bloke_interactions', $interactions, $post_id);
    
    return array(
        'success' => true,
        'post_id' => $post_id,
        'type' => $type,
        'interactions' => $interactions
    );
}

/**
 * Get all blokes with ACF fields
 */
function blokes_get_all($request) {
    $args = array(
        'post_type' => 'blokes',
        'posts_per_page' => -1,
        'post_status' => 'publish'
    );
    
    $query = new WP_Query($args);
    $blokes = array();
    
    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id = get_the_ID();
            
            $bloke = array(
                'id' => $post_id,
                'title' => get_the_title(),
                'content' => get_the_content(),
                'acf' => get_fields($post_id)
            );
            
            $blokes[] = $bloke;
        }
        wp_reset_postdata();
    }
    
    return $blokes;
}

/**
 * Create a bloke with ACF fields
 */
function blokes_create_with_acf($request) {
    $title = sanitize_text_field($request->get_param('title'));
    $content = sanitize_textarea_field($request->get_param('content'));
    $category_id = intval($request->get_param('category_id'));
    $featured_media = intval($request->get_param('featured_media'));
    $acf_fields = $request->get_param('acf');
    
    // Create the post
    $post_id = wp_insert_post(array(
        'post_type' => 'blokes',
        'post_title' => $title,
        'post_content' => $content,
        'post_status' => 'publish',
        'post_category' => $category_id ? array($category_id) : array()
    ));
    
    if (is_wp_error($post_id)) {
        return $post_id;
    }
    
    // Set featured media
    if ($featured_media) {
        set_post_thumbnail($post_id, $featured_media);
    }
    
    // Update ACF fields
    if (is_array($acf_fields)) {
        foreach ($acf_fields as $field_name => $field_value) {
            update_field($field_name, $field_value, $post_id);
        }
        // Ensure bloke_colorPresa is also saved as registered post meta
        // so it is exposed via the WP REST API
        if (isset($acf_fields['bloke_colorPresa'])) {
            update_post_meta($post_id, 'bloke_colorPresa', sanitize_text_field($acf_fields['bloke_colorPresa']));
        }
    }

    return array(
        'success' => true,
        'post_id' => $post_id,
        'title' => $title
    );
}

/**
 * Update ACF fields for existing bloke
 */
function blokes_update_acf($request) {
    $post_id        = intval($request['id']);
    $acf_fields     = $request->get_param('acf');
    $title          = $request->get_param('title');
    $featured_media = $request->get_param('featured_media');

    // Validate post exists and is a bloke
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    // Update post title if provided
    if ($title !== null && $title !== '') {
        wp_update_post(array(
            'ID'         => $post_id,
            'post_title' => sanitize_text_field($title),
        ));
    }

    // Update featured image if an ID was provided
    if ($featured_media !== null) {
        $media_id = intval($featured_media);
        if ($media_id > 0) {
            set_post_thumbnail($post_id, $media_id);
        } else {
            delete_post_thumbnail($post_id);
        }
    }

    // Update ACF fields
    if (is_array($acf_fields)) {
        foreach ($acf_fields as $field_name => $field_value) {
            update_field($field_name, $field_value, $post_id);
        }
        // Ensure bloke_colorPresa is also saved as registered post meta
        if (isset($acf_fields['bloke_colorPresa'])) {
            update_post_meta($post_id, 'bloke_colorPresa', sanitize_text_field($acf_fields['bloke_colorPresa']));
        }
    }

    return array(
        'success' => true,
        'post_id' => $post_id,
        'acf'     => get_fields($post_id),
    );
}

/**
 * Hall of Fame - get stored list
 */
function blokes_get_hall_of_fame($request) {
    $data = get_option('blokes_hall_of_fame', array());
    return is_array($data) ? $data : array();
}

/**
 * Hall of Fame - save list (array of bloke objects from React)
 */
function blokes_save_hall_of_fame($request) {
    $blokes = $request->get_param('blokes');
    if (!is_array($blokes)) {
        return new WP_Error('invalid_data', 'blokes must be an array', array('status' => 400));
    }
    $clean = array();
    foreach (array_slice($blokes, 0, 10) as $b) {
        if (!is_array($b)) continue;
        $clean[] = array(
            'postId'            => intval(isset($b['postId']) ? $b['postId'] : 0),
            'title'             => sanitize_text_field(isset($b['title']) ? $b['title'] : ''),
            'color'             => sanitize_text_field(isset($b['color']) ? $b['color'] : ''),
            'sala'              => sanitize_text_field(isset($b['sala']) ? $b['sala'] : ''),
            'equipador'         => sanitize_text_field(isset($b['equipador']) ? $b['equipador'] : ''),
            'totalInteractions' => intval(isset($b['totalInteractions']) ? $b['totalInteractions'] : 0),
            'timestamp'         => sanitize_text_field(isset($b['timestamp']) ? $b['timestamp'] : ''),
        );
    }
    update_option('blokes_hall_of_fame', $clean, false);
    return array('success' => true, 'count' => count($clean));
}

/**
 * Return the list of bloke IDs the current user has marked as done
 */
function blokes_get_my_completions($request) {
    $user_id = get_current_user_id();
    $saved   = get_user_meta($user_id, '_blokes_completed', true);
    $my_ids  = is_array($saved) ? array_values(array_map('intval', $saved)) : array();
    $log     = get_user_meta($user_id, '_blokes_completion_log', true);
    if (!is_array($log)) $log = array();
    return array(
        'myIds' => $my_ids,
        'log'   => $log,  // [{postId, color, timestamp}, ...] for future stats page
    );
}

/**
 * Toggle a bloke as done/not-done for the current user.
 * Updates user meta (_blokes_completed) and post meta (_bloke_completion_count).
 */
function blokes_toggle_completion($request) {
    $post_id = intval($request['id']);
    $user_id = get_current_user_id();

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    $saved         = get_user_meta($user_id, '_blokes_completed', true);
    $completed_ids = is_array($saved) ? array_map('intval', $saved) : array();

    $log = get_user_meta($user_id, '_blokes_completion_log', true);
    if (!is_array($log)) $log = array();

    if (in_array($post_id, $completed_ids)) {
        // Unmark: remove from IDs list and from log
        $completed_ids = array_values(array_diff($completed_ids, array($post_id)));
        $log           = array_values(array_filter($log, function($e) use ($post_id) {
            return intval($e['postId']) !== $post_id;
        }));
        $completed = false;
        $count     = max(0, (int) get_post_meta($post_id, '_bloke_completion_count', true) - 1);
    } else {
        // Mark: add to IDs list and log with color + timestamp
        $completed_ids[] = $post_id;
        $color = sanitize_text_field(get_field('bloke_color', $post_id) ?: 'green');
        $log[] = array(
            'postId'    => $post_id,
            'color'     => $color,
            'timestamp' => current_time('c'),
        );
        $completed = true;
        $count     = (int) get_post_meta($post_id, '_bloke_completion_count', true) + 1;
    }

    update_user_meta($user_id, '_blokes_completed', $completed_ids);
    update_user_meta($user_id, '_blokes_completion_log', $log);
    update_post_meta($post_id, '_bloke_completion_count', $count);

    return array(
        'completed' => $completed,
        'count'     => $count,
    );
}

/**
 * Delete a bloke and its associated media attachments
 */
function blokes_delete_with_media($request) {
    $post_id = intval($request['id']);
    
    // Validate post exists and is a bloke
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }
    
    $deleted_media = array();
    
    // Get featured media and delete it
    $featured_media_id = get_post_thumbnail_id($post_id);
    if ($featured_media_id) {
        $deleted_media[] = $featured_media_id;
        wp_delete_attachment($featured_media_id, true);
    }
    
    // Get gallery images from ACF and delete them
    $gallery = get_field('bloke_gallery', $post_id);
    if (is_array($gallery) && !empty($gallery)) {
        foreach ($gallery as $attachment_id) {
            if (is_numeric($attachment_id)) {
                $deleted_media[] = $attachment_id;
                wp_delete_attachment($attachment_id, true);
            }
        }
    }
    
    // Delete the bloke post
    $deleted = wp_delete_post($post_id, true);
    
    if ($deleted) {
        return array(
            'success' => true,
            'post_id' => $post_id,
            'deleted_media' => $deleted_media,
            'message' => 'Bloke and associated media deleted successfully'
        );
    } else {
        return new WP_Error('delete_failed', 'Failed to delete bloke', array('status' => 500));
    }
}
