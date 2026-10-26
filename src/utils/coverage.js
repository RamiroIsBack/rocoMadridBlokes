import { PROF_ORDER, DAYS, SALA, BASE } from '../data/staffSchedule'

// Cobertura de la sala cuando falta gente: quién da las clases de los que no
// están y si hay alguien con llave para abrir y cerrar.
//
// Regla de sustitución: solo cubre quien ya trabaja ese día, está libre en esa
// franja y como mucho alarga su jornada una clase (90 min) por delante o por
// detrás. Equipar, gestión y comida se consideran flexibles (se pueden mover).

export const EXTENSION_MIN = 90
export const VERANO_APERTURA = '16:30'

// Quién abre/cierra hoy, de inicio con llave (editable en la calculadora)
export const KEY_HOLDERS_DEFAULT = ['Alvaro', 'Sigurd', 'Sara', 'Ana', 'Eva']

export function toMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function actsFor(prof, day) {
  return BASE[prof]?.[day] || []
}

// En verano hay poca gente y se unifican los grupos: una sola clase a la vez,
// seguidas desde las 16:30 hasta el cierre (L–J 16:30, 18:00, 19:30, 21:00; V hasta 19:30).
export function veranoSlots(day) {
  const ci = toMin(SALA[day].cierre)
  const res = []
  for (let s = toMin(VERANO_APERTURA); s + 90 <= ci; s += 90) res.push([s, s + 90])
  return res
}

