import { useState, useCallback, useEffect, useRef } from 'react'
import { createAvatar } from '@dicebear/core'
import * as collection from '@dicebear/collection'
import UserAvatar from './UserAvatar'
import './ProfileSetupModal.css'

const STYLES_META = [
  { id: 'adventurer', label: 'Aventurero' },
  { id: 'lorelei',    label: 'Lorelei'    },
  { id: 'bottts',     label: 'Robot'      },
  { id: 'funEmoji',   label: 'Emoji'      },
  { id: 'thumbs',     label: 'Thumbs'     },
]

const STYLE_MAP = {
  adventurer: collection.adventurer,
  lorelei:    collection.lorelei,
  bottts:     collection.bottts,
  funEmoji:   collection.funEmoji,
  thumbs:     collection.thumbs,
}

function randomSeed() {
  return Math.random().toString(36).slice(2, 10)
}

export default function ProfileSetupModal({
  isOpen,
  isDismissible = true,
  blockingMessage = '',
  onClose,
  onSaved,
  saveProfile,
  checkNickname,
  uploadPhoto,
}) {
  const sd = window.blokesSiteData || {}

  const [nickname,    setNickname]    = useState(sd.userNickname || '')
  const [nickStatus,  setNickStatus]  = useState(sd.userNickname ? 'ok' : 'idle')
  const [avatarMode,  setAvatarMode]  = useState(sd.userAvatarType === 'photo' ? 'photo' : 'dicebear')
  const [style,       setStyle]       = useState(sd.userAvatarData?.style || 'adventurer')
  const [seed,        setSeed]        = useState(sd.userAvatarData?.seed  || randomSeed())
  const [photoUrl,    setPhotoUrl]    = useState(sd.userAvatarType === 'photo' ? (sd.userAvatarData?.url || '') : '')
  const [uploading,   setUploading]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')
  const debounceRef = useRef(null)

  const avatarType = avatarMode === 'photo' ? 'photo' : 'dicebear'
  const avatarData = avatarMode === 'photo'
    ? { url: photoUrl }
    : { style, seed }

  const canSave = (
    nickname.trim().length >= 3 &&
    nickStatus === 'ok' &&
    (avatarMode === 'dicebear' || (avatarMode === 'photo' && photoUrl))
  )

  // Reset form to current saved values when modal opens
  useEffect(() => {
    if (!isOpen) return
    const fresh = window.blokesSiteData || {}
    setNickname(fresh.userNickname || '')
    setNickStatus(fresh.userNickname ? 'ok' : 'idle')
    setAvatarMode(fresh.userAvatarType === 'photo' ? 'photo' : 'dicebear')
    setStyle(fresh.userAvatarData?.style || 'adventurer')
    setSeed(fresh.userAvatarData?.seed   || randomSeed())
    setPhotoUrl(fresh.userAvatarType === 'photo' ? (fresh.userAvatarData?.url || '') : '')
    setFormError('')
  }, [isOpen])

  const handleNicknameChange = useCallback((val) => {
    setNickname(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const clean = val.trim()
    if (!clean) { setNickStatus('idle'); return }
    if (clean.length < 3)  { setNickStatus('short');   return }
    if (clean.length > 20) { setNickStatus('long');    return }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) { setNickStatus('chars'); return }
    setNickStatus('checking')
    debounceRef.current = setTimeout(async () => {
      const result = await checkNickname(clean)
      setNickStatus(result.available ? 'ok' : 'taken')
    }, 500)
  }, [checkNickname])

  const handlePhotoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setFormError('')
    try {
      const url = await uploadPhoto(file)
      setPhotoUrl(url)
    } catch {
      setFormError('Error al subir la foto. Inténtalo de nuevo.')
    }
    setUploading(false)
  }, [uploadPhoto])

  const handleSave = useCallback(async () => {
    if (!canSave || saving) return
    setSaving(true)
    setFormError('')
    const ok = await saveProfile({ nickname: nickname.trim(), avatarType, avatarData })
    setSaving(false)
    if (ok) {
      onSaved?.()
    } else {
      setFormError('No se pudo guardar el perfil. Inténtalo de nuevo.')
    }
  }, [canSave, saving, nickname, avatarType, avatarData, saveProfile, onSaved])

  if (!isOpen) return null

  const nickHint = () => {
    if (nickStatus === 'checking') return <span className="ps-nick-checking">Comprobando...</span>
    if (nickStatus === 'ok')       return <span className="ps-nick-ok">✓ Disponible</span>
    if (nickStatus === 'taken')    return <span className="ps-nick-err">Ya está en uso</span>
    if (nickStatus === 'short')    return <span className="ps-nick-err">Mínimo 3 caracteres</span>
    if (nickStatus === 'long')     return <span className="ps-nick-err">Máximo 20 caracteres</span>
    if (nickStatus === 'chars')    return <span className="ps-nick-err">Solo letras, números y _</span>
    return <span className="ps-nick-meta">3–20 caracteres · letras, números y _</span>
  }

  return (
    <div className="ps-overlay" onClick={isDismissible ? onClose : undefined}>
      <div className="ps-modal" onClick={e => e.stopPropagation()}>
        {isDismissible && (
          <button className="ps-close" onClick={onClose} aria-label="Cerrar">×</button>
        )}

        <h2 className="ps-title">Crea tu perfil</h2>

        {blockingMessage && (
          <p className="ps-blocking-msg">{blockingMessage}</p>
        )}

        {/* Avatar preview */}
        <div className="ps-preview">
          <UserAvatar
            size="lg"
            avatarType={avatarType}
            avatarData={avatarData}
            nickname={nickname.trim()}
            isMe
          />
        </div>

        {/* Mode tabs */}
        <div className="ps-tabs">
          <button
            className={`ps-tab${avatarMode === 'dicebear' ? ' ps-tab--active' : ''}`}
            onClick={() => setAvatarMode('dicebear')}
          >Estilo generado</button>
          <button
            className={`ps-tab${avatarMode === 'photo' ? ' ps-tab--active' : ''}`}
            onClick={() => setAvatarMode('photo')}
          >Foto propia</button>
        </div>

        {avatarMode === 'dicebear' && (
          <div className="ps-styles">
            <div className="ps-styles-grid">
              {STYLES_META.map(s => {
                let svg = null
                try { svg = createAvatar(STYLE_MAP[s.id], { seed }).toString() } catch {}
                return (
                  <button
                    key={s.id}
                    className={`ps-style-btn${style === s.id ? ' ps-style-btn--active' : ''}`}
                    onClick={() => setStyle(s.id)}
                    title={s.label}
                  >
                    {svg
                      ? <span className="ps-style-svg" dangerouslySetInnerHTML={{ __html: svg }} />
                      : <span className="ps-style-svg ps-style-svg--empty" />
                    }
                    <span className="ps-style-label">{s.label}</span>
                  </button>
                )
              })}
            </div>
            <button className="ps-reseed" onClick={() => setSeed(randomSeed())}>
              🔀 Cambiar apariencia
            </button>
          </div>
        )}

        {avatarMode === 'photo' && (
          <div className="ps-photo">
            {photoUrl && (
              <img src={photoUrl} alt="Tu foto" className="ps-photo-preview" />
            )}
            <label className="ps-upload-btn">
              {uploading ? 'Subiendo...' : (photoUrl ? 'Cambiar foto' : 'Subir foto')}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploading}
                hidden
              />
            </label>
          </div>
        )}

        {/* Nickname */}
        <div className="ps-nick-wrap">
          <label className="ps-nick-label">Tu nickname</label>
          <div className={`ps-nick-row${nickStatus === 'ok' ? ' ps-nick-row--ok' : (nickStatus === 'taken' || nickStatus === 'short' || nickStatus === 'long' || nickStatus === 'chars') ? ' ps-nick-row--err' : ''}`}>
            <span className="ps-nick-at">@</span>
            <input
              className="ps-nick-input"
              type="text"
              value={nickname}
              onChange={e => handleNicknameChange(e.target.value)}
              placeholder="mi_nick"
              maxLength={20}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="ps-nick-hint">{nickHint()}</div>
        </div>

        {formError && <p className="ps-error">{formError}</p>}

        <button
          className="ps-save-btn"
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          {saving ? 'Guardando...' : 'Guardar perfil'}
        </button>
      </div>
    </div>
  )
}
