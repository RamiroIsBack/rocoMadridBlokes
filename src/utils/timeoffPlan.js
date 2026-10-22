// Evaluación de un plan de vacaciones (CTRL Time Off): cobertura, avisos y
// números del verano. Sin React, para poder evaluar el plan actual, los
// escenarios guardados y cada solicitud con exactamente la misma lógica.
import { PROF_ORDER } from '../data/staffSchedule'
import {
  VERANO_APERTURA, COMODIN_VERANO, pairConflict, simulatePlan, laborablesBetween, expandPeriods,
  isSummer, weekdayOf, fmtShort, monthOf, diasDevengados, minimoVerano, PARO_MESES, isClosed,
  disponible, campDates, vacationDates,
} from './coverage'

export const DIAS_ANUALES = 23
// Situación actual: Sigurd fijo discontinuo; Ana no trabaja en agosto
export const HOY_PARO = { Sigurd: 'verano', Ana: 'agosto' }
export const LABORABLES_MES = 21.75
export const MES_LABEL = { 7: 'Julio', 8: 'Agosto' }
const DAY_SHORT = { Lunes: 'L', Martes: 'M', Miercoles: 'X', Jueves: 'J', Viernes: 'V' }

export const eur = n => `${Math.round(n).toLocaleString('es-ES')} €`

