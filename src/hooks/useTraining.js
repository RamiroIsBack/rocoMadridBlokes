import { useState, useEffect, useCallback } from 'react'
import { getMockCommunityData, syncTestsFromServer } from '../utils/trainingConfig'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

// Keeps the REST error code and data (e.g. the existing value) so callers can
// react to specific cases like "existing_value" instead of only showing text.
function apiError(json, fallback) {
  const err = new Error(json?.message || fallback)
  err.code = json?.code
  err.data = json?.data
  return err
}

export function useTrainingSummary() {
  const [summary, setSummary] = useState(() => getMockCommunityData())

  useEffect(() => {
    syncTestsFromServer()
  }, [])

  useEffect(() => {
    const refresh = () => setSummary(getMockCommunityData())
    window.addEventListener('blokes:tests-updated', refresh)
    return () => window.removeEventListener('blokes:tests-updated', refresh)
  }, [])

  useEffect(() => {
    fetch(`${CLUB_URL}/wp-json/progreso/v1/training/summary`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data?.tests) return
        const mock = getMockCommunityData()
        const merged = { ...mock }
        Object.entries(json.data.tests).forEach(([tid, months]) => {
          merged[tid] = { ...(mock[tid] || {}), ...months }
        })
        setSummary(merged)
      })
      .catch(() => {})
  }, [])

  return summary
}

export function useUserTraining(userId) {
  const [history, setHistory] = useState({})
  const [loading, setLoading] = useState(false)

  const reload = useCallback(() => {
    if (!userId) return
    setLoading(true)
    fetch(`${CLUB_URL}/wp-json/progreso/v1/training/${userId}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.tests) setHistory(json.data.tests) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => { reload() }, [reload])

  const logTraining = useCallback(async (targetUserId, testId, valueKg) => {
    const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/training`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: targetUserId, test_id: testId, value_kg: valueKg }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || 'Error al guardar')
    return json
  }, [])

  const updateTraining = useCallback(async (entryId, valueKg) => {
    const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/training/entry/${entryId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value_kg: valueKg }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || 'Error al actualizar')
    return json
  }, [])

  return { history, loading, reload, logTraining, updateTraining }
}

// Like useUserTraining, but also works for "alumnos manuales" (placeholders
// without a WordPress account yet) — picks the right endpoint based on
// alumno.is_placeholder instead of always assuming a real user_id.
export function useAlumnoTraining(alumno) {
  const isPlaceholder = !!alumno?.is_placeholder
  const subjectId = isPlaceholder ? alumno?.placeholder_id : alumno?.user_id
  const [history, setHistory] = useState({})
  const [loading, setLoading] = useState(false)

  const reload = useCallback(() => {
    if (!subjectId) return
    setLoading(true)
    const url = isPlaceholder
      ? `${CLUB_URL}/wp-json/progreso/v1/training/placeholder/${subjectId}`
      : `${CLUB_URL}/wp-json/progreso/v1/training/${subjectId}`
    fetch(url, { credentials: 'include', headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.tests) setHistory(json.data.tests) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [subjectId, isPlaceholder])

  useEffect(() => { reload() }, [reload])

  const logTraining = useCallback(async (testId, valueKg, force = false) => {
    const body = isPlaceholder
      ? { placeholder_id: subjectId, test_id: testId, value_kg: valueKg }
      : { user_id: subjectId, test_id: testId, value_kg: valueKg }
    if (force) body.force = true
    const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/training`, {
      method: 'POST',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw apiError(json, 'Error al guardar')
    return json
  }, [subjectId, isPlaceholder])

  // Saves a new value; if this month already has one, asks before overwriting
  // it and reports what it replaces. Resolves to null when the profesor declines.
  const logTrainingConfirmed = useCallback(async (testId, valueKg, unit = '') => {
    try {
      return await logTraining(testId, valueKg)
    } catch (e) {
      if (e.code !== 'existing_value') throw e
      const ex = e.data?.existing
      const when = ex?.logged_at ? new Date(ex.logged_at.replace(' ', 'T')).toLocaleDateString('es-ES') : ''
      const ok = window.confirm(
        `Ya hay un registro de este test este mes: ${ex?.value_kg} ${unit}${when ? ` (${when})` : ''}.\n\n¿Sobreescribirlo con ${valueKg} ${unit}?`
      )
      return ok ? logTraining(testId, valueKg, true) : null
    }
  }, [logTraining])

  const updateTraining = useCallback(async (entryId, valueKg) => {
    const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/training/entry/${entryId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ value_kg: valueKg }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.message || 'Error al actualizar')
    return json
  }, [])

  return { history, loading, reload, logTraining, logTrainingConfirmed, updateTraining }
}
