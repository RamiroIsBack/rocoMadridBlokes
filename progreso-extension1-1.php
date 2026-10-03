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
$GLOBALS['blokes_app_slugs'] = ['blokes-dev', 'blokes'];

// ── App-level role whitelist ─────────────────────────────────────────────────
// Roles independientes de WordPress — el rol de WP no importa, solo estas listas.
// Jerarquía: socio > gestion > profesor > member > guest
$GLOBALS['blokes_socios_emails'] = array(
    'rocomadrid7a@gmail.com',     // Ramiro
    'ramirosan69@hotmail.com',    // Ramiro (cuenta alternativa)
    'javier_buendia@hotmail.com', // Javier Buendía
    'alvilu2@hotmail.com',        // Álvaro
);
$GLOBALS['blokes_gestion_emails'] = array(
    'rocomadridgestion@gmail.com', // Eva
);
$GLOBALS['blokes_profesores_emails'] = array(
    'caye.suomi@gmail.com',
    'sigurdbaum@yahoo.es',
    'sara.coronadosanz@gmail.com',
    'ana.llorenteg03@gmail.com',
    'alobo@ymail.com',
    'luciapcaas@gmail.com',
);
// Aliases para compatibilidad con plugins del club que referencian los nombres anteriores
$GLOBALS['blokes_superadmin_emails'] = $GLOBALS['blokes_socios_emails'];
$GLOBALS['blokes_admin_emails']      = array_merge(
    $GLOBALS['blokes_gestion_emails'],
    $GLOBALS['blokes_profesores_emails']
);

// Devuelve las listas activas: siempre desde blog 1 (fuente de verdad única en multisite)
function blokes_get_email_lists() {
    switch_to_blog(1);
    $saved = get_option('blokes_email_lists');
    restore_current_blog();
    return array(
        'socios'     => (is_array($saved) && !empty($saved['socios']))     ? $saved['socios']     : $GLOBALS['blokes_socios_emails'],
        'gestion'    => (is_array($saved) && !empty($saved['gestion']))    ? $saved['gestion']    : $GLOBALS['blokes_gestion_emails'],
        'profesores' => (is_array($saved) && !empty($saved['profesores'])) ? $saved['profesores'] : $GLOBALS['blokes_profesores_emails'],
    );
}

/**
 * Returns the app-level role for the current user.
 * Checked against email whitelists — independent of WordPress roles.
 *   'socio'    → acceso total + Superadmin
 *   'gestion'  → acceso profesor + ExcelMuerte (Supervisión)
 *   'profesor' → Setter, Stats, Entrenamientos, Supervisión (Fichaje/TimeOff)
 *   'member'   → usuario logueado sin permisos de gestión
 *   'guest'    → no logueado
 */
function blokes_get_app_role() {
    if (!is_user_logged_in()) return 'guest';
    $email = strtolower(trim(wp_get_current_user()->user_email));
    $lists = blokes_get_email_lists();
    if (in_array($email, array_map('strtolower', $lists['socios'])))     return 'socio';
    if (in_array($email, array_map('strtolower', $lists['gestion'])))    return 'gestion';
    if (in_array($email, array_map('strtolower', $lists['profesores']))) return 'profesor';
    return 'member';
}

function blokes_can_supervise() {
    return in_array(blokes_get_app_role(), array('profesor', 'gestion', 'socio'));
}

// ── Profile helpers ──────────────────────────────────────────────────────────
function blokes_is_profile_complete($user_id) {
    return (bool) get_user_meta((int) $user_id, '_blokes_profile_complete', true);
}
function blokes_get_user_nickname($user_id) {
    return get_user_meta((int) $user_id, '_blokes_nickname', true) ?: '';
}
function blokes_get_user_avatar($user_id) {
    $type = get_user_meta((int) $user_id, '_blokes_avatar_type', true) ?: '';
    $raw  = get_user_meta((int) $user_id, '_blokes_avatar_data', true) ?: '{}';
    $data = json_decode($raw);
    return array('type' => $type, 'data' => $data ?: new stdClass());
}
function blokes_nickname_exists($nickname, $exclude_user_id = 0) {
    global $wpdb;
    return (bool) $wpdb->get_var($wpdb->prepare(
        "SELECT user_id FROM {$wpdb->usermeta}
         WHERE meta_key = '_blokes_nickname' AND meta_value = %s AND user_id != %d LIMIT 1",
        $nickname, (int) $exclude_user_id
    ));
}

add_action('init', function() {
    foreach ($GLOBALS['blokes_app_slugs'] as $slug) {
        add_rewrite_rule("^{$slug}/(.*)$", "index.php?pagename={$slug}", 'top');
    }
});

add_filter('show_admin_bar', function($show) {
    if (is_page($GLOBALS['blokes_app_slugs'])) return false;
    return $show;
});

// Priority 1: runs before WordPress's redirect_canonical (priority 10).
// Catches both the exact slug (/blokes-dev/) and any subroute (/blokes-dev/superadmin).
// Serves the SPA HTML directly — no redirect round-trip needed.
add_action('template_redirect', function() {
    $slug = null;
    if (is_page($GLOBALS['blokes_app_slugs'])) {
        $slug = get_post_field('post_name', get_queried_object_id());
    }
    if (!$slug) {
        $path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
        foreach ($GLOBALS['blokes_app_slugs'] as $s) {
            if ($path === $s || strpos($path, $s . '/') === 0) {
                $slug = $s;
                break;
            }
        }
    }
    if (!$slug) return;

    // Prevent SiteGround Dynamic Cache and browser cache from serving stale
    // login state — isLoggedIn must always be computed fresh per request.
    nocache_headers();

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
}, 1);

// ============================================================
//  Legacy /blokes support — operaciones sin login WordPress
//  Cubre: validación de credenciales, subida de medios y creación de posts
//  TODO: eliminar cuando /blokes use sesión WP
// ============================================================
add_filter('rest_pre_dispatch', function($result, $server, $request) {
    if (is_user_logged_in()) return $result;

    $route  = $request->get_route();
    $method = $request->get_method();

    $needs_user =
        ($route === '/wp/v2/users/me')                                          ||  // validación de credenciales
        ($route === '/wp/v2/media'             && $method === 'POST')           ||  // subida de imágenes
        (preg_match('#^/blokes/v1/(create|update-acf)#', $route) && $method === 'POST')  ||  // crear/editar bloke
        (preg_match('#^/blokes/v1/delete/#', $route)             && $method === 'DELETE'); // eliminar bloke

    if ($needs_user) {
        $admins = get_users(array('role' => 'administrator', 'number' => 1, 'fields' => 'ID'));
        if (!empty($admins)) {
            wp_set_current_user((int) $admins[0]);
        }
    }

    return $result;
}, 10, 3);

// ============================================================
//  REST API — inject extra fields into blokes responses
// ============================================================

add_filter('rest_prepare_blokes', function($response, $post, $request) {
    $data = $response->get_data();
    $data['bloke_colorPresa']       = get_post_meta($post->ID, 'bloke_colorPresa', true);
    $data['bloke_completion_count'] = (int) get_post_meta($post->ID, '_bloke_completion_count', true);
    $fa = get_post_meta($post->ID, '_bloke_first_ascent', true);
    $data['bloke_first_ascent']     = is_array($fa) ? $fa : null;
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
            $info = array(
                'status'  => $sub['status'] ?? 'unknown',
                'name'    => $sub['producto'] ?? '',
                'dia'     => $sub['dia'] ?? '',
                'horario' => $sub['horario'] ?? '',
            );
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
    // Detect the actual page slug so the SPA router uses the correct basename
    $app_slug = 'blokes';
    if (is_page($GLOBALS['blokes_app_slugs'])) {
        $slug_candidate = get_post_field('post_name', get_queried_object_id());
        if ($slug_candidate) $app_slug = $slug_candidate;
    } else {
        $path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
        foreach ($GLOBALS['blokes_app_slugs'] as $s) {
            if ($path === $s || strpos($path, $s . '/') === 0) {
                $app_slug = $s;
                break;
            }
        }
    }
    $spa_url = home_url('/' . $app_slug . '/');
    $data = array(
        'nonce'        => wp_create_nonce('wp_rest'),
        'clubNonce'    => $club_nonce,
        'isLoggedIn'   => is_user_logged_in(),
        'userId'       => get_current_user_id(),
        'loginUrl'     => wp_login_url($spa_url),
        'logoutUrl'    => wp_logout_url($spa_url),
        'userName'     => $user_name,
        'subscription' => $subscription,
        'appBasename'      => '/' . $app_slug,
        'userRole'         => blokes_get_app_role(),
        'canSupervise'     => blokes_can_supervise(),
        'emailLists'       => in_array(blokes_get_app_role(), array('socio', 'superadmin')) ? blokes_get_email_lists() : null,
        'fichajeEmbedUrl'  => '',
        'timeOffEmbedUrl'  => '',
        'profileComplete'  => is_user_logged_in() ? blokes_is_profile_complete(get_current_user_id()) : false,
        'userNickname'     => is_user_logged_in() ? blokes_get_user_nickname(get_current_user_id()) : '',
        'userAvatarType'   => is_user_logged_in() ? (get_user_meta(get_current_user_id(), '_blokes_avatar_type', true) ?: '') : '',
        'userAvatarData'   => is_user_logged_in()
                                ? (json_decode(get_user_meta(get_current_user_id(), '_blokes_avatar_data', true) ?: '{}') ?: new stdClass())
                                : new stdClass(),
    );
    echo '<script>window.blokesSiteData = ' . wp_json_encode($data) . ';</script>' . "\n";
});

// After login: honour explicit redirect_to; otherwise send to the SPA that referred us
add_filter('login_redirect', function($redirect_to, $requested, $user) {
    if (is_wp_error($user)) return $redirect_to;
    if (!empty($requested)) return $requested;
    // Detect which app referred the login from the referer header
    $referer = wp_get_referer();
    foreach ($GLOBALS['blokes_app_slugs'] as $slug) {
        if ($referer && strpos($referer, '/' . $slug) !== false) {
            return home_url('/' . $slug . '/');
        }
    }
    if (!user_can($user, 'manage_options')) return home_url('/blokes/');
    return $redirect_to;
}, 10, 3);

// After logout: honour explicit redirect_to; otherwise detect source app from cookie or referer
add_filter('logout_redirect', function($redirect_to, $requested_redirect_to, $user) {
    if (!empty($requested_redirect_to)) return $requested_redirect_to;
    // Cookie set by server-index.php on every SPA page load
    if (!empty($_COOKIE['blokes_last_app'])) {
        $cookie_slug = sanitize_text_field($_COOKIE['blokes_last_app']);
        if (in_array($cookie_slug, $GLOBALS['blokes_app_slugs'], true)) {
            return home_url('/' . $cookie_slug . '/');
        }
    }
    $referer = wp_get_referer();
    foreach ($GLOBALS['blokes_app_slugs'] as $slug) {
        if ($referer && strpos($referer, '/' . $slug) !== false) {
            return home_url('/' . $slug . '/');
        }
    }
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
        // TODO: restaurar cuando /blokes use sesión WP
        // 'permission_callback' => function() { return is_user_logged_in(); },
        'permission_callback' => '__return_true',
    ));

    register_rest_route('blokes/v1', '/update-acf/(?P<id>\d+)', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_update_acf',
        // TODO: restaurar cuando /blokes use sesión WP
        // 'permission_callback' => function() { return is_user_logged_in(); },
        'permission_callback' => '__return_true',
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

    // Endpoint para subir imágenes sin necesidad de login WordPress
    // TODO: restaurar cuando /blokes use sesión WP
    // 'permission_callback' => 'is_user_logged_in',
    register_rest_route('blokes/v1', '/upload-image', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_upload_image',
        'permission_callback' => '__return_true',
    ));

    // ── Progreso/v1 — community stats (new namespace, public) ────────────────

    // Returns community completion totals grouped by color.
    // Used by ProgresoPage "Blokes más encadenados" section.
    register_rest_route('progreso/v1', '/stats/completions-by-color', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_completions_by_color',
        'permission_callback' => '__return_true',
    ));

    // ── Progreso/v1 — entrenamientos (profesor / gestion / socio) ────────────
    register_rest_route('progreso/v1', '/alumnos', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_alumnos',
        'permission_callback' => function() {
            return blokes_can_supervise();
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
            return blokes_can_supervise();
        },
    ));

    // ── Training log ─────────────────────────────────────────────────────────
    register_rest_route('progreso/v1', '/training', array(
        'methods'             => 'POST',
        'callback'            => 'progreso_log_training',
        'permission_callback' => function() {
            return blokes_can_supervise();
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
        'permission_callback' => '__return_true',
    ));

    register_rest_route('progreso/v1', '/training/tests', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_training_tests',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('progreso/v1', '/training/tests', array(
        'methods'             => 'PUT',
        'callback'            => 'progreso_save_training_tests',
        'permission_callback' => function() { return blokes_can_supervise(); },
    ));

    register_rest_route('progreso/v1', '/training/professors', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_professors',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('progreso/v1', '/training/professors/(?P<slug>[a-z0-9-]+)', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_professor_detail',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('progreso/v1', '/training/me', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_training_me',
        'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('progreso/v1', '/training/(?P<user_id>\d+)', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_training',
        'permission_callback' => function($request) {
            if (!is_user_logged_in()) return false;
            return blokes_can_supervise() ||
                   get_current_user_id() === intval($request['user_id']);
        },
    ));

    register_rest_route('progreso/v1', '/training/entry/(?P<id>\d+)', array(
        'methods'             => 'PUT',
        'callback'            => 'progreso_update_training',
        'permission_callback' => function() {
            return blokes_can_supervise();
        },
        'args' => array(
            'value_kg' => array('required' => true, 'type' => 'number'),
        ),
    ));

    register_rest_route('progreso/v1', '/training/entry/(?P<id>\d+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'progreso_delete_training_entry',
        'permission_callback' => function() {
            return blokes_can_supervise();
        },
    ));

    register_rest_route('progreso/v1', '/training/all', array(
        'methods'             => 'DELETE',
        'callback'            => 'progreso_delete_all_training',
        'permission_callback' => function() {
            return blokes_can_supervise();
        },
    ));

    register_rest_route('progreso/v1', '/training/class-progress', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_class_progress',
        'permission_callback' => 'is_user_logged_in',
    ));

    // ── Superadmin endpoints ──
    $sa_perm = function() { return in_array(blokes_get_app_role(), array('socio', 'gestion')); };

    register_rest_route('superadmin/v1', '/revenue', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_revenue',
        'permission_callback' => $sa_perm,
        'args'                => array('months' => array('type' => 'integer', 'default' => 12)),
    ));
    register_rest_route('superadmin/v1', '/products', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_products',
        'permission_callback' => $sa_perm,
        'args'                => array('months' => array('type' => 'integer', 'default' => 12)),
    ));
    register_rest_route('superadmin/v1', '/classes', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_classes',
        'permission_callback' => $sa_perm,
        'args'                => array('months' => array('type' => 'integer', 'default' => 12)),
    ));

    register_rest_route('superadmin/v1', '/expenses', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'superadmin_get_expenses',
            'permission_callback' => $sa_perm,
            'args'                => array(
                'months'           => array('type' => 'integer', 'default' => 6),
                'entity'           => array('type' => 'string',  'default' => 'all'),
                'exclude_internal' => array('type' => 'integer', 'default' => 1),
            ),
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'superadmin_save_expenses',
            'permission_callback' => $sa_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'superadmin_delete_expenses',
            'permission_callback' => $sa_perm,
            'args'                => array(
                'month'  => array('type' => 'string', 'required' => false, 'default' => ''),
                'entity' => array('type' => 'string', 'required' => false, 'default' => ''),
            ),
        ),
    ));
});

