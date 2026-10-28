import { Component, useState, useMemo, useEffect, useRef } from 'react'
import { PROF_META, PROF_ORDER, DAYS, DAY_LABEL } from '../data/staffSchedule'
import {
  KEY_HOLDERS_DEFAULT, VERANO_APERTURA, COMODIN_VERANO, veranoSlots, pairConflict, simulatePlan,
  laborablesBetween, laborablesFrom, isSummer, weekdayOf, fmtShort,
  diasDevengados, PARO_VERANO, combinacionesParo, CIERRE_VERANO, isClosed, disponible, setFestivos,
  CAMP_DEFAULT, CAMP_MESES, normalizeCamp, lunesDelMes,
} from '../utils/coverage'
import { equilibrioCamp, tablaCamp } from '../utils/campamento'
import { useExpenses } from '../hooks/useSuperAdmin'
import { useCostes, FACTOR_COSTE } from '../hooks/useCostes'
import { autoCategory } from '../utils/expensesParser'
import { PL_DATA } from '../data/plHistorico'
import {
  DIAS_ANUALES, HOY_PARO, MES_LABEL, MESES_ANUALES, MANANAS_MODO, MANANAS_DISPOSICION, eur, inactivosMes,
  evaluarPlan, defaultYear, todayISO, repartirVacaciones, BLOQUE_VERANO, MAX_BLOQUES, CIERRE_EXTRA,
  normalizeMananas, horasMananaPorPersona, ingresosMananaDeClases, cuentasMananas, equilibrioManana,
} from '../utils/timeoffPlan'
import { useTimeOffData, savePlan, saveReal, syncNueve, addScenario } from '../hooks/useTimeOff'
import { useClases } from '../hooks/useClases'
import TimeOffRequests, { matchPerson } from './TimeOffRequests'
import TimeOffIntegration, { personaDeEmpleado } from './TimeOffIntegration'
import TimeOffSummary from './TimeOffSummary'
import { PrevisionVerano, Escenarios } from './TimeOffPlanning'

// Antes el plan vivía en el navegador; se importa una vez si el servidor no tiene plan
const LEGACY_STORAGE_KEY = 'blokes.timeoff.v4'
const PARO_CORTO = { no: '—', verano: 'Jul + ago', agosto: 'Ago', julio: 'Jul' }

const LEVEL_LABEL = { rojo: 'No coincidir', ambar: 'Evitar', verde: 'Posible' }
const DAY_SHORT   = { Lunes: 'L', Martes: 'M', Miercoles: 'X', Jueves: 'J', Viernes: 'V' }

const CLASES_VERANO = DAYS.reduce((n, d) => n + veranoSlots(d).length, 0)

function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d) - today) / 86400000)
}

let nextId = 1
// Un periodo nuevo se da por comunicado hoy (cuenta para la antelación de 2 meses)
const period = (prof, start, n, extra = {}) => ({ id: nextId++, prof, start, n, comunicado: todayISO(), acuerdo: false, nota: '', ...extra })

// Campamento de partida: 4 semanas de julio con 15 plazas a 150 €; costes a revisar
const campBase = extra => normalizeCamp({ ...CAMP_DEFAULT, ...extra })

// Escenarios de partida para el año natural `y`: solo la configuración (paro, cierre,
// campamento). Las vacaciones las coloca después «Repartir vacaciones» para que el plan
// sea coherente (bloque de 15 en verano y el resto sin choques ni días sin abrir).
function presetPlan(kind, y) {
  const base = { year: y, paro: { ...HOY_PARO }, cierre: 'abierto', cierreExtra: 'pagados', camp: campBase({ activo: false }) }
  const todos = op => Object.fromEntries(PROF_ORDER.map(p => [p, op]))
  switch (kind) {
    case 'discontinuas':      return { ...base, paro: { ...HOY_PARO, Sara: 'verano', 'Lucía': 'verano' } }
    case 'cierreAgosto':      return { ...base, cierre: 'agosto' }
    case 'agostoParo':        return { ...base, cierre: 'agosto', paro: { ...todos('agosto'), Sigurd: 'verano' } }
    case 'tardeCamp':         return { ...base, camp: campBase({ activo: true }) }
    case 'cierreVerano':      return { ...base, cierre: 'verano', camp: campBase({ activo: true, staff: [COMODIN_VERANO, 'Ana'] }) }
    case 'todosDiscontinuos': return { ...base, cierre: 'verano', paro: todos('verano') }
    default:                  return base
  }
}

const PRESETS = [
  ['hoy',          'Hoy (Sigurd jul–ago, Ana ago)'],
  ['discontinuas', 'Sara y Lucía fijas discontinuas'],
  ['cierreAgosto', 'Cerrar agosto (bloque de 15 en agosto)'],
  ['agostoParo',   'Cerrar agosto, todos en paro en agosto'],
  ['tardeCamp',    'Abierto por la tarde + campamento por la mañana (julio)'],
  ['cierreVerano', 'Cerrar julio y agosto + campamento'],
  ['todosDiscontinuos', 'Cerrar julio y agosto, todos discontinuos'],
]

// Huella de lo que define un supuesto, para saber si se ha tocado tras aplicarlo. Va
// normalizada: el servidor (PHP) devuelve los objetos vacíos como [] y sin claves a false.
function firmaPlan(st) {
  const c = normalizeCamp(st.camp)
  return JSON.stringify({
    year: st.year, cierre: st.cierre, cierreExtra: st.cierreExtra || 'pagados',
    paro: PROF_ORDER.map(p => st.paro?.[p] || 'no'),
    camp: c.activo ? [CAMP_MESES.map(m => [c.meses[m].semanas, c.meses[m].plazas]), [...c.staff].sort(), c.precio, c.ocupacion] : null,
    periods: (st.periods || []).map(p => [p.prof, p.start, Number(p.n), !!p.acuerdo]).sort(),
    pacto: PROF_ORDER.filter(p => st.pactoVerano?.[p]),
    mananas: (() => {
      const mn = normalizeMananas(st.mananas)
      return mn.modo === 'abiertas' ? null : [mn.modo, [...mn.meses].sort(), mn.corteHora, mn.pctTarde, mn.gastoSala,
        PROF_ORDER.filter(p => mn.disposicion?.[p] && mn.disposicion[p] !== 'tarde').map(p => [p, mn.disposicion[p]])]
    })(),
  })
}

// Coloca las vacaciones del año con el reparto automático (ids nuevos)
function conReparto(st) {
  const periods = repartirVacaciones(st).map(p => (p.id ? p : period(p.prof, p.start, p.n, { nota: p.nota || '', comunicado: p.comunicado })))
  return { ...st, periods }
}

function defaultState(year = defaultYear()) {
  return {
    ...presetPlan('hoy', year),
    periods: [],
    keys: [...KEY_HOLDERS_DEFAULT],
    dias: Object.fromEntries(PROF_ORDER.map(p => [p, DIAS_ANUALES])),
    pactoVerano: {},
    // €/mes por mes de verano (7 = julio, 8 = agosto)
    gastosSala:   { 7: 0, 8: 0 },
    ingresosSala: { 7: 0, 8: 0 },
    mananas: normalizeMananas(),
    preset: null,
  }
}

// Plan guardado (sin ids) → estado de la calculadora
function hydrate(plain) {
  const st = { ...defaultState(plain.year || defaultYear()), ...plain }
  st.periods = (plain.periods || []).map(p => ({ ...p, id: nextId++ }))
  st.camp = normalizeCamp(plain.camp)
  st.mananas = normalizeMananas(plain.mananas)
  // Planes guardados con la huella anterior: si no se había tocado, se pasa a la nueva
  if (st.preset?.firma?.includes('"paro":{')) {
    const pv = plain.pactoVerano
    const vieja = JSON.stringify({
      year: plain.year, paro: plain.paro, cierre: plain.cierre, cierreExtra: plain.cierreExtra,
      camp: plain.camp && { activo: plain.camp.activo, staff: plain.camp.staff, start: plain.camp.start, semanas: plain.camp.semanas },
      periods: (plain.periods || []).map(p => [p.prof, p.start, p.n, !!p.acuerdo]).sort(),
      pacto: Array.isArray(pv) && !pv.length ? {} : pv || {},
    })
    st.preset = { ...st.preset, firma: vieja === st.preset.firma ? firmaPlan(st) : '' }
  }
  return st
}

// Estado → lo que se guarda (los ids de los periodos son solo de la sesión)
function toPlain(state) {
  return { ...state, periods: state.periods.map(({ id, ...p }) => p) }
}

