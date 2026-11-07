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

const PUEDE_RECEPCION = ['profesor', 'gestion', 'socio', 'tablet']

// "La compe en Blokes" (NOTAS_PARA_CODE_compe_en_blokes.md). Parte 1: apuntar top/zona/intentos.
// Parte 4 (Ramiro, 07/11 08:46/08:48): recepción apuntando por otra persona (profe/Eva/socio) +
// participante rápido sin cuenta. Sin validación en la app (Ramiro, 07/11 más tarde): todo lo
// apuntado cuenta al momento, lo valida la palabra de los compañeros, no la app — en la tablet
// (rol "tablet", incluido en PUEDE_RECEPCION) cada uno busca su propio nombre en "Recepción" y
// apunta, sin PIN.
export default function CompePage() {
  const sd = window.blokesSiteData || {}
  const puedeRecepcion = PUEDE_RECEPCION.includes(sd.userRole)
  const [estado, setEstado] = useState(null)
  const [misResultados, setMisResultados] = useState({})
  const [ventana, setVentana] = useState(null)
  const [tab, setTab] = useState('apuntar')
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
            .then(rr => { setMisResultados(rr.data || {}); setVentana(rr.ventana || null) })
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
      setMisResultados(prev => ({ ...prev, [compBlockId]: { ...(prev[compBlockId] || {}), ...cambios, estado: 'validado' } }))
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
        Norma de honor: lo que apuntes cuenta al momento — que un compañero o profe te haya visto hacerlo.
      </p>
      {ventana && (
        <p className={`compe-ventana${ventana.cerrada ? ' compe-ventana--cerrada' : ''}`}>
          {ventana.cerrada
            ? 'Tu ventana de 1h30 para esta compe ya se cerró — lo que apuntes de más cuenta para ligas, no para la compe.'
            : `Te quedan ${ventana.minutosRestantes} min de tu ventana de 1h30.`}
        </p>
      )}
      {err && <p className="compe-page__error">{err}</p>}

      {puedeRecepcion && (
        <div className="compe-tabs">
          <button className={`compe-tab${tab === 'apuntar' ? ' compe-tab--activo' : ''}`} onClick={() => setTab('apuntar')}>Apuntar</button>
          <button className={`compe-tab${tab === 'recepcion' ? ' compe-tab--activo' : ''}`} onClick={() => setTab('recepcion')}>Recepción</button>
        </div>
      )}

      {tab === 'apuntar' && (
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
      )}
      {tab === 'recepcion' && puedeRecepcion && (
        <RecepcionTab bloques={estado.bloques} competitionId={estado.competitionId} />
      )}
    </div>
  )
}

