import './BodyDiagram.css'

export const ZONES = {
  lower:   { label: 'Tren inferior', color: '#3b82f6', tests: [1, 2] },
  upper:   { label: 'Tren superior', color: '#f97316', tests: [3, 4] },
  fingers: { label: 'Dedos',         color: '#a855f7', tests: [5, 6] },
}

export const TESTS = {
  1: { zone: 'lower',   label: 'Test 1' },
  2: { zone: 'lower',   label: 'Test 2' },
  3: { zone: 'upper',   label: 'Test 3' },
  4: { zone: 'upper',   label: 'Test 4' },
  5: { zone: 'fingers', label: 'Test 5' },
  6: { zone: 'fingers', label: 'Test 6' },
}

export default function BodyDiagram({ activeZone, onSelectZone }) {
  const zoneColor = (zone) => activeZone === zone ? ZONES[zone].color : '#d1d5db'
  const zoneClass = (zone) => `body-zone ${activeZone === zone ? 'body-zone--active' : ''}`

  return (
    <div className="body-diagram">
      <svg viewBox="0 0 100 230" className="body-diagram__svg" aria-label="Diagrama corporal">

        {/* Head — neutral */}
        <circle cx="50" cy="20" r="14" className="body-part body-part--head" />
        {/* Neck */}
        <rect x="46" y="34" width="8" height="7" className="body-part body-part--head" />

        {/* UPPER zone — torso */}
        <rect
          x="30" y="41" width="40" height="50" rx="5"
          fill={zoneColor('upper')} className={zoneClass('upper')}
          onClick={() => onSelectZone('upper')}
        />
        {/* UPPER zone — left arm */}
        <polygon
          points="30,45 30,72 10,84 10,68"
          fill={zoneColor('upper')} className={zoneClass('upper')}
          onClick={() => onSelectZone('upper')}
        />
        {/* UPPER zone — right arm */}
        <polygon
          points="70,45 70,72 90,84 90,68"
          fill={zoneColor('upper')} className={zoneClass('upper')}
          onClick={() => onSelectZone('upper')}
        />

        {/* FINGERS zone — left hand */}
        <rect
          x="6" y="82" width="12" height="16" rx="4"
          fill={zoneColor('fingers')} className={zoneClass('fingers')}
          onClick={() => onSelectZone('fingers')}
        />
        {/* FINGERS zone — right hand */}
        <rect
          x="82" y="82" width="12" height="16" rx="4"
          fill={zoneColor('fingers')} className={zoneClass('fingers')}
          onClick={() => onSelectZone('fingers')}
        />

        {/* LOWER zone — hips */}
        <rect
          x="30" y="91" width="40" height="12" rx="4"
          fill={zoneColor('lower')} className={zoneClass('lower')}
          onClick={() => onSelectZone('lower')}
        />
        {/* LOWER zone — left leg */}
        <rect
          x="30" y="103" width="18" height="90" rx="5"
          fill={zoneColor('lower')} className={zoneClass('lower')}
          onClick={() => onSelectZone('lower')}
        />
        {/* LOWER zone — right leg */}
        <rect
          x="52" y="103" width="18" height="90" rx="5"
          fill={zoneColor('lower')} className={zoneClass('lower')}
          onClick={() => onSelectZone('lower')}
        />
      </svg>

      <div className="body-diagram__legend">
        {Object.entries(ZONES).map(([key, z]) => (
          <button
            key={key}
            className={`body-diagram__zone-btn ${activeZone === key ? 'body-diagram__zone-btn--active' : ''}`}
            style={{ '--zone-color': z.color }}
            onClick={() => onSelectZone(key)}
          >
            {z.label}
          </button>
        ))}
      </div>
    </div>
  )
}
