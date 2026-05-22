import React, { useState, useMemo, useRef, useCallback } from 'react'
import {
  BarChart, Bar, ComposedChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { parseExpensesCSV, CATEGORIES, CATEGORY_IVA, autoCategory } from '../utils/expensesParser'
import { useExpenses } from '../hooks/useSuperAdmin'
import './ExpensesSection.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const IVA_RATES = [0, 4, 10, 21]

function fmtEur(v) {
  return `${Math.abs(Number(v)).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
}
function fmtMonth(m) {
  if (!m) return ''
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1).toLocaleString('es-ES', { month: 'short', year: '2-digit' })
}
function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

// ── Preview table (after CSV parse) ──────────────────────────────────
function PreviewTable({ items, section, onToggleExclude, onChangeCategory, onChangeIva, clubItemIds = new Set() }) {
  const visible = items.filter(i => i.section === section)
  if (!visible.length) return <p className="exp-empty">Sin datos</p>

  const sectionLabel = section === 'ingresos' ? 'ingresos' : 'gastos'
  const total = visible.filter(i => !i.excluded).reduce((s, i) => s + i.importe, 0)
  const hasAccounts = visible.some(i => i.cuenta)

  return (
    <div className="exp-table-wrap">
      <table className="exp-table">
        <thead>
          <tr>
            <th></th>
            <th>Fecha</th>
            <th>Concepto</th>
            {hasAccounts && <th>Cta.</th>}
            <th>Categoría</th>
            <th>IVA %</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(item => (
            <tr key={item.id} className={item.excluded ? 'exp-row--excluded' : ''}>
              <td>
                <input
                  type="checkbox"
                  checked={!item.excluded}
                  onChange={() => onToggleExclude(item.id)}
                  title={item.excluded ? 'Excluido (no contabilizar)' : 'Incluido'}
                />
              </td>
              <td className="exp-cell--date">{item.fecha}</td>
              <td className="exp-cell--concept">{item.concepto}</td>
              {hasAccounts && <td className="exp-cell--account">···{item.cuenta?.slice(-4)}</td>}
              <td>
                <select
                  className="exp-select"
                  value={item.category}
                  onChange={e => onChangeCategory(item.id, e.target.value)}
                  disabled={item.excluded}
                >
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </td>
              <td>
                {clubItemIds.has(item.id)
                  ? <span style={{ fontSize: '0.68rem', color: '#555' }}>Exento</span>
                  : (
                  <select
                    className="exp-select exp-select--iva"
                    value={item.iva}
                    onChange={e => onChangeIva(item.id, parseInt(e.target.value))}
                    disabled={item.excluded || item.category === 'nominas' || item.category === 'ss'}
                  >
                    {IVA_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                )}
              </td>
              <td className={`exp-cell--amount${item.excluded ? '' : item.importe < 0 ? ' exp-cell--neg' : ' exp-cell--pos'}`}>
                {item.excluded ? <s>{fmtEur(item.importe)}</s> : fmtEur(item.importe)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={hasAccounts ? 6 : 5} className="exp-total-label">Total {sectionLabel} incluidos</td>
            <td className={`exp-cell--amount ${total < 0 ? 'exp-cell--neg' : 'exp-cell--pos'}`}>{fmtEur(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// account number → default entity
// Both accounts in the Rocoteca CSV belong to Rocoteca (BBVA + Laboral Kutxa)
const KNOWN_ACCOUNTS = {
  '1210108368': 'rocoteca',
  '0201701833': 'rocoteca',
}

// ── Upload & preview panel ────────────────────────────────────────────
function UploadPanel({ onSaved }) {
  const fileRef = useRef()
  const [items,          setItems]         = useState([])
  const [accountMap,     setAccountMap]    = useState({}) // { cuenta: 'rocoteca'|'club' }
  const [singleEntity,   setSingleEntity]  = useState('rocoteca') // for CSVs without Cuenta column
  const [tab,            setTab]           = useState('costes')
  const [previewMonth,   setPreviewMonth]  = useState('all')
  const [previewAccount, setPreviewAccount]= useState('all')
  const [saving,         setSaving]        = useState(false)
  const [saveProgress,   setSaveProgress]  = useState('')
  const [saved,          setSaved]         = useState(false)
  const [error,          setError]         = useState(null)

  const uniqueMonths = useMemo(() => {
    const s = new Set(items.filter(i => i.month).map(i => i.month))
    return [...s].sort()
  }, [items])

  const uniqueAccounts = useMemo(() => {
    const s = new Set(items.filter(i => i.cuenta).map(i => i.cuenta))
    return [...s].sort()
  }, [items])

  // actual lotes = unique (entity, month) groups — what will actually be POSTed
  const totalLotes = useMemo(() => {
    const groups = new Set()
    items.forEach(item => {
      if (!item.month) return
      const entity = uniqueAccounts.length > 0
        ? (accountMap[item.cuenta] || 'rocoteca')
        : singleEntity
      groups.add(`${entity}||${item.month}`)
    })
    return groups.size || 0
  }, [items, uniqueAccounts, accountMap, singleEntity])

  const clubItemIds = useMemo(() => {
    const s = new Set()
    items.forEach(item => {
      const entity = uniqueAccounts.length > 0
        ? (accountMap[item.cuenta] || 'rocoteca')
        : singleEntity
      if (entity === 'club') s.add(item.id)
    })
    return s
  }, [items, uniqueAccounts, accountMap, singleEntity])

  const visibleItems = useMemo(() => {
    let filtered = items
    if (previewMonth   !== 'all') filtered = filtered.filter(i => i.month   === previewMonth)
    if (previewAccount !== 'all') filtered = filtered.filter(i => i.cuenta  === previewAccount)
    return filtered
  }, [items, previewMonth, previewAccount])

  const handleFile = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const { ingresos, costes } = parseExpensesCSV(ev.target.result)
        const all = [...ingresos, ...costes]
        if (all.length === 0) {
          setError('No se encontraron movimientos. Comprueba que es el extracto correcto del banco.')
          setItems([])
          return
        }
        // Deduplicate: same (fecha, concepto, importe) → keep first occurrence
        const seen = new Set()
        let dupCount = 0
        const deduped = all.filter(item => {
          const sig = `${item.fecha}||${item.concepto}||${item.importe}`
          if (seen.has(sig)) { dupCount++; return false }
          seen.add(sig)
          return true
        })
        setItems(deduped)
        setPreviewMonth('all')
        setPreviewAccount('all')
        setSaved(false)
        setError(dupCount > 0 ? `Se eliminaron ${dupCount} movimiento${dupCount > 1 ? 's' : ''} duplicado${dupCount > 1 ? 's' : ''} (mismo día, concepto e importe).` : null)
        // auto-map known accounts, unknown → rocoteca
        const accounts = [...new Set(deduped.filter(i => i.cuenta).map(i => i.cuenta))]
        const map = {}
        accounts.forEach(a => { map[a] = KNOWN_ACCOUNTS[a] || 'rocoteca' })
        setAccountMap(map)
      } catch (err) {
        setError(`Error al leer el archivo: ${err.message}`)
      }
    }
    reader.onerror = () => setError('No se pudo leer el archivo.')
    reader.readAsText(file, 'utf-8')
  }

  const toggle = id => setItems(prev => prev.map(i => i.id === id ? { ...i, excluded: !i.excluded } : i))
  const changeCategory = (id, cat) => setItems(prev => prev.map(i =>
    i.id === id ? { ...i, category: cat, iva: CATEGORY_IVA[cat] ?? i.iva } : i
  ))
  const changeIva = (id, iva) => setItems(prev => prev.map(i => i.id === id ? { ...i, iva } : i))

  const handleSave = async () => {
    if (!items.length) return
    setSaving(true); setError(null); setSaved(false)

    // Group by (entity, month) — prevents overwrite when two accounts share the same entity
    const groupMap = {}
    items.forEach(item => {
      if (!item.month) return
      const entity = uniqueAccounts.length > 0
        ? (accountMap[item.cuenta] || 'rocoteca')
        : singleEntity
      const key = `${entity}||${item.month}`
      if (!groupMap[key]) groupMap[key] = { entity, month: item.month, items: [] }
      groupMap[key].items.push(item)
    })
    const lotes = Object.values(groupMap).filter(g => g.items.length)

    let count = 0
    try {
      for (const lote of lotes) {
        count++
        setSaveProgress(`${count}/${lotes.length}`)
        const res = await fetch(`${CLUB_URL}/wp-json/superadmin/v1/expenses`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ month: lote.month, entity: lote.entity, items: lote.items }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status} al guardar ${fmtMonth(lote.month)} (${lote.entity})`)
      }
      setSaved(true)
      if (onSaved) onSaved()
    } catch (e) { setError(e.message) }
    finally { setSaving(false); setSaveProgress('') }
  }

  const ingresos = visibleItems.filter(i => i.section === 'ingresos')
  const costes   = visibleItems.filter(i => i.section === 'costes')

  return (
    <div className="exp-upload-panel">
      <div className="exp-upload-controls">
        <div className="exp-file-btn" onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
          <span>📂</span> Subir CSV del banco
        </div>
        {items.length > 0 && (
          <>
            <div className="exp-field">
              <label>Meses detectados</label>
              <div className="exp-months-pills">
                {uniqueMonths.map(m => <span key={m} className="exp-month-pill">{fmtMonth(m)}</span>)}
              </div>
            </div>
            {uniqueAccounts.length > 0 ? (
              <div className="exp-field">
                <label>Cuentas detectadas</label>
                <div className="exp-accounts">
                  {uniqueAccounts.map(a => (
                    <div key={a} className="exp-account-row">
                      <span className="exp-account-num">···{a.slice(-4)}</span>
                      <select
                        className="exp-select"
                        value={accountMap[a] || 'rocoteca'}
                        onChange={e => setAccountMap(m => ({ ...m, [a]: e.target.value }))}
                      >
                        <option value="rocoteca">Rocoteca</option>
                        <option value="club">Club</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="exp-field">
                <label>Entidad</label>
                <select className="exp-select" value={singleEntity} onChange={e => setSingleEntity(e.target.value)}>
                  <option value="rocoteca">Rocoteca</option>
                  <option value="club">Club</option>
                </select>
              </div>
            )}
            <button className={`exp-save-btn${saved ? ' exp-save-btn--ok' : ''}`} onClick={handleSave} disabled={saving}>
              {saving
                ? `Guardando ${saveProgress}…`
                : saved
                  ? `✓ ${totalLotes} ${totalLotes === 1 ? 'lote guardado' : 'lotes guardados'}`
                  : `Guardar ${totalLotes} ${totalLotes === 1 ? 'lote' : 'lotes'}`}
            </button>
          </>
        )}
      </div>

      {error && <p className={error.startsWith('Se eliminaron') ? 'exp-hint' : 'exp-error'}>{error.startsWith('Se eliminaron') ? `ⓘ ${error}` : `Error: ${error}`}</p>}

      {items.length > 0 && (
        <>
          {(uniqueMonths.length > 1 || uniqueAccounts.length > 1) && (
            <div className="exp-preview-filters">
              {uniqueMonths.length > 1 && (
                <div className="exp-month-filter">
                  <button
                    className={`exp-month-btn${previewMonth === 'all' ? ' exp-month-btn--active' : ''}`}
                    onClick={() => setPreviewMonth('all')}
                  >Todos</button>
                  {uniqueMonths.map(m => (
                    <button
                      key={m}
                      className={`exp-month-btn${previewMonth === m ? ' exp-month-btn--active' : ''}`}
                      onClick={() => setPreviewMonth(m)}
                    >{fmtMonth(m)}</button>
                  ))}
                </div>
              )}
              {uniqueAccounts.length > 1 && (
                <div className="exp-month-filter">
                  <button
                    className={`exp-month-btn${previewAccount === 'all' ? ' exp-month-btn--active' : ''}`}
                    onClick={() => setPreviewAccount('all')}
                  >Todas cuentas</button>
                  {uniqueAccounts.map(a => (
                    <button
                      key={a}
                      className={`exp-month-btn${previewAccount === a ? ' exp-month-btn--active' : ''}`}
                      onClick={() => setPreviewAccount(a)}
                    >···{a.slice(-4)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="exp-tabs">
            <button className={`exp-tab${tab === 'costes' ? ' exp-tab--active' : ''}`} onClick={() => setTab('costes')}>
              Gastos ({costes.filter(i => !i.excluded).length})
            </button>
            <button className={`exp-tab${tab === 'ingresos' ? ' exp-tab--active' : ''}`} onClick={() => setTab('ingresos')}>
              Ingresos banco ({ingresos.filter(i => !i.excluded).length})
            </button>
          </div>
          <p className="exp-hint">Los movimientos inter-empresa (USO DE ROCODROMO) y transferencias entre cuentas propias están excluidos por defecto — se anulan al consolidar las dos empresas. Actívalos si necesitas ver el IVA o el detalle por entidad.</p>
          <PreviewTable
            items={visibleItems}
            section={tab}
            onToggleExclude={toggle}
            onChangeCategory={changeCategory}
            onChangeIva={changeIva}
            clubItemIds={clubItemIds}
          />
        </>
      )}
    </div>
  )
}

const ENTITY_OPTIONS = [
  { v: 'all',      l: 'Todas' },
  { v: 'rocoteca', l: 'Rocoteca' },
  { v: 'club',     l: 'Club' },
]

// ── History charts ────────────────────────────────────────────────────
function HistoryView({ months, onDeleted }) {
  const [entity, setEntity]                   = useState('all')
  const [excludeInternal, setExcludeInternal] = useState(true)
  const [showManager, setShowManager]         = useState(false)
  const [deletingKey, setDeletingKey]         = useState(null)
  const effectiveExclude = excludeInternal
  const { data, breakdown, loading, error } = useExpenses(months, entity, effectiveExclude)

  const handleDelete = async (month, ent) => {
    const key = `${month}·${ent}`
    if (!window.confirm(`¿Borrar datos de ${fmtMonth(month)} (${ent}) de la base de datos? Esta acción no se puede deshacer.`)) return
    setDeletingKey(key)
    try {
      const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
      const res = await fetch(
        `${CLUB_URL}/wp-json/superadmin/v1/expenses?month=${month}&entity=${ent}`,
        { method: 'DELETE', headers: { 'X-WP-Nonce': nonce } }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (onDeleted) onDeleted()
    } catch (e) {
      alert(`Error al borrar: ${e.message}`)
    } finally {
      setDeletingKey(null)
    }
  }

  // PHP may return multiple rows per month (one per account upload) — merge them
  const byMonth = useMemo(() => {
    if (!data) return []
    const acc = {}
    data.forEach(r => {
      if (!acc[r.month]) acc[r.month] = { month: r.month, costes: 0, ingresos: 0, iva_s: 0, iva_r: 0, nominas: 0, nominas_by_entity: {}, by_concepto: {} }
      acc[r.month].costes   += Math.abs(r.total_costes    || 0)
      acc[r.month].ingresos += Math.abs(r.total_ingresos  || 0)
      acc[r.month].iva_s    += Math.abs(r.iva_soportado   || 0)
      acc[r.month].iva_r    += Math.abs(r.iva_repercutido || 0)
      acc[r.month].nominas  += Math.abs(r.nominas         || 0)
      if ((r.nominas || 0) > 0) {
        const ent = r.entity || 'rocoteca'
        acc[r.month].nominas_by_entity[ent] = (acc[r.month].nominas_by_entity[ent] || 0) + Math.abs(r.nominas)
      }
      Object.entries(r.by_concepto || {}).forEach(([k, v]) => {
        acc[r.month].by_concepto[k] = (acc[r.month].by_concepto[k] || 0) + v
      })
    })
    return Object.values(acc).sort((a, b) => a.month.localeCompare(b.month))
  }, [data])

  const netData = useMemo(() => {
    let cum = 0
    return byMonth.map(r => {
      const net = r.ingresos - r.costes
      cum += net
      return { month: fmtMonth(r.month), net: Math.round(net), acumulado: Math.round(cum) }
    })
  }, [byMonth])

  const nominasData = useMemo(() =>
    byMonth.map(r => ({ month: fmtMonth(r.month), nominas: r.nominas }))
  , [byMonth])

  const chartData = useMemo(() =>
    byMonth.map(r => ({
      month:           fmtMonth(r.month),
      gastos:          r.costes,
      ingresos_banco:  r.ingresos,
      iva_soportado:   r.iva_s,
      iva_repercutido: r.iva_r,
    }))
  , [byMonth])

  const totals = useMemo(() => ({
    gastos:   byMonth.reduce((s, r) => s + r.costes,             0),
    ingresos: byMonth.reduce((s, r) => s + r.ingresos,           0),
    iva_net:  byMonth.reduce((s, r) => s + r.iva_r - r.iva_s,   0),
  }), [byMonth])

  if (loading) return <div className="exp-loading">Cargando historial…</div>
  if (error)   return <div className="exp-error">Error: {error}</div>
  if (!data?.length) return <p className="exp-empty">Sube el primer CSV para ver el historial.</p>

  return (
    <div className="exp-history">
      <div className="exp-history-filters">
        <div className="sa-period">
          {ENTITY_OPTIONS.map(o => (
            <button
              key={o.v}
              className={`sa-period__btn${entity === o.v ? ' sa-period__btn--active' : ''}`}
              onClick={() => setEntity(o.v)}
            >{o.l}</button>
          ))}
        </div>
        <button
          className={`sa-transfer-toggle${excludeInternal ? ' sa-transfer-toggle--on' : ''}`}
          onClick={() => setExcludeInternal(v => !v)}
          title="Excluye transferencias internas (USO DE ROCODROMO, entre cuentas propias) y cobros TPV/WooCommerce que ya están en la sección de Ingresos"
        >
          {excludeInternal ? 'Sin internos' : 'Con internos'}
        </button>
      </div>

      <div className="exp-kpis">
        <div className="exp-kpi" style={{ '--c': '#ef4444' }}>
          <span className="exp-kpi__val">{fmtEur(totals.gastos)}</span>
          <span className="exp-kpi__lbl">Gastos ({months}m)</span>
        </div>
        <div className="exp-kpi" style={{ '--c': '#60a5fa' }}>
          <span className="exp-kpi__val">{fmtEur(totals.ingresos)}</span>
          <span className="exp-kpi__lbl">Ingresos banco ({months}m)</span>
        </div>
        <div className="exp-kpi" style={{ '--c': '#f97316' }}>
          <span className="exp-kpi__val">{fmtEur(Math.abs(totals.iva_net))}</span>
          <span className="exp-kpi__lbl">IVA neto {totals.iva_net >= 0 ? 'a pagar' : 'a favor'} ({months}m)</span>
        </div>
      </div>

      <p className="exp-chart-title">Gastos e ingresos banco por mes</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
          <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
          <YAxis tickFormatter={v => `${v}€`} tick={{ fill: '#888', fontSize: 10 }} width={52} />
          <Tooltip
            contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
            labelStyle={{ color: '#f5c842' }}
            formatter={(v, name) => [fmtEur(v), name === 'gastos' ? 'Gastos' : 'Ingresos banco']}
          />
          <Legend formatter={k => k === 'gastos' ? 'Gastos' : 'Ingresos banco'} />
          <Bar dataKey="ingresos_banco" fill="#60a5fa" radius={[3,3,0,0]} />
          <Bar dataKey="gastos"         fill="#ef4444" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>

      <p className="exp-chart-title" style={{ marginTop: 16 }}>IVA soportado vs repercutido</p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
          <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
          <YAxis tickFormatter={v => `${v}€`} tick={{ fill: '#888', fontSize: 10 }} width={52} />
          <Tooltip
            contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
            labelStyle={{ color: '#f97316' }}
            formatter={(v, name) => [fmtEur(v), name === 'iva_soportado' ? 'IVA soportado (gastos)' : 'IVA repercutido (ventas)']}
          />
          <Legend formatter={k => k === 'iva_soportado' ? 'IVA soportado' : 'IVA repercutido'} />
          <Bar dataKey="iva_repercutido" fill="#f97316" radius={[3,3,0,0]} />
          <Bar dataKey="iva_soportado"   fill="#6366f1" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* ─── Resultado neto mensual ─── */}
      {netData.length > 0 && (
        <>
          <p className="exp-chart-title" style={{ marginTop: 16 }}>Resultado neto mensual (ingresos − gastos)</p>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={netData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
              <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis tickFormatter={v => `${v}€`} tick={{ fill: '#888', fontSize: 10 }} width={56} />
              <Tooltip
                contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                labelStyle={{ color: '#f5c842' }}
                formatter={(v, name) => [fmtEur(v), name === 'net' ? 'Neto mes' : 'Acumulado']}
              />
              <Legend formatter={k => k === 'net' ? 'Neto mes' : 'Acumulado'} />
              <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                {netData.map((e, i) => (
                  <Cell key={i} fill={e.net >= 0 ? '#94a3b8' : '#475569'} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="acumulado" stroke="#f5c842" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}

      {/* ─── Nóminas por mes ─── */}
      {nominasData.some(r => r.nominas > 0) && (
        <>
          <p className="exp-chart-title" style={{ marginTop: 16 }}>Nóminas por mes</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={nominasData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
              <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis tickFormatter={v => `${v}€`} tick={{ fill: '#888', fontSize: 10 }} width={52} />
              <Tooltip
                contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                labelStyle={{ color: '#a78bfa' }}
                formatter={v => [fmtEur(v), 'Nóminas']}
              />
              <Bar dataKey="nominas" fill="#a78bfa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}

      {/* ─── Desglose de gastos por mes ─── */}
      {byMonth.some(r => r.nominas > 0 || Object.keys(r.by_concepto).length > 0) && (
        <>
          <p className="exp-chart-title" style={{ marginTop: 16 }}>Desglose de gastos por concepto</p>
          <div className="exp-table-wrap" style={{ maxHeight: 420 }}>
            <table className="exp-table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {byMonth.map(row => {
                  // Group raw concepts by category, sum totals
                  const byCat = {}
                  Object.entries(row.by_concepto).forEach(([concepto, total]) => {
                    const cat = autoCategory(concepto, false)
                    byCat[cat] = (byCat[cat] || 0) + total
                  })
                  // Filter out 0€ (rounded) entries, sort by total desc
                  const catEntries = Object.entries(byCat)
                    .filter(([, v]) => Math.round(v) > 0)
                    .sort((a, b) => b[1] - a[1])

                  if (row.nominas === 0 && catEntries.length === 0) return null
                  const monthTotal = row.nominas + catEntries.reduce((s, [, v]) => s + v, 0)
                  return (
                    <React.Fragment key={row.month}>
                      <tr className="exp-breakdown-month-header">
                        <td colSpan={2}>{fmtMonth(row.month)}</td>
                      </tr>
                      {Object.entries(row.nominas_by_entity || {})
                        .filter(([, v]) => Math.round(v) > 0)
                        .sort((a, b) => b[1] - a[1])
                        .map(([ent, v]) => (
                          <tr key={`nom-${ent}`} style={{ color: '#a78bfa', fontWeight: 700 }}>
                            <td>Nóminas {ent === 'club' ? 'Club' : 'Rocoteca'}</td>
                            <td className="exp-cell--amount">{fmtEur(v)}</td>
                          </tr>
                        ))
                      }
                      {catEntries.map(([cat, total]) => (
                        <tr key={cat}>
                          <td>{CATEGORIES[cat] ?? cat}</td>
                          <td className="exp-cell--amount">{fmtEur(total)}</td>
                        </tr>
                      ))}
                      <tr className="exp-breakdown-subtotal">
                        <td className="exp-total-label">Total {fmtMonth(row.month)}</td>
                        <td className="exp-cell--amount exp-cell--neg">{fmtEur(monthTotal)}</td>
                      </tr>
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="exp-manager">
        <button className="exp-manager-toggle" onClick={() => setShowManager(v => !v)}>
          {showManager ? '▲' : '▼'} Gestionar datos guardados ({data.length} {data.length === 1 ? 'entrada' : 'entradas'})
        </button>
        {showManager && (
          <div className="exp-manager-list">
            {data.map(r => {
              const key = `${r.month}·${r.entity}`
              const isDeleting = deletingKey === key
              return (
                <div key={key} className="exp-manager-row">
                  <span className="exp-manager-month">{fmtMonth(r.month)}</span>
                  <span className="exp-manager-entity">{r.entity}</span>
                  <span className="exp-manager-amounts">
                    ↑{fmtEur(r.total_ingresos)} ↓{fmtEur(r.total_costes)}
                  </span>
                  <button
                    className="exp-manager-del"
                    onClick={() => handleDelete(r.month, r.entity)}
                    disabled={isDeleting}
                  >{isDeleting ? '…' : '× Borrar'}</button>
                </div>
              )
            })}
            {data.length > 0 && (
              <button
                className="exp-manager-del exp-manager-del--all"
                disabled={!!deletingKey}
                onClick={async () => {
                  if (!window.confirm(`¿Borrar TODOS los datos del banco (${data.length} entradas)? Esta acción no se puede deshacer.`)) return
                  setDeletingKey('__all__')
                  try {
                    const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
                    const res = await fetch(`${CLUB_URL}/wp-json/superadmin/v1/expenses`, {
                      method: 'DELETE', headers: { 'X-WP-Nonce': nonce }
                    })
                    if (!res.ok) throw new Error(`HTTP ${res.status}`)
                    if (onDeleted) onDeleted()
                  } catch (e) { alert(`Error: ${e.message}`) }
                  finally { setDeletingKey(null) }
                }}
              >{deletingKey === '__all__' ? 'Borrando…' : '× Borrar todos los datos'}</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────────────
export default function ExpensesSection() {
  const [months, setMonths]     = useState(6)
  const [refreshKey, setRefresh] = useState(0)

  return (
    <section className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Gastos e ingresos banco</h2>
        <div className="sa-period">
          {[3, 6, 12].map(m => (
            <button
              key={m}
              className={`sa-period__btn${months === m ? ' sa-period__btn--active' : ''}`}
              onClick={() => setMonths(m)}
            >{m} meses</button>
          ))}
        </div>
      </div>

      <UploadPanel onSaved={() => setRefresh(k => k + 1)} />

      <div className="exp-divider" />

      <HistoryView key={refreshKey} months={months} onDeleted={() => setRefresh(k => k + 1)} />
    </section>
  )
}
