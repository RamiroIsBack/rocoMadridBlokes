import { useState, useEffect, useRef } from 'react'
import './Achievements.css'

const STORAGE_KEY = 'blokes_achievements_seen'

const CATEGORY_STYLE = {
  training:  { from: '#f97316', to: '#fbbf24' },
  blokes:    { from: '#6366f1', to: '#a78bfa' },
  comunidad: { from: '#10b981', to: '#34d399' },
}

// Badges with persistent special effects
const FIRE_BADGES  = new Set(['consistent', 'improve_25'])
const SPARK_BADGES = new Set(['twenty_five', 'all_colors', 'improve_10'])

function StarBurst() {
  return (
    <span className="achievements__starburst" aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => (
        <span key={i} className="achievements__star" style={{ '--i': i }}>✦</span>
      ))}
    </span>
  )
}

export default function Achievements({ achievements }) {
  const [newIds, setNewIds] = useState(() => new Set())
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const earned = achievements.filter(a => a.earned).map(a => a.id)
    try {
      const seen = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
      const freshIds = earned.filter(id => !seen.has(id))
      if (freshIds.length) setNewIds(new Set(freshIds))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(earned))
    } catch {}
  }, [achievements])

  const earned = achievements.filter(a => a.earned)
  const locked = achievements.filter(a => !a.earned)

  return (
    <div className="achievements">
      {earned.length === 0 && (
        <p className="achievements__empty">¡Completa retos para ganar medallas!</p>
      )}

      {earned.length > 0 && (
        <div className="achievements__grid">
          {earned.map((a, i) => {
            const { from, to } = CATEGORY_STYLE[a.category] || CATEGORY_STYLE.blokes
            const isNew   = newIds.has(a.id)
            const isFire  = FIRE_BADGES.has(a.id)
            const isSpark = SPARK_BADGES.has(a.id)
            const circleExtra = isFire ? ' achievements__circle--fire'
                              : isSpark ? ' achievements__circle--spark' : ''
            return (
              <div
                key={a.id}
                className={`achievements__badge achievements__badge--earned${isNew ? ' achievements__badge--new' : ''}`}
                title={a.desc}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                {isNew && <span className="achievements__new-label">¡Nuevo!</span>}
                <div
                  className={`achievements__circle${circleExtra}`}
                  style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                >
                  <span className="achievements__emoji">{a.emoji}</span>
                  {isNew && <StarBurst />}
                </div>
                <span className="achievements__title">{a.title}</span>
              </div>
            )
          })}
        </div>
      )}

      {locked.length > 0 && (
        <>
          <p className="achievements__locked-label">{locked.length} por conseguir</p>
          <div className="achievements__grid achievements__grid--locked">
            {locked.map(a => (
              <div key={a.id} className="achievements__badge achievements__badge--locked" title={a.desc}>
                <div className="achievements__circle achievements__circle--locked">
                  <span className="achievements__emoji">🔒</span>
                </div>
                <span className="achievements__title">{a.title}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
