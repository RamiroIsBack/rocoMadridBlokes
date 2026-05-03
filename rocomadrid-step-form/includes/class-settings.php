<?php
/**
 * Configuración de tarifas y horarios para RocoMadrid
 *
 * Página de administración WooCommerce > RocoMadrid Pricing
 * Funciones getter para descuentos, horarios y restricciones por edad/día
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Settings {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'wp_ajax_rocomadrid_settings_check_product', array( __CLASS__, 'ajax_check_product' ) );
		add_action( 'wp_ajax_rocomadrid_settings_create_product', array( __CLASS__, 'ajax_create_product' ) );
	}

	// ============================================
	// MENÚ Y REGISTRO
	// ============================================

	public static function register_menu() {
		add_menu_page(
			__( 'RocoMadrid steps', 'neve-child' ),     // Título de la página
			'RocoMadrid steps',                       // Texto del menú
			'manage_woocommerce',                   // Capability
			'rocomadrid-pricing',                   // Slug (la página principal = Settings)
			array( 'RocoMadrid_SF_Settings', 'render_page' ), // Callback
			'dashicons-location',                   // Icono (o una URL a un SVG)
			56                                      // Posición (56 = justo después de WooCommerce)
		);
	}

	public static function register_settings() {
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_quarterly_discount' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_annual_discount' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_afternoon_hour' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_children_schedules' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_teenagers_schedules' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_product_dias_sueltos' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_product_tarifas' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_adults_schedules' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_product_pilates' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_product_yoga' );

		// Precios base por edad y frecuencia
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_price_adults_1day' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_price_children_1day' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_price_teenagers_1day' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_price_adults_2days' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_price_children_2days' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_price_teenagers_2days' );

		// Ajustes por turno (se suman al precio base)
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_turno_afternoon_1day' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_turno_special_1day' );
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_turno_afternoon_2days' );

		// Sincronización de renovación de suscripciones
		register_setting( 'rocomadrid_pricing_settings', 'rocomadrid_subscription_sync_day' );
	}

	// ============================================
	// HELPERS DE PRODUCTO
	// ============================================

	/**
	 * Obtener información de un producto WooCommerce
	 */
	private static function get_product_info( $product_id ) {
		if ( ! $product_id ) {
			return array( 'exists' => false );
		}
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return array( 'exists' => false );
		}
		$variation_count = 0;
		if ( $product->is_type( array( 'variable', 'variable-subscription' ) ) ) {
			$variation_count = count( $product->get_children() );
		}
		return array(
			'exists' => true,
			'name' => $product->get_name(),
			'type' => $product->get_type(),
			'status' => $product->get_status(),
			'variation_count' => $variation_count,
		);
	}

	// ============================================
	// AJAX: VERIFICAR / CREAR PRODUCTOS
	// ============================================

	/**
	 * AJAX: Verificar si un producto existe y devolver su info
	 */
	public static function ajax_check_product() {
		check_ajax_referer( 'rocomadrid_settings_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		$product_id = intval( $_POST['product_id'] ?? 0 );
		$info = self::get_product_info( $product_id );
		wp_send_json_success( $info );
	}

	/**
	 * AJAX: Crear producto mediante Product Generator
	 */
	public static function ajax_create_product() {
		check_ajax_referer( 'rocomadrid_settings_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}
		$type = sanitize_text_field( $_POST['product_type'] ?? '' );
		if ( 'single' === $type ) {
			$result = RocoMadrid_SF_Product_Generator::generate_single_days();
		} elseif ( 'classes' === $type ) {
			$result = RocoMadrid_SF_Product_Generator::generate_classes();
		} else {
			wp_send_json_error( __( 'Invalid product type', 'neve-child' ) );
			return;
		}
		if ( isset( $result['error'] ) ) {
			wp_send_json_error( $result['error'] );
			return;
		}
		wp_send_json_success( $result );
	}

	// ============================================
	// RENDER: DASHBOARD NAVIGATION
	// ============================================

	/**
	 * Renderizar tarjetas de navegación del dashboard
	 */
	private static function render_dashboard_nav() {
		$pages = array(
			array(
				'slug' => 'rocomadrid-schedule-manager',
				'label' => __( 'Schedule Manager', 'neve-child' ),
				'desc' => __( 'Add or remove schedule variations', 'neve-child' ),
			),
			// array(
			// 	'slug' => 'rocomadrid-product-generator',
			// 	'icon' => '🏗️',
			// 	'label' => __( 'Product Generator', 'neve-child' ),
			// 	'desc' => __( 'Regenerate all product variations', 'neve-child' ),
			// ),
			array(
				'slug' => 'rocomadrid-stats',
				'label' => __( 'Statistics', 'neve-child' ),
				'desc' => __( 'Occupancy matrix & student list', 'neve-child' ),
			),
		);

		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			$pages[] = array(
				'slug' => 'rocomadrid-debug-seeder',
				'icon' => '🧪',
				'label' => __( 'Debug Seeder', 'neve-child' ),
				'desc' => __( 'Generate test subscriptions', 'neve-child' ),
			);
		}
		?>
		<div class="rm-dashboard-nav">
			<?php foreach ( $pages as $page ) : ?>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $page['slug'] ) ); ?>" class="rm-nav-card">
					<span class="rm-nav-label"><?php echo esc_html( $page['label'] ); ?></span>
					<span class="rm-nav-desc"><?php echo esc_html( $page['desc'] ); ?></span>
				</a>
			<?php endforeach; ?>
		</div>
		<?php
	}

	// ============================================
	// RENDER: PRODUCT CARDS
	// ============================================

	/**
	 * Renderizar tarjetas de estado de productos
	 */
	private static function render_product_cards( $ds_id, $ds_info, $cl_id, $cl_info ) {
		?>
		<h2 class="section-title">⚙️ <?php echo esc_html__( 'Settings', 'neve-child' ); ?></h2>
		<p class="description">
			<?php echo esc_html__( 'WooCommerce products used by the step form. Set an existing product ID or create a new one.', 'neve-child' ); ?>
		</p>
		<div class="rm-grid-2">
			<?php
			self::render_single_product_card(
				__( 'Single Days', 'neve-child' ),
				__( '1 day/week', 'neve-child' ),
				'product_dias_sueltos',
				$ds_id,
				$ds_info,
				'single'
			);
			self::render_single_product_card(
				__( 'Classes', 'neve-child' ),
				__( '2 days/week', 'neve-child' ),
				'product_tarifas',
				$cl_id,
				$cl_info,
				'classes'
			);
			?>
		</div>
		<?php
	}

	/**
	 * Renderizar una tarjeta de producto individual
	 */
	private static function render_single_product_card( $title, $subtitle, $field_name, $product_id, $info, $type ) {
		$exists = ! empty( $info['exists'] );
		$badge_class = $exists ? 'badge-success' : 'badge-danger';
		$badge_text = $exists ? __( 'Active', 'neve-child' ) : __( 'Not found', 'neve-child' );
		?>
		<div class="rm-product-card" id="product-card-<?php echo esc_attr( $type ); ?>">
			<div class="rm-product-card-header">
				<h3><?php echo esc_html( $title ); ?>
					<small class="rm-muted">(<?php echo esc_html( $subtitle ); ?>)</small>
				</h3>
				<span class="badge <?php echo $badge_class; ?>" id="badge-<?php echo esc_attr( $type ); ?>">
					<?php echo esc_html( $badge_text ); ?>
				</span>
			</div>

			<div class="rm-product-field">
				<label
					for="<?php echo esc_attr( $field_name ); ?>"><?php echo esc_html__( 'Product ID', 'neve-child' ); ?></label>
				<input type="text" id="<?php echo esc_attr( $field_name ); ?>" name="<?php echo esc_attr( $field_name ); ?>"
					value="<?php echo esc_attr( $product_id ); ?>" min="0" class="rm-inline-input" />
				<!-- <button type="button" class="button rm-btn-check" data-type="<?php echo esc_attr( $type ); ?>"> -->
				<?php //echo esc_html__( 'Check', 'neve-child' ); ?>
				<!-- </button> -->
			</div>

			<div class="rm-product-info" id="info-<?php echo esc_attr( $type ); ?>">
				<?php if ( $exists ) : ?>
					<div class="info-grid">
						<div class="info-item">
							<span class="label"><?php echo esc_html__( 'Name', 'neve-child' ); ?></span>
							<span class="value"><?php echo esc_html( $info['name'] ); ?></span>
						</div>
						<div class="info-item">
							<span class="label"><?php echo esc_html__( 'Type', 'neve-child' ); ?></span>
							<span class="value"><?php echo esc_html( $info['type'] ); ?></span>
						</div>
						<div class="info-item">
							<span class="label"><?php echo esc_html__( 'Variations', 'neve-child' ); ?></span>
							<span class="value"><?php echo intval( $info['variation_count'] ); ?></span>
						</div>
						<div class="info-item">
							<span class="label"><?php echo esc_html__( 'Status', 'neve-child' ); ?></span>
							<span class="value"><?php echo esc_html( ucfirst( $info['status'] ) ); ?></span>
						</div>
					</div>
				<?php else : ?>
					<p class="rm-product-not-found">
						<?php echo esc_html__( 'No product found with this ID. Enter a valid ID or create a new product.', 'neve-child' ); ?>
					</p>
				<?php endif; ?>
			</div>

			<?php if ( ! $exists ) : ?>
				<button type="button" class="btn btn-primary-rm rm-btn-create" data-type="<?php echo esc_attr( $type ); ?>"
					data-field="<?php echo esc_attr( $field_name ); ?>">
					🏗️ <?php echo esc_html__( 'Create Product', 'neve-child' ); ?>
				</button>
			<?php endif; ?>
		</div>
		<?php
	}

	// ============================================
	// GETTERS DE CONFIGURACIÓN
	// ============================================

	public static function get_quarterly_discount() {
		return floatval( get_option( 'rocomadrid_quarterly_discount', 5 ) );
	}

	public static function get_annual_discount() {
		return floatval( get_option( 'rocomadrid_annual_discount', 10 ) );
	}

	public static function get_afternoon_hour() {
		return intval( get_option( 'rocomadrid_afternoon_hour', 15 ) );
	}

	// ============================================
	// GETTERS DE PRECIOS BASE Y AJUSTES POR TURNO
	// ============================================

	/**
	 * Precios base mensuales por edad y frecuencia
	 */
	public static function get_price_adults_1day() {
		return floatval( get_option( 'rocomadrid_price_adults_1day', 68 ) );
	}

	public static function get_price_children_1day() {
		return floatval( get_option( 'rocomadrid_price_children_1day', 47 ) );
	}

	public static function get_price_teenagers_1day() {
		return floatval( get_option( 'rocomadrid_price_teenagers_1day', 55 ) );
	}

	public static function get_price_adults_2days() {
		return floatval( get_option( 'rocomadrid_price_adults_2days', 77 ) );
	}

	public static function get_price_children_2days() {
		return floatval( get_option( 'rocomadrid_price_children_2days', 57 ) );
	}

	public static function get_price_teenagers_2days() {
		return floatval( get_option( 'rocomadrid_price_teenagers_2days', 65 ) );
	}

	/**
	 * Ajustes de turno: se suman al precio base de adultos
	 * Morning = 0 (precio base), Afternoon/Special = ajuste adicional
	 */
	public static function get_turno_afternoon_1day() {
		return floatval( get_option( 'rocomadrid_turno_afternoon_1day', 6 ) );
	}

	public static function get_turno_special_1day() {
		return floatval( get_option( 'rocomadrid_turno_special_1day', 10 ) );
	}

	public static function get_turno_afternoon_2days() {
		return floatval( get_option( 'rocomadrid_turno_afternoon_2days', 9 ) );
	}

	/**
	 * Día del mes de renovación de suscripciones (0 = sin sincronización, 1-28 = día del mes)
	 */
	public static function get_subscription_sync_day() {
		return intval( get_option( 'rocomadrid_subscription_sync_day', 0 ) );
	}

	/**
	 * Devuelve los precios de Días Sueltos calculados (base + ajuste turno)
	 */
	public static function get_single_day_prices() {
		$base = self::get_price_adults_1day();
		return array(
			'morning' => $base,
			'afternoon' => $base + self::get_turno_afternoon_1day(),
			'special' => $base + self::get_turno_special_1day(),
		);
	}

	/**
	 * Precio mensual para Clases (2 días/semana) según edad y horario
	 */
	public static function get_classes_price( $age, $schedule ) {
		$afternoon_hour = self::get_afternoon_hour();

		if ( stripos( $age, 'Children' ) !== false ) {
			return self::get_price_children_2days();
		}

		$hour = intval( substr( $schedule, 0, 2 ) );
		$base = self::get_price_adults_2days();

		return ( $hour < $afternoon_hour ) ? $base : $base + self::get_turno_afternoon_2days();
	}

	public static function get_children_schedules() {
		$schedules = get_option( 'rocomadrid_children_schedules', array() );
		return is_array( $schedules ) ? $schedules : array();
	}

	public static function get_children_schedules_by_day( $day ) {
		$schedules = self::get_children_schedules();
		return isset( $schedules[ $day ] ) && is_array( $schedules[ $day ] ) ? $schedules[ $day ] : array();
	}
	public static function get_teenagers_schedules() {
		$schedules = get_option( 'rocomadrid_teenagers_schedules', array() );
		return is_array( $schedules ) ? $schedules : array();
	}

	public static function get_teenagers_schedules_by_day( $day ) {
		$schedules = self::get_teenagers_schedules();
		return isset( $schedules[ $day ] ) && is_array( $schedules[ $day ] ) ? $schedules[ $day ] : array();
	}

	public static function get_adults_schedules() {
		$schedules = get_option( 'rocomadrid_adults_schedules', array() );
		return is_array( $schedules ) ? $schedules : array();
	}

	public static function get_adults_schedules_by_day( $day ) {
		$schedules = self::get_adults_schedules();
		return isset( $schedules[ $day ] ) && is_array( $schedules[ $day ] ) ? $schedules[ $day ] : array();
	}

	// ============================================
	// FUNCIONES DE HORARIOS Y DÍAS
	// ============================================

	/**
	 * Obtener todos los horarios únicos del producto Días Sueltos
	 */
	public static function get_all_schedules() {
		$product_id = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return array();
		}

		$horarios = array();
		$taxonomy = 'pa_horario';
		$terms = wp_get_post_terms( $product_id, $taxonomy );

		if ( ! is_wp_error( $terms ) && ! empty( $terms ) ) {
			foreach ( $terms as $term ) {
				$horarios[] = $term->name;
			}
		}

		usort( $horarios, 'strcmp' );
		return $horarios;
	}

	/**
	 * Obtener los días disponibles del producto Días Sueltos
	 */
	public static function get_available_days() {
		$product_id = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return array();
		}

		$dias = array();
		$taxonomy = 'pa_dia-suelto';
		$terms = wp_get_post_terms( $product_id, $taxonomy );

		if ( ! is_wp_error( $terms ) && ! empty( $terms ) ) {
			foreach ( $terms as $term ) {
				$dias[] = $term->name;
			}
		}

		$orden = array( 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo' );
		usort( $dias, function ( $a, $b ) use ( $orden ) {
			$pos_a = array_search( $a, $orden );
			$pos_b = array_search( $b, $orden );
			if ( $pos_a === false ) {
				$pos_a = 999;
			}
			if ( $pos_b === false ) {
				$pos_b = 999;
			}
			return $pos_a - $pos_b;
		} );

		return $dias;
	}

	/**
	 * Obtener horarios disponibles para un día específico
	 */
	public static function get_schedules_by_day( $day ) {
		$product_id = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product = wc_get_product( $product_id );
		if ( ! $product || ! $product->is_type( array( 'variable', 'variable-subscription' ) ) ) {
			return array();
		}

		$schedules = array();
		$variations = $product->get_available_variations();

		foreach ( $variations as $variation ) {
			$var_day = isset( $variation['attributes']['attribute_pa_dia-suelto'] ) ? $variation['attributes']['attribute_pa_dia-suelto'] : '';

			if ( ! empty( $var_day ) ) {
				$term_day = get_term_by( 'slug', $var_day, 'pa_dia-suelto' );
				$day_name = $term_day ? $term_day->name : $var_day;

				if ( strtolower( $day_name ) === strtolower( $day ) ) {
					$var_schedule = isset( $variation['attributes']['attribute_pa_horario'] ) ? $variation['attributes']['attribute_pa_horario'] : '';

					if ( ! empty( $var_schedule ) ) {
						$term_schedule = get_term_by( 'slug', $var_schedule, 'pa_horario' );
						$schedule_name = $term_schedule ? $term_schedule->name : $var_schedule;

						if ( ! in_array( $schedule_name, $schedules ) ) {
							$schedules[] = $schedule_name;
						}
					}
				}
			}
		}

		sort( $schedules );
		return $schedules;
	}

	// ============================================
	// RENDERIZAR PÁGINA DE AJUSTES
	// ============================================

	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		// Guardar si se envió el formulario
		if ( isset( $_POST['rocomadrid_save_settings'] ) && check_admin_referer( 'rocomadrid_pricing_nonce' ) ) {
			update_option( 'rocomadrid_quarterly_discount', floatval( $_POST['quarterly_discount'] ) );
			update_option( 'rocomadrid_annual_discount', floatval( $_POST['annual_discount'] ) );
			update_option( 'rocomadrid_afternoon_hour', intval( $_POST['afternoon_hour'] ) );
			update_option( 'rocomadrid_product_dias_sueltos', intval( $_POST['product_dias_sueltos'] ) );
			update_option( 'rocomadrid_product_tarifas', intval( $_POST['product_tarifas'] ) );
			update_option( 'rocomadrid_product_pilates', intval( $_POST['product_pilates'] ?? 0 ) );
			update_option( 'rocomadrid_product_yoga', intval( $_POST['product_yoga'] ?? 0 ) );

			// Precios base
			update_option( 'rocomadrid_price_adults_1day', floatval( $_POST['price_adults_1day'] ) );
			update_option( 'rocomadrid_price_children_1day', floatval( $_POST['price_children_1day'] ) );
			update_option( 'rocomadrid_price_teenagers_1day', floatval( $_POST['price_teenagers_1day'] ) );
			update_option( 'rocomadrid_price_adults_2days', floatval( $_POST['price_adults_2days'] ) );
			update_option( 'rocomadrid_price_children_2days', floatval( $_POST['price_children_2days'] ) );
			update_option( 'rocomadrid_price_teenagers_2days', floatval( $_POST['price_teenagers_2days'] ) );

			// Ajustes por turno
			update_option( 'rocomadrid_turno_afternoon_1day', floatval( $_POST['turno_afternoon_1day'] ) );
			update_option( 'rocomadrid_turno_special_1day', floatval( $_POST['turno_special_1day'] ) );
			update_option( 'rocomadrid_turno_afternoon_2days', floatval( $_POST['turno_afternoon_2days'] ) );

			$days = self::get_available_days();
			$children_schedules = array();
			$teenagers_schedules = array();
			$adults_schedules = array();

			foreach ( $days as $day ) {
				$day_slug = sanitize_title( $day );

				$children_schedules[ $day ] = isset( $_POST[ 'children_schedules_' . $day_slug ] )
					? array_map( 'sanitize_text_field', $_POST[ 'children_schedules_' . $day_slug ] )
					: array();

				$teenagers_schedules[ $day ] = isset( $_POST[ 'teenagers_schedules_' . $day_slug ] )
					? array_map( 'sanitize_text_field', $_POST[ 'teenagers_schedules_' . $day_slug ] )
					: array();

				$adults_schedules[ $day ] = isset( $_POST[ 'adults_schedules_' . $day_slug ] )
					? array_map( 'sanitize_text_field', $_POST[ 'adults_schedules_' . $day_slug ] )
					: array();
			}

			update_option( 'rocomadrid_children_schedules', $children_schedules );
			update_option( 'rocomadrid_teenagers_schedules', $teenagers_schedules );
			update_option( 'rocomadrid_adults_schedules', $adults_schedules );

			// Sincronización de renovación de suscripciones
			$sync_day = isset( $_POST['subscription_sync_day'] ) ? intval( $_POST['subscription_sync_day'] ) : 0;
			if ( $sync_day < 0 || $sync_day > 28 ) {
				$sync_day = 0;
			}
			update_option( 'rocomadrid_subscription_sync_day', $sync_day );

			// Aplicar _subscription_payment_sync_date a todas las variaciones de ambos productos
			$products_to_sync = array(
				RocoMadrid_Step_Form::product_tarifas_id(),
				RocoMadrid_Step_Form::product_dias_sueltos_id(),
			);
			foreach ( $products_to_sync as $product_id_sync ) {
				if ( ! $product_id_sync ) {
					continue;
				}
				$product_obj = wc_get_product( $product_id_sync );
				if ( $product_obj && $product_obj->is_type( array( 'variable', 'variable-subscription' ) ) ) {
					foreach ( $product_obj->get_children() as $variation_id ) {
						update_post_meta( $variation_id, '_subscription_payment_sync_date', $sync_day );
					}
					update_post_meta( $product_id_sync, '_subscription_payment_sync_date', $sync_day );
					wc_delete_product_transients( $product_id_sync );
				}
			}

			echo '<div class="notice notice-success"><p>' . esc_html__( 'Settings saved successfully.', 'neve-child' ) . '</p></div>';
		}

		$quarterly_discount = self::get_quarterly_discount();
		$annual_discount = self::get_annual_discount();
		$afternoon_hour = self::get_afternoon_hour();
		$available_days = self::get_available_days();
		$children_schedules = self::get_children_schedules();
		$teenagers_schedules = self::get_teenagers_schedules();
		$adults_schedules = self::get_adults_schedules();
		$product_dias_sueltos = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product_tarifas = RocoMadrid_Step_Form::product_tarifas_id();

		// Precios base
		$price_adults_1day = self::get_price_adults_1day();
		$price_children_1day = self::get_price_children_1day();
		$price_teenagers_1day = self::get_price_teenagers_1day();
		$price_adults_2days = self::get_price_adults_2days();
		$price_children_2days = self::get_price_children_2days();
		$price_teenagers_2days = self::get_price_teenagers_2days();

		// Ajustes por turno
		$turno_afternoon_1day = self::get_turno_afternoon_1day();
		$turno_special_1day = self::get_turno_special_1day();
		$turno_afternoon_2days = self::get_turno_afternoon_2days();

		// Sincronización de renovación de suscripciones
		$subscription_sync_day = self::get_subscription_sync_day();

		// Info de estado de productos
		$ds_info = self::get_product_info( $product_dias_sueltos );
		$cl_info = self::get_product_info( $product_tarifas );

		// Localizar datos para JS (product check/create)
		wp_localize_script( 'rocomadrid-admin-js', 'rmSettings', array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'rocomadrid_settings_nonce' ),
			'i18n' => array(
				'checking' => __( 'Checking...', 'neve-child' ),
				'creating' => __( 'Creating product...', 'neve-child' ),
				'found' => __( 'Active', 'neve-child' ),
				'notFound' => __( 'Not found', 'neve-child' ),
				'error' => __( 'Error', 'neve-child' ),
				'createProduct' => __( 'Create Product', 'neve-child' ),
				'notFoundMsg' => __( 'No product found with this ID. Enter a valid ID or create a new product.', 'neve-child' ),
			),
		) );

		?>
		<div class="wrap rocomadrid-settings">
			<h1>⛰️ <?php echo esc_html__( 'RocoMadrid Settings', 'neve-child' ); ?></h1>

			<?php self::render_dashboard_nav(); ?>

			<form method="post" action="">
				<?php wp_nonce_field( 'rocomadrid_pricing_nonce' ); ?>

				<?php self::render_product_cards( $product_dias_sueltos, $ds_info, $product_tarifas, $cl_info ); ?>

				<!-- ===================== SECCIÓN: Actividades Extra ===================== -->
				<div class="rm-section" style="margin-top:24px">
					<h2><?php echo esc_html__( 'Extra Activities', 'neve-child' ); ?></h2>
					<p class="description">
						<?php echo esc_html__( 'Subscription products whose variations already have pa_frecuencia, pa_dias and pa_horario attributes. Their subscribers will appear in Statistics automatically.', 'neve-child' ); ?>
					</p>
					<div class="rm-grid-2">
						<div class="rm-product-field">
							<label for="product_pilates">Pilates &mdash;
								<?php echo esc_html__( 'Product ID', 'neve-child' ); ?></label>
							<input type="text" id="product_pilates" name="product_pilates"
								value="<?php echo esc_attr( get_option( 'rocomadrid_product_pilates', '' ) ); ?>"
								class="rm-inline-input" placeholder="0" />
						</div>
						<div class="rm-product-field">
							<label for="product_yoga">Yoga &mdash;
								<?php echo esc_html__( 'Product ID', 'neve-child' ); ?></label>
							<input type="text" id="product_yoga" name="product_yoga"
								value="<?php echo esc_attr( get_option( 'rocomadrid_product_yoga', '' ) ); ?>"
								class="rm-inline-input" placeholder="0" />
						</div>
					</div>
				</div>

				<!-- ===================== SECCIÓN: Descuentos ===================== -->
				<div class="rm-grid-2">
					<div class="rm-section">
						<h2><?php echo esc_html__( 'Payment Plan Discounts', 'neve-child' ); ?></h2>
						<p class="rm-section-desc">
							<?php echo esc_html__( 'These discounts are applied to the base monthly price to calculate quarterly and annual plans.', 'neve-child' ); ?>
						</p>

						<div class="rm-field-row">
							<label
								for="quarterly_discount"><?php echo esc_html__( 'Quarterly Discount', 'neve-child' ); ?></label>
							<div class="rm-field-input">
								<input type="text" id="quarterly_discount" name="quarterly_discount"
									value="<?php echo esc_attr( $quarterly_discount ); ?>" min="0" max="50" step="0.5"
									class="rm-inline-input" /> %
								<p class="description">
									<?php echo esc_html__( 'Discount applied to quarterly payment (3 months). E.g.: 5% = pays 95% of monthly price × 3', 'neve-child' ); ?>
								</p>
							</div>
						</div>

						<div class="rm-field-row">
							<label for="annual_discount"><?php echo esc_html__( 'Annual Discount', 'neve-child' ); ?></label>
							<div class="rm-field-input">
								<input type="text" id="annual_discount" name="annual_discount"
									value="<?php echo esc_attr( $annual_discount ); ?>" min="0" max="50" step="0.5"
									class="rm-inline-input" /> %
								<p class="description">
									<?php echo esc_html__( 'Discount applied to annual payment (12 months). E.g.: 10% = pays 90% of monthly price × 12', 'neve-child' ); ?>
								</p>
							</div>
						</div>
					</div>

					<!-- ===================== SECCIÓN: Precios base ===================== -->
					<div class="rm-section">
						<h2><?php echo esc_html__( 'Base Monthly Prices', 'neve-child' ); ?></h2>
						<p class="rm-section-desc">
							<?php echo esc_html__( 'Base monthly price for each age group and frequency. The schedule/shift adjustments below are added to the adult base price.', 'neve-child' ); ?>
						</p>

						<table class="widefat">
							<thead>
								<tr>
									<th><?php echo esc_html__( 'Age Group', 'neve-child' ); ?></th>
									<th><?php echo esc_html__( '1 day/week', 'neve-child' ); ?></th>
									<th><?php echo esc_html__( '2 days/week', 'neve-child' ); ?></th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td><?php echo esc_html__( 'Adults', 'neve-child' ); ?></td>
									<td>
										<input type="text" name="price_adults_1day"
											value="<?php echo esc_attr( $price_adults_1day ); ?>" min="0" step="0.5"
											class="rm-inline-input" /> €
									</td>
									<td>
										<input type="text" name="price_adults_2days"
											value="<?php echo esc_attr( $price_adults_2days ); ?>" min="0" step="0.5"
											class="rm-inline-input" /> €
									</td>
								</tr>
								<tr>
									<td><?php echo esc_html__( 'Children (6-12)', 'neve-child' ); ?></td>
									<td>
										<input type="text" name="price_children_1day"
											value="<?php echo esc_attr( $price_children_1day ); ?>" min="0" step="0.5"
											class="rm-inline-input" /> €
									</td>
									<td>
										<input type="text" name="price_children_2days"
											value="<?php echo esc_attr( $price_children_2days ); ?>" min="0" step="0.5"
											class="rm-inline-input" /> €
									</td>
								</tr>
								<tr>
									<td><?php echo esc_html__( 'Teenagers (12-18)', 'neve-child' ); ?></td>
									<td>
										<input type="text" name="price_teenagers_1day"
											value="<?php echo esc_attr( $price_teenagers_1day ); ?>" min="0" step="0.5"
											class="rm-inline-input" /> €
									</td>
									<td>
										<input type="text" name="price_teenagers_2days"
											value="<?php echo esc_attr( $price_teenagers_2days ); ?>" min="0" step="0.5"
											class="rm-inline-input" /> €
									</td>
								</tr>
							</tbody>
						</table>
						<p class="description">
							<?php echo esc_html__( 'Morning shift uses the base adult price. Afternoon/Special adjustments are added on top.', 'neve-child' ); ?>
						</p>
					</div>
				</div>
				<div class="rm-grid-2">
					<!-- ===================== SECCIÓN: Ajustes de turno ===================== -->
					<div class="rm-section">
						<h2><?php echo esc_html__( 'Schedule Shift Adjustments (Adults)', 'neve-child' ); ?></h2>
						<p class="rm-section-desc">
							<?php echo esc_html__( 'Extra amount added to the adult base price for afternoon and special (Fri/Sat) shifts. Morning = base price + 0.', 'neve-child' ); ?>
						</p>

						<table class="widefat">
							<thead>
								<tr>
									<th><?php echo esc_html__( 'Shift', 'neve-child' ); ?></th>
									<th><?php echo esc_html__( '1 day/week', 'neve-child' ); ?></th>
									<th><?php echo esc_html__( '2 days/week', 'neve-child' ); ?></th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td><?php echo esc_html__( 'Afternoon', 'neve-child' ); ?></td>
									<td>
										Base + <input type="text" name="turno_afternoon_1day"
											value="<?php echo esc_attr( $turno_afternoon_1day ); ?>" min="0" step="0.5"
											class="rm-inline-input" />
										<span class="rm-inline-calc"> =
											<?php echo $price_adults_1day + $turno_afternoon_1day; ?>€</span>
									</td>
									<td>
										Base +<input type="text" name="turno_afternoon_2days"
											value="<?php echo esc_attr( $turno_afternoon_2days ); ?>" min="0" step="0.5"
											class="rm-inline-input" />
										<span class="rm-inline-calc"> =
											<?php echo $price_adults_2days + $turno_afternoon_2days; ?>€</span>
									</td>
								</tr>
								<tr>
									<td><?php echo esc_html__( 'Special (Fri/Sat)', 'neve-child' ); ?></td>
									<td>
										Base + <input type="text" name="turno_special_1day"
											value="<?php echo esc_attr( $turno_special_1day ); ?>" min="0" step="0.5"
											class="rm-inline-input" />
										<span class="rm-inline-calc"> =
											<?php echo $price_adults_1day + $turno_special_1day; ?>€</span>
									</td>
									<td class="rm-muted">N/A</td>
								</tr>
							</tbody>
						</table>
					</div>

					<!-- ===================== SECCIÓN: Hora mañana/tarde ===================== -->
					<div class="rm-section">
						<h2><?php echo esc_html__( 'Morning/Afternoon Schedule', 'neve-child' ); ?></h2>
						<p class="rm-section-desc">
							<?php echo esc_html__( 'Define from what time classes are considered "afternoon shift" (with different pricing).', 'neve-child' ); ?>
						</p>

						<div class="rm-field-row">
							<label
								for="afternoon_hour"><?php echo esc_html__( 'Afternoon Start Time', 'neve-child' ); ?></label>
							<div class="rm-field-input">
								<select id="afternoon_hour" name="afternoon_hour" class="rm-inline-input">
									<?php for ( $h = 12; $h <= 18; $h++ ) : ?>
										<option value="<?php echo $h; ?>" <?php selected( $afternoon_hour, $h ); ?>>
											<?php echo sprintf( '%02d:00', $h ); ?>
										</option>
									<?php endfor; ?>
								</select>
								<p class="description">
									<?php echo sprintf(
										esc_html__( 'Classes starting from this time will be considered "afternoon". Currently: %s', 'neve-child' ),
										'<strong>' . sprintf( '%02d:00', $afternoon_hour ) . '</strong>'
									); ?>
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- ===================== SECCIÓN: Horarios por grupo de edad ===================== -->
				<div class="rm-section">
					<h2><?php echo esc_html__( 'Schedules by Age Group (Single Days)', 'neve-child' ); ?></h2>
					<p class="rm-section-desc">
						<?php echo wp_kses_post( __( 'Select which schedules will be available for each age group <strong>on each day of the week</strong>.', 'neve-child' ) ); ?>
					</p>
					<p class="rm-section-desc rm-muted">
						<strong><?php echo esc_html__( 'Note:', 'neve-child' ); ?></strong>
						<?php echo esc_html__( 'Each day has different schedules available based on product variations.', 'neve-child' ); ?>
					</p>

					<!-- Tabs de días -->
					<div class="rocomadrid-tabs">
						<?php foreach ( $available_days as $index => $day ) : ?>
							<div class="rocomadrid-tab <?php echo $index === 0 ? 'active' : ''; ?>"
								data-tab="<?php echo sanitize_title( $day ); ?>"
								onclick="switchTab('<?php echo sanitize_title( $day ); ?>')">
								<?php echo esc_html( $day ); ?>
							</div>
						<?php endforeach; ?>
					</div>

					<?php foreach ( $available_days as $index => $day ) :
						$day_slug = sanitize_title( $day );
						$day_schedules = self::get_schedules_by_day( $day );
						$children_day = isset( $children_schedules[ $day ] ) ? $children_schedules[ $day ] : array();
						$teenagers_day = isset( $teenagers_schedules[ $day ] ) ? $teenagers_schedules[ $day ] : array();
						$adults_day = isset( $adults_schedules[ $day ] ) ? $adults_schedules[ $day ] : array();
						?>
						<div class="rocomadrid-tab-content <?php echo $index === 0 ? 'active' : ''; ?>"
							id="tab-<?php echo $day_slug; ?>">

							<h3><?php echo esc_html( $day ); ?></h3>

							<?php if ( empty( $day_schedules ) ) : ?>
								<p class="no-schedules">
									<?php echo esc_html__( 'No schedules available for this day.', 'neve-child' ); ?>
								</p>
							<?php else : ?>
								<p class="rm-muted">
									<?php echo esc_html__( 'Available schedules this day:', 'neve-child' ); ?>
									<strong><?php echo count( $day_schedules ); ?></strong>
								</p>

								<div class="schedules-grid">

									<!-- Columna Menores -->
									<div class="schedules-col">
										<div class="schedules-box children">
											<h4><?php echo esc_html__( 'Children (6-12 years)', 'neve-child' ); ?></h4>
											<p class="rm-schedule-price">
												<?php echo esc_html__( 'Price:', 'neve-child' ); ?>
												<?php echo esc_html( $price_children_1day ); ?>€/<?php echo esc_html__( 'month', 'neve-child' ); ?>
											</p>
											<div class="btn-group">
												<button type="button" class="button button-small"
													onclick="toggleAll('children_schedules_<?php echo $day_slug; ?>', true)">
													✓ <?php echo esc_html__( 'All', 'neve-child' ); ?>
												</button>
												<button type="button" class="button button-small"
													onclick="toggleAll('children_schedules_<?php echo $day_slug; ?>', false)">
													✗ <?php echo esc_html__( 'None', 'neve-child' ); ?>
												</button>
											</div>
											<?php foreach ( $day_schedules as $schedule ) : ?>
												<label class="schedule-label">
													<input type="checkbox" name="children_schedules_<?php echo $day_slug; ?>[]"
														value="<?php echo esc_attr( $schedule ); ?>" <?php checked( in_array( $schedule, $children_day ) ); ?> />
													<span class="schedule-time"><?php echo esc_html( $schedule ); ?></span>
												</label>
											<?php endforeach; ?>
											<p class="rm-schedule-selected">
												<?php echo esc_html__( 'Selected:', 'neve-child' ); ?>
												<strong><?php echo count( $children_day ); ?></strong>
											</p>
										</div>
									</div>

									<!-- Columna Adolescentes -->
									<div class="schedules-col">
										<div class="schedules-box teenagers">
											<h4><?php echo esc_html__( 'Teenagers (12-18 years)', 'neve-child' ); ?></h4>
											<p class="rm-schedule-price">
												<?php echo esc_html__( 'Price:', 'neve-child' ); ?>
												<?php echo esc_html( $price_teenagers_1day ); ?>€/<?php echo esc_html__( 'month', 'neve-child' ); ?>
											</p>
											<div class="btn-group">
												<button type="button" class="button button-small"
													onclick="toggleAll('teenagers_schedules_<?php echo $day_slug; ?>', true)">
													✓ <?php echo esc_html__( 'All', 'neve-child' ); ?>
												</button>
												<button type="button" class="button button-small"
													onclick="toggleAll('teenagers_schedules_<?php echo $day_slug; ?>', false)">
													✗ <?php echo esc_html__( 'None', 'neve-child' ); ?>
												</button>
											</div>
											<?php foreach ( $day_schedules as $schedule ) : ?>
												<label class="schedule-label">
													<input type="checkbox" name="teenagers_schedules_<?php echo $day_slug; ?>[]"
														value="<?php echo esc_attr( $schedule ); ?>" <?php checked( in_array( $schedule, $teenagers_day ) ); ?> />
													<span class="schedule-time"><?php echo esc_html( $schedule ); ?></span>
												</label>
											<?php endforeach; ?>
											<p class="rm-schedule-selected">
												<?php echo esc_html__( 'Selected:', 'neve-child' ); ?>
												<strong><?php echo count( $teenagers_day ); ?></strong>
											</p>
										</div>
									</div>

									<!-- Columna Adultos -->
									<div class="schedules-col">
										<div class="schedules-box adults">
											<h4><?php echo esc_html__( 'Adults', 'neve-child' ); ?></h4>
											<p class="rm-schedule-price">
												<?php echo esc_html__( 'Price:', 'neve-child' ); ?>
												<?php echo esc_html( $price_adults_1day ); ?>€/<?php echo esc_html__( 'month', 'neve-child' ); ?>
											</p>
											<div class="btn-group">
												<button type="button" class="button button-small"
													onclick="toggleAll('adults_schedules_<?php echo $day_slug; ?>', true)">
													✓ <?php echo esc_html__( 'All', 'neve-child' ); ?>
												</button>
												<button type="button" class="button button-small"
													onclick="toggleAll('adults_schedules_<?php echo $day_slug; ?>', false)">
													✗ <?php echo esc_html__( 'None', 'neve-child' ); ?>
												</button>
											</div>
											<?php foreach ( $day_schedules as $schedule ) : ?>
												<label class="schedule-label">
													<input type="checkbox" name="adults_schedules_<?php echo $day_slug; ?>[]"
														value="<?php echo esc_attr( $schedule ); ?>" <?php checked( in_array( $schedule, $adults_day ) ); ?> />
													<span class="schedule-time"><?php echo esc_html( $schedule ); ?></span>
												</label>
											<?php endforeach; ?>
											<p class="rm-schedule-selected">
												<?php echo esc_html__( 'Selected:', 'neve-child' ); ?>
												<strong><?php echo count( $adults_day ); ?></strong>
											</p>
										</div>
									</div>

								</div>
							<?php endif; ?>
						</div>
					<?php endforeach; ?>
				</div>

				<!-- ===================== SECCIÓN: Suscripciones ===================== -->
				<div class="rm-section">
					<h2><?php echo esc_html__( 'Subscription Renewal Sync', 'neve-child' ); ?></h2>
					<p class="rm-section-desc">
						<?php echo wp_kses_post( __( 'Set the day of the month on which subscription renewals are synchronized for all product variations (Single Days and Classes). Set to <strong>0</strong> to disable synchronization.', 'neve-child' ) ); ?>
					</p>

					<div class="rm-field-row">
						<label
							for="subscription_sync_day"><?php echo esc_html__( 'Renewal Day of Month', 'neve-child' ); ?></label>
						<div class="rm-field-input">
							<input type="number" id="subscription_sync_day" name="subscription_sync_day"
								value="<?php echo esc_attr( $subscription_sync_day ); ?>" min="0" max="28" step="1"
								class="rm-inline-input" />
							<p class="description">
								<?php
								if ( $subscription_sync_day > 0 ) {
									echo sprintf(
										// translators: %d: day of the month.
										esc_html__( 'Currently: day %d of each month. Applied to all Single Days and Classes product variations via _subscription_payment_sync_date.', 'neve-child' ),
										$subscription_sync_day
									);
								} else {
									echo esc_html__( 'Currently: synchronization disabled (0). Enter a value between 1 and 28 to enable.', 'neve-child' );
								}
								?>
							</p>
						</div>
					</div>
				</div>

				<!-- ===================== RESUMEN DE PRECIOS ===================== -->
				<div class="rm-price-summary">
					<strong><?php echo esc_html__( 'Price summary with current settings:', 'neve-child' ); ?></strong><br>
					<strong><?php echo esc_html__( '1 day/week Adults:', 'neve-child' ); ?></strong>
					<?php echo esc_html__( 'Morning', 'neve-child' ); ?> = <?php echo $price_adults_1day; ?>€ |
					<?php echo esc_html__( 'Afternoon', 'neve-child' ); ?> =
					<?php echo $price_adults_1day + $turno_afternoon_1day; ?>€ |
					<?php echo esc_html__( 'Special', 'neve-child' ); ?> =
					<?php echo $price_adults_1day + $turno_special_1day; ?>€<br>
					<strong><?php echo esc_html__( '2 days/week Adults:', 'neve-child' ); ?></strong>
					<?php echo esc_html__( 'Morning', 'neve-child' ); ?> = <?php echo $price_adults_2days; ?>€ |
					<?php echo esc_html__( 'Afternoon', 'neve-child' ); ?> =
					<?php echo $price_adults_2days + $turno_afternoon_2days; ?>€<br>
					<strong><?php echo esc_html__( 'Children:', 'neve-child' ); ?></strong>
					<?php echo esc_html__( '1 day', 'neve-child' ); ?> = <?php echo $price_children_1day; ?>€ |
					<?php echo esc_html__( '2 days', 'neve-child' ); ?> = <?php echo $price_children_2days; ?>€ |
					<strong><?php echo esc_html__( 'Teenagers:', 'neve-child' ); ?></strong>
					<?php echo esc_html__( '1 day', 'neve-child' ); ?> = <?php echo $price_teenagers_1day; ?>€ |
					<?php echo esc_html__( '2 days', 'neve-child' ); ?> = <?php echo $price_teenagers_2days; ?>€<br>
					<br>
					<em>Quarterly (<?php echo $quarterly_discount; ?>% off) example on
						<?php echo $price_adults_1day + $turno_afternoon_1day; ?>€:
						<?php echo round( ( $price_adults_1day + $turno_afternoon_1day ) * 3 * ( 1 - $quarterly_discount / 100 ) ); ?>€
						|
						Annual (<?php echo $annual_discount; ?>% off):
						<?php echo round( ( $price_adults_1day + $turno_afternoon_1day ) * 12 * ( 1 - $annual_discount / 100 ) ); ?>€
					</em>
				</div>

				<p class="submit">
					<input type="submit" name="rocomadrid_save_settings" class="button-primary"
						value="<?php echo esc_attr__( 'Save Settings', 'neve-child' ); ?>" />
				</p>
			</form>
		</div>
		<?php
	}
}
