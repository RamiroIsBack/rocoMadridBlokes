// ── Auto-exclusion: intra-entity transfers + inter-company payments ───
// These cancel out in a consolidated view of both companies.
// They are auto-marked excluded so the "Sin internos" toggle hides them,
// but remain visible individually (IVA, per-entity analysis).
const EXCLUDE_CONCEPTS = [
  'transferencia entre cuentas',
  'rocodromo',  // catches: "Uso rocódromo", "Servicios rocódromo", "USO DE ROCODROMO", etc.
]

function normStr(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ── Category definitions ──────────────────────────────────────────────
export const CATEGORIES = {
  alquiler:          'Alquiler',
  comunidad:         'Comunidad',
  nominas:           'Nóminas',
  electricidad:      'Electricidad',
  gas:               'Gas',
  agua:              'Agua',
  telecomunicaciones:'Telecom',
  bar:               'Bar/Café',
  comisiones_banco:  'Comisiones banco',
  devoluciones_tpv:  'Devoluciones TPV',
  ss:                'Seguridad Social',
  iva_303:           'IVA (mod. 303)',
  mod_115:           'Ret. alquileres (mod. 115)',
  mod_111:           'Ret. trabajadores (mod. 111)',
  hacienda:          'Hacienda/AEAT (otros)',
  marketing:         'Marketing',
  retirada_efectivo: 'Retirada efectivo',
  formacion:         'Formación',
  material:          'Inventario general (material, presas…)',
  asesoria:          'Asesoría/Gestoría',
  socios:            'Socios',
  gatos:             'Reparación gatos',
  tarjeta:           'Tarjeta (recibo Visa)',
  web:               'Página web',
  dominio:           'Dominio',
  eurofer:           'Eurofer',
  seguridad_laboral: 'Seguridad laboral',
  seguro_rc:         'Seguro RC',
  tasa_residuos:     'Tasa residuos',
  eventos:           'Eventos',
  notaria:           'Notaría',
  mantenimiento:     'Mantenimiento varios',
  tpv:               'Venta TPV',
  bizum:             'Bizum',
  wellhub:           'Wellhub',
  transferencia:     'Transferencia cliente',
  otros:             'Otros',
}

export const CATEGORY_IVA = {
  alquiler:          21,
  comunidad:         21,
  nominas:           0,
  electricidad:      21,
  gas:               21,
  agua:              21,
  telecomunicaciones:21,
  bar:               10,
  comisiones_banco:  0,
  devoluciones_tpv:  0,
  ss:                0,
  iva_303:           0,
  mod_115:           0,
  mod_111:           0,
  hacienda:          0,
  marketing:         21,
  retirada_efectivo: 0,
  formacion:         21,
  material:          21,
  asesoria:          21,
  socios:            0,
  gatos:             21,
  tarjeta:           0,
  web:               21,
  dominio:           21,
  eurofer:           21,
  seguridad_laboral: 21,
  seguro_rc:         0,
  tasa_residuos:     0,
  eventos:           21,
  notaria:           21,
  mantenimiento:     21,
  tpv:               21,
  bizum:             21,
  wellhub:           21,
  transferencia:     21,
  otros:             21,
}

// El orden importa: gana la primera regla que encaje.
// Los NRC de Hacienda empiezan por el número de modelo (111…, 115…, 303…).
const EXPENSE_RULES = [
  { test: c => /^NRC\.\s*111|RECAUD\.111/i.test(c),                      cat: 'mod_111' },
  { test: c => /^NRC\.\s*115|RECAUD\.115/i.test(c),                      cat: 'mod_115' },
  { test: c => /^NRC\.\s*303|RECAUD\.303/i.test(c),                      cat: 'iva_303' },
  { test: c => /ALQUILER/i.test(c),                                      cat: 'alquiler' },
  { test: c => /COMUNIDAD/i.test(c),                                      cat: 'comunidad' },
  { test: c => /REMESA DE TRANSFERENCIAS|REMESA DE NOMINAS|NOMINA|NÓMINA|FINIQUITO/i.test(c), cat: 'nominas' },
  { test: c => /IBERDROLA|OCTOPUS ENERGY/i.test(c),                        cat: 'electricidad' },
  { test: c => /COMERCIALIZADORA REGULADA|GAS POWER/i.test(c),           cat: 'gas' },
  { test: c => /\bAGUA\b/i.test(c),                                       cat: 'agua' },
  { test: c => /TELCOM|DIGI SPAIN|TELEFON/i.test(c),                     cat: 'telecomunicaciones' },
  { test: c => /COCA COLA/i.test(c),                                      cat: 'bar' },
  { test: c => /COM\.TAR\.|COM MTMO|LIQ\. OP\.|COMISION TARJETAS|COMI BIZUM|COMERC\s+\d+\s+REM/i.test(c), cat: 'comisiones_banco' },
  { test: c => /DEV\.TAR\.|DEVOLUC/i.test(c),                              cat: 'devoluciones_tpv' },
  { test: c => /RBO\.REGIMEN GENERAL|SEGURIDAD SOCIAL|TGSS/i.test(c),         cat: 'ss' },
  { test: c => /^NRC\.|^RECAUD\.|AEAT|HACIENDA/i.test(c),               cat: 'hacienda' },
  { test: c => /SPOTIFY|MARKETING/i.test(c),                             cat: 'marketing' },
  { test: c => /CAJERO|RGRO\.TJTA/i.test(c),                             cat: 'retirada_efectivo' },
  { test: c => /ESCUELA|FORMACION|FORMACIÓN/i.test(c),                   cat: 'formacion' },
  { test: c => /ARTUROFINANCIAL|ASESORIA|ASESORÍA|GESTORIA|GESTORÍA|FELIX CASTRO MARTINO/i.test(c), cat: 'asesoria' },
  { test: c => /EUROFER/i.test(c),                                        cat: 'eurofer' },
  { test: c => /LOTE DE PRESAS|PRESAS|CAMISETA|MEDALLA|MAGNESIO|MG L[IÍ]QUIDO|INVENTARIO/i.test(c), cat: 'material' },
  { test: c => /DUE SERVICIOS INTEGRALES LABORALES|PREVENCION|PREVENCIÓN/i.test(c), cat: 'seguridad_laboral' },
  { test: c => /GATOS/i.test(c),                                          cat: 'gatos' },
  { test: c => /RECIBO VISA/i.test(c),                                    cat: 'tarjeta' },
  { test: c => /DOMINIO/i.test(c),                                        cat: 'dominio' },
  { test: c => /SITEGROUND|SITIO WEB|PAGINA WEB|PÁGINA WEB/i.test(c),    cat: 'web' },
  { test: c => /\bSEGURO\b|POLIZA|PÓLIZA/i.test(c),                      cat: 'seguro_rc' },
  { test: c => /RESIDUOS|BASURAS/i.test(c),                               cat: 'tasa_residuos' },
  { test: c => /NOTARI/i.test(c),                                         cat: 'notaria' },
  { test: c => /MANTENIMIENTO/i.test(c),                                  cat: 'mantenimiento' },
]

const INCOME_RULES = [
  { test: c => /TOTAL TARJETAS|VTA\.TAR\./i.test(c), cat: 'tpv' },
  { test: c => /VENTA BIZUM/i.test(c),                 cat: 'bizum' },
  { test: c => /GYMPASS|WELLHUB/i.test(c),             cat: 'wellhub' },
  { test: c => /DEV\.COM\./i.test(c),                  cat: 'comisiones_banco' },
  // Devolución de IVA: cobro que viene de Hacienda
  { test: c => /AEAT|HACIENDA|AGENCIA TRIBUTARIA|DEVOLUCION IVA|DEVOLUCIÓN IVA/i.test(c), cat: 'iva_303' },
]

// Categorías que son ventas (no gastos): no entran en el presupuesto de pagos.
export const SALES_CATEGORIES = ['tpv', 'bizum', 'wellhub', 'transferencia']

// ── Reglas aprendidas ─────────────────────────────────────────────────
// Cuando se cambia a mano la categoría de un movimiento, se guarda
// "concepto → categoría" y se aplica sola en las siguientes importaciones.
// La clave quita números, fechas y acentos para que "N 2026182… FELIX CASTRO"
// y "N 2026210… FELIX CASTRO" den la misma clave. Va con + o − según sea cobro o pago.
export function conceptKey(concepto, isIncome) {
  const base = normStr(concepto || '')
    .toUpperCase()
    .replace(/\S*\d\S*/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return base.length >= 3 ? `${isIncome ? '+' : '-'}${base}` : ''
}

export function autoCategory(concepto, isIncome, learned = null) {
  if (learned) {
    const key = conceptKey(concepto, isIncome)
    if (key && learned[key] && CATEGORIES[learned[key]]) return learned[key]
  }
  const rules = isIncome ? INCOME_RULES : EXPENSE_RULES
  for (const r of rules) { if (r.test(concepto)) return r.cat }
  return isIncome ? 'transferencia' : 'otros'
}

// Conceptos que no se pueden clasificar con confianza y conviene que alguien los mire a
// mano (quedan en "otros", solo se marcan para resaltarlos en la vista previa).
const REVIEW_PATTERNS = [/RECIBO VISA/i]
export function needsReview(concepto) {
  return REVIEW_PATTERNS.some(p => p.test(concepto))
}

// CSV de la cuenta del Club (CaixaBank): sin columna Cuenta, cabecera con "Saldo Posterior"
// en vez de "Cuenta"/"Importe tras el movimiento". Para elegir la entidad por defecto cuando
// el CSV no trae columna Cuenta (si la trae, se usa KNOWN_ACCOUNTS / selección manual).
export function detectClubCaixaFormat(text) {
  return /saldo posterior/i.test(text)
}

function isExcluded(concepto) {
  const n = normStr(concepto)
  return EXCLUDE_CONCEPTS.some(ex => n.includes(ex))
}

function parseAmount(str) {
  if (!str) return NaN
  return parseFloat(
    str.trim()
      .replace(/[^\d,.\-−]/g, '')
      .replace('−', '-')
      .replace(/\.(?=\d{3})/g, '')  // remove thousands dot only
      .replace(',', '.')
  )
}

// "30/04/2026" or "30/4/2026 0:00" → "2026-04"
function parseMonth(str) {
  if (!str) return ''
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return ''
  return `${m[3]}-${m[2].padStart(2, '0')}`
}

// ── Format detection ──────────────────────────────────────────────────
// Flat format (new): header "Cantidades expresadas en euros;Fecha;..."
//   cols: [empty, Fecha, FechaValor, Concepto, Cuenta, Importe]
// Sectioned format (old): section headers "Ingresos" / "Costes" in col[1]
//   cols: [empty, Section/empty, empty, Fecha, Concepto, Importe, ...]

function detectFormat(lines) {
  for (const line of lines.slice(0, 5)) {
    if (/Cantidades expresadas/i.test(line)) return 'flat'
    const c = line.split(';')[1]?.trim()
    if (c === 'Ingresos' || c === 'Costes') return 'sectioned'
  }
  return 'flat'
}

// ── Flat parser ───────────────────────────────────────────────────────
// Santander format (has Cuenta col):
//   Header: ...;Concepto;Cuenta;Importe   → Importe at col[5]
// Club/CaixaBank format (no Cuenta col):
//   Header: ...;Concepto;Importe;Saldo Posterior  → Importe at col[4]
function parseFlat(lines, learned) {
  // Detect columns from header
  const headerLine = lines.find(l => /Cantidades expresadas/i.test(l)) || ''
  const headerCols = headerLine.split(';').map(c => c.trim().toLowerCase())
  const hasCuentaCol = headerCols.includes('cuenta')
  const importeIdx   = hasCuentaCol ? 5 : 4

  const ingresos = [], costes = []
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(';')
    const fecha      = cols[1]?.trim()
    const fechaValor = cols[2]?.trim()
    const concepto   = cols[3]?.trim()
    const cuenta     = hasCuentaCol ? (cols[4]?.trim() || '') : ''
    const importeRaw = cols[importeIdx]?.trim()
    // Saldo tras el movimiento (si el formato lo trae, justo después del importe): único por
    // movimiento, a diferencia de fecha+concepto+importe, que dos transferencias distintas del
    // mismo día por el mismo importe exacto comparten (p. ej. dos alumnos pagando lo mismo).
    const saldo = cols[importeIdx + 1]?.trim() || ''
    if (!fecha || !fecha.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) || !concepto || !importeRaw) continue
    const importe = parseAmount(importeRaw)
    if (isNaN(importe) || importe === 0) continue

    const isIncome = importe > 0
    const cat      = autoCategory(concepto, isIncome, learned)
    // El mes se decide por fecha valor (cuándo entra/sale el dinero de verdad), no por fecha
    // de operación: un cobro TPV del último día del mes puede valorarse al día siguiente, que
    // ya caería en el mes que viene si se mirase la fecha de operación.
    const item = {
      id:       `${i}`,
      fecha,
      fechaValor: fechaValor || fecha,
      month:    parseMonth(fechaValor) || parseMonth(fecha),
      concepto,
      cuenta,
      importe,
      saldo,
      category: cat,
      ruleCat:  cat,
      iva:      CATEGORY_IVA[cat] ?? 21,
      excluded: isExcluded(concepto),
      needsReview: needsReview(concepto),
      section:  isIncome ? 'ingresos' : 'costes',
    }
    if (isIncome) ingresos.push(item)
    else          costes.push(item)
  }
  return { ingresos, costes }
}

