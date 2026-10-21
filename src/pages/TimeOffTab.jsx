import { useState, useMemo, useEffect } from 'react'
import { PROF_META, PROF_ORDER, DAYS, DAY_LABEL } from '../data/staffSchedule'
import {
  KEY_HOLDERS_DEFAULT, VERANO_APERTURA, actsFor, veranoSlots, pairConflict, simulatePlan,
  laborablesBetween, laborablesFrom, expandPeriods, isSummer, weekdayOf, fmtShort,
  diasDevengados, minimoVerano, MESES_DISCONTINUO,
} from '../utils/coverage'

const STORAGE_KEY = 'blokes.timeoff.v1'
const DIAS_ANUALES = 23
const HOY_DISCONTINUOS = ['Sigurd']

const LEVEL_LABEL = { rojo: 'No coincidir', ambar: 'Evitar', verde: 'Posible' }
const DAY_SHORT   = { Lunes: 'L', Martes: 'M', Miercoles: 'X', Jueves: 'J', Viernes: 'V' }

// Temporada sep→ago: la Navidad de este año y el verano del siguiente
function temporada() {
  const now = new Date()
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
}

function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d) - today) / 86400000)
}

function clasesSem(prof) {
  return DAYS.reduce((n, d) => n + actsFor(prof, d, 'invierno').filter(a => a.tipo === 'clase').length, 0)
}

// Tardes de verano en las que la persona está en la sala con su horario actual
function tardesVerano(prof) {
  return DAYS.filter(d => actsFor(prof, d, 'verano').length > 0).length
}

const CLASES_VERANO = DAYS.reduce((n, d) => n + veranoSlots(d).length, 0)

let nextId = 1
const period = (prof, start, n) => ({ id: nextId++, prof, start, n })

function presetPlan(kind) {
  const y = temporada()
  const navidad = [
    period('Sigurd', `${y}-12-21`, 4),
    period('Lucía',  `${y}-12-21`, 4),
    period('Ana',    `${y}-12-21`, 4),
    period('Alvaro', `${y}-12-28`, 4),
    period('Eva',    `${y + 1}-01-04`, 4),
    period('Sara',   `${y + 1}-01-04`, 4),
  ]
  const veranoBase = [
    period('Alvaro', `${y + 1}-07-01`, 12),
    period('Eva',    `${y + 1}-07-19`, 12),
    period('Ana',    `${y + 1}-08-04`, 12),
  ]
  if (kind === 'discontinuas') {
    return { discontinuos: ['Sigurd', 'Sara', 'Lucía'], periods: [...navidad, ...veranoBase] }
  }
  return {
    discontinuos: [...HOY_DISCONTINUOS],
    periods: [
      ...navidad, ...veranoBase,
      period('Lucía', `${y + 1}-08-04`, 12),
      period('Sara',  `${y + 1}-07-01`, 12),
    ],
  }
}

function defaultState() {
  return {
    ...presetPlan('hoy'),
    keys: [...KEY_HOLDERS_DEFAULT],
    dias: Object.fromEntries(PROF_ORDER.map(p => [p, DIAS_ANUALES])),
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const s = JSON.parse(raw)
    s.periods.forEach(p => { p.id = nextId++ })
    return { ...defaultState(), ...s }
  } catch {
    return defaultState()
  }
}

// ─── Normas y plazos ─────────────────────────────────────────────────────────
function Normas() {
  const y = temporada()
  const plazos = [
    { label: 'Avisar vacaciones de Navidad', date: `${y}-11-01`, detail: `Navidad ${y}/${String(y + 1).slice(2)}` },
    { label: 'Avisar vacaciones de verano',  date: `${y + 1}-03-01`, detail: `Julio y agosto ${y + 1}` },
  ]
  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Normas</h3>
      <div className="sv-kpis">
        {plazos.map(p => {
          const n = daysUntil(p.date)
          return (
            <div key={p.label} className="sv-kpi" style={{ '--kpi-color': n < 0 ? '#555' : n <= 15 ? '#f97316' : '#34d399' }}>
              <span className="sv-kpi__value">{n < 0 ? 'Cerrado' : `${n} días`}</span>
              <span className="sv-kpi__label">{p.label} · antes del {fmtShort(p.date)} · {p.detail}</span>
            </div>
          )
        })}
      </div>
      <ul className="sv-to-rules">
        <li><strong>{DIAS_ANUALES} días laborables</strong> al año. Al menos el 50 % (<strong>{Math.ceil(DIAS_ANUALES / 2)} días</strong>) en julio y agosto.</li>
        <li>El resto, durante el año, siempre que no coincida con alguien con quien haya conflicto (tabla de abajo).</li>
        <li>En verano se abre solo por la tarde, desde las <strong>{VERANO_APERTURA}</strong>: todos los días de julio y agosto tiene que haber alguien con llave para abrir.</li>
        <li>En verano se unifican los grupos: <strong>una sola clase a la vez</strong>, seguidas desde las {VERANO_APERTURA} hasta el cierre ({CLASES_VERANO} clases a la semana). Las da cualquiera de los que estén esa tarde.</li>
        <li>Los <strong>fijos discontinuos</strong> no trabajan en julio y agosto (cobran el paro). Les corresponden unos {diasDevengados(DIAS_ANUALES, true)} días ({MESES_DISCONTINUO} meses de {DIAS_ANUALES}), que cogen fuera del verano.</li>
      </ul>
    </div>
  )
}

