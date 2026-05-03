<?php
/**
 * Seeder de suscripciones de prueba para debug de estadísticas
 *
 * Crea 40 suscripciones fake con datos realistas para probar
 * la página de estadísticas (📊 Statistics).
 *
 * Página admin: WooCommerce > 🧪 Debug Seeder
 *
 * ⚠️ SOLO PARA DESARROLLO — NO USAR EN PRODUCCIÓN
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Debug_Seeder {

	public static function init() {
		// if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
		// 	return;
		// }
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ) );
	}

	public static function register_menu() {
		add_submenu_page(
			'rocomadrid-pricing',
			__( 'Debug Seeder', 'neve-child' ),
			__( 'Debug Seeder', 'neve-child' ),
			'manage_woocommerce',
			'rocomadrid-debug-seeder',
			array( __CLASS__, 'render_page' )
		);
	}

	// ============================================
	// DATOS PARA EL SEED
	// ============================================

	/**
	 * Pool de nombres ficticios para las suscripciones
	 */
	private static function get_fake_names() {
		return array(
			array( 'first' => 'Carlos', 'last' => 'García' ),
			array( 'first' => 'María', 'last' => 'López' ),
			array( 'first' => 'Pablo', 'last' => 'Martínez' ),
			array( 'first' => 'Laura', 'last' => 'Fernández' ),
			array( 'first' => 'Alejandro', 'last' => 'Rodríguez' ),
			array( 'first' => 'Sara', 'last' => 'Sánchez' ),
			array( 'first' => 'Daniel', 'last' => 'Pérez' ),
			array( 'first' => 'Andrea', 'last' => 'Gómez' ),
			array( 'first' => 'Javier', 'last' => 'Ruiz' ),
			array( 'first' => 'Lucía', 'last' => 'Díaz' ),
			array( 'first' => 'Marcos', 'last' => 'Hernández' ),
			array( 'first' => 'Elena', 'last' => 'Moreno' ),
			array( 'first' => 'Hugo', 'last' => 'Álvarez' ),
			array( 'first' => 'Claudia', 'last' => 'Jiménez' ),
			array( 'first' => 'Adrián', 'last' => 'Torres' ),
			array( 'first' => 'Marta', 'last' => 'Romero' ),
			array( 'first' => 'Iker', 'last' => 'Navarro' ),
			array( 'first' => 'Nerea', 'last' => 'Domínguez' ),
			array( 'first' => 'David', 'last' => 'Vázquez' ),
			array( 'first' => 'Sofía', 'last' => 'Serrano' ),
			array( 'first' => 'Álvaro', 'last' => 'Ramos' ),
			array( 'first' => 'Paula', 'last' => 'Blanco' ),
			array( 'first' => 'Diego', 'last' => 'Castro' ),
			array( 'first' => 'Irene', 'last' => 'Ortega' ),
			array( 'first' => 'Miguel', 'last' => 'Rubio' ),
			array( 'first' => 'Alba', 'last' => 'Molina' ),
			array( 'first' => 'Lucas', 'last' => 'Marín' ),
			array( 'first' => 'Carmen', 'last' => 'Suárez' ),
			array( 'first' => 'Sergio', 'last' => 'Medina' ),
			array( 'first' => 'Julia', 'last' => 'Iglesias' ),
			array( 'first' => 'Manuel', 'last' => 'Cortés' ),
			array( 'first' => 'Ana', 'last' => 'Garrido' ),
			array( 'first' => 'Rubén', 'last' => 'Guerrero' ),
			array( 'first' => 'Inés', 'last' => 'Cano' ),
			array( 'first' => 'Raúl', 'last' => 'Santos' ),
			array( 'first' => 'Vera', 'last' => 'Prieto' ),
			array( 'first' => 'Martín', 'last' => 'Herrera' ),
			array( 'first' => 'Lola', 'last' => 'Muñoz' ),
			array( 'first' => 'Jorge', 'last' => 'Calvo' ),
			array( 'first' => 'Valeria', 'last' => 'Vega' ),
		);
	}

	/**
	 * Posibles combinaciones para Días Sueltos
	 */
	private static function get_single_day_combos() {
		return array(
			array( 'dia' => 'Monday', 'horario' => '09:00-10:30', 'turno' => 'morning', 'price' => 68 ),
			array( 'dia' => 'Monday', 'horario' => '19:00-20:30', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Monday', 'horario' => '20:30-22:00', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Tuesday', 'horario' => '09:00-10:30', 'turno' => 'morning', 'price' => 68 ),
			array( 'dia' => 'Tuesday', 'horario' => '17:30-19:00', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Tuesday', 'horario' => '19:00-20:30', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Tuesday', 'horario' => '20:30-22:00', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Wednesday', 'horario' => '18:00-19:30', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Wednesday', 'horario' => '19:30-21:00', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Thursday', 'horario' => '07:00-08:30', 'turno' => 'morning', 'price' => 68 ),
			array( 'dia' => 'Thursday', 'horario' => '18:30-20:00', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Thursday', 'horario' => '21:00-22:30', 'turno' => 'afternoon', 'price' => 74 ),
			array( 'dia' => 'Friday', 'horario' => '09:00-11:00', 'turno' => 'morning', 'price' => 68 ),
			array( 'dia' => 'Friday', 'horario' => '19:00-21:00', 'turno' => 'special', 'price' => 78 ),
			array( 'dia' => 'Saturday', 'horario' => '09:00-11:00', 'turno' => 'special', 'price' => 78 ),
			array( 'dia' => 'Saturday', 'horario' => '17:00-19:00', 'turno' => 'special', 'price' => 78 ),
			array( 'dia' => 'Saturday', 'horario' => '19:00-21:00', 'turno' => 'special', 'price' => 78 ),
		);
	}

	/**
	 * Posibles combinaciones para Clases (2 días)
	 */
	private static function get_classes_combos() {
		return array(
			array( 'dias' => 'Monday-Wednesday', 'horario' => '09:00-10:30', 'edad' => 'Adults', 'price' => 77 ),
			array( 'dias' => 'Monday-Wednesday', 'horario' => '17:30-19:00', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Monday-Wednesday', 'horario' => '19:00-20:30', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Monday-Wednesday', 'horario' => '19:30-21:00', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Monday-Wednesday', 'horario' => '20:30-22:00', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Tuesday-Thursday', 'horario' => '09:00-10:30', 'edad' => 'Adults', 'price' => 77 ),
			array( 'dias' => 'Tuesday-Thursday', 'horario' => '17:30-19:00', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Tuesday-Thursday', 'horario' => '18:00-19:30', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Tuesday-Thursday', 'horario' => '19:00-20:30', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Tuesday-Thursday', 'horario' => '20:30-22:00', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Tuesday-Thursday', 'horario' => '21:00-22:30', 'edad' => 'Adults', 'price' => 86 ),
			array( 'dias' => 'Tuesday-Thursday', 'horario' => '17:30-18:30', 'edad' => 'Children', 'price' => 57 ),
		);
	}

	/**
	 * Edades posibles para Días Sueltos (via addon)
	 */
	private static function get_age_options() {
		return array(
			array( 'label' => 'Adults', 'adjustment' => 0 ),
			array( 'label' => 'Adults', 'adjustment' => 0 ),
			array( 'label' => 'Adults', 'adjustment' => 0 ),
			array( 'label' => 'Adults', 'adjustment' => 0 ),
			array( 'label' => 'Adults', 'adjustment' => 0 ),
			array( 'label' => 'Children (6-12 years)', 'adjustment' => -27 ),
			array( 'label' => 'Teenagers (12-18 years)', 'adjustment' => -19 ),
		);
	}

	// ============================================
	// GENERADOR DE SUSCRIPCIONES
	// ============================================

	public static function seed_subscriptions( $count = 40 ) {
		if ( ! class_exists( 'WC_Subscriptions' ) || ! function_exists( 'wcs_create_subscription' ) ) {
			return array( 'error' => 'WooCommerce Subscriptions is required.' );
		}

		$product_ds_id = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product_cl_id = RocoMadrid_Step_Form::product_tarifas_id();

		$ds_product = wc_get_product( $product_ds_id );
		$cl_product = wc_get_product( $product_cl_id );

		if ( ! $ds_product && ! $cl_product ) {
			return array( 'error' => 'No products found. Generate them first via Product Generator.' );
		}

		$names = self::get_fake_names();
		$single_combos = self::get_single_day_combos();
		$classes_combos = self::get_classes_combos();
		$age_options = self::get_age_options();
		$created = 0;
		$errors = array();

		for ( $i = 0; $i < $count; $i++ ) {
			$name = $names[ $i % count( $names ) ];
			$suffix = $i >= count( $names ) ? '_' . intval( $i / count( $names ) ) : '';
			$email = sanitize_email( strtolower( $name['first'] ) . '.' . strtolower( str_replace( array( 'á', 'é', 'í', 'ó', 'ú', 'ñ' ), array( 'a', 'e', 'i', 'o', 'u', 'n' ), $name['last'] ) ) . $suffix . '@test.local' );

			// Alternar entre productos: ~60% clases, ~40% días sueltos
			$is_single_day = ( $i % 5 < 2 );

			// Elegir si usar DS o Clases (si el producto existe)
			if ( $is_single_day && $ds_product ) {
				$combo = $single_combos[ wp_rand( 0, count( $single_combos ) - 1 ) ];
				$age = $age_options[ wp_rand( 0, count( $age_options ) - 1 ) ];
				$price = max( 0, $combo['price'] + $age['adjustment'] );

				$step_selections = array(
					'pa_dia-suelto' => $combo['dia'],
					'pa_horario' => $combo['horario'],
					'edad_addon' => $age['label'],
					'plan_pago' => 'Monthly',
				);
				$product_id = $product_ds_id;
				$product_name = 'Single Days';
			} elseif ( $cl_product ) {
				$combo = $classes_combos[ wp_rand( 0, count( $classes_combos ) - 1 ) ];
				$price = $combo['price'];

				$step_selections = array(
					'pa_dias' => $combo['dias'],
					'pa_horario' => $combo['horario'],
					'pa_edad' => $combo['edad'],
					'plan_pago' => ( wp_rand( 0, 3 ) === 0 ) ? 'Quarterly' : 'Monthly',
				);
				$product_id = $product_cl_id;
				$product_name = 'Classes';
			} elseif ( $ds_product ) {
				$combo = $single_combos[ wp_rand( 0, count( $single_combos ) - 1 ) ];
				$age = $age_options[ wp_rand( 0, count( $age_options ) - 1 ) ];
				$price = max( 0, $combo['price'] + $age['adjustment'] );

				$step_selections = array(
					'pa_dia-suelto' => $combo['dia'],
					'pa_horario' => $combo['horario'],
					'edad_addon' => $age['label'],
					'plan_pago' => 'Monthly',
				);
				$product_id = $product_ds_id;
				$product_name = 'Single Days';
			} else {
				continue;
			}

			// Crear o buscar usuario
			$user_id = email_exists( $email );
			if ( ! $user_id ) {
				$user_id = wp_create_user(
					strtolower( $name['first'] ) . '.' . strtolower( str_replace( array( 'á', 'é', 'í', 'ó', 'ú', 'ñ' ), array( 'a', 'e', 'i', 'o', 'u', 'n' ), $name['last'] ) ) . $suffix,
					wp_generate_password( 12 ),
					$email
				);
				if ( is_wp_error( $user_id ) ) {
					$errors[] = "User creation failed for {$email}: " . $user_id->get_error_message();
					continue;
				}
				wp_update_user( array(
					'ID' => $user_id,
					'first_name' => $name['first'],
					'last_name' => $name['last'],
					'display_name' => $name['first'] . ' ' . $name['last'],
					'role' => 'customer',
				) );
			}

			// Fecha de inicio aleatoria en los últimos 6 meses
			$days_ago = wp_rand( 1, 180 );
			$start_date = gmdate( 'Y-m-d H:i:s', strtotime( "-{$days_ago} days" ) );

			// Crear orden padre
			$order = wc_create_order( array(
				'customer_id' => $user_id,
				'status' => 'completed',
			) );

			if ( is_wp_error( $order ) ) {
				$errors[] = "Order creation failed for {$email}: " . $order->get_error_message();
				continue;
			}

			$order->set_billing_first_name( $name['first'] );
			$order->set_billing_last_name( $name['last'] );
			$order->set_billing_email( $email );
			$order->set_date_created( $start_date );
			$order->set_total( (string) $price );
			$order->save();

			// Crear suscripción
			$billing_interval = ( isset( $step_selections['plan_pago'] ) && strtolower( $step_selections['plan_pago'] ) === 'quarterly' ) ? 3 : 1;

			$subscription = wcs_create_subscription( array(
				'order_id' => $order->get_id(),
				'customer_id' => $user_id,
				'billing_period' => 'month',
				'billing_interval' => $billing_interval,
				'start_date' => $start_date,
				'status' => 'active',
			) );

			if ( is_wp_error( $subscription ) ) {
				$errors[] = "Subscription failed for {$email}: " . $subscription->get_error_message();
				continue;
			}

			// Buscar variación que coincida
			$variation_id = self::find_matching_variation( $product_id, $step_selections );

			// Añadir item con metadata
			$item_id = $subscription->add_product(
				wc_get_product( $variation_id ?: $product_id ),
				1,
				array(
					'total' => (string) $price,
					'subtotal' => (string) $price,
				)
			);

			if ( $item_id ) {
				// Meta principal que buscan las estadísticas
				wc_update_order_item_meta( $item_id, '_step_form_selections', $step_selections );

				// Meta legible
				if ( $product_name === 'Single Days' ) {
					wc_update_order_item_meta( $item_id, 'Day', $step_selections['pa_dia-suelto'] );
					wc_update_order_item_meta( $item_id, 'Schedule', $step_selections['pa_horario'] );
					wc_update_order_item_meta( $item_id, 'Edad del alumno', $step_selections['edad_addon'] ?? 'Adults' );
				} else {
					wc_update_order_item_meta( $item_id, 'Days', $step_selections['pa_dias'] );
					wc_update_order_item_meta( $item_id, 'Schedule', $step_selections['pa_horario'] );
					wc_update_order_item_meta( $item_id, 'Age', $step_selections['pa_edad'] ?? 'Adults' );
				}
				wc_update_order_item_meta( $item_id, 'Plan', $step_selections['plan_pago'] );
			}

			// Guardar la suscripción con el total
			$subscription->set_total( (string) $price );
			$subscription->save();

			// También añadir item a la orden padre
			$order->add_product(
				wc_get_product( $variation_id ?: $product_id ),
				1,
				array(
					'total' => (string) $price,
					'subtotal' => (string) $price,
				)
			);
			$order->calculate_totals();
			$order->save();

			$created++;
		}

		return array(
			'created' => $created,
			'errors' => $errors,
		);
	}

	/**
	 * Buscar variación que coincida con las selecciones
	 */
	private static function find_matching_variation( $product_id, $step_selections ) {
		$product = wc_get_product( $product_id );
		if ( ! $product || ! method_exists( $product, 'get_children' ) ) {
			return 0;
		}

		$match_attrs = array();
		if ( isset( $step_selections['pa_dia-suelto'] ) ) {
			$match_attrs['pa_dia-suelto'] = sanitize_title( $step_selections['pa_dia-suelto'] );
		}
		if ( isset( $step_selections['pa_dias'] ) ) {
			$match_attrs['pa_dias'] = sanitize_title( $step_selections['pa_dias'] );
		}
		if ( isset( $step_selections['pa_horario'] ) ) {
			$match_attrs['pa_horario'] = sanitize_title( $step_selections['pa_horario'] );
		}
		if ( isset( $step_selections['pa_edad'] ) ) {
			$match_attrs['pa_edad'] = sanitize_title( $step_selections['pa_edad'] );
		}

		foreach ( $product->get_children() as $var_id ) {
			$variation = wc_get_product( $var_id );
			if ( ! $variation ) {
				continue;
			}

			$var_attrs = $variation->get_variation_attributes();
			$matches = true;

			foreach ( $match_attrs as $key => $expected_slug ) {
				$attr_key = 'attribute_pa_' . str_replace( 'pa_', '', $key );
				$var_value = isset( $var_attrs[ $attr_key ] ) ? $var_attrs[ $attr_key ] : '';
				if ( ! empty( $var_value ) && $var_value !== $expected_slug ) {
					$matches = false;
					break;
				}
			}

			if ( $matches ) {
				return $var_id;
			}
		}

		return 0;
	}

	/**
	 * Eliminar todas las suscripciones de prueba (usuarios @test.local)
	 */
	public static function cleanup() {
		$cleaned = 0;

		if ( ! function_exists( 'wcs_get_subscriptions' ) ) {
			return array( 'error' => 'WooCommerce Subscriptions not active.' );
		}

		$subscriptions = wcs_get_subscriptions( array(
			'subscriptions_per_page' => -1,
			'subscription_status' => 'any',
		) );

		foreach ( $subscriptions as $subscription ) {
			$user = $subscription->get_user();
			if ( ! $user || strpos( $user->user_email, '@test.local' ) === false ) {
				continue;
			}

			// Eliminar orden padre
			$parent_id = $subscription->get_parent_id();
			if ( $parent_id ) {
				wp_delete_post( $parent_id, true );
			}

			// Eliminar suscripción
			wp_delete_post( $subscription->get_id(), true );
			$cleaned++;
		}

		// Eliminar usuarios @test.local sin suscripciones
		$test_users = get_users( array(
			'search' => '*@test.local',
			'search_columns' => array( 'user_email' ),
		) );
		$users_deleted = 0;
		foreach ( $test_users as $user ) {
			if ( strpos( $user->user_email, '@test.local' ) !== false ) {
				wp_delete_user( $user->ID );
				$users_deleted++;
			}
		}

		return array(
			'subscriptions_deleted' => $cleaned,
			'users_deleted' => $users_deleted,
		);
	}

	// ============================================
	// PÁGINA DE ADMINISTRACIÓN
	// ============================================

	public static function render_page() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return;
		}

		$messages = array();

		// Procesar acciones
		if ( isset( $_POST['seed_subscriptions'] ) && check_admin_referer( 'rocomadrid_debug_seeder' ) ) {
			$count = isset( $_POST['seed_count'] ) ? absint( $_POST['seed_count'] ) : 40;
			$count = min( $count, 100 );
			$result = self::seed_subscriptions( $count );
			if ( isset( $result['error'] ) ) {
				$messages[] = array( 'type' => 'error', 'text' => $result['error'] );
			} else {
				$messages[] = array(
					'type' => 'success',
					'text' => sprintf(
						__( 'Created <strong>%d</strong> test subscriptions. %s', 'neve-child' ),
						$result['created'],
						! empty( $result['errors'] ) ? count( $result['errors'] ) . ' ' . __( 'errors.', 'neve-child' ) : ''
					),
				);
				if ( ! empty( $result['errors'] ) ) {
					foreach ( array_slice( $result['errors'], 0, 5 ) as $err ) {
						$messages[] = array( 'type' => 'warning', 'text' => esc_html( $err ) );
					}
				}
			}
		}

		if ( isset( $_POST['cleanup_subscriptions'] ) && check_admin_referer( 'rocomadrid_debug_seeder' ) ) {
			$result = self::cleanup();
			if ( isset( $result['error'] ) ) {
				$messages[] = array( 'type' => 'error', 'text' => $result['error'] );
			} else {
				$messages[] = array(
					'type' => 'success',
					'text' => sprintf(
						__( 'Cleanup complete. Deleted <strong>%d</strong> subscriptions and <strong>%d</strong> test users.', 'neve-child' ),
						$result['subscriptions_deleted'],
						$result['users_deleted']
					),
				);
			}
		}

		// Contar suscripciones de test actuales
		$test_count = 0;
		if ( function_exists( 'wcs_get_subscriptions' ) ) {
			$all_subs = wcs_get_subscriptions( array(
				'subscriptions_per_page' => -1,
				'subscription_status' => 'any',
			) );
			foreach ( $all_subs as $sub ) {
				$user = $sub->get_user();
				if ( $user && strpos( $user->user_email, '@test.local' ) !== false ) {
					$test_count++;
				}
			}
		}

		?>
		<div class="wrap">
			<h1>🧪 <?php echo esc_html__( 'Debug Seeder', 'neve-child' ); ?></h1>
			<p class="rm-callout rm-callout-danger" style="padding:8px 12px;margin:0 0 16px">⚠️
				<?php echo esc_html__( 'DEVELOPMENT ONLY — Creates fake subscriptions with @test.local users', 'neve-child' ); ?>
			</p>

			<?php foreach ( $messages as $msg ) : ?>
				<div class="notice notice-<?php echo esc_attr( $msg['type'] ); ?> is-dismissible">
					<p><?php echo wp_kses_post( $msg['text'] ); ?></p>
				</div>
			<?php endforeach; ?>

			<div class="seeder-grid">
				<!-- Crear suscripciones -->
				<div class="seeder-card">
					<h2>🌱 <?php echo esc_html__( 'Seed Subscriptions', 'neve-child' ); ?></h2>
					<p class="desc">
						<?php echo esc_html__( 'Create test subscriptions with realistic data. Users are created with @test.local emails.', 'neve-child' ); ?>
					</p>

					<div class="info-box">
						<div class="label"><?php echo esc_html__( 'Current test subscriptions', 'neve-child' ); ?></div>
						<div class="value"><?php echo $test_count; ?></div>
					</div>

					<p class="rm-text-sm rm-muted" style="margin-bottom:12px">
						<strong><?php echo esc_html__( 'What gets created:', 'neve-child' ); ?></strong><br>
						• <?php echo esc_html__( '~40% Single Days (various days/schedules/ages)', 'neve-child' ); ?><br>
						• <?php echo esc_html__( '~60% Classes (L-X and M-J, Adults/Children)', 'neve-child' ); ?><br>
						• <?php echo esc_html__( 'Random start dates (last 6 months)', 'neve-child' ); ?><br>
						• <?php echo esc_html__( 'Monthly and Quarterly plans', 'neve-child' ); ?><br>
						• <?php echo esc_html__( 'Linked to matching product variations', 'neve-child' ); ?>
					</p>

					<form method="post">
						<?php wp_nonce_field( 'rocomadrid_debug_seeder' ); ?>
						<label class="rm-text-sm"
							style="font-weight:600;display:block;margin-bottom:6px"><?php echo esc_html__( 'Number of subscriptions:', 'neve-child' ); ?></label>
						<input type="number" name="seed_count" value="40" min="1" max="100" class="count-input" />
						<input type="submit" name="seed_subscriptions" class="btn-seed btn-green"
							value="🌱 <?php echo esc_attr__( 'Create Test Subscriptions', 'neve-child' ); ?>" />
					</form>
				</div>

				<!-- Limpiar suscripciones -->
				<div class="seeder-card seeder-card--danger">
					<h2>🗑️ <?php echo esc_html__( 'Cleanup', 'neve-child' ); ?></h2>
					<p class="desc">
						<?php echo esc_html__( 'Remove all test subscriptions, orders, and @test.local users.', 'neve-child' ); ?>
					</p>

					<div class="info-box" style="background:var(--rm-danger-bg)">
						<div class="label"><?php echo esc_html__( 'Test subscriptions to delete', 'neve-child' ); ?></div>
						<div class="value" style="color:var(--rm-danger)"><?php echo $test_count; ?></div>
					</div>

					<p class="rm-text-sm rm-muted" style="margin-bottom:12px">
						<strong><?php echo esc_html__( 'What gets deleted:', 'neve-child' ); ?></strong><br>
						• <?php echo esc_html__( 'All subscriptions from @test.local users', 'neve-child' ); ?><br>
						• <?php echo esc_html__( 'Their parent orders', 'neve-child' ); ?><br>
						• <?php echo esc_html__( 'All @test.local user accounts', 'neve-child' ); ?>
					</p>

					<form method="post">
						<?php wp_nonce_field( 'rocomadrid_debug_seeder' ); ?>
						<input type="submit" name="cleanup_subscriptions" class="btn-seed btn-red"
							value="🗑️ <?php echo esc_attr__( 'Delete All Test Data', 'neve-child' ); ?>"
							onclick="return confirm('<?php echo esc_js( __( 'Delete all test subscriptions, orders and users? This cannot be undone.', 'neve-child' ) ); ?>');" />
					</form>
				</div>
			</div>

			<div class="rm-tip-box">
				<strong>💡 <?php echo esc_html__( 'Tip:', 'neve-child' ); ?></strong>
				<?php echo sprintf( __( 'After seeding, go to %s to see the occupancy matrix and student list populated with test data.', 'neve-child' ), '<a href="' . admin_url( 'admin.php?page=rocomadrid-stats' ) . '">📊 ' . esc_html__( 'Statistics', 'neve-child' ) . '</a>' ); ?>
			</div>
		</div>
		<?php
	}
}
