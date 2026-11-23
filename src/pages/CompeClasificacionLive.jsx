import { useEffect, useRef, useState } from 'react'
import { colorPorNumeroBloque } from '../utils/compeColorScale'
import './CompeClasificacionLive.css'

// Clasificación en directo de la tele (20/11 06:30, punto 2) — puerto a producción del
// prototipo media_para_code/prototipo_clasificacion_tele.html, con datos reales en vez de
// inventados. Animación y disposición (rotativo tipo panel de estación / 3 columnas) hechas
// con DOM directo vía refs, igual que el prototipo — un componente React "de verdad" que
// recalculase posiciones en cada render sería mucho más frágil para esta coreografía concreta
// (cola de eventos, una fila moviéndose a su puesto nuevo mientras las demás se recolocan).
// React aquí solo monta el esqueleto y decide CUÁNDO hay un evento nuevo que animar; el cómo
// lo hace el mismo código imperativo del prototipo, adaptado.
//
// 22/11 14:00/14:05 (Ramiro — "se sale por abajo con muchos"): antes se repartía SIEMPRE un
// número fijo de filas (11 en rotativa, 13 en columnas) dividiendo la altura real de la caja
// entre ese número — con pocas pantallas (la tele de verdad del Roco, 960×540 según las fotos
// tele_cortada_*.jpg) esas 11/13 filas no cabían sin encoger la letra por debajo de lo legible,
// y con MÁS gente de la que cabía no había ningún mecanismo para verla, solo se cortaba por
// abajo. Ahora: nunca un número fijo — se calculan cuántas filas caben de verdad con una altura
// mínima legible por fila, los 3 primeros quedan fijos arriba (podio) y el resto se reparte en
// páginas (4-13, 14-23…) que van rotando solas, como un panel de estación de tren.
const PAGE_MS = 8000
const MIN_ROW_PX_ROT = 30 // alto mínimo de fila legible en la vista rotativa (1 lista grande)
const MIN_ROW_PX_TRI = 24 // igual, pero en columnas (letra más pequeña, 3 listas a la vez)
const MIN_ULT_PX = 26 // igual para "Últimos tops", que tampoco se corte por abajo

