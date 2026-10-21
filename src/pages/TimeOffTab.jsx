import { useState, useMemo, useEffect } from 'react'
import { PROF_META, PROF_ORDER, DAYS, DAY_LABEL } from '../data/staffSchedule'
import {
  KEY_HOLDERS_DEFAULT, VERANO_APERTURA, COMODIN_VERANO, veranoSlots, pairConflict, simulatePlan,
  laborablesBetween, laborablesFrom, expandPeriods, isSummer, weekdayOf, fmtShort, monthOf,
  diasDevengados, minimoVerano, PARO_VERANO, PARO_MESES, combinacionesParo, CIERRE_VERANO, isClosed, disponible,
  campDates, vacationDates,
} from '../utils/coverage'
import { useExpenses } from '../hooks/useSuperAdmin'
import { autoCategory } from '../utils/expensesParser'
import { PL_DATA } from '../data/plHistorico'

const STORAGE_KEY = 'blokes.timeoff.v4'
const DIAS_ANUALES = 23
// Situación actual: Sigurd fijo discontinuo; Ana no trabaja en agosto
const HOY_PARO = { Sigurd: 'verano', Ana: 'agosto' }
const PARO_CORTO = { no: '—', verano: 'Jul + ago', agosto: 'Ago', julio: 'Jul' }
const LABORABLES_MES = 21.75

const LEVEL_LABEL = { rojo: 'No coincidir', ambar: 'Evitar', verde: 'Posible' }
const DAY_SHORT   = { Lunes: 'L', Martes: 'M', Miercoles: 'X', Jueves: 'J', Viernes: 'V' }
const MES_LABEL   = { 7: 'Julio', 8: 'Agosto' }

const CLASES_VERANO = DAYS.reduce((n, d) => n + veranoSlots(d).length, 0)

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

const eur = n => `${Math.round(n).toLocaleString('es-ES')} €`

// Quién no está en un mes de verano (en paro ese mes)
function inactivosMes(mes, ctx) {
  const iso = `${temporada() + 1}-0${mes}-15`
  return PROF_ORDER.filter(p => !disponible(p, iso, ctx))
}

let nextId = 1
const period = (prof, start, n) => ({ id: nextId++, prof, start, n })

const CAMP_OFF = { activo: false, start: '', semanas: 4, plazas: 0, precio: 0, staff: [COMODIN_VERANO] }

function presetPlan(kind) {
  const y = temporada()
  const v = `${y + 1}`
  const navidad = [
    period('Sigurd', `${y}-12-21`, 4),
    period('Lucía',  `${y}-12-21`, 4),
    period('Ana',    `${y}-12-21`, 4),
    period('Alvaro', `${y}-12-28`, 4),
    period('Eva',    `${y + 1}-01-04`, 4),
    period('Sara',   `${y + 1}-01-04`, 4),
  ]
  const base = { paro: { ...HOY_PARO }, cierre: 'abierto', camp: { ...CAMP_OFF, start: `${v}-07-01` } }

  switch (kind) {
    case 'discontinuas':
      return {
        ...base,
        paro: { ...HOY_PARO, Sara: 'verano', 'Lucía': 'verano' },
        periods: [...navidad, period('Alvaro', `${v}-07-01`, 12), period('Eva', `${v}-07-19`, 12)],
      }
    case 'cierreAgosto':
      // Agosto cerrado = vacaciones de todos; casi no queda nada para Navidad
      return {
        ...base,
        cierre: 'agosto',
        periods: [period('Sigurd', `${y}-12-21`, 4), period('Ana', `${y}-12-21`, 4)],
      }
    case 'cierreVerano':
      return {
        ...base,
        cierre: 'verano',
        camp: { ...CAMP_OFF, activo: true, start: `${v}-07-01`, staff: [COMODIN_VERANO, 'Ana'] },
        periods: [period('Sigurd', `${y}-12-21`, 4)],
      }
    case 'todosDiscontinuos':
      // Sala cerrada julio y agosto y toda la plantilla en paro esos meses
      return { ...base, cierre: 'verano', paro: Object.fromEntries(PROF_ORDER.map(p => [p, 'verano'])), periods: navidad }
    case 'agostoParo':
      // Agosto cerrado y todos en paro ese mes (Sigurd sigue en julio y agosto)
      return {
        ...base,
        cierre: 'agosto',
        paro: { ...Object.fromEntries(PROF_ORDER.map(p => [p, 'agosto'])), Sigurd: 'verano' },
        periods: navidad,
      }
    default:
      return {
        ...base,
        periods: [
          ...navidad,
          period('Alvaro', `${v}-07-01`, 12),
          period('Sara',   `${v}-07-01`, 12),
          period('Eva',    `${v}-07-19`, 12),
          period('Lucía',  `${v}-08-04`, 12),
        ],
      }
  }
}

