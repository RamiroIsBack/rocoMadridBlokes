import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  usePayroll, usePayrollHistory, savePayrollConfig, savePayrollPersonal, setOvertimeStatus,
  typeLabel, hasBase, sortByType,
} from '../hooks/useOvertime'
import { currentMonth, shiftMonth, monthLabel, monthShort, fmtDate, fmtHours, fmtEur } from '../utils/monthFormat'

const BASE_COLOR  = '#a78bfa'
const EXTRA_COLOR = '#f5c842'

function StatusBadge({ status, onClick, disabled }) {
  const label = status === 'pagado' ? 'Pagado' : 'Pendiente'
  const cls   = `sa-pay-status sa-pay-status--${status}`
  return onClick
    ? <button className={`${cls} sa-pay-status--btn`} onClick={onClick} disabled={disabled} title="Cambiar estado">{label}</button>
    : <span className={cls}>{label}</span>
}

// ─── Configuración: nómina base + €/h extra ─────────────────────────────────
function PayrollConfig({ people, config, onSaved }) {
  const active = sortByType(people.filter(p => p.active))
  const toForm = cfg => Object.fromEntries(active.map(p => [p.id, {
    base: cfg.base?.[p.id] ?? '',
    rate: cfg.rates?.[p.id] ?? '',
    note: cfg.notes?.[p.id] ?? '',
  }]))

  const [form,     setForm]     = useState(() => toForm(config))
  const [saving,   setSaving]   = useState(false)
  const [feedback, setFeedback] = useState('')

  // Solo se rehace el formulario si cambian las personas activas, para no pisar cambios sin guardar.
  const key = active.map(p => p.id).join(',')
  useEffect(() => { setForm(toForm(config)) }, [key])

  const set = (id, field, value) => setForm(f => ({ ...f, [id]: { ...f[id], [field]: value } }))

  async function handleSave() {
    setSaving(true)
    try {
      const base  = {}
      const rates = {}
      const notes = {}
      for (const p of active) {
        if (hasBase(p.type)) base[p.id] = form[p.id]?.base ?? ''
        rates[p.id] = form[p.id]?.rate ?? ''
        notes[p.id] = form[p.id]?.note ?? ''
      }
      const saved = await savePayrollConfig({ base, rates, notes })
      setForm(toForm(saved))
      setFeedback('✓ Guardado')
      onSaved()
    } catch (e) {
      setFeedback(`✗ ${e.message}`)
    } finally {
      setSaving(false)
      setTimeout(() => setFeedback(''), 2800)
    }
  }

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Configuración</h2>
      </div>
      <p className="sa-pay-note">
        Nómina base mensual fija (profesores y voluntarios; los externos cobran solo extras), su justificación y €/h de las horas extra.
        Los importes base iniciales vienen de los costes mensuales de Playground: revisadlos y actualizadlos.
        Al marcar horas como pagadas se guarda el €/h de ese momento, así que cambiarlo no altera lo ya pagado.
      </p>
      <div className="sa-pay-scroll">
        <table className="sa-pay-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Tipo</th>
              <th className="sa-pay-num">Nómina base / mes</th>
              <th className="sa-pay-num">€/h extra</th>
              <th>Justificación de la base</th>
            </tr>
          </thead>
          <tbody>
            {active.map(p => (
              <tr key={p.id}>
                <td className="sa-pay-nowrap"><span className="sa-pay-dot" style={{ background: p.color }} />{p.name}</td>
                <td className="sa-pay-muted">{typeLabel(p.type)}</td>
                <td className="sa-pay-num">
                  {hasBase(p.type)
                    ? <input
                        type="number" min="0" step="0.01" placeholder="—" className="sa-pay-input"
                        value={form[p.id]?.base ?? ''} onChange={e => set(p.id, 'base', e.target.value)}
                      />
                    : <span className="sa-pay-muted">—</span>}
                </td>
                <td className="sa-pay-num">
                  <input
                    type="number" min="0" step="0.01" placeholder="—" className="sa-pay-input"
                    value={form[p.id]?.rate ?? ''} onChange={e => set(p.id, 'rate', e.target.value)}
                  />
                </td>
                <td className="sa-pay-note-cell">
                  <textarea
                    rows={2} maxLength={1000} className="sa-pay-textarea"
                    placeholder={hasBase(p.type) ? 'Ej. 20 h/semana, 6 clases + coordinación' : 'Ej. colaborador puntual'}
                    value={form[p.id]?.note ?? ''} onChange={e => set(p.id, 'note', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sa-pay-actions">
        <button className="sa-list-save__btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {feedback && <span className="sa-pay-feedback">{feedback}</span>}
      </div>
    </div>
  )
}

// ─── Evolución últimos 12 meses ─────────────────────────────────────────────
function PayrollHistory({ history }) {
  const { data, loading, error } = history
  const rows = (data?.data || []).map(r => ({ ...r, label: monthShort(r.month) }))

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Evolución (12 meses)</h2>
      </div>
      {loading && !data ? <p className="sa-loading">Cargando…</p>
        : error ? <p className="sa-error">Error: {error}</p>
        : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1a12" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} width={56}
                  tickFormatter={v => `${Math.round(v / 100) / 10}k`} />
                <Tooltip
                  contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12 }}
                  formatter={(v, k) => [fmtEur(v), k === 'base' ? 'Nómina base' : 'Extras']}
                  labelFormatter={(_, p) => p?.[0] ? monthLabel(p[0].payload.month) : ''}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Legend formatter={k => (k === 'base' ? 'Nómina base' : 'Extras')} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="base"   stackId="a" fill={BASE_COLOR} />
                <Bar dataKey="extras" stackId="a" fill={EXTRA_COLOR} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="sa-pay-note">
              La nómina base se calcula con los importes actuales para todos los meses; los extras son los registrados en cada mes.
            </p>
          </>
        )}
    </div>
  )
}

