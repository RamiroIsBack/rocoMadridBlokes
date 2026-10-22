// Evaluación de un plan de vacaciones (CTRL Time Off): reglas del convenio,
// cobertura, avisos y números del verano. Sin React, para poder evaluar el plan
// actual, los escenarios guardados y cada solicitud con exactamente la misma lógica.
//
// Convenio colectivo estatal de instalaciones deportivas y gimnasios (asesoría, 22/10/2026):
// - 23 días laborables por año natural.
// - 15 laborables consecutivos entre el 1 de junio y el 30 de septiembre; el resto en
//   dos bloques más, pactados. Otro reparto solo con acuerdo expreso.
// - Calendario en el primer trimestre; cada persona conoce sus fechas con 2 meses de antelación.
// - Si el club cierra en agosto puede fijar ahí el bloque de 15 días. Los días de cierre
//   que pasan de 15 no los cubre el convenio: o se pagan sin trabajar o se pactan.
import { PROF_ORDER } from '../data/staffSchedule'
import {
  VERANO_APERTURA, COMODIN_VERANO, pairConflict, simulatePlan, laborablesBetween, laborablesFrom,
  isSummer, weekdayOf, fmtShort, monthOf, diasDevengados, PARO_MESES, PARO_VERANO, isClosed,
  disponible, campDates,
} from './coverage'

export const DIAS_ANUALES     = 23
export const BLOQUE_VERANO    = 15    // laborables seguidos entre junio y septiembre
export const MAX_BLOQUES      = 3     // el de verano + dos más
export const ANTELACION_DIAS  = 61    // 2 meses
export const VENTANA_VERANO   = { from: '06-01', to: '09-30' }
// Situación actual: Sigurd fijo discontinuo; Ana no trabaja en agosto
export const HOY_PARO = { Sigurd: 'verano', Ana: 'agosto' }
export const LABORABLES_MES = 21.75
export const MES_LABEL = { 7: 'Julio', 8: 'Agosto' }
export const CIERRE_EXTRA = {
  pagados:   'Se pagan sin trabajar (no hace falta acuerdo)',
  descontar: 'Se descuentan de sus vacaciones (hace falta acuerdo)',
}
const DAY_SHORT = { Lunes: 'L', Martes: 'M', Miercoles: 'X', Jueves: 'J', Viernes: 'V' }

export const eur = n => `${Math.round(n).toLocaleString('es-ES')} €`

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysBetween(a, b) {
  const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
  return Math.round((p(b) - p(a)) / 86400000)
}

// Año que se planifica por defecto: a partir de octubre, el siguiente (su calendario
// se cierra en el primer trimestre)
export function defaultYear() {
  const now = new Date()
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()
}

// Quién no está en un mes de verano del año del plan (en paro ese mes)
export function inactivosMes(mes, ctx) {
  const iso = `${ctx.year || defaultYear()}-0${mes}-15`
  return PROF_ORDER.filter(p => !disponible(p, iso, ctx))
}

// Una solicitud aprobada cuenta como un periodo más. La pide la propia persona: es acuerdo.
export function requestToPeriod(r) {
  return {
    id: `req-${r.id}`, prof: r.person, start: r.from, n: laborablesBetween(r.from, r.to).length,
    requestId: r.id, acuerdo: true, comunicado: (r.created_at || '').slice(0, 10) || null,
  }
}

export function effectivePeriods(periods, requests = []) {
  return [...periods, ...requests.filter(r => r.status === 'aprobada').map(requestToPeriod)]
}

// Nivel de cada pareja: horario normal, julio y agosto
export function computePairLevels(keys, ctx) {
  const res = { invierno: {}, 7: {}, 8: {} }
  PROF_ORDER.forEach((a, i) => PROF_ORDER.slice(i + 1).forEach(b => {
    res.invierno[`${a}|${b}`] = pairConflict(a, b, { keys }).level
    ;[7, 8].forEach(m => {
      const inactive = inactivosMes(m, ctx)
      if (inactive.includes(a) || inactive.includes(b)) return
      res[m][`${a}|${b}`] = pairConflict(a, b, { keys, season: 'verano', inactive }).level
    })
  }))
  return res
}

