<?php
/**
 * Asignación administrativa de suscripciones
 *
 * Permite a los administradores asignar una suscripción a un cliente directamente
 * desde el formulario de pasos (frontend), creando un pedido con método de pago
 * transferencia bancaria (BACS) y estado pendiente de pago.
 *
 * Flujo:
 *  1. Admin ve los planes en el formulario frontend → botón "Asignar a cliente"
 *  2. Modal con buscador de clientes (AJAX)
 *  3. Al confirmar: crea orden pendiente + suscripción WC Subscriptions
 *  4. Cliente paga por transferencia → admin marca el pedido como pagado → suscripción activa
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class RocoMadrid_SF_Admin_Assign {

	public static function init() {
		add_action( 'wp_ajax_rocomadrid_search_customers', array( __CLASS__, 'ajax_search_customers' ) );
		add_action( 'wp_ajax_rocomadrid_assign_subscription', array( __CLASS__, 'ajax_assign_subscription' ) );
	}

	/**
	 * Encolar CSS y JS del modal de asignación (solo para admins)
	 * Llamado desde class-shortcode.php::render() si el usuario tiene permisos.
	 *
	 * @param string $nonce Nonce ya generado en el shortcode
	 */
	public static function enqueue_assets( $nonce ) {
		// CSS del modal y botón de asignación
		$css = '
			.btn-admin-assign {
				width: 100% !important;
				margin-top: 10px !important;
				padding: 9px 16px !important;
				background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
				color: #64748b !important;
				border: 1px solid #e2e8f0 !important;
				border-radius: 10px !important;
				font-size: 11.5px !important;
				font-weight: 600 !important;
				letter-spacing: 0.02em !important;
				cursor: pointer !important;
				transition: all 0.2s ease !important;
				display: flex;
				align-items: center !important;
				justify-content: center !important;
				gap: 5px !important;
				text-transform: uppercase !important;
				box-shadow: 0 1px 2px rgba(0,0,0,0.04) !important;
			}
			.btn-admin-assign:hover {
				border-color: #fdba74 !important;
				color: #c2410c !important;
				background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%) !important;
				box-shadow: 0 3px 10px rgba(249,115,22,0.15) !important;
				transform: translateY(-1px) !important;
			}
			.btn-admin-assign:active {
				transform: translateY(0) !important;
				box-shadow: none !important;
			}
			.rm-admin-overlay {
				position: fixed !important;
				inset: 0 !important;
				background: rgba(0,0,0,0.55) !important;
				z-index: 99999 !important;
				display: flex;
				align-items: center !important;
				justify-content: center !important;
			}
			.rm-admin-modal {
				background: #fff !important;
				border-radius: 14px !important;
				max-width: 520px !important;
				width: 92% !important;
				box-shadow: 0 20px 60px rgba(0,0,0,0.25) !important;
				overflow: hidden !important;
			}
			.rm-admin-modal-header {
				padding: 18px 24px !important;
				border-bottom: 1px solid #e5e7eb !important;
				display: flex;
				align-items: center !important;
				justify-content: space-between !important;
			}
			.rm-admin-modal-header h3 {
				margin: 0 !important;
				font-size: 16px !important;
				font-weight: 600 !important;
				color: #111827 !important;
			}
			.rm-admin-modal-close {
				background: none !important;
				border: none !important;
				font-size: 22px !important;
				line-height: 1 !important;
				color: #9ca3af !important;
				cursor: pointer !important;
				padding: 0 4px !important;
			}
			.rm-admin-modal-close:hover { color: #374151 !important; }
			.rm-admin-modal-body { padding: 22px 24px !important; }
			.rm-admin-plan-info {
				background: #f9fafb !important;
				border: 1px solid #e5e7eb !important;
				border-radius: 8px !important;
				padding: 12px 16px !important;
				margin-bottom: 20px !important;
				font-size: 13px !important;
				color: #374151 !important;
			}
			.rm-admin-plan-info strong { color: #111827 !important; }
			.rm-admin-search-wrap { position: relative !important; }
			.rm-admin-search-wrap label {
				display: block !important;
				font-size: 13px !important;
				font-weight: 500 !important;
				margin-bottom: 6px !important;
				color: #374151 !important;
			}
			#rm-admin-search {
				width: 100% !important;
				padding: 10px 14px !important;
				border: 1px solid #d1d5db !important;
				border-radius: 8px !important;
				font-size: 14px !important;
				outline: none !important;
				box-sizing: border-box !important;
				color: #111827 !important;
			}
			#rm-admin-search:focus {
				border-color: #f97316 !important;
				box-shadow: 0 0 0 3px rgba(249,115,22,0.12) !important;
			}
			.rm-admin-results {
				position: absolute !important;
				top: 100% !important;
				left: 0 !important;
				right: 0 !important;
				background: #fff !important;
				border: 1px solid #d1d5db !important;
				border-top: none !important;
				border-radius: 0 0 8px 8px !important;
				max-height: 200px !important;
				overflow-y: auto !important;
				z-index: 10 !important;
				list-style: none !important;
				margin: 0 !important;
				padding: 0 !important;
				box-shadow: 0 8px 20px rgba(0,0,0,0.08) !important;
			}
			.rm-admin-results li {
				padding: 10px 14px !important;
				cursor: pointer !important;
				font-size: 13px !important;
				border-bottom: 1px solid #f3f4f6 !important;
				color: #374151 !important;
			}
			.rm-admin-results li:last-child { border-bottom: none !important; }
			.rm-admin-results li:hover { background: #fff7ed !important; color: #ea580c !important; }
			.rm-admin-results li.no-results { color: #9ca3af !important; cursor: default !important; }
			.rm-admin-selected {
				margin-top: 12px !important;
				padding: 10px 14px !important;
				background: #f0fdf4 !important;
				border: 1px solid #86efac !important;
				border-radius: 8px !important;
				display: flex;
				align-items: center !important;
				justify-content: space-between !important;
				font-size: 13px !important;
				color: #166534 !important;
			}
			.rm-admin-clear-btn {
				background: none !important;
				border: none !important;
				color: #4ade80 !important;
				cursor: pointer !important;
				font-size: 18px !important;
				line-height: 1 !important;
				padding: 0 2px !important;
			}
			.rm-admin-clear-btn:hover { color: #166534 !important; }
			.rm-admin-msg {
				margin-top: 16px !important;
				padding: 12px 16px !important;
				border-radius: 8px !important;
				font-size: 13px !important;
				line-height: 1.5 !important;
			}
			.rm-admin-msg.success { background: #f0fdf4 !important; border: 1px solid #86efac !important; color: #166534 !important; }
			.rm-admin-msg.error   { background: #fef2f2 !important; border: 1px solid #fca5a5 !important; color: #991b1b !important; }
			.rm-admin-msg a { color: inherit !important; font-weight: 600 !important; }
			.rm-admin-modal-footer {
				padding: 14px 24px !important;
				border-top: 1px solid #e5e7eb !important;
				display: flex;
				gap: 10px !important;
				justify-content: flex-end !important;
				background: #f9fafb !important;
			}
			.rm-admin-modal-footer .btn-cancel {
				padding: 9px 18px !important;
				background: #fff !important;
				border: 1px solid #d1d5db !important;
				border-radius: 8px !important;
				font-size: 13px !important;
				cursor: pointer !important;
				color: #374151 !important;
			}
			.rm-admin-modal-footer .btn-cancel:hover { background: #f3f4f6 !important; }
			.rm-admin-modal-footer .btn-confirm {
				padding: 9px 18px !important;
				background: #f97316 !important;
				border: none !important;
				border-radius: 8px !important;
				font-size: 13px !important;
				font-weight: 600 !important;
				color: #fff !important;
				cursor: pointer !important;
				transition: background 0.2s !important;
			}
			.rm-admin-modal-footer .btn-confirm:hover:not(:disabled) { background: #ea580c !important; }
			.rm-admin-modal-footer .btn-confirm:disabled { background: #fdba74 !important; cursor: not-allowed !important; }
		';

		// Registrar handle propio (URL false) para que el inline CSS se imprima en wp_footer
		// y no dependa del ciclo de wp_head (el shortcode corre después de wp_head)
		wp_register_style( 'rm-admin-assign-css', false, array(), ROCOMADRID_SF_VERSION );
		wp_enqueue_style( 'rm-admin-assign-css' );
		wp_add_inline_style( 'rm-admin-assign-css', $css );

		// JavaScript del modal de asignación
		$js = '
(function($) {
	"use strict";

	var adminAssign = {
		nonce:            "' . esc_js( $nonce ) . '",
		ajaxUrl:          "' . esc_js( admin_url( 'admin-ajax.php' ) ) . '",
		selectedPlan:     null,
		selectedCustomer: null,
		searchTimeout:    null,

		init: function() {
			$("body").append(this.getModalHtml());

			$(document).on("click", ".btn-admin-assign",              this.onAssignClick.bind(this));
			$(document).on("input", "#rm-admin-search",               this.onSearch.bind(this));
			$(document).on("click", ".rm-admin-result-item",          this.onSelectCustomer.bind(this));
			$(document).on("click", "#rm-admin-confirm",              this.onConfirm.bind(this));
			$(document).on("click", "#rm-admin-cancel, .rm-admin-overlay", function(e) {
				if ($(e.target).hasClass("rm-admin-overlay") || $(e.target).closest("#rm-admin-cancel").length) {
					adminAssign.hideModal();
				}
			});
			$(document).on("click", "#rm-admin-clear-customer", function() {
				adminAssign.selectedCustomer = null;
				$("#rm-admin-selected").hide();
				$("#rm-admin-confirm").prop("disabled", true);
				$("#rm-admin-search").val("").focus();
			});
		},

		getModalHtml: function() {
			return \'<div id="rm-admin-overlay" class="rm-admin-overlay" style="display:none;">\' +
				\'<div class="rm-admin-modal">\' +
					\'<div class="rm-admin-modal-header">\' +
						\'<h3>&#128100; Asignar suscripción a cliente</h3>\' +
						\'<button type="button" class="rm-admin-modal-close" id="rm-admin-cancel">&times;</button>\' +
					\'</div>\' +
					\'<div class="rm-admin-modal-body">\' +
						\'<div class="rm-admin-plan-info" id="rm-admin-plan-info"></div>\' +
						\'<div class="rm-admin-search-wrap">\' +
							\'<label for="rm-admin-search">Buscar cliente por nombre o email</label>\' +
							\'<input type="text" id="rm-admin-search" placeholder="Escribe al menos 2 caracteres..." autocomplete="off">\' +
							\'<ul id="rm-admin-results" class="rm-admin-results" style="display:none;"></ul>\' +
						\'</div>\' +
						\'<div id="rm-admin-selected" class="rm-admin-selected" style="display:none;">\' +
							\'<span id="rm-admin-customer-label"></span>\' +
							\'<button type="button" class="rm-admin-clear-btn" id="rm-admin-clear-customer">&times;</button>\' +
						\'</div>\' +
						\'<div id="rm-admin-msg" class="rm-admin-msg" style="display:none;"></div>\' +
					\'</div>\' +
					\'<div class="rm-admin-modal-footer">\' +
						\'<button type="button" class="btn-cancel" id="rm-admin-cancel">Cancelar</button>\' +
						\'<button type="button" class="btn-confirm" id="rm-admin-confirm" disabled>Crear suscripción</button>\' +
					\'</div>\' +
				\'</div>\' +
			\'</div>\';
		},

		onAssignClick: function(e) {
			var $btn = $(e.currentTarget);
			this.selectedPlan = {
				product_id:   $btn.data("product-id"),
				variation_id: $btn.data("variation-id"),
				plan:         $btn.data("plan"),
				price:        $btn.data("price"),
				label:        $btn.data("plan-label"),
				selections:   $btn.data("selections") || {}
			};
			this.selectedCustomer = null;
			this.showModal();
		},

		showModal: function() {
			// Resetear estado
			$("#rm-admin-search").val("");
			$("#rm-admin-results").hide().empty();
			$("#rm-admin-selected").hide();
			$("#rm-admin-confirm").prop("disabled", true).text("Crear suscripción");
			$("#rm-admin-msg").hide().removeClass("success error").html("");
			$("#rm-admin-plan-info").html(
				"<strong>Plan:</strong> " + this.esc(this.selectedPlan.label) +
				" &nbsp;·&nbsp; <strong>Precio:</strong> " + this.esc(String(this.selectedPlan.price)) + " €"
			);
			$("#rm-admin-overlay").fadeIn(180);
			setTimeout(function() { $("#rm-admin-search").focus(); }, 200);
		},

		hideModal: function() {
			$("#rm-admin-overlay").fadeOut(180);
		},

		onSearch: function() {
			var self = this;
			clearTimeout(this.searchTimeout);
			this.searchTimeout = setTimeout(function() {
				var term = $("#rm-admin-search").val().trim();
				if (term.length < 2) {
					$("#rm-admin-results").hide().empty();
					return;
				}
				$.post(self.ajaxUrl, {
					action: "rocomadrid_search_customers",
					nonce:  self.nonce,
					search: term
				}, function(response) {
					var $list = $("#rm-admin-results").empty();
					if (response.success && response.data.length) {
						$.each(response.data, function(i, user) {
							$list.append(
								$("<li>").addClass("rm-admin-result-item")
									.attr("data-id", user.id)
									.attr("data-name", user.name)
									.attr("data-email", user.email)
									.text(user.label)
							);
						});
					} else {
						$list.append($("<li>").addClass("no-results").text("No se encontraron clientes"));
					}
					$list.show();
				});
			}, 280);
		},

		onSelectCustomer: function(e) {
			var $item = $(e.currentTarget);
			if ($item.hasClass("no-results")) return;
			this.selectedCustomer = {
				id:    $item.data("id"),
				name:  $item.data("name"),
				email: $item.data("email")
			};
			$("#rm-admin-search").val("");
			$("#rm-admin-results").hide().empty();
			$("#rm-admin-customer-label").text(this.selectedCustomer.name + " (" + this.selectedCustomer.email + ")");
			$("#rm-admin-selected").show();
			$("#rm-admin-confirm").prop("disabled", false);
		},

		onConfirm: function() {
			var self = this;
			if (!this.selectedCustomer || !this.selectedPlan) return;

			var $btn = $("#rm-admin-confirm");
			$btn.prop("disabled", true).text("Creando...");
			$("#rm-admin-msg").hide().removeClass("success error");

			$.post(this.ajaxUrl, {
				action:       "rocomadrid_assign_subscription",
				nonce:        this.nonce,
				product_id:   this.selectedPlan.product_id,
				variation_id: this.selectedPlan.variation_id,
				customer_id:  this.selectedCustomer.id,
				plan:         this.selectedPlan.plan,
				price:        this.selectedPlan.price,
				selections:   this.selectedPlan.selections
			}, function(response) {
				var $msg = $("#rm-admin-msg");
				if (response.success) {
					var d = response.data;
					$msg.addClass("success").html(
						d.message + "<br>" +
						"<a href=\'" + d.order_url + "\' target=\'_blank\'>📋 Ver pedido #" + d.order_id + "</a>" +
						" &nbsp;·&nbsp; " +
						"<a href=\'" + d.subscription_url + "\' target=\'_blank\'>🔄 Ver suscripción #" + d.subscription_id + "</a>"
					).show();
					$btn.text("✓ Creado");
				} else {
					$msg.addClass("error").text(response.data || "Error al crear la suscripción.").show();
					$btn.prop("disabled", false).text("Crear suscripción");
				}
			}).fail(function() {
				$("#rm-admin-msg").addClass("error").text("Error de conexión. Inténtalo de nuevo.").show();
				$btn.prop("disabled", false).text("Crear suscripción");
			});
		},

		esc: function(str) {
			var d = document.createElement("div");
			d.textContent = str || "";
			return d.innerHTML;
		}
	};

	$(document).ready(function() {
		adminAssign.init();
	});

})(jQuery);
		';

		// Handle propio en footer para asegurar que el JS inline se inyecta
		wp_register_script( 'rm-admin-assign-js', false, array( 'wc-step-form-js', 'jquery' ), ROCOMADRID_SF_VERSION, true );
		wp_enqueue_script( 'rm-admin-assign-js' );
		wp_add_inline_script( 'rm-admin-assign-js', $js );
	}

	// ============================================
	// AJAX: BUSCAR CLIENTES
	// ============================================

	/**
	 * Buscar usuarios de WordPress por nombre, email o login
	 */
	public static function ajax_search_customers() {
		check_ajax_referer( 'rocomadrid_admin_assign_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( __( 'Permisos insuficientes.', 'neve-child' ) );
		}

		$search = isset( $_POST['search'] ) ? sanitize_text_field( $_POST['search'] ) : '';

		if ( mb_strlen( $search ) < 2 ) {
			wp_send_json_success( array() );
			return;
		}

		$users = get_users( array(
			'search' => '*' . esc_attr( $search ) . '*',
			'search_columns' => array( 'user_login', 'user_email', 'display_name' ),
			'number' => 20,
			'fields' => array( 'ID', 'display_name', 'user_email' ),
		) );

		$results = array_map( function ( $user ) {
			return array(
				'id' => (int) $user->ID,
				'name' => $user->display_name,
				'email' => $user->user_email,
				'label' => $user->display_name . ' (' . $user->user_email . ')',
			);
		}, $users );

		wp_send_json_success( array_values( $results ) );
	}

	// ============================================
	// AJAX: CREAR SUSCRIPCIÓN Y PEDIDO
	// ============================================

	/**
	 * Crear pedido pendiente + suscripción WC para un cliente específico con BACS
	 */
	public static function ajax_assign_subscription() {
		check_ajax_referer( 'rocomadrid_admin_assign_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( __( 'Permisos insuficientes.', 'neve-child' ) );
		}

		if ( ! function_exists( 'wcs_create_subscription' ) ) {
			wp_send_json_error( __( 'WooCommerce Subscriptions no está activo.', 'neve-child' ) );
		}

		// Validar y sanitizar parámetros
		$product_id = intval( $_POST['product_id'] ?? 0 );
		$variation_id = intval( $_POST['variation_id'] ?? 0 );
		$customer_id = intval( $_POST['customer_id'] ?? 0 );
		$plan = sanitize_text_field( $_POST['plan'] ?? '' );
		$price = floatval( $_POST['price'] ?? 0 );
		$selections = isset( $_POST['selections'] ) ? array_map( 'sanitize_text_field', (array) $_POST['selections'] ) : array();

		if ( ! $product_id || ! $customer_id || ! in_array( $plan, array( 'monthly', 'quarterly', 'annual' ), true ) || $price <= 0 ) {
			wp_send_json_error( __( 'Datos inválidos. Verifica todos los campos.', 'neve-child' ) );
		}

		$customer = get_user_by( 'id', $customer_id );
		if ( ! $customer ) {
			wp_send_json_error( __( 'Cliente no encontrado.', 'neve-child' ) );
		}

		$product = wc_get_product( $product_id );
		$variation = $variation_id ? wc_get_product( $variation_id ) : null;

		if ( ! $product ) {
			wp_send_json_error( __( 'Producto no encontrado.', 'neve-child' ) );
		}

		// Período de suscripción según el plan seleccionado
		$billing_period = ( 'annual' === $plan ) ? 'year' : 'month';
		$billing_interval = ( 'quarterly' === $plan ) ? 3 : 1;

		// Dirección de facturación del cliente (usa sus datos guardados si existen)
		$billing = array(
			'first_name' => get_user_meta( $customer_id, 'billing_first_name', true ) ?: $customer->first_name,
			'last_name' => get_user_meta( $customer_id, 'billing_last_name', true ) ?: $customer->last_name,
			'email' => $customer->user_email,
			'phone' => get_user_meta( $customer_id, 'billing_phone', true ) ?: '',
			'address_1' => get_user_meta( $customer_id, 'billing_address_1', true ) ?: '',
			'city' => get_user_meta( $customer_id, 'billing_city', true ) ?: '',
			'postcode' => get_user_meta( $customer_id, 'billing_postcode', true ) ?: '',
			'country' => get_user_meta( $customer_id, 'billing_country', true ) ?: 'ES',
		);

		// Obtener el título del gateway BACS tal como está configurado en WooCommerce
		$gateways = WC()->payment_gateways()->payment_gateways();
		$bacs_title = isset( $gateways['bacs'] ) ? $gateways['bacs']->get_title() : __( 'Direct bank transfer', 'neve-child' );

		// --- 1. Crear pedido padre (pago inicial pendiente de transferencia) ---
		$order = wc_create_order( array(
			'customer_id' => $customer_id,
			'created_via' => 'admin_assign',
		) );

		if ( is_wp_error( $order ) ) {
			wp_send_json_error( $order->get_error_message() );
		}

		// wc_create_order() no acepta payment_method en el array, hay que setearlo después
		$order->set_payment_method( 'bacs' );
		$order->set_payment_method_title( $bacs_title );

		// Añadir producto al pedido con precio personalizado
		$sub_product = $variation ?: $product;
		$order_item_id = $order->add_product(
			$sub_product,
			1,
			array(
				'subtotal' => $price,
				'total' => $price,
			)
		);

		wc_add_order_item_meta( $order_item_id, '_step_form_selections', wp_json_encode( $selections ) );
		wc_add_order_item_meta( $order_item_id, '_payment_plan', $plan );

		$order->set_address( $billing, 'billing' );
		$order->calculate_totals();

		// Nota interna con el contexto de la asignación
		$admin_name = wp_get_current_user()->display_name;
		$order_note = sprintf(
			/* translators: 1: admin display name, 2: customer display name, 3: customer email, 4: plan */
			__( 'Pedido creado por el administrador %1$s y asignado a %2$s (%3$s). Plan: %4$s. Método de pago: transferencia bancaria.', 'neve-child' ),
			$admin_name,
			$customer->display_name,
			$customer->user_email,
			$plan
		);
		$order->add_order_note( $order_note );
		$order->set_status( 'pending' );
		$order->save();

		// --- 2. Crear suscripción vinculada al pedido ---
		$subscription = wcs_create_subscription( array(
			'order_id' => $order->get_id(),
			'status' => 'pending',
			'billing_period' => $billing_period,
			'billing_interval' => $billing_interval,
			'customer_id' => $customer_id,
			'created_via' => 'admin_assign',
		) );

		if ( is_wp_error( $subscription ) ) {
			// Limpiar el pedido si la suscripción falla
			$order->delete( true );
			wp_send_json_error( $subscription->get_error_message() );
		}

		// Setear el método de pago en la suscripción después de crearla
		$subscription->set_payment_method( 'bacs' );
		$subscription->set_payment_method_title( $bacs_title );

		// Añadir el mismo producto a la suscripción
		$sub_item_id = $subscription->add_product(
			$sub_product,
			1,
			array(
				'subtotal' => $price,
				'total' => $price,
			)
		);

		wc_add_order_item_meta( $sub_item_id, '_step_form_selections', wp_json_encode( $selections ) );
		wc_add_order_item_meta( $sub_item_id, '_payment_plan', $plan );

		$subscription->set_address( $billing, 'billing' );

		// Calcular fechas: inicio ahora, próximo pago según el período
		$start_date = gmdate( 'Y-m-d H:i:s' );
		$next_payment = ( 'year' === $billing_period )
			? gmdate( 'Y-m-d H:i:s', strtotime( '+1 year' ) )
			: gmdate( 'Y-m-d H:i:s', strtotime( '+' . $billing_interval . ' month' ) );

		try {
			$subscription->update_dates( array(
				'start' => $start_date,
				'next_payment' => $next_payment,
			) );
		} catch (Exception $e) {
		}

		$subscription->calculate_totals();
		$subscription->save();

		wp_send_json_success( array(
			'order_id' => $order->get_id(),
			'subscription_id' => $subscription->get_id(),
			'order_url' => esc_url( get_edit_post_link( $order->get_id(), 'raw' ) ),
			'subscription_url' => esc_url( get_edit_post_link( $subscription->get_id(), 'raw' ) ),
			'message' => sprintf(
				/* translators: 1: subscription ID, 2: customer display name, 3: order ID */
				__( 'Suscripción #%1$d creada para %2$s. Pedido #%3$d pendiente de pago por transferencia.', 'neve-child' ),
				$subscription->get_id(),
				esc_html( $customer->display_name ),
				$order->get_id()
			),
		) );
	}
}
