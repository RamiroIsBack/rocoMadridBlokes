import { useState, useMemo } from 'react'
import {
  useDiarioAccess, useDiarioItems, createDiarioItem, updateDiarioItem, deleteDiarioItem,
  DIARIO_KINDS, STATUS_LABELS, isOpen,
} from '../hooks/useDiario'
import { useCalendar, CALENDAR_CATEGORIES } from '../hooks/useCalendar'
import CalendarioPage, { fromNotion, fromBooking, today, addDays, weekStart } from './CalendarioPage'
import './DashboardPage.css'

// Diario: el panel del día para el equipo (profes, gestión, socios y la lista de Acceso).
// Arriba la semana del Roco (actividades y reservas) con el calendario completo a un clic;
// debajo, todo muy resumido y se pulsa para ver el detalle: peticiones y sugerencias,
// compras y recordatorios. Inspirado en el panel de obra que pasó Álvaro (21/11).

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const DIAS  = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const toDate = iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000)

// "hoy", "ayer", "hace 3 días", "mañana", "en 4 días"
function relativo(iso, hoy) {
  const d = diffDays(iso, hoy)
  if (d === 0) return 'hoy'
  if (d === -1) return 'ayer'
  if (d === 1) return 'mañana'
  return d < 0 ? `hace ${-d} días` : `en ${d} días`
}

function DateBadge({ iso }) {
  const d = toDate(iso)
  return (
    <span className="dash-date">
      <strong>{d.getDate()}</strong>
      <span>{MESES[d.getMonth()]}</span>
    </span>
  )
}

