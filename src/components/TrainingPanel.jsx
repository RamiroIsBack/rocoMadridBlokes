import { useState, useEffect } from 'react'
import { useUserTraining } from '../hooks/useTraining'
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

export default function TrainingPanel({ alumno, onClose }) {
  const userId = alumno.user_id
  const { history, loading, logTraining, updateTraining, reload } = useUserTraining(userId)

  const [editMode, setEditMode] = useState({})
  const [values, setValues]     = useState({})
  const [saving, setSaving]     = useState({})
  const [saved, setSaved]       = useState({})
  const [errors, setErrors]     = useState({})

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
        await logTraining(userId, testId, val)
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
                      <span className="training-panel__test-zone">{test.unit}</span>
                    </div>

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
