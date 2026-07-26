import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useRevenue, useProducts, useExpenses } from '../hooks/useSuperAdmin'
import ExpensesSection from '../components/ExpensesSection'
import './SuperAdminPage.css'

const PERIOD_OPTIONS = [
  { label: '6 meses',  value: 6  },
  { label: '12 meses', value: 12 },
  { label: '24 meses', value: 24 },
]

const STORE_COLORS = { store1: '#f5c842', store2: '#60a5fa', total: '#34d399' }
const STORE_LABELS = { store1: 'Rocoteca', store2: 'Club', total: 'Total' }

function fmtEur(v) { return `${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €` }
function fmtMonth(m) {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1).toLocaleString('es-ES', { month: 'short', year: '2-digit' })
}

function SectionTitle({ children }) {
  return <h2 className="sa-section-title">{children}</h2>
}

function PeriodSelector({ value, onChange }) {
  return (
    <div className="sa-period">
      {PERIOD_OPTIONS.map(o => (
        <button
          key={o.value}
          className={`sa-period__btn${value === o.value ? ' sa-period__btn--active' : ''}`}
          onClick={() => onChange(o.value)}
        >{o.label}</button>
      ))}
    </div>
  )
}

function LoadingBlock() { return <div className="sa-loading">Cargando…</div> }
function ErrorBlock({ msg }) { return <div className="sa-error">Error: {msg}</div> }

const IVA_COLOR = '#f97316'

function quarterLabel() {
  const m = new Date().getMonth() + 1
  return `Q${Math.ceil(m / 3)} ${new Date().getFullYear()}`
}
function currentQuarterMonths() {
  const now = new Date()
  const y   = now.getFullYear()
  const q   = Math.ceil((now.getMonth() + 1) / 3)
  const s   = (q - 1) * 3 + 1
  return [0, 1, 2].map(i => `${y}-${String(s + i).padStart(2, '0')}`)
}

