import { useState, useEffect, useCallback } from 'react'

const WP_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

function getHeaders() {
  const nonce = window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

export function useLeague() {
  const [myLeague, setMyLeague]       = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [unseen, setUnseen]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const fetchAll = useCallback(async () => {
    if (!window.blokesSiteData?.isLoggedIn) { setLoading(false); return }

    try {
      const headers = getHeaders()
      const leagueRes = await fetch(`${WP_URL}/wp-json/blokes/v1/leagues/me`, { headers })

      if (!leagueRes.ok) {
        if (leagueRes.status !== 404) setError('Error cargando liga')
        setLoading(false)
        return
      }

      setMyLeague(await leagueRes.json())

      const [lbRes, evRes] = await Promise.all([
        fetch(`${WP_URL}/wp-json/blokes/v1/leagues/me/leaderboard`, { headers }),
        fetch(`${WP_URL}/wp-json/blokes/v1/leagues/me/events`,      { headers }),
      ])

      if (lbRes.ok) setLeaderboard((await lbRes.json()).members || [])
      if (evRes.ok) setUnseen((await evRes.json()).unseen || [])
    } catch (e) {
      setError('Error de conexión')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const markSeen = useCallback(async () => {
    await fetch(`${WP_URL}/wp-json/blokes/v1/leagues/me/events/seen`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    })
    setUnseen([])
  }, [])

  return { myLeague, leaderboard, unseen, loading, error, refetch: fetchAll, markSeen }
}

export function useLeaguesList() {
  const [leagues, setLeagues] = useState([])
  useEffect(() => {
    fetch(`${WP_URL}/wp-json/blokes/v1/leagues`)
      .then(r => r.ok ? r.json() : [])
      .then(setLeagues)
      .catch(() => {})
  }, [])
  return leagues
}
