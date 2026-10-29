import { useState, useEffect, useCallback } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1`

function headers() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }
}

async function request(path, method = 'GET', body) {
  const res  = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return json
}

// Documento de Proyectos: { zones: [...], rev, updated_at, by } (solo socios)
export function useProjects() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return request('/projects')
      .then(json => setData(json.projects))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload }
}

// Guarda el documento entero. rev = el que se cargó; si otro socio guardó antes, 409.
export const saveProjects = (zones, rev) =>
  request('/projects', 'PUT', { zones, rev }).then(json => json.projects)

export const STATUSES = [
  { id: 'pedir',      label: 'Pedir presupuesto' },
  { id: 'pendiente',  label: 'Pendiente'  },
  { id: 'aprobado',   label: 'Aprobado'   },
  { id: 'comprado',   label: 'Comprado'   },
  { id: 'descartado', label: 'Descartado' },
]
export const statusLabel = id => STATUSES.find(s => s.id === id)?.label || id
export const nextStatus  = id => STATUSES[(STATUSES.findIndex(s => s.id === id) + 1) % STATUSES.length].id

// Cantidades que se pueden atar a las medidas de la zona (techo = suelo)
export const QTY_REFS = [
  { id: '',          label: 'Fija' },
  { id: 'suelo',     label: 'm² suelo / techo' },
  { id: 'perimetro', label: 'm perímetro' },
  { id: 'paredes',   label: 'm² paredes' },
]

export function zoneMeasures(zone) {
  const { largo, ancho, alto } = zone.measures || {}
  const suelo     = largo && ancho ? largo * ancho : null
  const perimetro = largo && ancho ? 2 * (largo + ancho) : null
  const paredes   = perimetro && alto ? perimetro * alto : null
  return { suelo, perimetro, paredes }
}

const round2 = n => Math.round(n * 100) / 100

export function itemQty(item, measures) {
  if (!item.qty_ref) return item.qty
  const base = measures[item.qty_ref]
  return base == null ? item.qty : round2(base * (item.qty_factor || 1))
}

// Si ya hay precio conseguido (presupuesto real), manda sobre el propuesto
export const itemPrice  = item => item.price_got ?? item.price
export const itemAmount = (item, measures) => round2(itemQty(item, measures) * itemPrice(item))

export const emptyItem = () => ({
  id: newId(), concept: 'Nueva partida', description: '', qty: 1, qty_ref: '', qty_factor: 1, unit: 'ud',
  price: 0, price_got: null, price_type: '', status: 'pendiente',
  supplier: '', source_name: '', source: '', checked_at: '', note: '',
})

// Totales por estado; lo descartado no suma al total
export function zoneTotals(zone) {
  const m = zoneMeasures(zone)
  const t = { total: 0, pedir: 0, pendiente: 0, aprobado: 0, comprado: 0, descartado: 0 }
  for (const c of zone.chapters) for (const it of c.items) {
    const a = itemAmount(it, m)
    t[it.status] += a
    if (it.status !== 'descartado') t.total += a
  }
  return t
}

export const chapterTotal = (chapter, measures) =>
  chapter.items.filter(it => it.status !== 'descartado').reduce((s, it) => s + itemAmount(it, measures), 0)

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
