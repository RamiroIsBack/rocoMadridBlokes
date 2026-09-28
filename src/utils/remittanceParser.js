// Lectura del "Listado de pagos" (remesa de transferencias SEPA) que imprime Laboral Kutxa en PDF.
// El PDF se procesa en el navegador con pdf.js (cargado desde cdnjs con SRI, solo al usarlo):
// no se sube a ningún servidor.
//
// Estructura del listado: cabecera "Fichero" (nº operaciones, importe total), "Ordenante" y la
// tabla "Pagos" con columnas Beneficiario | Cuenta del Beneficiario (IBAN partido en 2 líneas) |
// Concepto | Fecha de pago | Importe.

const PDFJS_VERSION = '3.11.174'
const PDFJS_BASE    = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`
const PDFJS_SRI = {
  lib:    'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
  worker: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2',
}

let pdfjsPromise = null

// Carga pdf.js una sola vez. El worker se descarga con fetch+SRI y se usa como blob
// (un Worker no puede cargarse directamente desde otro dominio).
function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib)
    const s = document.createElement('script')
    s.src         = `${PDFJS_BASE}/pdf.min.js`
    s.integrity   = PDFJS_SRI.lib
    s.crossOrigin = 'anonymous'
    s.onload  = () => resolve(window.pdfjsLib)
    s.onerror = () => reject(new Error('No se pudo cargar el lector de PDF'))
    document.head.appendChild(s)
  }).then(async lib => {
    const res = await fetch(`${PDFJS_BASE}/pdf.worker.min.js`, { integrity: PDFJS_SRI.worker })
    if (!res.ok) throw new Error('No se pudo cargar el lector de PDF')
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(await res.blob())
    return lib
  }).catch(e => { pdfjsPromise = null; throw e })
  return pdfjsPromise
}

const AMOUNT_RE = /^-?\d{1,3}(\.\d{3})*,\d{2}$/
const DATE_RE   = /^(\d{2})\/(\d{2})\/(\d{4})$/

const parseAmount = s => parseFloat(s.replace(/\./g, '').replace(',', '.'))
const norm        = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

// items: [{ str, x, y }] de todas las páginas (y crece hacia arriba; páginas apiladas con offset).
export function parseRemittanceItems(items) {
  // \s también cubre los espacios no separables que usa el PDF en algunas etiquetas
  const clean = items.map(it => ({ ...it, str: it.str.replace(/\s+/g, ' ').trim() })).filter(it => it.str)

  // Cabecera de la tabla de pagos: fila con "Beneficiario" y "Cuenta del Beneficiario"
  const hdrBenef = clean.find(it => it.str === 'Beneficiario'
    && clean.some(o => /^Cuenta del Beneficiario$/i.test(o.str) && Math.abs(o.y - it.y) < 3))
  if (!hdrBenef) throw new Error('No parece un listado de pagos de remesa (no se encuentra la tabla "Pagos")')
  const hdrY  = hdrBenef.y
  const colX  = name => clean.find(o => o.str === name && Math.abs(o.y - hdrY) < 3)?.x
  const xIban    = colX('Cuenta del Beneficiario')
  const xConcept = colX('Concepto del Beneficiario')
  const xDate    = colX('Fecha de pago')
  if ([xIban, xConcept, xDate].some(v => v == null)) throw new Error('Formato de tabla no reconocido')

  // Total y nº de operaciones declarados en la cabecera (para comprobar que no falta nada)
  // Aparecen dos veces: en "Fichero" (valor en la línea de debajo) y en "Ordenante"
  // (valor a la derecha en la misma línea). Vale cualquiera de las dos.
  const above = clean.filter(it => it.y > hdrY)
  const declared = (labelRe, valueRe) => {
    for (const label of above.filter(it => labelRe.test(it.str))) {
      const sameRow = above.find(o => Math.abs(o.y - label.y) < 3 && o.x > label.x && valueRe.test(o.str))
      const below   = above.find(o => label.y - o.y > 3 && label.y - o.y < 20
        && Math.abs(o.x - label.x) < 60 && valueRe.test(o.str))
      if (sameRow || below) return (sameRow || below).str
    }
    return null
  }
  const totalStr      = declared(/^Importe total:?$/i, AMOUNT_RE)
  const countStr      = declared(/^Nº operaciones:?$/i, /^\d+$/)
  const declaredTotal = totalStr ? parseAmount(totalStr) : null
  const declaredCount = countStr ? parseInt(countStr, 10) : null

  // Filas: una por cada fecha en la columna "Fecha de pago"
  const body  = clean.filter(it => it.y < hdrY - 3)
  const dates = body.filter(it => DATE_RE.test(it.str) && it.x >= xDate - 10 && it.x < xDate + 60)
    .sort((a, b) => b.y - a.y)

  const payments = dates.map((d, i) => {
    const prevY = i > 0 ? dates[i - 1].y : hdrY
    const nextY = i < dates.length - 1 ? dates[i + 1].y : d.y - 20
    const top = (prevY + d.y) / 2
    const bot = (d.y + nextY) / 2
    const row = body.filter(it => it.y < top && it.y >= bot)
      .sort((a, b) => (b.y - a.y) || (a.x - b.x))

    const name    = row.filter(it => it.x < xIban - 5).sort((a, b) => a.x - b.x).map(it => it.str).join(' ')
    const iban    = row.filter(it => it.x >= xIban - 5 && it.x < xConcept - 5).map(it => it.str).join('').replace(/\s+/g, '')
    const concept = row.filter(it => it.x >= xConcept - 5 && it.x < xDate - 5).sort((a, b) => a.x - b.x).map(it => it.str).join(' ')
    const amountItem = row.find(it => it.x > d.x + 20 && AMOUNT_RE.test(it.str))
    const [, dd, mm, yyyy] = d.str.match(DATE_RE)
    return {
      name:    name.replace(/\s+/g, ' '),
      iban:    iban.toUpperCase(),
      concept: concept.replace(/\s+/g, ' '),
      date:    `${yyyy}-${mm}-${dd}`,
      amount:  amountItem ? parseAmount(amountItem.str) : null,
    }
  })

  const sum = Math.round(payments.reduce((t, p) => t + (p.amount || 0), 0) * 100) / 100
  const warnings = []
  if (payments.some(p => p.amount == null)) warnings.push('Hay pagos sin importe legible')
  if (declaredCount != null && declaredCount !== payments.length)
    warnings.push(`El listado declara ${declaredCount} operaciones y se han leído ${payments.length}`)
  if (declaredTotal != null && Math.abs(declaredTotal - sum) > 0.005)
    warnings.push(`El total declarado no coincide con la suma de los pagos`)

  const months = [...new Set(payments.map(p => p.date.slice(0, 7)))]
  return { payments, total: sum, declaredTotal, declaredCount, months, warnings }
}

// Lee un File (PDF) y devuelve el resultado de parseRemittanceItems.
export async function parseRemittancePdf(file) {
  const pdfjsLib = await loadPdfjs()
  const doc   = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const items = []
  let offset  = 0
  // Páginas apiladas: cada página por debajo de la anterior
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const h    = page.getViewport({ scale: 1 }).height
    const tc   = await page.getTextContent()
    for (const it of tc.items) items.push({ str: it.str, x: it.transform[4], y: it.transform[5] - offset })
    offset += h
  }
  return parseRemittanceItems(items)
}

// ─── Emparejar pagos con personas ───────────────────────────────────────────
// 1) IBAN igual al de la ficha; 2) nombre: todas las palabras del nombre de la ficha
// (o del nombre corto) aparecen en el beneficiario.
export function matchPayments(payments, people, personal) {
  const byIban = {}
  for (const p of people) {
    const iban = (personal[p.id]?.iban || '').replace(/\s+/g, '').toUpperCase()
    if (iban) byIban[iban] = p
  }
  const words = s => norm(s).split(/[^A-Z0-9]+/).filter(w => w.length > 1)

  return payments.map(pay => {
    if (byIban[pay.iban]) return { ...pay, person: byIban[pay.iban].id, by: 'iban' }
    const benef = new Set(words(pay.name))
    const cands = people.filter(p => {
      const full = words(personal[p.id]?.full_name || '')
      if (full.length && full.every(w => benef.has(w))) return true
      const short = words(p.name)
      return short.length > 0 && short.every(w => benef.has(w))
    })
    // Si varias encajan (p. ej. un nombre corto que es el segundo nombre de otra persona),
    // se queda la que coincide con la primera palabra del beneficiario.
    const first = words(pay.name)[0]
    const best  = cands.length > 1 ? cands.filter(p => words(p.name)[0] === first) : cands
    return best.length === 1
      ? { ...pay, person: best[0].id, by: 'nombre' }
      : { ...pay, person: null, by: best.length > 1 ? 'ambiguo' : null }
  })
}
