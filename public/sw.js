// Service worker mínimo para que Blokes se pueda instalar como app.
// No guarda nada en caché: la página (index.php) lleva el nonce y los datos del usuario,
// así que siempre se pide a la red. Solo si no hay conexión se enseña un aviso.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const SIN_CONEXION = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blokes — sin conexión</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#1f1f1f;color:#f4f0e4;font-family:system-ui,sans-serif;text-align:center;padding:16px}
button{margin-top:16px;padding:10px 20px;border:0;border-radius:8px;background:#D0962B;color:#1f1f1f;font-size:16px}</style>
</head><body><div><p>No hay conexión a internet.</p><button onclick="location.reload()">Reintentar</button></div></body></html>`

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() =>
      new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
    )
  )
})
