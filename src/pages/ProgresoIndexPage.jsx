import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import { useCompletions } from '../hooks/useCompletions'
import './ProgresoIndexPage.css'

// ── shared constants ──────────────────────────────────────────────────────────

const COLOR_INFO = {
  green:  { name: 'Verde',    bg: '#22c55e' },
  blue:   { name: 'Azul',     bg: '#3b82f6' },
  yellow: { name: 'Amarillo', bg: '#eab308' },
  red:    { name: 'Rojo',     bg: '#ef4444' },
  black:  { name: 'Negro',    bg: '#1f2937' },
  blanco: { name: 'Trave',    bg: '#e5e7eb' },
}
const COLOR_ORDER = ['green', 'blue', 'yellow', 'red', 'black', 'blanco']

const SALA_LABELS = { entrada: 'Entrada', sala_grande: 'Sala Grande', cueva: 'Cueva' }

const RATING_ICONS = [
  { id: 'star_1', emoji: '⭐',     label: 'Buen bloke' },
  { id: 'star_2', emoji: '⭐⭐',   label: 'Muy buen bloke' },
  { id: 'star_3', emoji: '⭐⭐⭐', label: 'Blokazo' },
  { id: 'skull',  emoji: '💀',     label: 'Amor-odio' },
]

function monthLabel(key) {
  const [year, month] = key.split('-')
  return new Date(parseInt(year), parseInt(month) - 1)
    .toLocaleString('es-ES', { month: 'short', year: '2-digit' })
}

// ── pie chart ─────────────────────────────────────────────────────────────────

