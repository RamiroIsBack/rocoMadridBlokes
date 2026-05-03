import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import BodyDiagram, { ZONES, TESTS } from '../components/BodyDiagram'
import './MiClaseTab.css'

const CLUB_URL = 'https://rocomadrid.com/club'

export default function MiClaseTab() {
  const { isLoggedIn, loginUrl, classData, hasClases } = useOutletContext()
  const [activeZone, setActiveZone] = useState('lower')
  const [activeTest, setActiveTest] = useState(1)
  const data    = classData
  const loading = !data && isLoggedIn

  if (!isLoggedIn) {
    return (
      <div className="mi-clase__gate">
        <span className="mi-clase__gate-icon">🏫</span>
        <p className="mi-clase__gate-title">Inicia sesión para ver tu clase</p>
        <a href={loginUrl} className="mi-clase__gate-btn">Iniciar sesión</a>
      </div>
    )
  }

  if (loading) {
    return <div className="mi-clase__loading">Cargando tu clase…</div>
  }

  if (!data?.class) {
    return (
      <div className="mi-clase__gate">
        <span className="mi-clase__gate-icon">🔒</span>
        <p className="mi-clase__gate-title">Esta sección es para alumnos de clases dirigidas</p>
        <p className="mi-clase__gate-text">Apúntate a clases con instructor para ver el progreso de tu clase y acceder a tus tests de entrenamiento.</p>
        <a href={CLUB_URL} className="mi-clase__gate-btn">Ver clases disponibles</a>
      </div>
    )
  }

  const { class: cls, members } = data
  const testEntries = members
    .filter(m => m.tests?.[activeTest] !== undefined)
    .sort((a, b) => b.tests[activeTest].pct - a.tests[activeTest].pct)

  const maxPct   = Math.max(1, ...testEntries.map(m => Math.abs(m.tests[activeTest].pct)))
  const myRank   = testEntries.findIndex(m => m.is_me) + 1
  const withData = members.filter(m => Object.keys(m.tests).length > 0).length

  return (
    <div className="mi-clase">
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

      {myRank > 0 && (
        <div className="mi-clase__my-rank" style={{ '--zone-color': ZONES[activeZone].color }}>
          <span className="mi-clase__my-rank-pos">#{myRank}</span>
          <span className="mi-clase__my-rank-lbl">en {TESTS[activeTest].label} · {ZONES[activeZone].label}</span>
        </div>
      )}

      <div className="mi-clase__selector-wrap">
        <BodyDiagram
          activeZone={activeZone}
          onSelectZone={zone => { setActiveZone(zone); setActiveTest(ZONES[zone].tests[0]) }}
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
                    className={`mi-clase__row ${m.is_me ? 'mi-clase__row--me' : ''}`}
                    style={{ '--zone-color': ZONES[activeZone].color }}
                  >
                    <span className="mi-clase__pos">#{i + 1}</span>
                    <span className="mi-clase__name">{m.is_me ? 'Tú' : m.name}</span>
                    <div className="mi-clase__bar-wrap">
                      <div
                        className="mi-clase__bar"
                        style={{
                          width: `${barPct}%`,
                          background: pct >= 0 ? 'var(--zone-color)' : '#f97316',
                        }}
                      />
                    </div>
                    <span className={`mi-clase__pct ${pct < 0 ? 'mi-clase__pct--neg' : ''}`}>
                      {pct >= 0 ? '+' : ''}{pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
