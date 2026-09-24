# Onboarding — Blokes / Rocoteca Madrid

Documento de contexto para quien se incorpore a este repo. No sustituye a preguntar,
pero explica el "por qué" de decisiones que no son obvias solo leyendo el código.

> Nota: `DEPLOY.md`, `DEPLOYMENT_GUIDE.md` y `LOCAL_TESTING_GUIDE.md` en la raíz están
> **desactualizados** (describen una versión anterior del proyecto, antes de la migración
> a WordPress/multisite, y mencionan plugins/mecanismos que ya no se usan). Este documento
> y `.github/workflows/deploy.yml` son la fuente de verdad actual.

## 1. Qué es esto

App web para gestión de un club de escalada (Rocoteca Madrid), montada como una SPA de
React que vive dentro de un WordPress (SiteGround), en `https://rocomadrid.com/blokes`.

Cubre: galería de "blokes" (problemas/vías de boulder) con valoraciones, entrenamientos
(tests físicos), ligas internas, fichaje/ausencias de profesores, estadísticas de negocio
(ingresos, clases) y un panel de administración.

**Origen histórico**: el proyecto empezó como una web estática que leía datos de un
Google Form → Google Sheets. Ese flujo (`src/hooks/useGoogleSheets.js`,
`src/utils/googleDriveUtils.js`) **sigue en el repo pero es código muerto** — nada lo
importa hoy. Se dejó como referencia/plan de rollback (ver `DEPLOY.md`), no lo uses como
guía de cómo funciona la app actual.

## 2. Stack

- **Frontend**: React 18 + Vite 4 (se fijó en 4.x cuando la máquina de desarrollo tenía
  Node 16; hoy es Node 20, pero no hay motivo para subir) + React Router 7. Sin
  CSS-in-JS, CSS plano por componente.
- **Backend**: WordPress + WooCommerce, en modo **multisite**. Todo el estado real
  (usuarios, blokes, entrenamientos, ligas, suscripciones) vive en WordPress, expuesto
  vía REST API custom. React no tiene backend propio.
- **Hosting**: SiteGround, desplegado por FTP vía GitHub Actions.

## 3. Multisite: dos "sitios" distintos

Es una instalación **WordPress multisite** (el código usa `switch_to_blog(1)` y
`switch_to_blog(3)`). En conversaciones y notas antiguas se habla de "dos WordPress
separados": son los dos sitios de esa red. Los hooks pegan a uno u otro:

- **Blog 1** (`https://rocomadrid.com`, `VITE_WORDPRESS_URL`) — sitio principal: blokes,
  perfiles, ligas, rol de usuario (whitelists de email).
- **Blog 3, "club"** (`https://rocomadrid.com/club`, `VITE_CLUB_WORDPRESS_URL`) —
  subsite con WooCommerce + WooCommerce Subscriptions: entrenamientos, clases,
  supervisión, estadísticas de negocio. El plugin principal hace `switch_to_blog(3)`
  para leer suscripciones desde aquí.

Si algo de entrenamientos/clases/superadmin no funciona en local, revisa primero si
apunta a `VITE_CLUB_WORDPRESS_URL` en vez de `VITE_WORDPRESS_URL`.

## 4. Sistema de roles — OJO, no son roles de WordPress

`blokes_get_app_role()` en [progreso-extension1-1.php](progreso-extension1-1.php) calcula
el rol de la app **comparando el email del usuario logueado contra listas blancas**
(`socios`, `gestion`, `profesores`), guardadas en `wp_options` (`blokes_email_lists`,
editable solo por `socio` vía `PUT /blokes/v1/admin/email-lists`). Es independiente de
los roles nativos de WordPress (`administrator`, `editor`, etc.) — por eso plugins tipo
*User Role Editor* no tienen ningún efecto sobre los permisos de la app.

Jerarquía: `socio > gestion > profesor > member (logueado, sin lista) > guest`.

