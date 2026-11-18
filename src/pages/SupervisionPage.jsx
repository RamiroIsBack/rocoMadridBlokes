import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import useTemaOscuro from '../hooks/useTemaOscuro'

// Cowork 11/11 15:00: mismo caso que Superadmin — los --kpi-color vivos de las pestañas que
// ya eran "siempre oscuras" (Alumnos/Evolución/Clases/Histórico, dentro de .sv-section) ahora
// que el panel sigue el tema (d84e788) fallan en claro. NO aplica a los --kpi-color de Grupos
// (GruposTab, zona "siempre clara" independiente del selector — pregunta abierta a Ramiro en
// contraste.md, ahí no se toca hasta que responda).
const KPI_COLOR_CLARO = {
  '#f5c842': '#8a6400',
  '#60a5fa': '#1d4ed8',
  '#34d399': '#047857',
  '#f97316': '#c2410c',
  '#a78bfa': '#6d28d9',
  '#f87171': '#b91c1c',
}
function kpiColorTema(hex, oscuro) {
  return oscuro ? hex : (KPI_COLOR_CLARO[hex] || hex)
}
import {
  useClasses, usePeopleSummary, useGestionGrupos,
  gestionMarcarCobrado, gestionVuelveTrasLesion, gestionPausar, gestionReanudar, gestionNota, gestionDarDeBaja, gestionFusionar, gestionExento, gestionCambiarGrupo, gestionOptinWhatsapp, gestionEditarAlumno, gestionBuscarAlumno, gestionAltaCliente,
  gestionGrupoWellhubSet, gestionGrupoWellhubChecks, gestionGrupoBajoTarifaSet,
  gestionListaEsperaGet, gestionListaEsperaCrear, gestionListaEsperaActualizar, gestionListaEsperaBorrar,
  gestionExternoCrear, gestionExternoActualizar, gestionExternoBorrar, gestionExternoPago,
  histPagosImportar, histPagosEstadisticas,
  syncGruposSincronizar, syncGruposCambiosGet, syncGruposCambioAplicar, syncGruposCambioDescartar, syncGruposReintentarCobro,
  syncGruposLimpiarPendientesViejos, syncGruposReevaluarSinFila, syncGruposReevaluarMetodoPago, syncGruposDiagnosticoPagoViejo, syncGruposLimpiarPagoNuevoMismoImporte, syncGruposDeshacerLimpiezaMismoImporte,
  gestionFacturasPendientesGet,
  usePendientesCobro, gestionPendienteCobroViene, gestionPendienteCobroRecordado,
  gestionProfesTelefonosGet, gestionProfesTelefonoSet,
  useBajas, gestionBajaMotivoSet, gestionBajaContacto,
} from '../hooks/useSuperAdmin'
import OvertimeTab from './OvertimeTab'
import TimeOffTab from './TimeOffTab'
import CampanasSection from '../components/CampanasSection'
import TeleSection from '../components/TeleSection'
import { BASE as STAFF_BASE, PROF_ORDER } from '../data/staffSchedule'
import './SupervisionPage.css'

// Profesor(es) de un grupo de Grupos, a partir del horario de referencia de staffSchedule.js
// (Horario Marzo 2026.xlsx) — no hay un campo propio en WooCommerce, así que es una pista por
// día + hora de clase, no un dato garantizado (sustituciones, cambios de horario no reflejados
// aquí, etc. no se ven).
const DIA_A_STAFFKEY = { Lunes: 'Lunes', Martes: 'Martes', Miercoles: 'Miercoles', 'Miércoles': 'Miercoles', Jueves: 'Jueves', Viernes: 'Viernes' }
// Niños/adolescentes (Ramiro 14/11 20:08 + 15/11 07:25): todas esas clases las da Isa,
// menos lunes/miércoles que las da Eva (dentro de su horario de gestión, no aparte). Isa
// es voluntaria y NO está en staffSchedule.js a propósito — esa fuente también alimenta
// Nóminas/Rentabilidad (useCostes, Playground) y Ramiro pidió explícitamente no tocar
// Nóminas, así que esto es solo la pista de "Profesor" en Grupos/Pendientes de cobro.
function profesorDeNinosAdolescentes(dias) {
  // Ramiro, 15/11 16:20 (tabla de franjas real): Isa da las 3 franjas de Martes-Jueves
  // (niños/medianos/adolescentes); Eva da Lunes-Miércoles Y Viernes — antes solo se miraba
  // L-X, así que Viernes se asignaba a Isa por error.
  const esMartesJueves = dias.every(d => d === 'Martes' || d === 'Jueves')
  return esMartesJueves ? 'Isa' : 'Eva'
}
function profesoresDeGrupo(diaPareja, horario, edad) {
  if (!diaPareja || !horario) return []
  const dias = diaPareja.split(/[-–]/).map(d => DIA_A_STAFFKEY[d.trim()]).filter(Boolean)
  if (!dias.length) return []
  if (edad && edad !== 'Adultos') {
    const prof = profesorDeNinosAdolescentes(dias)
    return dias.map(dia => ({ dia, profs: [prof] }))
  }
  const horaNorm = horario.trim().slice(0, 5)
  const porDia = dias.map(dia => {
    const profs = PROF_ORDER.filter(prof => (STAFF_BASE[prof]?.[dia] || []).some(s => s.tipo === 'clase' && s.start === horaNorm))
    return { dia, profs }
  })
  return porDia.filter(d => d.profs.length)
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
const DAY_NORM  = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4 }

function normStr(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function parseClassMeta(label) {
  const m = label.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/)
  if (!m) return null
  const norm = normStr(label)
  const days = []
  for (const [d, i] of Object.entries(DAY_NORM)) {
    if (norm.includes(d)) days.push(i)
  }
  if (!days.length) return null
  return { time: m[0], timeStart: m[1], days }
}

function isMañana(timeStart) {
  return parseInt(timeStart, 10) < 15
}

function parseMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function occupancyClass(n) {
  if (!n) return 'sv-cell--empty'
  if (n <= 3)  return 'sv-cell--low'
  if (n <= 6)  return 'sv-cell--med'
  if (n <= 10) return 'sv-cell--high'
  return 'sv-cell--full'
}

function fmtMonth(m) {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1).toLocaleString('es-ES', { month: 'short', year: '2-digit' })
}

function monthRange(n) {
  const now = new Date()
  const result = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

function histByMonth(classes, mRange, key = 'nuevos') {
  const acc = {}
  mRange.forEach(m => { acc[m] = 0 })
  classes.forEach(c => {
    ;(c.history || []).forEach(h => {
      if (acc[h.month] !== undefined) acc[h.month] += h.new || 0
    })
  })
  return mRange.map(m => ({ month: fmtMonth(m), [key]: acc[m] }))
}

function fmtEur(v) {
  return `${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
}

// ─── Period selector ─────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { label: '6 meses',  value: 6  },
  { label: '12 meses', value: 12 },
  { label: '24 meses', value: 24 },
]

function PeriodSelector({ value, onChange }) {
  return (
    <div className="sv-period">
      {PERIOD_OPTIONS.map(o => (
        <button
          key={o.value}
          className={`sv-period__btn${value === o.value ? ' sv-period__btn--active' : ''}`}
          onClick={() => onChange(o.value)}
        >{o.label}</button>
      ))}
    </div>
  )
}

// Slots that must always show in the grid even with 0 students (no plugin data)
const KNOWN_SLOTS = [
  { time: '19:00-21:00', day: 4 },  // Ana · Viernes tarde
]

// ─── Schedule grid ────────────────────────────────────────────────────────────
function ScheduleGrid({ classes, filter, pestanasSinRepartir = 0, pestanasSinRepartirDetalle = [] }) {
  const conMeta = useMemo(() => classes.map(c => ({ ...c, meta: parseClassMeta(c.label) })), [classes])

  const parsed = useMemo(() => (
    conMeta.filter(c => {
      if (!c.meta) return false
      if (filter === 'mañana') return isMañana(c.meta.timeStart)
      if (filter === 'tarde')  return !isMañana(c.meta.timeStart)
      return true
    })
  ), [conMeta, filter])

  // Ramiro, 15/11 17:05 (repaso ExcelMuerte › "Horario por día" con cowork): había 1
  // suscripción con horario pero SIN día guardado que antes desaparecía sin más — ahora se lista
  // aparte para revisar, en vez de perderse o repartirse a ciegas en una columna cualquiera.
  const sinDia = useMemo(() => conMeta.filter(c => !c.meta && (c.horario || c.active > 0)), [conMeta])

  const timeSlots = useMemo(() => {
    const set = new Set(parsed.map(c => c.meta.time))
    KNOWN_SLOTS.forEach(s => set.add(s.time))
    return [...set].sort((a, b) => {
      const sA = parseMinutes(a.split('-')[0].trim())
      const sB = parseMinutes(b.split('-')[0].trim())
      return sA !== sB ? sA - sB
        : parseMinutes(a.split('-')[1].trim()) - parseMinutes(b.split('-')[1].trim())
    })
  }, [parsed])

  // Ramiro, 15/11 17:05: la celda mezclaba niños/adolescentes con adultos de la misma franja
  // (17:30-18:30 L/M/X/J es todo niños; 18:30-20:00 M-J casi todo "medianos"; Viernes 18-19h
  // niños…) — cada celda ahora suma aparte el total y la parte de niños/adolescentes, para
  // pintarla en otro color dentro de la misma celda sin montar dos tablas separadas.
  const grid = useMemo(() => {
    const g = {}
    timeSlots.forEach(slot => { g[slot] = [{ total: 0, ninos: 0 }, { total: 0, ninos: 0 }, { total: 0, ninos: 0 }, { total: 0, ninos: 0 }, { total: 0, ninos: 0 }] })
    parsed.forEach(c => {
      const { time, days } = c.meta
      const esNinos = c.edad && c.edad !== 'Adultos'
      // Cowork, 15/11 §17:50 punto 9: los que pagan por fuera (Excel de Grupos) ya se reparten
      // aquí con el mismo emparejamiento pestaña→clase que usa Superadmin › Clases (activos
      // = web + fuera), en vez de quedarse fuera de la rejilla por completo.
      const totalActivos = c.active + (c.activosFuera || 0)
      days.forEach(day => {
        if (day < 5 && g[time] !== undefined) {
          g[time][day].total += totalActivos
          if (esNinos) g[time][day].ninos += totalActivos
        }
      })
    })
    return g
  }, [parsed, timeSlots])

  const scheduledSlots = useMemo(() => {
    const s = new Set()
    parsed.forEach(c => { c.meta.days.forEach(d => { s.add(`${c.meta.time}|${d}`) }) })
    KNOWN_SLOTS.forEach(({ time, day }) => s.add(`${time}|${day}`))
    return s
  }, [parsed])

  const dayTotals = useMemo(() => {
    const t = [0, 0, 0, 0, 0]
    timeSlots.forEach(slot => grid[slot].forEach((c, i) => { t[i] += c.total }))
    return t
  }, [grid, timeSlots])

  // Plazas por sesión: el Total de cada fila suma sus columnas de día, así que una clase
  // Martes-Jueves cuenta una vez en martes y otra en jueves (igual criterio que el pie de
  // columna). No es "personas distintas" — eso está en la sección "Personas", aparte.
  const rowTotals = useMemo(() => {
    const totals = {}
    timeSlots.forEach(slot => { totals[slot] = grid[slot].reduce((s, c) => s + c.total, 0) })
    return totals
  }, [grid, timeSlots])

  // Gran total: suma de todas las plazas por sesión de la semana
  const grandTotal = useMemo(() => dayTotals.reduce((s, n) => s + n, 0), [dayTotals])

  if (!timeSlots.length) {
    return (
      <p className="sv-empty">
        Las etiquetas de clase no contienen formato día/horario reconocible.
      </p>
    )
  }

  return (
    <div className="sv-grid-wrap">
      {sinDia.length > 0 && (
        <div className="sv-aviso sv-aviso--warn">
          <strong>⚠ {sinDia.length} {sinDia.length === 1 ? 'clase con horario sin día guardado' : 'clases con horario sin día guardado'}:</strong> no se reparten a ciegas en la tabla, revísalas a mano.
          <ul className="sv-aviso__lista">
            {sinDia.map((c, i) => (
              <li key={i}>{c.horario || '(sin horario)'}{c.edad !== 'Adultos' ? ` · ${c.edad}` : ''} — {c.active} activos</li>
            ))}
          </ul>
        </div>
      )}
      {pestanasSinRepartir > 0 && (
        <p className="sv-note sv-to-small">
          <span title={pestanasSinRepartirDetalle.map(p => `${p.pestana}: ${p.motivo}`).join('\n')} style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
            {pestanasSinRepartir} pestaña{pestanasSinRepartir === 1 ? '' : 's'} del Excel con pago este mes sin repartir ⓘ
          </span>
          {' '}(pasa el ratón para ver cuáles y por qué) — no se reparten a ciegas.
        </p>
      )}
      <div className="sv-legend">
        <span className="sv-legend__label">Inscritos:</span>
        <span className="sv-legend__item sv-legend__item--low">1–3</span>
        <span className="sv-legend__item sv-legend__item--med">4–6</span>
        <span className="sv-legend__item sv-legend__item--high">7–10</span>
        <span className="sv-legend__item sv-legend__item--full">11+</span>
        <span className="sv-legend__item sv-legend__item--ninos">Niños/adolescentes</span>
      </div>
      <div className="sv-schedule-scroll">
        <table className="sv-schedule">
          <thead>
            <tr>
              <th className="sv-th sv-th--time">Horario</th>
              {WEEKDAYS.map(d => <th key={d} className="sv-th">{d}</th>)}
              <th className="sv-th sv-th--total" title="Plazas por sesión: suma las columnas de día de esta fila. Una clase Martes-Jueves cuenta una vez en martes y otra en jueves (no es el nº de personas distintas — eso está en «Personas», arriba).">Total ⓘ</th>
            </tr>
          </thead>
          <tbody>
            {timeSlots.map(slot => {
              const row = grid[slot]
              return (
                <tr key={slot} className="sv-tr">
                  <td className="sv-td-time">{slot}</td>
                  {row.map((c, i) => {
                    const isScheduled = scheduledSlots.has(`${slot}|${i}`)
                    const isEmpty = isScheduled && c.total === 0
                    return (
                      <td key={i} className={`sv-td ${isEmpty ? 'sv-cell--sched-empty' : occupancyClass(c.total)}`}>
                        <span className="sv-cell-num">{c.total > 0 ? c.total : isScheduled ? '0' : '—'}</span>
                        {c.ninos > 0 && (
                          <span className="sv-cell-ninos" title="De esos, niños/adolescentes">
                            {c.ninos === c.total ? 'todo niños' : `${c.ninos} niños`}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  <td className="sv-td-total">{rowTotals[slot] || '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="sv-tr-foot">
              <td className="sv-td-time">Total</td>
              {dayTotals.map((n, i) => (
                <td key={i} className="sv-td-total">{n || '—'}</td>
              ))}
              <td className="sv-td-grand" title="Plazas por sesión de toda la semana (sesiones/semana).">{grandTotal || '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// Cowork 11/11 13:55: con var(--color-text-secondary) en el fill, Recharts pintaba el <text>
// del eje con un atributo SVG fijo que no se repintaba solo al cambiar de tema — seguía en gris
// claro sobre fondo claro. Se resuelve el color a mano en JS con useTemaOscuro() (ver el hook).
function chartStyle(oscuro) {
  return {
    tooltip: { background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 },
    label:   { color: '#f5c842' },
    tick:    { fill: oscuro ? '#b3ab9a' : '#5e5650', fontSize: 11 },
    grid:    '#2a2015',
  }
}

const CLASS_COLORS = [
  '#f5c842','#60a5fa','#34d399','#f97316','#a78bfa',
  '#fb7185','#22d3ee','#84cc16','#e879f9','#facc15',
  '#38bdf8','#4ade80','#fbbf24','#818cf8',
]

function MonthlyBarChart({ data, bars, height = 160, stacked = false }) {
  const CHART_STYLE = chartStyle(useTemaOscuro())
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
        <XAxis dataKey="month" tick={CHART_STYLE.tick} />
        <YAxis allowDecimals={false} tick={CHART_STYLE.tick} width={28} />
        <Tooltip contentStyle={CHART_STYLE.tooltip} labelStyle={CHART_STYLE.label}
          formatter={(v, name) => [v, bars.find(b => b.key === name)?.label || name]} />
        {bars.length > 1 && <Legend formatter={name => bars.find(b => b.key === name)?.label || name} />}
        {bars.map((b, i) => (
          <Bar
            key={b.key}
            dataKey={b.key}
            name={b.label}
            fill={b.color}
            stackId={stacked ? 'a' : undefined}
            radius={stacked ? (i === bars.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]) : [3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// [dia_norm, horario_start] por profesor (basado en horario marzo 2026)
const TEACHER_CLASSES = {
  Alvaro: [
    ['lunes','18:00'],['lunes','19:30'],
    ['martes','14:00'],['martes','16:30'],['martes','18:00'],['martes','19:30'],
    ['miercoles','18:00'],['miercoles','19:30'],
    ['jueves','14:00'],['jueves','16:30'],['jueves','18:00'],['jueves','19:30'],
  ],
  Sigurd: [
    ['martes','17:30','adultos'],['martes','19:00'],['martes','20:30'],
    ['jueves','17:30','adultos'],['jueves','19:00'],['jueves','20:30'],
  ],
  'Lucía': [
    ['lunes','17:30'],['lunes','19:00'],
    ['miercoles','17:30'],['miercoles','19:00'],
  ],
  Sara: [
    ['martes','09:00'],['martes','10:30'],['martes','12:00'],
    ['jueves','09:00'],['jueves','10:30'],['jueves','12:00'],
  ],
  Ana: [
    ['lunes','20:30'],
    ['miercoles','20:30'],
    ['viernes','19:00'],
  ],
  Eva: [
    ['martes','17:30','menor'],['martes','18:30'],
    ['jueves','17:30','menor'],['jueves','18:30'],
    ['viernes','18:00'],['viernes','19:00'],
  ],
}

function classMatchesTeacher(c, teacher) {
  const slots = TEACHER_CLASSES[teacher] || []
  const start = (c.horario || '').split('-')[0].trim()
  const dias  = normStr(c.dia || '').split(/[-\s]+/).filter(Boolean)
  const edad  = normStr(c.edad || '')
  return slots.some(([d, t, e]) =>
    dias.includes(d) && t === start && (!e || edad.includes(normStr(e)))
  )
}

function classLabel(c) {
  return c.edad && c.edad !== 'Adultos' ? `${c.label} (${c.edad})` : c.label
}

// Cowork, 15/11 §17:50 punto 10: "Alumnos activos por clase"/"Evolución por clase" sacaban 49
// "clases" porque cada día suelto de una combinada (Martes-Jueves) salía aparte — mismo criterio
// que ya usa filasRentabilidad en Superadmin › Clases (SuperAdminPage.jsx): el día suelto es la
// MISMA sesión real que la combinada (variantes de producto distintas de la misma clase), así
// que se funde en ella en vez de listarse como clase propia. Al fundir dos piezas con la misma
// persona en las dos (p. ej. alguien con una suscripción de "Martes" Y otra de "Martes-Jueves"),
// los chips también se deduplican por teléfono/nombre — esto es lo que arregla de paso los
// nombres repetidos del aviso (sofiacendejas/jorgecendejas/santicendejas, Martina Teixeira).
function dedupMiembros(lista) {
  const vistos = new Set()
  const out = []
  lista.forEach(m => {
    const clave = m.phone ? `t${m.phone}` : `n${(m.name || '').toLowerCase().replace(/\s+/g, '')}`
    if (vistos.has(clave)) return
    vistos.add(clave)
    out.push(m)
  })
  return out
}
function agruparClasesPorComboReal(data) {
  const combos  = data.filter(c => (c.dia || '').includes('-'))
  const singles = data.filter(c => !(c.dia || '').includes('-'))
  const comboPorSuelto = {}
  combos.forEach(combo => {
    combo.dia.split('-').forEach(dia => {
      const key = `${dia.trim()}|${combo.horario}|${combo.edad}`
      ;(comboPorSuelto[key] = comboPorSuelto[key] || []).push(combo)
    })
  })
  const cubiertos = new Set()
  const filas = []

  combos.forEach(combo => {
    const relacionadas = singles.filter(s => comboPorSuelto[`${s.dia.trim()}|${s.horario}|${s.edad}`]?.includes(combo))
    relacionadas.forEach(s => cubiertos.add(`${s.dia.trim()}|${s.horario}|${s.edad}`))
    const piezas = [combo, ...relacionadas]
    const meses = [...new Set(piezas.flatMap(p => (p.history || []).map(h => h.month)))].sort()
    const history = meses.map(month => ({
      month,
      active: piezas.reduce((t, p) => t + ((p.history || []).find(h => h.month === month)?.active || 0), 0),
      new: piezas.reduce((t, p) => t + ((p.history || []).find(h => h.month === month)?.new || 0), 0),
    }))
    filas.push({
      ...combo,
      active: piezas.reduce((t, p) => t + (p.active || 0), 0),
      history,
      members_active:  dedupMiembros(piezas.flatMap(p => p.members_active || [])),
      members_ending:  dedupMiembros(piezas.flatMap(p => p.members_ending || [])),
      members_pending: dedupMiembros(piezas.flatMap(p => p.members_pending || [])),
      members_lost:    dedupMiembros(piezas.flatMap(p => p.members_lost || [])),
    })
  })

  singles.forEach(s => {
    if (cubiertos.has(`${s.dia.trim()}|${s.horario}|${s.edad}`)) return // ya fundida en su combo
    filas.push(s)
  })

  return filas.sort((a, b) => b.active - a.active)
}

function TrendCharts({ data, months, selectedKey, onSelectKey }) {
  const oscuro = useTemaOscuro()
  const CHART_STYLE = chartStyle(oscuro)
  const mRange = useMemo(() => monthRange(months), [months])

  const classKey = selectedKey || (data[0] ? `${data[0].dia}|${data[0].horario}|${data[0].edad}` : '')
  const selectedClass = useMemo(
    () => data.find(c => `${c.dia}|${c.horario}|${c.edad}` === classKey) || data[0],
    [data, classKey]
  )

  const classChartData = useMemo(() => {
    if (!selectedClass) return []
    return mRange.map(m => {
      const h = (selectedClass.history || []).find(e => e.month === m)
      return { month: fmtMonth(m), activos: h?.active ?? 0 }
    })
  }, [selectedClass, mRange])

  const [profesorFilter, setProfesorFilter] = useState('__all__')
  const [evolFilter,     setEvolFilter    ] = useState('__all__')

  const dataByTeacher = useMemo(() =>
    profesorFilter === '__all__' ? data : data.filter(c => classMatchesTeacher(c, profesorFilter))
  , [data, profesorFilter])

  // reset class filter when teacher changes
  const handleProfesor = p => { setProfesorFilter(p); setEvolFilter('__all__') }

  const evolData = useMemo(() => {
    const classes = evolFilter === '__all__' ? dataByTeacher : dataByTeacher.filter((_, i) => `c${i}` === evolFilter)
    return mRange.map(m => {
      const row = { month: fmtMonth(m) }
      classes.forEach(c => {
        const key = evolFilter === '__all__' ? `c${dataByTeacher.indexOf(c)}` : 'c0'
        const h = (c.history || []).find(e => e.month === m)
        row[key] = h?.active ?? null
      })
      return row
    })
  }, [dataByTeacher, mRange, evolFilter])

  const evolClasses = useMemo(() =>
    evolFilter === '__all__' ? dataByTeacher : dataByTeacher.filter((_, i) => `c${i}` === evolFilter)
  , [dataByTeacher, evolFilter])

  const combinedData = useMemo(() => {
    const mornAcc = {}, tardAcc = {}, kidsAcc = {}
    mRange.forEach(m => { mornAcc[m] = 0; tardAcc[m] = 0; kidsAcc[m] = 0 })
    data.forEach(c => {
      const isKid = c.edad && c.edad.toLowerCase() !== 'adultos'
      const start = (c.horario || '').split('-')[0].trim()
      const isMorn = isMañana(start)
      ;(c.history || []).forEach(h => {
        if (mornAcc[h.month] === undefined) return
        const val = h.active || 0
        if (isKid) kidsAcc[h.month] += val
        else if (isMorn) mornAcc[h.month] += val
        else tardAcc[h.month] += val
      })
    })
    return mRange.map(m => ({ month: fmtMonth(m), niños: kidsAcc[m], mañana: mornAcc[m], tarde: tardAcc[m] }))
  }, [data, mRange])

  const classGroups = useMemo(() => {
    // Students from 2-day combos (Martes-Jueves) also attend each individual day slot
    const comboContrib = {}
    data.forEach(c => {
      if (!(c.dia || '').includes('-')) return
      const a = c.active || 0
      c.dia.split('-').forEach(day => {
        const key = `${day.trim()}|${c.horario}|${c.edad}`
        comboContrib[key] = (comboContrib[key] || 0) + a
      })
    })
    const effectiveActive = c => {
      const a = c.active || 0
      if ((c.dia || '').includes('-')) return a
      return a + (comboContrib[`${(c.dia || '').trim()}|${c.horario}|${c.edad}`] || 0)
    }
    const kids = [], morning = [], evening = []
    data.forEach(c => {
      const isKid = c.edad && c.edad.toLowerCase() !== 'adultos'
      const start = (c.horario || '').split('-')[0].trim()
      const entry = { ...c, effectiveActive: effectiveActive(c) }
      if (isKid) kids.push(entry)
      else if (isMañana(start)) morning.push(entry)
      else evening.push(entry)
    })
    const byActive = arr => [...arr].sort((a, b) => b.effectiveActive - a.effectiveActive)
    return { kids: byActive(kids), morning: byActive(morning), evening: byActive(evening) }
  }, [data])

  return (
    <>
      <section className="sv-section">
        <h2 className="sv-section-title">Alumnos activos por clase</h2>
        <p className="sv-note">Evolución mensual de alumnos activos por clase. Las clases de 2 días (ej. Martes-Jueves) se cuentan como entidad independiente de las clases de día suelto.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select
            value={profesorFilter}
            onChange={e => handleProfesor(e.target.value)}
            className="sv-class-select"
          >
            <option value="__all__">Todos los profes</option>
            {Object.keys(TEACHER_CLASSES).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={evolFilter}
            onChange={e => setEvolFilter(e.target.value)}
            className="sv-class-select"
          >
            <option value="__all__">Todas las clases</option>
            {dataByTeacher.map((c, i) => (
              <option key={i} value={`c${i}`}>{classLabel(c)}</option>
            ))}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={780}>
          <LineChart data={evolData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
            <XAxis dataKey="month" tick={CHART_STYLE.tick} />
            <YAxis allowDecimals={false} tick={CHART_STYLE.tick} width={28} />
            <Tooltip
              contentStyle={CHART_STYLE.tooltip}
              labelStyle={CHART_STYLE.label}
              itemSorter={item => -(item.value ?? 0)}
              formatter={(v, name) => {
                const idx = parseInt(name.slice(1))
                const c = evolFilter === '__all__' ? dataByTeacher[idx] : evolClasses[0]
                return [v ?? 0, c ? classLabel(c) : name]
              }}
            />
            {evolFilter === '__all__' && (
              <Legend
                formatter={name => {
                  const c = dataByTeacher[parseInt(name.slice(1))]
                  return c ? classLabel(c) : name
                }}
                wrapperStyle={{ fontSize: 10 }}
              />
            )}
            {evolClasses.map(c => {
              const globalIdx = dataByTeacher.indexOf(c)
              const dataKey   = evolFilter === '__all__' ? `c${globalIdx}` : 'c0'
              const color     = CLASS_COLORS[data.indexOf(c) % CLASS_COLORS.length]
              return (
                <Line key={dataKey} type="monotone" dataKey={dataKey}
                  stroke={color} strokeWidth={evolFilter === '__all__' ? 2 : 2.5}
                  dot={evolFilter !== '__all__' ? { r: 3, fill: color } : false}
                  connectNulls activeDot={{ r: 4 }} />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="sv-section">
        <h2 className="sv-section-title">Evolución por clase</h2>
        <p className="sv-note">Histórico mensual de activos en la clase seleccionada. Chips: verde = alta este mes, naranja = sigue activa, rojo = baja o pago pendiente.</p>
        <select
          value={classKey}
          onChange={e => onSelectKey(e.target.value)}
          className="sv-class-select"
        >
          {data.map((c, i) => {
            const key = `${c.dia}|${c.horario}|${c.edad}`
            const lbl = c.edad !== 'Adultos' ? `${c.label} (${c.edad})` : c.label
            return <option key={i} value={key}>{lbl} — {c.active} activos</option>
          })}
        </select>
        <MonthlyBarChart
          data={classChartData}
          bars={[{ key: 'activos', label: 'Alumnos activos', color: '#60a5fa' }]}
        />
        {selectedClass && (
          <>
            <div className="sv-member-legend">
              <span className="sv-member-legend__item sv-member-legend__item--new">Nuevo este mes</span>
              <span className="sv-member-legend__item sv-member-legend__item--active">Se mantiene</span>
              <span className="sv-member-legend__item sv-member-legend__item--ending">Se va este mes (ya canceló)</span>
              <span className="sv-member-legend__item sv-member-legend__item--lost">Baja / pendiente pago</span>
            </div>
            <div className="sv-member-list">
              {(selectedClass.members_active || []).filter(m => m.new).map((m, i) => (
                <span key={`n-${i}`} className="sv-member sv-member--new"
                  data-tooltip="Contactar: seguimiento de incorporación">
                  <span className="sv-member__name">{m.name}</span>
                  {m.phone && <span className="sv-member__phone">{m.phone}</span>}
                </span>
              ))}
              {(selectedClass.members_active || []).filter(m => !m.new).map((m, i) => (
                <span key={`a-${i}`} className="sv-member sv-member--active"
                  data-tooltip={m.movedFrom ? `Cambio de clase — antes: ${m.movedFrom}` : undefined}>
                  <span className="sv-member__name">{m.name}{m.movedFrom && <span className="sv-ot-muted"> (antes: {m.movedFrom})</span>}</span>
                  {m.phone && <span className="sv-member__phone">{m.phone}</span>}
                </span>
              ))}
              {(selectedClass.members_ending || []).map((m, i) => (
                <span key={`e-${i}`} className="sv-member sv-member--ending"
                  data-tooltip="Ya canceló: tiene acceso hasta que acabe el periodo pagado, no se renueva">
                  <span className="sv-member__name">{m.name}</span>
                  {m.phone && <span className="sv-member__phone">{m.phone}</span>}
                </span>
              ))}
              {(selectedClass.members_pending || []).map((m, i) => (
                <span key={`p-${i}`} className="sv-member sv-member--lost"
                  data-tooltip="Contactar: verificar si ha pagado o si se ha dado de baja">
                  <span className="sv-member__name">{m.name}</span>
                  {m.phone && <span className="sv-member__phone">{m.phone}</span>}
                </span>
              ))}
              {(selectedClass.members_lost || []).map((m, i) => (
                <span key={`l-${i}`} className="sv-member sv-member--lost"
                  data-tooltip="Contactar: verificar si ha pagado o si se ha dado de baja">
                  <span className="sv-member__name">{m.name}</span>
                  {m.phone && <span className="sv-member__phone">{m.phone}</span>}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="sv-section">
        <h2 className="sv-section-title">Alumnos en clases por mes</h2>
        <p className="sv-note">Suma de activos por grupo (niños / mañanas / tardes) cada mes. Los alumnos de 2 días (ej. Martes-Jueves) se suman a los alumnos de día suelto del mismo horario para el total efectivo de cada franja.</p>
        <MonthlyBarChart
          data={combinedData}
          stacked
          bars={[
            { key: 'niños',  label: 'Niños',          color: '#34d399' },
            { key: 'mañana', label: 'Mañanas adultos', color: '#f5c842' },
            { key: 'tarde',  label: 'Tardes adultos',  color: '#60a5fa' },
          ]}
        />
        <div className="sv-group-summary">
          {[
            { label: 'Niños',           classes: classGroups.kids,    color: kpiColorTema('#34d399', oscuro) },
            { label: 'Mañanas adultos', classes: classGroups.morning, color: kpiColorTema('#f5c842', oscuro) },
            { label: 'Tardes adultos',  classes: classGroups.evening, color: kpiColorTema('#60a5fa', oscuro) },
          ].map(({ label, classes, color }) => {
            const nonEmpty = classes.filter(c => c.effectiveActive > 0)
            const empty    = classes.filter(c => c.effectiveActive === 0)
            const top = nonEmpty.slice(0, 2)
            const bot = nonEmpty.length >= 3 ? nonEmpty.slice(-2).reverse() : []
            return (
              <div key={label} className="sv-group-summary__group">
                <div className="sv-group-summary__title" style={{ color }}>{label}</div>
                {top.length > 0 && (
                  <div className="sv-group-summary__row">
                    <span className="sv-group-summary__lbl">Mejores:</span>
                    {top.map((c, i) => (
                      <span key={i} className="sv-group-summary__chip sv-group-summary__chip--best">
                        {c.label} ({c.effectiveActive})
                      </span>
                    ))}
                  </div>
                )}
                {bot.length > 0 && (
                  <div className="sv-group-summary__row">
                    <span className="sv-group-summary__lbl">Peores:</span>
                    {bot.map((c, i) => (
                      <span key={i} className="sv-group-summary__chip sv-group-summary__chip--worst">
                        {c.label} ({c.effectiveActive})
                      </span>
                    ))}
                  </div>
                )}
                {empty.length > 0 && (
                  <div className="sv-group-summary__row">
                    <span className="sv-group-summary__lbl">Vacías:</span>
                    {empty.map((c, i) => (
                      <span key={i} className="sv-group-summary__chip sv-group-summary__chip--empty">
                        {c.label}
                      </span>
                    ))}
                  </div>
                )}
                {classes.length === 0 && (
                  <span className="sv-group-summary__none">Sin clases en este grupo</span>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}

const BUCKET_LABEL = { adultos_grupo: 'Adultos (grupo)', ninos_adolescentes: 'Niños / adolescentes', pilates_yoga: 'Pilates / Yoga' }

// Personas (cuentas de facturación), no suscripciones. Cada número lleva su definición en
// un «ⓘ» porque, hasta que la migración de la sección 8 añada un campo "Alumno" en cada
// suscripción (distinto del pagador), "persona" aquí es en realidad "cuenta": una familia
// con una sola cuenta para varios hijos cuenta como 1.
function PeopleSummaryKpis() {
  const oscuro = useTemaOscuro()
  const { data, loading, error } = usePeopleSummary()
  if (loading) return <div className="sv-loading">Cargando personas…</div>
  if (error)   return <div className="sv-error">Error: {error}</div>
  if (!data)   return null

  const porDias = (bucket) => {
    const d = data.por_dias?.[bucket] || {}
    const partes = ['1', '2', '3+'].filter(k => d[k]).map(k => `${d[k]} × ${k} ${k === '1' ? 'día' : 'días'}`)
    return partes.length ? partes.join(' · ') : 'sin datos'
  }

  return (
    <div className="sv-kpis">
      <div className="sv-kpi" style={{ '--kpi-color': kpiColorTema('#60a5fa', oscuro) }}
        title="El TOTAL es la misma cifra que el mes en curso de «Alumnos con pago en curso» (Superadmin › Clases) — personas distintas (por teléfono/nombre) con el mes pagado o cubierto, Excel de Grupos fusionado con WooCommerce. «N fuera» es la diferencia con las cuentas de facturación en vigor, no un recuento propio. Puede ser algo menor que «Personas» de Grupos, que cuenta por grupo (dos grupos distintos = 2).">
        <span className="sv-kpi__value">
          {data.cuentasFuera > 0 ? `${data.cuentas_total} web + ${data.cuentasFuera} fuera = ${data.cuentasConFuera}` : data.cuentas_total}
        </span>
        <span className="sv-kpi__label">Alumnos (cuentas) con clase en vigor ⓘ</span>
      </div>
      {Object.keys(BUCKET_LABEL).map(b => (
        <div key={b} className="sv-kpi" style={{ '--kpi-color': kpiColorTema('#a78bfa', oscuro) }}
          title={`Días a la semana de ${BUCKET_LABEL[b]}: cuántas cuentas de este grupo vienen 1, 2 o 3+ días (sumando todas sus suscripciones). Niños/adolescentes y Pilates/Yoga van aparte del resto. Solo cuenta lo que hay suscrito en la web — un alumno que paga por fuera (transferencia, efectivo) y no tiene suscripción en la web no sale aquí.`}>
          <span className="sv-kpi__value">{porDias(b)}</span>
          <span className="sv-kpi__label">{BUCKET_LABEL[b]} ⓘ</span>
        </div>
      ))}
      <div className="sv-kpi" style={{ '--kpi-color': kpiColorTema('#34d399', oscuro) }}
        title="Suma de plazas por sesión (día + hora): una suscripción Martes-Jueves cuenta una vez en martes y una vez en jueves. Mismo criterio que la columna Total de «Horario por día», salvo que aquí sí se incluyen las pending-cancel (ya cancelaron, pero siguen viniendo hasta fin de periodo) — por eso puede salir algo más alto que el total de «Horario por día», que las cuenta aparte.">
        <span className="sv-kpi__value">{data.sesiones_semana}</span>
        <span className="sv-kpi__label">Sesiones/semana ⓘ</span>
      </div>
      {data.ingreso_mes_total != null && (
        <div className="sv-kpi" style={{ '--kpi-color': kpiColorTema('#f5c842', oscuro) }}
          title="Ingreso mensual equivalente de todas las suscripciones en vigor: las trimestrales se dividen por 3 y las anuales por 12, para poder comparar con un mes normal.">
          <span className="sv-kpi__value">{fmtEur(data.ingreso_mes_total)}</span>
          <span className="sv-kpi__label">Ingreso mensual equiv. ⓘ</span>
        </div>
      )}
    </div>
  )
}

// ─── Clases tab ───────────────────────────────────────────────────────────────
function ClasesTab() {
  const oscuro = useTemaOscuro()
  const [months, setMonths]           = useState(6)
  const [filter, setFilter]           = useState('todos')
  const [selectedClassKey, setSelectedClassKey] = useState('')
  const { data: dataConDescontinuadas, loading, error, duplicadosMismaClase, pestanasSinRepartir, pestanasSinRepartirDetalle } = useClasses(months)
  // Ramiro, 18:00 + cowork 17:50 punto 12: las franjas "ya no existen" (mañanas L-X/M-J,
  // Viernes 19-21 adultos) se quitan de aquí (catálogo/pantallas) pero NO del dato crudo que
  // usa Grupos para Altas y Bajas — esa pantalla lee /classes por su cuenta, sin pasar por aquí.
  const data = useMemo(() => (dataConDescontinuadas || []).filter(c => !c.descontinuada), [dataConDescontinuadas])
  // Punto 10 de §17:50: ScheduleGrid necesita cada día suelto por separado (una columna por día
  // de la semana), pero TrendCharts ("Alumnos activos por clase"/"Evolución por clase") tiene
  // que agrupar por clase real — ver agruparClasesPorComboReal().
  const dataAgrupada = useMemo(() => agruparClasesPorComboReal(data), [data])

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'todos') return data
    return data.filter(c => {
      const meta = parseClassMeta(c.label)
      if (!meta) return true
      return filter === 'mañana' ? isMañana(meta.timeStart) : !isMañana(meta.timeStart)
    })
  }, [data, filter])

  const top12      = filtered.slice(0, 12)
  const hasRevenue = top12.some(c => c.revenue != null)
  const totalRevenue = top12.reduce((s, c) => s + (c.revenue || 0), 0)
  // pending-cancel: ya canceló, pero sigue con acceso hasta que acabe el periodo pagado.
  // No cuentan como activos (no se renuevan), pero no hay que perderlos de vista.
  const totalEnding = useMemo(() => (data || []).reduce((s, c) => s + (c.ending || 0), 0), [data])

  return (
    <div className="sv-tab-panel">

      <div className="sv-controls">
        <div className="sv-filter-group">
          {[
            { id: 'todos',  label: 'Todos'  },
            { id: 'mañana', label: 'Mañana' },
            { id: 'tarde',  label: 'Tarde'  },
          ].map(f => (
            <button
              key={f.id}
              className={`sv-filter-btn${filter === f.id ? ' sv-filter-btn--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >{f.label}</button>
          ))}
        </div>
        <div className="sv-controls-right">
          <PeriodSelector value={months} onChange={setMonths} />
        </div>
      </div>

      {loading && <div className="sv-loading">Cargando…</div>}
      {error   && <div className="sv-error">Error: {error}</div>}

      {!loading && !error && data && (
        <>
          <section className="sv-section">
            <h2 className="sv-section-title">Personas</h2>
            <p className="sv-note">Cuentas con suscripción en vigor, no suscripciones (una Martes-Jueves es 1 cuenta que viene 2 días). Pasa el ratón por cada número (ⓘ) para ver qué cuenta exactamente.</p>
            <PeopleSummaryKpis />
          </section>

          <section className="sv-section">
            <h2 className="sv-section-title">Horario por día</h2>
            <p className="sv-note">Snapshot actual de alumnos activos por franja horaria. Verde intenso = mucha gente; rosa = clase programada pero sin activos; — = sin clase en ese horario. Niños/adolescentes aparte en morado, dentro de la misma celda. Incluye también a los que pagan por fuera (Excel de Grupos), repartidos por pestaña a su clase real con el mismo emparejamiento que ya usa Superadmin › Clases (15/11 §17:50 punto 9) — lo que no case con ninguna clase sale en el aviso de abajo, nunca se reparte a ciegas.</p>
            {duplicadosMismaClase.length > 0 && (
              <div className="sv-aviso sv-aviso--warn">
                <strong>⚠ Dos suscripciones activas de la misma clase ({duplicadosMismaClase.length}):</strong> cada persona solo cuenta una plaza aquí, pero tiene dos suscripciones pagando a la vez — decide tú si cobrar una y cancelar la otra (no se cancela ni reembolsa nada en automático).
                <ul className="sv-aviso__lista">
                  {duplicadosMismaClase.map((d, i) => (
                    <li key={i}>{d.nombre || d.telefono || '—'} — {d.dia} {d.horario}{d.edad !== 'Adultos' ? ` · ${d.edad}` : ''} (subs #{d.subIds.join(', #')})</li>
                  ))}
                </ul>
              </div>
            )}
            <ScheduleGrid classes={data} filter={filter} pestanasSinRepartir={pestanasSinRepartir} pestanasSinRepartirDetalle={pestanasSinRepartirDetalle} />
            {totalEnding > 0 && (
              <p className="sv-note sv-to-small">
                + <strong>{totalEnding}</strong> {totalEnding === 1 ? 'que ya canceló' : 'que ya cancelaron'} y se {totalEnding === 1 ? 'va' : 'van'} este mes (tienen acceso hasta que acabe el periodo pagado, no cuentan arriba como activos).
              </p>
            )}
          </section>

          {hasRevenue && (
            <div className="sv-kpis">
              <div className="sv-kpi" style={{ '--kpi-color': kpiColorTema('#34d399', oscuro) }}>
                <span className="sv-kpi__value">{fmtEur(totalRevenue)}</span>
                <span className="sv-kpi__label">Ingresos WC clases ({months}m)</span>
              </div>
            </div>
          )}

          <TrendCharts data={dataAgrupada} months={months} selectedKey={selectedClassKey} onSelectKey={setSelectedClassKey} />
        </>
      )}

      {window.blokesSiteData?.userRole === 'socio' && <HistPagosImportPanel />}
    </div>
  )
}

