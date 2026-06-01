import { useEffect, useRef } from 'react'
import { useLeague } from '../hooks/useLeague'
import LeaguePromotionDialog from '../components/LeaguePromotionDialog'
import UserAvatar from '../components/UserAvatar'
import './LeaguesPage.css'

const TIER_META = {
  1: { color: '#6b7280', emoji: '⛰️' },
  2: { color: '#84cc16', emoji: '🌿' },
  3: { color: '#3b82f6', emoji: '💧' },
  4: { color: '#f59e0b', emoji: '🌄' },
  5: { color: '#f97316', emoji: '🔥' },
  6: { color: '#ef4444', emoji: '💎' },
}

const ZONE_META = {
  promotion: { label: 'Zona ascenso',    color: '#22c55e', dot: '🟢' },
  stay:      { label: 'Zona permanencia', color: '#888',    dot: '⚪' },
  demotion:  { label: 'Zona descenso',   color: '#ef4444', dot: '🔴' },
}

function ZoneSeparator({ label, color }) {
  return (
    <div className="league-zone-sep" style={{ borderColor: color }}>
      <span style={{ color }}>{label}</span>
    </div>
  )
}

function MemberRow({ member, isZoneStart, zone }) {
  const rowRef = useRef(null)
  useEffect(() => {
    if (member.isMe && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [member.isMe])

  return (
    <>
      {isZoneStart && <ZoneSeparator label={ZONE_META[zone].label} color={ZONE_META[zone].color} />}
      <div
        ref={rowRef}
        className={`league-member${member.isMe ? ' league-member--me' : ''}`}
      >
        <span className="league-member__rank">#{member.rank}</span>
        <UserAvatar
          size="xs"
          avatarType={member.avatarType || ''}
          avatarData={member.avatarData || {}}
          nickname={member.nickname || ''}
          name={member.name || ''}
          isMe={member.isMe}
          showNickname
          nicknameStyle="right"
          className="league-member__avatar"
        />
        <span className="league-member__zone-dot" title={ZONE_META[member.zone]?.label}>
          {ZONE_META[member.zone]?.dot}
        </span>
        <span className="league-member__pts">{member.totalPoints} pts</span>
      </div>
    </>
  )
}

export default function LeaguesPage() {
  const { myLeague, leaderboard, unseen, loading, error, markSeen } = useLeague()
  const sd = window.blokesSiteData || {}

  if (!sd.isLoggedIn) {
    return (
      <div className="league-login">
        <p>Inicia sesión para ver tu liga.</p>
        {sd.loginUrl && <a href={sd.loginUrl} className="league-login__btn">Iniciar sesión</a>}
      </div>
    )
  }

  if (loading) return <div className="league-loading">Cargando liga...</div>

  if (error && !myLeague) {
    return <div className="league-empty"><p>{error}</p></div>
  }

  if (!myLeague) {
    return (
      <div className="league-empty">
        <p>Aún no estás en ninguna liga.</p>
        <p className="league-empty__sub">Completa tu primer bloke para entrar en Liga Pedri.</p>
      </div>
    )
  }

  const meta = TIER_META[myLeague.tier] || TIER_META[1]

  // Build leaderboard with zone separators
  const zones = ['promotion', 'stay', 'demotion']
  const zoneStarts = new Set()
  zones.forEach(z => {
    const first = leaderboard.find(m => m.zone === z)
    if (first) zoneStarts.add(first.rank)
  })

  return (
    <div className="league-page">
      {/* Promotion / demotion dialogs */}
      {unseen.length > 0 && (
        <LeaguePromotionDialog event={unseen[0]} onClose={markSeen} />
      )}

      {/* League header */}
      <div className="league-header" style={{ borderColor: meta.color }}>
        <div className="league-header__emoji">{meta.emoji}</div>
        <div>
          <div className="league-header__name" style={{ color: meta.color }}>{myLeague.name}</div>
          <div className="league-header__stats">
            Puesto <strong>#{myLeague.rank}</strong> · {myLeague.totalPoints} pts
            <span className="league-header__zone" style={{ color: ZONE_META[myLeague.zone]?.color }}>
              {' '}{ZONE_META[myLeague.zone]?.dot} {ZONE_META[myLeague.zone]?.label}
            </span>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="league-leaderboard">
        {leaderboard.map(member => (
          <MemberRow
            key={member.userId}
            member={member}
            isZoneStart={zoneStarts.has(member.rank)}
            zone={member.zone}
          />
        ))}
        {leaderboard.length === 0 && (
          <p className="league-empty__sub">Nadie en esta liga todavía.</p>
        )}
      </div>
    </div>
  )
}
