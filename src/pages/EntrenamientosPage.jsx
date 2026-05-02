import { useState, useEffect, useCallback } from 'react'
import AdminLogin from '../admin/AdminLogin'
import { getAuthHeader } from '../hooks/useWordPressPosts'
import './EntrenamientosPage.css'

const SESSION_KEY = 'blokes_auth'
const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

const EMPTY_FILTERS = { horario: '', edad: '', producto: '', turno: '', status: 'active' }

export default function EntrenamientosPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem(SESSION_KEY))
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [alumnos, setAlumnos] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchAlumnos = useCallback(async (currentFilters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      Object.entries(currentFilters).forEach(([k, v]) => { if (v) params.set(k, v) })

      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos?${params}`, {
        headers: { 'Authorization': getAuthHeader() },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }

      const json = await res.json()
      const data = json.data || json
      setAlumnos(data.alumnos || [])
      setTotal(data.total ?? (data.alumnos?.length ?? 0))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) fetchAlumnos(filters)
  }, [isAuthenticated, fetchAlumnos])

  const handleFilterChange = (key, value) => {
    const next = { ...filters, [key]: value }
    setFilters(next)
    fetchAlumnos(next)
  }

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS)
    fetchAlumnos(EMPTY_FILTERS)
  }

  if (!isAuthenticated) {
    return (
      <AdminLogin
        mode="entrenamientos"
        onLogin={() => {
          localStorage.setItem(SESSION_KEY, 'true')
          setIsAuthenticated(true)
        }}
      />
    )
  }

  return (
    <div className="entrena">
      <div className="entrena__header">
        <h1>Entrenamientos</h1>
        {!loading && <p className="entrena__subtitle">{total} alumno{total !== 1 ? 's' : ''}</p>}
      </div>

      <div className="entrena__filters">
        <div className="entrena__filters-row">
          <div className="entrena__filter-field">
            <label>Horario</label>
            <input
              type="text"
              value={filters.horario}
              onChange={e => handleFilterChange('horario', e.target.value)}
              placeholder="Ej: Lunes 18:00"
            />
          </div>
          <div className="entrena__filter-field">
            <label>Turno</label>
            <input
              type="text"
              value={filters.turno}
              onChange={e => handleFilterChange('turno', e.target.value)}
              placeholder="Turno"
            />
          </div>
          <div className="entrena__filter-field">
            <label>Edad</label>
            <input
              type="text"
              value={filters.edad}
              onChange={e => handleFilterChange('edad', e.target.value)}
              placeholder="Edad"
            />
          </div>
          <div className="entrena__filter-field">
            <label>Producto</label>
            <input
              type="text"
              value={filters.producto}
              onChange={e => handleFilterChange('producto', e.target.value)}
              placeholder="Suscripción"
            />
          </div>
          <div className="entrena__filter-field">
            <label>Estado</label>
            <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
              <option value="active">Activo</option>
              <option value="">Todos</option>
            </select>
          </div>
        </div>
        <button className="entrena__reset" onClick={resetFilters}>Limpiar filtros</button>
      </div>

      {error && <p className="entrena__error">Error: {error}</p>}

      {loading ? (
        <div className="entrena__loading">
          <div className="entrena__spinner" />
          <p>Cargando alumnos...</p>
        </div>
      ) : alumnos.length === 0 ? (
        <div className="entrena__empty">
          <p className="entrena__empty-title">Sin alumnos registrados</p>
          <p className="entrena__empty-hint">Cuando un alumno contrate una suscripción activa aparecerá aquí.</p>
        </div>
      ) : (
        <div className="entrena__table-wrap">
          <table className="entrena__table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Horario</th>
                <th>Turno</th>
                <th>Edad</th>
                <th>Producto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map((a, i) => (
                <tr key={a.id ?? i}>
                  <td>{a.nombre || a.display_name || a.name || '—'}</td>
                  <td>{a.email || '—'}</td>
                  <td>{a.horario || '—'}</td>
                  <td>{a.turno || '—'}</td>
                  <td>{a.edad || '—'}</td>
                  <td>{a.producto || '—'}</td>
                  <td>
                    <span className={`entrena__badge entrena__badge--${a.status || 'active'}`}>
                      {a.status || 'active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
