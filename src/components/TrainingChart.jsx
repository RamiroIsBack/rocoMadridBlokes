import './TrainingChart.css'

const W = 300, H = 160, PAD = { top: 16, right: 12, bottom: 32, left: 36 }
const INNER_W = W - PAD.left - PAD.right
const INNER_H = H - PAD.top - PAD.bottom

const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function getLast12Months() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

function monthLabel(key) {
  const m = parseInt(key.split('-')[1]) - 1
  return MONTH_SHORT[m]
}

function fillSeries(rawData, months) {
  const data = rawData.slice()
  const firstIdx = data.findIndex(v => v !== null)
  let anchorIdx = -1
  if (firstIdx !== -1) {
    const janKey = `${new Date().getFullYear()}-01`
    const janIdx = months.indexOf(janKey)
    if (janIdx !== -1 && janIdx < firstIdx) {
      anchorIdx = janIdx
    } else if (firstIdx > 0) {
      anchorIdx = firstIdx - 1
    }
    if (anchorIdx >= 0) data[anchorIdx] = 0
    const startFill = anchorIdx >= 0 ? anchorIdx : firstIdx
    let last = data[startFill]
    for (let i = startFill + 1; i < data.length; i++) {
      if (data[i] !== null) last = data[i]
      else data[i] = last
    }
  }
  return { data, anchorIdx }
}

// ── Max chart (kg line) ──────────────────────────────────────────────────────

function MaxChart({ userEntries, communitySummary, color, months, hideValues, unit = 'kg' }) {
  const rawUserData = months.map(m => {
    const entries = userEntries.filter(e => e.logged_at?.startsWith(m))
    return entries.length ? entries[entries.length - 1].value_kg : null
  })
  const { data: userData, anchorIdx: userAnchorIdx } = fillSeries(rawUserData, months)

  const rawCommunityData = months.map(m => communitySummary[m]?.avg_kg ?? null)
  const { data: communityData, anchorIdx: commAnchorIdx } = fillSeries(rawCommunityData, months)

  const allValues = [...rawUserData, ...rawCommunityData].filter(v => v !== null)
  if (!allValues.length) return (
    <div className="training-chart training-chart--empty"><p>Sin datos todavía</p></div>
  )

  const hasAnchor = userAnchorIdx >= 0 || commAnchorIdx >= 0
  const minY = hasAnchor ? 0 : Math.max(0, Math.floor(Math.min(...allValues) * 0.85))
  const maxY = Math.ceil(Math.max(...allValues) * 1.1)
  const rangeY = maxY - minY || 1

  const xPos = i => PAD.left + (i / (months.length - 1)) * INNER_W
  const yPos = v => PAD.top + INNER_H - ((v - minY) / rangeY) * INNER_H
  const toPoints = data =>
    data.map((v, i) => v !== null ? `${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}` : null)
      .filter(Boolean).join(' ')

  const yTicks = [minY, Math.round((minY + maxY) / 2), maxY]

  return (
    <div className="training-chart">
      <p className="training-chart__section-label">Máximos</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="training-chart__svg">
        {yTicks.map(v => (
          <line key={v} x1={PAD.left} y1={yPos(v)} x2={W - PAD.right} y2={yPos(v)}
            stroke="#e5e7eb" strokeWidth="1" />
        ))}
        {hideValues
          ? <text x={PAD.left - 4} y={yPos(maxY) + 4} textAnchor="end" className="training-chart__tick">{unit}</text>
          : yTicks.map(v => (
              <text key={v} x={PAD.left - 4} y={yPos(v) + 4} textAnchor="end" className="training-chart__tick">{v}</text>
            ))
        }
        {months.map((m, i) => i % 2 === 0 && (
          <text key={m} x={xPos(i)} y={H - 6} textAnchor="middle" className="training-chart__tick">{monthLabel(m)}</text>
        ))}
        {communityData.some(v => v !== null) && (
          <polyline points={toPoints(communityData)}
            fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="4 3" />
        )}
        {userData.some(v => v !== null) && (
          <polyline points={toPoints(userData)} fill="none" stroke={color} strokeWidth="2.5" />
        )}
        {rawUserData.map((v, i) => v !== null && (
          <circle key={i} cx={xPos(i)} cy={yPos(v)} r="3.5" fill={color} />
        ))}
        {rawCommunityData.map((v, i) => v !== null && (
          <circle key={i} cx={xPos(i)} cy={yPos(v)} r="2.5" fill="#d1d5db" />
        ))}
      </svg>
      <div className="training-chart__legend">
        {userEntries.length > 0 && (
          <span className="training-chart__legend-item">
            <span className="training-chart__legend-line" style={{ background: color }} />Tú
          </span>
        )}
        <span className="training-chart__legend-item">
          <span className="training-chart__legend-line training-chart__legend-line--dashed" />Media Roco
        </span>
      </div>
    </div>
  )
}

// ── Progress gauge (semicircle) ──────────────────────────────────────────────

const GCX = 150, GCY = 108, GR = 78, GSW = 14

function gaugeArc(t) {
  // t = 0 → left end of semicircle, t = 1 → right end
  // Parametric: angle goes from π to 0 as t goes 0→1
  const angle = (1 - t) * Math.PI
  return {
    x: GCX + GR * Math.cos(angle),
    y: GCY - GR * Math.sin(angle),
  }
}

