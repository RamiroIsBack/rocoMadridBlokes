import { useState, useEffect, useCallback, Fragment } from 'react'
import TrainingPanel from '../components/TrainingPanel'
import { useAlumnoTraining } from '../hooks/useTraining'
import { ZONES, TESTS as TEST_MAP } from '../components/BodyDiagram'
import '../admin/AdminLogin.css'
import './EntrenamientosPage.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

const EMPTY_FILTERS = { frecuencia: '', dia: '', turno: '', edad: '', horario: '', status: 'all' }
const FRECUENCIA_LABEL = { single: '1 día/semana', classes: '2 días/semana' }
const ORDEN_DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Lunes-Miércoles','Martes-Jueves']

const TESTS_LIST = Object.values(ZONES).flatMap(z => z.tests).filter(tid => TEST_MAP[tid]?.visible !== false)

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
// Same user_id can show up more than once (several subscriptions — e.g. an
// old on-hold one plus the current active one): collapse those into a single
// row, preferring the active subscription as the one shown. Different real
// people who just happen to share a name are NOT merged — placeholder_id
// rows (manual alumnos) are never merged into anything either.
function consolidateAlumnos(list) {
  const byUser = new Map()
  const result = []
  for (const a of list) {
    if (!a.user_id || a.placeholder_id) { result.push(a); continue }
    const existing = byUser.get(a.user_id)
    if (!existing) {
      byUser.set(a.user_id, a)
      result.push(a)
    } else if (a.status === 'active' && existing.status !== 'active') {
      result[result.indexOf(existing)] = a
      byUser.set(a.user_id, a)
    }
  }
  return result
}

