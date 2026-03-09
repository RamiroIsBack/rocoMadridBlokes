<?php
/**
 * WordPress ACF Fields for Blokes Color and Interaction Tracking
 * Add this to your theme's functions.php or create as a plugin
 */

// Register custom REST API endpoint for interaction tracking
add_action('rest_api_init', function() {
    // Endpoint to record icon clicks
    register_rest_route('blokes/v1', '/interact/(?P<id>\d+)', array(
        'methods' => 'POST',
        'callback' => 'blokes_record_interaction',
        'permission_callback' => '__return_true', // Public endpoint
        'args' => array(
            'type' => array(
                'required' => true,
                'validate_callback' => function($param) {
                    return in_array($param, ['star_empty', 'star_filled', 'lightning']);
                }
            ),
            'nonce' => array(
                'required' => true,
                'validate_callback' => 'wp_verify_nonce'
            )
        )
    ));
    
    // Endpoint to get statistics
    register_rest_route('blokes/v1', '/stats', array(
        'methods' => 'GET',
        'callback' => 'blokes_get_statistics',
        'permission_callback' => '__return_true'
    ));
});

/**
 * Record an interaction (icon click)
 */
function blokes_record_interaction($request) {
    $post_id = $request['id'];
    $type = $request['type'];
    
    // Validate post exists and is a bloke
    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'post') {
        return new WP_Error('invalid_post', 'Invalid post ID', array('status' => 404));
    }
    
    // Get current counts
    $meta_key = '';
    switch ($type) {
        case 'star_empty':
            $meta_key = 'bloke_star_empty_count';
            break;
        case 'star_filled':
            $meta_key = 'bloke_star_filled_count';
            break;
        case 'lightning':
            $meta_key = 'bloke_lightning_count';
            break;
    }
    
    $current_count = (int) get_post_meta($post_id, $meta_key, true);
    $new_count = $current_count + 1;
    
    // Update count
    update_post_meta($post_id, $meta_key, $new_count);
    
    // Also store individual interactions for detailed tracking
    $interaction_data = array(
        'type' => $type,
        'timestamp' => current_time('mysql'),
        'ip' => $_SERVER['REMOTE_ADDR'],
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
    );
    
    $interactions = get_post_meta($post_id, 'bloke_interactions', true);
    if (!is_array($interactions)) {
        $interactions = array();
    }
    $interactions[] = $interaction_data;
    update_post_meta($post_id, 'bloke_interactions', $interactions);
    
    return array(
        'success' => true,
        'post_id' => $post_id,
        'type' => $type,
        'new_count' => $new_count,
        'message' => 'Interaction recorded'
    );
}

/**
 * Get statistics for all blokes
 */
function blokes_get_statistics($request) {
    $args = array(
        'post_type' => 'post',
        'posts_per_page' => -1,
        'meta_query' => array(
            array(
                'key' => 'bloke_category',
                'compare' => 'EXISTS'
            )
        )
    );
    
    // Apply filters from request
    $filters = $request->get_params();
    
    if (!empty($filters['category'])) {
        $args['category__in'] = array_map('intval', explode(',', $filters['category']));
    }
    
    if (!empty($filters['color'])) {
        $args['meta_query'][] = array(
            'key' => 'bloke_color',
            'value' => $filters['color'],
            'compare' => '='
        );
    }
    
    $query = new WP_Query($args);
    $stats = array(
        'total_blokes' => $query->found_posts,
        'blokes' => array(),
        'summary' => array(
            'colors' => array(
                'green' => 0,
                'blue' => 0,
                'yellow' => 0,
                'red' => 0
            ),
            'categories' => array(),
            'total_interactions' => array(
                'star_empty' => 0,
                'star_filled' => 0,
                'lightning' => 0
            )
        )
    );
    
    while ($query->have_posts()) {
        $query->the_post();
        $post_id = get_the_ID();
        
        // Get ACF fields
        $color = get_field('bloke_color', $post_id) ?: 'green';
        $category_terms = wp_get_post_terms($post_id, 'category');
        $category = !empty($category_terms) ? $category_terms[0]->name : 'Unknown';
        
        // Get interaction counts
        $star_empty = (int) get_post_meta($post_id, 'bloke_star_empty_count', true);
        $star_filled = (int) get_post_meta($post_id, 'bloke_star_filled_count', true);
        $lightning = (int) get_post_meta($post_id, 'bloke_lightning_count', true);
        
        $bloke_data = array(
            'id' => $post_id,
            'title' => get_the_title(),
            'color' => $color,
            'category' => $category,
            'interactions' => array(
                'star_empty' => $star_empty,
                'star_filled' => $star_filled,
                'lightning' => $lightning,
                'total' => $star_empty + $star_filled + $lightning
            ),
            'url' => get_permalink()
        );
        
        $stats['blokes'][] = $bloke_data;
        
        // Update summary
        if (isset($stats['summary']['colors'][$color])) {
            $stats['summary']['colors'][$color]++;
        }
        
        if (!isset($stats['summary']['categories'][$category])) {
            $stats['summary']['categories'][$category] = 0;
        }
        $stats['summary']['categories'][$category]++;
        
        $stats['summary']['total_interactions']['star_empty'] += $star_empty;
        $stats['summary']['total_interactions']['star_filled'] += $star_filled;
        $stats['summary']['total_interactions']['lightning'] += $lightning;
    }
    
    wp_reset_postdata();
    
    return $stats;
}

