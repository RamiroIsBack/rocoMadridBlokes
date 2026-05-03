<?php
/**
 * Página de estadísticas de suscripciones
 *
 * WooCommerce > 📊 Statistics
 * Matriz de ocupación + listado de alumnos con filtros AJAX
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Stats {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ) );
		add_action( 'wp_ajax_rocomadrid_get_alumnos', array( __CLASS__, 'ajax_get_alumnos' ) );
	}

	public static function register_menu() {
		add_submenu_page(
			'rocomadrid-pricing',
			__( 'Subscriptions Statistics', 'neve-child' ),
			__( 'Statistics', 'neve-child' ),
			'manage_woocommerce',
			'rocomadrid-stats',
			array( __CLASS__, 'render_page' )
		);
	}

	// ============================================
	// AJAX: OBTENER ALUMNOS FILTRADOS
	// ============================================

	public static function ajax_get_alumnos() {
		check_ajax_referer( 'rocomadrid_stats_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( __( 'Insufficient permissions', 'neve-child' ) );
		}

		$filtros = array(
			'dia' => isset( $_POST['dia'] ) && is_array( $_POST['dia'] )
				? array_map( 'sanitize_text_field', $_POST['dia'] )
				: ( ! empty( $_POST['dia'] ) ? array( sanitize_text_field( $_POST['dia'] ) ) : array() ),
			'horario' => isset( $_POST['horario'] ) ? sanitize_text_field( $_POST['horario'] ) : '',
			'edad' => isset( $_POST['edad'] ) ? sanitize_text_field( $_POST['edad'] ) : '',
			'producto' => isset( $_POST['producto'] ) ? sanitize_text_field( $_POST['producto'] ) : '',
			'turno' => isset( $_POST['turno'] ) ? sanitize_text_field( $_POST['turno'] ) : '',
			'status' => isset( $_POST['status'] ) ? sanitize_text_field( $_POST['status'] ) : 'active',
		);

		$all_data = self::get_all_subscription_data();

		$filtered = array_filter( $all_data, function ( $sub ) use ( $filtros ) {
			if ( $filtros['status'] !== 'all' && $sub['status'] !== $filtros['status'] )
				return false;
			if ( ! empty( $filtros['dia'] ) ) {
				$dia_match = false;
				foreach ( $filtros['dia'] as $dia_filtro ) {
					if ( $sub['dia'] === $dia_filtro ) {
						$dia_match = true;
						break;
					}
				}
				if ( ! $dia_match )
					return false;
			}
			if ( $filtros['horario'] && $sub['horario'] !== $filtros['horario'] )
				return false;
			if ( $filtros['edad'] && $sub['edad'] !== $filtros['edad'] )
				return false;
			if ( $filtros['producto'] && $sub['producto'] !== $filtros['producto'] )
				return false;
			if ( $filtros['turno'] && $sub['turno'] !== $filtros['turno'] )
				return false;
			return true;
		} );

		wp_send_json_success( array(
			'alumnos' => array_values( $filtered ),
			'total' => count( $filtered ),
		) );
	}

	// ============================================
	// PÁGINA PRINCIPAL
	// ============================================

	public static function render_page() {
		if ( ! class_exists( 'WC_Subscriptions' ) ) {
			echo '<div class="wrap"><h1>' . esc_html__( 'Subscriptions Statistics', 'neve-child' ) . '</h1>';
			echo '<div class="notice notice-error"><p>' . esc_html__( 'WooCommerce Subscriptions is not active.', 'neve-child' ) . '</p></div></div>';
			return;
		}

		$all_data = self::get_all_subscription_data();
		$filter_options = self::get_filter_options( $all_data );
		$activas = count( array_filter( $all_data, function ( $s ) {
			return $s['status'] === 'active';
		} ) );
		$nonce = wp_create_nonce( 'rocomadrid_stats_nonce' );

		wp_localize_script( 'rocomadrid-admin-js', 'rmAdmin', array(
			'ajaxUrl' => admin_url( 'admin-ajax.php' ),
			'nonce' => $nonce,
		) );
		?>
		<div class="wrap rocomadrid-stats">
			<h1><?php echo esc_html__( 'RocoMadrid Subscriptions Statistics', 'neve-child' ); ?></h1>
			<p class="rm-page-subtitle">
				<?php echo esc_html__( 'Last update:', 'neve-child' ); ?> <strong>
					<?php echo current_time( 'd/m/Y H:i' ); ?>
				</strong> ·
				<span id="total-activas"><strong>
						<?php echo $activas; ?>
					</strong> <?php echo esc_html__( 'active subscriptions', 'neve-child' ); ?></span>
			</p>

			<div class="stats-tabs">
				<button class="stats-tab active" data-tab="ocupacion">
					<?php echo esc_html__( 'Occupancy', 'neve-child' ); ?></button>
				<button class="stats-tab" data-tab="alumnos">
					<?php echo esc_html__( 'Students List', 'neve-child' ); ?></button>
			</div>

			<div class="tab-content active" id="tab-ocupacion">
				<?php self::render_ocupacion_tab( $all_data ); ?>
			</div>

			<div class="tab-content" id="tab-alumnos">
				<?php self::render_alumnos_tab( $filter_options ); ?>
			</div>
		</div>
		<?php
	}

	// ============================================
	// OPCIONES DE FILTROS
	// ============================================

	private static function get_filter_options( $all_data ) {
		$dias = array();
		$horarios = array();
		$edades = array();

		foreach ( $all_data as $sub ) {
			if ( $sub['status'] !== 'active' )
				continue;
			if ( ! empty( $sub['dia'] ) && ! in_array( $sub['dia'], $dias ) )
				$dias[] = $sub['dia'];
			if ( ! empty( $sub['horario'] ) && ! in_array( $sub['horario'], $horarios ) )
				$horarios[] = $sub['horario'];
			if ( ! empty( $sub['edad'] ) && ! in_array( $sub['edad'], $edades ) )
				$edades[] = $sub['edad'];
		}

		$orden_dias = array( 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Lunes-Miércoles', 'Martes-Jueves' );
		usort( $dias, function ( $a, $b ) use ( $orden_dias ) {
			$pos_a = array_search( $a, $orden_dias );
			$pos_b = array_search( $b, $orden_dias );
			return ( $pos_a === false ? 999 : $pos_a ) - ( $pos_b === false ? 999 : $pos_b );
		} );

		sort( $horarios );
		sort( $edades );

		return array( 'dias' => $dias, 'horarios' => $horarios, 'edades' => $edades );
	}

	// ============================================
	// TAB: OCUPACIÓN
	// ============================================

	private static function render_ocupacion_tab( $all_data ) {
		$por_dia = array();
		$por_horario = array();
		$matriz = array();
		$suscripciones_por_horario = array();

		foreach ( $all_data as $sub ) {
			if ( $sub['status'] !== 'active' )
				continue;

			$dia = $sub['dia'] ?: __( 'Sin especificar', 'neve-child' );
			$horario = $sub['horario'] ?: __( 'Sin especificar', 'neve-child' );

			if ( $dia === 'Lunes-Miércoles' ) {
				$dias_individuales = array( 'Lunes', 'Miércoles' );
			} elseif ( $dia === 'Martes-Jueves' ) {
				$dias_individuales = array( 'Martes', 'Jueves' );
			} else {
				$dias_individuales = array( $dia );
			}

			foreach ( $dias_individuales as $dia_individual ) {
				if ( ! isset( $por_dia[ $dia_individual ] ) )
					$por_dia[ $dia_individual ] = 0;
				$por_dia[ $dia_individual ]++;

				if ( ! isset( $matriz[ $dia_individual ] ) )
					$matriz[ $dia_individual ] = array();
				if ( ! isset( $matriz[ $dia_individual ][ $horario ] ) )
					$matriz[ $dia_individual ][ $horario ] = 0;
				$matriz[ $dia_individual ][ $horario ]++;
			}

			if ( ! isset( $suscripciones_por_horario[ $horario ] ) )
				$suscripciones_por_horario[ $horario ] = 0;
			$suscripciones_por_horario[ $horario ]++;
		}

		$por_horario = $suscripciones_por_horario;

		$orden_dias = array( 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Lunes-Miércoles', 'Martes-Jueves' );
		uksort( $por_dia, function ( $a, $b ) use ( $orden_dias ) {
			$pos_a = array_search( $a, $orden_dias );
			$pos_b = array_search( $b, $orden_dias );
			return ( $pos_a === false ? 999 : $pos_a ) - ( $pos_b === false ? 999 : $pos_b );
		} );
		ksort( $por_horario );
		?>
		<h2 class="section-title"><?php echo esc_html__( 'Day × Schedule Matrix', 'neve-child' ); ?></h2>
		<div class="chart-container" style="overflow-x:auto">
			<p class="rm-page-subtitle" style="margin-bottom:16px">
				<?php echo esc_html__( 'Click on any cell to filter by that combination', 'neve-child' ); ?>
			</p>
			<table class="data-table" style="min-width:800px">
				<thead>
					<tr>
						<th><?php echo esc_html__( 'Schedule', 'neve-child' ); ?></th>
						<?php foreach ( $por_dia as $dia => $c ) : ?>
							<th style="text-align:center"><?php echo esc_html( $dia ); ?></th>
						<?php endforeach; ?>
						<th style="text-align:center;background:#e4e4e7"><?php echo esc_html__( 'Total', 'neve-child' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ( $por_horario as $horario => $h ) : ?>
						<tr>
							<td><strong><?php echo esc_html( $horario ); ?></strong></td>
							<?php foreach ( $por_dia as $dia => $d ) :
								$cant = isset( $matriz[ $dia ][ $horario ] ) ? $matriz[ $dia ][ $horario ] : 0;
								$bg = $cant > 0 ? 'background:rgba(249,115,22,' . min( $cant * 0.15, 0.6 ) . ')' : '';
								?>
								<td class="clickable-cell" style="text-align:center;<?php echo $bg; ?>"
									data-dia="<?php echo esc_attr( $dia ); ?>" data-horario="<?php echo esc_attr( $horario ); ?>">
									<?php echo $cant > 0 ? '<strong>' . $cant . '</strong>' : '<span style="color:#a1a1aa">-</span>'; ?>
								</td>
							<?php endforeach; ?>
							<td style="text-align:center;background:#f4f4f5;font-weight:700"><?php echo $h; ?></td>
						</tr>
					<?php endforeach; ?>
					<tr class="total-row">
						<td><?php echo esc_html__( 'Total', 'neve-child' ); ?></td>
						<?php foreach ( $por_dia as $dia => $c ) : ?>
							<td style="text-align:center"><?php echo $c; ?></td>
						<?php endforeach; ?>
						<td style="text-align:center"><?php echo array_sum( $por_dia ); ?></td>
					</tr>
				</tbody>
			</table>
		</div>
		<?php
	}

	// ============================================
	// TAB: LISTADO ALUMNOS
	// ============================================

	private static function render_alumnos_tab( $filter_options ) {
		?>
		<div class="filters-bar">
			<div class="filter-group filter-group--dias">
				<label><?php echo esc_html__( 'Día', 'neve-child' ); ?></label>
				<div class="dia-toggle-group" id="filter-dia-group">
					<?php foreach ( $filter_options['dias'] as $d ) : ?>
						<button type="button" class="dia-toggle-btn" data-value="<?php echo esc_attr( $d ); ?>">
							<?php echo esc_html( $d ); ?>
						</button>
					<?php endforeach; ?>
				</div>
				<select id="filter-dia" multiple style="display:none">
					<?php foreach ( $filter_options['dias'] as $d ) : ?>
						<option value="<?php echo esc_attr( $d ); ?>"><?php echo esc_html( $d ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
			<div class="filter-group">
				<label><?php echo esc_html__( 'Schedule', 'neve-child' ); ?></label>
				<select id="filter-horario">
					<option value=""><?php echo esc_html__( 'All', 'neve-child' ); ?></option>
					<?php foreach ( $filter_options['horarios'] as $h ) : ?>
						<option value="<?php echo esc_attr( $h ); ?>"><?php echo esc_html( $h ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
			<div class="filter-group">
				<label><?php echo esc_html__( 'Age', 'neve-child' ); ?></label>
				<select id="filter-edad">
					<option value=""><?php echo esc_html__( 'All', 'neve-child' ); ?></option>
					<?php foreach ( $filter_options['edades'] as $e ) : ?>
						<option value="<?php echo esc_attr( $e ); ?>"><?php echo esc_html( $e ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
			<div class="filter-group">
				<label><?php echo esc_html__( 'Product', 'neve-child' ); ?></label>
				<select id="filter-producto">
					<option value=""><?php echo esc_html__( 'All', 'neve-child' ); ?></option>
					<option value="Single Days"><?php echo esc_html__( 'Single Days', 'neve-child' ); ?></option>
					<option value="Classes"><?php echo esc_html__( 'Classes (2 days)', 'neve-child' ); ?></option>
					<option value="Pilates"><?php echo esc_html__( 'Pilates', 'neve-child' ); ?></option>
					<option value="Yoga"><?php echo esc_html__( 'Yoga', 'neve-child' ); ?></option>
				</select>
			</div>
			<div class="filter-group">
				<label><?php echo esc_html__( 'Shift', 'neve-child' ); ?></label>
				<select id="filter-turno">
					<option value=""><?php echo esc_html__( 'All', 'neve-child' ); ?></option>
					<option value="Morning"><?php echo esc_html__( 'Morning', 'neve-child' ); ?></option>
					<option value="Afternoon"><?php echo esc_html__( 'Afternoon', 'neve-child' ); ?></option>
				</select>
			</div>
			<div class="filter-group">
				<label><?php echo esc_html__( 'Status', 'neve-child' ); ?></label>
				<select id="filter-status">
					<option value="active"><?php echo esc_html__( 'Active', 'neve-child' ); ?></option>
					<option value="all"><?php echo esc_html__( 'All', 'neve-child' ); ?></option>
					<option value="pending"><?php echo esc_html__( 'Pending', 'neve-child' ); ?></option>
					<option value="on-hold"><?php echo esc_html__( 'On Hold', 'neve-child' ); ?></option>
					<option value="cancelled"><?php echo esc_html__( 'Cancelled', 'neve-child' ); ?></option>
				</select>
			</div>
			<div class="filter-group">
				<label>&nbsp;</label>
				<button type="button" id="btn-limpiar" class="btn btn-secondary">✕
					<?php echo esc_html__( 'Clear', 'neve-child' ); ?></button>
			</div>
		</div>

		<div id="active-filters" class="active-filters" style="display:none">
			<span class="quick-stat">
				<span class="quick-stat-value" id="count-results">0</span>
				<span class="quick-stat-label"><?php echo esc_html__( 'students', 'neve-child' ); ?></span>
			</span>
			<div id="filter-badges"></div>
		</div>

		<div id="alumnos-loading" class="loading-spinner">⏳ <?php echo esc_html__( 'Loading...', 'neve-child' ); ?></div>

		<div id="alumnos-table-container">
			<table class="data-table" id="alumnos-table">
				<thead>
					<tr>
						<th><?php echo esc_html__( 'Student', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Product', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Day/Days', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Schedule', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Age', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Plan', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Amount', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Status', 'neve-child' ); ?></th>
						<th><?php echo esc_html__( 'Start', 'neve-child' ); ?></th>
					</tr>
				</thead>
				<tbody id="alumnos-tbody"></tbody>
			</table>
		</div>

		<p id="total-info" class="rm-page-subtitle" style="margin-top:16px"></p>
		<div id="alumnos-pagination" style="display:none;margin-top:16px;text-align:center"></div>
		<?php
	}

	// ============================================
	// OBTENER DATOS DE SUSCRIPCIONES
	// ============================================

	public static function get_all_subscription_data() {
		$data = array();

		$product_dias_sueltos = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product_tarifas = RocoMadrid_Step_Form::product_tarifas_id();
		$product_pilates = intval( get_option( 'rocomadrid_product_pilates', 0 ) );
		$product_yoga = intval( get_option( 'rocomadrid_product_yoga', 0 ) );

		// Solo incluir IDs válidos (> 0) para no hacer match con ID 0
		$product_ids = array_values( array_filter(
			array( $product_dias_sueltos, $product_tarifas, $product_pilates, $product_yoga )
		) );

		$subscriptions = wcs_get_subscriptions( array(
			'subscriptions_per_page' => -1,
			'subscription_status' => array( 'active', 'pending', 'on-hold', 'cancelled' ),
		) );

		foreach ( $subscriptions as $subscription ) {
			$items = $subscription->get_items();
			$es_rocomadrid = false;
			$producto_id = 0;
			$producto_nombre = '';
			$dia = '';
			$horario = '';
			$edad = '';
			$plan = 'monthly';

			foreach ( $items as $item ) {
				$pid = $item->get_product_id();
				if ( in_array( $pid, $product_ids ) ) {
					$es_rocomadrid = true;
					$producto_id = $pid;
					$es_dias_sueltos = ( $pid == $product_dias_sueltos );

					// Nombre del producto
					if ( $pid === $product_pilates ) {
						$producto_nombre = 'Pilates';
					} elseif ( $pid === $product_yoga ) {
						$producto_nombre = 'Yoga';
					} else {
						$producto_nombre = $es_dias_sueltos ? 'Single Days' : 'Classes';
					}

					// Para Pilates/Yoga no hay _step_form_selections: ir directo al fallback de atributos
					$es_extra = ( $pid === $product_pilates || $pid === $product_yoga );

					// 1. Buscar en _step_form_selections (solo productos del step form)
					$step_selections = $es_extra ? array() : $item->get_meta( '_step_form_selections', true );
					if ( ! empty( $step_selections ) && is_array( $step_selections ) ) {
						if ( $es_dias_sueltos ) {
							$dia = isset( $step_selections['pa_dia-suelto'] ) ? $step_selections['pa_dia-suelto'] : '';
							$horario = isset( $step_selections['pa_horario'] ) ? $step_selections['pa_horario'] :
								( isset( $step_selections['pa_horario-dias-sueltos'] ) ? $step_selections['pa_horario-dias-sueltos'] : '' );
							$edad = isset( $step_selections['edad_addon'] ) ? $step_selections['edad_addon'] : '';
						} else {
							$dia = isset( $step_selections['pa_dias'] ) ? $step_selections['pa_dias'] : '';
							$horario = isset( $step_selections['pa_horario'] ) ? $step_selections['pa_horario'] : '';
							$edad = isset( $step_selections['pa_edad'] ) ? $step_selections['pa_edad'] : '';
						}
						if ( isset( $step_selections['plan_pago'] ) ) {
							$plan = strtolower( $step_selections['plan_pago'] );
						}
					}

					// 2. Respaldo: atributos de variación
					if ( empty( $dia ) || empty( $horario ) ) {
						$variation = wc_get_product( $item->get_variation_id() );
						if ( $variation ) {
							$attrs = $variation->get_variation_attributes();
							foreach ( $attrs as $key => $value ) {
								$key_lower = strtolower( $key );
								if ( empty( $dia ) ) {
									// Detecta: pa_dias, pa_dia-suelto, pa_yoga-dias, pa_pilates-dias, etc.
									if ( strpos( $key_lower, 'dia-suelto' ) !== false
										|| strpos( $key_lower, 'pa_dias' ) !== false
										|| substr( $key_lower, -4 ) === 'dias'
									) {
										$dia = $value;
									}
								}
								if ( empty( $horario ) ) {
									if ( strpos( $key_lower, 'horario' ) !== false ) {
										$horario = $value;
									}
								}
								if ( empty( $edad ) ) {
									if ( strpos( $key_lower, 'edad' ) !== false ) {
										$edad = $value;
									}
								}
							}
						}
					}

					// 3. Metadatos del item
					foreach ( $item->get_meta_data() as $meta ) {
						$key = strtolower( $meta->key );
						$value = $meta->value;
						if ( strpos( $key, 'plan' ) !== false && $plan === 'monthly' ) {
							$plan = strtolower( $value );
						}
						if ( $key === 'edad del alumno' && empty( $edad ) ) {
							$edad = $value;
						}
					}

					break;
				}
			}

			if ( ! $es_rocomadrid )
				continue;

			$dia_display = self::normalizar_dia( $dia );
			$horario_display = self::normalizar_horario( $horario );
			$edad_display = self::normalizar_edad( $edad );

			// Turno basado en hora
			$turno = 'Afternoon';
			if ( ! empty( $horario ) ) {
				preg_match( '/^(\d{2})(\d{2})?/', preg_replace( '/[^0-9]/', '', $horario ), $matches );
				if ( ! empty( $matches[1] ) ) {
					$hora = intval( $matches[1] );
					if ( $hora < 16 ) {
						$turno = 'Morning';
					}
				}
			}

			$customer = $subscription->get_user();
			$start_date = $subscription->get_date( 'date_created' );

			$data[] = array(
				'id' => $subscription->get_id(),
				'status' => $subscription->get_status(),
				'cliente' => $customer ? $customer->display_name : 'N/A',
				'email' => $customer ? $customer->user_email : 'N/A',
				'producto' => $producto_nombre,
				'producto_id' => $producto_id,
				'dia' => $dia_display,
				'horario' => $horario_display,
				'edad' => $edad_display ?: 'Adultos',
				'turno' => $turno,
				'plan' => $plan,
				'total' => floatval( $subscription->get_total() ),
				'period' => $subscription->get_billing_period(),
				'interval' => $subscription->get_billing_interval(),
				'fecha_inicio' => $start_date ? date_i18n( 'd/m/Y', strtotime( $start_date ) ) : 'N/A',
			);
		}

		return $data;
	}

	// ============================================
	// NORMALIZACIÓN
	// ============================================

	private static function normalizar_dia( $dia ) {
		if ( empty( $dia ) )
			return '';

		$map = array(
			// pares de días
			'lunes-miercoles' => 'Lunes-Miércoles',
			'lunes-miércoles' => 'Lunes-Miércoles',
			'monday-wednesday' => 'Lunes-Miércoles',
			'monday + wednesday' => 'Lunes-Miércoles',
			'l-x' => 'Lunes-Miércoles',
			'martes-jueves' => 'Martes-Jueves',
			'martes-juves' => 'Martes-Jueves',
			'tuesday-thursday' => 'Martes-Jueves',
			'tuesday + thursday' => 'Martes-Jueves',
			'm-j' => 'Martes-Jueves',
			// días individuales
			'lunes' => 'Lunes',
			'monday' => 'Lunes',
			'martes' => 'Martes',
			'tuesday' => 'Martes',
			'miercoles' => 'Miércoles',
			'miércoles' => 'Miércoles',
			'wednesday' => 'Miércoles',
			'jueves' => 'Jueves',
			'thursday' => 'Jueves',
			'viernes' => 'Viernes',
			'friday' => 'Viernes',
			'sabado' => 'Sábado',
			'sábado' => 'Sábado',
			'saturday' => 'Sábado',
		);

		$dia_lower = strtolower( $dia );
		return isset( $map[ $dia_lower ] ) ? $map[ $dia_lower ] : ucfirst( $dia );
	}

	private static function normalizar_horario( $horario ) {
		if ( empty( $horario ) )
			return '';
		if ( preg_match( '/^\d{2}:\d{2}/', $horario ) )
			return $horario;
		if ( preg_match( '/^(\d{2})(\d{2})-(\d{2})(\d{2})$/', $horario, $m ) ) {
			return $m[1] . ':' . $m[2] . '-' . $m[3] . ':' . $m[4];
		}
		return $horario;
	}

	private static function normalizar_edad( $edad ) {
		if ( empty( $edad ) )
			return 'Adultos';

		$map = array(
			'adultos' => 'Adultos',
			'adulto' => 'Adultos',
			'adults' => 'Adultos',
			'menores (6-12 años)' => 'Menores (6-12 años)',
			'menores' => 'Menores (6-12 años)',
			'infantil' => 'Menores (6-12 años)',
			'children' => 'Menores (6-12 años)',
			'children (6-12 years)' => 'Menores (6-12 años)',
			'adolescentes (12-18 años)' => 'Adolescentes (12-18 años)',
			'adolescentes' => 'Adolescentes (12-18 años)',
			'adolescente' => 'Adolescentes (12-18 años)',
			'teenagers' => 'Adolescentes (12-18 años)',
			'teenagers (12-18 years)' => 'Adolescentes (12-18 años)',
		);

		$edad_lower = strtolower( $edad );
		return isset( $map[ $edad_lower ] ) ? $map[ $edad_lower ] : ucfirst( $edad );
	}
}