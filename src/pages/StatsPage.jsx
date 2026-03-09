import { useState, useEffect, useMemo } from 'react'
import { useWordPressPosts } from '../hooks/useWordPressPosts'
import './StatsPage.css'

export default function StatsPage() {
  const { cards, loading, error } = useWordPressPosts()
  const [filters, setFilters] = useState({
    category: '',
    color: '',
    sortBy: 'totalInteractions',
    sortOrder: 'desc'
  })
  
  // Calculate stats from cards data
  const stats = useMemo(() => {
    const colorDistribution = { green: 0, blue: 0, yellow: 0, red: 0 }
    const categoryDistribution = { PUZLE: 0, TECNICO: 0, ENTRENAMIENTO: 0, COORDINACION: 0 }
    const interactions = { star_1: 0, star_2: 0, star_3: 0, skull: 0 }
    
    cards.forEach(card => {
      // Color distribution
      if (colorDistribution[card.color] !== undefined) {
        colorDistribution[card.color]++
      }
      
      // Category distribution
      if (categoryDistribution[card.category] !== undefined) {
        categoryDistribution[card.category]++
      }
      
      // Interactions
      if (card.interactions) {
        interactions.star_1 += card.interactions.star_1 || 0
        interactions.star_2 += card.interactions.star_2 || 0
        interactions.star_3 += card.interactions.star_3 || 0
        interactions.skull += card.interactions.skull || 0
      }
    })
    
    return {
      totalBlokes: cards.length,
      colorDistribution,
      categoryDistribution,
      interactions,
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
  
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }
  
  const resetFilters = () => {
    setFilters({
      category: '',
      color: '',
      sortBy: 'totalInteractions',
      sortOrder: 'desc'
    })
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
          </div>
          
          <div className="stats-summary__card">
            <h3>Distribución por Color</h3>
            <div className="stats-summary__colors">
              <div className="stats-summary__color-item">
                <span className="stats-summary__color-dot stats-summary__color-dot--green"></span>
                <span className="stats-summary__color-label">Verde: {stats.colorDistribution.green}</span>
              </div>
              <div className="stats-summary__color-item">
                <span className="stats-summary__color-dot stats-summary__color-dot--blue"></span>
                <span className="stats-summary__color-label">Azul: {stats.colorDistribution.blue}</span>
              </div>
              <div className="stats-summary__color-item">
                <span className="stats-summary__color-dot stats-summary__color-dot--yellow"></span>
                <span className="stats-summary__color-label">Amarillo: {stats.colorDistribution.yellow}</span>
              </div>
              <div className="stats-summary__color-item">
                <span className="stats-summary__color-dot stats-summary__color-dot--red"></span>
                <span className="stats-summary__color-label">Rojo: {stats.colorDistribution.red}</span>
              </div>
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
                  <option value="PUZLE">Puzle</option>
                  <option value="TECNICO">Técnico</option>
                  <option value="ENTRENAMIENTO">Entrenamiento</option>
                  <option value="COORDINACION">Coordinación</option>
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
                  <th title="Categoría del problema">Categoría</th>
                  <th title="Color asignado">Color</th>
                  <th title="Buen bloke">⭐</th>
                  <th title="Muy buen bloke">⭐⭐</th>
                  <th title="Blokazo">⭐⭐⭐</th>
                  <th title="Amor-odio">💀</th>
                  <th title="Total de interacciones">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlokes.map(card => (
                  <tr key={card.id}>
                    <td>{card.title}</td>
                    <td>{card.category}</td>
                    <td>
                      <span className={`event-card__color event-card__color--${card.color}`}></span>
                    </td>
                    <td>{card.interactions?.star_1 || 0}</td>
                    <td>{card.interactions?.star_2 || 0}</td>
                    <td>{card.interactions?.star_3 || 0}</td>
                    <td>{card.interactions?.skull || 0}</td>
                    <td><strong>{card.totalInteractions || 0}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
