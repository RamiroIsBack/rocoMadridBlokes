import { useState, useEffect, useCallback } from 'react'

// Presupuestos por zonas (Superadmin, solo socios): zonas del local y sus partidas
const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1/presupuestos`

async function request(path = '', method = 'GET', body) {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return json
}

// { zonas, partidas }. Se refresca al volver a la pestaña del navegador
// (lo editan varios socios a la vez; gana el último que guarda).
export function usePresupuestos() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    return request()
      .then(json => setData({ zonas: json.zonas || [], partidas: json.partidas || [] }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  return { data, setData, loading, error, reload }
}

export const createZona    = zona          => request('/zonas', 'POST', zona).then(j => j.zona)
export const updateZona    = (id, fields)  => request(`/zonas/${id}`, 'PUT', fields).then(j => j.zona)
export const deleteZona    = id            => request(`/zonas/${id}`, 'DELETE')
export const createPartida = partida       => request('/partidas', 'POST', partida).then(j => j.partida)
// Admite cambios parciales: { estado } o { precio_conseguido }
export const updatePartida = (id, fields)  => request(`/partidas/${id}`, 'PUT', fields).then(j => j.partida)
export const deletePartida = id            => request(`/partidas/${id}`, 'DELETE')
// { zona, capitulos: [{ nombre, partidas }] } → { zona, creada, added, skipped, invalid, zonas, partidas }
export const importarPartidas = payload    => request('/importar', 'POST', payload)
