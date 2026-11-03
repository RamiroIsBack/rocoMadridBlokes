import { useState } from 'react'
import { CATEGORIES } from '../utils/expensesParser'
import { sum, round2, incomeTargets, INCOME_TARGET } from '../utils/budget'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MODES = [['ppto', 'Presupuesto'], ['real', 'Real'], ['ambos', 'Ppto vs Real']]
const MODE_KEY = 'bud-matrix-mode'
const pct = v => `${Math.round(v * 100)} %`

// Cifra corta sin decimales, con signo menos tipográfico (como el Excel)
const fmt = v => {
  if (Math.abs(v) < 0.5) return '–'
  const s = Math.round(Math.abs(v)).toLocaleString('es-ES', { useGrouping: 'always' })
  return v < 0 ? `−${s}` : s
}
// Real frente a presupuesto: en pagos (negativos) gastar más es peor
const diffCls = (b, r) => {
  const d = r - b
  if (Math.abs(d) <= Math.max(Math.abs(b) * 0.05, 5)) return ''
  return d < 0 ? 'bud-neg' : 'bud-pos'
}
const signCls = v => (v < -0.5 ? 'bud-neg' : v > 0.5 ? 'bud-pos' : '')

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

  // Objetivo de ingresos (informativo): se calcula con los pagos del presupuesto, no se guarda
  const goalIn = incomeTargets(totB)
  const result = MONTHS.map((_, i) => goalIn[i] + totB[i])
  const accum  = result.reduce((acc, v, i) => [...acc, (acc[i - 1] || 0) + v], [])
  const shortMonths = result.map((v, i) => (v < -0.5 ? i : null)).filter(i => i !== null)

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
            Pagos: arriba presupuesto · abajo real del banco (<span className="bud-neg">rojo</span> = peor de lo previsto, <span className="bud-pos">verde</span> = mejor)
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
            <tr className="bud-mx-section"><td colSpan={14}><span className="bud-mx-sec">Pagos</span></td></tr>
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

            {/* ── Objetivo de ingresos (informativo) ── */}
            <tr className="bud-mx-section"><td colSpan={14}><span className="bud-mx-sec">Objetivo de ingresos</span></td></tr>
            <tr className="bud-mx-income">
              <td className="bud-mx-name" title="Lo que hay que cobrar cada mes para cubrir los pagos del año">Ingresos objetivo</td>
              {goalIn.map((v, i) => <td key={i} className="sa-pay-num sa-pay-strong">{fmt(v)}</td>)}
              <td className="sa-pay-num sa-pay-strong">{fmt(sum(goalIn))}</td>
            </tr>
            <tr className="bud-mx-result">
              <td className="bud-mx-name">Resultado previsto (objetivo − pagos)</td>
              {result.map((v, i) => <td key={i} className={`sa-pay-num ${signCls(v)}`}>{fmt(v)}</td>)}
              <td className={`sa-pay-num sa-pay-strong ${signCls(sum(result))}`}>{fmt(sum(result))}</td>
            </tr>
            <tr>
              <td className="bud-mx-name sa-pay-muted">Acumulado del año</td>
              {accum.map((v, i) => <td key={i} className={`sa-pay-num ${signCls(v)}`}>{fmt(v)}</td>)}
              <td className="sa-pay-num sa-pay-muted">—</td>
            </tr>
            {shortMonths.length > 0 && (
              <tr className="bud-mx-goal">
                <td className="bud-mx-name" title="En los meses en que el objetivo no llega a los pagos: lo mínimo que habría que cobrar para no perder dinero ese mes">
                  🎯 Objetivo para cubrir el mes
                </td>
                {MONTHS.map((_, i) => {
                  if (!shortMonths.includes(i)) return <td key={i} className="sa-pay-num sa-pay-muted">—</td>
                  return (
                    <td key={i} className="sa-pay-num bud-mx-both" title={`Para no perder dinero en ${MONTHS[i]} hay que cobrar ${fmt(-totB[i])}: ${fmt(-totB[i] - goalIn[i])} más que el objetivo`}>
                      <span className="bud-mx-r">{fmt(-totB[i])}</span>
                      <span className="bud-mx-b">faltan {fmt(-totB[i] - goalIn[i])}</span>
                    </td>
                  )
                })}
                <td className="sa-pay-num sa-pay-muted">—</td>
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
      <p className="sa-pay-note">
        <strong>Objetivo de ingresos</strong> (solo informativo, se recalcula si cambia el presupuesto): lo que hay que
        cobrar cada mes para cubrir los pagos del año. Julio y agosto ingresan menos (en 2026, el {pct(INCOME_TARGET.julio)} y
        el {pct(INCOME_TARGET.agosto)} de un mes normal), así que el resto de meses cubre ese hueco; incluye un margen del
        {' '}{pct(INCOME_TARGET.margen)}. 🎯 En los meses que quedan en negativo, el objetivo para cubrir el mes es lo mínimo
        a cobrar para no perder dinero ese mes.
      </p>
    </>
  )
}
