import { useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useDiarioItems, useHorarios, isOpen, STATUS_LABELS, DIARIO_KINDS } from '../hooks/useDiario'
import { useCalendar, CALENDAR_CATEGORIES } from '../hooks/useCalendar'
import { useBudget } from '../hooks/useBudget'
import { useExpenses, usePendientesCobro } from '../hooks/useSuperAdmin'
import { usePayroll } from '../hooks/useOvertime'
import { useBookings, depositDue } from '../hooks/useEvents'
import {
  useCherifsBoard, useCherifsCalendar, addCherifsMessage, addCherifsSong, deleteCherifsItem, saveCherifsIcal, deleteCherifsIcal, useCherifsTasks,
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
// 25/11: protagonistas la frase y las canciones; lo de rellenar, tras «✎ Cambiar» (o pulsando
// la frase). Si nadie ha puesto frase esta semana, sale una del banco que cambia cada día.
const BANCO_FRASES = [
  'Hoy no hace falta encadenar: basta con volver a intentarlo.',
  'Lo que hoy parece imposible, mañana es tu calentamiento.',
  'Cada caída es información. Lee la pared y vuelve a subir.',
  'El Roco lo hacemos entre todos: un bloque, una clase, una sonrisa cada día.',
  'Despacio también se llega arriba.',
  'Las ideas también se equipan: prueba, ajusta y vuelve a probar.',
  'Un buen equipo es como una buena cordada: nadie sube solo.',
  'Hoy, una cosa bien hecha vale más que diez a medias.',
  'La constancia gana a la fuerza bruta. En la pared y en el negocio.',
  'Si cuesta, es que estás aprendiendo.',
  'Celebrad los pequeños tops: también cuentan.',
  'Mira cuánto has subido antes de mirar lo que te falta.',
  'Los mejores bloques salen de los peores días de equipar.',
  'Escuchar al cliente es leer la vía antes de empezarla.',
  'Que el ánimo se contagie como la magnesia.',
  'El reposo también es parte del plan.',
  'Hoy toca disfrutar del proceso.',
  'Un problema grande es solo un bloque con muchos movimientos: de uno en uno.',
  'La pared no tiene prisa. Nosotros tampoco.',
  'Sin miedo a caer: abajo está la colchoneta (y el equipo).',
  'Lo importante no es el grado: es seguir viniendo.',
  'Cada alumno que repite es un top del equipo entero.',
  'Respira, confía en los pies y suelta la mano.',
  'Hacemos sitio para que la gente se enganche a escalar.',
  'Pequeñas mejoras cada semana: así se construye un gran rocódromo.',
  'Hoy, un poco más que ayer.',
  'Si no sale a la primera, tenemos toda la sesión.',
  'La mejor vía es la que te hace sonreír al bajar.',
]
const diaDelAño = () => { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) }

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
  const [desfase, setDesfase] = useState(0)   // «↻ Otra» del banco
  // La frase de un socio vale para la semana en que se publicó; si no hay, la del banco del día
  const lunes = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d })()
  const ultimo = (data?.messages || []).find(m => new Date(m.at.replace(' ', 'T')) >= lunes)
  const delBanco = BANCO_FRASES[(diaDelAño() + desfase) % BANCO_FRASES.length]
  const deLaSemana = (data?.songs || []).filter(s => s.week === semana)
  const anteriores = (data?.songs || []).filter(s => s.week !== semana).slice(0, 5)

  return (
    <section className="dash-card chf-tablon">
      <button type="button" className={`chf-tablon__edit${editar ? ' chf-tablon__edit--on' : ''}`}
        title={editar ? 'Terminar' : 'Cambiar la frase o las canciones'} onClick={() => setEditar(e => !e)}>{editar ? '✓ Listo' : '✎ Cambiar'}</button>
      <div className="chf-tablon__msg">
        <span className="chf-tablon__lbl">{ultimo ? 'Frase de la semana' : 'Frase del día'}</span>
        {ultimo
          ? <>
              <p className="chf-tablon__frase" onClick={() => setEditar(true)} title="Pulsa para cambiarla">«{ultimo.text}»</p>
              <span className="chf-tablon__quien">— {ultimo.by || 'un socio'} · {fechaCorta(ultimo.at)}
                {editar && <button type="button" className="dash-mini dash-mini--danger" onClick={() => window.confirm('¿Borrar esta frase? Volverá a salir la del día.') && run(() => deleteCherifsItem('message', ultimo.id))}>Borrar</button>}
              </span>
            </>
          : <>
              <p className="chf-tablon__frase" onClick={() => setEditar(true)} title="Pulsa para poner la vuestra">«{delBanco}»</p>
              {editar && (
                <span className="chf-tablon__quien">— del banco de frases
                  <button type="button" className="dash-mini" onClick={() => setDesfase(d => d + 1)} title="Ver otra del banco">↻ Otra</button>
                </span>
              )}
            </>}
        {editar && (
          <form className="chf-tablon__form" onSubmit={e => { e.preventDefault(); if (msg.trim()) run(async () => { const r = await addCherifsMessage(msg.trim()); setMsg(''); return r }) }}>
            <input className="dash-input" maxLength={400} placeholder="Escribe la frase de esta semana…" value={msg} onChange={e => setMsg(e.target.value)} autoFocus />
            <button className="dash-btn dash-btn--primary" disabled={busy || !msg.trim()}>Publicar</button>
            {!ultimo && <button type="button" className="dash-btn" onClick={() => setMsg(delBanco)} title="Copiar la del banco para retocarla">Usar la del día</button>}
          </form>
        )}
      </div>
      <div className="chf-tablon__songs">
        <span className="chf-tablon__lbl">🎵 Temazos de la semana</span>
        {deLaSemana.length === 0 && <p className="chf-tablon__vacio">Ninguna todavía. Pulsa ✎ para añadir.</p>}
        <ul className="chf-songs chf-songs--grandes">
          {deLaSemana.map(s => (
            <li key={s.id}>
              {s.thumb
                ? <a href={s.url} target="_blank" rel="noreferrer" className="chf-songs__cover"><img src={s.thumb} alt="" loading="lazy" /></a>
                : <span className="chf-songs__cover chf-songs__cover--vacia" aria-hidden="true">♪</span>}
              <span className="chf-songs__txt">
                {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title || 'Escuchar'}</a> : <span className="chf-songs__t">{s.title}</span>}
                <span className="chf-songs__by">Temazo recomendado{s.by ? ` por ${s.by}` : ''}</span>
              </span>
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
  const [verExplica, setVerExplica] = useState(false)

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
          <button type="button" className="dash-link chf-explica__btn" onClick={() => setVerExplica(v => !v)}>
            {verExplica ? 'Ocultar' : '¿De dónde sale «Falta por pagar»?'}
          </button>
          {verExplica && (
            <p>
              Del <Link to="/cherifs?tab=presupuesto-anual">Presupuesto anual</Link>: lo previsto para {MES}
              ({fmtEur(pendiente.previsto)}, con lo que se arrastra de meses anteriores) menos lo que ya ha salido del banco en {MES}
              ({fmtEur(pendiente.pagado)}).
            </p>
          )}
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
  // 25/11: las tareas ya viven en Cherifs › Tareas; aquí las abiertas atrasadas, las de los
  // próximos 30 días y las de prioridad Alta sin fecha (+ lo que quede en Notion sin copiar)
  const { data: blk } = useCherifsTasks()
  const abiertas = items.filter(isOpen)
  const hasta = sumarDias(hoy, 30)
  const deBlokes = (blk?.items || []).filter(it => !['Listo', 'Archivo'].includes(it.status?.name) &&
    (it.start ? it.start.slice(0, 10) <= hasta : it.priority === 'Alta'))
  const notion = [...deBlokes, ...(cal?.items || [])
    .filter(it => it.source !== 'blokes' && !CALENDAR_CATEGORIES.includes(it.category?.name) && !['Listo', 'Archivo'].includes(it.status?.name))]
    .sort((a, b) => (a.start || '9').localeCompare(b.start || '9'))
  const atrasadas = notion.filter(it => it.start && it.start.slice(0, 10) < hoy)
  const porKind = k => abiertas.filter(it => k.includes(it.kind)).length
  // 25/11: ordenar por fecha o por persona encargada; cada tarea en una línea, detalle al pulsar
  const [orden, setOrden] = useState('fecha')
  const [abierta, setAbierta] = useState(null)
  const [todas, setTodas] = useState(false)
  const [verOrigen, setVerOrigen] = useState(false)
  const lista = todas ? notion : notion.slice(0, 10)
  const grupos = orden === 'persona'
    ? Object.entries(lista.reduce((acc, it) => {
        const quienes = it.owners?.length ? it.owners : ['Sin encargado']
        quienes.forEach(q => { (acc[q] = acc[q] || []).push(it) })
        return acc
      }, {})).sort((a, b) => (a[0] === 'Sin encargado') - (b[0] === 'Sin encargado') || a[0].localeCompare(b[0]))
    : [[null, lista]]

  const fila = it => {
    const tarde = !!it.start && it.start.slice(0, 10) < hoy
    const open = abierta === it.id
    return (
      <li key={`${it.id}-${orden}`} className={`chf-tarea${tarde ? ' chf-lista--late' : ''}${open ? ' chf-tarea--open' : ''}`}>
        <button type="button" className="chf-tarea__main" onClick={() => setAbierta(open ? null : it.id)}>
          <span className="chf-tarea__t">{it.priority && <span className={`chf-prio chf-prio--${it.priority.toLowerCase()}`}>{it.priority}</span>} {it.title}</span>
          {orden === 'fecha' && it.owners?.length > 0 && <span className="chf-tarea__quien">{it.owners.join(', ')}</span>}
          <b>{it.start ? fechaCorta(it.start) : ''}</b>
        </button>
        {open && (
          <div className="chf-tarea__det">
            <span>{it.category?.name || 'Sin categoría'}{it.status?.name ? ` · ${it.status.name}` : ''}{it.owners?.length ? ` · ${it.owners.join(', ')}` : ''}{tarde ? ' · atrasada' : ''}</span>
            {it.source === 'blokes'
              ? <Link to="/cherifs?tab=tareas">Abrir en Tareas →</Link>
              : it.url && <a href={it.url} target="_blank" rel="noreferrer">Abrir en Notion ↗</a>}
          </div>
        )}
      </li>
    )
  }

  return (
    <Card icon="✅" title="Tareas">
      <span className="chf-fuente">Del Diario (abiertas)</span>
      <div className="chf-mini-tiles">
        <Link to="/diario?vista=tareas"><b>{porKind(['peticion', 'sugerencia'])}</b> peticiones y sugerencias</Link>
        <Link to="/diario?vista=tareas"><b>{porKind(['compra'])}</b> compras</Link>
        <Link to="/diario?vista=tareas"><b>{porKind(['recordatorio'])}</b> recordatorios</Link>
      </div>
      <div className="chf-tareas__bar">
        <Link to="/cherifs?tab=tareas" className="chf-fuente">Tareas ({notion.length}{atrasadas.length ? `, ${atrasadas.length} atrasadas` : ''}) →</Link>
        <div className="dash-form__seg">
          <button type="button" className={`dash-mini${orden === 'fecha' ? ' chf-on' : ''}`} onClick={() => setOrden('fecha')}>Por fecha</button>
          <button type="button" className={`dash-mini${orden === 'persona' ? ' chf-on' : ''}`} onClick={() => setOrden('persona')}>Por persona</button>
        </div>
      </div>
      {grupos.map(([quien, its]) => (
        <div key={quien || 'todas'}>
          {quien && <span className="chf-tareas__grupo">{quien} <i>{its.length}</i></span>}
          <ul className="chf-lista">{its.map(fila)}</ul>
        </div>
      ))}
      {notion.length === 0 && <p className="dash-empty">Nada pendiente para estas semanas.</p>}
      {notion.length > 10 && (
        <button type="button" className="dash-link" onClick={() => setTodas(t => !t)}>{todas ? 'Ver menos' : `Ver las ${notion.length}`}</button>
      )}
      <button type="button" className="dash-link chf-explica__btn" onClick={() => setVerOrigen(v => !v)}>{verOrigen ? 'Ocultar' : '¿De dónde salen?'}</button>
      {verOrigen && (
        <p className="chf-nota">
          De Cherifs › Tareas (lo que antes estaba en Notion): las que no están terminadas, con fecha hasta dentro de 30 días
          (también las atrasadas) y las de prioridad Alta aunque no tengan fecha. Mientras quede algo en Notion sin copiar, también sale.
          Pulsa una para ver el detalle.
        </p>
      )}
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
  const [nombre, setNombre] = useState('')
  const [verTodo, setVerTodo] = useState(false)
  // 25/11: varios calendarios; cada uno con su nombre, que sale junto a sus eventos
  const guardar = async e => {
    e.preventDefault(); setMsg('')
    try { await saveCherifsIcal(url.trim(), nombre.trim()); setUrl(''); setNombre(''); setEditar(false); reload() } catch (err) { setMsg(err.message) }
  }
  const quitar = async cal => {
    if (!window.confirm(`¿Quitar «${cal.name}» de Blokes? (En Google no se borra nada.)`)) return
    try { await deleteCherifsIcal(cal.id); reload() } catch (err) { setMsg(err.message) }
  }
  const calendarios = data?.calendars || []
  const varios = calendarios.length > 1
  // 25/11: «Pegar» lee lo copiado; arrastrar la dirección al recuadro también vale
  // 25/11 (2): Google a veces copia la dirección solo como HTML o con texto alrededor,
  // así que se busca la dirección .ics dentro de todo lo copiado (texto y HTML)
  const sacarIcal = txt => {
    const t = String(txt || '')
    const m = t.match(/(?:https|webcal):\/\/calendar\.google\.com\/calendar\/ical\/[^\s"'<>]+?\.ics(?:\?[^\s"'<>]*)?/i)
    return m ? m[0].replace(/&amp;/g, '&') : t.trim()
  }
  const inputRef = useRef(null)
  const pegar = async () => {
    setMsg('')
    let encontrado = ''
    try {
      if (navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          for (const tipo of item.types.filter(x => x.startsWith('text/'))) {
            const t = sacarIcal(await (await item.getType(tipo)).text())
            if (t) { encontrado = t; if (/\.ics/i.test(t)) break }
          }
          if (/\.ics/i.test(encontrado)) break
        }
      }
      if (!encontrado && navigator.clipboard?.readText) encontrado = sacarIcal(await navigator.clipboard.readText())
    } catch { /* sin permiso: se cae a Ctrl+V */ }
    if (encontrado) setUrl(encontrado)
    else { setMsg('El navegador no me deja leer lo copiado. Pulsa dentro del recuadro y pega con Ctrl+V (o clic derecho → Pegar).'); inputRef.current?.focus() }
  }
  const alPegar = e => {
    const t = sacarIcal(e.clipboardData.getData('text/plain') || e.clipboardData.getData('text/html'))
    if (t) { e.preventDefault(); setUrl(t); setMsg('') }
  }
  const soltar = e => {
    const t = sacarIcal(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/html'))
    if (t) { e.preventDefault(); setUrl(t) }
  }
  // Si la lectura falla (o no hay dirección), se enseña el recuadro para poner la dirección
  const sinConfigurar = (data && !data.configured) || (!data && !!error)
  const porDia = {}
  ;(data?.events || []).forEach(ev => { (porDia[ev.start.slice(0, 10)] = porDia[ev.start.slice(0, 10)] || []).push(ev) })
  // 25/11 (tarde, Álvaro: «más sintético»): una sola fila con los próximos días que tienen algo,
  // desde hoy; cada evento en una línea (el texto entero y el lugar, al pasar el ratón).
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const hoy = iso(new Date())
  const VISIBLES = 7
  const proximos = Object.keys(porDia).sort().filter(dia => dia >= hoy)
  const visibles = verTodo ? proximos : proximos.slice(0, VISIBLES)

  return (
    <Card icon="📅" title="Calendario">
      {(sinConfigurar || editar) ? (
        <form className="chf-ical" onSubmit={guardar}>
          <p className="chf-nota">
            En Google Calendar: ⚙ Configuración → tu calendario → «Integrar el calendario» → copia la <b>Dirección secreta en formato iCal</b> y pégala aquí.
            Un calendario cada vez (el de «Cumpleaños» no tiene esa dirección). Solo sirve para leer los eventos; se guarda en el servidor y no se enseña a nadie.
          </p>
          {error && !data && <p className="dash-error">No se pudo leer el calendario ({error}). Vuelve a poner la dirección.</p>}
          {calendarios.length > 0 && (
            <ul className="chf-lista chf-ical__cals">
              {calendarios.map(cal => (
                <li key={cal.id}><span>📅 {cal.name}</span>
                  <button type="button" className="dash-mini dash-mini--danger" onClick={() => quitar(cal)}>Quitar</button></li>
              ))}
            </ul>
          )}
          <span className="chf-tablon__lbl">{calendarios.length ? 'Añadir otro calendario' : 'Añadir calendario'}</span>
          <input className="dash-input" maxLength={40} placeholder="Nombre (p. ej. Recordatorios Roco)" value={nombre} onChange={e => setNombre(e.target.value)} />
          <div className="chf-ical__fila">
            <input ref={inputRef} className="dash-input" placeholder="Pulsa aquí y pega con Ctrl+V" value={url}
              onChange={e => setUrl(e.target.value)} onPaste={alPegar} onDrop={soltar} onDragOver={e => e.preventDefault()} />
            <button type="button" className="dash-btn" onClick={pegar} title="Pegar lo que has copiado">📋 Pegar</button>
          </div>
          <div className="dash-form__actions">
            <button className="dash-btn dash-btn--primary" disabled={!url.trim()}>Guardar</button>
            {editar && <button type="button" className="dash-btn" onClick={() => { setEditar(false); setMsg('') }}>{calendarios.length ? 'Cerrar' : 'Cancelar'}</button>}
          </div>
          {msg && <p className="dash-error">{msg}</p>}
        </form>
      ) : null}
      {!editar && data && (
        <>
          {error && <p className="dash-error">{error}</p>}
          {data.failed?.length > 0 && <p className="chf-aviso chf-aviso--mal">⚠ No se pudo leer: {data.failed.join(', ')}. Quítalo y vuelve a ponerlo en «Calendarios».</p>}
          <div className="chf-cal">
            {visibles.map(dia => (
              <div key={dia} className={`chf-cal__dia${dia === hoy ? ' chf-cal__dia--hoy' : ''}`}>
                <span className="chf-cal__fecha">{dia === hoy ? 'Hoy' : diaSemana(dia)} {fechaCorta(dia)}</span>
                {porDia[dia].map((ev, i) => (
                  <span key={i} className={`chf-cal__ev${ev.cumple ? ' chf-cal__ev--cumple' : ''}`}
                    title={`${ev.title}${ev.location ? ` · ${ev.location}` : ''}${varios && ev.cal && !ev.cumple ? ` (${ev.cal})` : ''}`}>
                    {!ev.allday && <b>{ev.start.slice(11, 16)}</b>} {ev.title}
                  </span>
                ))}
              </div>
            ))}
            {!proximos.length && <span className="chf-semana__nada">Nada en los próximos días.</span>}
          </div>
          <div className="chf-cal__pie">
            {proximos.length > VISIBLES && (
              <button type="button" className="dash-mini" onClick={() => setVerTodo(v => !v)}>
                {verTodo ? 'Ver menos' : `Ver ${proximos.length - VISIBLES} días más`}
              </button>
            )}
            {data.configured && <button type="button" className="dash-mini" onClick={() => setEditar(true)}>Calendarios ({calendarios.length}) · + Añadir otro</button>}
          </div>
        </>
      )}
    </Card>
  )
}

// ─── Página: cajas que se pueden ordenar arrastrándolas (25/11) ─────────────
// El orden se guarda en este navegador. Las cajas «anchas» ocupan toda la fila.
// 25/11 (tarde, Álvaro): el calendario va a todo el ancho y en horizontal, debajo de los
// indicadores. La clave cambia (-v2) para que el orden guardado se reinicie una vez.
const ORDEN_KEY = 'blokes-cherifs-orden-v2'
const CAJAS = ['tablon', 'indicadores', 'calendario', 'dinero', 'tareas', 'profes']
const ANCHAS = new Set(['tablon', 'indicadores', 'calendario'])

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