// "?vista=rotativo|columnas" en la URL de la tele (20/11 06:30) — para comparar las dos en la
// tele real sin tocar código, igual que ya existe "?escala=" en esta misma página.
function vistaInicialDesdeUrl() {
  const v = new URLSearchParams(window.location.search).get('vista')
  return v === 'columnas' ? '3' : 'rot'
}
function debugActivo() {
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

// Cuántas filas de página caben (sin contar el podio) y qué alto le queda a cada una, a partir
// de la altura REAL de la caja — nunca un número inventado, y nunca por debajo de minRowPx.
function filasPorPaginaDesde(boxHeight, minRowPx) {
  if (!boxHeight) return 8 // antes de que el layout asiente (primer pintado) — se corrige solo
  return Math.max(1, Math.floor(boxHeight / minRowPx) - 3)
}
function rowHDesde(boxHeight, filasPorPagina) {
  return boxHeight > 0 ? boxHeight / (filasPorPagina + 3) : 40
}
function totalPaginasDe(orden, filasPorPagina) {
  return Math.max(1, Math.ceil(Math.max(0, orden.length - 3) / filasPorPagina))
}
// Lo que se ve EN PANTALLA ahora mismo para una categoría: el podio (3 primeros, fijos) +
// la página actual de el resto.
function filasVisibles(orden, filasPorPagina, pagina) {
  const ini = 3 + (pagina - 1) * filasPorPagina
  return orden.slice(0, 3).concat(orden.slice(ini, ini + filasPorPagina))
}
// 23/11 06:50: el puesto ya viene del backend en cada fila (`p.puesto`) — con empates que
// comparten puesto, la posición en el array (i) ya no es lo mismo que el puesto real.

export default function CompeClasificacionLive({ clasif, totalBloques }) {
  const stageRef = useRef(null)
  const listRef = useRef(null)
  const tabsRef = useRef(null)
  const catTitleRef = useRef(null)
  const catPagRef = useRef(null)
  const triRef = useRef(null)
  const ultRef = useRef(null)

  const [view, setView] = useState(vistaInicialDesdeUrl())
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  const debugOn = useRef(debugActivo()).current
  const [debugInfo, setDebugInfo] = useState(null)
  const [ultimosCount, setUltimosCount] = useState(8)

  // Estado imperativo de la animación — no re-renderiza React, solo pinta el DOM directamente.
  const st = useRef({
    cats: [], // [{id, nombre}] — de clasif.categorias (masculina/femenina/infantil)
    orden: {}, // catId -> array [{clave, nombreMostrar, tops}] en el orden MOSTRADO ahora mismo
    pagina: {}, // catId -> página actual (1-indexada) de la zona NO podio
    totalPaginasRot: {}, // catId -> nº de páginas, calculado la última vez que se mostró en rotativa
    totalPaginasTri: {}, // catId -> nº de páginas, calculado la última vez que se mostró en columnas
    catIdx: 0,
    rotTimer: null,
    triTimer: null,
    busy: false,
    queue: [],
    vistoIds: null, // null hasta el primer dato — así nunca se anima el histórico al cargar
  }).current

  const $ = ref => ref.current
  const minRowPxActual = () => (viewRef.current === 'rot' ? MIN_ROW_PX_ROT : MIN_ROW_PX_TRI)

  function actualizarDebug(filasPorPagina, rowH) {
    if (!debugOn) return
    setDebugInfo({
      w: window.innerWidth, h: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      escala: parseFloat(new URLSearchParams(window.location.search).get('escala')) || 1,
      vista: viewRef.current === 'rot' ? 'rotativa' : 'columnas',
      filasPorPagina, rowH: Math.round(rowH),
    })
  }

  function drawTabs(paused) {
    const tabs = $(tabsRef)
    if (!tabs) return
    tabs.innerHTML = st.cats.map((c, i) => {
      const dur = (st.totalPaginasRot[c.id] || 1) * PAGE_MS
      return `<div class="cl-tab${i === st.catIdx ? ' on' : ''}${paused ? ' paused' : ''}" style="--rot:${dur}ms">${c.nombre}<span class="cl-bar"></span></div>`
    }).join('')
  }
  // Rotativa: cada categoría se queda en pantalla lo que haga falta para pasar TODAS sus
  // páginas (≈8 s cada una) antes de saltar a la siguiente — nunca un tiempo fijo por categoría.
  function startRot() {
    clearTimeout(st.rotTimer)
    drawTabs(false)
    if (st.cats.length === 0) return
    st.rotTimer = setTimeout(() => {
      if (st.busy) { startRot(); return }
      const cat = st.cats[st.catIdx]
      const totalPag = cat ? (st.totalPaginasRot[cat.id] || 1) : 1
      const paginaActual = cat ? (st.pagina[cat.id] || 1) : 1
      if (cat && paginaActual < totalPag) {
        st.pagina[cat.id] = paginaActual + 1
        showCat(st.catIdx, false)
      } else {
        const sigIdx = st.cats.length > 1 ? (st.catIdx + 1) % st.cats.length : st.catIdx
        const sigCat = st.cats[sigIdx]
        if (sigCat) st.pagina[sigCat.id] = 1
        showCat(sigIdx, true)
      }
      startRot()
    }, PAGE_MS)
  }
  function pauseRot() { clearTimeout(st.rotTimer); drawTabs(true) }
  // Columnas: cada columna pasa de página por su cuenta, a la vez (mismo intervalo, cada una
  // envuelve en su propio número de páginas) — nunca se cortan por abajo ni esperan a las otras.
  function startTriRot() {
    clearInterval(st.triTimer)
    st.triTimer = setInterval(() => {
      if (st.busy) return
      st.cats.filter(c => c.id !== '').forEach(c => {
        const total = st.totalPaginasTri[c.id] || 1
        const actual = st.pagina[c.id] || 1
        st.pagina[c.id] = actual < total ? actual + 1 : 1
      })
      renderTri()
    }, PAGE_MS)
  }
  function stopTriRot() { clearInterval(st.triTimer) }

  function label(p) {
    return p.nombreMostrar || 'Alguien'
  }
  function makeRow(p, i, rowH, puesto) {
    const el = document.createElement('div')
    el.className = 'cl-row' + (i < 3 ? ` r${i + 1}` : '')
    el.dataset.clave = p.clave
    el.style.top = (i * rowH) + 'px'
    el.style.height = rowH + 'px'
    el.style.setProperty('--i', i)
    el.innerHTML = `<span class="cl-pos">${puesto}</span><span class="cl-nm">${label(p)}</span><span class="cl-tp">${p.puntos}</span>`
    return el
  }
  // Pinta una categoría entera (podio + la página que toque) en su caja — se usa tanto para la
  // lista grande de rotativa como para cada columna de la vista de columnas.
  function renderCategoria(box, pagEl, orden, pagina, flip) {
    const boxHeight = box?.clientHeight || 0
    const minRowPx = minRowPxActual()
    const filasPorPagina = filasPorPaginaDesde(boxHeight, minRowPx)
    const rowH = rowHDesde(boxHeight, filasPorPagina)
    const totalPaginas = totalPaginasDe(orden, filasPorPagina)
    const paginaFinal = Math.min(Math.max(1, pagina), totalPaginas)
    const filas = filasVisibles(orden, filasPorPagina, paginaFinal)
    if (box) {
      box.innerHTML = ''
      filas.forEach((p, i) => box.appendChild(makeRow(p, i, rowH, p.puesto)))
      if (flip) { box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip') }
    }
    if (pagEl) pagEl.textContent = totalPaginas > 1 ? `pág. ${paginaFinal}/${totalPaginas}` : ''
    actualizarDebug(filasPorPagina, rowH)
    return { filasPorPagina, rowH, totalPaginas, pagina: paginaFinal }
  }
  function showCat(i, flip) {
    st.catIdx = i
    const cat = st.cats[i]
    if (!cat) return
    if ($(catTitleRef)) $(catTitleRef).textContent = 'Clasificación ' + cat.nombre.toLowerCase()
    const r = renderCategoria($(listRef), $(catPagRef), st.orden[cat.id] || [], st.pagina[cat.id] || 1, flip)
    st.pagina[cat.id] = r.pagina
    st.totalPaginasRot[cat.id] = r.totalPaginas
    drawTabs(false)
  }
  // 22/11: el backend ya no manda nunca "Sin categoría" (nadie puede quedar sin categoría en
  // la compe) — este filtro es solo defensivo, por si algún dato viejo la trajera de antes.
  function renderTri() {
    const tri = $(triRef)
    if (!tri) return
    const cats = st.cats.filter(c => c.id !== '')
    tri.innerHTML = cats.map(c => `<div><div class="cl-h2"><span>${c.nombre}</span><span class="cl-pag"></span><span>pts</span></div><div class="cl-list" data-cat="${c.id}"></div></div>`).join('')
    cats.forEach(c => {
      const box = tri.querySelector(`.cl-list[data-cat="${c.id}"]`)
      const pagEl = box?.previousElementSibling?.querySelector('.cl-pag')
      const r = renderCategoria(box, pagEl, st.orden[c.id] || [], st.pagina[c.id] || 1, false)
      st.pagina[c.id] = r.pagina
      st.totalPaginasTri[c.id] = r.totalPaginas
    })
  }

  const wait = ms => new Promise(r => setTimeout(r, ms))

  // Una actualización animada: ev = { catId, clave, nombreMostrar, numero, tops, ordenCompletoNuevo }
  // "clave" (20/11, causa real del punto 3 de la prueba de cowork del 09:45: número de puesto
  // duplicado durante la animación): identifica la fila de forma estable (tipo:id), nunca por el
  // texto nombreMostrar — dos participantes distintos pueden mostrar el mismo texto (p. ej. dos
  // "Carlos G." sin alias, o los participantes de prueba antes de este arreglo) y con la clave
  // vieja (nombreMostrar) el querySelector encontraba la fila equivocada.
  // 22/11 14:00: "ordenCompletoNuevo" es el ranking COMPLETO (no solo lo visible) — hace falta
  // para saber en qué página cae de verdad la persona, y saltar ahí antes de animar.
  async function animate(ev) {
    st.busy = true
    const ci = st.cats.findIndex(c => c.id === ev.catId)
    const ordenCompletoNuevo = ev.ordenCompletoNuevo
    const afterFull = ordenCompletoNuevo.findIndex(x => x.clave === ev.clave)

    if (viewRef.current === 'rot') {
      pauseRot()
      if (ci >= 0 && ci !== st.catIdx) { showCat(ci, true); await wait(900); pauseRot() }
    }
    let box = viewRef.current === 'rot' ? $(listRef) : $(triRef)?.querySelector(`.cl-list[data-cat="${ev.catId}"]`)
    if (!box) { st.orden[ev.catId] = ordenCompletoNuevo; st.busy = false; return next() }

    const minRowPx = minRowPxActual()
    const filasPorPagina = filasPorPaginaDesde(box.clientHeight || 0, minRowPx)
    const totalPaginas = totalPaginasDe(ordenCompletoNuevo, filasPorPagina)
    // A qué página salta: la del podio no cuenta (siempre visible); si no, la que le toque por
    // su puesto nuevo — "si sube de página (del 15º al 9º), se ve entrar en la página destino".
    const paginaDestino = afterFull < 3 ? (st.pagina[ev.catId] || 1) : Math.min(totalPaginas, Math.floor((afterFull - 3) / filasPorPagina) + 1)

    if ((st.pagina[ev.catId] || 1) !== paginaDestino) {
      st.pagina[ev.catId] = paginaDestino
      if (viewRef.current === 'rot') showCat(st.catIdx, false)
      else renderTri()
      box = viewRef.current === 'rot' ? $(listRef) : $(triRef)?.querySelector(`.cl-list[data-cat="${ev.catId}"]`)
      if (!box) { st.orden[ev.catId] = ordenCompletoNuevo; st.busy = false; return next() }
    }

    const rowH = rowHDesde(box.clientHeight || 0, filasPorPagina)
    const ordenAntesCompleto = st.orden[ev.catId] || []
    const visibleAntes = filasVisibles(ordenAntesCompleto, filasPorPagina, paginaDestino)
    const visibleDespues = filasVisibles(ordenCompletoNuevo, filasPorPagina, paginaDestino)
    const max = visibleDespues.length

    const puestoNuevo = ordenCompletoNuevo[afterFull]?.puesto ?? (afterFull + 1)
    const puntosAntes = ev.puntosTotal - ev.puntosGanados

    let before = visibleAntes.findIndex(x => x.clave === ev.clave)
    let row = before >= 0 ? box.querySelector(`.cl-row[data-clave="${CSS.escape(ev.clave)}"]`) : null
    if (!row) {
      // No estaba en la página destino (era nuevo, o venía de otra página) — entra con fundido,
      // nunca se intenta animar el salto de página en sí, solo la fila entrando aquí.
      row = makeRow({ clave: ev.clave, nombreMostrar: ev.nombreMostrar, puntos: puntosAntes }, max, rowH, puestoNuevo)
      row.style.opacity = '0'
      box.appendChild(row)
      void row.offsetWidth
      row.style.opacity = '1'
      before = max
    }
    row.classList.add('moving')

    const hl = document.createElement('div')
    hl.className = 'cl-hl'
    const h = rowH + 8, w = box.clientWidth + 8, per = 2 * (w + h)
    hl.style.cssText = `top:${before * rowH - 4}px;height:${h}px;--per:${per}`
    hl.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="4"></rect></svg><span class="cl-tag">+${ev.puntosGanados} pts${ev.numero ? ` · bloque ${ev.numero}` : ''}</span>`
    box.appendChild(hl)
    void hl.offsetWidth
    hl.classList.add('draw')
    await wait(750)
    hl.classList.add('tagon')

    row.querySelector('.cl-tp').textContent = ev.puntosTotal
    row.classList.add('bump')
    await wait(450)

    const after = visibleDespues.findIndex(x => x.clave === ev.clave)
    const shown = after >= 0 && after < max ? after : max
    visibleDespues.forEach((x, i) => {
      if (i >= max && x.clave !== ev.clave) return
      let el = box.querySelector(`.cl-row[data-clave="${CSS.escape(x.clave)}"]`)
      if (!el) return
      const esMovida = x.clave === ev.clave
      const slot = esMovida ? shown : i
      el.style.top = (slot * rowH) + 'px'
      el.className = 'cl-row' + (slot < 3 ? ` r${slot + 1}` : '') + (esMovida ? ' moving' : '')
      const posEl = el.querySelector('.cl-pos')
      if (posEl) posEl.textContent = esMovida ? puestoNuevo : x.puesto
      if (i >= max && !esMovida) el.style.opacity = '0'
    })
    hl.style.top = (shown * rowH - 4) + 'px'
    await wait(1100 + 1400)
    hl.style.opacity = '0'
    row.classList.remove('moving', 'bump')
    await wait(400)
    hl.remove()
    st.orden[ev.catId] = ordenCompletoNuevo
    renderCategoria(
      box,
      viewRef.current === 'rot' ? $(catPagRef) : box.previousElementSibling?.querySelector('.cl-pag'),
      ordenCompletoNuevo, paginaDestino, false
    )
    st.busy = false
    next()
  }
  function next() {
    if (st.queue.length) animate(st.queue.shift())
    else if (viewRef.current === 'rot') startRot()
  }
  function enqueue(ev) { st.queue.push(ev); if (!st.busy) animate(st.queue.shift()) }

  // ---- aplicar datos nuevos del sondeo ----
  useEffect(() => {
    if (!clasif) return
    const cats = (clasif.categorias || []).map(c => ({ id: c.id, nombre: c.nombre }))
    const catsCambiaron = cats.length !== st.cats.length || cats.some((c, i) => c.id !== st.cats[i]?.id)
    st.cats = cats

    const esPrimeraVez = st.vistoIds === null
    if (esPrimeraVez) st.vistoIds = new Set()

    // Nuevos tops: por id estable del resultado (ultimosValidados ya viene más reciente primero).
    const nuevos = (clasif.ultimosValidados || []).filter(u => !st.vistoIds.has(u.id))
    nuevos.forEach(u => st.vistoIds.add(u.id))
    // Límite de memoria del set — una tele encendida todo el día no necesita acumular para siempre.
    if (st.vistoIds.size > 500) {
      const ultimosIds = new Set((clasif.ultimosValidados || []).map(u => u.id))
      st.vistoIds = ultimosIds
    }

    if (esPrimeraVez || catsCambiaron) {
      // Primera carga, o la compe cambió de categorías disponibles: pinta directo, sin animar.
      (clasif.categorias || []).forEach(c => { st.orden[c.id] = (c.clasificacion || []).slice(); if (!st.pagina[c.id]) st.pagina[c.id] = 1 })
      if (!tabsRef.current) return
      drawTabs(false)
      if (viewRef.current === '3') { renderTri(); startTriRot() }
      else { st.catIdx = 0; showCat(0, false); startRot() }
      return
    }

    // Ya había datos: lo que no sea un top nuevo se sincroniza en silencio (sin animación) —
    // cubre ediciones/correcciones manuales que no son "alguien acaba de hacer top".
    const catIdsConEvento = new Set(nuevos.map(u => u.categoria || ''))
    ;(clasif.categorias || []).forEach(c => {
      if (catIdsConEvento.has(c.id)) return
      st.orden[c.id] = (c.clasificacion || []).slice()
      if (viewRef.current === 'rot' && st.cats[st.catIdx]?.id === c.id && !st.busy) {
        showCat(st.catIdx, false)
      } else if (viewRef.current === '3') {
        const box = $(triRef)?.querySelector(`.cl-list[data-cat="${c.id}"]`)
        if (box) {
          const pagEl = box.previousElementSibling?.querySelector('.cl-pag')
          renderCategoria(box, pagEl, st.orden[c.id], st.pagina[c.id] || 1, false)
        }
      }
    })

    // En orden cronológico (más antiguo primero) para que la cola anime en el orden real.
    nuevos.slice().reverse().forEach(u => {
      const catId = u.categoria || ''
      const nueva = (clasif.categorias || []).find(c => c.id === catId)
      if (!nueva) return
      enqueue({
        catId, clave: u.clave, nombreMostrar: u.nombreMostrar, numero: u.numero,
        // 23/11 06:50: puntosGanados es de ESTE resultado concreto (top o bonus, el que sea);
        // puntosTotal es la suma acumulada de la persona, que es lo que se pinta en la fila.
        puntosGanados: u.puntos ?? 0,
        puntosTotal: nueva.clasificacion.find(x => x.clave === u.clave)?.puntos ?? (u.puntos ?? 0),
        ordenCompletoNuevo: nueva.clasificacion.slice(),
      })
    })

    // "Últimos tops" — lista simple, React la pinta directo (no hace falta animación propia,
    // el prototipo solo la hacía entrar con fade, lo cubre la propia animación CSS de .cl-ult li).
  }, [clasif]) // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarVista(v) {
    setView(v)
    viewRef.current = v
    if (st.busy) return
    if (v === '3') { pauseRot(); renderTri(); startTriRot() } else { stopTriRot(); showCat(st.catIdx, true); startRot() }
  }

  // 22/11 14:00/14:05: cuántas filas caben depende de la pantalla REAL (960×540 en la tele de
  // verdad del Roco, no solo el monitor donde se prueba) — se recalcula si cambia el tamaño de
  // la ventana, no solo al cargar.
  useEffect(() => {
    function onResize() {
      if (st.busy) return
      if (viewRef.current === 'rot') showCat(st.catIdx, false)
      else renderTri()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearTimeout(st.rotTimer); clearInterval(st.triTimer) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // "Últimos tops": mismo principio que la clasificación — cuántas caben con la altura real,
  // nunca un número fijo, para que tampoco se corte por abajo (22/11 14:00).
  useEffect(() => {
    const el = ultRef.current
    if (!el) return
    const medir = () => {
      const h = el.clientHeight || 0
      setUltimosCount(h > 0 ? Math.max(3, Math.floor(h / MIN_ULT_PX)) : 8)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ultimos = (clasif?.ultimosValidados || []).slice(0, ultimosCount)

  return (
    <div className={`cl-stage${view === '3' ? ' v3' : ''}`} ref={stageRef}>
      <div className="cl-tabs" ref={tabsRef}></div>
      <div className="cl-body">
        <section className="cl-col-c">
          <div className="cl-h2"><span ref={catTitleRef}>Clasificación</span><span className="cl-pag" ref={catPagRef}></span><span>pts</span></div>
          <div className="cl-list" ref={listRef}></div>
        </section>
        <section className="cl-col-u">
          <div className="cl-h2"><span>Últimos tops</span></div>
          <ul className="cl-ult" ref={ultRef}>
            {ultimos.map((u, i) => (
              <li key={u.id ?? i}>
                <span className="cl-dot" style={{ background: colorPorNumeroBloque(u.numero, totalBloques).bg }} />
                <span><strong>{u.nombreMostrar}</strong> · +{u.puntos} pts · bloque {u.numero} · {u.hace}</span>
              </li>
            ))}
            {ultimos.length === 0 && <li style={{ color: '#6b7280', border: 'none' }}>Nada apuntado todavía.</li>}
          </ul>
        </section>
      </div>
      <div className="cl-tri" ref={triRef}></div>
      <button type="button" className="cl-vista-btn" onClick={() => cambiarVista(view === 'rot' ? '3' : 'rot')} title="Cambiar diseño (rotativo / 3 columnas) — también ?vista=rotativo|columnas en la URL">
        {view === 'rot' ? '⊞' : '⟳'}
      </button>
      {/* ?debug=1 (22/11 14:05, Ramiro): para leer en la tele de verdad qué está midiendo —
          tamaño real de ventana, devicePixelRatio, ?escala= y cuántas filas caben. */}
      {debugOn && debugInfo && (
        <div className="cl-debug">
          {debugInfo.w}×{debugInfo.h}px · dpr {debugInfo.dpr} · escala {debugInfo.escala} · {debugInfo.vista} ·
          {' '}{debugInfo.filasPorPagina} filas/pág. · fila {debugInfo.rowH}px
        </div>
      )}
    </div>
  )
}
