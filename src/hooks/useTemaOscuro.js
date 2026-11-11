import { useState, useEffect } from 'react'

// Cowork 11/11 13:55: los ejes de las gráficas (Recharts) seguían en gris claro en modo claro
// a pesar de usar var(--color-text-secondary) en el fill — Recharts pinta <text> con un atributo
// SVG fijo, no se repinta solo al cambiar la variable CSS. Este hook da el booleano "¿oscuro de
// verdad ahora mismo?" para elegir el color a mano en JS, y se actualiza con el selector de
// cabecera y con el cambio de sistema en modo "auto" (que no dispara blokes:tema-cambiado).
function oscuroDeVerdad() {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export default function useTemaOscuro() {
  const [oscuro, setOscuro] = useState(() => (typeof document === 'undefined' ? false : oscuroDeVerdad()))

  useEffect(() => {
    const actualizar = () => setOscuro(oscuroDeVerdad())
    window.addEventListener('blokes:tema-cambiado', actualizar)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', actualizar)
    return () => {
      window.removeEventListener('blokes:tema-cambiado', actualizar)
      mq?.removeEventListener('change', actualizar)
    }
  }, [])

  return oscuro
}
