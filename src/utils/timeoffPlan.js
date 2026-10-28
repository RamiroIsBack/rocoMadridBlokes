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
import { PROF_ORDER, DAYS, BASE, SALA, DAY_LABEL } from '../data/staffSchedule'
import {
  VERANO_APERTURA, COMODIN_VERANO, pairConflict, simulatePlan, laborablesBetween, laborablesFrom,
  isSummer, weekdayOf, fmtShort, monthOf, diasDevengados, PARO_MESES, PARO_VERANO, isClosed,
  disponible, campDates, normalizeCamp, expandPeriods,
} from './coverage'
import { cuentasCamp, JORNADA_MAX } from './campamento'

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

// Días de la semana que trabaja cada persona con el horario normal (el de verano se rehace)
export function diasTrabajo(p) {
  return DAYS.filter(d => (BASE[p]?.[d] || []).length > 0)
}

// Art. 34: el cómputo de inicio no puede caer en festivo ni en día de descanso de la persona.
// En julio y agosto no se comprueba (el horario de verano se rehace cada año).
export function empiezaEnDescanso(p, start) {
  if (!start || isSummer(start)) return false
  const wd = weekdayOf(start)
  return !wd || !laborablesBetween(start, start).length || !diasTrabajo(p).includes(wd)
}

// Quién no está en un mes de verano del año del plan (en paro ese mes)
export function inactivosMes(mes, ctx) {
  const iso = `${ctx.year || defaultYear()}-0${mes}-15`
  return PROF_ORDER.filter(p => !disponible(p, iso, ctx))
}

