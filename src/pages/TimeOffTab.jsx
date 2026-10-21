import { useState, useMemo, useEffect } from 'react'
import { PROF_META, PROF_ORDER, DAYS, DAY_LABEL } from '../data/staffSchedule'
import {
  KEY_HOLDERS_DEFAULT, VERANO_APERTURA, COMODIN_VERANO, veranoSlots, pairConflict, simulatePlan,
  laborablesBetween, laborablesFrom, expandPeriods, isSummer, weekdayOf, fmtShort, monthOf,
  diasDevengados, minimoVerano, MESES_DISCONTINUO, DISP_VERANO, CIERRE_VERANO, isClosed, disponible,
  campDates, vacationDates,
} from '../utils/coverage'
import { useExpenses, useRevenue } from '../hooks/useSuperAdmin'
import { autoCategory } from '../utils/expensesParser'

const STORAGE_KEY = 'blokes.timeoff.v2'
const DIAS_ANUALES = 23
const HOY_DISCONTINUOS = ['Sigurd']
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

// Quién no está en un mes de verano (discontinuos y no disponibles)
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
  const base = { disp: { Ana: 'julio' }, cierre: 'abierto', camp: { ...CAMP_OFF, start: `${v}-07-01` } }

  switch (kind) {
    case 'discontinuas':
      return {
        ...base,
        discontinuos: ['Sigurd', 'Sara', 'Lucía'],
        periods: [...navidad, period('Alvaro', `${v}-07-01`, 12), period('Eva', `${v}-07-19`, 12)],
      }
    case 'cierreAgosto':
      // Agosto cerrado = vacaciones de todos; casi no queda nada para Navidad
      return {
        ...base,
        cierre: 'agosto',
        discontinuos: [...HOY_DISCONTINUOS],
        periods: [period('Sigurd', `${y}-12-21`, 4), period('Ana', `${y}-12-21`, 4)],
      }
    case 'cierreVerano':
      return {
        ...base,
        cierre: 'verano',
        discontinuos: [...HOY_DISCONTINUOS],
        camp: { ...CAMP_OFF, activo: true, start: `${v}-07-01`, staff: [COMODIN_VERANO, 'Ana'] },
        periods: [period('Sigurd', `${y}-12-21`, 4)],
      }
    case 'todosDiscontinuos':
      // Sala cerrada julio y agosto y toda la plantilla en paro esos meses
      return { ...base, cierre: 'verano', discontinuos: [...PROF_ORDER], periods: navidad }
    default:
      return {
        ...base,
        discontinuos: [...HOY_DISCONTINUOS],
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
  ['hoy',          'Hoy (Sigurd discontinuo)'],
  ['discontinuas', 'Sara y Lucía fijas discontinuas'],
  ['cierreAgosto', 'Cerrar agosto'],
  ['cierreVerano', 'Cerrar julio y agosto + campamento'],
  ['todosDiscontinuos', 'Cerrar julio y agosto, todos discontinuos'],
]

function defaultState() {
  return {
    ...presetPlan('hoy'),
    keys: [...KEY_HOLDERS_DEFAULT],
    dias: Object.fromEntries(PROF_ORDER.map(p => [p, DIAS_ANUALES])),
    gastosSala: 0,
    ingresosSala: 0,
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
        <li>Los <strong>fijos discontinuos</strong> no trabajan en julio y agosto (cobran el paro). Les corresponden unos {diasDevengados(DIAS_ANUALES, true)} días ({MESES_DISCONTINUO} meses de {DIAS_ANUALES}), que cogen fuera del verano.</li>
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

function HistoricoVerano({ onApply }) {
  const exp = useExpenses(MESES_HISTORICO, 'all', true)
  const rev = useRevenue(MESES_HISTORICO, true)

  const months = useMemo(() => {
    const acc = {}
    const row = m => (acc[m] ||= { month: m, ingresos: 0, costes: 0, personal: 0, ahorrable: 0, web: 0, banco: false })
    ;(exp.data || []).forEach(r => {
      const x = row(r.month)
      x.banco = true
      x.ingresos += Math.abs(r.total_ingresos || 0)
      x.costes   += Math.abs(r.total_costes || 0)
      x.personal += Math.abs(r.nominas || 0)
      Object.entries(r.by_concepto || {}).forEach(([k, v]) => {
        const cat = autoCategory(k, false)
        if (cat === 'ss') x.personal += v
        if (CATS_AHORRABLES.includes(cat)) x.ahorrable += v
      })
    })
    ;(rev.data || []).forEach(r => { row(r.month).web += r.total || 0 })
    return Object.values(acc).sort((a, b) => a.month.localeCompare(b.month))
  }, [exp.data, rev.data])

  const isVer = m => ['07', '08'].includes(m.month.slice(5))
  const conBanco = months.filter(m => m.banco)
  const verano = conBanco.filter(isVer)
  const resto  = conBanco.filter(m => !isVer(m))
  const media = (arr, k) => (arr.length ? arr.reduce((n, m) => n + m[k], 0) / arr.length : 0)
  const restoAnio = y => resto.filter(m => m.month.startsWith(y))
  const veranoWeb = months.filter(isVer).filter(m => m.web > 0)

  const sugerido = {
    ingresos:  Math.round(media(verano, 'ingresos') || media(veranoWeb, 'web')),
    ahorrable: Math.round(media(verano, 'ahorrable')),
  }

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Histórico de julio y agosto</h3>
      <p className="sv-note">
        Movimientos del banco subidos en Superadmin › Gastos (sin movimientos internos) y ventas de la web sin el uso del
        rocódromo. Solo salen los meses con extracto subido. «Ahorrable» es lo que dejaría de pagarse con la sala cerrada
        (luz, gas, bar, comisiones y devoluciones TPV); alquiler, nóminas, Seguridad Social e impuestos se pagan igual.
      </p>
      {(exp.loading || rev.loading) && <p className="sv-loading">Cargando histórico…</p>}
      {exp.error && <p className="sv-error">No se pudo cargar el banco: {exp.error}</p>}
      {!exp.loading && !exp.error && !months.some(isVer) && <p className="sv-empty">Aún no hay datos de julio ni agosto.</p>}
      {months.some(isVer) && (
        <>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead>
                <tr>
                  <th>Mes</th><th>Ingresos banco</th><th>Ventas web</th><th>Gastos</th><th>Personal</th>
                  <th>Ahorrable</th><th>Resultado</th><th>Resultado medio resto del año</th>
                </tr>
              </thead>
              <tbody>
                {months.filter(isVer).map(m => {
                  const net = m.ingresos - m.costes
                  const ra = restoAnio(m.month.slice(0, 4))
                  const netResto = ra.length ? media(ra, 'ingresos') - media(ra, 'costes') : null
                  return (
                    <tr key={m.month}>
                      <td style={{ textTransform: 'capitalize' }}>{fmtMes(m.month)}</td>
                      <td>{m.banco ? eur(m.ingresos) : '—'}</td>
                      <td>{m.web ? eur(m.web) : '—'}</td>
                      <td>{m.banco ? eur(m.costes) : '—'}</td>
                      <td>{m.banco ? eur(m.personal) : '—'}</td>
                      <td>{m.banco ? eur(m.ahorrable) : '—'}</td>
                      <td className={m.banco && net < 0 ? 'sv-to-bad' : ''}>{m.banco ? eur(net) : '—'}</td>
                      <td className="sv-ot-muted">{netResto === null ? '—' : `${eur(netResto)} (${ra.length} meses)`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {verano.length > 0 && (
            <div className="sv-kpis">
              <div className="sv-kpi" style={{ '--kpi-color': '#60a5fa' }}>
                <span className="sv-kpi__value">{eur(media(verano, 'ingresos'))}</span>
                <span className="sv-kpi__label">Ingresos medios jul/ago ({verano.length} meses) · resto {eur(media(resto, 'ingresos'))}</span>
              </div>
              <div className="sv-kpi" style={{ '--kpi-color': '#f5c842' }}>
                <span className="sv-kpi__value">{eur(media(verano, 'costes'))}</span>
                <span className="sv-kpi__label">Gastos medios jul/ago · ahorrables {eur(sugerido.ahorrable)}</span>
              </div>
              <div className="sv-kpi" style={{ '--kpi-color': media(verano, 'ingresos') - media(verano, 'costes') < 0 ? '#f87171' : '#34d399' }}>
                <span className="sv-kpi__value">{eur(media(verano, 'ingresos') - media(verano, 'costes'))}</span>
                <span className="sv-kpi__label">Resultado medio jul/ago · resto {eur(media(resto, 'ingresos') - media(resto, 'costes'))}</span>
              </div>
            </div>
          )}
          <button className="sv-tests-add" onClick={() => onApply(sugerido)}>
            Usar en la calculadora: se pierden {eur(sugerido.ingresos)}/mes de ingresos, se ahorran {eur(sugerido.ahorrable)}/mes de gastos
          </button>
        </>
      )}
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
  const { discontinuos, keys, dias, periods, disp, cierre, camp, gastosSala, ingresosSala } = state
  const ctx  = { periods, discontinuos, disp, cierre, camp, keys }
  const deps = [periods, discontinuos, disp, cierre, camp, keys]

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
    const isDisc = discontinuos.includes(p)
    const vac    = vacationDates(p, temporadaDates, ctx)
    const verano = vac.filter(isSummer).length
    const dev    = diasDevengados(dias[p], isDisc)
    const cierreDias = vac.filter(d => isClosed(d, cierre)).length
    return {
      p, disc: isDisc, dev, usados: vac.length, verano, cierreDias,
      min: minimoVerano(dias[p], isDisc, disp[p]), restan: dev - vac.length,
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
  const mesesCerrados = [7, 8].filter(m => isClosed(`${y + 1}-0${m}-15`, cierre)).length
  const eco = {
    personal: discontinuos.filter(p => !HOY_DISCONTINUOS.includes(p)).reduce((s, p) => s + PROF_META[p].costoMes * 2, 0)
            - HOY_DISCONTINUOS.filter(p => !discontinuos.includes(p)).reduce((s, p) => s + PROF_META[p].costoMes * 2, 0),
    sala:     (gastosSala - ingresosSala) * mesesCerrados,
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
            <label className="sv-to-inline">
              Gastos de la sala que se ahorran (€/mes)
              <input className="sv-tests-input sv-tests-input--num" type="number" min="0" value={gastosSala}
                onChange={e => update({ gastosSala: num(e.target.value) })} />
            </label>
            <label className="sv-to-inline">
              Ingresos de la sala que se pierden (€/mes)
              <input className="sv-tests-input sv-tests-input--num" type="number" min="0" value={ingresosSala}
                onChange={e => update({ ingresosSala: num(e.target.value) })} />
            </label>
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
              <th>Persona</th><th>Fijo discontinuo</th><th>Llave</th><th>En verano</th><th>Días/año</th><th>Le tocan</th>
              <th>Jul–ago (mín.)</th><th>Vacaciones</th><th>Le quedan</th><th>€/mes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.p}>
                <td style={{ color: PROF_META[r.p].color, fontWeight: 700 }}>
                  {r.p}{r.p === COMODIN_VERANO && <span className="sv-ot-muted"> · recepción</span>}
                </td>
                <td><input type="checkbox" checked={r.disc} onChange={() => update({ discontinuos: toggle(discontinuos, r.p) })} /></td>
                <td><input type="checkbox" checked={keys.includes(r.p)} onChange={() => update({ keys: toggle(keys, r.p) })} /></td>
                <td>
                  {r.disc ? <span className="sv-ot-muted">Fuera (paro)</span> : (
                    <select className="sv-tests-select" value={disp[r.p] || 'ambos'}
                      onChange={e => update({ disp: { ...disp, [r.p]: e.target.value } })}>
                      {Object.entries(DISP_VERANO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  <input className="sv-tests-input sv-tests-input--unit" type="number" min="0" max="40" value={dias[r.p]}
                    onChange={e => update({ dias: { ...dias, [r.p]: num(e.target.value) } })} />
                </td>
                <td>{r.dev}</td>
                <td className={!r.disc && r.verano < r.min ? 'sv-to-bad' : ''}>{r.disc ? 'No trabaja' : `${r.verano} (${r.min || '—'})`}</td>
                <td>{r.usados}{r.cierreDias > 0 && <span className="sv-ot-muted"> ({r.cierreDias} cierre)</span>}</td>
                <td className={r.restan < 0 ? 'sv-to-bad' : ''}>{r.restan}</td>
                <td>{PROF_META[r.p].costoMes.toLocaleString('es-ES')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        "Verano frente a hoy" suma el coste empresa de julio y agosto que se ahorra con los discontinuos, los gastos de sala
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

  const ctx = { discontinuos: state.discontinuos, disp: state.disp, cierre: state.cierre }

  return (
    <div className="sv-tab-panel">
      <Normas />
      <HistoricoVerano onApply={h => setState(s => ({ ...s, ingresosSala: h.ingresos, gastosSala: h.ahorrable }))} />
      <ConflictMatrix keys={state.keys} ctx={ctx} />
      <Calculadora state={state} setState={setState} />
    </div>
  )
}
