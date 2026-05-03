import { useState, useEffect, useCallback } from 'react'
import AdminLogin from '../admin/AdminLogin'
import './EntrenamientosPage.css'

const SESSION_KEY = 'blokes_auth'
const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

const EMPTY_FILTERS = { frecuencia: '', dia: '', turno: '', edad: '', horario: '', status: 'active' }
const FRECUENCIA_LABEL = { single: '1 día/semana', classes: '2 días/semana' }
const ORDEN_DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Lunes-Miércoles','Martes-Jueves']

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

// Filter clases list by current filters, optionally excluding one key
function applyClaseFilters(clases, filters, exclude) {
  return clases.filter(c => {
    if (exclude !== 'frecuencia' && filters.frecuencia && c.tipo    !== filters.frecuencia) return false
    if (exclude !== 'dia'        && filters.dia        && c.dia     !== filters.dia)        return false
    if (exclude !== 'turno'      && filters.turno      && c.turno   !== filters.turno)      return false
    if (exclude !== 'edad'       && filters.edad       && c.edad    !== filters.edad)       return false
    if (exclude !== 'horario'    && filters.horario    && c.horario !== filters.horario)    return false
    return true
  })
}

function distinct(clases, key) {
  const seen = new Set()
  const result = []
  clases.forEach(c => {
    if (c[key] && !seen.has(c[key])) { seen.add(c[key]); result.push(c[key]) }
  })
  return result
}

function sortDias(dias) {
  return [...dias].sort((a, b) => {
    const pa = ORDEN_DIAS.indexOf(a), pb = ORDEN_DIAS.indexOf(b)
    return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb)
  })
}

export default function EntrenamientosPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!(window.blokesSiteData?.isLoggedIn) || !!localStorage.getItem(SESSION_KEY)
  )
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [allClases, setAllClases] = useState([])
  const [alumnos, setAlumnos] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) return
    fetch(`${CLUB_URL}/wp-json/progreso/v1/clases`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.clases) setAllClases(json.data.clases) })
      .catch(() => {})
  }, [isAuthenticated])

  const fetchAlumnos = useCallback(async (currentFilters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      Object.entries(currentFilters).forEach(([k, v]) => { if (v) params.set(k, v) })

      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos?${params}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
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
    let next = { ...filters, [key]: value }

    // Cascade-validate: reset any filter whose current value is no longer available
    const cascadeKeys = ['dia', 'turno', 'edad', 'horario']
    cascadeKeys.forEach(field => {
      if (!next[field] || field === key) return
      const available = distinct(applyClaseFilters(allClases, next, field), field)
      if (!available.includes(next[field])) next = { ...next, [field]: '' }
    })

    setFilters(next)
    fetchAlumnos(next)
  }

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS)
    fetchAlumnos(EMPTY_FILTERS)
  }

  // Compute available options for each dropdown based on other active filters
  const diaOptions     = sortDias(distinct(applyClaseFilters(allClases, filters, 'dia'), 'dia'))
  const turnoOptions   = distinct(applyClaseFilters(allClases, filters, 'turno'), 'turno').sort()
  const edadOptions    = distinct(applyClaseFilters(allClases, filters, 'edad'), 'edad').sort()
  const horarioOptions = distinct(applyClaseFilters(allClases, filters, 'horario'), 'horario').sort()

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
            <label>Frecuencia</label>
            <select value={filters.frecuencia} onChange={e => handleFilterChange('frecuencia', e.target.value)}>
              <option value="">Todos</option>
              <option value="single">1 día/semana</option>
              <option value="classes">2 días/semana</option>
            </select>
          </div>
          <div className="entrena__filter-field">
            <label>Día</label>
            <select value={filters.dia} onChange={e => handleFilterChange('dia', e.target.value)}>
              <option value="">Todos</option>
              {diaOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="entrena__filter-field">
            <label>Turno</label>
            <select value={filters.turno} onChange={e => handleFilterChange('turno', e.target.value)}>
              <option value="">Todos</option>
              {turnoOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="entrena__filter-field">
            <label>Edad</label>
            <select value={filters.edad} onChange={e => handleFilterChange('edad', e.target.value)}>
              <option value="">Todos</option>
              {edadOptions.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div className="entrena__filter-field">
            <label>Horario</label>
            <select value={filters.horario} onChange={e => handleFilterChange('horario', e.target.value)}>
              <option value="">Todos</option>
              {horarioOptions.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="entrena__filter-field">
            <label>Estado</label>
            <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
              <option value="active">Activo</option>
              <option value="all">Todos</option>
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
                <th>Frecuencia</th>
                <th>Día</th>
                <th>Horario</th>
                <th>Turno</th>
                <th>Edad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map((a, i) => (
                <tr key={a.id ?? i}>
                  <td>{a.cliente || a.nombre || '—'}</td>
                  <td>{a.email || '—'}</td>
                  <td>{FRECUENCIA_LABEL[a.frecuencia] || a.producto || '—'}</td>
                  <td>{a.dia || '—'}</td>
                  <td>{a.horario || '—'}</td>
                  <td>{a.turno || '—'}</td>
                  <td>{a.edad || '—'}</td>
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
