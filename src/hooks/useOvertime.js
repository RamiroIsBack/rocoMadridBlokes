import { useState, useEffect, useCallback } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1`

function headers() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }
}

async function request(path, method = 'GET', body) {
  const res  = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return json
}

// Horas extra de un mes ('YYYY-MM'). Los importes solo llegan si el usuario es socio.
export function useOvertime(month) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return request(`/overtime?month=${month}`)
      .then(json => setData(json))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false))
  }, [month])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}

export const createOvertime = (fields)     => request('/overtime', 'POST', fields)
export const updateOvertime = (id, fields) => request(`/overtime/${id}`, 'PUT', fields)
export const deleteOvertime = (id)         => request(`/overtime/${id}`, 'DELETE')

// target: { id } o { month, professor }
export const setOvertimeStatus = (target, status) => request('/overtime-status', 'POST', { ...target, status })

export const getOvertimeRates  = ()      => request('/overtime-rates').then(json => json.rates || {})
export const saveOvertimeRates = (rates) => request('/overtime-rates', 'PUT', { rates }).then(json => json.rates || {})
