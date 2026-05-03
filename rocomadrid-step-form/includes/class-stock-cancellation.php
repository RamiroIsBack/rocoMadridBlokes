<?php
/**
 * Devolución automática de stock al cancelar/expirar una suscripción
 *
 * Flujo:
 *  1. Una suscripción pasa a estado "Cancelada" o "Expirada"
 *  2. Se recorren los ítems de la suscripción
 *  3. Se devuelve el stock de cada producto/variación
 *  4. Se marca la suscripción para evitar dobles devoluciones (idempotencia)
 *  5. Se añade una nota de auditoría en el pedido
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Interface para operaciones de gestión de stock.
 * Facilita el testing (mocking) y permite cambiar la implementación de WC en el futuro.
 */
interface RocoMadrid_Stock_Manager_Interface {
	public function increase_stock( int $product_id, int $quantity ): void;
}

/**
 * Implementación concreta acoplada a las funciones nativas de WooCommerce.
 */
class RocoMadrid_WC_Stock_Manager implements RocoMadrid_Stock_Manager_Interface {

	public function increase_stock( int $product_id, int $quantity ): void {
		$product = wc_get_product( $product_id );

		// Verificamos que el producto exista y tenga el control de stock activado
		if ( ! $product || ! $product->managing_stock() ) {
			return;
		}

		// Función nativa y segura de WC para alterar el stock (maneja la caché y los transients)
		wc_update_product_stock( $product, $quantity, 'increase' );

	}
}

/**
 * Observa los cambios de estado en las suscripciones y coordina la devolución de stock.
 */
class RocoMadrid_SF_Stock_Cancellation {

	/** @var RocoMadrid_Stock_Manager_Interface */
	private static RocoMadrid_Stock_Manager_Interface $stock_manager;

	/** Meta key para garantizar idempotencia */
	private const STOCK_RESTORED_META_KEY = '_rocomadrid_stock_restored_on_cancellation';

	/**
	 * Inicializar con la implementación concreta de WooCommerce.
	 */
	public static function init(): void {
		self::$stock_manager = new RocoMadrid_WC_Stock_Manager();

		// Escuchamos cuando una suscripción pasa a estado "Cancelada"
		add_action( 'woocommerce_subscription_status_cancelled', array( __CLASS__, 'handle_subscription_termination' ) );

		// Escuchamos cuando una suscripción pasa a estado "Expirada"
		add_action( 'woocommerce_subscription_status_expired', array( __CLASS__, 'handle_subscription_termination' ) );
	}

	/**
	 * Procesa la baja de la suscripción y devuelve el stock.
	 *
	 * @param WC_Subscription $subscription La suscripción que ha cambiado de estado.
	 */
	public static function handle_subscription_termination( WC_Subscription $subscription ): void {
		// IDEMPOTENCIA: Evitamos devolver el stock más de una vez por suscripción.
		// Crítico en integraciones con webhooks asíncronos (ej. Stripe/PayPal).
		if ( $subscription->get_meta( self::STOCK_RESTORED_META_KEY ) === 'yes' ) {
			return;
		}

		$items = $subscription->get_items();

		foreach ( $items as $item ) {
			// Usamos el ID de la variación si existe, de lo contrario el del producto padre
			$product_id = $item->get_variation_id() > 0
				? $item->get_variation_id()
				: $item->get_product_id();

			$quantity = (int) $item->get_quantity();

			self::$stock_manager->increase_stock( $product_id, $quantity );
		}

		// Marcamos la suscripción para que no vuelva a procesarse
		$subscription->update_meta_data( self::STOCK_RESTORED_META_KEY, 'yes' );
		$subscription->save();

		// Nota de auditoría visible en el panel de administración
		$subscription->add_order_note(
			__( 'Sistema: Stock recuperado automáticamente tras la cancelación/expiración de la suscripción.', 'neve-child' )
		);
	}
}
