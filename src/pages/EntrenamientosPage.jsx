import { useState, useEffect, useCallback, Fragment } from 'react'
import TrainingPanel from '../components/TrainingPanel'
import { useUserTraining } from '../hooks/useTraining'
import { ZONES, TESTS as TEST_MAP } from '../components/BodyDiagram'
import '../admin/AdminLogin.css'
import './EntrenamientosPage.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

const EMPTY_FILTERS = { frecuencia: '', dia: '', turno: '', edad: '', horario: '', status: 'active' }
const FRECUENCIA_LABEL = { single: '1 día/semana', classes: '2 días/semana' }
const ORDEN_DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Lunes-Miércoles','Martes-Jueves']

// Test list matching TrainingPanel
const TESTS_LIST = [1, 2, 3, 4, 5, 6]

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

function diaMatches(claDia, filterDia) {
  if (!filterDia) return true
  if (!claDia) return false
  if (claDia === filterDia) return true
  // Single-day filter matches combined schedules containing that day
  if (!filterDia.includes('-')) return claDia.split('-').includes(filterDia)
  return false
}

function applyClaseFilters(clases, filters, exclude) {
  return clases.filter(c => {
    if (exclude !== 'frecuencia' && filters.frecuencia && c.tipo    !== filters.frecuencia) return false
    if (exclude !== 'dia'        && !diaMatches(c.dia, exclude === 'dia' ? '' : filters.dia)) return false
    if (exclude !== 'turno'      && filters.turno      && c.turno   !== filters.turno)      return false
    if (exclude !== 'edad'       && filters.edad       && c.edad    !== filters.edad)       return false
    if (exclude !== 'horario'    && filters.horario    && c.horario !== filters.horario)    return false
    return true
  })
}
function distinct(clases, key) {
  const seen = new Set(), result = []
  clases.forEach(c => { if (c[key] && !seen.has(c[key])) { seen.add(c[key]); result.push(c[key]) } })
  return result
}
function sortDias(dias) {
  return [...dias].sort((a, b) => {
    const pa = ORDEN_DIAS.indexOf(a), pb = ORDEN_DIAS.indexOf(b)
    return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb)
  })
}
function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
}

