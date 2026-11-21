import { useState, useEffect } from 'react'

// Varias gráficas (Recharts pinta <text> con un atributo SVG `fill` fijo, que no se repinta
// solo con las variables CSS) y colores de KPI necesitan saber a mano si el tema actual es
// oscuro o claro. Ramiro, 13/11: vuelve a haber 2 modos (claro/oscuro, sin automático) — este
// hook lee el `data-theme` real del <html> y se actualiza cuando `setTema()` lo cambia
// (utils/theme.js dispara `blokes:tema-cambiado`).
export default function useTemaOscuro() {
  const [oscuro, setOscuro] = useState(
    () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== 'light'
  )

  useEffect(() => {
    const onCambio = e => setOscuro(e.detail !== 'light')
    window.addEventListener('blokes:tema-cambiado', onCambio)
    return () => window.removeEventListener('blokes:tema-cambiado', onCambio)
  }, [])

  return oscuro
}
