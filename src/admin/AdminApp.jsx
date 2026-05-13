import AdminLogin from './AdminLogin'
import BlokeForm from './BlokeForm'
import './AdminApp.css'

export default function AdminApp() {
  const role = window.blokesSiteData?.userRole

  if (role !== 'admin' && role !== 'superadmin') {
    return <AdminLogin mode="setter" />
  }

  return (
    <div className="admin-app">
      <div className="admin-app__main">
        <main className="admin-app__content">
          <div className="admin-app__main-content">
            <BlokeForm />
          </div>
        </main>
      </div>
    </div>
  )
}
