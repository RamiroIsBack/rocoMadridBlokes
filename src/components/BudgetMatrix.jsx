import { useState } from 'react'
import { CATEGORIES } from '../utils/expensesParser'
import { sum, round2 } from '../utils/budget'
import { saveBudgetIncome } from '../hooks/useBudget'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MODES = [['ppto', 'Presupuesto'], ['real', 'Real'], ['ambos', 'Ppto vs Real']]
const MODE_KEY = 'bud-matrix-mode'

// Cifra corta sin decimales, con signo menos tipográfico (como el Excel)
const fmt = v => {
  if (Math.abs(v) < 0.5) return '–'
  const s = Math.round(Math.abs(v)).toLocaleString('es-ES', { useGrouping: 'always' })
  return v < 0 ? `−${s}` : s
}
// Real frente a presupuesto: en pagos (negativos) gastar más es peor; en cobros, cobrar menos es peor
const diffCls = (b, r) => {
  const d = r - b
  if (Math.abs(d) <= Math.max(Math.abs(b) * 0.05, 5)) return ''
  return d < 0 ? 'bud-neg' : 'bud-pos'
}

function readMode() {
  try { return localStorage.getItem(MODE_KEY) || 'ambos' } catch { return 'ambos' }
}

// Filas = partidas del Excel. El real del banco va por categoría: si varias partidas comparten
// categoría (p. ej. Nóminas y Nóminas 2), el real de cada mes se reparte según su peso en el
// presupuesto de ese mes (si el mes no tiene presupuesto, va entero a la primera partida).
function buildRows(budget, cats) {
  const byCat = {}
  for (const line of budget.lines) (byCat[line.category] ||= []).push(line)
  const rows = budget.lines.map(line => {
    const c = cats[line.category]
    const siblings = byCat[line.category]
    const real = MONTHS.map((_, i) => {
      if (!c) return 0
      const catBudget = sum(siblings.map(l => Number(l.months[i]) || 0))
      const share = Math.abs(catBudget) > 0.005
        ? (Number(line.months[i]) || 0) / catBudget
        : siblings[0] === line ? 1 : 0
      return round2(c.real[i] * share)
    })
    return {
      key: line.name, name: line.name, note: line.note,
      shared: siblings.length > 1 ? siblings.length : 0,
      budget: line.months.map(v => Number(v) || 0), real,
    }
  })
  // Movimientos del banco en categorías que no tienen ninguna partida en el presupuesto
  for (const [cat, c] of Object.entries(cats)) {
    if (byCat[cat] || c.real.every(v => Math.abs(v) < 0.005)) continue
    rows.push({ key: `x-${cat}`, name: CATEGORIES[cat] || cat, extra: true, budget: Array(12).fill(0), real: c.real.map(round2) })
  }
  return rows
}

// "1.234,56" / "1234.5" / "13,740 €" → número
const parseNum = s => {
  let t = String(s ?? '').replace(/[€\s]/g, '')
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return isFinite(n) ? n : 0
}

