import { useState, useEffect, useRef } from 'react'
import {
  useProjects, saveProjects, STATUSES, statusLabel, nextStatus, QTY_REFS,
  zoneMeasures, itemQty, itemPrice, itemAmount, zoneTotals, chapterTotal, newId, emptyItem,
} from '../hooks/useProjects'
import { CLAUDE_PROMPT, parseImport, applyImport } from '../utils/projectsImport'
import { fmtEur } from '../utils/monthFormat'
import './ProjectsSection.css'

const SUMMARY = '__resumen__'
const fmtNum  = n => n == null ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })
const toNum   = v => v === '' ? null : Number(v)

function StatusButton({ status, onClick }) {
  return (
    <button className={`pr-status pr-status--${status}`} onClick={onClick} title="Pulsa para cambiar el estado">
      {statusLabel(status)}
    </button>
  )
}

// ─── Importar partidas ──────────────────────────────────────────────────────
function ImportPanel({ zones, currentZone, onImport, onClose }) {
  const [text,    setText]    = useState('')
  const [preview, setPreview] = useState(null)
  const [error,   setError]   = useState('')
  const [copied,  setCopied]  = useState(false)

  function handlePreview() {
    setError(''); setPreview(null)
    try {
      setPreview(parseImport(text, currentZone?.name))
    } catch (e) {
      setError(e.message)
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CLAUDE_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('No se ha podido copiar. Selecciona el texto de abajo a mano.')
    }
  }

  const exists = (name, list) => list.some(x => x.name.trim().toLowerCase() === name.trim().toLowerCase())

  return (
    <div className="sa-pay-file pr-import">
      <div className="sa-pay-file__head">
        <div>
          <h3 className="sa-pay-file__title">Importar partidas</h3>
          <p className="sa-pay-file__meta">
            Pide a Claude que presupueste algo y pega aquí su respuesta (entera, o solo el bloque JSON).
            Antes de guardar verás qué se va a añadir.
          </p>
        </div>
        <button className="sa-pay-action" onClick={onClose}>Cerrar</button>
      </div>

      <div className="pr-import__help">
        <button className="sa-pay-action" onClick={copyPrompt}>
          {copied ? '✓ Copiadas' : 'Copiar instrucciones para Claude'}
        </button>
        <span className="sa-pay-muted">Pégalas una vez en el chat (o en las instrucciones del Proyecto) y Claude responderá en el formato correcto.</span>
      </div>
      <div className="pr-import__help">
        <label className="sa-pay-action pr-file">
          Cargar archivo .json
          <input
            type="file" accept=".json,application/json,text/plain" hidden
            onChange={async e => {
              const f = e.target.files?.[0]
              if (f) { setText(await f.text()); setPreview(null); setError('') }
              e.target.value = ''
            }}
          />
        </label>
        <span className="sa-pay-muted">o pega el texto aquí abajo.</span>
      </div>

      <textarea
        className="sa-pay-textarea pr-import__text" rows={10}
        placeholder={'{ "zona": "Sala de Yoga", "capitulos": [ { "nombre": "Suelo", "partidas": [ … ] } ] }'}
        value={text} onChange={e => { setText(e.target.value); setPreview(null) }}
      />
      {!preview && (
        <div className="sa-pay-actions">
          <button className="sa-list-save__btn" onClick={handlePreview} disabled={!text.trim()}>Ver qué se añade</button>
          {currentZone && <span className="sa-pay-muted">Si el texto no indica zona, irá a «{currentZone.name}».</span>}
        </div>
      )}
      {error && <p className="sa-error">{error}</p>}

      {preview && (
        <div className="pr-import__preview">
          {preview.map((g, i) => {
            const zone = zones.find(z => z.name.trim().toLowerCase() === g.zone.trim().toLowerCase())
            return (
              <div key={i} className="pr-import__zone">
                <strong>{g.zone}</strong> {zone ? <span className="sa-pay-muted">· zona existente</span> : <span className="sa-pay-tag">zona nueva</span>}
                <ul>
                  {g.chapters.map((c, k) => (
                    <li key={k}>
                      {c.name} {!(zone && exists(c.name, zone.chapters)) && <span className="sa-pay-tag">capítulo nuevo</span>}
                      {' · '}{c.items.length} partida{c.items.length === 1 ? '' : 's'}
                      {' · '}{fmtEur(c.items.filter(it => it.status !== 'descartado').reduce((s, it) => s + it.qty * itemPrice(it), 0))}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          <div className="sa-pay-actions">
            <button className="sa-list-save__btn" onClick={() => onImport(preview)}>Confirmar e importar</button>
            <button className="sa-pay-action" onClick={() => setPreview(null)}>Volver</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Resumen general ────────────────────────────────────────────────────────
function Summary({ zones, onOpen }) {
  const rows = zones.map(z => ({ zone: z, t: zoneTotals(z) }))
  const sum  = k => rows.reduce((s, r) => s + r.t[k], 0)

  return (
    <div className="sa-section">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Resumen general</h2>
      </div>
      <div className="sa-kpis">
        <div className="sa-kpi" style={{ '--kpi-color': '#f0ece0' }}>
          <span className="sa-kpi__value">{fmtEur(sum('total'))}</span>
          <span className="sa-kpi__label">Total con IVA</span>
        </div>
        {STATUSES.filter(s => s.id !== 'descartado').map(s => (
          <div key={s.id} className={`sa-kpi pr-kpi--${s.id}`}>
            <span className="sa-kpi__value">{fmtEur(sum(s.id))}</span>
            <span className="sa-kpi__label">{s.label}</span>
          </div>
        ))}
      </div>
      {zones.length === 0
        ? <p className="sa-pay-empty sa-pay-muted">Aún no hay zonas. Crea una con «+ Zona» o importa partidas.</p>
        : (
          <div className="sa-pay-scroll">
            <table className="sa-pay-table">
              <thead>
                <tr>
                  <th>Zona</th>
                  {STATUSES.filter(s => s.id !== 'descartado').map(s => <th key={s.id} className="sa-pay-num">{s.label}</th>)}
                  <th className="sa-pay-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ zone, t }) => (
                  <tr key={zone.id}>
                    <td><button className="pr-link" onClick={() => onOpen(zone.id)}>{zone.name}</button></td>
                    {STATUSES.filter(s => s.id !== 'descartado').map(s => <td key={s.id} className="sa-pay-num">{fmtEur(t[s.id])}</td>)}
                    <td className="sa-pay-num sa-pay-strong">{fmtEur(t.total)}</td>
                  </tr>
                ))}
                <tr className="sa-pay-total">
                  <td>Total</td>
                  {STATUSES.filter(s => s.id !== 'descartado').map(s => <td key={s.id} className="sa-pay-num">{fmtEur(sum(s.id))}</td>)}
                  <td className="sa-pay-num">{fmtEur(sum('total'))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      <p className="sa-pay-note">
        Precios con IVA incluido. Las partidas «Descartado» no suman: sirven para guardar alternativas (por ejemplo, otras opciones de suelo).
      </p>
    </div>
  )
}

// ─── Una zona ───────────────────────────────────────────────────────────────
function ItemRow({ item, measures, onChange, onDelete }) {
  const [open, setOpen] = useState(false)
  const set    = (field, value) => onChange({ ...item, [field]: value })
  const linked = item.qty_ref && measures[item.qty_ref] != null
  const meta   = [item.supplier, item.price_type, item.checked_at && `consultado ${item.checked_at.split('-').reverse().join('/')}`].filter(Boolean).join(' · ')
  return (
    <>
      <tr className={item.status === 'descartado' ? 'pr-row--discarded' : ''}>
        <td className="pr-concept">
          <input className="pr-input pr-input--wide" value={item.concept} onChange={e => set('concept', e.target.value)} />
          <div className="pr-meta-line">
            <button className="pr-link" onClick={() => setOpen(o => !o)}>{open ? '▾ Detalles' : '▸ Detalles'}</button>
            {meta && <span>{meta}</span>}
            {/^https?:\/\//.test(item.source) && <a href={item.source} target="_blank" rel="noopener noreferrer">{item.source_name || 'fuente'} ↗</a>}
          </div>
          {!open && item.description && <div className="pr-desc">{item.description}</div>}
          {!open && item.note && <div className="pr-note">{item.note}</div>}
        </td>
        <td className="sa-pay-num">
          {linked
            ? <span title={`${QTY_REFS.find(r => r.id === item.qty_ref).label} × ${item.qty_factor}`}>{fmtNum(itemQty(item, measures))}</span>
            : <input type="number" min="0" step="0.01" className="sa-pay-input pr-input--qty" value={item.qty} onChange={e => set('qty', toNum(e.target.value) ?? 0)} />}
        </td>
        <td><input className="pr-input pr-input--unit" value={item.unit} onChange={e => set('unit', e.target.value)} /></td>
        <td className="sa-pay-num">
          <input type="number" min="0" step="0.01" className={`sa-pay-input${item.price_got != null ? ' pr-price--superseded' : ''}`} value={item.price} onChange={e => set('price', toNum(e.target.value) ?? 0)} />
        </td>
        <td className="sa-pay-num">
          <input type="number" min="0" step="0.01" placeholder="—" className="sa-pay-input pr-price--got" value={item.price_got ?? ''} onChange={e => set('price_got', toNum(e.target.value))} />
        </td>
        <td className="sa-pay-num sa-pay-strong">{fmtEur(itemAmount(item, measures))}</td>
        <td><StatusButton status={item.status} onClick={() => set('status', nextStatus(item.status))} /></td>
        <td><button className="pr-del" onClick={onDelete} title="Borrar partida">✕</button></td>
      </tr>
      {open && (
        <tr className="pr-details">
          <td colSpan={8}>
            <div className="pr-details__grid">
              <label><span>Cantidad según</span>
                <select className="pr-select" value={item.qty_ref} onChange={e => set('qty_ref', e.target.value)}>
                  {QTY_REFS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </label>
              {item.qty_ref && (
                <label title="1,1 = un 10 % más por merma"><span>Multiplicador</span>
                  <input type="number" min="0" step="0.05" className="sa-pay-input" value={item.qty_factor} onChange={e => set('qty_factor', toNum(e.target.value) ?? 1)} />
                </label>
              )}
              <label><span>Tipo de precio</span><input className="pr-input" placeholder="estimación, tienda, presupuesto…" value={item.price_type} onChange={e => set('price_type', e.target.value)} /></label>
              <label><span>Proveedor</span><input className="pr-input" value={item.supplier} onChange={e => set('supplier', e.target.value)} /></label>
              <label><span>Fuente</span><input className="pr-input" placeholder="Leroy Merlin – tira LED…" value={item.source_name} onChange={e => set('source_name', e.target.value)} /></label>
              <label><span>Enlace</span><input className="pr-input" placeholder="https://…" value={item.source} onChange={e => set('source', e.target.value)} /></label>
              <label><span>Fecha de consulta</span><input type="date" className="pr-input" value={item.checked_at} onChange={e => set('checked_at', e.target.value)} /></label>
              <label className="pr-details__wide"><span>Descripción</span>
                <textarea className="sa-pay-textarea" rows={2} maxLength={600} value={item.description} onChange={e => set('description', e.target.value)} />
              </label>
              <label className="pr-details__wide"><span>Notas</span>
                <textarea className="sa-pay-textarea" rows={2} maxLength={600} value={item.note} onChange={e => set('note', e.target.value)} />
              </label>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ZoneView({ zone, onChange, onDelete }) {
  const measures = zoneMeasures(zone)
  const totals   = zoneTotals(zone)
  const set      = (field, value) => onChange({ ...zone, [field]: value })
  const setMeasure = (field, value) => set('measures', { ...zone.measures, [field]: toNum(value) })
  const setChapter = (id, fn) => set('chapters', zone.chapters.map(c => c.id === id ? fn(c) : c))

  function addChapter() {
    const name = window.prompt('Nombre del capítulo (por ejemplo, Suelo)')
    if (name?.trim()) set('chapters', [...zone.chapters, { id: newId(), name: name.trim(), items: [] }])
  }
  function moveChapter(i, delta) {
    const list = [...zone.chapters]
    const j = i + delta
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    set('chapters', list)
  }
  const addItem = id => setChapter(id, c => ({ ...c, items: [...c.items, emptyItem()] }))

  return (
    <>
      <div className="sa-section">
        <div className="sa-section__header">
          <div className="pr-zone-head">
            <input className="pr-input pr-zone-name" value={zone.name} onChange={e => set('name', e.target.value)} />
            <input className="pr-input pr-zone-location" placeholder="Ubicación (planta, junto a…)" value={zone.location || ''} onChange={e => set('location', e.target.value)} />
          </div>
          <button className="sa-pay-action pr-danger" onClick={onDelete}>Borrar zona</button>
        </div>
        <div className="sa-kpis">
          <div className="sa-kpi" style={{ '--kpi-color': '#f0ece0' }}>
            <span className="sa-kpi__value">{fmtEur(totals.total)}</span>
            <span className="sa-kpi__label">Total con IVA</span>
          </div>
          {STATUSES.filter(s => s.id !== 'descartado').map(s => (
            <div key={s.id} className={`sa-kpi pr-kpi--${s.id}`}>
              <span className="sa-kpi__value">{fmtEur(totals[s.id])}</span>
              <span className="sa-kpi__label">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="pr-measures">
          {[['largo', 'Largo (m)'], ['ancho', 'Ancho (m)'], ['alto', 'Alto (m)']].map(([k, label]) => (
            <label key={k} className="pr-measure">
              <span>{label}</span>
              <input type="number" min="0" step="0.01" className="sa-pay-input" placeholder="—" value={zone.measures?.[k] ?? ''} onChange={e => setMeasure(k, e.target.value)} />
            </label>
          ))}
          <div className="pr-measure pr-measure--out">
            <span>Suelo / techo</span><strong>{measures.suelo != null ? `${fmtNum(measures.suelo)} m²` : '—'}</strong>
          </div>
          <div className="pr-measure pr-measure--out">
            <span>Perímetro</span><strong>{measures.perimetro != null ? `${fmtNum(measures.perimetro)} m` : '—'}</strong>
          </div>
          <div className="pr-measure pr-measure--out">
            <span>Paredes</span><strong>{measures.paredes != null ? `${fmtNum(measures.paredes)} m²` : '—'}</strong>
          </div>
        </div>

        <label className="pr-notes">
          <span>Supuestos y avisos</span>
          <textarea
            className="sa-pay-textarea" rows={3} maxLength={3000}
            placeholder="Ej. medidas supuestas, pedir presupuesto a cristalería, confirmar con el seguro…"
            value={zone.notes} onChange={e => set('notes', e.target.value)}
          />
        </label>
      </div>

      {zone.chapters.map((c, i) => (
        <div key={c.id} className="sa-section pr-chapter">
          <div className="sa-section__header">
            <div className="pr-chapter__title">
              <span className="pr-chapter__num">{i + 1} ·</span>
              <input className="pr-input pr-chapter__name" value={c.name} onChange={e => setChapter(c.id, x => ({ ...x, name: e.target.value }))} />
            </div>
            <div className="sa-header-controls">
              <strong className="pr-chapter__total">{fmtEur(chapterTotal(c, measures))}</strong>
              <button className="sa-pay-action" onClick={() => moveChapter(i, -1)} disabled={i === 0} title="Subir">↑</button>
              <button className="sa-pay-action" onClick={() => moveChapter(i, 1)} disabled={i === zone.chapters.length - 1} title="Bajar">↓</button>
              <button
                className="sa-pay-action pr-danger"
                onClick={() => { if (window.confirm(`¿Borrar el capítulo «${c.name}» y sus ${c.items.length} partidas?`)) set('chapters', zone.chapters.filter(x => x.id !== c.id)) }}
              >Borrar</button>
            </div>
          </div>
          {c.items.length > 0 && (
            <div className="sa-pay-scroll">
              <table className="sa-pay-table pr-table">
                <thead>
                  <tr>
                    <th>Partida</th>
                    <th className="sa-pay-num">Cantidad</th>
                    <th>Ud</th>
                    <th className="sa-pay-num" title="Precio unitario con IVA">Propuesto</th>
                    <th className="sa-pay-num" title="Precio de un presupuesto real; si lo hay, es el que cuenta">Conseguido</th>
                    <th className="sa-pay-num">Importe</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {c.items.map(it => (
                    <ItemRow
                      key={it.id} item={it} measures={measures}
                      onChange={next => setChapter(c.id, x => ({ ...x, items: x.items.map(y => y.id === it.id ? next : y) }))}
                      onDelete={() => setChapter(c.id, x => ({ ...x, items: x.items.filter(y => y.id !== it.id) }))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="sa-pay-actions">
            <button className="sa-pay-action" onClick={() => addItem(c.id)}>+ Partida</button>
          </div>
        </div>
      ))}

      <button className="sa-list-save__btn" onClick={addChapter}>+ Capítulo</button>
    </>
  )
}

// ─── Pestaña Proyectos ──────────────────────────────────────────────────────
export default function ProjectsSection() {
  const { data, loading, error, reload } = useProjects()
  const [zones,      setZones]      = useState(null)
  const [view,       setView]       = useState(SUMMARY)
  const [showImport, setShowImport] = useState(false)
  const [saveState,  setSaveState]  = useState('')   // '', 'pending', 'saving', 'saved', 'error'
  const [saveError,  setSaveError]  = useState('')
  const [feedback,   setFeedback]   = useState('')

  // Guardado automático: un guardado cada vez, con el rev del último que se guardó
  const rev      = useRef(0)
  const latest   = useRef(null)
  const inFlight = useRef(false)
  const dirty    = useRef(false)
  const timer    = useRef(null)

  useEffect(() => {
    if (!data) return
    rev.current = data.rev
    setZones(data.zones)
    latest.current = data.zones
  }, [data])

  async function flush() {
    if (inFlight.current || !dirty.current) return
    inFlight.current = true
    dirty.current    = false
    setSaveState('saving')
    try {
      const saved = await saveProjects(latest.current, rev.current)
      rev.current = saved.rev
      setSaveState(dirty.current ? 'pending' : 'saved')
    } catch (e) {
      setSaveState('error')
      setSaveError(e.status === 409 ? e.message : `No se ha guardado: ${e.message}`)
      inFlight.current = false
      return
    }
    inFlight.current = false
    if (dirty.current) flush()
  }

  function update(next) {
    setZones(next)
    latest.current = next
    dirty.current  = true
    if (saveState !== 'error') setSaveState('pending')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 1000)
  }

  // Avisar si se cierra la página con cambios sin guardar
  useEffect(() => {
    const warn = e => { if (dirty.current || inFlight.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn); clearTimeout(timer.current) }
  }, [])

  if (loading && !zones) return <div className="sa-loading">Cargando…</div>
  if (error && !zones)   return <div className="sa-error">Error: {error}</div>
  if (!zones) return null

  const current = zones.find(z => z.id === view)

  function addZone() {
    const name = window.prompt('Nombre de la zona (por ejemplo, Terraza)')
    if (!name?.trim()) return
    const zone = { id: newId(), name: name.trim(), location: '', notes: '', measures: { largo: null, ancho: null, alto: null }, chapters: [] }
    update([...zones, zone])
    setView(zone.id)
  }

  function handleImport(groups) {
    const before = zones.reduce((s, z) => s + z.chapters.reduce((k, c) => k + c.items.length, 0), 0)
    const next   = applyImport(zones, groups)
    const after  = next.reduce((s, z) => s + z.chapters.reduce((k, c) => k + c.items.length, 0), 0)
    update(next)
    setShowImport(false)
    const target = next.find(z => z.name.trim().toLowerCase() === groups[0].zone.trim().toLowerCase())
    if (target) setView(target.id)
    setFeedback(`✓ ${after - before} partida${after - before === 1 ? '' : 's'} importada${after - before === 1 ? '' : 's'}`)
    setTimeout(() => setFeedback(''), 3500)
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ zonas: zones }, null, 2))
      setFeedback('✓ Datos copiados: pégalos a Claude para que los revise')
    } catch {
      setFeedback('✗ No se ha podido copiar')
    }
    setTimeout(() => setFeedback(''), 3500)
  }

  const saveLabel = {
    pending: 'Cambios sin guardar…',
    saving:  'Guardando…',
    saved:   '✓ Guardado',
  }[saveState]

  return (
    <div className="pr-page">
      <div className="pr-toolbar">
        <div className="pr-zones">
          <button className={`sa-pl-tab${view === SUMMARY ? ' sa-pl-tab--active' : ''}`} onClick={() => setView(SUMMARY)}>Resumen general</button>
          {zones.map(z => (
            <button key={z.id} className={`sa-pl-tab${view === z.id ? ' sa-pl-tab--active' : ''}`} onClick={() => setView(z.id)}>{z.name || 'Sin nombre'}</button>
          ))}
          <button className="sa-pl-tab" onClick={addZone}>+ Zona</button>
        </div>
        <div className="sa-header-controls">
          {saveLabel && <span className={`pr-save pr-save--${saveState}`}>{saveLabel}</span>}
          <button className="sa-pay-action" onClick={copyAll} title="Copia todos los datos para pasárselos a Claude">Copiar datos</button>
          <button className="sa-list-save__btn" onClick={() => setShowImport(s => !s)}>Importar partidas</button>
        </div>
      </div>

      {saveState === 'error' && (
        <div className="pr-save-error">
          <span>{saveError}</span>
          <button className="sa-pay-action" onClick={() => { setSaveState(''); dirty.current = false; reload() }}>Recargar (se pierden los cambios sin guardar)</button>
          {!saveError.startsWith('Otro socio') && <button className="sa-pay-action" onClick={() => { setSaveState('pending'); dirty.current = true; flush() }}>Reintentar</button>}
        </div>
      )}
      {feedback && <p className="sa-pay-feedback">{feedback}</p>}
      {data?.updated_at && <p className="sa-pay-note pr-meta">Última modificación: {data.updated_at.slice(0, 16)}{data.by ? ` · ${data.by}` : ''}</p>}

      {showImport && (
        <ImportPanel zones={zones} currentZone={current} onImport={handleImport} onClose={() => setShowImport(false)} />
      )}

      {current
        ? <ZoneView
            key={current.id} zone={current}
            onChange={next => update(zones.map(z => z.id === next.id ? next : z))}
            onDelete={() => {
              if (!window.confirm(`¿Borrar la zona «${current.name}» con todos sus capítulos y partidas?`)) return
              update(zones.filter(z => z.id !== current.id))
              setView(SUMMARY)
            }}
          />
        : <Summary zones={zones} onOpen={setView} />}
    </div>
  )
}
