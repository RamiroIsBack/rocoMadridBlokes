import { useState, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useRevenue, useProducts } from '../hooks/useSuperAdmin'
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

// ─── Main page ───────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const role = window.blokesSiteData?.userRole

  if (role !== 'socio') {
    return (
      <div className="sa-forbidden">
        <span className="sa-forbidden__icon">🔒</span>
        <p>Acceso restringido a socios.</p>
      </div>
    )
  }

  const [excludeTransfer, setExclude] = useState(false)

  return (
    <div className="sa-page">
      <h1 className="sa-page__title">Superadmin</h1>
      <RevenueSection excludeTransfer={excludeTransfer} onToggleExclude={() => setExclude(x => !x)} />
      <ProductsSection excludeTransfer={excludeTransfer} />
      <ExpensesSection />
      <ListasSection />
    </div>
  )
}

// ─── Listas de acceso ─────────────────────────────────────────────────────────
const LISTA_CONFIG = [
  {
    key:   'socios',
    label: 'Socios',
    color: '#a78bfa',
    acceso: 'Todo + Superadmin',
  },
  {
    key:   'gestion',
    label: 'Gestión',
    color: '#34d399',
    acceso: 'Todo de profesores + ExcelMuerte (Supervisión)',
  },
  {
    key:   'profesores',
    label: 'Profesores',
    color: '#f5c842',
    acceso: 'Setter · Estadísticas · Entrenamientos · Fichaje · TimeOff',
  },
]

function ListasSection() {
  const lists = window.blokesSiteData?.emailLists
  if (!lists) return null

  return (
    <section className="sa-section">
      <SectionTitle>Listas de acceso</SectionTitle>
      <p className="sa-lists-note">
        Acceso basado en email — el rol de WordPress no influye.
      </p>
      <div className="sa-lists">
        {LISTA_CONFIG.map(({ key, label, color, acceso }) => (
          <div key={key} className="sa-list-group" style={{ '--list-color': color }}>
            <div className="sa-list-group__header">
              <span className="sa-list-group__name">{label}</span>
              <span className="sa-list-group__acceso">{acceso}</span>
            </div>
            <div className="sa-list-group__emails">
              {(lists[key] || []).map((email, i) => (
                <span key={i} className="sa-list-email">{email}</span>
              ))}
              {(!lists[key] || lists[key].length === 0) && (
                <span className="sa-list-empty">Sin emails configurados</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