// ============================================================
//  superadmin/v1 — expenses
// ============================================================

function superadmin_save_expenses($request) {
    $body   = $request->get_json_params();
    $month  = sanitize_text_field($body['month']  ?? '');
    $entity = sanitize_text_field($body['entity'] ?? 'rocoteca');
    $items  = is_array($body['items'] ?? null) ? $body['items'] : array();

    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }

    $clean = array();
    foreach ($items as $item) {
        $clean[] = array(
            'fecha'    => sanitize_text_field($item['fecha']    ?? ''),
            'concepto' => sanitize_text_field($item['concepto'] ?? ''),
            'importe'  => floatval($item['importe']  ?? 0),
            'category' => sanitize_text_field($item['category'] ?? 'otros'),
            'iva'      => intval($item['iva']      ?? 0),
            'excluded' => (bool) ($item['excluded'] ?? false),
            'section'  => in_array($item['section'], array('ingresos','costes')) ? $item['section'] : 'costes',
        );
    }

    $key  = 'blokes_exp_' . str_replace('-', '_', $month) . '_' . $entity;
    update_option($key, wp_json_encode(array(
        'month'  => $month,
        'entity' => $entity,
        'items'  => $clean,
        'saved'  => (new DateTime())->format('c'),
    )), false);

    return rest_ensure_response(array('success' => true, 'month' => $month));
}

function superadmin_get_expenses($request) {
    $months           = max(1, min(60, intval($request->get_param('months'))));
    $entity_filter    = sanitize_text_field($request->get_param('entity') ?: 'all');
    $exclude_internal = (bool) intval($request->get_param('exclude_internal') ?? 1);
    $start            = new DateTime("-{$months} months");

    global $wpdb;
    $rows = $wpdb->get_results(
        "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE 'blokes_exp_%'",
        ARRAY_A
    );

    $data = array();

    foreach ($rows as $row) {
        $saved = json_decode($row['option_value'], true);
        if (!$saved || !isset($saved['month'])) continue;

        $row_entity = $saved['entity'] ?? 'rocoteca';
        if ($entity_filter !== 'all' && $row_entity !== $entity_filter) continue;

        $dt = DateTime::createFromFormat('Y-m', $saved['month']);
        if (!$dt || $dt < $start) continue;

        $tc = 0; $ti = 0; $iva_s = 0; $iva_r = 0; $nom = 0;
        $row_concepto  = array(); // expense concept totals for this entity-month
        $row_ingresos  = array(); // income items for this entity-month
        foreach ($saved['items'] as $item) {
            $concepto_norm = function_exists('iconv')
                ? strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $item['concepto'] ?? ''))
                : strtolower($item['concepto'] ?? '');
            // Internal: flagged at upload time OR matches key patterns (catches accent variants)
            $is_internal = $item['excluded']
                || strpos($concepto_norm, 'rocodromo') !== false
                || strpos($concepto_norm, 'transferencia entre cuentas') !== false;
            if ($exclude_internal && $is_internal) continue;
            $amt  = abs(floatval($item['importe']));
            $rate = ($row_entity !== 'club') ? floatval($item['iva']) / 100 : 0;
            $iva  = $rate > 0 ? $amt * $rate / (1 + $rate) : 0;
            $is_nomina = strpos($concepto_norm, 'nomina') !== false;

            if ($item['section'] === 'costes') {
                $tc    += $amt;
                $iva_s += $iva;
                if ($is_nomina) {
                    $nom += $amt;
                } else {
                    $ck = trim($item['concepto'] ?? 'Sin concepto');
                    $row_concepto[$ck] = ($row_concepto[$ck] ?? 0) + $amt;
                }
            } else {
                $ti    += $amt;
                $iva_r += $iva;
                $row_ingresos[] = array(
                    'concepto' => trim($item['concepto'] ?? ''),
                    'importe'  => $amt,
                );
            }
        }
        arsort($row_concepto);
        $data[] = array(
            'month'           => $saved['month'],
            'entity'          => $row_entity,
            'total_costes'    => round($tc,    2),
            'total_ingresos'  => round($ti,    2),
            'iva_soportado'   => round($iva_s, 2),
            'iva_repercutido' => round($iva_r, 2),
            'nominas'         => round($nom,   2),
            'by_concepto'     => $row_concepto,
            'ingresos_items'  => $row_ingresos,
        );
    }

    usort($data, function($a, $b) { return strcmp($a['month'], $b['month']); });
    return rest_ensure_response(array('data' => $data));
}

function superadmin_delete_expenses($request) {
    $month  = sanitize_text_field($request->get_param('month') ?: '');
    $entity = sanitize_text_field($request->get_param('entity') ?: '');

    global $wpdb;

    // No month → delete ALL expense data
    if (!$month) {
        $keys = $wpdb->get_col(
            "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'blokes_exp_%'"
        );
        foreach ($keys as $key) { delete_option($key); }
        return rest_ensure_response(array('success' => true, 'deleted' => $keys));
    }

    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido. Usa YYYY-MM.', array('status' => 400));
    }

    if ($entity) {
        $key = 'blokes_exp_' . str_replace('-', '_', $month) . '_' . $entity;
        delete_option($key);
        return rest_ensure_response(array('success' => true, 'deleted' => array($key)));
    }

    $prefix = 'blokes_exp_' . str_replace('-', '_', $month) . '_%';
    $keys = $wpdb->get_col($wpdb->prepare(
        "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
        $prefix
    ));
    foreach ($keys as $key) { delete_option($key); }
    return rest_ensure_response(array('success' => true, 'deleted' => $keys));
}

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
    $my_fa = get_user_meta($user_id, '_blokes_first_ascents', true);
    if (!is_array($my_fa)) $my_fa = array();
    return array(
        'myIds'          => $my_ids,
        'log'            => $log,
        'myRatings'      => $my_ratings,
        'ratingLog'      => $rating_log,
        'firstAscentIds' => array_values(array_map('intval', $my_fa)),
        'nonce'          => wp_create_nonce('wp_rest'),
    );
}

