import { useState, useMemo } from 'react'
import './PlaygroundPage.css'
import { PROF_META, PROF_ORDER, DAYS, DAY_LABEL, SALA, BASE } from '../data/staffSchedule'
import { useCostes } from '../hooks/useCostes'

// ─── static data ─────────────────────────────────────────────────────────────

// Revenue per student per class session based on rocomadrid.com tariffs
// 2-day tariff (Mon+Wed or Tue+Thu): adults tarde €86/8=10.75, mañana €77/8=9.625
// 1-day tariff: tarde €74/4=18.5, mañana €68/4=17
const BREAKEVEN_REV = {
  Alvaro:  86 / 8,  // tarde 2-day (most classes Mon/Wed/Tue/Thu evenings)
  Sigurd:  86 / 8,  // tarde 2-day (Tue/Thu evenings)
  'Lucía': 86 / 8,  // tarde 2-day (Mon/Wed 17:30, 19:00)
  Sara:    77 / 8,  // mañana 2-day (Tue/Thu mornings 09:00–12:00)
  Ana:     74 / 4,  // tarde 1-day (standalone Mon 20:30 and Fri 19:00)
  Eva:     86 / 8,  // tarde 2-day (Tue/Thu classes)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const SCALE   = 1
const H_START = 9
const H_END   = 22.5
const CELL_H  = (H_END - H_START) * 60 * SCALE  // 810 px

function toMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function actTop(start)    { return (toMin(start) - H_START * 60) * SCALE }
function actH(start, end) { return (toMin(end) - toMin(start)) * SCALE }

function layoutActs(acts) {
  const sorted = [...acts].sort((a, b) => toMin(a.start) - toMin(b.start))
  const lanes  = []
  return sorted.map(a => {
    const s = toMin(a.start)
    const e = toMin(a.end)
    let l = lanes.findIndex(x => x <= s)
    if (l === -1) { l = lanes.length; lanes.push(e) } else lanes[l] = e
    return { ...a, lane: l }
  })
}

const HOURS = Array.from({ length: 15 }, (_, i) => H_START + i)

const TIPO_OPACITY = { clase: 1, equipar: 0.7, gestion: 0.5, comida: 0.22 }
const TIPO_LABEL   = { clase: 'Clase', equipar: 'Equipar', gestion: 'Gestión', comida: 'Comida' }

// ─── sub-components ───────────────────────────────────────────────────────────

function ActBlock({ act, lanes, color, textColor }) {
  const top    = actTop(act.start)
  const height = Math.max(actH(act.start, act.end), 4)
  const lw     = 100 / lanes
  const left   = `calc(${act.lane * lw}% + 2px)`
  const width  = `calc(${lw}% - 4px)`
  const txt    = act.label || TIPO_LABEL[act.tipo]

  return (
    <div
      className={`pg-act pg-act--${act.tipo}`}
      style={{ top, height, left, width, background: color, opacity: TIPO_OPACITY[act.tipo] }}
      title={`${act.start}–${act.end} · ${txt}`}
    >
      {height >= 18 && (
        <span className="pg-act__txt" style={{ color: textColor }}>
          {act.start}{height >= 36 ? ` · ${txt}` : ''}
        </span>
      )}
    </div>
  )
}

function DayCell({ prof, day }) {
  const m    = PROF_META[prof]
  const raw  = BASE[prof]?.[day] ?? []
  const acts = useMemo(() => layoutActs(raw), []) // eslint-disable-line
  const lanes = acts.length ? Math.max(...acts.map(a => a.lane)) + 1 : 1

  return (
    <div className={`pg-day-cell${acts.length === 0 ? ' pg-day-cell--empty' : ''}`} style={{ height: CELL_H }}>
      {acts.map((a, i) => (
        <ActBlock key={i} act={a} lanes={lanes} color={m.color} textColor={m.text} />
      ))}
    </div>
  )
}

function TimeColCell() {
  return (
    <div className="pg-time-col" style={{ height: CELL_H }}>
      {HOURS.map(h => {
        if (h > H_END) return null
        const top = (h - H_START) * 60 * SCALE
        return (
          <div key={h} className="pg-time-tick" style={{ top }}>
            <span className="pg-time-tick__lbl">{String(h).padStart(2, '0')}:00</span>
          </div>
        )
      })}
    </div>
  )
}

function ProfCard({ name, coste, selected, onSelect }) {
  const m = PROF_META[name]
  return (
    <div
      className={`pg-prof-card${selected ? ' pg-prof-card--active' : ''}`}
      style={{ borderTopColor: m.color }}
      onClick={() => onSelect(name)}
    >
      <div className="pg-prof-card__header">
        <span className="pg-prof-card__dot" style={{ background: m.color }} />
        <span className="pg-prof-card__name" style={{ color: m.color }}>{name}</span>
      </div>
      <div className="pg-prof-card__stat">
        <span className="pg-prof-card__lbl">Coste/mes</span>
        <span className="pg-prof-card__val">
          {(coste ?? m.costoMes).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
        </span>
      </div>
      <div className="pg-prof-card__stat">
        <span className="pg-prof-card__lbl">Horas/sem</span>
        <span className="pg-prof-card__val">{m.horasSem}h</span>
      </div>
      <div className="pg-prof-card__stat">
        <span className="pg-prof-card__lbl">Clases/sem</span>
        <span className="pg-prof-card__val">{m.clasesSem}</span>
      </div>
      <div className="pg-prof-card__stat">
        <span className="pg-prof-card__lbl">€/h clase</span>
        <span className="pg-prof-card__val">{m.costoHClase.toFixed(2)}€</span>
      </div>
      <div className="pg-prof-card__stat">
        <span className="pg-prof-card__lbl">Min. alumnos</span>
        <span className="pg-prof-card__val pg-prof-card__breakeven">
          {Math.ceil((m.costoHClase * 1.5) / BREAKEVEN_REV[name])} al.
        </span>
      </div>
      {(m.equipHSem > 0 || m.equipHMes > 0) && (
        <div className="pg-prof-card__stat">
          <span className="pg-prof-card__lbl">Equip</span>
          <span className="pg-prof-card__val">
            {m.equipHMes ? `${m.equipHMes}h/mes` : `${m.equipHSem}h/sem`}
          </span>
        </div>
      )}
      {m.costoHEquipar != null && (
        <div className="pg-prof-card__stat">
          <span className="pg-prof-card__lbl">€/h equip</span>
          <span className="pg-prof-card__val">{m.costoHEquipar.toFixed(2)}€</span>
        </div>
      )}
    </div>
  )
}

// ─── Scenario B: reassign a class ────────────────────────────────────────────

function ScenarioB() {
  const allClasses = useMemo(() => {
    const list = []
    DAYS.forEach(day => {
      PROF_ORDER.forEach(prof => {
        ;(BASE[prof]?.[day] || [])
          .filter(a => a.tipo === 'clase')
          .forEach(a => list.push({ day, prof, start: a.start, end: a.end, label: a.label || null }))
      })
    })
    return list.sort((a, b) =>
      DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || toMin(a.start) - toMin(b.start)
    )
  }, [])

  const [assign, setAssign] = useState({})

  const delta = useMemo(() => {
    let d = 0
    allClasses.forEach(cl => {
      const key = `${cl.day}|${cl.start}`
      const newP = assign[key]
      if (!newP) return
      const hours = (toMin(cl.end) - toMin(cl.start)) / 60
      d += ((PROF_META[newP]?.costoHClase || 0) - (PROF_META[cl.prof]?.costoHClase || 0)) * hours * 4.33
    })
    return d
  }, [assign, allClasses])

  const hasChanges = Object.values(assign).some(Boolean)

  return (
    <div className="pg-scenario">
      <h3 className="pg-scenario__title">B · Reasignar clase</h3>
      <p className="pg-scenario__desc">Cambia qué profe da cada clase y ve el impacto en el coste mensual.</p>
      <div className="pg-scenario-table-wrap">
        <table className="pg-scenario-table">
          <thead>
            <tr>
              <th>Día</th>
              <th>Hora</th>
              <th>Clase</th>
              <th>Profe actual</th>
              <th>Reasignar a</th>
            </tr>
          </thead>
          <tbody>
            {allClasses.map(cl => {
              const key = `${cl.day}|${cl.start}`
              return (
                <tr key={key}>
                  <td>{DAY_LABEL[cl.day]}</td>
                  <td>{cl.start}–{cl.end}</td>
                  <td>{cl.label || '—'}</td>
                  <td style={{ color: PROF_META[cl.prof]?.color }}>{cl.prof}</td>
                  <td>
                    <select
                      value={assign[key] || ''}
                      onChange={e => setAssign(prev => ({ ...prev, [key]: e.target.value }))}
                      className="pg-select"
                    >
                      <option value="">— sin cambio —</option>
                      {PROF_ORDER.filter(p => p !== cl.prof).map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {hasChanges && (
        <div className={`pg-scenario__delta${delta >= 0 ? ' pg-scenario__delta--up' : ' pg-scenario__delta--down'}`}>
          Impacto mensual estimado: {delta >= 0 ? '+' : ''}{delta.toFixed(2)} €/mes
        </div>
      )}
    </div>
  )
}

// ─── Scenario C: add new class hours ─────────────────────────────────────────

function ScenarioC() {
  const [form, setForm] = useState({ prof: 'Alvaro', day: 'Lunes', start: '18:00', dur: '1.5' })
  const [added, setAdded] = useState([])

  function addHours() {
    const hours = parseFloat(form.dur)
    if (isNaN(hours) || hours <= 0) return
    const endMin = toMin(form.start) + Math.round(hours * 60)
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
    setAdded(prev => [...prev, { ...form, end, hours }])
  }

  const totalDelta = useMemo(
    () => added.reduce((s, cl) => s + (PROF_META[cl.prof]?.costoHClase || 0) * cl.hours * 4.33, 0),
    [added]
  )

  return (
    <div className="pg-scenario">
      <h3 className="pg-scenario__title">C · Añadir horas de clase</h3>
      <p className="pg-scenario__desc">Simula el coste de añadir nuevas sesiones al horario.</p>
      <div className="pg-scenario-form">
        <select value={form.prof} onChange={e => setForm(p => ({ ...p, prof: e.target.value }))} className="pg-select">
          {PROF_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={form.day} onChange={e => setForm(p => ({ ...p, day: e.target.value }))} className="pg-select">
          {DAYS.map(d => <option key={d} value={d}>{DAY_LABEL[d]}</option>)}
        </select>
        <input
          type="time"
          value={form.start}
          onChange={e => setForm(p => ({ ...p, start: e.target.value }))}
          className="pg-input"
        />
        <select value={form.dur} onChange={e => setForm(p => ({ ...p, dur: e.target.value }))} className="pg-select">
          {['0.5', '1', '1.5', '2', '2.5', '3'].map(d => (
            <option key={d} value={d}>{d}h</option>
          ))}
        </select>
        <button onClick={addHours} className="pg-btn">Añadir</button>
      </div>
      {added.length > 0 && (
        <>
          <table className="pg-scenario-table">
            <thead>
              <tr><th>Profe</th><th>Día</th><th>Hora</th><th>Duración</th><th>Coste/mes</th><th /></tr>
            </thead>
            <tbody>
              {added.map((cl, i) => (
                <tr key={i}>
                  <td style={{ color: PROF_META[cl.prof]?.color }}>{cl.prof}</td>
                  <td>{DAY_LABEL[cl.day]}</td>
                  <td>{cl.start}–{cl.end}</td>
                  <td>{cl.hours}h</td>
                  <td>+{((PROF_META[cl.prof]?.costoHClase || 0) * cl.hours * 4.33).toFixed(2)} €</td>
                  <td>
                    <button onClick={() => setAdded(prev => prev.filter((_, j) => j !== i))} className="pg-btn-remove">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pg-scenario__delta pg-scenario__delta--up">
            Coste adicional total: +{totalDelta.toFixed(2)} €/mes
          </div>
        </>
      )}
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PlaygroundPage() {
  const sd = window.blokesSiteData || {}
  const [selectedProf, setSelectedProf] = useState('Alvaro')
  const costes = useCostes()

  if (sd.userRole !== 'socio') {
    return <div className="pg-restricted"><p>Acceso restringido a socios.</p></div>
  }

  const totalCost  = PROF_ORDER.reduce((s, p) => s + (costes.mes[p] ?? PROF_META[p].costoMes), 0)
  const totalClass = Object.values(PROF_META).reduce((s, m) => s + m.clasesSem, 0)
  const totalHClase = Object.values(PROF_META).reduce((s, m) => s + m.clasesSem * 1.5, 0)
  const avgHClase  = totalCost / (totalHClase * 4.33)

  const selMeta = PROF_META[selectedProf]

  return (
    <div className="pg-page">
      <div className="pg-page-head">
        <h1 className="pg-title">Horarios Profes</h1>
        <p className="pg-subtitle">Horario base · Marzo 2026</p>
      </div>

      <div className="pg-kpis">
        <div className="pg-kpi">
          <div className="pg-kpi__val">
            {totalCost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </div>
          <div className="pg-kpi__lbl">Coste / mes</div>
        </div>
        <div className="pg-kpi">
          <div className="pg-kpi__val">{totalClass}</div>
          <div className="pg-kpi__lbl">Clases / semana</div>
        </div>
        <div className="pg-kpi">
          <div className="pg-kpi__val">{avgHClase.toFixed(0)}€</div>
          <div className="pg-kpi__lbl">Coste medio €/h clase</div>
        </div>
        <div className="pg-kpi">
          <div className="pg-kpi__val">6</div>
          <div className="pg-kpi__lbl">Profes activos</div>
        </div>
      </div>

      <div className="pg-profs">
        {PROF_ORDER.map(n => (
          <ProfCard key={n} name={n} coste={costes.mes[n]} selected={selectedProf === n} onSelect={setSelectedProf} />
        ))}
      </div>

      <div className="pg-legend">
        {Object.entries(TIPO_LABEL).map(([tipo, label]) => (
          <span key={tipo} className={`pg-leg pg-leg--${tipo}`}>{label}</span>
        ))}
      </div>

      <div className="pg-schedule-section">
        <div className="pg-schedule-label" style={{ color: selMeta.color }}>
          Semana de {selectedProf}
        </div>
        <div className="pg-schedule-scroll">
          <div className="pg-single-grid">
            <div className="pg-matrix__corner" />
            {DAYS.map(d => {
              const s = SALA[d]
              const isAbre   = s.abre   === selectedProf
              const isCierra = s.cierra === selectedProf
              return (
                <div key={d} className="pg-day-head">
                  <div className="pg-day-head__name">{DAY_LABEL[d]}</div>
                  <div className="pg-day-head__hours">{s.apertura} – {s.cierre}</div>
                  {(isAbre || isCierra) && (
                    <div className="pg-day-head__ops">
                      {isAbre   && <span style={{ color: selMeta.color }}>▲ Abre</span>}
                      {isCierra && <span style={{ color: selMeta.color }}>▼ Cierra</span>}
                    </div>
                  )}
                </div>
              )
            })}
            <TimeColCell />
            {DAYS.map(d => <DayCell key={`${selectedProf}-${d}`} prof={selectedProf} day={d} />)}
          </div>
        </div>
      </div>

      <ScenarioB />
      <ScenarioC />
    </div>
  )
}
