import { useState } from 'react'
import './AdminLogin.css'

// Simple password (hardcoded as requested)
const PASSWORD = 'settingforfun'

export default function AdminLogin({ onLogin, mode = 'setter' }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
    // Check password
    if (password === PASSWORD) {
      if (onLogin) onLogin()
      setIsLoading(false)
      return
    }
    
    setError('Contraseña incorrecta')
    setIsLoading(false)
  }

  const title = mode === 'setter' ? 'Zona Setter' : 'Estadísticas'
  const subtitle = mode === 'setter' 
    ? 'Introduce la contraseña para acceder'
    : 'Introduce la contraseña para acceder a las estadísticas'

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <h1 className="admin-login__title">{title}</h1>
        <p className="admin-login__subtitle">
          {subtitle}
        </p>

        <form onSubmit={handleSubmit} className="admin-login__form">
          <div className="admin-login__field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={isLoading}
              autoFocus
            />
          </div>

          {error && (
            <div className="admin-login__error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="admin-login__submit"
            disabled={isLoading || !password}
          >
            {isLoading ? 'Verificando...' : 'Acceder'}
          </button>
        </form>

      </div>
    </div>
  )
}
