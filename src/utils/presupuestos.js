// Cálculos de Presupuestos por zonas. Todos los precios llevan IVA incluido.
// Se calcula con todos los decimales y se redondea solo al mostrar.

export const IVA = 0.21

export const ESTADOS = [
  { key: 'pedir',      label: 'Pedir presupuesto' },
  { key: 'pendiente',  label: 'Pendiente' },
  { key: 'aprobado',   label: 'Aprobado' },
  { key: 'comprado',   label: 'Comprado' },
  { key: 'descartado', label: 'Descartado' },
]
export const ESTADO_LABEL = Object.fromEntries(ESTADOS.map(e => [e.key, e.label]))

export const TIPOS = [
  { key: 'presupuesto', label: 'Presupuesto', color: '#34d399' },
  { key: 'referencia',  label: 'Referencia',  color: '#60a5fa' },
  { key: 'estimación',  label: 'Estimación',  color: '#f5c842' },
  { key: 'tienda',      label: 'Tienda',      color: '#a78bfa' },
]
export const TIPO_BY_KEY = Object.fromEntries(TIPOS.map(t => [t.key, t]))

export const MEDIDAS = [
  { key: 'suelo',     label: 'Suelo (m²)' },
  { key: 'perimetro', label: 'Perímetro (ml)' },
  { key: 'paredes',   label: 'Paredes (m²)' },
]

export const UNIDADES = ['ud', 'm²', 'ml', 'm³', 'h', 'placas', 'kit']

export const isActiva   = p => p.estado !== 'descartado'
export const isAceptada = p => p.estado === 'aprobado' || p.estado === 'comprado'

// Valor de la medida de la zona (null si faltan datos para calcularla)
export function medidaZona(zona, medida) {
  const l = Number(zona?.largo) || 0
  const a = Number(zona?.ancho) || 0
  const h = Number(zona?.alto)  || 0
  if (!l || !a) return null
  if (medida === 'suelo')     return l * a
  if (medida === 'perimetro') return 2 * (l + a)
  if (medida === 'paredes')   return h ? 2 * (l + a) * h : null
  return null
}

// Con «medida» puesta y medidas en la zona, la cantidad sale de la zona
export function cantidad(p, zona) {
  if (p.medida) {
    const m = medidaZona(zona, p.medida)
    if (m != null) return m
  }
  return Number(p.cantidad) || 0
}

export const precioFinal      = p => (p.precio_conseguido ?? p.precio_propuesto) || 0
export const importePropuesto = (p, zona) => cantidad(p, zona) * (Number(p.precio_propuesto) || 0)
export const importeFinal     = (p, zona) => cantidad(p, zona) * precioFinal(p)

// Totales de un conjunto de partidas. Las descartadas nunca suman.
// zonaDe: id → zona (para las cantidades que dependen de las medidas)
export function totales(partidas, zonaDe) {
  let propuesto = 0, final = 0, aceptado = 0, nActivas = 0, nAceptadas = 0
  const porTipo = {}
  for (const p of partidas) {
    if (!isActiva(p)) continue
    const z  = zonaDe[p.zona_id]
    const ip = importePropuesto(p, z)
    const fi = importeFinal(p, z)
    propuesto += ip
    final     += fi
    nActivas++
    porTipo[p.tipo_precio] = (porTipo[p.tipo_precio] || 0) + fi
    if (isAceptada(p)) { aceptado += fi; nAceptadas++ }
  }
  const base = final / (1 + IVA)
  return { propuesto, final, ahorro: propuesto - final, aceptado, nActivas, nAceptadas, base, iva: final - base, porTipo }
}

// Capítulos en el orden en que aparecen (así se respeta el orden de la importación)
// y partidas por «orden» dentro de cada uno.
export function porCapitulo(partidas) {
  const caps = new Map()
  for (const p of partidas) {
    if (!caps.has(p.capitulo)) caps.set(p.capitulo, [])
    caps.get(p.capitulo).push(p)
  }
  return [...caps.entries()].map(([nombre, items]) => ({
    nombre,
    partidas: items.map((p, i) => [p, i]).sort((a, b) => (a[0].orden || 0) - (b[0].orden || 0) || a[1] - b[1]).map(x => x[0]),
  }))
}

// ─── Formato (es-ES, siempre con separador de miles) ─────────────────────────
// Se hace a mano: Intl en es-ES no agrupa los números de 4 cifras.
function agrupar(entero) {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function fmtNum(n, dec = 2) {
  const v   = Number(n) || 0
  const neg = v < 0 && Math.abs(v) >= 0.5 / 10 ** dec
  const [ent, frac] = Math.abs(v).toFixed(dec).split('.')
  return (neg ? '−' : '') + agrupar(ent) + (frac ? ',' + frac : '')
}

export const fmtEur = n => `${fmtNum(n, 2)} €`

// Cantidades: hasta 2 decimales sin ceros sobrantes (28,9 · 3)
export function fmtCant(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100
  const [ent, frac] = String(Math.abs(v)).split('.')
  return (v < 0 ? '−' : '') + agrupar(ent) + (frac ? ',' + frac : '')
}

export function fmtFecha(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// «10,00 × 5,78 m · 57,8 m² · altura 2,60 m · perímetro ≈ 31,6 m»
export function fmtMedidas(zona) {
  const l = Number(zona?.largo) || 0
  const a = Number(zona?.ancho) || 0
  const h = Number(zona?.alto)  || 0
  if (!l || !a) return ''
  let s = `${fmtNum(l)} × ${fmtNum(a)} m · ${fmtCant(l * a)} m²`
  if (h) s += ` · altura ${fmtNum(h)} m`
  s += ` · perímetro ≈ ${fmtNum(2 * (l + a), 1)} m`
  return s
}

// «85,5» → 85.5 · vacío → null · no numérico → undefined (no se guarda) · negativo → 0
export function parsePrecio(str) {
  const s = String(str ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.$/.test(s)) return undefined
  return Math.max(0, Math.round(parseFloat(s) * 100) / 100)
}

export function dominio(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

export function urlSegura(url) {
  return /^https?:\/\//i.test(String(url || '')) ? url : ''
}

// Copia de seguridad: zonas → capítulos → partidas, con importes y totales
export function exportar(zonas, partidas) {
  const zonaDe = Object.fromEntries(zonas.map(z => [z.id, z]))
  const r2 = n => Math.round(n * 100) / 100
  const tot = t => ({
    propuesto: r2(t.propuesto), final: r2(t.final), ahorro: r2(t.ahorro),
    aceptado: r2(t.aceptado), base_imponible: r2(t.base), iva: r2(t.iva),
  })
  return {
    exportado: new Date().toISOString(),
    zonas: [...zonas].sort((a, b) => (a.orden || 0) - (b.orden || 0)).map(z => {
      const ps = partidas.filter(p => p.zona_id === z.id)
      return {
        nombre: z.nombre, ubicacion: z.ubicacion, largo: z.largo, ancho: z.ancho, alto: z.alto,
        medidas: fmtMedidas(z), notas: z.notas,
        capitulos: porCapitulo(ps).map(c => ({
          nombre: c.nombre,
          partidas: c.partidas.map(p => ({
            ...p,
            cantidad: r2(cantidad(p, z)),
            importe_propuesto: r2(importePropuesto(p, z)),
            importe_final: r2(importeFinal(p, z)),
          })),
          totales: tot(totales(c.partidas, zonaDe)),
        })),
        totales: tot(totales(ps, zonaDe)),
      }
    }),
    totales: tot(totales(partidas, zonaDe)),
  }
}
