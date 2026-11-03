// Presupuesto anual de pagos frente a los movimientos del banco.
// Convención de signos (igual que el Excel y el banco): negativo = pago, positivo = cobro.
// Diferencia = real − presupuesto  →  positiva = a favor (ahorro), negativa = en contra (sobrecoste).

import { readFirstSheet } from './xlsxReader'

// Margen para considerar una partida "cumplida": 5 % del presupuesto, mínimo 5 €.
export const TOLERANCE_PCT = 0.05
export const TOLERANCE_MIN = 5

const MONTH_HEADERS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Nombre de la partida del Excel → categoría del banco. Gana la primera que encaje.
const LINE_RULES = [
  [/socio/,                       'socios'],
  [/nomina/,                      'nominas'],
  [/seguridad social/,            'ss'],
  [/seguridad laboral/,           'seguridad_laboral'],
  [/\b303\b|\biva\b/,             'iva_303'],
  [/\b115\b/,                     'mod_115'],
  [/\b111\b/,                     'mod_111'],
  [/alquiler/,                    'alquiler'],
  [/gestor|asesor/,               'asesoria'],
  [/gato/,                        'gatos'],
  [/iberdrola|electric|\bluz\b/,  'electricidad'],
  [/tarjeta|visa/,                'tarjeta'],
  [/comunidad/,                   'comunidad'],
  [/dominio/,                     'dominio'],
  [/web/,                         'web'],
  [/bebida|\bbar\b|coca/,         'bar'],
  [/eurofer/,                     'eurofer'],
  [/comision/,                    'comisiones_banco'],
  [/agua/,                        'agua'],
  [/digi|telefon|internet|telecom/, 'telecomunicaciones'],
  [/seguro/,                      'seguro_rc'],
  [/spotify|marketing/,           'marketing'],
  [/residuo|basura/,              'tasa_residuos'],
  [/inventario|material|presas/,  'material'],
  [/evento/,                      'eventos'],
  [/formacion/,                   'formacion'],
  [/notari/,                      'notaria'],
  [/mantenimiento|mantenmiento/,  'mantenimiento'],
  [/\bgas\b/,                     'gas'],
]

export function guessCategory(name) {
  const n = norm(name)
  for (const [re, cat] of LINE_RULES) if (re.test(n)) return cat
  return 'otros'
}

// Lee el Excel (o CSV con ;) del presupuesto. Espera una fila de cabecera con
// los meses (ene…dic) y una fila por partida. Ignora subtotales y totales.
export async function parseBudgetFile(file) {
  let rows
  if (/\.csv$|\.txt$/i.test(file.name)) {
    const text = (await file.text()).replace(/^﻿/, '')
    rows = text.split(/\r?\n/).map(l => l.split(';').map(c => {
      const t = c.trim()
      const num = Number(t.replace(/\./g, '').replace(',', '.'))
      return t !== '' && !isNaN(num) ? num : t
    }))
  } else {
    rows = await readFirstSheet(file)
  }

  const headerIdx = rows.findIndex(r => MONTH_HEADERS.every(m => r.some(c => norm(c).startsWith(m))))
  if (headerIdx < 0) throw new Error('No encuentro la fila de meses (ene, feb, … dic) en el archivo.')
  const header   = rows[headerIdx].map(norm)
  const monthCol = MONTH_HEADERS.map(m => header.findIndex(c => c.startsWith(m)))
  const nameCol  = 0
  const noteCol  = header.findIndex(c => c.startsWith('explica') || c.startsWith('nota') || c.startsWith('observ'))

  const lines = []
  for (const row of rows.slice(headerIdx + 1)) {
    const name = String(row[nameCol] ?? '').trim()
    if (!name || /total/i.test(name)) continue
    const months = monthCol.map(ci => {
      const v = row[ci]
      return typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : 0
    })
    lines.push({
      name,
      category: guessCategory(name),
      note:     noteCol >= 0 ? String(row[noteCol] ?? '').trim() : '',
      months,
    })
  }
  if (!lines.length) throw new Error('No hay partidas debajo de la fila de meses.')
  return lines
}

