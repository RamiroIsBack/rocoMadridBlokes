import './AdminLogin.css'

export default function AdminLogin({ mode = 'setter' }) {
  const sd = window.blokesSiteData || {}
  const title = mode === 'setter' ? 'Zona Setter' : mode === 'entrenamientos' ? 'Entrenamientos' : 'Estadísticas'

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <h1 className="admin-login__title">{title}</h1>
        <p className="admin-login__subtitle">Esta sección requiere permisos de administrador.</p>
        {sd.loginUrl && (
          <a href={sd.loginUrl} className="admin-login__submit">Iniciar sesión</a>
        )}
      </div>
    </div>
  )
}
