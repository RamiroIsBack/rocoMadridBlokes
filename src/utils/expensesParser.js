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
  hacienda:          'Hacienda/AEAT',
  marketing:         'Marketing',
  retirada_efectivo: 'Retirada efectivo',
  formacion:         'Formación',
  material:          'Material/presas',
  asesoria:          'Asesoría',
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
  hacienda:          0,
  marketing:         21,
  retirada_efectivo: 0,
  formacion:         21,
  material:          21,
  asesoria:          21,
  tpv:               21,
  bizum:             21,
  wellhub:           21,
  transferencia:     21,
  otros:             21,
}

const EXPENSE_RULES = [
  { test: c => /ALQUILER/i.test(c),                                      cat: 'alquiler' },
  { test: c => /COMUNIDAD/i.test(c),                                      cat: 'comunidad' },
  { test: c => /REMESA DE TRANSFERENCIAS|REMESA DE NOMINAS|NOMINA|NÓMINA/i.test(c), cat: 'nominas' },
  { test: c => /IBERDROLA|OCTOPUS ENERGY/i.test(c),                        cat: 'electricidad' },
  { test: c => /COMERCIALIZADORA REGULADA|GAS POWER/i.test(c),           cat: 'gas' },
  { test: c => /\bAGUA\b/i.test(c),                                       cat: 'agua' },
  { test: c => /TELCOM|DIGI SPAIN|TELEFON/i.test(c),                     cat: 'telecomunicaciones' },
  { test: c => /COCA COLA/i.test(c),                                      cat: 'bar' },
  { test: c => /COM\.TAR\.|COM MTMO|LIQ\. OP\.|COMISION TARJETAS|COMI BIZUM/i.test(c), cat: 'comisiones_banco' },
  { test: c => /DEV\.TAR\.|DEVOLUC/i.test(c),                              cat: 'devoluciones_tpv' },
  { test: c => /RBO\.REGIMEN GENERAL|SEGURIDAD SOCIAL/i.test(c),         cat: 'ss' },
  { test: c => /^NRC\.|^RECAUD\.|AEAT|HACIENDA/i.test(c),               cat: 'hacienda' },
  { test: c => /SPOTIFY|MARKETING/i.test(c),                             cat: 'marketing' },
  { test: c => /CAJERO|RGRO\.TJTA/i.test(c),                             cat: 'retirada_efectivo' },
  { test: c => /ESCUELA|FORMACION|FORMACIÓN/i.test(c),                   cat: 'formacion' },
  { test: c => /ARTUROFINANCIAL|ASESORIA|ASESORÍA|GESTORIA|GESTORÍA/i.test(c), cat: 'asesoria' },
  { test: c => /LOTE DE PRESAS|EUROFER/i.test(c),                         cat: 'material' },
]

const INCOME_RULES = [
  { test: c => /TOTAL TARJETAS|VTA\.TAR\./i.test(c), cat: 'tpv' },
  { test: c => /VENTA BIZUM/i.test(c),                 cat: 'bizum' },
  { test: c => /GYMPASS|WELLHUB/i.test(c),             cat: 'wellhub' },
  { test: c => /DEV\.COM\./i.test(c),                  cat: 'comisiones_banco' },
]

export function autoCategory(concepto, isIncome) {
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
function parseFlat(lines) {
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
    if (!fecha || !fecha.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) || !concepto || !importeRaw) continue
    const importe = parseAmount(importeRaw)
    if (isNaN(importe) || importe === 0) continue

    const isIncome = importe > 0
    const cat      = autoCategory(concepto, isIncome)
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
      category: cat,
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
function parseSectioned(lines) {
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
    const cat      = autoCategory(concepto, isIncome)
    const item = {
      id:       `${i}`,
      fecha,
      fechaValor: fecha,
      month:    parseMonth(fecha),
      concepto,
      importe,
      category: cat,
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
export function parseExpensesCSV(text) {
  const clean = text.replace(/﻿/g, '').replace(/ï»¿/g, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter(l => l.trim())
  const fmt = detectFormat(lines)
  return fmt === 'flat' ? parseFlat(lines) : parseSectioned(lines)
}
