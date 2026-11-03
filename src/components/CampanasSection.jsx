import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  campanasContactosImportar, campanasContactosGet, campanasEnviosHoyGet,
  campanasListar, campanasCrear, campanasEditar, campanasDestinatarios, campanasMarcarAccion,
  campanasDeshacerEnviados,
} from '../hooks/useSuperAdmin'
import './CampanasSection.css'

const LISTA_LABEL = {
  actuales: 'Actuales', nuevos: 'Nuevos', en_espera: 'En espera (impago reciente)', antiguos: 'Antiguos',
  bajas: 'Bajas de mensajes', sin_clasificar: 'Sin clasificar',
}
const CAMPANA_LISTAS = ['actuales', 'nuevos', 'en_espera', 'antiguos']

// Marca de consentimiento de WhatsApp, igual en Contactos y en la lista de envío de una
// campaña: gris = sin preguntar, verde = sí, rojo = no/BAJA.
function WaMark({ value }) {
  const cls = value === 'si' ? 'cmp-wa--si' : value === 'no' ? 'cmp-wa--no' : 'cmp-wa--sin'
  const label = value === 'si' ? 'Sí' : value === 'no' ? 'No/BAJA' : 'Sin preguntar'
  return <span className={`cmp-wa ${cls}`} title={`WhatsApp: ${label}`}>(WA)</span>
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
  const [pendiente, setPendiente] = useState(null) // { filas, porHoja, preview, plantillas }
  const [confirmado, setConfirmado] = useState(null)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async e => {
    const file = e.target.files[0]
    if (!file) return
    setError(null); setConfirmado(null); setPendiente(null); setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const { filas, porHoja, plantillaAdulto, plantillaMenor, remitente } = parseContactsWorkbook(buf)
      if (!filas.length) { setError('No se encontraron contactos con teléfono en el archivo.'); setLoading(false); return }
      const preview = await campanasContactosImportar({ filas, simular: true })
      setPendiente({ filas, porHoja, preview, plantillas: { plantillaAdulto, plantillaMenor, remitente } })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const confirmar = async () => {
    if (!pendiente) return
    setLoading(true); setError(null)
    try {
      const res = await campanasContactosImportar({ filas: pendiente.filas })
      setConfirmado({ ...res, porHoja: pendiente.porHoja })
      const { plantillaAdulto, plantillaMenor, remitente } = pendiente.plantillas
      if ((plantillaAdulto || plantillaMenor || remitente) && onPlantillasSugeridas) {
        onPlantillasSugeridas(pendiente.plantillas)
      }
      setPendiente(null)
      if (onImported) onImported()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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

      {pendiente && (
        <div className="cmp-preview">
          <p className="cmp-hint">
            Revisar antes de confirmar: {pendiente.preview.nuevos} nuevos, {pendiente.preview.actualizados} actualizados
            {pendiente.preview.sinTelefono ? `, ${pendiente.preview.sinTelefono} sin teléfono (se omiten)` : ''}.
            {' '}Por hoja: {Object.entries(pendiente.porHoja).map(([h, n]) => `${h} (${n})`).join(' · ')}.
          </p>
          <p className="cmp-hint">
            Listas resultantes: {Object.entries(pendiente.preview.porLista || {}).filter(([, n]) => n > 0).map(([k, n]) => `${LISTA_LABEL[k] || k}: ${n}`).join(' · ')}
          </p>
          <div className="cmp-acciones">
            <button className="cmp-btn cmp-btn--primary" onClick={confirmar} disabled={loading}>
              {loading ? 'Importando…' : `Confirmar: cargar ${pendiente.preview.nuevos + pendiente.preview.actualizados} contactos`}
            </button>
            <button className="cmp-btn" onClick={() => setPendiente(null)} disabled={loading}>Cancelar</button>
          </div>
        </div>
      )}

      {confirmado && (
        <p className="cmp-hint">
          ✓ Importado: {confirmado.nuevos} nuevos, {confirmado.actualizados} actualizados
          {confirmado.sinTelefono ? `, ${confirmado.sinTelefono} sin teléfono (omitidos)` : ''}.
        </p>
      )}
    </div>
  )
}

function ContactosPanel({ onPlantillasSugeridas }) {
  const [lista, setLista]       = useState('all')
  const [tipo, setTipo]         = useState('all')
  const [soloOptin, setSoloOptin] = useState('all')
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
        {data && (
          <select className="cmp-select" value={soloOptin} onChange={e => setSoloOptin(e.target.value)}>
            <option value="all">Consentimiento: todos</option>
            <option value="si">Sí ({data.resumenOptin?.si || 0})</option>
            <option value="no">No / BAJA ({data.resumenOptin?.no || 0})</option>
            <option value="sin_preguntar">Sin preguntar ({data.resumenOptin?.sin_preguntar || 0})</option>
          </select>
        )}
      </div>

      {loading && <p className="cmp-hint">Cargando…</p>}
      {error && <p className="cmp-error">Error: {error}</p>}
      {data && (
        <div className="cmp-table-wrap">
          <table className="cmp-table">
            <thead>
              <tr><th>Teléfono</th><th>Nombres</th><th>Tipo</th><th>Lista</th><th>Origen</th><th>WhatsApp</th></tr>
            </thead>
            <tbody>
              {data.contactos.filter(c => soloOptin === 'all' || (c.optinWhatsapp || 'sin_preguntar') === soloOptin).map(c => (
                <tr key={c.id}>
                  <td>{c.telefono}</td>
                  <td>{c.nombres.join(', ')}</td>
                  <td>{c.tipo}</td>
                  <td><span className={`cmp-badge cmp-badge--${c.lista || 'sin_clasificar'}`}>{LISTA_LABEL[c.lista || 'sin_clasificar']}</span></td>
                  <td className="cmp-muted">{c.origen}</td>
                  <td><WaMark value={c.optinWhatsapp} /></td>
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

function CrearCampanaPanel({ sugeridas, onCreated, editando, onEdited, onCancelEdit }) {
  const base = editando || {}
  const [nombre, setNombre]               = useState(base.nombre || '')
  const [listas, setListas]               = useState(() => {
    const init = { actuales: false, nuevos: false, en_espera: false, antiguos: true }
    if (editando) { Object.keys(init).forEach(k => { init[k] = editando.listas.includes(k) }) }
    return init
  })
  const [plantillaAdulto, setPlantillaAdulto] = useState(base.plantillaAdulto || '')
  const [plantillaMenor, setPlantillaMenor]   = useState(base.plantillaMenor || '')
  const [remitente, setRemitente]         = useState(base.remitente || '')
  const [fechaFin, setFechaFin]           = useState(base.fechaFin || '')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState(null)

  useEffect(() => {
    if (!sugeridas || editando) return
    if (sugeridas.plantillaAdulto && !plantillaAdulto) setPlantillaAdulto(sugeridas.plantillaAdulto)
    if (sugeridas.plantillaMenor  && !plantillaMenor)  setPlantillaMenor(sugeridas.plantillaMenor)
    if (sugeridas.remitente       && !remitente)       setRemitente(sugeridas.remitente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugeridas])

  const handleGuardar = async () => {
    setError(null)
    const listasElegidas = Object.entries(listas).filter(([, v]) => v).map(([k]) => k)
    if (!nombre.trim()) { setError('Pon un nombre a la campaña.'); return }
    if (!listasElegidas.length) { setError('Elige al menos una lista.'); return }
    setSaving(true)
    try {
      const body = { nombre, listas: listasElegidas, plantillaAdulto, plantillaMenor, remitente, fechaFin: fechaFin || null }
      if (editando) {
        await campanasEditar(editando.id, body)
        if (onEdited) onEdited()
      } else {
        await campanasCrear(body)
        setNombre(''); setFechaFin('')
        if (onCreated) onCreated()
      }
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
          {CAMPANA_LISTAS.map(k => (
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
      <div className="cmp-acciones">
        <button className="cmp-btn cmp-btn--primary" onClick={handleGuardar} disabled={saving}>
          {saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear campaña'}
        </button>
        {editando && <button className="cmp-btn" onClick={onCancelEdit} disabled={saving}>Cancelar</button>}
      </div>
    </div>
  )
}

// Para que buscar "Ana" o "612345678" encuentre "Ana" / "+34 612 345 678" sin tener que
// escribir espacios, el prefijo del país o las tildes exactas.
function normalizarBusqueda(s) {
  return (s || '').toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\+?34/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function formatearFechaHora(iso) {
  if (!iso) return ''
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' '
    + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function QuienCuando({ info }) {
  if (!info || !info.por) return null
  return <div className="cmp-quien">{info.por} · {formatearFechaHora(info.fecha)}</div>
}

const FILTROS_DESTINATARIOS = [
  { id: 'pendientes',   label: 'Sin enviar' },
  { id: 'enviados',     label: 'Enviados (esperando respuesta)' },
  { id: 'respondieron', label: 'Respondieron' },
  { id: 'bajas',        label: 'Bajas' },
  { id: 'apuntados',    label: 'Se apuntaron' },
]

function clasificarDestinatario(d) {
  if (d.baja) return 'bajas'
  if (d.apuntado) return 'apuntados'
  if (d.respondio) return 'respondieron'
  if (d.enviado) return 'enviados'
  return 'pendientes'
}

function DestinatariosPanel({ campana, onBack, onChanged }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [enviadosHoy, setEnviadosHoy] = useState(0)
  const [filtro, setFiltro]   = useState('pendientes')
  const [busqueda, setBusqueda] = useState('')

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
    // web.whatsapp.com/send, no wa.me: wa.me pasa por api.whatsapp.com, que abre la app de
    // escritorio en vez de la pestaña de WhatsApp Web ya abierta y rompía los emojis del mensaje
    // (NOTAS_PARA_CODE_pestanas_grupos.md, 3/11 10:45). Ventana con nombre fijo para reutilizarla.
    const url = `https://web.whatsapp.com/send?phone=34${d.telefono}&text=${encodeURIComponent(d.mensaje)}`
    window.open(url, 'blokes_whatsapp')
    accion(d.contactoId, 'enviado')
  }

  const marcarBaja = (d) => {
    const nombre = d.nombres.join(', ') || d.telefono
    if (!window.confirm(`¿Marcar a ${nombre} como BAJA? No volverá a recibir campañas.`)) return
    accion(d.contactoId, 'baja')
  }

  if (loading) return <p className="cmp-hint">Cargando destinatarios…</p>
  if (error)   return <p className="cmp-error">Error: {error}</p>
  if (!data)   return null

  const base = (data.destinatarios || []).filter(d => !d.yaEnVigor)
  const porEstado = { pendientes: 0, enviados: 0, respondieron: 0, bajas: 0, apuntados: 0 }
  base.forEach(d => { porEstado[clasificarDestinatario(d)]++ })

  const q = normalizarBusqueda(busqueda)
  const visibles = base.filter(d => {
    if (clasificarDestinatario(d) !== filtro) return false
    if (!q) return true
    return normalizarBusqueda(d.telefono).includes(q) || d.nombres.some(n => normalizarBusqueda(n).includes(q))
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
      {enviadosHoy > 0 && enviadosHoy < 40 && <p className="cmp-hint">Enviados hoy: {enviadosHoy}/40</p>}

      <input
        className="cmp-buscar"
        type="text"
        placeholder="Buscar por nombre o teléfono…"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
      />

      <div className="cmp-filters">
        {FILTROS_DESTINATARIOS.map(f => (
          <button
            key={f.id}
            className={`cmp-filtro-btn${filtro === f.id ? ' cmp-filtro-btn--active' : ''}`}
            onClick={() => setFiltro(f.id)}
          >
            {f.label} ({porEstado[f.id]})
          </button>
        ))}
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
                <td>{d.nombres.join(', ')} <WaMark value={d.optinWhatsapp} /></td>
                <td className="cmp-mensaje">{d.mensaje}</td>
                <td>
                  {d.apuntado && <span className="cmp-badge cmp-badge--actuales">Se apuntó</span>}
                  {!d.apuntado && d.baja && <span className="cmp-badge cmp-badge--bajas">BAJA</span>}
                  {!d.apuntado && !d.baja && d.respondio && <span className="cmp-badge cmp-badge--nuevos">Respondió</span>}
                  {!d.apuntado && !d.baja && !d.respondio && d.enviado && <span className="cmp-badge cmp-badge--sin_clasificar">Enviado {d.enviado.fecha?.slice(0, 10)}</span>}
                  {!d.enviado && !d.baja && <span className="cmp-muted">Sin enviar</span>}
                  <QuienCuando info={d.baja || d.apuntado || d.respondio || d.enviado} />
                </td>
                <td className="cmp-acciones">
                  <button className="cmp-btn cmp-btn--sm cmp-btn--primary" onClick={() => abrirWhatsapp(d)}>Abrir WhatsApp</button>
                  <button className="cmp-btn cmp-btn--sm" onClick={() => accion(d.contactoId, 'respondio')}>Respondió</button>
                  <button className="cmp-btn cmp-btn--sm" onClick={() => accion(d.contactoId, 'apuntado')}>Se apuntó</button>
                  {d.baja ? (
                    <button className="cmp-btn cmp-btn--sm" onClick={() => accion(d.contactoId, 'baja_deshacer')}>Deshacer baja</button>
                  ) : (
                    <button className="cmp-btn cmp-btn--sm cmp-btn--danger" onClick={() => marcarBaja(d)}>BAJA</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="cmp-empty">Nada que mostrar con este filtro{busqueda ? ' y esta búsqueda' : ''}.</p>}
      </div>
    </div>
  )
}

function CampanasPanel({ sugeridas }) {
  const [campanas, setCampanas] = useState(null)
  const [error, setError]       = useState(null)
  const [abierta, setAbierta]   = useState(null)
  const [editando, setEditando] = useState(null)
  const [verArchivadas, setVerArchivadas] = useState(false)
  const [refreshKey, setRefresh] = useState(0)

  const cargar = () => campanasListar().then(setCampanas).catch(e => setError(e.message))
  useEffect(cargar, [refreshKey])

  if (abierta) {
    return <DestinatariosPanel campana={abierta} onBack={() => { setAbierta(null); setRefresh(k => k + 1) }} onChanged={cargar} />
  }

  const archivar = async (c, activa) => {
    await campanasEditar(c.id, { activa })
    setRefresh(k => k + 1)
  }

  // Ramiro, 3/11 12:10: alguna campaña se queda con contactos marcados "enviado" por pruebas,
  // sin haberse mandado nada de verdad — esto los deja todos como pendientes otra vez.
  const deshacerEnviados = async c => {
    if (!window.confirm(`¿Quitar el "enviado" de los ${c.enviados} contacto(s) de «${c.nombre}»? Volverán a salir como pendientes. No se pierde quién respondió, se dio de baja o se apuntó.`)) return
    try {
      const res = await campanasDeshacerEnviados(c.id)
      window.alert(`Hecho: ${res.filas} fila(s) actualizadas.`)
    } catch (e) { window.alert(e.message) }
    setRefresh(k => k + 1)
  }

  const visibles = (campanas || []).filter(c => verArchivadas || c.activa)

  return (
    <div className="cmp-panel">
      <h3 className="cmp-title">{editando ? 'Editar campaña' : 'Nueva campaña'}</h3>
      <CrearCampanaPanel
        sugeridas={sugeridas}
        editando={editando}
        onCreated={() => setRefresh(k => k + 1)}
        onEdited={() => { setEditando(null); setRefresh(k => k + 1) }}
        onCancelEdit={() => setEditando(null)}
      />
      <div className="cmp-divider" />
      <h3 className="cmp-title">Campañas</h3>
      <label className="cmp-check" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={verArchivadas} onChange={e => setVerArchivadas(e.target.checked)} />
        Ver también las archivadas
      </label>
      {error && <p className="cmp-error">Error: {error}</p>}
      {campanas && visibles.length === 0 && <p className="cmp-empty">Todavía no hay campañas creadas.</p>}
      {visibles.map(c => (
        <div key={c.id} className={`cmp-campana-row${!c.activa ? ' cmp-campana-row--archivada' : ''}`}>
          <div>
            <strong>{c.nombre}</strong>{!c.activa && <span className="cmp-muted"> (archivada)</span>}
            <span className="cmp-muted"> — {c.listas.map(l => LISTA_LABEL[l]).join(', ')}</span>
          </div>
          <div className="cmp-campana-stats">
            <span>Enviados: {c.enviados}</span>
            <span>Respondidos: {c.respondidos}</span>
            <span>Bajas: {c.bajas}</span>
            <span>Se apuntaron: {c.apuntados}</span>
          </div>
          <div className="cmp-acciones">
            <button className="cmp-btn cmp-btn--primary" onClick={() => setAbierta(c)}>Enviar / ver destinatarios</button>
            <button className="cmp-btn" onClick={() => setEditando(c)}>Editar</button>
            <button className="cmp-btn" onClick={() => archivar(c, !c.activa)}>{c.activa ? 'Archivar' : 'Reactivar'}</button>
            {c.enviados > 0 && (
              <button className="cmp-btn" onClick={() => deshacerEnviados(c)}>Deshacer enviados (eran pruebas)</button>
            )}
          </div>
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
        Campañas de WhatsApp (envío manual, enlaces de WhatsApp Web — sin API de Meta por ahora). Las listas (Actuales,
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
