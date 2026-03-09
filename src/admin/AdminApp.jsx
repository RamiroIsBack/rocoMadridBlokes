import { useState, useEffect } from 'react'
import { useWordPressAuth } from '../hooks/useWordPressAuth'
import AdminLogin from './AdminLogin'
import BlokeForm from './BlokeForm'
import './AdminApp.css'

export default function AdminApp() {
  const { isAuthenticated, isValidating, logout } = useWordPressAuth()
  const [showLogin, setShowLogin] = useState(true)

  useEffect(() => {
    if (isAuthenticated) {
      setShowLogin(false)
    }
  }, [isAuthenticated])

  const handleLoginSuccess = () => {
    setShowLogin(false)
  }

  const handleLogout = () => {
    logout()
    setShowLogin(true)
  }

  if (isValidating) {
    return (
      <div className="admin-app admin-app--loading">
        <div className="admin-app__loading-spinner"></div>
        <p>Verificando autenticación...</p>
      </div>
    )
  }

  return (
    <div className="admin-app">
      {showLogin ? (
        <AdminLogin onLogin={handleLoginSuccess} />
      ) : (
        <div className="admin-app__main">
          <header className="admin-app__header">
            <div className="admin-app__header-content">
              <h1>Panel de Administración - Blokes</h1>
              <p>Gestiona los problemas de búlder de Rocoteca Madrid</p>
            </div>
            <button 
              onClick={handleLogout}
              className="admin-app__logout-btn"
            >
              Cerrar sesión
            </button>
          </header>

          <main className="admin-app__content">
            <div className="admin-app__sidebar">
              <nav className="admin-app__nav">
                <ul>
                  <li>
                    <a href="#crear" className="admin-app__nav-link admin-app__nav-link--active">
                      Crear nuevo Bloke
                    </a>
                  </li>
                  <li>
                    <a href="#listar" className="admin-app__nav-link">
                      Ver Blokes existentes
                    </a>
                  </li>
                  <li>
                    <a href="#estadisticas" className="admin-app__nav-link">
                      Estadísticas
                    </a>
                  </li>
                </ul>
              </nav>
              
              <div className="admin-app__info">
                <h3>Información</h3>
                <p>
                  Cada Bloke requiere:
                </p>
                <ul>
                  <li>Título (20 caracteres)</li>
                  <li>Descripción (300 caracteres)</li>
                  <li>Categoría</li>
                  <li>1-3 imágenes</li>
                </ul>
                <p>
                  Las imágenes se suben directamente a WordPress y se almacenan en SiteGround.
                </p>
              </div>
            </div>

            <div className="admin-app__main-content">
              <BlokeForm />
            </div>
          </main>

          <footer className="admin-app__footer">
            <p>
              Rocoteca Madrid Admin &middot; 
              <a href="/blokes" target="_blank" rel="noopener noreferrer">
                Ver sitio público
              </a>
            </p>
          </footer>
        </div>
      )}
    </div>
  )
}
