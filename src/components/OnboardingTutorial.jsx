import { useEffect, useState } from 'react'
import './OnboardingTutorial.css'

export function tutorialSeen(storageKey) {
  try { return !!localStorage.getItem(storageKey) } catch { return true }
}

function markSeen(storageKey) {
  try { localStorage.setItem(storageKey, '1') } catch {}
}

function useTargetRect(selector) {
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (!selector) { setRect(null); return }
    let raf = null
    function update() {
      const el = document.querySelector(selector)
      if (el) setRect(el.getBoundingClientRect())
      raf = requestAnimationFrame(update)
    }
    const el = document.querySelector(selector)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    update()
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [selector])

  return rect
}

function Dots({ slides, step }) {
  return (
    <div className="onb-dots">
      {slides.map((_, i) => (
        <span key={i} className={`onb-dot${i === step ? ' onb-dot--active' : ''}`} />
      ))}
    </div>
  )
}

// slides: [{ icon?, title, text, target? }] — target is a CSS selector to spotlight
export default function OnboardingTutorial({ storageKey, slides, onClose }) {
  const [step, setStep] = useState(0)
  const slide = slides[step]
  const last = step === slides.length - 1
  const rect = useTargetRect(slide.target)

  const finish = () => { markSeen(storageKey); onClose() }
  const next = () => (last ? finish() : setStep(s => s + 1))

  // Spotlight mode: highlight a real element on the page
  if (slide.target) {
    if (!rect) return null // target not mounted yet this tick
    const pad = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const spaceBelow = vh - rect.bottom
    const showBelow = spaceBelow > 170
    const left = Math.min(Math.max(rect.left - 20, 12), vw - 272)

    return (
      <>
        <div className="onb-dim" onClick={finish} />
        <div
          className="onb-hole"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
        <div
          className="onb-coach"
          style={showBelow ? { top: rect.bottom + pad + 10, left } : { bottom: vh - rect.top + pad + 10, left }}
          onClick={e => e.stopPropagation()}
        >
          <div className={`onb-coach-arrow${showBelow ? '' : ' onb-coach-arrow--down'}`} style={{ left: Math.min(Math.max(rect.left + rect.width / 2 - left, 16), 240) }} />
          <button className="onb-skip" onClick={finish}>Saltar</button>
          <h3 className="onb-coach-title">{slide.title}</h3>
          <p className="onb-coach-text">{slide.text}</p>
          <Dots slides={slides} step={step} />
          <button className="onb-next" onClick={next}>{last ? 'Entendido' : 'Siguiente'}</button>
        </div>
      </>
    )
  }

  // Fallback: centered card, for slides with no real element to point at
  return (
    <div className="onb-overlay" onClick={finish}>
      <div className="onb-card" onClick={e => e.stopPropagation()}>
        <button className="onb-skip" onClick={finish}>Saltar</button>
        {slide.icon && <div className="onb-icon">{slide.icon}</div>}
        <h2 className="onb-title">{slide.title}</h2>
        <p className="onb-text">{slide.text}</p>
        <Dots slides={slides} step={step} />
        <button className="onb-next" onClick={next}>
          {last ? 'Entendido' : 'Siguiente'}
        </button>
      </div>
    </div>
  )
}