function blokes_toggle_completion($request) {
    $post_id = intval($request['id']);
    $user_id = get_current_user_id();

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    if (!blokes_is_profile_complete($user_id)) {
        return new WP_Error('profile_incomplete', 'Completa tu perfil antes de registrar un top.', array('status' => 403));
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

        // First Ascent: first person ever to complete this bloke
        $first_ascent = false;
        if ($count === 1) {
            $display_name = get_userdata($user_id)->display_name ?? '';
            $first_name   = explode(' ', trim($display_name))[0];
            update_post_meta($post_id, '_bloke_first_ascent', array(
                'user_id'   => $user_id,
                'name'      => $first_name ?: $display_name,
                'timestamp' => current_time('c'),
            ));
            // Add to user's own first-ascent list
            $my_fa = get_user_meta($user_id, '_blokes_first_ascents', true);
            if (!is_array($my_fa)) $my_fa = array();
            $my_fa[] = $post_id;
            update_user_meta($user_id, '_blokes_first_ascents', $my_fa);
            $first_ascent = true;
        }
    }

    update_user_meta($user_id, '_blokes_completed', $completed_ids);
    update_user_meta($user_id, '_blokes_completion_log', $log);
    update_post_meta($post_id, '_bloke_completion_count', $count);

    $league_update = null;
    if ($completed) {
        $league_update = blokes_register_top_for_leagues($user_id, $post_id);
    }

    return array(
        'completed'    => $completed,
        'count'        => $count,
        'first_ascent' => isset($first_ascent) ? $first_ascent : false,
        'league'       => $league_update,
    );
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

function blokes_upload_image($request) {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $files = $request->get_file_params();
    if (empty($files['file'])) {
        return new WP_Error('no_file', 'No file uploaded.', array('status' => 400));
    }

    $upload = wp_handle_upload($files['file'], array('test_form' => false));
    if (isset($upload['error'])) {
        return new WP_Error('upload_error', $upload['error'], array('status' => 500));
    }

    $admins    = get_users(array('role' => 'administrator', 'number' => 1, 'fields' => 'ID'));
    $author_id = !empty($admins) ? (int) $admins[0] : 1;

    $attachment_id = wp_insert_attachment(array(
        'post_mime_type' => $upload['type'],
        'post_title'     => sanitize_file_name(basename($upload['file'])),
        'post_content'   => '',
        'post_status'    => 'inherit',
        'post_author'    => $author_id,
    ), $upload['file']);

    if (is_wp_error($attachment_id)) return $attachment_id;

    wp_update_attachment_metadata($attachment_id, wp_generate_attachment_metadata($attachment_id, $upload['file']));

    $thumb = wp_get_attachment_thumb_url($attachment_id) ?: wp_get_attachment_url($attachment_id);

    return rest_ensure_response(array(
        'id'           => $attachment_id,
        'source_url'   => wp_get_attachment_url($attachment_id),
        'media_details' => array(
            'sizes' => array(
                'thumbnail' => array('source_url' => $thumb),
            ),
        ),
    ));
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
    if ($user_id <= 0 || $test_id < 2 || $test_id > 13 || $value_kg < 0) {
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

function progreso_get_mock_values() {
    $defaults = [
         2 => 14.1,  9 =>  8.0, 10 => 110.0, 12 => 75.0,
         3 =>  3.5,  4 => 16.0,  7 => 45.0,
         5 =>  4.0,  6 => 24.0, 13 => 24.0,
    ];
    $stored = get_option('blokes_training_mock_values', null);
    return ($stored !== null && is_array($stored)) ? $stored : $defaults;
}

function progreso_generate_all_mock() {
    $jitter_map = [
        'A' => [0.00, -0.04,  0.03, -0.02,  0.01,  0.02, -0.03,  0.04, -0.01,  0.02, -0.02,  0.01],
        'B' => [0.00,  0.03, -0.05,  0.02,  0.01, -0.02,  0.04, -0.03,  0.01,  0.02, -0.01,  0.03],
        'C' => [0.00, -0.02,  0.04, -0.03,  0.02,  0.01, -0.04,  0.03, -0.01, -0.02,  0.03, -0.01],
        'D' => [0.00,  0.02, -0.03,  0.04, -0.01, -0.01,  0.03, -0.04,  0.02,  0.01, -0.02,  0.03],
    ];
    $jitter_key_map = [
         2 => 'B',  9 => 'C', 10 => 'D', 12 => 'B',
         3 => 'C',  4 => 'D',  7 => 'A',
         5 => 'C',  6 => 'D', 13 => 'A',
    ];
    $months = [];
    $d   = new DateTime('2026-01-01');
    $end = new DateTime('first day of this month');
    while ($d <= $end) {
        $months[] = $d->format('Y-m');
        $d->modify('+1 month');
    }
    $n = count($months);
    $result = [];
    foreach (progreso_get_mock_values() as $test_id => $ref) {
        $tid = intval($test_id);
        $ref = floatval($ref);
        $key = $jitter_key_map[$tid] ?? 'A';
        $pat = $jitter_map[$key];
        $sv  = $ref * 0.88;
        $months_data = [];
        foreach ($months as $i => $month) {
            $trend  = ($n > 1) ? $sv + ($ref - $sv) * ($i / ($n - 1)) : $ref;
            $jitter = ($i === $n - 1) ? 0.0 : $ref * ($pat[$i % count($pat)] ?? 0.0);
            $months_data[$month] = ['avg_kg' => round($trend + $jitter, 1)];
        }
        $result[$tid] = $months_data;
    }
    return $result;
}

function progreso_get_training_tests() {
    $default = array(
        array('id' => 2,  'name' => 'Sentadilla en silla', 'unit' => 'reps',   'zone' => 'lower',
              'desc' => 'Nº máximas repeticiones en 30 seg con brazos cruzados en hombros.'),
        array('id' => 9,  'name' => 'Rodillas al pecho',   'unit' => 'reps',   'zone' => 'lower',
              'desc' => 'Nº repeticiones colgados en barra subiendo las piernas hasta 90º.'),
        array('id' => 10, 'name' => 'Apertura caderas',    'unit' => 'cm',     'zone' => 'lower',
              'desc' => 'De pie, piernas abiertas al máximo. Medimos distancia entre pies.'),
        array('id' => 12, 'name' => 'Grant Foot Raise',    'unit' => 'cm',     'zone' => 'lower',
              'desc' => 'De pie mirando a la pared, pies separados de ella y palmas apoyadas a la altura de los hombros. Subimos un pie por la línea de la pared tocando con los dedos. 3 intentos, medimos la distancia al suelo en el mejor.'),
        array('id' => 3,  'name' => 'Dominadas',           'unit' => 'reps',   'zone' => 'upper',
              'desc' => 'Nº máximas repeticiones.'),
        array('id' => 4,  'name' => 'Flexiones',           'unit' => 'reps',   'zone' => 'upper',
              'desc' => 'Nº máximas repeticiones tocando el suelo con el pecho.'),
        array('id' => 7,  'name' => 'Campus',              'unit' => 'cm',     'zone' => 'upper',
              'desc' => '3 intentos, marcamos la altura máxima alcanzada con ambas manos.'),
        array('id' => 5,  'name' => 'Resis. Flex. Prof.',  'unit' => 'series', 'zone' => 'fingers',
              'desc' => 'Nº series completadas en 7 seg. de suspensión, 3 seg. de descanso. Regleta 20mm. Postura estandarizada: brazo extendido por encima de la cabeza, hombro activo, medio-crimp, pulgar fuera de la regleta.'),
        array('id' => 6,  'name' => 'Kg Max Derecha',      'unit' => 'kg',     'zone' => 'fingers',
              'desc' => 'En posición caballero (una rodilla en el suelo, la otra levantada) medimos la fuerza máxima del brazo homolateral a la rodilla apoyada en el suelo.'),
        array('id' => 13, 'name' => 'Kg Max Izquierda',    'unit' => 'kg',     'zone' => 'fingers',
              'desc' => 'Igual que Kg Max Derecha, invirtiendo la postura (la otra rodilla apoyada) para medir el brazo contrario.'),
    );
    $stored = get_option('blokes_training_tests', null);
    $tests  = ($stored !== null && is_array($stored)) ? $stored : $default;
    return rest_ensure_response(array('success' => true, 'data' => array(
        'tests'       => $tests,
        'mock_values' => progreso_get_mock_values(),
    )));
}

function progreso_save_training_tests($request) {
    $tests = $request->get_param('tests');
    if (!is_array($tests)) {
        return new WP_Error('invalid_data', 'El parámetro tests debe ser un array.', array('status' => 400));
    }
    $sanitized = array();
    foreach ($tests as $t) {
        if (!isset($t['id'], $t['name'], $t['unit'], $t['zone'])) continue;
        $sanitized[] = array(
            'id'   => intval($t['id']),
            'name' => sanitize_text_field($t['name']),
            'unit' => sanitize_text_field($t['unit']),
            'zone' => sanitize_text_field($t['zone']),
            'desc' => isset($t['desc']) ? sanitize_textarea_field($t['desc']) : '',
        );
    }
    update_option('blokes_training_tests', $sanitized, false);
    $raw_mock = $request->get_param('mock_values');
    if (is_array($raw_mock)) {
        $sanitized_mock = [];
        foreach ($raw_mock as $k => $v) {
            $tid = intval($k);
            if ($tid > 0) $sanitized_mock[$tid] = floatval($v);
        }
        update_option('blokes_training_mock_values', $sanitized_mock, false);
    }
    return rest_ensure_response(array('success' => true, 'data' => array(
        'tests'       => $sanitized,
        'mock_values' => progreso_get_mock_values(),
    )));
}

// ── Professors ────────────────────────────────────────────────────────────

function progreso_get_professors_config() {
    $default = array(
        'alvaro' => array(
            'email'    => 'alvilu2@hotmail.com',
            'color'    => '#60a5fa',
            'role'     => 'Instructor',
            'schedule' => array(
                array('day'=>'lunes',     'time'=>'18:00'), array('day'=>'lunes',     'time'=>'19:30'),
                array('day'=>'martes',    'time'=>'14:00'), array('day'=>'martes',    'time'=>'16:30'),
                array('day'=>'martes',    'time'=>'18:00'), array('day'=>'martes',    'time'=>'19:30'),
                array('day'=>'miercoles', 'time'=>'18:00'), array('day'=>'miercoles', 'time'=>'19:30'),
                array('day'=>'jueves',    'time'=>'14:00'), array('day'=>'jueves',    'time'=>'16:30'),
                array('day'=>'jueves',    'time'=>'18:00'), array('day'=>'jueves',    'time'=>'19:30'),
            ),
        ),
        'sigurd' => array(
            'email'    => 'sigurdbaum@yahoo.es',
            'color'    => '#a78bfa',
            'role'     => 'Instructor',
            'schedule' => array(
                array('day'=>'martes', 'time'=>'17:30'), array('day'=>'martes', 'time'=>'19:00'), array('day'=>'martes', 'time'=>'20:30'),
                array('day'=>'jueves', 'time'=>'17:30'), array('day'=>'jueves', 'time'=>'19:00'), array('day'=>'jueves', 'time'=>'20:30'),
            ),
        ),
        'lucia' => array(
            'email'    => 'luciapcaas@gmail.com',
            'color'    => '#f472b6',
            'role'     => 'Instructora',
            'schedule' => array(
                array('day'=>'lunes',     'time'=>'17:30'), array('day'=>'lunes',     'time'=>'19:00'),
                array('day'=>'miercoles', 'time'=>'17:30'), array('day'=>'miercoles', 'time'=>'19:00'),
            ),
        ),
        'sara' => array(
            'email'    => 'sara.coronadosanz@gmail.com',
            'color'    => '#34d399',
            'role'     => 'Instructora',
            'schedule' => array(
                array('day'=>'martes', 'time'=>'09:00'), array('day'=>'martes', 'time'=>'10:30'), array('day'=>'martes', 'time'=>'12:00'),
                array('day'=>'jueves', 'time'=>'09:00'), array('day'=>'jueves', 'time'=>'10:30'), array('day'=>'jueves', 'time'=>'12:00'),
            ),
        ),
        'ana' => array(
            'email'    => 'ana.llorenteg03@gmail.com',
            'color'    => '#fb923c',
            'role'     => 'Instructora',
            'schedule' => array(
                array('day'=>'lunes',     'time'=>'20:30'),
                array('day'=>'miercoles', 'time'=>'20:30'),
                array('day'=>'viernes',   'time'=>'19:00'),
            ),
        ),
        'eva' => array(
            'email'    => 'rocomadridgestion@gmail.com',
            'color'    => '#f5c842',
            'role'     => 'Coordinadora',
            'schedule' => array(
                array('day'=>'martes', 'time'=>'17:30'), array('day'=>'martes', 'time'=>'18:30'),
                array('day'=>'jueves', 'time'=>'17:30'), array('day'=>'jueves', 'time'=>'18:30'),
                array('day'=>'viernes','time'=>'18:00'), array('day'=>'viernes','time'=>'19:00'),
            ),
        ),
    );
    $stored = get_option('blokes_training_professors', null);
    return ($stored !== null && is_array($stored)) ? $stored : $default;
}

function progreso_build_professor_entry($slug, $cfg) {
    $user  = get_user_by('email', $cfg['email']);
    $name  = $user ? $user->display_name : ucfirst($slug);
    $photo = $user ? get_avatar_url($user->ID, array('size' => 400)) : '';
    $bio   = $user ? $user->description : '';
    return array(
        'slug'           => $slug,
        'name'           => $name,
        'photo'          => $photo,
        'bio'            => $bio,
        'color'          => $cfg['color'],
        'role'           => $cfg['role'],
        'classesPerWeek' => count($cfg['schedule']),
        'schedule'       => $cfg['schedule'],
    );
}

function progreso_get_professor_student_ids($schedule) {
    if (!class_exists('RocoMadrid_SF_Stats')) return array();
    $day_map = array(
        'lunes'=>'lunes','martes'=>'martes','miércoles'=>'miercoles','miercoles'=>'miercoles',
        'jueves'=>'jueves','viernes'=>'viernes','sábado'=>'sabado','sabado'=>'sabado',
    );
    $slot_times = array();
    foreach ($schedule as $slot) {
        $slot_times[$slot['day']][] = $slot['time'];
    }
    $user_ids = array();
    foreach (RocoMadrid_SF_Stats::get_all_subscription_data() as $sub) {
        if ($sub['status'] !== 'active') continue;
        $sub_days  = array_map(function($d) use ($day_map) {
            return $day_map[mb_strtolower(trim($d))] ?? mb_strtolower(trim($d));
        }, explode('-', $sub['dia'] ?? ''));
        $sub_start = trim(explode('-', $sub['horario'] ?? '')[0]);
        $match = false;
        foreach ($sub_days as $day) {
            if (isset($slot_times[$day]) && in_array($sub_start, $slot_times[$day])) {
                $match = true; break;
            }
        }
        if (!$match) continue;
        $uid = intval(get_post_meta($sub['id'], '_customer_user', true));
        if (!$uid && !empty($sub['email'])) { $u = get_user_by('email', $sub['email']); if ($u) $uid = $u->ID; }
        if ($uid > 0) $user_ids[] = $uid;
    }
    return array_values(array_unique($user_ids));
}

function progreso_get_group_stats($user_ids) {
    global $wpdb;
    progreso_ensure_training_table();
    $by_test = array();
    if (!empty($user_ids)) {
        $ids   = array_map('intval', $user_ids);
        $in_sq = implode(',', $ids);
        $since = date('Y-m-d', strtotime('-12 months'));
        $rows  = $wpdb->get_results($wpdb->prepare(
            "SELECT test_id, DATE_FORMAT(logged_at,'%%Y-%%m') AS month,
                    AVG(value_kg) AS avg_kg, COUNT(DISTINCT user_id) AS user_count
             FROM " . progreso_training_table() . "
             WHERE user_id IN ($in_sq) AND logged_at >= %s
             GROUP BY test_id, month ORDER BY test_id ASC, month ASC",
            $since
        ), ARRAY_A);
        foreach ($rows as $row) {
            $tid = intval($row['test_id']);
            $by_test[$tid][$row['month']] = array(
                'avg_kg'     => round(floatval($row['avg_kg']), 2),
                'user_count' => intval($row['user_count']),
            );
        }
    }
    foreach (progreso_generate_all_mock() as $tid => $mock_months) {
        foreach ($mock_months as $month => $val) {
            if (!isset($by_test[$tid][$month])) $by_test[$tid][$month] = $val;
        }
    }
    return $by_test;
}

function progreso_get_professors() {
    $config = progreso_get_professors_config();
    $list   = array();
    foreach ($config as $slug => $cfg) $list[] = progreso_build_professor_entry($slug, $cfg);
    return rest_ensure_response(array('success' => true, 'data' => $list));
}

function progreso_get_professor_detail($request) {
    $slug   = sanitize_title($request['slug']);
    $config = progreso_get_professors_config();
    if (!isset($config[$slug])) return new WP_Error('not_found', 'Profesor no encontrado.', array('status' => 404));
    $cfg         = $config[$slug];
    $profile     = progreso_build_professor_entry($slug, $cfg);
    $student_ids = progreso_get_professor_student_ids($cfg['schedule']);
    $group_stats = progreso_get_group_stats($student_ids);
    return rest_ensure_response(array('success' => true, 'data' => array_merge($profile, array(
        'students'   => array('total' => count($student_ids)),
        'groupStats' => array('tests' => $group_stats),
    ))));
}

function progreso_get_training_me() {
    global $wpdb;
    progreso_ensure_training_table();
    $user_id = get_current_user_id();
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

function progreso_delete_training_entry($request) {
    global $wpdb;
    $id  = intval($request['id']);
    $row = $wpdb->get_row($wpdb->prepare(
        'SELECT id FROM ' . progreso_training_table() . ' WHERE id = %d', $id
    ));
    if (!$row) {
        return new WP_Error('not_found', 'Registro no encontrado', array('status' => 404));
    }
    $wpdb->delete(progreso_training_table(), array('id' => $id), array('%d'));
    return rest_ensure_response(array('success' => true, 'deleted_id' => $id));
}

function progreso_delete_all_training() {
    global $wpdb;
    $wpdb->query('TRUNCATE TABLE ' . progreso_training_table());
    return rest_ensure_response(array('success' => true, 'message' => 'Todos los registros de entrenamiento eliminados'));
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
    // Fill months with no real data using mock (real data wins per month)
    foreach (progreso_generate_all_mock() as $tid => $mock_months) {
        foreach ($mock_months as $month => $mock_val) {
            if (!isset($by_test[$tid][$month])) {
                $by_test[$tid][$month] = $mock_val;
            }
        }
    }

    // testMonths: Dic, Mar, Jun de la temporada actual (Sep–Jun)
    $sy = (intval(date('n')) >= 9) ? intval(date('Y')) : intval(date('Y')) - 1;
    $test_months = [ $sy . '-12', ($sy + 1) . '-03', ($sy + 1) . '-06' ];

    return rest_ensure_response(array('success' => true, 'data' => array(
        'tests'      => $by_test,
        'testMonths' => $test_months,
    )));
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

        $avatar = blokes_get_user_avatar($uid);
        $members[] = array(
            'is_me'          => ($uid === $me),
            'user_id'        => $uid,
            'name'           => $name,
            'nickname'       => get_user_meta($uid, '_blokes_nickname', true) ?: '',
            'avatarType'     => $avatar['type'],
            'avatarData'     => $avatar['data'],
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

    // Recent completions: last 7 days, classmates only (excluding self)
    $cutoff = time() - 7 * 24 * 60 * 60;
    $recent_counts = array();
    foreach (array_keys($uid_to_name) as $uid) {
        if ($uid === $me) continue;
        $log = get_user_meta($uid, '_blokes_completion_log', true);
        if (!is_array($log)) continue;
        foreach ($log as $entry) {
            $ts = strtotime($entry['timestamp'] ?? '');
            if (!$ts || $ts < $cutoff) continue;
            $pid = intval($entry['postId'] ?? 0);
            if ($pid > 0) $recent_counts[$pid] = ($recent_counts[$pid] ?? 0) + 1;
        }
    }
    arsort($recent_counts);

    // Fetch post data for both in a single blog context switch
    $top_blokes = array();
    $recent_completions = array();
    switch_to_blog(get_main_site_id());
    foreach (array_slice($bloke_counts, 0, 8, true) as $pid => $count) {
        $title = get_the_title($pid);
        $color = sanitize_text_field(get_field('bloke_color', $pid) ?: 'green');
        if ($title) $top_blokes[] = array('post_id' => $pid, 'title' => $title, 'color' => $color, 'count' => $count);
    }
    foreach (array_slice($recent_counts, 0, 10, true) as $pid => $count) {
        $title = get_the_title($pid);
        $color = sanitize_text_field(get_field('bloke_color', $pid) ?: 'green');
        if ($title) $recent_completions[] = array('post_id' => $pid, 'title' => $title, 'color' => $color, 'count' => $count);
    }
    restore_current_blog();

    return rest_ensure_response(array('data' => array(
        'class'              => array('dia' => $dia, 'horario' => $horario),
        'members'            => $members,
        'top_blokes'         => $top_blokes,
        'recent_completions' => $recent_completions,
    )));
}

// ============================================================
//  Superadmin callbacks
// ============================================================

/**
 * Helper: query completed WooCommerce orders on the current blog.
 * Returns array of ['month' => 'YYYY-MM', 'total' => float, 'items' => [['name','qty','line']] ].
 */
function _superadmin_orders_for_blog($start_date) {
    if (!function_exists('wc_get_orders')) return array();
    $ids = wc_get_orders(array(
        'status'     => array('wc-completed', 'wc-processing'),
        'date_after' => $start_date,
        'limit'      => -1,
        'return'     => 'ids',
    ));
    $cat_cache = array();
    $rows = array();
    foreach ($ids as $oid) {
        $order = wc_get_order($oid);
        if (!$order) continue;
        $dt = $order->get_date_created();
        if (!$dt) continue;
        $month = $dt->format('Y-m');
        $row   = array('month' => $month, 'total' => floatval($order->get_total()), 'tax' => floatval($order->get_total_tax()), 'items' => array());
        foreach ($order->get_items() as $item) {
            $cat     = '';
            $product = $item->get_product();
            if ($product) {
                $pid = $product->get_parent_id() ?: $product->get_id();
                if (!array_key_exists($pid, $cat_cache)) {
                    $terms = get_the_terms($pid, 'product_cat');
                    $cat_cache[$pid] = ($terms && !is_wp_error($terms)) ? $terms[0]->name : '';
                }
                $cat = $cat_cache[$pid];
            }
            $row['items'][] = array(
                'name'     => $item->get_name(),
                'qty'      => intval($item->get_quantity()),
                'revenue'  => floatval($item->get_subtotal()),
                'category' => $cat,
            );
        }
        $rows[] = $row;
    }
    return $rows;
}

function superadmin_revenue($request) {
    $months     = max(1, min(60, intval($request->get_param('months'))));
    $start_date = (new DateTime("-{$months} months"))->format('Y-m-d');

    $exclude_transfer  = (bool) $request->get_param('exclude_transfer');

    $by_month = array();

    foreach (array(1 => 'store1', 3 => 'store2') as $blog_id => $key) {
        switch_to_blog($blog_id);
        $orders = _superadmin_orders_for_blog($start_date);
        restore_current_blog();
        foreach ($orders as $row) {
            if (!isset($by_month[$row['month']])) {
                $by_month[$row['month']] = array('month' => $row['month'], 'store1' => 0.0, 'store2' => 0.0, 'store1_tax' => 0.0);
            }
            $amount = $row['total'];
            if ($key === 'store1') {
                // IVA always includes the full amount (Uso de Rocódromo included)
                $by_month[$row['month']]['store1_tax'] += $row['tax'];
                if ($exclude_transfer) {
                    foreach ($row['items'] as $item) {
                        // Normalize to ASCII so accent encoding differences don't break the match
                        $name_ascii = function_exists('iconv')
                            ? strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $item['name']))
                            : strtolower($item['name']);
                        if (strpos($name_ascii, 'rocodromo') !== false) {
                            $amount -= $item['revenue'];
                        }
                    }
                }
            }
            $by_month[$row['month']][$key] += $amount;
        }
    }

    ksort($by_month);
    $data = array();
    foreach ($by_month as $row) {
        $row['total']      = round($row['store1'] + $row['store2'], 2);
        $row['store1']     = round($row['store1'], 2);
        $row['store2']     = round($row['store2'], 2);
        $row['store1_tax'] = round($row['store1_tax'], 2);
        $data[] = $row;
    }
    return rest_ensure_response(array('data' => $data));
}

function superadmin_products($request) {
    $months     = max(1, min(60, intval($request->get_param('months'))));
    $start_date = (new DateTime("-{$months} months"))->format('Y-m-d');

    $products = array(); // "blog_id|name" => [name, store, units, revenue, history]

    foreach (array(1 => 'Principal', 3 => 'Club') as $blog_id => $store_label) {
        switch_to_blog($blog_id);
        $orders = _superadmin_orders_for_blog($start_date);
        restore_current_blog();
        foreach ($orders as $row) {
            foreach ($row['items'] as $item) {
                $key = $blog_id . '|' . $item['name'];
                if (!isset($products[$key])) {
                    $products[$key] = array(
                        'name'     => $item['name'],
                        'store'    => $store_label,
                        'category' => $item['category'] ?? '',
                        'units'    => 0,
                        'revenue'  => 0.0,
                        'history'  => array(),
                    );
                }
                $products[$key]['units']   += $item['qty'];
                $products[$key]['revenue'] += $item['revenue'];
                $m = $row['month'];
                if (!isset($products[$key]['history'][$m])) {
                    $products[$key]['history'][$m] = array('month' => $m, 'units' => 0, 'revenue' => 0.0);
                }
                $products[$key]['history'][$m]['units']   += $item['qty'];
                $products[$key]['history'][$m]['revenue'] += $item['revenue'];
            }
        }
    }

    $data = array_values($products);
    foreach ($data as &$p) {
        ksort($p['history']);
        $p['history'] = array_values($p['history']);
        $p['revenue'] = round($p['revenue'], 2);
    }
    usort($data, function($a, $b) { return $b['revenue'] <=> $a['revenue']; });

    return rest_ensure_response(array('data' => $data));
}

function superadmin_classes($request) {
    $months   = max(1, min(60, intval($request->get_param('months'))));
    $start_dt = new DateTime("-{$months} months");
    $start_ym = $start_dt->format('Y-m');
    $now_ym   = date('Y-m');

    // Build ordered list of months in the requested range
    $months_range = array();
    $iter = new DateTime($start_ym . '-01');
    while ($iter->format('Y-m') <= $now_ym) {
        $months_range[] = $iter->format('Y-m');
        $iter->modify('+1 month');
    }

    switch_to_blog(3);

    $classes = array();

    if (class_exists('RocoMadrid_SF_Stats')) {
        $all = RocoMadrid_SF_Stats::get_all_subscription_data();
        foreach ($all as $sub) {
            $edad      = sanitize_text_field($sub['edad'] ?? '') ?: 'Adultos';
            $class_key = ($sub['dia'] ?? '') . '|' . ($sub['horario'] ?? '') . '|' . $edad;
            if (!$sub['dia'] && !$sub['horario']) continue;
            if (!isset($classes[$class_key])) {
                $classes[$class_key] = array(
                    'label'           => ($sub['dia'] ?? '') . ' · ' . ($sub['horario'] ?? ''),
                    'dia'             => $sub['dia'] ?? '',
                    'horario'         => $sub['horario'] ?? '',
                    'edad'            => $edad,
                    'active'          => 0,
                    'all'             => 0,
                    'history'         => array(),
                    'members_active'  => array(),
                    'members_pending' => array(),
                    'members_lost'    => array(),
                );
            }
            $classes[$class_key]['all']++;
            $member_name  = $sub['cliente']  ?? '';
            $member_phone = $sub['telefono'] ?? '';

            // Per-month active snapshot using subscription start/end dates
            if (function_exists('wcs_get_subscription') && !empty($sub['id'])) {
                $sub_obj = wcs_get_subscription(intval($sub['id']));
                if (!$sub_obj) continue;
                if (empty($member_phone)) {
                    $member_phone = $sub_obj->get_billing_phone() ?: '';
                }

                if ($sub['status'] === 'active') {
                    $classes[$class_key]['active']++;
                    $classes[$class_key]['members_active'][] = array('name' => $member_name, 'phone' => $member_phone, 'new' => false);
                } elseif (in_array($sub['status'], array('on-hold', 'pending'))) {
                    $classes[$class_key]['members_pending'][] = array('name' => $member_name, 'phone' => $member_phone);
                }

                $dt_created = $sub_obj->get_date_created();
                if (!$dt_created) continue;

                $sub_start_ym = $dt_created->format('Y-m');

                if ($sub['status'] === 'active') {
                    $sub_end_ym = $now_ym;
                    // Mark as new if subscription started this month
                    if ($sub_start_ym >= $now_ym) {
                        $idx = count($classes[$class_key]['members_active']) - 1;
                        if ($idx >= 0) $classes[$class_key]['members_active'][$idx]['new'] = true;
                    }
                } else {
                    $end_ts     = $sub_obj->get_time('cancelled') ?: $sub_obj->get_time('end');
                    $sub_end_ym = $end_ts ? date('Y-m', $end_ts) : $sub_start_ym;
                    // Track recently lost: cancelled within last 2 months
                    $two_months_ago = date('Y-m', strtotime('-2 months'));
                    if ($sub_end_ym >= $two_months_ago && !in_array($sub['status'], array('on-hold', 'pending'))) {
                        $classes[$class_key]['members_lost'][] = array('name' => $member_name, 'phone' => $member_phone);
                    }
                }

                // New enrollment (if start falls in requested range)
                if ($sub_start_ym >= $start_ym) {
                    if (!isset($classes[$class_key]['history'][$sub_start_ym])) {
                        $classes[$class_key]['history'][$sub_start_ym] = array('month' => $sub_start_ym, 'new' => 0, 'active' => 0);
                    }
                    $classes[$class_key]['history'][$sub_start_ym]['new']++;
                }

                // Active count for every month the subscription overlaps with the range
                foreach ($months_range as $ym) {
                    if ($ym >= $sub_start_ym && $ym <= $sub_end_ym) {
                        if (!isset($classes[$class_key]['history'][$ym])) {
                            $classes[$class_key]['history'][$ym] = array('month' => $ym, 'new' => 0, 'active' => 0);
                        }
                        $classes[$class_key]['history'][$ym]['active']++;
                    }
                }
            }
        }
    }

    restore_current_blog();

    $data = array_values($classes);
    foreach ($data as &$c) {
        ksort($c['history']);
        $c['history'] = array_values($c['history']);
    }
    usort($data, function($a, $b) { return $b['active'] <=> $a['active']; });

    return rest_ensure_response(array('data' => $data));
}

// ============================================================
//  SISTEMA DE LIGAS
// ============================================================

// ── Instalación de tablas ─────────────────────────────────────
add_action('plugins_loaded', function() {
    if (get_option('blokes_leagues_db_version') !== '1.0') {
        blokes_leagues_create_tables();
        blokes_leagues_seed();
        update_option('blokes_leagues_db_version', '1.0');
    }
});

function blokes_leagues_create_tables() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    dbDelta("CREATE TABLE IF NOT EXISTS {$wpdb->prefix}blokes_leagues (
        id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
        name         VARCHAR(64)       NOT NULL,
        slug         VARCHAR(32)       NOT NULL,
        tier         TINYINT UNSIGNED  NOT NULL,
        promo_pct    FLOAT             NOT NULL DEFAULT 0.30,
        demotion_pct FLOAT             NOT NULL DEFAULT 0.20,
        PRIMARY KEY (id),
        UNIQUE KEY tier (tier)
    ) $charset;");

    dbDelta("CREATE TABLE IF NOT EXISTS {$wpdb->prefix}blokes_user_leagues (
        id             INT UNSIGNED      NOT NULL AUTO_INCREMENT,
        user_id        BIGINT UNSIGNED   NOT NULL,
        league_id      SMALLINT UNSIGNED NOT NULL,
        total_points   INT               NOT NULL DEFAULT 0,
        rank_in_league INT               NOT NULL DEFAULT 1,
        zone           ENUM('promotion','stay','demotion') NOT NULL DEFAULT 'stay',
        joined_at      DATETIME          NOT NULL,
        last_updated   DATETIME          NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY user_id (user_id),
        KEY league_points (league_id, total_points)
    ) $charset;");

    dbDelta("CREATE TABLE IF NOT EXISTS {$wpdb->prefix}blokes_league_events (
        id                   INT UNSIGNED      NOT NULL AUTO_INCREMENT,
        user_id              BIGINT UNSIGNED   NOT NULL,
        event_type           ENUM('promoted','demoted','top_scored') NOT NULL,
        from_league_id       SMALLINT UNSIGNED,
        to_league_id         SMALLINT UNSIGNED,
        points_at_event      INT               NOT NULL DEFAULT 0,
        triggered_by_user_id BIGINT UNSIGNED,
        created_at           DATETIME          NOT NULL,
        seen                 TINYINT(1)        NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        KEY user_seen (user_id, seen)
    ) $charset;");
}

function blokes_leagues_seed() {
    global $wpdb;
    $table = $wpdb->prefix . 'blokes_leagues';
    if ((int) $wpdb->get_var("SELECT COUNT(*) FROM $table") > 0) return;

    $leagues = array(
        array('Liga Pedri',      'pedri',      1),
        array('Liga Albarracín', 'albarracin', 2),
        array('Liga Fonte',      'fonte',      3),
        array('Liga Yosemite',   'yosemite',   4),
        array('Liga Hueco',      'hueco',      5),
        array('Liga Rocklands',  'rocklands',  6),
    );
    foreach ($leagues as $lg) {
        $wpdb->insert($table, array(
            'name'         => $lg[0],
            'slug'         => $lg[1],
            'tier'         => $lg[2],
            'promo_pct'    => 0.30,
            'demotion_pct' => 0.20,
        ));
    }
}

// ── Cálculo de puntos ─────────────────────────────────────────
function blokes_calculate_points($post_id) {
    $color = strtolower(sanitize_text_field(get_field('bloke_color', $post_id) ?: 'green'));
    $grado = strtolower(sanitize_text_field(get_field('bloke_grado', $post_id) ?: 'medio'));

    $color_base  = array('green' => 0, 'blue' => 3, 'yellow' => 6, 'red' => 9, 'black' => 12);
    $grado_bonus = array('suave' => 1, 'medio' => 2, 'duro' => 3);

    return ($color_base[$color] ?? 0) + ($grado_bonus[$grado] ?? 2);
}

// ── Lógica principal ──────────────────────────────────────────

function blokes_register_top_for_leagues($user_id, $post_id) {
    global $wpdb;
    $ul = $wpdb->prefix . 'blokes_user_leagues';
    $l  = $wpdb->prefix . 'blokes_leagues';

    $pts = blokes_calculate_points($post_id);
    if ($pts <= 0) return null;

    $wpdb->query('START TRANSACTION');

    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM $ul WHERE user_id = %d FOR UPDATE", $user_id
    ));

    if (!$row) {
        $pedri = $wpdb->get_row("SELECT * FROM $l WHERE tier = 1");
        if (!$pedri) { $wpdb->query('ROLLBACK'); return null; }

        $wpdb->insert($ul, array(
            'user_id'        => $user_id,
            'league_id'      => $pedri->id,
            'total_points'   => $pts,
            'rank_in_league' => 9999,
            'zone'           => 'stay',
            'joined_at'      => current_time('mysql'),
            'last_updated'   => current_time('mysql'),
        ));
        $wpdb->query('COMMIT');
        blokes_recalculate_league_ranks((int) $pedri->id);
        blokes_check_tier_overflow((int) $pedri->id);
        return array('pointsEarned' => $pts, 'newTotal' => $pts, 'leagueChanged' => false);
    }

    $new_total = (int) $row->total_points + $pts;
    $wpdb->update($ul,
        array('total_points' => $new_total, 'last_updated' => current_time('mysql')),
        array('user_id' => $user_id)
    );
    $wpdb->query('COMMIT');

    $change = blokes_evaluate_league_change((int) $user_id, $new_total, (int) $row->league_id);
    return array(
        'pointsEarned'  => $pts,
        'newTotal'      => $new_total,
        'leagueChanged' => $change['changed'],
        'newLeague'     => $change['newLeague'] ?? null,
    );
}

