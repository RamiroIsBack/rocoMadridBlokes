# Prompt para Claude Code — Sistema de Ligas, Avatares y Perfil de Usuario — Blokes

## Contexto del proyecto

Estamos construyendo el sistema de ligas, avatares y perfil de usuario para la app de
entrenamiento de escalada Blokes. La app tiene entre 120 y 200 usuarios en total.

El sistema está inspirado en Duolingo pero con una diferencia clave: **no hay ciclos
semanales ni períodos de espera**. Los ascensos y descensos son **inmediatos y en
tiempo real**. En el momento en que un usuario hace un "top" en un bloke, el sistema
recalcula posiciones al instante y, si procede, el usuario sube o baja de liga en ese
mismo momento.

Las 3 zonas dentro de cada liga (ascenso, permanencia, descenso) son **indicadores
visuales** que muestran al usuario dónde está parado, no períodos de espera. El
movimiento entre ligas ocurre en tiempo real basado en puntos acumulados, no al
final de ningún ciclo.

---

## Las 6 ligas (de menor a mayor nivel)

```
1. Liga Pedri        ← entrada, nivel más bajo
2. Liga Albarracín
3. Liga Fonte
4. Liga Yosemite
5. Liga Hueco
6. Liga Rocklands    ← nivel más alto
```

---

## Distribución de usuarios por liga

Con 120–200 usuarios en total repartidos entre 6 ligas, cada liga tendrá
aproximadamente **20–33 usuarios**. Las ligas son de **tamaño dinámico**: no
hay un mínimo ni un máximo fijo, los usuarios fluyen entre ligas según sus puntos.

Distribución de zonas dentro de cada liga (porcentual, se recalcula siempre):

```
Zona ascenso    → top 30% de usuarios de la liga
Zona permanencia → siguiente 50%
Zona descenso   → último 20%
```

Ejemplo con 25 usuarios por liga:
- Zona ascenso:    posiciones 1–7
- Zona permanencia: posiciones 8–20
- Zona descenso:   posiciones 21–25

---

## Sistema de puntuación por color/dificultad de bloke

```
Verde fácil (intro)  → 1 punto
Verde medio          → 2 puntos
Verde difícil        → 3 puntos
Amarillo fácil       → 4 puntos
Amarillo medio       → 5 puntos
Amarillo difícil     → 6 puntos
Naranja fácil        → 7 puntos
Naranja medio        → 8 puntos
Naranja difícil      → 9 puntos
Rojo fácil           → 10 puntos
Rojo medio           → 11 puntos
Rojo difícil         → 12 puntos
Negro fácil          → 13 puntos
Negro medio          → 14 puntos
Negro difícil / top  → 15 puntos
```

Adaptar campos exactos según el modelo de datos real de los blokes
(`color` + `difficulty_level` o similar).

---

## Modelo de datos

### Tabla `leagues`
```sql
id              UUID PK
name            VARCHAR    -- "Pedri", "Albarracín", etc.
slug            VARCHAR    -- "pedri", "albarracin", etc.
tier            INT        -- 1 (más baja) a 6 (más alta)
promo_pct       FLOAT      -- porcentaje zona ascenso (0.30)
demotion_pct    FLOAT      -- porcentaje zona descenso (0.20)
```

### Tabla `user_leagues`
```sql
id              UUID PK
user_id         UUID FK → users
league_id       UUID FK → leagues
total_points    INT        -- puntos acumulados totales históricos
rank_in_league  INT        -- posición dentro de su liga (1 = mejor)
zone            ENUM('promotion', 'stay', 'demotion')
joined_at       TIMESTAMP
last_updated    TIMESTAMP
```

### Tabla `league_events` (historial de movimientos)
```sql
id              UUID PK
user_id         UUID FK → users
event_type      ENUM('promoted', 'demoted', 'top_scored')
from_league_id  UUID FK → leagues (nullable)
to_league_id    UUID FK → leagues (nullable)
points_at_event INT
triggered_by_user_id UUID FK → users (nullable) -- quién causó el desplazamiento
created_at      TIMESTAMP
```