// ─── Per-student row in Test mode ───────────────────────────────────
function TestModeRow({ alumno, testId }) {
  const { history, loading, logTraining, updateTraining, reload } = useUserTraining(alumno.user_id)
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [err, setErr]       = useState(null)

  const entries  = history[testId] || []
  const last     = entries[entries.length - 1]
  const editable = last?.logged_at?.startsWith(currentMonth())

  useEffect(() => {
    if (last?.value_kg != null) setValue(String(last.value_kg))
  }, [last?.value_kg])

  const handleSave = async () => {
    const val = parseFloat(value)
    if (!val || val <= 0) { setErr('Introduce un valor'); return }
    setErr(null); setSaving(true)
    try {
      if (last && editable) {
        await updateTraining(last.id, val)
      } else {
        await logTraining(alumno.user_id, testId, val)
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000); reload()
    } catch (e) { setErr(e.message || 'Error') }
    finally { setSaving(false) }
  }

  return (
    <tr className="entrena__test-row">
      <td className="entrena__test-row__name">{alumno.cliente || alumno.nombre || '—'}</td>
      <td className="entrena__test-row__meta">{alumno.dia} · {alumno.horario}</td>
      <td className="entrena__test-row__last">
        {loading ? <span className="entrena__test-loading">…</span>
          : last ? <span title={formatDate(last.logged_at)}>{last.value_kg} kg{editable ? '' : ' ·hist'}</span>
          : <span className="entrena__test-empty">—</span>
        }
      </td>
      <td className="entrena__test-row__input">
        <div className="entrena__test-input-wrap">
          <input
            type="number" step="0.5" min="0"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="kg"
            className="entrena__test-input"
          />
          <button
            className={`entrena__test-save${saved ? ' entrena__test-save--ok' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >{saving ? '…' : saved ? '✓' : 'OK'}</button>
        </div>
        {err && <p className="entrena__test-err">{err}</p>}
      </td>
    </tr>
  )
}

// ─── Main page ───────────────────────────────────────────────────────
export default function EntrenamientosPage() {
  const isAuthenticated = ['admin', 'superadmin'].includes(window.blokesSiteData?.userRole)
  const [viewMode, setViewMode]         = useState('alumno') // 'alumno' | 'test'
  const [filters, setFilters]           = useState(EMPTY_FILTERS)
  const [allClases, setAllClases]       = useState([])
  const [selectedAlumno, setSelectedAlumno] = useState(null)
  const [selectedTest, setSelectedTest] = useState(1)
  const [alumnos, setAlumnos]           = useState([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)

  useEffect(() => {
    if (!isAuthenticated) return
    fetch(`${CLUB_URL}/wp-json/progreso/v1/clases`, { credentials: 'include', headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.clases) setAllClases(json.data.clases) })
      .catch(() => {})
  }, [isAuthenticated])

  const fetchAlumnos = useCallback(async (currentFilters) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      Object.entries(currentFilters).forEach(([k, v]) => { if (v) params.set(k, v) })
      const res  = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos?${params}`, {
        credentials: 'include', headers: getAuthHeaders(),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `HTTP ${res.status}`) }
      const json = await res.json()
      const data = json.data || json
      setAlumnos(data.alumnos || [])
      setTotal(data.total ?? (data.alumnos?.length ?? 0))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (isAuthenticated) fetchAlumnos(filters) }, [isAuthenticated, fetchAlumnos])

  const handleFilterChange = (key, value) => {
    let next = { ...filters, [key]: value }
    const cascadeKeys = ['dia', 'turno', 'edad', 'horario']
    cascadeKeys.forEach(field => {
      if (!next[field] || field === key) return
      const available = distinct(applyClaseFilters(allClases, next, field), field)
      if (!available.includes(next[field])) next = { ...next, [field]: '' }
    })
    setFilters(next); fetchAlumnos(next)
  }
  const resetFilters = () => { setFilters(EMPTY_FILTERS); fetchAlumnos(EMPTY_FILTERS) }

  const diaOptions     = sortDias(distinct(applyClaseFilters(allClases, filters, 'dia'), 'dia'))
  const turnoOptions   = distinct(applyClaseFilters(allClases, filters, 'turno'), 'turno').sort()
  const edadOptions    = distinct(applyClaseFilters(allClases, filters, 'edad'), 'edad').sort()
  const horarioOptions = distinct(applyClaseFilters(allClases, filters, 'horario'), 'horario').sort()

  if (!isAuthenticated) {
    const sd = window.blokesSiteData || {}
    return (
      <div className="admin-login">
        <div className="admin-login__card">
          <h1 className="admin-login__title">Entrenamientos</h1>
          <p className="admin-login__subtitle">Esta sección requiere permisos de administrador.</p>
          {sd.loginUrl && (
            <a href={sd.loginUrl} className="admin-login__submit">Iniciar sesión</a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="entrena">
      <div className="entrena__header">
        <h1>Entrenamientos</h1>
        {!loading && <p className="entrena__subtitle">{total} alumno{total !== 1 ? 's' : ''}</p>}
      </div>

      {/* View mode toggle */}
      <div className="entrena__mode-toggle">
        <button
          className={`entrena__mode-btn${viewMode === 'alumno' ? ' entrena__mode-btn--active' : ''}`}
          onClick={() => setViewMode('alumno')}
        >Por alumno</button>
        <button
          className={`entrena__mode-btn${viewMode === 'test' ? ' entrena__mode-btn--active' : ''}`}
          onClick={() => setViewMode('test')}
        >Por test</button>
      </div>

      {/* Test selector (only in test mode) */}
      {viewMode === 'test' && (
        <div className="entrena__test-selector">
          {TESTS_LIST.map(tid => {
            const zone  = TEST_MAP[tid]?.zone || 'lower'
            const color = ZONES[zone]?.color || '#888'
            return (
              <button
                key={tid}
                className={`entrena__test-pill${selectedTest === tid ? ' entrena__test-pill--active' : ''}`}
                style={{ '--zone-color': color }}
                onClick={() => setSelectedTest(tid)}
              >
                {TEST_MAP[tid]?.label || `Test ${tid}`}
                <span className="entrena__test-pill__zone">{ZONES[zone]?.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="entrena__filters">
        <div className="entrena__filters-row">
          {[
            { key: 'frecuencia', label: 'Frecuencia', opts: [{ v: 'single', l: '1 día/semana' }, { v: 'classes', l: '2 días/semana' }] },
          ].map(({ key, label, opts }) => (
            <div key={key} className="entrena__filter-field">
              <label>{label}</label>
              <select value={filters[key]} onChange={e => handleFilterChange(key, e.target.value)}>
                <option value="">Todos</option>
                {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          ))}
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
      ) : viewMode === 'test' ? (

        /* ── TEST MODE ── */
        <div className="entrena__table-wrap">
          <table className="entrena__table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Clase</th>
                <th>Último valor</th>
                <th>Actualizar</th>
              </tr>
            </thead>
            <tbody>
              {alumnos
                .filter(a => a.user_id)
                .map((a, i) => <TestModeRow key={a.id ?? i} alumno={a} testId={selectedTest} />)
              }
            </tbody>
          </table>
        </div>

      ) : (

        /* ── ALUMNO MODE ── */
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
              {alumnos.map((a, i) => {
                const isSelected = selectedAlumno?.id === a.id
                return (
                  <Fragment key={a.id ?? i}>
                    <tr
                      className={`entrena__row${isSelected ? ' entrena__row--active' : ''}`}
                      onClick={() => setSelectedAlumno(isSelected ? null : a)}
                    >
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
                    {isSelected && (
                      <tr className="entrena__inline-panel">
                        <td colSpan={8}>
                          <TrainingPanel
                            alumno={a}
                            onClose={() => setSelectedAlumno(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
