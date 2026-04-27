import { useState } from 'react'
import { useWordPressAuth } from '../hooks/useWordPressAuth'
import ImageUploader from './ImageUploader'
import './BlokeForm.css'

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

// Category mapping - these should match your WordPress category IDs
const CATEGORIES = [
  { id: 1, name: 'FUERZA', label: 'Fuerza' },
  { id: 2, name: 'TECNICA', label: 'Técnica' },
  { id: 3, name: 'DINAMICO', label: 'Dinámico' },
]

// Tipo options (difficulty type)
const TIPOS = [
  { value: 'intro', label: 'INTRO' },
  { value: 'trave', label: 'TRAVE' },
  { value: 'bloke', label: 'BLOKE' },
]

// Grado options (difficulty level)
const GRADOS = [
  { value: 'suave', label: 'Suave' },
  { value: 'medio', label: 'Medio' },
  { value: 'duro', label: 'Duro' },
]

// Color de presas options
const COLOR_PRESAS = [
  { value: 'presas_azules',         label: 'Presas Azules' },
  { value: 'presas_blancas',        label: 'Presas Blancas' },
  { value: 'presas_negras',         label: 'Presas Negras' },
  { value: 'presas_rojas',          label: 'Presas Rojas' },
  { value: 'presas_amarillas',      label: 'Presas Amarillas' },
  { value: 'presas_verdes',         label: 'Presas Verdes' },
  { value: 'presas_moradas',        label: 'Presas Moradas' },
  { value: 'presas_rosas',          label: 'Presas Rosas' },
  { value: 'presas_grises',         label: 'Presas Grises' },
  { value: 'presas_turquesa',       label: 'Presas Turquesa' },
  { value: 'presas_amarillo_fluor', label: 'Presas Amarillo Fluor' },
  { value: 'presas_naranja',        label: 'Presas Naranja' },
  { value: 'presas_color_raro',     label: 'Presas Color Raro' },
]

// All color options
const ALL_COLORS = [
  { value: 'green', label: 'Verde', color: '#10b981' },
  { value: 'blue', label: 'Azul', color: '#3b82f6' },
  { value: 'yellow', label: 'Amarillo', color: '#e8ff17' },
  { value: 'red', label: 'Rojo', color: '#ef4444' },
  { value: 'black', label: 'Negro', color: '#1f2937' },
  { value: 'blanco', label: 'Trave', color: '#ffffff' },
]

// Colors based on tipo
const COLORS_BY_TIPO = {
  intro: [ALL_COLORS[0]], // only green
  trave: [ALL_COLORS[5]], // only blanco
  bloke: ALL_COLORS.slice(0, 5), // all except blanco
}

// Sala options
const SALAS = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'sala_grande', label: 'Sala Grande' },
  { value: 'cueva', label: 'Cueva' },
]

// Subsala options based on sala selection
const SUBSALAS = {
  entrada: [
    { value: '1', label: '1' },
    { value: '2', label: '2' },
  ],
  sala_grande: [
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '5', label: '5' },
    { value: '6', label: '6' },
    { value: '7', label: '7' },
  ],
  cueva: [
    { value: '8', label: '8' },
  ],
}

// Equipador options
const EQUIPADORES = [
  { value: 'alvaro', label: 'Alvaro' },
  { value: 'sigurd', label: 'Sigurd' },
  { value: 'sara', label: 'Sara' },
  { value: 'lucia', label: 'Lucia' },
  { value: 'ana', label: 'Ana' },
  { value: 'javi', label: 'Javi' },
  { value: 'ramiro', label: 'Ramiro' },
  { value: 'invitado', label: 'Invitado' },
]

