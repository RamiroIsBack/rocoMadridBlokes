import { useState, useEffect, useCallback } from 'react'
import './CompePage.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

async function api(method, path, body) {
  const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1${path}`, {
    method, credentials: 'include',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
  return json
}

const COLOR_HEX = {
  verde: '#22c55e', azul: '#3b82f6', amarillo: '#eab308', rojo: '#ef4444',
  negro: '#1f2937', blanco: '#e5e7eb', naranja: '#f97316', morado: '#8b5cf6', rosa: '#ec4899',
}

// Primera pieza de "la compe en Blokes" (NOTAS_PARA_CODE_compe_en_blokes.md, Ramiro 07/11):
// apuntar top/zona/intentos desde el móvil mientras el modo compe está activo. Validación,
// pantalla de la tele, modo tablet/recepción y resultados finales llegan en las siguientes
// partes — de momento esto es solo "estoy en la compe y apunto lo que he hecho".
export default function CompePage() {
  const sd = window.blokesSiteData || {}
  const [estado, setEstado] = useState(null)
  const [misResultados, setMisResultados] = useState({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [guardando, setGuardando] = useState(null) // compBlockId en curso

  const cargar = useCallback(() => {
    setLoading(true)
    api('GET', '/compe/estado')
      .then(r => {
        setEstado(r.data)
        if (r.data?.activo && sd.isLoggedIn) {
          return api('GET', `/compe/mis-resultados?competitionId=${r.data.competitionId}`)
            .then(rr => setMisResultados(rr.data || {}))
        }
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [sd.isLoggedIn])

  useEffect(() => { cargar() }, [cargar])

  async function guardar(compBlockId, cambios) {
    setGuardando(compBlockId)
    try {
      await api('POST', '/compe/resultado', { compBlockId, ...cambios })
      setMisResultados(prev => ({ ...prev, [compBlockId]: { ...(prev[compBlockId] || {}), ...cambios, estado: 'pendiente' } }))
    } catch (e) {
      setErr(e.message)
    } finally {
      setGuardando(null)
    }
  }

  if (loading) return <div className="compe-page compe-page--loading">Cargando…</div>

  if (err && !estado) return <div className="compe-page"><p className="compe-page__error">{err}</p></div>

  if (!estado?.activo) {
    return (
      <div className="compe-page">
        <h1>Compe</h1>
        <p className="compe-page__muted">No hay ninguna compe activa ahora mismo. Vuelve cuando empiece.</p>
      </div>
    )
  }

  if (!sd.isLoggedIn) {
    return (
      <div className="compe-page">
        <h1>{estado.nombre}</h1>
        <p className="compe-page__muted">Entra con tu cuenta para apuntar tus resultados.</p>
        <a className="compe-page__login" href={sd.loginUrl}>Entrar</a>
      </div>
    )
  }

  return (
    <div className="compe-page">
      <h1>{estado.nombre}</h1>
      <p className="compe-page__muted">
        Marca Top (y Zona si no llegas al Top) y cuántos intentos te ha costado. Queda pendiente
        hasta que un juez lo valide.
      </p>
      {err && <p className="compe-page__error">{err}</p>}
      <div className="compe-page__grid">
        {estado.bloques.map(b => (
          <BloqueFila
            key={b.compBlockId}
            bloque={b}
            resultado={misResultados[b.compBlockId]}
            guardando={guardando === b.compBlockId}
            onGuardar={cambios => guardar(b.compBlockId, cambios)}
          />
        ))}
      </div>
    </div>
  )
}

function BloqueFila({ bloque, resultado, guardando, onGuardar }) {
  const [top, setTop] = useState(!!resultado?.top)
  const [zona, setZona] = useState(!!resultado?.zona)
  const [intentos, setIntentos] = useState(resultado?.intentos ?? 0)

  useEffect(() => {
    setTop(!!resultado?.top); setZona(!!resultado?.zona); setIntentos(resultado?.intentos ?? 0)
  }, [resultado?.top, resultado?.zona, resultado?.intentos])

  const color = COLOR_HEX[(bloque.color || '').toLowerCase()] || '#9ca3af'
  const estadoLabel = resultado?.estado === 'validado' ? 'Validado ✓'
    : resultado?.estado === 'rechazado' ? 'Rechazado'
    : (resultado ? 'Pendiente de validar' : '')

  return (
    <div className="compe-bloque">
      <div className="compe-bloque__numero" style={{ background: color }}>{bloque.numero}</div>
      <div className="compe-bloque__cuerpo">
        <div className="compe-bloque__toggles">
          <label className={`compe-toggle${top ? ' compe-toggle--on' : ''}`}>
            <input type="checkbox" checked={top} onChange={e => { setTop(e.target.checked); if (e.target.checked) setZona(true) }} />
            Top
          </label>
          <label className={`compe-toggle${zona ? ' compe-toggle--on' : ''}`}>
            <input type="checkbox" checked={zona} onChange={e => setZona(e.target.checked)} disabled={top} />
            Zona
          </label>
          <label className="compe-intentos">
            Intentos
            <input type="number" min="0" value={intentos} onChange={e => setIntentos(Math.max(0, Number(e.target.value)))} />
          </label>
        </div>
        <div className="compe-bloque__pie">
          {estadoLabel && <span className={`compe-estado compe-estado--${resultado.estado}`}>{estadoLabel}</span>}
          <button
            className="compe-bloque__guardar"
            disabled={guardando}
            onClick={() => onGuardar({ top, zona, intentos })}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
