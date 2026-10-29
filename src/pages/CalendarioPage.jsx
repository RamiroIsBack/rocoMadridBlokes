import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  useCalendar, saveNotionToken, getBookings, notionColor,
  CATEGORIES, CATEGORY_COLORS, NOTION_VIEW_CATEGORIES, NO_CATEGORY, NOTION_CALENDAR_URL,
} from '../hooks/useCalendar'
import { typeOf, statusOf } from '../hooks/useEvents'
import { fmtEur } from '../utils/monthFormat'
import './SuperAdminPage.css'
import './EventosPage.css'
import './CalendarioPage.css'

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
const weekStart = iso => addDays(iso, -((parse(iso).getDay() + 6) % 7))
// Celdas del mes: de lunes a domingo, 5 o 6 semanas
const monthCells = month => {
  const start = weekStart(`${month}-01`)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d, i) => i < 35 || monthOf(addDays(start, 35)) === month)
}

// ─── Preferencias de este navegador (filtros e interruptor) ─────────────────
const PREFS_KEY = 'blokes-calendario'
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* sin almacenamiento */ }
}

// ─── Elementos del calendario: tareas de Notion y reservas de Eventos ──────
const DONE = ['Listo', 'Archivo']

function fromNotion(it) {
  const date = it.start.slice(0, 10)
  return {
    key: it.id, kind: 'notion', raw: it,
    date, endDate: it.end ? it.end.slice(0, 10) : date,
    time: it.start.length > 10 ? it.start.slice(11, 16) : '',
    title: it.title,
    category: it.category?.name || NO_CATEGORY,
    color: notionColor(it.category?.color),
    done: DONE.includes(it.status?.name),
    archived: it.status?.name === 'Archivo',
  }
}

function fromBooking(b) {
  const t = typeOf(b.type)
  return {
    key: `ev-${b.id}`, kind: 'booking', raw: b,
    date: b.date, endDate: b.date, time: b.time,
    title: `${t.label}: ${b.honoree || b.contact || '—'}`,
    category: 'Reserva', color: t.color,
    done: b.status === 'celebrada', archived: false,
  }
}

const covers = (it, d) => it.date <= d && it.endDate >= d
const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title)

function Chip({ it, onClick }) {
  return (
    <button
      className={`ev-chip cal-chip${it.done ? ' cal-chip--done' : ''}${it.kind === 'booking' ? ' cal-chip--booking' : ''}`}
      style={{ '--type-color': it.color }} onClick={onClick}
      title={`${it.category}${it.raw.status?.name ? ` · ${it.raw.status.name}` : ''}${it.raw.owners?.length ? ` · ${it.raw.owners.join(', ')}` : ''}`}>
      {it.time && <span className="ev-chip__time">{it.time}</span>}
      <span className="ev-chip__name">{it.title}</span>
    </button>
  )
}

