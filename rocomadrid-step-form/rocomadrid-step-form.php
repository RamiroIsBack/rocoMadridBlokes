<?php
/**
 * RocoMadrid Step Form - Integracion en tema
 *
 * Formulario por pasos para suscripciones de escalada RocoMadrid.
 * Shortcode [wc_step_form].
 *
 * Migrado desde el plugin rocomadrid-step-form al tema neve-child.
 * Cargar desde: custom/functions.php
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
// Solo cargar en el subsite /club/ (blog_id = 3)
if ( function_exists( 'is_multisite' ) && is_multisite() && get_current_blog_id() !== 3 ) {
	return;
}

// Constantes — apuntan a la carpeta del tema
define( 'ROCOMADRID_SF_VERSION', '1.4.0' );
define( 'ROCOMADRID_SF_PATH', trailingslashit( dirname( __FILE__ ) ) );
define( 'ROCOMADRID_SF_URL', trailingslashit( get_stylesheet_directory_uri() ) . 'custom/rocomadrid-step-form/' );

/**
 * Clase principal
 */
class RocoMadrid_Step_Form {

	/** @var self|null */
	private static $instance = null;

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		$this->check_dependencies();
		$this->includes();

		// Desde el tema, los plugins ya estan cargados: inicializar directamente
		if ( class_exists( 'WooCommerce' ) ) {
			$this->bootstrap();
		} else {
			add_action( 'init', array( $this, 'bootstrap' ) );
		}
	}

	private function check_dependencies() {
		add_action( 'admin_notices', function () {
			if ( ! class_exists( 'WooCommerce' ) ) {
				echo '<div class="notice notice-error"><p><strong>RocoMadrid Step Form</strong> requires WooCommerce to be installed and active.</p></div>';
			}
		} );
	}

	private function includes() {
		require_once ROCOMADRID_SF_PATH . 'includes/class-settings.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-pricing.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-shortcode.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-ajax.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-cart.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-stats.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-product-generator.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-schedule-manager.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-debug-seeder.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-admin-assign.php';
		require_once ROCOMADRID_SF_PATH . 'includes/class-stock-cancellation.php';
		// require_once ROCOMADRID_SF_PATH . 'includes/class-checkout-fields.php';
	}

	public function bootstrap() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return;
		}

		RocoMadrid_SF_Settings::init();
		RocoMadrid_SF_Shortcode::init();
		RocoMadrid_SF_Ajax::init();
		RocoMadrid_SF_Cart::init();
		RocoMadrid_SF_Stats::init();
		// RocoMadrid_SF_Product_Generator::init();
		RocoMadrid_SF_Schedule_Manager::init();
		RocoMadrid_SF_Admin_Assign::init();
		RocoMadrid_SF_Stock_Cancellation::init();
		// RocoMadrid_SF_Debug_Seeder::init();
		// RocoMadrid_SF_Checkout_Fields::init();

		// Encolar CSS y JS de admin en todas las páginas RocoMadrid
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );
	}

	/**
	 * Encolar CSS y JS de admin solo en páginas RocoMadrid
	 */
	public function enqueue_admin_assets( $hook_suffix ) {
		if ( strpos( $hook_suffix, 'rocomadrid' ) === false ) {
			return;
		}

		wp_enqueue_style(
			'rocomadrid-admin-css',
			ROCOMADRID_SF_URL . 'assets/css/admin.css',
			array(),
			ROCOMADRID_SF_VERSION
		);
		wp_enqueue_script(
			'rocomadrid-admin-js',
			ROCOMADRID_SF_URL . 'assets/js/admin.js',
			array( 'jquery' ),
			ROCOMADRID_SF_VERSION,
			true
		);
	}

	public static function product_dias_sueltos_id() {
		return intval( get_option( 'rocomadrid_product_dias_sueltos', 2674 ) );
	}

	public static function product_tarifas_id() {
		return intval( get_option( 'rocomadrid_product_tarifas', 1557 ) );
	}
}

/**
 * Inicializar
 */
function rocomadrid_step_form() {
	return RocoMadrid_Step_Form::instance();
}
rocomadrid_step_form();
