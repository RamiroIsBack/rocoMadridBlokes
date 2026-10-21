import { useState, useEffect, useMemo, useCallback } from 'react'
import './OrganizacionPage.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const WHOAMI_KEY = 'blokes_equip_worker_id'
const DAY_LABEL = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' }
const GRADE_COLOR = {
  INTRO: '#9ca3af', VERDE: '#22c55e', AZUL: '#3b82f6', AMARILLO: '#eab308',
  ROJO: '#ef4444', NEGRO: '#1f2937', BLANCO: '#e5e7eb',
}

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}
async function api(method, path, body) {
  const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1${path}`, {
    method, credentials: 'include',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
  return json
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
// Monday of the week containing `d`
function mondayOf(d) {
  const date = new Date(d)
  const day = date.getDay() || 7
  if (day !== 1) date.setDate(date.getDate() - (day - 1))
  return date.toISOString().slice(0, 10)
}

export default function OrganizacionPage() {
  const [config, setConfig] = useState(null)
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('hoy') // 'hoy' | 'semana' | 'normas'
  const [workerId, setWorkerId] = useState(() => {
    try { return Number(localStorage.getItem(WHOAMI_KEY)) || null } catch { return null }
  })

  useEffect(() => {
    Promise.all([api('GET', '/equipacion/config'), api('GET', '/equipacion/workers')])
      .then(([cfgRes, workersRes]) => {
        setConfig(cfgRes.data)
        setWorkers(workersRes.data || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const chooseWorker = id => {
    setWorkerId(id)
    try { localStorage.setItem(WHOAMI_KEY, String(id)) } catch {}
  }

  if (loading) return <div className="org"><p className="org__hint">Cargando...</p></div>

  return (
    <div className="org">
      <div className="org__switch">
        <button className={`org__switch-btn${view === 'hoy' ? ' org__switch-btn--active' : ''}`} onClick={() => setView('hoy')}>Hoy</button>
        <button className={`org__switch-btn${view === 'semana' ? ' org__switch-btn--active' : ''}`} onClick={() => setView('semana')}>Semana</button>
        <button className={`org__switch-btn${view === 'normas' ? ' org__switch-btn--active' : ''}`} onClick={() => setView('normas')}>Normas</button>
      </div>

      {view === 'hoy' && (
        <HoyView
          config={config} workers={workers}
          workerId={workerId} onChooseWorker={chooseWorker}
        />
      )}
      {view === 'semana' && <SemanaView config={config} workers={workers} />}
      {view === 'normas' && <NormasView config={config} />}
    </div>
  )
}

// ─── Hoy ──────────────────────────────────────────────────────────────
function HoyView({ config, workers, workerId, onChooseWorker }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showAddBlock, setShowAddBlock] = useState(false)

  const worker = workers.find(w => w.id === workerId)
  const taskTypeById = useMemo(() => Object.fromEntries((config?.taskTypes || []).map(t => [t.id, t])), [config])

  const reload = useCallback(() => {
    if (!workerId) return
    setLoading(true)
    api('GET', `/equipacion/today?workerId=${workerId}&date=${todayStr()}`)
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workerId])

  useEffect(() => { reload() }, [reload])

  if (!workerId || !worker) {
    return (
      <div className="org__whoami">
        <p className="org__hint">¿Quién eres?</p>
        <div className="org__whoami-list">
          {workers.map(w => (
            <button key={w.id} className="org__whoami-btn" onClick={() => onChooseWorker(w.id)}>{w.name}</button>
          ))}
        </div>
      </div>
    )
  }

  const toggleTask = async (taskId, done) => {
    setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === taskId ? { ...t, done } : t) }))
    try { await api('PUT', `/equipacion/tasks/${taskId}`, { done }) } catch { reload() }
  }

  return (
    <div>
      <div className="org__who-row">
        <span className="org__who-name">{worker.name}{worker.isLead ? ' · responsable' : ''}</span>
        <button className="org__link-btn" onClick={() => onChooseWorker(null)}>No soy yo</button>
      </div>

      {loading && <p className="org__hint">Cargando...</p>}

      {!loading && data && (
        <>
          <section className="org__section">
            <h3 className="org__section-title">Tareas de hoy</h3>
            {data.tasks.length === 0 ? (
              <p className="org__hint">Sin tareas para hoy (puede que no sea día de trabajo, o que no haya semana planificada).</p>
            ) : (
              <ul className="org__task-list">
                {data.tasks.map(t => {
                  const type = taskTypeById[t.taskTypeId]
                  const params = Object.entries(t.params || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')
                  return (
                    <li key={t.id} className={`org__task${t.done ? ' org__task--done' : ''}`}>
                      <label>
                        <input type="checkbox" checked={t.done} onChange={e => toggleTask(t.id, e.target.checked)} />
                        <span className="org__task-name">{type?.name || t.taskTypeId}</span>
                        {params && <span className="org__task-params">{params}</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="org__section">
            <h3 className="org__section-title">Bloques puestos</h3>
            {data.blocks.length === 0 ? (
              <p className="org__hint">Ninguno todavía.</p>
            ) : (
              <ul className="org__block-list">
                {data.blocks.map(b => (
                  <BlockRow key={b.id} block={b} config={config} onChanged={reload} />
                ))}
              </ul>
            )}
            {data.assignmentId && !showAddBlock && (
              <button className="org__add-btn" onClick={() => setShowAddBlock(true)}>+ Añadir bloque</button>
            )}
            {showAddBlock && (
              <AddBlockForm
                config={config} assignmentId={data.assignmentId}
                onDone={() => { setShowAddBlock(false); reload() }}
                onCancel={() => setShowAddBlock(false)}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

function BlockRow({ block, onChanged }) {
  const [busy, setBusy] = useState(false)
  const toggleUploaded = async () => {
    setBusy(true)
    try { await api('PUT', `/equipacion/blocks/${block.id}`, { uploadedWebapp: !block.uploadedWebapp }); onChanged() }
    finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await api('DELETE', `/equipacion/blocks/${block.id}`); onChanged() }
    finally { setBusy(false) }
  }
  return (
    <li className="org__block-row">
      <span className="org__block-grade" style={{ background: GRADE_COLOR[block.grade] || '#ccc' }}>{block.grade}</span>
      <span className="org__block-info">
        Subzona #{block.subzone}{block.isTraverse ? ' · travesía' : ''}
      </span>
      <label className="org__block-upload">
        <input type="checkbox" checked={block.uploadedWebapp} onChange={toggleUploaded} disabled={busy} />
        subido a la webapp
      </label>
      <button className="org__remove-btn" onClick={remove} disabled={busy}>✕</button>
    </li>
  )
}

function AddBlockForm({ config, assignmentId, onDone, onCancel }) {
  const [subzone, setSubzone] = useState(config.subzones[0])
  const [grade, setGrade] = useState('VERDE')
  const [holdSetIds, setHoldSetIds] = useState([])
  const [holdsets, setHoldsets] = useState([])
  const [isTraverse, setIsTraverse] = useState(false)
  const [warning, setWarning] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { api('GET', '/equipacion/holdsets').then(r => setHoldsets(r.data || [])).catch(() => {}) }, [])

  const toggleHoldSet = id => {
    setHoldSetIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const submit = async () => {
    setSaving(true); setError(null); setWarning(null)
    try {
      const res = await api('POST', '/equipacion/blocks', { assignmentId, subzone, grade, holdSetIds, isTraverse })
      if (res.warning) setWarning(res.warning)
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="org__add-form">
      <div className="org__add-row">
        <label>Subzona</label>
        <select value={subzone} onChange={e => setSubzone(Number(e.target.value))}>
          {config.subzones.map(s => <option key={s} value={s}>#{s}</option>)}
        </select>
      </div>
      <div className="org__add-row">
        <label>Color</label>
        <select value={grade} onChange={e => setGrade(e.target.value)}>
          {config.grades.filter(g => g.planificado).map(g => <option key={g.color} value={g.color}>{g.color} ({g.range})</option>)}
        </select>
      </div>
      <div className="org__add-row">
        <label><input type="checkbox" checked={isTraverse} onChange={e => setIsTraverse(e.target.checked)} /> Es travesía</label>
      </div>
      <div className="org__add-row org__add-row--holdsets">
        <label>Juego(s) de presas</label>
        <div className="org__holdset-chips">
          {holdsets.map(h => (
            <button
              key={h.id} type="button"
              className={`org__holdset-chip${holdSetIds.includes(h.id) ? ' org__holdset-chip--on' : ''}`}
              onClick={() => toggleHoldSet(h.id)}
            >{h.name}</button>
          ))}
        </div>
      </div>
      {warning && <p className="org__warning">⚠ {warning}</p>}
      {error && <p className="org__error">{error}</p>}
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar bloque'}</button>
      </div>
    </div>
  )
}

// ─── Semana ───────────────────────────────────────────────────────────
function SemanaView({ config, workers }) {
  const [weeks, setWeeks] = useState([])
  const [detail, setDetail] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const reloadWeeks = useCallback(() => {
    api('GET', '/equipacion/weeks').then(r => setWeeks(r.data || [])).catch(() => {})
  }, [])
  useEffect(() => { reloadWeeks() }, [reloadWeeks])

  const openWeek = id => api('GET', `/equipacion/weeks/${id}`).then(r => setDetail(r.data)).catch(() => {})

  if (detail) {
    return (
      <div>
        <button className="org__link-btn" onClick={() => setDetail(null)}>← Volver a semanas</button>
        <h3 className="org__section-title">Semana del {detail.startDate} — subzonas {detail.subzones.map(s => `#${s}`).join(', ')}</h3>
        {detail.assignments.map(a => (
          <div key={a.id} className="org__assignment-card">
            <p className="org__assignment-name">{a.workerName}{a.isLead ? ' · responsable' : ''} — subzonas {a.subzones.map(s => `#${s}`).join(', ')}, bloques {a.blocksMin}-{a.blocksMax}</p>
            <p className="org__assignment-tasks">
              {a.tasks.length} tareas ({a.tasks.filter(t => t.done).length} hechas) · {a.blocks.length} bloques puestos
            </p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      {!showCreate && <button className="org__add-btn" onClick={() => setShowCreate(true)}>+ Crear semana nueva</button>}
      {showCreate && (
        <CreateWeekForm
          config={config} workers={workers}
          onDone={() => { setShowCreate(false); reloadWeeks() }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <ul className="org__week-list">
        {weeks.map(w => (
          <li key={w.id} className="org__week-row" onClick={() => openWeek(w.id)}>
            <span>Semana del {w.startDate}</span>
            <span className="org__week-subzones">{w.subzones.map(s => `#${s}`).join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CreateWeekForm({ config, workers, onDone, onCancel }) {
  const [startDate, setStartDate] = useState(mondayOf(todayStr()))
  const [subzones, setSubzones] = useState([])
  const [included, setIncluded] = useState(() => Object.fromEntries(workers.map(w => [w.id, w.active])))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleSubzone = s => setSubzones(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s])

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const assignments = workers.filter(w => included[w.id]).map(w => ({
        workerId: w.id, subzones, blocksMin: w.blocksMin, blocksMax: w.blocksMax,
      }))
      if (!subzones.length) throw new Error('Elige al menos una subzona')
      if (!assignments.length) throw new Error('Elige al menos un trabajador')
      await api('POST', '/equipacion/weeks', { startDate, subzones, assignments })
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="org__add-form">
      <div className="org__add-row">
        <label>Lunes de la semana</label>
        <input type="date" value={startDate} onChange={e => setStartDate(mondayOf(e.target.value))} />
      </div>
      <div className="org__add-row">
        <label>Subzonas</label>
        <div className="org__holdset-chips">
          {config.subzones.map(s => (
            <button key={s} type="button" className={`org__holdset-chip${subzones.includes(s) ? ' org__holdset-chip--on' : ''}`} onClick={() => toggleSubzone(s)}>#{s}</button>
          ))}
        </div>
      </div>
      <div className="org__add-row org__add-row--holdsets">
        <label>Trabajadores</label>
        <div className="org__holdset-chips">
          {workers.map(w => (
            <button
              key={w.id} type="button"
              className={`org__holdset-chip${included[w.id] ? ' org__holdset-chip--on' : ''}`}
              onClick={() => setIncluded(cur => ({ ...cur, [w.id]: !cur[w.id] }))}
            >{w.name} ({w.workDays.map(d => DAY_LABEL[d]).join('/')})</button>
          ))}
        </div>
      </div>
      {error && <p className="org__error">{error}</p>}
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear semana y repartir tareas'}</button>
      </div>
    </div>
  )
}

// ─── Normas ───────────────────────────────────────────────────────────
function NormasView({ config }) {
  return (
    <div>
      <section className="org__section">
        <h3 className="org__section-title">Escala de dificultad</h3>
        <table className="org__grade-table">
          <thead><tr><th>Color</th><th>Grado</th><th>¿Se planifica?</th></tr></thead>
          <tbody>
            {config.grades.map(g => (
              <tr key={g.color}>
                <td><span className="org__block-grade" style={{ background: GRADE_COLOR[g.color] }}>{g.color}</span></td>
                <td>{g.range}{g.nota ? ` (${g.nota})` : ''}</td>
                <td>{g.planificado ? 'Sí' : 'No'}{g.aviso ? ` — ⚠ ${g.aviso}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="org__section">
        <h3 className="org__section-title">Normas</h3>
        <ul className="org__rules-list">
          {config.rules.map((r, i) => (
            <li key={i} className={`org__rule org__rule--${r.kind}`}>{r.text}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
