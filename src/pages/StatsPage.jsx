import { useState, useMemo, useEffect } from 'react'
import { useWordPressPosts, deleteBloke, getAuthHeader } from '../hooks/useWordPressPosts'
import AdminLogin from '../admin/AdminLogin'
import ImageUploader from '../admin/ImageUploader'
import EventCard from '../components/EventCard'
import './StatsPage.css'

// Session storage key for simple password auth
const SESSION_KEY = 'blokes_auth'
const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'

const COLOR_PRESA_LABELS = {
  presas_azules:         'Azules',
  presas_blancas:        'Blancas',
  presas_negras:         'Negras',
  presas_rojas:          'Rojas',
  presas_amarillas:      'Amarillas',
  presas_verdes:         'Verdes',
  presas_moradas:        'Moradas',
  presas_rosas:          'Rosas',
  presas_grises:         'Grises',
  presas_turquesa:       'Turquesa',
  presas_amarillo_fluor: 'Amarillo Fluor',
  presas_naranja:        'Naranja',
  presas_color_raro:     'Color Raro',
}

export default function StatsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check localStorage on initial load
    return !!localStorage.getItem(SESSION_KEY)
  })
  const { cards, loading, error, refresh } = useWordPressPosts()
  const [filters, setFilters] = useState({
    category: '',
    color: '',
    sala: '',
    tipo: '',
    grado: '',
    equipador: '',
    colorPresa: '',
    sortBy: 'timestamp',
    sortOrder: 'desc'
  })
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editingBloke, setEditingBloke] = useState(null)
  const [previewBloke, setPreviewBloke] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showMoreColumns, setShowMoreColumns] = useState(false)
  const [hallOfFame, setHallOfFame] = useState([])
  const [showHallOfFame, setShowHallOfFame] = useState(false)
  const [showMonthly, setShowMonthly] = useState(false)
  const [showColorRating, setShowColorRating] = useState(false)

  // Fetch stored HoF on load
  useEffect(() => {
    fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/hall-of-fame`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setHallOfFame(data) })
      .catch(() => {})
  }, [])

  // Auto-update HoF when cards change.
  // Rules:
  //   - HoF members NEVER leave because they were deleted — only if a new bloke beats them.
  //   - Update interaction counts for members that still exist.
  //   - A new bloke enters only if HoF has < 10 slots OR it outscores the current lowest.
  useEffect(() => {
    if (!cards.length) return
    setHallOfFame(prev => {
      // 1. Update scores for existing HoF members that are still active
      let updated = prev.map(hofBloke => {
        const live = cards.find(c => c.postId === hofBloke.postId)
        if (live && (live.totalInteractions || 0) > (hofBloke.totalInteractions || 0)) {
          return { ...hofBloke, totalInteractions: live.totalInteractions }
        }
        return hofBloke
      })

      // 2. Try to add active blokes not yet in HoF
      const hofIds = new Set(updated.map(b => b.postId))
      const candidates = [...cards]
        .filter(c => !hofIds.has(c.postId))
        .sort((a, b) => (b.totalInteractions || 0) - (a.totalInteractions || 0))

      for (const bloke of candidates) {
        updated.sort((a, b) => (b.totalInteractions || 0) - (a.totalInteractions || 0))
        if (updated.length < 10) {
          updated.push({ ...bloke })
          hofIds.add(bloke.postId)
        } else {
          const lowest = updated[updated.length - 1]
          if ((bloke.totalInteractions || 0) > (lowest.totalInteractions || 0)) {
            updated[updated.length - 1] = { ...bloke }
            hofIds.add(bloke.postId)
          }
        }
      }

      updated.sort((a, b) => (b.totalInteractions || 0) - (a.totalInteractions || 0))

      // 3. Save to WP only if something changed
      const prevStr = prev.map(b => b.postId + ':' + (b.totalInteractions || 0)).join(',')
      const newStr  = updated.map(b => b.postId + ':' + (b.totalInteractions || 0)).join(',')
      if (prevStr !== newStr) {
        fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/hall-of-fame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': getAuthHeader() },
          body: JSON.stringify({ blokes: updated })
        }).catch(() => {})
      }
      return updated
    })
  }, [cards])

  // Calculate stats from cards data - must be called unconditionally
  const stats = useMemo(() => {
    const colorDistribution = { green: 0, blue: 0, yellow: 0, red: 0, black: 0, blanco: 0 }
    const categoryDistribution = { FUERZA: 0, TECNICA: 0, DINAMICO: 0 }
    const interactions = { star_1: 0, star_2: 0, star_3: 0, skull: 0 }
    const equipadorDistribution = {}
    let totalIntro = 0
    let totalTrave = 0
    
    cards.forEach(card => {
      // Color distribution
      if (colorDistribution[card.color] !== undefined) {
        colorDistribution[card.color]++
      }
      
      // Category distribution
      if (categoryDistribution[card.category] !== undefined) {
        categoryDistribution[card.category]++
      }
      
      // Tipo distribution (INTRO and TRAVE)
      const tipo = card.tipo || 'bloke'
      const color = card.color || 'green'
      if (tipo === 'intro') {
        totalIntro++
      } else if (tipo === 'trave' || color === 'blanco') {
        totalTrave++
      }
      
      // Equipador distribution
      const equipador = card.equipador || 'alvaro'
      equipadorDistribution[equipador] = (equipadorDistribution[equipador] || 0) + 1
      
      // Interactions - convert to numbers to avoid string concatenation
      if (card.interactions) {
        interactions.star_1 += Number(card.interactions.star_1) || 0
        interactions.star_2 += Number(card.interactions.star_2) || 0
        interactions.star_3 += Number(card.interactions.star_3) || 0
        interactions.skull += Number(card.interactions.skull) || 0
      }
    })
    
    return {
      totalBlokes: cards.length,
      totalIntro,
      totalTrave,
      colorDistribution,
      categoryDistribution,
      interactions,
      equipadorDistribution,
      blokes: cards
    }
  }, [cards])
  
  // Filter and sort blokes
  const filteredBlokes = useMemo(() => {
    let result = [...cards]
    
    // Apply filters
    if (filters.category) {
      result = result.filter(card => card.category === filters.category)
    }
    if (filters.color) {
      result = result.filter(card => card.color === filters.color)
    }
    if (filters.sala) {
      result = result.filter(card => (card.sala || 'entrada') === filters.sala)
    }
    if (filters.tipo) {
      result = result.filter(card => (card.tipo || 'bloke') === filters.tipo)
    }
    if (filters.grado) {
      result = result.filter(card => (card.grado || 'medio') === filters.grado)
    }
    if (filters.equipador) {
      result = result.filter(card => (card.equipador || 'alvaro') === filters.equipador)
    }
    if (filters.colorPresa) {
      result = result.filter(card => (card.colorPresa || '') === filters.colorPresa)
    }
    
    // Sort
    result.sort((a, b) => {
      let aVal, bVal
      if (filters.sortBy === 'timestamp') {
        aVal = new Date(a.timestamp || 0).getTime()
        bVal = new Date(b.timestamp || 0).getTime()
      } else if (filters.sortBy === 'totalInteractions') {
        aVal = a.totalInteractions || 0
        bVal = b.totalInteractions || 0
      } else if (filters.sortBy === 'title') {
        aVal = a.title || ''
        bVal = b.title || ''
        return filters.sortOrder === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      } else if (filters.sortBy === 'star_1') {
        aVal = a.interactions?.star_1 || 0
        bVal = b.interactions?.star_1 || 0
      } else if (filters.sortBy === 'star_2') {
        aVal = a.interactions?.star_2 || 0
        bVal = b.interactions?.star_2 || 0
      } else if (filters.sortBy === 'star_3') {
        aVal = a.interactions?.star_3 || 0
        bVal = b.interactions?.star_3 || 0
      } else if (filters.sortBy === 'skull') {
        aVal = a.interactions?.skull || 0
        bVal = b.interactions?.skull || 0
      }
      
      if (typeof aVal === 'number') {
        return filters.sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
    
    return result
  }, [cards, filters])

  // IDs de blokes activos que están en el HoF
  const hofPostIds = useMemo(() => new Set(hallOfFame.map(b => b.postId)), [hallOfFame])

  // Stats mensuales: blokes por mes y color
  const monthlyStats = useMemo(() => {
    const map = {}
    cards.forEach(card => {
      if (!card.timestamp) return
      const d = new Date(card.timestamp)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map[key]) map[key] = { total: 0, green: 0, blue: 0, yellow: 0, red: 0, black: 0, blanco: 0 }
      map[key].total++
      if (map[key][card.color] !== undefined) map[key][card.color]++
    })
    const months = Object.keys(map).sort()
    const avg = months.length ? (cards.length / months.length).toFixed(1) : 0
    return { months, map, avg }
  }, [cards])

  // Colores más valorados: media de totalInteractions por color
  const colorRating = useMemo(() => {
    const acc = {}
    cards.forEach(card => {
      const c = card.color || 'green'
      if (!acc[c]) acc[c] = { total: 0, count: 0 }
      acc[c].total += card.totalInteractions || 0
      acc[c].count++
    })
    const labels = { green: 'Verde', blue: 'Azul', yellow: 'Amarillo', red: 'Rojo', black: 'Negro', blanco: 'Trave' }
    return Object.entries(acc)
      .map(([key, v]) => ({ key, label: labels[key] || key, avg: v.count ? (v.total / v.count) : 0, count: v.count }))
      .sort((a, b) => b.avg - a.avg)
  }, [cards])

  // --- Early returns AFTER all hooks ---

  if (loading) {
    return (
      <div className="stats-page stats-page--loading">
        <div className="stats-page__loading-spinner"></div>
        <p>Cargando estadísticas...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stats-page stats-page--error">
        <p className="stats-page__error">Error: {error}</p>
      </div>
    )
  }

  // Show login if not authenticated - AFTER all hooks and data is loaded
  if (!isAuthenticated) {
    return <AdminLogin
      mode="stats"
      onLogin={() => {
        localStorage.setItem(SESSION_KEY, 'true')
        setIsAuthenticated(true)
      }}
    />
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const resetFilters = () => {
    setFilters({
      category: '',
      color: '',
      sala: '',
      tipo: '',
      grado: '',
      equipador: '',
      colorPresa: '',
      sortBy: 'timestamp',
      sortOrder: 'desc'
    })
  }

  // Handle delete confirmation
  const handleDeleteClick = (card) => {
    setDeleteConfirm({ postId: card.postId, title: card.title })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    
    setIsDeleting(true)
    try {
      await deleteBloke(deleteConfirm.postId)
      setDeleteConfirm(null)
      // Refresh the list
      if (refresh) refresh()
    } catch (err) {
      alert('Error al eliminar el bloke: ' + err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirm(null)
  }

  // Handle edit button click
  const handleEditClick = (card) => {
    setEditingBloke({
      postId: card.postId,
      title: card.title,
      description: card.description,
      color: card.color,
      sala: card.sala,
      subsala: card.subsala,
      tipo: card.tipo,
      grado: card.grado,
      category: card.category,
      colorPresa: card.colorPresa || '',
      equipador: card.equipador || 'alvaro',
      images: card.images || []
    })
  }

  const removeEditImage = (idx) => {
    setEditingBloke(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx)
    }))
  }

  const handleEditCancel = () => {
    setEditingBloke(null)
  }

  const handleEditSave = async () => {
    if (!editingBloke) return

    setIsDeleting(true) // Reuse loading state
    try {
      // Use custom endpoint for update to handle ACF fields properly
      const imgs = editingBloke.images || []
      const response = await fetch(`${import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'}/wp-json/blokes/v1/update-acf/${editingBloke.postId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader()
        },
        body: JSON.stringify({
          title: editingBloke.title,
          content: editingBloke.description,
          featured_media: imgs[0]?.id || null,
          acf: {
            bloke_color: editingBloke.color,
            bloke_sala: editingBloke.sala,
            bloke_subsala: editingBloke.subsala,
            bloke_tipo: editingBloke.tipo,
            bloke_grado: editingBloke.grado,
            bloke_colorPresa: editingBloke.colorPresa,
            bloke_category: editingBloke.category,
            bloke_equipador: editingBloke.equipador,
            bloke_gallery: imgs.slice(1).map(img => img.id).filter(Boolean)
          }
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Error al actualizar el bloke')
      }
      
      setEditingBloke(null)
      if (refresh) refresh()
    } catch (err) {
      alert('Error al actualizar el bloke: ' + err.message)
    } finally {
      setIsDeleting(false)
    }
  }
  
  return (
    <div className="stats-page">
      <div className="stats-page__header">
        <h1>Estadísticas</h1>
        <p className="stats-page__subtitle">
          {stats.totalBlokes} blokes · {stats.interactions.star_1 + stats.interactions.star_2 + stats.interactions.star_3 + stats.interactions.skull} interacciones
        </p>
      </div>
      
      <div className="stats-page__content">
        {/* Summary Cards */}
        <div className="stats-page__summary">
          <div className="stats-summary__card">
            <h3>Total Blokes</h3>
            <div className="stats-summary__value">{stats.totalBlokes}</div>
            <div className="stats-summary__intro-trave">
              <span className="stats-summary__intro">INTRO: {stats.totalIntro}</span>
              <span className="stats-summary__trave">TRAVE: {stats.totalTrave}</span>
            </div>
          </div>
          
          <div className="stats-summary__card stats-summary__card--chart">
            <h3>Blokes por Equipador</h3>
            <div className="stats-summary__equipador-chart">
              {(() => {
                const equipadorData = Object.entries(stats.equipadorDistribution).map(([key, value]) => ({
                  key,
                  label: key.substring(0, 2).toUpperCase(),
                  fullName: key.charAt(0).toUpperCase() + key.slice(1),
                  value
                }))
                const maxValue = Math.max(...equipadorData.map(e => e.value), 1)
                
                return equipadorData.length > 0 ? (
                  <div className="stats-summary__bars">
                    {equipadorData.map(item => (
                      <div key={item.key} className="stats-summary__bar-container" title={`${item.fullName}: ${item.value} blokes`}>
                        <div className="stats-summary__bar-value">{item.value}</div>
                        <div className="stats-summary__bar" style={{ height: `${(item.value / maxValue) * 100}%` }}></div>
                        <div className="stats-summary__bar-label">{item.label}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="stats-summary__empty">No hay datos</p>
                )
              })()}
            </div>
          </div>
          
          <div className="stats-summary__card">
            <h3>Distribución por Color</h3>
            <div className="stats-summary__colors">
              {(() => {
                const colorData = [
                  { key: 'green', label: 'Verde', value: stats.colorDistribution.green },
                  { key: 'blue', label: 'Azul', value: stats.colorDistribution.blue },
                  { key: 'yellow', label: 'Amarillo', value: stats.colorDistribution.yellow },
                  { key: 'red', label: 'Rojo', value: stats.colorDistribution.red },
                  { key: 'black', label: 'Negro', value: stats.colorDistribution.black },
                  { key: 'blanco', label: 'Trave', value: stats.colorDistribution.blanco },
                ]
                const maxValue = Math.max(...colorData.map(c => c.value), 1)
                
                return colorData.map(color => (
                  <div key={color.key} className="stats-summary__color-bar">
                    <span className="stats-summary__color-bar-label">{color.label}</span>
                    <div className="stats-summary__color-bar-track">
                      <div 
                        className={`stats-summary__color-bar-fill stats-summary__color-bar-fill--${color.key}`}
                        style={{ width: `${(color.value / maxValue) * 100}%` }}
                      />
                    </div>
                    <span className="stats-summary__color-bar-value">{color.value}</span>
                  </div>
                ))
              })()}
            </div>
          </div>
          
          <div className="stats-summary__card">
            <h3>Interacciones</h3>
            <div className="stats-summary__interactions">
              <div className="stats-summary__interaction">
                <span>⭐ Buen bloke:</span>
                <span>{stats.interactions.star_1}</span>
              </div>
              <div className="stats-summary__interaction">
                <span>⭐⭐ Muy buen bloke:</span>
                <span>{stats.interactions.star_2}</span>
              </div>
              <div className="stats-summary__interaction">
                <span>⭐⭐⭐ Blokazo:</span>
                <span>{stats.interactions.star_3}</span>
              </div>
              <div className="stats-summary__interaction">
                <span>💀 Amor-odio:</span>
                <span>{stats.interactions.skull}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Filters */}
        <div className="stats-page__filters">
          <h2>Filtrar Blokes</h2>
          <div className="stats-filters">
            <div className="stats-filters__row">
              <div className="stats-filters__field">
                <label>Categoría</label>
                <select 
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="FUERZA">Fuerza</option>
                  <option value="TECNICA">Técnica</option>
                  <option value="DINAMICO">Dinámico</option>
                </select>
              </div>
              
              <div className="stats-filters__field">
                <label>Sala</label>
                <select 
                  value={filters.sala}
                  onChange={(e) => handleFilterChange('sala', e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="entrada">Entrada</option>
                  <option value="sala_grande">Sala Grande</option>
                  <option value="cueva">Cueva</option>
                </select>
              </div>
              
              <div className="stats-filters__field">
                <label>Equipador</label>
                <select 
                  value={filters.equipador}
                  onChange={(e) => handleFilterChange('equipador', e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="alvaro">Alvaro</option>
                  <option value="sigurd">Sigurd</option>
                  <option value="sara">Sara</option>
                  <option value="lucia">Lucia</option>
                  <option value="ana">Ana</option>
                  <option value="javi">Javi</option>
                  <option value="ramiro">Ramiro</option>
                  <option value="invitado">Invitado</option>
                </select>
              </div>
              
              <div className="stats-filters__field">
                <label>Color</label>
                <select 
                  value={filters.color}
                  onChange={(e) => handleFilterChange('color', e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="green">Verde</option>
                  <option value="blue">Azul</option>
                  <option value="yellow">Amarillo</option>
                  <option value="red">Rojo</option>
                  <option value="black">Negro</option>
                  <option value="blanco">Trave</option>
                </select>
              </div>

              <div className="stats-filters__field">
                <label>Color Presas</label>
                <select 
                  value={filters.colorPresa || ''}
                  onChange={(e) => handleFilterChange('colorPresa', e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="presas_azules">Presas Azules</option>
                  <option value="presas_blancas">Presas Blancas</option>
                  <option value="presas_negras">Presas Negras</option>
                  <option value="presas_rojas">Presas Rojas</option>
                  <option value="presas_amarillas">Presas Amarillas</option>
                  <option value="presas_verdes">Presas Verdes</option>
                  <option value="presas_moradas">Presas Moradas</option>
                  <option value="presas_rosas">Presas Rosas</option>
                  <option value="presas_grises">Presas Grises</option>
                  <option value="presas_turquesa">Presas Turquesa</option>
                  <option value="presas_amarillo_fluor">Presas Amarillo Fluor</option>
                  <option value="presas_naranja">Presas Naranja</option>
                  <option value="presas_color_raro">Presas Color Raro</option>
                </select>
              </div>
              
              {showMoreFilters && (
                <>
                  <div className="stats-filters__field">
                    <label>Tipo</label>
                    <select
                      value={filters.tipo}
                      onChange={(e) => handleFilterChange('tipo', e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="intro">INTRO</option>
                      <option value="trave">TRAVE</option>
                      <option value="bloke">BLOKE</option>
                    </select>
                  </div>
                  <div className="stats-filters__field">
                    <label>Grado</label>
                    <select
                      value={filters.grado}
                      onChange={(e) => handleFilterChange('grado', e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="suave">Suave</option>
                      <option value="medio">Medio</option>
                      <option value="duro">Duro</option>
                    </select>
                  </div>
                  <div className="stats-filters__field">
                    <label>Ordenar por</label>
                    <select
                      value={filters.sortBy}
                      onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                    >
                      <option value="totalInteractions">Total Interacciones</option>
                      <option value="star_1">⭐</option>
                      <option value="star_2">⭐⭐</option>
                      <option value="star_3">⭐⭐⭐</option>
                      <option value="skull">💀</option>
                      <option value="title">Título</option>
                    </select>
                  </div>
                  <div className="stats-filters__field">
                    <label>Orden</label>
                    <select
                      value={filters.sortOrder}
                      onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                    >
                      <option value="desc">Mayor a menor</option>
                      <option value="asc">Menor a mayor</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="stats-filters__actions">
              <button className="stats-filters__toggle" onClick={() => setShowMoreFilters(v => !v)}>
                {showMoreFilters ? 'Ver menos filtros ▲' : 'Ver más filtros ▼'}
              </button>
              <button className="stats-filters__reset" onClick={resetFilters}>
                Restablecer filtros
              </button>
            </div>
          </div>
        </div>
        
        {/* Table */}
        <div className="stats-page__table">
          <div className="stats-table__header">
            <h2>Blokes ({filteredBlokes.length})</h2>
            <button className="stats-filters__toggle" onClick={() => setShowMoreColumns(v => !v)}>
              {showMoreColumns ? 'Ver menos columnas ▲' : 'Ver más columnas ▼'}
            </button>
          </div>
          {filteredBlokes.length === 0 ? (
            <p>No hay blokes que coincidan con los filtros.</p>
          ) : (
            <div className="stats-table__scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Acciones</th>
                  <th title="Nombre del bloke">Título</th>
                  <th title="Equipador">Equipador</th>
                  <th title="Sala">Sala</th>
                  <th title="Subzona">Subsala</th>
                  <th title="Tipo">Tipo</th>
                  <th title="Color asignado">Color</th>
                  <th title="Color de presas">Color Presas</th>
                  {showMoreColumns && (
                    <>
                      <th title="Categoría del problema">Categoría</th>
                      <th title="Grado">Grado</th>
                      <th title="Buen bloke">⭐</th>
                      <th title="Muy buen bloke">⭐⭐</th>
                      <th title="Blokazo">⭐⭐⭐</th>
                      <th title="Amor-odio">💀</th>
                      <th title="Total de interacciones">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredBlokes.map(card => {
                  const isOld = card.timestamp && (Date.now() - new Date(card.timestamp).getTime()) > 90 * 24 * 60 * 60 * 1000
                  return (
                  <tr key={card.id} className={isOld ? 'stats-table__row--old' : ''}>
                    <td>
                      <button
                        className="stats-table__edit-btn"
                        onClick={() => handleEditClick(card)}
                        title="Editar bloke"
                      >
                        ✏️
                      </button>
                      <button
                        className="stats-table__delete-btn"
                        onClick={() => handleDeleteClick(card)}
                        title="Eliminar bloke"
                      >
                        🗑️
                      </button>
                    </td>
                    <td>
                      <button className="stats-table__preview-btn" onClick={() => setPreviewBloke(card)}>
                        {card.title}
                      </button>
                      {card.timestamp && (
                        <div className="stats-table__date">
                          {new Date(card.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </div>
                      )}
                    </td>
                    <td>{card.equipador || 'alvaro'}</td>
                    <td>{card.sala || 'entrada'}</td>
                    <td>{card.subsala || '1'}</td>
                    <td>{(card.tipo || 'bloke').toUpperCase()}</td>
                    <td>
                      <span className={`event-card__color event-card__color--${card.color}`}></span>
                    </td>
                    <td>{COLOR_PRESA_LABELS[card.colorPresa] || (card.colorPresa ? card.colorPresa : '-')}</td>
                    {showMoreColumns && (
                      <>
                        <td>{card.category}</td>
                        <td>{(card.grado || 'medio').charAt(0).toUpperCase() + (card.grado || 'medio').slice(1)}</td>
                        <td>{Number(card.interactions?.star_1) || 0}</td>
                        <td>{Number(card.interactions?.star_2) || 0}</td>
                        <td>{Number(card.interactions?.star_3) || 0}</td>
                        <td>{Number(card.interactions?.skull) || 0}</td>
                        <td><strong>{Number(card.totalInteractions) || 0}</strong></td>
                      </>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Hall of Fame */}
        <div className="stats-hof">
          <div className="stats-hof__header">
            <h2 className="stats-hof__title">🏆 Hall of Fame</h2>
            <button className="stats-filters__toggle" onClick={() => setShowHallOfFame(v => !v)}>
              {showHallOfFame ? 'Cerrar ▲' : 'Ver los 10 mejores de la historia ▼'}
            </button>
          </div>
          {showHallOfFame && (
            <div className="stats-hof__list">
              {hallOfFame.length === 0 ? (
                <p className="stats-hof__empty">Aún no hay datos. Los blokes más valorados aparecerán aquí automáticamente.</p>
              ) : (
                hallOfFame.map((bloke, idx) => {
                  const liveCard = cards.find(c => c.postId === bloke.postId) || null
                  return (
                    <div key={bloke.postId} className={`stats-hof__row ${!hofPostIds.has(bloke.postId) ? 'stats-hof__row--deleted' : ''}`}>
                      <span className="stats-hof__rank">#{idx + 1}</span>
                      <div className="stats-hof__name-wrap">
                        <button
                          className="stats-hof__name-btn"
                          onClick={() => liveCard && setPreviewBloke(liveCard)}
                          disabled={!liveCard}
                          title={liveCard ? 'Ver bloke' : 'Bloke eliminado'}
                        >
                          {bloke.title}
                        </button>
                        {bloke.timestamp && (
                          <span className="stats-hof__date">
                            {new Date(bloke.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <span className={`stats-hof__color-dot event-card__color event-card__color--${bloke.color}`}></span>
                      <span className="stats-hof__score">⭐ {bloke.totalInteractions || 0}</span>
                      {!hofPostIds.has(bloke.postId) && <span className="stats-hof__deleted-tag">eliminado</span>}
                      <span className="stats-hof__badge">HALL OF FAME</span>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Blokes por mes */}
        <div className="stats-monthly">
          <div className="stats-monthly__header">
            <h2>Blokes por mes</h2>
            <button className="stats-filters__toggle" onClick={() => setShowMonthly(v => !v)}>
              {showMonthly ? 'Cerrar ▲' : 'Ver histórico mensual ▼'}
            </button>
          </div>
          {showMonthly && (
            <>
              <p className="stats-monthly__avg">Media mensual: <strong>{monthlyStats.avg} blokes</strong></p>
              <div className="stats-monthly__scroll">
                <table className="stats-monthly__table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Total</th>
                      <th title="Verde">🟢</th>
                      <th title="Azul">🔵</th>
                      <th title="Amarillo">🟡</th>
                      <th title="Rojo">🔴</th>
                      <th title="Negro">⚫</th>
                      <th title="Trave">⬜</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.months.map(month => {
                      const d = monthlyStats.map[month]
                      return (
                        <tr key={month}>
                          <td>{month}</td>
                          <td><strong>{d.total}</strong></td>
                          <td>{d.green || 0}</td>
                          <td>{d.blue || 0}</td>
                          <td>{d.yellow || 0}</td>
                          <td>{d.red || 0}</td>
                          <td>{d.black || 0}</td>
                          <td>{d.blanco || 0}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Colores más valorados */}
        <div className="stats-color-rating">
          <div className="stats-color-rating__header">
            <h2>Colores más valorados</h2>
            <button className="stats-filters__toggle" onClick={() => setShowColorRating(v => !v)}>
              {showColorRating ? 'Cerrar ▲' : 'Ver ranking de colores ▼'}
            </button>
          </div>
          {showColorRating && (
            <div className="stats-color-rating__list">
              {colorRating.map((item, idx) => (
                <div key={item.key} className="stats-color-rating__row">
                  <span className="stats-color-rating__rank">#{idx + 1}</span>
                  <span className={`stats-color-rating__dot event-card__color event-card__color--${item.key}`}></span>
                  <span className="stats-color-rating__label">{item.label}</span>
                  <div className="stats-color-rating__bar-wrap">
                    <div
                      className="stats-color-rating__bar"
                      style={{ width: `${colorRating[0].avg > 0 ? (item.avg / colorRating[0].avg) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="stats-color-rating__avg">{item.avg.toFixed(1)} pts/bloke</span>
                  <span className="stats-color-rating__count">({item.count} blokes)</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Preview Modal */}
      {previewBloke && (
        <div className="stats-modal-overlay" onClick={() => setPreviewBloke(null)}>
          <div className="stats-modal stats-modal--preview" onClick={(e) => e.stopPropagation()}>
            <div className="stats-modal__preview-header">
              <h3>Vista previa</h3>
              <button className="stats-modal__preview-close" onClick={() => setPreviewBloke(null)}>×</button>
            </div>
            <div className="stats-modal__preview-card">
              <EventCard card={previewBloke} />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="stats-modal-overlay" onClick={handleDeleteCancel}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmar eliminación</h3>
            <p>¿Estás seguro de que quieres eliminar el bloke <strong>"{deleteConfirm.title}"</strong>?</p>
            <p className="stats-modal__warning">Esta acción eliminará también las imágenes asociadas y no se puede deshacer.</p>
            <div className="stats-modal__actions">
              <button 
                className="stats-modal__cancel"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button 
                className="stats-modal__confirm"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Bloke Modal */}
      {editingBloke && (
        <div className="stats-modal-overlay" onClick={handleEditCancel}>
          <div className="stats-modal stats-modal--edit" onClick={(e) => e.stopPropagation()}>
            <h3>Editar bloke</h3>
            <div className="stats-edit-form">
              <div className="stats-edit-field">
                <label>Título</label>
                <input 
                  type="text" 
                  value={editingBloke.title} 
                  onChange={(e) => setEditingBloke({...editingBloke, title: e.target.value})}
                  maxLength={40}
                />
              </div>
              <div className="stats-edit-field">
                <label>Descripción</label>
                <textarea 
                  value={editingBloke.description || ''} 
                  onChange={(e) => setEditingBloke({...editingBloke, description: e.target.value})}
                  maxLength={300}
                />
              </div>
              <div className="stats-edit-row">
                <div className="stats-edit-field">
                  <label>Sala</label>
                  <select 
                    value={editingBloke.sala} 
                    onChange={(e) => setEditingBloke({...editingBloke, sala: e.target.value})}
                  >
                    <option value="entrada">Entrada</option>
                    <option value="sala_grande">Sala Grande</option>
                    <option value="cueva">Cueva</option>
                  </select>
                </div>
                <div className="stats-edit-field">
                  <label>Subsala</label>
                  <input 
                    type="text" 
                    value={editingBloke.subsala} 
                    onChange={(e) => setEditingBloke({...editingBloke, subsala: e.target.value})}
                  />
                </div>
              </div>
              <div className="stats-edit-row">
                <div className="stats-edit-field">
                  <label>Tipo</label>
                  <select 
                    value={editingBloke.tipo} 
                    onChange={(e) => setEditingBloke({...editingBloke, tipo: e.target.value})}
                  >
                    <option value="intro">INTRO</option>
                    <option value="trave">TRAVE</option>
                    <option value="bloke">BLOKE</option>
                  </select>
                </div>
                <div className="stats-edit-field">
                  <label>Grado</label>
                  <select 
                    value={editingBloke.grado} 
                    onChange={(e) => setEditingBloke({...editingBloke, grado: e.target.value})}
                  >
                    <option value="suave">Suave</option>
                    <option value="medio">Medio</option>
                    <option value="duro">Duro</option>
                  </select>
                </div>
              </div>
              <div className="stats-edit-field">
                <label>Categoría</label>
                <select
                  value={editingBloke.category || ''}
                  onChange={(e) => setEditingBloke({...editingBloke, category: e.target.value})}
                >
                  <option value="FUERZA">Fuerza</option>
                  <option value="TECNICA">Técnica</option>
                  <option value="DINAMICO">Dinámico</option>
                </select>
              </div>
              <div className="stats-edit-field">
                <label>Equipador</label>
                <select
                  value={editingBloke.equipador || 'alvaro'}
                  onChange={(e) => setEditingBloke({...editingBloke, equipador: e.target.value})}
                >
                  <option value="alvaro">Alvaro</option>
                  <option value="sigurd">Sigurd</option>
                  <option value="sara">Sara</option>
                  <option value="lucia">Lucia</option>
                  <option value="ana">Ana</option>
                  <option value="javi">Javi</option>
                  <option value="ramiro">Ramiro</option>
                  <option value="invitado">Invitado</option>
                </select>
              </div>
              <div className="stats-edit-field">
                <label>Color</label>
                <select
                  value={editingBloke.color}
                  onChange={(e) => setEditingBloke({...editingBloke, color: e.target.value})}
                >
                  <option value="green">Verde</option>
                  <option value="blue">Azul</option>
                  <option value="yellow">Amarillo</option>
                  <option value="red">Rojo</option>
                  <option value="black">Negro</option>
                  <option value="blanco">Trave</option>
                </select>
              </div>
              <div className="stats-edit-field">
                <label>Imágenes ({(editingBloke.images || []).length}/3)</label>
                <div className="stats-edit-images">
                  {(editingBloke.images || []).map((img, idx) => (
                    <div key={idx} className="stats-edit-image-item">
                      <img src={img.url} alt={`Imagen ${idx + 1}`} />
                      {idx === 0 && <span className="stats-edit-image-badge">Destacada</span>}
                      <button
                        type="button"
                        className="stats-edit-image-remove"
                        onClick={() => removeEditImage(idx)}
                        title="Eliminar imagen"
                      >×</button>
                    </div>
                  ))}
                </div>
                {(editingBloke.images || []).length < 3 && (
                  <ImageUploader
                    onImagesUploaded={(newImgs) => {
                      setEditingBloke(prev => ({
                        ...prev,
                        images: [...(prev.images || []), ...newImgs].slice(0, 3)
                      }))
                    }}
                    maxImages={3 - (editingBloke.images || []).length}
                  />
                )}
              </div>

              <div className="stats-edit-field">
                <label>Color de Presas</label>
                <select 
                  value={editingBloke.colorPresa || ''} 
                  onChange={(e) => setEditingBloke({...editingBloke, colorPresa: e.target.value})}
                >
                  <option value="">Selecciona un color</option>
                  <option value="presas_azules">Presas Azules</option>
                  <option value="presas_blancas">Presas Blancas</option>
                  <option value="presas_negras">Presas Negras</option>
                  <option value="presas_rojas">Presas Rojas</option>
                  <option value="presas_amarillas">Presas Amarillas</option>
                  <option value="presas_verdes">Presas Verdes</option>
                  <option value="presas_moradas">Presas Moradas</option>
                  <option value="presas_rosas">Presas Rosas</option>
                  <option value="presas_grises">Presas Grises</option>
                  <option value="presas_turquesa">Presas Turquesa</option>
                  <option value="presas_amarillo_fluor">Presas Amarillo Fluor</option>
                  <option value="presas_naranja">Presas Naranja</option>
                  <option value="presas_color_raro">Presas Color Raro</option>
                </select>
              </div>
            </div>
            <div className="stats-modal__actions">
              <button 
                className="stats-modal__cancel"
                onClick={handleEditCancel}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button 
                className="stats-modal__confirm"
                onClick={handleEditSave}
                disabled={isDeleting}
              >
                {isDeleting ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
