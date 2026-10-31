import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  campanasContactosImportar, campanasContactosGet, campanasEnviosHoyGet,
  campanasListar, campanasCrear, campanasDestinatarios, campanasMarcarAccion,
} from '../hooks/useSuperAdmin'
import './CampanasSection.css'

const LISTA_LABEL = {
  actuales: 'Actuales', nuevos: 'Nuevos', antiguos: 'Antiguos',
  bajas: 'Bajas de mensajes', sin_clasificar: 'Sin clasificar',
}

// Hojas reconocidas del xlsx de campañas (cabecera fija: Nombre (saludo); Nombres en el
// Excel; Teléfono; Grupos/pestañas; Observaciones; Email; Mensaje; Abrir WhatsApp; Revisado
// web; Enviado; Respuesta/BAJA). "Sin teléfono" y "LEEME" no se importan como contactos.
const SHEET_CONFIG = {
  'Antiguos adultos': { origen: 'xlsx_antiguos_adultos', tipo: 'adulto' },
  'Antiguos menores': { origen: 'xlsx_antiguos_menores', tipo: 'menor' },
  'Actuales':         { origen: 'xlsx_actuales',         tipo: 'adulto' },
  'Interesados':      { origen: 'interesado',            tipo: 'adulto' },
}

function parseContactsWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const filas = []
  const porHoja = {}
  let plantillaAdulto = '', plantillaMenor = '', remitente = ''

  if (wb.SheetNames.includes('LEEME')) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['LEEME'], { header: 1, defval: '' })
    const fila = rows.find(r => String(r[0] || '').toLowerCase().includes('remitente'))
    if (fila) remitente = String(fila[1] || '').trim()
  }

  for (const [sheetName, cfg] of Object.entries(SHEET_CONFIG)) {
    if (!wb.SheetNames.includes(sheetName)) continue
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
    let count = 0
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const saludo     = String(row[0] || '').trim()
      const nombresRaw = String(row[1] || '').trim()
      const telefono   = String(row[2] || '').replace(/\D/g, '').trim()
      const grupos     = String(row[3] || '').trim()
      const obs        = String(row[4] || '').trim()
      const email      = String(row[5] || '').trim()
      const mensaje    = String(row[6] || '').trim()
      if (!telefono) continue
      const nombres = nombresRaw.split(';').map(s => s.trim()).filter(Boolean)
      if (!nombres.length) continue

      // Plantilla sugerida: la primera fila con mensaje y saludo, sustituyendo el nombre por
      // {nombre} — Ramiro ya escribió el mensaje completo por fila en vez de una plantilla.
      if (mensaje && saludo) {
        if (cfg.tipo === 'adulto' && !plantillaAdulto) plantillaAdulto = mensaje.split(saludo).join('{nombre}')
        if (cfg.tipo === 'menor'  && !plantillaMenor)  plantillaMenor  = mensaje.split(saludo).join('{nombre}')
      }

      filas.push({
        telefono, nombres, saludo, tipo: cfg.tipo, origen: cfg.origen, email,
        notas: [grupos, obs].filter(Boolean).join(' · '),
      })
      count++
    }
    porHoja[sheetName] = count
  }
  return { filas, porHoja, plantillaAdulto, plantillaMenor, remitente }
}

function UploadContactsPanel({ onImported, onPlantillasSugeridas }) {
  const fileRef = useRef()
  const [resumen, setResumen] = useState(null)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async e => {
    const file = e.target.files[0]
    if (!file) return
    setError(null); setResumen(null); setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const { filas, porHoja, plantillaAdulto, plantillaMenor, remitente } = parseContactsWorkbook(buf)
      if (!filas.length) { setError('No se encontraron contactos con teléfono en el archivo.'); setLoading(false); return }
      const res = await campanasContactosImportar({ filas })
      setResumen({ ...res, porHoja, total: filas.length })
      if ((plantillaAdulto || plantillaMenor || remitente) && onPlantillasSugeridas) {
        onPlantillasSugeridas({ plantillaAdulto, plantillaMenor, remitente })
      }
      if (onImported) onImported()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="cmp-upload">
      <div className="cmp-file-btn" onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
        <span>📂</span> {loading ? 'Procesando…' : 'Subir xlsx/CSV de contactos'}
      </div>
      <p className="cmp-hint">
        Hojas reconocidas: Antiguos adultos · Antiguos menores · Actuales · Interesados (agrupadas por teléfono).
        Fusiona por teléfono: no borra ni duplica contactos ya cargados.
      </p>
      {error && <p className="cmp-error">Error: {error}</p>}
      {resumen && (
        <p className="cmp-hint">
          ✓ {resumen.nuevos} nuevos, {resumen.actualizados} actualizados
          {resumen.sinTelefono ? `, ${resumen.sinTelefono} sin teléfono (omitidos)` : ''}.
          {' '}Por hoja: {Object.entries(resumen.porHoja).map(([h, n]) => `${h} (${n})`).join(' · ')}
        </p>
      )}
    </div>
  )
}

