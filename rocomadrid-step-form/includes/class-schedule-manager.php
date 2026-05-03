<?php
/**
 * Editor directo de variaciones WooCommerce
 *
 * Permite ver, anadir y eliminar variaciones directamente
 * sobre los productos (sin intermediario wp_options).
 * Comprueba suscripciones activas antes de eliminar.
 *
 * Pagina admin: WooCommerce > Schedule Manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Schedule_Manager {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ) );
		add_action( 'wp_ajax_rocomadrid_sm_get_days', array( __CLASS__, 'ajax_get_days' ) );
		add_action( 'wp_ajax_rocomadrid_sm_get_variations', array( __CLASS__, 'ajax_get_variations' ) );
		add_action( 'wp_ajax_rocomadrid_sm_create_variation', array( __CLASS__, 'ajax_create_variation' ) );
		add_action( 'wp_ajax_rocomadrid_sm_delete_variation', array( __CLASS__, 'ajax_delete_variation' ) );
	}

	public static function register_menu() {
		add_submenu_page(
			'rocomadrid-pricing',
			__( 'Schedule Manager', 'neve-child' ),
			__( 'Schedule Manager', 'neve-child' ),
			'manage_woocommerce',
			'rocomadrid-schedule-manager',
			array( __CLASS__, 'render_page' )
		);
	}

	// ============================================
	// HELPERS
	// ============================================

	private static function get_product_id( $type ) {
		if ( 'single' === $type ) {
			return RocoMadrid_Step_Form::product_dias_sueltos_id();
		}
		if ( 'classes' === $type ) {
			return RocoMadrid_Step_Form::product_tarifas_id();
		}
		return 0;
	}

	private static function get_day_taxonomy( $type ) {
		return ( 'single' === $type ) ? 'pa_dia-suelto' : 'pa_dias';
	}

	/**
	 * Contar suscripciones activas para una variacion
	 */
	private static function count_active_subscriptions( $variation_id ) {
		if ( ! function_exists( 'wcs_get_subscriptions' ) ) {
			return 0;
		}
		$subs = wcs_get_subscriptions( array(
			'subscription_status' => array( 'active', 'pending' ),
			'subscriptions_per_page' => -1,
		) );
		$count = 0;
		foreach ( $subs as $sub ) {
			foreach ( $sub->get_items() as $item ) {
				if ( intval( $item->get_variation_id() ) === intval( $variation_id ) ) {
					$count++;
					break;
				}
			}
		}
		return $count;
	}

	/**
	 * Asegurar que un termino de atributo existe
	 */
	private static function ensure_term( $taxonomy, $term_name ) {
		$term = get_term_by( 'name', $term_name, $taxonomy );
		if ( $term ) {
			return $term->slug;
		}
		$result = wp_insert_term( $term_name, $taxonomy );
		if ( is_wp_error( $result ) ) {
			$slug = sanitize_title( $term_name );
			$existing = get_term_by( 'slug', $slug, $taxonomy );
			return $existing ? $existing->slug : $slug;
		}
		$new_term = get_term( $result['term_id'], $taxonomy );
		return $new_term->slug;
	}

	/**
	 * Asegurar que un atributo global existe en WooCommerce
	 */
	private static function ensure_global_attribute( $taxonomy ) {
		$attr_name = str_replace( 'pa_', '', $taxonomy );
		$existing = wc_attribute_taxonomy_id_by_name( $taxonomy );
		if ( $existing ) {
			return;
		}
		wc_create_attribute( array(
			'name' => ucfirst( str_replace( '-', ' ', $attr_name ) ),
			'slug' => $attr_name,
			'type' => 'select',
			'order_by' => 'menu_order',
			'has_archives' => false,
		) );
	}

	/**
	 * Anadir un termino al atributo del producto padre
	 */
	private static function add_term_to_product_attribute( $product_id, $taxonomy, $term_slug ) {
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return;
		}
		$attributes = $product->get_attributes();

		if ( isset( $attributes[ $taxonomy ] ) ) {
			$attr = $attributes[ $taxonomy ];
			$options = $attr->get_options();
			$term = get_term_by( 'slug', $term_slug, $taxonomy );
			if ( $term && ! in_array( $term->term_id, $options, true ) ) {
				$options[] = $term->term_id;
				$attr->set_options( $options );
				$attributes[ $taxonomy ] = $attr;
			}
		} else {
			$attr = new WC_Product_Attribute();
			$attr->set_name( $taxonomy );
			$term = get_term_by( 'slug', $term_slug, $taxonomy );
			$attr->set_options( $term ? array( $term->term_id ) : array() );
			$attr->set_position( count( $attributes ) );
			$attr->set_visible( true );
			$attr->set_variation( true );
			$attributes[ $taxonomy ] = $attr;
		}

		$product->set_attributes( $attributes );
		$product->save();
	}

	/**
	 * Buscar variacion existente con los mismos atributos
	 */
	private static function find_existing_variation( $product_id, $attrs ) {
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return false;
		}
		foreach ( $product->get_children() as $child_id ) {
			$child = wc_get_product( $child_id );
			if ( ! $child ) {
				continue;
			}
			$child_attrs = $child->get_attributes();
			$match = true;
			foreach ( $attrs as $key => $val ) {
				if ( ! isset( $child_attrs[ $key ] ) || $child_attrs[ $key ] !== $val ) {
					$match = false;
					break;
				}
			}
			if ( $match ) {
				return $child_id;
			}
		}
		return false;
	}

	// ============================================
	// AJAX: OBTENER DIAS
	// ============================================

	public static function ajax_get_days() {
		check_ajax_referer( 'rocomadrid_schedule_manager', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}

		$type = sanitize_text_field( wp_unslash( $_POST['product_type'] ?? '' ) );
		$product_id = self::get_product_id( $type );
		if ( ! $product_id ) {
			wp_send_json_error( __( 'Invalid product type', 'neve-child' ) );
		}

		$taxonomy = self::get_day_taxonomy( $type );
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( __( 'Product not found', 'neve-child' ) );
		}

		$attributes = $product->get_attributes();
		$days = array();

		if ( isset( $attributes[ $taxonomy ] ) ) {
			$attr = $attributes[ $taxonomy ];
			$term_ids = $attr->get_options();
			foreach ( $term_ids as $tid ) {
				$term = get_term( $tid, $taxonomy );
				if ( $term && ! is_wp_error( $term ) ) {
					$days[] = array(
						'slug' => $term->slug,
						'name' => $term->name,
					);
				}
			}
		}

		usort( $days, function ( $a, $b ) {
			return strcmp( $a['name'], $b['name'] );
		} );

		wp_send_json_success( array( 'days' => $days ) );
	}

	// ============================================
	// AJAX: OBTENER VARIACIONES
	// ============================================

	public static function ajax_get_variations() {
		check_ajax_referer( 'rocomadrid_schedule_manager', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}

		$type = sanitize_text_field( wp_unslash( $_POST['product_type'] ?? '' ) );
		$day = sanitize_text_field( wp_unslash( $_POST['day'] ?? '' ) );
		$product_id = self::get_product_id( $type );
		$taxonomy = self::get_day_taxonomy( $type );

		if ( ! $product_id || empty( $day ) ) {
			wp_send_json_error( __( 'Missing parameters', 'neve-child' ) );
		}

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( __( 'Product not found', 'neve-child' ) );
		}

		$afternoon_hour = RocoMadrid_SF_Settings::get_afternoon_hour();
		$variations = array();

		foreach ( $product->get_children() as $child_id ) {
			$child = wc_get_product( $child_id );
			if ( ! $child ) {
				continue;
			}
			$child_attrs = $child->get_attributes();
			$day_attr = $child_attrs[ $taxonomy ] ?? '';
			if ( $day_attr !== $day ) {
				continue;
			}

			$schedule = $child_attrs['pa_horario'] ?? '';
			$hour = intval( substr( $schedule, 0, 2 ) );
			$turno = ( $hour < $afternoon_hour ) ? 'morning' : 'afternoon';

			$v_data = array(
				'id' => $child_id,
				'schedule' => $schedule,
				'turno' => $turno,
				'price' => $child->get_regular_price(),
				'stock' => $child->get_stock_quantity(),
				'status' => $child->get_status(),
				'sku' => $child->get_sku(),
				'subs' => self::count_active_subscriptions( $child_id ),
			);

			if ( 'classes' === $type ) {
				$v_data['age'] = $child_attrs['pa_edad'] ?? '';
			}

			$variations[] = $v_data;
		}

		usort( $variations, function ( $a, $b ) {
			return strcmp( $a['schedule'], $b['schedule'] );
		} );

		wp_send_json_success( array(
			'variations' => $variations,
			'product_type' => $type,
		) );
	}

	// ============================================
	// AJAX: CREAR VARIACION
	// ============================================

	public static function ajax_create_variation() {
		check_ajax_referer( 'rocomadrid_schedule_manager', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}

		$type = sanitize_text_field( wp_unslash( $_POST['product_type'] ?? '' ) );
		$day = sanitize_text_field( wp_unslash( $_POST['day'] ?? '' ) );
		$time_start = sanitize_text_field( wp_unslash( $_POST['time_start'] ?? '' ) );
		$time_end = sanitize_text_field( wp_unslash( $_POST['time_end'] ?? '' ) );
		$age = sanitize_text_field( wp_unslash( $_POST['age'] ?? '' ) );
		$stock = isset( $_POST['stock'] ) && $_POST['stock'] !== '' ? intval( $_POST['stock'] ) : null;

		$product_id = self::get_product_id( $type );
		if ( ! $product_id ) {
			wp_send_json_error( __( 'Invalid product type', 'neve-child' ) );
		}

		if ( ! preg_match( '/^\d{2}:\d{2}$/', $time_start ) || ! preg_match( '/^\d{2}:\d{2}$/', $time_end ) ) {
			wp_send_json_error( __( 'Invalid time format', 'neve-child' ) );
		}

		$schedule_value = $time_start . '-' . $time_end;
		$taxonomy = self::get_day_taxonomy( $type );

		// Asegurar terminos
		self::ensure_global_attribute( $taxonomy );
		self::ensure_global_attribute( 'pa_horario' );

		$day_slug = self::ensure_term( $taxonomy, $day );
		$schedule_slug = self::ensure_term( 'pa_horario', $schedule_value );

		$attrs = array(
			$taxonomy => $day_slug,
			'pa_horario' => $schedule_slug,
		);

		if ( 'classes' === $type && ! empty( $age ) ) {
			self::ensure_global_attribute( 'pa_edad' );
			$age_slug = self::ensure_term( 'pa_edad', $age );
			$attrs['pa_edad'] = $age_slug;
		}

		// Comprobar si ya existe
		$existing = self::find_existing_variation( $product_id, $attrs );
		if ( $existing ) {
			wp_send_json_error( __( 'A variation with these attributes already exists', 'neve-child' ) );
		}

		// Calcular precio desde Settings
		$afternoon_hour = RocoMadrid_SF_Settings::get_afternoon_hour();
		$hour = intval( substr( $schedule_value, 0, 2 ) );

		if ( 'single' === $type ) {
			$prices = RocoMadrid_SF_Settings::get_single_day_prices();
			$day_lower = strtolower( $day );
			if ( strpos( $day_lower, 'friday' ) !== false || strpos( $day_lower, 'saturday' ) !== false ) {
				$price = $prices['special'];
			} elseif ( $hour < $afternoon_hour ) {
				$price = $prices['morning'];
			} else {
				$price = $prices['afternoon'];
			}
		} else {
			$price = RocoMadrid_SF_Settings::get_classes_price( $age, $schedule_value );
		}

		// Anadir terminos al producto padre
		self::add_term_to_product_attribute( $product_id, $taxonomy, $day_slug );
		self::add_term_to_product_attribute( $product_id, 'pa_horario', $schedule_slug );
		if ( 'classes' === $type && ! empty( $age ) ) {
			self::add_term_to_product_attribute( $product_id, 'pa_edad', $age_slug );
		}

		// Crear variacion (compatible con WooCommerce Subscriptions)
		$is_subscription = class_exists( 'WC_Subscriptions' ) && class_exists( 'WC_Product_Subscription_Variation' );
		if ( $is_subscription ) {
			$variation = new WC_Product_Subscription_Variation();
		} else {
			$variation = new WC_Product_Variation();
		}
		$variation->set_parent_id( $product_id );
		$variation->set_attributes( $attrs );
		$variation->set_regular_price( (string) $price );
		$variation->set_price( (string) $price );
		$variation->set_status( 'publish' );
		$variation->set_virtual( true );

		// Configurar stock
		if ( $stock !== null && $stock >= 0 ) {
			$variation->set_manage_stock( true );
			$variation->set_stock_quantity( $stock );
			$variation->set_stock_status( $stock > 0 ? 'instock' : 'outofstock' );
		} else {
			$variation->set_manage_stock( false );
			$variation->set_stock_status( 'instock' );
		}

		// Meta de suscripción ANTES del save (para que WCS sincronice _price)
		if ( $is_subscription ) {
			$variation->update_meta_data( '_subscription_price', (string) $price );
			$variation->update_meta_data( '_subscription_period', 'month' );
			$variation->update_meta_data( '_subscription_period_interval', '1' );
			$variation->update_meta_data( '_subscription_length', '0' );
		}

		// Generar SKU
		$turno = ( $hour < $afternoon_hour ) ? 'M' : 'T';
		$day_short = strtolower( substr( $day, 0, 3 ) );
		$sku_prefix = ( 'single' === $type ) ? 'DS' : 'CL';
		$sku = $sku_prefix . '-' . $day_short . '-' . str_replace( ':', '', $time_start ) . '-' . $turno;
		if ( 'classes' === $type && ! empty( $age ) ) {
			$sku .= '-' . strtolower( substr( $age, 0, 3 ) );
		}
		$existing_sku = wc_get_product_id_by_sku( $sku );
		if ( $existing_sku ) {
			$sku .= '-' . wp_rand( 100, 999 );
		}
		$variation->set_sku( $sku );

		$variation->save();

		// Limpiar cache del producto padre
		wc_delete_product_transients( $product_id );
		WC_Product_Variable::sync( $product_id );
		$parent = wc_get_product( $product_id );
		if ( $parent ) {
			$parent->save();
		}

		wp_send_json_success( array(
			'id' => $variation->get_id(),
			'price' => $price,
			'sku' => $sku,
			'stock' => $stock,
		) );
	}

	// ============================================
	// AJAX: ELIMINAR VARIACION
	// ============================================

	public static function ajax_delete_variation() {
		check_ajax_referer( 'rocomadrid_schedule_manager', 'nonce' );
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( 'Unauthorized' );
		}

		$variation_id = intval( $_POST['variation_id'] ?? 0 );
		if ( ! $variation_id ) {
			wp_send_json_error( __( 'Invalid variation ID', 'neve-child' ) );
		}

		$variation = wc_get_product( $variation_id );
		if ( ! $variation || ! $variation->is_type( 'variation' ) ) {
			wp_send_json_error( __( 'Variation not found', 'neve-child' ) );
		}

		// Comprobar suscripciones activas
		$subs = self::count_active_subscriptions( $variation_id );
		if ( $subs > 0 ) {
			wp_send_json_error(
				sprintf(
					__( 'Cannot delete: %d active subscriptions use this variation.', 'neve-child' ),
					$subs
				)
			);
		}

		$parent_id = $variation->get_parent_id();
		$variation->delete( true );

		if ( $parent_id ) {
			wc_delete_product_transients( $parent_id );
		}

		wp_send_json_success( array( 'deleted' => $variation_id ) );
	}

	// ============================================
	// RENDER DE LA PAGINA
	// ============================================

	public static function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		$prices = RocoMadrid_SF_Settings::get_single_day_prices();
		$afternoon_hour = RocoMadrid_SF_Settings::get_afternoon_hour();

		wp_localize_script( 'rocomadrid-admin-js', 'rmSM', array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'rocomadrid_schedule_manager' ),
			'afternoonHour' => $afternoon_hour,
			'prices' => array(
				'morning' => $prices['morning'],
				'afternoon' => $prices['afternoon'],
				'special' => $prices['special'],
				'children_2days' => RocoMadrid_SF_Settings::get_price_children_2days(),
				'adults_2days_morning' => RocoMadrid_SF_Settings::get_price_adults_2days(),
				'adults_2days_afternoon' => RocoMadrid_SF_Settings::get_price_adults_2days() + RocoMadrid_SF_Settings::get_turno_afternoon_2days(),
			),
			'i18n' => array(
				'selectProduct' => __( '-- Select product --', 'neve-child' ),
				'selectProductFirst' => __( '-- Select product first --', 'neve-child' ),
				'selectDay' => __( '-- Select day --', 'neve-child' ),
				'loading' => __( 'Loading...', 'neve-child' ),
				'loadingVariations' => __( 'Loading variations...', 'neve-child' ),
				'noVariations' => __( 'No variations found for this day.', 'neve-child' ),
				'variations' => __( 'Variations', 'neve-child' ),
				'schedule' => __( 'Schedule', 'neve-child' ),
				'shift' => __( 'Shift', 'neve-child' ),
				'price' => __( 'Price', 'neve-child' ),
				'stock' => __( 'Stock', 'neve-child' ),
				'status' => __( 'Status', 'neve-child' ),
				'subs' => __( 'Subs', 'neve-child' ),
				'age' => __( 'Age', 'neve-child' ),
				'morning' => __( 'Morning', 'neve-child' ),
				'afternoon' => __( 'Afternoon', 'neve-child' ),
				'active' => __( 'Active', 'neve-child' ),
				'addVariation' => __( 'Add variation', 'neve-child' ),
				'creating' => __( 'Creating...', 'neve-child' ),
				'enterTimes' => __( 'Please enter start and end times.', 'neve-child' ),
				'confirmDelete' => __( 'Delete variation #%1$d (%2$s)?', 'neve-child' ),
				'cannotDelete' => __( 'Cannot delete: %d active subscriptions use this variation.', 'neve-child' ),
				'error' => __( 'Error', 'neve-child' ),
				'requestFailed' => __( 'Request failed. Please try again.', 'neve-child' ),
				'autoPrice' => __( 'Calculated from Settings', 'neve-child' ),
			),
		) );

		?>
		<div class="wrap sch-wrap">
			<h1><?php echo "\xF0\x9F\x93\x85 " . esc_html__( 'Schedule Manager', 'neve-child' ); ?></h1>
			<p class="sch-subtitle">
				<?php echo esc_html__( 'View, add and delete product variations directly. Changes apply immediately to WooCommerce products.', 'neve-child' ); ?>
			</p>

			<div class="ve-selectors">
				<div class="ve-selector-group">
					<label for="sch-product-type"><?php echo esc_html__( 'Product', 'neve-child' ); ?></label>
					<select id="sch-product-type">
						<option value=""><?php echo esc_html__( '-- Select product --', 'neve-child' ); ?></option>
						<option value="single"><?php echo esc_html__( 'Single Days', 'neve-child' ); ?></option>
						<option value="classes"><?php echo esc_html__( 'Classes (2 days)', 'neve-child' ); ?></option>
					</select>
				</div>
				<div class="ve-selector-group">
					<label for="sch-day"><?php echo esc_html__( 'Day', 'neve-child' ); ?></label>
					<select id="sch-day" disabled>
						<option value=""><?php echo esc_html__( '-- Select product first --', 'neve-child' ); ?></option>
					</select>
				</div>
			</div>

			<div id="sch-content" style="display:none;">
				<div id="sch-add-form" class="ve-add-card" style="display:none;">
					<div class="ve-add-header">
						<div class="ve-add-header-info">
							<h3>
								<?php echo esc_html__( 'Add variation', 'neve-child' ); ?>
							</h3>
							<p>
								<?php echo esc_html__( 'Price is calculated automatically from Settings.', 'neve-child' ); ?>
							</p>
						</div>
					</div>
					<div class="ve-add-body">
						<div class="ve-field">
							<label>
								<?php echo esc_html__( 'Schedule', 'neve-child' ); ?>
							</label>
							<div class="ve-time-inputs">
								<div class="ve-time-select">
									<select id="sch-new-time-start-h">
										<?php for ( $h = 6; $h <= 22; $h++ ) : ?>
											<option value="<?php echo sprintf( '%02d', $h ); ?>">
												<?php echo sprintf( '%02d', $h ); ?>
											</option>
										<?php endfor; ?>
									</select>
									<span>:</span>
									<select id="sch-new-time-start-m">
										<option value="00">00</option>
										<option value="15">15</option>
										<option value="30">30</option>
										<option value="45">45</option>
									</select>
								</div>
								<span class="ve-time-sep">→</span>
								<div class="ve-time-select">
									<select id="sch-new-time-end-h">
										<?php for ( $h = 6; $h <= 23; $h++ ) : ?>
											<option value="<?php echo sprintf( '%02d', $h ); ?>">
												<?php echo sprintf( '%02d', $h ); ?>
											</option>
										<?php endfor; ?>
									</select>
									<span>:</span>
									<select id="sch-new-time-end-m">
										<option value="00">00</option>
										<option value="15">15</option>
										<option value="30">30</option>
										<option value="45">45</option>
									</select>
								</div>
							</div>
						</div>
						<div class="ve-field" id="sch-age-field" style="display:none;">
							<label for="sch-new-age">
								<?php echo esc_html__( 'Age group', 'neve-child' ); ?>
							</label>
							<select id="sch-new-age">
								<option value="Adults">
									<?php echo esc_html__( 'Adults', 'neve-child' ); ?>
								</option>
								<option value="Children">
									<?php echo esc_html__( 'Children', 'neve-child' ); ?>
								</option>
							</select>
						</div>
						<div class="ve-field">
							<label for="sch-new-stock">
								<?php echo esc_html__( 'Stock', 'neve-child' ); ?>
							</label>
							<input type="number" id="sch-new-stock" min="0" step="1"
								placeholder="<?php echo esc_attr__( 'Unlimited', 'neve-child' ); ?>" style="width:100px;" />
						</div>
						<div class="ve-field">
							<label>
								<?php echo esc_html__( 'Price', 'neve-child' ); ?>
							</label>
							<div id="sch-calc-price" class="ve-price-badge">&mdash;</div>
						</div>
						<div class="ve-field ve-field-action">
							<label>&nbsp;</label>
							<button id="sch-btn-add" class="btn btn-primary-rm">
								<?php echo "\xE2\x9E\x95 " . esc_html__( 'Add variation', 'neve-child' ); ?>
							</button>
						</div>
					</div>
				</div>
				<div id="sch-variations-container"></div>


			</div>
		</div>
		</div>
		<?php
	}
}