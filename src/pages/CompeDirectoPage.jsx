import { useState, useEffect } from 'react'
import { colorPorNumeroBloque } from '../utils/compeColorScale'
import mapaEquipacion from '../assets/mapa-equipacion.jpg'
import cartelCompe from '../assets/cartel-compe-1fase-26-27.jpg'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'
const REFRESCO_MS = 30000 // Ramiro: "sondeo cada 30 s, nada pesado" — ver el problema de pestañas colgadas
const ROTACION_MS = 22000 // "Precompe" rota entre cuenta atrás+cartel y el mapa cada 20-30 s
const LOGO_URL = 'https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png'

// Recorte en círculo (cowork, 11/11 05:15: el PNG tiene las esquinas blancas, no transparentes
// — sobre el fondo oscuro de la tele se ve como un cuadrado blanco feo). `flexShrink: 0` es
// la causa real de "medio logo, desplazado" (cowork, 11/11 07:05): dentro de un contenedor
// flex, sin esto el ancho se podía encoger por debajo del alto, dejando una caja rectangular
// en vez de cuadrada — con `object-fit: cover` eso recorta el círculo de forma asimétrica.
// `contain` de más por si el recorte viniera de otro sitio: así nunca se corta el logo entero,
// a lo sumo se ve un pelín más pequeño dentro del círculo.
const logoEstilo = size => ({
  height: size, width: size, minWidth: size, minHeight: size, flexShrink: 0,
  borderRadius: '50%', objectFit: 'contain', background: '#fff',
})

