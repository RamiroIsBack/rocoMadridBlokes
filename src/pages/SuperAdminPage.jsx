import { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useRevenue, useExpenses, useClasesRetencion, useClasesPagoEnCurso, useIngresosDesglose, ingresosFamiliaSet, expensesAperturaSet, useGestionGrupos } from '../hooks/useSuperAdmin'
import { PROF_META } from '../data/staffSchedule'
import useTemaOscuro from '../hooks/useTemaOscuro'
import ExpensesSection from '../components/ExpensesSection'
import { PL_DATA, PL_VENTAS_IVA } from '../data/plHistorico'
import PayrollSection from '../components/PayrollSection'
import { useTabParam } from '../hooks/useTabParam'
import PresupuestosSection from '../components/PresupuestosSection'
import BudgetSection from '../components/BudgetSection'
import ProjectsSection from '../components/ProjectsSection'
import BlokesMapSection from '../components/BlokesMapSection'
import PlaygroundPage from './PlaygroundPage'
import CherifsDashboard from './CherifsPage'
import { getEventsAccess, saveEventsAccess } from '../hooks/useEvents'
import { getDiarioAccess, saveDiarioAccess } from '../hooks/useDiario'
import './SuperAdminPage.css'

const PERIOD_OPTIONS = [
  { label: '6 meses',  value: 6  },
  { label: '12 meses', value: 12 },
  { label: '24 meses', value: 24 },
]

const STORE_COLORS = { store1: '#f5c842', store2: '#60a5fa', total: '#34d399' }
const STORE_LABELS = { store1: 'Rocoteca', store2: 'Club', total: 'Total' }

// Cowork 11/11 15:00: los colores de KPI (--kpi-color) son vivos, pensados para el panel
// siempre oscuro de antes — ahora que el panel sigue el tema (d84e788), en claro fallan sobre
// crema. Versión oscurecida de cada uno para claro, solo cuando se usan como TEXTO (no para
// las líneas/puntos decorativos de las gráficas, que se quedan vivos en los dos modos).
const KPI_COLOR_CLARO = {
  '#f5c842': '#8a6400',
  '#60a5fa': '#1d4ed8',
  '#34d399': '#047857',
  '#f97316': '#c2410c',
  '#a78bfa': '#6d28d9',
  '#888':    '#5e5650',
  '#fb7185': '#be123c',
}
function kpiColorTema(hex, oscuro) {
  return oscuro ? hex : (KPI_COLOR_CLARO[hex] || hex)
}

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

// ─── Revenue section ────────────────────────────────────────────────
function RevenueSection({ excludeTransfer, onToggleExclude }) {
  // Cowork 11/11 13:55: var(--color-text-secondary) en el fill de Recharts no se repinta solo
  // al cambiar de tema (atributo SVG fijo) — se resuelve a mano con useTemaOscuro().
  const oscuro = useTemaOscuro()
  const tickFill = oscuro ? '#b3ab9a' : '#5e5650'
  const [months, setMonths]      = useState(12)
  const { data, loading, error } = useRevenue(months, excludeTransfer)

  const totals = useMemo(() => {
    if (!data) return {}
    return {
      store1: data.reduce((s, r) => s + (r.store1 || 0), 0),
      store2: data.reduce((s, r) => s + (r.store2 || 0), 0),
      total:  data.reduce((s, r) => s + (r.total  || 0), 0),
    }
  }, [data])

  const chartData = useMemo(() =>
    (data || []).map(r => ({ ...r, month: fmtMonth(r.month) }))
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
      <p className="sa-legend">
        Ingresos netos de WooCommerce sin IVA (completados/processing), por fecha de pago (una renovación de octubre pagada en noviembre cuenta en noviembre), sin facturas anuladas en VeriFactu y con los reembolsos ya restados. «Con/Sin uso Rocódromo» excluye la factura de arrendamiento inter-empresa Club → Rocoteca (por defecto sin ella: infla el total y no es ingreso del club).
      </p>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}

      {!loading && !error && data && (
        <>
          <div className="sa-kpis">
            {[
              // Tienda Principal apenas vende desde julio (Ramiro 15/11 09:02): si suma ~0 en
              // el período, no ocupa sitio.
              ...(Math.abs(totals.store1 || 0) > 1 ? [{ key: 'store1', label: excludeTransfer ? 'Principal (sin Rocódromo)' : 'Tienda Principal' }] : []),
              { key: 'store2', label: 'Tienda Club' },
              { key: 'total',  label: 'Total combinado' },
            ].map(({ key, label }) => (
              <div key={key} className="sa-kpi" style={{ '--kpi-color': kpiColorTema(STORE_COLORS[key], oscuro) }}>
                <span className="sa-kpi__value">{fmtEur(totals[key] || 0)}</span>
                <span className="sa-kpi__label">{label}</span>
              </div>
            ))}
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
              <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}€`} tick={{ fill: tickFill, fontSize: 11 }} width={56} />
              <Tooltip
                contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                labelStyle={{ color: '#f5c842' }}
                formatter={(v, name) => [fmtEur(v), STORE_LABELS[name] || name]}
              />
              <Legend formatter={k => STORE_LABELS[k] || k} />
              {Math.abs(totals.store1 || 0) > 1 && (
                <Area type="monotone" dataKey="store1" stroke={STORE_COLORS.store1} fill={`url(#grad-store1)`} strokeWidth={2} dot={false} />
              )}
              <Area type="monotone" dataKey="store2" stroke={STORE_COLORS.store2} fill={`url(#grad-store2)`} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="total"  stroke={STORE_COLORS.total}  fill={`url(#grad-total)`}  strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </section>
  )
}

// ─── Desglose de ingresos (NOTAS_PARA_CODE_ingresos_superadmin.md, 15/11 09:02) ───────────────
// Sustituye a "Productos y suscripciones" (mezclaba categorías de WooCommerce con cosas que no
// pintaban nada ahí) y a la calculadora de margen (ese análisis lo hace cowork aparte).
const INGRESOS_FAMILIAS = ['Clases', 'Eventos y grupos', 'Consumibles', 'Acceso al rocódromo', 'Otros']
const FAMILIA_COLOR = {
  'Sin clasificar': '#9ca3af', Clases: '#f5c842', 'Eventos y grupos': '#a78bfa',
  Consumibles: '#60a5fa', 'Acceso al rocódromo': '#34d399', Otros: '#f97316',
}

function ProductoFila({ p, onReclasificar }) {
  return (
    <div className="sa-product-inner">
      <span className="sa-product-inner__name">{p.name}</span>
      <span className="sa-product-inner__units">{p.units} uds</span>
      <span className="sa-product-inner__rev">{fmtEur(p.revenue)}</span>
      <button className="sa-link" onClick={onReclasificar}>reclasificar</button>
    </div>
  )
}

