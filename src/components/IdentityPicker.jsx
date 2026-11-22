import { useState, useEffect, useMemo } from 'react'
import { normalizeName, consolidateAlumnos } from '../utils/alumnoUtils'
import './IdentityPicker.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// "Sugeridos" antes de escribir (Ramiro, 09/11 06:15): la clase que está en curso AHORA mismo
// — el "día" de un alumno puede ser una pareja ("Lunes-Miércoles") o uno solo, y el "horario"
// viene como "14:00-15:30".
function claseEnCurso(dia, horario) {
  if (!dia || !horario) return false
  const m = horario.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (!m) return false
  const ahora = new Date()
  if (!dia.split('-').includes(DIAS_SEMANA[ahora.getDay()])) return false
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes()
  const inicio = parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  const fin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10)
  return minutosAhora >= inicio && minutosAhora <= fin
}

// ¿Esta tablet tiene ahora mismo una clase de niños en curso? (nota 20/11 07:20 punto 2, fase
// 2, 22/11): no hay ninguna marca fija por cuenta de tablet — se mira la propia clase en curso
// (misma lógica que "sugeridos") y si es de Menores/Adolescentes.
function claseEnCursoEsNinos(sugeridos) {
  return sugeridos.some(a => a.edad && a.edad !== 'Adultos')
}

// "¿Quién eres?" — used from the shared tablet to attribute an action (mark
// a bloke, view "Yo") to a real person instead of whoever has the tablet's
// own session open. Searches the full roster (any horario, not just a
// class) and, when allowCreate is true, can create a new manual alumno —
// the same lightweight placeholder Entrenamientos uses, no WordPress
// account, linkable later once there's an email. "profe" o la tablet de una clase de niños
// crean en cambio una cuenta real para un niño (competitionId, si se pasa, le pone ya la
// categoría infantil en esa compe — ColeccionModoCompe lo pasa cuando hay una activa).
export default function IdentityPicker({ title = '¿Quién eres?', allowCreate = true, competitionId = null, onPick, onClose }) {
  const [alumnos, setAlumnos]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createApellidos, setCreateApellidos] = useState('')
  const [createEsNino, setCreateEsNino] = useState(false)
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
  const sugeridos = useMemo(() => consolidated.filter(a => claseEnCurso(a.dia, a.horario)).slice(0, 20), [consolidated])
  const searchNorm = normalizeName(search)
  const results = searchNorm
    ? consolidated.filter(a => normalizeName(a.cliente || a.nombre).includes(searchNorm)).slice(0, 30)
    : sugeridos

  const role = window.blokesSiteData?.userRole
  // Profe siempre; la tablet solo si la clase que hay ahora es de niños (no hay otra forma de
  // saber "qué tablet es" — es la clase en curso la que lo dice, no la cuenta).
  const puedeCrearReal = role === 'profesor' || (role === 'tablet' && claseEnCursoEsNinos(sugeridos))

  const pick = a => {
    if (a.is_placeholder) onPick({ kind: 'ph', placeholder_id: a.placeholder_id, name: a.cliente })
    else onPick({ kind: 'user', user_id: a.user_id, name: a.cliente })
  }

  const openCreate = () => {
    setCreateName(search)
    setCreateApellidos('')
    setCreateEsNino(puedeCrearReal && claseEnCursoEsNinos(sugeridos))
    setCreateDupes(null)
    setCreateError(null)
    setShowCreate(true)
  }

  const submitCreate = async (force = false) => {
    if (!createName.trim()) { setCreateError('Escribe un nombre'); return }
    setCreating(true); setCreateError(null)
    try {
      const esNino = puedeCrearReal && createEsNino
      const body = esNino
        ? { nombre: createName.trim(), apellidos: createApellidos.trim(), esNino: true, ...(competitionId ? { competitionId } : {}), force }
        : { nombre: [createName.trim(), createApellidos.trim()].filter(Boolean).join(' '), force }
      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos/manual`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.code === 'duplicate_candidates') { setCreateDupes(json.data?.candidates || []); return }
        throw new Error(json.message || 'Error al crear')
      }
      if (esNino) onPick({ kind: 'user', user_id: json.user_id, name: json.name })
      else onPick({ kind: 'ph', placeholder_id: json.placeholder_id, name: body.nombre })
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
            ) : !searchNorm && results.length === 0 ? (
              <p className="idpicker__hint">Empieza a escribir para buscarte.</p>
            ) : searchNorm && results.length === 0 ? (
              <p className="idpicker__hint">Nadie coincide con "{search.trim()}".</p>
            ) : (
              <div className="idpicker__list">
                {!searchNorm && <p className="idpicker__hint">Clase en curso ahora:</p>}
                {results.map((a, i) => (
                  <button
                    key={i}
                    className="idpicker__row"
                    onClick={() => pick(a)}
                  >
                    <span className="idpicker__row-name">{a.cliente}{a.nickname ? ` (${a.nickname})` : ''}</span>
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
              placeholder={puedeCrearReal ? 'Nombre' : 'Tu nombre'}
              className="idpicker__input"
            />
            {puedeCrearReal && (
              <>
                <input
                  type="text"
                  value={createApellidos}
                  onChange={e => { setCreateApellidos(e.target.value); setCreateDupes(null) }}
                  placeholder="Apellidos"
                  className="idpicker__input"
                />
                <label className="idpicker__hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={createEsNino} onChange={e => setCreateEsNino(e.target.checked)} />
                  Es un niño
                </label>
              </>
            )}
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