function blokes_evaluate_league_change($user_id, $new_points, $current_league_id) {
    global $wpdb;
    $ul = $wpdb->prefix . 'blokes_user_leagues';
    $l  = $wpdb->prefix . 'blokes_leagues';
    $ev = $wpdb->prefix . 'blokes_league_events';

    $current = $wpdb->get_row($wpdb->prepare("SELECT * FROM $l WHERE id = %d", $current_league_id));
    if (!$current || (int) $current->tier >= 6) {
        blokes_recalculate_league_ranks($current_league_id);
        return array('changed' => false);
    }

    $next = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM $l WHERE tier = %d", (int) $current->tier + 1
    ));
    if (!$next) { blokes_recalculate_league_ranks($current_league_id); return array('changed' => false); }

    $wpdb->query('START TRANSACTION');

    $weakest = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM $ul WHERE league_id = %d ORDER BY total_points ASC, rank_in_league DESC LIMIT 1 FOR UPDATE",
        $next->id
    ));

    if (!$weakest || $new_points <= (int) $weakest->total_points) {
        $wpdb->query('ROLLBACK');
        blokes_recalculate_league_ranks($current_league_id);
        return array('changed' => false);
    }

    // Swap atómico
    $wpdb->update($ul, array('league_id' => $next->id,           'last_updated' => current_time('mysql')), array('user_id' => $user_id));
    $wpdb->update($ul, array('league_id' => $current_league_id, 'last_updated' => current_time('mysql')), array('user_id' => $weakest->user_id));

    $now = current_time('mysql');
    $wpdb->insert($ev, array(
        'user_id'              => $user_id,
        'event_type'           => 'promoted',
        'from_league_id'       => $current_league_id,
        'to_league_id'         => $next->id,
        'points_at_event'      => $new_points,
        'triggered_by_user_id' => null,
        'created_at'           => $now,
        'seen'                 => 0,
    ));
    $wpdb->insert($ev, array(
        'user_id'              => $weakest->user_id,
        'event_type'           => 'demoted',
        'from_league_id'       => $next->id,
        'to_league_id'         => $current_league_id,
        'points_at_event'      => (int) $weakest->total_points,
        'triggered_by_user_id' => $user_id,
        'created_at'           => $now,
        'seen'                 => 0,
    ));

    $wpdb->query('COMMIT');

    blokes_recalculate_league_ranks($current_league_id);
    blokes_recalculate_league_ranks((int) $next->id);

    return array(
        'changed'  => true,
        'newLeague' => array('id' => (int) $next->id, 'name' => $next->name, 'tier' => (int) $next->tier),
    );
}

