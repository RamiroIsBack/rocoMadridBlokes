import { useState, useEffect } from 'react'
import './ImageGallery.css'

/**
 * Displays 1 image statically, or 2–3 images as a carousel.
 * Clicking opens a lightbox with larger image and navigation.
 *
 * @param {{ images: string[], title: string }} props
 */
export default function ImageGallery({ images, title }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Handle keyboard navigation in lightbox
  useEffect(() => {
    if (!lightboxOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false)
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((i) => (i - 1 + images.length) % images.length)
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((i) => (i + 1) % images.length)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [lightboxOpen, images.length])

  if (!images || images.length === 0) {
    return (
      <div className="gallery gallery--empty" aria-hidden="true">
        <span className="gallery__placeholder">Sin imagen</span>
      </div>
    )
  }

  const goToPrev = (e) => {
    e?.stopPropagation()
    setCurrentIndex((i) => (i - 1 + images.length) % images.length)
  }

  const goToNext = (e) => {
    e?.stopPropagation()
    setCurrentIndex((i) => (i + 1) % images.length)
  }

  const openLightbox = () => {
    if (images.length > 0) {
      setLightboxOpen(true)
    }
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
  }

  if (images.length === 1) {
    return (
      <>
        <div 
          className="gallery gallery--single"
          onClick={openLightbox}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          <img
            src={images[0]}
            alt={`Imagen del problema: ${title}`}
            className="gallery__image"
            loading="lazy"
          />
          <div className="gallery__zoom-hint">
            <span>🔍 Click para ampliar</span>
          </div>
        </div>

        {lightboxOpen && (
          <div 
            className="lightbox" 
            onClick={closeLightbox}
            role="dialog"
            aria-modal="true"
            aria-label={`Imagen ampliada: ${title}`}
          >
            <button 
              className="lightbox__close" 
              onClick={closeLightbox}
              aria-label="Cerrar"
            >
              ×
            </button>
            <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
              <img
                src={images[0]}
                alt={`Imagen del problema: ${title}`}
                className="lightbox__image"
              />
            </div>
          </div>
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
      >
        <div 
          className="gallery__image-container"
          onClick={openLightbox}
        >
          <img
            src={images[currentIndex]}
            alt={`Imagen ${currentIndex + 1} de ${images.length} del problema: ${title}`}
            className="gallery__image"
            loading="lazy"
          />
          <div className="gallery__zoom-hint">
            <span>🔍 Click para ampliar</span>
          </div>
        </div>
        
        <div className="gallery__controls">
          <button
            className="gallery__btn gallery__btn--prev"
            onClick={goToPrev}
            onMouseEnter={() => setIsHovering(true)}
            aria-label="Imagen anterior"
          >
            &#8249;
          </button>
          <span className="gallery__counter">
            {currentIndex + 1} / {images.length}
          </span>
          <button
            className="gallery__btn gallery__btn--next"
            onClick={goToNext}
            onMouseEnter={() => setIsHovering(true)}
            aria-label="Imagen siguiente"
          >
            &#8250;
          </button>
        </div>
      </div>

      {lightboxOpen && (
        <div 
          className="lightbox" 
          onClick={closeLightbox}
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
          
          {images.length > 1 && (
            <>
              <button
                className="lightbox__nav lightbox__nav--prev"
                onClick={goToPrev}
                aria-label="Imagen anterior"
              >
                &#8249;
              </button>
              <button
                className="lightbox__nav lightbox__nav--next"
                onClick={goToNext}
                aria-label="Imagen siguiente"
              >
                &#8250;
              </button>
            </>
          )}
          
          <div className="lightbox__content" onClick={(e) => e.stopPropagation()}>
            <img
              src={images[currentIndex]}
              alt={`Imagen ${currentIndex + 1} de ${images.length}: ${title}`}
              className="lightbox__image"
            />
            {images.length > 1 && (
              <div className="lightbox__counter">
                {currentIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
