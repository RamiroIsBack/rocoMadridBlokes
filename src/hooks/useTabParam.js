import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

// Abre la pestaña que venga en la dirección (?tab=…), p. ej. desde un enlace
// del Mapa de Blokes. `valid` filtra valores desconocidos; `apply` la abre.
export function useTabParam(name, valid, apply) {
  const [params] = useSearchParams()
  const value = params.get(name)
  useEffect(() => {
    if (value && valid(value)) apply(value)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
}
