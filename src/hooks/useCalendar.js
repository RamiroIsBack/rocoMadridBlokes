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

// Tareas de Notion ("Funciones Rocomadrid") entre dos fechas. El servidor las guarda 5 min;
// reload(true) se salta esa caché.
export function useCalendar(from, to) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback((refresh = false) => {
    setLoading(true)
    setError(null)
    return request(`/calendar?from=${from}&to=${to}${refresh ? '&refresh=1' : ''}`)
      .then(json => setData(json))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}

export const saveNotionToken = (token) => request('/calendar/token', 'PUT', { token })
export const getBookings     = ()      => request('/events/bookings').then(json => json.bookings)

// Colores de Notion en el tema oscuro de la web
const NOTION_COLORS = {
  default: '#9b9a97', gray: '#9b9a97', brown: '#b08968', orange: '#f97316', yellow: '#f5c842',
  green: '#34d399', blue: '#60a5fa', purple: '#a78bfa', pink: '#f472b6', red: '#f87171',
}
export const notionColor = c => NOTION_COLORS[c] || NOTION_COLORS.default

// Categorías de Notion con su color (si Notion trae otro, manda el de Notion)
export const CATEGORY_COLORS = {
  'Acciones diarias': 'green', 'Becarios': 'default', 'Competicion': 'blue', 'Contabilidad': 'gray',
  'Cumpleaños': 'red', 'Evento': 'default', 'ideas': 'orange', 'Mantenimiento': 'yellow', 'marketing': 'brown',
  'Mejoras': 'purple', 'Reunion': 'purple', 'Sustitucion': 'pink', 'Tareas': 'purple', 'Vacaciones': 'orange',
}
export const CATEGORIES = Object.keys(CATEGORY_COLORS)
// Las que enseña la vista "Calendario de Eventos" de Notion
export const NOTION_VIEW_CATEGORIES = ['Competicion', 'Cumpleaños', 'Evento', 'Sustitucion', 'Vacaciones']
export const NO_CATEGORY = 'Sin categoría'

export const NOTION_CALENDAR_URL = 'https://www.notion.so/292d5fb11f5b80129a5aef1e47cf0741'