/**
 * Add ACF field for color selection
 * Note: This should be added via ACF UI, but here's the code version
 */
function blokes_add_color_field() {
    if (function_exists('acf_add_local_field_group')) {
        acf_add_local_field_group(array(
            'key' => 'group_bloke_color',
            'title' => 'Bloke Color',
            'fields' => array(
                array(
                    'key' => 'field_bloke_color',
                    'label' => 'Color',
                    'name' => 'bloke_color',
                    'type' => 'select',
                    'choices' => array(
                        'green' => 'Green',
                        'blue' => 'Blue',
                        'yellow' => 'Yellow',
                        'red' => 'Red'
                    ),
                    'default_value' => 'green',
                    'ui' => true,
                    'ajax' => false,
                    'placeholder' => 'Select a color',
                    'return_format' => 'value'
                )
            ),
            'location' => array(
                array(
                    array(
                        'param' => 'post_type',
                        'operator' => '==',
                        'value' => 'post'
                    )
                )
            )
        ));
    }
}
add_action('acf/init', 'blokes_add_color_field');

/**
 * Add interaction counts to REST API response
 */
add_action('rest_api_init', function() {
    register_rest_field('post', 'bloke_interactions', array(
        'get_callback' => function($post_arr) {
            $post_id = $post_arr['id'];
            return array(
                'star_empty' => (int) get_post_meta($post_id, 'bloke_star_empty_count', true),
                'star_filled' => (int) get_post_meta($post_id, 'bloke_star_filled_count', true),
                'lightning' => (int) get_post_meta($post_id, 'bloke_lightning_count', true)
            );
        },
        'update_callback' => null,
        'schema' => array(
            'description' => 'Bloke interaction counts',
            'type' => 'object',
            'properties' => array(
                'star_empty' => array('type' => 'integer'),
                'star_filled' => array('type' => 'integer'),
                'lightning' => array('type' => 'integer')
            )
        )
    ));
    
    register_rest_field('post', 'bloke_color', array(
        'get_callback' => function($post_arr) {
            return get_field('bloke_color', $post_arr['id']) ?: 'green';
        },
        'update_callback' => null,
        'schema' => array(
            'description' => 'Bloke color',
            'type' => 'string',
            'enum' => array('green', 'blue', 'yellow', 'red')
        )
    ));
});

// Create nonce for interaction API
add_action('wp_head', function() {
    if (is_singular('post')) {
        wp_nonce_field('blokes_interaction', 'blokes_nonce');
    }
});

// Enqueue script for interaction tracking
add_action('wp_enqueue_scripts', function() {
    if (is_singular('post') || is_page('blokes')) {
        wp_localize_script('jquery', 'blokes_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'rest_url' => rest_url('blokes/v1'),
            'nonce' => wp_create_nonce('wp_rest')
        ));
    }
});
?>