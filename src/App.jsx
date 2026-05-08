import { useState, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import MainPage from './pages/MainPage'
import AdminApp from './admin/AdminApp'
import StatsPage from './pages/StatsPage'
import UserStatsPage from './pages/UserStatsPage'
import ProgresoPage from './pages/ProgresoPage'
import ProgresoIndexPage from './pages/ProgresoIndexPage'
import MiClaseTab from './pages/MiClaseTab'
import EntrenamientosPage from './pages/EntrenamientosPage'
import SuperAdminPage from './pages/SuperAdminPage'
import { useWordPressPosts } from './hooks/useWordPressPosts'
import './App.css'

const PRODUCT_NAMES = { 'Classes': 'Clases', 'Single Days': 'Días sueltos' }

const SUBSALA_POSITIONS = {
  '1': { top: '5%',   left: '50%',  transform: 'translateX(-50%)' },
  '2': { top: '5%',   left: '18%',  transform: 'translateX(-50%)' },
  '3': { top: '52%',  left: 'calc(18% + 30px)',  transform: 'translateX(-50%)' },
  '4': { top: '52%',  left: 'calc(50% + 10px)',  transform: 'translateX(-50%)' },
  '5': { bottom: '5%', right: 'calc(18% + 80px)', transform: 'translateX(50%)' },
  '6': { bottom: '5%', left: 'calc(50% - 20px)', transform: 'translateX(-50%)' },
  '7': { bottom: '5%', left: '18%', transform: 'translateX(-50%)' },
  '8': { top: 'calc(52% - 15px)',  right: '18%', transform: 'translateX(50%)' },
}

const COLOR_BUBBLE = {
  green:  { bg: '#22c55e', text: '#fff' },
  blue:   { bg: '#3b82f6', text: '#fff' },
  yellow: { bg: '#eab308', text: '#1a1a1a' },
  red:    { bg: '#ef4444', text: '#fff' },
  black:  { bg: '#1f2937', text: '#fff' },
  blanco: { bg: '#e5e7eb', text: '#1f2937' },
}

export default function App() {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const sd = window.blokesSiteData || {}
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

  return (
    <BrowserRouter basename={import.meta.env.VITE_ROUTER_BASENAME || '/blokes'}>
      <div className="app">
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
                  <span className="app-header__user-name">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="12" cy="8" r="3.5"/>
                      <path d="M12 13.5c-3.5 0-7 1.75-7 3.5V19h14v-2c0-1.75-3.5-3.5-7-3.5z"/>
                    </svg>
                    {sd.userName || 'Tú'}
                  </span>
                  <button
                    className="app-header__user-x"
                    onClick={() => setLogoutOpen(true)}
                    aria-label="Cerrar sesión"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <line x1="1" y1="1" x2="7" y2="7"/>
                      <line x1="7" y1="1" x2="1" y2="7"/>
                    </svg>
                  </button>
                </div>
                {sd.subscription && (
                  <div className="app-header__sub">
                    <span className={`app-header__sub-dot app-header__sub-dot--${sd.subscription.status === 'active' ? 'active' : 'inactive'}`} />
                    <span className="app-header__sub-name">
                      {PRODUCT_NAMES[sd.subscription.name] || sd.subscription.name || 'Suscripción'}
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
              </>
            ) : (
              <a href={sd.loginUrl} className="app-header__login-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M10 17l5-5-5-5v3H3v4h7v3z"/>
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                </svg>
                Acceder
              </a>
            )}
            <div className="app-header__links">
              <div className="app-header__link-wrap">
                <span className="app-header__link-hint">Explora el resto de la web</span>
                <a href="https://rocomadrid.com" className="app-header__link">rocomadrid.com</a>
              </div>
              <div className="app-header__link-wrap">
                <span className="app-header__link-hint">¿No te salen todos los blokes que te gustaría?</span>
                <a href="https://rocomadrid.com/club" className="app-header__link app-header__link--cta">Apúntate a clases</a>
              </div>
            </div>
          </div>

          <div className="app-header__salas-wrap">
            <img
              src="https://rocomadrid.com/wp-content/uploads/2026/03/salas-rocomadrid-estilo-retro.png"
              alt="Salas Rocoteca Madrid"
              className="app-header__salas"
            />
            {Object.entries(SUBSALA_POSITIONS).map(([subsala, pos]) => {
              const colorCounts = subsalaStats[subsala]
              if (!colorCounts) return null
              return (
                <div key={subsala} className={`map-bubble-group${subsala === '5' ? ' map-bubble-group--5' : ''}`} style={{ position: 'absolute', ...pos }}>
                  {Object.entries(colorCounts).map(([color, count]) => (
                    <div
                      key={color}
                      className="map-bubble"
                      style={{ background: COLOR_BUBBLE[color]?.bg, color: COLOR_BUBBLE[color]?.text }}
                    >
                      {count}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          <nav className="app-nav">
            <ul className="app-nav__list">
              <li className="app-nav__item">
                <Link to="/" className="app-nav__link">Colección</Link>
              </li>
              <li className="app-nav__item">
                <Link to="/progreso" className="app-nav__link">Progreso</Link>
              </li>
              {(sd.userRole === 'admin' || sd.userRole === 'superadmin') && (
                <>
                  <li className="app-nav__item">
                    <Link to="/entrenamientos" className="app-nav__link">Entrenamientos</Link>
                  </li>
                  <li className="app-nav__item">
                    <Link to="/setter" className="app-nav__link">Setter</Link>
                  </li>
                  <li className="app-nav__item">
                    <Link to="/stats" className="app-nav__link">Estadísticas</Link>
                  </li>
                </>
              )}
              {sd.userRole === 'superadmin' && (
                <li className="app-nav__item">
                  <Link to="/superadmin" className="app-nav__link app-nav__link--super">Superadmin</Link>
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
            <Route path="/setter" element={<AdminApp />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/entrenamientos" element={<EntrenamientosPage />} />
            <Route path="/superadmin" element={<SuperAdminPage />} />
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
      </div>
    </BrowserRouter>
  )
}
