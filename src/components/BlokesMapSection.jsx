import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BLOKES_MAP, DECISIONS, WHO, MAP_LINKS } from '../utils/blokesMap'
import './BlokesMapSection.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1`

async function request(path, method = 'GET', body) {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`)
    err.status = res.status
    err.code = json.code
    throw err
  }
  return json
}

const fmtWhen = s => {
  if (!s) return ''
  const d = new Date(s.replace(' ', 'T'))
  return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// Todos los ids del árbol (para contar lo decidido)
const allIds = nodes => nodes.flatMap(n => [n.id, ...(n.children ? allIds(n.children) : [])])

// ─── Un elemento del mapa ───────────────────────────────────────────────────
function MapNode({ node, depth, ctx }) {
  const { items, extras, readOnly, filter, onDecision, onNote, onAddIdea, onDeleteIdea } = ctx
  const it        = items[node.id] || {}
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote]         = useState(it.note || '')
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [idea, setIdea]         = useState('')
  const [open, setOpen]         = useState(false)   // siempre empieza plegado
  useEffect(() => { setNote(it.note || '') }, [it.note])

  const kids     = [...(node.children || []), ...extras.filter(x => x.parent === node.id).map(x => ({ ...x, extra: true }))]
  const visible  = n => {
    if (filter === 'all') return true
    const d = items[n.id]?.decision || ''
    if (filter === 'none' ? !d : d === filter) return true
    const sub = [...(n.children || []), ...extras.filter(x => x.parent === n.id)]
    return sub.some(visible)
  }
  if (!visible(node)) return null

  const saveNote = () => { if (note !== (it.note || '')) onNote(node.id, note) }
  const decided  = DECISIONS.find(d => d.id === it.decision)

  const hasKids = (node.children?.length || 0) + extras.filter(x => x.parent === node.id).length > 0
  const row = (
    <div className={`bm-row${decided ? ` bm-row--${decided.id}` : ''}`}>
      {hasKids
        ? <button type="button" className="bm-toggle" aria-expanded={open || filter !== 'all'} onClick={() => setOpen(o => !o)}>{open || filter !== 'all' ? '▾' : '▸'}</button>
        : <span className="bm-toggle bm-toggle--leaf" />}
      <div className="bm-row__main">
        <div className="bm-row__title">
          {node.extra && <span className="bm-tag bm-tag--idea">Idea</span>}
          {MAP_LINKS[node.id]
            ? <Link to={MAP_LINKS[node.id]} className="bm-row__link" title="Ir a esta pantalla">{node.title} <span className="bm-row__go" aria-hidden="true">↗</span></Link>
            : <span>{node.title}</span>}
          {node.who && <span className="bm-tag">{WHO[node.who]}</span>}
        </div>
        {node.desc && <p className="bm-row__desc">{node.desc}</p>}
        {it.note && !noteOpen && <p className="bm-row__note" onClick={() => !readOnly && setNoteOpen(true)}>📝 {it.note}</p>}
        {noteOpen && (
          <textarea
            className="bm-row__textarea" rows={2} autoFocus value={note} placeholder="Qué cambiarías, qué falta, por qué sobra…"
            onChange={e => setNote(e.target.value)} onBlur={() => { saveNote(); setNoteOpen(false) }}
          />
        )}
        {it.by && <span className="bm-row__who">{it.by} · {fmtWhen(it.at)}</span>}
      </div>
      <div className="bm-row__actions">
        {DECISIONS.map(d => (
          <button
            key={d.id} type="button" title={d.label} disabled={readOnly}
            className={`bm-dec${it.decision === d.id ? ' bm-dec--on' : ''}`}
            onClick={() => onDecision(node.id, it.decision === d.id ? '' : d.id)}
          >{d.icon}</button>
        ))}
        <button type="button" className="bm-mini" disabled={readOnly} onClick={() => setNoteOpen(true)}>Nota</button>
        {node.extra && <button type="button" className="bm-mini bm-mini--danger" disabled={readOnly} onClick={() => onDeleteIdea(node)}>Borrar</button>}
      </div>
    </div>
  )

  const addIdea = (
    !readOnly && !node.extra && (ideaOpen ? (
      <form className="bm-idea" onSubmit={e => { e.preventDefault(); if (idea.trim()) { onAddIdea(node.id, idea.trim()); setIdea(''); setIdeaOpen(false) } }}>
        <input className="bm-idea__input" autoFocus value={idea} placeholder={`Nueva idea dentro de «${node.title}»`} onChange={e => setIdea(e.target.value)} maxLength={120} />
        <button className="bm-mini bm-mini--ok">Añadir</button>
        <button type="button" className="bm-mini" onClick={() => setIdeaOpen(false)}>Cancelar</button>
      </form>
    ) : <button type="button" className="bm-add" onClick={() => setIdeaOpen(true)}>+ Idea aquí</button>)
  )

  if (!kids.length) {
    return <li className="bm-leaf">{row}{node.extra ? null : <div className="bm-add-wrap bm-add-wrap--leaf">{addIdea}</div>}</li>
  }
  return (
    <li className={`bm-branch bm-branch--d${Math.min(depth, 2)}`}>
      {row}
      {(open || filter !== 'all') && (
        <ul className="bm-list">
          {kids.map(k => <MapNode key={k.id} node={k} depth={depth + 1} ctx={ctx} />)}
          <li className="bm-add-wrap">{addIdea}</li>
        </ul>
      )}
    </li>
  )
}

// ─── Pestaña ────────────────────────────────────────────────────────────────
export default function BlokesMapSection() {
  const [data, setData]       = useState(null)   // { items, extras }
  const [readOnly, setReadOnly] = useState(false)
  const [error, setError]     = useState('')
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    request('/blokes-map')
      .then(json => setData({ items: json.items || {}, extras: json.extras || [] }))
      .catch(e => {
        setData({ items: {}, extras: [] })
        setReadOnly(true)
        setError(e.code === 'rest_no_route'
          ? 'El servidor todavía no tiene el Mapa: puedes verlo, pero para apuntar decisiones y notas hay que subir el cambio del servidor a producción.'
          : `No se pudo cargar lo guardado: ${e.message}`)
      })
  }, [])

  const ids    = useMemo(() => [...allIds(BLOKES_MAP), ...(data?.extras || []).map(x => x.id)], [data])
  const counts = useMemo(() => {
    const c = { none: 0 }
    DECISIONS.forEach(d => { c[d.id] = 0 })
    ids.forEach(id => { const d = data?.items[id]?.decision; d ? c[d]++ : c.none++ })
    return c
  }, [ids, data])

  if (!data) return <div className="sa-loading">Cargando…</div>

  const fail = e => setError(`No se ha guardado: ${e.message}`)
  const ctx = {
    items: data.items, extras: data.extras, readOnly, filter,
    onDecision: (id, decision) => {
      setData(d => ({ ...d, items: { ...d.items, [id]: { ...d.items[id], decision } } }))
      request('/blokes-map/item', 'PUT', { id, decision })
        .then(json => setData(d => ({ ...d, items: { ...d.items, [id]: json.item } }))).catch(fail)
    },
    onNote: (id, note) => {
      setData(d => ({ ...d, items: { ...d.items, [id]: { ...d.items[id], note } } }))
      request('/blokes-map/item', 'PUT', { id, note })
        .then(json => setData(d => ({ ...d, items: { ...d.items, [id]: json.item } }))).catch(fail)
    },
    onAddIdea: (parent, title) => {
      request('/blokes-map/extra', 'POST', { parent, title })
        .then(json => setData(d => ({ ...d, extras: json.extras, items: json.items }))).catch(fail)
    },
    onDeleteIdea: node => {
      if (!window.confirm(`¿Borrar la idea «${node.title}»?`)) return
      request(`/blokes-map/extra/${node.id}`, 'DELETE')
        .then(json => setData(d => ({ ...d, extras: json.extras }))).catch(fail)
    },
  }

  const FILTERS = [
    { id: 'all', label: `Todo (${ids.length})` },
    { id: 'none', label: `Sin decidir (${counts.none})` },
    ...DECISIONS.map(d => ({ id: d.id, label: `${d.icon} ${d.label} (${counts[d.id]})` })),
  ]

  return (
    <div className="bm">
      <div className="bm-head">
        <h2 className="bm-head__title">Mapa de Blokes</h2>
        <p className="bm-head__hint">
          Todo lo que hay en la app. Marca cada cosa — ✅ se queda, 🛠 mejorar, 💡 idea nueva, 🗑 sobra — y apunta una nota.
          Pulsa ▸ para desplegar y el nombre para ir a esa pantalla. Lo que marquéis Ramiro y tú se guarda para los dos.
        </p>
        <div className="bm-filters">
          {FILTERS.map(f => (
            <button key={f.id} type="button" className={`bm-filter${filter === f.id ? ' bm-filter--on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        {error && <p className="bm-error">{error}</p>}
      </div>
      <ul className="bm-list bm-list--root">
        {BLOKES_MAP.map(n => <MapNode key={n.id} node={n} depth={0} ctx={ctx} />)}
      </ul>
    </div>
  )
}
