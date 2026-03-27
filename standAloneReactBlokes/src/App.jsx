import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import MainPage from './pages/MainPage'
import AdminApp from './admin/AdminApp'
import StatsPage from './pages/StatsPage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <div className="app-header__logo-section">
            <img 
              src="https://rocomadrid.com/wp-content/uploads/2025/12/favicon.png" 
              alt="Rocoteca Madrid" 
              className="app-header__logo"
            />
            <p className="app-header__subtitle">Problemas de búlder · Roco Madrid</p>
          </div>
          <img 
            src="https://rocomadrid.com/wp-content/uploads/2026/03/salasrocomadrid-1.png" 
            alt="Salas Rocoteca Madrid" 
            className="app-header__salas"
          />
          
          <nav className="app-nav">
            <ul className="app-nav__list">
              <li className="app-nav__item">
                <Link to="/" className="app-nav__link">Colección</Link>
              </li>
              <li className="app-nav__item">
                <Link to="/setter" className="app-nav__link">Setter</Link>
              </li>
              <li className="app-nav__item">
                <Link to="/stats" className="app-nav__link">Estadísticas</Link>
              </li>
            </ul>
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/setter" element={<AdminApp />} />
            <Route path="/stats" element={<StatsPage />} />
          </Routes>
        </main>

        <footer className="app-footer">
          <p>
            Rocoteca Madrid &mdash;{' '}
            <a href="https://rocomadrid.com" target="_blank" rel="noopener noreferrer">
              rocomadrid.com
            </a>
          </p>
        </footer>
      </div>
    </BrowserRouter>
  )
}
