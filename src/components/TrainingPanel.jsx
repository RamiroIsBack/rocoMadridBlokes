import { useState, useEffect } from 'react'
import { useAlumnoTraining } from '../hooks/useTraining'
import { ZONES, TESTS } from './BodyDiagram'
import './TrainingPanel.css'

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatDate(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
}

function isThisMonth(logged_at) {
  return logged_at?.startsWith(currentMonth())
}

function inputStep(unit) {
  return unit === 'reps' || unit === 'series' ? '1' : '0.5'
}

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

export default function TrainingPanel({ alumno, onClose, onLinked, onDeleted }) {
  const { history, loading, logTraining, updateTraining, reload } = useAlumnoTraining(alumno)

  const [editMode, setEditMode] = useState({})
  const [values, setValues]     = useState({})
  const [saving, setSaving]     = useState({})
  const [saved, setSaved]       = useState({})
  const [errors, setErrors]     = useState({})
  const [showDesc, setShowDesc] = useState({})

  const [linkEmail, setLinkEmail]     = useState('')
  const [linking, setLinking]         = useState(false)
  const [linkError, setLinkError]     = useState(null)
  const [deleting, setDeleting]       = useState(false)

  const handleLink = async () => {
    if (!linkEmail.trim()) { setLinkError('Escribe el email de la cuenta'); return }
    setLinking(true); setLinkError(null)
    try {
      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos/manual/${alumno.placeholder_id}/link`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: linkEmail.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || 'Error al vincular')
      if (onLinked) onLinked()
    } catch (e) {
      setLinkError(e.message || 'Error al vincular')
    } finally {
      setLinking(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`¿Borrar a "${alumno.cliente}"? Se perderán sus mediciones.`)) return
    setDeleting(true); setLinkError(null)
    try {
      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/alumnos/manual/${alumno.placeholder_id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || 'Error al borrar')
      if (onDeleted) onDeleted()
    } catch (e) {
      setLinkError(e.message || 'Error al borrar')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    const init = {}
    Object.keys(TESTS).forEach(id => {
      const numId   = Number(id)
      const entries = history[numId]
      if (entries?.length) init[numId] = String(entries[entries.length - 1].value_kg)
    })
    setValues(v => ({ ...v, ...init }))
  }, [history])

  const setVal = (testId, v) => setValues(prev => ({ ...prev, [testId]: v }))
  const setErr = (testId, e) => setErrors(prev => ({ ...prev, [testId]: e }))

  const handleSave = async (testId) => {
    const val = parseFloat(values[testId])
    if (isNaN(val) || val < 0) { setErr(testId, 'Introduce un valor válido'); return }
    setErr(testId, null)
    setSaving(s => ({ ...s, [testId]: true }))
    try {
      const entries = history[testId] || []
      const last    = entries[entries.length - 1]
      if (last && isThisMonth(last.logged_at)) {
        await updateTraining(last.id, val)
      } else {
        await logTraining(testId, val)
      }
      setSaved(s => ({ ...s, [testId]: true }))
      setEditMode(m => ({ ...m, [testId]: false }))
      setTimeout(() => setSaved(s => ({ ...s, [testId]: false })), 2000)
      reload()
    } catch (e) {
      setErr(testId, e.message || 'Error al guardar')
    } finally {
      setSaving(s => ({ ...s, [testId]: false }))
    }
  }

  return (
    <div className="training-panel">
      <div className="training-panel__header">
        <div>
          <p className="training-panel__name">{alumno.cliente}</p>
          <p className="training-panel__meta">{alumno.dia} · {alumno.horario} · {alumno.edad}</p>
        </div>
        <button className="training-panel__close" onClick={onClose}>✕</button>
      </div>

      {alumno.is_placeholder && (
        <div className="training-panel__link-box">
          <p className="training-panel__link-hint">
            Alumno manual, sin cuenta todavía. Cuando se haga socio, vincula su email para pasarle este historial.
          </p>
          <div className="training-panel__input-row">
            <input
              type="email"
              placeholder="email@ejemplo.com"
              value={linkEmail}
              onChange={e => setLinkEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLink()}
              className="training-panel__input"
            />
            <button className="training-panel__btn" onClick={handleLink} disabled={linking}>
              {linking ? '…' : 'Vincular'}
            </button>
          </div>
          {linkError && <p className="training-panel__err">{linkError}</p>}
          <button className="training-panel__delete-btn" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Borrando...' : 'Borrar alumno'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="training-panel__loading">Cargando historial...</p>
      ) : (
        Object.entries(ZONES).map(([zoneKey, zone]) => (
          <div key={zoneKey} className="training-panel__zone">
            <p className="training-panel__zone-title" style={{ color: zone.color }}>{zone.label}</p>
            <div className="training-panel__grid">
              {zone.tests.map(id => {
                const test      = TESTS[id]
                const entries   = history[id] || []
                const last      = entries[entries.length - 1]
                const editable  = last && isThisMonth(last.logged_at)
                const isEditing = editMode[id] || !last

                return (
                  <div key={id} className="training-panel__test" style={{ '--zone-color': zone.color }}>
                    <div className="training-panel__test-head">
                      <span className="training-panel__test-num">{test.label}</span>
                      {test.desc && (
                        <button
                          type="button"
                          className="training-panel__info-btn"
                          title="Cómo se mide"
                          onClick={() => setShowDesc(s => ({ ...s, [id]: !s[id] }))}
                        >ⓘ</button>
                      )}
                      <span className="training-panel__test-zone">{test.unit}</span>
                    </div>

                    {showDesc[id] && test.desc && (
                      <p className="training-panel__desc">{test.desc}</p>
                    )}

                    {last && (
                      <div className="training-panel__last-row">
                        {editable && !isEditing && (
                          <button
                            className="training-panel__edit-btn"
                            title="Editar"
                            onClick={() => setEditMode(m => ({ ...m, [id]: true }))}
                          >
                            ✏️
                          </button>
                        )}
                        <p className="training-panel__last">
                          <strong>{last.value_kg} {test.unit}</strong>
                          <span className={`training-panel__last-date ${editable ? 'training-panel__last-date--this-month' : ''}`}>
                            {formatDate(last.logged_at)}
                            {!editable && ' · histórico'}
                          </span>
                        </p>
                      </div>
                    )}

                    {isEditing && (
                      <>
                        <div className="training-panel__input-row">
                          <input
                            type="number"
                            step={inputStep(test.unit)}
                            min="0"
                            value={values[id] || ''}
                            onChange={e => setVal(id, e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave(id)}
                            placeholder={test.unit}
                            className="training-panel__input"
                            autoFocus={!!editMode[id]}
                          />
                          <button
                            className={`training-panel__btn ${saved[id] ? 'training-panel__btn--saved' : ''}`}
                            onClick={() => handleSave(id)}
                            disabled={saving[id]}
                          >
                            {saving[id] ? '…' : saved[id] ? '✓' : 'OK'}
                          </button>
                          {editMode[id] && (
                            <button
                              className="training-panel__cancel-btn"
                              onClick={() => setEditMode(m => ({ ...m, [id]: false }))}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {errors[id] && <p className="training-panel__err">{errors[id]}</p>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
