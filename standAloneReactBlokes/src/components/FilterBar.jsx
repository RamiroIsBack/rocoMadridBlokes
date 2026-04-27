const SALAS = [
  { key: 'TODOS', label: 'Todas' },
  { key: 'entrada', label: 'Entrada' },
  { key: 'sala_grande', label: 'Sala Grande' },
  { key: 'cueva', label: 'Cueva' },
]

const COLORES = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'green', label: 'Verde' },
  { key: 'blue', label: 'Azul' },
  { key: 'yellow', label: 'Amarillo' },
  { key: 'red', label: 'Rojo' },
  { key: 'black', label: 'Negro' },
  { key: 'blanco', label: 'Trave' },
]

export default function FilterBar({ activeSala, onSalaChange, activeColor, onColorChange, sortMode, onSortMode }) {
  return (
    <nav className="filter-bar" aria-label="Filtros">
      <label className="filter-bar__field">
        <span className="filter-bar__label">Sala</span>
        <select
          className="filter-select"
          value={activeSala}
          onChange={(e) => onSalaChange(e.target.value)}
        >
          {SALAS.map((sala) => (
            <option key={sala.key} value={sala.key}>{sala.label}</option>
          ))}
        </select>
      </label>

      <label className="filter-bar__field">
        <span className="filter-bar__label">Color</span>
        <select
          className="filter-select"
          value={activeColor}
          onChange={(e) => onColorChange(e.target.value)}
        >
          {COLORES.map((color) => (
            <option key={color.key} value={color.key}>{color.label}</option>
          ))}
        </select>
      </label>

      <div className="filter-bar__field">
        <span className="filter-bar__label">Orden</span>
        <div className="filter-bar__sort-group">
          <button
            className={`filter-bar__sort-btn${sortMode === 'newest' ? ' filter-bar__sort-btn--active' : ''}`}
            onClick={() => onSortMode('newest')}
            title="Más nuevos primero"
          >
            NEW
          </button>
          <button
            className={`filter-bar__sort-btn${sortMode === 'stars' ? ' filter-bar__sort-btn--active' : ''}`}
            onClick={() => onSortMode('stars')}
            title="Más votados primero"
          >
            ⭐
          </button>
        </div>
      </div>
    </nav>
  )
}
