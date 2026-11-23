import { useState, useMemo } from 'react'
import { useHorarios, createHorario, updateHorario, deleteHorario, importHorarios } from '../hooks/useDiario'

// Diario › Horarios y cronograma (22/11/2026): traslado desde Notion de «Personal en el Roco»
// (cronograma: quién está en el Roco y haciendo qué) y del horario de clases. Columnas por día
// de la semana, como el tablero de Notion. Socio y gestión lo cambian; el resto lo ve.

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
// En el cronograma no se ponen «Clase» a mano: salen solas del Horario de clases (23/11)
const TIPOS = {
  cronograma: ['Equipamiento', 'Recepción', 'Otro'],
  clases:     ['Adultos', 'Infantil', 'Pilates', 'Yoga'],
}

const aMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
// Las clases de cada profe en cada día, juntando las seguidas (hueco de 1 h o menos) en una
// sola franja «Clase» del cronograma: así el cronograma nunca se desincroniza del horario.
export function clasesComoCronograma(items) {
  const grupos = {}
  items.filter(it => it.board === 'clases').forEach(it => {
    const k = `${it.day}|${it.person}`
    ;(grupos[k] = grupos[k] || []).push(it)
  })
  const out = []
  Object.values(grupos).forEach(lista => {
    lista.sort((a, b) => a.start.localeCompare(b.start))
    let cur = null
    lista.forEach(it => {
      if (cur && aMin(it.start) <= aMin(cur.end) + 60) {
        if (it.end > cur.end) cur.end = it.end
        cur.n++
      } else {
        if (cur) out.push(cur)
        cur = { id: `auto-${it.day}-${it.person}-${it.start}`, board: 'cronograma', day: it.day, start: it.start, end: it.end, person: it.person, kind: 'Clase', auto: true, n: 1 }
      }
    })
    if (cur) out.push(cur)
  })
  return out
}
const BOARDS = [
  { id: 'cronograma', label: 'Cronograma', hint: 'Quién está en el Roco y haciendo qué (las clases salen solas del horario de clases)' },
  { id: 'clases',     label: 'Horario de clases', hint: 'Cada clase con su profe' },
]

