import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

if (window.blokesSiteData) {
  const r = window.blokesSiteData.userRole
  if (r === 'superadmin') window.blokesSiteData.userRole = 'socio'
  else if (r === 'admin')  window.blokesSiteData.userRole = 'gestion'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
