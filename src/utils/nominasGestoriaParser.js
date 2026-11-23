// Lectura de los PDF de nóminas que manda la gestoría (23/11), para revisarlos contra lo pactado
// en Blokes ANTES de pagar. Se procesan en el navegador (pdf.js); no se suben a ningún servidor.
// Entiende dos documentos:
//  · «Listado de nóminas» (RELACION Nóminas …): una línea por trabajador con el líquido.
//  · Las nóminas completas (Nominas Oct.26 …): una por página, con «LIQUIDO TOTAL A PERCIBIR».
// Solo se usa el nombre, el líquido, el coste para la empresa y el mes; el resto (NIF, nº de la
// Seguridad Social, IBAN…) ni se guarda ni se enseña.
import { loadPdfjs } from './remittanceParser'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const parseAmount = s => parseFloat(s.replace(/\./g, '').replace(',', '.'))
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const AMOUNT = '(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})'

// Texto de cada página, línea a línea (de arriba abajo y de izquierda a derecha)
async function pdfPages(file) {
  const pdfjsLib = await loadPdfjs()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const tc   = await page.getTextContent()
    const items = tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] })).filter(it => it.str.trim())
    items.sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x))
    const lines = []
    items.forEach(it => {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.y - it.y) <= 3) last.str += ' ' + it.str
      else lines.push({ y: it.y, str: it.str })
    })
    pages.push(lines.map(l => l.str.replace(/\s+/g, ' ').trim()).join('\n'))
  }
  return pages
}

// «Listado de nóminas»: 2026 Octubre Ordinaria 1 2 APELLIDOS NOMBRE 31/10/2026 1.234,56
function parseListado(texto) {
  const re = new RegExp(`(\\d{4})\\s+(${MESES.join('|')})\\s+\\S+\\s+\\d+\\s+\\d+\\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ' .-]+?)\\s+(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+${AMOUNT}`, 'gi')
  const out = []
  let m
  const plano = texto.replace(/\n/g, ' ')
  while ((m = re.exec(plano))) {
    const mes = MESES.indexOf(m[2].toLowerCase())
    out.push({ name: m[3].trim(), amount: parseAmount(m[7]), month: `${m[1]}-${String(mes + 1).padStart(2, '0')}`, cost: null })
  }
  return out
}

// Nóminas completas: una por página
function parseNomina(texto) {
  const nombre = texto.match(/\d+\s*-\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ' .-]+,\s*[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ' .-]+)/)
  const liquido = texto.match(new RegExp(`LIQUIDO TOTAL A PERCIBIR(?:\\s*\\(A\\s*-\\s*B\\))?[^\\d]*${AMOUNT}`, 'i'))
  if (!nombre || !liquido) return null
  const coste = texto.match(new RegExp(`Coste total mensual[^\\d]*${AMOUNT}`, 'i'))
  const periodo = texto.match(/al\s+\d{1,2}\s+de\s+([A-Za-zé]+)\s+de\s+(\d{4})/i)
  // «APELLIDOS, NOMBRE» → «NOMBRE APELLIDOS» (para emparejar por el nombre de pila)
  const [ap, no] = nombre[1].split(',').map(s => s.trim())
  const mes = periodo ? MESES.indexOf(periodo[1].toLowerCase()) : -1
  return {
    name: `${no} ${ap}`.replace(/\s+/g, ' '),
    amount: parseAmount(liquido[1]),
    cost: coste ? parseAmount(coste[1]) : null,
    month: periodo && mes >= 0 ? `${periodo[2]}-${String(mes + 1).padStart(2, '0')}` : null,
  }
}

export async function parseNominasGestoriaPdf(file) {
  const pages = await pdfPages(file)
  const todo  = pages.join('\n')
  let tipo, lineas
  if (/LISTADO DE N[OÓ]MINAS/i.test(todo)) {
    tipo = 'listado'
    lineas = parseListado(todo)
  } else {
    tipo = 'nominas'
    lineas = pages.map(parseNomina).filter(Boolean)
  }
  if (!lineas.length) throw new Error('No reconozco este PDF: tiene que ser el «Listado de nóminas» o las nóminas de la gestoría.')
  const months = [...new Set(lineas.map(l => l.month).filter(Boolean))]
  const total  = Math.round(lineas.reduce((s, l) => s + l.amount, 0) * 100) / 100
  return { tipo, lineas, months, total }
}

// Emparejar cada línea con una persona de Nóminas: por el nombre completo de la ficha o por
// el nombre corto. Si un nombre corto encaja en varias líneas (p. ej. un segundo nombre), se
// resuelve por eliminación: primero las que solo tienen un candidato.
export function emparejarGestoria(lineas, people, personal) {
  const words = s => norm(s).split(/[^A-Z0-9]+/).filter(w => w.length > 1)
  const cands = lineas.map(l => {
    const ws = new Set(words(l.name))
    return people.filter(p => {
      const full = words(personal[p.id]?.full_name || '')
      if (full.length && full.every(w => ws.has(w))) return true
      const short = words(p.name)
      return short.length > 0 && short.every(w => ws.has(w))
    }).map(p => p.id)
  })
  const asignado = lineas.map(() => null)
  const usados = new Set()
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    cands.forEach((cs, i) => {
      if (asignado[i]) return
      const libres = cs.filter(id => !usados.has(id))
      if (libres.length === 1) { asignado[i] = libres[0]; usados.add(libres[0]) }
    })
  }
  return lineas.map((l, i) => ({ ...l, person: asignado[i], by: asignado[i] ? 'nombre' : (cands[i].length ? 'ambiguo' : null) }))
}
