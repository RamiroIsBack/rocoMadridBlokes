import { useMemo } from 'react'
import './PlaygroundPage.css'

// ─── static data ─────────────────────────────────────────────────────────────

const PROF_META = {
  Alvaro:  { color: '#f5c842', text: '#111', costoMes: 1715.60, horasSem: 27, clasesSem: 12, costoClase: 21.18 },
  Sigurd:  { color: '#60a5fa', text: '#fff', costoMes: 903,     horasSem: 9,  clasesSem: 6,  costoClase: 27.60 },
  'Lucía': { color: '#34d399', text: '#111', costoMes: 314,     horasSem: 6,  clasesSem: 4,  costoClase: 18.13 },
  Sara:    { color: '#f97316', text: '#fff', costoMes: 523,     horasSem: 10, clasesSem: 6,  costoClase: 18.12 },
  Ana:     { color: '#a78bfa', text: '#fff', costoMes: 400,     horasSem: 7,  clasesSem: 3,  costoClase: 19.80 },
  Eva:     { color: '#fb7185', text: '#fff', costoMes: 1424.46, horasSem: 20, clasesSem: 4,  costoClase: 24.68 },
}
const PROF_ORDER = ['Alvaro', 'Sigurd', 'Lucía', 'Sara', 'Ana', 'Eva']
const DAYS       = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']
const DAY_LABEL  = { Lunes: 'Lunes', Martes: 'Martes', Miercoles: 'Miércoles', Jueves: 'Jueves', Viernes: 'Viernes' }

const SALA = {
  Lunes:     { apertura: '13:30', cierre: '22:30', abre: 'Alvaro', cierra: 'Ana' },
  Martes:    { apertura: '09:00', cierre: '22:30', abre: 'Sara',   cierra: 'Sigurd' },
  Miercoles: { apertura: '13:30', cierre: '22:30', abre: 'Alvaro', cierra: 'Ana' },
  Jueves:    { apertura: '09:00', cierre: '22:30', abre: 'Sara',   cierra: 'Sigurd' },
  Viernes:   { apertura: '15:30', cierre: '21:30', abre: 'Eva',    cierra: 'Eva' },
}