function hhmm(n) {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

// Verano: el horario se rehace, así que cualquier profe presente puede dar
// cualquier tarde y dar todas las clases que quepan. Eva está en recepción y
// solo da clase como comodín cuando ese día no hay ningún profe.
export const COMODIN_VERANO = 'Eva'

function assignVerano(day, present) {
  const profes = present.filter(p => p !== COMODIN_VERANO)
  const count  = Object.fromEntries(profes.map(p => [p, 0]))
  const lost = []
  const covered = []
  veranoSlots(day).forEach(([s]) => {
    // Repartir entre los profes (el que menos lleva); Eva solo si no hay ninguno
    const sub = profes.sort((x, y) => count[x] - count[y])[0]
      || (present.includes(COMODIN_VERANO) ? COMODIN_VERANO : null)
    if (sub) {
      if (sub in count) count[sub]++
      covered.push({ day, start: hhmm(s), from: null, to: sub, comodin: sub === COMODIN_VERANO })
    } else {
      lost.push({ day, start: hhmm(s), prof: null })
    }
  })
  return { lost, covered, profes: profes.length, comodin: covered.filter(c => c.comodin).length }
}

// Resto del año: cada grupo de quien falta busca sustituto. Lo que no se cubre
// de un inactivo (fijo discontinuo) queda suspendido, no perdido.
function assignInvierno(day, { out, absent, present, busy, span }) {
  const lost = []
  const covered = []
  const suspended = []
  absent.forEach(p => {
    actsFor(p, day).filter(a => a.tipo === 'clase').forEach(a => {
      const s = toMin(a.start), e = toMin(a.end)
      const sub = present.find(q => span[q]
        && s >= span[q][0] - EXTENSION_MIN && e <= span[q][1] + EXTENSION_MIN
        && busy[q].every(([x, y]) => y <= s || x >= e))
      if (sub) {
        busy[sub].push([s, e])
        span[sub] = [Math.min(span[sub][0], s), Math.max(span[sub][1], e)]
        covered.push({ day, start: a.start, from: p, to: sub })
      } else {
        (out.includes(p) ? lost : suspended).push({ day, start: a.start, prof: p })
      }
    })
  })
  return { lost, covered, suspended }
}

// Simula un día de la semana. `out` = de vacaciones; `inactive` = fijos
// discontinuos fuera de temporada (en verano simplemente no están).
export function simulateDay(day, { out, inactive = [], season = 'invierno', keys = KEY_HOLDERS_DEFAULT }) {
  const absent  = [...out, ...inactive.filter(p => !out.includes(p))]
  const present = PROF_ORDER.filter(p => !absent.includes(p))

  if (season === 'verano') {
    const r = assignVerano(day, present)
    // Abre y cierra quien tenga llave de los que están (primero recepción)
    const withKey = present.filter(p => keys.includes(p))
    const opener = withKey.includes(COMODIN_VERANO) ? COMODIN_VERANO : withKey[0]
    return {
      day, total: veranoSlots(day).length, ...r, suspended: [],
      opener, closer: opener, sinAbrir: !opener, sinCerrar: !opener,
    }
  }

  const busy = {}
  const span = {}
  present.forEach(p => {
    const acts = actsFor(p, day)
    busy[p] = acts.filter(a => a.tipo === 'clase').map(a => [toMin(a.start), toMin(a.end)])
    if (acts.length) span[p] = [Math.min(...acts.map(a => toMin(a.start))), Math.max(...acts.map(a => toMin(a.end)))]
  })
  const total = PROF_ORDER.reduce((n, p) => n + actsFor(p, day).filter(a => a.tipo === 'clase').length, 0)
  const { lost, covered, suspended } = assignInvierno(day, { out, absent, present, busy, span })

  const sala = SALA[day]
  const ap = toMin(sala.apertura), ci = toMin(sala.cierre)
  const withKey = present.filter(p => keys.includes(p) && span[p])
  const opener = withKey.find(p => span[p][0] - EXTENSION_MIN <= ap)
  const closer = withKey.find(p => span[p][1] + EXTENSION_MIN >= ci)

  return { day, total, lost, suspended, covered, opener, closer, sinAbrir: !opener, sinCerrar: !closer }
}

export function simulateWeek(opts) {
  const days = DAYS.map(d => simulateDay(d, opts))
  return {
    days,
    total:     days.reduce((n, d) => n + d.total, 0),
    lost:      days.flatMap(d => d.lost),
    suspended: days.flatMap(d => d.suspended),
    sinAbrir:  days.filter(d => d.sinAbrir).map(d => d.day),
    sinCerrar: days.filter(d => d.sinCerrar).map(d => d.day),
    comodin:   days.reduce((n, d) => n + (d.comodin || 0), 0),
  }
}

// Gravedad de que dos personas falten a la vez, comparada con que falte cada una
// por separado: lo que importa es lo que la pareja rompe de más.
export function pairConflict(a, b, opts = {}) {
  const both = simulateWeek({ ...opts, out: [...(opts.out || []), a, b] })
  const onlyA = simulateWeek({ ...opts, out: [...(opts.out || []), a] })
  const onlyB = simulateWeek({ ...opts, out: [...(opts.out || []), b] })
  const extraLost = both.lost.length - onlyA.lost.length - onlyB.lost.length
  const gapDays = r => new Set([...r.sinAbrir.map(d => `a${d}`), ...r.sinCerrar.map(d => `c${d}`)])
  const single = new Set([...gapDays(onlyA), ...gapDays(onlyB)])
  const extraGaps = [...gapDays(both)].filter(g => !single.has(g)).length
  const extraComodin = both.comodin - Math.max(onlyA.comodin, onlyB.comodin)
  let level = 'verde'
  if (extraGaps > 0 || both.lost.length >= 12 || (opts.season === 'verano' && both.lost.length > 0)) level = 'rojo'
  else if (extraLost > 0 || both.lost.length >= 8 || extraComodin > 0) level = 'ambar'
  return { a, b, lost: both.lost.length, comodin: both.comodin, extraLost, extraGaps, sinAbrir: both.sinAbrir, sinCerrar: both.sinCerrar, level }
}

// ─── Calendario ──────────────────────────────────────────────────────────────

// Festivos nacionales/Madrid en las ventanas que planificamos (no cuentan como vacaciones)
const FESTIVOS_BASE = [
  '2026-12-08', '2026-12-25', '2027-01-01', '2027-01-06',
  '2027-08-15', '2027-12-06', '2027-12-08', '2027-12-25', '2028-01-01', '2028-01-06',
]
let festivos = new Set(FESTIVOS_BASE)

// Festivos de 9to5 (nacionales, de Madrid y locales). Sin ellos, la lista básica de arriba.
export function setFestivos(dates) {
  festivos = new Set(dates && dates.length ? dates : FESTIVOS_BASE)
}

const JS_DAY = [null, 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', null]

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function weekdayOf(iso) {
  return JS_DAY[parseISO(iso).getDay()]
}

export function isLaborable(iso) {
  return !!weekdayOf(iso) && !festivos.has(iso)
}

export function isSummer(iso) {
  const m = Number(iso.slice(5, 7))
  return m === 7 || m === 8
}

// N días laborables a partir de `start` (si cae en finde/festivo, empieza el siguiente)
export function laborablesFrom(start, n) {
  const res = []
  const d = parseISO(start)
  let guard = 0
  while (res.length < n && guard++ < 400) {
    const iso = isoDate(d)
    if (isLaborable(iso)) res.push(iso)
    d.setDate(d.getDate() + 1)
  }
  return res
}

export function laborablesBetween(from, to) {
  const res = []
  const d = parseISO(from)
  const end = parseISO(to)
  while (d <= end) {
    const iso = isoDate(d)
    if (isLaborable(iso)) res.push(iso)
    d.setDate(d.getDate() + 1)
  }
  return res
}

export function fmtShort(iso) {
  return parseISO(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// ─── Planes de vacaciones ────────────────────────────────────────────────────

// Días laborables de vacaciones al año y parte obligatoria en julio/agosto.
// Un fijo discontinuo sin actividad en julio/agosto devenga la parte
// proporcional de 10 meses y la disfruta durante la temporada.
// Paro en verano (fijo discontinuo): qué meses de julio/agosto no trabaja
export const PARO_VERANO = { no: 'No', verano: 'Julio y agosto', agosto: 'Solo agosto', julio: 'Solo julio' }
export const PARO_MESES  = { no: [], verano: [7, 8], agosto: [8], julio: [7] }

// Las vacaciones se devengan por los meses trabajados
export function diasDevengados(diasAnuales, mesesParo = 0) {
  return Math.round(diasAnuales * (12 - mesesParo) / 12)
}

// Modo de verano: abierto, cerrado en agosto o cerrado julio y agosto
export const CIERRE_VERANO = { abierto: 'Abierto', agosto: 'Cerrado en agosto', verano: 'Cerrado julio y agosto' }
const MESES_CIERRE = { abierto: [], agosto: [8], verano: [7, 8] }

export function monthOf(iso) {
  return Number(iso.slice(5, 7))
}

export function isClosed(iso, cierre = 'abierto') {
  return MESES_CIERRE[cierre].includes(monthOf(iso))
}

export function disponible(prof, iso, { paro = {} }) {
  if (!isSummer(iso)) return true
  return !PARO_MESES[paro[prof] || 'no'].includes(monthOf(iso))
}

// Todas las combinaciones de paro (4 opciones por persona) que dejan cada mes
// abierto con al menos 2 profes + el comodín y alguien con llave. Se ordenan
// por ahorro frente a `hoy` y, a igualdad, por menos cambios.
export function combinacionesParo({ cierre = 'abierto', keys = KEY_HOLDERS_DEFAULT, hoy = {}, coste = {}, minProfes = 2 }) {
  const opciones = Object.keys(PARO_MESES)
  const abiertos = [7, 8].filter(m => !MESES_CIERRE[cierre].includes(m))
  const res = []
  const total = opciones.length ** PROF_ORDER.length
  for (let i = 0; i < total; i++) {
    const paro = {}
    let n = i
    PROF_ORDER.forEach(p => { paro[p] = opciones[n % opciones.length]; n = Math.floor(n / opciones.length) })
    const ok = abiertos.every(m => {
      const activos = PROF_ORDER.filter(p => !PARO_MESES[paro[p]].includes(m))
      return activos.includes(COMODIN_VERANO)
        && activos.filter(p => p !== COMODIN_VERANO).length >= minProfes
        && activos.some(p => keys.includes(p))
    })
    if (!ok) continue
    const ahorro = PROF_ORDER.reduce((sum, p) =>
      sum + (PARO_MESES[paro[p]].length - PARO_MESES[hoy[p] || 'no'].length) * (coste[p] || 0), 0)
    const cambios = PROF_ORDER.filter(p => paro[p] !== (hoy[p] || 'no')).length
    res.push({ paro, ahorro, cambios })
  }
  return res.sort((x, y) => y.ahorro - x.ahorro || x.cambios - y.cambios)
}

// Días de campamento: semanas laborables desde `start`, solo dentro del cierre
export function campDates(camp, cierre) {
  if (!camp?.activo || !camp.start || !(camp.semanas > 0)) return new Set()
  return new Set(laborablesFrom(camp.start, camp.semanas * 5).filter(d => isClosed(d, cierre)))
}

// periods: [{ prof, start, n }] → { prof: Set(fechas) }
export function expandPeriods(periods) {
  const res = {}
  periods.forEach(p => {
    if (!p.prof || !p.start || !(p.n > 0)) return
    res[p.prof] ||= new Set()
    laborablesFrom(p.start, p.n).forEach(d => res[p.prof].add(d))
  })
  return res
}

// Simula cada día laborable de `dates` con el plan dado. Los días de cierre no
// necesitan cobertura; en verano no cuenta quien no está disponible ese mes.
export function simulatePlan(dates, { periods, paro = {}, cierre = 'abierto', camp, keys }) {
  const off = expandPeriods(periods)
  const campSet = campDates(camp, cierre)
  return dates.map(date => {
    if (isClosed(date, cierre)) {
      return {
        date, day: weekdayOf(date), closed: true, camp: campSet.has(date), out: [], total: 0,
        lost: [], covered: [], suspended: [], comodin: 0, sinAbrir: false, sinCerrar: false,
      }
    }
    const summer = isSummer(date)
    const inactive = PROF_ORDER.filter(p => !disponible(p, date, { paro }))
    const out = PROF_ORDER.filter(p => off[p]?.has(date) && !inactive.includes(p))
    const r = simulateDay(weekdayOf(date), {
      out,
      inactive,
      season: summer ? 'verano' : 'invierno',
      keys,
    })
    return { ...r, date, out }
  })
}
