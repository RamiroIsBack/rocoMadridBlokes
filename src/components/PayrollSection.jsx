import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  usePayroll, usePayrollHistory, savePayrollConfig, savePayrollPersonal, setOvertimeStatus, setPayrollAbsence,
  setPayrollPayment, setPayrollCash, deletePayrollPartial, addPayrollPartial,
  typeLabel, hasBase, sortByType,
} from '../hooks/useOvertime'
import RemittanceImport from './RemittanceImport'
import PartialPayment from './PartialPayment'
import { todayISO, currentMonth, shiftMonth, monthLabel, monthShort, fmtDate, fmtHours, fmtEur } from '../utils/monthFormat'

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
    cash: cfg.cash_total?.[p.id] ?? '',
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
      const cash  = {}
      for (const p of active) {
        if (hasBase(p.type)) base[p.id] = form[p.id]?.base ?? ''
        if (hasBase(p.type)) cash[p.id] = form[p.id]?.cash ?? ''
        rates[p.id] = form[p.id]?.rate ?? ''
        notes[p.id] = form[p.id]?.note ?? ''
      }
      const saved = await savePayrollConfig({ base, rates, notes, cash_total: cash })
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
        La nómina base es el importe que se paga a la persona cada mes (no el coste de gestoría).
        "Total pactado" solo para quien cobra parte en efectivo: el banco paga la nómina y el resto
        hasta el total pactado, más las horas extra, se entrega en efectivo (si el banco paga menos, el efectivo sube).
        Al marcar horas como pagadas se guarda el €/h de ese momento, así que cambiarlo no altera lo ya pagado.
      </p>
      <div className="sa-pay-scroll">
        <table className="sa-pay-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Tipo</th>
              <th className="sa-pay-num">Nómina base / mes</th>
              <th className="sa-pay-num" title="Solo si cobra parte en efectivo">Total pactado</th>
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
                  {hasBase(p.type)
                    ? <input
                        type="number" min="0" step="0.01" placeholder="—" className="sa-pay-input"
                        title="Banco + efectivo. Déjalo vacío si cobra todo por banco"
                        value={form[p.id]?.cash ?? ''} onChange={e => set(p.id, 'cash', e.target.value)}
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
  { key: 'iban',       label: 'IBAN', placeholder: 'ES00 0000 0000 0000 0000 0000' },
]

// El IBAN se guarda sin espacios; se muestra en bloques de 4
const fmtPersonal = (field, value) =>
  !value ? '—'
    : field.type === 'date' ? fmtDate(value)
    : field.key === 'iban' ? value.replace(/(.{4})/g, '$1 ').trim()
    : value

function PersonCards({ people, selected, onSelect }) {
  return (
    <div className="sa-pay-chips">
      {people.map(p => {
        const isSel = selected === p.id
        return (
          <button
            key={p.id}
            className={`sa-pay-chip${isSel ? ' sa-pay-chip--active' : ''}${p.active ? '' : ' sa-pay-chip--inactive'}`}
            style={{ '--card-color': p.color }}
            onClick={() => onSelect(isSel ? null : p.id)}
            aria-expanded={isSel}
            title={`${typeLabel(p.type)}${p.active ? '' : ' · inactivo'}`}
          >
            <span className="sa-pay-dot" style={{ background: p.color }} />
            {p.name}
          </button>
        )
      })}
    </div>
  )
}

