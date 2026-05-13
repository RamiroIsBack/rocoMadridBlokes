import { useState, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useRevenue, useProducts, useClasses } from '../hooks/useSuperAdmin'
import ExpensesSection from '../components/ExpensesSection'
import './SuperAdminPage.css'

const PERIOD_OPTIONS = [
  { label: '6 meses',  value: 6  },
  { label: '12 meses', value: 12 },
  { label: '24 meses', value: 24 },
]

const STORE_COLORS = { store1: '#f5c842', store2: '#60a5fa', total: '#34d399' }
const STORE_LABELS = { store1: 'Principal', store2: 'Club', total: 'Total' }

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
function RevenueSection() {
  const [months, setMonths]               = useState(12)
  const [excludeTransfer, setExclude]     = useState(false)
  const { data, loading, error }          = useRevenue(months, excludeTransfer)

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
            onClick={() => setExclude(x => !x)}
            title="Factura de Uso de Rocódromo x 2 (club → rocoteca)"
          >
            {excludeTransfer ? 'Sin transferencia club' : 'Con transferencia club'}
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
              { key: 'store1', label: excludeTransfer ? 'Principal (sin transf.)' : 'Tienda Principal' },
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

// ─── Products section ────────────────────────────────────────────────
function ProductsSection() {
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
    return storeFilter === 'Todas' ? data : data.filter(p => p.store === storeFilter)
  }, [data, storeFilter])

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

// ─── Classes section ────────────────────────────────────────────────
function ClassesSection() {
  const [months, setMonths]      = useState(12)
  const [selected, setSelected]  = useState(null)
  const { data, loading, error } = useClasses(months)

  const top12 = (data || []).slice(0, 12)

  const histData = useMemo(() => {
    if (!selected || !selected.history?.length) return []
    return selected.history.map(h => ({ ...h, month: fmtMonth(h.month) }))
  }, [selected])

  const maxActive = top12[0]?.active || 1

  return (
    <section className="sa-section">
      <div className="sa-section__header">
        <SectionTitle>Clases</SectionTitle>
        <PeriodSelector value={months} onChange={setMonths} />
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}

      {!loading && !error && data && (
        <>
          <div className="sa-class-chart">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={top12.map(c => ({ name: c.label, activos: c.active, total: c.all }))}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#888', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#ccc', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                  labelStyle={{ color: '#f5c842' }}
                  formatter={(v, name) => [v, name === 'activos' ? 'Activos ahora' : 'Histórico total']}
                />
                <Legend formatter={k => k === 'activos' ? 'Activos ahora' : 'Histórico total'} />
                <Bar dataKey="total"   fill="#3a3020" radius={[0, 3, 3, 0]} />
                <Bar dataKey="activos" fill="#f5c842" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="sa-class-list">
            {top12.map((c, i) => (
              <button
                key={i}
                className={`sa-class-row${selected === c ? ' sa-class-row--active' : ''}`}
                onClick={() => setSelected(selected === c ? null : c)}
              >
                <span className="sa-class-row__pos">#{i + 1}</span>
                <span className="sa-class-row__label">{c.label}</span>
                <div className="sa-class-row__bar-wrap">
                  <div className="sa-class-row__bar" style={{ width: `${(c.active / maxActive) * 100}%` }} />
                </div>
                <span className="sa-class-row__count">{c.active} activos</span>
              </button>
            ))}
          </div>

          {selected && histData.length > 0 && (
            <div className="sa-class-detail">
              <p className="sa-product-detail__title">{selected.label} — nuevas inscripciones</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={histData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
                  <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#888', fontSize: 10 }} width={28} />
                  <Tooltip
                    contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                    labelStyle={{ color: '#f5c842' }}
                    formatter={v => [v, 'Nuevas inscripciones']}
                  />
                  <Bar dataKey="new" fill="#34d399" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ─── Main page ───────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const role = window.blokesSiteData?.userRole

  if (role !== 'superadmin') {
    return (
      <div className="sa-forbidden">
        <span className="sa-forbidden__icon">🔒</span>
        <p>Acceso restringido a superadministradores.</p>
      </div>
    )
  }

  return (
    <div className="sa-page">
      <h1 className="sa-page__title">Superadmin</h1>
      <RevenueSection />
      <ProductsSection />
      <ClassesSection />
      <ExpensesSection />
    </div>
  )
}
