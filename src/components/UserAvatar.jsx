import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import * as collection from '@dicebear/collection'
import './UserAvatar.css'

const SIZES = { xs: 20, sm: 32, md: 48, lg: 80 }

const STYLE_MAP = {
  adventurer: collection.adventurer,
  lorelei:    collection.lorelei,
  bottts:     collection.bottts,
  funEmoji:   collection.funEmoji,
  thumbs:     collection.thumbs,
}

export function getAvatarSvg(avatarType, avatarData) {
  if (avatarType !== 'dicebear') return null
  const style = STYLE_MAP[avatarData?.style] || collection.adventurer
  const seed  = avatarData?.seed || 'default'
  try {
    return createAvatar(style, { seed }).toString()
  } catch {
    return null
  }
}

function getInitials(text) {
  if (!text) return '?'
  const words = text.trim().split(/\s+/)
  return words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : text.slice(0, 2).toUpperCase()
}

export default function UserAvatar({
  avatarType   = '',
  avatarData   = {},
  nickname     = '',
  name         = '',
  size         = 'sm',
  isMe         = false,
  showNickname = false,
  nicknameStyle = 'right',
  hideInitials  = false,
  className    = '',
}) {
  const px = SIZES[size] || 32

  const displayLabel = nickname || name

  // Always generate a deterministic avatar from name/nickname as seed fallback
  const svg = useMemo(() => {
    if (avatarType === 'dicebear') {
      return getAvatarSvg('dicebear', {
        style: avatarData?.style || 'adventurer',
        seed:  avatarData?.seed  || displayLabel || 'user',
      })
    }
    // Auto-generate from name for users without explicit avatar
    if (!avatarType && displayLabel && !hideInitials) {
      try {
        return createAvatar(collection.adventurer, { seed: displayLabel }).toString()
      } catch {
        return null
      }
    }
    return null
  }, [avatarType, avatarData, displayLabel, hideInitials])

  const avatarEl = (
    <div
      className={`ua ua--${size}${isMe ? ' ua--me' : ''} ${className}`.trim()}
      style={{ width: px, height: px }}
      aria-label={displayLabel || 'avatar'}
    >
      {avatarType === 'photo' && avatarData?.url ? (
        <img src={avatarData.url} alt={displayLabel || 'avatar'} className="ua__img" />
      ) : svg ? (
        <span className="ua__svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <span className="ua__initials" style={{ fontSize: Math.round(px * 0.38) }}>
          {hideInitials ? '' : getInitials(displayLabel)}
        </span>
      )}
    </div>
  )

  if (!showNickname || !displayLabel) return avatarEl

  return (
    <div className={`ua-wrap ua-wrap--${nicknameStyle}`}>
      {avatarEl}
      <span className={`ua-nick ua-nick--${size}${isMe ? ' ua-nick--me' : ''}`}>
        {nickname ? `@${nickname}` : displayLabel}
      </span>
    </div>
  )
}

// Style previews for the picker — pure SVGs with a given seed
export function AvatarStylePreview({ styleId, seed, size = 44 }) {
  const style = STYLE_MAP[styleId] || collection.adventurer
  const svg = useMemo(() => {
    try { return createAvatar(style, { seed: seed || 'preview' }).toString() }
    catch { return null }
  }, [style, seed])

  if (!svg) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#333' }} />
  return (
    <span
      style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'block' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export { STYLE_MAP }
