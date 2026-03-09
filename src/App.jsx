import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import MainPage from './pages/MainPage'
import AdminApp from './admin/AdminApp'
import StatsPage from './pages/StatsPage'
import './App.css'

export default function App() {
  return (
    <BrowserRouter basename="/blokes">
      <div className="app">
        <header className="app-header">
          <h1 className="app-header__title">Blokes</h1>
          <p className="app-header__subtitle">Problemas de búlder &middot; Rocoteca Madrid</p>
          
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
