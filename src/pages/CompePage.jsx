import { useState, useEffect, useCallback } from 'react'
import { colorPorNumeroBloque } from '../utils/compeColorScale'
import ApuntarResultadoModal from '../components/ApuntarResultadoModal'
import cartelCompe from '../assets/cartel-compe-1fase-26-27.jpg'
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
  if (!res.ok) {
    // 22/11 ("nadie sin categoría"): /compe/resultado devuelve 'falta_categoria' cuando es el
    // primer top de alguien sin categoría todavía — Apuntar/Recepción lo distinguen por el
    // code, no por el texto, para enseñar un aviso claro en vez del error genérico.
    const err = new Error(json?.message || `Error ${res.status}`)
    err.code = json?.code
    throw err
  }
  return json
}

const PUEDE_RECEPCION = ['profesor', 'gestion', 'socio', 'tablet']
// 23/11 06:57 (Ramiro): la categoría ya no se elige aquí con un desplegable — sale, si falta,
// dentro del mismo diálogo de apuntar (ApuntarResultadoModal). "En ningún otro sitio se puede
// cambiar una vez elegida" — el único sitio para corregirla es Organización → Compe →
// Participantes.

function fechaRangoCompe(compDate, compEndDate) {
  const opts = { day: 'numeric', month: 'long' }
  const ini = new Date(`${compDate}T00:00:00`).toLocaleDateString('es-ES', opts)
  if (!compEndDate || compEndDate === compDate) return ini
  const fin = new Date(`${compEndDate}T00:00:00`).toLocaleDateString('es-ES', opts)
  return `${ini} – ${fin}`
}
function cuentaAtrasCompe(compDate, compEndDate) {
  const ahora = new Date()
  const inicio = new Date(`${compDate}T00:00:00`)
  const fin = new Date(`${compEndDate || compDate}T23:59:59`)
  if (ahora > fin) return 'Ya celebrada'
  if (ahora >= inicio) return '¡Empieza hoy!'
  const dias = Math.ceil((inicio - ahora) / 86400000)
  return dias === 1 ? 'Empieza mañana' : `Empieza en ${dias} días`
}

const CATEGORIA_LABEL_TEMPORADA = { masculina: 'Masculina', femenina: 'Femenina', infantil: 'Infantil' }

