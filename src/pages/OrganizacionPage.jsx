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
const DOW_LABEL_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MES_LABEL_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
// "Semana del ISO" en humano (NOTAS_PARA_CODE_equipacion.md, 3/11 11:30: Ramiro pidió "lunes 2 de noviembre" en vez de "2026-11-02").
function weekLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${DOW_LABEL_LARGO[new Date(y, m - 1, d).getDay()]} ${d} de ${MES_LABEL_LARGO[m - 1]}`
}
// Una tarea suelta con texto libre (sin tipo de catálogo) se guarda como taskTypeId "custom"
// con el texto en params.texto (creador de tareas de Álvaro, Ramiro 1/11 17:20).
function taskLabel(t, taskTypeById) {
  if (t.taskTypeId === 'custom') return t.params?.texto || 'Tarea'
  return taskTypeById[t.taskTypeId]?.name || t.taskTypeId
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
  // Quién puede crear/editar el catálogo de tareas y añadir tareas sueltas: el responsable
  // (Álvaro) o un socio — el resto solo ve y marca hecho (Ramiro, 1/11 17:20). La identidad de
  // "quién soy" en Organización es de toda la vida solo un selector local (no hay cuenta por
  // persona), así que esto es un permiso de interfaz, no una comprobación de seguridad real —
  // igual que el resto de "quién soy" aquí.
  const currentWorker = workers.find(w => w.id === workerId)
  const canManage = !!currentWorker?.isLead || window.blokesSiteData?.userRole === 'socio'

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
          workerId={workerId} onChooseWorker={chooseWorker} canManage={canManage}
        />
      )}
      {view === 'semana' && <SemanaView config={config} workers={workers} canManage={canManage} onWorkersChanged={reloadWorkers} />}
      {view === 'normas' && <NormasView config={config} canManage={canManage} onConfigChanged={reloadConfig} />}
      {view === 'compe' && <CompeView config={config} workers={workers} />}
    </div>
  )
}

// ─── Hoy ──────────────────────────────────────────────────────────────
function HoyView({ config, workers, workerId, onChooseWorker, canManage }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showAddBlock, setShowAddBlock] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [holdsets, setHoldsets] = useState([])

  const worker = workers.find(w => w.id === workerId)
  const taskTypeById = useMemo(() => Object.fromEntries((config?.taskTypes || []).map(t => [t.id, t])), [config])

  useEffect(() => { api('GET', '/equipacion/holdsets').then(r => setHoldsets(r.data || [])).catch(() => {}) }, [])

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
    // Los eventuales (solo vienen para compes puntuales) se enseñan aparte para que no se
    // confundan con el equipo de mantenimiento normal (NOTAS_PARA_CODE_equipacion.md, 3/11 11:30).
    const habituales = workers.filter(w => !w.eventual)
    const eventuales = workers.filter(w => w.eventual)
    return (
      <div className="org__whoami">
        <p className="org__hint">¿Quién eres?</p>
        <div className="org__whoami-list">
          {habituales.map(w => (
            <button key={w.id} className="org__whoami-btn" onClick={() => onChooseWorker(w.id)}>{w.name}</button>
          ))}
        </div>
        {eventuales.length > 0 && (
          <>
            <p className="org__hint">Solo compe</p>
            <div className="org__whoami-list">
              {eventuales.map(w => (
                <button key={w.id} className="org__whoami-btn" onClick={() => onChooseWorker(w.id)}>{w.name}</button>
              ))}
            </div>
          </>
        )}
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
                  const params = Object.entries(t.params || {}).filter(([k, v]) => v && k !== 'texto').map(([k, v]) => `${k}: ${v}`).join(' · ')
                  const isRetrasada = t.status === 'retrasada'
                  const movedAway = isRetrasada && t.movedToTaskId
                  if (movedAway) {
                    return (
                      <li key={t.id} className="org__task org__task--moved">
                        <span className="org__task-name">{taskLabel(t, taskTypeById)}</span>
                        {params && <span className="org__task-params">{params}</span>}
                        <span className="org__tile-badge">→ pasada a la semana del {dayLabel(t.movedToDate)}</span>
                      </li>
                    )
                  }
                  return (
                    <li key={t.id} className={`org__task${t.done ? ' org__task--done' : ''}${isRetrasada ? ' org__task--retrasada' : ''}`}>
                      <label>
                        <input type="checkbox" checked={t.done} onChange={e => toggleTask(t.id, e.target.checked)} />
                        <span className="org__task-name">{taskLabel(t, taskTypeById)}</span>
                        {params && <span className="org__task-params">{params}</span>}
                        {isRetrasada && <span className="org__tile-badge">RETRASADA{t.postponedCount > 1 ? ` ×${t.postponedCount}` : ''}</span>}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {canManage && data.assignmentId && !showAddTask && (
              <button className="org__link-btn" onClick={() => setShowAddTask(true)}>+ Tarea</button>
            )}
            {showAddTask && (
              <LooseTaskForm
                config={config} assignmentId={data.assignmentId} defaultDate={todayStr()}
                onDone={() => { setShowAddTask(false); reload() }}
                onCancel={() => setShowAddTask(false)}
              />
            )}
          </section>

          <MiParteCompes workerId={workerId} config={config} />

          <section className="org__section">
            <h3 className="org__section-title">Bloques puestos</h3>
            {data.blocks.length === 0 ? (
              <p className="org__hint">Ninguno todavía.</p>
            ) : (
              <ul className="org__block-list">
                {data.blocks.map(b => (
                  <BlockRow key={b.id} block={b} holdsets={holdsets} onChanged={reload} />
                ))}
              </ul>
            )}
            {!data.assignmentId && <p className="org__hint">No hay semana planificada: pide a Álvaro que la cree.</p>}
            {data.assignmentId && !showAddBlock && (
              <button className="org__add-btn" onClick={() => setShowAddBlock(true)}>+ Añadir bloque</button>
            )}
            {showAddBlock && (
              <AddBlockForm
                config={config} holdsets={holdsets} assignmentId={data.assignmentId}
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

// "Mi parte" dentro de Hoy (Ramiro, 1/11 17:20): las tareas del plan de cualquier competición
// que le toquen a esta persona, igual que las tareas normales del día pero sin filtrar por
// fecha — una compe tiene semanas de antelación y conviene verlas todas, no solo las de hoy.
function MiParteCompes({ workerId, config }) {
  const [competitions, setCompetitions] = useState([])
  const [plans, setPlans] = useState({})
  const taskTypeById = useMemo(() => Object.fromEntries((config?.taskTypes || []).map(t => [t.id, t])), [config])

  useEffect(() => {
    api('GET', '/equipacion/competitions').then(r => setCompetitions(r.data || [])).catch(() => {})
  }, [])
  useEffect(() => {
    competitions.forEach(c => {
      api('GET', `/equipacion/competitions/${c.id}/plan`).then(r => setPlans(p => ({ ...p, [c.id]: r.data }))).catch(() => {})
    })
  }, [competitions])

  const toggleDone = async (taskId, done, compId) => {
    setPlans(p => ({ ...p, [compId]: { ...p[compId], tasks: p[compId].tasks.map(t => t.id === taskId ? { ...t, done } : t) } }))
    try { await api('PUT', `/equipacion/tasks/${taskId}`, { done }) } catch {}
  }

  const sections = competitions
    .map(c => ({ comp: c, mine: (plans[c.id]?.tasks || []).filter(t => String(t.workerId) === String(workerId)) }))
    .filter(s => s.mine.length > 0)
  if (sections.length === 0) return null

  return (
    <section className="org__section">
      <h3 className="org__section-title">Mi parte de la compe</h3>
      {sections.map(({ comp, mine }) => (
        <div key={comp.id}>
          {sections.length > 1 && <p className="org__hint">{comp.name}</p>}
          <ul className="org__task-list">
            {mine.map(t => (
              <li key={t.id} className={`org__task${t.done ? ' org__task--done' : ''}`}>
                <label>
                  <input type="checkbox" checked={t.done} onChange={e => toggleDone(t.id, e.target.checked, comp.id)} />
                  <span className="org__task-name">{taskTypeById[t.taskTypeId]?.name || t.taskTypeId}</span>
                  <span className="org__task-params">{dayLabel(t.date)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function BlockRow({ block, holdsets, onChanged }) {
  const [busy, setBusy] = useState(false)
  const holdsetNames = (block.holdSetIds || []).map(id => holdsets.find(h => h.id === id)?.name || `#${id}`).join(', ')
  const toggleUploaded = async () => {
    setBusy(true)
    try { await api('PUT', `/equipacion/blocks/${block.id}`, { uploadedWebapp: !block.uploadedWebapp }); onChanged() }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!window.confirm('¿Borrar este bloque?')) return
    setBusy(true)
    try { await api('DELETE', `/equipacion/blocks/${block.id}`); onChanged() }
    finally { setBusy(false) }
  }
  return (
    <li className="org__block-row">
      <span className="org__block-grade" style={{ background: GRADE_COLOR[block.grade] || '#ccc' }}>{block.grade}</span>
      <span className="org__block-info">
        Subzona #{block.subzone}{block.isTraverse ? ' · travesía' : ''}{holdsetNames ? ` · ${holdsetNames}` : ''}
      </span>
      <label className="org__block-upload">
        <input type="checkbox" checked={block.uploadedWebapp} onChange={toggleUploaded} disabled={busy} />
        subido a la webapp
      </label>
      <button className="org__remove-btn" onClick={remove} disabled={busy}>✕</button>
    </li>
  )
}