const PRESETS = [
  ['hoy',          'Hoy (Sigurd jul–ago, Ana ago)'],
  ['discontinuas', 'Sara y Lucía fijas discontinuas'],
  ['cierreAgosto', 'Cerrar agosto'],
  ['agostoParo',   'Cerrar agosto, todos en paro en agosto'],
  ['cierreVerano', 'Cerrar julio y agosto + campamento'],
  ['todosDiscontinuos', 'Cerrar julio y agosto, todos discontinuos'],
]

function defaultState() {
  return {
    ...presetPlan('hoy'),
    keys: [...KEY_HOLDERS_DEFAULT],
    dias: Object.fromEntries(PROF_ORDER.map(p => [p, DIAS_ANUALES])),
    // €/mes por mes de verano (7 = julio, 8 = agosto)
    gastosSala:   { 7: 0, 8: 0 },
    ingresosSala: { 7: 0, 8: 0 },
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
        <li>En verano se unifican los grupos: clases de 1,5 h <strong>una detrás de otra</strong>, desde las {VERANO_APERTURA} hasta el cierre ({CLASES_VERANO} clases a la semana).</li>
        <li>En verano {COMODIN_VERANO} está en recepción y es el <strong>comodín</strong>: solo da clase si falta un profe. Hacen falta <strong>2 profes + {COMODIN_VERANO}</strong> cada mes para que puedan turnarse las vacaciones.</li>
        <li>Los <strong>fijos discontinuos</strong> no trabajan julio, agosto o los dos (cobran el paro). Las vacaciones se devengan por meses trabajados: {diasDevengados(DIAS_ANUALES, 1)} días si paran un mes y {diasDevengados(DIAS_ANUALES, 2)} si paran los dos, que cogen cuando trabajan.</li>
        <li>Si la sala <strong>cierra</strong> en verano, los días de cierre son vacaciones de todos los que trabajan ese mes (salvo quien lleve el campamento).</li>
      </ul>
    </div>
  )
}

// ─── Histórico de julio y agosto (mismos datos que Superadmin) ───────────────

// Gastos que dejan de pagarse con la sala cerrada; alquiler, nóminas, SS e
// impuestos se pagan igual.
const CATS_AHORRABLES = ['electricidad', 'gas', 'bar', 'comisiones_banco', 'devoluciones_tpv']
const MESES_HISTORICO = 60

function fmtMes(m) {
  const [y, mo] = m.split('-')
  return new Date(+y, +mo - 1).toLocaleString('es-ES', { month: 'short', year: 'numeric' })
}

// Una fila por mes: 2024–2025 del Excel (PL_DATA), desde 2026 del banco
function useHistoricoMeses() {
  const exp = useExpenses(MESES_HISTORICO, 'all', true)

  const months = useMemo(() => {
    const acc = {}
    Object.keys(PL_DATA.ventas).forEach(yr => {
      PL_DATA.ventas[yr].forEach((v, i) => {
        if (v == null) return
        const m = `${yr}-${String(i + 1).padStart(2, '0')}`
        acc[m] = {
          month: m, fuente: 'Excel', ventas: v, costes: -(PL_DATA.costes[yr][i] || 0),
          resultado: PL_DATA.resultado[yr][i], ahorrable: null,
        }
      })
    })
    ;(exp.data || []).forEach(r => {
      if (acc[r.month]?.fuente === 'Excel') return
      const x = (acc[r.month] ||= { month: r.month, fuente: 'Banco', ventas: 0, costes: 0, resultado: null, ahorrable: 0 })
      x.ventas += Math.abs(r.total_ingresos || 0)
      x.costes += Math.abs(r.total_costes || 0)
      Object.entries(r.by_concepto || {}).forEach(([k, v]) => {
        if (CATS_AHORRABLES.includes(autoCategory(k, false))) x.ahorrable += v
      })
    })
    return Object.values(acc)
      .map(x => (x.fuente === 'Banco' ? { ...x, resultado: x.ventas - x.costes } : x))
      .sort((p, q) => p.month.localeCompare(q.month))
  }, [exp.data])

  return { months, loading: exp.loading, error: exp.error }
}

