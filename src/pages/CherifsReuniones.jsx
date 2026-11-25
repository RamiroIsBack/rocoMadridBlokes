// Cherifs › Tareas › Reuniones (25/11/2026): orden del día de las reuniones de socios.
// Cada reunión tiene puntos: tareas que ya existen o temas escritos a mano. En la reunión
// cada punto se marca como tratado y se le apunta la nota o el acuerdo; de un tema puede
// salir una tarea nueva. Al cerrar, lo no tratado pasa a la siguiente reunión.
// Las reuniones salen en el calendario del Dashboard.
import { useState } from 'react'
import { createMeeting, saveMeeting, deleteMeeting } from '../hooks/useCherifs'
import { createActivity } from '../hooks/useCalendar'

const HECHAS = new Set(['Listo', 'Archivo'])
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fechaLarga = s => { const [y, m, d] = s.split('-').map(Number); return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} ${MESES[m - 1]}` }
const nuevoId = () => Math.random().toString(36).slice(2, 12)
const masDias = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)) }

// Añade tareas (bids) como puntos a una reunión, sin repetir. Lo usa también la selección múltiple.
export function conTareas(m, bids) {
  const ya = new Set(m.points.filter(p => p.task).map(p => p.task))
  return { ...m, points: [...m.points, ...bids.filter(b => !ya.has(b)).map(b => ({ id: nuevoId(), task: b, text: '', done: false, note: '' }))] }
}

export default function CherifsReuniones({ meetings, setMeetings, tareas, owners, onTareaCreada }) {
  const hoy = iso(new Date())
  const [nueva, setNueva] = useState(false)
  const [verAnteriores, setVerAnteriores] = useState(false)
  const [err, setErr] = useState('')
  const lista = meetings || []
  const abiertas = lista.filter(m => !m.closed).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const cerradas = lista.filter(m => m.closed)
  const porBid = Object.fromEntries((tareas || []).map(t => [t.bid, t]))

  const poner = m => setMeetings(ms => {
    const resto = (ms || []).filter(x => x.id !== m.id)
    return [...resto, m].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
  })
  // Guarda la reunión entera; se pinta ya y se corrige con lo que devuelva el servidor
  const guardar = async m => {
    poner(m); setErr('')
    try { poner(await saveMeeting(m.id, m)) } catch (e) { setErr(e.message) }
  }
  const crear = async datos => {
    setErr('')
    try { const m = await createMeeting({ ...datos, points: datos.points || [] }); poner(m); setNueva(false); return m } catch (e) { setErr(e.message) }
  }
  const borrar = async m => {
    if (!window.confirm(`¿Borrar la reunión del ${fechaLarga(m.date)} con sus ${m.points.length} puntos? No se puede deshacer.`)) return
    try { await deleteMeeting(m.id); setMeetings(ms => ms.filter(x => x.id !== m.id)) } catch (e) { setErr(e.message) }
  }
  // Cerrar: lo no tratado se copia a la siguiente reunión abierta (o a una nueva, una semana después)
  const cerrar = async m => {
    const pendientes = m.points.filter(p => !p.done)
    if (pendientes.length) {
      if (!window.confirm(`Quedan ${pendientes.length} puntos sin tratar. Se pasan a la siguiente reunión. ¿Cerramos esta?`)) return
      const copia = pendientes.map(p => ({ ...p, id: nuevoId(), done: false }))
      const siguiente = abiertas.find(x => x.id !== m.id && (x.date + x.time) > (m.date + m.time))
      if (siguiente) await guardar({ ...siguiente, points: [...copia, ...siguiente.points] })
      else await crear({ date: masDias(m.date, 7), time: m.time, title: m.title, points: copia })
    }
    await guardar({ ...m, closed: true })
  }

  return (
    <div className="chf-reus">
      <div className="chf-reus__cab">
        <p className="chf-nota">El orden del día de las reuniones de socios. Salen en el calendario del Dashboard.</p>
        <button type="button" className="dash-btn dash-btn--primary" onClick={() => setNueva(n => !n)}>+ Nueva reunión</button>
      </div>
      {err && <p className="dash-error">{err}</p>}
      {nueva && <FormReunion inicial={{ date: abiertas.length ? masDias(abiertas[abiertas.length - 1].date, 7) : hoy, time: abiertas[abiertas.length - 1]?.time || '', title: '' }} onOk={crear} onCancel={() => setNueva(false)} />}
      {!meetings && <p className="dash-empty">Cargando…</p>}
      {meetings && abiertas.length === 0 && !nueva && <p className="dash-empty">No hay ninguna reunión preparada. Crea una con «+ Nueva reunión».</p>}
      {abiertas.map((m, i) => (
        <Reunion key={m.id} m={m} primera={i === 0} hoy={hoy} porBid={porBid} tareas={tareas} owners={owners}
          onSave={guardar} onClose={() => cerrar(m)} onDelete={() => borrar(m)} onTareaCreada={onTareaCreada} />
      ))}
      {cerradas.length > 0 && (
        <button type="button" className="dash-link" onClick={() => setVerAnteriores(v => !v)}>
          {verAnteriores ? 'Ocultar las anteriores' : `Ver las anteriores (${cerradas.length})`}
        </button>
      )}
      {verAnteriores && cerradas.map(m => (
        <Reunion key={m.id} m={m} hoy={hoy} porBid={porBid} tareas={tareas} owners={owners} cerrada
          onSave={guardar} onReopen={() => guardar({ ...m, closed: false })} onDelete={() => borrar(m)} onTareaCreada={onTareaCreada} />
      ))}
    </div>
  )
}

function FormReunion({ inicial, onOk, onCancel }) {
  const [v, setV] = useState(inicial)
  return (
    <form className="dash-card chf-tform chf-reus__form" onSubmit={e => { e.preventDefault(); onOk(v) }}>
      <div className="chf-tform__fila">
        <label>Día <input type="date" className="dash-input" value={v.date} onChange={e => setV({ ...v, date: e.target.value })} required /></label>
        <label>Hora <input type="time" className="dash-input" value={v.time} onChange={e => setV({ ...v, time: e.target.value })} /></label>
        <label className="chf-tform__ancho">Título <input className="dash-input" placeholder="Reunión de socios" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} maxLength={120} /></label>
      </div>
      <div className="dash-form__actions">
        <button className="dash-btn dash-btn--primary" disabled={!v.date}>Guardar</button>
        <button type="button" className="dash-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

function Reunion({ m, primera, hoy, porBid, tareas, owners, cerrada, onSave, onClose, onReopen, onDelete, onTareaCreada }) {
  const [abierta, setAbierta] = useState(!cerrada && (primera || m.date <= hoy))
  const [editar, setEditar] = useState(false)
  const [tema, setTema] = useState('')
  const enLaReu = new Set(m.points.filter(p => p.task).map(p => p.task))
  const candidatas = (tareas || []).filter(t => !HECHAS.has(t.status?.name) && !enLaReu.has(t.bid))
    .sort((a, b) => a.title.localeCompare(b.title, 'es'))
  const tratados = m.points.filter(p => p.done).length
  const cambiaPunto = (id, cambios) => onSave({ ...m, points: m.points.map(p => (p.id === id ? { ...p, ...cambios } : p)) })
  const mover = (i, d) => {
    const ps = [...m.points]; const j = i + d
    if (j < 0 || j >= ps.length) return
    ;[ps[i], ps[j]] = [ps[j], ps[i]]
    onSave({ ...m, points: ps })
  }
  const añadirTema = e => {
    e.preventDefault()
    if (!tema.trim()) return
    onSave({ ...m, points: [...m.points, { id: nuevoId(), task: 0, text: tema.trim(), done: false, note: '' }] })
    setTema('')
  }

  return (
    <section className={`dash-card chf-reu${cerrada ? ' chf-reu--cerrada' : ''}`}>
      <div className="chf-reu__cab">
        <button type="button" className="chf-reu__tit" onClick={() => setAbierta(a => !a)}>
          <span className="chf-reu__fecha">{m.date === hoy ? 'Hoy' : fechaLarga(m.date)}{m.time && ` · ${m.time}`}</span>
          <b>{m.title}</b>
          <small>{m.points.length ? `${tratados}/${m.points.length} tratados` : 'sin puntos'}{cerrada ? ' · cerrada' : ''}</small>
        </button>
        <span className="chf-reu__acc">
          {abierta && !cerrada && <button type="button" className="dash-mini" onClick={() => setEditar(x => !x)}>✎</button>}
          {abierta && !cerrada && <button type="button" className="dash-mini" onClick={onClose}>Cerrar reunión</button>}
          {abierta && cerrada && <button type="button" className="dash-mini" onClick={onReopen}>Reabrir</button>}
          {abierta && <button type="button" className="dash-mini dash-mini--danger" onClick={onDelete}>Borrar</button>}
          <button type="button" className="dash-mini" onClick={() => setAbierta(a => !a)}>{abierta ? '▴' : '▾'}</button>
        </span>
      </div>
      {editar && <FormReunion inicial={{ date: m.date, time: m.time, title: m.title }} onOk={v => { onSave({ ...m, ...v }); setEditar(false) }} onCancel={() => setEditar(false)} />}
      {abierta && (
        <>
          <ol className="chf-reu__puntos">
            {m.points.map((p, i) => (
              <Punto key={p.id} p={p} t={p.task ? porBid[p.task] : null} owners={owners} cerrada={cerrada}
                onChange={c => cambiaPunto(p.id, c)} onUp={() => mover(i, -1)} onDown={() => mover(i, 1)}
                onRemove={() => onSave({ ...m, points: m.points.filter(x => x.id !== p.id) })}
                onTareaCreada={onTareaCreada} fecha={m.date} />
            ))}
          </ol>
          {m.points.length === 0 && <p className="dash-empty">Sin puntos todavía. Añade un tema o una tarea.</p>}
          {!cerrada && (
            <div className="chf-reu__add">
              <form onSubmit={añadirTema} className="chf-reu__addfila">
                <input className="dash-input" placeholder="Añadir un tema…" value={tema} onChange={e => setTema(e.target.value)} maxLength={300} />
                <button className="dash-btn" disabled={!tema.trim()}>Añadir</button>
              </form>
              <select className="dash-input" value="" onChange={e => e.target.value && onSave(conTareas(m, [Number(e.target.value)]))}>
                <option value="">…o añadir una tarea abierta ({candidatas.length})</option>
                {candidatas.map(t => <option key={t.bid} value={t.bid}>{t.title}{t.owners.length ? ` — ${t.owners.join(', ')}` : ''}</option>)}
              </select>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Punto({ p, t, owners, cerrada, fecha, onChange, onUp, onDown, onRemove, onTareaCreada }) {
  const [nota, setNota] = useState(p.note)
  const [verNota, setVerNota] = useState(!!p.note)
  const [aTarea, setATarea] = useState(false)
  const titulo = t ? t.title : p.text || '(tarea borrada)'
  return (
    <li className={`chf-punto${p.done ? ' chf-punto--hecho' : ''}`}>
      <div className="chf-punto__fila">
        <button type="button" className="chf-t__check" title={p.done ? 'Sin tratar' : 'Tratado'} disabled={cerrada} onClick={() => onChange({ done: !p.done })}>{p.done ? '✓' : ''}</button>
        <span className="chf-punto__txt">
          {t && <span className="chf-ical__tag">Tarea</span>} {titulo}
          {t && <small className="chf-punto__meta">{[t.owners.join(', '), t.status?.name, t.start && t.start.slice(0, 10)].filter(Boolean).join(' · ')}</small>}
        </span>
        <span className="chf-punto__acc">
          <button type="button" className={`dash-mini${verNota ? ' dash-mini--on' : ''}`} onClick={() => setVerNota(v => !v)} title="Nota o acuerdo">📝</button>
          {!cerrada && !t && <button type="button" className="dash-mini" onClick={() => setATarea(a => !a)} title="Convertir en tarea">→ Tarea</button>}
          {!cerrada && <button type="button" className="dash-mini" onClick={onUp} title="Subir">↑</button>}
          {!cerrada && <button type="button" className="dash-mini" onClick={onDown} title="Bajar">↓</button>}
          {!cerrada && <button type="button" className="dash-mini dash-mini--danger" onClick={onRemove} title="Quitar del orden del día">×</button>}
        </span>
      </div>
      {verNota && (
        <textarea className="dash-input chf-punto__nota" rows={2} placeholder="Nota o acuerdo…" value={nota} disabled={cerrada}
          onChange={e => setNota(e.target.value)} onBlur={() => nota !== p.note && onChange({ note: nota })} />
      )}
      {aTarea && <ATarea texto={p.text} owners={owners} fecha={fecha} onCancel={() => setATarea(false)}
        onOk={async body => { const it = await createActivity(body); onTareaCreada(it); onChange({ task: it.bid }); setATarea(false) }} />}
    </li>
  )
}

// De un tema de la reunión sale una tarea nueva (con encargado y fecha)
function ATarea({ texto, owners, fecha, onOk, onCancel }) {
  const [v, setV] = useState({ title: texto, owners: [], start: '', priority: '' })
  const [err, setErr] = useState('')
  return (
    <form className="chf-tform chf-punto__tarea" onSubmit={async e => {
      e.preventDefault(); setErr('')
      try { await onOk({ title: v.title.trim(), start: v.start, end: '', category: 'Tareas', status: 'Sin empezar', priority: v.priority, owners: v.owners, comment: `Sale de la reunión del ${fecha}` }) }
      catch (x) { setErr(x.message) }
    }}>
      <input className="dash-input" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} maxLength={190} />
      <div className="chf-tform__fila">
        <label>Para el <input type="date" className="dash-input" value={v.start} onChange={e => setV({ ...v, start: e.target.value })} /></label>
        <label>Prioridad <select className="dash-input" value={v.priority} onChange={e => setV({ ...v, priority: e.target.value })}>
          <option value="">—</option><option>Alta</option><option>Media</option><option>Baja</option>
        </select></label>
      </div>
      <div className="chf-tform__quien">
        <span>Encargado</span>
        {(owners || []).map(o => (
          <button key={o} type="button" className={`dash-mini${v.owners.includes(o) ? ' dash-mini--on' : ''}`}
            onClick={() => setV({ ...v, owners: v.owners.includes(o) ? v.owners.filter(x => x !== o) : [...v.owners, o] })}>{o}</button>
        ))}
      </div>
      {err && <p className="dash-error">{err}</p>}
      <div className="dash-form__actions">
        <button className="dash-btn dash-btn--primary" disabled={!v.title.trim()}>Crear tarea</button>
        <button type="button" className="dash-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}
