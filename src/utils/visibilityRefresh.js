// Cowork grabó lo que colgaba Supervisión (08/11 11:10): con sesión iniciada, la pestaña de
// Blokes estaba completamente tranquila (0 llamadas, sin huecos del hilo principal) — lo que se
// congelaba era OTRA pestaña vieja (el "Page Lifecycle: frozen/discarded" de Chrome, que duerme
// las pestañas que llevan horas en segundo plano para ahorrar memoria). No es un bug de Blokes,
// pero la app puede evitar el síntoma ("hay que recargar Supervisión"): si la pestaña estuvo
// oculta más de UMBRAL_MS y vuelve a primer plano, se recarga sola para que el nonce y los datos
// de cada pantalla arranquen frescos — importante también para "ver como: tablet" (verComo.js),
// que va a estar con la pantalla abierta horas.
const UMBRAL_MS = 5 * 60 * 1000 // 5 min

function hayFormularioConTexto() {
  const activo = document.activeElement
  if (!activo) return false
  const tag = activo.tagName?.toLowerCase()
  return (tag === 'input' || tag === 'textarea') && !!activo.value
}

export function installVisibilityRefresh() {
  if (typeof document === 'undefined') return
  let ocultaDesde = null

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ocultaDesde = Date.now()
      return
    }
    if (document.visibilityState !== 'visible' || !ocultaDesde) return
    const llevaOculta = Date.now() - ocultaDesde
    ocultaDesde = null
    // No recargar a ciegas si alguien se queda escribiendo algo (p. ej. "Crear cliente") — mejor
    // la pestaña congelada alguna vez que borrarle el formulario.
    if (llevaOculta > UMBRAL_MS && !hayFormularioConTexto()) window.location.reload()
  })

  // Una pestaña restaurada desde la bfcache (o que Chrome había congelado/descartado) puede
  // volver directamente por aquí, con "persisted", sin pasar antes por 'hidden'.
  window.addEventListener('pageshow', e => {
    if (e.persisted) window.location.reload()
  })
}