// Un color suave por persona (siempre el mismo para el mismo nombre)
const PALETA = ['#fbe3d4', '#dbeafe', '#e5eee6', '#fce7f3', '#fdf3d0', '#ede9fe', '#e0f2f1', '#f3e8e2']
const colorDe = nombre => {
  let h = 0
  for (const c of (nombre || '').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETA[h % PALETA.length]
}
const pad = n => String(n).padStart(2, '0')
const ahoraHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const hoyIdx = () => (new Date().getDay() + 6) % 7

function HorarioForm({ board, day, initial, nombres, onClose, onSaved }) {
  const [f, setF] = useState({
    day: initial?.day ?? day, start: initial?.start || '', end: initial?.end || '',
    person: initial?.person || '', kind: initial?.kind || TIPOS[board][0], note: initial?.note || '',
  })
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const [copias, setCopias] = useState([])   // «Copiar también a…»: otros días con el mismo bloque
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const toggleCopia = i => setCopias(c => c.includes(i) ? c.filter(x => x !== i) : [...c, i])
  const submit = async e => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const body = { ...f, day: Number(f.day), board }
      if (initial) await updateHorario(initial.id, body)
      else await createHorario(body)
      for (const d of copias) await createHorario({ ...body, day: d })
      onSaved()
    } catch (err) { setError(err.message); setBusy(false) }
  }
  const borrar = async () => {
    if (!window.confirm('¿Borrar este bloque del horario?')) return
    setBusy(true)
    try { await deleteHorario(initial.id); onSaved() } catch (err) { setError(err.message); setBusy(false) }
  }
  return (
    <form className="hor-form" onSubmit={submit}>
      <input className="dash-input" list="hor-nombres" required placeholder="¿Quién?" maxLength={120} autoFocus
        value={f.person} onChange={e => set('person', e.target.value)} />
      <datalist id="hor-nombres">{nombres.map(n => <option key={n} value={n} />)}</datalist>
      <div className="hor-form__row">
        <input type="time" className="dash-input" required value={f.start} onChange={e => set('start', e.target.value)} aria-label="Desde" />
        <input type="time" className="dash-input" required value={f.end} onChange={e => set('end', e.target.value)} aria-label="Hasta" />
      </div>
      <div className="hor-form__row">
        <select className="dash-input" value={f.kind} onChange={e => set('kind', e.target.value)}>
          {TIPOS[board].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="dash-input" value={f.day} onChange={e => set('day', e.target.value)}>
          {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </div>
      <input className="dash-input" placeholder="Nota (opcional)" maxLength={255} value={f.note} onChange={e => set('note', e.target.value)} />
      <div className="hor-copias">
        <span>Copiar también a</span>
        {DIAS.map((d, i) => i !== Number(f.day) && (
          <label key={d} className={`hor-copia${copias.includes(i) ? ' hor-copia--on' : ''}`} title={d}>
            <input type="checkbox" checked={copias.includes(i)} onChange={() => toggleCopia(i)} />
            {LETRAS[i]}
          </label>
        ))}
      </div>
      {error && <p className="dash-error">{error}</p>}
      <div className="dash-form__actions">
        <button className="dash-btn dash-btn--primary" disabled={busy}>{busy ? '…' : 'Guardar'}</button>
        <button type="button" className="dash-btn" onClick={onClose}>Cancelar</button>
        {initial && <button type="button" className="dash-mini dash-mini--danger" onClick={borrar} disabled={busy}>Borrar</button>}
      </div>
    </form>
  )
}

// Traslado inicial desde Notion: pegar el texto que preparó Code (solo socios)
function Importar({ board, onClose, onDone }) {
  const [texto, setTexto] = useState('')
  const [busy, setBusy]   = useState(false)
  const [msg, setMsg]     = useState('')
  const importar = async () => {
    setMsg('')
    let items
    try { items = JSON.parse(texto) } catch { setMsg('Ese texto no se entiende: pega exactamente el que te pasé.'); return }
    if (!Array.isArray(items)) items = items[board]
    if (!Array.isArray(items) || !items.length) { setMsg(`No veo nada para «${board}» en ese texto.`); return }
    if (!window.confirm(`Se van a cargar ${items.length} bloques en «${BOARDS.find(b => b.id === board).label}», sustituyendo lo que haya. ¿Seguimos?`)) return
    setBusy(true)
    try { const n = await importHorarios(board, items, true); onDone(n) } catch (err) { setMsg(err.message); setBusy(false) }
  }
  return (
    <div className="hor-import">
      <strong>Importar «{BOARDS.find(b => b.id === board).label}» desde Notion</strong>
      <textarea className="dash-input" rows={4} placeholder="Pega aquí el texto del traslado" value={texto} onChange={e => setTexto(e.target.value)} />
      {msg && <p className="dash-error">{msg}</p>}
      <div className="dash-form__actions">
        <button type="button" className="dash-btn dash-btn--primary" disabled={busy || !texto.trim()} onClick={importar}>{busy ? 'Importando…' : 'Importar'}</button>
        <button type="button" className="dash-btn" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

export default function DiarioHorarios({ nombres = [] }) {
  const { data, error, reload } = useHorarios(true)
  const [board, setBoard]     = useState('cronograma')
  const [editando, setEditando] = useState(null)   // { day } nuevo · item
  const [importar, setImportar] = useState(false)
  const [aviso, setAviso]     = useState('')
  const items = data?.items ?? []
  const canEdit = !!data?.can_edit
  const hoy = hoyIdx()

  // Cronograma = lo puesto a mano (Equipamiento, Recepción, Otro) + las clases, que salen solas
  // del Horario de clases. Las «Clase» que entraron a mano con la importación de Notion ya no
  // se usan (el horario de clases manda).
  const cronoItems = useMemo(() => [
    ...items.filter(it => it.board === 'cronograma' && it.kind !== 'Clase'),
    ...clasesComoCronograma(items),
  ], [items])

  // Ahora en el Roco: lo del cronograma de hoy que está pasando en este momento
  const ahora = useMemo(() => {
    const t = ahoraHHMM()
    const deHoy = cronoItems.filter(it => it.day === hoy)
    const ya = deHoy.filter(it => it.start <= t && t < it.end)
    const prox = deHoy.filter(it => it.start > t).sort((a, b) => a.start.localeCompare(b.start))[0]
    return { ya, prox }
  }, [cronoItems, hoy])

  const delBoard = board === 'cronograma' ? cronoItems : items.filter(it => it.board === board)
  const dias = DIAS.map((nombre, i) => ({ i, nombre, its: delBoard.filter(it => it.day === i).sort((a, b) => a.start.localeCompare(b.start) || a.person.localeCompare(b.person)) }))
    .filter(d => d.i < 5 || d.its.length > 0)
  const todosNombres = [...new Set([...nombres, ...items.map(it => it.person)])].sort()

  const guardado = () => { setEditando(null); reload() }

  return (
    <div className="hor">
      <section className="hor-ahora">
        <span className="hor-ahora__dot" aria-hidden="true" />
        {ahora.ya.length > 0 ? (
          <span><b>Ahora en el Roco:</b> {ahora.ya.map(it => `${it.person} (${it.kind || 'en el Roco'} hasta las ${it.end})`).join(' · ')}</span>
        ) : (
          <span><b>Ahora mismo no hay nadie en el Roco</b> según el cronograma{ahora.prox ? ` · Próximo: ${ahora.prox.person} a las ${ahora.prox.start}` : ''}.</span>
        )}
      </section>

      <div className="hor-bar">
        <div className="dash-form__seg">
          {BOARDS.map(b => (
            <button key={b.id} type="button" className={`dash-btn${board === b.id ? ' dash-btn--on' : ''}`}
              onClick={() => { setBoard(b.id); setEditando(null); setImportar(false) }}>{b.label}</button>
          ))}
        </div>
        <span className="hor-bar__hint">{BOARDS.find(b => b.id === board).hint}{canEdit ? ' · pulsa un bloque para cambiarlo' : ''}</span>
        {data?.can_import && (
          <button type="button" className="dash-gear" title="Importar desde Notion" onClick={() => setImportar(v => !v)}>⇪</button>
        )}
      </div>

      {importar && <Importar board={board} onClose={() => setImportar(false)} onDone={n => { setImportar(false); setAviso(`✓ ${n} bloques importados`); reload() }} />}
      {aviso && <p className="hor-aviso">{aviso}</p>}
      {error && <p className="dash-error">No se pudo cargar: {error}</p>}
      {data && delBoard.length === 0 && !importar && (
        <p className="dash-empty">Todavía no hay nada en este horario.{canEdit ? ' Añade bloques con «+ Añadir» en cada día.' : ''}</p>
      )}

      <div className="hor-board">
        {dias.map(d => (
          <div key={d.i} className={`hor-col${d.i === hoy ? ' hor-col--hoy' : ''}`}>
            <div className="hor-col__head">
              <span className="hor-col__dia">{d.nombre}</span>
              <span className="hor-col__n">{d.its.length}</span>
            </div>
            {d.its.map(it => (
              editando?.id === it.id ? (
                <HorarioForm key={it.id} board={board} initial={it} nombres={todosNombres} onClose={() => setEditando(null)} onSaved={guardado} />
              ) : (
                <button key={it.id} type="button" className={`hor-card hor-card--${board}${it.auto ? ' hor-card--auto' : ''}`}
                  disabled={!canEdit && !it.auto}
                  title={it.auto ? 'Sale solo del Horario de clases: cámbialo allí' : undefined}
                  style={board === 'clases' ? { background: colorDe(it.person) } : undefined}
                  onClick={() => it.auto ? setBoard('clases') : canEdit && setEditando(it)}>
                  <span className="hor-card__quien">{it.person}</span>
                  {board === 'cronograma' && it.kind && <span className={`hor-tag hor-tag--${it.kind.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`}>{it.kind}</span>}
                  {board === 'clases' && it.kind && <span className="hor-card__tipo">{it.kind}</span>}
                  <span className="hor-card__hora">{it.start.replace(/^0/, '')}–{it.end.replace(/^0/, '')}</span>
                  {it.note && <span className="hor-card__nota">{it.note}</span>}
                  {it.auto && <span className="hor-card__nota">del horario de clases{it.n > 1 ? ` · ${it.n} clases` : ''}</span>}
                </button>
              )
            ))}
            {canEdit && (editando?.day === d.i && !editando.id ? (
              <HorarioForm board={board} day={d.i} nombres={todosNombres} onClose={() => setEditando(null)} onSaved={guardado} />
            ) : (
              <button type="button" className="hor-add" onClick={() => setEditando({ day: d.i })}>+ Añadir</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
