import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import ImageGallery from './ImageGallery'
import UserAvatar from './UserAvatar'
import './EventCard.css'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

const COLOR_MAP = {
  green: { name: 'Verde', class: 'event-card__color--green' },
  blue: { name: 'Azul', class: 'event-card__color--blue' },
  yellow: { name: 'Amarillo', class: 'event-card__color--yellow' },
  red: { name: 'Rojo', class: 'event-card__color--red' },
  black: { name: 'Negro', class: 'event-card__color--black' },
  blanco: { name: 'Trave', class: 'event-card__color--blanco' },
}

const SALA_MAP = {
  entrada: { name: 'Entrada', class: 'event-card__sala--entrada' },
  sala_grande: { name: 'Sala Grande', class: 'event-card__sala--grande' },
  cueva: { name: 'Cueva', class: 'event-card__sala--cueva' },
}

const COLOR_PRESA_MAP = {
  presas_azules:        { name: 'Presas Azules',         bg: '#eff6ff', text: '#3b82f6' },
  presas_blancas:       { name: 'Presas Blancas',        bg: '#f9f9f9', text: '#6b7280' },
  presas_negras:        { name: 'Presas Negras',         bg: '#f3f4f6', text: '#374151' },
  presas_rojas:         { name: 'Presas Rojas',          bg: '#fff5f5', text: '#ef4444' },
  presas_amarillas:     { name: 'Presas Amarillas',      bg: '#fffde7', text: '#b45309' },
  presas_verdes:        { name: 'Presas Verdes',         bg: '#f0fdf4', text: '#16a34a' },
  presas_moradas:       { name: 'Presas Moradas',        bg: '#faf5ff', text: '#7c3aed' },
  presas_rosas:         { name: 'Presas Rosas',          bg: '#fdf2f8', text: '#be185d' },
  presas_grises:        { name: 'Presas Grises',         bg: '#f4f4f5', text: '#52525b' },
  presas_turquesa:      { name: 'Presas Turquesa',       bg: '#f0fdfa', text: '#0d9488' },
  presas_amarillo_fluor:{ name: 'Presas Amarillo Fluor', bg: '#fefce8', text: '#65a30d' },
  presas_naranja:       { name: 'Presas Naranja',        bg: '#fff7ed', text: '#ea580c' },
  presas_color_raro:    { name: 'Presas Color Raro',     bg: '#f5f5f5', text: '#6b7280' },
}

function HoldIcon() {
  return (
    <img
      className="event-card__hold-icon"
      src="https://rocomadrid.com/wp-content/uploads/2026/03/presas.png"
      alt="presa"
      aria-hidden="true"
    />
  )
}

const RATING_ICONS = [
  { id: 'star_1', emoji: '⭐', title: '¡Blokazo!', type: 'star' },
]

