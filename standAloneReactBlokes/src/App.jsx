import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import MainPage from './pages/MainPage'
import AdminApp from './admin/AdminApp'
import StatsPage from './pages/StatsPage'
import './App.css'

export default function App() {
  const [showNav, setShowNav] = useState(false)

  return (
    <BrowserRouter basename="/">
      <div className="app">
        <header className="app-header">
          <div className="app-header__logo-section">
            <img
              src="https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png"
              alt="Rocoteca Madrid"
              className="app-header__logo"
            />
            <p className="app-header__subtitle">Problemas de búlder · Roco Madrid</p>
          </div>

          <div className="app-header__salas-wrap">
            <img
              src="https://rocomadrid.com/wp-content/uploads/2026/03/salas-rocomadrid-estilo-retro.png"
              alt="Salas Rocoteca Madrid"
              className="app-header__salas"
            />
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
