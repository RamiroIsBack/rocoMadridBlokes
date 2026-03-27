export default function LoadingSpinner() {
  return (
    <div className="spinner-container" role="status" aria-label="Cargando">
      <div className="spinner" />
      <p className="spinner-text">Cargando problemas...</p>
    </div>
  )
}
