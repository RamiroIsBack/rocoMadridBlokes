export default function TimeOffPage() {
  const role = window.blokesSiteData?.userRole
  const url  = window.blokesSiteData?.timeOffEmbedUrl

  if (!['profesor', 'gestion', 'socio'].includes(role)) {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', textAlign: 'center', color: 'var(--color-text-secondary, #666)' }}>
        <p>Acceso restringido.</p>
      </div>
    )
  }

  if (!url) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', color: '#555' }}>
        <div style={{ fontSize: '2rem', marginBottom: 12 }}>🌴</div>
        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f0ece0', marginBottom: 8 }}>Time Off</p>
        <p style={{ fontSize: '0.82rem' }}>Próximamente</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', minHeight: 600 }}>
      <iframe
        src={url}
        title="Time Off"
        allow="same-origin"
        style={{ width: '100%', height: '80vh', minHeight: 600, border: 'none', display: 'block' }}
      />
    </div>
  )
}
