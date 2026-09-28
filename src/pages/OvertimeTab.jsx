import { useState, useEffect, useMemo } from 'react'
import {
  useOvertime, createOvertime, updateOvertime, deleteOvertime,
  setOvertimeStatus, getOvertimeRates, saveOvertimeRates,
  addOvertimePerson, updateOvertimePerson,
} from '../hooks/useOvertime'

// ─── Helpers ────────────────────────────────────────────────────────────────
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const pad = n => String(n).padStart(2, '0')

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

// Hoy si cae en el mes visible; si no, el día 1 de ese mes.
function defaultDate(month) {
  const d = new Date()
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return today.startsWith(month) ? today : `${month}-01`
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const fmtHours = h => Number(h).toLocaleString('es-ES', { maximumFractionDigits: 2 })
const fmtEur   = n => n == null ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

const emptyForm = month => ({ professor: '', date: defaultDate(month), hours: '', reason: '' })

// ─── Tarifas de hora extra (solo socios) ────────────────────────────────────
function OvertimeRates({ people, onSaved }) {
  const [rates,    setRates]    = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [feedback, setFeedback] = useState('')

  // Solo recargar si cambia la lista de personas, no en cada recarga de registros
  // (si no, se perderían tarifas escritas sin guardar).
  const peopleKey = people.map(p => p.id).join(',')
  useEffect(() => {
    getOvertimeRates()
      .then(r => setRates(Object.fromEntries(people.map(p => [p.id, r[p.id] ?? '']))))
      .catch(e => setFeedback(`✗ ${e.message}`))
  }, [peopleKey])

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await saveOvertimeRates(rates)
      setRates(Object.fromEntries(people.map(p => [p.id, saved[p.id] ?? ''])))
      setFeedback('✓ Tarifas guardadas')
      onSaved()
    } catch (e) {
      setFeedback(`✗ ${e.message}`)
    } finally {
      setSaving(false)
      setTimeout(() => setFeedback(''), 2800)
    }
  }

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">€/hora extra por persona</h3>
      <p className="sv-note">
        Solo visible para socios. Es independiente del €/h de las clases. Al marcar horas como pagadas
        se guarda el €/h de ese momento, así que cambiar la tarifa no altera lo ya pagado.
      </p>
      {!rates ? <p className="sv-loading">Cargando…</p> : (
        <>
          <div className="sv-ot-rates">
            {people.map(p => (
              <label key={p.id} className="sv-ot-rate">
                <span className="sv-ot-dot" style={{ background: p.color }} />
                <span className="sv-ot-rate__name">{p.name}</span>
                <input
                  type="number" min="0" step="0.01" placeholder="—"
                  className="sv-tests-input sv-tests-input--num"
                  value={rates[p.id]}
                  onChange={e => setRates(r => ({ ...r, [p.id]: e.target.value }))}
                />
                <span className="sv-ot-rate__unit">€/h</span>
              </label>
            ))}
          </div>
          <div className="sv-tests-actions">
            <button className="sv-tests-save" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar tarifas'}
            </button>
            {feedback && <span className="sv-tests-feedback">{feedback}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Personas (gestion y socio añaden; solo socio edita/desactiva) ──────────
const TYPE_LABEL = { profesor: 'Profesor', externo: 'Externo' }

function OvertimePeople({ people, isSocio, onChanged }) {
  const [name,     setName]     = useState('')
  const [type,     setType]     = useState('profesor')
  const [busy,     setBusy]     = useState(false)
  const [feedback, setFeedback] = useState('')

  async function run(action, okMsg) {
    setBusy(true)
    try {
      await action()
      await onChanged()
      setFeedback(okMsg)
      return true
    } catch (e) {
      setFeedback(`✗ ${e.message}`)
      return false
    } finally {
      setBusy(false)
      setTimeout(() => setFeedback(''), 2800)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean) return
    if (await run(() => addOvertimePerson(clean, type), `✓ ${clean} añadido`)) setName('')
  }

  function handleRename(p) {
    const next = window.prompt('Nuevo nombre', p.name)?.trim()
    if (!next || next === p.name) return
    run(() => updateOvertimePerson(p.id, { name: next }), '✓ Nombre cambiado')
  }

  const visible = isSocio ? people : people.filter(p => p.active)
  const groups  = ['profesor', 'externo']
    .map(t => [t, visible.filter(p => p.type === t)])
    .filter(([, list]) => list.length > 0)

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Personas</h3>
      <p className="sv-note">
        Profesores y colaboradores externos que pueden tener horas extra.
        {isSocio
          ? ' Desactivar a alguien lo quita del desplegable pero conserva sus horas y su nombre en el historial.'
          : ' Si falta alguien, añádelo aquí. Para quitar o renombrar, pídeselo a un socio.'}
      </p>

      {groups.map(([t, list]) => (
        <div key={t} className="sv-ot-people">
          <span className="sv-ot-people__label">{t === 'externo' ? 'Externos' : 'Profesores'}</span>
          <ul className="sv-ot-people__list">
            {list.map(p => (
              <li key={p.id} className={`sv-ot-person${p.active ? '' : ' sv-ot-person--inactive'}`}>
                <span className="sv-ot-dot" style={{ background: p.color }} />
                <span className="sv-ot-person__name">{p.name}</span>
                {!p.active && <span className="sv-ot-person__tag">inactivo</span>}
                {isSocio && (
                  <span className="sv-ot-person__actions">
                    <button className="sv-ot-action" disabled={busy} onClick={() => handleRename(p)}>Renombrar</button>
                    <button
                      className="sv-ot-action" disabled={busy}
                      onClick={() => run(
                        () => updateOvertimePerson(p.id, { type: p.type === 'externo' ? 'profesor' : 'externo' }),
                        '✓ Tipo cambiado',
                      )}
                    >→ {p.type === 'externo' ? 'Profesor' : 'Externo'}</button>
                    <button
                      className="sv-ot-action" disabled={busy}
                      onClick={() => run(
                        () => updateOvertimePerson(p.id, { active: !p.active }),
                        p.active ? `✓ ${p.name} desactivado` : `✓ ${p.name} activado`,
                      )}
                    >{p.active ? 'Desactivar' : 'Activar'}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <form className="sv-tests-actions sv-ot-people__add" onSubmit={handleAdd}>
        <input
          type="text" maxLength={60} placeholder="Nombre"
          className="sv-tests-input"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <select className="sv-tests-select" value={type} onChange={e => setType(e.target.value)}>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="submit" className="sv-tests-add" disabled={busy || !name.trim()}>+ Añadir persona</button>
        {feedback && <span className="sv-tests-feedback">{feedback}</span>}
      </form>
    </div>
  )
}

// ─── Pestaña Horas extra ────────────────────────────────────────────────────
export default function OvertimeTab() {
  const [month,    setMonth]    = useState(currentMonth)
  const [form,     setForm]     = useState(() => emptyForm(currentMonth()))
  const [editing,  setEditing]  = useState(null)   // id del registro en edición
  const [busy,     setBusy]     = useState(false)
  const [feedback, setFeedback] = useState('')

  const { data, loading, error, reload } = useOvertime(month)
  const isSocio    = !!data?.can_manage
  const people     = data?.people || []
  const entries    = data?.entries || []
  const personById = useMemo(() => Object.fromEntries(people.map(p => [p.id, p])), [people])
  const active     = people.filter(p => p.active)

  const summary = useMemo(() => {
    const byProf = {}
    for (const e of entries) {
      if (!byProf[e.professor]) byProf[e.professor] = { hours: 0, amount: 0, missingRate: false, pending: 0, paid: 0 }
      const s = byProf[e.professor]
      s.hours += e.hours
      if (e.amount == null) s.missingRate = true
      else s.amount += e.amount
      s[e.status === 'pagado' ? 'paid' : 'pending']++
    }
    // Profesores primero, luego externos, en el orden de la lista
    const ordered = [...people.filter(p => p.type !== 'externo'), ...people.filter(p => p.type === 'externo')]
    const rows = ordered.filter(p => byProf[p.id]).map(p => ({ ...p, ...byProf[p.id] }))
    return {
      rows,
      hours:  rows.reduce((t, r) => t + r.hours, 0),
      amount: rows.reduce((t, r) => t + r.amount, 0),
      missingRate: rows.some(r => r.missingRate),
    }
  }, [entries, people])

  function flash(msg) {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 2800)
  }

  function changeMonth(delta) {
    const next = shiftMonth(month, delta)
    setMonth(next)
    setEditing(null)
    setForm(emptyForm(next))
  }

  async function run(action, okMsg) {
    setBusy(true)
    try {
      await action()
      await reload()
      if (okMsg) flash(okMsg)
      return true
    } catch (e) {
      flash(`✗ ${e.message}`)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const fields = { ...form, hours: parseFloat(String(form.hours).replace(',', '.')) }
    const ok = await run(
      () => editing ? updateOvertime(editing, fields) : createOvertime(fields),
      editing ? '✓ Registro actualizado' : '✓ Horas añadidas',
    )
    if (ok) {
      setEditing(null)
      setForm(f => ({ ...emptyForm(month), professor: f.professor, date: f.date }))
    }
  }

  function startEdit(entry) {
    setEditing(entry.id)
    setForm({ professor: entry.professor, date: entry.date, hours: String(entry.hours), reason: entry.reason })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(emptyForm(month))
  }

  function handleDelete(entry) {
    const who = personById[entry.professor]?.name || entry.professor
    if (!window.confirm(`¿Borrar ${fmtHours(entry.hours)} h de ${who} del ${fmtDate(entry.date)}?`)) return
    if (editing === entry.id) cancelEdit()
    run(() => deleteOvertime(entry.id), '✓ Registro borrado')
  }

  const canEdit = entry => isSocio || entry.status === 'pendiente'

  return (
    <div className="sv-tab-panel sv-ot">
      <div className="sv-controls">
        <div className="sv-ot-month">
          <button className="sv-period__btn" onClick={() => changeMonth(-1)} aria-label="Mes anterior">◀</button>
          <span className="sv-ot-month__label">{monthLabel(month)}</span>
          <button className="sv-period__btn" onClick={() => changeMonth(1)} aria-label="Mes siguiente">▶</button>
        </div>
        {feedback && <span className="sv-tests-feedback">{feedback}</span>}
      </div>

      {/* ── Formulario ── */}
      <form className="sv-section sv-ot-form" onSubmit={handleSubmit}>
        <h3 className="sv-section-title">{editing ? 'Editar registro' : 'Añadir horas extra'}</h3>
        <div className="sv-ot-form__fields">
          <label className="sv-ot-field">
            <span>Profesor</span>
            <select
              className="sv-tests-select" required
              value={form.professor}
              onChange={e => setForm(f => ({ ...f, professor: e.target.value }))}
            >
              <option value="" disabled>Elegir…</option>
              {[['profesor', 'Profesores'], ['externo', 'Externos']].map(([type, label]) => {
                // Al editar un registro de alguien ya inactivo, se sigue mostrando esa persona
                const opts = people.filter(p => p.type === type && (p.active || p.id === form.professor))
                return opts.length > 0 && (
                  <optgroup key={type} label={label}>
                    {opts.map(p => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inactivo)'}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </label>
          <label className="sv-ot-field">
            <span>Fecha</span>
            <input
              type="date" className="sv-tests-input sv-ot-input--date" required
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="sv-ot-field">
            <span>Horas</span>
            <input
              type="number" min="0.25" max="24" step="0.25" required
              className="sv-tests-input sv-tests-input--num"
              value={form.hours}
              onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
            />
          </label>
          <label className="sv-ot-field sv-ot-field--grow">
            <span>Motivo</span>
            <input
              type="text" maxLength={500} required placeholder="Ej. cubrir clase de Sara"
              className="sv-tests-input sv-ot-input--reason"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
          </label>
        </div>
        <div className="sv-tests-actions">
          <button type="submit" className="sv-tests-save" disabled={busy || !active.length}>
            {editing ? 'Guardar cambios' : '+ Añadir'}
          </button>
          {editing && <button type="button" className="sv-tests-cancel" onClick={cancelEdit}>Cancelar</button>}
        </div>
      </form>

      {/* ── Registros del mes ── */}
      <div className="sv-section">
        <h3 className="sv-section-title">Registros de {monthLabel(month).toLowerCase()}</h3>
        {loading && !data ? <p className="sv-loading">Cargando…</p>
          : error ? <p className="sv-error">Error: {error}</p>
          : entries.length === 0 ? <p className="sv-empty">No hay horas extra registradas este mes.</p>
          : (
            <div className="sv-tests-scroll">
              <table className="sv-tests-table sv-ot-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Profesor</th>
                    <th className="sv-ot-num">Horas</th>
                    <th>Motivo</th>
                    {isSocio && <th className="sv-ot-num">€/h</th>}
                    {isSocio && <th className="sv-ot-num">Importe</th>}
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const prof = personById[e.professor]
                    return (
                      <tr key={e.id} className={editing === e.id ? 'sv-ot-row--editing' : ''}>
                        <td className="sv-ot-nowrap">{fmtDate(e.date)}</td>
                        <td className="sv-ot-nowrap">
                          <span className="sv-ot-dot" style={{ background: prof?.color }} />
                          {prof?.name || e.professor}
                        </td>
                        <td className="sv-ot-num">{fmtHours(e.hours)}</td>
                        <td className="sv-ot-reason">{e.reason}</td>
                        {isSocio && <td className="sv-ot-num">{e.rate == null ? <span className="sv-tests-none">sin precio</span> : fmtEur(e.rate)}</td>}
                        {isSocio && <td className="sv-ot-num">{fmtEur(e.amount)}</td>}
                        <td>
                          {isSocio ? (
                            <button
                              className={`sv-ot-status sv-ot-status--${e.status} sv-ot-status--btn`}
                              disabled={busy}
                              title="Cambiar estado"
                              onClick={() => run(() => setOvertimeStatus({ id: e.id }, e.status === 'pagado' ? 'pendiente' : 'pagado'))}
                            >{e.status === 'pagado' ? 'Pagado' : 'Pendiente'}</button>
                          ) : (
                            <span className={`sv-ot-status sv-ot-status--${e.status}`}>
                              {e.status === 'pagado' ? 'Pagado' : 'Pendiente'}
                            </span>
                          )}
                        </td>
                        <td className="sv-ot-nowrap">
                          {canEdit(e) && <>
                            <button className="sv-ot-action" onClick={() => startEdit(e)} disabled={busy}>Editar</button>
                            <button className="sv-tests-clear" onClick={() => handleDelete(e)} disabled={busy} aria-label="Borrar">✕</button>
                          </>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* ── Resumen por profesor ── */}
      {summary.rows.length > 0 && (
        <div className="sv-section">
          <h3 className="sv-section-title">{isSocio ? 'A pagar este mes' : 'Resumen del mes'}</h3>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table sv-ot-table">
              <thead>
                <tr>
                  <th>Profesor</th>
                  <th className="sv-ot-num">Horas</th>
                  {isSocio && <th className="sv-ot-num">Importe</th>}
                  <th>Estado</th>
                  {isSocio && <th />}
                </tr>
              </thead>
              <tbody>
                {summary.rows.map(r => {
                  const allPaid = r.pending === 0
                  return (
                    <tr key={r.id}>
                      <td className="sv-ot-nowrap"><span className="sv-ot-dot" style={{ background: r.color }} />{r.name}</td>
                      <td className="sv-ot-num">{fmtHours(r.hours)}</td>
                      {isSocio && <td className="sv-ot-num">
                        {fmtEur(r.amount)}{r.missingRate && <span className="sv-ot-warn" title="Hay horas sin €/h configurado"> *</span>}
                      </td>}
                      <td>
                        <span className={`sv-ot-status sv-ot-status--${allPaid ? 'pagado' : 'pendiente'}`}>
                          {allPaid ? 'Pagado' : r.paid ? `${r.pending} pendiente${r.pending > 1 ? 's' : ''}` : 'Pendiente'}
                        </span>
                      </td>
                      {isSocio && <td>
                        <button
                          className="sv-ot-action" disabled={busy}
                          onClick={() => run(
                            () => setOvertimeStatus({ month, professor: r.id }, allPaid ? 'pendiente' : 'pagado'),
                            allPaid ? `✓ ${r.name}: marcado pendiente` : `✓ ${r.name}: marcado pagado`,
                          )}
                        >{allPaid ? 'Marcar pendiente' : 'Marcar todo pagado'}</button>
                      </td>}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="sv-ot-total">
                  <td>Total</td>
                  <td className="sv-ot-num">{fmtHours(summary.hours)}</td>
                  {isSocio && <td className="sv-ot-num">{fmtEur(summary.amount)}</td>}
                  <td colSpan={isSocio ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </div>
          {isSocio && summary.missingRate && (
            <p className="sv-note sv-ot-footnote">* Hay horas de profesores sin €/h extra configurado; no se incluyen en el importe.</p>
          )}
        </div>
      )}

      {data && <OvertimePeople people={people} isSocio={isSocio} onChanged={reload} />}

      {isSocio && active.length > 0 && <OvertimeRates people={active} onSaved={reload} />}
    </div>
  )
}
