import { useState, useEffect } from 'react'
import './TeleSection.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1`
// Atajo corto, fácil de teclear con el mando (redirige a /blokes/compe/directo — PHP, ver
// progreso-extension1-1.php). Antes era rocomadrid.com/blokes/compe/directo a secas.
const TELE_URL = 'https://rocomadrid.com/tele'

async function request(path, method = 'GET', body) {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const res = await fetch(`${BASE}${path}`, {
    method, credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return json.data ?? json
}

const VACIO = { titulo: '', imagenUrl: '', texto: '', qrUrl: '', fechaInicio: '', fechaFin: '', duracionSeg: 12, orden: 0 }

// Tele del Roco (NOTAS_PARA_CODE_tele_roco.md, Ramiro 11/11 05:39) — primera versión: gestión a
// mano de las diapositivas que rotan en /compe/directo cuando no hay compe. Las diapositivas
// automáticas (cada actividad/evento con su propia entrada y caducidad sola) quedan para una
// ronda aparte, igual que los vídeos de blokes y el mapa en vivo.
export default function TeleSection() {
  const [slides, setSlides]   = useState(null)
  const [error, setError]     = useState(null)
  const [form, setForm]       = useState(VACIO)
  const [editando, setEditando] = useState(null)
  const [saving, setSaving]   = useState(false)

  const cargar = () => request('/tele-slides').then(setSlides).catch(e => setError(e.message))
  useEffect(cargar, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const guardar = async () => {
    if (!form.titulo.trim()) { setError('Pon un título.'); return }
    setSaving(true); setError(null)
    try {
      if (editando) await request(`/tele-slides/${editando}`, 'PUT', form)
      else await request('/tele-slides', 'POST', form)
      setForm(VACIO); setEditando(null); cargar()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const editar = s => {
    setEditando(s.id)
    setForm({ titulo: s.titulo, imagenUrl: s.imagenUrl, texto: s.texto, qrUrl: s.qrUrl, fechaInicio: s.fechaInicio || '', fechaFin: s.fechaFin || '', duracionSeg: s.duracionSeg, orden: s.orden })
  }

  const toggleActivo = async s => {
    try { await request(`/tele-slides/${s.id}`, 'PUT', { activo: !s.activo }); cargar() }
    catch (e) { setError(e.message) }
  }

  const borrar = async s => {
    if (!window.confirm(`¿Borrar la diapositiva "${s.titulo}"?`)) return
    try { await request(`/tele-slides/${s.id}`, 'DELETE'); cargar() }
    catch (e) { setError(e.message) }
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const hoyActivas = (slides || []).filter(s =>
    s.activo && (!s.fechaInicio || s.fechaInicio <= hoy) && (!s.fechaFin || s.fechaFin >= hoy)
  )

  return (
    <div className="tele-panel">
      {/* Ramiro, 13/11 07:06: "para que lo pueda manejar Eva" — caja de arriba del todo con lo
          que hace falta para encender la tele física, sin tener que entender nada de código. */}
      <div className="tele-status">
        <h3 className="tele-status__title">📺 Poner en la tele</h3>
        <div className="tele-status__row">
          <div className="tele-status__url-col">
            <p className="tele-status__url">{TELE_URL}</p>
            <a className="tele-btn tele-btn--primary" href={TELE_URL} target="_blank" rel="noreferrer">▶ Vista previa</a>
          </div>
          <img
            className="tele-status__qr"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(TELE_URL)}`}
            alt="Código QR de la tele"
            width={130} height={130}
          />
        </div>
        <ol className="tele-status__pasos">
          <li>Encender la tele y abrir el navegador.</li>
          <li>Escribir <strong>{TELE_URL}</strong> (o apuntar el móvil al QR y pasarlo a la tele).</li>
          <li>Tocar el botón de pantalla completa que aparece unos segundos al cargar (o F11 en un PC).</li>
        </ol>
        <p className="tele-status__hint">
          Lo que rota hoy sin compe en marcha{!slides && ' (cargando…)'}:
        </p>
        {slides && hoyActivas.length === 0 && (
          <p className="tele-hint">Nada activo hoy — solo saldrá el mapa/cuenta atrás de la compe si hay una programada.</p>
        )}
        {hoyActivas.length > 0 && (
          <ul className="tele-status__list">
            {hoyActivas.map(s => (
              <li key={s.id}>{s.titulo} <span className="tele-muted">· {s.duracionSeg}s</span></li>
            ))}
          </ul>
        )}
      </div>
      <div className="tele-divider" />

      <p className="tele-hint">
        Estas diapositivas rotan en la tele del Roco (<code>{TELE_URL}</code>) cuando no hay
        compe en marcha. Sin fecha de fin, la diapositiva no caduca sola — bórrala o desactívala
        a mano cuando toque.
      </p>

      <div className="tele-form">
        <h3>{editando ? 'Editar diapositiva' : 'Nueva diapositiva'}</h3>
        <label className="tele-field">Título
          <input className="tele-input" value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="10 % en el primer trimestre" />
        </label>
        <label className="tele-field">Texto
          <textarea className="tele-textarea" rows={3} value={form.texto} onChange={e => set('texto', e.target.value)} />
        </label>
        <label className="tele-field">Imagen (URL, opcional)
          <input className="tele-input" value={form.imagenUrl} onChange={e => set('imagenUrl', e.target.value)} placeholder="https://..." />
        </label>
        <label className="tele-field">Enlace para el QR (opcional)
          <input className="tele-input" value={form.qrUrl} onChange={e => set('qrUrl', e.target.value)} placeholder="https://rocomadrid.com/..." />
        </label>
        <div className="tele-row">
          <label className="tele-field">Fecha inicio (opcional)
            <input className="tele-input" type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} />
          </label>
          <label className="tele-field">Fecha fin (opcional)
            <input className="tele-input" type="date" value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)} />
          </label>
          <label className="tele-field">Segundos en pantalla
            <input className="tele-input" type="number" min={5} max={60} value={form.duracionSeg} onChange={e => set('duracionSeg', Number(e.target.value))} />
          </label>
          <label className="tele-field">Orden
            <input className="tele-input" type="number" value={form.orden} onChange={e => set('orden', Number(e.target.value))} />
          </label>
        </div>
        {error && <p className="tele-error">{error}</p>}
        <div className="tele-actions">
          {editando && <button className="tele-btn" onClick={() => { setEditando(null); setForm(VACIO) }}>Cancelar</button>}
          <button className="tele-btn tele-btn--primary" onClick={guardar} disabled={saving}>
            {saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Añadir diapositiva'}
          </button>
        </div>
      </div>

      <div className="tele-divider" />
      <h3>Diapositivas</h3>
      {!slides && <p className="tele-hint">Cargando…</p>}
      {slides && slides.length === 0 && <p className="tele-hint">Todavía no hay ninguna.</p>}
      {slides?.map(s => (
        <div key={s.id} className={`tele-row-item${!s.activo ? ' tele-row-item--inactiva' : ''}`}>
          <div className="tele-row-item__info">
            <strong>{s.titulo}</strong>{!s.activo && <span className="tele-muted"> (desactivada)</span>}
            <span className="tele-muted"> · {s.duracionSeg}s · orden {s.orden}</span>
            {(s.fechaInicio || s.fechaFin) && (
              <span className="tele-muted"> · {s.fechaInicio || '—'} a {s.fechaFin || 'sin fin'}</span>
            )}
          </div>
          <div className="tele-row-item__acciones">
            <button className="tele-btn" onClick={() => editar(s)}>Editar</button>
            <button className="tele-btn" onClick={() => toggleActivo(s)}>{s.activo ? 'Desactivar' : 'Activar'}</button>
            <button className="tele-btn tele-btn--danger" onClick={() => borrar(s)}>Borrar</button>
          </div>
        </div>
      ))}
    </div>
  )
}
