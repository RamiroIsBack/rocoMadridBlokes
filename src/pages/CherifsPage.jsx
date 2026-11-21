import './DashboardPage.css'

// Cherifs: dashboard de control de todo el negocio. Solo socios.
// De momento solo la estructura; el contenido se irá añadiendo poco a poco.
export default function CherifsPage() {
  if (window.blokesSiteData?.userRole !== 'socio') {
    return (
      <div className="dash__forbidden">
        <p>🔒 Acceso restringido a socios.</p>
      </div>
    )
  }

  return (
    <div className="dash">
      <header className="dash__head">
        <h1 className="dash__title">Cherifs</h1>
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