function AddBlockForm({ config, holdsets, assignmentId, onDone, onCancel }) {
  const [subzone, setSubzone] = useState(config.subzones[0])
  const [grade, setGrade] = useState('VERDE')
  const [holdSetIds, setHoldSetIds] = useState([])
  const [isTraverse, setIsTraverse] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleHoldSet = id => {
    setHoldSetIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const res = await api('POST', '/equipacion/blocks', { assignmentId, subzone, grade, holdSetIds, isTraverse })
      if (res.warning) { window.alert(`⚠ ${res.warning}`) }
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
      {error && <p className="org__error">{error}</p>}
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar bloque'}</button>
      </div>
    </div>
  )
}

// ─── Semana ───────────────────────────────────────────────────────────
function SemanaView({ config, workers, canManage, onWorkersChanged }) {
  const [weeks, setWeeks] = useState([])
  const [detail, setDetail] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showWorkers, setShowWorkers] = useState(false)
  const [showHistorico, setShowHistorico] = useState(false)
  // Las semanas de prueba no salen en la lista normal del equipo (cowork las necesita para
  // probar sin dejar residuos) — este botón las enseña aparte para poder gestionarlas.
  const [showTest, setShowTest] = useState(false)
  // Migración puntual del lío de los dos sitios (NOTAS_PARA_CODE_equipacion.md, 3/11 12:00).
  const [showMigrar, setShowMigrar] = useState(false)

  const reloadWeeks = useCallback(() => {
    api('GET', `/equipacion/weeks${showTest ? '?test=1' : ''}`).then(r => setWeeks(r.data || [])).catch(() => {})
  }, [showTest])
  useEffect(() => { reloadWeeks() }, [reloadWeeks])

  // Si se pide abrir otra semana (o recargar la misma) antes de que responda la petición
  // anterior, esa respuesta vieja no debe pisar a la nueva al llegar tarde — guardamos solo la
  // del último `openWeek` pedido (cowork, 3/11 11:30: sospecha de que el tablero se quedaba con
  // datos de otra semana).
  const openWeekSeq = useRef(0)
  const openWeek = id => {
    const seq = ++openWeekSeq.current
    return api('GET', `/equipacion/weeks/${id}`)
      .then(r => { if (seq === openWeekSeq.current) setDetail(r.data) })
      .catch(() => {})
  }
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

  // Las tareas no se cancelan: solo se mueven a la semana siguiente, y
  // quedan marcadas "retrasada" para que no se pierda el histórico.
  const [postponing, setPostponing] = useState(null)
  const postponeTask = async taskId => {
    setPostponing(taskId)
    try { await api('POST', `/equipacion/tasks/${taskId}/postpone`) } catch {}
    await openWeek(detail.id)
    setPostponing(null)
  }

  // Quitar una tarea de verdad (NOTAS_PARA_CODE_equipacion.md, 3/11 11:30) — distinto de
  // "→ Semana siguiente", que la mueve. Solo responsable/socios ven el botón (canManage).
  const [deletingTask, setDeletingTask] = useState(null)
  const deleteTask = async taskId => {
    if (!window.confirm('¿Quitar esta tarea? No se puede deshacer.')) return
    setDeletingTask(taskId)
    try { await api('DELETE', `/equipacion/tasks/${taskId}`) } catch {}
    await openWeek(detail.id)
    setDeletingTask(null)
  }

  const [editingDaysFor, setEditingDaysFor] = useState(null)
  const [addingTaskFor, setAddingTaskFor] = useState(null)
  // Añadir a alguien a una semana que ya existe (Álvaro/cowork, 2/11 12:55: el plan de una compe
  // la crea solo con el responsable). Solo la asignación, sin tareas de mantenimiento — sus
  // tareas de esta semana se añaden sueltas (+Tarea) o arrastrando, como siempre.
  const [addingPerson, setAddingPerson] = useState(false)
  const [addPersonBusy, setAddPersonBusy] = useState(false)
  const addPerson = async workerId => {
    setAddPersonBusy(true)
    try {
      await api('POST', `/equipacion/weeks/${detail.id}/assignments`, { workerId: Number(workerId) })
      setAddingPerson(false)
      await openWeek(detail.id)
    } catch (e) { window.alert(e.message) } finally { setAddPersonBusy(false) }
  }
  const saveAssignmentDays = async (assignmentId, days) => {
    try { await api('PUT', `/equipacion/assignments/${assignmentId}`, { workDays: days }) } catch (e) { window.alert(e.message); return }
    setEditingDaysFor(null)
    await openWeek(detail.id)
  }

  const deleteWeek = async () => {
    const doneTasks = detail.assignments.reduce((n, a) => n + a.tasks.filter(t => t.done).length, 0)
    const blocksCount = detail.assignments.reduce((n, a) => n + a.blocks.length, 0)
    const retrasadaTasks = detail.assignments.reduce((n, a) => n + a.tasks.filter(t => t.status === 'retrasada').length, 0)
    const msg = (doneTasks === 0 && blocksCount === 0 && retrasadaTasks === 0)
      ? '¿Borrar esta semana? No tiene nada hecho todavía.'
      : `Tiene ${doneTasks} tarea(s) hecha(s), ${retrasadaTasks} retrasada(s) y ${blocksCount} bloque(s): se archivará (no se borra el histórico), no se borrará.`
    if (!window.confirm(msg)) return
    try {
      const res = await api('DELETE', `/equipacion/weeks/${detail.id}`)
      window.alert(res.mode === 'deleted' ? 'Semana borrada.' : 'Semana archivada (queda en el histórico).')
    } catch (e) {
      window.alert(e.message)
    }
    setDetail(null)
    reloadWeeks()
  }

  // Arrastrar una tile de tarea a la columna (y opcionalmente al día) de
  // otra persona — mismo mecanismo de pointer events que el mapa de la compe.
  const [dragTaskId, setDragTaskId] = useState(null)
  const [dragPos, setDragPos] = useState(null)
  const [overAssignmentId, setOverAssignmentId] = useState(null)
  const dragInfoRef = useRef(null)

  const onTileDown = (taskId, originalDate, originalAssignmentId) => e => {
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
        <div className="org__semana-actions">
          <button className="org__link-btn" onClick={() => setDetail(null)}>← Volver a semanas</button>
          <button className="org__link-btn" onClick={deleteWeek}>Borrar semana</button>
          {canManage && (addingPerson ? (
            <select
              autoFocus value="" disabled={addPersonBusy}
              onChange={e => { if (e.target.value) addPerson(e.target.value) }}
              onBlur={() => setAddingPerson(false)}
            >
              <option value="">— elige a quién añadir —</option>
              {workers.filter(w => !detail.assignments.some(a => a.workerId === w.id)).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          ) : (
            <button className="org__link-btn" onClick={() => setAddingPerson(true)}>+ Persona</button>
          ))}
        </div>
        <h3 className="org__section-title">Semana del {weekLabel(detail.startDate)} — subzonas {detail.subzones.map(s => `#${s}`).join(', ')}</h3>
        {detail.isAuto && <p className="org__hint org__hint--auto">Semana creada automáticamente: reparte las tareas arrastrándolas.</p>}
        <p className="org__hint">Arrastra una tarjeta a otra persona (o a otro día de esa persona) para reasignarla.</p>
        <div className="org__board" onPointerMove={onBoardMove} onPointerUp={onBoardUp}>
          {detail.assignments.map(a => {
            const worker = workerById[a.workerId]
            const effectiveDays = a.workDays?.length ? a.workDays : (worker?.workDays || [])
            const workerDates = effectiveDays.map(d => addDays(detail.startDate, DAY_OFFSET[d]))
            const taskDates = a.tasks.map(t => t.date)
            const allDates = Array.from(new Set([...workerDates, ...taskDates])).sort()
            return (
              <div
                key={a.id}
                className={`org__board-col${overAssignmentId === a.id ? ' org__board-col--over' : ''}`}
                data-assignment-id={a.id}
              >
                <p className="org__board-col-title">{a.workerName}{a.isLead ? ' · responsable' : ''}</p>
                <p className="org__board-col-meta">
                  subzonas {a.subzones.map(s => `#${s}`).join(', ')} · bloques {a.blocksMin}-{a.blocksMax}
                  {a.workDays?.length > 0 && <> · días cambiados esta semana</>}
                  {' '}<button className="org__link-btn" onClick={() => setEditingDaysFor(cur => cur === a.id ? null : a.id)}>editar días</button>
                </p>
                {editingDaysFor === a.id && (
                  <div className="org__holdset-chips">
                    {ALL_WEEK_DAYS.map(d => (
                      <button
                        key={d} type="button"
                        className={`org__holdset-chip${effectiveDays.includes(d) ? ' org__holdset-chip--on' : ''}`}
                        onClick={() => saveAssignmentDays(a.id, effectiveDays.includes(d) ? effectiveDays.filter(x => x !== d) : [...effectiveDays, d])}
                      >{DAY_LABEL[d]}</button>
                    ))}
                    <button className="org__link-btn" onClick={() => saveAssignmentDays(a.id, [])}>usar lo de siempre</button>
                  </div>
                )}
                {canManage && (
                  <button className="org__link-btn" onClick={() => setAddingTaskFor(cur => cur === a.id ? null : a.id)}>+ Tarea</button>
                )}
                {addingTaskFor === a.id && (
                  <LooseTaskForm
                    config={config} weekStart={detail.startDate}
                    onDone={() => { setAddingTaskFor(null); openWeek(detail.id) }}
                    onCancel={() => setAddingTaskFor(null)}
                    assignmentId={a.id}
                  />
                )}
                {allDates.map(date => {
                  const tasksOnDate = a.tasks.filter(t => t.date === date)
                  return (
                    <div key={date} className="org__board-day" data-date={date}>
                      <p className="org__board-day-label">{dayLabel(date)}</p>
                      {tasksOnDate.map(t => (
                        <TaskTile
                          key={t.id}
                          task={t}
                          typeName={taskLabel(t, taskTypeById)}
                          isMissed={!t.done && t.date < todayS && t.status !== 'retrasada'}
                          dragging={dragTaskId === t.id}
                          postponing={postponing === t.id}
                          onPointerDown={onTileDown(t.id, t.date, a.id)}
                          onToggleDone={toggleTaskDone}
                          onPostpone={postponeTask}
                          canManage={canManage}
                          onDelete={deleteTask}
                          deleting={deletingTask === t.id}
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
        <button className="org__link-btn" onClick={() => setShowHistorico(s => !s)}>
          {showHistorico ? 'Ocultar histórico' : 'Ver histórico'}
        </button>
        <button className="org__link-btn" onClick={() => setShowTest(s => !s)}>
          {showTest ? 'Ver semanas normales' : 'Ver semanas de prueba'}
        </button>
        {canManage && (
          <button className="org__link-btn" onClick={() => setShowMigrar(s => !s)}>
            {showMigrar ? 'Ocultar migración' : '⚠ Migrar datos del sitio principal'}
          </button>
        )}
      </div>
      {showMigrar && <MigrarPrincipalPanel />}
      {showWorkers && <WorkersAdmin workers={workers} onChanged={onWorkersChanged} />}
      {showCreate && (
        <CreateWeekForm
          config={config} workers={workers}
          onDone={() => { setShowCreate(false); reloadWeeks() }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {showHistorico && <HistoricoView />}
      <ul className="org__week-list">
        {weeks.map(w => (
          <li key={w.id} className="org__week-row" onClick={() => openWeek(w.id)}>
            <span>Semana del {weekLabel(w.startDate)}{w.isAuto ? ' · automática' : ''}</span>
            <span className="org__week-subzones">{w.subzones.map(s => `#${s}`).join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Histórico: semanas pasadas (incluidas las archivadas por "Borrar
// semana"), con cuántas tareas quedaron hechas / retrasadas / sin hacer, y
// de las retrasadas, quién se las fue dejando atrás.
function HistoricoView() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    api('GET', '/equipacion/weeks/historico').then(r => setRows(r.data || [])).catch(() => setRows([]))
  }, [])

  if (rows === null) return <p className="org__hint">Cargando histórico...</p>
  if (rows.length === 0) return <p className="org__hint">Todavía no hay semanas en el histórico.</p>

  return (
    <div className="org__historico">
      {rows.map(w => (
        <div key={w.id} className="org__historico-row">
          <p className="org__historico-title">
            Semana del {weekLabel(w.startDate)}{w.archived ? ' · archivada' : ''}
          </p>
          <p className="org__historico-meta">
            {w.hechas} hecha(s) · {w.retrasadas} retrasada(s) · {w.pendientes} sin hacer todavía
          </p>
          {Object.keys(w.retrasosPorPersona || {}).length > 0 && (
            <p className="org__historico-meta">
              Retrasos: {Object.entries(w.retrasosPorPersona).map(([name, n]) => `${name} (${n})`).join(', ')}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// Migración puntual (NOTAS_PARA_CODE_equipacion.md, 3/11 12:00): trae del sitio principal
// (blog_id 1) al club (donde vive la app) los trabajadores eventuales, la competición #2 y sus
// semanas 18/15/16/19 con el reparto a mano, que se habían creado probando contra el sitio
// equivocado. Primero enseña un informe (sin escribir nada); "Confirmar" lo ejecuta de verdad —
// solo se puede una vez.
function MigrarPrincipalPanel() {
  const [informe, setInforme] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [hecho, setHecho] = useState(false)

  const revisar = async () => {
    setCargando(true)
    try { setInforme(await api('POST', '/equipacion/migrar-principal-a-club', { confirmar: false })) }
    catch (e) { window.alert(e.message) }
    setCargando(false)
  }
  const confirmar = async () => {
    if (!window.confirm('¿Migrar de verdad? Solo se puede hacer una vez (si hace falta repetirlo luego hay que avisar a Code/cowork).')) return
    setCargando(true)
    try { setInforme(await api('POST', '/equipacion/migrar-principal-a-club', { confirmar: true })); setHecho(true) }
    catch (e) { window.alert(e.message) }
    setCargando(false)
  }

  return (
    <div className="org__add-form">
      <p className="org__hint">
        Trae del sitio principal los trabajadores eventuales, la competición y las semanas 16/11, 23/11,
        30/11 y 7/12 con el reparto a mano, que se crearon probando contra el sitio equivocado.
      </p>
      <button className="org__link-btn" onClick={revisar} disabled={cargando}>{cargando ? 'Cargando…' : 'Revisar qué haría (sin tocar nada)'}</button>
      {informe && (
        <div style={{ marginTop: 10, fontSize: '0.85rem' }}>
          <p><strong>Trabajadores:</strong> {informe.data.workers.join(', ') || '—'}</p>
          <p><strong>Competición:</strong> {informe.data.competition || '—'}</p>
          <p><strong>Semanas:</strong> {informe.data.weeks.join(', ') || '—'}</p>
          <p><strong>Asignaciones:</strong> {informe.data.assignments} · <strong>Tareas:</strong> {informe.data.tasks} · <strong>Tipos de tarea nuevos:</strong> {informe.data.taskTypes.join(', ') || '—'} · <strong>Bloques de compe:</strong> {informe.data.compBlocks}</p>
          {informe.data.avisos.length > 0 && <p style={{ color: '#a33d33' }}><strong>Avisos:</strong> {informe.data.avisos.join(' · ')}</p>}
          {informe.confirmado ? (
            <p className="org__hint">✅ Migrado de verdad. Recarga la página y comprueba la semana del 16/11.</p>
          ) : (
            <button className="org__add-btn" onClick={confirmar} disabled={cargando || hecho}>Confirmar (escribir de verdad)</button>
          )}
        </div>
      )}
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
  const [eventual, setEventual] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleDay = d => setDays(cur => cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d])

  const submit = async () => {
    if (!name.trim()) { setError('Escribe un nombre'); return }
    setSaving(true); setError(null)
    try {
      await api('POST', '/equipacion/workers', { name: name.trim(), workDays: days, blocksMin, blocksMax, isLead, eventual })
      setName(''); setDays(['mon', 'tue', 'wed', 'thu', 'fri']); setBlocksMin(1); setBlocksMax(2); setIsLead(false); setEventual(false)
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

  // "Eventual" (cowork, 2/11 14:00): viene solo a compes puntuales (p. ej. un fin de semana) —
  // no debe entrar en el reparto normal de mantenimiento de cada semana.
  const toggleEventual = async w => {
    await api('PUT', `/equipacion/workers/${w.id}`, { eventual: !w.eventual })
    onChanged()
  }

  return (
    <div className="org__workers-admin">
      <ul className="org__worker-list">
        {workers.map(w => (
          <li key={w.id} className="org__worker-row">
            <span className="org__worker-name">{w.name}{w.isLead ? ' · responsable' : ''}{w.eventual ? ' · eventual' : ''}</span>
            <span className="org__worker-meta">{w.workDays.map(d => DAY_LABEL[d]).join('/')} · {w.blocksMin}-{w.blocksMax} bloques</span>
            <button className="org__link-btn" onClick={() => toggleEventual(w)} title="Eventual: solo viene a compes puntuales, no entra en el reparto normal de mantenimiento">
              {w.eventual ? 'Quitar eventual' : 'Marcar eventual'}
            </button>
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
          <div className="org__add-row">
            <label>
              <input type="checkbox" checked={eventual} onChange={e => setEventual(e.target.checked)} />
              {' '}Eventual (solo viene a compes puntuales, no entra en el reparto normal de mantenimiento)
            </label>
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

const ALL_WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const ALL_WEEK_DAYS_5 = ['mon', 'tue', 'wed', 'thu', 'fri']

function CreateWeekForm({ config, workers, onDone, onCancel }) {
  const [startDate, setStartDate] = useState(mondayOf(todayStr()))
  const [subzones, setSubzones] = useState([])
  const [included, setIncluded] = useState({})
  const [isTest, setIsTest] = useState(false)
  // Días de trabajo de ESTA semana por persona: vacío = usar el fijo del trabajador.
  // Vacaciones o un cambio puntual se marcan aquí sin tocar su valor por defecto.
  const [workDaysOverride, setWorkDaysOverride] = useState({})
  const [editingDays, setEditingDays] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggleSubzone = s => setSubzones(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s])
  const chosenWorkers = workers.filter(w => included[w.id])
  const toggleDayOverride = (workerId, day) => setWorkDaysOverride(cur => {
    const current = cur[workerId] ?? workers.find(w => w.id === workerId)?.workDays ?? []
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day]
    return { ...cur, [workerId]: next }
  })

  const submit = async () => {
    if (saving) return
    setSaving(true); setError(null)
    try {
      const assignments = chosenWorkers.map(w => ({
        workerId: w.id, subzones, blocksMin: w.blocksMin, blocksMax: w.blocksMax,
        ...(workDaysOverride[w.id] ? { workDays: workDaysOverride[w.id] } : {}),
      }))
      if (!subzones.length) throw new Error('Elige al menos una subzona')
      if (!assignments.length) throw new Error('Elige al menos un trabajador')
      const res = await api('POST', '/equipacion/weeks', { startDate, subzones, assignments, isTest })
      if (res.warnings?.length) window.alert(res.warnings.join('\n'))
      onDone()
    } catch (e) {
      setError(e.message)
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
            >{w.name} ({(workDaysOverride[w.id] || w.workDays).map(d => DAY_LABEL[d]).join('/')})</button>
          ))}
        </div>
      </div>
      {chosenWorkers.length > 0 && (
        <div className="org__add-row org__add-row--holdsets">
          <label>Días esta semana <span className="org__hint">(vacaciones o un cambio puntual, sin tocar lo de siempre)</span></label>
          <div className="org__holdset-chips">
            {chosenWorkers.map(w => (
              <button key={w.id} type="button" className="org__link-btn" onClick={() => setEditingDays(cur => cur === w.id ? null : w.id)}>
                {w.name}: editar días
              </button>
            ))}
          </div>
          {editingDays != null && (
            <div className="org__holdset-chips">
              {ALL_WEEK_DAYS.map(d => (
                <button
                  key={d} type="button"
                  className={`org__holdset-chip${(workDaysOverride[editingDays] ?? workers.find(w => w.id === editingDays)?.workDays ?? []).includes(d) ? ' org__holdset-chip--on' : ''}`}
                  onClick={() => toggleDayOverride(editingDays, d)}
                >{DAY_LABEL[d]}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <label className="org__add-row org__add-row--check">
        <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} />
        <span>Semana de prueba (no sale en la lista normal del equipo; se puede borrar del todo aunque tenga algo hecho)</span>
      </label>
      {error && <p className="org__error">{error}</p>}
      <p className="org__hint">
        {chosenWorkers.length === 0
          ? 'Elige quién trabaja esta semana.'
          : `${chosenWorkers.length} persona(s): ${chosenWorkers.map(w => w.name).join(', ')}.`}
      </p>
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear semana y repartir tareas'}</button>
      </div>
    </div>
  )
}

// Tarea suelta para un día concreto, del catálogo o con texto libre (creador de tareas de
// Álvaro, Ramiro 1/11 17:20) — se usa igual en el tablero de Semana y en Hoy.
function LooseTaskForm({ config, assignmentId, defaultDate, weekStart, onDone, onCancel }) {
  const [taskTypeId, setTaskTypeId] = useState('')
  const [customText, setCustomText] = useState('')
  const [date, setDate] = useState(defaultDate || weekStart || todayStr())
  const [notas, setNotas] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!taskTypeId && !customText.trim()) { setError('Elige un tipo del catálogo o escribe un texto.'); return }
    setSaving(true); setError(null)
    try {
      await api('POST', '/equipacion/tasks', { assignmentId, date, taskTypeId, customText: customText.trim(), notas })
      onDone()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="org__add-form">
      <div className="org__add-row">
        <label>Tipo (del catálogo)</label>
        <select value={taskTypeId} onChange={e => { setTaskTypeId(e.target.value); if (e.target.value) setCustomText('') }}>
          <option value="">— elige uno o escribe texto libre abajo —</option>
          {(config.taskTypes || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="org__add-row">
        <label>O texto libre</label>
        <input type="text" value={customText} onChange={e => { setCustomText(e.target.value); if (e.target.value) setTaskTypeId('') }} placeholder="p. ej. arreglar una presa suelta" />
      </div>
      <div className="org__add-row"><label>Día</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      {taskTypeId && <div className="org__add-row"><label>Notas (opcional)</label><input type="text" value={notas} onChange={e => setNotas(e.target.value)} /></div>}
      {error && <p className="org__error">{error}</p>}
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Añadiendo...' : 'Añadir tarea'}</button>
      </div>
    </div>
  )
}

// Tile visual de una tarea: checklist incorporado (checkbox) + info de la
// tarea (subzona, objetivo...) + arrastrable a otra persona/día. Las tareas
// no se cancelan, solo se mueven a la semana siguiente ("→ Semana
// siguiente"), y quedan marcadas "retrasada" para que no se pierda el
// histórico de lo que se fue quedando atrás.
function TaskTile({ task, typeName, isMissed, dragging, postponing, onPointerDown, onToggleDone, onPostpone, canManage, onDelete, deleting }) {
  const params = Object.entries(task.params || {}).filter(([k, v]) => v && k !== 'texto').map(([k, v]) => `${k}: ${v}`).join(' · ')
  const movedAway = task.status === 'retrasada' && task.movedToTaskId
  const isRetrasada = task.status === 'retrasada'
  const canPostpone = !task.done && !movedAway

  let badge = null
  if (movedAway) badge = `RETRASADA → semana del ${dayLabel(task.movedToDate)}`
  else if (task.postponedCount > 0) badge = `RETRASADA (×${task.postponedCount}) · prevista ${dayLabel(task.originalDate || task.date)}`
  else if (isMissed) badge = 'FALTÓ'

  return (
    <div
      className={`org__tile${task.done ? ' org__tile--done' : ''}${isMissed ? ' org__tile--missed' : ''}${isRetrasada ? ' org__tile--retrasada' : ''}${dragging ? ' org__tile--dragging' : ''}`}
      onPointerDown={onPointerDown}
    >
      <label className="org__tile-check" onPointerDown={e => e.stopPropagation()}>
        <input type="checkbox" checked={task.done} onChange={e => onToggleDone(task.id, e.target.checked)} />
      </label>
      <div className="org__tile-body">
        <span className="org__tile-name">{typeName}</span>
        {params && <span className="org__tile-params">{params}</span>}
        {badge && <span className="org__tile-badge">{badge}</span>}
      </div>
      {canPostpone && (
        <button
          type="button"
          className="org__tile-postpone"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onPostpone(task.id)}
          disabled={postponing}
        >{postponing ? '...' : '→ Semana siguiente'}</button>
      )}
      {canManage && (
        <button
          type="button"
          className="org__tile-delete"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onDelete(task.id)}
          disabled={deleting}
          title="Quitar esta tarea"
        >{deleting ? '...' : '✕ Quitar'}</button>
      )}
    </div>
  )
}

// ─── Normas ───────────────────────────────────────────────────────────
function NormasView({ config, canManage, onConfigChanged }) {
  const [allTypes, setAllTypes] = useState(null) // incluye inactivas, solo si canManage
  const [editing, setEditing] = useState(null) // id del tipo que se está editando entero
  const [editForm, setEditForm] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const reloadAll = useCallback(() => {
    if (!canManage) return
    api('GET', '/equipacion/task-types/all').then(r => setAllTypes(r.data || [])).catch(() => {})
  }, [canManage])
  useEffect(() => { reloadAll() }, [reloadAll])

  const types = canManage && allTypes ? allTypes : (config.taskTypes || [])

  const startEdit = t => {
    setEditing(t.id)
    setEditForm({
      name: t.name, description: t.description || '', periodicityWeeks: t.periodicityWeeks ?? 1,
      preferredDay: t.preferredDay || '', subzone: t.subzone ?? '', durationMin: t.durationMin ?? '',
      leadOnly: !!t.leadOnly,
    })
  }
  const save = async id => {
    try {
      await api('PUT', `/equipacion/task-types/${id}`, editForm)
    } catch (e) { window.alert(e.message) }
    setEditing(null); setEditForm(null)
    onConfigChanged(); reloadAll()
  }
  const [showInactive, setShowInactive] = useState(false)
  const toggleActive = async t => {
    try {
      if (t.active) {
        // Si nunca se usó, el backend la borra de verdad en vez de solo desactivarla.
        await api('DELETE', `/equipacion/task-types/${t.id}`)
      } else await api('PUT', `/equipacion/task-types/${t.id}`, { active: true })
    } catch (e) { window.alert(e.message) }
    onConfigChanged(); reloadAll()
  }

  return (
    <div>
      <section className="org__section">
        <h3 className="org__section-title">Catálogo de tareas</h3>
        <p className="org__hint">
          El sistema propone solo las tareas activas que tocan según su periodicidad, y elige a quien más
          la haya hecho antes. {canManage ? 'Puedes crear tareas nuevas, editarlas o desactivarlas (nunca se borran, para no perder el histórico).' : 'Solo el responsable o un socio pueden crear o editar tareas del catálogo.'}
        </p>
        <ul className="org__task-list">
          {types.filter(t => t.active !== false).map(t => (
            <li key={t.id} className="org__task">
              {editing === t.id ? (
                <TaskTypeEditForm form={editForm} setForm={setEditForm} config={config} onSave={() => save(t.id)} onCancel={() => { setEditing(null); setEditForm(null) }} />
              ) : (
                <>
                  <span className="org__task-name">{t.name}</span>
                  {t.description && <span className="org__task-params">{t.description}</span>}
                  <span className="org__task-params">cada {t.periodicityWeeks ?? 1} semana(s){t.preferredDay ? ` · ${DAY_LABEL[t.preferredDay] || t.preferredDay}` : ''}{t.subzone ? ` · subzona #${t.subzone}` : ''}{t.durationMin ? ` · ${t.durationMin} min` : ''}{t.leadOnly ? ' · siempre al responsable' : ''}</span>
                  {canManage && (
                    <span className="org__periodicity-edit">
                      <button className="org__link-btn" onClick={() => startEdit(t)}>Editar</button>
                      <button className="org__link-btn" onClick={() => toggleActive(t)}>Desactivar</button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        {canManage && types.some(t => t.active === false) && (
          <>
            <button className="org__link-btn" onClick={() => setShowInactive(s => !s)}>
              {showInactive ? 'Ocultar desactivadas' : `Ver desactivadas (${types.filter(t => t.active === false).length})`}
            </button>
            {showInactive && (
              <ul className="org__task-list">
                {types.filter(t => t.active === false).map(t => (
                  <li key={t.id} className="org__task org__task--inactive">
                    <span className="org__task-name">{t.name} (desactivada)</span>
                    <span className="org__periodicity-edit">
                      <button className="org__link-btn" onClick={() => toggleActive(t)}>Reactivar</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {canManage && !showCreate && <button className="org__add-btn" onClick={() => setShowCreate(true)}>+ Nueva tarea</button>}
        {canManage && showCreate && (
          <CreateTaskTypeForm config={config} onDone={() => { setShowCreate(false); onConfigChanged(); reloadAll() }} onCancel={() => setShowCreate(false)} />
        )}
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

function TaskTypeEditForm({ form, setForm, config, onSave, onCancel }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="org__add-form">
      <div className="org__add-row"><label>Nombre</label><input type="text" value={form.name} onChange={e => set('name', e.target.value)} /></div>
      <div className="org__add-row"><label>Descripción / instrucciones</label><textarea value={form.description} onChange={e => set('description', e.target.value)} /></div>
      <div className="org__add-row"><label>Periodicidad</label>
        <span>cada <input type="number" min="1" max="12" value={form.periodicityWeeks} onChange={e => set('periodicityWeeks', Number(e.target.value))} /> semana(s)</span>
      </div>
      <div className="org__add-row"><label>Día preferido</label>
        <select value={form.preferredDay} onChange={e => set('preferredDay', e.target.value)}>
          <option value="">Cualquiera</option>
          {ALL_WEEK_DAYS_5.map(d => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
        </select>
      </div>
      <div className="org__add-row"><label>Subzona (opcional)</label>
        <select value={form.subzone} onChange={e => set('subzone', e.target.value)}>
          <option value="">Sin asignar</option>
          {config.subzones.map(s => <option key={s} value={s}>#{s}</option>)}
        </select>
      </div>
      <div className="org__add-row"><label>Duración estimada (min)</label><input type="number" min="0" value={form.durationMin} onChange={e => set('durationMin', e.target.value)} /></div>
      <label className="org__add-row org__add-row--check">
        <input type="checkbox" checked={form.leadOnly} onChange={e => set('leadOnly', e.target.checked)} />
        <span>Siempre al responsable (él la reparte)</span>
      </label>
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel}>Cancelar</button>
        <button className="org__btn" onClick={onSave}>Guardar</button>
      </div>
    </div>
  )
}

function CreateTaskTypeForm({ config, onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', description: '', periodicityWeeks: 1, preferredDay: '', subzone: '', durationMin: '', leadOnly: false })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) { setError('Falta el nombre.'); return }
    setSaving(true); setError(null)
    try { await api('POST', '/equipacion/task-types', form); onDone() }
    catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="org__add-form">
      <div className="org__add-row"><label>Nombre</label><input type="text" value={form.name} onChange={e => set('name', e.target.value)} /></div>
      <div className="org__add-row"><label>Descripción / instrucciones</label><textarea value={form.description} onChange={e => set('description', e.target.value)} /></div>
      <div className="org__add-row"><label>Periodicidad</label>
        <span>cada <input type="number" min="1" max="12" value={form.periodicityWeeks} onChange={e => set('periodicityWeeks', Number(e.target.value))} /> semana(s) (o deja «sola una vez» marcando la tarea a mano, sin pedirla aquí)</span>
      </div>
      <div className="org__add-row"><label>Día preferido</label>
        <select value={form.preferredDay} onChange={e => set('preferredDay', e.target.value)}>
          <option value="">Cualquiera</option>
          {ALL_WEEK_DAYS_5.map(d => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
        </select>
      </div>
      <div className="org__add-row"><label>Subzona (opcional)</label>
        <select value={form.subzone} onChange={e => set('subzone', e.target.value)}>
          <option value="">Sin asignar</option>
          {config.subzones.map(s => <option key={s} value={s}>#{s}</option>)}
        </select>
      </div>
      <div className="org__add-row"><label>Duración estimada (min)</label><input type="number" min="0" value={form.durationMin} onChange={e => set('durationMin', e.target.value)} /></div>
      <label className="org__add-row org__add-row--check">
        <input type="checkbox" checked={form.leadOnly} onChange={e => set('leadOnly', e.target.checked)} />
        <span>Siempre al responsable (él la reparte)</span>
      </label>
      {error && <p className="org__error">{error}</p>}
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear tarea'}</button>
      </div>
    </div>
  )
}

// ─── Compe ────────────────────────────────────────────────────────────
// Organización de una competición: fecha, semanas de antelación para las
// tareas de equipación, y dónde va cada uno de los 16 bloques en el mapa.
// Más reglas (categorías, puntuación...) se añaden sobre la marcha.
function CompeView({ config, workers }) {
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
        comp={current} config={config} workers={workers}
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
            <span>{c.name} — {c.compDate}{c.compEndDate !== c.compDate ? ` al ${c.compEndDate}` : ''}{c.isTest ? ' (prueba)' : ''}</span>
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
  const [compEndDate, setCompEndDate] = useState('2026-12-04')
  const [leadWeeks, setLeadWeeks] = useState(3)
  const [isTest, setIsTest] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const res = await api('POST', '/equipacion/competitions', { name, compDate, compEndDate, leadWeeks, isTest })
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
      <div className="org__add-row"><label>Empieza</label><input type="date" value={compDate} onChange={e => setCompDate(e.target.value)} /></div>
      <div className="org__add-row"><label>Termina</label><input type="date" value={compEndDate} min={compDate} onChange={e => setCompEndDate(e.target.value)} /></div>
      <div className="org__add-row"><label>Semanas de antelación para las tareas</label><input type="number" min="1" max="12" value={leadWeeks} onChange={e => setLeadWeeks(Number(e.target.value))} /></div>
      <label className="org__add-row org__add-row--check">
        <input type="checkbox" checked={isTest} onChange={e => setIsTest(e.target.checked)} />
        <span>Competición de prueba (no sale en la lista normal; se puede borrar del todo)</span>
      </label>
      {error && <p className="org__error">{error}</p>}
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear (16 bloques)'}</button>
      </div>
    </div>
  )
}

// Vista "Mi parte"/tablero del plan generado de una compe: % hecho, lo retrasado en rojo, y un
// filtro por persona para que cada uno vea solo lo suyo (encargo "Preparador de compes", 1/11).
function CompePlanView({ compId, taskTypeById, workers }) {
  const [plan, setPlan] = useState(null)
  const [filterWorker, setFilterWorker] = useState('')
  const [generating, setGenerating] = useState(false)

  const reload = useCallback(() => {
    api('GET', `/equipacion/competitions/${compId}/plan`).then(r => setPlan(r.data)).catch(() => setPlan(null))
  }, [compId])
  useEffect(() => { reload() }, [reload])

  const generate = async () => {
    if (!window.confirm('¿Generar (o regenerar) el plan de tareas de esta compe? Si ya había uno, se sustituye por el nuevo.')) return
    setGenerating(true)
    try {
      const res = await api('POST', `/equipacion/competitions/${compId}/generate-plan`)
      if (res.warnings?.length) window.alert(res.warnings.join('\n'))
      await reload()
    } catch (e) { window.alert(e.message) } finally { setGenerating(false) }
  }

  const toggleDone = async (taskId, done) => {
    setPlan(p => ({ ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done } : t) }))
    try { await api('PUT', `/equipacion/tasks/${taskId}`, { done }) } catch {} finally { reload() }
  }

  const tasks = (plan?.tasks || []).filter(t => !filterWorker || String(t.workerId) === filterWorker)
  const byWeek = {}
  tasks.forEach(t => { (byWeek[t.weekStart] = byWeek[t.weekStart] || []).push(t) })
  const today = todayStr()

  return (
    <div className="org__section">
      <h4 className="org__section-title">Plan de la compe</h4>
      {(!plan || plan.total === 0) ? (
        <p className="org__hint">Todavía no hay un plan generado.</p>
      ) : (
        <p className="org__hint">{plan.pctHecho}% hecho ({plan.hechas}/{plan.total}) · {plan.retrasadas} retrasada(s)</p>
      )}
      <div className="org__add-actions">
        <button className="org__btn" onClick={generate} disabled={generating}>{generating ? 'Generando...' : (plan?.total ? 'Regenerar plan' : 'Generar plan')}</button>
        <select value={filterWorker} onChange={e => setFilterWorker(e.target.value)}>
          <option value="">Tablero completo</option>
          {workers.map(w => <option key={w.id} value={w.id}>Mi parte: {w.name}</option>)}
        </select>
      </div>
      {Object.keys(byWeek).sort().map(weekStart => (
        <div key={weekStart} className="org__historico-row">
          <p className="org__historico-title">Semana del {weekLabel(weekStart)}</p>
          <ul className="org__task-list">
            {byWeek[weekStart].map(t => (
              <li key={t.id} className={`org__task${!t.done && t.date < today ? ' org__tile--missed' : ''}`}>
                <label>
                  <input type="checkbox" checked={t.done} onChange={e => toggleDone(t.id, e.target.checked)} />
                  {' '}{taskTypeById[t.taskTypeId]?.name || t.taskTypeId} — {t.workerName} ({dayLabel(t.date)})
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// Arrastra una burbuja ya colocada para moverla, o toca un número sin
// colocar y luego el sitio del mapa — pensado para funcionar igual con
// ratón que con el dedo en la tablet.
function CompeMapEditor({ comp, config, workers, onBack }) {
  const wrapRef = useRef(null)
  const taskTypeById = useMemo(() => Object.fromEntries((config?.taskTypes || []).map(t => [t.id, t])), [config])
  const [blocks, setBlocks] = useState(comp.blocks)
  const [selectedToPlace, setSelectedToPlace] = useState(null)
  const [editingBlockId, setEditingBlockId] = useState(null)
  const [holdsets, setHoldsets] = useState([])
  const dragIdRef = useRef(null)
  const dragStartRef = useRef(null)
  const [trayDrag, setTrayDrag] = useState(null)
  const trayPointerRef = useRef(null)

  useEffect(() => { setBlocks(comp.blocks) }, [comp])
  useEffect(() => { api('GET', '/equipacion/holdsets').then(r => setHoldsets(r.data || [])).catch(() => {}) }, [])

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
    dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onWrapMove = e => {
    if (dragIdRef.current == null) return
    const st = dragStartRef.current
    if (st && !st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) st.moved = true
    const { x, y } = posFromClient(e.clientX, e.clientY)
    setBlocks(cur => cur.map(b => b.id === dragIdRef.current ? { ...b, xPct: x, yPct: y } : b))
  }
  // Un toque sin apenas movimiento (umbral de 6px, igual que la bandeja) abre la ficha del
  // bloque en vez de "guardar posición" — así un simple toque no hace falta distinguirlo de
  // un arrastre con un botón aparte (Ramiro, 1/11 17:20: "Álvaro no va a usar la API").
  const onWrapUp = async () => {
    const id = dragIdRef.current
    const moved = dragStartRef.current?.moved
    dragIdRef.current = null
    dragStartRef.current = null
    if (id == null) return
    if (!moved) { setEditingBlockId(id); return }
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
  // Arrastrar un número de la bandeja hasta el mapa (además de tocar y
  // tocar): mismo mecanismo de pointer que las burbujas ya colocadas, con un
  // umbral de movimiento para no romper el "toca y toca" con un simple tap.
  const onTrayPointerDown = id => e => {
    trayPointerRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onTrayPointerMove = e => {
    const st = trayPointerRef.current
    if (!st) return
    if (!st.moved && Math.hypot(e.clientX - st.startX, e.clientY - st.startY) > 6) st.moved = true
    if (st.moved) setTrayDrag({ id: st.id, ...posFromClient(e.clientX, e.clientY) })
  }
  const onTrayPointerUp = async e => {
    const st = trayPointerRef.current
    trayPointerRef.current = null
    if (!st) return
    if (!st.moved) {
      setSelectedToPlace(cur => cur === st.id ? null : st.id)
      return
    }
    setTrayDrag(null)
    const rect = wrapRef.current.getBoundingClientRect()
    const within = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    if (!within) return
    const { x, y } = posFromClient(e.clientX, e.clientY)
    setSelectedToPlace(null)
    setBlocks(cur => cur.map(b => b.id === st.id ? { ...b, xPct: x, yPct: y } : b))
    try { await api('PUT', `/equipacion/comp-blocks/${st.id}`, { xPct: x, yPct: y }) } catch {}
  }

  const unplace = async id => {
    setBlocks(cur => cur.map(b => b.id === id ? { ...b, xPct: null, yPct: null } : b))
    try { await api('PUT', `/equipacion/comp-blocks/${id}`, { unplace: true }) } catch {}
  }

  const unplaced = blocks.filter(b => b.xPct == null)
  const placed = blocks.filter(b => b.xPct != null)

  const removeComp = async () => {
    if (!window.confirm(`¿Borrar la competición "${comp.name}"? No se puede deshacer.`)) return
    try { await api('DELETE', `/equipacion/competitions/${comp.id}`) } catch {}
    onBack()
  }

  return (
    <div>
      <div className="org__semana-actions">
        <button className="org__link-btn" onClick={onBack}>← Volver a competiciones</button>
        <button className="org__link-btn" onClick={removeComp}>Borrar competición</button>
      </div>
      <h3 className="org__section-title">{comp.name} — {comp.compDate}{comp.compEndDate && comp.compEndDate !== comp.compDate ? ` al ${comp.compEndDate}` : ''}</h3>
      <p className="org__hint">Las tareas de equipación para esta compe empiezan el {comp.tasksStartDate}.</p>

      {unplaced.length > 0 && (
        <div className="org__comp-tray">
          <p className="org__hint">Arrastra un número al mapa, o toca el número y luego el sitio del mapa:</p>
          <div className="org__comp-tray-chips">
            {unplaced.map(b => (
              <button
                key={b.id}
                className={`org__comp-chip${selectedToPlace === b.id ? ' org__comp-chip--selected' : ''}`}
                onPointerDown={onTrayPointerDown(b.id)}
                onPointerMove={onTrayPointerMove}
                onPointerUp={onTrayPointerUp}
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
            className={`org__comp-bubble${b.tested ? ' org__comp-bubble--tested' : ''}`}
            style={{ left: `${b.xPct}%`, top: `${b.yPct}%`, borderColor: b.grade ? (GRADE_COLOR[b.grade] || '#fff') : undefined }}
            onPointerDown={startDrag(b.id)}
            onDoubleClick={() => unplace(b.id)}
            title="Toca para ver la ficha, arrastra para mover, doble clic para quitar del mapa"
          >{b.number}</div>
        ))}
        {trayDrag && (
          <div className="org__comp-bubble org__comp-bubble--ghost" style={{ left: `${trayDrag.x}%`, top: `${trayDrag.y}%` }}>
            {blocks.find(b => b.id === trayDrag.id)?.number}
          </div>
        )}
      </div>
      <p className="org__hint">{placed.length} de {blocks.length} bloques colocados. Toca una burbuja para su ficha, doble clic para quitarla del mapa.</p>

      {editingBlockId != null && (
        <CompBlockFicha
          block={blocks.find(b => b.id === editingBlockId)}
          config={config} holdsets={holdsets}
          onClose={() => setEditingBlockId(null)}
          onSaved={patch => { setBlocks(cur => cur.map(b => b.id === editingBlockId ? { ...b, ...patch } : b)) }}
        />
      )}

      <CompePlanView compId={comp.id} taskTypeById={taskTypeById} workers={workers || []} />
    </div>
  )
}

// Ficha de un bloque de compe: subzona, color, presas, volúmenes, equipador, foto (subida
// desde el móvil) y probado sí/no — Álvaro la rellena tocando una burbuja del mapa (Ramiro,
// 1/11 17:20).
function CompBlockFicha({ block, config, holdsets, onClose, onSaved }) {
  const [subzone, setSubzone] = useState(block.subzone ?? '')
  const [grade, setGrade] = useState(block.grade || '')
  const [holdSetIds, setHoldSetIds] = useState(block.holdSetIds || [])
  const [volumes, setVolumes] = useState(block.volumes || '')
  const [equipador, setEquipador] = useState(block.equipador || '')
  const [tested, setTested] = useState(!!block.tested)
  const [photoUrl, setPhotoUrl] = useState(block.photoUrl || '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const toggleHoldSet = id => setHoldSetIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const uploadPhoto = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/equipacion/comp-blocks/${block.id}/photo`, {
        method: 'POST', credentials: 'include', headers: getAuthHeaders(), body: formData,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
      setPhotoUrl(json.photoUrl)
    } catch (err) {
      window.alert(err.message)
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api('PUT', `/equipacion/comp-blocks/${block.id}`, {
        subzone: subzone === '' ? null : Number(subzone), grade, holdSetIds, volumes, equipador, tested,
      })
      onSaved({ subzone: subzone === '' ? null : Number(subzone), grade, holdSetIds, volumes, equipador, tested, photoUrl })
      onClose()
    } catch (e) {
      window.alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="org__add-form">
      <div className="org__semana-actions">
        <p className="org__section-title" style={{ margin: 0 }}>Bloque #{block.number}</p>
        <button className="org__link-btn" onClick={onClose}>Cerrar</button>
      </div>
      <div className="org__add-row">
        <label>Subzona</label>
        <select value={subzone} onChange={e => setSubzone(e.target.value)}>
          <option value="">Sin asignar</option>
          {config.subzones.map(s => <option key={s} value={s}>#{s}</option>)}
        </select>
      </div>
      <div className="org__add-row">
        <label>Color</label>
        <select value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="">Sin asignar</option>
          {config.grades.map(g => <option key={g.color} value={g.color}>{g.color} ({g.range})</option>)}
        </select>
      </div>
      <div className="org__add-row org__add-row--holdsets">
        <label>Juego(s) de presas</label>
        <div className="org__holdset-chips">
          {holdsets.map(h => (
            <button key={h.id} type="button" className={`org__holdset-chip${holdSetIds.includes(h.id) ? ' org__holdset-chip--on' : ''}`} onClick={() => toggleHoldSet(h.id)}>{h.name}</button>
          ))}
        </div>
      </div>
      <div className="org__add-row">
        <label>Volúmenes</label>
        <textarea value={volumes} onChange={e => setVolumes(e.target.value)} placeholder="Tipo, tamaño o nombre de los volúmenes de este bloque" />
      </div>
      <div className="org__add-row">
        <label>Equipador</label>
        <input type="text" value={equipador} onChange={e => setEquipador(e.target.value)} />
      </div>
      <div className="org__add-row">
        <label>Foto</label>
        {photoUrl && <img src={photoUrl} alt={`Bloque #${block.number}`} className="org__comp-block-photo" />}
        <input type="file" accept="image/*" capture="environment" onChange={uploadPhoto} disabled={uploading} />
        {uploading && <span className="org__hint">Subiendo...</span>}
      </div>
      <label className="org__add-row org__add-row--check">
        <input type="checkbox" checked={tested} onChange={e => setTested(e.target.checked)} />
        <span>Probado (forerunning)</span>
      </label>
      <div className="org__add-actions">
        <button className="org__btn org__btn--ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="org__btn" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </div>
  )
}
