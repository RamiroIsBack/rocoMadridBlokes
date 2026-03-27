const SALAS = [
  { key: 'TODOS', label: 'Todas' },
  { key: 'entrada', label: 'Entrada' },
  { key: 'sala_grande', label: 'Sala Grande' },
  { key: 'cueva', label: 'Cueva' },
]

/**
 * @param {{ activeFilter: string, onFilterChange: (sala: string) => void }} props
 */
export default function FilterBar({ activeFilter, onFilterChange }) {
  return (
    <nav className="filter-bar" aria-label="Filtrar por sala">
      {SALAS.map((sala) => (
        <button
          key={sala.key}
          className={`filter-btn ${activeFilter === sala.key ? 'filter-btn--active' : ''}`}
          onClick={() => onFilterChange(sala.key)}
          aria-pressed={activeFilter === sala.key}
        >
          {sala.label}
        </button>
      ))}
    </nav>
  )
}
