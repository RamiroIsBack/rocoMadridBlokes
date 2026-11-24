import { useState, useEffect } from 'react'
import { fetchWithNonceRetry } from '../utils/wpNonce'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}
async function api(method, path, body) {
  const res = await fetchWithNonceRetry(() => fetch(`${CLUB_URL}/wp-json/progreso/v1${path}`, {
    method, credentials: 'include',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }))
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
  return json
}

// Misma regla de extensión que el backend (blokes_compe_puntos_para_bloque): desde el último
// bloque definido, top +1 por bloque y bonus +1 cada 5 — solo para proponer la fila siguiente,
// el backend es quien manda de verdad al guardar.
function filaSiguiente(filas) {
  const ultimo = filas[filas.length - 1]
  if (!ultimo) return { numero: 1, top: 2, bonus: 1 }
  const n = ultimo.numero + 1
  return { numero: n, top: ultimo.top + 1, bonus: ultimo.bonus + ((n - 1) % 5 === 0 ? 1 : 0) }
}

// 24/11 (pendiente de la nota 23/11 06:50/7f59ea0): editor en Superadmin de la tabla de puntos
// por bloque (top/bonus) que ya usa el backend para puntuar la compe — hasta ahora solo se podía
// leer/escribir por la API a mano. Esta pantalla ya está dentro de Cherifs, que exige socio.
export default function CompePuntosTablaSection() {
  const [filas, setFilas] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setLoading(true)
    api('GET', '/compe/puntos-tabla')
      .then(r => {
        const tabla = r.data?.tabla || {}
        const filasOrdenadas = Object.keys(tabla).map(Number).sort((a, b) => a - b)
          .map(n => ({ numero: n, top: tabla[n].top, bonus: tabla[n].bonus }))
        setFilas(filasOrdenadas)
        setError(null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const patch = (numero, campo, valor) => {
    const n = Math.max(0, parseInt(valor, 10) || 0)
    setFilas(fs => fs.map(f => f.numero === numero ? { ...f, [campo]: n } : f))
    setSaved(false)
  }

  const añadirBloque = () => setFilas(fs => [...fs, filaSiguiente(fs)])
  const quitarUltimo = () => setFilas(fs => fs.length > 1 ? fs.slice(0, -1) : fs)

  const guardar = async () => {
    setSaving(true)
    setError(null)
    try {
      const tabla = Object.fromEntries(filas.map(f => [f.numero, { top: f.top, bonus: f.bonus }]))
      await api('PUT', '/compe/puntos-tabla', { tabla })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) return <p className="sa-pay-note">Cargando tabla de puntos...</p>
  if (error && !filas) return <p className="sa-error">Error: {error}</p>
  if (!filas) return null

  return (
    <section className="sa-section">
      <h3 className="sa-section-title">Tabla de puntos de la compe</h3>
      <p className="sa-pay-note">
        Puntos por bloque (1 = más fácil): Top o Bonus (zona), nunca se suman. A partir del último
        bloque de aquí, la compe extiende la escala sola (top +1 por bloque, bonus +1 cada 5) si
        hay más bloques que filas — esto es solo para fijar o retocar valores concretos.
      </p>
      <div className="sa-puntos-tabla-wrap">
        <table className="sa-pay-table sa-puntos-tabla">
          <thead>
            <tr><th>Bloque</th><th>Top</th><th>Bonus</th></tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.numero}>
                <td className="sa-pay-strong">#{f.numero}</td>
                <td><input type="number" min="0" value={f.top} onChange={e => patch(f.numero, 'top', e.target.value)} /></td>
                <td><input type="number" min="0" value={f.bonus} onChange={e => patch(f.numero, 'bonus', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sa-pay-actions">
        <button type="button" className="sa-pay-action" onClick={añadirBloque}>+ Añadir bloque #{filaSiguiente(filas).numero}</button>
        <button type="button" className="sa-pay-action" onClick={quitarUltimo} disabled={filas.length <= 1}>Quitar el bloque #{filas[filas.length - 1]?.numero}</button>
        <button type="button" className="sa-pay-action bud-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar tabla'}</button>
        {saved && <span className="sa-pay-note" style={{ color: 'var(--state-good)' }}>Guardado.</span>}
      </div>
      {error && <p className="sa-error">Error: {error}</p>}
    </section>
  )
}
