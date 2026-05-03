<?php
/**
 * Hooks de WooCommerce para carrito, suscripciones y pedidos
 *
 * Modifica precios, períodos de suscripción, textos y metadatos
 * según las selecciones del formulario por pasos.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Cart {

	public static function init() {
		// Modificar precio y período de suscripción
		add_action( 'woocommerce_before_calculate_totals', array( __CLASS__, 'modify_cart_prices' ), 1, 1 );

		// Filtros de período de suscripción
		add_filter( 'woocommerce_subscriptions_product_period', array( __CLASS__, 'filter_subscription_period' ), 1000, 2 );
		add_filter( 'woocommerce_subscriptions_product_period_interval', array( __CLASS__, 'filter_subscription_interval' ), 1000, 2 );
		add_filter( 'woocommerce_subscriptions_product_price_string', array( __CLASS__, 'filter_price_string' ), 1000, 3 );
		add_filter( 'wcs_cart_totals_order_total_html', array( __CLASS__, 'filter_cart_totals_html' ), 1000, 2 );
		add_filter( 'gettext', array( __CLASS__, 'filter_subscription_text' ), 1000, 3 );

		// Mostrar datos en carrito
		add_filter( 'woocommerce_get_item_data', array( __CLASS__, 'display_cart_item_data' ), 10, 2 );

		// Guardar en pedido
		add_action( 'woocommerce_checkout_create_order_line_item', array( __CLASS__, 'save_order_item_meta' ), 10, 4 );
	}

	/**
	 * Modificar precio y período de suscripción según el plan seleccionado
	 */
	public static function modify_cart_prices( $cart ) {
		if ( is_admin() && ! defined( 'DOING_AJAX' ) ) {
			return;
		}

		static $running = false;
		if ( $running ) {
			return;
		}
		$running = true;

		foreach ( $cart->get_cart() as $cart_item_key => $cart_item ) {
			if ( isset( $cart_item['step_form_price'] ) && $cart_item['step_form_price'] > 0 ) {
				$price = floatval( $cart_item['step_form_price'] );
				$product = $cart_item['data'];
				$product->set_price( $price );

				if ( isset( $cart_item['payment_plan'] ) ) {
					$plan = $cart_item['payment_plan'];

					if ( $plan === 'quarterly' ) {
						$product->update_meta_data( '_subscription_period', 'month' );
						$product->update_meta_data( '_subscription_period_interval', 3 );
					} elseif ( $plan === 'annual' ) {
						$product->update_meta_data( '_subscription_period', 'year' );
						$product->update_meta_data( '_subscription_period_interval', 1 );
					} else {
						$product->update_meta_data( '_subscription_period', 'month' );
						$product->update_meta_data( '_subscription_period_interval', 1 );
					}
				}
			}
		}

		$running = false;
	}

	/**
	 * Filtro para período de suscripción
	 */
	public static function filter_subscription_period( $period, $product ) {
		if ( ! function_exists( 'WC' ) || ! WC()->cart || ! did_action( 'wp_loaded' ) ) {
			return $period;
		}

		foreach ( WC()->cart->get_cart() as $cart_item ) {
			if ( isset( $cart_item['data'] ) && $cart_item['data']->get_id() === $product->get_id() ) {
				if ( isset( $cart_item['payment_plan'] ) ) {
					return ( $cart_item['payment_plan'] === 'annual' ) ? 'year' : 'month';
				}
			}
		}
		return $period;
	}

	/**
	 * Filtro para intervalo de suscripción
	 */
	public static function filter_subscription_interval( $interval, $product ) {
		if ( ! function_exists( 'WC' ) || ! WC()->cart || ! did_action( 'wp_loaded' ) ) {
			return $interval;
		}

		foreach ( WC()->cart->get_cart() as $cart_item ) {
			if ( isset( $cart_item['data'] ) && $cart_item['data']->get_id() === $product->get_id() ) {
				if ( isset( $cart_item['payment_plan'] ) ) {
					if ( $cart_item['payment_plan'] === 'quarterly' ) {
						return 3;
					}
					return 1;
				}
			}
		}
		return $interval;
	}

	/**
	 * Filtro para el precio string de suscripción
	 */
	public static function filter_price_string( $price_string, $product, $args ) {
		if ( ! function_exists( 'WC' ) || ! WC()->cart || ! did_action( 'wp_loaded' ) ) {
			return $price_string;
		}

		foreach ( WC()->cart->get_cart() as $cart_item ) {
			if ( isset( $cart_item['data'] ) && isset( $cart_item['payment_plan'] ) && isset( $cart_item['step_form_price'] ) ) {
				$plan = $cart_item['payment_plan'];
				$price = $cart_item['step_form_price'];

				if ( $plan === 'quarterly' ) {
					return wc_price( $price ) . ' ' . __( 'every 3 months', 'neve-child' );
				} elseif ( $plan === 'annual' ) {
					return wc_price( $price ) . ' ' . __( 'every year', 'neve-child' );
				} else {
					return wc_price( $price ) . ' ' . __( 'every month', 'neve-child' );
				}
			}
		}
		return $price_string;
	}

	/**
	 * Modificar texto de totales recurrentes
	 */
	public static function filter_cart_totals_html( $html, $cart ) {
		foreach ( $cart->get_cart() as $cart_item ) {
			if ( isset( $cart_item['payment_plan'] ) ) {
				$plan = $cart_item['payment_plan'];

				if ( $plan === 'quarterly' ) {
					$html = str_replace(
						array( 'cada mes', '/ mes', '/mes', 'mensual', 'monthly', 'every month' ),
						array(
							__( 'every 3 months', 'neve-child' ),
							'/ ' . __( '3 months', 'neve-child' ),
							'/' . __( '3 months', 'neve-child' ),
							__( 'quarterly', 'neve-child' ),
							__( 'every 3 months', 'neve-child' ),
							__( 'every 3 months', 'neve-child' ),
						),
						$html
					);
				} elseif ( $plan === 'annual' ) {
					$html = str_replace(
						array( 'cada mes', '/ mes', '/mes', 'mensual', 'monthly', 'every month' ),
						array(
							__( 'every year', 'neve-child' ),
							'/ ' . __( 'year', 'neve-child' ),
							'/' . __( 'year', 'neve-child' ),
							__( 'annual', 'neve-child' ),
							__( 'yearly', 'neve-child' ),
							__( 'every year', 'neve-child' ),
						),
						$html
					);
				}
				break;
			}
		}
		return $html;
	}

	/**
	 * Modificar el texto "Total recurrente" en el carrito
	 */
	public static function filter_subscription_text( $translated, $text, $domain ) {
		if ( $domain !== 'woocommerce-subscriptions' ) {
			return $translated;
		}

		if ( ! function_exists( 'WC' ) || ! WC()->cart || ! did_action( 'wp_loaded' ) ) {
			return $translated;
		}

		if ( ! method_exists( WC()->cart, 'get_cart' ) ) {
			return $translated;
		}

		foreach ( WC()->cart->get_cart() as $cart_item ) {
			if ( isset( $cart_item['payment_plan'] ) ) {
				$plan = $cart_item['payment_plan'];

				if ( $plan === 'quarterly' ) {
					if ( strpos( $text, 'month' ) !== false || strpos( $translated, 'monthly' ) !== false || strpos( $translated, 'month' ) !== false ) {
						$translated = str_replace(
							array( 'monthly', 'every month', '/ month', 'month' ),
							array( 'quarterly', 'every 3 months', '/ 3 months', '3 months' ),
							$translated
						);
					}
				} elseif ( $plan === 'annual' ) {
					if ( strpos( $text, 'month' ) !== false || strpos( $translated, 'monthly' ) !== false || strpos( $translated, 'month' ) !== false ) {
						$translated = str_replace(
							array( 'monthly', 'every month', '/ month', 'month' ),
							array( 'annual', 'every year', '/ year', 'year' ),
							$translated
						);
					}
				}
				break;
			}
		}
		return $translated;
	}

	/**
	 * Mostrar datos en carrito
	 */
	public static function display_cart_item_data( $item_data, $cart_item ) {
		if ( isset( $cart_item['student_age'] ) ) {
			$item_data[] = array(
				'key' => __( 'Student age', 'neve-child' ),
				'value' => $cart_item['student_age'],
			);
		}
		if ( isset( $cart_item['payment_plan'] ) ) {
			$plan_labels = array(
				'monthly' => __( 'Monthly', 'neve-child' ),
				'quarterly' => __( 'Quarterly', 'neve-child' ),
				'annual' => __( 'Annual', 'neve-child' ),
			);
			$item_data[] = array(
				'key' => __( 'Payment plan', 'neve-child' ),
				'value' => isset( $plan_labels[ $cart_item['payment_plan'] ] ) ? $plan_labels[ $cart_item['payment_plan'] ] : $cart_item['payment_plan'],
			);
		}
		return $item_data;
	}

	/**
	 * Guardar metadatos en pedido
	 */
	public static function save_order_item_meta( $item, $cart_item_key, $values, $order ) {
		if ( isset( $values['step_form_selections'] ) ) {
			$item->add_meta_data( '_step_form_selections', $values['step_form_selections'], true );
		}
		if ( isset( $values['step_form_display'] ) ) {
			$item->add_meta_data( '_step_form_display', $values['step_form_display'], true );
		}
		if ( isset( $values['student_age'] ) ) {
			$item->add_meta_data( __( 'Student age', 'neve-child' ), $values['student_age'], true );
		}
		if ( isset( $values['payment_plan'] ) ) {
			$plan_labels = array(
				'monthly' => __( 'Monthly', 'neve-child' ),
				'quarterly' => __( 'Quarterly', 'neve-child' ),
				'annual' => __( 'Annual', 'neve-child' ),
			);
			$item->add_meta_data(
				__( 'Payment plan', 'neve-child' ),
				isset( $plan_labels[ $values['payment_plan'] ] ) ? $plan_labels[ $values['payment_plan'] ] : $values['payment_plan'],
				true
			);
		}
	}
}
