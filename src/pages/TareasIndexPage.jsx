import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import './TareasIndexPage.css'

export default function TareasIndexPage() {
  const location = useLocation()

  // Redirect /tareas → /tareas/crear-bloke
  if (location.pathname === '/tareas' || location.pathname === '/tareas/') {
    return <Navigate to="/tareas/crear-bloke" replace />
  }

  return (
    <div className="tareas-idx">
      <nav className="tareas-idx__tabs">
        <NavLink to="/tareas/crear-bloke" className="tareas-idx__tab">Crear bloke</NavLink>
        <NavLink to="/tareas/organizacion" className="tareas-idx__tab">Organización</NavLink>
        <NavLink to="/tareas/estadisticas" className="tareas-idx__tab">Estadísticas</NavLink>
      </nav>
      <div className="tareas-idx__content">
        <Outlet />
      </div>
    </div>
  )
}
