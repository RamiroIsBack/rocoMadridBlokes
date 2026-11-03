// Lector mínimo de .xlsx sin dependencias: un .xlsx es un zip con XML dentro.
// Se descomprime con DecompressionStream (nativo del navegador) y se lee la
// primera hoja como una matriz de filas → [ ['Tipo de gasto', 'ene', …], … ].

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Devuelve { 'xl/workbook.xml': Uint8Array, … }
async function unzip(buffer) {
  const view  = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  // Fin del directorio central: firma 0x06054b50, buscando desde el final
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('El archivo no es un Excel (.xlsx) válido')

  const count = view.getUint16(eocd + 10, true)
  let ptr     = view.getUint32(eocd + 16, true)
  const dec   = new TextDecoder()
  const files = {}

  for (let n = 0; n < count; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break
    const method   = view.getUint16(ptr + 10, true)
    const compSize = view.getUint32(ptr + 20, true)
    const nameLen  = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commLen  = view.getUint16(ptr + 32, true)
    const local    = view.getUint32(ptr + 42, true)
    const name     = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))
    ptr += 46 + nameLen + extraLen + commLen

    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data  = bytes.subarray(start, start + compSize)
    if (method === 0) files[name] = data
    else if (method === 8) files[name] = await inflateRaw(data)
  }
  return files
}

const colIndex = ref => {
  const letters = ref.match(/^[A-Z]+/)[0]
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

export async function readFirstSheet(file) {
  const files  = await unzip(await file.arrayBuffer())
  const dec    = new TextDecoder()
  const parse  = name => files[name] && new DOMParser().parseFromString(dec.decode(files[name]), 'application/xml')

  const shared = []
  const ss = parse('xl/sharedStrings.xml')
  if (ss) {
    for (const si of ss.getElementsByTagName('si')) {
      shared.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''))
    }
  }

  // Primera hoja según el libro (por si no se llama sheet1.xml)
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const wb   = parse('xl/workbook.xml')
  const rels = parse('xl/_rels/workbook.xml.rels')
  const first = wb?.getElementsByTagName('sheet')[0]
  if (first && rels) {
    const rid = first.getAttribute('r:id')
    const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid)
    const target = rel?.getAttribute('Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`
  }
  const sheet = parse(sheetPath)
  if (!sheet) throw new Error('No se encontró ninguna hoja en el Excel')

  const rows = []
  for (const row of sheet.getElementsByTagName('row')) {
    const r   = Number(row.getAttribute('r')) - 1
    const out = []
    for (const c of row.getElementsByTagName('c')) {
      const type = c.getAttribute('t')
      const v    = c.getElementsByTagName('v')[0]?.textContent
      let value
      if (type === 's')              value = shared[Number(v)]
      else if (type === 'inlineStr') value = [...c.getElementsByTagName('t')].map(t => t.textContent).join('')
      else if (type === 'str')       value = v
      else if (v != null && v !== '') value = Number(v)
      if (value !== undefined) out[colIndex(c.getAttribute('r'))] = value
    }
    rows[r] = out
  }
  return Array.from(rows, r => r || [])
}
