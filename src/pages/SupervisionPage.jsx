import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useClasses } from '../hooks/useSuperAdmin'
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
                  {row.map((n, i) => (
                    <td key={i} className={`sv-td ${occupancyClass(n)}`}>
                      <span className="sv-cell-num">{n > 0 ? n : '—'}</span>
                    </td>
                  ))}
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

function MonthlyBarChart({ data, bars, height = 160 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
        <XAxis dataKey="month" tick={CHART_STYLE.tick} />
        <YAxis allowDecimals={false} tick={CHART_STYLE.tick} width={28} />
        <Tooltip contentStyle={CHART_STYLE.tooltip} labelStyle={CHART_STYLE.label}
          formatter={(v, name) => [v, bars.find(b => b.key === name)?.label || name]} />
        {bars.length > 1 && <Legend formatter={name => bars.find(b => b.key === name)?.label || name} />}
        {bars.map(b => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  )
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
    return histByMonth([selectedClass], mRange)
  }, [selectedClass, mRange])

  const matData = useMemo(() => {
    const mAcc = {}, tAcc = {}
    mRange.forEach(m => { mAcc[m] = 0; tAcc[m] = 0 })
    data.forEach(c => {
      const start = (c.horario || '').split('-')[0].trim()
      const isMorn = isMañana(start)
      ;(c.history || []).forEach(h => {
        if (mAcc[h.month] !== undefined) {
          if (isMorn) mAcc[h.month] += h.new || 0
          else        tAcc[h.month] += h.new || 0
        }
      })
    })
    return mRange.map(m => ({ month: fmtMonth(m), mañana: mAcc[m], tarde: tAcc[m] }))
  }, [data, mRange])

  const kids  = useMemo(() => data.filter(c => c.edad && c.edad.toLowerCase() !== 'adultos'), [data])
  const kidsData  = useMemo(() => histByMonth(kids,  mRange), [kids,  mRange])
  const totalData = useMemo(() => histByMonth(data,  mRange), [data,  mRange])

  return (
    <>
      <section className="sv-section">
        <h2 className="sv-section-title">Evolución por clase</h2>
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
          bars={[{ key: 'nuevos', label: 'Nuevas inscripciones', color: '#f5c842' }]}
        />
      </section>

      <section className="sv-section">
        <h2 className="sv-section-title">Mañanas vs Tardes</h2>
        <MonthlyBarChart
          data={matData}
          bars={[
            { key: 'mañana', label: 'Mañana', color: '#f5c842' },
            { key: 'tarde',  label: 'Tarde',  color: '#60a5fa' },
          ]}
        />
      </section>

      {kids.length > 0 && (
        <section className="sv-section">
          <h2 className="sv-section-title">Niños</h2>
          <MonthlyBarChart
            data={kidsData}
            bars={[{ key: 'nuevos', label: 'Nuevas inscripciones', color: '#34d399' }]}
          />
        </section>
      )}

      <section className="sv-section">
        <h2 className="sv-section-title">Total usuarios</h2>
        <MonthlyBarChart
          data={totalData}
          bars={[{ key: 'nuevos', label: 'Nuevas inscripciones', color: '#34d399' }]}
        />
      </section>
    </>
  )
}