// Clasificación de temporada (nota 23/11 06:50, punto 6: "en la app, Compe → «Clasificación de
// la temporada»") — pública, no depende de que haya una compe activa: cada compe NO de prueba
// es una "prueba" numerada por fecha, sumadas por categoría. Mismo endpoint que usa la tele.
function CompeTemporadaView({ onVolver }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    api('GET', '/compe/clasificacion-temporada')
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
  }, [])

  return (
    <div className="compe-page">
      <button type="button" className="compe-page__tele-link" onClick={onVolver}>← Volver a la compe</button>
      <h1>Clasificación de temporada</h1>
      <p className="compe-page__muted">
        Suma de puntos de cada compe de la temporada (las de prueba no cuentan). Solo cuenta
        quien participa con su propia cuenta — un pase de día sin cuenta no se puede seguir de
        una prueba a la siguiente.
      </p>
      {error && <p className="compe-page__error">{error}</p>}
      {!data && !error && <p className="compe-page__muted">Cargando…</p>}
      {data && data.pruebas.length === 0 && <p className="compe-page__muted">Todavía no hay ninguna prueba de la temporada.</p>}
      {data && data.pruebas.length > 0 && data.categorias.map(cat => (
        <section key={cat.id} className="compe-temporada-cat">
          <h2>{CATEGORIA_LABEL_TEMPORADA[cat.id] || cat.nombre}</h2>
          {cat.clasificacion.length === 0 ? (
            <p className="compe-page__muted">Todavía nadie en esta categoría.</p>
          ) : (
            <div className="compe-temporada-scroll">
              <table className="compe-temporada-tabla">
                <thead>
                  <tr>
                    <th>#</th><th>Nombre</th>
                    {data.pruebas.map(p => <th key={p.numero}>Prueba {p.numero}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.clasificacion.map(f => (
                    <tr key={f.clave}>
                      <td>{f.puesto}</td><td>{f.nombreMostrar}</td>
                      {f.puntosPorPrueba.map((pts, i) => <td key={i}>{pts}</td>)}
                      <td><strong>{f.total}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

// "La compe en Blokes" (NOTAS_PARA_CODE_compe_en_blokes.md). Parte 1: apuntar top/zona/intentos.
// Parte 4 (Ramiro, 07/11 08:46/08:48): recepción apuntando por otra persona (profe/Eva/socio) +
// participante rápido sin cuenta. Sin validación en la app (Ramiro, 07/11 más tarde): todo lo
// apuntado cuenta al momento, lo valida la palabra de los compañeros, no la app — en la tablet
// (rol "tablet", incluido en PUEDE_RECEPCION) cada uno busca su propio nombre en "Recepción" y
// apunta, sin PIN.
export default function CompePage() {
  const sd = window.blokesSiteData || {}
  const puedeRecepcion = PUEDE_RECEPCION.includes(sd.userRole)
  // La tablet no tiene "yo" (igual que en Colección/Progreso, cowork 08/11 21:50) — con rol
  // tablet solo tiene sentido Recepción, nunca "Apuntar" (apuntarse tops a sí misma).
  const esTablet = sd.userRole === 'tablet'
  const [estado, setEstado] = useState(null)
  const [proxima, setProxima] = useState(null)
  const [misResultados, setMisResultados] = useState({})
  const [ventana, setVentana] = useState(null)
  const [totalPuntos, setTotalPuntos] = useState(0)
  const [tab, setTab] = useState(esTablet ? 'recepcion' : 'apuntar')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // 23/11 06:51/06:52: "ningún camino puede apuntar un bloque sin decir si es top o bonus" —
  // tocar un bloque SIEMPRE abre este diálogo único, nunca se guarda nada por adelantado.
  // { compBlockId, numero, mostrarCategoria, resultadoElegido }
  const [pidiendoResultado, setPidiendoResultado] = useState(null)
  const [mostrarTemporada, setMostrarTemporada] = useState(false)

  const cargar = useCallback(() => {
    setLoading(true)
    api('GET', '/compe/estado')
      .then(r => {
        setEstado(r.data)
        if (r.data?.activo && sd.isLoggedIn) {
          return api('GET', `/compe/mis-resultados?competitionId=${r.data.competitionId}`)
            .then(rr => { setMisResultados(rr.data || {}); setVentana(rr.ventana || null); setTotalPuntos(rr.totalPuntos || 0) })
        }
        // Sin compe activa: en vez de un callejón sin salida durante los días previos, se
        // enseña la próxima compe real (si hay) con fecha y cuenta atrás (cowork, 11/11 05:40).
        if (!r.data?.activo) {
          return api('GET', '/compe/proxima').then(rr => setProxima(rr.data || null)).catch(() => {})
        }
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [sd.isLoggedIn])

  useEffect(() => { cargar() }, [cargar])

  const abrirModal = b => setPidiendoResultado({ compBlockId: b.compBlockId, numero: b.numero, mostrarCategoria: false, resultadoElegido: null })
  const cerrarModal = () => setPidiendoResultado(null)

  async function intentarGuardar(resultado, categoria) {
    const p = pidiendoResultado
    if (!p) return
    setGuardando(true)
    try {
      const r = await api('POST', '/compe/resultado', { compBlockId: p.compBlockId, resultado, ...(categoria ? { categoria } : {}) })
      const puntosAntes = misResultados[p.compBlockId]?.puntos ?? 0
      const puntosDespues = resultado === 'ninguno' ? 0 : (r?.data?.puntos ?? 0)
      setMisResultados(prev => {
        const next = { ...prev }
        if (resultado === 'ninguno') delete next[p.compBlockId]
        else next[p.compBlockId] = { top: resultado === 'top', zona: true, puntos: puntosDespues, estado: 'validado' }
        return next
      })
      setTotalPuntos(t => t - puntosAntes + puntosDespues)
      setPidiendoResultado(null)
    } catch (e) {
      if (e.code === 'falta_categoria') setPidiendoResultado({ ...p, mostrarCategoria: true, resultadoElegido: resultado })
      else setErr(e.message)
    } finally {
      setGuardando(false)
    }
  }
  const elegirResultado = resultado => intentarGuardar(resultado, null)
  const elegirCategoria = categoria => intentarGuardar(pidiendoResultado?.resultadoElegido, categoria)
  const quitarResultado = () => intentarGuardar('ninguno', null)

  if (mostrarTemporada) return <CompeTemporadaView onVolver={() => setMostrarTemporada(false)} />

  if (loading) return <div className="compe-page compe-page--loading">Cargando…</div>

  if (err && !estado) return <div className="compe-page"><p className="compe-page__error">{err}</p></div>

  if (!estado?.activo) {
    return (
      <div className="compe-page">
        <button type="button" className="compe-page__tele-link" onClick={() => setMostrarTemporada(true)}>🏅 Clasificación de temporada</button>
        {proxima ? (
          <div className="compe-precompe">
            <p className="compe-precompe__proximamente">Próximamente</p>
            <img src={cartelCompe} alt={proxima.nombre} className="compe-precompe__cartel" />
            <h1>{proxima.nombre}</h1>
            <p className="compe-precompe__fechas">{fechaRangoCompe(proxima.compDate, proxima.compEndDate)}</p>
            <p className="compe-precompe__cuenta">{cuentaAtrasCompe(proxima.compDate, proxima.compEndDate)}</p>
            <div className="compe-precompe__que-hacer">
              <h2>Qué hay que hacer</h2>
              <ul>
                <li>Instala la app desde <a href="https://rocomadrid.com/app">rocomadrid.com/app</a> para apuntar tus tops desde el móvil.</li>
                <li>El día de la compe, apunta tu Top/Zona en cuanto lo consigas — o pide ayuda en recepción.</li>
                <li>Norma de honor: para que cuente, que te haya visto un compañero o un profe.</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            <h1>Compe</h1>
            <p className="compe-page__muted">No hay ninguna compe activa ahora mismo. Vuelve cuando empiece.</p>
          </>
        )}
      </div>
    )
  }

  if (!sd.isLoggedIn) {
    return (
      <div className="compe-page">
        <h1>{estado.nombre}</h1>
        <p className="compe-page__muted">Entra con tu cuenta para apuntar tus resultados.</p>
        <a className="compe-page__login" href={sd.loginUrl}>Entrar</a>
        <button type="button" className="compe-page__tele-link" style={{ display: 'block', marginTop: 10 }} onClick={() => setMostrarTemporada(true)}>🏅 Clasificación de temporada</button>
      </div>
    )
  }

  return (
    <div className="compe-page">
      <h1>{estado.nombre}</h1>
      <button type="button" className="compe-page__tele-link" onClick={() => setMostrarTemporada(true)}>🏅 Clasificación de temporada</button>
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
      {pidiendoResultado && (
        <ApuntarResultadoModal
          numero={pidiendoResultado.numero}
          nombre={sd.userName || 'ti'}
          mostrarCategoria={pidiendoResultado.mostrarCategoria}
          resultadoActual={misResultados[pidiendoResultado.compBlockId]?.top ? 'top' : misResultados[pidiendoResultado.compBlockId]?.zona ? 'bonus' : null}
          onElegirResultado={elegirResultado}
          onElegirCategoria={elegirCategoria}
          onQuitar={quitarResultado}
          onCerrar={cerrarModal}
          busy={guardando}
        />
      )}

      {puedeRecepcion && !esTablet && (
        <div className="compe-tabs">
          <button className={`compe-tab${tab === 'apuntar' ? ' compe-tab--activo' : ''}`} onClick={() => setTab('apuntar')}>Apuntar</button>
          <button className={`compe-tab${tab === 'recepcion' ? ' compe-tab--activo' : ''}`} onClick={() => setTab('recepcion')}>Recepción</button>
        </div>
      )}

      {tab === 'apuntar' && !esTablet && (
        <>
          <p className="compe-page__puntos">Llevas <strong>{totalPuntos}</strong> pts en esta compe.</p>
          <div className="compe-page__grid">
          {estado.bloques.map(b => (
            <BloqueBoton
              key={b.compBlockId}
              bloque={b}
              totalBloques={estado.bloques.length}
              resultado={misResultados[b.compBlockId]}
              onAbrir={() => abrirModal(b)}
            />
          ))}
          </div>
        </>
      )}
      {(tab === 'recepcion' || esTablet) && puedeRecepcion && (
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
  const [totalPuntos, setTotalPuntos] = useState(0)
  // 23/11 06:57: solo de lectura, para el aviso de "tiene resultados pero sin categoría" — ya
  // no se puede cambiar aquí, el único sitio es Organización → Compe → Participantes.
  const [categoriaActual, setCategoriaActual] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState(null)
  const [crearNombre, setCrearNombre] = useState('')
  const [crearTelefono, setCrearTelefono] = useState('')
  const [crearEmail, setCrearEmail] = useState('')
  const [creando, setCreando] = useState(false)
  const [mostrarCrear, setMostrarCrear] = useState(false)
  const [aviso, setAviso] = useState(null)
  // 23/11 06:51/06:52: mismo diálogo único que en Apuntar — { compBlockId, numero,
  // mostrarCategoria, resultadoElegido }, nunca se guarda nada sin decir top/bonus.
  const [pidiendoResultado, setPidiendoResultado] = useState(null)

  function volverABuscar() {
    setSeleccionado(null); setMisResultados({}); setTotalPuntos(0); setCategoriaActual(null); setQ(''); setResultados(null); setPidiendoResultado(null)
  }

  // Tablet de autoservicio (Ramiro, 07/11 16:35/16:36): esta misma pestaña la usa tanto
  // recepción (apunta por varios bloques de la misma persona) como cada participante en la
  // tablet compartida — para que el siguiente no apunte sin querer en la cuenta del anterior,
  // vuelve sola a la búsqueda a los 60 s sin tocar nada mientras hay alguien elegido.
  useEffect(() => {
    if (!seleccionado) return
    const id = setTimeout(volverABuscar, 60000)
    return () => clearTimeout(id)
  }, [seleccionado, misResultados])

  async function buscar(silencioso = false) {
    if (q.trim().length < 2) { if (!silencioso) setErr('Escribe al menos 2 caracteres.'); return }
    setBuscando(true); if (!silencioso) setErr(null)
    try {
      const r = await api('GET', `/compe/buscar-participante?q=${encodeURIComponent(q.trim())}&competitionId=${competitionId}`)
      setResultados(r.data || [])
    } catch (e) {
      if (!silencioso) setErr(e.message)
    } finally {
      setBuscando(false)
    }
  }

  // Cowork, 08/11 11:15: que busque sola mientras se escribe (desde 2 letras), no solo con el
  // botón — más rápido en la tablet. El botón y Enter (buscar() sin debounce) siguen ahí.
  useEffect(() => {
    if (q.trim().length < 2) { setResultados(null); return }
    const id = setTimeout(() => buscar(true), 350)
    return () => clearTimeout(id)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  async function elegir(p) {
    setSeleccionado(p)
    setErr(null)
    try {
      const param = p.tipo === 'rapido' ? `subjectParticipanteRapidoId=${p.id}` : `subjectUserId=${p.id}`
      const r = await api('GET', `/compe/mis-resultados?competitionId=${competitionId}&${param}`)
      setMisResultados(r.data || {})
      setTotalPuntos(r.totalPuntos || 0)
      setCategoriaActual(r.categoria || null)
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

  const abrirModalPara = b => setPidiendoResultado({ compBlockId: b.compBlockId, numero: b.numero, mostrarCategoria: false, resultadoElegido: null })
  const cerrarModalPara = () => setPidiendoResultado(null)

  async function intentarGuardarPara(resultado, categoria) {
    const p = pidiendoResultado
    if (!p) return
    setGuardando(true)
    try {
      const target = seleccionado.tipo === 'rapido' ? { targetParticipanteRapidoId: seleccionado.id } : { targetUserId: seleccionado.id }
      const r = await api('POST', '/compe/resultado', { compBlockId: p.compBlockId, resultado, ...target, ...(categoria ? { categoria } : {}) })
      const puntosAntes = misResultados[p.compBlockId]?.puntos ?? 0
      const puntosDespues = resultado === 'ninguno' ? 0 : (r?.data?.puntos ?? 0)
      setMisResultados(prev => {
        const next = { ...prev }
        if (resultado === 'ninguno') delete next[p.compBlockId]
        else next[p.compBlockId] = { top: resultado === 'top', zona: true, puntos: puntosDespues, estado: 'validado' }
        return next
      })
      setTotalPuntos(t => t - puntosAntes + puntosDespues)
      if (categoria) setCategoriaActual(categoria)
      setPidiendoResultado(null)
      // Aviso de confirmación (cowork, 08/11 11:15).
      if (resultado !== 'ninguno') {
        setAviso(`✓ ${resultado === 'top' ? 'Top' : 'Bonus'} · +${puntosDespues} pts apuntado a ${seleccionado.nombreMostrar} (bloque ${p.numero})`)
        setTimeout(() => setAviso(null), 3000)
      }
      // Cowork, 09/11 05:30: "los profes loguean los tops de varios usuarios, un profe suele
      // apuntar varios bloques seguidos a la misma persona" — ya NO vuelve sola a la búsqueda
      // tras guardar (eso era para la tablet de autoservicio, que apunta un único bloque por
      // persona); se queda en la misma persona hasta que se pulse "Otra persona", o hasta los
      // 60 s sin tocar nada (el temporizador de abajo).
    } catch (e) {
      if (e.code === 'falta_categoria') setPidiendoResultado({ ...p, mostrarCategoria: true, resultadoElegido: resultado })
      else setErr(e.message)
    } finally {
      setGuardando(false)
    }
  }
  const elegirResultadoPara = resultado => intentarGuardarPara(resultado, null)
  const elegirCategoriaPara = categoria => intentarGuardarPara(pidiendoResultado?.resultadoElegido, categoria)
  const quitarResultadoPara = () => intentarGuardarPara('ninguno', null)

  if (seleccionado) {
    return (
      <div>
        <div className="compe-recepcion-persona">
          <p className="compe-page__muted" style={{ margin: 0 }}>
            Apuntando por <strong>{seleccionado.nombreMostrar}</strong>
          </p>
          <button type="button" className="compe-recepcion-otra" onClick={volverABuscar}>Otra persona</button>
        </div>
        <p className="compe-page__puntos">
          {categoriaActual ? <>Categoría: <strong>{categoriaActual}</strong> · </> : null}
          Lleva <strong>{totalPuntos}</strong> pts en esta compe.
        </p>
        {/* 22/11 ("nadie sin categoría"): ya no se puede apuntar un primer resultado sin
            categoría, pero alguien de ANTES de este cambio puede tener resultados sin ella —
            aviso solo aquí (en Recepción), nunca en la tele ni en el Apuntar de cada uno. */}
        {!categoriaActual && Object.keys(misResultados).length > 0 && (
          <p className="compe-page__error">⚠️ Ya tiene resultados apuntados pero sin categoría — no sale en la clasificación de la tele. Corrígelo en Organización → Compe → Participantes.</p>
        )}
        {pidiendoResultado && (
          <ApuntarResultadoModal
            numero={pidiendoResultado.numero}
            nombre={seleccionado.nombreMostrar}
            mostrarCategoria={pidiendoResultado.mostrarCategoria}
            resultadoActual={misResultados[pidiendoResultado.compBlockId]?.top ? 'top' : misResultados[pidiendoResultado.compBlockId]?.zona ? 'bonus' : null}
            onElegirResultado={elegirResultadoPara}
            onElegirCategoria={elegirCategoriaPara}
            onQuitar={quitarResultadoPara}
            onCerrar={cerrarModalPara}
            busy={guardando}
          />
        )}
        {aviso && <p className="compe-recepcion-aviso">{aviso}</p>}
        {err && <p className="compe-page__error">{err}</p>}
        <div className="compe-page__grid">
          {bloques.map(b => (
            <BloqueBoton
              key={b.compBlockId}
              bloque={b}
              totalBloques={bloques.length}
              resultado={misResultados[b.compBlockId]}
              onAbrir={() => abrirModalPara(b)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {aviso && <p className="compe-recepcion-aviso">{aviso}</p>}
      <label className="compe-grp-field">
        <input
          className="compe-recepcion-input" type="text" value={q} autoFocus
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') buscar() }}
          placeholder="Nombre de quien lo ha hecho…"
        />
      </label>
      <button className="compe-bloque__guardar" disabled={buscando} onClick={() => buscar()}>{buscando ? 'Buscando…' : 'Buscar'}</button>
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

// 23/11 06:51 ("un único diálogo modal" para apuntar): el bloque entero es un botón — tocarlo
// abre ApuntarResultadoModal, nunca hay toggles sueltos de Top/Zona aquí. Muestra el resultado
// ya apuntado (si lo hay) y los puntos que vale.
function BloqueBoton({ bloque, totalBloques, resultado, onAbrir }) {
  const color = colorPorNumeroBloque(bloque.numero, totalBloques)
  const estadoTexto = resultado?.top ? `Top · ${resultado.puntos ?? 0} pts` : resultado?.zona ? `Bonus · ${resultado.puntos ?? 0} pts` : 'Sin apuntar'

  return (
    <button type="button" className={`compe-bloque compe-bloque--boton${resultado ? ' compe-bloque--hecho' : ''}`} onClick={onAbrir}>
      <div className="compe-bloque__numero" style={{ background: color.bg, color: color.text }}>{bloque.numero}</div>
      <div className="compe-bloque__cuerpo">
        <span className={`compe-estado${resultado ? ' compe-estado--validado' : ''}`}>{estadoTexto}</span>
      </div>
    </button>
  )
}
