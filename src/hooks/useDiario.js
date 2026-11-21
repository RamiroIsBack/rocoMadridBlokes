import { useState, useEffect } from 'react'

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
