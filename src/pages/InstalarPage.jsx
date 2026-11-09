import { useState, useEffect, useRef } from 'react'
import './InstalarPage.css'

const CLUB_URL      = import.meta.env.VITE_CLUB_WORDPRESS_URL || 'https://rocomadrid.com/club'
const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || 'https://rocomadrid.com'
const ICON_URL       = `${import.meta.env.BASE_URL}icons/icon-512.png`

function detectarEntorno() {
  const ua = navigator.userAgent || ''
  const esIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream
  const esAndroid = /android/i.test(ua)
  // Navegador interno de WhatsApp/Instagram/Facebook — ahí no hay beforeinstallprompt ni
  // "Añadir a pantalla de inicio" (Ramiro, 09/11 11:53). En Android, ese webview también
  // suele llevar "; wv)" en el user-agent.
  const esWebviewEmbebido = /FBAN|FBAV|Instagram|WhatsApp|Line\//i.test(ua) || (esAndroid && /; wv\)/i.test(ua))
  return { esIOS, esAndroid, esWebviewEmbebido }
}

function registrarEvento(tipo) {
  fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/install-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo }),
  }).catch(() => {})
}

function cuentaAtrasTexto(compDate, compEndDate) {
  const ahora = new Date()
  const inicio = new Date(`${compDate}T00:00:00`)
  const fin = new Date(`${compEndDate || compDate}T23:59:59`)
  if (ahora > fin) return 'ya celebrada'
  if (ahora >= inicio) return '¡hoy toca!'
  const dias = Math.ceil((inicio - ahora) / 86400000)
  return dias === 1 ? 'mañana' : `en ${dias} días`
}

function fechaRango(compDate, compEndDate) {
  const opts = { day: 'numeric', month: 'long' }
  const ini = new Date(`${compDate}T00:00:00`).toLocaleDateString('es-ES', opts)
  if (!compEndDate || compEndDate === compDate) return ini
  const fin = new Date(`${compEndDate}T00:00:00`).toLocaleDateString('es-ES', opts)
  return `${ini} – ${fin}`
}

export default function InstalarPage() {
  const entorno = useRef(detectarEntorno()).current
  const [compe, setCompe] = useState(null)
  const [yaInstalada, setYaInstalada] = useState(false)
  const [sinPrompt, setSinPrompt] = useState(false)
  const promptEventRef = useRef(null)

  useEffect(() => {
    setYaInstalada(!!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches))

    fetch(`${CLUB_URL}/wp-json/progreso/v1/compe/proxima`)
      .then(r => r.json())
      .then(d => { if (d?.success && d.data) setCompe(d.data) })
      .catch(() => {})

    // Solo aquí se captura beforeinstallprompt — y solo aquí se hace preventDefault(), para
    // no tapar el aviso nativo de Chrome en el resto de la app (Ramiro, 09/11 11:53).
    const onBeforeInstall = (e) => {
      e.preventDefault()
      promptEventRef.current = e
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const abrirEnChrome = () => {
    const destino = window.location.href.replace(/^https?:\/\//, '')
    window.location.href = `intent://${destino}#Intent;scheme=https;package=com.android.chrome;end`
  }

  const instalar = async () => {
    registrarEvento('instalar_click')
    const evento = promptEventRef.current
    if (!evento) {
      setSinPrompt(true)
      return
    }
    try {
      await evento.prompt()
      promptEventRef.current = null
    } catch {
      registrarEvento('prompt_fail')
      setSinPrompt(true)
    }
  }

  return (
    <div className="instalar">
      <img className="instalar__logo" src={ICON_URL} alt="Blokes" />
      <h1 className="instalar__titulo">Blokes</h1>

      {compe ? (
        <p className="instalar__gancho">
          {compe.nombre} — {fechaRango(compe.compDate, compe.compEndDate)}
          <br />
          <span className="instalar__cuenta-atras">{cuentaAtrasTexto(compe.compDate, compe.compEndDate)}</span>
        </p>
      ) : (
        <p className="instalar__gancho">La app para apuntar tus tops de búlder</p>
      )}

      {yaInstalada ? (
        <div className="instalar__ya-tienes">✓ Ya la tienes instalada</div>
      ) : entorno.esWebviewEmbebido ? (
        entorno.esAndroid ? (
          <button className="instalar__cta" onClick={abrirEnChrome}>Abrir en Chrome para instalar</button>
        ) : (
          <div className="instalar__pasos">
            <h2>Para instalarla, ábrela en Safari:</h2>
            <ol>
              <li>Toca <strong>⋯</strong> o el icono de Safari, arriba o abajo de esta pantalla.</li>
              <li>Elige <strong>"Abrir en Safari"</strong>.</li>
              <li>Ahí, toca compartir <strong>⬆️</strong> y luego <strong>"Añadir a pantalla de inicio"</strong>.</li>
            </ol>
          </div>
        )
      ) : entorno.esIOS ? (
        <div className="instalar__pasos">
          <h2>En iPhone (no sale un botón, se hace así):</h2>
          <ol>
            <li>Toca el icono de compartir <strong>⬆️</strong> (abajo en Safari).</li>
            <li>Elige <strong>"Añadir a pantalla de inicio"</strong>.</li>
          </ol>
        </div>
      ) : (
        <>
          <button className="instalar__cta" onClick={instalar}>📲 Instalar Blokes</button>
          {sinPrompt && (
            <div className="instalar__pasos">
              <h2>Tu navegador no deja instalar con un botón. Hazlo así:</h2>
              <ol>
                <li>Abre el menú <strong>⋮</strong> arriba a la derecha.</li>
                <li>Elige <strong>"Instalar aplicación"</strong> o <strong>"Añadir a pantalla de inicio"</strong>.</li>
              </ol>
            </div>
          )}
        </>
      )}

      <div className="instalar__about">
        <h2>Cómo funciona la compe</h2>
        <ul>
          <li>30 de noviembre – 4 de diciembre, en el horario normal del Roco.</li>
          <li>16 bloques numerados.</li>
          <li>1 h 30 desde tu primer top, en tu clase o, si vas por libre, cuando empieces.</li>
          <li>Apuntas tus tops desde el móvil (o te ayudan los profes y Eva en recepción); de buena fe, lo ven tus compañeros.</li>
          <li>Clasificación en directo en la tele.</li>
          <li>Cuenta para la Liga de 3 compes al año, con premios en la fiesta de junio.</li>
        </ul>
      </div>

      <a className="instalar__login" href={`${import.meta.env.BASE_URL}`}>Inicia sesión o crea tu cuenta →</a>
    </div>
  )
}