// Una solicitud aprobada cuenta como un periodo más. Como la pide la propia persona, no
// necesita los 2 meses de antelación (se salta por requestId); pero no la da por «pactada»:
// pedir unos días no exime del bloque de 15 en verano.
export function requestToPeriod(r) {
  return {
    id: `req-${r.id}`, prof: r.person, start: r.from, n: laborablesBetween(r.from, r.to).length,
    requestId: r.id, acuerdo: false, comunicado: (r.created_at || '').slice(0, 10) || null,
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
// según cierreExtra. No cuentan los días que no trabaja (paro); los de cierre en que lleva
// el campamento tampoco son vacaciones.
function vacacionesPersona(p, yearDates, { offSet, ctx, cierre, cierreExtra, campSet, camp }) {
  const disp = d => disponible(p, d, ctx)
  const enCamp = d => camp?.staff?.includes(p) && campSet.has(d)
  const cerrados = yearDates.filter(d => isClosed(d, cierre) && disp(d) && !enCamp(d) && !offSet.has(d))
  // El bloque de 15 del convenio, del primer tramo seguido que llegue (el campamento puede
  // partir el cierre en trozos); si ninguno llega, los primeros días de cierre
  const largo = tramos(cerrados, yearDates).find(t => t.length >= BLOQUE_VERANO)
  const cierreConv = largo ? largo.slice(0, BLOQUE_VERANO) : cerrados.slice(0, BLOQUE_VERANO)
  const convSet = new Set(cierreConv)
  const cierreExtraDias = cerrados.filter(d => !convSet.has(d))
  const propias = yearDates.filter(d => offSet.has(d) && disp(d))
  const vac = [...propias, ...cierreConv, ...(cierreExtra === 'descontar' ? cierreExtraDias : [])].sort()
  return { vac, cierreConv, cierreExtraDias }
}

// state: el plan (year, paro, keys, dias, periods, cierre, cierreExtra, camp, gastosSala, ingresosSala)
// coste: coste empresa al mes por persona. requests: solicitudes (cuentan las aprobadas).
export function evaluarPlan(state, coste, requests = [], pairLevels = null) {
  const y = state.year || defaultYear()
  const { paro, keys, dias, cierre, gastosSala = {}, ingresosSala = {} } = state
  const camp = normalizeCamp(state.camp)
  const cierreExtra = state.cierreExtra || 'pagados'
  const periods = effectivePeriods(state.periods, requests)
  const ctx = { periods, paro, cierre, camp, keys, year: y }
  const levels = pairLevels || computePairLevels(keys, ctx)
  const yearDates = laborablesBetween(`${y}-01-01`, `${y}-12-31`)
  const allSim = simulatePlan(yearDates, ctx)
  const campSet = campDates(camp, y)
  const conflictsOf = day => conflictsOfDay(day, levels)
  const enVentana = d => d >= `${y}-${VENTANA_VERANO.from}` && d <= `${y}-${VENTANA_VERANO.to}`

  // Periodos por persona con su información de acuerdo/comunicación
  const periodosDe = p => periods.filter(x => x.prof === p && x.start && x.n > 0)
  const diasDe = x => laborablesFrom(x.start, x.n)

  const acuerdos = []   // { p, motivo }
  const antelacion = [] // periodos sin acuerdo comunicados con menos de 2 meses
  const descanso = []   // periodos que empiezan en festivo o en día de descanso de la persona
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
    const enAnio = x => diasDe(x).some(d => d.startsWith(`${y}-`))
    // Sin bloque de verano solo si se pacta expresamente para la persona, o si la propia
    // persona pidió (y se le aprobó) otro reparto del verano. El acuerdo de un periodo
    // suelto solo vale para ese periodo (antelación, bloques extra, inicio en descanso).
    const pactoVerano   = !!state.pactoVerano?.[p]
    const requestVerano = mios.some(x => x.requestId && diasDe(x).some(enVentana))
    const pactado = pactoVerano || requestVerano
    const acuerdoPeriodo = mios.some(x => x.acuerdo && enAnio(x))
    // Bloques propios (sin los días de cierre, que pone la empresa) con menos de 3 días;
    // el convenio pide los dos de fuera del verano de al menos 3 (3 + 5 o 4 + 4)
    const cierreSet = new Set([...cierreConv, ...cierreExtraDias])
    const bloquesCortos = tramos(vac.filter(d => !cierreSet.has(d)), yearDates).filter(t => t.length < 3)
    const dev = diasDevengados(dias[p], nParo)
    if (pactoVerano) acuerdos.push({ p, motivo: 'sin bloque de 15 días en verano (pactado)', registrado: true })
    mios.filter(x => enAnio(x) && empiezaEnDescanso(p, x.start) && !x.acuerdo)
      .forEach(x => descanso.push({ p, start: x.start, solicitud: !!x.requestId }))

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
      bloqueVerano, bloques: bloquesAnio.length, pactado, pactoVerano, requestVerano, acuerdoPeriodo,
      bloquesCortos: bloquesCortos.length,
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
      if (`${y}-${VENTANA_VERANO.to}` < hoy) warnings.push({ lvl: 'info', text: `${txt}. El verano de ${y} ya pasó.` })
      else if (r.pactoVerano) warnings.push({ lvl: 'info', text: `${txt}: pactado sin bloque de verano.` })
      else if (r.requestVerano) warnings.push({ lvl: 'info', text: `${txt}: lo pidió así la propia persona, así que cuenta como pactado.` })
      else if (r.nParo) warnings.push({ lvl: 'warn', text: `${txt}. Está en paro parte del verano: confirmar con la asesoría si le aplica.` })
      else warnings.push({ lvl: 'bad', text: `${txt}. Solo con acuerdo expreso.` })
    }
    if (r.bloques > MAX_BLOQUES && !r.acuerdoPeriodo && !r.pactado) {
      warnings.push({ lvl: 'warn', text: `${r.p}: ${r.bloques} bloques de vacaciones; el convenio prevé el de verano y dos más. Más, solo con acuerdo.` })
    }
    if (r.bloquesCortos && !r.acuerdoPeriodo) {
      warnings.push({ lvl: 'warn', text: `${r.p}: ${r.bloquesCortos === 1 ? 'un bloque' : `${r.bloquesCortos} bloques`} de menos de 3 días; el convenio pide los otros dos de al menos 3 (3 + 5 o 4 + 4).` })
    }
  })
  descanso.forEach(d => warnings.push({ lvl: 'warn', text: `${d.p}: ${d.solicitud ? 'la solicitud' : 'el periodo'} del ${fmtShort(d.start)} empieza en un día que no trabaja o festivo; según el convenio (art. 34) no puede empezar en día de descanso.` }))
  antelacion.forEach(a => warnings.push({ lvl: 'warn', text: `${a.p}: periodo desde el ${fmtShort(a.start)} comunicado el ${fmtShort(a.comunicado)}, con menos de 2 meses de antelación. Solo vale con acuerdo expreso.` }))
  const ignorados = periods.filter(x => x.prof && x.start && x.n > 0)
    .flatMap(x => diasDe(x).filter(d => d.startsWith(`${y}-`) && isSummer(d) && !disponible(x.prof, d, ctx)).map(d => x.prof))
  ;[...new Set(ignorados)].forEach(p => warnings.push({ lvl: 'warn', text: `${p}: ${ignorados.filter(x => x === p).length} días de vacaciones en un mes de verano que no trabaja; no cuentan.` }))
  // Campamento: cuentas, quién lo lleva y su jornada
  const offDe = expandPeriods(periods)
  const campCtx = {
    y, cierre, simByDate: new Map(allSim.map(d => [d.date, d])),
    presente: (p, d) => disponible(p, d, ctx) && !offDe[p]?.has(d),
  }
  const campRes = cuentasCamp(camp, campCtx)
  if (camp.activo) {
    if (!campSet.size) warnings.push({ lvl: 'warn', text: 'El campamento está activado pero no tiene semanas en julio ni en agosto.' })
    else if (!campRes.ingresos) warnings.push({ lvl: 'warn', text: 'Campamento sin demanda o sin precio (plazas, ocupación o € por niño a 0): el resultado no cuenta lo que ingresaría.' })
    Object.entries(campRes.ausente).forEach(([p, n]) => warnings.push({ lvl: 'warn', text: `${p} lleva el campamento pero ${n === 1 ? 'un día no está' : `${n} días no está`} (paro o vacaciones): lo cubre un monitor de fuera.` }))
    Object.entries(campRes.exceso).forEach(([p, ds]) => {
      const max = Math.max(...ds.map(x => x.horas))
      const txt = p === COMODIN_VERANO
        ? `${p} no puede llevar el campamento por la mañana y estar en recepción por la tarde`
        : `${p}: campamento por la mañana y clases por la tarde`
      warnings.push({ lvl: 'bad', text: `${txt}: ${ds.length} ${ds.length === 1 ? 'día' : 'días'} pasa de ${JORNADA_MAX} h de jornada (hasta ${String(max).replace('.', ',')} h).` })
    })
  }
  const abiertoVer = allSim.filter(d => isSummer(d.date) && !d.closed)
  const sinAbrirVer = abiertoVer.filter(d => d.sinAbrir)
  if (sinAbrirVer.length) warnings.push({ lvl: 'bad', text: `Verano: ${sinAbrirVer.length} días sin nadie con llave para abrir a las ${VERANO_APERTURA} (${listDates(sinAbrirVer)}).` })
  const sinProfeVer = abiertoVer.filter(d => d.lost.length)
  if (sinProfeVer.length) warnings.push({ lvl: 'bad', text: `Verano: ${sinProfeVer.length} días con clases sin profe (${listDates(sinProfeVer)}).` })
  const diasComodin = abiertoVer.filter(d => d.comodin > 0)
  if (diasComodin.length) warnings.push({ lvl: 'warn', text: `Verano: ${diasComodin.length} días en los que ${COMODIN_VERANO} deja recepción para dar clase (${diasComodin.reduce((n, d) => n + d.comodin, 0)} clases).` })
  const sinAbrirResto = allSim.filter(d => !isSummer(d.date) && !d.closed && d.sinAbrir && d.out.length)
  // Si quien abre siempre ese día está de vacaciones, no se puede evitar con el reparto:
  // hay que decidir quién abre (aviso para revisar). Si no, es un problema del plan (rojo).
  const porTitular = {}
  const evitables = []
  sinAbrirResto.forEach(d => {
    const titular = SALA[weekdayOf(d.date)]?.abre
    if (titular && d.out.includes(titular)) (porTitular[titular] ||= []).push(d)
    else evitables.push(d)
  })
  Object.entries(porTitular).forEach(([t, dias]) => {
    const semana = [...new Set(dias.map(d => weekdayOf(d.date)))]
    const cuantos = dias.length === 1 ? 'el día' : `los ${dias.length} días`
    warnings.push({ lvl: 'warn', abrir: dias.length, text: `${t} es quien abre los ${semana.map(w => DAY_LABEL[w].toLowerCase()).join(' y ')} (${semana.map(w => SALA[w].apertura).filter((v, i, a) => a.indexOf(v) === i).join(', ')}): ${cuantos} que está de vacaciones hay que decidir quién abre (${listDates(dias, d => `${DAY_SHORT[weekdayOf(d.date)]} ${fmtShort(d.date)}`)}).` })
  })
  if (evitables.length) warnings.push({ lvl: 'bad', text: `${evitables.length} días del resto del año sin nadie con llave para abrir (${listDates(evitables, d => `${DAY_SHORT[weekdayOf(d.date)]} ${fmtShort(d.date)}`)}).` })
  const sinCerrar = allSim.filter(d => d.sinCerrar && d.out.length)
  if (sinCerrar.length) warnings.push({ lvl: 'warn', text: `${sinCerrar.length} días sin nadie con llave para cerrar (${listDates(sinCerrar, d => `${DAY_SHORT[weekdayOf(d.date)]} ${fmtShort(d.date)}`)}). Hay que alargar el turno de alguien.` })
  const choques = allSim.flatMap(d => conflictsOf(d).filter(c => c.level === 'rojo').map(c => ({ ...c, date: d.date })))
  const choqueTxt = [...new Set(choques.map(c => `${c.a} + ${c.b}`))]
  if (choqueTxt.length) warnings.push({ lvl: 'bad', text: `Coinciden parejas que no deberían: ${choqueTxt.join(', ')} (${choques.length} días).` })

  // Números del verano
  const mesesCerradosList = [7, 8].filter(m => isClosed(`${y}-0${m}-15`, cierre))
  const campMes = m => campRes.porMes[m]?.resultado || 0
  const personalMes = m => PROF_ORDER.reduce((s, p) =>
    s + ((PARO_MESES[paro[p] || 'no'].includes(m) ? 1 : 0) - (PARO_MESES[HOY_PARO[p] || 'no'].includes(m) ? 1 : 0)) * (coste[p] || 0), 0)
  const salaMes = m => (mesesCerradosList.includes(m) ? (gastosSala[m] || 0) - (ingresosSala[m] || 0) : 0)
  const eco = {
    personal: rows.reduce((s, r) => s + r.ahorro, 0),
    sala:     salaMes(7) + salaMes(8),
    camp:     campRes.total,
    campRes,
    // Lo que aporta cada mes frente a hoy
    mes:      m => personalMes(m) + salaMes(m) + campMes(m),
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
    y, ctx, periods, pairLevels: levels, conflictsOf, yearDates, allSim, rows, warnings, acuerdos, antelacion, descanso,
    abiertoVer, sinAbrirVer, diasComodin, campSet, campCtx, mesesCerradosList, eco, kpi,
  }
}

