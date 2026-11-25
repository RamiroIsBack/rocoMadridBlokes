import * as XLSX from 'xlsx'

// ── Auto-exclusion: intra-entity transfers + inter-company payments ───
// These cancel out in a consolidated view of both companies.
// They are auto-marked excluded so the "Sin internos" toggle hides them,
// but remain visible individually (IVA, per-entity analysis).
const EXCLUDE_CONCEPTS = [
  'transferencia entre cuentas',
  // "Uso de Rocódromo" (Club → Rocoteca) YA NO se auto-excluye aquí: en la vista de una sola
  // entidad es dinero real (gasto del Club / ingreso de la Rocoteca), solo se cancela en la
  // vista combinada — eso lo decide el backend según la entidad pedida (NOTAS_PARA_CODE_gastos_banco.md,
  // 15/11 10:55).
  // Préstamos: nunca son ingreso ni gasto (NOTAS_PARA_CODE_gastos_banco.md, 15/11 09:18 punto 1
  // — el préstamo de 400€ de septiembre se contaba como ingreso).
  'prestamo',
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
  // Ramiro, 15/11 09:25 (NOTAS_PARA_CODE_gastos_banco.md): pagos a voluntarios y a Sigurd por
  // sus gastos/transporte — es gasto de PERSONAL (va con Nóminas), no material.
  gastos_voluntarios:'Personal · Gastos de voluntarios/colaboradores',
  // Nunca es ingreso ni gasto (NOTAS_PARA_CODE_gastos_banco.md, 15/11 09:18 punto 1): se resta
  // de los KPIs igual que "Transferencia entre cuentas".
  prestamos:         'Préstamos (fuera de ingresos/gastos)',
  // Ramiro, 15/11 10:55: en la vista Club es un gasto real (deja de pagarse desde jul-26).
  uso_rocodromo:     'Pago a Rocoteca por uso del rocódromo (hasta jul-26)',
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
  gastos_voluntarios:0,
  prestamos:         0,
  uso_rocodromo:     0,
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
  // Ramiro, 15/11 09:25: pagos a voluntarios/Sigurd por gastos y transporte — antes de
  // "material" (si no, "CAROLINA MATERIALES..." se queda en material por el patrón genérico).
  { test: c => /^(CAROLINA|ANA|ISA|RAFA)\s+(MATERIALES|VARIOS)|^TRABAJOS\s+SIGURD/i.test(c), cat: 'gastos_voluntarios' },
  { test: c => /\bPRESTAMO\b|\bPRÉSTAMO\b/i.test(c),                                   cat: 'prestamos' },
  { test: c => /ROCODROMO|ROCÓDROMO/i.test(c),                                        cat: 'uso_rocodromo' },
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

// ── xlsx de reconciliación bancaria (Ramiro, 25/11) ────────────────────
// Excel ya revisado movimiento a movimiento contra los CSV del banco
// (datos_privados/Movimientos_bancarios_*.xlsx — nunca se sube al repo público), con una hoja
// "Resumen" (solo para comprobar a ojo) y una hoja por cuenta: "Fecha", "Fecha valor", "Mes",
// "Concepto", "Importe", "Saldo". A diferencia del CSV, el mes de cada fila es el de la columna
// "Mes" (decidido a mano, verificado contra el Resumen), no el que saldría de recalcular desde
// la fecha valor.
const MESES_ES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

// Nombre de hoja → entidad. Las dos cuentas de la Rocoteca (Laboral Kutxa + BBVA) son la misma
// entidad a efectos de Gastos, igual que al subir sus CSV por separado.
const XLSX_SHEET_ENTITY = {
  'Club - Laboral Kutxa':     'club',
  'Rocoteca - Laboral Kutxa': 'rocoteca',
  'Rocoteca - BBVA':          'rocoteca',
}

export function isExpensesXLSXFile(fileName) {
  return /\.xlsx$/i.test(fileName || '')
}

// 25/11 (Ramiro, hoja Rocoteca del xlsx): algunas celdas vienen con las tildes mal codificadas
// ("Uso rocÃ³dromo" en vez de "Uso rocódromo") — UTF-8 reinterpretado como Latin-1 al guardar el
// Excel en algún momento de su historial. Si se detecta el patrón, se decodifica de vuelta; si
// el texto no es en realidad mojibake (una "Ã" suelta que es de verdad), se deja igual.
export function arreglaMojibake(s) {
  if (typeof s !== 'string' || !/[ÃÂ]/.test(s)) return s
  const codes = [...s].map(c => c.codePointAt(0))
  if (codes.some(c => c > 255)) return s
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(codes))
  } catch {
    return s
  }
}

