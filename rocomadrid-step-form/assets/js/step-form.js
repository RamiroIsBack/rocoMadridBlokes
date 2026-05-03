/**
 * FORMULARIO POR PASOS ROCOMADRID - VERSIÓN 2.0
 * 
 * FLUJO:
 * Paso 1: Frecuencia (1 día / 2 días) → Determina el producto
 * 
 * Si 1 día (Días Sueltos):
 *   Paso 2: Edad
 *   Paso 3: Día
 *   Paso 4: Horario (filtrado por edad)
 * 
 * Si 2 días (Tarifas):
 *   Paso 2: Edad
 *   Paso 3: Días (L-X / M-J)
 *   Paso 4: Horario
 */

jQuery(document).ready(function ($) {
    // console.log('========== STEP FORM v2.0 STARTED ==========');
    // console.log('Config:', wcStepForm);

    // Estado del formulario
    let state = {
        currentStep: 0,
        selections: {},
        productId: null,
        variationId: null
    };

    function replaceFeatherIcons() {
        if (typeof feather !== 'undefined') {
            setTimeout(function () {
                feather.replace();
            }, 10);
        }
    }

    // Inicializar
    init();

    function init() {
        showFrequencyStep();
        replaceFeatherIcons();
    }

    // ============================================
    // PASO 1: FRECUENCIA
    // ============================================
    function showFrequencyStep() {
        state.currentStep = 0;
        state.selections = {};
        state.productId = null;

        const flow = wcStepForm.flow.frequency;

        let html = `
            <div class="step-content active" id="step-frequency">
                <div class="step-header">
                    <h3>${flow.label}</h3>
                    <p class="step-subtitle">${wcStepForm.i18n.select_plan_subtitle}</p>
                </div>
                <div class="options-grid frequency-grid">
        `;

        flow.options.forEach(opt => {
            html += `
                <button type="button" class="option-btn frequency-btn" data-value="${opt.value}">
                    <div class="icon">${opt.icon}</div>
                    <div class="text">
                        <strong>${opt.label}</strong>
                        <small>${opt.description}</small>
                    </div>
                </button>
            `;
        });

        html += `</div></div>`;

        $('#dynamic-steps').html(html);
        replaceFeatherIcons();
        updateProgress(1, 5, wcStepForm.i18n.step_frequency);

        // Event listeners
        $('.frequency-btn').on('click', function () {
            const value = $(this).data('value');
            $('.frequency-btn').removeClass('selected');
            $(this).addClass('selected');

            state.selections.frequency = value;
            state.productId = (value === '1_day') ? wcStepForm.product_dias_sueltos : wcStepForm.product_tarifas;

            setTimeout(() => loadNextStep(), 300);
        });
    }

    // ============================================
    // CARGAR SIGUIENTE PASO
    // ============================================
    function loadNextStep() {
        state.currentStep++;

        $('#loading-spinner').show();

        $.ajax({
            url: wcStepForm.ajax_url,
            type: 'POST',
            data: {
                action: 'wc_step_form_get_next_step',
                nonce: wcStepForm.nonce,
                current_step: state.currentStep,
                selections: state.selections
            },
            success: function (response) {
                $('#loading-spinner').hide();

                if (response.success) {
                    handleResponse(response.data);
                } else {
                    showError(response.data || wcStepForm.i18n.error_occurred);
                }
            },
            error: function () {
                $('#loading-spinner').hide();
                showError(wcStepForm.i18n.error_occurred);
            }
        });
    }

    // ============================================
    // MANEJAR RESPUESTA
    // ============================================
    function handleResponse(data) {
        console.log('Handling response:', data.type);

        switch (data.type) {
            case 'frequency_selection':
                showFrequencyStep();
                break;

            case 'next_step':
                if (data.auto_select && data.values && data.values.length === 1) {
                    state.selections[data.attribute.name] = data.values[0];
                    if (data.product_id) state.productId = data.product_id;
                    loadNextStep();
                } else {
                    showAttributeStep(data);
                }
                break;

            case 'final_product':
                if (data.product_id) state.productId = data.product_id;
                loadFinalProduct();
                break;

            case 'no_schedules_for_age':
                showNoHorariosError(data);
                break;

            default:
                console.error('Unknown type:', data.type);
        }
    }

    // ============================================
    // MOSTRAR ERROR DE SIN HORARIOS PARA EDAD
    // ============================================
    function showNoHorariosError(data) {
        const html = `
            <div class="step-content active" id="step-no-schedules">
                <div class="step-header">
                    <h3>${wcStepForm.i18n.no_schedules_available}</h3>
                </div>
                <div class="no-schedules-message" style="padding: 30px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; text-align: center; margin: 20px 0;">
                    <i data-feather="alert-circle" style="width: 48px; height: 48px; stroke-width: 2;"></i>
                    <p style="font-size: 16px; color: #856404; margin-bottom: 20px;">
                        ${data.message}
                    </p>
                    ${data.submessage ? `<p style="font-size: 14px; color: #666;">${data.submessage}</p>` : `<p style="font-size: 14px; color: #666;">${wcStepForm.i18n.select_another_age}</p>`}
                </div>
                <div class="step-navigation">
                    <button type="button" class="btn-back">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        ${wcStepForm.i18n.change_age}
                    </button>
                    <button type="button" class="btn-restart"><i data-feather="rotate-ccw"></i> ${wcStepForm.i18n.start_over}</button>
                </div>
            </div>
        `;

        $('#dynamic-steps').html(html);
        replaceFeatherIcons();
        updateProgress(4, 5, wcStepForm.i18n.step_schedule);

        $('.btn-back').on('click', function () { goBack(); });
        $('.btn-restart').on('click', function () { showFrequencyStep(); });
    }

    // ============================================
    // MOSTRAR PASO DE ATRIBUTO
    // ============================================
    function showAttributeStep(data) {
        const attr = data.attribute;
        const values = data.values;
        const stepNum = data.step_number || (state.currentStep + 1);
        const totalSteps = data.total_steps || 4;

        if (data.product_id) state.productId = data.product_id;

        // Mapa de stock por valor de horario (solo para el paso pa_horario)
        const isScheduleStep = (attr.name === 'pa_horario');
        const stockMap = {};
        if (isScheduleStep && data.values_stock && data.values_stock.length) {
            data.values_stock.forEach(s => { stockMap[s.value] = s; });
        }

        let html = `
            <div class="step-content active" id="step-${state.currentStep}">
                <div class="step-header">
                    <h3>${attr.label}</h3>
                    <p class="step-subtitle">${wcStepForm.i18n.choose_option_subtitle}</p>
                </div>
                <div class="options-grid">
        `;

        values.forEach(value => {
            const icon = getIcon(attr.name, value);
            const description = getDescription(attr.name, value);
            const stockInfo = stockMap[value];
            const isFull = isScheduleStep && stockInfo && !stockInfo.in_stock;

            if (isFull) {
                const formUrl = (stockInfo.form_url && stockInfo.form_url !== '#') ? stockInfo.form_url : '';
                html += `
                    <div class="option-btn schedule-full-card">
                        <div class="icon">${icon}</div>
                        <div class="text">
                            <strong>${value}</strong>
                            <small>${description}</small>
                            <div class="schedule-full-info">
                                <span class="schedule-full-label">${wcStepForm.i18n.classes_full}</span>
                                <p class="schedule-full-waiting">${wcStepForm.i18n.join_waiting_list}</p>
                                <div class="schedule-full-links">
                                    <a href="${stockInfo.wa_url}" class="schedule-full-wa" target="_blank" rel="noopener">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="#25d366" style="vertical-align:middle;margin-right:5px;flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.115.549 4.099 1.508 5.825L0 24l6.336-1.49A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 01-4.987-1.365l-.358-.212-3.761.885.938-3.658-.233-.374A9.786 9.786 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
                            ${wcStepForm.i18n.contact_via_whatsapp}
                        </a>
                        ${formUrl ? `
                        <a href="${formUrl}" class="schedule-full-form" target="_blank" rel="noopener">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;flex-shrink:0"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                            ${wcStepForm.i18n.contact_form}
                        </a>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
            } else {
                html += `
                    <button type="button" class="option-btn" data-value="${value}" data-attr="${attr.name}">
                        <div class="icon">${icon}</div>
                        <div class="text">
                            <strong>${value}</strong>
                            <small>${description}</small>
                        </div>
                    </button>
                `;
            }
        });

        html += `
                </div>
                <div class="step-navigation">
                    <button type="button" class="btn-back">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m15 18-6-6 6-6"/>
                        </svg>
                        ${wcStepForm.i18n.back}
                    </button>
                </div>
            </div>
        `;

        $('#dynamic-steps').html(html);
        replaceFeatherIcons();
        updateProgress(stepNum, totalSteps, getStepName(attr.name));

        // Event: Select option (solo botones seleccionables)
        $('.option-btn:not(.schedule-full-card)').on('click', function () {
            const value = $(this).data('value');
            const attrName = $(this).data('attr');

            $('.option-btn').removeClass('selected');
            $(this).addClass('selected');

            state.selections[attrName] = value;

            setTimeout(() => loadNextStep(), 300);
        });

        // Event: Back
        $('.btn-back').on('click', function () { goBack(); });
    }

    // ============================================
    // VOLVER ATRÁS
    // ============================================
    function goBack() {
        if (state.currentStep <= 1) {
            showFrequencyStep();
        } else {
            const visualStep = state.currentStep + 1;
            goToStep(visualStep - 1);
        }
    }

    // ============================================
    // CARGAR PRODUCTO FINAL
    // ============================================
    function loadFinalProduct() {
        $('#loading-spinner').show();
        $('#dynamic-steps').html('');

        $.ajax({
            url: wcStepForm.ajax_url,
            type: 'POST',
            data: {
                action: 'wc_step_form_get_product',
                nonce: wcStepForm.nonce,
                product_id: state.productId,
                selections: state.selections
            },
            success: function (response) {
                $('#loading-spinner').hide();

                if (response.success) {
                    if (response.data.type === 'no_schedules_for_age') {
                        showNoHorariosError(response.data);
                    } else {
                        showFinalProduct(response.data);
                    }
                } else {
                    showError(wcStepForm.i18n.error_occurred);
                }
            },
            error: function () {
                $('#loading-spinner').hide();
            }
        });
    }

    // ============================================
    // MOSTRAR PRODUCTO FINAL
    // ============================================
    function showFinalProduct(data) {
        state.variationId = data.variation_id || 0;

        $('#dynamic-steps').html(data.html);
        replaceFeatherIcons();
        $('#step-result').hide();

        updateProgress(5, 5, 'Payment plan');

        $('.btn-add-to-cart').on('click', function () { addToCart($(this)); });
        $('.btn-back, #result-back').on('click', function () { goBack(); });
        $('.btn-restart').on('click', function () { showFrequencyStep(); });
    }

    // ============================================
    // AÑADIR AL CARRITO
    // ============================================
    function addToCart($button) {
        const productId = $button.data('product-id') || state.productId;
        const variationId = $button.data('variation-id') || state.variationId || 0;
        const plan = $button.data('plan') || 'monthly';
        const price = $button.data('price') || 0;

        state.selections['payment_plan'] = plan;

        $button.prop('disabled', true).text(wcStepForm.i18n.processing);

        $.ajax({
            url: wcStepForm.ajax_url,
            type: 'POST',
            data: {
                action: 'wc_step_form_add_to_cart',
                nonce: wcStepForm.nonce,
                product_id: productId,
                variation_id: variationId,
                selections: state.selections,
                payment_plan: plan,
                price: price
            },
            success: function (response) {
                if (response.success) {
                    $button.removeClass('btn-add-to-cart')
                        .addClass('btn-success')
                        .html('✓ ' + wcStepForm.i18n.redirecting);
                    window.location.href = response.data.checkout_url;
                } else {
                    $button.prop('disabled', false).text(wcStepForm.i18n.choose_plan);
                    showError(response.data || wcStepForm.i18n.error_occurred);
                }
            },
            error: function () {
                $button.prop('disabled', false).text(wcStepForm.i18n.choose_plan);
                showError(wcStepForm.i18n.error_occurred);
            }
        });
    }

    // ============================================
    // MOSTRAR ACCIONES DE CARRITO
    // ============================================
    function showCartActions(data) {
        const html = `
        <div class="cart-actions" style="margin-top: 20px; text-align: center;">
            <p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">
                <i data-feather="check-circle"></i> ${data.product_name || wcStepForm.i18n.product_added}
            </p>
            <div class="action-buttons">
                <a href="${data.cart_url}" class="btn-view-cart" style="margin-right: 10px;">
                    <i data-feather="shopping-cart"></i> ${wcStepForm.i18n.view_cart}
                </a>
                <a href="${data.checkout_url}" class="btn-checkout">
                    <i data-feather="credit-card"></i> ${wcStepForm.i18n.checkout}
                </a>
            </div>
            <p style="margin-top: 15px;">
                <button type="button" class="btn-restart" style="background: none; border: none; color: #666; cursor: pointer; text-decoration: underline;">
                    <i data-feather="plus-circle"></i> ${wcStepForm.i18n.add_another}
                </button>
            </p>
        </div>
    `;

        $('.product-actions').html(html);
        replaceFeatherIcons();

        $('.btn-restart').on('click', function () { showFrequencyStep(); });
    }

    // ============================================
    // ACTUALIZAR BARRA DE PROGRESO
    // ============================================
    function updateProgress(current, total, label) {
        const steps = [
            wcStepForm.i18n.step_frequency,
            wcStepForm.i18n.step_age,
            wcStepForm.i18n.step_day_days,
            wcStepForm.i18n.step_schedule,
            wcStepForm.i18n.step_confirmation
        ];
        let html = '';

        for (let i = 1; i <= total; i++) {
            const isCompleted = i < current;
            const isCurrent = i === current;
            const isActive = i <= current;
            const stepLabel = i === current ? label : (steps[i - 1] || `Step ${i}`);

            const circleContent = isCompleted
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                : i;

            html += `
                <div class="step ${isActive ? 'active' : ''} ${isCompleted ? 'completed clickable' : ''} ${isCurrent ? 'current' : ''}" 
                     data-step="${i}" 
                     ${isCompleted ? 'title="' + wcStepForm.i18n.click_to_return + '"' : ''}>
                    <div class="step-circle">${circleContent}</div>
                    <div class="step-label">${stepLabel}</div>
                </div>
            `;
        }

        $('#dynamic-progress').html(html);

        $('#dynamic-progress').off('click', '.step.completed').on('click', '.step.completed', function () {
            const targetStep = $(this).data('step');
            goToStep(targetStep);
        });
    }

    // ============================================
    // IR A UN PASO ESPECÍFICO
    // ============================================
    function goToStep(targetStep) {
        if (targetStep === 1) {
            showFrequencyStep();
            return;
        }

        const stepToAttr = {
            2: state.selections.frequency === '1_day' ? 'age_addon' : 'age_addon_2days',
            3: state.selections.frequency === '1_day' ? 'pa_dia-suelto' : 'pa_dias',
            4: 'pa_horario'
        };

        const newSelections = { frequency: state.selections.frequency };

        for (let i = 2; i < targetStep; i++) {
            const attrKey = stepToAttr[i];
            if (attrKey && state.selections[attrKey]) {
                newSelections[attrKey] = state.selections[attrKey];
            }
        }

        state.selections = newSelections;
        state.currentStep = targetStep - 2;

        loadNextStep();
    }

    // ============================================
    // HELPERS
    // ============================================
    function getStepName(attrName) {
        const names = {
            'pa_dia-suelto': wcStepForm.i18n.step_day,
            'pa_dias': wcStepForm.i18n.step_days,
            'age_addon': wcStepForm.i18n.step_age,
            'age_addon_2days': wcStepForm.i18n.step_age,
            'pa_edad': wcStepForm.i18n.step_age,
            'pa_horario': wcStepForm.i18n.step_schedule
        };
        return names[attrName] || wcStepForm.i18n.step_selection;
    }

    function getIcon(attrName, value) {
        const icons = {
            'pa_dia-suelto': 'calendar',
            'pa_dias': 'calendar',
            'age_addon': 'users',
            'age_addon_2days': 'users',
            'pa_edad': 'users',
            'pa_horario': 'clock'
        };

        if (attrName.includes('horario')) {
            const hour = parseInt(value.split(':')[0]);
            if (hour < 12) return '<i data-feather="sunrise"></i>';
            if (hour < 16) return '<i data-feather="sun"></i>';
            return '<i data-feather="sunset"></i>';
        }

        const iconName = icons[attrName] || 'circle';
        return `<i data-feather="${iconName}"></i>`;
    }

    function getDescription(attrName, value) {
        const descriptions = {
            'pa_dia-suelto': {
                'Monday': wcStepForm.i18n.class_every_monday,
                'Tuesday': wcStepForm.i18n.class_every_tuesday,
                'Wednesday': wcStepForm.i18n.class_every_wednesday,
                'Thursday': wcStepForm.i18n.class_every_thursday,
                'Friday': wcStepForm.i18n.class_every_friday,
                'Saturday': wcStepForm.i18n.class_every_saturday,
                'default': ''
            },
            'pa_dias': {
                'L-X': wcStepForm.i18n.monday_wednesday,
                'M-J': wcStepForm.i18n.tuesday_thursday,
                'default': ''
            },
            'age_addon': {
                'adultos': wcStepForm.i18n.all_schedules_available,
                'menores': wcStepForm.i18n.children_afternoon,
                'adolescentes': wcStepForm.i18n.teenagers_afternoon,
                'default': ''
            },
            'age_addon_2days': {
                'adultos': wcStepForm.i18n.all_schedules_available,
                'menores': wcStepForm.i18n.children_afternoon,
                'adolescentes': wcStepForm.i18n.teenagers_afternoon,
                'default': ''
            },
            'pa_edad': {
                'adultos': wcStepForm.i18n.over_18,
                'menores': wcStepForm.i18n['6_to_12'],
                'adolescentes': wcStepForm.i18n['12_to_18'],
                'default': ''
            }
        };

        if (attrName.includes('horario')) {
            const hour = parseInt(value.split(':')[0]);
            if (hour < 12) return wcStepForm.i18n.morning_shift;
            if (hour < 16) return wcStepForm.i18n.midday_shift;
            return wcStepForm.i18n.afternoon_shift;
        }

        const attrDescs = descriptions[attrName] || {};
        return attrDescs[value] || attrDescs['default'] || '';
    }

    function showError(message) {
        console.error('Error:', message);

        const html = `
            <div class="step-error" style="padding: 20px; background: #fee; border: 2px solid #c00; border-radius: 4px; text-align: center;">
                <p style="color: #c00; margin-bottom: 15px;">${message}</p>
                <button type="button" class="btn-restart">🔄 ${wcStepForm.i18n.start_over}</button>
            </div>
        `;

        $('#dynamic-steps').html(html);

        $('.btn-restart').on('click', function () { showFrequencyStep(); });
    }
});