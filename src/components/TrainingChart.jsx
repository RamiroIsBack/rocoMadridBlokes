import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import './TrainingChart.css'

const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function getLast12Months() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

function monthLabel(key) {
  return MONTH_SHORT[parseInt(key.split('-')[1]) - 1]
}

// ── Area chart (recharts) ─────────────────────────────────────────────────────

function addZeroAnchor(rawData) {
  const firstIdx = rawData.findIndex(v => v !== null)
  if (firstIdx === -1) return rawData
  const anchored = [...rawData]
  const anchorIdx = firstIdx > 0 ? firstIdx - 1 : 0
  if (anchored[anchorIdx] === null) anchored[anchorIdx] = 0
  return anchored
}

function AreaChartView({ userEntries, communitySummary, color, months, unit }) {
  const rawUserData = months.map(m => {
    const entries = userEntries.filter(e => e.logged_at?.startsWith(m))
    return entries.length ? entries[entries.length - 1].value_kg : null
  })
  const rawCommData = months.map(m => communitySummary[m]?.avg_kg ?? null)

  const userAnchored = addZeroAnchor(rawUserData)
  const commAnchored = addZeroAnchor(rawCommData)

  const chartData = months.map((m, i) => ({
    month: monthLabel(m),
    tú: userAnchored[i],
    comunidad: commAnchored[i],
  }))

  const hasUser = userEntries.length > 0
  const hasComm = Object.values(communitySummary).some(v => v?.avg_kg != null)
  const allVals = [...rawUserData, ...rawCommData].filter(v => v !== null)

  if (!allVals.length) return (
    <div className="training-chart--empty">Sin datos todavía</div>
  )

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="tc-grad-user" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="tc-grad-comm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#888" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#888" stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
        <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
        <YAxis tick={{ fill: '#888', fontSize: 10 }} width={40} />
        <Tooltip
          contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12, borderRadius: 6 }}
          labelStyle={{ color: '#f5c842' }}
          formatter={(v, name) => [
            v !== null && v !== undefined ? `${v} ${unit}` : '—',
            name === 'tú' ? 'Tú' : 'Media Roco',
          ]}
        />
        <Legend
          formatter={k => k === 'tú' ? 'Tú' : 'Media Roco'}
          wrapperStyle={{ fontSize: 11, color: '#888' }}
        />
        {hasUser && (
          <Area
            type="monotone" dataKey="tú"
            stroke={color} fill="url(#tc-grad-user)" strokeWidth={2}
            connectNulls dot={{ r: 3, fill: color, strokeWidth: 0 }} activeDot={{ r: 5 }}
          />
        )}
        {hasComm && (
          <Area
            type="monotone" dataKey="comunidad"
            stroke="#888" fill="url(#tc-grad-comm)" strokeWidth={1.5}
            strokeDasharray="4 3" connectNulls dot={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Progress gauge (semicircle) ───────────────────────────────────────────────

const GCX = 150, GCY = 108, GR = 78, GSW = 14, GW = 300, GH = 145

function gaugeArc(t) {
  const angle = (1 - t) * Math.PI
  return { x: GCX + GR * Math.cos(angle), y: GCY - GR * Math.sin(angle) }
}

function progressArcPath(t) {
  if (t <= 0) return ''
  if (t >= 1) {
    const top = gaugeArc(0.5)
    return `M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${top.x.toFixed(2)},${top.y.toFixed(2)} A ${GR},${GR} 0 0 0 ${GCX + GR},${GCY}`
  }
  const end = gaugeArc(t)
  return `M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${end.x.toFixed(2)},${end.y.toFixed(2)}`
}

export function ProgressGauge({ userEntries, communitySummary, color, hideValues = false, unit = 'kg' }) {
  const months = getLast12Months()
  const hasUser = userEntries.length > 0
  const rawValues = hasUser
    ? months.map(m => {
        const entries = userEntries.filter(e => e.logged_at?.startsWith(m))
        return entries.length ? entries[entries.length - 1].value_kg : null
      })
    : months.map(m => communitySummary[m]?.avg_kg ?? null)

  const firstRealIdx = rawValues.findIndex(v => v !== null)
  if (firstRealIdx === -1) return null

  const allReal = rawValues.filter(v => v !== null)
  const baseline   = rawValues[firstRealIdx]
  const latest     = allReal[allReal.length - 1]
  const pctRaw     = baseline > 0 ? ((latest - baseline) / baseline) * 100 : 0
  const pctStr     = `${pctRaw >= 0 ? '+' : ''}${pctRaw.toFixed(1)}%`
  const improved   = pctRaw >= 0
  const t          = Math.min(Math.abs(pctRaw) / 100, 1)
  const activeColor = improved ? color : '#f97316'
  const sinceM     = MONTH_SHORT[parseInt(months[firstRealIdx].split('-')[1]) - 1]
  const sinceY     = months[firstRealIdx].split('-')[0]
  const since      = sinceM + (sinceY !== new Date().getFullYear().toString() ? ` ${sinceY}` : '')
  const ticks      = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="training-progress-gauge">
      <svg viewBox={`0 0 ${GW} ${GH}`} className="training-gauge__svg">
        {ticks.map(tc => {
          const p = gaugeArc(tc)
          const dx = p.x - GCX, dy = p.y - GCY
          const len = Math.sqrt(dx * dx + dy * dy)
          const nx = dx / len, ny = dy / len
          return (
            <line key={tc}
              x1={(p.x + nx * (GSW / 2 + 2)).toFixed(2)} y1={(p.y + ny * (GSW / 2 + 2)).toFixed(2)}
              x2={(p.x + nx * (GSW / 2 + 7)).toFixed(2)} y2={(p.y + ny * (GSW / 2 + 7)).toFixed(2)}
              stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round"
            />
          )
        })}
        <path
          d={`M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${GCX + GR},${GCY}`}
          fill="none" stroke="#e5e7eb" strokeWidth={GSW} strokeLinecap="round"
        />
        {t > 0 && (
          <path
            d={progressArcPath(t)}
            fill="none" stroke={activeColor} strokeWidth={GSW} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 2px 6px ${activeColor}55)` }}
          />
        )}
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
        <line x1={GCX - GR - GSW / 2} y1={GCY} x2={GCX + GR + GSW / 2} y2={GCY}
          stroke="#f3f4f6" strokeWidth="2" />
        {hideValues ? (
          <text x={GCX} y={GCY + 22} textAnchor="middle" className="training-progress__since-svg">
            {unit} · desde {since} · {hasUser ? 'tú' : 'media Roco'}
          </text>
        ) : (
          <>
            <text x={GCX} y={GCY + 22} textAnchor="middle" className="training-progress__stat-svg">
              {baseline.toFixed(1)} {unit} → {latest.toFixed(1)} {unit}
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

// ── Public export (area chart only — gauge used separately) ──────────────────

export default function TrainingChart({ userEntries = [], communitySummary = {}, color = '#f97316', unit = 'kg' }) {
  const months = getLast12Months()
  return (
    <div className="training-chart-wrap">
      <AreaChartView
        userEntries={userEntries}
        communitySummary={communitySummary}
        color={color}
        months={months}
        unit={unit}
      />
    </div>
  )
}