// Importar el histórico de pagos antiguo (HV Control de Clientes) desde el JSON que ya tiene
// cowork — su entorno no puede subir/pegar 0,9 MB a mano, así que lo hace la interfaz: elige
// el fichero, lee "pagos", simula primero (cuenta nuevas/duplicadas/inválidas sin escribir) y
// solo entonces deja importar de verdad (NOTAS_PARA_CODE_hv_control_clientes.md, 1/11 18:35).
function HistPagosImportPanel() {
  const [fileName, setFileName] = useState('')
  const [pagos, setPagos] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const onFile = e => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setResultado(null); setPagos(null); setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result)
        const lista = Array.isArray(json?.pagos) ? json.pagos : (Array.isArray(json) ? json : null)
        if (!lista) throw new Error('El JSON no tiene un array "pagos".')
        setPagos(lista)
      } catch (err) { setError(`No se pudo leer el archivo: ${err.message}`) }
    }
    reader.onerror = () => setError('No se pudo leer el archivo.')
    reader.readAsText(file)
  }

  const simular = async () => {
    setBusy(true); setError(null)
    try { setResultado(await histPagosImportar({ pagos, simular: true })) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const importarDeVerdad = async (forzar = false) => {
    if (!window.confirm(`¿Importar de verdad ${pagos.length} filas de pago histórico? No se puede deshacer desde aquí.`)) return
    setBusy(true); setError(null)
    try { setResultado(await histPagosImportar({ pagos, simular: false, forzar })) }
    catch (e) {
      // Ya se había importado antes de este mismo origen: ofrece repetir forzando, en vez de
      // dejarlo en un callejón sin salida.
      if (/ya hay.*fila/i.test(e.message) && !forzar) {
        if (window.confirm(`${e.message}\n\n¿Forzar la importación de todos modos?`)) return importarDeVerdad(true)
      }
      setError(e.message)
    } finally { setBusy(false) }
  }

  return (
    <section className="sv-section" style={{ marginTop: 24 }}>
      <h2 className="sv-section-title">Importar histórico de pagos (HV Control de Clientes)</h2>
      <p className="sv-note">
        Solo lectura: esto nunca crea ni modifica pedidos, suscripciones ni facturas de WooCommerce.
        Elige el archivo <code className="sv-to-code">hv_control_clientes.json</code>, comprueba primero con «Simular» y solo luego «Importar de verdad».
      </p>
      <input type="file" accept="application/json" onChange={onFile} />
      {fileName && <p className="sv-note sv-to-small">{fileName}{pagos ? ` — ${pagos.length} fila(s) leídas` : ''}</p>}
      {error && <p className="sv-error">{error}</p>}
      {pagos && (
        <div className="cmp-acciones" style={{ marginTop: 10 }}>
          <button className="sv-filter-btn" onClick={simular} disabled={busy}>{busy ? 'Comprobando...' : 'Simular'}</button>
          {resultado?.simulado && (
            <button className="sv-filter-btn" onClick={() => importarDeVerdad(false)} disabled={busy}>{busy ? 'Importando...' : 'Importar de verdad'}</button>
          )}
        </div>
      )}
      {resultado && (
        <p className="sv-note" style={{ marginTop: 10 }}>
          {resultado.simulado ? 'Simulación' : 'Importado'}: <strong>{resultado.nuevas}</strong> nueva(s), {resultado.duplicadas} ya estaban, {resultado.invalidas} sin fecha válida (de {resultado.total} filas).
        </p>
      )}
    </section>
  )
}

// ─── Grupos (sección 8.1): sustituye el Excel «Grupos» de Eva, solo lectura por ahora ──────
const ESTADO_LABEL = {
  activo:          { txt: 'Activo',                    cls: 'sv-grp-estado--ok' },
  en_espera:       { txt: 'En espera (pausa o impago)', cls: 'sv-grp-estado--warn' },
  pausado:         { txt: 'Pausado',                    cls: 'sv-grp-estado--warn' },
  pendiente_pago:  { txt: 'Pendiente de alta',          cls: 'sv-grp-estado--warn' },
  baja_fin_mes:    { txt: 'Baja a fin de mes',          cls: 'sv-grp-estado--bad' },
  externo:         { txt: 'Fuera de la web',            cls: 'sv-grp-estado--ext' },
}
const METODO_OPCIONES = [
  ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta (TPV roco)'],
  ['bizum', 'Bizum'], ['efectivo', 'Efectivo'], ['wellhub', 'Wellhub'],
]
// Motivo de baja (Ramiro, 15/11 08:45 punto B.2: ampliado más fino que antes) — compartido entre
// "Dar de baja" y el editor de motivo de la pestaña Bajas (mismo BLOKES_BAJA_MOTIVOS del backend).
const BAJA_MOTIVO_OPCIONES = [
  ['precio', 'Precio'], ['horario', 'Horario'], ['falta_tiempo', 'Falta de tiempo'], ['mudanza', 'Mudanza'],
  ['otro_rocodromo', 'Se va a otro rocódromo'], ['clase_profe', 'La clase o el profe'], ['lesion', 'Lesión'],
  ['temporal_vuelve', 'Temporal, dice que vuelve'], ['duplicado', 'Duplicado (no es baja real)'], ['otro', 'Otro'],
]
// Efectivo: sin WooCommerce y sin factura, solo queda apuntado en Grupos (decisión de Ramiro,
// 29/10). Los demás van por WooCommerce y SÍ generan factura real (Verifactu/AEAT). Bizum entra
// por el banco, así que se trata igual que transferencia (decisión de Ramiro, 31/10).
const METODO_CONSECUENCIA = {
  efectivo: 'Efectivo: no se toca WooCommerce ni se genera factura. Solo queda apuntado en Grupos.',
  transferencia: 'Se completará el pedido y se emitirá factura real (Verifactu/AEAT), con la fecha de hoy.',
  tarjeta: 'Se completará el pedido y se emitirá factura real (Verifactu/AEAT), con la fecha de hoy.',
  bizum: 'Se completará el pedido y se emitirá factura real (Verifactu/AEAT), con la fecha de hoy.',
  wellhub: 'Se completará el pedido y se emitirá factura real (Verifactu/AEAT), con la fecha de hoy.',
}
const hoyISO = () => new Date().toISOString().slice(0, 10)

function AccionModal({ alumno, tipo, targetId, grupos = [], onClose, onDone }) {
  const [importe, setImporte] = useState(alumno.importeCatalogo ? String(alumno.importeCatalogo) : '')
  const [metodo, setMetodo]   = useState('transferencia')
  const [fecha, setFecha]     = useState(hoyISO())
  const [parcial, setParcial] = useState(false)
  const [motivo, setMotivo]   = useState('')
  const [fechaVuelta, setFechaVuelta] = useState('')
  const [nota, setNota]       = useState(alumno.notas || '')
  // Excepción de precio en Marcar cobrado (NOTAS_PARA_CODE_pestanas_grupos.md, Ramiro 06/11
  // 16:00): cuando el importe no coincide con el total, hay que elegir una de las dos antes de
  // poder confirmar de verdad.
  const [ajustarPrecio, setAjustarPrecio] = useState('')
  const [motivoExcepcionPrecio, setMotivoExcepcionPrecio] = useState('')
  const [mantenerPausa, setMantenerPausa] = useState(true)
  const [modoBaja, setModoBaja] = useState('fin_mes')
  const [motivoBajaCategoria, setMotivoBajaCategoria] = useState('')
  const [optinWhatsappValor, setOptinWhatsappValor] = useState(alumno.optinWhatsapp || '')
  const [editNombre, setEditNombre]     = useState('')
  const [editApellidos, setEditApellidos] = useState('')
  const [editTelefono, setEditTelefono] = useState(alumno.telefono || '')
  const [editTutorNombre, setEditTutorNombre]     = useState(alumno.tutorNombre || '')
  const [editTutorTelefono, setEditTutorTelefono] = useState(alumno.tutorTelefono || '')
  const [extNombre, setExtNombre]   = useState(alumno.alumno || '')
  const [extTelefono, setExtTelefono] = useState(alumno.telefono || '')
  const [extTutorNombre, setExtTutorNombre]     = useState(alumno.tutorNombre || '')
  const [extTutorTelefono, setExtTutorTelefono] = useState(alumno.tutorTelefono || '')
  const [extDia, setExtDia]         = useState(alumno.externoDia || '')
  const [extHorario, setExtHorario] = useState(alumno.externoHorario || '')
  const [extEdad, setExtEdad]       = useState(alumno.externoEdad || 'Adultos')
  const [extPeriodo, setExtPeriodo] = useState(hoyISO().slice(0, 7))
  const [extCubreMeses, setExtCubreMeses] = useState(1)
  const [grupoNuevo, setGrupoNuevo] = useState('') // "dia|horario|edad" del <select>
  // Ramiro/cowork, 15/11 17:25 (mover a los de medianos sin que les cambie el precio): por
  // defecto marcado cuando el cambio es solo de horario (mismo día y edad que ahora) — en ese
  // caso lo normal es que sea un movimiento administrativo, no un cambio de clase de verdad.
  const [mantenerPrecio, setMantenerPrecio] = useState(false)
  // Marcar cobrado y cambiar de grupo pueden generar factura/cambio de precio de verdad: por
  // defecto se simulan. El resto ya están validadas con datos de prueba, así que por defecto
  // actúan de verdad.
  const [simular, setSimular] = useState(tipo === 'marcar_cobrado' || tipo === 'cambiar_grupo' || tipo === 'vuelve_tras_lesion')
  // Ramiro, 15/11 08:35: "¿también esta nueva o es un duplicado?" — por defecto NO se confirma,
  // así que si hay otra suscripción en vigor el botón de confirmar se queda bloqueado hasta que
  // alguien elija a propósito "sí, quiero las dos/sigo con esta".
  const [confirmarDuplicado, setConfirmarDuplicado] = useState(false)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState(null)

  const titulos = {
    marcar_cobrado: 'Marcar cobrado', pausar: 'Pausar', reanudar: 'Reanudar', nota: 'Nota',
    vuelve_tras_lesion: 'Vuelve tras lesión/ausencia',
    dar_de_baja: 'Dar de baja', fusionar: 'Fusionar duplicado',
    exento: alumno.exento ? 'Quitar exento/socio' : 'Marcar exento/socio',
    cambiar_grupo: 'Cambiar de grupo/horario',
    ext_cobrar: 'Marcar cobrado (fuera de la web)', ext_editar: alumno.externoId ? 'Editar datos' : 'Alta de alumno externo', ext_borrar: 'Eliminar alumno externo',
    optin_whatsapp: 'Consentimiento WhatsApp', editar_alumno: 'Editar nombre/teléfono',
  }
  const puedeSimular = ['marcar_cobrado', 'pausar', 'reanudar', 'dar_de_baja', 'fusionar', 'cambiar_grupo', 'vuelve_tras_lesion'].includes(tipo)
  // Cowork, 14/11 18:40 punto 6: "Cambiar de grupo" ofrecía las 163 variaciones de WooCommerce
  // (mañanas L/X/V, Martes 07:00, Sábado, "Menores"/"Children" repetidos…) en vez de las clases
  // que existen de verdad. Ahora sale de la MISMA lista de grupos de Supervisión → Grupos (ya
  // agrupada por franja, ya sin las mañanas que no son M-J), no de un catálogo aparte.
  const clasesSemanales = grupos

  async function submit(forzarReal = false) {
    setBusy(true); setErr(null)
    const sim = puedeSimular ? (forzarReal ? false : simular) : false
    try {
      let res
      if (tipo === 'marcar_cobrado') {
        if (!importe || Number(importe) <= 0) throw new Error('Pon un importe mayor que 0.')
        if (!sim && preview?.importeDistinto && !ajustarPrecio) throw new Error('Elige si el precio distinto es solo este mes o también desde ahora.')
        if (!sim && preview?.importeDistinto && !motivoExcepcionPrecio.trim()) throw new Error('Pon el motivo de la excepción de precio.')
        if (!sim && preview?.posibleDuplicadoSub && !confirmarDuplicado) throw new Error('Confirma qué pasa con la otra suscripción de la misma clase.')
        res = await gestionMarcarCobrado({
          sub_id: alumno.subId, importe: Number(importe), metodo, fecha, parcial, nota, mantener_pausa: mantenerPausa, simular: sim,
          ...(preview?.importeDistinto ? { ajustarPrecio, motivoExcepcion: motivoExcepcionPrecio } : {}),
          ...(preview?.posibleDuplicadoSub ? { confirmarDuplicado } : {}),
        })
      } else if (tipo === 'pausar') {
        if (!motivo.trim()) throw new Error('Pon un motivo.')
        res = await gestionPausar({ sub_id: alumno.subId, motivo, fecha_vuelta: fechaVuelta, simular: sim })
      } else if (tipo === 'reanudar') {
        res = await gestionReanudar({ sub_id: alumno.subId, simular: sim })
      } else if (tipo === 'vuelve_tras_lesion') {
        if (!importe || Number(importe) <= 0) throw new Error('Pon un importe mayor que 0.')
        res = await gestionVuelveTrasLesion({ sub_id: alumno.subId, importe: Number(importe), metodo, fecha, motivo, simular: sim })
      } else if (tipo === 'nota') {
        res = await gestionNota({ sub_id: alumno.subId, nota })
      } else if (tipo === 'dar_de_baja') {
        if (!motivoBajaCategoria) throw new Error('Elige un motivo.')
        res = await gestionDarDeBaja({ sub_id: alumno.subId, modo: modoBaja, motivoCategoria: motivoBajaCategoria, motivo, simular: sim })
      } else if (tipo === 'fusionar') {
        res = await gestionFusionar({ sub_id_viejo: targetId, simular: sim })
      } else if (tipo === 'exento') {
        res = alumno.esExterno
          ? await gestionExternoActualizar(alumno.externoId, { dia: alumno.externoDia, horario: alumno.externoHorario, edad: alumno.externoEdad, nombre: alumno.alumno, telefono: alumno.telefono, notas: alumno.notas, exento: !alumno.exento })
          : await gestionExento({ sub_id: alumno.subId, exento: !alumno.exento })
      } else if (tipo === 'cambiar_grupo') {
        if (!grupoNuevo) throw new Error('Elige el grupo nuevo.')
        if (!sim && preview?.posibleDuplicadoSub && !confirmarDuplicado) throw new Error('Confirma qué pasa con la otra suscripción de esa clase.')
        const [dia, horario, edad] = grupoNuevo.split('|')
        res = await gestionCambiarGrupo({
          sub_id: alumno.subId, dia, horario, edad, simular: sim, mantenerPrecio,
          ...(preview?.posibleDuplicadoSub ? { confirmarDuplicado } : {}),
        })
      } else if (tipo === 'ext_cobrar') {
        if (!importe || Number(importe) <= 0) throw new Error('Pon un importe mayor que 0.')
        res = await gestionExternoPago(alumno.externoId, { periodo: extPeriodo, importe: Number(importe), metodo, fecha, cubreMeses: Number(extCubreMeses) })
      } else if (tipo === 'ext_editar') {
        if (!extNombre.trim()) throw new Error('Pon el nombre.')
        if (!extDia.trim() && !extHorario.trim()) throw new Error('Pon el grupo (día y/u horario).')
        const body = { dia: extDia, horario: extHorario, edad: extEdad, nombre: extNombre, telefono: extTelefono, notas: nota, exento: alumno.exento, tutorNombre: extTutorNombre, tutorTelefono: extTutorTelefono }
        res = alumno.externoId ? await gestionExternoActualizar(alumno.externoId, body) : await gestionExternoCrear(body)
      } else if (tipo === 'ext_borrar') {
        res = await gestionExternoBorrar(alumno.externoId)
      } else if (tipo === 'optin_whatsapp') {
        if (!alumno.telefono) throw new Error('Esta persona no tiene teléfono guardado.')
        res = await gestionOptinWhatsapp({ telefono: alumno.telefono, valor: optinWhatsappValor, nombre: alumno.alumno })
      } else if (tipo === 'editar_alumno') {
        if (!editNombre.trim() && !editApellidos.trim() && !editTelefono.trim() && !editTutorNombre.trim() && !editTutorTelefono.trim()) throw new Error('Rellena al menos un dato.')
        res = await gestionEditarAlumno({ sub_id: alumno.subId, nombre: editNombre, apellidos: editApellidos, telefono: editTelefono, tutorNombre: editTutorNombre, tutorTelefono: editTutorTelefono })
      }
      if (sim) setPreview(res)
      else onDone()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sv-grp-overlay" onClick={onClose}>
      <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
        <h3>{titulos[tipo]}{alumno.subId ? ` — ${alumno.alumno || `Suscripción #${alumno.subId}`}` : ''}</h3>

        {preview ? (
          <>
            <p className="sv-to-warn-txt">Simulación: no se ha escrito nada todavía.</p>
            <ul className="sv-grp-preview">
              {Object.entries(preview)
                .filter(([k, v]) => !['aviso', 'importeDistinto', 'totalActual', 'ajustarPrecio', 'opciones', 'posibleDuplicadoSub'].includes(k) && v !== null)
                .map(([k, v]) => (
                  <li key={k}><span>{previewLabel(k)}</span><span>{previewValor(v)}</span></li>
                ))}
            </ul>
            {(tipo === 'marcar_cobrado' || tipo === 'cambiar_grupo') && preview.posibleDuplicadoSub && (
              <div className="sv-grp-field sv-to-warn-txt sv-dup-aviso">
                <p>⚠️ <strong>Cuidado: esta persona ya tiene otra suscripción{tipo === 'cambiar_grupo' ? ' en esa misma clase nueva' : ' de la misma clase'}</strong>:</p>
                <ul className="sv-aviso__lista">
                  {preview.posibleDuplicadoSub.map(s => (
                    <li key={s.subId}>#{s.subId} · {s.dia} {s.horario}{s.edad !== 'Adultos' ? ` · ${s.edad}` : ''} · {s.estado} · {s.importe != null ? fmtEur(s.importe) : '—'}{s.proximoPago ? ` · próximo pago ${s.proximoPago}` : ''}</li>
                  ))}
                </ul>
                <label className="sv-grp-field sv-grp-field--check">
                  <input type="checkbox" checked={confirmarDuplicado} onChange={e => setConfirmarDuplicado(e.target.checked)} />
                  Sí, quiero las dos / sigo adelante con esta (si no, cancela esta acción y resuélvelo a mano)
                </label>
              </div>
            )}
            {tipo === 'marcar_cobrado' && preview.importeDistinto && (
              <div className="sv-grp-field sv-to-warn-txt">
                <p>
                  El importe ({fmtEur(preview.importe)}) no coincide con el total actual ({fmtEur(preview.totalActual)}).
                  Elige una opción antes de confirmar:
                </p>
                <label className="sv-grp-field sv-grp-field--check">
                  <input type="radio" name="ajustarPrecio" checked={ajustarPrecio === 'solo_este_mes'}
                    disabled={!preview.opciones?.solo_este_mes?.disponible}
                    onChange={() => setAjustarPrecio('solo_este_mes')} />
                  Cobrar este importe solo este mes (factura por {fmtEur(preview.importe)})
                  {!preview.opciones?.solo_este_mes?.disponible ? ' — todavía no existe el pedido de este mes' : ''}
                </label>
                <label className="sv-grp-field sv-grp-field--check">
                  <input type="radio" name="ajustarPrecio" checked={ajustarPrecio === 'desde_ahora'}
                    onChange={() => setAjustarPrecio('desde_ahora')} />
                  Y usar este precio a partir de ahora (cambia también las próximas renovaciones)
                </label>
                <label className="sv-grp-field">Motivo de la excepción
                  <input className="sv-tests-input" type="text" value={motivoExcepcionPrecio} onChange={e => setMotivoExcepcionPrecio(e.target.value)} placeholder="Hermanos, cambio de grupo, acuerdo…" />
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            {tipo === 'marcar_cobrado' && (
              <>
                {alumno.manual === false && metodo !== 'efectivo' && (
                  <p className="sv-to-warn-txt">Esta suscripción cobra sola por tarjeta/Redsys: el servidor rechazará la acción (para evitar cobro doble). El efectivo sí se puede apuntar.</p>
                )}
                {alumno.estado === 'pausado' && (
                  <label className="sv-grp-field sv-grp-field--check">
                    <input type="checkbox" checked={mantenerPausa} onChange={e => setMantenerPausa(e.target.checked)} />
                    Mantener la pausa ({alumno.pausaMotivo}) aunque se marque cobrado
                  </label>
                )}
                <label className="sv-grp-field">Importe (€)
                  <input className="sv-tests-input" type="number" step="0.01" min="0" value={importe} onChange={e => setImporte(e.target.value)} />
                </label>
                <label className="sv-grp-field">Método
                  <select className="sv-tests-select" value={metodo} onChange={e => setMetodo(e.target.value)}>
                    {METODO_OPCIONES.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                </label>
                <p className={metodo === 'efectivo' ? 'sv-ot-muted' : 'sv-to-warn-txt'}>{METODO_CONSECUENCIA[metodo]}</p>
                <label className="sv-grp-field">Fecha
                  <input className="sv-tests-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                </label>
                <label className="sv-grp-field sv-grp-field--check">
                  <input type="checkbox" checked={parcial} onChange={e => setParcial(e.target.checked)} />
                  Pago parcial / medio mes
                </label>
                <label className="sv-grp-field">Nota
                  <input className="sv-tests-input" type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />
                </label>
              </>
            )}

            {tipo === 'pausar' && (
              <>
                <label className="sv-grp-field">Motivo
                  <input className="sv-tests-input" type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Lesión, viaje…" />
                </label>
                <label className="sv-grp-field">Fecha de vuelta (opcional)
                  <input className="sv-tests-input" type="date" value={fechaVuelta} onChange={e => setFechaVuelta(e.target.value)} />
                </label>
              </>
            )}

            {tipo === 'reanudar' && (
              <p>¿Reanudar esta suscripción (vuelve a «Activo»)?</p>
            )}

            {tipo === 'vuelve_tras_lesion' && (
              <>
                <p className="sv-note">
                  Anula sin factura los pedidos pendientes de los meses que no vino, cobra el mes actual con el
                  importe y método de abajo, y reactiva la suscripción — el siguiente cobro vuelve solo al día 3
                  del mes que viene. Todo en esta misma suscripción (#{alumno.subId}), sin crear otra.
                </p>
                <label className="sv-grp-field">Importe de este mes (€)
                  <input className="sv-tests-input" type="number" step="0.01" min="0" value={importe} onChange={e => setImporte(e.target.value)} placeholder={alumno.importeCatalogo ? `Catálogo: ${alumno.importeCatalogo} €` : ''} />
                </label>
                <label className="sv-grp-field">Método
                  <select className="sv-tests-select" value={metodo} onChange={e => setMetodo(e.target.value)}>
                    {METODO_OPCIONES.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                </label>
                <label className="sv-grp-field">Fecha
                  <input className="sv-tests-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                </label>
                <label className="sv-grp-field">Motivo
                  <input className="sv-tests-input" type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Vuelve tras lesión/ausencia" />
                </label>
              </>
            )}

            {tipo === 'dar_de_baja' && (
              <>
                {(alumno.estado === 'en_espera' || alumno.estado === 'pendiente_pago') && (
                  <p className="sv-to-warn-txt">Está en espera (sin nada pagado en curso): aunque elijas «a fin de mes», se dará de baja inmediata y se cancelará cualquier pedido suyo sin pagar.</p>
                )}
                <label className="sv-grp-field">Cuándo
                  <select className="sv-tests-select" value={modoBaja} onChange={e => setModoBaja(e.target.value)}>
                    <option value="fin_mes">A fin de mes (sigue viniendo hasta que acabe lo pagado)</option>
                    <option value="inmediata">Inmediata</option>
                  </select>
                </label>
                <label className="sv-grp-field">Motivo
                  <select className="sv-tests-select" value={motivoBajaCategoria} onChange={e => setMotivoBajaCategoria(e.target.value)}>
                    <option value="">Elige un motivo…</option>
                    {BAJA_MOTIVO_OPCIONES.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                </label>
                <label className="sv-grp-field">Detalle (opcional)
                  <input className="sv-tests-input" type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Se va a otro gimnasio…" />
                </label>
              </>
            )}

            {tipo === 'fusionar' && (
              <p>¿Cancelar la suscripción vieja <strong>#{targetId}</strong> (duplicado de esta misma, ya con una más nueva activa)? No se toca la suscripción nueva.</p>
            )}

            {tipo === 'exento' && (
              <p>
                {alumno.exento
                  ? '¿Quitar la marca de exento/socio? Volverá a contar como un cobro normal.'
                  : '¿Marcar como exento/socio (el «*» del Excel de Eva)? Figura como alumno, pero no se le pide cobro ni cuenta como pendiente. No toca WooCommerce.'}
              </p>
            )}

            {tipo === 'optin_whatsapp' && (
              <>
                <p className="sv-note">Marca lo que haya dicho esta persona (en persona o por WhatsApp) sobre recibir avisos y promociones por WhatsApp. Teléfono: {alumno.telefono || '—'}.</p>
                <label className="sv-grp-field">Consentimiento
                  <select className="sv-tests-select" value={optinWhatsappValor} onChange={e => setOptinWhatsappValor(e.target.value)}>
                    <option value="">Sin preguntar</option>
                    <option value="si">Sí, acepta</option>
                    <option value="no">No, o pidió BAJA</option>
                  </select>
                </label>
              </>
            )}

            {tipo === 'editar_alumno' && (
              <>
                <p className="sv-note">
                  {alumno.sinNombre
                    ? 'Esta suscripción no tiene nombre de facturación: se ve el usuario de la cuenta, no un nombre real. Rellena el nombre y apellidos de verdad.'
                    : `Nombre actual: ${alumno.alumno || '—'}. Deja un campo en blanco para no cambiarlo.`}
                </p>
                <label className="sv-grp-field">Nombre
                  <input className="sv-tests-input" type="text" value={editNombre} onChange={e => setEditNombre(e.target.value)} placeholder="Nombre" />
                </label>
                <label className="sv-grp-field">Apellidos
                  <input className="sv-tests-input" type="text" value={editApellidos} onChange={e => setEditApellidos(e.target.value)} placeholder="Apellidos" />
                </label>
                <label className="sv-grp-field">Teléfono
                  <input className="sv-tests-input" type="text" value={editTelefono} onChange={e => setEditTelefono(e.target.value)} placeholder="Teléfono" />
                </label>
                <p className="sv-note">Si es menor de edad, nombre y teléfono del padre/madre/tutor (opcional):</p>
                <label className="sv-grp-field">Tutor — nombre
                  <input className="sv-tests-input" type="text" value={editTutorNombre} onChange={e => setEditTutorNombre(e.target.value)} placeholder="Nombre del tutor" />
                </label>
                <label className="sv-grp-field">Tutor — teléfono
                  <input className="sv-tests-input" type="text" value={editTutorTelefono} onChange={e => setEditTutorTelefono(e.target.value)} placeholder="Teléfono del tutor" />
                </label>
              </>
            )}

            {tipo === 'nota' && (
              <label className="sv-grp-field">Nota
                <input className="sv-tests-input" type="text" value={nota} onChange={e => setNota(e.target.value)} />
              </label>
            )}

            {tipo === 'cambiar_grupo' && (
              <>
                <p className="sv-ot-muted">
                  Actual: {alumno.dia || '—'} · {alumno.horario || '—'} · {alumno.edad || 'Adultos'}
                  {alumno.importeCatalogo != null ? ` · ${alumno.importeCatalogo} €` : ''}
                </p>
                <label className="sv-grp-field">Grupo nuevo
                  <select className="sv-tests-select" value={grupoNuevo} onChange={e => {
                    const valor = e.target.value
                    setGrupoNuevo(valor)
                    // Por defecto, mantener el precio cuando el cambio es solo de horario (mismo
                    // día y la misma edad que ya tenía) — lo normal en ese caso es un movimiento
                    // administrativo, no un cambio de clase de verdad.
                    if (valor) {
                      const [dia, , edad] = valor.split('|')
                      setMantenerPrecio(dia === (alumno.dia || '') && edad === (alumno.edad || 'Adultos'))
                    }
                  }}>
                    <option value="">— Elige día · horario · edad —</option>
                    {clasesSemanales.map(c => (
                      <option key={`${c.dia}|${c.horario}|${c.edad}`} value={`${c.dia}|${c.horario}|${c.edad}`}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sv-grp-field sv-grp-field--check">
                  <input type="checkbox" checked={mantenerPrecio} onChange={e => setMantenerPrecio(e.target.checked)} />
                  Mantener precio actual (no recalcular con la tabla de tarifas)
                </label>
                <p className="sv-to-warn-txt">
                  {mantenerPrecio
                    ? 'El precio de la suscripción se queda igual — solo cambia la clase (día/horario/edad).'
                    : 'Cambia el precio de la suscripción a partir de la próxima renovación (según la tabla de tarifas vigente), sin tocar lo ya pagado.'}
                  {' '}No genera pedido ni factura.
                </p>
              </>
            )}

            {tipo === 'ext_cobrar' && (
              <>
                <p className="sv-ot-muted">No toca WooCommerce: solo queda apuntado como pago de este alumno externo.</p>
                <label className="sv-grp-field">Mes (periodo)
                  <input className="sv-tests-input" type="month" value={extPeriodo} onChange={e => setExtPeriodo(e.target.value)} />
                </label>
                <label className="sv-grp-field">Importe (€)
                  <input className="sv-tests-input" type="number" step="0.01" min="0" value={importe} onChange={e => setImporte(e.target.value)} />
                </label>
                <label className="sv-grp-field">Método
                  <select className="sv-tests-select" value={metodo} onChange={e => setMetodo(e.target.value)}>
                    {METODO_OPCIONES.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                </label>
                <label className="sv-grp-field">Fecha
                  <input className="sv-tests-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
                </label>
                <label className="sv-grp-field">Cubre hasta
                  <select className="sv-tests-select" value={extCubreMeses} onChange={e => setExtCubreMeses(e.target.value)}>
                    <option value={1}>1 mes (solo este)</option>
                    <option value={3}>Trimestre (este mes + 2)</option>
                    <option value={12}>Año (este mes + 11)</option>
                  </select>
                </label>
              </>
            )}

            {tipo === 'ext_editar' && (
              <>
                <label className="sv-grp-field">Nombre
                  <input className="sv-tests-input" type="text" value={extNombre} onChange={e => setExtNombre(e.target.value)} />
                </label>
                <label className="sv-grp-field">Teléfono
                  <input className="sv-tests-input" type="text" value={extTelefono} onChange={e => setExtTelefono(e.target.value)} />
                </label>
                <label className="sv-grp-field">Día (Lunes/Martes… o Pilates/Yoga)
                  <input className="sv-tests-input" type="text" value={extDia} onChange={e => setExtDia(e.target.value)} />
                </label>
                <label className="sv-grp-field">Horario
                  <input className="sv-tests-input" type="text" value={extHorario} onChange={e => setExtHorario(e.target.value)} placeholder="17:30-18:30" />
                </label>
                <label className="sv-grp-field">Edad
                  <input className="sv-tests-input" type="text" value={extEdad} onChange={e => setExtEdad(e.target.value)} placeholder="Adultos" />
                </label>
                <label className="sv-grp-field">Notas
                  <input className="sv-tests-input" type="text" value={nota} onChange={e => setNota(e.target.value)} />
                </label>
                <p className="sv-note">Si es menor de edad, nombre y teléfono del padre/madre/tutor (opcional):</p>
                <label className="sv-grp-field">Tutor — nombre
                  <input className="sv-tests-input" type="text" value={extTutorNombre} onChange={e => setExtTutorNombre(e.target.value)} placeholder="Nombre del tutor" />
                </label>
                <label className="sv-grp-field">Tutor — teléfono
                  <input className="sv-tests-input" type="text" value={extTutorTelefono} onChange={e => setExtTutorTelefono(e.target.value)} placeholder="Teléfono del tutor" />
                </label>
              </>
            )}

            {tipo === 'ext_borrar' && (
              <p>¿Eliminar a <strong>{alumno.alumno}</strong> de los alumnos externos? No afecta a nada de WooCommerce. Es para altas hechas por error — si de verdad dejó de venir, mejor déjalo y no le apuntes más pagos.</p>
            )}

            {puedeSimular && (
              <label className="sv-grp-field sv-grp-field--check">
                <input type="checkbox" checked={simular} onChange={e => setSimular(e.target.checked)} />
                Simular (calcula qué pasaría, sin escribir nada en WooCommerce)
              </label>
            )}
          </>
        )}

        {err && <p className="sv-error">{err}</p>}

        <div className="sv-grp-modal__actions">
          <button className="sv-tests-select" onClick={onClose} disabled={busy}>Cancelar</button>
          {preview ? (
            <>
              <button className="sv-tests-select" onClick={() => setPreview(null)} disabled={busy}>Volver</button>
              <button
                className="sv-tests-danger sv-tests-danger--confirm"
                onClick={() => submit(true)}
                disabled={busy || !!preview.adelantadoYaGuardado || (preview.importeDistinto && (!ajustarPrecio || !motivoExcepcionPrecio.trim())) || (preview.posibleDuplicadoSub && !confirmarDuplicado)}
                title={preview.adelantadoYaGuardado
                  ? 'Ya hay un pago adelantado guardado para este mes — anúlalo primero si quieres cambiarlo.'
                  : (preview.importeDistinto && (!ajustarPrecio || !motivoExcepcionPrecio.trim()) ? 'Elige una opción y pon el motivo de la excepción de precio.'
                    : (preview.posibleDuplicadoSub && !confirmarDuplicado ? 'Marca la casilla si quieres seguir adelante con el duplicado.' : undefined))}
              >
                {busy ? 'Guardando…' : (preview.adelantadoYaGuardado ? 'Ya hay un adelantado guardado' : 'Confirmar de verdad')}
              </button>
            </>
          ) : (
            <button className="sv-tests-danger sv-tests-danger--confirm" onClick={() => submit(false)} disabled={busy}>
              {busy ? 'Guardando…' : (puedeSimular && simular ? 'Simular' : 'Confirmar')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Wellhub (16/11 07:35 punto A): marca manual (gana sobre la detección automática por "wellhub"
// en las notas), check-ins que le tocan al mes para completar su tarifa, y el registro opcional
// de los que Eva ve en el portal (sin conexión con Wellhub, a mano). El € (importeFalta/
// porCheckin) solo llega aquí si el backend decidió que este usuario es socio.
function WellhubModal({ alumno, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [checkins, setCheckins] = useState('')
  const periodoActual = hoyISO().slice(0, 7)

  const marcar = async valor => {
    setBusy(true); setErr(null)
    try { await gestionGrupoWellhubSet({ subId: alumno.subId, wellhub: valor }); onDone() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const guardarCheckins = async () => {
    if (checkins === '') return
    setBusy(true); setErr(null)
    try { await gestionGrupoWellhubChecks({ subId: alumno.subId, periodo: periodoActual, checkins: Number(checkins) }); onDone() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="sv-grp-overlay" onClick={onClose}>
      <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
        <h3>Wellhub — {alumno.alumno || `Suscripción #${alumno.subId}`}</h3>
        <p className="sv-note">
          Paga parte de su cuota con Wellhub: el portal paga 4,88 € por cada check-in que pase, el día 15-17 del mes
          siguiente. Tiene que pasar el pase SIEMPRE que venga — si no, no se cobra esa parte.
          {alumno.wellhub && alumno.wellhubCheckinsFaltan != null && <> Le tocan <strong>{alumno.wellhubCheckinsFaltan}</strong> check-ins este mes para completar su tarifa.</>}
        </p>
        {err && <p className="sv-to-warn-txt">{err}</p>}
        <div className="sv-grp-modal__actions">
          <button className="sv-tests-select" disabled={busy} onClick={() => marcar(null)}>Automático (según las notas)</button>
          <button className="sv-tests-select" disabled={busy} onClick={() => marcar(false)}>No paga con Wellhub</button>
          <button className="sv-tests-save" disabled={busy} onClick={() => marcar(true)}>Sí, paga con Wellhub</button>
        </div>
        {alumno.wellhub && (
          <label className="sv-grp-field">
            Check-ins vistos en el portal este mes ({mesLabelLargo(periodoActual)})
            <input className="sv-tests-input" type="number" min="0" style={{ width: 70 }} value={checkins} onChange={e => setCheckins(e.target.value)} />
            <button className="sv-tests-select" disabled={busy || checkins === ''} onClick={guardarCheckins}>Guardar</button>
          </label>
        )}
        <div className="sv-grp-modal__actions">
          <button className="sv-tests-select" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// «Bajo tarifa» (16/11 07:35 punto B.4): Eva escribe el porqué y marca revisado — la fila deja
// de estar en rojo. Si después cambia lo que paga, el backend ya no da por vigente este revisado
// y vuelve a salir en rojo solo, sin que haga falta borrar nada aquí.
function BajoTarifaModal({ alumno, onClose, onDone }) {
  // 17/11 11:50 (cowork): niños pagando el 80% de la tarifa sin ningún motivo apuntado —
  // bajoTarifaMotivoSugerido es solo una PREGUNTA del servidor ("¿Hermanos? (20%)", o el cupón
  // real si lo hay), nunca una decisión tomada sola — se precarga en el campo para que Eva la
  // confirme o la cambie, pero sigue en rojo hasta que ella pulse "Marcar revisado".
  const [motivo, setMotivo] = useState(alumno.bajoTarifaMotivoEva || alumno.bajoTarifaMotivoSugerido || alumno.notas || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const marcar = async () => {
    if (!motivo.trim()) { setErr('Pon el motivo.'); return }
    setBusy(true); setErr(null)
    try { await gestionGrupoBajoTarifaSet({ subId: alumno.subId, accion: 'marcar', motivo: motivo.trim() }); onDone() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const quitar = async () => {
    setBusy(true); setErr(null)
    try { await gestionGrupoBajoTarifaSet({ subId: alumno.subId, accion: 'quitar' }); onDone() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="sv-grp-overlay" onClick={onClose}>
      <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
        <h3>Bajo tarifa — {alumno.alumno || `Suscripción #${alumno.subId}`}</h3>
        <p className="sv-note">
          Tarifa esperada {alumno.tarifaEsperada != null ? fmtEur(alumno.tarifaEsperada) : '—'}/mes
          {alumno.diferenciaMensual != null && <> · paga <strong>{fmtEur(Math.abs(alumno.diferenciaMensual))}</strong>/mes de menos</>}.
          {alumno.bajoTarifaRevisado && <> Ya revisado por {alumno.bajoTarifaRevisadoPor} ({alumno.bajoTarifaRevisadoEn?.slice(0, 10)}).</>}
        </p>
        {!alumno.bajoTarifaRevisado && alumno.bajoTarifaMotivoSugerido && (
          <p className="sv-note">Sugerencia (confírmala o cámbiala): <strong>{alumno.bajoTarifaMotivoSugerido}</strong></p>
        )}
        <label className="sv-grp-field">Motivo
          <input className="sv-tests-input" type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Hermanos, bono familiar, Wellhub, 50%…" />
        </label>
        {err && <p className="sv-to-warn-txt">{err}</p>}
        <div className="sv-grp-modal__actions">
          <button className="sv-tests-select" onClick={onClose}>Cerrar</button>
          {alumno.bajoTarifaRevisado && <button className="sv-tests-remove" disabled={busy} onClick={quitar}>Quitar revisado</button>}
          <button className="sv-tests-save" disabled={busy} onClick={marcar}>Marcar revisado</button>
        </div>
      </div>
    </div>
  )
}

function AccionMenu({ alumno, onPick, onClose }) {
  if (alumno.esExterno) {
    return (
      <div className="sv-grp-overlay" onClick={onClose}>
        <div className="sv-grp-menu" onClick={e => e.stopPropagation()}>
          <button onClick={() => onPick('ext_cobrar')}>Marcar cobrado</button>
          <button onClick={() => onPick('ext_editar')}>Editar datos</button>
          <button onClick={() => onPick('exento')}>{alumno.exento ? 'Quitar exento/socio' : 'Marcar exento/socio'}</button>
          <button onClick={() => onPick('wellhub')}>Wellhub{alumno.wellhub ? ' ✓' : ''}</button>
          {alumno.bajoTarifa && <button onClick={() => onPick('bajo_tarifa')}>Bajo tarifa{alumno.bajoTarifaRevisado ? ' ✓' : ''}</button>}
          <button onClick={() => onPick('ext_borrar')}>Eliminar (alta por error)</button>
          <button className="sv-grp-menu__cancel" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    )
  }
  const puedePausar   = alumno.estado === 'activo' || alumno.estado === 'pendiente_pago'
  const puedeReanudar = alumno.estado === 'en_espera' || alumno.estado === 'pausado'
  const puedeBaja     = alumno.estado !== 'baja_fin_mes'
  return (
    <div className="sv-grp-overlay" onClick={onClose}>
      <div className="sv-grp-menu" onClick={e => e.stopPropagation()}>
        <button onClick={() => onPick('marcar_cobrado')}>Marcar cobrado</button>
        {puedePausar   && <button onClick={() => onPick('pausar')}>Pausar</button>}
        {puedeReanudar && <button onClick={() => onPick('reanudar')}>Reanudar</button>}
        {/* 17/11 19:10 (Ramiro, caso de Sergi Escribano): vuelve a clase tras lesión/ausencia a
            mitad de mes — anula los meses que no vino y cobra el actual, todo en la misma
            suscripción, sin duplicar ni tener que arreglarlo a mano. */}
        <button onClick={() => onPick('vuelve_tras_lesion')}>Vuelve tras lesión/ausencia</button>
        {puedeBaja     && <button onClick={() => onPick('dar_de_baja')}>Dar de baja</button>}
        <button onClick={() => onPick('nota')}>Nota</button>
        <button onClick={() => onPick('exento')}>{alumno.exento ? 'Quitar exento/socio' : 'Marcar exento/socio'}</button>
        <button onClick={() => onPick('cambiar_grupo')}>Cambiar de grupo/horario</button>
        <button onClick={() => onPick('optin_whatsapp')}>Consentimiento WhatsApp</button>
        <button onClick={() => onPick('editar_alumno')}>Editar nombre/teléfono</button>
        <button onClick={() => onPick('wellhub')}>Wellhub{alumno.wellhub ? ' ✓' : ''}</button>
        {alumno.bajoTarifa && <button onClick={() => onPick('bajo_tarifa')}>Bajo tarifa{alumno.bajoTarifaRevisado ? ' ✓' : ''}</button>}
        {alumno.otrasSubs?.map(s => (
          <button key={s.subId} onClick={() => onPick('fusionar', s.subId)}>Fusionar — cancelar #{s.subId}</button>
        ))}
        {/* Cowork, 14/11 18:40 punto 4: esta fila ES la vieja en espera (se cambió de clase) —
            la que se queda activa es otraActivaFuera, en otro grupo. Al revés que otrasSubs de
            arriba (ahí "alumno" es la que se queda y se cancelan las demás). */}
        {alumno.otraActivaFuera && (
          <button onClick={() => onPick('fusionar', alumno.subId)}>
            Cancelar la vieja — se queda activa #{alumno.otraActivaFuera.subId} ({alumno.otraActivaFuera.dia} {alumno.otraActivaFuera.horario})
          </button>
        )}
        <button className="sv-grp-menu__cancel" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}
const MES_CORTO_GRP = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MES_LARGO_GRP = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const mesLabelGrp = ym => { const [y, m] = ym.split('-'); return `${MES_CORTO_GRP[Number(m) - 1]} ${y.slice(2)}` }
// Para mensajes de WhatsApp: mes completo en minúscula, sin año (NOTAS_PARA_CODE_pestanas_grupos.md).
const mesLabelLargo = ym => MES_LARGO_GRP[Number(ym.split('-')[1]) - 1]
const PAGO_PENDIENTE = new Set(['pending', 'on-hold', 'failed'])

// Etiquetas en castellano para las claves de la vista previa de simulación (Ramiro, 2/11 09:42:
// "subId"/"proximoPago"/etc. en inglés no se lee para Eva). Lo que no está aquí se enseña con su
// nombre tal cual (mejor eso que ocultarlo).
const PREVIEW_LABEL = {
  subId: 'Nº suscripción', estadoAntes: 'Estado ahora', pedidoExistente: 'Pedido ya creado',
  proximoPago: 'Próximo pago', mesQueCubre: 'Mes que paga',
  completaraPedidoExistente: 'Completa el pedido ya creado', seGuardaraComoAdelantado: 'Se guarda como pago adelantado (sin factura)',
  adelantadoYaGuardado: 'Ya hay un adelantado guardado', pasaAActiva: 'Queda activa', mantienePausa: 'Sigue en pausa',
  importe: 'Importe', metodo: 'Método', fecha: 'Fecha', parcial: 'Pago parcial',
  reactivaLaSuscripcion: 'Reactiva la suscripción', pedidosACancelar: 'Pedidos sin pagar que se cancelan',
  estadoDespues: 'Estado después', fechaFin: 'Fecha fin', fechaVuelta: 'Fecha de vuelta',
}
const previewLabel = k => PREVIEW_LABEL[k] || k
const previewValor = v => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'object') return v.importe != null ? `${fmtEur(v.importe)} · ${v.fecha || ''} · ${v.por || ''}`.trim() : JSON.stringify(v)
  return String(v)
}

// Marca de consentimiento de WhatsApp junto al nombre: gris = sin preguntar, verde = sí, rojo =
// no/BAJA. Al pulsarla abre el mismo diálogo de "Consentimiento WhatsApp" (Ramiro, 31/10 17:17).
function WaMark({ alumno, onClick }) {
  const v = alumno.optinWhatsapp
  const cls = v === 'si' ? 'sv-wa--si' : v === 'no' ? 'sv-wa--no' : 'sv-wa--sin'
  const label = v === 'si' ? 'Sí' : v === 'no' ? 'No/BAJA' : 'Sin preguntar'
  return (
    <button type="button" className={`sv-wa ${cls}`} title={`WhatsApp: ${label} — pulsa para cambiar`} onClick={e => { e.stopPropagation(); onClick() }}>
      (WA)
    </button>
  )
}

function ProfesorLine({ dia, horario, edad }) {
  const profesores = profesoresDeGrupo(dia, horario, edad)
  if (!profesores.length) return null
  const mismo = profesores.every(d => d.profs.length === 1 && d.profs[0] === profesores[0].profs[0])
  const texto = mismo
    ? profesores[0].profs.join(', ')
    : profesores.map(d => `${d.dia}: ${d.profs.join('/')}`).join(' · ')
  return (
    <p className="sv-note sv-grp-profesor" title="Sacado del horario de referencia (staffSchedule.js) por día y hora de clase: puede no reflejar sustituciones o cambios recientes.">
      👤 Profesor{profesores.some(d => d.profs.length > 1) || !mismo ? 'es' : ''}: {texto}
    </p>
  )
}

// Tabla de alumnos de Grupos, compartida entre "un grupo concreto" y, por bloques, "Todos los
// grupos" (cowork, 19:35: el profesor y el grupo de cada uno también tienen que verse ahí).
function TablaAlumnos({ alumnos, meses, onWa, onMenu }) {
  return (
    <div className="sv-tests-scroll">
      <table className="sv-tests-table">
        <thead>
          <tr>
            <th>Alumno (pagador)</th><th>Teléfono</th><th>Días</th><th>Estado</th>
            {meses.map(m => <th key={m}>{mesLabelGrp(m)}</th>)}
            <th>Notas</th><th></th>
          </tr>
        </thead>
        <tbody>
          {alumnos.map(a => {
            const est = ESTADO_LABEL[a.estado] || { txt: a.estado, cls: '' }
            // Wellhub + «Bajo tarifa» (16/11 07:35): rojo solo mientras de verdad falta revisar
            // — una vez Eva lo marca, se queda con el chip pero sin el fondo rojo.
            const bajoTarifaSinRevisar = a.bajoTarifa && !a.bajoTarifaRevisado
            return (
              <tr key={a.subId} className={bajoTarifaSinRevisar ? 'sv-grp-row--bajo-tarifa' : ''}>
                <td>
                  {a.alumno || <span className="sv-ot-muted">—</span>}
                  {a.telefono
                    ? <WaMark alumno={a} onClick={() => onWa(a)} />
                    : <span className="sv-wa sv-wa--sin" title="No se puede pedir el consentimiento de WhatsApp sin teléfono guardado">(sin tlf)</span>}
                  {a.sinNombre && <span className="sv-to-warn-txt" title="No es un nombre real: es el usuario de la cuenta (sin dirección de facturación). Pulsa ⋯ → «Editar nombre/teléfono» para arreglarlo."> ⚠ no es nombre real</span>}
                  {a.exento && <span title="Exento/socio: no se le pide cobro">*</span>}
                  {a.precioEspecial && (
                    <span className="sv-to-warn-txt" title={`Precio especial: ${fmtEur(a.precioEspecial.importe)} · ${a.precioEspecial.motivo} · ${a.precioEspecial.por} · ${a.precioEspecial.desde}`}> 💶 precio especial</span>
                  )}
                  {a.otrasSubs?.length > 0 && (
                    <span title={`${a.otrasSubs.length} suscripción(es) antigua(s) colgando en este grupo (duplicado)`}> ⚠</span>
                  )}
                  {a.fusionadoExterno && (
                    <span className="sv-ot-muted" title="Antes pagaba fuera de la web (Excel) — ya fusionado con esta cuenta, el historial de pagos del Excel está incluido aquí."> (fusionado con Excel)</span>
                  )}
                  {a.wellhub && (
                    <span className="sv-to-warn-txt" title={`Paga parte de su cuota con Wellhub: tiene que pasar el pase SIEMPRE que venga, si no no se cobra esa parte.${a.wellhubCheckinsFaltan != null ? ` Le tocan ${a.wellhubCheckinsFaltan} check-ins/mes.` : ''}`}> 📱 Wellhub{a.wellhubCheckinsFaltan != null ? ` (${a.wellhubCheckinsFaltan})` : ''}</span>
                  )}
                  {a.bajoTarifa && (
                    <span className={a.bajoTarifaRevisado ? 'sv-ot-muted' : 'sv-to-bad'} title={`Tarifa esperada ${a.tarifaEsperada != null ? fmtEur(a.tarifaEsperada) : '—'}/mes · paga ${a.diferenciaMensual != null ? fmtEur(Math.abs(a.diferenciaMensual)) : '—'}/mes de menos${a.bajoTarifaRevisado ? ` · revisado por ${a.bajoTarifaRevisadoPor}: ${a.bajoTarifaMotivoEva}` : ' · sin revisar'}`}>
                      {' '}{a.bajoTarifaRevisado ? '✓' : '⚠'} bajo tarifa (−{a.diferenciaMensual != null ? fmtEur(Math.abs(a.diferenciaMensual)) : '?'}/mes)
                    </span>
                  )}
                  {(a.edad || '').includes('Menores') && (
                    a.tutorNombre || a.tutorTelefono
                      ? <div className="sv-ot-muted sv-grp-tutor">👪 {a.tutorNombre || '—'}{a.tutorTelefono ? ` · ${a.tutorTelefono}` : ''}</div>
                      : <div className="sv-to-warn-txt sv-grp-tutor">👪 falta el tutor</div>
                  )}
                </td>
                <td className="sv-ot-muted">{a.telefono || '—'}</td>
                <td>{a.dias}</td>
                <td><span className={`sv-grp-estado ${est.cls}`}>{est.txt}</span></td>
                {meses.map(m => {
                  const p = a.pagos[m]
                  if (!p) return <td key={m} className="sv-ot-muted">—</td>
                  if (p.cubierto) {
                    return (
                      <td key={m} className="sv-pago-cubierto" title={`Cubierto por el pago del ${p.fecha} (${fmtEur(p.importe)}, ${p.metodo})`}>
                        Pagado ({p.tipo || '…'})
                      </td>
                    )
                  }
                  if (p.adelantado) {
                    return (
                      <td key={m} className="sv-pago-cubierto" title={`Pagado por adelantado el ${p.fecha} (${p.metodo}). Se aplicará de verdad cuando WooCommerce genere esta renovación.`}>
                        {fmtEur(p.importe)} (adelantado)
                      </td>
                    )
                  }
                  const pendiente = PAGO_PENDIENTE.has(p.estadoPedido)
                  return (
                    <td key={m} className={pendiente ? 'sv-to-bad' : ''} title={`${p.metodo} · ${p.fecha}`}>
                      {fmtEur(p.importe)}{pendiente ? ' ⏳' : ''}
                    </td>
                  )
                })}
                <td className="sv-ot-muted">{a.notas || '—'}</td>
                <td><button className="sv-tests-remove" onClick={() => onMenu(a)} title="Acciones">⋯</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const ESTADO_BUSQUEDA_LABEL = {
  activo: 'Activo', en_espera_o_pausado: 'En espera / pausado', pendiente_pago: 'Pendiente de pago', baja: 'De baja',
  externo: 'Externo (fuera de la web)', externo_baja: 'Externo, de baja',
}

// Primer paso de "Añadir alumno" (grupos_como_excel.md, punto 5): buscar dónde está alguien
// ahora. "Transferir aquí" / "Añadir a este grupo" / "Crear alumno nuevo" quedan para la
// siguiente ronda — ver la nota en NOTAS_PARA_CODE_mananas_y_datos.md sobre por qué.
function BuscarAlumnoModal({ onClose, grupos = [] }) {
  const [q, setQ]           = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando]     = useState(false)
  const [err, setErr]       = useState(null)
  const [crear, setCrear]   = useState(false) // "Crear cliente en la web" (Ramiro, 07/11 08:06)

  async function buscar() {
    if (q.trim().length < 2) { setErr('Escribe al menos 2 caracteres.'); return }
    setBuscando(true); setErr(null)
    try {
      const data = await gestionBuscarAlumno(q.trim())
      setResultados(data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBuscando(false)
    }
  }

  if (crear) return <CrearClienteForm onClose={onClose} onVolver={() => setCrear(false)} qInicial={q} grupos={grupos} />

  return (
    <div className="sv-grp-overlay" onClick={onClose}>
      <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
        <h3>Añadir alumno — buscar primero</h3>
        <p className="sv-note">
          Busca por nombre, teléfono o email en suscripciones (de cualquier estado, también antiguos alumnos),
          externos y usuarios de WordPress. "Transferir aquí" y "Añadir a este grupo" llegan en la siguiente
          ronda — si no aparece, puedes crear el cliente nuevo en la web directamente.
        </p>
        <label className="sv-grp-field">Nombre, teléfono o email
          <input
            className="sv-tests-input" type="text" value={q} autoFocus
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') buscar() }}
            placeholder="Ej. Marta, 6xxxxxxxx, marta@…"
          />
        </label>
        {err && <p className="sv-to-warn-txt">{err}</p>}
        <div className="sv-grp-modal__actions">
          <button className="sv-tests-select" onClick={onClose}>Cerrar</button>
          <button className="sv-tests-select" onClick={() => setCrear(true)}>+ Crear cliente en la web</button>
          <button className="sv-tests-save" disabled={buscando} onClick={buscar}>{buscando ? 'Buscando…' : 'Buscar'}</button>
        </div>

        {resultados !== null && (
          resultados.length === 0 ? (
            <p className="sv-empty">Nadie coincide con «{q}». Puede ser alumno nuevo de verdad.</p>
          ) : (
            <ul className="sv-grp-preview">
              {resultados.map((p, i) => (
                <li key={i} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <strong>{p.nombre || '(sin nombre)'}</strong>
                  <span className="sv-ot-muted">{p.telefono || '—'}{p.email ? ` · ${p.email}` : ''}</span>
                  {(p.tutorNombre || p.tutorTelefono) && (
                    <span className="sv-ot-muted">👪 Tutor: {p.tutorNombre || '—'}{p.tutorTelefono ? ` · ${p.tutorTelefono}` : ''}</span>
                  )}
                  {p.grupos.length === 0 ? (
                    <span className="sv-to-warn-txt">Registrado en WordPress, sin ninguna clase activa ni externo.</span>
                  ) : (
                    p.grupos.map((g, j) => (
                      <span key={j} className="sv-ot-muted">
                        {g.label || '(sin grupo)'} · {g.edad} — {ESTADO_BUSQUEDA_LABEL[g.estado] || g.estado}
                      </span>
                    ))
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  )
}

// Abonos existentes (NOTAS_PARA_CODE_abono_anual.md) — productos simples, no variaciones de
// catálogo, así que se listan a mano aquí (igual que ya hace blokes_get_abono_subscripciones()
// en el backend).
const ABONOS_OPCIONES = [
  { id: 5115, label: 'Bono mensual todo el día — 69 €/mes' },
  { id: 5114, label: 'Bono mensual mañana — 58 €/mes' },
  { id: 7753, label: 'Abono anual todo el día — 749 €/año' },
  { id: 7754, label: 'Abono anual mañana — 629 €/año' },
  { id: 7755, label: 'Abono trimestral todo el día — 195 € / 3 meses' },
  { id: 7756, label: 'Abono trimestral mañana — 165 € / 3 meses' },
]

// "Crear cliente en la web" (Ramiro, 07/11 08:06): hasta ahora "Añadir alumno" solo buscaba o
// daba de alta un externo (fuera de la web) — esto crea de verdad el cliente de WooCommerce + su
// suscripción, con Simular primero como el resto de acciones de Grupos.
function CrearClienteForm({ onClose, onVolver, qInicial, grupos = [] }) {
  const [nombre, setNombre]       = useState('')
  const [apellidos, setApellidos] = useState('')
  const [email, setEmail]         = useState(qInicial?.includes('@') ? qInicial : '')
  const [telefono, setTelefono]   = useState(qInicial && !qInicial.includes('@') ? qInicial : '')
  const [tipo, setTipo]           = useState('clase') // 'clase' | 'abono'
  const [grupoNuevo, setGrupoNuevo] = useState('') // "dia|horario|edad"
  const [plan, setPlan]           = useState('monthly')
  const [abonoId, setAbonoId]     = useState(ABONOS_OPCIONES[0].id)
  const [fechaInicio, setFechaInicio] = useState(hoyISO())
  const [primerPago, setPrimerPago]   = useState('ya_pagado')
  const [metodo, setMetodo]       = useState('transferencia')
  const [importe, setImporte]     = useState('')
  const [fechaPago, setFechaPago] = useState(hoyISO())
  const [ajustarPrecio, setAjustarPrecio] = useState('')
  const [motivoExcepcion, setMotivoExcepcion] = useState('')
  const [enviarAcceso, setEnviarAcceso] = useState(false)
  const [usarClienteId, setUsarClienteId] = useState(null)
  const [confirmarNuevo, setConfirmarNuevo] = useState(false)
  // Ramiro, 15/11 08:35: "¿también esta nueva o es un duplicado?" — por defecto no, hasta que
  // alguien lo confirme a propósito.
  const [confirmarDuplicado, setConfirmarDuplicado] = useState(false)
  const [preview, setPreview]     = useState(null)
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState(null)

  // Cowork, 14/11 18:40 punto 6: mismo cambio que en "Cambiar de grupo" — la lista de grupos de
  // verdad, no el catálogo de 163 variaciones de WooCommerce.
  const clasesSemanales = grupos
  const [dia, horario, edad] = grupoNuevo.split('|')

  async function submit(forzarReal) {
    setBusy(true); setErr(null)
    try {
      if (!nombre.trim()) throw new Error('Pon el nombre.')
      if (!email.trim() && !telefono.trim()) throw new Error('Pon email o teléfono (al menos uno).')
      if (tipo === 'clase' && !grupoNuevo) throw new Error('Elige el grupo.')
      if (primerPago === 'ya_pagado' && (!importe || Number(importe) <= 0)) throw new Error('Pon el importe del primer pago.')
      if (forzarReal && preview?.posibleDuplicadoSub && !confirmarDuplicado) throw new Error('Confirma si es un duplicado o quieres crear otra suscripción para esta persona.')
      const body = {
        nombre: nombre.trim(), apellidos: apellidos.trim(), email: email.trim(), telefono: telefono.trim(),
        tipo, fechaInicio, primerPago, enviarAcceso, simular: !forzarReal,
        ...(usarClienteId ? { usarClienteId } : {}),
        ...(confirmarNuevo ? { confirmarNuevo: true } : {}),
        ...(preview?.posibleDuplicadoSub ? { confirmarDuplicado } : {}),
        ...(tipo === 'clase' ? { dia, horario, edad, plan } : { productoAbonoId: abonoId }),
        ...(primerPago === 'ya_pagado' ? { metodo, importe: Number(importe), fechaPago } : {}),
        ...(preview?.precioCatalogo != null && Number(importe) !== preview.precioCatalogo && ajustarPrecio ? { ajustarPrecio, motivoExcepcion } : {}),
      }
      const res = await gestionAltaCliente(body)
      if (!forzarReal) setPreview(res)
      else { onClose(); alert(res?.pagoUrl ? `Cliente creado. Enlace de pago: ${res.pagoUrl}` : 'Cliente creado.') }
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const importeDistinto = preview && preview.precioCatalogo != null && Math.abs(Number(importe || preview.precioCatalogo) - preview.precioCatalogo) > 0.009

  return (
    <div className="sv-grp-overlay" onClick={onClose}>
      <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
        <h3>Crear cliente en la web</h3>

        {preview ? (
          <>
            <p className="sv-to-warn-txt">Simulación: no se ha creado nada todavía.</p>
            <ul className="sv-grp-preview">
              <li><span>Cliente</span><span>{preview.nombre} · {preview.email || preview.telefono}</span></li>
              <li><span>Grupo/producto</span><span>{preview.producto || '—'} {preview.dia ? `· ${preview.dia} · ${preview.horario} · ${preview.edad}` : ''}</span></li>
              <li><span>Precio catálogo</span><span>{fmtEur(preview.precioCatalogo)}</span></li>
              <li><span>Primer pago</span><span>{preview.primerPago === 'ya_pagado' ? `${fmtEur(preview.importeFinal)} ya cobrado` : 'Enlace de pago con tarjeta'}</span></li>
              {preview.aviso && <li><span>Aviso</span><span>{preview.aviso}</span></li>}
            </ul>
            {preview.posibleDuplicado && (
              <div className="sv-grp-field sv-to-warn-txt">
                <p>Ya hay alguien parecido: <strong>{preview.posibleDuplicado.nombre}</strong> ({preview.posibleDuplicado.telefono || preview.posibleDuplicado.email}).</p>
                <button className="sv-tests-select" type="button" onClick={() => setUsarClienteId(preview.posibleDuplicado.uid)}>
                  Usar este cliente {usarClienteId === preview.posibleDuplicado.uid ? '✓' : ''}
                </button>
                <button className="sv-tests-select" type="button" onClick={() => setConfirmarNuevo(true)}>
                  Es una persona distinta, crear de todas formas {confirmarNuevo ? '✓' : ''}
                </button>
              </div>
            )}
            {preview.posibleDuplicadoSub && (
              <div className="sv-grp-field sv-to-warn-txt sv-dup-aviso">
                <p>⚠️ <strong>Cuidado: esta persona ya tiene una suscripción</strong>:</p>
                <ul className="sv-aviso__lista">
                  {preview.posibleDuplicadoSub.map(s => (
                    <li key={s.subId}>#{s.subId} · {s.dia} {s.horario}{s.edad !== 'Adultos' ? ` · ${s.edad}` : ''} · {s.estado} · {s.importe != null ? fmtEur(s.importe) : '—'}{s.proximoPago ? ` · próximo pago ${s.proximoPago}` : ''}</li>
                  ))}
                </ul>
                <p>¿Quieres que tenga también esta nueva o es un duplicado?</p>
                <button className="sv-tests-select" type="button" onClick={() => setConfirmarDuplicado(false)}>
                  Es un duplicado: no crear {!confirmarDuplicado ? '✓' : ''}
                </button>
                <button className="sv-tests-select" type="button" onClick={() => setConfirmarDuplicado(true)}>
                  Sí, quiero las dos {confirmarDuplicado ? '✓' : ''}
                </button>
              </div>
            )}
            {importeDistinto && (
              <div className="sv-grp-field sv-to-warn-txt">
                <p>El importe ({fmtEur(Number(importe))}) no coincide con el catálogo ({fmtEur(preview.precioCatalogo)}). Elige una opción:</p>
                <label className="sv-grp-field sv-grp-field--check">
                  <input type="radio" name="ajustarPrecioAlta" checked={ajustarPrecio === 'solo_este_mes'} onChange={() => setAjustarPrecio('solo_este_mes')} />
                  Cobrar este importe solo este mes
                </label>
                <label className="sv-grp-field sv-grp-field--check">
                  <input type="radio" name="ajustarPrecioAlta" checked={ajustarPrecio === 'desde_ahora'} onChange={() => setAjustarPrecio('desde_ahora')} />
                  Y usar este precio a partir de ahora
                </label>
                <label className="sv-grp-field">Motivo
                  <input className="sv-tests-input" type="text" value={motivoExcepcion} onChange={e => setMotivoExcepcion(e.target.value)} placeholder="Hermanos, acuerdo…" />
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            <label className="sv-grp-field">Nombre
              <input className="sv-tests-input" type="text" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
            </label>
            <label className="sv-grp-field">Apellidos
              <input className="sv-tests-input" type="text" value={apellidos} onChange={e => setApellidos(e.target.value)} />
            </label>
            <label className="sv-grp-field">Email
              <input className="sv-tests-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="sv-grp-field">Teléfono
              <input className="sv-tests-input" type="text" value={telefono} onChange={e => setTelefono(e.target.value)} />
            </label>
            <label className="sv-grp-field">Tipo
              <select className="sv-tests-select" value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="clase">Clase semanal</option>
                <option value="abono">Abono (escalada libre)</option>
              </select>
            </label>
            {tipo === 'clase' ? (
              <>
                <label className="sv-grp-field">Grupo
                  <select className="sv-tests-select" value={grupoNuevo} onChange={e => setGrupoNuevo(e.target.value)}>
                    <option value="">— Elige día · horario · edad —</option>
                    {clasesSemanales.map(c => (
                      <option key={`${c.dia}|${c.horario}|${c.edad}`} value={`${c.dia}|${c.horario}|${c.edad}`}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sv-grp-field">Plan de pago
                  <select className="sv-tests-select" value={plan} onChange={e => setPlan(e.target.value)}>
                    <option value="monthly">Mensual</option>
                    <option value="quarterly">Trimestral</option>
                    <option value="annual">Anual</option>
                  </select>
                </label>
              </>
            ) : (
              <label className="sv-grp-field">Abono
                <select className="sv-tests-select" value={abonoId} onChange={e => setAbonoId(Number(e.target.value))}>
                  {ABONOS_OPCIONES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
            )}
            <label className="sv-grp-field">Fecha de inicio
              <input className="sv-tests-input" type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
            </label>
            <label className="sv-grp-field">Primer pago
              <select className="sv-tests-select" value={primerPago} onChange={e => setPrimerPago(e.target.value)}>
                <option value="ya_pagado">Ya ha pagado</option>
                <option value="enlace_pago">Mandarle enlace de pago con tarjeta</option>
              </select>
            </label>
            {primerPago === 'ya_pagado' && (
              <>
                <label className="sv-grp-field">Método
                  <select className="sv-tests-select" value={metodo} onChange={e => setMetodo(e.target.value)}>
                    {METODO_OPCIONES.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                  </select>
                </label>
                <label className="sv-grp-field">Importe (€)
                  <input className="sv-tests-input" type="number" step="0.01" min="0" value={importe} onChange={e => setImporte(e.target.value)} />
                </label>
                <label className="sv-grp-field">Fecha del pago
                  <input className="sv-tests-input" type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
                </label>
              </>
            )}
            <label className="sv-grp-field sv-grp-field--check">
              <input type="checkbox" checked={enviarAcceso} onChange={e => setEnviarAcceso(e.target.checked)} />
              Enviarle email para que ponga su contraseña
            </label>
          </>
        )}

        {err && <p className="sv-error">{err}</p>}

        <div className="sv-grp-modal__actions">
          <button className="sv-tests-select" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="sv-tests-select" onClick={preview ? () => setPreview(null) : onVolver} disabled={busy}>Volver</button>
          {preview ? (
            <button
              className="sv-tests-danger sv-tests-danger--confirm"
              disabled={busy || (preview.posibleDuplicadoSub && !confirmarDuplicado)}
              title={preview.posibleDuplicadoSub && !confirmarDuplicado ? 'Elige "Es un duplicado" o "Sí, quiero las dos" antes de confirmar.' : undefined}
              onClick={() => submit(true)}
            >
              {busy ? 'Creando…' : 'Confirmar de verdad'}
            </button>
          ) : (
            <button className="sv-tests-save" disabled={busy} onClick={() => submit(false)}>{busy ? 'Simulando…' : 'Simular'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

// Buscador de Grupos (Ramiro, 1/11 18:50): tolerante a tildes/mayúsculas en el nombre, y el
// teléfono se compara sin +34/espacios/puntos para que dé igual cómo se haya escrito.
function sgNormalizarTexto(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function sgNormalizarTelefono(s) {
  return (s || '').toString().replace(/[^\d]/g, '').replace(/^34(?=.{9,})/, '')
}
function sgCoincideBusqueda(a, termino, tel) {
  if (!termino) return true
  if (sgNormalizarTexto(a.alumno).includes(termino)) return true
  if (tel && sgNormalizarTelefono(a.telefono).includes(tel)) return true
  return false
}

// WhatsApp (NOTAS_PARA_CODE_pestanas_grupos.md, punto 3): abre WhatsApp Web con el mensaje ya
// escrito, Eva revisa y le da a enviar — nunca se manda solo. Teléfono a E.164 básico (España
// 34+9 por defecto; si ya trae más de 9 dígitos se asume que ya lleva su código de país —
// aceptar internacionales de verdad queda para cuando se toque blokes_externos_normaliza_telefono()
// de verdad, que es una función muy compartida).
function sgTelefonoWhatsApp(tel) {
  const digits = (tel || '').toString().replace(/[^\d]/g, '')
  if (!digits) return null
  if (digits.length === 9) return '34' + digits
  if (digits.length > 9) return digits
  return null
}
function sgEsMenor(a) { return !!(a.tutorNombre || a.tutorTelefono) }
function sgTelefonoParaWhatsApp(a) { return sgEsMenor(a) && a.tutorTelefono ? a.tutorTelefono : a.telefono }
function sgNombreParaMensaje(a) {
  if (sgEsMenor(a) && a.tutorNombre) return a.tutorNombre.split(' ')[0]
  return (a.alumno || '').split(' ')[0] || 'hola'
}
function WhatsAppBtn({ a, mensaje }) {
  const tel = sgTelefonoParaWhatsApp(a)
  const e164 = sgTelefonoWhatsApp(tel)
  if (!e164) return <span className="sv-ot-muted" title="Sin teléfono: revisar datos">Sin teléfono</span>
  return (
    <button
      className="sv-tests-select"
      // web.whatsapp.com/send en vez de wa.me: wa.me redirige por api.whatsapp.com, que ofrece
      // abrir la app de escritorio en vez de la pestaña de WhatsApp Web que Eva ya tiene abierta,
      // y de camino rompía los emojis del mensaje (NOTAS_PARA_CODE_pestanas_grupos.md, 3/11
      // 10:45). Nombre de ventana fijo para reutilizar siempre la misma pestaña.
      onClick={() => window.open(`https://web.whatsapp.com/send?phone=${e164}&text=${encodeURIComponent(mensaje)}`, 'blokes_whatsapp')}
    >💬 WhatsApp</button>
  )
}

// Último mes (de los que se han cargado) con un pago contado de verdad — para "Un mes sin
// venir", que necesita decir desde cuándo no viene sin más.
function sgUltimoMesPagado(a, meses) {
  for (let i = meses.length - 1; i >= 0; i--) {
    const p = a.pagos[meses[i]]
    if (p && (p.cubierto || p.adelantado || p.estadoPedido === 'completed' || p.estadoPedido === 'processing')) return meses[i]
  }
  return null
}
function sgPagoContado(p) {
  return !!(p && (p.cubierto || p.adelantado || p.estadoPedido === 'completed' || p.estadoPedido === 'processing'))
}

const CAMBIO_TIPO_LABEL = {
  pago_nuevo: 'Pago nuevo', nota: 'Nota cambiada', telefono: 'Teléfono cambiado',
  alumno_nuevo: 'Alumno nuevo', fila_borrada: 'Fila borrada del Excel',
  web_sin_fila: 'Cobro web sin fila en el Excel',
  fila_duplicada_excel: 'Fila repetida en el Excel',
  importe_sospechoso: '⚠ Importe sospechoso en el Excel',
}

// Descripción de cada cambio según su tipo — "datos" viene en camelCase desde el servidor
// (importe/metodo/fecha para pago_nuevo, notaAntes/notaDespues, telefonoAntes/telefonoDespues).
function CambioDetalle({ c }) {
  const d = c.datos || {}
  switch (c.tipo) {
    case 'pago_nuevo':
      return <span>{fmtEur(d.importe)} ({d.metodo}){d.fecha ? ` el ${d.fecha}` : ''} — mes {c.mes}</span>
    case 'nota':
      return <span>«{d.notaAntes || '—'}» → «{d.notaDespues || '—'}»</span>
    case 'telefono':
      return <span>{d.telefonoAntes || '—'} → {d.telefonoDespues || '—'}</span>
    case 'alumno_nuevo':
      return <span>{d.nombre} {d.telefono ? `· ${d.telefono}` : ''}</span>
    case 'fila_borrada':
      return <span>Ya no está en el Excel — no se da de baja sola, solo aviso.</span>
    case 'web_sin_fila':
      return <span>Se cobró en la web ({fmtEur(d.importe)}, {d.metodo}) pero no se encontró su fila en el Excel — añádela y pulsa Aplicar para escribirlo solo.</span>
    case 'fila_duplicada_excel':
      return <span>Misma persona en {d.claves?.length || 2} filas de esta pestaña del Excel{d.telefonos?.length > 1 ? ` (teléfonos: ${d.telefonos.filter(Boolean).join(', ') || 'alguna sin teléfono'})` : ''} — Blokes no escribe en el Excel, bórrala a mano cuando puedas y luego marca esto como visto.</span>
    case 'importe_sospechoso':
      return <span>{fmtEur(d.importe)} ({d.metodo}) en mes {c.mes} — nadie cobra tanto por una clase; seguramente una fecha u otro dato metido por error en la columna de importe. No se ha sumado a ningún total. Corrige la celda en el Excel y luego marca esto como visto (Aplicar no hace nada aquí, solo lo quita de la lista).</span>
    default:
      return <span className="sv-ot-muted">{JSON.stringify(d)}</span>
  }
}

// Bandeja "Cambios hechos en el Excel" (NOTAS_PARA_CODE_sync_grupos.md, paso 2): lo que Eva
// apunte en el Excel entra aquí para decidir Aplicar/Descartar, nunca se escribe solo —
// excepto la primera sincronización de cada pestaña, que es la foto inicial (sin cambios).
function SyncGruposCambiosPanel() {
  const [cambios, setCambios] = useState(null)
  const [ultima, setUltima] = useState(null)
  const [estadoFiltro, setEstadoFiltro] = useState('pendiente')
  const [sincronizando, setSincronizando] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [err, setErr] = useState(null)
  const [resumenSync, setResumenSync] = useState(null)
  const [limpiando, setLimpiando] = useState(false)
  const [reevaluando, setReevaluando] = useState(false)
  const [reevaluandoMetodo, setReevaluandoMetodo] = useState(false)
  const [detalleSinFila, setDetalleSinFila] = useState(null)
  const [diagnosticando, setDiagnosticando] = useState(false)
  const [diagnostico, setDiagnostico] = useState(null)
  const [limpiandoMismoImporte, setLimpiandoMismoImporte] = useState(false)
  const [resultadoMismoImporte, setResultadoMismoImporte] = useState(null)
  const [deshaciendo, setDeshaciendo] = useState(false)
  const [resultadoDeshacer, setResultadoDeshacer] = useState(null)

  async function cargar(estado = estadoFiltro) {
    setErr(null)
    try {
      const r = await syncGruposCambiosGet(estado)
      setCambios(r.cambios || [])
      setUltima(r.ultimaSincronizacion)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function sincronizarAhora() {
    setSincronizando(true); setErr(null)
    try {
      const r = await syncGruposSincronizar()
      setResumenSync(r)
      await cargar()
    } catch (e) { setErr(e.message) } finally { setSincronizando(false) }
  }
  // 18/11 (cowork, GRAVE: 499 "pago nuevo" de hace meses colándose como pendientes): el backend
  // ahora bloquea "Aplicar" en un pago de hace más de 2 meses (código mes_antiguo) hasta que
  // alguien confirme a propósito que de verdad quiere escribirlo — para que Eva no pueda apuntar
  // ni facturar un cobro viejo por error de un solo click.
  async function aplicar(id) {
    setBusyId(id); setErr(null)
    try {
      await syncGruposCambioAplicar(id)
      await cargar()
    } catch (e) {
      if (e.code === 'mes_antiguo') {
        if (window.confirm(e.message + '\n\n¿Confirmas que quieres aplicarlo de verdad?')) {
          try { await syncGruposCambioAplicar(id, true); await cargar() }
          catch (e2) { setErr(e2.message) }
        }
      } else {
        setErr(e.message)
      }
    } finally { setBusyId(null) }
  }
  async function descartar(id) {
    setBusyId(id); setErr(null)
    try { await syncGruposCambioDescartar(id); await cargar() }
    catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }
  // Limpieza única (17/11 16:20, cowork): las propuestas de pestañas Balance y los pagos viejos
  // ya pendientes de ANTES de 589ab3a no se limpian solas (el arreglo solo evita que se creen
  // nuevas) — este botón las descarta de golpe.
  async function limpiarPendientesViejos() {
    if (!window.confirm('¿Descartar las propuestas pendientes de pestañas Balance y los pagos viejos de antes del arreglo? No se puede deshacer de golpe (quedan como "descartado", nunca se borran).')) return
    setLimpiando(true); setErr(null)
    try {
      const r = await syncGruposLimpiarPendientesViejos()
      await cargar()
      window.alert(`${r.descartados} propuesta(s) descartada(s).`)
    } catch (e) { setErr(e.message) } finally { setLimpiando(false) }
  }
  // 17/11 18:15 (cowork): "Cobro web sin fila" viejos (Raúl Bañez...) se quedaron pendientes de
  // antes de la búsqueda por teléfono en otras pestañas — esto los reintenta de golpe. 18/11:
  // además del recuento, enseña el detalle de cada uno (pestaña buscada, teléfono) para poder
  // ver dónde falla sin tener que pedir el log de gestión aparte.
  // 18/11 (cowork): "el panel prometido no aparece en la página" — el detalle se mandaba solo
  // por window.alert(), un diálogo del navegador que no queda en el DOM de la página (y puede
  // estar bloqueado en según qué entorno de pruebas). Ahora se guarda en estado y se pinta
  // inline, debajo de los botones, además de seguir devolviéndolo la API.
  async function reevaluarSinFila() {
    setReevaluando(true); setErr(null); setDetalleSinFila(null)
    try {
      const r = await syncGruposReevaluarSinFila()
      await cargar()
      setDetalleSinFila(r)
    } catch (e) { setErr(e.message) } finally { setReevaluando(false) }
  }
  async function diagnosticarPagoViejo() {
    setDiagnosticando(true); setErr(null); setDiagnostico(null)
    try { setDiagnostico(await syncGruposDiagnosticoPagoViejo(15)) }
    catch (e) { setErr(e.message) } finally { setDiagnosticando(false) }
  }
  // 18/11 09:30 (cowork, GRAVE): la versión anterior de este botón comparaba contra la FOTO del
  // Excel (que siempre coincide con el Excel, por definición) y descartó también pagos reales
  // de octubre/noviembre que todavía no habían llegado a la web. Arreglado para comparar contra
  // la WEB de verdad (pedido completed/processing de la suscripción, o la tabla de pagos de
  // externos) — solo cierra lo que YA está cobrado de verdad.
  async function limpiarPagoNuevoMismoImporte() {
    if (!window.confirm('¿Descartar los «pago nuevo» pendientes que ya estén cobrados de verdad en la web para ese mes? No se puede deshacer de golpe (quedan como "descartado", nunca se borran).')) return
    setLimpiandoMismoImporte(true); setErr(null); setResultadoMismoImporte(null)
    try {
      const r = await syncGruposLimpiarPagoNuevoMismoImporte()
      await cargar()
      setResultadoMismoImporte(r)
    } catch (e) { setErr(e.message) } finally { setLimpiandoMismoImporte(false) }
  }
  // 18/11 09:30 (cowork, GRAVE): deshace la limpieza rota — reabre (vuelve a "pendiente") todo
  // lo que se había descartado por ese motivo (tanto el botón manual como el cierre automático
  // de b3767f5, ya quitado) y lo reevalúa ya con la comprobación arreglada, para que solo
  // queden descartados los que de verdad estén cobrados en la web.
  async function deshacerLimpiezaMismoImporte() {
    if (!window.confirm('¿Reabrir todo lo que se descartó por error con la limpieza rota (comparaba contra el Excel) y reevaluarlo contra la web de verdad?')) return
    setDeshaciendo(true); setErr(null); setResultadoDeshacer(null)
    try {
      const r = await syncGruposDeshacerLimpiezaMismoImporte()
      await cargar()
      setResultadoDeshacer(r)
    } catch (e) { setErr(e.message) } finally { setDeshaciendo(false) }
  }
  // 18/11 (cowork): las propuestas de "pago nuevo" que ya estaban pendientes de antes del
  // arreglo de "TA"=tarjeta se quedaron con el método equivocado guardado — esto relee la fila
  // de verdad en el Excel y corrige el método guardado en cada pendiente, sin aplicar nada en
  // WooCommerce todavía (sigue habiendo que pulsar "Aplicar" para cada una).
  async function reevaluarMetodoPago() {
    setReevaluandoMetodo(true); setErr(null)
    try {
      const r = await syncGruposReevaluarMetodoPago()
      await cargar()
      window.alert(`${r.corregidos} método(s) corregido(s). ${r.sinCambio} ya estaban bien. ${r.sinFila} sin encontrar su fila ahora mismo.`)
    } catch (e) { setErr(e.message) } finally { setReevaluandoMetodo(false) }
  }

  return (
    <div>
      <p className="sv-note">
        Lo que Eva apunte en la Hoja de Google «Grupos» entra aquí como propuesta de cambio — nunca se escribe
        solo en la web (ni factura ni pedido) salvo que le den a «Aplicar». La primera sincronización de cada
        pestaña es la foto inicial (sin cambios); a partir de ahí, solo diferencias.
      </p>
      <div className="sv-controls" style={{ marginBottom: 14 }}>
        <div className="sv-controls-left">
          <button className="sv-tests-save" onClick={sincronizarAhora} disabled={sincronizando}>
            {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
          <button className="sv-tests-remove" onClick={limpiarPendientesViejos} disabled={limpiando} title="Descarta las propuestas de pestañas Balance y los pagos viejos que ya estaban pendientes de antes del arreglo de 589ab3a">
            {limpiando ? 'Limpiando…' : 'Limpiar pendientes viejos (Balance / pagos antiguos)'}
          </button>
          <button className="sv-tests-save" onClick={reevaluarSinFila} disabled={reevaluando} title="Reintenta los «Cobro web sin fila» con la búsqueda por teléfono en otras pestañas">
            {reevaluando ? 'Reevaluando…' : 'Reevaluar «sin fila»'}
          </button>
          <button className="sv-tests-save" onClick={reevaluarMetodoPago} disabled={reevaluandoMetodo} title="Corrige el método (TA=tarjeta) de los «pago nuevo» pendientes de antes del arreglo">
            {reevaluandoMetodo ? 'Reevaluando…' : 'Reevaluar método (TA)'}
          </button>
          <button className="sv-tests-select" onClick={diagnosticarPagoViejo} disabled={diagnosticando} title="Enseña qué hay guardado en la foto (snapshot) de una muestra de los «pago nuevo» de hace más de 2 meses, para ver la causa real">
            {diagnosticando ? 'Mirando…' : 'Diagnóstico pago viejo'}
          </button>
          <button className="sv-tests-remove" onClick={limpiarPagoNuevoMismoImporte} disabled={limpiandoMismoImporte} title="Descarta los «pago nuevo» pendientes que ya estén cobrados de verdad en la web para ese mes (nunca contra el Excel)">
            {limpiandoMismoImporte ? 'Limpiando…' : 'Limpiar «ya cobrado en la web»'}
          </button>
          <button className="sv-tests-select" onClick={deshacerLimpiezaMismoImporte} disabled={deshaciendo} title="Reabre lo descartado por la limpieza rota de antes (comparaba contra el Excel) y lo reevalúa contra la web de verdad">
            {deshaciendo ? 'Deshaciendo…' : 'Deshacer limpieza rota (09:30)'}
          </button>
          <span className="sv-ot-muted">
            {ultima ? `Última sincronización: ${new Date(ultima.replace(' ', 'T')).toLocaleString('es-ES')}` : 'Todavía no se ha sincronizado nunca.'}
          </span>
        </div>
        <div className="sv-controls-right">
          {['pendiente', 'aplicado', 'descartado', 'todos'].map(e => (
            <button key={e} className={`sv-tab-mini ${estadoFiltro === e ? 'is-active' : ''}`} onClick={() => { setEstadoFiltro(e); cargar(e) }}>
              {e === 'pendiente' ? 'Pendientes' : e === 'aplicado' ? 'Aplicados' : e === 'descartado' ? 'Descartados' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {resumenSync && (
        <p className="sv-ot-muted">
          Sincronizado: {resumenSync.cambiosNuevos} cambio{resumenSync.cambiosNuevos === 1 ? '' : 's'} nuevo{resumenSync.cambiosNuevos === 1 ? '' : 's'}
          {resumenSync.fotoInicial?.length ? ` · foto inicial de ${resumenSync.fotoInicial.length} pestaña(s)` : ''}.
        </p>
      )}
      {err && <p className="sv-error">{err}</p>}

      {resultadoDeshacer && (
        <p className="sv-note" style={{ marginBottom: 14 }}>
          <strong>{resultadoDeshacer.reabiertos}</strong> reabierto(s). De esos, <strong>{resultadoDeshacer.vueltosACerrarConfirmados}</strong> ya estaban cobrados de verdad en la web y se han vuelto a cerrar; quedan <strong>{resultadoDeshacer.siguenPendientes}</strong> pendientes de verdad en «Cambios del Excel».
        </p>
      )}

      {detalleSinFila && (
        <div className="sv-note" style={{ marginBottom: 14 }}>
          <strong>{detalleSinFila.aplicados} encontrada(s) y escrita(s). {detalleSinFila.siguenPendientes} siguen sin encontrar su fila.</strong>
          {detalleSinFila.detalle?.filter(d => !d.encontrado).length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {detalleSinFila.detalle.filter(d => !d.encontrado).map(d => (
                <li key={d.id}>
                  {d.nombre || d.telefono || '—'} — buscado en «{d.pestanaBuscada}» (tel. {d.telefono || '—'}, mes {d.mes || '—'})
                  {d.error ? <span className="sv-ot-muted"> · {d.error}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {resultadoMismoImporte && (
        <p className="sv-note" style={{ marginBottom: 14 }}>
          <strong>{resultadoMismoImporte.descartados}</strong> de {resultadoMismoImporte.revisados} «pago nuevo» descartado(s) (mismo importe ya en la foto).
        </p>
      )}

      {diagnostico && (
        <div className="sv-note" style={{ marginBottom: 14 }}>
          <strong>{diagnostico.totalPendientesViejos} «pago nuevo» pendientes de hace más de 2 meses en total.</strong>
          {diagnostico.porPestana?.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {diagnostico.porPestana.map(p => (
                <li key={p.pestana}>{p.pestana}: {p.total} ({p.sinEmparejar} sin emparejar)</li>
              ))}
            </ul>
          )}
          <p style={{ margin: '8px 0 0' }}>Muestra de {diagnostico.muestra?.length || 0}:</p>
          <div className="sv-tests-scroll" style={{ marginTop: 8 }}>
            <table className="sv-tests-table">
              <thead>
                <tr><th>Pestaña</th><th>Alumno</th><th>Mes</th><th>Propuesto</th><th>Emparejado</th><th>¿Hay foto?</th><th>Meses en la foto</th><th>¿Tiene ese mes?</th><th>Pago en la foto</th></tr>
              </thead>
              <tbody>
                {diagnostico.muestra?.map(d => (
                  <tr key={d.id}>
                    <td className="sv-ot-muted">{d.pestana}</td>
                    <td>{d.nombre || d.telefono || '—'}</td>
                    <td>{d.mes}</td>
                    <td className="sv-ot-muted">{d.importePropuesto ?? '—'} € ({d.metodoPropuesto || '—'})</td>
                    <td className="sv-ot-muted">{d.matchTipo || 'sin emparejar'}</td>
                    <td>{d.snapshotExiste ? 'Sí' : 'No'}</td>
                    <td>{d.snapshotMesesGuardados}</td>
                    <td>{d.snapshotTieneEseMes ? 'Sí' : 'No'}</td>
                    <td className="sv-ot-muted">{d.snapshotPagoEseMes ? `${d.snapshotPagoEseMes.importe} € (${d.snapshotPagoEseMes.metodo})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cambios === null ? (
        <p className="sv-loading">Cargando…</p>
      ) : cambios.length === 0 ? (
        <p className="sv-empty">Nada aquí ahora mismo.</p>
      ) : (
        <div className="sv-tests-scroll">
          <table className="sv-tests-table">
            <thead>
              <tr><th>Pestaña</th><th>Alumno</th><th>Teléfono</th><th>Tipo</th><th>Detalle</th><th>Emparejado con</th><th></th></tr>
            </thead>
            <tbody>
              {cambios.map(c => (
                <tr key={c.id}>
                  <td className="sv-ot-muted">{c.pestana}</td>
                  <td>{c.nombre || <span className="sv-ot-muted">—</span>}</td>
                  <td className="sv-ot-muted">{c.telefono || '—'}</td>
                  <td>{CAMBIO_TIPO_LABEL[c.tipo] || c.tipo}</td>
                  <td><CambioDetalle c={c} /></td>
                  <td className="sv-ot-muted">{c.match_label || (c.tipo === 'pago_nuevo' ? 'sin emparejar' : '—')}</td>
                  <td>
                    {c.estado === 'pendiente' ? (
                      <>
                        <button
                          className="sv-tests-save" disabled={busyId === c.id || (c.tipo === 'pago_nuevo' && !c.match_tipo)}
                          title={c.tipo === 'pago_nuevo' && !c.match_tipo ? 'No hay nadie emparejado por teléfono — apúntalo a mano en Grupos.' : undefined}
                          onClick={() => aplicar(c.id)}
                        >
                          Aplicar
                        </button>{' '}
                        <button className="sv-tests-select" disabled={busyId === c.id} onClick={() => descartar(c.id)}>Descartar</button>
                      </>
                    ) : (
                      <span className="sv-ot-muted">{c.estado}{c.resuelto_por ? ` · ${c.resuelto_por}` : ''}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <hr style={{ margin: '18px 0' }} />
      <ReintentarCobroExcel />
    </div>
  )
}

// Reescribir a mano un cobro concreto Web→Excel (NOTAS_PARA_CODE_sync_grupos.md, 3/11 12:29):
// para pagos que fallaron antes del arreglo de la pestaña (día suelto en vez de pareja) o que
// nunca pasaron por este camino (completado por un adelantado antes de que existiera Web→Excel).
// No toca WooCommerce — solo repite la escritura en la Hoja.
function ReintentarCobroExcel() {
  const [form, setForm] = useState({ subId: '', ym: '', importe: '', metodo: 'transferencia', fecha: '' })
  const [busy, setBusy] = useState(false)
  const [resultado, setResultado] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const enviar = async () => {
    setBusy(true); setResultado(null)
    try {
      await syncGruposReintentarCobro({
        subId: Number(form.subId), ym: form.ym, importe: Number(form.importe), metodo: form.metodo, fecha: form.fecha,
      })
      setResultado({ ok: true })
    } catch (e) { setResultado({ ok: false, error: e.message }) }
    setBusy(false)
  }

  return (
    <div>
      <p className="sv-note">
        Reintentar a mano la escritura en el Excel de un cobro concreto (no toca WooCommerce, ya tiene que estar
        cobrado ahí). Teléfono y nombre se sacan de la suscripción.
      </p>
      <div className="org__add-row"><label>ID suscripción</label><input type="number" value={form.subId} onChange={e => set('subId', e.target.value)} style={{ width: 90 }} /></div>
      <div className="org__add-row"><label>Mes (AAAA-MM)</label><input type="text" placeholder="2026-11" value={form.ym} onChange={e => set('ym', e.target.value)} style={{ width: 90 }} /></div>
      <div className="org__add-row"><label>Importe €</label><input type="number" step="0.01" value={form.importe} onChange={e => set('importe', e.target.value)} style={{ width: 90 }} /></div>
      <div className="org__add-row">
        <label>Método</label>
        <select value={form.metodo} onChange={e => set('metodo', e.target.value)}>
          <option value="transferencia">Transferencia</option>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="bizum">Bizum</option>
        </select>
      </div>
      <div className="org__add-row"><label>Fecha (dd/mm/aaaa)</label><input type="text" placeholder="29/10/2026" value={form.fecha} onChange={e => set('fecha', e.target.value)} style={{ width: 110 }} /></div>
      <button className="sv-tests-save" onClick={enviar} disabled={busy || !form.subId || !form.ym || !form.importe || !form.fecha}>
        {busy ? 'Enviando…' : 'Reintentar escritura'}
      </button>
      {resultado && (
        resultado.ok
          ? <p className="sv-ot-muted">Hecho — revisa el log de gestión o la Hoja para confirmar que esta vez encontró la pestaña y la fila.</p>
          : <p className="sv-error">Error: {resultado.error}</p>
      )}
    </div>
  )
}

const BAJA_ORIGEN_LABEL = { cancelo: 'Canceló en la web', impago: 'Impago (se canceló sola)', no_viene: 'No viene (sin cancelar aún)', duplicado: 'Duplicado' }

// Fila de la pestaña Bajas (Ramiro, 15/11 08:45 punto B.2): WhatsApp "¿por qué lo has dejado?",
// categoría + texto del motivo, y el historial de contactos ya hechos.
function BajaRow({ f, onContactado }) {
  const [categoria, setCategoria] = useState(f.motivoCategoria || '')
  const [texto, setTexto] = useState(f.motivoTexto || '')
  const [respuesta, setRespuesta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const esMenor = f.edad && f.edad !== 'Adultos'

  async function guardarMotivo() {
    setGuardando(true)
    try { await gestionBajaMotivoSet({ sub_id: f.subId, categoria, texto }) } finally { setGuardando(false) }
  }
  function whatsapp() {
    const texto = esMenor
      ? `Hola, somos de RocoMadrid. Vimos que ${f.nombre} ha dejado la clase de ${f.dia} ${f.horario} — si os apetece contarnos por qué, nos ayuda mucho a mejorar. ¡Gracias y hasta pronto!`
      : `Hola ${f.nombre?.split(' ')[0] || ''}, somos de RocoMadrid. Vimos que has dejado la clase de ${f.dia} ${f.horario} — si te apetece contarnos por qué, nos ayuda mucho a mejorar. ¡Gracias y hasta pronto!`
    window.open(pcWhatsappUrl(f.telefono, texto), 'blokes_whatsapp')
    setAbierto(true)
  }
  async function guardarContacto() {
    setGuardando(true)
    try {
      await gestionBajaContacto({ sub_id: f.subId, respuesta, aceptaPromos: null })
      setRespuesta(''); setAbierto(false)
      onContactado?.()
    } finally { setGuardando(false) }
  }

  return (
    <>
      <tr>
        <td>
          {f.nombre || <span className="sv-ot-muted">—</span>}
          {/* 17/11 16:20 (cowork, Fernando Heras Díez): sigue pagando por fuera (Excel/hist-
              pagos) después del mes de la baja — probablemente solo falta reactivar la
              suscripción, no es una baja real. */}
          {f.pagoFueraTrasBaja?.length > 0 && (
            <div className="sv-to-warn-txt" title={`Pagos fuera de la web: ${f.pagoFueraTrasBaja.join(', ')}`}>
              ⚠ Pagó por fuera después de la baja ({f.pagoFueraTrasBaja.join(', ')}) → reactivar suscripción
            </div>
          )}
        </td>
        <td className="sv-ot-muted">{f.dia} {f.horario}{f.edad !== 'Adultos' ? ` · ${f.edad}` : ''}</td>
        <td className="sv-ot-muted">{f.fecha ? mesLabelGrp(f.fecha) : '—'}</td>
        <td className="sv-ot-muted">{BAJA_ORIGEN_LABEL[f.origen] || f.origen}</td>
        <td>
          <select className="sv-tests-select" value={categoria} onChange={e => setCategoria(e.target.value)} onBlur={guardarMotivo} disabled={guardando}>
            <option value="">Sin motivo todavía…</option>
            {BAJA_MOTIVO_OPCIONES.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
          </select>
          <input className="sv-tests-input" type="text" value={texto} onChange={e => setTexto(e.target.value)} onBlur={guardarMotivo} placeholder="Detalle (opcional)" disabled={guardando} />
        </td>
        <td>
          {!f.telefono ? <span className="sv-ot-muted">Sin teléfono</span> : (
            <button className="sv-tests-select" onClick={whatsapp} disabled={guardando}>💬 ¿Por qué lo has dejado?</button>
          )}
          {f.contactos?.length > 0 && (
            <div className="sv-ot-muted" title={f.contactos.map(c => `${c.fecha.slice(0, 10)} · ${c.user_login}: ${c.respuesta || '(sin respuesta)'}`).join('\n')}>
              {f.contactos.length} contacto{f.contactos.length > 1 ? 's' : ''} ya hecho{f.contactos.length > 1 ? 's' : ''}
            </div>
          )}
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={6}>
            <div className="sv-grp-field">
              <input className="sv-tests-input" type="text" value={respuesta} onChange={e => setRespuesta(e.target.value)} placeholder="¿Qué respondió? (opcional)" style={{ width: 280 }} />
              <button className="sv-tests-select" onClick={guardarContacto} disabled={guardando}>Guardar contacto</button>
              <button className="sv-tests-select" onClick={() => setAbierto(false)} disabled={guardando}>Cerrar</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function GruposTab() {
  const { data, loading, error, refetch } = useGestionGrupos(4)
  // Cowork, 14/11 18:40 punto 1: "Pendiente del mes" (KPI) y la bandeja vieja "Pendientes de
  // cobrar" daban números distintos entre sí Y distintos de WooCommerce — una sola fuente,
  // la misma que ya usa la sub-pestaña «Pendientes de cobro» (cruza con el Excel, importe real).
  const { data: pendientesCobroData } = usePendientesCobro()
  // Altas y Bajas (15/11 08:45 punto A/C): mismo cálculo que ExcelMuerte/Superadmin Clases, no
  // uno aparte — Nuevo/Baja de verdad por persona, no por suscripción (07:50 punto B).
  const { data: classesData, duplicadosMismaClase, externosSinEmparejar } = useClasses(1)
  const { data: bajasData, refetch: refetchBajas } = useBajas()
  const [grupoKey, setGrupoKey] = useState('')
  const [vista, setVista]     = useState('grupos') // 'grupos' | 'altas-bajas' | 'pendientes-cobro' | 'revisar-datos' | 'sindatos'
  const [menuFor, setMenuFor] = useState(null)   // alumno con el menú de acciones abierto
  const [accion, setAccion]   = useState(null)   // { alumno, tipo } con el modal abierto
  const [wellhubFor, setWellhubFor]     = useState(null) // alumno con el modal de Wellhub abierto
  const [bajoTarifaFor, setBajoTarifaFor] = useState(null) // alumno con el modal de Bajo tarifa abierto
  const [buscador, setBuscador] = useState(false) // modal de "Añadir alumno" (buscar)
  const [busqueda, setBusqueda] = useState('') // buscador de arriba: filtra todas las tablas de Grupos a la vez
  const [espera, setEspera] = useState(null) // lista de espera (8.5), cargada al entrar en esa vista
  // Ramiro, 15/11 19:40: avisar a Eva de las altas nuevas desde el selector público (origen no
  // vacío) que todavía no ha atendido — contador en la propia pestaña, no hay que entrar a verlo.
  const esperaNuevasWeb = useMemo(() => (espera || []).filter(p => !p.atendido && p.origen).length, [espera])
  const [esperaForm, setEsperaForm] = useState({ dia: '', horario: '', edad: 'Adultos', nombre: '', telefono: '', notas: '' })
  const [esperaBusy, setEsperaBusy] = useState(false)
  // "Mandar factura" ya no es una tarea manual (Ramiro, 15/11 10:25 punto B): los pedidos que
  // cumplen el criterio seguro se completan solos por cron (blokes_auto_factura_ejecutar). Esto
  // es solo el aviso de los que NO lo cumplen y de verdad hay que mirar en WooCommerce.
  const [facturas, setFacturas] = useState(null)
  async function cargarFacturas() {
    try { setFacturas(await gestionFacturasPendientesGet()) } catch (e) { /* aviso silencioso, no bloquea Grupos */ }
  }
  useEffect(() => { cargarFacturas() }, [])

  async function cargarEspera() { try { setEspera(await gestionListaEsperaGet()) } catch (e) { setEspera([]) } }
  function abrirEspera() { setVista('espera'); if (espera === null) cargarEspera() }
  async function altaEspera(e) {
    e.preventDefault()
    if (!esperaForm.nombre.trim()) return
    setEsperaBusy(true)
    try {
      await gestionListaEsperaCrear(esperaForm)
      setEsperaForm({ dia: '', horario: '', edad: 'Adultos', nombre: '', telefono: '', notas: '' })
      await cargarEspera()
    } catch (err) { alert(err.message) } finally { setEsperaBusy(false) }
  }
  async function marcarAtendidoEspera(id, atendido) { await gestionListaEsperaActualizar(id, { atendido }); cargarEspera() }
  async function borrarEspera(id) { if (!confirm('¿Eliminar de la lista de espera?')) return; await gestionListaEsperaBorrar(id); cargarEspera() }

  const grupos = data?.grupos || []
  const meses  = data?.meses || []
  const mesActual = meses[meses.length - 1]

  // dia/horario/edad del grupo se cuelgan de cada fila (no solo el label) para que "Cambiar de
  // grupo/horario" sepa cuál es el grupo actual sin tener que repartirlo por props aparte.
  const conGrupoDatos = g => g.alumnos.map(a => ({ ...a, grupoLabel: g.label, dia: g.dia, horario: g.horario, edad: g.edad }))
  const grupo = grupoKey ? grupos.find(g => `${g.dia}|${g.horario}|${g.edad}` === grupoKey) : null
  // Con el buscador escrito, se busca en TODOS los grupos (no solo el elegido en el
  // desplegable) — Ramiro, 1/11 18:50.
  const terminoBusq = sgNormalizarTexto(busqueda.trim())
  const telBusq = sgNormalizarTelefono(busqueda)
  const coincide = a => sgCoincideBusqueda(a, terminoBusq, telBusq)
  const alumnosBase = (terminoBusq || telBusq) ? grupos.flatMap(conGrupoDatos) : (grupo ? conGrupoDatos(grupo) : grupos.flatMap(conGrupoDatos))
  const alumnos = alumnosBase.filter(coincide)
  // Bandejas 8.3: las mismas filas de siempre, filtradas y aplanadas de todos los grupos a la
  // vez, para que Eva no tenga que ir grupo por grupo buscando a quién le toca cada cosa.
  const conGrupo = useMemo(() => grupos.flatMap(conGrupoDatos), [grupos])

  // Rediseño de pestañas de Grupos (NOTAS_PARA_CODE_pestanas_grupos.md, decidido con Ramiro el
  // 3/11 a partir de las renovaciones reales de esa noche): cada pestaña es una tarea concreta
  // de Eva, no solo un filtro de estado.
  const duplicados  = useMemo(() => conGrupo.filter(a => a.otrasSubs?.length > 0).filter(coincide), [conGrupo, terminoBusq, telBusq])
  const sinDatos        = useMemo(() => conGrupo.filter(a => !a.telefono || a.sinNombre), [conGrupo])
  const pagaFuera        = useMemo(() => conGrupo.filter(a => a.esExterno), [conGrupo])
  // 2. "Pendientes de cobrar" (bandeja de aquí) eliminada (cowork, 14/11 18:40 punto 1/2: tres
  // números de pendientes distintos — KPI 52, esta bandeja 40, WooCommerce 74 — y el importe que
  // enseñaba era el del MES PASADO, no lo que debían, y no miraba el Excel). Ahora la única
  // lista de pendientes es Supervisión → Pendientes de cobro (usePendientesCobro más abajo),
  // que sí cruza con el Excel y usa el importe real del pedido pendiente.
  // 4. Altas manuales: creadas desde el panel (admin_assign), activas.
  const altasManuales = useMemo(() => conGrupo.filter(a => a.altaManual && a.enVigor).filter(coincide), [conGrupo, terminoBusq, telBusq])
  // 5. Tarjeta rechazada: la renovación de este mes en failed.
  const tarjetaRechazada = useMemo(() => conGrupo.filter(a => a.pagos[mesActual]?.estadoPedido === 'failed').filter(coincide), [conGrupo, mesActual, terminoBusq, telBusq])
  // 6. «Altas y Bajas» (antes "Sin pagar desde hace 1 mes" — Ramiro, 15/11 08:45 punto A/C):
  // mismo cálculo que ExcelMuerte/Superadmin Clases (Nuevo/Baja por persona, no por
  // suscripción — 07/50 punto B), no uno nuevo. Altas = members_active.new de /classes, de
  // cualquier grupo; Bajas = /gestion/bajas (ya junta las canceladas de verdad con el "No
  // viene" marcado en Pendientes de cobro que todavía no se ha cancelado en WooCommerce).
  const altas = useMemo(() => {
    const out = []
    for (const c of (classesData || [])) {
      for (const m of c.members_active) {
        if (m.new) out.push({ ...m, dia: c.dia, horario: c.horario, edad: c.edad, grupoLabel: c.label + (c.edad !== 'Adultos' ? ` (${c.edad})` : '') })
      }
    }
    return out.filter(a => coincide({ alumno: a.name, telefono: a.phone }))
  }, [classesData, terminoBusq, telBusq])
  const bajasLista = useMemo(() =>
    (bajasData || []).filter(f => coincide({ alumno: f.nombre, telefono: f.telefono })),
    [bajasData, terminoBusq, telBusq])
  // 9. Suscripciones viejas en espera de quien se cambió de clase (cowork, 14/11 18:40 punto 4):
  // misma persona, otra activa en OTRA clase — "Cancelar la vieja" (fusionar) en vez de dejarla
  // inflando el "+N en espera" sin que nadie la vea.
  const cambioDeClase = useMemo(() => conGrupo.filter(a => a.otraActivaFuera).filter(coincide), [conGrupo, terminoBusq, telBusq])

  // 8. Revisar datos: lo que antes eran "Sin datos" + "Duplicados", juntas, más las de arriba.
  const revisarDatos = useMemo(() => {
    const vistos = new Set()
    return [...sinDatos, ...duplicados, ...cambioDeClase].filter(a => {
      const k = a.subId ?? a.externoId
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    }).filter(coincide)
  }, [sinDatos, duplicados, cambioDeClase, terminoBusq, telBusq])

  // «Bajo tarifa» (16/11 07:35 punto B.3): todos los grupos juntos, con lo que paga, la tarifa,
  // la diferencia y el motivo. El contador del botón solo cuenta los que de verdad faltan
  // revisar — la lista en sí enseña también los ya revisados (para ver el historial de Eva).
  const bajoTarifaLista = useMemo(() => conGrupo.filter(a => a.bajoTarifa).filter(coincide), [conGrupo, terminoBusq, telBusq])
  const bajoTarifaSinRevisarN = useMemo(() => bajoTarifaLista.filter(a => !a.bajoTarifaRevisado).length, [bajoTarifaLista])
  // Wellhub (16/11 07:35 punto A.2/A.3): contador para la cabecera y recordatorio fijo si hay
  // alguno — el € (importeFalta) solo llega del backend si eres socio, Eva solo ve el recuento.
  const wellhubLista = useMemo(() => conGrupo.filter(a => a.wellhub && a.enVigor).filter(coincide), [conGrupo, terminoBusq, telBusq])

  // Cuántos coinciden en la vista actual — Ramiro, 2/11 09:40: no sabía "dónde darle a buscar"
  // ni si el filtro seguía puesto al cambiar de pestaña; este número deja claro ambas cosas.
  const resultadosBusqueda = (terminoBusq || telBusq) ? ({
    grupos: conGrupo.filter(coincide).length,
    'altas-manuales': altasManuales.length,
    'tarjeta-rechazada': tarjetaRechazada.length, 'altas-bajas': altas.length + bajasLista.length, 'revisar-datos': revisarDatos.length,
  }[vista] ?? null) : null

  const kpis = useMemo(() => {
    const k = { personas: 0, enEspera: 0, dia1: 0, dia2: 0, dia3: 0, plazas: 0, cobradoMes: 0, pendienteMes: 0, pendienteImporte: 0 }
    alumnos.forEach(a => {
      if (a.enVigor) {
        k.personas++
        if (a.dias >= 3) k.dia3++
        else if (a.dias === 2) k.dia2++
        else k.dia1++
        k.plazas += a.dias
      } else {
        k.enEspera++
      }
      const pago = mesActual ? a.pagos[mesActual] : null
      // "cubierto" = mes ya pagado por un trimestral/anual de un mes anterior, no un cobro
      // nuevo de este mes: no se suma otra vez (si no, se contaría el mismo pago 2-3 veces).
      if (pago && !pago.cubierto && !pago.adelantado && !PAGO_PENDIENTE.has(pago.estadoPedido)) k.cobradoMes += pago.importe
    })
    // "Pendiente del mes": de Pendientes de cobro, filtrado al grupo elegido (o todos). Mismo
    // número que esa pestaña, con el importe real del pedido — no el inventado de antes.
    const filasPendientes = (pendientesCobroData?.filas || []).filter(f => !grupo || (f.dia === grupo.dia && f.horario === grupo.horario && f.edad === grupo.edad))
    k.pendienteMes = filasPendientes.length
    k.pendienteImporte = filasPendientes.reduce((s, f) => s + (f.importe || 0), 0)
    return k
  }, [alumnos, mesActual, pendientesCobroData, grupo])

  if (loading) return <div className="sv-loading">Cargando grupos…</div>
  if (error)   return (
    <div className="sv-error">
      Error: {error} <button className="sv-filter-btn" onClick={refetch}>Reintentar</button>
    </div>
  )

  return (
    <div className="sv-tab-panel">
      <p className="sv-note">
        Sustituye el Excel «Grupos», agrupado por franja (M-J, L-X, Viernes…) como sus pestañas.
        <strong> Alumno y pagador son la misma persona por ahora</strong> — hasta que la migración añada quién es
        realmente cada alumno, esto es por cuenta pagadora, no por alumno real. Una fila con <strong>⚠</strong> tiene
        otra suscripción antigua colgando en este mismo grupo (duplicado; la bandeja de la 8.3 los juntará).
        Las acciones (⋯) escriben de verdad en WooCommerce: <strong>pruébalas primero con una suscripción de prueba</strong>,
        no se envían correos al alumno, y todo queda registrado (quién, cuándo, antes → después).
      </p>

      {/* Cowork, 15/11 10:30: este aviso decía "51" usando `duplicados` (otrasSubs de
          superadmin_gestion_grupos — CUALQUIER sub extra en el grupo, activa o no, pensada
          para el botón Fusionar de Revisar datos) como si fueran "activas de verdad". El
          recuento real de dos ACTIVAS a la vez es duplicadosMismaClase (de /classes, el mismo
          que ya usa ExcelMuerte) — con ese mismo bug de fondo arreglado (uid real, no
          teléfono/nombre, para no confundir hermanos con el mismo teléfono con un duplicado). */}
      {duplicadosMismaClase.length > 0 && (
        <div className="sv-aviso sv-aviso--bad">
          <strong>⚠ {duplicadosMismaClase.length} {duplicadosMismaClase.length === 1 ? 'alumno' : 'alumnos'} con 2 suscripciones activas de la misma clase.</strong>{' '}
          <button className="sv-tests-select" onClick={() => setVista('revisar-datos')}>Ver en «Revisar datos»</button>
        </div>
      )}

      {/* "Mandar factura" ya es automático (15/11 10:25 punto B) — esto es solo el aviso de los
          pedidos "processing" que NO cumplen el criterio seguro y hay que mirar en WooCommerce. */}
      {facturas?.length > 0 && (
        <div className="sv-aviso sv-aviso--warn">
          <strong>⚠ {facturas.length} pedido{facturas.length === 1 ? '' : 's'} sin confirmar por la pasarela de pago.</strong>{' '}
          Revísalos directamente en WooCommerce ({facturas.map(f => `#${f.orderId} ${f.alumno}`).join(', ')}) — los demás ya se completan solos.
        </div>
      )}

      {/* 16/11 07:35 punto A.3: recordatorio fijo en la cabecera de Grupos si hay alguien con
          Wellhub — Eva no necesita el importe, solo saber que existen y pasar el pase siempre. */}
      {wellhubLista.length > 0 && (
        <div className="sv-aviso sv-aviso--warn">
          <strong>📱 {wellhubLista.length} alumno{wellhubLista.length === 1 ? '' : 's'} con Wellhub.</strong>{' '}
          Tienen que pasar el pase SIEMPRE que vengan — si no, no se cobra esa parte de su cuota ({wellhubLista.map(a => a.alumno).join(', ')}).
        </div>
      )}

      <div className="sv-controls">
        <div className="sv-controls-left">
          <button className={`sv-tab-mini ${vista === 'grupos' ? 'is-active' : ''}`} onClick={() => setVista('grupos')}>Grupos</button>
          <button className={`sv-tab-mini ${vista === 'altas-manuales' ? 'is-active' : ''}`} onClick={() => setVista('altas-manuales')}>
            Altas manuales {altasManuales.length ? <span className="sv-tab-mini__count">({altasManuales.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'tarjeta-rechazada' ? 'is-active' : ''}`} onClick={() => setVista('tarjeta-rechazada')}>
            Tarjeta rechazada {tarjetaRechazada.length ? <span className="sv-tab-mini__count">({tarjetaRechazada.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'altas-bajas' ? 'is-active' : ''}`} onClick={() => setVista('altas-bajas')}>
            Altas y Bajas {(altas.length + bajasLista.length) ? <span className="sv-tab-mini__count">({altas.length}/{bajasLista.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'pendientes-cobro' ? 'is-active' : ''}`} onClick={() => setVista('pendientes-cobro')}>
            Pendientes de cobro
          </button>
          <button className={`sv-tab-mini ${vista === 'revisar-datos' ? 'is-active' : ''}`} onClick={() => setVista('revisar-datos')}>
            Revisar datos {revisarDatos.length ? <span className="sv-tab-mini__count">({revisarDatos.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'bajo-tarifa' ? 'is-active' : ''}`} onClick={() => setVista('bajo-tarifa')}>
            Bajo tarifa {bajoTarifaSinRevisarN > 0 ? <span className="sv-tab-mini__count">({bajoTarifaSinRevisarN})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'espera' ? 'is-active' : ''}`} onClick={abrirEspera}>
            Lista de espera {esperaNuevasWeb > 0 ? <span className="sv-tab-mini__count">({esperaNuevasWeb})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'excel' ? 'is-active' : ''}`} onClick={() => setVista('excel')}>
            Cambios del Excel
          </button>
        </div>
        <div className="sv-controls-right">
          <span className="sv-grp-buscar-wrap">
            <input
              className="sv-tests-input sv-grp-buscar"
              type="text"
              placeholder="🔎 Buscar alumno (nombre o teléfono)"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button type="button" className="sv-grp-buscar-limpiar" title="Limpiar búsqueda" onClick={() => setBusqueda('')}>✕</button>
            )}
          </span>
          {vista === 'grupos' && (
            <select className="sv-tests-select" value={grupoKey} onChange={e => setGrupoKey(e.target.value)}>
              <option value="">Todos los grupos</option>
              {grupos.map(g => {
                const key = `${g.dia}|${g.horario}|${g.edad}`
                const nVigor = g.alumnos.filter(a => a.enVigor).length
                const nEspera = g.alumnos.length - nVigor
                return <option key={key} value={key}>{g.label} — {nVigor}{nEspera ? ` (+${nEspera} en espera)` : ''}</option>
              })}
            </select>
          )}
          {vista === 'grupos' && (
            <button className="sv-tab-mini" onClick={() => setBuscador(true)}>+ Añadir alumno</button>
          )}
          {/* Ramiro, NOTAS_PARA_CODE_alumnos_clases_fuente_de_verdad.md Fase 0 punto 5: "quitar
              el alta de externo... se elimina la opción" — los 4 que ya hay pasan a usuario +
              suscripción a mano (Eva, con "+ Añadir alumno" → Crear cliente en la web). El botón
              de alta ya no se ofrece, pero la edición/baja de los externos que queden sigue
              funcionando (ext_editar más abajo) hasta que se migren. */}
        </div>
      </div>

      {resultadosBusqueda !== null && (
        <p className="sv-grp-buscar-resultado">
          {resultadosBusqueda} resultado{resultadosBusqueda === 1 ? '' : 's'} para «{busqueda.trim()}» en esta pestaña — <button type="button" className="sv-grp-buscar-limpiar-texto" onClick={() => setBusqueda('')}>quitar filtro</button>
        </p>
      )}

      {buscador && <BuscarAlumnoModal onClose={() => setBuscador(false)} grupos={grupos} />}

      {vista === 'altas-manuales' && (
        <>
          <p className="sv-note">Recuérdales que se suscriban por la web con su tarjeta para que el cobro sea automático.</p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Teléfono</th><th></th></tr>
              </thead>
              <tbody>
                {altasManuales.map(a => {
                  const mensaje = `Hola ${sgNombreParaMensaje(a)}, para que no tengas que preocuparte cada mes, ¿puedes suscribirte en rocomadrid.com con tu tarjeta? Así el pago se hace solo. ¡Gracias!`
                  return (
                    <tr key={`${a.subId}-${a.grupoLabel}`}>
                      <td>{a.alumno || <span className="sv-ot-muted">—</span>}</td>
                      <td className="sv-ot-muted">{a.grupoLabel}</td>
                      <td className="sv-ot-muted">{a.telefono || '—'}</td>
                      <td><WhatsAppBtn a={a} mensaje={mensaje} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {altasManuales.length === 0 && <p className="sv-empty">Nadie con alta manual ahora mismo.</p>}
        </>
      )}

      {vista === 'tarjeta-rechazada' && (
        <>
          <p className="sv-note">Habla con ellos para que revisen su tarjeta y el pago.</p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Teléfono</th><th>Importe</th><th></th></tr>
              </thead>
              <tbody>
                {tarjetaRechazada.map(a => {
                  const mensaje = `Hola ${sgNombreParaMensaje(a)}, el banco ha rechazado el pago de este mes de tu tarjeta. ¿Puedes revisarla o actualizarla en rocomadrid.com? Si prefieres pagar de otra forma, dínoslo.`
                  return (
                    <tr key={`${a.subId}-${a.grupoLabel}`}>
                      <td>{a.alumno || <span className="sv-ot-muted">—</span>}</td>
                      <td className="sv-ot-muted">{a.grupoLabel}</td>
                      <td className="sv-ot-muted">{a.telefono || '—'}</td>
                      <td className="sv-to-bad">{fmtEur(a.pagos[mesActual]?.importe)}</td>
                      <td><WhatsAppBtn a={a} mensaje={mensaje} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {tarjetaRechazada.length === 0 && <p className="sv-empty">Ninguna tarjeta rechazada este mes.</p>}
        </>
      )}

      {vista === 'altas-bajas' && (
        <>
          <p className="sv-note">
            Mismo cálculo que ExcelMuerte/Superadmin › Clases: <strong>Alta</strong> = primera suscripción de verdad de esa persona
            (si venía de otra clase, no es alta, es un cambio de clase) Y primer mes pagado también en hist-pagos (quien ya venía
            pagando antes de migrar a WooCommerce no sale como alta el mes que migra). <strong>Baja</strong> = ya no tiene ninguna suscripción
            activa en ninguna clase, o se marcó «No viene» en Pendientes de cobro aunque todavía no se haya cancelado en WooCommerce.
            {externosSinEmparejar > 0 && <> {externosSinEmparejar} persona{externosSinEmparejar === 1 ? '' : 's'} de hist-pagos no tiene{externosSinEmparejar === 1 ? '' : 'n'} ninguna suscripción actual emparejada (nunca cuenta como alta).</>}
          </p>
          <h3 className="sv-grp-subtitle">Altas ({altas.length})</h3>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead><tr><th>Alumno</th><th>Clase</th><th>Teléfono</th><th>Mes de alta</th></tr></thead>
              <tbody>
                {altas.map(a => (
                  <tr key={a.subId}>
                    <td>{a.name || <span className="sv-ot-muted">—</span>}</td>
                    <td className="sv-ot-muted">{a.dia} {a.horario}{a.edad !== 'Adultos' ? ` · ${a.edad}` : ''}</td>
                    <td className="sv-ot-muted">{a.phone || '—'}</td>
                    <td className="sv-ot-muted">{a.altaMes ? mesLabelGrp(a.altaMes) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {altas.length === 0 && <p className="sv-empty">Nadie de alta este mes todavía.</p>}

          <h3 className="sv-grp-subtitle">Bajas ({bajasLista.length})</h3>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead><tr><th>Alumno</th><th>Clase</th><th>Fecha</th><th>Origen</th><th>Motivo de baja</th><th>Contactos</th></tr></thead>
              <tbody>
                {bajasLista.map(f => <BajaRow key={f.subId} f={f} onContactado={refetchBajas} />)}
              </tbody>
            </table>
          </div>
          {bajasLista.length === 0 && <p className="sv-empty">Nadie de baja en los últimos meses.</p>}
        </>
      )}

      {vista === 'pendientes-cobro' && <PendientesCobroTab busquedaExterna={busqueda} />}

      {vista === 'revisar-datos' && (
        <>
          <p className="sv-note">
            Sin teléfono o sin nombre real (se ve el usuario de la cuenta), con una suscripción vieja colgando de la
            misma clase, o con otra activa en otra clase (se cambió de grupo). «Fusionar»/«Cancelar la vieja» cancela
            solo la vieja; la activa no se toca.
          </p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Qué falta o está repetido</th><th></th></tr>
              </thead>
              <tbody>
                {revisarDatos.map(a => (
                  <tr key={`${a.subId}-${a.grupoLabel}`}>
                    <td>{a.alumno || <span className="sv-ot-muted">—</span>} <span className="sv-ot-muted">#{a.subId}</span></td>
                    <td className="sv-ot-muted">{a.grupoLabel}</td>
                    <td className="sv-ot-muted">
                      {a.otrasSubs?.length > 0
                        ? `Duplicado: también #${a.otrasSubs.map(s => s.subId).join(', #')}`
                        : a.otraActivaFuera
                        ? `Se cambió de clase: activa #${a.otraActivaFuera.subId} en ${a.otraActivaFuera.dia} ${a.otraActivaFuera.horario}`
                        : [!a.telefono && 'teléfono', a.sinNombre && 'nombre'].filter(Boolean).join(' y ')}
                    </td>
                    <td><button className="sv-tests-remove" onClick={() => setMenuFor(a)} title="Acciones">⋯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {revisarDatos.length === 0 && <p className="sv-empty">Nada que revisar ahora mismo.</p>}
        </>
      )}

      {vista === 'bajo-tarifa' && (
        <>
          <p className="sv-note">
            Paga menos que la tarifa de su clase (margen de 2 € por redondeos). Pulsa ⋯ → «Bajo tarifa» para escribir
            el porqué y marcarlo revisado — la fila deja de salir en rojo. Si después cambia lo que paga, vuelve a
            salir en rojo sola.
          </p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Paga</th><th>Tarifa</th><th>Diferencia</th><th>Motivo</th><th>Revisado</th><th></th></tr>
              </thead>
              <tbody>
                {bajoTarifaLista.map(a => (
                  <tr key={`${a.subId}-${a.grupoLabel}`} className={!a.bajoTarifaRevisado ? 'sv-grp-row--bajo-tarifa' : ''}>
                    <td>{a.alumno || <span className="sv-ot-muted">—</span>}</td>
                    <td className="sv-ot-muted">{a.grupoLabel}</td>
                    <td>{a.diferenciaMensual != null ? fmtEur((a.tarifaEsperada || 0) + a.diferenciaMensual) : '—'}</td>
                    <td className="sv-ot-muted">{a.tarifaEsperada != null ? fmtEur(a.tarifaEsperada) : '—'}</td>
                    <td className={a.bajoTarifaRevisado ? 'sv-ot-muted' : 'sv-to-bad'}>{a.diferenciaMensual != null ? `−${fmtEur(Math.abs(a.diferenciaMensual))}` : '—'}</td>
                    <td className="sv-ot-muted">
                      {a.bajoTarifaMotivoEva || a.notas || (a.bajoTarifaMotivoSugerido ? <em>{a.bajoTarifaMotivoSugerido}</em> : 'sin motivo anotado')}
                    </td>
                    <td className="sv-ot-muted">{a.bajoTarifaRevisado ? `✓ ${a.bajoTarifaRevisadoPor}` : '—'}</td>
                    <td><button className="sv-tests-remove" onClick={() => setBajoTarifaFor(a)} title="Revisar">⋯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bajoTarifaLista.length === 0 && <p className="sv-empty">Nadie pagando por debajo de su tarifa ahora mismo.</p>}
        </>
      )}

      {vista === 'espera' && (
        <>
          <p className="sv-note">
            Interesados que todavía no son alumnos (sin suscripción ni alta externa) — para cuando un grupo está lleno
            o alguien preguntó y aún no se ha apuntado. Cuando entre, borra su fila aquí (el alta real va por la
            suscripción web o por "Añadir alumno" cuando esté montado).
          </p>
          <form onSubmit={altaEspera} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
            <label className="sv-grp-field">Nombre
              <input className="sv-tests-input" type="text" value={esperaForm.nombre} onChange={e => setEsperaForm(f => ({ ...f, nombre: e.target.value }))} required />
            </label>
            <label className="sv-grp-field">Teléfono
              <input className="sv-tests-input" type="text" value={esperaForm.telefono} onChange={e => setEsperaForm(f => ({ ...f, telefono: e.target.value }))} />
            </label>
            <label className="sv-grp-field">Día
              <input className="sv-tests-input" type="text" value={esperaForm.dia} onChange={e => setEsperaForm(f => ({ ...f, dia: e.target.value }))} placeholder="Lunes/Martes…" />
            </label>
            <label className="sv-grp-field">Horario
              <input className="sv-tests-input" type="text" value={esperaForm.horario} onChange={e => setEsperaForm(f => ({ ...f, horario: e.target.value }))} placeholder="18:30" />
            </label>
            <label className="sv-grp-field">Edad
              <input className="sv-tests-input" type="text" value={esperaForm.edad} onChange={e => setEsperaForm(f => ({ ...f, edad: e.target.value }))} placeholder="Adultos" />
            </label>
            <label className="sv-grp-field">Notas
              <input className="sv-tests-input" type="text" value={esperaForm.notas} onChange={e => setEsperaForm(f => ({ ...f, notas: e.target.value }))} />
            </label>
            <button className="sv-tests-save" type="submit" disabled={esperaBusy}>Añadir a la lista</button>
          </form>

          {espera === null ? (
            <p className="sv-loading">Cargando…</p>
          ) : (
            <div className="sv-tests-scroll">
              {/* Ramiro, 15/11 19:40: aviso cuando queda plaza libre en la clase de alguien que
                  espera — nunca se avisa solo al cliente, solo aquí para que Eva decida. */}
              {Object.entries(
                espera.filter(p => !p.atendido && p.plazaLibre).reduce((acc, p) => {
                  const k = [p.dia, p.horario, p.edad].filter(Boolean).join(' · ') || 'Grupo sin datos'
                  ;(acc[k] = acc[k] || []).push(p)
                  return acc
                }, {})
              ).map(([grupo, filas]) => (
                <div key={grupo} className="sv-aviso sv-aviso--warn">
                  🎉 <strong>Hay plaza en {grupo}:</strong> {filas.length} persona{filas.length === 1 ? '' : 's'} esperando ({filas.map(f => f.nombre).join(', ')}).
                </div>
              ))}
              <table className="sv-tests-table">
                <thead>
                  <tr><th>Nombre</th><th>Teléfono</th><th>Grupo</th><th>Notas</th><th>Desde</th><th></th></tr>
                </thead>
                <tbody>
                  {espera.map(p => (
                    <tr key={p.id} style={p.atendido ? { opacity: 0.5 } : undefined}>
                      <td>
                        {p.nombre}
                        {p.origen && <span className="sv-chip-web" title={`Alta desde la web (${p.origen})`}> 🌐 desde la web</span>}
                        {p.plazaLibre && !p.atendido && <span className="sv-chip-web" title="Ya hay plaza en esta clase" style={{ color: '#34d399' }}> · plaza libre</span>}
                      </td>
                      <td className="sv-ot-muted">{p.telefono || p.email || '—'}</td>
                      <td className="sv-ot-muted">{[p.dia, p.horario, p.edad !== 'Adultos' ? p.edad : ''].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="sv-ot-muted">{p.notas || '—'}</td>
                      <td className="sv-ot-muted">{p.created_at ? p.created_at.slice(0, 10) : '—'}</td>
                      <td>
                        <button className="sv-tests-select" onClick={() => marcarAtendidoEspera(p.id, p.atendido ? 0 : 1)}>
                          {p.atendido ? 'Reabrir' : 'Marcar atendido'}
                        </button>{' '}
                        <button className="sv-tests-remove" onClick={() => borrarEspera(p.id)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {espera.length === 0 && <p className="sv-empty">Nadie en la lista de espera.</p>}
            </div>
          )}
        </>
      )}

      {vista === 'excel' && <SyncGruposCambiosPanel />}

      {vista === 'grupos' && (<>
      {grupo && <ProfesorLine dia={grupo.dia} horario={grupo.horario} edad={grupo.edad} />}
      {/* Dinero AGREGADO (cobrado del mes, importe pendiente total) es solo para socio — ver
          NOTAS_PARA_CODE_privacidad_dinero.md. Lo de cada alumno (quién debe y cuánto) sí lo ve
          gestion, en la tabla de abajo. */}
      <div className="sv-kpis">
        <div className="sv-kpi" style={{ '--kpi-color': '#60a5fa' }} title="Personas en vigor (activas o de baja a fin de mes) en este grupo — mismo criterio que «Alumnos (cuentas) con clase en vigor» de ExcelMuerte. Las en espera/pausadas/pendientes de alta se cuentan aparte. En «Todos los grupos» cuenta por grupo: quien está en dos grupos distintos (p. ej. un grupo normal y Pilates/Yoga) suma 2, por eso puede ser algo más que las cuentas únicas de ExcelMuerte.">
          <span className="sv-kpi__value">{kpis.personas}{kpis.enEspera ? <span className="sv-ot-muted"> (+{kpis.enEspera} en espera)</span> : ''}</span>
          <span className="sv-kpi__label">Personas ⓘ</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': '#a78bfa' }} title="Solo de las que están en vigor: cuántas vienen 1, 2 o 3+ días a la semana.">
          <span className="sv-kpi__value">{kpis.dia1} × 1 día · {kpis.dia2} × 2 · {kpis.dia3 ? `${kpis.dia3} × 3+` : ''}</span>
          <span className="sv-kpi__label">Por días ⓘ</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': '#34d399' }} title="Plazas por sesión de las que están en vigor (una de 2 días cuenta en los dos).">
          <span className="sv-kpi__value">{kpis.plazas}</span>
          <span className="sv-kpi__label">Plazas ⓘ</span>
        </div>
        {window.blokesSiteData?.userRole === 'socio' && (
          <div className="sv-kpi" style={{ '--kpi-color': '#f5c842' }} title={`Cobrado en ${mesActual ? mesLabelGrp(mesActual) : 'este mes'}: suma de los pedidos de renovación/alta de ese mes que ya están pagados (de las suscripciones de clases, Pilates y Yoga; no incluye entradas sueltas ni bonos). Cambia día a día porque es en vivo: no es una foto fija, sino lo cobrado hasta ahora.`}>
            <span className="sv-kpi__value">{fmtEur(kpis.cobradoMes)}</span>
            <span className="sv-kpi__label">Cobrado del mes ⓘ</span>
          </div>
        )}
        <button
          type="button" className="sv-kpi sv-kpi--link" style={{ '--kpi-color': '#f87171' }}
          title="Mismo número que la sub-pestaña «Pendientes de cobro» (filtrado a este grupo) — pulsa para ir allí. Pedidos de renovación pendientes de pago de verdad, cruzados con el Excel."
          onClick={() => setVista('pendientes-cobro')}
        >
          <span className="sv-kpi__value">{kpis.pendienteMes}{window.blokesSiteData?.userRole === 'socio' ? ` · ${fmtEur(kpis.pendienteImporte)}` : ''}</span>
          <span className="sv-kpi__label">Pendiente del mes ⓘ</span>
        </button>
      </div>

      {grupo ? (
        <>
          <TablaAlumnos
            alumnos={alumnos} meses={meses}
            onWa={a => setAccion({ alumno: a, tipo: 'optin_whatsapp' })} onMenu={a => setMenuFor(a)}
          />
          {alumnos.length === 0 && <p className="sv-empty">Sin suscripciones en vigor para este grupo.</p>}
        </>
      ) : (
        grupos.map(g => {
          // Antes esto ignoraba el buscador de arriba (usaba conGrupoDatos(g) sin filtrar) —
          // Ramiro, 2/11 09:40: un nombre de prueba no filtraba nada en "Grupos". Con término de
          // búsqueda, los grupos sin ninguna coincidencia se ocultan del todo, como pediste.
          const gAlumnos = conGrupoDatos(g).filter(coincide)
          if ((terminoBusq || telBusq) && gAlumnos.length === 0) return null
          return (
            <div key={`${g.dia}|${g.horario}|${g.edad}`} className="sv-grp-bloque">
              <h4 className="sv-grp-bloque__titulo">{g.label}</h4>
              <ProfesorLine dia={g.dia} horario={g.horario} edad={g.edad} />
              <TablaAlumnos
                alumnos={gAlumnos} meses={meses}
                onWa={a => setAccion({ alumno: a, tipo: 'optin_whatsapp' })} onMenu={a => setMenuFor(a)}
              />
              {gAlumnos.length === 0 && <p className="sv-empty">Sin suscripciones en vigor para este grupo.</p>}
            </div>
          )
        })
      )}
      </>)}

      {menuFor && (
        <AccionMenu
          alumno={menuFor}
          onClose={() => setMenuFor(null)}
          onPick={(tipo, targetId) => {
            if (tipo === 'wellhub') { setWellhubFor(menuFor); setMenuFor(null); return }
            if (tipo === 'bajo_tarifa') { setBajoTarifaFor(menuFor); setMenuFor(null); return }
            setAccion({ alumno: menuFor, tipo, targetId }); setMenuFor(null)
          }}
        />
      )}
      {wellhubFor && (
        <WellhubModal alumno={wellhubFor} onClose={() => setWellhubFor(null)} onDone={() => { setWellhubFor(null); refetch() }} />
      )}
      {bajoTarifaFor && (
        <BajoTarifaModal alumno={bajoTarifaFor} onClose={() => setBajoTarifaFor(null)} onDone={() => { setBajoTarifaFor(null); refetch() }} />
      )}
      {accion && (
        <AccionModal
          alumno={accion.alumno}
          tipo={accion.tipo}
          targetId={accion.targetId ?? accion.alumno.subId}
          grupos={grupos}
          onClose={() => setAccion(null)}
          onDone={() => { setAccion(null); refetch() }}
        />
      )}
    </div>
  )
}

// Histórico (NOTAS_PARA_CODE_hv_control_clientes.md, punto 5): permanencia media, bajas tras
// verano, alumnos por profesor/clase/mes y uso de bonos — todo agregado del HV Control de
// Clientes importado, nunca nombres ni teléfonos sueltos. Solo socio (dinero/datos del club).
function TablaPorMes({ titulo, datos }) {
  const meses = Array.from(new Set(Object.values(datos || {}).flatMap(d => Object.keys(d)))).sort()
  const filas = Object.keys(datos || {}).sort()
  if (!filas.length) return null
  return (
    <div className="sv-tests-scroll">
      <h2 className="sv-section-title">{titulo}</h2>
      <table className="sv-tests-table">
        <thead><tr><th></th>{meses.map(m => <th key={m}>{m}</th>)}</tr></thead>
        <tbody>
          {filas.map(fila => (
            <tr key={fila}>
              <td>{fila}</td>
              {meses.map(m => <td key={m} className={datos[fila][m] ? '' : 'sv-ot-muted'}>{datos[fila][m] || '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HistoricoTab() {
  const [est, setEst] = useState(null)
  const [err, setErr] = useState(null)
  const cargar = useCallback(() => {
    setErr(null)
    histPagosEstadisticas().then(setEst).catch(e => setErr(e.message))
  }, [])
  useEffect(cargar, [cargar])

  if (err) return (
    <div className="sv-error">
      Error: {err} <button className="sv-filter-btn" onClick={cargar}>Reintentar</button>
    </div>
  )
  if (!est) return <div className="sv-loading">Cargando…</div>

  const anios = Array.from(new Set([...Object.keys(est.bajasTrasVerano.activosVeranoPorAnio), ...Object.keys(est.bajasTrasVerano.porAnio)])).sort()

  return (
    <div className="sv-tab-panel">
      <p className="sv-note">
        Histórico importado del HV Control de Clientes (antes de pasarse a la web) — todo agregado, nunca nombres ni teléfonos.
      </p>
      <div className="sv-kpis">
        <div className="sv-kpi">
          <span className="sv-kpi__value">{est.permanenciaMeses.media} meses</span>
          <span className="sv-kpi__label">Permanencia media ⓘ</span>
        </div>
        <div className="sv-kpi">
          <span className="sv-kpi__value">{est.permanenciaMeses.mediana} meses</span>
          <span className="sv-kpi__label">Mediana</span>
        </div>
        <div className="sv-kpi">
          <span className="sv-kpi__value">{est.permanenciaMeses.alumnos}</span>
          <span className="sv-kpi__label">Alumnos analizados ({est.permanenciaMeses.conMasDeUnPago} con más de un pago)</span>
        </div>
        <div className="sv-kpi">
          <span className="sv-kpi__value">{est.usoBonos.total}</span>
          <span className="sv-kpi__label">Bonos de 10 usados ({est.usoBonos.alumnosUnicos} alumnos)</span>
        </div>
      </div>

      <h2 className="sv-section-title">Bajas tras verano (de quien pagó en jun/jul/ago de ese año, cuántos no volvieron a pagar sep-dic)</h2>
      <table className="sv-tests-table">
        <thead><tr><th>Año</th><th>Activos en verano</th><th>No volvieron</th><th>%</th></tr></thead>
        <tbody>
          {anios.map(a => {
            const activos = est.bajasTrasVerano.activosVeranoPorAnio[a] || 0
            const bajas = est.bajasTrasVerano.porAnio[a] || 0
            const incompleto = est.bajasTrasVerano.aniosIncompletos.includes(a)
            return (
              <tr key={a}>
                <td>{a}{incompleto && <span className="sv-ot-muted"> (datos incompletos todavía)</span>}</td>
                <td>{activos}</td>
                <td className={bajas > 0 ? 'sv-to-bad' : ''}>{bajas}</td>
                <td>{activos ? Math.round((bajas / activos) * 100) : 0}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <TablaPorMes titulo="Alumnos por profesor y mes" datos={est.porProfesorMes} />
      <TablaPorMes titulo="Alumnos por clase y mes" datos={est.porClaseMes} />
    </div>
  )
}

// ─── Pendientes de cobro (NOTAS_PARA_CODE_alumnos_clases_fuente_de_verdad.md, 14/11 18:05/
// 18:10/18:12): una fila por pedido de renovación "Pendiente de pago" real, con la etiqueta y
// la acción ya sugeridas — Eva no tiene que cruzar el Excel ni WooCommerce a mano. Reutiliza
// AccionModal (abajo, en Grupos) para cobrar/cancelar/dar de baja: mismo flujo probado, mismo
// modal con botón de verdad en vez de un confirm() nativo. ──────────────────────────────────
const PC_ETIQUETA = {
  duplicado:            { txt: 'Duplicado → cancelar',                 cls: 'sv-pc-chip--bad'  },
  duplicado_en_espera:  { txt: 'Duplicado en espera → cancelar',       cls: 'sv-pc-chip--bad'  },
  pago_excel:           { txt: 'Pagó según el Excel → marcar cobrado', cls: 'sv-pc-chip--ok'   },
  pago_parcial:         { txt: 'Pagó octubre, falta noviembre',        cls: 'sv-pc-chip--warn' },
  sin_pago:             { txt: 'Sin pago → preguntar o dar de baja',   cls: 'sv-pc-chip--bad'  },
  revisar:              { txt: 'Revisar',                              cls: 'sv-pc-chip--warn' },
}
const PC_VIENE = [
  ['viene', '✅', 'Viene'], ['no_viene', '❌', 'No viene'], ['sin_confirmar', '❓', 'Sin confirmar'],
]
// "Dudosos" = a quien tiene sentido preguntarle al profe si sigue viniendo (no a quien ya pagó
// o ya está marcado "Viene"/"No viene", ni a los duplicados, que se resuelven solos).
const PC_DUDOSO = new Set(['sin_pago', 'pago_parcial', 'revisar'])

function pcWhatsappUrl(telefono, texto) {
  return `https://web.whatsapp.com/send?phone=34${telefono}&text=${encodeURIComponent(texto)}`
}
// Cowork, 14/11 19:00 punto 2: "con usuarios sale «Hola pacocanillas»" — sin nombre de
// facturación real, lo que llega es el login de la cuenta (todo junto, en minúsculas, sin
// espacios). No es un nombre para saludar con él.
function pcEsUsuario(nombre) {
  return !!nombre && !nombre.includes(' ') && nombre === nombre.toLowerCase()
}

function PendientesCobroTab({ busquedaExterna = '' } = {}) {
  const { data, loading, error, refetch } = usePendientesCobro()
  const [profesTel, setProfesTel] = useState({})
  const [editandoTel, setEditandoTel] = useState(null) // nombre del profe cuyo teléfono se está editando
  const [telEnEdicion, setTelEnEdicion] = useState('')
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('')
  const [filtroProfe, setFiltroProfe] = useState('')
  const [filtroViene, setFiltroViene] = useState('')
  const [accion, setAccion] = useState(null)
  const [aviso, setAviso] = useState('')
  // Ramiro, 15/11 08:45 punto B.1: al marcar ❌ (No viene), preguntar si también se cancela la
  // suscripción en WooCommerce — nunca lo uno sin preguntar lo otro.
  const [confirmBaja, setConfirmBaja] = useState(null) // la fila que se está marcando "no_viene"
  const [bajaBusy, setBajaBusy] = useState(false)
  const esSocio = window.blokesSiteData?.userRole === 'socio'

  useEffect(() => { gestionProfesTelefonosGet().then(setProfesTel).catch(() => {}) }, [])

  const filas = useMemo(() => (data?.filas || []).map(f => ({
    ...f,
    // Array.from(new Set(...)): una clase Martes-Jueves con el mismo profe los dos días
    // salía repetida ("Alvaro, Alvaro") — cowork, 15/11 07:50 punto C.
    profes: Array.from(new Set(profesoresDeGrupo(f.dia, f.horario, f.edad).flatMap(d => d.profs))),
  })), [data])

  const profesDisponibles = useMemo(() => Array.from(new Set(filas.flatMap(f => f.profes))).sort(), [filas])

  // Buscador compartido con Grupos (nombre/teléfono/usuario, sin tildes — 15/11 08:45 punto A).
  const busquedaNorm = sgNormalizarTexto(busquedaExterna.trim())
  const telBusquedaNorm = sgNormalizarTelefono(busquedaExterna.trim())
  const filtradas = filas.filter(f =>
    (!filtroEtiqueta || f.etiqueta === filtroEtiqueta) &&
    (!filtroProfe || f.profes.includes(filtroProfe)) &&
    (!filtroViene || (f.vieneEstado || 'sin_confirmar') === filtroViene) &&
    (!busquedaNorm || sgNormalizarTexto(f.nombre || '').includes(busquedaNorm) || (telBusquedaNorm && sgNormalizarTelefono(f.telefono || '').includes(telBusquedaNorm)))
  )

  const resumen = useMemo(() => {
    const porMes = {}; const porEtiqueta = {}
    for (const f of filas) {
      porMes[f.mesPedido] = (porMes[f.mesPedido] || 0) + f.importe
      porEtiqueta[f.etiqueta] = (porEtiqueta[f.etiqueta] || 0) + f.importe
    }
    return { porMes, porEtiqueta, total: filas.reduce((s, f) => s + f.importe, 0) }
  }, [filas])

  async function marcarViene(subId, estado) {
    try { await gestionPendienteCobroViene({ sub_id: subId, estado }); refetch() }
    catch (e) { setAviso(e.message) }
  }

  // Ramiro, 15/11 08:45 punto B.1: «¿Damos de baja también la suscripción en WooCommerce para
  // que no le salga pendiente de pago el mes que viene?» — con simulación previa, como siempre.
  async function confirmarBajaDesdeNoViene(fila, tambienEnWeb) {
    setBajaBusy(true)
    try {
      if (tambienEnWeb) {
        await gestionDarDeBaja({ sub_id: fila.subId, modo: 'inmediata', motivoCategoria: 'otro', motivo: 'No viene (marcado desde Pendientes de cobro)', simular: false })
      }
      await gestionPendienteCobroViene({ sub_id: fila.subId, estado: 'no_viene' })
      setConfirmBaja(null)
      refetch()
    } catch (e) { setAviso(e.message) } finally { setBajaBusy(false) }
  }

  // Cowork, 14/11 19:00 punto 2: nombre real (nunca el usuario tipo "pacocanillas"), cómo
  // pagar con el enlace de verdad del pedido si lo hay, dirigido a la familia si es menor, y
  // sin el «o prefieres que lo gestionemos» confuso — mejor «si ya no vas a seguir viniendo,
  // dínoslo y lo damos de baja».
  async function recordar(fila) {
    if (!fila.telefono) { setAviso(`${fila.nombre} no tiene teléfono guardado.`); return }
    const esMenor = fila.edad && fila.edad !== 'Adultos'
    const primerNombre = pcEsUsuario(fila.nombre) ? '' : fila.nombre.trim().split(/\s+/)[0]
    const mes = fila.mesPedido ? mesLabelLargo(fila.mesPedido) : 'este mes'
    const clase = `${fila.dia} ${fila.horario}`
    const importeTxt = fila.importe ? ` (${fmtEur(fila.importe)})` : ''
    const comoPagar = `Puedes pagarlo en recepción con tarjeta, por transferencia${fila.pagoUrl ? ` o aquí: ${fila.pagoUrl}` : ''}.`
    const texto = esMenor
      ? `Hola${primerNombre ? ` ${primerNombre}` : ''}, te escribimos de RocoMadrid: tenemos pendiente el pago de ${mes} de la clase de ${fila.nombre} (${clase})${importeTxt}. ${comoPagar} Si ya no va a seguir viniendo, dínoslo y lo damos de baja. ¡Gracias!`
      : `Hola${primerNombre ? ` ${primerNombre}` : ''}, te escribimos de RocoMadrid: tenemos pendiente el pago de ${mes} de tu clase de ${clase}${importeTxt}. ${comoPagar} Si ya no vas a seguir viniendo, dínoslo y lo damos de baja. ¡Gracias!`
    window.open(pcWhatsappUrl(fila.telefono, texto), 'blokes_whatsapp')
    try { await gestionPendienteCobroRecordado({ sub_id: fila.subId }); refetch() }
    catch (e) { setAviso(e.message) }
  }

  function preguntarAProfe(profe) {
    const tel = profesTel[profe]
    const dudosos = filtradas.filter(f => PC_DUDOSO.has(f.etiqueta) && f.vieneEstado !== 'viene' && f.profes.includes(profe))
    if (!dudosos.length) return
    if (!tel) { setEditandoTel(profe); setTelEnEdicion(''); setAviso(`Añade el teléfono de ${profe} para poder escribirle.`); return }
    // Un alumno por línea: con 11 en la misma línea era difícil de leer (cowork, 15/11 07:50 punto C).
    const lista = dudosos.map(f => `- ${f.nombre} (${f.dia} ${f.horario})`).join('\n')
    const texto = `Hola ${profe}, ¿siguen viniendo estos alumnos a tus clases?\n${lista}\nGracias, un saludo de RocoMadrid.`
    window.open(pcWhatsappUrl(tel, texto), 'blokes_whatsapp')
  }

  async function guardarTelProfe(nombre, telefono) {
    try {
      const data = await gestionProfesTelefonoSet({ nombre, telefono })
      setProfesTel(data); setEditandoTel(null)
    } catch (e) { setAviso(e.message) }
  }

  if (loading) return <p className="sv-empty">Cargando…</p>
  if (error) return <p className="sv-to-bad">Error: {error}</p>

  const dudososPorProfe = profesDisponibles.filter(p =>
    filtradas.some(f => PC_DUDOSO.has(f.etiqueta) && f.vieneEstado !== 'viene' && f.profes.includes(p))
  )

  return (
    <div className="sv-pc">
      <p className="sv-note">
        Una fila por pedido de renovación «Pendiente de pago» real en WooCommerce, cruzado con el diagnóstico de suscripciones en espera y el Excel de Eva — nada se cambia solo, cada botón es una acción de Eva.
        {data?.sinMatch > 0 && ` ${data.sinMatch} pedido(s) pendiente(s) no se han podido emparejar con ninguna suscripción en espera reconocible — revísalos a mano en WooCommerce.`}
      </p>
      {data?.avisoExcel && <p className="sv-to-warn-txt">⚠ {data.avisoExcel} — los que dependen del Excel pueden no ser de fiar ahora mismo.</p>}
      {aviso && <p className="sv-to-warn-txt">{aviso} <button className="sv-tests-remove" onClick={() => setAviso('')}>✕</button></p>}

      <div className="sv-kpis">
        <div className="sv-kpi" style={{ '--kpi-color': '#f87171' }}>
          <span className="sv-kpi__value">{filas.length}{esSocio ? ` · ${fmtEur(resumen.total)}` : ''}</span>
          <span className="sv-kpi__label">Pendientes de cobro</span>
        </div>
        {esSocio && Object.keys(resumen.porMes).sort().map(m => (
          <div className="sv-kpi" key={m} style={{ '--kpi-color': '#60a5fa' }}>
            <span className="sv-kpi__value">{fmtEur(resumen.porMes[m])}</span>
            <span className="sv-kpi__label">{fmtMonth(m)}</span>
          </div>
        ))}
      </div>

      {dudososPorProfe.length > 0 && (
        <div className="sv-pc-profes">
          <span className="sv-pc-profes__lbl">Preguntar al profe:</span>
          {dudososPorProfe.map(p => {
            const dudosos = filtradas.filter(f => PC_DUDOSO.has(f.etiqueta) && f.vieneEstado !== 'viene' && f.profes.includes(p))
            const tieneTel = !!profesTel[p]
            // Cowork, 14/11 19:00 punto 3/4: la clase al lado de cada alumno (visible antes de
            // enviar, no solo dentro del WhatsApp), y si falta el teléfono del profe que el
            // propio botón lo diga, en vez de abrir el editor sin más explicación.
            const tooltip = dudosos.map(f => `${f.nombre} (${f.dia} ${f.horario})`).join(', ')
            return (
              <span key={p} className="sv-pc-profe-btn">
                <button className="sv-tests-select" title={tooltip} onClick={() => preguntarAProfe(p)}>
                  {tieneTel ? `${p} (${dudosos.length})` : `${p}: falta el teléfono`}
                </button>
                <button
                  className="sv-tests-remove" title={tieneTel ? `Teléfono: ${profesTel[p]}` : 'Sin teléfono guardado'}
                  onClick={() => { setEditandoTel(p); setTelEnEdicion(profesTel[p] || '') }}
                >✏️</button>
              </span>
            )
          })}
          {editandoTel && (
            <span className="sv-pc-tel-edit">
              Teléfono de {editandoTel}:
              <input
                className="sv-tests-select" type="text" placeholder="6XXXXXXXX" autoFocus
                value={telEnEdicion} onChange={e => setTelEnEdicion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarTelProfe(editandoTel, telEnEdicion) }}
              />
              <button className="sv-tests-select" onClick={() => guardarTelProfe(editandoTel, telEnEdicion)}>Guardar</button>
              <button className="sv-tests-remove" onClick={() => setEditandoTel(null)}>✕</button>
            </span>
          )}
        </div>
      )}

      <div className="sv-pc-filtros">
        <select className="sv-tests-select" value={filtroEtiqueta} onChange={e => setFiltroEtiqueta(e.target.value)}>
          <option value="">Todas las etiquetas</option>
          {Object.entries(PC_ETIQUETA).map(([id, e]) => <option key={id} value={id}>{e.txt}</option>)}
        </select>
        <select className="sv-tests-select" value={filtroProfe} onChange={e => setFiltroProfe(e.target.value)}>
          <option value="">Todos los profes</option>
          {profesDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="sv-tests-select" value={filtroViene} onChange={e => setFiltroViene(e.target.value)}>
          <option value="">¿Viene? (todos)</option>
          {PC_VIENE.map(([id, ic, txt]) => <option key={id} value={id}>{ic} {txt}</option>)}
        </select>
      </div>

      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Alumno</th><th>Teléfono</th><th>Clase</th><th>Profe</th><th>Importe</th>
              <th>Meses pagados (Excel)</th><th>Etiqueta</th><th>¿Viene?</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(f => {
              const et = PC_ETIQUETA[f.etiqueta] || { txt: f.etiqueta, cls: '' }
              return (
                <tr key={f.subId}>
                  <td>
                    {f.nombre || <span className="sv-ot-muted">—</span>}
                    {f.activoApp && <div className="sv-ot-muted" title="Ha apuntado algún top en la app en las últimas 2 semanas">🧗 activo en la app ({f.activoApp})</div>}
                  </td>
                  <td className="sv-ot-muted">{f.telefono || '—'}</td>
                  <td>{f.dia} {f.horario}{f.edad !== 'Adultos' ? ` · ${f.edad}` : ''}</td>
                  <td className="sv-ot-muted">{f.profes.join(', ') || '—'}</td>
                  <td>{esSocio ? fmtEur(f.importe) : '—'}{f.mesPedido ? <div className="sv-ot-muted">{fmtMonth(f.mesPedido)}</div> : null}</td>
                  <td className="sv-ot-muted">{f.mesesPagadosExcel ? f.mesesPagadosExcel.join(', ') : '—'}</td>
                  <td>
                    <span className={`sv-pc-chip ${et.cls}`}>{et.txt}</span>
                    {/* Cowork, 14/11 19:00 punto 1: la que se QUEDA sigue con su propia
                        situación — sin esto, parecía que cancelar #x lo dejaba todo resuelto
                        aunque a la que se queda le siguiera faltando un pago. */}
                    {f.cobrarEtiqueta && (
                      <div><span className={`sv-pc-chip ${(PC_ETIQUETA[f.cobrarEtiqueta] || {}).cls || ''}`}>#{f.subId}: {(PC_ETIQUETA[f.cobrarEtiqueta] || {}).txt || f.cobrarEtiqueta}</span></div>
                    )}
                    {f.etiqueta === 'duplicado_en_espera' && f.cancelar?.length > 0 && (
                      <div className="sv-ot-muted">cancelar: {f.cancelar.map(c => `#${c.subId} ${c.nombre}`).join(', ')}</div>
                    )}
                  </td>
                  <td>
                    <div className="sv-pc-viene">
                      {PC_VIENE.map(([id, ic]) => (
                        <button
                          key={id} title={id}
                          className={`sv-pc-viene__btn${(f.vieneEstado || 'sin_confirmar') === id ? ' sv-pc-viene__btn--on' : ''}`}
                          onClick={() => id === 'no_viene' ? setConfirmBaja(f) : marcarViene(f.subId, id)}
                        >{ic}</button>
                      ))}
                    </div>
                    {f.vienePor && <div className="sv-ot-muted">{f.vienePor} · {(f.vieneFecha || '').slice(0, 16).replace('T', ' ')}</div>}
                  </td>
                  <td className="sv-pc-acciones">
                    {f.etiqueta === 'duplicado' && (
                      <button className="sv-tests-select" onClick={() => setAccion({
                        tipo: 'fusionar', targetId: f.subId,
                        alumno: { subId: f.activaId || f.subId, alumno: f.nombre, telefono: f.telefono, notas: '' },
                      })}>Cancelar duplicado</button>
                    )}
                    {f.etiqueta === 'duplicado_en_espera' && f.cancelar?.map(c => (
                      <button key={c.subId} className="sv-tests-select" title="Dar de baja → elige «Inmediata» y motivo «Otro»" onClick={() => setAccion({
                        tipo: 'dar_de_baja', targetId: c.subId,
                        alumno: { subId: c.subId, alumno: c.nombre, telefono: c.telefono, notas: `Duplicado en espera — se cobra la #${f.subId}.` },
                      })}>Cancelar #{c.subId}</button>
                    ))}
                    {/* Cowork, 14/11 19:00 punto 1: además de cancelar las viejas, la que se
                        queda (#{f.subId}) puede necesitar sus propios botones — misma lógica
                        que una fila normal, solo que la etiqueta que manda es cobrarEtiqueta. */}
                    {f.etiqueta === 'duplicado_en_espera' && f.cobrarEtiqueta === 'duplicado' && (
                      <button className="sv-tests-select" onClick={() => setAccion({
                        tipo: 'fusionar', targetId: f.subId,
                        alumno: { subId: f.activaId || f.subId, alumno: f.nombre, telefono: f.telefono, notas: '' },
                      })}>Cancelar duplicado #{f.subId}</button>
                    )}
                    {(f.etiqueta === 'pago_excel' || f.cobrarEtiqueta === 'pago_excel') && (
                      <button className="sv-tests-select" onClick={() => setAccion({
                        tipo: 'marcar_cobrado', targetId: f.subId,
                        alumno: { subId: f.subId, alumno: f.nombre, telefono: f.telefono, notas: '', importeCatalogo: f.importe },
                      })}>Marcar cobrado{f.etiqueta === 'duplicado_en_espera' ? ` #${f.subId}` : ''}</button>
                    )}
                    {['pago_parcial', 'sin_pago', 'revisar'].includes(f.etiqueta === 'duplicado_en_espera' ? f.cobrarEtiqueta : f.etiqueta) && (<>
                      <button className="sv-tests-select" onClick={() => setAccion({
                        tipo: 'marcar_cobrado', targetId: f.subId,
                        alumno: { subId: f.subId, alumno: f.nombre, telefono: f.telefono, notas: '', importeCatalogo: f.importe },
                      })}>Marcar cobrado{f.etiqueta === 'duplicado_en_espera' ? ` #${f.subId}` : ''}</button>{' '}
                      <button
                        className="sv-tests-select" disabled={!f.telefono}
                        title={f.recordadoFecha ? `Último recordatorio: ${f.recordadoPor} · ${f.recordadoFecha.slice(0, 10)}` : ''}
                        onClick={() => recordar(f)}
                      >Recordar por WhatsApp</button>{' '}
                      <button className="sv-tests-select" onClick={() => setAccion({
                        tipo: 'dar_de_baja', targetId: f.subId,
                        alumno: { subId: f.subId, alumno: f.nombre, telefono: f.telefono, notas: '' },
                      })}>Dar de baja{f.etiqueta === 'duplicado_en_espera' ? ` #${f.subId}` : ''}</button>
                    </>)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtradas.length === 0 && <p className="sv-empty">Nada pendiente con estos filtros.</p>}
      </div>

      {accion && (
        <AccionModal
          alumno={accion.alumno} tipo={accion.tipo} targetId={accion.targetId}
          onClose={() => setAccion(null)}
          onDone={() => { setAccion(null); refetch() }}
        />
      )}

      {confirmBaja && (
        <div className="sv-grp-overlay" onClick={() => !bajaBusy && setConfirmBaja(null)}>
          <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
            <h3>¿{confirmBaja.nombre} ya no viene?</h3>
            <p>¿Damos de baja también la suscripción en WooCommerce para que no le salga pendiente de pago el mes que viene?</p>
            <div className="sv-grp-modal__actions">
              <button className="sv-tests-select" disabled={bajaBusy} onClick={() => setConfirmBaja(null)}>Cancelar</button>
              <button className="sv-tests-select" disabled={bajaBusy} onClick={() => confirmarBajaDesdeNoViene(confirmBaja, false)}>No, solo pasar a Bajas</button>
              <button className="sv-tests-danger sv-tests-danger--confirm" disabled={bajaBusy} onClick={() => confirmarBajaDesdeNoViene(confirmBaja, true)}>
                {bajaBusy ? 'Guardando…' : 'Sí, dar de baja en la web'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SupervisionPage() {
  const role          = window.blokesSiteData?.userRole
  const canAccess     = ['gestion', 'socio'].includes(role)

  const TABS = [
    { id: 'excelmuerte', label: 'ExcelMuerte'   },
    // "Pendientes de cobro" vivía aquí (14/11 18:05) — pasó a ser sub-pestaña de Grupos
    // (Ramiro, 15/11 08:45 punto A), con buscador compartido.
    { id: 'grupos',      label: 'Grupos'        },
    { id: 'campanas',    label: 'Campañas'      },
    { id: 'horasextra',  label: 'Horas extra'    },
    // Ramiro, 13/11 07:06: "el control de la tele tiene que estar en supervisión para que lo
    // pueda manejar Eva" — mismo TeleSection de antes (sin dinero, los endpoints ya aceptan
    // gestión), movido aquí desde Superadmin.
    { id: 'tele',        label: 'Tele'           },
    // Lleva sueldos, nóminas y P&L: solo socios
    ...(role === 'socio' ? [{ id: 'timeoff', label: 'CTRL Time Off' }, { id: 'historico', label: 'Histórico' }] : []),
  ]

  const [tab, setTab] = useState('excelmuerte')

  if (!canAccess) {
    return (
      <div className="sv-forbidden">
        <span className="sv-forbidden__icon">🔒</span>
        <p>Acceso restringido.</p>
      </div>
    )
  }

  return (
    <div className="sv-page">
      <h1 className="sv-page__title">Supervisión</h1>

      <div className="sv-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`sv-tab${tab === t.id ? ' sv-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'excelmuerte' && <ClasesTab />}
      {tab === 'grupos'      && <GruposTab />}
      {tab === 'campanas'    && <CampanasSection />}
      {tab === 'horasextra'  && <OvertimeTab />}
      {tab === 'tele'        && <TeleSection />}
      {tab === 'timeoff'     && role === 'socio' && <TimeOffTab />}
      {tab === 'historico'   && role === 'socio' && <HistoricoTab />}
    </div>
  )
}
