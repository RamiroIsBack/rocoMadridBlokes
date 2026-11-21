import { useEffect } from 'react'
import './CelebrationDialog.css'

// Opción 4 de NOTAS_PARA_CODE_ligas_incentivo.md: "+X pts · te faltan Y para subir a Liga Z",
// debajo del mensaje de siempre. `league` es el objeto que ya devuelve el backend
// (blokes_register_top_for_leagues) al apuntar un top — null si ni siquiera llegó a puntuar.
function LeagueFeedback({ league }) {
  if (!league) return null
  const bonus = []
  if (league.bonusNuevo > 0) bonus.push('bloke nuevo ×2')
  if (league.bonusRacha > 0) bonus.push('🔥 racha +5')
  return (
    <p className="celeb-league">
      +{league.pointsEarned} pts{bonus.length > 0 && ` (${bonus.join(' · ')})`}
      {league.pointsToPromote != null && league.nextLeagueName && (
        <> · te faltan <strong>{league.pointsToPromote}</strong> para subir a {league.nextLeagueName}</>
      )}
    </p>
  )
}

export default function CelebrationDialog({ title, count, firstAscent = false, league = null, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, firstAscent ? 12000 : 8000)
    return () => clearTimeout(t)
  }, [onClose, firstAscent])

  if (firstAscent) {
    return (
      <div className="celeb-overlay" onClick={onClose}>
        <div className="celeb-dialog celeb-dialog--first" onClick={e => e.stopPropagation()}>
          <img src="https://rocomadrid.com/wp-content/uploads/2026/05/gifmonodandovueltas.gif" alt="" className="celeb-monkey-gif" />
          <h2 className="celeb-heading celeb-heading--first">¡PRIMER TOP DEL GYM!</h2>
          <p className="celeb-main">Eres el <strong>primero</strong> en encadenar</p>
          <p className="celeb-bloke">"{title}"</p>
          <p className="celeb-sub">Esta marca queda para siempre en el bloke 🔥</p>
          <button className="celeb-btn" onClick={onClose}>¡Histórico!</button>
        </div>
      </div>
    )
  }

  return (
    <div className="celeb-overlay" onClick={onClose}>
      <div className="celeb-dialog" onClick={e => e.stopPropagation()}>
        <img src="https://rocomadrid.com/wp-content/uploads/2026/05/gifmonodandovueltas.gif" alt="" className="celeb-monkey-gif" />
        <h2 className="celeb-heading">¡Vamo bicho!</h2>
        <p className="celeb-main">
          ¡Eres el número <strong>{count}</strong> que ha subido
        </p>
        <p className="celeb-bloke">"{title}"</p>
        <LeagueFeedback league={league} />
        <p className="celeb-sub">¡Sigue así! 💪</p>
        <button className="celeb-btn" onClick={onClose}>¡A por otro!</button>
      </div>
    </div>
  )
}
