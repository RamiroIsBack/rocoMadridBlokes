import { useState, useEffect } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const REFRESCO_MS = 30000 // Ramiro: "sondeo cada 30 s, nada pesado" — ver el problema de pestañas colgadas

// Pantalla de la tele del Roco (NOTAS_PARA_CODE_compe_en_blokes.md, punto 5) — pública, sin
// login, pensada para 1080p en la tele que ya tenía el canal de YouTube. Letra grande, se
// refresca sola. "Solo nombre y nickname entre paréntesis, nunca apellidos" ya lo hace el
// backend — aquí solo se pinta lo que llega. Categorías/puntos de verdad y la pestaña "Liga
// (temporada)" llegan cuando Ramiro confirme el formato; de momento solo "Esta compe".
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
      padding: '32px 48px', overflow: 'hidden',
    },
  }

  if (!estado?.activo) {
    return (
      <div style={estilos.pagina}>
        <h1 style={{ fontSize: '3rem', textAlign: 'center', margin: 'auto' }}>
          🧗 RocoMadrid
        </h1>
        <p style={{ textAlign: 'center', fontSize: '1.3rem', color: '#9ca3af' }}>
          {err ? 'Sin conexión — reintentando…' : 'No hay compe activa ahora mismo.'}
        </p>
      </div>
    )
  }

  const general = clasif?.categorias?.[0]?.clasificacion || []
  const ultimos = clasif?.ultimosValidados || []

  return (
    <div style={estilos.pagina}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24 }}>
        <h1 style={{ fontSize: '2.6rem', margin: 0 }}>🧗 {estado.nombre}</h1>
        <span style={{ fontSize: '1.1rem', color: '#9ca3af' }}>Clasificación provisional — General</span>
      </header>
      <div style={{ display: 'flex', gap: 48, flex: 1, minHeight: 0 }}>
        <section style={{ flex: 2, minWidth: 0 }}>
          <h2 style={{ fontSize: '1.4rem', color: '#9ca3af', marginBottom: 12 }}>Clasificación</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '1.6rem' }}>
            {general.slice(0, 12).map((p, i) => (
              <li key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                borderBottom: '1px solid #1f2937', fontWeight: i < 3 ? 700 : 400,
                color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#fb923c' : '#fff',
              }}>
                <span>{i + 1}. {p.nombreMostrar}</span>
                <span>{p.tops} top{p.tops === 1 ? '' : 's'}</span>
              </li>
            ))}
            {general.length === 0 && <li style={{ color: '#6b7280' }}>Todavía no hay tops validados.</li>}
          </ol>
        </section>
        <section style={{ flex: 1, minWidth: 0, borderLeft: '1px solid #1f2937', paddingLeft: 32 }}>
          <h2 style={{ fontSize: '1.4rem', color: '#9ca3af', marginBottom: 12 }}>Últimos tops</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '1.05rem' }}>
            {ultimos.map((u, i) => (
              <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
                <strong>{u.nombreMostrar}</strong> · bloque {u.numero} · hace {u.hace}
              </li>
            ))}
            {ultimos.length === 0 && <li style={{ color: '#6b7280' }}>Nada validado todavía.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
