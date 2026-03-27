import { useState, useEffect, useMemo } from 'react'
import { useWordPressPosts, deleteBloke } from '../hooks/useWordPressPosts'
import AdminLogin from '../admin/AdminLogin'
import './StatsPage.css'

// Session storage key for simple password auth
const SESSION_KEY = 'blokes_auth'

export default function StatsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check sessionStorage on initial load
    return !!sessionStorage.getItem(SESSION_KEY)
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
    sortBy: 'totalInteractions',
    sortOrder: 'desc'
  })
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { postId, title }
  const [isDeleting, setIsDeleting] = useState(false)

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
      if (filters.sortBy === 'totalInteractions') {
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
  
  // Show login if not authenticated - AFTER all hooks
  if (!isAuthenticated) {
    return <AdminLogin 
      mode="stats" 
      onLogin={() => {
        sessionStorage.setItem(SESSION_KEY, 'true')
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
      sortBy: 'totalInteractions',
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
                <label>Equipador</label>
                <select 
                  value={filters.equipador}
                  onChange={(e) => handleFilterChange('equipador', e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="alvaro">Alvaro</option>
                  <option value="sigur">Sigur</option>
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
                <label>Color de Presas</label>
                <select 
                  value={filters.colorPresa}
                  onChange={(e) => handleFilterChange('colorPresa', e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="presas_azules">Presas Azules</option>
                  <option value="presas_blancas">Presas Blancas</option>
                  <option value="presas_negras">Presas Negras</option>
                  <option value="presas_rojas">Presas Rojas</option>
                  <option value="presas_amarillas">Presas Amarillas</option>
                  <option value="presas_verdes">Presas Verdes</option>
                  <option value="presas_color_raro">Presas Color Raro</option>
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
            </div>
            
            <div className="stats-filters__actions">
              <button className="stats-filters__reset" onClick={resetFilters}>
                Restablecer filtros
              </button>
            </div>
          </div>
        </div>
        
        {/* Table */}
        <div className="stats-page__table">
          <h2>Blokes ({filteredBlokes.length})</h2>
          {filteredBlokes.length === 0 ? (
            <p>No hay blokes que coincidan con los filtros.</p>
          ) : (
            <table className="stats-table">
              <thead>
                <tr>
                  <th title="Nombre del bloke">Título</th>
                  <th title="Equipador">Equipador</th>
                  <th title="Categoría del problema">Categoría</th>
                  <th title="Sala">Sala</th>
                  <th title="Subzona">Subsala</th>
                  <th title="Tipo">Tipo</th>
                  <th title="Color asignado">Color</th>
                  <th title="Color de presas">Color Presas</th>
                  <th title="Grado">Grado</th>
                  <th title="Buen bloke">⭐</th>
                  <th title="Muy buen bloke">⭐⭐</th>
                  <th title="Blokazo">⭐⭐⭐</th>
                  <th title="Amor-odio">💀</th>
                  <th title="Total de interacciones">Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlokes.map(card => (
                  <tr key={card.id}>
                    <td>{card.title}</td>
                    <td>{card.equipador || 'alvaro'}</td>
                    <td>{card.category}</td>
                    <td>{card.sala || 'entrada'}</td>
                    <td>{card.subsala || '1'}</td>
                    <td>{(card.tipo || 'bloke').toUpperCase()}</td>
                    <td>
                      <span className={`event-card__color event-card__color--${card.color}`}></span>
                    </td>
                    <td>{card.colorPresa ? card.colorPresa.replace('presas_', '').replace('_', ' ') : '-'}</td>
                    <td>{(card.grado || 'medio').charAt(0).toUpperCase() + (card.grado || 'medio').slice(1)}</td>
                    <td>{Number(card.interactions?.star_1) || 0}</td>
                    <td>{Number(card.interactions?.star_2) || 0}</td>
                    <td>{Number(card.interactions?.star_3) || 0}</td>
                    <td>{Number(card.interactions?.skull) || 0}</td>
                    <td><strong>{Number(card.totalInteractions) || 0}</strong></td>
                    <td>
                      <button 
                        className="stats-table__delete-btn"
                        onClick={() => handleDeleteClick(card)}
                        title="Eliminar bloke"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
    </div>
  )
}
