import { useState } from 'react'
import { addPayrollPartial } from '../hooks/useOvertime'
import { monthLabel, todayISO, fmtEur } from '../utils/monthFormat'

// Formulario "Pago parcial": registra un pago en efectivo de nómina o de horas extra de una
// persona en el mes, con justificación obligatoria. Descuenta de lo pendiente de ese concepto.
export default function PartialPayment({ month, rows, onDone, onClose }) {
  const [person,  setPerson]  = useState('')
  const [concept, setConcept] = useState('nomina')
  const [amount,  setAmount]  = useState('')
  const [date,    setDate]    = useState(() => todayISO().startsWith(month) ? todayISO() : `${month}-01`)
  const [note,    setNote]    = useState('')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState('')

  const row = rows.find(r => r.id === person)
  // Lo que falta del concepto elegido (se propone como importe)
  const due = row ? (concept === 'extras' ? row.extras_outstanding : row.nomina_outstanding) : null

  function choose(p, c) {
    setPerson(p); setConcept(c)
    const r = rows.find(x => x.id === p)
    const d = r ? (c === 'extras' ? r.extras_outstanding : r.nomina_outstanding) : 0
    setAmount(d > 0 ? String(d) : '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const value = parseFloat(String(amount).replace(',', '.'))
      await addPayrollPartial(month, { person, concept, amount: value, date, note })
      await onDone(`✓ Pago parcial registrado: ${row?.name} · ${concept === 'extras' ? 'horas extra' : 'nómina'} · ${fmtEur(value)} en efectivo`)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="sa-pay-file sa-partial" onSubmit={handleSubmit}>
      <div className="sa-pay-file__head">
        <div>
          <h3 className="sa-pay-file__title">Pago parcial en efectivo · {monthLabel(month)}</h3>
          <p className="sa-pay-file__meta">Descuenta de lo pendiente de la nómina o de las horas extra de la persona.</p>
        </div>
        <button type="button" className="sa-pay-action" onClick={onClose}>Cerrar</button>
      </div>

      <div className="sa-pay-file__grid">
        <label className="sa-pay-file__field">
          <span>Persona</span>
          <select className="sa-pay-file__input" required value={person} onChange={e => choose(e.target.value, concept)}>
            <option value="" disabled>Elegir…</option>
            {rows.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}{r.outstanding > 0.01 ? ` · pendiente ${fmtEur(r.outstanding)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="sa-pay-file__field">
          <span>Concepto</span>
          <select className="sa-pay-file__input" value={concept} onChange={e => choose(person, e.target.value)}>
            <option value="nomina">Nómina</option>
            <option value="extras">Horas extra</option>
          </select>
        </label>
        <label className="sa-pay-file__field">
          <span>Importe (efectivo){due != null && due > 0 ? ` · falta ${fmtEur(due)}` : ''}</span>
          <input
            type="number" min="0.01" step="0.01" required className="sa-pay-file__input"
            value={amount} onChange={e => setAmount(e.target.value)}
          />
        </label>
        <label className="sa-pay-file__field">
          <span>Fecha</span>
          <input type="date" required className="sa-pay-file__input" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </div>
      <label className="sa-pay-file__field sa-partial__note">
        <span>Justificación</span>
        <textarea
          required rows={2} maxLength={300} className="sa-pay-textarea"
          placeholder="Ej. resto de horas extra de septiembre pagado en mano"
          value={note} onChange={e => setNote(e.target.value)}
        />
      </label>

      {error && <p className="sa-error">✗ {error}</p>}
      <div className="sa-pay-actions">
        <button type="submit" className="sa-list-save__btn" disabled={busy || !person || !note.trim()}>
          {busy ? 'Guardando…' : 'Registrar pago en efectivo'}
        </button>
      </div>
    </form>
  )
}
