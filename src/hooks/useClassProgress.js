import { useState, useEffect } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

// targetUserId: from the tablet, viewing someone else's class instead of
// "mi clase" — needs profe/gestión/tablet permission, same as the rest of
// the "act on behalf of" tooling.
export function useClassProgress(enabled = true, targetUserId = 0) {
  const [data, setData]       = useState(null)   // { class: {dia,horario}, members: [...] }
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    const qs = targetUserId ? `?target_user_id=${targetUserId}` : ''
    fetch(`${CLUB_URL}/wp-json/progreso/v1/training/class-progress${qs}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => { if (json?.data) setData(json.data) })
      .catch(e => setError(e))
      .finally(() => setLoading(false))
  }, [enabled, targetUserId])

  return { data, loading, error }
}
