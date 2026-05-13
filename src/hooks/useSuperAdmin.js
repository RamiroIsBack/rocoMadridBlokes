import { useState, useEffect } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function useEndpoint(path, params = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const query = new URLSearchParams(params).toString()
  const url   = `${CLUB_URL}/wp-json/superadmin/v1${path}${query ? '?' + query : ''}`

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(url, { headers: { 'X-WP-Nonce': nonce } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => { setData(json.data ?? json); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [url])

  return { data, loading, error }
}

export function useRevenue(months, excludeTransfer = false) {
  return useEndpoint('/revenue', { months, exclude_transfer: excludeTransfer ? 1 : 0 })
}

export function useProducts(months) {
  return useEndpoint('/products', { months })
}

export function useClasses(months) {
  return useEndpoint('/classes', { months })
}

export function useExpenses(months, entity = 'all', excludeInternal = true) {
  return useEndpoint('/expenses', { months, entity, exclude_internal: excludeInternal ? 1 : 0 })
}
