// ── Auto-exclusion: transfers between accounts of the same entity ─────
// USO DE ROCODROMO is a real payment from Club → Rocoteca, NOT excluded
const EXCLUDE_CONCEPTS = [
  'Transferencia entre cuentas',
]

// ── Category definitions ──────────────────────────────────────────────
export const CATEGORIES = {
  alquiler:          'Alquiler',
  nominas:           'Nóminas',
  electricidad:      'Electricidad',
  gas:               'Gas',
  telecomunicaciones:'Telecom',
  bar:               'Bar/Café',
  comisiones_banco:  'Comisiones banco',
  devoluciones_tpv:  'Devoluciones TPV',
  ss:                'Seguridad Social',
  hacienda:          'Hacienda/AEAT',
  marketing:         'Marketing',
  retirada_efectivo: 'Retirada efectivo',
  formacion:         'Formación',
  tpv:               'Venta TPV',
  transferencia:     'Transferencia cliente',
  otros:             'Otros',
}

export const CATEGORY_IVA = {
  alquiler:          21,
  nominas:           0,
  electricidad:      21,
  gas:               21,
  telecomunicaciones:21,
  bar:               10,
  comisiones_banco:  0,
  devoluciones_tpv:  0,
  ss:                0,
  hacienda:          0,
  marketing:         21,
  retirada_efectivo: 0,
  formacion:         21,
  tpv:               21,
  transferencia:     21,
  otros:             21,
}

const EXPENSE_RULES = [
  { test: c => /ALQUILER/i.test(c),                                      cat: 'alquiler' },
  { test: c => /REMESA DE NOMINAS|NOMINA|NÓMINA/i.test(c),               cat: 'nominas' },
  { test: c => /IBERDROLA/i.test(c),                                      cat: 'electricidad' },
  { test: c => /COMERCIALIZADORA REGULADA|GAS POWER/i.test(c),           cat: 'gas' },
  { test: c => /TELCOM|DIGI SPAIN|TELEFON/i.test(c),                     cat: 'telecomunicaciones' },
  { test: c => /COCA COLA/i.test(c),                                      cat: 'bar' },
  { test: c => /COM\.TAR\.|COM MTMO|LIQ\. OP\./i.test(c),               cat: 'comisiones_banco' },
  { test: c => /DEV\.TAR\.|DEVOLUCION|DEVOLUCIÓN/i.test(c),              cat: 'devoluciones_tpv' },
  { test: c => /RBO\.REGIMEN GENERAL|SEGURIDAD SOCIAL/i.test(c),         cat: 'ss' },
  { test: c => /^NRC\.|AEAT|HACIENDA/i.test(c),                          cat: 'hacienda' },
  { test: c => /SPOTIFY|MARKETING/i.test(c),                             cat: 'marketing' },
  { test: c => /CAJERO|RGRO\.TJTA/i.test(c),                             cat: 'retirada_efectivo' },
  { test: c => /ESCUELA|FORMACION|FORMACIÓN/i.test(c),                   cat: 'formacion' },
]

const INCOME_RULES = [
  { test: c => /VTA\.TAR\./i.test(c),   cat: 'tpv' },
  { test: c => /DEV\.COM\./i.test(c),   cat: 'comisiones_banco' },
]

function autoCategory(concepto, isIncome) {
  const rules = isIncome ? INCOME_RULES : EXPENSE_RULES
  for (const r of rules) { if (r.test(concepto)) return r.cat }
  return isIncome ? 'transferencia' : 'otros'
}

function isExcluded(concepto) {
  return EXCLUDE_CONCEPTS.some(ex => concepto.toLowerCase().includes(ex.toLowerCase()))
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
    const concepto   = cols[3]?.trim()
    const cuenta     = hasCuentaCol ? (cols[4]?.trim() || '') : ''
    const importeRaw = cols[importeIdx]?.trim()
    if (!fecha || !fecha.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) || !concepto || !importeRaw) continue
    const importe = parseAmount(importeRaw)
    if (isNaN(importe) || importe === 0) continue

    const isIncome = importe > 0
    const cat      = autoCategory(concepto, isIncome)
    const item = {
      id:       `${i}`,
      fecha,
      month:    parseMonth(fecha),
      concepto,
      cuenta,
      importe,
      category: cat,
      iva:      CATEGORY_IVA[cat] ?? 21,
      excluded: isExcluded(concepto),
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
      month:    parseMonth(fecha),
      concepto,
      importe,
      category: cat,
      iva:      CATEGORY_IVA[cat] ?? 21,
      excluded: isExcluded(concepto),
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