// ─── Semana ─────────────────────────────────────────────────────────────────
function WeekSummary({ items, start, onShift, onOpen }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const list = items.filter(it => it.date <= days[6] && it.endDate >= days[0])
  const tasks    = list.filter(it => it.kind === 'notion')
  const bookings = list.filter(it => it.kind === 'booking')
  const pending  = tasks.filter(it => !it.done).length

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
        {list.length === 0 ? 'Nada previsto esta semana' : (
          <>
            {tasks.length} tarea{tasks.length === 1 ? '' : 's'}
            {pending > 0 && pending < tasks.length && ` (${pending} sin terminar)`}
            {bookings.length > 0 && ` · ${bookings.length} reserva${bookings.length === 1 ? '' : 's'} de Eventos`}
          </>
        )}
      </p>
      <div className="ev-week">
        {days.map(d => {
          const dayItems = list.filter(it => covers(it, d)).sort(byTime)
          const weekend  = ['Sáb', 'Dom'].includes(dayName(d))
          return (
            <div key={d} className={`ev-week__day${d === today() ? ' ev-week__day--today' : ''}${weekend ? ' ev-week__day--weekend' : ''}`}>
              <div className="ev-week__date">{fmtDay(d)}</div>
              {dayItems.map(it => <Chip key={it.key} it={it} onClick={() => onOpen(it)} />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mes ────────────────────────────────────────────────────────────────────
function MonthCalendar({ items, month, onMonth, onOpen, legend }) {
  const cells = monthCells(month)
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
          const weekend = ['Sáb', 'Dom'].includes(dayName(d))
          return (
            <div key={d} className={`ev-month__cell${monthOf(d) !== month ? ' ev-month__cell--out' : ''}${d === today() ? ' ev-month__cell--today' : ''}${weekend ? ' ev-month__cell--weekend' : ''}`}>
              <span className="ev-month__num">{parse(d).getDate()}</span>
              {items.filter(it => covers(it, d)).sort(byTime).map(it => <Chip key={it.key} it={it} onClick={() => onOpen(it)} />)}
            </div>
          )
        })}
      </div>
      <div className="ev-legend">
        {legend.map(([label, color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}
        <span><i className="cal-legend__done" />Listo / celebrada</span>
      </div>
    </div>
  )
}

// ─── Detalle ────────────────────────────────────────────────────────────────
function Detail({ it, onClose }) {
  const r   = it.raw
  const row = (label, value) => value ? <div className="cal-detail__row"><span>{label}</span><p>{value}</p></div> : null
  const when = it.endDate !== it.date
    ? `${fmtDay(it.date)}${it.time ? ` ${it.time}` : ''} → ${fmtDay(it.endDate)}${r.end?.length > 10 ? ` ${r.end.slice(11, 16)}` : ''}`
    : `${fmtDay(it.date)}${it.time ? ` · ${it.time}` : ''}${it.kind === 'booking' && r.end_time ? `–${r.end_time}` : ''}${r.end?.length > 10 ? `–${r.end.slice(11, 16)}` : ''}`

  return (
    <div className="sa-pay-file cal-detail" style={{ '--card-color': it.color }}>
      <div className="sa-pay-file__head">
        <h3 className="sa-pay-file__title">{it.title}</h3>
        <button type="button" className="sa-pay-action" onClick={onClose}>Cerrar</button>
      </div>
      <div className="cal-detail__grid">
        {row('Cuándo', when)}
        {it.kind === 'notion' ? (
          <>
            {row('Categoría', it.category)}
            {row('Estado', r.status?.name)}
            {row('Encargado', r.owners.join(', '))}
            {row('Concepto', r.concept)}
            {row('Contacto', r.contact)}
            {row('Precio', r.price != null ? fmtEur(r.price) : '')}
            {row('Comentario', r.comment)}
          </>
        ) : (
          <>
            {row('Estado', statusOf(r.status).label)}
            {row('Referente', r.contact)}
            {row('Teléfono', r.phone)}
            {row('Niños / personas', r.kids)}
            {row('Notas', r.notes)}
          </>
        )}
      </div>
      <div className="sa-pay-actions">
        {it.kind === 'notion'
          ? <a className="sa-list-save__btn cal-btn-link" href={r.url} target="_blank" rel="noreferrer">Abrir en Notion ↗</a>
          : <Link className="sa-list-save__btn cal-btn-link" to="/eventos">Ver en Eventos</Link>}
      </div>
    </div>
  )
}

// ─── Conectar con Notion (solo socios) ──────────────────────────────────────
function NotionSetup({ onSaved, onCancel }) {
  const [token, setToken] = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await saveNotionToken(token.trim())
      setToken('')
      onSaved()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <form className="sa-section cal-setup" onSubmit={submit}>
      <div className="sa-section__header"><h2 className="sa-section-title">Conectar con Notion</h2></div>
      <p className="sa-pay-note">
        Pega el token de la integración <strong>Blokes</strong> del espacio <strong>Madridroco</strong>
        (Notion → Ajustes → Desarrollador → Blokes). Se guarda en el servidor y no se vuelve a mostrar.
      </p>
      <div className="cal-setup__row">
        <input type="password" autoComplete="off" className="pr-input ev-input" placeholder="ntn_…" value={token} onChange={e => setToken(e.target.value)} />
        <button className="sa-list-save__btn" disabled={busy || !token.trim()}>{busy ? 'Comprobando…' : 'Guardar'}</button>
        {onCancel && <button type="button" className="sa-pay-action" onClick={onCancel}>Cancelar</button>}
      </div>
      {error && <p className="sa-error">{error}</p>}
    </form>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────
export default function CalendarioPage() {
  const role    = window.blokesSiteData?.userRole
  const isSocio = role === 'socio'
  const [week, setWeek]   = useState(() => weekStart(today()))
  const [month, setMonth] = useState(() => monthOf(today()))
  const [prefs, setPrefs] = useState(() => ({ cats: null, bookings: false, archived: false, ...loadPrefs() }))
  const [open, setOpen]   = useState(null)
  const [setup, setSetup] = useState(false)
  const [bookings, setBookings] = useState([])

  // Se pide a Notion lo que cubren a la vez la semana y el mes que se ven
  const cells = monthCells(month)
  const from  = [week, cells[0]].sort()[0]
  const to    = [addDays(week, 6), cells[cells.length - 1]].sort()[1]
  const { data, loading, error, reload } = useCalendar(from, to)

  const update = changes => setPrefs(p => { const n = { ...p, ...changes }; savePrefs(n); return n })

  useEffect(() => {
    if (!prefs.bookings) return
    getBookings().then(setBookings).catch(() => setBookings([]))
  }, [prefs.bookings])

  const items = useMemo(() => {
    const notion = (data?.items ?? []).map(fromNotion)
      .filter(it => prefs.archived || !it.archived)
      .filter(it => !prefs.cats || prefs.cats.includes(it.category))
    const evs = prefs.bookings ? bookings.filter(b => b.status !== 'cancelada').map(fromBooking) : []
    return [...notion, ...evs]
  }, [data, bookings, prefs])

  if (!['socio', 'gestion'].includes(role)) {
    return (
      <div className="sa-forbidden">
        <span className="sa-forbidden__icon">🔒</span>
        <p>Acceso restringido a gestión y socios.</p>
      </div>
    )
  }

  const present = new Set((data?.items ?? []).map(it => it.category?.name || NO_CATEGORY))
  const cats    = [...CATEGORIES, ...[...present].filter(c => !CATEGORIES.includes(c))]
  const colorOf = {
    ...Object.fromEntries(CATEGORIES.map(c => [c, notionColor(CATEGORY_COLORS[c])])),
    ...Object.fromEntries((data?.items ?? []).filter(it => it.category).map(it => [it.category.name, notionColor(it.category.color)])),
  }
  const active  = c => !prefs.cats || prefs.cats.includes(c)
  const toggle  = c => {
    const cur = prefs.cats ?? cats
    const next = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]
    update({ cats: next.length === cats.length ? null : next })
  }
  const isNotionView = prefs.cats && prefs.cats.length === NOTION_VIEW_CATEGORIES.length && NOTION_VIEW_CATEGORIES.every(c => prefs.cats.includes(c))
  const legend = [
    ...cats.filter(c => active(c) && present.has(c)).map(c => [c, colorOf[c] || '#9b9a97']),
    ...(prefs.bookings ? [['Reservas de Eventos (color del tipo)', '#f87171']] : []),
  ]

  const configured = data?.configured
  const shiftWeek  = n => setWeek(w => n === 0 ? weekStart(today()) : addDays(w, n))
  const openItem   = it => { setOpen(it); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  return (
    <div className="sa-page">
      <h1 className="sa-page__title">Calendario</h1>

      {data && !configured && (isSocio
        ? <NotionSetup onSaved={() => reload(true)} />
        : <p className="sa-pay-empty sa-pay-muted">El calendario todavía no está conectado con Notion. Tiene que hacerlo un socio desde esta página.</p>
      )}
      {setup && <NotionSetup onSaved={() => { setSetup(false); reload(true) }} onCancel={() => setSetup(false)} />}

      {(configured || (!data && loading) || error) && (
        <>
          <div className="ev-toolbar">
            <button className="sa-pay-action" onClick={() => reload(true)} disabled={loading}>{loading ? 'Cargando…' : 'Actualizar'}</button>
            <a className="sa-pay-action cal-btn-link" href={NOTION_CALENDAR_URL} target="_blank" rel="noreferrer">Abrir en Notion ↗</a>
            <label className="cal-switch">
              <input type="checkbox" checked={prefs.bookings} onChange={e => update({ bookings: e.target.checked })} />
              Incluir reservas de Eventos
            </label>
            <label className="cal-switch">
              <input type="checkbox" checked={prefs.archived} onChange={e => update({ archived: e.target.checked })} />
              Mostrar archivadas
            </label>
            {isSocio && !setup && <button className="pr-link cal-token-link" onClick={() => setSetup(true)}>Cambiar token de Notion</button>}
          </div>

          <div className="cal-filters">
            <button className={`sa-filter-btn${!prefs.cats ? ' sa-filter-btn--active' : ''}`} onClick={() => update({ cats: null })}>Todas</button>
            <button className={`sa-filter-btn${isNotionView ? ' sa-filter-btn--active' : ''}`} onClick={() => update({ cats: NOTION_VIEW_CATEGORIES })}
              title="Competición, Cumpleaños, Evento, Sustitución y Vacaciones">Calendario de eventos</button>
            <span className="cal-filters__sep" />
            {cats.map(c => (
              <button key={c} className={`cal-cat${active(c) ? ' cal-cat--on' : ''}`} style={{ '--cat-color': colorOf[c] || '#9b9a97' }} onClick={() => toggle(c)}>{c}</button>
            ))}
          </div>

          {error && <div className="sa-error">Error: {error}</div>}

          {open && <Detail key={open.key} it={open} onClose={() => setOpen(null)} />}

          <WeekSummary items={items} start={week} onShift={shiftWeek} onOpen={openItem} />
          <MonthCalendar items={items} month={month} onMonth={setMonth} onOpen={openItem} legend={legend} />
          <p className="sa-pay-note">
            Los datos vienen de Notion («Funciones Rocomadrid») y se refrescan cada 5 minutos; «Actualizar» los trae al momento.
            Para cambiar una tarea, ábrela en Notion.
          </p>
        </>
      )}
    </div>
  )
}