function blokes_recalculate_league_ranks($league_id) {
    global $wpdb;
    $ul      = $wpdb->prefix . 'blokes_user_leagues';
    $members = $wpdb->get_results($wpdb->prepare(
        "SELECT user_id FROM $ul WHERE league_id = %d ORDER BY total_points DESC", $league_id
    ));
    foreach ($members as $i => $m) {
        $wpdb->update($ul, array('rank_in_league' => $i + 1, 'zone' => 'stay'), array('user_id' => $m->user_id));
    }
}

// Promotes the top user out of a tier when it exceeds max 4.
// Cascades upward until no tier overflows.
function blokes_check_tier_overflow($league_id) {
    global $wpdb;
    $ul  = $wpdb->prefix . 'blokes_user_leagues';
    $l   = $wpdb->prefix . 'blokes_leagues';
    $ev  = $wpdb->prefix . 'blokes_league_events';
    $max = 4;

    $count = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $ul WHERE league_id = %d", $league_id));
    if ($count <= $max) return;

    $league = $wpdb->get_row($wpdb->prepare("SELECT * FROM $l WHERE id = %d", $league_id));
    if (!$league || (int) $league->tier >= 6) return;

    $next = $wpdb->get_row($wpdb->prepare("SELECT * FROM $l WHERE tier = %d", (int) $league->tier + 1));
    if (!$next) return;

    while ($count > $max) {
        $top = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $ul WHERE league_id = %d ORDER BY total_points DESC LIMIT 1", $league_id
        ));
        if (!$top) break;

        $now = current_time('mysql');
        $wpdb->update($ul, array('league_id' => (int) $next->id, 'last_updated' => $now), array('user_id' => $top->user_id));
        $wpdb->insert($ev, array(
            'user_id'              => (int) $top->user_id,
            'event_type'           => 'promoted',
            'from_league_id'       => (int) $league_id,
            'to_league_id'         => (int) $next->id,
            'points_at_event'      => (int) $top->total_points,
            'triggered_by_user_id' => null,
            'created_at'           => $now,
            'seen'                 => 0,
        ));
        $count--;

        blokes_recalculate_league_ranks((int) $next->id);
        blokes_check_tier_overflow((int) $next->id); // cascade upward if next also overflows
    }

    blokes_recalculate_league_ranks((int) $league_id);
}

// ── REST endpoints de ligas ───────────────────────────────────
add_action('rest_api_init', function() {

    register_rest_route('blokes/v1', '/leagues', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_leagues',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('blokes/v1', '/leagues/me', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_my_league',
        'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('blokes/v1', '/leagues/me/leaderboard', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_my_leaderboard',
        'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('blokes/v1', '/leagues/me/events', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_my_events',
        'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('blokes/v1', '/leagues/me/events/seen', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_api_mark_events_seen',
        'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('blokes/v1', '/leagues/initial-placement', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_api_initial_placement',
        'permission_callback' => function() { return blokes_get_app_role() === 'socio'; },
        'args'                => array(
            'force' => array('type' => 'boolean', 'default' => false),
        ),
    ));

    // ── Listas de acceso (editable por socios) ───────────────────────────────
    register_rest_route('blokes/v1', '/admin/email-lists', array(
        'methods'             => 'PUT',
        'callback'            => 'blokes_api_save_email_lists',
        'permission_callback' => function() { return blokes_get_app_role() === 'socio'; },
    ));

    // ── Perfil de usuario ─────────────────────────────────────────────────────
    register_rest_route('blokes/v1', '/profile/me', array(
        array('methods' => 'GET',  'callback' => 'blokes_api_get_profile',  'permission_callback' => 'is_user_logged_in'),
        array('methods' => 'POST', 'callback' => 'blokes_api_save_profile', 'permission_callback' => 'is_user_logged_in'),
    ));
    register_rest_route('blokes/v1', '/profile/check-nickname', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_check_nickname',
        'permission_callback' => 'is_user_logged_in',
    ));
    register_rest_route('blokes/v1', '/users/(?P<id>\d+)/avatar', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_user_avatar_endpoint',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('blokes/v1', '/completers/(?P<id>\d+)', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_completers',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('blokes/v1', '/profile/upload-avatar', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_api_upload_avatar',
        'permission_callback' => 'is_user_logged_in',
    ));
    register_rest_route('blokes/v1', '/comunidad/leagues', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_comunidad_leagues',
        'permission_callback' => '__return_true',
    ));
});

function blokes_api_get_leagues() {
    global $wpdb;
    $rows = $wpdb->get_results("SELECT id, name, slug, tier FROM {$wpdb->prefix}blokes_leagues ORDER BY tier ASC");
    return rest_ensure_response(array_map(function($r) {
        return array('id' => (int) $r->id, 'name' => $r->name, 'slug' => $r->slug, 'tier' => (int) $r->tier);
    }, $rows ?: array()));
}

function blokes_api_get_my_league() {
    global $wpdb;
    $uid = get_current_user_id();
    $ul  = $wpdb->prefix . 'blokes_user_leagues';
    $l   = $wpdb->prefix . 'blokes_leagues';

    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT ul.total_points, ul.rank_in_league, ul.zone,
                l.id AS league_id, l.name, l.slug, l.tier
         FROM $ul ul JOIN $l l ON l.id = ul.league_id
         WHERE ul.user_id = %d", $uid
    ));

    if (!$row) return new WP_Error('no_league', 'Not placed yet', array('status' => 404));

    return rest_ensure_response(array(
        'leagueId'    => (int) $row->league_id,
        'name'        => $row->name,
        'slug'        => $row->slug,
        'tier'        => (int) $row->tier,
        'totalPoints' => (int) $row->total_points,
        'rank'        => (int) $row->rank_in_league,
        'zone'        => $row->zone,
    ));
}

function blokes_api_get_my_leaderboard() {
    global $wpdb;
    $uid = get_current_user_id();
    $ul  = $wpdb->prefix . 'blokes_user_leagues';

    $league_id = $wpdb->get_var($wpdb->prepare("SELECT league_id FROM $ul WHERE user_id = %d", $uid));
    if (!$league_id) return new WP_Error('no_league', 'Not placed', array('status' => 403));

    $members = $wpdb->get_results($wpdb->prepare(
        "SELECT user_id, total_points, rank_in_league, zone FROM $ul
         WHERE league_id = %d ORDER BY rank_in_league ASC", $league_id
    ));

    $result = array();
    foreach ($members as $m) {
        $u     = get_userdata($m->user_id);
        $first = $u ? trim($u->first_name ?? '') : '';
        $name  = $first ?: ($u ? (explode(' ', trim($u->display_name ?? ''))[0] ?? '') : '');
        $av = blokes_get_user_avatar($m->user_id);
        $result[] = array(
            'userId'      => (int) $m->user_id,
            'name'        => $name ?: 'Usuario',
            'nickname'    => blokes_get_user_nickname($m->user_id),
            'avatarType'  => $av['type'],
            'avatarData'  => $av['data'],
            'totalPoints' => (int) $m->total_points,
            'rank'        => (int) $m->rank_in_league,
            'zone'        => $m->zone,
            'isMe'        => ((int) $m->user_id === (int) $uid),
        );
    }

    return rest_ensure_response(array('leagueId' => (int) $league_id, 'members' => $result));
}

function blokes_api_get_my_events() {
    global $wpdb;
    $uid = get_current_user_id();
    $ev  = $wpdb->prefix . 'blokes_league_events';
    $l   = $wpdb->prefix . 'blokes_leagues';

    $unseen = $wpdb->get_results($wpdb->prepare(
        "SELECT ev.id, ev.event_type, ev.points_at_event, ev.created_at,
                lf.name AS from_league, lf.tier AS from_tier,
                lt.name AS to_league,   lt.tier AS to_tier
         FROM $ev ev
         LEFT JOIN $l lf ON lf.id = ev.from_league_id
         LEFT JOIN $l lt ON lt.id = ev.to_league_id
         WHERE ev.user_id = %d AND ev.seen = 0 AND ev.event_type IN ('promoted','demoted')
         ORDER BY ev.created_at DESC", $uid
    ));

    $history = $wpdb->get_results($wpdb->prepare(
        "SELECT ev.id, ev.event_type, ev.points_at_event, ev.created_at,
                lf.name AS from_league, lt.name AS to_league
         FROM $ev ev
         LEFT JOIN $l lf ON lf.id = ev.from_league_id
         LEFT JOIN $l lt ON lt.id = ev.to_league_id
         WHERE ev.user_id = %d AND ev.event_type IN ('promoted','demoted')
         ORDER BY ev.created_at DESC LIMIT 20", $uid
    ));

    return rest_ensure_response(array('unseen' => $unseen, 'history' => $history));
}

function blokes_api_mark_events_seen() {
    global $wpdb;
    $uid = get_current_user_id();
    $wpdb->update("{$wpdb->prefix}blokes_league_events", array('seen' => 1), array('user_id' => $uid, 'seen' => 0));
    return rest_ensure_response(array('ok' => true));
}

function blokes_api_initial_placement($request) {
    global $wpdb;
    $ul    = $wpdb->prefix . 'blokes_user_leagues';
    $l     = $wpdb->prefix . 'blokes_leagues';
    $ev    = $wpdb->prefix . 'blokes_league_events';
    $force = (bool) $request->get_param('force');

    $existing = (int) $wpdb->get_var("SELECT COUNT(*) FROM $ul");
    if ($existing > 0 && !$force)
        return new WP_Error('already_done', 'Placement already done. Use force=true to reset.', array('status' => 409));

    if ($force && $existing > 0) {
        $wpdb->query("DELETE FROM $ul");
        $wpdb->query("DELETE FROM $ev WHERE event_type IN ('promoted','demoted')");
    }

    $rows = $wpdb->get_results(
        "SELECT user_id, meta_value FROM {$wpdb->usermeta} WHERE meta_key = '_blokes_completion_log'"
    );

    $user_points = array();
    foreach ($rows as $row) {
        $log = maybe_unserialize($row->meta_value);
        if (!is_array($log)) continue;
        $pts = 0;
        foreach ($log as $entry) {
            $pid = (int) ($entry['postId'] ?? 0);
            if ($pid > 0) $pts += blokes_calculate_points($pid);
        }
        if ($pts > 0) $user_points[(int) $row->user_id] = $pts;
    }

    if (empty($user_points)) return rest_ensure_response(array('placed' => 0));

    // Place everyone in Pedri, then let blokes_check_tier_overflow cascade
    // them up to the correct tier (max 4 per tier, best scorers rise first).
    $pedri = $wpdb->get_row("SELECT * FROM $l WHERE tier = 1");
    if (!$pedri) return new WP_Error('no_leagues', 'Liga Pedri not found', array('status' => 500));

    arsort($user_points); // highest first so initial rank is sensible
    $now  = current_time('mysql');
    $rank = 1;
    foreach ($user_points as $uid => $pts) {
        $wpdb->insert($ul, array(
            'user_id'        => $uid,
            'league_id'      => (int) $pedri->id,
            'total_points'   => $pts,
            'rank_in_league' => $rank++,
            'zone'           => 'stay',
            'joined_at'      => $now,
            'last_updated'   => $now,
        ));
    }

    // Cascade: promotes top scorers up tier by tier until each has ≤ 4 users.
    blokes_recalculate_league_ranks((int) $pedri->id);
    blokes_check_tier_overflow((int) $pedri->id);

    $total = count($user_points);
    return rest_ensure_response(array('placed' => $total, 'totalUsers' => $total));
}

// ============================================================
//  PERFIL DE USUARIO
// ============================================================

function blokes_api_get_profile() {
    $uid = get_current_user_id();
    $av  = blokes_get_user_avatar($uid);
    return rest_ensure_response(array(
        'nickname'        => blokes_get_user_nickname($uid),
        'avatarType'      => $av['type'],
        'avatarData'      => $av['data'],
        'profileComplete' => blokes_is_profile_complete($uid),
    ));
}

function blokes_api_save_profile($request) {
    $uid  = get_current_user_id();
    $body = $request->get_json_params();

    $nickname    = sanitize_text_field($body['nickname']    ?? '');
    $avatar_type = sanitize_text_field($body['avatarType']  ?? '');
    $avatar_data = $body['avatarData'] ?? array();

    if (strlen($nickname) < 3 || strlen($nickname) > 20) {
        return new WP_Error('invalid_nickname', 'El nickname debe tener entre 3 y 20 caracteres.', array('status' => 400));
    }
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $nickname)) {
        return new WP_Error('invalid_nickname', 'Solo letras, números y guión bajo.', array('status' => 400));
    }
    if (!in_array($avatar_type, array('dicebear', 'photo', ''), true)) {
        return new WP_Error('invalid_avatar', 'Tipo de avatar inválido.', array('status' => 400));
    }
    if (blokes_nickname_exists($nickname, $uid)) {
        return new WP_Error('nickname_taken', 'Este nickname ya está en uso.', array('status' => 409));
    }

    update_user_meta($uid, '_blokes_nickname', $nickname);
    update_user_meta($uid, '_blokes_avatar_type', $avatar_type);
    update_user_meta($uid, '_blokes_avatar_data', wp_json_encode($avatar_data));
    update_user_meta($uid, '_blokes_profile_complete', '1');

    $av = blokes_get_user_avatar($uid);
    return rest_ensure_response(array(
        'success'         => true,
        'nickname'        => $nickname,
        'avatarType'      => $av['type'],
        'avatarData'      => $av['data'],
        'profileComplete' => true,
    ));
}

function blokes_api_check_nickname($request) {
    $uid      = get_current_user_id();
    $nickname = sanitize_text_field($request->get_param('value') ?: '');

    if (strlen($nickname) < 3 || strlen($nickname) > 20) {
        return rest_ensure_response(array('available' => false, 'reason' => 'length'));
    }
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $nickname)) {
        return rest_ensure_response(array('available' => false, 'reason' => 'chars'));
    }

    return rest_ensure_response(array('available' => !blokes_nickname_exists($nickname, $uid)));
}

function blokes_api_get_user_avatar_endpoint($request) {
    $av = blokes_get_user_avatar(intval($request['id']));
    return rest_ensure_response($av);
}

