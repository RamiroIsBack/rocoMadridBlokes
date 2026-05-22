import { useEffect } from 'react'
import './CelebrationDialog.css'

export default function CelebrationDialog({ title, count, firstAscent = false, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, firstAscent ? 12000 : 8000)
    return () => clearTimeout(t)
  }, [onClose, firstAscent])

  if (firstAscent) {
    return (
      <div className="celeb-overlay" onClick={onClose}>
        <div className="celeb-dialog celeb-dialog--first" onClick={e => e.stopPropagation()}>
          <div className="celeb-monkey">🏴</div>
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
        <div className="celeb-monkey">🧗</div>
        <h2 className="celeb-heading">¡Vamo bicho!</h2>
        <p className="celeb-main">
          ¡Eres el número <strong>{count}</strong> que ha subido
        </p>
        <p className="celeb-bloke">"{title}"</p>
        <p className="celeb-sub">¡Sigue así! 💪</p>
        <button className="celeb-btn" onClick={onClose}>¡A por otro!</button>
      </div>
    </div>
  )
}
