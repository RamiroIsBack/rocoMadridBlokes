// Ramiro, 13/11 05:30: "quita también el modo claro/oscuro" — Blokes siempre en oscuro, así
// que esto ya no necesita leer nada ni escuchar cambios. Se deja como hook (en vez de borrar y
// tocar cada sitio que lo llama) porque varias gráficas (Recharts pinta <text> con un atributo
// SVG fijo, no se repinta solo con las variables CSS) y colores de KPI lo usan para elegir a
// mano el color "pensado para oscuro" — que ahora es simplemente el único que hace falta.
export default function useTemaOscuro() {
  return true
}
