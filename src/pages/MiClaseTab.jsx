import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import BodyDiagram, { ZONES, TESTS } from '../components/BodyDiagram'
import './MiClaseTab.css'
import '../components/GatePreview.css'

const CLUB_URL = 'https://rocomadrid.com/club/actividades-para-socios'

const COLOR_INFO = {
  green:  { name: 'Verde',    bg: '#22c55e' },
  blue:   { name: 'Azul',     bg: '#3b82f6' },
  yellow: { name: 'Amarillo', bg: '#eab308' },
  red:    { name: 'Rojo',     bg: '#ef4444' },
  black:  { name: 'Negro',    bg: '#1f2937' },
  blanco: { name: 'Trave',    bg: '#e5e7eb' },
}

const RATING_ICONS = [
  { id: 'star_1', emoji: '⭐', label: 'Me gusta' },
]

export default function MiClaseTab() {
  const { isLoggedIn, loginUrl, classData } = useOutletContext()
  const [activeZone, setActiveZone] = useState('lower')
  const [activeTest, setActiveTest] = useState(1)
  const [animated, setAnimated]     = useState(false)
  const data    = classData
  const loading = !data && isLoggedIn

  useEffect(() => {
    if (!data) return
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 150)
    return () => clearTimeout(t)
  }, [data, activeTest])

  if (!isLoggedIn) {
    return (
      <div className="mi-clase__gate">
        <span className="mi-clase__gate-icon">🏫</span>
        <p className="mi-clase__gate-title">Inicia sesión para ver tu clase</p>
        <a href={loginUrl || '/wp-login.php'} className="mi-clase__gate-btn">Iniciar sesión</a>

        <div className="gate-preview">
          <p className="gate-preview__label">¿Qué verás aquí?</p>
          <p className="gate-preview__intro">
            Compara tu rendimiento con el resto de tu clase: ranking de blokes,
            posición en tests físicos y los problemas más populares de tu grupo.
          </p>
          <div className="gate-preview__cards">

            <div className="gate-preview__card">
              <div className="gate-preview__card-title">Ranking de blokes</div>
              <div className="gate-preview__leaderboard">
                {[
                  { name: 'Ana',    pct: 100, me: false },
                  { name: 'Tú',    pct: 78,  me: true  },
                  { name: 'Carlos', pct: 62,  me: false },
                  { name: 'Laura',  pct: 40,  me: false },
                ].map((r, i) => (
                  <div key={i} className={`gate-preview__lb-row${r.me ? ' gate-preview__lb-row--me' : ''}`}>
                    <span className="gate-preview__lb-pos">#{i + 1}</span>
                    <span className="gate-preview__lb-name">{r.name}</span>
                    <div className="gate-preview__lb-bar-wrap">
                      <div className="gate-preview__lb-bar" style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="gate-preview__card-desc">Blokes conseguidos por cada alumno</p>
            </div>

            <div className="gate-preview__card">
              <div className="gate-preview__card-title">Tests físicos</div>
              <div className="gate-preview__leaderboard">
                {[
                  { name: 'Carlos', pct: 100, me: false },
                  { name: 'Tú',    pct: 85,  me: true  },
                  { name: 'Ana',   pct: 72,  me: false },
                  { name: 'Laura', pct: 55,  me: false },
                ].map((r, i) => (
                  <div key={i} className={`gate-preview__lb-row${r.me ? ' gate-preview__lb-row--me' : ''}`}>
                    <span className="gate-preview__lb-pos">#{i + 1}</span>
                    <span className="gate-preview__lb-name">{r.name}</span>
                    <div className="gate-preview__lb-bar-wrap">
                      <div
                        className="gate-preview__lb-bar"
                        style={{ width: `${r.pct}%`, background: r.me ? undefined : 'rgba(59,130,246,0.22)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="gate-preview__card-desc">Tu posición en fuerza y resistencia</p>
            </div>

          </div>
        </div>
      </div>
    )
  }
  if (loading) return <div className="mi-clase__loading">Cargando tu clase…</div>
  if (!data?.class) {
    return (
      <div className="mi-clase__gate">
        <span className="mi-clase__gate-icon">🔒</span>
        <p className="mi-clase__gate-title">Esta sección es para alumnos de clases dirigidas</p>
        <p className="mi-clase__gate-text">Apúntate a clases con instructor para ver el progreso de tu clase.</p>
        <a href={CLUB_URL} className="mi-clase__gate-btn">Ver clases disponibles</a>
      </div>
    )
  }

  const { class: cls, members, top_blokes: topBlokes = [] } = data

  // ── Training ──
  const testEntries = members
    .filter(m => m.tests?.[activeTest] !== undefined)
    .sort((a, b) => b.tests[activeTest].pct - a.tests[activeTest].pct)
  const maxPct   = Math.max(1, ...testEntries.map(m => Math.abs(m.tests[activeTest].pct)))
  const myRank   = testEntries.findIndex(m => m.is_me) + 1
  const withData = members.filter(m => Object.keys(m.tests).length > 0).length

  // ── Blokes ──
  const blokeSorted = [...members].sort((a, b) => (b.bloke_total ?? 0) - (a.bloke_total ?? 0))
  const hasBlokes   = blokeSorted.some(m => (m.bloke_total ?? 0) > 0)

  // ── Ratings ──
  const ratingSorted = [...members]
    .filter(m => (m.rating_total ?? 0) > 0)
    .sort((a, b) => (b.rating_total ?? 0) - (a.rating_total ?? 0))

  return (
    <div className="mi-clase">

      {/* Header */}
      <div className="mi-clase__header">
        <div>
          <h2 className="mi-clase__title">Tu clase</h2>
          <p className="mi-clase__subtitle">{cls.dia} · {cls.horario} · {members.length} alumnos</p>
        </div>
        {withData > 0 && (
          <div className="mi-clase__stat-pill">
            <span className="mi-clase__stat-num">{withData}</span>
            <span className="mi-clase__stat-lbl">con datos</span>
          </div>
        )}
      </div>

      {/* ─── ENTRENAMIENTO ─── */}
      <section className="mi-clase__section">
        <h3 className="mi-clase__section-title">Entrenamiento</h3>

        {myRank > 0 && (
          <div className="mi-clase__my-rank" style={{ '--zone-color': ZONES[activeZone].color }}>
            <span className="mi-clase__my-rank-pos">#{myRank}</span>
            <span className="mi-clase__my-rank-lbl">en {TESTS[activeTest].label} · {ZONES[activeZone].label}</span>
          </div>
        )}

        <div className="mi-clase__selector-wrap">
          <BodyDiagram
            activeZone={activeZone}
            onSelectZone={zone => {
              setActiveZone(zone)
              setActiveTest(ZONES[zone].tests[0])
            }}
          />
          <div className="mi-clase__selector-right">
            <div className="mi-clase__test-btns">
              {ZONES[activeZone].tests.map(tid => (
                <button
                  key={tid}
                  className={`mi-clase__test-btn ${activeTest === tid ? 'mi-clase__test-btn--active' : ''}`}
                  style={{ '--zone-color': ZONES[activeZone].color }}
                  onClick={() => setActiveTest(tid)}
                >
                  {TESTS[tid].label}
                </button>
              ))}
            </div>
            {testEntries.length === 0 ? (
              <p className="mi-clase__no-data">Sin datos en este test todavía</p>
            ) : (
              <div className="mi-clase__leaderboard">
                {testEntries.map((m, i) => {
                  const pct    = m.tests[activeTest].pct
                  const barPct = Math.abs(pct) / maxPct * 100
                  return (
                    <div
                      key={i}
                      className={`mi-clase__row${m.is_me ? ' mi-clase__row--me' : ''}`}
                      style={{ '--zone-color': ZONES[activeZone].color, animationDelay: `${i * 55}ms` }}
                    >
                      <span className="mi-clase__pos">#{i + 1}</span>
                      <span className="mi-clase__name">{m.is_me ? 'Tú' : m.name}</span>
                      <div className="mi-clase__bar-wrap">
                        <div
                          className="mi-clase__bar"
                          style={{
                            width: animated ? `${barPct}%` : '0%',
                            background: pct >= 0 ? 'var(--zone-color)' : '#f97316',
                          }}
                        />
                      </div>
                      <span className={`mi-clase__pct${pct < 0 ? ' mi-clase__pct--neg' : ''}`}>
                        {pct >= 0 ? '+' : ''}{pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── BLOKES ─── */}
      {hasBlokes && (
        <section className="mi-clase__section">
          <h3 className="mi-clase__section-title">Blokes</h3>
          <div className="mi-clase__bloke-list">
            {blokeSorted.map((m, i) => {
              const total   = m.bloke_total ?? 0
              const byColor = m.bloke_by_color ?? {}
              return (
                <div
                  key={i}
                  className={`mi-clase__bloke-row${m.is_me ? ' mi-clase__bloke-row--me' : ''}`}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  <span className="mi-clase__bloke-pos">#{i + 1}</span>
                  <span className="mi-clase__bloke-name">{m.is_me ? 'Tú' : m.name}</span>
                  <div className="mi-clase__color-bar">
                    {Object.entries(COLOR_INFO).map(([key, info]) => {
                      const cnt = byColor[key] ?? 0
                      if (!cnt || !total) return null
                      return (
                        <div
                          key={key}
                          className="mi-clase__color-seg"
                          title={`${info.name}: ${cnt}`}
                          style={{
                            background: info.bg,
                            width: animated ? `${(cnt / total) * 100}%` : '0%',
                          }}
                        />
                      )
                    })}
                  </div>
                  <span className="mi-clase__bloke-total">{total}</span>
                </div>
              )
            })}
          </div>
          <div className="mi-clase__color-legend">
            {Object.entries(COLOR_INFO).map(([key, info]) => (
              <span key={key} className="mi-clase__legend-item">
                <span className="mi-clase__legend-dot" style={{ background: info.bg }} />
                {info.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ─── TOP BLOKES ─── */}
      {topBlokes.length > 0 && (
        <section className="mi-clase__section">
          <h3 className="mi-clase__section-title">Blokes más populares</h3>
          <div className="mi-clase__top-blokes">
            {topBlokes.map((b, i) => (
              <div
                key={b.post_id}
                className="mi-clase__top-bloke"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div
                  className="mi-clase__top-bloke-stripe"
                  style={{ background: COLOR_INFO[b.color]?.bg ?? '#ccc' }}
                />
                <div className="mi-clase__top-bloke-body">
                  <span className="mi-clase__top-bloke-title">{b.title}</span>
                  <span className="mi-clase__top-bloke-count">
                    {b.count} <span>{b.count === 1 ? 'alumno' : 'alumnos'}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── VALORACIONES ─── */}
      {ratingSorted.length > 0 && (
        <section className="mi-clase__section">
          <h3 className="mi-clase__section-title">Valoraciones</h3>
          <div className="mi-clase__rating-list">
            {ratingSorted.map((m, i) => (
              <div
                key={i}
                className={`mi-clase__rating-row${m.is_me ? ' mi-clase__rating-row--me' : ''}`}
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <span className="mi-clase__rating-name">{m.is_me ? 'Tú' : m.name}</span>
                <div className="mi-clase__rating-chips">
                  {RATING_ICONS.map(({ id, emoji, label }) => {
                    const r = m.rating_by_type || {}
                    const cnt = (r.star_1 ?? 0) + (r.star_2 ?? 0) + (r.star_3 ?? 0) + (r.skull ?? 0)
                    if (!cnt) return null
                    return (
                      <span
                        key={id}
                        className="mi-clase__rating-chip"
                        title={`${label}: ${cnt}`}
                        style={{ animationDelay: `${i * 55 + 80}ms` }}
                      >
                        {emoji} <b>{cnt}</b>
                      </span>
                    )
                  })}
                </div>
                <span className="mi-clase__rating-total">{m.rating_total}</span>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
