import { useMemo } from 'react'
import { useCompletions } from '../hooks/useCompletions'
import './UserStatsPage.css'

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
  { id: 'star_1', emoji: '⭐',     label: 'Buen bloke' },
  { id: 'star_2', emoji: '⭐⭐',   label: 'Muy buen bloke' },
  { id: 'star_3', emoji: '⭐⭐⭐', label: 'Blokazo' },
  { id: 'skull',  emoji: '💀',     label: 'Amor-odio' },
]

function monthLabel(key) {
  const [year, month] = key.split('-')
  return new Date(parseInt(year), parseInt(month) - 1)
    .toLocaleString('es-ES', { month: 'short', year: '2-digit' })
}

export default function UserStatsPage() {
  const { isLoggedIn, loginUrl, completedByMe, completionLog, ratingLog } = useCompletions()

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
    return acc
  }, [ratingLog])

  const totalRatings = Object.values(ratingCounts).reduce((a, b) => a + b, 0)
  const total = completedByMe.size

  if (!isLoggedIn) {
    return (
      <div className="user-stats__gate">
        <p className="user-stats__gate-text">Inicia sesión para ver tus estadísticas</p>
        <a href={loginUrl} className="user-stats__gate-btn">Iniciar sesión</a>
      </div>
    )
  }

  return (
    <div className="user-stats">
      <h1 className="user-stats__title">Mis blokes</h1>

      <div className="user-stats__total">
        <span className="user-stats__total-num">{total}</span>
        <span className="user-stats__total-label">TOPs conseguidos</span>
      </div>

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
        </>
      )}

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
    </div>
  )
}
