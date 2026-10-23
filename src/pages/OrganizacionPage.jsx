import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import mapaEquipacion from '../assets/mapa-equipacion.jpg'
import './OrganizacionPage.css'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const WHOAMI_KEY = 'blokes_equip_worker_id'
const DAY_LABEL = { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' }
const DAY_OFFSET = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }
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
// Aritmética de fechas en local (no UTC) para no desplazar el día por la zona horaria.
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const DOW_LABEL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${DOW_LABEL[new Date(y, m - 1, d).getDay()]} ${d}/${m}`
}

export default function OrganizacionPage() {
  const [config, setConfig] = useState(null)
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('hoy') // 'hoy' | 'semana' | 'normas' | 'compe'
  const [workerId, setWorkerId] = useState(() => {
    try { return Number(localStorage.getItem(WHOAMI_KEY)) || null } catch { return null }
  })

  const reloadWorkers = useCallback(() => {
    return api('GET', '/equipacion/workers').then(r => setWorkers(r.data || [])).catch(() => {})
  }, [])
  const reloadConfig = useCallback(() => {
    return api('GET', '/equipacion/config').then(r => setConfig(r.data)).catch(() => {})
  }, [])

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
        <button className={`org__switch-btn${view === 'compe' ? ' org__switch-btn--active' : ''}`} onClick={() => setView('compe')}>Compe</button>
      </div>

      {view === 'hoy' && (
        <HoyView
          config={config} workers={workers}
          workerId={workerId} onChooseWorker={chooseWorker}
        />
      )}
      {view === 'semana' && <SemanaView config={config} workers={workers} onWorkersChanged={reloadWorkers} />}
      {view === 'normas' && <NormasView config={config} onConfigChanged={reloadConfig} />}
      {view === 'compe' && <CompeView />}
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
function SemanaView({ config, workers, onWorkersChanged }) {
  const [weeks, setWeeks] = useState([])
  const [detail, setDetail] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showWorkers, setShowWorkers] = useState(false)

  const reloadWeeks = useCallback(() => {
    api('GET', '/equipacion/weeks').then(r => setWeeks(r.data || [])).catch(() => {})
  }, [])
  useEffect(() => { reloadWeeks() }, [reloadWeeks])

  const openWeek = id => api('GET', `/equipacion/weeks/${id}`).then(r => setDetail(r.data)).catch(() => {})
  const taskTypeById = useMemo(() => Object.fromEntries((config?.taskTypes || []).map(t => [t.id, t])), [config])
  const workerById = useMemo(() => Object.fromEntries(workers.map(w => [w.id, w])), [workers])

  // Tarea propuesta por el sistema, pero fijada "se puede mover si se
  // quiere" — cambiar de persona o de día, siempre dentro de esta semana.
  const [moving, setMoving] = useState(false)
  const reassignTask = async (taskId, assignmentId, date) => {
    setMoving(true)
    try { await api('PUT', `/equipacion/tasks/${taskId}`, { assignmentId, date }) } catch {}
    await openWeek(detail.id)
    setMoving(false)
  }
  const toggleTaskDone = async (taskId, done) => {
    setDetail(d => ({
      ...d,
      assignments: d.assignments.map(a => ({
        ...a,
        tasks: a.tasks.map(t => t.id === taskId ? { ...t, done, doneAt: done ? new Date().toISOString() : null } : t),
      })),
    }))
    try { await api('PUT', `/equipacion/tasks/${taskId}`, { done }) } catch { openWeek(detail.id) }
  }

  // Arrastrar una tile de tarea a la columna (y opcionalmente al día) de
  // otra persona — mismo mecanismo de pointer events que el mapa de la compe.
  const [dragTaskId, setDragTaskId] = useState(null)
  const [dragPos, setDragPos] = useState(null)
  const [overAssignmentId, setOverAssignmentId] = useState(null)
  const dragInfoRef = useRef(null)

  const onTileDown = (taskId, originalDate, originalAssignmentId) => e => {
    console.log('DEBUG onTileDown fired', taskId, moving)
    if (moving) return
    e.preventDefault()
    dragInfoRef.current = { taskId, date: originalDate, assignmentId: originalAssignmentId }
    setDragTaskId(taskId)
    setDragPos({ x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onBoardMove = e => {
    if (dragInfoRef.current == null) return
    setDragPos({ x: e.clientX, y: e.clientY })
    const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-assignment-id]')
    setOverAssignmentId(col ? Number(col.dataset.assignmentId) : null)
  }
  const onBoardUp = async e => {
    const info = dragInfoRef.current
    dragInfoRef.current = null
    setDragTaskId(null)
    setDragPos(null)
    setOverAssignmentId(null)
    if (!info) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const col = el?.closest('[data-assignment-id]')
    if (!col) return
    const targetAssignmentId = Number(col.dataset.assignmentId)
    const dayEl = el?.closest('[data-date]')
    const targetDate = dayEl?.dataset.date || info.date
    if (targetAssignmentId === info.assignmentId && targetDate === info.date) return
    await reassignTask(info.taskId, targetAssignmentId, targetDate)
  }

  if (detail) {
    const todayS = todayStr()
    return (
      <div>
        <button className="org__link-btn" onClick={() => setDetail(null)}>← Volver a semanas</button>
        <h3 className="org__section-title">Semana del {detail.startDate} — subzonas {detail.subzones.map(s => `#${s}`).join(', ')}</h3>
        <p className="org__hint">Arrastra una tarjeta a otra persona (o a otro día de esa persona) para reasignarla.</p>
        <div className="org__board" onPointerMove={onBoardMove} onPointerUp={onBoardUp}>
          {detail.assignments.map(a => {
            const worker = workerById[a.workerId]
            const workerDates = (worker?.workDays || []).map(d => addDays(detail.startDate, DAY_OFFSET[d]))
            const taskDates = a.tasks.map(t => t.date)
            const allDates = Array.from(new Set([...workerDates, ...taskDates])).sort()
            return (
              <div
                key={a.id}
                className={`org__board-col${overAssignmentId === a.id ? ' org__board-col--over' : ''}`}
                data-assignment-id={a.id}
              >
                <p className="org__board-col-title">{a.workerName}{a.isLead ? ' · responsable' : ''}</p>
                <p className="org__board-col-meta">subzonas {a.subzones.map(s => `#${s}`).join(', ')} · bloques {a.blocksMin}-{a.blocksMax}</p>
                {allDates.map(date => {
                  const tasksOnDate = a.tasks.filter(t => t.date === date)
                  return (
                    <div key={date} className="org__board-day" data-date={date}>
                      <p className="org__board-day-label">{dayLabel(date)}</p>
                      {tasksOnDate.map(t => (
                        <TaskTile
                          key={t.id}
                          task={t}
                          typeName={taskTypeById[t.taskTypeId]?.name || t.taskTypeId}
                          isMissed={!t.done && t.date < todayS}
                          dragging={dragTaskId === t.id}
                          onPointerDown={onTileDown(t.id, t.date, a.id)}
                          onToggleDone={toggleTaskDone}
                        />
                      ))}
                    </div>
                  )
                })}
                {allDates.length === 0 && <p className="org__hint">Sin tareas (no le tocó ninguna esta semana).</p>}
                <p className="org__assignment-tasks">{a.blocks.length} bloques puestos</p>
              </div>
            )
          })}
        </div>
        {dragTaskId != null && dragPos && (
          <div className="org__drag-ghost" style={{ left: dragPos.x, top: dragPos.y }}>
            {taskTypeById[detail.assignments.flatMap(a => a.tasks).find(t => t.id === dragTaskId)?.taskTypeId]?.name}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="org__semana-actions">
        {!showCreate && <button className="org__add-btn" onClick={() => setShowCreate(true)}>+ Crear semana nueva</button>}
        <button className="org__link-btn" onClick={() => setShowWorkers(s => !s)}>
          {showWorkers ? 'Ocultar personas' : 'Gestionar personas'}
        </button>
      </div>
      {showWorkers && <WorkersAdmin workers={workers} onChanged={onWorkersChanged} />}
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

// Crear/editar/borrar personas — "a veces participa más gente en las tareas".
function WorkersAdmin({ workers, onChanged }) {
  const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [days, setDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri'])
  const [blocksMin, setBlocksMin] = useState(1)
  const [blocksMax, setBlocksMax] = useState(2)
  const [isLead, setIsLead] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleDay = d => setDays(cur => cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d])

  const submit = async () => {
    if (!name.trim()) { setError('Escribe un nombre'); return }
    setSaving(true); setError(null)
    try {
      await api('POST', '/equipacion/workers', { name: name.trim(), workDays: days, blocksMin, blocksMax, isLead })
      setName(''); setDays(['mon', 'tue', 'wed', 'thu', 'fri']); setBlocksMin(1); setBlocksMax(2); setIsLead(false)
      setShowAdd(false)
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async w => {
    if (!window.confirm(`¿Quitar a ${w.name} del equipo? (no borra sus semanas ya creadas)`)) return
    await api('DELETE', `/equipacion/workers/${w.id}`)
    onChanged()
  }

  return (
    <div className="org__workers-admin">
      <ul className="org__worker-list">
        {workers.map(w => (
          <li key={w.id} className="org__worker-row">
            <span className="org__worker-name">{w.name}{w.isLead ? ' · responsable' : ''}</span>
            <span className="org__worker-meta">{w.workDays.map(d => DAY_LABEL[d]).join('/')} · {w.blocksMin}-{w.blocksMax} bloques</span>
            <button className="org__remove-btn" onClick={() => remove(w)}>✕</button>
          </li>
        ))}
      </ul>
      {!showAdd && <button className="org__add-btn" onClick={() => setShowAdd(true)}>+ Añadir persona</button>}
      {showAdd && (
        <div className="org__add-form">
          <div className="org__add-row">
            <label>Nombre</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" />
          </div>
          <div className="org__add-row">
            <label>Días que trabaja</label>
            <div className="org__holdset-chips">
              {ALL_DAYS.map(d => (
                <button key={d} type="button" className={`org__holdset-chip${days.includes(d) ? ' org__holdset-chip--on' : ''}`} onClick={() => toggleDay(d)}>{DAY_LABEL[d]}</button>
              ))}
            </div>
          </div>
          <div className="org__add-row">
            <label>Bloques objetivo por semana (mín-máx)</label>
            <div className="org__blocks-range">
              <input type="number" min="0" max="20" value={blocksMin} onChange={e => setBlocksMin(Number(e.target.value))} />
              <span>–</span>
              <input type="number" min="0" max="20" value={blocksMax} onChange={e => setBlocksMax(Number(e.target.value))} />
            </div>
          </div>
          <div className="org__add-row">
            <label><input type="checkbox" checked={isLead} onChange={e => setIsLead(e.target.checked)} /> Es responsable (prepara las semanas)</label>
          </div>
          {error && <p className="org__error">{error}</p>}
          <div className="org__add-actions">
            <button className="org__btn org__btn--ghost" onClick={() => setShowAdd(false)} disabled={saving}>Cancelar</button>
            <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar persona'}</button>
          </div>
        </div>
      )}
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

// Tile visual de una tarea: checklist incorporado (checkbox) + info de la
// tarea (subzona, objetivo...) + arrastrable a otra persona/día. Si quedó
// pendiente de un día ya pasado, queda marcada "FALTÓ" como histórico.
function TaskTile({ task, typeName, isMissed, dragging, onPointerDown, onToggleDone }) {
  const params = Object.entries(task.params || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ')
  return (
    <div
      className={`org__tile${task.done ? ' org__tile--done' : ''}${isMissed ? ' org__tile--missed' : ''}${dragging ? ' org__tile--dragging' : ''}`}
      onPointerDown={onPointerDown}
    >
      <label className="org__tile-check" onPointerDown={e => e.stopPropagation()}>
        <input type="checkbox" checked={task.done} onChange={e => onToggleDone(task.id, e.target.checked)} />
      </label>
      <div className="org__tile-body">
        <span className="org__tile-name">{typeName}</span>
        {params && <span className="org__tile-params">{params}</span>}
      </div>
      {isMissed && <span className="org__tile-badge">FALTÓ</span>}
    </div>
  )
}

// ─── Normas ───────────────────────────────────────────────────────────
function NormasView({ config, onConfigChanged }) {
  const [editing, setEditing] = useState(null) // id del tipo de tarea que se está editando
  const [value, setValue] = useState(1)

  const startEdit = t => { setEditing(t.id); setValue(t.periodicityWeeks ?? 1) }
  const save = async id => {
    try { await api('PUT', `/equipacion/task-types/${id}`, { periodicityWeeks: value }) } catch {}
    setEditing(null)
    onConfigChanged()
  }

  return (
    <div>
      <section className="org__section">
        <h3 className="org__section-title">Catálogo de tareas</h3>
        <p className="org__hint">
          El sistema propone solo las tareas que tocan según su periodicidad, y elige a quien más
          la haya hecho antes. Cambia aquí cada cuántas semanas vuelve a tocar.
        </p>
        <ul className="org__task-list">
          {(config.taskTypes || []).map(t => (
            <li key={t.id} className="org__task">
              <span className="org__task-name">{t.name}</span>
              {editing === t.id ? (
                <span className="org__periodicity-edit">
                  cada <input type="number" min="1" max="12" value={value} onChange={e => setValue(Number(e.target.value))} /> semana(s)
                  <button className="org__link-btn" onClick={() => save(t.id)}>Guardar</button>
                  <button className="org__link-btn" onClick={() => setEditing(null)}>Cancelar</button>
                </span>
              ) : (
                <button className="org__link-btn" onClick={() => startEdit(t)}>
                  cada {t.periodicityWeeks ?? 1} semana(s)
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
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

// ─── Compe ────────────────────────────────────────────────────────────
// Organización de una competición: fecha, semanas de antelación para las
// tareas de equipación, y dónde va cada uno de los 16 bloques en el mapa.
// Más reglas (categorías, puntuación...) se añaden sobre la marcha.
function CompeView() {
  const [competitions, setCompetitions] = useState([])
  const [current, setCurrent] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    return api('GET', '/equipacion/competitions').then(r => setCompetitions(r.data || [])).catch(() => {})
  }, [])
  useEffect(() => { reload().finally(() => setLoading(false)) }, [reload])

  const openComp = id => api('GET', `/equipacion/competitions/${id}`).then(r => setCurrent(r.data)).catch(() => {})

  if (current) {
    return (
      <CompeMapEditor
        comp={current}
        onBack={() => { setCurrent(null); reload() }}
        onRefresh={() => openComp(current.id)}
      />
    )
  }

  if (loading) return <p className="org__hint">Cargando...</p>

  return (
    <div>
      {!showCreate && <button className="org__add-btn" onClick={() => setShowCreate(true)}>+ Nueva competición</button>}
      {showCreate && (
        <CreateCompForm
          onDone={id => { setShowCreate(false); reload(); openComp(id) }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <ul className="org__week-list">
        {competitions.map(c => (
          <li key={c.id} className="org__week-row" onClick={() => openComp(c.id)}>
            <span>{c.name} — {c.compDate}</span>
            <span className="org__week-subzones">tareas desde {c.tasksStartDate}</span>
          </li>
        ))}
        {competitions.length === 0 && <p className="org__hint">Sin competiciones todavía.</p>}
      </ul>
    </div>
  )
}

function CreateCompForm({ onDone, onCancel }) {
  const [name, setName] = useState('Competición')
  const [compDate, setCompDate] = useState('2026-11-30')
  const [leadWeeks, setLeadWeeks] = useState(3)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const res = await api('POST', '/equipacion/competitions', { name, compDate, leadWeeks })
      onDone(res.id)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="org__add-form">
      <div className="org__add-row"><label>Nombre</label><input type="text" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="org__add-row"><label>Fecha de la competición</label><input type="date" value={compDate} onChange={e => setCompDate(e.target.value)} /></div>
      <div className="org__add-row"><label>Semanas de antelación para las tareas</label><input type="number" min="1" max="12" value={leadWeeks} onChange={e => setLeadWeeks(Number(e.target.value))} /></div>
      {error && <p className="org__error">{error}</p>}
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear (16 bloques)'}</button>
      </div>
    </div>
  )
}

// Arrastra una burbuja ya colocada para moverla, o toca un número sin
// colocar y luego el sitio del mapa — pensado para funcionar igual con
// ratón que con el dedo en la tablet.
function CompeMapEditor({ comp, onBack }) {
  const wrapRef = useRef(null)
  const [blocks, setBlocks] = useState(comp.blocks)
  const [selectedToPlace, setSelectedToPlace] = useState(null)
  const dragIdRef = useRef(null)

  useEffect(() => { setBlocks(comp.blocks) }, [comp])

  const clampPct = v => Math.max(2, Math.min(98, v))
  const posFromClient = (clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect()
    return {
      x: clampPct(((clientX - rect.left) / rect.width) * 100),
      y: clampPct(((clientY - rect.top) / rect.height) * 100),
    }
  }

  const startDrag = id => e => {
    e.preventDefault()
    dragIdRef.current = id
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onWrapMove = e => {
    if (dragIdRef.current == null) return
    const { x, y } = posFromClient(e.clientX, e.clientY)
    setBlocks(cur => cur.map(b => b.id === dragIdRef.current ? { ...b, xPct: x, yPct: y } : b))
  }
  const onWrapUp = async () => {
    const id = dragIdRef.current
    dragIdRef.current = null
    if (id == null) return
    const b = blocks.find(x => x.id === id)
    if (b) { try { await api('PUT', `/equipacion/comp-blocks/${id}`, { xPct: b.xPct, yPct: b.yPct }) } catch {} }
  }
  const onWrapClick = async e => {
    if (dragIdRef.current != null || !selectedToPlace) return
    const { x, y } = posFromClient(e.clientX, e.clientY)
    const id = selectedToPlace
    setBlocks(cur => cur.map(b => b.id === id ? { ...b, xPct: x, yPct: y } : b))
    setSelectedToPlace(null)
    try { await api('PUT', `/equipacion/comp-blocks/${id}`, { xPct: x, yPct: y }) } catch {}
  }
  const unplace = async id => {
    setBlocks(cur => cur.map(b => b.id === id ? { ...b, xPct: null, yPct: null } : b))
    try { await api('PUT', `/equipacion/comp-blocks/${id}`, { unplace: true }) } catch {}
  }

  const unplaced = blocks.filter(b => b.xPct == null)
  const placed = blocks.filter(b => b.xPct != null)

  return (
    <div>
      <button className="org__link-btn" onClick={onBack}>← Volver a competiciones</button>
      <h3 className="org__section-title">{comp.name} — {comp.compDate}</h3>
      <p className="org__hint">Las tareas de equipación para esta compe empiezan el {comp.tasksStartDate}.</p>

      {unplaced.length > 0 && (
        <div className="org__comp-tray">
          <p className="org__hint">Toca un número y luego el sitio del mapa:</p>
          <div className="org__comp-tray-chips">
            {unplaced.map(b => (
              <button
                key={b.id}
                className={`org__comp-chip${selectedToPlace === b.id ? ' org__comp-chip--selected' : ''}`}
                onClick={() => setSelectedToPlace(cur => cur === b.id ? null : b.id)}
              >{b.number}</button>
            ))}
          </div>
        </div>
      )}

      <div
        className="org__comp-map-wrap"
        ref={wrapRef}
        onPointerMove={onWrapMove}
        onPointerUp={onWrapUp}
        onClick={onWrapClick}
      >
        <img src={mapaEquipacion} alt="Mapa del rocódromo" className="org__comp-map-img" draggable={false} />
        {placed.map(b => (
          <div
            key={b.id}
            className="org__comp-bubble"
            style={{ left: `${b.xPct}%`, top: `${b.yPct}%` }}
            onPointerDown={startDrag(b.id)}
            onDoubleClick={() => unplace(b.id)}
            title="Arrastra para mover, doble clic para quitar del mapa"
          >{b.number}</div>
        ))}
      </div>
      <p className="org__hint">{placed.length} de {blocks.length} bloques colocados. Doble clic en una burbuja para quitarla del mapa.</p>
    </div>
  )
}
