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

// Horas extra de un mes ('YYYY-MM'), sin importes (los importes están en Nóminas).
export const useOvertime = (month) => useRequest(`/overtime?month=${month}`)

export const createOvertime = (fields)     => request('/overtime', 'POST', fields)
export const updateOvertime = (id, fields) => request(`/overtime/${id}`, 'PUT', fields)
export const deleteOvertime = (id)         => request(`/overtime/${id}`, 'DELETE')

// target: { id } o { month, professor }
export const setOvertimeStatus = (target, status) => request('/overtime-status', 'POST', { ...target, status })

// Tipos de persona en orden de listado. Profesores y voluntarios pueden tener nómina base; externos solo extras.
export const PERSON_TYPES = [
  { id: 'profesor',   label: 'Profesor',   plural: 'Profesores' },
  { id: 'voluntario', label: 'Voluntario', plural: 'Voluntarios' },
  { id: 'externo',    label: 'Externo',    plural: 'Externos' },
]
export const typeLabel = id => PERSON_TYPES.find(t => t.id === id)?.label || id
export const hasBase   = type => type !== 'externo'
export const sortByType = people => PERSON_TYPES.flatMap(t => people.filter(p => p.type === t.id))

// Personas (profesores, voluntarios y externos). Añadir: gestion y socio. Editar/desactivar: solo socio.
export const addOvertimePerson    = (name, type)   => request('/overtime-people', 'POST', { name, type })
export const updateOvertimePerson = (id, changes)  => request(`/overtime-people/${id}`, 'PUT', changes)

// ─── Nóminas (SuperAdmin, solo socios) ──────────────────────────────────────
function useRequest(path) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return request(path)
      .then(json => setData(json))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false))
  }, [path])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}

// Filas por persona (base + extras), totales, detalle de horas y configuración del mes.
export const usePayroll        = (month)          => useRequest(`/payroll?month=${month}`)
export const usePayrollHistory = (to, months = 12) => useRequest(`/payroll-history?to=${to}&months=${months}`)

// config: { base: {id: €}, rates: {id: €/h} } — un valor vacío borra ese importe
export const savePayrollConfig = (config) => request('/payroll-config', 'PUT', config).then(json => json.config)

// Ficha personal (solo socios). fields: { full_name, dni, birth_date, address, phone, email }
export const savePayrollPersonal = (id, fields) =>
  request(`/payroll-personal/${id}`, 'PUT', fields).then(json => json.personal || {})
