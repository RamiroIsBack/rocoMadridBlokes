const CATEGORIES = ['TODOS', 'PUZLE', 'TECNICO', 'ENTRENAMIENTO', 'COORDINACION']

/**
 * @param {{ activeFilter: string, onFilterChange: (cat: string) => void }} props
 */
export default function FilterBar({ activeFilter, onFilterChange }) {
  return (
    <nav className="filter-bar" aria-label="Filtrar por categoría">
      {CATEGORIES.map((category) => (
        <button
          key={category}
          className={`filter-btn ${activeFilter === category ? 'filter-btn--active' : ''}`}
          onClick={() => onFilterChange(category)}
          aria-pressed={activeFilter === category}
        >
          {category}
        </button>
      ))}
    </nav>
  )
}
