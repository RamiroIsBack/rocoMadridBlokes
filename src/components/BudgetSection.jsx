import { useState, useMemo, useRef, useEffect } from 'react'
import { useBudget, saveBudget, getExpenseRules, saveExpenseRules, setItemCategory } from '../hooks/useBudget'
import { CATEGORIES, SALES_CATEGORIES, conceptKey } from '../utils/expensesParser'
import {
  parseBudgetFile, buildComparison, statusOf, STATUS_LABELS, TOLERANCE_PCT, TOLERANCE_MIN, sum, round2, signedAmount,
} from '../utils/budget'
import { monthLabel, fmtEur } from '../utils/monthFormat'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const CATEGORY_OPTIONS = Object.entries(CATEGORIES).filter(([k]) => !SALES_CATEGORIES.includes(k))
const catLabel = cat => CATEGORIES[cat] || cat
const pad = n => String(n).padStart(2, '0')

function fmtDiff(v) {
  if (Math.abs(v) < 0.005) return fmtEur(0)
  return `${v > 0 ? '+' : '−'}${fmtEur(Math.abs(v))}`
}

// Pago presupuestado que aún no aparece en el banco: no es un ahorro, solo está pendiente
const isPending = (b, r) => b < -0.005 && Math.abs(r) < 0.005
const diffClass = (b, r) => isPending(b, r) ? 'sa-pay-muted' : r - b > 0.005 ? 'bud-pos' : r - b < -0.005 ? 'bud-neg' : ''

function Status({ status }) {
  if (!status) return null
  const s = STATUS_LABELS[status]
  return <span className={`bud-status bud-status--${status}`}>{s.icon} {s.label}</span>
}

