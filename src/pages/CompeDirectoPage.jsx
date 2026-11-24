import { useState, useEffect } from 'react'
import { colorPorNumeroBloque } from '../utils/compeColorScale'
import mapaEquipacion from '../assets/mapa-equipacion.jpg'
import cartelCompe from '../assets/cartel-compe-1fase-26-27.jpg'
import CompeClasificacionLive from './CompeClasificacionLive'
import './CompeDirectoPage.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'
const REFRESCO_MS = 30000 // Ramiro: "sondeo cada 30 s, nada pesado" — ver el problema de pestañas colgadas
// 20/11 06:30 (punto 2, nota de Ramiro): "para la compe en directo bájalo a ~10s solo cuando
// haya compe activa" — con compe activa hay que detectar un top nuevo rápido para animarlo;
// sin compe activa (diapositivas, mapa, cuenta atrás) 30 s sigue de sobra.
const REFRESCO_ACTIVO_MS = 10000
const ROTACION_MS = 22000 // "Precompe" rota entre cuenta atrás+cartel y el mapa cada 20-30 s
const LOGO_URL = 'https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png'
// "Esta semana han subido": cuántas filas caben por página antes de pasar a repartir en varias
// (NOTAS_PARA_CODE_tele_roco.md, 14/11 17:25 — antes se cortaba por abajo sin más).
const LIGA_POR_PAGINA = 6
const LIGA_PAGINA_MS = 6000
// Clasificación de temporada (nota 23/11 06:50, punto 6): una categoría a la vez, rotando cada
// TEMPORADA_CAT_MS mientras la fase "temporada" esté en pantalla.
const TEMPORADA_CAT_MS = 8000

// Recorte en círculo (cowork, 11/11 05:15: el PNG tiene las esquinas blancas, no transparentes
// — sobre el fondo oscuro de la tele se ve como un cuadrado blanco feo). `flexShrink: 0` es
// la causa real de "medio logo, desplazado" (cowork, 11/11 07:05): dentro de un contenedor
// flex, sin esto el ancho se podía encoger por debajo del alto, dejando una caja rectangular
// en vez de cuadrada — con `object-fit: cover` eso recorta el círculo de forma asimétrica.
// `contain` de más por si el recorte viniera de otro sitio: así nunca se corta el logo entero,
// a lo sumo se ve un pelín más pequeño dentro del círculo.
function Logo({ className, style }) {
  return <img src={LOGO_URL} alt="Rocoteca Madrid" className={className} style={{ objectFit: 'contain', background: '#fff', ...style }} />
}