El rol se calcula en PHP y se inyecta en `window.blokesSiteData.userRole` (ver
`wp_head` hook y `server-index.php`). El frontend:
- Usa ese rol para **ocultar** enlaces de navegación (`src/App.jsx`).
- **Cada página vuelve a comprobar el rol por su cuenta** (`['profesor','gestion','socio'].includes(...)`)
  y muestra "Acceso restringido" si no cuadra — así que entrar directo por URL no salta
  el control, aunque el link esté oculto.

Páginas protegidas: `/setter`, `/stats`, `/entrenamientos`, `/fichaje`, `/time-off`
(profesor+), `/supervision` (gestion+), `/superadmin` y `/playground` (solo `socio`).

## 5. Rutas del frontend (`src/App.jsx`)

| Ruta | Página | Qué hace |
|---|---|---|
| `/` | `MainPage` | Galería de blokes (filtros, "hecho", valoración estrella/calavera) |
| `/progreso` | `ProgresoIndexPage` | Shell con pestañas → redirige a `/progreso/comunidad` |
| `/progreso/comunidad` | `ProgresoPage` | Estadísticas comunitarias, ligas |
| `/progreso/clase` | `MiClaseTab` | Progreso de tu clase dirigida (requiere login) |
| `/progreso/yo` | `UserStatsPage` | Dashboard personal (requiere login) |
| `/mis-blokes` | — | Redirect legacy a `/progreso/yo` |
| `/setter` | `AdminApp` | Crear/editar blokes |
| `/stats` | `StatsPage` | Panel de analítica/administración de blokes |
| `/entrenamientos` | `EntrenamientosPage` | Registro de tests físicos |
| `/fichaje`, `/time-off` | `FichajePage`, `TimeOffPage` | Iframes a URLs externas (hoy vacías → "Próximamente"). **Quitados del menú** (24/09/2026): fichaje y vacaciones se gestionarán en una app externa. Rutas y páginas siguen existiendo por URL directa |
| `/superadmin` | `SuperAdminPage` | Ingresos, productos, clases, gastos |
| `/supervision` | `SupervisionPage` | Roster de alumnos, catálogo de tests, control fichaje/ausencias |
| `/playground` | `PlaygroundPage` | Horarios/roster de profesores |
| `/ligas` | `LeaguesPage` | Liga propia + leaderboard + resto de ligas como secciones colapsables |

## 6. Backend — plugins PHP (carpeta raíz del repo)

- **[progreso-extension1-1.php](progreso-extension1-1.php)** — el plugin activo hoy.
  Registra todas las rutas REST (`blokes/v1`, `progreso/v1`, `superadmin/v1`), calcula
  el rol de app, sirve el shell de la SPA para los slugs `blokes`/`blokes-dev`, e
  inyecta `window.blokesSiteData`. Es lo único que se sube automáticamente al servidor
  (ver despliegue).
- **`blokes-extension/`** (`blokes-extension.php` v1.2.0, `wordpress-blokes-extension.php`
  v1.1.0) — **versiones antiguas/supersedidas** del mismo plugin. El propio docblock de
  `progreso-extension1-1.php` avisa: *"Replaces Blokes Extension v1.5.0 — nunca actives
  los dos a la vez, registran las mismas rutas."* Se mantienen en el repo como
  referencia histórica, no se despliegan.
- **`rocomadrid-step-form/`** — sistema de checkout WooCommerce (paso a paso) para las
  suscripciones de clases del club. Ya **no se instala como plugin independiente**: su
  propio docblock dice que se migró al tema `neve-child`, cargado desde
  `custom/functions.php`, y solo arranca en el subsite `blog_id === 3` ("club"). La
  clase `RocoMadrid_SF_Stats` (`class-stats.php`) es la que usa
  `progreso-extension1-1.php` para leer suscripciones — dependencia cruzada entre ambos.
