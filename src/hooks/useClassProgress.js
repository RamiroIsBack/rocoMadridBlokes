import { useState, useEffect } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

export function useClassProgress(enabled = true) {
  const [data, setData]       = useState(null)   // { class: {dia,horario}, members: [...] }
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    fetch(`${CLUB_URL}/wp-json/progreso/v1/training/class-progress`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => { if (json?.data) setData(json.data) })
      .catch(e => setError(e))
      .finally(() => setLoading(false))
  }, [enabled])

  return { data, loading, error }
}
