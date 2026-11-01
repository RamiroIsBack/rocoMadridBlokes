import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

if (window.blokesSiteData) {
  const r = window.blokesSiteData.userRole
  if (r === 'superadmin') window.blokesSiteData.userRole = 'socio'
  else if (r === 'admin')  window.blokesSiteData.userRole = 'gestion'
}

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
