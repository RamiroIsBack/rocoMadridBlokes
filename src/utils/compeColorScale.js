// Escala de color suave y progresiva verde → amarillo → rojo según el NÚMERO del bloque de
// compe (nunca el color/grado real del bloke) — Ramiro, 09/11 06:26: "los colores los quiero
// más suaves... no como está ahora" (antes usaba el color de grado, ej. azul/negro). Mismo
// criterio en las 3 pantallas que pintan un bloque de compe: la tarjeta de Colección, el punto
// de "Últimos tops" de la tele y el cuadradito de Recepción.
export function colorPorNumeroBloque(numero, total = 16) {
  const t = Math.max(0, Math.min(1, (Number(numero) - 1) / Math.max(1, total - 1)))
  const hue = t <= 0.5 ? 130 - (130 - 50) * (t / 0.5) : 50 - 50 * ((t - 0.5) / 0.5)
  return { bg: `hsl(${hue}, 60%, 80%)`, text: '#1f2937' }
}
