import { useState, useEffect } from 'react'
import AdminLogin from './AdminLogin'
import BlokeForm from './BlokeForm'
import './AdminApp.css'

// Session storage key for simple password auth
const SESSION_KEY = 'blokes_auth'

export default function AdminApp() {
  const [showLogin, setShowLogin] = useState(() => {
    // Check localStorage on initial load
    return !localStorage.getItem(SESSION_KEY)
  })

  const handleLoginSuccess = () => {
    // Store in localStorage
    localStorage.setItem(SESSION_KEY, 'true')
    setShowLogin(false)
  }

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY)
    setShowLogin(true)
  }

  return (
    <div className="admin-app">
      {showLogin ? (
        <AdminLogin mode="setter" onLogin={handleLoginSuccess} />
      ) : (
        <div className="admin-app__main">
          <main className="admin-app__content">
            <div className="admin-app__main-content">
              <BlokeForm />
            </div>
          </main>

        </div>
      )}
    </div>
  )
}
