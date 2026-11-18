import { useState, useEffect } from 'react'
import { fetchWithNonceRetry } from '../utils/wpNonce'

const CLUB_URL = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'

function useEndpoint(path, params = {}) {
  const [data, setData]       = useState(null)
  const [raw, setRaw]         = useState(null)
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
      .then(json => { setData(json.data ?? json); setRaw(json); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [url, reloadKey])

  return { data, raw, loading, error, refetch: () => setReloadKey(k => k + 1) }
}

export function useRevenue(months, excludeTransfer = false) {
  return useEndpoint('/revenue', { months, exclude_transfer: excludeTransfer ? 1 : 0 })
}

export function useProducts(months) {
  return useEndpoint('/products', { months })
}

// "Desglose de ingresos" (NOTAS_PARA_CODE_ingresos_superadmin.md, 15/11 09:02).
export function useIngresosDesglose(months, excludeTransfer = false) {
  return useEndpoint('/ingresos/desglose', { months, exclude_transfer: excludeTransfer ? 1 : 0 })
}
export const ingresosFamiliaSet = body => gestionPost('/ingresos/familia', body)

export function useClasses(months) {
  const { data, raw, loading, error, refetch } = useEndpoint('/classes', { months })
  // "Dos suscripciones activas de la misma clase" (cowork/Ramiro, 15/11 07:50 punto A): no se
  // cancela nada solo, solo se avisa para que Ramiro decida.
  return {
    data, loading, error, refetch,
    duplicadosMismaClase: raw?.duplicadosMismaClase || [],
    // Gente de hist-pagos sin ninguna suscripción de WooCommerce emparejada (15/11 11:15):
    // informativo, nunca cuenta como alta.
    externosSinEmparejar: raw?.externosSinEmparejar || 0,
    // Pestañas del Excel de Grupos con pago este mes que no casaron con ninguna clase conocida
    // (15/11 §17:50 punto 9, mismo reparto que ya usa Superadmin › Clases) — cada clase ya trae
    // su `activosFuera` sumado en `data`, esto es solo el detalle de lo que quedó sin repartir.
    pestanasSinRepartir: raw?.pestanasSinRepartir || 0,
    pestanasSinRepartirDetalle: raw?.pestanasSinRepartirDetalle || [],
  }
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
  if (!res.ok) {
    const err = new Error(json?.message || `HTTP ${res.status}`)
    // 18/11 (cowork, GRAVE: 499 "pago nuevo" viejos): el código del WP_Error (p. ej.
    // "mes_antiguo") hace falta para que el frontend pueda reaccionar al bloqueo sin tener que
    // adivinarlo del texto del mensaje.
    err.code = json?.code
    throw err
  }
  return json?.data ?? json
}
const gestionPost = (path, body) => gestionCall('POST', path, body)

export const gestionMarcarCobrado = body => gestionPost('/gestion/marcar-cobrado', body)
// "Vuelve tras lesión/ausencia" (17/11 19:10, Ramiro): anula los pedidos de los meses que no
// vino, cobra el actual con el importe/método de Eva y reactiva, todo en la misma suscripción.
export const gestionVuelveTrasLesion = body => gestionPost('/gestion/vuelve-tras-lesion', body)
export const gestionPausar        = body => gestionPost('/gestion/pausar', body)
export const gestionReanudar      = body => gestionPost('/gestion/reanudar', body)
export const gestionNota          = body => gestionPost('/gestion/nota', body)
export const gestionDarDeBaja     = body => gestionPost('/gestion/dar-de-baja', body)
export const gestionFusionar      = body => gestionPost('/gestion/fusionar', body)
export const gestionExento        = body => gestionPost('/gestion/exento', body)
export const gestionCambiarGrupo  = body => gestionPost('/gestion/cambiar-grupo', body)
export const gestionOptinWhatsapp = body => gestionPost('/gestion/optin-whatsapp', body)
export const gestionEditarAlumno  = body => gestionPost('/gestion/editar-alumno', body)
// Wellhub + «Bajo tarifa» en Grupos (16/11 07:35).
export const gestionGrupoWellhubSet    = body => gestionPost('/gestion/grupos/wellhub', body)
export const gestionGrupoWellhubChecks = body => gestionPost('/gestion/grupos/wellhub-checkins', body)
export const gestionGrupoBajoTarifaSet = body => gestionPost('/gestion/grupos/bajo-tarifa', body)
export const gestionBuscarAlumno  = q    => gestionCall('GET', `/gestion/buscar-alumno?q=${encodeURIComponent(q)}`)
// Crear cliente nuevo en WooCommerce desde "Añadir alumno" (Ramiro, 07/11 08:06).
export const gestionAltaCliente   = body => gestionPost('/gestion/alta-cliente', body)

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

// "Pendientes de cobro" (NOTAS_PARA_CODE_alumnos_clases_fuente_de_verdad.md, 14/11 18:05).
export function usePendientesCobro() {
  return useEndpoint('/alumnos/pendientes-cobro')
}
export const gestionPendienteCobroViene     = body => gestionPost('/alumnos/pendientes-cobro/viene', body)
export const gestionPendienteCobroRecordado = body => gestionPost('/alumnos/pendientes-cobro/recordado', body)
export const gestionProfesTelefonosGet = () => gestionCall('GET', '/gestion/profes-telefonos')
export const gestionProfesTelefonoSet  = body => gestionPost('/gestion/profes-telefonos', body)

// Pestaña "Bajas" de Grupos (NOTAS_PARA_CODE_alumnos_clases_fuente_de_verdad.md, 15/11 08:45).
export function useBajas() {
  return useEndpoint('/gestion/bajas')
}
export const gestionBajaMotivoSet   = body => gestionPost('/gestion/bajas/motivo', body)
export const gestionBajaContacto    = body => gestionPost('/gestion/bajas/contacto', body)

// Superadmin › Clases: retención + rentabilidad real (15/11 08:45 punto D + 09:10).
export function useClasesRetencion(months = 12, mes = '') {
  return useEndpoint('/clases-retencion', { months, ...(mes ? { mes } : {}) })
}

// "Alumnos con pago en curso" (Ramiro, 15/11 16:30) — sustituye a la tabla "Por mes".
export function useClasesPagoEnCurso(categoria = 'todos') {
  return useEndpoint('/clases-pago-en-curso', { categoria })
}

// Lista de espera por grupo (8.5: interesados que aún no son alumnos).
export const gestionListaEsperaGet         = ()          => gestionCall('GET', '/gestion/lista-espera')
export const gestionListaEsperaCrear       = body        => gestionPost('/gestion/lista-espera', body)
export const gestionListaEsperaActualizar  = (id, body)  => gestionCall('PUT', `/gestion/lista-espera/${id}`, body)
export const gestionListaEsperaBorrar      = id          => gestionCall('DELETE', `/gestion/lista-espera/${id}`)

// Remitentes de transferencias (banco) ya clasificados a mano (Clases/Eventos/...),
// compartido entre todos los superadmin en vez de guardarse por navegador.
export const gestionExpenseSendersGet = ()                       => gestionCall('GET', '/expenses/senders')
export const gestionExpenseSenderSet  = (sender, category)      => gestionPost('/expenses/senders', { sender, category })

// Notas de "Variaciones a revisar" (gastos_banco.md punto 8) -- compartidas en servidor, no en
// el navegador de quien las escribió.
export const gestionExpenseVariacionesGet = ()               => gestionCall('GET', '/expenses/variaciones')
export const gestionExpenseVariacionSet   = (key, nota)      => gestionPost('/expenses/variaciones', { key, nota })

// Campañas de WhatsApp (31/10, fase a: envío manual wa.me).
export const campanasContactosImportar = body                     => gestionPost('/campanas/contactos/importar', body)
export const campanasContactosGet      = (lista, tipo)            => gestionCall('GET', `/campanas/contactos?lista=${lista}&tipo=${tipo}`)
export const campanasContactoBorrar    = id                       => gestionCall('DELETE', `/campanas/contactos/${id}`)
// Ramiro 12/11 15:52: "menor" por el alumno (grupo niños/adolescentes), no por de quién es el
// teléfono — un número de padre/madre puede quedar como "adulto" por error.
export const campanasReclasificarTipo  = ()                       => gestionPost('/campanas/contactos/reclasificar-tipo')
export const campanasEnviosHoyGet      = ()                       => gestionCall('GET', '/campanas/envios-hoy')
export const campanasListar            = ()                       => gestionCall('GET', '/campanas')
export const campanasCrear             = body                     => gestionPost('/campanas', body)
export const campanasEditar            = (id, body)                => gestionCall('PUT', `/campanas/${id}`, body)
export const campanasDestinatarios     = id                       => gestionCall('GET', `/campanas/${id}/destinatarios`)
export const campanasMarcarAccion      = (id, contactoId, accion) => gestionPost(`/campanas/${id}/contactos/${contactoId}/accion`, { accion })
// Quita el "enviado" de TODOS los contactos de esta campaña de golpe (Ramiro, 3/11 12:10: quedaron
// marcados por pruebas, sin haberse enviado nada de verdad). No toca respondio/baja/apuntado.
export const campanasDeshacerEnviados  = id                       => gestionPost(`/campanas/${id}/deshacer-enviados`)
// Trazabilidad (11/11): cruce indirecto por teléfono, para quien no hizo clic pero volvió igual.
export const campanasRecalcularIndirectas = id                    => gestionPost(`/campanas/${id}/recalcular-indirectas`)
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
// 18/11 (cowork, GRAVE): confirmarMesAntiguo=true solo cuando alguien ya confirmó a propósito
// que quiere aplicar un "pago nuevo" de hace más de 2 meses (ver mes_antiguo en el backend).
export const syncGruposCambioAplicar  = (id, confirmarMesAntiguo = false) => gestionPost(`/gestion/sync-grupos/cambios/${id}/aplicar`, confirmarMesAntiguo ? { confirmarMesAntiguo: true } : undefined)
// Diagnóstico de un "pago nuevo" viejo concreto: qué hay guardado en la foto (snapshot) de esa
// fila para ver por qué se disparó como "nuevo" — para no adivinar la causa sin datos reales.
export const syncGruposDiagnosticoPagoViejo = (limit = 15) => gestionCall('GET', `/gestion/sync-grupos/diagnostico-pago-viejo?limit=${limit}`)
// 18/11 (arreglado tras el aviso de cowork 09:30): descarta de golpe los "pago nuevo"
// pendientes que YA estén cobrados de verdad en la web para ese mes (nunca contra la foto/Excel).
export const syncGruposLimpiarPagoNuevoMismoImporte = () => gestionPost('/gestion/sync-grupos/limpiar-pago-nuevo-mismo-importe')
// 18/11 09:30 (cowork, GRAVE): deshace la limpieza rota (comparaba contra el Excel y descartó
// pagos reales) — reabre todo lo descartado por ese motivo y lo reevalúa ya contra la web.
export const syncGruposDeshacerLimpiezaMismoImporte = () => gestionPost('/gestion/sync-grupos/deshacer-limpieza-mismo-importe')
// 18/11 10:45 (cowork, URGENTE — GRAVE): lista todo lo que el auto-aplicado (ya desactivado)
// llegó a escribir de verdad en WooCommerce (facturas Verifactu incluidas), para revisar con
// la asesoría si hay que rectificar algo con la AEAT.
export const syncGruposInformeAutoaplicados = () => gestionCall('GET', '/gestion/sync-grupos/informe-autoaplicados')
export const syncGruposCambioDescartar = id        => gestionPost(`/gestion/sync-grupos/cambios/${id}/descartar`)
// Limpieza única (17/11 16:20, cowork): descarta de golpe las propuestas pendientes de pestañas
// Balance y los "pago nuevo" de meses viejos que ya estaban colgando ANTES de 589ab3a.
export const syncGruposLimpiarPendientesViejos = () => gestionPost('/gestion/sync-grupos/limpiar-pendientes-589ab3a')
// 17/11 18:15 (cowork): reintenta de golpe los "Cobro web sin fila" con la búsqueda por teléfono
// en otras pestañas, que esos pendientes viejos no tuvieron.
export const syncGruposReevaluarSinFila = () => gestionPost('/gestion/sync-grupos/reevaluar-sin-fila')
// 18/11 (cowork): corrige el método guardado en los "pago nuevo" pendientes de antes del
// arreglo de "TA"=tarjeta, releyendo la fila de verdad en el Excel.
export const syncGruposReevaluarMetodoPago = () => gestionPost('/gestion/sync-grupos/reevaluar-metodo-pago')
// Reintentar a mano la escritura Web→Excel de un cobro concreto (3/11 12:29: para pagos que
// fallaron antes del arreglo de la pestaña, o que nunca pasaron por este camino).
export const syncGruposReintentarCobro = body       => gestionPost('/gestion/sync-grupos/reintentar-cobro', body)

// `from`: primer mes a incluir ('YYYY-MM', incluido) o '' para no limitar ("Todo").
export function useExpenses(from, entity = 'all', excludeInternal = true) {
  const [data,      setData]      = useState(null)
  const [breakdown, setBreakdown] = useState(null)
  const [saldoReal, setSaldoReal] = useState(null)
  const [cuadre,    setCuadre]    = useState(null)
  const [cuadreRocoteca, setCuadreRocoteca] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const url = `${CLUB_URL}/wp-json/superadmin/v1/expenses?from=${from || ''}&entity=${entity}&exclude_internal=${excludeInternal ? 1 : 0}`

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchWithNonceRetry(() => fetch(url, { headers: { 'X-WP-Nonce': window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || '' } }))
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(json => { setData(json.data ?? null); setBreakdown(json.breakdown ?? null); setSaldoReal(json.saldoReal ?? null); setCuadre(json.cuadre ?? null); setCuadreRocoteca(json.cuadreRocoteca ?? null); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [url, reloadKey])

  return { data, breakdown, saldoReal, cuadre, cuadreRocoteca, loading, error, refetch: () => setReloadKey(k => k + 1) }
}

// POST /expenses/apertura -- saldo de apertura (1/1) editable de una entidad/año (Club por
// defecto; también Rocoteca desde 15/11 11:45).
export const expensesAperturaSet = (year, entity, saldo) => gestionPost('/expenses/apertura', { year, entity, saldo })