function HistoricoVerano({ onApply }) {
  const { months, loading, error } = useHistoricoMeses()

  const mesNum = m => Number(m.month.slice(5))
  const isVer  = m => mesNum(m) === 7 || mesNum(m) === 8
  const media  = (arr, k) => {
    const v = arr.map(x => x[k]).filter(x => x != null)
    return v.length ? v.reduce((n, x) => n + x, 0) / v.length : null
  }
  const delMes = mes => months.filter(m => mesNum(m) === mes)
  const resto  = months.filter(m => !isVer(m))
  const restoAnio = yr => resto.filter(m => m.month.startsWith(yr))

  const sugerido = {
    ingresos:  { 7: Math.round(media(delMes(7), 'ventas') || 0),    8: Math.round(media(delMes(8), 'ventas') || 0) },
    ahorrable: { 7: Math.round(media(delMes(7), 'ahorrable') || 0), 8: Math.round(media(delMes(8), 'ahorrable') || 0) },
  }

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Histórico de julio y agosto</h3>
      <p className="sv-note">
        Los mismos datos que Superadmin › P&amp;L: 2024 y 2025 del Excel de cuentas (ventas sin IVA y costes fijos), y desde
        2026 los extractos del banco subidos en Superadmin › Gastos. «Ahorrable» es lo que dejaría de pagarse con la sala
        cerrada (luz, gas, bar, comisiones y devoluciones TPV); solo sale con el banco, el Excel no lo desglosa.
      </p>
      {loading && <p className="sv-loading">Cargando el banco…</p>}
      {error && <p className="sv-error">No se pudo cargar el banco ({error}); se muestran solo los datos del Excel.</p>}
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Mes</th><th>Fuente</th><th>Ventas</th><th>Costes</th><th>Resultado</th>
              <th>Ahorrable</th><th>Ventas medias resto del año</th>
            </tr>
          </thead>
          <tbody>
            {months.filter(isVer).map(m => {
              const ra = restoAnio(m.month.slice(0, 4))
              const vr = media(ra, 'ventas')
              return (
                <tr key={m.month}>
                  <td style={{ textTransform: 'capitalize' }}>{fmtMes(m.month)}</td>
                  <td className="sv-ot-muted">{m.fuente}</td>
                  <td>{eur(m.ventas)}{vr ? <span className="sv-ot-muted"> ({Math.round(m.ventas / vr * 100)} %)</span> : null}</td>
                  <td>{eur(m.costes)}</td>
                  <td className={m.resultado != null && m.resultado < 0 ? 'sv-to-bad' : ''}>
                    {m.resultado != null ? eur(m.resultado) : <span className="sv-ot-muted" title="El Excel no tiene el resultado de este mes">—</span>}
                  </td>
                  <td>{m.ahorrable != null ? eur(m.ahorrable) : '—'}</td>
                  <td className="sv-ot-muted">{vr ? `${eur(vr)} (${ra.length} meses)` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="sv-kpis">
        {[7, 8].map(mes => {
          const arr = delMes(mes)
          const res = media(arr, 'resultado')
          return (
            <div key={mes} className="sv-kpi" style={{ '--kpi-color': res != null && res < 0 ? '#f87171' : '#60a5fa' }}>
              <span className="sv-kpi__value">{eur(media(arr, 'ventas') || 0)}</span>
              <span className="sv-kpi__label">
                Ventas medias de {MES_LABEL[mes].toLowerCase()} ({arr.length} años) · costes {eur(media(arr, 'costes') || 0)}
                {res != null && <> · resultado {eur(res)}</>}
              </span>
            </div>
          )
        })}
        <div className="sv-kpi" style={{ '--kpi-color': '#888' }}>
          <span className="sv-kpi__value">{eur(media(resto, 'ventas') || 0)}</span>
          <span className="sv-kpi__label">Ventas medias del resto de meses ({resto.length})</span>
        </div>
      </div>
      <button className="sv-tests-add" onClick={() => onApply(sugerido)}>
        Usar en la calculadora · julio: se pierden {eur(sugerido.ingresos[7])}, se ahorran {eur(sugerido.ahorrable[7])} ·
        agosto: se pierden {eur(sugerido.ingresos[8])}, se ahorran {eur(sugerido.ahorrable[8])}
      </button>
    </div>
  )
}

// ─── Matriz de conflictos ────────────────────────────────────────────────────
function ConflictMatrix({ keys, ctx }) {
  const [season, setSeason] = useState('invierno')
  const mes = season === 'invierno' ? null : Number(season)
  const closed = mes && isClosed(`${temporada() + 1}-0${mes}-15`, ctx.cierre)
  const inactive = mes ? inactivosMes(mes, ctx) : []

  const pairs = useMemo(() => {
    const res = {}
    if (closed) return res
    PROF_ORDER.forEach((a, i) => PROF_ORDER.slice(i + 1).forEach(b => {
      if (inactive.includes(a) || inactive.includes(b)) return
      const r = pairConflict(a, b, { keys, season: mes ? 'verano' : 'invierno', inactive })
      res[`${a}|${b}`] = r
      res[`${b}|${a}`] = r
    }))
    return res
  }, [keys, season, inactive.join(), closed])

  const ranked = [...new Set(Object.values(pairs))]
    .filter(r => r.level !== 'verde')
    .sort((x, y) => (x.level === y.level ? y.lost - x.lost : x.level === 'rojo' ? -1 : 1))

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Quién no debería irse a la vez</h3>
      <p className="sv-note">
        Se simula una semana con las dos personas fuera. Solo sustituye quien ya trabaja ese día, está libre a esa hora
        y alarga su turno como mucho una clase (90 min). El número es el de clases semanales sin nadie que las dé.
        En verano cuenta sobre las {CLASES_VERANO} clases seguidas: un profe puede dar toda la tarde
        y {COMODIN_VERANO} solo entra si ese día no hay ningún profe. Una pareja es <strong>Evitar</strong> si obliga
        a {COMODIN_VERANO} a dejar recepción más que si faltara uno solo.
        <strong> No coincidir</strong>: la pareja deja días sin abrir o sin cerrar, o pierde 12 clases o más (en verano, cualquiera).
      </p>
      <div className="sv-period" style={{ marginBottom: 12 }}>
        {[['invierno', 'Horario normal'], ['7', 'Julio'], ['8', 'Agosto']].map(([id, label]) => (
          <button key={id} className={`sv-period__btn${season === id ? ' sv-period__btn--active' : ''}`} onClick={() => setSeason(id)}>{label}</button>
        ))}
      </div>
      {closed ? (
        <p className="sv-empty">Sala cerrada en {MES_LABEL[mes].toLowerCase()}: no hace falta cobertura.</p>
      ) : (
        <>
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
                      if (!r) return <td key={b} className="sv-to-cell sv-to-cell--off" title="No trabaja ese mes">—</td>
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
                  {mes && r.comodin > 0 && <> · {COMODIN_VERANO} da {r.comodin}</>}
                  {r.sinAbrir.length > 0 && <> · sin apertura {r.sinAbrir.map(d => DAY_LABEL[d]).join(', ')}</>}
                  {r.sinCerrar.length > 0 && <> · sin cierre {r.sinCerrar.map(d => DAY_LABEL[d]).join(', ')}</>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ─── Explorador de combinaciones de paro ─────────────────────────────────────
function ExploradorParo({ paro, cierre, keys, onApply }) {
  const [verTodas, setVerTodas] = useState(false)
  const combos = useMemo(() => combinacionesParo({
    cierre, keys, hoy: HOY_PARO, coste: Object.fromEntries(PROF_ORDER.map(p => [p, PROF_META[p].costoMes])),
  }), [cierre, keys])
  const actual = combos.findIndex(c => PROF_ORDER.every(p => c.paro[p] === (paro[p] || 'no')))
  const lista = combos.slice(0, verTodas ? 60 : 10)

  return (
    <>
      <h4 className="sv-to-subtitle">Todas las combinaciones de paro</h4>
      <p className="sv-note">
        Se prueban las {(4 ** PROF_ORDER.length).toLocaleString('es-ES')} combinaciones (4 opciones por persona) y se quedan
        las {combos.length.toLocaleString('es-ES')} que dejan cada mes abierto con al menos 2 profes + {COMODIN_VERANO} y
        alguien con llave, ordenadas por ahorro frente a hoy. {actual >= 0
          ? `La combinación actual es la n.º ${actual + 1}.`
          : 'La combinación actual no cumple el mínimo de 2 profes + Eva.'} Al aplicar una, revisa los avisos: el reparto
        de vacaciones (periodos) no se cambia solo.
      </p>
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>#</th>
              {PROF_ORDER.map(p => <th key={p} style={{ color: PROF_META[p].color }}>{p}</th>)}
              <th>Ahorro/año</th><th>Cambios</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c, i) => (
              <tr key={i} className={i === actual ? 'sv-to-row--sel' : ''}>
                <td className="sv-ot-muted">{i + 1}</td>
                {PROF_ORDER.map(p => (
                  <td key={p} className={c.paro[p] !== (HOY_PARO[p] || 'no') ? 'sv-to-warn-txt' : 'sv-ot-muted'}>{PARO_CORTO[c.paro[p]]}</td>
                ))}
                <td className={c.ahorro > 0 ? 'sv-to-good' : c.ahorro < 0 ? 'sv-to-bad' : ''}>{eur(c.ahorro)}</td>
                <td>{c.cambios}</td>
                <td>{i === actual ? <span className="sv-ot-muted">actual</span> : (
                  <button className="sv-filter-btn" onClick={() => onApply({ ...c.paro })}>Aplicar</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {combos.length > 10 && (
        <button className="sv-filter-btn" onClick={() => setVerTodas(v => !v)}>
          {verTodas ? 'Ver solo las 10 mejores' : `Ver más (${Math.min(60, combos.length)})`}
        </button>
      )}
    </>
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
  const { paro, keys, dias, periods, cierre, camp, gastosSala, ingresosSala } = state
  const ctx  = { periods, paro, cierre, camp, keys }
  const deps = [periods, paro, cierre, camp, keys]

  // Nivel de cada pareja: horario normal, julio y agosto
  const pairLevels = useMemo(() => {
    const res = { invierno: {}, 7: {}, 8: {} }
    PROF_ORDER.forEach((a, i) => PROF_ORDER.slice(i + 1).forEach(b => {
      res.invierno[`${a}|${b}`] = pairConflict(a, b, { keys }).level
      ;[7, 8].forEach(m => {
        const inactive = inactivosMes(m, ctx)
        if (inactive.includes(a) || inactive.includes(b)) return
        res[m][`${a}|${b}`] = pairConflict(a, b, { keys, season: 'verano', inactive }).level
      })
    }))
    return res
  }, deps)

  const temporadaDates = useMemo(() => laborablesBetween(WINDOWS.temporada.from, WINDOWS.temporada.to), [y])
  const dates  = useMemo(() => laborablesBetween(WINDOWS[win].from, WINDOWS[win].to), [win, y])
  const sim    = useMemo(() => simulatePlan(dates, ctx), [dates, ...deps])
  const allSim = useMemo(() => simulatePlan(temporadaDates, ctx), [temporadaDates, ...deps])
  const off    = useMemo(() => expandPeriods(periods), [periods])
  const campSet = useMemo(() => campDates(camp, cierre), [camp, cierre])

  const conflictsOf = day => {
    if (day.closed) return []
    const levels = pairLevels[isSummer(day.date) ? monthOf(day.date) : 'invierno']
    const res = []
    day.out.forEach((a, i) => day.out.slice(i + 1).forEach(b => {
      const k = levels[`${a}|${b}`] || levels[`${b}|${a}`]
      if (k === 'rojo' || k === 'ambar') res.push({ a, b, level: k })
    }))
    return res
  }

  // Resumen por persona (toda la temporada)
  const rows = PROF_ORDER.map(p => {
    const op     = paro[p] || 'no'
    const nParo  = PARO_MESES[op].length
    const vac    = vacationDates(p, temporadaDates, ctx)
    const verano = vac.filter(isSummer).length
    const dev    = diasDevengados(dias[p], nParo)
    const cierreDias = vac.filter(d => isClosed(d, cierre)).length
    return {
      p, op, disc: op === 'verano', dev, usados: vac.length, verano, cierreDias,
      min: minimoVerano(dias[p], nParo), restan: dev - vac.length,
      ahorro: (nParo - PARO_MESES[HOY_PARO[p] || 'no'].length) * PROF_META[p].costoMes,
    }
  })

  // Avisos
  const warnings = []
  const listDates = (arr, fmt = d => fmtShort(d.date)) => `${arr.slice(0, 6).map(fmt).join(', ')}${arr.length > 6 ? '…' : ''}`
  ;[7, 8].forEach(m => {
    if (isClosed(`${y + 1}-0${m}-15`, cierre)) return
    const profes = PROF_ORDER.filter(p => p !== COMODIN_VERANO && !inactivosMes(m, ctx).includes(p))
    if (profes.length < 2) {
      warnings.push({ lvl: 'bad', text: `${MES_LABEL[m]}: solo ${profes.length === 1 ? 'queda 1 profe' : `quedan ${profes.length} profes`} además de ${COMODIN_VERANO} (${profes.join(', ') || 'ninguno'}). Hacen falta 2 para turnarse las vacaciones.` })
    }
  })
  rows.forEach(r => {
    if (!r.disc && r.verano < r.min) warnings.push({ lvl: 'warn', text: `${r.p}: ${r.verano} de ${r.min} días obligatorios en julio y agosto.` })
    if (r.restan < 0 && r.cierreDias > 0) {
      warnings.push({ lvl: 'bad', text: `${r.p}: el cierre le da ${r.cierreDias} días y le tocan ${r.dev}. Sobran ${-r.restan} días pagados sin trabajar (≈ ${eur(-r.restan * PROF_META[r.p].costoMes / LABORABLES_MES)}), salvo que pase a fijo discontinuo.` })
    } else if (r.restan < 0) {
      warnings.push({ lvl: 'bad', text: `${r.p}: planifica ${r.usados} días y le corresponden ${r.dev}.` })
    }
    const ignorados = [...(off[r.p] || [])].filter(d => isSummer(d) && !disponible(r.p, d, ctx))
    if (ignorados.length) warnings.push({ lvl: 'warn', text: `${r.p}: ${ignorados.length} días pedidos en verano en un mes que no trabaja; no cuentan.` })
  })
  if (camp.activo) {
    if (!campSet.size) warnings.push({ lvl: 'warn', text: 'El campamento solo puede ir en meses con la sala cerrada: cambia el modo de verano o la fecha.' })
    if (!camp.staff.length) warnings.push({ lvl: 'bad', text: 'El campamento no tiene a nadie asignado.' })
    camp.staff.forEach(p => {
      const fuera = [...campSet].filter(d => !disponible(p, d, ctx))
      if (fuera.length) warnings.push({ lvl: 'bad', text: `${p} lleva el campamento pero no trabaja ${fuera.length} de esos días.` })
      const choca = [...campSet].filter(d => off[p]?.has(d))
      if (choca.length) warnings.push({ lvl: 'warn', text: `${p} tiene vacaciones pedidas en ${choca.length} días de campamento.` })
    })
  }
  const abiertoVer = allSim.filter(d => isSummer(d.date) && !d.closed)
  const sinAbrirVer = abiertoVer.filter(d => d.sinAbrir)
  if (sinAbrirVer.length) warnings.push({ lvl: 'bad', text: `Verano: ${sinAbrirVer.length} días sin nadie con llave para abrir a las ${VERANO_APERTURA} (${listDates(sinAbrirVer)}).` })
  const sinProfeVer = abiertoVer.filter(d => d.lost.length)
  if (sinProfeVer.length) warnings.push({ lvl: 'bad', text: `Verano: ${sinProfeVer.length} días con clases sin profe (${listDates(sinProfeVer)}).` })
  const diasComodin = abiertoVer.filter(d => d.comodin > 0)
  if (diasComodin.length) warnings.push({ lvl: 'warn', text: `Verano: ${diasComodin.length} días en los que ${COMODIN_VERANO} deja recepción para dar clase (${diasComodin.reduce((n, d) => n + d.comodin, 0)} clases).` })
  const sinCerrar = allSim.filter(d => d.sinCerrar && d.out.length)
  if (sinCerrar.length) warnings.push({ lvl: 'warn', text: `${sinCerrar.length} días sin nadie con llave para cerrar (${listDates(sinCerrar, d => `${DAY_SHORT[weekdayOf(d.date)]} ${fmtShort(d.date)}`)}). Hay que alargar el turno de alguien.` })
  const choques = allSim.flatMap(d => conflictsOf(d).filter(c => c.level === 'rojo').map(c => ({ ...c, date: d.date })))
  const choqueTxt = [...new Set(choques.map(c => `${c.a} + ${c.b}`))]
  if (choqueTxt.length) warnings.push({ lvl: 'bad', text: `Coinciden parejas que no deberían: ${choqueTxt.join(', ')} (${choques.length} días).` })

  // Números del verano
  const mesesCerradosList = [7, 8].filter(m => isClosed(`${y + 1}-0${m}-15`, cierre))
  const mesesCerrados = mesesCerradosList.length
  const eco = {
    personal: rows.reduce((s, r) => s + r.ahorro, 0),
    sala:     mesesCerradosList.reduce((n, m) => n + (gastosSala[m] || 0) - (ingresosSala[m] || 0), 0),
    camp:     camp.activo ? Math.round(campSet.size / 5) * camp.plazas * camp.precio : 0,
    ociosos:  rows.filter(r => r.restan < 0 && r.cierreDias > 0)
                  .reduce((s, r) => s + -r.restan * PROF_META[r.p].costoMes / LABORABLES_MES, 0),
  }
  const balance = eco.personal + eco.sala + eco.camp

  const kpi = {
    sinAbrir: allSim.filter(d => d.sinAbrir && d.out.length).length,
    perdidas: allSim.filter(d => !isSummer(d.date)).reduce((n, d) => n + d.lost.length, 0),
    perdVer:  abiertoVer.reduce((n, d) => n + d.lost.length, 0),
  }

  function update(patch) { setState(s => ({ ...s, ...patch })) }
  const toggle = (list, p) => (list.includes(p) ? list.filter(x => x !== p) : [...list, p])
  function setPeriod(id, patch) { update({ periods: periods.map(x => (x.id === id ? { ...x, ...patch } : x)) }) }
  function setCamp(patch) { update({ camp: { ...camp, ...patch } }) }
  const num = (v, min = 0) => Math.max(min, Number(v) || 0)

  const selDay = sim.find(d => d.date === selDate)

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Calculadora de supuestos</h3>
      <div className="sv-controls">
        <div className="sv-filter-group sv-to-wrap">
          {PRESETS.map(([id, label]) => (
            <button key={id} className="sv-filter-btn" onClick={() => update({ ...presetPlan(id) })}>{label}</button>
          ))}
          <button className="sv-filter-btn" onClick={() => setState(defaultState())}>Reiniciar</button>
        </div>
      </div>

      <h4 className="sv-to-subtitle">Verano</h4>
      <div className="sv-to-form">
        <label className="sv-to-inline">
          Sala
          <select className="sv-tests-select" value={cierre} onChange={e => update({ cierre: e.target.value })}>
            {Object.entries(CIERRE_VERANO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {cierre !== 'abierto' && (
          <>
            {mesesCerradosList.map(m => (
              <span key={m} className="sv-to-inline">
                {MES_LABEL[m]}: se pierden
                <input className="sv-tests-input sv-tests-input--num" type="number" min="0" value={ingresosSala[m] || 0}
                  onChange={e => update({ ingresosSala: { ...ingresosSala, [m]: num(e.target.value) } })} />
                € de ingresos, se ahorran
                <input className="sv-tests-input sv-tests-input--num" type="number" min="0" value={gastosSala[m] || 0}
                  onChange={e => update({ gastosSala: { ...gastosSala, [m]: num(e.target.value) } })} />
                € de gastos
              </span>
            ))}
            <label className="sv-to-inline">
              <input type="checkbox" checked={camp.activo} onChange={() => setCamp({ activo: !camp.activo })} />
              Campamento
            </label>
          </>
        )}
      </div>
      {cierre !== 'abierto' && camp.activo && (
        <div className="sv-to-form">
          <label className="sv-to-inline">
            Desde
            <input className="sv-tests-input" type="date" value={camp.start} onChange={e => setCamp({ start: e.target.value })} />
          </label>
          <label className="sv-to-inline">
            Semanas
            <input className="sv-tests-input sv-tests-input--unit" type="number" min="1" max="9" value={camp.semanas}
              onChange={e => setCamp({ semanas: num(e.target.value, 1) })} />
          </label>
          <label className="sv-to-inline">
            Plazas
            <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" value={camp.plazas}
              onChange={e => setCamp({ plazas: num(e.target.value) })} />
          </label>
          <label className="sv-to-inline">
            € por niño y semana
            <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" value={camp.precio}
              onChange={e => setCamp({ precio: num(e.target.value) })} />
          </label>
          <span className="sv-to-inline">
            Lo llevan
            {PROF_ORDER.map(p => (
              <label key={p} className="sv-to-chip" style={{ color: PROF_META[p].color }}>
                <input type="checkbox" checked={camp.staff.includes(p)} onChange={() => setCamp({ staff: toggle(camp.staff, p) })} />
                {p}
              </label>
            ))}
          </span>
        </div>
      )}

      <div className="sv-kpis">
        <div className="sv-kpi" style={{ '--kpi-color': balance > 0 ? '#34d399' : balance < 0 ? '#f97316' : '#888' }}>
          <span className="sv-kpi__value">{eur(balance)}</span>
          <span className="sv-kpi__label">
            Verano frente a hoy · personal {eur(eco.personal)}
            {mesesCerrados > 0 && <> · sala {eur(eco.sala)}</>}
            {camp.activo && mesesCerrados > 0 && <> · campamento {eur(eco.camp)}</>}
          </span>
        </div>
        {eco.ociosos > 0 && (
          <div className="sv-kpi" style={{ '--kpi-color': '#f97316' }}>
            <span className="sv-kpi__value">{eur(eco.ociosos)}</span>
            <span className="sv-kpi__label">Sueldo de días de cierre que exceden las vacaciones</span>
          </div>
        )}
        <div className="sv-kpi" style={{ '--kpi-color': sinAbrirVer.length || kpi.perdVer ? '#f87171' : '#34d399' }}>
          <span className="sv-kpi__value">{sinAbrirVer.length} · {kpi.perdVer}</span>
          <span className="sv-kpi__label">Verano: días sin apertura · clases sin profe</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': diasComodin.length ? '#f5c842' : '#34d399' }}>
          <span className="sv-kpi__value">{diasComodin.length}</span>
          <span className="sv-kpi__label">Días de verano con {COMODIN_VERANO} dando clase</span>
        </div>
        <div className="sv-kpi" style={{ '--kpi-color': '#f5c842' }}>
          <span className="sv-kpi__value">{kpi.sinAbrir} · {kpi.perdidas}</span>
          <span className="sv-kpi__label">Resto del año: días sin apertura · clases sin cubrir</span>
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
              <th>Persona</th><th>Paro en verano</th><th>Llave</th><th>Días/año</th><th>Le tocan</th>
              <th>Jul–ago (mín.)</th><th>Vacaciones</th><th>Le quedan</th><th>€/mes</th><th>Ahorro/año frente a hoy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.p}>
                <td style={{ color: PROF_META[r.p].color, fontWeight: 700 }}>
                  {r.p}{r.p === COMODIN_VERANO && <span className="sv-ot-muted"> · recepción</span>}
                </td>
                <td>
                  <select className="sv-tests-select" value={r.op}
                    onChange={e => update({ paro: { ...paro, [r.p]: e.target.value } })}>
                    {Object.entries(PARO_VERANO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </td>
                <td><input type="checkbox" checked={keys.includes(r.p)} onChange={() => update({ keys: toggle(keys, r.p) })} /></td>
                <td>
                  <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" max="40" value={dias[r.p]}
                    onChange={e => update({ dias: { ...dias, [r.p]: num(e.target.value) } })} />
                </td>
                <td>{r.dev}</td>
                <td className={!r.disc && r.verano < r.min ? 'sv-to-bad' : ''}>{r.disc ? 'No trabaja' : `${r.verano} (${r.min || '—'})`}</td>
                <td>{r.usados}{r.cierreDias > 0 && <span className="sv-ot-muted"> ({r.cierreDias} cierre)</span>}</td>
                <td className={r.restan < 0 ? 'sv-to-bad' : ''}>{r.restan}</td>
                <td>{PROF_META[r.p].costoMes.toLocaleString('es-ES')}</td>
                <td className={r.ahorro > 0 ? 'sv-to-good' : r.ahorro < 0 ? 'sv-to-bad' : 'sv-ot-muted'}>{r.ahorro ? eur(r.ahorro) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ExploradorParo paro={paro} cierre={cierre} keys={keys} onApply={p => update({ paro: p })} />

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
                      onChange={e => setPeriod(x.id, { n: num(e.target.value, 1) })} />
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
                  const inactive = !disponible(p, d.date, ctx)
                  const enCamp = d.camp && camp.staff.includes(p) && !inactive
                  const isOff = !inactive && !enCamp && (d.out.includes(p) || d.closed)
                  return (
                    <td key={d.date} onClick={() => setSelDate(d.date)}
                      className={`sv-to-tl-cell${inactive ? ' sv-to-tl-cell--inactive' : ''}${enCamp ? ' sv-to-tl-cell--camp' : ''}${d.date === selDate ? ' sv-to-tl--sel' : ''}`}
                      style={isOff ? { background: PROF_META[p].color, opacity: d.closed ? 0.45 : 1 } : undefined} />
                  )
                })}
              </tr>
            ))}
            <tr className="sv-to-tl-sep">
              <th className="sv-to-tl-head">Abre</th>
              {sim.map(d => <td key={d.date} className={`sv-to-tl-cell ${d.closed ? 'sv-to-tl-cell--closed' : d.sinAbrir ? 'sv-to-tl-cell--bad' : 'sv-to-tl-cell--ok'}`} title={d.closed ? 'Cerrado' : d.opener || 'Nadie'} />)}
            </tr>
            <tr>
              <th className="sv-to-tl-head">Cierra</th>
              {sim.map(d => <td key={d.date} className={`sv-to-tl-cell ${d.closed ? 'sv-to-tl-cell--closed' : d.sinCerrar ? 'sv-to-tl-cell--bad' : 'sv-to-tl-cell--ok'}`} title={d.closed ? 'Cerrado' : d.closer || 'Nadie'} />)}
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
              <th className="sv-to-tl-head">{COMODIN_VERANO} da clase</th>
              {sim.map(d => (
                <td key={d.date} className={`sv-to-tl-cell sv-to-tl-num${d.comodin ? ' sv-to-tl-num--bad' : ''}`}>
                  {d.comodin || ''}
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
        Pulsa un día para ver el detalle. Color: vacaciones (más tenue si es cierre de la sala). Gris rayado: no trabaja ese mes.
        Recuadro blanco: lleva el campamento. Solo se cuentan días laborables; los festivos que se descuentan son los
        nacionales de Navidad y el 15 de agosto.
      </p>

      {selDay && (
        <div className="sv-class-detail">
          <div className="sv-class-detail__title">
            {DAY_LABEL[weekdayOf(selDay.date)]} {fmtShort(selDay.date)} · {selDay.closed ? 'sala cerrada' : isSummer(selDay.date) ? 'horario de verano' : 'horario normal'}
          </div>
          {selDay.closed ? (
            <ul className="sv-to-detail">
              <li>Vacaciones de todos los que trabajan ese mes.</li>
              {selDay.camp && <li>Campamento: {camp.staff.filter(p => disponible(p, selDay.date, ctx)).join(', ') || <span className="sv-to-bad">nadie</span>}</li>}
            </ul>
          ) : (
            <ul className="sv-to-detail">
              <li>Fuera: {selDay.out.length ? selDay.out.join(', ') : 'nadie'}</li>
              <li>Abre: {selDay.opener || <span className="sv-to-bad">nadie con llave</span>} · Cierra: {selDay.closer || <span className="sv-to-bad">nadie con llave</span>}</li>
              {selDay.covered.map((c, i) => (
                <li key={`c${i}`} className={c.comodin ? 'sv-to-warn-txt' : ''}>
                  {c.from ? `Clase de ${c.from} (${c.start})` : `Clase ${c.start}`} → la da {c.to}{c.comodin ? ' (comodín, deja recepción)' : ''}
                </li>
              ))}
              {selDay.lost.map((c, i) => (
                <li key={`l${i}`} className="sv-to-bad">{c.prof ? `Clase de ${c.prof} (${c.start})` : `Clase ${c.start}`} sin nadie que la dé</li>
              ))}
              {selDay.suspended.map((c, i) => <li key={`s${i}`} className="sv-ot-muted">Clase de {c.prof} ({c.start}) suspendida (discontinuo)</li>)}
              {conflictsOf(selDay).map((c, i) => <li key={`x${i}`} className={c.level === 'rojo' ? 'sv-to-bad' : 'sv-to-warn-txt'}>{c.a} + {c.b}: {LEVEL_LABEL[c.level].toLowerCase()}</li>)}
            </ul>
          )}
        </div>
      )}

      <p className="sv-note">
        Pasar a fijo discontinuo requiere que la persona firme el cambio de contrato. El paro en julio y agosto depende de lo
        que haya cotizado (con jornada parcial la prestación es proporcional): confirmarlo con la gestoría antes de proponerlo.
        "Verano frente a hoy" suma el coste empresa de los meses de paro que se ahorran frente a hoy, los gastos de sala
        ahorrados menos los ingresos perdidos por cerrar, y los ingresos del campamento (sin descontar sus gastos).
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

  const ctx = { paro: state.paro, cierre: state.cierre }

  return (
    <div className="sv-tab-panel">
      <Normas />
      <HistoricoVerano onApply={h => setState(s => ({ ...s, ingresosSala: h.ingresos, gastosSala: h.ahorrable }))} />
      <ConflictMatrix keys={state.keys} ctx={ctx} />
      <Calculadora state={state} setState={setState} />
    </div>
  )
}
