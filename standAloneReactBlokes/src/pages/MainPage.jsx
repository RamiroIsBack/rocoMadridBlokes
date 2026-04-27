import { useState, useMemo } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import FilterBar from '../components/FilterBar'
import EventCard from '../components/EventCard'
import LoadingSpinner from '../components/LoadingSpinner'

function MainPage() {
  const { cards, loading, error } = useWordPressPosts()
  const [activeSala, setActiveSala] = useState('TODOS')
  const [activeColor, setActiveColor] = useState('TODOS')
  const [sortMode, setSortMode] = useState('newest')

  const newCardIds = useMemo(() => {
    const sorted = [...cards].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    return new Set(sorted.slice(0, 10).map(c => c.id))
  }, [cards])

  const filteredCards = useMemo(() => {
    return cards
      .filter((card) => {
        if (activeSala !== 'TODOS' && card.sala !== activeSala) return false
        if (activeColor !== 'TODOS' && card.color !== activeColor) return false
        return true
      })
      .sort((a, b) => {
        if (sortMode === 'stars') {
          const diff = (b.totalInteractions || 0) - (a.totalInteractions || 0)
          return diff !== 0 ? diff : new Date(b.timestamp) - new Date(a.timestamp)
        }
        return new Date(b.timestamp) - new Date(a.timestamp)
      })
  }, [cards, activeSala, activeColor, sortMode])

  return (
    <div className="app">
      <main className="app-main">
        <FilterBar
          activeSala={activeSala}
          onSalaChange={setActiveSala}
          activeColor={activeColor}
          onColorChange={setActiveColor}
          sortMode={sortMode}
          onSortMode={setSortMode}
        />

        {loading && <LoadingSpinner />}

        {error && (
          <div className="error-message" role="alert">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && filteredCards.length === 0 && (
          <div className="empty-state">
            <p>No hay problemas en esta categoría todavía.</p>
          </div>
        )}

        {!loading && !error && filteredCards.length > 0 && (
          <div className="cards-grid">
            {filteredCards.map((card) => (
              <EventCard key={card.id} card={card} isNew={newCardIds.has(card.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default MainPage
