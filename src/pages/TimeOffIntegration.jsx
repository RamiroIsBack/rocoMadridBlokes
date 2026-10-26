import { useState } from 'react'
import { PROF_META, PROF_ORDER } from '../data/staffSchedule'
import { saveNueve, testNueve, syncNueve } from '../hooks/useTimeOff'
import { matchPerson } from './TimeOffRequests'

// Conexión con 9to5 (app de fichaje). La clave y el secreto se guardan en el
// servidor y no vuelven nunca al navegador: aquí solo se ven sus 4 últimos caracteres.

const fmtWhen = s => (s ? s.replace('T', ' ').slice(0, 16) : '—')

const PERMISOS = {
  'petitions:read': 'leer solicitudes', 'petitions:write': 'aprobar y rechazar', 'absences:read': 'ausencias',
  'incidents:read': 'incidencias', 'work_sessions:read': 'fichajes', 'employees:read': 'trabajadores',
  'holidays:read': 'festivos', 'vacation_balances:read': 'saldos de vacaciones', 'presence:read': 'presencia',
}

// Persona del equipo para un empleado de 9to5: la asociada a mano o, si no, por el nombre
export function personaDeEmpleado(emp, map) {
  return map?.[String(emp.id)] || matchPerson(`${emp.name} ${emp.last_name || ''}`)
}

