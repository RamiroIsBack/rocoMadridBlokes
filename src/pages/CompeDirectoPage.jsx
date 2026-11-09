import { useState, useEffect } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const REFRESCO_MS = 30000 // Ramiro: "sondeo cada 30 s, nada pesado" — ver el problema de pestañas colgadas

const COLOR_HEX = {
  verde: '#22c55e', azul: '#3b82f6', amarillo: '#eab308', rojo: '#ef4444',
  negro: '#1f2937', blanco: '#e5e7eb', naranja: '#f97316', morado: '#8b5cf6', rosa: '#ec4899',
}

// Cuenta atrás de lo que queda de compe (cowork, 09/11 05:30: "casi toda la pantalla vacía,
// letra mucho más grande") — comp_date/comp_end_date son fechas sin hora, así que el final
// cuenta como el final de ESE día.
function cuentaAtras(compEndDate) {
  if (!compEndDate) return null
  const fin = new Date(compEndDate + 'T23:59:59')
  const ahora = new Date()
  const ms = fin - ahora
  if (ms <= 0) return 'Última hora de la compe'
  const dias = Math.floor(ms / 86400000)
  const horas = Math.floor((ms % 86400000) / 3600000)
  if (dias >= 1) return `Quedan ${dias} día${dias === 1 ? '' : 's'} y ${horas} h de compe`
  return `Quedan ${horas} h de compe`
}

// Pantalla de la tele del Roco (NOTAS_PARA_CODE_compe_en_blokes.md, punto 5) — pública, sin
// login, pensada para 1080p en la tele que ya tenía el canal de YouTube. Letra grande, se
// refresca sola. "Solo nombre y nickname entre paréntesis, nunca apellidos" ya lo hace el
// backend — aquí solo se pinta lo que llega.
// Categorías/puntos de verdad llegan cuando Ramiro confirme el formato; de momento solo
// "General". Cuando llegue la Liga (temporada), esto rota entre "Esta compe" ↔ "Liga
// (temporada)" cada X s — de momento solo hay "Esta compe", así que no hace falta rotar nada.
export default function CompeDirectoPage() {
  const [estado, setEstado] = useState(null)
  const [clasif, setClasif] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let activo = true
    const cargar = () => {
      fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/estado`)
        .then(r => r.json())
        .then(j => {
          if (!activo) return
          setEstado(j.data)
          if (j.data?.activo) {
            return fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/clasificacion?competitionId=${j.data.competitionId}`)
              .then(r => r.json())
              .then(jj => { if (activo) setClasif(jj.data) })
          }
        })
        .catch(e => activo && setErr(e.message))
    }
    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => { activo = false; clearInterval(id) }
  }, [])

  const estilos = {
    pagina: {
      position: 'fixed', inset: 0, zIndex: 9999, background: '#0b1120', color: '#fff',
      fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column',
      padding: '40px 64px 0', overflow: 'hidden', boxSizing: 'border-box',
    },
  }

  if (!estado?.activo) {
    return (
      <div style={estilos.pagina}>
        <div style={{ margin: 'auto', textAlign: 'center' }}>
          <img
            src="https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png"
            alt="Rocoteca Madrid" style={{ height: 160, marginBottom: 24 }}
          />
          <p style={{ fontSize: '1.8rem', color: '#9ca3af' }}>
            {err ? 'Sin conexión — reintentando…' : 'No hay compe activa ahora mismo.'}
          </p>
        </div>
      </div>
    )
  }

  const general = clasif?.categorias?.[0]?.clasificacion || []
  const ultimos = clasif?.ultimosValidados || []
  const cuenta = cuentaAtras(estado.compEndDate)

  return (
    <div style={estilos.pagina}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <img
            src="https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png"
            alt="Rocoteca Madrid" style={{ height: 80 }}
          />
          <h1 style={{ fontSize: '3rem', margin: 0 }}>{estado.nombre}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.3rem', color: '#9ca3af' }}>Clasificación provisional — General</div>
          {cuenta && <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24' }}>{cuenta}</div>}
        </div>
      </header>
      <div style={{ display: 'flex', gap: 64, flex: 1, minHeight: 0 }}>
        <section style={{ flex: 2, minWidth: 0 }}>
          <h2 style={{ fontSize: '1.8rem', color: '#9ca3af', marginBottom: 16 }}>Clasificación</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '2.8rem' }}>
            {general.slice(0, 10).map((p, i) => (
              <li key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '14px 0',
                borderBottom: '1px solid #1f2937', fontWeight: i < 3 ? 800 : 500,
                color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#fb923c' : '#fff',
              }}>
                <span>{i + 1}. {p.nombreMostrar}</span>
                <span>{p.tops} top{p.tops === 1 ? '' : 's'}</span>
              </li>
            ))}
            {general.length === 0 && <li style={{ color: '#6b7280', fontSize: '1.8rem' }}>Todavía no hay tops.</li>}
          </ol>
        </section>
        <section style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #1f2937', paddingLeft: 48 }}>
          <h2 style={{ fontSize: '1.8rem', color: '#9ca3af', marginBottom: 16 }}>Últimos tops</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '1.4rem' }}>
            {ultimos.map((u, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #1f2937' }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto',
                  background: COLOR_HEX[(u.color || '').toLowerCase()] || '#9ca3af',
                }} />
                <span><strong>{u.nombreMostrar}</strong> · bloque {u.numero} · hace {u.hace}</span>
              </li>
            ))}
            {ultimos.length === 0 && <li style={{ color: '#6b7280' }}>Nada apuntado todavía.</li>}
          </ul>
        </section>
      </div>
      <footer style={{
        textAlign: 'center', padding: '20px 0', fontSize: '1.1rem', color: '#9ca3af',
        borderTop: '1px solid #1f2937', marginTop: 24,
      }}>
        Apunta tus tops en la app Blokes o en recepción · Norma de honor
      </footer>
    </div>
  )
}
