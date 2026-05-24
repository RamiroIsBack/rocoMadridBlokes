import { useMemo, useState, useEffect } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import { useTrainingSummary } from '../hooks/useTraining'
import BodyDiagram, { ZONES, TESTS } from '../components/BodyDiagram'
import TrainingChart, { ProgressGauge } from '../components/TrainingChart'
import EventCard from '../components/EventCard'
import './ProgresoPage.css'

const COLOR_INFO = {
  green:  { name: 'Verde',    bg: '#22c55e' },
  blue:   { name: 'Azul',     bg: '#3b82f6' },
  yellow: { name: 'Amarillo', bg: '#eab308' },
  red:    { name: 'Rojo',     bg: '#ef4444' },
  black:  { name: 'Negro',    bg: '#1f2937' },
  blanco: { name: 'Trave',    bg: '#e5e7eb' },
}

const COLOR_ORDER = ['green', 'blue', 'yellow', 'red', 'black', 'blanco']

const ZONE_BENEFITS = {
  lower: 'Un tren inferior fuerte mejora la potencia de empuje, la estabilidad en los pies y la movilidad de cadera. Menos caídas por mal contacto, más blokes encadenados.',
  upper: 'La fuerza de tracción y empuje del tren superior es lo que te permite aguantar los pasajes de brazo. Dominadas y flexiones bien trabajadas se traducen en más margen en los blokes duros.',
  fingers: 'Los dedos son el cuello de botella del bouldering. Trabajar la resistencia y la fuerza máxima de forma progresiva es la mejor prevención de lesiones en poleas y tendones.',
}