// ─── Clases tab ───────────────────────────────────────────────────────────────
function ClasesTab() {
  const [months, setMonths]           = useState(12)
  const [filter, setFilter]           = useState('todos')
  const [selected, setSelected]       = useState(null)
  const [viewMode, setViewMode]       = useState('inscritos')
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
  const maxActive  = top12[0]?.active || 1
  const maxRevenue = Math.max(...top12.map(c => c.revenue || 0), 1)
  const totalRevenue = top12.reduce((s, c) => s + (c.revenue || 0), 0)
  const mode       = hasRevenue ? viewMode : 'inscritos'

  const histData = useMemo(() => {
    if (!selected?.history?.length) return []
    return selected.history.map(h => ({ ...h, month: fmtMonth(h.month) }))
  }, [selected])

  const chartRows = top12.map(c => ({
    name: c.label,
    activos: c.active,
    total: c.all,
    ...(hasRevenue && { revenue: c.revenue || 0 }),
  }))

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
              onClick={() => { setFilter(f.id); setSelected(null) }}
            >{f.label}</button>
          ))}
        </div>
        <div className="sv-controls-right">
          {hasRevenue && (
            <div className="sv-period">
              <button className={`sv-period__btn${mode === 'inscritos' ? ' sv-period__btn--active' : ''}`} onClick={() => setViewMode('inscritos')}>Inscritos</button>
              <button className={`sv-period__btn${mode === 'ingresos'  ? ' sv-period__btn--active' : ''}`} onClick={() => setViewMode('ingresos')}>Ingresos</button>
            </div>
          )}
          <PeriodSelector value={months} onChange={setMonths} />
        </div>
      </div>

      {loading && <div className="sv-loading">Cargando…</div>}
      {error   && <div className="sv-error">Error: {error}</div>}

      {!loading && !error && data && (
        <>
          <section className="sv-section">
            <h2 className="sv-section-title">Horario por día</h2>
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

          <section className="sv-section">
            <h2 className="sv-section-title">Clases</h2>

            <div className="sv-barchart">
              <ResponsiveContainer width="100%" height={Math.max(200, top12.length * 26)}>
                <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickFormatter={mode === 'ingresos' ? v => `${v}€` : undefined}
                  />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fill: '#ccc', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                    labelStyle={{ color: '#f5c842' }}
                    formatter={(v, name) => {
                      if (name === 'revenue') return [fmtEur(v), 'Ingresos WC']
                      if (name === 'activos') return [v, 'Activos']
                      return [v, 'Total histórico']
                    }}
                  />
                  <Legend formatter={k => k === 'revenue' ? 'Ingresos WC' : k === 'activos' ? 'Activos' : 'Histórico'} />
                  {mode === 'ingresos' ? (
                    <Bar dataKey="revenue" fill="#34d399" radius={[0, 3, 3, 0]} />
                  ) : (
                    <>
                      <Bar dataKey="total"   fill="#3a3020" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="activos" fill="#f5c842" radius={[0, 3, 3, 0]} />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="sv-class-list">
              {top12.map((c, i) => {
                const pct = mode === 'ingresos'
                  ? ((c.revenue || 0) / maxRevenue) * 100
                  : (c.active / maxActive) * 100
                return (
                  <button
                    key={i}
                    className={`sv-class-row${selected === c ? ' sv-class-row--active' : ''}`}
                    onClick={() => setSelected(selected === c ? null : c)}
                  >
                    <span className="sv-class-row__pos">#{i + 1}</span>
                    <span className="sv-class-row__label">{c.label}</span>
                    <div className="sv-class-row__bar-wrap">
                      <div className="sv-class-row__bar" style={{ width: `${pct}%` }} />
                    </div>
                    {mode === 'ingresos'
                      ? <span className="sv-class-row__rev">{fmtEur(c.revenue || 0)}</span>
                      : <span className="sv-class-row__count">{c.active} activos</span>
                    }
                  </button>
                )
              })}
            </div>

            {selected && histData.length > 0 && (
              <div className="sv-class-detail">
                <p className="sv-class-detail__title">{selected.label} — histórico</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={histData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
                    <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#888', fontSize: 10 }} width={28} />
                    <Tooltip
                      contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                      labelStyle={{ color: '#f5c842' }}
                      formatter={(v, name) => [
                        name === 'revenue' ? fmtEur(v) : v,
                        name === 'revenue' ? 'Ingresos WC' : 'Nuevas inscripciones'
                      ]}
                    />
                    <Bar dataKey="new" fill="#34d399" radius={[3, 3, 0, 0]} />
                    {histData[0]?.revenue != null && (
                      <Bar dataKey="revenue" fill="#f5c842" radius={[3, 3, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <TrendCharts data={data} months={months} selectedKey={selectedClassKey} onSelectKey={setSelectedClassKey} />
        </>
      )}
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
    { id: 'excelmuerte', label: 'ExcelMuerte'  },
    { id: 'ctrlfichaje', label: 'CTRL Fichaje' },
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
      {tab === 'ctrlfichaje' && <ComingSoon name="CTRL Fichaje" detail="Control de fichajes, horas y seguimiento mensual del equipo" />}
      {tab === 'timeoff'     && <ComingSoon name="Time Off"    detail="Gestión de vacaciones y ausencias" />}
    </div>
  )
}