function IngresosDesgloseSection({ excludeTransfer }) {
  const [months, setMonths] = useState(12)
  const { data, loading, error, refetch } = useIngresosDesglose(months, excludeTransfer)
  const [openFam, setOpenFam] = useState(() => new Set())
  const [openSub, setOpenSub] = useState(() => new Set())
  const [reclasificando, setReclasificando] = useState(null)
  const [busy, setBusy] = useState(false)

  const toggleFam = f => setOpenFam(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n })
  const toggleSub = k => setOpenSub(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const chartData = useMemo(() => {
    if (!data?.familias) return []
    const meses = new Set()
    data.familias.forEach(f => f.porMes.forEach(m => meses.add(m.mes)))
    return [...meses].sort().map(mes => {
      const row = { month: fmtMonth(mes) }
      data.familias.forEach(f => { row[f.familia] = f.porMes.find(m => m.mes === mes)?.importe || 0 })
      return row
    })
  }, [data])

  async function reclasificar(nombre, familia, sub) {
    setBusy(true)
    try { await ingresosFamiliaSet({ nombre, familia, sub }); await refetch() } finally { setBusy(false); setReclasificando(null) }
  }

  return (
    <section className="sa-section">
      <div className="sa-section__header">
        <SectionTitle>Desglose de ingresos</SectionTitle>
        <PeriodSelector value={months} onChange={setMonths} />
      </div>
      <p className="sa-legend">
        Familias propias de Blokes (no las categorías de WooCommerce — mezclaban clases, eventos y uso del rocódromo). Mismo cálculo que la gráfica de Ingresos (anuladas fuera, reembolsos restados, mes de pago, después de descuentos, y el mismo botón «Con/Sin uso Rocódromo» de arriba) — la suma debería cuadrar con el total de arriba.
        No incluye lo cobrado fuera de la web (efectivo/transferencia que solo está en el Excel de Eva) ni el módulo Eventos todavía.
      </p>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}

      {!loading && !error && data && (
        <>
          <div className="sa-kpis">
            {data.familias.map(f => (
              <div key={f.familia} className="sa-kpi" style={{ '--kpi-color': FAMILIA_COLOR[f.familia] || '#999' }}>
                <span className="sa-kpi__value">{fmtEur(f.importe)}</span>
                <span className="sa-kpi__label">{f.familia} ({f.pct}%)</span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${v}€`} tick={{ fontSize: 11 }} width={56} />
              <Tooltip formatter={(v, name) => [fmtEur(v), name]} />
              <Legend />
              {data.familias.map(f => (
                <Bar key={f.familia} dataKey={f.familia} stackId="a" fill={FAMILIA_COLOR[f.familia] || '#999'} />
              ))}
            </BarChart>
          </ResponsiveContainer>

          <div className="sa-cat-list">
            {data.familias.map(f => (
              <div key={f.familia} className="sa-cat-group">
                <button className={`sa-cat-header${openFam.has(f.familia) ? ' sa-cat-header--open' : ''}`} onClick={() => toggleFam(f.familia)}>
                  <span className="sa-cat-arrow">{openFam.has(f.familia) ? '▼' : '▶'}</span>
                  <span className="sa-cat-name">{f.familia}</span>
                  <span className="sa-cat-count">{f.familia === 'Consumibles' ? f.subs.reduce((s, x) => s + x.productos.length, 0) : f.productos.length}</span>
                  <span className="sa-cat-rev">{fmtEur(f.importe)}</span>
                </button>
                {openFam.has(f.familia) && (
                  <div className="sa-cat-products">
                    {f.familia === 'Consumibles' ? f.subs.map(s => (
                      <div key={s.sub} className="sa-cat-group" style={{ marginLeft: 16 }}>
                        <button className={`sa-cat-header${openSub.has(s.sub) ? ' sa-cat-header--open' : ''}`} onClick={() => toggleSub(s.sub)}>
                          <span className="sa-cat-arrow">{openSub.has(s.sub) ? '▼' : '▶'}</span>
                          <span className="sa-cat-name">{s.sub}</span>
                          <span className="sa-cat-count">{s.productos.length}</span>
                          <span className="sa-cat-rev">{fmtEur(s.importe)}</span>
                        </button>
                        {openSub.has(s.sub) && s.productos.map((p, i) => (
                          <ProductoFila key={i} p={p} onReclasificar={() => setReclasificando(p)} />
                        ))}
                      </div>
                    )) : f.productos.map((p, i) => (
                      <ProductoFila key={i} p={p} onReclasificar={() => setReclasificando(p)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {reclasificando && (
            <div className="sv-grp-overlay" onClick={() => !busy && setReclasificando(null)}>
              <div className="sv-grp-modal" onClick={e => e.stopPropagation()}>
                <h3>Reclasificar «{reclasificando.name}»</h3>
                <div className="sv-grp-modal__actions" style={{ flexWrap: 'wrap' }}>
                  {INGRESOS_FAMILIAS.map(fam => (
                    <button key={fam} className="sa-filter-btn" disabled={busy} onClick={() => reclasificar(reclasificando.name, fam, fam === 'Consumibles' ? 'Bar' : null)}>{fam}</button>
                  ))}
                </div>
                <button className="sv-tests-select" disabled={busy} onClick={() => setReclasificando(null)}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ─── Class profitability ─────────────────────────────────────────────────────

function normForProf(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const PROF_CLASS_SLOTS = {
  Alvaro:  [['lunes','18:00'],['lunes','19:30'],['martes','14:00'],['martes','16:30'],['martes','18:00'],['martes','19:30'],['miercoles','18:00'],['miercoles','19:30'],['jueves','14:00'],['jueves','16:30'],['jueves','18:00'],['jueves','19:30']],
  Sigurd:  [['martes','17:30','adultos'],['martes','19:00'],['martes','20:30'],['jueves','17:30','adultos'],['jueves','19:00'],['jueves','20:30']],
  'Lucía': [['lunes','17:30'],['lunes','19:00'],['miercoles','17:30'],['miercoles','19:00']],
  Sara:    [['martes','09:00'],['martes','10:30'],['martes','12:00'],['jueves','09:00'],['jueves','10:30'],['jueves','12:00']],
  Ana:     [['lunes','20:30'],['viernes','19:00']],
  Eva:     [['martes','17:30','menor'],['martes','18:30'],['jueves','17:30','menor'],['jueves','18:30'],['viernes','18:00'],['viernes','19:00']],
}

const PROF_COLOR = { Alvaro: '#f5c842', Sigurd: '#60a5fa', 'Lucía': '#34d399', Sara: '#f97316', Ana: '#a78bfa', Eva: '#fb7185' }

function getProfForClass(c) {
  const start = (c.horario || '').split('-')[0].trim()
  const dias  = normForProf(c.dia || '').split(/[\s\-·,|]+/).filter(Boolean)
  const edad  = normForProf(c.edad || '')
  return Object.keys(PROF_CLASS_SLOTS).find(prof =>
    PROF_CLASS_SLOTS[prof].some(([d, t, e]) =>
      dias.includes(d) && t === start && (!e || edad.includes(normForProf(e)))
    )
  ) || null
}

function classDurationH(horario) {
  const parts = (horario || '').split('-')
  if (parts.length < 2) return 1.5
  const toMin = t => { const [h, m] = t.trim().split(':').map(Number); return h * 60 + (m || 0) }
  return (toMin(parts[1]) - toMin(parts[0])) / 60
}

// Ramiro, 15/11 09:10: "Rentabilidad de las clases" se mueve aquí (antes en Ingresos) y se
// rehace con dinero de verdad en vez de tarifas fijas, junto a la retención de la 08:45 punto D
// — una sola pestaña "Clases" para todo lo que no es dinero agregado del club.
function profesorClaseConIsa(c) {
  // Isa/Eva en niños-adolescentes (igual que profesoresDeGrupo() en SupervisionPage.jsx — NO se
  // ha metido a Isa en PROF_CLASS_SLOTS/PROF_META porque esa fuente también alimenta Nóminas y
  // ella es voluntaria, Ramiro 15/11 07:25). Ramiro, 15/11 16:20 (tabla de franjas real): Isa
  // da las 3 franjas de Martes-Jueves (17:30-18:30, 18:30-19:30, 19:30-21:00 adolescentes); Eva
  // da Lunes-Miércoles Y Viernes — antes esto último asignaba Viernes a Isa por error (solo
  // miraba L-X, no Viernes).
  if (c.edad && c.edad !== 'Adultos') {
    const dias = normForProf(c.dia || '').split(/[\s\-·,|]+/).filter(Boolean)
    const esMartesJueves = dias.length > 0 && dias.every(d => d === 'martes' || d === 'jueves')
    return esMartesJueves ? 'Isa' : 'Eva'
  }
  return getProfForClass(c)
}

// Cowork, 15/11 17:50 punto 6: "Medianos M-J 18:30-19:30" en vez de la etiqueta genérica
// "Martes-Jueves · 18:30-19:30 (Adolescentes)" — es el nombre que usa Eva/el Excel para esta
// clase concreta (donde se fusiona también la variación huérfana 18:30-20:00, commits
// 13795fe/50a089c).
function claseLabel(c) {
  if (c.dia === 'Martes-Jueves' && c.horario === '18:30-19:30') return 'Medianos M-J 18:30-19:30'
  return c.edad !== 'Adultos' ? `${c.label} (${c.edad})` : c.label
}

// "Alumnos con pago en curso" (Ramiro, 15/11 16:30) — sustituye a la tabla "Por mes" (cabeceras
// desplazadas, inicio/altas/bajas/final confuso). Una línea por año, como el P&L: personas
// distintas con el mes pagado o cubierto, del Excel de Grupos fusionado con WooCommerce.
// Umbrales de color de la retención (Ramiro, 15/11 16:40): 🟢 ≥80% a 3 meses, 🟡 60-79%, 🔴
// <60%; gris si la muestra (N, estancias que ya tienen esa antigüedad) es menor de 5 — "en
// constantes para poder ajustarlos".
const RETENCION_UMBRAL_VERDE = 80
const RETENCION_UMBRAL_AMARILLO = 60
const RETENCION_N_MINIMO = 5
function retencionCelda(pct, n) {
  if (n < RETENCION_N_MINIMO) return { cls: 'sa-ret--pocos', texto: pct != null ? `${pct}%` : '—' }
  if (pct == null) return { cls: '', texto: '—' }
  const cls = pct >= RETENCION_UMBRAL_VERDE ? 'sa-ret--verde' : pct >= RETENCION_UMBRAL_AMARILLO ? 'sa-ret--amarillo' : 'sa-ret--rojo'
  return { cls, texto: `${pct}%` }
}
// Funde los campos de retención/estancias de una clase combinada (p. ej. "Martes-Jueves") con
// sus días sueltos relacionados ("Martes", "Jueves") — mismo criterio que ya usa filasRentabilidad
// para activos/ingreso: son sesiones reales distintas (alumnos con variantes de producto
// distintas) que hay que sumar, no una clase aparte. La permanencia media se pondera por
// estanciasEmpezaron12m de cada lado como aproximación (no hay un recuento total de tramos por
// clase para ponderar con más precisión).
function mergeRetencion(rows) {
  const suma = k => rows.reduce((t, r) => t + (r[k] || 0), 0)
  const motivos = {}
  rows.forEach(r => Object.entries(r.motivosBaja || {}).forEach(([k, v]) => { motivos[k] = (motivos[k] || 0) + v }))
  let motivoPrincipal = null, max = 0
  Object.entries(motivos).forEach(([k, v]) => { if (v > max) { max = v; motivoPrincipal = k } })
  const empezaron12m = suma('estanciasEmpezaron12m')
  const conPermanencia = rows.filter(r => r.permanenciaMediaClase != null)
  const pesoTotal = conPermanencia.reduce((t, r) => t + (r.estanciasEmpezaron12m || 1), 0)
  const permanenciaMediaClase = conPermanencia.length
    ? Math.round((conPermanencia.reduce((t, r) => t + r.permanenciaMediaClase * (r.estanciasEmpezaron12m || 1), 0) / pesoTotal) * 10) / 10
    : null
  const out = { estanciasEmpezaron12m: empezaron12m, bajas6mClase: suma('bajas6mClase'), cambiosClase6m: suma('cambiosClase6m'), permanenciaMediaClase, motivoPrincipal }
  ;[1, 3, 6].forEach(n => {
    const abs = suma(`siguen${n}Abs`), tot = suma(`siguen${n}N`)
    out[`siguen${n}Abs`] = abs; out[`siguen${n}N`] = tot
    out[`siguen${n}`] = tot ? Math.round(abs / tot * 1000) / 10 : null
  })
  return out
}
// Mismas categorías que BAJA_MOTIVO_OPCIONES (SupervisionPage.jsx) — compartido con
// BLOKES_BAJA_MOTIVOS del backend. 'sin_categoria' es lo que pone el backend cuando la baja no
// tiene motivo guardado (impago sin que nadie haya rellenado el desplegable de Bajas).
const MOTIVO_LABEL = {
  precio: 'Precio', horario: 'Horario', falta_tiempo: 'Falta de tiempo', mudanza: 'Mudanza',
  otro_rocodromo: 'Se va a otro rocódromo', clase_profe: 'La clase o el profe', lesion: 'Lesión',
  temporal_vuelve: 'Temporal, dice que vuelve', duplicado: 'Duplicado (no es baja real)', otro: 'Otro',
  sin_categoria: 'Sin motivo guardado',
}

const PAGO_CURSO_CATS = [
  { v: 'todos', l: 'Todos' }, { v: 'adultos', l: 'Adultos' },
  { v: 'ninos', l: 'Niños-adolescentes' }, { v: 'pilates_yoga', l: 'Pilates-Yoga' },
]
function AlumnosPagoEnCursoChart() {
  const oscuro = useTemaOscuro()
  const tickFill = oscuro ? '#b3ab9a' : '#5e5650'
  const [categoria, setCategoria] = useState('todos')
  const { data, loading, error } = useClasesPagoEnCurso(categoria)

  const chartData = useMemo(() => {
    if (!data?.porMes) return []
    return PL_MONTHS_ABB.map((month, i) => {
      const row = { month }
      ;[2024, 2025, 2026].forEach(yr => { row[`y${yr}`] = data.porMes[`${yr}-${String(i + 1).padStart(2, '0')}`] ?? null })
      return row
    })
  }, [data])

  return (
    <>
      <div className="sa-section__header">
        <h3 className="sa-subtitle">Alumnos con pago en curso</h3>
        <div className="sa-period">
          {PAGO_CURSO_CATS.map(c => (
            <button key={c.v} className={`sa-period__btn${categoria === c.v ? ' sa-period__btn--active' : ''}`} onClick={() => setCategoria(c.v)}>{c.l}</button>
          ))}
        </div>
      </div>
      <p className="sa-legend">
        Personas distintas con el mes pagado o cubierto (mensual, trimestral/anual que cubre ese mes, exentos) — del Excel de Grupos fusionado con WooCommerce; una persona cuenta una vez aunque vaya a 2 clases o a una de 2 días.
        {data?.mesEnCurso && <> <strong>{fmtMonth(data.mesEnCurso)} va a medias</strong> (mes en curso).</>}
        {' '}Los meses de antes de septiembre de 2024 pueden estar incompletos en el Excel de Grupos.
      </p>
      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}
      {!loading && !error && (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
            <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 11 }} />
            <YAxis tick={{ fill: tickFill, fontSize: 11 }} width={40} />
            <Tooltip
              contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
              labelStyle={{ color: '#f5c842' }}
              formatter={(v, name) => [v, name.replace('y', '')]}
            />
            <Legend formatter={k => k.replace('y', '')} />
            {[2024, 2025, 2026].map(yr => (
              <Line key={yr} type="monotone" dataKey={`y${yr}`} stroke={PL_YEAR_COLORS[yr]} strokeWidth={2}
                dot={({ cx, cy, value }) => value != null ? <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={PL_YEAR_COLORS[yr]} /> : null}
                connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </>
  )
}

// «Bajo tarifa» (16/11 07:35 punto B.5): solo socios. Mismos datos que Supervisión › Grupos
// (/gestion/grupos, ya trae tarifaEsperada/diferenciaMensual/bajoTarifa* por alumno) — el total
// que se deja de cobrar al mes es solo un reduce aquí, sin endpoint propio. Eva ve la diferencia
// de cada alumno en Grupos (es suya, es un pendiente de ella), pero nunca este total agregado.
function BajoTarifaResumenSection() {
  const oscuro = useTemaOscuro()
  const { data, loading, error } = useGestionGrupos(1)
  const filas = useMemo(() => {
    const out = []
    for (const g of (data?.grupos || [])) {
      for (const a of g.alumnos) {
        if (a.bajoTarifa) out.push({ ...a, grupoLabel: g.label })
      }
    }
    return out.sort((a, b) => (a.diferenciaMensual ?? 0) - (b.diferenciaMensual ?? 0))
  }, [data])
  const totalMes = useMemo(() => filas.reduce((s, a) => s + Math.abs(a.diferenciaMensual || 0), 0), [filas])
  const sinRevisar = filas.filter(a => !a.bajoTarifaRevisado).length

  if (loading) return null
  if (error) return null
  if (filas.length === 0) return null

  return (
    <section className="sa-section">
      <SectionTitle>Bajo tarifa</SectionTitle>
      <p className="sa-legend">
        Alumnos que pagan menos que la tarifa de su clase (margen de 2 €). Eva escribe el motivo y lo marca revisado
        desde Supervisión › Grupos — aquí solo el total agregado, que no es suyo.
      </p>
      <div className="sa-kpis">
        <div className="sa-kpi" style={{ '--kpi-color': kpiColorTema('#ef4444', oscuro) }}>
          <span className="sa-kpi__value">−{fmtEur(totalMes)}</span>
          <span className="sa-kpi__label">al mes, entre {filas.length} alumno{filas.length === 1 ? '' : 's'}</span>
        </div>
        {sinRevisar > 0 && (
          <div className="sa-kpi" style={{ '--kpi-color': kpiColorTema('#f5c842', oscuro) }}>
            <span className="sa-kpi__value">{sinRevisar}</span>
            <span className="sa-kpi__label">sin revisar todavía</span>
          </div>
        )}
      </div>
      <div className="sa-profit-wrap">
        <table className="sa-profit-table">
          <thead>
            <tr><th>Alumno</th><th>Clase</th><th>Diferencia/mes</th><th>Motivo</th><th>Revisado</th></tr>
          </thead>
          <tbody>
            {filas.map(a => (
              <tr key={`${a.subId}-${a.grupoLabel}`}>
                <td>{a.alumno || '—'}</td>
                <td className="sa-profit__num--dim">{a.grupoLabel}</td>
                <td className="sa-profit__ben sa-profit__ben--neg">−{fmtEur(Math.abs(a.diferenciaMensual || 0))}</td>
                <td className="sa-profit__num--dim">
                  {a.bajoTarifaMotivoEva || a.notas || (a.bajoTarifaMotivoSugerido ? <em>{a.bajoTarifaMotivoSugerido}</em> : 'sin motivo anotado')}
                </td>
                <td className="sa-profit__num--dim">{a.bajoTarifaRevisado ? `✓ ${a.bajoTarifaRevisadoPor}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ClasesRetencionSection() {
  const [months, setMonths] = useState(12)
  // Mes de "ingreso real" (cowork, 15/11 09:45): por defecto el último mes cerrado que decide
  // el backend (mesIngreso) — el usuario puede elegir otro con el selector.
  const [mesSel, setMesSel] = useState('')
  const { data, loading, error } = useClasesRetencion(months, mesSel)

  // Isa (Ramiro, 15/11 16:00/16:20): voluntaria con nómina real, 12 €/hora confirmado y
  // "profe visible" en Clases/Grupos/Horarios — pero a propósito NO entra en PROF_META (esa
  // ficha también alimenta Playground/TimeOff/campamento, herramientas de personal pagado; no
  // hay horasSem suya confirmada para equipar/gestión, solo para sus 3 franjas de clase: M-J
  // 17:30-18:30 + 18:30-19:30 + 19:30-21:00 = 3,5 h/día × 2 días = 7 h/semana — ningún otro
  // número suyo se inventa aquí). Objeto aparte, solo para el coste de SUS clases.
  const ISA_META = { costoHClase: 12, horasSem: 7 }

  // Ramiro, 15/11 10:25 punto A: coste de empresa REAL del mes elegido — nómina bruta (+
  // efectivo) real + Seguridad Social real, nada de ×1,43 (eso era useCostes/FACTOR_COSTE) ni
  // de usar siempre la nómina del mes actual en vez de la del mes que se está mirando. El
  // backend ya lo calcula para $mesIngreso; aquí solo se divide por las horas del mes (clases +
  // equipar + gestión — PROF_META.horasSem ya es esa cifra semanal, no solo horas de clase).
  function costeHoraReal(prof) {
    if (!prof) return 0
    const meta = prof === 'Isa' ? ISA_META : PROF_META[prof]
    if (!meta || !meta.horasSem) return 0
    const real = data?.costeRealProfe?.[normForProf(prof)]
    // Si no hay dato real para ese mes (p. ej. Nóminas sin nada cargado para ese mes concreto),
    // usar la ficha en vez de 0€ — 0 es la peor respuesta posible para una rentabilidad (cowork,
    // 15/11 10:40: "deja el coste a 0€ en todas"). Investigando por qué sale vacío — mientras
    // tanto, mejor una estimación que un 0 que hace parecer gratis a todos los profes.
    if (real == null || real <= 0) return meta.costoHClase || 0
    return real / (meta.horasSem * 4.33)
  }
  // Cowork, 15/11 11:15: en vez de mirar error_log, enseñar en el ⓘ qué fuente se usó de
  // verdad — si tiene fila de nómina de ESE mes (costeRealProfeFuente) usa nómina+SS banco,
  // si no, cae al plan B de la ficha (costoHClase), visible en vivo sin acceso al servidor.
  function fuenteProfe(prof) {
    if (!prof) return ''
    const meta = prof === 'Isa' ? ISA_META : PROF_META[prof]
    if (!meta || !meta.horasSem) return ''
    const mes = fmtMonth(data?.mesIngreso)
    const tieneNomina = !!data?.costeRealProfeFuente?.[normForProf(prof)]
    if (prof === 'Isa' && !tieneNomina) return `ficha (12 €/h confirmado, Ramiro 15/11 16:00), sin nómina de ${mes}`
    return tieneNomina ? `nómina ${mes} + SS banco (prorrateada)` : `ficha, sin nómina de ${mes}`
  }
  // Sesiones por semana de esta clase: "Martes-Jueves"/"Lunes-Miércoles" = 2, un día suelto
  // (p. ej. "Viernes") = 1 — faltaba este factor, por eso el coste salía de 1 sola sesión en
  // vez del mes completo (× ~4,33 semanas/mes).
  function sesionesSemana(dia) {
    return (dia || '').includes('-') ? 2 : 1
  }

  function semaforoYrecomendacion(margen, ocupacion) {
    const semaforo = margen < 0 ? 'bad' : (ocupacion < 0.5 ? 'warn' : 'ok')
    // Recomendación (Ramiro, 15/11 09:10): una primera lectura automática, no una decisión —
    // Ramiro/Ramiro-socio sigue siendo quien decide de verdad.
    const recomendacion = margen >= 0
      ? (ocupacion < 0.5 ? 'Promocionar (hay hueco)' : 'Va bien')
      : (ocupacion < 0.3 ? 'Juntar con otra clase o cerrar' : 'Hablar con el profe (coste alto para lo que entra)')
    return { semaforo, recomendacion }
  }
  const sumaMedia = (a, b, k) => (a[k] != null || b[k] != null) ? (a[k] || 0) + (b[k] || 0) : null

  const filasRentabilidad = useMemo(() => {
    if (!data?.porClase) return []
    // Un "día suelto" (p. ej. "Martes" solo) no es una clase aparte: es la MISMA sesión que ya
    // da la clase de 2 días de ese día+horario ("Martes-Jueves") — el profe cobra 1 vez por esa
    // sesión, no 2 (cowork, 15/11 09:55: "Martes 17:30 Sigurd 98€" + "Martes-Jueves 17:30
    // Sigurd 196€" contaba la misma sesión del martes dos veces). El de 2 días absorbe el
    // coste; los de día suelto solo aportan ingreso/activos, con 0€ de coste propio.
    const combos  = data.porClase.filter(c => (c.dia || '').includes('-'))
    const singles = data.porClase.filter(c => !(c.dia || '').includes('-'))
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
      const prof = profesorClaseConIsa(combo)
      const costeProfe = costeHoraReal(prof) * classDurationH(combo.horario) * 2 * 4.33
      const relacionadas = singles.filter(s => comboPorSuelto[`${s.dia.trim()}|${s.horario}|${s.edad}`]?.includes(combo))
      relacionadas.forEach(s => cubiertos.add(`${s.dia.trim()}|${s.horario}|${s.edad}`))
      const activos = combo.activos + relacionadas.reduce((t, s) => t + s.activos, 0)
      const activosFuera = (combo.activosFuera || 0) + relacionadas.reduce((t, s) => t + (s.activosFuera || 0), 0)
      const ingresoMesReal = combo.ingresoMesReal + relacionadas.reduce((t, s) => t + s.ingresoMesReal, 0)
      const ingresoMedia3m = sumaMedia(combo, { ingresoMedia3m: relacionadas.reduce((t, s) => t + (s.ingresoMedia3m || 0), 0) }, 'ingresoMedia3m')
      const ingresoMedia6m = sumaMedia(combo, { ingresoMedia6m: relacionadas.reduce((t, s) => t + (s.ingresoMedia6m || 0), 0) }, 'ingresoMedia6m')
      const ingresoMedia12m = sumaMedia(combo, { ingresoMedia12m: relacionadas.reduce((t, s) => t + (s.ingresoMedia12m || 0), 0) }, 'ingresoMedia12m')
      const ocupacion = activos / 15
      const margen = ingresoMesReal - costeProfe
      const retencion = mergeRetencion([combo, ...relacionadas])
      filas.push({ ...combo, ...retencion, prof, costeProfe, fuenteProfe: fuenteProfe(prof), ocupacion, margen, activos, activosFuera, ingresoMesReal, ingresoMedia3m, ingresoMedia6m, ingresoMedia12m, ...semaforoYrecomendacion(margen, ocupacion) })
    })

    singles.forEach(s => {
      if (cubiertos.has(`${s.dia.trim()}|${s.horario}|${s.edad}`)) return // ya absorbida por su combo
      const prof = profesorClaseConIsa(s)
      const costeProfe = costeHoraReal(prof) * classDurationH(s.horario) * 1 * 4.33
      const ocupacion = s.activos / 15
      const margen = s.ingresoMesReal - costeProfe
      filas.push({ ...s, ...mergeRetencion([s]), prof, costeProfe, fuenteProfe: fuenteProfe(prof), ocupacion, margen, ...semaforoYrecomendacion(margen, ocupacion) })
    })

    return filas.sort((a, b) => b.margen - a.margen)
  }, [data])

  // Retención por clase (Ramiro, 15/11 16:40) — mismas clases ya combinadas de filasRentabilidad
  // (día suelto absorbido por su M-J), ordenadas de mejor a peor por retención a 3 meses.
  const filasRetencionClase = useMemo(() => (
    filasRentabilidad.slice().sort((a, b) => (b.siguen3 ?? -1) - (a.siguen3 ?? -1))
  ), [filasRentabilidad])

  // Retención por profe: las mismas estancias, agrupadas por profe (suma de empezaron/siguen,
  // nunca media de porcentajes — una clase de 20 alumnos no pesa igual que una de 3).
  const filasRetencionProfe = useMemo(() => {
    const porProfe = {}
    filasRentabilidad.forEach(c => {
      const prof = c.prof || '—'
      ;(porProfe[prof] = porProfe[prof] || []).push(c)
    })
    return Object.entries(porProfe).map(([prof, clases]) => ({
      prof, nClases: clases.length, activos: clases.reduce((t, c) => t + (c.activos || 0), 0),
      ...mergeRetencion(clases),
    })).sort((a, b) => (b.siguen3 ?? -1) - (a.siguen3 ?? -1))
  }, [filasRentabilidad])

  return (
    <section className="sa-section">
      <div className="sa-section__header">
        <SectionTitle>Clases — retención y rentabilidad</SectionTitle>
        <PeriodSelector value={months} onChange={setMonths} />
      </div>
      {loading && <LoadingBlock />}
      {error && <ErrorBlock msg={error} />}
      {!loading && !error && data && (
        <>
          <AlumnosPagoEnCursoChart />

          <div className="sa-section__header">
            <h3 className="sa-subtitle">Rentabilidad por clase (ingreso de verdad cobrado, trimestrales/anuales ya prorrateados por mes)</h3>
            <select className="sa-chart-select" value={mesSel || data.mesIngreso || ''} onChange={e => setMesSel(e.target.value)}>
              {(data.mesesDisponibles || []).slice().reverse().map(m => (
                <option key={m} value={m}>{fmtMonth(m)}{m === data.mesIngreso && !mesSel ? ' (último cerrado)' : ''}</option>
              ))}
            </select>
          </div>
          <p className="sa-legend">
            Coste del profe: coste de empresa real del mes elegido (nómina bruta + efectivo + Seguridad Social real + gastos de voluntarios, de Nóminas y Gastos banco — nada de factores inventados), dividido entre sus horas del mes (clases + equipar + gestión). Isa: 12 €/h confirmado, o su nómina real del mes si ya hay (ⓘ de cada fila dice la fuente).
            Semáforo: 🔴 margen negativo · 🟡 margen positivo pero ocupación por debajo del 50% (7-8 de 15) · 🟢 margen positivo y ocupación ≥ 50%.
            El margen se calcula sobre el ingreso del mes elegido; las medias de 3/6/12 meses son solo para ver la tendencia.
            {data.pestanasSinRepartir > 0 && (
              <>
                {' '}
                <span
                  title={(data.pestanasSinRepartirDetalle || []).map(p => `${p.pestana}: ${p.motivo}`).join('\n')}
                  style={{ cursor: 'help', textDecoration: 'underline dotted' }}
                >
                  {data.pestanasSinRepartir} pestaña{data.pestanasSinRepartir === 1 ? '' : 's'} del Excel con pago este mes sin repartir ⓘ
                </span>
                {' '}(pasa el ratón para ver cuáles y por qué).
              </>
            )}
          </p>
          <div className="sa-profit-wrap">
            <table className="sa-profit-table">
              <thead>
                <tr><th></th><th>Clase</th><th>Profe</th><th>Activos</th><th>Ocupación/15</th><th>Ingreso del mes</th><th>Media 3m</th><th>Media 6m</th><th>Media 12m</th><th>Coste profe</th><th>Margen</th><th>Retención 3m</th><th>Recomendación</th></tr>
              </thead>
              <tbody>
                {filasRentabilidad.map((c, i) => {
                  const pocos = (c.siguen3N ?? 0) < RETENCION_N_MINIMO
                  return (
                  <tr key={i} className={pocos ? 'sa-ret-row--pocos' : ''}>
                    <td><span className={`sa-semaforo sa-semaforo--${c.semaforo}`} title={c.semaforo} /></td>
                    <td className="sa-profit__label">{claseLabel(c)}</td>
                    <td className="sa-profit__prof" style={{ color: PROF_COLOR[c.prof] }}>{c.prof || '—'}</td>
                    <td className="sa-profit__num" title={c.activosFuera ? `${c.activosWeb ?? (c.activos - c.activosFuera)} web + ${c.activosFuera} que pagan por fuera` : 'Todos con suscripción en la web'}>
                      {c.activos}{c.activosFuera ? ' ⓘ' : ''}
                    </td>
                    <td className="sa-profit__num">{Math.round(c.ocupacion * 100)}%</td>
                    <td className="sa-profit__num">{fmtEur(c.ingresoMesReal)}</td>
                    <td className="sa-profit__num sa-profit__num--dim">{c.ingresoMedia3m != null ? fmtEur(c.ingresoMedia3m) : '—'}</td>
                    <td className="sa-profit__num sa-profit__num--dim">{c.ingresoMedia6m != null ? fmtEur(c.ingresoMedia6m) : '—'}</td>
                    <td className="sa-profit__num sa-profit__num--dim">{c.ingresoMedia12m != null ? fmtEur(c.ingresoMedia12m) : '—'}</td>
                    <td className="sa-profit__num" title={`Fuente: ${c.fuenteProfe}`}>{fmtEur(c.costeProfe)} ⓘ</td>
                    <td className={`sa-profit__ben${c.margen >= 0 ? ' sa-profit__ben--pos' : ' sa-profit__ben--neg'}`}>{fmtEur(c.margen)}</td>
                    <td className={`sa-profit__num ${retencionCelda(c.siguen3, c.siguen3N).cls}`} title={`${c.siguen3Abs ?? 0} de ${c.siguen3N ?? 0}`}>
                      {c.siguen3N ? `${c.siguen3Abs} de ${c.siguen3N}` : '—'}
                    </td>
                    <td className="sa-profit__num" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{c.recomendacion}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h3 className="sa-subtitle">Retención por clase</h3>
          <p className="sa-legend">
            Estancia = tramo continuo de una persona en esa clase (Excel de Grupos + WooCommerce + hist-pagos fusionados, 1 mes de margen). "Empezaron (12m)" = estancias nuevas en esa clase en el último año; "Siguen" muestra cuántas de ESAS ya tienen esa antigüedad y de ellas cuántas seguían en la MISMA clase ("n de N"). Un cambio de clase cierra la estancia vieja pero no cuenta como baja del club — sale aparte en "Cambios".
            🟢 ≥{RETENCION_UMBRAL_VERDE}% a 3 meses · 🟡 {RETENCION_UMBRAL_AMARILLO}-{RETENCION_UMBRAL_VERDE - 1}% · 🔴 &lt;{RETENCION_UMBRAL_AMARILLO}% · gris si la muestra es menor de {RETENCION_N_MINIMO}.
          </p>
          <div className="sa-profit-wrap">
            <table className="sa-profit-table">
              <thead>
                <tr><th>Clase</th><th>Profe</th><th>Alumnos ahora</th><th>Empezaron (12m)</th><th>Siguen 1m</th><th>Siguen 3m</th><th>Siguen 6m</th><th>Permanencia media</th><th>Bajas 6m</th><th>Cambios clase (6m)</th><th>Motivo principal</th></tr>
              </thead>
              <tbody>
                {filasRetencionClase.map((c, i) => {
                  const pocos = (c.siguen3N ?? 0) < RETENCION_N_MINIMO
                  return (
                    <tr key={i} className={pocos ? 'sa-ret-row--pocos' : ''}>
                      <td className="sa-profit__label">{claseLabel(c)}</td>
                      <td className="sa-profit__prof" style={{ color: PROF_COLOR[c.prof] }}>{c.prof || '—'}</td>
                      <td className="sa-profit__num" title={c.activosFuera ? `${c.activosWeb ?? (c.activos - c.activosFuera)} web + ${c.activosFuera} que pagan por fuera` : 'Todos con suscripción en la web'}>
                        {c.activos}{c.activosFuera ? ' ⓘ' : ''}
                      </td>
                      <td className="sa-profit__num">{c.estanciasEmpezaron12m}</td>
                      <td className={`sa-profit__num ${retencionCelda(c.siguen1, c.siguen1N).cls}`} title={`${c.siguen1Abs} de ${c.siguen1N}`}>{c.siguen1N ? `${c.siguen1Abs} de ${c.siguen1N}` : '—'}</td>
                      <td className={`sa-profit__num ${retencionCelda(c.siguen3, c.siguen3N).cls}`} title={`${c.siguen3Abs} de ${c.siguen3N}`}>{c.siguen3N ? `${c.siguen3Abs} de ${c.siguen3N} (${c.siguen3}%)` : '—'}</td>
                      <td className={`sa-profit__num ${retencionCelda(c.siguen6, c.siguen6N).cls}`} title={`${c.siguen6Abs} de ${c.siguen6N}`}>{c.siguen6N ? `${c.siguen6Abs} de ${c.siguen6N}` : '—'}</td>
                      <td className="sa-profit__num sa-profit__num--dim">{c.permanenciaMediaClase != null ? `${c.permanenciaMediaClase} m` : '—'}</td>
                      <td className="sa-profit__num">{c.bajas6mClase}</td>
                      <td className="sa-profit__num sa-profit__num--dim">{c.cambiosClase6m}</td>
                      <td className="sa-profit__num sa-profit__num--dim" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{c.motivoPrincipal ? (MOTIVO_LABEL[c.motivoPrincipal] || c.motivoPrincipal) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h3 className="sa-subtitle">Retención por profe</h3>
          <div className="sa-profit-wrap">
            <table className="sa-profit-table">
              <thead>
                <tr><th>Profe</th><th>Clases</th><th>Alumnos ahora</th><th>Empezaron (12m)</th><th>Siguen 1m</th><th>Siguen 3m</th><th>Siguen 6m</th><th>Permanencia media</th><th>Bajas 6m</th><th>Motivo principal</th></tr>
              </thead>
              <tbody>
                {filasRetencionProfe.map((p, i) => {
                  const pocos = (p.siguen3N ?? 0) < RETENCION_N_MINIMO
                  return (
                    <tr key={i} className={pocos ? 'sa-ret-row--pocos' : ''}>
                      <td className="sa-profit__prof" style={{ color: PROF_COLOR[p.prof] }}>{p.prof}</td>
                      <td className="sa-profit__num">{p.nClases}</td>
                      <td className="sa-profit__num">{p.activos}</td>
                      <td className="sa-profit__num">{p.estanciasEmpezaron12m}</td>
                      <td className={`sa-profit__num ${retencionCelda(p.siguen1, p.siguen1N).cls}`} title={`${p.siguen1Abs} de ${p.siguen1N}`}>{p.siguen1N ? `${p.siguen1Abs} de ${p.siguen1N}` : '—'}</td>
                      <td className={`sa-profit__num ${retencionCelda(p.siguen3, p.siguen3N).cls}`} title={`${p.siguen3Abs} de ${p.siguen3N}`}>{p.siguen3N ? `${p.siguen3Abs} de ${p.siguen3N} (${p.siguen3}%)` : '—'}</td>
                      <td className={`sa-profit__num ${retencionCelda(p.siguen6, p.siguen6N).cls}`} title={`${p.siguen6Abs} de ${p.siguen6N}`}>{p.siguen6N ? `${p.siguen6Abs} de ${p.siguen6N}` : '—'}</td>
                      <td className="sa-profit__num sa-profit__num--dim">{p.permanenciaMediaClase != null ? `${p.permanenciaMediaClase} m` : '—'}</td>
                      <td className="sa-profit__num">{p.bajas6mClase}</td>
                      <td className="sa-profit__num sa-profit__num--dim" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{p.motivoPrincipal ? (MOTIVO_LABEL[p.motivoPrincipal] || p.motivoPrincipal) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
              <div className="sa-kpi" style={{ '--kpi-color': kpiColorTema('#34d399', oscuro) }}>
                <span className="sa-kpi__value">{fmtEur(totalRevenue)}</span>
                <span className="sa-kpi__label">Ingresos WC clases ({months}m)</span>
              </div>
              <div className="sa-kpi" style={{ '--kpi-color': kpiColorTema('#888', oscuro) }}>
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
                  tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                  tickFormatter={mode === 'ingresos' ? v => `${v}€` : undefined}
                />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
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
                  <XAxis dataKey="month" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} width={28} />
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
]

const PL_YEAR_COLORS = { 2024: '#f5c842', 2025: '#60a5fa', 2026: '#34d399' }


// Cowork, 16/11 07:00: sin maximumFractionDigits, toLocaleString('es-ES') deja hasta 3
// decimales en valores no enteros (bank-derived, con prorrateos) — salían cifras como
// «131.288,267€». Redondeado a euros enteros, como se pidió.
function fmtPLVal(v) {
  if (v == null) return '—'
  return `${v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`
}

function PLTab() {
  const oscuro = useTemaOscuro()
  const tickFill = oscuro ? '#b3ab9a' : '#5e5650'
  // Ramiro, 15/11 11:25 (GRAVE, corrige 11:10): "Ingresos" y "Gastos" de 2026 tienen que venir
  // de la MISMA fuente y periodo. WooCommerce solo tiene ventas desde la migración (may-26) —
  // ene-abr se cobraba por TPV/transferencia/Excel y no está en Woo — así que compararlo con los
  // gastos del banco de TODO el año daba un resultado negativo falso (−59.568 €). "Ingresos" pasa
  // a ser el banco consolidado (Club+Rocoteca) sin internos/préstamos, sin IVA estimado por
  // categoría (mismo campo iva_repercutido que ya usa /expenses -- ojo, hoy ese estimado trata
  // TPV/transferencia como 21% uniforme, no "clases exentas + bar 10% + resto 21%" como pide
  // Ramiro; day para afinarlo por familia necesita blendear con el reparto real de WooCommerce,
  // que solo existe desde mayo -- lo dejo aparte, ver nota). WooCommerce queda como una cifra de
  // comparación aparte, no como el total.
  const { data: expData, cuadre, cuadreRocoteca, loading, refetch: refetchExp } = useExpenses('', 'all', true)
  const [metric,  setMetric ] = useState('ventas')
  const [view,    setView   ] = useState('comparativa')
  const [showIva, setShowIva] = useState(true)
  // Apertura editable por entidad (cowork, 15/11 11:45: la Rocoteca no tiene semilla, hay que
  // poder metérsela a mano).
  const [editandoApertura, setEditandoApertura] = useState(null) // 'club' | 'rocoteca' | null
  const [aperturaValor, setAperturaValor] = useState('')
  const [guardandoApertura, setGuardandoApertura] = useState(false)
  async function guardarApertura(entity) {
    const n = parseFloat(aperturaValor.replace(',', '.'))
    if (isNaN(n)) return
    setGuardandoApertura(true)
    try {
      await expensesAperturaSet(new Date().getFullYear(), entity, n)
      await refetchExp()
    } catch (e) { alert(e.message) } finally { setGuardandoApertura(false); setEditandoApertura(null) }
  }

  // Ramiro, 15/11 20:00 (bug visto en oct/sep): "ingresos sin IVA" dividía TODO entre 1,21
  // (iva_repercutido, estimado del banco por categoría con un 21% genérico para transferencia/
  // TPV) — pero casi todo lo que entra son clases, exentas de IVA, así que oct salía 13.309 €
  // en vez de ≈16.000 €. Ahora se usa iva_repercutido_real (de las facturas reales de
  // WooCommerce, que ya refleja el 0% de las clases). En los meses de antes de la migración
  // (sin facturas reales) se estima con el % medio real de los meses que SÍ las tienen — nunca
  // con un 21% fijo. Gastos se dejan CON IVA a propósito (20:10 punto 2): casi todo lo que
  // vendemos va exento, así que el IVA de las compras no se recupera y es coste real.
  const live2026 = useMemo(() => {
    if (!expData) return {}
    const acc = {}
    expData.forEach(r => {
      const [y, m] = r.month.split('-').map(Number)
      if (y !== 2026) return
      if (!acc[m]) acc[m] = { ingresoBanco: 0, costes: 0, ivaReal: 0 }
      acc[m].ingresoBanco += Math.abs(r.total_ingresos || 0)
      acc[m].costes        += Math.abs(r.total_costes  || 0)
      acc[m].ivaReal        += Math.abs(r.iva_repercutido_real || 0)
    })
    let sumaIvaConFactura = 0, sumaIngresoConFactura = 0
    Object.values(acc).forEach(d => {
      if (d.ivaReal > 0) { sumaIvaConFactura += d.ivaReal; sumaIngresoConFactura += d.ingresoBanco }
    })
    const pctMedioReal = sumaIngresoConFactura > 0 ? sumaIvaConFactura / sumaIngresoConFactura : 0
    const res = {}
    for (let m = 1; m <= 12; m++) {
      if (!acc[m]) continue
      const d = acc[m]
      const tieneFactura = d.ivaReal > 0
      const ivaUsado = tieneFactura ? d.ivaReal : d.ingresoBanco * pctMedioReal
      const ventas = d.ingresoBanco - ivaUsado
      const resultado = ventas - d.costes
      res[m] = {
        ventas, costes: -d.costes, resultado,
        ivaFuente: tieneFactura ? 'IVA real de facturas' : `IVA estimado (${(pctMedioReal * 100).toFixed(1)}%, media de los meses con facturas)`,
      }
    }
    return res
  }, [expData])

  const resumenAnual = useMemo(() => {
    const vals = Object.values(live2026)
    const ingresos = vals.reduce((s, d) => s + d.ventas, 0)
    const gastos   = vals.reduce((s, d) => s - d.costes, 0)
    return { ingresos, gastos, resultado: ingresos - gastos, meses: vals.length }
  }, [live2026])

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

  // Ramiro, 15/11 20:10: el resumen del año en curso + cuadre con el banco se mueve al FINAL de
  // la pestaña ("¿qué es esto que sale lo primero?") — arriba se queda la gráfica y el detalle
  // mensual. Quitada la ficha "Ventas en WooCommerce (desde may-26)": confunde (no es el total
  // del año) y ya está en Superadmin › Ingresos.
  const resumenAnualYCuadre = (
    <>
      <SectionTitle>2026 (año en curso, hasta {!loading ? PL_MONTHS_FULL[lastMonth - 1] : '…'})</SectionTitle>
      <div className="sa-kpis">
        <div className="sa-kpi" style={{ '--kpi-color': kpiColorTema('#60a5fa', oscuro) }}>
          <span className="sa-kpi__value">{fmtPLVal(resumenAnual.ingresos)}</span>
          <span className="sa-kpi__label">Ingresos (banco, consolidado, sin IVA real/estimado)</span>
        </div>
        <div className="sa-kpi" style={{ '--kpi-color': kpiColorTema('#ef4444', oscuro) }}>
          <span className="sa-kpi__value">{fmtPLVal(resumenAnual.gastos)}</span>
          <span className="sa-kpi__label">Gastos (banco, consolidado, con IVA — casi todo lo que vendemos va exento, no se recupera)</span>
        </div>
        <div className="sa-kpi" style={{ '--kpi-color': kpiColorTema(resumenAnual.resultado >= 0 ? '#34d399' : '#ef4444', oscuro) }}>
          <span className="sa-kpi__value">{fmtPLVal(resumenAnual.resultado)}</span>
          <span className="sa-kpi__label">Resultado</span>
        </div>
      </div>
      {/* Cowork, 15/11 20:10 punto 4: línea gris siempre (nunca naranja), con el detalle largo
          de los traspasos en el ⓘ en vez de como texto suelto debajo. */}
      {[['club', 'Club', cuadre], ['rocoteca', 'Rocoteca', cuadreRocoteca]].map(([entity, label, c]) => (
        c && (
          <p
            key={entity}
            className="sa-legend"
            title={entity === 'club' ? 'Los traspasos con la Rocoteca («Uso de Rocódromo», ene-jul 26, ya no se hace) no son gasto del Club: ese dinero paga gastos que la Rocoteca ya contabiliza aparte — por eso ene-jul el resultado real es el consolidado Club+Rocoteca, no solo el Club.' : undefined}
          >
            <strong>Cuadre con el banco ({label}){entity === 'club' ? ' ⓘ' : ''}:</strong>{' '}
            apertura 1/1{' '}
            {editandoApertura === entity ? (
              <>
                <input
                  type="number" step="0.01" value={aperturaValor} autoFocus
                  onChange={e => setAperturaValor(e.target.value)}
                  style={{ width: 90 }}
                />
                <button className="sa-link" disabled={guardandoApertura} onClick={() => guardarApertura(entity)}>Guardar</button>
                <button className="sa-link" onClick={() => setEditandoApertura(null)}>Cancelar</button>
              </>
            ) : c.apertura != null ? (
              <>
                {fmtPLVal(c.apertura)}{c.aperturaEsSemilla ? ' (estimada del CSV' : ''}{c.aperturaEsSemilla ? ')' : ''}{' '}
                <button className="sa-link" onClick={() => { setEditandoApertura(entity); setAperturaValor(String(c.apertura)) }}>editar</button>
              </>
            ) : (
              <button className="sa-link" onClick={() => { setEditandoApertura(entity); setAperturaValor('') }}>sin dato, añadir</button>
            )}
            {c.apertura != null && (
              <>
                {' '}+ resultado {fmtPLVal(c.resultado)}
                {c.traspasosRocodromo !== 0 && <> {c.traspasosRocodromo >= 0 ? '+' : '−'} traspasos {fmtPLVal(Math.abs(c.traspasosRocodromo))}</>}
                {' '}= esperado {fmtPLVal(c.apertura + c.resultado + c.traspasosRocodromo)} · real {c.fechaHoy ? `a ${c.fechaHoy.slice(8,10)}/${c.fechaHoy.slice(5,7)}` : 'hoy'} {fmtPLVal(c.saldoHoy)}
                {Math.abs(c.diferencia ?? 0) > 50 ? ` · diferencia ${fmtPLVal(c.diferencia)} sin explicar` : ' · cuadra ✓'}
              </>
            )}
          </p>
        )
      ))}
    </>
  )

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
          <div key={yr} className="sa-kpi" style={{ '--kpi-color': kpiColorTema(PL_YEAR_COLORS[yr], oscuro) }}>
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
            <XAxis dataKey="month" tick={{ fill: tickFill, fontSize: 11 }} />
            <YAxis tickFormatter={tickFmt} tick={{ fill: tickFill, fontSize: 11 }} width={44} />
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
            <XAxis dataKey="label" tick={{ fill: tickFill, fontSize: 11 }} interval={2} />
            <YAxis tickFormatter={tickFmt} tick={{ fill: tickFill, fontSize: 11 }} width={44} />
            <Tooltip {...chartTooltip} />
            {[2024, 2025, 2026].map(yr => (
              <Line key={yr} type="monotone" dataKey={`y${yr}`} stroke={PL_YEAR_COLORS[yr]} strokeWidth={2}
                dot={dotRender(yr)} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <PLAccordion live2026={live2026} lastMonth={lastMonth} />

      {resumenAnualYCuadre}
    </section>
  )
}

function PLAccordion({ live2026, lastMonth }) {
  const oscuro = useTemaOscuro()
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
                    <span className="sa-pl-pill sa-pl-pill--25">2025: {Math.abs(v25ventas).toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</span>
                  )}
                  {v26?.ventas != null && (
                    <span className="sa-pl-pill sa-pl-pill--26" title={`Ingresos sin IVA = ingresos del banco (Club+Rocoteca, sin internos) − ${v26.ivaFuente}.`}>2026: {Math.abs(v26.ventas).toLocaleString('es-ES', { maximumFractionDigits: 0 })}€ banco ⓘ</span>
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
                      <th style={{ color: kpiColorTema(PL_YEAR_COLORS[2024], oscuro) }}>2024</th>
                      <th style={{ color: kpiColorTema(PL_YEAR_COLORS[2025], oscuro) }}>2025</th>
                      <th style={{ color: kpiColorTema(PL_YEAR_COLORS[2026], oscuro) }}>2026 banco</th>
                      <th>Var. 25/24</th>
                      <th>Var. 26/25</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PL_METRICS_LIST.map(({ key, label }) => {
                      const v24 = PL_DATA[key][2024][m - 1]
                      const v25 = PL_DATA[key][2025][m - 1]
                      const v2026 = v26?.[key] ?? null
                      const delta2524 = v24 != null && v25 != null && v24 !== 0
                        ? (v25 - v24) / Math.abs(v24) * 100 : null
                      // Cowork, 16/11 07:00 punto 2: faltaba la variación con el año en curso,
                      // que es la que de verdad interesa ahora (misma fórmula que Var. 25/24).
                      const delta2625 = v2026 != null && v25 != null && v25 !== 0
                        ? (v2026 - v25) / Math.abs(v25) * 100 : null
                      return (
                        <tr key={key}>
                          <td className="sa-pl-table__metric">{label}</td>
                          <td className="sa-pl-table__val">{v24 != null ? Math.abs(v24).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€' : '—'}</td>
                          <td className="sa-pl-table__val">{v25 != null ? Math.abs(v25).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€' : '—'}</td>
                          <td className="sa-pl-table__val sa-pl-table__val--26" title={key === 'ventas' && v26 ? v26.ivaFuente : (key === 'costes' ? 'Con IVA: casi todo lo que vendemos va exento, el IVA de las compras no se recupera y es coste.' : undefined)}>
                            {v2026 != null ? Math.abs(v2026).toLocaleString('es-ES', { maximumFractionDigits: 0 }) + '€' : '—'}{key === 'ventas' && v2026 != null ? ' ⓘ' : ''}
                          </td>
                          <td className={`sa-pl-table__delta${delta2524 == null ? '' : delta2524 >= 0 ? ' sa-pl-table__delta--pos' : ' sa-pl-table__delta--neg'}`}>
                            {delta2524 != null ? `${delta2524 >= 0 ? '+' : ''}${delta2524.toFixed(1)}%` : '—'}
                          </td>
                          <td className={`sa-pl-table__delta${delta2625 == null ? '' : delta2625 >= 0 ? ' sa-pl-table__delta--pos' : ' sa-pl-table__delta--neg'}`}>
                            {delta2625 != null ? `${delta2625 >= 0 ? '+' : ''}${delta2625.toFixed(1)}%` : '—'}
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
// Pestañas agrupadas: arriba los apartados y, dentro de Tesorería y Gestión, sus subpestañas.
// 23/11 (Álvaro): esta página es ahora «Cherifs» (ruta /cherifs); Dashboard delante y Horarios Profes
// (antes /playground) como una pestaña más.
const SA_GROUPS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'tesoreria', label: 'Tesorería', tabs: [
    { key: 'ingresos',          label: 'Ingresos' },
    { key: 'clases',            label: 'Clases' },
    { key: 'gastos',            label: 'Gastos banco' },
    { key: 'presupuesto-anual', label: 'Presupuesto anual' },
    { key: 'pl',                label: 'P&L' },
  ] },
  { key: 'nominas', label: 'Nóminas' },
  { key: 'gestion', label: 'Gestión', tabs: [
    { key: 'presupuestos', label: 'Presupuestos' },
    { key: 'proyectos',    label: 'Proyectos' },
  ] },
  { key: 'acceso', label: 'Acceso' },
  { key: 'mapa',   label: 'Mapa de Blokes' },
  { key: 'horarios', label: 'Horarios Profes' },
]
const SA_ALL_TABS = SA_GROUPS.flatMap(g => g.tabs ? g.tabs.map(t => t.key) : [g.key])
// Última subpestaña abierta de cada apartado, para volver a ella al cambiar de apartado
const lastSubTab = {}

// Recordar la última pestaña abierta en este navegador (si el almacenamiento falla, se empieza en Dashboard)
const LAST_TAB_KEY = 'sa-last-tab'
function loadLastTab() {
  try {
    const t = localStorage.getItem(LAST_TAB_KEY)
    return SA_ALL_TABS.includes(t) ? t : 'dashboard'
  } catch { return 'dashboard' }
}
function saveLastTab(t) { try { localStorage.setItem(LAST_TAB_KEY, t) } catch { /* sin almacenamiento */ } }

export default function SuperAdminPage() {
  const role = window.blokesSiteData?.userRole
  const [saTab, setSaTab]               = useState(loadLastTab)
  useTabParam('tab', t => SA_ALL_TABS.includes(t), t => { setSaTab(t); saveLastTab(t) })
  // Por defecto "Sin uso Rocódromo" (Ramiro 15/11 09:02 (d): la factura entre empresas infla el
  // total combinado — se puede ver con el botón, pero no es lo que sale por defecto).
  const [excludeTransfer, setExclude]   = useState(true)

  if (role !== 'socio') {
    return (
      <div className="sa-forbidden">
        <span className="sa-forbidden__icon">🔒</span>
        <p>Acceso restringido a socios.</p>
      </div>
    )
  }

  const group    = SA_GROUPS.find(g => g.key === saTab || g.tabs?.some(t => t.key === saTab)) || SA_GROUPS[0]
  const openTab  = key => { setSaTab(key); saveLastTab(key) }
  const openGroup = g => openTab(g.tabs ? (lastSubTab[g.key] || g.tabs[0].key) : g.key)
  if (group.tabs && group.tabs.some(t => t.key === saTab)) lastSubTab[group.key] = saTab

  return (
    <div className="sa-page">
      <h1 className="sa-page__title">Cherifs</h1>
      <div className="sa-main-tabs">
        {SA_GROUPS.map(g => (
          <button key={g.key} className={`sa-main-tab${group.key === g.key ? ' sa-main-tab--active' : ''}`} onClick={() => openGroup(g)}>
            {g.label}
          </button>
        ))}
      </div>
      {group.tabs && (
        <div className="sa-pl-tabs sa-sub-tabs">
          {group.tabs.map(t => (
            <button key={t.key} className={`sa-pl-tab${saTab === t.key ? ' sa-pl-tab--active' : ''}`} onClick={() => openTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {saTab === 'ingresos' && (
        <>
          <RevenueSection excludeTransfer={excludeTransfer} onToggleExclude={() => setExclude(x => !x)} />
          <IngresosDesgloseSection excludeTransfer={excludeTransfer} />
          <p className="sa-legend">
            La rentabilidad por clase se movió a <button type="button" className="sa-link" onClick={() => setSaTab('clases')}>Clases</button> (09:10: con ingreso real cobrado, no tarifa fija).
          </p>
        </>
      )}
      {saTab === 'clases'   && (<><ClasesRetencionSection /><BajoTarifaResumenSection /></>)}
      {saTab === 'gastos'   && <ExpensesSection />}
      {saTab === 'pl'       && <PLTab />}
      {saTab === 'nominas'  && <PayrollSection />}
      {saTab === 'presupuesto-anual' && <BudgetSection />}
      {saTab === 'acceso'   && <ListasSection />}
      {saTab === 'presupuestos' && <PresupuestosSection />}
      {saTab === 'proyectos' && <ProjectsSection />}
      {saTab === 'mapa'      && <BlokesMapSection />}
      {saTab === 'dashboard' && <CherifsDashboard />}
      {saTab === 'horarios'  && <PlaygroundPage />}
    </div>
  )
}

// ─── Listas de acceso ─────────────────────────────────────────────────────────
const LISTA_CONFIG = [
  { key: 'socios',     label: 'Socios',     color: '#a78bfa', acceso: 'Todo + Superadmin' },
  { key: 'gestion',    label: 'Gestión',    color: '#34d399', acceso: 'Todo de profesores + ExcelMuerte (Supervisión)' },
  { key: 'profesores', label: 'Profesores', color: '#f5c842', acceso: 'Setter · Estadísticas · Entrenamientos · Fichaje · TimeOff' },
  { key: 'tablets',    label: 'Tablet',     color: '#60a5fa', acceso: 'Los blokes, Progreso y Ligas en modo tablet, sin login personal' },
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
            <SectionAccessGroup
              name="Eventos" color="#f87171" load={getEventsAccess} save={saveEventsAccess}
              note="Solo la sección Eventos (gestión y socios ya entran)"
            />
            <SectionAccessGroup
              name="Diario" color="#d09c01" load={getDiarioAccess} save={saveDiarioAccess}
              note="Ven el Diario con el calendario (sin teléfonos, contactos ni importes). Profes, gestión y socios ya entran. Aquí está ya también quien tenía acceso al antiguo Calendario"
            />
          </div>
        </div>
      </details>
    </section>
  )
}

// Listas de una sola sección (Eventos, Calendario): se guardan aparte (superadmin/v1),
// para dar acceso solo a esa sección (p. ej. Juan o Carolina)
function SectionAccessGroup({ name, color, note, load, save: saveList }) {
  const [emails, setEmails] = useState(null)
  const [input,  setInput]  = useState('')
  const [status, setStatus] = useState('')   // '', 'saving', 'saved' o mensaje de error

  useEffect(() => {
    load().then(json => setEmails(json.emails || [])).catch(e => { setEmails([]); setStatus(e.message) })
  }, [load])

  const add = () => {
    const email = input.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    if (!emails.includes(email)) setEmails([...emails, email])
    setInput('')
  }
  const save = async () => {
    setStatus('saving')
    try {
      setEmails(await saveList(emails))
      setStatus('saved')
      setTimeout(() => setStatus(''), 3000)
    } catch (e) {
      setStatus(e.message)
    }
  }

  if (!emails) return null
  return (
    <div className="sa-list-group" style={{ '--list-color': color }}>
      <div className="sa-list-group__header">
        <span className="sa-list-group__name">{name}</span>
        <span className="sa-list-group__acceso">{note}</span>
      </div>
      <div className="sa-list-group__emails">
        {emails.map(email => (
          <span key={email} className="sa-list-email">
            {email}
            <button className="sa-list-email__remove" onClick={() => setEmails(emails.filter(e => e !== email))} aria-label="Quitar">×</button>
          </span>
        ))}
        {emails.length === 0 && <span className="sa-list-empty">Sin emails configurados</span>}
      </div>
      <div className="sa-list-add">
        <input
          type="email" className="sa-list-add__input" placeholder="nuevo@email.com"
          value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button className="sa-list-add__btn" onClick={add}>+</button>
        <button className={`sa-list-save__btn${status === 'saved' ? ' sa-list-save__btn--saved' : ''}`} onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? '…' : status === 'saved' ? 'Guardado ✓' : 'Guardar'}
        </button>
        {status && !['saving', 'saved'].includes(status) && <span className="sa-list-error">{status}</span>}
      </div>
    </div>
  )
}