---

## Lógica de ligas — Mecánica detallada

### Zonas dentro de cada liga (solo visuales, sin esperas)

```
┌──────────────────────────────┐
│  🟢 ZONA ASCENSO  (top 30%) │  Estás en riesgo de subir
│                              │  si alguien de abajo te supera
├──────────────────────────────┤
│  ⚪ ZONA PERMANENCIA (50%)   │  Posición segura
│                              │
├──────────────────────────────┤
│  🔴 ZONA DESCENSO (últim 20%)│  En riesgo si alguien de abajo
│                              │  acumula más puntos que tú
└──────────────────────────────┘
```

Las zonas se recalculan automáticamente cada vez que cambia el ranking de la liga.

---

### Flujo completo cuando un usuario registra un top

```
Usuario A registra un top en bloke X
           │
           ▼
1. Calcular puntos del top según color/dificultad del bloke
           │
           ▼
2. Sumar puntos a user_leagues.total_points de A
           │
           ▼
3. ¿Existen usuarios en la liga inmediatamente superior
   con total_points < nuevos puntos de A?
           │
     ┌─────┴─────┐
    SÍ           NO
     │            │
     ▼            ▼
4a. Identificar  4b. Recalcular rank_in_league
    usuario B      y zone para todos en la liga
    (el de menos   actual de A. FIN.
    puntos de la
    liga superior)
     │
     ▼
5. SWAP ATÓMICO (transacción):
   - A sube a la liga de B
   - B baja a la liga de A
   - Recalcular rank y zone en ambas ligas
   - Crear league_event 'promoted' para A
   - Crear league_event 'demoted' para B
     │
     ▼
6. Emitir eventos WebSocket:
   - 'league:promoted' → A (solo A lo recibe)
   - 'league:demoted'  → B (solo B lo recibe)
   - 'league:updated'  → todos los miembros de
     ambas ligas afectadas
```

**Regla de empate:** si A iguala exactamente los puntos de B, A NO sube.
Solo sube si A > B estrictamente.

**Solo un nivel a la vez:** aunque A supere a usuarios de varias ligas superiores,
sube únicamente una liga por top. El sistema se re-evalúa en el siguiente top.

**Liga Pedri:** nadie puede bajar. Si alguien baja a Pedri, permanece ahí
hasta acumular suficientes puntos.

**Liga Rocklands:** nadie puede subir más. Solo se recalcula el ranking interno.

**Race conditions:** todo el proceso de suma de puntos + evaluación + swap
debe ocurrir dentro de una única **transacción con bloqueo** (SELECT FOR UPDATE
sobre las filas afectadas) para evitar que dos tops simultáneos generen
estados inconsistentes.

---

## API Endpoints

```
POST  /api/tops
      Body: { blokeId }
      → Registra el top, suma puntos, evalúa cambio de liga
      → Devuelve: { pointsEarned, newTotal, leagueChanged, newLeague? }

GET   /api/leagues/me
      → Liga actual del usuario autenticado: nombre, tier, zona actual, rank

GET   /api/leagues/me/leaderboard
      → Ranking completo de SU liga con nombres, puntos y zona de cada participante
      → Solo accesible para miembros de esa liga

GET   /api/leagues/me/zones
      → Límites numéricos de las 3 zonas en su liga actual

GET   /api/users/me/league-events
      → Historial de subidas y bajadas del usuario autenticado

GET   /api/leagues
      → Listado público de las 6 ligas (nombre, tier, icono) SIN usuarios
```

---

## WebSocket — Eventos en tiempo real

El cliente se suscribe al canal de su liga al entrar en la pantalla de ligas.

