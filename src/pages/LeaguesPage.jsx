import { useEffect, useRef, useState } from 'react'
import { useLeague, useComunidadLeagues } from '../hooks/useLeague'
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

function MemberRow({ member }) {
  const rowRef = useRef(null)
  useEffect(() => {
    if (member.isMe && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [member.isMe])

  return (
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
      <span className="league-member__pts">{member.totalPoints} pts</span>
    </div>
  )
}

function OtherLeagues() {
  const { leagues, loading } = useComunidadLeagues()
  const [openId, setOpenId] = useState(null)

  const others = leagues.filter(l => !l.isMyLeague)
  if (loading || others.length === 0) return null

  return (
    <div className="league-others">
      <div className="league-others__title">Otras ligas</div>
      {others.map(league => {
        const meta = TIER_META[league.tier] || TIER_META[1]
        const isOpen = openId === league.leagueId
        return (
          <div key={league.leagueId} className="league-other">
            <button
              className={`league-other__header${isOpen ? ' league-other__header--open' : ''}`}
              onClick={() => setOpenId(isOpen ? null : league.leagueId)}
            >
              <span className="league-other__emoji">{meta.emoji}</span>
              <span className="league-other__name" style={{ color: meta.color }}>{league.name}</span>
              <span className="league-other__count">{(league.members || []).length} miembros</span>
              <span className="league-other__chevron">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="league-other__body">
                {(league.members || []).map(m => (
                  <div key={m.userId} className="league-other__member">
                    <UserAvatar
                      size="xs"
                      avatarType={m.avatarType || ''}
                      avatarData={m.avatarData || {}}
                      nickname={m.nickname || ''}
                      name={m.nickname || ''}
                      isMe={m.isMe}
                      showNickname
                      nicknameStyle="right"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
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
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="league-leaderboard">
        {leaderboard.map(member => (
          <MemberRow key={member.userId} member={member} />
        ))}
        {leaderboard.length === 0 && (
          <p className="league-empty__sub">Nadie en esta liga todavía.</p>
        )}
      </div>

      {/* Other leagues — secondary, collapsible */}
      <OtherLeagues />
    </div>
  )
}
