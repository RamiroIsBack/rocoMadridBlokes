import { useState, useEffect } from 'react'
import { useAlumnoTraining, useTrainingSummary } from '../hooks/useTraining'
import { useClassProgress } from '../hooks/useClassProgress'
import BodyDiagram, { ZONES, TESTS, visibleZoneTests } from '../components/BodyDiagram'
import TrainingChart from '../components/TrainingChart'
import IdentityPicker from '../components/IdentityPicker'
import './TabletYoView.css'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'
const APUNTATE_URL = 'https://rocomadrid.com/club/actividades-para-socios'

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

// Nothing is shown until someone picks who they are — there is no "me" on a
// shared tablet. No crear-usuario here: an account is only ever born from
// doing something (completar un bloke, o desde Entrenamientos), never just
// from looking.
export default function TabletYoView() {
  const [identity, setIdentity] = useState(null)
  const [showPicker, setShowPicker] = useState(false)

  if (!identity) {
    return (
      <div className="tablet-yo tablet-yo--empty">
        {showPicker && (
          <IdentityPicker
            title="¿Quién eres?"
            allowCreate={false}
            onPick={id => { setIdentity(id); setShowPicker(false) }}
            onClose={() => setShowPicker(false)}
          />
        )}
        <button className="tablet-yo__profile-btn" onClick={() => setShowPicker(true)}>Ver mi perfil</button>
        <a href={APUNTATE_URL} className="tablet-yo__signup-btn">Apúntate a clases</a>
      </div>
    )
  }

  return <TabletYoIdentity identity={identity} onChangePerson={() => setIdentity(null)} />
}

function TabletYoIdentity({ identity, onChangePerson }) {
  const alumno = identity.kind === 'ph'
    ? { is_placeholder: true, placeholder_id: identity.placeholder_id }
    : { is_placeholder: false, user_id: identity.user_id }

  const { history: trainingHistory } = useAlumnoTraining(alumno)
  const trainingSummary = useTrainingSummary()
  const { data: classData, loading: classLoading } = useClassProgress(identity.kind === 'user', identity.user_id)
  const [activeZone, setActiveZone] = useState('lower')
  const [activeTest, setActiveTest] = useState(10)
  const [blokeTotal, setBlokeTotal] = useState(null)

  useEffect(() => {
    const qs = identity.kind === 'ph' ? `placeholder_id=${identity.placeholder_id}` : `user_id=${identity.user_id}`
    fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/completions/subject?${qs}`, {
      credentials: 'include', headers: getAuthHeaders(),
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json) setBlokeTotal(json.total) })
      .catch(() => {})
  }, [identity.kind, identity.user_id, identity.placeholder_id])

  const hasClass = identity.kind === 'user' && !classLoading && classData?.class

  return (
    <div className="tablet-yo">
      <div className="tablet-yo__header">
        <h1 className="tablet-yo__name">{identity.name}</h1>
        <button className="tablet-yo__change-btn" onClick={onChangePerson}>No soy yo — cambiar</button>
      </div>

      {blokeTotal !== null && (
        <p className="tablet-yo__bloke-total">
          <strong>{blokeTotal}</strong> bloke{blokeTotal === 1 ? '' : 's'} completado{blokeTotal === 1 ? '' : 's'}
        </p>
      )}

      <section className="user-stats__section">
        <h2 className="user-stats__section-title">Progreso de entrenamiento</h2>
        <div className="training-block">
          <BodyDiagram
            activeZone={activeZone}
            onSelectZone={zone => { setActiveZone(zone); setActiveTest(visibleZoneTests(zone)[0]) }}
          />
          <div className="training-select-row">
            <select value={activeTest} onChange={e => setActiveTest(Number(e.target.value))} className="training-test-select">
              {visibleZoneTests(activeZone).map(tid => (
                <option key={tid} value={tid}>{TESTS[tid].label} ({TESTS[tid].unit})</option>
              ))}
            </select>
          </div>
          <TrainingChart
            userEntries={trainingHistory[activeTest] || []}
            communitySummary={trainingSummary[activeTest] || {}}
            color={ZONES[activeZone].color}
            unit={TESTS[activeTest].unit}
          />
          {(trainingHistory[activeTest] || []).length === 0 && (
            <p className="user-stats__no-test-data">Aún no hay resultados en {TESTS[activeTest].label}.</p>
          )}
        </div>
      </section>

      <section className="user-stats__section">
        <h2 className="user-stats__section-title">Tu clase</h2>
        {hasClass ? (
          <p className="tablet-yo__class-info">
            {classData.class.dia} · {classData.class.horario} · {classData.members.length} alumno{classData.members.length === 1 ? '' : 's'}
          </p>
        ) : (
          <div className="tablet-yo__no-class">
            <p>Si ya perteneces a una clase de entrenamiento pide en el mostrador que vinculen tu usuario.</p>
            <a href={APUNTATE_URL} className="tablet-yo__signup-btn">Apúntate a clases</a>
          </div>
        )}
      </section>
    </div>
  )
}