// Contenido de una diapositiva de la Tele del Roco — se usa tanto sin compe como programada
// (rotando con la cuenta atrás y el mapa). Cowork, 15/11 18:35: si la imagen no carga, avanza
// a la siguiente en vez de quedarse parada mostrando el hueco roto el resto de su turno.
function renderSlide(slide, onImgError) {
  return (
    <div className="td-content-inner">
      {slide.imagenUrl && <img src={slide.imagenUrl} alt={slide.titulo} className="td-img" onError={onImgError} />}
      <p className="td-slide-title">{slide.titulo}</p>
      {slide.texto && <p className="td-slide-text">{slide.texto}</p>}
      {slide.qrUrl && (
        <div className="td-qr-box">
          <img
            className="td-qr-img"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(slide.qrUrl)}`}
            alt="Código QR"
          />
        </div>
      )}
    </div>
  )
}

// "Esta semana han subido: …" — opción 4 de NOTAS_PARA_CODE_ligas_incentivo.md. Mismo hueco de
// la rotación que una diapositiva normal. Repartida en páginas de LIGA_POR_PAGINA filas, para
// no cortarla por abajo si hay más gente de la que cabe (cowork, 14/11 17:25: con 960×540 solo
// se veía la primera fila).
// Clasificación de temporada (nota 23/11 06:50, punto 6: "en la tele, como una fase más de la
// rotación cuando no hay compe en marcha") — una categoría a la vez (ver TEMPORADA_CAT_MS en
// CompeDirectoPage), topado a 10 filas para que quepa sin cortarse; el detalle completo está en
// la app o en Organización → Compe → Participantes.
function renderTemporada(categoria, numPruebas) {
  const filas = (categoria?.clasificacion || []).slice(0, 10)
  return (
    <div className="td-content-inner">
      <p className="td-liga-title">🏅 Clasificación de temporada — {categoria?.nombre}</p>
      <table className="td-temporada-tabla">
        <thead>
          <tr>
            <th>#</th><th>Nombre</th>
            {Array.from({ length: numPruebas }).map((_, i) => <th key={i}>P{i + 1}</th>)}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.clave}>
              <td>{f.puesto}</td><td>{f.nombreMostrar}</td>
              {f.puntosPorPrueba.map((p, i) => <td key={i}>{p}</td>)}
              <td><strong>{f.total}</strong></td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={numPruebas + 3}>Todavía nadie en esta categoría.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function renderLigaSemana(pagina, totalPaginas, paginaIdx) {
  return (
    <div className="td-content-inner">
      <p className="td-liga-title">
        🏆 Esta semana han subido{totalPaginas > 1 ? ` (${paginaIdx + 1}/${totalPaginas})` : ''}
      </p>
      <ul className="td-liga-list">
        {pagina.map((p, i) => (
          <li key={i} className="td-liga-item">
            <strong>{p.nombreMostrar}</strong> <span>→ {p.liga}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Cuenta atrás de lo que queda de compe (cowork, 09/11 05:30/06:15: antes de empezar decía
// "quedan 25 días" en vez de avisar que no ha empezado) — comp_date/comp_end_date son fechas
// sin hora: el inicio cuenta desde el principio de ese día y el final hasta el final de ese día.
function cuentaAtras(compDate, compEndDate) {
  const ahora = new Date()
  if (compDate) {
    const inicio = new Date(compDate + 'T00:00:00')
    const msHastaEmpezar = inicio - ahora
    if (msHastaEmpezar > 0) {
      const dias = Math.ceil(msHastaEmpezar / 86400000)
      return `Empieza en ${dias} día${dias === 1 ? '' : 's'}`
    }
  }
  if (!compEndDate) return null
  const fin = new Date(compEndDate + 'T23:59:59')
  const ms = fin - ahora
  if (ms <= 0) return 'Compe terminada · resultados finales'
  const dias = Math.floor(ms / 86400000)
  const horas = Math.floor((ms % 86400000) / 3600000)
  if (dias >= 1) return `Quedan ${dias} día${dias === 1 ? '' : 's'} y ${horas} h de compe`
  return `Quedan ${horas} h de compe`
}

// Botón de pantalla completa (NOTAS_PARA_CODE_tele_roco.md, Ramiro 13/11 07:06) — aparece al
// cargar/recargar y con cualquier toque/clic/tecla, y se oculta solo a los pocos segundos de
// quietud (en una tele encendida todo el día no hace falta verlo siempre). La API de
// Fullscreen no necesita sesión ni permisos especiales, pero sí un gesto del usuario — por eso
// es un botón, no algo automático al cargar.
function useAutoHide(ms) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    let t = setTimeout(() => setVisible(false), ms)
    const mostrar = () => {
      setVisible(true)
      clearTimeout(t)
      t = setTimeout(() => setVisible(false), ms)
    }
    window.addEventListener('mousemove', mostrar)
    window.addEventListener('touchstart', mostrar)
    window.addEventListener('keydown', mostrar)
    window.addEventListener('click', mostrar)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', mostrar)
      window.removeEventListener('touchstart', mostrar)
      window.removeEventListener('keydown', mostrar)
      window.removeEventListener('click', mostrar)
    }
  }, [ms])
  return visible
}

function BotonPantallaCompleta() {
  const visible = useAutoHide(5000)
  const [completa, setCompleta] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const onChange = () => setCompleta(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const alternar = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }
  return (
    <button
      type="button" onClick={alternar} className="td-fullscreen-btn"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      {completa ? '⤡ Salir de pantalla completa' : '⛶ Pantalla completa'}
    </button>
  )
}

// Pantalla de la tele del Roco (NOTAS_PARA_CODE_compe_en_blokes.md, punto 5) — pública, sin
// login, pensada para la tele física (TCL en recepción). Letra grande, se refresca sola.
// "Solo nombre y nickname entre paréntesis, nunca apellidos" ya lo hace el backend — aquí solo
// se pinta lo que llega.
// Categorías/puntos de verdad llegan cuando Ramiro confirme el formato; de momento solo
// "General". Cuando llegue la Liga (temporada), esto rota entre "Esta compe" ↔ "Liga
// (temporada)" cada X s — de momento solo hay "Esta compe", así que no hace falta rotar nada.
export default function CompeDirectoPage() {
  const [estado, setEstado] = useState(null)
  const [proxima, setProxima] = useState(null)
  const [clasif, setClasif] = useState(null)
  const [err, setErr] = useState(null)
  const [vistaPrecompe, setVistaPrecompe] = useState('cuenta')
  // Tele del Roco (NOTAS_PARA_CODE_tele_roco.md): sin compe en marcha ni próxima, un carrusel
  // de diapositivas gestionadas a mano desde Superadmin → Tele — primera versión, sin las
  // automáticas por actividad/evento ni los vídeos de blokes, que quedan para más adelante.
  const [slides, setSlides] = useState([])
  const [slideIndex, setSlideIndex] = useState(0)
  // Opción 4 de NOTAS_PARA_CODE_ligas_incentivo.md (Ramiro 12/11 11:55): "Esta semana han
  // subido: …" — quién ha ascendido de liga en los últimos 7 días, como una fase más de la
  // misma rotación que las diapositivas.
  const [ligaSemana, setLigaSemana] = useState([])
  const [ligaPageIdx, setLigaPageIdx] = useState(0)
  // Clasificación de temporada (nota 23/11 06:50, punto 6) — misma idea que "liga": una fase más
  // de la rotación cuando no hay compe en marcha, cargada aparte y poco frecuente (no hace falta
  // más: solo cambia cuando se valida un top de una compe NO de prueba).
  const [temporada, setTemporada] = useState(null)
  const [temporadaCatIdx, setTemporadaCatIdx] = useState(0)
  // ?escala=0.8 en la URL de la tele (Ramiro, 14/11 17:25) — para ajustar desde la propia tele
  // sin tocar código, sin tener que esperar a un redeploy cada vez que cambia la TV.
  const [escala] = useState(() => {
    const v = parseFloat(new URLSearchParams(window.location.search).get('escala'))
    return v > 0 && v <= 3 ? v : 1
  })

  // 🐞 Cowork 11/11 09:40: con una compe programada, la tele no enseñaba nunca las diapositivas
  // de Superadmin → Tele (solo rotaba cuenta atrás ↔ mapa). Ahora, si hay diapositivas, "slide"
  // entra como tercera fase de la rotación — y "liga" como cuarta si hubo ascensos esta semana.
  // Cowork, 15/11 18:35: el avance se saca a su propia función para poder llamarlo también
  // desde el "onError" del cartel (saltar de fase ya mismo si la imagen no carga, en vez de
  // esperar los 22 s completos con el hueco roto en pantalla).
  const temporadaCatsConGente = (temporada?.categorias || []).filter(c => (c.clasificacion || []).length > 0)
  const avanzarFase = () => {
    setVistaPrecompe(v => {
      const fases = ['cuenta', 'mapa']
      if (slides.length > 0) fases.push('slide')
      if (ligaSemana.length > 0) fases.push('liga')
      if (temporadaCatsConGente.length > 0) fases.push('temporada')
      const i = fases.indexOf(v)
      return fases[(i + 1) % fases.length] ?? 'cuenta'
    })
  }
  useEffect(() => {
    const id = setInterval(avanzarFase, ROTACION_MS)
    return () => clearInterval(id)
  }, [slides.length, ligaSemana.length, temporadaCatsConGente.length])

  useEffect(() => {
    let activo = true
    const cargarTemporada = () => {
      fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/clasificacion-temporada`)
        .then(r => r.json())
        .then(j => { if (activo) setTemporada(j.data || null) })
        .catch(() => {})
    }
    cargarTemporada()
    const id = setInterval(cargarTemporada, 5 * 60000)
    return () => { activo = false; clearInterval(id) }
  }, [])

  // Mientras la fase "temporada" está en pantalla, rota entre las categorías que tengan a
  // alguien (nunca una vacía) cada TEMPORADA_CAT_MS.
  useEffect(() => {
    if (vistaPrecompe !== 'temporada' || temporadaCatsConGente.length < 2) return
    const id = setInterval(() => setTemporadaCatIdx(i => (i + 1) % temporadaCatsConGente.length), TEMPORADA_CAT_MS)
    return () => clearInterval(id)
  }, [vistaPrecompe, temporadaCatsConGente.length])

  useEffect(() => {
    let activo = true
    const cargarSlides = () => {
      fetch(`${CLUB_URL}/wp-json/progreso/v1/tele/diapositivas`)
        .then(r => r.json())
        .then(j => { if (activo) setSlides(j.data || []) })
        .catch(() => {})
    }
    cargarSlides()
    const id = setInterval(cargarSlides, 5 * 60000) // cada 5 min como mucho, como pide la nota
    return () => { activo = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    let activo = true
    const cargarLiga = () => {
      fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/tele/liga-semana`)
        .then(r => r.json())
        .then(j => { if (activo) setLigaSemana(j.data || []) })
        .catch(() => {})
    }
    cargarLiga()
    const id = setInterval(cargarLiga, 5 * 60000)
    return () => { activo = false; clearInterval(id) }
  }, [])

  const avanzarSlide = () => setSlideIndex(i => (slides.length ? (i + 1) % slides.length : 0))
  useEffect(() => {
    if (slides.length < 2) return
    const dur = (slides[slideIndex]?.duracionSeg || 12) * 1000
    const id = setTimeout(avanzarSlide, dur)
    return () => clearTimeout(id)
  }, [slides, slideIndex])

  // Si "han subido" no cabe entera (más de LIGA_POR_PAGINA), se reparte en varias páginas que
  // van rotando solas mientras la fase "liga" esté en pantalla — nunca se corta por abajo.
  const ligaPaginas = []
  for (let i = 0; i < ligaSemana.length; i += LIGA_POR_PAGINA) ligaPaginas.push(ligaSemana.slice(i, i + LIGA_POR_PAGINA))
  useEffect(() => {
    if (ligaPaginas.length < 2) return
    const id = setInterval(() => setLigaPageIdx(i => (i + 1) % ligaPaginas.length), LIGA_PAGINA_MS)
    return () => clearInterval(id)
  }, [ligaPaginas.length])

  // La tele está encendida todo el día — recarga sola cada 2,5 h para no acumular memoria ni
  // quedarse colgada con una pestaña vieja (el problema de siempre de Chrome).
  useEffect(() => {
    const id = setTimeout(() => window.location.reload(), 2.5 * 3600000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    let activo = true
    // Vista previa para un vídeo tutorial (Ramiro 12/11 16:15): ?previewCompeId=<id> en la URL
    // de esta misma página de la tele — el backend solo la atiende con sesión de socio. Cowork,
    // 20/11 09:45 punto 1: acepta también ?previewCompe= (el que de verdad escribía el 409 del
    // propio backend al intentar encender una compe de prueba), y manda el nonce de socio —
    // sin él, fetch() con cookies pero sin X-WP-Nonce llega como visitante anónimo y el backend
    // devuelve activo:false aunque la sesión sí sea de socio. En la tele real, sin sesión, esto
    // no cambia nada (clubNonce no existe, no se manda cabecera, fetch sigue siendo anónimo).
    const qs = new URLSearchParams(window.location.search)
    const previewId = qs.get('previewCompeId') || qs.get('previewCompe')
    const previewHeaders = previewId && window.blokesSiteData?.clubNonce ? { 'X-WP-Nonce': window.blokesSiteData.clubNonce } : {}
    const previewFetchOpts = previewId ? { credentials: 'include', headers: previewHeaders } : {}
    const estadoUrl = `${CLUB_URL}/wp-json/progreso/v1/compe/estado${previewId ? `?previewCompeId=${encodeURIComponent(previewId)}` : ''}`
    const cargar = () => {
      fetch(estadoUrl, previewFetchOpts)
        .then(r => r.json())
        .then(j => {
          if (!activo) return
          setEstado(j.data)
          if (j.data?.activo) {
            return fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/clasificacion?competitionId=${j.data.competitionId}`)
              .then(r => r.json())
              .then(jj => { if (activo) setClasif(jj.data) })
          }
          // Sin compe activa: enseña la próxima compe real en vez de quedarse 19 días en blanco
          // con solo el logo (cowork, 11/11 05:40).
          return fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/proxima`)
            .then(r => r.json())
            .then(jj => { if (activo) setProxima(jj.data || null) })
            .catch(() => {})
        })
        .catch(e => activo && setErr(e.message))
    }
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => { activo = false; clearInterval(id) }
  }, [])

  // 20/11 06:30 (punto 2): con compe activa, la clasificación se sondea aparte y más rápido
  // (10 s) que el resto (30 s) — para detectar un top nuevo y animarlo sin que se note el
  // retraso. El efecto de arriba sigue refrescándola también cada 30 s (inofensivo, un fetch
  // de más), este es el que de verdad marca el ritmo mientras hay compe.
  useEffect(() => {
    if (!estado?.activo) return
    let activo = true
    const id = setInterval(() => {
      fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/clasificacion?competitionId=${estado.competitionId}`)
        .then(r => r.json())
        .then(jj => { if (activo) setClasif(jj.data) })
        .catch(() => {})
    }, REFRESCO_ACTIVO_MS)
    return () => { activo = false; clearInterval(id) }
  }, [estado?.activo, estado?.competitionId])

  const pageStyle = { '--td-escala': escala }

  if (!estado?.activo) {
    const cuentaProxima = proxima ? cuentaAtras(proxima.compDate, proxima.compEndDate) : null
    const bloquesColocados = (proxima?.bloques || []).filter(b => b.xPct != null)
    const mostrarMapa = vistaPrecompe === 'mapa' && bloquesColocados.length > 0
    const mostrarSlide = vistaPrecompe === 'slide' && slides.length > 0
    const slideActual = slides[slideIndex] || null
    const mostrarLiga = vistaPrecompe === 'liga' && ligaSemana.length > 0
    const ligaPaginaActual = ligaPaginas[ligaPageIdx % ligaPaginas.length] || []
    const mostrarTemporada = vistaPrecompe === 'temporada' && temporadaCatsConGente.length > 0
    const temporadaCatActual = temporadaCatsConGente[temporadaCatIdx % temporadaCatsConGente.length] || null

    if (err && !proxima) {
      return (
        <div className="td-page" style={pageStyle}>
          <BotonPantallaCompleta />
          <div className="td-content">
            <div className="td-content-inner">
              <Logo className="td-logo" style={{ height: 'min(16vh,160px)', width: 'min(16vh,160px)' }} />
              <p className="td-sin-conexion">Sin conexión — reintentando…</p>
            </div>
          </div>
        </div>
      )
    }
    if (!proxima) {
      // Tele del Roco: sin compe en marcha ni programada, rota las diapositivas de
      // Superadmin → Tele (cartel, promociones, Instala Blokes...) en vez de quedarse en un
      // mensaje muerto.
      const slide = slides[slideIndex] || null
      return (
        <div className="td-page" style={pageStyle}>
          <BotonPantallaCompleta />
          <div className="td-content">
            {mostrarTemporada ? renderTemporada(temporadaCatActual, (temporada?.pruebas || []).length) : mostrarLiga ? renderLigaSemana(ligaPaginaActual, ligaPaginas.length, ligaPageIdx % ligaPaginas.length) : slide ? renderSlide(slide, avanzarSlide) : (
              <div className="td-content-inner">
                <Logo className="td-logo" style={{ height: 'min(12vh,110px)', width: 'min(12vh,110px)' }} />
                <p className="td-sin-conexion">No hay compe activa ahora mismo.</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="td-page" style={pageStyle}>
        <BotonPantallaCompleta />
        <header className="td-header">
          <Logo className="td-logo" />
          <div className="td-header-text">
            <p className="td-title">{proxima.nombre}</p>
            {cuentaProxima && <p className="td-countdown">{cuentaProxima}</p>}
          </div>
        </header>
        <div className="td-content">
          {mostrarTemporada ? (
            renderTemporada(temporadaCatActual, (temporada?.pruebas || []).length)
          ) : mostrarLiga ? (
            renderLigaSemana(ligaPaginaActual, ligaPaginas.length, ligaPageIdx % ligaPaginas.length)
          ) : mostrarSlide && slideActual ? (
            renderSlide(slideActual, avanzarSlide)
          ) : !mostrarMapa ? (
            <div className="td-row">
              <img src={cartelCompe} alt={proxima.nombre} className="td-img" onError={avanzarFase} />
              <div>
                <div className="td-qr-box">
                  <img
                    className="td-qr-img"
                    src="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=https%3A%2F%2Frocomadrid.com%2Fapp"
                    alt="QR para instalar Blokes"
                  />
                </div>
                <p className="td-qr-caption-title">rocomadrid.com/app</p>
                <p className="td-qr-caption-sub">Instala Blokes y apúntate</p>
              </div>
            </div>
          ) : (
            <div className="td-content-inner">
              <div className="td-mapa-wrap">
                <img src={mapaEquipacion} alt="Mapa del rocódromo" onError={avanzarFase} />
                {bloquesColocados.map(b => (
                  <div key={b.numero} className="td-mapa-bloque" style={{
                    left: `${b.xPct}%`, top: `${b.yPct}%`,
                    background: colorPorNumeroBloque(b.numero, proxima.bloques.length).bg,
                    border: b.tested ? '3px solid #22c55e' : '3px solid #1f1f1f',
                  }}>{b.numero}</div>
                ))}
              </div>
              <p className="td-mapa-caption">
                Los {bloquesColocados.length} bloques ya colocados — apunta tus tops desde el móvil, o pide ayuda en recepción.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const cuenta = cuentaAtras(estado.compDate, estado.compEndDate)

  return (
    <div className="td-page" style={pageStyle}>
      <BotonPantallaCompleta />
      <header className="td-live-header">
        <div className="td-live-header-left">
          <Logo className="td-logo" />
          <h1 className="td-live-title">{estado.nombre}</h1>
        </div>
        <div className="td-live-header-right">
          <div className="td-muted">Clasificación provisional · {estado.bloques?.length} bloques</div>
          {cuenta && <div className="td-cuenta">{cuenta}</div>}
        </div>
      </header>
      <div className="td-live-body-wrap">
        <CompeClasificacionLive clasif={clasif} totalBloques={estado.bloques?.length} />
      </div>
      <footer className="td-footer">
        Apunta tus tops en la app Blokes o en recepción · Norma de honor
      </footer>
    </div>
  )
}
