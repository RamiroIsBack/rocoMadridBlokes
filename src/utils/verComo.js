// "Ver como" (Ramiro, 1/11 18:30): un socio puede mirar la app como si fuera gestion o
// profesor, para comprobar de verdad lo que ve ese rol — también lo que devuelve el
// servidor (privacidad del dinero), no solo lo que se pinta. Solo restringe, nunca amplía:
// el servidor (`blokes_get_app_role()`) solo hace caso de la cabecera si el usuario real es
// socio, y cualquier escritura (POST/PUT/DELETE) en modo "ver como" se rechaza con 403.
const KEY = 'blokes_ver_como'
const HEADER = 'X-Blokes-Ver-Como'
const ROLES_SIMULABLES = ['gestion', 'profesor']

export function getVerComo() {
  try { return sessionStorage.getItem(KEY) || '' } catch { return '' }
}

// Aplica (o quita) el rol simulado sobre `blokesSiteData.userRole` — el campo que ya consulta
// media app (`window.blokesSiteData?.userRole === '...'`) — sin tocar `userRoleReal`, que
// siempre guarda la identidad de verdad.
export function applyVerComo() {
  if (!window.blokesSiteData) return
  const real = window.blokesSiteData.userRoleReal || window.blokesSiteData.userRole
  window.blokesSiteData.userRoleReal = real
  const sim = real === 'socio' ? getVerComo() : ''
  window.blokesSiteData.userRole = sim && ROLES_SIMULABLES.includes(sim) ? sim : real
  window.dispatchEvent(new Event('blokes:ver-como-cambiado'))
}

export function setVerComo(role) {
  try {
    if (role && ROLES_SIMULABLES.includes(role)) sessionStorage.setItem(KEY, role)
    else sessionStorage.removeItem(KEY)
  } catch { /* sin almacenamiento: el cambio solo dura esta carga de página */ }
  applyVerComo()
}

export function clearVerComo() { setVerComo('') }

// Instala el envoltorio de fetch una sola vez: mientras "ver como" esté activo, añade la
// cabecera a cualquier petición — así no hay que tocar cada función de cabeceras de la app.
let installed = false
export function installVerComoFetch() {
  if (installed || typeof window === 'undefined' || !window.fetch) return
  installed = true
  const original = window.fetch.bind(window)
  window.fetch = (input, init = {}) => {
    const real = window.blokesSiteData?.userRoleReal
    const sim = real === 'socio' ? getVerComo() : ''
    if (!sim) return original(input, init)
    const headers = new Headers(init.headers || {})
    headers.set(HEADER, sim)
    return original(input, { ...init, headers })
  }
}