export default function EventCard({ card, isNew = false, isHof = false, isDone = false, isMyFirstAscent = false, completionCount = 0, onToggleDone, isLoggedIn = false, loginUrl = '/wp-login.php', myRating = null, ratingCounts, onRate, tutorialTarget = false }) {
  const { images, title, description, color, sala, tipo, postId, colorPresa, ratings: cardRatings = {}, firstAscent } = card
  const ratings = ratingCounts || cardRatings
  const colorInfo = COLOR_MAP[color] || COLOR_MAP.green
  const salaInfo = SALA_MAP[sala] || SALA_MAP.entrada
  const colorPresaInfo = COLOR_PRESA_MAP[colorPresa] || null
  const isIntro = tipo === 'intro'
  const isTrave = tipo === 'trave' || color === 'blanco'

  const [showCompleters, setShowCompleters] = useState(false)
  const [completers, setCompleters] = useState(null)
  const [loadingCompleters, setLoadingCompleters] = useState(false)
  const [popoverPos, setPopoverPos] = useState(null)
  const fetchedRef = useRef(false)
  const badgeRef = useRef(null)

  const loadCompleters = () => {
    if (fetchedRef.current || loadingCompleters) return
    fetchedRef.current = true
    setLoadingCompleters(true)
    fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/completers/${postId}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => setCompleters(json?.data || { users: [], total: 0 }))
      .catch(() => setCompleters({ users: [], total: 0 }))
      .finally(() => setLoadingCompleters(false))
  }

  const openCompleters = () => {
    if (completionCount <= 0) return
    loadCompleters()
    setShowCompleters(true)
  }

  // Recompute the popover position fresh, synchronously after layout, every
  // time it opens — reading the rect inside the click/hover handler could
  // race with pending layout (e.g. images loading) and produce a stale box.
  useLayoutEffect(() => {
    if (!showCompleters || !badgeRef.current) return
    const POPOVER_WIDTH = 150
    const POPOVER_EST_HEIGHT = 90
    const rect = badgeRef.current.getBoundingClientRect()
    const left = Math.min(
      Math.max(rect.right - POPOVER_WIDTH, 8),
      window.innerWidth - POPOVER_WIDTH - 8
    )
    const fitsBelow = rect.bottom + 6 + POPOVER_EST_HEIGHT <= window.innerHeight
    const top = fitsBelow ? rect.bottom + 6 : Math.max(rect.top - 6 - POPOVER_EST_HEIGHT, 8)
    setPopoverPos({ top, left })
  }, [showCompleters])

  const handleDoneClick = () => {
    if (!isLoggedIn) {
      window.location.href = loginUrl
      return
    }
    if (onToggleDone) onToggleDone()
  }

  const handleRateClick = (iconId) => {
    if (!onRate) return
    if (starActive) return
    onRate(iconId)
  }

  const starCount = (ratings.star_1 || 0) + (ratings.star_2 || 0) + (ratings.star_3 || 0) + (ratings.skull || 0)
  const starActive = myRating === 'star_1' || myRating === 'star_2' || myRating === 'star_3' || myRating === 'skull'

  return (
    <article className="event-card">
      <ImageGallery images={images} title={title} />
      <div className="event-card__done-anchor">
        <div className="event-card__rating-wrap">
          {RATING_ICONS.map(icon => {
            const isActive = icon.type === 'star' ? starActive : myRating === icon.id
            const count = icon.type === 'star' ? starCount : skullCount
            return (
              <button
                key={icon.id}
                className={`event-card__rating-btn event-card__rating-btn--${icon.type}${isActive ? ' event-card__rating-btn--active' : ''}`}
                onClick={() => handleRateClick(icon.id)}
                title={icon.title}
                aria-label={icon.title}
                {...(tutorialTarget && icon.type === 'star' ? { 'data-tutorial': 'star-btn' } : {})}
              >
                <span className={`event-card__rating-emoji${!isActive ? ' event-card__rating-emoji--inactive' : ''}`}>
                  {icon.emoji}
                </span>
                {count > 0 && (
                  <span className="event-card__rating-count event-card__rating-count--star">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="event-card__done-wrap">
          {isLoggedIn ? (
            <div
              ref={badgeRef}
              className="event-card__done-count"
              title={`${completionCount} TOPs`}
              onMouseEnter={openCompleters}
              onMouseLeave={() => setShowCompleters(false)}
              onClick={() => (showCompleters ? setShowCompleters(false) : openCompleters())}
            >
              <span className="event-card__done-tops">tops</span>
              <span>{completionCount}</span>
              {showCompleters && completionCount > 0 && popoverPos && createPortal(
                <div
                  className="event-card__completers"
                  style={{ top: popoverPos.top, left: popoverPos.left }}
                  onClick={e => e.stopPropagation()}
                >
                  {loadingCompleters && !completers ? (
                    <p className="event-card__completers-loading">Cargando...</p>
                  ) : (
                    <>
                      {(completers?.users || []).map(u => (
                        <div key={u.user_id} className="event-card__completer-row">
                          <UserAvatar
                            size="xs"
                            avatarType={u.avatarType || ''}
                            avatarData={u.avatarData || {}}
                            nickname={u.nickname || ''}
                            name={u.name || ''}
                            showNickname
                            nicknameStyle="right"
                          />
                        </div>
                      ))}
                      {completers && completers.total > completers.users.length && (
                        <p className="event-card__completers-more">
                          +{completers.total - completers.users.length} más
                        </p>
                      )}
                      {completers && completers.total === 0 && (
                        <p className="event-card__completers-loading">Sin datos</p>
                      )}
                    </>
                  )}
                </div>,
                document.body
              )}
            </div>
          ) : (
            <div
              className="event-card__done-count event-card__done-count--locked"
              title="Número de TOPs"
              onClick={handleDoneClick}
            >
              <span className="event-card__done-tops">tops</span>
              <span>?</span>
            </div>
          )}
          <button
            className={`event-card__done-btn${isDone ? ' event-card__done-btn--active' : ''}`}
            onClick={handleDoneClick}
            title={isDone ? 'Marcar como no completado' : isLoggedIn ? 'Marcar como completado' : 'Inicia sesión para marcarlo como completado'}
            aria-label={isDone ? 'Marcar como no completado' : 'Marcar como completado'}
            {...(tutorialTarget ? { 'data-tutorial': 'done-btn' } : {})}
          >
            ✓
          </button>
        </div>
      </div>
      {isNew && (
        <div className="event-card__new-badge" aria-label="Nuevo">
          <span>NUEVO</span>
        </div>
      )}
      {isHof && (
        <div className="event-card__hof-badge" aria-label="Hall of Fame">
          🏆 Hall of Fame
        </div>
      )}
      {firstAscent?.name && (
        <div className={`event-card__fa-badge${isMyFirstAscent ? ' event-card__fa-badge--mine' : ''}`} title="Primer TOP del gym">
          🏴 {firstAscent.name} — ¡primero en hacer top!
        </div>
      )}
      <div className="event-card__body">
        <div className="event-card__header">
          <div className="event-card__title-row">
            <h2 className="event-card__title">{title}</h2>
            {isIntro ? (
              <span className={`event-card__color event-card__color--intro`}>
                INTRO
              </span>
            ) : isTrave ? (
              <span className={`event-card__color ${colorInfo.class}`}>
                Trave
              </span>
            ) : (
              <span
                className={`event-card__color ${colorInfo.class}`}
                title={`Color: ${colorInfo.name}`}
                aria-label={`Color: ${colorInfo.name}`}
              />
            )}
            <span className={`event-card__sala ${salaInfo.class}`}>
              {salaInfo.name}
            </span>
          </div>
        </div>

        {description && (
          <p className="event-card__description">{description}</p>
        )}

        {colorPresaInfo && (
          <div
            className="event-card__colorpresa"
            style={{ backgroundColor: colorPresaInfo.bg, color: colorPresaInfo.text, borderColor: colorPresaInfo.bg }}
          >
            <HoldIcon />
            <span className="event-card__colorpresa-text">{colorPresaInfo.name}</span>
          </div>
        )}
      </div>
    </article>
  )
}
