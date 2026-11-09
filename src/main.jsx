import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyVerComo, installVerComoFetch } from './utils/verComo'
import { installVisibilityRefresh } from './utils/visibilityRefresh'

// eslint-disable-next-line no-undef
console.log('Blokes build', __BUILD_TIME__)

if (window.blokesSiteData) {
  const r = window.blokesSiteData.userRole
  if (r === 'superadmin') window.blokesSiteData.userRole = 'socio'
  else if (r === 'admin')  window.blokesSiteData.userRole = 'gestion'
}

// "Ver como" (Ramiro, 1/11 18:30): si queda activo de una carga anterior (sessionStorage),
// se vuelve a aplicar antes de que nada compruebe `blokesSiteData.userRole`.
installVerComoFetch()
applyVerComo()
installVisibilityRefresh()

// App instalable: el service worker vive en la raíz de /blokes/ (o /blokes-dev/)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

// "Instala Blokes" (Ramiro, 09/11): el evento puede llegar antes de que <App> monte el
// efecto que lo espera (useEffect corre después del primer render) — se guarda aquí, lo
// antes posible, para no perderlo.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.blokesInstallEvent = e
})
window.addEventListener('appinstalled', () => {
  const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'
  fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/install-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'appinstalled' }),
  }).catch(() => {})
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