```
Evento: league:updated
Canal:  /leagues/:leagueId
Payload: { leaderboard: [...], updatedAt }
→ Se emite cuando cambia el ranking de esa liga (por tops o swaps)

Evento: league:promoted
Canal:  /users/:userId
Payload: { newLeague: { name, tier }, oldLeague: { name, tier }, totalPoints }
→ Se emite solo al usuario que acaba de subir

Evento: league:demoted
Canal:  /users/:userId
Payload: { newLeague: { name, tier }, oldLeague: { name, tier }, totalPoints }
→ Se emite solo al usuario que acaba de bajar
```

---

## Componentes UI

### `LeagueScreen` — Pantalla principal de ligas
- Nombre e icono de la liga actual del usuario
- Leaderboard de su liga con scroll
- Las 3 zonas separadas visualmente con colores y etiquetas
- El usuario propio siempre destacado y visible (sticky si hace falta)
- Actualización en tiempo real via WebSocket sin recargar

### `LeaguePromotionDialog` — Diálogo de ascenso
- Se lanza automáticamente cuando llega el evento `league:promoted`
- Animación celebratoria (confeti, partículas)
- Texto: "¡Subiste a Liga [nombre]! 🎉"
- Subtexto con los puntos actuales
- Botón "Ver mi nueva liga"

### `LeagueDemotionBanner` — Mensaje motivacional de bajada
- No es un popup bloqueante, es una card/banner dismissible
- Se muestra al entrar en la app si hay un evento `demoted` pendiente de ver
- Tono positivo: "Bajaste a Liga [nombre] — ¡Cada top te acerca a volver! 💪"
- Botón "Ver mi liga"

### Badge de zona en perfil
- Indicador pequeño junto al nombre del usuario: 🟢 / ⚪ / 🔴
- Refleja la zona actual dentro de su liga

---

## Función de cálculo de puntos

```typescript
function calculatePoints(bloke: Bloke): number {
  // Adaptar según el modelo real del bloke
  // Ejemplo genérico:
  const colorBase: Record<string, number> = {
    'verde':    0,
    'amarillo': 3,
    'naranja':  6,
    'rojo':     9,
    'negro':    12,
  }
  const diffBonus: Record<string, number> = {
    'facil':  1,
    'medio':  2,
    'dificil': 3,
  }
  return (colorBase[bloke.color] ?? 0) + (diffBonus[bloke.difficulty] ?? 1)
}
```

---

## Initial placement para usuarios existentes

Al activar el sistema de ligas por primera vez:

1. Calcular `total_points` de cada usuario a partir de su historial completo de tops
2. Ordenar todos los usuarios por puntos de mayor a menor
3. Distribuir en ligas por sextiles:
   - Top 1/6 de puntos → Liga Rocklands
   - Siguiente 1/6 → Liga Hueco
   - ... y así hasta Liga Pedri
4. Calcular ranks y zonas iniciales dentro de cada liga
5. NO generar `league_events` para este placement inicial (es seed, no historia)

Para nuevos usuarios que se registren después:
- Entran directamente en **Liga Pedri**
- rank_in_league = último puesto de Pedri + 1

---

## Consideraciones técnicas

**Indexación:**
```sql
CREATE INDEX idx_user_leagues_league_points
  ON user_leagues(league_id, total_points DESC);
```
Esto hace que encontrar al usuario con menos puntos de una liga sea O(log n).

**Recálculo de zonas:**
Tras cualquier cambio en `total_points` o en la composición de una liga,
recalcular los campos `rank_in_league` y `zone` para todos los miembros
de esa liga en la misma transacción.

**Privacidad:**
Un usuario solo puede consultar el leaderboard de su propia liga.
El endpoint devuelve 403 si intentan acceder a otra.

**Stack asumido** *(adaptar al real del proyecto)*:
- Backend: Node.js / TypeScript
- ORM: Prisma / Drizzle / TypeORM
- Base de datos: PostgreSQL
- Real-time: Socket.io o Supabase Realtime
- Frontend: React Native (app) o React (web)

---

## Orden de implementación recomendado

