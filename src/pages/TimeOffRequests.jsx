import { useState, useMemo } from 'react'
import { PROF_META, PROF_ORDER } from '../data/staffSchedule'
import { laborablesBetween, fmtShort } from '../utils/coverage'
import { impactoSolicitud, choquesEnSimulador } from '../utils/timeoffPlan'
import { addRequests, updateRequest, deleteRequest } from '../hooks/useTimeOff'

// Solicitudes de vacaciones. Hoy llegan por la app de fichaje externa (fichero
// exportado) o por mensaje/llamada (alta manual). Al aprobarlas cuentan en el plan.

const ESTADOS = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }
const CANALES = { mensaje: 'Mensaje', llamada: 'Llamada', app: 'App de fichaje', fichero: 'Fichero', otro: 'Otro' }

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Nombre del fichero → persona del equipo (por el primer nombre)
export function matchPerson(name) {
  const first = norm(name).split(/[\s,;.]+/)[0]
  return PROF_ORDER.find(p => norm(p) === first) || null
}

// 'dd/mm/yyyy', 'd/m/yy', 'dd-mm-yyyy', 'yyyy-mm-dd' (con hora opcional) → 'yyyy-mm-dd'
function parseDate(raw) {
  const s = String(raw || '').trim().split(/[ T]/)[0]
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return null
}
function iso(y, mo, d) {
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function splitLine(line, sep) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (c === sep && !q) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map(x => x.trim())
}

// Cabeceras reconocidas (el export de 9to5 trae: ID, nombre, tipo, desde, hasta, estado,
// comentario y fecha de solicitud)
const COLS = {
  extId:  /^id$|^id solicitud|^identificador/,
  person: /nombre|persona|empleado|trabajador|usuario|profe/,
  from:   /desde|inicio|comienzo|from|start|fecha ini|primer/,
  to:     /hasta|fin|final|to$|end|ultimo|último/,
  status: /estado|status|situaci/,
  tipo:   /^tipo|^type/,
  nota:   /nota|coment|motivo|observ|descrip/,
}

// CSV (o texto pegado de Excel, separado por tabuladores) → filas de solicitud
export function parseRequestsText(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { rows: [], error: 'El fichero está vacío' }
  const sep = ['\t', ';', ','].map(c => [c, lines[0].split(c).length]).sort((a, b) => b[1] - a[1])[0][0]
  const head = splitLine(lines[0], sep).map(norm)
  const idx = {}
  Object.entries(COLS).forEach(([k, re]) => {
    const i = head.findIndex((h, j) => re.test(h) && !Object.values(idx).includes(j))
    if (i >= 0) idx[k] = i
  })
  if (idx.person == null || idx.from == null) {
    return { rows: [], error: 'No encuentro las columnas de persona y fecha de inicio (cabeceras tipo "Nombre", "Desde", "Hasta")' }
  }
  const rows = lines.slice(1).map((l, n) => {
    const c = splitLine(l, sep)
    const raw = c[idx.person] || ''
    const from = parseDate(c[idx.from])
    const to = idx.to != null ? (parseDate(c[idx.to]) || from) : from
    const st = norm(idx.status != null ? c[idx.status] : '')
    const status = /aprob|approv|acept|concedid|ok/.test(st) ? 'aprobada'
      : /rechaz|reject|denegad|anulad|cancel|revo/.test(st) ? 'rechazada' : 'pendiente'
    const person = matchPerson(raw)
    const tipo = idx.tipo != null ? c[idx.tipo] : ''
    const extId = idx.extId != null ? parseInt(c[idx.extId], 10) || null : null
    const error = !raw ? 'sin nombre' : !from ? 'fecha no válida' : to < from ? 'fin antes del inicio'
      : tipo && !/vacac/.test(norm(tipo)) ? `no es de vacaciones (${tipo})` : null
    return { line: n + 2, raw, person: person || raw, known: !!person, from, to, status, canal: 'fichero', nota: idx.nota != null ? c[idx.nota] : '', extId, error }
  })
  return { rows, error: null }
}

// 'yyyy-mm-dd' → 'yyyymmdd' del día siguiente (fin exclusivo de los eventos de día completo)
function nextDayCompact(s) {
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(y, m - 1, d + 1)
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`
}

function gcalLink(r) {
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `Vacaciones ${r.person}`,
    dates: `${r.from.replace(/-/g, '')}/${nextDayCompact(r.to)}`, details: r.nota || 'Rocomadrid · vacaciones aprobadas',
  })
  return `https://calendar.google.com/calendar/render?${q}`
}

