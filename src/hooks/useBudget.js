import { useState, useEffect, useCallback } from 'react'
import { salesByMonth } from '../utils/budget'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const BASE     = `${CLUB_URL}/wp-json/superadmin/v1`

function headers() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }
}

async function request(path, method = 'GET', body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return json
}

// { budget, items, months_loaded, income } de un año. income = 12 cifras de cobros por ventas del banco.
export function useBudget(year) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    return Promise.all([
      request(`/budget?year=${year}`),
      // Si falla, el presupuesto se ve igual, solo sin ingresos reales
      request(`/expenses?from=${year}-01&entity=all`).catch(() => null),
    ])
      .then(([json, exp]) => setData({ ...json, income: exp ? salesByMonth(exp.data, year) : null }))
      .catch(e   => setError(e.message))
      .finally(() => setLoading(false))
  }, [year])

  useEffect(() => { reload() }, [reload])
  return { data, loading, error, reload }
}

export const saveBudget = (year, lines, file) => request('/budget', 'POST', { year, lines, file })

// Reglas aprendidas "concepto → categoría"
export const getExpenseRules  = () => request('/expense-rules').then(j => j.rules || {})
export const saveExpenseRules = (rules) => request('/expense-rules', 'POST', { rules }).then(j => j.rules || {})

// Cambia la categoría de un movimiento ya guardado y, si se pasa ruleKey, la recuerda para próximas importaciones.
export const setItemCategory = (item, category, ruleKey) =>
  request('/expense-item-category', 'POST', {
    month: item.month, entity: item.entity, key: item.key, category, rule_key: ruleKey || '',
  })