const MONTH_NAMES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
function formatMonth(ym) {
  const [y, m] = ym.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

function PieChart({ slices }) {
  const cx = 80, cy = 80, r = 70
  let angle = -Math.PI / 2
  const paths = slices.map(s => {
    const sweep = (s.percent / 100) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { ...s, path: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z` }
  })
  return (
    <svg viewBox="0 0 160 160" className="progreso-pie">
      {paths.map(s => <path key={s.color} d={s.path} fill={s.bg} />)}
    </svg>
  )
}

export default function ProgresoPage() {
  const { cards, loading } = useWordPressPosts()
  const trainingSummary = useTrainingSummary()
  const [activeZone, setActiveZone] = useState('lower')
  const [activeTest, setActiveTest] = useState(1)
  const [testInfoId, setTestInfoId] = useState(null)
  const [colorTab, setColorTab] = useState('active')
  const [colorMonth, setColorMonth] = useState(null)

  const sd = window.blokesSiteData || {}

  const colorDistrib = useMemo(() => {
    const acc = {}
    cards.forEach(c => { acc[c.color] = (acc[c.color] || 0) + 1 })
    const total = cards.length || 1
    return COLOR_ORDER
      .filter(k => acc[k])
      .map(k => ({ color: k, ...COLOR_INFO[k], count: acc[k], percent: (acc[k] / total) * 100 }))
  }, [cards])

  const allMonths = useMemo(() => {
    const m = new Set(cards.map(c => c.timestamp?.substring(0, 7)).filter(Boolean))
    return [...m].sort().reverse()
  }, [cards])

  useEffect(() => {
    if (!colorMonth && allMonths.length > 0) setColorMonth(allMonths[0])
  }, [allMonths, colorMonth])

  const tabCards = useMemo(() => {
    if (colorTab === 'active') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 60)
      return cards.filter(c => new Date(c.timestamp) >= cutoff)
    }
    if (colorTab === 'mensual' && colorMonth) {
      return cards.filter(c => c.timestamp?.substring(0, 7) === colorMonth)
    }
    return cards
  }, [cards, colorTab, colorMonth])

  const tabColorPopularity = useMemo(() => {
    const acc = {}
    tabCards.forEach(c => {
      const votes = (Number(c.interactions?.star_1) || 0) + (Number(c.interactions?.star_2) || 0)
        + (Number(c.interactions?.star_3) || 0) + (Number(c.interactions?.skull) || 0)
      acc[c.color] = (acc[c.color] || 0) + votes
    })
    return Object.entries(acc)
      .map(([k, v]) => ({ color: k, ...COLOR_INFO[k], total: v }))
      .filter(c => c.name)
      .sort((a, b) => b.total - a.total)
  }, [tabCards])

  const tabColorCompletions = useMemo(() => {
    const acc = {}
    tabCards.forEach(c => { acc[c.color] = (acc[c.color] || 0) + (c.completionCount || 0) })
    return Object.entries(acc)
      .map(([k, v]) => ({ color: k, ...COLOR_INFO[k], total: v }))
      .filter(c => c.name)
      .sort((a, b) => b.total - a.total)
  }, [tabCards])

  const hofCards = useMemo(() => {
    return [...cards]
      .filter(c => (c.completionCount || 0) > 0)
      .sort((a, b) => (b.completionCount || 0) - (a.completionCount || 0))
      .slice(0, 5)
  }, [cards])

  const maxTabPopularity = Math.max(1, ...tabColorPopularity.map(c => c.total))
  const maxTabCompletions = Math.max(1, ...tabColorCompletions.map(c => c.total))

  if (loading) return <div className="progreso__loading">Cargando...</div>

  return (
    <div className="progreso">
      <h1 className="progreso__title">Comunidad</h1>

      <section className="progreso__section">
        <h2 className="progreso__section-title">Progreso de entrenamiento</h2>
        <p className="progreso__section-hint">Media de la comunidad por test y mes</p>
        <div className="training-block">
          <BodyDiagram
            activeZone={activeZone}
            onSelectZone={(zone) => {
              setActiveZone(zone)
              setActiveTest(ZONES[zone].tests[0])
            }}
          />
          <div className="training-select-row">
            <select
              value={activeTest}
              onChange={e => setActiveTest(Number(e.target.value))}
              className="training-test-select"
            >
              {ZONES[activeZone].tests.map(tid => (
                <option key={tid} value={tid}>{TESTS[tid].label} ({TESTS[tid].unit})</option>
              ))}
            </select>
            <button className="test-info-btn" onClick={() => setTestInfoId(activeTest)} title="Descripción del test">ℹ</button>
          </div>
          <TrainingChart
            userEntries={[]}
            communitySummary={trainingSummary[activeTest] || {}}
            color={ZONES[activeZone].color}
            unit={TESTS[activeTest].unit}
          />
          <div className="training-bottom">
            <ProgressGauge
              userEntries={[]}
              communitySummary={trainingSummary[activeTest] || {}}
              color={ZONES[activeZone].color}
              unit={TESTS[activeTest].unit}
              hideValues
            />
            <div className="progreso__benefits">
              <h4 className="progreso__benefits-title">¿Para qué entrenamos esto?</h4>
              <p className="progreso__benefits-text">{ZONE_BENEFITS[activeZone]}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="progreso__section">
        <h2 className="progreso__section-title">Distribución de la colección</h2>
        <div className="progreso__distrib">
          <PieChart slices={colorDistrib} />
          <ul className="progreso__legend">
            {colorDistrib.map(s => (
              <li key={s.color} className="progreso__legend-item">
                <span className="progreso__legend-dot" style={{ background: s.bg }} />
                <span className="progreso__legend-name">{s.name}</span>
                <span className="progreso__legend-count">{s.count}</span>
                <span className="progreso__legend-pct">{s.percent.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="progreso__section">
        <h2 className="progreso__section-title">Estadísticas por color</h2>
        <div className="progreso__color-tabs">
          <button
            className={`progreso__color-tab${colorTab === 'active' ? ' progreso__color-tab--active' : ''}`}
            onClick={() => setColorTab('active')}
          >Activos ahora</button>
          <button
            className={`progreso__color-tab${colorTab === 'mensual' ? ' progreso__color-tab--active' : ''}`}
            onClick={() => setColorTab('mensual')}
          >Por meses</button>
          <button
            className={`progreso__color-tab${colorTab === 'historico' ? ' progreso__color-tab--active' : ''}`}
            onClick={() => setColorTab('historico')}
          >Histórico</button>
        </div>
        {colorTab === 'mensual' && allMonths.length > 0 && (
          <select
            value={colorMonth || ''}
            onChange={e => setColorMonth(e.target.value)}
            className="training-test-select progreso__month-select"
          >
            {allMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
        )}

        <p className="progreso__subsection-title">Colores más populares</p>
        <p className="progreso__section-hint">Total de valoraciones recibidas por color</p>
        <div className="progreso__ranking">
          {tabColorPopularity.length === 0
            ? <p className="progreso__section-hint">Sin datos para este período.</p>
            : tabColorPopularity.map((c, i) => (
              <div key={c.color} className="progreso__rank-row">
                <span className="progreso__rank-num">#{i + 1}</span>
                <span className="progreso__rank-dot" style={{ background: c.bg }} />
                <span className="progreso__rank-name">{c.name}</span>
                <div className="progreso__rank-bar-wrap">
                  <div className="progreso__rank-bar" style={{ width: `${(c.total / maxTabPopularity) * 100}%`, background: c.bg }} />
                </div>
                <span className="progreso__rank-value">{c.total}</span>
              </div>
            ))}
        </div>

        <p className="progreso__subsection-title">Blokes más encadenados</p>
        <p className="progreso__section-hint">TOPs acumulados por la comunidad por color</p>
        <div className="progreso__ranking">
          {tabColorCompletions.length === 0
            ? <p className="progreso__section-hint">Sin datos para este período.</p>
            : tabColorCompletions.map((c, i) => (
              <div key={c.color} className="progreso__rank-row">
                <span className="progreso__rank-num">#{i + 1}</span>
                <span className="progreso__rank-dot" style={{ background: c.bg }} />
                <span className="progreso__rank-name">{c.name}</span>
                <div className="progreso__rank-bar-wrap">
                  <div className="progreso__rank-bar" style={{ width: `${(c.total / maxTabCompletions) * 100}%`, background: c.bg }} />
                </div>
                <span className="progreso__rank-value">{c.total}</span>
              </div>
            ))}
        </div>
      </section>

      {hofCards.length > 0 && (
        <section className="progreso__section">
          <h2 className="progreso__section-title">Hall of Fame</h2>
          <p className="progreso__section-hint">Los blokes con más TOPs de la comunidad</p>
          <div className="progreso__hof-grid">
            {hofCards.map(card => (
              <EventCard
                key={card.id || card.postId}
                card={card}
                isHof={true}
                completionCount={card.completionCount || 0}
                isLoggedIn={sd.isLoggedIn || false}
                loginUrl={sd.loginUrl || '/wp-login.php'}
              />
            ))}
          </div>
        </section>
      )}

      {testInfoId !== null && (
        <div className="test-info-overlay" onClick={() => setTestInfoId(null)}>
          <div className="test-info-card" onClick={e => e.stopPropagation()}>
            <div className="test-info-card__header">
              <span className="test-info-card__name">{TESTS[testInfoId].label}</span>
              <span className="test-info-card__unit">({TESTS[testInfoId].unit})</span>
            </div>
            <button className="test-info-card__close" onClick={() => setTestInfoId(null)}>×</button>
            <p className="test-info-card__desc">{TESTS[testInfoId].desc}</p>
          </div>
        </div>
      )}
    </div>
  )
}
