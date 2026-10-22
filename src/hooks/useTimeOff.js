import { useState, useEffect, useCallback } from 'react'

// CTRL Time Off (Supervisión, solo socios): plan oficial, escenarios y solicitudes
const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1/timeoff`

async function request(path = '', method = 'GET', body) {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return json
}

// { plan, plan_meta, scenarios, requests }
export function useTimeOffData() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return request()
      .then(json => setData(json))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  return { data, setData, loading, error, reload }
}

export const savePlan       = plan          => request('/plan', 'PUT', { plan }).then(j => j.plan_meta)
export const addScenario    = (name, state) => request('/scenarios', 'POST', { name, state }).then(j => j.scenario)
export const deleteScenario = id            => request(`/scenarios/${id}`, 'DELETE')
// requests: [{ person, from, to, status?, canal?, nota? }] → { added, skipped, invalid, requests }
export const addRequests    = requests      => request('/requests', 'POST', { requests })
export const updateRequest  = (id, fields)  => request(`/requests/${id}`, 'PUT', fields).then(j => j.request)
export const deleteRequest  = id            => request(`/requests/${id}`, 'DELETE')
