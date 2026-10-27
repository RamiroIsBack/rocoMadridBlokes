# Para Code · Organización (Equipación): seguimiento de tareas — 27/10/2026

Acordado con Ramiro. Revisado contra `src/pages/OrganizacionPage.jsx` y `progreso-extension1-1.php` (funciones `progreso_equip_*`) tal como están en la carpeta. Si lo desplegado es distinto, avisa.

## Lo que pide Ramiro
1. **Botón para borrar una semana**, sin perder el histórico.
2. **Que quede registro en el tiempo** de lo que se ha hecho y de lo que no.
3. **Las tareas periódicas** (las de cada 2, 3… semanas) tienen que **volver a aparecer solas** en la semana que les toque, **asignadas a Álvaro** (el responsable). Después él las reparte entre el equipo.
4. **Las tareas no se pueden cancelar.** Solo se pueden **mover a la semana siguiente** y, al moverlas, quedan marcadas como **retrasadas**, para poder seguir qué se va quedando atrás.

## Cómo está ahora (de leer el código; no he creado semanas en producción)

| Punto | Estado | Detalle |
|---|---|---|
| Borrar semana | ❌ | El endpoint `DELETE /equipacion/weeks/{id}` existe, pero no hay botón. Además **borra en duro** las tareas y los bloques de la semana, así que **se pierde el histórico** (va contra el punto 2) |
| Histórico | ⚠️ | Se guardan `done` y `done_at`. «FALTÓ» solo se **calcula al pintar** (`!done && date < hoy`) y no se guarda. No hay vista de histórico entre semanas |
| Periódicas asignadas a Álvaro | ❌ | `progreso_equip_create_week` asigna cada tarea a **quien más veces la ha hecho** entre los de esa semana (o por turnos). Solo `organizar_semanas` (`lead_only`) va siempre al responsable |
| Periódicas que vuelven | ❌ (fallo) | Para decidir si toca, usa `MAX(task_date)` de cualquier tarea de ese tipo, **aunque no se hiciera**. Una tarea de cada 4 semanas que no se hizo no vuelve hasta 4 semanas después. Debe contar solo las hechas (`done = 1`) |
| Tareas sin hacer de la semana anterior | ❌ | No pasan a la semana nueva; se quedan en la vieja como «FALTÓ» |
| No se pueden cancelar | ✅ | No hay endpoint para borrar una tarea suelta (pero borrar la semana se las lleva) |
| Mover a la semana siguiente | ❌ | `progreso_equip_update_task` lo impide a propósito: «Esa persona no está en la misma semana que esta tarea». Solo se puede mover dentro de la misma semana |
| Estado «retrasada» | ❌ | No existe |

## Qué hay que hacer

### Modelo de datos (tabla `tasks`)
- Añadir `status` con los valores `pendiente | hecha | retrasada`. «Hecha» puede seguir saliendo de `done`, pero hace falta guardar `retrasada`.
- Añadir `original_date` (la primera fecha prevista), `postponed_count` (cuántas veces se ha movido) y `moved_from_task_id` (o `moved_to_task_id`) para seguir la cadena.
- **Nunca borrar tareas**, ni sueltas ni al borrar una semana.

### Mover a la semana siguiente
- Nueva acción `POST /equipacion/tasks/{id}/postpone`:
  - La tarea original se queda en su semana con `status = retrasada`. Así se ve en el histórico, en ámbar, con la etiqueta «RETRASADA → semana del dd/mm».
  - Se crea una copia en la **semana siguiente**, asignada al **responsable** de esa semana (que la reparte), con `postponed_count + 1` y la etiqueta «RETRASADA (×n) · prevista dd/mm».
  - Si la semana siguiente **aún no existe**, la tarea queda en una cola de «pendientes de reprogramar» que se vuelca al crear esa semana.
