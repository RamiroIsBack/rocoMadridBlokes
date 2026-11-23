import { clasesComoCronograma } from '../components/DiarioHorarios'

// Horas a la semana de cada persona según el cronograma del Diario (23/11): lo puesto a mano
// (Equipamiento, Recepción, Otro) + las clases del horario de clases. Si dos franjas de la
// misma persona se pisan el mismo día (p. ej. Recepción y una clase), ese rato cuenta una vez.

const aMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const normNombre = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
export const nombreDePila = s => normNombre(s).split(' ')[0]

// { 'sigurd': { name: 'Sigurd', hours: 13.5, dias: 2 } } — clave: nombre de pila normalizado
export function horasSemanaPorPersona(items) {
  const crono = [
    ...items.filter(it => it.board === 'cronograma' && it.kind !== 'Clase'),
    ...clasesComoCronograma(items),
  ]
  const porPersonaDia = {}
  crono.forEach(it => {
    const k = nombreDePila(it.person)
    if (!k) return
    porPersonaDia[k] = porPersonaDia[k] || { name: it.person, dias: {} }
    ;(porPersonaDia[k].dias[it.day] = porPersonaDia[k].dias[it.day] || []).push([aMin(it.start), aMin(it.end)])
  })
  const out = {}
  Object.entries(porPersonaDia).forEach(([k, { name, dias }]) => {
    let min = 0
    Object.values(dias).forEach(tramos => {
      tramos.sort((a, b) => a[0] - b[0])
      let [ini, fin] = tramos[0]
      tramos.slice(1).forEach(([a, b]) => {
        if (a <= fin) fin = Math.max(fin, b)
        else { min += fin - ini; ini = a; fin = b }
      })
      min += fin - ini
    })
    out[k] = { name, hours: Math.round(min / 6) / 10, dias: Object.keys(dias).length }
  })
  return out
}
