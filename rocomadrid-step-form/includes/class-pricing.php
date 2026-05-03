<?php
/**
 * Cálculo de precios y helpers de edad/horario
 *
 * Contiene la lógica de precios según turno, edad y frecuencia,
 * así como filtros de horarios por edad configurados en Settings.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Pricing {

	// ============================================
	// VALORES DE EDAD (ADD-ONS)
	// ============================================


	public static function get_age_addon_values() {
		return array(
			__( 'Adults', 'neve-child' ),
			__( 'Children (6-12 years)', 'neve-child' ),
			__( 'Teenagers (12-18 years)', 'neve-child' )
		);
	}

	public static function get_age_addon_values_2days() {
		return array(
			__( 'Adults', 'neve-child' ),
			__( 'Children (6-12 years)', 'neve-child' ),
			__( 'Teenagers (12-18 years)', 'neve-child' )
		);
	}

	/**
	 * Verificar si es menor de edad
	 */
	public static function is_minor_age( $age ) {
		$minors = array( 'Children', 'Teenagers', '6-12', '12-18' );
		foreach ( $minors as $minor ) {
			if ( stripos( $age, $minor ) !== false ) {
				return true;
			}
		}
		return stripos( $age, 'Adult' ) === false && ! empty( $age );
	}

	/**
	 * Extraer hora de inicio de un string de horario
	 */
	public static function extract_start_hour( $schedule ) {
		if ( preg_match( '/^(\d{1,2}):(\d{2})/', trim( $schedule ), $matches ) ) {
			return intval( $matches[1] ) + ( intval( $matches[2] ) / 60 );
		}
		return false;
	}

	/**
	 * Filtrar horarios por edad según configuración de ajustes
	 * Filtra por día específico
	 */
	public static function filter_schedules_by_age( $schedules, $age = '', $day = '' ) {
		if ( empty( $age ) ) {
			return $schedules;
		}

		$allowed_schedules = array();

		if ( stripos( $age, 'Children' ) !== false || stripos( $age, '6-12' ) !== false ) {
			if ( ! empty( $day ) ) {
				// Si el día no existe en la configuración (ej: M/J no están en Días Sueltos),
				// se asume sin restricción para ese día → devolver todos los horarios
				$all_settings = RocoMadrid_SF_Settings::get_children_schedules();
				if ( ! array_key_exists( $day, $all_settings ) ) {
					return $schedules;
				}
				$allowed_schedules = is_array( $all_settings[ $day ] ) ? $all_settings[ $day ] : array();
			} else {
				$all_schedules = RocoMadrid_SF_Settings::get_children_schedules();
				$allowed_schedules = array();
				foreach ( $all_schedules as $day_schedules ) {
					if ( is_array( $day_schedules ) ) {
						$allowed_schedules = array_merge( $allowed_schedules, $day_schedules );
					}
				}
				$allowed_schedules = array_unique( $allowed_schedules );
			}
		} elseif ( stripos( $age, 'Teenagers' ) !== false || stripos( $age, '12-18' ) !== false ) {
			if ( ! empty( $day ) ) {
				// Si el día no existe en la configuración, se asume sin restricción
				$all_settings = RocoMadrid_SF_Settings::get_teenagers_schedules();
				if ( ! array_key_exists( $day, $all_settings ) ) {
					return $schedules;
				}
				$allowed_schedules = is_array( $all_settings[ $day ] ) ? $all_settings[ $day ] : array();
			} else {
				$all_schedules = RocoMadrid_SF_Settings::get_teenagers_schedules();
				$allowed_schedules = array();
				foreach ( $all_schedules as $day_schedules ) {
					if ( is_array( $day_schedules ) ) {
						$allowed_schedules = array_merge( $allowed_schedules, $day_schedules );
					}
				}
				$allowed_schedules = array_unique( $allowed_schedules );
			}
		} else {
			// Adultos — filtrar según configuración de ajustes
			// Solo aplicar filtro si la opción fue guardada al menos una vez
			$saved_option = get_option( 'rocomadrid_adults_schedules', 'NOT_SET' );
			if ( $saved_option === 'NOT_SET' ) {
				// Nunca se ha configurado — no filtrar (compatibilidad primera instalación)
				return $schedules;
			}

			if ( ! empty( $day ) ) {
				// Si el día no existe en la configuración, se asume sin restricción
				$all_settings = RocoMadrid_SF_Settings::get_adults_schedules();
				if ( ! array_key_exists( $day, $all_settings ) ) {
					return $schedules;
				}
				$allowed_schedules = is_array( $all_settings[ $day ] ) ? $all_settings[ $day ] : array();
			} else {
				$all_schedules = RocoMadrid_SF_Settings::get_adults_schedules();
				$allowed_schedules = array();
				foreach ( $all_schedules as $day_schedules ) {
					if ( is_array( $day_schedules ) ) {
						$allowed_schedules = array_merge( $allowed_schedules, $day_schedules );
					}
				}
				$allowed_schedules = array_unique( $allowed_schedules );
			}
		}

		if ( empty( $allowed_schedules ) ) {
			return array();
		}

		$filtered = array();
		foreach ( $schedules as $schedule ) {
			if ( in_array( $schedule, $allowed_schedules ) ) {
				$filtered[] = $schedule;
			}
		}

		return $filtered;
	}

	/**
	 * Ajuste de precio por edad (relativo al precio adulto de 1 día)
	 */
	public static function get_age_addon_price_adjustment( $age ) {
		$adult_base = RocoMadrid_SF_Settings::get_price_adults_1day();
		$adjustments = array(
			'Adults' => 0.0,
			'Children (6-12 years)' => RocoMadrid_SF_Settings::get_price_children_1day() - $adult_base,
			'Teenagers (12-18 years)' => RocoMadrid_SF_Settings::get_price_teenagers_1day() - $adult_base,
		);
		return isset( $adjustments[ $age ] ) ? $adjustments[ $age ] : 0.0;
	}

	/**
	 * Cálculo de precios según tabla de tarifas
	 *
	 * Si se pasa $variation_price, se usa como precio base mensual
	 * en lugar de los precios hardcoded por turno/edad.
	 *
	 * @param array      $selections      Selecciones del formulario
	 * @param float|null $variation_price  Precio base de la variación (null = usar lógica hardcoded)
	 */
	public static function calculate_plan_prices( $selections, $variation_price = null ) {
		$frequency = isset( $selections['frequency'] ) ? $selections['frequency'] : '1_day';
		$schedule = isset( $selections['pa_horario'] ) ? $selections['pa_horario'] : '';
		$day = isset( $selections['pa_dia-suelto'] ) ? $selections['pa_dia-suelto'] : '';
		$days = isset( $selections['pa_dias'] ) ? $selections['pa_dias'] : '';
		$age = isset( $selections['age_addon'] ) ? $selections['age_addon'] :
			( isset( $selections['age_addon_2days'] ) ? $selections['age_addon_2days'] :
				( isset( $selections['pa_edad'] ) ? $selections['pa_edad'] : 'Adults' ) );

		$quarterly_discount = RocoMadrid_SF_Settings::get_quarterly_discount() / 100;
		$annual_discount = RocoMadrid_SF_Settings::get_annual_discount() / 100;
		$afternoon_hour = RocoMadrid_SF_Settings::get_afternoon_hour();

		// Determinar turno
		$hour = self::extract_start_hour( $schedule );
		$shift = 'afternoon';

		if ( $hour !== false ) {
			$shift = ( $hour < $afternoon_hour ) ? 'morning' : 'afternoon';
		}

		// Viernes y Sábado tienen precios especiales
		if ( stripos( $day, 'Friday' ) !== false || stripos( $day, 'Saturday' ) !== false
			|| stripos( $day, 'Viernes' ) !== false || stripos( $day, 'Sábado' ) !== false ) {
			$shift = 'special';
		}

		// Helper para calcular los 3 planes
		$calculate_plans = function ( $monthly_price ) use ( $quarterly_discount, $annual_discount ) {
			$quarterly_price = round( $monthly_price * 3 * ( 1 - $quarterly_discount ) );
			$annual_price = round( $monthly_price * 12 * ( 1 - $annual_discount ) );

			return array(
				'monthly' => array(
					'price' => $monthly_price,
					'savings' => 0,
				),
				'quarterly' => array(
					'price' => $quarterly_price,
					'price_per_month' => round( $quarterly_price / 3, 2 ),
					'savings' => round( $monthly_price * 3 - $quarterly_price ),
				),
				'annual' => array(
					'price' => $annual_price,
					'price_per_month' => round( $annual_price / 12, 2 ),
					'savings' => round( $monthly_price * 12 - $annual_price ),
				),
			);
		};

		// Si se proporcionó un precio de variación, usarlo directamente como base
		// if ( $variation_price !== null && $variation_price > 0 ) {
		// 	return $calculate_plans( floatval( $variation_price ) );
		// }

		// MENORES (6-12)
		if ( stripos( $age, 'Children' ) !== false || stripos( $age, 'Menores' ) !== false || stripos( $age, '6-12' ) !== false ) {
			$base_price = ( $frequency === '2_days' )
				? RocoMadrid_SF_Settings::get_price_children_2days()
				: RocoMadrid_SF_Settings::get_price_children_1day();
			return $calculate_plans( $base_price );
		}

		// ADOLESCENTES (12-18)
		if ( stripos( $age, 'Teenagers' ) !== false || stripos( $age, 'Adolescentes' ) !== false || stripos( $age, '12-18' ) !== false ) {
			$base_price = ( $frequency === '2_days' )
				? RocoMadrid_SF_Settings::get_price_teenagers_2days()
				: RocoMadrid_SF_Settings::get_price_teenagers_1day();
			return $calculate_plans( $base_price );
		}

		// ADULTOS: precio base + ajuste por turno
		if ( $frequency === '2_days' ) {
			$base_price = RocoMadrid_SF_Settings::get_price_adults_2days();
			$base_price += ( $shift === 'morning' ) ? 0 : RocoMadrid_SF_Settings::get_turno_afternoon_2days();
		} else {
			$base_price = RocoMadrid_SF_Settings::get_price_adults_1day();
			if ( $shift === 'afternoon' ) {
				$base_price += RocoMadrid_SF_Settings::get_turno_afternoon_1day();
			} elseif ( $shift === 'special' ) {
				$base_price += RocoMadrid_SF_Settings::get_turno_special_1day();
			}
		}

		return $calculate_plans( $base_price );
	}
}
