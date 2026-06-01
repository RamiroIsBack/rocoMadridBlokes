import { useEffect } from 'react'
import './LeaguePromotionDialog.css'

const TIER_META = {
  1: { color: '#6b7280', emoji: '⛰️' },
  2: { color: '#84cc16', emoji: '🌿' },
  3: { color: '#3b82f6', emoji: '💧' },
  4: { color: '#f59e0b', emoji: '🌄' },
  5: { color: '#f97316', emoji: '🔥' },
  6: { color: '#ef4444', emoji: '💎' },
}

export default function LeaguePromotionDialog({ event, onClose }) {
  const isPromotion = event.event_type === 'promoted'
  const leagueName  = isPromotion ? event.to_league : event.from_league
  const tier        = isPromotion ? (event.to_tier  || 1) : (event.from_tier || 1)
  const meta        = TIER_META[tier] || TIER_META[1]

  useEffect(() => {
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="league-dialog-overlay" onClick={onClose}>
      <div
        className={`league-dialog league-dialog--${isPromotion ? 'up' : 'down'}`}
        onClick={e => e.stopPropagation()}
      >
        {isPromotion ? (
          <>
            <div className="league-dialog__emoji">{meta.emoji}</div>
            <p className="league-dialog__tag">¡Ascenso!</p>
            <h2 className="league-dialog__title" style={{ color: meta.color }}>
              {leagueName}
            </h2>
            <p className="league-dialog__sub">{event.points_at_event} pts acumulados</p>
            <button className="league-dialog__btn" onClick={onClose}>Ver mi liga</button>
          </>
        ) : (
          <>
            <div className="league-dialog__emoji">💪</div>
            <p className="league-dialog__tag league-dialog__tag--down">Bajada de liga</p>
            <h2 className="league-dialog__title" style={{ color: '#f97316' }}>
              {event.to_league}
            </h2>
            <p className="league-dialog__sub">¡Cada top te acerca a volver!</p>
            <button className="league-dialog__btn league-dialog__btn--down" onClick={onClose}>
              Ver mi liga
            </button>
          </>
        )}
      </div>
    </div>
  )
}