function ContactosPanel({ onPlantillasSugeridas }) {
  const [lista, setLista]       = useState('all')
  const [tipo, setTipo]         = useState('all')
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [refreshKey, setRefresh] = useState(0)

  useEffect(() => {
    setLoading(true); setError(null)
    campanasContactosGet(lista, tipo)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [lista, tipo, refreshKey])

  return (
    <div className="cmp-panel">
      <UploadContactsPanel onImported={() => setRefresh(k => k + 1)} onPlantillasSugeridas={onPlantillasSugeridas} />
      <div className="cmp-divider" />

      {data?.resumen && (
        <div className="cmp-kpis">
          {Object.entries(LISTA_LABEL).map(([k, label]) => (
            <button
              key={k}
              className={`cmp-kpi-btn${lista === k ? ' cmp-kpi-btn--active' : ''}`}
              onClick={() => setLista(lista === k ? 'all' : k)}
            >
              <span className="cmp-kpi-btn__val">{data.resumen[k] || 0}</span>
              <span className="cmp-kpi-btn__lbl">{label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="cmp-filters">
        <select className="cmp-select" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="all">Adultos y menores</option>
          <option value="adulto">Adultos</option>
          <option value="menor">Menores</option>
        </select>
      </div>

      {loading && <p className="cmp-hint">Cargando…</p>}
      {error && <p className="cmp-error">Error: {error}</p>}
      {data && (
        <div className="cmp-table-wrap">
          <table className="cmp-table">
            <thead>
              <tr><th>Teléfono</th><th>Nombres</th><th>Tipo</th><th>Lista</th><th>Origen</th></tr>
            </thead>
            <tbody>
              {data.contactos.map(c => (
                <tr key={c.id}>
                  <td>{c.telefono}</td>
                  <td>{c.nombres.join(', ')}</td>
                  <td>{c.tipo}</td>
                  <td><span className={`cmp-badge cmp-badge--${c.lista || 'sin_clasificar'}`}>{LISTA_LABEL[c.lista || 'sin_clasificar']}</span></td>
                  <td className="cmp-muted">{c.origen}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.contactos.length === 0 && <p className="cmp-empty">Sin contactos en esta vista.</p>}
        </div>
      )}
    </div>
  )
}

function CrearCampanaPanel({ sugeridas, onCreated }) {
  const [nombre, setNombre]               = useState('')
  const [listas, setListas]               = useState({ actuales: false, nuevos: false, antiguos: true })
  const [plantillaAdulto, setPlantillaAdulto] = useState('')
  const [plantillaMenor, setPlantillaMenor]   = useState('')
  const [remitente, setRemitente]         = useState('')
  const [fechaFin, setFechaFin]           = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState(null)

  useEffect(() => {
    if (!sugeridas) return
    if (sugeridas.plantillaAdulto && !plantillaAdulto) setPlantillaAdulto(sugeridas.plantillaAdulto)
    if (sugeridas.plantillaMenor  && !plantillaMenor)  setPlantillaMenor(sugeridas.plantillaMenor)
    if (sugeridas.remitente       && !remitente)       setRemitente(sugeridas.remitente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugeridas])

  const handleCrear = async () => {
    setError(null)
    const listasElegidas = Object.entries(listas).filter(([, v]) => v).map(([k]) => k)
    if (!nombre.trim()) { setError('Pon un nombre a la campaña.'); return }
    if (!listasElegidas.length) { setError('Elige al menos una lista.'); return }
    setSaving(true)
    try {
      await campanasCrear({
        nombre, listas: listasElegidas, plantillaAdulto, plantillaMenor, remitente,
        fechaFin: fechaFin || null,
      })
      setNombre(''); setFechaFin('')
      if (onCreated) onCreated()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="cmp-crear">
      <label className="cmp-field">Nombre de la campaña
        <input className="cmp-input" type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="10% antiguos alumnos" />
      </label>
      <label className="cmp-field">Listas destinatarias
        <div className="cmp-checks">
          {['actuales', 'nuevos', 'antiguos'].map(k => (
            <label key={k} className="cmp-check">
              <input type="checkbox" checked={listas[k]} onChange={e => setListas(l => ({ ...l, [k]: e.target.checked }))} />
              {LISTA_LABEL[k]}
            </label>
          ))}
        </div>
      </label>
      <label className="cmp-field">Remitente
        <input className="cmp-input" type="text" value={remitente} onChange={e => setRemitente(e.target.value)} placeholder="Ramiro" />
      </label>
      <label className="cmp-field">Plantilla adultos — usa {'{nombre}'} y {'{remitente}'}
        <textarea className="cmp-textarea" rows={5} value={plantillaAdulto} onChange={e => setPlantillaAdulto(e.target.value)} />
      </label>
      <label className="cmp-field">Plantilla menores/familias — usa {'{nombre}'} y {'{remitente}'}
        <textarea className="cmp-textarea" rows={5} value={plantillaMenor} onChange={e => setPlantillaMenor(e.target.value)} />
      </label>
      <label className="cmp-field">Fecha fin de la oferta (opcional)
        <input className="cmp-input" type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
      </label>
      {error && <p className="cmp-error">{error}</p>}
      <button className="cmp-btn cmp-btn--primary" onClick={handleCrear} disabled={saving}>
        {saving ? 'Creando…' : 'Crear campaña'}
      </button>
    </div>
  )
}

function DestinatariosPanel({ campana, onBack, onChanged }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [enviadosHoy, setEnviadosHoy] = useState(0)
  const [filtro, setFiltro]   = useState('pendientes') // pendientes | todos

  const cargar = () => {
    setLoading(true)
    Promise.all([campanasDestinatarios(campana.id), campanasEnviosHoyGet()])
      .then(([d, hoy]) => { setData(d); setEnviadosHoy(hoy.enviadosHoy) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(cargar, [campana.id])

  const accion = async (contactoId, accionNombre) => {
    try {
      await campanasMarcarAccion(campana.id, contactoId, accionNombre)
      cargar()
      if (onChanged) onChanged()
    } catch (e) { setError(e.message) }
  }

  const abrirWhatsapp = (d) => {
    const url = `https://wa.me/34${d.telefono}?text=${encodeURIComponent(d.mensaje)}`
    window.open(url, '_blank')
    accion(d.contactoId, 'enviado')
  }

  if (loading) return <p className="cmp-hint">Cargando destinatarios…</p>
  if (error)   return <p className="cmp-error">Error: {error}</p>
  if (!data)   return null

  const visibles = (data.destinatarios || []).filter(d => {
    if (d.yaEnVigor || d.baja) return false
    if (filtro === 'pendientes') return !d.enviado
    return true
  })

  return (
    <div className="cmp-panel">
      <button className="cmp-btn" onClick={onBack}>← Volver a campañas</button>
      <h3 className="cmp-title">{data.campana.nombre}</h3>
      <p className="cmp-hint">
        Listas: {data.campana.listas.map(l => LISTA_LABEL[l]).join(', ')} · Remitente: {data.campana.remitente || '—'}
      </p>
      {enviadosHoy >= 40 && (
        <p className="cmp-warn">⚠ Ya se han enviado {enviadosHoy} mensajes hoy desde este número — pasar de 40/día puede hacer que WhatsApp lo bloquee. Considera seguir mañana.</p>
      )}
      {enviadosHoy > 0 && enviadosHoy < 40 && <p className="cmp-hint">Enviados hoy: {enviadosHoy}</p>}

      <div className="cmp-filters">
        <select className="cmp-select" value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="pendientes">Pendientes de enviar</option>
          <option value="todos">Todos (menos ya en vigor / bajas)</option>
        </select>
        <span className="cmp-muted">{visibles.length} de {data.destinatarios.length} destinatarios</span>
      </div>

      <div className="cmp-table-wrap">
        <table className="cmp-table">
          <thead>
            <tr><th>Teléfono</th><th>Nombres</th><th>Mensaje</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {visibles.map(d => (
              <tr key={d.contactoId}>
                <td>{d.telefono}</td>
                <td>{d.nombres.join(', ')}</td>
                <td className="cmp-mensaje">{d.mensaje}</td>
                <td>
                  {d.apuntado && <span className="cmp-badge cmp-badge--actuales">Se apuntó</span>}
                  {!d.apuntado && d.respondio && <span className="cmp-badge cmp-badge--nuevos">Respondió</span>}
                  {!d.apuntado && !d.respondio && d.enviado && <span className="cmp-badge cmp-badge--sin_clasificar">Enviado {d.enviado.fecha?.slice(0, 10)}</span>}
                  {!d.enviado && <span className="cmp-muted">Sin enviar</span>}
                </td>
                <td className="cmp-acciones">
                  <button className="cmp-btn cmp-btn--sm cmp-btn--primary" onClick={() => abrirWhatsapp(d)}>Abrir WhatsApp</button>
                  <button className="cmp-btn cmp-btn--sm" onClick={() => accion(d.contactoId, 'respondio')}>Respondió</button>
                  <button className="cmp-btn cmp-btn--sm" onClick={() => accion(d.contactoId, 'apuntado')}>Se apuntó</button>
                  <button className="cmp-btn cmp-btn--sm cmp-btn--danger" onClick={() => accion(d.contactoId, 'baja')}>BAJA</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="cmp-empty">Nada que mostrar con este filtro.</p>}
      </div>
    </div>
  )
}

function CampanasPanel({ sugeridas }) {
  const [campanas, setCampanas] = useState(null)
  const [error, setError]       = useState(null)
  const [abierta, setAbierta]   = useState(null)
  const [refreshKey, setRefresh] = useState(0)

  const cargar = () => campanasListar().then(setCampanas).catch(e => setError(e.message))
  useEffect(cargar, [refreshKey])

  if (abierta) {
    return <DestinatariosPanel campana={abierta} onBack={() => { setAbierta(null); setRefresh(k => k + 1) }} onChanged={cargar} />
  }

  return (
    <div className="cmp-panel">
      <h3 className="cmp-title">Nueva campaña</h3>
      <CrearCampanaPanel sugeridas={sugeridas} onCreated={() => setRefresh(k => k + 1)} />
      <div className="cmp-divider" />
      <h3 className="cmp-title">Campañas</h3>
      {error && <p className="cmp-error">Error: {error}</p>}
      {campanas && campanas.length === 0 && <p className="cmp-empty">Todavía no hay campañas creadas.</p>}
      {campanas && campanas.map(c => (
        <div key={c.id} className="cmp-campana-row">
          <div>
            <strong>{c.nombre}</strong>
            <span className="cmp-muted"> — {c.listas.map(l => LISTA_LABEL[l]).join(', ')}</span>
          </div>
          <div className="cmp-campana-stats">
            <span>Enviados: {c.enviados}</span>
            <span>Respondidos: {c.respondidos}</span>
            <span>Bajas: {c.bajas}</span>
            <span>Se apuntaron: {c.apuntados}</span>
          </div>
          <button className="cmp-btn cmp-btn--primary" onClick={() => setAbierta(c)}>Enviar / ver destinatarios</button>
        </div>
      ))}
    </div>
  )
}

export default function CampanasSection() {
  const [tab, setTab] = useState('contactos')
  const [sugeridas, setSugeridas] = useState(null)

  return (
    <div className="cmp-section">
      <p className="sv-note">
        Campañas de WhatsApp (envío manual, enlaces wa.me — sin API de Meta por ahora). Las listas (Actuales,
        Nuevos, Antiguos) se calculan solas a partir de las suscripciones y externos de Grupos; «Bajas de
        mensajes» solo se marca a mano y nunca se recalcula.
      </p>
      <div className="cmp-tabs">
        <button className={`cmp-tab${tab === 'contactos' ? ' cmp-tab--active' : ''}`} onClick={() => setTab('contactos')}>Contactos</button>
        <button className={`cmp-tab${tab === 'campanas'  ? ' cmp-tab--active' : ''}`} onClick={() => setTab('campanas')}>Campañas</button>
      </div>
      {tab === 'contactos' && <ContactosPanel onPlantillasSugeridas={setSugeridas} />}
      {tab === 'campanas'  && <CampanasPanel sugeridas={sugeridas} />}
    </div>
  )
}