// Lo que cambia una solicitud: avisos y choques nuevos al aprobarla. Se evalúa siempre
// en el año de la solicitud, contra la configuración `state` y las solicitudes aprobadas.
export function impactoSolicitud(state, coste, requests, req) {
  const st   = { ...state, year: Number(req.from.slice(0, 4)) || state.year }
  const otras = requests.filter(r => r.id !== req.id)
  const base = evaluarPlan(st, coste, otras)
  const con  = evaluarPlan(st, coste, [...otras, { ...req, status: 'aprobada' }], base.pairLevels)
  const nuevos = con.warnings.filter(w => w.lvl !== 'info' && !base.warnings.some(b => b.text === w.text))
  const dias = laborablesBetween(req.from, req.to)
  const choques = con.allSim
    .filter(d => dias.includes(d.date))
    .flatMap(d => conflictsOfDay(d, con.pairLevels).filter(c => c.a === req.person || c.b === req.person).map(c => ({ ...c, date: d.date })))
  const row = con.rows.find(r => r.p === req.person)
  const enVentana = d => d >= `${con.y}-${VENTANA_VERANO.from}` && d <= `${con.y}-${VENTANA_VERANO.to}`
  if (row && row.bloqueVerano < BLOQUE_VERANO && !row.pactoVerano && dias.some(enVentana)) {
    nuevos.push({ lvl: 'warn', text: `No completa su bloque de ${BLOQUE_VERANO} días en verano: al aprobarla queda pactado.` })
  }
  return {
    y: con.y,
    dias: dias.length,
    nuevos,
    choques,
    restan: row?.restan,
    ok: !nuevos.some(w => w.lvl === 'bad') && !choques.some(c => c.level === 'rojo'),
  }
}