// ─── Fichas de persona ──────────────────────────────────────────────────────
const PERSONAL_FIELDS = [
  { key: 'full_name',  label: 'Nombre y apellidos' },
  { key: 'dni',        label: 'DNI' },
  { key: 'birth_date', label: 'Fecha de nacimiento', type: 'date' },
  { key: 'address',    label: 'Dirección' },
  { key: 'phone',      label: 'Teléfono', type: 'tel' },
  { key: 'email',      label: 'Email', type: 'email' },
]

const fmtPersonal = (field, value) =>
  !value ? '—' : field.type === 'date' ? fmtDate(value) : value

function PersonCards({ people, rowById, selected, onSelect }) {
  return (
    <div className="sa-pay-cards">
      {people.map(p => {
        const r = rowById[p.id]
        const isSel = selected === p.id
        return (
          <button
            key={p.id}
            className={`sa-pay-card${isSel ? ' sa-pay-card--active' : ''}${p.active ? '' : ' sa-pay-card--inactive'}`}
            style={{ '--card-color': p.color }}
            onClick={() => onSelect(isSel ? null : p.id)}
            aria-pressed={isSel}
          >
            <span className="sa-pay-card__head">
              <span className="sa-pay-dot" style={{ background: p.color }} />
              <span className="sa-pay-card__name">{p.name}</span>
            </span>
            <span className="sa-pay-card__type">{typeLabel(p.type)}{p.active ? '' : ' · inactivo'}</span>
            <span className="sa-pay-card__stat">
              <span>Total mes</span>
              <strong>{r ? fmtEur(r.total) : '—'}</strong>
            </span>
            <span className="sa-pay-card__stat">
              <span>Horas extra</span>
              <strong>{r && r.hours ? `${fmtHours(r.hours)} h` : '—'}</strong>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PersonFile({ person, personal, onSaved }) {
  const [editing,  setEditing]  = useState(false)
  const [form,     setForm]     = useState(personal)
  const [saving,   setSaving]   = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => { setForm(personal); setEditing(false) }, [person.id])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await savePayrollPersonal(person.id, form)
      await onSaved()
      setEditing(false)
      setFeedback('✓ Ficha guardada')
    } catch (err) {
      setFeedback(`✗ ${err.message}`)
    } finally {
      setSaving(false)
      setTimeout(() => setFeedback(''), 2800)
    }
  }

  return (
    <div className="sa-pay-file" style={{ '--card-color': person.color }}>
      <div className="sa-pay-file__head">
        <h3 className="sa-pay-file__title">Ficha de {person.name}</h3>
        {!editing && (
          <button className="sa-pay-action" onClick={() => { setForm(personal); setEditing(true) }}>Editar</button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSave}>
          <div className="sa-pay-file__grid">
            {PERSONAL_FIELDS.map(f => (
              <label key={f.key} className="sa-pay-file__field">
                <span>{f.label}</span>
                <input
                  type={f.type || 'text'} maxLength={200} className="sa-pay-file__input"
                  value={form[f.key] || ''}
                  onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="sa-pay-actions">
            <button type="submit" className="sa-list-save__btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ficha'}</button>
            <button type="button" className="sa-pay-action" onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <dl className="sa-pay-file__grid">
          {PERSONAL_FIELDS.map(f => (
            <div key={f.key} className="sa-pay-file__item">
              <dt>{f.label}</dt>
              <dd>{fmtPersonal(f, personal[f.key])}</dd>
            </div>
          ))}
        </dl>
      )}
      {feedback && <p className="sa-pay-feedback">{feedback}</p>}
      <p className="sa-pay-note">Datos personales: solo visibles para socios. No los compartas fuera de la app.</p>
    </div>
  )
}

// ─── Informe para imprimir / guardar como PDF ───────────────────────────────
// Se monta directamente en <body> y está oculto en pantalla; al imprimir con printReport()
// es lo único visible (ver SuperAdminPage.css), así no salen páginas en blanco.
function PayrollReport({ month, person, personal, notes, rows, entries, totals, byId }) {
  const today = fmtDate(new Date().toISOString().slice(0, 10))
  const row   = person ? rows[0] : null
  return createPortal(
    <div className="pay-report-root" aria-hidden="true"><div className="pay-report">
      <header className="pay-report__header">
        <div>
          <p className="pay-report__org">Rocoteca Madrid</p>
          <h1>{person ? `Informe de nómina · ${person.name}` : 'Informe de nóminas'}</h1>
          <p className="pay-report__sub">{monthLabel(month)}</p>
        </div>
        <p className="pay-report__date">Generado el {today}</p>
      </header>

      {person && (
        <section>
          <h2>Datos personales</h2>
          <table className="pay-report__kv">
            <tbody>
              {PERSONAL_FIELDS.map(f => (
                <tr key={f.key}><th>{f.label}</th><td>{fmtPersonal(f, personal[f.key])}</td></tr>
              ))}
              <tr><th>Tipo</th><td>{typeLabel(person.type)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>{person ? 'Nómina del mes' : 'Nómina por persona'}</h2>
        {person && !row ? <p>Sin nómina ni horas extra este mes.</p> : (
          <table className="pay-report__table">
            <thead>
              <tr>
                {!person && <th>Persona</th>}
                <th className="num">Nómina base</th>
                <th className="num">Horas extra</th>
                <th className="num">€/h extra</th>
                <th className="num">Extras</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  {!person && <td>{r.name}{r.type !== 'profesor' ? ` (${typeLabel(r.type).toLowerCase()})` : ''}</td>}
                  <td className="num">{hasBase(r.type) ? fmtEur(r.base) : '—'}</td>
                  <td className="num">{fmtHours(r.hours)}</td>
                  <td className="num">{r.rate == null ? '—' : fmtEur(r.rate)}</td>
                  <td className="num">{fmtEur(r.extras)}</td>
                  <td className="num"><strong>{fmtEur(r.total)}</strong></td>
                </tr>
              ))}
            </tbody>
            {!person && totals && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{fmtEur(totals.base)}</td>
                  <td className="num">{fmtHours(totals.hours)}</td>
                  <td />
                  <td className="num">{fmtEur(totals.extras)}</td>
                  <td className="num"><strong>{fmtEur(totals.total)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
        {person && notes[person.id] && (
          <p className="pay-report__note"><strong>Justificación de la base:</strong> {notes[person.id]}</p>
        )}
      </section>

      <section>
        <h2>Detalle de horas extra</h2>
        {entries.length === 0 ? <p>No hay horas extra registradas este mes.</p> : (
          <table className="pay-report__table">
            <thead>
              <tr>
                <th>Fecha</th>
                {!person && <th>Persona</th>}
                <th className="num">Horas</th>
                <th>Motivo</th>
                <th className="num">€/h</th>
                <th className="num">Importe</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}</td>
                  {!person && <td>{byId[e.professor]?.name || e.professor}</td>}
                  <td className="num">{fmtHours(e.hours)}</td>
                  <td>{e.reason}</td>
                  <td className="num">{e.rate == null ? '—' : fmtEur(e.rate)}</td>
                  <td className="num">{fmtEur(e.amount)}</td>
                  <td>{e.status === 'pagado' ? 'Pagado' : 'Pendiente'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div></div>,
    document.body,
  )
}

// Imprime solo el informe: marca el body para el CSS de impresión y pone un título
// que el navegador usa como nombre del PDF.
function printReport(filename) {
  const prevTitle = document.title
  const cleanup = () => {
    document.body.classList.remove('pay-printing')
    document.title = prevTitle
    window.removeEventListener('afterprint', cleanup)
  }
  document.title = filename
  document.body.classList.add('pay-printing')
  window.addEventListener('afterprint', cleanup)
  window.print()
}

// ─── Pestaña Nóminas ────────────────────────────────────────────────────────
export default function PayrollSection() {
  const [month,    setMonth]    = useState(currentMonth)
  const [busy,     setBusy]     = useState(false)
  const [feedback, setFeedback] = useState('')

  const { data, loading, error, reload } = usePayroll(month)
  const history = usePayrollHistory(month)

  const rows    = data?.rows || []
  const totals  = data?.totals
  const entries = data?.entries || []
  const people  = data?.people || []
  const byId    = Object.fromEntries(people.map(p => [p.id, p]))
  const notes   = data?.config?.notes || {}
  const personal = data?.personal || {}

  // Ficha seleccionada: filtra las tablas a esa persona
  const [selected, setSelected] = useState(null)
  const cardPeople   = sortByType(people.filter(p => p.active || rows.some(r => r.id === p.id)))
  const rowById      = Object.fromEntries(rows.map(r => [r.id, r]))
  const selPerson    = selected ? byId[selected] : null
  const shownRows    = selected ? rows.filter(r => r.id === selected) : rows
  const shownEntries = selected ? entries.filter(e => e.professor === selected) : entries
  const missingRate  = shownRows.some(r => r.missing_rate)

  function handlePrint() {
    const who = selPerson ? selPerson.name.replace(/\s+/g, '_') : 'todas'
    printReport(`Nomina_${who}_${month}`)
  }

  async function run(action, okMsg) {
    setBusy(true)
    try {
      await action()
      await Promise.all([reload(), history.reload()])
      if (okMsg) setFeedback(okMsg)
    } catch (e) {
      setFeedback(`✗ ${e.message}`)
    } finally {
      setBusy(false)
      setTimeout(() => setFeedback(''), 2800)
    }
  }

  const refreshAll = () => Promise.all([reload(), history.reload()])

  return (
    <>
      <div className="sa-section">
        <div className="sa-section__header">
          <h2 className="sa-section-title">Nóminas</h2>
          <div className="sa-header-controls">
            {data && (
              <button className="sa-pay-action sa-pay-print" onClick={handlePrint}>
                ⎙ {selPerson ? `Informe de ${selPerson.name}` : 'Informe del mes'} (PDF)
              </button>
            )}
            <button className="sa-period__btn" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Mes anterior">◀</button>
            <span className="sa-pay-month">{monthLabel(month)}</span>
            <button className="sa-period__btn" onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Mes siguiente">▶</button>
          </div>
        </div>

        {loading && !data ? <p className="sa-loading">Cargando…</p>
          : error ? <p className="sa-error">Error: {error}</p>
          : (
            <>
              {/* ── Resumen ── */}
              <div className="sa-kpis">
                <div className="sa-kpi" style={{ '--kpi-color': BASE_COLOR }}>
                  <span className="sa-kpi__value">{fmtEur(totals.base)}</span>
                  <span className="sa-kpi__label">Nóminas base</span>
                </div>
                <div className="sa-kpi" style={{ '--kpi-color': EXTRA_COLOR }}>
                  <span className="sa-kpi__value">{fmtEur(totals.extras)}</span>
                  <span className="sa-kpi__label">Extras · {fmtHours(totals.hours)} h</span>
                </div>
                <div className="sa-kpi" style={{ '--kpi-color': '#34d399' }}>
                  <span className="sa-kpi__value">{fmtEur(totals.total)}</span>
                  <span className="sa-kpi__label">Total del mes</span>
                </div>
                <div className="sa-kpi" style={{ '--kpi-color': '#f97316' }}>
                  <span className="sa-kpi__value">{fmtEur(totals.pending_extras)}</span>
                  <span className="sa-kpi__label">Extras pendientes de pago</span>
                </div>
              </div>

              {/* ── Fichas ── */}
              <h3 className="sa-pay-subtitle">Fichas</h3>
              <PersonCards people={cardPeople} rowById={rowById} selected={selected} onSelect={setSelected} />
              {selPerson && (
                <PersonFile person={selPerson} personal={personal[selPerson.id] || {}} onSaved={reload} />
              )}

              {/* ── Nómina por persona ── */}
              <h3 className="sa-pay-subtitle">
                Nómina por persona{selPerson && <span className="sa-pay-filter"> · {selPerson.name} <button className="sa-pay-filter__clear" onClick={() => setSelected(null)} aria-label="Quitar filtro">✕</button></span>}
              </h3>
              <div className="sa-pay-scroll">
                <table className="sa-pay-table">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th className="sa-pay-num">Base</th>
                      <th className="sa-pay-num">Horas extra</th>
                      <th className="sa-pay-num">€/h</th>
                      <th className="sa-pay-num">Extras</th>
                      <th className="sa-pay-num">Total</th>
                      <th>Estado extras</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.length === 0 && (
                      <tr><td colSpan={8} className="sa-pay-muted">Sin nómina ni horas extra este mes.</td></tr>
                    )}
                    {shownRows.map(r => {
                      const hasHours = r.pending + r.paid > 0
                      const allPaid  = hasHours && r.pending === 0
                      return (
                        <tr key={r.id}>
                          <td className="sa-pay-nowrap">
                            <span className="sa-pay-dot" style={{ background: r.color }} />{r.name}
                            {r.type !== 'profesor' && <span className="sa-pay-tag">{typeLabel(r.type).toLowerCase()}</span>}
                            {!r.active && <span className="sa-pay-tag">inactivo</span>}
                          </td>
                          <td className="sa-pay-num" title={notes[r.id] || undefined}>
                            {hasBase(r.type) ? fmtEur(r.base) : <span className="sa-pay-muted">—</span>}
                            {notes[r.id] && <span className="sa-pay-info"> ⓘ</span>}
                          </td>
                          <td className="sa-pay-num">{hasHours ? fmtHours(r.hours) : <span className="sa-pay-muted">0</span>}</td>
                          <td className="sa-pay-num">{r.rate == null ? <span className="sa-pay-muted">—</span> : fmtEur(r.rate)}</td>
                          <td className="sa-pay-num">
                            {hasHours ? fmtEur(r.extras) : <span className="sa-pay-muted">—</span>}
                            {r.missing_rate && <span className="sa-pay-warn" title="Hay horas sin €/h configurado"> *</span>}
                          </td>
                          <td className="sa-pay-num sa-pay-strong">{fmtEur(r.total)}</td>
                          <td>
                            {hasHours && (
                              <span className={`sa-pay-status sa-pay-status--${allPaid ? 'pagado' : 'pendiente'}`}>
                                {allPaid ? 'Pagado' : r.paid ? `${r.pending} pendiente${r.pending > 1 ? 's' : ''}` : 'Pendiente'}
                              </span>
                            )}
                          </td>
                          <td className="sa-pay-nowrap">
                            {hasHours && (
                              <button
                                className="sa-pay-action" disabled={busy}
                                onClick={() => run(
                                  () => setOvertimeStatus({ month, professor: r.id }, allPaid ? 'pendiente' : 'pagado'),
                                  allPaid ? `✓ ${r.name}: extras pendientes` : `✓ ${r.name}: extras pagados`,
                                )}
                              >{allPaid ? 'Marcar pendiente' : 'Marcar pagado'}</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {!selected && <tfoot>
                    <tr className="sa-pay-total">
                      <td>Total</td>
                      <td className="sa-pay-num">{fmtEur(totals.base)}</td>
                      <td className="sa-pay-num">{fmtHours(totals.hours)}</td>
                      <td />
                      <td className="sa-pay-num">{fmtEur(totals.extras)}</td>
                      <td className="sa-pay-num">{fmtEur(totals.total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>}
                </table>
              </div>
              {missingRate && (
                <p className="sa-pay-note">* Hay horas extra sin €/h configurado: no se incluyen en el importe. Añádelo en Configuración.</p>
              )}
              {feedback && <p className="sa-pay-feedback">{feedback}</p>}

              {/* ── Detalle de horas extra ── */}
              <h3 className="sa-pay-subtitle">Detalle de horas extra{selPerson && <span className="sa-pay-filter"> · {selPerson.name}</span>}</h3>
              {shownEntries.length === 0
                ? <p className="sa-pay-muted sa-pay-empty">No hay horas extra registradas este mes.</p>
                : (
                  <div className="sa-pay-scroll">
                    <table className="sa-pay-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Persona</th>
                          <th className="sa-pay-num">Horas</th>
                          <th>Motivo</th>
                          <th className="sa-pay-num">€/h</th>
                          <th className="sa-pay-num">Importe</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownEntries.map(e => {
                          const p = byId[e.professor]
                          return (
                            <tr key={e.id}>
                              <td className="sa-pay-nowrap">{fmtDate(e.date)}</td>
                              <td className="sa-pay-nowrap"><span className="sa-pay-dot" style={{ background: p?.color }} />{p?.name || e.professor}</td>
                              <td className="sa-pay-num">{fmtHours(e.hours)}</td>
                              <td className="sa-pay-reason">{e.reason}</td>
                              <td className="sa-pay-num">{e.rate == null ? <span className="sa-pay-muted">sin precio</span> : fmtEur(e.rate)}</td>
                              <td className="sa-pay-num">{fmtEur(e.amount)}</td>
                              <td>
                                <StatusBadge
                                  status={e.status} disabled={busy}
                                  onClick={() => run(() => setOvertimeStatus({ id: e.id }, e.status === 'pagado' ? 'pendiente' : 'pagado'))}
                                />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              <p className="sa-pay-note">Las horas las registra gestión en Supervisión → Horas extra.</p>
            </>
          )}
      </div>

      <PayrollHistory history={history} />

      {data && <PayrollConfig people={people} config={data.config} onSaved={refreshAll} />}

      {data && (
        <PayrollReport
          month={month} person={selPerson} personal={selPerson ? personal[selPerson.id] || {} : {}}
          notes={notes} rows={shownRows} entries={shownEntries} totals={totals} byId={byId}
        />
      )}
    </>
  )
}