- **`server-index.php`** — se despliega como `index.php` en la raíz de `/blokes/`.
  Hace de forma standalone lo mismo que el hook `wp_head` del plugin (calcula rol,
  construye `blokesSiteData`, sirve el HTML de la SPA), porque el `index.php` de la
  carpeta no pasa por el `template_redirect` de WordPress de la misma manera que una
  página normal.
- Los `.zip` sueltos en la raíz (`blokes-extension-v*.zip`, `progreso-extension1.0.zip`)
  son snapshots históricos de builds anteriores del plugin, probablemente para
  instalación manual vía WP Admin → Plugins → Subir plugin. No hay flujo automatizado
  documentado para ellos.

## 7. Autenticación

No hay JWT. Conviven dos mecanismos:
- **Sesión de WordPress + nonce** (el camino "bueno"): PHP inyecta `nonce`/`clubNonce`
  en `blokesSiteData`; el frontend los manda como header `X-WP-Nonce` con
  `credentials: 'include'`.
- **Shim legacy sin login**: un filtro `rest_pre_dispatch` autentica automáticamente
  como el primer administrador del sitio para ciertas rutas antiguas de blokes
  (`create`, `update-acf`, `delete`, subida de imagen). Está marcado en el propio código
  como `TODO: eliminar cuando /blokes use sesión WP` — es deuda técnica conocida, no un
  bug a "arreglar" sin más contexto.

## 8. Despliegue (`.github/workflows/deploy.yml`)

El proyecto son **dos partes que se despliegan distinto**: el frontend React y el
plugin PHP (backend). Ambas las sube el mismo workflow por FTP, pero con una diferencia
crucial: **el workflow NO compila nada**.

Push a `master` → producción (`/blokes/`, secret `SFTP_REMOTE_PATH_PROD`).
Push a `dev` → pruebas (`/blokes-dev/`, secret `SFTP_REMOTE_PATH`).
También se puede lanzar a mano (`workflow_dispatch`).

### 8.1 Frontend React — hay que compilar y commitear `dist/` ANTES del push

