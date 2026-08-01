import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useClasses } from '../hooks/useSuperAdmin'
import { getConfig, saveTests, setMockValue, clearMockValue } from '../utils/trainingConfig'
import './SupervisionPage.css'

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

  // Row totals: sum c.active once per class (not per day) to avoid double-counting
  const rowTotals = useMemo(() => {
    const totals = {}
    timeSlots.forEach(slot => { totals[slot] = 0 })
    parsed.forEach(c => {
      if (totals[c.meta.time] !== undefined) totals[c.meta.time] += c.active
    })
    return totals
  }, [parsed, timeSlots])

  // Grand total: unique students — each class counted once regardless of days
  const grandTotal = useMemo(() => parsed.reduce((s, c) => s + c.active, 0), [parsed])

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
              <th className="sv-th sv-th--total">Total</th>
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
              <td className="sv-td-grand">{grandTotal || '—'}</td>
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
            <h2 className="sv-section-title">Horario por día</h2>
            <p className="sv-note">Snapshot actual de alumnos activos por franja horaria. Verde intenso = mucha gente; rosa = clase programada pero sin activos; — = sin clase en ese horario.</p>
            <ScheduleGrid classes={data} filter={filter} />
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
    </div>
  )
}

// ─── CTRL Training Tests ──────────────────────────────────────────────────────

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getTrainingHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

function CtrlTestsTab() {
  const [config, setConfig]       = useState(() => getConfig())
  const [mockInputs, setMockInputs] = useState({})
  const [feedback, setFeedback]   = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing]   = useState(false)

  function flash(msg) {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 2800)
  }

  async function handleClearAllDB() {
    setClearing(true)
    setConfirmClear(false)
    try {
      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/training/all`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getTrainingHeaders(),
      })
      const json = await res.json()
      if (res.ok) flash('✓ BD vaciada — el mock es ahora la única fuente')
      else flash(`✗ Error: ${json.message || res.status}`)
    } catch (e) {
      flash(`✗ Error de red: ${e.message}`)
    } finally {
      setClearing(false)
    }
  }

  function handleTestChange(index, field, value) {
    setConfig(prev => ({
      ...prev,
      tests: prev.tests.map((t, i) => i === index ? { ...t, [field]: value } : t),
    }))
  }

  function handleSaveTests() {
    saveTests(config.tests)
    setConfig(getConfig())
    flash('✓ Nombres guardados')
  }

  function handleAddTest() {
    const newId = Date.now()
    setConfig(prev => ({
      ...prev,
      tests: [...prev.tests, { id: newId, name: '', unit: 'reps', zone: 'lower' }],
    }))
  }

  function handleApplyMock(testId) {
    const val = parseFloat(mockInputs[testId])
    if (isNaN(val) || val <= 0) return
    setMockValue(testId, val)
    setMockInputs(prev => ({ ...prev, [testId]: '' }))
    setConfig(getConfig())
    flash('✓ Mock aplicado — el chart se actualiza al recargar')
  }

  function handleClearMock(testId) {
    clearMockValue(testId)
    setConfig(getConfig())
    flash('✓ Mock eliminado')
  }

  return (
    <div className="sv-ctrl-tests">
      <h2 className="sv-section-title">Tests de entrenamiento</h2>
      <p className="sv-note">Edita nombre, unidad y zona. "Aplicar" genera datos de comunidad para los últimos 6 meses a partir del valor de referencia.</p>

      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Unidad</th>
              <th>Zona</th>
              <th>Mock activo</th>
              <th>Nuevo valor ref.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {config.tests.map((t, i) => (
              <tr key={t.id}>
                <td>
                  <input
                    className="sv-tests-input"
                    value={t.name}
                    onChange={e => handleTestChange(i, 'name', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="sv-tests-input sv-tests-input--unit"
                    value={t.unit}
                    onChange={e => handleTestChange(i, 'unit', e.target.value)}
                  />
                </td>
                <td>
                  <select
                    className="sv-tests-select"
                    value={t.zone}
                    onChange={e => handleTestChange(i, 'zone', e.target.value)}
                  >
                    <option value="lower">Inferior</option>
                    <option value="upper">Superior</option>
                    <option value="fingers">Dedos</option>
                  </select>
                </td>
                <td className="sv-tests-mock-cell">
                  {config.mockValues[t.id] != null ? (
                    <>
                      <span className="sv-tests-mock-val">{config.mockValues[t.id]} {t.unit}</span>
                      <button className="sv-tests-clear" onClick={() => handleClearMock(t.id)} title="Eliminar mock">×</button>
                    </>
                  ) : (
                    <span className="sv-tests-none">—</span>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="sv-tests-input sv-tests-input--num"
                    value={mockInputs[t.id] || ''}
                    onChange={e => setMockInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                    placeholder="ej. 12"
                  />
                </td>
                <td>
                  <button
                    className="sv-tests-apply"
                    disabled={!mockInputs[t.id]}
                    onClick={() => handleApplyMock(t.id)}
                  >Aplicar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sv-tests-actions">
        <button className="sv-tests-add" onClick={handleAddTest}>+ Añadir test</button>
        <button className="sv-tests-save" onClick={handleSaveTests}>Guardar nombres/unidades</button>
        {!confirmClear
          ? <button className="sv-tests-danger" onClick={() => setConfirmClear(true)}>Vaciar BD tests</button>
          : <>
              <span className="sv-tests-confirm-msg">¿Seguro? Borra todos los registros</span>
              <button className="sv-tests-danger sv-tests-danger--confirm" onClick={handleClearAllDB} disabled={clearing}>
                {clearing ? 'Borrando…' : 'Sí, borrar todo'}
              </button>
              <button className="sv-tests-cancel" onClick={() => setConfirmClear(false)}>Cancelar</button>
            </>
        }
        {feedback && <span className="sv-tests-feedback">{feedback}</span>}
      </div>
    </div>
  )
}

// ─── Coming soon ──────────────────────────────────────────────────────────────

function ComingSoon({ name, detail }) {
  return (
    <div className="sv-soon">
      <div className="sv-soon__icon">🔧</div>
      <p className="sv-soon__name">{name}</p>
      <p className="sv-soon__text">Próximamente</p>
      {detail && <p className="sv-soon__detail">{detail}</p>}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SupervisionPage() {
  const role          = window.blokesSiteData?.userRole
  const canAccess     = ['gestion', 'socio'].includes(role)

  const TABS = [
    { id: 'excelmuerte', label: 'ExcelMuerte'   },
    { id: 'ctrltests',   label: 'Tests'          },
    { id: 'ctrlfichaje', label: 'CTRL Fichaje'  },
    { id: 'timeoff',     label: 'CTRL Time Off' },
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
      {tab === 'ctrltests'   && <CtrlTestsTab />}
      {tab === 'ctrlfichaje' && <ComingSoon name="CTRL Fichaje" detail="Control de fichajes, horas y seguimiento mensual del equipo" />}
      {tab === 'timeoff'     && <ComingSoon name="Time Off"    detail="Gestión de vacaciones y ausencias" />}
    </div>
  )
}
