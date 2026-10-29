import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  useCalendar, saveNotionToken, getBookings, notionColor,
  CATEGORIES, CATEGORY_COLORS, NOTION_VIEW_CATEGORIES, NO_CATEGORY, NOTION_CALENDAR_URL,
} from '../hooks/useCalendar'
import { TYPES, typeOf, statusOf } from '../hooks/useEvents'
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
// "Listo" en Notion quiere decir organizado/confirmado, no pasado: lleva ✓, sin tachar.
const READY = ['Listo', 'Archivo']

// Notion manda las horas con zona (a veces UTC): se pasan a la hora de este navegador
function splitDate(s) {
  if (!s) return { date: '', time: '' }
  if (s.length <= 10) return { date: s, time: '' }
  const d = new Date(s)
  return { date: isoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

function fromNotion(it) {
  const start = splitDate(it.start)
  const end   = it.end ? splitDate(it.end) : { date: start.date, time: '' }
  return {
    key: it.id, kind: 'notion', raw: it,
    date: start.date, endDate: end.date || start.date,
    time: start.time, endTime: end.time,
    title: it.title,
    category: it.category?.name || NO_CATEGORY,
    color: notionColor(it.category?.color),
    ready: READY.includes(it.status?.name),
    archived: it.status?.name === 'Archivo',
  }
}

function fromBooking(b) {
  const t = typeOf(b.type)
  return {
    key: `ev-${b.id}`, kind: 'booking', raw: b,
    date: b.date, endDate: b.date, time: b.time, endTime: b.end_time,
    title: `${t.label}: ${b.honoree || b.contact || '—'}`,
    category: 'Reserva', color: t.color,
    ready: ['confirmada', 'celebrada'].includes(b.status), archived: false,
  }
}

const covers = (it, d) => it.date <= d && it.endDate >= d
const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title)

function Chip({ it, onClick }) {
  return (
    <button
      className={`ev-chip cal-chip${it.kind === 'booking' ? ' cal-chip--booking' : ''}`}
      style={{ '--type-color': it.color }} onClick={onClick}
      title={`${it.category}${it.raw.status?.name ? ` · ${it.raw.status.name}` : ''}${it.raw.owners?.length ? ` · ${it.raw.owners.join(', ')}` : ''}`}>
      {it.time && <span className="ev-chip__time">{it.time}</span>}
      <span className="ev-chip__name">{it.title}</span>
      {it.ready && <span className="cal-chip__ok" title={it.kind === 'notion' ? 'Listo' : 'Confirmada'}>✓</span>}
    </button>
  )
}

// ─── Semana ─────────────────────────────────────────────────────────────────
function WeekSummary({ items, start, onShift, onOpen }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const list = items.filter(it => it.date <= days[6] && it.endDate >= days[0])
  const tasks    = list.filter(it => it.kind === 'notion')
  const bookings = list.filter(it => it.kind === 'booking')
  const pending  = tasks.filter(it => !it.ready).length

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
            {pending > 0 && pending < tasks.length && ` (${pending} sin marcar como Listo)`}
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
        <span><b className="cal-chip__ok">✓</b> Listo (Notion) / confirmada (Eventos)</span>
      </div>
    </div>
  )
}

