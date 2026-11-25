// Cherifs › Tareas (25/11/2026)
// Las tareas que antes vivían en Notion («Funciones Rocomadrid»), ahora en Blokes.
// Filtros por encargado, fecha, prioridad, área y estado; agrupadas por fecha,
// encargado, prioridad o área. Paso 2 del traslado: «Copiar de Notion» (sin duplicar).
import { useState, useMemo, useEffect } from 'react'
import { useCherifsTasks, importNotionTasks, useCherifsMeetings, createMeeting, saveMeeting } from '../hooks/useCherifs'
import CherifsReuniones, { conTareas } from './CherifsReuniones'
import { createActivity, updateActivity, deleteActivity } from '../hooks/useCalendar'
import './DashboardPage.css'

const ESTADOS = ['Sin empezar', 'En progreso', 'Respuesta', 'Dudas Socios', 'Duda Eva', 'Listo', 'Archivo']
const HECHAS = new Set(['Listo', 'Archivo'])
const PRIORIDADES = ['Alta', 'Media', 'Baja']
const ORDEN_PRIO = { Alta: 0, Media: 1, Baja: 2, '': 3 }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const FILTROS_KEY = 'blokes-cherifs-tareas-filtros'

const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fechaCorta = s => { if (!s) return ''; const [, m, d] = s.slice(0, 10).split('-').map(Number); return `${d} ${MESES[m - 1]}${s.length > 10 ? ' · ' + s.slice(11, 16) : ''}` }

const FILTROS_INICIALES = { quien: '', area: '', prio: '', cuando: '', estado: 'abiertas', texto: '', agrupar: 'fecha' }
function leerFiltros() {
  try { return { ...FILTROS_INICIALES, ...JSON.parse(localStorage.getItem(FILTROS_KEY) || '{}'), texto: '' } } catch { return FILTROS_INICIALES }
}

