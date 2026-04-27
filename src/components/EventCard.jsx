import ImageGallery from './ImageGallery'
import './EventCard.css'

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
  { id: 'star_1', emoji: '⭐',    title: 'Buen bloke',      type: 'star' },
  { id: 'star_2', emoji: '⭐⭐',  title: 'Muy buen bloke',  type: 'star' },
  { id: 'star_3', emoji: '⭐⭐⭐',title: 'Blokazo',         type: 'star' },
  { id: 'skull',  emoji: '💀',    title: 'Amor-odio',       type: 'skull' },
]

export default function EventCard({ card, isNew = false, isHof = false, isDone = false, completionCount = 0, onToggleDone, isLoggedIn = false, loginUrl = '/wp-login.php', myRating = null, onRate }) {
  const { images, title, description, color, sala, tipo, postId, colorPresa, ratings = {} } = card
  const colorInfo = COLOR_MAP[color] || COLOR_MAP.green
  const salaInfo = SALA_MAP[sala] || SALA_MAP.entrada
  const colorPresaInfo = COLOR_PRESA_MAP[colorPresa] || null
  const isIntro = tipo === 'intro'
  const isTrave = tipo === 'trave' || color === 'blanco'

  const handleDoneClick = () => {
    if (!isLoggedIn) {
      window.location.href = loginUrl
      return
    }
    if (onToggleDone) onToggleDone()
  }

  const handleRateClick = (iconId) => {
    if (onRate) onRate(iconId)
  }

  return (
    <article className="event-card">
      <ImageGallery images={images} title={title} />
      <div className="event-card__done-anchor">
        <div className="event-card__rating-wrap">
          {RATING_ICONS.map(icon => {
            const isActive = myRating === icon.id
            const count = ratings[icon.id] || 0
            return (
              <button
                key={icon.id}
                className={`event-card__rating-btn event-card__rating-btn--${icon.type}${isActive ? ' event-card__rating-btn--active' : ''}`}
                onClick={() => handleRateClick(icon.id)}
                title={icon.title}
                aria-label={icon.title}
              >
                <span className={`event-card__rating-emoji${!isActive ? ' event-card__rating-emoji--inactive' : ''}`}>
                  {icon.emoji}
                </span>
                {count > 0 && (
                  <span className={`event-card__rating-count event-card__rating-count--${icon.type}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="event-card__done-wrap">
          {isLoggedIn ? (
            <span className="event-card__done-count" title={`${completionCount} TOPs`}>
              {completionCount}
            </span>
          ) : (
            <span
              className="event-card__done-count event-card__done-count--locked"
              title="Número de TOPs"
              onClick={handleDoneClick}
            >
              ?
            </span>
          )}
          <button
            className={`event-card__done-btn${isDone ? ' event-card__done-btn--active' : ''}`}
            onClick={handleDoneClick}
            title={isDone ? 'Marcar como no completado' : isLoggedIn ? 'Marcar como completado' : 'Inicia sesión para marcarlo como completado'}
            aria-label={isDone ? 'Marcar como no completado' : 'Marcar como completado'}
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
