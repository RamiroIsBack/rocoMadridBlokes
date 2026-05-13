import { useState, useMemo, useCallback } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import { useCompletions } from '../hooks/useCompletions'
import FilterBar from '../components/FilterBar'
import EventCard from '../components/EventCard'
import LoadingSpinner from '../components/LoadingSpinner'
import CelebrationDialog from '../components/CelebrationDialog'

function MainPage() {
  const { cards, loading, error } = useWordPressPosts()
  const { isLoggedIn, loginUrl, completedByMe, countOverrides, toggleCompletion, myRatings, ratingCountOverrides, rateBloke } = useCompletions()
  const [activeSala, setActiveSala] = useState('TODOS')
  const [activeColor, setActiveColor] = useState('TODOS')
  const [sortMode, setSortMode] = useState('newest')
  const [celebration, setCelebration] = useState(null)

  const handleToggleDone = useCallback(async (card) => {
    const currentCount = countOverrides[card.postId] ?? card.completionCount ?? 0
    const result = await toggleCompletion(card.postId, currentCount)
    if (result?.completed) {
      setCelebration({ title: card.title, count: result.count })
    }
  }, [toggleCompletion, countOverrides])

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
        if (sortMode === 'tops') {
          const diff = (b.completionCount || 0) - (a.completionCount || 0)
          return diff !== 0 ? diff : new Date(b.timestamp) - new Date(a.timestamp)
        }
        return new Date(b.timestamp) - new Date(a.timestamp)
      })
  }, [cards, activeSala, activeColor, sortMode])

  return (
    <div className="app">
      {celebration && (
        <CelebrationDialog
          title={celebration.title}
          count={celebration.count}
          onClose={() => setCelebration(null)}
        />
      )}
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
              <EventCard
                key={card.id}
                card={card}
                isNew={newCardIds.has(card.id)}
                isDone={completedByMe.has(card.postId)}
                completionCount={countOverrides[card.postId] ?? card.completionCount ?? 0}
                onToggleDone={() => handleToggleDone(card)}
                isLoggedIn={isLoggedIn}
                loginUrl={loginUrl}
                myRating={myRatings[String(card.postId)] || null}
                ratingCounts={ratingCountOverrides[card.postId] ?? card.interactions}
                onRate={(type) => rateBloke(card.postId, type, ratingCountOverrides[card.postId] ?? card.interactions)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default MainPage