function progressArcPath(t) {
  if (t <= 0) return ''
  if (t >= 1) {
    // Full semicircle: use two arcs (degenerate single arc has start=end)
    const top = gaugeArc(0.5)
    return `M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${top.x.toFixed(2)},${top.y.toFixed(2)} A ${GR},${GR} 0 0 0 ${GCX + GR},${GCY}`
  }
  const end = gaugeArc(t)
  return `M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${end.x.toFixed(2)},${end.y.toFixed(2)}`
}

function ProgressGauge({ userEntries, communitySummary, color, months, hideValues, unit = 'kg' }) {
  const hasUser = userEntries.length > 0
  const rawValues = hasUser
    ? months.map(m => {
        const entries = userEntries.filter(e => e.logged_at?.startsWith(m))
        return entries.length ? entries[entries.length - 1].value_kg : null
      })
    : months.map(m => communitySummary[m]?.avg_kg ?? null)

  const firstRealIdx = rawValues.findIndex(v => v !== null)
  if (firstRealIdx === -1) return (
    <div className="training-chart training-chart--empty"><p>Sin datos todavía</p></div>
  )

  const allReal = rawValues.filter(v => v !== null)
  const baseline = rawValues[firstRealIdx]
  const latest   = allReal[allReal.length - 1]
  const pctRaw   = baseline > 0 ? ((latest - baseline) / baseline) * 100 : 0
  const pctSign  = pctRaw >= 0 ? '+' : ''
  const pctStr   = `${pctSign}${pctRaw.toFixed(1)}%`
  const improved = pctRaw >= 0

  // Visual fill: cap at ±100%, map to 0–1
  const t = Math.min(Math.abs(pctRaw) / 100, 1)

  const activeColor = improved ? color : '#f97316'

  const sinceM = MONTH_SHORT[parseInt(months[firstRealIdx].split('-')[1]) - 1]
  const sinceY = months[firstRealIdx].split('-')[0]
  const nowY   = new Date().getFullYear().toString()
  const since  = sinceM + (sinceY !== nowY ? ` ${sinceY}` : '')

  // Tick marks on the gauge track
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  const GH = 145 // SVG height

  return (
    <div className="training-chart training-progress-gauge">
      <p className="training-chart__section-label">Progresión</p>
      <svg viewBox={`0 0 ${W} ${GH}`} className="training-chart__svg">

        {/* Tick marks */}
        {ticks.map(tc => {
          const p = gaugeArc(tc)
          const dir = { x: p.x - GCX, y: p.y - GCY }
          const len = Math.sqrt(dir.x ** 2 + dir.y ** 2)
          const nx = dir.x / len, ny = dir.y / len
          return (
            <line key={tc}
              x1={(p.x + nx * (GSW / 2 + 2)).toFixed(2)} y1={(p.y + ny * (GSW / 2 + 2)).toFixed(2)}
              x2={(p.x + nx * (GSW / 2 + 7)).toFixed(2)} y2={(p.y + ny * (GSW / 2 + 7)).toFixed(2)}
              stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round"
            />
          )
        })}

        {/* Track background */}
        <path
          d={`M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${GCX + GR},${GCY}`}
          fill="none" stroke="#e5e7eb" strokeWidth={GSW} strokeLinecap="round"
        />

        {/* Progress arc */}
        {t > 0 && (
          <path
            d={progressArcPath(t)}
            fill="none" stroke={activeColor} strokeWidth={GSW} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 2px 6px ${activeColor}55)` }}
          />
        )}

        {/* Center: big % — hidden when showing community-only view */}
        {!hideValues && (
          <>
            <text x={GCX} y={GCY - 18} textAnchor="middle" className="training-progress__pct-svg" fill={activeColor}>
              {pctStr}
            </text>
            <text x={GCX} y={GCY - 2} textAnchor="middle" className="training-progress__arrow-svg" fill={activeColor}>
              {improved ? '▲' : '▼'}
            </text>
          </>
        )}

        {/* Base line */}
        <line x1={GCX - GR - GSW / 2} y1={GCY} x2={GCX + GR + GSW / 2} y2={GCY}
          stroke="#f3f4f6" strokeWidth="2" />

        {/* Stats below */}
        {hideValues ? (
          <text x={GCX} y={GCY + 22} textAnchor="middle" className="training-progress__since-svg">
            {unit} · desde {since} · {hasUser ? 'tú' : 'media Roco'}
          </text>
        ) : (
          <>
            <text x={GCX} y={GCY + 22} textAnchor="middle" className="training-progress__stat-svg">
              {baseline.toFixed(1)} kg → {latest.toFixed(1)} kg
            </text>
            <text x={GCX} y={GCY + 36} textAnchor="middle" className="training-progress__since-svg">
              desde {since} · {hasUser ? 'tú' : 'media Roco'}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

// ── Public export ────────────────────────────────────────────────────────────

export default function TrainingChart({ userEntries = [], communitySummary = {}, color = '#3b82f6', testLabel = '', hideValues = false, unit = 'kg' }) {
  const months = getLast12Months()
  return (
    <div className="training-chart-wrap">
      {testLabel && <p className="training-chart__label">{testLabel}</p>}
      <MaxChart userEntries={userEntries} communitySummary={communitySummary} color={color} months={months} hideValues={hideValues} unit={unit} />
      <ProgressGauge userEntries={userEntries} communitySummary={communitySummary} color={color} months={months} hideValues={hideValues} unit={unit} />
    </div>
  )
}
