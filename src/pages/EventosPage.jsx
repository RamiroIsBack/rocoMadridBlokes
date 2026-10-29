import { useState, useMemo } from 'react'
import {
  useEventsAccess, useBookings, createBooking, importBookings, updateBooking, deleteBooking, saveEventSettings, getSsaDebug,
  TYPES, STATUSES, ORIGINS, typeOf, statusOf, originOf, money, counts, emptyBooking,
} from '../hooks/useEvents'
import { fmtEur } from '../utils/monthFormat'
import './SuperAdminPage.css'
import './EventosPage.css'

// ─── Fechas ─────────────────────────────────────────────────────────────────
const pad     = n => String(n).padStart(2, '0')
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse   = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
const today   = () => isoDate(new Date())
const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoDate(d) }
const monthOf = iso => iso.slice(0, 7)
const DAYS    = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const dayName = iso => DAYS[(parse(iso).getDay() + 6) % 7]
const fmtDay  = iso => `${dayName(iso)} ${parse(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
const fmtMonth = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) }
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
// Lunes de la semana de una fecha
const weekStart = iso => addDays(iso, -((parse(iso).getDay() + 6) % 7))
const toNum = v => v === '' ? null : Number(v)

function Badge({ cls, children, onClick, title }) {
  return onClick
    ? <button className={`ev-badge ${cls} ev-badge--btn`} onClick={onClick} title={title}>{children}</button>
    : <span className={`ev-badge ${cls}`} title={title}>{children}</span>
}

const nextStatus = id => STATUSES[(STATUSES.findIndex(s => s.id === id) + 1) % STATUSES.length].id

// ─── Formulario de reserva ──────────────────────────────────────────────────
function BookingForm({ initial, settings, onSave, onDelete, onClose }) {
  const [f, setF]       = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const m   = money(f, settings)

  async function submit(e) {
    e.preventDefault()
    if (!f.date) { setError('Pon la fecha'); return }
    setBusy(true); setError('')
    try { await onSave(f) } catch (err) { setError(err.message); setBusy(false) }
  }

  const field = (label, el, wide) => <label className={`ev-field${wide ? ' ev-field--wide' : ''}`}><span>{label}</span>{el}</label>

  return (
    <form className="sa-pay-file ev-form" onSubmit={submit}>
      <div className="sa-pay-file__head">
        <h3 className="sa-pay-file__title">{initial.id ? 'Editar reserva' : 'Nueva reserva'}</h3>
        <button type="button" className="sa-pay-action" onClick={onClose}>Cerrar</button>
      </div>

      <div className="ev-form__grid">
        {field('Fecha', <input type="date" className="pr-input ev-input" value={f.date} onChange={e => set('date', e.target.value)} required />)}
        {field('Hora', (
          <div className="ev-inline">
            <input list="ev-slots" className="pr-input ev-input" placeholder="11:00" value={f.time} onChange={e => set('time', e.target.value)} />
            <span>a</span>
            <input className="pr-input ev-input" placeholder="14:00" value={f.end_time} onChange={e => set('end_time', e.target.value)} />
            <datalist id="ev-slots">{settings.slots.map(s => <option key={s} value={s} />)}</datalist>
          </div>
        ))}
        {field('Tipo', <select className="pr-select ev-input" value={f.type} onChange={e => set('type', e.target.value)}>{TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>)}
        {field('Estado', <select className="pr-select ev-input" value={f.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>)}
        {field('Cómo llegó', <select className="pr-select ev-input" value={f.origin} onChange={e => set('origin', e.target.value)}>{ORIGINS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>)}

        {field('Referente (quien reserva)', <input className="pr-input ev-input" value={f.contact} onChange={e => set('contact', e.target.value)} />)}
        {field('Teléfono', <input type="tel" className="pr-input ev-input" value={f.phone} onChange={e => set('phone', e.target.value)} />)}
        {field('Email', <input type="email" className="pr-input ev-input" value={f.email} onChange={e => set('email', e.target.value)} />)}
        {field(f.type === 'cumpleanos' ? 'Cumpleañero/a' : 'Grupo', <input className="pr-input ev-input" value={f.honoree} onChange={e => set('honoree', e.target.value)} />)}
        {field('Edad', <input type="number" min="0" className="pr-input ev-input" value={f.age ?? ''} onChange={e => set('age', toNum(e.target.value))} />)}
        {field('Nº de niños / personas', <input type="number" min="0" className="pr-input ev-input" value={f.kids ?? ''} onChange={e => set('kids', toNum(e.target.value))} />)}

        {field('Importe total', <input type="number" min="0" step="0.01" className="pr-input ev-input" placeholder={`${fmtEur(m.total)} (calculado)`} value={f.total ?? ''} onChange={e => set('total', toNum(e.target.value))} />)}
        {field('Señal', <input type="number" min="0" step="0.01" className="pr-input ev-input" placeholder={`${fmtEur(m.deposit)} (${settings.deposit_pct} %)`} value={f.deposit ?? ''} onChange={e => set('deposit', toNum(e.target.value))} />)}
        {field('Señal pagada', (
          <div className="ev-inline">
            <input type="checkbox" checked={f.deposit_paid} onChange={e => set('deposit_paid', e.target.checked)} />
            <input type="date" className="pr-input ev-input" value={f.deposit_date} onChange={e => set('deposit_date', e.target.value)} disabled={!f.deposit_paid} />
          </div>
        ))}
        {field('Resto pagado', <input type="checkbox" checked={f.rest_paid} onChange={e => set('rest_paid', e.target.checked)} />)}
        {field('Pago a monitores', <input type="number" min="0" step="0.01" className="pr-input ev-input" value={f.monitors_pay ?? ''} onChange={e => set('monitors_pay', toNum(e.target.value))} />)}
        {field('Materiales', <input type="number" min="0" step="0.01" className="pr-input ev-input" value={f.materials ?? ''} onChange={e => set('materials', toNum(e.target.value))} />)}
        {field('Monitores', <input className="pr-input ev-input" placeholder="Quién lo da" value={f.monitors} onChange={e => set('monitors', e.target.value)} />)}
        {field('Notas', <textarea className="sa-pay-textarea" rows={2} maxLength={2000} value={f.notes} onChange={e => set('notes', e.target.value)} />, true)}
      </div>

      <p className="ev-form__sum">
        Total <strong>{fmtEur(m.total)}</strong> · señal {fmtEur(m.deposit)} · cobrado {fmtEur(m.paid)} ·
        pendiente <strong className={m.pending > 0 ? 'ev-warn' : ''}>{fmtEur(m.pending)}</strong> · ganancia <strong>{fmtEur(m.profit)}</strong>
      </p>
      {error && <p className="sa-error">{error}</p>}
      <div className="sa-pay-actions">
        <button className="sa-list-save__btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        {initial.id && (
          <button type="button" className="sa-pay-action pr-danger" disabled={busy}
            onClick={() => { if (window.confirm('¿Borrar esta reserva? Si se ha anulado, mejor márcala como Cancelada.')) onDelete() }}>
            Borrar
          </button>
        )}
      </div>
    </form>
  )
}

// ─── Resumen de la semana ───────────────────────────────────────────────────
function WeekSummary({ bookings, settings, start, onShift, onOpen, onNew }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const list = bookings.filter(b => b.date >= days[0] && b.date <= days[6] && counts(b))
  const kids = list.reduce((s, b) => s + (b.kids || 0), 0)
  const pend = list.filter(b => !b.deposit_paid && b.status !== 'celebrada').length

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Semana del {fmtDay(days[0])} al {fmtDay(days[6])}</h2>
        <div className="sa-header-controls">
          <button className="sa-pay-action" onClick={() => onShift(-7)}>←</button>
          <button className="sa-pay-action" onClick={() => onShift(0)}>Hoy</button>
          <button className="sa-pay-action" onClick={() => onShift(7)}>→</button>
        </div>
      </div>
      <p className="ev-week__meta">
        {list.length ? `${list.length} reserva${list.length === 1 ? '' : 's'} · ${kids} niños/personas` : 'Sin reservas esta semana'}
        {pend > 0 && <span className="ev-warn"> · {pend} con la señal sin pagar</span>}
      </p>
      <div className="ev-week">
        {days.map(d => {
          const items   = list.filter(b => b.date === d)
          const weekend = ['Sáb', 'Dom'].includes(dayName(d))
          const free    = weekend ? settings.slots.filter(s => !items.some(b => b.time === s)) : []
          return (
            <div key={d} className={`ev-week__day${d === today() ? ' ev-week__day--today' : ''}${weekend ? ' ev-week__day--weekend' : ''}`}>
              <div className="ev-week__date">{fmtDay(d)}</div>
              {items.map(b => <BookingChip key={b.id} b={b} onClick={() => onOpen(b)} />)}
              {free.map(s => <button key={s} className="ev-free" onClick={() => onNew(d, s)}>{s} libre</button>)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BookingChip({ b, onClick }) {
  const t = typeOf(b.type)
  return (
    <button className={`ev-chip${b.status === 'solicitud' ? ' ev-chip--tentative' : ''}`} style={{ '--type-color': t.color }} onClick={onClick}
      title={`${t.label} · ${statusOf(b.status).label}`}>
      <span className="ev-chip__time">{b.time || '—'}</span>
      <span className="ev-chip__name">{b.honoree || b.contact || t.label}</span>
      {!b.deposit_paid && b.status !== 'celebrada' && <span className="ev-chip__warn" title="Señal sin pagar">€</span>}
    </button>
  )
}

// ─── Calendario del mes ─────────────────────────────────────────────────────
function MonthCalendar({ bookings, settings, month, onMonth, onOpen, onNew }) {
  const first = `${month}-01`
  const start = weekStart(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d, i) => i < 35 || monthOf(addDays(start, 35)) === month)

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title ev-cap">{fmtMonth(month)}</h2>
        <div className="sa-header-controls">
          <button className="sa-pay-action" onClick={() => onMonth(shiftMonth(month, -1))}>←</button>
          <button className="sa-pay-action" onClick={() => onMonth(monthOf(today()))}>Hoy</button>
          <button className="sa-pay-action" onClick={() => onMonth(shiftMonth(month, 1))}>→</button>
        </div>
      </div>
      <div className="ev-month">
        {DAYS.map(d => <div key={d} className="ev-month__head">{d}</div>)}
        {cells.map(d => {
          const items   = bookings.filter(b => b.date === d && counts(b))
          const weekend = ['Sáb', 'Dom'].includes(dayName(d))
          const free    = weekend && monthOf(d) === month && d >= today() ? settings.slots.filter(s => !items.some(b => b.time === s)) : []
          return (
            <div key={d} className={`ev-month__cell${monthOf(d) !== month ? ' ev-month__cell--out' : ''}${d === today() ? ' ev-month__cell--today' : ''}${weekend ? ' ev-month__cell--weekend' : ''}`}>
              <span className="ev-month__num">{parse(d).getDate()}</span>
              {items.map(b => <BookingChip key={b.id} b={b} onClick={() => onOpen(b)} />)}
              {free.map(s => <button key={s} className="ev-free" onClick={() => onNew(d, s)}>{s}</button>)}
            </div>
          )
        })}
      </div>
      <div className="ev-legend">
        {TYPES.map(t => <span key={t.id}><i style={{ background: t.color }} />{t.label}</span>)}
        <span><i className="ev-legend__tentative" />Solicitud (sin confirmar)</span>
        <span><b className="ev-chip__warn">€</b> señal sin pagar</span>
      </div>
    </div>
  )
}

// ─── Lista de reservas ──────────────────────────────────────────────────────
const FILTERS = [
  { id: 'proximas', label: 'Próximas' },
  { id: 'senal',    label: 'Señal sin pagar' },
  { id: 'cobro',    label: 'Pendiente de cobro' },
  { id: 'pasadas',  label: 'Pasadas' },
  { id: 'todas',    label: 'Todas' },
]

function BookingList({ bookings, settings, onOpen, onChange }) {
  const [filter, setFilter] = useState('proximas')
  const [q, setQ]           = useState('')
  const t = today()
  const rows = bookings.filter(b => {
    if (filter === 'proximas') return b.date >= t && b.status !== 'cancelada'
    if (filter === 'pasadas')  return b.date < t
    if (filter === 'senal')    return counts(b) && !b.deposit_paid && b.status !== 'celebrada'
    if (filter === 'cobro')    return counts(b) && money(b, settings).pending > 0.01
    return true
  }).filter(b => !q || `${b.contact} ${b.honoree} ${b.phone} ${b.email} ${b.notes}`.toLowerCase().includes(q.toLowerCase()))
  const sorted = filter === 'pasadas' ? [...rows].reverse() : rows

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Reservas</h2>
        <div className="sa-header-controls">
          {FILTERS.map(x => (
            <button key={x.id} className={`sa-filter-btn${filter === x.id ? ' sa-filter-btn--active' : ''}`} onClick={() => setFilter(x.id)}>{x.label}</button>
          ))}
          <input className="pr-input ev-search" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {sorted.length === 0
        ? <p className="sa-pay-empty sa-pay-muted">No hay reservas con este filtro.</p>
        : (
          <div className="sa-pay-scroll">
            <table className="sa-pay-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Hora</th><th>Tipo</th><th>Reserva</th>
                  <th className="sa-pay-num">Edad</th><th className="sa-pay-num">Niños</th>
                  <th className="sa-pay-num">Total</th><th>Señal</th><th className="sa-pay-num">Pendiente</th>
                  <th>Estado</th><th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(b => {
                  const m  = money(b, settings)
                  const ty = typeOf(b.type)
                  return (
                    <tr key={b.id} className={b.status === 'cancelada' ? 'ev-row--cancel' : ''}>
                      <td className="sa-pay-nowrap"><button className="pr-link" onClick={() => onOpen(b)}>{fmtDay(b.date)}</button></td>
                      <td>{b.time || '—'}</td>
                      <td className="sa-pay-nowrap"><span className="sa-pay-dot" style={{ background: ty.color }} />{ty.label}</td>
                      <td>
                        <button className="pr-link ev-name" onClick={() => onOpen(b)}>{b.honoree || b.contact || '—'}</button>
                        {b.honoree && b.contact && <span className="sa-pay-muted"> · {b.contact}</span>}
                        {b.phone && <a className="ev-phone" href={`tel:${b.phone.replace(/\s/g, '')}`}>{b.phone}</a>}
                      </td>
                      <td className="sa-pay-num">{b.age ?? '—'}</td>
                      <td className="sa-pay-num">{b.kids ?? '—'}</td>
                      <td className="sa-pay-num sa-pay-strong">{fmtEur(m.total)}</td>
                      <td>
                        <Badge cls={b.deposit_paid ? 'ev-badge--ok' : 'ev-badge--warn'} title="Pulsa para cambiar"
                          onClick={() => onChange(b, { deposit_paid: !b.deposit_paid, deposit_date: !b.deposit_paid ? (b.deposit_date || today()) : b.deposit_date })}>
                          {b.deposit_paid ? `Pagada · ${fmtEur(m.deposit)}` : `Sin pagar · ${fmtEur(m.deposit)}`}
                        </Badge>
                      </td>
                      <td className={`sa-pay-num${m.pending > 0.01 ? ' ev-warn' : ''}`}>{fmtEur(m.pending)}</td>
                      <td><Badge cls={`ev-status--${b.status}`} title="Pulsa para cambiar el estado" onClick={() => onChange(b, { status: nextStatus(b.status) })}>{statusOf(b.status).label}</Badge></td>
                      <td className="sa-pay-muted">{originOf(b.origin).label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

// ─── Cobros y rentabilidad ──────────────────────────────────────────────────
function Money({ bookings, settings, onSettings }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const list   = bookings.filter(b => counts(b) && b.date.startsWith(String(year)))
  const months = [...new Set(list.map(b => monthOf(b.date)))].sort()
  const agg    = items => items.reduce((a, b) => {
    const m = money(b, settings)
    a.n++; a.kids += b.kids || 0; a.total += m.total; a.paid += m.paid; a.pending += m.pending
    a.monitors += b.monitors_pay || 0; a.materials += b.materials || 0; a.profit += m.profit
    return a
  }, { n: 0, kids: 0, total: 0, paid: 0, pending: 0, monitors: 0, materials: 0, profit: 0 })
  const tot   = agg(list)
  const years = [...new Set(bookings.map(b => Number(b.date.slice(0, 4))).concat(new Date().getFullYear()))].sort()

  const Row = ({ label, a, cls }) => (
    <tr className={cls}>
      <td className="ev-cap">{label}</td>
      <td className="sa-pay-num">{a.n}</td><td className="sa-pay-num">{a.kids}</td>
      <td className="sa-pay-num">{fmtEur(a.total)}</td><td className="sa-pay-num">{fmtEur(a.paid)}</td>
      <td className={`sa-pay-num${a.pending > 0.01 ? ' ev-warn' : ''}`}>{fmtEur(a.pending)}</td>
      <td className="sa-pay-num">{fmtEur(a.monitors)}</td><td className="sa-pay-num">{fmtEur(a.materials)}</td>
      <td className="sa-pay-num sa-pay-strong">{fmtEur(a.profit)}</td>
    </tr>
  )

  return (
    <>
      <div className="sa-section">
        <div className="sa-section__header">
          <h2 className="sa-section-title">Cobros y rentabilidad · {year}</h2>
          <div className="sa-period">
            {years.map(y => <button key={y} className={`sa-period__btn${y === year ? ' sa-period__btn--active' : ''}`} onClick={() => setYear(y)}>{y}</button>)}
          </div>
        </div>
        <div className="sa-kpis">
          <div className="sa-kpi" style={{ '--kpi-color': '#f0ece0' }}><span className="sa-kpi__value">{fmtEur(tot.total)}</span><span className="sa-kpi__label">Facturado ({tot.n} reservas)</span></div>
          <div className="sa-kpi" style={{ '--kpi-color': '#34d399' }}><span className="sa-kpi__value">{fmtEur(tot.paid)}</span><span className="sa-kpi__label">Cobrado</span></div>
          <div className="sa-kpi" style={{ '--kpi-color': '#f97316' }}><span className="sa-kpi__value">{fmtEur(tot.pending)}</span><span className="sa-kpi__label">Pendiente de cobro</span></div>
          <div className="sa-kpi" style={{ '--kpi-color': '#a78bfa' }}><span className="sa-kpi__value">{fmtEur(tot.profit)}</span><span className="sa-kpi__label">Ganancia</span></div>
        </div>
        {months.length === 0
          ? <p className="sa-pay-empty sa-pay-muted">No hay reservas en {year}.</p>
          : (
            <div className="sa-pay-scroll">
              <table className="sa-pay-table">
                <thead>
                  <tr>
                    <th>Mes</th><th className="sa-pay-num">Reservas</th><th className="sa-pay-num">Niños</th>
                    <th className="sa-pay-num">Facturado</th><th className="sa-pay-num">Cobrado</th><th className="sa-pay-num">Pendiente</th>
                    <th className="sa-pay-num">Monitores</th><th className="sa-pay-num">Materiales</th><th className="sa-pay-num">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(m => <Row key={m} label={fmtMonth(m)} a={agg(list.filter(b => monthOf(b.date) === m))} />)}
                  <Row label="Total" a={tot} cls="sa-pay-total" />
                </tbody>
              </table>
            </div>
          )}
        <p className="sa-pay-note">Ganancia = total − pago a monitores − materiales. No cuentan las reservas canceladas.</p>
      </div>
      <SettingsPanel settings={settings} onSaved={onSettings} />
      {window.blokesSiteData?.userRole === 'socio' && <SsaDebug />}
    </>
  )
}

// Diagnóstico temporal: qué guarda el sistema de reservas de la web (SSA) antes de conectarlo
function SsaDebug() {
  const [out, setOut]   = useState('')
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try { setOut(JSON.stringify(await getSsaDebug(), null, 2)) } catch (e) { setOut(`✗ ${e.message}`) }
    setBusy(false)
  }
  return (
    <div className="sa-section">
      <div className="sa-section__header"><h2 className="sa-section-title">Reservas de la web · diagnóstico</h2></div>
      <div className="sa-pay-actions">
        <button className="sa-list-save__btn" onClick={run} disabled={busy}>{busy ? 'Leyendo…' : 'Leer reservas de la web'}</button>
        {out && <button className="sa-pay-action" onClick={() => navigator.clipboard?.writeText(out)}>Copiar</button>}
      </div>
      {out && <pre className="ev-debug">{out}</pre>}
    </div>
  )
}

function SettingsPanel({ settings, onSaved }) {
  const [f, setF]   = useState({ ...settings, slots: settings.slots.join(', ') })
  const [msg, setMsg] = useState('')
  async function save() {
    try {
      const s = await saveEventSettings({ ...f, slots: f.slots.split(/[,\s]+/).filter(Boolean) })
      onSaved(s); setMsg('✓ Guardado')
    } catch (e) { setMsg(`✗ ${e.message}`) }
    setTimeout(() => setMsg(''), 2500)
  }
  const num = (k, label) => (
    <label className="ev-field"><span>{label}</span>
      <input type="number" min="0" step="0.01" className="pr-input ev-input" value={f[k]} onChange={e => setF(x => ({ ...x, [k]: e.target.value }))} />
    </label>
  )
  return (
    <div className="sa-section">
      <div className="sa-section__header"><h2 className="sa-section-title">Tarifas y franjas</h2></div>
      <div className="ev-form__grid">
        {num('price_per_kid', 'Precio por niño (€)')}
        {num('min_price', 'Reserva mínima (€)')}
        {num('deposit_pct', 'Señal (%)')}
        {num('monitors_pay', 'Pago a monitores por defecto (€)')}
        <label className="ev-field"><span>Franjas de fin de semana</span>
          <input className="pr-input ev-input" value={f.slots} onChange={e => setF(x => ({ ...x, slots: e.target.value }))} placeholder="11:00, 17:00" />
        </label>
      </div>
      <div className="sa-pay-actions">
        <button className="sa-list-save__btn" onClick={save}>Guardar tarifas</button>
        {msg && <span className="sa-pay-feedback">{msg}</span>}
      </div>
    </div>
  )
}

// ─── Importar (migración del Excel de Juan) ─────────────────────────────────
function ImportButton({ onDone }) {
  const [msg, setMsg] = useState('')
  async function handle(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      const list = Array.isArray(data) ? data : data.bookings
      if (!Array.isArray(list) || !list.length) throw new Error('El archivo no tiene reservas')
      if (!window.confirm(`¿Añadir ${list.length} reservas del archivo «${file.name}»?`)) return
      const json = await importBookings(list)
      onDone(json.bookings)
      setMsg(`✓ ${json.added.length} reservas importadas`)
    } catch (err) {
      setMsg(`✗ ${err.message}`)
    }
    setTimeout(() => setMsg(''), 4000)
  }
  return (
    <>
      <label className="sa-pay-action pr-file" title="Cargar reservas desde un archivo .json">
        Importar<input type="file" accept=".json,application/json" hidden onChange={handle} />
      </label>
      {msg && <span className="sa-pay-feedback">{msg}</span>}
    </>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'reservas', label: 'Reservas' },
  { key: 'calendario', label: 'Disponibilidad' },
  { key: 'cobros', label: 'Cobros y rentabilidad' },
]

export default function EventosPage() {
  const can = useEventsAccess()
  const { data, setData, loading, error } = useBookings()
  const [tab, setTab]       = useState('reservas')
  const [week, setWeek]     = useState(() => weekStart(today()))
  const [month, setMonth]   = useState(() => monthOf(today()))
  const [editing, setEditing] = useState(null)
  const [feedback, setFeedback] = useState('')

  const bookings = useMemo(() => data?.bookings ?? [], [data])

  if (!can) {
    return (
      <div className="sa-forbidden">
        <span className="sa-forbidden__icon">🔒</span>
        <p>Acceso restringido a gestión, socios y personas autorizadas.</p>
      </div>
    )
  }
  if (loading && !data) return <div className="sa-page"><div className="sa-loading">Cargando…</div></div>
  if (error && !data)   return <div className="sa-page"><div className="sa-error">Error: {error}</div></div>

  const settings = data.settings
  const notify   = text => { setFeedback(text); setTimeout(() => setFeedback(''), 3000) }
  const replace  = b => setData(d => ({ ...d, bookings: d.bookings.map(x => x.id === b.id ? b : x).sort((a, c) => (a.date + a.time).localeCompare(c.date + c.time)) }))

  async function save(f) {
    if (f.id) {
      replace(await updateBooking(f.id, f))
      notify('✓ Reserva guardada')
    } else {
      const json = await createBooking(f)
      setData(d => ({ ...d, bookings: json.bookings }))
      notify('✓ Reserva creada')
    }
    setEditing(null)
  }
  async function quickChange(b, changes) {
    try { replace(await updateBooking(b.id, { ...b, ...changes })) } catch (e) { notify(`✗ ${e.message}`) }
  }
  async function remove(b) {
    await deleteBooking(b.id)
    setData(d => ({ ...d, bookings: d.bookings.filter(x => x.id !== b.id) }))
    setEditing(null)
    notify('✓ Reserva borrada')
  }
  const openNew = (date = '', time = '') => setEditing(emptyBooking(settings, date, time))

  return (
    <div className="sa-page">
      <h1 className="sa-page__title">Eventos</h1>
      <div className="sa-main-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`sa-main-tab${tab === t.key ? ' sa-main-tab--active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="ev-toolbar">
        <button className="sa-list-save__btn" onClick={() => openNew()}>+ Reserva</button>
        <ImportButton onDone={list => setData(d => ({ ...d, bookings: list }))} />
        {feedback && <span className="sa-pay-feedback">{feedback}</span>}
      </div>

      {editing && (
        <BookingForm
          key={editing.id || `${editing.date}-${editing.time}`} initial={editing} settings={settings}
          onSave={save} onDelete={() => remove(editing)} onClose={() => setEditing(null)}
        />
      )}

      {tab === 'reservas' && (
        <>
          <WeekSummary
            bookings={bookings} settings={settings} start={week}
            onShift={n => setWeek(w => n === 0 ? weekStart(today()) : addDays(w, n))}
            onOpen={setEditing} onNew={openNew}
          />
          <BookingList bookings={bookings} settings={settings} onOpen={setEditing} onChange={quickChange} />
        </>
      )}
      {tab === 'calendario' && (
        <MonthCalendar bookings={bookings} settings={settings} month={month} onMonth={setMonth} onOpen={setEditing} onNew={openNew} />
      )}
      {tab === 'cobros' && (
        <Money bookings={bookings} settings={settings} onSettings={s => setData(d => ({ ...d, settings: s }))} />
      )}
    </div>
  )
}
