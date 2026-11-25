import { useState } from 'react'
import { parseNominasGestoriaPdf, emparejarGestoria } from '../utils/nominasGestoriaParser'
import { savePayrollConfig, sortByType, hasBase } from '../hooks/useOvertime'
import { monthLabel, fmtEur } from '../utils/monthFormat'

// «Revisar nóminas de la gestoría» (23/11): antes de pagar, compara lo que la gestoría va a pagar
// a cada persona (líquido de su listado o de sus nóminas) con la nómina pactada en Blokes
// (Configuración). SOLO COMPARA: no marca nada como pagado. El PDF se lee en el navegador.
export default function GestoriaReview({ month, people, personal, config, onConfigSaved, onClose }) {
  const [result, setResult] = useState(null)
  const [lines, setLines]   = useState([])
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [aviso, setAviso]   = useState('')
  const options = sortByType(people)
  const base    = config?.base || {}
  const cashTot = config?.cash_total || {}

  async function handleFile(e) {
    const f = e.target.files?.[0]
    setError(''); setAviso(''); setResult(null); setLines([])
    if (!f) return
    setBusy(true)
    try {
      const r = await parseNominasGestoriaPdf(f)
      setResult(r)
      setLines(emparejarGestoria(r.lineas, people, personal))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const setPerson = (i, id) => setLines(ls => ls.map((l, k) => k === i ? { ...l, person: id || null, by: id ? 'manual' : null } : l))

  // Poner el líquido de la gestoría como nómina base de esa persona (si lo pactado estaba desfasado)
  async function usarComoBase(l) {
    const p = people.find(x => x.id === l.person)
    // 25/11: una nómina con huelga, baja o pagos puntuales no es la de un mes normal
    const raro = l.avisos?.length
      ? `⚠ ESTA NÓMINA NO ES LA DE UN MES NORMAL:\n· ${l.avisos.join('\n· ')}\n\nSi la usas como base, Blokes esperará ${fmtEur(l.amount)} todos los meses. Lo normal es NO usarla y dejar la diferencia de este mes.\n\n`
      : ''
    if (!window.confirm(`${raro}¿Poner ${fmtEur(l.amount)} como nómina base de ${p?.name} en Configuración?`)) return
    setBusy(true); setError('')
    try {
      await savePayrollConfig({ base: { [l.person]: l.amount } })
      setAviso(`✓ Nómina base de ${p?.name} actualizada a ${fmtEur(l.amount)}`)
      await onConfigSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const comparadas = lines.map(l => {
    const pac = l.person ? parseFloat(base[l.person]) || 0 : null
    const diff = pac != null ? Math.round((l.amount - pac) * 100) / 100 : null
    const mixto = l.person && cashTot[l.person] != null
    return { ...l, pac, diff, mixto, efectivo: mixto ? Math.max(0, cashTot[l.person] - l.amount) : null }
  })
  const conDif   = comparadas.filter(l => l.person && Math.abs(l.diff) > 0.01)
  const sinPers  = comparadas.filter(l => !l.person)
  // 25/11: solo se echa en falta a quien cobra por nómina (los «por horas» y «fijo» van por transferencia)
  const enNomina = p => (config?.pay_mode?.[p.id] || (p.type === 'profesor' ? 'nomina' : 'otro')) === 'nomina'
  const faltan   = people.filter(p => p.active && hasBase(p.type) && enNomina(p) && (parseFloat(base[p.id]) || 0) > 0 && !comparadas.some(l => l.person === p.id))
  const otroMes  = result && result.months.length && !result.months.includes(month)

  return (
    <div className="sa-pay-file gestoria">
      <div className="sa-pay-file__head">
        <div>
          <h3 className="sa-pay-file__title">Revisar nóminas de la gestoría · {monthLabel(month)}</h3>
          <p className="sa-pay-file__meta">
            Sube el «Listado de nóminas» o las nóminas en PDF que manda la gestoría. Se comparan con la nómina pactada en Blokes
            <b> sin marcar nada como pagado</b>. El PDF se lee en tu navegador y no se guarda.
          </p>
        </div>
        <button className="sa-pay-action" onClick={onClose}>Cerrar</button>
      </div>

      <input type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={busy} className="sa-remesa__file" />
      {busy && !result && <p className="sa-loading">Leyendo PDF…</p>}
      {error && <p className="sa-error">✗ {error}</p>}
      {aviso && <p className="sa-pay-feedback">{aviso}</p>}

      {result && (
        <>
          <div className={`gestoria__veredicto${conDif.length || sinPers.length || faltan.length ? ' gestoria__veredicto--mal' : ''}`}>
            {conDif.length || sinPers.length || faltan.length ? (
              <>
                <strong>⚠ Hay que revisar {conDif.length + sinPers.length + faltan.length} {conDif.length + sinPers.length + faltan.length === 1 ? 'cosa' : 'cosas'}</strong>
                <ul>
                  {conDif.map(l => (
                    <li key={l.person}>
                      <b>{people.find(p => p.id === l.person)?.name}</b>: la gestoría paga {fmtEur(l.amount)} y en Blokes está pactado {l.pac ? fmtEur(l.pac) : 'sin nómina base'} ({l.diff > 0 ? '+' : ''}{fmtEur(l.diff)})
                    </li>
                  ))}
                  {sinPers.length > 0 && <li>{sinPers.length} {sinPers.length === 1 ? 'línea' : 'líneas'} del PDF sin persona: elígela en la tabla.</li>}
                  {faltan.length > 0 && <li>No están en el PDF pero tienen nómina pactada: {faltan.map(p => p.name).join(', ')}.</li>}
                </ul>
              </>
            ) : <strong>✓ Todo cuadra: lo que paga la gestoría es lo pactado en Blokes</strong>}
          </div>
          <p className="sa-pay-muted">
            {result.tipo === 'listado' ? 'Listado de nóminas' : 'Nóminas completas'} · {result.lineas.length} personas · {fmtEur(result.total)} en total
            {result.months.length > 0 && ` · de ${result.months.map(monthLabel).join(', ')}`}
          </p>
          {otroMes && <p className="sa-pay-warn">⚠ El PDF es de {result.months.map(monthLabel).join(', ')} y estás viendo {monthLabel(month)}.</p>}

          <div className="sa-pay-scroll">
            <table className="sa-pay-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="sa-pay-num">Gestoría (líquido)</th>
                  <th className="sa-pay-num">Pactado en Blokes</th>
                  <th className="sa-pay-num">Diferencia</th>
                  {result.tipo === 'nominas' && <th className="sa-pay-num" title="Lo que cuesta a la empresa (bruto + Seguridad Social)">Coste empresa</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {comparadas.map((l, i) => (
                  <tr key={i} className={!l.person ? 'sa-remesa__row--warn' : ''}>
                    <td className="sa-pay-nowrap">
                      <select className="sa-remesa__select" value={l.person || ''} onChange={e => setPerson(i, e.target.value)}>
                        <option value="">— ¿Quién es? —</option>
                        {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {l.by === 'ambiguo' && <span className="sa-pay-tag">revisar</span>}
                      {l.avisos?.length > 0 && (
                        <div className="sa-pay-warn gestoria__avisos" title="No es la nómina de un mes normal">⚠ {l.avisos.join(' · ')}</div>
                      )}
                    </td>
                    <td className="sa-pay-num">{fmtEur(l.amount)}</td>
                    <td className="sa-pay-num">{l.person ? (l.pac ? fmtEur(l.pac) : <span className="sa-pay-muted">—</span>) : ''}</td>
                    <td className={`sa-pay-num${l.diff != null && Math.abs(l.diff) > 0.01 ? ' sa-pay-warn' : ''}`}>
                      {l.diff == null ? '' : Math.abs(l.diff) <= 0.01 ? <span className="sa-pay-ok">✓</span> : `${l.diff > 0 ? '+' : ''}${fmtEur(l.diff)}`}
                      {l.mixto && <div className="sa-pay-paid">efectivo a entregar {fmtEur(l.efectivo)}</div>}
                    </td>
                    {result.tipo === 'nominas' && <td className="sa-pay-num">{l.cost != null ? fmtEur(l.cost) : '—'}</td>}
                    <td>
                      {l.person && Math.abs(l.diff) > 0.01 && (
                        <button className="sa-pay-action" disabled={busy} onClick={() => usarComoBase(l)} title="Si lo pactado en Blokes está desfasado">
                          Usar como nómina base
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sa-pay-note">
            «Pactado en Blokes» es la nómina base de Configuración. Si la diferencia es un error de la gestoría, díselo antes de pagar;
            si lo desfasado es Blokes, pulsa «Usar como nómina base» — pero nunca con una nómina marcada con ⚠ (huelga, baja,
            horas extra u otros pagos de ese mes), porque no es la de un mes normal. Cuando esté pagado, carga la remesa del banco (⬆) para marcarlo como pagado.
          </p>
        </>
      )}
    </div>
  )
}
