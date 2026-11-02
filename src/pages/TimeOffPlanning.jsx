import { useState, useMemo } from 'react'
import { PROF_ORDER } from '../data/staffSchedule'
import { CIERRE_VERANO } from '../utils/coverage'
import { evaluarPlan, previsionVerano, eur, MES_LABEL } from '../utils/timeoffPlan'
import { addScenario, deleteScenario } from '../hooks/useTimeOff'

const PARO_CORTO = { verano: 'jul+ago', agosto: 'ago', julio: 'jul' }

function resumenParo(paro) {
  const txt = PROF_ORDER.filter(p => (paro[p] || 'no') !== 'no').map(p => `${p} ${PARO_CORTO[paro[p]]}`)
  return txt.length ? txt.join(', ') : 'Nadie'
}

// ─── Previsión del P&L de julio y agosto ─────────────────────────────────────
export function PrevisionVerano({ ev, state, historico }) {
  const prev = useMemo(() => previsionVerano(ev, state, historico), [ev, state, historico])
  const years = [...new Set(historico.filter(h => [7, 8].includes(Number(h.month.slice(5)))).map(h => h.month.slice(0, 4)))].sort()
  const res = (h) => (h ? h.ventas - h.costes : null)
  const cell = v => (v == null ? '—' : <span className={v < 0 ? 'sv-to-bad' : ''}>{eur(v)}</span>)
  const total = [7, 8].reduce((n, m) => n + prev[m].resultado, 0)
  const totalMed = [7, 8].reduce((n, m) => n + prev[m].resultadoMed, 0)

  const sgn = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(Math.abs(n))}`
  const frase = m => {
    const p = prev[m]
    return `${MES_LABEL[m]} ${p.cerrado ? 'cerrado' : 'abierto'}: ${eur(p.resultado)} (de media, ${eur(p.resultadoMed)})`
  }

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Previsión de julio y agosto {ev.y} con este supuesto</h3>
      <p className="sv-to-lead">
        Julio y agosto darían <strong className={total < 0 ? 'sv-to-bad' : 'sv-to-good'}>{eur(total)}</strong>,{' '}
        <strong className={total - totalMed >= 0 ? 'sv-to-good' : 'sv-to-bad'}>{sgn(total - totalMed)}</strong> frente a la media de
        los veranos anteriores ({eur(totalMed)}). {frase(7)} · {frase(8)}.
      </p>
      <details className="sv-to-fold">
        <summary>Ver el detalle por mes y año</summary>
      <p className="sv-note sv-to-small">
        Parte de la media de cada mes en el histórico y la ajusta con el supuesto: el sueldo de quien está en paro (frente a
        hoy), las ventas que se pierden y los gastos que se ahorran si se cierra, y el campamento. Resultado = ventas − costes
        fijos, el mismo criterio que el histórico. Los costes históricos ya incluyen el paro de hoy.
      </p>
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th></th>
              {years.map(y => <th key={y}>{y}</th>)}
              <th>Media</th><th>Previsión {ev.y}</th><th>Ajustes del plan</th>
            </tr>
          </thead>
          <tbody>
            {[7, 8].map(m => {
              const p = prev[m]
              const byYear = y => p.historico.find(h => h.month.startsWith(y))
              return [
                <tr key={`${m}v`}>
                  <td><strong>{MES_LABEL[m]}</strong> · ventas</td>
                  {years.map(y => <td key={y}>{byYear(y) ? eur(byYear(y).ventas) : '—'}</td>)}
                  <td>{eur(p.ventasMed)}</td>
                  <td>{eur(p.ventas)}</td>
                  <td className="sv-ot-muted">
                    {p.cerrado ? 'Sala cerrada: sin ventas' : 'Abierto: media del mes'}
                    {p.campIngresos > 0 && ` · campamento +${eur(p.campIngresos)}`}
                  </td>
                </tr>,
                <tr key={`${m}c`}>
                  <td className="sv-ot-muted">costes fijos</td>
                  {years.map(y => <td key={y}>{byYear(y) ? eur(byYear(y).costes) : '—'}</td>)}
                  <td>{eur(p.costesMed)}</td>
                  <td>{eur(p.costes)}</td>
                  <td className="sv-ot-muted">
                    {p.ahorroPersonal !== 0 && `Personal ${p.ahorroPersonal > 0 ? '−' : '+'}${eur(Math.abs(p.ahorroPersonal))}`}
                    {p.ahorroSala > 0 && ` · gastos de sala −${eur(p.ahorroSala)}`}
                    {p.campCostes > 0 && ` · campamento +${eur(p.campCostes)}`}
                    {p.ahorroPersonal === 0 && !p.ahorroSala && !p.campCostes && 'Igual que hoy'}
                  </td>
                </tr>,
                <tr key={`${m}r`} className="sv-to-row--total">
                  <td className="sv-ot-muted">resultado</td>
                  {years.map(y => <td key={y}>{cell(res(byYear(y)))}</td>)}
                  <td>{cell(p.resultadoMed)}</td>
                  <td><strong>{cell(p.resultado)}</strong></td>
                  <td>{cell(p.resultado - p.resultadoMed)} <span className="sv-ot-muted">frente a la media</span></td>
                </tr>,
              ]
            })}
          </tbody>
        </table>
      </div>
      </details>
      {historico.every(h => h.ahorrable == null) && ev.mesesCerradosList.length > 0 && !Object.values(state.gastosSala || {}).some(Boolean) && (
        <p className="sv-note">Los gastos que se ahorran al cerrar están a 0: rellénalos en la calculadora o usa el botón del histórico.</p>
      )}
    </div>
  )
}

// Celda de comparación: verde si mejora frente al plan actual, rojo si empeora
function Comp({ f, base, get, mejorSiMas = false, fmt = v => v }) {
  const v = get(f)
  if (f.actual) return <td>{fmt(v)}</td>
  const d = v - get(base)
  const mejor = mejorSiMas ? d > 0 : d < 0
  return (
    <td className={d === 0 ? '' : mejor ? 'sv-to-good' : 'sv-to-bad'} title={d === 0 ? 'Igual que el plan actual' : mejor ? 'Mejor que el plan actual' : 'Peor que el plan actual'}>
      {fmt(v)}{d !== 0 && <span className="sv-to-small"> ({d > 0 ? '+' : '−'}{fmt(Math.abs(d))})</span>}
    </td>
  )
}

// ─── Escenarios guardados ────────────────────────────────────────────────────
export function Escenarios({ scenarios, setScenarios, state, coste, requests, onLoad, connected, toPlain, hydrate }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState('')
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 3500) }

  const filas = useMemo(() => {
    const evalua = (st, label, extra = {}) => {
      const ev = evaluarPlan(st, coste, requests)
      return { label, st, ev, ...extra }
    }
    return [
      evalua(state, 'Plan actual', { actual: true }),
      // hydrate completa los campos que falten (escenarios guardados con versiones anteriores)
      ...scenarios.map(sc => evalua(hydrate(sc.state), sc.name, { sc })),
    ]
  }, [scenarios, state, coste, requests, hydrate])

  async function guardar(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      const sc = await addScenario(n, toPlain(state))
      setScenarios([...scenarios, sc])
      setName('')
      flash('✓ Escenario guardado')
    } catch (err) { flash(`✗ ${err.message}`) } finally { setBusy(false) }
  }

  async function borrar(sc) {
    if (!window.confirm(`¿Borrar el escenario «${sc.name}»?`)) return
    setBusy(true)
    try {
      await deleteScenario(sc.id)
      setScenarios(scenarios.filter(x => x.id !== sc.id))
    } catch (err) { flash(`✗ ${err.message}`) } finally { setBusy(false) }
  }

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Escenarios guardados</h3>
      <p className="sv-note sv-to-small">Entre paréntesis, la diferencia con el plan actual: en verde si mejora y en rojo si empeora.</p>
      <p className="sv-note">
        Guarda el plan de la calculadora con un nombre para compararlo con otros. Se guardan en la app y los ven todos los
        socios. Cargar uno sustituye el plan actual (que también se guarda solo).
      </p>
      <form className="sv-to-form" onSubmit={guardar}>
        <input className="sv-tests-input sv-tests-input--desc" placeholder="Nombre del escenario (p. ej. Agosto cerrado, Sara discontinua)"
          value={name} maxLength={80} onChange={e => setName(e.target.value)} />
        <button className="sv-tests-add" type="submit" disabled={!connected || busy || !name.trim()}>Guardar el plan actual</button>
        {msg && <span className="sv-tests-feedback">{msg}</span>}
      </form>
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Escenario</th><th>Paro en verano</th><th>Sala</th><th>Verano frente a hoy</th>
              <th>Avisos graves</th><th>Clases verano sin profe</th><th>Días Eva en clase</th><th>Choques</th><th>Requiere acuerdo de</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.sc?.id || 'actual'} className={f.actual ? 'sv-to-row--sel' : ''}>
                <td>
                  <strong>{f.label}</strong>
                  {f.sc && <div className="sv-ot-muted">{f.sc.by} · {f.sc.saved_at?.slice(0, 10)}</div>}
                </td>
                <td className="sv-ot-muted">{resumenParo(f.st.paro || {})}</td>
                <td>{CIERRE_VERANO[f.st.cierre] || f.st.cierre}{f.st.camp?.activo ? ' + campamento' : ''} <span className="sv-ot-muted">· {f.ev.y}</span></td>
                <Comp f={f} base={filas[0]} get={x => x.ev.eco.balance} mejorSiMas fmt={v => eur(v)} />
                <Comp f={f} base={filas[0]} get={x => x.ev.kpi.graves} />
                <Comp f={f} base={filas[0]} get={x => x.ev.kpi.perdVer} />
                <Comp f={f} base={filas[0]} get={x => x.ev.kpi.comodinDias} />
                <Comp f={f} base={filas[0]} get={x => x.ev.kpi.choques} />
                <td className={f.ev.kpi.acuerdos.length ? 'sv-to-warn-txt' : 'sv-ot-muted'}>{f.ev.kpi.acuerdos.join(', ') || 'Nadie'}</td>
                <td className="sv-to-actions">
                  {f.sc && <button className="sv-filter-btn" disabled={busy} onClick={() => onLoad(f.sc)}>Cargar</button>}
                  {f.sc && <button className="sv-tests-remove" disabled={busy} onClick={() => borrar(f.sc)}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scenarios.length === 0 && <p className="sv-empty">Todavía no hay escenarios guardados.</p>}
    </div>
  )
}
