// Si el nonce caduca (sesión con la pestaña abierta muchas horas — dura 12-24h), WordPress
// devuelve 403 "rest_cookie_invalid_nonce" y toda petición falla hasta recargar la página —
// Ramiro, 5/11: "pide uno nuevo y reintenta en vez de fallar". La página actual (server-index.php)
// incrusta un nonce fresco en cada carga (`window.blokesSiteData = {...}`), así que basta con
// volver a pedir esa misma URL, sacar el nonce nuevo de la respuesta y reintentar una vez.
let refreshing = null

function refreshNonce() {
  if (!refreshing) {
    refreshing = fetch(window.location.href, { credentials: 'include' })
      .then(r => r.text())
      .then(html => {
        const m = html.match(/window\.blokesSiteData\s*=\s*(\{.*?\});/s)
        if (!m) throw new Error('nonce no encontrado')
        const data = JSON.parse(m[1])
        window.blokesSiteData = { ...(window.blokesSiteData || {}), ...data }
        return data
      })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

async function esErrorDeNonce(res) {
  if (res.status !== 403) return false
  const json = await res.clone().json().catch(() => null)
  return json?.code === 'rest_cookie_invalid_nonce'
}

// `doFetch` es una función sin argumentos que repite la misma petición (necesita volver a leer
// `getAuthHeaders()` en el segundo intento, con el nonce ya refrescado).
export async function fetchWithNonceRetry(doFetch) {
  let res = await doFetch()
  if (await esErrorDeNonce(res)) {
    try {
      await refreshNonce()
      res = await doFetch()
    } catch {
      // No se pudo refrescar (sin conexión, sesión de verdad caducada...): se deja el 403
      // original, que el código de arriba ya sabe convertir en un mensaje de error normal.
    }
  }
  return res
}