export function conflictsOfDay(day, pairLevels) {
  if (day.closed) return []
  const levels = pairLevels[isSummer(day.date) ? monthOf(day.date) : 'invierno']
  const res = []
  day.out.forEach((a, i) => day.out.slice(i + 1).forEach(b => {
    const k = levels[`${a}|${b}`] || levels[`${b}|${a}`]
    if (k === 'rojo' || k === 'ambar') res.push({ a, b, level: k })
  }))
  return res
}

// Tramos de días laborables seguidos (sobre la lista ordenada de laborables del año)
function tramos(dias, yearDates) {
  const idx = new Map(yearDates.map((d, i) => [d, i]))
  const sorted = dias.filter(d => idx.has(d)).sort()
  const res = []
  sorted.forEach(d => {
    const last = res[res.length - 1]
    if (last && idx.get(d) === idx.get(last[last.length - 1]) + 1) last.push(d)
    else res.push([d])
  })
  return res
}

// Vacaciones de una persona en el año: las de sus periodos y las del cierre de la sala.
// Del cierre, los primeros 15 laborables son el bloque de verano del convenio; el resto
// según cierreExtra. No cuentan los días que no trabaja (paro) ni los de campamento.
function vacacionesPersona(p, yearDates, { offSet, ctx, cierre, cierreExtra, campSet, camp }) {
  const trabaja = d => disponible(p, d, ctx) && !(camp?.staff?.includes(p) && campSet.has(d))
  const cerrados = yearDates.filter(d => isClosed(d, cierre) && trabaja(d) && !offSet.has(d))
  const cierreConv  = cerrados.slice(0, BLOQUE_VERANO)
  const cierreExtraDias = cerrados.slice(BLOQUE_VERANO)
  const propias = yearDates.filter(d => offSet.has(d) && trabaja(d))
  const vac = [...propias, ...cierreConv, ...(cierreExtra === 'descontar' ? cierreExtraDias : [])].sort()
  return { vac, cierreConv, cierreExtraDias }
}

