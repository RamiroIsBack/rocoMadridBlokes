import { useMemo, useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useCompletions } from '../hooks/useCompletions'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import { useUserTraining, useTrainingSummary } from '../hooks/useTraining'
import { computeAchievements, computeClassmateAchievements } from '../hooks/useAchievements'
import { useLeague } from '../hooks/useLeague'
import BodyDiagram, { ZONES, TESTS } from '../components/BodyDiagram'
import TrainingChart, { ProgressGauge } from '../components/TrainingChart'
import Achievements from '../components/Achievements'
import UserAvatar from '../components/UserAvatar'
import './UserStatsPage.css'
import '../components/GatePreview.css'

const TIER_META = {
  1: { color: '#6b7280', emoji: '⛰️' },
  2: { color: '#84cc16', emoji: '🌿' },
  3: { color: '#3b82f6', emoji: '💧' },
  4: { color: '#f59e0b', emoji: '🌄' },
  5: { color: '#f97316', emoji: '🔥' },
  6: { color: '#ef4444', emoji: '💎' },
}

const ZONE_COLORS = { promotion: '#22c55e', stay: '#888', demotion: '#ef4444' }

const COLOR_INFO = {
  green:  { name: 'Verde',    bg: '#22c55e' },
  blue:   { name: 'Azul',     bg: '#3b82f6' },
  yellow: { name: 'Amarillo', bg: '#eab308' },
  red:    { name: 'Rojo',     bg: '#ef4444' },
  black:  { name: 'Negro',    bg: '#1f2937' },
  blanco: { name: 'Trave',    bg: '#e5e7eb' },
}

const SALA_LABELS = {
  entrada:    'Entrada',
  sala_grande: 'Sala Grande',
  cueva:      'Cueva',
}

const RATING_ICONS = [
  { id: 'star_1', emoji: '⭐', label: 'Me gusta' },
]

