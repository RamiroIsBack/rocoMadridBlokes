import { useState, useMemo, useEffect, useRef } from 'react'
import { PROF_META, PROF_ORDER, DAYS, DAY_LABEL } from '../data/staffSchedule'
import {
  KEY_HOLDERS_DEFAULT, VERANO_APERTURA, COMODIN_VERANO, veranoSlots, pairConflict, simulatePlan,
  laborablesBetween, laborablesFrom, isSummer, weekdayOf, fmtShort,
  diasDevengados, PARO_VERANO, combinacionesParo, CIERRE_VERANO, isClosed, disponible, setFestivos,
} from '../utils/coverage'
import { useExpenses } from '../hooks/useSuperAdmin'
import { usePayroll } from '../hooks/useOvertime'
import { autoCategory } from '../utils/expensesParser'
import { PL_DATA } from '../data/plHistorico'
import {
  DIAS_ANUALES, HOY_PARO, MES_LABEL, eur, inactivosMes, evaluarPlan, defaultYear, todayISO,
  BLOQUE_VERANO, MAX_BLOQUES, CIERRE_EXTRA,
} from '../utils/timeoffPlan'
import { useTimeOffData, savePlan, syncNueve } from '../hooks/useTimeOff'
import TimeOffRequests, { matchPerson } from './TimeOffRequests'
import TimeOffIntegration, { personaDeEmpleado } from './TimeOffIntegration'
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

// ─── Coste empresa por persona ───────────────────────────────────────────────
// Superadmin › Nóminas guarda lo que cobra cada persona (no el coste empresa).
// Coste empresa ≈ nómina × 1,395 (tabla de referencia de la ficha: 6, 7, 10 y
// 40 h/sem dan todas ese factor); lo que se paga en efectivo no lleva SS.
const FACTOR_COSTE = 1.395

const normName = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function useCostes() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data, loading, error } = usePayroll(month)

  return useMemo(() => {
    const ficha = Object.fromEntries(PROF_ORDER.map(p => [p, PROF_META[p].costoMes]))
    const nomina = {}
    ;(data?.rows || []).forEach(r => {
      const first = normName(r.name || '').split(/\s+/)[0]
      const p = PROF_ORDER.find(x => normName(x) === first)
      if (!p || r.base_nominal == null) return
      const banco = r.base_nominal
      const efectivo = r.cash_total != null ? Math.max(0, r.cash_total - banco) : 0
      nomina[p] = { banco, efectivo, coste: Math.round(banco * FACTOR_COSTE + efectivo) }
    })
    const conNomina = Object.keys(nomina).length > 0
    const mes = Object.fromEntries(PROF_ORDER.map(p => [p, nomina[p]?.coste ?? ficha[p]]))
    return { mes, ficha, nomina, conNomina, month, loading, error }
  }, [data, loading, error, month])
}

let nextId = 1
// Un periodo nuevo se da por comunicado hoy (cuenta para la antelación de 2 meses)
const period = (prof, start, n, extra = {}) => ({ id: nextId++, prof, start, n, comunicado: todayISO(), acuerdo: false, nota: '', ...extra })

const CAMP_OFF = { activo: false, start: '', semanas: 4, plazas: 0, precio: 0, staff: [COMODIN_VERANO] }

