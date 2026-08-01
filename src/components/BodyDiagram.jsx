import { getConfig, INITIAL_TESTS } from '../utils/trainingConfig'
import './BodyDiagram.css'

function buildFromConfig() {
  const { tests } = getConfig()
  const zones = {
    lower:   { label: 'Tren inferior', color: '#3b82f6', tests: [] },
    upper:   { label: 'Tren superior', color: '#f97316', tests: [] },
    fingers: { label: 'Dedos',         color: '#a855f7', tests: [] },
  }
  const testsMap = {}
  tests.forEach(t => {
    if (zones[t.zone]) zones[t.zone].tests.push(t.id)
    testsMap[t.id] = { zone: t.zone, label: t.name, unit: t.unit, desc: '' }
  })
  return { zones, testsMap }
}

const { zones: ZONES_INITIAL, testsMap: TESTS_INITIAL } = buildFromConfig()
export let ZONES = ZONES_INITIAL
export let TESTS = TESTS_INITIAL

window.addEventListener('blokes:tests-updated', () => {
  const { zones, testsMap } = buildFromConfig()
  Object.assign(ZONES, zones)
  Object.assign(TESTS, testsMap)
})

const BODY_IMG = {
  lower:   'https://rocomadrid.com/wp-content/uploads/2026/05/cuerpo-inferior.png',
  upper:   'https://rocomadrid.com/wp-content/uploads/2026/05/2cuerpo-superior.png',
  default: 'https://rocomadrid.com/wp-content/uploads/2026/05/cuerpo-vacio.png',
}

const HAND_IMG = 'https://rocomadrid.com/wp-content/uploads/2026/05/mano-seleccionada.png'

export default function BodyDiagram({ activeZone, onSelectZone }) {
  const img = activeZone === 'fingers' ? HAND_IMG : (BODY_IMG[activeZone] || BODY_IMG.default)

  return (
    <div className="body-diagram">
      <div className="body-diagram__zones">
        {Object.entries(ZONES).map(([key, z]) => (
          <button
            key={key}
            className={`body-diagram__zone-btn${activeZone === key ? ' body-diagram__zone-btn--active' : ''}`}
            onClick={() => onSelectZone(key)}
          >
            {z.label}
          </button>
        ))}
      </div>
      <div className="body-diagram__img-wrap">
        <img
          src={img}
          alt={ZONES[activeZone]?.label || ''}
          className={`body-diagram__img${activeZone === 'fingers' ? ' body-diagram__img--hand' : ''}`}
          draggable={false}
        />
      </div>
    </div>
  )
}
