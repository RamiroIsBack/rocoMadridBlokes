// Modo claro/oscuro (Ramiro, 11/11 05:08): "haz un selector de modo claro y oscuro para todo
// blokes". Tres estados — claro / oscuro / automático (por defecto, sigue al sistema) — con
// variables CSS en :root / [data-theme="dark"] (ya definidas en index.css), nunca estilos en
// línea repetidos. Se guarda por dispositivo en localStorage (Ramiro, 11/11 06:12: "no hace
// falta guardarlo en la cuenta, como Ver como"), nunca en el servidor.
const KEY = 'blokes_tema'
const VALORES = ['claro', 'oscuro', 'auto']

export function getTema() {
  try {
    const v = localStorage.getItem(KEY)
    return VALORES.includes(v) ? v : 'auto'
  } catch { return 'auto' }
}

function prefiereDark() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Pone data-theme en <html> (o lo quita en "auto", para que la media query de index.css decida
// sola) y actualiza el <meta name="theme-color"> para que la barra de estado del móvil
// acompañe — la tele (/compe/directo) no llama a esto nunca, así que siempre se queda oscura.
export function aplicarTema(tema) {
  const html = document.documentElement
  if (tema === 'claro') html.setAttribute('data-theme', 'light')
  else if (tema === 'oscuro') html.setAttribute('data-theme', 'dark')
  else html.removeAttribute('data-theme') // "auto": la media query de index.css decide

  const oscuroDeVerdad = tema === 'oscuro' || (tema === 'auto' && prefiereDark())
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', oscuroDeVerdad ? '#1f1f1f' : '#f4f0e4')
}

export function setTema(tema) {
  try { localStorage.setItem(KEY, tema) } catch { /* sin almacenamiento: dura solo esta carga */ }
  aplicarTema(tema)
  window.dispatchEvent(new Event('blokes:tema-cambiado'))
}

// Instala el listener de "auto" una sola vez — si el modo guardado es automático y el sistema
// cambia de claro a oscuro (o al revés) a media tarde, la app lo sigue sin recargar.
let instalado = false
export function instalarTemaAuto() {
  aplicarTema(getTema())
  if (instalado || typeof window === 'undefined' || !window.matchMedia) return
  instalado = true
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTema() === 'auto') aplicarTema('auto')
  })
}
