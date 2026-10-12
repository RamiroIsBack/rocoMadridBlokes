import { useState, useEffect, useMemo } from 'react'
import { normalizeName, consolidateAlumnos } from '../utils/alumnoUtils'
import './IdentityPicker.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

// "¿Quién eres?" — used from the shared tablet to attribute an action (mark
// a bloke, view "Yo") to a real person instead of whoever has the tablet's
// own session open. Searches the full roster (any horario, not just a
// class) and, when allowCreate is true, can create a new manual alumno —
// the same lightweight placeholder Entrenamientos uses, no WordPress
// account, linkable later once there's an email.
export default function IdentityPicker({ title = '¿Quién eres?', allowCreate = true, onPick, onClose }) {
  const [alumnos, setAlumnos]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDupes, setCreateDupes] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  useEffect(() => {
    fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos?status=all`, { credentials: 'include', headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.alumnos) setAlumnos(json.data.alumnos) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const consolidated = useMemo(() => consolidateAlumnos(alumnos), [alumnos])
  const searchNorm = normalizeName(search)
  const results = searchNorm
    ? consolidated.filter(a => normalizeName(a.cliente || a.nombre).includes(searchNorm)).slice(0, 30)
    : []

  const pick = a => {
    if (a.is_placeholder) onPick({ kind: 'ph', placeholder_id: a.placeholder_id, name: a.cliente })
    else onPick({ kind: 'user', user_id: a.user_id, name: a.cliente })
  }

  const openCreate = () => {
    setCreateName(search)
    setCreateDupes(null)
    setCreateError(null)
    setShowCreate(true)
  }

  const submitCreate = async (force = false) => {
    if (!createName.trim()) { setCreateError('Escribe un nombre'); return }
    setCreating(true); setCreateError(null)
    try {
      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos/manual`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: createName.trim(), force }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.code === 'duplicate_candidates') { setCreateDupes(json.data?.candidates || []); return }
        throw new Error(json.message || 'Error al crear')
      }
      onPick({ kind: 'ph', placeholder_id: json.placeholder_id, name: createName.trim() })
    } catch (e) {
      setCreateError(e.message || 'Error al crear')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="idpicker-overlay" onClick={onClose}>
      <div className="idpicker" onClick={e => e.stopPropagation()}>
        <div className="idpicker__head">
          <h2>{showCreate ? 'Alumno nuevo' : title}</h2>
          <button className="idpicker__close" onClick={onClose}>✕</button>
        </div>

        {!showCreate ? (
          <>
            <input
              type="text"
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Escribe tu nombre..."
              className="idpicker__input"
            />
            {loading ? (
              <p className="idpicker__hint">Cargando...</p>
            ) : !searchNorm ? (
              <p className="idpicker__hint">Empieza a escribir para buscarte.</p>
            ) : results.length === 0 ? (
              <p className="idpicker__hint">Nadie coincide con "{search.trim()}".</p>
            ) : (
              <div className="idpicker__list">
                {results.map((a, i) => (
                  <button
                    key={i}
                    className="idpicker__row"
                    onClick={() => pick(a)}
                  >
                    <span className="idpicker__row-name">{a.cliente}</span>
                    <span className="idpicker__row-meta">{a.dia || 'Sin día'} · {a.horario || 'Sin horario'}</span>
                  </button>
                ))}
              </div>
            )}
            {allowCreate && (
              <button className="idpicker__create-link" onClick={openCreate}>
                No estoy en la lista — soy nuevo
              </button>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              autoFocus
              value={createName}
              onChange={e => { setCreateName(e.target.value); setCreateDupes(null) }}
              placeholder="Tu nombre"
              className="idpicker__input"
            />
            {createDupes && createDupes.length > 0 && (
              <div className="idpicker__dupes">
                <p className="idpicker__hint">Ya hay alguien con un nombre parecido. ¿Eres tú?</p>
                {createDupes.map((c, i) => (
                  <button
                    key={i}
                    className="idpicker__row"
                    onClick={() => { setShowCreate(false); setSearch(c.nombre) }}
                  >
                    <span className="idpicker__row-name">{c.nombre}</span>
                    <span className="idpicker__row-meta">{c.dia || 'Sin día'} · {c.horario || 'Sin horario'}</span>
                  </button>
                ))}
              </div>
            )}
            {createError && <p className="idpicker__error">{createError}</p>}
            <div className="idpicker__actions">
              <button className="idpicker__btn idpicker__btn--ghost" onClick={() => setShowCreate(false)} disabled={creating}>Volver</button>
              <button className="idpicker__btn" onClick={() => submitCreate(!!createDupes)} disabled={creating}>
                {creating ? 'Creando...' : createDupes ? 'No soy ninguno, soy nuevo' : 'Soy nuevo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
