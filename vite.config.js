import {
  defineConfig
} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base is set via VITE_BASE_PATH env var: /blokes-dev/ (dev) or /blokes/ (prod)
  base: process.env.VITE_BASE_PATH || '/blokes-dev/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  // Sello de hora de build en el bundle (visible en consola) — hace que el contenido del JS
  // cambie SIEMPRE, aunque el código fuente no haya cambiado nada. Así un redeploy siempre
  // produce un hash nuevo y nunca puede quedarse pisado por el `Cache-Control: max-age=31536000`
  // de un fichero anterior en caché (cowork, 3/11 12:55: una subida que quedó corrupta se quedó
  // cacheada un año en el navegador de quien cargó Blokes justo en ese minuto).
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})