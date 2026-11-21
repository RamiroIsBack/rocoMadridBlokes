import {
  defineConfig
} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base is set via VITE_BASE_PATH env var: /blokes/ (prod, por defecto) o /blokes-dev/ (dev).
  // Cowork, 15/11 18:35: el cartel de la compe salía roto en producción porque el dist/
  // comprometido en el repo (y subido por el workflow sin volver a compilar) se había construido
  // sin VITE_BASE_PATH — el valor por defecto era "/blokes-dev/", así que TODO el bundle (no
  // solo esa imagen) apuntaba a la ruta de desarrollo. El workflow despliega lo que haya en
  // dist/ al hacer `npm run build` a secas, y la rama principal es master → producción, así que
  // el valor por defecto tiene que ser el de producción, no el de desarrollo (justo al revés de
  // como estaba). Para construir para dev: `VITE_BASE_PATH=/blokes-dev/ npm run build`.
  base: process.env.VITE_BASE_PATH || '/blokes/',
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