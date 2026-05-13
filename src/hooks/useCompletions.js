import { useState, useCallback, useEffect } from 'react'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'
const LS_RATINGS_KEY = 'blokes_my_ratings'

function getSiteData() {
  const sd = window.blokesSiteData
  const fallbackLogin = `${WORDPRESS_URL}/wp-login.php?redirect_to=${encodeURIComponent(window.location.href)}`
  if (!sd) return { isLoggedIn: false, nonce: null, loginUrl: fallbackLogin }
  if (!sd.loginUrl) return { ...sd, loginUrl: fallbackLogin }
  return sd
}

function loadLocalRatings() {
  try { return JSON.parse(localStorage.getItem(LS_RATINGS_KEY) || '{}') } catch { return {} }
}

function saveLocalRatings(ratings) {
  try { localStorage.setItem(LS_RATINGS_KEY, JSON.stringify(ratings)) } catch {}
}

export function useCompletions() {
  const siteData = getSiteData()
  const [isLoggedIn, setIsLoggedIn] = useState(siteData.isLoggedIn)
  const [nonce, setNonce] = useState(siteData.nonce)
  const [completedByMe, setCompletedByMe] = useState(new Set())
  const [countOverrides, setCountOverrides] = useState({})
  const [completionLog, setCompletionLog] = useState([])
  const [ratingLog, setRatingLog] = useState([])
  const [myRatings, setMyRatings] = useState(loadLocalRatings)
  const [ratingCountOverrides, setRatingCountOverrides] = useState({})
  const [sessionVoted, setSessionVoted] = useState(() => {
    const stored = loadLocalRatings()
    return new Set(Object.keys(stored).filter(k => stored[k] != null))
  })

  useEffect(() => {
    const headers = {}
    if (siteData.nonce) headers['X-WP-Nonce'] = siteData.nonce

    fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/my-completions`, {
      credentials: 'include',
      headers,
    })
      .then(r => {
        if (!r.ok) return null
        setIsLoggedIn(true)
        return r.json()
      })
      .then(data => {
        if (!data) return
        if (data.nonce) setNonce(data.nonce)
        setCompletedByMe(new Set((data.myIds || []).map(Number)))
        setCompletionLog(data.log || [])
        setRatingLog(data.ratingLog || [])
        if (data.myRatings && Object.keys(data.myRatings).length > 0) {
          const serverRatings = data.myRatings
          setMyRatings(serverRatings)
          setSessionVoted(new Set(Object.keys(serverRatings).filter(k => serverRatings[k] != null)))
        }
      })
      .catch(e => console.warn('Could not load completions:', e))
  }, [])

  const toggleCompletion = useCallback(async (postId, currentCount) => {
    const { isLoggedIn, nonce, loginUrl } = getSiteData()

    if (!isLoggedIn) {
      window.location.href = loginUrl
      return
    }

    const wasCompleted = completedByMe.has(postId)
    const optimisticCount = Math.max(0, currentCount + (wasCompleted ? -1 : 1))

    setCompletedByMe(prev => {
      const next = new Set(prev)
      wasCompleted ? next.delete(postId) : next.add(postId)
      return next
    })
    setCountOverrides(prev => ({ ...prev, [postId]: optimisticCount }))

    try {
      const res = await fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/completions/${postId}/toggle`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      setCompletedByMe(prev => {
        const next = new Set(prev)
        data.completed ? next.add(postId) : next.delete(postId)
        return next
      })
      setCountOverrides(prev => ({ ...prev, [postId]: data.count }))
      return data
    } catch (e) {
      setCompletedByMe(prev => {
        const next = new Set(prev)
        wasCompleted ? next.add(postId) : next.delete(postId)
        return next
      })
      setCountOverrides(prev => {
        const next = { ...prev }
        delete next[postId]
        return next
      })
      console.error('Toggle completion failed:', e)
      return null
    }
  }, [completedByMe])

  const rateBloke = useCallback(async (postId, type, baseRatings = {}) => {
    const { nonce } = getSiteData()
    const key = String(postId)
    const currentRating = myRatings[key] || null
    const alreadyVoted = sessionVoted.has(key)

    // Already voted this session and clicking the same icon → do nothing
    if (alreadyVoted && currentRating === type) return

    const newRating = type
    const previousType = currentRating

    // Optimistic: update selection
    setMyRatings(prev => ({ ...prev, [key]: newRating }))

    // Optimistic: update counts
    const optimisticCounts = { ...baseRatings }
    if (previousType && optimisticCounts[previousType] !== undefined) {
      optimisticCounts[previousType] = Math.max(0, (Number(optimisticCounts[previousType]) || 0) - 1)
    }
    optimisticCounts[newRating] = (Number(optimisticCounts[newRating]) || 0) + 1
    setRatingCountOverrides(prev => ({ ...prev, [postId]: optimisticCounts }))

    // Mark as voted this session
    setSessionVoted(prev => new Set([...prev, key]))

    // Persist in localStorage
    const stored = loadLocalRatings()
    stored[key] = newRating
    saveLocalRatings(stored)

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (nonce) headers['X-WP-Nonce'] = nonce

      const res = await fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/rate/${postId}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ type, previousType }),
      })
      const data = await res.json()
      setMyRatings(prev => ({ ...prev, [key]: data.rating }))
      if (data.interactions) {
        setRatingCountOverrides(prev => ({ ...prev, [postId]: data.interactions }))
      }
    } catch (e) {
      // Rollback
      setMyRatings(prev => ({ ...prev, [key]: currentRating }))
      setRatingCountOverrides(prev => { const next = { ...prev }; delete next[postId]; return next })
      if (!alreadyVoted) setSessionVoted(prev => { const next = new Set(prev); next.delete(key); return next })
      const rolled = loadLocalRatings()
      if (currentRating === null) { delete rolled[key] } else { rolled[key] = currentRating }
      saveLocalRatings(rolled)
      console.error('Rating failed:', e)
    }
  }, [myRatings, sessionVoted])

  return {
    isLoggedIn: siteData.isLoggedIn,
    loginUrl: siteData.loginUrl,
    completedByMe,
    countOverrides,
    toggleCompletion,
    myRatings,
    ratingCountOverrides,
    rateBloke,
    completionLog,
    ratingLog,
  }
}