function blokes_api_get_completers($request) {
    global $wpdb;
    $post_id = intval($request['id']);
    if ($post_id <= 0) {
        return rest_ensure_response(array('success' => true, 'data' => array('users' => array(), 'total' => 0)));
    }

    $like = '%i:' . $post_id . ';%';
    $user_ids = $wpdb->get_col($wpdb->prepare(
        "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = '_blokes_completed' AND meta_value LIKE %s",
        $like
    ));
    $user_ids = array_values(array_unique(array_map('intval', $user_ids)));
    $total    = count($user_ids);

    $users = array();
    foreach (array_slice($user_ids, 0, 30) as $uid) {
        $u = get_userdata($uid);
        if (!$u) continue;
        $nickname = get_user_meta($uid, '_blokes_nickname', true) ?: '';
        $avatar   = blokes_get_user_avatar($uid);
        $first    = trim((string) ($u->first_name ?? ''));
        $name     = $first ?: (explode(' ', trim((string) $u->display_name))[0] ?? $u->display_name);
        $users[]  = array(
            'user_id'    => $uid,
            'name'       => $name,
            'nickname'   => $nickname,
            'avatarType' => $avatar['type'],
            'avatarData' => $avatar['data'],
        );
    }

    return rest_ensure_response(array('success' => true, 'data' => array('users' => $users, 'total' => $total)));
}

function blokes_api_upload_avatar($request) {
    $files = $request->get_file_params();
    if (empty($files['file'])) {
        return new WP_Error('no_file', 'No file uploaded.', array('status' => 400));
    }
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $attachment_id = media_handle_upload('file', 0);
    if (is_wp_error($attachment_id)) return $attachment_id;

    return rest_ensure_response(array('url' => wp_get_attachment_url($attachment_id)));
}

function blokes_api_get_comunidad_leagues() {
    global $wpdb;
    $is_auth      = is_user_logged_in();
    $my_uid       = $is_auth ? get_current_user_id() : 0;
    $my_league_id = 0;

    if ($is_auth) {
        $my_league_id = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT league_id FROM {$wpdb->prefix}blokes_user_leagues WHERE user_id = %d", $my_uid
        ));
    }

    $leagues = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}blokes_leagues ORDER BY tier DESC");
    $result  = array();

    foreach ($leagues as $league) {
        $members_raw = $wpdb->get_results($wpdb->prepare(
            "SELECT user_id, total_points, rank_in_league, zone
             FROM {$wpdb->prefix}blokes_user_leagues
             WHERE league_id = %d ORDER BY rank_in_league ASC LIMIT 30",
            $league->id
        ));

        $is_my_league = ($is_auth && (int) $league->id === $my_league_id);
        $member_data  = array();

        foreach ($members_raw as $m) {
            $uid   = (int) $m->user_id;
            $av    = blokes_get_user_avatar($uid);
            $entry = array(
                'userId'     => $uid,
                'isMe'       => ($uid === $my_uid),
                'avatarType' => $av['type'],
                'avatarData' => $av['data'],
                'nickname'   => blokes_get_user_nickname($uid) ?: 'Usuario',
            );
            if ($is_my_league) {
                $entry['totalPoints'] = (int) $m->total_points;
                $entry['rank']        = (int) $m->rank_in_league;
                $entry['zone']        = $m->zone;
            }
            $member_data[] = $entry;
        }

        $result[] = array(
            'id'          => (int) $league->id,
            'name'        => $league->name,
            'slug'        => $league->slug,
            'tier'        => (int) $league->tier,
            'memberCount' => (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}blokes_user_leagues WHERE league_id = %d", $league->id
            )),
            'members'     => $member_data,
            'isMyLeague'  => $is_my_league,
        );
    }

    return rest_ensure_response($result);
}

function blokes_api_save_email_lists(WP_REST_Request $request) {
    $body    = $request->get_json_params();
    $allowed = array('socios', 'gestion', 'profesores');

    switch_to_blog(1);
    $existing = get_option('blokes_email_lists', array());
    $updated  = is_array($existing) ? $existing : array();

    foreach ($allowed as $key) {
        if (!isset($body[$key]) || !is_array($body[$key])) continue;
        $clean = array();
        foreach ($body[$key] as $email) {
            $e = sanitize_email(strtolower(trim($email)));
            if ($e) $clean[] = $e;
        }
        $updated[$key] = array_values(array_unique($clean));
    }

    update_option('blokes_email_lists', $updated);
    restore_current_blog();

    return rest_ensure_response(array('success' => true, 'lists' => blokes_get_email_lists()));
}

// ============================================================
//  superadmin/v1 — horas extra de profesores (Supervisión)
//  gestion: ve y registra horas (solo edita las pendientes), sin importes
//  socio:   todo + €/h extra por profesor, importes y estado de pago
// ============================================================

add_action('rest_api_init', function() {
    $ot_perm    = function() { return in_array(blokes_get_app_role(), array('socio', 'gestion')); };
    $socio_perm = function() { return blokes_get_app_role() === 'socio'; };

    register_rest_route('superadmin/v1', '/overtime', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'overtime_list',
            'permission_callback' => $ot_perm,
            'args'                => array('month' => array('type' => 'string', 'required' => true)),
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'overtime_create',
            'permission_callback' => $ot_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/overtime/(?P<id>[a-z0-9-]+)', array(
        array(
            'methods'             => 'PUT',
            'callback'            => 'overtime_update',
            'permission_callback' => $ot_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'overtime_delete',
            'permission_callback' => $ot_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/overtime-status', array(
        'methods'             => 'POST',
        'callback'            => 'overtime_set_status',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/overtime-people', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'overtime_list_people',
            'permission_callback' => $ot_perm,
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'overtime_add_person',
            'permission_callback' => $ot_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/overtime-people/(?P<id>[a-z0-9-]+)', array(
        'methods'             => 'PUT',
        'callback'            => 'overtime_update_person',
        'permission_callback' => $socio_perm,
    ));

    // ── Nóminas (SuperAdmin, solo socios) ──
    register_rest_route('superadmin/v1', '/payroll', array(
        'methods'             => 'GET',
        'callback'            => 'payroll_get',
        'permission_callback' => $socio_perm,
        'args'                => array('month' => array('type' => 'string', 'required' => true)),
    ));
    register_rest_route('superadmin/v1', '/payroll-history', array(
        'methods'             => 'GET',
        'callback'            => 'payroll_history',
        'permission_callback' => $socio_perm,
        'args'                => array(
            'to'     => array('type' => 'string',  'required' => true),
            'months' => array('type' => 'integer', 'default'  => 12),
        ),
    ));
    register_rest_route('superadmin/v1', '/payroll-config', array(
        'methods'             => 'PUT',
        'callback'            => 'payroll_save_config',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/payroll-payments/import', array(
        'methods'             => 'POST',
        'callback'            => 'payroll_import_payments',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/payroll-partials', array(
        'methods'             => 'POST',
        'callback'            => 'payroll_add_partial',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/payroll-partials/(?P<id>[a-z0-9-]+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'payroll_delete_partial',
        'permission_callback' => $socio_perm,
        'args'                => array('month' => array('type' => 'string', 'required' => true)),
    ));
    register_rest_route('superadmin/v1', '/payroll-cash', array(
        'methods'             => 'POST',
        'callback'            => 'payroll_set_cash',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/payroll-payment', array(
        'methods'             => 'POST',
        'callback'            => 'payroll_set_payment',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/payroll-absence', array(
        'methods'             => 'POST',
        'callback'            => 'payroll_set_absence',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/payroll-personal/(?P<id>[a-z0-9-]+)', array(
        'methods'             => 'PUT',
        'callback'            => 'payroll_save_personal',
        'permission_callback' => $socio_perm,
    ));
});

function overtime_get_entries() {
    $stored = get_option('blokes_overtime_entries', array());
    return is_array($stored) ? $stored : array();
}

function overtime_save_entries($entries) {
    update_option('blokes_overtime_entries', array_values($entries), false);
}

function overtime_get_rates() {
    $stored = get_option('blokes_overtime_rates', array());
    return is_array($stored) ? $stored : array();
}

// ── Personas (profesores, voluntarios y externos) ──
// Lista propia de Horas extra, independiente de la config de profesores de entrenamientos.
// Se crea la primera vez con la plantilla actual; los ids de los 6 profesores que ya
// estaban en progreso_get_professors_config() se mantienen para no perder registros.

// Tipos de persona, en el orden en que se listan. Profesores y voluntarios pueden tener
// nómina base; los externos cobran solo extras.
function overtime_types() {
    return array('profesor', 'voluntario', 'externo');
}

function overtime_clean_type($type) {
    return in_array($type, overtime_types(), true) ? $type : 'profesor';
}

function overtime_has_base($type) {
    return $type !== 'externo';
}

// Orden estable: por tipo y, dentro de cada tipo, el orden de la lista.
function overtime_sort_by_type($people) {
    $out = array();
    foreach (overtime_types() as $type) {
        foreach ($people as $p) if ($p['type'] === $type) $out[] = $p;
    }
    return $out;
}

function overtime_palette() {
    return array('#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#f5c842',
                 '#22d3ee', '#f87171', '#a3e635', '#e879f9', '#94a3b8', '#fbbf24');
}

function overtime_get_people() {
    $stored = get_option('blokes_overtime_people', null);
    if (is_array($stored)) return overtime_migrate_people($stored);

    $config = progreso_get_professors_config();
    $seed   = array(
        'lucia' => 'Lucía', 'sara' => 'Sara', 'alvaro' => 'Álvaro', 'sigurd' => 'Sigurd',
        'eva' => 'Eva', 'carolina' => 'Carolina', 'isa' => 'Isa', 'ana' => 'Ana',
        'edu' => 'Edu', 'rafa' => 'Rafa',
    );
    $palette = overtime_palette();
    $people  = array();
    $n       = 0;
    foreach ($seed as $id => $name) {
        $people[] = array(
            'id'     => $id,
            'name'   => $name,
            'type'   => 'profesor',
            'color'  => $config[$id]['color'] ?? $palette[$n % count($palette)],
            'active' => true,
        );
        $n++;
    }
    update_option('blokes_overtime_people', $people, false);
    return $people;
}

// Migraciones de datos de una sola vez (cada una marcada con su propia opción).
function overtime_migrate_people($people) {
    // 2026-09: Ana, Carolina, Rafa, Edu e Isa pasan de profesor a voluntario.
    if (!get_option('blokes_overtime_mig_voluntarios')) {
        foreach ($people as $i => $p) {
            if (in_array($p['id'], array('ana', 'carolina', 'rafa', 'edu', 'isa'), true)) {
                $people[$i]['type'] = 'voluntario';
            }
        }
        overtime_save_people($people);
        update_option('blokes_overtime_mig_voluntarios', 1, false);
    }
    return $people;
}

function overtime_save_people($people) {
    update_option('blokes_overtime_people', array_values($people), false);
}

function overtime_person_index($people, $id) {
    foreach ($people as $i => $p) {
        if ($p['id'] === $id) return $i;
    }
    return -1;
}

function overtime_list_people() {
    return rest_ensure_response(array('success' => true, 'people' => overtime_get_people()));
}

function overtime_add_person($request) {
    $body = $request->get_json_params();
    $name = trim(sanitize_text_field($body['name'] ?? ''));
    $type = overtime_clean_type($body['type'] ?? '');
    if ($name === '') {
        return new WP_Error('invalid_name', 'Indica el nombre', array('status' => 400));
    }
    $name   = mb_substr($name, 0, 60);
    $people = overtime_get_people();
    foreach ($people as $p) {
        if (mb_strtolower($p['name']) === mb_strtolower($name)) {
            return new WP_Error('duplicate', "Ya existe «{$p['name']}» en la lista", array('status' => 409));
        }
    }

    $base = sanitize_title($name) ?: 'persona';
    $id   = $base;
    for ($k = 2; overtime_person_index($people, $id) >= 0; $k++) $id = "{$base}-{$k}";

    $palette  = overtime_palette();
    $person   = array(
        'id'     => $id,
        'name'   => $name,
        'type'   => $type,
        'color'  => $palette[count($people) % count($palette)],
        'active' => true,
    );
    $people[] = $person;
    overtime_save_people($people);

    return rest_ensure_response(array('success' => true, 'person' => $person, 'people' => $people));
}

// Solo socios: renombrar, cambiar tipo o activar/desactivar. No se borra para no
// dejar registros antiguos sin nombre.
function overtime_update_person($request) {
    $people = overtime_get_people();
    $i      = overtime_person_index($people, $request['id']);
    if ($i < 0) return new WP_Error('not_found', 'Persona no encontrada', array('status' => 404));

    $body = $request->get_json_params();
    if (isset($body['name'])) {
        $name = mb_substr(trim(sanitize_text_field($body['name'])), 0, 60);
        if ($name === '') return new WP_Error('invalid_name', 'Indica el nombre', array('status' => 400));
        $people[$i]['name'] = $name;
    }
    if (isset($body['type']))   $people[$i]['type']   = overtime_clean_type($body['type']);
    if (isset($body['active'])) $people[$i]['active'] = (bool) $body['active'];
    overtime_save_people($people);

    return rest_ensure_response(array('success' => true, 'people' => $people));
}

// Valida y normaliza los campos editables. Devuelve array o WP_Error.
// $current_person: persona que ya tenía el registro (se permite aunque esté inactiva).
function overtime_clean_fields($body, $current_person = null) {
    $professor = sanitize_title($body['professor'] ?? '');
    $date      = sanitize_text_field($body['date'] ?? '');
    $hours     = round(floatval($body['hours'] ?? 0), 2);
    $reason    = trim(sanitize_textarea_field($body['reason'] ?? ''));

    $people = overtime_get_people();
    $pi     = overtime_person_index($people, $professor);
    if ($pi < 0 || (!$people[$pi]['active'] && $professor !== $current_person)) {
        return new WP_Error('invalid_professor', 'Persona no válida o inactiva', array('status' => 400));
    }
    $dt = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dt || $dt->format('Y-m-d') !== $date) {
        return new WP_Error('invalid_date', 'Fecha no válida', array('status' => 400));
    }
    if ($hours <= 0 || $hours > 24) {
        return new WP_Error('invalid_hours', 'Las horas deben estar entre 0 y 24', array('status' => 400));
    }
    if ($reason === '') {
        return new WP_Error('invalid_reason', 'Indica el motivo', array('status' => 400));
    }
    return array(
        'professor' => $professor,
        'date'      => $date,
        'hours'     => $hours,
        'reason'    => mb_substr($reason, 0, 500),
    );
}

// €/h aplicable: las pagadas conservan el €/h con el que se pagaron.
function overtime_entry_rate($entry, $rates) {
    if ($entry['status'] === 'pagado' && isset($entry['paid_rate'])) return $entry['paid_rate'];
    return $rates[$entry['professor']] ?? null;
}

// Sin $rates no incluye dinero (Supervisión). Con $rates añade €/h e importe (Nóminas).
function overtime_present($entry, $rates = null) {
    $out = array(
        'id'         => $entry['id'],
        'professor'  => $entry['professor'],
        'date'       => $entry['date'],
        'hours'      => $entry['hours'],
        'reason'     => $entry['reason'],
        'status'     => $entry['status'],
        'created_by' => $entry['created_by'] ?? '',
    );
    if ($rates !== null) {
        $rate = overtime_entry_rate($entry, $rates);
        $out['rate']    = $rate;
        $out['amount']  = $rate !== null ? round($rate * $entry['hours'], 2) : null;
        $out['paid_at'] = $entry['paid_at'] ?? null;
    }
    return $out;
}