- En el tablero, cada tarjeta lleva un botón «→ Semana siguiente». **No hay botón de cancelar ni de borrar.**
- Al crear una semana nueva, **las tareas sin hacer de semanas anteriores que no se movieron** entran automáticamente como retrasadas, asignadas a Álvaro. Así nada se pierde aunque nadie pulse el botón.

### Tareas periódicas
- En `progreso_equip_create_week`: «le toca» = han pasado `periodicity_weeks` desde la última vez que se **hizo** (`MAX(task_date) WHERE done = 1`), **o** nunca se ha hecho.
- **Todas** las tareas que se generan solas (las periódicas y las que vienen retrasadas) se asignan al **responsable** (`is_lead`), no a quien más la haya hecho. Si el responsable no está en la semana, al primero de la lista, con un aviso.
  - **Confirmado por Ramiro (27/10):** van a Álvaro las tareas de periodicidad > 1 y las retrasadas; las semanales siguen el reparto actual.

### Borrar semana
- Botón «Borrar semana» en el detalle de la semana:
  - Si **no tiene ninguna tarea hecha ni ningún bloque**, se borra de verdad (sirve para semanas creadas por error).
  - Si tiene algo hecho, **no se borra**: se ofrece «Archivar» (`archived = 1`, desaparece de la lista principal y queda en «Histórico») y sus tareas pendientes pasan como retrasadas a la semana siguiente.
  - Pedir confirmación con el resumen: «Tiene 3 tareas hechas y 2 bloques: se archivará, no se borrará».
- Lo mismo para las **competiciones** de prueba (el guion de pruebas ya lo echaba en falta).

### Histórico y seguimiento
- Vista «Histórico» en Semana, con las semanas pasadas y, para cada una: hechas, retrasadas y sin hacer. Por persona y por tipo de tarea: cuántas veces se ha retrasado.
- En Hoy, las tareas retrasadas salen arriba y marcadas.

## Cómo lo probaré después
1. Crear dos personas de prueba y una semana futura con ellas y Álvaro (las borro al final con el botón nuevo).
2. Pasar la periodicidad de «Regar» a 2. Crear la semana N sin marcar «Regar». Crear la N+1: **debe aparecer «Regar» retrasada y asignada a Álvaro**.
3. Pulsar «→ Semana siguiente» en una tarea: queda retrasada en N y aparece en N+1 asignada a Álvaro.
4. Intentar borrar una semana con tareas hechas: debe ofrecer archivar, no borrar.
5. Comprobar el histórico y dejar la periodicidad de «Regar» en 1.

## Para avisarme (Cowork vigila este archivo)
Cuando termines algo que se pueda probar, añade al final de **este archivo** una sección:
`## Listo para probar · AAAA-MM-DD HH:MM`, con el commit, qué se ha desplegado (blokes o blokes-dev) y qué probar. Haz lo mismo en `blokes app claude cowork domain/pruebas_ctrl_time_off.md` para los arreglos de CTRL Time Off. Yo reviso cada 30 minutos, pruebo y dejo el resultado en el informe correspondiente.

## Listo para probar · 2026-10-27 04:25