export default function CherifsTareas() {
  const { data, error, reload, setData } = useCherifsTasks()
  const { data: meet, error: meetErr, setData: setMeet } = useCherifsMeetings()
  const [vista, setVista] = useState(() => { try { return localStorage.getItem('blokes-cherifs-tareas-vista') || 'tareas' } catch { return 'tareas' } })
  useEffect(() => { try { localStorage.setItem('blokes-cherifs-tareas-vista', vista) } catch { /* sin almacenamiento */ } }, [vista])
  const [f, setF] = useState(leerFiltros)
  const [abierta, setAbierta] = useState(null)      // id de la tarea desplegada, o 'nueva'
  const [aviso, setAviso] = useState('')
  const [copiando, setCopiando] = useState(false)
  // 25/11: selección múltiple para ordenar de golpe lo que vino de Notion
  const [sel, setSel] = useState(null)              // null = modo normal; Set de bids = seleccionando
  const [progreso, setProgreso] = useState('')
  const [fechaNueva, setFechaNueva] = useState('')
  useEffect(() => { try { localStorage.setItem(FILTROS_KEY, JSON.stringify(f)) } catch { /* sin almacenamiento */ } }, [f])
  const cambia = (k, v) => setF(x => ({ ...x, [k]: v }))

  const hoy = iso(new Date())
  const finSemana = (() => { const d = new Date(); d.setDate(d.getDate() + (7 - ((d.getDay() + 6) % 7)) - 1); return iso(d) })()
  const mes = hoy.slice(0, 7)

  const items = data?.items || []
  const filtradas = useMemo(() => items.filter(t => {
    const st = t.status?.name || ''
    if (f.estado === 'abiertas' && HECHAS.has(st)) return false
    if (f.estado === 'hechas' && !HECHAS.has(st)) return false
    if (f.quien && !(f.quien === '—' ? t.owners.length === 0 : t.owners.includes(f.quien))) return false
    if (f.area && (t.category?.name || '') !== f.area) return false
    if (f.prio && (f.prio === '—' ? t.priority !== '' : t.priority !== f.prio)) return false
    const dia = (t.start || '').slice(0, 10)
    if (f.cuando === 'atrasadas' && !(dia && dia < hoy && !HECHAS.has(st))) return false
    if (f.cuando === 'semana' && !(dia && dia >= hoy && dia <= finSemana)) return false
    if (f.cuando === 'mes' && !(dia && dia.slice(0, 7) === mes)) return false
    if (f.cuando === 'sin' && dia) return false
    if (f.texto) {
      const q = f.texto.toLowerCase()
      if (![t.title, t.comment, t.concept, t.contact].some(x => (x || '').toLowerCase().includes(q))) return false
    }
    return true
  }), [items, f, hoy, finSemana, mes])

  const grupos = useMemo(() => {
    const g = {}
    const add = (k, t) => { (g[k] = g[k] || []).push(t) }
    filtradas.forEach(t => {
      const dia = (t.start || '').slice(0, 10)
      if (f.agrupar === 'quien') (t.owners.length ? t.owners : ['Sin encargado']).forEach(o => add(o, t))
      else if (f.agrupar === 'prio') add(t.priority || 'Sin prioridad', t)
      else if (f.agrupar === 'area') add(t.category?.name || 'Sin área', t)
      else add(!dia ? 'Sin fecha' : (dia < hoy && !HECHAS.has(t.status?.name)) ? 'Atrasadas' : dia === hoy ? 'Hoy' : dia <= finSemana ? 'Esta semana' : dia.slice(0, 7) === mes ? 'Este mes' : 'Más adelante', t)
    })
    const ordenFecha = ['Atrasadas', 'Hoy', 'Esta semana', 'Este mes', 'Más adelante', 'Sin fecha']
    const claves = Object.keys(g).sort((a, b) => {
      if (f.agrupar === 'fecha') return ordenFecha.indexOf(a) - ordenFecha.indexOf(b)
      if (f.agrupar === 'prio') return ORDEN_PRIO[a === 'Sin prioridad' ? '' : a] - ORDEN_PRIO[b === 'Sin prioridad' ? '' : b]
      if (a.startsWith('Sin ')) return 1
      if (b.startsWith('Sin ')) return -1
      return a.localeCompare(b, 'es')
    })
    // Dentro de cada grupo: prioridad y luego fecha
    claves.forEach(k => g[k].sort((a, b) => (ORDEN_PRIO[a.priority] - ORDEN_PRIO[b.priority]) || ((a.start || '9') < (b.start || '9') ? -1 : 1)))
    return claves.map(k => [k, g[k]])
  }, [filtradas, f.agrupar, hoy, finSemana, mes])

  const guardada = (item, borrada = false) => {
    setData(d => {
      if (!d) return d
      const resto = d.items.filter(t => t.bid !== (item?.bid ?? borrada))
      return { ...d, items: borrada ? resto : [...resto, item] }
    })
  }
  const marcarHecha = async t => {
    try { guardada(await updateActivity(t.bid, { status: HECHAS.has(t.status?.name) ? 'Sin empezar' : 'Listo' })) } catch (e) { setAviso(e.message) }
  }
  const copiar = async () => {
    setCopiando(true); setAviso('')
    try {
      const r = await importNotionTasks()
      setAviso(`✓ Copiadas de Notion: ${r.nuevas} nuevas${r.ya_estaban ? ` (${r.ya_estaban} ya estaban)` : ''}. Las del calendario (eventos, cumpleaños…) ya salen desde Blokes.`)
      reload()
    } catch (e) { setAviso(e.message) } finally { setCopiando(false) }
  }

  const toggleSel = bids => setSel(s => {
    const n = new Set(s)
    const todas = bids.every(b => n.has(b))
    bids.forEach(b => (todas ? n.delete(b) : n.add(b)))
    return n
  })
  // Aplica el cambio a cada seleccionada (de 6 en 6); cambio = objeto o función (tarea) → objeto
  const aplicar = async (cambio, texto) => {
    const lista = items.filter(t => sel?.has(t.bid))
    if (!lista.length) return
    if (lista.length > 5 && !window.confirm(`${texto} en ${lista.length} tareas. ¿Seguimos?`)) return
    setAviso(''); let hechas = 0; const fallos = []
    for (let i = 0; i < lista.length; i += 6) {
      setProgreso(`Cambiando ${Math.min(i + 6, lista.length)} de ${lista.length}…`)
      await Promise.all(lista.slice(i, i + 6).map(async t => {
        try { guardada(await updateActivity(t.bid, typeof cambio === 'function' ? cambio(t) : cambio)); hechas++ }
        catch (e) { fallos.push(`${t.title}: ${e.message}`) }
      }))
    }
    setProgreso('')
    setAviso(`✓ ${texto}: ${hechas} tareas.${fallos.length ? ` No se pudo con ${fallos.length}: ${fallos.slice(0, 3).join(' · ')}` : ''}`)
    setSel(new Set())
  }
  const visibles = grupos.flatMap(([, l]) => l.map(t => t.bid)).filter((b, i, a) => a.indexOf(b) === i)
  const nSel = sel ? sel.size : 0
  // Selección → puntos del orden del día de una reunión (o de una nueva)
  const alOrdenDelDia = async id => {
    if (!id || !sel?.size) return
    const bids = [...sel]
    setAviso('')
    try {
      let m
      if (id === 'nueva') {
        const d = new Date(); d.setDate(d.getDate() + 7)
        m = await createMeeting({ date: iso(d), time: '', title: 'Reunión de socios', points: conTareas({ points: [] }, bids).points })
      } else {
        const actual = proximas.find(x => x.id === id)
        m = await saveMeeting(id, conTareas(actual, bids))
      }
      setMeet(d => ({ ...(d || {}), meetings: [...(d?.meetings || []).filter(x => x.id !== m.id), m] }))
      setAviso(`✓ ${bids.length} tareas al orden del día de «${m.title}» (${m.date.slice(8, 10)}/${m.date.slice(5, 7)}).`)
      setSel(new Set())
    } catch (e) { setAviso(e.message) }
  }

  const abiertasTotal = items.filter(t => !HECHAS.has(t.status?.name)).length
  const atrasadas = items.filter(t => t.start && t.start.slice(0, 10) < hoy && !HECHAS.has(t.status?.name)).length

  // 25/11: dos vistas, la lista de tareas y las reuniones de socios (orden del día)
  const proximas = (meet?.meetings || []).filter(m => !m.closed).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const nPendReu = proximas[0]?.points.filter(p => !p.done).length || 0
  const vistas = (
    <div className="chf-vistas">
      <button type="button" className={`chf-vistas__b${vista === 'tareas' ? ' chf-vistas__b--on' : ''}`} onClick={() => setVista('tareas')}>Tareas</button>
      <button type="button" className={`chf-vistas__b${vista === 'reuniones' ? ' chf-vistas__b--on' : ''}`} onClick={() => setVista('reuniones')}>
        Reuniones{proximas[0] ? ` · próxima ${proximas[0].date.slice(8, 10)}/${proximas[0].date.slice(5, 7)}${nPendReu ? ` (${nPendReu})` : ''}` : ''}
      </button>
    </div>
  )
  if (vista === 'reuniones') {
    return (
      <div className="chf-tareas">
        {vistas}
        {meetErr && <p className="dash-error">{meetErr}</p>}
        <CherifsReuniones meetings={meet?.meetings || (meet ? [] : null)}
          setMeetings={fn => setMeet(d => ({ ...(d || {}), meetings: typeof fn === 'function' ? fn(d?.meetings || []) : fn }))}
          tareas={items} owners={data?.owners || []} onTareaCreada={it => guardada(it)} />
      </div>
    )
  }

  return (
    <div className="chf-tareas">
      {vistas}
      <section className="dash-card">
        <div className="chf-tareas__cab">
          <div>
            <h2 className="chf-tareas__tit">Tareas</h2>
            <p className="chf-nota">{abiertasTotal} abiertas{atrasadas ? ` · ${atrasadas} atrasadas` : ''} · {items.length} en total</p>
          </div>
          <button type="button" className="dash-btn dash-btn--primary" onClick={() => setAbierta(abierta === 'nueva' ? null : 'nueva')}>+ Nueva tarea</button>
        </div>
        {error && <p className="dash-error">{error}</p>}
        {data && data.notion_imported === 0 && (
          <div className="chf-tareas__paso">
            <b>Paso 2 del traslado:</b> copia aquí todo lo de Notion («Funciones Rocomadrid»), también lo hecho y archivado.
            No se duplica nada y, a partir de ahí, las tareas se llevan solo desde Blokes.{' '}
            <button type="button" className="dash-btn dash-btn--primary" disabled={copiando || !data.notion_token} onClick={copiar}>
              {copiando ? 'Copiando… (puede tardar un minuto)' : '⇩ Copiar de Notion'}
            </button>
            {!data.notion_token && <span> (Falta conectar Notion en el Calendario.)</span>}
          </div>
        )}
        {aviso && <p className="chf-aviso">{aviso}</p>}
        {abierta === 'nueva' && data && (
          <FormTarea opciones={data} onCancel={() => setAbierta(null)} onSaved={it => { guardada(it); setAbierta(null) }} />
        )}

        <div className="chf-filtros">
          <input className="dash-input" placeholder="Buscar…" value={f.texto} onChange={e => cambia('texto', e.target.value)} />
          <select className="dash-input" value={f.quien} onChange={e => cambia('quien', e.target.value)} title="Encargado">
            <option value="">Encargado: todos</option>
            {(data?.owners || []).map(o => <option key={o} value={o}>{o}</option>)}
            <option value="—">Sin encargado</option>
          </select>
          <select className="dash-input" value={f.cuando} onChange={e => cambia('cuando', e.target.value)} title="Fecha">
            <option value="">Fecha: cualquiera</option>
            <option value="atrasadas">Atrasadas</option>
            <option value="semana">Esta semana</option>
            <option value="mes">Este mes</option>
            <option value="sin">Sin fecha</option>
          </select>
          <select className="dash-input" value={f.prio} onChange={e => cambia('prio', e.target.value)} title="Prioridad">
            <option value="">Prioridad: todas</option>
            {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
            <option value="—">Sin prioridad</option>
          </select>
          <select className="dash-input" value={f.area} onChange={e => cambia('area', e.target.value)} title="Área">
            <option value="">Área: todas</option>
            {(data?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="dash-input" value={f.estado} onChange={e => cambia('estado', e.target.value)} title="Estado">
            <option value="abiertas">Abiertas</option>
            <option value="hechas">Hechas y archivadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div className="chf-agrupar">
          <span>Agrupar por</span>
          {[['fecha', 'Fecha'], ['quien', 'Encargado'], ['prio', 'Prioridad'], ['area', 'Área']].map(([k, l]) => (
            <button key={k} type="button" className={`dash-mini${f.agrupar === k ? ' dash-mini--on' : ''}`} onClick={() => cambia('agrupar', k)}>{l}</button>
          ))}
          {(f.quien || f.area || f.prio || f.cuando || f.estado !== 'abiertas' || f.texto) &&
            <button type="button" className="dash-mini" onClick={() => setF(x => ({ ...FILTROS_INICIALES, agrupar: x.agrupar }))}>Quitar filtros</button>}
          <button type="button" className={`dash-mini chf-agrupar__sel${sel ? ' dash-mini--on' : ''}`} onClick={() => { setSel(sel ? null : new Set()); setAbierta(null) }}>
            {sel ? '✕ Terminar selección' : '☑ Seleccionar varias'}
          </button>
        </div>
      </section>

      {sel && (
        <div className="chf-bloque">
          <div className="chf-bloque__fila">
            <b>{nSel} seleccionadas</b>
            <button type="button" className="dash-mini" onClick={() => toggleSel(visibles)}>
              {visibles.length && visibles.every(b => sel.has(b)) ? 'Quitar todas' : `Todas las que se ven (${visibles.length})`}
            </button>
            {progreso && <span className="chf-nota">{progreso}</span>}
          </div>
          {nSel > 0 && !progreso && (
            <div className="chf-bloque__fila">
              <button type="button" className="dash-btn" onClick={() => aplicar({ status: 'Listo' }, 'Marcadas como Listo')}>✓ Listo</button>
              <button type="button" className="dash-btn" onClick={() => aplicar({ status: 'Archivo' }, 'Archivadas')}>Archivar</button>
              <button type="button" className="dash-btn" onClick={() => aplicar({ start: '', end: '' }, 'Sin fecha')}>Quitar fecha</button>
              <span className="chf-bloque__grupo">
                <input type="date" className="dash-input" value={fechaNueva} onChange={e => setFechaNueva(e.target.value)} />
                <button type="button" className="dash-btn" disabled={!fechaNueva} onClick={() => aplicar({ start: fechaNueva, end: '' }, `Movidas al ${fechaCorta(fechaNueva)}`)}>Poner fecha</button>
              </span>
              <select className="dash-input" value="" onChange={e => e.target.value && aplicar({ priority: e.target.value === '—' ? '' : e.target.value }, `Prioridad ${e.target.value}`)}>
                <option value="">Prioridad…</option>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="—">Sin prioridad</option>
              </select>
              <select className="dash-input" value="" onChange={e => {
                const o = e.target.value
                if (o === '—') aplicar({ owners: [] }, 'Sin encargado')
                else if (o) aplicar(t => ({ owners: t.owners.includes(o) ? t.owners : [...t.owners, o] }), `Encargado ${o}`)
              }}>
                <option value="">Encargado…</option>
                {(data?.owners || []).map(o => <option key={o} value={o}>+ {o}</option>)}
                <option value="—">Quitar encargados</option>
              </select>
              <select className="dash-input" value="" onChange={e => e.target.value && aplicar({ category: e.target.value }, `Área ${e.target.value}`)}>
                <option value="">Área…</option>
                {(data?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="dash-input" value="" onChange={e => alOrdenDelDia(e.target.value)}>
                <option value="">→ Al orden del día…</option>
                {proximas.map(m => <option key={m.id} value={m.id}>{m.title} · {m.date.slice(8, 10)}/{m.date.slice(5, 7)}</option>)}
                <option value="nueva">+ Reunión nueva (dentro de una semana)</option>
              </select>
            </div>
          )}
        </div>
      )}

      {!data && !error && <p className="dash-empty">Cargando…</p>}
      {data && filtradas.length === 0 && <p className="dash-empty">No hay tareas con estos filtros.</p>}
      {grupos.map(([g, lista]) => (
        <section key={g} className="dash-card chf-tareas__seccion">
          <h3 className={`chf-tareas__gtit${g === 'Atrasadas' ? ' chf-tareas__gtit--mal' : ''}`}>{g} <small>{lista.length}</small>
            {sel && <button type="button" className="dash-mini" onClick={() => toggleSel(lista.map(t => t.bid))}>
              {lista.every(t => sel.has(t.bid)) ? 'Quitar el grupo' : 'Seleccionar el grupo'}</button>}
          </h3>
          <ul className="chf-tareas__lista">
            {lista.map(t => (
              <li key={`${g}-${t.bid}`} className={`${HECHAS.has(t.status?.name) ? 'chf-t--hecha' : ''}${sel?.has(t.bid) ? ' chf-t--sel' : ''}`}>
                <div className="chf-t">
                  {sel
                    ? <button type="button" className={`chf-t__check chf-t__check--sel${sel.has(t.bid) ? ' chf-t__check--on' : ''}`} title="Seleccionar" onClick={() => toggleSel([t.bid])}>
                        {sel.has(t.bid) ? '✓' : ''}
                      </button>
                    : <button type="button" className="chf-t__check" title={HECHAS.has(t.status?.name) ? 'Volver a abrir' : 'Marcar como hecha'} onClick={() => marcarHecha(t)}>
                        {HECHAS.has(t.status?.name) ? '✓' : ''}
                      </button>}
                  <button type="button" className="chf-t__main" onClick={() => sel ? toggleSel([t.bid]) : setAbierta(abierta === t.bid ? null : t.bid)}>
                    {t.priority && <span className={`chf-prio chf-prio--${t.priority.toLowerCase()}`}>{t.priority}</span>}
                    <span className="chf-t__titulo">{t.title}</span>
                    {t.category?.name && f.agrupar !== 'area' && <span className="chf-ical__tag">{t.category.name}</span>}
                  </button>
                  <span className="chf-t__meta">
                    {t.owners.length > 0 && f.agrupar !== 'quien' && <span>{t.owners.join(', ')}</span>}
                    {t.start && <b className={t.start.slice(0, 10) < hoy && !HECHAS.has(t.status?.name) ? 'chf-t__tarde' : ''}>{fechaCorta(t.start)}</b>}
                    {t.status?.name && !['Sin empezar', 'Listo'].includes(t.status.name) && <em>{t.status.name}</em>}
                  </span>
                </div>
                {abierta === t.bid && (
                  <FormTarea tarea={t} opciones={data} onCancel={() => setAbierta(null)}
                    onSaved={it => { guardada(it); setAbierta(null) }}
                    onDeleted={() => { guardada(null, t.bid); setAbierta(null) }} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function FormTarea({ tarea, opciones, onCancel, onSaved, onDeleted }) {
  const [v, setV] = useState(() => ({
    title: tarea?.title || '',
    fecha: (tarea?.start || '').slice(0, 10),
    hora: (tarea?.start || '').slice(11, 16),
    category: tarea?.category?.name || 'Tareas',
    priority: tarea?.priority || '',
    status: tarea?.status?.name || 'Sin empezar',
    owners: tarea?.owners || [],
    comment: tarea?.comment || '',
    concept: tarea?.concept || '',
    contact: tarea?.contact || '',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, x) => setV(s => ({ ...s, [k]: x }))
  const estados = ESTADOS.includes(v.status) ? ESTADOS : [...ESTADOS, v.status]
  const guardar = async e => {
    e.preventDefault(); setBusy(true); setErr('')
    const body = {
      title: v.title.trim(), start: v.fecha ? (v.hora ? `${v.fecha}T${v.hora}` : v.fecha) : '', end: tarea?.end || '',
      category: v.category, priority: v.priority, status: v.status, owners: v.owners,
      comment: v.comment, concept: v.concept, contact: v.contact,
    }
    try { onSaved(tarea ? await updateActivity(tarea.bid, body) : await createActivity(body)) }
    catch (x) { setErr(x.message); setBusy(false) }
  }
  const borrar = async () => {
    if (!window.confirm(`¿Borrar «${tarea.title}»? No se puede deshacer.`)) return
    setBusy(true)
    try { await deleteActivity(tarea.bid); onDeleted() } catch (x) { setErr(x.message); setBusy(false) }
  }
  return (
    <form className="chf-tform" onSubmit={guardar}>
      <input className="dash-input" placeholder="¿Qué hay que hacer?" value={v.title} onChange={e => set('title', e.target.value)} autoFocus={!tarea} maxLength={190} />
      <div className="chf-tform__fila">
        <label>Fecha <input type="date" className="dash-input" value={v.fecha} onChange={e => set('fecha', e.target.value)} /></label>
        <label>Hora <input type="time" className="dash-input" value={v.hora} onChange={e => set('hora', e.target.value)} disabled={!v.fecha} /></label>
        <label>Área <select className="dash-input" value={v.category} onChange={e => set('category', e.target.value)}>
          {(opciones?.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select></label>
        <label>Prioridad <select className="dash-input" value={v.priority} onChange={e => set('priority', e.target.value)}>
          <option value="">—</option>{PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
        </select></label>
        <label>Estado <select className="dash-input" value={v.status} onChange={e => set('status', e.target.value)}>
          {estados.map(s => <option key={s} value={s}>{s}</option>)}
        </select></label>
      </div>
      <div className="chf-tform__quien">
        <span>Encargado</span>
        {(opciones?.owners || []).map(o => (
          <button key={o} type="button" className={`dash-mini${v.owners.includes(o) ? ' dash-mini--on' : ''}`}
            onClick={() => set('owners', v.owners.includes(o) ? v.owners.filter(x => x !== o) : [...v.owners, o])}>{o}</button>
        ))}
      </div>
      <textarea className="dash-input" rows={3} placeholder="Notas / comentario" value={v.comment} onChange={e => set('comment', e.target.value)} />
      {(v.concept || v.contact) && (
        <div className="chf-tform__fila">
          <label className="chf-tform__ancho">Concepto <input className="dash-input" value={v.concept} onChange={e => set('concept', e.target.value)} /></label>
          <label className="chf-tform__ancho">Contacto <input className="dash-input" value={v.contact} onChange={e => set('contact', e.target.value)} /></label>
        </div>
      )}
      {tarea && <p className="chf-nota">{tarea.notion ? 'Copiada de Notion' : 'Creada en Blokes'}{tarea.updated_by ? ` · último cambio: ${tarea.updated_by}` : ''}</p>}
      {err && <p className="dash-error">{err}</p>}
      <div className="dash-form__actions">
        <button className="dash-btn dash-btn--primary" disabled={busy || !v.title.trim()}>{tarea ? 'Guardar' : 'Crear tarea'}</button>
        <button type="button" className="dash-btn" onClick={onCancel}>Cancelar</button>
        {tarea && <button type="button" className="dash-btn dash-btn--danger" onClick={borrar} disabled={busy}>Borrar</button>}
      </div>
    </form>
  )
}
