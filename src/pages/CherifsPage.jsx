import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDiarioItems, useHorarios, isOpen, STATUS_LABELS, DIARIO_KINDS } from '../hooks/useDiario'
import { useCalendar, CALENDAR_CATEGORIES } from '../hooks/useCalendar'
import { useBudget } from '../hooks/useBudget'
import { useExpenses, usePendientesCobro } from '../hooks/useSuperAdmin'
import { usePayroll } from '../hooks/useOvertime'
import { useBookings, depositDue } from '../hooks/useEvents'
import {
  useCherifsBoard, useCherifsCalendar, addCherifsMessage, addCherifsSong, deleteCherifsItem, saveCherifsIcal,
} from '../hooks/useCherifs'
import { buildComparison } from '../utils/budget'
import { clasesComoCronograma } from '../components/DiarioHorarios'
import { fmtEur } from '../utils/monthFormat'
import './DashboardPage.css'

// Cherifs › Dashboard (24/11, Álvaro): todo el negocio de un vistazo, solo socios (el acceso lo
// controla SuperAdminPage). Cada bloque resume y enlaza a donde está el detalle.

const pad = n => String(n).padStart(2, '0')
const isoHoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const sumarDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}` }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fechaCorta = iso => { const [, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} ${MESES[m - 1]}` }
const DIAS_SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaSemana = iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return DIAS_SEM[new Date(y, m - 1, d).getDay()] }

function Card({ icon, title, link, linkLabel = 'Ver →', children, className = '' }) {
  return (
    <section className={`dash-card chf-card ${className}`}>
      <div className="dash-card__head">
        <span className="dash-card__icon">{icon}</span>
        <h2 className="dash-card__title">{title}</h2>
        {link && <Link className="dash-link" to={link}>{linkLabel}</Link>}
      </div>
      {children}
    </section>
  )
}

