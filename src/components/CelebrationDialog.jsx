import { useEffect } from 'react'
import './CelebrationDialog.css'

export default function CelebrationDialog({ title, count, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000)
    return () => clearTimeout(t)
  }, [onClose])

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