// Recepción (Ramiro, 07/11 08:46: "Eva o cualquier profe con la app en modo tablet/ordenador en
// recepción puede apuntar los bloques por otra persona") — busca a quien lo ha hecho (cuenta
// real o un participante rápido ya creado), o lo crea sin cuenta si viene con pase de día, y
// apunta por él/ella. En la tablet del Roco (rol "tablet") es también donde cada participante
// busca su propio nombre y se apunta a sí mismo, sin PIN (Ramiro, 07/11: sin validación en la
// app, cuenta al momento).
function RecepcionTab({ bloques, competitionId }) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null) // { tipo, id, nombreMostrar }
  const [misResultados, setMisResultados] = useState({})
  const [guardando, setGuardando] = useState(null)
  const [err, setErr] = useState(null)
  const [crearNombre, setCrearNombre] = useState('')
  const [crearTelefono, setCrearTelefono] = useState('')
  const [crearEmail, setCrearEmail] = useState('')
  const [creando, setCreando] = useState(false)
  const [mostrarCrear, setMostrarCrear] = useState(false)

  async function buscar() {
    if (q.trim().length < 2) { setErr('Escribe al menos 2 caracteres.'); return }
    setBuscando(true); setErr(null)
    try {
      const r = await api('GET', `/compe/buscar-participante?q=${encodeURIComponent(q.trim())}&competitionId=${competitionId}`)
      setResultados(r.data || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setBuscando(false)
    }
  }

  async function elegir(p) {
    setSeleccionado(p)
    setErr(null)
    try {
      const param = p.tipo === 'rapido' ? `subjectParticipanteRapidoId=${p.id}` : `subjectUserId=${p.id}`
      const r = await api('GET', `/compe/mis-resultados?competitionId=${competitionId}&${param}`)
      setMisResultados(r.data || {})
    } catch (e) {
      setErr(e.message)
    }
  }

  async function crearRapido() {
    if (!crearNombre.trim()) { setErr('Pon el nombre.'); return }
    setCreando(true); setErr(null)
    try {
      const r = await api('POST', '/compe/participante-rapido', {
        competitionId, nombre: crearNombre.trim(), telefono: crearTelefono.trim(), email: crearEmail.trim(),
      })
      await elegir({ tipo: 'rapido', id: r.data.id, nombreMostrar: r.data.nombreMostrar })
      setMostrarCrear(false); setCrearNombre(''); setCrearTelefono(''); setCrearEmail('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setCreando(false)
    }
  }

  async function guardarPara(compBlockId, cambios) {
    setGuardando(compBlockId)
    try {
      const target = seleccionado.tipo === 'rapido' ? { targetParticipanteRapidoId: seleccionado.id } : { targetUserId: seleccionado.id }
      await api('POST', '/compe/resultado', { compBlockId, ...cambios, ...target })
      setMisResultados(prev => ({ ...prev, [compBlockId]: { ...(prev[compBlockId] || {}), ...cambios } }))
    } catch (e) {
      setErr(e.message)
    } finally {
      setGuardando(null)
    }
  }

  if (seleccionado) {
    return (
      <div>
        <p className="compe-page__muted">
          Apuntando por <strong>{seleccionado.nombreMostrar}</strong>.{' '}
          <button type="button" className="compe-intentos-link" onClick={() => { setSeleccionado(null); setMisResultados({}) }}>Elegir otra persona</button>
        </p>
        {err && <p className="compe-page__error">{err}</p>}
        <div className="compe-page__grid">
          {bloques.map(b => (
            <BloqueFila
              key={b.compBlockId}
              bloque={b}
              resultado={misResultados[b.compBlockId]}
              guardando={guardando === b.compBlockId}
              onGuardar={cambios => guardarPara(b.compBlockId, cambios)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="compe-grp-field">
        <input
          className="compe-recepcion-input" type="text" value={q} autoFocus
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') buscar() }}
          placeholder="Nombre de quien lo ha hecho…"
        />
      </label>
      <button className="compe-bloque__guardar" disabled={buscando} onClick={buscar}>{buscando ? 'Buscando…' : 'Buscar'}</button>
      {err && <p className="compe-page__error">{err}</p>}

      {resultados !== null && (
        resultados.length === 0 ? (
          <p className="compe-page__muted">Nadie coincide con «{q}».</p>
        ) : (
          <ul className="compe-recepcion-lista">
            {resultados.map((p, i) => (
              <li key={i}>
                <button type="button" className="compe-recepcion-resultado" onClick={() => elegir(p)}>{p.nombreMostrar}</button>
              </li>
            ))}
          </ul>
        )
      )}

      {!mostrarCrear ? (
        <button type="button" className="compe-intentos-link" onClick={() => { setMostrarCrear(true); setCrearNombre(q) }}>
          No está en la lista — pase de día sin cuenta
        </button>
      ) : (
        <div className="compe-page__grid" style={{ marginTop: 12 }}>
          <label className="compe-grp-field">Nombre
            <input className="compe-recepcion-input" type="text" value={crearNombre} onChange={e => setCrearNombre(e.target.value)} />
          </label>
          <label className="compe-grp-field">Teléfono (opcional)
            <input className="compe-recepcion-input" type="text" value={crearTelefono} onChange={e => setCrearTelefono(e.target.value)} />
          </label>
          <label className="compe-grp-field">Email (opcional)
            <input className="compe-recepcion-input" type="email" value={crearEmail} onChange={e => setCrearEmail(e.target.value)} />
          </label>
          <button className="compe-bloque__guardar" disabled={creando} onClick={crearRapido}>{creando ? 'Creando…' : 'Crear y apuntar'}</button>
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
  const estadoLabel = resultado ? 'Apuntado ✓' : ''

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
