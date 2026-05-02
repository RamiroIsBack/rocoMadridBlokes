import { useMemo } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
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

  const colorDistrib = useMemo(() => {
    const acc = {}
    cards.forEach(c => { acc[c.color] = (acc[c.color] || 0) + 1 })
    const total = cards.length || 1
    return COLOR_ORDER
      .filter(k => acc[k])
      .map(k => ({ color: k, ...COLOR_INFO[k], count: acc[k], percent: (acc[k] / total) * 100 }))
  }, [cards])

  const colorPopularity = useMemo(() => {
    const acc = {}
    cards.forEach(c => {
      const votes = (Number(c.interactions?.star_1) || 0) + (Number(c.interactions?.star_2) || 0)
        + (Number(c.interactions?.star_3) || 0) + (Number(c.interactions?.skull) || 0)
      acc[c.color] = (acc[c.color] || 0) + votes
    })
    return Object.entries(acc)
      .map(([k, v]) => ({ color: k, ...COLOR_INFO[k], total: v }))
      .sort((a, b) => b.total - a.total)
  }, [cards])

  const colorCompletions = useMemo(() => {
    const acc = {}
    cards.forEach(c => { acc[c.color] = (acc[c.color] || 0) + (c.completionCount || 0) })
    return Object.entries(acc)
      .map(([k, v]) => ({ color: k, ...COLOR_INFO[k], total: v }))
      .sort((a, b) => b.total - a.total)
  }, [cards])

  const maxPopularity = Math.max(1, ...colorPopularity.map(c => c.total))
  const maxCompletions = Math.max(1, ...colorCompletions.map(c => c.total))

  if (loading) return <div className="progreso__loading">Cargando...</div>

  return (
    <div className="progreso">
      <h1 className="progreso__title">Comunidad</h1>

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
        <h2 className="progreso__section-title">Colores más populares</h2>
        <p className="progreso__section-hint">Total de valoraciones recibidas por color</p>
        <div className="progreso__ranking">
          {colorPopularity.map((c, i) => (
            <div key={c.color} className="progreso__rank-row">
              <span className="progreso__rank-num">#{i + 1}</span>
              <span className="progreso__rank-dot" style={{ background: c.bg }} />
              <span className="progreso__rank-name">{c.name}</span>
              <div className="progreso__rank-bar-wrap">
                <div className="progreso__rank-bar" style={{ width: `${(c.total / maxPopularity) * 100}%`, background: c.bg }} />
              </div>
              <span className="progreso__rank-value">{c.total}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="progreso__section">
        <h2 className="progreso__section-title">Blokes más encadenados</h2>
        <p className="progreso__section-hint">TOPs acumulados por la comunidad por color</p>
        <div className="progreso__ranking">
          {colorCompletions.map((c, i) => (
            <div key={c.color} className="progreso__rank-row">
              <span className="progreso__rank-num">#{i + 1}</span>
              <span className="progreso__rank-dot" style={{ background: c.bg }} />
              <span className="progreso__rank-name">{c.name}</span>
              <div className="progreso__rank-bar-wrap">
                <div className="progreso__rank-bar" style={{ width: `${(c.total / maxCompletions) * 100}%`, background: c.bg }} />
              </div>
              <span className="progreso__rank-value">{c.total}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
