import './DashboardPage.css'

// Cherifs › Dashboard (23/11, Álvaro): el antiguo «En construcción» de Cherifs. Cherifs es ahora
// la página que reúne todas las pestañas de Superadmin (SuperAdminPage) y esta es la primera.
// Solo el contenido: el control de acceso (solo socios) lo hace SuperAdminPage.
export default function CherifsDashboard() {
  return (
    <div className="dash">
      <header className="dash__head">
        <p className="dash__claim">Todo el negocio, bajo control</p>
        <p className="dash__intro">El panel de los socios para seguir cómo va el Roco. Lo iremos rellenando poco a poco.</p>
      </header>
      <div className="dash__grid">
        <div className="dash__card dash__card--empty">
          <span className="dash__card-icon">⭐</span>
          <span className="dash__card-title">En construcción</span>
          <span>Aquí irán los indicadores del negocio.</span>
        </div>
      </div>
    </div>
  )
}
