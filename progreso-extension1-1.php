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
// Cuenta(s) de las tablets compartidas del gimnasio — ver Superadmin → Tablet.
$GLOBALS['blokes_tablets_emails'] = array();
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
        'tablets'    => (is_array($saved) && !empty($saved['tablets']))    ? $saved['tablets']    : $GLOBALS['blokes_tablets_emails'],
    );
}

/**
 * Returns the app-level role for the current user.
 * Checked against email whitelists — independent of WordPress roles.
 *   'socio'    → acceso total + Superadmin
 *   'gestion'  → acceso profesor + ExcelMuerte (Supervisión)
 *   'profesor' → Setter, Stats, Entrenamientos, Supervisión (Fichaje/TimeOff)
 *   'tablet'   → cuenta compartida de una tablet del gimnasio: Colección,
 *                Progreso y Ligas sin login personal; puede completar un
 *                bloke o crear un alumno manual en nombre de quien elija
 *   'member'   → usuario logueado sin permisos de gestión
 *   'guest'    → no logueado
 */
function blokes_get_app_role_real() {
    if (!is_user_logged_in()) return 'guest';
    $email = strtolower(trim(wp_get_current_user()->user_email));
    $lists = blokes_get_email_lists();
    if (in_array($email, array_map('strtolower', $lists['socios'])))     return 'socio';
    if (in_array($email, array_map('strtolower', $lists['gestion'])))    return 'gestion';
    if (in_array($email, array_map('strtolower', $lists['profesores']))) return 'profesor';
    if (in_array($email, array_map('strtolower', $lists['tablets'])))    return 'tablet';
    return 'member';
}

// "Ver como" (Ramiro, 1/11 18:30): un socio puede probar la app como si fuera gestion o
// profesor de verdad — también lo que responde el servidor (p. ej. la privacidad del dinero),
// no solo lo que se pinta. Solo restringe, nunca amplía: la cabecera solo se respeta si el rol
// REAL es socio; para cualquier otro rol se ignora sin más, así que no sirve para ganar acceso.
// "Ver como: Tablet" (Ramiro, 08/11 21:19, corrige el "modo tablet" anterior) es DISTINTO:
// "es para que los profes puedan loguear los tops de los usuarios, simplemente tiene que
// simular como cuando estás logueado como si fueses el usuario tablet" — así que, a diferencia
// de gestion/profesor (solo socio, solo lectura), esto SÍ deja escribir y lo pueden simular los
// 3 roles que ya pueden actuar en nombre de otro (blokes_can_supervise): socio, profesor y
// gestion. Quién lo apunta de verdad (get_current_user_id(), nunca tocado por esta cabecera)
// sigue siendo la sesión real, así que queda registrado igual que si no hubiera "ver como".
function blokes_get_app_role() {
    $real = blokes_get_app_role_real();
    $ver_como = isset($_SERVER['HTTP_X_BLOKES_VER_COMO']) ? sanitize_key($_SERVER['HTTP_X_BLOKES_VER_COMO']) : '';
    if ($ver_como === 'tablet' && in_array($real, array('socio', 'profesor', 'gestion'), true)) {
        return 'tablet';
    }
    // "member" = "Usuario" en el selector (Ramiro, 11/11 05:01: para que el socio vea lo que ve
    // la gente normal, sin ningún rol especial).
    if ($real === 'socio' && in_array($ver_como, array('gestion', 'profesor', 'member'), true)) {
        // Respaldo del filtro rest_pre_dispatch: en algunos namespaces (progreso/v1) no
        // corta la escritura a tiempo, así que lo repetimos aquí dentro, que se llama
        // desde todos los permission_callback de todos los namespaces sin excepción.
        $metodo = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';
        if (in_array($metodo, array('POST', 'PUT', 'PATCH', 'DELETE'), true) && defined('REST_REQUEST') && REST_REQUEST) {
            wp_send_json(array('code' => 'ver_como_solo_lectura', 'message' => 'Estás en modo "Ver como": vuelve a Socio para cambiar cosas.'), 403);
        }
        return $ver_como;
    }
    return $real;
}

// "Puede actuar en nombre de un alumno": medir, crear manuales, y ahora
// también completar un bloke o ver el progreso de otra persona desde la
// tablet. 'tablet' se suma aquí a propósito — es justo lo que necesita.
function blokes_can_supervise() {
    return in_array(blokes_get_app_role(), array('profesor', 'gestion', 'socio', 'tablet'));
}

// Dinero AGREGADO del club (ingresos, ganancias, P&L, gastos, sueldos) es solo para socio —
// nunca para gestion, profesor, tablet ni acceso de Eventos, aunque vean esa pantalla por otro
// motivo (31/10, regla de Ramiro). Lo que debe/paga CADA alumno o reserva sí lo necesita
// gestion para su trabajo y no entra en esta regla.
function blokes_es_socio() {
    return blokes_get_app_role() === 'socio';
}

// "Ver como" (continuación): mientras esté activo, cualquier escritura en la REST API se
// rechaza — es solo para mirar, nunca para actuar en nombre de otro rol por accidente. Se
// comprueba el ROL REAL directamente (no `blokes_get_app_role()`) para no depender de que
// ningún otro filtro se haya ejecutado antes.
add_filter('rest_pre_dispatch', function($result, $server, $request) {
    if (!in_array($request->get_method(), array('POST', 'PUT', 'PATCH', 'DELETE'), true)) return $result;
    $ver_como = isset($_SERVER['HTTP_X_BLOKES_VER_COMO']) ? sanitize_key($_SERVER['HTTP_X_BLOKES_VER_COMO']) : '';
    if (!in_array($ver_como, array('gestion', 'profesor', 'member'), true)) return $result;
    if (blokes_get_app_role_real() !== 'socio') return $result; // la cabecera no sirve para nadie más
    return new WP_Error('ver_como_solo_lectura', 'Estás en modo "Ver como": vuelve a Socio para cambiar cosas.', array('status' => 403));
}, 10, 3);

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

// ============================================================
//  "Instala Blokes" — /app es SOLO para la vista previa de WhatsApp
//  (NOTAS_PARA_CODE_instalar_app.md). El crawler de WhatsApp no ejecuta JS, así
//  que las etiquetas og:* tienen que estar en el HTML que devuelve el
//  servidor a la primera — por eso esto sigue siendo PHP suelto y no la SPA.
//  Para una persona de carne y hueso, esta página solo hace una cosa: mandarla
//  a /blokes/instalar (ESA sí es una ruta de React, dentro del scope del
//  manifest/service worker — ahí es donde puede instalarse de verdad; ver
//  InstalarPage.jsx. Ramiro, 09/11 11:53: el botón de aquí no podía instalar
//  nada porque /app está fuera de ese scope).
// ============================================================

// Priority 0: tiene que ganar a la SPA de abajo (prioridad 1).
add_action('template_redirect', function() {
    $path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    if ($path !== 'app') return;

    // WP ya marcó esta URL como 404 en parse_request (no hay página "app"), así que sin esto
    // el navegador y los crawlers (WhatsApp incluido) verían un 404 aunque el HTML sea bueno.
    status_header(200);
    nocache_headers();

    // Fecha de la próxima compe real (no de prueba) para la descripción que ve WhatsApp.
    $compe = null;
    switch_to_blog(3);
    global $wpdb;
    $row = $wpdb->get_row(
        "SELECT name, comp_date, comp_end_date FROM " . progreso_equip_table('competitions') . "
         WHERE is_test = 0 AND comp_date >= CURDATE() ORDER BY comp_date ASC LIMIT 1", ARRAY_A
    );
    if ($row) $compe = $row;
    restore_current_blog();

    $app_url      = home_url('/app');
    // Los utm_source/utm_campaign que añade /c/{token} llegan aquí en la query de /app — si no
    // se pasan a /blokes/instalar se pierden (cowork, 11/11 07:30).
    $query_utm = isset($_GET) ? array_intersect_key($_GET, array_flip(array('utm_source', 'utm_campaign', 'utm_medium'))) : array();
    $instalar_url = home_url('/blokes/instalar') . ($query_utm ? '?' . http_build_query($query_utm) : '');
    $icon_url     = home_url('/blokes/icons/icon-512.png');

    $og_desc = $compe
        ? "Instálala en el móvil antes de la compe del " . date_i18n('j \d\e F', strtotime($compe['comp_date'])) . ": apunta tus tops en segundos."
        : 'La app de Rocoteca Madrid para apuntar tus tops de búlder.';

    header('Content-Type: text/html; charset=UTF-8');
    ?><!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instala Blokes — Rocoteca Madrid</title>
<meta name="description" content="<?php echo esc_attr($og_desc); ?>">
<meta property="og:title" content="Blokes — la app de Rocoteca Madrid">
<meta property="og:description" content="<?php echo esc_attr($og_desc); ?>">
<meta property="og:image" content="<?php echo esc_url($icon_url); ?>">
<meta property="og:type" content="website">
<meta property="og:url" content="<?php echo esc_url($app_url); ?>">
<link rel="icon" href="<?php echo esc_url($icon_url); ?>">
<meta http-equiv="refresh" content="0;url=<?php echo esc_url($instalar_url); ?>">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1f1f1f;color:#f4f0e4;font-family:system-ui,sans-serif;text-align:center;padding:16px}
a{color:#D0962B;font-weight:700}</style>
</head>
<body>
<div><p>Abriendo Blokes…</p><p><a href="<?php echo esc_url($instalar_url); ?>">Toca aquí si no pasa nada</a></p></div>
<script>location.replace(<?php echo wp_json_encode($instalar_url); ?>);</script>
</body>
</html>
    <?php
    exit;
}, 0);

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
    $data['bloke_retirado']         = get_post_meta($post->ID, 'bloke_retirado', true) ?: null;
    $data['bloke_retirado_por']     = get_post_meta($post->ID, 'bloke_retirado_por', true) ?: null;
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
        $all = blokes_get_all_subscription_data();
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
        // Identidad real, sin "ver como" — nunca se simula (el header que lo activa no llega
        // en una carga normal de página, así que esto ya sale correcto de por sí).
        'userRoleReal'     => blokes_get_app_role_real(),
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

    // Blokes totals for someone else — the tablet's "Yo" needs this for
    // whoever was picked, real user or manual alumno.
    register_rest_route('blokes/v1', '/completions/subject', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_get_subject_completions',
        'permission_callback' => function() { return blokes_can_supervise(); },
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

    // "Instala Blokes" (NOTAS_PARA_CODE_instalar_app.md) — para ver en Supervisión si el
    // gancho funciona. Público porque appinstalled puede dispararse sin sesión iniciada.
    register_rest_route('blokes/v1', '/install-event', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_registrar_install_event',
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
            'user_id'        => array('required' => false, 'type' => 'integer'),
            'placeholder_id' => array('required' => false, 'type' => 'integer'),
            'test_id'        => array('required' => true,  'type' => 'integer'),
            'value_kg'       => array('required' => true,  'type' => 'number'),
        ),
    ));

    register_rest_route('progreso/v1', '/alumnos/manual', array(
        'methods'             => 'POST',
        'callback'            => 'progreso_create_alumno_manual',
        'permission_callback' => function() { return blokes_can_supervise(); },
        'args' => array(
            'nombre'  => array('required' => true, 'type' => 'string'),
            'dia'     => array('required' => false, 'type' => 'string'),
            'horario' => array('required' => false, 'type' => 'string'),
            'edad'    => array('required' => false, 'type' => 'string'),
            'turno'   => array('required' => false, 'type' => 'string'),
        ),
    ));

    register_rest_route('progreso/v1', '/alumnos/manual/(?P<id>\d+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'progreso_delete_alumno_manual',
        'permission_callback' => function() { return blokes_can_supervise(); },
    ));

    register_rest_route('progreso/v1', '/alumnos/manual/(?P<id>\d+)/link', array(
        'methods'             => 'POST',
        'callback'            => 'progreso_link_alumno_manual',
        'permission_callback' => function() { return blokes_can_supervise(); },
        'args' => array(
            'email' => array('required' => true, 'type' => 'string'),
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

    // ── Organización (equipación / route-setting) ── visible solo a
    // profesor/gestión/socio, igual que el resto de "Tareas y setter".
    $equip_perm = function() { return in_array(blokes_get_app_role(), array('profesor', 'gestion', 'socio')); };
    // Ramiro 12/11 11:35: "no pueden editar alguien que no sea Álvaro o los socios las tareas,
    // ni Ana ni Edu ni Sara" — ni ocultando botones basta ("no basta con ocultar los botones"),
    // tiene que devolver 403 también si llega directo a la API. progreso_equip_es_jefe_o_socio()
    // está en progreso_equip_ensure_tables()/zona de funciones de abajo.
    $equip_jefe_perm = function() { return progreso_equip_es_jefe_o_socio(); };

    register_rest_route('progreso/v1', '/equipacion/config', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_config', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/task-types/all', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_all_task_types', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/task-types', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_create_task_type', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/task-types/(?P<id>[a-z0-9_-]+)', array(
        'methods' => 'PUT', 'callback' => 'progreso_equip_update_task_type', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/task-types/(?P<id>[a-z0-9_-]+)', array(
        'methods' => 'DELETE', 'callback' => 'progreso_equip_deactivate_task_type', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/tasks', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_create_loose_task', 'permission_callback' => $equip_jefe_perm,
    ));

    register_rest_route('progreso/v1', '/equipacion/workers', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_workers', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/workers', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_create_worker', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/workers/(?P<id>\d+)', array(
        'methods' => 'PUT', 'callback' => 'progreso_equip_update_worker', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/workers/(?P<id>\d+)', array(
        'methods' => 'DELETE', 'callback' => 'progreso_equip_delete_worker', 'permission_callback' => $equip_perm,
    ));

    register_rest_route('progreso/v1', '/equipacion/holdsets', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_holdsets', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/holdsets', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_create_holdset', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/holdsets/(?P<id>\d+)', array(
        'methods' => 'DELETE', 'callback' => 'progreso_equip_delete_holdset', 'permission_callback' => $equip_perm,
    ));

    register_rest_route('progreso/v1', '/equipacion/weeks', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_weeks', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/weeks', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_create_week', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/weeks/(?P<id>\d+)', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_week_detail', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/weeks/(?P<id>\d+)', array(
        'methods' => 'PUT', 'callback' => 'progreso_equip_update_week', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/weeks/(?P<id>\d+)', array(
        'methods' => 'DELETE', 'callback' => 'progreso_equip_delete_week', 'permission_callback' => $equip_jefe_perm,
    ));
    // Calendario de semanas + rotación de zonas (Ramiro 12/11 09:31/09:35/09:37).
    register_rest_route('progreso/v1', '/equipacion/zonas', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_zonas', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/zonas', array(
        'methods' => 'PUT', 'callback' => 'progreso_equip_update_zonas', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/zonas/arranque', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_set_zona_arranque', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/zonas/sugerida', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_zona_sugerida', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/weeks/(?P<id>\d+)/limpiar-retrasadas-falsas', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_limpiar_retrasadas_falsas', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/weeks/(?P<id>\d+)/assignments', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_week_add_assignment', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/assignments/(?P<id>\d+)', array(
        array('methods' => 'PUT',    'callback' => 'progreso_equip_update_assignment', 'permission_callback' => $equip_jefe_perm),
        array('methods' => 'DELETE', 'callback' => 'progreso_equip_delete_assignment',  'permission_callback' => $equip_jefe_perm),
    ));

    register_rest_route('progreso/v1', '/equipacion/today', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_today', 'permission_callback' => $equip_perm,
    ));

    // PUT se queda en $equip_perm (cualquier equipador puede marcar su propia tarea como
    // hecha) — progreso_equip_update_task() comprueba por dentro si lo que llega es algo MÁS
    // que "done" (fecha, persona, texto, notas, subzona) y ahí sí exige jefe_o_socio.
    register_rest_route('progreso/v1', '/equipacion/tasks/(?P<id>\d+)', array(
        array('methods' => 'PUT',    'callback' => 'progreso_equip_update_task', 'permission_callback' => $equip_perm),
        array('methods' => 'DELETE', 'callback' => 'progreso_equip_delete_task',  'permission_callback' => $equip_jefe_perm),
    ));
    register_rest_route('progreso/v1', '/equipacion/tasks/(?P<id>\d+)/postpone', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_postpone_task', 'permission_callback' => $equip_jefe_perm,
    ));
    // "⧉ Duplicar a..." (Ramiro 12/11 11:40).
    register_rest_route('progreso/v1', '/equipacion/tasks/(?P<id>\d+)/duplicar', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_duplicar_tarea', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/weeks/historico', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_weeks_historico', 'permission_callback' => $equip_perm,
    ));
    // Migración puntual del lío de los dos sitios (NOTAS_PARA_CODE_equipacion.md, 3/11 12:00) —
    // solo socio, nunca el gate normal de equipación.
    register_rest_route('progreso/v1', '/equipacion/migrar-principal-a-club', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_migrar_principal_a_club',
        'permission_callback' => function() { return blokes_get_app_role() === 'socio'; },
    ));

    register_rest_route('progreso/v1', '/equipacion/blocks', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_create_block', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/blocks/(?P<id>\d+)', array(
        'methods' => 'PUT', 'callback' => 'progreso_equip_update_block', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/blocks/(?P<id>\d+)', array(
        'methods' => 'DELETE', 'callback' => 'progreso_equip_delete_block', 'permission_callback' => $equip_perm,
    ));

    register_rest_route('progreso/v1', '/equipacion/competitions', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_competitions', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/competitions', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_create_competition', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_competition_detail', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)', array(
        'methods' => 'PUT', 'callback' => 'progreso_equip_update_competition', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)', array(
        'methods' => 'DELETE', 'callback' => 'progreso_equip_delete_competition', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/comp-blocks/(?P<id>\d+)', array(
        'methods' => 'PUT', 'callback' => 'progreso_equip_update_comp_block', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/comp-blocks/(?P<id>\d+)/photo', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_upload_comp_block_photo', 'permission_callback' => $equip_perm,
    ));
    // "Vamos bien de tiempo, añadir el 17 y 18" (Ramiro, 11/11 05:01) — nunca dar por hecho que
    // una compe tiene 16 bloques fijos.
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)/comp-blocks', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_add_comp_block', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/comp-blocks/(?P<id>\d+)', array(
        'methods' => 'DELETE', 'callback' => 'progreso_equip_delete_comp_block', 'permission_callback' => $equip_perm,
    ));
    // Punto 8 (Ramiro, 11/11 05:01): "Fijar bloque" — intercambiar el número de dos bloques ya
    // puestos sin mover burbujas/fichas/resultados, que van con el id del bloque físico, no con
    // el número.
    register_rest_route('progreso/v1', '/equipacion/comp-blocks/(?P<id>\d+)/intercambiar-numero', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_intercambiar_numero_comp_block', 'permission_callback' => $equip_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)/generate-plan', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_competition_generate_plan', 'permission_callback' => $equip_jefe_perm,
    ));
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)/plan', array(
        'methods' => 'GET', 'callback' => 'progreso_equip_get_competition_plan', 'permission_callback' => $equip_perm,
    ));
    // "+ Tarea" a mano en una columna del plan (Ramiro 12/11 10:44).
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)/tasks', array(
        'methods' => 'POST', 'callback' => 'progreso_equip_competition_add_task', 'permission_callback' => $equip_jefe_perm,
    ));

    // "La compe en Blokes" (NOTAS_PARA_CODE_compe_en_blokes.md, Ramiro 7/11). Encender/apagar el
    // modo compe es solo de un socio; estado es público (lo lee el móvil sin login para saber si
    // hay compe activa, y más adelante la pantalla de la tele); apuntar/leer resultado necesita
    // sesión normal.
    register_rest_route('progreso/v1', '/equipacion/competitions/(?P<id>\d+)/modo-compe', array(
        // Inline (no $socio_perm compartido en este cierre): progreso_equip_set_modo_compe()
        // ya comprueba blokes_es_socio() otra vez por dentro, esto es solo para que el error
        // salga como 403 normal de WP REST en vez de dentro de la respuesta.
        'methods' => 'POST', 'callback' => 'progreso_equip_set_modo_compe', 'permission_callback' => function() { return blokes_es_socio(); },
    ));
    register_rest_route('progreso/v1', '/compe/estado', array(
        'methods' => 'GET', 'callback' => 'progreso_compe_estado', 'permission_callback' => '__return_true',
    ));
    // Para la página "Instala Blokes" (/blokes/instalar) — la próxima compe real
    // (is_test=0), aunque todavía no esté en modo_activo (eso solo se activa el día de la
    // compe; el gancho de la instaladora tiene que verse desde días antes).
    register_rest_route('progreso/v1', '/compe/proxima', array(
        'methods' => 'GET', 'callback' => 'progreso_compe_proxima', 'permission_callback' => '__return_true',
    ));
    // Tele del Roco: lectura pública de las diapositivas activas, para la tele (sin login).
    register_rest_route('progreso/v1', '/tele/diapositivas', array(
        'methods' => 'GET', 'callback' => 'progreso_tele_diapositivas', 'permission_callback' => '__return_true',
    ));
    // Mantenimiento: limpia blokes de compe de prueba que quedaron en la papelera de rondas
    // anteriores (cowork, 08/11 11:15) — solo socio.
    register_rest_route('progreso/v1', '/compe/limpiar-blokes-prueba-antiguos', array(
        'methods' => 'POST', 'callback' => 'progreso_compe_limpiar_blokes_prueba_antiguos', 'permission_callback' => function() { return blokes_es_socio(); },
    ));
    register_rest_route('progreso/v1', '/compe/resultado', array(
        'methods' => 'POST', 'callback' => 'progreso_compe_apuntar_resultado', 'permission_callback' => 'is_user_logged_in',
    ));
    register_rest_route('progreso/v1', '/compe/mis-resultados', array(
        'methods' => 'GET', 'callback' => 'progreso_compe_mis_resultados', 'permission_callback' => 'is_user_logged_in',
    ));
    // Pantalla de la tele: público, sin login (Ramiro, punto 5).
    register_rest_route('progreso/v1', '/compe/clasificacion', array(
        'methods' => 'GET', 'callback' => 'progreso_compe_clasificacion', 'permission_callback' => '__return_true',
    ));
    // Recepción (Ramiro, punto 6): "¿quién eres?" + participante rápido sin cuenta.
    register_rest_route('progreso/v1', '/compe/buscar-participante', array(
        'methods' => 'GET', 'callback' => 'progreso_compe_buscar_participante', 'permission_callback' => 'is_user_logged_in',
    ));
    register_rest_route('progreso/v1', '/compe/participante-rapido', array(
        'methods' => 'POST', 'callback' => 'progreso_compe_crear_participante_rapido', 'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('progreso/v1', '/training/me', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_training_me',
        'permission_callback' => 'is_user_logged_in',
    ));

    register_rest_route('progreso/v1', '/training/completitud', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_training_completitud',
        'permission_callback' => function() { return blokes_can_supervise(); },
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

    register_rest_route('progreso/v1', '/training/placeholder/(?P<placeholder_id>\d+)', array(
        'methods'             => 'GET',
        'callback'            => 'progreso_get_training_placeholder',
        'permission_callback' => function() { return blokes_can_supervise(); },
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
    $sa_perm    = function() { return in_array(blokes_get_app_role(), array('socio', 'gestion')); };
    // Dinero agregado del club: solo socio, ni siquiera gestion (31/10, regla de Ramiro —
    // ver NOTAS_PARA_CODE_privacidad_dinero.md).
    $socio_perm = function() { return blokes_es_socio(); };

    register_rest_route('superadmin/v1', '/revenue', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_revenue',
        'permission_callback' => $socio_perm,
        'args'                => array('months' => array('type' => 'integer', 'default' => 12)),
    ));
    register_rest_route('superadmin/v1', '/products', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_products',
        'permission_callback' => $socio_perm,
        'args'                => array('months' => array('type' => 'integer', 'default' => 12)),
    ));
    register_rest_route('superadmin/v1', '/people-summary', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_people_summary',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/classes', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_classes',
        'permission_callback' => $sa_perm,
        'args'                => array('months' => array('type' => 'integer', 'default' => 12)),
    ));
    register_rest_route('superadmin/v1', '/gestion/grupos', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_gestion_grupos',
        'permission_callback' => $sa_perm,
        'args'                => array('months' => array('type' => 'integer', 'default' => 4)),
    ));
    register_rest_route('superadmin/v1', '/gestion/marcar-cobrado', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_marcar_cobrado',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/facturas-pendientes', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_gestion_facturas_pendientes',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/facturas-pendientes/(?P<id>\d+)/completar', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_facturas_pendientes_completar',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/adelantados', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_gestion_adelantados_listar',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/adelantados/(?P<id>\d+)/anular', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_adelantado_anular',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/pausar', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_pausar',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/reanudar', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_reanudar',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/log', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_gestion_log_get',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/nota', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_nota',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/dar-de-baja', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_dar_de_baja',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/fusionar', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_fusionar',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/exento', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_exento',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/cambiar-grupo', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_cambiar_grupo',
        'permission_callback' => $sa_perm,
    ));
    // Migración de una vez (cowork, 07/11 08:15): corrige la meta visible de día/horario/edad en
    // las suscripciones que ya se cambiaron de grupo antes de este arreglo. Idempotente — se
    // puede llamar más de una vez sin riesgo, solo vuelve a poner el mismo valor correcto.
    register_rest_route('superadmin/v1', '/gestion/cambiar-grupo/arreglar-meta-visible', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_cambiar_grupo_arreglar_meta_visible',
        'permission_callback' => $sa_perm,
    ));
    // Nombre real y teléfono del alumno, editables desde Grupos sin tocar wp-admin (31/10,
    // NOTAS_PARA_CODE_grupos_como_excel.md) — para cuando la suscripción se dio de alta sin
    // dirección de facturación y solo se ve el usuario de la cuenta de WordPress, no un nombre real.
    register_rest_route('superadmin/v1', '/gestion/editar-alumno', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_editar_alumno',
        'permission_callback' => $sa_perm,
    ));
    // Buscar alumno (nombre, teléfono o email) en suscripciones, externos y usuarios de
    // WordPress, para el botón "Añadir alumno" de cada grupo (grupos_como_excel.md, punto 5).
    register_rest_route('superadmin/v1', '/gestion/buscar-alumno', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_gestion_buscar_alumno',
        'permission_callback' => $sa_perm,
    ));
    // Crear cliente nuevo en WooCommerce desde "Añadir alumno" cuando no existe (Ramiro, 07/11
    // 08:06) — Eva (gestión) y socios, igual que el resto de Grupos.
    register_rest_route('superadmin/v1', '/gestion/alta-cliente', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_alta_cliente',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/externos', array(
        array('methods' => 'GET',  'callback' => 'superadmin_gestion_externos_get',   'permission_callback' => $sa_perm),
        array('methods' => 'POST', 'callback' => 'superadmin_gestion_externos_crear', 'permission_callback' => $sa_perm),
    ));
    register_rest_route('superadmin/v1', '/gestion/externos/importar', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_externos_importar',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/externos/(?P<id>\d+)', array(
        array('methods' => 'PUT',    'callback' => 'superadmin_gestion_externos_actualizar', 'permission_callback' => $sa_perm),
        array('methods' => 'DELETE', 'callback' => 'superadmin_gestion_externos_borrar',      'permission_callback' => $sa_perm),
    ));
    register_rest_route('superadmin/v1', '/gestion/externos/(?P<id>\d+)/pago', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_externos_pago',
        'permission_callback' => $sa_perm,
    ));

    // Lista de espera por grupo (interesados que aún no son alumnos — grupos_como_excel.md,
    // punto 7). Independiente de "en espera" de una suscripción on-hold: esto es gente sin
    // ninguna suscripción ni externo todavía.
    register_rest_route('superadmin/v1', '/gestion/lista-espera', array(
        array('methods' => 'GET',  'callback' => 'superadmin_gestion_lista_espera_get',   'permission_callback' => $sa_perm),
        array('methods' => 'POST', 'callback' => 'superadmin_gestion_lista_espera_crear',  'permission_callback' => $sa_perm),
    ));
    register_rest_route('superadmin/v1', '/gestion/lista-espera/(?P<id>\d+)', array(
        array('methods' => 'PUT',    'callback' => 'superadmin_gestion_lista_espera_actualizar', 'permission_callback' => $sa_perm),
        array('methods' => 'DELETE', 'callback' => 'superadmin_gestion_lista_espera_borrar',      'permission_callback' => $sa_perm),
    ));

    // Sincronización Grupos ⇄ Google Sheets (NOTAS_PARA_CODE_sync_grupos.md) — de momento solo
    // configuración y una prueba de conexión de solo lectura contra la Hoja de PRUEBA.
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/config', array(
        array('methods' => 'GET',  'callback' => 'superadmin_sync_grupos_config_get', 'permission_callback' => $sa_perm),
        array('methods' => 'POST', 'callback' => 'superadmin_sync_grupos_config_set', 'permission_callback' => $sa_perm),
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/test', array(
        'methods' => 'GET', 'callback' => 'superadmin_sync_grupos_test', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/resumen', array(
        'methods' => 'GET', 'callback' => 'superadmin_sync_grupos_resumen', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/pestana', array(
        'methods' => 'GET', 'callback' => 'superadmin_sync_grupos_pestana', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/sincronizar', array(
        'methods' => 'POST', 'callback' => 'superadmin_sync_grupos_sincronizar_ahora', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/cambios', array(
        'methods' => 'GET', 'callback' => 'superadmin_sync_grupos_cambios_listar', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/cambios/(?P<id>\d+)/aplicar', array(
        'methods' => 'POST', 'callback' => 'superadmin_sync_grupos_cambio_aplicar', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/cambios/(?P<id>\d+)/descartar', array(
        'methods' => 'POST', 'callback' => 'superadmin_sync_grupos_cambio_descartar', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/reintentar-cobro', array(
        'methods' => 'POST', 'callback' => 'superadmin_sync_grupos_reintentar_cobro', 'permission_callback' => $sa_perm,
    ));
    // WP-Cron no corre de fiar con poco tráfico (pseudo-cron: solo se dispara si entra una
    // visita después de la hora programada) — Ramiro, NOTAS_PARA_CODE_sync_grupos.md 3/11 17:05:
    // "esto tiene que pasar automático". Ruta pública protegida por secreto (como el webhook de
    // 9to5) para que un cron de verdad del hosting la llame cada 10-15 min.
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/cron-tick', array(
        'methods' => 'GET', 'callback' => 'superadmin_sync_grupos_cron_tick', 'permission_callback' => '__return_true',
    ));
    // Para que cowork/Ramiro recuperen la URL exacta (con el secreto) y la peguen en el panel
    // de SiteGround — con sesión, nunca a ciegas por curl sin credenciales.
    register_rest_route('superadmin/v1', '/gestion/sync-grupos/cron-url', array(
        'methods' => 'GET', 'callback' => 'superadmin_sync_grupos_cron_url', 'permission_callback' => $sa_perm,
    ));

    // Calendario de días especiales del club (NOTAS_PARA_CODE_calendario.md): festivos, cierres
    // y horarios especiales, con una decisión por día. Ver y listar: cualquiera con acceso a
    // Supervisión (gestión incluida). Decidir (marcar abre/cierra/horario especial) es solo del
    // rol socio, como pide Ramiro en la nota.
    register_rest_route('superadmin/v1', '/gestion/club-days', array(
        array('methods' => 'GET',  'callback' => 'superadmin_club_days_listar', 'permission_callback' => $sa_perm),
        array('methods' => 'POST', 'callback' => 'superadmin_club_days_crear',  'permission_callback' => $socio_perm),
    ));
    register_rest_route('superadmin/v1', '/gestion/club-days/(?P<id>\d+)', array(
        array('methods' => 'PUT',    'callback' => 'superadmin_club_days_editar', 'permission_callback' => $socio_perm),
        array('methods' => 'DELETE', 'callback' => 'superadmin_club_days_borrar', 'permission_callback' => $socio_perm),
    ));

    // Abonos anual/trimestral de escalada libre, derivados de los mensuales (5114/5115) sin
    // tocarlos — Ramiro, NOTAS_PARA_CODE_abono_anual.md 06/11. Crea productos nuevos (duplicando
    // el mensual correspondiente), nunca convierte ni toca los suscriptores actuales. Solo socio:
    // crea productos/precios reales.
    register_rest_route('superadmin/v1', '/gestion/abonos/crear-periodicidad', array(
        'methods' => 'POST', 'callback' => 'superadmin_abonos_crear_periodicidad', 'permission_callback' => $socio_perm,
    ));

    // Histórico de pagos importado (HV Control de Clientes, NOTAS_PARA_CODE_hv_control_clientes.md)
    // — solo socio, es dinero agregado/datos de clientes antiguos.
    register_rest_route('superadmin/v1', '/gestion/hist-pagos/importar', array(
        'methods' => 'POST', 'callback' => 'superadmin_hist_pagos_importar', 'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/hist-pagos/resumen', array(
        'methods' => 'GET', 'callback' => 'superadmin_hist_pagos_resumen', 'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/hist-pagos/resumen-mananas', array(
        'methods' => 'GET', 'callback' => 'superadmin_hist_pagos_resumen_mananas', 'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/gestion/hist-pagos/estadisticas', array(
        'methods' => 'GET', 'callback' => 'superadmin_hist_pagos_estadisticas', 'permission_callback' => $socio_perm,
    ));

    register_rest_route('superadmin/v1', '/expenses', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'superadmin_get_expenses',
            'permission_callback' => $socio_perm,
            'args'                => array(
                'from'             => array('type' => 'string',  'default' => ''),
                'entity'           => array('type' => 'string',  'default' => 'all'),
                'exclude_internal' => array('type' => 'integer', 'default' => 1),
            ),
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'superadmin_save_expenses',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'superadmin_delete_expenses',
            'permission_callback' => $socio_perm,
            'args'                => array(
                'month'  => array('type' => 'string', 'required' => false, 'default' => ''),
                'entity' => array('type' => 'string', 'required' => false, 'default' => ''),
            ),
        ),
    ));

    // Remitentes de transferencias ya clasificados a mano (Clases/Eventos/...), compartido
    // entre Eva y Ramiro (antes vivía solo en el navegador de quien lo clasificó).
    register_rest_route('superadmin/v1', '/expenses/senders', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'superadmin_get_expense_senders',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'superadmin_save_expense_sender',
            'permission_callback' => $socio_perm,
        ),
    ));

    // ── Presupuesto anual de pagos vs. bancos (solo socios) ──
    // Reglas aprendidas "concepto del banco → categoría"
    register_rest_route('superadmin/v1', '/expense-rules', array(
        array('methods' => 'GET',  'callback' => 'superadmin_get_expense_rules',  'permission_callback' => $socio_perm),
        array('methods' => 'POST', 'callback' => 'superadmin_save_expense_rules', 'permission_callback' => $socio_perm),
    ));
    // Cambiar la categoría de un movimiento ya guardado
    register_rest_route('superadmin/v1', '/expense-item-category', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_set_expense_item_category',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/budget', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'superadmin_get_budget',
            'permission_callback' => $socio_perm,
            'args'                => array('year' => array('type' => 'integer', 'required' => true)),
        ),
        array('methods' => 'POST', 'callback' => 'superadmin_save_budget', 'permission_callback' => $socio_perm),
    ));

    // ── Campañas de WhatsApp (fase a: envío manual wa.me) ──
    register_rest_route('superadmin/v1', '/gestion/bajas-motivo', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_gestion_bajas_motivo',
        'permission_callback' => $sa_perm,
    ));
    // Ficha de Grupos (fase b): para que Eva lo marque cuando alguien dice que sí en persona o
    // por WhatsApp.
    register_rest_route('superadmin/v1', '/gestion/optin-whatsapp', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_gestion_optin_whatsapp',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas/contactos/importar', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_campanas_importar_contactos',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas/contactos', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_campanas_listar_contactos',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas/contactos/(?P<id>\d+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'superadmin_campanas_borrar_contacto',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas/envios-hoy', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_campanas_envios_hoy',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'superadmin_campanas_listar',
            'permission_callback' => $sa_perm,
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'superadmin_campanas_crear',
            'permission_callback' => $sa_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/campanas/(?P<id>\d+)', array(
        'methods'             => 'PUT',
        'callback'            => 'superadmin_campanas_editar',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas/(?P<id>\d+)/destinatarios', array(
        'methods'             => 'GET',
        'callback'            => 'superadmin_campanas_destinatarios',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas/(?P<id>\d+)/contactos/(?P<contacto_id>\d+)/accion', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_campanas_marcar_accion',
        'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/campanas/(?P<id>\d+)/deshacer-enviados', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_campanas_deshacer_enviados',
        'permission_callback' => $sa_perm,
    ));
    // Parte C de la trazabilidad (Ramiro, 11/11 05:35): cruce indirecto por teléfono, para lo ya
    // enviado sin enlace y para quien no hace clic pero vuelve igual.
    register_rest_route('superadmin/v1', '/campanas/(?P<id>\d+)/recalcular-indirectas', array(
        'methods'             => 'POST',
        'callback'            => 'superadmin_campanas_recalcular_indirectas',
        'permission_callback' => $sa_perm,
    ));

    // Tele del Roco (NOTAS_PARA_CODE_tele_roco.md) — gestión de diapositivas, solo socio/gestión.
    register_rest_route('superadmin/v1', '/tele-slides', array(
        'methods' => 'GET', 'callback' => 'superadmin_tele_slides_listar', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/tele-slides', array(
        'methods' => 'POST', 'callback' => 'superadmin_tele_slides_crear', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/tele-slides/(?P<id>\d+)', array(
        'methods' => 'PUT', 'callback' => 'superadmin_tele_slides_editar', 'permission_callback' => $sa_perm,
    ));
    register_rest_route('superadmin/v1', '/tele-slides/(?P<id>\d+)', array(
        'methods' => 'DELETE', 'callback' => 'superadmin_tele_slides_borrar', 'permission_callback' => $sa_perm,
    ));
});

// ============================================================
//  superadmin/v1 — expenses
// ============================================================

function blokes_exp_option_key($month, $entity) { return 'blokes_exp_' . str_replace('-', '_', $month) . '_' . $entity; }

function blokes_exp_load_month($month, $entity) {
    $raw   = get_option(blokes_exp_option_key($month, $entity));
    $saved = $raw ? json_decode($raw, true) : null;
    return (is_array($saved) && is_array($saved['items'] ?? null)) ? $saved['items'] : array();
}

// Clave de un movimiento para no duplicarlo: fecha de operación (no fecha valor — esa falta en
// lo guardado antes de tenerla, así que no casaría con lo viejo), concepto, importe y saldo
// posterior. El saldo es necesario porque fecha+concepto+importe no basta: dos transferencias
// reales y distintas el mismo día por el mismo importe exacto (p. ej. dos alumnos pagando la
// misma cuota) comparten esos tres datos y no son el mismo movimiento.
function blokes_exp_item_key($item) {
    $fecha = $item['fecha'] ?? '';
    return $fecha . '|' . trim((string) ($item['concepto'] ?? '')) . '|' . round(floatval($item['importe'] ?? 0), 2) . '|' . ($item['saldo'] ?? '');
}

// Guarda los movimientos de un mes/entidad FUSIONANDO con lo que ya hubiera (por defecto):
// una subida de octubre no puede borrar lo que ya había en septiembre o machacar noviembre,
// algo que con fecha valor pasa en casi cualquier CSV que cruce fin de mes. Para sustituir el
// mes entero a propósito, hay que borrarlo primero desde "Gestionar" (o mandar `replace: true`).
function superadmin_save_expenses($request) {
    $body    = $request->get_json_params();
    $month   = sanitize_text_field($body['month']  ?? '');
    $entity  = sanitize_text_field($body['entity'] ?? 'rocoteca');
    $items   = is_array($body['items'] ?? null) ? $body['items'] : array();
    $replace = !empty($body['replace']);

    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        return new WP_Error('invalid_month', 'Formato de mes inválido', array('status' => 400));
    }

    $clean = array();
    foreach ($items as $item) {
        $clean[] = array(
            'fecha'      => sanitize_text_field($item['fecha']      ?? ''),
            'fechaValor' => sanitize_text_field($item['fechaValor'] ?? ($item['fecha'] ?? '')),
            'concepto'   => sanitize_text_field($item['concepto'] ?? ''),
            'importe'    => floatval($item['importe']  ?? 0),
            'saldo'      => sanitize_text_field((string) ($item['saldo'] ?? '')),
            'category'   => sanitize_text_field($item['category'] ?? 'otros'),
            'iva'        => intval($item['iva']      ?? 0),
            'excluded'   => (bool) ($item['excluded'] ?? false),
            'section'    => in_array($item['section'], array('ingresos','costes'), true) ? $item['section'] : 'costes',
        );
    }

    if ($replace) {
        $merged = $clean;
    } else {
        $vecino_keys = array();
        $dt = DateTime::createFromFormat('Y-m-d', $month . '-01');
        foreach (array('-1 month', '+1 month') as $delta) {
            $vecino = $dt ? (clone $dt)->modify($delta)->format('Y-m') : null;
            if (!$vecino) continue;
            foreach (blokes_exp_load_month($vecino, $entity) as $it) { $vecino_keys[blokes_exp_item_key($it)] = true; }
        }
        $by_key = array();
        foreach (blokes_exp_load_month($month, $entity) as $it) { $by_key[blokes_exp_item_key($it)] = $it; }
        foreach ($clean as $it) {
            $k = blokes_exp_item_key($it);
            if (isset($vecino_keys[$k]) && !isset($by_key[$k])) continue; // ya guardado en el mes de al lado
            $by_key[$k] = $it; // nuevo, o ya existía aquí: se actualiza categoría/IVA/excluido
        }
        $merged = array_values($by_key);
    }

    $key = blokes_exp_option_key($month, $entity);
    update_option($key, wp_json_encode(array(
        'month'  => $month,
        'entity' => $entity,
        'items'  => $merged,
        'saved'  => (new DateTime())->format('c'),
    )), false);

    return rest_ensure_response(array('success' => true, 'month' => $month, 'total' => count($merged)));
}

// `from`: primer mes a incluir ('YYYY-MM', incluido) o vacío para no limitar ("Todo"). Se
// compara como texto (los meses se guardan como 'YYYY-MM', que ordena igual como string que
// como fecha) en vez de restar meses a una fecha, que con createFromFormat('Y-m', …) arrastra
// el día de hoy y se desborda de mes en los días 29-31 de meses cortos.
function superadmin_get_expenses($request) {
    $from             = sanitize_text_field($request->get_param('from') ?: '');
    $entity_filter    = sanitize_text_field($request->get_param('entity') ?: 'all');
    $exclude_internal = (bool) intval($request->get_param('exclude_internal') ?? 1);
    if ($from !== '' && !preg_match('/^\d{4}-\d{2}$/', $from)) $from = '';

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
        if (!preg_match('/^\d{4}-\d{2}$/', $saved['month'])) continue;
        if ($from !== '' && $saved['month'] < $from) continue;

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

// Remitente de transferencia (nombre normalizado en mayúsculas) → categoría elegida a mano
// (Clases/Eventos/Cumpleaños/Otros). Antes vivía en el localStorage de quien lo clasificaba
// (Ramiro o Eva no se veían el uno al otro); ahora es una sola `wp_option` compartida.
const BLOKES_EXP_SENDERS_OPTION = 'blokes_exp_remitentes';

function superadmin_get_expense_senders($request) {
    $raw = get_option(BLOKES_EXP_SENDERS_OPTION);
    $map = $raw ? json_decode($raw, true) : array();
    return rest_ensure_response(array('success' => true, 'data' => is_array($map) ? $map : array()));
}

function superadmin_save_expense_sender($request) {
    $body     = $request->get_json_params();
    $sender   = mb_strtoupper(trim(sanitize_text_field((string) ($body['sender'] ?? ''))));
    $category = sanitize_text_field((string) ($body['category'] ?? ''));
    if ($sender === '') return new WP_Error('bad_request', 'Falta el remitente.', array('status' => 400));

    $raw = get_option(BLOKES_EXP_SENDERS_OPTION);
    $map = $raw ? json_decode($raw, true) : array();
    if (!is_array($map)) $map = array();

    if ($category === '') unset($map[$sender]);
    else $map[$sender] = $category;

    update_option(BLOKES_EXP_SENDERS_OPTION, wp_json_encode($map), false);
    return rest_ensure_response(array('success' => true, 'data' => $map));
}

// ============================================================
//  superadmin/v1 — presupuesto anual de pagos vs. bancos
// ============================================================

// Fuera del prefijo blokes_exp_ para no mezclarse con los meses guardados.
const BLOKES_BUDGET_RULES_OPTION = 'blokes_budget_exp_rules';

function superadmin_clean_category($cat) {
    $cat = sanitize_key($cat);
    return $cat !== '' ? $cat : 'otros';
}

function superadmin_load_expense_rules() {
    $rules = get_option(BLOKES_BUDGET_RULES_OPTION, array());
    return is_array($rules) ? $rules : array();
}

function superadmin_get_expense_rules() {
    return rest_ensure_response(array('rules' => superadmin_load_expense_rules()));
}

// Body: { rules: { "-N FELIX CASTRO MARTINO": "asesoria", "-OTRA": null } } — null borra la regla.
function superadmin_save_expense_rules($request) {
    $body  = $request->get_json_params();
    $input = is_array($body['rules'] ?? null) ? $body['rules'] : array();
    $rules = superadmin_load_expense_rules();

    foreach ($input as $key => $cat) {
        $key = sanitize_text_field($key);
        if ($key === '' || strlen($key) > 200) continue;
        if ($cat === null || $cat === '') { unset($rules[$key]); continue; }
        $rules[$key] = superadmin_clean_category($cat);
    }
    update_option(BLOKES_BUDGET_RULES_OPTION, $rules, false);
    return rest_ensure_response(array('rules' => $rules));
}

// Body: { month, entity, key, category, rule_key? }. `key` es blokes_exp_item_key() del
// movimiento (no su posición, que cambia al fusionar subidas). Con rule_key también se aprende.
function superadmin_set_expense_item_category($request) {
    $body     = $request->get_json_params();
    $month    = sanitize_text_field($body['month']  ?? '');
    $entity   = sanitize_text_field($body['entity'] ?? '');
    $item_key = (string) ($body['key'] ?? '');
    $cat      = superadmin_clean_category($body['category'] ?? '');

    if (!preg_match('/^\d{4}-\d{2}$/', $month) || $entity === '' || $item_key === '') {
        return new WP_Error('invalid_params', 'Faltan datos del movimiento', array('status' => 400));
    }
    $option = blokes_exp_option_key($month, $entity);
    $saved  = json_decode((string) get_option($option, ''), true);
    if (!is_array($saved) || !is_array($saved['items'] ?? null)) {
        return new WP_Error('not_found', 'Mes no encontrado', array('status' => 404));
    }
    $found = false;
    foreach ($saved['items'] as $i => $item) {
        if (blokes_exp_item_key($item) === $item_key) {
            $saved['items'][$i]['category'] = $cat;
            $found = true;
            break;
        }
    }
    if (!$found) return new WP_Error('not_found', 'Movimiento no encontrado', array('status' => 404));
    update_option($option, wp_json_encode($saved), false);

    $rule_key = sanitize_text_field($body['rule_key'] ?? '');
    if ($rule_key !== '' && strlen($rule_key) <= 200) {
        $rules = superadmin_load_expense_rules();
        $rules[$rule_key] = $cat;
        update_option(BLOKES_BUDGET_RULES_OPTION, $rules, false);
    }
    return rest_ensure_response(array('success' => true));
}

// Presupuesto: { year, lines: [{ name, category, note, months: [12 importes] }], file, saved }
// Importes con signo: negativo = pago, positivo = cobro (p. ej. devolución de IVA).
function superadmin_save_budget($request) {
    $body = $request->get_json_params();
    $year = intval($body['year'] ?? 0);
    if ($year < 2020 || $year > 2100) {
        return new WP_Error('invalid_year', 'Año inválido', array('status' => 400));
    }
    $lines = array();
    foreach ((is_array($body['lines'] ?? null) ? $body['lines'] : array()) as $line) {
        $name = sanitize_text_field($line['name'] ?? '');
        if ($name === '') continue;
        $months = array();
        for ($i = 0; $i < 12; $i++) {
            $months[] = round(floatval($line['months'][$i] ?? 0), 2);
        }
        $lines[] = array(
            'name'     => $name,
            'category' => superadmin_clean_category($line['category'] ?? ''),
            'note'     => sanitize_text_field($line['note'] ?? ''),
            'months'   => $months,
        );
    }
    $budget = array(
        'year'  => $year,
        'lines' => $lines,
        'file'  => sanitize_text_field($body['file'] ?? ''),
        'saved' => (new DateTime())->format('c'),
    );
    update_option('blokes_budget_' . $year, wp_json_encode($budget), false);
    return rest_ensure_response(array('budget' => $budget));
}

// Presupuesto del año + movimientos del banco de ese año (sin internos ni ventas), cada uno
// con mes, entidad y clave para poder recategorizarlo.
function superadmin_get_budget($request) {
    $year   = intval($request->get_param('year'));
    $budget = json_decode((string) get_option('blokes_budget_' . $year, ''), true);

    global $wpdb;
    $like = $wpdb->esc_like('blokes_exp_' . $year . '_') . '%';
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT option_value FROM {$wpdb->options} WHERE option_name LIKE %s", $like
    ), ARRAY_A);

    $sales  = array('tpv', 'bizum', 'wellhub', 'transferencia');
    $items  = array();
    $months = array();
    foreach ($rows as $row) {
        $saved = json_decode($row['option_value'], true);
        if (!is_array($saved) || empty($saved['month']) || substr($saved['month'], 0, 4) !== (string) $year) continue;
        $entity = $saved['entity'] ?? 'rocoteca';
        $months[$saved['month']] = true;

        foreach (($saved['items'] ?? array()) as $item) {
            $concepto_norm = function_exists('iconv')
                ? strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $item['concepto'] ?? ''))
                : strtolower($item['concepto'] ?? '');
            $is_internal = !empty($item['excluded'])
                || strpos($concepto_norm, 'rocodromo') !== false
                || strpos($concepto_norm, 'transferencia entre cuentas') !== false;
            if ($is_internal) continue;

            $cat     = $item['category'] ?? 'otros';
            $section = $item['section'] ?? 'costes';
            if ($section === 'ingresos' && in_array($cat, $sales, true)) continue;

            $items[] = array(
                'month'    => $saved['month'],
                'entity'   => $entity,
                'key'      => blokes_exp_item_key($item),
                'fecha'    => $item['fecha'] ?? '',
                'concepto' => $item['concepto'] ?? '',
                'importe'  => floatval($item['importe'] ?? 0),
                'category' => $cat,
                'section'  => $section,
            );
        }
    }
    $months = array_keys($months);
    sort($months);

    return rest_ensure_response(array(
        'budget'        => is_array($budget) ? $budget : null,
        'items'         => $items,
        'months_loaded' => $months,
    ));
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
    $post_id               = intval($request['id']);
    $target_user_id        = intval($request->get_param('target_user_id'));
    $target_placeholder_id = intval($request->get_param('target_placeholder_id'));
    $acting_for_other      = ($target_user_id > 0) || ($target_placeholder_id > 0);

    // Marking a top for someone else — a profe, gestión, or the shared
    // tablet attributing it to whoever they picked — needs the same
    // permission as the rest of the "act on behalf of an alumno" tooling.
    if ($acting_for_other && !blokes_can_supervise()) {
        return new WP_Error('forbidden', 'No autorizado.', array('status' => 403));
    }

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    if ($target_placeholder_id > 0) {
        return blokes_toggle_completion_placeholder($target_placeholder_id, $post_id);
    }

    $user_id = $target_user_id > 0 ? $target_user_id : get_current_user_id();

    if (!$acting_for_other && !blokes_is_profile_complete($user_id)) {
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

// Same toggle semantics as blokes_toggle_completion, but for a manual alumno
// with no WordPress account yet — stored in its own table instead of
// usermeta, since usermeta needs a real wp_user row. No leagues here: a
// placeholder only enters leagues once linked to a real account.
function blokes_toggle_completion_placeholder($placeholder_id, $post_id) {
    global $wpdb;
    blokes_ensure_placeholder_completions_table();
    $table = blokes_placeholder_completions_table();

    $existing = $wpdb->get_row($wpdb->prepare(
        "SELECT id FROM {$table} WHERE placeholder_id = %d AND post_id = %d", $placeholder_id, $post_id
    ));

    $first_ascent = false;
    if ($existing) {
        $wpdb->delete($table, array('id' => $existing->id), array('%d'));
        $completed = false;
        $count     = max(0, (int) get_post_meta($post_id, '_bloke_completion_count', true) - 1);
    } else {
        $color = sanitize_text_field(get_field('bloke_color', $post_id) ?: 'green');
        $sala  = sanitize_text_field(get_field('bloke_sala',  $post_id) ?: 'entrada');
        $wpdb->insert($table, array(
            'placeholder_id' => $placeholder_id,
            'post_id'        => $post_id,
            'color'          => $color,
            'sala'           => $sala,
            'completed_at'   => current_time('mysql'),
            'logged_by'      => get_current_user_id(),
        ), array('%d', '%d', '%s', '%s', '%s', '%d'));
        $completed = true;
        $count     = (int) get_post_meta($post_id, '_bloke_completion_count', true) + 1;

        if ($count === 1) {
            $nombre = $wpdb->get_var($wpdb->prepare(
                "SELECT nombre FROM " . blokes_placeholder_table() . " WHERE id = %d", $placeholder_id
            ));
            $first_name = $nombre ? explode(' ', trim($nombre))[0] : '';
            update_post_meta($post_id, '_bloke_first_ascent', array(
                'placeholder_id' => $placeholder_id,
                'name'           => $first_name ?: $nombre,
                'timestamp'      => current_time('c'),
            ));
            $first_ascent = true;
        }
    }

    update_post_meta($post_id, '_bloke_completion_count', $count);

    return array(
        'completed'    => $completed,
        'count'        => $count,
        'first_ascent' => $first_ascent,
        'league'       => null,
    );
}

function blokes_api_get_subject_completions($request) {
    $user_id        = intval($request->get_param('user_id'));
    $placeholder_id = intval($request->get_param('placeholder_id'));

    if ($placeholder_id > 0) {
        global $wpdb;
        blokes_ensure_placeholder_completions_table();
        $table = blokes_placeholder_completions_table();
        $rows  = $wpdb->get_results($wpdb->prepare(
            "SELECT post_id, color FROM {$table} WHERE placeholder_id = %d", $placeholder_id
        ), ARRAY_A);
        $by_color = array();
        foreach ($rows as $r) { $by_color[$r['color']] = ($by_color[$r['color']] ?? 0) + 1; }
        return rest_ensure_response(array('total' => count($rows), 'by_color' => $by_color));
    }

    if ($user_id > 0) {
        $log = get_user_meta($user_id, '_blokes_completion_log', true);
        $log = is_array($log) ? $log : array();
        $by_color = array();
        foreach ($log as $entry) {
            $color = sanitize_text_field($entry['color'] ?? 'green');
            $by_color[$color] = ($by_color[$color] ?? 0) + 1;
        }
        return rest_ensure_response(array('total' => count($log), 'by_color' => $by_color));
    }

    return new WP_Error('invalid_data', 'Falta user_id o placeholder_id.', array('status' => 400));
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

// "Borrar" un bloke en realidad lo retira: se oculta de la colección pública
// (pasa a post_status 'draft', fuera del listado REST por defecto) pero no se
// borra ni la ficha ni sus imágenes, para conservar el histórico (subzona,
// color, fechas) que usan Estadísticas y la propuesta semanal de Organización.
function blokes_delete_with_media($request) {
    $post_id = intval($request['id']);

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'blokes') {
        return new WP_Error('invalid_bloke', 'Invalid bloke ID', array('status' => 404));
    }

    $already_retired = get_post_meta($post_id, 'bloke_retirado', true);
    if ($already_retired) {
        return array(
            'success'      => true,
            'post_id'      => $post_id,
            'retired'      => true,
            'retired_at'   => $already_retired,
            'message'      => 'Este bloke ya estaba retirado',
        );
    }

    $user = wp_get_current_user();
    $retired_at = current_time('mysql');
    $retired_by = $user && $user->exists() ? $user->user_login : '';

    update_post_meta($post_id, 'bloke_retirado', $retired_at);
    update_post_meta($post_id, 'bloke_retirado_por', $retired_by);

    $updated = wp_update_post(array(
        'ID'          => $post_id,
        'post_status' => 'draft',
    ), true);

    if (is_wp_error($updated)) {
        return $updated;
    }

    return array(
        'success'    => true,
        'post_id'    => $post_id,
        'retired'    => true,
        'retired_at' => $retired_at,
        'retired_by' => $retired_by,
        'message'    => 'Bloke retirado (oculto de la colección, histórico conservado)',
    );
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

// Tele del Roco (NOTAS_PARA_CODE_tele_roco.md, Ramiro 11/11 05:39): diapositivas de la tele
// fija cuando no hay compe activa — gestionadas a mano desde Superadmin → Tele por ahora
// (primera versión; las automáticas de cada actividad/evento quedan para una ronda aparte).
// Vive en el blog del Club (igual que Superadmin/Campañas), con lectura pública para que la
// tele (que corre en el blog de Blokes) pueda leerlas sin sesión.
function blokes_tele_slides_table() { global $wpdb; return $wpdb->prefix . 'blokes_tele_slides'; }
function blokes_tele_ensure_table() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE " . blokes_tele_slides_table() . " (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        titulo      varchar(190) NOT NULL DEFAULT '',
        imagen_url  varchar(500) NOT NULL DEFAULT '',
        texto       text         NOT NULL,
        qr_url      varchar(500) NOT NULL DEFAULT '',
        fecha_inicio date        NULL,
        fecha_fin    date        NULL,
        duracion_seg tinyint(3) UNSIGNED NOT NULL DEFAULT 12,
        orden        int(10)     NOT NULL DEFAULT 0,
        activo       tinyint(1)  NOT NULL DEFAULT 1,
        created_at   datetime    NOT NULL,
        PRIMARY KEY (id)
    ) {$charset};");

    // Precarga (Ramiro, 11/11 05:39: "precarga ya el cartel de la compe, la promo del 10 %
    // trimestral y el Instala Blokes") — una sola vez, para que la tele tenga algo desde el
    // primer momento sin que Ramiro tenga que crearlo a mano.
    if (!get_option('blokes_tele_precarga')) {
        $wpdb->insert(blokes_tele_slides_table(), array(
            'titulo' => 'Compe RocoMadrid', 'texto' => '30 de noviembre – 4 de diciembre. Instala Blokes y apúntate.',
            'qr_url' => 'https://rocomadrid.com/app', 'fecha_fin' => '2026-12-04', 'duracion_seg' => 14, 'orden' => 1,
            'activo' => 1, 'created_at' => current_time('mysql'),
        ));
        $wpdb->insert(blokes_tele_slides_table(), array(
            'titulo' => '10 % en el primer trimestre', 'texto' => 'Pagando trimestral, hasta el 31 de diciembre. 2 días/semana de tarde: 232 € en vez de 258 €.',
            'qr_url' => 'https://rocomadrid.com/club', 'fecha_fin' => '2026-12-31', 'duracion_seg' => 12, 'orden' => 2,
            'activo' => 1, 'created_at' => current_time('mysql'),
        ));
        $wpdb->insert(blokes_tele_slides_table(), array(
            'titulo' => 'Instala Blokes', 'texto' => 'Apunta tus tops desde el móvil.',
            'qr_url' => 'https://rocomadrid.com/app', 'fecha_fin' => null, 'duracion_seg' => 10, 'orden' => 3,
            'activo' => 1, 'created_at' => current_time('mysql'),
        ));
        update_option('blokes_tele_precarga', 1, false);
    }
}

function blokes_tele_slide_fila($r) {
    return array(
        'id' => intval($r['id']), 'titulo' => $r['titulo'], 'imagenUrl' => $r['imagen_url'],
        'texto' => $r['texto'], 'qrUrl' => $r['qr_url'],
        'fechaInicio' => $r['fecha_inicio'], 'fechaFin' => $r['fecha_fin'],
        'duracionSeg' => intval($r['duracion_seg']), 'orden' => intval($r['orden']), 'activo' => (bool) $r['activo'],
    );
}

// GET /superadmin/v1/tele-slides — todas (activas e inactivas), para gestionarlas.
function superadmin_tele_slides_listar($request) {
    blokes_tele_ensure_table();
    global $wpdb;
    $rows = $wpdb->get_results("SELECT * FROM " . blokes_tele_slides_table() . " ORDER BY orden ASC, id ASC", ARRAY_A);
    return rest_ensure_response(array('success' => true, 'data' => array_map('blokes_tele_slide_fila', $rows)));
}

function superadmin_tele_slides_crear($request) {
    blokes_tele_ensure_table();
    global $wpdb;
    $body = $request->get_json_params();
    if (trim((string) ($body['titulo'] ?? '')) === '') return new WP_Error('bad_request', 'Falta el título.', array('status' => 400));
    $wpdb->insert(blokes_tele_slides_table(), array(
        'titulo'       => sanitize_text_field((string) $body['titulo']),
        'imagen_url'   => esc_url_raw((string) ($body['imagenUrl'] ?? '')),
        'texto'        => sanitize_textarea_field((string) ($body['texto'] ?? '')),
        'qr_url'       => esc_url_raw((string) ($body['qrUrl'] ?? '')),
        'fecha_inicio' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($body['fechaInicio'] ?? '')) ? $body['fechaInicio'] : null,
        'fecha_fin'    => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($body['fechaFin'] ?? '')) ? $body['fechaFin'] : null,
        'duracion_seg' => max(5, min(60, intval($body['duracionSeg'] ?? 12))),
        'orden'        => intval($body['orden'] ?? 0),
        'activo'       => 1, 'created_at' => current_time('mysql'),
    ));
    return rest_ensure_response(array('success' => true, 'data' => array('id' => $wpdb->insert_id)));
}

function superadmin_tele_slides_editar($request) {
    blokes_tele_ensure_table();
    global $wpdb;
    $id = intval($request['id']);
    $actual = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . blokes_tele_slides_table() . " WHERE id = %d", $id));
    if (!$actual) return new WP_Error('not_found', 'Diapositiva no encontrada.', array('status' => 404));
    $body = $request->get_json_params();
    $campos = array();
    if (isset($body['titulo']))      $campos['titulo']     = sanitize_text_field((string) $body['titulo']);
    if (isset($body['imagenUrl']))   $campos['imagen_url'] = esc_url_raw((string) $body['imagenUrl']);
    if (isset($body['texto']))       $campos['texto']      = sanitize_textarea_field((string) $body['texto']);
    if (isset($body['qrUrl']))       $campos['qr_url']     = esc_url_raw((string) $body['qrUrl']);
    if (array_key_exists('fechaInicio', $body)) $campos['fecha_inicio'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $body['fechaInicio']) ? $body['fechaInicio'] : null;
    if (array_key_exists('fechaFin', $body))    $campos['fecha_fin']    = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $body['fechaFin']) ? $body['fechaFin'] : null;
    if (isset($body['duracionSeg']))  $campos['duracion_seg'] = max(5, min(60, intval($body['duracionSeg'])));
    if (isset($body['orden']))        $campos['orden']        = intval($body['orden']);
    if (isset($body['activo']))       $campos['activo']       = !empty($body['activo']) ? 1 : 0;
    if (empty($campos)) return new WP_Error('bad_request', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(blokes_tele_slides_table(), $campos, array('id' => $id));
    return rest_ensure_response(array('success' => true));
}

function superadmin_tele_slides_borrar($request) {
    blokes_tele_ensure_table();
    global $wpdb;
    $wpdb->delete(blokes_tele_slides_table(), array('id' => intval($request['id'])));
    return rest_ensure_response(array('success' => true));
}

// GET /progreso/v1/tele/diapositivas — público: solo las activas y dentro de su rango de
// fechas (si tienen), para que la tele del Roco rote entre ellas sin sesión.
function progreso_tele_diapositivas($request) {
    blokes_tele_ensure_table();
    global $wpdb;
    $rows = $wpdb->get_results(
        "SELECT * FROM " . blokes_tele_slides_table() . "
         WHERE activo = 1
           AND (fecha_inicio IS NULL OR fecha_inicio <= CURDATE())
           AND (fecha_fin    IS NULL OR fecha_fin    >= CURDATE())
         ORDER BY orden ASC, id ASC", ARRAY_A
    );
    return rest_ensure_response(array('success' => true, 'data' => array_map('blokes_tele_slide_fila', $rows)));
}

// "Instala Blokes" — tabla propia (no progreso_equip_table: esto vive en el blog
// 1, donde corre /app, no en el 3 de Equipación) para poder enseñarlo en
// Supervisión más adelante si Ramiro lo pide.
function blokes_install_events_ensure_table() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE {$wpdb->prefix}blokes_install_events (
        id         bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        tipo       varchar(30)         NOT NULL,
        user_id    bigint(20) UNSIGNED NULL,
        created_at datetime            NOT NULL,
        PRIMARY KEY (id)
    ) {$charset};");
}

function blokes_registrar_install_event($request) {
    $tipo = sanitize_key((string) $request->get_param('tipo'));
    if (!in_array($tipo, array('appinstalled', 'standalone_open', 'instalar_click', 'prompt_fail'), true)) {
        return new WP_Error('tipo_invalido', 'Tipo no reconocido.', array('status' => 400));
    }
    blokes_install_events_ensure_table();
    global $wpdb;
    $wpdb->insert($wpdb->prefix . 'blokes_install_events', array(
        'tipo'       => $tipo,
        'user_id'    => is_user_logged_in() ? get_current_user_id() : null,
        'created_at' => current_time('mysql'),
    ));
    // Parte B de la trazabilidad (Ramiro, 11/11 05:35): instalación real de la app con la
    // cookie de una campaña puesta (p. ej. la de la compe) cuenta como conversión directa. Esta
    // ruta vive en el blog 1 (donde está Blokes), pero las tablas de campañas son del Club
    // (blog 3) — switch_to_blog, igual que en /c/{token}.
    if ($tipo === 'appinstalled' && !empty($_COOKIE['roco_cmp'])) {
        $token = sanitize_text_field($_COOKIE['roco_cmp']);
        switch_to_blog(3);
        blokes_ensure_campanas_tables();
        $enlace = blokes_campana_enlace_por_token($token);
        if ($enlace) {
            blokes_campana_registrar_conversion(intval($enlace['campana_id']), intval($enlace['contacto_id']), 'instalacion', 'directa');
        }
        restore_current_blog();
    }
    return rest_ensure_response(array('success' => true));
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

// ============================================================
//  Suscripciones "pending-cancel" — leídas directamente de WooCommerce
// ============================================================
// RocoMadrid_SF_Stats::get_all_subscription_data() (plugin de terceros,
// rocomadrid-step-form, no es nuestro y no lo tocamos) solo pide a WC los
// estados active/pending/on-hold/cancelled. "pending-cancel" (el cliente
// ha cancelado pero sigue con acceso hasta que acabe el periodo ya
// pagado) se queda fuera por completo — ni se trae, así que esos alumnos
// desaparecen de todas partes. Lo compensamos leyendo esas suscripciones
// aparte, directamente de WooCommerce Subscriptions, con un parseo
// equivalente al del plugin de terceros (normalizar_dia/horario/edad son
// privados ahí, así que se replican aquí).

function blokes_normalizar_dia($dia) {
    if (empty($dia)) return '';
    $map = array(
        'lunes-miercoles' => 'Lunes-Miércoles', 'lunes-miércoles' => 'Lunes-Miércoles',
        'monday-wednesday' => 'Lunes-Miércoles', 'monday + wednesday' => 'Lunes-Miércoles', 'l-x' => 'Lunes-Miércoles',
        'martes-jueves' => 'Martes-Jueves', 'martes-juves' => 'Martes-Jueves',
        'tuesday-thursday' => 'Martes-Jueves', 'tuesday + thursday' => 'Martes-Jueves', 'm-j' => 'Martes-Jueves',
        'lunes' => 'Lunes', 'monday' => 'Lunes',
        'martes' => 'Martes', 'tuesday' => 'Martes',
        'miercoles' => 'Miércoles', 'miércoles' => 'Miércoles', 'wednesday' => 'Miércoles',
        'jueves' => 'Jueves', 'thursday' => 'Jueves',
        'viernes' => 'Viernes', 'friday' => 'Viernes',
        'sabado' => 'Sábado', 'sábado' => 'Sábado', 'saturday' => 'Sábado',
    );
    $dia_lower = strtolower($dia);
    return isset($map[$dia_lower]) ? $map[$dia_lower] : ucfirst($dia);
}

function blokes_normalizar_horario($horario) {
    if (empty($horario)) return '';
    if (preg_match('/^\d{2}:\d{2}/', $horario)) return $horario;
    if (preg_match('/^(\d{2})(\d{2})-(\d{2})(\d{2})$/', $horario, $m)) {
        return $m[1] . ':' . $m[2] . '-' . $m[3] . ':' . $m[4];
    }
    return $horario;
}

function blokes_normalizar_edad($edad) {
    if (empty($edad)) return 'Adultos';
    $map = array(
        'adultos' => 'Adultos', 'adulto' => 'Adultos', 'adults' => 'Adultos',
        'menores (6-12 años)' => 'Menores (6-12 años)', 'menores' => 'Menores (6-12 años)',
        'infantil' => 'Menores (6-12 años)', 'children' => 'Menores (6-12 años)',
        'children (6-12 years)' => 'Menores (6-12 años)',
        'adolescentes (12-18 años)' => 'Adolescentes (12-18 años)', 'adolescentes' => 'Adolescentes (12-18 años)',
        'adolescente' => 'Adolescentes (12-18 años)', 'teenagers' => 'Adolescentes (12-18 años)',
        'teenagers (12-18 years)' => 'Adolescentes (12-18 años)',
    );
    $edad_lower = strtolower($edad);
    return isset($map[$edad_lower]) ? $map[$edad_lower] : ucfirst($edad);
}

function blokes_get_pending_cancel_alumnos() {
    if (!function_exists('wcs_get_subscriptions') || !class_exists('RocoMadrid_Step_Form')) return array();

    $product_dias_sueltos = RocoMadrid_Step_Form::product_dias_sueltos_id();
    $product_tarifas      = RocoMadrid_Step_Form::product_tarifas_id();
    $product_pilates      = intval(get_option('rocomadrid_product_pilates', 0));
    $product_yoga         = intval(get_option('rocomadrid_product_yoga', 0));
    $product_ids = array_values(array_filter(array($product_dias_sueltos, $product_tarifas, $product_pilates, $product_yoga)));

    $subscriptions = wcs_get_subscriptions(array(
        'subscriptions_per_page' => -1,
        'subscription_status'    => array('pending-cancel'),
    ));

    $data = array();
    foreach ($subscriptions as $subscription) {
        $items = $subscription->get_items();
        $es_rocomadrid = false;
        $producto_id = 0; $producto_nombre = ''; $dia = ''; $horario = ''; $edad = ''; $plan = 'monthly';

        foreach ($items as $item) {
            $pid = $item->get_product_id();
            if (!in_array($pid, $product_ids)) continue;
            $es_rocomadrid = true;
            $producto_id = $pid;
            $es_dias_sueltos = ($pid == $product_dias_sueltos);
            $producto_nombre = ($pid === $product_pilates) ? 'Pilates' : (($pid === $product_yoga) ? 'Yoga' : ($es_dias_sueltos ? 'Single Days' : 'Classes'));
            $es_extra = ($pid === $product_pilates || $pid === $product_yoga);

            $step_selections = $es_extra ? array() : $item->get_meta('_step_form_selections', true);
            if (!empty($step_selections) && is_array($step_selections)) {
                if ($es_dias_sueltos) {
                    $dia     = $step_selections['pa_dia-suelto'] ?? '';
                    $horario = $step_selections['pa_horario'] ?? ($step_selections['pa_horario-dias-sueltos'] ?? '');
                    $edad    = $step_selections['edad_addon'] ?? '';
                } else {
                    $dia     = $step_selections['pa_dias'] ?? '';
                    $horario = $step_selections['pa_horario'] ?? '';
                    $edad    = $step_selections['pa_edad'] ?? '';
                }
                if (isset($step_selections['plan_pago'])) $plan = strtolower($step_selections['plan_pago']);
            }

            if (empty($dia) || empty($horario)) {
                $variation = wc_get_product($item->get_variation_id());
                if ($variation) {
                    foreach ($variation->get_variation_attributes() as $key => $value) {
                        $key_lower = strtolower($key);
                        if (empty($dia) && (strpos($key_lower, 'dia-suelto') !== false || strpos($key_lower, 'pa_dias') !== false || substr($key_lower, -4) === 'dias')) {
                            $dia = $value;
                        }
                        if (empty($horario) && strpos($key_lower, 'horario') !== false) $horario = $value;
                        if (empty($edad) && strpos($key_lower, 'edad') !== false) $edad = $value;
                    }
                }
            }

            foreach ($item->get_meta_data() as $meta) {
                $key = strtolower($meta->key);
                if (strpos($key, 'plan') !== false && $plan === 'monthly') $plan = strtolower($meta->value);
                if ($key === 'edad del alumno' && empty($edad)) $edad = $meta->value;
            }
            break;
        }

        if (!$es_rocomadrid) continue;

        $dia_display     = blokes_normalizar_dia($dia);
        $horario_display = blokes_normalizar_horario($horario);
        $edad_display    = blokes_normalizar_edad($edad);

        $turno = 'Afternoon';
        if (!empty($horario)) {
            preg_match('/^(\d{2})(\d{2})?/', preg_replace('/[^0-9]/', '', $horario), $matches);
            if (!empty($matches[1]) && intval($matches[1]) < 16) $turno = 'Morning';
        }

        $customer   = $subscription->get_user();
        $start_date = $subscription->get_date('date_created');

        $data[] = array(
            'id'           => $subscription->get_id(),
            'status'       => 'active',
            'status_raw'   => 'pending-cancel',
            'cliente'      => $customer ? $customer->display_name : 'N/A',
            'email'        => $customer ? $customer->user_email : 'N/A',
            'telefono'     => $subscription->get_billing_phone(),
            'producto'     => $producto_nombre,
            'producto_id'  => $producto_id,
            'dia'          => $dia_display,
            'horario'      => $horario_display,
            'edad'         => $edad_display ?: 'Adultos',
            'turno'        => $turno,
            'plan'         => $plan,
            'total'        => floatval($subscription->get_total()),
            'period'       => $subscription->get_billing_period(),
            'interval'     => $subscription->get_billing_interval(),
            'fecha_inicio' => $start_date ? date_i18n('d/m/Y', strtotime($start_date)) : 'N/A',
        );
    }
    return $data;
}

/**
 * Abonos de escalada libre (sin clases): mensuales (5114/5115, ya existían) + los nuevos
 * anual/trimestral creados el 06/11 (NOTAS_PARA_CODE_abono_anual.md) — 7753-7756. No los conoce
 * RocoMadrid_SF_Stats (son productos simples de WooCommerce, no del step form), así que se leen
 * aquí aparte y se les da 'producto' => 'Abono' para que Grupos/Supervisión los distinga de una
 * clase — nunca "no como clase" (no tienen día de la semana: es acceso libre).
 */
function blokes_get_abono_subscripciones() {
    if (!function_exists('wcs_get_subscriptions')) return array();

    // id => [franja mostrada, turno]. Si se crean más abonos (otro precio/periodo), añadir aquí.
    $abono_ids = array(
        5115 => array('franja' => 'Todo el día', 'turno' => 'Afternoon'),
        5114 => array('franja' => 'Mañana',      'turno' => 'Morning'),
        7753 => array('franja' => 'Todo el día', 'turno' => 'Afternoon'),
        7754 => array('franja' => 'Mañana',      'turno' => 'Morning'),
        7755 => array('franja' => 'Todo el día', 'turno' => 'Afternoon'),
        7756 => array('franja' => 'Mañana',      'turno' => 'Morning'),
    );

    $subscriptions = wcs_get_subscriptions(array(
        'subscriptions_per_page' => -1,
        'subscription_status'    => array('active', 'pending', 'on-hold', 'cancelled', 'pending-cancel'),
    ));

    $data = array();
    foreach ($subscriptions as $subscription) {
        $producto_id = 0;
        foreach ($subscription->get_items() as $item) {
            $pid = intval($item->get_product_id());
            if (isset($abono_ids[$pid])) { $producto_id = $pid; break; }
        }
        if (!$producto_id) continue;

        $raw_status = $subscription->get_status();
        $customer   = $subscription->get_user();
        $start_date = $subscription->get_date('date_created');

        $data[] = array(
            'id'           => $subscription->get_id(),
            'status'       => ($raw_status === 'pending-cancel') ? 'active' : $raw_status,
            'status_raw'   => $raw_status,
            'cliente'      => $customer ? $customer->display_name : 'N/A',
            'email'        => $customer ? $customer->user_email : 'N/A',
            'telefono'     => $subscription->get_billing_phone(),
            'producto'     => 'Abono',
            'producto_id'  => $producto_id,
            'dia'          => '',
            'horario'      => $abono_ids[$producto_id]['franja'],
            'edad'         => 'Adultos',
            'turno'        => $abono_ids[$producto_id]['turno'],
            'plan'         => 'monthly',
            'total'        => floatval($subscription->get_total()),
            'period'       => $subscription->get_billing_period(),
            'interval'     => $subscription->get_billing_interval(),
            'fecha_inicio' => $start_date ? date_i18n('d/m/Y', strtotime($start_date)) : 'N/A',
        );
    }
    return $data;
}

/**
 * Wrapper sobre RocoMadrid_SF_Stats::get_all_subscription_data() (plugin de
 * terceros) que además incluye las suscripciones pending-cancel, leídas
 * directamente de WooCommerce. Usar esta función en vez de llamar al plugin
 * de terceros directamente en todo lo nuevo que toquemos.
 */
function blokes_get_all_subscription_data() {
    $base = class_exists('RocoMadrid_SF_Stats') ? RocoMadrid_SF_Stats::get_all_subscription_data() : array();
    return array_merge($base, blokes_get_pending_cancel_alumnos(), blokes_get_abono_subscripciones());
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

    $all_data = array_merge(blokes_get_all_subscription_data(), blokes_get_placeholder_alumnos('pending'));

    // Coincide por pareja de día (Lunes/Miércoles/Lunes-Miércoles son la misma franja para esto),
    // no por valor exacto: a un profe le da igual que el alumno venga 1 o 2 días, quiere verlos
    // todos juntos en la hora de clase. Qué días va cada uno sigue intacto en su propia ficha.
    $parejas_filtro = array_map('blokes_dia_a_pareja', $filtros['dia']);
    $filtered = array_values(array_filter($all_data, function($sub) use ($filtros, $parejas_filtro) {
        if ($filtros['status'] !== 'all' && $sub['status'] !== $filtros['status']) return false;
        if (!empty($parejas_filtro) && !in_array(blokes_dia_a_pareja($sub['dia']), $parejas_filtro, true)) return false;
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
        // Apodo (Ramiro, 09/11 05:45: "¿quién lo ha hecho?" tiene que enseñar también el
        // nickname, hay varios "Ramiro" y con solo el nombre + clase no se sabe cuál es) —
        // usermeta es global de la red, se puede leer desde el Club sin cambiar de blog.
        $sub['nickname'] = $uid ? blokes_get_user_nickname($uid) : '';
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
        foreach (blokes_get_all_subscription_data() as $sub) {
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

    // Adolescentes no es un término pa_edad real en el catálogo (hoy se monta sobre la variación
    // de Adultos del mismo día/horario, con el precio ajustado por un addon en el alta normal —
    // ver NOTAS_PARA_CODE_sync_grupos.md, Ramiro 06/11). Para que "Cambiar de grupo" pueda
    // ofrecer y mover a un grupo de Adolescentes, añadimos aquí una fila sintética por cada fila
    // real de Adultos, con el precio real de Adolescentes (misma fórmula que usa el alta).
    if (class_exists('RocoMadrid_SF_Pricing')) {
        $filas_adultos = array_filter($clases, function($c) { return $c['edad'] === 'Adultos'; });
        foreach ($filas_adultos as $fila) {
            $frequency = ($fila['tipo'] === 'classes') ? '2_days' : '1_day';
            $planes_adol = RocoMadrid_SF_Pricing::calculate_plan_prices(array(
                'pa_dias' => $fila['dia'], 'pa_horario' => $fila['horario'], 'pa_edad' => 'Adolescentes', 'frequency' => $frequency,
            ));
            $precio_adol = floatval($planes_adol['monthly']['price'] ?? 0);
            if ($precio_adol <= 0) continue;
            $key_adol = $fila['dia'] . '|' . $fila['horario'] . '|Adolescentes';
            $clases[] = array(
                'id' => 'adol-' . $fila['id'], 'tipo' => $fila['tipo'], 'dia' => $fila['dia'], 'horario' => $fila['horario'],
                'turno' => $fila['turno'], 'edad' => 'Adolescentes', 'precio' => $precio_adol,
                'stock' => $fila['stock'], 'stock_status' => $fila['stock_status'], 'sku' => $fila['sku'] . '-ADOL',
                'status' => $fila['status'], 'alumnos' => isset($sub_counts[$key_adol]) ? $sub_counts[$key_adol] : 0,
            );
        }
        if (!empty($filas_adultos) && !in_array('Adolescentes', $edades)) $edades[] = 'Adolescentes';
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
//  Alumnos manuales (placeholders) — gente en clase sin suscripción
//  todavía (nuevos, pago pendiente...). Viven en tabla propia, nunca
//  como usuarios de WordPress, para no mezclarlos con socios reales.
//  Cuando se hacen socios de verdad, se vinculan por email y su
//  historial de mediciones se migra al user_id real.
// ============================================================

function blokes_placeholder_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_placeholder_alumnos';
}

function blokes_ensure_placeholder_table() {
    global $wpdb;
    $table = blokes_placeholder_table();
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table) return;
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id              bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre          varchar(190)        NOT NULL,
        dia             varchar(100)        NOT NULL DEFAULT '',
        horario         varchar(50)         NOT NULL DEFAULT '',
        edad            varchar(50)         NOT NULL DEFAULT '',
        turno           varchar(20)         NOT NULL DEFAULT '',
        status          varchar(20)         NOT NULL DEFAULT 'pending',
        linked_user_id  bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        linked_at       datetime            NULL,
        created_by      bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        created_at      datetime            NOT NULL,
        PRIMARY KEY (id),
        KEY status (status)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
}

// Completados de un alumno manual — el equivalente de _blokes_completed /
// _blokes_completion_log para alguien sin cuenta de WordPress (esos usermeta
// no aplican a un placeholder). Al vincular, se traspasan y se borran de aquí.
function blokes_placeholder_completions_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_placeholder_completions';
}

function blokes_ensure_placeholder_completions_table() {
    global $wpdb;
    $version = '1';
    if (get_option('blokes_placeholder_completions_version') === $version) return;
    $table = blokes_placeholder_completions_table();
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id             bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        placeholder_id bigint(20) UNSIGNED NOT NULL,
        post_id        bigint(20) UNSIGNED NOT NULL,
        color          varchar(20)         NOT NULL DEFAULT 'green',
        sala           varchar(20)         NOT NULL DEFAULT 'entrada',
        completed_at   datetime            NOT NULL,
        logged_by      bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        UNIQUE KEY placeholder_post (placeholder_id, post_id),
        KEY post_id (post_id)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
    update_option('blokes_placeholder_completions_version', $version);
}

function blokes_get_placeholder_alumnos($status = 'pending') {
    global $wpdb;
    blokes_ensure_placeholder_table();
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . blokes_placeholder_table() . " WHERE status = %s ORDER BY created_at DESC",
        $status
    ), ARRAY_A);
    return array_map(function($row) {
        // The alumno has no real subscription to read a producto from, so
        // frecuencia (and the "producto" filter match) has to be inferred
        // from the día itself: a combined day ("Martes-Jueves") is a 2x/week
        // class, a single day is 1x/week. Without a día there's no way to
        // know, so it's left blank and simply won't match a frecuencia filter.
        $dia = $row['dia'];
        $producto = $dia === '' ? '' : (strpos($dia, '-') !== false ? 'Classes' : 'Single Days');
        return array(
            'id'            => 0,
            'placeholder_id'=> intval($row['id']),
            'is_placeholder'=> true,
            'status'        => 'active',
            'cliente'       => $row['nombre'],
            'email'         => '',
            'producto'      => $producto,
            'frecuencia'    => '',
            'dia'           => $dia,
            'horario'       => $row['horario'],
            'edad'          => $row['edad'],
            'turno'         => $row['turno'],
            'user_id'       => 0,
        );
    }, $rows);
}

// "Ramiro" matches "Ramiro Santamaria" (every token of the shorter name appears
// in the longer one), ignoring case and accents. Used only to suggest possible
// duplicates — it never merges anything by itself.
function blokes_name_tokens($s) {
    $s = remove_accents(mb_strtolower(trim((string) $s)));
    return array_values(array_filter(preg_split('/\s+/', $s), 'strlen'));
}
function blokes_names_match($a, $b) {
    $ta = blokes_name_tokens($a);
    $tb = blokes_name_tokens($b);
    if (!$ta || !$tb) return false;
    if (count($ta) > count($tb)) { $tmp = $ta; $ta = $tb; $tb = $tmp; }
    foreach ($ta as $t) {
        if (!in_array($t, $tb, true)) return false;
    }
    return true;
}

function progreso_create_alumno_manual($request) {
    $nombre = trim((string) $request->get_param('nombre'));
    if ($nombre === '') {
        return new WP_Error('invalid_data', 'El nombre es obligatorio.', array('status' => 400));
    }

    // Before creating, look for anyone with a similar name — real subscriptions
    // (any status) and pending manual alumnos — so the profesor can pick the
    // existing one. Confirmed creation sends force.
    if (!filter_var($request->get_param('force'), FILTER_VALIDATE_BOOLEAN)) {
        blokes_ensure_placeholder_table();
        $sources = blokes_get_placeholder_alumnos('pending');
        if (class_exists('RocoMadrid_SF_Stats')) {
            $sources = array_merge(blokes_get_all_subscription_data(), $sources);
        }
        $candidates = array();
        foreach ($sources as $s) {
            if (!blokes_names_match($nombre, $s['cliente'] ?? '')) continue;
            $candidates[] = array(
                'nombre'         => $s['cliente'],
                'status'         => $s['status'] ?? '',
                'dia'            => $s['dia'] ?? '',
                'horario'        => $s['horario'] ?? '',
                'is_placeholder' => !empty($s['is_placeholder']),
            );
            if (count($candidates) >= 10) break;
        }
        if ($candidates) {
            return new WP_Error('duplicate_candidates', 'Ya hay alumnos con un nombre parecido.', array(
                'status'     => 409,
                'candidates' => $candidates,
            ));
        }
    }

    $horario = sanitize_text_field((string) $request->get_param('horario'));
    $turno   = sanitize_text_field((string) $request->get_param('turno'));
    $edad    = sanitize_text_field((string) $request->get_param('edad'));

    // Turno is derivable from horario — don't make it a second manual field
    // the profesor has to remember to set (a blank turno silently fails to
    // match the Turno filter, which is how an alumno "disappears"). Edad has
    // no reliable default except the overwhelming common case.
    if ($turno === '' && $horario !== '') {
        $afternoon_hour = class_exists('RocoMadrid_SF_Settings') ? intval(RocoMadrid_SF_Settings::get_afternoon_hour()) : 16;
        $hora = intval(substr($horario, 0, 2));
        $turno = ($hora < $afternoon_hour) ? 'Morning' : 'Afternoon';
    }
    if ($edad === '') $edad = 'Adultos';

    global $wpdb;
    blokes_ensure_placeholder_table();
    $wpdb->insert(blokes_placeholder_table(), array(
        'nombre'     => sanitize_text_field($nombre),
        'dia'        => sanitize_text_field((string) $request->get_param('dia')),
        'horario'    => $horario,
        'edad'       => $edad,
        'turno'      => $turno,
        'status'     => 'pending',
        'created_by' => get_current_user_id(),
        'created_at' => current_time('mysql'),
    ), array('%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s'));
    if (!$wpdb->insert_id) return new WP_Error('db_error', 'Error al crear el alumno.', array('status' => 500));
    return rest_ensure_response(array('success' => true, 'placeholder_id' => $wpdb->insert_id));
}

function progreso_delete_alumno_manual($request) {
    global $wpdb;
    blokes_ensure_placeholder_table();
    $id = intval($request['id']);
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . blokes_placeholder_table() . ' WHERE id = %d', $id), ARRAY_A);
    if (!$row) return new WP_Error('not_found', 'No encontrado.', array('status' => 404));
    if ($row['status'] !== 'pending') {
        return new WP_Error('already_linked', 'Ya está vinculado a un usuario, no se puede borrar.', array('status' => 400));
    }
    progreso_ensure_training_table();
    $wpdb->delete(progreso_training_table(), array('placeholder_id' => $id), array('%d'));
    $wpdb->delete(blokes_placeholder_table(), array('id' => $id), array('%d'));
    return rest_ensure_response(array('success' => true));
}

function progreso_link_alumno_manual($request) {
    global $wpdb;
    blokes_ensure_placeholder_table();
    $id    = intval($request['id']);
    $email = sanitize_email((string) $request->get_param('email'));
    if ($email === '') return new WP_Error('invalid_data', 'Falta el email.', array('status' => 400));

    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . blokes_placeholder_table() . ' WHERE id = %d', $id), ARRAY_A);
    if (!$row) return new WP_Error('not_found', 'No encontrado.', array('status' => 404));
    if ($row['status'] !== 'pending') {
        return new WP_Error('already_linked', 'Ya estaba vinculado.', array('status' => 400));
    }

    $user = get_user_by('email', $email);
    if (!$user) return new WP_Error('user_not_found', 'No existe ninguna cuenta con ese email.', array('status' => 404));

    progreso_ensure_training_table();
    $wpdb->update(progreso_training_table(),
        array('user_id' => $user->ID, 'placeholder_id' => 0),
        array('placeholder_id' => $id),
        array('%d', '%d'), array('%d')
    );

    // Completados del alumno manual (marcados desde la tablet o Entrenamientos)
    // pasan a la cuenta real, y ahí sí entra en ligas por primera vez con los
    // puntos que le correspondan por lo ya hecho.
    blokes_ensure_placeholder_completions_table();
    $pc_table = blokes_placeholder_completions_table();
    $ph_completions = $wpdb->get_results($wpdb->prepare(
        "SELECT post_id, color, sala, completed_at FROM {$pc_table} WHERE placeholder_id = %d ORDER BY completed_at ASC", $id
    ), ARRAY_A);
    if ($ph_completions) {
        $completed_ids = get_user_meta($user->ID, '_blokes_completed', true);
        $completed_ids = is_array($completed_ids) ? array_map('intval', $completed_ids) : array();
        $log = get_user_meta($user->ID, '_blokes_completion_log', true);
        $log = is_array($log) ? $log : array();
        $newly_completed = array();
        foreach ($ph_completions as $pc_row) {
            $pid = intval($pc_row['post_id']);
            if (in_array($pid, $completed_ids, true)) continue; // ya lo tenía de verdad, no duplicar
            $completed_ids[] = $pid;
            $log[] = array(
                'postId'    => $pid,
                'color'     => $pc_row['color'],
                'sala'      => $pc_row['sala'],
                'timestamp' => date('c', strtotime($pc_row['completed_at'])),
            );
            $newly_completed[] = $pid;
        }
        update_user_meta($user->ID, '_blokes_completed', $completed_ids);
        update_user_meta($user->ID, '_blokes_completion_log', $log);
        foreach ($newly_completed as $pid) {
            blokes_register_top_for_leagues($user->ID, $pid);
        }
        $wpdb->delete($pc_table, array('placeholder_id' => $id), array('%d'));
    }

    $wpdb->update(blokes_placeholder_table(), array(
        'status'         => 'linked',
        'linked_user_id' => $user->ID,
        'linked_at'      => current_time('mysql'),
    ), array('id' => $id), array('%s', '%d', '%s'), array('%d'));

    return rest_ensure_response(array('success' => true, 'user_id' => $user->ID));
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
    // dbDelta() also ALTERs an existing table to match this definition (e.g. a
    // newly added column), so it must run whenever the schema version changes —
    // not just the first time the table is created. The version is cached in an
    // option so normal requests pay only one cheap get_option() call.
    $version = '3';
    if (get_option('blokes_training_table_version') === $version) return;
    $table = progreso_training_table();
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id             bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id        bigint(20) UNSIGNED NOT NULL,
        placeholder_id bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        test_id        tinyint(2)          NOT NULL,
        value_kg       decimal(6,2)        NOT NULL,
        logged_at      datetime            NOT NULL,
        logged_by      bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        note           text                NULL,
        PRIMARY KEY (id),
        KEY user_test (user_id, test_id),
        KEY placeholder_test (placeholder_id, test_id),
        KEY logged_at (logged_at)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
    update_option('blokes_training_table_version', $version);
}

// Qué tests tiene registrados cada alumno (alguna vez, no solo este mes), de todos a la vez —
// para marcar en la lista a quién le faltan sin pedir el historial completo uno por uno.
function progreso_get_training_completitud() {
    progreso_ensure_training_table();
    global $wpdb;
    $rows = $wpdb->get_results("SELECT DISTINCT user_id, placeholder_id, test_id FROM " . progreso_training_table(), ARRAY_A);
    $users = array(); $placeholders = array();
    foreach ($rows as $r) {
        $tid = intval($r['test_id']);
        $pid = intval($r['placeholder_id']);
        if ($pid > 0) {
            if (!isset($placeholders[$pid])) $placeholders[$pid] = array();
            $placeholders[$pid][] = $tid;
        } else {
            $uid = intval($r['user_id']);
            if (!isset($users[$uid])) $users[$uid] = array();
            $users[$uid][] = $tid;
        }
    }
    return rest_ensure_response(array('success' => true, 'data' => array('users' => $users, 'placeholders' => $placeholders)));
}

// Notas para profesores (lesiones, variantes...). Una por test y mes.
function progreso_clean_note($raw) {
    return mb_substr(sanitize_textarea_field((string) $raw), 0, 300);
}

function progreso_log_training($request) {
    global $wpdb;
    progreso_ensure_training_table();
    $user_id        = intval($request->get_param('user_id'));
    $placeholder_id = intval($request->get_param('placeholder_id'));
    $test_id        = intval($request->get_param('test_id'));
    $value_kg       = floatval($request->get_param('value_kg'));
    $has_subject    = ($user_id > 0) !== ($placeholder_id > 0);
    if (!$has_subject || $test_id < 2 || $test_id > 15 || $value_kg < 0) {
        return new WP_Error('invalid_data',
            "Datos inválidos. user_id={$user_id} placeholder_id={$placeholder_id} test_id={$test_id} value_kg={$value_kg}",
            array('status' => 400));
    }

    // One value per subject/test/month: if one already exists this month, don't
    // silently add a second row (two profes can hit this at the same time). Tell
    // the caller what's there; only overwrite when they confirm with force.
    $force       = filter_var($request->get_param('force'), FILTER_VALIDATE_BOOLEAN);
    $note        = $request->has_param('note') ? progreso_clean_note($request->get_param('note')) : null;
    $subject_col = $user_id > 0 ? 'user_id' : 'placeholder_id';
    $subject_val = $user_id > 0 ? $user_id : $placeholder_id;
    $existing = $wpdb->get_row($wpdb->prepare(
        "SELECT id, value_kg, logged_at FROM " . progreso_training_table() .
        " WHERE $subject_col = %d AND test_id = %d AND logged_at LIKE %s ORDER BY logged_at DESC, id DESC LIMIT 1",
        $subject_val, $test_id, current_time('Y-m') . '%'
    ), ARRAY_A);
    if ($existing) {
        if (!$force) {
            return new WP_Error('existing_value', 'Ya hay un registro de este test este mes.', array(
                'status'   => 409,
                'existing' => array(
                    'id'        => intval($existing['id']),
                    'value_kg'  => floatval($existing['value_kg']),
                    'logged_at' => $existing['logged_at'],
                ),
            ));
        }
        $upd = array('value_kg' => $value_kg, 'logged_by' => get_current_user_id());
        $fmt = array('%f', '%d');
        if ($note !== null) { $upd['note'] = $note; $fmt[] = '%s'; }
        $wpdb->update(progreso_training_table(), $upd, array('id' => intval($existing['id'])), $fmt, array('%d'));
        return rest_ensure_response(array('success' => true, 'id' => intval($existing['id']), 'updated' => true));
    }

    $ok = $wpdb->insert(progreso_training_table(), array(
        'user_id'        => $user_id,
        'placeholder_id' => $placeholder_id,
        'test_id'        => $test_id,
        'value_kg'       => $value_kg,
        'logged_at'      => current_time('mysql'),
        'logged_by'      => get_current_user_id(),
        'note'           => $note ?? '',
    ), array('%d', '%d', '%d', '%f', '%s', '%d', '%s'));
    if (!$ok) return new WP_Error('db_error', 'Error al guardar.', array('status' => 500));
    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id));
}

function progreso_get_mock_values() {
    $defaults = [
         2 => 14.1,  9 =>  8.0, 10 => 110.0, 12 => 75.0, 14 => 75.0, 15 => 45.0,
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
         2 => 'B',  9 => 'C', 10 => 'D', 12 => 'B', 14 => 'B', 15 => 'A',
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
        array('id' => 2,  'name' => 'Sentadilla en silla', 'unit' => 'reps',   'zone' => 'lower',   'visible' => false,
              'desc' => 'Nº máximas repeticiones en 30 seg con brazos cruzados en hombros.'),
        array('id' => 9,  'name' => 'Rodillas al pecho',   'unit' => 'reps',   'zone' => 'lower',   'visible' => false,
              'desc' => 'Nº repeticiones colgados en barra subiendo las piernas hasta 90º.'),
        array('id' => 10, 'name' => 'Apertura caderas',    'unit' => 'cm',     'zone' => 'lower',   'visible' => true,
              'desc' => 'De pie, piernas abiertas al máximo. Medimos distancia entre pies.'),
        array('id' => 12, 'name' => 'Grant Foot Raise Derecha',   'unit' => 'cm', 'zone' => 'lower', 'visible' => true,
              'desc' => 'De pie mirando a la pared, pies separados de ella y palmas apoyadas a la altura de los hombros. Subimos el pie derecho por la línea de la pared tocando con los dedos. 3 intentos, medimos la distancia al suelo en el mejor.'),
        array('id' => 14, 'name' => 'Grant Foot Raise Izquierda', 'unit' => 'cm', 'zone' => 'lower', 'visible' => true,
              'desc' => 'De pie mirando a la pared, pies separados de ella y palmas apoyadas a la altura de los hombros. Subimos el pie izquierdo por la línea de la pared tocando con los dedos. 3 intentos, medimos la distancia al suelo en el mejor.'),
        array('id' => 3,  'name' => 'Dominadas',           'unit' => 'reps',   'zone' => 'upper',   'visible' => true,
              'desc' => 'Nº máximas repeticiones.'),
        array('id' => 4,  'name' => 'Flexiones',           'unit' => 'reps',   'zone' => 'upper',   'visible' => false,
              'desc' => 'Nº máximas repeticiones tocando el suelo con el pecho.'),
        array('id' => 7,  'name' => 'Campus Derecha',   'unit' => 'cm', 'zone' => 'upper', 'visible' => true,
              'desc' => '3 intentos con la mano derecha, marcamos la altura máxima alcanzada.'),
        array('id' => 15, 'name' => 'Campus Izquierda', 'unit' => 'cm', 'zone' => 'upper', 'visible' => true,
              'desc' => '3 intentos con la mano izquierda, marcamos la altura máxima alcanzada.'),
        array('id' => 5,  'name' => 'Resis. Flex. Prof.',  'unit' => 'series', 'zone' => 'fingers', 'visible' => true,
              'desc' => 'Nº series completadas en 7 seg. de suspensión, 3 seg. de descanso. Regleta 20mm. Postura estandarizada: brazo extendido por encima de la cabeza, hombro activo, medio-crimp, pulgar fuera de la regleta.'),
        array('id' => 6,  'name' => 'Kg Max Derecha',      'unit' => 'kg',     'zone' => 'fingers', 'visible' => true,
              'desc' => 'En posición caballero (una rodilla en el suelo, la otra levantada) medimos la fuerza máxima del brazo homolateral a la rodilla apoyada en el suelo.'),
        array('id' => 13, 'name' => 'Kg Max Izquierda',    'unit' => 'kg',     'zone' => 'fingers', 'visible' => true,
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
            'id'      => intval($t['id']),
            'name'    => sanitize_text_field($t['name']),
            'unit'    => sanitize_text_field($t['unit']),
            'zone'    => sanitize_text_field($t['zone']),
            'desc'    => isset($t['desc']) ? sanitize_textarea_field($t['desc']) : '',
            'visible' => isset($t['visible']) ? (bool) $t['visible'] : true,
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
    foreach (blokes_get_all_subscription_data() as $sub) {
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
        $since = date('Y-m-d', strtotime('first day of this month -12 months'));
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

function blokes_training_history($column, $id) {
    global $wpdb;
    progreso_ensure_training_table();
    $supervisor = blokes_can_supervise(); // notes are for profesores only
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT id, test_id, value_kg, logged_at, note FROM " . progreso_training_table() .
        " WHERE {$column} = %d ORDER BY test_id ASC, logged_at ASC",
        $id
    ), ARRAY_A);
    $by_test = array();
    foreach ($rows as $row) {
        $tid = intval($row['test_id']);
        $entry = array(
            'id'        => intval($row['id']),
            'value_kg'  => floatval($row['value_kg']),
            'logged_at' => $row['logged_at'],
        );
        if ($supervisor) $entry['note'] = (string) ($row['note'] ?? '');
        $by_test[$tid][] = $entry;
    }
    return $by_test;
}

function progreso_get_training($request) {
    $user_id = intval($request['user_id']);
    $by_test = blokes_training_history('user_id', $user_id);
    return rest_ensure_response(array('success' => true, 'data' => array('user_id' => $user_id, 'tests' => $by_test)));
}

function progreso_get_training_placeholder($request) {
    $placeholder_id = intval($request['placeholder_id']);
    $by_test = blokes_training_history('placeholder_id', $placeholder_id);
    return rest_ensure_response(array('success' => true, 'data' => array('placeholder_id' => $placeholder_id, 'tests' => $by_test)));
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

    $upd = array('value_kg' => $value_kg);
    $fmt = array('%f');
    if ($request->has_param('note')) { $upd['note'] = progreso_clean_note($request->get_param('note')); $fmt[] = '%s'; }
    $wpdb->update(progreso_training_table(), $upd, array('id' => $entry_id), $fmt, array('%d'));

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
    $since = date('Y-m-d', strtotime('first day of this month -12 months'));
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

function progreso_get_class_progress($request) {
    global $wpdb;
    // Normally "mi clase"; from the tablet (viewing someone else's progress)
    // a supervisor can ask for another real user's class instead. Manual
    // alumnos never have a class of their own here — they have no real
    // subscription to read día/horario from — so there's no target_placeholder_id.
    $target_user_id = intval($request->get_param('target_user_id'));
    $me = ($target_user_id > 0 && blokes_can_supervise()) ? $target_user_id : get_current_user_id();
    if (!$me || !class_exists('RocoMadrid_SF_Stats')) {
        return rest_ensure_response(array('data' => array('class' => null, 'members' => array())));
    }

    $all = blokes_get_all_subscription_data();

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

    // Manual alumnos (no real subscription yet) sharing the same día/horario
    // are classmates too — same overlap rule as above.
    $ph_to_name = array();
    foreach (blokes_get_placeholder_alumnos('pending') as $ph) {
        if (($ph['horario'] ?? '') !== $horario) continue;
        $ph_days = array_map('trim', explode('-', $ph['dia'] ?? ''));
        if (empty(array_intersect($my_days, $ph_days))) continue;
        $ph_to_name[intval($ph['placeholder_id'])] = $ph['cliente'] ?: 'Compañero';
    }

    if (empty($uid_to_name) && empty($ph_to_name)) {
        return rest_ensure_response(array('data' => array(
            'class'   => array('dia' => $dia, 'horario' => $horario),
            'members' => array(),
        )));
    }

    progreso_ensure_training_table();
    $table = progreso_training_table();
    $by_subject = array(); // keyed "u<id>" / "p<id>" so the two id spaces never collide

    if (!empty($uid_to_name)) {
        $uids = array_keys($uid_to_name);
        $ph_marks = implode(',', array_fill(0, count($uids), '%d'));
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT user_id, test_id, value_kg, logged_at FROM {$table} WHERE user_id IN ({$ph_marks}) ORDER BY user_id, test_id, logged_at ASC",
            ...$uids
        ), ARRAY_A);
        foreach ($rows as $row) {
            $key = 'u' . intval($row['user_id']); $tid = intval($row['test_id']);
            $by_subject[$key][$tid][] = array('v' => floatval($row['value_kg']), 'm' => substr($row['logged_at'], 0, 7));
        }
    }
    if (!empty($ph_to_name)) {
        $phids = array_keys($ph_to_name);
        $ph_marks = implode(',', array_fill(0, count($phids), '%d'));
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT placeholder_id, test_id, value_kg, logged_at FROM {$table} WHERE placeholder_id IN ({$ph_marks}) ORDER BY placeholder_id, test_id, logged_at ASC",
            ...$phids
        ), ARRAY_A);
        foreach ($rows as $row) {
            $key = 'p' . intval($row['placeholder_id']); $tid = intval($row['test_id']);
            $by_subject[$key][$tid][] = array('v' => floatval($row['value_kg']), 'm' => substr($row['logged_at'], 0, 7));
        }
    }

    // Placeholder completions, fetched once and grouped so the loop below
    // doesn't hit the DB per classmate.
    $ph_logs = array();
    if (!empty($ph_to_name)) {
        blokes_ensure_placeholder_completions_table();
        $pc_table = blokes_placeholder_completions_table();
        $phids    = array_keys($ph_to_name);
        $ph_marks = implode(',', array_fill(0, count($phids), '%d'));
        $pc_rows  = $wpdb->get_results($wpdb->prepare(
            "SELECT placeholder_id, post_id, color, completed_at FROM {$pc_table} WHERE placeholder_id IN ({$ph_marks}) ORDER BY completed_at ASC",
            ...$phids
        ), ARRAY_A);
        foreach ($pc_rows as $row) {
            $ph_logs[intval($row['placeholder_id'])][] = array(
                'postId' => intval($row['post_id']), 'color' => $row['color'], 'timestamp' => $row['completed_at'],
            );
        }
    }

    $members = array();
    foreach ($uid_to_name as $uid => $name) {
        $tests = array();
        foreach ($by_subject['u' . $uid] ?? array() as $tid => $entries) {
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
    // Manual alumnos: same shape, no account yet so no nick/avatar/ratings —
    // UserAvatar already falls back to "nombre_climb" when nickname is blank.
    foreach ($ph_to_name as $phid => $name) {
        $tests = array();
        foreach ($by_subject['p' . $phid] ?? array() as $tid => $entries) {
            $baseline = $entries[0]['v']; $latest = $entries[count($entries) - 1]['v'];
            $pct = $baseline > 0 ? (($latest - $baseline) / $baseline) * 100 : 0;
            $months = count(array_unique(array_column($entries, 'm')));
            $tests[$tid] = array('pct' => round($pct, 1), 'months' => $months);
        }
        $log = $ph_logs[$phid] ?? array();
        $bloke_by_color = array();
        foreach ($log as $entry) {
            $bloke_by_color[$entry['color']] = ($bloke_by_color[$entry['color']] ?? 0) + 1;
        }
        $members[] = array(
            'is_me'          => false,
            'user_id'        => 0,
            'placeholder_id' => $phid,
            'is_placeholder' => true,
            'name'           => $name,
            'nickname'       => '',
            'avatarType'     => '',
            'avatarData'     => new stdClass(),
            'tests'          => $tests,
            'bloke_total'    => count($log),
            'bloke_by_color' => $bloke_by_color,
            'rating_total'   => 0,
            'rating_by_type' => array('star_1' => 0, 'star_2' => 0, 'star_3' => 0, 'skull' => 0),
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
    foreach ($ph_logs as $log) {
        foreach ($log as $entry) {
            $bloke_counts[$entry['postId']] = ($bloke_counts[$entry['postId']] ?? 0) + 1;
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
    foreach ($ph_logs as $log) {
        foreach ($log as $entry) {
            $ts = strtotime($entry['timestamp'] ?? '');
            if (!$ts || $ts < $cutoff) continue;
            $recent_counts[$entry['postId']] = ($recent_counts[$entry['postId']] ?? 0) + 1;
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
    // Día 1 del mes antes de restar (ver superadmin_gestion_grupos): si no, los días 29-31 se
    // desbordan al mes siguiente.
    $start_date = (new DateTime("first day of this month -{$months} months"))->format('Y-m-d');

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
    $start_date = (new DateTime("first day of this month -{$months} months"))->format('Y-m-d');

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

// Cuenta PERSONAS (cuentas de facturación), no suscripciones: una suscripción Martes-Jueves
// es 1 persona que viene 2 días; dos suscripciones de la misma cuenta son la misma persona.
// Aviso: hoy la cuenta es la unidad real (no hay un campo "alumno" en la suscripción, distinto
// del pagador — lo añadirá la migración de la sección 8), así que una cuenta con varios
// alumnos (p. ej. hermanos) cuenta aquí como 1. "En vigor" incluye pending-cancel (todavía
// viene, aunque no se renueve), igual que el resto de ExcelMuerte.
function superadmin_people_summary($request) {
    if (!class_exists('RocoMadrid_SF_Stats')) {
        return new WP_Error('class_not_found', 'RocoMadrid_SF_Stats not available. Call this endpoint on the club subsite.', array('status' => 503));
    }

    $all = blokes_get_all_subscription_data();
    $vigentes = array_values(array_filter($all, function($s) { return ($s['status'] ?? '') === 'active'; }));

    $cuentas = array();
    // Sesiones/semana = plazas por sesión sumadas (una Martes-Jueves cuenta en los dos días),
    // igual criterio que la columna Total de "Horario por día".
    $sesiones_semana = 0;
    $ingreso_mes_total = 0;

    foreach ($vigentes as $sub) {
        if (empty($sub['id'])) continue;
        $uid = intval(get_post_meta($sub['id'], '_customer_user', true));
        if (!$uid && !empty($sub['email'])) {
            $u = get_user_by('email', $sub['email']);
            if ($u) $uid = $u->ID;
        }
        $cuenta_key = $uid ? "u{$uid}" : (!empty($sub['email']) ? 'e' . strtolower($sub['email']) : "s{$sub['id']}");

        $producto        = $sub['producto'] ?? '';
        $edad            = $sub['edad'] ?? 'Adultos';
        $es_pilates_yoga = in_array($producto, array('Pilates', 'Yoga'), true);
        $es_menor        = $edad !== 'Adultos';
        $bucket          = $es_pilates_yoga ? 'pilates_yoga' : ($es_menor ? 'ninos_adolescentes' : 'adultos_grupo');

        $dia      = $sub['dia'] ?? '';
        $dias_sub = $dia ? explode('-', $dia) : array();

        if (!isset($cuentas[$cuenta_key])) {
            $cuentas[$cuenta_key] = array('dias' => array(), 'bucket' => $bucket, 'nombre' => $sub['cliente'] ?? '', 'ingresoMes' => 0);
        }
        foreach ($dias_sub as $d) {
            $cuentas[$cuenta_key]['dias'][$d] = true;
            $sesiones_semana++;
        }
        // Si una cuenta mezcla Pilates/Yoga con un grupo normal, que cuente como el grupo normal
        if ($cuentas[$cuenta_key]['bucket'] === 'pilates_yoga' && $bucket !== 'pilates_yoga') {
            $cuentas[$cuenta_key]['bucket'] = $bucket;
        }

        if (function_exists('wcs_get_subscription')) {
            $sub_obj = wcs_get_subscription(intval($sub['id']));
            if ($sub_obj) {
                $total    = floatval($sub_obj->get_total());
                $period   = $sub_obj->get_billing_period();
                $interval = max(1, intval($sub_obj->get_billing_interval()));
                $meses    = $period === 'year' ? ($interval * 12) : ($period === 'month' ? $interval : null);
                if ($meses) {
                    $equivalente = round($total / $meses, 2);
                    $ingreso_mes_total += $equivalente;
                    $cuentas[$cuenta_key]['ingresoMes'] += $equivalente;
                }
            }
        }
    }

    $por_dias = array(
        'adultos_grupo'      => array('1' => 0, '2' => 0, '3+' => 0),
        'ninos_adolescentes' => array('1' => 0, '2' => 0, '3+' => 0),
        'pilates_yoga'       => array('1' => 0, '2' => 0, '3+' => 0),
    );
    foreach ($cuentas as $c) {
        $n = count($c['dias']);
        $clave = $n >= 3 ? '3+' : (string) $n;
        $por_dias[$c['bucket']][$clave]++;
    }

    $data = array(
        'cuentas_total'      => count($cuentas),
        'por_dias'           => $por_dias,
        'sesiones_semana'    => $sesiones_semana,
    );
    // Dinero agregado del club: solo socio (31/10, regla de Ramiro).
    if (blokes_es_socio()) $data['ingreso_mes_total'] = round($ingreso_mes_total, 2);
    return rest_ensure_response(array('success' => true, 'data' => $data));
}

// Pantalla "Grupos" (sección 8.1): sustituye la lectura del Excel de Eva. Por ahora solo
// lectura (sin las acciones de la sección 8.2, que van en una ronda aparte, probadas primero
// con datos de prueba). Una fila por SUSCRIPCIÓN, no por alumno — hasta que la migración
// (8.4) añada el campo "Alumno", alumno y pagador son la misma persona.
// Un día suelto pertenece siempre a la misma pareja de días que ya usa Eva en sus pestañas
// (Martes y Jueves van juntos en "M-J", Lunes y Miércoles en "L-X"); si ya viene como pareja
// (o es Viernes/Sábado/vacío de Pilates-Yoga), se deja igual.
function blokes_dia_a_pareja($dia) {
    $map = array('Lunes' => 'Lunes-Miércoles', 'Miércoles' => 'Lunes-Miércoles', 'Martes' => 'Martes-Jueves', 'Jueves' => 'Martes-Jueves');
    return $map[$dia] ?? $dia;
}

// Si el teléfono de facturación está vacío (alta hecha desde admin), muchas cuentas usan un
// email del tipo "6xxxxxxxx@rocomadrid.com": el número sigue sirviendo de teléfono.
function blokes_telefono_de_email($email) {
    $local = $email ? strstr($email, '@', true) : false;
    return ($local && preg_match('/^\d{9}$/', $local)) ? $local : '';
}

// Para agrupar por franja no basta con el horario normalizado "para mostrar": altas hechas
// desde admin guardan el horario con espacios o guiones distintos ("17:30 - 18:30" vs
// "17:30-18:30") y eso partía el mismo grupo en dos en el selector.
function blokes_horario_agrupable($horario) {
    $h = trim((string) $horario);
    $h = preg_replace('/\s*-\s*/', '-', $h);
    return preg_replace('/\s+/', ' ', $h);
}

function superadmin_gestion_grupos($request) {
    if (!class_exists('RocoMadrid_SF_Stats') || !function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'RocoMadrid_SF_Stats/WooCommerce Subscriptions not available. Call this endpoint on the club subsite.', array('status' => 503));
    }
    $months = max(1, min(12, intval($request->get_param('months')) ?: 4));
    $meses  = array();
    for ($i = $months - 1; $i >= 0; $i--) {
        // Día 1 del mes antes de restar: si no, los días 29-31 se desbordan al mes siguiente
        // (31/10 menos 1 mes da "31/09", que no existe, y PHP lo convierte en 1/10 — se
        // repetía octubre dos veces y faltaba septiembre).
        $meses[] = (new DateTime('first day of this month'))->modify("-{$i} months")->format('Y-m');
    }
    $meses_set = array_fill_keys($meses, true);

    $all    = blokes_get_all_subscription_data();
    $grupos = array();
    $cobros_manuales = blokes_cobros_manuales_todos(); // efectivo apuntado desde "Marcar cobrado", sin WooCommerce
    $optin_por_tel = blokes_optin_por_telefono(); // marca (WA) junto al nombre
    $hoy_ym = date('Y-m');

    // Pagos adelantados sin aplicar todavía (Ramiro, 1/11 18:55): si ya hay uno guardado para
    // esta suscripción, "Cobrar este mes" no debe parecer que nadie se ha ocupado — se marca
    // "adelantado, se aplicará el día de la renovación" en vez de un simple pendiente mudo
    // (cowork, 2/11 09:40: dos alumnos de prueba con adelantado seguían saliendo como si nadie
    // se hubiera ocupado).
    blokes_ensure_adelantados_table();
    global $wpdb;
    $adelantados_por_sub = array();
    foreach ($wpdb->get_results(
        "SELECT * FROM " . blokes_adelantados_table() . " WHERE aplicado_at IS NULL AND revisar = 0 ORDER BY periodo ASC, id ASC", ARRAY_A
    ) as $ad) {
        $sid = intval($ad['sub_id']);
        if (!isset($adelantados_por_sub[$sid])) $adelantados_por_sub[$sid] = $ad;
    }

    foreach ($all as $sub) {
        if (empty($sub['id'])) continue;
        $status = $sub['status'] ?? '';
        if (!in_array($status, array('active', 'on-hold', 'pending'), true)) continue; // cancelled de verdad: fuera

        $dia = $sub['dia'] ?? ''; $horario = $sub['horario'] ?? ''; $edad = $sub['edad'] ?? 'Adultos';
        $producto = $sub['producto'] ?? '';
        $es_pilates_yoga = in_array($producto, array('Pilates', 'Yoga'), true);
        $es_abono = ($producto === 'Abono');
        if (!$dia && !$horario && !$es_pilates_yoga) continue;

        $sub_obj = wcs_get_subscription(intval($sub['id']));
        if (!$sub_obj) continue;

        // Agrupar por franja como en el Excel de Eva (M-J 20:30 junta a los de 2 días y a los
        // sueltos de solo martes o solo jueves), no por cada combinación exacta de día. El
        // horario se normaliza aparte para agrupar (espacios/guiones distintos de las altas
        // hechas desde admin no deben partir el mismo grupo en dos). Abono (escalada libre, sin
        // día fijo) se agrupa por su franja ("Todo el día"/"Mañana"), no por día — igual que
        // Pilates/Yoga, pero sin perder esa franja en el label (ver abajo).
        $pareja         = ($es_pilates_yoga || $es_abono) ? $producto : blokes_dia_a_pareja($dia);
        $horario_agrupa = blokes_horario_agrupable($horario);
        $gkey   = $pareja . '|' . $horario_agrupa . '|' . $edad;
        if (!isset($grupos[$gkey])) {
            // La edad va DENTRO del label (no solo como campo aparte): dos grupos con el mismo
            // día+horario pero distinta edad (adultos y niños a la misma hora) se veían
            // idénticos en el selector si solo el frontend decidía si añadir el sufijo.
            $edad_suffix = '';
            if (!$es_pilates_yoga && $edad !== 'Adultos') {
                $edad_suffix = ' · ' . (stripos($edad, 'Menores') !== false ? 'Niños' : (stripos($edad, 'Adolescentes') !== false ? 'Adol.' : $edad));
            }
            $label = $es_pilates_yoga ? $producto : (trim($pareja . ' · ' . $horario_agrupa) . $edad_suffix);
            $grupos[$gkey] = array('label' => $label, 'dia' => $pareja, 'horario' => $horario_agrupa, 'edad' => $edad, 'personas' => array());
        }

        $es_pending_cancel = ($sub['status_raw'] ?? '') === 'pending-cancel';
        $pausa_motivo = $status === 'on-hold' ? get_post_meta($sub_obj->get_id(), '_rm_pausa_motivo', true) : '';
        $pausa_hasta  = $status === 'on-hold' ? get_post_meta($sub_obj->get_id(), '_rm_pausa_hasta', true) : '';
        $estado = $es_pending_cancel ? 'baja_fin_mes'
            : ($status === 'on-hold' ? ($pausa_motivo ? 'pausado' : 'en_espera') : ($status === 'pending' ? 'pendiente_pago' : 'activo'));
        $en_vigor = ($estado === 'activo' || $estado === 'baja_fin_mes'); // mismo criterio que people-summary

        $dias_sub = $dia ? explode('-', $dia) : array();

        // "Pendiente" = hay de verdad un pedido sin pagar (pending/failed/on-hold) relacionado,
        // no "no hay un pedido fechado este mes" (eso contaba mal a quien paga trimestral: su
        // único pedido es de hace 2 meses y le cubre de sobra, sin que haga falta ningún cálculo
        // de periodos — si no hay pedido impagado, no está pendiente).
        $pagos = array_fill_keys($meses, null);
        $pendiente = null;
        // Fecha de vencimiento real de la suscripción (próxima renovación) — antes se mostraba
        // la fecha de creación del PEDIDO pendiente, que puede ser bastante anterior a cuándo
        // vence de verdad y confundía (cowork, 2/11 09:40: salía "01/10" con el próximo pago ya
        // el 02/11). Se guarda aparte y se usa siempre que exista, cayendo a la fecha del pedido
        // solo si la suscripción no tiene next_payment (p. ej. ya cancelada).
        $next_payment_mysql = method_exists($sub_obj, 'get_date') ? $sub_obj->get_date('next_payment') : '';
        $vence_ts = $next_payment_mysql ? strtotime($next_payment_mysql) : null;
        $order_ids = array_filter(array_merge(array($sub_obj->get_parent_id()), $sub_obj->get_related_orders('ids', 'renewal')));
        foreach ($order_ids as $oid) {
            $order = wc_get_order($oid);
            if (!$order) continue;
            $fecha = $order->get_date_paid() ?: $order->get_date_created();
            if (!$fecha) continue;
            $o_status = $order->get_status();
            if (in_array($o_status, array('pending', 'failed', 'on-hold'), true)) {
                if (!$pendiente || $fecha->getTimestamp() > $pendiente['ts']) {
                    // Si la suscripción no tiene next_payment (p. ej. ella misma está en pausa,
                    // o es una duplicada vieja sin renovación programada), no hay vencimiento
                    // real que mostrar: se cae a la fecha del PEDIDO, pero marcada como tal, no
                    // como si fuera una fecha de vencimiento (cowork, 2/11 11:25: con un alumno
                    // sin next_payment seguía llamándose "vence" a la fecha de un pedido viejo).
                    $pendiente = array(
                        'importe' => floatval($order->get_total()),
                        'fecha'   => $vence_ts ? date('d/m/Y', $vence_ts) : $fecha->date('d/m/Y'),
                        'fechaEsVencimiento' => (bool) $vence_ts,
                        'ts'      => $fecha->getTimestamp(),
                    );
                }
            }
            // A qué mes pertenece este pago: por cuándo WooCommerce generó la renovación
            // (date_created), no por cuándo se marcó pagada — un adelantado (ver
            // blokes_aplicar_adelantado_si_hay) deja la suscripción con la fecha REAL del banco,
            // que puede caer en el mes anterior al que de verdad cubre, y el pago se colaba en el
            // cubo equivocado (cowork, 3/11-4/11: pedido 7546, date_created 02/11 pero date_paid
            // 29/10 — confirmado con el date_created real antes de aplicar esto).
            $fecha_mes = $order->get_date_created() ?: $fecha;
            $ym = $fecha_mes->date('Y-m');
            if (!isset($meses_set[$ym])) continue;
            $metodo = $order->get_payment_method_title();
            if (!$metodo && in_array($o_status, array('completed', 'processing'), true)) $metodo = 'Manual';
            $pagos[$ym] = array(
                'importe' => floatval($order->get_total()),
                'metodo'  => $metodo,
                'fecha'   => $fecha->date('d/m/Y'),
                'estadoPedido' => $o_status,
            );
        }
        // Un pedido viejo sin pagar (de un mes anterior, ya cancelado o simplemente colgando)
        // no debe seguir marcando "pendiente" si el mes EN CURSO ya tiene un pedido de verdad
        // completed/processing — antes se quedaba el pendiente más reciente encontrado aunque
        // hubiera un pago posterior que lo dejara obsoleto (cowork, 3/11 18:40: dos alumnos que
        // ya habían pagado noviembre seguían saliendo en "Pendientes de cobrar" con una fecha de
        // vencimiento vieja, de un pedido de octubre).
        if ($pendiente && !empty($pagos[$hoy_ym]) && in_array($pagos[$hoy_ym]['estadoPedido'] ?? '', array('completed', 'processing'), true)) {
            $pendiente = null;
        }
        if ($pendiente) unset($pendiente['ts']);

        // Trimestrales y anuales (Ramiro, 31/10 17:11): un pago cubre varios meses de golpe, así
        // que los meses siguientes al del cobro (hasta el que viene antes de la próxima
        // renovación) se marcan "cubierto por" ese pago, no "—". Antes de la fecha de renovación
        // nunca hay pendiente de verdad (no hay pedido sin pagar), así que esto es solo para que
        // la tabla no parezca que esos meses no se pagaron.
        $meses_por_ciclo = 1;
        $periodo_fact = $sub_obj->get_billing_period();
        $intervalo_fact = max(1, intval($sub_obj->get_billing_interval()));
        if ($periodo_fact === 'year') $meses_por_ciclo = $intervalo_fact * 12;
        elseif ($periodo_fact === 'month') $meses_por_ciclo = $intervalo_fact;
        if ($meses_por_ciclo > 1) {
            $meses_idx = array_values($meses);
            foreach ($meses_idx as $idx => $ym) {
                if (empty($pagos[$ym]) || ($pagos[$ym]['estadoPedido'] ?? '') !== 'completed' || !empty($pagos[$ym]['cubierto'])) continue;
                for ($k = 1; $k < $meses_por_ciclo; $k++) {
                    if (!isset($meses_idx[$idx + $k])) break;
                    $ym_cubierto = $meses_idx[$idx + $k];
                    if (!empty($pagos[$ym_cubierto])) continue; // ya tiene su propio registro: no se pisa
                    $pagos[$ym_cubierto] = array(
                        'cubierto' => true, 'cubiertoPor' => $ym,
                        'importe' => $pagos[$ym]['importe'], 'metodo' => $pagos[$ym]['metodo'], 'fecha' => $pagos[$ym]['fecha'],
                        'tipo' => $meses_por_ciclo === 3 ? 'TRI' : ($meses_por_ciclo === 12 ? 'ANUAL' : null),
                        'estadoPedido' => 'completed',
                    );
                }
            }
        }

        // Fusiona los cobros en efectivo apuntados a mano (sin WooCommerce): ganan sobre un
        // pedido de la web para ese mes, y si hay uno de este mes, ya no hay nada "pendiente"
        // aunque quede un pedido viejo sin pagar colgando.
        foreach ($meses as $ym) {
            $cm = $cobros_manuales[$sub['id'] . '|' . $ym] ?? null;
            if ($cm) {
                $pagos[$ym] = array(
                    'importe' => floatval($cm['importe']), 'metodo' => blokes_gestion_metodo_label($cm['metodo']),
                    'fecha'   => date('d/m/Y', strtotime($cm['fecha'])), 'estadoPedido' => 'completed',
                );
            }
        }
        if ($pendiente && isset($cobros_manuales[$sub['id'] . '|' . $hoy_ym])) $pendiente = null;
        // Ya hay un pago adelantado guardado para esta suscripción (ver Marcar cobrado): no hace
        // falta cobrarle nada — nunca debe aparecer en "Cobrar este mes" por esto (cowork, 2/11
        // 09:40/10:08: un alumno de prueba seguía contando en la bandeja con la fecha de un
        // pedido viejo de OTRA suscripción duplicada suya, porque al no tener él ningún pendiente
        // propio, la fusión de duplicados de más abajo tomaba el de esa otra). No se convierte en
        // un $pendiente falso (eso lo volvería a meter en "Cobrar este mes", que es justo lo que
        // no se quiere); solo se guarda aparte para que la fusión de duplicados no le cuelgue el
        // de otra suscripción, y para pintar la columna del mes que cubre.
        $tiene_adelantado = isset($adelantados_por_sub[intval($sub['id'])]) ? $adelantados_por_sub[intval($sub['id'])] : null;
        if ($tiene_adelantado) {
            if ($pendiente) {
                $pendiente['adelantado'] = true;
                $pendiente['adelantadoImporte'] = floatval($tiene_adelantado['importe']);
                $pendiente['adelantadoMetodo']  = blokes_gestion_metodo_label($tiene_adelantado['metodo']);
            }
            // La columna del mes que cubre el adelantado: en vez de "—" (como si nadie hubiera
            // pagado nada), se ve ya el importe marcado como adelantado (cowork, 2/11 09:42).
            if (isset($meses_set[$tiene_adelantado['periodo']]) && empty($pagos[$tiene_adelantado['periodo']])) {
                $pagos[$tiene_adelantado['periodo']] = array(
                    'importe' => floatval($tiene_adelantado['importe']), 'metodo' => blokes_gestion_metodo_label($tiene_adelantado['metodo']),
                    'fecha' => date('d/m/Y', strtotime($tiene_adelantado['fecha_banco'])), 'estadoPedido' => 'adelantado', 'adelantado' => true,
                );
            }
        }

        $uid = intval(get_post_meta($sub_obj->get_id(), '_customer_user', true));
        $persona_key = $uid ? "u{$uid}" : (!empty($sub['email']) ? 'e' . strtolower($sub['email']) : ('n' . strtolower(trim($sub['cliente'] ?? ''))));

        // El teléfono/nombre de la propia suscripción (su copia de la dirección de
        // facturación) es más de fiar que el del plugin de terceros o el de la cuenta: para
        // una familia con una sola cuenta, el de facturación de CADA suscripción suele ser el
        // del alumno real, no el del pagador. Si ni eso ni la cuenta tienen nada (altas desde
        // admin sin dirección de facturación), se mira el perfil de WordPress del usuario.
        $placeholder = array('', 'N/A', '-', '—');
        $telefono = $sub_obj->get_billing_phone();
        if (in_array($telefono, $placeholder, true)) $telefono = $sub['telefono'] ?? '';
        if (in_array($telefono, $placeholder, true)) $telefono = blokes_telefono_de_email($sub['email'] ?? $sub_obj->get_billing_email());
        if (in_array($telefono, $placeholder, true) && $uid) $telefono = get_user_meta($uid, 'billing_phone', true);
        if (in_array($telefono, $placeholder, true)) $telefono = '';

        $nombre_fact = trim($sub_obj->get_billing_first_name() . ' ' . $sub_obj->get_billing_last_name());
        if ($nombre_fact === '' && $uid) {
            $u = get_user_by('id', $uid);
            if ($u) {
                $nombre_fact = trim($u->first_name . ' ' . $u->last_name);
                if ($nombre_fact === '') $nombre_fact = $u->display_name && $u->display_name !== $u->user_login ? $u->display_name : '';
            }
        }
        $alumno_nombre = $nombre_fact !== '' ? $nombre_fact : ($sub['cliente'] ?? '');

        $fila = array(
            'subId'       => intval($sub['id']),
            'alumno'      => $alumno_nombre,
            'telefono'    => $telefono,
            'optinWhatsapp' => $telefono ? ($optin_por_tel[blokes_externos_normaliza_telefono($telefono)] ?? null) : null,
            'dias'        => count($dias_sub) ?: 1,
            'estado'      => $estado,
            'enVigor'     => $en_vigor,
            'pausaMotivo' => $pausa_motivo ?: '',
            'pausaHasta'  => $pausa_hasta ?: '',
            'manual'      => method_exists($sub_obj, 'is_manual') ? $sub_obj->is_manual() : true,
            // "Altas manuales" (NOTAS_PARA_CODE_pestanas_grupos.md): creada desde el panel
            // (admin_assign), no por el checkout de la web — distinto de "manual" (que es el
            // método de cobro, bacs/tarjeta a mano, y que un alumno normal también puede tener
            // si eligió transferencia al suscribirse él mismo).
            'altaManual'  => method_exists($sub_obj, 'get_created_via') ? ($sub_obj->get_created_via() === 'admin_assign') : false,
            'importeCatalogo' => floatval($sub_obj->get_total()),
            'exento'      => (bool) get_post_meta($sub_obj->get_id(), '_rm_exento', true),
            'pagos'       => $pagos,
            'pendiente'   => $pendiente,
            'tieneAdelantado' => (bool) $tiene_adelantado,
            'notas'       => get_post_meta($sub_obj->get_id(), '_rm_nota', true) ?: '',
            // Sin nombre de facturación ni en el perfil de WordPress: lo que se ve es el
            // nombre de usuario de la cuenta, no un nombre real.
            'sinNombre'   => $nombre_fact === '',
            'tutorNombre'   => get_post_meta($sub_obj->get_id(), '_rm_tutor_nombre', true) ?: '',
            'tutorTelefono' => get_post_meta($sub_obj->get_id(), '_rm_tutor_telefono', true) ?: '',
            // Precio especial (NOTAS_PARA_CODE_pestanas_grupos.md, Ramiro 06/11 16:00): puesto
            // desde "Marcar cobrado" con la opción "y desde ahora" — para que Eva lo vea de un
            // vistazo en la ficha.
            'precioEspecial' => get_post_meta($sub_obj->get_id(), '_rm_precio_especial', true) !== '' ? array(
                'importe' => floatval(get_post_meta($sub_obj->get_id(), '_rm_precio_especial', true)),
                'motivo'  => get_post_meta($sub_obj->get_id(), '_rm_precio_especial_motivo', true) ?: '',
                'desde'   => get_post_meta($sub_obj->get_id(), '_rm_precio_especial_desde', true) ?: '',
                'por'     => get_post_meta($sub_obj->get_id(), '_rm_precio_especial_por', true) ?: '',
            ) : null,
        );

        if (!isset($grupos[$gkey]['personas'][$persona_key])) $grupos[$gkey]['personas'][$persona_key] = array();
        $grupos[$gkey]['personas'][$persona_key][] = $fila;
    }

    // Alumnos "externos" (8.4: pagan fuera de la web, no tienen suscripción) — una fila más por
    // grupo, con el mismo aspecto que las de WooCommerce para que las bandejas y bandejas de la
    // 8.3 los traten igual. Sin pedido real, así que nunca tienen "pendiente" calculado (se ve
    // en la columna del mes si falta el pago, no en la bandeja "Cobrar este mes").
    foreach (blokes_externos_todos() as $ext) {
        $dia_ext = $ext['dia']; $horario_ext = $ext['horario']; $edad_ext = $ext['edad'] ?: 'Adultos';
        $es_py_ext = in_array($dia_ext, array('Pilates', 'Yoga'), true);
        $pareja_ext = $es_py_ext ? $dia_ext : blokes_dia_a_pareja($dia_ext);
        $horario_agrupa_ext = blokes_horario_agrupable($horario_ext);
        $gkey_ext = $pareja_ext . '|' . $horario_agrupa_ext . '|' . $edad_ext;
        if (!isset($grupos[$gkey_ext])) {
            $edad_suffix = (!$es_py_ext && $edad_ext !== 'Adultos') ? ' · ' . (stripos($edad_ext, 'Menores') !== false ? 'Niños' : (stripos($edad_ext, 'Adolescentes') !== false ? 'Adol.' : $edad_ext)) : '';
            $label_ext = $es_py_ext ? $dia_ext : (trim($pareja_ext . ' · ' . $horario_agrupa_ext) . $edad_suffix);
            $grupos[$gkey_ext] = array('label' => $label_ext, 'dia' => $pareja_ext, 'horario' => $horario_agrupa_ext, 'edad' => $edad_ext, 'personas' => array());
        }
        $pagos_ext = array_fill_keys($meses, null);
        foreach ($ext['pagos'] as $ym => $p) if (isset($meses_set[$ym])) $pagos_ext[$ym] = array_merge($p, array('estadoPedido' => 'completed'));
        $persona_key_ext = 'ext' . $ext['id'];
        $grupos[$gkey_ext]['personas'][$persona_key_ext][] = array(
            'subId' => 'ext-' . $ext['id'], 'alumno' => $ext['nombre'], 'telefono' => $ext['telefono'],
            'optinWhatsapp' => $ext['telefono'] ? ($optin_por_tel[blokes_externos_normaliza_telefono($ext['telefono'])] ?? null) : null,
            'dias' => 1, 'estado' => 'externo', 'enVigor' => true, 'pausaMotivo' => '', 'pausaHasta' => '',
            'manual' => true, 'importeCatalogo' => 0, 'exento' => (bool) $ext['exento'], 'pagos' => $pagos_ext,
            'pendiente' => null, 'notas' => $ext['notas'], 'sinNombre' => false, 'esExterno' => true,
            'externoId' => intval($ext['id']), 'externoDia' => $dia_ext, 'externoHorario' => $horario_ext, 'externoEdad' => $edad_ext,
            'tutorNombre' => $ext['tutor_nombre'] ?: '', 'tutorTelefono' => $ext['tutor_telefono'] ?: '',
        );
    }

    // Una persona con varias suscripciones en el mismo grupo (alta nueva + vieja en espera
    // colgando, lo típico de los 19 duplicados de octubre): una sola fila, con el histórico de
    // pagos de todas fusionado; las demás se guardan aparte como "duplicados" (bandeja 8.3).
    $data = array();
    foreach ($grupos as $g) {
        $alumnos = array(); $duplicados = array();
        foreach ($g['personas'] as $subs) {
            usort($subs, function($a, $b) {
                $rango = function($s) { return $s['enVigor'] ? 0 : (in_array($s['estado'], array('en_espera', 'pausado'), true) ? 1 : 2); };
                return $rango($a) <=> $rango($b);
            });
            $principal = $subs[0];
            $otras = array_slice($subs, 1);
            foreach ($otras as $otra) {
                foreach ($otra['pagos'] as $ym => $p) {
                    if ($p && empty($principal['pagos'][$ym])) $principal['pagos'][$ym] = $p;
                }
                // No colgarle el pendiente de una suscripción vieja/duplicada a quien ya tiene
                // un pago adelantado guardado en la suya, o a quien ya tiene un pedido
                // completed/processing de ESTE mes en la suya (su pago real llegó por su propia
                // suscripción, la duplicada vieja solo arrastra un pedido impagado antiguo) — si
                // no, parece que le queda algo por cobrar cuando en realidad ya está resuelto
                // (cowork, 2/11 09:40/10:08 para el adelantado; 3/11 20:05 para este otro caso:
                // el pago llegaba por la principal, pero la fusión colgaba igual el pendiente
                // viejo de la duplicada en espera).
                $principal_cobrado_este_mes = !empty($principal['pagos'][$hoy_ym])
                    && in_array($principal['pagos'][$hoy_ym]['estadoPedido'] ?? '', array('completed', 'processing'), true);
                if (!$principal['pendiente'] && !$principal['tieneAdelantado'] && !$principal_cobrado_este_mes && $otra['pendiente']) $principal['pendiente'] = $otra['pendiente'];
                if ($otra['exento']) $principal['exento'] = true;
            }
            if ($otras) {
                $principal['otrasSubs'] = array_map(function($s) { return array('subId' => $s['subId'], 'estado' => $s['estado']); }, $otras);
                $duplicados[] = array('alumno' => $principal['alumno'], 'subs' => array_map(function($s) { return array('subId' => $s['subId'], 'estado' => $s['estado']); }, $subs));
            }
            $alumnos[] = $principal;
        }
        usort($alumnos, function($a, $b) { return strcasecmp($a['alumno'], $b['alumno']); });
        $data[] = array('label' => $g['label'], 'dia' => $g['dia'], 'horario' => $g['horario'], 'edad' => $g['edad'], 'alumnos' => $alumnos, 'duplicados' => $duplicados);
    }
    usort($data, function($a, $b) { return count($b['alumnos']) <=> count($a['alumnos']); });

    return rest_ensure_response(array('success' => true, 'data' => array('meses' => $meses, 'grupos' => $data)));
}

// ─── Sección 8.2: acciones de ExcelMuerte sobre WooCommerce (quedan registradas) ──────────

// Actualiza las metas VISIBLES de un item de pedido/suscripción (las que WooCommerce rellena
// solas al comprar desde el step-form: "Días"/"Día", "Horario" y "Edad del alumno") — distintas
// de `_step_form_selections` (meta técnica interna). Cowork, 07/11 08:15: superadmin_gestion_
// cambiar_grupo() solo cambiaba la variación y `_step_form_selections`, así que la línea seguía
// ENSEÑANDO el horario viejo (y esa es la meta que se copia a cada renovación, así que también
// salía mal en la factura).
// WooCommerce guarda los atributos de la variación con el SLUG del atributo como clave y el
// slug del término como valor (`pa_horario` = `1930-2100`) y él mismo pone la etiqueta «Horario»
// al enseñarlos. La versión de 2baec8d escribía con la etiqueta como clave («Día», «Horario») y
// la línea salía con el horario viejo Y el nuevo (cowork, 07/11): aquí se borran esas claves
// sueltas y los `pa_*` se copian de la variación que YA tiene el item — así que hay que llamarla
// después de set_variation_id(). También rehace `_step_form_display` desde `_step_form_selections`.
function blokes_gestion_actualizar_meta_visible_grupo($item, $edad_nuevo, $billing_period = null, $billing_interval = null) {
    $taxonomias = array('pa_dias', 'pa_dia-suelto', 'pa_horario', 'pa_edad');
    foreach ($taxonomias as $tax) {
        $label = wc_attribute_label($tax);
        if ($label !== $tax) $item->delete_meta_data($label);
    }
    $edad_variacion = '';
    $variacion = wc_get_product($item->get_variation_id());
    if ($variacion) {
        $attrs = $variacion->get_attributes();
        foreach ($taxonomias as $tax) {
            if (!array_key_exists($tax, $attrs)) $item->delete_meta_data($tax);           // p. ej. pa_dias al pasar a 1 día
            elseif ((string) $attrs[$tax] !== '') $item->update_meta_data($tax, $attrs[$tax]); // '' = «cualquiera»: se deja lo que hubiera
        }
        if (!empty($attrs['pa_edad'])) {
            $edad_term = get_term_by('slug', $attrs['pa_edad'], 'pa_edad');
            $edad_variacion = blokes_normalizar_edad($edad_term ? $edad_term->name : $attrs['pa_edad']);
        }
    }
    // "Edad del alumno" (meta técnica aparte de pa_edad) solo hace falta cuando la edad real no
    // coincide con la que ya enseña la propia variación (Adolescentes se compra sobre la
    // variación de Adultos, ver blokes_buscar_variacion_clase()) — si coinciden (caso normal), una
    // compra real desde la web solo enseña "Edad" una vez; no la dupliques (cowork, 07/11 10:10).
    $etiqueta_edad = __('Student age', 'neve-child');
    if ($edad_nuevo && $edad_nuevo !== $edad_variacion) {
        $item->update_meta_data($etiqueta_edad, $edad_nuevo);
    } else {
        $item->delete_meta_data($etiqueta_edad);
    }

    // "Plan de pago": el step-form real la pone al pasar por el carrito (class-cart.php), pero el
    // alta y "Cambiar de grupo" crean la línea directamente en WooCommerce sin carrito, así que
    // no salía (cowork, 07/11 10:10) — mismas etiquetas que usa el step-form real.
    if ($billing_period !== null) {
        $interval_norm = max(1, intval($billing_interval ?: 1));
        $plan_key = ($billing_period === 'year') ? 'annual' : (($interval_norm >= 3) ? 'quarterly' : 'monthly');
        $plan_labels = array(
            'monthly'   => __('Monthly', 'neve-child'),
            'quarterly' => __('Quarterly', 'neve-child'),
            'annual'    => __('Annual', 'neve-child'),
        );
        $item->update_meta_data(__('Payment plan', 'neve-child'), $plan_labels[$plan_key]);
    }

    $selecciones = $item->get_meta('_step_form_selections', true);
    if (is_string($selecciones)) $selecciones = json_decode($selecciones, true); // asignador viejo de wp-admin
    if (is_array($selecciones) && $selecciones && class_exists('RocoMadrid_SF_Ajax')) {
        // format_selections_for_display() etiqueta "Age" tanto age_addon/age_addon_2days (del
        // alta original) como pa_edad (el que de verdad mantenemos al día aquí) — si quedan los
        // dos, "Age: ..." sale dos veces (cowork, 07/11 10:05). pa_edad manda.
        $para_mostrar = $selecciones;
        unset($para_mostrar['age_addon'], $para_mostrar['age_addon_2days']);
        $item->update_meta_data('_step_form_display', RocoMadrid_SF_Ajax::format_selections_for_display($para_mostrar));
    }
}

function blokes_gestion_log_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_gestion_log';
}

function blokes_ensure_gestion_log_table() {
    global $wpdb;
    $table = blokes_gestion_log_table();
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table) return;
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        sub_id      bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        accion      varchar(40)         NOT NULL,
        antes       text                NULL,
        despues     text                NULL,
        detalle     text                NULL,
        user_id     bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        user_login  varchar(100)        NOT NULL DEFAULT '',
        created_at  datetime            NOT NULL,
        PRIMARY KEY (id),
        KEY sub_id (sub_id)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
}

function blokes_gestion_log($sub_id, $accion, $antes, $despues, $detalle = array()) {
    global $wpdb;
    blokes_ensure_gestion_log_table();
    $user = wp_get_current_user();
    $wpdb->insert(blokes_gestion_log_table(), array(
        'sub_id'     => intval($sub_id),
        'accion'     => $accion,
        'antes'      => is_array($antes)   ? wp_json_encode($antes)   : (string) $antes,
        'despues'    => is_array($despues) ? wp_json_encode($despues) : (string) $despues,
        'detalle'    => wp_json_encode($detalle),
        'user_id'    => $user ? $user->ID : 0,
        'user_login' => $user ? $user->user_login : '',
        'created_at' => current_time('mysql'),
    ));
}

// Desactiva TODOS los emails mientras se ejecuta $cb (acciones manuales de Eva/Ramiro desde
// ExcelMuerte: por defecto no avisan a nadie, salvo que se pida lo contrario).
// `woocommerce_email_enabled_{id}` no basta: WooCommerce Subscriptions dispara sus correos de
// renovación desde sus propios hooks de transición de estado, sin pasar por ese filtro siempre.
// `pre_wp_mail` corta de raíz CUALQUIER wp_mail() mientras dure la acción (wp_mail() devuelve
// directamente lo que diga este filtro sin intentar enviar nada) — no depende de qué plugin
// dispare el email ni de cómo registre su id.
function blokes_gestion_sin_emails($cb) {
    add_filter('pre_wp_mail', '__return_true', 9999);
    try {
        return $cb();
    } finally {
        remove_filter('pre_wp_mail', '__return_true', 9999);
    }
}

function blokes_gestion_metodo_label($metodo) {
    $map = array(
        'transferencia' => 'Transferencia', 'efectivo' => 'Efectivo',
        'tarjeta' => 'Tarjeta (TPV roco)', 'wellhub' => 'Wellhub', 'bizum' => 'Bizum',
    );
    return $map[$metodo] ?? ucfirst($metodo);
}

// Cambia el precio de la ÚNICA línea de producto de un pedido o de una suscripción (ambos son
// WC_Abstract_Order) y recalcula impuestos/totales — mismo patrón que ya usa
// superadmin_gestion_cambiar_grupo() para la suscripción. Solo cuando hay exactamente 1 línea:
// con más de una no se adivina cuál ajustar (NOTAS_PARA_CODE_pestanas_grupos.md, Ramiro 06/11
// 16:00 — "excepción de precio" en Marcar cobrado).
function blokes_gestion_ajustar_precio_linea($pedido_o_sub, $importe_nuevo) {
    $items = $pedido_o_sub->get_items();
    if (count($items) !== 1) return false;
    $item = reset($items);
    $item->set_subtotal($importe_nuevo);
    $item->set_total($importe_nuevo);
    $item->save();
    $pedido_o_sub->calculate_taxes();
    $pedido_o_sub->calculate_totals(false);
    return true;
}

function blokes_cobros_manuales_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_cobros_manuales';
}

// Efectivo (29/10, decisión de Ramiro): sin WooCommerce y sin factura — solo queda apuntado
// aquí para que "Grupos" y ExcelMuerte lo cuenten como cobrado. Transferencia, tarjeta (TPV
// roco) y Wellhub sí van por WooCommerce y generan factura (Verifactu/AEAT), igual que un cobro
// con tarjeta en la web.
function blokes_ensure_cobros_manuales_table() {
    global $wpdb;
    $table = blokes_cobros_manuales_table();
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table) return;
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        sub_id      bigint(20) UNSIGNED NOT NULL,
        periodo     varchar(7)          NOT NULL,
        importe     decimal(10,2)       NOT NULL,
        metodo      varchar(30)         NOT NULL DEFAULT 'efectivo',
        fecha       date                NOT NULL,
        nota        varchar(255)        NOT NULL DEFAULT '',
        parcial     tinyint(1)          NOT NULL DEFAULT 0,
        user_id     bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        user_login  varchar(100)        NOT NULL DEFAULT '',
        created_at  datetime            NOT NULL,
        PRIMARY KEY (id),
        KEY sub_id (sub_id),
        KEY periodo (periodo)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
}

// El cobro manual (efectivo) más reciente de cada sub_id+mes, para fusionarlo con los pagos de
// WooCommerce en "Grupos"/ExcelMuerte sin tener que tocar esas consultas una por una.
function blokes_cobros_manuales_todos() {
    global $wpdb;
    blokes_ensure_cobros_manuales_table();
    $rows = $wpdb->get_results("SELECT * FROM " . blokes_cobros_manuales_table() . " ORDER BY id DESC", ARRAY_A);
    $out = array();
    foreach ($rows as $r) {
        $key = $r['sub_id'] . '|' . $r['periodo'];
        if (!isset($out[$key])) $out[$key] = $r; // ya viene del más reciente al más antiguo
    }
    return $out;
}

// "Pagado por adelantado" (Ramiro, 1/11 18:55): pago por transferencia/bizum/tarjeta/wellhub
// apuntado ANTES de que WooCommerce Subscriptions genere la renovación del día 3 — no se crea
// el pedido a mano (podría duplicarse cuando WCS genere el suyo), se guarda aquí y se aplica
// solo cuando ese pedido exista de verdad.
function blokes_adelantados_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_adelantados';
}

function blokes_ensure_adelantados_table() {
    global $wpdb;
    $table = blokes_adelantados_table();
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table) return;
    $charset = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        id               bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        sub_id           bigint(20) UNSIGNED NOT NULL,
        periodo          varchar(7)          NOT NULL,
        importe          decimal(10,2)       NOT NULL,
        metodo           varchar(30)         NOT NULL,
        fecha_banco      date                NOT NULL,
        nota             varchar(255)        NOT NULL DEFAULT '',
        user_id          bigint(20) UNSIGNED NOT NULL DEFAULT 0,
        user_login       varchar(100)        NOT NULL DEFAULT '',
        created_at       datetime            NOT NULL,
        aplicado_at      datetime            NULL,
        aplicado_order_id bigint(20) UNSIGNED NULL,
        revisar          tinyint(1)          NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        KEY sub_id (sub_id),
        KEY periodo (periodo)
    ) {$charset};";
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta($sql);
}

// El adelantado más antiguo sin aplicar y sin marcar "a revisar" de una suscripción — es el
// que debería cubrir la próxima renovación real que genere WooCommerce Subscriptions.
function blokes_adelantado_pendiente($sub_id) {
    global $wpdb;
    blokes_ensure_adelantados_table();
    return $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . blokes_adelantados_table() . "
         WHERE sub_id = %d AND aplicado_at IS NULL AND revisar = 0
         ORDER BY periodo ASC, id ASC LIMIT 1", $sub_id
    ), ARRAY_A);
}

// Se dispara cuando WooCommerce Subscriptions genera de verdad la renovación (normalmente el
// día 3, el cron de WCS) — si hay un adelantado esperando a esta suscripción y el importe
// coincide con el del pedido, lo completa solo (mismo criterio que marcar-cobrado a mano, sin
// emails) y lo marca aplicado. Si no coincide, lo deja para revisión manual en vez de adivinar.
// OJO: `wcs_renewal_order_created` es un FILTRO (apply_filters), no una acción — hay que
// devolver siempre $order, o cualquier otro filtro encadenado (y la propia creación del pedido
// para TODAS las suscripciones del club) se quedaría con null.
function blokes_aplicar_adelantado_si_hay($order, $subscription) {
    $sub_id = $subscription->get_id();
    $adelantado = blokes_adelantado_pendiente($sub_id);
    if (!$adelantado) return $order;

    global $wpdb;
    $coincide = abs(floatval($adelantado['importe']) - floatval($order->get_total())) < 0.01;
    if (!$coincide) {
        $wpdb->update(blokes_adelantados_table(), array('revisar' => 1), array('id' => intval($adelantado['id'])), array('%d'), array('%d'));
        blokes_gestion_log($sub_id, 'adelantado_no_coincide', array('importePedido' => $order->get_total()), $adelantado);
        return $order;
    }

    $metodo_label = blokes_gestion_metodo_label($adelantado['metodo']);
    $fecha_ts = strtotime($adelantado['fecha_banco'] . ' 12:00:00');
    blokes_gestion_sin_emails(function() use ($order, $metodo_label, $adelantado, $fecha_ts) {
        $order->set_payment_method_title($metodo_label);
        $nota_txt = sprintf(
            'ExcelMuerte: cobrado por adelantado %s € (%s) el %s, aplicado automáticamente al generarse esta renovación.%s',
            number_format(floatval($adelantado['importe']), 2, ',', '.'), $metodo_label,
            date_i18n('d/m/Y', $fecha_ts), $adelantado['nota'] ? ' ' . $adelantado['nota'] : ''
        );
        $order->add_order_note($nota_txt);
        $order->save();
        update_post_meta($order->get_id(), '_rm_importe_cobrado', floatval($adelantado['importe']));
        update_post_meta($order->get_id(), '_rm_metodo_cobro', $adelantado['metodo']);
        $order->payment_complete();
        $order->update_status('completed', 'ExcelMuerte: pedido completado automáticamente (pago por adelantado).');
        $order->set_date_paid($fecha_ts);
        $order->save();
    });

    $wpdb->update(blokes_adelantados_table(), array(
        'aplicado_at' => current_time('mysql'), 'aplicado_order_id' => $order->get_id(),
    ), array('id' => intval($adelantado['id'])), array('%s', '%d'), array('%d'));
    blokes_gestion_log($sub_id, 'adelantado_aplicado', null, array('orderId' => $order->get_id(), 'periodo' => $adelantado['periodo']));
    return $order;
}
add_filter('wcs_renewal_order_created', 'blokes_aplicar_adelantado_si_hay', 10, 2);

// Pedidos sin pagar (pending/failed/on-hold) de la suscripción: se listan siempre, y si
// $simular es false se cancelan de verdad (cancelar un pedido sin pagar no genera factura ni
// email). Se usa al dar de baja, fusionar o reactivar por efectivo, para que el pedido viejo no
// se quede "pendiente de pago" colgando y contando como impago en ningún sitio.
function blokes_cancelar_pedidos_impagados($sub, $simular) {
    $order_ids = array_filter(array_merge(array($sub->get_parent_id()), $sub->get_related_orders('ids', 'renewal')));
    $pedidos = array();
    foreach ($order_ids as $oid) {
        $o = wc_get_order($oid);
        if (!$o || !in_array($o->get_status(), array('pending', 'failed', 'on-hold'), true)) continue;
        $pedidos[] = array('id' => $oid, 'importe' => floatval($o->get_total()));
        if (!$simular) $o->update_status('cancelled', 'ExcelMuerte: pedido sin pagar cancelado al gestionar la suscripción.');
    }
    return $pedidos;
}

// ─── Sección 8.4: alumnos que pagan fuera de la web ("externos") ─────────────────────────
// No tienen suscripción de WooCommerce — pagan en mano/transferencia fuera de la tienda y Eva
// los llevaba solo en el Excel. Viven en dos tablas propias, nunca tocan WooCommerce ni Woo
// Subscriptions, y se fusionan dentro de "Grupos" como una fila más (campo `esExterno`).

function blokes_externos_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_externos';
}
function blokes_externos_pagos_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_externos_pagos';
}

function blokes_ensure_externos_tables() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE " . blokes_externos_table() . " (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        dia         varchar(60)         NOT NULL DEFAULT '',
        horario     varchar(60)         NOT NULL DEFAULT '',
        edad        varchar(60)         NOT NULL DEFAULT 'Adultos',
        nombre      varchar(190)        NOT NULL DEFAULT '',
        telefono    varchar(30)         NOT NULL DEFAULT '',
        exento      tinyint(1)          NOT NULL DEFAULT 0,
        notas       varchar(500)        NOT NULL DEFAULT '',
        tutor_nombre   varchar(190)     NOT NULL DEFAULT '',
        tutor_telefono varchar(30)      NOT NULL DEFAULT '',
        activo      tinyint(1)          NOT NULL DEFAULT 1,
        user_login  varchar(100)        NOT NULL DEFAULT '',
        created_at  datetime            NOT NULL,
        updated_at  datetime            NOT NULL,
        PRIMARY KEY (id)
    ) {$charset};");
    dbDelta("CREATE TABLE " . blokes_externos_pagos_table() . " (
        id           bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        externo_id   bigint(20) UNSIGNED NOT NULL,
        periodo      varchar(7)          NOT NULL,
        importe      decimal(10,2)       NOT NULL,
        metodo       varchar(30)         NOT NULL DEFAULT '',
        fecha        date                NOT NULL,
        cubre_meses  tinyint(2) UNSIGNED NOT NULL DEFAULT 1,
        PRIMARY KEY (id),
        UNIQUE KEY externo_periodo (externo_id, periodo)
    ) {$charset};");
}

function blokes_externos_normaliza_telefono($t) {
    $d = preg_replace('/\D/', '', (string) $t);
    return strlen($d) === 9 ? $d : (strlen($d) > 9 ? substr($d, -9) : $d);
}

// Para comparar nombres: quita paréntesis con lo que traigan dentro ("(16 años)", "(amiga de
// Marta)"), tildes y "*" (lo usan para marcar casos en el Excel), sin puntuación, en minúsculas
// y con los espacios repetidos colapsados.
function blokes_externos_normaliza_nombre($n) {
    $n = remove_accents((string) $n);
    $n = preg_replace('/\([^)]*\)/', ' ', $n);
    $n = str_replace('*', ' ', $n);
    $n = preg_replace('/[^a-zA-Z\s]/', ' ', $n);
    return mb_strtolower(trim(preg_replace('/\s+/', ' ', $n)));
}

// ¿Se parecen dos nombres ya normalizados? Igual con que coincidan nombre + un apellido (aunque
// falte un nombre compuesto o el segundo apellido), o con que el parecido global sea alto —
// para cuando hay una errata o el orden de nombre/apellidos está cambiado.
function blokes_externos_nombres_parecidos($a, $b) {
    if ($a === '' || $b === '') return false;
    if ($a === $b) return true;
    $pa = array_values(array_filter(explode(' ', $a)));
    $pb = array_values(array_filter(explode(' ', $b)));
    if (empty($pa) || empty($pb)) return false;
    if (count(array_intersect($pa, $pb)) >= min(2, count($pa), count($pb))) return true;
    similar_text($a, $b, $pct);
    return $pct >= 80;
}

// El usuario de la cuenta ("adrianmendoza") no lleva espacios: comparar contra el nombre completo
// pegado, o contra nombre de pila + primer apellido pegados, para los casos donde el nombre de
// facturación no coincide pero el usuario sí es, literalmente, la misma persona.
function blokes_externos_nombre_coincide_usuario($nombre_norm, $usuario_n) {
    if ($nombre_norm === '' || $usuario_n === '') return false;
    $tokens = array_values(array_filter(explode(' ', $nombre_norm)));
    if (empty($tokens)) return false;
    if ($usuario_n === implode('', $tokens)) return true;
    return count($tokens) >= 2 && $usuario_n === ($tokens[0] . $tokens[1]);
}

// ¿Hay constancia de pago ese periodo? Vale el importe, o que el método apunte a "web" o "bizum"
// sin importe (se apunta así cuando el Excel solo tiene el método, sin cantidad rellena).
function blokes_externos_tiene_pago($pagos, $periodo) {
    $p = is_array($pagos) ? ($pagos[$periodo] ?? null) : null;
    if (!is_array($p)) return false;
    if (floatval($p['importe'] ?? 0) > 0) return true;
    return in_array(mb_strtolower(trim((string) ($p['metodo'] ?? ''))), array('web', 'bizum'), true);
}

// ¿El Excel dice que esta fila paga por la web (suscripción de WooCommerce) en algún periodo? Si
// es así pero no se ha podido confirmar ninguna suscripción suya, no se puede dar por "nuevo"
// limpio: por definición alguien que paga por la web ya tiene una suscripción en alguna parte.
function blokes_externos_paga_por_web($pagos, $periodo_sep, $periodo_oct) {
    foreach (array($periodo_sep, $periodo_oct) as $periodo) {
        $p = is_array($pagos) ? ($pagos[$periodo] ?? null) : null;
        if (is_array($p) && mb_strtolower(trim((string) ($p['metodo'] ?? ''))) === 'web') return true;
    }
    return false;
}

// Todos los externos activos, con sus pagos anidados por periodo (YYYY-MM). Un pago con
// `cubre_meses` > 1 (trimestral/anual, "cubre hasta" al marcar cobrado) añade también los meses
// siguientes como "cubierto por" ese pago, igual que las suscripciones trimestrales/anuales de
// la web (Ramiro, 31/10 17:11).
function blokes_externos_todos() {
    blokes_ensure_externos_tables();
    global $wpdb;
    $filas = $wpdb->get_results("SELECT * FROM " . blokes_externos_table() . " WHERE activo = 1", ARRAY_A);
    $pagos_rows = $wpdb->get_results("SELECT * FROM " . blokes_externos_pagos_table() . " ORDER BY periodo ASC", ARRAY_A);
    $pagos_por_externo = array();
    foreach ($pagos_rows as $p) {
        $periodo = $p['periodo'];
        $pagos_por_externo[$p['externo_id']][$periodo] = array(
            'importe' => floatval($p['importe']), 'metodo' => $p['metodo'], 'fecha' => date('d/m/Y', strtotime($p['fecha'])),
        );
        $cubre = max(1, intval($p['cubre_meses'] ?? 1));
        if ($cubre > 1) {
            $dt = DateTime::createFromFormat('Y-m-d', $periodo . '-01');
            for ($k = 1; $k < $cubre; $k++) {
                $ym_cubierto = (clone $dt)->modify("+{$k} months")->format('Y-m');
                if (isset($pagos_por_externo[$p['externo_id']][$ym_cubierto])) continue; // ya tiene su propio pago
                $pagos_por_externo[$p['externo_id']][$ym_cubierto] = array(
                    'cubierto' => true, 'cubiertoPor' => $periodo,
                    'importe' => floatval($p['importe']), 'metodo' => $p['metodo'], 'fecha' => date('d/m/Y', strtotime($p['fecha'])),
                    'tipo' => $cubre === 3 ? 'TRI' : ($cubre === 12 ? 'ANUAL' : null),
                );
            }
        }
    }
    foreach ($filas as &$f) {
        $f['pagos'] = $pagos_por_externo[$f['id']] ?? array();
    }
    return $filas;
}

// ¿Esta persona ya tiene una suscripción en vigor en la web? Señales, de más a menos fiable:
// nombre exacto (ignorando tildes/"*", y comparando también con el usuario de la cuenta, no solo
// con el nombre de facturación) — eso solo ya confirma: una persona = un nombre. Si no, teléfono
// que coincide (por el campo de teléfono, o porque está metido en el email de la cuenta) más
// nombre que se parece (aunque no sea exacto) — confirma. Si no, teléfono y grupo (día, horario y
// edad) iguales — también confirma, salvo que en esta misma pestaña del Excel haya más de un
// alumno con ese mismo teléfono: ahí no se puede saber a cuál de los hermanos corresponde esa
// suscripción, así que no se confirma sola. En cualquier otro caso en que solo coincida el
// teléfono, se devuelve "posible_familiar" para revisar a mano: nunca se descarta la fila ni se
// confirma sola.
function blokes_externos_buscar_en_web($telefono, $nombre, $dia = '', $horario = '', $edad = '', $hay_hermanos_mismo_telefono = false) {
    $tel         = blokes_externos_normaliza_telefono($telefono);
    $nombre_norm = blokes_externos_normaliza_nombre($nombre);
    $dia_f       = blokes_normalizar_dia($dia);
    $horario_f   = blokes_normalizar_horario($horario);
    $edad_f      = blokes_normalizar_edad($edad) ?: 'Adultos';
    $all         = blokes_get_all_subscription_data();
    $familiar    = null;
    // Yoga y Pilates son actividades propias, no un grupo de escalada: alguien con una
    // suscripción de escalada puede, aparte, ir a yoga por su cuenta (apuntado en el Excel,
    // sin suscripción propia de yoga) — no por eso "ya está en la web" para yoga. Sin esto, su
    // suscripción de escalada confirmaba por nombre/teléfono sin mirar la actividad.
    $actividad_exclusiva = in_array($dia_f, array('Yoga', 'Pilates'), true) ? $dia_f : null;

    foreach ($all as $s) {
        if (!in_array($s['status'] ?? '', array('active', 'on-hold', 'pending'), true)) continue;
        if ($actividad_exclusiva && ($s['producto'] ?? '') !== $actividad_exclusiva) continue;
        $sub_obj = wcs_get_subscription(intval($s['id']));
        if (!$sub_obj) continue;

        $nombre_web   = trim($sub_obj->get_billing_first_name() . ' ' . $sub_obj->get_billing_last_name()) ?: ($s['cliente'] ?? '');
        $nombre_web_n = blokes_externos_normaliza_nombre($nombre_web);
        $user         = $sub_obj->get_user();
        $usuario_n    = $user ? blokes_externos_normaliza_nombre($user->user_login) : '';

        $usuario_coincide = blokes_externos_nombre_coincide_usuario($nombre_norm, $usuario_n);
        if ($nombre_norm !== '' && ($nombre_norm === $nombre_web_n || $usuario_coincide)) {
            return array('subId' => intval($s['id']), 'tipo' => 'confirmado');
        }
        $nombre_parecido = $nombre_norm !== '' && (
            blokes_externos_nombres_parecidos($nombre_norm, $nombre_web_n)
            || ($usuario_n !== '' && blokes_externos_nombres_parecidos($nombre_norm, $usuario_n))
        );

        $tel_web        = blokes_externos_normaliza_telefono($sub_obj->get_billing_phone() ?: ($s['telefono'] ?? ''));
        $tel_en_email   = blokes_externos_normaliza_telefono($sub_obj->get_billing_email() ?: ($s['email'] ?? ''));
        $telefono_coincide = $tel !== '' && (($tel_web !== '' && $tel === $tel_web) || ($tel_en_email !== '' && $tel === $tel_en_email));

        // Teléfono + nombre que se parece: confirma, aunque ninguno de los dos sea exacto por sí
        // solo. Teléfono + mismo grupo (sin nombre): confirma también, salvo hermanos ambiguos.
        if ($telefono_coincide && $nombre_parecido) {
            return array('subId' => intval($s['id']), 'tipo' => 'confirmado');
        }
        if ($telefono_coincide && !$hay_hermanos_mismo_telefono && $s['dia'] === $dia_f && $s['horario'] === $horario_f && ($s['edad'] ?: 'Adultos') === $edad_f) {
            return array('subId' => intval($s['id']), 'tipo' => 'confirmado');
        }
        // Ni lo anterior ni nada exacto, pero hay algo (teléfono que coincide sin que cuadre el
        // resto, o nombre que se parece aunque el teléfono no coincida o falte en una de las dos
        // partes): no es para fiarse solo, pero tampoco para ignorarlo.
        if (($telefono_coincide || $nombre_parecido) && !$familiar) {
            $familiar = array('subId' => intval($s['id']), 'tipo' => 'posible_familiar');
        }
    }
    return $familiar;
}

function superadmin_gestion_externos_get() {
    return rest_ensure_response(array('success' => true, 'data' => blokes_externos_todos()));
}

function blokes_externos_limpia($body, $defaults = array()) {
    return array(
        'dia'      => sanitize_text_field((string) ($body['dia'] ?? $defaults['dia'] ?? '')),
        'horario'  => sanitize_text_field((string) ($body['horario'] ?? $defaults['horario'] ?? '')),
        'edad'     => sanitize_text_field((string) ($body['edad'] ?? $defaults['edad'] ?? 'Adultos')) ?: 'Adultos',
        'nombre'   => mb_substr(sanitize_text_field((string) ($body['nombre'] ?? '')), 0, 190),
        'telefono' => blokes_externos_normaliza_telefono($body['telefono'] ?? ''),
        'exento'   => !empty($body['exento']) ? 1 : 0,
        'notas'    => mb_substr(sanitize_text_field((string) ($body['notas'] ?? '')), 0, 500),
        'tutor_nombre'   => mb_substr(sanitize_text_field((string) ($body['tutorNombre'] ?? $defaults['tutor_nombre'] ?? '')), 0, 190),
        'tutor_telefono' => blokes_externos_normaliza_telefono($body['tutorTelefono'] ?? $defaults['tutor_telefono'] ?? ''),
    );
}

// Alta de un alumno externo suelto (lo usa Eva en el día a día, aparte de la migración).
function superadmin_gestion_externos_crear($request) {
    blokes_ensure_externos_tables();
    global $wpdb;
    // get_json_params() solo ve un BODY json real (lo que manda el frontend) — una llamada
    // interna construida con WP_REST_Request + set_param() (como el alta automática de Sync
    // Grupos) no lo rellena y siempre llegaba vacía aquí, así que "Falta el nombre" saltaba
    // SIEMPRE y la autocreación fallaba en silencio (cowork, 4/11 04:30: un alta nueva nunca se
    // creaba sola a pesar del alias de pestaña ya resuelto). Con get_params() como respaldo
    // seguimos leyendo el JSON real del frontend cuando lo hay, y el resto de parámetros
    // (incluidos los puestos con set_param()) cuando no.
    $body = $request->get_json_params();
    if (!$body) $body = $request->get_params();
    $f = blokes_externos_limpia($body);
    if ($f['nombre'] === '') return new WP_Error('bad_request', 'Falta el nombre.', array('status' => 400));
    if (!$f['dia'] && !$f['horario']) return new WP_Error('bad_request', 'Falta el grupo (día/horario).', array('status' => 400));
    $u = wp_get_current_user();
    $wpdb->insert(blokes_externos_table(), array_merge($f, array(
        'activo' => 1, 'user_login' => $u->user_login, 'created_at' => current_time('mysql'), 'updated_at' => current_time('mysql'),
    )));
    $id = $wpdb->insert_id;
    blokes_gestion_log($id, 'externo_crear', null, $f, 'Alta externa (fuera de WooCommerce)');
    return rest_ensure_response(array('success' => true, 'data' => array('id' => $id)));
}

function superadmin_gestion_externos_actualizar($request) {
    blokes_ensure_externos_tables();
    global $wpdb;
    $id = intval($request['id']);
    $antes = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . blokes_externos_table() . ' WHERE id = %d', $id), ARRAY_A);
    if (!$antes) return new WP_Error('not_found', 'Externo no encontrado.', array('status' => 404));
    $body = $request->get_json_params();
    $f = blokes_externos_limpia($body, $antes);
    if ($f['nombre'] === '') return new WP_Error('bad_request', 'Falta el nombre.', array('status' => 400));
    $wpdb->update(blokes_externos_table(), array_merge($f, array('updated_at' => current_time('mysql'))), array('id' => $id));
    blokes_gestion_log($id, 'externo_actualizar', $antes, $f);
    return rest_ensure_response(array('success' => true));
}

function superadmin_gestion_externos_borrar($request) {
    blokes_ensure_externos_tables();
    global $wpdb;
    $id = intval($request['id']);
    $wpdb->update(blokes_externos_table(), array('activo' => 0, 'updated_at' => current_time('mysql')), array('id' => $id));
    blokes_gestion_log($id, 'externo_borrar', null, null);
    return rest_ensure_response(array('success' => true));
}

// Apunta (o corrige) el pago de un mes concreto. Igual que el cobro manual de las
// suscripciones, pero en su propia tabla — nunca toca WooCommerce.
function superadmin_gestion_externos_pago($request) {
    blokes_ensure_externos_tables();
    global $wpdb;
    $id = intval($request['id']);
    // Mismo bug que en superadmin_gestion_externos_crear: get_json_params() se queda vacío para
    // una llamada interna construida con set_param() (el auto-aplicar de Sync Grupos a un
    // externo) — con get_params() de respaldo seguimos leyendo el JSON real del frontend cuando
    // lo hay (4/11, mismo hallazgo que el de la autocreación de alumno nuevo).
    $body = $request->get_json_params();
    if (!$body) $body = $request->get_params();
    $periodo = (string) ($body['periodo'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}$/', $periodo)) return new WP_Error('bad_request', 'Periodo no válido (YYYY-MM).', array('status' => 400));
    $importe = floatval($body['importe'] ?? 0);
    $metodo_raw = sanitize_text_field((string) ($body['metodo'] ?? ''));
    $metodo  = blokes_gestion_metodo_label($metodo_raw);
    $fecha   = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($body['fecha'] ?? '')) ? $body['fecha'] : current_time('Y-m-d');
    // "Cubre hasta" (trimestral/anual): cuántos meses cubre este pago, empezando por $periodo.
    $cubre_meses = intval($body['cubreMeses'] ?? 1);
    if (!in_array($cubre_meses, array(1, 3, 12), true)) $cubre_meses = 1;
    $wpdb->query($wpdb->prepare(
        "INSERT INTO " . blokes_externos_pagos_table() . " (externo_id, periodo, importe, metodo, fecha, cubre_meses) VALUES (%d, %s, %f, %s, %s, %d)
         ON DUPLICATE KEY UPDATE importe = %f, metodo = %s, fecha = %s, cubre_meses = %d",
        $id, $periodo, $importe, $metodo, $fecha, $cubre_meses, $importe, $metodo, $fecha, $cubre_meses
    ));
    blokes_gestion_log($id, 'externo_pago', null, array('periodo' => $periodo, 'importe' => $importe, 'metodo' => $metodo, 'cubreMeses' => $cubre_meses));
    // Web → Excel (NOTAS_PARA_CODE_sync_grupos.md): igual que con un cobro de suscripción.
    $ext = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . blokes_externos_table() . " WHERE id = %d", $id), ARRAY_A);
    if ($ext) {
        blokes_sync_grupos_escribir_cobro($ext['dia'], $ext['horario'], $ext['telefono'], $ext['nombre'], $periodo, $importe, $metodo_raw, date_i18n('d/m/Y', strtotime($fecha)));
    }
    return rest_ensure_response(array('success' => true));
}

// ─── Lista de espera (grupos_como_excel.md, punto 7) ──────────────────────────────────────
// Gente interesada en un grupo que aún no es alumno (sin suscripción ni fila de externo). Vive
// en su propia tabla, independiente de "en espera" de una suscripción on-hold.

function blokes_lista_espera_table() {
    global $wpdb;
    return $wpdb->prefix . 'blokes_lista_espera';
}

function blokes_ensure_lista_espera_table() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE " . blokes_lista_espera_table() . " (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        dia         varchar(60)         NOT NULL DEFAULT '',
        horario     varchar(60)         NOT NULL DEFAULT '',
        edad        varchar(60)         NOT NULL DEFAULT 'Adultos',
        nombre      varchar(190)        NOT NULL DEFAULT '',
        telefono    varchar(30)         NOT NULL DEFAULT '',
        notas       varchar(500)        NOT NULL DEFAULT '',
        atendido    tinyint(1)          NOT NULL DEFAULT 0,
        user_login  varchar(100)        NOT NULL DEFAULT '',
        created_at  datetime            NOT NULL,
        updated_at  datetime            NOT NULL,
        PRIMARY KEY (id)
    ) {$charset};");
}

function superadmin_gestion_lista_espera_get() {
    blokes_ensure_lista_espera_table();
    global $wpdb;
    $filas = $wpdb->get_results("SELECT * FROM " . blokes_lista_espera_table() . " ORDER BY atendido ASC, created_at ASC", ARRAY_A);
    return rest_ensure_response(array('success' => true, 'data' => $filas));
}

function blokes_lista_espera_limpia($body, $defaults = array()) {
    return array(
        'dia'      => sanitize_text_field((string) ($body['dia'] ?? $defaults['dia'] ?? '')),
        'horario'  => sanitize_text_field((string) ($body['horario'] ?? $defaults['horario'] ?? '')),
        'edad'     => sanitize_text_field((string) ($body['edad'] ?? $defaults['edad'] ?? 'Adultos')) ?: 'Adultos',
        'nombre'   => mb_substr(sanitize_text_field((string) ($body['nombre'] ?? '')), 0, 190),
        'telefono' => blokes_externos_normaliza_telefono($body['telefono'] ?? ''),
        'notas'    => mb_substr(sanitize_text_field((string) ($body['notas'] ?? '')), 0, 500),
    );
}

function superadmin_gestion_lista_espera_crear($request) {
    blokes_ensure_lista_espera_table();
    global $wpdb;
    $body = $request->get_json_params();
    $f = blokes_lista_espera_limpia($body);
    if ($f['nombre'] === '') return new WP_Error('bad_request', 'Falta el nombre.', array('status' => 400));
    $u = wp_get_current_user();
    $wpdb->insert(blokes_lista_espera_table(), array_merge($f, array(
        'atendido' => 0, 'user_login' => $u->user_login, 'created_at' => current_time('mysql'), 'updated_at' => current_time('mysql'),
    )));
    $id = $wpdb->insert_id;
    blokes_gestion_log($id, 'lista_espera_crear', null, $f, 'Alta en lista de espera');
    return rest_ensure_response(array('success' => true, 'data' => array('id' => $id)));
}

function superadmin_gestion_lista_espera_actualizar($request) {
    blokes_ensure_lista_espera_table();
    global $wpdb;
    $id = intval($request['id']);
    $antes = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . blokes_lista_espera_table() . ' WHERE id = %d', $id), ARRAY_A);
    if (!$antes) return new WP_Error('not_found', 'No encontrado en la lista de espera.', array('status' => 404));
    $body = $request->get_json_params();
    $f = blokes_lista_espera_limpia($body, $antes);
    if ($f['nombre'] === '') return new WP_Error('bad_request', 'Falta el nombre.', array('status' => 400));
    $f['atendido'] = isset($body['atendido']) ? (!empty($body['atendido']) ? 1 : 0) : intval($antes['atendido']);
    $wpdb->update(blokes_lista_espera_table(), array_merge($f, array('updated_at' => current_time('mysql'))), array('id' => $id));
    blokes_gestion_log($id, 'lista_espera_actualizar', $antes, $f);
    return rest_ensure_response(array('success' => true));
}

function superadmin_gestion_lista_espera_borrar($request) {
    blokes_ensure_lista_espera_table();
    global $wpdb;
    $id = intval($request['id']);
    $wpdb->delete(blokes_lista_espera_table(), array('id' => $id));
    blokes_gestion_log($id, 'lista_espera_borrar', null, null);
    return rest_ensure_response(array('success' => true));
}

// ─── Sincronización Grupos ⇄ Google Sheets (NOTAS_PARA_CODE_sync_grupos.md) ───────────────
// Cuenta de servicio de Google Cloud, sin Composer (este plugin es un único fichero PHP, sin
// vendor/): se firma el JWT a mano con openssl_sign y se cambia por un access_token en el
// endpoint de OAuth de Google. El ID de cada Hoja (prueba y real) se guarda en wp_options, no
// en el código — el repo es público — y se configura con /gestion/sync-grupos/config.
// IMPORTANTE: mientras esto se desarrolla, el endpoint de prueba SOLO lee la Hoja de prueba.
// La Hoja real (la que usa Eva) no se toca hasta que cowork confirme las pruebas y Ramiro dé
// el OK — ver NOTAS_PARA_CODE_sync_grupos.md.

function blokes_sync_grupos_credenciales() {
    $json = null;
    if (defined('BLOKES_SYNC_GROUPS_SA_JSON') && BLOKES_SYNC_GROUPS_SA_JSON) {
        $json = BLOKES_SYNC_GROUPS_SA_JSON;
    } elseif (defined('BLOKES_SYNC_GROUPS_SA_PATH') && BLOKES_SYNC_GROUPS_SA_PATH && file_exists(BLOKES_SYNC_GROUPS_SA_PATH)) {
        $json = file_get_contents(BLOKES_SYNC_GROUPS_SA_PATH);
    }
    if (!$json) return null;
    $data = json_decode($json, true);
    if (!is_array($data) || empty($data['private_key']) || empty($data['client_email'])) return null;
    return $data;
}

function blokes_sync_grupos_base64url($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// Access token de corta duración (1h) para llamar a la Sheets API, cacheado en un transient
// para no firmar un JWT nuevo en cada petición.
function blokes_sync_grupos_access_token() {
    $cached = get_transient('blokes_sync_grupos_token');
    if ($cached) return $cached;

    $cred = blokes_sync_grupos_credenciales();
    if (!$cred) {
        return new WP_Error('sin_credenciales', 'Falta la clave de la cuenta de servicio: define BLOKES_SYNC_GROUPS_SA_JSON (el JSON entero) o BLOKES_SYNC_GROUPS_SA_PATH (ruta al fichero) en wp-config.php.');
    }
    $now = time();
    $header = blokes_sync_grupos_base64url(wp_json_encode(array('alg' => 'RS256', 'typ' => 'JWT')));
    $claims = blokes_sync_grupos_base64url(wp_json_encode(array(
        'iss'   => $cred['client_email'],
        'scope' => 'https://www.googleapis.com/auth/spreadsheets',
        'aud'   => 'https://oauth2.googleapis.com/token',
        'exp'   => $now + 3600,
        'iat'   => $now,
    )));
    $unsigned = $header . '.' . $claims;
    $signature = '';
    if (!openssl_sign($unsigned, $signature, $cred['private_key'], 'sha256WithRSAEncryption')) {
        return new WP_Error('firma_fallida', 'No se pudo firmar el JWT con la clave privada de la cuenta de servicio.');
    }
    $jwt = $unsigned . '.' . blokes_sync_grupos_base64url($signature);

    $res = wp_remote_post('https://oauth2.googleapis.com/token', array(
        'timeout' => 15,
        'body'    => array('grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt),
    ));
    if (is_wp_error($res)) return $res;
    $body = json_decode(wp_remote_retrieve_body($res), true);
    if (empty($body['access_token'])) {
        return new WP_Error('sin_token', 'Google no devolvió access_token. Respuesta: ' . wp_remote_retrieve_body($res));
    }
    set_transient('blokes_sync_grupos_token', $body['access_token'], max(60, intval($body['expires_in'] ?? 3600) - 60));
    return $body['access_token'];
}

// Llamada GET genérica a la Sheets API v4 (solo lectura). $path es relativo a
// https://sheets.googleapis.com/v4/spreadsheets/{sheetId}...
function blokes_sync_grupos_get($sheet_id, $path) {
    $token = blokes_sync_grupos_access_token();
    if (is_wp_error($token)) return $token;
    $url = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode($sheet_id) . $path;
    $res = wp_remote_get($url, array('timeout' => 20, 'headers' => array('Authorization' => 'Bearer ' . $token)));
    if (is_wp_error($res)) return $res;
    $code = wp_remote_retrieve_response_code($res);
    $body = json_decode(wp_remote_retrieve_body($res), true);
    if ($code >= 300) {
        return new WP_Error('sheets_api_error', 'Google Sheets API devolvió ' . $code . ': ' . ($body['error']['message'] ?? wp_remote_retrieve_body($res)));
    }
    return $body;
}

// Llamada de escritura a la Sheets API v4 (values:batchUpdate) — el token ya tiene permiso de
// escritura (scope "spreadsheets" completo, no "readonly"). USER_ENTERED para que Google
// interprete números/fechas como si Eva los hubiera tecleado a mano, no como texto literal.
function blokes_sync_grupos_escribir_valores($sheet_id, $data) {
    $token = blokes_sync_grupos_access_token();
    if (is_wp_error($token)) return $token;
    $url = 'https://sheets.googleapis.com/v4/spreadsheets/' . rawurlencode($sheet_id) . '/values:batchUpdate';
    $res = wp_remote_request($url, array(
        'method' => 'POST', 'timeout' => 20,
        'headers' => array('Authorization' => 'Bearer ' . $token, 'Content-Type' => 'application/json'),
        'body' => wp_json_encode(array('valueInputOption' => 'USER_ENTERED', 'data' => $data)),
    ));
    if (is_wp_error($res)) return $res;
    $code = wp_remote_retrieve_response_code($res);
    $body = json_decode(wp_remote_retrieve_body($res), true);
    if ($code >= 300) {
        return new WP_Error('sheets_api_error', 'Google Sheets API devolvió ' . $code . ': ' . ($body['error']['message'] ?? wp_remote_retrieve_body($res)));
    }
    return $body;
}

function blokes_sync_grupos_col_letra($idx0) {
    $n = $idx0 + 1; $letra = '';
    while ($n > 0) {
        $rem = ($n - 1) % 26;
        $letra = chr(65 + $rem) . $letra;
        $n = intdiv($n - 1, 26);
    }
    return $letra;
}

// Encuentra el nombre REAL de la pestaña que corresponde a un grupo de la web (día+horario),
// comparando normalizado (sin tildes/mayúsculas/separadores — los nombres de pestaña no son
// idénticos al xlsx original: "V 9:00" en la web es "V 900" en la Hoja, espacios de más, etc.,
// cowork 1/11). Si hay más de una coincidencia o ninguna, no se escribe nada — mejor no escribir
// que escribir en la pestaña equivocada del documento de Eva.
function blokes_sync_grupos_normalizar_nombre($s) {
    $s = remove_accents((string) $s);
    $s = mb_strtolower(trim($s));
    $s = str_replace(array(':', '.', ','), '', $s);
    $s = preg_replace('/\s+/', ' ', $s);
    return trim($s);
}
// Pestañas reales de Eva van abreviadas ("L-X 19.00", "M-J 20.30"), no con el nombre completo
// del día que usa Grupos ("Lunes-Miércoles") — cowork, 3/11 12:29 (prueba real: llegaba
// "Miércoles" suelto, ni siquiera la pareja completa, y tampoco habría bastado por la abreviatura).
function blokes_sync_grupos_dia_abrev($dia) {
    $map = array('Lunes-Miércoles' => 'L-X', 'Martes-Jueves' => 'M-J', 'Viernes' => 'V', 'Sábado' => 'S');
    return $map[$dia] ?? $dia;
}
function blokes_sync_grupos_pestana_de_grupo($pestanas_reales, $dia, $horario) {
    // Varias formas de nombrar el mismo grupo: completa ("Lunes-Miércoles 19:00-20:30") y
    // abreviada como en el Excel ("L-X 19.00") — la primera que dé una única coincidencia gana;
    // nunca se mezclan candidatas de las dos formas a la vez (evita un falso "ambiguo" si una
    // forma encaja con una pestaña y la otra con otra distinta por casualidad).
    $formas = array_unique(array_filter(array($dia . ' ' . $horario, blokes_sync_grupos_dia_abrev($dia) . ' ' . $horario)));
    foreach ($formas as $forma) {
        $buscado = blokes_sync_grupos_normalizar_nombre($forma);
        if ($buscado === '') continue;
        $candidatas = array();
        foreach ($pestanas_reales as $p) {
            $pn = blokes_sync_grupos_normalizar_nombre($p);
            if ($pn === $buscado || strpos($pn, $buscado) === 0 || strpos($buscado, $pn) === 0) $candidatas[] = $p;
        }
        if (count($candidatas) === 1) return $candidatas[0];
    }
    return null;
}

// Método tal y como lo escribe Eva en el Excel, a partir del método de WooCommerce — mapeo
// razonable a falta de confirmar con ella el formato exacto que usa.
function blokes_sync_grupos_metodo_a_excel($metodo) {
    $map = array('transferencia' => 'TR', 'efectivo' => 'EF', 'tarjeta' => 'TA', 'bizum' => 'Bizum', 'wellhub' => 'Wellhub', 'web' => 'WEB');
    return $map[$metodo] ?? ucfirst($metodo);
}

// Web → Excel, sección 1 de NOTAS_PARA_CODE_sync_grupos.md: escribe el cobro (importe, método,
// fecha) en la celda del mes de la fila de esta persona en la Hoja activa (prueba o real, según
// el interruptor). Nunca bloquea ni falla la acción principal que la llama (Marcar
// cobrado/externo ya se ha hecho en WooCommerce antes de llegar aquí) — si no encuentra la
// pestaña o el bloque del mes todavía no existe en la Hoja (mes nuevo sin columnas creadas),
// simplemente no escribe nada y lo deja registrado en el log de gestión para revisar a mano. Si
// no encuentra la FILA (persona nueva que todavía no está en el Excel de Eva), en vez de
// perderlo deja un pendiente «Web→Excel sin fila» en Cambios del Excel (Ramiro, 6/11 16:04).
// Nunca reescribe un mes que ya tiene algo apuntado (`$ym` con pago ya puesto): sin duplicados,
// aunque esta función se llame más de una vez para el mismo cobro — $subId (opcional) solo sirve
// para poder reintentar luego desde el pendiente, no cambia nada de la lógica de escritura.
// Devuelve true si ya quedó escrito (o ya estaba, nada que hacer), false si se quedó pendiente.
function blokes_sync_grupos_escribir_cobro($dia, $horario, $telefono, $nombre, $ym, $importe, $metodo, $fecha, $sub_id = null) {
    try {
        $activa = blokes_sync_grupos_sheet_activa();
        if (!$activa['id']) return false;
        $meta = blokes_sync_grupos_get($activa['id'], '?fields=sheets.properties.title');
        if (is_wp_error($meta)) { blokes_gestion_log(0, 'sync_grupos_escribir_error', null, array('paso' => 'listar pestañas', 'error' => $meta->get_error_message())); return false; }
        $pestanas = array_values(array_filter(array_map(function($s) { return $s['properties']['title'] ?? ''; }, $meta['sheets'] ?? array())));
        $pestana = blokes_sync_grupos_pestana_de_grupo($pestanas, $dia, $horario);
        if (!$pestana) { blokes_gestion_log(0, 'sync_grupos_pestana_no_encontrada', null, array('dia' => $dia, 'horario' => $horario, 'hoja' => $activa['cual'])); return false; }

        $valores = blokes_sync_grupos_leer_valores($activa['id'], $pestana);
        if (is_wp_error($valores)) { blokes_gestion_log(0, 'sync_grupos_escribir_error', null, array('paso' => 'leer pestaña', 'pestana' => $pestana, 'error' => $valores->get_error_message())); return false; }
        $r = blokes_sync_grupos_leer_pestana_filas($valores);

        $tel_norm = blokes_externos_normaliza_telefono((string) $telefono);
        $fila_encontrada = null;
        if ($tel_norm) {
            foreach ($r['filas'] as $f) { if ($f['telefono'] === $tel_norm) { $fila_encontrada = $f; break; } }
        }
        if (!$fila_encontrada && $nombre) {
            $nombre_norm = mb_strtolower(trim((string) $nombre));
            foreach ($r['filas'] as $f) { if (mb_strtolower(trim($f['nombre'])) === $nombre_norm) { $fila_encontrada = $f; break; } }
        }
        if (!$fila_encontrada) {
            blokes_gestion_log(0, 'sync_grupos_fila_no_encontrada', null, array('pestana' => $pestana, 'telefono' => $tel_norm, 'nombre' => $nombre));
            blokes_sync_grupos_pendiente_sin_fila($pestana, $nombre, $telefono, $ym, $importe, $metodo, $fecha, $dia, $horario, $sub_id);
            return false;
        }

        // Sin duplicados: si ese mes ya tiene algo apuntado, no se reescribe (Ramiro, 6/11
        // 16:04) — tanto si ya lo puso esta misma función antes como si lo apuntó Eva a mano.
        if (!empty($fila_encontrada['pagos'][$ym])) {
            blokes_gestion_log(0, 'sync_grupos_cobro_ya_apuntado', null, array('pestana' => $pestana, 'mes' => $ym, 'nombre' => $nombre));
            return true;
        }

        $bloque = null;
        foreach ($r['bloquesLayout'] as $b) { if ($b['ym'] === $ym) { $bloque = $b; break; } }
        if (!$bloque) { blokes_gestion_log(0, 'sync_grupos_mes_no_encontrado', null, array('pestana' => $pestana, 'mes' => $ym)); return false; }

        $fila_sheet = intval($fila_encontrada['_row']) + 1; // A1 es 1-based
        $metodo_excel = blokes_sync_grupos_metodo_a_excel($metodo);
        $prefijo = blokes_sync_grupos_a1_pestana($pestana) . '!';
        $data = array();
        if ($bloque['layout']['kind'] === 'cantidad') {
            $data[] = array('range' => $prefijo . blokes_sync_grupos_col_letra($bloque['layout']['importe']) . $fila_sheet, 'values' => array(array($importe)));
            $data[] = array('range' => $prefijo . blokes_sync_grupos_col_letra($bloque['layout']['metodo']) . $fila_sheet, 'values' => array(array($metodo_excel)));
            $data[] = array('range' => $prefijo . blokes_sync_grupos_col_letra($bloque['layout']['fecha']) . $fila_sheet, 'values' => array(array($fecha)));
        } else {
            $col = ($metodo === 'efectivo') ? $bloque['layout']['efectivo'] : $bloque['layout']['transf'];
            $data[] = array('range' => $prefijo . blokes_sync_grupos_col_letra($col) . $fila_sheet, 'values' => array(array($importe)));
            $data[] = array('range' => $prefijo . blokes_sync_grupos_col_letra($bloque['layout']['fecha']) . $fila_sheet, 'values' => array(array($fecha)));
        }
        $res = blokes_sync_grupos_escribir_valores($activa['id'], $data);
        if (is_wp_error($res)) { blokes_gestion_log(0, 'sync_grupos_escribir_error', null, array('paso' => 'escribir', 'pestana' => $pestana, 'error' => $res->get_error_message())); return false; }
        blokes_gestion_log(0, 'sync_grupos_cobro_escrito', null, array('pestana' => $pestana, 'fila' => $fila_sheet, 'mes' => $ym, 'hoja' => $activa['cual']));
        return true;
    } catch (\Throwable $e) {
        blokes_gestion_log(0, 'sync_grupos_escribir_excepcion', null, array('error' => $e->getMessage()));
        return false;
    }
}

// Pendiente «Web→Excel sin fila» (Ramiro, 6/11 16:04, punto 3): se cobró de verdad en la web
// pero esta persona todavía no tiene fila en el Excel de Eva — en vez de perder el dato, se deja
// en Cambios del Excel con todo lo necesario para que, en cuanto Eva añada la fila, "Aplicar"
// reintente la misma escritura sin que nadie tenga que volver a teclear nada.
function blokes_sync_grupos_pendiente_sin_fila($pestana, $nombre, $telefono, $ym, $importe, $metodo, $fecha, $dia, $horario, $sub_id) {
    blokes_sync_grupos_ensure_tables();
    $clave = blokes_sync_grupos_clave($nombre, $telefono);
    blokes_sync_grupos_upsert_cambio($pestana, $clave, $nombre, $telefono, 'web_sin_fila', $ym, array(
        'importe' => $importe, 'metodo' => $metodo, 'fecha' => $fecha, 'dia' => $dia, 'horario' => $horario, 'subId' => $sub_id,
    ), null);
}

// Punto 2 de NOTAS_PARA_CODE_pestanas_grupos.md (Ramiro, 6/11 16:04 — "hazlo ya lo de mejor
// aún"): TODO cobro de la web va solo al Excel, sin que nadie pulse nada — no solo "Marcar
// cobrado". A qué mes pertenece, mismo criterio que Grupos (date_created, no date_paid, por los
// adelantados). El propio blokes_sync_grupos_escribir_cobro ya evita duplicados (no reescribe un
// mes que ya tiene algo apuntado), así que no pasa nada si este gancho se dispara más de una vez
// para el mismo pedido.
function blokes_sync_grupos_auto_escribir_cobro($sub, $order) {
    if (!$sub || !$order) return;
    $dh = blokes_sync_grupos_dia_horario_de_sub($sub->get_id());
    if (!$dh['dia'] || !$dh['horario']) return; // no es una clase/pilates/yoga del club: nada que apuntar
    $fecha_mes = $order->get_date_created() ?: $order->get_date_paid();
    if (!$fecha_mes) return;
    $importe = floatval($order->get_total());
    if ($importe <= 0) return;
    $fecha_pago = $order->get_date_paid() ?: $fecha_mes;
    blokes_sync_grupos_escribir_cobro(
        $dh['dia'], $dh['horario'], $sub->get_billing_phone(),
        trim($sub->get_billing_first_name() . ' ' . $sub->get_billing_last_name()),
        $fecha_mes->date('Y-m'), $importe, 'tarjeta', $fecha_pago->date('d/m/Y'), $sub->get_id()
    );
}
// Renovación que se cobra sola con tarjeta (Redsys) — WCS dispara esto al confirmar el pago de
// una renovación, con el pedido de esa renovación como segundo argumento.
add_action('woocommerce_subscription_renewal_payment_complete', function($subscription, $last_order = null) {
    if (!$last_order) {
        // Respaldo si el hook no trae el pedido (versión antigua de WCS): el de renovación más
        // reciente, mismo patrón que ya usa el resto de este fichero (get_related_orders).
        $ids = $subscription->get_related_orders('ids', 'renewal');
        $last_order = $ids ? wc_get_order(max($ids)) : null;
    }
    blokes_sync_grupos_auto_escribir_cobro($subscription, $last_order);
}, 20, 2);
// Alta nueva (el pedido inicial que crea la suscripción) cobrada con tarjeta — las renovaciones
// ya las cubre el gancho de arriba; este solo mira pedidos "parent" para no procesar el mismo
// pedido dos veces.
add_action('woocommerce_payment_complete', function($order_id) {
    if (!function_exists('wcs_get_subscriptions_for_order')) return;
    $order = wc_get_order($order_id);
    if (!$order) return;
    foreach (wcs_get_subscriptions_for_order($order, array('order_type' => 'parent')) as $sub) {
        blokes_sync_grupos_auto_escribir_cobro($sub, $order);
    }
}, 20);

// Localiza día/horario de una suscripción (para saber qué pestaña del Excel le toca) a partir
// de blokes_get_all_subscription_data(), que ya los trae calculados de la variación del producto.
function blokes_sync_grupos_dia_horario_de_sub($sub_id) {
    foreach (blokes_get_all_subscription_data() as $s) {
        // El día de la suscripción es un día suelto ("Miércoles"), pero el grupo (y la pestaña
        // de Eva) es la pareja completa ("Lunes-Miércoles") — mismo criterio que Grupos (cowork,
        // 3/11 12:29: le llegaba el día suelto y la escritura nunca encontraba su pestaña).
        if (intval($s['id'] ?? 0) === intval($sub_id)) return array('dia' => blokes_dia_a_pareja($s['dia'] ?? ''), 'horario' => $s['horario'] ?? '');
    }
    return array('dia' => '', 'horario' => '');
}

// POST /gestion/sync-grupos/reintentar-cobro — reescribir a mano UN cobro concreto en el Excel
// (NOTAS_PARA_CODE_sync_grupos.md, 3/11 12:29): para pagos que fallaron al escribir antes del
// arreglo de la pestaña, o que nunca pasaron por este camino (ya estaban completados en
// WooCommerce antes de que existiera esta escritura automática). Nunca toca WooCommerce — solo
// repite blokes_sync_grupos_escribir_cobro con teléfono/nombre de la suscripción.
function superadmin_sync_grupos_reintentar_cobro($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $sub_id  = intval($request->get_param('subId'));
    $ym      = sanitize_text_field((string) $request->get_param('ym'));
    $importe = floatval($request->get_param('importe'));
    $metodo  = sanitize_text_field((string) $request->get_param('metodo'));
    $fecha   = sanitize_text_field((string) $request->get_param('fecha'));
    if (!$sub_id || !preg_match('/^\d{4}-\d{2}$/', $ym) || $importe <= 0 || !$metodo || !$fecha) {
        return new WP_Error('invalid_data', 'Faltan datos o están mal formados (subId, ym AAAA-MM, importe, metodo, fecha dd/mm/aaaa).', array('status' => 400));
    }
    $sub = wcs_get_subscription($sub_id);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));
    $dh = blokes_sync_grupos_dia_horario_de_sub($sub_id);
    blokes_sync_grupos_escribir_cobro(
        $dh['dia'], $dh['horario'], $sub->get_billing_phone(),
        trim($sub->get_billing_first_name() . ' ' . $sub->get_billing_last_name()),
        $ym, $importe, $metodo, $fecha
    );
    blokes_gestion_log(0, 'sync_grupos_reintentar_cobro', null, array('subId' => $sub_id, 'ym' => $ym, 'importe' => $importe, 'metodo' => $metodo, 'fecha' => $fecha));
    return rest_ensure_response(array('success' => true));
}

function superadmin_sync_grupos_config_get() {
    return rest_ensure_response(array('success' => true, 'data' => array(
        'sheetPruebaId' => get_option('blokes_sync_grupos_sheet_prueba_id', ''),
        'sheetRealId'   => get_option('blokes_sync_grupos_sheet_real_id', ''),
        'usarReal'      => (bool) get_option('blokes_sync_grupos_usar_real', false),
        'credencialesConfiguradas' => (bool) blokes_sync_grupos_credenciales(),
        'ultimaSincronizacion' => get_option('blokes_sync_grupos_ultima_sincronizacion', null),
    )));
}

// Devuelve el ID de la Hoja que hay que leer según el interruptor `usarReal` — hasta ahora
// `test`/`resumen`/`pestana` ignoraban el interruptor y siempre leían la de PRUEBA (cowork,
// 1/11 19:00: puse usarReal=true y siguieron leyendo la de prueba). También dice cuál usó,
// para que la respuesta deje claro contra qué Hoja se ha leído.
// Activa la Hoja real de una vez (Ramiro, 3/11): ya está probado el paso 2 (Excel→Web) contra
// la copia y confirmado que la cuenta de servicio tiene acceso a la real — a partir de ahora se
// lee y se escribe en la Hoja de verdad, no en la copia de prueba. Si quieres volver a la copia,
// usa POST /gestion/sync-grupos/config con usarReal:false.
function blokes_sync_grupos_activar_real_ramiro_1() {
    if (get_option('blokes_sync_grupos_activado_real_ramiro_1')) return;
    if (get_option('blokes_sync_grupos_sheet_real_id', '')) {
        update_option('blokes_sync_grupos_usar_real', true, false);
    }
    update_option('blokes_sync_grupos_activado_real_ramiro_1', 1, false);
}

function blokes_sync_grupos_sheet_activa() {
    blokes_sync_grupos_activar_real_ramiro_1();
    $usar_real = (bool) get_option('blokes_sync_grupos_usar_real', false);
    $id = $usar_real
        ? get_option('blokes_sync_grupos_sheet_real_id', '')
        : get_option('blokes_sync_grupos_sheet_prueba_id', '');
    return array('id' => $id, 'cual' => $usar_real ? 'real' : 'prueba');
}

function superadmin_sync_grupos_config_set($request) {
    $body = $request->get_json_params();
    if (isset($body['sheetPruebaId'])) update_option('blokes_sync_grupos_sheet_prueba_id', sanitize_text_field((string) $body['sheetPruebaId']), false);
    if (isset($body['sheetRealId']))   update_option('blokes_sync_grupos_sheet_real_id',   sanitize_text_field((string) $body['sheetRealId']),   false);
    if (isset($body['usarReal']))      update_option('blokes_sync_grupos_usar_real', !empty($body['usarReal']), false);
    blokes_gestion_log(0, 'sync_grupos_config', null, $body);
    return rest_ensure_response(array('success' => true));
}

// Prueba de conexión: lee solo los nombres de las pestañas de la Hoja de PRUEBA (nunca la
// real, mientras esto se desarrolla) — para confirmar que las credenciales y la firma del JWT
// funcionan antes de construir nada que lea o escriba filas de verdad.
function superadmin_sync_grupos_test() {
    $activa = blokes_sync_grupos_sheet_activa();
    if (!$activa['id']) {
        return new WP_Error('falta_config', 'Falta configurar el ID de la Hoja de ' . ($activa['cual'] === 'real' ? 'REAL' : 'PRUEBA') . ' (POST /gestion/sync-grupos/config).', array('status' => 400));
    }
    $data = blokes_sync_grupos_get($activa['id'], '?fields=properties.title,sheets.properties.title');
    if (is_wp_error($data)) {
        return new WP_Error($data->get_error_code(), $data->get_error_message(), array('status' => 502));
    }
    $pestanas = array_map(function($s) { return $s['properties']['title'] ?? '?'; }, $data['sheets'] ?? array());
    return rest_ensure_response(array('success' => true, 'data' => array(
        'hoja' => $data['properties']['title'] ?? '?', 'pestanas' => $pestanas, 'total' => count($pestanas), 'hojaUsada' => $activa['cual'],
    )));
}

// ─── Lectura de filas (solo lectura, Hoja de PRUEBA) ──────────────────────────────────────
// Generaliza la lógica de datos_privados/importar_externos/_parse.py (que solo sabía leer el
// par fijo septiembre→octubre) a CUALQUIER mes: detecta todas las cabeceras de mes de la fila
// 2 y, para cada una, su layout en la fila 3 ("Cantidad" → importe/método/fecha, o
// "Asistencia" de 4 columnas → asistencia/efectivo/transferencia/fecha). No asigna año a cada
// mes todavía (eso es para cuando se escriba de verdad) — este paso solo cuenta filas/pagos
// para comparar con los 262 de `_parse.py`.

// Nombre de pestaña entre comillas simples para usarlo en notación A1, escapando comillas
// simples que pudiera llevar el propio nombre (p. ej. ninguna de las reales las lleva, pero
// por si acaso).
function blokes_sync_grupos_a1_pestana($tab) {
    return "'" . str_replace("'", "''", $tab) . "'";
}

// Lee una pestaña entera como matriz de filas (0-indexada: $valores[0] es la fila 1 de
// Excel). UNFORMATTED_VALUE + FORMATTED_STRING para que los números lleguen como número de
// PHP y las fechas como texto legible, igual que openpyxl distingue int/float de datetime.
function blokes_sync_grupos_leer_valores($sheet_id, $tab) {
    $rango = blokes_sync_grupos_a1_pestana($tab) . '!A1:ZZ1000';
    $path  = '/values/' . rawurlencode($rango) . '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';
    $data  = blokes_sync_grupos_get($sheet_id, $path);
    if (is_wp_error($data)) return $data;
    return $data['values'] ?? array();
}

// Lo mismo que blokes_sync_grupos_leer_valores pero para varias pestañas en una sola llamada
// (values:batchGet) — leer las ~37 pestañas una a una sería lento y, en hosting compartido,
// podría agotar el tiempo máximo de ejecución de PHP.
function blokes_sync_grupos_leer_valores_lote($sheet_id, $tabs) {
    $query = array();
    foreach ($tabs as $tab) {
        $query[] = 'ranges=' . rawurlencode(blokes_sync_grupos_a1_pestana($tab) . '!A1:ZZ1000');
    }
    $query[] = 'valueRenderOption=UNFORMATTED_VALUE';
    $query[] = 'dateTimeRenderOption=FORMATTED_STRING';
    $data = blokes_sync_grupos_get($sheet_id, '/values:batchGet?' . implode('&', $query));
    if (is_wp_error($data)) return $data;
    $out = array();
    foreach (($data['valueRanges'] ?? array()) as $i => $vr) {
        $out[$tabs[$i]] = $vr['values'] ?? array();
    }
    return $out;
}

function blokes_sync_grupos_es_numero($v) {
    return is_int($v) || is_float($v);
}

// Año de la temporada en curso AHORA (el curso de clases empieza en septiembre y acaba en
// agosto del año siguiente).
function blokes_sync_grupos_anio_actual_temporada() {
    $anio = intval(current_time('Y'));
    $mes  = intval(current_time('n'));
    return $mes >= 9 ? $anio : $anio - 1;
}

// Cabeceras de mes reconocidas en la fila 2 (índice 1): [{col, mes, anio, ym}], col 0-indexada.
// Cada pestaña tiene VARIAS temporadas seguidas en columnas (septiembre→agosto de 2023-24,
// luego de 2024-25, de 2025-26...) y el nombre del mes se repite — sin año no se puede saber
// cuál es el bloque de verdad. Las cabeceras con texto de más («ENERO 60€») se normalizan a su
// primera palabra.
//
// Ancla cada bloque por su posición, NO por la celda C2 (cowork comprobó el 1/11 09:10 que C2
// falta en algunas pestañas, o está mal, y el año sale disparatado o desplazado): el ÚLTIMO
// SEPTIEMBRE de la fila es SIEMPRE la temporada que está en curso ahora mismo, y cada SEPTIEMBRE
// anterior, yendo hacia la izquierda, es un año menos — da igual cuántas temporadas tenga la
// pestaña o si falta el año en C2. Dentro de un bloque, ENERO..AGOSTO caen en el año siguiente al
// de su SEPTIEMBRE (el curso que empieza en septiembre de un año acaba en agosto del siguiente).
function blokes_sync_grupos_meses_cabecera($valores) {
    $meses = array(
        'ENERO' => 1, 'FEBRERO' => 2, 'MARZO' => 3, 'ABRIL' => 4, 'MAYO' => 5, 'JUNIO' => 6,
        'JULIO' => 7, 'AGOSTO' => 8, 'SEPTIEMBRE' => 9, 'OCTUBRE' => 10, 'NOVIEMBRE' => 11, 'DICIEMBRE' => 12,
    );
    $fila2 = $valores[1] ?? array();
    $detectadas = array();
    foreach ($fila2 as $idx => $v) {
        if (!is_string($v) || trim($v) === '') continue;
        $primera_palabra = mb_strtoupper(trim(preg_split('/\s+/', trim($v))[0]));
        if (!isset($meses[$primera_palabra])) continue;
        $detectadas[] = array('col' => $idx, 'mes' => $primera_palabra);
    }
    if (!$detectadas) return array();

    $indices_septiembre = array();
    foreach ($detectadas as $i => $d) if ($d['mes'] === 'SEPTIEMBRE') $indices_septiembre[] = $i;

    $anio_por_indice = array(); // índice en $detectadas de cada SEPTIEMBRE => año de ese bloque
    if ($indices_septiembre) {
        $anio_actual = blokes_sync_grupos_anio_actual_temporada();
        $n = count($indices_septiembre);
        foreach ($indices_septiembre as $pos => $i) $anio_por_indice[$i] = $anio_actual - ($n - 1 - $pos);
    }

    // Columnas antes del primer SEPTIEMBRE detectado (si las hay): son la cola de un bloque
    // anterior que no tiene su propio SEPTIEMBRE en la hoja — se les asigna el año del primer
    // bloque encontrado (que es lo mismo que les tocaría si ese bloque anterior existiera).
    $anio_bloque = $indices_septiembre ? $anio_por_indice[$indices_septiembre[0]] : blokes_sync_grupos_anio_actual_temporada();

    $out = array();
    foreach ($detectadas as $i => $d) {
        if (isset($anio_por_indice[$i])) $anio_bloque = $anio_por_indice[$i];
        $anio = $meses[$d['mes']] <= 8 ? $anio_bloque + 1 : $anio_bloque;
        $out[] = array('col' => $d['col'], 'mes' => $d['mes'], 'anio' => $anio, 'ym' => sprintf('%04d-%02d', $anio, $meses[$d['mes']]));
    }
    return $out;
}

// Layout del bloque de un mes (fila 3, índice 2, bajo la columna del mes): "Cantidad"
// (importe/método/fecha) o "Asistencia" de 4 columnas (asistencia/efectivo/transf/fecha). Si
// no se reconoce la etiqueta, se asume "Cantidad" por defecto (como _parse.py).
function blokes_sync_grupos_layout_bloque($valores, $col, $width) {
    $fila3 = $valores[2] ?? array();
    $label = (isset($fila3[$col]) && is_string($fila3[$col])) ? mb_strtolower(trim($fila3[$col])) : '';
    if ($label === 'asistencia' && $width === 4) {
        return array('kind' => 'asistencia', 'asistencia' => $col, 'efectivo' => $col + 1, 'transf' => $col + 2, 'fecha' => $col + 3);
    }
    return array('kind' => 'cantidad', 'importe' => $col, 'metodo' => $col + 1, 'fecha' => $col + 2);
}

// Columna de teléfono / observaciones / email: varían de pestaña a pestaña, así que se
// detectan por posición (observaciones siempre justo antes del primer bloque de mes) y, para
// el teléfono, por si el dato de verdad son 9 cifras, muestreando las filas 4-8.
function blokes_sync_grupos_detectar_columnas($valores, $primer_mes_col) {
    $notas_col = $primer_mes_col - 1;
    $tel_col = null; $email_col = null;
    for ($c = 3; $c < $notas_col; $c++) {
        $es_email = false;
        for ($r = 3; $r <= 7; $r++) {
            $v = $valores[$r][$c] ?? null;
            if (is_string($v) && strpos($v, '@') !== false) { $email_col = $c; $es_email = true; break; }
        }
        if ($es_email) continue;
        for ($r = 3; $r <= 7; $r++) {
            $v = $valores[$r][$c] ?? null;
            if ($v === null || $v === '') continue;
            $d = preg_replace('/\D/', '', blokes_sync_grupos_es_numero($v) ? (string) intval($v) : (string) $v);
            if (strlen($d) === 9) { $tel_col = $c; break; }
        }
    }
    return array('tel' => $tel_col, 'notas' => $notas_col, 'email' => $email_col);
}

// Pago de un mes en una fila: [pago|null, exento_bool]. Mismas reglas que _parse.py: "*"
// marca exento, "web"/"bizum" sin importe numérico cuenta igual como pago con importe 0, y
// 0/vacío/texto no numérico es "sin pago ese mes".
function blokes_sync_grupos_leer_pago($valores, $row, $layout) {
    if ($layout['kind'] === 'cantidad') {
        $cant = $valores[$row][$layout['importe']] ?? null;
        $met  = $valores[$row][$layout['metodo']]  ?? null;
        $fec  = $valores[$row][$layout['fecha']]   ?? null;
    } else {
        $ef  = $valores[$row][$layout['efectivo']] ?? null;
        $tr  = $valores[$row][$layout['transf']]   ?? null;
        $fec = $valores[$row][$layout['fecha']]    ?? null;
        if (blokes_sync_grupos_es_numero($ef))      { $cant = $ef; $met = 'ef'; }
        elseif (blokes_sync_grupos_es_numero($tr))  { $cant = $tr; $met = 'tr'; }
        else { $cant = $ef ?: $tr; $met = is_string($ef) ? $ef : $tr; }
    }

    foreach (array($cant, $met, $fec) as $v) {
        if (is_string($v) && trim($v) === '*') return array(null, true);
    }

    $metodo_sin_importe = null;
    foreach (array($cant, $met) as $v) {
        if (is_string($v) && in_array(mb_strtolower(trim($v)), array('web', 'bizum'), true)) { $metodo_sin_importe = mb_strtolower(trim($v)); break; }
    }
    if ($metodo_sin_importe !== null && !blokes_sync_grupos_es_numero($cant)) {
        $pago = array('importe' => 0, 'metodo' => $metodo_sin_importe);
        if (is_string($fec) && $fec !== '') $pago['fecha'] = $fec;
        return array($pago, false);
    }

    if (!blokes_sync_grupos_es_numero($cant) || floatval($cant) == 0) return array(null, false);

    $metodo_raw = is_string($met) ? mb_strtolower(trim($met)) : '';
    $map = array('ta' => 'transferencia', 'tr' => 'transferencia', 'ana' => 'transferencia', 'ef' => 'efectivo', 'bizum' => 'bizum');
    $metodo = $map[$metodo_raw] ?? $metodo_raw;

    $pago = array('importe' => round(floatval($cant), 2), 'metodo' => $metodo);
    if (is_string($fec) && $fec !== '') $pago['fecha'] = $fec;
    return array($pago, false);
}

// Parsea una pestaña entera (ya leída con blokes_sync_grupos_leer_valores) en filas
// {nombre, telefono, notas, exento, pagos: {MES => pago}}. Pestañas sin ninguna cabecera de
// mes reconocida (Balance, Bonos de 10, pagos cuenta antigua...) devuelven bloques vacío: el
// llamador las descarta, no son pestañas de clase con el mismo formato.
function blokes_sync_grupos_leer_pestana_filas($valores) {
    $meses_cab = blokes_sync_grupos_meses_cabecera($valores);
    if (!$meses_cab) return array('filas' => array(), 'bloques' => array());

    $bloques = array();
    foreach ($meses_cab as $i => $mc) {
        $siguiente = $meses_cab[$i + 1]['col'] ?? null;
        $width = $siguiente !== null ? ($siguiente - $mc['col']) : 3;
        $bloques[] = array('ym' => $mc['ym'], 'layout' => blokes_sync_grupos_layout_bloque($valores, $mc['col'], $width));
    }

    $cols = blokes_sync_grupos_detectar_columnas($valores, $meses_cab[0]['col']);

    $total_row = null;
    $num_filas = count($valores);
    for ($r = 3; $r < min($num_filas, 1002); $r++) {
        foreach (array(1, 2) as $c) {
            $v = $valores[$r][$c] ?? null;
            if (is_string($v) && mb_strtoupper(trim($v)) === 'TOTAL') { $total_row = $r; break 2; }
        }
    }

    $filas = array();
    $r = 3; // fila 4 de Excel
    while (true) {
        if ($total_row !== null && $r >= $total_row) break;
        if ($r > 600) break;
        $nombre_cell = $valores[$r][2] ?? null;
        if ($nombre_cell === null || trim((string) $nombre_cell) === '') {
            if ($total_row === null && $filas) break; // sin fila TOTAL: para en el primer hueco tras ver nombres
            $r++;
            continue;
        }
        $nombre = trim((string) $nombre_cell);
        if (mb_strtoupper($nombre) === 'TOTAL') break;

        $tel = $cols['tel'] !== null ? blokes_externos_normaliza_telefono($valores[$r][$cols['tel']] ?? '') : '';
        $notas_cell = $valores[$r][$cols['notas']] ?? null;
        $notas = $notas_cell !== null ? trim((string) $notas_cell) : '';
        if ($cols['email'] !== null) {
            $email_cell = $valores[$r][$cols['email']] ?? null;
            if (is_string($email_cell) && trim($email_cell) !== '') {
                $notas = trim($notas . ' [email: ' . trim($email_cell) . ']');
            }
        }

        // "_row" (0-based en $valores, fila de verdad = _row+1 en A1) y los layouts de columna
        // (cols/bloques) se guardan también en la propia fila — hacen falta para escribir
        // Web→Excel (NOTAS_PARA_CODE_sync_grupos.md, sección 1) sin tener que volver a detectar
        // el layout de la pestaña cada vez que se escribe una celda.
        $fila = array(
            'nombre' => $nombre, 'telefono' => $tel, 'notas' => $notas, 'exento' => false, 'exentoMeses' => array(), 'pagos' => array(),
            '_row' => $r,
        );
        foreach ($bloques as $b) {
            list($pago, $exento) = blokes_sync_grupos_leer_pago($valores, $r, $b['layout']);
            if ($exento) { $fila['exento'] = true; $fila['exentoMeses'][] = $b['ym']; }
            if ($pago) $fila['pagos'][$b['ym']] = $pago; // 'YYYY-MM' real, no solo el nombre del mes (se repite cada temporada)
        }
        $filas[] = $fila;
        $r++;
    }

    return array(
        'filas' => $filas, 'bloques' => array_map(function($b) { return $b['ym']; }, $bloques),
        'bloquesLayout' => $bloques, 'cols' => $cols, 'totalRow' => $total_row,
    );
}

// Resumen de TODAS las pestañas de la Hoja de PRUEBA: filas, con pago y exentos por pestaña,
// y el total — para comparar con los 262 de _parse.py. Las pestañas sin bloques de mes
// reconocidos (Balance, Bonos de 10...) se omiten del resumen, igual que _parse.py las omitía
// por no encontrar el par septiembre→octubre.
function superadmin_sync_grupos_resumen($request) {
    $activa = blokes_sync_grupos_sheet_activa();
    $sheet_id = $activa['id'];
    if (!$sheet_id) {
        return new WP_Error('falta_config', 'Falta configurar el ID de la Hoja de ' . ($activa['cual'] === 'real' ? 'REAL' : 'PRUEBA') . ' (POST /gestion/sync-grupos/config).', array('status' => 400));
    }
    // Filtra "conPago"/"exentos" a un rango de meses (YYYY-MM, inclusive) — p. ej.
    // ?desde=2026-09&hasta=2026-10 para comparar exactamente con _parse.py. Sin filtro, cuenta
    // cualquier pago de cualquier temporada (para ver de un vistazo qué meses hay en la hoja).
    $desde = sanitize_text_field((string) $request->get_param('desde'));
    $hasta = sanitize_text_field((string) $request->get_param('hasta'));
    $en_rango = function($ym) use ($desde, $hasta) {
        if ($desde && $ym < $desde) return false;
        if ($hasta && $ym > $hasta) return false;
        return true;
    };

    $meta = blokes_sync_grupos_get($sheet_id, '?fields=sheets.properties.title');
    if (is_wp_error($meta)) return new WP_Error($meta->get_error_code(), $meta->get_error_message(), array('status' => 502));
    $pestanas = array_values(array_filter(array_map(function($s) { return $s['properties']['title'] ?? ''; }, $meta['sheets'] ?? array())));
    if (!$pestanas) return new WP_Error('sin_pestanas', 'La hoja no tiene pestañas.', array('status' => 502));

    $valores_por_pestana = blokes_sync_grupos_leer_valores_lote($sheet_id, $pestanas);
    if (is_wp_error($valores_por_pestana)) return new WP_Error($valores_por_pestana->get_error_code(), $valores_por_pestana->get_error_message(), array('status' => 502));

    // Pestañas que no son un grupo de clase aunque tengan columnas con nombre de mes (cowork,
    // 1/11 09:10): "Balance" es un resumen de caja, no una lista de alumnado.
    $no_son_grupo = array('balance');

    $resumen = array(); $total_filas = 0; $total_con_pago = 0; $total_por_mes = array();
    foreach ($pestanas as $tab) {
        if (in_array(mb_strtolower(trim($tab)), $no_son_grupo, true)) continue;
        $r = blokes_sync_grupos_leer_pestana_filas($valores_por_pestana[$tab] ?? array());
        if (empty($r['bloques'])) continue;

        $meses_detectados = array_values(array_unique($r['bloques']));
        $meses_en_rango = array_values(array_filter($meses_detectados, $en_rango));
        // Sin ningún mes dentro del rango pedido: esta pestaña no aporta nada a la comparación
        // (otra temporada, un grupo que no dio clase esos meses) — fuera de los totales, para no
        // inflar `totalFilas` con gente que no pertenece al periodo que se está comprobando
        // (cowork, 1/11 09:10: 353 pestañas-filas contadas de más frente a los 262 esperados).
        if (($desde || $hasta) && !$meses_en_rango) continue;

        $con_pago = 0; $exentos = 0; $por_mes = array();
        foreach ($r['filas'] as $f) {
            $pago_en_rango = false;
            foreach ($f['pagos'] as $ym => $pago) {
                if (!$en_rango($ym)) continue;
                $pago_en_rango = true;
                $por_mes[$ym] = ($por_mes[$ym] ?? 0) + 1;
            }
            if ($pago_en_rango) $con_pago++;
            // Exento solo cuenta si lo es en algún mes DENTRO del rango pedido — antes contaba
            // si estaba exento en cualquier temporada, aunque fuera de hace años.
            foreach ($f['exentoMeses'] as $ym) {
                if ($en_rango($ym)) { $exentos++; break; }
            }
        }
        // Sin NINGÚN pago ni exento dentro del rango pedido: pestaña inactiva ese periodo (grupo
        // que ya no da clase, o que todavía no se ha puesto a cobrar) — fuera de los totales,
        // igual que una pestaña sin ningún mes en rango (cowork, 1/11 09:30: Pilates/Zumba
        // interés/Ent. Funcional/L-X 10.30/V 9:00/V 19.00/L-X-M-J 21.00/M-J 20.00 sin actividad
        // real en sep-oct 2026, aunque sí tengan esas columnas de mes).
        if (($desde || $hasta) && $con_pago === 0 && $exentos === 0) continue;
        $total_filas += count($r['filas']);
        $total_con_pago += $con_pago;
        foreach ($por_mes as $ym => $n) $total_por_mes[$ym] = ($total_por_mes[$ym] ?? 0) + $n;
        $resumen[] = array(
            'pestana' => $tab, 'filas' => count($r['filas']), 'conPago' => $con_pago, 'exentos' => $exentos,
            'conPagoPorMes' => $por_mes, 'mesesDetectados' => $meses_detectados,
        );
    }

    return rest_ensure_response(array('success' => true, 'data' => array(
        'totalFilas' => $total_filas, 'totalConPago' => $total_con_pago, 'totalConPagoPorMes' => $total_por_mes,
        'filtro' => array('desde' => $desde ?: null, 'hasta' => $hasta ?: null),
        'pestanas' => $resumen, 'hojaUsada' => $activa['cual'],
    )));
}

// Detalle de una sola pestaña (con nombre/teléfono/notas/pagos de cada fila) — para comparar
// a mano con el Excel cuando el resumen no cuadre en alguna pestaña concreta. Con `mes`
// (YYYY-MM) enseña solo los pagos de ese mes en vez de todas las temporadas encontradas.
function superadmin_sync_grupos_pestana($request) {
    $activa = blokes_sync_grupos_sheet_activa();
    $sheet_id = $activa['id'];
    if (!$sheet_id) {
        return new WP_Error('falta_config', 'Falta configurar el ID de la Hoja de ' . ($activa['cual'] === 'real' ? 'REAL' : 'PRUEBA') . ' (POST /gestion/sync-grupos/config).', array('status' => 400));
    }
    $tab = sanitize_text_field((string) $request->get_param('tab'));
    if ($tab === '') return new WP_Error('bad_request', 'Falta el parámetro tab (nombre exacto de la pestaña).', array('status' => 400));
    $mes = sanitize_text_field((string) $request->get_param('mes'));
    $valores = blokes_sync_grupos_leer_valores($sheet_id, $tab);
    if (is_wp_error($valores)) return new WP_Error($valores->get_error_code(), $valores->get_error_message(), array('status' => 502));
    $r = blokes_sync_grupos_leer_pestana_filas($valores);
    if ($mes !== '') {
        $r['filas'] = array_map(function($f) use ($mes) {
            $f['pagos'] = array_intersect_key($f['pagos'], array($mes => true));
            return $f;
        }, $r['filas']);
    }
    $r['hojaUsada'] = $activa['cual'];
    return rest_ensure_response(array('success' => true, 'data' => $r));
}

// ─── Excel → Web: bandeja de cambios (paso 2 de NOTAS_PARA_CODE_sync_grupos.md) ───────────
// Guarda una "instantánea" de cada fila del Excel (por pestaña) y, en cada sincronización,
// compara contra esa instantánea para quedarse solo con lo que cambió desde la última vez. La
// PRIMERA sincronización de cada pestaña es la "foto inicial": se guarda como base sin generar
// ningún cambio (si no, meter 200-300 filas de golpe en la bandeja el primer día). A partir de
// ahí, solo diferencias.
function blokes_sync_grupos_snapshot_table() { global $wpdb; return $wpdb->prefix . 'blokes_sync_grupos_snapshot'; }
function blokes_sync_grupos_cambios_table()  { global $wpdb; return $wpdb->prefix . 'blokes_sync_grupos_cambios'; }

function blokes_sync_grupos_ensure_tables() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $t1 = blokes_sync_grupos_snapshot_table();
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t1)) !== $t1) {
        dbDelta("CREATE TABLE {$t1} (
            id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            pestana     varchar(100)        NOT NULL,
            clave       varchar(191)        NOT NULL,
            nombre      varchar(190)        NOT NULL DEFAULT '',
            telefono    varchar(30)         NOT NULL DEFAULT '',
            notas       varchar(500)        NOT NULL DEFAULT '',
            exento      tinyint(1)          NOT NULL DEFAULT 0,
            pagos_json  longtext            NOT NULL,
            updated_at  datetime            NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY pestana_clave (pestana, clave),
            KEY pestana (pestana)
        ) {$charset};");
    }

    $t2 = blokes_sync_grupos_cambios_table();
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t2)) !== $t2) {
        dbDelta("CREATE TABLE {$t2} (
            id           bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            pestana      varchar(100)        NOT NULL,
            clave        varchar(191)        NOT NULL,
            nombre       varchar(190)        NOT NULL DEFAULT '',
            telefono     varchar(30)         NOT NULL DEFAULT '',
            tipo         varchar(30)         NOT NULL,
            mes          varchar(7)          NULL,
            datos_json   longtext            NOT NULL,
            match_tipo   varchar(20)         NULL,
            match_id     bigint(20) UNSIGNED NULL,
            match_label  varchar(190)        NOT NULL DEFAULT '',
            estado       varchar(20)         NOT NULL DEFAULT 'pendiente',
            creado_at    datetime            NOT NULL,
            resuelto_at  datetime            NULL,
            resuelto_por varchar(100)        NOT NULL DEFAULT '',
            PRIMARY KEY (id),
            KEY pestana (pestana),
            KEY estado (estado)
        ) {$charset};");
    }
}

// Clave estable para emparejar la misma persona entre sincronizaciones: nombre normalizado +
// teléfono normalizado. Si no hay teléfono, solo el nombre (puede chocar con un homónimo, pero
// solo afecta a qué fila de la bandeja se actualiza en vez de duplicarse, nunca escribe nada).
function blokes_sync_grupos_clave($nombre, $telefono) {
    $n = remove_accents(mb_strtolower(trim((string) $nombre)));
    $n = preg_replace('/\s+/', ' ', $n);
    $t = blokes_externos_normaliza_telefono((string) $telefono);
    return $n . '|' . $t;
}

// Encuentra con quién de la web emparejar un teléfono del Excel: primero una suscripción de
// WooCommerce en vigor, si no, un externo. No se fía del nombre para el emparejamiento en sí
// (demasiados homónimos/apodos), solo del teléfono — PERO cuando ese teléfono tiene más de una
// suscripción (familia/hermanos con el mismo número, cowork 06/11 15:55: el pago de un hermano
// se aplicaba a la suscripción del otro), el teléfono solo no basta para decidir CUÁL de ellas
// es. En ese caso sí se mira el nombre, solo para desambiguar entre los candidatos que YA
// comparten teléfono — nunca para encontrar un match nuevo. Si no hay una coincidencia clara de
// nombre (o coincide con más de uno, p. ej. dos hermanos con nombres parecidos o una
// suscripción duplicada de la misma persona), no se adivina: se queda sin match, a la bandeja.
function blokes_sync_grupos_emparejar($telefono, $nombre_fila, $subs_por_tel, $externos_por_tel) {
    $tel = blokes_externos_normaliza_telefono((string) $telefono);
    if ($tel === '') return null;
    $candidatos = $subs_por_tel[$tel] ?? array();
    if (count($candidatos) > 1) {
        // Antes de mirar el nombre, quedarse solo con los de mayor prioridad (en vigor > de baja
        // a fin de mes > cancelada) — si alguien tiene una suscripción activa y otra vieja
        // cancelada con el mismo teléfono, sigue ganando la activa sin hacer falta el nombre,
        // igual que antes. El nombre solo desempata cuando de verdad hay varias EN EL MISMO nivel
        // (dos hermanos, dos altas activas de la misma persona).
        $max_p = max(array_column($candidatos, '_prioridad'));
        $candidatos = array_values(array_filter($candidatos, function($s) use ($max_p) { return $s['_prioridad'] === $max_p; }));
    }
    if (count($candidatos) === 1) {
        $s = $candidatos[0];
        return array('tipo' => 'sub', 'id' => intval($s['id']), 'label' => ($s['_nombre_fact'] ?: ('Suscripción #' . $s['id'])));
    }
    if (count($candidatos) > 1) {
        // Desambiguar por el primer nombre (de pila) ya normalizado — los apellidos no sirven
        // aquí porque los hermanos casi siempre los comparten.
        $buscado = explode(' ', blokes_externos_normaliza_nombre((string) $nombre_fila));
        $buscado_primer = $buscado[0] ?? '';
        $coincide = array();
        foreach ($candidatos as $s) {
            $cand = explode(' ', blokes_externos_normaliza_nombre((string) ($s['_nombre_fact'] ?? '')));
            $cand_primer = $cand[0] ?? '';
            if ($buscado_primer !== '' && $cand_primer !== '' && $buscado_primer === $cand_primer) {
                $coincide[] = $s;
            }
        }
        if (count($coincide) === 1) {
            $s = $coincide[0];
            return array('tipo' => 'sub', 'id' => intval($s['id']), 'label' => ($s['_nombre_fact'] ?: ('Suscripción #' . $s['id'])));
        }
        return null;
    }
    if (isset($externos_por_tel[$tel])) {
        $e = $externos_por_tel[$tel];
        return array('tipo' => 'externo', 'id' => intval($e['id']), 'label' => $e['nombre'] ?? ('Externo #' . $e['id']));
    }
    return null;
}

// El método tal y como lo escribe Eva en el Excel ('ta'/'tr'/'ef'/'bizum'/'web'…) ya llega
// traducido a transferencia/efectivo/bizum/web por blokes_sync_grupos_leer_pago(); aquí solo
// falta encajarlo en los 5 métodos que acepta Marcar cobrado — "web" (pago con tarjeta en la
// web, sin Redsys automático detrás) se trata como tarjeta a mano, igual que un TPV.
function blokes_sync_grupos_metodo_a_cobrado($metodo) {
    $map = array('web' => 'tarjeta', 'transferencia' => 'transferencia', 'efectivo' => 'efectivo', 'bizum' => 'bizum', 'ana' => 'transferencia');
    return $map[$metodo] ?? 'transferencia';
}

// Reintenta el auto-aplicar sobre cambios "pendiente" que YA existían de antes (incluso de
// antes de tener esta lógica, o que no encajaron la primera vez porque entonces no había
// match): se vuelve a probar en CADA sincronización con los datos más frescos, no solo al
// crearse (cowork, 3/11 18:xx: un alta nueva se quedó pendiente para siempre porque se creó
// antes del auto-aplicar y nadie volvía a mirarla). Mismo criterio "seguro" que al crearse —
// nunca inventa un match ni un grupo nuevo, solo reintenta con lo que ya hay.
function blokes_sync_grupos_reintentar_pendientes($pestanas, $subs_por_tel, $externos_por_tel) {
    global $wpdb;
    $tabla = blokes_sync_grupos_cambios_table();
    $pendientes = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM {$tabla} WHERE estado = 'pendiente' AND tipo IN (%s, %s, %s)",
        'alumno_nuevo', 'pago_nuevo', 'nota'
    ), ARRAY_A);
    foreach ($pendientes as $cambio) {
        $match = blokes_sync_grupos_emparejar($cambio['telefono'], $cambio['nombre'], $subs_por_tel, $externos_por_tel);
        if ($match) {
            $wpdb->update($tabla, array(
                'match_tipo' => $match['tipo'], 'match_id' => $match['id'], 'match_label' => $match['label'],
            ), array('id' => intval($cambio['id'])));
        }
        if ($cambio['tipo'] === 'alumno_nuevo') {
            if (!$match) blokes_sync_grupos_autocrear_alumno_nuevo(intval($cambio['id']), $cambio['pestana'], $pestanas, $cambio['nombre'], $cambio['telefono']);
            else blokes_sync_grupos_resolver_alumno_nuevo_ya_existe(intval($cambio['id']), $match);
        } else {
            blokes_sync_grupos_autoaplicar_si_seguro(intval($cambio['id']), $cambio['tipo'], $match);
        }
    }
}

// "alumno_nuevo" CON match: esta fila del Excel es de alguien que ya existe en la web
// (identificado por teléfono) — no hay nada que crear, solo se marca vista para que no se quede
// pendiente para siempre sin necesidad (cowork, 4/11 04:30: un alta con match a una suscripción
// real nunca se resolvía porque solo el caso "sin match" tenía una acción definida).
function blokes_sync_grupos_resolver_alumno_nuevo_ya_existe($cambio_id, $match) {
    if (empty($match['tipo']) || empty($match['id'])) return;
    global $wpdb;
    $wpdb->update(blokes_sync_grupos_cambios_table(), array(
        'estado' => 'aplicado', 'resuelto_at' => current_time('mysql'), 'resuelto_por' => 'auto (ya existe en la web)',
    ), array('id' => intval($cambio_id), 'estado' => 'pendiente'));
}

// Crea o refresca un cambio pendiente para (pestana, clave, tipo, mes) — si ya hay uno
// pendiente igual, se actualiza con el dato más fresco en vez de duplicarse en cada
// sincronización mientras nadie lo resuelve.
function blokes_sync_grupos_upsert_cambio($pestana, $clave, $nombre, $telefono, $tipo, $mes, $datos, $match) {
    global $wpdb;
    $tabla = blokes_sync_grupos_cambios_table();
    $existente = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM {$tabla} WHERE pestana = %s AND clave = %s AND tipo = %s AND estado = 'pendiente' AND " . ($mes ? "mes = %s" : "mes IS NULL"),
        ...array_filter(array($pestana, $clave, $tipo, $mes), function($v) { return $v !== null; })
    ));
    $campos = array(
        'nombre' => $nombre, 'telefono' => $telefono, 'datos_json' => wp_json_encode($datos),
        'match_tipo' => $match['tipo'] ?? null, 'match_id' => $match['id'] ?? null, 'match_label' => $match['label'] ?? '',
    );
    if ($existente) {
        $wpdb->update($tabla, $campos, array('id' => intval($existente)));
        return intval($existente);
    }
    $wpdb->insert($tabla, array_merge($campos, array(
        'pestana' => $pestana, 'clave' => $clave, 'tipo' => $tipo, 'mes' => $mes, 'estado' => 'pendiente', 'creado_at' => current_time('mysql'),
    )));
    return $wpdb->insert_id;
}

// Auto-aplica un cambio recién creado si es de un tipo seguro (pago_nuevo/nota) Y está
// emparejado sin ambigüedad — todo lo demás (sin match, teléfono, alumno nuevo, fila borrada)
// se queda pendiente en la bandeja para que alguien decida (Ramiro, 3/11 17:05: "esto tiene que
// pasar automático" para lo claro, nunca para lo dudoso). Si el efecto falla por cualquier
// motivo, se deja pendiente igual — nunca se pierde el aviso.
function blokes_sync_grupos_autoaplicar_si_seguro($cambio_id, $tipo, $match) {
    if (!in_array($tipo, array('pago_nuevo', 'nota'), true) || empty($match['tipo']) || empty($match['id'])) return;
    global $wpdb;
    $tabla = blokes_sync_grupos_cambios_table();
    $cambio = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$tabla} WHERE id = %d", $cambio_id), ARRAY_A);
    if (!$cambio || $cambio['estado'] !== 'pendiente') return;
    $datos = json_decode($cambio['datos_json'], true) ?: array();
    $resultado = blokes_sync_grupos_aplicar_efecto($cambio, $datos);
    if (is_wp_error($resultado)) return;
    $wpdb->update($tabla, array('estado' => 'aplicado', 'resuelto_at' => current_time('mysql'), 'resuelto_por' => 'auto (sincronización)'), array('id' => $cambio_id));
}

// Dado el nombre real de una pestaña ("M-J 17.30"), busca entre los grupos que YA existen de
// verdad (por suscripción) cuál combinación día/horario/edad produce esa misma pestaña —
// blokes_sync_grupos_pestana_de_grupo() pero al revés, nunca un formato de horario inventado.
// Si hay más de una combinación que encaje, o ninguna (Pilates/Yoga/Kids con nombres sueltos,
// p. ej.), no se puede fiar: mejor la bandeja que crear un grupo fantasma con el horario mal.
// Pestañas que el matcher automático no puede desambiguar por sí solo (coinciden con MÁS de un
// grupo real por la hora de inicio) pero que Ramiro/Eva ya han confirmado a mano con una persona
// real de por medio — nunca se adivina en código, solo se documenta aquí la respuesta ya dada.
// Se consulta ANTES del emparejamiento automático; si la pestaña no está aquí, sigue intentándolo
// solo como siempre.
function blokes_sync_grupos_alias_pestana($pestana_real) {
    $alias = array(
        // Ramiro/Eva, 3/11 20:05 (NOTAS_PARA_CODE_sync_grupos.md): "M-J 17.30" son los adultos
        // (17:30-19:00, 86 €), no los niños (17:30-18:30) — ambos arrancan a la misma hora y el
        // matcher por franja de inicio no puede distinguirlos sin esta confirmación.
        'M-J 17.30' => array('dia' => 'Martes-Jueves', 'horario' => '17:30-19:00', 'edad' => 'Adultos'),
    );
    return $alias[$pestana_real] ?? null;
}

function blokes_sync_grupos_grupo_de_pestana($pestana_real, $pestanas_reales) {
    $alias = blokes_sync_grupos_alias_pestana($pestana_real);
    if ($alias) return $alias;
    $vistos = array();
    $candidatos = array();
    foreach (blokes_get_all_subscription_data() as $s) {
        $dia = blokes_dia_a_pareja($s['dia'] ?? '');
        $horario = $s['horario'] ?? '';
        $edad = $s['edad'] ?? 'Adultos';
        if ($dia === '' || $horario === '') continue;
        $clave = $dia . '|' . $horario . '|' . $edad;
        if (isset($vistos[$clave])) continue;
        $vistos[$clave] = true;
        if (blokes_sync_grupos_pestana_de_grupo($pestanas_reales, $dia, $horario) === $pestana_real) {
            $candidatos[$clave] = array('dia' => $dia, 'horario' => $horario, 'edad' => $edad);
        }
    }
    return count($candidatos) === 1 ? reset($candidatos) : null;
}

// "alumno_nuevo" sin match (nadie con ese teléfono en WooCommerce ni en externos): si la
// pestaña se puede traducir sin ambigüedad a día/horario/edad reales, se crea de alta externa
// — igual que si Eva lo hubiera añadido a mano desde "+ Alta externa", sin teléfono si no lo
// trae el Excel (sale en "Revisar datos" hasta que alguien lo rellene). Si no se puede traducir
// la pestaña con seguridad, se queda en la bandeja para decidir a mano.
function blokes_sync_grupos_autocrear_alumno_nuevo($cambio_id, $tab, $pestanas_reales, $nombre, $telefono) {
    global $wpdb;
    $grupo = blokes_sync_grupos_grupo_de_pestana($tab, $pestanas_reales);
    if (!$grupo) return;
    $req = new WP_REST_Request('POST', '/superadmin/v1/gestion/externos');
    $req->set_param('nombre', $nombre);
    $req->set_param('telefono', $telefono);
    $req->set_param('dia', $grupo['dia']);
    $req->set_param('horario', $grupo['horario']);
    $req->set_param('edad', $grupo['edad']);
    $req->set_param('notas', 'Detectado en el Excel de Eva (sincronización automática, pestaña ' . $tab . ').');
    $resultado = superadmin_gestion_externos_crear($req);
    if (is_wp_error($resultado)) return;
    $tabla = blokes_sync_grupos_cambios_table();
    $wpdb->update($tabla, array('estado' => 'aplicado', 'resuelto_at' => current_time('mysql'), 'resuelto_por' => 'auto (sincronización)'), array('id' => $cambio_id));
}

// El corazón del paso 2: lee TODAS las pestañas de la Hoja activa, las compara con la
// instantánea guardada y deja en la bandeja solo lo que cambió. Lo usan tanto el cron (cada
// hora) como el botón "Sincronizar ahora".
function blokes_sync_grupos_sincronizar() {
    blokes_sync_grupos_ensure_tables();
    global $wpdb;
    $activa = blokes_sync_grupos_sheet_activa();
    if (!$activa['id']) return new WP_Error('falta_config', 'No hay Hoja configurada.', array('status' => 400));

    $meta = blokes_sync_grupos_get($activa['id'], '?fields=sheets.properties.title');
    if (is_wp_error($meta)) return $meta;
    $pestanas = array_values(array_filter(array_map(function($s) { return $s['properties']['title'] ?? ''; }, $meta['sheets'] ?? array())));
    if (!$pestanas) return new WP_Error('sin_pestanas', 'La hoja no tiene pestañas.', array('status' => 502));

    $valores_por_pestana = blokes_sync_grupos_leer_valores_lote($activa['id'], $pestanas);
    if (is_wp_error($valores_por_pestana)) return $valores_por_pestana;

    $subs_por_tel     = blokes_sync_grupos_subs_por_telefono();
    $externos_por_tel = blokes_campanas_externos_por_telefono();

    $resumen = array('hojaUsada' => $activa['cual'], 'pestanas' => array(), 'cambiosNuevos' => 0, 'fotoInicial' => array());
    foreach ($pestanas as $tab) {
        $r = blokes_sync_grupos_leer_pestana_filas($valores_por_pestana[$tab] ?? array());
        if (!$r['filas'] && !$r['bloques']) continue; // pestaña sin formato de clase (Balance, Bonos de 10…)

        $tabla_snap = blokes_sync_grupos_snapshot_table();
        $es_foto_inicial = !$wpdb->get_var($wpdb->prepare("SELECT id FROM {$tabla_snap} WHERE pestana = %s LIMIT 1", $tab));
        if ($es_foto_inicial) $resumen['fotoInicial'][] = $tab;

        $claves_vistas = array();
        $cambios_pestana = 0;
        foreach ($r['filas'] as $fila) {
            $clave = blokes_sync_grupos_clave($fila['nombre'], $fila['telefono']);
            $claves_vistas[$clave] = true;
            $anterior = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$tabla_snap} WHERE pestana = %s AND clave = %s", $tab, $clave), ARRAY_A);
            $pagos_anteriores = $anterior ? (json_decode($anterior['pagos_json'], true) ?: array()) : array();

            if (!$es_foto_inicial) {
                $match = blokes_sync_grupos_emparejar($fila['telefono'], $fila['nombre'], $subs_por_tel, $externos_por_tel);
                if (!$anterior) {
                    $cid = blokes_sync_grupos_upsert_cambio($tab, $clave, $fila['nombre'], $fila['telefono'], 'alumno_nuevo', null, array(
                        'nombre' => $fila['nombre'], 'telefono' => $fila['telefono'],
                    ), $match);
                    if (!$match) blokes_sync_grupos_autocrear_alumno_nuevo($cid, $tab, $pestanas, $fila['nombre'], $fila['telefono']);
                    else blokes_sync_grupos_resolver_alumno_nuevo_ya_existe($cid, $match);
                    $cambios_pestana++;
                } else {
                    if (trim($anterior['notas']) !== trim($fila['notas']) && $fila['notas'] !== '') {
                        $cid = blokes_sync_grupos_upsert_cambio($tab, $clave, $fila['nombre'], $fila['telefono'], 'nota', null, array(
                            'notaAntes' => $anterior['notas'], 'notaDespues' => $fila['notas'],
                        ), $match);
                        blokes_sync_grupos_autoaplicar_si_seguro($cid, 'nota', $match);
                        $cambios_pestana++;
                    }
                    $tel_norm_antes = blokes_externos_normaliza_telefono($anterior['telefono']);
                    $tel_norm_ahora = blokes_externos_normaliza_telefono($fila['telefono']);
                    if ($tel_norm_antes !== $tel_norm_ahora && $tel_norm_ahora !== '') {
                        blokes_sync_grupos_upsert_cambio($tab, $clave, $fila['nombre'], $fila['telefono'], 'telefono', null, array(
                            'telefonoAntes' => $anterior['telefono'], 'telefonoDespues' => $fila['telefono'],
                        ), $match);
                        $cambios_pestana++;
                    }
                }
                foreach ($fila['pagos'] as $ym => $pago) {
                    $antes = $pagos_anteriores[$ym] ?? null;
                    $igual = $antes && floatval($antes['importe'] ?? 0) === floatval($pago['importe'] ?? 0) && ($antes['metodo'] ?? '') === ($pago['metodo'] ?? '');
                    if (!$igual) {
                        $cid = blokes_sync_grupos_upsert_cambio($tab, $clave, $fila['nombre'], $fila['telefono'], 'pago_nuevo', $ym, array(
                            'importe' => $pago['importe'], 'metodo' => $pago['metodo'], 'fecha' => $pago['fecha'] ?? null,
                        ), $match);
                        blokes_sync_grupos_autoaplicar_si_seguro($cid, 'pago_nuevo', $match);
                        $cambios_pestana++;
                    }
                }
            }

            $wpdb->query($wpdb->prepare(
                "INSERT INTO {$tabla_snap} (pestana, clave, nombre, telefono, notas, exento, pagos_json, updated_at) VALUES (%s,%s,%s,%s,%s,%d,%s,%s)
                 ON DUPLICATE KEY UPDATE nombre=%s, telefono=%s, notas=%s, exento=%d, pagos_json=%s, updated_at=%s",
                $tab, $clave, $fila['nombre'], $fila['telefono'], $fila['notas'], $fila['exento'] ? 1 : 0, wp_json_encode($fila['pagos']), current_time('mysql'),
                $fila['nombre'], $fila['telefono'], $fila['notas'], $fila['exento'] ? 1 : 0, wp_json_encode($fila['pagos']), current_time('mysql')
            ));
        }

        // Filas que estaban en la instantánea y ya no aparecen en el Excel: se avisa, nunca se
        // da de baja sola (Ramiro, NOTAS_PARA_CODE_sync_grupos.md).
        if (!$es_foto_inicial) {
            $claves_antes = $wpdb->get_col($wpdb->prepare("SELECT clave FROM {$tabla_snap} WHERE pestana = %s", $tab));
            foreach ($claves_antes as $clave_antes) {
                if (isset($claves_vistas[$clave_antes])) continue;
                $fila_antes = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$tabla_snap} WHERE pestana = %s AND clave = %s", $tab, $clave_antes), ARRAY_A);
                if (!$fila_antes) continue;
                blokes_sync_grupos_upsert_cambio($tab, $clave_antes, $fila_antes['nombre'], $fila_antes['telefono'], 'fila_borrada', null, array(
                    'nombre' => $fila_antes['nombre'],
                ), null);
                $cambios_pestana++;
            }
        }

        $resumen['pestanas'][] = array('pestana' => $tab, 'filas' => count($r['filas']), 'cambiosNuevos' => $es_foto_inicial ? 0 : $cambios_pestana, 'fotoInicial' => $es_foto_inicial);
        $resumen['cambiosNuevos'] += $es_foto_inicial ? 0 : $cambios_pestana;
    }

    blokes_sync_grupos_reintentar_pendientes($pestanas, $subs_por_tel, $externos_por_tel);

    update_option('blokes_sync_grupos_ultima_sincronizacion', current_time('mysql'), false);
    return $resumen;
}

// Secreto de un solo uso para /cron-tick — se genera y se guarda la primera vez que se pide
// (nunca hardcodeado, nunca en el código del repo público). Mismo patrón que el webhook de 9to5.
function blokes_sync_grupos_cron_secreto() {
    $s = get_option('blokes_sync_grupos_cron_secreto', '');
    if ($s === '') {
        $s = wp_generate_password(32, false);
        update_option('blokes_sync_grupos_cron_secreto', $s, false);
    }
    return $s;
}
// GET /gestion/sync-grupos/cron-tick?secret=... — para un cron real del hosting (SiteGround:
// panel → Herramientas de desarrollo → Cron Jobs, URL cada 10-15 min). Ruta pública (sin sesión
// de WordPress) pero inútil sin el secreto exacto, y no hace nada si no hay Hoja configurada.
function superadmin_sync_grupos_cron_tick($request) {
    $secret = (string) $request->get_param('secret');
    if (!hash_equals(blokes_sync_grupos_cron_secreto(), $secret)) {
        return new WP_Error('secreto_invalido', 'Secreto no válido.', array('status' => 403));
    }
    if (!get_option('blokes_sync_grupos_sheet_prueba_id', '') && !get_option('blokes_sync_grupos_sheet_real_id', '')) {
        return rest_ensure_response(array('success' => true, 'data' => array('omitido' => true)));
    }
    $r = blokes_sync_grupos_sincronizar();
    if (is_wp_error($r)) return new WP_Error($r->get_error_code(), $r->get_error_message(), array('status' => 502));
    return rest_ensure_response(array('success' => true, 'data' => $r));
}

function superadmin_sync_grupos_cron_url($request) {
    $url = rest_url('superadmin/v1/gestion/sync-grupos/cron-tick') . '?secret=' . blokes_sync_grupos_cron_secreto();
    return rest_ensure_response(array('success' => true, 'data' => array('url' => $url)));
}

function superadmin_sync_grupos_sincronizar_ahora() {
    $r = blokes_sync_grupos_sincronizar();
    if (is_wp_error($r)) return new WP_Error($r->get_error_code(), $r->get_error_message(), array('status' => 502));
    return rest_ensure_response(array('success' => true, 'data' => $r));
}

function superadmin_sync_grupos_cambios_listar($request) {
    blokes_sync_grupos_ensure_tables();
    global $wpdb;
    $estado = sanitize_key((string) ($request->get_param('estado') ?: 'pendiente'));
    $tabla = blokes_sync_grupos_cambios_table();
    $rows = $estado === 'todos'
        ? $wpdb->get_results("SELECT * FROM {$tabla} ORDER BY creado_at DESC LIMIT 500", ARRAY_A)
        : $wpdb->get_results($wpdb->prepare("SELECT * FROM {$tabla} WHERE estado = %s ORDER BY creado_at DESC LIMIT 500", $estado), ARRAY_A);
    foreach ($rows as &$r) { $r['datos'] = json_decode($r['datos_json'], true); unset($r['datos_json']); }
    return rest_ensure_response(array('success' => true, 'data' => array(
        'cambios' => $rows, 'ultimaSincronizacion' => get_option('blokes_sync_grupos_ultima_sincronizacion', null),
    )));
}

// ¿Esta suscripción ya tiene un pedido completed/processing de ese mes? Mismo criterio de "a qué
// mes pertenece" que usa Grupos (date_created, no date_paid — un adelantado deja la fecha real
// del banco, que puede caer en el mes anterior al que de verdad cubre).
function blokes_sync_grupos_sub_ya_cobrado_mes($sub_id, $ym) {
    if (!function_exists('wcs_get_subscription') || $ym === '') return false;
    $sub = wcs_get_subscription(intval($sub_id));
    if (!$sub) return false;
    $order_ids = array_filter(array_merge(array($sub->get_parent_id()), $sub->get_related_orders('ids', 'renewal')));
    foreach ($order_ids as $oid) {
        $order = wc_get_order($oid);
        if (!$order || !in_array($order->get_status(), array('completed', 'processing'), true)) continue;
        $fecha = $order->get_date_created() ?: $order->get_date_paid();
        if ($fecha && $fecha->date('Y-m') === $ym) return true;
    }
    return false;
}

// Efecto real de un cambio: "pago_nuevo" reutiliza EXACTAMENTE el mismo camino que "Marcar
// cobrado" a mano (con su protección de pagos adelantados incluida) o el cobro de un externo —
// nunca lógica nueva para tocar dinero. "nota" copia el texto al perfil (post meta de la
// suscripción, o el campo notas del externo). El resto de tipos (teléfono, alumno nuevo, fila
// borrada) sigue sin tener efecto propio — ambiguos a propósito, se quedan en la bandeja para
// que alguien decida a mano (Ramiro, NOTAS_PARA_CODE_sync_grupos.md 3/11 17:05: solo lo
// claramente seguro se aplica solo; lo dudoso sigue pasando por la bandeja).
function blokes_sync_grupos_aplicar_efecto($cambio, $datos) {
    if ($cambio['tipo'] === 'pago_nuevo') {
        if (!$cambio['match_tipo'] || !$cambio['match_id']) {
            return new WP_Error('sin_match', 'No hay nadie emparejado por teléfono para este pago — apúntalo a mano en Grupos.', array('status' => 409));
        }
        $fecha = (string) ($datos['fecha'] ?? '');
        $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) ? $fecha : current_time('Y-m-d');
        if ($cambio['match_tipo'] === 'sub') {
            // Si la web ya tiene un pedido completed/processing de ESE mes (p. ej. cobro
            // automático por Redsys que ya pasó solo, o un pago ya marcado por otro camino), el
            // pago del Excel no añade nada nuevo — intentar "Marcar cobrado" encima fallaría
            // además con "cobro automático" si la suscripción cobra sola, dejando el cambio
            // pendiente para siempre sin motivo real (cowork, 4/11 04:30: un pago ya cobrado en
            // la web se quedaba pendiente en Sync Grupos indefinidamente).
            if (blokes_sync_grupos_sub_ya_cobrado_mes(intval($cambio['match_id']), (string) $cambio['mes'])) {
                return rest_ensure_response(array('success' => true, 'yaCobrado' => true));
            }
            $req = new WP_REST_Request('POST', '/superadmin/v1/gestion/marcar-cobrado');
            $req->set_param('sub_id', intval($cambio['match_id']));
            $req->set_param('importe', floatval($datos['importe'] ?? 0));
            $req->set_param('metodo', blokes_sync_grupos_metodo_a_cobrado($datos['metodo'] ?? ''));
            $req->set_param('fecha', $fecha);
            $req->set_param('nota', 'Detectado en el Excel de Eva (sincronización automática, pestaña ' . $cambio['pestana'] . ').');
            $req->set_param('simular', false);
            return superadmin_gestion_marcar_cobrado($req);
        }
        $req = new WP_REST_Request('POST', '/superadmin/v1/gestion/externos/' . intval($cambio['match_id']) . '/pago');
        $req->set_param('id', intval($cambio['match_id']));
        $req->set_param('periodo', (string) $cambio['mes']);
        $req->set_param('importe', floatval($datos['importe'] ?? 0));
        $req->set_param('metodo', $datos['metodo'] ?? 'efectivo');
        $req->set_param('fecha', $fecha);
        return superadmin_gestion_externos_pago($req);
    }
    if ($cambio['tipo'] === 'nota') {
        if (!$cambio['match_tipo'] || !$cambio['match_id']) {
            return new WP_Error('sin_match', 'No hay nadie emparejado por teléfono para esta nota — apúntala a mano en Grupos.', array('status' => 409));
        }
        $nota = (string) ($datos['notaDespues'] ?? '');
        if ($cambio['match_tipo'] === 'sub') {
            $req = new WP_REST_Request('POST', '/superadmin/v1/gestion/nota');
            $req->set_param('sub_id', intval($cambio['match_id']));
            $req->set_param('nota', $nota);
            return superadmin_gestion_nota($req);
        }
        global $wpdb;
        $wpdb->update(blokes_externos_table(), array(
            'notas' => mb_substr(sanitize_text_field($nota), 0, 500), 'updated_at' => current_time('mysql'),
        ), array('id' => intval($cambio['match_id'])));
        blokes_gestion_log(intval($cambio['match_id']), 'externo_actualizar', null, array('notas' => $nota), 'Nota detectada en el Excel de Eva (sincronización).');
        return rest_ensure_response(array('success' => true));
    }
    if ($cambio['tipo'] === 'web_sin_fila') {
        // Reintenta exactamente la misma escritura que falló por no encontrar la fila — en
        // cuanto Eva añada a la persona al Excel, "Aplicar" la escribe sola sin volver a teclear
        // nada (Ramiro, 6/11 16:04). Si todavía no está, se queda pendiente (nunca se marca
        // resuelto sin haber escrito el dato de verdad).
        $escrito = blokes_sync_grupos_escribir_cobro(
            $datos['dia'] ?? '', $datos['horario'] ?? '', $cambio['telefono'], $cambio['nombre'],
            (string) $cambio['mes'], floatval($datos['importe'] ?? 0), (string) ($datos['metodo'] ?? ''),
            (string) ($datos['fecha'] ?? ''), $datos['subId'] ?? null
        );
        if (!$escrito) {
            return new WP_Error('sin_fila', 'Todavía no se encuentra esta fila en el Excel — añade a la persona y vuelve a pulsar Aplicar.', array('status' => 409));
        }
        return rest_ensure_response(array('success' => true));
    }
    return null; // resto de tipos: sin efecto todavía, solo queda visto en la bandeja
}

function superadmin_sync_grupos_cambio_aplicar($request) {
    blokes_sync_grupos_ensure_tables();
    global $wpdb;
    $id = intval($request['id']);
    $tabla = blokes_sync_grupos_cambios_table();
    $cambio = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$tabla} WHERE id = %d", $id), ARRAY_A);
    if (!$cambio) return new WP_Error('not_found', 'Cambio no encontrado.', array('status' => 404));
    if ($cambio['estado'] !== 'pendiente') return new WP_Error('ya_resuelto', 'Este cambio ya estaba resuelto.', array('status' => 409));
    $datos = json_decode($cambio['datos_json'], true) ?: array();

    $resultado = blokes_sync_grupos_aplicar_efecto($cambio, $datos);
    if (is_wp_error($resultado)) return new WP_Error($resultado->get_error_code(), $resultado->get_error_message(), array('status' => 409));

    $u = wp_get_current_user();
    $wpdb->update($tabla, array('estado' => 'aplicado', 'resuelto_at' => current_time('mysql'), 'resuelto_por' => $u ? $u->user_login : ''), array('id' => $id));
    return rest_ensure_response(array('success' => true, 'data' => $resultado ? $resultado->get_data() : null));
}

function superadmin_sync_grupos_cambio_descartar($request) {
    blokes_sync_grupos_ensure_tables();
    global $wpdb;
    $id = intval($request['id']);
    $tabla = blokes_sync_grupos_cambios_table();
    $cambio = $wpdb->get_row($wpdb->prepare("SELECT id, estado FROM {$tabla} WHERE id = %d", $id), ARRAY_A);
    if (!$cambio) return new WP_Error('not_found', 'Cambio no encontrado.', array('status' => 404));
    if ($cambio['estado'] !== 'pendiente') return new WP_Error('ya_resuelto', 'Este cambio ya estaba resuelto.', array('status' => 409));
    $u = wp_get_current_user();
    $wpdb->update($tabla, array('estado' => 'descartado', 'resuelto_at' => current_time('mysql'), 'resuelto_por' => $u ? $u->user_login : ''), array('id' => $id));
    return rest_ensure_response(array('success' => true));
}

// ============================================================
//  Calendario de días especiales del club (NOTAS_PARA_CODE_calendario.md)
// ============================================================

function blokes_club_days_table() { global $wpdb; return $wpdb->prefix . 'blokes_club_days'; }

function blokes_ensure_club_days_table() {
    global $wpdb;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE " . blokes_club_days_table() . " (
        id             bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        fecha          date         NOT NULL,
        tipo           varchar(30)  NOT NULL DEFAULT 'festivo_nacional',
        nombre         varchar(190) NOT NULL DEFAULT '',
        decision       varchar(30)  NOT NULL DEFAULT 'pendiente',
        horario        text         NOT NULL DEFAULT '',
        origen         varchar(20)  NOT NULL DEFAULT 'manual',
        decidido_por   varchar(100) NOT NULL DEFAULT '',
        fecha_decision datetime     NULL,
        created_at     datetime     NOT NULL,
        updated_at     datetime     NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY fecha (fecha)
    ) {$charset};");

    // Semilla única: los festivos que ya estaban fijos en `coverage.js › FESTIVOS_BASE` (ya
    // tratados como cierre en la app, así que se dan por decididos) más los que la nota de
    // calendario (27/10) señaló que Notion tiene y la lista fija no — esos se dejan `pendiente`
    // para que decida Ramiro, no se decide aquí por él.
    if (!get_option('blokes_club_days_seed')) {
        $filas = array(
            array('2026-12-08', 'festivo_madrid',    'Inmaculada Concepción',              'cierra',    'manual'),
            array('2026-12-25', 'festivo_nacional',  'Navidad',                             'cierra',    'manual'),
            array('2027-01-01', 'festivo_nacional',  'Año Nuevo',                           'cierra',    'manual'),
            array('2027-01-06', 'festivo_nacional',  'Reyes',                               'cierra',    'manual'),
            array('2027-08-15', 'festivo_nacional',  'Asunción',                            'cierra',    'manual'),
            array('2027-12-06', 'festivo_nacional',  'Constitución',                        'cierra',    'manual'),
            array('2027-12-08', 'festivo_madrid',    'Inmaculada Concepción',               'cierra',    'manual'),
            array('2027-12-25', 'festivo_nacional',  'Navidad',                             'cierra',    'manual'),
            array('2028-01-01', 'festivo_nacional',  'Año Nuevo',                           'cierra',    'manual'),
            array('2028-01-06', 'festivo_nacional',  'Reyes',                               'cierra',    'manual'),
            array('2026-11-02', 'festivo_local',     'Todos los Santos (trasladado)',       'pendiente', 'notion'),
            array('2026-12-07', 'festivo_local',     'Día de la Constitución (trasladado)', 'pendiente', 'notion'),
            array('2026-12-24', 'evento',            'Festivos Navidad',                    'pendiente', 'notion'),
        );
        $ahora = current_time('mysql');
        foreach ($filas as $f) {
            list($fecha, $tipo, $nombre, $decision, $origen) = $f;
            $wpdb->query($wpdb->prepare(
                "INSERT IGNORE INTO " . blokes_club_days_table() . " (fecha, tipo, nombre, decision, origen, created_at, updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                $fecha, $tipo, $nombre, $decision, $origen, $ahora, $ahora
            ));
        }
        update_option('blokes_club_days_seed', 1, false);
    }

    // Decisión de Ramiro (1/11, por chat, recogida por cowork a las 09:40): festivo en día
    // laborable = cierra por defecto; vísperas = abre. Aplica esa decisión a los festivos que ya
    // estaban cargados (quedaban `pendiente` o sin atribuir) y añade los dos que faltaban del
    // todo: Almudena (9/11, festivo local de Madrid) y la víspera de Año Nuevo (31/12).
    if (!get_option('blokes_club_days_decision_ramiro_1')) {
        $ahora = current_time('mysql');
        $decidir = function($fecha, $decision) use ($wpdb, $ahora) {
            $wpdb->update(blokes_club_days_table(), array(
                'decision' => $decision, 'decidido_por' => 'ramiro', 'fecha_decision' => $ahora, 'updated_at' => $ahora,
            ), array('fecha' => $fecha));
        };
        foreach (array('2026-11-02', '2026-12-07', '2026-12-08', '2026-12-25', '2027-01-01', '2027-01-06') as $f) $decidir($f, 'cierra');
        $decidir('2026-12-24', 'abre');

        $faltan = array(
            array('2026-11-09', 'festivo_local', 'Almudena',             'cierra'),
            array('2026-12-31', 'festivo_local',  'Nochevieja (víspera)', 'abre'),
        );
        foreach ($faltan as $f) {
            list($fecha, $tipo, $nombre, $decision) = $f;
            $existe = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . blokes_club_days_table() . " WHERE fecha = %s", $fecha), ARRAY_A);
            if ($existe) { $decidir($fecha, $decision); continue; }
            $wpdb->insert(blokes_club_days_table(), array(
                'fecha' => $fecha, 'tipo' => $tipo, 'nombre' => $nombre, 'decision' => $decision, 'horario' => '',
                'origen' => 'manual', 'decidido_por' => 'ramiro', 'fecha_decision' => $ahora,
                'created_at' => $ahora, 'updated_at' => $ahora,
            ));
        }
        update_option('blokes_club_days_decision_ramiro_1', 1, false);
    }

    // Visita del ACE Tetuán (confirmada por Ramiro, 1/11 17:20): el club sigue abierto ese día,
    // ocupa toda la sala por la mañana — es un `evento`, no un cierre. El plan de la compe (y
    // cualquier otra tarea que mire el calendario) la lee de aquí, no de texto suelto.
    if (!get_option('blokes_club_days_evento_ace')) {
        $ahora = current_time('mysql');
        $wpdb->insert(blokes_club_days_table(), array(
            'fecha' => '2026-11-25', 'tipo' => 'evento', 'nombre' => 'Visita ACE Tetuán (ESO)',
            'decision' => 'abre', 'horario' => '10:00 · 45 alumnos + 3 profesores · ocupa toda la sala por la mañana',
            'origen' => 'manual', 'decidido_por' => 'ramiro', 'fecha_decision' => $ahora,
            'created_at' => $ahora, 'updated_at' => $ahora,
        ));
        update_option('blokes_club_days_evento_ace', 1, false);
    }

    // Decisión de Ramiro (4/11 06:27): 24 y 31 de diciembre 2026 (jueves) cierran de verdad este
    // año — pero a diferencia del resto de festivos, SÍ gastan vacaciones de quien trabajaría ese
    // día (Eva: "nunca se ha abierto" esos días; Ramiro: "quiero que sí les cuente como
    // vacaciones"). Pasa esos dos días de `abre` (la regla general de "víspera = abre" que no
    // aplica aquí) a `cierra_vacaciones`, y genera la solicitud de vacaciones aprobada para cada
    // persona que trabaja los jueves — Alvaro, Sigurd, Sara y Eva; Lucía y Ana no tienen horario
    // ese día (src/data/staffSchedule.js) — como "cierre colectivo", sin que cada uno tenga que
    // pedirlo. Migración de una sola vez; de ahora en adelante el botón "Cierra (vacaciones)" de
    // CTRL Time Off hace esto mismo para cualquier cierre nuevo parecido.
    if (!get_option('blokes_club_days_cierre_vacaciones_dic_2026')) {
        $ahora = current_time('mysql');
        foreach (array('2026-12-24', '2026-12-31') as $fecha) {
            $wpdb->update(blokes_club_days_table(), array(
                'decision' => 'cierra_vacaciones', 'decidido_por' => 'ramiro', 'fecha_decision' => $ahora, 'updated_at' => $ahora,
            ), array('fecha' => $fecha));
        }
        $trabajan_jueves = array('Alvaro', 'Sigurd', 'Sara', 'Eva');
        $requests = get_option('blokes_timeoff_requests', array());
        if (!is_array($requests)) $requests = array();
        foreach (array('2026-12-24', '2026-12-31') as $fecha) {
            foreach ($trabajan_jueves as $persona) {
                $ya = false;
                foreach ($requests as $r) {
                    if (mb_strtolower($r['person'] ?? '') === mb_strtolower($persona) && ($r['from'] ?? '') === $fecha && ($r['to'] ?? '') === $fecha) { $ya = true; break; }
                }
                if ($ya) continue;
                $requests[] = array(
                    'id' => wp_generate_uuid4(), 'person' => $persona, 'from' => $fecha, 'to' => $fecha,
                    'status' => 'aprobada', 'canal' => 'otro',
                    'nota' => 'Cierre Nochebuena/Nochevieja — vacaciones para todos',
                    'created_at' => $ahora, 'by' => 'ramiro (migración)',
                );
            }
        }
        update_option('blokes_timeoff_requests', $requests, false);
        update_option('blokes_club_days_cierre_vacaciones_dic_2026', 1, false);
    }
}

// GET /gestion/club-days?desde&hasta — lista ordenada por fecha, opcionalmente filtrada.
function superadmin_club_days_listar($request) {
    blokes_ensure_club_days_table();
    global $wpdb;
    $desde = sanitize_text_field((string) $request->get_param('desde'));
    $hasta = sanitize_text_field((string) $request->get_param('hasta'));
    $where = array(); $args = array();
    if ($desde !== '') { $where[] = 'fecha >= %s'; $args[] = $desde; }
    if ($hasta !== '') { $where[] = 'fecha <= %s'; $args[] = $hasta; }
    $sql = "SELECT * FROM " . blokes_club_days_table() . (count($where) ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY fecha ASC';
    $rows = $args ? $wpdb->get_results($wpdb->prepare($sql, $args), ARRAY_A) : $wpdb->get_results($sql, ARRAY_A);
    $out = array_map('blokes_club_day_fila', $rows);
    return rest_ensure_response(array('success' => true, 'data' => $out));
}

function blokes_club_day_fila($r) {
    return array(
        'id' => intval($r['id']), 'fecha' => $r['fecha'], 'tipo' => $r['tipo'], 'nombre' => $r['nombre'],
        'decision' => $r['decision'], 'horario' => $r['horario'], 'origen' => $r['origen'],
        'decididoPor' => $r['decidido_por'] ?: null, 'fechaDecision' => $r['fecha_decision'] ?: null,
    );
}

// Fechas (YYYY-MM-DD → true) marcadas "cierra" o "cierra_vacaciones" en el calendario del club
// dentro de [desde, hasta] (inclusive) — las usa Organización (Equipación) para no repartir
// tareas esos días, igual que ya pasa con el fin de semana (NOTAS_PARA_CODE_calendario.md, 1/11).
// La sala está cerrada en los dos casos; que además cuente como vacaciones (cierra_vacaciones) no
// cambia que no haya nadie para equipar.
function blokes_club_days_cerrados($desde, $hasta) {
    global $wpdb;
    blokes_ensure_club_days_table();
    $fechas = $wpdb->get_col($wpdb->prepare(
        "SELECT fecha FROM " . blokes_club_days_table() . " WHERE decision IN ('cierra', 'cierra_vacaciones') AND fecha BETWEEN %s AND %s",
        $desde, $hasta
    ));
    return array_flip($fechas);
}

// POST /gestion/club-days — { fecha, tipo, nombre, horario? } — entrada manual (p. ej. un
// cierre suelto que decide Ramiro, o un evento que no viene de Notion/9to5).
function superadmin_club_days_crear($request) {
    blokes_ensure_club_days_table();
    global $wpdb;
    $tipos = array('festivo_nacional', 'festivo_madrid', 'festivo_local', 'cierre', 'horario_especial', 'evento');
    $body = $request->get_json_params();
    $fecha = sanitize_text_field((string) ($body['fecha'] ?? ''));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) return new WP_Error('bad_request', 'fecha debe ser YYYY-MM-DD.', array('status' => 400));
    $tipo = sanitize_key($body['tipo'] ?? 'evento');
    if (!in_array($tipo, $tipos, true)) $tipo = 'evento';
    $nombre = sanitize_text_field((string) ($body['nombre'] ?? ''));
    $horario = sanitize_text_field((string) ($body['horario'] ?? ''));
    $u = wp_get_current_user();
    $ahora = current_time('mysql');

    $existente = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . blokes_club_days_table() . " WHERE fecha = %s", $fecha), ARRAY_A);
    if ($existente) return new WP_Error('duplicado', 'Ya hay un día especial en esa fecha (edítalo en vez de crear otro).', array('status' => 409));

    $wpdb->insert(blokes_club_days_table(), array(
        'fecha' => $fecha, 'tipo' => $tipo, 'nombre' => $nombre, 'decision' => 'pendiente', 'horario' => $horario,
        'origen' => 'manual', 'decidido_por' => '', 'created_at' => $ahora, 'updated_at' => $ahora,
    ));
    blokes_gestion_log(0, 'club_day_crear', null, array('fecha' => $fecha, 'tipo' => $tipo, 'nombre' => $nombre), 'Alta manual en el calendario del club');
    return rest_ensure_response(array('success' => true, 'data' => blokes_club_day_fila($wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . blokes_club_days_table() . " WHERE id = %d", $wpdb->insert_id
    ), ARRAY_A))));
}

// PUT /gestion/club-days/{id} — cambia la decisión (abre/abre_horario_especial/cierra) y/o el
// horario/nombre/tipo. Solo rol socio (la decisión de abrir o cerrar es suya, no de gestión).
function superadmin_club_days_editar($request) {
    blokes_ensure_club_days_table();
    global $wpdb;
    $tipos = array('festivo_nacional', 'festivo_madrid', 'festivo_local', 'cierre', 'horario_especial', 'evento');
    // "cierra_vacaciones" (Ramiro, 4/11 06:27): cierra, pero a diferencia de "cierra" SÍ gasta
    // vacaciones de quien trabajaría ese día — para cierres como Nochebuena/Nochevieja que no son
    // festivo oficial. El reparto real (quién tiene vacaciones ese día) lo decide el frontend
    // (TimeOffTab.jsx) generando solicitudes aprobadas, no esta tabla.
    $decisiones = array('pendiente', 'abre', 'abre_horario_especial', 'cierra', 'cierra_vacaciones');
    $id = intval($request['id']);
    $antes = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . blokes_club_days_table() . " WHERE id = %d", $id), ARRAY_A);
    if (!$antes) return new WP_Error('not_found', 'Día no encontrado.', array('status' => 404));

    $body = $request->get_json_params();
    $campos = array('updated_at' => current_time('mysql'));
    if (isset($body['decision'])) {
        $decision = sanitize_key($body['decision']);
        if (!in_array($decision, $decisiones, true)) {
            return new WP_Error('bad_request', 'decision debe ser pendiente, abre, abre_horario_especial, cierra o cierra_vacaciones.', array('status' => 400));
        }
        $campos['decision'] = $decision;
        $u = wp_get_current_user();
        $campos['decidido_por'] = $u ? $u->user_login : '';
        $campos['fecha_decision'] = current_time('mysql');
    }
    if (isset($body['tipo'])) {
        $tipo = sanitize_key($body['tipo']);
        if (in_array($tipo, $tipos, true)) $campos['tipo'] = $tipo;
    }
    if (isset($body['nombre']))  $campos['nombre']  = sanitize_text_field((string) $body['nombre']);
    if (isset($body['horario'])) $campos['horario'] = sanitize_text_field((string) $body['horario']);

    $wpdb->update(blokes_club_days_table(), $campos, array('id' => $id));
    $despues = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . blokes_club_days_table() . " WHERE id = %d", $id), ARRAY_A);
    if (isset($body['decision'])) {
        blokes_gestion_log(0, 'club_day_decidir', array('decision' => $antes['decision']), array('decision' => $despues['decision']), array('fecha' => $despues['fecha']));
    }
    return rest_ensure_response(array('success' => true, 'data' => blokes_club_day_fila($despues)));
}

// DELETE /gestion/club-days/{id} — solo para entradas manuales que no debieron crearse.
function superadmin_club_days_borrar($request) {
    blokes_ensure_club_days_table();
    global $wpdb;
    $id = intval($request['id']);
    $fila = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . blokes_club_days_table() . " WHERE id = %d", $id), ARRAY_A);
    if (!$fila) return new WP_Error('not_found', 'Día no encontrado.', array('status' => 404));
    $wpdb->delete(blokes_club_days_table(), array('id' => $id));
    blokes_gestion_log(0, 'club_day_borrar', $fila, null, 'Borrado del calendario del club');
    return rest_ensure_response(array('success' => true));
}

/**
 * Crea UN producto de abono nuevo duplicando $source_id (el mensual correspondiente, 5114/5115)
 * — copia título, imagen, categorías, descripción, impuestos, stock, etc. tal cual, y solo
 * cambia nombre/precio/periodicidad. El mensual de origen no se toca para nada, así que sus
 * suscriptores actuales siguen intactos (NOTAS_PARA_CODE_abono_anual.md, Ramiro 06/11).
 * Idempotente: si ya existe un producto con ese título exacto, devuelve su id sin crear otro.
 *
 * @param int    $source_id Id del producto mensual del que se parte (5114 o 5115).
 * @param string $titulo    Título del abono nuevo.
 * @param float  $precio    Precio del periodo completo (p.ej. 749 para el anual).
 * @param string $period    'month' o 'year' (periodo de WooCommerce Subscriptions).
 * @param int    $interval  Cada cuántos $period se renueva (3 para trimestral, 1 para anual).
 * @return int|WP_Error Id del producto (nuevo o ya existente) o error.
 */
function blokes_crear_producto_abono_periodicidad($source_id, $titulo, $precio, $period, $interval) {
    if (!function_exists('wc_get_product')) {
        return new WP_Error('no_woocommerce', 'WooCommerce no está activo.', array('status' => 500));
    }
    $existente = get_page_by_title($titulo, OBJECT, 'product');
    if ($existente) {
        return (int) $existente->ID;
    }
    $source = wc_get_product($source_id);
    if (!$source) {
        return new WP_Error('origen_no_encontrado', 'No existe el producto de origen ' . $source_id . '.', array('status' => 404));
    }
    $data = $source->get_data();
    unset($data['id'], $data['sku'], $data['slug'], $data['date_created'], $data['date_modified'], $data['name'], $data['meta_data']);

    $nuevo = new WC_Product_Subscription();
    $nuevo->set_props($data);
    $nuevo->set_name($titulo);
    $nuevo->set_regular_price((string) $precio);
    $nuevo->set_sale_price('');
    $nuevo->set_status('publish');
    $nuevo->set_subscription_period($period);
    $nuevo->set_subscription_period_interval((string) $interval);
    $nuevo->set_subscription_price((string) $precio);
    $nuevo->save();

    $nuevo_id = $nuevo->get_id();
    update_post_meta($nuevo_id, '_blokes_abono_generado_desde', $source_id);
    $nuevo = wc_get_product($nuevo_id);
    $sku_base = 'abono-' . sanitize_title($titulo);
    $sku = $sku_base;
    $i = 2;
    while (wc_get_product_id_by_sku($sku) && wc_get_product_id_by_sku($sku) !== $nuevo_id) {
        $sku = $sku_base . '-' . $i;
        $i++;
    }
    $nuevo->set_sku($sku);
    $nuevo->save();

    blokes_gestion_log(0, 'abono_periodicidad_crear', null, array(
        'id' => $nuevo_id, 'titulo' => $titulo, 'precio' => $precio, 'period' => $period, 'interval' => $interval, 'desde' => $source_id,
    ), 'Alta de abono ' . $titulo . ' (duplicado de ' . $source_id . ')');

    return $nuevo_id;
}

// POST /gestion/abonos/crear-periodicidad — crea los 4 abonos pedidos por Ramiro (anual y
// trimestral, todo el día y mañana), duplicando 5115 y 5114 respectivamente. Se puede llamar
// varias veces sin riesgo: los que ya existen (por título) no se vuelven a crear.
function superadmin_abonos_crear_periodicidad($request) {
    $pedidos = array(
        array('source' => 5115, 'titulo' => 'Abono anual todo el día',      'precio' => 749, 'period' => 'year',  'interval' => 1),
        array('source' => 5114, 'titulo' => 'Abono anual mañana',          'precio' => 629, 'period' => 'year',  'interval' => 1),
        array('source' => 5115, 'titulo' => 'Abono trimestral todo el día', 'precio' => 195, 'period' => 'month', 'interval' => 3),
        array('source' => 5114, 'titulo' => 'Abono trimestral mañana',     'precio' => 165, 'period' => 'month', 'interval' => 3),
    );
    $resultado = array();
    foreach ($pedidos as $p) {
        $id = blokes_crear_producto_abono_periodicidad($p['source'], $p['titulo'], $p['precio'], $p['period'], $p['interval']);
        if (is_wp_error($id)) {
            $resultado[] = array('titulo' => $p['titulo'], 'error' => $id->get_error_message());
        } else {
            $resultado[] = array('titulo' => $p['titulo'], 'id' => $id, 'url_editar' => admin_url('post.php?post=' . $id . '&action=edit'));
        }
    }
    return rest_ensure_response(array('success' => true, 'data' => $resultado));
}

/**
 * Migración del Excel "Grupos" (8.4, una vez): recibe las filas ya leídas del Excel y, por cada
 * una, mira si esa persona (por teléfono o nombre) ya tiene una suscripción en vigor en la web
 * — si la tiene, no se crea nada (no son "externos", ya están). Si no, y no tiene ningún pago
 * registrado en septiembre ni octubre (salvo exentos), se descarta: es alumnado que ya no viene
 * y se quedó en el Excel. Si no existe ya como externo (mismo teléfono), se crea; si ya existe,
 * se actualizan sus pagos y notas. Las filas marcadas
 * "posible familiar" (mismo teléfono que una suscripción de la web, pero no se puede confirmar
 * si es la misma persona) no se crean en el volcado real salvo que la fila llegue con
 * `confirmarFamiliar: true` — hasta entonces quedan como "pendiente_revision". Entre las propias
 * filas nuevas de este mismo lote, dos o más que comparten teléfono se avisan con
 * `hermanoEnLote` (candidatos a bono familiar) pero se crean igual, sin esperar confirmación.
 * Con `simular` no escribe nada, solo dice qué haría con cada fila.
 */
function superadmin_gestion_externos_importar($request) {
    blokes_ensure_externos_tables();
    global $wpdb;
    $body    = $request->get_json_params();
    $filas   = is_array($body['filas'] ?? null) ? $body['filas'] : array();
    $simular = !empty($body['simular']);
    if (count($filas) > 200) return new WP_Error('too_many', 'Máximo 200 filas de golpe.', array('status' => 400));

    $existentes = array();
    foreach (blokes_externos_todos() as $e) $existentes[blokes_externos_normaliza_telefono($e['telefono'])] = $e;

    // Para detectar hermanos ambiguos: dos o más filas de esta misma pestaña con el mismo
    // teléfono. Ahí "teléfono + grupo" no basta para confirmar a cuál de ellos corresponde una
    // suscripción de la web. También sirve para avisar de hermanos nuevos (candidatos a bono
    // familiar) que comparten teléfono entre ellos, no con la web.
    $conteo_telefono     = array();
    $nombres_por_telefono = array();
    foreach ($filas as $raw) {
        $t = blokes_externos_normaliza_telefono($raw['telefono'] ?? '');
        if ($t === '') continue;
        $conteo_telefono[$t] = ($conteo_telefono[$t] ?? 0) + 1;
        $n = mb_substr(sanitize_text_field((string) ($raw['nombre'] ?? '')), 0, 190);
        if ($n !== '') $nombres_por_telefono[$t][] = $n;
    }
    $anio        = date('Y');
    $periodo_sep = $anio . '-09';
    $periodo_oct = $anio . '-10';

    $resultado = array();
    foreach ($filas as $raw) {
        $f = blokes_externos_limpia($raw);
        if ($f['nombre'] === '') { $resultado[] = array('nombre' => '(sin nombre)', 'accion' => 'invalida', 'motivo' => 'Falta el nombre'); continue; }

        $pagos = is_array($raw['pagos'] ?? null) ? $raw['pagos'] : array();

        // Primero el cruce con la web: alguien que paga por su suscripción de WooCommerce puede
        // no tener nada que apuntar en este seguimiento aparte, y no por eso ha dejado de venir.
        $hay_hermanos = $f['telefono'] !== '' && ($conteo_telefono[$f['telefono']] ?? 0) > 1;
        $match = blokes_externos_buscar_en_web($f['telefono'], $f['nombre'], $f['dia'], $f['horario'], $f['edad'], $hay_hermanos);
        if ($match && $match['tipo'] === 'confirmado') {
            $resultado[] = array('nombre' => $f['nombre'], 'accion' => 'ya_en_web', 'subId' => $match['subId']);
            continue;
        }

        if (!$f['exento'] && !blokes_externos_tiene_pago($pagos, $periodo_sep) && !blokes_externos_tiene_pago($pagos, $periodo_oct)) {
            $resultado[] = array('nombre' => $f['nombre'], 'accion' => 'no_activo', 'motivo' => 'Sin pago en septiembre ni octubre: probablemente ya no viene');
            continue;
        }
        // Mismo teléfono que una suscripción de la web, pero no hay suficiente para confirmar que
        // es la misma persona (nombre distinto, o hermanos ambiguos en el grupo): probablemente un
        // familiar compartiendo el móvil de los padres. En `simular` se muestra igual qué pasaría
        // (para decidir mirando la vista previa), pero en el volcado real NO se crea ni se
        // actualiza nada por esto solo — se queda "pendiente_revision" hasta que, tras decidir a
        // mano que es un familiar distinto y no la misma persona, se repita esa fila con
        // `confirmarFamiliar: true`.
        $posible_familiar = $match && $match['tipo'] === 'posible_familiar' ? $match['subId'] : null;
        // El Excel dice que paga por la web, pero no se ha encontrado ninguna suscripción suya ni
        // siquiera como posible familiar: alguien que paga por la web, por definición, ya tiene
        // una suscripción en alguna parte — crearlo como "nuevo" sería casi seguro un duplicado.
        // Misma puerta que `posible_familiar` (pendiente_revision salvo `confirmarFamiliar: true`).
        $paga_web_sin_match = !$posible_familiar && blokes_externos_paga_por_web($pagos, $periodo_sep, $periodo_oct);
        if (($posible_familiar || $paga_web_sin_match) && !$simular && empty($raw['confirmarFamiliar'])) {
            $resultado[] = array(
                'nombre' => $f['nombre'], 'accion' => 'pendiente_revision', 'posibleFamiliar' => $posible_familiar,
                'motivo' => $posible_familiar
                    ? 'El teléfono coincide con otra suscripción de la web, pero no hay bastante para saber si es la misma persona o un familiar. Hay que decidirlo a mano antes de crearlo.'
                    : 'El Excel dice que paga por la web, pero no se ha encontrado ninguna suscripción suya para confirmarlo. Hay que decidirlo a mano antes de crearlo.',
            );
            continue;
        }

        $existente = $f['telefono'] !== '' ? ($existentes[$f['telefono']] ?? null) : null;

        if ($existente) {
            if (!$simular) {
                $wpdb->update(blokes_externos_table(), array_merge($f, array('updated_at' => current_time('mysql'))), array('id' => $existente['id']));
                foreach ($pagos as $periodo => $p) {
                    if (!preg_match('/^\d{4}-\d{2}$/', $periodo) || !is_array($p)) continue;
                    $wpdb->query($wpdb->prepare(
                        "INSERT INTO " . blokes_externos_pagos_table() . " (externo_id, periodo, importe, metodo, fecha) VALUES (%d, %s, %f, %s, %s)
                         ON DUPLICATE KEY UPDATE importe = %f, metodo = %s, fecha = %s",
                        $existente['id'], $periodo, floatval($p['importe'] ?? 0), (string) ($p['metodo'] ?? ''), (string) ($p['fecha'] ?? current_time('Y-m-d')),
                        floatval($p['importe'] ?? 0), (string) ($p['metodo'] ?? ''), (string) ($p['fecha'] ?? current_time('Y-m-d'))
                    ));
                }
            }
            $fila = array('nombre' => $f['nombre'], 'accion' => 'actualizaria_existente', 'id' => $existente['id'], 'pagos' => count($pagos));
            if ($posible_familiar) $fila['posibleFamiliar'] = $posible_familiar;
            if ($paga_web_sin_match) $fila['pagaWebSinMatch'] = true;
            $resultado[] = $fila;
            continue;
        }

        if (!$simular) {
            $u = wp_get_current_user();
            $wpdb->insert(blokes_externos_table(), array_merge($f, array(
                'activo' => 1, 'user_login' => $u->user_login, 'created_at' => current_time('mysql'), 'updated_at' => current_time('mysql'),
            )));
            $nuevo_id = $wpdb->insert_id;
            foreach ($pagos as $periodo => $p) {
                if (!preg_match('/^\d{4}-\d{2}$/', $periodo) || !is_array($p)) continue;
                $wpdb->insert(blokes_externos_pagos_table(), array(
                    'externo_id' => $nuevo_id, 'periodo' => $periodo, 'importe' => floatval($p['importe'] ?? 0),
                    'metodo' => (string) ($p['metodo'] ?? ''), 'fecha' => (string) ($p['fecha'] ?? current_time('Y-m-d')),
                ));
            }
            blokes_gestion_log($nuevo_id, 'externo_importar', null, $f, 'Migración 8.4 desde el Excel');
        }
        $fila = array('nombre' => $f['nombre'], 'accion' => 'nuevo', 'grupo' => trim($f['dia'] . ' ' . $f['horario']), 'pagos' => count($pagos));
        if ($posible_familiar) $fila['posibleFamiliar'] = $posible_familiar;
        if ($paga_web_sin_match) $fila['pagaWebSinMatch'] = true;
        // Hermanos nuevos que comparten teléfono entre ellos (no con la web): no es un duplicado —
        // los dos se crean igual — pero se avisa como candidatos a bono familiar.
        if (($conteo_telefono[$f['telefono']] ?? 0) > 1) {
            $otros = array_values(array_diff($nombres_por_telefono[$f['telefono']] ?? array(), array($f['nombre'])));
            if ($otros) $fila['hermanoEnLote'] = $otros;
        }
        $resultado[] = $fila;
    }

    $resumen = array('yaEnWeb' => 0, 'actualizaria_existente' => 0, 'nuevo' => 0, 'invalida' => 0, 'noActivo' => 0, 'pendienteRevision' => 0, 'posibleFamiliar' => 0, 'hermanoEnLote' => 0, 'pagaWebSinMatch' => 0);
    $mapa_accion = array('ya_en_web' => 'yaEnWeb', 'pendiente_revision' => 'pendienteRevision', 'no_activo' => 'noActivo');
    foreach ($resultado as $r) {
        $k = $mapa_accion[$r['accion']] ?? $r['accion'];
        if (isset($resumen[$k])) $resumen[$k]++;
        if (!empty($r['posibleFamiliar'])) $resumen['posibleFamiliar']++;
        if (!empty($r['hermanoEnLote'])) $resumen['hermanoEnLote']++;
        if (!empty($r['pagaWebSinMatch'])) $resumen['pagaWebSinMatch']++;
    }
    return rest_ensure_response(array('success' => true, 'data' => array('simulado' => $simular, 'resumen' => $resumen, 'filas' => $resultado)));
}

// ============================================================
//  Campañas de WhatsApp (31/10, fase a: envío manual wa.me)
// ============================================================
// Listas que se mantienen solas a partir de Grupos/WooCommerce (no son listas fijas): un
// contacto es "actuales" si tiene suscripción en vigor o es externo activo; "nuevos" si esa
// suscripción es de los últimos 60 días, o si no tiene suscripción pero el contacto viene de
// "interesados"; "antiguos" si se dio de baja de clases o viene de la carga inicial del xlsx de
// antiguos alumnos; "bajas" (de mensajes) si respondió BAJA, y eso nunca se recalcula solo.

// ============================================================
//  Histórico de pagos importado (HV Control de Clientes, 1/11 17:40) — tabla de SOLO LECTURA,
//  nunca toca pedidos ni facturas de WooCommerce. Fuente para el histórico real de la
//  calculadora de mañanas y, más adelante, para completar Grupos y Estadísticas.
// ============================================================

function blokes_hist_pagos_table() { global $wpdb; return $wpdb->prefix . 'blokes_hist_pagos'; }

function blokes_ensure_hist_pagos_table() {
    global $wpdb;
    if (get_option('blokes_hist_pagos_tabla_v1')) return;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE " . blokes_hist_pagos_table() . " (
        id            bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        origen        varchar(40)   NOT NULL DEFAULT '',
        codigo        varchar(20)   NOT NULL DEFAULT '',
        clase         varchar(190)  NOT NULL DEFAULT '',
        nombre        varchar(190)  NOT NULL DEFAULT '',
        importe       decimal(8,2)  NOT NULL DEFAULT 0,
        duracion      varchar(40)   NOT NULL DEFAULT '',
        metodo        varchar(40)   NOT NULL DEFAULT '',
        fecha         date          NULL,
        profesor      varchar(100)  NOT NULL DEFAULT '',
        telefono      varchar(20)   NOT NULL DEFAULT '',
        email         varchar(190)  NOT NULL DEFAULT '',
        observaciones text          NOT NULL DEFAULT '',
        estatus       varchar(40)   NOT NULL DEFAULT '',
        created_at    datetime      NOT NULL,
        PRIMARY KEY (id),
        KEY fecha (fecha), KEY telefono (telefono), KEY codigo (codigo)
    ) {$charset};");
    update_option('blokes_hist_pagos_tabla_v1', 1, false);
}

// POST /gestion/hist-pagos/importar — { origen?, pagos: [...], simular?, forzar? } — solo
// socio. `simular: true` no escribe nada, solo cuenta nuevas/duplicadas/inválidas. Una fila se
// considera "ya importada" si coincide origen+código+fecha+importe (no hay un id natural en el
// Excel de origen). Si ya hay filas de ese `origen` y no se manda `simular` ni `forzar`, para en
// seco — para no repetir un volcado de 3000 filas por accidente.
function superadmin_hist_pagos_importar($request) {
    global $wpdb;
    blokes_ensure_hist_pagos_table();
    $body = $request->get_json_params();
    $origen = sanitize_key((string) ($body['origen'] ?? 'hv_control_clientes'));
    $pagos = is_array($body['pagos'] ?? null) ? $body['pagos'] : array();
    if (!$pagos) return new WP_Error('invalid_data', 'Falta el array "pagos".', array('status' => 400));
    if (count($pagos) > 5000) return new WP_Error('too_many', 'Máximo 5000 filas de golpe.', array('status' => 400));
    $simular = !empty($body['simular']);

    $existe_ya = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM " . blokes_hist_pagos_table() . " WHERE origen = %s", $origen
    ));
    if ($existe_ya > 0 && !$simular && empty($body['forzar'])) {
        return new WP_Error('ya_importado', "Ya hay {$existe_ya} fila(s) importada(s) de '{$origen}'. Manda forzar:true si quieres añadir más (no se duplican por código+fecha+importe).", array('status' => 409));
    }

    $nuevas = 0; $duplicadas = 0; $invalidas = 0;
    $ahora = current_time('mysql');
    foreach ($pagos as $p) {
        $codigo = sanitize_text_field((string) ($p['codigo'] ?? ''));
        $fecha_raw = (string) ($p['fecha'] ?? '');
        $fecha = ($fecha_raw && strtotime($fecha_raw)) ? date('Y-m-d', strtotime($fecha_raw)) : null;
        $importe = isset($p['importe']) ? round(floatval($p['importe']), 2) : 0;
        if (!$fecha) { $invalidas++; continue; }

        $dup = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM " . blokes_hist_pagos_table() . " WHERE origen = %s AND codigo = %s AND fecha = %s AND importe = %f",
            $origen, $codigo, $fecha, $importe
        ));
        if ($dup) { $duplicadas++; continue; }

        $nuevas++;
        if ($simular) continue;
        $wpdb->insert(blokes_hist_pagos_table(), array(
            'origen' => $origen, 'codigo' => $codigo,
            'clase' => sanitize_text_field((string) ($p['clase'] ?? '')),
            'nombre' => sanitize_text_field((string) ($p['nombre'] ?? '')),
            'importe' => $importe, 'duracion' => sanitize_text_field((string) ($p['duracion'] ?? '')),
            'metodo' => sanitize_text_field((string) ($p['metodo'] ?? '')), 'fecha' => $fecha,
            'profesor' => sanitize_text_field((string) ($p['profesor'] ?? '')),
            'telefono' => blokes_externos_normaliza_telefono((string) ($p['telefono'] ?? '')),
            'email' => sanitize_email((string) ($p['email'] ?? '')),
            'observaciones' => sanitize_textarea_field((string) ($p['observaciones'] ?? '')),
            'estatus' => sanitize_text_field((string) ($p['estatus'] ?? '')),
            'created_at' => $ahora,
        ), array('%s', '%s', '%s', '%s', '%f', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s'));
    }

    if (!$simular && $nuevas > 0) {
        blokes_gestion_log(0, 'hist_pagos_importar', null, array('origen' => $origen, 'nuevas' => $nuevas), "Importación de {$origen}");
    }

    return rest_ensure_response(array('success' => true, 'data' => array(
        'simulado' => $simular, 'nuevas' => $nuevas, 'duplicadas' => $duplicadas, 'invalidas' => $invalidas, 'total' => count($pagos),
    )));
}

// GET /gestion/hist-pagos/resumen?desde&hasta — alumnos únicos e importe por mes (histórico
// real para la calculadora de mañanas y, más adelante, Estadísticas). Nunca devuelve nombre o
// teléfono: solo los agregados.
function superadmin_hist_pagos_resumen($request) {
    global $wpdb;
    blokes_ensure_hist_pagos_table();
    $desde = sanitize_text_field((string) $request->get_param('desde'));
    $hasta = sanitize_text_field((string) $request->get_param('hasta'));
    $where = array('1=1'); $args = array();
    if ($desde) { $where[] = 'fecha >= %s'; $args[] = $desde; }
    if ($hasta) { $where[] = 'fecha <= %s'; $args[] = $hasta; }
    $sql = "SELECT fecha, importe, telefono, nombre FROM " . blokes_hist_pagos_table() . " WHERE " . implode(' AND ', $where) . " ORDER BY fecha ASC";
    $rows = $args ? $wpdb->get_results($wpdb->prepare($sql, $args), ARRAY_A) : $wpdb->get_results($sql, ARRAY_A);
    $por_mes = array();
    foreach ($rows as $r) {
        $mes = substr($r['fecha'], 0, 7);
        if (!isset($por_mes[$mes])) $por_mes[$mes] = array('alumnos' => array(), 'importe' => 0);
        $clave = $r['telefono'] ?: $r['nombre'];
        $por_mes[$mes]['alumnos'][$clave] = true;
        $por_mes[$mes]['importe'] += floatval($r['importe']);
    }
    $out = array();
    foreach ($por_mes as $mes => $d) { $out[$mes] = array('alumnos' => count($d['alumnos']), 'importe' => round($d['importe'], 2)); }
    return rest_ensure_response(array('success' => true, 'data' => $out));
}

// ¿Esta clase del histórico es de "mañana" (antes de las 15:00, sin infantiles ni sábados)?
// Comprobado a mano contra los números de Ramiro (jun-25 31/2108€, jul-25 19/1517€, ago-25
// 3/148€, sep-25 9/693€, jun-26 10/670€, jul-26 5/370€): coinciden exactos con esta regla.
// `null` = la clase no tiene hora (Pilates, Yoga, Mensualidad Libre…) — no se puede clasificar,
// así que no cuenta ni como mañana ni como tarde.
function blokes_hist_pago_es_manana($clase) {
    $c = (string) $clase;
    if (stripos($c, 'infantil') !== false || stripos($c, 'kids') !== false) return false;
    if (preg_match('/s.bados?/ui', $c)) return false;
    if (!preg_match('/(\d{1,2})[:.](\d{2})/', $c, $m)) return null;
    return intval($m[1]) < 15;
}

// GET /gestion/hist-pagos/resumen-mananas?desde&hasta — el histórico real de "mañanas" para la
// calculadora (NOTAS_PARA_CODE_hv_control_clientes.md, punto 2), en vez de los números a mano.
// Mismo formato que /resumen (alumnos únicos + importe por mes, sin nombres ni teléfonos), pero
// solo con las clases de mañana de verdad.
function superadmin_hist_pagos_resumen_mananas($request) {
    global $wpdb;
    blokes_ensure_hist_pagos_table();
    $desde = sanitize_text_field((string) $request->get_param('desde'));
    $hasta = sanitize_text_field((string) $request->get_param('hasta'));
    $where = array('1=1'); $args = array();
    if ($desde) { $where[] = 'fecha >= %s'; $args[] = $desde; }
    if ($hasta) { $where[] = 'fecha <= %s'; $args[] = $hasta; }
    $sql = "SELECT fecha, importe, telefono, nombre, clase FROM " . blokes_hist_pagos_table() . " WHERE " . implode(' AND ', $where) . " ORDER BY fecha ASC";
    $rows = $args ? $wpdb->get_results($wpdb->prepare($sql, $args), ARRAY_A) : $wpdb->get_results($sql, ARRAY_A);
    $por_mes = array();
    foreach ($rows as $r) {
        if (blokes_hist_pago_es_manana($r['clase']) !== true) continue;
        $mes = substr($r['fecha'], 0, 7);
        if (!isset($por_mes[$mes])) $por_mes[$mes] = array('alumnos' => array(), 'importe' => 0);
        $clave = $r['telefono'] ?: $r['nombre'];
        $por_mes[$mes]['alumnos'][$clave] = true;
        $por_mes[$mes]['importe'] += floatval($r['importe']);
    }
    $out = array();
    foreach ($por_mes as $mes => $d) { $out[$mes] = array('alumnos' => count($d['alumnos']), 'importe' => round($d['importe'], 2)); }
    return rest_ensure_response(array('success' => true, 'data' => array('porMes' => $out, 'fuente' => 'HV')));
}

// GET /gestion/hist-pagos/estadisticas — punto 5 del encargo (NOTAS_PARA_CODE_hv_control_clientes.md):
// permanencia media, bajas tras verano, alumnos por profesor/clase/mes, uso de bonos. Solo
// agregados — nunca nombre ni teléfono sueltos (misma clave telefono||nombre que el resto de
// resúmenes, solo para no duplicar a la misma persona en los recuentos).
function superadmin_hist_pagos_estadisticas($request) {
    global $wpdb;
    blokes_ensure_hist_pagos_table();
    $rows = $wpdb->get_results(
        "SELECT fecha, importe, telefono, nombre, clase, profesor, duracion FROM " . blokes_hist_pagos_table() . " WHERE fecha IS NOT NULL ORDER BY fecha ASC",
        ARRAY_A
    );

    $por_alumno = array(); // clave => array('meses' => array(ym => true), 'primera' => fecha, 'ultima' => fecha)
    $por_profesor_mes = array();
    $por_clase_mes = array();
    $bonos_total = 0; $bonos_alumnos = array(); $bonos_por_mes = array();

    foreach ($rows as $r) {
        $clave = $r['telefono'] ?: $r['nombre'];
        if ($clave === '') continue;
        $ym = substr($r['fecha'], 0, 7);
        if (!isset($por_alumno[$clave])) $por_alumno[$clave] = array('meses' => array(), 'primera' => $r['fecha'], 'ultima' => $r['fecha']);
        $por_alumno[$clave]['meses'][$ym] = true;
        if ($r['fecha'] < $por_alumno[$clave]['primera']) $por_alumno[$clave]['primera'] = $r['fecha'];
        if ($r['fecha'] > $por_alumno[$clave]['ultima'])  $por_alumno[$clave]['ultima']  = $r['fecha'];

        $profesor = trim((string) $r['profesor']);
        if ($profesor !== '') {
            if (!isset($por_profesor_mes[$profesor])) $por_profesor_mes[$profesor] = array();
            if (!isset($por_profesor_mes[$profesor][$ym])) $por_profesor_mes[$profesor][$ym] = array();
            $por_profesor_mes[$profesor][$ym][$clave] = true;
        }
        $clase = trim((string) $r['clase']);
        if ($clase !== '') {
            if (!isset($por_clase_mes[$clase])) $por_clase_mes[$clase] = array();
            if (!isset($por_clase_mes[$clase][$ym])) $por_clase_mes[$clase][$ym] = array();
            $por_clase_mes[$clase][$ym][$clave] = true;
        }
        if (trim((string) $r['duracion']) === 'Bono 10 asistencias') {
            $bonos_total++;
            $bonos_alumnos[$clave] = true;
            if (!isset($bonos_por_mes[$ym])) $bonos_por_mes[$ym] = 0;
            $bonos_por_mes[$ym]++;
        }
    }

    // Permanencia: meses entre la primera y la última vez que pagó cada alumno (0 si solo pagó
    // una vez — no es que "duró 0 meses", es que no hay más de un dato para medir su estancia).
    $spans = array();
    foreach ($por_alumno as $d) {
        $dias = (strtotime($d['ultima']) - strtotime($d['primera'])) / 86400;
        $spans[] = round($dias / 30.44, 1);
    }
    sort($spans);
    $n = count($spans);
    $media = $n ? round(array_sum($spans) / $n, 1) : 0;
    $mediana = $n ? $spans[intdiv($n, 2)] : 0;
    $con_mas_de_un_pago = count(array_filter($spans, function($s) { return $s > 0; }));

    // Bajas tras verano: de quien pagó en junio/julio/agosto de un año, cuántos no volvieron a
    // pagar en septiembre-diciembre de ese mismo año.
    $bajas_tras_verano = array();
    $activos_verano = array();
    $max_fecha = $rows ? end($rows)['fecha'] : null;
    foreach ($por_alumno as $clave => $d) {
        $anios_verano = array();
        foreach (array_keys($d['meses']) as $ym) {
            $mes_num = intval(substr($ym, 5, 2));
            if (in_array($mes_num, array(6, 7, 8), true)) $anios_verano[substr($ym, 0, 4)] = true;
        }
        foreach (array_keys($anios_verano) as $anio) {
            if (!isset($activos_verano[$anio])) $activos_verano[$anio] = 0;
            $activos_verano[$anio]++;
            $volvio = false;
            foreach (array_keys($d['meses']) as $ym) {
                if (substr($ym, 0, 4) === $anio && intval(substr($ym, 5, 2)) >= 9) { $volvio = true; break; }
            }
            if (!$volvio) {
                if (!isset($bajas_tras_verano[$anio])) $bajas_tras_verano[$anio] = 0;
                $bajas_tras_verano[$anio]++;
            }
        }
    }
    // Un año cuyo verano es reciente (el histórico todavía no llega a diciembre de ese año) no
    // ha tenido tiempo de que todos "vuelvan" todavía — contarlo igual que un año completo
    // infla las bajas de mentira. Se marca "incompleto" en vez de ocultarlo sin más.
    $anios_incompletos = array();
    foreach (array_keys($activos_verano) as $anio) {
        if (!$max_fecha || $max_fecha < "{$anio}-12-01") $anios_incompletos[$anio] = true;
    }

    $contar = function($por) {
        $out = array();
        foreach ($por as $clave => $meses) {
            $out[$clave] = array();
            foreach ($meses as $ym => $alumnos) $out[$clave][$ym] = count($alumnos);
        }
        return $out;
    };

    return rest_ensure_response(array('success' => true, 'data' => array(
        'permanenciaMeses' => array('media' => $media, 'mediana' => $mediana, 'alumnos' => $n, 'conMasDeUnPago' => $con_mas_de_un_pago),
        'bajasTrasVerano' => array('porAnio' => $bajas_tras_verano, 'activosVeranoPorAnio' => $activos_verano, 'aniosIncompletos' => array_keys($anios_incompletos)),
        'usoBonos' => array('total' => $bonos_total, 'alumnosUnicos' => count($bonos_alumnos), 'porMes' => $bonos_por_mes),
        'porProfesorMes' => $contar($por_profesor_mes),
        'porClaseMes' => $contar($por_clase_mes),
        'fuente' => 'HV',
    )));
}

function blokes_contactos_table()      { global $wpdb; return $wpdb->prefix . 'blokes_contactos'; }
function blokes_campanas_table()       { global $wpdb; return $wpdb->prefix . 'blokes_campanas'; }
function blokes_campana_envios_table() { global $wpdb; return $wpdb->prefix . 'blokes_campana_envios'; }
function blokes_campana_enlaces_table() { global $wpdb; return $wpdb->prefix . 'blokes_campana_enlaces'; }
function blokes_campana_clics_table()   { global $wpdb; return $wpdb->prefix . 'blokes_campana_clics'; }
function blokes_campana_conversiones_table() { global $wpdb; return $wpdb->prefix . 'blokes_campana_conversiones'; }

function blokes_ensure_campanas_tables() {
    global $wpdb;
    // Diagnóstico de cowork (1/11 09:15): el ALTER a utf8mb4 de las tablas no bastó, el emoji
    // seguía guardándose como "?". Las tablas ya están en utf8mb4, pero la CONEXIÓN de $wpdb
    // seguía negociando utf8 (3 bytes) — probablemente por `DB_CHARSET` en wp-config.php — así
    // que MySQL mutila el emoji ANTES de escribirlo; el charset de la tabla no puede salvar un
    // byte que ya llegó roto. `SET NAMES` fuerza la conexión de ESTA petición a utf8mb4 sin
    // tocar wp-config.php, y las dos propiedades siguientes son las que usa
    // `get_charset_collate()` para que el CREATE de abajo también salga en utf8mb4.
    $wpdb->query("SET NAMES utf8mb4");
    $wpdb->charset = 'utf8mb4';
    $wpdb->collate = 'utf8mb4_unicode_520_ci';
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE " . blokes_contactos_table() . " (
        id                  bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        telefono            varchar(15)   NOT NULL DEFAULT '',
        nombres             text          NOT NULL,
        saludo              varchar(60)   NOT NULL DEFAULT '',
        tipo                varchar(10)   NOT NULL DEFAULT 'adulto',
        origen              varchar(40)   NOT NULL DEFAULT '',
        email               varchar(190)  NOT NULL DEFAULT '',
        notas               text          NOT NULL,
        baja_mensajes       tinyint(1)    NOT NULL DEFAULT 0,
        baja_mensajes_fecha datetime      NULL,
        baja_mensajes_nota  text          NOT NULL,
        optin_whatsapp      varchar(5)    NULL     DEFAULT NULL,
        optin_fecha         datetime      NULL,
        optin_canal         varchar(30)   NOT NULL DEFAULT '',
        optin_texto         text          NOT NULL,
        optin_quien         varchar(100)  NOT NULL DEFAULT '',
        created_at          datetime      NOT NULL,
        updated_at          datetime      NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY telefono (telefono)
    ) {$charset};");
    dbDelta("CREATE TABLE " . blokes_campanas_table() . " (
        id                bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre            varchar(190) NOT NULL DEFAULT '',
        plantilla_adulto  text         NOT NULL,
        plantilla_menor   text         NOT NULL,
        remitente         varchar(60)  NOT NULL DEFAULT '',
        listas            varchar(100) NOT NULL DEFAULT '',
        fecha_fin         date         NULL,
        activa            tinyint(1)   NOT NULL DEFAULT 1,
        destino_enlace    varchar(255) NOT NULL DEFAULT '',
        created_at        datetime     NOT NULL,
        created_by        varchar(100) NOT NULL DEFAULT '',
        PRIMARY KEY (id)
    ) {$charset};");
    dbDelta("CREATE TABLE " . blokes_campana_envios_table() . " (
        id            bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        campana_id    bigint(20) UNSIGNED NOT NULL,
        contacto_id   bigint(20) UNSIGNED NOT NULL,
        enviado_at    datetime     NULL,
        enviado_por   varchar(100) NOT NULL DEFAULT '',
        respondio     tinyint(1)   NOT NULL DEFAULT 0,
        respondio_at  datetime     NULL,
        respondio_por varchar(100) NOT NULL DEFAULT '',
        baja          tinyint(1)   NOT NULL DEFAULT 0,
        baja_at       datetime     NULL,
        baja_por      varchar(100) NOT NULL DEFAULT '',
        apuntado      tinyint(1)   NOT NULL DEFAULT 0,
        apuntado_at   datetime     NULL,
        apuntado_por  varchar(100) NOT NULL DEFAULT '',
        updated_at    datetime     NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY campana_contacto (campana_id, contacto_id)
    ) {$charset};");

    // Migración única 0/1 → 'si'/NULL (31/10): antes de los tres estados, "0" solo significaba
    // "sin preguntar todavía", nunca un "no" expreso — así que se convierte en NULL, no en 'no'.
    if (!get_option('blokes_optin_whatsapp_tres_estados')) {
        global $wpdb;
        $wpdb->query("UPDATE " . blokes_contactos_table() . " SET optin_whatsapp = 'si' WHERE optin_whatsapp = '1'");
        $wpdb->query("UPDATE " . blokes_contactos_table() . " SET optin_whatsapp = NULL WHERE optin_whatsapp = '0' OR optin_whatsapp = ''");
        update_option('blokes_optin_whatsapp_tres_estados', 1, false);
    }

    // Migración única a utf8mb4 (1/11, cowork 08:10): estas tres tablas se crearon con un
    // charset de 3 bytes (utf8/utf8mb3), que no puede guardar emojis (👋, de 4 bytes) — MySQL
    // los sustituye por "?" al escribir. `dbDelta` no convierte el charset de una tabla que ya
    // existe, solo columnas/índices, así que hace falta este ALTER explícito una sola vez.
    // Los mensajes ya guardados con "?" no se pueden recuperar (el emoji original se perdió al
    // escribir): hay que volver a guardar esas plantillas después de este arreglo.
    if (!get_option('blokes_campanas_utf8mb4')) {
        global $wpdb;
        foreach (array(blokes_contactos_table(), blokes_campanas_table(), blokes_campana_envios_table()) as $tabla) {
            $wpdb->query("ALTER TABLE {$tabla} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci");
        }
        update_option('blokes_campanas_utf8mb4', 1, false);
    }

    // Trazabilidad de campañas (Ramiro, 11/11 05:35, prioridad 1: "lo hacemos a partir de
    // ahora" — lo ya enviado sin enlace no se puede medir). Un token por campaña+contacto; el
    // destino vive en la campaña (destino_enlace), no aquí, para que si se corrige se arregle
    // también en los enlaces ya generados.
    dbDelta("CREATE TABLE " . blokes_campana_enlaces_table() . " (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        token       varchar(10)  NOT NULL DEFAULT '',
        campana_id  bigint(20) UNSIGNED NOT NULL,
        contacto_id bigint(20) UNSIGNED NOT NULL,
        created_at  datetime     NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY token (token),
        UNIQUE KEY campana_contacto (campana_id, contacto_id)
    ) {$charset};");
    // Log de clics (no cuenta a los bots de vista previa de WhatsApp/Facebook, que abren el
    // enlace solos para hacer la tarjeta) — pensado para el embudo de Superadmin más adelante.
    dbDelta("CREATE TABLE " . blokes_campana_clics_table() . " (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        token       varchar(10)  NOT NULL DEFAULT '',
        dispositivo varchar(20)  NOT NULL DEFAULT '',
        repetido    tinyint(1)   NOT NULL DEFAULT 0,
        created_at  datetime     NOT NULL,
        PRIMARY KEY (id),
        KEY token (token)
    ) {$charset};");
    // Conversiones (partes B/C de la nota de trazabilidad): alta/pedido tras un clic con
    // cookie ("directa"), o mismo teléfono/email con alta nueva sin haber hecho clic
    // ("indirecta"); e instalación de la app para la campaña de la compe.
    dbDelta("CREATE TABLE " . blokes_campana_conversiones_table() . " (
        id          bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        campana_id  bigint(20) UNSIGNED NOT NULL,
        contacto_id bigint(20) UNSIGNED NOT NULL,
        tipo        varchar(20)  NOT NULL DEFAULT '',
        atribucion  varchar(10)  NOT NULL DEFAULT '',
        detalle     varchar(190) NOT NULL DEFAULT '',
        created_at  datetime     NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY campana_contacto_tipo (campana_id, contacto_id, tipo)
    ) {$charset};");

    // Destinos conocidos de hoy (Ramiro, 11/11 05:35) — solo rellena las campañas que ya
    // existen y todavía no tienen destino puesto, nunca sobreescribe uno editado a mano.
    if (!get_option('blokes_campanas_destinos_iniciales')) {
        global $wpdb;
        $wpdb->query("UPDATE " . blokes_campanas_table() . " SET destino_enlace = 'https://rocomadrid.com/club/actividades-para-socios/' WHERE id = 1 AND destino_enlace = ''");
        $wpdb->query("UPDATE " . blokes_campanas_table() . " SET destino_enlace = 'https://rocomadrid.com/app' WHERE id = 2 AND destino_enlace = ''");
        update_option('blokes_campanas_destinos_iniciales', 1, false);
    }
}

// Token de 6-8 caracteres para /c/{token} — uno por campaña+contacto, reutilizable (si ya
// existe, se devuelve el mismo en vez de crear otro).
function blokes_campana_enlace_token($campana_id, $contacto_id) {
    global $wpdb;
    $existente = $wpdb->get_var($wpdb->prepare(
        "SELECT token FROM " . blokes_campana_enlaces_table() . " WHERE campana_id = %d AND contacto_id = %d",
        $campana_id, $contacto_id
    ));
    if ($existente) return $existente;
    $alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789'; // sin 0/o/1/l/i, para que no se confundan al teclearlo a mano
    do {
        $token = '';
        for ($i = 0; $i < 7; $i++) $token .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
        $ya_existe = $wpdb->get_var($wpdb->prepare("SELECT id FROM " . blokes_campana_enlaces_table() . " WHERE token = %s", $token));
    } while ($ya_existe);
    $wpdb->insert(blokes_campana_enlaces_table(), array(
        'token' => $token, 'campana_id' => $campana_id, 'contacto_id' => $contacto_id, 'created_at' => current_time('mysql'),
    ));
    return $token;
}

// Busca campaña+contacto a partir de un token — lo usan /c/{token}, el checkout de WooCommerce
// y la instalación de la app. Asume que ya se está en el blog del Club (donde viven las tablas
// de campañas) cuando se llama.
function blokes_campana_enlace_por_token($token) {
    global $wpdb;
    return $wpdb->get_row($wpdb->prepare(
        "SELECT campana_id, contacto_id FROM " . blokes_campana_enlaces_table() . " WHERE token = %s", $token
    ), ARRAY_A);
}

// Registra una conversión una sola vez por campaña+contacto+tipo — la clave única de la tabla
// hace de guarda, así que llamarlo dos veces para lo mismo no duplica nada.
function blokes_campana_registrar_conversion($campana_id, $contacto_id, $tipo, $atribucion, $detalle = '') {
    global $wpdb;
    $wpdb->query($wpdb->prepare(
        "INSERT IGNORE INTO " . blokes_campana_conversiones_table() . " (campana_id, contacto_id, tipo, atribucion, detalle, created_at)
         VALUES (%d, %d, %s, %s, %s, %s)",
        $campana_id, $contacto_id, $tipo, $atribucion, $detalle, current_time('mysql')
    ));
}

// Parte B de la trazabilidad (Ramiro, 11/11 05:35): si quien acaba de pagar llegó con la
// cookie de una campaña, se registra como conversión "directa" de tipo "pedido". El checkout
// vive en el Club (blog 3), igual que las tablas de campañas — no hace falta switch_to_blog.
add_action('woocommerce_checkout_order_processed', function($order_id, $posted_data, $order) {
    if (empty($_COOKIE['roco_cmp'])) return;
    $token = sanitize_text_field($_COOKIE['roco_cmp']);
    blokes_ensure_campanas_tables();
    $enlace = blokes_campana_enlace_por_token($token);
    if (!$enlace) return;
    blokes_campana_registrar_conversion(
        intval($enlace['campana_id']), intval($enlace['contacto_id']), 'pedido', 'directa', 'pedido #' . $order_id
    );
}, 30, 3);

// /c/{token} — público, sin login: registra el clic (salvo que sea el bot de vista previa de
// WhatsApp/Facebook, que abre el enlace solo para construir la tarjeta del mensaje) y redirige
// al destino de la campaña con utm_source/utm_campaign. Prioridad 0, igual que /app — sin esto
// WordPress marca la URL como 404 en parse_request y el redirect no llega a dispararse.
add_action('template_redirect', function() {
    $path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    if (!preg_match('#^c/([A-Za-z0-9]{6,8})$#', $path, $m)) return;
    $token = $m[1];

    // /c/ vive en el sitio Principal (blog 1, para que el enlace sea corto), pero las tablas
    // de campañas son del Club (blog 3) — todo lo que las llama viene siempre de
    // /club/wp-json/... (cowork, 11/11 06:55: sin este switch_to_blog, aquí se consultaban las
    // tablas del blog 1, que están vacías, y el token "nunca se encontraba").
    switch_to_blog(3);
    blokes_ensure_campanas_tables();
    global $wpdb;
    $enlace = $wpdb->get_row($wpdb->prepare(
        "SELECT campana_id FROM " . blokes_campana_enlaces_table() . " WHERE token = %s", $token
    ), ARRAY_A);
    if (!$enlace) {
        restore_current_blog();
        wp_safe_redirect(home_url('/'), 302);
        exit;
    }

    $campana = $wpdb->get_row($wpdb->prepare(
        "SELECT nombre, destino_enlace FROM " . blokes_campanas_table() . " WHERE id = %d", intval($enlace['campana_id'])
    ), ARRAY_A);
    $destino = ($campana && $campana['destino_enlace']) ? $campana['destino_enlace'] : get_home_url(1, '/');

    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : '';
    $es_bot_vista_previa = (bool) preg_match('#WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot#i', $ua);
    if (!$es_bot_vista_previa) {
        $repetido = isset($_COOKIE['roco_cmp']) ? 1 : 0;
        setcookie('roco_cmp', $token, time() + 60 * DAY_IN_SECONDS, '/', '', is_ssl(), true);
        $dispositivo = preg_match('#Mobi|Android|iPhone|iPad#i', $ua) ? 'movil' : 'escritorio';
        $wpdb->insert(blokes_campana_clics_table(), array(
            'token' => $token, 'dispositivo' => $dispositivo, 'repetido' => $repetido, 'created_at' => current_time('mysql'),
        ));
    }
    restore_current_blog();

    $slug = $campana ? sanitize_title($campana['nombre']) : 'campana';
    $sep  = (strpos($destino, '?') !== false) ? '&' : '?';
    wp_safe_redirect($destino . $sep . 'utm_source=whatsapp&utm_campaign=' . $slug, 302);
    exit;
}, 0);

// Última suscripción relevante de cada teléfono: gana la más "fuerte" (en vigor > de baja a
// fin de mes > cancelada), para no clasificar mal a quien tiene varias suscripciones viejas.
// `$s['telefono']` de blokes_get_all_subscription_data() es solo `get_billing_phone()` — vacío en
// altas manuales con el teléfono metido en el email de relleno ("6xxxxxxxx@rocomadrid.com") en
// vez de en el campo de verdad (NOTAS_PARA_CODE_whatsapp.md, 3/11 16:10: 7 alumnos actuales no se
// detectaban como "ya en vigor" en una campaña de "antiguos", y les habría llegado ese mensaje).
// Mismo fallback que ya usa Grupos: email de relleno → teléfono del perfil de WordPress.
function blokes_campanas_subs_por_telefono() {
    $prioridad = array('active' => 3, 'on-hold' => 3, 'pending' => 3, 'pending-cancel' => 2, 'cancelled' => 1);
    $por_tel = array();
    foreach (blokes_get_all_subscription_data() as $s) {
        // El array de blokes_get_all_subscription_data() trae 'telefono' de
        // RocoMadrid_SF_Stats (plugin de terceros), que lo deja vacío para la mayoría de altas
        // aunque la propia suscripción SÍ tenga billing_phone (cowork, 3/11 18:50: de 388 solo 1
        // "directo"). El resto del código (Grupos, blokes_gestion_grupos) ya resuelve esto
        // llamando a wcs_get_subscription()->get_billing_phone() en vez de fiarse de ese campo
        // cacheado — mismo camino aquí, con el mismo orden de respaldo que allí.
        $tel = '';
        if (function_exists('wcs_get_subscription')) {
            $sub_obj = wcs_get_subscription(intval($s['id'] ?? 0));
            if ($sub_obj) $tel = blokes_externos_normaliza_telefono($sub_obj->get_billing_phone());
        }
        if ($tel === '') {
            $tel = blokes_externos_normaliza_telefono($s['telefono'] ?? '');
        }
        if ($tel === '') {
            $tel = blokes_externos_normaliza_telefono(blokes_telefono_de_email($s['email'] ?? ''));
        }
        if ($tel === '') {
            $uid = intval(get_post_meta(intval($s['id'] ?? 0), '_customer_user', true));
            if ($uid) $tel = blokes_externos_normaliza_telefono(get_user_meta($uid, 'billing_phone', true));
        }
        if ($tel === '') continue;
        $p = $prioridad[$s['status'] ?? ''] ?? 0;
        if (!isset($por_tel[$tel]) || $p > $por_tel[$tel]['_prioridad']) {
            $s['_prioridad'] = $p;
            $por_tel[$tel] = $s;
        }
    }
    return $por_tel;
}

// Igual que blokes_campanas_subs_por_telefono() (mismo criterio de teléfono/prioridad) pero
// guarda TODOS los candidatos de cada teléfono, no solo "el mejor" — Sync Grupos necesita verlos
// todos para poder desambiguar por nombre cuando una familia comparte número
// (blokes_sync_grupos_emparejar(), cowork 06/11 15:55). También guarda el nombre de facturación
// real de cada suscripción (más de fiar que el nombre de la cuenta — mismo criterio que Grupos).
function blokes_sync_grupos_subs_por_telefono() {
    $prioridad = array('active' => 3, 'on-hold' => 3, 'pending' => 3, 'pending-cancel' => 2, 'cancelled' => 1);
    $por_tel = array();
    foreach (blokes_get_all_subscription_data() as $s) {
        $sub_obj = function_exists('wcs_get_subscription') ? wcs_get_subscription(intval($s['id'] ?? 0)) : null;
        $tel = $sub_obj ? blokes_externos_normaliza_telefono($sub_obj->get_billing_phone()) : '';
        if ($tel === '') $tel = blokes_externos_normaliza_telefono($s['telefono'] ?? '');
        if ($tel === '') $tel = blokes_externos_normaliza_telefono(blokes_telefono_de_email($s['email'] ?? ''));
        if ($tel === '') {
            $uid = intval(get_post_meta(intval($s['id'] ?? 0), '_customer_user', true));
            if ($uid) $tel = blokes_externos_normaliza_telefono(get_user_meta($uid, 'billing_phone', true));
        }
        if ($tel === '') continue;
        $nombre_fact = $sub_obj ? trim($sub_obj->get_billing_first_name() . ' ' . $sub_obj->get_billing_last_name()) : '';
        $s['_nombre_fact'] = $nombre_fact !== '' ? $nombre_fact : ($s['cliente'] ?? '');
        $s['_prioridad'] = $prioridad[$s['status'] ?? ''] ?? 0;
        $por_tel[$tel][] = $s;
    }
    return $por_tel;
}

function blokes_campanas_externos_por_telefono() {
    $por_tel = array();
    foreach (blokes_externos_todos() as $e) {
        $tel = blokes_externos_normaliza_telefono($e['telefono'] ?? '');
        if ($tel !== '') $por_tel[$tel] = $e;
    }
    return $por_tel;
}

// Teléfono → consentimiento de WhatsApp ('si'/'no'/null), en una sola consulta — para la marca
// (WA) de Grupos (31/10, NOTAS_PARA_CODE_grupos_como_excel.md) sin mirar la tabla de contactos
// fila a fila.
function blokes_optin_por_telefono() {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $por_tel = array();
    $rows = $wpdb->get_results("SELECT telefono, optin_whatsapp FROM " . blokes_contactos_table() . " WHERE optin_whatsapp IS NOT NULL", ARRAY_A);
    foreach ($rows as $r) {
        $tel = blokes_externos_normaliza_telefono($r['telefono']);
        if ($tel !== '') $por_tel[$tel] = $r['optin_whatsapp'];
    }
    return $por_tel;
}

// Consentimiento de WhatsApp, con TRES estados (31/10, Ramiro 17:17): null = sin preguntar ·
// 'si' · 'no'. No marcar la casilla del checkout no es un "no" — sigue null, solo es "no" si lo
// dice expresamente (o pide BAJA). Se registra en dos sitios — el user meta (si hay un usuario
// de WordPress detrás) y la fila de `wp_blokes_contactos` por teléfono (para que Campañas lo vea
// sin depender de que esa persona tenga cuenta). $telefono puede venir vacío (p. ej. un usuario
// sin billing_phone); en ese caso solo se guarda en el user meta.
// El contacto solo guarda el estado ACTUAL (se sobrescribe en cada alta/retirada); el histórico
// completo — cuándo y con qué texto se dio o se retiró cada vez — queda aparte en
// `blokes_gestion_log` (RGPD: tiene que poder reconstruirse aunque hoy esté retirado).
function blokes_registrar_optin_whatsapp($telefono, $user_id, $valor, $canal, $texto, $quien, $nombre_si_nuevo = '') {
    $valor = in_array($valor, array('si', 'no'), true) ? $valor : null;
    $tel = blokes_externos_normaliza_telefono((string) $telefono);
    $ahora = current_time('mysql');

    $antes_user = $user_id ? get_user_meta($user_id, 'optin_whatsapp', true) : null;
    if ($user_id) {
        if ($valor) {
            update_user_meta($user_id, 'optin_whatsapp', $valor);
            update_user_meta($user_id, 'optin_whatsapp_fecha', $ahora);
            update_user_meta($user_id, 'optin_whatsapp_canal', $canal);
        } else {
            delete_user_meta($user_id, 'optin_whatsapp');
        }
    }

    $antes_contacto = null;
    if ($tel !== '') {
        blokes_ensure_campanas_tables();
        global $wpdb;
        $existente = $wpdb->get_row($wpdb->prepare(
            "SELECT id, optin_whatsapp FROM " . blokes_contactos_table() . " WHERE telefono = %s", $tel
        ), ARRAY_A);
        $antes_contacto = $existente ? $existente['optin_whatsapp'] : null;
        $campos = array(
            'optin_whatsapp' => $valor, 'optin_fecha' => $ahora, 'optin_canal' => $canal,
            'optin_texto' => $texto, 'optin_quien' => $quien, 'updated_at' => $ahora,
        );
        if ($existente) {
            $wpdb->update(blokes_contactos_table(), $campos, array('id' => $existente['id']));
        } else {
            $wpdb->insert(blokes_contactos_table(), array_merge($campos, array(
                'telefono' => $tel, 'nombres' => wp_json_encode(array_filter(array($nombre_si_nuevo)) ?: array('(sin nombre)')),
                'origen' => 'optin', 'created_at' => $ahora,
            )));
        }
    }

    blokes_gestion_log(0, 'optin_whatsapp',
        array('optinWhatsapp' => $antes_contacto ?? ($antes_user ?: null)),
        array('optinWhatsapp' => $valor),
        array('telefono' => $tel, 'userId' => $user_id, 'canal' => $canal, 'texto' => $texto, 'quien' => $quien)
    );
}

const BLOKES_OPTIN_WHATSAPP_TEXTO = 'Acepto recibir avisos y promociones de RocoMadrid por WhatsApp. Puedo darme de baja cuando quiera respondiendo BAJA.';

// Casilla de consentimiento en el checkout clásico de WooCommerce (31/10, fase b). Desmarcada
// por defecto (RGPD: nada premarcado). El checkout de este sitio es el clásico (ver
// rocomadrid-step-form/includes/class-checkout-fields.php, el mismo hook que usa ese plugin
// para su propio checkbox), no el de bloques.
add_action('woocommerce_checkout_after_terms_and_conditions', 'blokes_render_optin_whatsapp_checkbox');
function blokes_render_optin_whatsapp_checkbox() {
    woocommerce_form_field('optin_whatsapp', array(
        'type' => 'checkbox', 'class' => array('form-row-wide'),
        'label' => BLOKES_OPTIN_WHATSAPP_TEXTO, 'required' => false,
    ), WC()->checkout->get_value('optin_whatsapp'));
}
// HPOS está activado en este sitio (los pedidos no son post de WordPress): guardar el estado en
// el propio pedido tiene que ir por `$order->update_meta_data()` + `save()` (o, como aquí,
// dejando que WooCommerce lo guarde solo al crear el pedido), nunca por `update_post_meta()`,
// que con HPOS no escribe en ningún sitio que WooCommerce luego lea.
add_action('woocommerce_checkout_create_order', 'blokes_save_optin_whatsapp_checkout', 20, 2);
function blokes_save_optin_whatsapp_checkout($order, $data) {
    $marcado = !empty($_POST['optin_whatsapp']);
    $order->update_meta_data('_optin_whatsapp', $marcado ? '1' : '0');
}
add_action('woocommerce_checkout_order_processed', 'blokes_registrar_optin_whatsapp_checkout', 20, 3);
function blokes_registrar_optin_whatsapp_checkout($order_id, $posted_data, $order) {
    if (!$order || $order->get_meta('_optin_whatsapp') !== '1') return; // RGPD: no marcada = sigue "sin preguntar" (null), nunca se registra como "no"
    blokes_registrar_optin_whatsapp(
        $order->get_billing_phone(), $order->get_customer_id(), 'si', 'checkout',
        BLOKES_OPTIN_WHATSAPP_TEXTO, 'checkout pedido #' . $order_id,
        trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name())
    );
}

// 'actuales' | 'nuevos' | 'antiguos' | null (no se sabe: ni suscripción, ni externo, ni origen
// reconocible — no entra en ninguna campaña hasta que alguien lo revise a mano).
// Fecha del último pago de verdad (pedido padre o cualquier renovación), para distinguir un
// "on-hold" de impago reciente (seguramente recuperable solo) de uno viejo (ya no viene). Mismo
// patrón que usa superadmin_gestion_grupos() para la fecha de cada pago.
function blokes_campanas_ultimo_pago_ts($sub_obj) {
    $ids = array_merge(array($sub_obj->get_parent_id()), $sub_obj->get_related_orders('ids', 'renewal'));
    $mejor = 0;
    foreach ($ids as $oid) {
        if (!$oid) continue;
        $order = wc_get_order($oid);
        if (!$order) continue;
        $fecha = $order->get_date_paid() ?: $order->get_date_created();
        if ($fecha && $fecha->getTimestamp() > $mejor) $mejor = $fecha->getTimestamp();
    }
    return $mejor;
}

// 'actuales' | 'nuevos' | 'en_espera' | 'antiguos' | null (no se sabe: no entra en ninguna
// campaña hasta que alguien lo revise a mano).
function blokes_campanas_clasificar($telefono, $subs_por_tel, $externos_por_tel, $contacto, $dias_nuevo = 60) {
    $sub = $subs_por_tel[$telefono] ?? null;
    $ext = $externos_por_tel[$telefono] ?? null;

    if ($sub && in_array($sub['status'], array('active', 'on-hold', 'pending'), true)) {
        $sub_obj = !empty($sub['id']) ? wcs_get_subscription(intval($sub['id'])) : null;

        // "on-hold" en esta web es casi siempre impago, no una pausa de verdad (esa guarda
        // _rm_pausa_motivo aparte — mismo criterio que el estado "en_espera" de Grupos). Siempre
        // "en_espera" mientras siga on-hold sin cancelar, sin importar cuánto lleve impagado —
        // antes, a partir de 45 días pasaba a "antiguos", pero más abajo (destinatarios) a esta
        // misma persona ya se la contaba "yaEnVigor" por seguir on-hold, así que quedaba
        // "antiguos" + "yaEnVigor" a la vez: en una campaña de antiguos no se le mandaba nada (el
        // filtro de yaEnVigor ya la tapaba) pero tampoco entraba en una campaña de en_espera,
        // donde Ramiro SÍ la quiere (cowork, 09/11 11:40 — 16 alumnos de Grupos en impago largo,
        // "los quiere dentro" de la campaña #2). Si de verdad se cancela, pasa a 'cancelled' o
        // 'pending-cancel' más abajo y ahí sí es "antiguos".
        if ($sub['status'] === 'on-hold' && $sub_obj && !get_post_meta($sub_obj->get_id(), '_rm_pausa_motivo', true)) {
            return 'en_espera';
        }

        $alta_ts = false;
        if ($sub_obj) {
            $fc = $sub_obj->get_date('date_created');
            if ($fc) $alta_ts = strtotime($fc);
        }
        $dias = $alta_ts ? (time() - $alta_ts) / DAY_IN_SECONDS : 9999;
        return $dias <= $dias_nuevo ? 'nuevos' : 'actuales';
    }
    if ($ext) return 'actuales';
    if ($sub && in_array($sub['status'], array('cancelled', 'pending-cancel'), true)) return 'antiguos';
    // Nada en vigor ahora mismo: un "interesado" (nunca fue alumno) va a nuevos. Si el origen
    // apunta a que alguna vez estuvo en clases (antiguo, o "actuales" de la carga inicial que ya
    // no tiene suscripción ni externo en vigor), se trata como antiguos — no se queda "sin
    // clasificar" solo porque su origen literal no contenga la palabra "antiguo". Un contacto sin
    // ninguna pista (alta por opt-in o a mano, sin más dato) sí se deja sin clasificar.
    $origen = (string) ($contacto['origen'] ?? '');
    if (strpos($origen, 'interesado') !== false) return 'nuevos';
    if ($origen === '' || $origen === 'optin' || $origen === 'manual') return null;
    return 'antiguos';
}

// Alta/importación de contactos: subida desde el navegador (xlsx/CSV parseado en cliente), o la
// bandeja de "Grupos" cuando Eva marca un consentimiento a mano más adelante (fase b). Fusiona
// por teléfono: si ya existe, añade los nombres nuevos a los que ya tenía (no los sustituye) y
// solo rellena los campos que vengan informados.
function superadmin_campanas_importar_contactos($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $body    = $request->get_json_params();
    $filas   = is_array($body['filas'] ?? null) ? $body['filas'] : array();
    $simular = !empty($body['simular']);
    if (count($filas) > 1000) return new WP_Error('too_many', 'Máximo 1000 filas de golpe.', array('status' => 400));

    $subs_por_tel     = $simular ? blokes_campanas_subs_por_telefono()     : array();
    $externos_por_tel = $simular ? blokes_campanas_externos_por_telefono() : array();

    $nuevos = 0; $actualizados = 0; $sin_telefono = 0;
    $resumen_listas = array('actuales' => 0, 'nuevos' => 0, 'en_espera' => 0, 'antiguos' => 0, 'sin_clasificar' => 0);
    $vista_previa = array();
    foreach ($filas as $raw) {
        $tel = blokes_externos_normaliza_telefono($raw['telefono'] ?? '');
        if ($tel === '') { $sin_telefono++; continue; }
        $nombres_in = is_array($raw['nombres'] ?? null) ? $raw['nombres'] : array_filter(array((string) ($raw['nombre'] ?? '')));
        $nombres_in = array_values(array_unique(array_filter(array_map('sanitize_text_field', $nombres_in))));
        $tipo    = in_array($raw['tipo'] ?? '', array('adulto', 'menor', 'mixto'), true) ? $raw['tipo'] : 'adulto';
        $origen  = sanitize_text_field((string) ($raw['origen'] ?? 'manual'));
        $email   = sanitize_email((string) ($raw['email'] ?? ''));
        $notas   = sanitize_textarea_field((string) ($raw['notas'] ?? ''));
        $saludo  = sanitize_text_field((string) ($raw['saludo'] ?? ''));

        $existente = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . blokes_contactos_table() . " WHERE telefono = %s", $tel
        ), ARRAY_A);

        if ($simular) {
            $lista = blokes_campanas_clasificar($tel, $subs_por_tel, $externos_por_tel, array('origen' => $origen));
            $resumen_listas[$lista ?: 'sin_clasificar']++;
            if ($existente) $actualizados++; else $nuevos++;
            if (count($vista_previa) < 50) {
                $vista_previa[] = array('telefono' => $tel, 'nombres' => $nombres_in, 'accion' => $existente ? 'actualizaria' : 'nuevo', 'lista' => $lista ?: 'sin_clasificar');
            }
            continue;
        }

        if ($existente) {
            $nombres_antes = json_decode($existente['nombres'], true);
            if (!is_array($nombres_antes)) $nombres_antes = array_filter(array($nombres_antes));
            $nombres = array_values(array_unique(array_merge($nombres_antes, $nombres_in)));
            $wpdb->update(blokes_contactos_table(), array(
                'nombres'    => wp_json_encode($nombres),
                'saludo'     => $saludo ?: $existente['saludo'],
                'tipo'       => $tipo !== 'adulto' ? $tipo : $existente['tipo'],
                'email'      => $email ?: $existente['email'],
                'notas'      => $notas ?: $existente['notas'],
                'updated_at' => current_time('mysql'),
            ), array('id' => $existente['id']));
            $actualizados++;
        } else {
            $wpdb->insert(blokes_contactos_table(), array(
                'telefono' => $tel, 'nombres' => wp_json_encode($nombres_in ?: array('(sin nombre)')), 'saludo' => $saludo,
                'tipo' => $tipo, 'origen' => $origen, 'email' => $email, 'notas' => $notas,
                'created_at' => current_time('mysql'), 'updated_at' => current_time('mysql'),
            ));
            $nuevos++;
        }
    }
    $data = array('nuevos' => $nuevos, 'actualizados' => $actualizados, 'sinTelefono' => $sin_telefono);
    if ($simular) { $data['simulado'] = true; $data['porLista'] = $resumen_listas; $data['vistaPrevia'] = $vista_previa; }
    return rest_ensure_response(array('success' => true, 'data' => $data));
}

function blokes_campanas_contacto_fila($c, $subs_por_tel, $externos_por_tel) {
    $tel = blokes_externos_normaliza_telefono($c['telefono']);
    $nombres = json_decode($c['nombres'], true);
    if (!is_array($nombres)) $nombres = array_filter(array($nombres));
    return array(
        'id' => intval($c['id']), 'telefono' => $tel, 'nombres' => $nombres, 'saludo' => $c['saludo'] ?? '', 'tipo' => $c['tipo'],
        'origen' => $c['origen'], 'email' => $c['email'], 'notas' => $c['notas'],
        'bajaMensajes' => (bool) $c['baja_mensajes'], 'optinWhatsapp' => $c['optin_whatsapp'] ?: null,
        'lista' => $c['baja_mensajes'] ? 'bajas' : blokes_campanas_clasificar($tel, $subs_por_tel, $externos_por_tel, $c),
    );
}

// GET /campanas/contactos?lista=actuales|nuevos|antiguos|bajas|sin_clasificar|all&tipo=adulto|menor|all
function superadmin_campanas_listar_contactos($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $lista = sanitize_key($request->get_param('lista') ?: 'all');
    $tipo  = sanitize_key($request->get_param('tipo')  ?: 'all');

    $subs_por_tel     = blokes_campanas_subs_por_telefono();
    $externos_por_tel = blokes_campanas_externos_por_telefono();

    $rows = $wpdb->get_results("SELECT * FROM " . blokes_contactos_table() . " ORDER BY updated_at DESC", ARRAY_A);
    $out  = array();
    $resumen = array('actuales' => 0, 'nuevos' => 0, 'en_espera' => 0, 'antiguos' => 0, 'bajas' => 0, 'sin_clasificar' => 0);
    // Consentimiento de WhatsApp (tres estados), aparte de la lista: sí / no / sin preguntar.
    $resumenOptin = array('si' => 0, 'no' => 0, 'sin_preguntar' => 0);
    foreach ($rows as $c) {
        $fila = blokes_campanas_contacto_fila($c, $subs_por_tel, $externos_por_tel);
        $clave = $fila['lista'] ?: 'sin_clasificar';
        $resumen[$clave] = ($resumen[$clave] ?? 0) + 1;
        $resumenOptin[$fila['optinWhatsapp'] ?: 'sin_preguntar']++;
        if ($lista !== 'all' && $clave !== $lista) continue;
        if ($tipo !== 'all' && $fila['tipo'] !== $tipo) continue;
        $out[] = $fila;
    }
    return rest_ensure_response(array('success' => true, 'data' => array('contactos' => $out, 'resumen' => $resumen, 'resumenOptin' => $resumenOptin)));
}

// DELETE /campanas/contactos/{id} — quitar un contacto de verdad (p. ej. uno de prueba que se
// coló en una importación real, NOTAS_PARA_CODE_whatsapp.md 3/11 16:10). Borra también sus
// envíos de campañas para no dejar filas huérfanas.
function superadmin_campanas_borrar_contacto($request) {
    global $wpdb;
    $id = intval($request['id']);
    $wpdb->delete(blokes_campana_envios_table(), array('contacto_id' => $id), array('%d'));
    $wpdb->delete(blokes_contactos_table(), array('id' => $id), array('%d'));
    return rest_ensure_response(array('success' => true));
}

// GET /campanas/envios-hoy — para el aviso de ritmo (WhatsApp bloquea números que mandan
// cientos de golpe): cuenta los "enviado" de hoy, de cualquier campaña.
function superadmin_campanas_envios_hoy($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $hoy = current_time('Y-m-d');
    $n = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM " . blokes_campana_envios_table() . " WHERE DATE(enviado_at) = %s", $hoy
    ));
    return rest_ensure_response(array('success' => true, 'data' => array('enviadosHoy' => $n, 'aviso' => $n >= 40)));
}

function superadmin_campanas_listar($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $rows = $wpdb->get_results("SELECT * FROM " . blokes_campanas_table() . " ORDER BY id DESC", ARRAY_A);
    $out = array();
    foreach ($rows as $r) {
        $stats = $wpdb->get_row($wpdb->prepare(
            "SELECT COUNT(*) total, SUM(enviado_at IS NOT NULL) enviados, SUM(respondio) respondidos, SUM(baja) bajas, SUM(apuntado) apuntados
             FROM " . blokes_campana_envios_table() . " WHERE campana_id = %d", $r['id']
        ), ARRAY_A);
        // Mínimo pedido por cowork (11/11 07:30) antes de montar el embudo completo (partes
        // B-D): clics únicos, para ver hoy mismo si los envíos de las 10:00 se abren. "Único" =
        // destinatarios distintos que han hecho clic al menos una vez, no clics totales.
        $clics_unicos = intval($wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT cl.token) FROM " . blokes_campana_clics_table() . " cl
             JOIN " . blokes_campana_enlaces_table() . " en ON en.token = cl.token
             WHERE en.campana_id = %d", $r['id']
        )));
        // Parte D (mínima): conversiones directas + indirectas, por destinatario distinto
        // (partes B/C). Recuentos, nunca importes en euros (cowork, 11/11 05:35).
        $conversiones = $wpdb->get_row($wpdb->prepare(
            "SELECT COUNT(*) total, SUM(atribucion = 'directa') directas, SUM(atribucion = 'indirecta') indirectas
             FROM " . blokes_campana_conversiones_table() . " WHERE campana_id = %d", $r['id']
        ), ARRAY_A);
        $out[] = array(
            'id' => intval($r['id']), 'nombre' => $r['nombre'],
            'plantillaAdulto' => $r['plantilla_adulto'], 'plantillaMenor' => $r['plantilla_menor'],
            'remitente' => $r['remitente'], 'listas' => array_filter(explode(',', $r['listas'])),
            'destinoEnlace' => $r['destino_enlace'] ?: '',
            'fechaFin' => $r['fecha_fin'], 'activa' => (bool) $r['activa'], 'createdAt' => $r['created_at'],
            'enviados' => intval($stats['enviados'] ?? 0), 'respondidos' => intval($stats['respondidos'] ?? 0),
            'bajas' => intval($stats['bajas'] ?? 0), 'apuntados' => intval($stats['apuntados'] ?? 0),
            'clicsUnicos' => $clics_unicos,
            'conversiones' => intval($conversiones['total'] ?? 0),
            'conversionesDirectas' => intval($conversiones['directas'] ?? 0),
            'conversionesIndirectas' => intval($conversiones['indirectas'] ?? 0),
        );
    }
    return rest_ensure_response(array('success' => true, 'data' => $out));
}

function superadmin_campanas_crear($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $body = $request->get_json_params();
    $nombre = sanitize_text_field((string) ($body['nombre'] ?? ''));
    $listas = is_array($body['listas'] ?? null) ? array_intersect($body['listas'], array('actuales', 'nuevos', 'en_espera', 'antiguos')) : array();
    if ($nombre === '' || empty($listas)) {
        return new WP_Error('bad_request', 'Falta el nombre o la lista (actuales/nuevos/antiguos).', array('status' => 400));
    }
    $u = wp_get_current_user();
    $wpdb->insert(blokes_campanas_table(), array(
        'nombre' => $nombre,
        'plantilla_adulto' => sanitize_textarea_field((string) ($body['plantillaAdulto'] ?? '')),
        'plantilla_menor'  => sanitize_textarea_field((string) ($body['plantillaMenor']  ?? '')),
        'remitente' => sanitize_text_field((string) ($body['remitente'] ?? '')),
        'listas' => implode(',', $listas),
        'fecha_fin' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($body['fechaFin'] ?? '')) ? $body['fechaFin'] : null,
        'destino_enlace' => esc_url_raw((string) ($body['destinoEnlace'] ?? '')),
        'activa' => 1, 'created_at' => current_time('mysql'), 'created_by' => $u ? $u->user_login : '',
    ));
    return rest_ensure_response(array('success' => true, 'data' => array('id' => $wpdb->insert_id)));
}

// PUT /campanas/{id} — editar nombre/plantillas/remitente/listas/fecha fin, o archivar
// (`activa: false`, para que deje de aparecer para enviar sin perder el historial de envíos).
function superadmin_campanas_editar($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $id = intval($request['id']);
    $actual = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . blokes_campanas_table() . " WHERE id = %d", $id), ARRAY_A);
    if (!$actual) return new WP_Error('not_found', 'Campaña no encontrada.', array('status' => 404));

    $body = $request->get_json_params();
    $campos = array();
    if (isset($body['nombre'])) $campos['nombre'] = sanitize_text_field((string) $body['nombre']);
    if (isset($body['plantillaAdulto'])) $campos['plantilla_adulto'] = sanitize_textarea_field((string) $body['plantillaAdulto']);
    if (isset($body['plantillaMenor']))  $campos['plantilla_menor']  = sanitize_textarea_field((string) $body['plantillaMenor']);
    if (isset($body['remitente'])) $campos['remitente'] = sanitize_text_field((string) $body['remitente']);
    if (isset($body['destinoEnlace'])) $campos['destino_enlace'] = esc_url_raw((string) $body['destinoEnlace']);
    if (isset($body['listas'])) {
        $listas = is_array($body['listas']) ? array_intersect($body['listas'], array('actuales', 'nuevos', 'en_espera', 'antiguos')) : array();
        if (empty($listas)) return new WP_Error('bad_request', 'Elige al menos una lista.', array('status' => 400));
        $campos['listas'] = implode(',', $listas);
    }
    if (array_key_exists('fechaFin', $body)) {
        $campos['fecha_fin'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $body['fechaFin']) ? $body['fechaFin'] : null;
    }
    if (isset($body['activa'])) $campos['activa'] = !empty($body['activa']) ? 1 : 0;
    if (empty($campos)) return new WP_Error('bad_request', 'Nada que actualizar.', array('status' => 400));

    $wpdb->update(blokes_campanas_table(), $campos, array('id' => $id));
    return rest_ensure_response(array('success' => true));
}

// Ramiro 12/11 12:40/12:47 — BUG: un mismo teléfono con "Carlos Rodriguez" y "Carlos" (el
// nombre completo del Excel y el nombre de pila de otro registro de LA MISMA persona, no un
// hermano) salía como "¡Hola Carlos Rodriguez y Carlos!". Mismo lío con un alias de WhatsApp
// junto al nombre real ("daniferro" + "Álvaro"). Si los dos nombres son la misma persona,
// devuelve el "bueno" a usar en el saludo (el nombre de pila, o el que no sea un alias); si
// parecen dos personas de verdad (hermanos), devuelve null.
function blokes_campanas_mismo_nombre($a, $b) {
    $na = mb_strtolower(remove_accents(trim($a)));
    $nb = mb_strtolower(remove_accents(trim($b)));
    if ($na === '' || $nb === '') return $na === '' ? $b : $a;
    if ($na === $nb) return $a;

    $palabras_a = preg_split('/\s+/', trim($a));
    $palabras_b = preg_split('/\s+/', trim($b));
    $primera_a = mb_strtolower(remove_accents($palabras_a[0]));
    $primera_b = mb_strtolower(remove_accents($palabras_b[0]));
    // Mismo nombre de pila: uno es "Nombre Apellido(s)" del Excel y el otro, de otro registro
    // del mismo teléfono, solo "Nombre" — el "bueno" para el saludo es el de una sola palabra.
    if ($primera_a === $primera_b) {
        if (count($palabras_a) === 1 && count($palabras_b) > 1) return $a;
        if (count($palabras_b) === 1 && count($palabras_a) > 1) return $b;
        return $a;
    }
    // Alias de WhatsApp (todo en minúsculas, sin espacios — "daniferro") junto al nombre real
    // del mismo teléfono: el "bueno" es el que no parece un alias.
    $es_alias = function($s) { $s = trim($s); return $s !== '' && $s === mb_strtolower($s) && strpos($s, ' ') === false; };
    if ($es_alias($a) && !$es_alias($b)) return $b;
    if ($es_alias($b) && !$es_alias($a)) return $a;
    return null; // no hay indicio de que sean la misma persona — hermanos de verdad
}

// Reduce la lista de nombres de un teléfono a la que de verdad hace falta para el saludo,
// fusionando los que blokes_campanas_mismo_nombre() reconoce como la misma persona (puede haber
// más de un registro duplicado, no solo dos) antes de juntar con " y " a los hermanos que de
// verdad lo son.
function blokes_campanas_nombre_saludo($nombres) {
    $nombres = array_values(array_filter(array_map('trim', (array) $nombres), function($n) { return $n !== ''; }));
    if (count($nombres) <= 1) return $nombres[0] ?? '';

    $reducido = array($nombres[0]);
    for ($i = 1; $i < count($nombres); $i++) {
        $actual = $nombres[$i];
        $fusionado = false;
        foreach ($reducido as $j => $existente) {
            $mejor = blokes_campanas_mismo_nombre($existente, $actual);
            if ($mejor !== null) { $reducido[$j] = $mejor; $fusionado = true; break; }
        }
        if (!$fusionado) $reducido[] = $actual;
    }
    return count($reducido) > 1 ? implode(' y ', array_slice($reducido, 0, 2)) : $reducido[0];
}

// El saludo (nombre de pila elegido a mano, p. ej. de la carga inicial del xlsx) tiene
// preferencia sobre el nombre completo del Excel para el "Hola {nombre}!" — es el que se usa
// de verdad en los mensajes que ya escribió Ramiro.
function blokes_campanas_personalizar($plantilla, $nombres, $remitente, $saludo = '', $campana_id = 0, $contacto_id = 0) {
    $nombre = $saludo ?: blokes_campanas_nombre_saludo($nombres);
    $txt = str_replace('{nombre}', $nombre, $plantilla);
    $txt = str_replace('{remitente}', $remitente, $txt);
    // {enlace}: enlace propio por destinatario para medir clics (Ramiro, 11/11 05:35) — solo
    // se gasta un token si la plantilla de verdad lo usa.
    if ($campana_id && $contacto_id && strpos($txt, '{enlace}') !== false) {
        $token = blokes_campana_enlace_token($campana_id, $contacto_id);
        // Esto se llama siempre desde una petición que llegó por /club/wp-json/... (blog 3), así
        // que home_url() aquí da "rocomadrid.com/club" — el enlace corto tiene que ser del sitio
        // Principal (blog 1), no del Club (cowork, 11/11 06:55: salía "/club/c/XXXXX" y daba
        // 404). get_home_url(1, ...) fuerza el dominio del blog 1 sin cambiar de blog de verdad.
        $txt = str_replace('{enlace}', get_home_url(1, '/c/' . $token), $txt);
    }
    return $txt;
}

// GET /campanas/{id}/destinatarios — la lista de envío: contactos de la(s) lista(s) de esta
// campaña, menos bajas de mensajes y menos quien ya tiene suscripción/externo en vigor ahora
// mismo (red de seguridad aparte de la lista, para no mandar "¿te animas a volver?" a quien
// ya está viniendo). Si alguien enviado ya está en vigor, se marca "apuntado" solo.
function superadmin_campanas_destinatarios($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $id = intval($request['id']);
    $campana = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . blokes_campanas_table() . " WHERE id = %d", $id), ARRAY_A);
    if (!$campana) return new WP_Error('not_found', 'Campaña no encontrada.', array('status' => 404));
    $listas = array_filter(explode(',', $campana['listas']));
    // La "conversión automática" de abajo (apuntado solo al estar ya en vigor) tiene sentido
    // en una campaña de antiguos ("volvió"), pero no en una de actuales/nuevos/en_espera: ahí
    // casi todos YA están en vigor antes de mandarles nada, y salían "Se apuntaron" sin haber
    // hecho nada (cowork, 10/11 13:10 — campaña #2, 10 de 12 enviados marcados así de golpe).
    $es_campana_vigentes = (bool) array_intersect($listas, array('actuales', 'nuevos', 'en_espera'));

    $subs_por_tel     = blokes_campanas_subs_por_telefono();
    $externos_por_tel = blokes_campanas_externos_por_telefono();
    $envios_por_contacto = array();
    foreach ($wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . blokes_campana_envios_table() . " WHERE campana_id = %d", $id
    ), ARRAY_A) as $e) { $envios_por_contacto[$e['contacto_id']] = $e; }

    $contactos = $wpdb->get_results("SELECT * FROM " . blokes_contactos_table(), ARRAY_A);
    $out = array();
    foreach ($contactos as $c) {
        $envio = $envios_por_contacto[$c['id']] ?? null;
        // "no" o BAJA: fuera de TODAS las campañas NUEVAS, también las manuales por wa.me
        // (oposición a comunicaciones comerciales — Ramiro, 31/10 17:17). "Sin preguntar" (null)
        // sí entra, porque son clientes/antiguos clientes y esto es envío manual con línea de
        // BAJA. Si ya hay histórico en ESTA campaña (p. ej. aquí mismo se marcó BAJA), se queda
        // para poder verlo en la pestaña "Bajas" y deshacerlo si fue un error.
        if (($c['baja_mensajes'] || $c['optin_whatsapp'] === 'no') && !$envio) continue;
        $tel   = blokes_externos_normaliza_telefono($c['telefono']);
        $lista = blokes_campanas_clasificar($tel, $subs_por_tel, $externos_por_tel, $c);
        if (!in_array($lista, $listas, true) && !$envio) continue;

        $ya_en_vigor = isset($subs_por_tel[$tel]) && in_array($subs_por_tel[$tel]['status'], array('active', 'on-hold', 'pending'), true)
            || isset($externos_por_tel[$tel]);

        $nombres = json_decode($c['nombres'], true);
        if (!is_array($nombres)) $nombres = array_filter(array($nombres));
        $plantilla = $c['tipo'] === 'menor' ? $campana['plantilla_menor'] : $campana['plantilla_adulto'];

        // Conversión automática: si ya está en vigor y se le había enviado algo, se marca
        // apuntado solo (aunque nadie haya pulsado el botón a mano) — solo en campañas de
        // antiguos, donde "ya en vigor" de verdad significa que volvió.
        if (!$es_campana_vigentes && $ya_en_vigor && $envio && !empty($envio['enviado_at']) && !$envio['apuntado']) {
            $wpdb->update(blokes_campana_envios_table(), array('apuntado' => 1, 'apuntado_at' => current_time('mysql'), 'updated_at' => current_time('mysql')), array('id' => $envio['id']));
            $envio['apuntado'] = 1;
            $envio['apuntado_at'] = current_time('mysql');
        }

        $out[] = array(
            'contactoId' => intval($c['id']), 'telefono' => $tel, 'nombres' => $nombres, 'tipo' => $c['tipo'],
            'mensaje' => blokes_campanas_personalizar($plantilla, $nombres, $campana['remitente'], $c['saludo'] ?? '', $id, intval($c['id'])),
            'yaEnVigor' => (bool) $ya_en_vigor, 'optinWhatsapp' => $c['optin_whatsapp'] ?: null,
            'enviado' => $envio && !empty($envio['enviado_at']) ? array('fecha' => $envio['enviado_at'], 'por' => $envio['enviado_por']) : null,
            'respondio' => $envio && $envio['respondio'] ? array('fecha' => $envio['respondio_at'], 'por' => $envio['respondio_por']) : false,
            'baja' => $envio && $envio['baja'] ? array('fecha' => $envio['baja_at'], 'por' => $envio['baja_por']) : false,
            'apuntado' => $envio && $envio['apuntado'] ? array('fecha' => $envio['apuntado_at'], 'por' => $envio['apuntado_por']) : false,
        );
    }
    return rest_ensure_response(array('success' => true, 'data' => array(
        'campana' => array(
            'id' => intval($campana['id']), 'nombre' => $campana['nombre'], 'listas' => $listas,
            'remitente' => $campana['remitente'],
        ),
        'destinatarios' => $out,
    )));
}

// POST /campanas/{id}/contactos/{contacto_id}/accion — { accion: enviado|respondio|baja|apuntado }
function superadmin_campanas_marcar_accion($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $campana_id  = intval($request['id']);
    $contacto_id = intval($request['contacto_id']);
    $accion = sanitize_key($request->get_param('accion'));
    if (!in_array($accion, array('enviado', 'enviado_deshacer', 'respondio', 'respondio_deshacer', 'baja', 'baja_deshacer', 'apuntado', 'apuntado_deshacer'), true)) {
        return new WP_Error('bad_request', 'Acción no reconocida.', array('status' => 400));
    }
    $u = wp_get_current_user();
    $quien = $u ? $u->user_login : '';
    $existente = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . blokes_campana_envios_table() . " WHERE campana_id = %d AND contacto_id = %d", $campana_id, $contacto_id
    ), ARRAY_A);

    $campos = array('updated_at' => current_time('mysql'));
    if ($accion === 'enviado')   { $campos['enviado_at'] = current_time('mysql'); $campos['enviado_por'] = $quien; }
    if ($accion === 'respondio') { $campos['respondio'] = 1; $campos['respondio_at'] = current_time('mysql'); $campos['respondio_por'] = $quien; }
    if ($accion === 'baja')      { $campos['baja'] = 1; $campos['baja_at'] = current_time('mysql'); $campos['baja_por'] = $quien; }
    if ($accion === 'apuntado')  { $campos['apuntado'] = 1; $campos['apuntado_at'] = current_time('mysql'); $campos['apuntado_por'] = $quien; }
    // Deshacer BAJA: se queda el histórico de quién/cuándo la marcó al principio (por si hace
    // falta reconstruirlo), solo se apaga el flag — así vuelve a entrar en campañas futuras.
    if ($accion === 'baja_deshacer') $campos['baja'] = 0;
    // Deshacer Respondió/Se apuntó (Ramiro 12/11 11:20 y cowork 10/11 13:10: un clic mal dado,
    // o los "Se apuntaron" falsos que dejó el bug de conversión automática antes de arreglarlo).
    if ($accion === 'respondio_deshacer') { $campos['respondio'] = 0; $campos['respondio_at'] = null; }
    if ($accion === 'apuntado_deshacer')  { $campos['apuntado']  = 0; $campos['apuntado_at']  = null; }
    // Deshacer enviado, por destinatario (cowork 12/11 13:00: "Abrir WhatsApp" marcó enviado a
    // Cristina pero el mensaje nunca se mandó — el dato era de otra persona). Antes solo existía
    // el "deshacer enviados" de toda la campaña de golpe (superadmin_campanas_deshacer_enviados).
    if ($accion === 'enviado_deshacer') { $campos['enviado_at'] = null; $campos['enviado_por'] = null; }

    if ($existente) {
        $wpdb->update(blokes_campana_envios_table(), $campos, array('id' => $existente['id']));
    } else {
        $wpdb->insert(blokes_campana_envios_table(), array_merge(array(
            'campana_id' => $campana_id, 'contacto_id' => $contacto_id,
        ), $campos));
    }

    // BAJA: va a la lista global de bajas de mensajes, se respeta en todas las campañas futuras.
    // También retira el consentimiento de WhatsApp si lo tenía — si el día de mañana se manda
    // por la API a "quien tiene consentimiento", quien dijo BAJA no puede seguir colándose ahí.
    if ($accion === 'baja') {
        $wpdb->update(blokes_contactos_table(), array(
            'baja_mensajes' => 1, 'baja_mensajes_fecha' => current_time('mysql'),
            'baja_mensajes_nota' => 'Respondió BAJA en campaña #' . $campana_id, 'updated_at' => current_time('mysql'),
        ), array('id' => $contacto_id));
        $contacto = $wpdb->get_row($wpdb->prepare("SELECT telefono FROM " . blokes_contactos_table() . " WHERE id = %d", $contacto_id), ARRAY_A);
        if ($contacto) {
            blokes_registrar_optin_whatsapp($contacto['telefono'], 0, 'no', 'respuesta BAJA', '', 'campaña #' . $campana_id);
        }
    }
    // Deshacer BAJA (fue un error): quita la baja global de mensajes y deja el consentimiento
    // "sin preguntar" otra vez, en vez de darlo por "si" sin que nadie lo haya confirmado.
    if ($accion === 'baja_deshacer') {
        $wpdb->update(blokes_contactos_table(), array(
            'baja_mensajes' => 0, 'baja_mensajes_fecha' => null,
            'baja_mensajes_nota' => 'BAJA deshecha (error) en campaña #' . $campana_id, 'updated_at' => current_time('mysql'),
        ), array('id' => $contacto_id));
        $contacto = $wpdb->get_row($wpdb->prepare("SELECT telefono FROM " . blokes_contactos_table() . " WHERE id = %d", $contacto_id), ARRAY_A);
        if ($contacto) {
            blokes_registrar_optin_whatsapp($contacto['telefono'], 0, null, 'deshacer BAJA (error)', '', 'campaña #' . $campana_id);
        }
    }
    return rest_ensure_response(array('success' => true));
}

// POST /campanas/{id}/deshacer-enviados — Ramiro, 3/11 12:10: en la campaña de antiguos alumnos
// algunos contactos quedaron marcados "enviado" por pruebas, sin haberse mandado nada de verdad.
// Quita el "enviado" de TODOS los de esta campaña de golpe (nunca toca respondio/baja/apuntado,
// que son señales reales aparte) para que vuelvan a salir como pendientes.
function superadmin_campanas_deshacer_enviados($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $campana_id = intval($request['id']);
    $n = $wpdb->update(
        blokes_campana_envios_table(),
        array('enviado_at' => null, 'enviado_por' => '', 'updated_at' => current_time('mysql')),
        array('campana_id' => $campana_id)
    );
    blokes_gestion_log(0, 'campana_deshacer_enviados', array(), array('campanaId' => $campana_id, 'filas' => $n));
    return rest_ensure_response(array('success' => true, 'data' => array('filas' => intval($n))));
}

// POST /campanas/{id}/recalcular-indirectas — parte C de la trazabilidad: para quien no hizo
// clic (o se le envió antes de que existiera el enlace), busca si su teléfono tiene ahora una
// suscripción en vigor dada de alta DESPUÉS del envío — si la hay, cuenta como conversión
// "indirecta". Se puede llamar las veces que haga falta sin duplicar (clave única de la tabla).
function superadmin_campanas_recalcular_indirectas($request) {
    blokes_ensure_campanas_tables();
    global $wpdb;
    $id = intval($request['id']);
    $campana = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . blokes_campanas_table() . " WHERE id = %d", $id), ARRAY_A);
    if (!$campana) return new WP_Error('not_found', 'Campaña no encontrada.', array('status' => 404));

    $envios = $wpdb->get_results($wpdb->prepare(
        "SELECT contacto_id, enviado_at FROM " . blokes_campana_envios_table() . " WHERE campana_id = %d AND enviado_at IS NOT NULL", $id
    ), ARRAY_A);
    if (!$envios) return rest_ensure_response(array('success' => true, 'data' => array('revisados' => 0, 'nuevas' => 0)));

    $subs_por_tel = blokes_campanas_subs_por_telefono();
    $nuevas = 0;
    foreach ($envios as $e) {
        $contacto_id = intval($e['contacto_id']);
        $ya = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM " . blokes_campana_conversiones_table() . " WHERE campana_id = %d AND contacto_id = %d AND tipo = 'pedido'", $id, $contacto_id
        ));
        if ($ya) continue; // ya contada (directa o una indirecta de antes) — no hace falta repetir
        $contacto = $wpdb->get_row($wpdb->prepare("SELECT telefono FROM " . blokes_contactos_table() . " WHERE id = %d", $contacto_id), ARRAY_A);
        if (!$contacto) continue;
        $tel = blokes_externos_normaliza_telefono($contacto['telefono']);
        $sub = $subs_por_tel[$tel] ?? null;
        if (!$sub || !in_array($sub['status'], array('active', 'on-hold', 'pending'), true)) continue;
        $sub_obj  = (!empty($sub['id']) && function_exists('wcs_get_subscription')) ? wcs_get_subscription(intval($sub['id'])) : null;
        $alta_iso = $sub_obj ? $sub_obj->get_date('date_created') : null;
        $alta_ts  = $alta_iso ? strtotime($alta_iso) : 0;
        $envio_ts = strtotime($e['enviado_at']);
        if (!$alta_ts || $alta_ts < $envio_ts) continue; // la alta tiene que ser DESPUÉS del envío, si no, no la provocó la campaña
        blokes_campana_registrar_conversion($id, $contacto_id, 'pedido', 'indirecta', 'sub #' . intval($sub['id'] ?? 0));
        $nuevas++;
    }
    return rest_ensure_response(array('success' => true, 'data' => array('revisados' => count($envios), 'nuevas' => $nuevas)));
}

// GET /gestion/bajas-motivo — bajas de clases por mes y por motivo, para ver si una campaña de
// WhatsApp recupera gente y a quién dirigir cada una (31/10).
function superadmin_gestion_bajas_motivo($request) {
    $meses = max(1, min(36, intval($request->get_param('meses') ?: 12)));
    // "first day of this month" antes de restar: evita el desborde de mes de los días 29-31.
    $desde = date('Y-m-d', strtotime("first day of this month -{$meses} months"));
    $metas = get_posts(array(
        'post_type' => 'shop_subscription', 'post_status' => array('wc-cancelled', 'wc-pending-cancel'),
        'posts_per_page' => -1, 'fields' => 'ids',
        'meta_query' => array(array('key' => '_rm_baja_fecha', 'value' => $desde, 'compare' => '>=', 'type' => 'DATE')),
    ));
    $por_mes_motivo = array();
    foreach ($metas as $sub_id) {
        $fecha = get_post_meta($sub_id, '_rm_baja_fecha', true);
        $cat   = get_post_meta($sub_id, '_rm_baja_categoria', true) ?: 'sin_categoria';
        $mes   = substr((string) $fecha, 0, 7);
        if (!preg_match('/^\d{4}-\d{2}$/', $mes)) continue;
        if (!isset($por_mes_motivo[$mes])) $por_mes_motivo[$mes] = array();
        $por_mes_motivo[$mes][$cat] = ($por_mes_motivo[$mes][$cat] ?? 0) + 1;
    }
    ksort($por_mes_motivo);
    return rest_ensure_response(array('success' => true, 'data' => $por_mes_motivo));
}

// POST /gestion/optin-whatsapp — { telefono, valor: 'si'|'no'|null, nombre? } — para que Eva lo
// marque desde la ficha de Grupos cuando alguien dice que sí o que no (en persona o por
// WhatsApp), o lo deje en "sin preguntar".
function superadmin_gestion_optin_whatsapp($request) {
    $body     = $request->get_json_params();
    $telefono = sanitize_text_field((string) ($body['telefono'] ?? ''));
    $valor    = sanitize_key((string) ($body['valor'] ?? ''));
    if (!in_array($valor, array('si', 'no'), true)) $valor = null;
    $nombre   = sanitize_text_field((string) ($body['nombre'] ?? ''));
    if ($telefono === '') return new WP_Error('bad_request', 'Falta el teléfono.', array('status' => 400));

    $u = wp_get_current_user();
    blokes_registrar_optin_whatsapp(
        $telefono, 0, $valor, 'grupos', $valor === 'si' ? BLOKES_OPTIN_WHATSAPP_TEXTO : '',
        'Grupos: ' . ($u ? $u->user_login : ''), $nombre
    );
    return rest_ensure_response(array('success' => true));
}

/**
 * Marcar cobrado.
 * - Efectivo: NO toca WooCommerce ni genera factura — se apunta en una tabla propia
 *   (`wp_blokes_cobros_manuales`) y "Grupos"/ExcelMuerte lo cuentan como cobrado ese mes.
 * - Transferencia / Tarjeta (TPV roco) / Bizum / Wellhub: completa la renovación pendiente (o
 *   crea una si no hay ninguna) y la reactiva — esto SÍ genera factura real (Verifactu/AEAT),
 *   igual que un cobro con tarjeta en la web. Bizum entra por el banco, así que se trata igual
 *   que transferencia (31/10, decisión de Ramiro). Rechaza las suscripciones de cobro automático
 *   por tarjeta/Redsys (409), para no duplicar el cobro.
 */
function superadmin_gestion_marcar_cobrado($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $sub_id   = intval($request->get_param('sub_id'));
    $importe  = floatval($request->get_param('importe'));
    $metodo   = sanitize_key($request->get_param('metodo'));
    $fecha    = sanitize_text_field($request->get_param('fecha')); // 'Y-m-d', opcional
    $parcial  = (bool) $request->get_param('parcial');
    $nota     = sanitize_text_field($request->get_param('nota'));
    $mantener_pausa = $request->get_param('mantener_pausa');
    $mantener_pausa = $mantener_pausa === null ? true : (bool) $mantener_pausa;
    $simular  = (bool) $request->get_param('simular');
    $es_efectivo = $metodo === 'efectivo';
    // Excepción de precio (NOTAS_PARA_CODE_pestanas_grupos.md, Ramiro 06/11 16:00): cuando el
    // importe escrito no es el total del pedido/catálogo. 'solo_este_mes' ajusta solo este
    // cobro; 'desde_ahora' además cambia el precio recurrente de la suscripción. Si no se manda
    // (p. ej. llamadas automáticas como Sync Grupos), el comportamiento es EXACTAMENTE el de
    // antes: el importe distinto queda solo como nota, sin tocar el pedido ni la suscripción —
    // así no se cambia nada para quien ya llama a este endpoint sin pasar por el diálogo nuevo.
    $ajustar_precio = sanitize_key((string) $request->get_param('ajustarPrecio'));
    if (!in_array($ajustar_precio, array('', 'solo_este_mes', 'desde_ahora'), true)) $ajustar_precio = '';
    $motivo_excepcion = sanitize_text_field((string) $request->get_param('motivoExcepcion'));

    if (!$sub_id || $importe <= 0 || !$metodo) {
        return new WP_Error('bad_request', 'Faltan sub_id, importe o metodo.', array('status' => 400));
    }
    if (!in_array($metodo, array('transferencia', 'tarjeta', 'efectivo', 'wellhub', 'bizum'), true)) {
        return new WP_Error('bad_request', 'Método no reconocido. Usa transferencia, tarjeta, efectivo, bizum o wellhub.', array('status' => 400));
    }
    if ($ajustar_precio !== '' && $motivo_excepcion === '') {
        return new WP_Error('falta_motivo', 'El motivo de la excepción de precio es obligatorio.', array('status' => 400));
    }
    $sub = wcs_get_subscription($sub_id);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));

    $fecha_ts  = $fecha ? strtotime($fecha . ' 12:00:00') : time();
    $fecha_txt = date_i18n('d/m/Y', $fecha_ts);
    $metodo_label = blokes_gestion_metodo_label($metodo);
    $antes = array('status' => $sub->get_status());

    // ── Efectivo: nada de WooCommerce, nada de factura ──
    if ($es_efectivo) {
        $periodo = date('Y-m', $fecha_ts);
        // Si estaba "en espera" por simple impago (sin motivo de pausa guardado), cobrar en
        // efectivo la reactiva igual que lo haría un cobro por WooCommerce — sin pedido, sin
        // factura y sin email. Si estaba pausada de verdad (lesión...), no se toca: el efectivo
        // no debe reactivar a quien sigue sin poder venir (decisión de Ramiro, 29/10).
        $pausa_motivo_antes = get_post_meta($sub_id, '_rm_pausa_motivo', true);
        $reactivaria = $sub->has_status('on-hold') && !$pausa_motivo_antes;

        $pedidos_a_cancelar = blokes_cancelar_pedidos_impagados($sub, true); // solo listar, por ahora

        if ($simular) {
            return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
                'subId' => $sub_id, 'periodo' => $periodo, 'importe' => $importe, 'metodo' => $metodo_label,
                'fecha' => $fecha_txt, 'parcial' => $parcial, 'reactivaLaSuscripcion' => $reactivaria,
                'pedidosACancelar' => $pedidos_a_cancelar,
                'aviso' => 'Simulación: no se escribiría nada todavía. El efectivo no toca WooCommerce ni genera factura, solo queda apuntado en Grupos.',
            )));
        }
        blokes_ensure_cobros_manuales_table();
        global $wpdb;
        $user = wp_get_current_user();
        $wpdb->insert(blokes_cobros_manuales_table(), array(
            'sub_id' => $sub_id, 'periodo' => $periodo, 'importe' => $importe, 'metodo' => 'efectivo',
            'fecha' => date('Y-m-d', $fecha_ts), 'nota' => $nota, 'parcial' => $parcial ? 1 : 0,
            'user_id' => $user ? $user->ID : 0, 'user_login' => $user ? $user->user_login : '',
            'created_at' => current_time('mysql'),
        ));
        if ($reactivaria) {
            blokes_gestion_sin_emails(function() use ($sub) {
                $sub->update_status('active', 'ExcelMuerte: cobrado en efectivo, reactivada (estaba en espera por impago).');
            });
        }
        // El/los pedido(s) sin pagar que quedaban colgando (si los había) ya no deben seguir
        // contando como impago en ningún sitio, se haya reactivado la suscripción o no.
        $pedidos_cancelados = blokes_cancelar_pedidos_impagados($sub, false);
        $despues = array('periodo' => $periodo, 'importe' => $importe, 'metodo' => 'efectivo', 'reactivada' => $reactivaria, 'pedidosCancelados' => $pedidos_cancelados);
        blokes_gestion_log($sub_id, 'marcar_cobrado_efectivo', $antes, $despues, array('fecha' => $fecha_txt, 'parcial' => $parcial, 'nota' => $nota));
        // Web → Excel (NOTAS_PARA_CODE_sync_grupos.md): el cobro también se apunta en la Hoja de
        // Eva, si se encuentra la pestaña/fila/mes de verdad — nunca bloquea esta respuesta.
        $dh = blokes_sync_grupos_dia_horario_de_sub($sub_id);
        blokes_sync_grupos_escribir_cobro($dh['dia'], $dh['horario'], $sub->get_billing_phone(), trim($sub->get_billing_first_name() . ' ' . $sub->get_billing_last_name()), $periodo, $importe, 'efectivo', date('d/m/Y', $fecha_ts));
        return rest_ensure_response(array('success' => true, 'data' => $despues));
    }

    // ── Transferencia / Tarjeta (TPV) / Bizum / Wellhub: por WooCommerce, con factura ──
    if (method_exists($sub, 'is_manual') && !$sub->is_manual()) {
        return new WP_Error('cobro_automatico', 'Esta suscripción cobra sola por tarjeta/Redsys: no se puede marcar cobrado a mano (cobro doble).', array('status' => 409));
    }

    $pausa_motivo_antes = get_post_meta($sub_id, '_rm_pausa_motivo', true);
    $estaba_pausada = $sub->has_status('on-hold') && $pausa_motivo_antes;

    // Renovación pendiente de pago ya existente (la más reciente sin pagar) — solo se BUSCA, no
    // se crea todavía: crear un pedido ya escribe en la base de datos de verdad.
    $order_ids = array_filter(array_merge(array($sub->get_parent_id()), $sub->get_related_orders('ids', 'renewal')));
    $order = null;
    foreach (array_reverse($order_ids) as $oid) {
        $o = wc_get_order($oid);
        if ($o && in_array($o->get_status(), array('pending', 'on-hold', 'failed'), true)) { $order = $o; break; }
    }

    // Decisión de Ramiro (1/11 18:55): si todavía NO existe el pedido de renovación (todas las
    // renovaciones son el día 3), no se crea a mano — se guarda como "pagado por adelantado" y
    // se aplica solo cuando WooCommerce Subscriptions genere ese pedido de verdad
    // (blokes_aplicar_adelantado_si_hay), para no arriesgar un pedido/factura doble.
    $next_payment_mysql = method_exists($sub, 'get_date') ? $sub->get_date('next_payment') : '';
    $next_payment_ts = $next_payment_mysql ? strtotime($next_payment_mysql) : null;
    $periodo_cubre = $next_payment_ts ? date('Y-m', $next_payment_ts) : date('Y-m');

    // Ya hay un adelantado guardado para este mismo mes de esta suscripción: avisar en la
    // simulación y no dejar duplicarlo al confirmar (cowork, 2/11 09:42, punto 3) — anúlalo
    // primero con el nuevo POST /gestion/adelantados/{id}/anular si quieres cambiarlo.
    blokes_ensure_adelantados_table();
    global $wpdb;
    $adelantado_existente = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . blokes_adelantados_table() . " WHERE sub_id = %d AND periodo = %s AND aplicado_at IS NULL ORDER BY id DESC LIMIT 1",
        $sub_id, $periodo_cubre
    ), ARRAY_A);

    // ¿El importe escrito es distinto del total del pedido/suscripción? (excepción de precio —
    // Ramiro 06/11 16:00). No aplica a "efectivo" (ahí nunca hay pedido ni factura) ni a
    // "parcial" (eso ya es su propio camino: pedido a medias, sin factura completa).
    $total_referencia = $order ? floatval($order->get_total()) : floatval($sub->get_total());
    $importe_distinto = !$es_efectivo && !$parcial && abs($importe - $total_referencia) > 0.009;

    // Modo simulación: ni crea ni completa ningún pedido, ni toca la suscripción — para poder
    // probar contra un caso real (secciones 6b/7) viendo qué pasaría, sin generar factura/AEAT
    // ni ningún otro efecto. Nada de lo de abajo se ejecuta.
    if ($simular) {
        $preview = array(
            'subId'           => $sub_id,
            'estadoAntes'     => $antes['status'],
            'pedidoExistente' => $order ? $order->get_id() : null,
            'proximoPago'     => $next_payment_ts ? date_i18n('d/m/Y', $next_payment_ts) : 'desconocido',
            'mesQueCubre'     => $periodo_cubre,
            'completaraPedidoExistente' => (bool) $order,
            'seGuardaraComoAdelantado'  => !$order,
            'adelantadoYaGuardado'      => $adelantado_existente ? array(
                'id' => intval($adelantado_existente['id']), 'importe' => floatval($adelantado_existente['importe']),
                'fecha' => date_i18n('d/m/Y', strtotime($adelantado_existente['created_at'])), 'por' => $adelantado_existente['user_login'],
            ) : null,
            'pasaAActiva'     => !($estaba_pausada && $mantener_pausa),
            'mantienePausa'   => $estaba_pausada && $mantener_pausa,
            'importe'         => $importe, 'metodo' => $metodo_label, 'fecha' => $fecha_txt, 'parcial' => $parcial,
            // Excepción de precio: lo que vería el diálogo para ofrecer las 2 opciones de
            // Ramiro. totalPedidoAntes/Despues y totalFacturaDespues dejan claro qué cambia en
            // cada una antes de confirmar.
            'importeDistinto'      => $importe_distinto,
            'totalActual'          => $total_referencia,
            'ajustarPrecio'        => $ajustar_precio ?: null,
            'opciones' => !$importe_distinto ? null : array(
                'solo_este_mes' => array(
                    'disponible' => (bool) $order,
                    'totalPedidoAntes' => $total_referencia, 'totalPedidoDespues' => $importe, 'totalFactura' => $importe,
                    'aviso' => $order ? null : 'Todavía no existe el pedido de esta renovación — no se puede ajustar solo este mes hasta que exista (usa "y desde ahora" o espera a que se genere).',
                ),
                'desde_ahora' => array(
                    'disponible' => true,
                    'totalPedidoAntes' => $total_referencia, 'totalPedidoDespues' => $importe, 'totalFactura' => $importe,
                    'cambiaRenovaciones' => true, 'precioRecurrenteDespues' => $importe,
                ),
            ),
            'aviso'           => $adelantado_existente
                ? sprintf('Ya hay un pago adelantado de %s € guardado el %s por %s para este mes — confirmar crearía otro. Anúlalo primero si quieres cambiarlo.',
                    number_format(floatval($adelantado_existente['importe']), 2, ',', '.'), date_i18n('d/m/Y', strtotime($adelantado_existente['created_at'])), $adelantado_existente['user_login'])
                : ($importe_distinto
                    ? sprintf('El importe (%s €) no coincide con el total actual (%s €) — elige si es solo este mes o también desde ahora antes de confirmar.',
                        number_format($importe, 2, ',', '.'), number_format($total_referencia, 2, ',', '.'))
                    : ($order
                        ? 'Simulación: no se ha escrito nada en WooCommerce. De confirmarlo, SE EMITIRÁ FACTURA y se enviará a Hacienda (Verifactu).'
                        : 'Simulación: todavía no existe el pedido de renovación. De confirmarlo, se guardará como "pagado por adelantado" (sin factura) y se aplicará solo cuando WooCommerce genere esa renovación.')),
        );
        blokes_gestion_log($sub_id, 'marcar_cobrado_simulado', $antes, null, $preview);
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => $preview));
    }

    if ($importe_distinto && $ajustar_precio === 'solo_este_mes' && !$order) {
        return new WP_Error('sin_pedido', 'Todavía no existe el pedido de esta renovación — no se puede ajustar el precio solo este mes hasta que exista. Usa "y desde ahora" o espera a que se genere.', array('status' => 409));
    }

    // "desde_ahora" cambia el precio recurrente de la suscripción YA (antes de completar el
    // pedido si existe, o aunque todavía no exista — así, si se guarda como adelantado, la
    // próxima renovación que genere WooCommerce nacerá ya con el precio nuevo y el adelantado
    // coincidirá solo con comprobarlo, sin tocar blokes_aplicar_adelantado_si_hay).
    if ($importe_distinto && $ajustar_precio === 'desde_ahora') {
        $ok_sub = blokes_gestion_ajustar_precio_linea($sub, $importe);
        if (!$ok_sub) {
            return new WP_Error('varias_lineas', 'Esta suscripción tiene más de una línea de producto — no se puede ajustar el precio recurrente a ciegas. Dímelo y lo reviso a mano.', array('status' => 409));
        }
        $user = wp_get_current_user();
        update_post_meta($sub_id, '_rm_precio_especial', $importe);
        update_post_meta($sub_id, '_rm_precio_especial_motivo', $motivo_excepcion);
        update_post_meta($sub_id, '_rm_precio_especial_desde', $fecha_txt);
        update_post_meta($sub_id, '_rm_precio_especial_por', $user ? $user->user_login : '');
        blokes_gestion_log($sub_id, 'precio_especial', array('total' => $total_referencia), array('total' => $importe, 'motivo' => $motivo_excepcion));
    }

    if (!$order) {
        if ($adelantado_existente) {
            return new WP_Error('adelantado_duplicado', sprintf(
                'Ya hay un pago adelantado de %s € guardado el %s por %s para este mes. Anúlalo primero (POST /gestion/adelantados/%d/anular) si quieres cambiarlo.',
                number_format(floatval($adelantado_existente['importe']), 2, ',', '.'), date_i18n('d/m/Y', strtotime($adelantado_existente['created_at'])),
                $adelantado_existente['user_login'], intval($adelantado_existente['id'])
            ), array('status' => 409));
        }
        $user = wp_get_current_user();
        $wpdb->insert(blokes_adelantados_table(), array(
            'sub_id' => $sub_id, 'periodo' => $periodo_cubre, 'importe' => $importe, 'metodo' => $metodo,
            'fecha_banco' => date('Y-m-d', $fecha_ts), 'nota' => $nota,
            'user_id' => $user ? $user->ID : 0, 'user_login' => $user ? $user->user_login : '',
            'created_at' => current_time('mysql'),
        ));
        $despues = array('adelantado' => true, 'periodo' => $periodo_cubre, 'importe' => $importe, 'metodo' => $metodo);
        blokes_gestion_log($sub_id, 'marcar_cobrado_adelantado', $antes, $despues, array('fecha' => $fecha_txt, 'nota' => $nota));
        return rest_ensure_response(array('success' => true, 'adelantado' => true, 'data' => array_merge($despues, array(
            'aviso' => 'Guardado como pago por adelantado. Se aplicará automáticamente cuando se genere la renovación del día 3; no se crea factura todavía.',
        ))));
    }

    // Excepción de precio sobre el pedido ya existente — "solo este mes" (y también
    // "desde ahora", que además de cambiar la suscripción arriba, este cobro concreto se
    // factura por lo cobrado): ajusta la línea del pedido ANTES de completarlo, para que la
    // factura/Verifactu salga por el importe real.
    if ($importe_distinto && in_array($ajustar_precio, array('solo_este_mes', 'desde_ahora'), true)) {
        $ok_pedido = blokes_gestion_ajustar_precio_linea($order, $importe);
        if (!$ok_pedido) {
            return new WP_Error('varias_lineas', 'Este pedido tiene más de una línea de producto — no se puede ajustar el precio a ciegas. Dímelo y lo reviso a mano.', array('status' => 409));
        }
    }

    blokes_gestion_sin_emails(function() use ($order, $metodo_label, $importe, $fecha_ts, $fecha_txt, $parcial, $nota, $importe_distinto, $ajustar_precio, $motivo_excepcion, $total_referencia) {
        $order->set_payment_method_title($metodo_label);
        $nota_txt = sprintf('ExcelMuerte: cobrado %s € (%s) el %s.', number_format($importe, 2, ',', '.'), $metodo_label, $fecha_txt);
        if ($importe_distinto && $ajustar_precio) {
            $nota_txt .= sprintf(
                ' PRECIO ESPECIAL (antes %s €, %s) — %s.',
                number_format($total_referencia, 2, ',', '.'),
                $ajustar_precio === 'desde_ahora' ? 'también desde ahora' : 'solo este mes',
                $motivo_excepcion
            );
        }
        if ($parcial) $nota_txt .= ' PAGO PARCIAL' . ($nota ? ' — ' . $nota : '') . '.';
        elseif ($nota) $nota_txt .= ' ' . $nota;
        $order->add_order_note($nota_txt);
        $order->save();
        update_post_meta($order->get_id(), '_rm_importe_cobrado', $importe);
        update_post_meta($order->get_id(), '_rm_metodo_cobro', $metodo);
        if ($parcial) update_post_meta($order->get_id(), '_rm_pago_parcial', $nota ?: '1');
        $order->payment_complete();
        // payment_complete() deja "processing" (el producto no es virtual/descargable):
        // aquí se considera cobrado de verdad, así que pasa a "completado" — esto emite la
        // factura real (Verifactu/AEAT) con la fecha de hoy, como confirmó Ramiro.
        $order->update_status('completed', 'ExcelMuerte: pedido completado tras marcar cobrado.');
        if ($fecha) {
            $order->set_date_paid($fecha_ts);
            $order->save();
        }
    });

    // payment_complete() reactiva la suscripción sola (la pone "active"). Si estaba pausada de
    // verdad (no solo en espera por impago) y no se ha pedido reanudar también (mantener_pausa,
    // por defecto true), se vuelve a pausar con el mismo motivo — cobrar no debe reactivar a
    // quien sigue sin poder venir.
    if ($estaba_pausada && $mantener_pausa) {
        $sub_recargada = wcs_get_subscription($sub_id);
        if ($sub_recargada) {
            blokes_gestion_sin_emails(function() use ($sub_recargada) {
                $sub_recargada->update_status('on-hold', 'ExcelMuerte: cobrado, se mantiene la pausa.');
            });
        }
    }

    $sub = wcs_get_subscription($sub_id); // recarga tras el payment_complete (y la repausa, si toca)
    $despues = array('status' => $sub ? $sub->get_status() : null, 'order_id' => $order->get_id());
    blokes_gestion_log($sub_id, 'marcar_cobrado', $antes, $despues, array(
        'importe' => $importe, 'metodo' => $metodo, 'fecha' => $fecha_txt, 'parcial' => $parcial, 'nota' => $nota,
        'mantuvo_pausa' => $estaba_pausada && $mantener_pausa,
        'precioEspecial' => ($importe_distinto && $ajustar_precio) ? array('totalAntes' => $total_referencia, 'modo' => $ajustar_precio, 'motivo' => $motivo_excepcion) : null,
    ));
    // Web → Excel (NOTAS_PARA_CODE_sync_grupos.md): el cobro también se apunta en la Hoja de
    // Eva, si se encuentra la pestaña/fila/mes de verdad — nunca bloquea esta respuesta (el
    // cobro y la factura ya están hechos en WooCommerce antes de llegar aquí).
    $dh = blokes_sync_grupos_dia_horario_de_sub($sub_id);
    blokes_sync_grupos_escribir_cobro($dh['dia'], $dh['horario'], $sub ? $sub->get_billing_phone() : '', $sub ? trim($sub->get_billing_first_name() . ' ' . $sub->get_billing_last_name()) : '', $periodo_cubre, $importe, $metodo, $fecha_txt);

    return rest_ensure_response(array('success' => true, 'data' => $despues));
}

// "Mandar factura" (NOTAS_PARA_CODE_pestanas_grupos.md, pestaña 3): pedidos de renovación de
// tarjeta ya cobrados de verdad por el banco (Redsys/la pasarela confirmó la transacción) pero
// que WooCommerce dejó en "processing" en vez de "completed" — así nunca sale la factura
// Verifactu ni el email al cliente. El plugin de Redsys no rellena `transaction_id` en las
// renovaciones (cowork, prueba 3/11 06:00), así que un pedido cuenta como "cobro confirmado" si
// tiene `date_paid` puesto Y además un código de autorización o el flag de Redsys hecho —
// nunca por estar "processing" sin más, que podría no ser un cobro real.
function blokes_gestion_pedido_cobro_confirmado($order) {
    if (!$order->get_date_paid()) return false;
    if ($order->get_transaction_id()) return true;
    if ($order->get_meta('_authorisation_code_redsys')) return true;
    if ($order->get_meta('_redsys_done')) return true;
    return false;
}

function superadmin_gestion_facturas_pendientes($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $out = array();
    foreach (blokes_get_all_subscription_data() as $sub) {
        if (empty($sub['id'])) continue;
        $sub_obj = wcs_get_subscription(intval($sub['id']));
        if (!$sub_obj) continue;
        $order_ids = array_filter(array_merge(array($sub_obj->get_parent_id()), $sub_obj->get_related_orders('ids', 'renewal')));
        foreach ($order_ids as $oid) {
            $order = wc_get_order($oid);
            if (!$order || $order->get_status() !== 'processing') continue;
            if (!blokes_gestion_pedido_cobro_confirmado($order)) continue;
            $nombre_fact = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
            $out[] = array(
                'orderId' => intval($oid), 'subId' => intval($sub['id']),
                'alumno' => $nombre_fact !== '' ? $nombre_fact : ($sub['cliente'] ?? ''),
                'importe' => floatval($order->get_total()), 'metodo' => $order->get_payment_method_title(),
                'fecha' => ($order->get_date_paid() ?: $order->get_date_created())->date('d/m/Y'),
            );
        }
    }
    return rest_ensure_response(array('success' => true, 'data' => $out));
}

// Completa UN pedido ya confirmado por `facturas_pendientes` (misma comprobación de cobro real).
// "Mandar todas" en el frontend llama a esto uno por uno y cuenta aciertos/errores — nunca una
// escritura en bloque de una sola vez.
function superadmin_gestion_facturas_pendientes_completar($request) {
    $order_id = intval($request['id']);
    $order = wc_get_order($order_id);
    if (!$order) return new WP_Error('not_found', 'Pedido no encontrado.', array('status' => 404));
    if ($order->get_status() !== 'processing') {
        return new WP_Error('invalid_state', 'Este pedido ya no está en "processing" — probablemente ya se completó.', array('status' => 409));
    }
    if (!blokes_gestion_pedido_cobro_confirmado($order)) {
        return new WP_Error('sin_confirmar', 'Este pedido no tiene un cobro confirmado por la pasarela.', array('status' => 409));
    }
    blokes_gestion_sin_emails(function() use ($order) {
        $order->update_status('completed', 'ExcelMuerte: factura enviada desde "Mandar factura" (pago de tarjeta ya confirmado).');
    });
    blokes_gestion_log(0, 'factura_pendiente_completada', array('status' => 'processing'), array('status' => 'completed', 'orderId' => $order_id));
    // Web → Excel (Ramiro, 6/11 16:04, punto 1): completar desde "Mandar factura" no dispara
    // `woocommerce_payment_complete` de nuevo (el cobro ya se confirmó antes, esto solo cambia
    // "processing" a "completed") — se escribe aparte, explícito, para no depender de un hook
    // que aquí no llega a saltar.
    if (function_exists('wcs_get_subscriptions_for_order')) {
        foreach (wcs_get_subscriptions_for_order($order, array('order_type' => 'any')) as $sub) {
            blokes_sync_grupos_auto_escribir_cobro($sub, $order);
        }
    }
    return rest_ensure_response(array('success' => true));
}

// Lista de adelantados sin aplicar (pendientes de que WooCommerce genere la renovación) y los
// que no coincidieron en importe (a revisar a mano) — para el contador de "Cobrar este mes".
function superadmin_gestion_adelantados_listar() {
    global $wpdb;
    blokes_ensure_adelantados_table();
    $rows = $wpdb->get_results(
        "SELECT * FROM " . blokes_adelantados_table() . " WHERE aplicado_at IS NULL ORDER BY periodo ASC, id ASC", ARRAY_A
    );
    $pendientes = array_values(array_filter($rows, function($r) { return !$r['revisar']; }));
    $a_revisar  = array_values(array_filter($rows, function($r) { return (bool) $r['revisar']; }));
    return rest_ensure_response(array('success' => true, 'data' => array(
        'pendientes' => $pendientes, 'aRevisar' => $a_revisar,
        'totalPendientes' => count($pendientes), 'totalARevisar' => count($a_revisar),
    )));
}

// Anula un adelantado guardado por error (importe/método equivocado, etc.) antes de que se
// aplique — nunca tocó WooCommerce ni generó factura, así que anularlo es un borrado normal, sin
// ningún efecto que deshacer. Una vez aplicado (aplicado_at ya puesto) no se puede anular aquí.
function superadmin_gestion_adelantado_anular($request) {
    global $wpdb;
    blokes_ensure_adelantados_table();
    $id = intval($request['id']);
    $ad = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . blokes_adelantados_table() . " WHERE id = %d", $id), ARRAY_A);
    if (!$ad) return new WP_Error('not_found', 'Adelantado no encontrado.', array('status' => 404));
    if ($ad['aplicado_at']) return new WP_Error('ya_aplicado', 'Este adelantado ya se aplicó a un pedido real; no se puede anular.', array('status' => 409));
    $wpdb->delete(blokes_adelantados_table(), array('id' => $id));
    blokes_gestion_log(intval($ad['sub_id']), 'adelantado_anulado', $ad, null);
    return rest_ensure_response(array('success' => true));
}

/**
 * Pausar (lesión, viaje…): on-hold con motivo y fecha de vuelta guardados aparte, para no
 * mezclarlo con un simple impago (que también deja la suscripción en on-hold).
 */
function superadmin_gestion_pausar($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $sub_id       = intval($request->get_param('sub_id'));
    $motivo       = sanitize_text_field($request->get_param('motivo'));
    $fecha_vuelta = sanitize_text_field($request->get_param('fecha_vuelta')); // 'Y-m-d', opcional
    $simular      = (bool) $request->get_param('simular');

    if (!$sub_id || !$motivo) return new WP_Error('bad_request', 'Faltan sub_id o motivo.', array('status' => 400));
    $sub = wcs_get_subscription($sub_id);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));

    if ($simular) {
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
            'subId' => $sub_id, 'estadoAntes' => $sub->get_status(), 'estadoDespues' => 'on-hold',
            'motivo' => $motivo, 'fecha_vuelta' => $fecha_vuelta,
            'aviso' => 'Simulación: no se ha escrito nada en WooCommerce.',
        )));
    }

    $antes = array('status' => $sub->get_status());
    blokes_gestion_sin_emails(function() use ($sub, $motivo) {
        $sub->update_status('on-hold', 'Pausa (' . $motivo . ') vía ExcelMuerte');
    });
    update_post_meta($sub_id, '_rm_pausa_motivo', $motivo);
    if ($fecha_vuelta) update_post_meta($sub_id, '_rm_pausa_hasta', $fecha_vuelta);
    else delete_post_meta($sub_id, '_rm_pausa_hasta');

    $despues = array('status' => 'on-hold', 'motivo' => $motivo, 'fecha_vuelta' => $fecha_vuelta);
    blokes_gestion_log($sub_id, 'pausar', $antes, $despues);

    return rest_ensure_response(array('success' => true, 'data' => $despues));
}

/** Reanudar: vuelve a activa y borra la marca de pausa. */
function superadmin_gestion_reanudar($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $sub_id = intval($request->get_param('sub_id'));
    $simular = (bool) $request->get_param('simular');
    if (!$sub_id) return new WP_Error('bad_request', 'Falta sub_id.', array('status' => 400));
    $sub = wcs_get_subscription($sub_id);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));

    if ($simular) {
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
            'subId' => $sub_id, 'estadoAntes' => $sub->get_status(), 'estadoDespues' => 'active',
            'aviso' => 'Simulación: no se ha escrito nada en WooCommerce.',
        )));
    }

    $antes = array('status' => $sub->get_status(), 'pausaMotivo' => get_post_meta($sub_id, '_rm_pausa_motivo', true));
    blokes_gestion_sin_emails(function() use ($sub) {
        $sub->update_status('active', 'Reanudada vía ExcelMuerte');
    });
    delete_post_meta($sub_id, '_rm_pausa_motivo');
    delete_post_meta($sub_id, '_rm_pausa_hasta');

    $despues = array('status' => 'active');
    blokes_gestion_log($sub_id, 'reanudar', $antes, $despues);

    return rest_ensure_response(array('success' => true, 'data' => $despues));
}

// Motivo de baja de clases (fijo, para poder agrupar bajas por motivo — campañas de WhatsApp,
// 31/10) + un detalle libre opcional (sobre todo para "otro").
const BLOKES_BAJA_MOTIVOS = array('precio', 'horario', 'lesion', 'mudanza', 'otro');
function blokes_baja_motivo_label($cat) {
    $map = array('precio' => 'Precio', 'horario' => 'Horario', 'lesion' => 'Lesión', 'mudanza' => 'Mudanza', 'otro' => 'Otro');
    return $map[$cat] ?? '';
}

/**
 * Dar de baja: a fin de mes (pending-cancel, sigue viniendo hasta que se acabe lo pagado) o
 * inmediata (cancelled). Sin pedido ni factura ni email; solo cambia el estado.
 * Si estaba "en espera" (on-hold, sin nada pagado en curso), "a fin de mes" no tiene sentido —
 * no hay ningún periodo pagado del que tirar — así que se fuerza inmediata, y de paso se
 * cancela cualquier pedido suyo sin pagar (si no, se queda "pendiente de pago" colgando).
 */
function superadmin_gestion_dar_de_baja($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $sub_id    = intval($request->get_param('sub_id'));
    $modo      = sanitize_key($request->get_param('modo')); // 'fin_mes' | 'inmediata'
    $categoria = sanitize_key($request->get_param('motivoCategoria'));
    if (!in_array($categoria, BLOKES_BAJA_MOTIVOS, true)) $categoria = '';
    $motivo  = sanitize_text_field($request->get_param('motivo')); // detalle libre, opcional
    $simular = (bool) $request->get_param('simular');

    if (!$sub_id || !in_array($modo, array('fin_mes', 'inmediata'), true)) {
        return new WP_Error('bad_request', 'Falta sub_id o modo (fin_mes/inmediata).', array('status' => 400));
    }
    $sub = wcs_get_subscription($sub_id);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));

    $estaba_en_espera = $sub->has_status('on-hold') || $sub->has_status('pending');
    $modo_real    = $estaba_en_espera ? 'inmediata' : $modo;
    $estado_nuevo = $modo_real === 'fin_mes' ? 'pending-cancel' : 'cancelled';
    $pedidos_a_cancelar = $estado_nuevo === 'cancelled' ? blokes_cancelar_pedidos_impagados($sub, true) : array();

    if ($simular) {
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
            'subId' => $sub_id, 'estadoAntes' => $sub->get_status(), 'estadoDespues' => $estado_nuevo,
            'motivoCategoria' => $categoria, 'motivo' => $motivo,
            'modoForzadoInmediata' => $estaba_en_espera && $modo === 'fin_mes',
            'pedidosACancelar' => $pedidos_a_cancelar,
            'aviso' => 'Simulación: no se ha escrito nada en WooCommerce.',
        )));
    }

    $nota_motivo = trim(($categoria ? blokes_baja_motivo_label($categoria) : 'sin motivo') . ($motivo ? ": {$motivo}" : ''));
    $antes = array('status' => $sub->get_status());
    blokes_gestion_sin_emails(function() use ($sub, $estado_nuevo, $nota_motivo) {
        $sub->update_status($estado_nuevo, 'ExcelMuerte: baja (' . $nota_motivo . ') vía ExcelMuerte');
    });
    update_post_meta($sub_id, '_rm_baja_motivo', $motivo);
    update_post_meta($sub_id, '_rm_baja_categoria', $categoria);
    update_post_meta($sub_id, '_rm_baja_fecha', current_time('Y-m-d'));
    $pedidos_cancelados = $estado_nuevo === 'cancelled' ? blokes_cancelar_pedidos_impagados($sub, false) : array();

    $despues = array('status' => $estado_nuevo, 'motivoCategoria' => $categoria, 'motivo' => $motivo, 'pedidosCancelados' => $pedidos_cancelados);
    blokes_gestion_log($sub_id, 'dar_de_baja', $antes, $despues, array('modo' => $modo_real));

    return rest_ensure_response(array('success' => true, 'data' => $despues));
}

// Busca si existe otra suscripción del mismo cliente, misma clase (día+horario+edad) y más
// reciente, en vigor (activa o de baja a fin de mes) — la "nueva" de la que $sub_id_viejo sería
// el duplicado colgando. Devuelve su fila de blokes_get_all_subscription_data() o null.
function blokes_buscar_sub_mas_nueva($sub_id_viejo) {
    $all = blokes_get_all_subscription_data();
    $viejo = null;
    foreach ($all as $s) { if (intval($s['id']) === $sub_id_viejo) { $viejo = $s; break; } }
    if (!$viejo) return null;

    $uid_viejo = intval(get_post_meta($sub_id_viejo, '_customer_user', true));
    foreach ($all as $s) {
        if (intval($s['id']) === $sub_id_viejo) continue;
        $en_vigor = ($s['status'] ?? '') === 'active'; // ya incluye pending-cancel con status forzado a 'active'
        if (!$en_vigor) continue;
        $mismo_cliente = $uid_viejo && intval(get_post_meta(intval($s['id']), '_customer_user', true)) === $uid_viejo;
        if (!$mismo_cliente) $mismo_cliente = !empty($viejo['email']) && !empty($s['email']) && strcasecmp($s['email'], $viejo['email']) === 0;
        if (!$mismo_cliente) continue;
        if (($s['horario'] ?? '') !== ($viejo['horario'] ?? '')) continue;
        if (($s['edad'] ?? 'Adultos') !== ($viejo['edad'] ?? 'Adultos')) continue;
        if (blokes_dia_a_pareja($s['dia'] ?? '') !== blokes_dia_a_pareja($viejo['dia'] ?? '')) continue;
        return $s;
    }
    return null;
}

/**
 * Fusionar duplicados: cancela la suscripción vieja que se quedó colgando en espera/pendiente
 * cuando el alumno se volvió a apuntar con una nueva (los 19 casos de octubre) — pero solo si
 * de verdad hay una suscripción más nueva en vigor del mismo cliente y la misma clase; si no,
 * 409 (para no poder cancelar por error a alguien que solo debe un mes, no es un duplicado). No
 * toca la suscripción nueva, ni genera pedido, factura o email, y cancela también los pedidos
 * sin pagar de la vieja.
 */
function superadmin_gestion_fusionar($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $sub_id_viejo = intval($request->get_param('sub_id_viejo'));
    $simular      = (bool) $request->get_param('simular');

    if (!$sub_id_viejo) return new WP_Error('bad_request', 'Falta sub_id_viejo.', array('status' => 400));
    $sub = wcs_get_subscription($sub_id_viejo);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));
    if ($sub->has_status('active')) {
        return new WP_Error('sigue_activa', 'Esa suscripción está activa, no es la vieja a cancelar — revisa el subId.', array('status' => 409));
    }

    $nueva = blokes_buscar_sub_mas_nueva($sub_id_viejo);
    if (!$nueva) {
        return new WP_Error('no_es_duplicado', 'No se ha encontrado ninguna suscripción más nueva en vigor del mismo alumno y la misma clase — esta puede ser la única suya. Revísalo antes de cancelarla a mano (usa "Dar de baja" si es lo que quieres).', array('status' => 409));
    }

    $pedidos_a_cancelar = blokes_cancelar_pedidos_impagados($sub, true);

    if ($simular) {
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
            'subId' => $sub_id_viejo, 'estadoAntes' => $sub->get_status(), 'estadoDespues' => 'cancelled',
            'subIdNueva' => intval($nueva['id']), 'pedidosACancelar' => $pedidos_a_cancelar,
            'aviso' => 'Simulación: no se ha escrito nada en WooCommerce.',
        )));
    }

    $antes = array('status' => $sub->get_status());
    blokes_gestion_sin_emails(function() use ($sub) {
        $sub->update_status('cancelled', 'ExcelMuerte: fusionada/cancelada, duplicado de una suscripción más nueva de la misma clase.');
    });
    $pedidos_cancelados = blokes_cancelar_pedidos_impagados($sub, false);

    $despues = array('status' => 'cancelled', 'pedidosCancelados' => $pedidos_cancelados);
    blokes_gestion_log($sub_id_viejo, 'fusionar', $antes, $despues, array('subIdNueva' => intval($nueva['id'])));

    return rest_ensure_response(array('success' => true, 'data' => $despues));
}

/** Historial de acciones (para depurar o ver «quién, cuándo»). Sin sub_id, las últimas 50. */
function superadmin_gestion_log_get($request) {
    global $wpdb;
    blokes_ensure_gestion_log_table();
    $sub_id = intval($request->get_param('sub_id'));
    $table  = blokes_gestion_log_table();
    if ($sub_id) {
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE sub_id = %d ORDER BY id DESC LIMIT 100", $sub_id), ARRAY_A);
    } else {
        $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY id DESC LIMIT 50", ARRAY_A);
    }
    return rest_ensure_response(array('success' => true, 'data' => $rows));
}

/** Nota por alumno (columna «Observaciones» del Excel): solo meta, sin tocar WooCommerce. */
function superadmin_gestion_nota($request) {
    $sub_id = intval($request->get_param('sub_id'));
    $nota   = sanitize_text_field($request->get_param('nota'));
    if (!$sub_id) return new WP_Error('bad_request', 'Falta sub_id.', array('status' => 400));
    $antes = get_post_meta($sub_id, '_rm_nota', true);
    update_post_meta($sub_id, '_rm_nota', $nota);
    blokes_gestion_log($sub_id, 'nota', $antes, $nota);
    return rest_ensure_response(array('success' => true, 'data' => array('nota' => $nota)));
}

/**
 * Exento/socio (el «*» del Excel de Eva): solo una marca, sin tocar WooCommerce ni el cobro —
 * figura como alumno, pero marcado para que no se cuente como impago/duda de cobro.
 */
function superadmin_gestion_exento($request) {
    $sub_id = intval($request->get_param('sub_id'));
    $exento = (bool) $request->get_param('exento');
    if (!$sub_id) return new WP_Error('bad_request', 'Falta sub_id.', array('status' => 400));
    $antes = (bool) get_post_meta($sub_id, '_rm_exento', true);
    if ($exento) update_post_meta($sub_id, '_rm_exento', '1');
    else delete_post_meta($sub_id, '_rm_exento');
    blokes_gestion_log($sub_id, 'exento', $antes, $exento);
    return rest_ensure_response(array('success' => true, 'data' => array('exento' => $exento)));
}

/**
 * Busca en el catálogo de clases (Classes/Días sueltos) la variación que corresponde a un
 * día/horario/edad concretos — misma lógica que ya usaba superadmin_gestion_cambiar_grupo(),
 * extraída aquí para reutilizarla también al crear un alumno nuevo
 * (superadmin_gestion_alta_cliente()). $dia/$horario/$edad deben venir ya normalizados
 * (blokes_normalizar_dia/horario/edad). Devuelve null si no existe esa combinación, o un array
 * con la variación encontrada y los datos derivados (frecuencia, producto, edad real buscada —
 * Adolescentes se busca como Adultos, ver comentario abajo).
 */
function blokes_buscar_variacion_clase($dia, $horario, $edad) {
    if (!class_exists('RocoMadrid_Step_Form')) return null;
    $product_classes_id = RocoMadrid_Step_Form::product_tarifas_id();
    $product_single_id  = RocoMadrid_Step_Form::product_dias_sueltos_id();

    // 2 días/semana (bloques "Lunes-Miércoles"/"Martes-Jueves") van al producto Classes; un solo
    // día va al producto de Días sueltos. Adolescentes NO es un término pa_edad real en ningún
    // catálogo: hoy se monta sobre la variación de Adultos del mismo día/horario (precio
    // ajustado por addon en el alta normal) — aquí hacemos lo mismo: buscamos la variación de
    // Adultos; el precio real de Adolescentes se calcula aparte con RocoMadrid_SF_Pricing.
    $frecuencia = (strpos($dia, '-') !== false) ? '2_days' : '1_day';
    $target_product_id = ($frecuencia === '2_days') ? $product_classes_id : $product_single_id;
    $target_taxonomy    = ($frecuencia === '2_days') ? 'pa_dias' : 'pa_dia-suelto';
    $edad_buscar = ($edad === blokes_normalizar_edad('Adolescentes')) ? 'Adultos' : $edad;

    $producto = wc_get_product($target_product_id);
    if (!$producto) return null;
    foreach ($producto->get_children() as $vid) {
        $variacion = wc_get_product($vid);
        if (!$variacion) continue;
        $attrs = $variacion->get_attributes();
        $dia_slug     = $attrs[$target_taxonomy] ?? '';
        $horario_slug = $attrs['pa_horario'] ?? '';
        $edad_slug    = $attrs['pa_edad'] ?? '';
        $dia_term     = $dia_slug     ? get_term_by('slug', $dia_slug,     $target_taxonomy) : null;
        $horario_term = $horario_slug ? get_term_by('slug', $horario_slug, 'pa_horario') : null;
        $edad_term    = $edad_slug    ? get_term_by('slug', $edad_slug,    'pa_edad')    : null;
        $dia_v     = blokes_normalizar_dia($dia_term ? $dia_term->name : ucfirst($dia_slug));
        $horario_v = blokes_normalizar_horario($horario_term ? $horario_term->name : $horario_slug);
        $edad_v    = blokes_normalizar_edad($edad_term ? $edad_term->name : ($edad_slug ? ucfirst($edad_slug) : 'Adultos'));
        if ($dia_v === $dia && $horario_v === $horario && $edad_v === $edad_buscar) {
            return array(
                'variacion' => $variacion, 'frecuencia' => $frecuencia,
                'targetProductId' => $target_product_id, 'targetTaxonomy' => $target_taxonomy,
                'claveDia' => $target_taxonomy,
            );
        }
    }
    return null;
}

/**
 * Cambiar de grupo/horario, o de 1 a 2 días (y al revés) (8.2.5). Solo para suscripciones de
 * clase semanal (producto "Classes"/Tarifas) — no aplica a Pilates, Yoga ni Días sueltos. Busca
 * en el catálogo de WooCommerce la variación que corresponde a la combinación nueva (la misma
 * que lista `GET /progreso/v1/clases`) y recalcula el precio con la tabla de tarifas vigente
 * (RocoMadrid_SF_Pricing, la misma que usa el formulario de alta), respetando el plan de pago
 * actual (mensual/trimestral/anual) — cambiar de grupo no cambia cada cuánto se cobra, solo
 * cuánto. No crea pedido ni toca renovaciones ya pagadas: el histórico queda intacto, el precio
 * nuevo se nota desde la próxima renovación. Excepción: si el pedido padre (el "enlace de pago"
 * inicial) sigue sin pagar (pending/on-hold), su línea y total se actualizan igual que los de la
 * sub, para que el enlace ya pendiente cobre el grupo/precio nuevos (cowork, 07/11 10:10) — un
 * pedido ya pagado nunca se toca.
 */
function superadmin_gestion_cambiar_grupo($request) {
    if (!function_exists('wcs_get_subscription') || !class_exists('RocoMadrid_Step_Form') || !class_exists('RocoMadrid_SF_Pricing')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions o RocoMadrid Step Form no disponibles.', array('status' => 503));
    }
    $sub_id        = intval($request->get_param('sub_id'));
    $dia_nuevo     = blokes_normalizar_dia(sanitize_text_field((string) $request->get_param('dia')));
    $horario_nuevo = blokes_normalizar_horario(sanitize_text_field((string) $request->get_param('horario')));
    $edad_param    = $request->get_param('edad');
    $simular       = (bool) $request->get_param('simular');

    if (!$sub_id || !$dia_nuevo || !$horario_nuevo) {
        return new WP_Error('bad_request', 'Faltan sub_id, dia o horario.', array('status' => 400));
    }
    $sub = wcs_get_subscription($sub_id);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));

    $product_classes_id = RocoMadrid_Step_Form::product_tarifas_id();
    $product_single_id  = RocoMadrid_Step_Form::product_dias_sueltos_id();
    $item = null;
    foreach ($sub->get_items() as $it) {
        $pid = intval($it->get_product_id());
        if ($pid === intval($product_classes_id) || $pid === intval($product_single_id)) { $item = $it; break; }
    }
    if (!$item) {
        return new WP_Error('no_aplica', 'Esta suscripción no es de un grupo semanal ni de un día suelto (Classes/Días sueltos) — esta acción no aplica a Pilates ni Yoga.', array('status' => 400));
    }

    // Si el pedido padre (el "enlace de pago" inicial) sigue sin pagar, su línea se actualiza
    // igual que la de la sub — si no, el enlace seguiría cobrando el grupo y el precio viejos
    // aunque la sub ya esté bien (cowork, 07/11 10:10). Nunca se toca un pedido ya pagado
    // (facturado/histórico): eso sigue intacto, como dice el comentario de arriba.
    $item_padre = null;
    $orden_padre = null;
    $parent_id = $sub->get_parent_id();
    if ($parent_id) {
        $orden_padre_candidata = wc_get_order($parent_id);
        if ($orden_padre_candidata && in_array($orden_padre_candidata->get_status(), array('pending', 'on-hold'), true)) {
            foreach ($orden_padre_candidata->get_items() as $it) {
                $pid = intval($it->get_product_id());
                if ($pid === intval($product_classes_id) || $pid === intval($product_single_id)) { $item_padre = $it; break; }
            }
            if ($item_padre) $orden_padre = $orden_padre_candidata;
        }
    }

    // ¿Es de 1 día (Días sueltos) o de 2 días (Classes)? La clave de _step_form_selections y la
    // taxonomía de la variación cambian según cuál sea (mismo criterio que usa
    // RocoMadrid_SF_Stats::get_all_subscription_data() para leer el día actual de cada tipo).
    $es_dias_sueltos_actual = (intval($item->get_product_id()) === intval($product_single_id));
    $clave_dia_actual = $es_dias_sueltos_actual ? 'pa_dia-suelto' : 'pa_dias';

    // Día/horario/edad actuales: para el "antes" y como valor por defecto de la edad si no se
    // pide cambiarla también. Mismo orden de prioridad que en blokes_get_pending_cancel_alumnos:
    // primero _step_form_selections, si falta se mira la variación de WooCommerce.
    $selecciones_actuales = $item->get_meta('_step_form_selections', true);
    $dia_actual = $horario_actual = $edad_actual = '';
    if (!empty($selecciones_actuales) && is_array($selecciones_actuales)) {
        $dia_actual     = $selecciones_actuales[$clave_dia_actual] ?? '';
        $horario_actual = $selecciones_actuales['pa_horario']      ?? '';
        $edad_actual    = $selecciones_actuales['pa_edad']         ?? '';
    }
    if (empty($dia_actual) || empty($horario_actual) || empty($edad_actual)) {
        $variacion_actual = wc_get_product($item->get_variation_id());
        if ($variacion_actual) {
            foreach ($variacion_actual->get_variation_attributes() as $key => $value) {
                $key_lower = strtolower($key);
                if (empty($dia_actual) && (strpos($key_lower, 'dia-suelto') !== false || strpos($key_lower, 'dias') !== false)) $dia_actual = $value;
                if (empty($horario_actual) && strpos($key_lower, 'horario') !== false) $horario_actual = $value;
                if (empty($edad_actual) && strpos($key_lower, 'edad') !== false) $edad_actual = $value;
            }
        }
    }
    $dia_actual     = blokes_normalizar_dia($dia_actual);
    $horario_actual = blokes_normalizar_horario($horario_actual);
    $edad_actual    = blokes_normalizar_edad($edad_actual);
    $edad_nuevo     = ($edad_param !== null && $edad_param !== '') ? blokes_normalizar_edad(sanitize_text_field((string) $edad_param)) : $edad_actual;

    // Busca en el catálogo (Classes/Días sueltos) la variación que corresponde a la combinación
    // nueva — Adolescentes se busca como la variación de Adultos del mismo día/horario (no es
    // un término pa_edad real, ver blokes_buscar_variacion_clase()).
    $encontrado = blokes_buscar_variacion_clase($dia_nuevo, $horario_nuevo, $edad_nuevo);
    if (!$encontrado) {
        return new WP_Error('no_existe', 'No existe esa combinación de día, horario y edad en el catálogo de clases.', array('status' => 404));
    }
    $variacion_nueva = $encontrado['variacion'];
    $frecuencia      = $encontrado['frecuencia'];

    // Precio nuevo según la tabla de tarifas vigente (misma lógica que el formulario de alta),
    // respetando el plan de pago actual (mensual/trimestral/anual). Usa $edad_nuevo (no
    // $edad_buscar): el precio de Adolescentes es distinto al de la variación de Adultos que se
    // reutiliza como variación real.
    $planes = RocoMadrid_SF_Pricing::calculate_plan_prices(array(
        'pa_dias' => $dia_nuevo, 'pa_horario' => $horario_nuevo, 'pa_edad' => $edad_nuevo, 'frequency' => $frecuencia,
    ));
    $periodo  = $sub->get_billing_period();
    $interval = max(1, intval($sub->get_billing_interval()));
    $plan_key = ($periodo === 'year') ? 'annual' : (($interval >= 3) ? 'quarterly' : 'monthly');
    $precio_nuevo  = floatval($planes[$plan_key]['price'] ?? $planes['monthly']['price']);
    $precio_actual = floatval($sub->get_total());

    $antes   = array('dia' => $dia_actual, 'horario' => $horario_actual, 'edad' => $edad_actual, 'precio' => $precio_actual);
    $despues = array('dia' => $dia_nuevo,  'horario' => $horario_nuevo,  'edad' => $edad_nuevo,  'precio' => $precio_nuevo);

    if ($simular) {
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
            'subId' => $sub_id, 'antes' => $antes, 'despues' => $despues,
            'actualizaPedidoPendiente' => $item_padre ? $orden_padre->get_id() : null,
            'aviso' => 'Simulación: no se ha escrito nada en WooCommerce.',
        )));
    }

    blokes_gestion_sin_emails(function() use ($item, $sub, $item_padre, $orden_padre, $variacion_nueva, $dia_nuevo, $horario_nuevo, $edad_nuevo, $precio_nuevo, $selecciones_actuales, $frecuencia, $clave_dia_actual, $periodo, $interval) {
        // Si cambia de 1 a 2 días (o al revés) la variación nueva es de OTRO producto padre
        // (Días sueltos ↔ Classes) — hay que actualizar también product_id, no solo
        // variation_id, para que no quede una variación "huérfana" de otro padre en el pedido.
        $item->set_product_id($variacion_nueva->get_parent_id());
        $item->set_variation_id($variacion_nueva->get_id());
        $item->set_name($variacion_nueva->get_name());
        $nuevas_selecciones = is_array($selecciones_actuales) ? $selecciones_actuales : array();
        $clave_dia_nueva = ($frecuencia === '2_days') ? 'pa_dias' : 'pa_dia-suelto';
        if ($clave_dia_nueva !== $clave_dia_actual) unset($nuevas_selecciones[$clave_dia_actual]);
        $nuevas_selecciones[$clave_dia_nueva] = $dia_nuevo;
        $nuevas_selecciones['pa_horario'] = $horario_nuevo;
        $nuevas_selecciones['pa_edad']    = $edad_nuevo;
        if (isset($nuevas_selecciones['frequency'])) $nuevas_selecciones['frequency'] = $frecuencia;
        $item->add_meta_data('_step_form_selections', $nuevas_selecciones, true);
        blokes_gestion_actualizar_meta_visible_grupo($item, $edad_nuevo, $periodo, $interval);
        $item->set_subtotal($precio_nuevo);
        $item->set_total($precio_nuevo);
        $item->save();
        $sub->calculate_totals(false);
        $sub->add_order_note(sprintf(
            'ExcelMuerte: cambio de grupo a %s · %s (%s), %s €.',
            $dia_nuevo, $horario_nuevo, $edad_nuevo, number_format($precio_nuevo, 2, ',', '.')
        ));
        $sub->save();

        // El pedido padre ("enlace de pago" inicial) solo se toca si sigue sin pagar — si no, el
        // enlace cobraría el grupo y el precio viejos aunque la sub ya esté bien (cowork, 07/11
        // 10:10). Un pedido ya pagado/facturado nunca se tocaría aquí.
        if ($item_padre && $orden_padre) {
            $item_padre->set_product_id($variacion_nueva->get_parent_id());
            $item_padre->set_variation_id($variacion_nueva->get_id());
            $item_padre->set_name($variacion_nueva->get_name());
            $item_padre->add_meta_data('_step_form_selections', $nuevas_selecciones, true);
            blokes_gestion_actualizar_meta_visible_grupo($item_padre, $edad_nuevo, $periodo, $interval);
            $item_padre->set_subtotal($precio_nuevo);
            $item_padre->set_total($precio_nuevo);
            $item_padre->save();
            $orden_padre->calculate_totals();
            $orden_padre->add_order_note(sprintf(
                'ExcelMuerte: cambio de grupo a %s · %s (%s), %s € — pedido actualizado al no estar pagado aún.',
                $dia_nuevo, $horario_nuevo, $edad_nuevo, number_format($precio_nuevo, 2, ',', '.')
            ));
            $orden_padre->save();
        }
    });

    blokes_gestion_log($sub_id, 'cambiar_grupo', $antes, $despues);

    return rest_ensure_response(array('success' => true, 'data' => array(
        'subId' => $sub_id, 'antes' => $antes, 'despues' => $despues,
        'pedidoPendienteActualizado' => $item_padre ? $orden_padre->get_id() : null,
    )));
}

// Corrige la meta visible (Día/Horario/Edad del alumno) de toda suscripción que pasó por
// "Cambiar de grupo" o "Crear cliente en la web" (cowork, 07/11) — usa el "después" ya guardado
// en blokes_gestion_log (el último de cada sub). Borra las metas sueltas «Día»/«Horario» que
// dejó la primera versión de esta migración, deja los `pa_*` con el slug de la variación y rehace
// `_step_form_display`. No toca precio ni variación. En las altas de "Crear cliente" también
// arregla la línea del pedido inicial y pone `_step_form_selections` en la suscripción si falta
// (no se guardaba, ver superadmin_gestion_crear_cliente). Idempotente.
function superadmin_cambiar_grupo_arreglar_meta_visible($request) {
    if (!function_exists('wcs_get_subscription') || !class_exists('RocoMadrid_Step_Form')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions o RocoMadrid Step Form no disponibles.', array('status' => 503));
    }
    global $wpdb;
    $tabla = blokes_gestion_log_table();
    $filas = $wpdb->get_results("SELECT * FROM {$tabla} WHERE accion IN ('cambiar_grupo', 'alta_cliente') ORDER BY id ASC", ARRAY_A);
    $ultimo_por_sub = array();
    foreach ($filas as $fila) { $ultimo_por_sub[intval($fila['sub_id'])] = $fila; } // el más reciente pisa al anterior

    $product_classes_id = intval(RocoMadrid_Step_Form::product_tarifas_id());
    $product_single_id  = intval(RocoMadrid_Step_Form::product_dias_sueltos_id());
    $item_de_clase = function($objeto) use ($product_classes_id, $product_single_id) {
        foreach ($objeto->get_items() as $it) {
            $pid = intval($it->get_product_id());
            if ($pid === $product_classes_id || $pid === $product_single_id) return $it;
        }
        return null;
    };
    $resultado = array();
    foreach ($ultimo_por_sub as $sub_id => $fila) {
        $despues = json_decode($fila['despues'], true);
        if (!is_array($despues) || empty($despues['dia']) || empty($despues['horario'])) {
            // Altas de abono (sin día/horario): no tienen meta de grupo que arreglar
            if ($fila['accion'] !== 'alta_cliente') $resultado[] = array('subId' => $sub_id, 'error' => 'log sin dia/horario');
            continue;
        }
        $sub = wcs_get_subscription($sub_id);
        if (!$sub) { $resultado[] = array('subId' => $sub_id, 'error' => 'suscripción no encontrada'); continue; }
        $item = $item_de_clase($sub);
        if (!$item) { $resultado[] = array('subId' => $sub_id, 'error' => 'sin línea de clases/días sueltos'); continue; }

        $edad  = $despues['edad'] ?? 'Adultos';
        $items = array($item);
        if ($fila['accion'] === 'alta_cliente') {
            $orden = !empty($despues['orderId']) ? wc_get_order(intval($despues['orderId'])) : null;
            $item_orden = $orden ? $item_de_clase($orden) : null;
            if ($item_orden) $items[] = $item_orden;
        }
        $periodo_sub  = $sub->get_billing_period();
        $interval_sub = max(1, intval($sub->get_billing_interval()));
        blokes_gestion_sin_emails(function() use ($items, $despues, $edad, $periodo_sub, $interval_sub) {
            foreach ($items as $it) {
                if (!$it->get_meta('_step_form_selections', true)) {
                    $clave_dia = (strpos($despues['dia'], '-') !== false) ? 'pa_dias' : 'pa_dia-suelto';
                    $it->add_meta_data('_step_form_selections', array($clave_dia => $despues['dia'], 'pa_horario' => $despues['horario'], 'pa_edad' => $edad), true);
                }
                blokes_gestion_actualizar_meta_visible_grupo($it, $edad, $periodo_sub, $interval_sub);
                $it->save();
            }
        });
        $resultado[] = array('subId' => $sub_id, 'accion' => $fila['accion'], 'dia' => $despues['dia'], 'horario' => $despues['horario'], 'edad' => $edad);
    }
    return rest_ensure_response(array('success' => true, 'data' => $resultado));
}

// Nombre real (facturación) y teléfono del alumno, editable desde Grupos sin tocar wp-admin —
// para las suscripciones dadas de alta sin dirección de facturación, que solo enseñan el
// usuario de la cuenta de WordPress, no un nombre real. Actualiza la dirección de facturación de ESTA
// suscripción (de donde la lee Grupos) y, si hay un usuario detrás, también su perfil, para que
// el resto de la web (otras suscripciones suyas, WooCommerce) vea lo mismo.
function superadmin_gestion_editar_alumno($request) {
    if (!function_exists('wcs_get_subscription')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions not available.', array('status' => 503));
    }
    $sub_id    = intval($request->get_param('sub_id'));
    $nombre    = sanitize_text_field((string) $request->get_param('nombre'));
    $apellidos = sanitize_text_field((string) $request->get_param('apellidos'));
    $telefono  = sanitize_text_field((string) $request->get_param('telefono'));
    $tutor_nombre   = sanitize_text_field((string) $request->get_param('tutorNombre'));
    $tutor_telefono = sanitize_text_field((string) $request->get_param('tutorTelefono'));
    if (!$sub_id || ($nombre === '' && $apellidos === '' && $telefono === '' && $tutor_nombre === '' && $tutor_telefono === '')) {
        return new WP_Error('bad_request', 'Falta sub_id y al menos un dato que cambiar.', array('status' => 400));
    }
    $sub = wcs_get_subscription($sub_id);
    if (!$sub) return new WP_Error('not_found', 'Suscripción no encontrada.', array('status' => 404));

    $antes = array(
        'nombre' => $sub->get_billing_first_name(), 'apellidos' => $sub->get_billing_last_name(),
        'telefono' => $sub->get_billing_phone(),
        'tutorNombre' => get_post_meta($sub_id, '_rm_tutor_nombre', true), 'tutorTelefono' => get_post_meta($sub_id, '_rm_tutor_telefono', true),
    );
    if ($nombre !== '')    $sub->set_billing_first_name($nombre);
    if ($apellidos !== '') $sub->set_billing_last_name($apellidos);
    if ($telefono !== '')  $sub->set_billing_phone(blokes_externos_normaliza_telefono($telefono) ?: $telefono);
    $sub->save();

    $uid = intval(get_post_meta($sub_id, '_customer_user', true));
    if ($uid) {
        if ($nombre !== '')    update_user_meta($uid, 'billing_first_name', $nombre);
        if ($apellidos !== '') update_user_meta($uid, 'billing_last_name', $apellidos);
        if ($telefono !== '')  update_user_meta($uid, 'billing_phone', $telefono);
    }
    // Tutor (padre/madre de un menor): campo propio de la suscripción, no de facturación.
    // Igual que nombre/apellidos/teléfono: deja el campo en blanco para no cambiarlo.
    if ($tutor_nombre !== '')   update_post_meta($sub_id, '_rm_tutor_nombre', $tutor_nombre);
    if ($tutor_telefono !== '') update_post_meta($sub_id, '_rm_tutor_telefono', blokes_externos_normaliza_telefono($tutor_telefono) ?: $tutor_telefono);

    $despues = array(
        'nombre' => $sub->get_billing_first_name(), 'apellidos' => $sub->get_billing_last_name(), 'telefono' => $sub->get_billing_phone(),
        'tutorNombre' => get_post_meta($sub_id, '_rm_tutor_nombre', true), 'tutorTelefono' => get_post_meta($sub_id, '_rm_tutor_telefono', true),
    );
    blokes_gestion_log($sub_id, 'editar_alumno', $antes, $despues);

    return rest_ensure_response(array('success' => true, 'data' => $despues));
}

// Buscar por nombre, teléfono o email en suscripciones (cualquier estado, para encontrar
// también antiguos alumnos de baja), externos y, si no aparece en ninguno de los dos, en los
// usuarios de WordPress (registrado sin ninguna clase). Primer paso del botón "Añadir alumno"
// de cada grupo: de momento solo busca y enseña dónde está cada uno — "Transferir aquí" y
// "Añadir a este grupo" quedan para cuando se confirme con el catálogo real si el producto de
// Clases ya tiene variaciones de 1 día (no solo las parejas de 2 días), ver la nota en
// NOTAS_PARA_CODE_mananas_y_datos.md.
function superadmin_gestion_buscar_alumno($request) {
    if (!function_exists('wcs_get_subscription') || !class_exists('RocoMadrid_SF_Stats')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions no disponible. Llama a este endpoint en el subsitio del club.', array('status' => 503));
    }
    $q = trim((string) $request->get_param('q'));
    if (mb_strlen($q) < 2) {
        return new WP_Error('bad_request', 'Escribe al menos 2 caracteres (nombre, teléfono o email).', array('status' => 400));
    }
    // Cada palabra de la búsqueda cuenta por separado y por puntos: "nombre apellido" tiene que
    // encontrar una ficha donde solo coincida el apellido (con otro nombre de pila guardado), no
    // solo la frase completa. También puntúa el nombre/teléfono del TUTOR, para encontrar a un
    // alumno menor buscando por su padre/madre.
    $q_words = array_values(array_filter(preg_split('/\s+/', $q)));
    $q_tel_general = blokes_externos_normaliza_telefono($q);
    $q_tel_valida  = strlen($q_tel_general) >= 6;

    $puntos = function($nombre, $telefono, $email, $tutorNombre = '', $tutorTelefono = '') use ($q_words) {
        $score = 0;
        foreach ($q_words as $palabra) {
            $p_norm  = blokes_externos_normaliza_nombre($palabra);
            $p_tel   = blokes_externos_normaliza_telefono($palabra);
            $p_tel_valida = strlen($p_tel) >= 6;
            $p_email = mb_strtolower($palabra);
            $hit = false;
            if ($p_norm !== '' && strpos(blokes_externos_normaliza_nombre((string) $nombre), $p_norm) !== false) $hit = true;
            if (!$hit && $p_norm !== '' && $tutorNombre !== '' && strpos(blokes_externos_normaliza_nombre((string) $tutorNombre), $p_norm) !== false) $hit = true;
            if (!$hit && $p_tel_valida && $telefono && strpos(blokes_externos_normaliza_telefono((string) $telefono), $p_tel) !== false) $hit = true;
            if (!$hit && $p_tel_valida && $tutorTelefono && strpos(blokes_externos_normaliza_telefono((string) $tutorTelefono), $p_tel) !== false) $hit = true;
            if (!$hit && $p_email !== '' && $email && strpos(mb_strtolower((string) $email), $p_email) !== false) $hit = true;
            if ($hit) $score++;
        }
        return $score;
    };

    $personas = array();
    $marcar_score = function(&$personas, $key, $score) {
        $personas[$key]['score'] = max($personas[$key]['score'] ?? 0, $score);
    };

    foreach (blokes_get_all_subscription_data() as $sub) {
        if (empty($sub['id'])) continue;
        $sub_obj = wcs_get_subscription(intval($sub['id']));
        if (!$sub_obj) continue;
        $telefono = $sub_obj->get_billing_phone() ?: ($sub['telefono'] ?? '');
        $nombre   = trim($sub_obj->get_billing_first_name() . ' ' . $sub_obj->get_billing_last_name()) ?: ($sub['cliente'] ?? '');
        $email    = $sub_obj->get_billing_email() ?: ($sub['email'] ?? '');
        $tutor_nombre   = get_post_meta($sub_obj->get_id(), '_rm_tutor_nombre', true) ?: '';
        $tutor_telefono = get_post_meta($sub_obj->get_id(), '_rm_tutor_telefono', true) ?: '';
        $score = $puntos($nombre, $telefono, $email, $tutor_nombre, $tutor_telefono);
        if ($score === 0) continue;

        // Preferir el id de cliente de la API de Woo (fiable con HPOS) y, si falta, el
        // teléfono normalizado, para que varias suscripciones antiguas de la misma persona sin
        // usuario de WordPress salgan juntas en un solo resultado, no una fila por suscripción.
        $uid = intval($sub_obj->get_customer_id());
        if (!$uid) $uid = intval(get_post_meta($sub_obj->get_id(), '_customer_user', true));
        $key = $uid ? "u{$uid}" : ($telefono ? 't' . blokes_externos_normaliza_telefono($telefono) : ('s' . intval($sub['id'])));
        if (!isset($personas[$key])) {
            $personas[$key] = array(
                'uid' => $uid ?: null, 'nombre' => $nombre, 'telefono' => $telefono, 'email' => $email,
                'tutorNombre' => $tutor_nombre, 'tutorTelefono' => $tutor_telefono, 'grupos' => array(),
            );
        }
        $status = $sub['status'] ?? '';
        $estado = $status === 'active' ? 'activo'
            : ($status === 'on-hold' ? 'en_espera_o_pausado' : ($status === 'pending' ? 'pendiente_pago' : ($status === 'cancelled' ? 'baja' : $status)));
        $personas[$key]['grupos'][] = array(
            'subId' => intval($sub['id']), 'dia' => $sub['dia'] ?? '', 'horario' => $sub['horario'] ?? '', 'edad' => $sub['edad'] ?: 'Adultos',
            'estado' => $estado, 'label' => trim(($sub['dia'] ?? '') . ' · ' . ($sub['horario'] ?? ''), ' ·'),
        );
        $marcar_score($personas, $key, $score);
    }

    foreach (blokes_externos_todos() as $ext) {
        $score = $puntos($ext['nombre'], $ext['telefono'], '', $ext['tutor_nombre'] ?: '', $ext['tutor_telefono'] ?: '');
        if ($score === 0) continue;
        $key = 'ext' . $ext['id'];
        $personas[$key] = array(
            'uid' => null, 'externoId' => intval($ext['id']), 'nombre' => $ext['nombre'], 'telefono' => $ext['telefono'], 'email' => '',
            'tutorNombre' => $ext['tutor_nombre'] ?: '', 'tutorTelefono' => $ext['tutor_telefono'] ?: '',
            'grupos' => array(array(
                'externoId' => intval($ext['id']), 'dia' => $ext['dia'], 'horario' => $ext['horario'], 'edad' => $ext['edad'] ?: 'Adultos',
                'estado' => $ext['activo'] ? 'externo' : 'externo_baja', 'label' => trim($ext['dia'] . ' · ' . $ext['horario'], ' ·'),
            )),
        );
        $marcar_score($personas, $key, $score);
    }

    // Usuarios de WordPress que no han salido ya por tener suscripción o externo propio
    // (alumno antiguo, o registrado desde la web sin apuntarse a ninguna clase).
    $args = $q_tel_valida
        ? array('number' => 15, 'meta_query' => array(array('key' => 'billing_phone', 'value' => $q_tel_general, 'compare' => 'LIKE')))
        : array('number' => 15, 'search' => '*' . $q . '*', 'search_columns' => array('user_login', 'user_email', 'display_name'));
    foreach (get_users($args) as $u) {
        $key = "u{$u->ID}";
        if (isset($personas[$key])) continue;
        $nombre = trim($u->first_name . ' ' . $u->last_name) ?: $u->display_name;
        $score = $puntos($nombre, get_user_meta($u->ID, 'billing_phone', true), $u->user_email);
        if ($score === 0) continue;
        $personas[$key] = array(
            'uid' => $u->ID, 'nombre' => $nombre, 'telefono' => get_user_meta($u->ID, 'billing_phone', true), 'email' => $u->user_email,
            'tutorNombre' => '', 'tutorTelefono' => '', 'grupos' => array(),
        );
        $marcar_score($personas, $key, $score);
    }

    usort($personas, function($a, $b) { return $b['score'] <=> $a['score']; });
    $personas = array_map(function($p) { unset($p['score']); return $p; }, array_values($personas));

    return rest_ensure_response(array('success' => true, 'data' => $personas));
}

/**
 * Crear cliente nuevo en WooCommerce desde "Añadir alumno" cuando no existe (Ramiro, 07/11
 * 08:06, NOTAS_PARA_CODE_pestanas_grupos.md) — hasta ahora solo se podía dar de alta "externo"
 * (fuera de la web) o asignar a un cliente YA existente (y eso exigía manage_woocommerce, solo
 * wp-admin). Crea el usuario de WordPress (o reutiliza uno existente), la suscripción con la
 * variación/producto correcto y la misma meta visible que pone el step-form al comprar, y deja
 * el primer pago en uno de dos caminos: completado de verdad (como "Marcar cobrado", con su
 * misma excepción de precio) o un enlace de pago con tarjeta pendiente de que el cliente pague.
 */
function superadmin_gestion_alta_cliente($request) {
    if (!function_exists('wcs_create_subscription') || !class_exists('RocoMadrid_Step_Form') || !class_exists('RocoMadrid_SF_Pricing')) {
        return new WP_Error('class_not_found', 'WooCommerce Subscriptions o RocoMadrid Step Form no disponibles.', array('status' => 503));
    }
    $nombre        = sanitize_text_field((string) $request->get_param('nombre'));
    $apellidos     = sanitize_text_field((string) $request->get_param('apellidos'));
    $email         = sanitize_email((string) $request->get_param('email'));
    $telefono_in   = sanitize_text_field((string) $request->get_param('telefono'));
    $telefono      = blokes_externos_normaliza_telefono($telefono_in) ?: $telefono_in;
    $tipo          = sanitize_key((string) $request->get_param('tipo')); // 'clase' | 'abono'
    $dia_in        = sanitize_text_field((string) $request->get_param('dia'));
    $horario_in    = sanitize_text_field((string) $request->get_param('horario'));
    $edad_in       = sanitize_text_field((string) $request->get_param('edad'));
    $plan          = sanitize_key((string) $request->get_param('plan')); // monthly|quarterly|annual (solo 'clase')
    $producto_abono_id = intval($request->get_param('productoAbonoId'));
    $fecha_inicio  = sanitize_text_field((string) $request->get_param('fechaInicio'));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_inicio)) $fecha_inicio = current_time('Y-m-d');
    $primer_pago   = sanitize_key((string) $request->get_param('primerPago')); // 'ya_pagado' | 'enlace_pago'
    $metodo        = sanitize_key((string) $request->get_param('metodo'));
    $importe_pago  = floatval($request->get_param('importe'));
    $fecha_pago    = sanitize_text_field((string) $request->get_param('fechaPago'));
    $ajustar_precio = sanitize_key((string) $request->get_param('ajustarPrecio'));
    if (!in_array($ajustar_precio, array('', 'solo_este_mes', 'desde_ahora'), true)) $ajustar_precio = '';
    $motivo_excepcion = sanitize_text_field((string) $request->get_param('motivoExcepcion'));
    $enviar_acceso   = (bool) $request->get_param('enviarAcceso');
    $usar_cliente_id = intval($request->get_param('usarClienteId'));
    $confirmar_nuevo = (bool) $request->get_param('confirmarNuevo');
    $simular         = (bool) $request->get_param('simular');

    if (!$nombre || (!$email && !$telefono)) {
        return new WP_Error('bad_request', 'Falta el nombre y al menos email o teléfono.', array('status' => 400));
    }
    if (!in_array($tipo, array('clase', 'abono'), true)) {
        return new WP_Error('bad_request', 'tipo debe ser "clase" o "abono".', array('status' => 400));
    }
    if ($primer_pago === 'ya_pagado' && (!$metodo || $importe_pago <= 0)) {
        return new WP_Error('bad_request', 'Falta el método o el importe del primer pago.', array('status' => 400));
    }
    if ($primer_pago === 'ya_pagado' && !in_array($metodo, array('transferencia', 'tarjeta', 'efectivo', 'wellhub', 'bizum'), true)) {
        return new WP_Error('bad_request', 'Método no reconocido. Usa transferencia, tarjeta, efectivo, bizum o wellhub.', array('status' => 400));
    }
    if (!in_array($primer_pago, array('ya_pagado', 'enlace_pago'), true)) {
        return new WP_Error('bad_request', 'primerPago debe ser "ya_pagado" o "enlace_pago".', array('status' => 400));
    }
    if ($ajustar_precio !== '' && $motivo_excepcion === '') {
        return new WP_Error('falta_motivo', 'El motivo de la excepción de precio es obligatorio.', array('status' => 400));
    }

    // --- Variación/producto y precio de catálogo ---
    $dia_norm = $horario_norm = $edad_norm = '';
    $producto_item = null; $frecuencia = null; $billing_period = 'month'; $billing_interval = 1;
    if ($tipo === 'clase') {
        $dia_norm     = blokes_normalizar_dia($dia_in);
        $horario_norm = blokes_normalizar_horario($horario_in);
        $edad_norm    = blokes_normalizar_edad($edad_in);
        if (!$dia_norm || !$horario_norm) return new WP_Error('bad_request', 'Faltan dia/horario.', array('status' => 400));
        if (!in_array($plan, array('monthly', 'quarterly', 'annual'), true)) {
            return new WP_Error('bad_request', 'plan debe ser monthly, quarterly o annual.', array('status' => 400));
        }
        $encontrado = blokes_buscar_variacion_clase($dia_norm, $horario_norm, $edad_norm);
        if (!$encontrado) return new WP_Error('no_existe', 'No existe esa combinación de día, horario y edad en el catálogo.', array('status' => 404));
        $producto_item = $encontrado['variacion'];
        $frecuencia     = $encontrado['frecuencia'];
        $billing_period   = ($plan === 'annual') ? 'year' : 'month';
        $billing_interval = ($plan === 'quarterly') ? 3 : 1;
        $planes = RocoMadrid_SF_Pricing::calculate_plan_prices(array(
            'pa_dias' => $dia_norm, 'pa_horario' => $horario_norm, 'pa_edad' => $edad_norm, 'frequency' => $frecuencia,
        ));
        $plan_key = ($plan === 'annual') ? 'annual' : (($plan === 'quarterly') ? 'quarterly' : 'monthly');
        $precio_catalogo = floatval($planes[$plan_key]['price'] ?? $planes['monthly']['price']);
    } else {
        $abono_ids = array(5114, 5115, 7753, 7754, 7755, 7756);
        if (!in_array($producto_abono_id, $abono_ids, true)) {
            return new WP_Error('bad_request', 'productoAbonoId debe ser uno de los abonos existentes (5114, 5115, 7753-7756).', array('status' => 400));
        }
        $producto_item = wc_get_product($producto_abono_id);
        if (!$producto_item) return new WP_Error('not_found', 'Abono no encontrado en WooCommerce.', array('status' => 404));
        $precio_catalogo = floatval($producto_item->get_regular_price());
        $billing_period   = get_post_meta($producto_abono_id, '_subscription_period', true) ?: 'month';
        $billing_interval = max(1, intval(get_post_meta($producto_abono_id, '_subscription_period_interval', true) ?: 1));
    }
    $importe_final = ($primer_pago === 'ya_pagado' && $importe_pago > 0) ? $importe_pago : $precio_catalogo;

    // --- Posible duplicado: mismo email (de verdad, WordPress no permite repetirlo) o
    // teléfono/nombre parecido ya visto en Grupos/externos/usuarios (reutiliza el mismo
    // buscador de "Añadir alumno" — nunca una lógica de coincidencia nueva). ---
    $uid_por_email = $email ? email_exists($email) : false;
    $duplicado = null;
    $buscar_duplicado = function($q) {
        if (!$q || mb_strlen($q) < 2) return null;
        $req_busqueda = new WP_REST_Request('GET', '/superadmin/v1/gestion/buscar-alumno');
        $req_busqueda->set_param('q', $q);
        $res_busqueda = superadmin_gestion_buscar_alumno($req_busqueda);
        if (is_wp_error($res_busqueda)) return null;
        $personas_encontradas = $res_busqueda->get_data()['data'] ?? array();
        return !empty($personas_encontradas) ? $personas_encontradas[0] : null;
    };
    if (!$uid_por_email) {
        $duplicado = $buscar_duplicado($telefono ?: $email);
        // Sin teléfono/email que ya coincida: prueba también por nombre + apellidos (cowork,
        // 07/11 — alguien ya dado de alta con otro email/teléfono distinto no se detectaba).
        if (!$duplicado) $duplicado = $buscar_duplicado(trim($nombre . ' ' . $apellidos));
    }
    // El email exacto manda siempre (no se puede crear un usuario de WordPress duplicado) —
    // nunca hace falta confirmarlo, es la MISMA cuenta por definición.
    if ($uid_por_email && !$usar_cliente_id) $usar_cliente_id = intval($uid_por_email);
    $hay_duplicado_sin_resolver = $duplicado && !$usar_cliente_id && !$confirmar_nuevo;

    if ($simular) {
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
            'nombre' => trim($nombre . ' ' . $apellidos), 'email' => $email, 'telefono' => $telefono,
            'tipo' => $tipo, 'dia' => $dia_norm ?: null, 'horario' => $horario_norm ?: null, 'edad' => $edad_norm ?: null,
            'producto' => $producto_item ? $producto_item->get_name() : null,
            'precioCatalogo' => $precio_catalogo, 'importeFinal' => $importe_final,
            'billingPeriod' => $billing_period, 'billingInterval' => $billing_interval, 'fechaInicio' => $fecha_inicio,
            'primerPago' => $primer_pago, 'usaClienteExistente' => $usar_cliente_id ?: null,
            'posibleDuplicado' => $hay_duplicado_sin_resolver ? $duplicado : null,
            'aviso' => $hay_duplicado_sin_resolver
                ? 'Ya hay alguien con ese teléfono/nombre parecido — elige "usar este cliente" o confirma que es una persona distinta antes de crear de verdad.'
                : ($uid_por_email ? 'Ya existe un usuario de WordPress con ese email — se usará esa cuenta (no se crea una nueva).'
                    : 'Simulación: no se ha creado nada todavía.'),
        )));
    }

    if ($hay_duplicado_sin_resolver) {
        return new WP_Error('posible_duplicado', 'Ya hay alguien con ese teléfono/nombre parecido — usa ese cliente (usarClienteId) o confirma que es una persona distinta (confirmarNuevo).', array('status' => 409));
    }

    // --- Cliente: reutilizar o crear ---
    $resultado_crear_usuario = function() use ($usar_cliente_id, $email, $nombre, $apellidos) {
        if ($usar_cliente_id) {
            $u = get_user_by('id', $usar_cliente_id);
            return $u ? $u->ID : new WP_Error('cliente_no_encontrado', 'El cliente indicado no existe.', array('status' => 404));
        }
        if (!$email) return new WP_Error('falta_email', 'Para crear un cliente nuevo hace falta un email.', array('status' => 400));
        $uid = wc_create_new_customer($email, '', '', array('first_name' => $nombre, 'last_name' => $apellidos));
        return $uid;
    };
    $customer_id = $enviar_acceso ? $resultado_crear_usuario() : blokes_gestion_sin_emails($resultado_crear_usuario);
    if (is_wp_error($customer_id)) return $customer_id;

    update_user_meta($customer_id, 'billing_first_name', $nombre);
    update_user_meta($customer_id, 'billing_last_name', $apellidos);
    if ($telefono) update_user_meta($customer_id, 'billing_phone', $telefono);
    if ($email) update_user_meta($customer_id, 'billing_email', $email);

    $billing = array(
        'first_name' => $nombre, 'last_name' => $apellidos, 'email' => $email ?: get_userdata($customer_id)->user_email,
        'phone' => $telefono, 'country' => 'ES',
    );

    $crear_todo = function() use (
        $customer_id, $billing, $producto_item, $tipo, $dia_norm, $horario_norm, $edad_norm,
        $billing_period, $billing_interval, $precio_catalogo, $importe_final, $fecha_inicio,
        $primer_pago, $metodo, $fecha_pago, $ajustar_precio, $motivo_excepcion
    ) {
        $gateways = WC()->payment_gateways()->payment_gateways();
        $bacs_title = isset($gateways['bacs']) ? $gateways['bacs']->get_title() : 'Transferencia bancaria';

        $order = wc_create_order(array('customer_id' => $customer_id, 'created_via' => 'admin_assign'));
        if (is_wp_error($order)) return $order;
        if ($primer_pago === 'ya_pagado') { $order->set_payment_method('bacs'); $order->set_payment_method_title($bacs_title); }
        $item_pedido_id = $order->add_product($producto_item, 1, array('subtotal' => $precio_catalogo, 'total' => $precio_catalogo));
        if ($tipo === 'clase') {
            $clave_dia = (strpos($dia_norm, '-') !== false) ? 'pa_dias' : 'pa_dia-suelto';
            $selecciones = array($clave_dia => $dia_norm, 'pa_horario' => $horario_norm, 'pa_edad' => $edad_norm);
            $item_pedido = $order->get_item($item_pedido_id);
            $item_pedido->add_meta_data('_step_form_selections', $selecciones, true);
            blokes_gestion_actualizar_meta_visible_grupo($item_pedido, $edad_norm, $billing_period, $billing_interval);
            $item_pedido->save();
        }
        $order->set_address($billing, 'billing');
        $order->add_order_note('ExcelMuerte: alta de cliente nueva creada desde Grupos.');
        $order->set_status('pending');
        $order->calculate_totals();
        $order->save();

        $subscription = wcs_create_subscription(array(
            'order_id' => $order->get_id(), 'status' => 'pending',
            'billing_period' => $billing_period, 'billing_interval' => $billing_interval,
            'customer_id' => $customer_id, 'created_via' => 'admin_assign',
        ));
        if (is_wp_error($subscription)) { $order->delete(true); return $subscription; }
        if ($primer_pago === 'ya_pagado') { $subscription->set_payment_method('bacs'); $subscription->set_payment_method_title($bacs_title); }
        $item_sub = $subscription->add_product($producto_item, 1, array('subtotal' => $precio_catalogo, 'total' => $precio_catalogo));
        if ($tipo === 'clase') {
            $clave_dia = strpos($dia_norm, '-') !== false ? 'pa_dias' : 'pa_dia-suelto';
            $selecciones = array($clave_dia => $dia_norm, 'pa_horario' => $horario_norm, 'pa_edad' => $edad_norm);
            // Un solo objeto: get_item() recarga de la BD en cada llamada, así que añadir la meta
            // en uno y guardar otro la perdía.
            $item_sub_obj = $subscription->get_item($item_sub);
            $item_sub_obj->add_meta_data('_step_form_selections', $selecciones, true);
            blokes_gestion_actualizar_meta_visible_grupo($item_sub_obj, $edad_norm, $billing_period, $billing_interval);
            $item_sub_obj->save();
        }
        $subscription->set_address($billing, 'billing');

        $start_date = $fecha_inicio . ' 00:00:00';
        $next_payment = null;
        if (class_exists('WC_Subscriptions_Synchroniser')) {
            $first_payment_ts = WC_Subscriptions_Synchroniser::calculate_first_payment_date($producto_item, 'timestamp');
            if ($first_payment_ts > 0) $next_payment = gmdate('Y-m-d H:i:s', $first_payment_ts);
        }
        if (!$next_payment) {
            $next_payment = ($billing_period === 'year')
                ? gmdate('Y-m-d H:i:s', strtotime('+1 year'))
                : gmdate('Y-m-d H:i:s', strtotime('+' . $billing_interval . ' month'));
        }
        try { $subscription->update_dates(array('start' => $start_date, 'next_payment' => $next_payment)); } catch (Exception $e) {}
        $subscription->calculate_totals();
        $subscription->save();

        $importe_distinto = abs($importe_final - $precio_catalogo) > 0.009;
        $pago_url = null;
        if ($primer_pago === 'enlace_pago') {
            $pago_url = $order->get_checkout_payment_url();
        } else {
            if ($importe_distinto && in_array($ajustar_precio, array('solo_este_mes', 'desde_ahora'), true)) {
                blokes_gestion_ajustar_precio_linea($order, $importe_final);
                if ($ajustar_precio === 'desde_ahora') {
                    blokes_gestion_ajustar_precio_linea($subscription, $importe_final);
                    update_post_meta($subscription->get_id(), '_rm_precio_especial', $importe_final);
                    update_post_meta($subscription->get_id(), '_rm_precio_especial_motivo', $motivo_excepcion);
                    update_post_meta($subscription->get_id(), '_rm_precio_especial_desde', date_i18n('d/m/Y'));
                    $u = wp_get_current_user();
                    update_post_meta($subscription->get_id(), '_rm_precio_especial_por', $u ? $u->user_login : '');
                }
            }
            $metodo_label = blokes_gestion_metodo_label($metodo);
            $order->set_payment_method_title($metodo_label);
            $fecha_pago_ts = $fecha_pago ? strtotime($fecha_pago . ' 12:00:00') : time();
            $order->add_order_note(sprintf('ExcelMuerte: cobrado %s € (%s) el %s — primer pago del alta.', number_format($importe_final, 2, ',', '.'), $metodo_label, date_i18n('d/m/Y', $fecha_pago_ts)));
            $order->save();
            update_post_meta($order->get_id(), '_rm_importe_cobrado', $importe_final);
            update_post_meta($order->get_id(), '_rm_metodo_cobro', $metodo);
            $order->payment_complete();
            $order->update_status('completed', 'ExcelMuerte: pedido completado (alta con primer pago ya hecho).');
            $order->set_date_paid($fecha_pago_ts);
            $order->save();
        }

        return array('order' => $order, 'subscription' => $subscription, 'pagoUrl' => $pago_url);
    };

    $r = blokes_gestion_sin_emails($crear_todo);
    if (is_wp_error($r)) return $r;

    if ($primer_pago === 'ya_pagado') {
        $dh = ($tipo === 'clase') ? array('dia' => $dia_norm, 'horario' => $horario_norm) : blokes_sync_grupos_dia_horario_de_sub($r['subscription']->get_id());
        blokes_sync_grupos_escribir_cobro(
            $dh['dia'], $dh['horario'], $telefono, trim($nombre . ' ' . $apellidos),
            date('Y-m', strtotime($fecha_pago ?: $fecha_inicio)), $importe_final, $metodo,
            date_i18n('d/m/Y', $fecha_pago ? strtotime($fecha_pago) : time()), $r['subscription']->get_id()
        );
    }

    $despues = array(
        'subId' => $r['subscription']->get_id(), 'orderId' => $r['order']->get_id(), 'customerId' => $customer_id,
        'tipo' => $tipo, 'dia' => $dia_norm ?: null, 'horario' => $horario_norm ?: null, 'edad' => $edad_norm ?: null,
        'precio' => $importe_final, 'primerPago' => $primer_pago, 'pagoUrl' => $r['pagoUrl'],
    );
    blokes_gestion_log($r['subscription']->get_id(), 'alta_cliente', null, $despues);

    return rest_ensure_response(array('success' => true, 'data' => $despues));
}

function superadmin_classes($request) {
    $months   = max(1, min(60, intval($request->get_param('months'))));
    $start_dt = new DateTime("first day of this month -{$months} months");
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
        $all = blokes_get_all_subscription_data();
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
                    'ending'          => 0,
                    'all'             => 0,
                    'history'         => array(),
                    'members_active'  => array(),
                    'members_ending'  => array(),
                    'members_pending' => array(),
                    'members_lost'    => array(),
                );
            }
            $classes[$class_key]['all']++;
            $member_name  = $sub['cliente']  ?? '';
            $member_phone = $sub['telefono'] ?? '';
            // pending-cancel: el cliente ya canceló pero sigue con acceso hasta que acabe el
            // periodo pagado. blokes_get_pending_cancel_alumnos() los marca 'status' => 'active'
            // para que no desaparezcan de ningún sitio, pero no son activos de verdad: no se
            // renuevan. Van aparte («se van este mes»), no al recuento de activos.
            $es_pending_cancel = ($sub['status_raw'] ?? '') === 'pending-cancel';

            // Per-month active snapshot using subscription start/end dates
            if (function_exists('wcs_get_subscription') && !empty($sub['id'])) {
                $sub_obj = wcs_get_subscription(intval($sub['id']));
                if (!$sub_obj) continue;
                if (empty($member_phone)) {
                    $member_phone = $sub_obj->get_billing_phone() ?: '';
                }

                if ($sub['status'] === 'active' && !$es_pending_cancel) {
                    $classes[$class_key]['active']++;
                    $classes[$class_key]['members_active'][] = array('name' => $member_name, 'phone' => $member_phone, 'new' => false);
                } elseif ($es_pending_cancel) {
                    $classes[$class_key]['ending']++;
                    $classes[$class_key]['members_ending'][] = array('name' => $member_name, 'phone' => $member_phone);
                } elseif (in_array($sub['status'], array('on-hold', 'pending'))) {
                    $classes[$class_key]['members_pending'][] = array('name' => $member_name, 'phone' => $member_phone);
                }

                $dt_created = $sub_obj->get_date_created();
                if (!$dt_created) continue;

                $sub_start_ym = $dt_created->format('Y-m');

                if ($sub['status'] === 'active') {
                    // Hasta que no acabe el periodo pagado sigue contando como activa mes a mes
                    // en el histórico (aunque ya esté "pending-cancel" y no entre en el snapshot
                    // de arriba): de verdad lo estuvo hasta ahora.
                    $sub_end_ym = $now_ym;
                    // Mark as new if subscription started this month
                    if (!$es_pending_cancel && $sub_start_ym >= $now_ym) {
                        $idx = count($classes[$class_key]['members_active']) - 1;
                        if ($idx >= 0) $classes[$class_key]['members_active'][$idx]['new'] = true;
                    }
                } else {
                    $end_ts = $sub_obj->get_time('cancelled') ?: $sub_obj->get_time('end');
                    // "En espera" (on-hold) no tiene fecha de cancelación ni de fin: sin esto,
                    // se le daba por acabada el mismo mes que empezó y desaparecía del histórico
                    // de los meses siguientes aunque siguiera en espera. Usamos el último pago.
                    if (!$end_ts && $sub['status'] === 'on-hold') $end_ts = $sub_obj->get_time('last_payment');
                    $sub_end_ym = $end_ts ? date('Y-m', $end_ts) : $sub_start_ym;
                    // Track recently lost: cancelled within last 2 months
                    $two_months_ago = date('Y-m', strtotime('first day of this month -2 months'));
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
    if (get_option('blokes_leagues_db_version') !== '1.1') {
        blokes_leagues_create_tables();
        blokes_leagues_seed();
        // v1.1 (Ramiro 12/11 11:55, NOTAS_PARA_CODE_ligas_incentivo.md): nuevos tipos de evento
        // bonus_nuevo/bonus_racha — el ENUM ya existente no lo coge dbDelta solo con el CREATE
        // TABLE (es flojo con los ENUM), así que se fuerza aquí una vez.
        global $wpdb;
        $wpdb->query("ALTER TABLE {$wpdb->prefix}blokes_league_events
            MODIFY event_type ENUM('promoted','demoted','top_scored','bonus_nuevo','bonus_racha') NOT NULL");
        update_option('blokes_leagues_db_version', '1.1');
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
        event_type           ENUM('promoted','demoted','top_scored','bonus_nuevo','bonus_racha') NOT NULL,
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

// ── Incentivo (Ramiro 12/11 11:55, NOTAS_PARA_CODE_ligas_incentivo.md) ─────────
// Opciones 1 (bloques nuevos ×2), 2 (racha semanal +5) y 4 (feedback "+X pts · te
// faltan Y"). Los bonus se guardan como eventos con tipo propio en
// blokes_league_events para poder auditarlos o deshacerlos — nunca se suman a
// total_points sin dejar rastro.

// Lunes de la semana de una fecha dada (o de ahora) — aritmética de días explícita,
// nunca strtotime('monday this week') (ambiguo si la fecha YA es lunes).
function blokes_monday_of($ts = null) {
    $ts = $ts ?: current_time('timestamp');
    $dow = (int) date('N', $ts); // 1 (lunes) .. 7 (domingo)
    return date('Y-m-d', $ts - ($dow - 1) * 86400);
}

// Opción 1: un bloke puesto en las últimas 2 semanas vale el doble — empuja a
// probar lo nuevo, igual encaja con la equipación semanal. post_date es la fecha
// en la que se creó el bloke en WordPress (al equiparlo desde la app).
function blokes_bloke_es_nuevo($post_id) {
    $post = get_post($post_id);
    if (!$post || !$post->post_date) return false;
    $dias = (current_time('timestamp') - strtotime($post->post_date)) / 86400;
    return $dias >= 0 && $dias <= 14;
}

// Opción 2: si esta semana ya hay (o esta tarea la deja en) al menos 3 tops
// propios, +5 pts, una sola vez por semana. Cuenta solo tops que SIGAN puestos
// (nada de duplicados por un toggle off/on, ni de un bloke que ya se borró —
// aviso de la nota, ver blokes_quitar_completions_de_bloke).
function blokes_check_racha_semanal($user_id) {
    global $wpdb;
    $ev = $wpdb->prefix . 'blokes_league_events';
    $monday = blokes_monday_of();

    $ya = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM $ev WHERE user_id = %d AND event_type = 'bonus_racha' AND created_at >= %s",
        $user_id, $monday . ' 00:00:00'
    ));
    if ($ya > 0) return 0;

    $completados = get_user_meta($user_id, '_blokes_completed', true);
    $completados = is_array($completados) ? array_map('intval', $completados) : array();
    $log = get_user_meta($user_id, '_blokes_completion_log', true);
    $log = is_array($log) ? $log : array();

    $ids_esta_semana = array();
    $inicio_semana = strtotime($monday . ' 00:00:00');
    foreach ($log as $entry) {
        $pid = intval($entry['postId'] ?? 0);
        if (!$pid || !in_array($pid, $completados, true)) continue;
        $ts = strtotime($entry['timestamp'] ?? '');
        if ($ts && $ts >= $inicio_semana) $ids_esta_semana[$pid] = true;
    }
    if (count($ids_esta_semana) < 3) return 0;

    $wpdb->insert($ev, array(
        'user_id' => $user_id, 'event_type' => 'bonus_racha',
        'from_league_id' => null, 'to_league_id' => null,
        'points_at_event' => 5, 'triggered_by_user_id' => null,
        'created_at' => current_time('mysql'), 'seen' => 0,
    ));
    return 5;
}

// "🔥 Racha: N semanas" en la ficha — semanas CONSECUTIVAS (terminando en la
// actual o la pasada; si se rompió hace 2+ semanas, la racha ya está a 0) con el
// bonus semanal conseguido. Se deriva del propio registro de eventos, nada de un
// contador aparte que se pueda desincronizar.
function blokes_calcular_racha_semanas($user_id) {
    global $wpdb;
    $ev = $wpdb->prefix . 'blokes_league_events';
    $fechas = $wpdb->get_col($wpdb->prepare(
        "SELECT created_at FROM $ev WHERE user_id = %d AND event_type = 'bonus_racha' ORDER BY created_at DESC",
        $user_id
    ));
    if (!$fechas) return 0;

    $mondays = array();
    foreach ($fechas as $f) { $mondays[blokes_monday_of(strtotime($f))] = true; }
    $mondays = array_keys($mondays);
    rsort($mondays);

    $hoy_monday = blokes_monday_of();
    $semana_pasada = date('Y-m-d', strtotime($hoy_monday) - 7 * 86400);
    if ($mondays[0] !== $hoy_monday && $mondays[0] !== $semana_pasada) return 0;

    $racha = 0;
    $cursor = $mondays[0];
    foreach ($mondays as $m) {
        if ($m !== $cursor) break;
        $racha++;
        $cursor = date('Y-m-d', strtotime($cursor) - 7 * 86400);
    }
    return $racha;
}

// Opción 4: cuántos puntos le faltan al usuario para superar al más flojo de la
// liga de arriba (el mismo umbral que usa blokes_evaluate_league_change para el
// swap) y cómo se llama esa liga — null/null en la liga top o si la de arriba
// está vacía (nadie con quien hacer swap todavía).
function blokes_liga_siguiente_info($league_id, $total_points) {
    global $wpdb;
    $ul = $wpdb->prefix . 'blokes_user_leagues';
    $l  = $wpdb->prefix . 'blokes_leagues';

    $current = $wpdb->get_row($wpdb->prepare("SELECT * FROM $l WHERE id = %d", $league_id));
    if (!$current || (int) $current->tier >= 6) {
        return array('pointsToPromote' => null, 'nextLeagueName' => null);
    }
    $next = $wpdb->get_row($wpdb->prepare("SELECT * FROM $l WHERE tier = %d", (int) $current->tier + 1));
    if (!$next) return array('pointsToPromote' => null, 'nextLeagueName' => null);

    $weakest = $wpdb->get_var($wpdb->prepare("SELECT MIN(total_points) FROM $ul WHERE league_id = %d", $next->id));
    if ($weakest === null) return array('pointsToPromote' => null, 'nextLeagueName' => $next->name);

    return array(
        'pointsToPromote' => max(0, (int) $weakest - (int) $total_points + 1),
        'nextLeagueName'  => $next->name,
    );
}

// ── Lógica principal ──────────────────────────────────────────

// Ramiro 12/11 12:30 (de cara al futuro, tras los tops de prueba de RamiroTop): una cuenta
// marcada como "de pruebas" (_blokes_cuenta_prueba) no debe entrar en ligas — ni puntos, ni
// bonus, ni ascensos/descensos de nadie real por su culpa. Se marca desde
// POST /blokes/v1/admin/cuenta-prueba (solo socio).
function blokes_es_cuenta_prueba($user_id) {
    return (bool) get_user_meta((int) $user_id, '_blokes_cuenta_prueba', true);
}

function blokes_register_top_for_leagues($user_id, $post_id) {
    if (blokes_es_cuenta_prueba($user_id)) return null;
    global $wpdb;
    $ul = $wpdb->prefix . 'blokes_user_leagues';
    $l  = $wpdb->prefix . 'blokes_leagues';
    $ev = $wpdb->prefix . 'blokes_league_events';

    $pts = blokes_calculate_points($post_id);
    if ($pts <= 0) return null;

    // Opción 1: bloke nuevo (últimas 2 semanas) vale el doble — el bonus es el
    // mismo importe que los puntos base, guardado como su propio evento.
    $bonus_nuevo = blokes_bloke_es_nuevo($post_id) ? $pts : 0;

    $wpdb->query('START TRANSACTION');

    $row = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM $ul WHERE user_id = %d FOR UPDATE", $user_id
    ));

    if (!$row) {
        $pedri = $wpdb->get_row("SELECT * FROM $l WHERE tier = 1");
        if (!$pedri) { $wpdb->query('ROLLBACK'); return null; }

        $total = $pts + $bonus_nuevo;
        $wpdb->insert($ul, array(
            'user_id'        => $user_id,
            'league_id'      => $pedri->id,
            'total_points'   => $total,
            'rank_in_league' => 9999,
            'zone'           => 'stay',
            'joined_at'      => current_time('mysql'),
            'last_updated'   => current_time('mysql'),
        ));
        if ($bonus_nuevo > 0) {
            $wpdb->insert($ev, array(
                'user_id' => $user_id, 'event_type' => 'bonus_nuevo',
                'from_league_id' => null, 'to_league_id' => null,
                'points_at_event' => $bonus_nuevo, 'triggered_by_user_id' => null,
                'created_at' => current_time('mysql'), 'seen' => 0,
            ));
        }
        $wpdb->query('COMMIT');
        blokes_recalculate_league_ranks((int) $pedri->id);
        blokes_check_tier_overflow((int) $pedri->id);
        $info = blokes_liga_siguiente_info((int) $pedri->id, $total);
        return array(
            'pointsEarned' => $total, 'bonusNuevo' => $bonus_nuevo, 'bonusRacha' => 0,
            'newTotal' => $total, 'leagueChanged' => false,
            'pointsToPromote' => $info['pointsToPromote'], 'nextLeagueName' => $info['nextLeagueName'],
        );
    }

    // Opción 2: racha semanal — se comprueba DESPUÉS de saber que esta tarea ya
    // quedó registrada en el log (blokes_toggle_completion actualiza el log antes
    // de llamar aquí), así que este mismo top ya cuenta si es el 3º de la semana.
    $bonus_racha = blokes_check_racha_semanal($user_id);

    $ganado = $pts + $bonus_nuevo + $bonus_racha;
    $new_total = (int) $row->total_points + $ganado;
    $wpdb->update($ul,
        array('total_points' => $new_total, 'last_updated' => current_time('mysql')),
        array('user_id' => $user_id)
    );
    if ($bonus_nuevo > 0) {
        $wpdb->insert($ev, array(
            'user_id' => $user_id, 'event_type' => 'bonus_nuevo',
            'from_league_id' => null, 'to_league_id' => null,
            'points_at_event' => $bonus_nuevo, 'triggered_by_user_id' => null,
            'created_at' => current_time('mysql'), 'seen' => 0,
        ));
    }
    $wpdb->query('COMMIT');

    $change = blokes_evaluate_league_change((int) $user_id, $new_total, (int) $row->league_id);
    $liga_final = $change['changed'] ? (int) $change['newLeague']['id'] : (int) $row->league_id;
    $info = blokes_liga_siguiente_info($liga_final, $new_total);

    return array(
        'pointsEarned'    => $ganado,
        'bonusNuevo'      => $bonus_nuevo,
        'bonusRacha'      => $bonus_racha,
        'newTotal'        => $new_total,
        'leagueChanged'   => $change['changed'],
        'newLeague'       => $change['newLeague'] ?? null,
        'pointsToPromote' => $info['pointsToPromote'],
        'nextLeagueName'  => $info['nextLeagueName'],
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

    // Saca a un usuario de su liga sin tocar a nadie más — p. ej. revertir
    // una colocación de prueba. Recalcula el ranking de esa liga después.
    register_rest_route('blokes/v1', '/leagues/user/(?P<user_id>\d+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'blokes_api_remove_from_league',
        // Una fila, no un rebuild total (eso sigue siendo solo socio) —
        // mismo nivel que borrar un alumno manual.
        'permission_callback' => function() { return blokes_can_supervise(); },
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
    register_rest_route('blokes/v1', '/profile/optin-whatsapp', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_api_save_optin_whatsapp',
        'permission_callback' => 'is_user_logged_in',
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
    // Tele del Roco, opción 4 de NOTAS_PARA_CODE_ligas_incentivo.md — público, sin login, igual
    // que el resto de endpoints que ya lee /compe/directo. Namespace blokes/v1 (no progreso/v1)
    // a propósito: las tablas de ligas viven en el sitio Principal, igual que este namespace —
    // así nos ahorramos el switch_to_blog que haría falta si esto corriera desde el Club.
    register_rest_route('blokes/v1', '/tele/liga-semana', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_tele_liga_semana',
        'permission_callback' => '__return_true',
    ));
    // Diagnóstico TEMPORAL, solo socio (Ramiro 12/11 12:30: deshacer los tops de prueba de
    // RamiroTop, con el plan por delante antes de borrar nada) — se quita en cuanto se decida la
    // limpieza. De solo lectura: no cambia nada.
    register_rest_route('blokes/v1', '/admin/diag-cuenta', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_api_diag_cuenta',
        'permission_callback' => function() { return blokes_get_app_role() === 'socio'; },
    ));
    // "Para el futuro" (Ramiro 12/11 12:30): marcar una cuenta como "de pruebas" para que sus
    // tops dejen de contar en ligas/tele/clasificaciones.
    register_rest_route('blokes/v1', '/admin/cuenta-prueba', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_api_set_cuenta_prueba',
        'permission_callback' => function() { return blokes_get_app_role() === 'socio'; },
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

    // Opciones 2 y 4 de NOTAS_PARA_CODE_ligas_incentivo.md: que se vea en la ficha, no solo al
    // apuntar el top.
    $info = blokes_liga_siguiente_info((int) $row->league_id, (int) $row->total_points);

    return rest_ensure_response(array(
        'leagueId'        => (int) $row->league_id,
        'name'            => $row->name,
        'slug'            => $row->slug,
        'tier'            => (int) $row->tier,
        'totalPoints'     => (int) $row->total_points,
        'rank'            => (int) $row->rank_in_league,
        'zone'            => $row->zone,
        'rachaSemanas'    => blokes_calcular_racha_semanas($uid),
        'pointsToPromote' => $info['pointsToPromote'],
        'nextLeagueName'  => $info['nextLeagueName'],
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

function blokes_api_remove_from_league($request) {
    global $wpdb;
    $ul      = $wpdb->prefix . 'blokes_user_leagues';
    $user_id = intval($request['user_id']);
    $row     = $wpdb->get_row($wpdb->prepare("SELECT league_id FROM $ul WHERE user_id = %d", $user_id));
    if (!$row) return new WP_Error('not_in_league', 'Ese usuario no está en ninguna liga.', array('status' => 404));
    $wpdb->delete($ul, array('user_id' => $user_id), array('%d'));
    blokes_recalculate_league_ranks((int) $row->league_id);
    return rest_ensure_response(array('success' => true, 'removed_from_league_id' => (int) $row->league_id));
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
        // null = sin preguntar · 'si' · 'no'.
        'optinWhatsapp'   => get_user_meta($uid, 'optin_whatsapp', true) ?: null,
    ));
}

// Casilla/diálogo de WhatsApp en el perfil (31/10, fase b; tres estados desde 17:17): aparte de
// guardar perfil (nickname/avatar), para poder decir que sí, que no, o volver a "sin preguntar"
// (sin preguntar también sirve para borrar un "no" puesto por error) sin tocar lo demás.
function blokes_api_save_optin_whatsapp($request) {
    $uid = get_current_user_id();
    $valor = sanitize_key((string) $request->get_param('optinWhatsapp'));
    if (!in_array($valor, array('si', 'no'), true)) $valor = null;
    $telefono = get_user_meta($uid, 'billing_phone', true);
    $user = get_userdata($uid);
    blokes_registrar_optin_whatsapp(
        $telefono, $uid, $valor, 'perfil', $valor === 'si' ? BLOKES_OPTIN_WHATSAPP_TEXTO : '',
        'perfil propio', $user ? $user->display_name : ''
    );
    return rest_ensure_response(array('success' => true, 'optinWhatsapp' => $valor));
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

// GET /blokes/v1/tele/liga-semana — ver registro de la ruta más arriba. Nombre público igual
// que el resto de pantallas compartidas (blokes_api_get_my_leaderboard): nombre de pila +
// nickname entre paréntesis, nunca apellidos.
function blokes_api_tele_liga_semana() {
    global $wpdb;
    $ev = $wpdb->prefix . 'blokes_league_events';
    $l  = $wpdb->prefix . 'blokes_leagues';
    $monday = blokes_monday_of();

    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT ev.user_id, ev.created_at, lto.name AS to_name
         FROM $ev ev JOIN $l lto ON lto.id = ev.to_league_id
         WHERE ev.event_type = 'promoted' AND ev.created_at >= %s
         ORDER BY ev.created_at DESC LIMIT 12", $monday . ' 00:00:00'
    ));

    $out = array();
    foreach ($rows as $r) {
        if (blokes_es_cuenta_prueba($r->user_id)) continue; // Ramiro 12/11 12:30
        $u = get_userdata($r->user_id);
        $first = $u ? trim($u->first_name ?? '') : '';
        $name = $first ?: ($u ? (explode(' ', trim($u->display_name ?? ''))[0] ?? '') : '');
        $nick = blokes_get_user_nickname($r->user_id);
        $out[] = array(
            'nombreMostrar' => trim(($name ?: 'Alguien') . ($nick ? " ({$nick})" : '')),
            'liga'          => $r->to_name,
        );
    }
    return rest_ensure_response(array('success' => true, 'data' => $out));
}

// POST /blokes/v1/admin/cuenta-prueba — marca/desmarca una cuenta como "de pruebas" por nickname
// (Ramiro 12/11 12:30: "para el futuro"). Solo evita que sus FUTUROS tops entren en ligas; no
// deshace nada de lo que ya hubiera pasado antes de marcarla.
function blokes_api_set_cuenta_prueba($request) {
    global $wpdb;
    $nickname = sanitize_text_field((string) $request->get_param('nickname'));
    if (!$nickname) return new WP_Error('bad_request', 'Falta nickname.', array('status' => 400));
    $user_id = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = '_blokes_nickname' AND meta_value = %s", $nickname
    ));
    if (!$user_id) return new WP_Error('not_found', 'No existe ese nickname.', array('status' => 404));
    $es_prueba = (bool) $request->get_param('esPrueba');
    if ($es_prueba) update_user_meta($user_id, '_blokes_cuenta_prueba', 1);
    else delete_user_meta($user_id, '_blokes_cuenta_prueba');
    return rest_ensure_response(array('success' => true, 'userId' => $user_id, 'esCuentaPrueba' => $es_prueba));
}

// GET /blokes/v1/admin/diag-cuenta?nickname=X — ver registro de la ruta más arriba. De solo
// lectura, para plantar el plan de limpieza de una cuenta de pruebas antes de tocar nada:
// estado actual, todos sus eventos de liga, y para cada "promoted" suyo, quién bajó a la vez
// (mismo instante, triggered_by_user_id = esta cuenta) y su estado actual.
function blokes_api_diag_cuenta($request) {
    global $wpdb;
    $nickname = sanitize_text_field((string) $request->get_param('nickname'));
    if (!$nickname) return new WP_Error('bad_request', 'Falta nickname.', array('status' => 400));
    $user_id = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = '_blokes_nickname' AND meta_value = %s", $nickname
    ));
    if (!$user_id) return new WP_Error('not_found', 'No existe ese nickname.', array('status' => 404));

    $ul = $wpdb->prefix . 'blokes_user_leagues';
    $l  = $wpdb->prefix . 'blokes_leagues';
    $ev = $wpdb->prefix . 'blokes_league_events';

    $actual = $wpdb->get_row($wpdb->prepare(
        "SELECT ul.total_points, ul.rank_in_league, l.id as league_id, l.name, l.tier
         FROM $ul ul JOIN $l l ON l.id = ul.league_id WHERE ul.user_id = %d", $user_id
    ), ARRAY_A);

    $eventos = $wpdb->get_results($wpdb->prepare(
        "SELECT ev.*, lf.name as from_name, lt.name as to_name FROM $ev ev
         LEFT JOIN $l lf ON lf.id = ev.from_league_id LEFT JOIN $l lt ON lt.id = ev.to_league_id
         WHERE ev.user_id = %d ORDER BY ev.created_at ASC", $user_id
    ), ARRAY_A);

    $afectados = array();
    foreach ($eventos as $e) {
        if ($e['event_type'] !== 'promoted') continue;
        $demotido = $wpdb->get_row($wpdb->prepare(
            "SELECT ev.*, nick.meta_value as nickname FROM $ev ev
             LEFT JOIN {$wpdb->usermeta} nick ON nick.user_id = ev.user_id AND nick.meta_key = '_blokes_nickname'
             WHERE ev.event_type = 'demoted' AND ev.triggered_by_user_id = %d AND ev.created_at = %s",
            $user_id, $e['created_at']
        ), ARRAY_A);
        if ($demotido) {
            $estado_actual = $wpdb->get_row($wpdb->prepare(
                "SELECT ul.total_points, l.name, l.tier FROM $ul ul JOIN $l l ON l.id = ul.league_id WHERE ul.user_id = %d",
                intval($demotido['user_id'])
            ), ARRAY_A);
            $afectados[] = array_merge($demotido, array('estadoActual' => $estado_actual));
        }
    }

    return rest_ensure_response(array(
        'userId' => $user_id, 'nickname' => $nickname, 'actual' => $actual,
        'eventos' => $eventos, 'afectadosPorPromocion' => $afectados,
    ));
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
    $allowed = array('socios', 'gestion', 'profesores', 'tablets');

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

// ============================================================
//  Organización — equipación / route-setting (planificación diaria)
//  Reemplaza el "Calendario de Equipacion" semanal de Notion: cada
//  trabajador recibe un plan por día concreto, no solo por semana.
// ============================================================

function progreso_equip_subzones() {
    return array(1, 2, 3, 4, 5, 6, 7, 8);
}

function progreso_equip_grades() {
    return array(
        array('color' => 'INTRO',    'range' => 'III',      'order' => 0, 'planificado' => false),
        array('color' => 'VERDE',    'range' => 'IV/V',     'order' => 1, 'planificado' => true),
        array('color' => 'AZUL',     'range' => 'V+/6A',    'order' => 2, 'planificado' => true),
        array('color' => 'AMARILLO', 'range' => '6A+/6B+',  'order' => 3, 'planificado' => true, 'aviso' => 'Están quedando muy duros'),
        array('color' => 'ROJO',     'range' => '6C/7A',    'order' => 4, 'planificado' => true),
        array('color' => 'NEGRO',    'range' => '7A+/7B',   'order' => 5, 'planificado' => true),
        array('color' => 'BLANCO',   'range' => '7B+/7C',   'order' => 6, 'planificado' => false, 'nota' => 'compes'),
    );
}

// Orden de trabajo natural: quitar → volúmenes → bloques → densidad/travesías
// → limpiar/ordenar/regar → subir webapp. El reparto por días sigue este orden.
// `$incluir_inactivas`: false (por defecto) para el uso normal — el reparto automático y las
// pantallas de trabajo nunca deben ver (ni proponer) una tarea que alguien desactivó; true solo
// para la administración en Normas, donde hace falta poder reactivarla.
function progreso_equip_task_types($incluir_inactivas = false) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $where = $incluir_inactivas ? '' : 'WHERE active = 1';
    $rows = $wpdb->get_results("SELECT * FROM " . progreso_equip_table('task_types') . " {$where} ORDER BY sort_order ASC", ARRAY_A);
    return array_map('progreso_equip_task_type_fila', $rows);
}

function progreso_equip_task_type_fila($r) {
    return array(
        'id' => $r['id'], 'name' => $r['name'], 'description' => $r['description'] ?? '',
        'params' => array_values(array_filter(explode(',', $r['params']))),
        'lead_only' => (bool) $r['lead_only'],
        'periodicityWeeks' => intval($r['periodicity_weeks']),
        'preferredDay' => $r['preferred_day'] ?: null,
        'subzone' => $r['subzone'] !== null ? intval($r['subzone']) : null,
        'durationMin' => $r['duration_min'] !== null ? intval($r['duration_min']) : null,
        'recurring' => (bool) $r['recurring'],
        'active' => (bool) ($r['active'] ?? 1),
        // Pauta de quién suele hacer esta tarea, en orden de preferencia (ids de trabajador) —
        // editable desde Normas (Ramiro, 5/11 21:08: "guarda la pauta como datos editables, no
        // fija en código"). Vacío = sigue como hasta ahora (por historial propio de la app).
        'preferredWorkers' => array_values(array_filter(array_map('intval', explode(',', $r['preferred_workers'] ?? '')))),
    );
}

// GET /equipacion/task-types/all — catálogo completo (activas e inactivas), solo para la
// administración en Normas (reactivar algo que alguien desactivó por error).
function progreso_equip_get_all_task_types() {
    return rest_ensure_response(array('success' => true, 'data' => progreso_equip_task_types(true)));
}

// POST /equipacion/task-types — nueva tarea de catálogo sin tocar código (creador de tareas de
// Álvaro, Ramiro 1/11 17:20). El id es un slug derivado del nombre.
function progreso_equip_create_task_type($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $name = trim((string) $request->get_param('name'));
    if ($name === '') return new WP_Error('invalid_data', 'Falta el nombre.', array('status' => 400));
    $table = progreso_equip_table('task_types');
    $slug = sanitize_title($name);
    $id = $slug ?: 'tarea';
    $n = 1;
    while ($wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE id = %s", $id))) { $id = $slug . '-' . (++$n); }
    $max_sort = (int) $wpdb->get_var("SELECT MAX(sort_order) FROM {$table}");
    $subzone = $request->get_param('subzone');
    $duration = $request->get_param('durationMin');
    $wpdb->insert($table, array(
        'id' => $id, 'name' => sanitize_text_field($name),
        'description' => sanitize_textarea_field((string) $request->get_param('description')),
        'params' => '', 'lead_only' => $request->get_param('leadOnly') ? 1 : 0,
        'periodicity_weeks' => max(1, intval($request->get_param('periodicityWeeks')) ?: 1),
        'preferred_day' => sanitize_text_field((string) $request->get_param('preferredDay')),
        'subzone' => ($subzone !== null && $subzone !== '') ? intval($subzone) : null,
        'duration_min' => ($duration !== null && $duration !== '') ? intval($duration) : null,
        'recurring' => 1, 'active' => 1, 'sort_order' => $max_sort + 1,
    ), array('%s', '%s', '%s', '%s', '%d', '%d', '%s', '%d', '%d', '%d', '%d', '%d'));
    return rest_ensure_response(array('success' => true, 'id' => $id));
}

function progreso_equip_update_task_type($request) {
    global $wpdb;
    $id = sanitize_text_field((string) $request['id']);
    $upd = array(); $fmt = array();
    if ($request->get_param('periodicityWeeks') !== null) {
        $upd['periodicity_weeks'] = max(1, intval($request->get_param('periodicityWeeks')));
        $fmt[] = '%d';
    }
    if ($request->get_param('name') !== null) { $upd['name'] = sanitize_text_field($request->get_param('name')); $fmt[] = '%s'; }
    if ($request->get_param('description') !== null) { $upd['description'] = sanitize_textarea_field((string) $request->get_param('description')); $fmt[] = '%s'; }
    if ($request->get_param('preferredDay') !== null) { $upd['preferred_day'] = sanitize_text_field((string) $request->get_param('preferredDay')); $fmt[] = '%s'; }
    if ($request->get_param('subzone') !== null) {
        $sz = $request->get_param('subzone');
        $upd['subzone'] = ($sz === '' ? null : intval($sz)); $fmt[] = '%d';
    }
    if ($request->get_param('durationMin') !== null) {
        $dm = $request->get_param('durationMin');
        $upd['duration_min'] = ($dm === '' ? null : intval($dm)); $fmt[] = '%d';
    }
    if ($request->get_param('leadOnly') !== null) { $upd['lead_only'] = $request->get_param('leadOnly') ? 1 : 0; $fmt[] = '%d'; }
    if ($request->get_param('preferredWorkers') !== null) {
        $pw = $request->get_param('preferredWorkers');
        $upd['preferred_workers'] = is_array($pw) ? implode(',', array_filter(array_map('intval', $pw))) : '';
        $fmt[] = '%s';
    }
    // Nunca se borra un tipo (rompería el histórico de tareas que ya lo usaron): "borrar" desde
    // la interfaz manda `active: false`, que lo saca del reparto automático sin perder nada.
    if ($request->get_param('active') !== null) { $upd['active'] = $request->get_param('active') ? 1 : 0; $fmt[] = '%d'; }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(progreso_equip_table('task_types'), $upd, array('id' => $id), $fmt, array('%s'));
    return rest_ensure_response(array('success' => true));
}

// DELETE /equipacion/task-types/{id} — si ya se usó alguna vez (hay tareas con este
// taskTypeId), "borrar" desde la interfaz es desactivar, nunca se borra el tipo de verdad (el
// histórico de tareas ya hechas con ese tipo se quedaría sin nombre); reactivable después con
// PUT { active: true }. Si NUNCA se usó, se borra de verdad — para quitar del todo una prueba
// o un tipo creado por error (cowork, NOTAS_PARA_CODE_equipacion.md 3/11 11:30: la "PRUEBA
// Cowork (borrar)" se quedaba desactivada para siempre en la lista).
function progreso_equip_deactivate_task_type($request) {
    global $wpdb;
    $id = sanitize_text_field((string) $request['id']);
    $usado = $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM " . progreso_equip_table('tasks') . " WHERE task_type_id = %s", $id
    ));
    if (intval($usado) > 0) {
        $wpdb->update(progreso_equip_table('task_types'), array('active' => 0), array('id' => $id), array('%d'), array('%s'));
        return rest_ensure_response(array('success' => true, 'deactivated' => true));
    }
    $wpdb->delete(progreso_equip_table('task_types'), array('id' => $id), array('%s'));
    return rest_ensure_response(array('success' => true, 'deleted' => true));
}

// Quién hace el cambio, para el rastro de la tarea: la persona elegida en «¿Quién eres?»
// (`byWorkerId`) si viene; si no, el nombre de la cuenta de WordPress (Eva entra con la suya y no
// es del equipo de equipación).
function progreso_equip_actor($request) {
    global $wpdb;
    $by = intval($request->get_param('byWorkerId'));
    if ($by) {
        $name = $wpdb->get_var($wpdb->prepare("SELECT name FROM " . progreso_equip_table('workers') . " WHERE id = %d", $by));
        if ($name) return $name;
    }
    $user = wp_get_current_user();
    return ($user && $user->ID) ? ($user->display_name ?: $user->user_login) : '';
}

// Ramiro 12/11 11:35: "no pueden editar alguien que no sea Álvaro o los socios las tareas, ni
// Ana ni Edu ni Sara" — ni en la interfaz ni en la API. Un socio siempre vale; para "Álvaro" (el
// jefe de equipación) no se hardcodea el nombre — se mira qué worker tiene is_lead=1 y se
// compara su email con el de la sesión real, igual que ya hace blokes_get_app_role_real() con
// las listas de email. Así el "jefe" es asignable (basta con mover el is_lead a otro worker),
// sin tocar código. Usa blokes_get_app_role() (no la "_real"), así que respeta "ver como": un
// socio probando "ver como: profesor" también se queda sin estos permisos aquí (a menos que su
// email sea literalmente el del jefe), igual que ya pasa con el resto de la app.
function progreso_equip_es_jefe_o_socio() {
    if (blokes_get_app_role() === 'socio') return true;
    if (!is_user_logged_in()) return false;
    $email = strtolower(trim(wp_get_current_user()->user_email));
    if ($email === '') return false;
    global $wpdb;
    $lead_email = $wpdb->get_var(
        "SELECT email FROM " . progreso_equip_table('workers') . " WHERE is_lead = 1 AND active = 1 ORDER BY id ASC LIMIT 1"
    );
    return $lead_email && $lead_email !== '' && strtolower(trim($lead_email)) === $email;
}

// POST /equipacion/tasks — tarea suelta para un día y persona concretos, sin esperar al
// reparto automático (p. ej. arreglar una presa, comprar tornillos) — creador de tareas de
// Álvaro (Ramiro, 1/11 17:20). `taskTypeId` de un tipo del catálogo, o `customText` libre (se
// guarda con el tipo especial "custom" y el texto en `params.texto`).
function progreso_equip_create_loose_task($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $assignment_id = intval($request->get_param('assignmentId'));
    if (!$assignment_id) return new WP_Error('invalid_data', 'Falta assignmentId.', array('status' => 400));
    $existe = $wpdb->get_var($wpdb->prepare("SELECT id FROM " . progreso_equip_table('assignments') . " WHERE id = %d", $assignment_id));
    if (!$existe) return new WP_Error('not_found', 'Asignación no encontrada.', array('status' => 404));

    $date = sanitize_text_field((string) $request->get_param('date'));
    if (!$date || !strtotime($date)) return new WP_Error('invalid_data', 'Fecha no válida.', array('status' => 400));
    $date = date('Y-m-d', strtotime($date));

    $custom_text = trim((string) $request->get_param('customText'));
    $task_type_id = sanitize_text_field((string) $request->get_param('taskTypeId'));
    // subzona/notas valen igual para una tarea de texto libre que para una del catálogo
    // (cowork, 11/11 05:40: antes se perdían silenciosamente en texto libre).
    $params = array();
    if ($custom_text !== '') {
        $task_type_id = 'custom';
        $params['texto'] = sanitize_text_field($custom_text);
    } elseif ($task_type_id === '') {
        return new WP_Error('invalid_data', 'Elige un tipo del catálogo o escribe un texto.', array('status' => 400));
    }
    $subzona = $request->get_param('subzona');
    if ($subzona !== null && $subzona !== '') $params['subzona'] = intval($subzona);
    $notas = trim((string) $request->get_param('notas'));
    if ($notas !== '') $params['notas'] = sanitize_text_field($notas);

    $wpdb->insert(progreso_equip_table('tasks'), array(
        'assignment_id' => $assignment_id, 'task_type_id' => $task_type_id, 'task_date' => $date,
        'params' => wp_json_encode($params), 'done' => 0, 'status' => 'pendiente', 'original_date' => $date,
        'created_by' => progreso_equip_actor($request), 'created_at' => current_time('mysql'),
    ), array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s'));
    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id));
}

function progreso_equip_rules() {
    return array(
        array('kind' => 'validation', 'text' => 'No usar el mismo color de presas en 2 bloques del mismo panel.'),
        array('kind' => 'warning',    'text' => 'No mezclar juegos de colores parecidos en el mismo bloque.'),
        array('kind' => 'info',       'text' => 'Separar los tornillos de las presas y volúmenes.'),
        array('kind' => 'info',       'text' => 'Tornillos del tamaño adecuado para cada presa; poner siempre antigiros del tamaño apropiado.'),
        array('kind' => 'info',       'text' => 'Ojo con presas puestas solo con antigiros.'),
        array('kind' => 'info',       'text' => 'Tirafondos con arandelas en todos los volúmenes.'),
        array('kind' => 'info',       'text' => 'Balizar la zona de equipación.'),
        array('kind' => 'info',       'text' => 'Registrar las tareas y subir los bloques a la webapp.'),
        array('kind' => 'warning',    'text' => 'Bloques amarillos están quedando muy duros.'),
        array('kind' => 'info',       'text' => 'Limpiar las presas con cuidado para que no se rompan y que queden limpias.'),
        array('kind' => 'info',       'text' => 'Las travesías no pueden quedar incompletas (modificarlas si hace falta) y solo deben ocupar el espacio de la zona a equipar.'),
        array('kind' => 'info',       'text' => 'Orden de la terraza: expuertas, valdes, escaleras; volúmenes; presas.'),
    );
}

function progreso_equip_get_config() {
    // Al abrir Organización: asegura que la semana actual y la siguiente existan solas (paso 3
    // del encargo del 28/10), sin esperar al cron diario.
    progreso_equip_autocrear_semanas();
    return rest_ensure_response(array('success' => true, 'data' => array(
        'subzones'     => progreso_equip_subzones(),
        'grades'       => progreso_equip_grades(),
        'taskTypes'    => progreso_equip_task_types(),
        'rules'        => progreso_equip_rules(),
        // Ramiro 12/11 11:35: para que el frontend solo PINTE los botones de editar/mover/
        // quitar tareas con la sesión real (nunca con el selector local de "quién soy").
        'esJefeOSocio' => progreso_equip_es_jefe_o_socio(),
    )));
}

// Crea la semana actual y la siguiente si no existen todavía (ni reales ni de prueba), con
// todas las tareas al responsable (`auto = 1`) para que las reparta arrastrando — usa el mismo
// `progreso_equip_create_week` de siempre, así que respeta periodicidad, recoge retrasadas y
// nunca duplica (si Álvaro ya la creó a mano, `create_week` simplemente la encuentra y no hace
// nada más). Si no hay ningún responsable configurado, no hace nada (no hay a quién asignarlo).
function progreso_equip_autocrear_semanas() {
    global $wpdb;
    progreso_equip_ensure_tables();
    $lead = $wpdb->get_row("SELECT * FROM " . progreso_equip_table('workers') . " WHERE is_lead = 1 AND active = 1 ORDER BY id ASC LIMIT 1", ARRAY_A);
    if (!$lead) return;
    // Todo el equipo activo de mantenimiento, no solo el responsable (cowork,
    // NOTAS_PARA_CODE_equipacion.md 3/11 12:00: las semanas 35 y 36 se habían creado solo con
    // Álvaro — sin columnas de Ana/Edu/Sara no puede repartirles nada arrastrando). Los
    // eventuales (solo vienen a compes puntuales) se quedan fuera, igual que en
    // `progreso_equip_ensure_week_for_lead`.
    $activos = $wpdb->get_results("SELECT id FROM " . progreso_equip_table('workers') . " WHERE active = 1 AND eventual = 0 ORDER BY is_lead DESC, id ASC", ARRAY_A);
    if (!$activos) $activos = array(array('id' => $lead['id']));

    $hoy = current_time('Y-m-d');
    // "Semana actual" en sábado/domingo no puede ser la que ya terminó (lunes-viernes ya
    // pasados): en ese caso la "actual" es la del lunes que viene — cowork, 1/11 18:25, un
    // domingo creó la semana del lunes anterior entera en el pasado, y el barrido la arrastró
    // como "retrasada" a la semana siguiente sin que esos días hubieran existido nunca.
    $dow = (int) date('N', strtotime($hoy)); // ISO: 1 = lunes .. 7 = domingo
    $semana_actual = ($dow >= 6)
        ? date('Y-m-d', strtotime($hoy) + (8 - $dow) * 86400)
        : progreso_equip_monday_of($hoy);
    $semana_siguiente = date('Y-m-d', strtotime($semana_actual) + 7 * 86400);

    foreach (array($semana_actual, $semana_siguiente) as $monday) {
        $existe = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM " . progreso_equip_table('weeks') . " WHERE start_date = %s", $monday
        ));
        if ($existe) continue;

        $req = new WP_REST_Request('POST', '/progreso/v1/equipacion/weeks');
        $req->set_param('startDate', $monday);
        $req->set_param('subzones', array());
        $req->set_param('assignments', array_map(function($w) { return array('workerId' => intval($w['id'])); }, $activos));
        $req->set_param('isAuto', true);
        $res = progreso_equip_create_week($req);
        if (is_wp_error($res)) continue;
        $data = $res->get_data();
        if (!empty($data['week_id'])) {
            $wpdb->update(progreso_equip_table('weeks'),
                array('notes' => 'Semana creada automáticamente: reparte las tareas arrastrándolas.'),
                array('id' => intval($data['week_id'])), array('%s'), array('%d'));
        }
    }
}

function progreso_equip_table($name) {
    global $wpdb;
    return $wpdb->prefix . 'blokes_equip_' . $name;
}

function progreso_equip_ensure_tables() {
    global $wpdb;
    // v6: is_test (semanas/compes de prueba, borrables del todo y fuera de la lista normal),
    // assignments.work_days (día de trabajo editable por persona y semana, no solo el fijo del
    // trabajador — vacaciones o cambios puntuales), competitions.comp_end_date (una compe dura
    // varios días, no uno), task_types.recurring (0 = tarea de un proyecto puntual como una
    // compe, nunca se propone sola cada semana) y tasks.competition_id (qué compe generó esta
    // tarea, para poder borrar/filtrar su plan como un bloque).
    // v7: task_types.description/preferred_day/subzone/duration_min/active (creador de tareas
    // de Álvaro, Ramiro 1/11 17:20) — nunca se borra un tipo, solo se desactiva (histórico).
    // v8: weeks.auto (semana creada sola por el cron/al abrir Organización, paso 3 del encargo
    // del 28/10 — "si Álvaro no hace nada, la semana existe igual").
    // v9: workers.eventual (solo viene a compes puntuales, p. ej. el fin de semana de una — no
    // debe entrar en el reparto normal de mantenimiento de cada semana; cowork, 2/11 14:00:
    // generate-plan metía a todo el equipo activo, incluidos los de un solo finde, en semanas
    // normales enteras).
    // v10: nada de esquema — solo para disparar `progreso_equip_backfill_semanas_auto()` una vez
    // (cowork, NOTAS_PARA_CODE_equipacion.md 3/11 12:00: las semanas automáticas solo llevaban al
    // responsable, `progreso_equip_autocrear_semanas()` no pasaba el resto del equipo).
    // v11: tasks.created_by/created_at/updated_by/updated_at (Ramiro, 5/11 06:54: cualquier profe
    // o Eva puede crear y modificar tareas, y Álvaro tiene que ver quién cambió qué).
    // v12: task_types.preferred_workers (Ramiro, 5/11 21:08: pauta de quién suele hacer cada
    // tarea, sacada del histórico de Notion — editable desde Normas, no fija en código).
    // v13: competitions.modo_activo (interruptor manual de "modo compe", solo lo enciende/apaga
    // un socio) y comp_blocks.bloke_post_id (enlace al bloke real de la app una vez creado) —
    // encargo "la compe en Blokes" (Ramiro, 7/11 08:39/08:46/08:48/08:51,
    // NOTAS_PARA_CODE_compe_en_blokes.md). Nuevas tablas comp_resultados (top/zona/intentos de
    // cada participante por bloque, pendiente de validar) y comp_participantes_rapidos (gente
    // sin cuenta de Blokes dada de alta desde recepción).
    // v14: comp_blocks.photo_attachment_id (Ramiro 12/11 09:11: borrar el adjunto de Medios de
    // verdad, no solo la referencia). weeks.zona_id/zona_sugerida_id y nueva tabla zonas
    // (Ramiro 12/11 09:31/09:35/09:37: calendario de semanas + rotación de zonas — Pasillo,
    // Salón izquierda, Salón derecha, Cueva).
    // v15: nada de esquema — solo para disparar `progreso_equip_limpiar_retrasadas_global()` una
    // vez (Ramiro 12/11 10:45: quitar las marcas rojas de los arrastres de octubre sin borrar ni
    // completar ninguna tarea). tasks.manual (Ramiro 12/11 10:44: "+ Tarea" a mano en el plan de
    // la compe — para que "Regenerar" nunca la toque, aunque coincida tipo+fecha con el plan).
    $version = '15';
    if (get_option('blokes_equip_tables_version') === $version) return;
    $charset = $wpdb->get_charset_collate();
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    dbDelta("CREATE TABLE " . progreso_equip_table('workers') . " (
        id         bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        name       varchar(100)        NOT NULL,
        email      varchar(190)        NOT NULL DEFAULT '',
        work_days  varchar(50)         NOT NULL DEFAULT '',
        blocks_min tinyint(3)          NOT NULL DEFAULT 1,
        blocks_max tinyint(3)          NOT NULL DEFAULT 2,
        is_lead    tinyint(1)          NOT NULL DEFAULT 0,
        active     tinyint(1)          NOT NULL DEFAULT 1,
        eventual   tinyint(1)          NOT NULL DEFAULT 0,
        PRIMARY KEY (id)
    ) {$charset};");

    dbDelta("CREATE TABLE " . progreso_equip_table('holdsets') . " (
        id   bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        name varchar(100)        NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY name (name)
    ) {$charset};");

    dbDelta("CREATE TABLE " . progreso_equip_table('weeks') . " (
        id               bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        start_date       date                NOT NULL,
        subzones         varchar(50)         NOT NULL DEFAULT '',
        notes            text                NULL,
        archived         tinyint(1)          NOT NULL DEFAULT 0,
        is_test          tinyint(1)          NOT NULL DEFAULT 0,
        auto             tinyint(1)          NOT NULL DEFAULT 0,
        zona_id          bigint(20) UNSIGNED NULL,
        zona_sugerida_id bigint(20) UNSIGNED NULL,
        created_at       datetime            NOT NULL,
        PRIMARY KEY (id)
    ) {$charset};");

    // Calendario de semanas + rotación de zonas (Ramiro 12/11 09:31/09:35/09:37): una zona
    // (grupo de subzonas) por semana, para que cada bloque dure aproximadamente un mes.
    // subzonas: lista "1,2" en el mismo orden de números que usa el resto de equipación.
    dbDelta("CREATE TABLE " . progreso_equip_table('zonas') . " (
        id       bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        nombre   varchar(60)         NOT NULL,
        color    varchar(20)         NOT NULL DEFAULT '#60a5fa',
        subzonas varchar(50)         NOT NULL DEFAULT '',
        orden    tinyint(3)          NOT NULL DEFAULT 0,
        activa   tinyint(1)          NOT NULL DEFAULT 1,
        PRIMARY KEY (id)
    ) {$charset};");

    dbDelta("CREATE TABLE " . progreso_equip_table('assignments') . " (
        id         bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        week_id    bigint(20) UNSIGNED NOT NULL,
        worker_id  bigint(20) UNSIGNED NOT NULL,
        subzones   varchar(50)         NOT NULL DEFAULT '',
        blocks_min tinyint(3)          NOT NULL DEFAULT 1,
        blocks_max tinyint(3)          NOT NULL DEFAULT 2,
        work_days  varchar(50)         NOT NULL DEFAULT '',
        status     varchar(20)         NOT NULL DEFAULT 'pendiente',
        PRIMARY KEY (id),
        KEY week_id (week_id),
        KEY worker_id (worker_id)
    ) {$charset};");

    dbDelta("CREATE TABLE " . progreso_equip_table('tasks') . " (
        id               bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        assignment_id    bigint(20) UNSIGNED NOT NULL,
        task_type_id     varchar(40)         NOT NULL,
        task_date        date                NOT NULL,
        params           text                NULL,
        done             tinyint(1)          NOT NULL DEFAULT 0,
        done_at          datetime            NULL,
        status            varchar(20)         NOT NULL DEFAULT 'pendiente',
        original_date     date                NULL,
        postponed_count   tinyint(3)          NOT NULL DEFAULT 0,
        moved_to_task_id  bigint(20) UNSIGNED NULL,
        original_worker_id bigint(20) UNSIGNED NULL,
        competition_id    bigint(20) UNSIGNED NULL,
        manual             tinyint(1)          NOT NULL DEFAULT 0,
        created_by        varchar(100)        NULL,
        created_at        datetime            NULL,
        updated_by        varchar(100)        NULL,
        updated_at        datetime            NULL,
        PRIMARY KEY (id),
        KEY assignment_id (assignment_id),
        KEY task_date (task_date)
    ) {$charset};");

    dbDelta("CREATE TABLE " . progreso_equip_table('blocks') . " (
        id              bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        assignment_id   bigint(20) UNSIGNED NOT NULL,
        subzone         tinyint(3)          NOT NULL,
        grade_color     varchar(20)         NOT NULL,
        hold_set_ids    varchar(100)        NOT NULL DEFAULT '',
        is_traverse     tinyint(1)          NOT NULL DEFAULT 0,
        done            tinyint(1)          NOT NULL DEFAULT 0,
        uploaded_webapp tinyint(1)          NOT NULL DEFAULT 0,
        created_at      datetime            NOT NULL,
        PRIMARY KEY (id),
        KEY assignment_id (assignment_id)
    ) {$charset};");

    dbDelta("CREATE TABLE " . progreso_equip_table('competitions') . " (
        id            bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        name          varchar(190)        NOT NULL,
        comp_date     date                NOT NULL,
        comp_end_date date                NULL,
        lead_weeks    tinyint(3)          NOT NULL DEFAULT 3,
        is_test       tinyint(1)          NOT NULL DEFAULT 0,
        modo_activo   tinyint(1)          NOT NULL DEFAULT 0,
        created_at    datetime            NOT NULL,
        PRIMARY KEY (id)
    ) {$charset};");

    // Posición en el mapa guardada como % (x_pct/y_pct, 0-100) para que
    // funcione con la imagen a cualquier tamaño de pantalla. NULL = todavía
    // sin colocar en el mapa. subzone/volumes/equipador/photo_url/tested son
    // la "ficha de bloque de compe" (encargo Preparador de compes, 1/11).
    dbDelta("CREATE TABLE " . progreso_equip_table('comp_blocks') . " (
        id             bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        competition_id bigint(20) UNSIGNED NOT NULL,
        number         tinyint(3)          NOT NULL,
        x_pct          decimal(5,2)        NULL,
        y_pct          decimal(5,2)        NULL,
        subzone        tinyint(3)          NULL,
        grade_color    varchar(20)         NOT NULL DEFAULT '',
        hold_set_ids   varchar(100)        NOT NULL DEFAULT '',
        volumes        text                NOT NULL DEFAULT '',
        equipador      varchar(60)         NOT NULL DEFAULT '',
        photo_url      varchar(255)        NOT NULL DEFAULT '',
        photo_attachment_id bigint(20) UNSIGNED NULL,
        tested         tinyint(1)          NOT NULL DEFAULT 0,
        status         varchar(20)         NOT NULL DEFAULT 'planeado',
        bloke_post_id  bigint(20) UNSIGNED NULL,
        PRIMARY KEY (id),
        KEY competition_id (competition_id)
    ) {$charset};");

    // Resultado de UN participante en UN bloque de compe — top/zona/intentos, pendiente de
    // validar por un juez/profe hasta que alguien lo confirme. participante_tipo distingue un
    // usuario real de Blokes de un "participante rápido" sin cuenta (mismo patrón que
    // wp_blokes_placeholder_completions ya usa para alumnos sin cuenta).
    dbDelta("CREATE TABLE " . progreso_equip_table('comp_resultados') . " (
        id                bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        competition_id    bigint(20) UNSIGNED NOT NULL,
        comp_block_id     bigint(20) UNSIGNED NOT NULL,
        participante_tipo varchar(12)         NOT NULL DEFAULT 'user',
        participante_id   bigint(20) UNSIGNED NOT NULL,
        top               tinyint(1)          NOT NULL DEFAULT 0,
        zona              tinyint(1)          NOT NULL DEFAULT 0,
        intentos          smallint(5)         NOT NULL DEFAULT 0,
        apuntado_por      bigint(20) UNSIGNED NULL,
        estado            varchar(20)         NOT NULL DEFAULT 'pendiente',
        validado_por      bigint(20) UNSIGNED NULL,
        validado_at       datetime            NULL,
        created_at        datetime            NOT NULL,
        updated_at        datetime            NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY resultado_unico (competition_id, comp_block_id, participante_tipo, participante_id),
        KEY competition_id (competition_id),
        KEY estado (estado)
    ) {$charset};");

    // Gente sin cuenta de Blokes dada de alta desde recepción (pase de día, no socio) —
    // linked_user_id/linked_at: si más tarde se crea una cuenta con el mismo email/teléfono, se
    // enlazan sus resultados (mismo patrón que wp_blokes_placeholder_alumnos).
    dbDelta("CREATE TABLE " . progreso_equip_table('comp_participantes_rapidos') . " (
        id             bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        competition_id bigint(20) UNSIGNED NOT NULL,
        nombre         varchar(190)        NOT NULL,
        telefono       varchar(30)         NOT NULL DEFAULT '',
        email          varchar(190)        NOT NULL DEFAULT '',
        categoria      varchar(60)         NOT NULL DEFAULT 'General',
        pin            varchar(4)          NOT NULL DEFAULT '',
        linked_user_id bigint(20) UNSIGNED NULL,
        linked_at      datetime            NULL,
        created_by     varchar(100)        NOT NULL DEFAULT '',
        created_at     datetime            NOT NULL,
        PRIMARY KEY (id),
        KEY competition_id (competition_id)
    ) {$charset};");

    // Catálogo de tareas en tabla propia (antes hardcoded) para que la
    // periodicidad se pueda ajustar sin tocar código: cada cuántas semanas
    // toca esa tarea, independientemente de quién la haga. `recurring = 0`
    // son tareas de un proyecto puntual (p. ej. una compe): nunca se
    // proponen solas al crear una semana normal, solo las crea el generador
    // de plan de esa compe.
    dbDelta("CREATE TABLE " . progreso_equip_table('task_types') . " (
        id                varchar(40)  NOT NULL,
        name              varchar(190) NOT NULL,
        description       text         NOT NULL DEFAULT '',
        params            varchar(100) NOT NULL DEFAULT '',
        lead_only         tinyint(1)   NOT NULL DEFAULT 0,
        periodicity_weeks tinyint(3)   NOT NULL DEFAULT 1,
        preferred_day     varchar(10)  NOT NULL DEFAULT '',
        subzone           tinyint(3)   NULL,
        duration_min      smallint(5)  NULL,
        recurring         tinyint(1)   NOT NULL DEFAULT 1,
        active            tinyint(1)   NOT NULL DEFAULT 1,
        sort_order        tinyint(3)   NOT NULL DEFAULT 0,
        preferred_workers varchar(100) NOT NULL DEFAULT '',
        PRIMARY KEY (id)
    ) {$charset};");

    update_option('blokes_equip_tables_version', $version);
    progreso_equip_seed_if_empty();
    progreso_equip_seed_zonas_if_empty();
    progreso_equip_seed_task_types_if_empty();
    progreso_equip_seed_comp_task_types_if_missing();
    progreso_equip_marcar_eventuales_ramiro_1();
    progreso_equip_limpiar_retrasadas_global();
    progreso_equip_backfill_semanas_auto();

    // Periodicidades reales de Ramiro (1/11 17:20): se habían quedado todas a 1 (cowork
    // sospecha que un reseed del 29/10 las pisó). Una sola vez, no vuelve a tocarlas si alguien
    // las cambia después desde Normas.
    if (!get_option('blokes_equip_periodicidades_ramiro_1')) {
        foreach (array('regar', 'limpiar', 'ordenar') as $tipo_id) {
            $wpdb->update(progreso_equip_table('task_types'), array('periodicity_weeks' => 2), array('id' => $tipo_id), array('%d'), array('%s'));
        }
        update_option('blokes_equip_periodicidades_ramiro_1', 1, false);
    }
}

// Semilla de las 4 zonas por defecto (Ramiro 12/11 09:35: "las zonas son pasillo, salón
// izquierda, salón derecha y cueva" — 4 zonas = 4 semanas = cada bloque dura
// aproximadamente un mes). Editable desde "⚙️ Configurar zonas" por si cambian algún día.
function progreso_equip_seed_zonas_if_empty() {
    global $wpdb;
    $table = progreso_equip_table('zonas');
    if ((int) $wpdb->get_var("SELECT COUNT(*) FROM $table") > 0) return;
    $seed = array(
        array('nombre' => 'Pasillo',          'color' => '#60a5fa', 'subzonas' => '1,2'),
        array('nombre' => 'Salón izquierda',  'color' => '#34d399', 'subzonas' => '3,4,5'),
        array('nombre' => 'Salón derecha',    'color' => '#f5c842', 'subzonas' => '6,7'),
        array('nombre' => 'Cueva',            'color' => '#a78bfa', 'subzonas' => '8'),
    );
    foreach ($seed as $i => $z) {
        $wpdb->insert($table, array(
            'nombre' => $z['nombre'], 'color' => $z['color'], 'subzonas' => $z['subzonas'], 'orden' => $i, 'activa' => 1,
        ), array('%s', '%s', '%s', '%d', '%d'));
    }
}

// Semilla del catálogo de tareas — mismo orden de trabajo natural que
// antes (quitar → volúmenes → bloques → densidad/travesías →
// limpiar/ordenar/regar → subir webapp), todas semanales por defecto.
function progreso_equip_seed_task_types_if_empty() {
    global $wpdb;
    $table = progreso_equip_table('task_types');
    if ((int) $wpdb->get_var("SELECT COUNT(*) FROM $table") > 0) return;

    $seed = array(
        array('id' => 'balizar',          'name' => 'Balizar zona de equipación',                'params' => array('subzona')),
        array('id' => 'quitar_bloques',    'name' => 'Quitar bloques',                            'params' => array('subzona', 'notas')),
        array('id' => 'quitar_densidad',   'name' => 'Quitar densidad',                           'params' => array('subzona')),
        array('id' => 'quitar_volumenes',  'name' => 'Quitar volúmenes',                          'params' => array('subzona')),
        array('id' => 'poner_volumenes',   'name' => 'Poner volúmenes',                           'params' => array('subzona')),
        array('id' => 'poner_bloques',     'name' => 'Poner bloques',                             'params' => array('subzona', 'objetivo')),
        array('id' => 'poner_densidad',    'name' => 'Poner densidad',                            'params' => array('colores')),
        array('id' => 'poner_travesias',   'name' => 'Poner travesías',                           'params' => array('subzona', 'color')),
        array('id' => 'limpiar',           'name' => 'Limpiar presas / volúmenes',                'params' => array()),
        array('id' => 'ordenar',           'name' => 'Ordenar (tornillos, presas, volúmenes)',    'params' => array()),
        array('id' => 'regar',             'name' => 'Regar',                                     'params' => array()),
        array('id' => 'subir_webapp',      'name' => 'Subir bloques a la webapp',                 'params' => array()),
        array('id' => 'organizar_semanas', 'name' => 'Organizar próximas semanas (RouteSetting)', 'params' => array(), 'lead_only' => true),
    );
    foreach ($seed as $i => $t) {
        $wpdb->insert($table, array(
            'id' => $t['id'], 'name' => $t['name'], 'params' => implode(',', $t['params']),
            'lead_only' => !empty($t['lead_only']) ? 1 : 0, 'periodicity_weeks' => 1, 'sort_order' => $i,
        ), array('%s', '%s', '%s', '%d', '%d', '%d'));
    }
}

// Tareas de una compe (encargo "Preparador de compes", 1/11): proyecto puntual, no
// mantenimiento semanal — `recurring = 0` para que `progreso_equip_create_week()` nunca las
// proponga solas en una semana normal. Solo las crea `progreso_equip_competition_generate_plan()`.
// Se insertan una a una (no depende de que la tabla esté vacía) para no chocar con el catálogo
// normal ya sembrado.
function progreso_equip_seed_comp_task_types_if_missing() {
    global $wpdb;
    $table = progreso_equip_table('task_types');
    $seed = array(
        array('id' => 'comp_disenar_bloques', 'name' => 'Compe: diseñar los 16 bloques (zona, dificultad, presas, volúmenes)'),
        array('id' => 'comp_revisar_material', 'name' => 'Compe: revisar presas y tornillería, pedir lo que falte'),
        array('id' => 'comp_limpieza_presas', 'name' => 'Compe: limpieza de presas'),
        array('id' => 'comp_puntuacion', 'name' => 'Compe: preparar hojas de puntuación / sistema de resultados'),
        array('id' => 'comp_inscripciones', 'name' => 'Compe: inscripciones y categorías'),
        array('id' => 'comp_prep_montaje', 'name' => 'Compe: preparar montaje de zona de público y premios'),
        array('id' => 'comp_decidir_forerunners', 'name' => 'Compe: decidir lista de forerunners'),
        array('id' => 'comp_desequipar_cueva', 'name' => 'Compe: desequipar — primero la Cueva'),
        array('id' => 'comp_desequipar_resto', 'name' => 'Compe: desequipar — resto de zonas'),
        array('id' => 'comp_equipar_bloques', 'name' => 'Compe: equipar los 16 bloques'),
        array('id' => 'comp_numeracion', 'name' => 'Compe: numeración y cintas'),
        array('id' => 'comp_foto_bloque', 'name' => 'Compe: foto de cada bloque'),
        array('id' => 'comp_forerunning', 'name' => 'Compe: prueba de bloques (forerunning)'),
        array('id' => 'comp_montaje_zona', 'name' => 'Compe: montaje de zona de público / música / premios'),
        array('id' => 'comp_dia_abrir', 'name' => 'Compe: día de competición — abrir'),
        array('id' => 'comp_dia_juzgar', 'name' => 'Compe: día de competición — juzgar / anotar'),
        array('id' => 'comp_dia_cerrar', 'name' => 'Compe: día de competición — cerrar y resultados'),
        array('id' => 'comp_desmontar', 'name' => 'Compe: desmontar'),
        array('id' => 'comp_fotos_redes', 'name' => 'Compe: fotos y redes'),
        array('id' => 'comp_resultados_web', 'name' => 'Compe: resultados en la web'),
    );
    foreach ($seed as $i => $t) {
        $existe = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE id = %s", $t['id']));
        if ($existe) continue;
        $wpdb->insert($table, array(
            'id' => $t['id'], 'name' => $t['name'], 'params' => 'notas',
            'lead_only' => 0, 'periodicity_weeks' => 1, 'recurring' => 0, 'sort_order' => 90 + $i,
        ), array('%s', '%s', '%s', '%d', '%d', '%d', '%d'));
    }
}

// Migración de una sola vez (cowork, 2/11 12:55/14:00): Ramiro (id 5), Álvaro V. (id 6) y Javi
// (id 7) se crearon para venir solo el fin de semana de esta compe — se marcan "eventual" para
// que el reparto normal de mantenimiento ya no los cuente, y se quitan las asignaciones vacías
// (sin tareas, sin bloques) que `generate-plan` ya les había puesto en semanas normales (2/11,
// 9/11, 7/12…) antes de existir este campo.
function progreso_equip_marcar_eventuales_ramiro_1() {
    if (get_option('blokes_equip_eventuales_ramiro_1')) return;
    global $wpdb;
    $ids = array(5, 6, 7);
    $workers_table = progreso_equip_table('workers');
    $existe = $wpdb->get_col("SELECT id FROM {$workers_table} WHERE id IN (" . implode(',', $ids) . ")");
    if ($existe) {
        $wpdb->query("UPDATE {$workers_table} SET eventual = 1 WHERE id IN (" . implode(',', array_map('intval', $existe)) . ")");

        $assignments_table = progreso_equip_table('assignments');
        $tasks_table = progreso_equip_table('tasks');
        $blocks_table = progreso_equip_table('blocks');
        $vacias = $wpdb->get_results(
            "SELECT id FROM {$assignments_table} WHERE worker_id IN (" . implode(',', array_map('intval', $existe)) . ")", ARRAY_A
        );
        foreach ($vacias as $a) {
            $aid = intval($a['id']);
            $tiene_tareas = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$tasks_table} WHERE assignment_id = %d", $aid));
            $tiene_bloques = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$blocks_table} WHERE assignment_id = %d", $aid));
            if (!$tiene_tareas && !$tiene_bloques) $wpdb->delete($assignments_table, array('id' => $aid), array('%d'));
        }
    }
    update_option('blokes_equip_eventuales_ramiro_1', 1, false);
}

// Migración de una sola vez (cowork, NOTAS_PARA_CODE_equipacion.md 3/11 12:00): hasta ahora
// `progreso_equip_autocrear_semanas()` solo metía al responsable en las semanas automáticas —
// sin columna para Ana/Edu/Sara, Álvaro no podía repartirles nada arrastrando. Ya está arreglado
// para las semanas NUEVAS; esto completa el equipo en las que ya existían (p. ej. la 35 y la 36
// del club), igual que el backfill de `progreso_equip_ensure_week_for_lead`.
function progreso_equip_backfill_semanas_auto() {
    if (get_option('blokes_equip_backfill_semanas_auto_1')) return;
    global $wpdb;
    $weeks_table = progreso_equip_table('weeks');
    $assignments_table = progreso_equip_table('assignments');
    $activos = $wpdb->get_results("SELECT id, name FROM " . progreso_equip_table('workers') . " WHERE active = 1 AND eventual = 0", ARRAY_A);
    $weeks = $wpdb->get_results("SELECT id FROM {$weeks_table} WHERE auto = 1", ARRAY_A);
    foreach ($weeks as $w) {
        $week_id = intval($w['id']);
        $ya_asignados = $wpdb->get_col($wpdb->prepare("SELECT worker_id FROM {$assignments_table} WHERE week_id = %d", $week_id));
        foreach ($activos as $worker) {
            if (in_array(intval($worker['id']), array_map('intval', $ya_asignados), true)) continue;
            $wpdb->insert($assignments_table, array(
                'week_id' => $week_id, 'worker_id' => intval($worker['id']), 'subzones' => '', 'status' => 'pendiente',
            ), array('%d', '%d', '%s', '%s'));
        }
    }
    update_option('blokes_equip_backfill_semanas_auto_1', 1, false);
}

// POST /equipacion/migrar-principal-a-club — CAUSA ENCONTRADA por cowork (NOTAS_PARA_CODE_equipacion.md,
// 3/11 12:00): la app llama siempre a /club/wp-json (blog_id 3), pero la compe id 2 (repartida a
// mano: Ana, Edu, Sara, Ramiro, Álvaro V., Javi) y los trabajadores eventuales 5/6/7 se crearon
// probando contra el sitio principal (blog_id 1), que en la multisite usa sus propias tablas —
// por eso la app nunca los vio. Copia eso al club SIN BORRAR nada del principal (por si hay que
// repetirlo) y SIN TOCAR las semanas 12/13 del principal (cowork: las 35/36 del club son las
// buenas, se descartan). Por defecto solo informa de lo que haría (`confirmar` no mandado o
// false) — para escribir de verdad hay que mandar `confirmar: true`, y solo se puede una vez
// (lo marca `blokes_equip_migrado_principal_1`; si hay que repetirlo, hay que borrar esa opción
// a mano primero).
function progreso_equip_migrar_principal_a_club($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $confirmar = (bool) $request->get_param('confirmar');
    if ($confirmar && get_option('blokes_equip_migrado_principal_1')) {
        return new WP_Error('ya_migrado', 'Esto ya se migró antes. Si hace falta repetirlo, borra la opción blokes_equip_migrado_principal_1 primero.', array('status' => 409));
    }

    $main = function($name) use ($wpdb) { return $wpdb->get_blog_prefix(1) . 'blokes_equip_' . $name; };
    $club = function($name) { return progreso_equip_table($name); };
    $reporte = array(
        'workers' => array(), 'competition' => null, 'weeks' => array(),
        'assignments' => 0, 'tasks' => 0, 'taskTypes' => array(), 'compBlocks' => 0, 'avisos' => array(),
    );

    // 1. Trabajadores eventuales del principal que no existan ya en club (por nombre) — y mapeo
    // por nombre de TODOS los trabajadores (también Álvaro/Ana/Edu/Sara, que ya existen en los
    // dos sitios pero con IDs distintos) para poder remapear asignaciones y tareas más abajo.
    $main_workers = $wpdb->get_results("SELECT * FROM " . $main('workers'), ARRAY_A);
    $club_workers_by_name = array();
    foreach ($wpdb->get_results("SELECT * FROM " . $club('workers'), ARRAY_A) as $w) {
        $club_workers_by_name[mb_strtolower(trim($w['name']))] = $w;
    }
    $worker_map = array();
    foreach ($main_workers as $w) {
        $oid = intval($w['id']);
        $key = mb_strtolower(trim($w['name']));
        if (isset($club_workers_by_name[$key])) {
            $worker_map[$oid] = intval($club_workers_by_name[$key]['id']);
            if ($w['eventual']) $reporte['workers'][] = $w['name'] . ' (eventual, ya existía en club)';
            continue;
        }
        if (!$w['eventual']) { $reporte['avisos'][] = 'Trabajador "' . $w['name'] . '" del principal no es eventual y no existe en club: no se crea solo (podría ser un duplicado con otro nombre).'; continue; }
        $reporte['workers'][] = $w['name'] . ' (eventual, nuevo)';
        if ($confirmar) {
            $wpdb->insert($club('workers'), array(
                'name' => $w['name'], 'email' => $w['email'], 'work_days' => $w['work_days'],
                'blocks_min' => $w['blocks_min'], 'blocks_max' => $w['blocks_max'],
                'is_lead' => $w['is_lead'], 'active' => $w['active'], 'eventual' => $w['eventual'],
            ), array('%s', '%s', '%s', '%d', '%d', '%d', '%d', '%d'));
            $worker_map[$oid] = $wpdb->insert_id;
        } else {
            // En el informe (sin escribir) todavía no hay un id real del club: un id negativo de
            // relleno basta para que el resto del informe pueda contar bien las asignaciones y
            // tareas de este trabajador en vez de salir como "sin mapear" (cowork, 3/11 12:35: el
            // aviso hacía parecer que se iba a perder el reparto del fin de semana de montaje,
            // cuando al confirmar de verdad sí se crea el trabajador antes de mapear).
            $worker_map[$oid] = -$oid;
        }
    }

    // 2. Competición #2 del principal.
    $comp = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . $main('competitions') . " WHERE id = %d", 2), ARRAY_A);
    $new_comp_id = null;
    if ($comp) {
        $existe_comp = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . $club('competitions') . " WHERE name = %s AND comp_date = %s", $comp['name'], $comp['comp_date']), ARRAY_A);
        if ($existe_comp) {
            $new_comp_id = intval($existe_comp['id']);
            $reporte['competition'] = $comp['name'] . ' (ya existía en club, #' . $new_comp_id . ')';
        } else {
            $reporte['competition'] = $comp['name'] . ' (nueva)';
            if ($confirmar) {
                $wpdb->insert($club('competitions'), array(
                    'name' => $comp['name'], 'comp_date' => $comp['comp_date'], 'comp_end_date' => $comp['comp_end_date'],
                    'lead_weeks' => $comp['lead_weeks'], 'is_test' => $comp['is_test'], 'created_at' => $comp['created_at'],
                ), array('%s', '%s', '%s', '%d', '%d', '%s'));
                $new_comp_id = $wpdb->insert_id;
            }
        }
    } else {
        $reporte['avisos'][] = 'No se encontró la competición #2 en el sitio principal.';
    }

    // 3. Semanas 18, 15, 16 y 19 del principal (las de la compe intensiva con el reparto a
    // mano) — nunca las 12/13 (maneimiento normal, ya superadas por la 35/36 del club).
    $week_ids_principal = array(18, 15, 16, 19);
    $week_map = array();
    foreach ($week_ids_principal as $wid) {
        $week = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . $main('weeks') . " WHERE id = %d", $wid), ARRAY_A);
        if (!$week) { $reporte['avisos'][] = "Semana #{$wid} no encontrada en el principal."; continue; }
        $existe_week = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . $club('weeks') . " WHERE start_date = %s", $week['start_date']), ARRAY_A);
        if ($existe_week) {
            $week_map[$wid] = intval($existe_week['id']);
            $reporte['weeks'][] = $week['start_date'] . ' (ya existía en club, #' . $existe_week['id'] . ')';
            continue;
        }
        $reporte['weeks'][] = $week['start_date'] . ' (nueva)';
        if ($confirmar) {
            $wpdb->insert($club('weeks'), array(
                'start_date' => $week['start_date'], 'subzones' => $week['subzones'], 'notes' => $week['notes'],
                'archived' => $week['archived'], 'is_test' => $week['is_test'], 'auto' => $week['auto'], 'created_at' => $week['created_at'],
            ), array('%s', '%s', '%s', '%d', '%d', '%d', '%s'));
            $week_map[$wid] = $wpdb->insert_id;
        } else {
            $week_map[$wid] = $wid; // placeholder solo para que el resto del informe pueda seguir en modo simulación
        }
    }

    // 4. Asignaciones de esas semanas.
    $assignment_map = array();
    $week_ids_for_query = $week_ids_principal;
    $ph = implode(',', array_fill(0, count($week_ids_for_query), '%d'));
    $main_assignments = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . $main('assignments') . " WHERE week_id IN ($ph)", ...$week_ids_for_query
    ), ARRAY_A);
    foreach ($main_assignments as $a) {
        $old_week_id = intval($a['week_id']);
        $new_worker_id = $worker_map[intval($a['worker_id'])] ?? null;
        if (!$new_worker_id) { $reporte['avisos'][] = 'Asignación #' . $a['id'] . ' (semana #' . $old_week_id . '): trabajador #' . $a['worker_id'] . ' sin mapear, no se migra.'; continue; }
        $reporte['assignments']++;
        if ($confirmar) {
            $new_week_id = $week_map[$old_week_id] ?? null;
            if (!$new_week_id) continue;
            $wpdb->insert($club('assignments'), array(
                'week_id' => $new_week_id, 'worker_id' => $new_worker_id, 'subzones' => $a['subzones'],
                'blocks_min' => $a['blocks_min'], 'blocks_max' => $a['blocks_max'], 'work_days' => $a['work_days'], 'status' => $a['status'],
            ), array('%d', '%d', '%s', '%d', '%d', '%s', '%s'));
            $assignment_map[intval($a['id'])] = $wpdb->insert_id;
        }
    }

    // 5. Tipos de tarea que usan esas tareas y que todavía no existen en club (se copian tal
    // cual, mismo id-slug, para que el nombre no salga en blanco).
    $main_tasks = $wpdb->get_results($wpdb->prepare(
        "SELECT t.* FROM " . $main('tasks') . " t JOIN " . $main('assignments') . " a ON a.id = t.assignment_id WHERE a.week_id IN ($ph)", ...$week_ids_for_query
    ), ARRAY_A);
    $tipos_usados = array_values(array_unique(array_filter(array_map(function($t) { return $t['task_type_id']; }, $main_tasks), function($id) { return $id !== 'custom'; })));
    if ($tipos_usados) {
        $ph2 = implode(',', array_fill(0, count($tipos_usados), '%s'));
        $existentes = $wpdb->get_col($wpdb->prepare("SELECT id FROM " . $club('task_types') . " WHERE id IN ($ph2)", ...$tipos_usados));
        foreach ($tipos_usados as $tid) {
            if (in_array($tid, $existentes, true)) continue;
            $tipo = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . $main('task_types') . " WHERE id = %s", $tid), ARRAY_A);
            if (!$tipo) continue;
            $reporte['taskTypes'][] = $tipo['name'] . ' (' . $tid . ')';
            if ($confirmar) {
                $wpdb->insert($club('task_types'), $tipo);
            }
        }
    }

    // 6. Tareas (dos pasadas: primero se crean sin moved_to_task_id, luego se enlaza el que
    // apunte a OTRA tarea de este mismo lote; si apuntaba fuera del lote — p. ej. a la semana
    // 12/13 que no se migra — se deja sin enlazar, nunca roto).
    $task_map = array();
    $pendientes_moved_to = array();
    foreach ($main_tasks as $t) {
        $new_assignment_id = $assignment_map[intval($t['assignment_id'])] ?? null;
        $reporte['tasks']++;
        if (!$confirmar || !$new_assignment_id) continue;
        $new_original_worker = $t['original_worker_id'] ? ($worker_map[intval($t['original_worker_id'])] ?? null) : null;
        $new_competition_id = ($new_comp_id && intval($t['competition_id']) === 2) ? $new_comp_id : null;
        $wpdb->insert($club('tasks'), array(
            'assignment_id' => $new_assignment_id, 'task_type_id' => $t['task_type_id'], 'task_date' => $t['task_date'],
            'params' => $t['params'], 'done' => $t['done'], 'done_at' => $t['done_at'], 'status' => $t['status'],
            'original_date' => $t['original_date'], 'postponed_count' => $t['postponed_count'],
            'original_worker_id' => $new_original_worker, 'competition_id' => $new_competition_id,
        ), array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%d', '%d', '%d'));
        $new_task_id = $wpdb->insert_id;
        $task_map[intval($t['id'])] = $new_task_id;
        if ($t['moved_to_task_id']) $pendientes_moved_to[$new_task_id] = intval($t['moved_to_task_id']);
    }
    foreach ($pendientes_moved_to as $new_task_id => $old_moved_to) {
        $mapped = $task_map[$old_moved_to] ?? null;
        if ($mapped) $wpdb->update($club('tasks'), array('moved_to_task_id' => $mapped), array('id' => $new_task_id), array('%d'), array('%d'));
    }

    // 7. Bloques de la ficha de la compe (mapa, equipador, foto…) de la competición #2.
    if ($comp) {
        $comp_blocks = $wpdb->get_results($wpdb->prepare("SELECT * FROM " . $main('comp_blocks') . " WHERE competition_id = %d", 2), ARRAY_A);
        $reporte['compBlocks'] = count($comp_blocks);
        if ($confirmar && $new_comp_id) {
            foreach ($comp_blocks as $b) {
                $wpdb->insert($club('comp_blocks'), array(
                    'competition_id' => $new_comp_id, 'number' => $b['number'], 'x_pct' => $b['x_pct'], 'y_pct' => $b['y_pct'],
                    'subzone' => $b['subzone'], 'grade_color' => $b['grade_color'], 'hold_set_ids' => $b['hold_set_ids'],
                    'volumes' => $b['volumes'], 'equipador' => $b['equipador'], 'photo_url' => $b['photo_url'],
                    'tested' => $b['tested'], 'status' => $b['status'],
                ));
            }
        }
    }

    if ($confirmar) update_option('blokes_equip_migrado_principal_1', 1, false);
    return rest_ensure_response(array('success' => true, 'confirmado' => $confirmar, 'data' => $reporte));
}

// Semilla inicial (trabajadores y catálogo de presas actuales) — solo si
// las tablas están recién creadas y vacías, nunca sobrescribe datos reales.
function progreso_equip_seed_if_empty() {
    global $wpdb;
    $workers_table = progreso_equip_table('workers');
    if ((int) $wpdb->get_var("SELECT COUNT(*) FROM $workers_table") > 0) return;

    $seed_workers = array(
        array('name' => 'Álvaro', 'work_days' => 'mon,tue,wed,thu',     'blocks_min' => 4, 'blocks_max' => 5, 'is_lead' => 1),
        array('name' => 'Ana',    'work_days' => 'mon,tue,wed,thu,fri', 'blocks_min' => 1, 'blocks_max' => 2, 'is_lead' => 0),
        array('name' => 'Edu',    'work_days' => 'mon,tue,wed,thu,fri', 'blocks_min' => 1, 'blocks_max' => 2, 'is_lead' => 0),
        array('name' => 'Sara',   'work_days' => 'tue,wed,thu',         'blocks_min' => 1, 'blocks_max' => 2, 'is_lead' => 0),
    );
    foreach ($seed_workers as $w) {
        $wpdb->insert($workers_table, array(
            'name' => $w['name'], 'email' => '', 'work_days' => $w['work_days'],
            'blocks_min' => $w['blocks_min'], 'blocks_max' => $w['blocks_max'],
            'is_lead' => $w['is_lead'], 'active' => 1,
        ), array('%s', '%s', '%s', '%d', '%d', '%d', '%d'));
    }

    $seed_holdsets = array(
        'Moradas/Amarillas', 'Naranjas BS', 'Volúmenes turquesa/negro', 'Chorreras azules BS', 'Salmón',
        'Grises', 'Cazos amarillos', 'Volúmenes amarillos', 'Negras Eclipse', 'Burbujas rosas',
        'Romos azules plástico', 'Grises resina', 'Moradas BS', 'Romos verdes', 'Azules P',
        'Verdes claras lunas/conchas', 'Amarillas', 'Old orange', 'Blancas', 'Tel rosas',
        'Azules K', 'Blancas hueso', 'Amarillas K', 'Grises minivols', 'Verdes',
        'Moradas', 'Azules', 'Negras nuevas', 'Bolas amarillas', 'Turquesas',
        'Moradas P', 'Negras', 'Rosas', 'CR', 'Amarillas mostaza',
        'Lunas verdes', 'Granito Pedri', 'Azules BS', 'Bolas rosas', 'Verdes plástico',
        'Naranjas', 'Rojas bidedos', 'Listones madera',
    );
    $holdsets_table = progreso_equip_table('holdsets');
    foreach ($seed_holdsets as $name) {
        $wpdb->insert($holdsets_table, array('name' => $name), array('%s'));
    }
}

function progreso_equip_get_workers() {
    global $wpdb;
    progreso_equip_ensure_tables();
    $rows = $wpdb->get_results("SELECT * FROM " . progreso_equip_table('workers') . " ORDER BY is_lead DESC, name ASC", ARRAY_A);
    return rest_ensure_response(array('success' => true, 'data' => array_map(function($r) {
        return array(
            'id' => intval($r['id']), 'name' => $r['name'], 'email' => $r['email'],
            'workDays' => array_values(array_filter(explode(',', $r['work_days']))),
            'blocksMin' => intval($r['blocks_min']), 'blocksMax' => intval($r['blocks_max']),
            'isLead' => (bool) $r['is_lead'], 'active' => (bool) $r['active'], 'eventual' => (bool) $r['eventual'],
        );
    }, $rows)));
}

function progreso_equip_create_worker($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $name = trim((string) $request->get_param('name'));
    if ($name === '') return new WP_Error('invalid_data', 'Falta el nombre.', array('status' => 400));
    $work_days = $request->get_param('workDays');
    $work_days = is_array($work_days) ? implode(',', array_map('sanitize_text_field', $work_days)) : '';
    $wpdb->insert(progreso_equip_table('workers'), array(
        'name'       => sanitize_text_field($name),
        'email'      => sanitize_email((string) $request->get_param('email')),
        'work_days'  => $work_days,
        'blocks_min' => intval($request->get_param('blocksMin')) ?: 1,
        'blocks_max' => intval($request->get_param('blocksMax')) ?: 2,
        'is_lead'    => $request->get_param('isLead') ? 1 : 0,
        'active'     => 1,
        'eventual'   => $request->get_param('eventual') ? 1 : 0,
    ), array('%s', '%s', '%s', '%d', '%d', '%d', '%d', '%d'));
    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id));
}

function progreso_equip_update_worker($request) {
    global $wpdb;
    $id = intval($request['id']);
    $upd = array(); $fmt = array();
    if ($request->get_param('name') !== null)  { $upd['name']  = sanitize_text_field($request->get_param('name'));  $fmt[] = '%s'; }
    if ($request->get_param('email') !== null) { $upd['email'] = sanitize_email($request->get_param('email'));      $fmt[] = '%s'; }
    if ($request->get_param('workDays') !== null) {
        $wd = $request->get_param('workDays');
        $upd['work_days'] = is_array($wd) ? implode(',', array_map('sanitize_text_field', $wd)) : '';
        $fmt[] = '%s';
    }
    if ($request->get_param('blocksMin') !== null) { $upd['blocks_min'] = intval($request->get_param('blocksMin')); $fmt[] = '%d'; }
    if ($request->get_param('blocksMax') !== null) { $upd['blocks_max'] = intval($request->get_param('blocksMax')); $fmt[] = '%d'; }
    if ($request->get_param('isLead') !== null)    { $upd['is_lead']    = $request->get_param('isLead') ? 1 : 0;    $fmt[] = '%d'; }
    if ($request->get_param('active') !== null)    { $upd['active']     = $request->get_param('active') ? 1 : 0;    $fmt[] = '%d'; }
    if ($request->get_param('eventual') !== null)  { $upd['eventual']   = $request->get_param('eventual') ? 1 : 0;  $fmt[] = '%d'; }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(progreso_equip_table('workers'), $upd, array('id' => $id), $fmt, array('%d'));
    return rest_ensure_response(array('success' => true));
}

function progreso_equip_delete_worker($request) {
    global $wpdb;
    $wpdb->delete(progreso_equip_table('workers'), array('id' => intval($request['id'])), array('%d'));
    return rest_ensure_response(array('success' => true));
}

function progreso_equip_get_holdsets() {
    global $wpdb;
    progreso_equip_ensure_tables();
    $rows = $wpdb->get_results("SELECT id, name FROM " . progreso_equip_table('holdsets') . " ORDER BY name ASC", ARRAY_A);
    return rest_ensure_response(array('success' => true, 'data' => array_map(function($r) {
        return array('id' => intval($r['id']), 'name' => $r['name']);
    }, $rows)));
}

function progreso_equip_create_holdset($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $name = trim((string) $request->get_param('name'));
    if ($name === '') return new WP_Error('invalid_data', 'Falta el nombre.', array('status' => 400));
    $existing = $wpdb->get_var($wpdb->prepare("SELECT id FROM " . progreso_equip_table('holdsets') . " WHERE name = %s", $name));
    if ($existing) return new WP_Error('duplicate', 'Ese juego de presas ya existe.', array('status' => 409));
    $wpdb->insert(progreso_equip_table('holdsets'), array('name' => sanitize_text_field($name)), array('%s'));
    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id));
}

function progreso_equip_delete_holdset($request) {
    global $wpdb;
    $wpdb->delete(progreso_equip_table('holdsets'), array('id' => intval($request['id'])), array('%d'));
    return rest_ensure_response(array('success' => true));
}

// Las semanas de prueba (`isTest`) no salen aquí por defecto — son las que usa cowork para
// probar sin molestar al equipo real; con `?test=1` se ven solo esas, para gestionarlas.
function progreso_equip_get_weeks($request = null) {
    global $wpdb;
    progreso_equip_ensure_tables();
    progreso_equip_sweep_overdue_into_current_week();
    $solo_prueba = $request ? (bool) $request->get_param('test') : false;
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . progreso_equip_table('weeks') . " WHERE archived = 0 AND is_test = %d ORDER BY start_date DESC LIMIT 20",
        $solo_prueba ? 1 : 0
    ), ARRAY_A);
    $tasks_table = progreso_equip_table('tasks');
    $assignments_table = progreso_equip_table('assignments');
    // Calendario de semanas (Ramiro 12/11 09:31): cada tarjeta de la tira necesita hechas/total
    // y si hay festivo o compe esa semana, sin tener que pedir el detalle entero.
    return rest_ensure_response(array('success' => true, 'data' => array_map(function($r) use ($wpdb, $tasks_table, $assignments_table) {
        $week_id = intval($r['id']);
        $hechas = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$tasks_table} t JOIN {$assignments_table} a ON a.id = t.assignment_id
             WHERE a.week_id = %d AND t.done = 1", $week_id
        ));
        $total = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$tasks_table} t JOIN {$assignments_table} a ON a.id = t.assignment_id
             WHERE a.week_id = %d", $week_id
        ));
        $fin = date('Y-m-d', strtotime($r['start_date']) + 6 * 86400);
        $tiene_festivo = !empty(blokes_club_days_cerrados($r['start_date'], $fin));
        return array(
            'id' => $week_id, 'startDate' => $r['start_date'],
            'subzones' => array_values(array_filter(array_map('intval', explode(',', $r['subzones'])))),
            'notes' => $r['notes'], 'isTest' => (bool) $r['is_test'], 'isAuto' => (bool) $r['auto'],
            'zonaId' => $r['zona_id'] !== null ? intval($r['zona_id']) : null,
            'zonaSugeridaId' => $r['zona_sugerida_id'] !== null ? intval($r['zona_sugerida_id']) : null,
            'tasksHechas' => $hechas, 'tasksTotal' => $total,
            'tieneFestivo' => $tiene_festivo, 'tieneCompe' => progreso_equip_semana_es_de_compe($r['start_date']),
        );
    }, $rows)));
}

// Histórico: semanas pasadas (incluidas las archivadas), con cuántas tareas
// quedaron hechas/retrasadas/pendientes y, de las retrasadas, por quién.
function progreso_equip_get_weeks_historico() {
    global $wpdb;
    progreso_equip_ensure_tables();
    $weeks = $wpdb->get_results("SELECT * FROM " . progreso_equip_table('weeks') . " ORDER BY start_date DESC LIMIT 30", ARRAY_A);
    $out = array();
    foreach ($weeks as $w) {
        $week_id = intval($w['id']);
        // El retraso se cuenta sobre quien originalmente tenía la tarea
        // (original_worker_id), no sobre el responsable que la hereda al
        // repartirla — si no, todos los retrasos parecen ser del responsable.
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT t.status, t.done, wk2.name as worker_name, orig.name as original_worker_name FROM " . progreso_equip_table('tasks') . " t
             JOIN " . progreso_equip_table('assignments') . " a ON a.id = t.assignment_id
             JOIN " . progreso_equip_table('workers') . " wk2 ON wk2.id = a.worker_id
             LEFT JOIN " . progreso_equip_table('workers') . " orig ON orig.id = t.original_worker_id
             WHERE a.week_id = %d", $week_id
        ), ARRAY_A);
        $hechas = 0; $retrasadas = 0; $pendientes = 0; $por_persona = array();
        foreach ($rows as $r) {
            if ($r['done']) { $hechas++; continue; }
            if ($r['status'] === 'retrasada') {
                $retrasadas++;
                $name = $r['original_worker_name'] ?: $r['worker_name'];
                $por_persona[$name] = ($por_persona[$name] ?? 0) + 1;
            } else {
                $pendientes++;
            }
        }
        $out[] = array(
            'id' => $week_id, 'startDate' => $w['start_date'], 'archived' => (bool) $w['archived'],
            'hechas' => $hechas, 'retrasadas' => $retrasadas, 'pendientes' => $pendientes,
            'retrasosPorPersona' => $por_persona,
        );
    }
    return rest_ensure_response(array('success' => true, 'data' => $out));
}

// Junta una o varias tareas que llegan retrasadas de semanas anteriores con
// la tarjeta de su mismo tipo que ya hubiera pendiente en la semana de
// destino (si la hay), en vez de crear una tarjeta duplicada del mismo tipo
// esa semana. Las viejas quedan "retrasada" apuntando (moved_to_task_id) a
// la tarjeta final, sea nueva o la que ya estaba. Devuelve el id de esa
// tarjeta final.
function progreso_equip_merge_rolled_task($week_id, $assignment_id, $type_id, $target_date, $params, $max_postponed, $earliest_original, $original_worker_id) {
    global $wpdb;
    $tasks_table = progreso_equip_table('tasks');
    $assignments_table = progreso_equip_table('assignments');

    $existing = $wpdb->get_row($wpdb->prepare(
        "SELECT t.* FROM {$tasks_table} t
         JOIN {$assignments_table} a ON a.id = t.assignment_id
         WHERE a.week_id = %d AND t.task_type_id = %s AND t.done = 0 AND t.moved_to_task_id IS NULL
         ORDER BY t.id ASC LIMIT 1",
        $week_id, $type_id
    ), ARRAY_A);

    if ($existing) {
        $existing_original = $existing['original_date'] ?: $existing['task_date'];
        $new_original = ($earliest_original !== null && $earliest_original < $existing_original) ? $earliest_original : $existing_original;
        $new_original_worker = $existing['original_worker_id'] ? intval($existing['original_worker_id']) : $original_worker_id;
        $wpdb->update($tasks_table, array(
            'postponed_count'    => max(intval($existing['postponed_count']), $max_postponed + 1),
            'original_date'      => $new_original,
            'original_worker_id' => $new_original_worker,
        ), array('id' => intval($existing['id'])), array('%d', '%s', '%d'), array('%d'));
        return intval($existing['id']);
    }

    $wpdb->insert($tasks_table, array(
        'assignment_id'       => $assignment_id,
        'task_type_id'        => $type_id,
        'task_date'           => $target_date,
        'params'              => $params,
        'done'                => 0,
        'status'              => 'pendiente',
        'original_date'       => $earliest_original,
        'postponed_count'     => $max_postponed + 1,
        'original_worker_id'  => $original_worker_id,
    ), array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%d'));
    return $wpdb->insert_id;
}

// Lo que se queda suelto y vencido en una semana vieja solo se recogía al
// crear la siguiente semana. Si esa siguiente semana ya existe y nadie crea
// otra, puede tardar mucho en recogerse. Esto se llama al abrir/listar
// semanas (y al mirar Hoy) para ir recogiendo, en la semana "actual" (la más
// reciente con start_date <= hoy), lo que ya venció en semanas anteriores y
// sigue sin moverse a mano. Misma lógica de agrupar por tipo que el arrastre
// al crear semana, para no duplicar tarjetas.
function progreso_equip_sweep_overdue_into_current_week() {
    global $wpdb;
    $today = current_time('Y-m-d');
    $weeks_table = progreso_equip_table('weeks');
    $assignments_table = progreso_equip_table('assignments');
    $tasks_table = progreso_equip_table('tasks');

    $week = $wpdb->get_row($wpdb->prepare(
        "SELECT id, start_date FROM {$weeks_table} WHERE start_date <= %s AND archived = 0 ORDER BY start_date DESC LIMIT 1",
        $today
    ), ARRAY_A);
    if (!$week) return;
    $week_id = intval($week['id']);

    $pending = $wpdb->get_results($wpdb->prepare(
        "SELECT t.*, a.worker_id FROM {$tasks_table} t
         JOIN {$assignments_table} a ON a.id = t.assignment_id
         JOIN {$weeks_table} wk ON wk.id = a.week_id
         WHERE t.task_date < %s AND t.done = 0 AND t.moved_to_task_id IS NULL
           AND wk.start_date < %s AND wk.id != %d",
        $today, $week['start_date'], $week_id
    ), ARRAY_A);
    if (!$pending) return;

    $assignments = $wpdb->get_results($wpdb->prepare(
        "SELECT a.*, w.is_lead, w.work_days AS worker_work_days FROM {$assignments_table} a
         JOIN " . progreso_equip_table('workers') . " w ON w.id = a.worker_id
         WHERE a.week_id = %d", $week_id
    ), ARRAY_A);
    if (!$assignments) return;
    $target = null;
    foreach ($assignments as $a) { if ($a['is_lead']) { $target = $a; break; } }
    if (!$target) $target = $assignments[0];

    $day_offset = array('mon' => 0, 'tue' => 1, 'wed' => 2, 'thu' => 3, 'fri' => 4, 'sat' => 5, 'sun' => 6);
    $cerrados = blokes_club_days_cerrados($week['start_date'], date('Y-m-d', strtotime($week['start_date']) + 6 * 86400));
    $work_days = array_filter(explode(',', $target['work_days'] !== '' ? $target['work_days'] : $target['worker_work_days']));
    $dates = array();
    foreach ($work_days as $wd) {
        if (!isset($day_offset[$wd])) continue;
        $d = date('Y-m-d', strtotime($week['start_date']) + $day_offset[$wd] * 86400);
        if ($d >= $today && !isset($cerrados[$d])) $dates[] = $d;
    }
    sort($dates);
    if (empty($dates)) $dates[] = $today;
    $n = count($dates);

    $pending_by_type = array();
    foreach ($pending as $old) { $pending_by_type[$old['task_type_id']][] = $old; }

    $i = 0;
    foreach ($pending_by_type as $type_id => $olds) {
        $max_postponed = 0; $earliest_original = null; $original_worker_id = null;
        foreach ($olds as $old) {
            $max_postponed = max($max_postponed, intval($old['postponed_count']));
            $od = $old['original_date'] ?: $old['task_date'];
            if ($earliest_original === null || $od < $earliest_original) $earliest_original = $od;
            if ($original_worker_id === null) {
                $original_worker_id = $old['original_worker_id'] ? intval($old['original_worker_id']) : intval($old['worker_id']);
            }
        }
        $target_date = $dates[$i % $n];
        $i++;
        $new_task_id = progreso_equip_merge_rolled_task(
            $week_id, intval($target['id']), $type_id, $target_date, $olds[0]['params'],
            $max_postponed, $earliest_original, $original_worker_id
        );
        foreach ($olds as $old) {
            $wpdb->update($tasks_table,
                array('status' => 'retrasada', 'moved_to_task_id' => $new_task_id),
                array('id' => intval($old['id'])), array('%s', '%d'), array('%d')
            );
        }
    }
}

// ============================================================
//  Calendario de semanas + rotación de zonas (Ramiro 12/11 09:31/09:35/09:37).
// ============================================================

function progreso_equip_zonas_activas() {
    global $wpdb;
    return $wpdb->get_results(
        "SELECT * FROM " . progreso_equip_table('zonas') . " WHERE activa = 1 ORDER BY orden ASC", ARRAY_A
    );
}

function progreso_equip_zona_fila($z) {
    return array(
        'id' => intval($z['id']), 'nombre' => $z['nombre'], 'color' => $z['color'],
        'subzonas' => array_values(array_filter(array_map('intval', explode(',', $z['subzonas'])))),
        'orden' => intval($z['orden']), 'activa' => (bool) $z['activa'],
    );
}

// ¿Esta semana (start_date, +6 días) se salta la rotación de zonas? — se solapa con la
// precompe (lead_weeks antes de comp_date) o la compe de una competición real (nunca una de
// prueba, esas no deben afectar al reparto de verdad).
function progreso_equip_semana_es_de_compe($start_date) {
    global $wpdb;
    $fin = date('Y-m-d', strtotime($start_date) + 6 * 86400);
    $comps = $wpdb->get_results(
        "SELECT comp_date, comp_end_date, lead_weeks FROM " . progreso_equip_table('competitions') . " WHERE is_test = 0",
        ARRAY_A
    );
    foreach ($comps as $c) {
        $precompe_inicio = date('Y-m-d', strtotime($c['comp_date']) - intval($c['lead_weeks']) * 7 * 86400);
        $compe_fin = $c['comp_end_date'] ?: $c['comp_date'];
        if ($start_date <= $compe_fin && $fin >= $precompe_inicio) return true;
    }
    return false;
}

function progreso_equip_zona_arranque() {
    $v = get_option('blokes_equip_zona_arranque');
    return (is_array($v) && !empty($v['zonaId']) && !empty($v['weekStart'])) ? $v : null;
}

// Qué zona le toca de verdad a una semana. Ancla: la semana existente más reciente, anterior a
// esta, que ya tenga zona_id puesto — así una corrección manual ("esta semana repetimos...",
// "saltamos a...") recoloca solas las semanas siguientes sin tener que tocarlas una a una. Sin
// ninguna semana previa, usa el arranque guardado desde "⚙️ Configurar zonas"; sin arranque
// tampoco, la primera zona activa siempre.
function progreso_equip_calcular_zona_semana($start_date) {
    global $wpdb;
    $zonas = progreso_equip_zonas_activas();
    if (!$zonas) return null;

    $ancla = $wpdb->get_row($wpdb->prepare(
        "SELECT start_date, zona_id FROM " . progreso_equip_table('weeks') . "
         WHERE start_date < %s AND zona_id IS NOT NULL ORDER BY start_date DESC LIMIT 1", $start_date
    ), ARRAY_A);

    if ($ancla) {
        $ancla_fecha = $ancla['start_date'];
        $ancla_zona_id = intval($ancla['zona_id']);
    } else {
        $arranque = progreso_equip_zona_arranque();
        if (!$arranque) return intval($zonas[0]['id']);
        $ancla_fecha = $arranque['weekStart'];
        $ancla_zona_id = intval($arranque['zonaId']);
    }

    $idx_ancla = 0;
    foreach ($zonas as $i => $z) { if (intval($z['id']) === $ancla_zona_id) { $idx_ancla = $i; break; } }
    if (strtotime($start_date) <= strtotime($ancla_fecha)) return intval($zonas[$idx_ancla]['id']);

    $cursor = $ancla_fecha; $n = 0;
    while (strtotime($cursor) < strtotime($start_date)) {
        if (!progreso_equip_semana_es_de_compe($cursor)) $n++;
        $cursor = date('Y-m-d', strtotime($cursor) + 7 * 86400);
    }
    $idx = ($idx_ancla + $n) % count($zonas);
    return intval($zonas[$idx]['id']);
}

// GET /equipacion/zonas/sugerida?weekStart=YYYY-MM-DD — para enseñar "zona sugerida: Cueva
// (#8)" en el formulario de crear semana, antes de guardar nada.
function progreso_equip_get_zona_sugerida($request) {
    progreso_equip_ensure_tables();
    global $wpdb;
    $week_start = sanitize_text_field((string) $request->get_param('weekStart'));
    if (!$week_start || !strtotime($week_start)) {
        return new WP_Error('invalid_data', 'Falta la semana.', array('status' => 400));
    }
    $week_start = date('Y-m-d', strtotime($week_start));
    $zona_id = progreso_equip_calcular_zona_semana($week_start);
    $zona = $zona_id ? $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . progreso_equip_table('zonas') . " WHERE id = %d", $zona_id
    ), ARRAY_A) : null;
    return rest_ensure_response(array('success' => true, 'data' => array(
        'zona' => $zona ? progreso_equip_zona_fila($zona) : null,
        'esSemanaDeCompe' => progreso_equip_semana_es_de_compe($week_start),
    )));
}

function progreso_equip_get_zonas($request) {
    progreso_equip_ensure_tables();
    global $wpdb;
    $zonas = $wpdb->get_results("SELECT * FROM " . progreso_equip_table('zonas') . " ORDER BY orden ASC", ARRAY_A);
    return rest_ensure_response(array('success' => true, 'data' => array(
        'zonas' => array_map('progreso_equip_zona_fila', $zonas),
        'arranque' => progreso_equip_zona_arranque(),
    )));
}

// PUT /equipacion/zonas — sustituye la lista entera (reordenar, renombrar, cambiar subzonas o
// color, activar/desactivar, añadir una nueva con id 0). Pensado para el diálogo "⚙️ Configurar
// zonas", que manda siempre la lista completa ya en el orden que ha quedado.
function progreso_equip_update_zonas($request) {
    global $wpdb;
    $zonas_in = $request->get_param('zonas');
    if (!is_array($zonas_in)) return new WP_Error('invalid_data', 'Faltan las zonas.', array('status' => 400));
    $table = progreso_equip_table('zonas');
    $vistos = array();
    foreach ($zonas_in as $i => $z) {
        $nombre = sanitize_text_field((string) ($z['nombre'] ?? ''));
        if ($nombre === '') continue;
        $color = sanitize_text_field((string) ($z['color'] ?? '#60a5fa'));
        $subzonas = is_array($z['subzonas'] ?? null) ? implode(',', array_map('intval', $z['subzonas'])) : '';
        $activa = empty($z['activa']) ? 0 : 1;
        $id = intval($z['id'] ?? 0);
        if ($id > 0) {
            $wpdb->update($table, array(
                'nombre' => $nombre, 'color' => $color, 'subzonas' => $subzonas, 'orden' => $i, 'activa' => $activa,
            ), array('id' => $id), array('%s', '%s', '%s', '%d', '%d'), array('%d'));
            $vistos[] = $id;
        } else {
            $wpdb->insert($table, array(
                'nombre' => $nombre, 'color' => $color, 'subzonas' => $subzonas, 'orden' => $i, 'activa' => $activa,
            ), array('%s', '%s', '%s', '%d', '%d'));
            $vistos[] = $wpdb->insert_id;
        }
    }
    return rest_ensure_response(array('success' => true));
}

// POST /equipacion/zonas/arranque — fija por qué zona empieza la rotación y en qué semana
// (Ramiro: "cuando se da aceptar empieza por la primera subzona que se quiere hacer esa
// semana"). Solo hace falta una vez; en cuanto haya alguna semana con zona_id puesto, esa pasa
// a ser el ancla real (ver progreso_equip_calcular_zona_semana) y esto queda como respaldo.
function progreso_equip_set_zona_arranque($request) {
    $zona_id = intval($request->get_param('zonaId'));
    $week_start = sanitize_text_field((string) $request->get_param('weekStart'));
    if (!$zona_id || !$week_start || !strtotime($week_start)) {
        return new WP_Error('invalid_data', 'Falta la zona o la semana de arranque.', array('status' => 400));
    }
    update_option('blokes_equip_zona_arranque', array(
        'zonaId' => $zona_id, 'weekStart' => date('Y-m-d', strtotime($week_start)),
    ), false);
    return rest_ensure_response(array('success' => true));
}

// Crea la semana y, para cada trabajador asignado, reparte el catálogo de
// tareas entre sus días de trabajo reales esa semana — así nadie se queda
// un día sin plan, que es justo el hueco que tenía el sistema de Notion.
// El sistema PROPONE qué toca: filtra por periodicidad de cada tarea (si
// ya se hizo hace menos de N semanas, no vuelve a tocar), y para cada
// tarea que sí toca elige, entre la gente de esa semana, a quien más veces
// la haya hecho antes (el propio histórico de "tasks" ya sirve de
// aprendizaje — no hace falta una tabla aparte). Sin historial, reparte
// por turno. Todo lo propuesto queda fijado pero se puede mover después
// (progreso_equip_update_task admite cambiar de persona o de día).
function progreso_equip_create_week($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $start_date = sanitize_text_field((string) $request->get_param('startDate'));
    if (!$start_date || !strtotime($start_date)) {
        return new WP_Error('invalid_data', 'Falta la fecha de inicio (lunes de la semana).', array('status' => 400));
    }
    $start_date = date('Y-m-d', strtotime($start_date));
    $existing = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM " . progreso_equip_table('weeks') . " WHERE start_date = %s", $start_date
    ));
    if ($existing) {
        return new WP_Error('duplicate_week', "Ya hay una semana del {$start_date}: ábrela.", array('status' => 409, 'weekId' => intval($existing)));
    }
    $subzones = $request->get_param('subzones');
    $subzones = is_array($subzones) ? array_map('intval', $subzones) : array();
    $notes = sanitize_textarea_field((string) $request->get_param('notes'));
    $assignments_in = $request->get_param('assignments');
    if (!is_array($assignments_in) || empty($assignments_in)) {
        return new WP_Error('invalid_data', 'Falta al menos una asignación de trabajador.', array('status' => 400));
    }
    $is_test = $request->get_param('isTest') ? 1 : 0;
    $is_auto = $request->get_param('isAuto') ? 1 : 0;

    // Calendario de semanas + rotación de zonas (Ramiro 12/11 09:31): la zona que toca se
    // calcula sola; si no mandan subzonas a propósito, se rellenan solas con las de esa zona
    // ("se acaba lo de «— subzonas» vacío en la cabecera"). Las semanas de prueba no cuentan
    // para la rotación — nunca mueven el ancla real.
    $zona_sugerida_id = $is_test ? null : progreso_equip_calcular_zona_semana($start_date);
    if (empty($subzones) && $zona_sugerida_id) {
        $zona = $wpdb->get_row($wpdb->prepare(
            "SELECT subzonas FROM " . progreso_equip_table('zonas') . " WHERE id = %d", $zona_sugerida_id
        ), ARRAY_A);
        if ($zona) $subzones = array_values(array_filter(array_map('intval', explode(',', $zona['subzonas']))));
    }

    $wpdb->insert(progreso_equip_table('weeks'), array(
        'start_date' => $start_date, 'subzones' => implode(',', $subzones),
        'notes' => $notes, 'is_test' => $is_test, 'auto' => $is_auto,
        'zona_id' => $zona_sugerida_id, 'zona_sugerida_id' => $zona_sugerida_id,
        'created_at' => current_time('mysql'),
    ), array('%s', '%s', '%s', '%d', '%d', '%d', '%d', '%s'));
    $week_id = $wpdb->insert_id;

    $day_offset         = array('mon' => 0, 'tue' => 1, 'wed' => 2, 'thu' => 3, 'fri' => 4, 'sat' => 5, 'sun' => 6);
    $task_types         = progreso_equip_task_types(); // ya viene en orden natural (sort_order)
    $assignments_table  = progreso_equip_table('assignments');
    $tasks_table        = progreso_equip_table('tasks');
    // Festivos/cierres decididos del calendario del club: esos días no se reparten tareas,
    // igual que ya pasa con el fin de semana (cowork, nota de calendario — "días de trabajo
    // editables... leyendo club_days: un festivo cierra no tiene tareas").
    $cerrados = blokes_club_days_cerrados($start_date, date('Y-m-d', strtotime($start_date) + 6 * 86400));

    // 1. Una fila de asignación por trabajador + sus días reales de trabajo.
    $crew = array();
    $created_assignments = array();
    foreach ($assignments_in as $a) {
        $worker_id = intval($a['workerId'] ?? 0);
        if ($worker_id <= 0) continue;
        $worker = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . progreso_equip_table('workers') . " WHERE id = %d", $worker_id
        ), ARRAY_A);
        if (!$worker) continue;

        $a_subzones = is_array($a['subzones'] ?? null) ? array_map('intval', $a['subzones']) : $subzones;
        $blocks_min = intval($a['blocksMin'] ?? $worker['blocks_min']);
        $blocks_max = intval($a['blocksMax'] ?? $worker['blocks_max']);
        // Días de trabajo de ESTA semana: si se manda `workDays` en la asignación (vacaciones o
        // un cambio puntual esa semana) se guarda y se usa en vez del fijo del trabajador.
        $a_work_days_in = $a['workDays'] ?? null;
        $work_days_override = is_array($a_work_days_in) ? implode(',', array_map('sanitize_text_field', $a_work_days_in)) : '';

        $wpdb->insert($assignments_table, array(
            'week_id' => $week_id, 'worker_id' => $worker_id, 'subzones' => implode(',', $a_subzones),
            'blocks_min' => $blocks_min, 'blocks_max' => $blocks_max, 'work_days' => $work_days_override, 'status' => 'pendiente',
        ), array('%d', '%d', '%s', '%d', '%d', '%s', '%s'));
        $assignment_id = $wpdb->insert_id;
        $created_assignments[] = $assignment_id;

        $work_days = array_filter(explode(',', $work_days_override !== '' ? $work_days_override : $worker['work_days']));
        $dates = array();
        foreach ($work_days as $wd) {
            if (!isset($day_offset[$wd])) continue;
            $d = date('Y-m-d', strtotime($start_date) + $day_offset[$wd] * 86400);
            if (isset($cerrados[$d])) continue; // festivo/cierre decidido: sin tareas ese día
            $dates[] = $d;
        }
        sort($dates);

        $crew[$worker_id] = array(
            'worker' => $worker, 'assignment_id' => $assignment_id, 'dates' => $dates,
            'subzones' => $a_subzones, 'blocks_min' => $blocks_min, 'blocks_max' => $blocks_max, 'queue' => array(),
        );
    }
    if (empty($crew)) return rest_ensure_response(array('success' => true, 'week_id' => $week_id, 'assignment_ids' => array()));

    $eligible_worker_ids = array_keys($crew);
    $lead_worker_id = null;
    foreach ($eligible_worker_ids as $wid) {
        if ($crew[$wid]['worker']['is_lead']) { $lead_worker_id = $wid; break; }
    }
    $rollover_target = $lead_worker_id && isset($crew[$lead_worker_id])
        ? $crew[$lead_worker_id]
        : (!empty($crew) ? reset($crew) : null);

    // 2. Nada se pierde: cualquier tarea sin hacer de una semana anterior que
    //    todavía no se movió a mano (postpone) pasa sola a esta semana nueva,
    //    asignada al responsable, y queda marcada "retrasada" en su semana de
    //    origen. Una sola tarjeta por tipo de tarea (si hay varias sueltas del
    //    mismo tipo esperando, se juntan en una, con el recuento de retrasos
    //    más alto) para no acumular duplicados semana tras semana.
    $rolled_type_ids = array();
    if ($rollover_target) {
        // Solo se arrastran tareas cuyo día ya ha pasado (no las de la
        // semana en curso que todavía no han llegado a su fecha): una
        // semana nueva puede crearse mientras la anterior aún no termina.
        $today = current_time('Y-m-d');
        // Nunca mezclar prueba con real (cowork, 4/11 07:20): una tarea atrasada de una semana de
        // PRUEBA no debe colarse en la primera semana REAL que se cree después, ni al revés.
        $pending = $wpdb->get_results($wpdb->prepare(
            "SELECT t.*, a.worker_id FROM {$tasks_table} t
             JOIN {$assignments_table} a ON a.id = t.assignment_id
             JOIN " . progreso_equip_table('weeks') . " wk ON wk.id = a.week_id
             WHERE t.task_date < %s AND t.done = 0 AND t.moved_to_task_id IS NULL
               AND wk.start_date < %s AND wk.id != %d AND wk.is_test = %d",
            $today, $start_date, $week_id, $is_test
        ), ARRAY_A);
        $pending_by_type = array();
        foreach ($pending as $old) { $pending_by_type[$old['task_type_id']][] = $old; }

        $dates = $rollover_target['dates'];
        $n = count($dates);
        $i = 0;
        foreach ($pending_by_type as $type_id => $olds) {
            $rolled_type_ids[$type_id] = true;
            $max_postponed = 0;
            $earliest_original = null;
            $original_worker_id = null;
            foreach ($olds as $old) {
                $max_postponed = max($max_postponed, intval($old['postponed_count']));
                $od = $old['original_date'] ?: $old['task_date'];
                if ($earliest_original === null || $od < $earliest_original) $earliest_original = $od;
                if ($original_worker_id === null) {
                    $original_worker_id = $old['original_worker_id'] ? intval($old['original_worker_id']) : intval($old['worker_id']);
                }
            }
            $target_date = $n > 0 ? $dates[$i % $n] : $start_date;
            $i++;
            $new_task_id = progreso_equip_merge_rolled_task(
                $week_id, $rollover_target['assignment_id'], $type_id, $target_date, $olds[0]['params'],
                $max_postponed, $earliest_original, $original_worker_id
            );
            foreach ($olds as $old) {
                $wpdb->update($tasks_table,
                    array('status' => 'retrasada', 'moved_to_task_id' => $new_task_id),
                    array('id' => intval($old['id'])), array('%s', '%d'), array('%d')
                );
            }
        }
    }

    // 3. ¿Qué tareas tocan esta semana, según su periodicidad? Solo cuenta
    //    como "hecha hace N semanas" si realmente se marcó hecha — si no,
    //    toca ya (no hace falta esperar a que pasen las N semanas de una
    //    tarea que nunca se llegó a hacer). Si ya viene una retrasada de ese
    //    tipo (paso 2), no se genera otra — la retrasada ya cubre esta semana.
    $rolled_count = count($rolled_type_ids);

    $due_types = array();
    foreach ($task_types as $type) {
        if (empty($type['recurring'])) continue; // tarea de proyecto puntual (compe): nunca se propone sola
        if (isset($rolled_type_ids[$type['id']])) continue;
        $weeks_n = max(1, intval($type['periodicityWeeks']));
        if ($weeks_n <= 1) { $due_types[] = $type; continue; }
        $last = $wpdb->get_var($wpdb->prepare(
            "SELECT MAX(task_date) FROM {$tasks_table} WHERE task_type_id = %s AND done = 1", $type['id']
        ));
        $gap = $weeks_n * 7 * 86400 - 86400; // un día de margen por redondeo
        if (!$last || (strtotime($start_date) - strtotime($last)) >= $gap) $due_types[] = $type;
    }

    // 4. ¿Quién recibe cada tarea que toca?
    //    - "lead_only": siempre al responsable (se marca a mano para lo que de verdad solo
    //      puede decidir él, p. ej. "Organizar próximas semanas"). Si no está esta semana, al
    //      primero de la lista (con aviso).
    //    - El resto (ya no depende de la periodicidad — Ramiro, 5/11 21:08: "ya no todo al
    //      responsable"): si el tipo tiene gente preferida (pauta editable desde Normas,
    //      sacada del histórico real de quién suele hacer cada tarea), se reparte entre los
    //      preferidos que están esta semana — el que menos tareas lleve hasta ahora, para no
    //      cargarlo todo en el primero de la lista. Sin pauta puesta: a quien más veces la haya
    //      hecho en el histórico de la propia app; sin historial, turno rotatorio — igual que
    //      antes.
    $warnings = array();
    if ($rolled_count > 0 && $rollover_target) {
        $warnings[] = "{$rolled_count} tarea(s) retrasada(s) asignada(s) a {$rollover_target['worker']['name']} para repartir.";
    }
    $rr_cursor = 0;
    foreach ($due_types as $type) {
        if ($type['lead_only']) {
            $chosen = $lead_worker_id ?: ($eligible_worker_ids[0] ?? null);
            if ($chosen === null) continue;
            if (!$lead_worker_id) {
                $warnings[] = "«{$type['name']}» se asignó a {$crew[$chosen]['worker']['name']} porque el responsable no está esta semana.";
            }
            $crew[$chosen]['queue'][] = $type;
            continue;
        }

        $candidates = $eligible_worker_ids;
        if (empty($candidates)) continue;

        $preferidos_aqui = array_values(array_intersect($type['preferredWorkers'], $candidates));
        if (!empty($preferidos_aqui)) {
            usort($preferidos_aqui, function($a, $b) use ($crew) {
                return count($crew[$a]['queue']) <=> count($crew[$b]['queue']);
            });
            $chosen = $preferidos_aqui[0];
            $crew[$chosen]['queue'][] = $type;
            continue;
        }

        $ph = implode(',', array_fill(0, count($candidates), '%d'));
        $history = $wpdb->get_results($wpdb->prepare(
            "SELECT a.worker_id, COUNT(*) as n FROM {$tasks_table} t
             JOIN {$assignments_table} a ON a.id = t.assignment_id
             WHERE t.task_type_id = %s AND a.worker_id IN ($ph)
             GROUP BY a.worker_id ORDER BY n DESC",
            array_merge(array($type['id']), $candidates)
        ), ARRAY_A);

        $chosen = !empty($history) ? intval($history[0]['worker_id']) : $candidates[$rr_cursor % count($candidates)];
        if (empty($history)) $rr_cursor++;
        $crew[$chosen]['queue'][] = $type;
    }

    // 5. Reparte la cola de cada persona entre sus propios días de trabajo
    //    (ya en orden natural, al venir de $due_types en ese orden).
    foreach ($crew as $info) {
        $dates = $info['dates'];
        $queue = $info['queue'];
        if (empty($dates) || empty($queue)) continue;
        $n = count($dates);
        foreach ($queue as $i => $type) {
            $date = $dates[$i % $n];
            $default_params = array();
            if (in_array('subzona', $type['params'], true))  $default_params['subzona']  = $info['subzones'][0] ?? null;
            if (in_array('objetivo', $type['params'], true)) $default_params['objetivo'] = "{$info['blocks_min']}-{$info['blocks_max']}";
            $wpdb->insert($tasks_table, array(
                'assignment_id'      => $info['assignment_id'],
                'task_type_id'       => $type['id'],
                'task_date'          => $date,
                'params'             => wp_json_encode($default_params),
                'done'               => 0,
                'status'             => 'pendiente',
                'original_date'      => $date,
                'original_worker_id' => $info['worker']['id'],
            ), array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%d'));
        }
    }

    return rest_ensure_response(array('success' => true, 'week_id' => $week_id, 'assignment_ids' => $created_assignments, 'warnings' => $warnings));
}

// Cuenta, por asignación (persona), cuántos blokes REALES (blog 1, Crear bloke) se crearon
// durante esa semana con ese equipador — comparado por nombre normalizado (minúsculas, sin
// acentos, primera palabra), porque `bloke_equipador` guarda un slug tipo "alvaro" y el nombre
// del trabajador es "Álvaro". Mismo límite que ya tiene Crear bloke: si hay dos personas que
// normalizan igual (p. ej. "Álvaro" y "Álvaro V."), Crear bloke tampoco las distingue — no es
// algo que esta cuenta pueda arreglar por su cuenta.
function progreso_equip_contar_blokes_reales_semana($week_start, $nombres_por_assignment) {
    if (!$nombres_por_assignment) return array();
    $fin = date('Y-m-d', strtotime($week_start) + 6 * 86400);
    global $wpdb;
    switch_to_blog(1);
    // 🐞 Cowork 11/11 10:15: seguía a 0 para todos (no solo Álvaro) tras la normalización de
    // tildes — señal de que el problema real era otro: `bloke_equipador` se lee aquí con SQL
    // directo contra `meta_key = 'bloke_equipador'`, pero el campo ACF puede guardarse con otra
    // clave real si vive dentro de un grupo. Se cambia a `get_field()` (la propia API de ACF,
    // la misma que usa BlokeForm.jsx para escribirlo vía update_field()) para no depender de
    // adivinar la clave de wp_postmeta.
    $post_ids = $wpdb->get_col($wpdb->prepare(
        "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'blokes' AND post_status IN ('publish', 'draft')
         AND DATE(post_date) BETWEEN %s AND %s", $week_start, $fin
    ));
    $rows = array();
    foreach ($post_ids as $post_id) {
        $equipador = get_field('bloke_equipador', intval($post_id));
        if ($equipador) $rows[] = array('equipador' => $equipador, 'n' => 1);
    }
    restore_current_blog();

    // 🎯 Cowork 11/11 11:05 (gracias al diagnóstico): el orden estaba al revés. strtolower() no
    // toca "Á" (no es multibyte) y se quedaba igual; remove_accents() después la convertía en
    // "A" MAYÚSCULA (conserva mayúsculas); y el preg_replace solo dejaba a-z minúsculas, así que
    // esa "A" se borraba — "Álvaro" → "lvaro", que nunca coincidía con "alvaro". Las tildes van
    // primero, las minúsculas después.
    $normaliza = function($s) {
        $s = strtolower(remove_accents(trim((string) $s)));
        $s = preg_replace('/[^a-z0-9\s]/', '', $s);
        $partes = preg_split('/\s+/', trim($s));
        return $partes[0] ?? '';
    };
    $por_nombre = array();
    foreach ($rows as $r) {
        $clave = $normaliza($r['equipador']);
        $por_nombre[$clave] = ($por_nombre[$clave] ?? 0) + intval($r['n']);
    }
    $out = array();
    foreach ($nombres_por_assignment as $assignment_id => $nombre) {
        $out[$assignment_id] = $por_nombre[$normaliza($nombre)] ?? 0;
    }
    return $out;
}

function progreso_equip_get_week_detail($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    progreso_equip_sweep_overdue_into_current_week();
    $week_id = intval($request['id']);
    $week = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('weeks') . " WHERE id = %d", $week_id), ARRAY_A);
    if (!$week) return new WP_Error('not_found', 'Semana no encontrada.', array('status' => 404));

    $assignments = $wpdb->get_results($wpdb->prepare(
        "SELECT a.*, w.name as worker_name, w.is_lead FROM " . progreso_equip_table('assignments') . " a
         JOIN " . progreso_equip_table('workers') . " w ON w.id = a.worker_id
         WHERE a.week_id = %d ORDER BY w.is_lead DESC, w.name ASC", $week_id
    ), ARRAY_A);

    $assignment_ids = array_map(function($a) { return intval($a['id']); }, $assignments);
    $tasks_by_assignment  = array();
    $blocks_by_assignment = array();
    if ($assignment_ids) {
        $ph = implode(',', array_fill(0, count($assignment_ids), '%d'));
        $tasks = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM " . progreso_equip_table('tasks') . " WHERE assignment_id IN ($ph) ORDER BY task_date ASC, id ASC",
            ...$assignment_ids
        ), ARRAY_A);
        $moved_to_ids = array_values(array_filter(array_map(function($t) { return intval($t['moved_to_task_id']); }, $tasks)));
        $moved_to_dates = array();
        if ($moved_to_ids) {
            $ph2 = implode(',', array_fill(0, count($moved_to_ids), '%d'));
            $moved_to_dates = $wpdb->get_results($wpdb->prepare(
                "SELECT id, task_date FROM " . progreso_equip_table('tasks') . " WHERE id IN ($ph2)", ...$moved_to_ids
            ), OBJECT_K);
        }
        foreach ($tasks as $t) {
            $moved_to_task_id = $t['moved_to_task_id'] !== null ? intval($t['moved_to_task_id']) : null;
            $tasks_by_assignment[intval($t['assignment_id'])][] = array(
                'id' => intval($t['id']), 'taskTypeId' => $t['task_type_id'], 'date' => $t['task_date'],
                'params' => json_decode($t['params'], true) ?: new stdClass(),
                'done' => (bool) $t['done'], 'doneAt' => $t['done_at'],
                'status' => $t['status'] ?: 'pendiente',
                'originalDate' => $t['original_date'],
                'postponedCount' => intval($t['postponed_count']),
                'movedToTaskId' => $moved_to_task_id,
                'movedToDate' => $moved_to_task_id && isset($moved_to_dates[$moved_to_task_id]) ? $moved_to_dates[$moved_to_task_id]->task_date : null,
                'createdBy' => $t['created_by'] ?? null, 'createdAt' => $t['created_at'] ?? null,
                'updatedBy' => $t['updated_by'] ?? null, 'updatedAt' => $t['updated_at'] ?? null,
            );
        }
        $blocks = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM " . progreso_equip_table('blocks') . " WHERE assignment_id IN ($ph) ORDER BY id ASC",
            ...$assignment_ids
        ), ARRAY_A);
        foreach ($blocks as $b) {
            $blocks_by_assignment[intval($b['assignment_id'])][] = array(
                'id' => intval($b['id']), 'subzone' => intval($b['subzone']), 'grade' => $b['grade_color'],
                'holdSetIds' => array_values(array_filter(array_map('intval', explode(',', $b['hold_set_ids'])))),
                'isTraverse' => (bool) $b['is_traverse'], 'done' => (bool) $b['done'], 'uploadedWebapp' => (bool) $b['uploaded_webapp'],
            );
        }
    }

    // "0 bloques puestos esta semana" aunque el equipador sí creó blokes reales en Crear bloke
    // (cowork, 11/11 04:45: el contador solo miraba equip_blocks, nunca los blokes reales de la
    // app). Se suman aparte, nunca se mezclan con `blocks` (que sigue siendo solo lo planeado).
    $nombres_por_assignment = array();
    foreach ($assignments as $a) $nombres_por_assignment[intval($a['id'])] = $a['worker_name'];
    $reales_por_assignment = progreso_equip_contar_blokes_reales_semana($week['start_date'], $nombres_por_assignment);

    $out_assignments = array_map(function($a) use ($tasks_by_assignment, $blocks_by_assignment, $reales_por_assignment) {
        $id = intval($a['id']);
        return array(
            'id' => $id, 'workerId' => intval($a['worker_id']), 'workerName' => $a['worker_name'], 'isLead' => (bool) $a['is_lead'],
            'subzones' => array_values(array_filter(array_map('intval', explode(',', $a['subzones'])))),
            'blocksMin' => intval($a['blocks_min']), 'blocksMax' => intval($a['blocks_max']), 'status' => $a['status'],
            'workDays' => array_values(array_filter(explode(',', $a['work_days']))),
            'tasks' => $tasks_by_assignment[$id] ?? array(), 'blocks' => $blocks_by_assignment[$id] ?? array(),
            'blokesRealesCreados' => intval($reales_por_assignment[$id] ?? 0),
        );
    }, $assignments);

    return rest_ensure_response(array('success' => true, 'data' => array(
        'id' => intval($week['id']), 'startDate' => $week['start_date'],
        'subzones' => array_values(array_filter(array_map('intval', explode(',', $week['subzones'])))),
        'notes' => $week['notes'], 'isTest' => (bool) $week['is_test'], 'isAuto' => (bool) $week['auto'], 'assignments' => $out_assignments,
        'zonaId' => $week['zona_id'] !== null ? intval($week['zona_id']) : null,
        'zonaSugeridaId' => $week['zona_sugerida_id'] !== null ? intval($week['zona_sugerida_id']) : null,
    )));
}

// PUT /equipacion/assignments/{id} — cambiar los días de trabajo de ESTA semana (vacaciones o
// un cambio puntual), sin tocar el valor por defecto del trabajador, más subzonas/objetivo.
// Con `workDays: []` vuelve a usar el valor por defecto del trabajador (quita el cambio puntual).
function progreso_equip_update_assignment($request) {
    global $wpdb;
    $id = intval($request['id']);
    $existe = $wpdb->get_var($wpdb->prepare("SELECT id FROM " . progreso_equip_table('assignments') . " WHERE id = %d", $id));
    if (!$existe) return new WP_Error('not_found', 'Asignación no encontrada.', array('status' => 404));

    $upd = array(); $fmt = array();
    if ($request->get_param('workDays') !== null) {
        $wd = $request->get_param('workDays');
        $upd['work_days'] = is_array($wd) ? implode(',', array_map('sanitize_text_field', $wd)) : '';
        $fmt[] = '%s';
    }
    if ($request->get_param('subzones') !== null) {
        $sz = $request->get_param('subzones');
        $upd['subzones'] = is_array($sz) ? implode(',', array_map('intval', $sz)) : '';
        $fmt[] = '%s';
    }
    if ($request->get_param('blocksMin') !== null) { $upd['blocks_min'] = intval($request->get_param('blocksMin')); $fmt[] = '%d'; }
    if ($request->get_param('blocksMax') !== null) { $upd['blocks_max'] = intval($request->get_param('blocksMax')); $fmt[] = '%d'; }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(progreso_equip_table('assignments'), $upd, array('id' => $id), $fmt, array('%d'));
    return rest_ensure_response(array('success' => true));
}

// POST /equipacion/weeks/{id}/assignments — añade a alguien a una semana que ya existe
// (Álvaro/cowork, 2/11 12:55: una semana de compe se crea solo con el responsable y hacía falta
// meter a más gente a mano). Solo crea la fila de asignación — adrede sin generar ningún
// mantenimiento automático, igual que cuando se crea la semana entera con alguien nuevo que no
// tenía tareas antes: las tareas de esta persona esta semana se añaden sueltas (+Tarea) o
// arrastrando, como siempre.
function progreso_equip_week_add_assignment($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $week_id = intval($request['id']);
    $week = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . progreso_equip_table('weeks') . " WHERE id = %d", $week_id), ARRAY_A);
    if (!$week) return new WP_Error('not_found', 'Semana no encontrada.', array('status' => 404));

    $worker_id = intval($request->get_param('workerId'));
    if (!$worker_id) return new WP_Error('invalid_data', 'Falta workerId.', array('status' => 400));
    $worker = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('workers') . " WHERE id = %d", $worker_id), ARRAY_A);
    if (!$worker) return new WP_Error('not_found', 'Trabajador no encontrado.', array('status' => 404));

    $existe = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM " . progreso_equip_table('assignments') . " WHERE week_id = %d AND worker_id = %d", $week_id, $worker_id
    ));
    if ($existe) return new WP_Error('duplicate', 'Esa persona ya tiene una asignación esta semana.', array('status' => 409, 'assignmentId' => intval($existe)));

    $work_days_in = $request->get_param('workDays');
    $work_days = is_array($work_days_in) ? implode(',', array_map('sanitize_text_field', $work_days_in)) : '';
    $wpdb->insert(progreso_equip_table('assignments'), array(
        'week_id' => $week_id, 'worker_id' => $worker_id, 'subzones' => '',
        'blocks_min' => intval($worker['blocks_min']), 'blocks_max' => intval($worker['blocks_max']),
        'work_days' => $work_days, 'status' => 'pendiente',
    ), array('%d', '%d', '%s', '%d', '%d', '%s', '%s'));
    return rest_ensure_response(array('success' => true, 'assignmentId' => $wpdb->insert_id));
}

// DELETE /equipacion/assignments/{id} — solo si está vacía (sin tareas, sin bloques): para
// deshacer un «+Persona» puesto por error, o limpiar las que el plan de una compe dejó sin usar
// (cowork, 2/11 14:00). Si ya tiene algo, no se borra — ahí se trata como el resto del histórico.
function progreso_equip_delete_assignment($request) {
    global $wpdb;
    $id = intval($request['id']);
    $existe = $wpdb->get_var($wpdb->prepare("SELECT id FROM " . progreso_equip_table('assignments') . " WHERE id = %d", $id));
    if (!$existe) return new WP_Error('not_found', 'Asignación no encontrada.', array('status' => 404));
    $tiene_tareas = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . progreso_equip_table('tasks') . " WHERE assignment_id = %d", $id));
    $tiene_bloques = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . progreso_equip_table('blocks') . " WHERE assignment_id = %d", $id));
    if ($tiene_tareas || $tiene_bloques) {
        return new WP_Error('no_vacia', 'Esta asignación tiene tareas o bloques — no se puede borrar así.', array('status' => 409));
    }
    $wpdb->delete(progreso_equip_table('assignments'), array('id' => $id), array('%d'));
    return rest_ensure_response(array('success' => true));
}

// Borrar semana: si no tiene nada hecho ni ningún bloque, se borra de
// verdad (sirve para semanas creadas por error). Si tiene algo hecho, no
// se pierde el histórico: se archiva (desaparece de la lista principal,
// queda en "Histórico") y sus tareas sin hacer se tratan como cualquier
// tarea de una semana vieja — las recoge progreso_equip_create_week la
// próxima vez que se cree una semana. Las semanas de prueba (`isTest`) se
// borran siempre de verdad, aunque tengan hechas/retrasadas — cowork
// (1/11) las necesita para poder probar sin dejar residuos en producción.
// PUT /equipacion/weeks/{id} — corrección manual de la zona ("esta semana repetimos la
// #3-4", "saltamos a la Cueva") desde "⚙️ Configurar zonas" si van retrasados o adelantados.
// Al cambiar zona_id de una semana, las siguientes se recolocan solas (ver
// progreso_equip_calcular_zona_semana, que siempre ancla en la semana puesta más reciente).
// También sirve para tocar las subzonas o las notas sueltas de una semana ya creada.
function progreso_equip_update_week($request) {
    global $wpdb;
    $id = intval($request['id']);
    $existe = $wpdb->get_var($wpdb->prepare("SELECT id FROM " . progreso_equip_table('weeks') . " WHERE id = %d", $id));
    if (!$existe) return new WP_Error('not_found', 'Semana no encontrada.', array('status' => 404));
    $upd = array(); $fmt = array();
    if ($request->get_param('zonaId') !== null) {
        $zona_id = intval($request->get_param('zonaId'));
        $upd['zona_id'] = $zona_id ?: null; $fmt[] = '%d';
    }
    if ($request->get_param('subzones') !== null) {
        $subzones = $request->get_param('subzones');
        $subzones = is_array($subzones) ? array_map('intval', $subzones) : array();
        $upd['subzones'] = implode(',', $subzones); $fmt[] = '%s';
    }
    if ($request->get_param('notes') !== null) {
        $upd['notes'] = sanitize_textarea_field((string) $request->get_param('notes')); $fmt[] = '%s';
    }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(progreso_equip_table('weeks'), $upd, array('id' => $id), $fmt, array('%d'));
    return rest_ensure_response(array('success' => true));
}

function progreso_equip_delete_week($request) {
    global $wpdb;
    $week_id = intval($request['id']);
    $force = (bool) $request->get_param('force'); // borrado forzado (limpieza manual de semanas de prueba)
    $semana = $wpdb->get_row($wpdb->prepare(
        "SELECT is_test, auto FROM " . progreso_equip_table('weeks') . " WHERE id = %d", $week_id
    ), ARRAY_A);
    if ($semana && $semana['is_test']) $force = true;
    $es_auto = $semana && (bool) $semana['auto'];
    $tasks_table = progreso_equip_table('tasks');
    $assignment_ids = $wpdb->get_col($wpdb->prepare(
        "SELECT id FROM " . progreso_equip_table('assignments') . " WHERE week_id = %d", $week_id
    ));
    $done_tasks = 0; $blocks_count = 0; $retrasada_tasks = 0; $task_ids = array();
    if ($assignment_ids) {
        $ph = implode(',', array_fill(0, count($assignment_ids), '%d'));
        $done_tasks = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$tasks_table} WHERE assignment_id IN ($ph) AND done = 1", ...$assignment_ids
        ));
        $retrasada_tasks = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$tasks_table} WHERE assignment_id IN ($ph) AND status = 'retrasada'", ...$assignment_ids
        ));
        $blocks_count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM " . progreso_equip_table('blocks') . " WHERE assignment_id IN ($ph)", ...$assignment_ids
        ));
        $task_ids = $wpdb->get_col($wpdb->prepare("SELECT id FROM {$tasks_table} WHERE assignment_id IN ($ph)", ...$assignment_ids));
    }

    // Una semana creada sola (`auto`) en la que nadie ha hecho nada de verdad se borra del
    // todo, aunque alguna de sus tareas quedara marcada "retrasada" al arrastrarse hacia otra
    // semana — eso no es "trabajo perdido", es la propia semana la que no debió crearse así
    // (cowork, 1/11 18:25).
    if ($force || ($es_auto && $done_tasks === 0) || ($done_tasks === 0 && $blocks_count === 0 && $retrasada_tasks === 0)) {
        if ($task_ids) {
            // Las tareas de otras semanas que tenían esta semana como destino
            // (retrasada → aquí) vuelven a quedar sueltas, listas para que la
            // próxima semana que se cree las recoja de nuevo.
            $ph2 = implode(',', array_fill(0, count($task_ids), '%d'));
            $wpdb->query($wpdb->prepare(
                "UPDATE {$tasks_table} SET moved_to_task_id = NULL WHERE moved_to_task_id IN ($ph2)", ...$task_ids
            ));
        }
        if ($assignment_ids) {
            $ph = implode(',', array_fill(0, count($assignment_ids), '%d'));
            $wpdb->query($wpdb->prepare("DELETE FROM {$tasks_table} WHERE assignment_id IN ($ph)", ...$assignment_ids));
            $wpdb->query($wpdb->prepare("DELETE FROM " . progreso_equip_table('blocks') . " WHERE assignment_id IN ($ph)", ...$assignment_ids));
        }
        $wpdb->delete(progreso_equip_table('assignments'), array('week_id' => $week_id), array('%d'));
        $wpdb->delete(progreso_equip_table('weeks'), array('id' => $week_id), array('%d'));
        return rest_ensure_response(array('success' => true, 'mode' => 'deleted'));
    }

    $wpdb->update(progreso_equip_table('weeks'), array('archived' => 1), array('id' => $week_id), array('%d'), array('%d'));
    return rest_ensure_response(array('success' => true, 'mode' => 'archived', 'doneTasks' => $done_tasks, 'blocks' => $blocks_count, 'retrasadaTasks' => $retrasada_tasks));
}

// Una vez (Ramiro 12/11 10:45, NOTAS_PARA_CODE_equipacion.md: "urgente antes de la reunión con
// Álvaro, quitar todo lo marcado como retrasado sin borrar ni completar ninguna tarea"). Mismo
// gesto que `progreso_equip_limpiar_retrasadas_falsas`, pero para TODAS las semanas de golpe, no
// solo una: quita la marca de retraso (status, contador, fecha original, enlace a la tarea
// "siguiente") de cualquier tarea sin hacer que hoy sale en rojo o con "RETRASADA (×n)" —
// incluidas las copias viejas ya sustituidas (quedan como una tarea suelta más en su semana de
// origen, no se borran) y las "copias vivas" que arrastraron el contador. Nada se marca como
// hecho ni se borra.
function progreso_equip_limpiar_retrasadas_global() {
    if (get_option('blokes_equip_limpieza_retrasadas_12_11')) return;
    global $wpdb;
    $tasks_table = progreso_equip_table('tasks');
    $wpdb->query(
        "UPDATE {$tasks_table}
         SET status = 'pendiente', postponed_count = 0, original_date = task_date, moved_to_task_id = NULL
         WHERE done = 0 AND (status = 'retrasada' OR postponed_count > 0)"
    );
    update_option('blokes_equip_limpieza_retrasadas_12_11', 1, false);
}

// POST /equipacion/weeks/{id}/limpiar-retrasadas-falsas — arreglo puntual (cowork, 1/11 18:25 y
// 18:45): el cálculo de "semana actual" en domingo creó una semana ya pasada, y su barrido
// arrastró tareas a la semana siguiente marcándolas "retrasada ×1" sin que ese retraso hubiera
// existido nunca. Deja esas tareas (las que no están hechas) como si se hubieran repartido
// normal esta semana: sin contador de retraso, con su propia fecha como original, sin ninguna
// referencia a una tarea "de origen" que en realidad nunca debió crearse.
function progreso_equip_limpiar_retrasadas_falsas($request) {
    global $wpdb;
    $week_id = intval($request['id']);
    $tasks_table = progreso_equip_table('tasks');
    $assignments_table = progreso_equip_table('assignments');
    $assignment_ids = $wpdb->get_col($wpdb->prepare("SELECT id FROM {$assignments_table} WHERE week_id = %d", $week_id));
    if (!$assignment_ids) return new WP_Error('not_found', 'Semana sin asignaciones.', array('status' => 404));

    $afectadas = $wpdb->query(
        "UPDATE {$tasks_table} t JOIN {$assignments_table} a ON a.id = t.assignment_id
         SET t.status = 'pendiente', t.postponed_count = 0, t.original_date = t.task_date,
             t.moved_to_task_id = NULL, t.original_worker_id = a.worker_id
         WHERE t.assignment_id IN (" . implode(',', array_map('intval', $assignment_ids)) . ") AND t.done = 0"
    );
    return rest_ensure_response(array('success' => true, 'afectadas' => intval($afectadas)));
}

function progreso_equip_get_today($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    progreso_equip_sweep_overdue_into_current_week();
    $worker_id = intval($request->get_param('workerId'));
    $date = sanitize_text_field((string) $request->get_param('date'));
    if (!$date) $date = current_time('Y-m-d');
    if (!$worker_id) return new WP_Error('invalid_data', 'Falta workerId.', array('status' => 400));

    $tasks = $wpdb->get_results($wpdb->prepare(
        "SELECT t.*, a.id as assignment_id FROM " . progreso_equip_table('tasks') . " t
         JOIN " . progreso_equip_table('assignments') . " a ON a.id = t.assignment_id
         WHERE a.worker_id = %d AND t.task_date = %s
         ORDER BY (t.status = 'retrasada') DESC, t.id ASC",
        $worker_id, $date
    ), ARRAY_A);

    $moved_to_ids = array_values(array_filter(array_map(function($t) { return intval($t['moved_to_task_id']); }, $tasks)));
    $moved_to_dates = array();
    if ($moved_to_ids) {
        $ph = implode(',', array_fill(0, count($moved_to_ids), '%d'));
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id, task_date FROM " . progreso_equip_table('tasks') . " WHERE id IN ($ph)", ...$moved_to_ids
        ), ARRAY_A);
        foreach ($rows as $r) { $moved_to_dates[intval($r['id'])] = $r['task_date']; }
    }

    $assignment_id = $tasks ? intval($tasks[0]['assignment_id']) : 0;
    if (!$assignment_id) {
        // Sin tareas hoy (fin de semana, día libre...): usa igualmente la
        // asignación más reciente para poder seguir registrando bloques.
        $assignment_id = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT a.id FROM " . progreso_equip_table('assignments') . " a
             JOIN " . progreso_equip_table('weeks') . " wk ON wk.id = a.week_id
             WHERE a.worker_id = %d AND wk.start_date <= %s ORDER BY wk.start_date DESC LIMIT 1",
            $worker_id, $date
        ));
    }

    $blocks = array();
    if ($assignment_id) {
        $blocks = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM " . progreso_equip_table('blocks') . " WHERE assignment_id = %d ORDER BY id ASC", $assignment_id
        ), ARRAY_A);
    }

    return rest_ensure_response(array('success' => true, 'data' => array(
        'date' => $date,
        'assignmentId' => $assignment_id ?: null,
        'tasks' => array_map(function($t) use ($moved_to_dates) {
            $moved_to_task_id = intval($t['moved_to_task_id']) ?: null;
            return array(
                'id' => intval($t['id']), 'taskTypeId' => $t['task_type_id'],
                'params' => json_decode($t['params'], true) ?: new stdClass(),
                'done' => (bool) $t['done'], 'status' => $t['status'] ?: 'pendiente',
                'postponedCount' => intval($t['postponed_count']),
                'movedToTaskId' => $moved_to_task_id,
                'movedToDate' => $moved_to_task_id && isset($moved_to_dates[$moved_to_task_id]) ? $moved_to_dates[$moved_to_task_id] : null,
                'createdBy' => $t['created_by'] ?? null, 'createdAt' => $t['created_at'] ?? null,
                'updatedBy' => $t['updated_by'] ?? null, 'updatedAt' => $t['updated_at'] ?? null,
            );
        }, $tasks),
        'blocks' => array_map(function($b) {
            return array(
                'id' => intval($b['id']), 'subzone' => intval($b['subzone']), 'grade' => $b['grade_color'],
                'holdSetIds' => array_values(array_filter(array_map('intval', explode(',', $b['hold_set_ids'])))),
                'isTraverse' => (bool) $b['is_traverse'], 'done' => (bool) $b['done'], 'uploadedWebapp' => (bool) $b['uploaded_webapp'],
            );
        }, $blocks),
    )));
}

// Las tareas propuestas quedan fijadas pero se pueden mover: a otra
// persona (otra asignación) y/o a otro día — siempre dentro de la misma
// semana, para no desordenar el reparto de otra. El propio movimiento
// pasa a formar parte del histórico que alimenta el aprendizaje de
// progreso_equip_create_week la próxima vez.
function progreso_equip_update_task($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $id = intval($request['id']);
    // Ramiro 12/11 11:35: cualquier equipador puede marcar su propia tarea como hecha (`done`),
    // pero editarla, moverla de persona, cambiarle el día, el texto o la subzona es solo de
    // Álvaro o un socio — esos campos SÍ llegan por este mismo endpoint, así que el filtro va
    // aquí dentro, no en el permission_callback de la ruta (que tiene que dejar pasar "done").
    $campos_restringidos = array('date', 'assignmentId', 'workerName', 'customText', 'notas', 'subzona');
    foreach ($campos_restringidos as $campo) {
        if ($request->get_param($campo) !== null && !progreso_equip_es_jefe_o_socio()) {
            return new WP_Error('forbidden', 'Solo Álvaro o un socio puede editar, mover o cambiar de día una tarea.', array('status' => 403));
        }
    }
    $upd = array(); $fmt = array();
    if ($request->get_param('done') !== null) {
        $done = (bool) $request->get_param('done');
        $upd['done']    = $done ? 1 : 0;                        $fmt[] = '%d';
        $upd['done_at'] = $done ? current_time('mysql') : null; $fmt[] = '%s';
        if ($done) {
            $upd['status'] = 'hecha'; $fmt[] = '%s';
        } else {
            $moved_to = $wpdb->get_var($wpdb->prepare(
                "SELECT moved_to_task_id FROM " . progreso_equip_table('tasks') . " WHERE id = %d", $id
            ));
            $upd['status'] = $moved_to ? 'retrasada' : 'pendiente'; $fmt[] = '%s';
        }
    }
    if ($request->get_param('date') !== null) {
        $date = sanitize_text_field((string) $request->get_param('date'));
        if (!$date || !strtotime($date)) return new WP_Error('invalid_data', 'Fecha no válida.', array('status' => 400));
        $upd['task_date'] = date('Y-m-d', strtotime($date));
        $fmt[] = '%s';
    }
    if ($request->get_param('assignmentId') !== null) {
        // Antes exigía que la asignación destino fuera de la MISMA semana que la tarea — pensado
        // para el arrastre normal (siempre dentro de la semana que se ve en pantalla), pero
        // bloqueaba mover a mano una tarea de compe a otra semana (p. ej. de la de
        // desequipar/equipar al lunes de la propia compe). Si se manda explícitamente
        // assignmentId, se confía en el que lo pide — solo se comprueba que esa asignación
        // exista de verdad (cowork, 2/11 14:00).
        $new_assignment_id = intval($request->get_param('assignmentId'));
        $target = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM " . progreso_equip_table('assignments') . " WHERE id = %d", $new_assignment_id
        ));
        if (!$target) return new WP_Error('not_found', 'Esa asignación no existe.', array('status' => 404));
        $upd['assignment_id'] = $new_assignment_id;
        $fmt[] = '%d';
    }
    // Mover la tarea a otra persona por nombre, en la misma semana en la que ya está — "⇄ Mover
    // a..." del plan de la compe (Ramiro 12/11 10:44/10:45, punto 5): el frontend no siempre
    // tiene a mano el assignmentId de alguien que todavía no tenía ninguna tarea esa semana, así
    // que aquí se resuelve (o se crea) solo.
    if ($request->get_param('workerName') !== null) {
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT a.week_id FROM " . progreso_equip_table('tasks') . " t
             JOIN " . progreso_equip_table('assignments') . " a ON a.id = t.assignment_id
             WHERE t.id = %d", $id
        ), ARRAY_A);
        if (!$row) return new WP_Error('not_found', 'Tarea no encontrada.', array('status' => 404));
        $worker_name = sanitize_text_field((string) $request->get_param('workerName'));
        $worker = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . progreso_equip_table('workers') . " WHERE name = %s", $worker_name), ARRAY_A);
        if (!$worker) return new WP_Error('invalid_data', 'No existe esa persona.', array('status' => 400));
        $upd['assignment_id'] = progreso_equip_ensure_assignment(intval($row['week_id']), intval($worker['id']));
        $fmt[] = '%d';
    }
    // Editar el texto (tareas de texto libre), las notas (Ramiro, 5/11 06:54) o la subzona
    // (cowork, 11/11 05:40: "+ Tarea" ya admitía subzona al crear, pero editarla no se podía).
    if ($request->get_param('customText') !== null || $request->get_param('notas') !== null || $request->get_param('subzona') !== null) {
        $row = $wpdb->get_row($wpdb->prepare("SELECT task_type_id, params FROM " . progreso_equip_table('tasks') . " WHERE id = %d", $id), ARRAY_A);
        if (!$row) return new WP_Error('not_found', 'Tarea no encontrada.', array('status' => 404));
        $params = json_decode($row['params'], true) ?: array();
        if ($request->get_param('customText') !== null && $row['task_type_id'] === 'custom') {
            $texto = sanitize_text_field(trim((string) $request->get_param('customText')));
            if ($texto === '') return new WP_Error('invalid_data', 'El texto de la tarea no puede quedar vacío.', array('status' => 400));
            $params['texto'] = $texto;
        }
        if ($request->get_param('notas') !== null) {
            $notas = sanitize_text_field(trim((string) $request->get_param('notas')));
            if ($notas === '') unset($params['notas']); else $params['notas'] = $notas;
        }
        if ($request->get_param('subzona') !== null) {
            $subzona = intval($request->get_param('subzona'));
            if ($subzona < 1 || $subzona > 8) unset($params['subzona']); else $params['subzona'] = $subzona;
        }
        $upd['params'] = wp_json_encode($params ?: new stdClass()); $fmt[] = '%s';
    }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    // Marcar hecha no cuenta como modificación; cambiar persona, día, texto o notas, sí.
    if (array_diff(array_keys($upd), array('done', 'done_at', 'status'))) {
        $upd['updated_by'] = progreso_equip_actor($request); $fmt[] = '%s';
        $upd['updated_at'] = current_time('mysql');           $fmt[] = '%s';
    }
    $wpdb->update(progreso_equip_table('tasks'), $upd, array('id' => $id), $fmt, array('%d'));
    return rest_ensure_response(array('success' => true));
}

// Quitar una tarea concreta de la semana (NOTAS_PARA_CODE_equipacion.md, 3/11 11:30: Ramiro
// quiere poder quitarlas, no solo moverlas a la semana siguiente). Borrado de verdad, no un
// estado "cancelada" — el frontend solo enseña el botón al responsable o a un socio. Si otra
// tarea ya movida apuntaba a esta como destino, se desenlaza para no dejar un movedToTaskId
// roto.
function progreso_equip_delete_task($request) {
    global $wpdb;
    $id = intval($request['id']);
    $tasks_table = progreso_equip_table('tasks');
    $task = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$tasks_table} WHERE id = %d", $id));
    if (!$task) return new WP_Error('not_found', 'Tarea no encontrada.', array('status' => 404));
    $wpdb->update($tasks_table, array('moved_to_task_id' => null), array('moved_to_task_id' => $id), array('%s'), array('%d'));
    $wpdb->delete($tasks_table, array('id' => $id), array('%d'));
    return rest_ensure_response(array('success' => true));
}

// Las tareas no se cancelan: solo se mueven a la semana siguiente. La
// original se queda en su semana marcada "retrasada" (histórico de lo que
// se fue quedando atrás) y se crea una copia en la semana siguiente para
// el responsable, que la reparte. Si esa semana siguiente no existe
// todavía, la tarea queda "retrasada" sin copia — progreso_equip_create_week
// la recoge sola en cuanto se cree esa semana.
function progreso_equip_postpone_task($request) {
    global $wpdb;
    $id = intval($request['id']);
    $tasks_table = progreso_equip_table('tasks');

    $task = $wpdb->get_row($wpdb->prepare(
        "SELECT t.*, a.week_id, a.worker_id FROM {$tasks_table} t
         JOIN " . progreso_equip_table('assignments') . " a ON a.id = t.assignment_id
         WHERE t.id = %d", $id
    ), ARRAY_A);
    if (!$task) return new WP_Error('not_found', 'Tarea no encontrada.', array('status' => 404));
    if (intval($task['moved_to_task_id'])) {
        return new WP_Error('invalid_data', 'Esta tarea ya se movió a la semana siguiente.', array('status' => 400));
    }

    $week = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . progreso_equip_table('weeks') . " WHERE id = %d", intval($task['week_id'])
    ), ARRAY_A);
    $next_start = date('Y-m-d', strtotime($week['start_date']) + 7 * 86400);
    $next_week = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM " . progreso_equip_table('weeks') . " WHERE start_date = %s", $next_start
    ), ARRAY_A);

    if (!$next_week) {
        // Todavía no existe la semana siguiente: se queda "en cola".
        $wpdb->update($tasks_table, array('status' => 'retrasada'), array('id' => $id), array('%s'), array('%d'));
        return rest_ensure_response(array('success' => true, 'queued' => true));
    }

    $lead_assignment = $wpdb->get_row($wpdb->prepare(
        "SELECT a.id FROM " . progreso_equip_table('assignments') . " a
         JOIN " . progreso_equip_table('workers') . " w ON w.id = a.worker_id
         WHERE a.week_id = %d ORDER BY w.is_lead DESC, a.id ASC LIMIT 1", intval($next_week['id'])
    ), ARRAY_A);
    if (!$lead_assignment) {
        $wpdb->update($tasks_table, array('status' => 'retrasada'), array('id' => $id), array('%s'), array('%d'));
        return rest_ensure_response(array('success' => true, 'queued' => true));
    }

    // Igual que el barrido y el arrastre al crear semana: si en la semana siguiente ya hay una
    // tarjeta pendiente de este mismo tipo, se junta con ella (sube su ×n) en vez de crear una
    // segunda tarjeta del mismo tipo esa semana (cowork, 1/11 17:20 — «regar» salía duplicada).
    $new_task_id = progreso_equip_merge_rolled_task(
        intval($next_week['id']), intval($lead_assignment['id']), $task['task_type_id'], $next_start, $task['params'],
        intval($task['postponed_count']), $task['original_date'] ?: $task['task_date'],
        $task['original_worker_id'] ? intval($task['original_worker_id']) : intval($task['worker_id'])
    );

    $wpdb->update($tasks_table,
        array('status' => 'retrasada', 'moved_to_task_id' => $new_task_id),
        array('id' => $id), array('%s', '%d'), array('%d')
    );

    return rest_ensure_response(array('success' => true, 'queued' => false, 'newTaskId' => $new_task_id, 'nextWeekId' => intval($next_week['id'])));
}

// POST /equipacion/tasks/{id}/duplicar — "⧉ Duplicar a..." (Ramiro 12/11 11:40: "que se puedan
// duplicar una tarea para que la tengan varios, como balizar"). Copia independiente para cada
// persona marcada (mismo tipo, fecha, params y competición), done=0 siempre — cada una marca la
// suya. `workerIds` (array) o `all: true` para todo el equipo de esa semana. Nunca duplica a
// quien ya tenga esa misma tarea (tipo+fecha) esa semana, para no crear dobles.
function progreso_equip_duplicar_tarea($request) {
    global $wpdb;
    $id = intval($request['id']);
    $tasks_table = progreso_equip_table('tasks');
    $task = $wpdb->get_row($wpdb->prepare(
        "SELECT t.*, a.week_id FROM {$tasks_table} t JOIN " . progreso_equip_table('assignments') . " a ON a.id = t.assignment_id WHERE t.id = %d", $id
    ), ARRAY_A);
    if (!$task) return new WP_Error('not_found', 'Tarea no encontrada.', array('status' => 404));

    if ($request->get_param('all')) {
        $worker_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT worker_id FROM " . progreso_equip_table('assignments') . " WHERE week_id = %d", intval($task['week_id'])
        ));
    } else {
        $worker_ids = (array) $request->get_param('workerIds');
    }
    $worker_ids = array_values(array_unique(array_filter(array_map('intval', $worker_ids))));
    if (!$worker_ids) return new WP_Error('invalid_data', 'Elige al menos una persona.', array('status' => 400));

    $creadas = 0; $omitidas = 0;
    foreach ($worker_ids as $wid) {
        $assignment_id = progreso_equip_ensure_assignment(intval($task['week_id']), $wid);
        $ya = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$tasks_table} WHERE assignment_id = %d AND task_type_id = %s AND task_date = %s",
            $assignment_id, $task['task_type_id'], $task['task_date']
        ));
        if ($ya) { $omitidas++; continue; }
        $wpdb->insert($tasks_table, array(
            'assignment_id'  => $assignment_id, 'task_type_id' => $task['task_type_id'], 'task_date' => $task['task_date'],
            'params'         => $task['params'], 'done' => 0, 'status' => 'pendiente', 'original_date' => $task['task_date'],
            'competition_id' => $task['competition_id'], 'manual' => intval($task['manual']),
            'created_by'     => progreso_equip_actor($request), 'created_at' => current_time('mysql'),
        ), array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%d', '%s', '%s'));
        $creadas++;
    }
    return rest_ensure_response(array('success' => true, 'creadas' => $creadas, 'omitidas' => $omitidas));
}

function progreso_equip_create_block($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $assignment_id = intval($request->get_param('assignmentId'));
    $subzone       = intval($request->get_param('subzone'));
    $grade         = sanitize_text_field((string) $request->get_param('grade'));
    $hold_set_ids  = $request->get_param('holdSetIds');
    $hold_set_ids  = is_array($hold_set_ids) ? array_map('intval', $hold_set_ids) : array();
    $is_traverse   = (bool) $request->get_param('isTraverse');

    if (!$assignment_id || !$subzone || !$grade) {
        return new WP_Error('invalid_data', 'Faltan datos del bloque.', array('status' => 400));
    }

    // Aviso (no bloqueante): mismo juego de presas repetido en la misma subzona.
    $warning = null;
    if ($hold_set_ids) {
        $existing = $wpdb->get_results($wpdb->prepare(
            "SELECT hold_set_ids FROM " . progreso_equip_table('blocks') . " WHERE assignment_id = %d AND subzone = %d",
            $assignment_id, $subzone
        ), ARRAY_A);
        foreach ($existing as $e) {
            $other_ids = array_values(array_filter(array_map('intval', explode(',', $e['hold_set_ids']))));
            if (array_intersect($hold_set_ids, $other_ids)) {
                $warning = 'Ya hay otro bloque en esta subzona con el mismo juego de presas.';
                break;
            }
        }
    }

    // Bloques planificados (Ramiro, 11/11 04:27: "vale, hacerlo" — la tabla grado→presas que
    // Álvaro llevaba en Notion, dentro de "Poner bloques"): por defecto sigue creándose como
    // "ya puesto" (done=1, para no romper el uso de siempre), pero si se manda done=false se
    // crea como plan — grado y presas decididos de antemano, pendiente de equipar de verdad.
    $done = $request->get_param('done') === null ? 1 : ($request->get_param('done') ? 1 : 0);
    $wpdb->insert(progreso_equip_table('blocks'), array(
        'assignment_id'   => $assignment_id,
        'subzone'         => $subzone,
        'grade_color'     => $grade,
        'hold_set_ids'    => implode(',', $hold_set_ids),
        'is_traverse'     => $is_traverse ? 1 : 0,
        'done'            => $done,
        'uploaded_webapp' => 0,
        'created_at'      => current_time('mysql'),
    ), array('%d', '%d', '%s', '%s', '%d', '%d', '%d', '%s'));

    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id, 'warning' => $warning));
}

function progreso_equip_update_block($request) {
    global $wpdb;
    $id = intval($request['id']);
    $upd = array(); $fmt = array();
    if ($request->get_param('uploadedWebapp') !== null) { $upd['uploaded_webapp'] = $request->get_param('uploadedWebapp') ? 1 : 0; $fmt[] = '%d'; }
    if ($request->get_param('done') !== null)           { $upd['done']            = $request->get_param('done') ? 1 : 0;           $fmt[] = '%d'; }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(progreso_equip_table('blocks'), $upd, array('id' => $id), $fmt, array('%d'));
    return rest_ensure_response(array('success' => true));
}

function progreso_equip_delete_block($request) {
    global $wpdb;
    $wpdb->delete(progreso_equip_table('blocks'), array('id' => intval($request['id'])), array('%d'));
    return rest_ensure_response(array('success' => true));
}

// ── Compe ── organización de una competición: fecha, con cuántas semanas
// de antelación empiezan las tareas de equipación, y dónde va cada uno de
// los bloques en el mapa del rocódromo (burbujas arrastrables, § reglas
// adicionales las va dando el usuario sobre la marcha).
const PROGRESO_EQUIP_COMP_BLOCK_COUNT = 16;

// Las de prueba (`isTest`) no salen aquí por defecto, igual que las semanas de prueba.
function progreso_equip_get_competitions($request = null) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $solo_prueba = $request ? (bool) $request->get_param('test') : false;
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . progreso_equip_table('competitions') . " WHERE is_test = %d ORDER BY comp_date DESC",
        $solo_prueba ? 1 : 0
    ), ARRAY_A);
    return rest_ensure_response(array('success' => true, 'data' => array_map('progreso_equip_competition_fila', $rows)));
}

// Resumen rápido (días que faltan, tareas y bloques) para que la lista de competiciones diga
// algo de un vistazo en vez de una fila de texto plano (Ramiro, 4/11 05:48: "no pude ver la compe
// que creamos" — ni tarjeta pulsable ni estado, parecía que no había nada).
function progreso_equip_competition_fila($r) {
    global $wpdb;
    $id = intval($r['id']);
    $tasks_total  = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . progreso_equip_table('tasks') . " WHERE competition_id = %d", $id)));
    $tasks_hechas = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . progreso_equip_table('tasks') . " WHERE competition_id = %d AND done = 1", $id)));
    $blocks_total = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d", $id)));
    $blocks_colocados = intval($wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d AND x_pct IS NOT NULL", $id)));
    return array(
        'id' => $id, 'name' => $r['name'], 'compDate' => $r['comp_date'],
        'compEndDate' => $r['comp_end_date'] ?: $r['comp_date'],
        'leadWeeks' => intval($r['lead_weeks']), 'isTest' => (bool) $r['is_test'],
        'tasksStartDate' => date('Y-m-d', strtotime($r['comp_date']) - intval($r['lead_weeks']) * 7 * 86400),
        'tasksTotal' => $tasks_total, 'tasksHechas' => $tasks_hechas,
        'blocksTotal' => $blocks_total, 'blocksColocados' => $blocks_colocados,
        'modoActivo' => (bool) $r['modo_activo'],
    );
}

function progreso_equip_create_competition($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $name = trim((string) $request->get_param('name')) ?: 'Competición';
    $comp_date = sanitize_text_field((string) $request->get_param('compDate'));
    if (!$comp_date || !strtotime($comp_date)) {
        return new WP_Error('invalid_data', 'Falta la fecha de la competición.', array('status' => 400));
    }
    $comp_date = date('Y-m-d', strtotime($comp_date));
    $comp_end_date_in = sanitize_text_field((string) $request->get_param('compEndDate'));
    $comp_end_date = ($comp_end_date_in && strtotime($comp_end_date_in) >= strtotime($comp_date))
        ? date('Y-m-d', strtotime($comp_end_date_in)) : $comp_date;
    // Mínimo 3: por debajo no hay sitio para una semana de diseño distinta de la de limpieza sin
    // mover las de prep/equipar, que son fijas (cowork, 4/11 08:30 — ver generate-plan).
    $lead_weeks = max(3, intval($request->get_param('leadWeeks')) ?: 3);
    $is_test = $request->get_param('isTest') ? 1 : 0;

    $wpdb->insert(progreso_equip_table('competitions'), array(
        'name' => sanitize_text_field($name),
        'comp_date' => $comp_date, 'comp_end_date' => $comp_end_date,
        'lead_weeks' => $lead_weeks, 'is_test' => $is_test,
        'created_at' => current_time('mysql'),
    ), array('%s', '%s', '%s', '%d', '%d', '%s'));
    $comp_id = $wpdb->insert_id;

    // 16 burbujas numeradas, sin colocar todavía — se arrastran al mapa.
    for ($i = 1; $i <= PROGRESO_EQUIP_COMP_BLOCK_COUNT; $i++) {
        $wpdb->insert(progreso_equip_table('comp_blocks'), array(
            'competition_id' => $comp_id, 'number' => $i, 'status' => 'planeado',
        ), array('%d', '%d', '%s'));
    }

    return rest_ensure_response(array('success' => true, 'id' => $comp_id));
}

function progreso_equip_get_competition_detail($request) {
    global $wpdb;
    $id = intval($request['id']);
    $comp = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('competitions') . " WHERE id = %d", $id), ARRAY_A);
    if (!$comp) return new WP_Error('not_found', 'Competición no encontrada.', array('status' => 404));

    $blocks = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d ORDER BY number ASC", $id
    ), ARRAY_A);

    $data = progreso_equip_competition_fila($comp);
    $data['blocks'] = array_map(function($b) {
        return array(
            'id' => intval($b['id']), 'number' => intval($b['number']),
            'xPct' => $b['x_pct'] !== null ? floatval($b['x_pct']) : null,
            'yPct' => $b['y_pct'] !== null ? floatval($b['y_pct']) : null,
            'subzone' => $b['subzone'] !== null ? intval($b['subzone']) : null,
            'grade' => $b['grade_color'],
            'holdSetIds' => array_values(array_filter(array_map('intval', explode(',', $b['hold_set_ids'])))),
            'volumes' => $b['volumes'], 'equipador' => $b['equipador'],
            'photoUrl' => $b['photo_url'], 'tested' => (bool) $b['tested'],
            'status' => $b['status'],
        );
    }, $blocks);
    return rest_ensure_response(array('success' => true, 'data' => $data));
}

function progreso_equip_update_competition($request) {
    global $wpdb;
    $id = intval($request['id']);
    $upd = array(); $fmt = array();
    if ($request->get_param('name') !== null)      { $upd['name']      = sanitize_text_field($request->get_param('name'));             $fmt[] = '%s'; }
    if ($request->get_param('compDate') !== null)  { $upd['comp_date'] = date('Y-m-d', strtotime($request->get_param('compDate')));     $fmt[] = '%s'; }
    if ($request->get_param('compEndDate') !== null) { $upd['comp_end_date'] = date('Y-m-d', strtotime($request->get_param('compEndDate'))); $fmt[] = '%s'; }
    if ($request->get_param('leadWeeks') !== null)  { $upd['lead_weeks'] = max(3, intval($request->get_param('leadWeeks')));             $fmt[] = '%d'; }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(progreso_equip_table('competitions'), $upd, array('id' => $id), $fmt, array('%d'));
    return rest_ensure_response(array('success' => true));
}

// Borra también las tareas que hubiera generado el plan de esta compe (si lo hubo), para no
// dejar huérfanas tareas "Compe: ..." sin ninguna competición a la que pertenezcan. Si la compe
// es de PRUEBA, además borra ENTERAS las semanas de prueba que tocó su plan, tengan lo que
// tengan (también el reparto normal de mantenimiento que añade `progreso_equip_ensure_week_for_lead`
// al crear la semana) — es todo dato de prueba desechable, igual que el resto. Nunca una semana
// REAL (cowork, 4/11 07:20 y reprueba 08:30: primero dejaba huérfanas las semanas con tareas de
// mantenimiento normal además de las de compe; "borra todas sus semanas de prueba, tengan lo que
// tengan").
function progreso_equip_delete_competition($request) {
    global $wpdb;
    $id = intval($request['id']);
    $comp = $wpdb->get_row($wpdb->prepare("SELECT is_test FROM " . progreso_equip_table('competitions') . " WHERE id = %d", $id), ARRAY_A);
    $tasks_table = progreso_equip_table('tasks');
    $assignments_table = progreso_equip_table('assignments');
    $semanas_afectadas = $comp && $comp['is_test'] ? $wpdb->get_col($wpdb->prepare(
        "SELECT DISTINCT a.week_id FROM {$tasks_table} t JOIN {$assignments_table} a ON a.id = t.assignment_id WHERE t.competition_id = %d",
        $id
    )) : array();

    // "La compe en Blokes" (NOTAS_PARA_CODE_compe_en_blokes.md, punto 8: compe de prueba
    // borrable entera): si es de prueba, borra también los blokes reales que se hubieran creado
    // para sus bloques — nunca para una compe REAL, ahí el bloke ya es contenido de verdad de la
    // app y se deja huérfano (sin competition_id) en vez de borrarlo.
    // 🚨 CRÍTICO (cowork, 07/11 11:00): esta petición llega por el Club (blog 3) — sin
    // switch_to_blog(1), wp_delete_post() borraba el post con ESE MISMO id pero EN EL CLUB, que
    // no tiene nada que ver con el bloke real: ahí esos ids eran 16 PEDIDOS REALES (la mayoría
    // completados, con factura). Comprobado con cowork: nunca se llegó a borrar ninguno porque lo
    // pilló antes, pero el riesgo era real. Ahora: dentro de switch_to_blog(1), y solo se borra
    // si el post es de verdad un 'blokes' (nunca a ciegas por id).
    $diagnostico_blokes = array();
    if ($comp && $comp['is_test']) {
        $bloke_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT bloke_post_id FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d AND bloke_post_id IS NOT NULL", $id
        ));
        if ($bloke_ids) {
            $es_multisite = is_multisite();
            if ($es_multisite) switch_to_blog(1);
            // Cowork, 07/11 11:45: tras el primer arreglo los blokes de prueba NO se borraron
            // (seguían en borrador) — en vez de fiarse de get_post_type()/get_post() (que pueden
            // devolver algo cacheado de antes del switch_to_blog), se comprueba aquí con SQL
            // directo contra {$wpdb->posts} — esa tabla sí respeta el prefijo del blog actual
            // siempre, sin caché de objetos de por medio — y se devuelve en la respuesta qué vio
            // y qué hizo con cada uno, para poder ver exactamente dónde falla si vuelve a pasar.
            foreach ($bloke_ids as $bloke_id) {
                $bloke_id = intval($bloke_id);
                if (!$bloke_id) continue;
                clean_post_cache($bloke_id);
                $tipo_real = $wpdb->get_var($wpdb->prepare("SELECT post_type FROM {$wpdb->posts} WHERE ID = %d", $bloke_id));
                $fila_diag = array('blokePostId' => $bloke_id, 'blogActual' => get_current_blog_id(), 'postType' => $tipo_real);
                if ($tipo_real === 'blokes') {
                    blokes_quitar_completions_de_bloke($bloke_id);
                    $ok = wp_delete_post($bloke_id, true);
                    $fila_diag['borrado'] = (bool) $ok;
                    // Cowork, 07/11 16:30: wp_delete_post() fallaba justo cuando ese MISMO id
                    // existía como pedido/suscripción en el Club (otro blog) — algo en su cadena
                    // de hooks (WooCommerce/Subscriptions) sigue mirando ahí aunque estemos ya en
                    // switch_to_blog(1), y cancela el borrado por verlo "ocupado". Como aquí ya
                    // hemos comprobado por SQL directo que el post de ESTE blog es de verdad un
                    // 'blokes' (nunca un pedido), si wp_delete_post() no lo consigue se borra la
                    // fila a mano (posts/postmeta/term_relationships, todo con el prefijo del blog
                    // 1 en el que ya estamos) — sin pasar por esos hooks.
                    if (!$ok) {
                        $wpdb->delete($wpdb->postmeta, array('post_id' => $bloke_id), array('%d'));
                        $wpdb->delete($wpdb->term_relationships, array('object_id' => $bloke_id), array('%d'));
                        $wpdb->delete($wpdb->posts, array('ID' => $bloke_id), array('%d'));
                        clean_post_cache($bloke_id);
                        $sigue = $wpdb->get_var($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID = %d", $bloke_id));
                        $fila_diag['borradoSql'] = ($sigue === null);
                        $fila_diag['borrado'] = ($sigue === null);
                    }
                } else {
                    $fila_diag['borrado'] = false;
                    $fila_diag['motivo'] = $tipo_real ? 'post_type no es blokes' : 'no existe ese post en este blog';
                }
                $diagnostico_blokes[] = $fila_diag;
            }
            if ($es_multisite) restore_current_blog();
        }
    }
    // Ramiro 12/11 09:11: al borrar la compe entera, borrar también las fotos de sus bloques de
    // Medios — si no, se quedan huérfanas. Paso aparte, antes de borrar las filas.
    $fotos_de_la_compe = $wpdb->get_col($wpdb->prepare(
        "SELECT photo_attachment_id FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d AND photo_attachment_id IS NOT NULL", $id
    ));
    foreach ($fotos_de_la_compe as $attachment_id) {
        wp_delete_attachment(intval($attachment_id), true);
    }
    $wpdb->delete(progreso_equip_table('comp_resultados'), array('competition_id' => $id), array('%d'));
    $wpdb->delete(progreso_equip_table('comp_participantes_rapidos'), array('competition_id' => $id), array('%d'));
    $wpdb->delete($tasks_table, array('competition_id' => $id), array('%d'));
    $wpdb->delete(progreso_equip_table('comp_blocks'), array('competition_id' => $id), array('%d'));
    $wpdb->delete(progreso_equip_table('competitions'), array('id' => $id), array('%d'));

    foreach ($semanas_afectadas as $week_id) {
        $week_id = intval($week_id);
        $semana = $wpdb->get_row($wpdb->prepare("SELECT is_test FROM " . progreso_equip_table('weeks') . " WHERE id = %d", $week_id), ARRAY_A);
        if (!$semana || !$semana['is_test']) continue; // nunca una semana real
        $assignment_ids = $wpdb->get_col($wpdb->prepare("SELECT id FROM {$assignments_table} WHERE week_id = %d", $week_id));
        if ($assignment_ids) {
            $ph = implode(',', array_fill(0, count($assignment_ids), '%d'));
            $wpdb->query($wpdb->prepare("DELETE FROM {$tasks_table} WHERE assignment_id IN ($ph)", ...$assignment_ids));
            $wpdb->query($wpdb->prepare("DELETE FROM " . progreso_equip_table('blocks') . " WHERE assignment_id IN ($ph)", ...$assignment_ids));
            $wpdb->query($wpdb->prepare("DELETE FROM {$assignments_table} WHERE week_id = %d", $week_id));
        }
        $wpdb->delete(progreso_equip_table('weeks'), array('id' => $week_id), array('%d'));
    }
    return rest_ensure_response(array('success' => true, 'diagnosticoBlokes' => $diagnostico_blokes));
}

// POST /progreso/v1/compe/limpiar-blokes-prueba-antiguos — barrido de mantenimiento (cowork,
// 08/11 11:15: 45 blokes de prueba quedaron en la papelera del sitio Principal de rondas
// anteriores, de antes de arreglar el borrado de verdad). Solo socio. Nunca toca un bloke real:
// busca por `_comp_competition_id` (meta que SOLO pone progreso_equip_set_modo_compe() al crear
// un bloke de compe) en la papelera del blog 1, con el mismo camino seguro de
// progreso_equip_delete_competition() (SQL directo si wp_delete_post() no puede por los hooks de
// WooCommerce/Subscriptions). Se puede volver a llamar sin riesgo si vuelve a quedar alguno.
function progreso_compe_limpiar_blokes_prueba_antiguos($request) {
    if (!blokes_es_socio()) return new WP_Error('forbidden', 'Solo un socio puede hacer esta limpieza.', array('status' => 403));
    global $wpdb;
    $es_multisite = is_multisite();
    if ($es_multisite) switch_to_blog(1);
    $bloke_ids = $wpdb->get_col(
        "SELECT p.ID FROM {$wpdb->posts} p
         JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_comp_competition_id'
         WHERE p.post_type = 'blokes' AND p.post_status = 'trash'"
    );
    $diagnostico = array();
    foreach ($bloke_ids as $bloke_id) {
        $bloke_id = intval($bloke_id);
        clean_post_cache($bloke_id);
        $tipo_real = $wpdb->get_var($wpdb->prepare("SELECT post_type FROM {$wpdb->posts} WHERE ID = %d", $bloke_id));
        $fila_diag = array('blokePostId' => $bloke_id, 'postType' => $tipo_real);
        if ($tipo_real === 'blokes') {
            blokes_quitar_completions_de_bloke($bloke_id);
            $ok = wp_delete_post($bloke_id, true);
            if (!$ok) {
                $wpdb->delete($wpdb->postmeta, array('post_id' => $bloke_id), array('%d'));
                $wpdb->delete($wpdb->term_relationships, array('object_id' => $bloke_id), array('%d'));
                $wpdb->delete($wpdb->posts, array('ID' => $bloke_id), array('%d'));
                clean_post_cache($bloke_id);
                $ok = ($wpdb->get_var($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID = %d", $bloke_id)) === null);
            }
            $fila_diag['borrado'] = (bool) $ok;
        } else {
            $fila_diag['borrado'] = false;
        }
        $diagnostico[] = $fila_diag;
    }
    if ($es_multisite) restore_current_blog();
    return rest_ensure_response(array('success' => true, 'data' => $diagnostico));
}

function progreso_equip_update_comp_block($request) {
    global $wpdb;
    $id = intval($request['id']);
    // Ramiro 12/11 11:35: mover un bloque a otro equipador ("mover entre personas") es solo de
    // Álvaro o un socio — registrar el propio trabajo (presas, volúmenes, subzona, foto) sigue
    // abierto a cualquier equipador, es el supuesto pendiente de confirmar de la nota.
    if ($request->get_param('equipador') !== null && !progreso_equip_es_jefe_o_socio()) {
        return new WP_Error('forbidden', 'Solo Álvaro o un socio puede mover un bloque a otro equipador.', array('status' => 403));
    }
    $upd = array(); $fmt = array();
    if ($request->get_param('unplace')) {
        // Quitar la burbuja del mapa — vuelve a la bandeja de "sin colocar".
        $wpdb->query($wpdb->prepare(
            "UPDATE " . progreso_equip_table('comp_blocks') . " SET x_pct = NULL, y_pct = NULL WHERE id = %d", $id
        ));
        return rest_ensure_response(array('success' => true));
    }
    if ($request->get_param('subzone') !== null) { $upd['subzone'] = intval($request->get_param('subzone')); $fmt[] = '%d'; }
    if ($request->get_param('volumes') !== null) { $upd['volumes'] = sanitize_textarea_field((string) $request->get_param('volumes')); $fmt[] = '%s'; }
    if ($request->get_param('equipador') !== null) { $upd['equipador'] = sanitize_text_field((string) $request->get_param('equipador')); $fmt[] = '%s'; }
    if ($request->get_param('photoUrl') !== null) {
        $nueva_url = sanitize_text_field((string) $request->get_param('photoUrl'));
        $upd['photo_url'] = $nueva_url; $fmt[] = '%s';
        // "✕ Quitar foto" (Ramiro 12/11 09:11): además de quitar la referencia, borrar de
        // verdad el adjunto de Medios — nunca dejarlo huérfano.
        if ($nueva_url === '') {
            $bloque_actual = $wpdb->get_row($wpdb->prepare(
                "SELECT photo_attachment_id FROM " . progreso_equip_table('comp_blocks') . " WHERE id = %d", $id
            ), ARRAY_A);
            if ($bloque_actual && !empty($bloque_actual['photo_attachment_id'])) {
                wp_delete_attachment(intval($bloque_actual['photo_attachment_id']), true);
            }
            $upd['photo_attachment_id'] = null; $fmt[] = '%d';
        }
    }
    if ($request->get_param('tested') !== null) { $upd['tested'] = $request->get_param('tested') ? 1 : 0; $fmt[] = '%d'; }
    if ($request->get_param('xPct') !== null) { $upd['x_pct'] = floatval($request->get_param('xPct')); $fmt[] = '%f'; }
    if ($request->get_param('yPct') !== null) { $upd['y_pct'] = floatval($request->get_param('yPct')); $fmt[] = '%f'; }
    if ($request->get_param('grade') !== null) { $upd['grade_color'] = sanitize_text_field($request->get_param('grade')); $fmt[] = '%s'; }
    if ($request->get_param('holdSetIds') !== null) {
        $ids = $request->get_param('holdSetIds');
        $upd['hold_set_ids'] = is_array($ids) ? implode(',', array_map('intval', $ids)) : '';
        $fmt[] = '%s';
    }
    if ($request->get_param('status') !== null) { $upd['status'] = sanitize_text_field($request->get_param('status')); $fmt[] = '%s'; }
    if (empty($upd)) return new WP_Error('invalid_data', 'Nada que actualizar.', array('status' => 400));
    $wpdb->update(progreso_equip_table('comp_blocks'), $upd, array('id' => $id), $fmt, array('%d'));
    return rest_ensure_response(array('success' => true));
}

// POST /equipacion/comp-blocks/{id}/intercambiar-numero — punto 8 (Ramiro, 11/11 05:01): un
// bloque ya empezado a equipar resulta demasiado difícil/fácil para su número; se intercambia
// solo el número con otro bloque de la misma compe (lo que depende del número, como el color de
// escala o la posición en el ranking/tele, se recalcula solo porque se basa en este campo). La
// burbuja, la ficha (posición, presas, equipador, foto) y los resultados ya apuntados se quedan
// con su bloque físico (id), no se tocan.
function progreso_equip_intercambiar_numero_comp_block($request) {
    global $wpdb;
    $id = intval($request['id']);
    $otro_numero = $request->get_param('otroNumero');
    if ($otro_numero === null || $otro_numero === '') {
        return new WP_Error('invalid_data', 'Falta el número con el que intercambiar.', array('status' => 400));
    }
    $otro_numero = intval($otro_numero);
    $table = progreso_equip_table('comp_blocks');
    $bloque = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id = %d", $id), ARRAY_A);
    if (!$bloque) return new WP_Error('not_found', 'Bloque no encontrado.', array('status' => 404));
    if (intval($bloque['number']) === $otro_numero) {
        return new WP_Error('invalid_data', 'Es el mismo número.', array('status' => 400));
    }
    $otro = $wpdb->get_row($wpdb->prepare(
        "SELECT * FROM $table WHERE competition_id = %d AND number = %d", $bloque['competition_id'], $otro_numero
    ), ARRAY_A);
    if (!$otro) return new WP_Error('not_found', 'No hay ningún bloque con ese número en esta compe.', array('status' => 404));
    $wpdb->update($table, array('number' => $otro_numero), array('id' => $id), array('%d'), array('%d'));
    $wpdb->update($table, array('number' => intval($bloque['number'])), array('id' => intval($otro['id'])), array('%d'), array('%d'));
    return rest_ensure_response(array('success' => true, 'data' => array(
        'bloqueId' => $id, 'nuevoNumero' => $otro_numero,
        'otroBloqueId' => intval($otro['id']), 'otroNuevoNumero' => intval($bloque['number']),
    )));
}

// POST /equipacion/competitions/{id}/comp-blocks — "Vamos bien de tiempo, añadir el 17 y 18"
// (Ramiro, 11/11 05:01): un bloque más, numerado detrás del último que ya hubiera. El cartel y
// el resto de sitios que cuentan bloques leen siempre COUNT(comp_blocks), nunca un 16 fijo.
function progreso_equip_add_comp_block($request) {
    global $wpdb;
    $comp_id = intval($request['id']);
    $existe = $wpdb->get_var($wpdb->prepare("SELECT id FROM " . progreso_equip_table('competitions') . " WHERE id = %d", $comp_id));
    if (!$existe) return new WP_Error('not_found', 'Competición no encontrada.', array('status' => 404));
    $siguiente = intval($wpdb->get_var($wpdb->prepare(
        "SELECT COALESCE(MAX(number), 0) + 1 FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d", $comp_id
    )));
    $wpdb->insert(progreso_equip_table('comp_blocks'), array(
        'competition_id' => $comp_id, 'number' => $siguiente, 'status' => 'planeado',
    ), array('%d', '%d', '%s'));
    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id, 'number' => $siguiente));
}

// DELETE /equipacion/comp-blocks/{id} — deshacer un bloque añadido de más, solo mientras no se
// haya colocado en el mapa (si ya está colocado o tiene datos, se queda — igual que cualquier
// otro bloque de la compe; para quitarlo de verdad hay que hacerlo a propósito desde fuera).
function progreso_equip_delete_comp_block($request) {
    global $wpdb;
    $id = intval($request['id']);
    $block = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('comp_blocks') . " WHERE id = %d", $id), ARRAY_A);
    if (!$block) return new WP_Error('not_found', 'Bloque no encontrado.', array('status' => 404));
    if ($block['x_pct'] !== null) return new WP_Error('placed', 'Este bloque ya está colocado en el mapa — quítalo del mapa antes de borrarlo.', array('status' => 400));
    if (!empty($block['photo_attachment_id'])) {
        wp_delete_attachment(intval($block['photo_attachment_id']), true);
    }
    $wpdb->delete(progreso_equip_table('comp_blocks'), array('id' => $id), array('%d'));
    return rest_ensure_response(array('success' => true));
}

// POST /equipacion/comp-blocks/{id}/photo — sube la foto del bloque desde el móvil (Álvaro no
// va a usar la API para pegar una URL, Ramiro 1/11 17:20). Misma mecánica que el avatar del
// perfil (`blokes_api_upload_avatar`): `media_handle_upload` a la mediateca de WordPress.
function progreso_equip_upload_comp_block_photo($request) {
    global $wpdb;
    $id = intval($request['id']);
    $bloque = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('comp_blocks') . " WHERE id = %d", $id), ARRAY_A);
    if (!$bloque) return new WP_Error('not_found', 'Bloque no encontrado.', array('status' => 404));

    $files = $request->get_file_params();
    if (empty($files['file'])) return new WP_Error('no_file', 'Falta el fichero.', array('status' => 400));
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $attachment_id = media_handle_upload('file', 0);
    if (is_wp_error($attachment_id)) return $attachment_id;
    $url = wp_get_attachment_url($attachment_id);

    // Cowork 12/11 09:30, encargo de Ramiro: al subir una foto nueva encima de otra, la anterior
    // se queda huérfana en Medios. Se borra la que hubiera antes (si la hay) de verdad, no solo
    // la referencia en la fila.
    if (!empty($bloque['photo_attachment_id'])) {
        wp_delete_attachment(intval($bloque['photo_attachment_id']), true);
    }

    $wpdb->update(
        progreso_equip_table('comp_blocks'),
        array('photo_url' => $url, 'photo_attachment_id' => $attachment_id),
        array('id' => $id), array('%s', '%d'), array('%d')
    );
    return rest_ensure_response(array('success' => true, 'photoUrl' => $url));
}

// ============================================================
//  "La compe en Blokes" (NOTAS_PARA_CODE_compe_en_blokes.md, Ramiro 7/11 08:39 en adelante).
//  Puntuación/categorías quedan deliberadamente SIN fijar en código (punto final, 08:51): de
//  momento se guarda top/zona/intentos de cada uno y se ordena por nº de tops y luego menos
//  intentos, una sola categoría "General" por defecto — cuando Ramiro decida el formato de
//  verdad, cambia solo blokes_compe_config(), no la forma de guardar los datos.
// ============================================================

// Al borrar una compe de PRUEBA (y con ella sus blokes), quita cualquier rastro de ese bloke en
// completions de usuarios/placeholders — si no, la zona personal/ligas se quedan con tops de un
// bloke que ya no existe. Llamar siempre ya dentro de switch_to_blog(1) (el caller es quien
// decide el contexto). OJO — límite a propósito: esto NO deshace puntos de liga ni ascensos/
// descensos de categoría que ese top de prueba pudiera haber disparado (blokes_register_top_
// for_leagues hace swaps con otros miembros reales de la liga, y deshacerlo a ciegas podría
// tocar la clasificación de alguien real) — si una compe de prueba llegó a afectar a eso, hay
// que revisarlo a mano, no lo intenta este helper.
function blokes_quitar_completions_de_bloke($post_id) {
    global $wpdb;
    $post_id = intval($post_id);
    if (!$post_id) return;
    $like = '%' . $wpdb->esc_like('i:' . $post_id . ';') . '%';
    $user_ids = $wpdb->get_col($wpdb->prepare(
        "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = '_blokes_completed' AND meta_value LIKE %s", $like
    ));
    foreach ($user_ids as $uid) {
        $uid = intval($uid);
        $completed = get_user_meta($uid, '_blokes_completed', true);
        if (is_array($completed)) {
            update_user_meta($uid, '_blokes_completed', array_values(array_diff(array_map('intval', $completed), array($post_id))));
        }
        $log = get_user_meta($uid, '_blokes_completion_log', true);
        if (is_array($log)) {
            update_user_meta($uid, '_blokes_completion_log', array_values(array_filter($log, function($e) use ($post_id) {
                return intval($e['postId'] ?? 0) !== $post_id;
            })));
        }
        $fa = get_user_meta($uid, '_blokes_first_ascents', true);
        if (is_array($fa)) {
            update_user_meta($uid, '_blokes_first_ascents', array_values(array_diff(array_map('intval', $fa), array($post_id))));
        }
    }
    $wpdb->delete(blokes_placeholder_completions_table(), array('post_id' => $post_id), array('%d'));
}

// Igual que blokes_toggle_completion() pero SIN alternar (marca hecho si no lo estaba ya, nunca
// lo quita) — para cuando se apaga "modo compe" y los tops ya validados tienen que empezar a
// contar en la zona personal y en las ligas como cualquier bloke normal, sin que nadie tenga que
// volver a tocarlos uno a uno.
function blokes_marcar_completado_si_no_estaba($user_id, $post_id) {
    $saved = get_user_meta($user_id, '_blokes_completed', true);
    $completed_ids = is_array($saved) ? array_map('intval', $saved) : array();
    if (in_array(intval($post_id), $completed_ids, true)) return; // ya contaba, no duplicar
    $completed_ids[] = intval($post_id);
    $log = get_user_meta($user_id, '_blokes_completion_log', true);
    if (!is_array($log)) $log = array();
    $color = sanitize_text_field(get_field('bloke_color', $post_id) ?: 'green');
    $sala  = sanitize_text_field(get_field('bloke_sala', $post_id) ?: 'entrada');
    $log[] = array('postId' => intval($post_id), 'color' => $color, 'sala' => $sala, 'timestamp' => current_time('c'));
    update_user_meta($user_id, '_blokes_completed', $completed_ids);
    update_user_meta($user_id, '_blokes_completion_log', $log);
    $count = (int) get_post_meta($post_id, '_bloke_completion_count', true) + 1;
    update_post_meta($post_id, '_bloke_completion_count', $count);
    if ($count === 1) {
        $u = get_userdata($user_id);
        $display_name = $u ? $u->display_name : '';
        $first_name = explode(' ', trim($display_name))[0];
        update_post_meta($post_id, '_bloke_first_ascent', array(
            'user_id' => $user_id, 'name' => $first_name ?: $display_name, 'timestamp' => current_time('c'),
        ));
        $my_fa = get_user_meta($user_id, '_blokes_first_ascents', true);
        if (!is_array($my_fa)) $my_fa = array();
        $my_fa[] = intval($post_id);
        update_user_meta($user_id, '_blokes_first_ascents', $my_fa);
    }
    blokes_register_top_for_leagues($user_id, intval($post_id));
}

// Igual que blokes_marcar_completado_si_no_estaba() pero para un alumno manual sin cuenta de
// WordPress (comp_resultados.participante_tipo = 'placeholder') — mismo criterio no-toggle,
// reutilizando la tabla e inserción que ya usa blokes_toggle_completion_placeholder().
function blokes_marcar_completado_placeholder_si_no_estaba($placeholder_id, $post_id) {
    global $wpdb;
    blokes_ensure_placeholder_completions_table();
    $table = blokes_placeholder_completions_table();
    $ya = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM {$table} WHERE placeholder_id = %d AND post_id = %d", $placeholder_id, $post_id
    ));
    if ($ya) return; // ya contaba, no duplicar
    $color = sanitize_text_field(get_field('bloke_color', $post_id) ?: 'green');
    $sala  = sanitize_text_field(get_field('bloke_sala', $post_id) ?: 'entrada');
    $wpdb->insert($table, array(
        'placeholder_id' => intval($placeholder_id), 'post_id' => intval($post_id),
        'color' => $color, 'sala' => $sala, 'completed_at' => current_time('mysql'), 'logged_by' => get_current_user_id(),
    ), array('%d', '%d', '%s', '%s', '%s', '%d'));
    $count = (int) get_post_meta($post_id, '_bloke_completion_count', true) + 1;
    update_post_meta($post_id, '_bloke_completion_count', $count);
    if ($count === 1) {
        $nombre = $wpdb->get_var($wpdb->prepare("SELECT nombre FROM " . blokes_placeholder_table() . " WHERE id = %d", $placeholder_id));
        $first_name = $nombre ? explode(' ', trim($nombre))[0] : '';
        update_post_meta($post_id, '_bloke_first_ascent', array(
            'placeholder_id' => intval($placeholder_id), 'name' => $first_name ?: $nombre, 'timestamp' => current_time('c'),
        ));
    }
}

// POST /equipacion/competitions/{id}/modo-compe — body {activo: bool}. Solo un socio (Ramiro,
// 07/11 08:46: "lo enciende/apaga un socio"). Al ENCENDER: crea (si no existía ya) un bloke real
// por cada uno de los 16 comp_blocks, oculto (post_status 'draft') hasta que alguien lo publique
// — "Colección solo con los 16, sin foto" se resuelve en el frontend (punto aparte), aquí solo se
// prepara el bloke sin ninguna foto puesta todavía (se guarda aparte, pendiente). Al APAGAR: los
// 16 blokes pasan a 'publish' de verdad (ya son blokes normales de la colección, con su foto de
// verdad si la había) y cualquier resultado YA VALIDADO de esta compe se traspasa a completions
// normales (zona personal + ligas) — lo que siga "pendiente" o "rechazado" no cuenta, igual que
// antes de apagar el modo.
function progreso_equip_set_modo_compe($request) {
    if (!blokes_es_socio()) return new WP_Error('forbidden', 'Solo un socio puede encender o apagar el modo compe.', array('status' => 403));
    global $wpdb;
    $id = intval($request['id']);
    $activo = (bool) $request->get_param('activo');
    $simular = (bool) $request->get_param('simular');
    $comp = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('competitions') . " WHERE id = %d", $id), ARRAY_A);
    if (!$comp) return new WP_Error('not_found', 'Competición no encontrada.', array('status' => 404));
    if ((bool) $comp['modo_activo'] === $activo) {
        return rest_ensure_response(array('success' => true, 'data' => array('modoActivo' => $activo, 'aviso' => 'Ya estaba así.')));
    }
    $blocks = $wpdb->get_results($wpdb->prepare(
        "SELECT * FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d ORDER BY number ASC", $id
    ), ARRAY_A);

    if ($simular) {
        return rest_ensure_response(array('success' => true, 'simulado' => true, 'data' => array(
            'modoActivoDespues' => $activo, 'bloques' => count($blocks),
            'aviso' => $activo
                ? 'Se crearán (o reutilizarán) ' . count($blocks) . ' blokes ocultos, uno por bloque de la compe.'
                : 'Los blokes de la compe pasarán a publicados (colección normal) y los resultados ya validados contarán en ligas/zona personal.',
        )));
    }

    // Esta petición llega por el subsitio Club (donde viven las tablas de equipación), pero los
    // blokes de verdad (post_type 'blokes'), sus completions y las ligas viven en el subsitio
    // Principal (blog 1) — multisite real, tablas con prefijo distinto. Todo lo que toca un
    // bloke/usuario/liga tiene que hacerse dentro de switch_to_blog(1); todo lo que toca las
    // tablas de progreso_equip_table() tiene que hacerse FUERA (en el contexto en que llegó la
    // petición), nunca mezclado, o se escribe en el prefijo equivocado sin que salte ningún error.
    $es_multisite = is_multisite();
    $bloques_tocados = array();
    if ($activo) {
        // Fase 1 (blog 1): crear/actualizar cada bloke real. Solo se recogen aquí los datos del
        // bloke — nada de progreso_equip_table() dentro de este switch.
        if ($es_multisite) switch_to_blog(1);
        $post_por_bloque = array(); // comp_block_id => post_id (solo los NUEVOS, para guardar luego)
        foreach ($blocks as $b) {
            $post_id = intval($b['bloke_post_id']);
            $es_nuevo = !$post_id || !get_post($post_id);
            if ($es_nuevo) {
                $post_id = wp_insert_post(array(
                    'post_type' => 'blokes', 'post_title' => 'Bloque ' . intval($b['number']),
                    'post_status' => 'draft',
                    'post_content' => 'Compe RocoMadrid · bloque ' . intval($b['number']),
                ));
                if (is_wp_error($post_id)) continue;
                $post_por_bloque[intval($b['id'])] = $post_id;
            }
            // Los campos ACF de descripción/categoría no son post_content — sin tocarlos,
            // ACF enseña su valor por defecto ("nuevo bloke de RocoMadrid" / TÉCNICA), que no
            // pinta nada en un bloke de compe (cowork, 07/11 16:30).
            update_field('bloke_description', 'Compe RocoMadrid · bloque ' . intval($b['number']), $post_id);
            update_field('bloke_category', array(), $post_id);
            if ($b['grade_color']) update_field('bloke_color', $b['grade_color'], $post_id);
            // Subzona de la compe → "subsala" del bloke (mismo número) y "sala" real, según la
            // tabla que dio cowork (07/11 11:45, sacada de los blokes que ya existen):
            // subzona 1-2 = entrada, 3-7 = sala_grande, 8 = cueva.
            if ($b['subzone'] !== null) {
                $subzona = intval($b['subzone']);
                update_field('bloke_subsala', (string) $subzona, $post_id);
                $sala = ($subzona === 8) ? 'cueva' : (($subzona >= 3) ? 'sala_grande' : 'entrada');
                update_field('bloke_sala', $sala, $post_id);
            }
            update_post_meta($post_id, '_comp_competition_id', $id);
            update_post_meta($post_id, '_comp_block_id', intval($b['id']));
            update_post_meta($post_id, '_comp_block_number', intval($b['number']));
            if ($b['photo_url']) update_post_meta($post_id, '_comp_photo_pendiente', $b['photo_url']);
            $bloques_tocados[] = $post_id;
        }
        if ($es_multisite) restore_current_blog();
        // Fase 2 (de vuelta al contexto de la petición): guardar el id del bloke nuevo en
        // comp_blocks — nunca dentro del switch_to_blog de arriba.
        foreach ($post_por_bloque as $comp_block_id => $post_id) {
            $wpdb->update(progreso_equip_table('comp_blocks'), array('bloke_post_id' => $post_id), array('id' => $comp_block_id), array('%d'), array('%d'));
        }
    } else {
        // Resultados de ANTES de tocar ningún bloke (mismo contexto en que llegó la petición, las
        // tablas de resultados son de equipación) — se aplican después, ya en blog 1, junto con
        // el resto de lo que toca un bloke/usuario/liga. Sin validación en la app (Ramiro, 07/11
        // 16:36): todo lo apuntado (estado siempre 'validado' desde ese cambio) cuenta al apagar,
        // no solo "lo validado" de antes. Participantes con cuenta ('user') y alumnos manuales
        // ('placeholder', 09/11: picker de Colección en modo tablet) sí tienen un sitio donde
        // guardar su completion — un rápido no, sus tops quedan en comp_resultados hasta que, si
        // crea cuenta, se le asocien (pendiente, ver notas).
        $resultados = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM " . progreso_equip_table('comp_resultados') . " WHERE competition_id = %d AND top = 1 AND participante_tipo IN ('user', 'placeholder')", $id
        ), ARRAY_A);
        $bloque_a_post = array();
        foreach ($blocks as $b) { $bloque_a_post[intval($b['id'])] = intval($b['bloke_post_id']); }

        if ($es_multisite) switch_to_blog(1);
        foreach ($blocks as $b) {
            $post_id = intval($b['bloke_post_id']);
            if (!$post_id) continue;
            $post = get_post($post_id);
            if ($post && $post->post_status !== 'publish') {
                wp_update_post(array('ID' => $post_id, 'post_status' => 'publish'));
            }
            $photo_pendiente = get_post_meta($post_id, '_comp_photo_pendiente', true);
            if ($photo_pendiente) {
                $attachment_id = attachment_url_to_postid($photo_pendiente);
                if ($attachment_id) set_post_thumbnail($post_id, $attachment_id);
                delete_post_meta($post_id, '_comp_photo_pendiente');
            }
            $bloques_tocados[] = $post_id;
        }
        // Resultados ya validados → completions normales (zona personal + ligas). Nunca los
        // pendientes/rechazados: igual que antes de apagar el modo, esos no cuentan para nada.
        foreach ($resultados as $r) {
            $post_id = $bloque_a_post[intval($r['comp_block_id'])] ?? 0;
            if (!$post_id) continue;
            if ($r['participante_tipo'] === 'placeholder') {
                blokes_marcar_completado_placeholder_si_no_estaba(intval($r['participante_id']), $post_id);
            } else {
                blokes_marcar_completado_si_no_estaba(intval($r['participante_id']), $post_id);
            }
        }
        if ($es_multisite) restore_current_blog();
    }

    $wpdb->update(progreso_equip_table('competitions'), array('modo_activo' => $activo ? 1 : 0), array('id' => $id), array('%d'), array('%d'));
    return rest_ensure_response(array('success' => true, 'data' => array('modoActivo' => $activo, 'bloques' => $bloques_tocados)));
}

// GET /progreso/v1/compe/estado — público (sin login), lo usa tanto el móvil para saber si
// mostrar "apuntar resultados" como (más adelante) la pantalla de la tele. Nunca enseña la foto
// de los bloques (eso solo se revela al apagar el modo compe) ni ningún dato de quién ha hecho
// qué — eso va aparte, con sesión, en el endpoint de apuntar/leer resultados.
function progreso_compe_estado($request) {
    global $wpdb;
    $comp = $wpdb->get_row(
        "SELECT * FROM " . progreso_equip_table('competitions') . " WHERE modo_activo = 1 ORDER BY id DESC LIMIT 1", ARRAY_A
    );
    if (!$comp) return rest_ensure_response(array('success' => true, 'data' => array('activo' => false)));
    $blocks = $wpdb->get_results($wpdb->prepare(
        "SELECT id, number, grade_color, bloke_post_id, subzone FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d ORDER BY number ASC", $comp['id']
    ), ARRAY_A);
    // "Dónde está cada bloque" (Ramiro, 09/11 05:45): misma subzona que ya guarda Organización
    // (comp_blocks.subzone) y la misma tabla sala↔subzona de progreso_equip_set_modo_compe() —
    // si el bloque no tiene subzona asignada todavía, "zona por confirmar" en vez de adivinar.
    $sala_de = array(1 => 'entrada', 2 => 'entrada', 3 => 'sala_grande', 4 => 'sala_grande', 5 => 'sala_grande', 6 => 'sala_grande', 7 => 'sala_grande', 8 => 'cueva');
    $sala_label = array('entrada' => 'Entrada', 'sala_grande' => 'Sala Grande', 'cueva' => 'Cueva');
    return rest_ensure_response(array('success' => true, 'data' => array(
        'activo' => true, 'competitionId' => intval($comp['id']), 'nombre' => $comp['name'],
        'compDate' => $comp['comp_date'], 'compEndDate' => $comp['comp_end_date'] ?: $comp['comp_date'],
        'bloques' => array_map(function($b) use ($sala_de, $sala_label) {
            $subzona = $b['subzone'] !== null ? intval($b['subzone']) : null;
            $sala = $subzona && isset($sala_de[$subzona]) ? $sala_de[$subzona] : null;
            return array(
                'compBlockId' => intval($b['id']), 'blokePostId' => intval($b['bloke_post_id']),
                'numero' => intval($b['number']), 'color' => $b['grade_color'],
                'subzona' => $subzona, 'sala' => $sala ? $sala_label[$sala] : null,
            );
        }, $blocks),
    )));
}

// GET /progreso/v1/compe/proxima — la próxima compe real (no de prueba), para el gancho de
// "Instala Blokes". A diferencia de compe/estado, no exige modo_activo=1 (eso solo se enciende
// el día de la compe) — aquí hace falta verla desde días antes.
function progreso_compe_proxima($request) {
    global $wpdb;
    $comp = $wpdb->get_row(
        "SELECT id, name, comp_date, comp_end_date FROM " . progreso_equip_table('competitions') . "
         WHERE is_test = 0 AND comp_date >= CURDATE() ORDER BY comp_date ASC LIMIT 1", ARRAY_A
    );
    if (!$comp) return rest_ensure_response(array('success' => true, 'data' => null));
    // Posiciones de los bloques ya colocados en el mapa, para la pantalla "Próximamente" de
    // la tele (cowork, 11/11 05:15: "falta... mapa de los 16 bloques, cartel y cuenta atrás
    // en movimiento").
    $blocks = $wpdb->get_results($wpdb->prepare(
        "SELECT number, x_pct, y_pct, tested FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d ORDER BY number ASC", intval($comp['id'])
    ), ARRAY_A);
    return rest_ensure_response(array('success' => true, 'data' => array(
        'nombre'      => $comp['name'],
        'compDate'    => $comp['comp_date'],
        'compEndDate' => $comp['comp_end_date'] ?: $comp['comp_date'],
        'bloques'     => array_map(function($b) {
            return array(
                'numero' => intval($b['number']),
                'xPct'   => $b['x_pct'] !== null ? floatval($b['x_pct']) : null,
                'yPct'   => $b['y_pct'] !== null ? floatval($b['y_pct']) : null,
                'tested' => (bool) $b['tested'],
            );
        }, $blocks),
    )));
}

// POST /progreso/v1/compe/resultado — apunta/corrige el top/zona/intentos de UN bloque. Con
// sesión normal, siempre el propio usuario. targetUserId (como en blokes_toggle_completion) es
// para recepción apuntando por otra persona (Ramiro, 07/11 08:46) — exige
// blokes_can_supervise(), igual que el resto de "actuar en nombre de alguien". Cualquier cambio
// vuelve a dejarlo en "pendiente" — editar algo ya validado necesita que el juez lo vuelva a
// mirar, nunca se queda validado con datos distintos de los que vio.
function progreso_compe_apuntar_resultado($request) {
    if (!is_user_logged_in()) return new WP_Error('forbidden', 'Hace falta sesión.', array('status' => 401));
    global $wpdb;
    $comp_block_id = intval($request->get_param('compBlockId'));
    $top      = $request->get_param('top') ? 1 : 0;
    $zona     = $request->get_param('zona') ? 1 : 0;
    $intentos = max(0, intval($request->get_param('intentos')));
    $target_user_id = intval($request->get_param('targetUserId'));
    // Participante rápido (Ramiro, 07/11 08:48: pase de día sin cuenta) — siempre lo crea
    // recepción.
    $target_rapido_id = intval($request->get_param('targetParticipanteRapidoId'));
    // Alumno manual sin cuenta de WordPress (Ramiro, 09/11: reutilizar el picker "¿quién lo ha
    // hecho?" de Colección en modo tablet — ese picker también puede devolver uno de estos, no
    // solo cuentas reales).
    $target_placeholder_id = intval($request->get_param('targetPlaceholderId'));
    if (!$comp_block_id) return new WP_Error('bad_request', 'Falta compBlockId.', array('status' => 400));
    if (($target_user_id || $target_rapido_id || $target_placeholder_id) && !blokes_can_supervise()) {
        return new WP_Error('forbidden', 'No autorizado.', array('status' => 403));
    }
    $participante_tipo = $target_rapido_id ? 'rapido' : ($target_placeholder_id ? 'placeholder' : 'user');
    $participante_id = $target_rapido_id ?: ($target_placeholder_id ?: ($target_user_id ?: get_current_user_id()));

    $block = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('comp_blocks') . " WHERE id = %d", $comp_block_id), ARRAY_A);
    if (!$block) return new WP_Error('not_found', 'Bloque no encontrado.', array('status' => 404));
    $comp = $wpdb->get_row($wpdb->prepare("SELECT modo_activo FROM " . progreso_equip_table('competitions') . " WHERE id = %d", $block['competition_id']), ARRAY_A);
    if (!$comp || !$comp['modo_activo']) {
        return new WP_Error('modo_inactivo', 'El modo compe no está activo para este bloque.', array('status' => 409));
    }
    if ($target_rapido_id) {
        $existe_rapido = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM " . progreso_equip_table('comp_participantes_rapidos') . " WHERE id = %d AND competition_id = %d",
            $target_rapido_id, $block['competition_id']
        ));
        if (!$existe_rapido) return new WP_Error('not_found', 'Participante rápido no encontrado en esta compe.', array('status' => 404));
    }

    $ahora = current_time('mysql');
    $existente = $wpdb->get_row($wpdb->prepare(
        "SELECT id FROM " . progreso_equip_table('comp_resultados') . " WHERE competition_id = %d AND comp_block_id = %d AND participante_tipo = %s AND participante_id = %d",
        $block['competition_id'], $comp_block_id, $participante_tipo, $participante_id
    ), ARRAY_A);
    // Sin validación en la app (Ramiro, 07/11): todo lo apuntado cuenta al momento, venga del
    // móvil, de la tablet o de recepción — lo validan los compañeros de palabra, fuera de la app.
    $datos = array(
        'top' => $top, 'zona' => $zona ?: $top, 'intentos' => $intentos, 'apuntado_por' => get_current_user_id(),
        'estado' => 'validado', 'validado_por' => get_current_user_id(), 'validado_at' => $ahora, 'updated_at' => $ahora,
    );
    if ($existente) {
        $wpdb->update(progreso_equip_table('comp_resultados'), $datos, array('id' => intval($existente['id'])), null, array('%d'));
    } else {
        $wpdb->insert(progreso_equip_table('comp_resultados'), array_merge($datos, array(
            'competition_id' => $block['competition_id'], 'comp_block_id' => $comp_block_id,
            'participante_tipo' => $participante_tipo, 'participante_id' => $participante_id, 'created_at' => $ahora,
        )));
    }
    return rest_ensure_response(array('success' => true, 'data' => array('estado' => $datos['estado'])));
}

// GET /progreso/v1/compe/buscar-participante?q=X&competitionId=Y — "¿quién eres?" de recepción
// (Ramiro, 07/11 08:46/08:48): busca entre usuarios reales de WordPress (nombre/nickname, en el
// sitio Principal) y entre los participantes rápidos YA creados en esta compe (para no crear
// uno nuevo cada vez que vuelve la misma persona sin cuenta). Solo quien puede supervisar
// (profe/gestión/socio/tablet).
function progreso_compe_buscar_participante($request) {
    if (!blokes_can_supervise()) return new WP_Error('forbidden', 'No autorizado.', array('status' => 403));
    $q = trim((string) $request->get_param('q'));
    $competition_id = intval($request->get_param('competitionId'));
    if (mb_strlen($q) < 2) return new WP_Error('bad_request', 'Escribe al menos 2 caracteres.', array('status' => 400));

    global $wpdb;
    $resultado = array();

    // Clase de cada uno (Ramiro, 09/11 05:45: "hay 3 Ramiro, con solo nombre+apodo o
    // nombre+clase no se sabe cuál es — usa nombre + (apodo) + clase en los dos sitios") —
    // RocoMadrid_SF_Stats vive en el Club, así que el mapa se construye AQUÍ, antes de
    // cualquier switch_to_blog(1): dentro del switch el prefijo de WooCommerce ya no sería el
    // del Club y saldría vacío o mal.
    $clase_por_email = array();
    foreach (blokes_get_all_subscription_data() as $sub) {
        if (($sub['status'] ?? '') !== 'active' || empty($sub['email'])) continue;
        $clase = trim(($sub['dia'] ?? '') . (!empty($sub['horario']) ? ' ' . $sub['horario'] : ''));
        if ($clase) $clase_por_email[strtolower($sub['email'])] = $clase;
    }

    $es_multisite = is_multisite();
    if ($es_multisite) switch_to_blog(1);
    $usuarios = get_users(array(
        'number' => 20, 'search' => '*' . $q . '*', 'search_columns' => array('display_name', 'user_nicename'),
    ));
    foreach ($usuarios as $u) {
        $nick = blokes_get_user_nickname($u->ID);
        $nombre_mostrar = $nick ? "{$u->display_name} ({$nick})" : $u->display_name;
        $clase = $clase_por_email[strtolower($u->user_email)] ?? '';
        if ($clase) $nombre_mostrar .= " · {$clase}";
        $resultado[] = array('tipo' => 'user', 'id' => $u->ID, 'nombreMostrar' => $nombre_mostrar);
    }
    if ($es_multisite) restore_current_blog();

    if ($competition_id) {
        $rapidos = $wpdb->get_results($wpdb->prepare(
            "SELECT id, nombre FROM " . progreso_equip_table('comp_participantes_rapidos') . " WHERE competition_id = %d AND nombre LIKE %s LIMIT 20",
            $competition_id, '%' . $wpdb->esc_like($q) . '%'
        ), ARRAY_A);
        foreach ($rapidos as $r) {
            $resultado[] = array('tipo' => 'rapido', 'id' => intval($r['id']), 'nombreMostrar' => $r['nombre'] . ' (sin cuenta)');
        }
    }
    return rest_ensure_response(array('success' => true, 'data' => $resultado));
}

// POST /progreso/v1/compe/participante-rapido — crea un participante sin cuenta (pase de día,
// Ramiro 07/11 08:48). Solo recepción (can_supervise).
function progreso_compe_crear_participante_rapido($request) {
    if (!blokes_can_supervise()) return new WP_Error('forbidden', 'No autorizado.', array('status' => 403));
    global $wpdb;
    $competition_id = intval($request->get_param('competitionId'));
    $nombre = sanitize_text_field((string) $request->get_param('nombre'));
    $telefono = sanitize_text_field((string) $request->get_param('telefono'));
    $email = sanitize_email((string) $request->get_param('email'));
    if (!$competition_id || !$nombre) return new WP_Error('bad_request', 'Falta competitionId o nombre.', array('status' => 400));
    $u = wp_get_current_user();
    $wpdb->insert(progreso_equip_table('comp_participantes_rapidos'), array(
        'competition_id' => $competition_id, 'nombre' => $nombre, 'telefono' => $telefono, 'email' => $email,
        'categoria' => 'General', 'created_by' => $u ? $u->user_login : '', 'created_at' => current_time('mysql'),
    ));
    $id = $wpdb->insert_id;
    return rest_ensure_response(array('success' => true, 'data' => array('id' => $id, 'nombreMostrar' => $nombre . ' (sin cuenta)')));
}

// GET /progreso/v1/compe/mis-resultados?competitionId=X — lo que YA ha apuntado el usuario (o
// subjectUserId, misma regla de supervisión) en esta compe, para que el móvil pinte cada bloque
// con lo que ya tiene puesto en vez de partir siempre de cero.
// Ventana de la compe de ESTE participante (Ramiro, 07/11 09:11): 1h30 desde su primer top
// apuntado en esta compe — un solo intento de sentada, no se repite cada día. Lo de fuera de esa
// ventana no cuenta para la clasificación de la compe (pero sí para ligas/estadísticas, eso ya
// lo hace blokes_marcar_completado_si_no_estaba sin mirar la ventana). Se calcula al vuelo desde
// el primer `created_at` con top=1 — no hace falta guardar la hora de inicio aparte.
const PROGRESO_COMPE_VENTANA_MINUTOS = 90;

function progreso_compe_mis_resultados($request) {
    if (!is_user_logged_in()) return new WP_Error('forbidden', 'Hace falta sesión.', array('status' => 401));
    global $wpdb;
    $competition_id = intval($request->get_param('competitionId'));
    $subject_user_id = intval($request->get_param('subjectUserId'));
    $subject_rapido_id = intval($request->get_param('subjectParticipanteRapidoId'));
    if (($subject_user_id || $subject_rapido_id) && !blokes_can_supervise()) return new WP_Error('forbidden', 'No autorizado.', array('status' => 403));
    $participante_tipo = $subject_rapido_id ? 'rapido' : 'user';
    $participante_id = $subject_rapido_id ?: ($subject_user_id ?: get_current_user_id());
    if (!$competition_id) return new WP_Error('bad_request', 'Falta competitionId.', array('status' => 400));
    $filas = $wpdb->get_results($wpdb->prepare(
        "SELECT comp_block_id, top, zona, intentos, estado, created_at FROM " . progreso_equip_table('comp_resultados') . "
         WHERE competition_id = %d AND participante_tipo = %s AND participante_id = %d",
        $competition_id, $participante_tipo, $participante_id
    ), ARRAY_A);
    $data = array();
    $ventana_inicio = null;
    foreach ($filas as $f) {
        $data[intval($f['comp_block_id'])] = array(
            'top' => (bool) $f['top'], 'zona' => (bool) $f['zona'], 'intentos' => intval($f['intentos']), 'estado' => $f['estado'],
        );
        if ($f['top'] && ($ventana_inicio === null || $f['created_at'] < $ventana_inicio)) $ventana_inicio = $f['created_at'];
    }
    $ventana = null;
    if ($ventana_inicio) {
        // $ventana_inicio viene de current_time('mysql') (hora LOCAL de Madrid) — hay que
        // compararlo con current_time('timestamp') (el mismo desplazamiento), nunca con time()
        // a secas (UTC real): si no, sale desplazado por el offset horario de Madrid — cowork,
        // 07/11 11:00, "sale 149 min en vez de 90".
        $ahora_ts = current_time('timestamp');
        $fin_ts = strtotime($ventana_inicio) + PROGRESO_COMPE_VENTANA_MINUTOS * 60;
        $ventana = array(
            'inicio' => $ventana_inicio, 'minutosRestantes' => max(0, (int) round(($fin_ts - $ahora_ts) / 60)),
            'cerrada' => $ahora_ts >= $fin_ts,
        );
    }
    return rest_ensure_response(array('success' => true, 'data' => $data, 'ventana' => $ventana));
}

// GET /progreso/v1/compe/clasificacion?competitionId=X — público (pantalla de la tele,
// NOTAS_PARA_CODE_compe_en_blokes.md, Ramiro 07/11): clasificación provisional de ESTA compe
// (nº de tops validados, ordenado por tops y luego por quién llegó antes a esa cifra) y los
// últimos tops validados. Punto 7 de Ramiro: "solo nombre y nickname entre paréntesis, nunca
// apellidos" — se construye aquí, nunca se manda el apellido al frontend. Categorías y puntos de
// verdad (y la liga de temporada de las 3 compes) quedan para cuando Ramiro confirme el formato
// — de momento una sola categoría "General".
function progreso_compe_clasificacion($request) {
    global $wpdb;
    $competition_id = intval($request->get_param('competitionId'));
    if (!$competition_id) return new WP_Error('bad_request', 'Falta competitionId.', array('status' => 400));

    $filas = $wpdb->get_results($wpdb->prepare(
        "SELECT r.*, b.number AS numero, b.grade_color AS color FROM " . progreso_equip_table('comp_resultados') . " r
         JOIN " . progreso_equip_table('comp_blocks') . " b ON b.id = r.comp_block_id
         WHERE r.competition_id = %d AND r.estado = 'validado' AND r.top = 1
         ORDER BY r.validado_at ASC", $competition_id
    ), ARRAY_A);

    // Participantes rápidos (sin cuenta): su nombre ya está guardado tal cual, no hace falta
    // mirar usuarios de WordPress — una sola consulta para todos los que aparezcan.
    $nombres_rapidos = array();
    $rapido_ids = array();
    foreach ($filas as $f) {
        if ($f['participante_tipo'] === 'rapido') $rapido_ids[intval($f['participante_id'])] = true;
    }
    $rapido_ids = array_keys($rapido_ids);
    if ($rapido_ids) {
        $ph = implode(',', array_fill(0, count($rapido_ids), '%d'));
        $filas_rapidos = $wpdb->get_results($wpdb->prepare(
            "SELECT id, nombre FROM " . progreso_equip_table('comp_participantes_rapidos') . " WHERE id IN ($ph)", ...$rapido_ids
        ), ARRAY_A);
        foreach ($filas_rapidos as $fr) $nombres_rapidos[intval($fr['id'])] = $fr['nombre'];
    }

    // Alumnos manuales sin cuenta (Ramiro, 09/11: el picker "¿quién lo ha hecho?" de Colección
    // en modo tablet también puede devolver uno de estos) — mismo trato que un rápido.
    $nombres_placeholder = array();
    $placeholder_ids = array();
    foreach ($filas as $f) {
        if ($f['participante_tipo'] === 'placeholder') $placeholder_ids[intval($f['participante_id'])] = true;
    }
    $placeholder_ids = array_keys($placeholder_ids);
    if ($placeholder_ids) {
        $ph = implode(',', array_fill(0, count($placeholder_ids), '%d'));
        $filas_placeholder = $wpdb->get_results($wpdb->prepare(
            "SELECT id, nombre FROM " . blokes_placeholder_table() . " WHERE id IN ($ph)", ...$placeholder_ids
        ), ARRAY_A);
        foreach ($filas_placeholder as $fp) $nombres_placeholder[intval($fp['id'])] = $fp['nombre'];
    }

    $por_participante = array();
    foreach ($filas as $f) {
        $clave = $f['participante_tipo'] . ':' . intval($f['participante_id']);
        if (!isset($por_participante[$clave])) {
            $por_participante[$clave] = array(
                'tipo' => $f['participante_tipo'], 'id' => intval($f['participante_id']),
                'tops' => 0, 'primerTop' => $f['created_at'],
            );
        }
        $por_participante[$clave]['tops']++;
    }

    $es_multisite = is_multisite();
    if ($es_multisite) switch_to_blog(1);
    $acortar_sin_cuenta = function($nombre_completo) {
        // Público (tele/clasificación): nunca apellidos (Ramiro, punto 7) — un rápido/alumno
        // manual se escribe entero (nombre y apellidos sueltos, sin un campo separado), así que
        // aquí solo se enseña la primera palabra + la inicial de la siguiente si hay (cowork,
        // 07/11 16:30: "Rápido P.").
        $partes = array_values(array_filter(explode(' ', trim((string) $nombre_completo))));
        $nombre_corto = $partes[0] ?? 'Alguien';
        if (isset($partes[1]) && $partes[1] !== '') $nombre_corto .= ' ' . mb_substr($partes[1], 0, 1) . '.';
        return $nombre_corto . ' (sin cuenta)';
    };
    $nombre_de = function($tipo, $id) use ($nombres_rapidos, $nombres_placeholder, $acortar_sin_cuenta) {
        if ($tipo === 'rapido') return $acortar_sin_cuenta($nombres_rapidos[$id] ?? 'Alguien');
        if ($tipo === 'placeholder') return $acortar_sin_cuenta($nombres_placeholder[$id] ?? 'Alguien');
        $u = get_userdata($id);
        if (!$u) return 'Alguien';
        $nombre = $u->first_name ?: explode(' ', trim($u->display_name))[0];
        $nick = blokes_get_user_nickname($id);
        return $nick ? "{$nombre} ({$nick})" : $nombre;
    };
    $clasificacion = array();
    foreach ($por_participante as $info) {
        $clasificacion[] = array(
            'nombreMostrar' => $nombre_de($info['tipo'], $info['id']),
            'categoria' => 'General', 'tops' => $info['tops'], 'primerTop' => $info['primerTop'],
        );
    }
    usort($clasificacion, function($a, $b) {
        return $b['tops'] !== $a['tops'] ? $b['tops'] <=> $a['tops'] : strcmp($a['primerTop'], $b['primerTop']);
    });

    $ultimos = array_slice(array_reverse($filas), 0, 10);
    $ultimos_validados = array();
    foreach ($ultimos as $f) {
        $ultimos_validados[] = array(
            'nombreMostrar' => $nombre_de($f['participante_tipo'], intval($f['participante_id'])),
            'numero' => intval($f['numero']), 'color' => $f['color'], 'hace' => human_time_diff(strtotime($f['validado_at']), current_time('timestamp')),
        );
    }
    if ($es_multisite) restore_current_blog();

    return rest_ensure_response(array('success' => true, 'data' => array(
        'categorias' => array(array('nombre' => 'General', 'clasificacion' => $clasificacion)),
        'ultimosValidados' => $ultimos_validados,
    )));
}

function progreso_equip_monday_of($date) {
    $ts = strtotime($date);
    $dow = (int) date('N', $ts); // ISO: 1 = lunes .. 7 = domingo
    return date('Y-m-d', $ts - ($dow - 1) * 86400);
}

function progreso_equip_dia_cerrado($fecha) {
    $set = blokes_club_days_cerrados($fecha, $fecha);
    return isset($set[$fecha]);
}

// Asegura que exista una semana de Organización para ese lunes, con una asignación del
// responsable — si la semana ya existe (de mantenimiento normal u otra fase del mismo plan),
// se reutiliza. OJO: esto NO reparte las tareas de mantenimiento semanal normal para esa
// semana (eso solo lo hace progreso_equip_create_week, y de hecho no podrá: el `startDate`
// único ya ocupado por esta semana haría que esa llamada fallara con 409) — es a propósito,
// Ramiro confirmó (1/11) que la semana de la compe es solo compe, sin mantenimiento normal.
// `$is_test` hereda el de la propia competición: el plan de una compe de prueba tiene que
// crear semanas de prueba, nunca semanas reales (cowork, 1/11 17:20).
// $solo_compe: true para las semanas de "compe intensiva" (desequipar/equipar la de antes, y los
// días de la propia compe) — esas sí son solo del responsable, como siempre. Para el resto
// (diseño, limpieza, prep. montaje, cierre/redes) lleva ADEMÁS el reparto normal de
// mantenimiento (Ramiro, 2/11 12:55: la del 16/11 "no es de compe intensiva" y se había creado
// solo con el responsable, sin el resto del equipo).
function progreso_equip_ensure_week_for_lead($monday, $lead, $is_test, &$warnings, $solo_compe = true) {
    global $wpdb;
    $existing = $wpdb->get_row($wpdb->prepare(
        "SELECT id, is_test FROM " . progreso_equip_table('weeks') . " WHERE start_date = %s", $monday
    ), ARRAY_A);
    if ($existing && (bool) $existing['is_test'] !== (bool) $is_test) {
        // Una compe de prueba no debe tocar una semana real que ya exista esa fecha (ni al
        // revés) — se avisa y esa fase se salta entera, en vez de mezclar datos de prueba con
        // datos reales en la misma semana (cowork, 1/11 17:20).
        $warnings[] = "Semana del {$monday} ya existe como " . ($existing['is_test'] ? 'de prueba' : 'real') . ": no se tocó (la compe es " . ($is_test ? 'de prueba' : 'real') . ").";
        return array(null, null);
    }
    $week_id = $existing ? intval($existing['id']) : null;
    // (La versión anterior de este arreglo borraba y recreaba una semana ya existente sin
    // tareas "reales" para que saliera con el reparto normal — pero eso podía chocar con las
    // tareas de compe que ahora ya NUNCA se borran al regenerar el plan [ver
    // progreso_equip_ensure_comp_task]: borrar la asignación del responsable las dejaría
    // huérfanas. Por eso esto solo se intenta cuando la semana es NUEVA de verdad, más abajo; si
    // ya existía, solo se completa el equipo que falte, igual que en 2/11 y 9/11.)

    if (!$week_id && !$solo_compe) {
        // Semana nueva "normal": se crea con el reparto de mantenimiento de siempre (todo el
        // equipo activo y NO eventual — quien solo viene a compes puntuales no entra en el
        // mantenimiento normal, cowork 2/11 14:00), igual que si alguien la hubiera creado a
        // mano — las tareas de compe se añaden encima, debajo en esta misma función.
        $activos = $wpdb->get_results("SELECT id FROM " . progreso_equip_table('workers') . " WHERE active = 1 AND eventual = 0", ARRAY_A);
        if ($activos) {
            $req = new WP_REST_Request('POST', '/progreso/v1/equipacion/weeks');
            $req->set_param('startDate', $monday);
            $req->set_param('subzones', array());
            $req->set_param('assignments', array_map(function($w) { return array('workerId' => intval($w['id'])); }, $activos));
            $req->set_param('isTest', $is_test);
            $res = progreso_equip_create_week($req);
            if (!is_wp_error($res)) {
                $data = $res->get_data();
                $week_id = intval($data['week_id'] ?? 0) ?: null;
                if ($week_id) $warnings[] = "Semana del {$monday} creada con el reparto normal de mantenimiento, más las tareas de la compe.";
            }
        }
    }
    if (!$week_id) {
        $wpdb->insert(progreso_equip_table('weeks'), array(
            'start_date' => $monday, 'subzones' => '',
            'notes' => 'Generada por el plan de una competición — esta semana es solo compe, sin mantenimiento normal.',
            'is_test' => $is_test ? 1 : 0, 'created_at' => current_time('mysql'),
        ), array('%s', '%s', '%s', '%d', '%s'));
        $week_id = $wpdb->insert_id;
        $warnings[] = "Semana del {$monday} creada para el plan de la competición.";
    } elseif (!$solo_compe) {
        // Semana que ya existía (p. ej. la del 2/11 o la del 9/11, con las 13 tareas normales
        // del responsable; o una semana de compe anterior ya con sus tareas de compe puestas) —
        // no se tocan sus tareas, solo se completa el equipo que falte. Solo la asignación — sin
        // generar con retraso tareas de mantenimiento nuevas, que se reparten a mano como el
        // resto (+Tarea o arrastrando).
        $activos = $wpdb->get_results("SELECT id, name FROM " . progreso_equip_table('workers') . " WHERE active = 1 AND eventual = 0", ARRAY_A);
        $ya_asignados = $wpdb->get_col($wpdb->prepare("SELECT worker_id FROM " . progreso_equip_table('assignments') . " WHERE week_id = %d", intval($week_id)));
        $anadidos = array();
        foreach ($activos as $w) {
            if (in_array(intval($w['id']), array_map('intval', $ya_asignados), true)) continue;
            $wpdb->insert(progreso_equip_table('assignments'), array(
                'week_id' => intval($week_id), 'worker_id' => intval($w['id']), 'subzones' => '', 'status' => 'pendiente',
            ), array('%d', '%d', '%s', '%s'));
            $anadidos[] = $w['name'];
        }
        if ($anadidos) {
            $warnings[] = "Semana del {$monday}: añadido al reparto normal " . implode(', ', $anadidos) . " (sin tareas de mantenimiento automáticas, repártelas a mano).";
        }
    }

    $assignment_id = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM " . progreso_equip_table('assignments') . " WHERE week_id = %d AND worker_id = %d",
        intval($week_id), intval($lead['id'])
    ));
    if (!$assignment_id) {
        $wpdb->insert(progreso_equip_table('assignments'), array(
            'week_id' => intval($week_id), 'worker_id' => intval($lead['id']), 'subzones' => '', 'status' => 'pendiente',
        ), array('%d', '%d', '%s', '%s'));
        $assignment_id = $wpdb->insert_id;
    }
    return array(intval($week_id), intval($assignment_id));
}

// Asignación de una persona en una semana, creándola si todavía no existe — usado tanto por
// "+ Tarea" a mano en el plan de la compe como por "⇄ Mover a..." cuando esa persona todavía no
// tenía ninguna tarea esa semana.
function progreso_equip_ensure_assignment($week_id, $worker_id) {
    global $wpdb;
    $assignment_id = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM " . progreso_equip_table('assignments') . " WHERE week_id = %d AND worker_id = %d",
        intval($week_id), intval($worker_id)
    ));
    if ($assignment_id) return intval($assignment_id);
    $wpdb->insert(progreso_equip_table('assignments'), array(
        'week_id' => intval($week_id), 'worker_id' => intval($worker_id), 'subzones' => '', 'status' => 'pendiente',
    ), array('%d', '%d', '%s', '%s'));
    return $wpdb->insert_id;
}

// Semana mínima para colgar una tarea de compe puesta a mano en un día que todavía no tiene
// ninguna — sin el reparto normal completo de `progreso_equip_ensure_week_for_lead` (eso es solo
// para las fases del plan automático).
function progreso_equip_ensure_week_simple($monday, $is_test) {
    global $wpdb;
    $week_id = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM " . progreso_equip_table('weeks') . " WHERE start_date = %s AND is_test = %d", $monday, $is_test ? 1 : 0
    ));
    if ($week_id) return intval($week_id);
    $wpdb->insert(progreso_equip_table('weeks'), array(
        'start_date' => $monday, 'subzones' => '',
        'notes' => 'Generada por una tarea a mano del plan de una competición.',
        'is_test' => $is_test ? 1 : 0, 'created_at' => current_time('mysql'),
    ), array('%s', '%s', '%s', '%d', '%s'));
    return $wpdb->insert_id;
}

// POST /equipacion/competitions/{id}/tasks — "+ Tarea" a mano en una columna del plan de la
// compe (Ramiro 12/11 10:44): tipo del catálogo "Compe: ..." o texto libre, día y notas. Se
// marca `manual = 1` para que "Regenerar" nunca la toque (ver el filtro `$tocada` en
// progreso_equip_competition_generate_plan), aunque coincida tipo+fecha con una fase del plan.
function progreso_equip_competition_add_task($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $comp_id = intval($request['id']);
    $comp = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('competitions') . " WHERE id = %d", $comp_id), ARRAY_A);
    if (!$comp) return new WP_Error('not_found', 'Competición no encontrada.', array('status' => 404));

    $worker_name = sanitize_text_field((string) $request->get_param('workerName'));
    if ($worker_name === '') return new WP_Error('invalid_data', 'Elige a quién se asigna la tarea.', array('status' => 400));
    $worker = $wpdb->get_row($wpdb->prepare("SELECT id FROM " . progreso_equip_table('workers') . " WHERE name = %s", $worker_name), ARRAY_A);
    if (!$worker) return new WP_Error('invalid_data', 'No existe esa persona.', array('status' => 400));

    $date = sanitize_text_field((string) $request->get_param('date'));
    if (!$date || !strtotime($date)) return new WP_Error('invalid_data', 'Fecha no válida.', array('status' => 400));
    $date = date('Y-m-d', strtotime($date));

    $task_type_id = sanitize_text_field((string) $request->get_param('taskTypeId'));
    $custom_text = trim((string) $request->get_param('customText'));
    $params = array();
    if ($custom_text !== '') {
        $task_type_id = 'custom';
        $params['texto'] = sanitize_text_field($custom_text);
    } elseif ($task_type_id === '') {
        return new WP_Error('invalid_data', 'Elige un tipo del catálogo o escribe un texto.', array('status' => 400));
    }
    $notas = trim((string) $request->get_param('notas'));
    if ($notas !== '') $params['notas'] = sanitize_text_field($notas);

    $monday = progreso_equip_monday_of($date);
    $week_id = progreso_equip_ensure_week_simple($monday, (bool) $comp['is_test']);
    $assignment_id = progreso_equip_ensure_assignment($week_id, intval($worker['id']));

    $wpdb->insert(progreso_equip_table('tasks'), array(
        'assignment_id' => $assignment_id, 'task_type_id' => $task_type_id, 'task_date' => $date,
        'params' => wp_json_encode($params), 'done' => 0, 'status' => 'pendiente', 'original_date' => $date,
        'competition_id' => $comp_id, 'manual' => 1,
        'created_by' => progreso_equip_actor($request), 'created_at' => current_time('mysql'),
    ), array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%d', '%s', '%s'));

    return rest_ensure_response(array('success' => true, 'id' => $wpdb->insert_id));
}

function progreso_equip_insert_comp_task($assignment_id, $task_type_id, $date, $competition_id, $params = array()) {
    global $wpdb;
    $wpdb->insert(progreso_equip_table('tasks'), array(
        'assignment_id' => $assignment_id, 'task_type_id' => $task_type_id, 'task_date' => $date,
        'params' => wp_json_encode($params), 'done' => 0, 'status' => 'pendiente',
        'original_date' => $date, 'competition_id' => $competition_id,
    ), array('%d', '%s', '%s', '%s', '%d', '%s', '%s', '%d'));
}

// Crea la tarea de compe SOLO si no existe ya una de ese mismo tipo pensada para esa misma
// fecha original — `original_date` no cambia nunca al mover una tarea (solo `task_date`
// cambia), así que es la identidad estable que sobrevive a que cowork/Álvaro la hayan movido de
// persona o de día, la hayan hecho o la hayan aplazado. Si ya existe, no se toca para nada (ni
// se borra ni se recrea) — cowork, 2/11 19:45: regenerar el plan borraba el reparto a mano.
function progreso_equip_ensure_comp_task($assignment_id, $task_type_id, $date, $competition_id, $params, &$existentes, &$creadas, &$conservadas) {
    $clave = $task_type_id . '|' . $date;
    if (isset($existentes[$clave])) {
        unset($existentes[$clave]);
        $conservadas++;
        return;
    }
    progreso_equip_insert_comp_task($assignment_id, $task_type_id, $date, $competition_id, $params);
    $creadas++;
}

// POST /equipacion/competitions/{id}/generate-plan — plan inverso automático (encargo
// "Preparador de compes", Ramiro 1/11): diseño/material, limpieza/inscripciones, desequipar
// (Cueva primero, resto desde el miércoles) y equipar la semana antes, los días de la propia
// compe, y el cierre después — todo a Álvaro (responsable), que lo reparte arrastrando como el
// resto de Organización. Respeta `club_days` (un festivo "cierra" no lleva tareas) y no manda
// nada a nadie fuera del equipo. Si ya había un plan generado, se borra y se vuelve a crear
// (no duplica si se pulsa dos veces).
function progreso_equip_competition_generate_plan($request) {
    global $wpdb;
    progreso_equip_ensure_tables();
    $id = intval($request['id']);
    $comp = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . progreso_equip_table('competitions') . " WHERE id = %d", $id), ARRAY_A);
    if (!$comp) return new WP_Error('not_found', 'Competición no encontrada.', array('status' => 404));

    $lead = $wpdb->get_row("SELECT * FROM " . progreso_equip_table('workers') . " WHERE is_lead = 1 AND active = 1 ORDER BY id ASC LIMIT 1", ARRAY_A);
    if (!$lead) return new WP_Error('no_lead', 'No hay ningún responsable (is_lead) activo configurado en Equipación.', array('status' => 400));

    // Las tareas de compe que ya existan se dejan en paz (ver progreso_equip_ensure_comp_task) —
    // ya no se borra todo a lo bruto antes de recrear. Solo al final se limpian las que ya no
    // encajan con el plan actual Y nadie ha tocado todavía (sin hacer, sin mover, en su sitio).
    $tasks_table = progreso_equip_table('tasks');
    $assignments_table = progreso_equip_table('assignments');
    $existentes_rows = $wpdb->get_results($wpdb->prepare(
        "SELECT t.*, a.worker_id FROM {$tasks_table} t JOIN {$assignments_table} a ON a.id = t.assignment_id WHERE t.competition_id = %d",
        $id
    ), ARRAY_A);
    $existentes = array();
    foreach ($existentes_rows as $t) { $existentes[$t['task_type_id'] . '|' . $t['original_date']] = $t; }

    $today = current_time('Y-m-d');
    $comp_date = $comp['comp_date'];
    $comp_end = $comp['comp_end_date'] ?: $comp_date;
    $comp_monday = progreso_equip_monday_of($comp_date);
    $s0_monday = date('Y-m-d', strtotime($comp_monday) - 7 * 86400);
    $s1_monday = date('Y-m-d', strtotime($s0_monday) - 7 * 86400);
    $s2_monday = date('Y-m-d', strtotime($s0_monday) - 14 * 86400);
    // La semana de diseño/revisar material arranca "leadWeeks" semanas antes de la compe (el
    // campo "Semanas de antelación" del formulario de creación) — antes era siempre fija, sin
    // usar ese campo para nada (cowork, 4/11 07:20). Mínimo 3: por debajo no queda sitio para
    // una semana de diseño distinta de la de limpieza (s2, que siempre es comp-3 semanas) sin
    // mover también las semanas de prep/equipar, que son fijas — mismo mínimo que ahora exige
    // el formulario (cowork, 4/11 08:30: con leadWeeks 1 y 2 seguía dando comp-3 semanas igual,
    // mi primer intento de arreglo solo movía la fecha interna sin bajar el mínimo real).
    $lead_weeks = max(3, intval($comp['lead_weeks']) ?: 3);
    $s3_monday = date('Y-m-d', strtotime($comp_monday) - $lead_weeks * 7 * 86400);
    $after_monday = date('Y-m-d', strtotime($comp_monday) + 7 * 86400);
    // Si la semana de diseño ya ha pasado (no queda runway desde hoy), o coincide con la de
    // limpieza/inscripciones (leadWeeks = 3 exactas), se juntan en una sola — confirmado con cowork (1/11
    // 17:20) como regla general.
    $diseno_monday = (strtotime($s3_monday) < strtotime($today) || strtotime($s3_monday) >= strtotime($s2_monday)) ? $s2_monday : $s3_monday;

    $fases = array();
    if ($diseno_monday === $s2_monday) {
        $fases[] = array('monday' => $diseno_monday, 'tipos' => array('comp_disenar_bloques', 'comp_revisar_material', 'comp_limpieza_presas', 'comp_puntuacion', 'comp_inscripciones'));
    } else {
        $fases[] = array('monday' => $diseno_monday, 'tipos' => array('comp_disenar_bloques', 'comp_revisar_material'));
        $fases[] = array('monday' => $s2_monday, 'tipos' => array('comp_limpieza_presas', 'comp_puntuacion', 'comp_inscripciones'));
    }
    // S-1: preparar el montaje de la zona de público/premios y decidir quién prueba los
    // bloques (forerunners), confirmado con cowork — antes no estaba.
    $fases[] = array('monday' => $s1_monday, 'tipos' => array('comp_prep_montaje', 'comp_decidir_forerunners'));
    // Semana antes de la compe: orden fijo confirmado por cowork tras probar el primer reparto
    // (1/11 18:00) — zona por zona (desequipar y volver a equipar esa misma zona antes de pasar
    // a la siguiente), no "desequipar todo y luego equipar todo": eso dejaba la foto de un
    // bloque antes de que estuviera equipado. Si el miércoles de esa semana hay un `evento` que
    // ocupa la sala por la mañana (p. ej. la visita del ACE), se avisa en la propia tarea para
    // que el desequipado del resto de zonas se haga por la tarde (Ramiro, 1/11 17:20: que lo lea
    // del calendario, no un día fijo en texto).
    $dias_s0 = array();
    for ($i = 0; $i < 5; $i++) $dias_s0[] = date('Y-m-d', strtotime($s0_monday) + $i * 86400);
    $evento_miercoles = $wpdb->get_row($wpdb->prepare(
        "SELECT nombre, horario FROM " . blokes_club_days_table() . " WHERE tipo = 'evento' AND fecha = %s", $dias_s0[2]
    ), ARRAY_A);
    $nota_resto = $evento_miercoles ? trim("Por la tarde: {$evento_miercoles['nombre']} ({$evento_miercoles['horario']})") : '';
    $fases[] = array('monday' => $s0_monday, 'items' => array(
        array('date' => $dias_s0[0], 'tipo' => 'comp_desequipar_cueva'),
        array('date' => $dias_s0[1], 'tipo' => 'comp_equipar_bloques', 'params' => array('notas' => 'Cueva')),
        array('date' => $dias_s0[2], 'tipo' => 'comp_desequipar_resto', 'params' => $nota_resto ? array('notas' => $nota_resto) : array()),
        array('date' => $dias_s0[3], 'tipo' => 'comp_equipar_bloques', 'params' => array('notas' => 'resto de zonas')),
        array('date' => $dias_s0[4], 'tipo' => 'comp_numeracion'),
        array('date' => $dias_s0[4], 'tipo' => 'comp_forerunning'),
        array('date' => $dias_s0[4], 'tipo' => 'comp_foto_bloque'),
    ));
    $fases[] = array('monday' => $comp_monday, 'rango' => array($comp_date, $comp_end), 'tipos' => array('comp_dia_abrir', 'comp_dia_juzgar', 'comp_dia_cerrar'));
    $fases[] = array('monday' => $after_monday, 'tipos' => array('comp_desmontar', 'comp_fotos_redes', 'comp_resultados_web'));

    $warnings = array();
    $creadas = 0;
    $conservadas = 0;
    $is_test = (bool) $comp['is_test'];
    foreach ($fases as $fase) {
        // Solo S0 (desequipar/equipar, con 'items') y los propios días de la compe (con
        // 'rango') son semanas de compe intensiva — solo el responsable, como siempre. El resto
        // (diseño, limpieza, prep. montaje, cierre/redes) lleva también el reparto normal.
        $solo_compe = isset($fase['items']) || isset($fase['rango']);
        list($week_id, $assignment_id) = progreso_equip_ensure_week_for_lead($fase['monday'], $lead, $is_test, $warnings, $solo_compe);
        if (!$assignment_id) continue; // semana real/prueba en conflicto: ya avisado, se salta

        if (isset($fase['rango'])) {
            $d = $fase['rango'][0];
            while (strtotime($d) <= strtotime($fase['rango'][1])) {
                if (!progreso_equip_dia_cerrado($d)) {
                    foreach ($fase['tipos'] as $tipo) {
                        progreso_equip_ensure_comp_task($assignment_id, $tipo, $d, $id, array(), $existentes, $creadas, $conservadas);
                    }
                } else {
                    $warnings[] = "{$d} está marcado como cierre en el calendario del club: sin tareas de compe ese día.";
                }
                $d = date('Y-m-d', strtotime($d) + 86400);
            }
            continue;
        }

        // Orden explícito (día + tipo fijados uno a uno), para fases donde importa la secuencia
        // — de momento solo la semana de desequipar/equipar.
        if (isset($fase['items'])) {
            foreach ($fase['items'] as $item) {
                if (progreso_equip_dia_cerrado($item['date'])) {
                    $warnings[] = "{$item['date']} está marcado como cierre en el calendario del club: sin tareas de compe ese día.";
                    continue;
                }
                progreso_equip_ensure_comp_task($assignment_id, $item['tipo'], $item['date'], $id, $item['params'] ?? array(), $existentes, $creadas, $conservadas);
            }
            continue;
        }

        $offsets = $fase['dias'] ?? range(0, 4); // lun-vie por defecto
        $fechas = array();
        foreach ($offsets as $offset) {
            $d = date('Y-m-d', strtotime($fase['monday']) + $offset * 86400);
            if (!progreso_equip_dia_cerrado($d)) $fechas[] = $d;
        }
        if (empty($fechas)) { $fechas[] = $fase['monday']; $warnings[] = "Semana del {$fase['monday']}: todos sus días estaban cerrados, se usó el lunes igualmente."; }
        $n = count($fechas);
        foreach ($fase['tipos'] as $i => $tipo) {
            progreso_equip_ensure_comp_task($assignment_id, $tipo, $fechas[$i % $n], $id, array(), $existentes, $creadas, $conservadas);
        }
    }

    // Lo que quede en $existentes ya no encaja con el plan actual (p. ej. cambió la fecha de la
    // compe). Si nadie lo tocó todavía, se borra (es ruido de una generación anterior); si ya se
    // hizo, se movió o se aplazó, se deja y solo se avisa — igual que con las que sí encajan,
    // nunca se borra trabajo real por regenerar el plan.
    $borradas = 0;
    foreach ($existentes as $t) {
        // Ramiro 12/11 10:44: una tarea puesta a mano ("+ Tarea") no se borra nunca al
        // regenerar, aunque por casualidad coincida tipo+fecha con una fase del plan actual.
        $tocada = $t['manual'] || $t['done'] || $t['status'] !== 'pendiente' || $t['task_date'] !== $t['original_date']
            || intval($t['worker_id']) !== intval($lead['id']) || $t['moved_to_task_id'];
        if ($tocada) {
            $warnings[] = "La tarea «{$t['task_type_id']}» del {$t['original_date']} ya no está en el plan actual, pero como ya se tocó (movida, hecha o aplazada) no se ha borrado — revísala a mano si ya no hace falta.";
            continue;
        }
        $wpdb->delete(progreso_equip_table('tasks'), array('id' => intval($t['id'])), array('%d'));
        $borradas++;
    }

    return rest_ensure_response(array('success' => true, 'tasksCreated' => $creadas, 'tasksKept' => $conservadas, 'tasksRemoved' => $borradas, 'warnings' => $warnings));
}

// GET /equipacion/competitions/{id}/plan — el plan generado, para "Mi parte" (cada persona
// filtra lo suyo por workerId) y el tablero de Álvaro (% hecho, retrasado en rojo).
function progreso_equip_get_competition_plan($request) {
    global $wpdb;
    $id = intval($request['id']);
    $tasks = $wpdb->get_results($wpdb->prepare(
        "SELECT t.*, a.worker_id, w.name as worker_name, wk.start_date as week_start FROM " . progreso_equip_table('tasks') . " t
         JOIN " . progreso_equip_table('assignments') . " a ON a.id = t.assignment_id
         JOIN " . progreso_equip_table('workers') . " w ON w.id = a.worker_id
         JOIN " . progreso_equip_table('weeks') . " wk ON wk.id = a.week_id
         WHERE t.competition_id = %d ORDER BY t.task_date ASC, t.id ASC", $id
    ), ARRAY_A);
    $today = current_time('Y-m-d');
    $hechas = 0; $retrasadas = 0;
    $out = array();
    foreach ($tasks as $t) {
        if ($t['done']) $hechas++;
        elseif (strtotime($t['task_date']) < strtotime($today)) $retrasadas++;
        $out[] = array(
            'id' => intval($t['id']), 'taskTypeId' => $t['task_type_id'], 'date' => $t['task_date'],
            'weekStart' => $t['week_start'], 'workerId' => intval($t['worker_id']), 'workerName' => $t['worker_name'],
            'done' => (bool) $t['done'], 'assignmentId' => intval($t['assignment_id']),
            'manual' => (bool) $t['manual'], 'params' => $t['params'] ? (json_decode($t['params'], true) ?: array()) : array(),
        );
    }
    $total = count($tasks);

    // Punto 7 (Ramiro, 11/11 05:01): el plan de la compe en columnas por equipador necesita
    // también los bloques, no solo las tareas — antes solo salían en el mapa.
    $blocks = $wpdb->get_results($wpdb->prepare(
        "SELECT id, number, equipador, subzone, tested FROM " . progreso_equip_table('comp_blocks') . " WHERE competition_id = %d ORDER BY number ASC", $id
    ), ARRAY_A);
    $out_blocks = array_map(function($b) {
        return array(
            'id' => intval($b['id']), 'number' => intval($b['number']), 'equipador' => $b['equipador'],
            'subzone' => $b['subzone'] !== null ? intval($b['subzone']) : null, 'tested' => (bool) $b['tested'],
        );
    }, $blocks);

    return rest_ensure_response(array('success' => true, 'data' => array(
        'tasks' => $out, 'total' => $total, 'hechas' => $hechas, 'retrasadas' => $retrasadas,
        'pctHecho' => $total ? round($hechas / $total * 100) : 0,
        'blocks' => $out_blocks,
    )));
}

// ============================================================
//  superadmin/v1 — CTRL Time Off (Supervisión, solo socios)
//  plan oficial de vacaciones, escenarios guardados y solicitudes
//  (importadas del fichaje externo o metidas a mano)
// ============================================================

define('TIMEOFF_MAX_JSON', 300000); // bytes por plan/escenario

add_action('rest_api_init', function() {
    $socio_perm = function() { return blokes_get_app_role() === 'socio'; };

    register_rest_route('superadmin/v1', '/timeoff', array(
        'methods'             => 'GET',
        'callback'            => 'timeoff_get_all',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/timeoff/plan', array(
        'methods'             => 'PUT',
        'callback'            => 'timeoff_save_plan',
        'permission_callback' => $socio_perm,
    ));
    // Configuración real del año (paro, llaves, días, cierre): la que vale para aprobar.
    // El plan de arriba es el del simulador.
    register_rest_route('superadmin/v1', '/timeoff/real', array(
        'methods'             => 'PUT',
        'callback'            => 'timeoff_save_real',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/timeoff/scenarios', array(
        'methods'             => 'POST',
        'callback'            => 'timeoff_add_scenario',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/timeoff/scenarios/(?P<id>[a-z0-9-]+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'timeoff_delete_scenario',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/timeoff/requests', array(
        'methods'             => 'POST',
        'callback'            => 'timeoff_add_requests',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/timeoff/requests/(?P<id>[a-z0-9-]+)', array(
        array(
            'methods'             => 'PUT',
            'callback'            => 'timeoff_update_request',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'timeoff_delete_request',
            'permission_callback' => $socio_perm,
        ),
    ));
});

function timeoff_user_name() {
    $u = wp_get_current_user();
    if (!$u || !$u->ID) return '';
    $first = explode(' ', trim((string) $u->display_name))[0];
    return $first !== '' ? $first : $u->user_login;
}

function timeoff_get_option($key) {
    $v = get_option($key, array());
    return is_array($v) ? $v : array();
}

// El plan es el estado de la calculadora (JSON del frontend): se guarda tal cual,
// validado como objeto y con tamaño máximo.
function timeoff_clean_state($state) {
    if (!is_array($state)) return null;
    $json = wp_json_encode($state);
    if ($json === false || strlen($json) > TIMEOFF_MAX_JSON) return null;
    return json_decode($json, true);
}

function timeoff_valid_date($d) {
    if (!is_string($d) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) return false;
    return checkdate((int) substr($d, 5, 2), (int) substr($d, 8, 2), (int) substr($d, 0, 4));
}

function timeoff_clean_request($r) {
    $person = mb_substr(trim(sanitize_text_field($r['person'] ?? '')), 0, 60);
    $from   = $r['from'] ?? '';
    $to     = $r['to'] ?? $from;
    if ($person === '' || !timeoff_valid_date($from) || !timeoff_valid_date($to) || $to < $from) return null;
    $status = in_array($r['status'] ?? '', array('pendiente', 'aprobada', 'rechazada'), true) ? $r['status'] : 'pendiente';
    $canal  = in_array($r['canal'] ?? '', array('app', 'fichero', 'mensaje', 'llamada', 'otro'), true) ? $r['canal'] : 'otro';
    return array(
        'person' => $person,
        'from'   => $from,
        'to'     => $to,
        'status' => $status,
        'canal'  => $canal,
        'nota'   => mb_substr(sanitize_text_field($r['nota'] ?? ''), 0, 300),
    );
}

function timeoff_get_all() {
    $plan = get_option('blokes_timeoff_plan', null);
    $real = get_option('blokes_timeoff_real', null);
    return rest_ensure_response(array(
        'success'   => true,
        'plan'      => is_array($plan) ? $plan['state'] : null,
        'plan_meta' => is_array($plan) ? array('updated_at' => $plan['updated_at'], 'by' => $plan['by']) : null,
        'real'      => is_array($real) ? $real['state'] : null,
        'real_meta' => is_array($real) ? array('updated_at' => $real['updated_at'], 'by' => $real['by']) : null,
        'scenarios' => array_values(timeoff_get_option('blokes_timeoff_scenarios')),
        'requests'  => array_values(timeoff_get_option('blokes_timeoff_requests')),
        'nueve'     => nueve_public(),
    ));
}

function timeoff_save_plan($request) {
    $body  = $request->get_json_params();
    $state = timeoff_clean_state($body['plan'] ?? null);
    if ($state === null) return new WP_Error('invalid_plan', 'Plan no válido o demasiado grande', array('status' => 400));
    $plan = array('state' => $state, 'updated_at' => current_time('mysql'), 'by' => timeoff_user_name());
    update_option('blokes_timeoff_plan', $plan, false);
    return rest_ensure_response(array('success' => true, 'plan_meta' => array('updated_at' => $plan['updated_at'], 'by' => $plan['by'])));
}

function timeoff_save_real($request) {
    $body  = $request->get_json_params();
    $state = timeoff_clean_state($body['real'] ?? null);
    if ($state === null) return new WP_Error('invalid_real', 'Configuración no válida o demasiado grande', array('status' => 400));
    $real = array('state' => $state, 'updated_at' => current_time('mysql'), 'by' => timeoff_user_name());
    update_option('blokes_timeoff_real', $real, false);
    return rest_ensure_response(array('success' => true, 'real_meta' => array('updated_at' => $real['updated_at'], 'by' => $real['by'])));
}

function timeoff_add_scenario($request) {
    $body  = $request->get_json_params();
    $name  = mb_substr(trim(sanitize_text_field($body['name'] ?? '')), 0, 80);
    $state = timeoff_clean_state($body['state'] ?? null);
    if ($name === '' || $state === null) return new WP_Error('invalid_scenario', 'Indica un nombre y un plan válido', array('status' => 400));
    $list = timeoff_get_option('blokes_timeoff_scenarios');
    if (count($list) >= 30) return new WP_Error('too_many', 'Máximo 30 escenarios: borra alguno', array('status' => 400));
    $sc = array('id' => wp_generate_uuid4(), 'name' => $name, 'state' => $state, 'saved_at' => current_time('mysql'), 'by' => timeoff_user_name());
    $list[] = $sc;
    update_option('blokes_timeoff_scenarios', $list, false);
    return rest_ensure_response(array('success' => true, 'scenario' => $sc));
}

function timeoff_delete_scenario($request) {
    $id   = $request['id'];
    $list = array_values(array_filter(timeoff_get_option('blokes_timeoff_scenarios'), function($s) use ($id) { return $s['id'] !== $id; }));
    update_option('blokes_timeoff_scenarios', $list, false);
    return rest_ensure_response(array('success' => true));
}

// Alta de una o varias solicitudes (manual o importadas). Se ignoran las repetidas
// (misma persona y fechas).
function timeoff_add_requests($request) {
    $body  = $request->get_json_params();
    $items = $body['requests'] ?? array();
    if (!is_array($items) || count($items) > 500) return new WP_Error('invalid_requests', 'Lista de solicitudes no válida', array('status' => 400));
    $list = timeoff_get_option('blokes_timeoff_requests');
    $added = array(); $skipped = 0; $invalid = 0;
    foreach ($items as $raw) {
        $r = timeoff_clean_request(is_array($raw) ? $raw : array());
        if (!$r) { $invalid++; continue; }
        $ext = intval($raw['ext_id'] ?? 0);
        if ($ext > 0) { $r['ext_source'] = '9to5'; $r['ext_id'] = $ext; }
        $dup = false;
        foreach ($list as $x) {
            if ($ext > 0 && ($x['ext_source'] ?? '') === '9to5' && intval($x['ext_id'] ?? 0) === $ext) { $dup = true; break; }
            if (mb_strtolower($x['person']) === mb_strtolower($r['person']) && $x['from'] === $r['from'] && $x['to'] === $r['to']) { $dup = true; break; }
        }
        if ($dup) { $skipped++; continue; }
        $r['id']         = wp_generate_uuid4();
        $r['created_at'] = current_time('mysql');
        $r['by']         = timeoff_user_name();
        $list[]  = $r;
        $added[] = $r;
    }
    update_option('blokes_timeoff_requests', $list, false);
    return rest_ensure_response(array('success' => true, 'added' => $added, 'skipped' => $skipped, 'invalid' => $invalid, 'requests' => array_values($list)));
}

function timeoff_update_request($request) {
    $id   = $request['id'];
    $body = $request->get_json_params();
    $list = timeoff_get_option('blokes_timeoff_requests');
    foreach ($list as $i => $x) {
        if ($x['id'] !== $id) continue;
        $body = is_array($body) ? $body : array();
        $r = timeoff_clean_request(array_merge($x, $body));
        if (!$r) return new WP_Error('invalid_request', 'Datos no válidos', array('status' => 400));
        $comment = mb_substr(sanitize_text_field($body['review_comment'] ?? ''), 0, 1000);
        if (($x['ext_source'] ?? '') === '9to5' && !empty($x['ext_id'])) {
            // Las fechas y la persona mandan en 9to5: aquí solo se decide
            $r = array_merge($r, array('person' => $x['person'], 'from' => $x['from'], 'to' => $x['to']));
            if ($r['status'] !== $x['status']) {
                if ($r['status'] === 'pendiente') {
                    return new WP_Error('nueve_pendiente', 'En 9to5 una solicitud resuelta no puede volver a pendiente', array('status' => 422));
                }
                $upd = nueve_review($x, $r['status'], $comment);
                if (is_wp_error($upd)) return $upd;
                $r = array_merge($r, $upd, array('person' => $x['person']));
            }
        }
        if ($comment !== '') $r['review_comment'] = $comment;
        $list[$i] = array_merge($x, $r, array('updated_at' => current_time('mysql'), 'updated_by' => timeoff_user_name()));
        update_option('blokes_timeoff_requests', $list, false);
        return rest_ensure_response(array('success' => true, 'request' => $list[$i]));
    }
    return new WP_Error('not_found', 'Solicitud no encontrada', array('status' => 404));
}

function timeoff_delete_request($request) {
    $id   = $request['id'];
    $list = array_values(array_filter(timeoff_get_option('blokes_timeoff_requests'), function($x) use ($id) { return $x['id'] !== $id; }));
    update_option('blokes_timeoff_requests', $list, false);
    return rest_ensure_response(array('success' => true));
}

// ============================================================
//  CTRL Time Off ↔ 9to5 (app de fichaje externa)
//  La clave de API y el secreto del webhook se guardan solo aquí (opción
//  blokes_9to5_config); nunca se devuelven al navegador.
//  Doc: https://9to5.click/api/v1/docs
// ============================================================

define('NUEVE_API', 'https://9to5.click/api/v1');

add_action('rest_api_init', function() {
    $socio_perm = function() { return blokes_get_app_role() === 'socio'; };

    register_rest_route('superadmin/v1', '/timeoff/9to5', array(
        array(
            'methods'             => 'GET',
            'callback'            => function() { return rest_ensure_response(array('success' => true, 'nueve' => nueve_public())); },
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'PUT',
            'callback'            => 'nueve_save_settings',
            'permission_callback' => $socio_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/timeoff/9to5/test', array(
        'methods'             => 'POST',
        'callback'            => 'nueve_test',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/timeoff/9to5/sync', array(
        'methods'             => 'POST',
        'callback'            => 'nueve_sync_endpoint',
        'permission_callback' => $socio_perm,
    ));
    // Avisos de 9to5: público, se valida con la firma HMAC
    register_rest_route('timeoff/v1', '/9to5-webhook', array(
        'methods'             => 'POST',
        'callback'            => 'nueve_webhook',
        'permission_callback' => '__return_true',
    ));
});

// Sincronización automática cada hora
add_action('init', function() {
    if (!wp_next_scheduled('blokes_9to5_sync')) wp_schedule_event(time() + 300, 'hourly', 'blokes_9to5_sync');
});

// Semana actual y la siguiente de Organización, creadas solas si nadie lo hizo a mano (paso 3
// del encargo de Equipación del 28/10: "si Álvaro no hace nada, la semana existe igual"). La
// propia función es idempotente (no toca nada si la semana ya existe), así que basta con
// comprobarlo una vez al día — no hace falta que sea justo el domingo, solo que nunca falte.
// También se dispara al abrir Organización (progreso_equip_get_config), por si el cron tarda.
add_action('init', function() {
    if (!wp_next_scheduled('blokes_equip_autocrear_semanas')) wp_schedule_event(time() + 600, 'daily', 'blokes_equip_autocrear_semanas');
});
add_action('blokes_equip_autocrear_semanas', 'progreso_equip_autocrear_semanas');
add_action('blokes_9to5_sync', function() {
    $c = nueve_config();
    if (!empty($c['api_key'])) nueve_sync(false);
});

// Sync Grupos ⇄ Excel, paso 2 (NOTAS_PARA_CODE_sync_grupos.md): revisa la Hoja activa (prueba o
// real, según el interruptor) cada hora y deja en la bandeja lo que haya cambiado. "hourly" es
// el intervalo más corto que trae WordPress de serie — cae dentro de lo pedido ("cada 1-2h").
add_action('init', function() {
    if (!wp_next_scheduled('blokes_sync_grupos_cron')) wp_schedule_event(time() + 900, 'hourly', 'blokes_sync_grupos_cron');
});
add_action('blokes_sync_grupos_cron', function() {
    if (get_option('blokes_sync_grupos_sheet_prueba_id', '') || get_option('blokes_sync_grupos_sheet_real_id', '')) {
        blokes_sync_grupos_sincronizar();
    }
});

// Precio de catálogo desactualizado en la variación 4673 (M-J Menores 17:30-18:30): mostraba
// 86 € en wc-admin/Gestor de horarios, pero el formulario ya cobraba bien 57 € (vía Ajustes) —
// solo confundía al mirar el catálogo, el cobro real nunca fue el erróneo (cowork, 3/11 21:00).
// Migración de una sola vez, mismo patrón que el resto de arreglos de este fichero.
add_action('init', function() {
    if (get_option('blokes_fix_variacion_4673_precio')) return;
    if (function_exists('wc_get_product')) {
        $v = wc_get_product(4673);
        if ($v) {
            $v->set_regular_price('57');
            $v->save();
            update_post_meta(4673, '_subscription_price', '57');
        }
    }
    update_option('blokes_fix_variacion_4673_precio', 1, false);
});

// Variación duplicada 6706 "Children" (L-X Menores): confirmado por cowork que tiene 0
// suscripciones (la 6707 "Menores" sí tiene 2) — se pasa a privada, nunca se borra, igual que el
// resto de variaciones sin uso que ya se limpiaron a mano (cowork, 4/11 04:30).
add_action('init', function() {
    if (get_option('blokes_fix_variacion_6706_privada')) return;
    if (function_exists('wc_get_product')) {
        $v = wc_get_product(6706);
        if ($v) {
            $v->set_status('private');
            $v->save();
        }
    }
    update_option('blokes_fix_variacion_6706_privada', 1, false);
});

function nueve_config() {
    $c = get_option('blokes_9to5_config', array());
    return is_array($c) ? $c : array();
}

function nueve_save_config($c) {
    update_option('blokes_9to5_config', $c, false);
}

// Lo que ve el navegador: nunca la clave ni el secreto
function nueve_public() {
    $c   = nueve_config();
    $key = (string) ($c['api_key'] ?? '');
    return array(
        'configured'   => $key !== '',
        'key_tail'     => $key !== '' ? substr($key, -4) : '',
        'has_secret'   => !empty($c['webhook_secret']),
        'last_sync'    => $c['last_sync'] ?? null,
        'last_counts'  => $c['last_counts'] ?? null,
        'last_error'   => $c['last_error'] ?? '',
        'warnings'     => $c['warnings'] ?? array(),
        'employee_map' => (object) ($c['employee_map'] ?? array()),
        'employees'    => $c['employees'] ?? array(),
        'holidays'     => $c['holidays'] ?? array(),
        'balances'     => (object) ($c['balances'] ?? array()),
        'last_webhook' => $c['last_webhook'] ?? null,
        'webhook_url'  => rest_url('timeoff/v1/9to5-webhook'),
    );
}

function nueve_request($method, $path, $body = null) {
    $c = nueve_config();
    if (empty($c['api_key'])) return new WP_Error('nueve_sin_clave', 'Falta la clave de API de 9to5', array('status' => 400));
    $args = array(
        'method'  => $method,
        'timeout' => 20,
        'headers' => array(
            'Authorization'   => 'Bearer ' . $c['api_key'],
            'Accept'          => 'application/json',
            'Accept-Language' => 'es',
        ),
    );
    if ($body !== null) {
        $args['headers']['Content-Type'] = 'application/json';
        $args['body'] = wp_json_encode($body);
    }
    $res = wp_remote_request(NUEVE_API . $path, $args);
    if (is_wp_error($res)) {
        return new WP_Error('nueve_red', 'No se pudo conectar con 9to5: ' . $res->get_error_message(), array('status' => 502));
    }
    $code = (int) wp_remote_retrieve_response_code($res);
    $json = json_decode(wp_remote_retrieve_body($res), true);
    if ($code < 200 || $code >= 300) {
        $msg = (is_array($json) && !empty($json['message'])) ? $json['message'] : "HTTP $code";
        return new WP_Error('nueve_http', "9to5: $msg", array('status' => $code === 422 ? 422 : 502, 'nueve_code' => $code));
    }
    return is_array($json) ? $json : array();
}

// Todas las páginas de un listado
function nueve_list($path, $query = array()) {
    $out  = array();
    $page = 1;
    do {
        $q    = array_merge($query, array('page' => $page, 'per_page' => 200));
        $json = nueve_request('GET', $path . '?' . http_build_query($q));
        if (is_wp_error($json)) return $json;
        $out  = array_merge($out, is_array($json['data'] ?? null) ? $json['data'] : array());
        $last = intval($json['meta']['last_page'] ?? 1);
        $page++;
    } while ($page <= $last && $page <= 50);
    return $out;
}

function nueve_status($s) {
    if (in_array($s, array('pending', 'in_review'), true)) return 'pendiente';
    if ($s === 'approved') return 'aprobada';
    return 'rechazada'; // rejected, cancelled, revoked (el original queda en ext_status)
}

function nueve_es_vacaciones($type) {
    $t = function_exists('iconv') ? strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string) $type)) : strtolower((string) $type);
    return strpos($t, 'vacac') !== false;
}

// Solicitud de 9to5 → nuestra solicitud. Solo vacaciones de días completos con fin.
function nueve_map_petition($p, $map) {
    if (!is_array($p) || empty($p['id']) || !nueve_es_vacaciones($p['type'] ?? '')) return null;
    if (empty($p['full_day']) || !empty($p['open_ended']) || empty($p['to'])) return null;
    $from = substr((string) $p['from'], 0, 10);
    $to   = substr((string) $p['to'], 0, 10);
    if (!timeoff_valid_date($from) || !timeoff_valid_date($to) || $to < $from) return null;
    $emp    = (string) intval($p['employee_id'] ?? 0);
    $person = isset($map[$emp]) && $map[$emp] !== '' ? $map[$emp] : (string) ($p['employee_name'] ?? '');
    return array(
        'person'            => mb_substr(sanitize_text_field($person), 0, 60),
        'from'              => $from,
        'to'                => $to,
        'status'            => nueve_status($p['status'] ?? ''),
        'canal'             => 'app',
        'nota'              => mb_substr(sanitize_text_field($p['comment'] ?? ''), 0, 300),
        'ext_source'        => '9to5',
        'ext_id'            => intval($p['id']),
        'ext_status'        => sanitize_text_field($p['status'] ?? ''),
        'ext_employee_id'   => intval($p['employee_id'] ?? 0),
        'ext_employee_name' => mb_substr(sanitize_text_field($p['employee_name'] ?? ''), 0, 80),
        'review_comment'    => mb_substr(sanitize_text_field($p['review_comment'] ?? ''), 0, 1000),
        'reviewed_by'       => mb_substr(sanitize_text_field($p['reviewed_by'] ?? ''), 0, 80),
        'ext_updated_at'    => sanitize_text_field($p['updated_at'] ?? ''),
    );
}

// Inserta o actualiza una solicitud de 9to5 en la lista. Devuelve array($list, 'added'|'updated'|null)
function nueve_upsert($list, $p, $map) {
    $r = nueve_map_petition($p, $map);
    if (!$r) return array($list, null);
    foreach ($list as $i => $x) {
        $same = (($x['ext_source'] ?? '') === '9to5' && intval($x['ext_id'] ?? 0) === $r['ext_id']);
        if (!$same) continue;
        $list[$i] = array_merge($x, $r, array('synced_at' => current_time('mysql')));
        return array($list, 'updated');
    }
    $req_at          = (string) ($p['requested_at'] ?? '');
    $r['id']         = wp_generate_uuid4();
    $r['created_at'] = strlen($req_at) >= 19 ? substr($req_at, 0, 10) . ' ' . substr($req_at, 11, 8) : current_time('mysql');
    $r['by']         = '9to5';
    $r['synced_at']  = current_time('mysql');
    $list[] = $r;
    return array($list, 'added');
}

function nueve_sync($full = false) {
    $c = nueve_config();
    if (empty($c['api_key'])) return new WP_Error('nueve_sin_clave', 'Falta la clave de API de 9to5', array('status' => 400));
    $started = current_time('c');
    $query   = array();
    if (!$full && !empty($c['last_sync'])) $query['updated_since'] = $c['last_sync'];

    $pets = nueve_list('/petitions', $query);
    if (is_wp_error($pets)) {
        $c['last_error'] = $pets->get_error_message();
        nueve_save_config($c);
        return $pets;
    }
    $map  = is_array($c['employee_map'] ?? null) ? $c['employee_map'] : array();
    $list = timeoff_get_option('blokes_timeoff_requests');
    $added = 0; $updated = 0;
    foreach ($pets as $p) {
        list($list, $what) = nueve_upsert($list, $p, $map);
        if ($what === 'added') $added++;
        elseif ($what === 'updated') $updated++;
    }
    update_option('blokes_timeoff_requests', $list, false);

    // Empleados, festivos y saldos: para casar personas, descontar festivos y comparar saldos.
    // Si a la clave le falta algún permiso, se avisa pero la sincronización sigue.
    $warnings = array();
    $emps = nueve_list('/employees');
    if (is_wp_error($emps)) $warnings[] = 'Empleados: ' . $emps->get_error_message();
    else {
        $c['employees'] = array_values(array_map(function($e) {
            return array(
                'id'        => intval($e['id'] ?? 0),
                'name'      => sanitize_text_field($e['name'] ?? ''),
                'last_name' => sanitize_text_field($e['last_name'] ?? ''),
                'active'    => !empty($e['active']),
            );
        }, $emps));
    }
    $y   = intval(current_time('Y'));
    $hol = nueve_list('/holidays', array('from' => $y . '-01-01', 'to' => ($y + 1) . '-12-31'));
    if (is_wp_error($hol)) $warnings[] = 'Festivos: ' . $hol->get_error_message();
    else {
        $c['holidays'] = array_values(array_map(function($h) {
            return array(
                'date'     => sanitize_text_field($h['date'] ?? ''),
                'name'     => sanitize_text_field($h['name'] ?? ''),
                'workable' => !empty($h['workable']),
            );
        }, $hol));
    }
    $balances = array();
    foreach (array($y, $y + 1) as $yr) {
        $bal = nueve_list('/vacation-balances', array('year' => $yr));
        if (is_wp_error($bal)) { $warnings[] = "Saldos $yr: " . $bal->get_error_message(); continue; }
        $balances[$yr] = array_values(array_map(function($b) {
            return array(
                'employee_id' => intval($b['employee_id'] ?? 0),
                'unit'        => sanitize_text_field($b['unit'] ?? ''),
                'entitled'    => isset($b['entitled']) ? intval($b['entitled']) : null,
                'taken'       => intval($b['taken'] ?? 0),
                'remaining'   => isset($b['remaining']) ? intval($b['remaining']) : null,
                'pending'     => intval($b['pending_requests'] ?? 0),
            );
        }, $bal));
    }
    if ($balances) $c['balances'] = $balances;

    $c['last_sync']   = $started;
    $c['last_counts'] = array('added' => $added, 'updated' => $updated);
    $c['last_error']  = '';
    $c['warnings']    = $warnings;
    nueve_save_config($c);
    return array('added' => $added, 'updated' => $updated, 'requests' => array_values($list));
}

function nueve_sync_endpoint($request) {
    $body = $request->get_json_params();
    $res  = nueve_sync(!empty($body['full']));
    if (is_wp_error($res)) return $res;
    return rest_ensure_response(array_merge(array('success' => true, 'nueve' => nueve_public()), $res));
}

// Guarda clave/secreto (solo si vienen) y la correspondencia empleado de 9to5 → persona
function nueve_save_settings($request) {
    $body = $request->get_json_params();
    $c    = nueve_config();
    if (!empty($body['clear'])) {
        unset($c['api_key'], $c['webhook_secret'], $c['last_sync']);
    }
    if (isset($body['api_key']) && trim($body['api_key']) !== '') {
        $key = trim($body['api_key']);
        if (!preg_match('/^9to5_[A-Za-z0-9]{20,100}$/', $key)) return new WP_Error('nueve_clave', 'La clave de API no tiene el formato de 9to5 (9to5_…)', array('status' => 400));
        if (($c['api_key'] ?? '') !== $key) unset($c['last_sync']); // clave nueva: sincronizar todo
        $c['api_key'] = $key;
    }
    if (isset($body['webhook_secret']) && trim($body['webhook_secret']) !== '') {
        $sec = trim($body['webhook_secret']);
        if (!preg_match('/^[A-Za-z0-9_\-]{16,200}$/', $sec)) return new WP_Error('nueve_secreto', 'El secreto del webhook no es válido', array('status' => 400));
        $c['webhook_secret'] = $sec;
    }
    if (isset($body['employee_map']) && is_array($body['employee_map'])) {
        $map = array();
        foreach ($body['employee_map'] as $emp => $person) {
            $person = mb_substr(trim(sanitize_text_field((string) $person)), 0, 60);
            if ($person !== '') $map[(string) intval($emp)] = $person;
        }
        $c['employee_map'] = $map;
        // Aplicar a las solicitudes ya sincronizadas
        $list = timeoff_get_option('blokes_timeoff_requests');
        foreach ($list as $i => $x) {
            if (($x['ext_source'] ?? '') !== '9to5') continue;
            $emp = (string) intval($x['ext_employee_id'] ?? 0);
            $list[$i]['person'] = isset($map[$emp]) ? $map[$emp] : ($x['ext_employee_name'] ?? $x['person']);
        }
        update_option('blokes_timeoff_requests', $list, false);
    }
    nueve_save_config($c);
    return rest_ensure_response(array('success' => true, 'nueve' => nueve_public(), 'requests' => array_values(timeoff_get_option('blokes_timeoff_requests'))));
}

// Prueba la clave (GET /me) y devuelve la IP pública del servidor (para limitar la clave a ella)
function nueve_test() {
    $me = nueve_request('GET', '/me');
    $ip = '';
    $r  = wp_remote_get('https://api.ipify.org?format=json', array('timeout' => 10));
    if (!is_wp_error($r)) {
        $j  = json_decode(wp_remote_retrieve_body($r), true);
        $ip = is_array($j) ? sanitize_text_field($j['ip'] ?? '') : '';
    }
    if (is_wp_error($me)) {
        return rest_ensure_response(array('success' => false, 'error' => $me->get_error_message(), 'ip' => $ip));
    }
    return rest_ensure_response(array('success' => true, 'me' => $me, 'ip' => $ip));
}

// Aprueba o rechaza en 9to5 una solicitud que vino de allí. Devuelve los campos actualizados o WP_Error.
function nueve_review($x, $status, $comment) {
    $action = $status === 'aprobada' ? 'approve' : 'reject';
    $body   = $comment !== '' ? array('comment' => $comment) : array();
    $res    = nueve_request('POST', '/petitions/' . intval($x['ext_id']) . '/' . $action, $body);
    if (is_wp_error($res)) return $res;
    $p = isset($res['data']) && is_array($res['data']) ? $res['data'] : $res;
    $c = nueve_config();
    $mapped = nueve_map_petition($p, is_array($c['employee_map'] ?? null) ? $c['employee_map'] : array());
    return $mapped ? $mapped : array('status' => $status, 'ext_status' => $status === 'aprobada' ? 'approved' : 'rejected');
}

function nueve_webhook($request) {
    $c      = nueve_config();
    $secret = (string) ($c['webhook_secret'] ?? '');
    if ($secret === '') return new WP_Error('nueve_sin_secreto', 'Webhook no configurado', array('status' => 503));

    $body = $request->get_body();
    $t = null; $v1 = null;
    foreach (explode(',', (string) $request->get_header('x-9to5-signature')) as $part) {
        $kv = array_pad(explode('=', trim($part), 2), 2, null);
        if ($kv[0] === 't') $t = $kv[1];
        elseif ($kv[0] === 'v1') $v1 = $kv[1];
    }
    $ok = $t && $v1 && abs(time() - (int) $t) < 300
        && hash_equals(hash_hmac('sha256', $t . '.' . $body, $secret), (string) $v1);
    if (!$ok) return new WP_Error('nueve_firma', 'Firma no válida', array('status' => 401));

    $evt      = json_decode($body, true);
    $evt      = is_array($evt) ? $evt : array();
    $delivery = (string) ($evt['id'] ?? $request->get_header('x-9to5-delivery'));
    $seen     = get_option('blokes_9to5_deliveries', array());
    $seen     = is_array($seen) ? $seen : array();
    if ($delivery !== '' && in_array($delivery, $seen, true)) {
        return rest_ensure_response(array('ok' => true, 'duplicate' => true));
    }

    $event = (string) ($evt['event'] ?? '');
    if (in_array($event, array('petition.created', 'petition.updated'), true)) {
        $list = timeoff_get_option('blokes_timeoff_requests');
        list($list, $what) = nueve_upsert($list, $evt['data'] ?? array(), is_array($c['employee_map'] ?? null) ? $c['employee_map'] : array());
        if ($what) update_option('blokes_timeoff_requests', $list, false);
    }

    if ($delivery !== '') {
        $seen[] = $delivery;
        update_option('blokes_9to5_deliveries', array_slice($seen, -300), false);
    }
    $c['last_webhook'] = array('at' => current_time('mysql'), 'event' => sanitize_text_field($event));
    nueve_save_config($c);
    return rest_ensure_response(array('ok' => true));
}

// ============================================================
//  superadmin/v1 — Presupuestos por zonas (Superadmin, solo socios)
//  zonas del local con sus medidas y partidas agrupadas por capítulo,
//  con precio propuesto, precio conseguido y estado hasta la compra
// ============================================================

define('PRESUP_ESTADOS', array('pedir', 'pendiente', 'aprobado', 'comprado', 'descartado'));
define('PRESUP_TIPOS',   array('referencia', 'estimación', 'tienda', 'presupuesto'));
define('PRESUP_MEDIDAS', array('suelo', 'perimetro', 'paredes'));

add_action('rest_api_init', function() {
    $socio_perm = function() { return blokes_get_app_role() === 'socio'; };

    register_rest_route('superadmin/v1', '/presupuestos', array(
        'methods'             => 'GET',
        'callback'            => 'presup_get_all',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/presupuestos/zonas', array(
        'methods'             => 'POST',
        'callback'            => 'presup_create_zona',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/presupuestos/zonas/(?P<id>[a-z0-9-]+)', array(
        array(
            'methods'             => 'PUT, PATCH',
            'callback'            => 'presup_update_zona',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'presup_delete_zona',
            'permission_callback' => $socio_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/presupuestos/partidas', array(
        'methods'             => 'POST',
        'callback'            => 'presup_create_partida',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/presupuestos/partidas/(?P<id>[a-z0-9-]+)', array(
        array(
            'methods'             => 'PUT, PATCH',
            'callback'            => 'presup_update_partida',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'presup_delete_partida',
            'permission_callback' => $socio_perm,
        ),
    ));
    // Importar partidas: { zona, capitulos: [{ nombre, partidas: [...] }] }
    register_rest_route('superadmin/v1', '/presupuestos/importar', array(
        'methods'             => 'POST',
        'callback'            => 'presup_importar',
        'permission_callback' => $socio_perm,
    ));
});

function presup_zonas()    { return array_values(timeoff_get_option('blokes_presup_zonas')); }
function presup_partidas() { return array_values(timeoff_get_option('blokes_presup_partidas')); }
function presup_save_zonas($l)    { update_option('blokes_presup_zonas', array_values($l), false); }
function presup_save_partidas($l) { update_option('blokes_presup_partidas', array_values($l), false); }

function presup_text($v, $max)     { return mb_substr(trim(sanitize_text_field((string) $v)), 0, $max); }
function presup_longtext($v, $max) { return mb_substr(trim(sanitize_textarea_field((string) $v)), 0, $max); }

// Número ≥ 0 con 2 decimales; acepta coma decimal. null si viene vacío o no es número.
function presup_num($v) {
    if ($v === null || $v === '') return null;
    $v = str_replace(',', '.', (string) $v);
    if (!is_numeric($v)) return null;
    return round(max(0, (float) $v), 2);
}

function presup_find($list, $id) {
    foreach ($list as $i => $x) if ($x['id'] === $id) return $i;
    return -1;
}

function presup_clean_zona($z) {
    $nombre = presup_text($z['nombre'] ?? '', 120);
    if ($nombre === '') return null;
    return array(
        'id'        => $z['id'] ?? wp_generate_uuid4(),
        'nombre'    => $nombre,
        'ubicacion' => presup_text($z['ubicacion'] ?? '', 200),
        'largo'     => presup_num($z['largo'] ?? null),
        'ancho'     => presup_num($z['ancho'] ?? null),
        'alto'      => presup_num($z['alto'] ?? null),
        'notas'     => presup_longtext($z['notas'] ?? '', 3000),
        'orden'     => intval($z['orden'] ?? 0),
        // Zona sin sala concreta («Varias salas»): sin medidas
        'sin_sala'  => filter_var($z['sin_sala'] ?? false, FILTER_VALIDATE_BOOLEAN),
    );
}

// La página original tenía «recibido» y «hecho»: se convierten a los estados de aquí.
function presup_estado($e) {
    $e = (string) $e;
    if ($e === 'recibido') return 'pendiente';
    if ($e === 'hecho')    return 'comprado';
    return in_array($e, PRESUP_ESTADOS, true) ? $e : 'pendiente';
}

function presup_clean_partida($p) {
    $concepto = presup_text($p['concepto'] ?? '', 255);
    $capitulo = presup_text($p['capitulo'] ?? '', 120);
    $zona_id  = (string) ($p['zona_id'] ?? '');
    if ($concepto === '' || $capitulo === '' || $zona_id === '') return null;
    $tipo   = (string) ($p['tipo_precio'] ?? '');
    $medida = (string) ($p['medida'] ?? '');
    $enlace = esc_url_raw(trim((string) ($p['enlace'] ?? '')), array('http', 'https'));
    $fecha  = (string) ($p['fecha_consulta'] ?? '');
    return array(
        'id'                => $p['id'] ?? wp_generate_uuid4(),
        'zona_id'           => $zona_id,
        'capitulo'          => $capitulo,
        'orden'             => intval($p['orden'] ?? 0),
        'concepto'          => $concepto,
        'donde'             => presup_text($p['donde'] ?? '', 160),
        'descripcion'       => presup_longtext($p['descripcion'] ?? '', 2000),
        'cantidad'          => presup_num($p['cantidad'] ?? 1) ?? 0,
        'unidad'            => presup_text($p['unidad'] ?? 'ud', 20) ?: 'ud',
        'medida'            => in_array($medida, PRESUP_MEDIDAS, true) ? $medida : null,
        'precio_propuesto'  => presup_num($p['precio_propuesto'] ?? 0) ?? 0,
        'precio_conseguido' => presup_num($p['precio_conseguido'] ?? null),
        'tipo_precio'       => in_array($tipo, PRESUP_TIPOS, true) ? $tipo : 'estimación',
        'estado'            => presup_estado($p['estado'] ?? ''),
        'proveedor'         => presup_text($p['proveedor'] ?? '', 160),
        'fuente'            => presup_text($p['fuente'] ?? '', 255),
        'enlace'            => mb_substr($enlace, 0, 500),
        'fecha_consulta'    => timeoff_valid_date($fecha) ? $fecha : null,
        'nota'              => presup_longtext($p['nota'] ?? '', 2000),
        'actualizado'       => current_time('mysql'),
        'por'               => timeoff_user_name(),
    );
}

function presup_get_all() {
    return rest_ensure_response(array(
        'success'  => true,
        'zonas'    => presup_zonas(),
        'partidas' => presup_partidas(),
    ));
}

function presup_create_zona($request) {
    $zonas = presup_zonas();
    $body  = $request->get_json_params();
    $body  = is_array($body) ? $body : array();
    unset($body['id']);
    $body['orden'] = count($zonas) + 1;
    $z = presup_clean_zona($body);
    if (!$z) return new WP_Error('invalid_zona', 'Indica el nombre de la zona', array('status' => 400));
    foreach ($zonas as $x) {
        if (mb_strtolower($x['nombre']) === mb_strtolower($z['nombre'])) return new WP_Error('dup_zona', 'Ya hay una zona con ese nombre', array('status' => 400));
    }
    $zonas[] = $z;
    presup_save_zonas($zonas);
    return rest_ensure_response(array('success' => true, 'zona' => $z));
}

function presup_update_zona($request) {
    $zonas = presup_zonas();
    $i = presup_find($zonas, $request['id']);
    if ($i < 0) return new WP_Error('not_found', 'Zona no encontrada', array('status' => 404));
    $body = $request->get_json_params();
    $z = presup_clean_zona(array_merge($zonas[$i], is_array($body) ? $body : array(), array('id' => $zonas[$i]['id'])));
    if (!$z) return new WP_Error('invalid_zona', 'Indica el nombre de la zona', array('status' => 400));
    $zonas[$i] = $z;
    presup_save_zonas($zonas);
    return rest_ensure_response(array('success' => true, 'zona' => $z));
}

// Borra la zona y todas sus partidas
function presup_delete_zona($request) {
    $id = $request['id'];
    presup_save_zonas(array_filter(presup_zonas(), function($z) use ($id) { return $z['id'] !== $id; }));
    presup_save_partidas(array_filter(presup_partidas(), function($p) use ($id) { return $p['zona_id'] !== $id; }));
    return rest_ensure_response(array('success' => true));
}

function presup_create_partida($request) {
    $body = $request->get_json_params();
    $body = is_array($body) ? $body : array();
    unset($body['id']);
    if (presup_find(presup_zonas(), (string) ($body['zona_id'] ?? '')) < 0) return new WP_Error('invalid_zona', 'Zona no encontrada', array('status' => 400));
    $p = presup_clean_partida($body);
    if (!$p) return new WP_Error('invalid_partida', 'Faltan el concepto o el capítulo', array('status' => 400));
    $list = presup_partidas();
    $list[] = $p;
    presup_save_partidas($list);
    return rest_ensure_response(array('success' => true, 'partida' => $p));
}

// Admite cambios parciales: { estado } o { precio_conseguido } desde la tabla.
function presup_update_partida($request) {
    $list = presup_partidas();
    $i = presup_find($list, $request['id']);
    if ($i < 0) return new WP_Error('not_found', 'Partida no encontrada', array('status' => 404));
    $body = $request->get_json_params();
    $p = presup_clean_partida(array_merge($list[$i], is_array($body) ? $body : array(), array('id' => $list[$i]['id'], 'zona_id' => $list[$i]['zona_id'])));
    if (!$p) return new WP_Error('invalid_partida', 'Faltan el concepto o el capítulo', array('status' => 400));
    $list[$i] = $p;
    presup_save_partidas($list);
    return rest_ensure_response(array('success' => true, 'partida' => $p));
}

function presup_delete_partida($request) {
    $id = $request['id'];
    presup_save_partidas(array_filter(presup_partidas(), function($p) use ($id) { return $p['id'] !== $id; }));
    return rest_ensure_response(array('success' => true));
}

// Busca la zona por nombre (o la crea) y añade las partidas. Se saltan las que ya
// existen (mismo capítulo y concepto en esa zona), así reimportar no duplica.
function presup_importar($request) {
    $body   = $request->get_json_params();
    $nombre = presup_text($body['zona'] ?? '', 120);
    $caps   = $body['capitulos'] ?? null;
    if ($nombre === '' || !is_array($caps)) return new WP_Error('invalid_import', 'Formato no válido: falta «zona» o «capitulos»', array('status' => 400));

    $zonas = presup_zonas();
    $zona  = null;
    foreach ($zonas as $z) if (mb_strtolower($z['nombre']) === mb_strtolower($nombre)) { $zona = $z; break; }
    $creada = false;
    if (!$zona) {
        $zona = presup_clean_zona(array('nombre' => $nombre, 'orden' => count($zonas) + 1));
        $zonas[] = $zona;
        presup_save_zonas($zonas);
        $creada = true;
    }

    $list = presup_partidas();
    $added = 0; $skipped = 0; $invalid = 0;
    foreach ($caps as $cap) {
        $cap_nombre = is_array($cap) ? ($cap['nombre'] ?? '') : '';
        $items      = is_array($cap) && is_array($cap['partidas'] ?? null) ? array_values($cap['partidas']) : array();
        foreach ($items as $n => $raw) {
            if (!is_array($raw)) { $invalid++; continue; }
            unset($raw['id']);
            $p = presup_clean_partida(array_merge($raw, array('zona_id' => $zona['id'], 'capitulo' => $cap_nombre, 'orden' => $raw['orden'] ?? $n + 1)));
            if (!$p) { $invalid++; continue; }
            $dup = false;
            foreach ($list as $x) {
                if ($x['zona_id'] === $p['zona_id'] && mb_strtolower($x['capitulo']) === mb_strtolower($p['capitulo']) && mb_strtolower($x['concepto']) === mb_strtolower($p['concepto'])) { $dup = true; break; }
            }
            if ($dup) { $skipped++; continue; }
            $list[] = $p;
            $added++;
        }
    }
    presup_save_partidas($list);
    return rest_ensure_response(array(
        'success'  => true,
        'zona'     => $zona,
        'creada'   => $creada,
        'added'    => $added,
        'skipped'  => $skipped,
        'invalid'  => $invalid,
        'zonas'    => presup_zonas(),
        'partidas' => presup_partidas(),
    ));
}

// ============================================================
//  superadmin/v1 — Proyectos: presupuestos de mejora por zona (solo socios)
//  Se guarda el documento entero (zonas → capítulos → partidas) en una opción.
//  'rev' evita que dos socios se pisen: si no coincide con la guardada, 409.
// ============================================================

add_action('rest_api_init', function() {
    $socio_perm = function() { return blokes_get_app_role() === 'socio'; };

    register_rest_route('superadmin/v1', '/projects', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'projects_get',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'PUT',
            'callback'            => 'projects_save',
            'permission_callback' => $socio_perm,
        ),
    ));
});

function projects_load() {
    $doc = get_option('blokes_projects', null);
    if (!is_array($doc)) $doc = array('zones' => array(), 'rev' => 0, 'updated_at' => '', 'by' => '');
    return $doc;
}

function projects_get() {
    return rest_ensure_response(array('success' => true, 'projects' => projects_load()));
}

function projects_text($v, $max) {
    return mb_substr(trim(sanitize_text_field((string) $v)), 0, $max);
}

function projects_id($v) {
    $id = preg_replace('/[^a-z0-9-]/', '', strtolower((string) $v));
    return $id !== '' ? substr($id, 0, 40) : wp_generate_uuid4();
}

function projects_num($v, $min = 0, $max = 1000000) {
    if ($v === '' || $v === null || !is_numeric($v)) return null;
    return round(max($min, min($max, floatval($v))), 2);
}

function projects_clean_item($it) {
    if (!is_array($it)) return null;
    $concept = projects_text($it['concept'] ?? '', 200);
    if ($concept === '') return null;
    $status = in_array($it['status'] ?? '', array('pedir', 'pendiente', 'aprobado', 'comprado', 'descartado'), true) ? $it['status'] : 'pendiente';
    $ref    = in_array($it['qty_ref'] ?? '', array('suelo', 'perimetro', 'paredes'), true) ? $it['qty_ref'] : '';
    return array(
        'id'         => projects_id($it['id'] ?? ''),
        'concept'    => $concept,
        'description'=> mb_substr(trim(sanitize_textarea_field((string) ($it['description'] ?? ''))), 0, 600),
        'qty'        => projects_num($it['qty'] ?? null) ?? 1,
        'qty_ref'    => $ref,
        'qty_factor' => projects_num($it['qty_factor'] ?? null, 0, 100) ?? 1,
        'unit'       => projects_text($it['unit'] ?? 'ud', 12),
        'price'      => projects_num($it['price'] ?? null) ?? 0,
        'price_got'  => projects_num($it['price_got'] ?? null),
        'price_type' => projects_text($it['price_type'] ?? '', 40),
        'status'     => $status,
        'supplier'   => projects_text($it['supplier'] ?? '', 80),
        'source_name'=> projects_text($it['source_name'] ?? '', 300),
        'source'     => esc_url_raw(mb_substr(trim((string) ($it['source'] ?? '')), 0, 500)),
        'checked_at' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($it['checked_at'] ?? '')) ? $it['checked_at'] : '',
        'note'       => mb_substr(trim(sanitize_textarea_field((string) ($it['note'] ?? ''))), 0, 600),
    );
}

function projects_clean_zones($zones) {
    if (!is_array($zones) || count($zones) > 30) return null;
    $out = array();
    foreach ($zones as $z) {
        $name = projects_text($z['name'] ?? '', 60);
        if ($name === '') continue;
        $chapters = array();
        foreach (array_slice(is_array($z['chapters'] ?? null) ? $z['chapters'] : array(), 0, 40) as $c) {
            $cname = projects_text($c['name'] ?? '', 80);
            if ($cname === '') continue;
            $items = array();
            foreach (array_slice(is_array($c['items'] ?? null) ? $c['items'] : array(), 0, 200) as $it) {
                $clean = projects_clean_item($it);
                if ($clean) $items[] = $clean;
            }
            $chapters[] = array('id' => projects_id($c['id'] ?? ''), 'name' => $cname, 'items' => $items);
        }
        $m = is_array($z['measures'] ?? null) ? $z['measures'] : array();
        $out[] = array(
            'id'       => projects_id($z['id'] ?? ''),
            'name'     => $name,
            'location' => projects_text($z['location'] ?? '', 120),
            'notes'    => mb_substr(trim(sanitize_textarea_field((string) ($z['notes'] ?? ''))), 0, 3000),
            'measures' => array(
                'largo' => projects_num($m['largo'] ?? null, 0, 1000),
                'ancho' => projects_num($m['ancho'] ?? null, 0, 1000),
                'alto'  => projects_num($m['alto'] ?? null, 0, 100),
            ),
            'chapters' => $chapters,
        );
    }
    return $out;
}

function projects_save($request) {
    $body    = $request->get_json_params();
    $current = projects_load();
    if (intval($body['rev'] ?? -1) !== intval($current['rev'])) {
        return new WP_Error('conflict', 'Otro socio ha guardado cambios mientras editabas. Recarga para verlos.', array('status' => 409));
    }
    $zones = projects_clean_zones($body['zones'] ?? null);
    if ($zones === null) return new WP_Error('invalid_projects', 'Datos no válidos o demasiados', array('status' => 400));
    $doc = array('zones' => $zones, 'rev' => intval($current['rev']) + 1, 'updated_at' => current_time('mysql'), 'by' => timeoff_user_name());
    update_option('blokes_projects', $doc, false);
    return rest_ensure_response(array('success' => true, 'projects' => $doc));
}

// ============================================================
//  superadmin/v1 — Eventos: reservas de cumpleaños, colegios y eventos
//  Acceso: socio y gestion, más los emails de la lista de Eventos
//  (blokes_events_access, la edita un socio desde Superadmin → Acceso).
// ============================================================

function events_access_list() {
    $list = get_option('blokes_events_access', array());
    return is_array($list) ? array_values($list) : array();
}

function events_can_access() {
    if (in_array(blokes_get_app_role(), array('socio', 'gestion'))) return true;
    if (!is_user_logged_in()) return false;
    $email = strtolower(trim(wp_get_current_user()->user_email));
    return $email !== '' && in_array($email, array_map('strtolower', events_access_list()));
}

add_action('rest_api_init', function() {
    $ev_perm    = 'events_can_access';
    $socio_perm = function() { return blokes_get_app_role() === 'socio'; };

    register_rest_route('superadmin/v1', '/events/access', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'events_get_access',
            'permission_callback' => '__return_true',
        ),
        array(
            'methods'             => 'PUT',
            'callback'            => 'events_save_access',
            'permission_callback' => $socio_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/events/bookings', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'events_list_bookings',
            'permission_callback' => $ev_perm,
        ),
        array(
            'methods'             => 'POST',
            'callback'            => 'events_create_bookings',
            'permission_callback' => $ev_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/events/bookings/(?P<id>[a-z0-9-]+)', array(
        array(
            'methods'             => 'PUT',
            'callback'            => 'events_update_booking',
            'permission_callback' => $ev_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'events_delete_booking',
            'permission_callback' => $ev_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/events/settings', array(
        'methods'             => 'PUT',
        'callback'            => 'events_save_settings',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/events/ssa-block', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'events_ssa_block_status',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'PUT',
            'callback'            => 'events_ssa_block_toggle',
            'permission_callback' => $socio_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/events/ssa-block/test', array(
        array(
            'methods'             => 'POST',
            'callback'            => 'events_ssa_test_create',
            'permission_callback' => $socio_perm,
        ),
        array(
            'methods'             => 'DELETE',
            'callback'            => 'events_ssa_test_delete',
            'permission_callback' => $socio_perm,
        ),
    ));
});

// Cualquiera puede preguntar si tiene acceso (para enseñar o no el menú); la lista solo la ve un socio.
function events_get_access() {
    $out = array('can' => events_can_access());
    if (blokes_get_app_role() === 'socio') $out['emails'] = events_access_list();
    return rest_ensure_response($out);
}

function events_save_access($request) {
    $body  = $request->get_json_params();
    $clean = array();
    foreach ((is_array($body['emails'] ?? null) ? $body['emails'] : array()) as $email) {
        $e = sanitize_email(strtolower(trim((string) $email)));
        if ($e && !in_array($e, $clean)) $clean[] = $e;
    }
    update_option('blokes_events_access', $clean, false);
    return rest_ensure_response(array('success' => true, 'emails' => $clean));
}

function events_default_settings() {
    return array(
        'price_per_kid' => 15,
        'min_price'     => 180,
        'deposit_pct'   => 30,
        'monitors_pay'  => 80,
        'slots'         => array('11:00', '17:00'),
    );
}

function events_get_settings() {
    $s = get_option('blokes_events_settings', array());
    return array_merge(events_default_settings(), is_array($s) ? $s : array());
}

function events_save_settings($request) {
    $body = $request->get_json_params();
    $s    = events_get_settings();
    foreach (array('price_per_kid', 'min_price', 'deposit_pct', 'monitors_pay') as $k) {
        if (isset($body[$k]) && is_numeric($body[$k])) $s[$k] = round(max(0, floatval($body[$k])), 2);
    }
    if (isset($body['slots']) && is_array($body['slots'])) {
        $slots = array();
        foreach ($body['slots'] as $t) if (preg_match('/^\d{2}:\d{2}$/', (string) $t)) $slots[] = $t;
        sort($slots);
        if ($slots) $s['slots'] = array_values(array_unique($slots));
    }
    update_option('blokes_events_settings', $s, false);
    return rest_ensure_response(array('success' => true, 'settings' => $s));
}

function events_get_bookings() {
    $list = get_option('blokes_events_bookings', array());
    return is_array($list) ? $list : array();
}

function events_save_bookings($list) {
    usort($list, function($a, $b) { return strcmp($a['date'] . $a['time'], $b['date'] . $b['time']); });
    update_option('blokes_events_bookings', array_values($list), false);
}

function events_num($v) {
    if ($v === '' || $v === null || !is_numeric($v)) return null;
    return round(max(0, min(100000, floatval($v))), 2);
}

function events_clean_booking($b) {
    if (!is_array($b)) return null;
    $date = (string) ($b['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return null;
    $pick = function($v, $allowed, $default) { return in_array($v, $allowed, true) ? $v : $default; };
    $text = function($v, $max) { return mb_substr(trim(sanitize_text_field((string) $v)), 0, $max); };
    $time = function($v) { return preg_match('/^\d{2}:\d{2}$/', (string) $v) ? $v : ''; };
    return array(
        'date'          => $date,
        'time'          => $time($b['time'] ?? ''),
        'end_time'      => $time($b['end_time'] ?? ''),
        'type'          => $pick($b['type'] ?? '', array('cumpleanos', 'colegio', 'asociacion', 'empresa', 'evento', 'otro'), 'cumpleanos'),
        'status'        => $pick($b['status'] ?? '', array('solicitud', 'confirmada', 'celebrada', 'cancelada'), 'solicitud'),
        'origin'        => $pick($b['origin'] ?? '', array('web', 'telefono', 'whatsapp', 'email', 'presencial', 'otro'), 'otro'),
        'contact'       => $text($b['contact'] ?? '', 80),
        'phone'         => $text($b['phone'] ?? '', 30),
        'email'         => sanitize_email((string) ($b['email'] ?? '')),
        'honoree'       => $text($b['honoree'] ?? '', 80),
        'age'           => events_num($b['age'] ?? null),
        'kids'          => events_num($b['kids'] ?? null),
        'total'         => events_num($b['total'] ?? null),
        'deposit'       => events_num($b['deposit'] ?? null),
        'deposit_paid'  => !empty($b['deposit_paid']),
        'deposit_date'  => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($b['deposit_date'] ?? '')) ? $b['deposit_date'] : '',
        'rest_paid'     => !empty($b['rest_paid']),
        'monitors_pay'  => events_num($b['monitors_pay'] ?? null),
        'materials'     => events_num($b['materials'] ?? null),
        'monitors'      => $text($b['monitors'] ?? '', 120),
        'notes'         => mb_substr(trim(sanitize_textarea_field((string) ($b['notes'] ?? ''))), 0, 2000),
    );
}

// Reservas de la web: Simply Schedule Appointments (SSA) vive en el sitio principal (blog 1), no se
// carga en el del club y guarda las horas en UTC. Se lee y se escribe directamente en sus tablas;
// así no se dispara ningún email de SSA.
//
// Fase A (siempre). Cada vez que se abren Eventos o el Calendario:
//  - una cita nueva con fecha de hoy en adelante entra como Solicitud · Web (con ssa_id). Si ya
//    había una reserva sin ssa_id ese día a esa hora (apuntada a mano), solo se enlaza;
//  - si el cliente cancela o cambia de día una cita enlazada, la reserva se cancela o se mueve.
// Las citas ya vistas se recuerdan (blokes_events_ssa_seen): si Juan borra una reserva importada,
// no vuelve a entrar.
//
// Fase B (con el interruptor blokes_events_ssa_block). Cada reserva de Eventos con hora, de hoy en
// adelante y sin cancelar, ocupa su hueco en SSA: las apuntadas a mano con una cita «Ocupado
// (Eventos)» (ssa_block); si se cambia de día u hora en Eventos, su cita se mueve; si se cancela o
// se borra, el hueco se libera. Cada reserva enlazada recuerda lo último sincronizado (ssa_status,
// ssa_start) para saber si un cambio vino de la web o de Eventos.
function events_ssa_table($name = 'appointments') {
    global $wpdb;
    return $wpdb->get_blog_prefix(1) . 'ssa_' . $name;
}

function events_ssa_ready() {
    global $wpdb;
    $t = events_ssa_table();
    return $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($t))) === $t;
}

function events_ssa_block_on() {
    return (bool) get_option('blokes_events_ssa_block', false);
}

function events_ssa_is_booked($status) {
    return in_array($status, array('booked', 'pending_form', 'pending_payment'), true);
}

// Fecha y hora locales de una reserva → inicio y fin en UTC ('Y-m-d H:i:s'). Sin hora fija no hay hueco.
function events_ssa_range($date, $time, $end_time = '') {
    if (!preg_match('/^\d{2}:\d{2}$/', (string) $time)) return null;
    try { $s = new DateTime("$date $time", wp_timezone()); } catch (Exception $e) { return null; }
    $e = clone $s;
    if (preg_match('/^\d{2}:\d{2}$/', (string) $end_time) && $end_time > $time) {
        $e = new DateTime("$date $end_time", wp_timezone());
    } else {
        $e->modify('+180 minutes');
    }
    $utc = new DateTimeZone('UTC');
    return array($s->setTimezone($utc)->format('Y-m-d H:i:s'), $e->setTimezone($utc)->format('Y-m-d H:i:s'));
}

// SSA guarda los huecos libres ya calculados (tabla de disponibilidad y transitorios del sitio
// principal). Se borran para que los recalcule con las citas nuevas; no se pierde nada.
function events_ssa_flush_cache() {
    global $wpdb;
    $wpdb->query('DELETE FROM `' . events_ssa_table('availability') . '` WHERE appointment_type_id = 1');
    $wpdb->query("DELETE FROM `{$wpdb->get_blog_prefix(1)}options` WHERE option_name LIKE '\\_transient\\_ssa/%' OR option_name LIKE '\\_transient\\_timeout\\_ssa/%'");
}

function events_ssa_insert_block($start, $end, $note) {
    global $wpdb;
    $now = gmdate('Y-m-d H:i:s');
    $ok  = $wpdb->insert(events_ssa_table(), array(
        'appointment_type_id'             => 1,
        'rescheduled_from_appointment_id' => 0,
        'rescheduled_to_appointment_id'   => 0,
        'group_id'                        => 0,
        'author_id'                       => 0,
        'customer_id'                     => 0,
        'customer_information'            => wp_json_encode(array('Name' => 'Ocupado (Eventos)', 'Email' => '', 'Phone' => '', 'Notes' => $note)),
        'customer_timezone'               => 'Europe/Madrid',
        'customer_locale'                 => 'es_ES',
        'start_date'                      => $start,
        'end_date'                        => $end,
        'title'                           => '',
        'description'                     => $note,
        'payment_method'                  => '',
        'payment_received'                => 0,
        'mailchimp_list_id'               => '',
        'google_calendar_id'              => '',
        'google_calendar_event_id'        => '',
        'web_meeting_password'            => '',
        'web_meeting_id'                  => '',
        'web_meeting_url'                 => '',
        'allow_sms'                       => '',
        'status'                          => 'booked',
        'date_created'                    => $now,
        'date_modified'                   => $now,
        'expiration_date'                 => '0000-00-00 00:00:00',
    ));
    return $ok ? intval($wpdb->insert_id) : 0;
}

function events_ssa_update($sid, $fields) {
    global $wpdb;
    $fields['date_modified'] = gmdate('Y-m-d H:i:s');
    return $wpdb->update(events_ssa_table(), $fields, array('id' => intval($sid))) !== false;
}

function events_ssa_sync() {
    global $wpdb;
    if (!events_ssa_ready()) return;
    if (get_transient('blokes_ssa_sync_lock')) return;
    set_transient('blokes_ssa_sync_lock', 1, 30);

    $table = events_ssa_table();
    $rows  = array();
    foreach ($wpdb->get_results("SELECT id, status, start_date, end_date, customer_information FROM `$table`", ARRAY_A) ?: array() as $r) {
        $rows[intval($r['id'])] = $r;
    }
    $list  = events_get_bookings();
    $seen  = get_option('blokes_events_ssa_seen', array());
    $seen  = is_array($seen) ? $seen : array();
    $tz    = wp_timezone();
    $now   = wp_date('Y-m-d');
    $block = events_ssa_block_on();
    $changed = false;
    $flush   = false;

    $local = function($utc) use ($tz) {
        try { $d = new DateTime($utc, new DateTimeZone('UTC')); } catch (Exception $e) { return null; }
        $d->setTimezone($tz);
        return $d;
    };
    $active = function($b) { return in_array($b['status'], array('solicitud', 'confirmada'), true); };
    $stamp  = function(&$b, $note = '') {
        if ($note) $b['notes'] = trim($b['notes'] . "\n" . $note . ' (' . wp_date('d/m/Y H:i') . ').');
        $b['updated_at'] = current_time('mysql');
        $b['updated_by'] = 'Web (SSA)';
    };

    // 1. Reservas ya enlazadas con una cita de SSA
    $linked = array();
    foreach ($list as $i => &$b) {
        if (empty($b['ssa_id'])) continue;
        $sid = intval($b['ssa_id']);
        $linked[$sid] = true;
        if (!isset($rows[$sid])) continue;
        $r = $rows[$sid];
        $booked = events_ssa_is_booked($r['status']);
        $known  = isset($b['ssa_status']);
        $from_web = !$known || $r['status'] !== $b['ssa_status'] || $r['start_date'] !== ($b['ssa_start'] ?? '');

        // Lo cambiaron en la web (el cliente). Los bloqueos «Ocupado» son de Eventos: no se hace caso.
        if ($from_web && empty($b['ssa_block'])) {
            if (!$booked && $active($b)) {
                $b['status'] = 'cancelada';
                $stamp($b, 'Cancelada en la web');
            } elseif ($booked && $known && $r['start_date'] !== ($b['ssa_start'] ?? '')) {
                $s = $local($r['start_date']);
                $e = $local($r['end_date']);
                if ($s) {
                    $b['date']     = $s->format('Y-m-d');
                    $b['time']     = $s->format('H:i');
                    $b['end_time'] = $e ? $e->format('H:i') : $b['end_time'];
                    $stamp($b, 'Cambiada de día u hora en la web');
                }
            }
            $b['ssa_status'] = $r['status'];
            $b['ssa_start']  = $r['start_date'];
            $changed = true;
            continue;
        }
        if (!$block) continue;

        // Lo cambiaron en Eventos: la cita de SSA sigue a la reserva (solo de hoy en adelante)
        if ($b['date'] < $now) continue;
        $range = $active($b) ? events_ssa_range($b['date'], $b['time'], $b['end_time']) : null;
        if ($range && (!$booked || $r['start_date'] !== $range[0] || $r['end_date'] !== $range[1])) {
            events_ssa_update($sid, array('status' => 'booked', 'start_date' => $range[0], 'end_date' => $range[1]));
            $b['ssa_status'] = 'booked';
            $b['ssa_start']  = $range[0];
            $changed = $flush = true;
        } elseif (!$range && $booked) {
            events_ssa_update($sid, array('status' => 'canceled'));
            $b['ssa_status'] = 'canceled';
            $changed = $flush = true;
        }
    }
    unset($b);

    // 2. Citas nuevas de la web
    foreach ($rows as $sid => $r) {
        if (isset($linked[$sid]) || in_array($sid, $seen, true) || !events_ssa_is_booked($r['status'])) continue;
        $start = $local($r['start_date']);
        $end   = $local($r['end_date']);
        if (!$start || $start->format('Y-m-d') < $now) continue;
        $date = $start->format('Y-m-d');
        $time = $start->format('H:i');
        $seen[]  = $sid;
        $changed = true;

        // ¿Ya la había apuntado alguien a mano?
        $match = null;
        foreach ($list as $i => $b) {
            if (empty($b['ssa_id']) && $b['date'] === $date && $b['time'] === $time && $b['status'] !== 'cancelada') { $match = $i; break; }
        }
        if ($match !== null) {
            $list[$match]['ssa_id']     = $sid;
            $list[$match]['ssa_status'] = $r['status'];
            $list[$match]['ssa_start']  = $r['start_date'];
            continue;
        }

        $info = json_decode((string) $r['customer_information'], true);
        $info = is_array($info) ? array_change_key_case($info, CASE_LOWER) : array();
        $b = events_clean_booking(array(
            'date'     => $date,
            'time'     => $time,
            'end_time' => $end ? $end->format('H:i') : '',
            'type'     => 'cumpleanos',
            'status'   => 'solicitud',
            'origin'   => 'web',
            'contact'  => $info['name'] ?? '',
            'email'    => $info['email'] ?? '',
            'phone'    => $info['phone'] ?? '',
            'notes'    => trim(($info['notes'] ?? '') . "\nReserva hecha en la web."),
        ));
        if (!$b) continue;
        $b['id']         = wp_generate_uuid4();
        $b['ssa_id']     = $sid;
        $b['ssa_status'] = $r['status'];
        $b['ssa_start']  = $r['start_date'];
        $b['created_at'] = current_time('mysql');
        $b['created_by'] = 'Web (SSA)';
        $list[] = $b;
    }

    // 3. Reservas apuntadas a mano sin cita en SSA: se ocupa su hueco
    if ($block) {
        foreach ($list as &$b) {
            if (!empty($b['ssa_id']) || $b['date'] < $now || !$active($b)) continue;
            $range = events_ssa_range($b['date'], $b['time'], $b['end_time']);
            if (!$range) continue;
            $sid = events_ssa_insert_block($range[0], $range[1], 'Reserva apuntada en Eventos (Blokes). No borrar desde aquí: se libera sola al cancelarla en Eventos.');
            if (!$sid) continue;
            $seen[]          = $sid;
            $b['ssa_id']     = $sid;
            $b['ssa_block']  = true;
            $b['ssa_status'] = 'booked';
            $b['ssa_start']  = $range[0];
            $changed = $flush = true;
        }
        unset($b);
    }

    if ($changed) {
        events_save_bookings($list);
        update_option('blokes_events_ssa_seen', array_values(array_unique($seen)), false);
    }
    if ($flush) events_ssa_flush_cache();
    delete_transient('blokes_ssa_sync_lock');
}

// Al borrar una reserva de Eventos con su hueco ocupado en la web, se libera (con el interruptor).
function events_ssa_release($b) {
    if (!events_ssa_block_on() || empty($b['ssa_id']) || !events_ssa_ready() || ($b['date'] ?? '') < wp_date('Y-m-d')) return;
    if (events_ssa_update($b['ssa_id'], array('status' => 'canceled'))) events_ssa_flush_cache();
}

function events_ssa_block_status() {
    $test = get_option('blokes_events_ssa_test', null);
    return rest_ensure_response(array('enabled' => events_ssa_block_on(), 'ready' => events_ssa_ready(), 'test' => is_array($test) ? $test : null));
}

function events_ssa_block_toggle($request) {
    $on = !empty($request->get_json_params()['enabled']);
    update_option('blokes_events_ssa_block', $on, false);
    if ($on) events_ssa_sync();
    return events_ssa_block_status();
}

// Bloqueo de prueba: ocupa un hueco para comprobar en la web que desaparece, y se quita después.
function events_ssa_test_create($request) {
    if (!events_ssa_ready()) return new WP_Error('no_ssa', 'No se encuentran las tablas de reservas de la web', array('status' => 500));
    if (get_option('blokes_events_ssa_test')) return new WP_Error('test_exists', 'Ya hay un bloqueo de prueba: quítalo antes de crear otro', array('status' => 400));
    $body = $request->get_json_params();
    $date = (string) ($body['date'] ?? '');
    $time = (string) ($body['time'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date < wp_date('Y-m-d')) return new WP_Error('bad_date', 'Elige una fecha de hoy en adelante', array('status' => 400));
    $range = events_ssa_range($date, $time);
    if (!$range) return new WP_Error('bad_time', 'Elige una hora', array('status' => 400));
    $sid = events_ssa_insert_block($range[0], $range[1], 'Prueba de bloqueo desde Blokes · Eventos');
    if (!$sid) return new WP_Error('insert_failed', 'No se pudo crear el bloqueo en la web', array('status' => 500));
    $seen   = get_option('blokes_events_ssa_seen', array());
    $seen[] = $sid;
    update_option('blokes_events_ssa_seen', array_values(array_unique($seen)), false);
    update_option('blokes_events_ssa_test', array('ssa_id' => $sid, 'date' => $date, 'time' => $time), false);
    events_ssa_flush_cache();
    return events_ssa_block_status();
}

function events_ssa_test_delete() {
    $test = get_option('blokes_events_ssa_test');
    if (is_array($test) && !empty($test['ssa_id'])) events_ssa_update($test['ssa_id'], array('status' => 'canceled'));
    delete_option('blokes_events_ssa_test');
    events_ssa_flush_cache();
    return events_ssa_block_status();
}

// Costes (pago a monitores, materiales) y la configuración de precios son dinero agregado del
// negocio del club, no "lo que debe esta reserva" — solo socio (31/10, regla de Ramiro). Gestion
// sigue viendo total/señal/pendiente de cada reserva, que sí necesita para cobrar.
function events_filtrar_para_rol($bookings, $settings) {
    if (blokes_es_socio()) return array($bookings, $settings);
    foreach ($bookings as &$b) { unset($b['monitors_pay'], $b['materials']); }
    foreach (array('price_per_kid', 'min_price', 'monitors_pay') as $k) unset($settings[$k]);
    return array($bookings, $settings);
}

function events_list_bookings() {
    events_ssa_sync();
    list($bookings, $settings) = events_filtrar_para_rol(events_get_bookings(), events_get_settings());
    return rest_ensure_response(array('success' => true, 'bookings' => $bookings, 'settings' => $settings));
}

// Acepta una reserva o { bookings: [...] } para cargar varias de golpe (migración del Excel)
function events_create_bookings($request) {
    $body  = $request->get_json_params();
    $input = isset($body['bookings']) && is_array($body['bookings']) ? $body['bookings'] : array($body);
    if (count($input) > 500) return new WP_Error('too_many', 'Máximo 500 reservas de golpe', array('status' => 400));
    $list  = events_get_bookings();
    $added = array();
    foreach ($input as $raw) {
        $b = events_clean_booking($raw);
        if (!$b) continue;
        $b['id']         = wp_generate_uuid4();
        $b['created_at'] = current_time('mysql');
        $b['created_by'] = timeoff_user_name();
        $list[]  = $b;
        $added[] = $b;
    }
    if (!$added) return new WP_Error('invalid_booking', 'Falta la fecha o no es válida', array('status' => 400));
    events_save_bookings($list);
    if (events_ssa_block_on()) events_ssa_sync();
    return rest_ensure_response(array('success' => true, 'added' => $added, 'bookings' => events_get_bookings()));
}

function events_update_booking($request) {
    $id   = $request['id'];
    $list = events_get_bookings();
    foreach ($list as $i => $x) {
        if ($x['id'] !== $id) continue;
        $b = events_clean_booking(array_merge($x, (array) $request->get_json_params()));
        if (!$b) return new WP_Error('invalid_booking', 'Falta la fecha o no es válida', array('status' => 400));
        $list[$i] = array_merge($x, $b, array('updated_at' => current_time('mysql'), 'updated_by' => timeoff_user_name()));
        events_save_bookings($list);
        if (events_ssa_block_on()) events_ssa_sync();
        $booking = $list[$i];
        if (!blokes_es_socio()) unset($booking['monitors_pay'], $booking['materials']);
        return rest_ensure_response(array('success' => true, 'booking' => $booking));
    }
    return new WP_Error('not_found', 'Reserva no encontrada', array('status' => 404));
}

function events_delete_booking($request) {
    $id   = $request['id'];
    $all  = events_get_bookings();
    foreach ($all as $x) if ($x['id'] === $id) events_ssa_release($x);
    $list = array_values(array_filter($all, function($x) use ($id) { return $x['id'] !== $id; }));
    events_save_bookings($list);
    return rest_ensure_response(array('success' => true));
}

// ============================================================
//  superadmin/v1 — Calendario: tareas y eventos leídos de Notion
//  Base de datos "Funciones Rocomadrid" (espacio Madridroco), con
//  la integración interna "Blokes". El token lo pega un socio desde
//  la web y solo vive en wp_options; nunca se devuelve al navegador.
//  Socio y gestion lo ven entero. Los profesores y los emails de la
//  lista de Calendario (blokes_calendar_access, la edita un socio desde
//  Superadmin → Acceso) ven una versión reducida: sin contactos,
//  teléfonos, precios ni comentarios. Se recorta aquí, en el servidor.
//  De momento solo lectura.
// ============================================================

define('BLOKES_NOTION_DB',          '290d5fb11f5b8090a0e2faab61be4695');
define('BLOKES_NOTION_DATA_SOURCE', '290d5fb1-1f5b-80ba-98c0-000bfcf4a16f');

function calendar_access_list() {
    $list = get_option('blokes_calendar_access', array());
    return is_array($list) ? array_values($list) : array();
}

function calendar_full_view() {
    return in_array(blokes_get_app_role(), array('socio', 'gestion'));
}

function calendar_can_view() {
    if (in_array(blokes_get_app_role(), array('socio', 'gestion', 'profesor'))) return true;
    if (!is_user_logged_in()) return false;
    $email = strtolower(trim(wp_get_current_user()->user_email));
    return $email !== '' && in_array($email, array_map('strtolower', calendar_access_list()));
}

add_action('rest_api_init', function() {
    $socio_perm = function() { return blokes_get_app_role() === 'socio'; };
    register_rest_route('superadmin/v1', '/calendar', array(
        'methods'             => 'GET',
        'callback'            => 'calendar_get_items',
        'permission_callback' => 'calendar_can_view',
    ));
    register_rest_route('superadmin/v1', '/calendar/access', array(
        array(
            'methods'             => 'GET',
            'callback'            => 'calendar_get_access',
            'permission_callback' => '__return_true',
        ),
        array(
            'methods'             => 'PUT',
            'callback'            => 'calendar_save_access',
            'permission_callback' => $socio_perm,
        ),
    ));
    register_rest_route('superadmin/v1', '/calendar/token', array(
        'methods'             => 'PUT',
        'callback'            => 'calendar_save_token',
        'permission_callback' => $socio_perm,
    ));
});

// Cualquiera puede preguntar si tiene acceso (para enseñar o no el menú); la lista solo la ve un socio.
function calendar_get_access() {
    $out = array('can' => calendar_can_view(), 'full' => calendar_full_view());
    if (blokes_get_app_role() === 'socio') $out['emails'] = calendar_access_list();
    return rest_ensure_response($out);
}

function calendar_save_access($request) {
    $body  = $request->get_json_params();
    $clean = array();
    foreach ((is_array($body['emails'] ?? null) ? $body['emails'] : array()) as $email) {
        $e = sanitize_email(strtolower(trim((string) $email)));
        if ($e && !in_array($e, $clean)) $clean[] = $e;
    }
    update_option('blokes_calendar_access', $clean, false);
    return rest_ensure_response(array('success' => true, 'emails' => $clean));
}

// Llama a la API de Notion. Prueba primero con data sources (API 2025-09-03)
// y, si no, con la consulta clásica de base de datos (2022-06-28).
function calendar_notion_query($token, $body) {
    $tries = array(
        array('https://api.notion.com/v1/data_sources/' . BLOKES_NOTION_DATA_SOURCE . '/query', '2025-09-03'),
        array('https://api.notion.com/v1/databases/' . BLOKES_NOTION_DB . '/query', '2022-06-28'),
    );
    $last = null;
    foreach ($tries as $t) {
        $res = wp_remote_post($t[0], array(
            'timeout' => 20,
            'headers' => array(
                'Authorization'  => 'Bearer ' . $token,
                'Notion-Version' => $t[1],
                'Content-Type'   => 'application/json',
            ),
            'body'    => wp_json_encode($body),
        ));
        if (is_wp_error($res)) return new WP_Error('notion_down', 'No se pudo conectar con Notion: ' . $res->get_error_message(), array('status' => 502));
        $code = wp_remote_retrieve_response_code($res);
        $json = json_decode(wp_remote_retrieve_body($res), true);
        if ($code === 200) return $json;
        $last = array($code, is_array($json) ? ($json['code'] ?? '') : '');
        if ($code === 401) break;
    }
    if ($last[0] === 401) return new WP_Error('notion_token', 'Notion no acepta el token. Revisa que sea el de la integración Blokes del espacio Madridroco.', array('status' => 502));
    if ($last[1] === 'object_not_found') return new WP_Error('notion_access', 'La integración Blokes no tiene acceso a «Funciones Rocomadrid». Conéctala desde Notion: ••• → Más → Conexiones.', array('status' => 502));
    return new WP_Error('notion_error', 'Notion respondió con un error (' . $last[0] . ' ' . $last[1] . ')', array('status' => 502));
}

function calendar_plain($rich) {
    $out = '';
    foreach ((array) $rich as $r) $out .= $r['plain_text'] ?? '';
    return trim($out);
}

// Página de Notion → elemento del calendario. Busca las propiedades por tipo
// o por nombre sin espacios, porque "Fecha " lleva un espacio al final.
function calendar_map_page($p) {
    $props = $p['properties'] ?? array();
    $by    = array();
    foreach ($props as $name => $v) $by[trim($name)] = $v;
    $title = '';
    $date  = null;
    foreach ($props as $v) {
        if (($v['type'] ?? '') === 'title') $title = calendar_plain($v['title']);
    }
    if (isset($by['Fecha']['date'])) $date = $by['Fecha']['date'];
    if (!$date || empty($date['start'])) return null;
    $select = function($k) use ($by) {
        if (!isset($by[$k]['type'])) return null;
        $v = $by[$k][$by[$k]['type']] ?? null;
        return $v ? array('name' => $v['name'], 'color' => $v['color'] ?? 'default') : null;
    };
    $text = function($k) use ($by) {
        return isset($by[$k]['rich_text']) ? calendar_plain($by[$k]['rich_text']) : '';
    };
    $owners = array();
    foreach ((array) ($by['Encargado']['multi_select'] ?? array()) as $o) $owners[] = $o['name'];
    return array(
        'id'       => $p['id'],
        'url'      => $p['url'] ?? '',
        'title'    => $title !== '' ? $title : 'Sin título',
        'start'    => $date['start'],
        'end'      => $date['end'] ?? null,
        'category' => $select('Categoría'),
        'status'   => $select('Estado'),
        'owners'   => $owners,
        'concept'  => $text('Concepto'),
        'comment'  => $text('Comentario'),
        'contact'  => $text('Contacto'),
        'price'    => $by['Precio']['number'] ?? null,
    );
}

// Tareas de Notion + reservas de Eventos del rango. Quien no es socio ni gestión recibe la
// versión reducida (sin contactos, teléfonos, precios, notas ni enlace a Notion).
function calendar_get_items($request) {
    $from = (string) $request->get_param('from');
    $to   = (string) $request->get_param('to');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) || $from > $to) {
        return new WP_Error('bad_range', 'Rango de fechas no válido', array('status' => 400));
    }
    if ((strtotime($to) - strtotime($from)) > 120 * DAY_IN_SECONDS) {
        return new WP_Error('bad_range', 'Rango de fechas demasiado largo', array('status' => 400));
    }

    $out = calendar_notion_items($from, $to, (bool) $request->get_param('refresh'));
    if (is_wp_error($out)) return $out;

    events_ssa_sync();
    $bookings = array_values(array_filter(events_get_bookings(), function($b) use ($from, $to) {
        return $b['date'] >= $from && $b['date'] <= $to && $b['status'] !== 'cancelada';
    }));

    $out['full'] = calendar_full_view();
    if (!$out['full']) {
        $keep_task    = array_flip(array('id', 'title', 'start', 'end', 'category', 'status', 'owners'));
        $keep_booking = array_flip(array('id', 'date', 'time', 'end_time', 'type', 'status', 'honoree', 'age', 'kids', 'monitors'));
        $out['items'] = array_map(function($it) use ($keep_task) { return array_intersect_key($it, $keep_task); }, $out['items']);
        $bookings     = array_map(function($b) use ($keep_booking) { return array_intersect_key($b, $keep_booking); }, $bookings);
    }
    $out['bookings'] = $bookings;
    return rest_ensure_response($out);
}

// Lo de Notion, guardado 5 minutos ($refresh se lo salta)
function calendar_notion_items($from, $to, $refresh) {
    $token = get_option('blokes_notion_token', '');
    if (!$token) return array('configured' => false, 'items' => array());

    $key = 'blokes_cal_' . md5($from . $to . get_option('blokes_notion_cache_v', 0));
    if (!$refresh) {
        $cached = get_transient($key);
        if (is_array($cached)) return $cached;
    }

    // Lo que empieza hasta 60 días antes también entra si termina dentro del rango (vacaciones, etc.)
    $since = gmdate('Y-m-d', strtotime($from) - 60 * DAY_IN_SECONDS);
    $body  = array(
        'filter'    => array('and' => array(
            array('property' => 'Fecha ', 'date' => array('on_or_after'  => $since)),
            array('property' => 'Fecha ', 'date' => array('on_or_before' => $to)),
        )),
        'sorts'     => array(array('property' => 'Fecha ', 'direction' => 'ascending')),
        'page_size' => 100,
    );
    $items = array();
    for ($i = 0; $i < 10; $i++) {
        $json = calendar_notion_query($token, $body);
        if (is_wp_error($json)) return $json;
        foreach ((array) ($json['results'] ?? array()) as $p) {
            $it = calendar_map_page($p);
            if (!$it) continue;
            $last = substr($it['end'] ?: $it['start'], 0, 10);
            if ($last >= $from) $items[] = $it;
        }
        if (empty($json['has_more']) || empty($json['next_cursor'])) break;
        $body['start_cursor'] = $json['next_cursor'];
    }

    $out = array('configured' => true, 'items' => $items, 'fetched_at' => current_time('mysql'));
    set_transient($key, $out, 5 * MINUTE_IN_SECONDS);
    return $out;
}

// Guarda el token solo si Notion lo acepta y ve la base de datos.
function calendar_save_token($request) {
    $body  = $request->get_json_params();
    $token = trim((string) ($body['token'] ?? ''));
    if (!preg_match('/^(ntn_|secret_)[A-Za-z0-9]{20,}$/', $token)) {
        return new WP_Error('bad_token', 'Eso no parece un token de Notion (empieza por ntn_)', array('status' => 400));
    }
    $test = calendar_notion_query($token, array('page_size' => 1));
    if (is_wp_error($test)) return $test;
    update_option('blokes_notion_token', $token, false);
    update_option('blokes_notion_cache_v', time(), false);
    return rest_ensure_response(array('success' => true));
}

// ============================================================
//  superadmin/v1 — Mapa de Blokes: esquema de toda la app para revisarlo
//  entre socios. El árbol vive en el frontend (src/utils/blokesMap.js); aquí
//  solo se guarda, por id, la decisión (keep/improve/idea/remove) y la nota de
//  cada elemento, y las ideas nuevas que se añaden. Option blokes_map.
// ============================================================

add_action('rest_api_init', function() {
    $socio_perm = function() { return blokes_es_socio(); };
    register_rest_route('superadmin/v1', '/blokes-map', array(
        'methods'             => 'GET',
        'callback'            => 'blokes_map_get',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/blokes-map/item', array(
        'methods'             => 'PUT',
        'callback'            => 'blokes_map_save_item',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/blokes-map/extra', array(
        'methods'             => 'POST',
        'callback'            => 'blokes_map_add_extra',
        'permission_callback' => $socio_perm,
    ));
    register_rest_route('superadmin/v1', '/blokes-map/extra/(?P<id>x-[a-z0-9-]+)', array(
        'methods'             => 'DELETE',
        'callback'            => 'blokes_map_delete_extra',
        'permission_callback' => $socio_perm,
    ));
});

function blokes_map_load() {
    $doc = get_option('blokes_map', array());
    $doc = is_array($doc) ? $doc : array();
    return array(
        'items'  => is_array($doc['items'] ?? null) ? $doc['items'] : array(),
        'extras' => is_array($doc['extras'] ?? null) ? array_values($doc['extras']) : array(),
    );
}

function blokes_map_store($doc) {
    update_option('blokes_map', $doc, false);
}

function blokes_map_valid_id($id) {
    return is_string($id) && preg_match('/^[a-z0-9-]{1,60}$/', $id);
}

function blokes_map_get() {
    $doc = blokes_map_load();
    return rest_ensure_response(array('items' => (object) $doc['items'], 'extras' => $doc['extras']));
}

// Cambia la decisión y/o la nota de un elemento (solo lo que llega), y apunta quién y cuándo.
function blokes_map_save_item($request) {
    $body = $request->get_json_params();
    $id   = (string) ($body['id'] ?? '');
    if (!blokes_map_valid_id($id)) return new WP_Error('bad_id', 'Elemento no válido', array('status' => 400));
    $doc  = blokes_map_load();
    $item = is_array($doc['items'][$id] ?? null) ? $doc['items'][$id] : array();
    if (array_key_exists('decision', $body)) {
        $d = (string) $body['decision'];
        $item['decision'] = in_array($d, array('keep', 'improve', 'idea', 'remove'), true) ? $d : '';
    }
    if (array_key_exists('note', $body)) {
        $item['note'] = mb_substr(trim(sanitize_textarea_field((string) $body['note'])), 0, 2000);
    }
    $item['by'] = timeoff_user_name();
    $item['at'] = current_time('mysql');
    $doc['items'][$id] = $item;
    blokes_map_store($doc);
    return rest_ensure_response(array('success' => true, 'item' => $item));
}

function blokes_map_add_extra($request) {
    $body   = $request->get_json_params();
    $parent = (string) ($body['parent'] ?? '');
    $title  = mb_substr(trim(sanitize_text_field((string) ($body['title'] ?? ''))), 0, 120);
    if (!blokes_map_valid_id($parent) || $title === '') return new WP_Error('bad_extra', 'Falta el título o dónde va', array('status' => 400));
    $doc = blokes_map_load();
    if (count($doc['extras']) >= 300) return new WP_Error('too_many', 'Demasiadas ideas', array('status' => 400));
    $id  = 'x-' . substr(str_replace('-', '', wp_generate_uuid4()), 0, 12);
    $doc['extras'][] = array('id' => $id, 'parent' => $parent, 'title' => $title, 'by' => timeoff_user_name(), 'at' => current_time('mysql'));
    $doc['items'][$id] = array('decision' => 'idea', 'note' => '', 'by' => timeoff_user_name(), 'at' => current_time('mysql'));
    blokes_map_store($doc);
    return rest_ensure_response(array('success' => true, 'extras' => $doc['extras'], 'items' => (object) $doc['items']));
}

// Borra una idea añadida y lo que colgara de ella.
function blokes_map_delete_extra($request) {
    $id  = (string) $request['id'];
    $doc = blokes_map_load();
    $gone = array($id);
    do {
        $before = count($gone);
        foreach ($doc['extras'] as $x) if (in_array($x['parent'], $gone, true) && !in_array($x['id'], $gone, true)) $gone[] = $x['id'];
    } while (count($gone) > $before);
    $doc['extras'] = array_values(array_filter($doc['extras'], function($x) use ($gone) { return !in_array($x['id'], $gone, true); }));
    foreach ($gone as $g) unset($doc['items'][$g]);
    blokes_map_store($doc);
    return rest_ensure_response(array('success' => true, 'extras' => $doc['extras']));
}