export default function TimeOffIntegration({ nueve, onChange, connected }) {
  const [key, setKey]       = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy]     = useState(false)
  const [msg, setMsg]       = useState('')
  const [test, setTest]     = useState(null)
  const [open, setOpen]     = useState(!nueve?.configured)

  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 5000) }
  async function run(fn) {
    setBusy(true)
    try { await fn() } catch (e) { flash(`✗ ${e.message}`) } finally { setBusy(false) }
  }

  const guardar = e => {
    e.preventDefault()
    if (!key.trim() && !secret.trim()) return
    run(async () => {
      const res = await saveNueve({ api_key: key.trim(), webhook_secret: secret.trim() })
      onChange(res)
      setKey(''); setSecret('')
      flash('✓ Guardado en el servidor')
    })
  }
  const probar = () => run(async () => setTest(await testNueve()))
  const sincronizar = full => run(async () => {
    const res = await syncNueve(full)
    onChange(res)
    flash(`✓ Sincronizado: ${res.added} nuevas, ${res.updated} actualizadas`)
  })
  const asociar = (empId, persona) => run(async () => {
    const map = { ...(nueve.employee_map || {}) }
    if (persona) map[String(empId)] = persona
    else delete map[String(empId)]
    onChange(await saveNueve({ employee_map: map }))
  })
  const desconectar = () => {
    if (!window.confirm('¿Borrar la clave de 9to5 del servidor? Las solicitudes ya sincronizadas se quedan.')) return
    run(async () => { onChange(await saveNueve({ clear: true })); setTest(null) })
  }

  const n = nueve || {}
  const empleados = (n.employees || []).filter(e => e.active)

  return (
    <div className="sv-section">
      <h3 className="sv-section-title">
        Conexión con 9to5{' '}
        <span className={n.configured ? 'sv-to-good' : 'sv-to-warn-txt'} style={{ fontSize: '0.75rem' }}>
          {n.configured ? `● conectada (clave …${n.key_tail})` : '● sin conectar'}
        </span>
        <button className="sv-filter-btn" style={{ marginLeft: 10 }} onClick={() => setOpen(o => !o)}>{open ? 'Ocultar' : 'Configurar'}</button>
      </h3>
      {n.configured && (
        <p className="sv-note">
          Última sincronización: {fmtWhen(n.last_sync)}
          {n.last_counts && ` (${n.last_counts.added} nuevas, ${n.last_counts.updated} actualizadas)`}.
          {' '}Se sincroniza al abrir esta pestaña y cada hora; con el webhook, al momento.
          {n.last_webhook && ` Último aviso: ${fmtWhen(n.last_webhook.at)} (${n.last_webhook.event}).`}
        </p>
      )}
      {n.configured && (
        <p className="sv-to-small">
          Secreto del webhook:{' '}
          {n.has_secret
            ? <span className="sv-to-good">guardado ✓</span>
            : <span className="sv-to-warn-txt">no guardado ✗ — sin él, los avisos de 9to5 se rechazan y las solicitudes llegan al abrir la pestaña o cada hora</span>}
          {n.last_webhook ? <> · último aviso recibido: {fmtWhen(n.last_webhook.at)}</> : n.has_secret ? ' · todavía no ha llegado ningún aviso' : ''}
        </p>
      )}
      {n.last_error && <p className="sv-error">Último error: {n.last_error}</p>}
      {(n.warnings || []).map((w, i) => <p key={i} className="sv-to-warn-txt" style={{ fontSize: '0.75rem', margin: '2px 0' }}>{w}</p>)}

      <div className="sv-to-form">
        {n.configured && <button className="sv-tests-add" disabled={busy || !connected} onClick={() => sincronizar(false)}>Sincronizar ahora</button>}
        {n.configured && <button className="sv-filter-btn" disabled={busy || !connected} onClick={() => sincronizar(true)}>Volver a traer todo</button>}
        {msg && <span className="sv-tests-feedback">{msg}</span>}
      </div>

      {open && (
        <>
          <form className="sv-to-form" onSubmit={guardar} autoComplete="off">
            <label className="sv-to-inline">
              Clave de API
              <input className="sv-tests-input sv-tests-input--desc" type="password" placeholder={n.configured ? `…${n.key_tail} (escribe una nueva para cambiarla)` : '9to5_…'}
                value={key} onChange={e => setKey(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="sv-to-inline">
              Secreto del webhook
              <input className="sv-tests-input sv-tests-input--desc" type="password" placeholder={n.has_secret ? 'guardado (escribe uno nuevo para cambiarlo)' : 'whsec_…'}
                value={secret} onChange={e => setSecret(e.target.value)} autoComplete="new-password" />
            </label>
            <button className="sv-tests-add" type="submit" disabled={busy || !connected || (!key.trim() && !secret.trim())}>Guardar en el servidor</button>
            {n.configured && <button className="sv-filter-btn" type="button" disabled={busy} onClick={probar}>Probar conexión</button>}
            {n.configured && <button className="sv-tests-remove" type="button" disabled={busy} onClick={desconectar} title="Borrar la clave">Desconectar</button>}
          </form>
          <p className="sv-note">
            La clave se guarda solo en el servidor y no se vuelve a mostrar. Si alguna vez se comparte por correo o chat,
            pide a 9to5 que la regeneren y pega aquí la nueva.
          </p>

          {test && (
            <div className="sv-class-detail">
              <div className="sv-class-detail__title">{test.success ? '✓ Conexión correcta' : '✗ No conecta'}</div>
              {test.error && <p className="sv-error">{test.error}</p>}
              {test.me && (() => {
                const d = test.me.data || test.me
                const scopes = d.key?.scopes || []
                return (
                  <>
                    <p className="sv-to-small">
                      Empresa: <strong>{d.company?.display_name || d.company?.name || '—'}</strong>
                      {d.key?.name && <> · clave «{d.key.name}»</>}
                      {d.key?.expires_at ? <> · caduca el {fmtWhen(d.key.expires_at)}</> : <> · sin caducidad</>}
                    </p>
                    <p className="sv-to-small">{scopes.length} permisos: {scopes.map(x => PERMISOS[x] || x).join(', ')}.</p>
                    <details className="sv-to-fold"><summary>Detalles técnicos</summary><pre className="sv-to-pre">{JSON.stringify(test.me, null, 2)}</pre></details>
                  </>
                )
              })()}
              {test.ip && (
                <p className="sv-note">
                  IP de nuestro servidor: <strong>{test.ip}</strong> — pásasela a 9to5 para que limiten la clave a ella.
                  Si el hosting cambiara de IP, la conexión dejaría de funcionar hasta actualizarla.
                </p>
              )}
            </div>
          )}

          <p className="sv-note">
            Dirección del webhook para darle a 9to5: <code className="sv-to-code">{n.webhook_url}</code>
          </p>
        </>
      )}

      {empleados.length > 0 && (
        <>
          <h4 className="sv-to-subtitle">Trabajadores de 9to5</h4>
          <p className="sv-note">Cada trabajador de 9to5 se asocia con una persona del equipo por el nombre; si no coincide, elígela aquí.</p>
          <div className="sv-tests-scroll">
            <table className="sv-tests-table">
              <thead><tr><th>En 9to5</th><th>Persona en el equipo</th></tr></thead>
              <tbody>
                {PROF_ORDER.filter(p => !empleados.some(e => (n.employee_map?.[String(e.id)] || matchPerson(`${e.name} ${e.last_name || ''}`)) === p)).map(p => (
                  <tr key={`falta-${p}`}>
                    <td className="sv-to-warn-txt">— no está en 9to5 —</td>
                    <td style={{ color: PROF_META[p]?.color, fontWeight: 700 }}>{p} <span className="sv-ot-muted sv-to-small">(sus vacaciones van a mano)</span></td>
                  </tr>
                ))}
                {empleados.map(e => {
                  const manual = n.employee_map?.[String(e.id)]
                  const auto = matchPerson(`${e.name} ${e.last_name || ''}`)
                  const actual = manual || auto || ''
                  return (
                    <tr key={e.id}>
                      <td>{e.name} {e.last_name}</td>
                      <td>
                        <select className="sv-tests-select" value={manual || ''} disabled={busy}
                          style={{ color: PROF_META[actual]?.color }}
                          onChange={ev => asociar(e.id, ev.target.value)}>
                          <option value="">{auto ? `${auto} (por el nombre)` : 'No es del equipo'}</option>
                          {PROF_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