El workflow solo sube lo que ya está guardado en `dist/` del repositorio. Si haces push
solo del código fuente (`src/`), el workflow sale en verde pero **el sitio no cambia**.
(`dist/` está en git a propósito desde el commit `0f6b7a6`, "track dist/ en git,
workflow solo FTP sin build CI".)

Flujo correcto para un cambio de frontend:
1. `git pull` de la rama en la que trabajas.
2. `npm run build` → regenera `dist/` (assets con hash en el nombre).
3. Commit de `src/` **y** `dist/`, push.

Flujo verificado el 24/09/2026: build + commit de `dist/` + push a `dev` → el cambio se
ve en `blokes-dev` (hacer Ctrl+F5 para saltarse la caché del navegador).

Detalles:
- El `base` de Vite sale de `VITE_BASE_PATH` y por defecto es `/blokes-dev/`. Para
  `dev` basta `npm run build`. Para producción hay que compilar con
  `VITE_BASE_PATH=/blokes/ npm run build`, así que **el `dist/` de `dev` y el de
  `master` no son intercambiables**: no mergees `dev` → `master` sin recompilar.
- Los assets llevan hash, así que si dos personas compilan a la vez habrá **conflictos
  en `dist/`** al hacer merge. Solución: `git pull`, recompilar, commitear el resultado
  (no intentes resolver los ficheros minificados a mano).
- El workflow borra todo `assets/` del servidor y sube el contenido de `dist/assets/`.
  `server-index.php` coge el primer `.js` y el primer `.css` de `assets/`, por eso
  `dist/assets/` debe contener un solo `.js` y un solo `.css` (lo normal en este build).
- Se sube también `server-index.php` (como `index.php`) y `public/.htaccess` (con el
  `RewriteBase` sustituido según la rama). El `dist/index.html` en sí se borra del
  servidor: la página la genera `server-index.php`.

### 8.2 Plugin PHP (backend) — no necesita build

`progreso-extension1-1.php` se sube tal cual a `SFTP_PLUGIN_PATH`, en cada push a
`dev` o a `master`. Ojo con esto:
- Es **el mismo fichero y la misma ruta para las dos ramas** — no existe una versión
  "dev" del plugin. Un push a `dev` con cambios en el PHP puede afectar a lo que use
  producción si comparten carpeta de plugins. Tratad los cambios del PHP como si fueran
  a producción aunque hagáis push a `dev`.
- Un plugin subido solo tiene efecto en los sitios de WordPress donde **está activado**.
  Según notas previas del proyecto (no verificables desde el código, confirmar con
  Ramiro): el plugin nuevo está activo en el sitio "club" (blog 3), y el sitio principal
  (blog 1, donde vive `/blokes`) sigue con el plugin viejo (`blokes-extension`, que
  devuelve el rol `'superadmin'` en vez de `'socio'`). Por eso `src/main.jsx` traduce
  `superadmin → socio` y `admin → gestion` antes de arrancar React.
- Consecuencia práctica: un cambio en el PHP puede "no verse" en `/blokes-dev/` si la
  ruta que llama el frontend se sirve desde el sitio donde el plugin nuevo no está
  activo. Si un endpoint nuevo da 404 en dev, comprobar primero esto.

### 8.3 Lo que NO se despliega automáticamente

`rocomadrid-step-form/` y `blokes-extension/` no pasan por este workflow. Si hay que
tocarlos, es edición manual en el servidor (tema `neve-child` / plugins vía WP Admin).
No esperes que un push los actualice.

### 8.4 Drift conocido entre `server-index.php` y el plugin

`server-index.php` y el hook `wp_head` del plugin construyen los dos
`window.blokesSiteData`, y **no son idénticos**: el `wp_head` del plugin incluye
`userAvatarType`/`userAvatarData` y `server-index.php` no. Si añades un campo a
`blokesSiteData`, hay que añadirlo en ambos sitios.

## 9. Variables de entorno

`.env.example` está incompleto. Variables realmente usadas en `src/` (buscar
`import.meta.env.VITE_*`):

- `VITE_WORDPRESS_URL` — base del sitio principal (blog 1).
- `VITE_CLUB_WORDPRESS_URL` — base del subsite "club" (blog 3), default
  `https://rocomadrid.com/club`.
- `VITE_WORDPRESS_AUTH` — `usuario:password` de Application Password de WP, para el
  flujo de auth legacy.
- `VITE_USE_MOCK` — fuerza datos mock de blokes en vez de pegar a la API.
- `VITE_ROUTER_BASENAME` — basename de React Router si el auto-detect falla.
- `VITE_BASE_PATH` — override del `base` de Vite en build (`/blokes/` vs `/blokes-dev/`).
- `VITE_GOOGLE_SHEETS_API_KEY` / `VITE_GOOGLE_SHEET_ID` / `VITE_GOOGLE_SHEET_RANGE` —
  solo relevantes para el flujo legacy de Google Sheets (código muerto, ver §1).

Secrets de GitHub Actions (deploy): `SFTP_HOST`, `SFTP_USERNAME`, `SFTP_PASSWORD`,
`SFTP_REMOTE_PATH`, `SFTP_REMOTE_PATH_PROD`, `SFTP_PLUGIN_PATH`.

## 10. `standAloneReactBlokes/`

Copia del frontend para un hosting *distinto* de SiteGround/WordPress, servida en la
raíz del dominio en vez de en `/blokes/` (`base: '/'` en su `vite.config.js`). No se
toca salvo que se pida explícitamente; al sincronizar cambios desde el proyecto
principal, copiar solo el contenido de `src/` y respetar su propio `vite.config.js`.

## 11. Levantar en local

```
npm install
cp .env.example .env   # y completar con las variables de la §9 según haga falta
npm run dev
```

Para publicar un cambio de frontend, mira la §8.1 (compilar + commitear `dist/`).
Versión de Node en la máquina de Ramiro: 20.x (notas antiguas decían 16; Vite se
mantiene en la 4.x, no hay motivo actual para subirlo).

Para probar páginas que dependen del rol de app (`/setter`, `/stats`, etc.) hace falta
que el email de la cuenta de WordPress con la que pruebas esté en una de las listas
blancas (`socios`/`gestion`/`profesores`) — pídele a Ramiro que te añada o usa
`VITE_USE_MOCK=true` para trabajar con datos de ejemplo sin backend real.

## 12. Decisiones y contexto histórico (el "por qué")

- **Roles por email, no por roles de WordPress.** Se hizo así para poder dar permisos de
  app (profesor, gestión, socio) sin darle a nadie capacidades de WordPress. Se editan
  desde la propia app (`PUT /blokes/v1/admin/email-lists`, solo `socio`). El plugin
  *User Role Editor* está instalado en WordPress pero **el código de la app no depende
  de él**; los únicos permisos nativos que se consultan son `manage_woocommerce` y
  `manage_options` en el plugin de checkout (capacidades estándar).
- **Google Sheets → WordPress.** La primera versión leía un Google Form/Sheet con
  imágenes, texto y categoría. Se migró a WordPress (custom post type `blokes` con
  campos ACF) para tener usuarios, valoraciones, completados y ligas. El código de
  Sheets se conserva solo como referencia.
- **`dist/` en git y workflow sin build.** Decisión del 25/05/2026 (commit `0f6b7a6`):
  más simple que montar Node en el CI. Coste: hay que compilar antes de cada push de
  frontend y hay conflictos en `dist/` si se trabaja a la vez. Cowork propuso mover el
  build al workflow (`npm ci && npm run build`) y sacar `dist/` del repo; **está
  pendiente de decidir** y tocaría `deploy.yml`.
- **Dos ramas, dos destinos (18/07/2026).** `dev` → `/blokes-dev/`, `master` → `/blokes/`.
  Hasta entonces solo había un destino.
- **Fichaje y Time Off → app externa (24/09/2026).** Se quitaron del menú principal.
  Las pestañas "CTRL Fichaje" y "CTRL Time Off" de `/supervision` se dejan como
  placeholders porque es posible que la supervisión de vacaciones y fichaje se linke con
  el sistema externo (probablemente vía `fichajeEmbedUrl`/`timeOffEmbedUrl` en
  `blokesSiteData`, hoy vacíos). No hay decisión cerrada; no borrar ese código todavía.
- **Colaboración.** El repo es `RamiroIsBack/rocoMadridBlokes`. Cualquier push a `dev`
  despliega automáticamente, lo haga quien lo haga (la cuenta `ClubRocomadrid7a` ya ha
  desplegado con éxito). El `CLAUDE.md` pide confirmar antes de crear/modificar ficheros
  cuando se trabaja con Claude Code.
- **Commits.** Sin línea `Co-Authored-By` de Claude en los mensajes (preferencia de
  Ramiro).

## 13. Pendientes / cosas por confirmar

- Confirmar en qué sitios de la red está activo cada plugin (`progreso-extension1-1`,
  `blokes-extension` viejo) y dónde apunta `SFTP_PLUGIN_PATH` (§8.2).
- Decidir si el build pasa al workflow y `dist/` sale del repo (§12).
- Rutas REST con `permission_callback => '__return_true'` y el shim de admin automático
  (§7): deuda de seguridad conocida.
- Sincronizar `server-index.php` con `blokes_get_email_lists`/avatar del plugin (§8.4).
- `DEPLOY.md`, `DEPLOYMENT_GUIDE.md`, `LOCAL_TESTING_GUIDE.md` y `.env.example`
  desactualizados: reescribir o borrar.
