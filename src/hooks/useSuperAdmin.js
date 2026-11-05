import { useState, useEffect } from 'react'
import { fetchWithNonceRetry } from '../utils/wpNonce'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function useEndpoint(path, params = {}) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const query = new URLSearchParams(params).toString()
  const url   = `${CLUB_URL}/wp-json/superadmin/v1${path}${query ? '?' + query : ''}`

  useEffect(() => {
    setLoading(true)
    setError(null)
    // El nonce se lee de nuevo en cada intento (no al montar el hook), para que un reintento
    // tras refrescarlo (sesión abierta muchas horas — Ramiro, 5/11) use el nuevo de verdad.
    fetchWithNonceRetry(() => fetch(url, { headers: { 'X-WP-Nonce': window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || '' } }))
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
  const res = await fetchWithNonceRetry(() => fetch(`${CLUB_URL}/wp-json/superadmin/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || '' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }))
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
export const gestionEditarAlumno  = body => gestionPost('/gestion/editar-alumno', body)
export const gestionBuscarAlumno  = q    => gestionCall('GET', `/gestion/buscar-alumno?q=${encodeURIComponent(q)}`)

// 8.4: alumnos que pagan fuera de la web (sin suscripción de WooCommerce).
export const gestionExternosGet      = ()           => gestionCall('GET', '/gestion/externos')
export const gestionExternoCrear     = body         => gestionPost('/gestion/externos', body)
export const gestionExternoActualizar = (id, body)  => gestionCall('PUT', `/gestion/externos/${id}`, body)
export const gestionExternoBorrar    = id           => gestionCall('DELETE', `/gestion/externos/${id}`)
export const gestionExternoPago      = (id, body)   => gestionPost(`/gestion/externos/${id}/pago`, body)
export const gestionExternosImportar = body         => gestionPost('/gestion/externos/importar', body)

// "Mandar factura" (NOTAS_PARA_CODE_pestanas_grupos.md): pedidos de tarjeta ya cobrados de
// verdad (transaction_id de la pasarela) que WooCommerce dejó en "processing" sin completar.
export const gestionFacturasPendientesGet = () => gestionCall('GET', '/gestion/facturas-pendientes')
export const gestionFacturaCompletar = orderId => gestionPost(`/gestion/facturas-pendientes/${orderId}/completar`)

// Lista de espera por grupo (8.5: interesados que aún no son alumnos).
export const gestionListaEsperaGet         = ()          => gestionCall('GET', '/gestion/lista-espera')
export const gestionListaEsperaCrear       = body        => gestionPost('/gestion/lista-espera', body)
export const gestionListaEsperaActualizar  = (id, body)  => gestionCall('PUT', `/gestion/lista-espera/${id}`, body)
export const gestionListaEsperaBorrar      = id          => gestionCall('DELETE', `/gestion/lista-espera/${id}`)

// Remitentes de transferencias (banco) ya clasificados a mano (Clases/Eventos/...),
// compartido entre todos los superadmin en vez de guardarse por navegador.
export const gestionExpenseSendersGet = ()                       => gestionCall('GET', '/expenses/senders')
export const gestionExpenseSenderSet  = (sender, category)      => gestionPost('/expenses/senders', { sender, category })

// Campañas de WhatsApp (31/10, fase a: envío manual wa.me).
export const campanasContactosImportar = body                     => gestionPost('/campanas/contactos/importar', body)
export const campanasContactosGet      = (lista, tipo)            => gestionCall('GET', `/campanas/contactos?lista=${lista}&tipo=${tipo}`)
export const campanasContactoBorrar    = id                       => gestionCall('DELETE', `/campanas/contactos/${id}`)
export const campanasEnviosHoyGet      = ()                       => gestionCall('GET', '/campanas/envios-hoy')
export const campanasListar            = ()                       => gestionCall('GET', '/campanas')
export const campanasCrear             = body                     => gestionPost('/campanas', body)
export const campanasEditar            = (id, body)                => gestionCall('PUT', `/campanas/${id}`, body)
export const campanasDestinatarios     = id                       => gestionCall('GET', `/campanas/${id}/destinatarios`)
export const campanasMarcarAccion      = (id, contactoId, accion) => gestionPost(`/campanas/${id}/contactos/${contactoId}/accion`, { accion })
// Quita el "enviado" de TODOS los contactos de esta campaña de golpe (Ramiro, 3/11 12:10: quedaron
// marcados por pruebas, sin haberse enviado nada de verdad). No toca respondio/baja/apuntado.
export const campanasDeshacerEnviados  = id                       => gestionPost(`/campanas/${id}/deshacer-enviados`)
export const gestionBajasMotivo        = (meses = 12)              => gestionCall('GET', `/gestion/bajas-motivo?meses=${meses}`)

// Calendario de días especiales del club (NOTAS_PARA_CODE_calendario.md): festivos, cierres y
// horarios especiales, con una decisión (pendiente/abre/abre_horario_especial/cierra) por día.
export const clubDaysGet    = (desde = '', hasta = '') => gestionCall('GET', `/gestion/club-days${desde || hasta ? `?desde=${desde}&hasta=${hasta}` : ''}`)
export const clubDaysCrear  = body       => gestionPost('/gestion/club-days', body)
export const clubDaysEditar = (id, body) => gestionCall('PUT', `/gestion/club-days/${id}`, body)
export const clubDaysBorrar = id         => gestionCall('DELETE', `/gestion/club-days/${id}`)

// Histórico de pagos importado (NOTAS_PARA_CODE_hv_control_clientes.md) — solo lectura, nunca
// toca WooCommerce.
export const histPagosImportar = body => gestionPost('/gestion/hist-pagos/importar', body)
export const histPagosResumen  = (desde = '', hasta = '') => gestionCall('GET', `/gestion/hist-pagos/resumen${desde || hasta ? `?desde=${desde}&hasta=${hasta}` : ''}`)
// Histórico real de "mañanas" (clases antes de las 15:00, sin infantiles ni sábados) para la
// calculadora, en vez de los números a mano (NOTAS_PARA_CODE_hv_control_clientes.md, punto 2).
export const histPagosResumenMananas = (desde = '', hasta = '') => gestionCall('GET', `/gestion/hist-pagos/resumen-mananas${desde || hasta ? `?desde=${desde}&hasta=${hasta}` : ''}`)
// Permanencia, bajas tras verano, alumnos por profesor/clase/mes, uso de bonos (punto 5).
export const histPagosEstadisticas = () => gestionCall('GET', '/gestion/hist-pagos/estadisticas')

// Pagos adelantados (NOTAS_PARA_CODE_grupos_como_excel.md, 1/11 18:55): transferencia/bizum/
// tarjeta apuntados antes de que exista la renovación de WooCommerce.
export const gestionAdelantadosGet    = ()  => gestionCall('GET', '/gestion/adelantados')
export const gestionAdelantadoAnular  = id  => gestionPost(`/gestion/adelantados/${id}/anular`)

// Sync Grupos ⇄ Excel, bandeja "Cambios hechos en el Excel" (NOTAS_PARA_CODE_sync_grupos.md,
// paso 2) — Excel es un espejo que la web va comparando contra su última foto; lo que cambie se
// queda aquí para que Eva decida Aplicar o Descartar, nunca se escribe solo.
export const syncGruposConfigGet      = ()         => gestionCall('GET', '/gestion/sync-grupos/config')
export const syncGruposConfigSet      = body        => gestionPost('/gestion/sync-grupos/config', body)
export const syncGruposSincronizar    = ()         => gestionPost('/gestion/sync-grupos/sincronizar')
export const syncGruposCambiosGet     = (estado = 'pendiente') => gestionCall('GET', `/gestion/sync-grupos/cambios?estado=${estado}`)
export const syncGruposCambioAplicar  = id         => gestionPost(`/gestion/sync-grupos/cambios/${id}/aplicar`)
export const syncGruposCambioDescartar = id        => gestionPost(`/gestion/sync-grupos/cambios/${id}/descartar`)
// Reintentar a mano la escritura Web→Excel de un cobro concreto (3/11 12:29: para pagos que
// fallaron antes del arreglo de la pestaña, o que nunca pasaron por este camino).
export const syncGruposReintentarCobro = body       => gestionPost('/gestion/sync-grupos/reintentar-cobro', body)

// `from`: primer mes a incluir ('YYYY-MM', incluido) o '' para no limitar ("Todo").
export function useExpenses(from, entity = 'all', excludeInternal = true) {
  const [data,      setData]      = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const url = `${CLUB_URL}/wp-json/superadmin/v1/expenses?from=${from || ''}&entity=${entity}&exclude_internal=${excludeInternal ? 1 : 0}`

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchWithNonceRetry(() => fetch(url, { headers: { 'X-WP-Nonce': window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || '' } }))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(json => { setData(json.data ?? null); setBreakdown(json.breakdown ?? null); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [url])

  return { data, breakdown, loading, error }
}
