<?php
/**
 * Handlers AJAX del formulario por pasos
 *
 * - wc_step_form_get_next_step: controlador de flujo (3 pasos por producto)
 * - wc_step_form_get_product: renderiza HTML con 3 planes de precio
 * - wc_step_form_add_to_cart: añade al carrito con override de precio/período
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Ajax {

	public static function init() {
		// Siguiente paso
		add_action( 'wp_ajax_wc_step_form_get_next_step', array( __CLASS__, 'get_next_step' ) );
		add_action( 'wp_ajax_nopriv_wc_step_form_get_next_step', array( __CLASS__, 'get_next_step' ) );

		// Producto final
		add_action( 'wp_ajax_wc_step_form_get_product', array( __CLASS__, 'get_product' ) );
		add_action( 'wp_ajax_nopriv_wc_step_form_get_product', array( __CLASS__, 'get_product' ) );

		// Añadir al carrito
		add_action( 'wp_ajax_wc_step_form_add_to_cart', array( __CLASS__, 'add_to_cart' ) );
		add_action( 'wp_ajax_nopriv_wc_step_form_add_to_cart', array( __CLASS__, 'add_to_cart' ) );
	}

	// ============================================
	// OBTENER SIGUIENTE PASO
	// ============================================

	public static function get_next_step() {
		check_ajax_referer( 'wc_step_form_nonce', 'nonce' );

		$selections = isset( $_POST['selections'] ) ? array_map( 'sanitize_text_field', $_POST['selections'] ) : array();
		$current_step = intval( $_POST['current_step'] );
		$frequency = isset( $selections['frequency'] ) ? $selections['frequency'] : null;

		// PASO 0: frecuencia
		if ( $current_step === 0 || empty( $frequency ) ) {
			wp_send_json_success( array(
				'type' => 'frequency_selection',
				'step_number' => 1,
				'total_steps' => 5,
			) );
			return;
		}

		$product_dias_sueltos = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product_tarifas = RocoMadrid_Step_Form::product_tarifas_id();

		$product_id = ( $frequency === '1_day' ) ? $product_dias_sueltos : $product_tarifas;
		$product = wc_get_product( $product_id );

		if ( ! $product ) {
			wp_send_json_error( sprintf( __( 'Product not found: %s', 'neve-child' ), $product_id ) );
			return;
		}

		// Definir flujo según producto
		if ( $frequency === '1_day' ) {
			$flow = array(
				1 => array( 'name' => 'age_addon', 'label' => __( 'Select the student age', 'neve-child' ), 'is_addon' => true ),
				2 => array( 'name' => 'pa_dia-suelto', 'label' => __( 'Select the class day', 'neve-child' ) ),
				3 => array( 'name' => 'pa_horario', 'label' => __( 'Select the schedule', 'neve-child' ) ),
			);
		} else {
			$flow = array(
				1 => array( 'name' => 'age_addon_2days', 'label' => __( 'Select the age group', 'neve-child' ), 'is_addon' => true ),
				2 => array( 'name' => 'pa_dias', 'label' => __( 'Select the class days', 'neve-child' ) ),
				3 => array( 'name' => 'pa_horario', 'label' => __( 'Select the schedule', 'neve-child' ) ),
			);
		}

		$attribute_step = $current_step;

		// Si hemos completado todos los pasos, producto final
		if ( $attribute_step > count( $flow ) ) {
			wp_send_json_success( array(
				'type' => 'final_product',
				'product_id' => $product_id,
			) );
			return;
		}

		if ( ! isset( $flow[ $attribute_step ] ) ) {
			wp_send_json_error( sprintf( __( 'Invalid step: %s', 'neve-child' ), $attribute_step ) );
			return;
		}

		$current_attr = $flow[ $attribute_step ];
		$values = array();

		if ( isset( $current_attr['is_addon'] ) && $current_attr['is_addon'] ) {
			// Add-on de edad
			if ( $current_attr['name'] === 'age_addon_2days' ) {
				$values = RocoMadrid_SF_Pricing::get_age_addon_values_2days();
			} else {
				$values = RocoMadrid_SF_Pricing::get_age_addon_values();
			}
		} else {
			// Atributo de variación
			$values = self::get_variation_attribute_values( $product_id, $current_attr['name'], $selections );

			// Filtrar días sin horarios configurados para el flujo de 1 día
			if ( $current_attr['name'] === 'pa_dia-suelto' && isset( $selections['age_addon'] ) ) {
				$age = $selections['age_addon'];
				$values = array_values( array_filter( $values, function ( $day_value ) use ( $product_id, $selections, $age ) {
					$temp_selections = array_merge( $selections, array( 'pa_dia-suelto' => $day_value ) );
					$horarios = self::get_variation_attribute_values( $product_id, 'pa_horario', $temp_selections );
					$filtered = RocoMadrid_SF_Pricing::filter_schedules_by_age( $horarios, $age, $day_value );
					return ! empty( $filtered );
				} ) );
			}

			// Filtrar pares de días sin horarios configurados para el flujo de 2 días
			if ( $current_attr['name'] === 'pa_dias' && isset( $selections['age_addon_2days'] ) ) {
				$age = $selections['age_addon_2days'];
				$values = array_values( array_filter( $values, function ( $days_value ) use ( $product_id, $selections, $age ) {
					$temp_selections = array_merge( $selections, array( 'pa_dias' => $days_value ) );
					$horarios = self::get_variation_attribute_values( $product_id, 'pa_horario', $temp_selections );

					if ( stripos( $days_value, 'Lunes' ) !== false || stripos( $days_value, 'L-X' ) !== false ) {
						$days_to_check = array( 'Lunes', 'Miércoles' );
					} elseif ( stripos( $days_value, 'Martes' ) !== false || stripos( $days_value, 'M-J' ) !== false ) {
						$days_to_check = array( 'Martes', 'Jueves' );
					} else {
						return true;
					}

					$intersect = array_values( array_unique( array_intersect(
						RocoMadrid_SF_Pricing::filter_schedules_by_age( $horarios, $age, $days_to_check[0] ),
						RocoMadrid_SF_Pricing::filter_schedules_by_age( $horarios, $age, $days_to_check[1] )
					) ) );

					return ! empty( $intersect );
				} ) );
			}

			// Filtrar horarios por edad para Días Sueltos (1 día)
			if ( $current_attr['name'] === 'pa_horario' && $frequency === '1_day' && isset( $selections['age_addon'] ) ) {
				$selected_day = isset( $selections['pa_dia-suelto'] ) ? $selections['pa_dia-suelto'] : '';
				$values = RocoMadrid_SF_Pricing::filter_schedules_by_age( $values, $selections['age_addon'], $selected_day );

				if ( empty( $values ) ) {
					$selected_age = $selections['age_addon'];
					$message = sprintf( __( 'No schedules available for %s', 'neve-child' ), $selected_age );
					if ( ! empty( $selected_day ) ) {
						$message .= sprintf( __( ' on %s', 'neve-child' ), $selected_day );
					}
					$message .= '.';

					wp_send_json_success( array(
						'type' => 'no_schedules_for_age',
						'message' => $message,
						'submessage' => self::build_contact_submessage( $selected_day, '', $selected_age ),
						'age' => $selected_age,
						'day' => $selected_day,
					) );
					return;
				}
			}

			// Filtrar horarios por edad para Tarifas (2 días)
			$age_2days = isset( $selections['age_addon_2days'] ) ? $selections['age_addon_2days'] : '';
			if ( $current_attr['name'] === 'pa_horario' && $frequency === '2_days' && ! empty( $age_2days ) ) {
				$selected_days = isset( $selections['pa_dias'] ) ? $selections['pa_dias'] : '';
				$days_to_check = array();

				if ( stripos( $selected_days, 'L-X' ) !== false || stripos( $selected_days, 'Lunes' ) !== false ) {
					$days_to_check = array( 'Lunes', 'Miércoles' );
				} elseif ( stripos( $selected_days, 'M-J' ) !== false || stripos( $selected_days, 'Martes' ) !== false ) {
					$days_to_check = array( 'Martes', 'Jueves' );
				}

				if ( ! empty( $days_to_check ) ) {
					$values = array_values( array_unique( array_intersect(
						RocoMadrid_SF_Pricing::filter_schedules_by_age( $values, $age_2days, $days_to_check[0] ),
						RocoMadrid_SF_Pricing::filter_schedules_by_age( $values, $age_2days, $days_to_check[1] )
					) ) );

					if ( empty( $values ) ) {
						$message = sprintf( __( 'No schedules available for %1$s on %2$s.', 'neve-child' ), $age_2days, $selected_days );

						wp_send_json_success( array(
							'type' => 'no_schedules_for_age',
							'message' => $message,
							'submessage' => self::build_contact_submessage( $selected_days, '', $age_2days ),
							'age' => $age_2days,
							'day' => $selected_days,
						) );
						return;
					}
				}
			}
		}

		if ( empty( $values ) ) {
			wp_send_json_success( array(
				'type' => 'final_product',
				'product_id' => $product_id,
			) );
			return;
		}

		// Si solo hay un valor y NO es horario, autoseleccionar
		$is_schedule = ( $current_attr['name'] === 'pa_horario' );

		if ( count( $values ) === 1 && ! $is_schedule ) {
			wp_send_json_success( array(
				'type' => 'next_step',
				'attribute' => $current_attr,
				'values' => $values,
				'auto_select' => true,
				'step_number' => $attribute_step + 1,
				'total_steps' => 5,
				'product_id' => $product_id,
			) );
			return;
		}

		// Para el paso de horarios, incluir info de stock por opción
		$values_stock = array();
		if ( $is_schedule ) {
			$dia = isset( $selections['pa_dia-suelto'] ) ? $selections['pa_dia-suelto']
				: ( isset( $selections['pa_dias'] ) ? $selections['pa_dias'] : '' );
			$edad = isset( $selections['age_addon'] ) ? $selections['age_addon']
				: ( isset( $selections['age_addon_2days'] ) ? $selections['age_addon_2days'] : '' );

			foreach ( $values as $horario_val ) {
				$test_sel = array_merge( $selections, array( 'pa_horario' => $horario_val ) );
				$var_res = self::find_matching_variation( $product_id, $test_sel );
				$in_stock = true;
				$wa_url = '';
				$form_url = '';

				if ( $var_res ) {
					$var_product = wc_get_product( $var_res['variation_id'] );
					if ( $var_product && ! $var_product->is_in_stock() ) {
						$in_stock = false;
						$msg_text = sprintf(
							__( 'Hello, I\'m interested in the %1$s schedule on %2$s (%3$s) — it shows as full. Can I join the waiting list?', 'neve-child' ),
							$horario_val, $dia, $edad
						);
						$wa_url = 'https://wa.me/34692503272?text=' . rawurlencode( $msg_text );
						$form_url = add_query_arg( array(
							'subject' => rawurlencode( __( 'Availability enquiry', 'neve-child' ) ),
							'mensaje' => rawurlencode( $msg_text ),
						), home_url( '/contacto' ) );
					}
				}

				$values_stock[] = array(
					'value' => $horario_val,
					'in_stock' => $in_stock,
					'wa_url' => esc_url( $wa_url ),
					'form_url' => esc_url( $form_url ),
				);
			}
		}

		wp_send_json_success( array(
			'type' => 'next_step',
			'attribute' => $current_attr,
			'values' => $values,
			'values_stock' => $values_stock,
			'step_number' => $attribute_step + 1,
			'total_steps' => 5,
			'product_id' => $product_id,
		) );
	}

	// ============================================
	// OBTENER VALORES DE ATRIBUTO FILTRADOS
	// ============================================

	public static function get_variation_attribute_values( $product_id, $attribute_name, $selections = array() ) {
		$product = wc_get_product( $product_id );
		if ( ! $product || ! $product->is_type( array( 'variable', 'variable-subscription' ) ) ) {
			return array();
		}

		$values = array();
		$variations = $product->get_available_variations();

		foreach ( $variations as $variation ) {
			$matches = true;

			foreach ( $selections as $sel_attr => $sel_value ) {
				if ( $sel_attr === 'frequency' || $sel_attr === 'age_addon' || $sel_attr === 'age_addon_2days' ) {
					continue;
				}

				$var_attr_key = 'attribute_' . $sel_attr;
				$var_value = isset( $variation['attributes'][ $var_attr_key ] ) ? $variation['attributes'][ $var_attr_key ] : '';

				if ( ! empty( $var_value ) && strtolower( $var_value ) !== strtolower( $sel_value ) ) {
					$matches = false;
					break;
				}
			}

			if ( $matches ) {
				$attr_key = 'attribute_' . $attribute_name;
				$attr_value = isset( $variation['attributes'][ $attr_key ] ) ? $variation['attributes'][ $attr_key ] : '';

				if ( ! empty( $attr_value ) ) {
					$term = get_term_by( 'slug', $attr_value, $attribute_name );
					$display_value = $term ? $term->name : $attr_value;

					if ( ! in_array( $display_value, $values ) ) {
						$values[] = $display_value;
					}
				}
			}
		}

		return $values;
	}

	// ============================================
	// OBTENER PRODUCTO FINAL
	// ============================================

	public static function get_product() {
		check_ajax_referer( 'wc_step_form_nonce', 'nonce' );

		$product_id = intval( $_POST['product_id'] );
		$selections = isset( $_POST['selections'] ) ? $_POST['selections'] : array();

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( 'Product not found' );
			return;
		}

		// Buscar variación
		$variation_id = 0;
		$variation_data = array();

		if ( $product->is_type( array( 'variable', 'variable-subscription' ) ) ) {
			$result = self::find_matching_variation( $product_id, $selections );
			if ( $result ) {
				$variation_id = $result['variation_id'];
				$variation_data = $result['variation_data'];
			} else {
				wp_send_json_success( array(
					'type' => 'no_schedules_for_age',
					'message' => __( 'No available schedule for the selected options. Please try different options.', 'neve-child' ),
				) );
				return;
			}
		}

		// Obtener precio base de la variación real
		$variation_price = null;
		if ( $variation_id ) {
			$variation_product = wc_get_product( $variation_id );
			if ( $variation_product ) {
				// Verificar stock antes de mostrar los planes de compra
				if ( ! $variation_product->is_in_stock() ) {
					$dia = isset( $selections['pa_dia-suelto'] ) ? $selections['pa_dia-suelto'] : ( $selections['pa_dias'] ?? '' );
					$horario = $selections['pa_horario'] ?? '';
					$edad = $selections['age_addon'] ?? ( $selections['age_addon_2days'] ?? '' );

					wp_send_json_success( array(
						'type' => 'no_schedules_for_age',
						'message' => __( 'This schedule is currently full — there are no spots available right now.', 'neve-child' ),
						'submessage' => self::build_contact_submessage( $dia, $horario, $edad ),
					) );
					return;
				}
				$variation_price = floatval( $variation_product->get_regular_price() );
			}
		}

		// Calcular precios usando el precio real de la variación
		$prices = RocoMadrid_SF_Pricing::calculate_plan_prices( $selections, $variation_price );

		// Formatear selecciones
		$frequency = isset( $selections['frequency'] ) ? $selections['frequency'] : '1_day';
		$frequency_text = ( $frequency === '1_day' ) ? __( '1 day/week', 'neve-child' ) : __( '2 days/week', 'neve-child' );

		$day_text = '';
		$schedule_text = '';
		$age_text = '';

		if ( $frequency === '1_day' ) {
			$day_text = isset( $selections['pa_dia-suelto'] ) ? self::translate_day_name( $selections['pa_dia-suelto'] ) : '';
			$schedule_text = isset( $selections['pa_horario'] ) ? $selections['pa_horario'] : '';
			$age_text = isset( $selections['age_addon'] ) ? $selections['age_addon'] : __( 'Adults', 'neve-child' );
		} else {
			$day_text = isset( $selections['pa_dias'] ) ? self::translate_days_pair( $selections['pa_dias'] ) : '';
			$schedule_text = isset( $selections['pa_horario'] ) ? $selections['pa_horario'] : '';
			$age_text = isset( $selections['age_addon_2days'] ) ? $selections['age_addon_2days'] : __( 'Adults', 'neve-child' );
		}

		$quarterly_discount_pct = RocoMadrid_SF_Settings::get_quarterly_discount();
		$annual_discount_pct = RocoMadrid_SF_Settings::get_annual_discount();

		// Calcular pago inicial prorrateado usando la lógica de WooCommerce Subscriptions.
		// WC_Subscriptions_Synchroniser::calculate_first_payment_date() lee el meta
		// _subscription_payment_sync_date del producto y devuelve la fecha del primer pago completo.
		$proration = null;
		if ( $variation_id && class_exists( 'WC_Subscriptions_Synchroniser' ) ) {
			$sync_product = wc_get_product( $variation_id );

			if ( $sync_product ) {
				$first_payment_ts = WC_Subscriptions_Synchroniser::calculate_first_payment_date(
					$sync_product,
					'timestamp'
				);

				if ( $first_payment_ts > 0 ) {
					$tz = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'Europe/Madrid' );
					$today = new DateTime( 'now', $tz );
					$today->setTime( 0, 0, 0 );
					$renewal = new DateTime( '@' . $first_payment_ts );
					$renewal->setTimezone( $tz );
					$renewal->setTime( 0, 0, 0 );

					$days_remaining = intval( $today->diff( $renewal )->days );
					$days_in_month = intval( $today->format( 't' ) );

					if ( $days_remaining > 0 && $days_remaining < $days_in_month ) {
						$prorated_amount = round( floatval( $prices['monthly']['price'] ) * $days_remaining / $days_in_month, 2 );

						$proration = array(
							'amount' => $prorated_amount,
							'renewal_date' => $renewal->format( 'd/m/Y' ),
						);
					}
				}
			}
		}

		ob_start();
		?>
		<div class="product-result-wrapper">
			<div class="product-summary">
				<h3><?php echo esc_html( $product->get_name() ); ?></h3>
				<div class="product-meta-summary">
					<span class="meta-badge"><?php echo esc_html( $frequency_text ); ?></span>
					<?php if ( $day_text ) : ?>
						<span class="meta-badge"><?php echo esc_html( $day_text ); ?></span>
					<?php endif; ?>
					<span class="meta-badge"><?php echo esc_html( $schedule_text ); ?></span>
					<span class="meta-badge"><?php echo esc_html( $age_text ); ?></span>
				</div>
			</div>

			<div class="pricing-plans-section">
				<h4 class="plans-title"><?php echo esc_html__( 'Choose your payment plan', 'neve-child' ); ?></h4>
				<p class="plans-subtitle">
					<?php echo esc_html__( 'The longer the commitment, the greater the savings', 'neve-child' ); ?>
				</p>

				<div class="pricing-plans-grid">
					<!-- Monthly -->
					<div class="pricing-plan-card" data-plan="monthly">
						<div class="plan-header">
							<h5 class="plan-name"><?php echo esc_html__( 'Monthly', 'neve-child' ); ?></h5>
						</div>
						<div class="plan-price">
							<span class="price-amount"><?php echo esc_html( $prices['monthly']['price'] ); ?></span>
							<span class="price-currency">€</span>
						</div>
						<div class="plan-period"><?php echo esc_html__( '/month', 'neve-child' ); ?></div>
						<?php if ( $proration ) : ?>
							<div class="plan-proration">
								<span class="proration-today"><?php echo esc_html__( 'Today:', 'neve-child' ); ?>
									<strong><?php echo esc_html( number_format( $proration['amount'], 2, ',', '.' ) ); ?>€</strong></span>
								<span
									class="proration-note"><?php echo esc_html( sprintf( __( 'Prorated until %s', 'neve-child' ), $proration['renewal_date'] ) ); ?></span>
							</div>
						<?php endif; ?>
						<ul class="plan-features">
							<li><?php echo esc_html__( 'Pay month by month', 'neve-child' ); ?></li>
							<li><?php echo esc_html__( 'No commitment', 'neve-child' ); ?></li>
							<li><?php echo esc_html__( 'Cancel anytime', 'neve-child' ); ?></li>
						</ul>
						<button type="button" class="btn-add-to-cart" data-product-id="<?php echo esc_attr( $product_id ); ?>"
							data-variation-id="<?php echo esc_attr( $variation_id ); ?>" data-plan="monthly"
							data-price="<?php echo esc_attr( $prices['monthly']['price'] ); ?>">
							<?php echo esc_html__( 'Choose plan', 'neve-child' ); ?>
						</button>
						<?php if ( current_user_can( 'manage_woocommerce' ) ) : ?>
							<button type="button" class="btn-admin-assign" data-product-id="<?php echo esc_attr( $product_id ); ?>"
								data-variation-id="<?php echo esc_attr( $variation_id ); ?>" data-plan="monthly"
								data-price="<?php echo esc_attr( $prices['monthly']['price'] ); ?>"
								data-plan-label="<?php echo esc_attr__( 'Monthly', 'neve-child' ); ?>"
								data-selections="<?php echo esc_attr( wp_json_encode( $selections ) ); ?>">
								&#128100; <?php echo esc_html__( 'Assign to client', 'neve-child' ); ?>
							</button>
						<?php endif; ?>
					</div>

					<!-- Quarterly -->
					<div class="pricing-plan-card recommended" data-plan="quarterly">
						<div class="recommended-badge"><?php echo esc_html__( 'Recommended', 'neve-child' ); ?></div>
						<div class="plan-header">
							<h5 class="plan-name"><?php echo esc_html__( 'Quarterly', 'neve-child' ); ?></h5>
						</div>
						<div class="plan-price">
							<span class="price-amount"><?php echo esc_html( $prices['quarterly']['price'] ); ?></span>
							<span class="price-currency">€</span>
						</div>
						<div class="plan-period"><?php echo esc_html__( '/quarter', 'neve-child' ); ?></div>
						<div class="plan-savings">
							<span
								class="monthly-price"><?php echo esc_html( $prices['quarterly']['price_per_month'] ); ?>€<?php echo esc_html__( '/month', 'neve-child' ); ?></span>
							<span class="savings-tag">-<?php echo esc_html( $quarterly_discount_pct ); ?>%</span>
						</div>
						<?php if ( $proration ) : ?>
							<div class="plan-proration">
								<span class="proration-today"><?php echo esc_html__( 'Today:', 'neve-child' ); ?>
									<strong><?php echo esc_html( number_format( $proration['amount'], 2, ',', '.' ) ); ?>€</strong></span>
								<span
									class="proration-note"><?php echo esc_html( sprintf( __( 'Prorated until %s', 'neve-child' ), $proration['renewal_date'] ) ); ?></span>
							</div>
						<?php endif; ?>
						<ul class="plan-features">
							<li><?php echo esc_html__( 'Pay every 3 months', 'neve-child' ); ?></li>
							<li><?php echo esc_html( sprintf( __( 'Save %s€', 'neve-child' ), $prices['quarterly']['savings'] ) ); ?>
							</li>
							<li><?php echo esc_html__( 'Best value for money', 'neve-child' ); ?></li>
						</ul>
						<button type="button" class="btn-add-to-cart" data-product-id="<?php echo esc_attr( $product_id ); ?>"
							data-variation-id="<?php echo esc_attr( $variation_id ); ?>" data-plan="quarterly"
							data-price="<?php echo esc_attr( $prices['quarterly']['price'] ); ?>">
							<?php echo esc_html__( 'Choose plan', 'neve-child' ); ?>
						</button>
						<?php if ( current_user_can( 'manage_woocommerce' ) ) : ?>
							<button type="button" class="btn-admin-assign" data-product-id="<?php echo esc_attr( $product_id ); ?>"
								data-variation-id="<?php echo esc_attr( $variation_id ); ?>" data-plan="quarterly"
								data-price="<?php echo esc_attr( $prices['quarterly']['price'] ); ?>"
								data-plan-label="<?php echo esc_attr__( 'Quarterly', 'neve-child' ); ?>"
								data-selections="<?php echo esc_attr( wp_json_encode( $selections ) ); ?>">
								&#128100; <?php echo esc_html__( 'Assign to client', 'neve-child' ); ?>
							</button>
						<?php endif; ?>
					</div>

					<!-- Annual -->
					<div class="pricing-plan-card best-value" data-plan="annual">
						<div class="best-value-badge"><?php echo esc_html__( 'Best price', 'neve-child' ); ?></div>
						<div class="plan-header">
							<h5 class="plan-name"><?php echo esc_html__( 'Annual', 'neve-child' ); ?></h5>
						</div>
						<div class="plan-price">
							<span class="price-amount"><?php echo esc_html( $prices['annual']['price'] ); ?></span>
							<span class="price-currency">€</span>
						</div>
						<div class="plan-period"><?php echo esc_html__( '/year', 'neve-child' ); ?></div>
						<div class="plan-savings">
							<span
								class="monthly-price"><?php echo esc_html( $prices['annual']['price_per_month'] ); ?>€<?php echo esc_html__( '/month', 'neve-child' ); ?></span>
							<span class="savings-tag">-<?php echo esc_html( $annual_discount_pct ); ?>%</span>
						</div>
						<?php if ( $proration ) : ?>
							<div class="plan-proration">
								<span class="proration-today"><?php echo esc_html__( 'Today:', 'neve-child' ); ?>
									<strong><?php echo esc_html( number_format( $proration['amount'], 2, ',', '.' ) ); ?>€</strong></span>
								<span
									class="proration-note"><?php echo esc_html( sprintf( __( 'Prorated until %s', 'neve-child' ), $proration['renewal_date'] ) ); ?></span>
							</div>
						<?php endif; ?>
						<ul class="plan-features">
							<li><?php echo esc_html__( 'Single annual payment', 'neve-child' ); ?></li>
							<li><?php echo esc_html( sprintf( __( 'Save %s€', 'neve-child' ), $prices['annual']['savings'] ) ); ?>
							</li>
							<li><?php echo esc_html__( 'Maximum savings guaranteed', 'neve-child' ); ?></li>
						</ul>
						<button type="button" class="btn-add-to-cart" data-product-id="<?php echo esc_attr( $product_id ); ?>"
							data-variation-id="<?php echo esc_attr( $variation_id ); ?>" data-plan="annual"
							data-price="<?php echo esc_attr( $prices['annual']['price'] ); ?>">
							<?php echo esc_html__( 'Choose plan', 'neve-child' ); ?>
						</button>
						<?php if ( current_user_can( 'manage_woocommerce' ) ) : ?>
							<button type="button" class="btn-admin-assign" data-product-id="<?php echo esc_attr( $product_id ); ?>"
								data-variation-id="<?php echo esc_attr( $variation_id ); ?>" data-plan="annual"
								data-price="<?php echo esc_attr( $prices['annual']['price'] ); ?>"
								data-plan-label="<?php echo esc_attr__( 'Annual', 'neve-child' ); ?>"
								data-selections="<?php echo esc_attr( wp_json_encode( $selections ) ); ?>">
								&#128100; <?php echo esc_html__( 'Assign to client', 'neve-child' ); ?>
							</button>
						<?php endif; ?>
					</div>
				</div>
			</div>

			<div class="step-navigation">
				<button type="button" class="btn-back">← <?php echo esc_html__( 'Change options', 'neve-child' ); ?></button>
			</div>
		</div>
		<?php
		$html = ob_get_clean();

		wp_send_json_success( array(
			'html' => $html,
			'product_id' => $product_id,
			'variation_id' => $variation_id,
			'prices' => $prices,
		) );
	}

	// ============================================
	// ENCONTRAR VARIACIÓN
	// ============================================

	public static function find_matching_variation( $product_id, $selections ) {
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return false;
		}

		$attr_selections = array();
		foreach ( $selections as $key => $value ) {
			if ( $key !== 'frequency' && $key !== 'age_addon' && $key !== 'age_addon_2days' && ! empty( $value ) ) {
				$attr_selections[ $key ] = $value;
			}
		}

		// Mapear edad del addon a atributo de variación para 2 días
		// Solo añadir pa_edad si el producto tiene ese atributo como variación
		if ( isset( $selections['age_addon_2days'] ) ) {
			$product_attributes = $product->get_attributes();
			$has_edad_attr = isset( $product_attributes['pa_edad'] ) && $product_attributes['pa_edad']->get_variation();

			if ( $has_edad_attr ) {
				$age_addon = $selections['age_addon_2days'];
				if ( stripos( $age_addon, 'Children' ) !== false || stripos( $age_addon, '6-12' ) !== false
					|| stripos( $age_addon, 'Teenagers' ) !== false || stripos( $age_addon, '12-18' ) !== false
					|| stripos( $age_addon, 'Menores' ) !== false ) {
					$attr_selections['pa_edad'] = 'menores';
				} else {
					$attr_selections['pa_edad'] = 'adultos';
				}
			}
		}

		if ( empty( $attr_selections ) ) {
			return false;
		}

		$variations = $product->get_available_variations();

		$attr_candidates = array( $attr_selections );
		if ( isset( $attr_selections['pa_edad'] ) && $attr_selections['pa_edad'] !== 'adultos' ) {
			$fallback = $attr_selections;
			$fallback['pa_edad'] = 'adultos';
			$attr_candidates[] = $fallback;
		}

		foreach ( $attr_candidates as $candidate ) {
			foreach ( $variations as $variation ) {
				$matches = true;
				$variation_attributes = array();

				foreach ( $candidate as $attr_name => $selected_value ) {
					$var_key = 'attribute_' . $attr_name;
					$var_value = isset( $variation['attributes'][ $var_key ] ) ? $variation['attributes'][ $var_key ] : '';

					if ( empty( $var_value ) ) {
						continue;
					}

					$var_normalized = strtolower( trim( $var_value ) );
					$sel_normalized = strtolower( trim( $selected_value ) );

					$term = get_term_by( 'name', $selected_value, $attr_name );
					$sel_slug = $term ? $term->slug : sanitize_title( $selected_value );

					if ( $var_normalized !== $sel_normalized && $var_value !== $sel_slug ) {
						$matches = false;
						break;
					}

					$variation_attributes[ $var_key ] = $var_value;
				}

				if ( $matches ) {
					return array(
						'variation_id' => $variation['variation_id'],
						'variation_data' => $variation_attributes,
					);
				}
			}
		}

		return false;
	}

	// ============================================
	// AÑADIR AL CARRITO
	// ============================================

	public static function add_to_cart() {
		check_ajax_referer( 'wc_step_form_nonce', 'nonce' );

		$product_id = intval( $_POST['product_id'] );
		$variation_id = intval( $_POST['variation_id'] );
		$selections = isset( $_POST['selections'] ) ? $_POST['selections'] : array();
		$quantity = 1;

		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			wp_send_json_error( 'Product not found' );
			return;
		}

		$cart_item_data = array(
			'step_form_selections' => $selections,
			'step_form_display' => self::format_selections_for_display( $selections ),
		);

		// Guardar edad
		$age_value = isset( $selections['age_addon'] ) ? $selections['age_addon'] :
			( isset( $selections['age_addon_2days'] ) ? $selections['age_addon_2days'] : null );

		if ( ! empty( $age_value ) ) {
			$cart_item_data['student_age'] = $age_value;
		}

		// Configurar addon de WC Product Add-Ons para 2 días
		if ( isset( $selections['age_addon_2days'] ) && ! empty( $selections['age_addon_2days'] ) ) {
			$age = $selections['age_addon_2days'];
			$addon_value = 'Adult';

			if ( stripos( $age, 'Teenager' ) !== false || stripos( $age, '12-18' ) !== false ) {
				$addon_value = 'Teenager (12-18 years)';
			}

			$cart_item_data['addons'] = array(
				array(
					'name' => 'Student Type',
					'value' => $addon_value,
					'price' => ( $addon_value === 'Adult' ) ? 0 : ( RocoMadrid_SF_Settings::get_price_teenagers_2days() - RocoMadrid_SF_Settings::get_price_adults_2days() ),
					'price_type' => 'flat_fee',
					'field_name' => 'addon-0',
					'field_type' => 'radiobutton',
				),
			);
		}

		// Plan de pago y precio
		if ( isset( $selections['payment_plan'] ) && ! empty( $selections['payment_plan'] ) ) {
			$cart_item_data['payment_plan'] = $selections['payment_plan'];

			$variation_price = null;
			if ( $variation_id ) {
				$variation_product = wc_get_product( $variation_id );
				if ( $variation_product ) {
					$variation_price = floatval( $variation_product->get_regular_price() );
				}
			}

			$prices = RocoMadrid_SF_Pricing::calculate_plan_prices( $selections, $variation_price );
			$plan = $selections['payment_plan'];

			if ( isset( $prices[ $plan ]['price'] ) ) {
				$cart_item_data['step_form_price'] = floatval( $prices[ $plan ]['price'] );
			}
		}

		// Datos de variación
		$variation_data = array();
		if ( $variation_id ) {
			$result = self::find_matching_variation( $product_id, $selections );
			if ( $result ) {
				$variation_data = $result['variation_data'];
			}
		}

		try {
			global $wp_filter;
			$saved_filters = null;

			if ( isset( $wp_filter['woocommerce_add_cart_item_data'] ) ) {
				$saved_filters = $wp_filter['woocommerce_add_cart_item_data'];
				unset( $wp_filter['woocommerce_add_cart_item_data'] );
			}

			$cart_item_key = WC()->cart->add_to_cart(
				$product_id,
				$quantity,
				$variation_id,
				$variation_data,
				$cart_item_data
			);

			if ( $saved_filters !== null ) {
				$wp_filter['woocommerce_add_cart_item_data'] = $saved_filters;
			}

			if ( $cart_item_key ) {
				WC()->cart->calculate_totals();

				wp_send_json_success( array(
					'message' => 'Product added to cart',
					'cart_url' => wc_get_cart_url(),
					'checkout_url' => wc_get_checkout_url(),
					'cart_count' => WC()->cart->get_cart_contents_count(),
					'product_name' => $product->get_name(),
				) );
			} else {
				wp_send_json_error( 'Could not add to cart' );
			}
		} catch (Exception $e) {
			wp_send_json_error( $e->getMessage() );
		}
	}

	// ============================================
	// FORMATEAR SELECCIONES
	// ============================================

	public static function format_selections_for_display( $selections ) {
		$labels = array(
			'frequency' => 'Frequency',
			'pa_dia-suelto' => 'Day',
			'pa_dias' => 'Days',
			'age_addon' => 'Age',
			'age_addon_2days' => 'Age',
			'pa_edad' => 'Age',
			'pa_horario' => 'Schedule',
		);

		$parts = array();
		foreach ( $selections as $key => $value ) {
			if ( empty( $value ) ) {
				continue;
			}
			$label = isset( $labels[ $key ] ) ? $labels[ $key ] : $key;

			if ( $key === 'frequency' ) {
				$value = ( $value === '1_day' ) ? '1 day/week' : '2 days/week';
			}

			$parts[] = "{$label}: {$value}";
		}

		return implode( ' | ', $parts );
	}

	/**
	 * Traducir nombre de día individual
	 */
	public static function translate_day_name( $day_name ) {
		$days = array(
			'Monday' => __( 'Monday', 'neve-child' ),
			'Tuesday' => __( 'Tuesday', 'neve-child' ),
			'Wednesday' => __( 'Wednesday', 'neve-child' ),
			'Thursday' => __( 'Thursday', 'neve-child' ),
			'Friday' => __( 'Friday', 'neve-child' ),
			'Saturday' => __( 'Saturday', 'neve-child' ),
			'Sunday' => __( 'Sunday', 'neve-child' ),
			'Lunes' => __( 'Monday', 'neve-child' ),
			'Martes' => __( 'Tuesday', 'neve-child' ),
			'Miércoles' => __( 'Wednesday', 'neve-child' ),
			'Jueves' => __( 'Thursday', 'neve-child' ),
			'Viernes' => __( 'Friday', 'neve-child' ),
			'Sábado' => __( 'Saturday', 'neve-child' ),
			'Domingo' => __( 'Sunday', 'neve-child' ),
		);

		return isset( $days[ $day_name ] ) ? $days[ $day_name ] : $day_name;
	}

	/**
	 * Traducir pares de días (L-X, M-J)
	 */
	public static function translate_days_pair( $days_pair ) {
		$pairs = array(
			'L-X' => __( 'Monday and Wednesday', 'neve-child' ),
			'M-J' => __( 'Tuesday and Thursday', 'neve-child' ),
			'Lunes-Miércoles' => __( 'Monday and Wednesday', 'neve-child' ),
			'Martes-Jueves' => __( 'Tuesday and Thursday', 'neve-child' ),
		);

		return isset( $pairs[ $days_pair ] ) ? $pairs[ $days_pair ] : $days_pair;
	}

	/**
	 * Genera el submensaje con enlaces a WhatsApp y formulario de contacto
	 */
	public static function build_contact_submessage( $dia, $horario, $edad ) {
		$msg_text = sprintf(
			/* translators: 1: día, 2: horario, 3: edad */
			__( 'Hello, I\'m interested in the schedule %1$s %2$s (%3$s) which appears as unavailable. I\'d like to know if there are spots or join a waiting list.', 'neve-child' ),
			$dia, $horario, $edad
		);

		$wa_number = '34692503272';
		$wa_url = 'https://wa.me/' . $wa_number . '?text=' . rawurlencode( $msg_text );

		$form_url = add_query_arg( array(
			'subject' => rawurlencode( __( 'Availability enquiry', 'neve-child' ) ),
			'mensaje' => rawurlencode( $msg_text ),
		), home_url( '/contacto' ) );

		return sprintf(
			/* translators: 1: URL WhatsApp, 2: URL formulario */
			__( 'You can contact us via <a href="%1$s" target="_blank" rel="noopener" style="color:#25d366;font-weight:600;">WhatsApp</a> or through our <a href="%2$s" style="color:#856404;font-weight:600;">contact form</a> to ask about availability or join the waiting list.', 'neve-child' ),
			esc_url( $wa_url ),
			esc_url( $form_url )
		);
	}
}