// Escenarios de partida para el año natural `y`. Todos dan a cada persona su bloque de
// 15 laborables seguidos entre junio y septiembre y reparten el resto en Navidad.
function presetPlan(kind, y) {
  const P = (prof, mmdd, n, extra) => period(prof, `${y}-${mmdd}`, n, extra)
  const navidad = [
    P('Sigurd', '12-20', 4), P('Lucía', '12-20', 4), P('Ana', '12-20', 4), P('Sara', '12-20', 4),
    P('Alvaro', '12-27', 4),
    P('Eva',    '12-13', 4),
  ]
  const base = { year: y, paro: { ...HOY_PARO }, cierre: 'abierto', cierreExtra: 'pagados', camp: { ...CAMP_OFF, start: `${y}-07-01` } }

  switch (kind) {
    case 'discontinuas':
      return {
        ...base,
        paro: { ...HOY_PARO, Sara: 'verano', 'Lucía': 'verano' },
        periods: [
          ...navidad,
          P('Ana', '06-01', BLOQUE_VERANO), P('Sara', '06-01', BLOQUE_VERANO),
          P('Alvaro', '07-01', BLOQUE_VERANO), P('Eva', '07-22', BLOQUE_VERANO),
          P('Sigurd', '09-01', BLOQUE_VERANO), P('Lucía', '09-01', BLOQUE_VERANO),
        ],
      }
    case 'cierreAgosto':
      // El club cierra en agosto y fija ahí el bloque de 15 días (asesoría); quien no
      // trabaja en agosto lo coge en junio o septiembre
      return {
        ...base,
        cierre: 'agosto',
        periods: [...navidad, P('Ana', '06-01', BLOQUE_VERANO), P('Sigurd', '09-01', BLOQUE_VERANO)],
      }
    case 'agostoParo':
      // Agosto cerrado y todos en paro ese mes: el bloque de 15 va en junio, julio o septiembre
      return {
        ...base,
        cierre: 'agosto',
        paro: { ...Object.fromEntries(PROF_ORDER.map(p => [p, 'agosto'])), Sigurd: 'verano' },
        periods: [
          ...navidad,
          P('Eva', '06-01', BLOQUE_VERANO), P('Sara', '06-01', BLOQUE_VERANO),
          P('Alvaro', '07-01', BLOQUE_VERANO),
          P('Lucía', '09-01', BLOQUE_VERANO), P('Sigurd', '09-01', BLOQUE_VERANO), P('Ana', '09-01', BLOQUE_VERANO),
        ],
      }
    case 'cierreVerano':
      return {
        ...base,
        cierre: 'verano',
        camp: { ...CAMP_OFF, activo: true, start: `${y}-07-01`, staff: [COMODIN_VERANO, 'Ana'] },
        periods: [...navidad, P('Ana', '06-01', BLOQUE_VERANO), P('Sigurd', '09-01', BLOQUE_VERANO)],
      }
    case 'todosDiscontinuos':
      // Todos en paro julio y agosto: los bloques de 15 solo caben en junio y septiembre,
      // y no hay sitio para todos sin choques (Eva, pactado en octubre)
      return {
        ...base,
        cierre: 'verano',
        paro: Object.fromEntries(PROF_ORDER.map(p => [p, 'verano'])),
        periods: [
          ...navidad,
          P('Sara', '06-01', BLOQUE_VERANO), P('Lucía', '06-01', BLOQUE_VERANO),
          P('Ana', '06-01', BLOQUE_VERANO), P('Sigurd', '06-01', BLOQUE_VERANO),
          P('Alvaro', '09-01', BLOQUE_VERANO),
          P('Eva', '10-01', BLOQUE_VERANO, { acuerdo: true, nota: 'Fuera de junio-septiembre: pactado' }),
        ],
      }
    default:
      return {
        ...base,
        periods: [
          ...navidad,
          P('Ana', '06-01', BLOQUE_VERANO),
          P('Alvaro', '07-01', BLOQUE_VERANO), P('Sara', '07-01', BLOQUE_VERANO),
          P('Eva', '07-22', BLOQUE_VERANO), P('Lucía', '08-12', BLOQUE_VERANO),
          P('Sigurd', '09-01', BLOQUE_VERANO),
        ],
      }
  }
}

const PRESETS = [
  ['hoy',          'Hoy (Sigurd jul–ago, Ana ago)'],
  ['discontinuas', 'Sara y Lucía fijas discontinuas'],
  ['cierreAgosto', 'Cerrar agosto (bloque de 15 en agosto)'],
  ['agostoParo',   'Cerrar agosto, todos en paro en agosto'],
  ['cierreVerano', 'Cerrar julio y agosto + campamento'],
  ['todosDiscontinuos', 'Cerrar julio y agosto, todos discontinuos'],
]

