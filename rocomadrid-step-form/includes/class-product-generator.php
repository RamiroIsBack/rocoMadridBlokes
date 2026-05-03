<?php
/**
 * Generador de productos WooCommerce para RocoMadrid
 *
 * Crea/regenera los dos productos de suscripción:
 * 1. Días Sueltos: variaciones Día + Horario + addon Edad
 * 2. Clases (2 días): variaciones Días + Edad + Horario + addon Tipo Estudiante
 *
 * Página admin: WooCommerce > 🏗️ Product Generator
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Product_Generator {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_menu' ) );
	}

	public static function register_menu() {
		add_submenu_page(
			'rocomadrid-pricing',
			__( 'RocoMadrid Product Generator', 'neve-child' ),
			__( 'Product Generator', 'neve-child' ),
			'manage_woocommerce',
			'rocomadrid-product-generator',
			array( __CLASS__, 'render_page' )
		);
	}

	// ============================================
	// DATOS DE HORARIOS
	// ============================================

	/**
	 * Horarios del producto Días Sueltos (1 día/semana)
	 * Cada día tiene un array de [time, turno]
	 * El turno determina el precio base para adultos
	 */
	private static function get_single_day_schedules() {
		return array(
			'Lunes' => array(
				array( 'time' => '09:00-10:30', 'turno' => 'morning' ),
				array( 'time' => '17:30-19:00', 'turno' => 'afternoon' ),
				array( 'time' => '18:00-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '18:30-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '19:00-20:30', 'turno' => 'afternoon' ),
				array( 'time' => '19:30-21:00', 'turno' => 'afternoon' ),
				array( 'time' => '20:30-22:00', 'turno' => 'afternoon' ),
				array( 'time' => '21:00-22:30', 'turno' => 'afternoon' ),
			),
			'Martes' => array(
				array( 'time' => '07:00-08:30', 'turno' => 'morning' ),
				array( 'time' => '09:00-10:30', 'turno' => 'morning' ),
				array( 'time' => '10:30-12:00', 'turno' => 'morning' ),
				array( 'time' => '12:00-13:30', 'turno' => 'morning' ),
				array( 'time' => '14:00-15:30', 'turno' => 'morning' ),
				array( 'time' => '16:30-18:00', 'turno' => 'afternoon' ),
				array( 'time' => '17:30-18:30', 'turno' => 'afternoon' ),
				array( 'time' => '17:30-19:00', 'turno' => 'afternoon' ),
				array( 'time' => '18:00-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '18:30-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '18:30-20:00', 'turno' => 'afternoon' ),
				array( 'time' => '19:00-20:30', 'turno' => 'afternoon' ),
				array( 'time' => '19:30-21:00', 'turno' => 'afternoon' ),
				array( 'time' => '20:00-21:30', 'turno' => 'afternoon' ),
				array( 'time' => '20:30-22:00', 'turno' => 'afternoon' ),
				array( 'time' => '21:00-22:30', 'turno' => 'afternoon' ),
			),
			'Miércoles' => array(
				array( 'time' => '09:00-10:30', 'turno' => 'morning' ),
				array( 'time' => '17:30-19:00', 'turno' => 'afternoon' ),
				array( 'time' => '18:00-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '18:30-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '19:00-20:30', 'turno' => 'afternoon' ),
				array( 'time' => '19:30-21:00', 'turno' => 'afternoon' ),
				array( 'time' => '20:30-22:00', 'turno' => 'afternoon' ),
				array( 'time' => '21:00-22:30', 'turno' => 'afternoon' ),
			),
			'Jueves' => array(
				array( 'time' => '07:00-08:30', 'turno' => 'morning' ),
				array( 'time' => '09:00-10:30', 'turno' => 'morning' ),
				array( 'time' => '10:30-12:00', 'turno' => 'morning' ),
				array( 'time' => '12:00-13:30', 'turno' => 'morning' ),
				array( 'time' => '14:00-15:30', 'turno' => 'morning' ),
				array( 'time' => '16:30-18:00', 'turno' => 'afternoon' ),
				array( 'time' => '17:30-18:30', 'turno' => 'afternoon' ),
				array( 'time' => '17:30-19:00', 'turno' => 'afternoon' ),
				array( 'time' => '18:00-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '18:30-19:30', 'turno' => 'afternoon' ),
				array( 'time' => '18:30-20:00', 'turno' => 'afternoon' ),
				array( 'time' => '19:00-20:30', 'turno' => 'afternoon' ),
				array( 'time' => '19:30-21:00', 'turno' => 'afternoon' ),
				array( 'time' => '20:00-21:30', 'turno' => 'afternoon' ),
				array( 'time' => '20:30-22:00', 'turno' => 'afternoon' ),
				array( 'time' => '21:00-22:30', 'turno' => 'afternoon' ),
			),
			'Viernes' => array(
				array( 'time' => '09:00-11:00', 'turno' => 'morning' ),
				array( 'time' => '18:00-19:00', 'turno' => 'special' ),
				array( 'time' => '19:00-20:00', 'turno' => 'special' ),
				array( 'time' => '19:00-21:00', 'turno' => 'special' ),
			),
			'Sábado' => array(
				array( 'time' => '09:00-11:00', 'turno' => 'special' ),
				array( 'time' => '11:00-13:00', 'turno' => 'special' ),
				array( 'time' => '17:00-19:00', 'turno' => 'special' ),
				array( 'time' => '19:00-21:00', 'turno' => 'special' ),
			),
		);
	}

	/**
	 * Horarios del producto Clases (2 días/semana)
	 * Organizado por bloque de días y edad
	 */
	private static function get_classes_schedules() {
		return array(
			'Lunes-Miércoles' => array(
				'adultos' => array(
					'09:00-10:30',
					'17:30-19:00',
					'18:00-19:30',
					'19:00-20:30',
					'19:30-21:00',
					'20:30-22:00',
					'21:00-22:30',
				),
				'menores' => array(),
			),
			'Martes-Jueves' => array(
				'adultos' => array(
					'07:00-08:30',
					'09:00-10:30',
					'10:30-12:00',
					'12:00-13:30',
					'14:00-15:30',
					'16:30-18:00',
					'17:30-19:00',
					'18:00-19:30',
					'18:30-20:00',
					'19:00-20:30',
					'19:30-21:00',
					'20:00-21:30',
					'20:30-22:00',
					'21:00-22:30',
				),
				'menores' => array(
					'17:30-18:30',
				),
			),
		);
	}

	/**
	 * Precios base por turno para adultos (1 día/semana)
	 * Lee desde Settings (configurables en admin)
	 */
	private static function get_single_day_prices() {
		return RocoMadrid_SF_Settings::get_single_day_prices();
	}

	/**
	 * Precio mensual para Clases (2 días/semana)
	 * Lee desde Settings (configurables en admin)
	 */
	private static function get_classes_price( $age, $schedule ) {
		return RocoMadrid_SF_Settings::get_classes_price( $age, $schedule );
	}

	// ============================================
	// HELPERS DE TAXONOMÍA
	// ============================================

	/**
	 * Asegurar que un atributo global de WooCommerce existe
	 */
	private static function ensure_global_attribute( $name, $label ) {
		if ( ! function_exists( 'wc_create_attribute' ) ) {
			return '';
		}

		$tax_name = wc_sanitize_taxonomy_name( $name );
		$taxonomy = 'pa_' . $tax_name;

		if ( taxonomy_exists( $taxonomy ) ) {
			return $taxonomy;
		}

		$exists = false;
		foreach ( (array) wc_get_attribute_taxonomies() as $a ) {
			if ( $a->attribute_name === $tax_name ) {
				$exists = true;
				break;
			}
		}

		if ( ! $exists ) {
			$result = wc_create_attribute( array(
				'name' => $label,
				'slug' => $tax_name,
				'type' => 'select',
				'order_by' => 'menu_order',
				'has_archives' => false,
			) );

			if ( is_wp_error( $result ) ) {
				return '';
			}
		}

		if ( ! taxonomy_exists( $taxonomy ) ) {
			register_taxonomy( $taxonomy, 'product', array(
				'labels' => array( 'name' => $label ),
				'hierarchical' => false,
				'show_ui' => false,
				'query_var' => true,
				'rewrite' => array( 'slug' => $tax_name ),
			) );
		}

		return $taxonomy;
	}

	/**
	 * Asegurar que un término existe en una taxonomía
	 */
	private static function ensure_term( $taxonomy, $name ) {
		$term = get_term_by( 'name', $name, $taxonomy );

		if ( ! $term || is_wp_error( $term ) ) {
			$term = get_term_by( 'slug', sanitize_title( $name ), $taxonomy );
		}

		if ( ! $term || is_wp_error( $term ) ) {
			$result = wp_insert_term( $name, $taxonomy, array( 'slug' => sanitize_title( $name ) ) );
			if ( is_wp_error( $result ) ) {
				if ( $result->get_error_code() === 'term_exists' ) {
					$term = get_term( $result->get_error_data(), $taxonomy );
				} else {
					return null;
				}
			} else {
				$term = get_term( $result['term_id'], $taxonomy );
			}
		}

		return $term;
	}

	/**
	 * Construir un WC_Product_Attribute con los términos dados
	 */
	private static function build_attribute( $taxonomy, $term_names, $position = 0 ) {
		$pa = new WC_Product_Attribute();
		$attribute_name = str_starts_with( $taxonomy, 'pa_' ) ? substr( $taxonomy, 3 ) : $taxonomy;
		$attribute_id = wc_attribute_taxonomy_id_by_name( $attribute_name );

		$pa->set_id( $attribute_id );
		$pa->set_name( $taxonomy );

		$term_ids = array();
		foreach ( $term_names as $name ) {
			$term = self::ensure_term( $taxonomy, $name );
			if ( $term ) {
				$term_ids[] = (int) $term->term_id;
			}
		}

		sort( $term_ids, SORT_NUMERIC );
		$pa->set_options( $term_ids );
		$pa->set_visible( true );
		$pa->set_variation( true );
		$pa->set_position( $position );

		return $pa;
	}

	/**
	 * Mapear nombres de términos a slugs para variaciones
	 */
	private static function map_to_slugs( $attrs ) {
		$mapped = array();
		foreach ( $attrs as $taxonomy => $value ) {
			$term = self::ensure_term( $taxonomy, $value );
			$mapped[ $taxonomy ] = $term ? $term->slug : sanitize_title( $value );
		}
		return $mapped;
	}

	/**
	 * Buscar producto por título
	 */
	private static function find_product_by_title( $title ) {
		$query = new WP_Query( array(
			'post_type' => 'product',
			'title' => $title,
			'posts_per_page' => 1,
			'fields' => 'ids',
			'no_found_rows' => true,
		) );
		return ! empty( $query->posts ) ? (int) $query->posts[0] : 0;
	}

	/**
	 * Buscar una variación existente por sus atributos exactos
	 *
	 * @param int   $product_id  ID del producto padre
	 * @param array $attributes  Array asociativo taxonomy => slug
	 * @return int  ID de la variación encontrada o 0
	 */
	private static function find_existing_variation( $product_id, $attributes ) {
		$product = wc_get_product( $product_id );
		if ( ! $product || ! method_exists( $product, 'get_children' ) ) {
			return 0;
		}

		foreach ( $product->get_children() as $child_id ) {
			$variation = wc_get_product( $child_id );
			if ( ! $variation ) {
				continue;
			}

			$var_attrs = $variation->get_attributes();
			$match = true;

			foreach ( $attributes as $tax => $slug ) {
				$var_val = isset( $var_attrs[ $tax ] ) ? $var_attrs[ $tax ] : '';
				if ( $var_val !== $slug ) {
					$match = false;
					break;
				}
			}

			if ( $match && count( $attributes ) === count( $var_attrs ) ) {
				return $child_id;
			}
		}

		return 0;
	}

	/**
	 * Verificar si una variación tiene suscripciones activas asociadas
	 *
	 * @param int $variation_id  ID de la variación
	 * @return bool
	 */
	private static function variation_has_active_subscriptions( $variation_id ) {
		if ( ! function_exists( 'wcs_get_subscriptions' ) ) {
			return false;
		}

		$subscriptions = wcs_get_subscriptions( array(
			'subscriptions_per_page' => 1,
			'subscription_status' => array( 'active', 'pending', 'on-hold' ),
		) );

		foreach ( $subscriptions as $subscription ) {
			foreach ( $subscription->get_items() as $item ) {
				if ( $item instanceof WC_Order_Item_Product && (int) $item->get_variation_id() === (int) $variation_id ) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Limpiar variaciones huérfanas que ya no corresponden a la config actual.
	 * Solo elimina las que NO tienen suscripciones activas.
	 * Las que sí tienen, se pasan a estado 'private' para que no aparezcan en el frontend.
	 *
	 * @param int   $product_id     ID del producto padre
	 * @param array $kept_ids       IDs de variaciones que se mantienen (actualizadas o creadas)
	 * @return array                Resumen de acciones
	 */
	private static function cleanup_orphan_variations( $product_id, $kept_ids ) {
		$product = wc_get_product( $product_id );
		if ( ! $product ) {
			return array( 'deleted' => 0, 'preserved' => 0 );
		}

		$deleted = 0;
		$preserved = 0;

		foreach ( $product->get_children() as $child_id ) {
			if ( in_array( $child_id, $kept_ids, true ) ) {
				continue;
			}

			// Variación huérfana: verificar si tiene suscripciones activas
			if ( self::variation_has_active_subscriptions( $child_id ) ) {
				// Preservar pero ocultar del frontend
				$variation = wc_get_product( $child_id );
				if ( $variation ) {
					$variation->set_status( 'private' );
					$variation->set_stock_status( 'outofstock' );
					$variation->save();
				}
				$preserved++;
			} else {
				wp_delete_post( $child_id, true );
				$deleted++;
			}
		}

		return array( 'deleted' => $deleted, 'preserved' => $preserved );
	}

	// ============================================
	// GENERADOR: DÍAS SUELTOS (1 día/semana)
	// ============================================

	public static function generate_single_days() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return array( 'error' => 'WooCommerce is not active.' );
		}

		$product_title = 'Días Sueltos RocoMadrid';
		$product_id = self::find_product_by_title( $product_title );
		$is_subscription = class_exists( 'WC_Subscriptions' );
		$product_type = $is_subscription ? 'variable-subscription' : 'variable';

		// Crear o actualizar producto padre
		if ( ! $product_id ) {
			if ( $is_subscription ) {
				$product = new WC_Product_Variable_Subscription();
			} else {
				$product = new WC_Product_Variable();
			}
			$product->set_name( $product_title );
			$product->set_status( 'publish' );
			$product->set_virtual( true );
			$product->set_manage_stock( false );
			$product->set_catalog_visibility( 'visible' );
			$product->set_short_description( 'Monthly subscription for directed training. Choose your preferred day and schedule. 1 day per week.' );
			$product_id = $product->save();
			wp_set_object_terms( $product_id, $product_type, 'product_type', false );
		} else {
			$product = wc_get_product( $product_id );
			$product->set_virtual( true );
			$product->set_manage_stock( false );
			$product->set_catalog_visibility( 'visible' );
			$product->save();
			wp_set_object_terms( $product_id, $product_type, 'product_type', false );
		}

		// Atributos: pa_dia-suelto + pa_horario
		$tax_dia = self::ensure_global_attribute( 'dia-suelto', 'Día' );
		$tax_hora = self::ensure_global_attribute( 'horario', 'Horario' );

		$schedules = self::get_single_day_schedules();

		// Recoger términos usados
		$used_days = array_keys( $schedules );
		$used_times = array();
		foreach ( $schedules as $slots ) {
			foreach ( $slots as $slot ) {
				if ( ! in_array( $slot['time'], $used_times ) ) {
					$used_times[] = $slot['time'];
				}
			}
		}
		sort( $used_times );

		// Configurar atributos en el producto
		$attributes = array();
		$attributes[ $tax_dia ] = self::build_attribute( $tax_dia, $used_days, 0 );
		$attributes[ $tax_hora ] = self::build_attribute( $tax_hora, $used_times, 1 );

		$product = wc_get_product( $product_id );
		$product->set_attributes( $attributes );
		$product->save();

		wp_cache_flush();

		// Actualizar o crear variaciones (sin borrar las existentes con suscripciones)
		$prices = self::get_single_day_prices();
		$created = 0;
		$updated = 0;
		$kept_ids = array();

		foreach ( $schedules as $day => $slots ) {
			foreach ( $slots as $slot ) {
				$mapped = self::map_to_slugs( array(
					'pa_dia-suelto' => $day,
					'pa_horario' => $slot['time'],
				) );

				// Buscar variación existente con estos atributos
				$existing_id = self::find_existing_variation( $product_id, $mapped );

				if ( $existing_id ) {
					$variation = wc_get_product( $existing_id );
				} else {
					if ( $is_subscription ) {
						$variation = new WC_Product_Subscription_Variation();
					} else {
						$variation = new WC_Product_Variation();
					}
					$variation->set_parent_id( $product_id );
					$variation->set_attributes( $mapped );
				}

				$price = $prices[ $slot['turno'] ];
				$variation->set_regular_price( (string) $price );
				$variation->set_status( 'publish' );
				$variation->set_manage_stock( true );
				$variation->set_stock_quantity( 15 );
				$variation->set_stock_status( 'instock' );
				$variation->set_virtual( true );

				// SKU (solo si no tiene uno ya asignado)
				if ( ! $existing_id || empty( $variation->get_sku() ) ) {
					$day_short = strtoupper( substr( $day, 0, 3 ) );
					$time_clean = str_replace( array( ':', '-' ), '', $slot['time'] );
					$sku = "DS-{$day_short}-{$time_clean}";
					$sku_exists = wc_get_product_id_by_sku( $sku );
					if ( $sku_exists && $sku_exists !== $variation->get_id() ) {
						$sku = $sku . '-' . wp_rand( 100, 999 );
					}
					$variation->set_sku( $sku );
				}

				$turno_labels = array( 'morning' => 'Morning', 'afternoon' => 'Afternoon', 'special' => 'Special' );
				$variation->set_description( $day . ' - ' . $slot['time'] . ' (' . ( $turno_labels[ $slot['turno'] ] ?? 'Afternoon' ) . ')' );

				$variation->save();
				$kept_ids[] = $variation->get_id();

				// Meta de suscripción
				if ( $is_subscription ) {
					$vid = $variation->get_id();
					update_post_meta( $vid, '_subscription_price', (string) $price );
					update_post_meta( $vid, '_subscription_period', 'month' );
					update_post_meta( $vid, '_subscription_period_interval', '1' );
					update_post_meta( $vid, '_subscription_length', '0' );
				}

				if ( $existing_id ) {
					$updated++;
				} else {
					$created++;
				}
			}
		}

		// Limpiar variaciones huérfanas (preservando las que tienen suscripciones activas)
		$cleanup = self::cleanup_orphan_variations( $product_id, $kept_ids );

		// Sincronizar
		WC_Product_Variable::sync( $product_id );
		wc_delete_product_transients( $product_id );

		// Crear addon de edad
		self::create_age_addon( $product_id );

		// Actualizar opción con el ID del producto
		update_option( 'rocomadrid_product_dias_sueltos', $product_id );

		return array(
			'product_id' => $product_id,
			'created' => $created,
			'updated' => $updated,
			'orphans_deleted' => $cleanup['deleted'],
			'orphans_preserved' => $cleanup['preserved'],
			'type' => $product_type,
		);
	}

	/**
	 * Crear addon de edad para Días Sueltos
	 */
	private static function create_age_addon( $product_id ) {
		if ( ! class_exists( 'WC_Product_Addons' ) && ! class_exists( 'WC_Product_Addons_Admin' ) ) {
			return;
		}

		$addons = array(
			array(
				'name' => 'Edad del Alumno',
				'title_format' => 'label',
				'description_enable' => 1,
				'description' => 'Selecciona la edad del alumno. El precio se ajustará automáticamente.',
				'type' => 'radiobutton',
				'display' => 'radiobutton',
				'position' => 0,
				'required' => 1,
				'options' => array(
					array( 'label' => 'Adultos', 'price' => '0', 'price_type' => 'flat_fee' ),
					array( 'label' => 'Menores (6-12 años)', 'price' => (string) ( RocoMadrid_SF_Settings::get_price_children_1day() - RocoMadrid_SF_Settings::get_price_adults_1day() ), 'price_type' => 'flat_fee' ),
					array( 'label' => 'Adolescentes (12-18 años)', 'price' => (string) ( RocoMadrid_SF_Settings::get_price_teenagers_1day() - RocoMadrid_SF_Settings::get_price_adults_1day() ), 'price_type' => 'flat_fee' ),
				),
			),
		);

		update_post_meta( $product_id, '_product_addons', $addons );
		update_post_meta( $product_id, '_product_addons_exclude_global', 1 );
	}

	// ============================================
	// GENERADOR: CLASES (2 días/semana)
	// ============================================

	public static function generate_classes() {
		if ( ! class_exists( 'WooCommerce' ) || ! class_exists( 'WC_Subscriptions' ) ) {
			return array( 'error' => 'WooCommerce and WC Subscriptions are required.' );
		}

		$product_title = 'Clases RocoMadrid';
		$product_id = self::find_product_by_title( $product_title );
		$product_type = 'variable-subscription';

		// Crear o actualizar producto padre
		if ( ! $product_id ) {
			$product = new WC_Product_Variable_Subscription();
			$product->set_name( $product_title );
			$product->set_status( 'publish' );
			$product->set_virtual( true );
			$product->set_manage_stock( false );
			$product->set_catalog_visibility( 'visible' );
			$product->set_short_description( 'Monthly subscription for directed training. 2 days per week.' );
			$product_id = $product->save();
			wp_set_object_terms( $product_id, $product_type, 'product_type', false );
		} else {
			$product = new WC_Product_Variable_Subscription( $product_id );
			$product->set_virtual( true );
			$product->set_manage_stock( false );
			$product->set_catalog_visibility( 'visible' );
			$product->save();
			wp_set_object_terms( $product_id, $product_type, 'product_type', false );
		}

		// Atributos: pa_dias + pa_edad + pa_horario
		$tax_dias = self::ensure_global_attribute( 'dias', 'Días' );
		$tax_edad = self::ensure_global_attribute( 'edad', 'Edad' );
		$tax_hora = self::ensure_global_attribute( 'horario', 'Horario' );

		$schedules = self::get_classes_schedules();

		// Recoger términos usados
		$used_days = array();
		$used_ages = array();
		$used_times = array();

		// Adultos y Menores como variaciones, Adolescentes como addon
		$age_map = array( 'Adultos', 'Menores' );

		foreach ( $schedules as $day_block => $age_schedules ) {
			foreach ( $age_map as $age_label ) {
				$age_key = strtolower( $age_label === 'Menores' ? 'menores' : 'adultos' );
				$times = isset( $age_schedules[ $age_key ] ) ? $age_schedules[ $age_key ] : array();

				if ( empty( $times ) ) {
					continue;
				}

				if ( ! in_array( $day_block, $used_days ) ) {
					$used_days[] = $day_block;
				}
				if ( ! in_array( $age_label, $used_ages ) ) {
					$used_ages[] = $age_label;
				}
				foreach ( $times as $time ) {
					if ( ! in_array( $time, $used_times ) ) {
						$used_times[] = $time;
					}
				}
			}
		}
		sort( $used_times );

		// Configurar atributos y guardar con la clase correcta para no perder el tipo
		$attributes = array();
		$attributes[ $tax_dias ] = self::build_attribute( $tax_dias, $used_days, 0 );
		$attributes[ $tax_edad ] = self::build_attribute( $tax_edad, $used_ages, 1 );
		$attributes[ $tax_hora ] = self::build_attribute( $tax_hora, $used_times, 2 );

		wp_set_object_terms( $product_id, $product_type, 'product_type', false );
		clean_post_cache( $product_id );
		wc_delete_product_transients( $product_id );

		$product = new WC_Product_Variable_Subscription( $product_id );
		$product->set_attributes( $attributes );
		$product->save();

		wp_cache_flush();

		// Actualizar o crear variaciones (sin borrar las existentes con suscripciones)
		$created = 0;
		$updated = 0;
		$kept_ids = array();

		foreach ( $schedules as $day_block => $age_schedules ) {
			foreach ( $age_map as $age_label ) {
				$age_key = strtolower( $age_label === 'Menores' ? 'menores' : 'adultos' );
				$times = isset( $age_schedules[ $age_key ] ) ? $age_schedules[ $age_key ] : array();

				if ( empty( $times ) ) {
					continue;
				}

				foreach ( $times as $time ) {
					$mapped = self::map_to_slugs( array(
						'pa_dias' => $day_block,
						'pa_edad' => $age_label,
						'pa_horario' => $time,
					) );

					// Buscar variación existente con estos atributos
					$existing_id = self::find_existing_variation( $product_id, $mapped );

					if ( $existing_id ) {
						$variation = wc_get_product( $existing_id );
					} else {
						$variation = new WC_Product_Subscription_Variation();
						$variation->set_parent_id( $product_id );
						$variation->set_attributes( $mapped );
					}

					$price = self::get_classes_price( $age_label, $time );
					$variation->set_regular_price( (string) $price );
					$variation->set_status( 'publish' );
					$variation->set_manage_stock( true );
					$variation->set_stock_quantity( 15 );
					$variation->set_stock_status( 'instock' );
					$variation->set_virtual( true );

					// SKU (solo si no tiene uno ya asignado)
					if ( ! $existing_id || empty( $variation->get_sku() ) ) {
						$block_short = ( strpos( $day_block, 'Lunes' ) !== false ) ? 'LX' : 'MJ';
						$age_short = strtoupper( substr( $age_key, 0, 3 ) );
						$time_clean = str_replace( array( ':', '-' ), '', $time );
						$sku = "CL-{$block_short}-{$age_short}-{$time_clean}";
						$sku_exists = wc_get_product_id_by_sku( $sku );
						if ( $sku_exists && $sku_exists !== $variation->get_id() ) {
							$sku = $sku . '-' . wp_rand( 100, 999 );
						}
						$variation->set_sku( $sku );
					}

					$variation->save();
					$kept_ids[] = $variation->get_id();

					// Meta de suscripción
					$vid = $variation->get_id();
					update_post_meta( $vid, '_subscription_price', (string) $price );
					update_post_meta( $vid, '_subscription_period', 'month' );
					update_post_meta( $vid, '_subscription_period_interval', '1' );
					update_post_meta( $vid, '_subscription_length', '0' );
					update_post_meta( $vid, '_subscription_sign_up_fee', '0' );

					if ( $existing_id ) {
						$updated++;
					} else {
						$created++;
					}
				}
			}
		}

		// Limpiar variaciones huérfanas (preservando las que tienen suscripciones activas)
		$cleanup = self::cleanup_orphan_variations( $product_id, $kept_ids );

		// Sincronizar
		WC_Product_Variable::sync( $product_id );
		wc_delete_product_transients( $product_id );

		// Crear addon de tipo de estudiante (Adulto/Adolescente)
		self::create_student_type_addon( $product_id );

		// Actualizar opción con el ID del producto
		update_option( 'rocomadrid_product_tarifas', $product_id );

		return array(
			'product_id' => $product_id,
			'created' => $created,
			'updated' => $updated,
			'orphans_deleted' => $cleanup['deleted'],
			'orphans_preserved' => $cleanup['preserved'],
			'type' => $product_type,
		);
	}

	/**
	 * Crear addon de tipo de estudiante para Clases
	 * Adulto = precio base, Adolescente = ajuste según configuración
	 */
	private static function create_student_type_addon( $product_id ) {
		if ( ! class_exists( 'WC_Product_Addons' ) && ! class_exists( 'WC_Product_Addons_Admin' ) ) {
			return;
		}

		$addons = array(
			array(
				'name' => 'Tipo de Estudiante',
				'title_format' => 'label',
				'description_enable' => 0,
				'description' => '',
				'type' => 'radiobutton',
				'display' => 'select',
				'position' => 0,
				'required' => 1,
				'restrictions' => 0,
				'restrictions_type' => 'any_text',
				'adjust_price' => 1,
				'price_type' => 'flat_fee',
				'price' => '',
				'min' => 0,
				'max' => 0,
				'options' => array(
					array( 'label' => 'Adulto', 'price' => '0', 'image' => '', 'price_type' => 'flat_fee' ),
					array( 'label' => 'Adolescente (12-18 años)', 'price' => (string) ( RocoMadrid_SF_Settings::get_price_teenagers_2days() - RocoMadrid_SF_Settings::get_price_adults_2days() ), 'image' => '', 'price_type' => 'flat_fee' ),
				),
			),
		);

		update_post_meta( $product_id, '_product_addons', $addons );
		update_post_meta( $product_id, '_product_addons_exclude_global', 1 );
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
		if ( isset( $_POST['generate_single_days'] ) && check_admin_referer( 'rocomadrid_generate_products' ) ) {
			$result = self::generate_single_days();
			if ( isset( $result['error'] ) ) {
				$messages[] = array( 'type' => 'error', 'text' => $result['error'] );
			} else {
				$messages[] = array(
					'type' => 'success',
					'text' => sprintf(
						__( 'Single Days product synced. Product ID: <strong>#%d</strong> | Created: <strong>%d</strong> | Updated: <strong>%d</strong> | Orphans deleted: %d | Orphans preserved (active subs): %d', 'neve-child' ),
						$result['product_id'], $result['created'], $result['updated'], $result['orphans_deleted'], $result['orphans_preserved']
					),
				);
			}
		}

		if ( isset( $_POST['generate_classes'] ) && check_admin_referer( 'rocomadrid_generate_products' ) ) {
			$result = self::generate_classes();
			if ( isset( $result['error'] ) ) {
				$messages[] = array( 'type' => 'error', 'text' => $result['error'] );
			} else {
				$messages[] = array(
					'type' => 'success',
					'text' => sprintf(
						__( 'Classes product synced. Product ID: <strong>#%d</strong> | Created: <strong>%d</strong> | Updated: <strong>%d</strong> | Orphans deleted: %d | Orphans preserved (active subs): %d', 'neve-child' ),
						$result['product_id'], $result['created'], $result['updated'], $result['orphans_deleted'], $result['orphans_preserved']
					),
				);
			}
		}

		if ( isset( $_POST['generate_both'] ) && check_admin_referer( 'rocomadrid_generate_products' ) ) {
			$r1 = self::generate_single_days();
			$r2 = self::generate_classes();

			if ( isset( $r1['error'] ) ) {
				$messages[] = array( 'type' => 'error', 'text' => __( 'Single Days:', 'neve-child' ) . ' ' . $r1['error'] );
			} else {
				$messages[] = array( 'type' => 'success', 'text' => sprintf( __( 'Single Days: Product <strong>#%d</strong> — Created: %d | Updated: %d | Orphans deleted: %d | Preserved: %d', 'neve-child' ), $r1['product_id'], $r1['created'], $r1['updated'], $r1['orphans_deleted'], $r1['orphans_preserved'] ) );
			}
			if ( isset( $r2['error'] ) ) {
				$messages[] = array( 'type' => 'error', 'text' => __( 'Classes:', 'neve-child' ) . ' ' . $r2['error'] );
			} else {
				$messages[] = array( 'type' => 'success', 'text' => sprintf( __( 'Classes: Product <strong>#%d</strong> — Created: %d | Updated: %d | Orphans deleted: %d | Preserved: %d', 'neve-child' ), $r2['product_id'], $r2['created'], $r2['updated'], $r2['orphans_deleted'], $r2['orphans_preserved'] ) );
			}
		}

		// IDs actuales configurados
		$current_ds_id = RocoMadrid_Step_Form::product_dias_sueltos_id();
		$current_cl_id = RocoMadrid_Step_Form::product_tarifas_id();
		$ds_product = wc_get_product( $current_ds_id );
		$cl_product = wc_get_product( $current_cl_id );
		?>
		<div class="wrap">
			<h1><?php echo esc_html__( 'RocoMadrid Product Generator', 'neve-child' ); ?></h1>
			<p class="rm-page-subtitle">
				<?php echo esc_html__( 'Generate or regenerate the WooCommerce subscription products with all their variations and add-ons.', 'neve-child' ); ?>
			</p>

			<?php foreach ( $messages as $msg ) : ?>
				<div class="notice notice-<?php echo esc_attr( $msg['type'] ); ?> is-dismissible">
					<p><?php echo wp_kses_post( $msg['text'] ); ?></p>
				</div>
			<?php endforeach; ?>

			<!-- Estado actual -->
			<div class="generator-grid">
				<div class="generator-card">
					<h2><?php echo esc_html__( 'Single Days', 'neve-child' ); ?></h2>
					<p class="subtitle">
						<?php echo esc_html__( '1 day/week subscription — Day + Schedule + Age addon', 'neve-child' ); ?>
					</p>

					<div class="info-grid">
						<div class="info-item">
							<div class="label"><?php echo esc_html__( 'Current Product ID', 'neve-child' ); ?></div>
							<div class="value">#<?php echo $current_ds_id; ?>
								<span class="status-badge <?php echo $ds_product ? 'status-ok' : 'status-missing'; ?>">
									<?php echo $ds_product ? esc_html__( 'exists', 'neve-child' ) : esc_html__( 'not found', 'neve-child' ); ?>
								</span>
							</div>
						</div>
						<div class="info-item">
							<div class="label"><?php echo esc_html__( 'Current Variations', 'neve-child' ); ?></div>
							<div class="value">
								<?php echo $ds_product && method_exists( $ds_product, 'get_children' ) ? count( $ds_product->get_children() ) : '0'; ?>
							</div>
						</div>
					</div>

					<details class="rm-details">
						<summary>
							<?php echo esc_html__( 'Price table (Adults · 1 day/week)', 'neve-child' ); ?>
						</summary>
						<div class="rm-details-body">
							<table class="price-table">
								<thead>
									<tr>
										<th><?php echo esc_html__( 'Shift', 'neve-child' ); ?></th>
										<th><?php echo esc_html__( 'Price', 'neve-child' ); ?></th>
										<th><?php echo esc_html__( 'When', 'neve-child' ); ?></th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><?php echo esc_html__( 'Morning', 'neve-child' ); ?></td>
										<td><strong>68€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Mon-Fri before 15:00', 'neve-child' ); ?></td>
									</tr>
									<tr>
										<td><?php echo esc_html__( 'Afternoon', 'neve-child' ); ?></td>
										<td><strong>74€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Mon-Thu from 16:00', 'neve-child' ); ?></td>
									</tr>
									<tr>
										<td><?php echo esc_html__( 'Special', 'neve-child' ); ?></td>
										<td><strong>78€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Fri afternoon + Saturday', 'neve-child' ); ?></td>
									</tr>
								</tbody>
							</table>
							<table class="price-table">
								<thead>
									<tr>
										<th><?php echo esc_html__( 'Age', 'neve-child' ); ?></th>
										<th><?php echo esc_html__( 'Price', 'neve-child' ); ?></th>
										<th><?php echo esc_html__( 'Note', 'neve-child' ); ?></th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><?php echo esc_html__( 'Children (6-12)', 'neve-child' ); ?></td>
										<td><strong>47€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Fixed price', 'neve-child' ); ?></td>
									</tr>
									<tr>
										<td><?php echo esc_html__( 'Teenagers (12-18)', 'neve-child' ); ?></td>
										<td><strong>55€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Fixed price', 'neve-child' ); ?></td>
									</tr>
								</tbody>
							</table>
						</div>
					</details>

					<details class="rm-details">
						<summary>
							<?php echo esc_html__( 'Schedule summary', 'neve-child' ); ?>
						</summary>
						<div class="rm-details-body">
							<?php
							$schedules = self::get_single_day_schedules();
							foreach ( $schedules as $day => $slots ) :
								echo '<p class="rm-day-heading">' . esc_html( $day ) . ' <span class="rm-muted" style="font-weight:400">(' . sprintf( esc_html__( '%d schedules', 'neve-child' ), count( $slots ) ) . ')</span></p>';
								echo '<div class="rm-slot-list">';
								foreach ( $slots as $slot ) {
									$shift_class = $slot['turno'] === 'morning' ? 'rm-shift-morning' : ( $slot['turno'] === 'special' ? 'rm-shift-special' : 'rm-shift-afternoon' );
									echo '<span class="rm-shift-badge ' . $shift_class . '">' . esc_html( $slot['time'] ) . '</span>';
								}
								echo '</div>';
							endforeach;
							$total_var = 0;
							foreach ( $schedules as $slots ) {
								$total_var += count( $slots );
							}
							echo '<p class="rm-day-heading" style="margin-top:12px">' . sprintf( esc_html__( 'Total variations: %d', 'neve-child' ), $total_var ) . '</p>';
							?>
						</div>
					</details>

					<form method="post">
						<?php wp_nonce_field( 'rocomadrid_generate_products' ); ?>
						<p class="rm-callout rm-callout-warning" style="padding:8px 12px">⚠️
							<?php echo esc_html__( 'This will delete all existing variations and create new ones.', 'neve-child' ); ?>
						</p>
						<input type="submit" name="generate_single_days" class="btn-generate btn-primary"
							value="🏗️ <?php echo esc_attr__( 'Generate Single Days Product', 'neve-child' ); ?>" />
					</form>
				</div>

				<div class="generator-card">
					<h2><?php echo esc_html__( 'Classes', 'neve-child' ); ?></h2>
					<p class="subtitle">
						<?php echo esc_html__( '2 days/week subscription — Days + Age + Schedule + Student Type addon', 'neve-child' ); ?>
					</p>

					<div class="info-grid">
						<div class="info-item">
							<div class="label"><?php echo esc_html__( 'Current Product ID', 'neve-child' ); ?></div>
							<div class="value">#<?php echo $current_cl_id; ?>
								<span class="status-badge <?php echo $cl_product ? 'status-ok' : 'status-missing'; ?>">
									<?php echo $cl_product ? esc_html__( 'exists', 'neve-child' ) : esc_html__( 'not found', 'neve-child' ); ?>
								</span>
							</div>
						</div>
						<div class="info-item">
							<div class="label"><?php echo esc_html__( 'Current Variations', 'neve-child' ); ?></div>
							<div class="value">
								<?php echo $cl_product && method_exists( $cl_product, 'get_children' ) ? count( $cl_product->get_children() ) : '0'; ?>
							</div>
						</div>
					</div>

					<details class="rm-details">
						<summary>
							<?php echo esc_html__( 'Price table (2 days/week)', 'neve-child' ); ?>
						</summary>
						<div class="rm-details-body">
							<table class="price-table">
								<thead>
									<tr>
										<th><?php echo esc_html__( 'Group', 'neve-child' ); ?></th>
										<th><?php echo esc_html__( 'Price', 'neve-child' ); ?></th>
										<th><?php echo esc_html__( 'Note', 'neve-child' ); ?></th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><?php echo esc_html__( 'Adults Morning', 'neve-child' ); ?></td>
										<td><strong>77€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Before 16:00', 'neve-child' ); ?></td>
									</tr>
									<tr>
										<td><?php echo esc_html__( 'Adults Afternoon', 'neve-child' ); ?></td>
										<td><strong>86€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'From 16:00', 'neve-child' ); ?></td>
									</tr>
									<tr>
										<td><?php echo esc_html__( 'Children (6-12)', 'neve-child' ); ?></td>
										<td><strong>57€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Fixed price via variation', 'neve-child' ); ?></td>
									</tr>
									<tr>
										<td><?php echo esc_html__( 'Teenagers (12-18)', 'neve-child' ); ?></td>
										<td><strong>65€</strong>/<?php echo esc_html__( 'month', 'neve-child' ); ?></td>
										<td><?php echo esc_html__( 'Via addon: Adults -21€', 'neve-child' ); ?></td>
									</tr>
								</tbody>
							</table>
						</div>
					</details>

					<details class="rm-details">
						<summary>
							<?php echo esc_html__( 'Schedule summary', 'neve-child' ); ?>
						</summary>
						<div class="rm-details-body">
							<?php
							$cls = self::get_classes_schedules();
							$total_cls = 0;
							foreach ( $cls as $block => $age_sch ) :
								echo '<p class="rm-day-heading">' . esc_html( $block ) . '</p>';
								foreach ( $age_sch as $age_key => $times ) :
									if ( empty( $times ) )
										continue;
									echo '<p class="rm-text-xs rm-muted" style="text-transform:capitalize;margin:4px 0 2px">' . esc_html( $age_key ) . ' (' . count( $times ) . ')</p>';
									echo '<div class="rm-slot-list">';
									foreach ( $times as $t ) {
										$hour = intval( substr( $t, 0, 2 ) );
										$shift_class = $hour < 16 ? 'rm-shift-morning' : 'rm-shift-afternoon';
										echo '<span class="rm-shift-badge ' . $shift_class . '">' . esc_html( $t ) . '</span>';
									}
									echo '</div>';
									$total_cls += count( $times );
								endforeach;
							endforeach;
							echo '<p class="rm-day-heading" style="margin-top:12px">' . sprintf( esc_html__( 'Total variations: %d', 'neve-child' ), $total_cls ) . '</p>';
							?>
						</div>
					</details>

					<form method="post">
						<?php wp_nonce_field( 'rocomadrid_generate_products' ); ?>
						<p class="rm-callout rm-callout-warning" style="padding:8px 12px">⚠️
							<?php echo esc_html__( 'This will delete all existing variations and create new ones. Requires WC Subscriptions.', 'neve-child' ); ?>
						</p>
						<input type="submit" name="generate_classes" class="btn-generate btn-primary"
							value="🏗️ <?php echo esc_attr__( 'Generate Classes Product', 'neve-child' ); ?>" />
					</form>
				</div>

				<!-- Generar ambos -->
				<div class="generator-card full-width-card rm-callout rm-callout-warning">
					<h2><?php echo esc_html__( 'Generate Both Products', 'neve-child' ); ?></h2>
					<p class="subtitle">
						<?php echo esc_html__( 'Creates/regenerates both products at once. All existing variations will be replaced.', 'neve-child' ); ?>
					</p>
					<form method="post">
						<?php wp_nonce_field( 'rocomadrid_generate_products' ); ?>
						<input type="submit" name="generate_both" class="btn-generate btn-warning"
							value="<?php echo esc_attr__( 'Generate Both Products', 'neve-child' ); ?>"
							onclick="return confirm('<?php echo esc_js( __( 'This will regenerate ALL variations for both products. Continue?', 'neve-child' ) ); ?>');" />
					</form>
				</div>

				<!-- Info de atributos -->
				<div class="generator-card full-width-card">
					<h2><?php echo esc_html__( 'WooCommerce Attributes Used', 'neve-child' ); ?></h2>
					<p class="subtitle">
						<?php echo esc_html__( 'These attributes are created/used by the generator.', 'neve-child' ); ?>
					</p>
					<table class="price-table">
						<thead>
							<tr>
								<th><?php echo esc_html__( 'Attribute', 'neve-child' ); ?></th>
								<th><?php echo esc_html__( 'Taxonomy', 'neve-child' ); ?></th>
								<th><?php echo esc_html__( 'Used By', 'neve-child' ); ?></th>
								<th><?php echo esc_html__( 'Status', 'neve-child' ); ?></th>
							</tr>
						</thead>
						<tbody>
							<?php
							$attrs = array(
								array( __( 'Day', 'neve-child' ), 'pa_dia-suelto', __( 'Single Days', 'neve-child' ), taxonomy_exists( 'pa_dia-suelto' ) ),
								array( __( 'Schedule', 'neve-child' ), 'pa_horario', __( 'Both products', 'neve-child' ), taxonomy_exists( 'pa_horario' ) ),
								array( __( 'Days', 'neve-child' ), 'pa_dias', __( 'Classes', 'neve-child' ), taxonomy_exists( 'pa_dias' ) ),
								array( __( 'Age', 'neve-child' ), 'pa_edad', __( 'Classes', 'neve-child' ), taxonomy_exists( 'pa_edad' ) ),
							);
							foreach ( $attrs as $attr ) :
								?>
								<tr>
									<td><strong><?php echo esc_html( $attr[0] ); ?></strong></td>
									<td><code><?php echo esc_html( $attr[1] ); ?></code></td>
									<td><?php echo esc_html( $attr[2] ); ?></td>
									<td><span class="status-badge <?php echo $attr[3] ? 'status-ok' : 'status-missing'; ?>">
											<?php echo $attr[3] ? 'registered' : 'not registered'; ?>
										</span></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				</div>
			</div>
		</div>
		<?php
	}
}