import { useState, useCallback, useEffect } from 'react'

const WP_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

function getHeaders(json = false) {
  const nonce = window.blokesSiteData?.nonce || ''
  const h = nonce ? { 'X-WP-Nonce': nonce } : {}
  if (json) h['Content-Type'] = 'application/json'
  return h
}

const LS_KEY = 'blokes_profile_complete'

function lsProfileComplete() {
  try { return localStorage.getItem(LS_KEY) === '1' } catch { return false }
}

export function useProfile() {
  const sd = window.blokesSiteData || {}
  const [profileComplete, setProfileComplete] = useState(
    () => !!(sd.profileComplete || lsProfileComplete())
  )
  const [nickname, setNickname]               = useState(() => sd.userNickname || '')
  const [avatarType, setAvatarType]           = useState(() => sd.userAvatarType || '')
  const [avatarData, setAvatarData]           = useState(() => sd.userAvatarData || {})
  const [saving, setSaving]                   = useState(false)
  const [saveError, setSaveError]             = useState(null)
  const [verified, setVerified]               = useState(profileComplete)

  // Always fetch fresh profile on mount for logged-in users.
  // Fixes: stale blokesSiteData (PHP cache), avatar mismatch after refresh,
  // and users who saved before the localStorage feature was added.
  useEffect(() => {
    if (!sd.isLoggedIn) { setVerified(true); return }
    fetch(`${WP_URL}/wp-json/blokes/v1/profile/me`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          if (data.profileComplete) {
            setProfileComplete(true)
            try { localStorage.setItem(LS_KEY, '1') } catch {}
          }
          if (data.nickname)   setNickname(data.nickname)
          if (data.avatarType) setAvatarType(data.avatarType)
          if (data.avatarData) setAvatarData(data.avatarData)
          // Sync blokesSiteData so ProfileSetupModal reads fresh values
          if (window.blokesSiteData) {
            window.blokesSiteData.profileComplete = !!data.profileComplete
            window.blokesSiteData.userNickname    = data.nickname   || ''
            window.blokesSiteData.userAvatarType  = data.avatarType || ''
            window.blokesSiteData.userAvatarData  = data.avatarData || {}
          }
        }
        setVerified(true)
      })
      .catch(() => setVerified(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = useCallback(async ({ nickname: nick, avatarType: type, avatarData: data }) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${WP_URL}/wp-json/blokes/v1/profile/me`, {
        method: 'POST',
        headers: getHeaders(true),
        body: JSON.stringify({ nickname: nick, avatarType: type, avatarData: data }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSaveError(json.message || 'Error al guardar')
        setSaving(false)
        return false
      }
      setNickname(nick)
      setAvatarType(type)
      setAvatarData(data)
      setProfileComplete(true)
      // Keep blokesSiteData + localStorage in sync so guards read fresh state
      if (window.blokesSiteData) {
        window.blokesSiteData.profileComplete = true
        window.blokesSiteData.userNickname    = nick
        window.blokesSiteData.userAvatarType  = type
        window.blokesSiteData.userAvatarData  = data
      }
      try { localStorage.setItem(LS_KEY, '1') } catch {}
      setSaving(false)
      return true
    } catch {
      setSaveError('Error de conexión')
      setSaving(false)
      return false
    }
  }, [])

  const checkNickname = useCallback(async (value) => {
    if (!value || value.length < 3) return { available: false, reason: 'length' }
    try {
      const res = await fetch(
        `${WP_URL}/wp-json/blokes/v1/profile/check-nickname?value=${encodeURIComponent(value)}`,
        { headers: getHeaders() }
      )
      if (!res.ok) return { available: false }
      return await res.json()
    } catch {
      return { available: false }
    }
  }, [])

  const uploadPhoto = useCallback(async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${WP_URL}/wp-json/blokes/v1/profile/upload-avatar`, {
      method: 'POST',
      headers: getHeaders(),
      body: formData,
    })
    if (!res.ok) throw new Error('Upload failed')
    const { url } = await res.json()
    return url
  }, [])

  return {
    profileComplete,
    verified,
    nickname,
    avatarType,
    avatarData,
    saving,
    saveError,
    saveProfile,
    checkNickname,
    uploadPhoto,
  }
}
