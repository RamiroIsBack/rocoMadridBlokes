import { useState, useMemo } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import FilterBar from '../components/FilterBar'
import EventCard from '../components/EventCard'
import LoadingSpinner from '../components/LoadingSpinner'

function MainPage() {
  const { cards, loading, error } = useWordPressPosts()
  const [activeFilter, setActiveFilter] = useState('TODOS')

  const filteredCards = useMemo(() => {
    if (activeFilter === 'TODOS') return cards
    return cards.filter((card) => card.sala === activeFilter)
  }, [cards, activeFilter])

  return (
    <div className="app">
      <main className="app-main">
        <FilterBar activeFilter={activeFilter} onFilterChange={setActiveFilter} />

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
              <EventCard key={card.id} card={card} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default MainPage