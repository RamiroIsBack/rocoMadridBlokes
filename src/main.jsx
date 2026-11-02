import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyVerComo, installVerComoFetch } from './utils/verComo'

if (window.blokesSiteData) {
  const r = window.blokesSiteData.userRole
  if (r === 'superadmin') window.blokesSiteData.userRole = 'socio'
  else if (r === 'admin')  window.blokesSiteData.userRole = 'gestion'
}

// "Ver como" (Ramiro, 1/11 18:30): si queda activo de una carga anterior (sessionStorage),
// se vuelve a aplicar antes de que nada compruebe `blokesSiteData.userRole`.
installVerComoFetch()
applyVerComo()

// App instalable: el service worker vive en la raíz de /blokes/ (o /blokes-dev/)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
