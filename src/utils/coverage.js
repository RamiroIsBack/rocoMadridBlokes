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
// cualquier tarde, hasta `maxDia` clases. Eva está en recepción y solo da clase
// como comodín cuando no llega ningún profe.
export const COMODIN_VERANO = 'Eva'
export const MAX_CLASES_DIA = 3

function assignVerano(day, present, maxDia) {
  const profes = present.filter(p => p !== COMODIN_VERANO)
  const order  = present.includes(COMODIN_VERANO) ? [...profes, COMODIN_VERANO] : profes
  const count  = Object.fromEntries(order.map(p => [p, 0]))
  const lost = []
  const covered = []
  veranoSlots(day).forEach(([s]) => {
    // Repartir: el profe con menos clases ese día; Eva solo si no queda nadie
    const sub = profes.filter(p => count[p] < maxDia).sort((x, y) => count[x] - count[y])[0]
      || (order.includes(COMODIN_VERANO) && count[COMODIN_VERANO] < maxDia ? COMODIN_VERANO : null)
    if (sub) {
      count[sub]++
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
export function simulateDay(day, { out, inactive = [], season = 'invierno', keys = KEY_HOLDERS_DEFAULT, maxDia = MAX_CLASES_DIA }) {
  const absent  = [...out, ...inactive.filter(p => !out.includes(p))]
  const present = PROF_ORDER.filter(p => !absent.includes(p))

  if (season === 'verano') {
    const r = assignVerano(day, present, maxDia)
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
export const FESTIVOS = [
  '2026-12-08', '2026-12-25', '2027-01-01', '2027-01-06',
  '2027-08-15', '2027-12-06', '2027-12-08', '2027-12-25', '2028-01-01', '2028-01-06',
]

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
  return !!weekdayOf(iso) && !FESTIVOS.includes(iso)
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
export const MESES_DISCONTINUO = 10

export function diasDevengados(diasAnuales, discontinuo) {
  return discontinuo ? Math.round(diasAnuales * MESES_DISCONTINUO / 12) : diasAnuales
}

// Disponibilidad en verano: 'ambos' | 'julio' | 'agosto'. Los fijos
// discontinuos no están ningún mes de verano.
export const DISP_VERANO = { ambos: 'Julio y agosto', julio: 'Solo julio', agosto: 'Solo agosto' }

// Modo de verano: abierto, cerrado en agosto o cerrado julio y agosto
export const CIERRE_VERANO = { abierto: 'Abierto', agosto: 'Cerrado en agosto', verano: 'Cerrado julio y agosto' }
const MESES_CIERRE = { abierto: [], agosto: [8], verano: [7, 8] }

export function monthOf(iso) {
  return Number(iso.slice(5, 7))
}

export function isClosed(iso, cierre = 'abierto') {
  return MESES_CIERRE[cierre].includes(monthOf(iso))
}

export function disponible(prof, iso, { discontinuos = [], disp = {} }) {
  if (!isSummer(iso)) return true
  if (discontinuos.includes(prof)) return false
  const d = disp[prof] || 'ambos'
  return d === 'ambos' || (d === 'julio' ? monthOf(iso) === 7 : monthOf(iso) === 8)
}

// Quien solo está un mes de verano ya no trabaja el otro: no se le exige el 50 %
export function minimoVerano(diasAnuales, discontinuo, disp = 'ambos') {
  return discontinuo || disp !== 'ambos' ? 0 : Math.ceil(diasAnuales / 2)
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
export function simulatePlan(dates, { periods, discontinuos = [], disp = {}, cierre = 'abierto', camp, keys, maxDia }) {
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
    const inactive = PROF_ORDER.filter(p => !disponible(p, date, { discontinuos, disp }))
    const out = PROF_ORDER.filter(p => off[p]?.has(date) && !inactive.includes(p))
    const r = simulateDay(weekdayOf(date), {
      out,
      inactive,
      season: summer ? 'verano' : 'invierno',
      keys,
      maxDia,
    })
    return { ...r, date, out }
  })
}

// Días de vacaciones de cada persona en `dates`: los que pide más los de cierre,
// salvo los que no trabaja (no disponible) o trabaja en el campamento.
export function vacationDates(prof, dates, { periods, discontinuos = [], disp = {}, cierre = 'abierto', camp }) {
  const off = expandPeriods(periods)[prof] || new Set()
  const campSet = camp?.staff?.includes(prof) ? campDates(camp, cierre) : new Set()
  return dates.filter(d => disponible(prof, d, { discontinuos, disp })
    && !campSet.has(d)
    && (off.has(d) || isClosed(d, cierre)))
}