// Activities: tipo = 'clase' | 'equipar' | 'gestion' | 'comida'
const BASE = {
  Alvaro: {
    Lunes:     [
      { tipo: 'equipar', start: '13:00', end: '15:00' },
      { tipo: 'comida',  start: '15:00', end: '16:00' },
      { tipo: 'equipar', start: '16:00', end: '18:00' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
    Martes:    [
      { tipo: 'equipar', start: '13:00', end: '14:00' },
      { tipo: 'clase',   start: '14:00', end: '15:30' },
      { tipo: 'equipar', start: '15:30', end: '16:30' },
      { tipo: 'clase',   start: '16:30', end: '18:00' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
    Miercoles: [
      { tipo: 'equipar', start: '13:00', end: '15:00' },
      { tipo: 'comida',  start: '15:00', end: '16:00' },
      { tipo: 'equipar', start: '16:00', end: '18:00' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
    Jueves:    [
      { tipo: 'clase',   start: '14:00', end: '15:30' },
      { tipo: 'equipar', start: '15:30', end: '16:30' },
      { tipo: 'clase',   start: '16:30', end: '18:00' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
  },
  Sigurd: {
    Martes: [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
      { tipo: 'clase', start: '20:30', end: '22:00' },
    ],
    Jueves: [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
      { tipo: 'clase', start: '20:30', end: '22:00' },
    ],
  },
  'Lucía': {
    Lunes:     [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
    ],
    Miercoles: [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
    ],
  },
  Sara: {
    Martes: [
      { tipo: 'clase',   start: '09:00', end: '10:30' },
      { tipo: 'clase',   start: '10:30', end: '12:00' },
      { tipo: 'clase',   start: '12:00', end: '13:30' },
      { tipo: 'equipar', start: '13:30', end: '14:00' },
    ],
    Jueves: [
      { tipo: 'clase',   start: '09:00', end: '10:30' },
      { tipo: 'clase',   start: '10:30', end: '12:00' },
      { tipo: 'clase',   start: '12:00', end: '13:30' },
      { tipo: 'equipar', start: '13:30', end: '14:00' },
    ],
  },
  Ana: {
    Lunes:     [{ tipo: 'clase', start: '20:30', end: '22:00' }],
    Miercoles: [{ tipo: 'clase', start: '20:30', end: '22:00' }],
    Viernes:   [
      { tipo: 'equipar', start: '17:00', end: '19:00' },
      { tipo: 'clase',   start: '19:00', end: '20:30' },
    ],
  },
  Eva: {
    Lunes:     [{ tipo: 'gestion', start: '17:30', end: '21:00' }],
    Martes:    [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '18:30', end: '20:00' },
    ],
    Miercoles: [{ tipo: 'gestion', start: '17:30', end: '21:00' }],
    Jueves:    [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '18:30', end: '20:00' },
    ],
    Viernes:   [{ tipo: 'gestion', start: '15:30', end: '21:30' }],
  },
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const SCALE   = 1      // px per minute
const H_START = 9      // 09:00
const H_END   = 22.5   // 22:30
const CELL_H  = (H_END - H_START) * 60 * SCALE  // 810 px

function toMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function actTop(start)     { return (toMin(start) - H_START * 60) * SCALE }
function actH(start, end)  { return (toMin(end) - toMin(start)) * SCALE }

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

  return (
    <div
      className={`pg-act pg-act--${act.tipo}`}
      style={{ top, height, left, width, background: color, opacity: TIPO_OPACITY[act.tipo] }}
      title={`${act.start}–${act.end} · ${TIPO_LABEL[act.tipo]}`}
    >
      {height >= 18 && (
        <span className="pg-act__txt" style={{ color: textColor }}>
          {act.start}{height >= 36 ? ` · ${TIPO_LABEL[act.tipo]}` : ''}
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

function TimeColCell({ showLabels }) {
  return (
    <div className="pg-time-col" style={{ height: CELL_H }}>
      {HOURS.map(h => {
        if (h > H_END) return null
        const top = (h - H_START) * 60 * SCALE
        return (
          <div key={h} className="pg-time-tick" style={{ top }}>
            {showLabels && (
              <span className="pg-time-tick__lbl">
                {String(h).padStart(2, '0')}:00
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProfCard({ name }) {
  const m = PROF_META[name]
  return (
    <div className="pg-prof-card" style={{ borderTopColor: m.color }}>
      <div className="pg-prof-card__header">
        <span className="pg-prof-card__dot" style={{ background: m.color }} />
        <span className="pg-prof-card__name" style={{ color: m.color }}>{name}</span>
      </div>
      <div className="pg-prof-card__stat">
        <span className="pg-prof-card__lbl">Coste/mes</span>
        <span className="pg-prof-card__val">
          {m.costoMes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
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
        <span className="pg-prof-card__lbl">€/clase</span>
        <span className="pg-prof-card__val">{m.costoClase.toFixed(2)}€</span>
      </div>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PlaygroundPage() {
  const sd = window.blokesSiteData || {}

  if (sd.userRole !== 'socio') {
    return <div className="pg-restricted"><p>Acceso restringido a socios.</p></div>
  }

  const totalCost  = Object.values(PROF_META).reduce((s, m) => s + m.costoMes, 0)
  const totalClass = Object.values(PROF_META).reduce((s, m) => s + m.clasesSem, 0)
  const avgPerSes  = totalCost / (totalClass * 4.33)

  return (
    <div className="pg-page">
      <div className="pg-page-head">
        <h1 className="pg-title">Horarios Playground</h1>
        <p className="pg-subtitle">Horario base · Marzo 2026</p>
      </div>

      {/* KPIs */}
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
          <div className="pg-kpi__val">{avgPerSes.toFixed(0)}€</div>
          <div className="pg-kpi__lbl">Coste medio / sesión</div>
        </div>
        <div className="pg-kpi">
          <div className="pg-kpi__val">6</div>
          <div className="pg-kpi__lbl">Profes activos</div>
        </div>
      </div>

      {/* Professor cards */}
      <div className="pg-profs">
        {PROF_ORDER.map(n => <ProfCard key={n} name={n} />)}
      </div>

      {/* Legend */}
      <div className="pg-legend">
        {Object.entries(TIPO_LABEL).map(([tipo, label]) => (
          <span key={tipo} className={`pg-leg pg-leg--${tipo}`}>{label}</span>
        ))}
      </div>

      {/* Schedule matrix */}
      <div className="pg-matrix-scroll">
        <div className="pg-matrix">

          {/* ── header row ── */}
          <div className="pg-matrix__corner" />
          <div className="pg-matrix__corner" />
          {DAYS.map(d => {
            const s  = SALA[d]
            const ac = PROF_META[s.abre]?.color
            const cc = PROF_META[s.cierra]?.color
            return (
              <div key={d} className="pg-day-head">
                <div className="pg-day-head__name">{DAY_LABEL[d]}</div>
                <div className="pg-day-head__hours">{s.apertura} – {s.cierre}</div>
                <div className="pg-day-head__ops">
                  <span title="Abre" style={{ color: ac }}>▲ {s.abre}</span>
                  <span title="Cierra" style={{ color: cc }}>▼ {s.cierra}</span>
                </div>
              </div>
            )
          })}

          {/* ── professor rows ── */}
          {PROF_ORDER.map((prof, i) => {
            const m = PROF_META[prof]
            return [
              <TimeColCell key={`time-${prof}`} showLabels={i === 0} />,
              <div
                key={`lbl-${prof}`}
                className="pg-prof-cell"
                style={{ borderLeftColor: m.color }}
              >
                <span className="pg-prof-cell__name" style={{ color: m.color }}>{prof}</span>
                <span className="pg-prof-cell__cost">{m.costoMes.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}/mes</span>
              </div>,
              ...DAYS.map(d => <DayCell key={`${prof}-${d}`} prof={prof} day={d} />),
            ]
          })}

        </div>
      </div>
    </div>
  )
}