// ── Sectioned parser (legacy) ─────────────────────────────────────────
function parseSectioned(lines, learned) {
  const ingresos = [], costes = []
  let section = null
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(';')
    const sec = cols[1]?.trim()
    if (sec === 'Ingresos') { section = 'ingresos'; continue }
    if (sec === 'Costes')   { section = 'costes';   continue }
    if (!section) continue

    const fecha      = cols[3]?.trim()
    const concepto   = cols[4]?.trim()
    const importeRaw = cols[5]?.trim()
    if (!fecha || !fecha.includes('/') || !concepto || !importeRaw) continue
    const importe = parseAmount(importeRaw)
    if (isNaN(importe)) continue

    const isIncome = section === 'ingresos'
    const cat      = autoCategory(concepto, isIncome, learned)
    const item = {
      id:       `${i}`,
      fecha,
      fechaValor: fecha,
      month:    parseMonth(fecha),
      concepto,
      importe,
      saldo: '',
      category: cat,
      ruleCat:  cat,
      iva:      CATEGORY_IVA[cat] ?? 21,
      excluded: isExcluded(concepto),
      needsReview: needsReview(concepto),
      section,
    }
    if (isIncome) ingresos.push(item)
    else          costes.push(item)
  }
  return { ingresos, costes }
}

// ── Public entry point ────────────────────────────────────────────────
export function parseExpensesCSV(text, learned = null) {
  const clean = text.replace(/﻿/g, '').replace(/ï»¿/g, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter(l => l.trim())
  const fmt = detectFormat(lines)
  return fmt === 'flat' ? parseFlat(lines, learned) : parseSectioned(lines, learned)
}