// Solo informativo: con quién coincidiría la solicitud en el plan del simulador
export function choquesEnSimulador(simState, coste, req) {
  return impactoSolicitud(simState, coste, [], req).choques
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
    const cm = ev.eco.campRes.porMes[m]
    const ventas = (cerrado ? 0 : ventasMed) + cm.ingresos
    const costes = costesMed - ahorroPersonal - ahorroSala + cm.costeNinos + cm.costeMonitores
    res[m] = {
      historico: meses, ventasMed, costesMed, resultadoMed: ventasMed - costesMed,
      cerrado, ahorroPersonal, ahorroSala, camp: ev.eco.campMes(m), campIngresos: cm.ingresos,
      campCostes: cm.costeNinos + cm.costeMonitores, ventas, costes, resultado: ventas - costes,
    }
  })
  return res
}

// ─── Reparto automático de vacaciones (simulador) ────────────────────────────
// Coloca a cada persona su bloque de 15 laborables entre junio y septiembre (si el cierre
// de la sala no se lo da ya) y el resto en Navidad y primavera, eligiendo en cada caso la
// semana que menos choques y problemas de cobertura deja con lo ya colocado.

const ORDEN_REPARTO = ['Alvaro', 'Eva', 'Sara', 'Sigurd', 'Ana', 'Lucía']

