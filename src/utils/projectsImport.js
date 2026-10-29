import { STATUSES, newId } from '../hooks/useProjects'

// Instrucciones para pedirle a Claude partidas en el formato que entiende «Importar partidas»
export const CLAUDE_PROMPT = `Cuando te pida presupuestar algo para «Proyectos» (Superadmin de rocomadrid.com/blokes), busca precios reales en tiendas o webs de referencia en España y devuélveme, además de tu explicación, un bloque JSON con este formato exacto para pegarlo en «Importar partidas»:

{
  "zona": "Sala de Yoga",
  "capitulos": [
    {
      "nombre": "Suelo",
      "partidas": [
        {
          "concepto": "Tarima laminada AC4 colocada",
          "descripcion": "Incluye base aislante y colocación",
          "cantidad": 40,
          "unidad": "m²",
          "precio_propuesto": 22,
          "tipo_precio": "estimación",
          "estado": "pendiente",
          "medida": "suelo",
          "nota": "Opción más equilibrada entre precio y duración",
          "proveedor": "Leroy Merlin",
          "enlace": "https://...",
          "fecha_consulta": "2026-10-25"
        }
      ]
    }
  ]
}

Reglas:
- "precio_propuesto" es el precio unitario CON IVA, en euros, solo el número. Deja "precio_conseguido" para cuando haya un presupuesto real.
- Opcionales: "tipo_precio" (estimación, tienda, presupuesto…), "proveedor", "fuente" (nombre de la web), "enlace" (URL) y "fecha_consulta" (AAAA-MM-DD).
- "estado": pedir (hay que pedir presupuesto), pendiente, aprobado, comprado o descartado. Usa "descartado" para las alternativas que no deben sumar (deja activa solo la recomendada).
- "medida" es opcional: "suelo" (m² de suelo o techo), "perimetro" (m) o "paredes" (m²) si la cantidad depende de las medidas de la sala; así se recalcula sola cuando cambien. Si no, omítela.
- "nota": supuestos, avisos o alternativas, en una frase.
- Si la zona o el capítulo ya existen con ese nombre, las partidas se añaden ahí.`

const pick = (o, ...keys) => { for (const k of keys) if (o?.[k] !== undefined && o[k] !== null) return o[k] }

const num = v => {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  const n = parseFloat(v.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const MEASURE_ALIASES = { suelo: 'suelo', techo: 'suelo', m2: 'suelo', perimetro: 'perimetro', 'perímetro': 'perimetro', paredes: 'paredes' }

function parseItem(p) {
  const concept = String(pick(p, 'concepto', 'concept', 'nombre', 'descripcion', 'descripción') ?? '').trim()
  if (!concept) return null
  const status = String(pick(p, 'estado', 'status') ?? 'pendiente').toLowerCase().replace('pedir presupuesto', 'pedir')
  const ref    = MEASURE_ALIASES[String(pick(p, 'medida', 'qty_ref') ?? '').toLowerCase()] || ''
  // "fuente" puede ser el enlace o el nombre de la web; si hay "enlace", la fuente es el nombre
  const link   = pick(p, 'enlace', 'url', 'link', 'source')
  const fuente = pick(p, 'fuente', 'source_name')
  const isUrl  = v => /^https?:\/\//.test(String(v ?? ''))
  const date   = String(pick(p, 'fecha_consulta', 'fecha', 'checked_at', 'consultado') ?? '').slice(0, 10)
  return {
    id:          newId(),
    concept,
    description: String(pick(p, 'descripcion', 'descripción', 'description') ?? ''),
    qty:         num(pick(p, 'cantidad', 'qty')) ?? 1,
    qty_ref:     ref,
    qty_factor:  num(pick(p, 'factor', 'qty_factor')) ?? 1,
    unit:        String(pick(p, 'unidad', 'unit') ?? 'ud'),
    price:       num(pick(p, 'precio_propuesto', 'precio', 'price', 'precio_unitario')) ?? 0,
    price_got:   num(pick(p, 'precio_conseguido', 'price_got')),
    price_type:  String(pick(p, 'tipo_precio', 'tipo_de_precio', 'tipo', 'price_type') ?? ''),
    status:      STATUSES.some(s => s.id === status) ? status : 'pendiente',
    supplier:    String(pick(p, 'proveedor', 'supplier') ?? ''),
    source_name: isUrl(fuente) ? '' : String(fuente ?? ''),
    source:      String((isUrl(link) ? link : null) ?? (isUrl(fuente) ? fuente : '')),
    checked_at:  /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    note:        String(pick(p, 'nota', 'notas', 'note', 'notes') ?? ''),
  }
}

// Saca el primer bloque JSON del texto pegado (puede venir con explicación o con ```json)
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body   = fenced ? fenced[1] : text
  const start  = body.search(/[[{]/)
  if (start < 0) throw new Error('No encuentro ningún bloque JSON en el texto pegado.')
  const open = body[start], close = open === '{' ? '}' : ']'
  const end  = body.lastIndexOf(close)
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new Error('El JSON no es válido. Pide a Claude que lo vuelva a generar completo.')
  }
}

// Datos de la sala que trae una exportación completa: ubicación, notas y medidas.
// Las medidas vienen como texto («10,00 × 5,78 m · altura 2,60 m»): se sacan largo, ancho y alto
// si el texto los trae; el texto entero se guarda al principio de las notas.
function zoneInfo(b) {
  const text = String(pick(b, 'medidas') ?? '')
  const n    = s => parseFloat(s.replace(',', '.'))
  const dims = text.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)/)
  const alto = text.match(/altura\s*(\d+(?:[.,]\d+)?)/i)
  const notes = [text && `Medidas: ${text}`, pick(b, 'notas', 'notes')].filter(Boolean).join('\n')
  return {
    location: String(pick(b, 'ubicacion', 'ubicación', 'location') ?? ''),
    notes,
    measures: dims ? { largo: n(dims[1]), ancho: n(dims[2]), alto: alto ? n(alto[1]) : null } : null,
  }
}