function legacyLocalPlan() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// ─── Normas y plazos ─────────────────────────────────────────────────────────
// Recordatorio: calendario del año antes del 31 de marzo, quién no tiene aún su bloque
// de verano (los fijos discontinuos aparte, pendientes de la asesoría) y qué periodos
// empiezan sin los 2 meses de antelación
function Recordatorio({ ev, requests }) {
  const y = ev.y
  const plazo = `${y}-03-31`
  const n = daysUntil(plazo)
  const faltan = ev.rows.filter(r => r.bloqueVerano < BLOQUE_VERANO && !r.pactado)
  const sinBloque = faltan.filter(r => !r.nParo).map(r => r.p)
  const asesoria  = faltan.filter(r => r.nParo).map(r => r.p)
  const pendientes = requests.filter(r => r.status === 'pendiente').length
  return (
    <div className={`sv-to-reminder${(n >= 0 && n <= 30 && sinBloque.length) || ev.antelacion.length ? ' sv-to-reminder--urgent' : ''}`}>
      <strong>Recordatorio · calendario de vacaciones {y}:</strong>{' '}
      {n >= 0 ? <>cerrarlo antes del {fmtShort(plazo)} ({n === 0 ? 'hoy' : `faltan ${n} días`}).</> : <>tenía que estar cerrado el {fmtShort(plazo)}; los cambios, por acuerdo.</>}
      {' '}{sinBloque.length
        ? <>Sin su bloque de {BLOQUE_VERANO} días aprobado en junio–septiembre: <strong>{sinBloque.join(', ')}</strong>.</>
        : <span className="sv-to-good">Todos los que deben tienen su bloque de verano.</span>}
      {asesoria.length > 0 && <div className="sv-ot-muted">Pendiente de la asesoría (fijos discontinuos): {asesoria.join(', ')}.</div>}
      {ev.antelacion.length > 0 && (
        <div className="sv-to-bad">
          Con menos de 2 meses de antelación y sin acuerdo: {ev.antelacion.map(a => `${a.p} (${fmtShort(a.start)})`).join(', ')}.
        </div>
      )}
      {pendientes > 0 && <div>{pendientes} {pendientes === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} de responder.</div>}
      <div className="sv-ot-muted">Avisarles por correo o WhatsApp desde la app queda para una fase siguiente.</div>
    </div>
  )
}

function Normas({ ev, requests }) {
  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Normas</h3>
      <Recordatorio ev={ev} requests={requests} />
      <details className="sv-to-fold">
        <summary>Ver las reglas (convenio, art. 34)</summary>
        <ul className="sv-to-rules">
          <li>Convenio estatal de instalaciones deportivas y gimnasios: <strong>{DIAS_ANUALES} días laborables</strong> por año natural, en <strong>tres bloques como mucho</strong>.</li>
          <li><strong>{BLOQUE_VERANO} laborables seguidos entre el 1 de junio y el 30 de septiembre</strong>; los otros dos bloques, de <strong>al menos 3 días</strong> cada uno (3 + 5 o 4 + 4). Otro reparto, solo con <strong>acuerdo expreso</strong>.</li>
          <li>Las vacaciones <strong>no pueden empezar en festivo ni en un día de descanso</strong> de la persona.</li>
          <li>El calendario se hace en el <strong>primer trimestre</strong> y cada persona conoce sus fechas con <strong>2 meses de antelación</strong>. Las fechas se fijan de común acuerdo (art. 38 ET). La elección de turnos es rotativa y tienen preferencia en el periodo escolar quienes tienen hijos en edad escolar.</li>
          <li>Si el club <strong>cierra en agosto</strong>, puede fijar ahí el bloque de {BLOQUE_VERANO} días. Los días de cierre que pasan de {BLOQUE_VERANO} se pagan sin trabajar o se descuentan con acuerdo.</li>
          <li>No se puede imponer otro reparto ni el paro: pasar a fijo discontinuo o pactar fechas distintas necesita el acuerdo de la persona.</li>
          <li>En verano se abre solo por la tarde, desde las <strong>{VERANO_APERTURA}</strong>, con clases de 1,5 h seguidas ({CLASES_VERANO} a la semana). {COMODIN_VERANO} está en recepción y solo da clase si no hay ningún profe. Hacen falta <strong>2 profes + {COMODIN_VERANO}</strong> cada mes.</li>
          <li>Los <strong>fijos discontinuos</strong> devengan {diasDevengados(DIAS_ANUALES, 1)} días si paran un mes y {diasDevengados(DIAS_ANUALES, 2)} si paran los dos. Si les aplica el bloque de {BLOQUE_VERANO} en junio o septiembre está pendiente de la asesoría.</li>
        </ul>
      </details>
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

// Una fila por mes: 2024–2025 del Excel (PL_DATA), desde 2026 del banco.
// «resultado» es siempre ventas − costes fijos (el mismo criterio que la previsión);
// el resultado del Excel, que incluía otras partidas, va aparte en «resultadoExcel».
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
          resultadoExcel: PL_DATA.resultado[yr][i], ahorrable: null,
        }
      })
    })
    ;(exp.data || []).forEach(r => {
      if (acc[r.month]?.fuente === 'Excel') return
      const x = (acc[r.month] ||= { month: r.month, fuente: 'Banco', ventas: 0, costes: 0, resultadoExcel: null, ahorrable: 0 })
      x.ventas += Math.abs(r.total_ingresos || 0)
      x.costes += Math.abs(r.total_costes || 0)
      Object.entries(r.by_concepto || {}).forEach(([k, v]) => {
        if (CATS_AHORRABLES.includes(autoCategory(k, false))) x.ahorrable += v
      })
    })
    return Object.values(acc)
      .map(x => ({ ...x, resultado: x.ventas - x.costes }))
      .sort((p, q) => p.month.localeCompare(q.month))
  }, [exp.data])

  return { months, loading: exp.loading, error: exp.error }
}

const mediaDe = (arr, k) => {
  const v = arr.map(x => x[k]).filter(x => x != null)
  return v.length ? v.reduce((n, x) => n + x, 0) / v.length : null
}

// Medias de julio y agosto para rellenar la calculadora (ventas que se pierden y gastos
// que se ahorran si se cierra)
function sugeridoHistorico(months) {
  const delMes = mes => months.filter(m => Number(m.month.slice(5)) === mes)
  return {
    ingresos:  { 7: Math.round(mediaDe(delMes(7), 'ventas') || 0),    8: Math.round(mediaDe(delMes(8), 'ventas') || 0) },
    ahorrable: { 7: Math.round(mediaDe(delMes(7), 'ahorrable') || 0), 8: Math.round(mediaDe(delMes(8), 'ahorrable') || 0) },
  }
}

