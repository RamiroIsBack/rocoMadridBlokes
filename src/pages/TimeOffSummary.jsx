import { useMemo, useState } from 'react'
import { PROF_META } from '../data/staffSchedule'
import { laborablesBetween, fmtShort, PARO_VERANO } from '../utils/coverage'
import { BLOQUE_VERANO, todayISO } from '../utils/timeoffPlan'
import { personaDeEmpleado } from './TimeOffIntegration'

// Resumen visual por persona de lo real: días aprobados y pendientes sobre lo que le toca,
// lo que le queda aquí y en 9to5, su bloque de verano y sus próximas vacaciones.
// Muestra por defecto el año en curso (lo ya disfrutado) y, en una línea, el siguiente.

const fmtRango = (a, b) => (a === b ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(b)}`)
const fmtWhen = s => (s ? s.replace('T', ' ').slice(0, 16) : '—')

function diasEnAnio(r, y) {
  return laborablesBetween(r.from, r.to).filter(d => d.startsWith(`${y}-`)).length
}

// evs / saldosByYear: { [año]: evaluación de lo real · saldos de 9to5 } para cada año de `years`
export default function TimeOffSummary({ years, evs, saldosByYear, requests, nueve, onSync, cierreExtra = 'pagados' }) {
  const [syncing, setSyncing] = useState(false)
  const [y, setY] = useState(years[0])
  const ev = evs[y]
  const saldos = saldosByYear[y]
  const otro = years.find(x => x !== y)
  const evOtro = evs[otro]
  const hoy = todayISO()
  const pendEn = (p, yr) => requests.filter(q => q.person === p && q.status === 'pendiente').reduce((n, q) => n + diasEnAnio(q, yr), 0)

  // Personas del equipo que están en 9to5 (asociadas por nombre o a mano)
  const enNueve = useMemo(() => new Set((nueve?.employees || [])
    .filter(e => e.active)
    .map(e => personaDeEmpleado(e, nueve.employee_map))
    .filter(Boolean)), [nueve])

  const cards = ev.rows.map(r => {
    const mias = requests.filter(q => q.person === r.p && q.from <= `${y}-12-31` && q.to >= `${y}-01-01`)
    const pendientes = mias.filter(q => q.status === 'pendiente')
    const diasPend = pendientes.reduce((n, q) => n + diasEnAnio(q, y), 0)
    const proximas = mias.filter(q => q.status === 'aprobada' && q.to >= hoy).sort((a, b) => a.from.localeCompare(b.from))
    const b = saldos?.[r.p]
    let nueveTxt = null
    let cuadra = null
    if (nueve?.configured) {
      if (!enNueve.has(r.p)) nueveTxt = 'No está en 9to5: sus vacaciones van a mano'
      else if (b) {
        const motivos = []
        if (b.entitled != null && b.entitled !== r.dev) motivos.push(`9to5 le da ${b.entitled} días; aquí ${r.dev}${r.nParo ? ' (fijo discontinuo)' : ''}`)
        if (b.taken !== r.usados) motivos.push(`9to5 cuenta ${b.taken} disfrutados; aquí ${r.usados} aprobados`)
        cuadra = motivos.length === 0
        nueveTxt = motivos.join(' · ')
      }
    }
    return { r, diasPend, nPend: pendientes.length, proximas, b, nueveTxt, cuadra }
  })

  const sincronizar = async () => {
    setSyncing(true)
    try { await onSync() } finally { setSyncing(false) }
  }

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">Vacaciones por persona</h3>
      <div className="sv-to-form">
        <span className="sv-period">
          {years.map(yr => (
            <button key={yr} className={`sv-period__btn${yr === y ? ' sv-period__btn--active' : ''}`} onClick={() => setY(yr)}>
              {yr}{yr === years[0] ? ' (en curso)' : ''}
            </button>
          ))}
        </span>
        {nueve?.configured ? (
          <>
            <span className="sv-ot-muted">Datos de 9to5 sincronizados: {fmtWhen(nueve.last_sync)}</span>
            <button className="sv-filter-btn" disabled={syncing} onClick={sincronizar}>{syncing ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
          </>
        ) : (
          <span className="sv-to-warn-txt">Sin conexión con 9to5: solo cuentan las solicitudes metidas aquí.</span>
        )}
        <span className="sv-to-legend">
          <span className="sv-to-legend__sw sv-to-bar__seg--ok" /> aprobadas
          <span className="sv-to-legend__sw sv-to-bar__seg--pend" /> pendientes
          <span className="sv-to-legend__sw sv-to-bar__seg--cierre" /> cierre de la sala
        </span>
      </div>

      <div className="sv-to-cards">
        {cards.map(({ r, diasPend, nPend, proximas, b, nueveTxt, cuadra }) => {
          const total = Math.max(r.dev, 1)
          const propias = r.usados - r.cierreConv - (cierreExtra === 'descontar' ? r.cierreExtra : 0)
          const pct = n => `${Math.min(100, (n / total) * 100)}%`
          const pasa = r.usados + diasPend > r.dev
          return (
            <div key={r.p} className={`sv-to-card${pasa || r.restan < 0 ? ' sv-to-card--bad' : cuadra === false ? ' sv-to-card--warn' : ''}`}
              style={{ '--persona': PROF_META[r.p].color }}>
              <div className="sv-to-card__head">
                <span className="sv-to-card__name">{r.p}</span>
                {r.op !== 'no' && <span className="sv-to-card__tag">paro {PARO_VERANO[r.op].toLowerCase()}</span>}
                {cuadra === false && <span className="sv-to-card__flag" title={nueveTxt}>⚠</span>}
              </div>

              <div className="sv-to-bar" title={`${r.usados} aprobadas${diasPend ? ` + ${diasPend} pendientes` : ''} de ${r.dev}`}>
                <span className="sv-to-bar__seg sv-to-bar__seg--ok" style={{ width: pct(Math.max(0, propias)) }} />
                {r.usados - propias > 0 && <span className="sv-to-bar__seg sv-to-bar__seg--cierre" style={{ width: pct(r.usados - propias) }} />}
                {diasPend > 0 && <span className="sv-to-bar__seg sv-to-bar__seg--pend" style={{ width: pct(diasPend) }} />}
              </div>
              <div className="sv-to-card__nums">
                <span><strong>{r.usados}</strong> / {r.dev} días</span>
                {diasPend > 0 && <span className="sv-to-warn-txt">+{diasPend} pendientes ({nPend})</span>}
              </div>

              <div className="sv-to-card__row">
                Le quedan <strong className={r.restan < 0 ? 'sv-to-bad' : ''}>{r.restan}</strong>
                {b && (
                  <> · 9to5: <strong>{b.remaining ?? '—'}</strong> {cuadra ? <span className="sv-to-good">✓</span> : <span className="sv-to-warn-txt">✗</span>}</>
                )}
              </div>
              {nueveTxt && !cuadra && <div className="sv-to-card__note sv-to-warn-txt">{nueveTxt}</div>}

              <div className="sv-to-card__row">
                Verano jun–sep:{' '}
                {r.bloqueVerano >= BLOQUE_VERANO
                  ? <span className="sv-to-good">✓ bloque de {BLOQUE_VERANO}</span>
                  : r.pactado
                    ? <span className="sv-ot-muted">pactado</span>
                    : <span className={r.nParo ? 'sv-to-warn-txt' : 'sv-to-bad'}>✗ sin bloque de {BLOQUE_VERANO}{r.bloqueVerano ? ` (lleva ${r.bloqueVerano})` : ''}</span>}
              </div>

              {evOtro && (() => {
                const o = evOtro.rows.find(x => x.p === r.p)
                const pend = pendEn(r.p, otro)
                return o && (
                  <div className="sv-to-card__row sv-to-card__other" onClick={() => setY(otro)} title={`Ver ${otro}`}>
                    {otro}: le quedan <strong>{o.restan}</strong> de {o.dev}
                    {o.usados > 0 && ` (${o.usados} aprobadas)`}
                    {pend > 0 && <span className="sv-to-warn-txt"> · +{pend} pendientes</span>}
                  </div>
                )
              })()}

              <div className="sv-to-card__row sv-ot-muted">
                {proximas.length
                  ? <>Próximas: {proximas.slice(0, 2).map(q => fmtRango(q.from, q.to)).join(', ')}{proximas.length > 2 ? '…' : ''}</>
                  : 'Sin vacaciones aprobadas por delante'}
              </div>
            </div>
          )
        })}
      </div>
      <p className="sv-note">
        «Le quedan» cuenta las aprobadas (y el cierre de la sala, si lo hay) sobre lo que le toca ese año según el
        convenio y su paro, con la configuración real. La cifra de 9to5 es su saldo de ese año: si no coincide, la
        tarjeta lo explica. Las vacaciones cuentan por año natural: lo disfrutado en {years[0]} no resta de {years[1]}.
      </p>
    </div>
  )
}
