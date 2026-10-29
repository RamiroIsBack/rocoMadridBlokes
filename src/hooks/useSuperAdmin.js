import { useState, useEffect } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function useEndpoint(path, params = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

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
  }, [url, reloadKey])

  return { data, loading, error, refetch: () => setReloadKey(k => k + 1) }
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

export function usePeopleSummary() {
  return useEndpoint('/people-summary')
}

export function useGestionGrupos(months = 4) {
  return useEndpoint('/gestion/grupos', { months })
}

async function gestionPost(path, body) {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const res = await fetch(`${CLUB_URL}/wp-json/superadmin/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
  return json?.data ?? json
}

export const gestionMarcarCobrado = body => gestionPost('/gestion/marcar-cobrado', body)
export const gestionPausar        = body => gestionPost('/gestion/pausar', body)
export const gestionReanudar      = body => gestionPost('/gestion/reanudar', body)
export const gestionNota          = body => gestionPost('/gestion/nota', body)
export const gestionDarDeBaja     = body => gestionPost('/gestion/dar-de-baja', body)
export const gestionFusionar      = body => gestionPost('/gestion/fusionar', body)
export const gestionExento        = body => gestionPost('/gestion/exento', body)

export function useExpenses(months, entity = 'all', excludeInternal = true) {
  const [data,      setData]      = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const url = `${CLUB_URL}/wp-json/superadmin/v1/expenses?months=${months}&entity=${entity}&exclude_internal=${excludeInternal ? 1 : 0}`

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(url, { headers: { 'X-WP-Nonce': nonce } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(json => { setData(json.data ?? null); setBreakdown(json.breakdown ?? null); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [url])

  return { data, breakdown, loading, error }
}