// ─── Resumen del mes: lo importante agrupado, sin ir día a día ─────────────
function MonthSummary({ items, month, order, onOpen }) {
  const list  = items.filter(it => monthOf(it.date) === month || (it.date < `${month}-01` && it.endDate >= `${month}-01`))
  const groups = {}
  for (const it of list) {
    const name = it.kind === 'booking' ? `${typeOf(it.raw.type).label} (Eventos)` : it.category
    ;(groups[name] ??= { name, color: it.color, items: [] }).items.push(it)
  }
  const sorted = Object.values(groups).sort((a, b) => {
    const ia = order.indexOf(a.name), ib = order.indexOf(b.name)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name)
  })
  const range = it => it.endDate !== it.date
    ? `${fmtDay(it.date)} → ${fmtDay(it.endDate)}`
    : `${fmtDay(it.date)}${it.time ? ` · ${it.time}` : ''}`

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Resumen de <span className="ev-cap">{fmtMonth(month)}</span></h2>
        <span className="sa-pay-muted">{list.length} en total</span>
      </div>
      {sorted.length === 0
        ? <p className="sa-pay-empty sa-pay-muted">No hay nada este mes con los filtros elegidos.</p>
        : (
          <div className="cal-sum">
            {sorted.map(g => (
              <div key={g.name} className="cal-sum__group" style={{ '--cat-color': g.color }}>
                <h3 className="cal-sum__title">{g.name} <span>{g.items.length}</span></h3>
                <ul className="cal-sum__list">
                  {g.items.sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b)).map(it => (
                    <li key={it.key}>
                      <button className="cal-sum__item" onClick={() => onOpen(it)}>
                        <span className="cal-sum__date">{range(it)}</span>
                        <span className="cal-sum__name">{it.title}{it.ready && <b className="cal-chip__ok"> ✓</b>}</span>
                        {it.raw.owners?.length > 0 && <span className="cal-sum__who">{it.raw.owners.join(', ')}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ─── Detalle ────────────────────────────────────────────────────────────────
function Detail({ it, onClose }) {
  const r   = it.raw
  const row = (label, value) => value ? <div className="cal-detail__row"><span>{label}</span><p>{value}</p></div> : null
  const when = it.endDate !== it.date
    ? `${fmtDay(it.date)}${it.time ? ` ${it.time}` : ''} → ${fmtDay(it.endDate)}${it.endTime ? ` ${it.endTime}` : ''}`
    : `${fmtDay(it.date)}${it.time ? ` · ${it.time}` : ''}${it.endTime ? `–${it.endTime}` : ''}`

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

// ─── Desplegable: qué tipos de reserva de Eventos se ven ────────────────────
function EventTypesDropdown({ selected, onChange }) {
  const all   = TYPES.map(t => t.id)
  const label = selected.length === 0 ? 'Ninguna'
    : selected.length === all.length ? 'Todas'
    : TYPES.filter(t => selected.includes(t.id)).map(t => t.label).join(', ')
  const toggle = id => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])

  return (
    <details className="cal-dd">
      <summary className="sa-pay-action cal-dd__btn">Reservas de Eventos: <strong>{label}</strong> ▾</summary>
      <div className="cal-dd__menu">
        <div className="cal-dd__quick">
          <button type="button" className="pr-link" onClick={() => onChange(all)}>Todas</button>
          <button type="button" className="pr-link" onClick={() => onChange([])}>Ninguna</button>
        </div>
        {TYPES.map(t => (
          <label key={t.id} className="cal-dd__opt">
            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
            <i style={{ background: t.color }} />{t.label}
          </label>
        ))}
      </div>
    </details>
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
  const [prefs, setPrefs] = useState(() => {
    const p = { cats: null, archived: false, ...loadPrefs() }
    // evTypes: tipos de reserva de Eventos que se ven (antes era un sí/no en "bookings")
    if (!Array.isArray(p.evTypes)) p.evTypes = p.bookings ? TYPES.map(t => t.id) : []
    return p
  })
  const [open, setOpen]   = useState(null)
  const [setup, setSetup] = useState(false)
  const [bookings, setBookings] = useState([])

  // Se pide a Notion lo que cubren a la vez la semana y el mes que se ven
  const cells = monthCells(month)
  const from  = [week, cells[0]].sort()[0]
  const to    = [addDays(week, 6), cells[cells.length - 1]].sort()[1]
  const { data, loading, error, reload } = useCalendar(from, to)

  const update = changes => setPrefs(p => { const n = { ...p, ...changes }; savePrefs(n); return n })

  const showEvents = prefs.evTypes.length > 0
  useEffect(() => {
    if (!showEvents) return
    getBookings().then(setBookings).catch(() => setBookings([]))
  }, [showEvents])

  const items = useMemo(() => {
    const evs = bookings.filter(b => b.status !== 'cancelada' && prefs.evTypes.includes(b.type))
    // Si ese día ya hay un cumpleaños en Eventos, el "Cumpleaños" de Notion es el mismo: no se repite
    const cumpleDays = new Set(evs.filter(b => b.type === 'cumpleanos').map(b => b.date))
    const notion = (data?.items ?? []).map(fromNotion)
      .filter(it => prefs.archived || !it.archived)
      .filter(it => !prefs.cats || prefs.cats.includes(it.category))
      .filter(it => !(it.category === 'Cumpleaños' && cumpleDays.has(it.date)))
    return [...notion, ...evs.map(fromBooking)]
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
    ...TYPES.filter(t => prefs.evTypes.includes(t.id)).map(t => [`${t.label} (Eventos)`, t.color]),
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
          <div className="sa-section cal-controls">
          <div className="ev-toolbar">
            <button className="sa-pay-action" onClick={() => reload(true)} disabled={loading}>{loading ? 'Cargando…' : 'Actualizar'}</button>
            <a className="sa-pay-action cal-btn-link" href={NOTION_CALENDAR_URL} target="_blank" rel="noreferrer">Abrir en Notion ↗</a>
            <EventTypesDropdown selected={prefs.evTypes} onChange={evTypes => update({ evTypes })} />
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
          </div>

          {error && <div className="sa-error">Error: {error}</div>}

          {open && <Detail key={open.key} it={open} onClose={() => setOpen(null)} />}

          <WeekSummary items={items} start={week} onShift={shiftWeek} onOpen={openItem} />
          <MonthCalendar items={items} month={month} onMonth={setMonth} onOpen={openItem} legend={legend} />
          <MonthSummary items={items} month={month} order={[...cats, ...TYPES.map(t => `${t.label} (Eventos)`)]} onOpen={openItem} />
          <p className="sa-pay-note">
            Los datos vienen de Notion («Funciones Rocomadrid») y se refrescan cada 5 minutos; «Actualizar» los trae al momento.
            Para cambiar una tarea, ábrela en Notion.
          </p>
        </>
      )}
    </div>
  )
}