function CategorySelect({ value, onChange, disabled }) {
  return (
    <select className="bud-select" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
      {CATEGORY_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      {!CATEGORIES[value] && <option value={value}>{value}</option>}
    </select>
  )
}

// ─── Movimientos del banco con selector de categoría ─────────────────────────
function ItemsTable({ items, onRecategorize, busyKey, showMonth }) {
  if (!items.length) return <p className="sa-pay-note">No hay movimientos del banco en esta partida.</p>
  return (
    <table className="sa-pay-table bud-items">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Concepto</th>
          <th className="sa-pay-num">Importe</th>
          <th>Categoría</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          const key = `${item.month}|${item.entity}|${item.key}`
          return (
            <tr key={key}>
              <td className="sa-pay-nowrap">{showMonth ? item.fecha || item.month : item.fecha}</td>
              <td>{item.concepto}</td>
              <td className={`sa-pay-num ${signedAmount(item) < 0 ? 'bud-neg' : 'bud-pos'}`}>{fmtEur(signedAmount(item))}</td>
              <td>
                <CategorySelect value={item.category} disabled={busyKey === key} onChange={cat => onRecategorize(item, cat)} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Importar el Excel del presupuesto ───────────────────────────────────────
function BudgetImport({ year, current, onSaved, onClose }) {
  const fileRef = useRef()
  const [lines,  setLines]  = useState(null)
  const [file,   setFile]   = useState('')
  const [error,  setError]  = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleFile(e) {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    try {
      const parsed = await parseBudgetFile(f)
      // Si ya había presupuesto, se respetan las categorías elegidas antes para las partidas con el mismo nombre
      const prev = Object.fromEntries((current?.lines || []).map(l => [l.name, l.category]))
      setLines(parsed.map(l => ({ ...l, category: prev[l.name] || l.category })))
      setFile(f.name)
    } catch (err) {
      setLines(null)
      setError(err.message)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveBudget(year, lines, file)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const monthTotals = lines ? Array.from({ length: 12 }, (_, i) => sum(lines.map(l => l.months[i]))) : []

  return (
    <div className="bud-import">
      <div className="sa-pay-actions" style={{ marginTop: 0 }}>
        <button className="sa-pay-action" onClick={() => fileRef.current?.click()}>📂 Elegir archivo (Excel o CSV)</button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
        {file && <span className="sa-pay-muted bud-small">{file}</span>}
        <button className="sa-pay-action" onClick={onClose}>Cancelar</button>
      </div>
      <p className="sa-pay-note">
        Una fila por partida y una columna por mes (ene … dic). Pagos en negativo y cobros en positivo, como en tu Excel.
        Las filas de subtotal o total se ignoran.
      </p>
      {error && <p className="sa-error">Error: {error}</p>}

      {lines && (
        <>
          <h3 className="sa-pay-subtitle">Vista previa · {lines.length} partidas</h3>
          <div className="sa-pay-scroll">
            <table className="sa-pay-table">
              <thead>
                <tr>
                  <th>Partida del Excel</th>
                  <th>Categoría del banco</th>
                  <th className="sa-pay-num">Total {year}</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="sa-pay-strong">{l.name}</td>
                    <td>
                      <CategorySelect
                        value={l.category}
                        onChange={cat => setLines(ls => ls.map((x, j) => j === i ? { ...x, category: cat } : x))}
                      />
                    </td>
                    <td className={`sa-pay-num ${sum(l.months) < -0.005 ? 'bud-neg' : sum(l.months) > 0.005 ? 'bud-pos' : 'sa-pay-muted'}`}>{fmtEur(sum(l.months))}</td>
                    <td className="sa-pay-muted bud-small">{l.note}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="sa-pay-total">
                  <td colSpan={2}>Total del año</td>
                  <td className="sa-pay-num">{fmtEur(sum(monthTotals))}</td>
                  <td className="sa-pay-muted bud-small">Media mensual {fmtEur(sum(monthTotals) / 12)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="sa-pay-actions">
            <button className="sa-pay-action bud-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : current ? `Reemplazar presupuesto ${year}` : `Guardar presupuesto ${year}`}
            </button>
            <span className="sa-pay-note" style={{ margin: 0 }}>
              Si una partida cae en "Otros", elige su categoría para que se pueda cruzar con el banco.
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Reglas aprendidas ───────────────────────────────────────────────────────
function LearnedRules() {
  const [open,  setOpen]  = useState(false)
  const [rules, setRules] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || rules) return
    getExpenseRules().then(setRules).catch(e => setError(e.message))
  }, [open, rules])

  async function remove(key) {
    try { setRules(await saveExpenseRules({ [key]: null })) } catch (e) { setError(e.message) }
  }

  const entries = rules ? Object.entries(rules).sort(([a], [b]) => a.localeCompare(b)) : []

  return (
    <div className="bud-rules">
      <button className="sa-pay-action" onClick={() => setOpen(o => !o)}>
        {open ? '▾' : '▸'} Reglas aprendidas del banco{rules ? ` (${entries.length})` : ''}
      </button>
      {open && (
        <>
          <p className="sa-pay-note">
            Cada vez que cambias a mano la categoría de un movimiento, se recuerda aquí y se aplica sola en las
            próximas importaciones del banco. Bórrala si se aprendió mal.
          </p>
          {error && <p className="sa-error">Error: {error}</p>}
          {rules && !entries.length && <p className="sa-pay-empty sa-pay-muted">Todavía no hay reglas aprendidas.</p>}
          {entries.length > 0 && (
            <table className="sa-pay-table">
              <thead><tr><th>Concepto del banco</th><th>Tipo</th><th>Categoría</th><th></th></tr></thead>
              <tbody>
                {entries.map(([key, cat]) => (
                  <tr key={key}>
                    <td>{key.slice(1)}</td>
                    <td className="sa-pay-muted">{key[0] === '+' ? 'Cobro' : 'Pago'}</td>
                    <td>{catLabel(cat)}</td>
                    <td><button className="sa-pay-action" onClick={() => remove(key)} title="Borrar regla">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sección principal ───────────────────────────────────────────────────────
export default function BudgetSection() {
  const [year, setYear]         = useState(2027)
  const { data, loading, error, reload } = useBudget(year)
  const [view, setView]         = useState('mes')
  const [month, setMonth]       = useState(null)   // 0..11
  const [expanded, setExpanded] = useState(new Set())
  const [showImport, setShowImport] = useState(false)
  const [busyKey, setBusyKey]   = useState(null)
  const [feedback, setFeedback] = useState('')

  const budget = data?.budget || null
  const { cats, loaded } = useMemo(
    () => buildComparison(budget, data?.items || [], data?.months_loaded || [], year),
    [budget, data, year],
  )

  // Mes por defecto: el último con extracto del banco; si no hay, el actual (o enero si es otro año)
  useEffect(() => {
    if (!data) return
    const now = new Date()
    const fallback = now.getFullYear() === year ? now.getMonth() : 0
    setMonth(loaded.size ? Math.max(...loaded) : fallback)
  }, [data, year]) // eslint-disable-line react-hooks/exhaustive-deps

  async function recategorize(item, category) {
    const key = `${item.month}|${item.entity}|${item.key}`
    setBusyKey(key)
    setFeedback('')
    try {
      await setItemCategory(item, category, conceptKey(item.concepto, item.section === 'ingresos'))
      await reload()
      setFeedback(`"${item.concepto}" → ${catLabel(category)}. Se recordará en las próximas importaciones.`)
    } catch (e) {
      setFeedback(`Error: ${e.message}`)
    } finally {
      setBusyKey(null)
    }
  }

  const toggle = cat => setExpanded(s => {
    const n = new Set(s)
    n.has(cat) ? n.delete(cat) : n.add(cat)
    return n
  })

  // ── Filas del mes seleccionado ──
  const m = month ?? 0
  const monthRows = Object.entries(cats)
    .map(([cat, c]) => ({ cat, ...c, b: c.budget[m], r: round2(c.real[m]), list: c.items[m] }))
    .filter(row => Math.abs(row.b) > 0.005 || Math.abs(row.r) > 0.005)
    .sort((a, b) => a.b - b.b || a.r - b.r)
  const hasMonth = loaded.has(m)
  const mBudget  = sum(monthRows.map(r => r.b))
  const mReal    = sum(monthRows.map(r => r.r))

  // ── Acumulado: solo meses con extracto del banco ──
  const loadedIdx = [...loaded]
  const ytdBudget = sum(Object.values(cats).map(c => sum(loadedIdx.map(i => c.budget[i]))))
  const ytdReal   = sum(Object.values(cats).map(c => sum(loadedIdx.map(i => c.real[i]))))
  const mPending   = sum(monthRows.filter(r => isPending(r.b, r.r)).map(r => -r.b))
  const ytdPending = sum(Object.values(cats).map(c => sum(loadedIdx.map(i => isPending(c.budget[i], c.real[i]) ? -c.budget[i] : 0))))
  const yearBudget = sum(Object.values(cats).map(c => sum(c.budget)))

  // ── Imprevistos: movimientos en categorías sin presupuesto en todo el año, u "Otros" ──
  const unbudgeted = Object.entries(cats)
    .filter(([cat, c]) => cat === 'otros' || c.budget.every(v => Math.abs(v) < 0.005))
    .flatMap(([, c]) => c.items.flat())
    .sort((a, b) => a.month.localeCompare(b.month) || signedAmount(a) - signedAmount(b))

  const lastLoaded = loadedIdx.length ? Math.max(...loadedIdx) : null

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Presupuesto de pagos {year}</h2>
        <div className="sa-header-controls">
          <button className="sa-pay-action" onClick={() => setShowImport(s => !s)}>
            ⬆ {budget ? 'Actualizar presupuesto' : 'Subir presupuesto'} (Excel)
          </button>
          <button className="sa-period__btn" onClick={() => setYear(y => y - 1)} aria-label="Año anterior">◀</button>
          <span className="sa-pay-month">{year}</span>
          <button className="sa-period__btn" onClick={() => setYear(y => y + 1)} aria-label="Año siguiente">▶</button>
        </div>
      </div>

      {showImport && (
        <BudgetImport
          year={year}
          current={budget}
          onClose={() => setShowImport(false)}
          onSaved={() => { setShowImport(false); reload() }}
        />
      )}

      {loading && !data ? <p className="sa-loading">Cargando…</p>
        : error ? <p className="sa-error">Error: {error}</p>
        : !budget ? (
          !showImport && (
            <p className="sa-pay-note">
              Todavía no hay presupuesto para {year}. Pulsa "Subir presupuesto" y elige tu Excel.
            </p>
          )
        ) : (
          <>
            <p className="sa-pay-note" style={{ marginTop: 0 }}>
              Presupuesto: {budget.file || 'archivo'} · {budget.lines.length} partidas · total año {fmtEur(yearBudget)}.
              {' '}Extractos del banco cargados: {loadedIdx.length
                ? `${loadedIdx.length} ${loadedIdx.length === 1 ? 'mes' : 'meses'} (hasta ${monthLabel(`${year}-${pad(lastLoaded + 1)}`)})`
                : 'ninguno todavía (se suben en "Gastos banco")'}.
            </p>

            {/* ── Resumen ── */}
            <div className="sa-kpis">
              <div className="sa-kpi" style={{ '--kpi-color': '#a78bfa' }}>
                <span className="sa-kpi__value">{fmtEur(mBudget)}</span>
                <span className="sa-kpi__label">Presupuesto · {MONTHS[m]}</span>
              </div>
              <div className="sa-kpi" style={{ '--kpi-color': '#60a5fa' }}>
                <span className="sa-kpi__value">{hasMonth ? fmtEur(mReal) : '—'}</span>
                <span className="sa-kpi__label">Real banco · {MONTHS[m]}</span>
              </div>
              <div className="sa-kpi" style={{ '--kpi-color': !hasMonth ? '#555' : mReal - mBudget >= 0 ? '#34d399' : '#f87171' }}>
                <span className="sa-kpi__value">{hasMonth ? fmtDiff(mReal - mBudget) : '—'}</span>
                <span className="sa-kpi__label">
                  {!hasMonth ? 'Diferencia del mes' : mReal - mBudget >= 0 ? 'Ahorro del mes' : 'Sobrecoste del mes'}
                  {hasMonth && mPending > 0.005 && <> · incluye {fmtEur(mPending)} sin movimiento</>}
                </span>
              </div>
              <div className="sa-kpi" style={{ '--kpi-color': !loadedIdx.length ? '#555' : ytdReal - ytdBudget >= 0 ? '#34d399' : '#f87171' }}>
                <span className="sa-kpi__value">{loadedIdx.length ? fmtDiff(ytdReal - ytdBudget) : '—'}</span>
                <span className="sa-kpi__label">
                  Acumulado del año {loadedIdx.length ? `(${loadedIdx.length} ${loadedIdx.length === 1 ? 'mes' : 'meses'})` : ''}
                  {ytdPending > 0.005 && <> · incluye {fmtEur(ytdPending)} sin movimiento</>}
                </span>
              </div>
            </div>

            <div className="sa-pl-tabs">
              {[['mes', 'Por mes'], ['anual', 'Año completo'], ['imprevistos', `Imprevistos (${unbudgeted.length})`]].map(([k, l]) => (
                <button key={k} className={`sa-pl-tab${view === k ? ' sa-pl-tab--active' : ''}`} onClick={() => setView(k)}>{l}</button>
              ))}
            </div>

            {feedback && <p className={feedback.startsWith('Error') ? 'sa-error' : 'sa-pay-feedback'}>{feedback}</p>}

            {/* ── Vista por mes ── */}
            {view === 'mes' && (
              <>
                <div className="bud-month-nav">
                  <button className="sa-period__btn" onClick={() => setMonth(x => Math.max(0, x - 1))} disabled={m === 0} aria-label="Mes anterior">◀</button>
                  <span className="sa-pay-month">{monthLabel(`${year}-${pad(m + 1)}`)}</span>
                  <button className="sa-period__btn" onClick={() => setMonth(x => Math.min(11, x + 1))} disabled={m === 11} aria-label="Mes siguiente">▶</button>
                  {!hasMonth && <span className="sa-pay-warn bud-small">Aún no hay extracto del banco de este mes</span>}
                </div>
                <div className="sa-pay-scroll">
                  <table className="sa-pay-table">
                    <thead>
                      <tr>
                        <th>Partida</th>
                        <th className="sa-pay-num">Presupuesto</th>
                        <th className="sa-pay-num">Real banco</th>
                        <th className="sa-pay-num">Diferencia</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map(row => {
                        const diff = row.r - row.b
                        const open = expanded.has(row.cat)
                        return [
                          <tr key={row.cat} className="bud-row" onClick={() => toggle(row.cat)}>
                            <td>
                              <span className="bud-caret">{open ? '▾' : '▸'}</span>
                              <span className="sa-pay-strong">{catLabel(row.cat)}</span>
                              {row.list.length > 0 && <span className="sa-pay-tag">{row.list.length} mov.</span>}
                              {row.lines.length > 0 && <div className="bud-lines">{row.lines.join(' · ')}</div>}
                            </td>
                            <td className="sa-pay-num">{fmtEur(row.b)}</td>
                            <td className="sa-pay-num">{hasMonth ? fmtEur(row.r) : '—'}</td>
                            <td className={`sa-pay-num ${!hasMonth ? '' : diffClass(row.b, row.r)}`}>
                              {hasMonth ? fmtDiff(diff) : '—'}
                            </td>
                            <td><Status status={statusOf(row.b, row.r, hasMonth)} /></td>
                          </tr>,
                          open && (
                            <tr key={`${row.cat}-items`} className="bud-detail">
                              <td colSpan={5}>
                                <ItemsTable items={row.list} onRecategorize={recategorize} busyKey={busyKey} />
                              </td>
                            </tr>
                          ),
                        ]
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="sa-pay-total">
                        <td>Total del mes</td>
                        <td className="sa-pay-num">{fmtEur(mBudget)}</td>
                        <td className="sa-pay-num">{hasMonth ? fmtEur(mReal) : '—'}</td>
                        <td className={`sa-pay-num ${!hasMonth ? '' : mReal - mBudget >= 0 ? 'bud-pos' : 'bud-neg'}`}>
                          {hasMonth ? fmtDiff(mReal - mBudget) : '—'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="sa-pay-note">
                  Pulsa una partida para ver los movimientos del banco que la forman y corregir su categoría.
                  "Cumplido" admite un margen de ±{Math.round(TOLERANCE_PCT * 100)} % (mínimo {TOLERANCE_MIN} €).
                  "Sin movimiento" = estaba presupuestado y no aparece en el banco (puede llegar el mes siguiente).
                </p>
              </>
            )}

            {/* ── Vista anual ── */}
            {view === 'anual' && (
              <>
                <div className="sa-pay-scroll">
                  <table className="sa-pay-table bud-year">
                    <thead>
                      <tr>
                        <th>Partida</th>
                        <th className="sa-pay-num">Presup. año</th>
                        <th className="sa-pay-num">Presup. a la fecha</th>
                        <th className="sa-pay-num">Real a la fecha</th>
                        <th className="sa-pay-num">Diferencia</th>
                        <th>Estado</th>
                        {MONTHS.map((mm, i) => <th key={mm} className="sa-pay-num" title="Diferencia del mes">{mm}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cats)
                        .map(([cat, c]) => ({
                          cat, c,
                          by: sum(loadedIdx.map(i => c.budget[i])),
                          ry: round2(sum(loadedIdx.map(i => c.real[i]))),
                          total: sum(c.budget),
                        }))
                        .filter(r => Math.abs(r.total) > 0.005 || Math.abs(r.ry) > 0.005)
                        .sort((a, b) => a.total - b.total || a.ry - b.ry)
                        .map(({ cat, c, by, ry, total }) => (
                          <tr key={cat}>
                            <td>
                              <span className="sa-pay-strong">{catLabel(cat)}</span>
                              {c.lines.length > 0 && <div className="bud-lines">{c.lines.join(' · ')}</div>}
                            </td>
                            <td className="sa-pay-num">{fmtEur(total)}</td>
                            <td className="sa-pay-num">{loadedIdx.length ? fmtEur(by) : '—'}</td>
                            <td className="sa-pay-num">{loadedIdx.length ? fmtEur(ry) : '—'}</td>
                            <td className={`sa-pay-num ${!loadedIdx.length ? '' : diffClass(by, ry)}`}>
                              {loadedIdx.length ? fmtDiff(ry - by) : '—'}
                            </td>
                            <td><Status status={statusOf(by, ry, loadedIdx.length > 0)} /></td>
                            {MONTHS.map((mm, i) => {
                              if (!loaded.has(i)) return <td key={mm} className="sa-pay-num sa-pay-muted">—</td>
                              const d = c.real[i] - c.budget[i]
                              return (
                                <td key={mm} className={`sa-pay-num bud-cell ${diffClass(c.budget[i], c.real[i]) || 'sa-pay-muted'}`}
                                    title={`Presupuesto ${fmtEur(c.budget[i])} · Real ${fmtEur(c.real[i])}${isPending(c.budget[i], c.real[i]) ? ' · sin movimiento' : ''}`}>
                                  {Math.abs(d) < 0.5 ? '0' : `${d > 0 ? '+' : '−'}${Math.round(Math.abs(d)).toLocaleString('es-ES', { useGrouping: 'always' })}`}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="sa-pay-total">
                        <td>Total</td>
                        <td className="sa-pay-num">{fmtEur(yearBudget)}</td>
                        <td className="sa-pay-num">{loadedIdx.length ? fmtEur(ytdBudget) : '—'}</td>
                        <td className="sa-pay-num">{loadedIdx.length ? fmtEur(ytdReal) : '—'}</td>
                        <td className={`sa-pay-num ${!loadedIdx.length ? '' : ytdReal - ytdBudget >= 0 ? 'bud-pos' : 'bud-neg'}`}>
                          {loadedIdx.length ? fmtDiff(ytdReal - ytdBudget) : '—'}
                        </td>
                        <td></td>
                        {MONTHS.map((mm, i) => {
                          if (!loaded.has(i)) return <td key={mm} className="sa-pay-num sa-pay-muted">—</td>
                          const d = sum(Object.values(cats).map(c => c.real[i] - c.budget[i]))
                          return (
                            <td key={mm} className={`sa-pay-num bud-cell ${d >= 0 ? 'bud-pos' : 'bud-neg'}`}>
                              {`${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d)).toLocaleString('es-ES', { useGrouping: 'always' })}`}
                            </td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="sa-pay-note">
                  "A la fecha" suma solo los meses con extracto del banco cargado. Las columnas de meses muestran la
                  diferencia en euros (verde = ahorro, rojo = sobrecoste). Pasa el ratón por una cifra para ver el detalle.
                </p>
              </>
            )}

            {/* ── Imprevistos ── */}
            {view === 'imprevistos' && (
              <>
                <p className="sa-pay-note" style={{ marginTop: 0 }}>
                  Movimientos del banco que no encajan en ninguna partida del presupuesto (o que están en "Otros").
                  Si alguno pertenece a una partida, cámbialo de categoría y se recordará para las próximas importaciones.
                </p>
                {unbudgeted.length
                  ? <ItemsTable items={unbudgeted} onRecategorize={recategorize} busyKey={busyKey} showMonth />
                  : <p className="sa-pay-empty sa-pay-muted">No hay gastos imprevistos en {year}.</p>}
                {unbudgeted.length > 0 && (
                  <p className="sa-pay-note">Total imprevistos: <strong>{fmtEur(sum(unbudgeted.map(signedAmount)))}</strong></p>
                )}
              </>
            )}
          </>
        )}

      <LearnedRules />
    </div>
  )
}