// state: el plan (year, paro, keys, dias, periods, cierre, cierreExtra, camp, gastosSala, ingresosSala)
// coste: coste empresa al mes por persona. requests: solicitudes (cuentan las aprobadas).
export function evaluarPlan(state, coste, requests = [], pairLevels = null) {
  const y = state.year || defaultYear()
  const { paro, keys, dias, cierre, camp, gastosSala = {}, ingresosSala = {} } = state
  const cierreExtra = state.cierreExtra || 'pagados'
  const periods = effectivePeriods(state.periods, requests)
  const ctx = { periods, paro, cierre, camp, keys, year: y }
  const levels = pairLevels || computePairLevels(keys, ctx)
  const yearDates = laborablesBetween(`${y}-01-01`, `${y}-12-31`)
  const allSim = simulatePlan(yearDates, ctx)
  const campSet = campDates(camp, cierre)
  const conflictsOf = day => conflictsOfDay(day, levels)
  const enVentana = d => d >= `${y}-${VENTANA_VERANO.from}` && d <= `${y}-${VENTANA_VERANO.to}`

  // Periodos por persona con su información de acuerdo/comunicación
  const periodosDe = p => periods.filter(x => x.prof === p && x.start && x.n > 0)
  const diasDe = x => laborablesFrom(x.start, x.n)

  const acuerdos = []   // { p, motivo }
  const antelacion = [] // periodos sin acuerdo comunicados con menos de 2 meses
  const hoy = todayISO()

  // Resumen por persona (año natural)
  const rows = PROF_ORDER.map(p => {
    const op     = paro[p] || 'no'
    const nParo  = PARO_MESES[op].length
    const mios   = periodosDe(p)
    const offSet = new Set(mios.flatMap(diasDe))
    const { vac, cierreConv, cierreExtraDias } = vacacionesPersona(p, yearDates, { offSet, ctx, cierre, cierreExtra, campSet, camp })
    const bloquesAnio  = tramos(vac, yearDates)
    const bloqueVerano = Math.max(0, ...tramos(vac.filter(enVentana), yearDates).map(t => t.length))
    const pactado = mios.some(x => x.acuerdo && diasDe(x).some(d => d.startsWith(`${y}-`)))
    const dev = diasDevengados(dias[p], nParo)

    if (nParo > PARO_MESES[HOY_PARO[p] || 'no'].length) acuerdos.push({ p, motivo: `pasar a fijo discontinuo (${PARO_VERANO[op].toLowerCase()})` })
    if (cierreExtra === 'descontar' && cierreExtraDias.length) acuerdos.push({ p, motivo: `descontar de sus vacaciones ${cierreExtraDias.length} días de cierre que pasan de ${BLOQUE_VERANO}` })
    mios.filter(x => x.acuerdo && !x.requestId && diasDe(x).some(d => d.startsWith(`${y}-`)))
      .forEach(x => acuerdos.push({ p, motivo: `periodo pactado desde el ${fmtShort(x.start)}${x.nota ? ` (${x.nota})` : ''}`, registrado: true }))
    mios.filter(x => !x.acuerdo && !x.requestId && x.comunicado && x.start >= hoy && diasDe(x).some(d => d.startsWith(`${y}-`))
      && daysBetween(x.comunicado, x.start) < ANTELACION_DIAS)
      .forEach(x => antelacion.push({ p, start: x.start, comunicado: x.comunicado }))

    return {
      p, op, disc: op === 'verano', nParo, dev, usados: vac.length, restan: dev - vac.length,
      cierreConv: cierreConv.length, cierreExtra: cierreExtraDias.length,
      bloqueVerano, bloques: bloquesAnio.length, pactado,
      ahorro: (nParo - PARO_MESES[HOY_PARO[p] || 'no'].length) * coste[p],
    }
  })

  // Avisos
  const warnings = []
  const listDates = (arr, fmt = d => fmtShort(d.date)) => `${arr.slice(0, 6).map(fmt).join(', ')}${arr.length > 6 ? '…' : ''}`
  ;[7, 8].forEach(m => {
    if (isClosed(`${y}-0${m}-15`, cierre)) return
    const profes = PROF_ORDER.filter(p => p !== COMODIN_VERANO && !inactivosMes(m, ctx).includes(p))
    if (profes.length < 2) {
      warnings.push({ lvl: 'bad', text: `${MES_LABEL[m]}: solo ${profes.length === 1 ? 'queda 1 profe' : `quedan ${profes.length} profes`} además de ${COMODIN_VERANO} (${profes.join(', ') || 'ninguno'}). Hacen falta 2 para turnarse las vacaciones.` })
    }
  })
  rows.forEach(r => {
    if (r.restan < 0) {
      warnings.push({ lvl: 'bad', text: `${r.p}: ${r.usados} días de vacaciones en ${y} y le corresponden ${r.dev}.` })
    }
    if (r.bloqueVerano < BLOQUE_VERANO) {
      const txt = `${r.p}: sin un bloque de ${BLOQUE_VERANO} días seguidos entre junio y septiembre (el más largo, ${r.bloqueVerano})`
      if (r.pactado) warnings.push({ lvl: 'info', text: `${txt}; tiene un periodo pactado.` })
      else if (r.nParo) warnings.push({ lvl: 'warn', text: `${txt}. Está en paro parte del verano: confirmar con la asesoría si le aplica.` })
      else warnings.push({ lvl: 'bad', text: `${txt}. Solo con acuerdo expreso.` })
    }
    if (r.bloques > MAX_BLOQUES && !r.pactado) {
      warnings.push({ lvl: 'warn', text: `${r.p}: ${r.bloques} bloques de vacaciones; el convenio prevé el de verano y dos más. Más, solo con acuerdo.` })
    }
  })
  antelacion.forEach(a => warnings.push({ lvl: 'warn', text: `${a.p}: periodo desde el ${fmtShort(a.start)} comunicado el ${fmtShort(a.comunicado)}, con menos de 2 meses de antelación. Solo vale con acuerdo expreso.` }))
  const ignorados = periods.filter(x => x.prof && x.start && x.n > 0)
    .flatMap(x => diasDe(x).filter(d => d.startsWith(`${y}-`) && isSummer(d) && !disponible(x.prof, d, ctx)).map(d => x.prof))
  ;[...new Set(ignorados)].forEach(p => warnings.push({ lvl: 'warn', text: `${p}: ${ignorados.filter(x => x === p).length} días de vacaciones en un mes de verano que no trabaja; no cuentan.` }))
  if (camp.activo) {
    if (!campSet.size) warnings.push({ lvl: 'warn', text: 'El campamento solo puede ir en meses con la sala cerrada: cambia el modo de verano o la fecha.' })
    if (!camp.staff.length) warnings.push({ lvl: 'bad', text: 'El campamento no tiene a nadie asignado.' })
    camp.staff.forEach(p => {
      const fuera = [...campSet].filter(d => !disponible(p, d, ctx))
      if (fuera.length) warnings.push({ lvl: 'bad', text: `${p} lleva el campamento pero no trabaja ${fuera.length} de esos días.` })
    })
  }
  const abiertoVer = allSim.filter(d => isSummer(d.date) && !d.closed)
  const sinAbrirVer = abiertoVer.filter(d => d.sinAbrir)
  if (sinAbrirVer.length) warnings.push({ lvl: 'bad', text: `Verano: ${sinAbrirVer.length} días sin nadie con llave para abrir a las ${VERANO_APERTURA} (${listDates(sinAbrirVer)}).` })
  const sinProfeVer = abiertoVer.filter(d => d.lost.length)
  if (sinProfeVer.length) warnings.push({ lvl: 'bad', text: `Verano: ${sinProfeVer.length} días con clases sin profe (${listDates(sinProfeVer)}).` })
  const diasComodin = abiertoVer.filter(d => d.comodin > 0)
  if (diasComodin.length) warnings.push({ lvl: 'warn', text: `Verano: ${diasComodin.length} días en los que ${COMODIN_VERANO} deja recepción para dar clase (${diasComodin.reduce((n, d) => n + d.comodin, 0)} clases).` })
  const sinCerrar = allSim.filter(d => d.sinCerrar && d.out.length)
  if (sinCerrar.length) warnings.push({ lvl: 'warn', text: `${sinCerrar.length} días sin nadie con llave para cerrar (${listDates(sinCerrar, d => `${DAY_SHORT[weekdayOf(d.date)]} ${fmtShort(d.date)}`)}). Hay que alargar el turno de alguien.` })
  const choques = allSim.flatMap(d => conflictsOf(d).filter(c => c.level === 'rojo').map(c => ({ ...c, date: d.date })))
  const choqueTxt = [...new Set(choques.map(c => `${c.a} + ${c.b}`))]
  if (choqueTxt.length) warnings.push({ lvl: 'bad', text: `Coinciden parejas que no deberían: ${choqueTxt.join(', ')} (${choques.length} días).` })

  // Números del verano
  const mesesCerradosList = [7, 8].filter(m => isClosed(`${y}-0${m}-15`, cierre))
  const campMes = m => (camp.activo ? Math.round([...campSet].filter(d => monthOf(d) === m).length / 5) * camp.plazas * camp.precio : 0)
  const personalMes = m => PROF_ORDER.reduce((s, p) =>
    s + ((PARO_MESES[paro[p] || 'no'].includes(m) ? 1 : 0) - (PARO_MESES[HOY_PARO[p] || 'no'].includes(m) ? 1 : 0)) * coste[p], 0)
  const eco = {
    personal: rows.reduce((s, r) => s + r.ahorro, 0),
    sala:     mesesCerradosList.reduce((n, m) => n + (gastosSala[m] || 0) - (ingresosSala[m] || 0), 0),
    camp:     campMes(7) + campMes(8),
    // Días de cierre que pasan de 15 y se pagan sin trabajar (informativo: se pagarían igual)
    ociosos:  cierreExtra === 'pagados'
      ? rows.reduce((s, r) => s + r.cierreExtra * coste[r.p] / LABORABLES_MES, 0) : 0,
    diasOciosos: cierreExtra === 'pagados' ? rows.reduce((s, r) => s + r.cierreExtra, 0) : 0,
    personalMes, campMes,
  }
  eco.balance = eco.personal + eco.sala + eco.camp

  const kpi = {
    sinAbrir:    allSim.filter(d => d.sinAbrir && d.out.length).length,
    perdidas:    allSim.filter(d => !isSummer(d.date)).reduce((n, d) => n + d.lost.length, 0),
    perdVer:     abiertoVer.reduce((n, d) => n + d.lost.length, 0),
    sinAbrirVer: sinAbrirVer.length,
    comodinDias: diasComodin.length,
    choques:     choques.length,
    graves:      warnings.filter(w => w.lvl === 'bad').length,
    acuerdos:    [...new Set(acuerdos.filter(a => !a.registrado).map(a => a.p))],
  }

  return {
    y, ctx, periods, pairLevels: levels, conflictsOf, yearDates, allSim, rows, warnings, acuerdos, antelacion,
    abiertoVer, sinAbrirVer, diasComodin, campSet, mesesCerradosList, eco, kpi,
  }
}

