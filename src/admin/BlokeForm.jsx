import { useState } from 'react'
import { useWordPressAuth } from '../hooks/useWordPressAuth'
import ImageUploader from './ImageUploader'
import './BlokeForm.css'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

// Category mapping - these should match your WordPress category IDs
const CATEGORIES = [
  { id: 1, name: 'PUZLE', label: 'Puzle' },
  { id: 2, name: 'TECNICO', label: 'Técnico' },
  { id: 3, name: 'ENTRENAMIENTO', label: 'Entrenamiento' },
  { id: 4, name: 'COORDINACION', label: 'Coordinación' },
]

// Color options
const COLORS = [
  { value: 'green', label: 'Verde', color: '#10b981' },
  { value: 'blue', label: 'Azul', color: '#3b82f6' },
  { value: 'yellow', label: 'Amarillo', color: '#f59e0b' },
  { value: 'red', label: 'Rojo', color: '#ef4444' },
]

function ColorToggle({ selectedColor, onColorChange }) {
  return (
    <div className="color-toggle">
      <label className="color-toggle__label">Color del bloke</label>
      <div className="color-toggle__options">
        {COLORS.map((colorOption) => (
          <button
            key={colorOption.value}
            type="button"
            className={`color-toggle__option ${selectedColor === colorOption.value ? 'color-toggle__option--selected' : ''}`}
            onClick={() => onColorChange(colorOption.value)}
            title={colorOption.label}
            aria-label={colorOption.label}
          >
            <span 
              className="color-toggle__circle"
              style={{ backgroundColor: colorOption.color }}
            />
            <span className="color-toggle__label-text">{colorOption.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function BlokeForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [color, setColor] = useState('green') // Default color
  const [uploadedImages, setUploadedImages] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState({ type: '', message: '' })
  
  const { getAuthHeader } = useWordPressAuth()

  const handleImagesUploaded = (images) => {
    setUploadedImages(images)
    setSubmitStatus({ type: 'success', message: `${images.length} imagen(es) subidas correctamente` })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!title.trim()) {
      setSubmitStatus({ type: 'error', message: 'El título es obligatorio' })
      return
    }
    
    if (!description.trim()) {
      setSubmitStatus({ type: 'error', message: 'La descripción es obligatoria' })
      return
    }
    
    if (!categoryId) {
      setSubmitStatus({ type: 'error', message: 'Selecciona una categoría' })
      return
    }
    
    if (uploadedImages.length === 0) {
      setSubmitStatus({ type: 'error', message: 'Sube al menos una imagen' })
      return
    }

    setIsSubmitting(true)
    setSubmitStatus({ type: '', message: '' })

    try {
      // Prepare ACF fields
      const acfFields = {
        bloke_description: description,
        bloke_gallery: uploadedImages.map(img => img.id).slice(1), // All except first (featured image)
        bloke_category: parseInt(categoryId),
        bloke_color: color
      }

      // Prepare post data
      const postData = {
        title: title.slice(0, 20),
        content: description.slice(0, 300),
        status: 'publish',
        categories: [parseInt(categoryId)],
        featured_media: uploadedImages[0]?.id || 0, // First image as featured
        meta: {
          // ACF fields are stored in meta
          ...acfFields
        }
      }

      // Create the post
      const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(postData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al crear el post')
      }

      const createdPost = await response.json()
      
      // Update ACF fields separately (WordPress REST API may need this)
      try {
        const acfResponse = await fetch(`${WORDPRESS_URL}/wp-json/acf/v3/posts/${createdPost.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader()
          },
          body: JSON.stringify({
            fields: acfFields
          })
        })

        if (!acfResponse.ok) {
          console.warn('ACF fields update failed, but post was created')
        }
      } catch (acfError) {
        console.warn('ACF API not available:', acfError)
      }

      setSubmitStatus({ 
        type: 'success', 
        message: `¡Bloke creado exitosamente! ID: ${createdPost.id}` 
      })
      
      // Reset form
      setTitle('')
      setDescription('')
      setCategoryId('')
      setColor('green')
      setUploadedImages([])
      
    } catch (error) {
      console.error('Error creating bloke:', error)
      setSubmitStatus({ 
        type: 'error', 
        message: `Error: ${error.message}` 
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bloke-form">
      <div className="bloke-form__header">
        <h1>Crear nuevo Bloke</h1>
        <p className="bloke-form__subtitle">
          Completa el formulario para agregar un nuevo problema de búlder
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bloke-form__form">
        <div className="bloke-form__section">
          <h2>Información básica</h2>
          
          <div className="bloke-form__field">
            <label htmlFor="title">Título (máx. 20 caracteres)</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={20}
              placeholder="Ej: Salto dinámico"
              required
              disabled={isSubmitting}
            />
            <div className="bloke-form__counter">
              {title.length}/20 caracteres
            </div>
          </div>

          <div className="bloke-form__field">
            <label htmlFor="description">Descripción (máx. 300 caracteres)</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="Describe el problema o movimiento..."
              required
              disabled={isSubmitting}
            />
            <div className="bloke-form__counter">
              {description.length}/300 caracteres
            </div>
          </div>

          <div className="bloke-form__field">
            <label htmlFor="category">Categoría</label>
            <select
              id="category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              disabled={isSubmitting}
            >
              <option value="">Selecciona una categoría</option>
              {CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bloke-form__field">
            <ColorToggle 
              selectedColor={color}
              onColorChange={setColor}
            />
          </div>
        </div>

        <div className="bloke-form__section">
          <h2>Imágenes</h2>
          <ImageUploader 
            onImagesUploaded={handleImagesUploaded}
            maxImages={3}
          />
          
          {uploadedImages.length > 0 && (
            <div className="bloke-form__uploaded-images">
              <h3>Imágenes listas para publicar:</h3>
              <ul>
                {uploadedImages.map((img, index) => (
                  <li key={img.id}>
                    {index === 0 ? '⭐ ' : ''}
                    <a href={img.url} target="_blank" rel="noopener noreferrer">
                      Imagen {index + 1}
                    </a>
                    {index === 0 && ' (imagen destacada)'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {submitStatus.message && (
          <div 
            className={`bloke-form__status bloke-form__status--${submitStatus.type}`}
            role="alert"
          >
            {submitStatus.message}
          </div>
        )}

        <div className="bloke-form__actions">
          <button
            type="submit"
            className="bloke-form__submit"
            disabled={isSubmitting || uploadedImages.length === 0}
          >
            {isSubmitting ? 'Creando...' : 'Crear Bloke'}
          </button>
          
          <button
            type="button"
            className="bloke-form__reset"
            onClick={() => {
              setTitle('')
              setDescription('')
              setCategoryId('')
              setColor('green')
              setSubmitStatus({ type: '', message: '' })
            }}
            disabled={isSubmitting}
          >
            Limpiar formulario
          </button>
        </div>
      </form>
    </div>
  )
}
