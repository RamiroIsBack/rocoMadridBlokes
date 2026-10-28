// Cuentas del campamento de verano (simulador de CTRL Time Off): ingresos, monitores,
// coste por niño, jornada de quien lo lleva y punto de equilibrio.
import { PROF_META, SALA } from '../data/staffSchedule'
import { COMODIN_VERANO, VERANO_APERTURA, CAMP_MESES, toMin, campWeeks, normalizeCamp, isClosed } from './coverage'

// Jornada ordinaria máxima (art. 34.3 ET)
export const JORNADA_MAX = 9

export const horasCamp = c => Math.max(0, (toMin(c.horaFin || '00:00') - toMin(c.horaInicio || '00:00')) / 60)
export const ninosSemana = (c, m) => Math.round((c.meses[m]?.plazas || 0) * (c.ocupacion ?? 100) / 100)
export const costeNino = c => (c.seguro || 0) + (c.material || 0) + (c.comida || 0)

// Horas de tarde en la sala un día de verano abierto: Eva, recepción de la apertura al
// cierre; los profes, las clases que les tocan (1,5 h cada una)
export function horasTarde(p, d) {
  if (!d || d.closed) return 0
  if (p === COMODIN_VERANO) return (toMin(SALA[d.day].cierre) - toMin(VERANO_APERTURA)) / 60
  return (d.covered || []).filter(x => x.to === p).length * 1.5
}

// camp: configuración del campamento. ctx: { y, cierre, simByDate (Map fecha → día simulado),
// presente(p, fecha) }. `ninos` y `precio` sustituyen a los del plan (tabla de plazas × precio).
//
// Monitores: hace falta 1 por cada `ratio` niños. Primero los de la plantilla que lo llevan
// y están ese día; el resto, de fuera a €/h. La plantilla con la sala cerrada no cuesta más
// (su sueldo se paga igual); con la sala abierta son horas de más a su coste por hora.
export function cuentasCamp(camp, { y, cierre, simByDate, presente = () => true }, { ninos: ninosFijo, precio } = {}) {
  const c = normalizeCamp(camp)
  if (precio != null) c.precio = precio
  const h = horasCamp(c)
  const porMes = Object.fromEntries(CAMP_MESES.map(m => [m, {
    semanas: 0, ninos: 0, ingresos: 0, costeNinos: 0, costeMonitores: 0, horasFuera: 0, horasPlantilla: 0, resultado: 0,
  }]))
  const exceso = {}     // persona → [{ date, horas }]
  const ausente = {}    // persona → días que lleva el campamento pero no está
  campWeeks(c, y).forEach(w => {
    const r = porMes[w.m]
    const ninos = ninosFijo ?? ninosSemana(c, w.m)
    r.semanas++
    r.ninos += ninos
    r.ingresos += ninos * c.precio * (1 - (c.descuento || 0) / 100)
    r.costeNinos += ninos * costeNino(c)
    const necesarios = ninos > 0 ? Math.ceil(ninos / Math.max(1, c.ratio || 1)) : 0
    w.dias.forEach(date => {
      const abierta = !isClosed(date, cierre)
      c.staff.filter(p => !presente(p, date)).forEach(p => { ausente[p] = (ausente[p] || 0) + 1 })
      const plantilla = c.staff.filter(p => presente(p, date)).slice(0, necesarios)
      const fuera = necesarios - plantilla.length
      r.horasFuera += fuera * h
      r.costeMonitores += fuera * h * (c.eurHora || 0)
      plantilla.forEach(p => {
        if (abierta) {
          r.horasPlantilla += h
          r.costeMonitores += h * (PROF_META[p]?.costoHClase || c.eurHora || 0)
        }
        const total = h + (abierta ? horasTarde(p, simByDate?.get(date)) : 0)
        if (total > JORNADA_MAX) (exceso[p] ||= []).push({ date, horas: total })
      })
    })
  })
  CAMP_MESES.forEach(m => { const r = porMes[m]; r.resultado = r.ingresos - r.costeNinos - r.costeMonitores })
  const semanas = CAMP_MESES.reduce((n, m) => n + porMes[m].semanas, 0)
  return {
    c, horas: h, porMes, semanas, exceso, ausente,
    ingresos: CAMP_MESES.reduce((n, m) => n + porMes[m].ingresos, 0),
    costes: CAMP_MESES.reduce((n, m) => n + porMes[m].costeNinos + porMes[m].costeMonitores, 0),
    total: CAMP_MESES.reduce((n, m) => n + porMes[m].resultado, 0),
  }
}

// Niños por semana a partir de los que el campamento deja de perder dinero (null si no llega)
export function equilibrioCamp(camp, ctx, max = 120) {
  if (!campWeeks(camp, ctx.y).length) return null
  for (let n = 1; n <= max; n++) if (cuentasCamp(camp, ctx, { ninos: n }).total >= 0) return n
  return null
}

// Resultado del campamento con varias cifras de niños por semana y de precio
export function tablaCamp(camp, ctx) {
  const p0 = normalizeCamp(camp).precio || 150
  const precios = [...new Set([p0 - 50, p0 - 25, p0, p0 + 25, p0 + 50].filter(p => p > 0))]
  const ninos = [5, 10, 15, 20, 25, 30]
  return {
    precios, ninos,
    filas: ninos.map(n => precios.map(precio => cuentasCamp(camp, ctx, { ninos: n, precio }).total)),
  }
}