function overtime_list($request) {
    $month = sanitize_text_field($request->get_param('month'));
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }
    $list = array();
    foreach (overtime_get_entries() as $entry) {
        if (strpos($entry['date'], $month) !== 0) continue;
        $list[] = overtime_present($entry);
    }
    usort($list, function($a, $b) { return strcmp($a['date'], $b['date']); });

    return rest_ensure_response(array(
        'success'    => true,
        'month'      => $month,
        'can_manage' => blokes_get_app_role() === 'socio',
        'people'     => overtime_get_people(),
        'entries'    => $list,
    ));
}

function overtime_create($request) {
    $fields = overtime_clean_fields($request->get_json_params());
    if (is_wp_error($fields)) return $fields;

    $now   = (new DateTime())->format('c');
    $entry = array_merge($fields, array(
        'id'         => wp_generate_uuid4(),
        'status'     => 'pendiente',
        'created_by' => wp_get_current_user()->user_email,
        'created_at' => $now,
        'updated_at' => $now,
    ));
    $entries   = overtime_get_entries();
    $entries[] = $entry;
    overtime_save_entries($entries);

    return rest_ensure_response(array('success' => true, 'entry' => overtime_present($entry)));
}

function overtime_find_index($entries, $id) {
    foreach ($entries as $i => $entry) {
        if ($entry['id'] === $id) return $i;
    }
    return -1;
}

function overtime_update($request) {
    $entries = overtime_get_entries();
    $i       = overtime_find_index($entries, $request['id']);
    if ($i < 0) return new WP_Error('not_found', 'Registro no encontrado', array('status' => 404));

    $is_socio = blokes_get_app_role() === 'socio';
    if (!$is_socio && $entries[$i]['status'] !== 'pendiente') {
        return new WP_Error('locked', 'Solo un socio puede modificar horas ya pagadas', array('status' => 403));
    }
    $fields = overtime_clean_fields($request->get_json_params(), $entries[$i]['professor']);
    if (is_wp_error($fields)) return $fields;

    $entries[$i] = array_merge($entries[$i], $fields, array('updated_at' => (new DateTime())->format('c')));
    overtime_save_entries($entries);

    return rest_ensure_response(array('success' => true, 'entry' => overtime_present($entries[$i])));
}

function overtime_delete($request) {
    $entries = overtime_get_entries();
    $i       = overtime_find_index($entries, $request['id']);
    if ($i < 0) return new WP_Error('not_found', 'Registro no encontrado', array('status' => 404));

    if (blokes_get_app_role() !== 'socio' && $entries[$i]['status'] !== 'pendiente') {
        return new WP_Error('locked', 'Solo un socio puede borrar horas ya pagadas', array('status' => 403));
    }
    array_splice($entries, $i, 1);
    overtime_save_entries($entries);

    return rest_ensure_response(array('success' => true));
}

// Cambia el estado de uno (id) o de todos los de un profesor en un mes (month + professor).
function overtime_set_status($request) {
    $body   = $request->get_json_params();
    $status = $body['status'] ?? '';
    if (!in_array($status, array('pendiente', 'pagado'), true)) {
        return new WP_Error('invalid_status', 'Estado no válido', array('status' => 400));
    }
    $id        = sanitize_text_field($body['id'] ?? '');
    $month     = sanitize_text_field($body['month'] ?? '');
    $professor = sanitize_title($body['professor'] ?? '');
    if ($id === '' && (!preg_match('/^\d{4}-\d{2}$/', $month) || $professor === '')) {
        return new WP_Error('invalid_target', 'Indica id, o mes y profesor', array('status' => 400));
    }

    $rates   = overtime_get_rates();
    $now     = (new DateTime())->format('c');
    $entries = overtime_get_entries();
    $changed = 0;
    foreach ($entries as $i => $entry) {
        $match = $id !== ''
            ? $entry['id'] === $id
            : ($entry['professor'] === $professor && strpos($entry['date'], $month) === 0);
        if (!$match || $entry['status'] === $status) continue;

        $entries[$i]['status']     = $status;
        $entries[$i]['updated_at'] = $now;
        if ($status === 'pagado') {
            $entries[$i]['paid_at']   = $now;
            $entries[$i]['paid_rate'] = $rates[$entry['professor']] ?? null;
        } else {
            unset($entries[$i]['paid_at'], $entries[$i]['paid_rate']);
        }
        $changed++;
    }
    overtime_save_entries($entries);

    return rest_ensure_response(array('success' => true, 'changed' => $changed));
}

// ============================================================
//  superadmin/v1 — Nóminas: nómina base fija mensual + horas extra
// ============================================================

// Nómina base mensual por persona (profesores y voluntarios; los externos cobran solo extras).
// Solo lo configurado en Nóminas → Configuración (lo que se paga a cada persona).
// No se usan los costes de gestoría de PlaygroundPage.jsx.
function payroll_get_base() {
    $stored = get_option('blokes_payroll_base', array());
    return is_array($stored) ? $stored : array();
}

// "Sin asistencia": { 'YYYY-MM': [id, ...] }. Ese mes la nómina base de esa persona no se
// reporta (cuenta 0); la configuración no cambia, así que el mes siguiente vuelve a contar.
function payroll_get_absences() {
    $stored = get_option('blokes_payroll_absences', array());
    return is_array($stored) ? $stored : array();
}

// ── Pago de nóminas ──
// { 'YYYY-MM': { id: { amount (null = manual sin importe), date, source: remesa|manual, ref, paid_at } } }
function payroll_get_payments() {
    $stored = get_option('blokes_payroll_payments', array());
    return is_array($stored) ? $stored : array();
}

function payroll_save_payments($all) {
    update_option('blokes_payroll_payments', $all, false);
}

// Marca como pagadas las horas extra pendientes de una persona en un mes (con el €/h actual).
function payroll_mark_extras_paid($month, $person_id) {
    $rates   = overtime_get_rates();
    $now     = (new DateTime())->format('c');
    $entries = overtime_get_entries();
    $changed = 0;
    foreach ($entries as $i => $e) {
        if ($e['professor'] !== $person_id || strpos($e['date'], $month) !== 0 || $e['status'] === 'pagado') continue;
        $entries[$i]['status']     = 'pagado';
        $entries[$i]['updated_at'] = $now;
        $entries[$i]['paid_at']    = $now;
        $entries[$i]['paid_rate']  = $rates[$person_id] ?? null;
        $changed++;
    }
    if ($changed) overtime_save_entries($entries);
    return $changed;
}

// Importa una remesa ya leída y emparejada en el navegador: [{ person, amount, date }].
// Regla: si el importe cubre base + extras pendientes, las extras también quedan pagadas;
// si no, solo la nómina, y lo que falte se ve como pendiente (y se cambia a mano).
function payroll_import_payments($request) {
    $body  = $request->get_json_params();
    $month = sanitize_text_field($body['month'] ?? '');
    $ref   = mb_substr(sanitize_text_field($body['ref'] ?? ''), 0, 120);
    $list  = is_array($body['payments'] ?? null) ? $body['payments'] : array();
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }

    $people = overtime_get_people();
    $calc   = payroll_compute_month($month, $people, overtime_get_entries(), payroll_get_base(), overtime_get_rates());
    $rowById = array();
    foreach ($calc['rows'] as $r) $rowById[$r['id']] = $r;

    $all     = payroll_get_payments();
    $now     = (new DateTime())->format('c');
    $results = array();
    foreach ($list as $pay) {
        $id     = sanitize_title($pay['person'] ?? '');
        $amount = round(floatval($pay['amount'] ?? 0), 2);
        $date   = sanitize_text_field($pay['date'] ?? '');
        if (overtime_person_index($people, $id) < 0 || $amount <= 0) continue;
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $date = '';

        $all[$month][$id] = array('amount' => $amount, 'date' => $date, 'source' => 'remesa', 'ref' => $ref, 'paid_at' => $now);

        $row   = $rowById[$id] ?? null;
        $base  = $row ? ($row['base'] ?? 0) : 0;
        $extra = $row ? $row['pending_extras'] : 0;
        $extras_paid = 0;
        // Con pago mixto las extras van en el efectivo, no en la remesa
        $mixed = isset(payroll_get_cash_totals()[$id]);
        if (!$mixed && $extra > 0 && $amount + 0.01 >= $base + $extra) $extras_paid = payroll_mark_extras_paid($month, $id);
        $results[] = array('person' => $id, 'amount' => $amount, 'extras_marked_paid' => $extras_paid);
    }
    payroll_save_payments($all);

    return rest_ensure_response(array('success' => true, 'month' => $month, 'imported' => $results));
}

// Manual: marcar/desmarcar la nómina de una persona como pagada (sin importe de banco).
function payroll_set_payment($request) {
    $body  = $request->get_json_params();
    $month = sanitize_text_field($body['month'] ?? '');
    $id    = sanitize_title($body['person'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }
    if (overtime_person_index(overtime_get_people(), $id) < 0) {
        return new WP_Error('not_found', 'Persona no encontrada', array('status' => 404));
    }
    $all = payroll_get_payments();
    if (!empty($body['paid'])) {
        $all[$month][$id] = array('amount' => null, 'date' => current_time('Y-m-d'), 'source' => 'manual', 'ref' => '', 'paid_at' => (new DateTime())->format('c'));
    } else {
        unset($all[$month][$id]);
        if (empty($all[$month])) unset($all[$month]);
    }
    payroll_save_payments($all);
    return rest_ensure_response(array('success' => true));
}

function payroll_set_absence($request) {
    $body   = $request->get_json_params();
    $month  = sanitize_text_field($body['month'] ?? '');
    $id     = sanitize_title($body['person'] ?? '');
    $absent = !empty($body['absent']);
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }
    if (overtime_person_index(overtime_get_people(), $id) < 0) {
        return new WP_Error('not_found', 'Persona no encontrada', array('status' => 404));
    }
    $all  = payroll_get_absences();
    $list = array_values(array_diff($all[$month] ?? array(), array($id)));
    if ($absent) $list[] = $id;
    if ($list) $all[$month] = $list;
    else unset($all[$month]);
    update_option('blokes_payroll_absences', $all, false);

    return rest_ensure_response(array('success' => true, 'month' => $month, 'absent' => $list));
}

// Filas por persona y totales de un mes ('YYYY-MM').
function payroll_compute_month($month, $people, $entries, $base, $rates, $absences = null) {
    if ($absences === null) $absences = payroll_get_absences();
    $absent_ids = $absences[$month] ?? array();
    $by = array();
    foreach ($entries as $e) {
        if (strpos($e['date'], $month) !== 0) continue;
        $id = $e['professor'];
        if (!isset($by[$id])) $by[$id] = array('hours' => 0, 'extras' => 0, 'pending_extras' => 0, 'missing_rate' => false, 'pending' => 0, 'paid' => 0);
        $rate   = overtime_entry_rate($e, $rates);
        $amount = $rate !== null ? round($rate * $e['hours'], 2) : 0;
        $by[$id]['hours']  += $e['hours'];
        $by[$id]['extras'] += $amount;
        if ($rate === null) $by[$id]['missing_rate'] = true;
        if ($e['status'] === 'pagado') {
            $by[$id]['paid']++;
        } else {
            $by[$id]['pending']++;
            $by[$id]['pending_extras'] += $amount;
        }
    }

    $ordered = overtime_sort_by_type($people);
    $rows   = array();
    $payments = payroll_get_payments()[$month] ?? array();
    $totals = array('base' => 0, 'extras' => 0, 'pending_extras' => 0, 'total' => 0, 'hours' => 0,
                    'paid_bank' => 0, 'outstanding' => 0, 'cash' => 0, 'partials' => 0,
                    'bank' => 0, 'cash_paid' => 0);
    $partials      = payroll_get_partials()[$month] ?? array();
    $cash_totals   = payroll_get_cash_totals();
    $cash_payments = payroll_get_cash_payments()[$month] ?? array();
    foreach ($ordered as $p) {
        $has_hours = isset($by[$p['id']]);
        $p_base    = (overtime_has_base($p['type']) && $p['active']) ? ($base[$p['id']] ?? null) : null;
        // Profesores activos siempre; voluntarios si tienen base; externos e inactivos solo con horas ese mes.
        $always    = $p['active'] && ($p['type'] === 'profesor' || $p_base !== null);
        if (!$has_hours && !$always) continue;

        $absent      = in_array($p['id'], $absent_ids, true);
        $base_nominal = $p_base;
        if ($absent && $p_base !== null) $p_base = 0.0;

        $h   = $has_hours ? $by[$p['id']] : array('hours' => 0, 'extras' => 0, 'pending_extras' => 0, 'missing_rate' => false, 'pending' => 0, 'paid' => 0);
        $row = array_merge(array(
            'id'           => $p['id'],
            'name'         => $p['name'],
            'type'         => $p['type'],
            'color'        => $p['color'],
            'active'       => $p['active'],
            'base'         => $p_base,
            'base_nominal' => $base_nominal,
            'absent'       => $absent,
            'rate'         => $rates[$p['id']] ?? null,
        ), $h);
        $row['extras'] = round($row['extras'], 2);
        $row['total']  = round(($p_base ?? 0) + $row['extras'], 2);

        // Pago de la nómina (remesa o manual). Pendiente = base + extras aún no pagadas − lo pagado
        // en banco (un pago de remesa que supera la base también reduce lo que falta de extras).
        // Marcado a mano sin importe = base pagada; las extras siguen su propio estado.
        $pay      = $payments[$p['id']] ?? null;
        $base_due = $p_base ?? 0;
        $cash_total = ($p_base !== null) ? ($cash_totals[$p['id']] ?? null) : null;

        $cash_paid   = null;
        $my_partials = array_values(array_filter($partials, function($x) use ($p) { return $x['person'] === $p['id']; }));
        $part_nomina = 0; $part_extras = 0;
        foreach ($my_partials as $x) {
            if ($x['concept'] === 'extras') $part_extras += $x['amount'];
            else                            $part_nomina += $x['amount'];
        }

        if ($cash_total !== null) {
            // Pago mixto: banco (nómina) + efectivo = total pactado; las extras van en el efectivo.
            // El efectivo se calcula con lo que pagó realmente el banco (remesa) o, si aún no hay
            // remesa, con la base configurada (estimado). "Sin asistencia" = no se paga nada.
            $bank_ref  = ($pay && $pay['amount'] !== null) ? $pay['amount'] : $base_due;
            $cash_base = $absent ? 0 : max(0, $cash_total - $bank_ref);
            $cash_paid = $cash_payments[$p['id']] ?? null;
            $row['cash_total']     = $cash_total;
            $row['cash_due']       = round($cash_base + $row['extras'], 2);
            $row['cash_estimated'] = !($pay && $pay['amount'] !== null);
            $row['cash_paid']      = $cash_paid;
            $row['total']          = round(($absent ? 0 : max($cash_total, $bank_ref)) + $row['extras'], 2);
            // Los pagos parciales en efectivo descuentan del efectivo pendiente
            $nomina_out  = $pay ? 0 : $base_due;
            $extras_out  = $cash_paid ? 0 : max(0, $cash_base + $row['pending_extras'] - $part_nomina - $part_extras);
            // Solo se avisa si el banco paga más que el total pactado
            $row['difference'] = ($pay && $pay['amount'] !== null && $pay['amount'] > $cash_total + 0.01)
                ? round($pay['amount'] - $cash_total, 2) : null;
            $totals['cash'] += $row['cash_due'];
        } else {
            // Lo pagado por banco cubre primero la nómina; lo que exceda, las extras.
            // Los pagos parciales en efectivo descuentan de su concepto (nómina o extras).
            $bank_cover = !$pay ? 0 : ($pay['amount'] === null ? $base_due : $pay['amount']);
            $nomina_out = max(0, $base_due - $bank_cover - $part_nomina);
            $excess     = max(0, $bank_cover + $part_nomina - $base_due);
            $extras_out = max(0, $row['pending_extras'] - $excess - $part_extras);
            // Diferencia entre lo pagado en banco y el total del mes (para detectar bases mal configuradas)
            $row['difference'] = ($pay && $pay['amount'] !== null) ? round($pay['amount'] - $row['total'], 2) : null;
        }
        $outstanding = $nomina_out + $extras_out;
        $any_nomina  = $pay || $part_nomina > 0;
        $row['payment']            = $pay;
        $row['partials']           = $my_partials;
        $row['partial_nomina']     = round($part_nomina, 2);
        $row['partial_extras']     = round($part_extras, 2);
        $row['nomina_outstanding'] = round($nomina_out, 2);
        $row['extras_outstanding'] = round($extras_out, 2);
        // Estado de la nómina (base): pagado / parcial / pendiente
        $row['nomina_status'] = $base_due <= 0 && !$any_nomina ? null
            : ($any_nomina && $nomina_out <= 0.01 ? 'pagado' : ($any_nomina ? 'parcial' : 'pendiente'));
        $row['outstanding'] = round($outstanding, 2);
        $totals['partials'] += $part_nomina + $part_extras;

        // Resumen de dinero del mes: A pagar = Banco + Efectivo + Manual + Pendiente.
        // "Manual" = lo marcado como pagado sin importe (p. ej. extras marcadas a mano).
        $bank_amt = !$pay ? 0 : ($pay['amount'] === null ? $base_due : $pay['amount']);
        $cash_amt = $part_nomina + $part_extras + (($cash_total !== null && $cash_paid) ? $cash_paid['amount'] : 0);
        $row['to_pay'] = $row['total'];
        $row['bank']   = round($bank_amt, 2);
        $row['cash']   = round($cash_amt, 2);
        $row['manual'] = round(max(0, $row['total'] - $bank_amt - $cash_amt - $outstanding), 2);
        $row['status'] = $row['total'] <= 0 && $bank_amt + $cash_amt <= 0 ? null
            : ($outstanding <= 0.01 ? 'pagado' : ($bank_amt + $cash_amt + $row['manual'] > 0 ? 'parcial' : 'pendiente'));
        $totals['bank']      += $row['bank'];
        $totals['cash_paid'] += $row['cash'];
        $rows[] = $row;

        $totals['base']           += $p_base ?? 0;
        $totals['extras']         += $row['extras'];
        $totals['pending_extras'] += $row['pending_extras'];
        $totals['hours']          += $row['hours'];
        $totals['outstanding']    += $row['outstanding'];
        $totals['paid_bank']      += ($pay && $pay['amount'] !== null) ? $pay['amount'] : 0;
        $totals['total']          += $row['total'];
    }
    foreach ($totals as $k => $v) $totals[$k] = round($v, 2);

    return array('rows' => $rows, 'totals' => $totals);
}

