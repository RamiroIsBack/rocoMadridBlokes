import { useState } from 'react'
import './ApuntarResultadoModal.css'

// 23/11 06:51/06:52 (Ramiro): "un único diálogo modal" para apuntar en la compe — sustituye al
// CategoriaCompeModal de ayer (22/11 13:50), que solo pedía categoría: ahora SIEMPRE hay que
// decir también Top o Bonus, en los 4 sitios donde se puede apuntar (Colección/tablet,
// Recepción, Apuntar de cada uno). El paso de categoría solo aparece si de verdad falta —
// nunca se sabe por adelantado si esta persona ya la tiene, así que el flujo normal es:
// 1) se intenta guardar el Top/Bonus elegido aquí; 2) si el backend dice que falta categoría
// (y no se le pudo poner sola por tener sub de Menores), el que llama pasa `mostrarCategoria`
// a true y este mismo diálogo pide la categoría, reintentando con el resultado que ya se había
// elegido. Solo se cierra respondiendo o con la X (que pide confirmación aparte) — pulsar
// fuera o Atrás no hace nada. Si ya había un resultado en este bloque, se ve marcado y se
// puede cambiar (tocar el otro botón) o quitar.
export default function ApuntarResultadoModal({
  numero, nombre, mostrarCategoria, resultadoActual, onElegirResultado, onElegirCategoria, onQuitar, onCerrar, busy,
}) {
  const [confirmandoCerrar, setConfirmandoCerrar] = useState(false)

  return (
    <div className="arm-overlay">
      <div className="arm-modal" role="dialog" aria-modal="true">
        <div className="arm-head">
          <h2 className="arm-titulo">Bloque {numero} · {nombre}</h2>
          <button type="button" className="arm-close" onClick={() => setConfirmandoCerrar(true)} aria-label="Cerrar">✕</button>
        </div>

        {confirmandoCerrar ? (
          <div className="arm-confirm">
            <p>¿Cerrar? La puntuación de {nombre} en el bloque {numero} se quedará sin apuntar.</p>
            <div className="arm-confirm-botones">
              <button type="button" className="arm-btn" onClick={onCerrar}>Sí, cerrar</button>
              <button type="button" className="arm-btn arm-btn--ghost" onClick={() => setConfirmandoCerrar(false)}>Seguir aquí</button>
            </div>
          </div>
        ) : mostrarCategoria ? (
          <div className="arm-paso">
            <p className="arm-pregunta">¿En qué categoría compite {nombre}?</p>
            <div className="arm-botones-grandes">
              <button type="button" className="arm-btn-grande" disabled={busy} onClick={() => onElegirCategoria('masculina')}>Masculina</button>
              <button type="button" className="arm-btn-grande" disabled={busy} onClick={() => onElegirCategoria('femenina')}>Femenina</button>
              <button type="button" className="arm-btn-grande" disabled={busy} onClick={() => onElegirCategoria('infantil')}>Infantil</button>
            </div>
          </div>
        ) : (
          <div className="arm-paso">
            {resultadoActual && (
              <p className="arm-ya-apuntado">Ya apuntado: <strong>{resultadoActual === 'top' ? 'Top' : 'Bonus'}</strong> — toca el otro para cambiarlo.</p>
            )}
            <div className="arm-botones-grandes">
              <button
                type="button" className={`arm-btn-grande${resultadoActual === 'top' ? ' arm-btn-grande--activo' : ''}`}
                disabled={busy} onClick={() => onElegirResultado('top')}
              >Top</button>
              <button
                type="button" className={`arm-btn-grande${resultadoActual === 'bonus' ? ' arm-btn-grande--activo' : ''}`}
                disabled={busy} onClick={() => onElegirResultado('bonus')}
              >Bonus</button>
            </div>
            {resultadoActual && (
              <button type="button" className="arm-quitar" disabled={busy} onClick={onQuitar}>Quitar este resultado</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
