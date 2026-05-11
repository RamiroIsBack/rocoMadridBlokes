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

const BODY_IMG = {
  lower:   'https://rocomadrid.com/wp-content/uploads/2026/05/cuerpo-inferior.png',
  upper:   'https://rocomadrid.com/wp-content/uploads/2026/05/2cuerpo-superior.png',
  default: 'https://rocomadrid.com/wp-content/uploads/2026/05/cuerpo-vacio.png',
}

const HAND_IMG = {
  active:  'https://rocomadrid.com/wp-content/uploads/2026/05/mano-seleccionada.png',
  default: 'https://rocomadrid.com/wp-content/uploads/2026/05/mano-sin-seleccionar.png',
}

export default function BodyDiagram({ activeZone, onSelectZone }) {
  const bodyImg = BODY_IMG[activeZone] || BODY_IMG.default
  const handImg = activeZone === 'fingers' ? HAND_IMG.active : HAND_IMG.default

  return (
    <div className="body-diagram">
      <div className="body-diagram__images">
        <img
          src={bodyImg}
          alt={activeZone === 'lower' ? 'Tren inferior' : activeZone === 'upper' ? 'Tren superior' : 'Cuerpo'}
          className="body-diagram__body"
          draggable={false}
        />
        <img
          src={handImg}
          alt="Dedos"
          className="body-diagram__hand"
          onClick={() => onSelectZone('fingers')}
          draggable={false}
        />
      </div>

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
