import './CategoriaCompeModal.css'

// 22/11 13:50 (Ramiro): el aviso "elige categoría" tiene que ser un diálogo modal de verdad —
// centrado, tapa la pantalla, no se cierra pulsando fuera (sin onClick en el overlay) — nunca
// un banner. Se usa igual en la tablet (Colección), en "Apuntar" y en Recepción: siempre que
// el backend rechace un primer top por falta de categoría (código 'falta_categoria').
export default function CategoriaCompeModal({ nombre, onElegir, onCancelar, busy }) {
  return (
    <div className="ccm-overlay">
      <div className="ccm-modal" role="dialog" aria-modal="true">
        <h2 className="ccm-titulo">¿En qué categoría compite {nombre}?</h2>
        <div className="ccm-botones">
          <button type="button" className="ccm-btn" disabled={busy} onClick={() => onElegir('masculina')}>Masculina</button>
          <button type="button" className="ccm-btn" disabled={busy} onClick={() => onElegir('femenina')}>Femenina</button>
          <button type="button" className="ccm-btn" disabled={busy} onClick={() => onElegir('infantil')}>Infantil</button>
        </div>
        <button type="button" className="ccm-cancelar" disabled={busy} onClick={onCancelar}>Cancelar — no apuntar este top</button>
      </div>
    </div>
  )
}