// Devuelve [{ zone, chapters: [{ name, items }], location, notes, measures }]. Acepta:
//   { zona, capitulos: [{ nombre, partidas }] }
//   { zona, capitulo, partidas }
//   una lista de cualquiera de los dos
export function parseImport(text, defaultZone) {
  const data   = extractJson(text)
  // Exportación completa: { zonas: [...] } o { salas: [...] }, cada una con su nombre
  const list   = !Array.isArray(data) && pick(data, 'zonas', 'salas', 'zones')
  const blocks = Array.isArray(list) ? list : Array.isArray(data) ? data : [data]
  const groups = []
  for (const b of blocks) {
    const zone = String(pick(b, 'zona', 'sala', 'zone', ...(list ? ['nombre', 'name'] : [])) ?? defaultZone ?? '').trim()
    if (!zone) throw new Error('Falta "zona": indica a qué zona van las partidas.')
    const raw = pick(b, 'capitulos', 'capítulos', 'chapters')
      ?? [{ nombre: pick(b, 'capitulo', 'capítulo', 'chapter') ?? 'Varios', partidas: pick(b, 'partidas', 'items') ?? [] }]
    // El número del capítulo lo pone la página: «1 · Pecera móvil» → «Pecera móvil»
    const chapters = (Array.isArray(raw) ? raw : []).map(c => ({
      name:  String(pick(c, 'nombre', 'name', 'capitulo', 'capítulo') ?? 'Varios').replace(/^\s*\d+\s*[·.\-)]\s*/, '').trim() || 'Varios',
      items: [...(pick(c, 'partidas', 'items') ?? [])]
        .sort((a, b) => (a?.orden ?? 0) - (b?.orden ?? 0))
        .map(parseItem).filter(Boolean),
    })).filter(c => c.items.length)
    if (chapters.length) groups.push({ zone, chapters, ...zoneInfo(b) })
  }
  if (!groups.length) throw new Error('No hay partidas que importar.')
  return groups
}

const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Añade los grupos importados a las zonas (crea zona o capítulo si no existe con ese nombre)
export function applyImport(zones, groups) {
  const next = structuredClone(zones)
  for (const g of groups) {
    let zone = next.find(z => same(z.name, g.zone))
    if (!zone) {
      zone = { id: newId(), name: g.zone, location: '', notes: '', measures: { largo: null, ancho: null, alto: null }, chapters: [] }
      next.push(zone)
    }
    // Lo que trae la exportación solo rellena lo que la zona aún no tiene
    if (g.location && !zone.location) zone.location = g.location
    if (g.notes && !zone.notes) zone.notes = g.notes
    if (g.measures && !zone.measures?.largo) zone.measures = g.measures
    for (const c of g.chapters) {
      let chapter = zone.chapters.find(x => same(x.name, c.name))
      if (!chapter) {
        chapter = { id: newId(), name: c.name, items: [] }
        zone.chapters.push(chapter)
      }
      chapter.items.push(...c.items)
    }
  }
  return next
}