function PersonFile({ person, row, personal, onSaved }) {
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
        <div>
          <h3 className="sa-pay-file__title">Ficha de {person.name}</h3>
          <p className="sa-pay-file__meta">
            {typeLabel(person.type)}{person.active ? '' : ' · inactivo'}
            {' · '}Total mes: <strong>{row ? fmtEur(row.total) : '—'}</strong>
            {' · '}Horas extra: <strong>{row && row.hours ? `${fmtHours(row.hours)} h` : '0 h'}</strong>
            {row?.absent && <>{' · '}<span className="sa-pay-tag sa-pay-tag--absent">sin asistencia este mes</span></>}
          </p>
        </div>
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
                  placeholder={f.placeholder}
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

// ─── Pagos del mes de una persona (en la ficha desplegada) ──────────────────
// Controles finos: nómina, horas extra, efectivo del pago mixto y pagos parciales (con ✕).
function PersonPayments({ row, month, busy, run, onToggleNomina }) {
  const absenceBtn = row.base_nominal != null && (
    <button
      className={`sa-pay-action${row.absent ? ' sa-pay-action--on' : ''}`} disabled={busy}
      title="La nómina base de este mes no se reporta; el mes siguiente vuelve a contar"
      onClick={() => run(
        () => setPayrollAbsence(month, row.id, !row.absent),
        row.absent ? `✓ ${row.name}: asistencia restaurada` : `✓ ${row.name}: sin asistencia este mes`,
      )}
    >{row.absent ? 'Quitar sin asistencia' : 'Sin asistencia este mes'}</button>
  )
  const hasHours = row.pending + row.paid > 0
  const allPaid  = hasHours && row.pending === 0
  return (
    <div className="sa-pay-person-pay">
      <div className="sa-pay-person-pay__head">
        <h4 className="sa-pay-person-pay__title">Pagos de {monthLabel(month).toLowerCase()}</h4>
        {absenceBtn}
      </div>
      <div className="sa-pay-person-pay__grid">
        {row.nomina_status && (
          <div>
            <span className="sa-pay-person-pay__label">Nómina {fmtEur(row.base)}</span>
            <button
              className={`sa-pay-status sa-pay-status--btn sa-pay-status--${row.nomina_status}`} disabled={busy}
              title={row.payment ? 'Pulsa para quitar el pago' : 'Pulsa para marcar la nómina como pagada'}
              onClick={() => onToggleNomina(row)}
            >{{ pagado: 'Pagado', parcial: 'Parcial', pendiente: 'Pendiente' }[row.nomina_status]}</button>
            {row.payment && (
              <span className="sa-pay-paid">
                {' '}{row.payment.amount != null ? `banco ${fmtEur(row.payment.amount)}` : 'marcado a mano'}
                {row.payment.date ? ` · ${fmtDate(row.payment.date)}` : ''}
              </span>
            )}
            {row.difference != null && Math.abs(row.difference) > 0.01 && (
              <span className="sa-pay-warn"> · dif. {row.difference > 0 ? '+' : ''}{fmtEur(row.difference)}</span>
            )}
          </div>
        )}
        {hasHours && (
          <div>
            <span className="sa-pay-person-pay__label">Horas extra {fmtEur(row.extras)} · {fmtHours(row.hours)} h</span>
            <button
              className={`sa-pay-status sa-pay-status--btn sa-pay-status--${allPaid ? 'pagado' : row.partial_extras > 0 ? 'parcial' : 'pendiente'}`}
              disabled={busy}
              onClick={() => run(
                () => setOvertimeStatus({ month, professor: row.id }, allPaid ? 'pendiente' : 'pagado'),
                allPaid ? `✓ ${row.name}: extras pendientes` : `✓ ${row.name}: extras pagados`,
              )}
            >{allPaid ? 'Pagado' : row.partial_extras > 0 ? `Parcial · falta ${fmtEur(row.extras_outstanding)}` : 'Pendiente'}</button>
          </div>
        )}
        {row.cash_total != null && (
          <div>
            <span className="sa-pay-person-pay__label">
              Efectivo pactado {fmtEur(row.cash_paid ? row.cash_paid.amount : row.cash_due)}
              {!row.cash_paid && row.cash_estimated ? ' (estimado)' : ''}
            </span>
            <button
              className={`sa-pay-status sa-pay-status--btn sa-pay-status--${row.cash_paid ? 'pagado' : 'pendiente'}`}
              disabled={busy || (!row.cash_paid && row.cash_due <= 0)}
              onClick={() => run(
                () => setPayrollCash(month, row.id, !row.cash_paid, row.cash_due),
                row.cash_paid ? `✓ ${row.name}: efectivo pendiente` : `✓ ${row.name}: efectivo entregado`,
              )}
            >{row.cash_paid ? `Entregado ${fmtDate(row.cash_paid.date).slice(0, 5)}` : 'Pendiente'}</button>
          </div>
        )}
      </div>
      {row.partials?.length > 0 && (
        <ul className="sa-pay-person-pay__list">
          {row.partials.map(x => (
            <li key={x.id}>
              💶 {fmtEur(x.amount)} · {x.concept === 'extras' ? 'horas extra' : 'nómina'} · {fmtDate(x.date)}
              <span className="sa-pay-muted"> · {x.note}</span>
              <button
                className="sa-pay-filter__clear" disabled={busy} aria-label="Borrar pago parcial"
                onClick={() => {
                  if (!window.confirm(`¿Borrar el pago en efectivo de ${fmtEur(x.amount)} de ${row.name}?`)) return
                  run(() => deletePayrollPartial(month, x.id), '✓ Pago parcial borrado')
                }}
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Texto del desglose del efectivo (para el tooltip de la tabla)
function cashDetail(r) {
  const parts = (r.partials || []).map(x => `${fmtEur(x.amount)} ${x.concept === 'extras' ? 'extras' : 'nómina'} ${fmtDate(x.date)} — ${x.note}`)
  if (r.cash_paid) parts.unshift(`${fmtEur(r.cash_paid.amount)} efectivo pactado ${fmtDate(r.cash_paid.date)}`)
  return parts.join('\n')
}

// ─── Informe para imprimir / guardar como PDF ───────────────────────────────
// Se monta directamente en <body> y está oculto en pantalla; al imprimir con printReport()
// es lo único visible (ver SuperAdminPage.css), así no salen páginas en blanco.
const CLUB_NAME = 'Rocoteca Madrid'
const CLUB_LOGO = 'https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png'

function reportRef(month, person) {
  return `NOM-${month}-${person ? person.id.toUpperCase() : 'GENERAL'}`
}

function PayrollReport({ month, person, personal, notes, rows, entries, totals, byId }) {
  const today = fmtDate(new Date().toISOString().slice(0, 10))
  const row   = person ? rows[0] : null
  // Cifras del informe: las de la persona o las totales del mes
  const sum = person
    ? { base: row?.base ?? null, hours: row?.hours ?? 0, extras: row?.extras ?? 0, total: row?.total ?? 0 }
    : totals || { base: 0, hours: 0, extras: 0, total: 0 }
  const pendingCount = entries.filter(e => e.status !== 'pagado').length

  return createPortal(
    <div className="pay-report-root" aria-hidden="true"><div className="pay-report">
      {/* ── Cabecera corporativa ── */}
      <header className="pr-header">
        <div className="pr-header__brand">
          <img src={CLUB_LOGO} alt="" className="pr-header__logo" />
          <div>
            <p className="pr-header__org">{CLUB_NAME}</p>
            <p className="pr-header__dept">Administración · Nóminas</p>
          </div>
        </div>
        <div className="pr-header__doc">
          <p className="pr-header__kind">{person ? 'Informe de nómina' : 'Informe mensual de nóminas'}</p>
          <p className="pr-header__period">{monthLabel(month)}</p>
        </div>
      </header>

      <dl className="pr-meta">
        <div><dt>{person ? 'Persona' : 'Alcance'}</dt><dd>{person ? (personal.full_name || person.name) : 'Toda la plantilla'}</dd></div>
        <div><dt>Periodo</dt><dd>{monthLabel(month)}</dd></div>
        <div><dt>Referencia</dt><dd>{reportRef(month, person)}</dd></div>
        <div><dt>Fecha de emisión</dt><dd>{today}</dd></div>
      </dl>

      {/* ── Resumen en cifras ── */}
      <div className="pr-kpis">
        <div className="pr-kpi">
          <span className="pr-kpi__label">Nómina base</span>
          <span className="pr-kpi__value">{person && !hasBase(person.type) ? '—' : fmtEur(sum.base ?? 0)}</span>
        </div>
        <div className="pr-kpi">
          <span className="pr-kpi__label">Horas extra</span>
          <span className="pr-kpi__value">{fmtHours(sum.hours)} h</span>
        </div>
        <div className="pr-kpi">
          <span className="pr-kpi__label">Importe extras</span>
          <span className="pr-kpi__value">{fmtEur(sum.extras)}</span>
        </div>
        <div className="pr-kpi pr-kpi--total">
          <span className="pr-kpi__label">Total a percibir</span>
          <span className="pr-kpi__value">{fmtEur(sum.total)}</span>
        </div>
      </div>

      {/* ── Datos personales ── */}
      {person && (
        <section className="pr-section">
          <h2 className="pr-title">1. Datos de la persona</h2>
          <table className="pr-kv">
            <tbody>
              {PERSONAL_FIELDS.map(f => (
                <tr key={f.key}><th>{f.label}</th><td>{fmtPersonal(f, personal[f.key])}</td></tr>
              ))}
              <tr><th>Vinculación</th><td>{typeLabel(person.type)}</td></tr>
            </tbody>
          </table>
        </section>
      )}

      {/* ── Nómina ── */}
      <section className="pr-section">
        <h2 className="pr-title">{person ? '2. Liquidación del mes' : '1. Nómina por persona'}</h2>
        {person && !row ? <p className="pr-empty">Sin nómina ni horas extra este mes.</p> : (
          <table className="pr-table">
            <thead>
              <tr>
                {person ? <th>Concepto</th> : <th>Persona</th>}
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
                  <td>{person ? 'Nómina mensual' : <>{r.name}{r.type !== 'profesor' && <span className="pr-tag">{typeLabel(r.type)}</span>}</>}</td>
                  <td className="num">{!hasBase(r.type) ? '—' : r.absent ? 'Sin asistencia' : fmtEur(r.base)}</td>
                  <td className="num">{fmtHours(r.hours)}</td>
                  <td className="num">{r.rate == null ? '—' : fmtEur(r.rate)}</td>
                  <td className="num">{fmtEur(r.extras)}</td>
                  <td className="num"><strong>{fmtEur(r.total)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{person && !hasBase(person.type) ? '—' : fmtEur(sum.base ?? 0)}</td>
                <td className="num">{fmtHours(sum.hours)}</td>
                <td />
                <td className="num">{fmtEur(sum.extras)}</td>
                <td className="num">{fmtEur(sum.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        {person && notes[person.id] && (
          <p className="pr-note"><strong>Justificación de la nómina base:</strong> {notes[person.id]}</p>
        )}
        {person && row && (
          <p className="pr-note">
            <strong>Estado del pago:</strong>{' '}
            {row.payment
              ? <>{row.outstanding > 0.01 ? 'Pago parcial' : 'Pagado'}{row.payment.date ? ` el ${fmtDate(row.payment.date)}` : ''}{row.payment.amount != null ? ` · ${fmtEur(row.payment.amount)} por banco` : ' (marcado manualmente)'}{row.outstanding > 0.01 ? ` · pendiente ${fmtEur(row.outstanding)}` : ''}</>
              : `Pendiente · ${fmtEur(row.outstanding)}`}
          </p>
        )}
        {person && row && row.partials?.length > 0 && (
          <p className="pr-note">
            <strong>Pagos en efectivo:</strong>{' '}
            {row.partials.map(x => `${fmtEur(x.amount)} ${x.concept === 'extras' ? 'horas extra' : 'nómina'} el ${fmtDate(x.date)} (${x.note})`).join(' · ')}
          </p>
        )}
        {person && row && row.cash_total != null && (
          <p className="pr-note">
            <strong>Pago mixto:</strong> total pactado {fmtEur(row.cash_total)} · banco {fmtEur(row.payment?.amount ?? row.base)}
            {row.payment?.amount == null ? ' (previsto)' : ''} · efectivo {fmtEur(row.cash_paid ? row.cash_paid.amount : row.cash_due)}
            {' '}(incluye horas extra){row.cash_paid ? ` · entregado el ${fmtDate(row.cash_paid.date)}` : ' · pendiente de entregar'}
          </p>
        )}
      </section>

      {/* ── Detalle de horas extra ── */}
      <section className="pr-section">
        <h2 className="pr-title">{person ? '3.' : '2.'} Detalle de horas extra</h2>
        {entries.length === 0 ? <p className="pr-empty">No hay horas extra registradas este mes.</p> : (
          <>
            <table className="pr-table">
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
                    <td className="nowrap">{fmtDate(e.date)}</td>
                    {!person && <td className="nowrap">{byId[e.professor]?.name || e.professor}</td>}
                    <td className="num">{fmtHours(e.hours)}</td>
                    <td>{e.reason}</td>
                    <td className="num">{e.rate == null ? '—' : fmtEur(e.rate)}</td>
                    <td className="num">{fmtEur(e.amount)}</td>
                    <td><span className={`pr-status pr-status--${e.status}`}>{e.status === 'pagado' ? 'Pagado' : 'Pendiente'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pr-note">
              {entries.length} registro{entries.length === 1 ? '' : 's'} · {pendingCount === 0 ? 'todos pagados' : `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} de pago`}.
            </p>
          </>
        )}
      </section>

      {/* ── Firmas (informe individual) ── */}
      {person && (
        <section className="pr-signatures">
          <div>
            <div className="pr-signatures__line" />
            <p>Por {CLUB_NAME}</p>
          </div>
          <div>
            <div className="pr-signatures__line" />
            <p>Conforme: {personal.full_name || person.name}</p>
          </div>
        </section>
      )}

      <footer className="pr-footer">
        <span>{CLUB_NAME} · {reportRef(month, person)}</span>
        <span>Documento confidencial{person ? ' · contiene datos personales' : ''} · uso interno</span>
      </footer>
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
  const [showRemesa, setShowRemesa] = useState(false)
  const [showPartial, setShowPartial] = useState(false)
  const cardPeople   = sortByType(people.filter(p => p.active || rows.some(r => r.id === p.id)))
  const rowById      = Object.fromEntries(rows.map(r => [r.id, r]))
  const selPerson    = selected ? byId[selected] : null
  const [payFilter, setPayFilter] = useState('all')   // all | pending | paid
  const isPending    = r => r.outstanding > 0.01
  const isPaid       = r => r.status === 'pagado'
  const counts       = { all: rows.length, pending: rows.filter(isPending).length, paid: rows.filter(isPaid).length }
  const shownRows    = rows
    .filter(r => !selected || r.id === selected)
    .filter(r => payFilter === 'all' || (payFilter === 'pending' ? isPending(r) : isPaid(r)))
  const shownEntries = selected ? entries.filter(e => e.professor === selected) : entries
  const missingRate  = shownRows.some(r => r.missing_rate)

  // Resumen: el de la persona seleccionada (ceros si no tiene nómina ni horas este mes) o el del mes
  const selRow  = selected ? rowById[selected] : null
  const kpi     = !selected ? totals : {
    base:           selRow?.base ?? 0,
    extras:         selRow?.extras ?? 0,
    hours:          selRow?.hours ?? 0,
    total:          selRow?.total ?? 0,
    pending_extras: selRow?.pending_extras ?? 0,
    outstanding:    selRow?.outstanding ?? 0,
  }
  const kpiWho  = selPerson ? ` · ${selPerson.name}` : ''

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

  // Pulsar la etiqueta de Nómina: pendiente ↔ pagado. Si el pago viene de una remesa se pide
  // confirmación, porque quitarlo borra el importe y la fecha del banco de ese mes.
  function toggleNomina(r) {
    // Pagada solo con pagos parciales en efectivo: se deshace borrando el pago parcial
    if (!r.payment && r.nomina_status === 'pagado') {
      window.alert('Esta nómina está pagada en efectivo. Para deshacerlo, borra el pago parcial (✕) de la fila.')
      return
    }
    if (r.payment?.amount != null && !window.confirm(
      `¿Volver a pendiente la nómina de ${r.name}? Se borrará el pago de la remesa (${fmtEur(r.payment.amount)}) de este mes.`,
    )) return
    run(
      () => setPayrollPayment(month, r.id, !r.payment),
      r.payment ? `✓ ${r.name}: nómina pendiente` : `✓ ${r.name}: nómina pagada`,
    )
  }

  // Pulsar el estado de la fila. Pendiente/Parcial → marcar pagado todo lo que falta
  // (nómina a mano si no hay remesa, efectivo pactado, horas extra; si la remesa se quedó corta,
  // el resto se registra como pago en efectivo con justificación). Pagado → volver a pendiente.
  function toggleAll(r) {
    if (r.status === 'pagado') {
      if (!window.confirm(`¿Volver a pendiente el mes de ${r.name}?${r.payment?.amount != null ? `\nSe borrará el pago de la remesa (${fmtEur(r.payment.amount)}).` : ''}${r.partials?.length ? '\nLos pagos en efectivo registrados se mantienen (bórralos desde la ficha).' : ''}`)) return
      run(async () => {
        if (r.payment) await setPayrollPayment(month, r.id, false)
        if (r.cash_paid) await setPayrollCash(month, r.id, false)
        if (r.paid > 0) await setOvertimeStatus({ month, professor: r.id }, 'pendiente')
      }, `✓ ${r.name}: vuelve a pendiente`)
      return
    }
    let note = null
    const shortBank = r.cash_total == null && r.payment && r.nomina_outstanding > 0.01
    if (shortBank) {
      note = window.prompt(`La remesa no cubre la nómina de ${r.name}: faltan ${fmtEur(r.nomina_outstanding)}.\nSe registrará como pago en efectivo. Justificación:`)
      if (!note || !note.trim()) return
    } else if (!window.confirm(`¿Marcar como pagado todo lo pendiente de ${r.name} (${fmtEur(r.outstanding)})?`)) return
    run(async () => {
      if (r.cash_total != null) {
        if (!r.payment) await setPayrollPayment(month, r.id, true)
        if (!r.cash_paid) await setPayrollCash(month, r.id, true, r.cash_due)
      } else {
        if (!r.payment && r.nomina_outstanding > 0.01 && !(r.partial_nomina > 0)) await setPayrollPayment(month, r.id, true)
        if (shortBank || (r.partial_nomina > 0 && r.nomina_outstanding > 0.01)) {
          await addPayrollPartial(month, { person: r.id, concept: 'nomina', amount: r.nomina_outstanding, date: todayISO(), note: note || 'Resto de nómina' })
        }
        if (r.pending > 0) await setOvertimeStatus({ month, professor: r.id }, 'pagado')
      }
    }, `✓ ${r.name}: pagado`)
  }

  return (
    <>
      {/* ── Fichas: solo nombres; al pulsar se despliega la ficha y se filtran las tablas ── */}
      {data && (
        <div className="sa-section sa-pay-people">
          <PersonCards people={cardPeople} selected={selected} onSelect={setSelected} />
          {selPerson && (
            <PersonFile
              person={selPerson} row={rowById[selPerson.id]}
              personal={personal[selPerson.id] || {}} onSaved={reload}
            />
          )}
          {selPerson && rowById[selPerson.id] && (
            <PersonPayments row={rowById[selPerson.id]} month={month} busy={busy} run={run} onToggleNomina={toggleNomina} />
          )}
        </div>
      )}

      <div className="sa-section">
        <div className="sa-section__header">
          <h2 className="sa-section-title">Nóminas</h2>
          <div className="sa-header-controls">
            {data && (
              <button className="sa-pay-action sa-pay-print" onClick={() => setShowRemesa(s => !s)}>
                ⬆ Cargar remesa (PDF)
              </button>
            )}
            {data && (
              <button className="sa-pay-action sa-pay-print" onClick={() => setShowPartial(s => !s)}>
                💶 Pago parcial
              </button>
            )}
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
                  <span className="sa-kpi__value">{selPerson && !hasBase(selPerson.type) ? '—' : fmtEur(kpi.base)}</span>
                  <span className="sa-kpi__label">{selPerson ? 'Nómina base' : 'Nóminas base'}{kpiWho}</span>
                </div>
                <div className="sa-kpi" style={{ '--kpi-color': EXTRA_COLOR }}>
                  <span className="sa-kpi__value">{fmtEur(kpi.extras)}</span>
                  <span className="sa-kpi__label">Extras · {fmtHours(kpi.hours)} h{kpiWho}</span>
                </div>
                <div className="sa-kpi" style={{ '--kpi-color': '#34d399' }}>
                  <span className="sa-kpi__value">{fmtEur(kpi.total)}</span>
                  <span className="sa-kpi__label">Total del mes{kpiWho}</span>
                </div>
                <div
                  className="sa-kpi sa-kpi--click" style={{ '--kpi-color': '#f97316' }} role="button" tabIndex={0}
                  title="Ver solo lo pendiente de pago"
                  onClick={() => setPayFilter('pending')} onKeyDown={e => e.key === 'Enter' && setPayFilter('pending')}
                >
                  <span className="sa-kpi__value">{fmtEur(kpi.outstanding)}</span>
                  <span className="sa-kpi__label">Pendiente de pago{kpiWho}</span>
                </div>
              </div>

              {showRemesa && (
                <RemittanceImport
                  month={month} people={people} rows={rows} personal={personal}
                  onDone={async msg => { await refreshAll(); setFeedback(msg); setTimeout(() => setFeedback(''), 4000) }}
                  onClose={() => setShowRemesa(false)}
                />
              )}

              {showPartial && (
                <PartialPayment
                  month={month} rows={rows}
                  onDone={async msg => { await refreshAll(); setFeedback(msg); setTimeout(() => setFeedback(''), 4000) }}
                  onClose={() => setShowPartial(false)}
                />
              )}

              {/* ── Nómina por persona: A pagar = Banco + Efectivo + Pendiente ── */}
              <div className="sa-pay-table-head">
                <h3 className="sa-pay-subtitle">
                  Nómina por persona{selPerson && <span className="sa-pay-filter"> · {selPerson.name} <button className="sa-pay-filter__clear" onClick={() => setSelected(null)} aria-label="Quitar filtro">✕</button></span>}
                </h3>
                <div className="sa-filters sa-pay-filters">
                  {[['all', 'Todos'], ['pending', 'Con pendiente'], ['paid', 'Pagados']].map(([k, l]) => (
                    <button key={k} className={`sa-filter-btn${payFilter === k ? ' sa-filter-btn--active' : ''}`} onClick={() => setPayFilter(k)}>
                      {l} ({counts[k]})
                    </button>
                  ))}
                </div>
              </div>
              <div className="sa-pay-scroll">
                <table className="sa-pay-table sa-pay-table--wide">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th className="sa-pay-num">Nómina</th>
                      <th className="sa-pay-num">Horas extra</th>
                      <th className="sa-pay-num">A pagar</th>
                      <th className="sa-pay-num">Banco</th>
                      <th className="sa-pay-num">Efectivo</th>
                      <th className="sa-pay-num">Pendiente</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.length === 0 && (
                      <tr><td colSpan={8} className="sa-pay-muted">
                        {payFilter === 'pending' ? 'No queda nada pendiente de pago este mes.' : payFilter === 'paid' ? 'Todavía no hay nadie pagado este mes.' : 'Sin nómina ni horas extra este mes.'}
                      </td></tr>
                    )}
                    {shownRows.map(r => {
                      return (
                        <tr key={r.id} className={r.status === 'pagado' ? 'sa-pay-row--paid' : ''}>
                          <td>
                            <button className="sa-pay-name" onClick={() => setSelected(s => s === r.id ? null : r.id)} title="Ver ficha y pagos">
                              <span className="sa-pay-dot" style={{ background: r.color }} />{r.name}
                            </button>
                            {(r.type !== 'profesor' || !r.active || r.absent) && (
                              <div className="sa-pay-tags">
                                {r.type !== 'profesor' && <span className="sa-pay-tag">{typeLabel(r.type).toLowerCase()}</span>}
                                {!r.active && <span className="sa-pay-tag">inactivo</span>}
                                {r.absent && <span className="sa-pay-tag sa-pay-tag--absent">sin asistencia</span>}
                              </div>
                            )}
                          </td>
                          <td className="sa-pay-num" title={notes[r.id] ? `Justificación: ${notes[r.id]}` : undefined}>
                            {!hasBase(r.type) ? <span className="sa-pay-muted">—</span>
                              : r.absent ? <span className="sa-pay-struck" title="Sin asistencia: no se reporta este mes">{fmtEur(r.base_nominal)}</span>
                              : fmtEur(r.base)}
                            {notes[r.id] && <span className="sa-pay-info"> ⓘ</span>}
                            {r.cash_total != null && <div className="sa-pay-paid" title="Total pactado banco + efectivo">de {fmtEur(r.cash_total)} pactado</div>}
                          </td>
                          <td className="sa-pay-num">
                            {r.hours ? fmtEur(r.extras) : <span className="sa-pay-muted">—</span>}
                            {r.missing_rate && <span className="sa-pay-warn" title="Hay horas sin €/h configurado"> *</span>}
                            {r.hours > 0 && <div className="sa-pay-paid">{fmtHours(r.hours)} h × {r.rate == null ? '—' : fmtEur(r.rate)}</div>}
                          </td>
                          <td className="sa-pay-num sa-pay-strong">{fmtEur(r.to_pay)}</td>
                          <td className="sa-pay-num" title={r.payment ? (r.payment.ref ? `Remesa: ${r.payment.ref}` : 'Marcado a mano') : undefined}>
                            {r.bank > 0 ? fmtEur(r.bank) : <span className="sa-pay-muted">—</span>}
                            {r.payment && r.payment.amount == null && <span className="sa-pay-paid"> (a mano)</span>}
                            {r.difference != null && Math.abs(r.difference) > 0.01 && (
                              <span className="sa-pay-warn" title={`Diferencia con lo configurado: ${r.difference > 0 ? '+' : ''}${fmtEur(r.difference)}`}> ⚠</span>
                            )}
                          </td>
                          <td className="sa-pay-num" title={cashDetail(r) || undefined}>
                            {r.cash > 0 ? <>{fmtEur(r.cash)}<span className="sa-pay-info"> ⓘ</span></> : <span className="sa-pay-muted">—</span>}
                            {r.cash_total != null && !r.cash_paid && r.cash_due > 0 && (
                              <div className="sa-pay-paid">a entregar {fmtEur(r.cash_due)}{r.cash_estimated ? ' (est.)' : ''}</div>
                            )}
                          </td>
                          <td className={`sa-pay-num sa-pay-strong${r.outstanding > 0.01 ? ' sa-pay-pending' : ''}`}>
                            {r.outstanding > 0.01 ? fmtEur(r.outstanding) : <span className="sa-pay-ok">0,00 €</span>}
                            {r.manual > 0.01 && <div className="sa-pay-paid" title="Marcado como pagado sin importe registrado">a mano {fmtEur(r.manual)}</div>}
                          </td>
                          <td>
                            {r.status && (
                              <button
                                className={`sa-pay-status sa-pay-status--btn sa-pay-status--${r.status}`} disabled={busy}
                                title={r.status === 'pagado' ? 'Pulsa para volver a pendiente' : 'Pulsa para marcar como pagado lo que falta'}
                                onClick={() => toggleAll(r)}
                              >{{ pagado: 'Pagado', parcial: 'Parcial', pendiente: 'Pendiente' }[r.status]}</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {!selected && payFilter === 'all' && <tfoot>
                    <tr className="sa-pay-total">
                      <td>Total</td>
                      <td className="sa-pay-num">{fmtEur(totals.base)}</td>
                      <td className="sa-pay-num">{fmtEur(totals.extras)}<div className="sa-pay-paid">{fmtHours(totals.hours)} h</div></td>
                      <td className="sa-pay-num">{fmtEur(totals.total)}</td>
                      <td className="sa-pay-num">{fmtEur(totals.bank)}</td>
                      <td className="sa-pay-num">{fmtEur(totals.cash_paid)}</td>
                      <td className={`sa-pay-num${totals.outstanding > 0.01 ? ' sa-pay-pending' : ''}`}>{fmtEur(totals.outstanding)}</td>
                      <td />
                    </tr>
                  </tfoot>}
                </table>
              </div>
              <p className="sa-pay-note">
                A pagar = Nómina + Horas extra (o el total pactado + extras si cobra parte en efectivo). Pendiente = A pagar − Banco − Efectivo. Pulsa el nombre para ver la ficha y los pagos por concepto.
              </p>
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
