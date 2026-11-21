// "Ver como" (Ramiro, 1/11 18:30): un socio puede mirar la app como si fuera gestion o
// profesor, para comprobar de verdad lo que ve ese rol — también lo que devuelve el
// servidor (privacidad del dinero), no solo lo que se pinta. Solo restringe, nunca amplía:
// el servidor (`blokes_get_app_role()`) solo hace caso de la cabecera si el usuario real es
// socio, y cualquier escritura (POST/PUT/DELETE) en modo "ver como" se rechaza con 403.
//
// "Ver como: Tablet" (Ramiro, 08/11 21:19, corrige el "modo tablet" que era una pantalla
// aparte) es un "ver como" DISTINTO: "es para que los profes puedan loguear los tops de los
// usuarios, simplemente tiene que simular como cuando estás logueado como si fueses el usuario
// tablet" — así que, a diferencia de gestion/profesor (privacidad, solo socio, solo lectura),
// este SÍ deja escribir (el servidor no lo bloquea) y lo pueden poner los 3 roles que ya pueden
// actuar en nombre de otro: socio, profesor y gestión (no amplía nada — ya podían hacerlo sin
// esto, solo cambia qué pantalla ven).
const KEY = 'blokes_ver_como'
const HEADER = 'X-Blokes-Ver-Como'
// "member" = "Usuario" en el selector — socio normal, sin ningún rol especial (Ramiro,
// 11/11 05:01: "para que Ramiro vea lo que ve la gente").
const ROLES_SOLO_SOCIO = ['gestion', 'profesor', 'member']
const ROLES_PARA_SUPERVISORES = ['tablet']

export function getVerComo() {
  try { return sessionStorage.getItem(KEY) || '' } catch { return '' }
}

function rolSimuladoPara(real) {
  const guardado = getVerComo()
  if (!guardado) return ''
  if (real === 'socio' && ROLES_SOLO_SOCIO.includes(guardado)) return guardado
  if (['socio', 'profesor', 'gestion'].includes(real) && ROLES_PARA_SUPERVISORES.includes(guardado)) return guardado
  return ''
}

// Aplica (o quita) el rol simulado sobre `blokesSiteData.userRole` — el campo que ya consulta
// media app (`window.blokesSiteData?.userRole === '...'`) — sin tocar `userRoleReal`, que
// siempre guarda la identidad de verdad.
export function applyVerComo() {
  if (!window.blokesSiteData) return
  const real = window.blokesSiteData.userRoleReal || window.blokesSiteData.userRole
  window.blokesSiteData.userRoleReal = real
  const sim = rolSimuladoPara(real)
  window.blokesSiteData.userRole = sim || real
  window.dispatchEvent(new Event('blokes:ver-como-cambiado'))
}

export function setVerComo(role) {
  try {
    if (role && (ROLES_SOLO_SOCIO.includes(role) || ROLES_PARA_SUPERVISORES.includes(role))) sessionStorage.setItem(KEY, role)
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
    const sim = rolSimuladoPara(window.blokesSiteData?.userRoleReal)
    if (!sim) return original(input, init)
    const headers = new Headers(init.headers || {})
    headers.set(HEADER, sim)
    return original(input, { ...init, headers })
  }
}
