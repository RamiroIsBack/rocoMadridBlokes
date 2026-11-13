import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom'
import MainPage from './pages/MainPage'
import AdminApp from './admin/AdminApp'
import StatsPage from './pages/StatsPage'
import TareasIndexPage from './pages/TareasIndexPage'
import OrganizacionPage from './pages/OrganizacionPage'
import UserStatsPage from './pages/UserStatsPage'
import ProgresoPage from './pages/ProgresoPage'
import ProgresoIndexPage from './pages/ProgresoIndexPage'
import MiClaseTab from './pages/MiClaseTab'
import EntrenamientosPage from './pages/EntrenamientosPage'
import SuperAdminPage from './pages/SuperAdminPage'
import SupervisionPage from './pages/SupervisionPage'
import PlaygroundPage from './pages/PlaygroundPage'
import FichajePage from './pages/FichajePage'
import TimeOffPage from './pages/TimeOffPage'
import LeaguesPage from './pages/LeaguesPage'
import EventosPage from './pages/EventosPage'
import CalendarioPage from './pages/CalendarioPage'
import CompePage from './pages/CompePage'
import CompeDirectoPage from './pages/CompeDirectoPage'
import InstalarPage from './pages/InstalarPage'
import { setVerComo, clearVerComo } from './utils/verComo'
import { getTema, setTema } from './utils/theme'
import ProfileSetupModal from './components/ProfileSetupModal'
import UserAvatar from './components/UserAvatar'
import { useProfile } from './hooks/useProfile'
import { useWordPressPosts } from './hooks/useWordPressPosts'
import { useEventsAccess } from './hooks/useEvents'
import { useCalendarAccess } from './hooks/useCalendar'
import './App.css'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

const PRODUCT_NAMES = { 'Classes': 'Clases', 'Single Days': 'Días sueltos' }

const SUBSALA_POSITIONS = {
  '1': { top: '5%',   left: '50%',  transform: 'translateX(-50%)' },
  '2': { top: '5%',   left: '18%',  transform: 'translateX(-50%)' },
  '3': { top: '52%',  left: '23.5%', transform: 'translateX(-50%)' },
  '4': { top: '52%',  left: '52%',  transform: 'translateX(-50%)' },
  '5': { bottom: '5%', right: '32.5%', transform: 'translateX(50%)' },
  '6': { bottom: '5%', left: '46.5%', transform: 'translateX(-50%)' },
  '7': { bottom: '5%', left: '18%', transform: 'translateX(-50%)' },
  '8': { top: '44.5%', right: '18%', transform: 'translateX(50%)' },
}

const KNOWN_ROUTES = ['/progreso', '/tareas', '/setter', '/stats', '/entrenamientos', '/fichaje', '/time-off', '/superadmin', '/supervision', '/mis-blokes', '/ligas', '/playground', '/eventos', '/calendario', '/compe', '/instalar']

function detectBasename() {
  const injected = window.blokesSiteData?.appBasename
  const path = window.location.pathname
  // Use injected value only if it's an exact prefix (avoid /blokes matching /blokes-dev)
  if (injected && (path === injected || path.startsWith(injected + '/'))) return injected
  // Auto-detect from known sub-routes
  for (const route of KNOWN_ROUTES) {
    const idx = path.indexOf(route)
    if (idx > 0) return path.slice(0, idx)
  }
  // Fallback: first path segment or env variable
  const m = path.match(/^(\/[^/]+)/)
  return m ? m[1] : (import.meta.env.VITE_ROUTER_BASENAME || '/blokes')
}

// Verde/azul/rojo oscurecidos para que el número en blanco tenga contraste real (antes
// #22c55e/#3b82f6/#ef4444 daban 2,28/3,68/3,76:1 — NOTAS_PARA_CODE_contraste.md).
const COLOR_BUBBLE = {
  green:  { bg: '#15803d', text: '#fff' },
  blue:   { bg: '#2563eb', text: '#fff' },
  yellow: { bg: '#eab308', text: '#1a1a1a' },
  red:    { bg: '#dc2626', text: '#fff' },
  black:  { bg: '#1f2937', text: '#fff' },
  blanco: { bg: '#e5e7eb', text: '#1f2937' },
}