// Contenido de una diapositiva de la Tele del Roco — se usa tanto sin compe como programada
// (rotando con la cuenta atrás y el mapa).
function renderSlide(slide) {
  return (
    <>
      {slide.imagenUrl && (
        <img src={slide.imagenUrl} alt={slide.titulo} style={{ maxHeight: 420, maxWidth: '100%', borderRadius: 14, marginBottom: 28, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
      )}
      <p style={{ fontSize: '3rem', fontWeight: 800, margin: '0 0 14px' }}>{slide.titulo}</p>
      {slide.texto && <p style={{ fontSize: '1.6rem', color: '#d1d5db', margin: '0 0 24px' }}>{slide.texto}</p>}
      {slide.qrUrl && (
        <div style={{ background: '#fff', padding: 14, borderRadius: 14, display: 'inline-block' }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(slide.qrUrl)}`}
            alt="Código QR" width={200} height={200}
          />
        </div>
      )}
    </>
  )
}

// "Esta semana han subido: …" — opción 4 de NOTAS_PARA_CODE_ligas_incentivo.md. Mismo hueco de
// la rotación que una diapositiva normal.
function renderLigaSemana(ligaSemana) {
  return (
    <>
      <p style={{ fontSize: '2.6rem', fontWeight: 800, margin: '0 0 28px' }}>🏆 Esta semana han subido</p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '1.8rem', textAlign: 'left', display: 'inline-block' }}>
        {ligaSemana.map((p, i) => (
          <li key={i} style={{ padding: '10px 0', borderBottom: '1px solid #1f2937' }}>
            <strong>{p.nombreMostrar}</strong> <span style={{ color: '#9ca3af' }}>→ {p.liga}</span>
          </li>
        ))}
      </ul>
    </>
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
      type="button" onClick={alternar}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 10000,
        background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)',
        borderRadius: 8, padding: '10px 16px', fontSize: '1rem', cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif', opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.4s ease',
      }}
    >
      {completa ? '⤡ Salir de pantalla completa' : '⛶ Pantalla completa'}
    </button>
  )
}

// Pantalla de la tele del Roco (NOTAS_PARA_CODE_compe_en_blokes.md, punto 5) — pública, sin
// login, pensada para 1080p en la tele que ya tenía el canal de YouTube. Letra grande, se
// refresca sola. "Solo nombre y nickname entre paréntesis, nunca apellidos" ya lo hace el
// backend — aquí solo se pinta lo que llega.
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

  // 🐞 Cowork 11/11 09:40: con una compe programada, la tele no enseñaba nunca las diapositivas
  // de Superadmin → Tele (solo rotaba cuenta atrás ↔ mapa). Ahora, si hay diapositivas, "slide"
  // entra como tercera fase de la rotación — y "liga" como cuarta si hubo ascensos esta semana.
  useEffect(() => {
    const id = setInterval(() => {
      setVistaPrecompe(v => {
        const fases = ['cuenta', 'mapa']
        if (slides.length > 0) fases.push('slide')
        if (ligaSemana.length > 0) fases.push('liga')
        const i = fases.indexOf(v)
        return fases[(i + 1) % fases.length] ?? 'cuenta'
      })
    }, ROTACION_MS)
    return () => clearInterval(id)
  }, [slides.length, ligaSemana.length])

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

  useEffect(() => {
    if (slides.length < 2) return
    const dur = (slides[slideIndex]?.duracionSeg || 12) * 1000
    const id = setTimeout(() => setSlideIndex(i => (i + 1) % slides.length), dur)
    return () => clearTimeout(id)
  }, [slides, slideIndex])

  // La tele está encendida todo el día — recarga sola cada 2,5 h para no acumular memoria ni
  // quedarse colgada con una pestaña vieja (el problema de siempre de Chrome).
  useEffect(() => {
    const id = setTimeout(() => window.location.reload(), 2.5 * 3600000)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    let activo = true
    // Vista previa para un vídeo tutorial (Ramiro 12/11 16:15): ?previewCompe=<id> en la URL de
    // esta misma página de la tele — el backend solo la atiende con sesión de socio.
    const previewId = new URLSearchParams(window.location.search).get('previewCompe')
    const estadoUrl = `${CLUB_URL}/wp-json/progreso/v1/compe/estado${previewId ? `?previewCompeId=${encodeURIComponent(previewId)}` : ''}`
    const cargar = () => {
      fetch(estadoUrl)
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

  const estilos = {
    pagina: {
      position: 'fixed', inset: 0, zIndex: 9999, background: '#0b1120', color: '#fff',
      fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column',
      padding: '40px 64px 0', overflow: 'hidden', boxSizing: 'border-box',
    },
  }

  if (!estado?.activo) {
    const cuentaProxima = proxima ? cuentaAtras(proxima.compDate, proxima.compEndDate) : null
    const bloquesColocados = (proxima?.bloques || []).filter(b => b.xPct != null)
    const mostrarMapa = vistaPrecompe === 'mapa' && bloquesColocados.length > 0
    const mostrarSlide = vistaPrecompe === 'slide' && slides.length > 0
    const slideActual = slides[slideIndex] || null
    const mostrarLiga = vistaPrecompe === 'liga' && ligaSemana.length > 0

    if (err && !proxima) {
      return (
        <div style={estilos.pagina}>
          <BotonPantallaCompleta />
          <div style={{ margin: 'auto', textAlign: 'center' }}>
            <img src={LOGO_URL} alt="Rocoteca Madrid" style={{ ...logoEstilo(160), marginBottom: 24 }} />
            <p style={{ fontSize: '2rem', color: '#9ca3af' }}>Sin conexión — reintentando…</p>
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
        <div style={estilos.pagina}>
          <BotonPantallaCompleta />
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 1200 }}>
            <img src={LOGO_URL} alt="Rocoteca Madrid" style={{ ...logoEstilo(110), marginBottom: 20 }} />
            {mostrarLiga ? renderLigaSemana(ligaSemana) : slide ? renderSlide(slide) : (
              <p style={{ fontSize: '2rem', color: '#9ca3af' }}>No hay compe activa ahora mismo.</p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div style={estilos.pagina}>
        <BotonPantallaCompleta />
        <style>{'@keyframes compeDirectoCuentaMov{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}'}</style>
        <div style={{ margin: 'auto', textAlign: 'center', width: '100%', maxWidth: 1400 }}>
          <img src={LOGO_URL} alt="Rocoteca Madrid" style={{ ...logoEstilo(110), marginBottom: 20 }} />
          <p style={{ fontSize: '3.4rem', fontWeight: 800, margin: '0 0 10px' }}>{proxima.nombre}</p>
          {cuentaProxima && (
            <p style={{ fontSize: '3rem', color: '#f5c842', fontWeight: 800, margin: '0 0 40px', display: 'inline-block', animation: 'compeDirectoCuentaMov 2.2s ease-in-out infinite' }}>
              {cuentaProxima}
            </p>
          )}

          {mostrarLiga ? (
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>{renderLigaSemana(ligaSemana)}</div>
          ) : mostrarSlide && slideActual ? (
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>{renderSlide(slideActual)}</div>
          ) : !mostrarMapa ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 56, flexWrap: 'wrap' }}>
              <img src={cartelCompe} alt={proxima.nombre} style={{ maxHeight: 440, borderRadius: 14, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ background: '#fff', padding: 16, borderRadius: 14, display: 'inline-block' }}>
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=https%3A%2F%2Frocomadrid.com%2Fapp"
                    alt="QR para instalar Blokes" width={260} height={260}
                  />
                </div>
                <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: '20px 0 6px' }}>rocomadrid.com/app</p>
                <p style={{ fontSize: '1.3rem', color: '#d1d5db', margin: 0 }}>Instala Blokes y apúntate</p>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto' }}>
                <img src={mapaEquipacion} alt="Mapa del rocódromo" style={{ width: '100%', display: 'block', borderRadius: 10 }} />
                {bloquesColocados.map(b => (
                  <div key={b.numero} style={{
                    position: 'absolute', left: `${b.xPct}%`, top: `${b.yPct}%`, transform: 'translate(-50%,-50%)',
                    width: 56, height: 56, borderRadius: '50%', background: colorPorNumeroBloque(b.numero, proxima.bloques.length).bg,
                    color: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.6rem', fontWeight: 800, border: b.tested ? '3px solid #22c55e' : '3px solid #1f1f1f',
                    boxShadow: '0 3px 8px rgba(0,0,0,0.5)',
                  }}>{b.numero}</div>
                ))}
              </div>
              <p style={{ fontSize: '1.4rem', color: '#d1d5db', marginTop: 24 }}>
                Los {bloquesColocados.length} bloques ya colocados — apunta tus tops desde el móvil, o pide ayuda en recepción.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const general = clasif?.categorias?.[0]?.clasificacion || []
  const ultimos = clasif?.ultimosValidados || []
  const cuenta = cuentaAtras(estado.compDate, estado.compEndDate)

  return (
    <div style={estilos.pagina}>
      <BotonPantallaCompleta />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <img src={LOGO_URL} alt="Rocoteca Madrid" style={logoEstilo(80)} />
          <h1 style={{ fontSize: '3rem', margin: 0 }}>{estado.nombre}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.3rem', color: '#9ca3af' }}>Clasificación provisional — General</div>
          {cuenta && <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24' }}>{cuenta}</div>}
        </div>
      </header>
      <div style={{ display: 'flex', gap: 64, flex: 1, minHeight: 0 }}>
        <section style={{ flex: 2, minWidth: 0 }}>
          <h2 style={{ fontSize: '1.8rem', color: '#9ca3af', marginBottom: 16 }}>Clasificación</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '2.8rem' }}>
            {general.slice(0, 10).map((p, i) => (
              <li key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '14px 0',
                borderBottom: '1px solid #1f2937', fontWeight: i < 3 ? 800 : 500,
                color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#fb923c' : '#fff',
              }}>
                <span>{i + 1}. {p.nombreMostrar}</span>
                <span>{p.tops} top{p.tops === 1 ? '' : 's'}</span>
              </li>
            ))}
            {general.length === 0 && <li style={{ color: '#6b7280', fontSize: '1.8rem' }}>Todavía no hay tops.</li>}
          </ol>
        </section>
        <section style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #1f2937', paddingLeft: 48 }}>
          <h2 style={{ fontSize: '1.8rem', color: '#9ca3af', marginBottom: 16 }}>Últimos tops</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '1.4rem' }}>
            {ultimos.map((u, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto',
                  background: colorPorNumeroBloque(u.numero, estado.bloques?.length).bg,
                }} />
                <span><strong>{u.nombreMostrar}</strong> · bloque {u.numero} · hace {u.hace}</span>
              </li>
            ))}
            {ultimos.length === 0 && <li style={{ color: '#6b7280' }}>Nada apuntado todavía.</li>}
          </ul>
        </section>
      </div>
      <footer style={{
        textAlign: 'center', padding: '20px 0', fontSize: '1.1rem', color: '#9ca3af',
        borderTop: '1px solid #1f2937', marginTop: 24,
      }}>
        Apunta tus tops en la app Blokes o en recepción · Norma de honor
      </footer>
    </div>
  )
}
