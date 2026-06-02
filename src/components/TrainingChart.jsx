import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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

// ── Bar + Line chart ──────────────────────────────────────────────────────────

function BarLineChart({ userEntries, communitySummary, color, months, unit }) {
  const chartData = months.map(m => {
    const entries = userEntries.filter(e => e.logged_at?.startsWith(m))
    const userVal = entries.length ? entries[entries.length - 1].value_kg : null
    const commVal = communitySummary[m]?.avg_kg ?? null
    return { month: monthLabel(m), tú: userVal, comunidad: commVal }
  })

  const hasUser = userEntries.length > 0
  const hasComm = Object.values(communitySummary).some(v => v?.avg_kg != null)
  const hasAny  = chartData.some(d => d.tú !== null || d.comunidad !== null)

  if (!hasAny) return (
    <div className="training-chart--empty">Sin datos todavía</div>
  )

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2015" />
        <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
        <YAxis tick={{ fill: '#888', fontSize: 10 }} width={38} />
        <Tooltip
          contentStyle={{ background: '#1b1710', border: '1px solid #3a3020', fontSize: 12, borderRadius: 6 }}
          labelStyle={{ color: '#f5c842' }}
          formatter={(v, name) => [
            v !== null && v !== undefined ? `${v} ${unit}` : '—',
            name === 'tú' ? 'Tú' : 'Media Roco',
          ]}
          cursor={{ fill: 'rgba(245,200,66,0.04)' }}
        />
        {(hasUser || hasComm) && (
          <Legend
            formatter={k => k === 'tú' ? 'Tú' : 'Media Roco'}
            wrapperStyle={{ fontSize: 11, color: '#888' }}
          />
        )}
        {hasUser && (
          <Bar dataKey="tú" fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />
        )}
        {hasComm && (
          <Line
            dataKey="comunidad"
            type="monotone"
            stroke="#555"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Progress gauge (semicircle) ───────────────────────────────────────────────

const GCX = 150, GCY = 108, GR = 80, GSW = 16, GW = 300, GH = 148

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
  const months  = getLast12Months()
  const hasUser = userEntries.length > 0
  const rawValues = hasUser
    ? months.map(m => {
        const entries = userEntries.filter(e => e.logged_at?.startsWith(m))
        return entries.length ? entries[entries.length - 1].value_kg : null
      })
    : months.map(m => communitySummary[m]?.avg_kg ?? null)

  const firstRealIdx = rawValues.findIndex(v => v !== null)
  if (firstRealIdx === -1) return null

  const allReal    = rawValues.filter(v => v !== null)
  const baseline   = rawValues[firstRealIdx]
  const latest     = allReal[allReal.length - 1]
  const pctRaw     = baseline > 0 ? ((latest - baseline) / baseline) * 100 : 0
  const pctStr     = `${pctRaw >= 0 ? '+' : ''}${pctRaw.toFixed(1)}%`
  const improved   = pctRaw >= 0
  const t          = Math.min(Math.abs(pctRaw) / 100, 1)
  const arcColor   = improved ? color : '#f97316'
  const sinceM     = MONTH_SHORT[parseInt(months[firstRealIdx].split('-')[1]) - 1]
  const sinceY     = months[firstRealIdx].split('-')[0]
  const since      = sinceM + (sinceY !== new Date().getFullYear().toString() ? ` ${sinceY}` : '')
  const ticks      = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="training-progress-gauge">
      <svg viewBox={`0 0 ${GW} ${GH}`} className="training-gauge__svg">
        <defs>
          <linearGradient id={`gauge-glow-${color.replace('#','')}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={arcColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={arcColor} stopOpacity="1"   />
          </linearGradient>
        </defs>

        {/* Tick marks */}
        {ticks.map(tc => {
          const p  = gaugeArc(tc)
          const dx = p.x - GCX, dy = p.y - GCY
          const len = Math.sqrt(dx * dx + dy * dy)
          const nx = dx / len, ny = dy / len
          return (
            <line key={tc}
              x1={(p.x + nx * (GSW / 2 + 3)).toFixed(2)}
              y1={(p.y + ny * (GSW / 2 + 3)).toFixed(2)}
              x2={(p.x + nx * (GSW / 2 + 9)).toFixed(2)}
              y2={(p.y + ny * (GSW / 2 + 9)).toFixed(2)}
              stroke="#333" strokeWidth="2" strokeLinecap="round"
            />
          )
        })}

        {/* Track */}
        <path
          d={`M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${GCX + GR},${GCY}`}
          fill="none" stroke="#1e1e1e" strokeWidth={GSW} strokeLinecap="round"
        />
        {/* Track inner highlight */}
        <path
          d={`M ${GCX - GR},${GCY} A ${GR},${GR} 0 0 0 ${GCX + GR},${GCY}`}
          fill="none" stroke="#2a2a2a" strokeWidth={GSW - 6} strokeLinecap="round"
        />

        {/* Progress arc */}
        {t > 0 && (
          <path
            d={progressArcPath(t)}
            fill="none"
            stroke={arcColor}
            strokeWidth={GSW}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${arcColor}88)` }}
          />
        )}

        {/* Baseline separator */}
        <line
          x1={GCX - GR - GSW / 2} y1={GCY}
          x2={GCX + GR + GSW / 2} y2={GCY}
          stroke="#111" strokeWidth="3"
        />

        {/* Center text */}
        {!hideValues ? (
          <>
            <text x={GCX} y={GCY - 20} textAnchor="middle" className="tg-pct" fill={arcColor}>
              {pctStr}
            </text>
            <text x={GCX} y={GCY - 4} textAnchor="middle" className="tg-arrow" fill={arcColor}>
              {improved ? '▲' : '▼'}
            </text>
            <text x={GCX} y={GCY + 20} textAnchor="middle" className="tg-vals">
              {baseline.toFixed(1)} → {latest.toFixed(1)} {unit}
            </text>
            <text x={GCX} y={GCY + 34} textAnchor="middle" className="tg-since">
              desde {since} · {hasUser ? 'tú' : 'media Roco'}
            </text>
          </>
        ) : (
          <text x={GCX} y={GCY + 20} textAnchor="middle" className="tg-since">
            {unit} · desde {since} · {hasUser ? 'tú' : 'media Roco'}
          </text>
        )}
      </svg>
    </div>
  )
}

// ── Public export ─────────────────────────────────────────────────────────────

export default function TrainingChart({ userEntries = [], communitySummary = {}, color = '#f97316', unit = 'kg' }) {
  const months = getLast12Months()
  return (
    <div className="training-chart-wrap">
      <BarLineChart
        userEntries={userEntries}
        communitySummary={communitySummary}
        color={color}
        months={months}
        unit={unit}
      />
    </div>
  )
}