function ColorToggle({ selectedColor, onColorChange, availableColors = ALL_COLORS }) {
  return (
    <div className="color-toggle">
      <label className="color-toggle__label">Color del bloke</label>
      <div className="color-toggle__options">
        {availableColors.map((colorOption) => (
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
  const [selectedCategories, setSelectedCategories] = useState([])
  const [tipo, setTipo] = useState('bloke') // Default tipo
  const [color, setColor] = useState('green') // Default color
  const [grado, setGrado] = useState('medio') // Default grado
  const [colorPresa, setColorPresa] = useState('') // Color de presa
  const [sala, setSala] = useState('entrada') // Default sala
  const [subsala, setSubsala] = useState('1') // Default subsala
  const [equipador, setEquipador] = useState('alvaro') // Default equipador
  const [uploadedImages, setUploadedImages] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState({ type: '', message: '' })
  
  const { getAuthHeader } = useWordPressAuth()

  // Handle tipo change - reset color based on tipo
  const handleTipoChange = (newTipo) => {
    setTipo(newTipo)
    // Set default color based on tipo
    if (newTipo === 'intro') {
      setColor('green')
    } else if (newTipo === 'trave') {
      setColor('blanco')
    } else if (newTipo === 'bloke') {
      setColor('green')
    }
  }

  // Handle sala change - reset subsala to first option
  const handleSalaChange = (newSala) => {
    setSala(newSala)
    // Set default subsala based on sala
    if (newSala === 'entrada') {
      setSubsala('1')
    } else if (newSala === 'sala_grande') {
      setSubsala('3')
    } else if (newSala === 'cueva') {
      setSubsala('8')
    }
  }

  // Handle category toggle for multi-select
  const handleCategoryToggle = (categoryId) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryId)) {
        return prev.filter(id => id !== categoryId)
      } else {
        return [...prev, categoryId]
      }
    })
  }

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
    
    if (selectedCategories.length === 0) {
      setSubmitStatus({ type: 'error', message: 'Selecciona al menos una categoría' })
      return
    }

    if (!colorPresa) {
      setSubmitStatus({ type: 'error', message: 'Selecciona el color de las presas' })
      return
    }
    
    if (!tipo) {
      setSubmitStatus({ type: 'error', message: 'Selecciona un tipo' })
      return
    }
    
    if (!color) {
      setSubmitStatus({ type: 'error', message: 'Selecciona un color' })
      return
    }
    
    if (!grado) {
      setSubmitStatus({ type: 'error', message: 'Selecciona un grado' })
      return
    }
    
    if (!sala) {
      setSubmitStatus({ type: 'error', message: 'Selecciona una sala' })
      return
    }
    
    if (!subsala) {
      setSubmitStatus({ type: 'error', message: 'Selecciona una subzona' })
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
        bloke_category: selectedCategories.length > 0 ? (CATEGORIES.find(c => c.id === selectedCategories[0])?.name || 'FUERZA') : 'FUERZA',
        bloke_tipo: tipo,
        bloke_color: color,
        bloke_grado: grado,
        bloke_sala: sala,
        bloke_subsala: subsala,
        bloke_equipador: equipador,
        bloke_colorPresa: colorPresa
      }

      // Use custom endpoint to create bloke with ACF fields
      const createData = {
        title: title.slice(0, 35), // Max 35 characters
        categories: selectedCategories.map(id => parseInt(id)),
        content: description.slice(0, 300),
        featured_media: uploadedImages[0]?.id || 0,
        acf: acfFields
      }

      const response = await fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(createData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Error al crear el post')
      }

      const createdPost = await response.json()

      setSubmitStatus({ 
        type: 'success', 
        message: `¡Bloke creado exitosamente! ID: ${createdPost.id}` 
      })
      
      // Reset form
      setTitle('')
      setDescription('')
      setSelectedCategories([])
      setTipo('bloke')
      setColor('green')
      setGrado('medio')
      setSala('entrada')
      setSubsala('1')
      setEquipador('alvaro')
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
          <h2>Zona</h2>
          
          <div className="bloke-form__field">
            <label htmlFor="sala">Sala</label>
            <select
              id="sala"
              value={sala}
              onChange={(e) => handleSalaChange(e.target.value)}
              required
              disabled={isSubmitting}
            >
              {SALAS.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bloke-form__field">
            <label htmlFor="subsala">Subzona</label>
            <select
              id="subsala"
              value={subsala}
              onChange={(e) => setSubsala(e.target.value)}
              required
              disabled={isSubmitting}
            >
              {SUBSALAS[sala]?.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bloke-form__section">
          <h2>Dificultad</h2>
          
          <div className="bloke-form__field">
            <label htmlFor="tipo">Tipo</label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => handleTipoChange(e.target.value)}
              required
              disabled={isSubmitting}
            >
              {TIPOS.map(t => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bloke-form__field">
            <ColorToggle 
              selectedColor={color}
              onColorChange={setColor}
              availableColors={COLORS_BY_TIPO[tipo] || ALL_COLORS}
            />
          </div>

          <div className="bloke-form__field">
            <label htmlFor="grado">Grado</label>
            <select
              id="grado"
              value={grado}
              onChange={(e) => setGrado(e.target.value)}
              required
              disabled={isSubmitting}
            >
              {GRADOS.map(g => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bloke-form__field">
            <label htmlFor="colorPresa">Color de Presas</label>
            <select
              id="colorPresa"
              value={colorPresa}
              onChange={(e) => setColorPresa(e.target.value)}
              required
              disabled={isSubmitting}
            >
              <option value="">Selecciona un color</option>
              {COLOR_PRESAS.map(cp => (
                <option key={cp.value} value={cp.value}>
                  {cp.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bloke-form__section">
          <h2>Información básica</h2>
          
          <div className="bloke-form__field">
            <label htmlFor="equipador">Equipador</label>
            <select
              id="equipador"
              value={equipador}
              onChange={(e) => setEquipador(e.target.value)}
              required
              disabled={isSubmitting}
            >
              {EQUIPADORES.map(e => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bloke-form__field">
            <label htmlFor="title">Título (máx. 35 caracteres)</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={35}
              placeholder="Ej: Salto dinámico"
              required
              disabled={isSubmitting}
            />
            <div className="bloke-form__counter">
              {title.length}/35 caracteres
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
            <label>Categoría (selecciona una o más)</label>
            <div className="category-radio-group">
              {CATEGORIES.map(cat => (
                <label key={cat.id} className="category-radio">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat.id)}
                    onChange={() => handleCategoryToggle(cat.id)}
                    disabled={isSubmitting}
                    value={cat.id}
                  />
                  <span className="category-radio__label">{cat.label}</span>
                </label>
              ))}
            </div>
            {selectedCategories.length === 0 && (
              <span className="bloke-form__hint">Selecciona al menos una categoría</span>
            )}
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
              setSelectedCategories([])
              setColor('green')
              setSala('entrada')
              setSubsala('1')
              setEquipador('alvaro')
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
