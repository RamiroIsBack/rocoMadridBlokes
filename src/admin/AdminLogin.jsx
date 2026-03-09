import { useState } from 'react'
import { useWordPressAuth } from '../hooks/useWordPressAuth'
import './AdminLogin.css'

export default function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useWordPressAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    const result = await login(username, password)
    
    if (result.success) {
      if (onLogin) onLogin()
    } else {
      setError(result.error || 'Credenciales incorrectas')
    }
    
    setIsLoading(false)
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <h1 className="admin-login__title">Admin Blokes</h1>
        <p className="admin-login__subtitle">
          Inicia sesión con tus credenciales de WordPress
        </p>

        <form onSubmit={handleSubmit} className="admin-login__form">
          <div className="admin-login__field">
            <label htmlFor="username">Usuario de WordPress</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="nombredeusuario"
              required
              disabled={isLoading}
            />
          </div>

          <div className="admin-login__field">
            <label htmlFor="password">Contraseña de aplicación</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
            <small className="admin-login__help">
              Usa una "Application Password" generada en tu perfil de WordPress
            </small>
          </div>

          {error && (
            <div className="admin-login__error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="admin-login__submit"
            disabled={isLoading || !username || !password}
          >
            {isLoading ? 'Verificando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="admin-login__instructions">
          <h3>¿Cómo obtener una Application Password?</h3>
          <ol>
            <li>Ve a tu WordPress Admin → Usuarios → Tu perfil</li>
            <li>Desplázate a "Application Passwords"</li>
            <li>Escribe un nombre (ej: "react-admin") y haz clic en "Add New Application Password"</li>
            <li>Copia la contraseña generada (aparece solo una vez)</li>
            <li>Pégala aquí junto con tu nombre de usuario</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
