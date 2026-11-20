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

const ROT_MS = 10000
const MAX_ROWS_ROT = 11
const MAX_ROWS_TRI = 13

// "?vista=rotativo|columnas" en la URL de la tele (20/11 06:30) — para comparar las dos en la
// tele real sin tocar código, igual que ya existe "?escala=" en esta misma página.
function vistaInicialDesdeUrl() {
  const v = new URLSearchParams(window.location.search).get('vista')
  return v === 'columnas' ? '3' : 'rot'
}

export default function CompeClasificacionLive({ clasif, totalBloques }) {
  const stageRef = useRef(null)
  const listRef = useRef(null)
  const tabsRef = useRef(null)
  const catTitleRef = useRef(null)
  const triRef = useRef(null)
  const ultRef = useRef(null)

  const [view, setView] = useState(vistaInicialDesdeUrl())
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  // Estado imperativo de la animación — no re-renderiza React, solo pinta el DOM directamente.
  const st = useRef({
    cats: [], // [{id, nombre}] — de clasif.categorias, puede ser 3 o 4 (con "Sin categoría")
    orden: {}, // catId -> array [{nombreMostrar, tops}] en el orden MOSTRADO ahora mismo
    catIdx: 0,
    rotTimer: null,
    busy: false,
    queue: [],
    vistoIds: null, // null hasta el primer dato — así nunca se anima el histórico al cargar
  }).current

  const $ = ref => ref.current

  function drawTabs(paused) {
    const tabs = $(tabsRef)
    if (!tabs) return
    tabs.innerHTML = st.cats.map((c, i) =>
      `<div class="cl-tab${i === st.catIdx ? ' on' : ''}${paused ? ' paused' : ''}" style="--rot:${ROT_MS}ms">${c.nombre}<span class="cl-bar"></span></div>`
    ).join('')
  }
  function startRot() {
    clearTimeout(st.rotTimer)
    drawTabs(false)
    if (st.cats.length < 2) return
    st.rotTimer = setTimeout(() => {
      if (!st.busy) showCat((st.catIdx + 1) % st.cats.length, true)
      startRot()
    }, ROT_MS)
  }
  function pauseRot() { clearTimeout(st.rotTimer); drawTabs(true) }

  function label(p) {
    return p.nombreMostrar || 'Alguien'
  }
  function makeRow(p, i, rowH) {
    const el = document.createElement('div')
    el.className = 'cl-row' + (i < 3 ? ` r${i + 1}` : '')
    el.dataset.nombre = p.nombreMostrar
    el.style.top = (i * rowH) + 'px'
    el.style.setProperty('--i', i)
    el.innerHTML = `<span class="cl-pos">${i + 1}</span><span class="cl-nm">${label(p)}</span><span class="cl-tp">${p.tops}</span>`
    return el
  }
  function renderList(box, orden, rowH, max, flip) {
    if (!box) return
    const r = orden.slice(0, max)
    box.innerHTML = ''
    r.forEach((p, i) => box.appendChild(makeRow(p, i, rowH)))
    if (flip) { box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip') }
  }
  function rowHeightFor(box, max) {
    const h = box?.clientHeight || 0
    return h > 0 ? h / max : 33
  }
  function showCat(i, flip) {
    st.catIdx = i
    const cat = st.cats[i]
    if (!cat) return
    if ($(catTitleRef)) $(catTitleRef).textContent = 'Clasificación ' + cat.nombre.toLowerCase()
    const box = $(listRef)
    renderList(box, st.orden[cat.id] || [], rowHeightFor(box, MAX_ROWS_ROT), MAX_ROWS_ROT, flip)
    drawTabs(false)
  }
  function renderTri() {
    const tri = $(triRef)
    if (!tri) return
    tri.innerHTML = st.cats.map(c => `<div><div class="cl-h2"><span>${c.nombre}</span><span>tops</span></div><div class="cl-list" data-cat="${c.id}"></div></div>`).join('')
    tri.querySelectorAll('.cl-list').forEach(b => renderList(b, st.orden[b.dataset.cat] || [], rowHeightFor(b, MAX_ROWS_TRI), MAX_ROWS_TRI, false))
  }

  const wait = ms => new Promise(r => setTimeout(r, ms))

  // Una actualización animada: ev = { catId, nombreMostrar, numero, color, tops, ordenNuevo }
  async function animate(ev) {
    st.busy = true
    const ci = st.cats.findIndex(c => c.id === ev.catId)
    let box, rowH, max
    if (viewRef.current === 'rot') {
      pauseRot()
      if (ci !== st.catIdx && ci >= 0) { showCat(ci, true); await wait(900); pauseRot() }
      box = $(listRef); rowH = rowHeightFor(box, MAX_ROWS_ROT); max = MAX_ROWS_ROT
    } else {
      box = $(triRef)?.querySelector(`.cl-list[data-cat="${ev.catId}"]`)
      rowH = rowHeightFor(box, MAX_ROWS_TRI); max = MAX_ROWS_TRI
    }
    if (!box) { st.busy = false; return next() }

    const ordenAntes = st.orden[ev.catId] || []
    let before = ordenAntes.findIndex(x => x.nombreMostrar === ev.nombreMostrar)
    let row = before >= 0 ? box.querySelector(`.cl-row[data-nombre="${CSS.escape(ev.nombreMostrar)}"]`) : null
    if (!row) {
      row = makeRow({ nombreMostrar: ev.nombreMostrar, tops: ev.tops - 1 }, max, rowH)
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
    hl.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="4"></rect></svg><span class="cl-tag">+1 TOP${ev.numero ? ` · bloque ${ev.numero}` : ''}</span>`
    box.appendChild(hl)
    void hl.offsetWidth
    hl.classList.add('draw')
    await wait(750)
    hl.classList.add('tagon')

    row.querySelector('.cl-tp').textContent = ev.tops
    row.classList.add('bump')
    await wait(450)

    const ordenNuevo = ev.ordenNuevo
    const after = ordenNuevo.findIndex(x => x.nombreMostrar === ev.nombreMostrar)
    const shown = after >= 0 && after < max ? after : max
    ordenNuevo.forEach((x, i) => {
      if (i >= max && x.nombreMostrar !== ev.nombreMostrar) return
      let el = box.querySelector(`.cl-row[data-nombre="${CSS.escape(x.nombreMostrar)}"]`)
      if (!el) return
      const slot = x.nombreMostrar === ev.nombreMostrar ? shown : i
      el.style.top = (slot * rowH) + 'px'
      el.className = 'cl-row' + (slot < 3 ? ` r${slot + 1}` : '') + (x.nombreMostrar === ev.nombreMostrar ? ' moving' : '')
      const posEl = el.querySelector('.cl-pos')
      if (posEl) posEl.textContent = (x.nombreMostrar === ev.nombreMostrar && after >= max ? after + 1 : i + 1)
      if (i >= max && x.nombreMostrar !== ev.nombreMostrar) el.style.opacity = '0'
    })
    hl.style.top = (shown * rowH - 4) + 'px'
    await wait(1100 + 1400)
    hl.style.opacity = '0'
    row.classList.remove('moving', 'bump')
    await wait(400)
    hl.remove()
    st.orden[ev.catId] = ordenNuevo
    renderList(box, ordenNuevo, rowH, max, false)
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
      (clasif.categorias || []).forEach(c => { st.orden[c.id] = (c.clasificacion || []).slice() })
      if (!tabsRef.current) return
      drawTabs(false)
      if (viewRef.current === '3') renderTri()
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
        renderList($(listRef), st.orden[c.id], rowHeightFor($(listRef), MAX_ROWS_ROT), MAX_ROWS_ROT, false)
      } else if (viewRef.current === '3') {
        const box = $(triRef)?.querySelector(`.cl-list[data-cat="${c.id}"]`)
        if (box) renderList(box, st.orden[c.id], rowHeightFor(box, MAX_ROWS_TRI), MAX_ROWS_TRI, false)
      }
    })

    // En orden cronológico (más antiguo primero) para que la cola anime en el orden real.
    nuevos.slice().reverse().forEach(u => {
      const catId = u.categoria || ''
      const nueva = (clasif.categorias || []).find(c => c.id === catId)
      if (!nueva) return
      enqueue({
        catId, nombreMostrar: u.nombreMostrar, numero: u.numero,
        tops: nueva.clasificacion.find(x => x.nombreMostrar === u.nombreMostrar)?.tops ?? 1,
        ordenNuevo: nueva.clasificacion.slice(),
      })
    })

    // "Últimos tops" — lista simple, React la pinta directo (no hace falta animación propia,
    // el prototipo solo la hacía entrar con fade, lo cubre la propia animación CSS de .cl-ult li).
  }, [clasif]) // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarVista(v) {
    setView(v)
    viewRef.current = v
    if (st.busy) return
    if (v === '3') { pauseRot(); renderTri() } else { showCat(st.catIdx, true); startRot() }
  }

  useEffect(() => () => clearTimeout(st.rotTimer), []) // eslint-disable-line react-hooks/exhaustive-deps

  const ultimos = (clasif?.ultimosValidados || []).slice(0, 8)

  return (
    <div className={`cl-stage${view === '3' ? ' v3' : ''}`} ref={stageRef}>
      <div className="cl-tabs" ref={tabsRef}></div>
      <div className="cl-body">
        <section className="cl-col-c">
          <div className="cl-h2"><span ref={catTitleRef}>Clasificación</span><span>tops</span></div>
          <div className="cl-list" ref={listRef}></div>
        </section>
        <section className="cl-col-u">
          <div className="cl-h2"><span>Últimos tops</span></div>
          <ul className="cl-ult" ref={ultRef}>
            {ultimos.map((u, i) => (
              <li key={u.id ?? i}>
                <span className="cl-dot" style={{ background: colorPorNumeroBloque(u.numero, totalBloques).bg }} />
                <span><strong>{u.nombreMostrar}</strong> · bloque {u.numero} · {u.hace}</span>
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
    </div>
  )
}
