import { useState, useEffect } from 'react'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function useEndpoint(path, params = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const query = new URLSearchParams(params).toString()
  const url   = `${CLUB_URL}/wp-json/superadmin/v1${path}${query ? '?' + query : ''}`

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(url, { headers: { 'X-WP-Nonce': nonce } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => { setData(json.data ?? json); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [url, reloadKey])

  return { data, loading, error, refetch: () => setReloadKey(k => k + 1) }
}

export function useRevenue(months, excludeTransfer = false) {
  return useEndpoint('/revenue', { months, exclude_transfer: excludeTransfer ? 1 : 0 })
}

export function useProducts(months) {
  return useEndpoint('/products', { months })
}

export function useClasses(months) {
  return useEndpoint('/classes', { months })
}

export function usePeopleSummary() {
  return useEndpoint('/people-summary')
}

export function useGestionGrupos(months = 4) {
  return useEndpoint('/gestion/grupos', { months })
}

async function gestionCall(method, path, body) {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const res = await fetch(`${CLUB_URL}/wp-json/superadmin/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
  return json?.data ?? json
}
const gestionPost = (path, body) => gestionCall('POST', path, body)

export const gestionMarcarCobrado = body => gestionPost('/gestion/marcar-cobrado', body)
export const gestionPausar        = body => gestionPost('/gestion/pausar', body)
export const gestionReanudar      = body => gestionPost('/gestion/reanudar', body)
export const gestionNota          = body => gestionPost('/gestion/nota', body)
export const gestionDarDeBaja     = body => gestionPost('/gestion/dar-de-baja', body)
export const gestionFusionar      = body => gestionPost('/gestion/fusionar', body)
export const gestionExento        = body => gestionPost('/gestion/exento', body)
export const gestionCambiarGrupo  = body => gestionPost('/gestion/cambiar-grupo', body)
export const gestionOptinWhatsapp = body => gestionPost('/gestion/optin-whatsapp', body)

// 8.4: alumnos que pagan fuera de la web (sin suscripción de WooCommerce).
export const gestionExternosGet      = ()           => gestionCall('GET', '/gestion/externos')
export const gestionExternoCrear     = body         => gestionPost('/gestion/externos', body)
export const gestionExternoActualizar = (id, body)  => gestionCall('PUT', `/gestion/externos/${id}`, body)
export const gestionExternoBorrar    = id           => gestionCall('DELETE', `/gestion/externos/${id}`)
export const gestionExternoPago      = (id, body)   => gestionPost(`/gestion/externos/${id}/pago`, body)
export const gestionExternosImportar = body         => gestionPost('/gestion/externos/importar', body)

// Remitentes de transferencias (banco) ya clasificados a mano (Clases/Eventos/...),
// compartido entre todos los superadmin en vez de guardarse por navegador.
export const gestionExpenseSendersGet = ()                       => gestionCall('GET', '/expenses/senders')
export const gestionExpenseSenderSet  = (sender, category)      => gestionPost('/expenses/senders', { sender, category })

// Campañas de WhatsApp (31/10, fase a: envío manual wa.me).
export const campanasContactosImportar = body                     => gestionPost('/campanas/contactos/importar', body)
export const campanasContactosGet      = (lista, tipo)            => gestionCall('GET', `/campanas/contactos?lista=${lista}&tipo=${tipo}`)
export const campanasEnviosHoyGet      = ()                       => gestionCall('GET', '/campanas/envios-hoy')
export const campanasListar            = ()                       => gestionCall('GET', '/campanas')
export const campanasCrear             = body                     => gestionPost('/campanas', body)
export const campanasEditar            = (id, body)                => gestionCall('PUT', `/campanas/${id}`, body)
export const campanasDestinatarios     = id                       => gestionCall('GET', `/campanas/${id}/destinatarios`)
export const campanasMarcarAccion      = (id, contactoId, accion) => gestionPost(`/campanas/${id}/contactos/${contactoId}/accion`, { accion })
export const gestionBajasMotivo        = (meses = 12)              => gestionCall('GET', `/gestion/bajas-motivo?meses=${meses}`)

// `from`: primer mes a incluir ('YYYY-MM', incluido) o '' para no limitar ("Todo").
export function useExpenses(from, entity = 'all', excludeInternal = true) {
  const [data,      setData]      = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  const url = `${CLUB_URL}/wp-json/superadmin/v1/expenses?from=${from || ''}&entity=${entity}&exclude_internal=${excludeInternal ? 1 : 0}`

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(url, { headers: { 'X-WP-Nonce': nonce } })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(json => { setData(json.data ?? null); setBreakdown(json.breakdown ?? null); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [url])

  return { data, breakdown, loading, error }
}