function PieChart({ slices }) {
  const cx = 70, cy = 70, r = 60
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
    <svg viewBox="0 0 140 140" className="progreso-idx__pie">
      {paths.map(s => <path key={s.color} d={s.path} fill={s.bg} />)}
    </svg>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function ProgresoIndexPage() {
  const { cards, loading: cardsLoading } = useWordPressPosts()
  const { isLoggedIn, loginUrl, completedByMe, completionLog, ratingLog } = useCompletions()

  // ── community data ──────────────────────────────────────────────────────────
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
      const v = (Number(c.interactions?.star_1) || 0) + (Number(c.interactions?.star_2) || 0)
        + (Number(c.interactions?.star_3) || 0) + (Number(c.interactions?.skull) || 0)
      acc[c.color] = (acc[c.color] || 0) + v
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

  const maxPop  = Math.max(1, ...colorPopularity.map(c => c.total))
  const maxComp = Math.max(1, ...colorCompletions.map(c => c.total))

  // ── personal data ───────────────────────────────────────────────────────────
  const byColor = useMemo(() => {
    const acc = {}
    completionLog.forEach(e => { acc[e.color] = (acc[e.color] || 0) + 1 })
    return acc
  }, [completionLog])

  const bySala = useMemo(() => {
    const acc = {}
    completionLog.forEach(e => {
      const sala = e.sala || 'entrada'
      acc[sala] = (acc[sala] || 0) + 1
    })
    return acc
  }, [completionLog])

  const byMonth = useMemo(() => {
    const acc = {}
    completionLog.forEach(e => {
      const d = new Date(e.timestamp)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      acc[key] = (acc[key] || 0) + 1
    })
    return Object.keys(acc).sort().slice(-6).map(k => ({ key: k, count: acc[k] }))
  }, [completionLog])

  const maxMonth = Math.max(1, ...byMonth.map(m => m.count))

  const ratingCounts = useMemo(() => {
    const acc = { star_1: 0, star_2: 0, star_3: 0, skull: 0 }
    ratingLog.forEach(e => { if (acc[e.type] !== undefined) acc[e.type]++ })
    return acc
  }, [ratingLog])

  const totalRatings = Object.values(ratingCounts).reduce((a, b) => a + b, 0)
  const total = completedByMe.size

  return (
    <div className="progreso-idx">
      <h1 className="progreso-idx__title">Progreso</h1>

      <div className="progreso-idx__grid">

        {/* ── left: comunidad ───────────────────────────────────────────────── */}
        <section className="progreso-idx__col">
          <h2 className="progreso-idx__col-title">Comunidad</h2>

          {cardsLoading ? (
            <p className="progreso-idx__loading">Cargando...</p>
          ) : (
            <>
              <div className="progreso-idx__block">
                <h3 className="progreso-idx__block-title">Distribución de la colección</h3>
                <div className="progreso-idx__distrib">
                  <PieChart slices={colorDistrib} />
                  <ul className="progreso-idx__legend">
                    {colorDistrib.map(s => (
                      <li key={s.color} className="progreso-idx__legend-item">
                        <span className="progreso-idx__dot" style={{ background: s.bg }} />
                        <span className="progreso-idx__legend-name">{s.name}</span>
                        <span className="progreso-idx__legend-pct">{s.percent.toFixed(0)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="progreso-idx__block">
                <h3 className="progreso-idx__block-title">Top colores</h3>
                <div className="progreso-idx__ranking">
                  {colorPopularity.slice(0, 3).map((c, i) => (
                    <div key={c.color} className="progreso-idx__rank-row">
                      <span className="progreso-idx__rank-num">#{i + 1}</span>
                      <span className="progreso-idx__dot" style={{ background: c.bg }} />
                      <span className="progreso-idx__rank-name">{c.name}</span>
                      <div className="progreso-idx__bar-wrap">
                        <div className="progreso-idx__bar" style={{ width: `${(c.total / maxPop) * 100}%`, background: c.bg }} />
                      </div>
                      <span className="progreso-idx__rank-val">{c.total}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Link to="/progreso/comunidad" className="progreso-idx__expand-link">
                Ver estadísticas completas →
              </Link>
            </>
          )}
        </section>

        {/* ── right: tu progreso ────────────────────────────────────────────── */}
        <section className="progreso-idx__col progreso-idx__col--yo">
          <h2 className="progreso-idx__col-title">Tu progreso</h2>

          {!isLoggedIn ? (
            <div className="progreso-idx__cta">
              <div className="progreso-idx__cta-inner">
                <p className="progreso-idx__cta-title">Compara con tu progreso</p>
                <p className="progreso-idx__cta-text">Ve cómo evolucionas respecto a la comunidad. Empieza hoy.</p>
                <a href={loginUrl} className="progreso-idx__cta-btn">Iniciar sesión</a>
              </div>
            </div>
          ) : (
            <>
              <div className="progreso-idx__total">
                <span className="progreso-idx__total-num">{total}</span>
                <span className="progreso-idx__total-label">TOPs conseguidos</span>
              </div>

              {total === 0 ? (
                <p className="progreso-idx__empty">Aún no has marcado ningún bloke como TOP. ¡Venga!</p>
              ) : (
                <>
                  <div className="progreso-idx__block">
                    <h3 className="progreso-idx__block-title">Por color</h3>
                    <div className="progreso-idx__colors">
                      {COLOR_ORDER.map(key => {
                        const count = byColor[key] || 0
                        if (!count) return null
                        return (
                          <div key={key} className="progreso-idx__color-item">
                            <span className="progreso-idx__dot" style={{ background: COLOR_INFO[key].bg }} />
                            <span className="progreso-idx__color-count">{count}</span>
                            <span className="progreso-idx__color-name">{COLOR_INFO[key].name}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {byMonth.length > 0 && (
                    <div className="progreso-idx__block">
                      <h3 className="progreso-idx__block-title">Últimos meses</h3>
                      <div className="progreso-idx__months">
                        {byMonth.slice(-3).map(({ key, count }) => (
                          <div key={key} className="progreso-idx__month-row">
                            <span className="progreso-idx__month-label">{monthLabel(key)}</span>
                            <div className="progreso-idx__month-bar-wrap">
                              <div className="progreso-idx__month-bar" style={{ width: `${(count / maxMonth) * 100}%` }} />
                            </div>
                            <span className="progreso-idx__month-count">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <Link to="/progreso/yo" className="progreso-idx__expand-link">
                Ver mi progreso completo →
              </Link>
            </>
          )}
        </section>

      </div>
    </div>
  )
}
