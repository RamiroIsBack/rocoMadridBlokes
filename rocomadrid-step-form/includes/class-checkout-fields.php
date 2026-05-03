<?php
/**
 * Agrega campos personalizados en el checkout de WooCommerce.
 * Checkbox "Soy nuevo en el proceso de compra" después de términos y condiciones.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Checkout_Fields {

	public static function init() {
		add_action( 'woocommerce_checkout_after_terms_and_conditions', array( __CLASS__, 'render_new_buyer_checkbox' ) );
		add_action( 'woocommerce_checkout_process', array( __CLASS__, 'validate_new_buyer_checkbox' ) );
		add_action( 'woocommerce_checkout_update_order_meta', array( __CLASS__, 'save_new_buyer_checkbox' ) );
	}

	/**
	 * Renderiza el checkbox "Soy nuevo en el proceso de compra".
	 */
	public static function render_new_buyer_checkbox() {
		$guide_page = get_page_by_path( 'soy-nuevo' );
		$guide_url = $guide_page ? esc_url( get_permalink( $guide_page ) ) : '#';

		woocommerce_form_field( 'new_buyer_agreement', array(
			'type' => 'checkbox',
			'class' => array( 'form-row-wide' ),
			'label' => sprintf(
				__( 'I have read and accept the <a href="%s" target="_blank">rules</a> of use of RocoMadrid.', 'neve-child' ),
				$guide_url
			),
			'required' => true,
		), WC()->checkout->get_value( 'new_buyer_agreement' ) );
	}

	/**
	 * Valida que el checkbox esté marcado antes de procesar el pedido.
	 */
	public static function validate_new_buyer_checkbox() {
		if ( empty( $_POST['new_buyer_agreement'] ) ) {
			wc_add_notice(
				__( 'Please confirm that you have read and accept the rules of use of RocoMadrid.', 'neve-child' ),
				'error'
			);
		}
	}

	/**
	 * Guarda el valor del checkbox en los metadatos del pedido.
	 *
	 * @param int $order_id ID del pedido.
	 */
	public static function save_new_buyer_checkbox( $order_id ) {
		if ( ! empty( $_POST['new_buyer_agreement'] ) ) {
			update_post_meta( $order_id, '_new_buyer_agreement', '1' );
		}
	}
}