const SUGGEST_STATUS = {
  active: 'activo', cancelled: 'cancelado', 'on-hold': 'en pausa', pending: 'manual',
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
function TestModeRow({ alumno, testId, ambiguousActive }) {
  const { history, loading, logTraining, logTrainingConfirmed, updateTraining, reload } = useAlumnoTraining(alumno)
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
    if (isNaN(val) || val < 0) { setErr('Introduce un valor'); return }
    setErr(null); setSaving(true)
    try {
      const unit = TEST_MAP[testId]?.unit || ''
      if (last && editable) {
        if (val !== last.value_kg && !window.confirm(`Ya hay un registro de este test este mes: ${last.value_kg} ${unit}.\n\n¿Sobreescribirlo con ${val} ${unit}?`)) return
        await updateTraining(last.id, val)
      } else {
        if ((await logTrainingConfirmed(testId, val, unit)) === null) return
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000); reload()
    } catch (e) { setErr(e.message || 'Error') }
    finally { setSaving(false) }
  }

  return (
    <tr className="entrena__test-row">
      <td className="entrena__test-row__name">
        {alumno.cliente || alumno.nombre || '—'}
        {ambiguousActive && <span className="entrena__active-tag" title="Hay varias personas con este nombre — esta es la que tiene suscripción activa">activo ahora</span>}
        {alumno.is_placeholder && <span className="entrena__manual-tag" title="Alumno manual, sin cuenta vinculada">manual</span>}
      </td>
      <td className="entrena__test-row__meta">{alumno.dia} · {alumno.horario}</td>
      <td className="entrena__test-row__last">
        {loading ? <span className="entrena__test-loading">…</span>
          : last ? <span title={formatDate(last.logged_at)}>{last.value_kg} {TEST_MAP[testId]?.unit || 'kg'}{editable ? '' : ' ·hist'}</span>
          : <span className="entrena__test-empty">—</span>
        }
      </td>
      <td className="entrena__test-row__input">
        <div className="entrena__test-input-wrap">
          <input
            type="number"
            step={TEST_MAP[testId]?.unit === 'reps' || TEST_MAP[testId]?.unit === 'series' ? '1' : '0.5'}
            min="0"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder={TEST_MAP[testId]?.unit || 'valor'}
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

// ─── Definiciones de los tests ─────────────────────────────────────
function DefinicionesList() {
  return (
    <div className="entrena__defs">
      {Object.entries(ZONES).map(([zoneKey, zone]) => (
        <div key={zoneKey} className="entrena__defs-zone">
          <h2 className="entrena__defs-zone-title" style={{ '--zone-color': zone.color }}>{zone.label}</h2>
          <div className="entrena__defs-list">
            {zone.tests.map(tid => {
              const t = TEST_MAP[tid]
              if (!t) return null
              const hidden = t.visible === false
              return (
                <div key={tid} className={`entrena__defs-item${hidden ? ' entrena__defs-item--hidden' : ''}`}>
                  <div className="entrena__defs-item__head">
                    <span className="entrena__defs-item__name">{t.label}</span>
                    <span className="entrena__defs-item__unit">{t.unit}</span>
                    {hidden && <span className="entrena__defs-item__soon">valorar para próximamente</span>}
                  </div>
                  <p className="entrena__defs-item__desc">{t.desc || 'Sin descripción todavía.'}</p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────
export default function EntrenamientosPage() {
  const isAuthenticated = ['profesor', 'gestion', 'socio'].includes(window.blokesSiteData?.userRole)
  const [viewMode, setViewMode]         = useState('alumno') // 'alumno' | 'test' | 'definiciones'
  const [filters, setFilters]           = useState(EMPTY_FILTERS)
  const [allClases, setAllClases]       = useState([])
  const [selectedAlumno, setSelectedAlumno] = useState(null)
  const [selectedTest, setSelectedTest] = useState(TESTS_LIST[0])
  const [alumnos, setAlumnos]           = useState([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [showAddManual, setShowAddManual] = useState(false)
  const [manualForm, setManualForm]     = useState({ nombre: '', dia: '', horario: '', edad: '', turno: '' })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError]   = useState(null)
  const [manualDupes, setManualDupes]   = useState(null) // candidates the server returned for this name
  const [search, setSearch]             = useState('')

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

  const openAddManual = () => {
    setManualForm({ nombre: '', dia: filters.dia, horario: filters.horario, edad: filters.edad, turno: filters.turno })
    setManualError(null)
    setManualDupes(null)
    setShowAddManual(true)
  }

  // Same cascade as handleFilterChange, but scoped to the modal's own
  // selections — otherwise it's easy to pick a día/horario combo that
  // doesn't match any real class (e.g. "Jueves" + the "Martes-Jueves" slot).
  const handleManualFieldChange = (key, value) => {
    let next = { ...manualForm, [key]: value }
    const cascadeKeys = ['dia', 'turno', 'edad', 'horario']
    cascadeKeys.forEach(field => {
      if (!next[field] || field === key) return
      const available = distinct(applyClaseFilters(allClases, next, field), field)
      if (!available.includes(next[field])) next = { ...next, [field]: '' }
    })
    setManualForm(next)
  }

  const submitAddManual = async (force = false) => {
    if (!manualForm.nombre.trim()) { setManualError('Escribe un nombre'); return }
    setManualSaving(true); setManualError(null)
    try {
      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos/manual`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...manualForm, force }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.code === 'duplicate_candidates') {
          setManualDupes(json.data?.candidates || [])
          return
        }
        throw new Error(json.message || 'Error al crear el alumno')
      }
      setShowAddManual(false)
      fetchAlumnos(filters)
    } catch (e) {
      setManualError(e.message || 'Error al crear el alumno')
    } finally {
      setManualSaving(false)
    }
  }

  const diaOptions     = sortDias(distinct(applyClaseFilters(allClases, filters, 'dia'), 'dia'))
  const turnoOptions   = distinct(applyClaseFilters(allClases, filters, 'turno'), 'turno').sort()
  const edadOptions    = distinct(applyClaseFilters(allClases, filters, 'edad'), 'edad').sort()
  const horarioOptions = distinct(applyClaseFilters(allClases, filters, 'horario'), 'horario').sort()

  const manualDiaOptions     = sortDias(distinct(applyClaseFilters(allClases, manualForm, 'dia'), 'dia'))
  const manualTurnoOptions   = distinct(applyClaseFilters(allClases, manualForm, 'turno'), 'turno').sort()
  const manualEdadOptions    = distinct(applyClaseFilters(allClases, manualForm, 'edad'), 'edad').sort()
  const manualHorarioOptions = distinct(applyClaseFilters(allClases, manualForm, 'horario'), 'horario').sort()

  const searchNorm = search.trim().toLowerCase()
  const consolidatedAlumnos = consolidateAlumnos(alumnos)
  const visibleAlumnos = searchNorm
    ? consolidatedAlumnos.filter(a => (a.cliente || a.nombre || '').toLowerCase().includes(searchNorm))
    : consolidatedAlumnos

  // Different real people can share a name — highlight whichever is active
  // so the profesor can tell them apart at a glance.
  const nameCounts = {}
  visibleAlumnos.forEach(a => {
    const n = (a.cliente || a.nombre || '').trim().toLowerCase()
    if (n) nameCounts[n] = (nameCounts[n] || 0) + 1
  })
  const isAmbiguousActive = a => {
    const n = (a.cliente || a.nombre || '').trim().toLowerCase()
    return n && nameCounts[n] > 1 && a.status === 'active'
  }

  // Candidates come from the server when "Crear" is pressed (it sees every
  // subscription, not just the filtered list on screen).
  const manualSuggestions = manualDupes || []

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
        {!loading && (
          <p className="entrena__subtitle">
            {searchNorm
              ? `${visibleAlumnos.length} de ${consolidatedAlumnos.length} alumnos`
              : `${consolidatedAlumnos.length} alumno${consolidatedAlumnos.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <div className="entrena__search">
        <input
          type="text"
          placeholder="Buscar alumno por nombre..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="entrena__search-input"
        />
        <p className="entrena__search-hint">
          Busca aquí antes de añadir un alumno nuevo: casi siempre ya está en el sistema, aunque no tenga la suscripción activa.
        </p>
      </div>

      {showAddManual && (
        <div className="entrena__modal-overlay" onClick={() => setShowAddManual(false)}>
          <div className="entrena__modal" onClick={e => e.stopPropagation()}>
            <h2>Añadir alumno manual</h2>
            <p className="entrena__modal-hint">
              Para alguien que está en clase pero todavía no tiene suscripción (nuevo, pago pendiente...).
              Cuando se haga socio podrás vincular su historial a su cuenta real.
            </p>
            <label>Nombre</label>
            <input
              type="text"
              value={manualForm.nombre}
              onChange={e => { setManualForm(f => ({ ...f, nombre: e.target.value })); setManualDupes(null) }}
              autoFocus
            />
            {manualSuggestions.length > 0 && (
              <div className="entrena__suggest">
                <p className="entrena__suggest-title">Ya hay alguien con un nombre parecido. ¿Es alguno de estos?</p>
                {manualSuggestions.map((s, i) => (
                  <div key={i} className="entrena__suggest-row">
                    <span>
                      {s.nombre}
                      <small>{SUGGEST_STATUS[s.status] || s.status || 'sin estado'} · {s.dia || 'Sin día'} · {s.horario || 'Sin horario'}</small>
                    </span>
                    <button
                      type="button"
                      className="entrena__suggest-btn"
                      onClick={() => { setSearch(s.nombre); setShowAddManual(false) }}
                    >Es este</button>
                  </div>
                ))}
              </div>
            )}
            <label>Día</label>
            <select value={manualForm.dia} onChange={e => handleManualFieldChange('dia', e.target.value)}>
              <option value="">Sin especificar</option>
              {manualDiaOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label>Horario</label>
            <select value={manualForm.horario} onChange={e => handleManualFieldChange('horario', e.target.value)}>
              <option value="">Sin especificar</option>
              {manualHorarioOptions.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <label>Edad</label>
            <select value={manualForm.edad} onChange={e => handleManualFieldChange('edad', e.target.value)}>
              <option value="">Sin especificar</option>
              {manualEdadOptions.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <label>Turno</label>
            <select value={manualForm.turno} onChange={e => handleManualFieldChange('turno', e.target.value)}>
              <option value="">Sin especificar</option>
              {manualTurnoOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {manualError && <p className="entrena__error">{manualError}</p>}
            <div className="entrena__modal-actions">
              <button className="entrena__reset" onClick={() => setShowAddManual(false)}>Cancelar</button>
              <button className="entrena__add-manual-btn" onClick={() => submitAddManual(!!manualDupes)} disabled={manualSaving}>
                {manualSaving ? 'Creando...' : manualDupes ? 'Crear de todos modos' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        <button
          className={`entrena__mode-btn${viewMode === 'definiciones' ? ' entrena__mode-btn--active' : ''}`}
          onClick={() => setViewMode('definiciones')}
        >Definiciones</button>
      </div>

      {viewMode === 'definiciones' && <DefinicionesList />}

      {viewMode !== 'definiciones' && (<>

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
      {viewMode === 'test' && TEST_MAP[selectedTest]?.desc && (
        <p className="entrena__test-desc">
          <strong>{TEST_MAP[selectedTest].label}:</strong> {TEST_MAP[selectedTest].desc}
        </p>
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

      <button className="entrena__add-manual-btn entrena__add-manual-btn--block" onClick={openAddManual}>+ Añadir alumno</button>

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
      ) : visibleAlumnos.length === 0 ? (
        <div className="entrena__empty">
          <p className="entrena__empty-title">Nadie coincide con "{search.trim()}"</p>
          <p className="entrena__empty-hint">Revisa los filtros o el nombre. Si de verdad no está, usa "+ Añadir alumno".</p>
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
              {visibleAlumnos
                .filter(a => a.user_id || a.placeholder_id)
                .map((a, i) => <TestModeRow key={a.placeholder_id ? `ph-${a.placeholder_id}` : (a.id ?? i)} alumno={a} testId={selectedTest} ambiguousActive={isAmbiguousActive(a)} />)
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
                <th>Frecuencia</th>
                <th>Día</th>
                <th>Horario</th>
              </tr>
            </thead>
            <tbody>
              {visibleAlumnos.map((a, i) => {
                const rowKey   = a.placeholder_id ? `ph-${a.placeholder_id}` : (a.id ?? i)
                const isSelected = a.placeholder_id
                  ? selectedAlumno?.placeholder_id === a.placeholder_id
                  : (selectedAlumno?.id === a.id && !selectedAlumno?.placeholder_id)
                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={`entrena__row${isSelected ? ' entrena__row--active' : ''}`}
                      onClick={() => setSelectedAlumno(isSelected ? null : a)}
                    >
                      <td>
                        {a.cliente || a.nombre || '—'}
                        {isAmbiguousActive(a) && <span className="entrena__active-tag" title="Hay varias personas con este nombre — esta es la que tiene suscripción activa">activo ahora</span>}
                        {a.is_placeholder && <span className="entrena__manual-tag" title="Alumno manual, sin cuenta vinculada">manual</span>}
                      </td>
                      <td>{FRECUENCIA_LABEL[a.frecuencia] || a.producto || '—'}</td>
                      <td>{a.dia || '—'}</td>
                      <td>{a.horario || '—'}</td>
                    </tr>
                    {isSelected && (
                      <tr className="entrena__inline-panel">
                        <td colSpan={4}>
                          <TrainingPanel
                            alumno={a}
                            onClose={() => setSelectedAlumno(null)}
                            onLinked={() => { setSelectedAlumno(null); fetchAlumnos(filters) }}
                            onDeleted={() => { setSelectedAlumno(null); fetchAlumnos(filters) }}
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

      </>)}
    </div>
  )
}