function fmtDate(ts) {
  const diffD = Math.floor((Date.now() - new Date(ts)) / 86400000)
  if (diffD === 0) return 'Hoy'
  if (diffD === 1) return 'Ayer'
  if (diffD < 7) return `Hace ${diffD}d`
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function monthLabel(key) {
  const [year, month] = key.split('-')
  return new Date(parseInt(year), parseInt(month) - 1)
    .toLocaleString('es-ES', { month: 'short', year: '2-digit' })
}

export default function UserStatsPage() {
  const outletCtx = (() => { try { return useOutletContext() } catch { return {} } })()
  const hasClases = outletCtx?.hasClases ?? true
  const classData = outletCtx?.classData ?? null

  const { isLoggedIn, loginUrl, completedByMe, completionLog, ratingLog, firstAscentIds } = useCompletions()
  const { cards } = useWordPressPosts()
  const userId = window.blokesSiteData?.userId || 0
  const { myLeague, leaderboard: leagueLb } = useLeague()
  const { history: trainingHistory } = useUserTraining(isLoggedIn ? userId : null)
  const trainingSummary = useTrainingSummary()
  const [activeZone, setActiveZone] = useState('lower')
  const [activeTest, setActiveTest] = useState(1)
  const [testInfoId, setTestInfoId] = useState(null)

  const [classNotifs, setClassNotifs] = useState([])
  const notifsInit = useRef(false)

  useEffect(() => {
    if (notifsInit.current || !hasClases || !classData?.members?.length) return
    notifsInit.current = true
    const KEY = 'blokes_class_notifs_seen'
    let stored = null
    try { stored = JSON.parse(localStorage.getItem(KEY)) } catch {}
    const toStore = {}
    const notifs = []
    for (const member of classData.members) {
      if (member.is_me) continue
      const achs = computeClassmateAchievements(member)
      const earnedIds = achs.filter(a => a.earned).map(a => a.id)
      toStore[member.name] = earnedIds
      if (stored !== null) {
        const seen = new Set(stored[member.name] || [])
        for (const id of earnedIds) {
          if (!seen.has(id)) notifs.push({ name: member.name, ach: achs.find(a => a.id === id) })
        }
      }
    }
    try { localStorage.setItem(KEY, JSON.stringify(toStore)) } catch {}
    setClassNotifs(notifs)
  }, [hasClases, classData])

  const achievements = useMemo(
    () => computeAchievements(trainingHistory, completionLog, ratingLog, firstAscentIds),
    [trainingHistory, completionLog, ratingLog, firstAscentIds]
  )

  const byColor = useMemo(() => {
    const acc = {}
    completionLog.forEach(e => { acc[e.color] = (acc[e.color] || 0) + 1 })
    return acc
  }, [completionLog])

  const bySala = useMemo(() => {
    const acc = {}
    completionLog.forEach(e => {
      const sala = e.sala || 'entrada'
      acc[sala] = (acc[sala] || 0) + 1
    })
    return acc
  }, [completionLog])

  const byMonth = useMemo(() => {
    const acc = {}
    completionLog.forEach(e => {
      const d = new Date(e.timestamp)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      acc[key] = (acc[key] || 0) + 1
    })
    return Object.keys(acc).sort().slice(-6).map(k => ({ key: k, count: acc[k] }))
  }, [completionLog])

  const maxMonth = Math.max(1, ...byMonth.map(m => m.count))

  const ratingCounts = useMemo(() => {
    const acc = { star_1: 0, star_2: 0, star_3: 0, skull: 0 }
    ratingLog.forEach(e => { if (acc[e.type] !== undefined) acc[e.type]++ })
    return { star_1: acc.star_1 + acc.star_2 + acc.star_3 + acc.skull }
  }, [ratingLog])

  const cardMap = useMemo(() => {
    const m = {}
    cards.forEach(c => { m[c.postId] = c })
    return m
  }, [cards])

  const thisWeekCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    return completionLog.filter(e => new Date(e.timestamp) >= cutoff).length
  }, [completionLog])

  const completionHistory = useMemo(() => (
    [...completionLog]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .filter(e => cardMap[e.postId])
      .slice(0, 30)
      .map(e => ({ ...e, card: cardMap[e.postId] }))
  ), [completionLog, cardMap])

  const totalRatings = Object.values(ratingCounts).reduce((a, b) => a + b, 0)
  const total = completedByMe.size

  if (!isLoggedIn) {
    return (
      <div className="user-stats__gate">
        <p className="user-stats__gate-text">Inicia sesión para ver tus estadísticas</p>
        <a href={loginUrl || '/wp-login.php'} className="user-stats__gate-btn">Iniciar sesión</a>

        <div className="gate-preview">
          <p className="gate-preview__label">¿Qué verás aquí?</p>
          <p className="gate-preview__intro">
            Registra cuántos blokes has conseguido, sigue tu evolución mes a mes,
            compara tu nivel con el de tu clase y desbloquea logros según tu actividad.
          </p>
          <div className="gate-preview__cards">

            <div className="gate-preview__card">
              <div className="gate-preview__card-title">Progresión mensual</div>
              <div className="gate-preview__bars">
                {[28, 45, 38, 62, 55, 80].map((h, i) => (
                  <div key={i} className="gate-preview__month-bar" style={{ height: `${h}%` }} />
                ))}
              </div>
              <p className="gate-preview__card-desc">Cuántos tops consigues cada mes</p>
            </div>

            <div className="gate-preview__card">
              <div className="gate-preview__card-title">Por color</div>
              <div className="gate-preview__colors">
                {[
                  { bg: '#22c55e', pct: 100 },
                  { bg: '#3b82f6', pct: 68 },
                  { bg: '#ef4444', pct: 44 },
                  { bg: '#eab308', pct: 27 },
                  { bg: '#1f2937', pct: 14 },
                ].map((c, i) => (
                  <div key={i} className="gate-preview__color-row">
                    <span className="gate-preview__dot" style={{ background: c.bg }} />
                    <div className="gate-preview__color-bar-wrap">
                      <div className="gate-preview__color-bar" style={{ width: `${c.pct}%`, background: c.bg }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="gate-preview__card-desc">Tops desglosados por nivel</p>
            </div>

            <div className="gate-preview__card">
              <div className="gate-preview__card-title">Logros</div>
              <div className="gate-preview__achievements">
                {[
                  { emoji: '🏆', title: 'Primeros pasos', earned: true },
                  { emoji: '🔥', title: 'Racha imparable', earned: true },
                  { emoji: '💪', title: 'Escalador del mes', earned: false },
                ].map((a, i) => (
                  <div key={i} className={`gate-preview__ach gate-preview__ach--${a.earned ? 'earned' : 'locked'}`}>
                    <span className="gate-preview__ach-emoji">{a.emoji}</span>
                    <span className="gate-preview__ach-title">{a.title}</span>
                  </div>
                ))}
              </div>
              <p className="gate-preview__card-desc">Retos desbloqueados según tu actividad</p>
            </div>

          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="user-stats">
      <h1 className="user-stats__title">Mis blokes</h1>

      <div className="user-stats__total">
        <span className="user-stats__total-num">{total}</span>
        <div>
          <span className="user-stats__total-label">TOPs conseguidos</span>
          {thisWeekCount > 0 && (
            <div className="user-stats__week-pill">+{thisWeekCount} esta semana</div>
          )}
        </div>
      </div>

      {/* Mini league leaderboard */}
      {myLeague && (() => {
        const meta = TIER_META[myLeague.tier] || TIER_META[1]
        const mini = leagueLb.slice(0, 5)
        return (
          <section className="user-stats__section user-stats__league-mini">
            <div className="usl-header" style={{ borderColor: meta.color }}>
              <span className="usl-emoji">{meta.emoji}</span>
              <div>
                <div className="usl-name" style={{ color: meta.color }}>{myLeague.name}</div>
                <div className="usl-info">
                  Puesto <strong>#{myLeague.rank}</strong> · {myLeague.totalPoints} pts
                  <span className="usl-zone" style={{ color: ZONE_COLORS[myLeague.zone] }}>
                    {' '}· {myLeague.zone === 'promotion' ? '🟢 Ascenso' : myLeague.zone === 'demotion' ? '🔴 Descenso' : '⚪ Permanencia'}
                  </span>
                </div>
              </div>
            </div>
            <div className="usl-rows">
              {mini.map(m => (
                <div key={m.userId} className={`usl-row${m.isMe ? ' usl-row--me' : ''}`}>
                  <span className="usl-rank">#{m.rank}</span>
                  <UserAvatar
                    size="xs"
                    avatarType={m.avatarType || ''}
                    avatarData={m.avatarData || {}}
                    nickname={m.nickname || ''}
                    name={m.name || ''}
                    isMe={m.isMe}
                    showNickname
                  />
                  <span className="usl-pts">{m.totalPoints} pts</span>
                </div>
              ))}
            </div>
            <Link to="/ligas" className="usl-link">Ver liga completa →</Link>
          </section>
        )
      })()}

      {classNotifs.length > 0 && (
        <section className="user-stats__section">
          <h2 className="user-stats__section-title">Novedades de tu clase</h2>
          <div className="user-stats__notifs">
            {classNotifs.map((n, i) => (
              <div key={i} className="user-stats__notif">
                <span className="user-stats__notif-icon">🎉</span>
                <span className="user-stats__notif-text">
                  ¡Felicita a <strong>{n.name}</strong>! Ha logrado <em>{n.ach.title}</em> {n.ach.emoji}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {total === 0 ? (
        <p className="user-stats__empty">Aún no has marcado ningún bloke como TOP. ¡Venga!</p>
      ) : (
        <>
          <section className="user-stats__section">
            <h2 className="user-stats__section-title">Por color</h2>
            <div className="user-stats__colors">
              {Object.entries(COLOR_INFO).map(([key, info]) => {
                const count = byColor[key] || 0
                if (!count) return null
                return (
                  <div key={key} className="user-stats__color-item">
                    <span className="user-stats__color-dot" style={{ background: info.bg }} />
                    <span className="user-stats__color-count">{count}</span>
                    <span className="user-stats__color-name">{info.name}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="user-stats__section">
            <h2 className="user-stats__section-title">Por sala</h2>
            <div className="user-stats__salas">
              {Object.entries(SALA_LABELS).map(([key, name]) => (
                <div key={key} className="user-stats__sala-badge">
                  <span className="user-stats__sala-count">{bySala[key] || 0}</span>
                  <span className="user-stats__sala-name">{name}</span>
                </div>
              ))}
            </div>
          </section>

          {byMonth.length > 0 && (
            <section className="user-stats__section">
              <h2 className="user-stats__section-title">Progresión</h2>
              <div className="user-stats__months">
                {byMonth.map(({ key, count }) => (
                  <div key={key} className="user-stats__month-row">
                    <span className="user-stats__month-label">{monthLabel(key)}</span>
                    <div className="user-stats__month-bar-wrap">
                      <div
                        className="user-stats__month-bar"
                        style={{ width: `${(count / maxMonth) * 100}%` }}
                      />
                    </div>
                    <span className="user-stats__month-count">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {completionHistory.length > 0 && (
            <section className="user-stats__section">
              <h2 className="user-stats__section-title">
                Historial{completionLog.length > 30 ? ' (últimos 30)' : ''}
              </h2>
              <div className="user-stats__history">
                {completionHistory.map((e, i) => (
                  <div key={i} className="user-stats__history-row">
                    <span
                      className="user-stats__history-dot"
                      style={{ background: COLOR_INFO[e.color]?.bg ?? '#ccc' }}
                    />
                    <span className="user-stats__history-title">{e.card.title}</span>
                    <span className="user-stats__history-date">{fmtDate(e.timestamp)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {hasClases && classData?.members?.length > 0 && (() => {
        const sorted = [...classData.members]
          .sort((a, b) => (b.bloke_total ?? 0) - (a.bloke_total ?? 0))
        if (sorted.every(m => !m.bloke_total)) return null
        const maxTotal = Math.max(1, ...sorted.map(m => m.bloke_total ?? 0))
        const myRank = sorted.findIndex(m => m.is_me) + 1
        return (
          <section className="user-stats__section">
            <h2 className="user-stats__section-title">Tu clase — Blokes</h2>
            {myRank > 0 && (
              <p className="user-stats__class-rank-pill">
                #{myRank} de {sorted.length} en tu clase
              </p>
            )}
            <div className="user-stats__class-blokes">
              {sorted.map((m, i) => {
                const tot = m.bloke_total ?? 0
                return (
                  <div key={i} className={`user-stats__class-row ${m.is_me ? 'user-stats__class-row--me' : ''}`}>
                    <span className="user-stats__class-pos">#{i + 1}</span>
                    <span className="user-stats__class-name">{m.is_me ? 'Tú' : m.name}</span>
                    <div className="user-stats__class-bar-wrap">
                      <div className="user-stats__class-bar" style={{ width: `${(tot / maxTotal) * 100}%` }} />
                    </div>
                    <span className="user-stats__class-count">{tot}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })()}

      <section className="user-stats__section">
        <h2 className="user-stats__section-title">Mi progreso de entrenamiento</h2>
        {hasClases ? (
          <div className="training-block">
            <BodyDiagram
              activeZone={activeZone}
              onSelectZone={(zone) => {
                setActiveZone(zone)
                setActiveTest(ZONES[zone].tests[0])
              }}
            />
            <div className="training-select-row">
              <select
                value={activeTest}
                onChange={e => setActiveTest(Number(e.target.value))}
                className="training-test-select"
              >
                {ZONES[activeZone].tests.map(tid => (
                  <option key={tid} value={tid}>{TESTS[tid].label} ({TESTS[tid].unit})</option>
                ))}
              </select>
              <button className="test-info-btn" onClick={() => setTestInfoId(activeTest)} title="Descripción del test">ℹ</button>
            </div>
            <TrainingChart
              userEntries={trainingHistory[activeTest] || []}
              communitySummary={trainingSummary[activeTest] || {}}
              color={ZONES[activeZone].color}
              unit={TESTS[activeTest].unit}
            />
            <div className="training-bottom">
              <ProgressGauge
                userEntries={trainingHistory[activeTest] || []}
                communitySummary={trainingSummary[activeTest] || {}}
                color={ZONES[activeZone].color}
                unit={TESTS[activeTest].unit}
              />
              {(() => {
                const sorted = (classData?.members || [])
                  .filter(m => m.tests?.[activeTest] !== undefined)
                  .sort((a, b) => b.tests[activeTest].pct - a.tests[activeTest].pct)
                const rank = sorted.findIndex(m => m.is_me) + 1
                if (!rank || sorted.length < 2) return null
                return (
                  <div className="user-stats__class-rank-label">
                    Posición en tu clase: #{rank} de {sorted.length} — {TESTS[activeTest].label}
                  </div>
                )
              })()}
            </div>
          </div>
        ) : (
          <div className="user-stats__training-locked">
            <span className="user-stats__training-locked-icon">🔒</span>
            <p className="user-stats__training-locked-title">Exclusivo para alumnos de clases dirigidas</p>
            <p className="user-stats__training-locked-text">Tu instructor registra los resultados de tus tests. Apúntate a clases con instructor para desbloquear tu progreso.</p>
            <a href="https://rocomadrid.com/club/actividades-para-socios" className="user-stats__training-locked-btn">Ver clases disponibles</a>
          </div>
        )}
      </section>

      <section className="user-stats__section">
        <h2 className="user-stats__section-title">Logros</h2>
        <Achievements achievements={achievements} />
      </section>

      <section className="user-stats__section">
        <h2 className="user-stats__section-title">Mis valoraciones</h2>
        {totalRatings === 0 ? (
          <p className="user-stats__empty">Aún no has valorado ningún bloke.</p>
        ) : (
          <div className="user-stats__ratings">
            {RATING_ICONS.map(({ id, emoji, label }) => (
              <div key={id} className="user-stats__rating-item">
                <span className="user-stats__rating-emoji">{emoji}</span>
                <span className="user-stats__rating-count">{ratingCounts[id]}</span>
                <span className="user-stats__rating-label">{label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {testInfoId !== null && (
        <div className="test-info-overlay" onClick={() => setTestInfoId(null)}>
          <div className="test-info-card" onClick={e => e.stopPropagation()}>
            <div className="test-info-card__header">
              <span className="test-info-card__name">{TESTS[testInfoId].label}</span>
              <span className="test-info-card__unit">({TESTS[testInfoId].unit})</span>
            </div>
            <button className="test-info-card__close" onClick={() => setTestInfoId(null)}>×</button>
            <p className="test-info-card__desc">{TESTS[testInfoId].desc}</p>
          </div>
        </div>
      )}
    </div>
  )
}
