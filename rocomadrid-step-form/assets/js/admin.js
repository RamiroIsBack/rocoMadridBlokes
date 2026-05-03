/**
 * RocoMadrid Step Form - JavaScript unificado de administración
 *
 * Incluye lógica para:
 * - Statistics (tabs, filtros AJAX, tabla alumnos)
 * - Settings (tabs de días, toggle checkboxes)
 * - Schedule Manager (auto-turno por hora)
 */

(function ($) {
  'use strict';

  // ============================================
  // STATISTICS
  // ============================================

  var StatsModule = {
    isLoading: false,
    allAlumnos: [],
    currentPage: 1,
    perPage: 30,

    init: function () {
      if (!$('.rocomadrid-stats').length) return;

      var self = this;
      var ajaxUrl = rmAdmin.ajaxUrl;
      var nonce = rmAdmin.nonce;

      $('.stats-tab').on('click', function () {
        var tab = $(this).data('tab');
        $('.stats-tab').removeClass('active');
        $(this).addClass('active');
        $('.tab-content').removeClass('active');
        $('#tab-' + tab).addClass('active');
        if (tab === 'alumnos') self.loadAlumnos(ajaxUrl, nonce);
      });

      $('#filter-horario, #filter-edad, #filter-producto, #filter-turno, #filter-status').on('change', function () {
        self.currentPage = 1;
        self.loadAlumnos(ajaxUrl, nonce);
      });

      // Botones toggle de día
      $(document).on('click', '.dia-toggle-btn', function () {
        $(this).toggleClass('active');
        // Sincronizar con el select oculto
        var selected = [];
        $('#filter-dia-group .dia-toggle-btn.active').each(function () {
          selected.push($(this).data('value'));
        });
        $('#filter-dia').val(selected);
        self.currentPage = 1;
        self.loadAlumnos(ajaxUrl, nonce);
      });

      $('#btn-limpiar').on('click', function () {
        $('#filter-dia-group .dia-toggle-btn').removeClass('active');
        $('#filter-dia').val([]);
        $('#filter-horario, #filter-edad, #filter-producto, #filter-turno').val('');
        $('#filter-status').val('active');
        self.currentPage = 1;
        self.loadAlumnos(ajaxUrl, nonce);
      });

      $(document).on('click', '.filter-badge-remove', function () {
        var filterId = $(this).data('filter');
        if (filterId === 'status') {
          $('#filter-status').val('active');
        } else if (filterId === 'dia') {
          $('#filter-dia-group .dia-toggle-btn').removeClass('active');
          $('#filter-dia').val([]);
        } else {
          $('#filter-' + filterId).val('');
        }
        self.currentPage = 1;
        self.loadAlumnos(ajaxUrl, nonce);
      });

      $('.clickable-cell').on('click', function () {
        var dia = $(this).data('dia');
        var horario = $(this).data('horario');
        if (!dia && !horario) return;
        $('#filter-dia-group .dia-toggle-btn').removeClass('active');
        $('#filter-dia').val([]);
        $('#filter-horario, #filter-edad, #filter-producto, #filter-turno').val('');
        $('#filter-status').val('active');
        if (dia) {
          $('#filter-dia-group .dia-toggle-btn[data-value="' + dia + '"]').addClass('active');
          $('#filter-dia').val([dia]);
        }
        if (horario) $('#filter-horario').val(horario);
        $('.stats-tab').removeClass('active');
        $('.stats-tab[data-tab="alumnos"]').addClass('active');
        $('.tab-content').removeClass('active');
        $('#tab-alumnos').addClass('active');
        self.currentPage = 1;
        self.loadAlumnos(ajaxUrl, nonce);
      });

      if ($('#tab-alumnos').hasClass('active')) {
        self.loadAlumnos(ajaxUrl, nonce);
      }
    },

    loadAlumnos: function (ajaxUrl, nonce) {
      if (this.isLoading) return;
      this.isLoading = true;
      var self = this;

      var filtros = {
        action: 'rocomadrid_get_alumnos',
        nonce: nonce,
        dia: $('#filter-dia').val() || [],
        horario: $('#filter-horario').val(),
        edad: $('#filter-edad').val(),
        producto: $('#filter-producto').val(),
        turno: $('#filter-turno').val(),
        status: $('#filter-status').val()
      };

      $('#alumnos-loading').addClass('active');
      $('#alumnos-table').hide();
      $('#alumnos-pagination').hide();

      $.post(ajaxUrl, filtros, function (response) {
        self.isLoading = false;
        $('#alumnos-loading').removeClass('active');
        if (response.success) {
          self.allAlumnos = response.data.alumnos;
          self.renderPage();
          self.updateFilterBadges(filtros, response.data.total);
        }
      }).fail(function () {
        self.isLoading = false;
        $('#alumnos-loading').removeClass('active');
        $('#alumnos-tbody').html('<tr><td colspan="9" style="text-align:center;padding:40px;color:#ef4444">Error al cargar los datos</td></tr>');
        $('#alumnos-table').show();
      });
    },

    renderPage: function () {
      var start = (this.currentPage - 1) * this.perPage;
      var paginated = this.allAlumnos.slice(start, start + this.perPage);
      this.renderAlumnos(paginated, this.allAlumnos.length);
      this.renderPagination();
    },

    renderAlumnos: function (alumnos, total) {
      var html = '';
      if (alumnos.length === 0) {
        html = '<tr><td colspan="9" class="empty-state"><div class="empty-state-icon">🔍</div>No se encontraron alumnos con los filtros seleccionados</td></tr>';
      } else {
        alumnos.forEach(function (a) {
          var productBadge = a.producto === 'Single Days' ? 'badge-warning' : 'badge-info';
          var planBadge = a.plan === 'annual' ? 'badge-success' : (a.plan === 'quarterly' ? 'badge-info' : 'badge-warning');

          // Badge de estado según el status de la suscripción
          var statusBadge = 'badge-info';
          var statusLabel = StatsModule.ucfirst(a.status || 'unknown');
          if (a.status === 'active') {
            statusBadge = 'badge-success';
          } else if (a.status === 'cancelled') {
            statusBadge = 'badge-danger';
          } else if (a.status === 'on-hold') {
            statusBadge = 'badge-warning';
          } else if (a.status === 'pending') {
            statusBadge = 'badge-info';
          }

          html += '<tr class="alumno-row">';
          html += '<td><div class="alumno-details"><span class="alumno-name">' + StatsModule.escapeHtml(a.cliente) + '</span><span class="alumno-email">' + StatsModule.escapeHtml(a.email) + '</span></div></td>';
          html += '<td><span class="badge ' + productBadge + '">' + StatsModule.escapeHtml(a.producto) + '</span></td>';
          html += '<td><strong>' + StatsModule.escapeHtml(a.dia || '-') + '</strong></td>';
          html += '<td>' + StatsModule.escapeHtml(a.horario || '-') + '</td>';
          html += '<td>' + StatsModule.escapeHtml(a.edad || 'Adultos') + '</td>';
          html += '<td><span class="badge ' + planBadge + '">' + StatsModule.ucfirst(a.plan || 'monthly') + '</span></td>';
          html += '<td><strong>' + StatsModule.formatNumber(a.total) + '€</strong></td>';
          html += '<td><span class="badge ' + statusBadge + '">' + statusLabel + '</span></td>';
          html += '<td>' + StatsModule.escapeHtml(a.fecha_inicio) + '</td>';
          html += '</tr>';
        });
      }
      $('#alumnos-tbody').html(html);
      $('#alumnos-table').show();

      var totalLabel = (total !== undefined && total !== alumnos.length)
        ? 'Mostrando <strong>' + alumnos.length + '</strong> de <strong>' + total + '</strong> alumnos'
        : 'Total: <strong>' + alumnos.length + '</strong> alumnos';
      $('#total-info').html(totalLabel);
      $('#total-info').html(totalLabel);
    },

    renderPagination: function () {
      var self = this;
      var total = this.allAlumnos.length;
      var totalPages = Math.ceil(total / this.perPage);
      var $pag = $('#alumnos-pagination');

      if (totalPages <= 1) {
        $pag.hide().empty();
        return;
      }

      var cp = this.currentPage;
      var html = '<div style="display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;">';
      html += '<button class="btn btn-secondary rm-pag-btn" data-page="' + (cp - 1) + '"' + (cp <= 1 ? ' disabled' : '') + '>← Prev</button>';
      html += '<span style="color:#6b7280;font-size:14px;">Page <strong>' + cp + '</strong> of <strong>' + totalPages + '</strong></span>';
      html += '<button class="btn btn-secondary rm-pag-btn" data-page="' + (cp + 1) + '"' + (cp >= totalPages ? ' disabled' : '') + '>Next →</button>';
      html += '</div>';

      $pag.html(html).show();

      $pag.find('.rm-pag-btn').on('click', function () {
        var page = parseInt($(this).data('page'), 10);
        if (page < 1 || page > totalPages) return;
        self.currentPage = page;
        self.renderPage();
        $('html, body').animate({ scrollTop: $('#alumnos-table').offset().top - 30 }, 200);
      });
    },

    updateFilterBadges: function (filtros, total) {
      // Considerar que status tiene filtro activo si NO es "active" (el valor por defecto)
      var statusActivo = filtros.status && filtros.status !== 'active';
      var diasActivos = Array.isArray(filtros.dia) && filtros.dia.length > 0;
      var hayFiltros = diasActivos || filtros.horario || filtros.edad || filtros.producto || filtros.turno || statusActivo;
      if (hayFiltros) {
        $('#active-filters').show();
        $('#count-results').text(total);
        var badges = '';
        if (diasActivos) badges += '<span class="filter-badge">Día: ' + filtros.dia.join(', ') + '<span class="filter-badge-remove" data-filter="dia">×</span></span>';
        if (filtros.horario) badges += '<span class="filter-badge">Horario: ' + filtros.horario + '<span class="filter-badge-remove" data-filter="horario">×</span></span>';
        if (filtros.edad) badges += '<span class="filter-badge">Edad: ' + filtros.edad + '<span class="filter-badge-remove" data-filter="edad">×</span></span>';
        if (filtros.producto) badges += '<span class="filter-badge">Producto: ' + filtros.producto + '<span class="filter-badge-remove" data-filter="producto">×</span></span>';
        if (filtros.turno) badges += '<span class="filter-badge">Turno: ' + filtros.turno + '<span class="filter-badge-remove" data-filter="turno">×</span></span>';
        if (statusActivo) badges += '<span class="filter-badge">Estado: ' + StatsModule.ucfirst(filtros.status) + '<span class="filter-badge-remove" data-filter="status">×</span></span>'
        $('#filter-badges').html(badges);
      } else {
        $('#active-filters').hide();
      }
    },

    escapeHtml: function (text) {
      if (!text) return '';
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },

    ucfirst: function (str) {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    },

    formatNumber: function (num) {
      return parseFloat(num).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
  };


  // ============================================
  // SETTINGS
  // ============================================

  var SettingsModule = {
    init: function () {
      // Tabs para horarios menores/adolescentes
      if ($('.rocomadrid-tabs').length) {
        window.switchTab = function (tabId) {
          document.querySelectorAll('.rocomadrid-tab').forEach(function (t) { t.classList.remove('active'); });
          document.querySelectorAll('.rocomadrid-tab-content').forEach(function (c) { c.classList.remove('active'); });
          document.querySelector('[data-tab="' + tabId + '"]').classList.add('active');
          document.getElementById('tab-' + tabId).classList.add('active');
        };

        window.toggleAll = function (name, checked) {
          document.querySelectorAll('input[name="' + name + '[]"]').forEach(function (cb) {
            cb.checked = checked;
          });
        };
      }

      // Product cards (Settings dashboard)
      if ($('.rm-product-card').length && typeof rmSettings !== 'undefined') {
        var self = this;

        $('.rm-btn-check').on('click', function () {
          self.checkProduct($(this).data('type'));
        });

        $(document).on('click', '.rm-btn-create', function () {
          self.createProduct($(this).data('type'), $(this).data('field'));
        });
      }
    },

    checkProduct: function (type) {
      var fieldId = (type === 'single') ? 'product_dias_sueltos' : 'product_tarifas';
      var productId = $('#' + fieldId).val();
      var $badge = $('#badge-' + type);
      var $info = $('#info-' + type);
      var $card = $('#product-card-' + type);

      $badge.removeClass('badge-success badge-danger').addClass('badge-info').text(rmSettings.i18n.checking);

      $.post(rmSettings.ajaxUrl, {
        action: 'rocomadrid_settings_check_product',
        nonce: rmSettings.nonce,
        product_id: productId
      }, function (response) {
        if (response.success && response.data.exists) {
          var d = response.data;
          $badge.removeClass('badge-info badge-danger').addClass('badge-success').text(rmSettings.i18n.found);
          $info.html(
            '<div class="info-grid">' +
            '<div class="info-item"><span class="label">Name</span><span class="value">' + SettingsModule.esc(d.name) + '</span></div>' +
            '<div class="info-item"><span class="label">Type</span><span class="value">' + SettingsModule.esc(d.type) + '</span></div>' +
            '<div class="info-item"><span class="label">Variations</span><span class="value">' + d.variation_count + '</span></div>' +
            '<div class="info-item"><span class="label">Status</span><span class="value">' + SettingsModule.esc(d.status) + '</span></div>' +
            '</div>'
          );
          $card.find('.rm-btn-create').hide();
        } else {
          $badge.removeClass('badge-info badge-success').addClass('badge-danger').text(rmSettings.i18n.notFound);
          $info.html('<p class="rm-product-not-found">' + rmSettings.i18n.notFoundMsg + '</p>');
          if (!$card.find('.rm-btn-create').length) {
            var fieldName = (type === 'single') ? 'product_dias_sueltos' : 'product_tarifas';
            $info.after(
              '<button type="button" class="btn btn-primary-rm rm-btn-create" ' +
              'data-type="' + type + '" data-field="' + fieldName + '">' +
              '🏗️ ' + rmSettings.i18n.createProduct + '</button>'
            );
          } else {
            $card.find('.rm-btn-create').show();
          }
        }
      }).fail(function () {
        $badge.removeClass('badge-info badge-success').addClass('badge-danger').text(rmSettings.i18n.error);
      });
    },

    createProduct: function (type, fieldName) {
      var $card = $('#product-card-' + type);
      var $btn = $card.find('.rm-btn-create');

      $btn.prop('disabled', true).text(rmSettings.i18n.creating);

      $.post(rmSettings.ajaxUrl, {
        action: 'rocomadrid_settings_create_product',
        nonce: rmSettings.nonce,
        product_type: type
      }, function (response) {
        if (response.success) {
          var newId = response.data.product_id;
          $('#' + fieldName).val(newId);
          $btn.hide();
          SettingsModule.checkProduct(type);
        } else {
          $btn.prop('disabled', false).html('🏗️ ' + rmSettings.i18n.createProduct);
          alert(rmSettings.i18n.error + ': ' + response.data);
        }
      }).fail(function () {
        $btn.prop('disabled', false).html('🏗️ ' + rmSettings.i18n.createProduct);
        alert(rmSettings.i18n.error);
      });
    },

    esc: function (text) {
      if (!text) return '';
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };


  // ============================================
  // SCHEDULE MANAGER (Variation Editor)
  // ============================================

  var ScheduleModule = {
    init: function () {
      if (!$('#sch-product-type').length) return;

      var self = this;

      $('#sch-product-type').on('change', function () {
        self.onProductChange($(this).val());
      });

      $('#sch-day').on('change', function () {
        self.onDayChange($(this).val());
      });

      $('#sch-btn-add').on('click', function () {
        self.createVariation();
      });

      $('#sch-new-time-start-h, #sch-new-time-start-m, #sch-new-age').on('change', function () {
        self.updateCalcPrice();
      });

      $(document).on('click', '.ve-btn-delete', function () {
        var id = $(this).data('id');
        var subs = $(this).data('subs') || 0;
        var schedule = $(this).data('schedule');
        if (subs > 0) {
          alert(rmSM.i18n.cannotDelete.replace('%d', subs));
          return;
        }
        if (confirm(rmSM.i18n.confirmDelete.replace('%1$d', id).replace('%2$s', schedule))) {
          self.deleteVariation(id);
        }
      });
    },

    onProductChange: function (productType) {
      var $day = $('#sch-day');
      var $content = $('#sch-content');

      if (!productType) {
        $day.prop('disabled', true).html('<option value="">' + rmSM.i18n.selectProductFirst + '</option>');
        $content.hide();
        return;
      }

      $day.prop('disabled', true).html('<option value="">' + rmSM.i18n.loading + '</option>');

      $.post(rmSM.ajaxUrl, {
        action: 'rocomadrid_sm_get_days',
        nonce: rmSM.nonce,
        product_type: productType
      }, function (response) {
        if (response.success) {
          var html = '<option value="">' + rmSM.i18n.selectDay + '</option>';
          response.data.days.forEach(function (d) {
            html += '<option value="' + ScheduleModule.esc(d.slug) + '">' + ScheduleModule.esc(d.name) + '</option>';
          });
          $day.html(html).prop('disabled', false);
          $content.hide();

          if (productType === 'classes') {
            $('#sch-age-field').show();
          } else {
            $('#sch-age-field').hide();
          }
        } else {
          $day.html('<option value="">' + rmSM.i18n.error + ': ' + ScheduleModule.esc(response.data) + '</option>');
        }
      });
    },

    onDayChange: function (day) {
      if (!day) {
        $('#sch-content').hide();
        return;
      }
      this.loadVariations();
    },

    loadVariations: function () {
      var productType = $('#sch-product-type').val();
      var day = $('#sch-day').val();
      if (!productType || !day) return;

      var $container = $('#sch-variations-container');
      var $content = $('#sch-content');

      $content.show();
      $container.html('<div class="loading-spinner active">' + rmSM.i18n.loadingVariations + '</div>');
      $('#sch-add-form').hide();

      $.post(rmSM.ajaxUrl, {
        action: 'rocomadrid_sm_get_variations',
        nonce: rmSM.nonce,
        product_type: productType,
        day: day
      }, function (response) {
        if (response.success) {
          ScheduleModule.renderVariations(response.data);
          $('#sch-add-form').show();
        } else {
          $container.html('<div class="empty-state"><div class="empty-state-icon">⚠️</div>' + ScheduleModule.esc(response.data) + '</div>');
        }
      });
    },

    renderVariations: function (data) {
      var variations = data.variations;
      var productType = data.product_type;
      var $container = $('#sch-variations-container');

      if (variations.length === 0) {
        $container.html(
          '<div class="empty-state"><div class="empty-state-icon">📭</div>' +
          rmSM.i18n.noVariations + '</div>'
        );
        return;
      }

      var html = '';
      html += '<table class="data-table ve-table"><thead><tr>';
      html += '<th>ID</th>';
      if (productType === 'classes') {
        html += '<th>' + rmSM.i18n.age + '</th>';
      }
      html += '<th>' + rmSM.i18n.schedule + '</th>';
      html += '<th>' + rmSM.i18n.shift + '</th>';
      html += '<th>' + rmSM.i18n.price + '</th>';
      html += '<th>' + rmSM.i18n.stock + '</th>';
      html += '<th>' + rmSM.i18n.subs + '</th>';
      html += '<th>' + rmSM.i18n.status + '</th>';
      html += '<th>SKU</th>';
      html += '<th></th>';
      html += '</tr></thead><tbody>';

      variations.forEach(function (v) {
        var statusClass = v.status === 'publish' ? 'badge-success' : 'badge-warning';
        var statusLabel = v.status === 'publish' ? rmSM.i18n.active : v.status;
        var shiftClass = v.turno === 'morning' ? 'badge-info' : 'badge-primary';
        var shiftLabel = v.turno === 'morning' ? rmSM.i18n.morning : rmSM.i18n.afternoon;
        var subsCount = v.subs || 0;
        var deleteDisabled = subsCount > 0 ? ' disabled title="' + rmSM.i18n.cannotDelete.replace('%d', subsCount) + '"' : '';

        html += '<tr>';
        html += '<td><strong>#' + v.id + '</strong></td>';
        if (productType === 'classes') {
          html += '<td>' + ScheduleModule.esc(v.age || '-') + '</td>';
        }
        html += '<td><strong>' + ScheduleModule.esc(v.schedule) + '</strong></td>';
        html += '<td><span class="badge ' + shiftClass + '">' + shiftLabel + '</span></td>';
        html += '<td><strong>' + v.price + '€</strong></td>';
        html += '<td>' + (v.stock !== null ? v.stock : '—') + '</td>';
        html += '<td>' + (subsCount > 0 ? '<span class="badge badge-warning">' + subsCount + '</span>' : '<span style="color:#9ca3af">0</span>') + '</td>';
        html += '<td><span class="badge ' + statusClass + '">' + statusLabel + '</span></td>';
        html += '<td><code style="font-size:11px">' + ScheduleModule.esc(v.sku || '-') + '</code></td>';
        html += '<td><button class="ve-btn-delete btn btn-danger-rm" data-id="' + v.id + '" data-subs="' + subsCount + '" data-schedule="' + ScheduleModule.esc(v.schedule) + '"' + deleteDisabled + '>🗑️</button></td>';
        html += '</tr>';
      });

      html += '</tbody></table>';
      $container.html(html);
    },

    createVariation: function () {
      var productType = $('#sch-product-type').val();
      var day = $('#sch-day').val();
      var timeStart = $('#sch-new-time-start-h').val() + ':' + $('#sch-new-time-start-m').val();
      var timeEnd = $('#sch-new-time-end-h').val() + ':' + $('#sch-new-time-end-m').val();
      var age = $('#sch-new-age').val();
      var stock = $('#sch-new-stock').val();

      if (!timeStart || !timeEnd) {
        alert(rmSM.i18n.enterTimes);
        return;
      }

      var $btn = $('#sch-btn-add');
      $btn.prop('disabled', true).text(rmSM.i18n.creating);

      var postData = {
        action: 'rocomadrid_sm_create_variation',
        nonce: rmSM.nonce,
        product_type: productType,
        day: day,
        time_start: timeStart,
        time_end: timeEnd,
        stock: stock
      };

      if (productType === 'classes') {
        postData.age = age;
      }

      $.post(rmSM.ajaxUrl, postData, function (response) {
        $btn.prop('disabled', false).html('➕ ' + rmSM.i18n.addVariation);
        if (response.success) {
          $('#sch-new-time-start').val('');
          $('#sch-new-time-end').val('');
          $('#sch-new-stock').val('');
          $('#sch-calc-price').text('—').removeClass('set');
          ScheduleModule.loadVariations();
        } else {
          alert(rmSM.i18n.error + ': ' + response.data);
        }
      }).fail(function () {
        $btn.prop('disabled', false).html('➕ ' + rmSM.i18n.addVariation);
        alert(rmSM.i18n.requestFailed);
      });
    },

    deleteVariation: function (variationId) {
      var $row = $('.ve-btn-delete[data-id="' + variationId + '"]').closest('tr');
      $row.css('opacity', '0.5');

      $.post(rmSM.ajaxUrl, {
        action: 'rocomadrid_sm_delete_variation',
        nonce: rmSM.nonce,
        variation_id: variationId
      }, function (response) {
        if (response.success) {
          ScheduleModule.loadVariations();
        } else {
          $row.css('opacity', '1');
          alert(response.data);
        }
      }).fail(function () {
        $row.css('opacity', '1');
        alert(rmSM.i18n.requestFailed);
      });
    },

    updateCalcPrice: function () {
      var productType = $('#sch-product-type').val();
      var timeStart = $('#sch-new-time-start-h').val() + ':' + ($('#sch-new-time-start-m').val() || '00');
      if (!$('#sch-new-time-start-h').val() || typeof rmSM === 'undefined') {
        $('#sch-calc-price').text('—').removeClass('set');
        return;
      }

      var hour = parseInt(timeStart.split(':')[0], 10);
      var afternoonHour = parseInt(rmSM.afternoonHour, 10);
      var price = '';

      if (productType === 'single') {
        var dayText = ($('#sch-day option:selected').text() || '').toLowerCase();
        if (dayText.indexOf('friday') !== -1 || dayText.indexOf('saturday') !== -1) {
          price = rmSM.prices.special;
        } else if (hour < afternoonHour) {
          price = rmSM.prices.morning;
        } else {
          price = rmSM.prices.afternoon;
        }
      } else if (productType === 'classes') {
        var age = $('#sch-new-age').val();
        if (age === 'Children') {
          price = rmSM.prices.children_2days;
        } else {
          price = (hour < afternoonHour) ? rmSM.prices.adults_2days_morning : rmSM.prices.adults_2days_afternoon;
        }
      }

      if (price) {
        $('#sch-calc-price').text(price + '€').addClass('set');
      } else {
        $('#sch-calc-price').text('—').removeClass('set');
      }
    },

    esc: function (text) {
      if (!text) return '';
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  };


  // ============================================
  // INICIALIZACIÓN
  // ============================================

  $(document).ready(function () {
    StatsModule.init();
    SettingsModule.init();
    ScheduleModule.init();
  });

})(jQuery);