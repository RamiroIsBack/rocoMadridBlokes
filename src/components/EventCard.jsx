import { useState } from 'react'
import ImageGallery from './ImageGallery'
import { recordInteraction } from '../hooks/useWordPressPosts'
import './EventCard.css'

const CATEGORY_LABELS = {
  PUZLE: 'Puzle',
  TECNICO: 'Técnico',
  ENTRENAMIENTO: 'Entrenamiento',
  COORDINACION: 'Coordinación',
}

// Color mapping for display
const COLOR_MAP = {
  green: { name: 'Verde', class: 'event-card__color--green' },
  blue: { name: 'Azul', class: 'event-card__color--blue' },
  yellow: { name: 'Amarillo', class: 'event-card__color--yellow' },
  red: { name: 'Rojo', class: 'event-card__color--red' },
}

// Icon definitions
const ICONS = [
  {
    id: 'star_1',
    label: 'buen bloke',
    title: 'Buen bloke',
    emoji: '⭐',
    color: '#fbbf24', // amber-400
  },
  {
    id: 'star_2',
    label: 'muy buen bloke',
    title: 'Muy buen bloke',
    emoji: '⭐⭐',
    color: '#fbbf24', // amber-400
  },
  {
    id: 'star_3',
    label: 'blokazo',
    title: 'Blokazo',
    emoji: '⭐⭐⭐',
    color: '#fbbf24', // amber-400
  },
  {
    id: 'skull',
    label: 'amor-odio',
    title: 'Amor-odio',
    emoji: '💀',
    color: '#6b7280', // gray
  },
]

/**
 * @param {{ card: Object }} props
 */
export default function EventCard({ card }) {
  const { images, title, description, category, color, interactions, postId } = card
  const categoryLabel = CATEGORY_LABELS[category] || category
  const colorInfo = COLOR_MAP[color] || COLOR_MAP.green
  
  // Local state for optimistic updates
  const [localInteractions, setLocalInteractions] = useState(interactions)
  const [isLoading, setIsLoading] = useState({})
  
  const handleIconClick = async (iconId) => {
    // Optimistic update
    setLocalInteractions(prev => ({
      ...prev,
      [iconId]: (prev[iconId] || 0) + 1
    }))
    
    setIsLoading(prev => ({ ...prev, [iconId]: true }))
    
    try {
      // Record interaction in WordPress
      await recordInteraction(postId, iconId)
    } catch (error) {
      // Rollback on error
      setLocalInteractions(prev => ({
        ...prev,
        [iconId]: (prev[iconId] || 1) - 1
      }))
      console.error('Failed to record interaction:', error)
    } finally {
      setIsLoading(prev => ({ ...prev, [iconId]: false }))
    }
  }
  
  return (
    <article className="event-card">
      <ImageGallery images={images} title={title} />
      <div className="event-card__body">
        <div className="event-card__header">
          <div className="event-card__title-row">
            <h2 className="event-card__title">{title}</h2>
            <div className="event-card__metadata">
              {category && (
                <span
                  className={`event-card__badge event-card__badge--${category.toLowerCase()}`}
                >
                  {categoryLabel}
                </span>
              )}
              <span 
                className={`event-card__color ${colorInfo.class}`}
                title={`Color: ${colorInfo.name}`}
                aria-label={`Color: ${colorInfo.name}`}
              />
            </div>
          </div>
        </div>
        
        {description && (
          <p className="event-card__description">{description}</p>
        )}
        
        {/* Interactive Icons */}
        <div className="event-card__interactions">
          <div className="event-card__interactions-label">¿Qué te parece este bloke?</div>
          <div className="event-card__icons">
            {ICONS.map(icon => {
              const count = localInteractions[icon.id] || 0
              const loading = isLoading[icon.id]
              
              return (
                <button
                  key={icon.id}
                  className={`event-card__icon ${loading ? 'event-card__icon--loading' : ''} ${count > 0 ? 'event-card__icon--has-count' : ''}`}
                  onClick={() => handleIconClick(icon.id)}
                  title={icon.title}
                  aria-label={icon.title}
                  disabled={loading}
                >
                  <span 
                    className="event-card__icon-emoji"
                    style={{ color: icon.color }}
                    aria-hidden="true"
                  >
                    {icon.emoji}
                  </span>
                  {count > 0 && (
                    <span className="event-card__icon-badge">
                      {count}
                    </span>
                  )}
                  {loading && (
                    <span className="event-card__icon-loading">...</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="event-card__interactions-hint">
            Haz clic en un icono para votar
          </div>
        </div>
      </div>
    </article>
  )
}