// Calendario .ics con las vacaciones aprobadas (se importa en Google Calendar)
function downloadIcs(requests) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const esc = s => String(s || '').replace(/[\\,;]/g, m => `\\${m}`).replace(/\n/g, '\\n')
  const events = requests.map(r => [
    'BEGIN:VEVENT',
    `UID:${r.id}@rocomadrid-timeoff`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${r.from.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${nextDayCompact(r.to)}`,
    `SUMMARY:${esc(`Vacaciones ${r.person}`)}`,
    r.nota ? `DESCRIPTION:${esc(r.nota)}` : null,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n'))
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rocomadrid//CTRL Time Off//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Vacaciones Rocomadrid', ...events, 'END:VCALENDAR'].join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'vacaciones-rocomadrid.ics'
  a.click()
  URL.revokeObjectURL(url)
}

const emptyForm = () => ({ person: PROF_ORDER[0], from: '', to: '', canal: 'mensaje', status: 'pendiente', nota: '' })

// state: la configuración real (contra la que se aprueba); simState: el plan del simulador (solo informativo)
export default function TimeOffRequests({ requests, setRequests, state, simState, coste, connected }) {
  const [form, setForm]       = useState(emptyForm)
  const [preview, setPreview] = useState(null)
  const [filtro, setFiltro]   = useState('abiertas')
  const [busy, setBusy]       = useState(false)
  const [msg, setMsg]         = useState('')

  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 4000) }

  async function run(fn) {
    setBusy(true)
    try { await fn() } catch (e) { flash(`✗ ${e.message}`) } finally { setBusy(false) }
  }

  // Impacto de cada solicitud abierta sobre lo real (las demás aprobadas y la configuración real)
  const impactos = useMemo(() => {
    const res = {}
    requests.filter(r => r.status !== 'rechazada' && PROF_ORDER.includes(r.person)).forEach(r => {
      res[r.id] = impactoSolicitud(state, coste, requests, r)
    })
    return res
  }, [requests, state, coste])

  // Solo para las pendientes: con quién coincidiría en el plan del simulador
  const enSimulador = useMemo(() => {
    const res = {}
    if (!simState) return res
    requests.filter(r => r.status === 'pendiente' && PROF_ORDER.includes(r.person)).forEach(r => {
      res[r.id] = choquesEnSimulador(simState, coste, r).filter(c => c.level === 'rojo')
    })
    return res
  }, [requests, simState, coste])

  const lista = [...requests]
    .filter(r => filtro === 'todas' || (filtro === 'abiertas' ? r.status !== 'rechazada' : r.status === filtro))
    .sort((a, b) => (b.status === 'pendiente') - (a.status === 'pendiente') || a.from.localeCompare(b.from))
  const aprobadas = requests.filter(r => r.status === 'aprobada')
  const pendientes = requests.filter(r => r.status === 'pendiente').length

  function handleFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => setPreview({ name: f.name, ...parseRequestsText(String(ev.target.result)) })
    reader.readAsText(f, 'utf-8')
  }

  function importar() {
    const ok = preview.rows.filter(r => !r.error)
    run(async () => {
      const res = await addRequests(ok.map(({ person, from, to, status, canal, nota, extId }) => ({ person, from, to, status, canal, nota, ext_id: extId })))
      setRequests(res.requests)
      setPreview(null)
      flash(`✓ ${res.added.length} importadas${res.skipped ? ` · ${res.skipped} ya estaban` : ''}${res.invalid ? ` · ${res.invalid} no válidas` : ''}`)
    })
  }

  function anadir(e) {
    e.preventDefault()
    if (!form.from) return flash('✗ Indica la fecha de inicio')
    const to = form.to || form.from
    if (to < form.from) return flash('✗ La fecha de fin es anterior a la de inicio')
    run(async () => {
      const res = await addRequests([{ ...form, to }])
      setRequests(res.requests)
      setForm(f => ({ ...emptyForm(), person: f.person, canal: f.canal }))
      flash(res.added.length ? '✓ Solicitud añadida' : 'Ya existía una solicitud igual')
    })
  }

  // Las de 9to5 se aprueban/rechazan también allí, con un comentario que ve el trabajador
  const setStatus = (r, status) => {
    let review_comment = ''
    if (r.ext_source === '9to5') {
      const c = window.prompt(`${status === 'aprobada' ? 'Aprobar' : 'Rechazar'} en 9to5 la solicitud de ${r.person}. Comentario para el trabajador (opcional):`, '')
      if (c === null) return
      review_comment = c.trim()
    }
    run(async () => {
      const upd = await updateRequest(r.id, { status, review_comment })
      setRequests(requests.map(x => (x.id === r.id ? upd : x)))
      if (r.ext_source === '9to5') flash(`✓ ${status === 'aprobada' ? 'Aprobada' : 'Rechazada'} también en 9to5`)
    })
  }
  const borrar = r => {
    const aviso = r.ext_source === '9to5' ? '\n\nViene de 9to5: solo se borra aquí y volverá a aparecer si se trae todo de nuevo.' : ''
    if (!window.confirm(`¿Borrar la solicitud de ${r.person} (${fmtShort(r.from)} – ${fmtShort(r.to)})?${aviso}`)) return
    run(async () => {
      await deleteRequest(r.id)
      setRequests(requests.filter(x => x.id !== r.id))
    })
  }

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Solicitudes de vacaciones {pendientes > 0 && <span className="sv-to-badge">{pendientes} pendientes</span>}</h3>
      <p className="sv-note">
        Las piden por 9to5: con la conexión activa llegan solas (y al aprobar o rechazar aquí, el trabajador lo ve en 9to5).
        Sin conexión, sube el fichero que exporta 9to5 (Empresa › Datos de la empresa › Exportar datos, CSV) o añádelas a
        mano si llegan por mensaje o llamada. Cada solicitud se comprueba, en su año, contra <strong>lo real</strong>: las
        vacaciones ya aprobadas y la configuración del año (paro, llaves, cierre). No cuenta lo que se esté probando en el
        Simulador. Como la pide la propia persona, cuenta como acuerdo (no necesita los 2 meses de antelación).
      </p>
      {!connected && <p className="sv-error">Sin conexión con el servidor: no se pueden guardar solicitudes.</p>}

      <div className="sv-to-form">
        <label className="sv-tests-add sv-to-file">
          Importar fichero…
          <input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={handleFile} disabled={!connected || busy} />
        </label>
        {aprobadas.length > 0 && (
          <button className="sv-filter-btn" onClick={() => downloadIcs(aprobadas)}>
            Descargar aprobadas para Google Calendar (.ics)
          </button>
        )}
        {msg && <span className="sv-tests-feedback">{msg}</span>}
      </div>

      {preview && (
        <div className="sv-class-detail">
          <div className="sv-class-detail__title">{preview.name}</div>
          {preview.error ? <p className="sv-error">{preview.error}</p> : (
            <>
              <div className="sv-tests-scroll">
                <table className="sv-tests-table">
                  <thead><tr><th>Fila</th><th>Persona</th><th>Desde</th><th>Hasta</th><th>Estado</th><th>Nota</th><th></th></tr></thead>
                  <tbody>
                    {preview.rows.map(r => (
                      <tr key={r.line}>
                        <td className="sv-ot-muted">{r.line}</td>
                        <td className={r.known ? '' : 'sv-to-warn-txt'} title={r.known ? r.raw : 'No es nadie del equipo: se importa con este nombre pero no cuenta en el plan'}>{r.person}</td>
                        <td>{r.from ? fmtShort(r.from) : '—'}</td>
                        <td>{r.to ? fmtShort(r.to) : '—'}</td>
                        <td>{ESTADOS[r.status]}</td>
                        <td className="sv-ot-muted">{r.nota}</td>
                        <td className={r.error ? 'sv-to-bad' : 'sv-to-good'}>{r.error || '✓'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sv-to-form">
                <button className="sv-tests-add" disabled={busy || !preview.rows.some(r => !r.error)} onClick={importar}>
                  Importar {preview.rows.filter(r => !r.error).length}
                </button>
                <button className="sv-filter-btn" onClick={() => setPreview(null)}>Cancelar</button>
              </div>
            </>
          )}
        </div>
      )}

      <form className="sv-to-form" onSubmit={anadir}>
        <select className="sv-tests-select" value={form.person} onChange={e => setForm({ ...form, person: e.target.value })}
          style={{ color: PROF_META[form.person]?.color }}>
          {PROF_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="sv-to-inline">Desde <input className="sv-tests-input" type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} /></label>
        <label className="sv-to-inline">Hasta <input className="sv-tests-input" type="date" value={form.to} min={form.from} onChange={e => setForm({ ...form, to: e.target.value })} /></label>
        <select className="sv-tests-select" value={form.canal} onChange={e => setForm({ ...form, canal: e.target.value })}>
          {Object.entries(CANALES).filter(([k]) => k !== 'fichero').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="sv-tests-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          {Object.entries(ESTADOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="sv-tests-input sv-tests-input--desc" placeholder="Nota (opcional)" value={form.nota} maxLength={300}
          onChange={e => setForm({ ...form, nota: e.target.value })} />
        <button className="sv-tests-add" type="submit" disabled={!connected || busy}>+ Añadir solicitud</button>
      </form>

      <div className="sv-period" style={{ margin: '6px 0 10px' }}>
        {[['abiertas', 'Pendientes y aprobadas'], ['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas'], ['todas', 'Todas']].map(([k, l]) => (
          <button key={k} className={`sv-period__btn${filtro === k ? ' sv-period__btn--active' : ''}`} onClick={() => setFiltro(k)}>{l}</button>
        ))}
      </div>
      {lista.length === 0 ? <p className="sv-empty">No hay solicitudes.</p> : (
        <div className="sv-tests-scroll">
          <table className="sv-tests-table">
            <thead>
              <tr><th>Persona</th><th>Fechas</th><th>Laborables</th><th>Vía</th><th>Estado</th><th>Comprobación</th><th></th></tr>
            </thead>
            <tbody>
              {lista.map(r => {
                const imp = impactos[r.id]
                const rojos = imp?.choques.filter(c => c.level === 'rojo') || []
                const ambar = imp?.choques.filter(c => c.level === 'ambar') || []
                const parejas = arr => [...new Set(arr.map(c => (c.a === r.person ? c.b : c.a)))].join(', ')
                return (
                  <tr key={r.id}>
                    <td style={{ color: PROF_META[r.person]?.color, fontWeight: 700 }}>
                      {r.person}{!PROF_ORDER.includes(r.person) && <span className="sv-ot-muted" title="No es nadie del equipo"> ?</span>}
                    </td>
                    <td>{fmtShort(r.from)}{r.to !== r.from && <> – {fmtShort(r.to)}</>}</td>
                    <td>{laborablesBetween(r.from, r.to).length}</td>
                    <td className="sv-ot-muted" title={r.nota || ''}>
                      {r.ext_source === '9to5' ? <span className="sv-to-badge sv-to-badge--ext">9to5</span> : (CANALES[r.canal] || r.canal)}
                      {r.nota ? ' · 💬' : ''}
                    </td>
                    <td className={r.status === 'aprobada' ? 'sv-to-good' : r.status === 'rechazada' ? 'sv-ot-muted' : 'sv-to-warn-txt'}>
                      {ESTADOS[r.status]}
                      {r.ext_status && ['cancelled', 'revoked'].includes(r.ext_status) && <span className="sv-ot-muted"> ({r.ext_status === 'cancelled' ? 'cancelada' : 'revocada'})</span>}
                      {r.review_comment && <div className="sv-ot-muted" title={r.reviewed_by || ''}>«{r.review_comment}»</div>}
                    </td>
                    <td className="sv-to-check">
                      {!imp ? <span className="sv-ot-muted">—</span> : (
                        <>
                          {imp.ok && !ambar.length && <span className="sv-to-good">Sin conflictos</span>}
                          {rojos.length > 0 && <div className="sv-to-bad">Coincide con {parejas(rojos)} ({rojos.length} días)</div>}
                          {ambar.length > 0 && <div className="sv-to-warn-txt">Evitar: {parejas(ambar)} ({ambar.length} días)</div>}
                          {imp.restan != null && imp.restan < 0 && <div className="sv-to-bad">Se pasa {-imp.restan} días de lo que le toca</div>}
                          {enSimulador[r.id]?.length > 0 && (
                            <div className="sv-ot-muted">En el simulador coincidiría con {parejas(enSimulador[r.id])}</div>
                          )}
                          {imp.nuevos.filter(w => !w.text.startsWith('Coinciden')).map((w, i) => (
                            <div key={i} className={w.lvl === 'bad' ? 'sv-to-bad' : 'sv-to-warn-txt'}>{w.text}</div>
                          ))}
                        </>
                      )}
                    </td>
                    <td className="sv-to-actions">
                      {r.status !== 'aprobada' && <button className="sv-filter-btn" disabled={busy} onClick={() => setStatus(r, 'aprobada')}>Aprobar</button>}
                      {r.status !== 'rechazada' && <button className="sv-filter-btn" disabled={busy} onClick={() => setStatus(r, 'rechazada')}>Rechazar</button>}
                      {r.status !== 'pendiente' && r.ext_source !== '9to5' && <button className="sv-filter-btn" disabled={busy} onClick={() => setStatus(r, 'pendiente')}>A pendiente</button>}
                      {r.status === 'aprobada' && <a className="sv-filter-btn" href={gcalLink(r)} target="_blank" rel="noreferrer">Google Calendar</a>}
                      <button className="sv-tests-remove" disabled={busy} onClick={() => borrar(r)}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
