import { useState, useEffect, useMemo, useRef } from 'react'
import {
  usePresupuestos, createZona, updateZona, deleteZona,
  createPartida, updatePartida, deletePartida, importarPartidas,
} from '../hooks/usePresupuestos'
import {
  ESTADOS, ESTADO_LABEL, TIPOS, TIPO_BY_KEY, MEDIDAS, UNIDADES,
  isActiva, isAceptada, isHecha, isPorHacer, CAP_INMEDIATAS, medidaZona, cantidad, precioFinal, importePropuesto, importeFinal,
  totales, porCapitulo, fmtEur, fmtCant, fmtFecha, fmtMedidas, textoMedidas, parsePrecio, dominio, urlSegura, exportar,
} from '../utils/presupuestos'
import './PresupuestosSection.css'

const TAB_KEY = 'presup-tab'

function hoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tabInicial() {
  if (window.location.hash === '#general') return 'general'
  try { return localStorage.getItem(TAB_KEY) || 'general' } catch { return 'general' }
}

// ─── Sección ─────────────────────────────────────────────────────────────────
export default function PresupuestosSection() {
  const { data, setData, loading, error } = usePresupuestos()
  const [tab, setTab]         = useState(tabInicial)
  const [filtro, setFiltro]   = useState('todas')
  const [canEdit, setCanEdit] = useState(true)
  const [aviso, setAviso]     = useState(null)
  const [partidaForm, setPartidaForm] = useState(null)   // partida | { nueva }
  const [zonaForm, setZonaForm]       = useState(null)   // zona | {}
  const [nuevaInmediata, setNuevaInmediata] = useState(false)
  const fileRef = useRef(null)

  const zonas    = useMemo(() => [...(data?.zonas || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0)), [data])
  const partidas = data?.partidas || []
  const zonaDe   = useMemo(() => Object.fromEntries(zonas.map(z => [z.id, z])), [zonas])
  const zona     = zonaDe[tab]
  // Una partida se edita con su zona, también desde Actuaciones inmediatas
  const zonaPartida = partidaForm && (zonaDe[partidaForm.zona_id] || zona)
  const nPorHacer   = partidas.filter(isPorHacer).length

  // Si la pestaña guardada ya no existe, al resumen
  useEffect(() => { if (data && tab !== 'general' && tab !== 'inmediatas' && !zonaDe[tab]) setTab('general') }, [data, tab, zonaDe])

  function abrir(key) {
    setTab(key)
    setFiltro('todas')
    try { localStorage.setItem(TAB_KEY, key) } catch {}
  }

  // Si el servidor rechaza por permisos, la vista pasa a solo lectura
  function fallo(e) {
    if (e.status === 401 || e.status === 403) setCanEdit(false)
    setAviso({ tipo: 'error', texto: e.message })
  }

  function ponPartida(p) {
    setData(d => ({ ...d, partidas: d.partidas.some(x => x.id === p.id) ? d.partidas.map(x => x.id === p.id ? p : x) : [...d.partidas, p] }))
  }

  async function guardarCampo(p, fields) {
    try { ponPartida(await updatePartida(p.id, fields)) } catch (e) { fallo(e) }
  }

  async function guardarPartida(form) {
    const p = form.id ? await updatePartida(form.id, form) : await createPartida(form)
    ponPartida(p)
    setPartidaForm(null)
    setNuevaInmediata(false)
  }

  async function borrarPartida(id) {
    await deletePartida(id)
    setData(d => ({ ...d, partidas: d.partidas.filter(x => x.id !== id) }))
    setPartidaForm(null)
  }

  async function guardarZona(form) {
    if (form.id) {
      const z = await updateZona(form.id, form)
      setData(d => ({ ...d, zonas: d.zonas.map(x => x.id === z.id ? z : x) }))
    } else {
      const z = await createZona(form)
      setData(d => ({ ...d, zonas: [...d.zonas, z] }))
      abrir(z.id)
    }
    setZonaForm(null)
  }

  async function borrarZona(id) {
    await deleteZona(id)
    setData(d => ({ zonas: d.zonas.filter(x => x.id !== id), partidas: d.partidas.filter(x => x.zona_id !== id) }))
    setZonaForm(null)
    abrir('general')
  }

  // Importar partidas: uno o varios JSON { zona, capitulos } (o una lista de ellos)
  async function importar(files) {
    const lineas = []
    for (const f of files) {
      let json
      try { json = JSON.parse(await f.text()) } catch { lineas.push(`${f.name}: no es un JSON válido`); continue }
      for (const item of Array.isArray(json) ? json : [json]) {
        try {
          const r = await importarPartidas(item)
          setData({ zonas: r.zonas, partidas: r.partidas })
          lineas.push(`${r.zona.nombre}${r.creada ? ' (zona nueva)' : ''}: ${r.added} añadidas` +
            (r.skipped ? `, ${r.skipped} ya estaban` : '') + (r.invalid ? `, ${r.invalid} no válidas` : ''))
        } catch (e) {
          if (e.status === 401 || e.status === 403) setCanEdit(false)
          lineas.push(`${f.name}: ${e.message}`)
        }
      }
    }
    setAviso({ tipo: 'ok', texto: lineas.join(' · ') })
  }

  function descargar() {
    const blob = new Blob([JSON.stringify(exportar(zonas, partidas), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `presupuestos-${hoy()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (loading && !data) return <div className="sa-loading">Cargando…</div>
  if (error && !data)   return <div className="sa-error">Error: {error}</div>

  return (
    <section className="sa-section ps">
      <div className="sa-section__header">
        <h2 className="sa-section-title">Presupuestos por zonas</h2>
        <div className="sa-header-controls">
          {canEdit && (
            <>
              <button className="ps-btn" onClick={() => fileRef.current?.click()}>Importar</button>
              <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden
                onChange={e => { importar([...e.target.files]); e.target.value = '' }} />
            </>
          )}
          <button className="ps-btn" onClick={descargar} disabled={!zonas.length}>Exportar</button>
        </div>
      </div>

      {aviso && (
        <div className={`ps-aviso ps-aviso--${aviso.tipo}`}>
          <span>{aviso.texto}</span>
          <button className="ps-link" onClick={() => setAviso(null)}>Cerrar</button>
        </div>
      )}

      <div className="ps-tabs">
        <button className={`ps-tab${tab === 'general' ? ' ps-tab--active' : ''}`} onClick={() => abrir('general')}>Resumen general</button>
        <button className={`ps-tab ps-tab--inmediatas${tab === 'inmediatas' ? ' ps-tab--active' : ''}`} onClick={() => abrir('inmediatas')}>
          ⚡ Actuaciones inmediatas{nPorHacer > 0 && <span className="ps-tab__n">{nPorHacer}</span>}
        </button>
        {zonas.map(z => (
          <button key={z.id} className={`ps-tab${tab === z.id ? ' ps-tab--active' : ''}`} onClick={() => abrir(z.id)}>{z.nombre}</button>
        ))}
        {canEdit && <button className="ps-tab ps-tab--new" onClick={() => setZonaForm({})}>+ Nueva zona</button>}
      </div>

      {tab === 'inmediatas'
        ? <InmediatasView
            zonas={zonas} partidas={partidas} zonaDe={zonaDe} canEdit={canEdit}
            onCampo={guardarCampo}
            onEditar={p => setPartidaForm(p)}
            onNueva={() => setNuevaInmediata(true)}
          />
        : zona
        ? <ZonaView
            zona={zona} zonaDe={zonaDe} partidas={partidas.filter(p => p.zona_id === zona.id)}
            filtro={filtro} setFiltro={setFiltro} canEdit={canEdit}
            onCampo={guardarCampo}
            onEditar={p => setPartidaForm(p)}
            onNueva={() => setPartidaForm({ nueva: true })}
            onEditarZona={() => setZonaForm(zona)}
          />
        : <ResumenGeneral zonas={zonas} partidas={partidas} zonaDe={zonaDe} onAbrir={abrir} />}

      <p className="ps-pie">
        Precios con IVA incluido salvo que la partida diga otra cosa. «Referencia» es un precio de catálogo o de una
        guía de precios encontrado en la fuente indicada; «Estimación» es un cálculo propio para tener un orden de
        magnitud; «Presupuesto» es una oferta recibida de un proveedor. Cambia la partida a «Presupuesto» cuando
        llegue la oferta real.
      </p>

      {partidaForm && zonaPartida && (
        <PartidaModal
          inicial={partidaForm} zona={zonaPartida}
          capitulos={[...new Set(partidas.filter(p => p.zona_id === zonaPartida.id).map(p => p.capitulo))]}
          onGuardar={guardarPartida} onBorrar={borrarPartida} onCerrar={() => setPartidaForm(null)} onFallo={fallo}
        />
      )}
      {nuevaInmediata && (
        <InmediataModal zonas={zonas} onGuardar={guardarPartida} onCerrar={() => setNuevaInmediata(false)} onFallo={fallo} />
      )}
      {zonaForm && (
        <ZonaModal inicial={zonaForm} onGuardar={guardarZona} onBorrar={borrarZona} onCerrar={() => setZonaForm(null)} onFallo={fallo} />
      )}
    </section>
  )
}

function Kpi({ label, value, color }) {
  return (
    <div className="sa-kpi" style={color ? { '--kpi-color': color } : undefined}>
      <span className="sa-kpi__value">{value}</span>
      <span className="sa-kpi__label">{label}</span>
    </div>
  )
}

const VERDE = '#34d399'

// ─── Resumen general ─────────────────────────────────────────────────────────
function ResumenGeneral({ zonas, partidas, zonaDe, onAbrir }) {
  const t = totales(partidas, zonaDe)
  const aceptadas = zonas
    .map(z => ({ zona: z, items: partidas.filter(p => p.zona_id === z.id && isAceptada(p)) }))
    .filter(g => g.items.length)

  return (
    <div className="ps-general">
      <p className="ps-kicker">Presupuesto general de actuaciones</p>
      <h3 className="ps-titulo">Todas las zonas</h3>
      <p className="ps-sub">
        Suma de las partidas activas de cada zona (sin descartadas). «Final» usa el precio conseguido cuando lo hay
        y, si no, el propuesto.
      </p>

      <div className="sa-kpis ps-kpis">
        <Kpi label="Propuesto" value={fmtEur(t.propuesto)} color="#a8a29e" />
        <Kpi label="Final previsto" value={fmtEur(t.final)} />
        <Kpi label="Ahorro conseguido" value={fmtEur(t.ahorro)} color={VERDE} />
        <Kpi label="Aceptado" value={fmtEur(t.aceptado)} color={VERDE} />
      </div>
      <p className="ps-nota">Base imponible del final previsto: {fmtEur(t.base)} · IVA recuperable: {fmtEur(t.iva)}</p>

      {zonas.length === 0 ? (
        <p className="ps-vacio">Aún no hay zonas. Crea la primera con «+ Nueva zona» o carga partidas con «Importar».</p>
      ) : (
        <div className="ps-table-wrap">
          <table className="ps-table ps-table--resumen">
            <thead>
              <tr><th>Zona</th><th className="num">Partidas</th><th className="num">Propuesto</th><th className="num">Final previsto</th><th className="num">Ahorro</th><th className="num">Aceptadas</th></tr>
            </thead>
            <tbody>
              {zonas.map(z => {
                const tz = totales(partidas.filter(p => p.zona_id === z.id), zonaDe)
                return (
                  <tr key={z.id}>
                    <td>
                      <button className="ps-link ps-link--zona" onClick={() => onAbrir(z.id)}>{z.nombre}</button>
                      <span className="ps-gris">{textoMedidas(z)}</span>
                    </td>
                    <td className="num">{tz.nActivas}</td>
                    <td className="num">{fmtEur(tz.propuesto)}</td>
                    <td className="num"><strong>{fmtEur(tz.final)}</strong></td>
                    <td className="num ps-verde">{fmtEur(tz.ahorro)}</td>
                    <td className="num ps-verde">{tz.nAceptadas} · {fmtEur(tz.aceptado)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td><td className="num">{t.nActivas}</td><td className="num">{fmtEur(t.propuesto)}</td>
                <td className="num"><strong>{fmtEur(t.final)}</strong></td><td className="num ps-verde">{fmtEur(t.ahorro)}</td>
                <td className="num ps-verde">{t.nAceptadas} · {fmtEur(t.aceptado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <h4 className="ps-h4">Partidas aceptadas</h4>
      {aceptadas.length === 0 ? (
        <p className="ps-vacio">Todavía no hay partidas aprobadas. Cuando cambies una partida a «Aprobado» o «Comprado» aparecerá aquí.</p>
      ) : (
        <div className="ps-table-wrap">
          <table className="ps-table ps-table--aceptadas">
            <thead>
              <tr><th>Partida</th><th className="num">Medición</th><th className="num">Precio ud.</th><th className="num">Importe final</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {aceptadas.map(({ zona, items }) => (
                <AceptadasZona key={zona.id} zona={zona} items={items} zonaDe={zonaDe} />
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}>Total aceptado</td><td className="num"><strong>{fmtEur(t.aceptado)}</strong></td><td /></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function AceptadasZona({ zona, items, zonaDe }) {
  const t = totales(items, zonaDe)
  return (
    <>
      <tr className="ps-cap">
        <td colSpan={3}>{zona.nombre}</td>
        <td className="num">{fmtEur(t.aceptado)}</td>
        <td />
      </tr>
      {items.map(p => (
        <tr key={p.id}>
          <td>
            <strong>{p.concepto}</strong>
            <span className="ps-gris">{[p.capitulo, p.donde, p.proveedor].filter(Boolean).join(' · ')}</span>
          </td>
          <td className="num">{fmtCant(cantidad(p, zona))} {p.unidad}</td>
          <td className="num">
            {p.precio_conseguido != null && <s className="ps-gris-in">{fmtEur(p.precio_propuesto)}</s>} {fmtEur(precioFinal(p))}
          </td>
          <td className="num"><strong>{fmtEur(importeFinal(p, zona))}</strong></td>
          <td><span className={`ps-estado-tag ps-estado-tag--${p.estado}`}>{ESTADO_LABEL[p.estado]}</span></td>
        </tr>
      ))}
    </>
  )
}

// ─── Pestaña de zona ─────────────────────────────────────────────────────────
function ZonaView({ zona, zonaDe, partidas, filtro, setFiltro, canEdit, onCampo, onEditar, onNueva, onEditarZona }) {
  const t = totales(partidas, zonaDe)

  const cuenta = { todas: partidas.length, aceptadas: partidas.filter(isAceptada).length }
  ESTADOS.forEach(e => { cuenta[e.key] = partidas.filter(p => p.estado === e.key).length })

  const visibles = filtro === 'todas' ? partidas
    : filtro === 'aceptadas' ? partidas.filter(isAceptada)
    : partidas.filter(p => p.estado === filtro)
  const tv = totales(visibles, zonaDe)
  const pieLabel = filtro === 'todas' ? 'Total de la zona (sin descartadas)' : filtro === 'aceptadas' ? 'Total aceptado' : 'Total del filtro'

  return (
    <div className="ps-zona">
      <div className="ps-zona__head">
        <div className="ps-zona__info">
          {zona.ubicacion && <p className="ps-kicker">{zona.ubicacion}</p>}
          <h3 className="ps-titulo">{zona.nombre}</h3>
          <p className="ps-medidas">{textoMedidas(zona)}</p>
          {zona.notas && <p className="ps-zona__notas">{zona.notas}</p>}
          {canEdit && <button className="ps-link" onClick={onEditarZona}>Editar datos de la zona</button>}
        </div>
        <div className="ps-panel">
          <span className="ps-panel__label">Final previsto (IVA incl.)</span>
          <span className="ps-panel__big">{fmtEur(t.final)}</span>
          <dl className="ps-panel__dl">
            <dt>Propuesto</dt><dd>{fmtEur(t.propuesto)}</dd>
            <dt>Ahorro conseguido</dt><dd className="ps-verde">{fmtEur(t.ahorro)}</dd>
            <dt>Base imponible</dt><dd>{fmtEur(t.base)}</dd>
            <dt>Aceptado ({t.nAceptadas})</dt><dd className="ps-verde">{fmtEur(t.aceptado)}</dd>
          </dl>
          <RepartoTipos porTipo={t.porTipo} total={t.final} />
        </div>
      </div>

      <div className="ps-toolbar">
        <div className="sa-filters ps-chips">
          <Chip k="todas" label="Todas" n={cuenta.todas} filtro={filtro} setFiltro={setFiltro} />
          <Chip k="aceptadas" label="Aceptadas" n={cuenta.aceptadas} filtro={filtro} setFiltro={setFiltro} verde />
          {ESTADOS.map(e => <Chip key={e.key} k={e.key} label={e.label} n={cuenta[e.key]} filtro={filtro} setFiltro={setFiltro} />)}
        </div>
        {canEdit
          ? <button className="ps-btn ps-btn--primary" onClick={onNueva}>+ Añadir partida</button>
          : <span className="ps-gris-in">Solo lectura</span>}
      </div>

      {partidas.length === 0 ? (
        <p className="ps-vacio">Esta zona no tiene partidas todavía. Pulsa «+ Añadir partida» para empezar la medición.</p>
      ) : visibles.length === 0 ? (
        <p className="ps-vacio">No hay partidas con este estado.</p>
      ) : (
        <div className="ps-table-wrap">
          <table className="ps-table ps-table--partidas">
            <thead>
              <tr>
                <th>Partida</th><th className="num">Medición</th><th className="num">Propuesto</th><th className="num">Conseguido</th>
                <th className="num">Importe final</th><th>Origen del precio</th><th>Estado</th>{canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {porCapitulo(visibles).map(c => {
                const tc = totales(c.partidas, zonaDe)
                return (
                  <CapituloRows key={c.nombre} cap={c} tc={tc} zona={zona} canEdit={canEdit} onCampo={onCampo} onEditar={onEditar} />
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{pieLabel}</td>
                <td className="num">{fmtEur(tv.propuesto)}</td><td />
                <td className="num"><strong>{fmtEur(filtro === 'aceptadas' ? tv.aceptado : tv.final)}</strong></td>
                <td colSpan={canEdit ? 3 : 2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {canEdit && partidas.length > 0 && (
        <p className="ps-nota">Escribe en «Conseguido» el precio por unidad que os den al negociar; déjalo vacío para usar el propuesto.</p>
      )}
    </div>
  )
}

// ─── Actuaciones inmediatas ──────────────────────────────────────────────────
// Las partidas marcadas «inmediata» de todas las zonas, como lista de tareas.
// Siguen sumando en el presupuesto de su zona.
function InmediatasView({ zonas, partidas, zonaDe, canEdit, onCampo, onEditar, onNueva }) {
  const [filtro, setFiltro] = useState('porhacer')
  const todas    = partidas.filter(p => p.inmediata)
  const porHacer = todas.filter(isPorHacer)
  const hechas   = todas.filter(isHecha)
  const visibles = filtro === 'porhacer' ? porHacer : filtro === 'hechas' ? hechas : todas

  // Primero lo pendiente, por fecha límite (sin fecha al final) y por zona
  const ordenZona = Object.fromEntries(zonas.map((z, i) => [z.id, i]))
  const lista = [...visibles].sort((a, b) =>
    (isPorHacer(b) - isPorHacer(a)) ||
    (a.fecha_limite || '9999').localeCompare(b.fecha_limite || '9999') ||
    (ordenZona[a.zona_id] ?? 99) - (ordenZona[b.zona_id] ?? 99))

  const coste = list => list.reduce((s, p) => s + importeFinal(p, zonaDe[p.zona_id]), 0)
  const hoyStr = hoy()

  return (
    <div className="ps-inmediatas">
      <p className="ps-kicker">Cosas pequeñas que se pueden hacer ya</p>
      <h3 className="ps-titulo">Actuaciones inmediatas</h3>
      <p className="ps-sub">
        Partidas de cualquier zona marcadas como «⚡ Actuación inmediata»: no dependen de otras y se pueden ir
        ejecutando. Siguen sumando en el presupuesto de su zona; al marcarlas como hechas pasan a «Comprado».
      </p>

      <div className="sa-kpis ps-kpis">
        <Kpi label="Por hacer" value={porHacer.length} color="#f5c842" />
        <Kpi label="Coste pendiente" value={fmtEur(coste(porHacer))} />
        <Kpi label="Hechas" value={hechas.length} color={VERDE} />
        <Kpi label="Gastado" value={fmtEur(coste(hechas))} color={VERDE} />
      </div>

      <div className="ps-toolbar">
        <div className="sa-filters ps-chips">
          <Chip k="porhacer" label="Por hacer" n={porHacer.length} filtro={filtro} setFiltro={setFiltro} />
          <Chip k="hechas" label="Hechas" n={hechas.length} filtro={filtro} setFiltro={setFiltro} verde />
          <Chip k="todas" label="Todas" n={todas.length} filtro={filtro} setFiltro={setFiltro} />
        </div>
        {canEdit
          ? <button className="ps-btn ps-btn--primary" onClick={onNueva} disabled={!zonas.length}>+ Nueva actuación</button>
          : <span className="ps-gris-in">Solo lectura</span>}
      </div>

      {todas.length === 0 ? (
        <p className="ps-vacio">
          Aún no hay actuaciones inmediatas. Crea una con «+ Nueva actuación» o marca «⚡ Actuación inmediata» al editar
          cualquier partida de una zona.
        </p>
      ) : lista.length === 0 ? (
        <p className="ps-vacio">{filtro === 'porhacer' ? 'No queda nada por hacer.' : 'Todavía no hay ninguna hecha.'}</p>
      ) : (
        <div className="ps-table-wrap">
          <table className="ps-table ps-table--inmediatas">
            <thead>
              <tr>
                <th /><th>Actuación</th><th>Zona</th><th className="num">Coste</th>
                <th>Responsable</th><th>Fecha límite</th><th>Estado</th>{canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map(p => {
                const z = zonaDe[p.zona_id]
                const hecha = isHecha(p)
                const vencida = isPorHacer(p) && p.fecha_limite && p.fecha_limite < hoyStr
                const cant = cantidad(p, z)
                return (
                  <tr key={p.id} className={!isActiva(p) ? 'ps-row--descartada' : hecha ? 'ps-row--hecha' : ''}>
                    <td>
                      <button
                        className={`ps-hecho${hecha ? ' ps-hecho--on' : ''}`}
                        disabled={!canEdit || !isActiva(p)}
                        title={hecha ? 'Hecha · pulsa para volver a pendiente' : 'Marcar como hecha'}
                        onClick={() => onCampo(p, { estado: hecha ? 'pendiente' : 'comprado' })}
                      >✓</button>
                    </td>
                    <td className="ps-col-partida">
                      <strong>{p.concepto}</strong>
                      {p.donde && <span className="ps-donde">{p.donde}</span>}
                      {p.nota && <em className="ps-nota-partida">{p.nota}</em>}
                    </td>
                    <td>
                      {z?.nombre}
                      {p.capitulo !== CAP_INMEDIATAS && <span className="ps-gris">{p.capitulo}</span>}
                    </td>
                    <td className="num ps-nowrap">
                      <strong>{fmtEur(importeFinal(p, z))}</strong>
                      {cant !== 1 && <span className="ps-gris">{fmtCant(cant)} {p.unidad} × {fmtEur(precioFinal(p))}</span>}
                    </td>
                    <td>{p.responsable || <span className="ps-gris-in">—</span>}</td>
                    <td className={`ps-nowrap${vencida ? ' ps-vencida' : ''}`}>
                      {p.fecha_limite ? fmtFecha(p.fecha_limite) : <span className="ps-gris-in">—</span>}
                      {vencida && <span className="ps-small">Vencida</span>}
                    </td>
                    <td>
                      <select className={`ps-estado ps-estado--${p.estado}`} value={p.estado} disabled={!canEdit}
                        onChange={e => onCampo(p, { estado: e.target.value })}>
                        {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                      </select>
                    </td>
                    {canEdit && <td><button className="ps-btn ps-btn--small" onClick={() => onEditar(p)}>Editar</button></td>}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td /><td colSpan={2}>{filtro === 'hechas' ? 'Total gastado' : filtro === 'porhacer' ? 'Total pendiente' : 'Total (sin descartadas)'}</td>
                <td className="num"><strong>{fmtEur(coste(lista.filter(isActiva)))}</strong></td>
                <td colSpan={canEdit ? 4 : 3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function Chip({ k, label, n, filtro, setFiltro, verde }) {
  return (
    <button className={`sa-filter-btn${filtro === k ? ' sa-filter-btn--active' : ''}${verde ? ' ps-chip--verde' : ''}`} onClick={() => setFiltro(k)}>
      {label} ({n})
    </button>
  )
}

function RepartoTipos({ porTipo, total }) {
  if (!total) return null
  const tramos = TIPOS.filter(t => porTipo[t.key] > 0).map(t => ({ ...t, pct: (porTipo[t.key] / total) * 100 }))
  return (
    <div className="ps-reparto">
      <div className="ps-reparto__bar">
        {tramos.map(t => <span key={t.key} style={{ width: `${t.pct}%`, background: t.color }} title={`${t.label} ${Math.round(t.pct)} %`} />)}
      </div>
      <div className="ps-reparto__leyenda">
        {tramos.map(t => (
          <span key={t.key}><i style={{ background: t.color }} />{t.label} {Math.round(t.pct)} %</span>
        ))}
      </div>
    </div>
  )
}

function CapituloRows({ cap, tc, zona, canEdit, onCampo, onEditar }) {
  return (
    <>
      <tr className="ps-cap">
        <td colSpan={2}>{cap.nombre}</td>
        <td className="num">{fmtEur(tc.propuesto)}</td>
        <td />
        <td className="num">{fmtEur(tc.final)}</td>
        <td colSpan={canEdit ? 3 : 2} />
      </tr>
      {cap.partidas.map(p => <PartidaRow key={p.id} p={p} zona={zona} canEdit={canEdit} onCampo={onCampo} onEditar={onEditar} />)}
    </>
  )
}

function PartidaRow({ p, zona, canEdit, onCampo, onEditar }) {
  const ip = importePropuesto(p, zona)
  const fi = importeFinal(p, zona)
  const ahorro = ip - fi
  const tipo = TIPO_BY_KEY[p.tipo_precio]
  const enlace = urlSegura(p.enlace)
  const auto = p.medida && medidaZona(zona, p.medida) != null

  return (
    <tr className={p.estado === 'descartado' ? 'ps-row--descartada' : ''}>
      <td className="ps-col-partida">
        <strong>{p.concepto}</strong>
        {p.inmediata && <span className="ps-rayo" title="Actuación inmediata">⚡ Inmediata</span>}
        {p.donde && <span className="ps-donde">{p.donde}</span>}
        {p.descripcion && <span className="ps-gris">{p.descripcion}</span>}
        {p.nota && <em className="ps-nota-partida">{p.nota}</em>}
      </td>
      <td className="num ps-nowrap">
        {fmtCant(cantidad(p, zona))} {p.unidad}
        {p.medida && !zona.sin_sala && <span className="ps-gris" title={auto ? 'Calculado con las medidas de la zona' : 'Se calculará al meter las medidas de la zona'}>
          {auto ? '↻ ' : ''}{p.medida === 'perimetro' ? 'perímetro' : p.medida}
        </span>}
      </td>
      <td className="num ps-nowrap">
        {fmtEur(p.precio_propuesto)}
        <span className="ps-gris">{fmtEur(ip)}</span>
      </td>
      <td className="num">
        {canEdit
          ? <ConseguidoInput p={p} onGuardar={v => onCampo(p, { precio_conseguido: v })} />
          : (p.precio_conseguido != null ? fmtEur(p.precio_conseguido) : '—')}
      </td>
      <td className="num ps-nowrap">
        <strong>{fmtEur(fi)}</strong>
        {ahorro > 0.004 && <span className="ps-verde ps-small">−{fmtEur(ahorro)}</span>}
        {ahorro < -0.004 && <span className="ps-gris">+{fmtEur(-ahorro)}</span>}
      </td>
      <td className="ps-col-origen">
        {tipo && <span className="ps-tipo" style={{ '--tipo-color': tipo.color }}>{tipo.label}</span>}
        {p.proveedor && <span className="ps-origen-linea">{p.proveedor}</span>}
        {enlace
          ? <a className="ps-origen-linea ps-enlace" href={enlace} target="_blank" rel="noopener noreferrer">{p.fuente || dominio(enlace)}</a>
          : p.fuente && <span className="ps-origen-linea ps-gris-in">{p.fuente}</span>}
        {p.fecha_consulta && <span className="ps-gris">Consultado {fmtFecha(p.fecha_consulta)}</span>}
      </td>
      <td>
        <select className={`ps-estado ps-estado--${p.estado}`} value={p.estado} disabled={!canEdit}
          onChange={e => onCampo(p, { estado: e.target.value })}>
          {ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
      </td>
      {canEdit && <td><button className="ps-btn ps-btn--small" onClick={() => onEditar(p)}>Editar</button></td>}
    </tr>
  )
}

// Se guarda al salir del campo o con Enter; el foco se queda en el campo
function ConseguidoInput({ p, onGuardar }) {
  const valor = p.precio_conseguido != null ? String(p.precio_conseguido).replace('.', ',') : ''
  const [txt, setTxt] = useState(valor)
  const focused = useRef(false)

  useEffect(() => { if (!focused.current) setTxt(valor) }, [valor])

  function guardar() {
    const v = parsePrecio(txt)
    if (v === undefined) { setTxt(valor); return }            // no numérico: no se guarda
    setTxt(v == null ? '' : String(v).replace('.', ','))
    if (v !== (p.precio_conseguido ?? null)) onGuardar(v)
  }

  return (
    <input
      className={`ps-conseguido${txt !== '' ? ' ps-conseguido--on' : ''}`}
      inputMode="decimal"
      value={txt}
      placeholder={String(p.precio_propuesto ?? '').replace('.', ',')}
      onChange={e => setTxt(e.target.value)}
      onFocus={() => { focused.current = true }}
      onBlur={() => { focused.current = false; guardar() }}
      onKeyDown={e => { if (e.key === 'Enter') guardar() }}
    />
  )
}

// ─── Formularios ─────────────────────────────────────────────────────────────
function Modal({ titulo, children, onCerrar }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])
  return (
    <div className="ps-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="ps-modal" role="dialog" aria-modal="true">
        <h3 className="ps-modal__title">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

function Field({ label, full, hint, children }) {
  return (
    <label className={`ps-field${full ? ' ps-field--full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function ModalActions({ editando, guardando, error, onBorrar, onCerrar }) {
  const [confirmar, setConfirmar] = useState(false)
  return (
    <>
      {error && <p className="sa-error">{error}</p>}
      <div className="ps-modal__actions">
        {editando && (confirmar
          ? <span className="ps-confirmar">¿Seguro? <button type="button" className="ps-btn ps-btn--danger" onClick={onBorrar} disabled={guardando}>Sí, eliminar</button></span>
          : <button type="button" className="ps-btn ps-btn--danger-ghost" onClick={() => setConfirmar(true)}>Eliminar</button>)}
        <span className="ps-flex" />
        <button type="button" className="ps-btn" onClick={onCerrar}>Cancelar</button>
        <button type="submit" className="ps-btn ps-btn--primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </>
  )
}

const num2str = v => (v == null || v === '' ? '' : String(v).replace('.', ','))

function PartidaModal({ inicial, zona, capitulos, onGuardar, onBorrar, onCerrar, onFallo }) {
  const editando = !inicial.nueva
  const [f, setF] = useState(() => editando
    ? { ...inicial, cantidad: num2str(inicial.cantidad), precio_propuesto: num2str(inicial.precio_propuesto), precio_conseguido: num2str(inicial.precio_conseguido), medida: inicial.medida || '' }
    : { zona_id: zona.id, concepto: '', donde: '', descripcion: '', capitulo: capitulos[capitulos.length - 1] || '', orden: 0,
        cantidad: '1', unidad: 'ud', medida: '', precio_propuesto: '0', precio_conseguido: '',
        tipo_precio: 'estimación', estado: 'pendiente', proveedor: '', fuente: '', enlace: '', fecha_consulta: hoy(), nota: '',
        inmediata: false, responsable: '', fecha_limite: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))

  const auto = f.medida ? medidaZona(zona, f.medida) : null

  async function submit(e) {
    e.preventDefault()
    const cant = auto != null ? Math.round(auto * 100) / 100 : parsePrecio(f.cantidad)
    const prop = parsePrecio(f.precio_propuesto)
    const cons = parsePrecio(f.precio_conseguido)
    if (!f.concepto.trim() || !f.capitulo.trim()) return setError('El concepto y el capítulo son obligatorios.')
    if (cant == null || cant === undefined) return setError('La cantidad no es un número válido.')
    if (prop == null || prop === undefined) return setError('El precio propuesto no es un número válido.')
    if (cons === undefined) return setError('El precio conseguido no es un número válido.')
    if (f.enlace && !urlSegura(f.enlace)) return setError('El enlace tiene que empezar por http:// o https://')
    setGuardando(true)
    setError(null)
    try {
      await onGuardar({
        ...f, cantidad: cant, precio_propuesto: prop, precio_conseguido: cons,
        orden: parseInt(f.orden, 10) || 0, medida: (!zona.sin_sala && f.medida) || null,
        inmediata: !!f.inmediata, fecha_limite: (f.inmediata && f.fecha_limite) || null,
      })
    } catch (err) {
      setError(err.message)
      onFallo(err)
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    try { await onBorrar(inicial.id) } catch (err) { setError(err.message); onFallo(err); setGuardando(false) }
  }

  return (
    <Modal titulo={editando ? 'Editar partida' : 'Nueva partida'} onCerrar={onCerrar}>
      <form className="ps-form" onSubmit={submit}>
        <Field label="Concepto *" full><input value={f.concepto} onChange={set('concepto')} autoFocus /></Field>
        {zona.sin_sala && (
          <Field label="Dónde" full hint="Salas o partes del local a las que afecta">
            <input value={f.donde || ''} onChange={set('donde')} placeholder="Sala 2 y vestuarios" maxLength={160} />
          </Field>
        )}
        <Field label="Descripción / medición" full><textarea rows={2} value={f.descripcion} onChange={set('descripcion')} /></Field>
        <Field label="Capítulo *">
          <input value={f.capitulo} onChange={set('capitulo')} list="ps-capitulos" />
          <datalist id="ps-capitulos">{capitulos.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Orden"><input type="number" value={f.orden} onChange={set('orden')} /></Field>
        <Field label="Cantidad *" hint={auto != null ? 'Calculada con las medidas de la zona' : f.medida && !zona.sin_sala ?'Se recalculará al meter las medidas de la zona' : null}>
          <input inputMode="decimal" value={auto != null ? fmtCant(auto) : f.cantidad} onChange={set('cantidad')} disabled={auto != null} />
        </Field>
        <Field label="Unidad">
          <input value={f.unidad} onChange={set('unidad')} list="ps-unidades" />
          <datalist id="ps-unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist>
        </Field>
        {!zona.sin_sala && (
          <Field label="Medida" full>
            <select value={f.medida} onChange={set('medida')}>
              <option value="">Ninguna (cantidad a mano)</option>
              {MEDIDAS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Precio propuesto (€/ud con IVA) *"><input inputMode="decimal" value={f.precio_propuesto} onChange={set('precio_propuesto')} /></Field>
        <Field label="Precio conseguido (€/ud con IVA)" hint="Vacío = igual al propuesto"><input inputMode="decimal" value={f.precio_conseguido} onChange={set('precio_conseguido')} /></Field>
        <Field label="Tipo de precio">
          <select value={f.tipo_precio} onChange={set('tipo_precio')}>{TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        </Field>
        <Field label="Estado">
          <select value={f.estado} onChange={set('estado')}>{ESTADOS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select>
        </Field>
        <Field label="Proveedor"><input value={f.proveedor} onChange={set('proveedor')} /></Field>
        <Field label="Fecha de consulta"><input type="date" value={f.fecha_consulta || ''} onChange={set('fecha_consulta')} /></Field>
        <Field label="Fuente (dónde se ha buscado)" full><input value={f.fuente} onChange={set('fuente')} /></Field>
        <Field label="Enlace" full><input type="url" value={f.enlace} onChange={set('enlace')} placeholder="https://" /></Field>
        <Field label="Notas" full><textarea rows={2} value={f.nota} onChange={set('nota')} /></Field>
        <label className="ps-check">
          <input type="checkbox" checked={!!f.inmediata} onChange={e => setF(x => ({ ...x, inmediata: e.target.checked }))} />
          <span>⚡ Actuación inmediata</span>
          <small>Algo pequeño que se puede hacer ya, sin esperar a otras partidas. Sale en «Actuaciones inmediatas».</small>
        </label>
        {f.inmediata && (
          <>
            <Field label="Responsable"><input value={f.responsable || ''} onChange={set('responsable')} maxLength={80} /></Field>
            <Field label="Fecha límite"><input type="date" value={f.fecha_limite || ''} onChange={set('fecha_limite')} /></Field>
          </>
        )}
        <ModalActions editando={editando} guardando={guardando} error={error} onBorrar={borrar} onCerrar={onCerrar} />
      </form>
    </Modal>
  )
}

// Alta rápida: se guarda como partida de la zona, en el capítulo «Actuaciones inmediatas»
function InmediataModal({ zonas, onGuardar, onCerrar, onFallo }) {
  const porDefecto = zonas.find(z => z.sin_sala) || zonas[0]
  const [f, setF] = useState({ concepto: '', zona_id: porDefecto?.id || '', donde: '', coste: '', responsable: '', fecha_limite: '', nota: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const zona = zonas.find(z => z.id === f.zona_id)

  async function submit(e) {
    e.preventDefault()
    const coste = parsePrecio(f.coste)
    if (!f.concepto.trim()) return setError('Indica qué hay que hacer.')
    if (!zona) return setError('Elige una zona.')
    if (coste === undefined) return setError('El coste no es un número válido.')
    setGuardando(true)
    setError(null)
    try {
      await onGuardar({
        zona_id: zona.id, concepto: f.concepto, donde: zona.sin_sala ? f.donde : '', capitulo: CAP_INMEDIATAS, orden: 0,
        cantidad: 1, unidad: 'ud', medida: null, precio_propuesto: coste ?? 0, precio_conseguido: null,
        tipo_precio: 'estimación', estado: 'pendiente', fecha_consulta: hoy(), nota: f.nota,
        inmediata: true, responsable: f.responsable, fecha_limite: f.fecha_limite || null,
      })
    } catch (err) {
      setError(err.message)
      onFallo(err)
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Nueva actuación inmediata" onCerrar={onCerrar}>
      <form className="ps-form" onSubmit={submit}>
        <Field label="Qué hay que hacer *" full><input value={f.concepto} onChange={set('concepto')} autoFocus placeholder="Cambiar el fluorescente del pasillo" /></Field>
        <Field label="Zona" full={!zona?.sin_sala}>
          <select value={f.zona_id} onChange={set('zona_id')}>
            {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
        </Field>
        {zona?.sin_sala && (
          <Field label="Dónde"><input value={f.donde} onChange={set('donde')} placeholder="Sala 2 y vestuarios" maxLength={160} /></Field>
        )}
        <Field label="Coste aproximado (€ con IVA)" hint="Vacío = 0 €"><input inputMode="decimal" value={f.coste} onChange={set('coste')} /></Field>
        <Field label="Responsable"><input value={f.responsable} onChange={set('responsable')} maxLength={80} /></Field>
        <Field label="Fecha límite"><input type="date" value={f.fecha_limite} onChange={set('fecha_limite')} /></Field>
        <Field label="Notas" full><textarea rows={2} value={f.nota} onChange={set('nota')} /></Field>
        <p className="ps-nota">
          Se guarda en la zona elegida, en el capítulo «{CAP_INMEDIATAS}», y suma en su presupuesto. Para añadir proveedor,
          enlace o cantidades, usa «Editar» después.
        </p>
        <ModalActions editando={false} guardando={guardando} error={error} onCerrar={onCerrar} />
      </form>
    </Modal>
  )
}

function ZonaModal({ inicial, onGuardar, onBorrar, onCerrar, onFallo }) {
  const editando = !!inicial.id
  const [f, setF] = useState({
    nombre: inicial.nombre || '', ubicacion: inicial.ubicacion || '', notas: inicial.notas || '',
    largo: num2str(inicial.largo), ancho: num2str(inicial.ancho), alto: num2str(inicial.alto),
    sin_sala: !!inicial.sin_sala,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const vista = fmtMedidas({ largo: parsePrecio(f.largo), ancho: parsePrecio(f.ancho), alto: parsePrecio(f.alto) })

  async function submit(e) {
    e.preventDefault()
    // Sin sala concreta no hay medidas: se guardan vacías
    const dims = f.sin_sala
      ? { largo: null, ancho: null, alto: null }
      : { largo: parsePrecio(f.largo), ancho: parsePrecio(f.ancho), alto: parsePrecio(f.alto) }
    if (!f.nombre.trim()) return setError('El nombre es obligatorio.')
    if (Object.values(dims).some(v => v === undefined)) return setError('Las medidas tienen que ser números.')
    setGuardando(true)
    setError(null)
    try {
      await onGuardar({ ...(editando ? { id: inicial.id } : {}), nombre: f.nombre, ubicacion: f.ubicacion, notas: f.notas, sin_sala: f.sin_sala, ...dims })
    } catch (err) {
      setError(err.message)
      onFallo(err)
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    try { await onBorrar(inicial.id) } catch (err) { setError(err.message); onFallo(err); setGuardando(false) }
  }

  return (
    <Modal titulo={editando ? 'Editar zona' : 'Nueva zona'} onCerrar={onCerrar}>
      <form className="ps-form" onSubmit={submit}>
        <Field label="Nombre *" full><input value={f.nombre} onChange={set('nombre')} autoFocus /></Field>
        <Field label="Ubicación" full><input value={f.ubicacion} onChange={set('ubicacion')} placeholder="Planta 1 · junto a Sala 2" /></Field>
        <label className="ps-check">
          <input type="checkbox" checked={f.sin_sala} onChange={e => setF(x => ({ ...x, sin_sala: e.target.checked }))} />
          <span>Sin sala concreta (varias salas)</span>
          <small>Para actuaciones que no son de una sala: no lleva medidas y cada partida dice dónde es</small>
        </label>
        {!f.sin_sala && (
          <>
            <Field label="Largo (m)"><input inputMode="decimal" value={f.largo} onChange={set('largo')} /></Field>
            <Field label="Ancho (m)"><input inputMode="decimal" value={f.ancho} onChange={set('ancho')} /></Field>
            <Field label="Altura (m)" hint="Para las partidas de paredes"><input inputMode="decimal" value={f.alto} onChange={set('alto')} /></Field>
            <Field label="Medidas" hint="Las partidas con «medida» recalculan su cantidad con estos datos">
              <span className="ps-medidas ps-medidas--form">{vista || '—'}</span>
            </Field>
          </>
        )}
        <Field label="Notas" full><textarea rows={3} value={f.notas} onChange={set('notas')} /></Field>
        {editando && <p className="ps-nota">Eliminar la zona borra también todas sus partidas.</p>}
        <ModalActions editando={editando} guardando={guardando} error={error} onBorrar={borrar} onCerrar={onCerrar} />
      </form>
    </Modal>
  )
}
