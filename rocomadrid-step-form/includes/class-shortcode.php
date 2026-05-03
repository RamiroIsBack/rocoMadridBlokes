<?php
/**
 * Registro del shortcode [wc_step_form] y enqueue de assets
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Shortcode {

	public static function init() {
		add_shortcode( 'wc_step_form', array( __CLASS__, 'render' ) );
	}

	/**
	 * Renderizar el shortcode
	 */
	public static function render( $atts ) {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return '<p>' . esc_html__( 'WooCommerce is required.', 'neve-child' ) . '</p>';
		}

		$product_dias_sueltos = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$product_tarifas = RocoMadrid_Step_Form::product_tarifas_id();

		// Enqueue CSS
		wp_enqueue_style(
			'wc-step-form-css',
			ROCOMADRID_SF_URL . 'assets/css/step-form.css',
			array(),
			ROCOMADRID_SF_VERSION
		);
		wp_enqueue_style(
			'wc-step-form-multi-product',
			ROCOMADRID_SF_URL . 'assets/css/step-form-multi-product.css',
			array(),
			ROCOMADRID_SF_VERSION
		);

		// Enqueue JS
		wp_enqueue_script(
			'wc-step-form-js',
			ROCOMADRID_SF_URL . 'assets/js/step-form.js',
			array( 'jquery' ),
			ROCOMADRID_SF_VERSION,
			true
		);

		wp_enqueue_script(
			'feather-icons',
			ROCOMADRID_SF_URL . 'assets/js/icons.js',
			array(),
			ROCOMADRID_SF_VERSION,
			true
		);
		// Configuración para JS (con traducciones)
		$config = array(
			'ajax_url' => admin_url( 'admin-ajax.php' ),
			'nonce' => wp_create_nonce( 'wc_step_form_nonce' ),
			'product_dias_sueltos' => $product_dias_sueltos,
			'product_tarifas' => $product_tarifas,
			'flow' => array(
				'frequency' => array(
					'label' => __( 'How many days a week?', 'neve-child' ),
					'options' => array(
						array(
							'value' => '1_day',
							'label' => __( '1 day a week', 'neve-child' ),
							'icon' => '<i data-feather="calendar"></i>',
							'description' => __( 'Ideal to start or maintain', 'neve-child' ),
						),
						array(
							'value' => '2_days',
							'label' => __( '2 days a week', 'neve-child' ),
							'icon' => '<i data-feather="calendar"></i>',
							'description' => __( 'Better progression and price', 'neve-child' ),
						),
					),
				),
			),
			// Traducciones para JavaScript
			'i18n' => array(
				'select_plan_subtitle' => __( 'Select the plan that best suits your routine', 'neve-child' ),
				'no_schedules_available' => __( 'No schedules available', 'neve-child' ),
				'select_another_age' => __( 'You can select another age group or contact us for more information.', 'neve-child' ),
				'change_age' => __( 'Back', 'neve-child' ),
				'start_over' => __( 'Start over', 'neve-child' ),
				'choose_option_subtitle' => __( 'Choose the option that best suits you', 'neve-child' ),
				'back' => __( 'Back', 'neve-child' ),
				'processing' => __( 'Processing...', 'neve-child' ),
				'adding_to_cart' => __( 'Adding to cart...', 'neve-child' ),
				'error_occurred' => __( 'An error occurred. Please try again.', 'neve-child' ),
				'redirecting' => __( 'Redirecting...', 'neve-child' ),
				'choose_plan' => __( 'Choose plan', 'neve-child' ),
				// Nombres de pasos en la barra de progreso
				'step_frequency' => __( 'Frequency', 'neve-child' ),
				'step_day_days' => __( 'Day/Days', 'neve-child' ),
				'step_confirmation' => __( 'Confirmation', 'neve-child' ),
				// Nombres de pasos
				'step_day' => __( 'Day', 'neve-child' ),
				'step_days' => __( 'Days', 'neve-child' ),
				'step_age' => __( 'Age', 'neve-child' ),
				'step_schedule' => __( 'Schedule', 'neve-child' ),
				'step_selection' => __( 'Selection', 'neve-child' ),
				// Días de la semana
				'monday' => __( 'Monday', 'neve-child' ),
				'tuesday' => __( 'Tuesday', 'neve-child' ),
				'wednesday' => __( 'Wednesday', 'neve-child' ),
				'thursday' => __( 'Thursday', 'neve-child' ),
				'friday' => __( 'Friday', 'neve-child' ),
				'saturday' => __( 'Saturday', 'neve-child' ),
				'sunday' => __( 'Sunday', 'neve-child' ),
				// Descripciones de días
				'class_every_monday' => __( 'Class every Monday', 'neve-child' ),
				'class_every_tuesday' => __( 'Class every Tuesday', 'neve-child' ),
				'class_every_wednesday' => __( 'Class every Wednesday', 'neve-child' ),
				'class_every_thursday' => __( 'Class every Thursday', 'neve-child' ),
				'class_every_friday' => __( 'Class every Friday', 'neve-child' ),
				'class_every_saturday' => __( 'Class every Saturday', 'neve-child' ),
				// Pares de días
				'monday_wednesday' => __( 'Monday and Wednesday', 'neve-child' ),
				'tuesday_thursday' => __( 'Tuesday and Thursday', 'neve-child' ),
				// Edades
				'adults' => __( 'Adults', 'neve-child' ),
				'all_schedules_available' => __( 'All schedules available', 'neve-child' ),
				'children_afternoon' => __( 'Afternoon schedules (from 16:00) ', 'neve-child' ),
				'teenagers_afternoon' => __( 'Afternoon schedules (from 16:00) ', 'neve-child' ),
				'over_18' => __( 'Over 18 years old', 'neve-child' ),
				'6_to_12' => __( '6 to 12 years old', 'neve-child' ),
				'12_to_18' => __( '12 to 18 years old', 'neve-child' ),
				// Turnos
				'morning_shift' => __( 'Morning shift', 'neve-child' ),
				'midday_shift' => __( 'Midday shift', 'neve-child' ),
				'afternoon_shift' => __( 'Afternoon shift', 'neve-child' ),
				// Carrito y confirmación
				'product_added' => __( 'Product added successfully', 'neve-child' ),
				'view_cart' => __( 'View cart', 'neve-child' ),
				'checkout' => __( 'Checkout', 'neve-child' ),
				'add_another' => __( 'Add another class', 'neve-child' ),
				'click_to_return' => __( 'Click to go back to this step', 'neve-child' ),
				// Nombres de clases
				'classes_full' => __( 'Classes full', 'neve-child' ),
				'join_waiting_list' => __( 'Contact us to join the waiting list', 'neve-child' ),
				'contact_via_whatsapp' => __( 'Contact via WhatsApp', 'neve-child' ),
				'contact_form' => __( 'Contact form', 'neve-child' ),
			),
		);

		wp_localize_script( 'wc-step-form-js', 'wcStepForm', $config );

		// Encolar modal de asignación solo si el usuario es admin/shop manager
		if ( current_user_can( 'manage_woocommerce' ) ) {
			$admin_nonce = wp_create_nonce( 'rocomadrid_admin_assign_nonce' );
			RocoMadrid_SF_Admin_Assign::enqueue_assets( $admin_nonce );
		}

		ob_start();
		?>
		<div id="wc-step-form-container">
			<div class="step-progress" id="dynamic-progress">
				<!-- Los pasos se generarán dinámicamente -->
			</div>

			<div id="dynamic-steps">
				<!-- Aquí se cargarán los pasos dinámicos -->
			</div>

			<div class="step-content" id="step-result" style="display: none;">
				<div id="product-result"></div>
				<div class="step-navigation">
					<button type="button" class="btn-back" id="result-back">←
						<?php echo esc_html__( 'Back', 'neve-child' ); ?></button>
					<button type="button" class="btn-restart">🔄
						<?php echo esc_html__( 'Start over', 'neve-child' ); ?></button>
				</div>
			</div>

			<div class="loading" id="loading-spinner" style="display: none;">
				<div class="spinner"></div>
				<p><?php echo esc_html__( 'Loading options...', 'neve-child' ); ?></p>
			</div>
		</div>
		<?php
		return ob_get_clean();
	}
}