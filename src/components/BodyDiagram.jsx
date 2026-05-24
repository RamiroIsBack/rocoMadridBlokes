import './BodyDiagram.css'

export const ZONES = {
  lower:   { label: 'Tren inferior', color: '#3b82f6', tests: [1, 2, 9, 10, 11, 12] },
  upper:   { label: 'Tren superior', color: '#f97316', tests: [3, 4, 7, 8] },
  fingers: { label: 'Dedos',         color: '#a855f7', tests: [5, 6] },
}

export const TESTS = {
  1:  { zone: 'lower',   label: 'Puente glúteo',        unit: 'reps',   desc: 'Nº máximas repeticiones con cada pierna.' },
  2:  { zone: 'lower',   label: 'Sentadilla en silla',  unit: 'reps',   desc: 'Nº máximas repeticiones en 30 seg con brazos cruzados en hombros.' },
  9:  { zone: 'lower',   label: 'Rodillas al pecho',    unit: 'reps',   desc: 'Nº repeticiones colgados en barra subir piernas hasta 90°.' },
  10: { zone: 'lower',   label: 'Apertura caderas',     unit: 'cm',     desc: 'De pie piernas abiertas al máximo. Medimos distancia entre pies.' },
  11: { zone: 'lower',   label: 'Flex. frontal',        unit: 'cm',     desc: 'Piernas estiradas y tocar con manos el suelo. Medimos de cóndilo ext. codo a suelo.' },
  12: { zone: 'lower',   label: 'Grant Foot Raise',     unit: 'cm',     desc: 'De pie mirando pared, pies separados, palmas apoyadas en pared a la altura de hombros. Subimos pie por la pared tocando con los dedos. 3 intentos, medimos distancia al suelo en el mejor.' },
  3:  { zone: 'upper',   label: 'Dominadas',            unit: 'reps',   desc: 'Nº máximas repeticiones.' },
  4:  { zone: 'upper',   label: 'Flexiones',            unit: 'reps',   desc: 'Nº máximas repeticiones tocando el suelo con el pecho.' },
  7:  { zone: 'upper',   label: 'Campus',               unit: 'cm',     desc: '3 intentos, marcar la altura máxima con ambas manos.' },
  8:  { zone: 'upper',   label: 'Ángulo pared',         unit: '°',      desc: 'Sentadilla en pared con piernas en 90°, toda la espalda apoyada. Codos en pared en 90°. Llevar muñecas a la pared sin despegar la espalda; subir manos hacia el techo hasta donde se pueda. Medimos cóndilo codo al suelo.' },
  5:  { zone: 'fingers', label: 'Resis. Flex. Prof.',   unit: 'series', desc: 'Nº series completadas en 7 seg. Suspensión, 3 seg descanso. Regleta 20mm.' },
  6:  { zone: 'fingers', label: 'Kg Máx dedos',         unit: 'kg',     desc: 'En posición caballero (rodilla en suelo y otra levantada) medimos fuerza máxima de mismo brazo que rodilla en suelo.' },
}

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
