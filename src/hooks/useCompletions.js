import { useState, useCallback, useEffect } from 'react'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'
const LS_RATINGS_KEY = 'blokes_my_ratings'

function getSiteData() {
  return window.blokesSiteData || { isLoggedIn: false, nonce: null, loginUrl: '/wp-login.php' }
}

function loadLocalRatings() {
  try { return JSON.parse(localStorage.getItem(LS_RATINGS_KEY) || '{}') } catch { return {} }
}

function saveLocalRatings(ratings) {
  try { localStorage.setItem(LS_RATINGS_KEY, JSON.stringify(ratings)) } catch {}
}

export function useCompletions() {
  const siteData = getSiteData()
  const [completedByMe, setCompletedByMe] = useState(new Set())
  const [countOverrides, setCountOverrides] = useState({})
  const [myRatings, setMyRatings] = useState(loadLocalRatings)
  const [ratingCountOverrides, setRatingCountOverrides] = useState({})

  useEffect(() => {
    if (!siteData.isLoggedIn || !siteData.nonce) return

    fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/my-completions`, {
      credentials: 'include',
      headers: { 'X-WP-Nonce': siteData.nonce },
    })
      .then(r => r.json())
      .then(data => {
        setCompletedByMe(new Set((data.myIds || []).map(Number)))
        if (data.myRatings && Object.keys(data.myRatings).length > 0) {
          setMyRatings(data.myRatings)
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
    }
  }, [completedByMe])

  const rateBloke = useCallback(async (postId, type, baseRatings = {}) => {
    const { nonce, loginUrl, isLoggedIn } = getSiteData()
    const key = String(postId)
    const currentRating = myRatings[key] || null
    const newRating = currentRating === type ? null : type

    // Optimistic: update selection
    setMyRatings(prev => ({ ...prev, [key]: newRating }))

    // Optimistic: update counts
    const optimisticCounts = { ...baseRatings }
    if (currentRating && optimisticCounts[currentRating] !== undefined) {
      optimisticCounts[currentRating] = Math.max(0, (Number(optimisticCounts[currentRating]) || 0) - 1)
    }
    if (newRating) {
      optimisticCounts[newRating] = (Number(optimisticCounts[newRating]) || 0) + 1
    }
    setRatingCountOverrides(prev => ({ ...prev, [postId]: optimisticCounts }))

    // Persist in localStorage (works for everyone, overwritten by server for logged-in)
    const stored = loadLocalRatings()
    if (newRating === null) { delete stored[key] } else { stored[key] = newRating }
    saveLocalRatings(stored)

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (nonce) headers['X-WP-Nonce'] = nonce

      const res = await fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/rate/${postId}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ type, previousType: currentRating }),
      })
      const data = await res.json()
      setMyRatings(prev => ({ ...prev, [key]: data.rating }))
      if (data.ratings) {
        setRatingCountOverrides(prev => ({ ...prev, [postId]: data.ratings }))
      }

      // Sync localStorage with confirmed server rating
      const confirmed = loadLocalRatings()
      if (data.rating === null) { delete confirmed[key] } else { confirmed[key] = data.rating }
      saveLocalRatings(confirmed)
    } catch (e) {
      // Rollback
      setMyRatings(prev => ({ ...prev, [key]: currentRating }))
      setRatingCountOverrides(prev => { const next = { ...prev }; delete next[postId]; return next })
      const rolled = loadLocalRatings()
      if (currentRating === null) { delete rolled[key] } else { rolled[key] = currentRating }
      saveLocalRatings(rolled)
      console.error('Rating failed:', e)
    }
  }, [myRatings])

  return {
    isLoggedIn: siteData.isLoggedIn,
    loginUrl: siteData.loginUrl,
    completedByMe,
    countOverrides,
    toggleCompletion,
    myRatings,
    ratingCountOverrides,
    rateBloke,
  }
}
