import { useState } from 'react'
import './OnboardingTutorial.css'

export function tutorialSeen(storageKey) {
  try { return !!localStorage.getItem(storageKey) } catch { return true }
}

function markSeen(storageKey) {
  try { localStorage.setItem(storageKey, '1') } catch {}
}

// slides: [{ icon, title, text }]
export default function OnboardingTutorial({ storageKey, slides, onClose }) {
  const [step, setStep] = useState(0)
  const last = step === slides.length - 1

  const finish = () => { markSeen(storageKey); onClose() }
  const next   = () => (last ? finish() : setStep(s => s + 1))

  const slide = slides[step]

  return (
    <div className="onb-overlay" onClick={finish}>
      <div className="onb-card" onClick={e => e.stopPropagation()}>
        <button className="onb-skip" onClick={finish}>Saltar</button>
        <div className="onb-icon">{slide.icon}</div>
        <h2 className="onb-title">{slide.title}</h2>
        <p className="onb-text">{slide.text}</p>
        <div className="onb-dots">
          {slides.map((_, i) => (
            <span key={i} className={`onb-dot${i === step ? ' onb-dot--active' : ''}`} />
          ))}
        </div>
        <button className="onb-next" onClick={next}>
          {last ? 'Entendido' : 'Siguiente'}
        </button>
      </div>
    </div>
  )
}
