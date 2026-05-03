import { useState, useEffect, useCallback } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

export function useTrainingSummary() {
  const [summary, setSummary] = useState({})

  useEffect(() => {
    fetch(`${CLUB_URL}/wp-json/progreso/v1/training/summary`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data?.tests) setSummary(json.data.tests) })
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
