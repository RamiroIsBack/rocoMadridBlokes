<?php
/**
 * Plugin Name: Blokes Extension
 * Plugin URI: https://rocomadrid.com
 * Description: Custom REST API for Blokes climbing problems (custom post type)
 * Version: 1.1.0
 * Author: Rocoteca Madrid
 * License: GPL v2 or later
 */

// Exit if accessed directly
if (!defined('ABSPATH')) exit;

/**
 * Register custom REST API endpoints for blokes
 */
add_action('rest_api_init', function() {
    // Endpoint to record icon clicks
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
});

/**
 * Record an interaction (icon click)
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
        'posts_per_page' => 100,
        'post_status' => 'publish'
    );
    
    $query = new WP_Query($args);
    $blokes = array();
    
    if ($query->have_posts()) {
        while ($query->have_posts()) {
            $query->the_post();
            $post_id = get_the_ID();
            
            $blokes[] = array(
                'id' => $post_id,
                'title' => get_the_title(),
                'description' => get_field('bloke_description', $post_id),
                'color' => get_field('bloke_color', $post_id),
                'category' => get_field('bloke_category', $post_id),
                'images' => get_field('bloke_gallery', $post_id),
                'interactions' => get_field('bloke_interactions', $post_id)
            );
        }
        wp_reset_postdata();
    }
    
    return $blokes;
}

/**
 * Enable ACF for blokes post type
 */
add_action('acf/init', function() {
    if (function_exists('acf_add_local_field_group')) {
        acf_add_local_field_group(array(
            'key' => 'group_blokes_fields',
            'title' => 'Blokes Fields',
            'fields' => array(
                array(
                    'key' => 'field_bloke_description',
                    'label' => 'Description',
                    'name' => 'bloke_description',
                    'type' => 'text',
                ),
                array(
                    'key' => 'field_bloke_color',
                    'label' => 'Color',
                    'name' => 'bloke_color',
                    'type' => 'select',
                    'choices' => array(
                        'verde' => 'Verde',
                        'azul' => 'Azul',
                        'amarillo' => 'Amarillo',
                        'rojo' => 'Rojo',
                    ),
                ),
                array(
                    'key' => 'field_bloke_category',
                    'label' => 'Category',
                    'name' => 'bloke_category',
                    'type' => 'select',
                    'choices' => array(
                        'PUZLE' => 'Puzle',
                        'TECNICO' => 'Técnico',
                        'ENTRENAMIENTO' => 'Entrenamiento',
                        'COORDINACION' => 'Coordinación',
                    ),
                ),
                array(
                    'key' => 'field_bloke_gallery',
                    'label' => 'Gallery',
                    'name' => 'bloke_gallery',
                    'type' => 'gallery',
                    'return_format' => 'url',
                ),
                array(
                    'key' => 'field_bloke_interactions',
                    'label' => 'Interactions',
                    'name' => 'bloke_interactions',
                    'type' => 'group',
                    'fields' => array(
                        array(
                            'key' => 'field_star_1',
                            'label' => '⭐',
                            'name' => 'star_1',
                            'type' => 'number',
                            'default_value' => 0,
                        ),
                        array(
                            'key' => 'field_star_2',
                            'label' => '⭐⭐',
                            'name' => 'star_2',
                            'type' => 'number',
                            'default_value' => 0,
                        ),
                        array(
                            'key' => 'field_star_3',
                            'label' => '⭐⭐⭐',
                            'name' => 'star_3',
                            'type' => 'number',
                            'default_value' => 0,
                        ),
                        array(
                            'key' => 'field_skull',
                            'label' => '💀',
                            'name' => 'skull',
                            'type' => 'number',
                            'default_value' => 0,
                        ),
                    ),
                ),
            ),
            'location' => array(
                array(
                    array(
                        'param' => 'post_type',
                        'operator' => '==',
                        'value' => 'blokes',
                    ),
                ),
            ),
        ));
    }
});