// Estado de una partida frente a lo disponible (presupuesto + arrastre).
// Lo que falta por gastar (o por cobrar) no es ahorro: pasa al mes siguiente.
// Solo es ahorro al cierre del año (isFinal) o si se cobra más de lo previsto.
export function statusOf(target, real, hasData, isFinal = false) {
  if (!hasData) return 'sin-datos'
  if (Math.abs(target) < 0.01) {
    if (Math.abs(real) < 0.01) return null
    return real < 0 ? 'imprevisto' : 'ahorro'
  }
  const remaining = target - real
  const pending   = Math.sign(remaining) === Math.sign(target)
  const tol = Math.max(Math.abs(target) * TOLERANCE_PCT, TOLERANCE_MIN)
  if (Math.abs(real) < 0.01) return isFinal ? 'ahorro' : 'sin-movimiento'
  if (Math.abs(remaining) <= tol) return 'cumplido'
  if (pending) return isFinal ? 'ahorro' : 'arrastra'
  return target < 0 ? 'sobrecoste' : 'ahorro'
}

export const STATUS_LABELS = {
  'cumplido':       { icon: '✅', label: 'Cumplido' },
  'ahorro':         { icon: '🟢', label: 'Ahorro' },
  'arrastra':       { icon: '⏩', label: 'Sobra · pasa al mes siguiente' },
  'sobrecoste':     { icon: '🔴', label: 'Sobrecoste' },
  'imprevisto':     { icon: '⚠️', label: 'Imprevisto' },
  'sin-movimiento': { icon: '⏳', label: 'Sin movimiento · pasa al mes siguiente' },
  'sin-datos':      { icon: '—',  label: 'Sin datos del banco' },
}

// Importe con signo de un movimiento (por si algún extracto antiguo trae los gastos en positivo).
export const signedAmount = item => item.section === 'ingresos' ? Math.abs(item.importe) : -Math.abs(item.importe)

// Agrupa presupuesto y movimientos por categoría y mes.
// Devuelve { cats: { [cat]: { budget: [12], real: [12], lines: [nombres], items: [[...] x12] } }, monthsLoaded: Set(0..11) }
export function buildComparison(budget, items, monthsLoaded, year) {
  const cats = {}
  const ensure = cat => (cats[cat] ||= {
    budget: Array(12).fill(0), real: Array(12).fill(0), lines: [], items: Array.from({ length: 12 }, () => []),
  })

  for (const line of budget?.lines || []) {
    const c = ensure(line.category)
    c.lines.push(line.name)
    line.months.forEach((v, i) => { c.budget[i] += Number(v) || 0 })
  }
  for (const item of items) {
    const [y, m] = item.month.split('-').map(Number)
    if (y !== year) continue
    const c = ensure(item.category)
    c.real[m - 1] += signedAmount(item)
    c.items[m - 1].push(item)
  }
  const loaded = new Set(monthsLoaded.filter(m => m.startsWith(`${year}-`)).map(m => Number(m.slice(5)) - 1))
  for (const c of Object.values(cats)) applyCarry(c, loaded)
  return { cats, loaded }
}

// Arrastre: lo presupuestado que no se gastó (o no se cobró) pasa al mes siguiente.
//   carry[i]  = lo que llega arrastrado al mes i
//   target[i] = presupuesto del mes + arrastre = lo disponible ese mes
// Si se gasta menos de lo disponible, la diferencia pasa al mes siguiente. Si se gasta más,
// el exceso es sobrecoste de ese mes y no se resta de los siguientes.
// Un mes sin extracto del banco no consume ni suma: deja pasar el arrastre tal cual.
function applyCarry(c, loaded) {
  c.carry  = Array(12).fill(0)
  c.target = Array(12).fill(0)
  let carry = 0
  for (let i = 0; i < 12; i++) {
    c.carry[i]  = round2(carry)
    c.target[i] = round2(c.budget[i] + carry)
    if (!loaded.has(i)) continue
    const remaining = c.target[i] - c.real[i]
    // Solo pasa lo pendiente en el mismo sentido que lo previsto (pago pendiente o cobro pendiente)
    carry = Math.abs(c.target[i]) > 0.005 && Math.sign(remaining) === Math.sign(c.target[i]) ? remaining : 0
  }
  // Lo que sale del último mes con extracto (para "pasa al mes siguiente")
  c.carryOut = Array.from({ length: 12 }, (_, i) => {
    if (!loaded.has(i)) return 0
    const remaining = c.target[i] - c.real[i]
    return Math.abs(c.target[i]) > 0.005 && Math.sign(remaining) === Math.sign(c.target[i]) ? round2(remaining) : 0
  })
}

export const sum = arr => arr.reduce((s, v) => s + v, 0)
export const round2 = v => Math.round(v * 100) / 100