// ─── La semana del Roco: barras por días ────────────────────────────────────
function SemanaRoco() {
  const hoy = today()
  const [week, setWeek]   = useState(() => weekStart(hoy))
  const [full, setFull]   = useState(false)
  const [abierta, setAbierta] = useState(null)
  const [todas, setTodas] = useState(false)
  const end = addDays(week, 6)
  const { data, loading, error } = useCalendar(week, end, true)

  const items = useMemo(() => {
    const notion = (data?.items ?? []).map(fromNotion)
      .filter(it => CALENDAR_CATEGORIES.includes(it.category) && !it.archived)
    const evs = (data?.bookings ?? []).filter(b => b.status !== 'cancelada').map(fromBooking)
    return [...notion, ...evs]
      .filter(it => it.date <= end && it.endDate >= week)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'))
  }, [data, week, end])

  const dias  = DIAS.map((l, i) => ({ l, iso: addDays(week, i) }))
  const shown = todas ? items : items.slice(0, 8)

  return (
    <section className="dash-semana" id="diario-semana">
      <div className="dash-card__head">
        <span className="dash-card__icon">🗓️</span>
        <h2 className="dash-card__title">Esta semana en el Roco</h2>
        <div className="dash-semana__nav">
          <button type="button" className="dash-btn dash-btn--icon" onClick={() => setWeek(w => addDays(w, -7))} aria-label="Semana anterior">‹</button>
          <button type="button" className="dash-btn" onClick={() => setWeek(weekStart(hoy))}>Hoy</button>
          <button type="button" className="dash-btn dash-btn--icon" onClick={() => setWeek(w => addDays(w, 7))} aria-label="Semana siguiente">›</button>
          <button type="button" className="dash-link" onClick={() => setFull(f => !f)}>
            {full ? 'Cerrar calendario ▴' : 'Calendario completo →'}
          </button>
        </div>
      </div>

      {error && <p className="dash-error">No se pudo cargar el calendario: {error}</p>}

      <div className="dash-wk">
        <div className="dash-wk__row dash-wk__row--head">
          <span />
          <div className="dash-wk__track">
            {dias.map(d => (
              <span key={d.iso} className={`dash-wk__day${d.iso === hoy ? ' dash-wk__day--hoy' : ''}`}>
                <b>{d.l}</b>{toDate(d.iso).getDate()}
              </span>
            ))}
          </div>
        </div>

        {!loading && items.length === 0 && <p className="dash-empty">Semana tranquila: no hay actividades ni reservas.</p>}
        {loading && !data && <p className="dash-empty">Cargando…</p>}

        {shown.map(it => {
          const from = Math.max(0, diffDays(it.date, week))
          const to   = Math.min(6, diffDays(it.endDate, week))
          const open = abierta === it.key
          const r    = it.raw
          return (
            <div key={it.key} className={`dash-wk__row${open ? ' dash-wk__row--open' : ''}`}>
              <button type="button" className="dash-wk__label" onClick={() => setAbierta(open ? null : it.key)}>
                <span className="dash-wk__title">{it.title}</span>
                <span className="dash-wk__sub">
                  {[it.time && `${it.time}${it.endTime ? `–${it.endTime}` : ''}`, it.category, r.owners?.join(', ') || r.monitors].filter(Boolean).join(' · ')}
                </span>
              </button>
              <div className="dash-wk__track">
                {dias.map(d => <span key={d.iso} className={`dash-wk__cell${d.iso === hoy ? ' dash-wk__cell--hoy' : ''}`} />)}
                <span
                  className="dash-wk__bar"
                  style={{ gridColumn: `${from + 1} / ${to + 2}`, '--bar': it.color }}
                  title={it.title}
                  onClick={() => setAbierta(open ? null : it.key)}
                />
              </div>
              {open && (
                <div className="dash-wk__detail">
                  {[
                    ['Categoría', it.category],
                    ['Estado', r.status?.name || r.status],
                    ['Encargados', r.owners?.join(', ')],
                    ['Monitores', r.monitors],
                    ['Concepto', r.concept],
                    ['Comentario', r.comment],
                  ].filter(([, v]) => v && typeof v === 'string').map(([k, v]) => (
                    <span key={k}><b>{k}:</b> {v}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {items.length > 8 && (
          <button type="button" className="dash-link dash-wk__more" onClick={() => setTodas(t => !t)}>
            {todas ? 'Ver menos' : `Ver las ${items.length} →`}
          </button>
        )}
      </div>

      {full && (
        <div className="dash-semana__full">
          <CalendarioPage embedded />
        </div>
      )}
    </section>
  )
}

// ─── Tarjeta de una lista (peticiones, compras, recordatorios) ──────────────
const CARDS = {
  peticiones:   { title: 'Peticiones y sugerencias', icon: '💬', kinds: ['peticion', 'sugerencia'], nueva: 'Nueva petición o sugerencia' },
  compras:      { title: 'Compras',                  icon: '🛒', kinds: ['compra'],                 nueva: 'Apuntar algo que falta' },
  recordatorios:{ title: 'Recordatorios',            icon: '⏰', kinds: ['recordatorio'],           nueva: 'Nuevo recordatorio' },
}

function NuevoForm({ card, onClose, onSaved }) {
  const conf = CARDS[card]
  const [f, setF] = useState({ kind: conf.kinds[0], title: '', detail: '', qty: '', urgent: false, due_date: today(), assignee: '' })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const submit = async e => {
    e.preventDefault()
    setBusy(true); setError('')
    try { await createDiarioItem(f); onSaved() } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <form className="dash-form" onSubmit={submit}>
      {card === 'peticiones' && (
        <div className="dash-form__seg">
          {['peticion', 'sugerencia'].map(k => (
            <button key={k} type="button" className={`dash-btn${f.kind === k ? ' dash-btn--on' : ''}`} onClick={() => set('kind', k)}>{DIARIO_KINDS[k].label}</button>
          ))}
        </div>
      )}
      <input className="dash-input" autoFocus required maxLength={190}
        placeholder={card === 'compras' ? '¿Qué falta? (p. ej. magnesio)' : card === 'recordatorios' ? '¿Qué hay que recordar?' : '¿Qué propones o necesitas?'}
        value={f.title} onChange={e => set('title', e.target.value)} />
      {card === 'compras' && (
        <div className="dash-form__row">
          <input className="dash-input" placeholder="Cantidad" maxLength={60} value={f.qty} onChange={e => set('qty', e.target.value)} />
          <label className="dash-check"><input type="checkbox" checked={f.urgent} onChange={e => set('urgent', e.target.checked)} /> Urgente</label>
        </div>
      )}
      {card === 'recordatorios' && (
        <div className="dash-form__row">
          <input type="date" className="dash-input" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
          <input className="dash-input" placeholder="Para (vacío = todo el equipo)" maxLength={120} value={f.assignee} onChange={e => set('assignee', e.target.value)} />
        </div>
      )}
      <textarea className="dash-input" rows={2} placeholder="Detalle (opcional)" value={f.detail} onChange={e => set('detail', e.target.value)} />
      {error && <p className="dash-error">{error}</p>}
      <div className="dash-form__actions">
        <button className="dash-btn dash-btn--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="dash-btn" onClick={onClose}>Cancelar</button>
      </div>
    </form>
  )
}

function ItemRow({ it, me, hoy, open, onToggle, onChanged }) {
  const [answer, setAnswer] = useState(it.answer || '')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const kind    = DIARIO_KINDS[it.kind]
  const initial = it.status === kind.statuses[0]
  const canStatus = me?.can_manage || it.kind === 'recordatorio'
  const canDelete = me?.can_manage || (it.mine && initial)
  const fecha   = it.kind === 'recordatorio' && it.due_date ? it.due_date : it.created_at.slice(0, 10)
  const atrasado = it.kind === 'recordatorio' && isOpen(it) && it.due_date && it.due_date < hoy

  const run = async fn => {
    setBusy(true); setError('')
    try { await fn(); onChanged() } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const sub = [
    it.kind === 'peticion' || it.kind === 'sugerencia' ? kind.label : '',
    it.qty,
    it.kind === 'recordatorio' ? (it.assignee ? `para ${it.assignee}` : 'para todo el equipo') : it.created_by,
  ].filter(Boolean).join(' · ')

  return (
    <li className={`dash-item${open ? ' dash-item--open' : ''}${isOpen(it) ? '' : ' dash-item--closed'}`}>
      <button type="button" className="dash-item__main" onClick={onToggle}>
        <DateBadge iso={fecha} />
        <span className="dash-item__text">
          <span className="dash-item__title">
            {it.urgent && isOpen(it) && <span className="dash-tag dash-tag--urgent">Urgente</span>}
            {it.title}
          </span>
          <span className="dash-item__sub">{sub}</span>
        </span>
        <span className="dash-item__side">
          <span className={`dash-status dash-status--${it.status}`}>{STATUS_LABELS[it.status]}</span>
          <span className={`dash-item__when${atrasado ? ' dash-item__when--late' : ''}`}>{atrasado ? 'atrasado' : relativo(fecha, hoy)}</span>
        </span>
      </button>
      {open && (
        <div className="dash-item__detail">
          {it.detail && <p className="dash-item__p">{it.detail}</p>}
          {it.answer && !me?.can_manage && <p className="dash-item__answer"><b>Respuesta:</b> {it.answer}</p>}
          <p className="dash-item__meta">Creado por {it.created_by || '—'}{it.updated_by && it.updated_by !== it.created_by ? ` · último cambio: ${it.updated_by}` : ''}</p>
          {canStatus && (
            <div className="dash-item__actions">
              {kind.statuses.filter(s => s !== it.status).map(s => (
                <button key={s} type="button" className="dash-btn" disabled={busy}
                  onClick={() => run(() => updateDiarioItem(it.id, { status: s }))}>
                  {it.kind === 'recordatorio' && s === 'hecho' ? '✓ Hecho' : `→ ${STATUS_LABELS[s]}`}
                </button>
              ))}
            </div>
          )}
          {me?.can_manage && it.kind !== 'recordatorio' && (
            <div className="dash-item__reply">
              <textarea className="dash-input" rows={2} placeholder="Contestar (lo verá quien lo pidió)" value={answer} onChange={e => setAnswer(e.target.value)} />
              <button type="button" className="dash-btn" disabled={busy || answer === (it.answer || '')}
                onClick={() => run(() => updateDiarioItem(it.id, { answer }))}>Guardar respuesta</button>
            </div>
          )}
          {canDelete && (
            <button type="button" className="dash-link dash-link--danger" disabled={busy}
              onClick={() => window.confirm('¿Borrarlo?') && run(() => deleteDiarioItem(it.id))}>Borrar</button>
          )}
          {error && <p className="dash-error">{error}</p>}
        </div>
      )}
    </li>
  )
}

function ListaCard({ card, data, hoy, onChanged }) {
  const conf = CARDS[card]
  const [nuevo, setNuevo] = useState(false)
  const [todas, setTodas] = useState(false)
  const [abierta, setAbierta] = useState(null)
  const propias = (data?.items ?? []).filter(it => conf.kinds.includes(it.kind))
  const abiertas = propias.filter(isOpen)
  // Recordatorios por fecha (lo más cercano primero); el resto, lo más nuevo primero
  const orden = (a, b) => card === 'recordatorios'
    ? (a.due_date || '9999').localeCompare(b.due_date || '9999')
    : b.created_at.localeCompare(a.created_at)
  const lista = (todas ? propias : abiertas).slice().sort(orden)
  const shown = todas ? lista : lista.slice(0, 6)

  return (
    <section className="dash-card" id={`diario-${card}`}>
      <div className="dash-card__head">
        <span className="dash-card__icon">{conf.icon}</span>
        <h2 className="dash-card__title">{conf.title}</h2>
        {abiertas.length > 0 && <span className="dash-bubble">{abiertas.length}</span>}
        <button type="button" className="dash-link" onClick={() => setTodas(t => !t)}>{todas ? 'Solo pendientes' : 'Ver todas →'}</button>
      </div>
      {nuevo
        ? <NuevoForm card={card} onClose={() => setNuevo(false)} onSaved={() => { setNuevo(false); onChanged() }} />
        : <button type="button" className="dash-add" onClick={() => setNuevo(true)}>+ {conf.nueva}</button>}
      {data && shown.length === 0 && <p className="dash-empty">{todas ? 'Todavía no hay nada.' : 'Nada pendiente 👍'}</p>}
      <ul className="dash-list">
        {shown.map(it => (
          <ItemRow key={it.id} it={it} me={data?.me} hoy={hoy}
            open={abierta === it.id} onToggle={() => setAbierta(abierta === it.id ? null : it.id)} onChanged={onChanged} />
        ))}
      </ul>
      {!todas && lista.length > 6 && <button type="button" className="dash-link dash-wk__more" onClick={() => setTodas(true)}>Ver las {lista.length} →</button>}
    </section>
  )
}

// ─── Página ────────────────────────────────────────────────────────────────
export default function DiarioPage() {
  const can = useDiarioAccess()
  const { data, error, reload } = useDiarioItems(can)
  const hoy = today()

  if (!can) {
    return (
      <div className="dash__forbidden">
        <p>🔒 El Diario es para el equipo del Roco.</p>
      </div>
    )
  }

  const items  = data?.items ?? []
  const abiert = k => items.filter(it => k.includes(it.kind) && isOpen(it))
  const pet    = abiert(['peticion', 'sugerencia'])
  const comp   = abiert(['compra'])
  const recHoy = abiert(['recordatorio']).filter(it => !it.due_date || it.due_date <= hoy)
  const nombre = (window.blokesSiteData?.userName || data?.me?.name || '').split(' ')[0]
  const fecha  = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const ir     = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="dash dash--wide">
      <header className="dash__head">
        <h1 className="dash__title">{nombre ? `Hola, ${nombre}` : 'Diario'}</h1>
        <p className="dash__date">{fecha}</p>
        <p className="dash__claim">Lo de hoy, de un vistazo</p>
      </header>

      <SemanaRoco />

      <div className="dash-tiles">
        <button type="button" className="dash-tile dash-tile--pet" onClick={() => ir('diario-peticiones')}>
          <strong>{pet.length}</strong><span>Peticiones y sugerencias abiertas</span>
        </button>
        <button type="button" className="dash-tile dash-tile--comp" onClick={() => ir('diario-compras')}>
          <strong>{comp.length}</strong>
          <span>Compras pendientes{comp.some(c => c.urgent) ? ` · ${comp.filter(c => c.urgent).length} urgentes` : ''}</span>
        </button>
        <button type="button" className="dash-tile dash-tile--rec" onClick={() => ir('diario-recordatorios')}>
          <strong>{recHoy.length}</strong><span>Recordatorios para hoy</span>
        </button>
      </div>

      {error && <p className="dash-error">No se pudo cargar: {error}</p>}

      <div className="dash-cards">
        <ListaCard card="peticiones" data={data} hoy={hoy} onChanged={reload} />
        <ListaCard card="compras" data={data} hoy={hoy} onChanged={reload} />
        <ListaCard card="recordatorios" data={data} hoy={hoy} onChanged={reload} />
      </div>
    </div>
  )
}
