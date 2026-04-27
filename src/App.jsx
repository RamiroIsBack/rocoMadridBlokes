import { useState, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import MainPage from './pages/MainPage'
import AdminApp from './admin/AdminApp'
import StatsPage from './pages/StatsPage'
import { useWordPressPosts } from './hooks/useWordPressPosts'
import './App.css'

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
  const [showNav, setShowNav] = useState(false)
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
    <BrowserRouter basename="/blokes">
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
            <p className="app-header__subtitle">Problemas de búlder · Roco Madrid</p>
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
            <button
              className="app-nav-toggle"
              onClick={() => setShowNav(v => !v)}
              title="Menú"
              aria-label="Abrir menú"
            >
              🔧
            </button>
          </div>

          {showNav && (
            <nav className="app-nav">
              <ul className="app-nav__list">
                <li className="app-nav__item">
                  <Link to="/" className="app-nav__link" onClick={() => setShowNav(false)}>Colección</Link>
                </li>
                <li className="app-nav__item">
                  <Link to="/setter" className="app-nav__link">Setter</Link>
                </li>
                <li className="app-nav__item">
                  <Link to="/stats" className="app-nav__link">Estadísticas</Link>
                </li>
              </ul>
            </nav>
          )}
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/setter" element={<AdminApp />} />
            <Route path="/stats" element={<StatsPage />} />
          </Routes>
        </main>

      </div>
    </BrowserRouter>
  )
}