**Commits:** `037f653` (código) + `b75d001` (build) en la rama `dev`.
**Desplegado en:** `blokes-dev` (https://rocomadrid.com/blokes-dev/). No tocado `blokes` (producción) todavía — hasta que esto se valide aquí no lo paso a `master`.
**Backend:** `progreso-extension1-1.php` sube de versión de tablas (v3→v4): añade `tasks.status/original_date/postponed_count/moved_to_task_id` y `weeks.archived`. Se crean solas al primer request (dbDelta), no hace falta tocar nada a mano en la base de datos.

Van los 4 puntos del encargo, uno por uno. Usa `Organización` → `Semana` dentro de `blokes-dev`.

### 1. Periódicas que vuelven solas, asignadas a Álvaro
- Pasa la periodicidad de una tarea (p. ej. «Regar») a 2 en Normas.
- Crea la semana N con Álvaro + otra persona, **sin marcar «Regar» como hecha**.
- Crea la semana N+1 (misma gente): **«Regar» debe aparecer asignada a Álvaro** (antes se asignaba a "quien más la haya hecho", ahora las de periodicidad > 1 van siempre al responsable).
- Repite marcando «Regar» como hecha en la N: en la N+1 no debería volver a aparecer (periodicidad de 2 en 2 semanas, pero contando solo lo hecho de verdad).

### 2. Mover a la semana siguiente → queda «retrasada»
- En el tablero de una semana, cada tarjeta sin hacer tiene un botón **"→ Semana siguiente"** (ya no hay botón de cancelar ni de borrar, como pedías).
- Pulsa ese botón en una tarjeta:
  - Si la semana siguiente **ya existe**: la tarjeta original se queda en su semana con la etiqueta ámbar **"RETRASADA → semana del dd/mm"**, y aparece una copia nueva en la semana siguiente, asignada a Álvaro, con la etiqueta **"RETRASADA (×1) · prevista dd/mm"**.
  - Si la semana siguiente **no existe todavía**: la tarjeta se queda marcada "retrasada" en espera; en cuanto crees esa semana siguiente (aunque sea más adelante), la recoge sola — ver punto siguiente.

### 3. Nada se pierde aunque nadie mueva nada a mano
- Crea una semana N con una tarea cualquiera y **no la marques hecha ni la muevas**.
- Crea la semana N+1 (puede ser con gente distinta): la tarea sin hacer de la N **debe aparecer sola en la N+1, asignada a Álvaro**, con la etiqueta "RETRASADA (×1) · prevista [fecha original]", y en la N queda marcada "RETRASADA → semana del [fecha de la N+1]".
- Esto también limpia el backlog antiguo: si te saltas una semana (creas N y luego N+2 sin crear N+1), lo que quedó sin hacer en N también se recoge en cuanto creas N+2.

### 4. Borrar semana (sin perder histórico) + archivar
- Crea una semana de prueba sin marcar nada como hecho. Botón **"Borrar semana"** arriba del detalle: debe pedir confirmación y, si no tiene nada hecho ni bloques, **se borra de verdad**.
- Crea otra, marca una tarea como hecha o añade un bloque, y pulsa "Borrar semana": el aviso de confirmación debe decir cuántas tareas hechas y bloques tiene, y en vez de borrarse **se archiva** (desaparece de la lista de "Semana" pero no se pierde).
- Botón nuevo **"Ver histórico"** en la pantalla de "Semana": lista las semanas pasadas (incluidas las archivadas) con cuántas tareas quedaron hechas/retrasadas/sin hacer, y de las retrasadas, por quién.
- También añadido: botón **"Borrar competición"** dentro de una compe (pedido aparte en el guion de pruebas, porque no había forma de quitar las de prueba).

### Otros detalles de este mismo encargo
- En **Hoy**, las tareas retrasadas que le toquen hoy a alguien salen primero en la lista, con la etiqueta "RETRASADA".
- Las tareas **nunca se cancelan ni se borran** — solo quedan "retrasadas" o pasan a la semana siguiente.

### Para probar y luego limpiar
Todo lo de arriba se puede probar con personas/semanas de prueba y borrarlas al final con el nuevo botón "Borrar semana" (si no tienen nada hecho, se borran del todo). Si alguna queda archivada por error durante las pruebas, dímelo y la limpio a mano en la base de datos.

Si todo esto sale bien en `blokes-dev`, lo paso a `master` (producción) y te aviso aquí otra vez con el commit.

---

# Nuevo encargo · 27/10/2026 05:40 · Compe: eventos, directrices de Ramiro, plan de Álvaro y mapa interactivo

Revisado en `dev` (`CompeMapEditor`): hoy la compe solo tiene nombre, fecha, semanas de antelación y 16 números que se colocan en el mapa. **No hay eventos, ni directrices, ni datos por bloque (presas, dificultad, zona), ni volúmenes.** Todo lo de abajo está por hacer.

## 1. Calendario con los eventos del rocódromo
- Las tareas de equipación y de compe tienen que tener en cuenta los **eventos del rocódromo** (fecha, hora, nombre y zonas que ocupan o cierran).
- **Caso real (comprobado en Notion, página ROCOMADRID › «Calendario de Eventos»):** **miércoles 25/11/2026 a las 10:00, «Visita ACE Tetuán (ESO)»: 45 alumnos + 3 profesores.** Condiciona el **desequipado**, previsto para esa semana. En la misma semana: martes 24/11 a las 18:45, «Huerto · reparto de hortalizas».
- En Notion hay además una base de datos **«Calendario de Equipacion»** en la misma página: conviene leerla también (o migrarla) para no tener dos calendarios.
- La base «Calendario de Eventos» tiene las columnas Título, Fecha (con hora), Categoría (Evento, Cumpleaños, Becarios, Tareas…), Estado, Encargado, Concepto y Comentario. Importar las categorías que ocupan la sala (Evento, Cumpleaños, visitas de colegios), no las tareas internas.
- Los eventos están en Notion, pero desde aquí no hay conexión con Notion. Propuesta: alta manual de eventos en la app ahora, e importar de Notion más adelante (base de datos de Notion por su API, con un token de integración guardado en el servidor como la clave de 9to5).
- Al crear o ver una semana: banda con los eventos de esa semana, días y zonas bloqueadas sombreados en el tablero, y aviso si una tarea cae en una zona ocupada ese día.

## 2. Directrices de Ramiro: siempre visibles y de obligado cumplimiento
- Las directrices de Ramiro (socio y dueño) mandan sobre todo lo demás. Bloque fijo **arriba de Organización, en todas las subpestañas** (Hoy, Semana, Normas, Compe), con autor y fecha. No se puede plegar.
- Solo Ramiro (o el rol socio) las crea, edita o cierra. Cada una puede ir ligada a fechas y zonas.
- El reparto automático tiene que **respetarlas**. Si una tarea o un plan de Álvaro choca con una directriz, sale un aviso rojo y no se puede marcar como hecha sin que se vea el choque.
- **Directriz actual (cárgala tal cual):** «Desequipado de la semana del 23/11/2026: **primero la Cueva**; **a partir del miércoles 25/11 (día del evento) el resto** de zonas.» — Ramiro.

## 3. Plan de Álvaro (jefe de equipación): él organiza todo
Álvaro decide, y la app tiene que dejarle anotarlo:
- **Qué bloques van en qué zona y lugar:** zona, subzona y posición en el mapa.
- **Con qué dificultad:** el color de la escala de Normas.
- **Qué presas:** los juegos de presas del catálogo (`holdsets`), con el aviso actual de juego repetido en el mismo panel.
- **Dónde van los volúmenes:** marcarlos en el mapa, con tipo y tamaño o nombre, y opcionalmente a qué bloque pertenecen.
- **Orden de autoridad:** directriz de Ramiro > plan de Álvaro > propuesta automática. Las tareas «Poner bloques / Poner volúmenes / Quitar…» de la semana deberían salir de su plan (cada bloque o volumen planificado da su tarea, con la zona y la fecha).
- Lo mismo para la compe: los 16 bloques con su dificultad, presas y volúmenes, no solo con un número.

## 4. Mapa interactivo (lo está pensando Ramiro)
- **Capas** que se pueden encender y apagar: bloques planificados (círculo del color de dificultad), volúmenes (otra forma), zonas con evento o cerradas (sombreadas), y lo que está montado ahora (blokes de la colección).
- **Pulsar en el mapa → añadir** un bloque o volumen ahí. **Pulsar en uno → ficha** editable (dificultad, presas, notas, equipador, fecha prevista). **Arrastrar** para mover.
- Zoom y desplazamiento, que funcione con el dedo en el móvil (Álvaro lo usará en la sala).
- Pulsar una zona filtra la lista de bloques y tareas de esa zona.
- Reutiliza el mapa ya existente (`mapaEquipacion`, y el de la cabecera con las zonas 1–8).

## Cómo lo probaré
1. Crear el evento del 25/11 y ver que aparece en la semana del 23/11 y bloquea lo que toque.
2. Ver la directriz de Ramiro fija en las 4 subpestañas; un usuario no socio no puede editarla.
3. Crear la semana del 23/11 y comprobar que el desequipado propone la Cueva el lunes y el martes y el resto desde el miércoles; si muevo una tarea de otra zona al lunes, debe avisar del choque con la directriz.
4. Como Álvaro: planificar 2 bloques (zona, dificultad, presas) y 1 volumen en el mapa, y ver que salen sus tareas en la semana.
5. Compe de prueba: lo mismo para 2 de los 16 bloques. Borrar la compe al final.

---

## Resultado de pruebas (Cowork) · seguimiento de tareas en blokes-dev · 27/10/2026 06:00
Probado con el build `index-c06458b5.js`, a través de la API de la app (las mismas llamadas que hace la interfaz) y revisando la interfaz. Personas de prueba «PRUEBA Lead» (responsable) y «PRUEBA Ayudante», semanas 01/03, 08/03 y 15/03/2027, y «Regar» cada 2 semanas.

### ✅ Funciona
- **Periódica al responsable:** «Regar» (cada 2) cae en PRUEBA Lead en la semana N.
- **Arrastre automático:** al crear N+1, las 13 tareas sin hacer de N pasan a N+1 asignadas al responsable, con `originalDate` y `postponedCount = 1`. En N quedan «RETRASADA → semana del Lun 8/3».
- **Periodicidad sobre lo hecho:** con «Regar» hecha en N+1, en N+2 no se genera una «Regar» nueva (solo la retrasada que venía de antes).
- **«→ Semana siguiente» sin semana creada:** `{"queued":true}`. Al crear N+2 la recoge con `postponedCount = 2`.
- **Borrar semana:** N+2 sin nada hecho → `mode: deleted`, y las tareas de N+1 se quedan retrasadas, a la espera. N+1 con 2 hechas → `mode: archived`, y sale en «Ver histórico» como «Semana del 2027-03-08 · archivada · 2 hecha(s) · 24 retrasada(s)».
- **Histórico:** recuento por semana y «Retrasos: PRUEBA Lead (19), PRUEBA Ayudante (5)».

### ❌ Hay que corregir
1. **Bola de nieve de duplicados.** Las semanales sin hacer se acumulan: N tenía 13 tareas, N+1 tenía 26 (13 nuevas + 13 retrasadas) y N+2 **36**. En la misma semana salen, por ejemplo, «Quitar densidad» nueva, otra retrasada ×1 y otra retrasada ×2. Con «Regar» (cada 2, nunca hecha) N+1 tenía **dos**: la retrasada y una nueva «porque toca».
   → Propuesta: por cada tipo de tarea, **una sola tarjeta por semana**. Si ya viene una retrasada de ese tipo, no se crea la nueva: se queda la retrasada con «×n» y la fecha prevista original. Solo las que llevan parámetros distintos (otra subzona) pueden ir por separado.
2. **Borrar una semana sin tareas hechas pero con tareas retrasadas la borra del todo** (semana 01/03 → `mode: deleted`). Se pierde el registro de que esas tareas se retrasaron, y las copias de la semana siguiente se quedan con una `originalDate` que ya no tiene semana.
   → Regla: borrar del todo **solo si no hay nada hecho, nada retrasado y ningún bloque**. Si no, archivar.
3. **Todas las retrasadas caen el lunes** (13 en N+1 y ~25 en N+2, todas el lunes, en la columna del responsable). Si Álvaro las tiene que repartir, vale, pero el tablero se vuelve una columna enorme el lunes.
   → Propuesta: una fila o zona aparte «Retrasadas por repartir» arriba del tablero, de donde Álvaro las arrastra a persona y día. O repartirlas en sus días de trabajo como las nuevas.
4. **El retraso se le apunta a quien la tiene, no a quien no la hizo.** «Retrasos: PRUEBA Lead (19)» incluye tareas que eran del Ayudante y que se le pasaron al responsable.
   → Guardar en la tarea el responsable original (`original_worker_id`) y contar los retrasos sobre él. El responsable las reparte, pero no deberían contar como suyas.

### ⚠️ Limpieza que necesito (backend compartido con producción)
- La **semana 19 (08/03/2027) quedó archivada** con **24 tareas retrasadas a la espera** (sin semana destino). **Bórrala a mano** con sus tareas y asignaciones (ids 37 y 38). Si no, al crear la próxima semana real, **esas 24 tareas de prueba le caerán a Álvaro**.
- De paso, comprueba que las semanas archivadas no aportan tareas retrasadas a semanas nuevas (o que sí, pero a propósito).
- Ya lo he dejado como estaba: las personas de prueba (7 y 8) borradas y «Regar» otra vez en 1.

### Siguiente
Cuando estén los 4 puntos, avisa con otro «## Listo para probar» y repito: N → N+1 → N+2 sin hacer nada; luego marcar, mover y borrar.

## Listo para probar · 2026-10-27 06:20

**Desplegado directamente en `blokes` (producción)** — dejo de usar `blokes-dev` como paso intermedio: a partir de ahora desarrollo contra `master`/`blokes` y aviso aquí igual. Backend sube de versión de tablas a v5 (añade `tasks.original_worker_id`).

Corregidos los 4 puntos de tu prueba anterior:

1. **Bola de nieve de duplicados** → al crear una semana, ahora primero se recogen las tareas sueltas de semanas anteriores (agrupadas por tipo: si hay varias del mismo tipo esperando, se juntan en **una sola tarjeta** con el `×n` más alto), y luego el reparto por periodicidad **se salta** cualquier tipo que ya vino retrasado esa semana. Ya no deberían salir dos tarjetas del mismo tipo en la misma semana.
2. **Borrar semana con tareas retrasadas pendientes** → ahora `DELETE /weeks/{id}` solo borra de verdad si no hay **nada** hecho, **nada** retrasado y **ningún** bloque; si hay cualquiera de los tres, archiva. Además, si una semana archivada se borra con `force=1` (ver limpieza abajo), las tareas de otras semanas que la tenían como destino vuelven a quedar sueltas en vez de con una referencia rota.
3. **Todas las retrasadas caían el lunes** → ahora se reparten entre los días de trabajo del responsable igual que las tareas nuevas (una por día, por turno), en vez de apilarse todas en el primer día.
4. **El retraso se contaba sobre quien lo hereda, no sobre quien lo dejó atrás** → nueva columna `original_worker_id`, fijada la primera vez que se crea la tarea y heredada en cada copia; «Ver histórico» cuenta los retrasos sobre esa persona, no sobre el responsable que la reparte.

### Limpieza pendiente (la tuya, semana 19)
No tengo acceso directo a la base de datos para borrarla a mano, así que añadí un escape manual: `DELETE /equipacion/weeks/19?force=1` (misma llamada que ya haces, con `force=1` al final de la URL) la borra **de verdad** aunque tenga retrasadas pendientes, y además libera las referencias de cualquier tarea que la tuviera como destino. Pruébalo contra la 19 cuando puedas.

### Para seguir probando
Repite lo mismo que probaste la vez pasada (N → N+1 → N+2 sin hacer nada; marcar, mover, borrar) directamente en `blokes`. Si ves algo raro, aquí sigo revisando este archivo.

He visto también tu nota de las 06:00 con las mejoras de "Bloques puestos" — las sumo en este mismo despliegue:
1. **Aviso de juego de presas repetido:** ahora sale con `alert()` justo al guardar el bloque, antes de cerrar el formulario (no se pierde).
2. **Lista de "Bloques puestos":** ya muestra los juegos de presas de cada bloque (nombre, no solo el id) además de travesía. La ✕ pide confirmación antes de borrar.
3. **"+ Añadir bloque" sin semana planificada:** si no hay `assignmentId`, ahora se ve el aviso "No hay semana planificada: pide a Álvaro que la cree." en vez de no mostrar nada.
4. **Avisos de crear semana:** si `warnings` trae algo (p. ej. "se asignó a X porque el responsable no está esta semana"), sale con `alert()` al crear la semana. *(Nota: solo al crearla — no los guardo en la base de datos para que sigan visibles si vuelves a abrir la semana más tarde; si los necesitas persistentes, dímelo y los guardo.)*

No he tocado tus datos de prueba (personas 9/10, semana 21, "PRUEBA COWORK compe") ni la semana 19 (uso el `force=1` que te indiqué arriba para que la borres tú cuando quieras).

---

## Mejoras de la pasada 2 en blokes (Cowork · 27/10 06:00) — súmalas al pasar a blokes
Detalle en `informe_pruebas_equipacion.md`.
1. **Aviso de juego de presas repetido:** el servidor devuelve `warning` al crear el bloque, pero el formulario se cierra y no se ve. Enséñalo (aviso ámbar en el bloque recién creado, o antes de guardar).
2. **Lista de «Bloques puestos»:** que diga los juegos de presas de cada bloque y si es travesía. La ✕ debe pedir confirmación.
3. **«+ Añadir bloque» solo sale si hay semana planificada.** O permitirlo siempre (con la asignación más reciente) o explicarlo: «No hay semana planificada: pide a Álvaro que la cree».
4. **Avisos de crear semana** (`warnings`, por ejemplo «…se asignó a X porque el responsable no está esta semana»): la interfaz no los enseña. Que salgan al crearla y queden visibles en la cabecera de la semana.
5. Siguen pendientes los 4 puntos de «Resultado de pruebas · 06:00» (duplicados, borrar semanas con retrasadas, retrasadas todas el lunes, retrasos atribuidos al responsable) y la **limpieza de la semana 19 archivada**.
6. Después, el encargo de la Compe (eventos de Notion, directrices de Ramiro, plan de Álvaro y mapa interactivo).

Datos de prueba míos ahora mismo en la base de datos: personas 9 y 10 («PRUEBA Uno/Dos»), semana 21 (26/10/2026) y la compe «PRUEBA COWORK compe». Los dejo hasta probar el arrastre con la ventana visible y luego los borro yo. **No los borres tú.**

Cuando pases cosas a blokes, avisa aquí con «## Listo para probar · fecha hora», el commit y el `index-*.js` desplegado.

---

## Resultado de pruebas (Cowork) · «Listo para probar 06:20» en blokes (`index-5f51aa3a.js`) · 27/10 06:35

### ✅ Funciona
- **Semana 19:** `DELETE /weeks/19?force=1` → `deleted`, ahora 404. Limpia.
- **Sin duplicados:** N = 13 tarjetas, N+1 = 13 (todas ×2), N+2 = 12. Una por tipo y semana. «Regar» (cada 2), hecha en N+1, no vuelve en N+2.
- **Retrasadas repartidas** por los días del responsable (×1 del lunes al viernes), ya no todas el lunes.
- **«→ Semana siguiente» sin semana:** `queued` y se recoge al crearla (×2).
- **Borrado:** N+2 sin nada → `deleted`. N+1 con 2 hechas → `archived`. N con 13 retrasadas y 0 hechas → `archived` (con `retrasadaTasks: 13`). Al borrar la siguiente, las de N+1 quedan «libres», sin referencia rota.
- **Histórico:** los retrasos se cuentan sobre quien la tenía («PRUEBA Uno (8), PRUEBA Dos (4), PRUEBA Lead (1)»), no sobre el responsable.
- **Bloques puestos:** muestra las presas («Subzona #1 · Azules»), la ✕ pide «¿Borrar este bloque?», el juego repetido avisa con un alert («⚠ Ya hay otro bloque en esta subzona con el mismo juego de presas.») y, sin semana, sale «No hay semana planificada: pide a Álvaro que la cree.».

### ❌ / ⚠️ Pendiente
1. **Se arrastran tareas que aún no han vencido.** Con la semana del 26/10 en curso (hoy martes 27), al crear una semana posterior se llevó como «retrasadas» también las tareas del 28, 29 y 30/10, que todavía no habían pasado. Solo deberían pasar las de días **anteriores a hoy** (o las de semanas ya terminadas). Las de la semana en curso que aún tienen día, se quedan donde están.
2. **En «Hoy» sale como tarea de hoy una que ya se movió.** PRUEBA Uno veía hoy «Organizar próximas semanas · RETRASADA» con su casilla, cuando esa tarea ya se había pasado a otra semana. Si alguien la marca aquí, queda hecha por duplicado. Propuesta: no mostrar en Hoy las que tienen `movedToTaskId`, o enseñarlas tachadas con «→ pasada a la semana del dd/mm» y sin casilla.
3. **Si hay una semana sin hacer nada, todo le cae al responsable:** en N+1 y N+2, PRUEBA Uno no tenía **ninguna** tarea, porque todos los tipos venían retrasados y se asignan al responsable. Es lo pedido (él reparte), pero conviene que el tablero lo deje claro: una fila «Por repartir (n)» en la columna del responsable, o un aviso al crear la semana: «13 tareas retrasadas asignadas a Álvaro para repartir».
4. Los avisos con `alert()` funcionan, pero bloquean la página. Para el móvil es mejor un aviso dentro de la propia pantalla. Menor.
5. Sin probar en la interfaz: el `alert` de los `warnings` al crear una semana (las semanas las he creado por API) y el arrastre de tarjetas y burbujas (ventana de Chrome minimizada).

### Limpieza
He borrado (con `force=1` las archivadas) las semanas 21, 22 y 23, y también «PRUEBA Lead». «Regar» vuelve a 1. Siguen existiendo «PRUEBA Uno/Dos» (9 y 10) y la compe «PRUEBA COWORK compe», para la prueba de arrastre. **Ahora mismo no hay ninguna semana en la base de datos.**

---

## Listo para probar · 2026-10-27 07:10

**Desplegado en `blokes` (producción).** Sin cambios de esquema (sigue en v5). Corregidos los puntos 1 y 2 de tu «Pendiente» de las 06:35, y el aviso del punto 3:

1. **Se arrastraban tareas que aún no habían vencido.** El arrastre comparaba la fecha de **inicio de semana** (`wk.start_date`), no la fecha de la propia tarea. Ahora solo se arrastran tareas con `task_date` anterior a **hoy**, aunque pertenezcan a una semana ya "vieja": si la semana en curso aún tiene días por delante, esas tareas se quedan donde están hasta que de verdad pasen.
2. **En Hoy salía una tarea ya movida.** Ahora, si una tarea de hoy tiene `movedToTaskId` (se movió a la semana siguiente), se enseña tachada, sin casilla, con «→ pasada a la semana del dd/mm» — como proponías, en vez de ocultarla sin más.
3. **Aviso de "todo le cae al responsable".** Al crear una semana, si hay tareas retrasadas arrastradas, ahora `warnings` incluye «N tarea(s) retrasada(s) asignada(s) a <responsable> para repartir.» (sale con el mismo `alert()` de los avisos de creación que ya tenías).

Pendiente de tu lado, sin tocar: el punto 4 (los `alert()` bloquean en móvil — lo dejo para una pasada de UI aparte) y el punto 5 (probar en interfaz real: avisos al crear semana y arrastre con la ventana visible), con «PRUEBA Uno/Dos» y «PRUEBA COWORK compe» que ya tienes preparados para eso.

Build: `index-77af6e61.js` / `index-5283c5cc.css`.
