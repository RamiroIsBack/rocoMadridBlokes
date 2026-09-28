import { useState, useMemo } from 'react'
import {
  useOvertime, createOvertime, updateOvertime, deleteOvertime,
  addOvertimePerson, updateOvertimePerson, PERSON_TYPES, sortByType, typeLabel,
} from '../hooks/useOvertime'
import { todayISO, currentMonth, shiftMonth, monthLabel, fmtDate, fmtHours } from '../utils/monthFormat'

// Hoy si cae en el mes visible; si no, el día 1 de ese mes.
function defaultDate(month) {
  const today = todayISO()
  return today.startsWith(month) ? today : `${month}-01`
}

const emptyForm = month => ({ professor: '', date: defaultDate(month), hours: '', reason: '' })

// ─── Personas (gestion y socio añaden; solo socio edita/desactiva) ──────────
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
  const groups  = PERSON_TYPES
    .map(t => [t, visible.filter(p => p.type === t.id)])
    .filter(([, list]) => list.length > 0)

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Personas</h3>
      <p className="sv-note">
        Profesores, voluntarios y colaboradores externos que pueden tener horas extra.
        {isSocio
          ? ' Desactivar a alguien lo quita del desplegable pero conserva sus horas y su nombre en el historial.'
          : ' Si falta alguien, añádelo aquí. Para quitar o renombrar, pídeselo a un socio.'}
      </p>

      {groups.map(([t, list]) => (
        <div key={t.id} className="sv-ot-people">
          <span className="sv-ot-people__label">{t.plural}</span>
          <ul className="sv-ot-people__list">
            {list.map(p => (
              <li key={p.id} className={`sv-ot-person${p.active ? '' : ' sv-ot-person--inactive'}`}>
                <span className="sv-ot-dot" style={{ background: p.color }} />
                <span className="sv-ot-person__name">{p.name}</span>
                {!p.active && <span className="sv-ot-person__tag">inactivo</span>}
                {isSocio && (
                  <span className="sv-ot-person__actions">
                    <button className="sv-ot-action" disabled={busy} onClick={() => handleRename(p)}>Renombrar</button>
                    <select
                      className="sv-tests-select sv-ot-type-select" disabled={busy} value={p.type}
                      aria-label={`Tipo de ${p.name}`}
                      onChange={e => run(() => updateOvertimePerson(p.id, { type: e.target.value }), '✓ Tipo cambiado')}
                    >
                      {PERSON_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
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
          {PERSON_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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
      if (!byProf[e.professor]) byProf[e.professor] = { hours: 0, pending: 0, paid: 0 }
      const s = byProf[e.professor]
      s.hours += e.hours
      s[e.status === 'pagado' ? 'paid' : 'pending']++
    }
    // Todas las personas activas (aunque tengan 0 h) y las inactivas que tengan horas este mes
    const empty = { hours: 0, pending: 0, paid: 0 }
    const rows  = sortByType(people)
      .filter(p => p.active || byProf[p.id])
      .map(p => ({ ...p, ...(byProf[p.id] || empty) }))
    return { rows, hours: rows.reduce((t, r) => t + r.hours, 0) }
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
              {PERSON_TYPES.map(t => {
                // Al editar un registro de alguien ya inactivo, se sigue mostrando esa persona
                const opts = people.filter(p => p.type === t.id && (p.active || p.id === form.professor))
                return opts.length > 0 && (
                  <optgroup key={t.id} label={t.plural}>
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
                        <td>
                          <span className={`sv-ot-status sv-ot-status--${e.status}`}>
                            {e.status === 'pagado' ? 'Pagado' : 'Pendiente'}
                          </span>
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
      {data && (
        <div className="sv-section">
          <h3 className="sv-section-title">Resumen del mes</h3>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table sv-ot-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tipo</th>
                  <th className="sv-ot-num">Horas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map(r => {
                  const hasHours = r.pending + r.paid > 0
                  const allPaid  = hasHours && r.pending === 0
                  return (
                    <tr key={r.id} className={hasHours ? '' : 'sv-ot-row--empty'}>
                      <td className="sv-ot-nowrap">
                        <span className="sv-ot-dot" style={{ background: r.color }} />{r.name}
                        {!r.active && <span className="sv-ot-person__tag sv-ot-tag--inline">inactivo</span>}
                      </td>
                      <td className="sv-ot-muted">{typeLabel(r.type)}</td>
                      <td className="sv-ot-num">{fmtHours(r.hours)}</td>
                      <td>
                        {hasHours && <span className={`sv-ot-status sv-ot-status--${allPaid ? 'pagado' : 'pendiente'}`}>
                          {allPaid ? 'Pagado' : r.paid ? `${r.pending} pendiente${r.pending > 1 ? 's' : ''}` : 'Pendiente'}
                        </span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="sv-ot-total">
                  <td>Total</td>
                  <td />
                  <td className="sv-ot-num">{fmtHours(summary.hours)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="sv-note sv-ot-footnote">
            Los importes y el estado de pago se gestionan en Superadmin → Nóminas.
          </p>
        </div>
      )}

      {data && <OvertimePeople people={people} isSocio={isSocio} onChanged={reload} />}
    </div>
  )
}
