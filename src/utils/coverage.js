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

// Verano: solo tarde a partir de las 16:30. Lo anterior desaparece; lo que
// cruza las 16:30 (equipar, gestión) se recorta.
export function actsFor(prof, day, season) {
  const acts = BASE[prof]?.[day] || []
  if (season !== 'verano') return acts
  const open = toMin(VERANO_APERTURA)
  return acts
    .filter(a => a.tipo === 'clase' ? toMin(a.start) >= open : toMin(a.end) > open)
    .map(a => (toMin(a.start) < open ? { ...a, start: VERANO_APERTURA } : a))
}

export function salaFor(day, season) {
  if (season !== 'verano') return SALA[day]
  return { ...SALA[day], apertura: VERANO_APERTURA }
}

// Simula un día de la semana. `out` = de vacaciones; `inactive` = fijos
// discontinuos fuera de temporada. Primero se buscan sustitutos para los grupos
// de quien está de vacaciones; lo que no se cubre de los inactivos queda
// "suspendido" (no es un fallo de las vacaciones, es decisión de temporada).
export function simulateDay(day, { out, inactive = [], season = 'invierno', keys = KEY_HOLDERS_DEFAULT }) {
  const absent  = [...out, ...inactive.filter(p => !out.includes(p))]
  const present = PROF_ORDER.filter(p => !absent.includes(p))
  const busy = {}
  const span = {}
  present.forEach(p => {
    const acts = actsFor(p, day, season)
    busy[p] = acts.filter(a => a.tipo === 'clase').map(a => [toMin(a.start), toMin(a.end)])
    if (acts.length) span[p] = [Math.min(...acts.map(a => toMin(a.start))), Math.max(...acts.map(a => toMin(a.end)))]
  })

  const lost = []
  const suspended = []
  const covered = []
  let total = 0
  PROF_ORDER.forEach(p => actsFor(p, day, season).forEach(a => { if (a.tipo === 'clase') total++ }))

  absent.forEach(p => {
    actsFor(p, day, season).filter(a => a.tipo === 'clase').forEach(a => {
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

  const sala = salaFor(day, season)
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
  let level = 'verde'
  if (extraGaps > 0 || both.lost.length >= 12) level = 'rojo'
  else if (extraLost > 0 || both.lost.length >= 8) level = 'ambar'
  return { a, b, lost: both.lost.length, extraLost, extraGaps, sinAbrir: both.sinAbrir, sinCerrar: both.sinCerrar, level }
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

export function minimoVerano(diasAnuales, discontinuo) {
  return discontinuo ? 0 : Math.ceil(diasAnuales / 2)
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

// Simula cada día laborable de `dates` con el plan dado.
export function simulatePlan(dates, { periods, discontinuos = [], keys }) {
  const off = expandPeriods(periods)
  return dates.map(date => {
    const summer = isSummer(date)
    const out = PROF_ORDER.filter(p => off[p]?.has(date) && !(summer && discontinuos.includes(p)))
    const r = simulateDay(weekdayOf(date), {
      out,
      inactive: summer ? discontinuos : [],
      season:   summer ? 'verano' : 'invierno',
      keys,
    })
    return { ...r, date, out }
  })
}
