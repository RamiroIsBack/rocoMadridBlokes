// "Modo tablet" (Ramiro, 08/11 11:11): un modo de pantalla completa que deja el dispositivo
// mostrando SOLO la pantalla de recepción de la compe (buscar nombre → apuntar), sin menú de
// gestión ni datos de dinero/personales — para que cualquier socio, profe o Eva deje su propio
// móvil/tablet/ordenador así el día de la compe. A diferencia de "ver como" (verComo.js), esto
// NO simula otro rol ni restringe lo que el servidor acepta: sigue siendo la sesión real de
// quien lo activó (así lo apuntado queda registrado como suyo, Ramiro punto 4) — es solo un
// modo de pantalla, por eso vive en localStorage (no sessionStorage): tiene que sobrevivir a
// que se recargue la página y a que el navegador de la tablet se cierre y se vuelva a abrir.
const KEY = 'blokes_modo_tablet'

export function getModoTablet() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setModoTablet(on) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch { /* sin almacenamiento: no persiste, pero no rompe nada */ }
}
