<?php
/**
 * Plugin Name: Blokes Extension
 * Plugin URI: https://rocomadrid.com
 * Description: Custom REST API for Blokes climbing problems (custom post type) - v1.2.0
 * Version: 1.2.0
 * Author: Rocoteca Madrid
 * License: GPL v2 or later
 */

// Exit if accessed directly
if (!defined('ABSPATH')) exit;

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
    $post_id = intval($request['id']);
    $acf_fields = $request->get_param('acf');
    
    // Validate post exists and is a bloke
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }
    
    // Update ACF fields
    if (is_array($acf_fields)) {
        foreach ($acf_fields as $field_name => $field_value) {
            update_field($field_name, $field_value, $post_id);
        }
    }
    
    return array(
        'success' => true,
        'post_id' => $post_id,
        'acf' => get_fields($post_id)
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