1. Migraciones: tablas `leagues`, `user_leagues`, `league_events`
2. Seed de las 6 ligas con configuración de zonas
3. Función `calculatePoints(bloke)` con tests unitarios
4. Función `registerTop(userId, blokeId)` — transacción completa con evaluación de liga
5. Función `evaluateLeagueChange(userId, newPoints)` — lógica de swap
6. Initial placement para usuarios existentes
7. Endpoints GET (liga actual, leaderboard, zonas, historial)
8. WebSocket: emitir eventos en los 3 canales
9. Componente `LeagueScreen` con zonas visuales y actualizaciones en tiempo real
10. `LeaguePromotionDialog` con animación
11. `LeagueDemotionBanner` motivacional
12. Tests de integración de la lógica crítica

---

## Tests mínimos requeridos — Ligas

```
✓ registerTop suma correctamente según color y dificultad del bloke
✓ Si A supera al de menos puntos de la liga superior → swap correcto
✓ Si A iguala (no supera) → no hay swap
✓ Swap actualiza ranks y zonas en ambas ligas
✓ Usuario en Pedri no puede bajar aunque sea desplazado
✓ Usuario en Rocklands no sube aunque haga muchos tops
✓ Race condition: dos usuarios superan al mismo B simultáneamente → solo uno sube
✓ Leaderboard solo accesible para miembros de esa liga (403 si no)
✓ league_events se crean correctamente para promoted y demoted
✓ Las zonas se recalculan correctamente con porcentajes tras un swap
```

---

---

# PARTE 2 — Sistema de Avatares, Nickname y Perfil de Usuario

---

## Resumen

Cada usuario (incluyendo admins y superadmins) debe tener un **nickname** y un
**avatar** antes de poder realizar acciones clave en la app. Los avatares reemplazan
los nombres de texto en **todos los lugares** de la interfaz donde antes aparecía el
nombre del usuario.

---

## Librería de avatares: DiceBear + opción de foto propia

Instalar las siguientes dependencias:

```bash
npm install @dicebear/core @dicebear/collection react-native-svg
# Si se usa expo:
npx expo install expo-image-picker expo-image-manipulator
# Sin expo:
npm install react-native-image-picker react-native-image-crop-picker
```

El usuario puede elegir entre dos modos de avatar:

**Modo A — Avatar generado (DiceBear)**
- El usuario elige un estilo visual de entre los disponibles en `@dicebear/collection`
- Estilos recomendados para una app de escalada/fitness:
  `adventurer`, `lorelei`, `avataaars`, `bottts`, `fun-emoji`
- Dentro del estilo elegido puede personalizar características (color de piel,
  pelo, accesorios, expresión facial) mediante un panel de opciones
- Se almacena como JSON: `{ type: 'dicebear', style: 'adventurer', seed: '...', options: {...} }`
- Se renderiza en la app con `SvgXml` de `react-native-svg`

**Modo B — Foto propia**
- El usuario selecciona una foto de su galería o cámara
- Se recorta automáticamente a formato circular
- Se almacena la URL de la imagen subida: `{ type: 'photo', url: 'https://...' }`

---

## Cambios en el modelo de datos — tabla `users`

```sql
-- Añadir a la tabla users existente:
nickname          VARCHAR(30)   UNIQUE NOT NULL (cuando profile_complete = true)
avatar_type       ENUM('dicebear', 'photo')   nullable hasta completar perfil
avatar_data       JSONB         nullable hasta completar perfil
                  -- Dicebear: { style, seed, options }
                  -- Photo:    { url }
profile_complete  BOOLEAN       DEFAULT false
```

---

## Reglas de perfil completo por rol

| Acción bloqueada sin perfil       | Usuario | Admin | Superadmin |
|-----------------------------------|---------|-------|------------|
| Registrar un top                  | ✅      | —     | —          |
| Registrar un bloke                | —       | ✅    | ✅         |
| Editar un entrenamiento           | —       | ✅    | ✅         |
| Ver ligas / leaderboard           | ✅      | ✅    | ✅         |
| Aparecer en comunidad con nick    | ✅      | ✅    | ✅         |

