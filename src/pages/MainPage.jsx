import { useState, useMemo, useCallback } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import { useCompletions } from '../hooks/useCompletions'
import FilterBar from '../components/FilterBar'
import EventCard from '../components/EventCard'
import LoadingSpinner from '../components/LoadingSpinner'
import CelebrationDialog from '../components/CelebrationDialog'
import OnboardingTutorial, { tutorialSeen } from '../components/OnboardingTutorial'
import IdentityPicker from '../components/IdentityPicker'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

const COLECCION_TUTORIAL_KEY = 'blokes_tutorial_seen_coleccion'
const COLECCION_SLIDES = [
  { icon: '🧗', title: '¡Bienvenido a Colección!', text: 'Aquí están todos los blokes del rocódromo. Filtra por sala o color y descubre los problemas de cada zona.' },
  { title: 'Marca lo que has hecho', text: 'Toca aquí para marcar este bloke como completado. Así vas construyendo tu progreso.', target: '[data-tutorial="done-btn"]' },
  { title: 'Valora tus favoritos', text: 'Toca la estrella para destacar los blokes que más te hayan gustado.', target: '[data-tutorial="star-btn"]' },
]

function MainPage() {
  const { cards, loading, error } = useWordPressPosts()
  const { isLoggedIn, loginUrl, completedByMe, countOverrides, toggleCompletion, myRatings, ratingCountOverrides, rateBloke, firstAscentIds } = useCompletions()
  const [activeSala, setActiveSala] = useState('TODOS')
  const [activeColor, setActiveColor] = useState('TODOS')
  const [sortMode, setSortMode] = useState('newest')
  const [celebration, setCelebration] = useState(null)
  const [showTutorial, setShowTutorial] = useState(() => !tutorialSeen(COLECCION_TUTORIAL_KEY))
  const isTablet = window.blokesSiteData?.userRole === 'tablet'
  const [pickerCard, setPickerCard] = useState(null)

  const handleToggleDone = useCallback(async (card) => {
    // The tablet has no "me" of its own — every tap attributes the top to
    // whoever picks themselves, instead of toggling the tablet account's
    // own (meaningless) completion state.
    if (isTablet) { setPickerCard(card); return }
    const currentCount = countOverrides[card.postId] ?? card.completionCount ?? 0
    const result = await toggleCompletion(card.postId, currentCount)
    if (result?.completed) {
      setCelebration({ title: card.title, count: result.count, firstAscent: result.first_ascent === true })
    }
  }, [toggleCompletion, countOverrides, isTablet])

  const completeForIdentity = useCallback(async (identity) => {
    const card = pickerCard
    setPickerCard(null)
    if (!card) return
    try {
      const nonce = window.blokesSiteData?.nonce
      const body = identity.kind === 'ph' ? { target_placeholder_id: identity.placeholder_id } : { target_user_id: identity.user_id }
      const res = await fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/completions/${card.postId}/toggle`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok && data.completed) {
        setCelebration({ title: `${card.title} — ${identity.name}`, count: data.count, firstAscent: data.first_ascent === true })
      }
    } catch (e) {
      console.error('Tablet completion failed:', e)
    }
  }, [pickerCard])

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
      {showTutorial && !loading && filteredCards.length > 0 && (
        <OnboardingTutorial
          storageKey={COLECCION_TUTORIAL_KEY}
          slides={COLECCION_SLIDES}
          onClose={() => setShowTutorial(false)}
        />
      )}
      {pickerCard && (
        <IdentityPicker
          title={`¿Quién completó "${pickerCard.title}"?`}
          onPick={completeForIdentity}
          onClose={() => setPickerCard(null)}
        />
      )}
      {celebration && (
        <CelebrationDialog
          title={celebration.title}
          count={celebration.count}
          firstAscent={celebration.firstAscent}
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
            {filteredCards.map((card, index) => (
              <EventCard
                key={card.id}
                card={card}
                isNew={newCardIds.has(card.id)}
                isDone={completedByMe.has(card.postId)}
                isMyFirstAscent={firstAscentIds.has(card.postId)}
                completionCount={countOverrides[card.postId] ?? card.completionCount ?? 0}
                onToggleDone={() => handleToggleDone(card)}
                isLoggedIn={isLoggedIn}
                loginUrl={loginUrl}
                myRating={myRatings[String(card.postId)] || null}
                ratingCounts={ratingCountOverrides[card.postId] ?? card.interactions}
                onRate={(type) => rateBloke(card.postId, type, ratingCountOverrides[card.postId] ?? card.interactions)}
                tutorialTarget={index === 0}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default MainPage
