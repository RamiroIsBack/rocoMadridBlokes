import { useState, useEffect, useCallback } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1`

async function request(path, method = 'GET', body) {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const res  = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return json
}

// ¿Puede ver el Diario? Socio, gestión y profes siempre; el resto, si su email está en la
// lista de Diario (Superadmin › Acceso), p. ej. Carolina.
export function useDiarioAccess() {
  const role  = window.blokesSiteData?.userRole
  const known = ['socio', 'gestion', 'profesor'].includes(role)
  const [can, setCan] = useState(known)

  useEffect(() => {
    if (known || !window.blokesSiteData?.isLoggedIn) return
    request('/diario/access').then(json => setCan(!!json.can)).catch(() => {})
  }, [known])

  return can
}

export const getDiarioAccess  = ()       => request('/diario/access')
export const saveDiarioAccess = (emails) => request('/diario/access', 'PUT', { emails }).then(json => json.emails)

// ─── Peticiones y sugerencias, compras y recordatorios ──────────────────────
export const DIARIO_KINDS = {
  peticion:     { label: 'Petición',     statuses: ['nueva', 'en_marcha', 'hecha', 'descartada'] },
  sugerencia:   { label: 'Sugerencia',   statuses: ['nueva', 'en_marcha', 'hecha', 'descartada'] },
  compra:       { label: 'Compra',       statuses: ['pendiente', 'aprobada', 'comprada', 'descartada'] },
  recordatorio: { label: 'Recordatorio', statuses: ['pendiente', 'hecho'] },
}
export const STATUS_LABELS = {
  nueva: 'Nueva', en_marcha: 'En marcha', hecha: 'Hecha', descartada: 'Descartada',
  pendiente: 'Pendiente', aprobada: 'Aprobada', comprada: 'Comprada', hecho: 'Hecho',
}
export const CLOSED = ['hecha', 'descartada', 'comprada', 'hecho']
export const isOpen = it => !CLOSED.includes(it.status)

// Lista de todo lo del Diario. Se recarga sola cada 2 minutos (para los avisos).
export function useDiarioItems(enabled = true) {
  const [data, setData]       = useState(null)   // { items, me }
  const [error, setError]     = useState('')
  const load = useCallback(() => {
    if (!enabled) return
    request('/diario/items').then(json => { setData(json); setError('') }).catch(e => setError(e.message))
  }, [enabled])
  useEffect(() => {
    load()
    if (!enabled) return
    const t = setInterval(load, 120000)
    return () => clearInterval(t)
  }, [load, enabled])
  return { data, error, reload: load }
}

export const createDiarioItem = (it)     => request('/diario/items', 'POST', it).then(json => json.item)
export const updateDiarioItem = (id, it) => request(`/diario/items/${id}`, 'PUT', it).then(json => json.item)
export const deleteDiarioItem = (id)     => request(`/diario/items/${id}`, 'DELETE')

// Avisos (numerito): lo que pide atención a esta persona.
// Recordatorios de hoy o atrasados (para todos o para ti); si gestionas, también peticiones
// y sugerencias nuevas y compras pendientes de aprobar.
export function diarioPendientes(data, hoy) {
  if (!data) return 0
  const yo = (data.me?.name || '').toLowerCase()
  const paraMi = it => !it.assignee || (yo && (yo.includes(it.assignee.toLowerCase()) || it.assignee.toLowerCase().includes(yo.split(' ')[0])))
  return data.items.filter(it => {
    if (!isOpen(it)) return false
    if (it.kind === 'recordatorio') return paraMi(it) && (!it.due_date || it.due_date <= hoy)
    if (!data.me?.can_manage) return false
    return it.status === 'nueva' || (it.kind === 'compra' && it.status === 'pendiente')
  }).length
}

// Equipo del Diario (socio y gestión): ocultar/mostrar, nombre con que sale y «Otros».
export const updateDiarioTeam = (body) => request('/diario/team', 'POST', body).then(json => json.team)
