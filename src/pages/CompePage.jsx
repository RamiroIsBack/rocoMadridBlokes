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

// "La compe en Blokes" (NOTAS_PARA_CODE_compe_en_blokes.md). Parte 1: apuntar top/zona/intentos.
// Parte 2 (Ramiro, 07/11 09:11): validación de buena fe (cualquier compañero o profe que lo haya
// visto, sin cola de jueces fija) y la ventana de 1h30 desde el primer top. Pendiente: pantalla
// de la tele, modo tablet/recepción/participante rápido, resultados finales y liga de temporada.
export default function CompePage() {
  const sd = window.blokesSiteData || {}
  const [estado, setEstado] = useState(null)
  const [misResultados, setMisResultados] = useState({})
  const [ventana, setVentana] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [tab, setTab] = useState('apuntar')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [guardando, setGuardando] = useState(null) // compBlockId o resultadoId en curso

  const cargar = useCallback(() => {
    setLoading(true)
    api('GET', '/compe/estado')
      .then(r => {
        setEstado(r.data)
        if (r.data?.activo && sd.isLoggedIn) {
          return Promise.all([
            api('GET', `/compe/mis-resultados?competitionId=${r.data.competitionId}`)
              .then(rr => { setMisResultados(rr.data || {}); setVentana(rr.ventana || null) }),
            api('GET', `/compe/pendientes-validar?competitionId=${r.data.competitionId}`)
              .then(rr => setPendientes(rr.data || [])),
          ])
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

  async function validar(resultadoId, accion) {
    setGuardando(resultadoId)
    try {
      await api('POST', '/compe/validar', { resultadoId, accion })
      setPendientes(prev => prev.filter(p => p.resultadoId !== resultadoId))
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
        Para que cuente, un compañero o profe que te haya visto tiene que validártelo.
      </p>
      {ventana && (
        <p className={`compe-ventana${ventana.cerrada ? ' compe-ventana--cerrada' : ''}`}>
          {ventana.cerrada
            ? 'Tu ventana de 1h30 para esta compe ya se cerró — lo que apuntes de más cuenta para ligas, no para la compe.'
            : `Te quedan ${ventana.minutosRestantes} min de tu ventana de 1h30.`}
        </p>
      )}
      {err && <p className="compe-page__error">{err}</p>}

      <div className="compe-tabs">
        <button className={`compe-tab${tab === 'apuntar' ? ' compe-tab--activo' : ''}`} onClick={() => setTab('apuntar')}>Apuntar</button>
        <button className={`compe-tab${tab === 'validar' ? ' compe-tab--activo' : ''}`} onClick={() => setTab('validar')}>
          Validar{pendientes.length > 0 ? ` (${pendientes.length})` : ''}
        </button>
      </div>

      {tab === 'apuntar' ? (
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
      ) : (
        <div className="compe-page__grid">
          {pendientes.length === 0 && <p className="compe-page__muted">Nada pendiente de validar ahora mismo.</p>}
          {pendientes.map(p => (
            <PendienteFila key={p.resultadoId} p={p} guardando={guardando === p.resultadoId} onValidar={accion => validar(p.resultadoId, accion)} />
          ))}
        </div>
      )}
    </div>
  )
}

function BloqueFila({ bloque, resultado, guardando, onGuardar }) {
  const [top, setTop] = useState(!!resultado?.top)
  const [zona, setZona] = useState(!!resultado?.zona)
  const [intentos, setIntentos] = useState(resultado?.intentos ?? 0)
  const [verIntentos, setVerIntentos] = useState(false)

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
          {/* Los intentos no cuentan para nada (Ramiro, 07/11 09:11) — opcional y escondido */}
          {verIntentos ? (
            <label className="compe-intentos">
              Intentos
              <input type="number" min="0" value={intentos} onChange={e => setIntentos(Math.max(0, Number(e.target.value)))} />
            </label>
          ) : (
            <button type="button" className="compe-intentos-link" onClick={() => setVerIntentos(true)}>+ intentos</button>
          )}
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

function PendienteFila({ p, guardando, onValidar }) {
  const color = COLOR_HEX[(p.color || '').toLowerCase()] || '#9ca3af'
  return (
    <div className="compe-bloque">
      <div className="compe-bloque__numero" style={{ background: color }}>{p.numero}</div>
      <div className="compe-bloque__cuerpo">
        <p className="compe-pendiente__texto">
          <strong>{p.participante || 'Alguien'}</strong> dice {p.top ? 'Top' : 'Zona'}
          {p.intentos ? ` · ${p.intentos} intentos` : ''} · hace {p.hace}
        </p>
        <div className="compe-bloque__pie">
          <button className="compe-bloque__guardar compe-bloque__guardar--rechazar" disabled={guardando} onClick={() => onValidar('rechazar')}>No lo vi así</button>
          <button className="compe-bloque__guardar" disabled={guardando} onClick={() => onValidar('validar')}>{guardando ? '…' : 'Confirmo, lo vi'}</button>
        </div>
      </div>
    </div>
  )
}
