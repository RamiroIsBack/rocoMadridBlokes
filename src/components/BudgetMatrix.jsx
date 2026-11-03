import { useState } from 'react'
import { CATEGORIES } from '../utils/expensesParser'
import { sum, round2 } from '../utils/budget'

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

export default function BudgetMatrix({ budget, cats, loaded }) {
  const [mode, setModeState] = useState(readMode)
  const setMode = m => {
    setModeState(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* sin almacenamiento: no pasa nada */ }
  }

  const rows = buildRows(budget, cats)
  const has = i => loaded.has(i)
  const totB = MONTHS.map((_, i) => sum(rows.map(r => r.budget[i])))
  const totR = MONTHS.map((_, i) => sum(rows.map(r => r.real[i])))
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
            {mode === 'ambos' && (
              <tr className="bud-mx-diff">
                <td className="bud-mx-name">Diferencia (real − ppto)</td>
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
        Los meses en gris aún no tienen extracto del banco. El total del real suma solo esos meses y se compara
        con el presupuesto de los mismos meses. ⇄ = varias partidas comparten categoría del banco y el real se reparte
        entre ellas según su presupuesto. Esta vista no aplica el arrastre; para eso está "Por mes".
      </p>
    </>
  )
}
