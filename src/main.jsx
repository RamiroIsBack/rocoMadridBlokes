import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyVerComo, installVerComoFetch } from './utils/verComo'
import { installVisibilityRefresh } from './utils/visibilityRefresh'

// eslint-disable-next-line no-undef
console.log('Blokes build', __BUILD_TIME__)

// Ramiro, 13/11 05:30: "quita también el modo claro/oscuro" — Blokes siempre en oscuro.
// data-theme="dark" ya viene fijo desde index.html (sin esperar a JS, para que no haya
// parpadeo claro al cargar); aquí no queda nada que instalar.

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

// "Instala Blokes" (Ramiro, 09/11 11:53): beforeinstallprompt NO se captura aquí a nivel
// global para toda la app — hacerlo con preventDefault() en todas partes tapaba también el
// aviso automático de Chrome ("Añadir Blokes a la pantalla de inicio") en el resto de
// páginas. Pero SOLO en /instalar sí hace falta capturarlo lo antes posible — más pronto que
// el useEffect de InstalarPage.jsx, que monta después del primer render de React (cowork,
// 09/11 12:25: con el service worker ya instalado, Chrome a veces dispara el evento antes de
// que eso llegue a montar, y se pierde). InstalarPage lee `window.blokesInstallEvent`.
if (/\/instalar\/?$/.test(window.location.pathname)) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    window.blokesInstallEvent = e
  })
}

// appinstalled no necesita gesto y puede dispararse desde cualquier página si la
// instalación la hizo el aviso nativo de Chrome en vez del botón de /instalar.
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
