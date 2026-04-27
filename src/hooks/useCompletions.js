import { useState, useCallback, useEffect } from 'react'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

function getSiteData() {
  return window.blokesSiteData || { isLoggedIn: false, nonce: null, loginUrl: '/wp-login.php' }
}

export function useCompletions() {
  const siteData = getSiteData()
  const [completedByMe, setCompletedByMe] = useState(new Set())
  const [countOverrides, setCountOverrides] = useState({})

  useEffect(() => {
    if (!siteData.isLoggedIn || !siteData.nonce) return

    fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/my-completions`, {
      credentials: 'include',
      headers: { 'X-WP-Nonce': siteData.nonce },
    })
      .then(r => r.json())
      .then(data => setCompletedByMe(new Set((data.myIds || []).map(Number))))
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
      // Rollback on error
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

  return {
    isLoggedIn: siteData.isLoggedIn,
    loginUrl: siteData.loginUrl,
    completedByMe,
    countOverrides,
    toggleCompletion,
  }
}
