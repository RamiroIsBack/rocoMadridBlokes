import { useState, useEffect } from 'react'
import { colorPorNumeroBloque } from '../utils/compeColorScale'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const REFRESCO_MS = 30000 // Ramiro: "sondeo cada 30 s, nada pesado" — ver el problema de pestañas colgadas

// Cuenta atrás de lo que queda de compe (cowork, 09/11 05:30/06:15: antes de empezar decía
// "quedan 25 días" en vez de avisar que no ha empezado) — comp_date/comp_end_date son fechas
// sin hora: el inicio cuenta desde el principio de ese día y el final hasta el final de ese día.
function cuentaAtras(compDate, compEndDate) {
  const ahora = new Date()
  if (compDate) {
    const inicio = new Date(compDate + 'T00:00:00')
    const msHastaEmpezar = inicio - ahora
    if (msHastaEmpezar > 0) {
      const dias = Math.ceil(msHastaEmpezar / 86400000)
      return `Empieza en ${dias} día${dias === 1 ? '' : 's'}`
    }
  }
  if (!compEndDate) return null
  const fin = new Date(compEndDate + 'T23:59:59')
  const ms = fin - ahora
  if (ms <= 0) return 'Compe terminada · resultados finales'
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
  const [proxima, setProxima] = useState(null)
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
          // Sin compe activa: enseña la próxima compe real en vez de quedarse 19 días en blanco
          // con solo el logo (cowork, 11/11 05:40).
          return fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/proxima`)
            .then(r => r.json())
            .then(jj => { if (activo) setProxima(jj.data || null) })
            .catch(() => {})
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
    const cuentaProxima = proxima ? cuentaAtras(proxima.compDate, proxima.compEndDate) : null
    return (
      <div style={estilos.pagina}>
        <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 900 }}>
          <img
            src="https://rocomadrid.com/wp-content/uploads/2026/03/logo-estilo-retro1.png"
            alt="Rocoteca Madrid" style={{ height: 160, marginBottom: 24 }}
          />
          {err ? (
            <p style={{ fontSize: '1.8rem', color: '#9ca3af' }}>Sin conexión — reintentando…</p>
          ) : proxima ? (
            <>
              <p style={{ fontSize: '2.4rem', fontWeight: 800, margin: '0 0 8px' }}>{proxima.nombre}</p>
              {cuentaProxima && <p style={{ fontSize: '2rem', color: '#f5c842', fontWeight: 700, margin: '0 0 36px' }}>{cuentaProxima}</p>}
              <p style={{ fontSize: '1.4rem', color: '#d1d5db', margin: '0 0 12px' }}>Instala Blokes y apúntate: <strong style={{ color: '#fff' }}>rocomadrid.com/app</strong></p>
              <p style={{ fontSize: '1.1rem', color: '#9ca3af' }}>Apunta tus tops desde el móvil, o pide ayuda en recepción.</p>
            </>
          ) : (
            <p style={{ fontSize: '1.8rem', color: '#9ca3af' }}>No hay compe activa ahora mismo.</p>
          )}
        </div>
      </div>
    )
  }

  const general = clasif?.categorias?.[0]?.clasificacion || []
  const ultimos = clasif?.ultimosValidados || []
  const cuenta = cuentaAtras(estado.compDate, estado.compEndDate)

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
                  background: colorPorNumeroBloque(u.numero).bg,
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
