import { useState, useMemo, useCallback, useEffect } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import { useCompletions } from '../hooks/useCompletions'
import FilterBar from '../components/FilterBar'
import EventCard from '../components/EventCard'
import LoadingSpinner from '../components/LoadingSpinner'
import CelebrationDialog from '../components/CelebrationDialog'
import OnboardingTutorial, { tutorialSeen } from '../components/OnboardingTutorial'
import IdentityPicker from '../components/IdentityPicker'
import { colorPorNumeroBloque } from '../utils/compeColorScale'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

const COLECCION_TUTORIAL_KEY = 'blokes_tutorial_seen_coleccion'
const COLECCION_SLIDES = [
  { icon: '🧗', title: '¡Bienvenido a Colección!', text: 'Aquí están todos los blokes del rocódromo. Filtra por sala o color y descubre los problemas de cada zona.' },
  { title: 'Marca lo que has hecho', text: 'Toca aquí para marcar este bloke como completado. Así vas construyendo tu progreso.', target: '[data-tutorial="done-btn"]' },
  { title: 'Valora tus favoritos', text: 'Toca la estrella para destacar los blokes que más te hayan gustado.', target: '[data-tutorial="star-btn"]' },
]

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function getAuthHeadersCompe() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

// Apunta un top de compe para quien eligió el picker "¿quién lo ha hecho?" (Ramiro, 09/11:
// en modo tablet, tocar un bloque de la compe tiene que hacer lo mismo que un bloke normal —
// abrir el picker — en vez de llevar a /compe). Siempre Top (y Zona, que ya cuenta con el top).
async function apuntarCompeParaIdentidad(compBlockId, identity) {
  const target = identity.kind === 'ph' ? { targetPlaceholderId: identity.placeholder_id } : { targetUserId: identity.user_id }
  const res = await fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/resultado`, {
    method: 'POST', credentials: 'include',
    headers: { ...getAuthHeadersCompe(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ compBlockId, top: true, zona: true, ...target }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.message || `Error ${res.status}`)
  return json
}

// Modo compe (NOTAS_PARA_CODE_compe_en_blokes.md, Ramiro 07/11 08:46: "Colección solo con los 16
// bloques de la compe, sin foto") — propia e independiente de la carga normal de blokes/
// completions: si esto falla, Colección sigue funcionando como siempre, solo no sale el aviso.
function useCompeEstado() {
  const [estado, setEstado] = useState(null)
  useEffect(() => {
    // Vista previa del modo compe para un vídeo tutorial (Ramiro 12/11 16:15, NOTAS_PARA_CODE_
    // compe_en_blokes.md): ?previewCompe=<id de una compe de prueba> en la URL — el backend solo
    // la atiende si quien pide tiene sesión de socio, así que aquí no hace falta comprobar nada
    // más; para cualquier otro no pasa nada, sigue mirando la compe real como siempre.
    const previewId = new URLSearchParams(window.location.search).get('previewCompe')
    const url = `${CLUB_URL}/wp-json/progreso/v1/compe/estado${previewId ? `?previewCompeId=${encodeURIComponent(previewId)}` : ''}`
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(j => setEstado(j?.data || null))
      .catch(() => {})
  }, [])
  return estado
}

// Resalta la subzona en el mapa de la cabecera (App.jsx) al tocar "dónde está" — un evento
// suelto en vez de un estado compartido porque el mapa vive en otro componente (Ramiro, 09/11
// 05:45, punto opcional).
function resaltarSubsala(subzona) {
  if (subzona) window.dispatchEvent(new CustomEvent('blokes:resaltar-subsala', { detail: subzona }))
}

// Colección en modo compe: SOLO los 16 bloques, número y color, nunca la foto (se enseña al
// apagar el modo) — para que nadie sepa cómo son antes de probarlos. En rol "tablet" (Ramiro,
// 09/11: "lo mismo que sin compe") tocar un bloque abre el mismo picker "¿quién lo ha hecho?"
// de Colección en vez de llevar a /compe, y el top se apunta como de la compe.
function ColeccionModoCompe({ estado }) {
  const isTablet = window.blokesSiteData?.userRole === 'tablet'
  const [pickerBloque, setPickerBloque] = useState(null)
  const [celebration, setCelebration] = useState(null)

  const tocar = useCallback((e, b) => {
    if (!isTablet) return
    e.preventDefault()
    setPickerBloque(b)
  }, [isTablet])

  const completarParaIdentidad = useCallback(async (identity) => {
    const bloque = pickerBloque
    setPickerBloque(null)
    if (!bloque) return
    try {
      await apuntarCompeParaIdentidad(bloque.compBlockId, identity)
      setCelebration({ nombre: identity.name, numero: bloque.numero })
    } catch (e) {
      console.error('Tablet compe completion failed:', e)
    }
  }, [pickerBloque])

  return (
    <main className="app-main">
      <div style={{
        background: '#111827', color: '#fff', textAlign: 'center', fontSize: '0.9rem',
        padding: '10px 12px', borderRadius: 10, marginBottom: 16,
      }}>
        🧗 <strong>Modo compe activo — {estado.nombre}</strong><br />
        Norma de honor: apunta tus tops en{' '}
        <a href="/blokes/compe" style={{ color: '#fbbf24', fontWeight: 600 }}>Compe</a>, que un
        compañero o profe te haya visto hacerlos.
      </div>
      {pickerBloque && (
        <IdentityPicker
          title={`¿Quién ha hecho el bloque ${pickerBloque.numero}?`}
          onPick={completarParaIdentidad}
          onClose={() => setPickerBloque(null)}
        />
      )}
      {celebration && (
        <div style={{
          background: '#dcfce7', color: '#166534', textAlign: 'center', fontWeight: 700,
          padding: '10px 12px', borderRadius: 10, marginBottom: 16,
        }}>
          ✓ Bloque {celebration.numero} apuntado a {celebration.nombre}{' '}
          <button type="button" onClick={() => setCelebration(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#166534', textDecoration: 'underline', cursor: 'pointer' }}>Vale</button>
        </div>
      )}
      <div className="cards-grid compe-cards-grid">
        {(estado.bloques || []).map(b => {
          // Nunca dar por hecho que son 16 — Ramiro, 11/11 05:01: tiene que poder añadir
          // bloques (17, 18...) sin que la escala de color se quede corta.
          const color = colorPorNumeroBloque(b.numero, estado.bloques.length)
          return (
            <a
              key={b.compBlockId}
              href="/blokes/compe"
              onClick={e => tocar(e, b)}
              className="compe-card"
              style={{ background: color.bg, color: color.text, textDecoration: 'none' }}
            >
              <span className="compe-card__numero">{b.numero}</span>
              <span
                className="compe-card__zona"
                onClick={e => { e.stopPropagation(); e.preventDefault(); resaltarSubsala(b.subzona) }}
              >
                {b.sala ? `${b.sala} · zona ${b.subzona}` : 'Zona por confirmar'}
              </span>
            </a>
          )
        })}
      </div>
    </main>
  )
}

function MainPage() {
  const compeEstado = useCompeEstado()
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
      setCelebration({ title: card.title, count: result.count, firstAscent: result.first_ascent === true, league: result.league || null })
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
        setCelebration({ title: `${card.title} — ${identity.name}`, count: data.count, firstAscent: data.first_ascent === true, league: data.league || null })
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

  if (compeEstado?.activo) {
    return (
      <div className="app">
        <ColeccionModoCompe estado={compeEstado} />
      </div>
    )
  }

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
          league={celebration.league}
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
