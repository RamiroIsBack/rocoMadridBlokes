import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  useClasses, usePeopleSummary, useGestionGrupos,
  gestionMarcarCobrado, gestionPausar, gestionReanudar, gestionNota, gestionDarDeBaja, gestionFusionar, gestionExento, gestionCambiarGrupo, gestionOptinWhatsapp, gestionEditarAlumno, gestionBuscarAlumno,
  gestionListaEsperaGet, gestionListaEsperaCrear, gestionListaEsperaActualizar, gestionListaEsperaBorrar,
  gestionExternoCrear, gestionExternoActualizar, gestionExternoBorrar, gestionExternoPago,
  histPagosImportar,
} from '../hooks/useSuperAdmin'
import { useClases } from '../hooks/useClases'
import OvertimeTab from './OvertimeTab'
import TimeOffTab from './TimeOffTab'
import CampanasSection from '../components/CampanasSection'
import { BASE as STAFF_BASE, PROF_ORDER } from '../data/staffSchedule'
import './SupervisionPage.css'

// Profesor(es) de un grupo de Grupos, a partir del horario de referencia de staffSchedule.js
// (Horario Marzo 2026.xlsx) — no hay un campo propio en WooCommerce, así que es una pista por
// día + hora de clase, no un dato garantizado (sustituciones, cambios de horario no reflejados
// aquí, etc. no se ven).
const DIA_A_STAFFKEY = { Lunes: 'Lunes', Martes: 'Martes', Miercoles: 'Miercoles', 'Miércoles': 'Miercoles', Jueves: 'Jueves', Viernes: 'Viernes' }
function profesoresDeGrupo(diaPareja, horario) {
  if (!diaPareja || !horario) return []
  const horaNorm = horario.trim().slice(0, 5)
  const dias = diaPareja.split(/[-–]/).map(d => DIA_A_STAFFKEY[d.trim()]).filter(Boolean)
  if (!dias.length) return []
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
function ScheduleGrid({ classes, filter }) {
  const parsed = useMemo(() => {
    return classes
      .map(c => ({ ...c, meta: parseClassMeta(c.label) }))
      .filter(c => {
        if (!c.meta) return false
        if (filter === 'mañana') return isMañana(c.meta.timeStart)
        if (filter === 'tarde')  return !isMañana(c.meta.timeStart)
        return true
      })
  }, [classes, filter])

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

  const grid = useMemo(() => {
    const g = {}
    timeSlots.forEach(slot => { g[slot] = [0, 0, 0, 0, 0] })
    parsed.forEach(c => {
      const { time, days } = c.meta
      days.forEach(day => {
        if (day < 5 && g[time] !== undefined) g[time][day] += c.active
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
    timeSlots.forEach(slot => grid[slot].forEach((n, i) => { t[i] += n }))
    return t
  }, [grid, timeSlots])

  // Plazas por sesión: el Total de cada fila suma sus columnas de día, así que una clase
  // Martes-Jueves cuenta una vez en martes y otra en jueves (igual criterio que el pie de
  // columna). No es "personas distintas" — eso está en la sección "Personas", aparte.
  const rowTotals = useMemo(() => {
    const totals = {}
    timeSlots.forEach(slot => { totals[slot] = grid[slot].reduce((s, n) => s + n, 0) })
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
      <div className="sv-legend">
        <span className="sv-legend__label">Inscritos:</span>
        <span className="sv-legend__item sv-legend__item--low">1–3</span>
        <span className="sv-legend__item sv-legend__item--med">4–6</span>
        <span className="sv-legend__item sv-legend__item--high">7–10</span>
        <span className="sv-legend__item sv-legend__item--full">11+</span>
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
                  {row.map((n, i) => {
                    const isScheduled = scheduledSlots.has(`${slot}|${i}`)
                    const isEmpty = isScheduled && n === 0
                    return (
                      <td key={i} className={`sv-td ${isEmpty ? 'sv-cell--sched-empty' : occupancyClass(n)}`}>
                        <span className="sv-cell-num">{n > 0 ? n : isScheduled ? '0' : '—'}</span>
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

const CHART_STYLE = {
  tooltip: { background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 },
  label:   { color: '#f5c842' },
  tick:    { fill: '#888', fontSize: 10 },
  grid:    '#2a2015',
}

const CLASS_COLORS = [
  '#f5c842','#60a5fa','#34d399','#f97316','#a78bfa',
  '#fb7185','#22d3ee','#84cc16','#e879f9','#facc15',
  '#38bdf8','#4ade80','#fbbf24','#818cf8',
]

function MonthlyBarChart({ data, bars, height = 160, stacked = false }) {
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

function TrendCharts({ data, months, selectedKey, onSelectKey }) {
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
                <span key={`a-${i}`} className="sv-member sv-member--active">
                  <span className="sv-member__name">{m.name}</span>
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
            { label: 'Niños',           classes: classGroups.kids,    color: '#34d399' },
            { label: 'Mañanas adultos', classes: classGroups.morning, color: '#f5c842' },
            { label: 'Tardes adultos',  classes: classGroups.evening, color: '#60a5fa' },
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
      <div className="sv-kpi" style={{ '--kpi-color': '#60a5fa' }}
        title="Cuentas de facturación con una suscripción en vigor (activa o ya cancelada pero con acceso hasta fin de periodo). No es el nº exacto de alumnos: una cuenta puede tener varios hijos/hermanos — eso lo resolverá el campo «Alumno» de la migración (sección 8).">
        <span className="sv-kpi__value">{data.cuentas_total}</span>
        <span className="sv-kpi__label">Cuentas en vigor ⓘ</span>
      </div>
      {Object.keys(BUCKET_LABEL).map(b => (
        <div key={b} className="sv-kpi" style={{ '--kpi-color': '#a78bfa' }}
          title={`Días a la semana de ${BUCKET_LABEL[b]}: cuántas cuentas de este grupo vienen 1, 2 o 3+ días (sumando todas sus suscripciones). Niños/adolescentes y Pilates/Yoga van aparte del resto. Solo cuenta lo que hay suscrito en la web — un alumno que paga por fuera (transferencia, efectivo) y no tiene suscripción en la web no sale aquí.`}>
          <span className="sv-kpi__value">{porDias(b)}</span>
          <span className="sv-kpi__label">{BUCKET_LABEL[b]} ⓘ</span>
        </div>
      ))}
      <div className="sv-kpi" style={{ '--kpi-color': '#34d399' }}
        title="Suma de plazas por sesión (día + hora): una suscripción Martes-Jueves cuenta una vez en martes y una vez en jueves. Mismo criterio que la columna Total de «Horario por día», salvo que aquí sí se incluyen las pending-cancel (ya cancelaron, pero siguen viniendo hasta fin de periodo) — por eso puede salir algo más alto que el total de «Horario por día», que las cuenta aparte.">
        <span className="sv-kpi__value">{data.sesiones_semana}</span>
        <span className="sv-kpi__label">Sesiones/semana ⓘ</span>
      </div>
      {data.ingreso_mes_total != null && (
        <div className="sv-kpi" style={{ '--kpi-color': '#f5c842' }}
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
  const [months, setMonths]           = useState(6)
  const [filter, setFilter]           = useState('todos')
  const [selectedClassKey, setSelectedClassKey] = useState('')
  const { data, loading, error } = useClasses(months)

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
            <p className="sv-note">Snapshot actual de alumnos activos por franja horaria. Verde intenso = mucha gente; rosa = clase programada pero sin activos; — = sin clase en ese horario.</p>
            <ScheduleGrid classes={data} filter={filter} />
            {totalEnding > 0 && (
              <p className="sv-note sv-to-small">
                + <strong>{totalEnding}</strong> {totalEnding === 1 ? 'que ya canceló' : 'que ya cancelaron'} y se {totalEnding === 1 ? 'va' : 'van'} este mes (tienen acceso hasta que acabe el periodo pagado, no cuentan arriba como activos).
              </p>
            )}
          </section>

          {hasRevenue && (
            <div className="sv-kpis">
              <div className="sv-kpi" style={{ '--kpi-color': '#34d399' }}>
                <span className="sv-kpi__value">{fmtEur(totalRevenue)}</span>
                <span className="sv-kpi__label">Ingresos WC clases ({months}m)</span>
              </div>
            </div>
          )}

          <TrendCharts data={data} months={months} selectedKey={selectedClassKey} onSelectKey={setSelectedClassKey} />
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

function AccionModal({ alumno, tipo, targetId, onClose, onDone }) {
  const [importe, setImporte] = useState(alumno.importeCatalogo ? String(alumno.importeCatalogo) : '')
  const [metodo, setMetodo]   = useState('transferencia')
  const [fecha, setFecha]     = useState(hoyISO())
  const [parcial, setParcial] = useState(false)
  const [motivo, setMotivo]   = useState('')
  const [fechaVuelta, setFechaVuelta] = useState('')
  const [nota, setNota]       = useState(alumno.notas || '')
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
  const { clases: catalogoClases } = useClases(tipo === 'cambiar_grupo')
  // Marcar cobrado y cambiar de grupo pueden generar factura/cambio de precio de verdad: por
  // defecto se simulan. El resto ya están validadas con datos de prueba, así que por defecto
  // actúan de verdad.
  const [simular, setSimular] = useState(tipo === 'marcar_cobrado' || tipo === 'cambiar_grupo')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState(null)

  const titulos = {
    marcar_cobrado: 'Marcar cobrado', pausar: 'Pausar', reanudar: 'Reanudar', nota: 'Nota',
    dar_de_baja: 'Dar de baja', fusionar: 'Fusionar duplicado',
    exento: alumno.exento ? 'Quitar exento/socio' : 'Marcar exento/socio',
    cambiar_grupo: 'Cambiar de grupo/horario',
    ext_cobrar: 'Marcar cobrado (fuera de la web)', ext_editar: alumno.externoId ? 'Editar datos' : 'Alta de alumno externo', ext_borrar: 'Eliminar alumno externo',
    optin_whatsapp: 'Consentimiento WhatsApp', editar_alumno: 'Editar nombre/teléfono',
  }
  const puedeSimular = ['marcar_cobrado', 'pausar', 'reanudar', 'dar_de_baja', 'fusionar', 'cambiar_grupo'].includes(tipo)
  const clasesSemanales = (catalogoClases || []).filter(c => c.tipo === 'classes')

  async function submit(forzarReal = false) {
    setBusy(true); setErr(null)
    const sim = puedeSimular ? (forzarReal ? false : simular) : false
    try {
      let res
      if (tipo === 'marcar_cobrado') {
        if (!importe || Number(importe) <= 0) throw new Error('Pon un importe mayor que 0.')
        res = await gestionMarcarCobrado({ sub_id: alumno.subId, importe: Number(importe), metodo, fecha, parcial, nota, mantener_pausa: mantenerPausa, simular: sim })
      } else if (tipo === 'pausar') {
        if (!motivo.trim()) throw new Error('Pon un motivo.')
        res = await gestionPausar({ sub_id: alumno.subId, motivo, fecha_vuelta: fechaVuelta, simular: sim })
      } else if (tipo === 'reanudar') {
        res = await gestionReanudar({ sub_id: alumno.subId, simular: sim })
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
        const [dia, horario, edad] = grupoNuevo.split('|')
        res = await gestionCambiarGrupo({ sub_id: alumno.subId, dia, horario, edad, simular: sim })
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
              {Object.entries(preview).filter(([k, v]) => k !== 'aviso' && v !== null).map(([k, v]) => (
                <li key={k}><span>{previewLabel(k)}</span><span>{previewValor(v)}</span></li>
              ))}
            </ul>
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
                    <option value="precio">Precio</option>
                    <option value="horario">Horario</option>
                    <option value="lesion">Lesión</option>
                    <option value="mudanza">Mudanza</option>
                    <option value="otro">Otro</option>
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
                  <select className="sv-tests-select" value={grupoNuevo} onChange={e => setGrupoNuevo(e.target.value)}>
                    <option value="">— Elige día · horario · edad —</option>
                    {clasesSemanales.map(c => (
                      <option key={`${c.dia}|${c.horario}|${c.edad}`} value={`${c.dia}|${c.horario}|${c.edad}`}>
                        {c.dia} · {c.horario} · {c.edad} ({c.precio} €)
                      </option>
                    ))}
                  </select>
                </label>
                <p className="sv-to-warn-txt">
                  Cambia el precio de la suscripción a partir de la próxima renovación (según la tabla de tarifas vigente), sin tocar lo ya pagado. No genera pedido ni factura.
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
                disabled={busy || !!preview.adelantadoYaGuardado}
                title={preview.adelantadoYaGuardado ? 'Ya hay un pago adelantado guardado para este mes — anúlalo primero si quieres cambiarlo.' : undefined}
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

function AccionMenu({ alumno, onPick, onClose }) {
  if (alumno.esExterno) {
    return (
      <div className="sv-grp-overlay" onClick={onClose}>
        <div className="sv-grp-menu" onClick={e => e.stopPropagation()}>
          <button onClick={() => onPick('ext_cobrar')}>Marcar cobrado</button>
          <button onClick={() => onPick('ext_editar')}>Editar datos</button>
          <button onClick={() => onPick('exento')}>{alumno.exento ? 'Quitar exento/socio' : 'Marcar exento/socio'}</button>
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
        {puedeBaja     && <button onClick={() => onPick('dar_de_baja')}>Dar de baja</button>}
        <button onClick={() => onPick('nota')}>Nota</button>
        <button onClick={() => onPick('exento')}>{alumno.exento ? 'Quitar exento/socio' : 'Marcar exento/socio'}</button>
        <button onClick={() => onPick('cambiar_grupo')}>Cambiar de grupo/horario</button>
        <button onClick={() => onPick('optin_whatsapp')}>Consentimiento WhatsApp</button>
        <button onClick={() => onPick('editar_alumno')}>Editar nombre/teléfono</button>
        {alumno.otrasSubs?.map(s => (
          <button key={s.subId} onClick={() => onPick('fusionar', s.subId)}>Fusionar — cancelar #{s.subId}</button>
        ))}
        <button className="sv-grp-menu__cancel" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}
const MES_CORTO_GRP = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesLabelGrp = ym => { const [y, m] = ym.split('-'); return `${MES_CORTO_GRP[Number(m) - 1]} ${y.slice(2)}` }
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

function ProfesorLine({ dia, horario }) {
  const profesores = profesoresDeGrupo(dia, horario)
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
            return (
              <tr key={a.subId}>
                <td>
                  {a.alumno || <span className="sv-ot-muted">—</span>}
                  {a.telefono
                    ? <WaMark alumno={a} onClick={() => onWa(a)} />
                    : <span className="sv-wa sv-wa--sin" title="No se puede pedir el consentimiento de WhatsApp sin teléfono guardado">(sin tlf)</span>}
                  {a.sinNombre && <span className="sv-to-warn-txt" title="No es un nombre real: es el usuario de la cuenta (sin dirección de facturación). Pulsa ⋯ → «Editar nombre/teléfono» para arreglarlo."> ⚠ no es nombre real</span>}
                  {a.exento && <span title="Exento/socio: no se le pide cobro">*</span>}
                  {a.otrasSubs?.length > 0 && (
                    <span title={`${a.otrasSubs.length} suscripción(es) antigua(s) colgando en este grupo (duplicado)`}> ⚠</span>
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
function BuscarAlumnoModal({ onClose }) {
  const [q, setQ]           = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando]     = useState(false)
  const [err, setErr]       = useState(null)

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

  return (
    <div className="sv-grp-overlay" onClick={onClose}>
      <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
        <h3>Añadir alumno — buscar primero</h3>
        <p className="sv-note">
          Busca por nombre, teléfono o email en suscripciones (de cualquier estado, también antiguos alumnos),
          externos y usuarios de WordPress. De momento solo enseña dónde está cada uno — "Transferir aquí",
          "Añadir a este grupo" y "Crear alumno nuevo" llegan en la siguiente ronda.
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

function GruposTab() {
  const { data, loading, error, refetch } = useGestionGrupos(4)
  const [grupoKey, setGrupoKey] = useState('')
  const [vista, setVista]     = useState('grupos') // 'grupos' | 'duplicados' | 'cobrar' | 'pausados' | 'bajas' | 'sindatos'
  const [menuFor, setMenuFor] = useState(null)   // alumno con el menú de acciones abierto
  const [accion, setAccion]   = useState(null)   // { alumno, tipo } con el modal abierto
  const [buscador, setBuscador] = useState(false) // modal de "Añadir alumno" (buscar)
  const [busqueda, setBusqueda] = useState('') // buscador de arriba: filtra todas las tablas de Grupos a la vez
  const [espera, setEspera] = useState(null) // lista de espera (8.5), cargada al entrar en esa vista
  const [esperaForm, setEsperaForm] = useState({ dia: '', horario: '', edad: 'Adultos', nombre: '', telefono: '', notas: '' })
  const [esperaBusy, setEsperaBusy] = useState(false)

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
  const duplicados  = useMemo(() => conGrupo.filter(a => a.otrasSubs?.length > 0).filter(coincide), [conGrupo, terminoBusq, telBusq])
  const porCobrar    = useMemo(() => conGrupo.filter(a => a.pendiente && !a.exento && a.estado !== 'pausado' && a.estado !== 'baja_fin_mes').filter(coincide), [conGrupo, terminoBusq, telBusq])
  const pausados      = useMemo(
    () => conGrupo.filter(a => a.estado === 'pausado').filter(coincide).sort((a, b) => (a.pausaHasta || '9999') < (b.pausaHasta || '9999') ? -1 : 1),
    [conGrupo, terminoBusq, telBusq]
  )
  const bajas          = useMemo(() => conGrupo.filter(a => a.estado === 'baja_fin_mes').filter(coincide), [conGrupo, terminoBusq, telBusq])
  const sinDatos        = useMemo(() => conGrupo.filter(a => !a.telefono || a.sinNombre).filter(coincide), [conGrupo, terminoBusq, telBusq])
  const pagaFuera        = useMemo(() => conGrupo.filter(a => a.esExterno).filter(coincide), [conGrupo, terminoBusq, telBusq])

  // Cuántos coinciden en la vista actual — Ramiro, 2/11 09:40: no sabía "dónde darle a buscar"
  // ni si el filtro seguía puesto al cambiar de pestaña; este número deja claro ambas cosas.
  const resultadosBusqueda = (terminoBusq || telBusq) ? ({
    grupos: conGrupo.filter(coincide).length, cobrar: porCobrar.length, pausados: pausados.length,
    bajas: bajas.length, sindatos: sinDatos.length, externos: pagaFuera.length, duplicados: duplicados.length,
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
      if (a.pendiente && !a.exento && a.estado !== 'pausado' && a.estado !== 'baja_fin_mes') {
        k.pendienteMes++
        k.pendienteImporte += a.pendiente.importe
      }
    })
    return k
  }, [alumnos, mesActual])

  if (loading) return <div className="sv-loading">Cargando grupos…</div>
  if (error)   return <div className="sv-error">Error: {error}</div>

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

      <div className="sv-controls">
        <div className="sv-controls-left">
          <button className={`sv-tab-mini ${vista === 'grupos' ? 'is-active' : ''}`} onClick={() => setVista('grupos')}>Grupos</button>
          <button className={`sv-tab-mini ${vista === 'cobrar' ? 'is-active' : ''}`} onClick={() => setVista('cobrar')}>
            Cobrar este mes {porCobrar.length ? <span className="sv-tab-mini__count">({porCobrar.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'pausados' ? 'is-active' : ''}`} onClick={() => setVista('pausados')}>
            Pausados {pausados.length ? <span className="sv-tab-mini__count">({pausados.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'bajas' ? 'is-active' : ''}`} onClick={() => setVista('bajas')}>
            Bajas a fin de mes {bajas.length ? <span className="sv-tab-mini__count">({bajas.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'sindatos' ? 'is-active' : ''}`} onClick={() => setVista('sindatos')}>
            Sin datos {sinDatos.length ? <span className="sv-tab-mini__count">({sinDatos.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'externos' ? 'is-active' : ''}`} onClick={() => setVista('externos')}>
            Pagan fuera de la web {pagaFuera.length ? <span className="sv-tab-mini__count">({pagaFuera.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'duplicados' ? 'is-active' : ''}`} onClick={() => setVista('duplicados')}>
            Duplicados {duplicados.length ? <span className="sv-tab-mini__count">({duplicados.length})</span> : ''}
          </button>
          <button className={`sv-tab-mini ${vista === 'espera' ? 'is-active' : ''}`} onClick={abrirEspera}>
            Lista de espera
          </button>
          <button className={`sv-tab-mini ${vista === 'campanas' ? 'is-active' : ''}`} onClick={() => setVista('campanas')}>
            Campañas
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
        </div>
      </div>

      {resultadosBusqueda !== null && (
        <p className="sv-grp-buscar-resultado">
          {resultadosBusqueda} resultado{resultadosBusqueda === 1 ? '' : 's'} para «{busqueda.trim()}» en esta pestaña — <button type="button" className="sv-grp-buscar-limpiar-texto" onClick={() => setBusqueda('')}>quitar filtro</button>
        </p>
      )}

      {buscador && <BuscarAlumnoModal onClose={() => setBuscador(false)} />}

      {vista === 'cobrar' && (
        <>
          <p className="sv-note">
            Tienen de verdad un pedido sin pagar este mes (no solo «sin pedido»): no incluye a quien ya está pausado,
            de baja o marcado exento/socio.
          </p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Teléfono</th><th>Estado</th><th>Pendiente</th><th></th></tr>
              </thead>
              <tbody>
                {porCobrar.map(a => {
                  const est = ESTADO_LABEL[a.estado] || { txt: a.estado, cls: '' }
                  return (
                    <tr key={`${a.subId}-${a.grupoLabel}`}>
                      <td>{a.alumno || <span className="sv-ot-muted">—</span>}</td>
                      <td className="sv-ot-muted">{a.grupoLabel}</td>
                      <td className="sv-ot-muted">{a.telefono || '—'}</td>
                      <td><span className={`sv-grp-estado ${est.cls}`}>{est.txt}</span></td>
                      <td>
                        {a.pendiente.adelantado ? (
                          <span className="sv-ot-muted" title={`Pagó por adelantado: ${fmtEur(a.pendiente.adelantadoImporte)} (${a.pendiente.adelantadoMetodo}). Se aplicará solo cuando venza esta renovación.`}>
                            Adelantado — se aplicará el {a.pendiente.fecha}
                          </span>
                        ) : (
                          <span className="sv-to-bad">
                            {fmtEur(a.pendiente.importe)}{' '}
                            <span className="sv-ot-muted">({a.pendiente.fechaEsVencimiento ? `vence ${a.pendiente.fecha}` : `pedido del ${a.pendiente.fecha}`})</span>
                          </span>
                        )}
                      </td>
                      <td><button className="sv-tests-remove" onClick={() => setMenuFor(a)} title="Acciones">⋯</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {porCobrar.length === 0 && <p className="sv-empty">Nadie con un pago pendiente real este mes.</p>}
        </>
      )}

      {vista === 'pausados' && (
        <>
          <p className="sv-note">Por lesión, viaje… (no es impago). Ordenado por cuándo vuelven.</p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Teléfono</th><th>Motivo</th><th>Vuelve el</th><th></th></tr>
              </thead>
              <tbody>
                {pausados.map(a => (
                  <tr key={`${a.subId}-${a.grupoLabel}`}>
                    <td>{a.alumno || <span className="sv-ot-muted">—</span>}</td>
                    <td className="sv-ot-muted">{a.grupoLabel}</td>
                    <td className="sv-ot-muted">{a.telefono || '—'}</td>
                    <td>{a.pausaMotivo || <span className="sv-ot-muted">—</span>}</td>
                    <td className={a.pausaHasta ? '' : 'sv-ot-muted'}>{a.pausaHasta || 'Sin fecha'}</td>
                    <td><button className="sv-tests-remove" onClick={() => setMenuFor(a)} title="Acciones">⋯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pausados.length === 0 && <p className="sv-empty">Nadie pausado ahora mismo.</p>}
        </>
      )}

      {vista === 'bajas' && (
        <>
          <p className="sv-note">Siguen viniendo hasta que se les acabe lo ya pagado; luego se dan de baja solas.</p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Teléfono</th><th>Notas</th><th></th></tr>
              </thead>
              <tbody>
                {bajas.map(a => (
                  <tr key={`${a.subId}-${a.grupoLabel}`}>
                    <td>{a.alumno || <span className="sv-ot-muted">—</span>}</td>
                    <td className="sv-ot-muted">{a.grupoLabel}</td>
                    <td className="sv-ot-muted">{a.telefono || '—'}</td>
                    <td className="sv-ot-muted">{a.notas || '—'}</td>
                    <td><button className="sv-tests-remove" onClick={() => setMenuFor(a)} title="Acciones">⋯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bajas.length === 0 && <p className="sv-empty">Nadie de baja a fin de mes ahora.</p>}
        </>
      )}

      {vista === 'sindatos' && (
        <>
          <p className="sv-note">
            Altas hechas desde wp-admin sin teléfono y/o sin nombre de facturación: lo que se ve es el nombre de
            usuario de la cuenta, no un nombre real. Se arreglará del todo con la migración del Excel.
          </p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno (como sale)</th><th>Grupo</th><th>Teléfono</th><th>Falta</th><th></th></tr>
              </thead>
              <tbody>
                {sinDatos.map(a => (
                  <tr key={`${a.subId}-${a.grupoLabel}`}>
                    <td>{a.alumno || <span className="sv-ot-muted">—</span>} <span className="sv-ot-muted">#{a.subId}</span></td>
                    <td className="sv-ot-muted">{a.grupoLabel}</td>
                    <td className="sv-ot-muted">{a.telefono || '—'}</td>
                    <td className="sv-ot-muted">
                      {[!a.telefono && 'teléfono', a.sinNombre && 'nombre'].filter(Boolean).join(' y ')}
                    </td>
                    <td><button className="sv-tests-remove" onClick={() => setMenuFor(a)} title="Acciones">⋯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sinDatos.length === 0 && <p className="sv-empty">Todos con teléfono y nombre real.</p>}
        </>
      )}

      {vista === 'externos' && (
        <>
          <p className="sv-note">
            Pagan fuera de la web (en mano, por transferencia directa…), sin suscripción de WooCommerce: lo que
            lleve aquí no toca WooCommerce ni genera factura. De la migración del Excel, o añadidos a mano.
          </p>
          <button
            className="sv-tests-select"
            onClick={() => setAccion({ alumno: { esExterno: true, alumno: '', telefono: '', notas: '', exento: false, externoDia: '', externoHorario: '', externoEdad: 'Adultos' }, tipo: 'ext_editar' })}
          >+ Alta externa</button>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Teléfono</th><th>Notas</th><th></th></tr>
              </thead>
              <tbody>
                {pagaFuera.map(a => (
                  <tr key={`ext-${a.externoId}`}>
                    <td>{a.alumno || <span className="sv-ot-muted">—</span>}{a.exento && <span title="Exento/socio">*</span>}</td>
                    <td className="sv-ot-muted">{a.grupoLabel}</td>
                    <td className="sv-ot-muted">{a.telefono || '—'}</td>
                    <td className="sv-ot-muted">{a.notas || '—'}</td>
                    <td><button className="sv-tests-remove" onClick={() => setMenuFor(a)} title="Acciones">⋯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagaFuera.length === 0 && <p className="sv-empty">Nadie dado de alta como externo todavía.</p>}
        </>
      )}

      {vista === 'duplicados' && (
        <>
          <p className="sv-note">
            Alumnos con una suscripción vieja colgando de la misma clase (se volvieron a apuntar con un alta nueva).
            «Fusionar» cancela solo la vieja; la activa no se toca.
          </p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr><th>Alumno</th><th>Grupo</th><th>Estado (vigente)</th><th>Antiguas colgando</th><th></th></tr>
              </thead>
              <tbody>
                {duplicados.map(a => {
                  const est = ESTADO_LABEL[a.estado] || { txt: a.estado, cls: '' }
                  return (
                    <tr key={`${a.subId}-${a.grupoLabel}`}>
                      <td>{a.alumno || <span className="sv-ot-muted">—</span>}</td>
                      <td className="sv-ot-muted">{a.grupoLabel}</td>
                      <td><span className={`sv-grp-estado ${est.cls}`}>{est.txt}</span> <span className="sv-ot-muted">#{a.subId}</span></td>
                      <td className="sv-ot-muted">{a.otrasSubs.map(s => `#${s.subId} (${ESTADO_LABEL[s.estado]?.txt || s.estado})`).join(', ')}</td>
                      <td><button className="sv-tests-remove" onClick={() => setMenuFor(a)} title="Acciones">⋯</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {duplicados.length === 0 && <p className="sv-empty">Sin duplicados pendientes de fusionar.</p>}
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
              <table className="sv-tests-table">
                <thead>
                  <tr><th>Nombre</th><th>Teléfono</th><th>Grupo</th><th>Notas</th><th>Desde</th><th></th></tr>
                </thead>
                <tbody>
                  {espera.map(p => (
                    <tr key={p.id} style={p.atendido ? { opacity: 0.5 } : undefined}>
                      <td>{p.nombre}</td>
                      <td className="sv-ot-muted">{p.telefono || '—'}</td>
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

      {vista === 'campanas' && <CampanasSection />}

      {vista === 'grupos' && (<>
      {grupo && <ProfesorLine dia={grupo.dia} horario={grupo.horario} />}
      {/* Dinero AGREGADO (cobrado del mes, importe pendiente total) es solo para socio — ver
          NOTAS_PARA_CODE_privacidad_dinero.md. Lo de cada alumno (quién debe y cuánto) sí lo ve
          gestion, en la tabla de abajo. */}
      <div className="sv-kpis">
        <div className="sv-kpi" style={{ '--kpi-color': '#60a5fa' }} title="Personas en vigor (activas o de baja a fin de mes) en este grupo — mismo criterio que «Cuentas en vigor» de ExcelMuerte. Las en espera/pausadas/pendientes de alta se cuentan aparte. En «Todos los grupos» cuenta por grupo: quien está en dos grupos distintos (p. ej. un grupo normal y Pilates/Yoga) suma 2, por eso puede ser algo más que las cuentas únicas de ExcelMuerte.">
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
        <div className="sv-kpi" style={{ '--kpi-color': '#f87171' }} title="Tienen de verdad un pedido sin pagar (pendiente, fallido o en espera de pago), no solo «sin pedido este mes» — así no cuenta a quien paga trimestral y le toca más adelante. No incluye a quien ya está pausado, de baja o marcado exento/socio (*).">
          <span className="sv-kpi__value">{kpis.pendienteMes}{window.blokesSiteData?.userRole === 'socio' ? ` · ${fmtEur(kpis.pendienteImporte)}` : ''}</span>
          <span className="sv-kpi__label">Pendiente del mes ⓘ</span>
        </div>
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
              <ProfesorLine dia={g.dia} horario={g.horario} />
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
          onPick={(tipo, targetId) => { setAccion({ alumno: menuFor, tipo, targetId }); setMenuFor(null) }}
        />
      )}
      {accion && (
        <AccionModal
          alumno={accion.alumno}
          tipo={accion.tipo}
          targetId={accion.targetId ?? accion.alumno.subId}
          onClose={() => setAccion(null)}
          onDone={() => { setAccion(null); refetch() }}
        />
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
    { id: 'grupos',      label: 'Grupos'        },
    { id: 'horasextra',  label: 'Horas extra'    },
    // Lleva sueldos, nóminas y P&L: solo socios
    ...(role === 'socio' ? [{ id: 'timeoff', label: 'CTRL Time Off' }] : []),
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
      {tab === 'horasextra'  && <OvertimeTab />}
      {tab === 'timeoff'     && role === 'socio' && <TimeOffTab />}
    </div>
  )
}