function payroll_get($request) {
    $month = sanitize_text_field($request->get_param('month'));
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }
    $people  = overtime_get_people();
    $entries = overtime_get_entries();
    $base    = payroll_get_base();
    $rates   = overtime_get_rates();

    $detail = array();
    foreach ($entries as $e) {
        if (strpos($e['date'], $month) === 0) $detail[] = overtime_present($e, $rates);
    }
    usort($detail, function($a, $b) { return strcmp($a['date'], $b['date']); });

    return rest_ensure_response(array_merge(
        array('success' => true, 'month' => $month),
        payroll_compute_month($month, $people, $entries, $base, $rates),
        array(
            'entries' => $detail,
            'people'   => $people,
            'config'   => payroll_config_response($base, $rates),
            'personal' => (object) payroll_get_personal(),
        )
    ));
}

// ── Ficha personal (DNI, dirección…) ──
// Datos personales: solo se guardan en la BD (nunca en el código, el repo es público)
// y solo se devuelven a socios, dentro de /payroll.
function payroll_personal_fields() {
    return array('full_name', 'dni', 'birth_date', 'address', 'phone', 'email', 'iban');
}

// IBAN sin espacios y en mayúsculas si es válido (dígito de control mod 97); si no, null.
function payroll_clean_iban($iban) {
    $iban = strtoupper(preg_replace('/[\s-]+/', '', $iban));
    if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', $iban)) return null;
    $moved = substr($iban, 4) . substr($iban, 0, 4);
    $digits = '';
    foreach (str_split($moved) as $ch) $digits .= ctype_alpha($ch) ? (string) (ord($ch) - 55) : $ch;
    $rem = 0;
    foreach (str_split($digits, 7) as $chunk) $rem = intval($rem . $chunk) % 97;
    return $rem === 1 ? $iban : null;
}

function payroll_get_personal() {
    $stored = get_option('blokes_payroll_personal', array());
    return is_array($stored) ? $stored : array();
}

function payroll_save_personal($request) {
    $id = sanitize_title($request['id']);
    if (overtime_person_index(overtime_get_people(), $id) < 0) {
        return new WP_Error('not_found', 'Persona no encontrada', array('status' => 404));
    }
    $body  = $request->get_json_params();
    $clean = array();
    foreach (payroll_personal_fields() as $f) {
        $v = mb_substr(trim(sanitize_text_field((string) ($body[$f] ?? ''))), 0, 200);
        if ($f === 'email' && $v !== '') {
            $v = sanitize_email($v);
            if (!is_email($v)) return new WP_Error('invalid_email', 'Email no válido', array('status' => 400));
        }
        if ($f === 'iban' && $v !== '') {
            $v = payroll_clean_iban($v);
            if ($v === null) return new WP_Error('invalid_iban', 'IBAN no válido (revisa los dígitos)', array('status' => 400));
        }
        if ($f === 'birth_date' && $v !== '') {
            $dt = DateTime::createFromFormat('Y-m-d', $v);
            if (!$dt || $dt->format('Y-m-d') !== $v) {
                return new WP_Error('invalid_date', 'Fecha de nacimiento no válida', array('status' => 400));
            }
        }
        if ($v !== '') $clean[$f] = $v;
    }

    $all = payroll_get_personal();
    if ($clean) $all[$id] = $clean;
    else unset($all[$id]);
    update_option('blokes_payroll_personal', $all, false);

    return rest_ensure_response(array('success' => true, 'personal' => (object) ($all[$id] ?? array())));
}

// Justificación de la nómina base por persona (texto libre).
function payroll_get_notes() {
    $stored = get_option('blokes_payroll_notes', array());
    return is_array($stored) ? $stored : array();
}

function payroll_config_response($base, $rates) {
    return array(
        'base'       => (object) $base,
        'rates'      => (object) $rates,
        'notes'      => (object) payroll_get_notes(),
        'cash_total' => (object) payroll_get_cash_totals(),
    );
}

// ── Pago mixto banco + efectivo ──
// "Total pactado" por persona (p. ej. 600 €): el banco paga la nómina (base) y el resto hasta el
// total pactado, más las horas extra, se entrega en efectivo. Si el banco paga menos (baja), el
// efectivo sube. { id: importe }
function payroll_get_cash_totals() {
    $stored = get_option('blokes_payroll_cash_total', array());
    return is_array($stored) ? $stored : array();
}

// Entregas en efectivo: { 'YYYY-MM': { id: { amount, date } } }
function payroll_get_cash_payments() {
    $stored = get_option('blokes_payroll_cash_payments', array());
    return is_array($stored) ? $stored : array();
}

// Marcar/desmarcar el efectivo del mes como entregado. Al marcarlo, las horas extra del mes
// (que van en el mismo pago en efectivo) quedan también pagadas.
// ── Pagos parciales en efectivo ──
// { 'YYYY-MM': [ { id, person, concept: nomina|extras, amount, method: efectivo, date, note, created_by } ] }
function payroll_get_partials() {
    $stored = get_option('blokes_payroll_partials', array());
    return is_array($stored) ? $stored : array();
}

function payroll_add_partial($request) {
    $body    = $request->get_json_params();
    $month   = sanitize_text_field($body['month'] ?? '');
    $person  = sanitize_title($body['person'] ?? '');
    $concept = ($body['concept'] ?? '') === 'extras' ? 'extras' : 'nomina';
    $amount  = round(floatval($body['amount'] ?? 0), 2);
    $date    = sanitize_text_field($body['date'] ?? '');
    $note    = mb_substr(trim(sanitize_textarea_field($body['note'] ?? '')), 0, 300);   // justificación
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }
    if (overtime_person_index(overtime_get_people(), $person) < 0) {
        return new WP_Error('not_found', 'Persona no encontrada', array('status' => 404));
    }
    if ($amount <= 0) {
        return new WP_Error('invalid_amount', 'El importe debe ser mayor que 0', array('status' => 400));
    }
    if ($note === '') {
        return new WP_Error('invalid_note', 'Indica la justificación del pago', array('status' => 400));
    }
    $dt = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dt || $dt->format('Y-m-d') !== $date) $date = current_time('Y-m-d');

    $all = payroll_get_partials();
    $all[$month][] = array(
        'id'         => wp_generate_uuid4(),
        'person'     => $person,
        'concept'    => $concept,
        'amount'     => $amount,
        'method'     => 'efectivo',
        'date'       => $date,
        'note'       => $note,
        'created_by' => wp_get_current_user()->user_email,
    );
    update_option('blokes_payroll_partials', $all, false);

    // Si con este pago las horas extra del mes quedan cubiertas, se marcan como pagadas
    if ($concept === 'extras') {
        $calc = payroll_compute_month($month, overtime_get_people(), overtime_get_entries(), payroll_get_base(), overtime_get_rates());
        foreach ($calc['rows'] as $r) {
            if ($r['id'] === $person && $r['pending_extras'] > 0 && $r['extras_outstanding'] <= 0.01) {
                payroll_mark_extras_paid($month, $person);
            }
        }
    }
    return rest_ensure_response(array('success' => true));
}

function payroll_delete_partial($request) {
    $month = sanitize_text_field($request->get_param('month'));
    $id    = sanitize_text_field($request['id']);
    $all   = payroll_get_partials();
    if (empty($all[$month])) return new WP_Error('not_found', 'Pago no encontrado', array('status' => 404));
    $before      = count($all[$month]);
    $all[$month] = array_values(array_filter($all[$month], function($x) use ($id) { return $x['id'] !== $id; }));
    if (count($all[$month]) === $before) return new WP_Error('not_found', 'Pago no encontrado', array('status' => 404));
    if (!$all[$month]) unset($all[$month]);
    update_option('blokes_payroll_partials', $all, false);
    return rest_ensure_response(array('success' => true));
}

function payroll_set_cash($request) {
    $body  = $request->get_json_params();
    $month = sanitize_text_field($body['month'] ?? '');
    $id    = sanitize_title($body['person'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }
    if (overtime_person_index(overtime_get_people(), $id) < 0) {
        return new WP_Error('not_found', 'Persona no encontrada', array('status' => 404));
    }
    $all = payroll_get_cash_payments();
    if (!empty($body['paid'])) {
        $all[$month][$id] = array(
            'amount' => round(floatval($body['amount'] ?? 0), 2),
            'date'   => current_time('Y-m-d'),
        );
        payroll_mark_extras_paid($month, $id);
    } else {
        unset($all[$month][$id]);
        if (empty($all[$month])) unset($all[$month]);
    }
    update_option('blokes_payroll_cash_payments', $all, false);
    return rest_ensure_response(array('success' => true));
}

// Totales de los últimos N meses hasta 'to' (incluido). La base usa los importes actuales.
function payroll_history($request) {
    $to     = sanitize_text_field($request->get_param('to'));
    $months = max(1, min(24, intval($request->get_param('months'))));
    $end    = DateTime::createFromFormat('Y-m-d', $to . '-01');
    if (!$end || !preg_match('/^\d{4}-\d{2}$/', $to)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }
    $people  = overtime_get_people();
    $entries = overtime_get_entries();
    $base    = payroll_get_base();
    $rates   = overtime_get_rates();

    $absences = payroll_get_absences();

    $out = array();
    for ($k = $months - 1; $k >= 0; $k--) {
        $m     = (clone $end)->modify("-{$k} months")->format('Y-m');
        $calc  = payroll_compute_month($m, $people, $entries, $base, $rates, $absences);
        $out[] = array_merge(array('month' => $m), $calc['totals']);
    }
    return rest_ensure_response(array('success' => true, 'data' => $out));
}

// Guarda nómina base, €/h extra y/o justificaciones. Solo se tocan las personas enviadas; un valor vacío o 0 lo borra.
function payroll_save_config($request) {
    $body   = $request->get_json_params();
    $people = overtime_get_people();

    $merge = function($current, $input) use ($people) {
        foreach ((is_array($input) ? $input : array()) as $id => $value) {
            $id = sanitize_title($id);
            if (overtime_person_index($people, $id) < 0) continue;
            $value = round(floatval($value), 2);
            if ($value > 0) $current[$id] = $value;
            else unset($current[$id]);
        }
        return $current;
    };

    $base  = payroll_get_base();
    $rates = overtime_get_rates();
    if (isset($body['base'])) {
        $base = $merge($base, $body['base']);
        update_option('blokes_payroll_base', $base, false);
    }
    if (isset($body['rates'])) {
        $rates = $merge($rates, $body['rates']);
        update_option('blokes_overtime_rates', $rates, false);
    }
    if (isset($body['cash_total'])) {
        update_option('blokes_payroll_cash_total', $merge(payroll_get_cash_totals(), $body['cash_total']), false);
    }
    if (isset($body['notes']) && is_array($body['notes'])) {
        $notes = payroll_get_notes();
        foreach ($body['notes'] as $id => $text) {
            $id = sanitize_title($id);
            if (overtime_person_index($people, $id) < 0) continue;
            $text = mb_substr(trim(sanitize_textarea_field((string) $text)), 0, 1000);
            if ($text !== '') $notes[$id] = $text;
            else unset($notes[$id]);
        }
        update_option('blokes_payroll_notes', $notes, false);
    }
    return rest_ensure_response(array('success' => true, 'config' => payroll_config_response($base, $rates)));
}