---

## Flujo del ProfileSetupModal

```
Al abrir la app:
  ├─ profile_complete = true  → app normal
  └─ profile_complete = false → mostrar ProfileSetupModal (DISMISSIBLE)
       El usuario puede cerrarlo, pero las acciones bloqueadas
       mostrarán el modal de nuevo (NO dismissible) con el mensaje:
       "Necesitas un nickname y avatar para [acción]"

Al intentar acción bloqueada sin perfil:
  └─ Mostrar ProfileSetupModal (NO DISMISSIBLE)
       Con banner: "Crea tu perfil para poder [registrar tops / añadir blokes]"
```

### Componente `ProfileSetupModal`

```
ProfileSetupModal
  ├── Header: "Crea tu perfil"
  ├── NicknameInput
  │     - Min 3 / Max 20 caracteres
  │     - Solo letras, números, guión bajo
  │     - Validación de unicidad en tiempo real (debounce 500ms)
  │     - Mensaje de error si ya existe
  ├── AvatarPicker
  │     ├── Tab "Elige un estilo"
  │     │     ├── Grid de estilos DiceBear (previews circulares)
  │     │     └── Panel de personalización del estilo elegido
  │     │           (color piel, pelo, accesorios según estilo)
  │     └── Tab "Sube tu foto"
  │           ├── Botón "Galería" → expo-image-picker
  │           ├── Botón "Cámara" → expo-image-picker con cámara
  │           └── Recorte circular automático
  ├── Preview circular del avatar resultante (tamaño 80px)
  └── Botón "Guardar perfil"
        → POST /api/users/me/profile
        → marca profile_complete = true
        → cierra modal
        → si había acción pendiente bloqueada, la ejecuta
```

---

## Componente `UserAvatar` — reutilizable en toda la app

Crear un componente genérico que reemplaza **cualquier lugar donde antes
aparecía el nombre** del usuario:

```typescript
interface UserAvatarProps {
  userId: string
  size?: 'xs' | 'sm' | 'md' | 'lg'   // 20 / 32 / 48 / 80 px
  showNickname?: boolean               // muestra nick debajo o al lado
  nicknameStyle?: 'below' | 'right'
  isCurrentUser?: boolean              // añade borde destacado
}
```

**Tamaños por contexto:**
- `xs` (20px) — listas densas, rankings de liga
- `sm` (32px) — feeds de actividad, comentarios
- `md` (48px) — cards de tops, cabecera de perfil
- `lg` (80px) — pantalla de perfil propio, ProfileSetupModal

---

## Dónde reemplazar nombres por `UserAvatar`

Sustituir **todos** los lugares donde antes aparecía el nombre en texto:

```
✅ Leaderboard de liga        → avatar xs + nickname
✅ Feed de tops en el muro    → avatar sm + nickname
✅ Historial de tops del bloke → avatar sm + nickname
✅ Tab Progreso               → avatar md (propio) + nickname + info de liga
✅ Tab Comunidad              → ver reglas de visibilidad abajo
✅ Notificaciones             → avatar xs + nickname del que causó el evento
✅ Diálogo de subida de liga  → avatar lg propio
✅ Banner de bajada de liga   → avatar lg propio
✅ Pantalla de perfil         → avatar lg + nickname + liga + zona
```

---

## Tab Progreso — Información de liga integrada

El tab "Progreso" del usuario autenticado debe mostrar una sección de liga:

```
┌─────────────────────────────────────┐
│  [Avatar lg]  @nickname             │
│               Liga Yosemite  🟢     │  ← nombre liga + badge zona
│               Posición #8           │
│               1.240 pts             │
├─────────────────────────────────────┤
│  Mini leaderboard de su liga        │
│  (top 5 con avatar xs + nickname    │
│   + puntos, usuario propio resalt.) │
│  [ Ver liga completa → ]            │
└─────────────────────────────────────┘
```