function fmtFechaDDMMYYYY(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return ''
  // 25/11 (Ramiro, probado en vivo: "04/01/2026" en vez de "05/01/2026"): con cellDates:true,
  // SheetJS construye el Date con el constructor LOCAL (medianoche hora del navegador), no en
  // UTC — usar getUTC* en una zona por delante de UTC (Madrid) resta un día. Los getters
  // locales (getDate/getMonth/getFullYear) son los que de verdad devuelven el día de la celda.
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

// Mismo formato que ya trae el CSV del banco (punto de los miles, coma decimal) — tiene que
// coincidir con el texto que ya está guardado para que blokes_exp_item_key() (fecha|concepto|
// importe|saldo) case bien con movimientos ya existentes y no se dupliquen.
function fmtSaldoEs(n) {
  if (n === '' || n == null || isNaN(n)) return ''
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseExpensesXLSX(arrayBuffer, learned = null) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const ingresos = [], costes = []
  let id = 0
  for (const sheetName of wb.SheetNames) {
    const entity = XLSX_SHEET_ENTITY[sheetName]
    if (!entity) continue
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const fechaDate  = row[0]
      const fecha      = fmtFechaDDMMYYYY(fechaDate)
      const fechaValor = fmtFechaDDMMYYYY(row[1]) || fecha
      const mesTxt     = String(row[2] || '').trim().toLowerCase()
      // 25/11 (Ramiro, probado en vivo): espacios dobles en el concepto del xlsx no casaban con
      // el texto ya guardado (solo recortado al extremo, sin colapsar espacios de en medio).
      const concepto   = arreglaMojibake(String(row[3] || '').trim().replace(/\s+/g, ' '))
      // Redondeado a 2 decimales: Excel puede guardar el float con ruido (1.0799999999999998)
      // que no cuadraría con el importe ya guardado al compararlo en PHP.
      const importeRaw = Number(row[4])
      const importe    = isNaN(importeRaw) ? NaN : Math.round(importeRaw * 100) / 100
      const saldo      = fmtSaldoEs(row[5])
      if (!fecha || !concepto || !importe || isNaN(importe)) continue
      const mesNum = MESES_ES[mesTxt]
      const anio   = fechaDate instanceof Date ? fechaDate.getFullYear() : null
      const month  = (mesNum && anio) ? `${anio}-${String(mesNum).padStart(2, '0')}` : (parseMonth(fechaValor) || parseMonth(fecha))
      const isIncome = importe > 0
      const cat = autoCategory(concepto, isIncome, learned)
      const item = {
        id: `xlsx-${entity}-${id++}`,
        fecha, fechaValor, month, concepto,
        cuenta: '', // el Excel no trae número de cuenta — la hoja ya dice la entidad
        entityFixed: entity,
        importe, saldo,
        category: cat, ruleCat: cat,
        iva: CATEGORY_IVA[cat] ?? 21,
        excluded: isExcluded(concepto),
        needsReview: needsReview(concepto),
        section: isIncome ? 'ingresos' : 'costes',
      }
      if (isIncome) ingresos.push(item)
      else costes.push(item)
    }
  }
  return { ingresos, costes }
}
