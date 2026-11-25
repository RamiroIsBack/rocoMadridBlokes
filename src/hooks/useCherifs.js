import { useState, useEffect, useCallback } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1`

async function request(path, method = 'GET', body) {
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

function useGet(path) {
  const [data, setData]   = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    request(path).then(j => { setData(j); setError('') }).catch(e => setError(e.message))
  }, [path])
  useEffect(() => { load() }, [load])
  return { data, error, reload: load, setData }
}

// Tablón de los socios: mensajes motivantes y canciones de la semana
export const useCherifsBoard   = () => useGet('/cherifs/board')
// Próximos 14 días del calendario de Google (por su dirección iCal)
export const useCherifsCalendar = () => useGet('/cherifs/calendar')

export const addCherifsMessage = text => request('/cherifs/message', 'POST', { text })
export const addCherifsSong    = (title, url) => request('/cherifs/song', 'POST', { title, url })
export const deleteCherifsItem = (kind, id) => request(`/cherifs/item/${kind}/${id}`, 'DELETE')
export const saveCherifsIcal   = (url, name = '') => request('/cherifs/ical', 'PUT', { url, name })
export const deleteCherifsIcal = id => request(`/cherifs/ical/${id}`, 'DELETE')

// 25/11: Tareas de Cherifs (las actividades que no son del calendario) y copia desde Notion
export const useCherifsTasks   = () => useGet('/cherifs/tasks')
export const importNotionTasks = () => request('/cherifs/tasks/import-notion', 'POST')