function lunesEntre(from, to) {
  return laborablesBetween(from, to).filter(d => weekdayOf(d) === 'Lunes')
}

export function repartirVacaciones(state, { comunicado = todayISO() } = {}) {
  const y = state.year || defaultYear()
  const base = { ...state, periods: state.periods.filter(x => !x.start?.startsWith(`${y}-`)) }
  const sinPeriodos = evaluarPlan({ ...base, periods: [] }, {}, [])
  const ctx0 = { ...sinPeriodos.ctx }
  const levels = sinPeriodos.pairLevels
  const placed = [...base.periods]
  const mk = (prof, start, n, nota) => ({ prof, start, n, comunicado, acuerdo: false, nota })

  // Coste de añadir un periodo: choques con lo colocado y problemas de cobertura esos días
  const camp0 = normalizeCamp(state.camp)
  const campSet0 = campDates(camp0, y)
  const enCamp = (p, d) => camp0.staff.includes(p) && campSet0.has(d)
  const coste = (cand) => {
    const dias = laborablesFrom(cand.start, cand.n)
    // Solo días que trabaja de verdad: ni paro, ni cierre de la sala, ni campamento
    if (dias.some(d => !disponible(cand.prof, d, ctx0) || isClosed(d, state.cierre) || enCamp(cand.prof, d))) return Infinity
    const ctx = { ...ctx0, periods: [...placed, cand] }
    const sim = simulatePlan(dias, ctx)
    return sim.reduce((n, d) => {
      const c = conflictsOfDay(d, levels).filter(x => x.a === cand.prof || x.b === cand.prof)
      return n + (d.sinAbrir ? 100 : 0) + (d.sinCerrar ? 20 : 0) + d.lost.length * 5 + (d.comodin || 0) * 3
        + c.filter(x => x.level === 'rojo').length * 50 + c.filter(x => x.level === 'ambar').length * 8
        + Math.max(0, d.out.length - 1) * 8   // escalonar: penaliza coincidir con otros
    }, 0) + (empiezaEnDescanso(cand.prof, cand.start) ? 30 : 0)
  }
  // `cualquierDia`: los bloques cortos pueden empezar cualquier día que trabaje (así se pisan
  // menos días de los que abre); el de verano, el primer día que trabaja de cada semana.
  const mejor = (prof, starts, n, nota, cualquierDia = false) => {
    let best = null
    starts.forEach(st => {
      if (cualquierDia && empiezaEnDescanso(prof, st)) return
      const dia = cualquierDia ? st : laborablesFrom(st, 5).find(d => !empiezaEnDescanso(prof, d)) || st
      const cand = mk(prof, dia, n, nota)
      const c = coste(cand)
      if (c < Infinity && (!best || c < best.c)) best = { cand, c }
    })
    return best?.cand || null
  }

  ORDEN_REPARTO.forEach(p => {
    const row = sinPeriodos.rows.find(r => r.p === p)
    if (!row) return
    let restan = row.dev - row.usados
    // Bloque de verano (si el cierre no se lo da)
    if (row.cierreConv < BLOQUE_VERANO && restan >= BLOQUE_VERANO) {
      const starts = lunesEntre(`${y}-06-01`, `${y}-09-30`).filter(d => {
        const dias = laborablesFrom(d, BLOQUE_VERANO)
        return dias[dias.length - 1] <= `${y}-09-30`
      })
      const c = mejor(p, starts, BLOQUE_VERANO, 'Bloque de verano')
      if (c) { placed.push(c); restan -= BLOQUE_VERANO }
    }
    // El resto en dos bloques de al menos 3 días: Navidad y primavera
    if (restan > 0) {
      const navidad = restan > 5 ? Math.floor(restan / 2) : restan
      const primavera = restan - navidad
      const cabe = n => d => laborablesFrom(d, n).slice(-1)[0] <= `${y}-12-31`
      const cN = mejor(p, laborablesBetween(`${y}-12-07`, `${y}-12-31`).filter(cabe(navidad)), navidad, 'Navidad', true)
      if (cN) placed.push(cN)
      if (primavera > 0) {
        const cP = mejor(p, laborablesBetween(`${y}-03-02`, `${y}-05-29`), primavera, 'Primavera', true)
        if (cP) placed.push(cP)
      }
    }
  })
  return placed
}
