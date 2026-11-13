// Selector de tema — Ramiro, 13/11: "quiero solo 2 modos, dark and light" (el automático era
// el que sobraba, no lo claro/oscuro). Se guarda por dispositivo en localStorage, nunca en la
// cuenta (confirmado ya en la primera ronda del selector, 11/11 06:12).
const STORAGE_KEY = 'blokes_tema'

export function getTema() {
  try {
    const t = localStorage.getItem(STORAGE_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch { /* localStorage puede no estar disponible (privado/bloqueado) */ }
  return 'dark' // quien nunca ha elegido se queda en oscuro, como hasta ahora
}

export function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', tema === 'light' ? '#f4f0e4' : '#1a1714')
  window.dispatchEvent(new CustomEvent('blokes:tema-cambiado', { detail: tema }))
}

export function setTema(tema) {
  try { localStorage.setItem(STORAGE_KEY, tema) } catch { /* ídem */ }
  aplicarTema(tema)
}

// Llamado desde main.jsx al arrancar — el <head> (index.html / plantilla PHP) ya puso el
// atributo correcto en el primer pintado para que no haya parpadeo; esto solo mantiene
// `aplicarTema` como única fuente de verdad para el meta theme-color y el evento de cambio.
export function instalarTema() {
  aplicarTema(getTema())
}