// Temporada sep→ago: la Navidad de este año y el verano del siguiente
export function temporada() {
  const now = new Date()
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

export function temporadaRange(y = temporada()) {
  return { from: `${y}-09-01`, to: `${y + 1}-08-31` }
}

// Quién no está en un mes de verano (en paro ese mes)
export function inactivosMes(mes, ctx) {
  const iso = `${temporada() + 1}-0${mes}-15`
  return PROF_ORDER.filter(p => !disponible(p, iso, ctx))
}

// Una solicitud aprobada cuenta como un periodo de vacaciones más
export function requestToPeriod(r) {
  return { id: `req-${r.id}`, prof: r.person, start: r.from, n: laborablesBetween(r.from, r.to).length, requestId: r.id }
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

// state: el plan (paro, keys, dias, periods, cierre, camp, gastosSala, ingresosSala)
// coste: coste empresa al mes por persona. requests: solicitudes (cuentan las aprobadas).
export function evaluarPlan(state, coste, requests = [], pairLevels = null) {
  const y = temporada()
  const { paro, keys, dias, cierre, camp, gastosSala = {}, ingresosSala = {} } = state
  const periods = effectivePeriods(state.periods, requests)
  const ctx = { periods, paro, cierre, camp, keys }
  const levels = pairLevels || computePairLevels(keys, ctx)
  const { from, to } = temporadaRange(y)
  const temporadaDates = laborablesBetween(from, to)
  const allSim = simulatePlan(temporadaDates, ctx)
  const off = expandPeriods(periods)
  const campSet = campDates(camp, cierre)
  const conflictsOf = day => conflictsOfDay(day, levels)

  // Resumen por persona (toda la temporada)
  const rows = PROF_ORDER.map(p => {
    const op     = paro[p] || 'no'
    const nParo  = PARO_MESES[op].length
    const vac    = vacationDates(p, temporadaDates, ctx)
    const verano = vac.filter(isSummer).length
    const dev    = diasDevengados(dias[p], nParo)
    const cierreDias = vac.filter(d => isClosed(d, cierre)).length
    return {
      p, op, disc: op === 'verano', dev, usados: vac.length, verano, cierreDias,
      min: minimoVerano(dias[p], nParo), restan: dev - vac.length,
      ahorro: (nParo - PARO_MESES[HOY_PARO[p] || 'no'].length) * coste[p],
    }
  })

  // Avisos
  const warnings = []
  const listDates = (arr, fmt = d => fmtShort(d.date)) => `${arr.slice(0, 6).map(fmt).join(', ')}${arr.length > 6 ? '…' : ''}`
  ;[7, 8].forEach(m => {
    if (isClosed(`${y + 1}-0${m}-15`, cierre)) return
    const profes = PROF_ORDER.filter(p => p !== COMODIN_VERANO && !inactivosMes(m, ctx).includes(p))
    if (profes.length < 2) {
      warnings.push({ lvl: 'bad', text: `${MES_LABEL[m]}: solo ${profes.length === 1 ? 'queda 1 profe' : `quedan ${profes.length} profes`} además de ${COMODIN_VERANO} (${profes.join(', ') || 'ninguno'}). Hacen falta 2 para turnarse las vacaciones.` })
    }
  })
  rows.forEach(r => {
    if (!r.disc && r.verano < r.min) warnings.push({ lvl: 'warn', text: `${r.p}: ${r.verano} de ${r.min} días obligatorios en julio y agosto.` })
    if (r.restan < 0 && r.cierreDias > 0) {
      warnings.push({ lvl: 'bad', text: `${r.p}: el cierre le da ${r.cierreDias} días y le tocan ${r.dev}. Sobran ${-r.restan} días pagados sin trabajar (≈ ${eur(-r.restan * coste[r.p] / LABORABLES_MES)}), salvo que pase a fijo discontinuo.` })
    } else if (r.restan < 0) {
      warnings.push({ lvl: 'bad', text: `${r.p}: planifica ${r.usados} días y le corresponden ${r.dev}.` })
    }
    const ignorados = [...(off[r.p] || [])].filter(d => isSummer(d) && !disponible(r.p, d, ctx))
    if (ignorados.length) warnings.push({ lvl: 'warn', text: `${r.p}: ${ignorados.length} días pedidos en verano en un mes que no trabaja; no cuentan.` })
  })
  if (camp.activo) {
    if (!campSet.size) warnings.push({ lvl: 'warn', text: 'El campamento solo puede ir en meses con la sala cerrada: cambia el modo de verano o la fecha.' })
    if (!camp.staff.length) warnings.push({ lvl: 'bad', text: 'El campamento no tiene a nadie asignado.' })
    camp.staff.forEach(p => {
      const fuera = [...campSet].filter(d => !disponible(p, d, ctx))
      if (fuera.length) warnings.push({ lvl: 'bad', text: `${p} lleva el campamento pero no trabaja ${fuera.length} de esos días.` })
      const choca = [...campSet].filter(d => off[p]?.has(d))
      if (choca.length) warnings.push({ lvl: 'warn', text: `${p} tiene vacaciones pedidas en ${choca.length} días de campamento.` })
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
  const mesesCerradosList = [7, 8].filter(m => isClosed(`${y + 1}-0${m}-15`, cierre))
  const campMes = m => (camp.activo ? Math.round([...campSet].filter(d => monthOf(d) === m).length / 5) * camp.plazas * camp.precio : 0)
  const personalMes = m => PROF_ORDER.reduce((s, p) =>
    s + ((PARO_MESES[paro[p] || 'no'].includes(m) ? 1 : 0) - (PARO_MESES[HOY_PARO[p] || 'no'].includes(m) ? 1 : 0)) * coste[p], 0)
  const eco = {
    personal: rows.reduce((s, r) => s + r.ahorro, 0),
    sala:     mesesCerradosList.reduce((n, m) => n + (gastosSala[m] || 0) - (ingresosSala[m] || 0), 0),
    camp:     campMes(7) + campMes(8),
    ociosos:  rows.filter(r => r.restan < 0 && r.cierreDias > 0)
                  .reduce((s, r) => s + -r.restan * coste[r.p] / LABORABLES_MES, 0),
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
  }

  return {
    y, ctx, periods, pairLevels: levels, conflictsOf, temporadaDates, allSim, rows, warnings,
    abiertoVer, sinAbrirVer, diasComodin, campSet, mesesCerradosList, eco, kpi,
  }
}

// Lo que cambia una solicitud: avisos graves y choques nuevos al aprobarla
export function impactoSolicitud(state, coste, requests, req) {
  const base = evaluarPlan(state, coste, requests.filter(r => r.id !== req.id))
  const con  = evaluarPlan(state, coste, [...requests.filter(r => r.id !== req.id), { ...req, status: 'aprobada' }], base.pairLevels)
  const nuevos = con.warnings.filter(w => !base.warnings.some(b => b.text === w.text))
  const dias = laborablesBetween(req.from, req.to)
  const choques = con.allSim
    .filter(d => dias.includes(d.date))
    .flatMap(d => conflictsOfDay(d, con.pairLevels).filter(c => c.a === req.person || c.b === req.person).map(c => ({ ...c, date: d.date })))
  const row = con.rows.find(r => r.p === req.person)
  return {
    dias: dias.length,
    nuevos,
    choques,
    restan: row?.restan,
    sinCubrir: con.kpi.perdidas + con.kpi.perdVer - (base.kpi.perdidas + base.kpi.perdVer),
    ok: !nuevos.some(w => w.lvl === 'bad') && !choques.some(c => c.level === 'rojo'),
  }
}

// Previsión de julio y agosto del próximo verano con el plan: media histórica
// del mes ajustada por el plan (paro frente a hoy, cierre, campamento).
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
