import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ImageGallery.css'

/**
 * Displays 1 image statically, or 2–3 images as a carousel.
 * Clicking opens a lightbox with larger image and navigation.
 * Supports touch swipe for navigation on mobile.
 *
 * @param {{ images: Array<{url: string, isVideo?: boolean} | string>, title: string }} props
 */
export default function ImageGallery({ images, title }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Touch handling refs
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const touchStartY = useRef(0)
  const touchEndY = useRef(0)
  const didSwipe = useRef(false)

  // Normalize images to array of objects with url and isVideo
  const normalizedImages = (images || []).map(img => {
    if (typeof img === 'string') {
      return { url: img, isVideo: false }
    }
    return { url: img.url || img, isVideo: img.isVideo || false }
  })

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [lightboxOpen])

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    if (!lightboxOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false)
        setIsFullscreen(false)
      } else if (e.key === 'ArrowLeft') {
        goToPrev()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [lightboxOpen, normalizedImages.length])

  // Touch handlers for swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX
    touchStartY.current = e.changedTouches[0].screenY
    didSwipe.current = false
  }

  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].screenX
    touchEndY.current = e.changedTouches[0].screenY
    const deltaX = touchEndX.current - touchStartX.current
    const deltaY = touchEndY.current - touchStartY.current
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      didSwipe.current = true
      if (deltaX > 0) goToPrev()
      else goToNext()
    }
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  if (!normalizedImages || normalizedImages.length === 0) {
    return (
      <div className="gallery gallery--empty" aria-hidden="true">
        <span className="gallery__placeholder">Sin imagen</span>
      </div>
    )
  }

  const goToPrev = (e) => {
    e?.stopPropagation()
    setCurrentIndex((i) => (i - 1 + normalizedImages.length) % normalizedImages.length)
  }

  const goToNext = (e) => {
    e?.stopPropagation()
    setCurrentIndex((i) => (i + 1) % normalizedImages.length)
  }

  const openLightbox = () => {
    if (normalizedImages.length > 0) {
      setCurrentIndex(0)
      setLightboxOpen(true)
    }
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
    setIsFullscreen(false)
  }

  const currentMedia = normalizedImages[currentIndex]
  const isCurrentVideo = currentMedia?.isVideo

  if (normalizedImages.length === 1) {
    const singleMedia = normalizedImages[0]
    const isVideo = singleMedia.isVideo
    
    return (
      <>
        <div 
          className="gallery gallery--single"
          onClick={openLightbox}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {isVideo ? (
            <video
              src={singleMedia.url}
              className="gallery__image"
              muted
              playsInline
            />
          ) : (
            <img
              src={singleMedia.url}
              alt={`Imagen del problema: ${title}`}
              className="gallery__image"
              loading="lazy"
            />
          )}
          <div className="gallery__zoom-hint">
            <span>{isVideo ? '▶️ Click para reproducir' : '🔍 Click para ampliar'}</span>
          </div>
        </div>

        {lightboxOpen && createPortal(
          <div
            className={`lightbox ${isFullscreen ? 'lightbox--fullscreen' : ''}`}
            onClick={closeLightbox}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="dialog"
            aria-modal="true"
            aria-label={`${isVideo ? 'Video' : 'Imagen'} ampliada: ${title}`}
          >
            <button
              className="lightbox__close"
              onClick={closeLightbox}
              aria-label="Cerrar"
            >
              ×
            </button>
            <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
              {isVideo ? (
                <video
                  src={singleMedia.url}
                  className="lightbox__media"
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  src={singleMedia.url}
                  alt={`Imagen del problema: ${title}`}
                  className="lightbox__media"
                />
              )}
            </div>
          </div>,
          document.body
        )}
      </>
    )
  }

  return (
    <>
      <div
        className="gallery gallery--carousel"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="gallery__image-container"
          onClick={() => { if (!didSwipe.current) openLightbox() }}
        >
          {isCurrentVideo ? (
            <video
              src={currentMedia.url}
              className="gallery__image"
              muted
              playsInline
            />
          ) : (
            <img
              src={currentMedia.url}
              alt={`Imagen ${currentIndex + 1} de ${normalizedImages.length} del problema: ${title}`}
              className="gallery__image"
              loading="lazy"
            />
          )}
          <div className="gallery__zoom-hint">
            <span>{isCurrentVideo ? '▶️ Click para reproducir' : '🔍 Click para ampliar'}</span>
          </div>
        </div>
        
        <div className="gallery__controls">
          <button
            className="gallery__btn gallery__btn--prev"
            onClick={goToPrev}
            onMouseEnter={() => setIsHovering(true)}
            aria-label="Imagen anterior"
          >
            ‹
          </button>
          <span className="gallery__counter">
            {currentIndex + 1} / {normalizedImages.length}
          </span>
          <button
            className="gallery__btn gallery__btn--next"
            onClick={goToNext}
            onMouseEnter={() => setIsHovering(true)}
            aria-label="Imagen siguiente"
          >
            ›
          </button>
        </div>
      </div>

      {lightboxOpen && createPortal(
        <div
          className={`lightbox ${isFullscreen ? 'lightbox--fullscreen' : ''}`}
          onClick={closeLightbox}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label={`Galería de imágenes: ${title}`}
        >
          <button
            className="lightbox__close"
            onClick={closeLightbox}
            aria-label="Cerrar"
          >
            ×
          </button>

          {normalizedImages.length > 1 && (
            <>
              <button
                className="lightbox__nav lightbox__nav--prev"
                onClick={goToPrev}
                aria-label="Imagen anterior"
              >
                ‹
              </button>
              <button
                className="lightbox__nav lightbox__nav--next"
                onClick={goToNext}
                aria-label="Imagen siguiente"
              >
                ›
              </button>
            </>
          )}

          <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
            {isCurrentVideo ? (
              <video
                src={currentMedia.url}
                className="lightbox__media"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img
                src={currentMedia.url}
                alt={`Imagen ${currentIndex + 1} de ${normalizedImages.length}: ${title}`}
                className="lightbox__media"
              />
            )}
            {normalizedImages.length > 1 && (
              <div className="lightbox__counter">
                {currentIndex + 1} / {normalizedImages.length}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