function HistoricoVerano({ hist, onApply }) {
  const { months, loading, error } = hist
  const mesNum = m => Number(m.month.slice(5))
  const isVer  = m => mesNum(m) === 7 || mesNum(m) === 8
  const delMes = mes => months.filter(m => mesNum(m) === mes)
  const resto  = months.filter(m => !isVer(m))
  const restoAnio = yr => resto.filter(m => m.month.startsWith(yr))
  const sugerido = sugeridoHistorico(months)

  return (
    <details className="sv-section sv-to-fold">
      <summary className="sv-section-title">Datos: histórico de julio y agosto</summary>
      <p className="sv-note">
        Los mismos datos que Superadmin › P&amp;L: 2024 y 2025 del Excel de cuentas (ventas sin IVA y costes fijos), y desde
        2026 los extractos del banco. <strong>Resultado = ventas − costes fijos</strong>, igual que en la previsión. El
        «Resultado Excel» de 2024 incluía otras partidas y por eso no coincide. «Ahorrable» es lo que dejaría de pagarse con
        la sala cerrada (luz, gas, bar, comisiones TPV); solo sale con el banco.
      </p>
      {loading && <p className="sv-loading">Cargando el banco…</p>}
      {error && <p className="sv-error">No se pudo cargar el banco ({error}); se muestran solo los datos del Excel.</p>}
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Mes</th><th>Fuente</th><th>Ventas</th><th>Costes fijos</th><th>Resultado</th>
              <th>Resultado Excel</th><th>Ahorrable</th><th>Ventas medias resto del año</th>
            </tr>
          </thead>
          <tbody>
            {months.filter(isVer).map(m => {
              const ra = restoAnio(m.month.slice(0, 4))
              const vr = mediaDe(ra, 'ventas')
              return (
                <tr key={m.month}>
                  <td style={{ textTransform: 'capitalize' }}>{fmtMes(m.month)}</td>
                  <td className="sv-ot-muted">{m.fuente}</td>
                  <td>{eur(m.ventas)}{vr ? <span className="sv-ot-muted"> ({Math.round(m.ventas / vr * 100)} %)</span> : null}</td>
                  <td>{eur(m.costes)}</td>
                  <td className={m.resultado < 0 ? 'sv-to-bad' : 'sv-to-good'}>{eur(m.resultado)}</td>
                  <td className="sv-ot-muted">{m.resultadoExcel != null ? eur(m.resultadoExcel) : '—'}</td>
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
          const res = mediaDe(arr, 'resultado')
          return (
            <div key={mes} className="sv-kpi" style={{ '--kpi-color': res != null && res < 0 ? '#f87171' : '#60a5fa' }}>
              <span className="sv-kpi__value">{eur(res || 0)}</span>
              <span className="sv-kpi__label">
                Resultado medio de {MES_LABEL[mes].toLowerCase()} ({arr.length} años) · ventas {eur(mediaDe(arr, 'ventas') || 0)} · costes {eur(mediaDe(arr, 'costes') || 0)}
              </span>
            </div>
          )
        })}
        <div className="sv-kpi" style={{ '--kpi-color': '#888' }}>
          <span className="sv-kpi__value">{eur(mediaDe(resto, 'ventas') || 0)}</span>
          <span className="sv-kpi__label">Ventas medias del resto de meses ({resto.length})</span>
        </div>
      </div>
      <button className="sv-tests-add" onClick={() => onApply(sugerido)}>
        Usar estas medias en el simulador · julio: se pierden {eur(sugerido.ingresos[7])}, se ahorran {eur(sugerido.ahorrable[7])} ·
        agosto: se pierden {eur(sugerido.ingresos[8])}, se ahorran {eur(sugerido.ahorrable[8])}
      </button>
    </details>
  )
}

// ─── Matriz de conflictos ────────────────────────────────────────────────────
function ConflictMatrix({ keys, ctx }) {
  const [season, setSeason] = useState('invierno')
  const mes = season === 'invierno' ? null : Number(season)
  const closed = mes && isClosed(`${ctx.year}-0${mes}-15`, ctx.cierre)
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
const PARO_FRASE = { verano: 'julio y agosto', agosto: 'agosto', julio: 'julio' }

function fraseCombo(c) {
  const cambios = PROF_ORDER.filter(p => c.paro[p] !== (HOY_PARO[p] || 'no'))
  const txt = cambios.map(p => (c.paro[p] === 'no' ? `${p} trabaja todo el verano` : `${p} en paro ${PARO_FRASE[c.paro[p]]}`))
  return txt.length ? txt.join(' · ') : 'Igual que hoy'
}

function ExploradorParo({ paro, cierre, keys, coste, onApply }) {
  const [verTodas, setVerTodas] = useState(false)
  const combos = useMemo(() => combinacionesParo({
    cierre, keys, hoy: HOY_PARO, coste,
  }), [cierre, keys, coste])
  const actual = combos.findIndex(c => PROF_ORDER.every(p => c.paro[p] === (paro[p] || 'no')))
  const total = 4 ** PROF_ORDER.length

  if (cierre === 'verano') {
    return (
      <p className="sv-note">
        Con la sala cerrada en julio y agosto no hace falta nadie en verano: todas las combinaciones de paro valen y lo único
        que cambia es el ahorro (cuanta más gente en paro, más ahorro).
      </p>
    )
  }

  const lista = combos.slice(0, verTodas ? 40 : 5)
  return (
    <details className="sv-to-fold">
      <summary>Ideas: las combinaciones de paro que más ahorran ({combos.length} de {total} dejan el verano cubierto)</summary>
      <p className="sv-note">
        Cada una deja cada mes abierto con al menos 2 profes + {COMODIN_VERANO} y alguien con llave.
        {actual >= 0 ? ` La de ahora es la n.º ${actual + 1}.` : ' La de ahora no cumple el mínimo de 2 profes + Eva.'}
        {' '}Al aplicar una se vuelven a repartir las vacaciones.
      </p>
      <ol className="sv-to-combos">
        {lista.map((c, i) => (
          <li key={i} className={i === actual ? 'sv-to-row--sel' : ''}>
            <span className="sv-to-combos__txt">{fraseCombo(c)}</span>
            <span className={c.ahorro > 0 ? 'sv-to-good' : c.ahorro < 0 ? 'sv-to-bad' : 'sv-ot-muted'}>{c.ahorro > 0 ? '+' : ''}{eur(c.ahorro)}/año</span>
            {i === actual ? <span className="sv-ot-muted">actual</span>
              : <button className="sv-filter-btn" onClick={() => onApply({ ...c.paro })}>Aplicar</button>}
          </li>
        ))}
      </ol>
      {combos.length > 5 && (
        <button className="sv-filter-btn" onClick={() => setVerTodas(v => !v)}>{verTodas ? 'Ver solo las 5 mejores' : 'Ver más'}</button>
      )}
    </details>
  )
}

// ─── Piezas compartidas por Vacaciones (lo real) y Simulador ─────────────────

const toggleIn = (list, p) => (list.includes(p) ? list.filter(x => x !== p) : [...list, p])
const num = (v, min = 0) => Math.max(min, Number(v) || 0)
const signo = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(Math.abs(n))}`

function YearSelector({ y, onChange, years = [defaultYear() - 1, defaultYear(), defaultYear() + 1] }) {
  return (
    <span className="sv-to-inline">
      Año
      <span className="sv-period">
        {years.map(yr => (
          <button key={yr} className={`sv-period__btn${yr === y ? ' sv-period__btn--active' : ''}`} onClick={() => onChange(yr)}>
            {yr}{yr === new Date().getFullYear() ? ' (en curso)' : ''}
          </button>
        ))}
      </span>
    </span>
  )
}

// Rellena con la media del histórico las ventas perdidas y los gastos ahorrados de los
// meses que pasan a estar cerrados (solo si estaban a 0)
function rellenarCierre(st, sugerido) {
  if (!sugerido) return st
  const meses = [7, 8].filter(m => isClosed(`${st.year}-0${m}-15`, st.cierre))
  const ing = { ...(st.ingresosSala || {}) }
  const gas = { ...(st.gastosSala || {}) }
  meses.forEach(m => {
    if (!ing[m]) ing[m] = sugerido.ingresos[m] || 0
    if (!gas[m]) gas[m] = sugerido.ahorrable[m] || 0
  })
  return { ...st, ingresosSala: ing, gastosSala: gas }
}

// Sala en verano, días de cierre que pasan de 15 y campamento. Con `conDinero`, también
// ingresos/gastos de la sala y plazas/precio del campamento (solo en el simulador).
function ConfigVerano({ state, update, ev, conDinero, sugerido }) {
  const { cierre, gastosSala = {}, ingresosSala = {} } = state
  const camp = normalizeCamp(state.camp)
  const cierreExtra = state.cierreExtra || 'pagados'
  const setCamp = patch => update({ camp: { ...camp, ...patch } })
  const cambiarCierre = c => update(conDinero ? rellenarCierre({ ...state, cierre: c }, sugerido) : { cierre: c })
  const delHistorico = m => sugerido && ingresosSala[m] === sugerido.ingresos[m] && gastosSala[m] === sugerido.ahorrable[m]
  return (
    <>
      <div className="sv-to-form">
        <label className="sv-to-inline">
          Sala en verano
          <select className="sv-tests-select" value={cierre} onChange={e => cambiarCierre(e.target.value)}>
            {Object.entries(CIERRE_VERANO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {cierre !== 'abierto' && (
          <label className="sv-to-inline">
            Días de cierre que pasan de {BLOQUE_VERANO}
            <select className="sv-tests-select" value={cierreExtra} onChange={e => update({ cierreExtra: e.target.value })}>
              {Object.entries(CIERRE_EXTRA).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
        )}
        <label className="sv-to-inline">
          <input type="checkbox" checked={camp.activo} onChange={() => setCamp({ activo: !camp.activo })} />
          Campamento por la mañana
        </label>
      </div>
      {conDinero && cierre !== 'abierto' && (
        <div className="sv-to-form">
          {ev.mesesCerradosList.map(m => (
            <span key={m} className="sv-to-inline">
              {MES_LABEL[m]} cerrado: se pierden
              <input className="sv-tests-input sv-tests-input--num" type="number" min="0" value={ingresosSala[m] || 0}
                onChange={e => update({ ingresosSala: { ...ingresosSala, [m]: num(e.target.value) } })} />
              € de ventas y se ahorran
              <input className="sv-tests-input sv-tests-input--num" type="number" min="0" value={gastosSala[m] || 0}
                onChange={e => update({ gastosSala: { ...gastosSala, [m]: num(e.target.value) } })} />
              € de gastos
              {delHistorico(m) && <span className="sv-ot-muted">(media del histórico; cámbialo si quieres)</span>}
            </span>
          ))}
        </div>
      )}
      {camp.activo && <CampConfig camp={camp} setCamp={setCamp} y={ev.y} cierre={cierre} conDinero={conDinero} ev={ev} />}
    </>
  )
}

const COSTES_CAMP = ['ratio', 'eurHora', 'seguro', 'material', 'comida']

// Campamento: semanas y plazas por mes, horario, quién lo lleva y, en el simulador, precio,
// costes y cuentas
function CampConfig({ camp, setCamp, y, cierre, conDinero, ev }) {
  const setMes = (m, patch) => setCamp({ meses: { ...camp.meses, [m]: { ...camp.meses[m], ...patch } } })
  const campo = (label, k, unidad, attrs = {}) => (
    <label className="sv-to-inline">
      {label}
      <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" value={camp[k]} {...attrs}
        onChange={e => setCamp({ [k]: Math.min(attrs.max ?? Infinity, num(e.target.value, attrs.min ?? 0)) })} />
      {unidad}
    </label>
  )
  const costesDePartida = COSTES_CAMP.every(k => camp[k] === CAMP_DEFAULT[k])
  return (
    <div className="sv-to-camp">
      <div className="sv-to-form">
        {CAMP_MESES.map(m => {
          const maxSem = lunesDelMes(y, m).length
          return (
            <span key={m} className="sv-to-inline">
              <strong>{MES_LABEL[m]}</strong>
              <span className="sv-ot-muted">({isClosed(`${y}-0${m}-15`, cierre) ? 'sala cerrada' : 'sala abierta por la tarde'})</span>
              <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" max={maxSem} value={camp.meses[m].semanas}
                onChange={e => setMes(m, { semanas: Math.min(maxSem, num(e.target.value)) })} />
              semanas
              {conDinero && (
                <>
                  {' '}de
                  <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" value={camp.meses[m].plazas}
                    onChange={e => setMes(m, { plazas: num(e.target.value) })} />
                  plazas
                </>
              )}
            </span>
          )
        })}
        <label className="sv-to-inline">
          De
          <input className="sv-tests-input" type="time" value={camp.horaInicio} onChange={e => setCamp({ horaInicio: e.target.value })} />
          a
          <input className="sv-tests-input" type="time" value={camp.horaFin} onChange={e => setCamp({ horaFin: e.target.value })} />
        </label>
      </div>
      <div className="sv-to-form">
        <span className="sv-to-inline">
          Lo llevan de la plantilla
          {PROF_ORDER.map(p => (
            <label key={p} className="sv-to-chip" style={{ color: PROF_META[p].color }}>
              <input type="checkbox" checked={camp.staff.includes(p)} onChange={() => setCamp({ staff: toggleIn(camp.staff, p) })} />
              {p}
            </label>
          ))}
        </span>
        <span className="sv-ot-muted sv-to-small">Los monitores que falten, de fuera.</span>
      </div>
      {conDinero && (
        <>
          <div className="sv-to-form">
            {campo('Precio', 'precio', '€ por niño y semana')}
            {campo('Ocupación esperada', 'ocupacion', '%', { max: 100 })}
            {campo('Descuento medio', 'descuento', '% (hermanos, varias semanas)', { max: 100 })}
          </div>
          <div className="sv-to-form">
            {campo('Un monitor por cada', 'ratio', 'niños', { min: 1 })}
            {campo('Monitor de fuera', 'eurHora', '€/h')}
            {campo('Seguro', 'seguro', '€')}
            {campo('Material', 'material', '€')}
            {campo('Comida o almuerzo', 'comida', '€ por niño y semana')}
          </div>
          {costesDePartida && (
            <p className="sv-to-warn-txt sv-to-small">
              Costes de partida, a revisar con datos reales: un monitor por cada {CAMP_DEFAULT.ratio} niños, {CAMP_DEFAULT.eurHora} €/h el de
              fuera y {CAMP_DEFAULT.seguro + CAMP_DEFAULT.material} € por niño y semana de seguro y material.
            </p>
          )}
          <CampCuentas ev={ev} />
        </>
      )}
    </div>
  )
}

function CampCuentas({ ev }) {
  const r = ev.eco.campRes
  const eq = useMemo(() => equilibrioCamp(r.c, ev.campCtx), [ev])
  const tabla = useMemo(() => tablaCamp(r.c, ev.campCtx), [ev])
  if (!r.semanas) return <p className="sv-to-warn-txt sv-to-small">Pon cuántas semanas hay campamento en julio o en agosto.</p>
  const cls = n => (n > 0 ? 'sv-to-good' : n < 0 ? 'sv-to-bad' : '')
  const meses = CAMP_MESES.filter(m => r.porMes[m].semanas)
  return (
    <>
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr><th>Campamento</th><th>Semanas</th><th>Niños por semana</th><th>Lo que pagan</th><th>Monitores</th><th>Seguro, material y comida</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            {meses.map(m => {
              const p = r.porMes[m]
              return (
                <tr key={m}>
                  <td>{MES_LABEL[m]}</td><td>{p.semanas}</td><td>{Math.round(p.ninos / p.semanas)}</td>
                  <td>{eur(p.ingresos)}</td><td>−{eur(p.costeMonitores)}</td><td>−{eur(p.costeNinos)}</td>
                  <td className={cls(p.resultado)}><strong>{signo(p.resultado)}</strong></td>
                </tr>
              )
            })}
            {meses.length > 1 && (
              <tr className="sv-to-row--total">
                <td>Total</td><td>{r.semanas}</td><td></td><td>{eur(r.ingresos)}</td><td colSpan={2}>−{eur(r.costes)}</td>
                <td className={cls(r.total)}><strong>{signo(r.total)}</strong></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="sv-note sv-to-small">
        {eq
          ? <>A partir de <strong>{eq} {eq === 1 ? 'niño' : 'niños'} por semana</strong> el campamento compensa con este precio y estos costes.</>
          : <>Con este precio y estos costes no llega a compensar.</>}
        {' '}Monitores: {Math.round(r.porMes[7].horasFuera + r.porMes[8].horasFuera)} h de fuera
        {r.porMes[7].horasPlantilla + r.porMes[8].horasPlantilla > 0 && <> y {Math.round(r.porMes[7].horasPlantilla + r.porMes[8].horasPlantilla)} h de la plantilla (horas de más a su coste por hora, porque la sala está abierta)</>}.
        {ev.mesesCerradosList.length > 0 && <> Con la sala cerrada, las horas de la plantilla no cuestan más: su sueldo se paga igual.</>}
      </p>
      <details className="sv-to-fold">
        <summary>Resultado según niños por semana y precio</summary>
        <div className="sv-tests-scroll">
          <table className="sv-tests-table">
            <thead><tr><th>Niños por semana</th>{tabla.precios.map(p => <th key={p}>{p} €</th>)}</tr></thead>
            <tbody>
              {tabla.ninos.map((n, i) => (
                <tr key={n}><td>{n}</td>{tabla.filas[i].map((v, j) => <td key={j} className={cls(v)}>{signo(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

// ─── Mañanas: cerrar antes de una hora de corte, todo el año o algunos meses ─────────────
function ConfigMananas({ state, update, costes, clases }) {
  const mananas = normalizeMananas(state.mananas)
  const setMananas = patch => update({ mananas: { ...mananas, ...patch } })
  const horas = useMemo(() => horasMananaPorPersona(mananas.corteHora), [mananas.corteHora])
  const cerrado = mananas.modo !== 'abiertas'
  return (
    <>
      <div className="sv-to-form">
        <label className="sv-to-inline">
          Mañanas
          <select className="sv-tests-select" value={mananas.modo} onChange={e => setMananas({ modo: e.target.value })}>
            {Object.entries(MANANAS_MODO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="sv-to-inline">
          Es «mañana» lo que va antes de
          <input className="sv-tests-input" type="time" value={mananas.corteHora}
            onChange={e => setMananas({ corteHora: e.target.value || MANANAS_CORTE_DEFECTO })} />
        </label>
      </div>
      {mananas.modo === 'cerradas-meses' && (
        <div className="sv-filter-group sv-to-wrap">
          {Object.entries(MESES_ANUALES).map(([n, label]) => (
            <label key={n} className="sv-to-chip">
              <input type="checkbox" checked={mananas.meses.includes(Number(n))}
                onChange={() => setMananas({ meses: toggleIn(mananas.meses, Number(n)) })} />
              {label}
            </label>
          ))}
        </div>
      )}
      {cerrado && (
        <>
          <div className="sv-to-form">
            <label className="sv-to-inline">
              % de alumnos que se pasa a la tarde (no se pierden)
              <input type="range" min="0" max="100" value={mananas.pctTarde}
                onChange={e => setMananas({ pctTarde: num(e.target.value) })} />
              {mananas.pctTarde} %
            </label>
            <label className="sv-to-inline">
              Gasto de sala por la mañana que se ahorra
              <input className="sv-tests-input sv-tests-input--num" type="number" min="0" value={mananas.gastoSala}
                onChange={e => update({ mananas: { ...mananas, gastoSala: num(e.target.value) } })} />
              €/mes
            </label>
          </div>
          {Object.keys(horas).length > 0 && (
            <div className="sv-to-form">
              <span className="sv-to-inline">Si se cierra, cada persona que da clase por la mañana:</span>
              {Object.keys(horas).map(p => (
                <label key={p} className="sv-to-inline" style={{ color: PROF_META[p]?.color }}>
                  {p} ({horas[p]} h/sem de mañana)
                  <select className="sv-tests-select" value={mananas.disposicion?.[p] || 'tarde'}
                    onChange={e => setMananas({ disposicion: { ...mananas.disposicion, [p]: e.target.value } })}>
                    {Object.entries(MANANAS_DISPOSICION).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
              ))}
              <span className="sv-ot-muted sv-to-small">La decisión laboral es de Ramiro; esto solo pone números.</span>
            </div>
          )}
          <MananasCuentas mananas={mananas} costes={costes} clases={clases} horas={horas} />
        </>
      )}
    </>
  )
}

function MananasCuentas({ mananas, costes, clases, horas }) {
  const ingresosManana = useMemo(() => ingresosMananaDeClases(clases, mananas.corteHora), [clases, mananas.corteHora])
  const ctx = { ingresosManana, coste: costes.mes, horasManana: horas }
  const r = useMemo(() => cuentasMananas(mananas, ctx), [mananas, ingresosManana, costes.mes, horas])
  const eq = useMemo(() => equilibrioManana(mananas, ctx), [mananas, ingresosManana, costes.mes, horas])
  const cls = n => (n > 0 ? 'sv-to-good' : n < 0 ? 'sv-to-bad' : '')
  if (!r.cerrados.length) return null
  const lineas = [
    [`Ingresos de mañana que se pierden (de ${r.alumnosManana} alumnos, ${mananas.pctTarde}% se pasa a la tarde)`, -r.perdidaNeta],
    r.ahorroPersonal > 0 && ['Personal que no trabaja esa mañana', r.ahorroPersonal],
    r.ahorroSala > 0 && ['Gasto de sala', r.ahorroSala],
  ].filter(Boolean)
  return (
    <div className="sv-to-money">
      <div className={`sv-to-money__total ${cls(r.resultadoMes)}`}>
        Mañanas {r.resultadoMes >= 0 ? 'compensa' : 'no compensa'}: <strong>{signo(r.resultadoMes)}/mes</strong> en los {r.cerrados.length} {r.cerrados.length === 1 ? 'mes cerrado' : 'meses cerrados'}
        {' '}({signo(r.resultadoAnio)}/año)
      </div>
      <ul className="sv-to-money__lines">
        {lineas.map(([txt, n]) => (
          <li key={txt}><span>{txt}</span><span className={n > 0 ? 'sv-to-good' : n < 0 ? 'sv-to-bad' : ''}>{signo(n)}</span></li>
        ))}
      </ul>
      {ingresosManana.ingresos === 0 && (
        <p className="sv-to-warn-txt sv-to-small">No se han encontrado ingresos reales de clases de mañana (revisa la conexión con la tienda).</p>
      )}
      <p className="sv-note sv-to-small">
        {eq != null && eq > 0
          ? <>A partir de que un <strong>{eq}%</strong> de los alumnos de mañana se pase a la tarde, cerrar compensa con este ahorro.</>
          : <>Con este ahorro, cerrar compensa aunque nadie se pase a la tarde.</>}
      </p>
    </div>
  )
}

// Un recuadro por indicador, en rojo (o ámbar) si pasa de 0
function KpiBox({ value, label, malo = 'bad' }) {
  const color = value > 0 ? (malo === 'warn' ? '#f5c842' : '#f87171') : '#34d399'
  return (
    <div className="sv-kpi sv-to-kpi" style={{ '--kpi-color': color }}>
      <span className="sv-kpi__value">{value}</span>
      <span className="sv-kpi__label">{label}</span>
    </div>
  )
}

function Indicadores({ ev }) {
  const sinAbrirResto = ev.allSim.filter(d => !isSummer(d.date) && !d.closed && d.sinAbrir && d.out.length).length
  return (
    <div className="sv-kpis sv-to-kpis">
      <KpiBox value={ev.sinAbrirVer.length} label="Días sin abrir (verano)" />
      <KpiBox value={ev.kpi.perdVer} label="Clases sin profe (verano)" />
      <KpiBox value={ev.diasComodin.length} label={`Días con ${COMODIN_VERANO} en clase (verano)`} malo="warn" />
      <KpiBox value={sinAbrirResto} label="Días sin abrir (resto del año)" />
      <KpiBox value={ev.kpi.perdidas} label="Clases sin cubrir (resto del año)" malo="warn" />
      <KpiBox value={ev.kpi.choques} label="Días con choque" />
    </div>
  )
}

// Dinero del verano frente a hoy, con signo y una línea por concepto (solo simulador)
function Dinero({ ev, state }) {
  const { eco } = ev
  const cerrados = ev.mesesCerradosList
  const perdidas = cerrados.reduce((n, m) => n + (state.ingresosSala?.[m] || 0), 0)
  const ahorrados = cerrados.reduce((n, m) => n + (state.gastosSala?.[m] || 0), 0)
  const lineas = [
    eco.personal !== 0 && ['Sueldos de los meses en paro (frente a hoy)', eco.personal],
    cerrados.length > 0 && [`Ventas que se pierden al cerrar ${cerrados.map(m => MES_LABEL[m].toLowerCase()).join(' y ')}`, -perdidas],
    cerrados.length > 0 && ['Gastos de la sala que se ahorran', ahorrados],
    eco.campRes.semanas > 0 && ['Campamento: lo que pagan las familias', eco.campRes.ingresos],
    eco.campRes.semanas > 0 && ['Campamento: monitores, seguro, material y comida', -eco.campRes.costes],
  ].filter(Boolean)
  return (
    <div className="sv-to-money">
      <div className={`sv-to-money__total ${eco.balance > 0 ? 'sv-to-good' : eco.balance < 0 ? 'sv-to-bad' : ''}`}>
        Resultado del verano frente a hoy: <strong>{signo(eco.balance)}</strong>
        {eco.balance > 0 ? ' (mejor)' : eco.balance < 0 ? ' (peor)' : ' (igual)'}
      </div>
      {lineas.length > 0 && (
        <ul className="sv-to-money__lines">
          {lineas.map(([txt, n]) => (
            <li key={txt}><span>{txt}</span><span className={n > 0 ? 'sv-to-good' : n < 0 ? 'sv-to-bad' : ''}>{signo(n)}</span></li>
          ))}
        </ul>
      )}
      {cerrados.length > 0 && perdidas === 0 && (
        <p className="sv-to-warn-txt sv-to-small">Las ventas perdidas están a 0: el cierre parece gratis. Rellénalas o usa las medias del histórico.</p>
      )}
      {eco.diasOciosos > 0 && (
        <p className="sv-ot-muted sv-to-small">
          {eco.diasOciosos} días de cierre se pagan sin trabajar (≈ {eur(eco.ociosos)} de sueldo). No es un coste extra: con la
          sala abierta ese sueldo se paga igual; lo que se pierde al cerrar son las ventas.
        </p>
      )}
    </div>
  )
}

// Avisos en tres grupos: lo que impide el plan, lo que necesita acuerdo y lo que hay que revisar
function AvisosAgrupados({ ev }) {
  const bloquea = ev.warnings.filter(w => w.lvl === 'bad')
  const acuerdo = ev.acuerdos.filter(a => !a.registrado)
  const abrir = ev.warnings.filter(w => w.abrir)
  const revisar = [...ev.warnings.filter(w => w.lvl !== 'bad' && !w.abrir), ...ev.acuerdos.filter(a => a.registrado).map(a => ({ lvl: 'info', text: `${a.p}: ${a.motivo}` }))]
  const grupo = (titulo, cls, items, render, abierto) => items.length > 0 && (
    <details className={`sv-to-group sv-to-group--${cls}`} open={abierto}>
      <summary>{titulo} <span className="sv-to-count">{items.length}</span></summary>
      <ul>{items.map(render)}</ul>
    </details>
  )
  if (!bloquea.length && !acuerdo.length && !abrir.length && !revisar.length) {
    return <p className="sv-to-good">Sin avisos: el plan cumple el convenio y la sala queda cubierta.</p>
  }
  return (
    <div className="sv-to-groups">
      {grupo('🔴 Lo impide', 'bad', bloquea, (w, i) => <li key={i}>{w.text}</li>, true)}
      {grupo('🟠 Necesita el acuerdo de la persona', 'acuerdo', acuerdo, (a, i) => <li key={i}><strong>{a.p}</strong>: {a.motivo}</li>, true)}
      {grupo('🟠 Hay que decidir quién abre', 'acuerdo', abrir, (w, i) => <li key={i}>{w.text}</li>, true)}
      {grupo('⚪ Para revisar', 'revisar', revisar, (w, i) => <li key={i} className={w.lvl === 'info' ? 'sv-ot-muted' : ''}>{w.text}</li>, false)}
    </div>
  )
}

// Veredicto del supuesto en una frase, en verde, ámbar o rojo
function Veredicto({ ev, nombre }) {
  const bloquea = ev.warnings.filter(w => w.lvl === 'bad')
  const acuerdo = [...new Set(ev.acuerdos.filter(a => !a.registrado).map(a => a.p))]
  const revisar = ev.warnings.filter(w => w.lvl === 'warn' && !w.abrir).length
  // Días en que falta quien abre siempre: no se arreglan moviendo vacaciones, pero la sala no
  // está cubierta hasta que alguien con llave se encargue
  const sinQuienAbra = ev.warnings.reduce((n, w) => n + (w.abrir || 0), 0)
  const nivel = bloquea.length ? 'rojo' : acuerdo.length || sinQuienAbra ? 'ambar' : 'verde'
  const b = ev.eco.balance
  const perdidas = ev.kpi.perdidas
  const cr = ev.eco.campRes
  const campSinDatos = cr.c.activo && cr.semanas > 0 && !cr.ingresos
  const estadoMes = m => `${ev.mesesCerradosList.includes(m) ? 'cerrado' : 'abierto'}${cr.porMes[m].semanas ? ' + campamento' : ''}`
  const cls = n => (n > 0 ? 'sv-to-good' : n < 0 ? 'sv-to-bad' : '')
  return (
    <div className={`sv-to-verdict sv-to-verdict--${nivel}`}>
      <div className="sv-to-verdict__name">{nombre}</div>
      <div className="sv-to-verdict__text">
        {b > 0 ? <>Ahorra <strong>{eur(b)}/año</strong> frente a hoy.</> : b < 0 ? <>Cuesta <strong>{eur(-b)}/año</strong> más que hoy.</> : <>Mismo dinero que hoy.</>}
        {' '}{acuerdo.length
          ? <>Necesita el acuerdo de <strong>{acuerdo.length} {acuerdo.length === 1 ? 'persona' : 'personas'}</strong> ({acuerdo.join(', ')}).</>
          : <>No necesita acuerdos.</>}
        {' '}{bloquea.length
          ? <><strong>{bloquea.length} {bloquea.length === 1 ? 'problema lo impide' : 'problemas lo impiden'}</strong>: {bloquea[0].text}</>
          : sinQuienAbra
            ? <>Cumple el convenio, pero <strong>{sinQuienAbra} {sinQuienAbra === 1 ? 'día' : 'días'} no hay quien abra</strong> (falta quien abre siempre): hay que decidir quién abre.</>
            : perdidas > 0 ? <>Cumple el convenio y siempre hay quien abra.</> : <>La sala queda cubierta y cumple el convenio.</>}
        {perdidas > 0 && <> Fuera del verano, <strong>{perdidas} clases se quedan sin profe</strong> los días que falta alguien y nadie que ya trabaje ese día puede sustituirle.</>}
        {campSinDatos && <> <strong className="sv-to-warn-txt">Falta poner la demanda y el precio del campamento:</strong> el resultado no cuenta lo que ingresaría.</>}
        {revisar > 0 && <span className="sv-ot-muted"> {revisar} {revisar === 1 ? 'cosa' : 'cosas'} para revisar.</span>}
      </div>
      <div className="sv-to-verdict__months">
        {[7, 8].map(m => (
          <span key={m}>{MES_LABEL[m]} ({estadoMes(m)}): <strong className={cls(ev.eco.mes(m))}>{signo(ev.eco.mes(m))}</strong></span>
        ))}
        <span className="sv-ot-muted">frente a hoy</span>
      </div>
    </div>
  )
}

// Tabla por persona. En lo real, «Aprobadas»; en el simulador, las del plan.
function PersonasTabla({ ev, state, update, costes, conDinero, etiquetaVacaciones }) {
  const { paro, keys, dias } = state
  const cierreExtra = state.cierreExtra || 'pagados'
  const y = ev.y
  const setPacto = (p, v) => update({ pactoVerano: { ...(state.pactoVerano || {}), [p]: v } })
  return (
    <>
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th title="Qué meses de verano no trabaja (fijo discontinuo)">Paro en verano</th>
              <th title="Puede abrir y cerrar la sala">Llave</th>
              <th title="Días de vacaciones al año por convenio (23). Cámbialo solo si alguien tiene otro acuerdo.">Días convenio ⓘ</th>
              <th title="Días por convenio menos la parte de los meses en paro (21 si para un mes, 19 si para dos)">Le tocan {y} ⓘ</th>
              <th title={`Bloque más largo de días seguidos entre junio y septiembre; el convenio pide ${BLOQUE_VERANO}`}>Bloque jun–sep ⓘ</th>
              <th title="Tramos de vacaciones en el año; el convenio prevé 3 como mucho (el de verano y dos de al menos 3 días)">Bloques ⓘ</th>
              <th title={etiquetaVacaciones === 'Aprobadas' ? 'Días de vacaciones aprobados (y los del cierre de la sala)' : 'Días de vacaciones del plan (y los del cierre de la sala)'}>{etiquetaVacaciones} ⓘ</th>
              <th title="Le tocan menos vacaciones">Le quedan ⓘ</th>
              {conDinero && <><th>Coste empresa/mes</th><th title="Sueldo que se ahorra (o se gasta de más) por los meses de paro frente a hoy">Ahorro/año ⓘ</th></>}
            </tr>
          </thead>
          <tbody>
            {ev.rows.map(r => (
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
                <td><input type="checkbox" checked={keys.includes(r.p)} onChange={() => update({ keys: toggleIn(keys, r.p) })} /></td>
                <td>
                  <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" max="40" value={dias[r.p]}
                    onChange={e => update({ dias: { ...dias, [r.p]: num(e.target.value) } })} />
                </td>
                <td>{r.dev}</td>
                <td className={r.bloqueVerano >= BLOQUE_VERANO ? 'sv-to-good' : r.pactado ? 'sv-ot-muted' : r.nParo ? 'sv-to-warn-txt' : 'sv-to-bad'}>
                  {r.bloqueVerano >= BLOQUE_VERANO ? '✓' : r.pactado ? 'pactado' : '✗'} {r.bloqueVerano}/{BLOQUE_VERANO}
                  {r.bloqueVerano < BLOQUE_VERANO && (
                    <label className="sv-to-pacto" title="Marca si se ha pactado con la persona que este año no tenga el bloque de 15 en verano">
                      <input type="checkbox" checked={!!r.pactoVerano} onChange={e => setPacto(r.p, e.target.checked)} /> pactado
                    </label>
                  )}
                </td>
                <td className={(r.bloques > MAX_BLOQUES || r.bloquesCortos) && !r.acuerdoPeriodo ? 'sv-to-warn-txt' : ''}>{r.bloques}</td>
                <td>
                  {r.usados}
                  {(r.cierreConv > 0 || r.cierreExtra > 0) && (
                    <span className="sv-ot-muted"> ({r.cierreConv} cierre{r.cierreExtra ? ` + ${r.cierreExtra} ${cierreExtra === 'pagados' ? 'pagados' : 'descontados'}` : ''})</span>
                  )}
                </td>
                <td className={r.restan < 0 ? 'sv-to-bad' : ''}>{r.restan}</td>
                {conDinero && (
                  <>
                    <td title={costes.nomina[r.p]
                      ? `Nómina ${eur(costes.nomina[r.p].banco)}${costes.nomina[r.p].efectivo ? ` + efectivo ${eur(costes.nomina[r.p].efectivo)}` : ''} · ficha ${eur(costes.ficha[r.p])}`
                      : 'Coste de la ficha (marzo 2026)'}>
                      {eur(costes.mes[r.p])}{!costes.nomina[r.p] && <span className="sv-ot-muted"> *</span>}
                    </td>
                    <td className={r.ahorro > 0 ? 'sv-to-good' : r.ahorro < 0 ? 'sv-to-bad' : 'sv-ot-muted'}>{r.ahorro ? signo(r.ahorro) : '—'}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {conDinero && (
        <p className="sv-note sv-to-small">
          {costes.loading ? 'Cargando nóminas de Superadmin…'
            : costes.conNomina
              ? `Coste empresa estimado con las nóminas de Superadmin (${costes.month}): nómina × ${String(FACTOR_COSTE).replace('.', ',')} + lo que se paga en efectivo.`
              : `No se pudieron leer las nóminas de Superadmin${costes.error ? ` (${costes.error})` : ''}: se usa el coste empresa de la ficha de marzo de 2026.`}
          {costes.conNomina && PROF_ORDER.some(p => !costes.nomina[p]) && ' * Sin nómina en Superadmin: dato de la ficha.'}
        </p>
      )}
    </>
  )
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Calendario día a día con cobertura, choques y quién abre y cierra
function Calendario({ ev, titulo }) {
  const y = ev.y
  const { ctx, conflictsOf } = ev
  const camp = ctx.camp
  const WINDOWS = {
    verano:  { label: `Verano ${y} (jun–sep)`, from: `${y}-06-01`, to: `${y}-09-30` },
    navidad: { label: `Navidad ${y}/${String(y + 1).slice(2)}`, from: `${y}-12-01`, to: `${y + 1}-01-10` },
    anio:    { label: `Año ${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
  }
  const [win, setWin] = useState('verano')
  const [selDate, setSelDate] = useState(null)
  const detailRef = useRef(null)
  const dates = useMemo(() => laborablesBetween(WINDOWS[win].from, WINDOWS[win].to), [win, y])
  const sim   = useMemo(() => simulatePlan(dates, ctx), [dates, ctx])
  const selDay = sim.find(d => d.date === selDate)
  useEffect(() => { if (selDate) detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [selDate])

  // Cabecera de meses: columnas seguidas del mismo mes
  const meses = []
  sim.forEach(d => {
    const k = d.date.slice(0, 7)
    const last = meses[meses.length - 1]
    if (last && last.k === k) last.n++
    else meses.push({ k, n: 1 })
  })

  return (
    <>
      <h4 className="sv-to-subtitle">{titulo}</h4>
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
              {meses.map(m => (
                <th key={m.k} colSpan={m.n} className="sv-to-tl-month">{MES_CORTO[Number(m.k.slice(5)) - 1]} {m.k.slice(2, 4)}</th>
              ))}
            </tr>
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
      <p className="sv-note sv-to-small">
        Pulsa un día para ver el detalle. Color: vacaciones (más tenue si es cierre de la sala). Gris rayado: en paro.
        Recuadro blanco: lleva el campamento. Solo se cuentan días laborables; los festivos salen de 9to5 (sin conexión,
        solo los nacionales de Navidad y el 15 de agosto).
      </p>

      {selDay && (
        <div className="sv-class-detail" ref={detailRef}>
          <div className="sv-class-detail__title">
            {DAY_LABEL[weekdayOf(selDay.date)]} {fmtShort(selDay.date)} · {selDay.closed ? 'sala cerrada' : isSummer(selDay.date) ? 'horario de verano' : 'horario normal'}
            <button className="sv-tests-remove" style={{ marginLeft: 8 }} onClick={() => setSelDate(null)}>✕</button>
          </div>
          {(() => {
            const enParo = PROF_ORDER.filter(p => !disponible(p, selDay.date, ctx))
            return enParo.length > 0 && <ul className="sv-to-detail"><li className="sv-ot-muted">En paro: {enParo.join(', ')}</li></ul>
          })()}
          {selDay.closed ? (
            <ul className="sv-to-detail">
              <li>Vacaciones de todos los que trabajan ese mes (los primeros {BLOQUE_VERANO} días del cierre son el bloque del convenio).</li>
              {selDay.camp && <li>Campamento: {camp.staff.filter(p => disponible(p, selDay.date, ctx)).join(', ') || <span className="sv-to-bad">nadie</span>}</li>}
            </ul>
          ) : (
            <ul className="sv-to-detail">
              <li>De vacaciones: {selDay.out.length ? selDay.out.join(', ') : 'nadie'}</li>
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
    </>
  )
}

// ─── Vacaciones: lo real ─────────────────────────────────────────────────────
// La configuración real (paro, llaves, días, cierre) y las vacaciones aprobadas del año
// que se está viendo. Es contra lo que se comprueban y aprueban las solicitudes.
function VacacionesReales({ real, setReal, ev }) {
  const update = patch => setReal(s => ({ ...s, ...patch }))
  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Configuración real y calendario de {ev.y}</h3>
      <p className="sv-note">
        Aquí solo cuentan las vacaciones <strong>aprobadas</strong> y la configuración real. Es lo que se usa para comprobar
        las solicitudes. Para probar otras opciones, usa el Simulador: lo que hagas allí no cambia nada de aquí.
      </p>
      <ConfigVerano state={real} update={update} ev={ev} conDinero={false} />
      <Indicadores ev={ev} />
      <AvisosAgrupados ev={ev} />
      <PersonasTabla ev={ev} state={real} update={update} conDinero={false} etiquetaVacaciones="Aprobadas" />
      <Calendario ev={ev} titulo="Calendario de vacaciones aprobadas" />
    </div>
  )
}

// ─── Simulador ───────────────────────────────────────────────────────────────
function Paso({ n, titulo, children, nota }) {
  return (
    <div className="sv-to-step">
      <h4 className="sv-to-step__title"><span className="sv-to-step__n">{n}</span>{titulo}</h4>
      {nota && <p className="sv-note sv-to-small">{nota}</p>}
      {children}
    </div>
  )
}

function Calculadora({ state, setState, costes, clases, ev, sugerido, onDesdeReal, onGuardarAnterior }) {
  const y = ev.y
  const { paro, keys, periods, cierre } = state
  const update = patch => setState(s => ({ ...s, ...patch }))
  const setPeriod = (id, patch) => update({ periods: periods.map(x => (x.id === id ? { ...x, ...patch } : x)) })

  const activo = state.preset ? PRESETS.find(([id]) => id === state.preset.id) : null
  const modificado = activo && state.preset.firma !== firmaPlan(state)
  const nombre = activo ? `${activo[1]}${modificado ? ' (modificado)' : ''}` : 'Plan propio'

  // Si el plan actual no es un supuesto sin tocar, se guarda antes como «Plan anterior»
  const aplicarPreset = async id => {
    const label = PRESETS.find(([k]) => k === id)[1]
    if ((!activo || modificado) && periods.some(p => p.start?.startsWith(`${y}-`))) {
      if (!window.confirm(`¿Cargar «${label}»? Sustituye el plan actual («${nombre}»), que se guardará antes como «Plan anterior».`)) return
      await onGuardarAnterior()
    }
    const st = conReparto(rellenarCierre({ ...state, ...presetPlan(id, y), pactoVerano: {} }, sugerido))
    setState({ ...st, preset: { id, firma: firmaPlan(st) } })
  }
  const aplicarParo = p => setState(s => conReparto({ ...s, paro: p }))

  return (
    <div className="sv-section sv-to-sim">
      <h3 className="sv-section-title">Simulador de supuestos</h3>
      <p className="sv-note sv-to-small">
        Un plan de prueba para decidir quién pasa a paro, si se cierra en verano o cómo se reparten las vacaciones. No toca lo real.
      </p>

      <Veredicto ev={ev} nombre={nombre} />

      <Paso n="1" titulo="Año y punto de partida"
        nota="Elige un supuesto: se carga su configuración y se reparten las vacaciones automáticamente. Después puedes tocar lo que quieras.">
        <div className="sv-to-form">
          <YearSelector y={y} onChange={yr => update({ year: yr })} />
          <button className="sv-filter-btn" onClick={onDesdeReal}>Empezar desde lo real</button>
        </div>
        <div className="sv-filter-group sv-to-wrap">
          {PRESETS.map(([id, label]) => (
            <button key={id} className={`sv-filter-btn${state.preset?.id === id ? ' sv-filter-btn--active' : ''}`} onClick={() => aplicarPreset(id)}>
              {label}{state.preset?.id === id && modificado ? ' · modificado' : ''}
            </button>
          ))}
        </div>
      </Paso>

      <Paso n="2" titulo="Verano: sala y paro"
        nota="Si cierras, las ventas que se pierden y los gastos que se ahorran se rellenan con la media del histórico.">
        <ConfigVerano state={state} update={update} ev={ev} conDinero sugerido={sugerido} />
        <PersonasTabla ev={ev} state={state} update={update} costes={costes} conDinero etiquetaVacaciones="Vacaciones" />
        <ExploradorParo paro={paro} cierre={cierre} keys={keys} coste={costes.mes} onApply={aplicarParo} />
      </Paso>

      <Paso n="3" titulo="Mañanas"
        nota="Cerrar antes de la hora de corte en los meses elegidos. Los ingresos de mañana son los reales de las clases con suscripción (de la tienda), no una cifra fija.">
        <ConfigMananas state={state} update={update} costes={costes} clases={clases} />
      </Paso>

      <Paso n="4" titulo="Vacaciones"
        nota="«Repartir vacaciones» coloca a cada uno su bloque de 15 en verano (si el cierre no se lo da) y el resto en Navidad y primavera, buscando las fechas con menos choques y con los menos días sin quien abra posibles (si está fuera quien abre ese día, hay que decidir quién abre).">
        <div className="sv-to-form">
          <button className="sv-tests-add" onClick={() => setState(s => conReparto(s))}>Repartir vacaciones automáticamente</button>
          <button className="sv-filter-btn" onClick={() => update({ periods: [...periods, period(PROF_ORDER[0], `${y}-06-01`, 5)] })}>+ Añadir periodo a mano</button>
        </div>
        <details className="sv-to-fold">
          <summary>Periodos simulados ({periods.filter(p => p.start?.startsWith(`${y}-`)).length} en {y})</summary>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead><tr><th>Persona</th><th>Desde</th><th>Días laborables</th><th>Hasta</th><th title="Cuándo se le diría a la persona (2 meses de antelación)">Comunicado ⓘ</th><th title="Pactado con la persona: vale aunque no cumpla la antelación, los bloques o el día de inicio">Acuerdo expreso ⓘ</th><th>Nota</th><th></th></tr></thead>
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
                      <td><input className="sv-tests-input" type="date" lang="es" value={x.start} onChange={e => setPeriod(x.id, { start: e.target.value })} /></td>
                      <td>
                        <input className="sv-tests-input sv-tests-input--unit" type="number" min="1" max="40" value={x.n}
                          onChange={e => setPeriod(x.id, { n: num(e.target.value, 1) })} />
                      </td>
                      <td className="sv-ot-muted">{ds.length ? fmtShort(ds[ds.length - 1]) : ''}</td>
                      <td>
                        <input className={`sv-tests-input${ev.antelacion.some(a => a.p === x.prof && a.start === x.start) ? ' sv-to-input--bad' : ''}`}
                          type="date" lang="es" value={x.comunicado || ''}
                          onChange={e => setPeriod(x.id, { comunicado: e.target.value })} />
                      </td>
                      <td><input type="checkbox" checked={!!x.acuerdo} onChange={() => setPeriod(x.id, { acuerdo: !x.acuerdo })} /></td>
                      <td>
                        <input className="sv-tests-input sv-tests-input--desc" value={x.nota || ''} maxLength={120} placeholder="—"
                          onChange={e => setPeriod(x.id, { nota: e.target.value })} />
                      </td>
                      <td><button className="sv-tests-remove" onClick={() => update({ periods: periods.filter(p => p.id !== x.id) })}>✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
        <Calendario ev={ev} titulo="Calendario del supuesto" />
      </Paso>

      <Paso n="5" titulo="Resultado">
        <Dinero ev={ev} state={state} />
        <Indicadores ev={ev} />
        <AvisosAgrupados ev={ev} />
        <p className="sv-note sv-to-small">
          Pasar a fijo discontinuo requiere que la persona firme el cambio de contrato y el paro depende de lo que haya
          cotizado: confirmarlo con la gestoría antes de proponerlo.
        </p>
      </Paso>
    </div>
  )
}

// ─── Guardado ────────────────────────────────────────────────────────────────
// Estado de guardado: cargando | guardado | guardando | error | sin-servidor
function SyncStatus({ sync, que }) {
  const Que = `${que[0].toUpperCase()}${que.slice(1)}`
  const txt = {
    cargando:       'Cargando de la app…',
    guardando:      `Guardando ${que}…`,
    guardado:       sync.meta ? `${Que} guardado en la app${sync.meta.by ? ` · ${sync.meta.by}` : ''} · ${sync.meta.updated_at?.slice(0, 16).replace(' ', ' a las ')}` : `${Que} guardado en la app`,
    error:          `No se pudo guardar ${que}: ${sync.msg}`,
    'sin-servidor': `Sin conexión con el servidor (${sync.msg}): los cambios no se guardan.`,
  }[sync.status]
  return <p className={`sv-to-sync${sync.status === 'error' || sync.status === 'sin-servidor' ? ' sv-error' : ''}`}>{txt}</p>
}

// Carga un estado del servidor (o el inicial) y lo guarda solo 1,5 s después de cada cambio
function useServerState(remote, { field, metaField, hydrateFn, initial, save, fromBefore }) {
  const [state, setState] = useState(initial)
  const [sync, setSync]   = useState({ status: 'cargando' })
  const loaded    = useRef(false)
  const lastSaved = useRef(null)

  useEffect(() => {
    if (loaded.current || remote.loading) return
    if (remote.error) { setSync({ status: 'sin-servidor', msg: remote.error }); return }
    loaded.current = true
    const stored = remote.data?.[field]
    if (stored) {
      const st = hydrateFn(stored)
      lastSaved.current = JSON.stringify(toPlain(st))
      setState(st)
      setSync({ status: 'guardado', meta: remote.data[metaField] })
    } else {
      // Primer guardado: lo que haya de antes o el inicial
      const prev = fromBefore?.()
      setState(prev ? hydrateFn(prev) : st => ({ ...st }))
      setSync({ status: 'guardando' })
    }
  }, [remote.loading, remote.error, remote.data])

  useEffect(() => {
    if (!loaded.current) return
    const json = JSON.stringify(toPlain(state))
    if (json === lastSaved.current) return
    setSync({ status: 'guardando' })
    const t = setTimeout(() => {
      save(JSON.parse(json))
        .then(meta => { lastSaved.current = json; setSync({ status: 'guardado', meta }) })
        .catch(e => setSync({ status: 'error', msg: e.message }))
    }, 1500)
    return () => clearTimeout(t)
  }, [state])

  return [state, setState, sync]
}

// Configuración real por defecto: la de hoy, sin periodos (las vacaciones reales son las
// aprobadas) y sin año: el año que se ve es de cada uno y no se guarda
function defaultReal() {
  const { year, preset, ...d } = defaultState()
  return { ...d, cierre: 'abierto', cierreExtra: 'pagados', periods: [] }
}

function hydrateReal(plain) {
  const { year, ...rest } = plain
  return { ...defaultReal(), ...rest, camp: normalizeCamp(rest.camp), mananas: normalizeMananas(rest.mananas), periods: [] }
}

// Simulador sin plan guardado: «Hoy» con las vacaciones ya repartidas
function planInicial() {
  const st = conReparto(defaultState())
  return { ...st, preset: { id: 'hoy', firma: firmaPlan(st) } }
}

// Año que se ve en Vacaciones: de cada navegador, por defecto el año en curso
const ANIO_KEY = 'blokes.timeoff.anioVista'
function anioVistaInicial() {
  try {
    const v = Number(localStorage.getItem(ANIO_KEY))
    if (v >= 2024 && v <= 2100) return v
  } catch { /* sin almacenamiento */ }
  return new Date().getFullYear()
}

// Si algo del simulador falla, se avisa en su sitio en vez de dejar la pestaña en blanco
class FalloSeguro extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('Simulador:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="sv-section">
        <p className="sv-error">Algo ha fallado en {this.props.que}: {String(this.state.error.message || this.state.error)}</p>
        <button className="sv-filter-btn" onClick={() => this.setState({ error: null })}>Volver a intentarlo</button>
      </div>
    )
  }
}

export default function TimeOffTab() {
  const [vista, setVista] = useState('real')
  const [anio, setAnioState] = useState(anioVistaInicial)
  const setAnio = yr => {
    setAnioState(yr)
    try { localStorage.setItem(ANIO_KEY, String(yr)) } catch { /* sin almacenamiento */ }
  }
  const costes = useCostes()
  const hist   = useHistoricoMeses()
  const remote = useTimeOffData()
  const clasesReal = useClases(vista === 'sim')

  const [real, setReal, syncReal] = useServerState(remote, {
    field: 'real', metaField: 'real_meta', hydrateFn: hydrateReal, initial: defaultReal(), save: saveReal,
  })
  const [sim, setSim, syncSim] = useServerState(remote, {
    field: 'plan', metaField: 'plan_meta', hydrateFn: hydrate,
    initial: planInicial, save: savePlan, fromBefore: legacyLocalPlan,
  })

  const nueve     = remote.data?.nueve || null
  // Las de 9to5 traen el nombre completo: se casan con la persona del equipo
  const requests  = useMemo(() => (remote.data?.requests || []).map(r =>
    (PROF_ORDER.includes(r.person) ? r : { ...r, person: matchPerson(r.person) || r.person })), [remote.data?.requests])
  const scenarios = remote.data?.scenarios || []
  const setNueve  = res => remote.setData(d => ({ ...d, nueve: res.nueve ?? d.nueve, requests: res.requests ?? d.requests }))
  const setRequests  = list => remote.setData(d => ({ ...d, requests: list }))
  const setScenarios = list => remote.setData(d => ({ ...d, scenarios: typeof list === 'function' ? list(d.scenarios || []) : list }))
  const connected = !!remote.data && !remote.error
  const cargando  = remote.loading && !remote.data

  // Al abrir la pestaña, traer lo nuevo de 9to5 si hace más de 10 minutos de la última vez
  const autoSynced = useRef(false)
  useEffect(() => {
    if (autoSynced.current || !nueve?.configured) return
    autoSynced.current = true
    const last = nueve.last_sync ? new Date(nueve.last_sync).getTime() : 0
    if (Date.now() - last < 10 * 60 * 1000) return
    syncNueve(false).then(setNueve).catch(() => { /* el error queda en last_error */ })
  }, [nueve?.configured])

  // Festivos de 9to5 (los que no se trabajan); sin conexión, la lista básica
  const festivosKey = useMemo(() => {
    const list = (nueve?.holidays || []).filter(h => !h.workable).map(h => h.date)
    setFestivos(list)
    return list.join()
  }, [nueve?.holidays])

  // Lo real del año que se ve (y del siguiente, para el resumen); el simulador, sin solicitudes
  const realAnio = useMemo(() => ({ ...real, year: anio }), [real, anio])
  const evReal = useMemo(() => evaluarPlan(realAnio, costes.mes, requests), [realAnio, costes.mes, requests, festivosKey])
  const evRealSig = useMemo(() => evaluarPlan({ ...real, year: anio + 1 }, costes.mes, requests), [real, anio, costes.mes, requests, festivosKey])
  const evSim  = useMemo(() => evaluarPlan(sim, costes.mes, []), [sim, costes.mes, festivosKey])
  const sugerido = useMemo(() => sugeridoHistorico(hist.months), [hist.months])

  // Saldo de vacaciones de 9to5 por persona del equipo, para un año
  const saldosDe = y => {
    const list = nueve?.balances?.[y]
    if (!list) return null
    const emps = Object.fromEntries((nueve.employees || []).map(e => [e.id, e]))
    const res = {}
    list.forEach(b => {
      const p = emps[b.employee_id] && personaDeEmpleado(emps[b.employee_id], nueve.employee_map)
      if (p) res[p] = b
    })
    return res
  }
  const saldosResumen = useMemo(() => ({ [anio]: saldosDe(anio), [anio + 1]: saldosDe(anio + 1) }), [nueve, anio])

  const desdeReal = () => {
    if (!window.confirm('¿Sustituir el plan del simulador por lo real (configuración y vacaciones aprobadas)?')) return
    const aprobadas = requests.filter(r => r.status === 'aprobada' && PROF_ORDER.includes(r.person))
      .map(r => period(r.person, r.from, laborablesBetween(r.from, r.to).length,
        { acuerdo: false, comunicado: (r.created_at || '').slice(0, 10) || todayISO(), nota: 'Aprobada' }))
    const { periods: _p, ...conf } = real
    setSim(s => ({ ...s, ...conf, year: anio, periods: aprobadas, preset: null }))
  }
  const usarEnReal = () => {
    if (!window.confirm('¿Aplicar a lo real la configuración del simulador (paro, llaves, días, pactos y modo de verano)? Las vacaciones aprobadas no cambian.')) return
    const { paro, keys, dias, cierre, cierreExtra, camp, pactoVerano } = sim
    setReal(r => ({ ...r, paro, keys, dias, cierre, cierreExtra, camp, pactoVerano }))
    setVista('real')
  }
  // Cargar un escenario guardado: antes se guarda el plan actual para no perderlo
  const guardarAnterior = async () => {
    try {
      const sello = new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const guardado = await addScenario(`Plan anterior (${sello})`, toPlain(sim))
      setScenarios(s => [...s, guardado])
    } catch { /* si no se puede guardar, se carga igual */ }
  }
  const cargarEscenario = async sc => {
    if (!window.confirm(`¿Cargar «${sc.name}»? El plan actual se guardará antes como «Plan anterior».`)) return
    await guardarAnterior()
    setSim(hydrate(sc.state))
  }

  const ctxReal = { paro: real.paro, cierre: real.cierre, year: anio }

  return (
    <div className="sv-tab-panel sv-to-root">
      <div className="sv-to-subtabs">
        <button className={`sv-to-subtab${vista === 'real' ? ' sv-to-subtab--active' : ''}`} onClick={() => setVista('real')}>
          Vacaciones <span className="sv-ot-muted">lo real</span>
        </button>
        <button className={`sv-to-subtab sv-to-subtab--sim${vista === 'sim' ? ' sv-to-subtab--active' : ''}`} onClick={() => setVista('sim')}>
          Simulador <span className="sv-ot-muted">supuestos</span>
        </button>
      </div>

      {cargando ? (
        <p className="sv-loading">Cargando vacaciones, solicitudes y conexión con 9to5…</p>
      ) : vista === 'real' ? (
        <>
          <div className="sv-to-form sv-to-topbar">
            <YearSelector y={anio} onChange={setAnio} years={[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]} />
            <SyncStatus sync={syncReal} que="lo real" />
          </div>
          <TimeOffSummary y={anio} evs={{ [anio]: evReal, [anio + 1]: evRealSig }} saldosByYear={saldosResumen}
            requests={requests} nueve={nueve} cierreExtra={real.cierreExtra} onYear={setAnio}
            onSync={() => syncNueve(false).then(res => { setNueve(res); return res })} />
          <Normas ev={evReal} requests={requests} />
          <TimeOffRequests requests={requests} setRequests={setRequests} state={realAnio} simState={sim} coste={costes.mes} connected={connected} />
          <VacacionesReales real={real} setReal={setReal} ev={evReal} />
          <ConflictMatrix keys={real.keys} ctx={ctxReal} />
          <TimeOffIntegration nueve={nueve} onChange={setNueve} connected={connected} />
        </>
      ) : (
        <FalloSeguro que="el simulador"><div className="sv-to-simwrap">
          <SyncStatus sync={syncSim} que="el simulador" />
          <Calculadora state={sim} setState={setSim} costes={costes} clases={clasesReal.clases} ev={evSim} sugerido={sugerido} onDesdeReal={desdeReal} onGuardarAnterior={guardarAnterior} />
          <PrevisionVerano ev={evSim} state={sim} historico={hist.months} />
          <HistoricoVerano hist={hist} onApply={h => setSim(s => ({ ...s, ingresosSala: h.ingresos, gastosSala: h.ahorrable }))} />
          <div className="sv-section">
            <div className="sv-to-step">
              <h4 className="sv-to-step__title"><span className="sv-to-step__n">6</span>Guardar, comparar o llevar a lo real</h4>
              <div className="sv-to-form">
                <button className="sv-filter-btn" onClick={usarEnReal}>Usar esta configuración en lo real</button>
                <span className="sv-ot-muted sv-to-small">Lleva a Vacaciones el paro, las llaves, los días, los pactos y el modo de verano. Los periodos simulados nunca pasan a ser vacaciones reales: esas solo entran por solicitudes.</span>
              </div>
            </div>
          </div>
          <Escenarios scenarios={scenarios} setScenarios={setScenarios} state={sim} coste={costes.mes} requests={[]}
            connected={connected} toPlain={toPlain} hydrate={hydrate} onLoad={cargarEscenario} />
        </div></FalloSeguro>
      )}
    </div>
  )
}