function defaultState(year = defaultYear()) {
  return {
    ...presetPlan('hoy', year),
    keys: [...KEY_HOLDERS_DEFAULT],
    dias: Object.fromEntries(PROF_ORDER.map(p => [p, DIAS_ANUALES])),
    // €/mes por mes de verano (7 = julio, 8 = agosto)
    gastosSala:   { 7: 0, 8: 0 },
    ingresosSala: { 7: 0, 8: 0 },
  }
}

// Plan guardado (sin ids) → estado de la calculadora
function hydrate(plain) {
  const st = { ...defaultState(plain.year || defaultYear()), ...plain }
  st.periods = (plain.periods || []).map(p => ({ ...p, id: nextId++ }))
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
// de verano y qué periodos empiezan sin los 2 meses de antelación
function Recordatorio({ ev, requests }) {
  const y = ev.y
  const plazo = `${y}-03-31`
  const n = daysUntil(plazo)
  const sinBloque = ev.rows.filter(r => r.bloqueVerano < BLOQUE_VERANO && !r.pactado).map(r => r.p)
  const pendientes = requests.filter(r => r.status === 'pendiente').length
  return (
    <div className={`sv-to-reminder${(n >= 0 && n <= 30 && sinBloque.length) || ev.antelacion.length ? ' sv-to-reminder--urgent' : ''}`}>
      <strong>Recordatorio · calendario de vacaciones {y}:</strong>{' '}
      {n >= 0 ? <>cerrarlo antes del {fmtShort(plazo)} ({n === 0 ? 'hoy' : `faltan ${n} días`}).</> : <>tenía que estar cerrado el {fmtShort(plazo)}; los cambios, por acuerdo.</>}
      {' '}{sinBloque.length
        ? <>Sin su bloque de {BLOQUE_VERANO} días en junio–septiembre: <strong>{sinBloque.join(', ')}</strong>.</>
        : <span className="sv-to-good">Todos tienen su bloque de verano.</span>}
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
      <ul className="sv-to-rules">
        <li>Convenio estatal de instalaciones deportivas y gimnasios: <strong>{DIAS_ANUALES} días laborables</strong> por año natural.</li>
        <li><strong>{BLOQUE_VERANO} laborables seguidos entre el 1 de junio y el 30 de septiembre</strong>; el resto en dos bloques más, pactados. Otro reparto, solo con <strong>acuerdo expreso</strong>.</li>
        <li>El calendario se hace en el <strong>primer trimestre</strong> y cada persona conoce sus fechas con <strong>2 meses de antelación</strong>. Las fechas se fijan de común acuerdo (art. 38 ET).</li>
        <li>Si el club <strong>cierra en agosto</strong>, puede fijar ahí el bloque de {BLOQUE_VERANO} días. Los días de cierre que pasan de {BLOQUE_VERANO} no los cubre el convenio: se pagan sin trabajar o se descuentan con acuerdo.</li>
        <li>No se puede imponer otro reparto ni el paro: pasar a fijo discontinuo o pactar fechas distintas necesita el acuerdo de la persona.</li>
        <li>En verano se abre solo por la tarde, desde las <strong>{VERANO_APERTURA}</strong>: todos los días de julio y agosto tiene que haber alguien con llave para abrir.</li>
        <li>En verano se unifican los grupos: clases de 1,5 h <strong>una detrás de otra</strong>, desde las {VERANO_APERTURA} hasta el cierre ({CLASES_VERANO} clases a la semana).</li>
        <li>En verano {COMODIN_VERANO} está en recepción y es el <strong>comodín</strong>: solo da clase si falta un profe. Hacen falta <strong>2 profes + {COMODIN_VERANO}</strong> cada mes para que puedan turnarse las vacaciones.</li>
        <li>Los <strong>fijos discontinuos</strong> no trabajan julio, agosto o los dos (cobran el paro). Las vacaciones se devengan por meses trabajados: {diasDevengados(DIAS_ANUALES, 1)} días si paran un mes y {diasDevengados(DIAS_ANUALES, 2)} si paran los dos. Si les aplica el bloque de {BLOQUE_VERANO} en junio o septiembre está pendiente de confirmar con la asesoría.</li>
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

function HistoricoVerano({ hist, onApply }) {
  const { months, loading, error } = hist

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
function ExploradorParo({ paro, cierre, keys, coste, onApply }) {
  const [verTodas, setVerTodas] = useState(false)
  const combos = useMemo(() => combinacionesParo({
    cierre, keys, hoy: HOY_PARO, coste,
  }), [cierre, keys, coste])
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
function Calculadora({ state, setState, costes, ev, saldos }) {
  const y = ev.y
  const WINDOWS = {
    verano:  { label: `Verano ${y} (jun–sep)`, from: `${y}-06-01`, to: `${y}-09-30` },
    navidad: { label: `Navidad ${y}/${String(y + 1).slice(2)}`, from: `${y}-12-01`, to: `${y + 1}-01-10` },
    anio:    { label: `Año ${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
  }
  const [win, setWin] = useState('verano')
  const [selDate, setSelDate] = useState(null)
  const { paro, keys, dias, periods, cierre, camp, gastosSala, ingresosSala } = state
  const cierreExtra = state.cierreExtra || 'pagados'

  // Todo el cálculo sale de evaluarPlan (el mismo que escenarios y previsión)
  const { ctx, conflictsOf, rows, warnings, eco, campSet, mesesCerradosList, sinAbrirVer, diasComodin } = ev
  const balance = eco.balance
  const kpi = ev.kpi
  const mesesCerrados = mesesCerradosList.length
  const dates = useMemo(() => laborablesBetween(WINDOWS[win].from, WINDOWS[win].to), [win, y])
  const sim   = useMemo(() => simulatePlan(dates, ctx), [dates, ctx])

  function update(patch) { setState(s => ({ ...s, ...patch })) }
  const toggle = (list, p) => (list.includes(p) ? list.filter(x => x !== p) : [...list, p])
  function setPeriod(id, patch) { update({ periods: periods.map(x => (x.id === id ? { ...x, ...patch } : x)) }) }
  function setCamp(patch) { update({ camp: { ...camp, ...patch } }) }
  const num = (v, min = 0) => Math.max(min, Number(v) || 0)

  const selDay = sim.find(d => d.date === selDate)

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Calculadora de supuestos</h3>
      <div className="sv-to-form">
        <span className="sv-to-inline">
          Año
          <span className="sv-period">
            {[defaultYear() - 1, defaultYear(), defaultYear() + 1].map(yr => (
              <button key={yr} className={`sv-period__btn${yr === y ? ' sv-period__btn--active' : ''}`} onClick={() => update({ year: yr })}>{yr}</button>
            ))}
          </span>
        </span>
        <span className="sv-ot-muted">Las vacaciones cuentan por año natural; los periodos de otros años se conservan.</span>
      </div>
      <div className="sv-controls">
        <div className="sv-filter-group sv-to-wrap">
          {PRESETS.map(([id, label]) => (
            <button key={id} className="sv-filter-btn" onClick={() => update({ ...presetPlan(id, y) })}>{label}</button>
          ))}
          <button className="sv-filter-btn" onClick={() => setState(defaultState(y))}>Reiniciar</button>
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
            <label className="sv-to-inline">
              Días de cierre que pasan de {BLOQUE_VERANO}
              <select className="sv-tests-select" value={cierreExtra} onChange={e => update({ cierreExtra: e.target.value })}>
                {Object.entries(CIERRE_EXTRA).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
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
            <span className="sv-kpi__label">Sueldo de {eco.diasOciosos} días de cierre pagados sin trabajar (pasan de {BLOQUE_VERANO})</span>
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

      {ev.acuerdos.length > 0 && (
        <div className="sv-to-acuerdos">
          <strong>Requiere acuerdo expreso con:</strong>
          <ul>
            {ev.acuerdos.map((a, i) => (
              <li key={i} className={a.registrado ? 'sv-ot-muted' : ''}>{a.p}: {a.motivo}{a.registrado ? ' · marcado como pactado' : ''}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="sv-to-warnings">
          {warnings.map((w, i) => <li key={i} className={`sv-to-warn sv-to-warn--${w.lvl}`}>{w.text}</li>)}
        </ul>
      )}

      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead>
            <tr>
              <th>Persona</th><th>Paro en verano</th><th>Llave</th><th>Días/año</th><th>Le tocan {y}</th>
              <th>Bloque jun–sep</th><th>Bloques</th><th>Vacaciones</th><th>Le quedan</th>{saldos && <th title="Saldo de vacaciones en 9to5 para este año">En 9to5</th>}<th>Coste empresa/mes</th><th>Ahorro/año frente a hoy</th>
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
                <td className={r.bloqueVerano >= BLOQUE_VERANO ? 'sv-to-good' : r.pactado ? 'sv-ot-muted' : r.nParo ? 'sv-to-warn-txt' : 'sv-to-bad'}
                  title={r.pactado ? 'Tiene un periodo pactado' : `Bloque más largo entre junio y septiembre: ${r.bloqueVerano} laborables seguidos`}>
                  {r.bloqueVerano >= BLOQUE_VERANO ? '✓' : r.pactado ? 'pactado' : '✗'} {r.bloqueVerano}/{BLOQUE_VERANO}
                </td>
                <td className={r.bloques > MAX_BLOQUES && !r.pactado ? 'sv-to-warn-txt' : ''}>{r.bloques}</td>
                <td>
                  {r.usados}
                  {(r.cierreConv > 0 || r.cierreExtra > 0) && (
                    <span className="sv-ot-muted"> ({r.cierreConv} cierre{r.cierreExtra ? ` + ${r.cierreExtra} ${cierreExtra === 'pagados' ? 'pagados' : 'descontados'}` : ''})</span>
                  )}
                </td>
                <td className={r.restan < 0 ? 'sv-to-bad' : ''}>{r.restan}</td>
                {saldos && (() => {
                  const b = saldos[r.p]
                  if (!b) return <td className="sv-ot-muted">—</td>
                  const descuadre = b.entitled != null && b.entitled !== r.dev
                  return (
                    <td className={descuadre ? 'sv-to-warn-txt' : ''}
                      title={`9to5: le corresponden ${b.entitled ?? '—'}, disfrutados ${b.taken}, quedan ${b.remaining ?? '—'}${b.pending ? `, ${b.pending} solicitudes sin resolver` : ''}${b.unit === 'natural' ? ' (días naturales)' : ''}${descuadre ? ` · aquí le tocan ${r.dev}` : ''}`}>
                      quedan {b.remaining ?? '—'} de {b.entitled ?? '—'}
                    </td>
                  )
                })()}
                <td title={costes.nomina[r.p]
                  ? `Nómina ${eur(costes.nomina[r.p].banco)}${costes.nomina[r.p].efectivo ? ` + efectivo ${eur(costes.nomina[r.p].efectivo)}` : ''} · ficha ${eur(costes.ficha[r.p])}`
                  : 'Coste de la ficha (marzo 2026)'}>
                  {eur(costes.mes[r.p])}{!costes.nomina[r.p] && <span className="sv-ot-muted"> *</span>}
                </td>
                <td className={r.ahorro > 0 ? 'sv-to-good' : r.ahorro < 0 ? 'sv-to-bad' : 'sv-ot-muted'}>{r.ahorro ? eur(r.ahorro) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="sv-note">
        {costes.loading ? 'Cargando nóminas de Superadmin…'
          : costes.conNomina
            ? `Coste empresa estimado con las nóminas de Superadmin (${costes.month}): nómina × ${String(FACTOR_COSTE).replace('.', ',')} + lo que se paga en efectivo. Pasa el ratón por el coste para ver la nómina y el dato de la ficha.`
            : `No se pudieron leer las nóminas de Superadmin${costes.error ? ` (${costes.error})` : ''}: se usa el coste empresa de la ficha de marzo de 2026.`}
        {costes.conNomina && PROF_ORDER.some(p => !costes.nomina[p]) && ' * Sin nómina en Superadmin: dato de la ficha.'}
      </p>

      <ExploradorParo paro={paro} cierre={cierre} keys={keys} coste={costes.mes} onApply={p => update({ paro: p })} />

      <h4 className="sv-to-subtitle">Periodos de vacaciones</h4>
      <div className="sv-tests-scroll">
        <table className="sv-tests-table">
          <thead><tr><th>Persona</th><th>Desde</th><th>Días laborables</th><th>Hasta</th><th>Comunicado</th><th>Acuerdo expreso</th><th>Nota</th><th></th></tr></thead>
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
                  <td>
                    <input className={`sv-tests-input${ev.antelacion.some(a => a.p === x.prof && a.start === x.start) ? ' sv-to-input--bad' : ''}`}
                      type="date" value={x.comunicado || ''} title="Fecha en que se comunica a la persona (2 meses de antelación)"
                      onChange={e => setPeriod(x.id, { comunicado: e.target.value })} />
                  </td>
                  <td><input type="checkbox" checked={!!x.acuerdo} title="Pactado con la persona (fechas fuera de las reglas del convenio)"
                    onChange={() => setPeriod(x.id, { acuerdo: !x.acuerdo })} /></td>
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
      <p className="sv-note">
        «Comunicado» es cuándo se le dice a la persona: con menos de 2 meses hasta el inicio, solo vale con acuerdo.
        «Acuerdo expreso» registra que esas fechas están pactadas aunque se salgan de las reglas. Las solicitudes aprobadas
        las pide la propia persona y cuentan como acuerdo.
      </p>
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
        Recuadro blanco: lleva el campamento. Solo se cuentan días laborables; los festivos salen de 9to5 (sin conexión,
        solo los nacionales de Navidad y el 15 de agosto).
      </p>

      {selDay && (
        <div className="sv-class-detail">
          <div className="sv-class-detail__title">
            {DAY_LABEL[weekdayOf(selDay.date)]} {fmtShort(selDay.date)} · {selDay.closed ? 'sala cerrada' : isSummer(selDay.date) ? 'horario de verano' : 'horario normal'}
          </div>
          {selDay.closed ? (
            <ul className="sv-to-detail">
              <li>Vacaciones de todos los que trabajan ese mes (los primeros {BLOQUE_VERANO} días del cierre son el bloque del convenio).</li>
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

// Estado de guardado: cargando | guardado | guardando | error | sin-servidor
function SyncStatus({ sync }) {
  const txt = {
    cargando:       'Cargando el plan de la app…',
    guardando:      'Guardando…',
    guardado:       sync.meta ? `Guardado en la app${sync.meta.by ? ` · ${sync.meta.by}` : ''} · ${sync.meta.updated_at?.slice(0, 16).replace(' ', ' a las ')}` : 'Guardado en la app',
    error:          `No se pudo guardar: ${sync.msg}`,
    'sin-servidor': `Sin conexión con el servidor (${sync.msg}): los cambios no se guardan.`,
  }[sync.status]
  return <p className={`sv-to-sync${sync.status === 'error' || sync.status === 'sin-servidor' ? ' sv-error' : ''}`}>{txt}</p>
}

export default function TimeOffTab() {
  const [state, setState] = useState(defaultState)
  const [sync, setSync]   = useState({ status: 'cargando' })
  const costes = useCostes()
  const hist   = useHistoricoMeses()
  const remote = useTimeOffData()
  const loaded    = useRef(false)
  const lastSaved = useRef(null)

  const nueve     = remote.data?.nueve || null
  // Las de 9to5 traen el nombre completo: se casan con la persona del equipo
  const requests  = useMemo(() => (remote.data?.requests || []).map(r =>
    (PROF_ORDER.includes(r.person) ? r : { ...r, person: matchPerson(r.person) || r.person })), [remote.data?.requests])
  const scenarios = remote.data?.scenarios || []
  const setNueve  = res => remote.setData(d => ({ ...d, nueve: res.nueve ?? d.nueve, requests: res.requests ?? d.requests }))
  const setRequests  = list => remote.setData(d => ({ ...d, requests: list }))
  const setScenarios = list => remote.setData(d => ({ ...d, scenarios: list }))
  const connected = !!remote.data && !remote.error

  // Al cargar: el plan oficial del servidor; si aún no hay, el que hubiera en este navegador
  useEffect(() => {
    if (loaded.current || remote.loading) return
    if (remote.error) { setSync({ status: 'sin-servidor', msg: remote.error }); return }
    loaded.current = true
    if (remote.data?.plan) {
      const st = hydrate(remote.data.plan)
      lastSaved.current = JSON.stringify(toPlain(st))
      setState(st)
      setSync({ status: 'guardado', meta: remote.data.plan_meta })
    } else {
      const legacy = legacyLocalPlan()
      // Primer guardado: el plan del navegador o el de por defecto
      setState(legacy ? hydrate(legacy) : st => ({ ...st }))
      setSync({ status: 'guardando' })
    }
  }, [remote.loading, remote.error, remote.data])

  // Autoguardado 1,5 s después del último cambio
  useEffect(() => {
    if (!loaded.current) return
    const json = JSON.stringify(toPlain(state))
    if (json === lastSaved.current) return
    setSync({ status: 'guardando' })
    const t = setTimeout(() => {
      savePlan(JSON.parse(json))
        .then(meta => { lastSaved.current = json; setSync({ status: 'guardado', meta }) })
        .catch(e => setSync({ status: 'error', msg: e.message }))
    }, 1500)
    return () => clearTimeout(t)
  }, [state])

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

  const ev  = useMemo(() => evaluarPlan(state, costes.mes, requests), [state, costes.mes, requests, festivosKey])

  // Saldo de vacaciones de 9to5 del año del plan, por persona del equipo
  const saldos = useMemo(() => {
    const list = nueve?.balances?.[ev.y]
    if (!list) return null
    const emps = Object.fromEntries((nueve.employees || []).map(e => [e.id, e]))
    const res = {}
    list.forEach(b => {
      const p = emps[b.employee_id] && personaDeEmpleado(emps[b.employee_id], nueve.employee_map)
      if (p) res[p] = b
    })
    return res
  }, [nueve, ev.y])
  const ctx = { paro: state.paro, cierre: state.cierre, year: ev.y }

  return (
    <div className="sv-tab-panel sv-to-root">
      <SyncStatus sync={sync} />
      <Normas ev={ev} requests={requests} />
      <TimeOffIntegration nueve={nueve} onChange={setNueve} connected={connected} />
      <TimeOffRequests requests={requests} setRequests={setRequests} state={state} coste={costes.mes} connected={connected} />
      <HistoricoVerano hist={hist} onApply={h => setState(s => ({ ...s, ingresosSala: h.ingresos, gastosSala: h.ahorrable }))} />
      <PrevisionVerano ev={ev} state={state} historico={hist.months} />
      <ConflictMatrix keys={state.keys} ctx={ctx} />
      <Calculadora state={state} setState={setState} costes={costes} ev={ev} saldos={saldos} />
      <Escenarios scenarios={scenarios} setScenarios={setScenarios} state={state} coste={costes.mes} requests={requests}
        connected={connected} toPlain={toPlain} hydrate={hydrate} onLoad={sc => setState(hydrate(sc.state))} />
    </div>
  )
}