El mini leaderboard se actualiza en tiempo real via WebSocket
(mismo canal `league:updated` ya definido en la Parte 1).

---

## Tab Comunidad — Visibilidad por estado de sesión

El tab Comunidad muestra las 6 ligas con sus participantes actuales.

### Usuario NO autenticado (visitante)
- Ve las 6 ligas con sus nombres
- Dentro de cada liga: solo los **avatares circulares** de los participantes
  (grid o fila horizontal), SIN nickname ni puntos
- Efecto de "preview" para incentivar el registro

```
Liga Rocklands  [🧗][🧗][🧗][🧗]...
Liga Hueco      [🧗][🧗][🧗][🧗][🧗]...
...
```

### Usuario autenticado
- Ve las 6 ligas con sus nombres e iconos
- Dentro de cada liga: **avatar + nickname** de cada participante
- En SU liga: además se muestra su posición y zona resaltadas
- Puntos visibles solo para los miembros de la misma liga del usuario
  (ver regla de privacidad de la Parte 1)

```
Liga Rocklands  [Avatar] @nick1  [Avatar] @nick2 ...
Liga Hueco      [Avatar] @nick3  [Avatar] @nick4 ...  ← tu liga resaltada
...
```

---

## API Endpoints nuevos — Perfil y Avatar

```
POST  /api/users/me/profile
      Body: { nickname, avatarType, avatarData }
      → Crea/actualiza perfil, marca profile_complete = true
      → Valida unicidad de nickname
      → Devuelve: { user }

GET   /api/users/me/profile
      → Devuelve perfil completo del usuario autenticado

GET   /api/users/:userId/avatar
      → Devuelve avatar_type + avatar_data de cualquier usuario
      → Público (para renderizar avatares en comunidad)

GET   /api/nicknames/check?value=xxx
      → Comprueba si un nickname está disponible
      → Devuelve: { available: boolean }

POST  /api/users/me/avatar/upload
      → Sube foto de perfil a storage (S3 / Supabase Storage / Cloudinary)
      → Devuelve: { url }

GET   /api/comunidad/leagues
      → Si autenticado: devuelve las 6 ligas con avatar + nickname de participantes
      → Si no autenticado: devuelve las 6 ligas con avatar SOLAMENTE (sin nicknames)
```

---

## Orden de implementación recomendado — Parte 2

1. Migración: añadir campos `nickname`, `avatar_type`, `avatar_data`, `profile_complete` a `users`
2. Endpoint `GET /api/nicknames/check` con debounce-friendly response
3. Endpoint `POST /api/users/me/profile`
4. Endpoint `POST /api/users/me/avatar/upload` + integración con storage
5. Componente `UserAvatar` base con soporte DiceBear y foto
6. Componente `ProfileSetupModal` (modo dismissible + modo bloqueante)
7. HOC / hook `useProfileGuard(action)` que envuelve acciones bloqueadas
8. Reemplazar todos los nombres en texto por `<UserAvatar>` en la app
9. Actualizar tab Progreso con sección de liga + mini leaderboard
10. Actualizar tab Comunidad con lógica de visibilidad autenticado/visitante

---

## Tests mínimos requeridos — Perfil y Avatar

```
✓ No se puede registrar un top si profile_complete = false
✓ No se puede registrar un bloke (admin) si profile_complete = false
✓ Nickname duplicado devuelve error de validación
✓ Nickname con caracteres inválidos es rechazado
✓ POST /profile marca profile_complete = true correctamente
✓ GET /comunidad/leagues sin auth no devuelve nicknames
✓ GET /comunidad/leagues con auth devuelve nicknames
✓ Puntos solo visibles para miembros de la misma liga
✓ UserAvatar renderiza correctamente en modo DiceBear
✓ UserAvatar renderiza correctamente en modo foto
```