function buildLoginUrl(sd) {
  if (sd.loginUrl) return sd.loginUrl
  const base = window.location.origin + detectBasename()
  return window.location.origin + '/wp-login.php?redirect_to=' + encodeURIComponent(base + '/')
}

export default function App() {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [navFloating, setNavFloating] = useState(false)
  const [navVisible, setNavVisible] = useState(false)
  const lastScrollY = useRef(0)
  const sd = window.blokesSiteData || {}
  const canEvents = useEventsAccess()
  const canCalendar = useCalendarAccess().can

  // Profile modal state
  const { profileComplete, verified, fetching: profileFetching, nickname, avatarType, avatarData, saveProfile, checkNickname, uploadPhoto, optinWhatsapp, saveOptinWhatsapp } = useProfile()
  const [profileModalOpen,    setProfileModalOpen]    = useState(false)
  const [profileModalBlock,   setProfileModalBlock]   = useState(false)
  const [profileModalMsg,     setProfileModalMsg]     = useState('')
  const [profileModalOnSaved, setProfileModalOnSaved] = useState(null)

  // Open dismissible modal once the API verification resolves as incomplete.
  // `verified` flips to true only after /profile/me responds, so we never
  // flash the modal for users who already have a profile but had stale state.
  useEffect(() => {
    if (verified && sd.isLoggedIn && !profileComplete) {
      setProfileModalOpen(true)
      setProfileModalBlock(false)
      setProfileModalMsg('')
    }
  }, [verified]) // eslint-disable-line react-hooks/exhaustive-deps

  // Expose globally so useCompletions / any component can trigger it
  const openProfileModal = useCallback(({ blocking = false, message = '', onSaved = null } = {}) => {
    setProfileModalBlock(blocking)
    setProfileModalMsg(message || '')
    setProfileModalOnSaved(() => onSaved)
    setProfileModalOpen(true)
  }, [])

  useEffect(() => {
    window.blokesOpenProfileModal = openProfileModal
    return () => { window.blokesOpenProfileModal = null }
  }, [openProfileModal])

  const handleProfileSaved = useCallback(() => {
    setProfileModalOpen(false)
    profileModalOnSaved?.()
    setProfileModalOnSaved(null)
  }, [profileModalOnSaved])

  useEffect(() => {
    const THRESHOLD = 180
    const MIN_DELTA = 10 // ignore mobile overscroll/rubber-band jitter
    const onScroll = () => {
      const y = Math.max(0, window.scrollY) // iOS reports negative y during bounce
      const delta = y - lastScrollY.current
      const atBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 2
      if (y > THRESHOLD) {
        setNavFloating(true)
        if (atBottom) {
          // Bouncing at the very bottom can report a tiny upward delta;
          // showing the fixed nav here is what causes the scroll position
          // to visibly jump back up, so never trigger it from this edge.
        } else if (delta <= -MIN_DELTA) {
          setNavVisible(true)
        } else if (delta >= MIN_DELTA) {
          setNavVisible(false)
        }
      } else {
        setNavFloating(false)
        setNavVisible(false)
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const { cards } = useWordPressPosts()

  const subsalaStats = useMemo(() => {
    const acc = {}
    cards.forEach(card => {
      const sub = String(card.subsala || '').trim()
      if (!sub) return
      if (!acc[sub]) acc[sub] = {}
      const color = card.color || 'green'
      acc[sub][color] = (acc[sub][color] || 0) + 1
    })
    return acc
  }, [cards])

  // "Dónde está cada bloque" en Colección modo compe (Ramiro, 09/11 05:45, punto opcional):
  // al tocar la zona de una tarjeta, resalta esa subzona aquí en el mapa de la cabecera — un
  // evento suelto porque MainPage.jsx (quien lo dispara) y este mapa viven en componentes
  // distintos.
  const [subsalaResaltada, setSubsalaResaltada] = useState(null)
  useEffect(() => {
    const onResaltar = e => {
      setSubsalaResaltada(String(e.detail))
      setTimeout(() => setSubsalaResaltada(null), 3000)
    }
    window.addEventListener('blokes:resaltar-subsala', onResaltar)
    return () => window.removeEventListener('blokes:resaltar-subsala', onResaltar)
  }, [])

  // El mapa de salas se pliega por defecto en móvil/tablet (Ramiro, 09/11 06:26: "la cabecera
  // ocupa toda la primera pantalla" — el mapa era buena parte de eso, y además los círculos se
  // salían del dibujo en pantallas estrechas). En ordenador sigue siempre abierto.
  const [mapaAbierto, setMapaAbierto] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1000)

  // Cabecera de una sola fila en móvil/tablet (Ramiro, 09/11 07:05): apodo, Log out, Ver como,
  // suscripción y el logo de "ver mapa" ya no se quedan siempre desplegados ahí — se pliegan en
  // este menú, que se abre al tocar "⋯" junto al avatar. En ordenador se ignora (CSS: siempre
  // abierto), así no hace falta duplicar nada por pantalla.
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  // Para ver en Supervisión si el gancho de "Instala Blokes" funciona — una vez por sesión,
  // no en cada navegación dentro de la app.
  useEffect(() => {
    const esStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
    if (!esStandalone || sessionStorage.getItem('_blokes_standalone_ping')) return
    sessionStorage.setItem('_blokes_standalone_ping', '1')
    fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/install-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'standalone_open' }),
    }).catch(() => {})
  }, [])

  return (
    <BrowserRouter basename={detectBasename()}>
      <div className="app">
        <VerComoBanner sd={sd} />
        <header className="app-header">
          <div className="app-header__logo-section">
            <a href="https://rocomadrid.com" >
              <img
                src="https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png"
                alt="Rocoteca Madrid"
                className="app-header__logo"
              />
            </a>
            <p className="app-header__subtitle">Boulder y entrenamiento · Roco Madrid</p>

            {sd.isLoggedIn ? (
              <>
                <div className="app-header__user">
                  {profileFetching ? (
                    <div className="app-header__avatar-placeholder" />
                  ) : (
                    <button
                      className="app-header__avatar-btn"
                      onClick={() => openProfileModal()}
                      title="Editar perfil"
                    >
                      <UserAvatar
                        size="sm"
                        avatarType={avatarType}
                        avatarData={avatarData}
                        nickname={nickname}
                        name={sd.userName}
                        isMe
                      />
                    </button>
                  )}
                  <div className="app-header__user-info">
                    <span className="app-header__user-name">{sd.userName || 'Tú'}</span>
                  </div>
                  {/* Móvil/tablet (Ramiro, 09/11 07:05): todo lo demás (apodo, Log out, Ver
                      como, suscripción, los 2 CTA) estaba siempre desplegado y por sí solo era
                      buena parte de por qué el contenido empezaba a media pantalla. En
                      ordenador sigue siempre abierto (ver CSS); este botón solo se ve en
                      móvil/tablet. */}
                  <button
                    type="button" className="app-header__menu-toggle"
                    onClick={() => setMenuMovilAbierto(v => !v)}
                    aria-label="Más opciones"
                  >⋯</button>
                </div>
                <div className={`app-header__extra${menuMovilAbierto ? ' app-header__extra--abierto' : ''}`}>
                  {!profileFetching && nickname && <span className="app-header__user-nick">@{nickname}</span>}
                  {/* Cowork, 09/11 09:05 (confirmado): en "Ver como: Tablet" se esconde — cerrar
                      sesión ahí echaría la sesión REAL de quien lo simula (socio/profe/Eva), no
                      una sesión de prueba. En la cuenta tablet real (sin simular nada) se deja
                      como siempre. */}
                  {!(sd.userRole === 'tablet' && sd.userRoleReal !== 'tablet') && (
                    <button
                      className="app-header__logout-btn"
                      onClick={() => setLogoutOpen(true)}
                    >× Log out</button>
                  )}
                  <TemaToggle />
                  {sd.userRoleReal === 'socio' && <VerComoSelector sd={sd} />}
                  {/* Profe/Eva (de verdad, o un socio viendo como Profe/Eva — se mira el rol
                      EFECTIVO para que vean exactamente el mismo botón): su único "ver como"
                      es pasar a la cuenta tablet y volver (Ramiro, 08/11 21:19).
                      🐞 Ramiro 12/11 16:30: una vez YA en modo tablet, el rol efectivo pasa a
                      ser "tablet" (no "profesor"/"gestion"), así que esta condición escondía el
                      botón entero — con él se iba también el "mantén pulsado para salir" de
                      dentro, y un profe se quedaba sin ninguna salida (a diferencia de un
                      socio, que siempre tiene el banner "Viendo como..." aparte). Se añade el
                      caso "ya estoy en tablet, entré como profe/gestión real" para que el botón
                      (ahora en su versión "salir") siga ahí. */}
                  {(['profesor', 'gestion'].includes(sd.userRole)
                    || (sd.userRole === 'tablet' && ['profesor', 'gestion'].includes(sd.userRoleReal))
                  ) && <ModoTabletToggleSimple sd={sd} />}
                  {sd.subscription && (
                    <div className="app-header__sub">
                      <span className={`app-header__sub-dot app-header__sub-dot--${sd.subscription.status === 'active' ? 'active' : 'inactive'}`} />
                      <span className="app-header__sub-name">
                        {PRODUCT_NAMES[sd.subscription.name] || sd.subscription.name || 'Suscripción'}
                        {(sd.subscription.dia || sd.subscription.horario) && (
                          <span className="app-header__sub-class">
                            {[sd.subscription.dia, sd.subscription.horario].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                      {sd.subscription.status !== 'active' && (
                        <a href={sd.subscription.renewUrl} className="app-header__renew-btn">
                          {[0,1,2,3].map(i => (
                            <span key={i} className="app-header__renew-star" style={{'--i': i}} aria-hidden="true">✦</span>
                          ))}
                          Renovar
                        </a>
                      )}
                    </div>
                  )}
                  {/* Cowork, 09/11 07:35: "Apúntate a clases/Tecnificación/Ver mapa" seguían
                      siempre desplegados debajo de la fila de arriba (~120 px) — entran aquí
                      también, dentro del mismo "⋯". */}
                  <div className="app-header__links">
                    <div className="app-header__link-wrap">
                      {sd.subscription?.status === 'active' ? (
                        <a href="https://rocomadrid.com/club/tecnificacion/" className="app-header__link app-header__link--cta">
                          Apúntate al curso de tecnificación
                        </a>
                      ) : (
                        <>
                          <span className="app-header__link-hint">¿No te salen todos los blokes que te gustaría?</span>
                          <a href="https://rocomadrid.com/club" className="app-header__link app-header__link--cta">Apúntate a clases</a>
                          <a href="https://rocomadrid.com/club/tecnificacion/" className="app-header__link app-header__link--cta app-header__link--small">
                            Tecnificación
                          </a>
                        </>
                      )}
                      <Link to="/instalar" className="app-header__link app-header__link--small">📲 Instalar la app</Link>
                    </div>
                  </div>
                  <button type="button" className="app-header__mapa-toggle" onClick={() => setMapaAbierto(v => !v)}>
                    {mapaAbierto ? 'Ocultar mapa ▴' : 'Ver mapa ▾'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <a href={buildLoginUrl(sd)} className="app-header__login-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M10 17l5-5-5-5v3H3v4h7v3z"/>
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                  Acceder
                </a>
                <TemaToggle />
                <div className="app-header__links">
                  <div className="app-header__link-wrap">
                    <span className="app-header__link-hint">¿No te salen todos los blokes que te gustaría?</span>
                    <a href="https://rocomadrid.com/club" className="app-header__link app-header__link--cta">Apúntate a clases</a>
                    <a href="https://rocomadrid.com/club/tecnificacion/" className="app-header__link app-header__link--cta app-header__link--small">
                      Tecnificación
                    </a>
                    <Link to="/instalar" className="app-header__link app-header__link--small">📲 Instalar la app</Link>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="app-header__salas-wrap">
            {mapaAbierto && <img
              src="https://rocomadrid.com/wp-content/uploads/2026/03/salas-rocomadrid-estilo-retro.png"
              alt="Salas Rocoteca Madrid"
              className="app-header__salas"
            />}
            {mapaAbierto && Object.entries(SUBSALA_POSITIONS).map(([subsala, pos]) => {
              const colorCounts = subsalaStats[subsala]
              const resaltada = subsalaResaltada === subsala
              // Durante la compe los 16 bloques son borrador (sin contar en el mapa normal) —
              // si no hay burbujas de siempre pero esta subzona SÍ se está resaltando, igual se
              // enseña un marcador, para que resaltar no se quede sin efecto visible.
              if (!colorCounts && !resaltada) return null
              return (
                <div
                  key={subsala}
                  className={`map-bubble-group${subsala === '5' ? ' map-bubble-group--5' : ''}${resaltada ? ' map-bubble-group--resaltada' : ''}`}
                  style={{ position: 'absolute', ...pos }}
                >
                  {colorCounts ? Object.entries(colorCounts).map(([color, count]) => (
                    <div
                      key={color}
                      className="map-bubble"
                      style={{ background: COLOR_BUBBLE[color]?.bg, color: COLOR_BUBBLE[color]?.text }}
                    >
                      {count}
                    </div>
                  )) : (
                    <div className="map-bubble map-bubble--marcador" />
                  )}
                </div>
              )
            })}
          </div>

          <nav className={`app-nav${navFloating ? ' app-nav--floating' : ''}${navFloating && navVisible ? ' app-nav--visible' : ''}`}>
            <ul className="app-nav__list">
              <li className="app-nav__item">
                <NavLink to="/" className="app-nav__link" end>Colección</NavLink>
              </li>
              <li className="app-nav__item">
                <NavLink to="/progreso" className="app-nav__link">Progreso</NavLink>
              </li>
              <li className="app-nav__item">
                <NavLink to="/ligas" className="app-nav__link">Ligas</NavLink>
              </li>
              <li className="app-nav__item">
                <NavLink to="/compe" className="app-nav__link">Compe</NavLink>
              </li>
              {['profesor', 'gestion', 'socio'].includes(sd.userRole) && (
                <>
                  <li className="app-nav__item">
                    <NavLink to="/entrenamientos" className="app-nav__link">Entrenamientos</NavLink>
                  </li>
                  <li className="app-nav__item">
                    <NavLink to="/tareas" className="app-nav__link">Tareas y setter</NavLink>
                  </li>
                </>
              )}
              {canEvents && (
                <li className="app-nav__item">
                  <NavLink to="/eventos" className="app-nav__link">Eventos</NavLink>
                </li>
              )}
              {canCalendar && (
                <li className="app-nav__item">
                  <NavLink to="/calendario" className="app-nav__link">Calendario</NavLink>
                </li>
              )}
              {sd.userRole === 'socio' && (
                <li className="app-nav__item">
                  <NavLink to="/superadmin" className="app-nav__link app-nav__link--super">Superadmin</NavLink>
                </li>
              )}
              {['gestion', 'socio'].includes(sd.userRole) && (
                <li className="app-nav__item">
                  <NavLink to="/supervision" className="app-nav__link app-nav__link--super">Supervisión</NavLink>
                </li>
              )}
              {sd.userRole === 'socio' && (
                <li className="app-nav__item">
                  <NavLink to="/playground" className="app-nav__link app-nav__link--super">Horarios Profes</NavLink>
                </li>
              )}
            </ul>
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/progreso" element={<ProgresoIndexPage />}>
              <Route path="comunidad" element={<ProgresoPage />} />
              <Route path="clase" element={<MiClaseTab />} />
              <Route path="yo" element={<UserStatsPage />} />
            </Route>
            <Route path="/mis-blokes" element={<Navigate to="/progreso/yo" replace />} />
            <Route path="/tareas" element={<TareasIndexPage />}>
              <Route path="crear-bloke" element={<AdminApp />} />
              <Route path="organizacion" element={<OrganizacionPage />} />
              <Route path="estadisticas" element={<StatsPage />} />
            </Route>
            <Route path="/setter" element={<Navigate to="/tareas/crear-bloke" replace />} />
            <Route path="/stats" element={<Navigate to="/tareas/estadisticas" replace />} />
            <Route path="/entrenamientos" element={<EntrenamientosPage />} />
            <Route path="/fichaje" element={<FichajePage />} />
            <Route path="/time-off" element={<TimeOffPage />} />
            <Route path="/superadmin" element={<SuperAdminPage />} />
            <Route path="/supervision" element={<SupervisionPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/ligas" element={<LeaguesPage />} />
            <Route path="/compe" element={<CompePage />} />
            <Route path="/compe/directo" element={<CompeDirectoPage />} />
            <Route path="/instalar" element={<InstalarPage />} />
            <Route path="/eventos" element={<EventosPage />} />
            <Route path="/calendario" element={<CalendarioPage />} />
            {/* Cowork, 09/11 07:45: una ruta inexistente (p. ej. /blokes/coleccion) dejaba el
                contenido en blanco — sin catch-all, react-router no renderiza nada. */}
            <Route path="*" element={<PaginaNoExiste />} />
          </Routes>
        </main>

        {logoutOpen && (
          <div className="logout-overlay" onClick={() => setLogoutOpen(false)}>
            <div className="logout-dialog" onClick={e => e.stopPropagation()}>
              <p className="logout-dialog__title">¿Cerrar sesión?</p>
              <div className="logout-dialog__actions">
                <button className="logout-dialog__cancel" onClick={() => setLogoutOpen(false)}>Cancelar</button>
                <a href={sd.logoutUrl} className="logout-dialog__confirm">Salir</a>
              </div>
            </div>
          </div>
        )}

        {sd.isLoggedIn && (
          <ProfileSetupModal
            isOpen={profileModalOpen}
            isDismissible={!profileModalBlock}
            blockingMessage={profileModalMsg}
            currentNickname={nickname}
            currentAvatarType={avatarType}
            currentAvatarData={avatarData}
            onClose={() => setProfileModalOpen(false)}
            onSaved={handleProfileSaved}
            saveProfile={saveProfile}
            checkNickname={checkNickname}
            uploadPhoto={uploadPhoto}
            optinWhatsapp={optinWhatsapp}
            saveOptinWhatsapp={saveOptinWhatsapp}
          />
        )}
      </div>
    </BrowserRouter>
  )
}

const VER_COMO_LABEL = { gestion: 'Eva (gestión)', profesor: 'Profe', tablet: 'Tablet' }

// Selector "Ver como" (Ramiro, 1/11 18:30), solo para socio — al lado de Log out. Cambiar de
// rol recarga la página: es la forma más simple de que TODA la app (decenas de sitios que leen
// `window.blokesSiteData.userRole` directamente) refleje el rol simulado sin tener que convertir
// cada uno de ellos a un estado de React.
function VerComoSelector({ sd }) {
  const actual = sd.userRole !== sd.userRoleReal ? sd.userRole : ''
  const cambiar = e => {
    const valor = e.target.value
    if (valor) setVerComo(valor); else clearVerComo()
    window.location.reload()
  }
  return (
    <select className="app-header__ver-como" value={actual} onChange={cambiar} title="Ver como">
      <option value="">Ver como: Socio</option>
      <option value="member">Ver como: Usuario</option>
      <option value="gestion">Ver como: Eva (gestión)</option>
      <option value="profesor">Ver como: Profe</option>
      <option value="tablet">Ver como: Tablet</option>
    </select>
  )
}

// Selector de tema — Ramiro, 13/11: 2 modos (claro/oscuro), sin el tercero "automático" que
// sobraba. Un solo botón que cambia de uno al otro, con el icono y el `title` del modo actual
// (cowork, 11/11 09:40: "mejor un solo botón que cambie de modo, con un title que diga el modo
// actual" — pedido cuando aún eran 3 modos, pero sigue aplicando con 2).
function TemaToggle() {
  const [tema, setTemaState] = useState(getTema)
  const cambiar = () => {
    const siguiente = tema === 'dark' ? 'light' : 'dark'
    setTema(siguiente)
    setTemaState(siguiente)
  }
  return (
    <button
      type="button" className="app-header__tema-btn"
      onClick={cambiar}
      title={tema === 'dark' ? 'Modo oscuro — toca para claro' : 'Modo claro — toca para oscuro'}
    >
      {tema === 'dark' ? '🌙' : '☀️'}
    </button>
  )
}

// Profe/Eva (Ramiro, 08/11 21:19: "el modo tablet es para que los profes puedan loguear los
// tops de los usuarios, simplemente tiene que simular como si fueses el usuario tablet") — su
// único "ver como" es pasar a la cuenta tablet (toda la app se ve como la ve ella: Colección
// con el picker "¿quién eres?", Progreso, Ligas, Compe/Recepción — nada especial, solo el rol
// efectivo cambia) y volver. Entrar es un toque; salir exige mantener pulsado 2 s, para que un
// toque suelto en el dispositivo no saque a nadie de "modo tablet" sin querer.
function ModoTabletToggleSimple({ sd }) {
  const activo = sd.userRole === 'tablet'
  const [pulsando, setPulsando] = useState(false)
  const timerRef = useRef(null)

  if (!activo) {
    return (
      <button type="button" className="app-header__ver-como" onClick={() => { setVerComo('tablet'); window.location.reload() }}>
        Modo tablet
      </button>
    )
  }

  const empezar = () => {
    setPulsando(true)
    timerRef.current = setTimeout(() => { clearVerComo(); window.location.reload() }, 2000)
  }
  const soltar = () => {
    setPulsando(false)
    clearTimeout(timerRef.current)
  }
  return (
    <button
      type="button" className="app-header__ver-como"
      onPointerDown={empezar} onPointerUp={soltar} onPointerLeave={soltar}
      style={pulsando ? { background: '#4b5563', color: '#fff' } : undefined}
    >
      {pulsando ? 'Manteniendo…' : '🔒 Modo tablet — mantén pulsado para salir'}
    </button>
  )
}

function PaginaNoExiste() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 16px' }}>
      <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12 }}>Esta página no existe.</p>
      <Link to="/" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Volver a Colección</Link>
    </div>
  )
}

function VerComoBanner({ sd }) {
  if (sd.userRoleReal !== 'socio' || sd.userRole === sd.userRoleReal) return null
  const volver = () => { clearVerComo(); window.location.reload() }
  return (
    <div className="app-ver-como-banner">
      👁 Viendo como {VER_COMO_LABEL[sd.userRole] || sd.userRole} — <button onClick={volver}>Volver a Socio</button>
    </div>
  )
}