// ─── Mensajes y canciones de la semana ──────────────────────────────────────
function Tablon() {
  const { data, error, setData } = useCherifsBoard()
  const [msg, setMsg] = useState('')
  const [song, setSong] = useState({ title: '', url: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const semana = (() => {
    const d = new Date(); const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day)
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
    return `${t.getUTCFullYear()}-W${pad(Math.ceil(((t - y0) / 86400000 + 1) / 7))}`
  })()
  const run = async fn => { setBusy(true); setErr(''); try { setData(await fn()) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const ultimo = data?.messages?.[0]
  const deLaSemana = (data?.songs || []).filter(s => s.week === semana)
  const anteriores = (data?.songs || []).filter(s => s.week !== semana).slice(0, 5)

  return (
    <section className="dash-card chf-tablon">
      <div className="chf-tablon__msg">
        <span className="chf-tablon__lbl">Mensaje de la semana</span>
        {ultimo
          ? <>
              <p className="chf-tablon__frase">«{ultimo.text}»</p>
              <span className="chf-tablon__quien">— {ultimo.by || 'un socio'} · {fechaCorta(ultimo.at)}
                <button type="button" className="dash-mini dash-mini--danger" onClick={() => window.confirm('¿Borrar este mensaje?') && run(() => deleteCherifsItem('message', ultimo.id))}>Borrar</button>
              </span>
            </>
          : <p className="chf-tablon__frase chf-tablon__frase--vacio">Deja aquí un mensaje para el equipo de socios 💪</p>}
        <form className="chf-tablon__form" onSubmit={e => { e.preventDefault(); if (msg.trim()) run(async () => { const r = await addCherifsMessage(msg.trim()); setMsg(''); return r }) }}>
          <input className="dash-input" maxLength={400} placeholder="Nuevo mensaje motivante…" value={msg} onChange={e => setMsg(e.target.value)} />
          <button className="dash-btn dash-btn--primary" disabled={busy || !msg.trim()}>Publicar</button>
        </form>
      </div>
      <div className="chf-tablon__songs">
        <span className="chf-tablon__lbl">🎵 Canciones de la semana</span>
        {deLaSemana.length === 0 && <p className="dash-empty">Todavía ninguna esta semana.</p>}
        <ul className="chf-songs">
          {deLaSemana.map(s => (
            <li key={s.id}>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a> : s.title}
              <span className="chf-songs__by"> · {s.by}</span>
              <button type="button" className="chf-x" title="Quitar" onClick={() => run(() => deleteCherifsItem('song', s.id))}>×</button>
            </li>
          ))}
        </ul>
        <form className="chf-tablon__form" onSubmit={e => { e.preventDefault(); if (song.title.trim() || song.url.trim()) run(async () => { const r = await addCherifsSong(song.title.trim(), song.url.trim()); setSong({ title: '', url: '' }); return r }) }}>
          <input className="dash-input" maxLength={150} placeholder="Canción · artista" value={song.title} onChange={e => setSong(s => ({ ...s, title: e.target.value }))} />
          <input className="dash-input" placeholder="Enlace de Spotify o YouTube (opcional)" value={song.url} onChange={e => setSong(s => ({ ...s, url: e.target.value }))} />
          <button className="dash-btn dash-btn--primary" disabled={busy}>Añadir</button>
        </form>
        {anteriores.length > 0 && (
          <details className="chf-anteriores"><summary>Semanas anteriores</summary>
            <ul className="chf-songs">{anteriores.map(s => <li key={s.id}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a> : s.title}<span className="chf-songs__by"> · {s.by}</span></li>)}</ul>
          </details>
        )}
      </div>
      {(error || err) && <p className="dash-error">{err || error}</p>}
    </section>
  )
}

// ─── Dinero: banco frente a lo que falta por pagar este mes ────────────────
function Dinero() {
  const hoy = new Date()
  const year = hoy.getFullYear(), mIdx = hoy.getMonth()
  const month = `${year}-${pad(mIdx + 1)}`
  const { data: budget, loading: lb } = useBudget(year)
  const { cuadre, cuadreRocoteca, loading: le } = useExpenses(`${year}-01`, 'all')
  const { data: payroll } = usePayroll(month)

  const pendiente = useMemo(() => {
    if (!budget) return null
    const { cats } = buildComparison(budget.budget, budget.items || [], budget.months_loaded || [], year)
    let total = 0
    const partidas = []
    Object.entries(cats).forEach(([cat, c]) => {
      const t = c.target[mIdx], r = c.real[mIdx]
      if (t < -0.005) {
        const falta = Math.max(0, -(t - r))
        if (falta > 0.5) { total += falta; partidas.push([cat, falta]) }
      }
    })
    partidas.sort((a, b) => b[1] - a[1])
    return { total, partidas: partidas.slice(0, 4) }
  }, [budget, year, mIdx])

  const saldos = [cuadre?.saldoHoy, cuadreRocoteca?.saldoHoy].filter(v => v != null)
  const saldo = saldos.length ? saldos.reduce((s, v) => s + v, 0) : null
  const fechaSaldo = cuadre?.fechaHoy || cuadreRocoteca?.fechaHoy
  const nominas = payroll?.totals?.outstanding ?? null
  const noLlega = saldo != null && pendiente && saldo < pendiente.total

  return (
    <Card icon="💶" title="Dinero este mes" link="/cherifs?tab=presupuesto-anual" linkLabel="Presupuesto →">
      {(lb || le) && !pendiente && <p className="dash-empty">Cargando…</p>}
      <div className="chf-dinero">
        <div><span>En el banco</span><strong>{saldo != null ? fmtEur(saldo) : '—'}</strong>{fechaSaldo && <em>a {fechaCorta(fechaSaldo)}{saldos.length < 2 ? ' (falta una cuenta)' : ''}</em>}</div>
        <div><span>Falta por pagar (presupuesto)</span><strong>{pendiente ? fmtEur(pendiente.total) : '—'}</strong></div>
        <div><span>Nóminas pendientes</span><strong>{nominas != null ? fmtEur(nominas) : '—'}</strong></div>
      </div>
      {pendiente && saldo != null && (
        <p className={`chf-aviso${noLlega ? ' chf-aviso--mal' : ''}`}>
          {noLlega
            ? `⚠ Lo que queda por pagar este mes (${fmtEur(pendiente.total)}) es más que lo que hay en el banco (${fmtEur(saldo)}).`
            : `✓ El banco cubre lo que queda por pagar este mes (sobran ${fmtEur(saldo - pendiente.total)}).`}
        </p>
      )}
      {pendiente?.partidas.length > 0 && (
        <ul className="chf-lista">
          {pendiente.partidas.map(([cat, v]) => <li key={cat}><span>{cat.replace(/_/g, ' ')}</span><b>{fmtEur(v)}</b></li>)}
        </ul>
      )}
      <p className="chf-nota">Lo pendiente sale del Presupuesto anual menos lo ya pagado en el banco; el saldo, de Gastos banco.</p>
    </Card>
  )
}

// ─── Indicadores rápidos ────────────────────────────────────────────────────
function Indicadores() {
  const month = isoHoy().slice(0, 7)
  const { data: cobros } = usePendientesCobro()
  const { data: payroll } = usePayroll(month)
  const { data: ev } = useBookings()
  const { data: hor } = useHorarios(true)
  const hoy = isoHoy()

  const filas = cobros?.filas || []
  const importe = filas.reduce((s, f) => s + (Number(f.importe ?? f.importeActual ?? 0) || 0), 0)
  const efectivo = (payroll?.rows || []).reduce((s, r) => s + (r.cash_total != null && !r.cash_paid ? (r.cash_due || 0) : 0), 0)
  const senal = (ev?.bookings || []).filter(b => b.date >= hoy && b.date <= sumarDias(hoy, 45) && b.status !== 'cancelada' && depositDue(b, ev.settings))
  const ahora = useMemo(() => {
    const items = hor?.items || []
    const d = (new Date().getDay() + 6) % 7
    const t = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`
    return [...items.filter(i => i.board === 'cronograma' && i.kind !== 'Clase'), ...clasesComoCronograma(items)]
      .filter(i => i.day === d && i.start <= t && t < i.end)
  }, [hor])

  return (
    <div className="chf-tiles">
      <Link className="dash-tile" to="/supervision?tab=grupos&vista=pendientes-cobro" style={{ '--tile': 'var(--state-warn)' }}>
        <strong>{filas.length}</strong><span>Alumnos con cobro pendiente{importe > 0 ? ` · ${fmtEur(importe)}` : ''}</span>
      </Link>
      <Link className="dash-tile" to="/cherifs?tab=nominas" style={{ '--tile': 'var(--brand-mora)' }}>
        <strong>{payroll ? fmtEur(payroll.totals?.outstanding || 0) : '—'}</strong><span>Nóminas por pagar{efectivo > 0 ? ` · ${fmtEur(efectivo)} en efectivo` : ''}</span>
      </Link>
      <Link className="dash-tile" to="/eventos" style={{ '--tile': 'var(--brand-peacock)' }}>
        <strong>{senal.length}</strong><span>Eventos con señal sin pagar (próx. 45 días)</span>
      </Link>
      <Link className="dash-tile" to="/supervision?tab=grupos&vista=altas-bajas" style={{ '--tile': 'var(--state-good)' }}>
        <strong>↗</strong><span>Altas y bajas del mes</span>
      </Link>
      <Link className="dash-tile" to="/diario?vista=horarios" style={{ '--tile': 'var(--color-accent)' }}>
        <strong>{ahora.length}</strong><span>{ahora.length ? `Ahora en el Roco: ${ahora.map(a => a.person).join(', ')}` : 'Ahora no hay nadie en el Roco'}</span>
      </Link>
    </div>
  )
}

// ─── Tareas: Diario + tareas de Notion que no son del calendario ───────────
function Tareas({ items }) {
  const hoy = isoHoy()
  const { data: cal } = useCalendar(sumarDias(hoy, -30), sumarDias(hoy, 30), true)
  const abiertas = items.filter(isOpen)
  const notion = (cal?.items || [])
    .filter(it => !CALENDAR_CATEGORIES.includes(it.category?.name) && !['Listo', 'Archivo'].includes(it.status?.name))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  const atrasadas = notion.filter(it => (it.start || '').slice(0, 10) < hoy)
  const porKind = k => abiertas.filter(it => k.includes(it.kind)).length

  return (
    <Card icon="✅" title="Tareas" link="/diario?vista=tareas" linkLabel="Diario →">
      <div className="chf-mini-tiles">
        <span><b>{porKind(['peticion', 'sugerencia'])}</b> peticiones</span>
        <span><b>{porKind(['compra'])}</b> compras</span>
        <span><b>{porKind(['recordatorio'])}</b> recordatorios</span>
        <span><b>{notion.length}</b> en Notion{atrasadas.length ? ` (${atrasadas.length} atrasadas)` : ''}</span>
      </div>
      <ul className="chf-lista">
        {notion.slice(0, 7).map(it => (
          <li key={it.id} className={(it.start || '').slice(0, 10) < hoy ? 'chf-lista--late' : ''}>
            <span>{it.title}<em> · {it.category?.name || 'Sin categoría'}{it.owners?.length ? ` · ${it.owners.join(', ')}` : ''}</em></span>
            <b>{it.start ? fechaCorta(it.start) : ''}</b>
          </li>
        ))}
      </ul>
      {notion.length === 0 && <p className="dash-empty">Nada pendiente en Notion para estas semanas.</p>}
      <p className="chf-nota">Las de Notion son las que no van al calendario (mantenimiento, mejoras, reuniones…), de hace 30 días a dentro de 30.</p>
    </Card>
  )
}

// ─── Lo que piden los profes ────────────────────────────────────────────────
function PidenProfes({ items }) {
  const abiertas = items.filter(it => isOpen(it) && it.kind !== 'recordatorio')
  const porPersona = {}
  abiertas.forEach(it => { const k = it.requester || it.created_by || '—'; (porPersona[k] = porPersona[k] || []).push(it) })
  const grupos = Object.entries(porPersona).sort((a, b) => b[1].length - a[1].length)
  return (
    <Card icon="💬" title="Lo que piden los profes" link="/diario?vista=tareas" linkLabel="Ver todo →">
      {grupos.length === 0 && <p className="dash-empty">Nadie ha pedido nada pendiente 👍</p>}
      {grupos.map(([quien, its]) => (
        <div key={quien} className="chf-pide">
          <strong>{quien} <span>{its.length}</span></strong>
          <ul className="chf-lista">
            {its.slice(0, 4).map(it => (
              <li key={it.id}>
                <span>{it.urgent && <span className="dash-tag dash-tag--urgent">Urgente</span>}{it.title}<em> · {DIARIO_KINDS[it.kind]?.label} · {STATUS_LABELS[it.status]}</em></span>
                <b>{fechaCorta(it.created_at)}</b>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  )
}

// ─── Calendario de Google ───────────────────────────────────────────────────
function CalendarioGoogle() {
  const { data, error, reload } = useCherifsCalendar()
  const [url, setUrl] = useState('')
  const [editar, setEditar] = useState(false)
  const [msg, setMsg] = useState('')
  const guardar = async e => {
    e.preventDefault(); setMsg('')
    try { await saveCherifsIcal(url.trim()); setUrl(''); setEditar(false); reload() } catch (err) { setMsg(err.message) }
  }
  const sinConfigurar = data && !data.configured
  const porDia = {}
  ;(data?.events || []).forEach(ev => { (porDia[ev.start.slice(0, 10)] = porDia[ev.start.slice(0, 10)] || []).push(ev) })

  return (
    <Card icon="📅" title="Calendario de Google">
      {(sinConfigurar || editar) ? (
        <form className="chf-ical" onSubmit={guardar}>
          <p className="chf-nota">
            En Google Calendar: ⚙ Configuración → tu calendario → «Integrar el calendario» → copia la <b>Dirección secreta en formato iCal</b> y pégala aquí.
            Solo sirve para leer los eventos; se guarda en el servidor y no se enseña a nadie.
          </p>
          <input className="dash-input" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={e => setUrl(e.target.value)} />
          <div className="dash-form__actions">
            <button className="dash-btn dash-btn--primary" disabled={!url.trim()}>Guardar</button>
            {editar && <button type="button" className="dash-btn" onClick={() => setEditar(false)}>Cancelar</button>}
          </div>
          {msg && <p className="dash-error">{msg}</p>}
        </form>
      ) : (
        <>
          {error && <p className="dash-error">{error}</p>}
          {data && data.events.length === 0 && <p className="dash-empty">Nada en los próximos 14 días.</p>}
          {Object.entries(porDia).slice(0, 8).map(([dia, evs]) => (
            <div key={dia} className="chf-gcal">
              <span className="chf-gcal__dia">{diaSemana(dia)} {fechaCorta(dia)}</span>
              <ul className="chf-lista">
                {evs.map((ev, i) => (
                  <li key={i}><span>{ev.title}{ev.location && <em> · {ev.location}</em>}</span><b>{ev.allday ? 'todo el día' : ev.start.slice(11, 16)}</b></li>
                ))}
              </ul>
            </div>
          ))}
          {data?.configured && <button type="button" className="dash-mini" onClick={() => setEditar(true)}>Cambiar calendario</button>}
        </>
      )}
    </Card>
  )
}

export default function CherifsDashboard() {
  const { data: diario } = useDiarioItems(true)
  const items = diario?.items ?? []
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="dash chf">
      <header className="dash__head">
        <p className="dash__date">{fecha}</p>
        <p className="dash__claim">Todo el negocio, bajo control</p>
      </header>
      <Tablon />
      <Indicadores />
      <div className="chf-grid">
        <Dinero />
        <CalendarioGoogle />
        <Tareas items={items} />
        <PidenProfes items={items} />
      </div>
    </div>
  )
}