// ─── Matriz de conflictos ────────────────────────────────────────────────────
function ConflictMatrix({ keys, discontinuos }) {
  const [season, setSeason] = useState('invierno')
  const inactive = season === 'verano' ? discontinuos : []

  const pairs = useMemo(() => {
    const res = {}
    PROF_ORDER.forEach((a, i) => PROF_ORDER.slice(i + 1).forEach(b => {
      if (inactive.includes(a) || inactive.includes(b)) return
      const r = pairConflict(a, b, { keys, season, inactive })
      res[`${a}|${b}`] = r
      res[`${b}|${a}`] = r
    }))
    return res
  }, [keys, season, inactive.join()])

  const ranked = [...new Set(Object.values(pairs))]
    .filter(r => r.level !== 'verde')
    .sort((x, y) => (x.level === y.level ? y.lost - x.lost : x.level === 'rojo' ? -1 : 1))

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Quién no debería irse a la vez</h3>
      <p className="sv-note">
        Se simula una semana con las dos personas fuera. Solo sustituye quien ya trabaja ese día, está libre a esa hora
        y alarga su turno como mucho una clase (90 min). El número es el de clases semanales sin nadie que las dé (en verano, de las {CLASES_VERANO} clases unificadas).
        <strong> No coincidir</strong>: la pareja deja días sin abrir o sin cerrar, o pierde 12 clases o más.
      </p>
      <div className="sv-period" style={{ marginBottom: 12 }}>
        {[['invierno', 'Horario normal'], ['verano', 'Verano (desde 16:30)']].map(([id, label]) => (
          <button key={id} className={`sv-period__btn${season === id ? ' sv-period__btn--active' : ''}`} onClick={() => setSeason(id)}>{label}</button>
        ))}
      </div>
      <div className="sv-tests-scroll">
        <table className="sv-to-matrix">
          <thead>
            <tr><th></th>{PROF_ORDER.map(p => <th key={p} style={{ color: PROF_META[p].color }}>{p}</th>)}</tr>
          </thead>
          <tbody>
            {PROF_ORDER.map(a => (
              <tr key={a}>
                <th style={{ color: PROF_META[a].color }}>{a}</th>
                {PROF_ORDER.map(b => {
                  const r = pairs[`${a}|${b}`]
                  if (a === b) return <td key={b} className="sv-to-cell sv-to-cell--self" />
                  if (!r) return <td key={b} className="sv-to-cell sv-to-cell--off" title="Fijo discontinuo: no está en verano">—</td>
                  return (
                    <td key={b} className={`sv-to-cell sv-to-cell--${r.level}`}
                      title={`${LEVEL_LABEL[r.level]} · ${r.lost} clases sin cubrir`}>
                      {r.lost}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sv-legend">
        <span className="sv-legend__label">Nivel</span>
        <span className="sv-legend__item sv-to-cell--rojo">No coincidir</span>
        <span className="sv-legend__item sv-to-cell--ambar">Evitar</span>
        <span className="sv-legend__item sv-to-cell--verde">Posible</span>
      </div>
      {ranked.length > 0 && (
        <ul className="sv-to-pairs">
          {ranked.map(r => (
            <li key={`${r.a}|${r.b}`}>
              <span className={`sv-to-dot sv-to-cell--${r.level}`} />
              <strong>{r.a} + {r.b}</strong>: {r.lost} clases sin cubrir
              {r.sinAbrir.length > 0 && <> · sin apertura {r.sinAbrir.map(d => DAY_LABEL[d]).join(', ')}</>}
              {r.sinCerrar.length > 0 && <> · sin cierre {r.sinCerrar.map(d => DAY_LABEL[d]).join(', ')}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Calculadora ─────────────────────────────────────────────────────────────
function Calculadora({ state, setState }) {
  const y = temporada()
  const WINDOWS = {
    navidad:   { label: `Navidad ${y}/${String(y + 1).slice(2)}`, from: `${y}-12-14`, to: `${y + 1}-01-10` },
    verano:    { label: `Verano ${y + 1}`, from: `${y + 1}-07-01`, to: `${y + 1}-08-31` },
    temporada: { label: `Temporada ${y}/${String(y + 1).slice(2)}`, from: `${y}-09-01`, to: `${y + 1}-08-31` },
  }
  const [win, setWin] = useState('verano')
  const [selDate, setSelDate] = useState(null)
  const { discontinuos, keys, dias, periods } = state

  const pairLevels = useMemo(() => {
    const res = {}
    PROF_ORDER.forEach((a, i) => PROF_ORDER.slice(i + 1).forEach(b => {
      res[`${a}|${b}`] = pairConflict(a, b, { keys }).level
    }))
    return res
  }, [keys])

  const dates = useMemo(() => laborablesBetween(WINDOWS[win].from, WINDOWS[win].to), [win, y])
  const sim   = useMemo(() => simulatePlan(dates, { periods, discontinuos, keys }), [dates, periods, discontinuos, keys])
  const allSim = useMemo(
    () => simulatePlan(laborablesBetween(WINDOWS.temporada.from, WINDOWS.temporada.to), { periods, discontinuos, keys }),
    [periods, discontinuos, keys, y],
  )
  const off = useMemo(() => expandPeriods(periods), [periods])

  const conflictsOf = day => {
    const res = []
    day.out.forEach((a, i) => day.out.slice(i + 1).forEach(b => {
      const k = pairLevels[`${a}|${b}`] || pairLevels[`${b}|${a}`]
      if (k === 'rojo' || (k === 'ambar' && !isSummer(day.date))) res.push({ a, b, level: k })
    }))
    return res
  }

  // Resumen por persona
  const rows = PROF_ORDER.map(p => {
    const disc  = discontinuos.includes(p)
    const all   = [...(off[p] || [])]
    const sum   = all.filter(isSummer)
    const usados = disc ? all.length - sum.length : all.length
    const dev   = diasDevengados(dias[p], disc)
    return {
      p, disc, dev, usados, verano: sum.length, min: minimoVerano(dias[p], disc),
      restan: dev - usados, tardes: tardesVerano(p), clasesInv: clasesSem(p),
    }
  })

  // Avisos sobre toda la temporada
  const warnings = []
  rows.forEach(r => {
    if (!r.disc && r.verano < r.min) warnings.push({ lvl: 'warn', text: `${r.p}: ${r.verano} de ${r.min} días obligatorios en julio y agosto.` })
    if (r.restan < 0) warnings.push({ lvl: 'bad', text: `${r.p}: planifica ${r.usados} días y le corresponden ${r.dev}.` })
    if (r.disc && r.verano > 0) warnings.push({ lvl: 'warn', text: `${r.p} es fijo discontinuo: sus ${r.verano} días en julio y agosto no cuentan (no trabaja).` })
  })
  const sinAbrirVer = allSim.filter(d => isSummer(d.date) && d.sinAbrir)
  if (sinAbrirVer.length) warnings.push({ lvl: 'bad', text: `Verano: ${sinAbrirVer.length} días sin nadie con llave para abrir a las ${VERANO_APERTURA} (${sinAbrirVer.slice(0, 6).map(d => fmtShort(d.date)).join(', ')}${sinAbrirVer.length > 6 ? '…' : ''}).` })
  const sinCerrar = allSim.filter(d => d.sinCerrar && d.out.length)
  if (sinCerrar.length) warnings.push({ lvl: 'warn', text: `${sinCerrar.length} días sin nadie con llave para cerrar (${sinCerrar.slice(0, 6).map(d => `${DAY_SHORT[weekdayOf(d.date)]} ${fmtShort(d.date)}`).join(', ')}${sinCerrar.length > 6 ? '…' : ''}). Hay que alargar el turno de alguien.` })
  const choques = allSim.flatMap(d => conflictsOf(d).filter(c => c.level === 'rojo').map(c => ({ ...c, date: d.date })))
  const choqueTxt = [...new Set(choques.map(c => `${c.a} + ${c.b}`))]
  if (choqueTxt.length) warnings.push({ lvl: 'bad', text: `Coinciden parejas que no deberían: ${choqueTxt.join(', ')} (${choques.length} días).` })

  const kpi = {
    sinAbrir:  allSim.filter(d => d.sinAbrir && d.out.length).length,
    perdidas:  allSim.reduce((n, d) => n + d.lost.length, 0),
    perdVer:   allSim.filter(d => isSummer(d.date)).reduce((n, d) => n + d.lost.length, 0),
    ahorro:    discontinuos.filter(p => !HOY_DISCONTINUOS.includes(p)).reduce((s, p) => s + PROF_META[p].costoMes * 2, 0)
             - HOY_DISCONTINUOS.filter(p => !discontinuos.includes(p)).reduce((s, p) => s + PROF_META[p].costoMes * 2, 0),
  }

  function update(patch) { setState(s => ({ ...s, ...patch })) }
  const toggle = (list, p) => (list.includes(p) ? list.filter(x => x !== p) : [...list, p])
  function setPeriod(id, patch) { update({ periods: periods.map(x => (x.id === id ? { ...x, ...patch } : x)) }) }

  const selDay = sim.find(d => d.date === selDate)

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Calculadora de supuestos</h3>
      <div className="sv-controls">
        <div className="sv-filter-group">
          <button className="sv-filter-btn" onClick={() => update({ ...presetPlan('hoy') })}>Hoy (Sigurd discontinuo)</button>
          <button className="sv-filter-btn" onClick={() => update({ ...presetPlan('discontinuas') })}>Sara y Lucía fijas discontinuas</button>
          <button className="sv-filter-btn" onClick={() => setState(defaultState())}>Reiniciar</button>
        </div>
      </div>

      <div className="sv-kpis">
        <div className="sv-kpi" style={{ '--kpi-color': kpi.ahorro > 0 ? '#34d399' : kpi.ahorro < 0 ? '#f97316' : '#888' }}>
          <span className="sv-kpi__value">{kpi.ahorro.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</span>
          <span className="sv-kpi__label">Ahorro al año frente a hoy (julio y agosto)</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': sinAbrirVer.length ? '#f87171' : '#34d399' }}>
          <span className="sv-kpi__value">{sinAbrirVer.length}</span>
          <span className="sv-kpi__label">Días de verano sin nadie para abrir</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': kpi.sinAbrir ? '#f97316' : '#34d399' }}>
          <span className="sv-kpi__value">{kpi.sinAbrir}</span>
          <span className="sv-kpi__label">Días de la temporada sin apertura</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': '#f5c842' }}>
          <span className="sv-kpi__value">{kpi.perdidas - kpi.perdVer}</span>
          <span className="sv-kpi__label">Clases sin cubrir por vacaciones (resto del año)</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': kpi.perdVer ? '#f87171' : '#34d399' }}>
          <span className="sv-kpi__value">{kpi.perdVer}</span>
          <span className="sv-kpi__label">Clases de verano sin profe</span>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="sv-to-warnings">
          {warnings.map((w, i) => <li key={i} className={`sv-to-warn sv-to-warn--${w.lvl}`}>{w.text}</li>)}
        </ul>
      )}

      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Persona</th><th>Fijo discontinuo</th><th>Llave</th><th>Días/año</th><th>Le tocan</th>
              <th>Jul–ago (mín.)</th><th>Planificados</th><th>Le quedan</th><th>Tardes en verano</th><th>€/mes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.p}>
                <td style={{ color: PROF_META[r.p].color, fontWeight: 700 }}>{r.p}</td>
                <td><input type="checkbox" checked={r.disc} onChange={() => update({ discontinuos: toggle(discontinuos, r.p) })} /></td>
                <td><input type="checkbox" checked={keys.includes(r.p)} onChange={() => update({ keys: toggle(keys, r.p) })} /></td>
                <td>
                  <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" max="40" value={dias[r.p]}
                    onChange={e => update({ dias: { ...dias, [r.p]: Math.max(0, Number(e.target.value) || 0) } })} />
                </td>
                <td>{r.dev}</td>
                <td className={!r.disc && r.verano < r.min ? 'sv-to-bad' : ''}>{r.disc ? 'No trabaja' : `${r.verano} (${r.min})`}</td>
                <td>{r.usados}</td>
                <td className={r.restan < 0 ? 'sv-to-bad' : ''}>{r.restan}</td>
                <td className={!r.disc && r.tardes === 0 ? 'sv-to-warn-txt' : ''}>
                  {r.disc ? '—' : `${r.tardes} de 5`}
                </td>
                <td>{PROF_META[r.p].costoMes.toLocaleString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some(r => !r.disc && r.tardes === 0 && r.clasesInv > 0) && (
        <p className="sv-note">
          {rows.filter(r => !r.disc && r.tardes === 0 && r.clasesInv > 0).map(r => r.p).join(', ')}: ninguna tarde en verano
          con el horario actual (todo su trabajo es de mañana). Cobra julio y agosto sin tener tareas asignadas.
        </p>
      )}

      <h4 className="sv-to-subtitle">Periodos de vacaciones</h4>
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead><tr><th>Persona</th><th>Desde</th><th>Días laborables</th><th>Hasta</th><th></th></tr></thead>
          <tbody>
            {[...periods].sort((a, b) => a.start.localeCompare(b.start)).map(x => {
              const ds = x.start && x.n > 0 ? laborablesFrom(x.start, x.n) : []
              return (
                <tr key={x.id}>
                  <td>
                    <select className="sv-tests-select" value={x.prof} onChange={e => setPeriod(x.id, { prof: e.target.value })}
                      style={{ color: PROF_META[x.prof]?.color }}>
                      {PROF_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td><input className="sv-tests-input" type="date" value={x.start} onChange={e => setPeriod(x.id, { start: e.target.value })} /></td>
                  <td>
                    <input className="sv-tests-input sv-tests-input--unit" type="number" min="1" max="40" value={x.n}
                      onChange={e => setPeriod(x.id, { n: Math.max(1, Number(e.target.value) || 1) })} />
                  </td>
                  <td className="sv-ot-muted">{ds.length ? fmtShort(ds[ds.length - 1]) : ''}</td>
                  <td><button className="sv-tests-remove" onClick={() => update({ periods: periods.filter(p => p.id !== x.id) })}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button className="sv-tests-add" onClick={() => update({ periods: [...periods, period(PROF_ORDER[0], WINDOWS[win].from, 5)] })}>
        + Añadir periodo
      </button>

      <h4 className="sv-to-subtitle">Calendario</h4>
      <div className="sv-period" style={{ marginBottom: 10 }}>
        {Object.entries(WINDOWS).map(([id, w]) => (
          <button key={id} className={`sv-period__btn${win === id ? ' sv-period__btn--active' : ''}`}
            onClick={() => { setWin(id); setSelDate(null) }}>{w.label}</button>
        ))}
      </div>
      <div className="sv-to-timeline-wrap">
        <table className={`sv-to-timeline${dates.length > 80 ? ' sv-to-timeline--dense' : ''}`}>
          <thead>
            <tr>
              <th className="sv-to-tl-head" />
              {sim.map(d => (
                <th key={d.date} className={`sv-to-tl-date${d.date === selDate ? ' sv-to-tl--sel' : ''}${d.date.endsWith('-01') || d === sim[0] ? ' sv-to-tl-date--month' : ''}`}
                  onClick={() => setSelDate(d.date === selDate ? null : d.date)} title={`${DAY_LABEL[weekdayOf(d.date)]} ${fmtShort(d.date)}`}>
                  <span>{DAY_SHORT[weekdayOf(d.date)]}</span>
                  <span>{Number(d.date.slice(8))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROF_ORDER.map(p => (
              <tr key={p}>
                <th className="sv-to-tl-head" style={{ color: PROF_META[p].color }}>{p}</th>
                {sim.map(d => {
                  const inactive = isSummer(d.date) && discontinuos.includes(p)
                  const isOff = d.out.includes(p)
                  return (
                    <td key={d.date} onClick={() => setSelDate(d.date)}
                      className={`sv-to-tl-cell${inactive ? ' sv-to-tl-cell--inactive' : ''}${d.date === selDate ? ' sv-to-tl--sel' : ''}`}
                      style={isOff ? { background: PROF_META[p].color } : undefined} />
                  )
                })}
              </tr>
            ))}
            <tr className="sv-to-tl-sep">
              <th className="sv-to-tl-head">Abre</th>
              {sim.map(d => <td key={d.date} className={`sv-to-tl-cell ${d.sinAbrir ? 'sv-to-tl-cell--bad' : 'sv-to-tl-cell--ok'}`} title={d.opener || 'Nadie'} />)}
            </tr>
            <tr>
              <th className="sv-to-tl-head">Cierra</th>
              {sim.map(d => <td key={d.date} className={`sv-to-tl-cell ${d.sinCerrar ? 'sv-to-tl-cell--bad' : 'sv-to-tl-cell--ok'}`} title={d.closer || 'Nadie'} />)}
            </tr>
            <tr>
              <th className="sv-to-tl-head">Sin cubrir</th>
              {sim.map(d => (
                <td key={d.date} className={`sv-to-tl-cell sv-to-tl-num${d.lost.length ? ' sv-to-tl-num--bad' : ''}`}>
                  {d.lost.length || ''}
                </td>
              ))}
            </tr>
            <tr>
              <th className="sv-to-tl-head">Choque</th>
              {sim.map(d => {
                const c = conflictsOf(d)
                const lvl = c.some(x => x.level === 'rojo') ? 'rojo' : c.length ? 'ambar' : ''
                return <td key={d.date} className={`sv-to-tl-cell${lvl ? ` sv-to-cell--${lvl}` : ''}`} title={c.map(x => `${x.a} + ${x.b}`).join(', ')} />
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="sv-note">
        Pulsa un día para ver el detalle. Gris rayado: fijo discontinuo fuera de temporada. Solo se cuentan días laborables;
        los festivos que se descuentan son los nacionales de Navidad y el 15 de agosto.
      </p>

      {selDay && (
        <div className="sv-class-detail">
          <div className="sv-class-detail__title">
            {DAY_LABEL[weekdayOf(selDay.date)]} {fmtShort(selDay.date)} · {isSummer(selDay.date) ? 'horario de verano' : 'horario normal'}
          </div>
          <ul className="sv-to-detail">
            <li>Fuera: {selDay.out.length ? selDay.out.join(', ') : 'nadie'}</li>
            <li>Abre: {selDay.opener || <span className="sv-to-bad">nadie con llave</span>} · Cierra: {selDay.closer || <span className="sv-to-bad">nadie con llave</span>}</li>
            {selDay.covered.map((c, i) => (
              <li key={`c${i}`}>{c.from ? `Clase de ${c.from} (${c.start})` : `Clase ${c.start}`} → la da {c.to}</li>
            ))}
            {selDay.lost.map((c, i) => (
              <li key={`l${i}`} className="sv-to-bad">{c.prof ? `Clase de ${c.prof} (${c.start})` : `Clase ${c.start}`} sin nadie que la dé</li>
            ))}
            {selDay.suspended.map((c, i) => <li key={`s${i}`} className="sv-ot-muted">Clase de {c.prof} ({c.start}) suspendida (discontinuo)</li>)}
            {conflictsOf(selDay).map((c, i) => <li key={`x${i}`} className={c.level === 'rojo' ? 'sv-to-bad' : 'sv-to-warn-txt'}>{c.a} + {c.b}: {LEVEL_LABEL[c.level].toLowerCase()}</li>)}
          </ul>
        </div>
      )}

      <p className="sv-note">
        Pasar a fijo discontinuo requiere que la persona firme el cambio de contrato. El paro en julio y agosto depende de lo
        que haya cotizado (con jornada parcial la prestación es proporcional): confirmarlo con la gestoría antes de proponerlo.
        El ahorro solo cuenta el coste empresa de julio y agosto; si sus clases de verano las cubren otros, es dinero que se ahorra de verdad.
      </p>
    </div>
  )
}

export default function TimeOffTab() {
  const [state, setState] = useState(loadState)

  useEffect(() => {
    try {
      const { periods, ...rest } = state
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, periods: periods.map(({ id, ...p }) => p) }))
    } catch { /* sin almacenamiento: la calculadora funciona igual */ }
  }, [state])

  return (
    <div className="sv-tab-panel">
      <Normas />
      <ConflictMatrix keys={state.keys} discontinuos={state.discontinuos} />
      <Calculadora state={state} setState={setState} />
    </div>
  )
}