// ─── Revenue section ────────────────────────────────────────────────
function RevenueSection({ excludeTransfer, onToggleExclude }) {
  const [months, setMonths]      = useState(12)
  const { data, loading, error } = useRevenue(months, excludeTransfer)

  const totals = useMemo(() => {
    if (!data) return {}
    return {
      store1:     data.reduce((s, r) => s + (r.store1     || 0), 0),
      store2:     data.reduce((s, r) => s + (r.store2     || 0), 0),
      total:      data.reduce((s, r) => s + (r.total      || 0), 0),
      store1_tax: data.reduce((s, r) => s + (r.store1_tax || 0), 0),
    }
  }, [data])

  const quarterIva = useMemo(() => {
    if (!data) return 0
    const qm = currentQuarterMonths()
    return data.filter(r => qm.includes(r.month)).reduce((s, r) => s + (r.store1_tax || 0), 0)
  }, [data])

  const chartData = useMemo(() =>
    (data || []).map(r => ({ ...r, month: fmtMonth(r.month) }))
  , [data])

  const ivaData = useMemo(() =>
    (data || []).map(r => ({ month: fmtMonth(r.month), iva: r.store1_tax || 0 }))
  , [data])

  return (
    <section className="sa-section">
      <div className="sa-section__header">
        <SectionTitle>Ingresos</SectionTitle>
        <div className="sa-header-controls">
          <button
            className={`sa-transfer-toggle${excludeTransfer ? ' sa-transfer-toggle--on' : ''}`}
            onClick={onToggleExclude}
            title="Factura de Uso de Rocódromo (transferencia inter-empresa club → rocoteca)"
          >
            {excludeTransfer ? 'Sin uso Rocódromo' : 'Con uso Rocódromo'}
          </button>
          <PeriodSelector value={months} onChange={setMonths} />
        </div>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}

      {!loading && !error && data && (
        <>
          <div className="sa-kpis">
            {[
              { key: 'store1', label: excludeTransfer ? 'Principal (sin Rocódromo)' : 'Tienda Principal' },
              { key: 'store2', label: 'Tienda Club' },
              { key: 'total',  label: 'Total combinado' },
            ].map(({ key, label }) => (
              <div key={key} className="sa-kpi" style={{ '--kpi-color': STORE_COLORS[key] }}>
                <span className="sa-kpi__value">{fmtEur(totals[key] || 0)}</span>
                <span className="sa-kpi__label">{label}</span>
              </div>
            ))}
            <div className="sa-kpi" style={{ '--kpi-color': IVA_COLOR }}>
              <span className="sa-kpi__value">{fmtEur(quarterIva)}</span>
              <span className="sa-kpi__label">IVA {quarterLabel()}</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {Object.entries(STORE_COLORS).map(([k, c]) => (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={c} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={c} stopOpacity={0}    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
              <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}€`} tick={{ fill: '#888', fontSize: 11 }} width={56} />
              <Tooltip
                contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                labelStyle={{ color: '#f5c842' }}
                formatter={(v, name) => [fmtEur(v), STORE_LABELS[name] || name]}
              />
              <Legend formatter={k => STORE_LABELS[k] || k} />
              <Area type="monotone" dataKey="store1" stroke={STORE_COLORS.store1} fill={`url(#grad-store1)`} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="store2" stroke={STORE_COLORS.store2} fill={`url(#grad-store2)`} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="total"  stroke={STORE_COLORS.total}  fill={`url(#grad-total)`}  strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>

          <div className="sa-iva-block">
            <p className="sa-iva-title">IVA mensual · Tienda Principal</p>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={ivaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
                <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
                <YAxis tickFormatter={v => `${v}€`} tick={{ fill: '#888', fontSize: 10 }} width={48} />
                <Tooltip
                  contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                  labelStyle={{ color: IVA_COLOR }}
                  formatter={v => [fmtEur(v), 'IVA']}
                />
                <Bar dataKey="iva" fill={IVA_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}

// Strip accents for matching (mirrors PHP iconv approach)
function normName(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
const isRocodromo = name => normName(name).includes('rocodromo')

// ─── Products section ────────────────────────────────────────────────
function ProductsSection({ excludeTransfer }) {
  const [months, setMonths]       = useState(12)
  const [storeFilter, setStore]   = useState('Todas')
  const [selected, setSelected]   = useState(null)
  const { data, loading, error }  = useProducts(months)

  const stores = useMemo(() => {
    if (!data) return ['Todas']
    return ['Todas', ...new Set(data.map(p => p.store))]
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    let d = storeFilter === 'Todas' ? data : data.filter(p => p.store === storeFilter)
    if (excludeTransfer) d = d.filter(p => !isRocodromo(p.name))
    return d
  }, [data, storeFilter, excludeTransfer])

  const top10 = filtered.slice(0, 10)

  const histData = useMemo(() => {
    if (!selected) return []
    return selected.history.map(h => ({ ...h, month: fmtMonth(h.month) }))
  }, [selected])

  return (
    <section className="sa-section">
      <div className="sa-section__header">
        <SectionTitle>Productos y suscripciones</SectionTitle>
        <PeriodSelector value={months} onChange={setMonths} />
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}

      {!loading && !error && data && (
        <>
          <div className="sa-filters">
            {stores.map(s => (
              <button
                key={s}
                className={`sa-filter-btn${storeFilter === s ? ' sa-filter-btn--active' : ''}`}
                onClick={() => { setStore(s); setSelected(null) }}
              >{s}</button>
            ))}
          </div>

          <div className="sa-products-layout">
            <div className="sa-products-list">
              {top10.map((p, i) => {
                const maxRev = top10[0]?.revenue || 1
                return (
                  <button
                    key={i}
                    className={`sa-product-row${selected === p ? ' sa-product-row--active' : ''}`}
                    onClick={() => setSelected(selected === p ? null : p)}
                  >
                    <span className="sa-product-row__pos">#{i + 1}</span>
                    <span className="sa-product-row__name">{p.name}</span>
                    <span className="sa-product-row__store">{p.store}</span>
                    <div className="sa-product-row__bar-wrap">
                      <div className="sa-product-row__bar" style={{ width: `${(p.revenue / maxRev) * 100}%` }} />
                    </div>
                    <span className="sa-product-row__rev">{fmtEur(p.revenue)}</span>
                  </button>
                )
              })}
            </div>

            {selected && histData.length > 0 && (
              <div className="sa-product-detail">
                <p className="sa-product-detail__title">{selected.name} — histórico</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={histData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
                    <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
                    <YAxis tickFormatter={v => `${v}€`} tick={{ fill: '#888', fontSize: 10 }} width={48} />
                    <Tooltip
                      contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                      labelStyle={{ color: '#f5c842' }}
                      formatter={(v, name) => [name === 'revenue' ? fmtEur(v) : v, name === 'revenue' ? 'Ingresos' : 'Uds.']}
                    />
                    <Bar dataKey="revenue" fill="#f5c842" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="units"   fill="#60a5fa" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ClassesSection moved to SupervisionPage
function ClassesSection_UNUSED() {
  const [months, setMonths]       = useState(12)
  const [selected, setSelected]   = useState(null)
  const [viewMode, setViewMode]   = useState('inscritos') // 'inscritos' | 'ingresos'
  const data = null; const loading = false; const error = null; void months

  const top12 = (data || []).slice(0, 12)
  // Revenue mode active only when PHP returns revenue field
  const hasRevenue   = top12.some(c => c.revenue != null)
  const maxActive    = top12[0]?.active || 1
  const maxRevenue   = Math.max(...top12.map(c => c.revenue || 0), 1)
  const totalRevenue = top12.reduce((s, c) => s + (c.revenue || 0), 0)

  const mode = hasRevenue ? viewMode : 'inscritos'

  const histData = useMemo(() => {
    if (!selected || !selected.history?.length) return []
    return selected.history.map(h => ({ ...h, month: fmtMonth(h.month) }))
  }, [selected])

  const chartRows = top12.map(c => ({
    name:    c.label,
    activos: c.active,
    total:   c.all,
    ...(hasRevenue && { revenue: c.revenue || 0 }),
  }))

  return (
    <section className="sa-section">
      <div className="sa-section__header">
        <SectionTitle>Clases</SectionTitle>
        <div className="sa-header-controls">
          {hasRevenue && (
            <div className="sa-period">
              <button
                className={`sa-period__btn${mode === 'inscritos' ? ' sa-period__btn--active' : ''}`}
                onClick={() => setViewMode('inscritos')}
              >Inscritos</button>
              <button
                className={`sa-period__btn${mode === 'ingresos' ? ' sa-period__btn--active' : ''}`}
                onClick={() => setViewMode('ingresos')}
              >Ingresos</button>
            </div>
          )}
          <PeriodSelector value={months} onChange={setMonths} />
        </div>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}

      {!loading && !error && data && (
        <>
          {hasRevenue && (
            <div className="sa-kpis">
              <div className="sa-kpi" style={{ '--kpi-color': '#34d399' }}>
                <span className="sa-kpi__value">{fmtEur(totalRevenue)}</span>
                <span className="sa-kpi__label">Ingresos WC clases ({months}m)</span>
              </div>
              <div className="sa-kpi" style={{ '--kpi-color': '#888' }}>
                <span className="sa-kpi__value">—</span>
                <span className="sa-kpi__label">Ing. banco clases (pendiente PHP /expenses income_tpv)</span>
              </div>
            </div>
          )}

          <div className="sa-class-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#888', fontSize: 10 }}
                  tickFormatter={mode === 'ingresos' ? v => `${v}€` : undefined}
                />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#ccc', fontSize: 10 }} />
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

          <div className="sa-class-list">
            {top12.map((c, i) => {
              const pct = mode === 'ingresos'
                ? ((c.revenue || 0) / maxRevenue) * 100
                : (c.active / maxActive) * 100
              return (
                <button
                  key={i}
                  className={`sa-class-row${selected === c ? ' sa-class-row--active' : ''}`}
                  onClick={() => setSelected(selected === c ? null : c)}
                >
                  <span className="sa-class-row__pos">#{i + 1}</span>
                  <span className="sa-class-row__label">{c.label}</span>
                  <div className="sa-class-row__bar-wrap">
                    <div className="sa-class-row__bar" style={{ width: `${pct}%` }} />
                  </div>
                  {mode === 'ingresos'
                    ? <span className="sa-class-row__rev">{fmtEur(c.revenue || 0)}</span>
                    : <span className="sa-class-row__count">{c.active} activos</span>
                  }
                </button>
              )
            })}
          </div>

          {selected && histData.length > 0 && (
            <div className="sa-class-detail">
              <p className="sa-product-detail__title">{selected.label} — histórico</p>
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

          {!hasRevenue && (
            <p className="sa-pending-note">
              Para ver ingresos por clase, el PHP necesita devolver <code>revenue</code> en <code>/classes</code> e <code>income_tpv</code> en <code>/expenses</code>.
            </p>
          )}
        </>
      )}
    </section>
  )
}

// ─── P&L comparativo tab ─────────────────────────────────────────────────────
const PL_MONTHS_ABB  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PL_MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const PL_METRICS_LIST = [
  { key: 'ventas',    label: 'Ventas sin IVA' },
  { key: 'costes',    label: 'Costes Fijos'   },
  { key: 'resultado', label: 'Resultado'      },
  { key: 'con_iva',   label: 'Con IVA (caja)' },
]

const PL_DATA = {
  ventas: {
    2024: [8872,14244,10520,11527,12439,10521,8832,2076,8867,13391,12919,7305],
    2025: [11596,10612,11236,11799,10996,9585,7022,2533,9687,12823,10685,9973],
  },
  costes: {
    2024: [-9340,-10999,-11193,-12198,-10617,-10138,-9977,-9266,-9784,-10289,-11388,-11242],
    2025: [-11332,-12025,-12076,-12280,-11791,-6138,-16048,-9195,-9566,-11802,-11322,-10082],
  },
  resultado: {
    2024: [1047,4678,1152,1312,3326,1945,533,-5065,781,4436,3183,-1802],
    2025: [2025,612,1614,1524,2358,4525,null,null,null,null,null,null],
  },
  con_iva: {
    2024: [-467,3245,-673,-671,1822,384,-1144,-7189,-917,3102,1531,-3937],
    2025: [264,-1413,-839,-481,-795,3446,-9026,-6662,121,1021,-637,-109],
  },
}

const PL_YEAR_COLORS = { 2024: '#f5c842', 2025: '#60a5fa', 2026: '#34d399' }

const PL_VENTAS_IVA = {
  2024: [10735, 17235, 12729, 13948, 15051, 12731, 10687, 2512, 10729, 16204, 15632, 8839],
  2025: [14032, 12841, 13596, 14277, 13305, 11598, 8496, 3065, 11721, 15515, 12929, 12067],
}

function fmtPLVal(v) {
  if (v == null) return '—'
  return `${v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('es-ES')}€`
}

function PLTab() {
  const { data: expData, loading } = useExpenses(30, 'all', true)
  const [metric, setMetric] = useState('ventas')
  const [view,   setView  ] = useState('comparativa')
  const [showIva, setShowIva] = useState(false)

  const live2026 = useMemo(() => {
    if (!expData) return {}
    const acc = {}
    expData.forEach(r => {
      const [y, m] = r.month.split('-').map(Number)
      if (y !== 2026) return
      if (!acc[m]) acc[m] = { ingresos: 0, costes: 0, iva_r: 0, iva_s: 0 }
      acc[m].ingresos += Math.abs(r.total_ingresos  || 0)
      acc[m].costes   += Math.abs(r.total_costes    || 0)
      acc[m].iva_r    += Math.abs(r.iva_repercutido || 0)
      acc[m].iva_s    += Math.abs(r.iva_soportado   || 0)
    })
    // Quarterly IVA payment months: Q1(Jan-Mar)→Apr, Q2→Jul, Q3→Oct
    const ivaPayments = {}
    for (let m = 1; m <= 12; m++) {
      if (!acc[m]) continue
      const payM = Math.ceil(m / 3) * 3 + 1
      if (payM <= 12) ivaPayments[payM] = (ivaPayments[payM] || 0) + (acc[m].iva_r - acc[m].iva_s)
    }
    const res = {}
    for (let m = 1; m <= 12; m++) {
      if (!acc[m]) continue
      const d = acc[m], resultado = d.ingresos - d.costes
      res[m] = { ventas: d.ingresos, costes: -d.costes, resultado, con_iva: resultado - (ivaPayments[m] || 0) }
    }
    return res
  }, [expData])

  const lastMonth = useMemo(() => {
    for (let m = 12; m >= 1; m--) if (live2026[m]) return m
    return 12
  }, [live2026])

  // Comparativa: Jan-Dec on X, one line per year
  const comparativaData = useMemo(() =>
    PL_MONTHS_ABB.map((month, i) => ({
      month,
      y2024:   PL_DATA[metric][2024][i],
      y2025:   PL_DATA[metric][2025][i],
      y2026:   live2026[i + 1]?.[metric] ?? null,
      iva2024: PL_VENTAS_IVA[2024][i],
      iva2025: PL_VENTAS_IVA[2025][i],
    }))
  , [metric, live2026])

  // Histórico: chronological months
  const historicoData = useMemo(() => {
    const rows = []
    PL_DATA[metric][2024].forEach((v, i) =>
      rows.push({ label: `${PL_MONTHS_ABB[i]} 24`, y2024: v, y2025: null, y2026: null }))
    PL_DATA[metric][2025].forEach((v, i) => {
      if (v != null) rows.push({ label: `${PL_MONTHS_ABB[i]} 25`, y2024: null, y2025: v, y2026: null })
    })
    for (let m = 1; m <= 12; m++) {
      if (live2026[m]) rows.push({ label: `${PL_MONTHS_ABB[m - 1]} 26`, y2024: null, y2025: null, y2026: live2026[m][metric] })
    }
    return rows
  }, [metric, live2026])

  const kpis = useMemo(() => {
    const calc = yr => {
      const vals = yr === 2026
        ? Object.values(live2026).map(d => d[metric])
        : PL_DATA[metric][yr]
      const f = vals.filter(v => v != null)
      return { total: f.reduce((a, b) => a + b, 0), n: f.length }
    }
    return { 2024: calc(2024), 2025: calc(2025), 2026: calc(2026) }
  }, [metric, live2026])

  const tickFmt = v => `${v < 0 ? '-' : ''}${(Math.abs(v) / 1000).toFixed(0)}k`

  const dotRender = yr => ({ cx, cy, value }) =>
    value != null ? <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={PL_YEAR_COLORS[yr]} /> : null

  const chartTooltip = {
    contentStyle: { background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 },
    labelStyle:   { color: '#f5c842' },
    formatter:    (v, name) => name.startsWith('iva')
      ? [fmtPLVal(v), `con IVA ${name.replace('iva', '')}`]
      : [fmtPLVal(v), name.replace('y', '')],
  }

  return (
    <section className="sa-section">
      <div className="sa-pl-tabs">
        {PL_METRICS_LIST.map(m => (
          <button key={m.key} className={`sa-pl-tab${metric === m.key ? ' sa-pl-tab--active' : ''}`} onClick={() => setMetric(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['comparativa', 'Por mes'], ['historico', 'Histórico']].map(([k, l]) => (
          <button key={k} className={`sa-period__btn${view === k ? ' sa-period__btn--active' : ''}`} onClick={() => setView(k)}>{l}</button>
        ))}
        {view === 'comparativa' && (
          <button
            className={`sa-period__btn${showIva ? ' sa-period__btn--active' : ''}`}
            onClick={() => setShowIva(x => !x)}
            title="Ingresos históricos con IVA para ver la diferencia de tener el Club"
            style={{ marginLeft: 8, borderStyle: showIva ? 'solid' : 'dashed' }}
          >
            + IVA 2024 y 2025
          </button>
        )}
      </div>

      <div className="sa-kpis">
        {[2024, 2025, 2026].map(yr => (
          <div key={yr} className="sa-kpi" style={{ '--kpi-color': PL_YEAR_COLORS[yr] }}>
            <span className="sa-kpi__value">{fmtPLVal(kpis[yr].total)}</span>
            <span className="sa-kpi__label">{yr}{kpis[yr].n < 12 ? ` (${kpis[yr].n} m)` : ''}{yr === 2026 ? ' · banco' : ''}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {[2024, 2025, 2026].map(y => (
          <span key={y} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#aaa', fontWeight: 600 }}>
            <span style={{ width: 20, height: 3, background: PL_YEAR_COLORS[y], borderRadius: 2, display: 'inline-block' }} />
            {y}{y === 2026 ? ' (banco)' : ''}
          </span>
        ))}
        {showIva && view === 'comparativa' && [2024, 2025].map(y => (
          <span key={`iva${y}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#aaa', fontWeight: 600 }}>
            <span style={{ width: 20, height: 0, borderTop: `2px dashed ${PL_YEAR_COLORS[y]}`, display: 'inline-block' }} />
            {y} con IVA
          </span>
        ))}
      </div>

      {loading ? <LoadingBlock /> : view === 'comparativa' ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={comparativaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
            <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 11 }} />
            <YAxis tickFormatter={tickFmt} tick={{ fill: '#888', fontSize: 11 }} width={44} />
            <Tooltip {...chartTooltip} />
            {[2024, 2025, 2026].map(yr => (
              <Line key={yr} type="monotone" dataKey={`y${yr}`} stroke={PL_YEAR_COLORS[yr]} strokeWidth={2}
                dot={dotRender(yr)} connectNulls={false} />
            ))}
            {showIva && [2024, 2025].map(yr => (
              <Line key={`iva${yr}`} type="monotone" dataKey={`iva${yr}`} stroke={PL_YEAR_COLORS[yr]}
                strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={historicoData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
            <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 10 }} interval={2} />
            <YAxis tickFormatter={tickFmt} tick={{ fill: '#888', fontSize: 11 }} width={44} />
            <Tooltip {...chartTooltip} />
            {[2024, 2025, 2026].map(yr => (
              <Line key={yr} type="monotone" dataKey={`y${yr}`} stroke={PL_YEAR_COLORS[yr]} strokeWidth={2}
                dot={dotRender(yr)} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <PLAccordion live2026={live2026} lastMonth={lastMonth} />
    </section>
  )
}

function PLAccordion({ live2026, lastMonth }) {
  const [open, setOpen] = useState(new Set())

  useEffect(() => {
    setOpen(prev => new Set([...prev, lastMonth]))
  }, [lastMonth])

  const toggle = m => setOpen(prev => {
    const next = new Set(prev)
    next.has(m) ? next.delete(m) : next.add(m)
    return next
  })

  return (
    <div>
      <p className="sa-pl-acc-title">Detalle mensual · 2024 – 2026</p>
      {Array.from({ length: 12 }, (_, i) => 12 - i).map(m => {
        const isOpen = open.has(m)
        const v26 = live2026[m]
        const v25ventas = PL_DATA.ventas[2025][m - 1]
        return (
          <div key={m} className="sa-pl-acc-item">
            <button className={`sa-pl-acc-header${isOpen ? ' sa-pl-acc-header--open' : ''}`} onClick={() => toggle(m)}>
              <div className="sa-pl-acc-header__left">
                <span className="sa-pl-acc-header__month">{PL_MONTHS_FULL[m - 1]}</span>
                <div className="sa-pl-acc-pills">
                  {v25ventas != null && (
                    <span className="sa-pl-pill sa-pl-pill--25">2025: {Math.abs(v25ventas).toLocaleString('es-ES')}€</span>
                  )}
                  {v26?.ventas != null && (
                    <span className="sa-pl-pill sa-pl-pill--26">2026: {Math.abs(v26.ventas).toLocaleString('es-ES')}€ banco</span>
                  )}
                </div>
              </div>
              <span className={`sa-pl-acc-chevron${isOpen ? ' sa-pl-acc-chevron--open' : ''}`}>▼</span>
            </button>
            {isOpen && (
              <div className="sa-pl-acc-body">
                <table className="sa-pl-table">
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      <th style={{ color: PL_YEAR_COLORS[2024] }}>2024</th>
                      <th style={{ color: PL_YEAR_COLORS[2025] }}>2025</th>
                      <th style={{ color: PL_YEAR_COLORS[2026] }}>2026 banco</th>
                      <th>Var. 25/24</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PL_METRICS_LIST.map(({ key, label }) => {
                      const v24 = PL_DATA[key][2024][m - 1]
                      const v25 = PL_DATA[key][2025][m - 1]
                      const v2026 = v26?.[key] ?? null
                      const delta = v24 != null && v25 != null && v24 !== 0
                        ? (v25 - v24) / Math.abs(v24) * 100 : null
                      return (
                        <tr key={key}>
                          <td className="sa-pl-table__metric">{label}</td>
                          <td className="sa-pl-table__val">{v24 != null ? Math.abs(v24).toLocaleString('es-ES') + '€' : '—'}</td>
                          <td className="sa-pl-table__val">{v25 != null ? Math.abs(v25).toLocaleString('es-ES') + '€' : '—'}</td>
                          <td className="sa-pl-table__val sa-pl-table__val--26">{v2026 != null ? Math.abs(v2026).toLocaleString('es-ES') + '€' : '—'}</td>
                          <td className={`sa-pl-table__delta${delta == null ? '' : delta >= 0 ? ' sa-pl-table__delta--pos' : ' sa-pl-table__delta--neg'}`}>
                            {delta != null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const role = window.blokesSiteData?.userRole
  const [saTab, setSaTab]               = useState('ingresos')
  const [excludeTransfer, setExclude]   = useState(false)

  if (role !== 'socio') {
    return (
      <div className="sa-forbidden">
        <span className="sa-forbidden__icon">🔒</span>
        <p>Acceso restringido a socios.</p>
      </div>
    )
  }

  const TABS = [
    { key: 'ingresos', label: 'Ingresos' },
    { key: 'gastos',   label: 'Gastos banco' },
    { key: 'pl',       label: 'P&L' },
    { key: 'acceso',   label: 'Acceso' },
  ]

  return (
    <div className="sa-page">
      <h1 className="sa-page__title">Superadmin</h1>
      <div className="sa-main-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`sa-main-tab${saTab === t.key ? ' sa-main-tab--active' : ''}`} onClick={() => setSaTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {saTab === 'ingresos' && (
        <>
          <RevenueSection excludeTransfer={excludeTransfer} onToggleExclude={() => setExclude(x => !x)} />
          <ProductsSection excludeTransfer={excludeTransfer} />
        </>
      )}
      {saTab === 'gastos'   && <ExpensesSection />}
      {saTab === 'pl'       && <PLTab />}
      {saTab === 'acceso'   && <ListasSection />}
    </div>
  )
}

// ─── Listas de acceso ─────────────────────────────────────────────────────────
const LISTA_CONFIG = [
  { key: 'socios',     label: 'Socios',     color: '#a78bfa', acceso: 'Todo + Superadmin' },
  { key: 'gestion',    label: 'Gestión',    color: '#34d399', acceso: 'Todo de profesores + ExcelMuerte (Supervisión)' },
  { key: 'profesores', label: 'Profesores', color: '#f5c842', acceso: 'Setter · Estadísticas · Entrenamientos · Fichaje · TimeOff' },
]

const WP_URL = window.location.origin

function ListasSection() {
  const initial = window.blokesSiteData?.emailLists
  if (!initial) return null

  const [state, setState] = useState(() =>
    Object.fromEntries(LISTA_CONFIG.map(({ key }) => [key, {
      emails: initial[key] || [],
      input:  '',
      saving: false,
      saved:  false,
      error:  null,
    }]))
  )

  const nonce = window.blokesSiteData?.nonce || ''

  const patch = (key, changes) =>
    setState(s => ({ ...s, [key]: { ...s[key], ...changes } }))

  const addEmail = (key) => {
    const email = state[key].input.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    if (state[key].emails.includes(email)) { patch(key, { input: '' }); return }
    patch(key, { emails: [...state[key].emails, email], input: '' })
  }

  const removeEmail = (key, email) =>
    patch(key, { emails: state[key].emails.filter(e => e !== email) })

  const saveList = async (key) => {
    patch(key, { saving: true, saved: false, error: null })
    try {
      const res = await fetch(`${WP_URL}/wp-json/blokes/v1/admin/email-lists`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
        body: JSON.stringify({ [key]: state[key].emails }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      patch(key, { saving: false, saved: true })
      setTimeout(() => patch(key, { saved: false }), 3000)
    } catch (e) {
      patch(key, { saving: false, error: e.message })
    }
  }

  return (
    <section className="sa-section sa-section--no-pad">
      <details className="sa-collapsible">
        <summary className="sa-collapsible__summary">
          <span className="sa-collapsible__title">Listas de acceso</span>
          <span className="sa-collapsible__arrow" aria-hidden="true" />
        </summary>
        <div className="sa-collapsible__body">
          <p className="sa-lists-note">Acceso basado en email — el rol de WordPress no influye.</p>
          <div className="sa-lists">
            {LISTA_CONFIG.map(({ key, label, color, acceso }) => {
              const s = state[key]
              return (
                <div key={key} className="sa-list-group" style={{ '--list-color': color }}>
                  <div className="sa-list-group__header">
                    <span className="sa-list-group__name">{label}</span>
                    <span className="sa-list-group__acceso">{acceso}</span>
                  </div>
                  <div className="sa-list-group__emails">
                    {s.emails.map(email => (
                      <span key={email} className="sa-list-email">
                        {email}
                        <button className="sa-list-email__remove" onClick={() => removeEmail(key, email)} aria-label="Quitar">×</button>
                      </span>
                    ))}
                    {s.emails.length === 0 && <span className="sa-list-empty">Sin emails configurados</span>}
                  </div>
                  <div className="sa-list-add">
                    <input
                      type="email"
                      className="sa-list-add__input"
                      placeholder="nuevo@email.com"
                      value={s.input}
                      onChange={e => patch(key, { input: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && addEmail(key)}
                    />
                    <button className="sa-list-add__btn" onClick={() => addEmail(key)}>+</button>
                    <button
                      className={`sa-list-save__btn${s.saved ? ' sa-list-save__btn--saved' : ''}`}
                      onClick={() => saveList(key)}
                      disabled={s.saving}
                    >
                      {s.saving ? '…' : s.saved ? 'Guardado ✓' : 'Guardar'}
                    </button>
                    {s.error && <span className="sa-list-error">{s.error}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </details>
    </section>
  )
}
