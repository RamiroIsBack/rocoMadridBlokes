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
// 25/11: protagonistas la frase y las canciones; lo de rellenar, tras un botoncito «✎ Cambiar».
function Tablon() {
  const { data, error, setData } = useCherifsBoard()
  const [msg, setMsg] = useState('')
  const [song, setSong] = useState({ title: '', url: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editar, setEditar] = useState(false)
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
      <button type="button" className={`dash-gear chf-tablon__edit${editar ? ' dash-gear--on' : ''}`}
        title={editar ? 'Terminar' : 'Cambiar la frase o las canciones'} onClick={() => setEditar(e => !e)}>{editar ? '✓' : '✎'}</button>
      <div className="chf-tablon__msg">
        <span className="chf-tablon__lbl">Frase de la semana</span>
        {ultimo
          ? <>
              <p className="chf-tablon__frase">«{ultimo.text}»</p>
              <span className="chf-tablon__quien">— {ultimo.by || 'un socio'} · {fechaCorta(ultimo.at)}
                {editar && <button type="button" className="dash-mini dash-mini--danger" onClick={() => window.confirm('¿Borrar esta frase?') && run(() => deleteCherifsItem('message', ultimo.id))}>Borrar</button>}
              </span>
            </>
          : <p className="chf-tablon__frase chf-tablon__frase--vacio">Todavía no hay frase esta semana. Pulsa ✎ para poner una 💪</p>}
        {editar && (
          <form className="chf-tablon__form" onSubmit={e => { e.preventDefault(); if (msg.trim()) run(async () => { const r = await addCherifsMessage(msg.trim()); setMsg(''); return r }) }}>
            <input className="dash-input" maxLength={400} placeholder="Nueva frase motivante…" value={msg} onChange={e => setMsg(e.target.value)} autoFocus />
            <button className="dash-btn dash-btn--primary" disabled={busy || !msg.trim()}>Publicar</button>
          </form>
        )}
      </div>
      <div className="chf-tablon__songs">
        <span className="chf-tablon__lbl">🎵 Canciones de la semana</span>
        {deLaSemana.length === 0 && <p className="chf-tablon__vacio">Ninguna todavía. Pulsa ✎ para añadir.</p>}
        <ul className="chf-songs chf-songs--grandes">
          {deLaSemana.map(s => (
            <li key={s.id}>
              <span className="chf-songs__icon" aria-hidden="true">♪</span>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title || 'Escuchar'}</a> : <span className="chf-songs__t">{s.title}</span>}
              <span className="chf-songs__by">{s.by}</span>
              {editar && <button type="button" className="chf-x" title="Quitar" onClick={() => run(() => deleteCherifsItem('song', s.id))}>×</button>}
            </li>
          ))}
        </ul>
        {editar && (
          <form className="chf-tablon__form" onSubmit={e => { e.preventDefault(); if (song.title.trim() || song.url.trim()) run(async () => { const r = await addCherifsSong(song.title.trim(), song.url.trim()); setSong({ title: '', url: '' }); return r }) }}>
            <input className="dash-input" maxLength={150} placeholder="Canción · artista" value={song.title} onChange={e => setSong(s => ({ ...s, title: e.target.value }))} />
            <input className="dash-input" placeholder="Enlace de Spotify o YouTube (opcional)" value={song.url} onChange={e => setSong(s => ({ ...s, url: e.target.value }))} />
            <button className="dash-btn dash-btn--primary" disabled={busy}>Añadir</button>
          </form>
        )}
        {editar && anteriores.length > 0 && (
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
// 25/11: cada cifra lleva a su origen, y se explica de dónde sale «Falta por pagar».
function Dinero() {
  const hoy = new Date()
  const year = hoy.getFullYear(), mIdx = hoy.getMonth()
  const month = `${year}-${pad(mIdx + 1)}`
  const { data: budget, loading: lb } = useBudget(year)
  const { cuadre, cuadreRocoteca, loading: le } = useExpenses(`${year}-01`, 'all')
  const { data: payroll } = usePayroll(month)
  const [verPartidas, setVerPartidas] = useState(false)

  const pendiente = useMemo(() => {
    if (!budget) return null
    const { cats, loaded } = buildComparison(budget.budget, budget.items || [], budget.months_loaded || [], year)
    let total = 0, previsto = 0, pagado = 0
    const partidas = []
    Object.entries(cats).forEach(([cat, c]) => {
      const t = c.target[mIdx], r = c.real[mIdx]
      if (t < -0.005) {
        const falta = Math.max(0, -(t - r))
        previsto += -t
        pagado += Math.max(0, -r)
        if (falta > 0.5) { total += falta; partidas.push({ cat, previsto: -t, pagado: Math.max(0, -r), falta }) }
      }
    })
    partidas.sort((a, b) => b.falta - a.falta)
    return { total, previsto, pagado, partidas, extractoDelMes: loaded.has(mIdx), hayPresupuesto: !!budget.budget }
  }, [budget, year, mIdx])

  const saldos = [cuadre?.saldoHoy, cuadreRocoteca?.saldoHoy].filter(v => v != null)
  const saldo = saldos.length ? saldos.reduce((s, v) => s + v, 0) : null
  const fechaSaldo = cuadre?.fechaHoy || cuadreRocoteca?.fechaHoy
  const nominas = payroll?.totals?.outstanding ?? null
  const noLlega = saldo != null && pendiente && saldo < pendiente.total
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][mIdx]

  return (
    <Card icon="💶" title="Dinero este mes">
      {(lb || le) && !pendiente && <p className="dash-empty">Cargando…</p>}
      <div className="chf-dinero">
        <Link to="/cherifs?tab=gastos" title="Sale de Gastos banco (último extracto cargado)">
          <span>En el banco ↗</span><strong>{saldo != null ? fmtEur(saldo) : '—'}</strong>
          {fechaSaldo && <em>a {fechaCorta(fechaSaldo)}{saldos.length < 2 ? ' · falta una cuenta' : ''}</em>}
        </Link>
        <Link to="/cherifs?tab=presupuesto-anual" title="Sale del Presupuesto anual menos lo ya pagado en el banco">
          <span>Falta por pagar ↗</span><strong>{pendiente ? fmtEur(pendiente.total) : '—'}</strong>
          <em>según el presupuesto</em>
        </Link>
        <Link to="/cherifs?tab=nominas" title="Sale de Nóminas">
          <span>Nóminas pendientes ↗</span><strong>{nominas != null ? fmtEur(nominas) : '—'}</strong>
          <em>de Nóminas</em>
        </Link>
      </div>
      {pendiente && saldo != null && (
        <p className={`chf-aviso${noLlega ? ' chf-aviso--mal' : ''}`}>
          {noLlega
            ? `⚠ Lo que queda por pagar este mes (${fmtEur(pendiente.total)}) es más que lo que hay en el banco (${fmtEur(saldo)}).`
            : `✓ El banco cubre lo que queda por pagar este mes (sobran ${fmtEur(saldo - pendiente.total)}).`}
        </p>
      )}
      {pendiente && (
        <div className="chf-explica">
          <p>
            <b>¿De dónde sale «Falta por pagar»?</b> Del <Link to="/cherifs?tab=presupuesto-anual">Presupuesto anual</Link>: lo previsto para {MES}
            ({fmtEur(pendiente.previsto)}, con lo que se arrastra de meses anteriores) menos lo que ya ha salido del banco en {MES}
            ({fmtEur(pendiente.pagado)}).
          </p>
          {!pendiente.hayPresupuesto && <p className="chf-aviso chf-aviso--mal">⚠ No hay presupuesto cargado para {year}.</p>}
          {pendiente.hayPresupuesto && !pendiente.extractoDelMes && (
            <p className="chf-aviso chf-aviso--mal">⚠ Todavía no hay extracto del banco de {MES} en Gastos banco, así que todo lo previsto cuenta como pendiente. Carga el extracto para que sea real.</p>
          )}
          {pendiente.partidas.length > 0 && (
            <button type="button" className="dash-link" onClick={() => setVerPartidas(v => !v)}>{verPartidas ? 'Ocultar partidas' : `Ver las ${pendiente.partidas.length} partidas pendientes`}</button>
          )}
          {verPartidas && (
            <ul className="chf-lista">
              {pendiente.partidas.map(p => (
                <li key={p.cat}>
                  <span>{p.cat.replace(/_/g, ' ')}<em> · previsto {fmtEur(p.previsto)} · pagado {fmtEur(p.pagado)}</em></span>
                  <b>{fmtEur(p.falta)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
// 25/11: se dice de dónde sale cada cosa y cada una lleva a su sitio.
function Tareas({ items }) {
  const hoy = isoHoy()
  const { data: cal } = useCalendar(sumarDias(hoy, -30), sumarDias(hoy, 30), true)
  const abiertas = items.filter(isOpen)
  const notion = (cal?.items || [])
    .filter(it => it.source !== 'blokes' && !CALENDAR_CATEGORIES.includes(it.category?.name) && !['Listo', 'Archivo'].includes(it.status?.name))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
  const atrasadas = notion.filter(it => (it.start || '').slice(0, 10) < hoy)
  const porKind = k => abiertas.filter(it => k.includes(it.kind)).length

  return (
    <Card icon="✅" title="Tareas">
      <span className="chf-fuente">Del Diario (abiertas)</span>
      <div className="chf-mini-tiles">
        <Link to="/diario?vista=tareas"><b>{porKind(['peticion', 'sugerencia'])}</b> peticiones y sugerencias</Link>
        <Link to="/diario?vista=tareas"><b>{porKind(['compra'])}</b> compras</Link>
        <Link to="/diario?vista=tareas"><b>{porKind(['recordatorio'])}</b> recordatorios</Link>
      </div>
      <span className="chf-fuente">
        De Notion · «Funciones Rocomadrid» ({notion.length}{atrasadas.length ? `, ${atrasadas.length} atrasadas` : ''})
      </span>
      <ul className="chf-lista">
        {notion.slice(0, 8).map(it => (
          <li key={it.id} className={(it.start || '').slice(0, 10) < hoy ? 'chf-lista--late' : ''}>
            <span>
              {it.url ? <a href={it.url} target="_blank" rel="noreferrer">{it.title}</a> : it.title}
              <em> · {it.category?.name || 'Sin categoría'}{it.status?.name ? ` · ${it.status.name}` : ''}{it.owners?.length ? ` · ${it.owners.join(', ')}` : ''}</em>
            </span>
            <b>{it.start ? fechaCorta(it.start) : ''}</b>
          </li>
        ))}
      </ul>
      {notion.length === 0 && <p className="dash-empty">Nada pendiente en Notion para estas semanas.</p>}
      <p className="chf-nota">
        Las de Notion son las tareas de la base «Funciones Rocomadrid» que no van al calendario (mantenimiento, mejoras,
        reuniones…), sin terminar («Listo» o «Archivo» no salen) y con fecha entre hace 30 días y dentro de 30. Pulsa una para abrirla en Notion.
      </p>
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

// ─── Página: cajas que se pueden ordenar arrastrándolas (25/11) ─────────────
// El orden se guarda en este navegador. Las cajas «anchas» ocupan toda la fila.
const ORDEN_KEY = 'blokes-cherifs-orden'
const CAJAS = ['tablon', 'indicadores', 'dinero', 'calendario', 'tareas', 'profes']
const ANCHAS = new Set(['tablon', 'indicadores'])

function leerOrden() {
  try {
    const o = JSON.parse(localStorage.getItem(ORDEN_KEY) || '[]')
    if (Array.isArray(o)) return [...o.filter(c => CAJAS.includes(c)), ...CAJAS.filter(c => !o.includes(c))]
  } catch { /* sin almacenamiento */ }
  return CAJAS
}

export default function CherifsDashboard() {
  const { data: diario } = useDiarioItems(true)
  const items = diario?.items ?? []
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const [orden, setOrden] = useState(leerOrden)
  const [arrastrando, setArrastrando] = useState(null)
  const [sobre, setSobre] = useState(null)

  const guardar = o => { setOrden(o); try { localStorage.setItem(ORDEN_KEY, JSON.stringify(o)) } catch { /* sin almacenamiento */ } }
  const soltar = destino => {
    if (!arrastrando || arrastrando === destino) return
    const o = orden.filter(c => c !== arrastrando)
    o.splice(o.indexOf(destino), 0, arrastrando)
    guardar(o)
  }
  const contenido = {
    tablon: <Tablon />,
    indicadores: <Indicadores />,
    dinero: <Dinero />,
    calendario: <CalendarioGoogle />,
    tareas: <Tareas items={items} />,
    profes: <PidenProfes items={items} />,
  }

  return (
    <div className="dash chf">
      <header className="dash__head chf-head">
        <div>
          <p className="dash__date">{fecha}</p>
          <p className="dash__claim">Todo el negocio, bajo control</p>
        </div>
        <span className="chf-head__hint">Arrastra las cajas por <b>⠿</b> para ordenarlas
          {orden.join() !== CAJAS.join() && <button type="button" className="dash-link" onClick={() => guardar(CAJAS)}> · volver al orden inicial</button>}
        </span>
      </header>
      <div className="chf-tablero">
        {orden.map(id => (
          <div
            key={id}
            className={`chf-caja${ANCHAS.has(id) ? ' chf-caja--ancha' : ''}${arrastrando === id ? ' chf-caja--moviendo' : ''}${sobre === id && arrastrando && arrastrando !== id ? ' chf-caja--destino' : ''}`}
            onDragOver={e => { if (arrastrando) { e.preventDefault(); setSobre(id) } }}
            onDragLeave={() => setSobre(s => (s === id ? null : s))}
            onDrop={e => { e.preventDefault(); soltar(id); setArrastrando(null); setSobre(null) }}
          >
            <span
              className="chf-asa" draggable title="Arrastra para mover esta caja"
              onDragStart={e => { setArrastrando(id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id) } catch { /* algunos navegadores */ } }}
              onDragEnd={() => { setArrastrando(null); setSobre(null) }}
            >⠿</span>
            {contenido[id]}
          </div>
        ))}
      </div>
    </div>
  )
}
