import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useCompletions } from '../hooks/useCompletions'
import { useClassProgress } from '../hooks/useClassProgress'
import './ProgresoIndexPage.css'

export default function ProgresoIndexPage() {
  const { isLoggedIn, loginUrl } = useCompletions()
  const { data: classData, loading: classLoading } = useClassProgress(isLoggedIn)
  const location = useLocation()

  // Redirect /progreso → /progreso/comunidad
  if (location.pathname === '/progreso' || location.pathname === '/progreso/') {
    return <Navigate to="/progreso/comunidad" replace />
  }

  const hasClases = classLoading || !!classData?.class
  // Tab is "locked" visually when logged in but no directed-class subscription found yet
  const claseLocked = isLoggedIn && !classLoading && !hasClases

  return (
    <div className="progreso-idx">
      <nav className="progreso-idx__tabs">
        <NavLink to="/progreso/comunidad" className="progreso-idx__tab">
          Comunidad
        </NavLink>

        <NavLink
          to="/progreso/clase"
          className={`progreso-idx__tab ${claseLocked ? 'progreso-idx__tab--locked' : ''} ${!isLoggedIn ? 'progreso-idx__tab--locked' : ''}`}
        >
          Mi clase {(claseLocked || !isLoggedIn) && <span className="progreso-idx__tab-lock">🔒</span>}
        </NavLink>

        <NavLink to="/progreso/yo" className="progreso-idx__tab">
          Yo
        </NavLink>
      </nav>

      <div className="progreso-idx__content">
        <Outlet context={{ isLoggedIn, loginUrl, classData, hasClases }} />
      </div>
    </div>
  )
}