// Lo que cambia una solicitud: avisos y choques nuevos al aprobarla
export function impactoSolicitud(state, coste, requests, req) {
  const base = evaluarPlan(state, coste, requests.filter(r => r.id !== req.id))
  const con  = evaluarPlan(state, coste, [...requests.filter(r => r.id !== req.id), { ...req, status: 'aprobada' }], base.pairLevels)
  const nuevos = con.warnings.filter(w => w.lvl !== 'info' && !base.warnings.some(b => b.text === w.text))
  const dias = laborablesBetween(req.from, req.to)
  const choques = con.allSim
    .filter(d => dias.includes(d.date))
    .flatMap(d => conflictsOfDay(d, con.pairLevels).filter(c => c.a === req.person || c.b === req.person).map(c => ({ ...c, date: d.date })))
  const row = con.rows.find(r => r.p === req.person)
  const otroAnio = !req.from.startsWith(`${con.y}-`) && !req.to.startsWith(`${con.y}-`)
  return {
    dias: dias.length,
    nuevos,
    choques,
    restan: otroAnio ? null : row?.restan,
    otroAnio,
    ok: !nuevos.some(w => w.lvl === 'bad') && !choques.some(c => c.level === 'rojo'),
  }
}

// Previsión de julio y agosto del año del plan: media histórica del mes ajustada
// por el plan (paro frente a hoy, cierre, campamento).
export function previsionVerano(ev, state, historico) {
  const res = {}
  ;[7, 8].forEach(m => {
    const meses = historico.filter(h => Number(h.month.slice(5)) === m)
    const media = k => {
      const v = meses.map(h => h[k]).filter(x => x != null)
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
    }
    const ventasMed = media('ventas') ?? 0
    const costesMed = media('costes') ?? 0
    const cerrado = ev.mesesCerradosList.includes(m)
    const ahorroPersonal = ev.eco.personalMes(m)
    const ahorroSala = cerrado ? ((state.gastosSala || {})[m] || media('ahorrable') || 0) : 0
    const ventas = (cerrado ? 0 : ventasMed) + ev.eco.campMes(m)
    const costes = costesMed - ahorroPersonal - ahorroSala
    res[m] = {
      historico: meses, ventasMed, costesMed, resultadoMed: ventasMed - costesMed,
      cerrado, ahorroPersonal, ahorroSala, camp: ev.eco.campMes(m), ventas, costes, resultado: ventas - costes,
    }
  })
  return res
}
