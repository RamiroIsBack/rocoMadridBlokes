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

// ¿Puede el usuario entrar en Eventos? Socio y gestión siempre; el resto, si su email está en la lista.
export function useEventsAccess() {
  const role  = window.blokesSiteData?.userRole
  const staff = ['socio', 'gestion'].includes(role)
  const [can, setCan] = useState(staff)

  useEffect(() => {
    if (staff || !window.blokesSiteData?.isLoggedIn) return
    request('/events/access').then(json => setCan(!!json.can)).catch(() => {})
  }, [staff])

  return can
}

export const getSsaDebug      = ()       => request('/events/ssa-debug')
export const getEventsAccess  = ()       => request('/events/access')
export const saveEventsAccess = (emails) => request('/events/access', 'PUT', { emails }).then(json => json.emails)

// Reservas + ajustes (precio por niño, mínimo, % de señal, pago a monitores, franjas)
export function useBookings() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return request('/events/bookings')
      .then(json => setData({ bookings: json.bookings, settings: json.settings }))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  return { data, setData, loading, error, reload }
}

export const createBooking  = (fields)     => request('/events/bookings', 'POST', fields)
export const importBookings = (bookings)   => request('/events/bookings', 'POST', { bookings })
export const updateBooking  = (id, fields) => request(`/events/bookings/${id}`, 'PUT', fields).then(json => json.booking)
export const deleteBooking  = (id)         => request(`/events/bookings/${id}`, 'DELETE')
export const saveEventSettings = (s)       => request('/events/settings', 'PUT', s).then(json => json.settings)

export const TYPES = [
  { id: 'cumpleanos', label: 'Cumpleaños', color: '#f87171' },
  { id: 'colegio',    label: 'Colegio',    color: '#60a5fa' },
  { id: 'asociacion', label: 'Asociación', color: '#34d399' },
  { id: 'empresa',    label: 'Empresa',    color: '#a78bfa' },
  { id: 'evento',     label: 'Evento',     color: '#f5c842' },
  { id: 'otro',       label: 'Otro',       color: '#999999' },
]
export const STATUSES = [
  { id: 'solicitud',  label: 'Solicitud'  },
  { id: 'confirmada', label: 'Confirmada' },
  { id: 'celebrada',  label: 'Celebrada'  },
  { id: 'cancelada',  label: 'Cancelada'  },
]
export const ORIGINS = [
  { id: 'web',        label: 'Web'        },
  { id: 'telefono',   label: 'Teléfono'   },
  { id: 'whatsapp',   label: 'WhatsApp'   },
  { id: 'email',      label: 'Email'      },
  { id: 'presencial', label: 'En persona' },
  { id: 'otro',       label: 'Otro'       },
]
const find = (list, id) => list.find(x => x.id === id) || list[list.length - 1]
export const typeOf   = id => find(TYPES, id)
export const statusOf = id => find(STATUSES, id)
export const originOf = id => find(ORIGINS, id)

const round2 = n => Math.round(n * 100) / 100

// Importes de una reserva. Si no hay total, sale de niños × precio (con el mínimo);
// si no hay señal, es el % de los ajustes. Ganancia = total − monitores − materiales.
export function money(b, s) {
  const byKids  = b.kids ? Math.max(s.min_price, b.kids * s.price_per_kid) : null
  const total   = b.total ?? byKids ?? 0
  const deposit = b.deposit ?? round2(total * s.deposit_pct / 100)
  const paid    = (b.deposit_paid ? deposit : 0) + (b.rest_paid ? total - deposit : 0)
  const costs   = (b.monitors_pay ?? 0) + (b.materials ?? 0)
  return { total, deposit, paid: round2(paid), pending: round2(total - paid), costs, profit: round2(total - costs) }
}

export const counts = b => b.status !== 'cancelada'

export function emptyBooking(s, date = '', time = '') {
  return {
    date, time, end_time: '', type: 'cumpleanos', status: 'solicitud', origin: 'telefono',
    contact: '', phone: '', email: '', honoree: '', age: null, kids: null,
    total: null, deposit: null, deposit_paid: false, deposit_date: '', rest_paid: false,
    monitors_pay: s?.monitors_pay ?? null, materials: null, monitors: '', notes: '',
  }
}