export default function BudgetMatrix({ budget, cats, loaded, year, incomeReal, onSaved }) {
  const [mode, setModeState] = useState(readMode)
  const setMode = m => {
    setModeState(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* sin almacenamiento: no pasa nada */ }
  }
  const [draft,  setDraft]  = useState(null)   // null = no se está editando; si no, 12 textos
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const rows = buildRows(budget, cats)
  const has = i => loaded.has(i)
  const totB = MONTHS.map((_, i) => sum(rows.map(r => r.budget[i])))
  const totR = MONTHS.map((_, i) => sum(rows.map(r => r.real[i])))

  // Ingresos: esperado = lo guardado con el presupuesto; real = ventas cobradas en el banco ese mes
  const incB = MONTHS.map((_, i) => Number(budget.income?.[i]) || 0)
  const incR = MONTHS.map((_, i) => Number(incomeReal[`${year}-${String(i + 1).padStart(2, '0')}`]) || 0)
  const hasIncome = incB.some(v => Math.abs(v) > 0.005)
  const resB = MONTHS.map((_, i) => incB[i] + totB[i])
  const resR = MONTHS.map((_, i) => incR[i] + totR[i])

  const startEdit = () => { setError(''); setDraft(incB.map(v => (v ? String(Math.round(v * 100) / 100).replace('.', ',') : ''))) }
  // Pegar una fila copiada del Excel (12 celdas separadas por tabulador) en cualquier casilla
  const onPaste = (i, e) => {
    const parts = e.clipboardData.getData('text').trim().split(/\t|;|\r?\n/)
    if (parts.length < 2) return
    e.preventDefault()
    setDraft(d => d.map((v, j) => (j >= i && j - i < parts.length ? parts[j - i].trim() : v)))
  }
  async function saveIncome() {
    setSaving(true)
    setError('')
    try {
      const json = await saveBudgetIncome(budget, draft.map(parseNum))
      // Un plugin antiguo en el servidor acepta la petición pero descarta los ingresos
      if (!Array.isArray(json?.budget?.income)) throw new Error('el servidor todavía no guarda ingresos (falta actualizar el plugin)')
      setDraft(null)
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }
  // El total del real solo suma meses con extracto; el del presupuesto, el año entero
  const yearB = sum(totB)
  const yearR = sum(totR.filter((_, i) => has(i)))
  const yearBLoaded = sum(totB.filter((_, i) => has(i)))

  const cell = (b, r, i, strong) => {
    const cls = strong ? 'sa-pay-strong' : ''
    if (mode === 'ppto') return <td key={i} className={`sa-pay-num ${cls}`}>{fmt(b)}</td>
    if (mode === 'real') return <td key={i} className={`sa-pay-num ${cls}`}>{has(i) ? fmt(r) : '—'}</td>
    return (
      <td key={i} className={`sa-pay-num bud-mx-both ${cls}`} title={has(i) ? `Diferencia ${fmt(r - b)}` : 'Sin extracto del banco'}>
        <span className="bud-mx-b">{fmt(b)}</span>
        <span className={`bud-mx-r ${has(i) ? diffCls(b, r) : ''}`}>{has(i) ? fmt(r) : '—'}</span>
      </td>
    )
  }
  // Total del año: presupuesto completo arriba; real de los meses con banco, comparado con su presupuesto
  const totalCell = (b, r, rLoadedB) => (
    mode === 'ppto' ? <td className="sa-pay-num sa-pay-strong">{fmt(b)}</td>
      : mode === 'real' ? <td className="sa-pay-num sa-pay-strong">{loaded.size ? fmt(r) : '—'}</td>
      : (
        <td className="sa-pay-num bud-mx-both sa-pay-strong" title={loaded.size ? `Presupuesto de los meses con banco ${fmt(rLoadedB)}` : ''}>
          <span className="bud-mx-b">{fmt(b)}</span>
          <span className={`bud-mx-r ${loaded.size ? diffCls(rLoadedB, r) : ''}`}>{loaded.size ? fmt(r) : '—'}</span>
        </td>
      )
  )

  return (
    <>
      <div className="bud-mx-bar">
        <div className="sa-pl-tabs sa-sub-tabs bud-mx-modes">
          {MODES.map(([k, l]) => (
            <button key={k} className={`sa-pl-tab${mode === k ? ' sa-pl-tab--active' : ''}`} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        {mode === 'ambos' && (
          <span className="bud-small sa-pay-muted">
            Arriba presupuesto · abajo real del banco (<span className="bud-neg">rojo</span> = peor de lo previsto, <span className="bud-pos">verde</span> = mejor)
          </span>
        )}
      </div>
      <div className="sa-pay-scroll">
        <table className="sa-pay-table bud-matrix">
          <thead>
            <tr>
              <th className="bud-mx-name">Partida</th>
              {MONTHS.map((mm, i) => <th key={mm} className={`sa-pay-num${has(i) ? '' : ' sa-pay-muted'}`}>{mm}</th>)}
              <th className="sa-pay-num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bud-mx-section"><td className="bud-mx-name" colSpan={14}>Ingresos</td></tr>
            <tr className="bud-mx-income">
              <td className="bud-mx-name">
                Ingresos esperados
                {!draft && (
                  <button className="bud-mx-edit" onClick={startEdit} title="Editar los ingresos esperados de cada mes">
                    ✎ {hasIncome ? 'Editar' : 'Añadir'}
                  </button>
                )}
              </td>
              {draft
                ? draft.map((v, i) => (
                  <td key={i} className="sa-pay-num">
                    <input className="bud-mx-input" inputMode="decimal" value={v} aria-label={`Ingresos esperados ${MONTHS[i]}`}
                           onChange={e => setDraft(d => d.map((x, j) => (j === i ? e.target.value : x)))}
                           onPaste={e => onPaste(i, e)} />
                  </td>
                ))
                : MONTHS.map((_, i) => cell(incB[i], incR[i], i))}
              {draft
                ? <td className="sa-pay-num sa-pay-strong">{fmt(sum(draft.map(parseNum)))}</td>
                : totalCell(sum(incB), sum(incR.filter((_, i) => has(i))), sum(incB.filter((_, i) => has(i))))}
            </tr>
            {draft && (
              <tr>
                <td colSpan={14}>
                  <div className="bud-mx-editbar">
                  <button className="sa-pay-action bud-primary" onClick={saveIncome} disabled={saving}>{saving ? 'Guardando…' : 'Guardar ingresos'}</button>
                  <button className="sa-pay-action" onClick={() => setDraft(null)} disabled={saving}>Cancelar</button>
                  <span className="bud-small sa-pay-muted">Puedes copiar la fila de 12 meses del Excel y pegarla en la casilla de enero.</span>
                  {error && <span className="sa-error bud-small">Error: {error}</span>}
                  </div>
                </td>
              </tr>
            )}
            <tr className="bud-mx-section"><td className="bud-mx-name" colSpan={14}>Pagos</td></tr>
            {rows.map(r => {
              const rYear = sum(r.real.filter((_, i) => has(i)))
              const bYearLoaded = sum(r.budget.filter((_, i) => has(i)))
              return (
                <tr key={r.key} className={r.extra ? 'bud-mx-extra' : ''}>
                  <td className="bud-mx-name" title={r.note || ''}>
                    {r.name}
                    {r.extra && <span className="sa-pay-tag">sin presupuesto</span>}
                    {r.shared > 0 && mode !== 'ppto' && <span className="bud-mx-shared" title="El real del banco se reparte entre las partidas de la misma categoría según su presupuesto">⇄</span>}
                  </td>
                  {MONTHS.map((_, i) => cell(r.budget[i], r.real[i], i))}
                  {totalCell(sum(r.budget), rYear, bYearLoaded)}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="sa-pay-total">
              <td className="bud-mx-name">Subtotal pagos</td>
              {MONTHS.map((_, i) => cell(totB[i], totR[i], i, true))}
              {totalCell(yearB, yearR, yearBLoaded)}
            </tr>
            {hasIncome && (
              <tr className="sa-pay-total bud-mx-result">
                <td className="bud-mx-name">Resultado (ingresos − pagos)</td>
                {MONTHS.map((_, i) => cell(resB[i], resR[i], i, true))}
                {totalCell(sum(resB), sum(resR.filter((_, i) => has(i))), sum(resB.filter((_, i) => has(i))))}
              </tr>
            )}
            {hasIncome && resB.some(v => v < -0.5) && (
              <tr className="bud-mx-goal">
                <td className="bud-mx-name" title="En los meses en que lo esperado no cubre los pagos: lo mínimo que habría que cobrar para no perder dinero ese mes">
                  🎯 Objetivo para cubrir el mes
                </td>
                {MONTHS.map((_, i) => {
                  if (resB[i] >= -0.5) return <td key={i} className="sa-pay-num sa-pay-muted">—</td>
                  const goal = -totB[i]
                  const reached = has(i) && incR[i] >= goal - 0.5
                  return (
                    <td key={i} className="sa-pay-num bud-mx-both"
                        title={has(i) ? `Cobrado ${fmt(incR[i])} · ${reached ? 'objetivo cumplido' : `faltan ${fmt(goal - incR[i])}`}` : `Esperado ${fmt(incB[i])} · faltan ${fmt(goal - incB[i])}`}>
                      <span className="bud-mx-r">{fmt(goal)}</span>
                      <span className={`bud-mx-b ${has(i) ? (reached ? 'bud-pos' : 'bud-neg') : ''}`}>
                        {has(i) ? (reached ? '✓ cumplido' : `faltan ${fmt(goal - incR[i])}`) : `+${fmt(goal - incB[i])} sobre lo esperado`}
                      </span>
                    </td>
                  )
                })}
                <td className="sa-pay-num sa-pay-muted">—</td>
              </tr>
            )}
            {mode === 'ambos' && (
              <tr className="bud-mx-diff">
                <td className="bud-mx-name">Diferencia pagos (real − ppto)</td>
                {MONTHS.map((_, i) => (
                  <td key={i} className={`sa-pay-num ${has(i) ? diffCls(totB[i], totR[i]) : 'sa-pay-muted'}`}>
                    {has(i) ? fmt(totR[i] - totB[i]) : '—'}
                  </td>
                ))}
                <td className={`sa-pay-num sa-pay-strong ${loaded.size ? diffCls(yearBLoaded, yearR) : ''}`}>
                  {loaded.size ? fmt(yearR - yearBLoaded) : '—'}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      <p className="sa-pay-note">
        Igual que el Excel: una fila por partida y una columna por mes, en euros sin decimales.
        Ingresos reales = todo lo cobrado por ventas en el banco (cuotas, TPV, Bizum, Wellhub, transferencias), sin separar por clase.
        🎯 En los meses en que lo esperado no llega a los pagos, el objetivo es lo mínimo a cobrar para no perder dinero ese mes.
        Los meses en gris aún no tienen extracto del banco. El total del real suma solo esos meses y se compara
        con el presupuesto de los mismos meses. ⇄ = varias partidas comparten categoría del banco y el real se reparte
        entre ellas según su presupuesto. Esta vista no aplica el arrastre; para eso está "Por mes".
      </p>
    </>
  )
}
