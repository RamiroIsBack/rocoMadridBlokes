import { useDiarioAccess } from '../hooks/useDiario'
import CalendarioPage from './CalendarioPage'
import './DashboardPage.css'

// Diario: pequeño dashboard para los profes (y Carolina, por la lista de Acceso).
// De momento solo la estructura; el contenido se irá añadiendo poco a poco.
export default function DiarioPage() {
  const can = useDiarioAccess()

  if (!can) {
    return (
      <div className="dash__forbidden">
        <p>🔒 El Diario es para el equipo del Roco.</p>
      </div>
    )
  }

  return (
    <div className="dash dash--wide">
      <header className="dash__head">
        <h1 className="dash__title">Diario</h1>
        <p className="dash__claim">Lo de hoy, de un vistazo</p>
        <p className="dash__intro">Tu panel del día en el Roco. Aquí irán apareciendo las cosas que necesitas tener a mano cada día.</p>
      </header>
      {/* Primer paso del traslado de Notion a Blokes: el calendario de actividades del Roco
          (de momento se sigue leyendo de Notion + las reservas de Eventos). */}
      <section className="dash__section">
        <CalendarioPage embedded />
      </section>
    </div>
  )
}
