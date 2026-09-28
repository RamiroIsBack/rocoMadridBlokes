import { useState } from 'react'
import { parseRemittancePdf, matchPayments } from '../utils/remittanceParser'
import { importPayrollPayments, savePayrollPersonal, sortByType } from '../hooks/useOvertime'
import { monthLabel, fmtDate, fmtEur } from '../utils/monthFormat'

// Solo se muestran los 4 últimos dígitos del IBAN en pantalla
const maskIban = iban => iban ? `···· ${iban.slice(-4)}` : '—'

// Panel "Cargar remesa": lee el PDF del banco en el navegador, empareja cada pago con una
// persona (IBAN de la ficha o nombre), permite corregir y, al confirmar, marca las nóminas
// como pagadas. Si el pago cubre también las horas extra pendientes, quedan pagadas.
export default function RemittanceImport({ month, people, rows, personal, onDone, onClose }) {
  const [file,     setFile]     = useState(null)
  const [result,   setResult]   = useState(null)   // salida del parser
  const [lines,    setLines]    = useState([])     // pagos emparejados (editables)
  const [saveIban, setSaveIban] = useState(true)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')

  const rowById  = Object.fromEntries(rows.map(r => [r.id, r]))
  const options  = sortByType(people)

  async function handleFile(e) {
    const f = e.target.files?.[0]
    setError(''); setResult(null); setLines([])
    if (!f) return
    setFile(f)
    setBusy(true)
    try {
      const r = await parseRemittancePdf(f)
      setResult(r)
      setLines(matchPayments(r.payments, people, personal))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const setPerson = (i, id) => setLines(ls => ls.map((l, k) => k === i ? { ...l, person: id || null, by: id ? 'manual' : null } : l))

  const assigned   = lines.filter(l => l.person)
  const dupes      = new Set(assigned.map(l => l.person).filter((id, i, a) => a.indexOf(id) !== i))
  const otherMonth = result && result.months.some(m => m !== month)
  // Personas con nómina este mes que no aparecen en la remesa
  const missing    = rows.filter(r => (r.base ?? 0) > 0 && !assigned.some(l => l.person === r.id))

  async function handleConfirm() {
    setBusy(true); setError('')
    try {
      const payments = assigned.map(l => ({ person: l.person, amount: l.amount, date: l.date }))
      await importPayrollPayments(month, file?.name || 'remesa', payments)
      // Guardar el IBAN de la remesa en las fichas que aún no lo tienen
      if (saveIban) {
        for (const l of assigned) {
          const cur = personal[l.person] || {}
          if (!cur.iban && l.iban) await savePayrollPersonal(l.person, { ...cur, iban: l.iban })
        }
      }
      await onDone(`✓ Remesa cargada: ${payments.length} nómina${payments.length === 1 ? '' : 's'} marcada${payments.length === 1 ? '' : 's'} como pagada${payments.length === 1 ? '' : 's'}`)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sa-pay-file sa-remesa">
      <div className="sa-pay-file__head">
        <div>
          <h3 className="sa-pay-file__title">Cargar remesa de nóminas · {monthLabel(month)}</h3>
          <p className="sa-pay-file__meta">
            PDF "Listado de pagos" de Laboral Kutxa. Se lee en tu navegador; el archivo no se sube a ningún servidor.
          </p>
        </div>
        <button className="sa-pay-action" onClick={onClose}>Cerrar</button>
      </div>

      <input type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={busy} className="sa-remesa__file" />
      {busy && !result && <p className="sa-loading">Leyendo PDF…</p>}
      {error && <p className="sa-error">✗ {error}</p>}

      {result && (
        <>
          <div className="sa-remesa__summary">
            <span>{result.payments.length} pagos · {fmtEur(result.total)}</span>
            {result.declaredTotal != null && Math.abs(result.declaredTotal - result.total) < 0.01 && result.declaredCount === result.payments.length
              && <span className="sa-remesa__ok">✓ cuadra con el total del listado</span>}
          </div>
          {result.warnings.map(w => <p key={w} className="sa-pay-warn">⚠ {w}</p>)}
          {otherMonth && (
            <p className="sa-pay-warn">⚠ La remesa es de {result.months.map(monthLabel).join(', ')} y estás en {monthLabel(month)}. Se marcará como pagado {monthLabel(month)}.</p>
          )}

          <div className="sa-pay-scroll">
            <table className="sa-pay-table">
              <thead>
                <tr>
                  <th>Beneficiario (banco)</th>
                  <th>IBAN</th>
                  <th>Fecha</th>
                  <th className="sa-pay-num">Pagado</th>
                  <th>Persona</th>
                  <th className="sa-pay-num">Nómina del mes</th>
                  <th className="sa-pay-num">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const r    = l.person ? rowById[l.person] : null
                  // Pago mixto: el resto hasta el total pactado (+ extras) va en efectivo, no es una diferencia
                  const mixed = r && r.cash_total != null
                  const cash  = mixed ? Math.max(0, r.cash_total - l.amount) + r.extras : null
                  const diff  = r && !mixed ? Math.round((l.amount - r.total) * 100) / 100 : null
                  return (
                    <tr key={i} className={!l.person || dupes.has(l.person) ? 'sa-remesa__row--warn' : ''}>
                      <td>{l.name}</td>
                      <td className="sa-pay-nowrap sa-pay-muted">{maskIban(l.iban)}</td>
                      <td className="sa-pay-nowrap">{fmtDate(l.date)}</td>
                      <td className="sa-pay-num">{fmtEur(l.amount)}</td>
                      <td className="sa-pay-nowrap">
                        <select className="sa-remesa__select" value={l.person || ''} onChange={e => setPerson(i, e.target.value)}>
                          <option value="">— Sin asignar —</option>
                          {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {l.by && <span className="sa-pay-tag">{l.by === 'iban' ? 'por IBAN' : l.by === 'nombre' ? 'por nombre' : l.by === 'ambiguo' ? 'revisar' : 'manual'}</span>}
                        {l.person && dupes.has(l.person) && <span className="sa-pay-warn"> duplicado</span>}
                      </td>
                      <td className="sa-pay-num">{r ? fmtEur(r.total) : '—'}</td>
                      <td className={`sa-pay-num${diff && Math.abs(diff) > 0.01 ? ' sa-pay-warn' : ''}`}>
                        {mixed ? <span className="sa-pay-paid">efectivo {fmtEur(cash)}</span>
                          : diff == null ? '—' : Math.abs(diff) <= 0.01 ? '✓' : `${diff > 0 ? '+' : ''}${fmtEur(diff)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="sa-pay-note">
            Diferencia = pagado en banco − (nómina base + horas extra del mes). Si el pago cubre base + horas extra
            pendientes, las horas extra también quedan pagadas; si no, lo que falte queda como pendiente y se cambia a mano.
          </p>
          {missing.length > 0 && (
            <p className="sa-pay-warn">⚠ Con nómina este mes pero no están en la remesa: {missing.map(r => r.name).join(', ')}.</p>
          )}

          <div className="sa-pay-actions">
            <button
              className="sa-list-save__btn" onClick={handleConfirm}
              disabled={busy || assigned.length === 0 || dupes.size > 0}
            >
              {busy ? 'Guardando…' : `Confirmar y marcar ${assigned.length} como pagada${assigned.length === 1 ? '' : 's'}`}
            </button>
            <label className="sa-remesa__check">
              <input type="checkbox" checked={saveIban} onChange={e => setSaveIban(e.target.checked)} />
              Guardar el IBAN en las fichas que no lo tienen
            </label>
          </div>
        </>
      )}
    </div>
  )
}
