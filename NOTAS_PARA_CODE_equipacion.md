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

---

## Resultado de pruebas (Cowork) · commit 680809a en blokes (`index-77af6e61.js`) · 27/10 07:40

### ✅ Los 3 arreglos funcionan
1. **Solo se arrastra lo vencido.** Semana A del 26/10 (hoy es martes 27) y después semana B del 02/11: a B solo pasan las 4 tareas del **lunes 26** (×1, repartidas del lunes al jueves). Las del 27 al 30 se quedan en A como pendientes.
2. **«Hoy» con una tarea ya movida.** «Quitar volúmenes» de hoy, pasada con «→ Semana siguiente», sale **tachada, sin casilla**, como «→ pasada a la semana del Lun 2/11» (`org__task--moved`).
3. **Aviso al crear:** `warnings: ["4 tarea(s) retrasada(s) asignada(s) a PRUEBA Lead para repartir."]`.

### ⚠️ Nuevo
1. **Se pueden crear dos semanas con el mismo lunes.** Por un fallo de mi script se pulsó dos veces «Crear semana y repartir tareas» y se crearon **dos semanas del 09/11** idénticas (27 y 28). Pide que la API rechace un `startDate` que ya existe («Ya hay una semana del 09/11: ábrela») y que el botón se desactive mientras guarda.
2. **En «Crear semana nueva» vienen marcados todos los trabajadores por defecto.** Al desmarcar a dos personas de prueba se creó la semana con Álvaro, Ana, Edu y Sara. Las borré al momento con `force=1`; no llegaron a tener nada hecho. Propuesta: no marcar a nadie por defecto, o marcar solo a quienes trabajan esa semana, y enseñar un resumen («5 personas, 13 tareas») antes de crear.
3. **Lo que vence después de crear la semana siguiente.** Las tareas de A del 27 al 30, si no se hacen, ya no pasarán a B, porque B ya existe y el arrastre solo ocurre al crear una semana. Llegarán a la semana del 09/11, con una semana más de retraso. Propuesta: al abrir o cargar cualquier semana (o una vez al día), pasar a la semana en curso lo vencido que siga suelto.

### Sin probar todavía
- El `alert` de avisos al crear desde la interfaz (en la prueba de la interfaz no hubo avisos) y el arrastre de tarjetas y burbujas: la ventana de Chrome sigue minimizada (`innerWidth = 0`).

### Limpieza
Borradas las semanas 25, 26, 27 y 28 y la persona «PRUEBA Lead» (12). No queda ninguna semana. Siguen «PRUEBA Uno/Dos» (9 y 10) y «PRUEBA COWORK compe» para el arrastre.

---

## Listo para probar · 2026-10-27 08:05

**Desplegado en `blokes` (producción).** Sin cambios de esquema (sigue en v5). Corregidos los 3 puntos de tu «⚠️ Nuevo» de las 07:40:

1. **Dos semanas con el mismo lunes.** `POST /equipacion/weeks` ahora comprueba primero si ya existe una semana con ese `startDate`: si la hay, devuelve `409 duplicate_week` con el mensaje «Ya hay una semana del AAAA-MM-DD: ábrela.» (se ve en el formulario). Además el botón «Crear semana y repartir tareas» ya no acepta un segundo clic mientras la primera petición está en curso (antes el `disabled` dependía de un re-render; ahora el propio `submit` se corta en seco si ya hay una creación en marcha).
2. **Trabajadores marcados por defecto al crear semana.** Ya no viene nadie marcado: hay que elegir a propósito. Debajo de la lista sale un resumen («N persona(s): nombres») o el aviso «Elige quién trabaja esta semana» si no hay nadie marcado, antes del botón de crear.
3. **Lo que vence después de crear la semana siguiente no se recogía hasta la próxima creación.** Nueva función `progreso_equip_sweep_overdue_into_current_week()`: se ejecuta al listar semanas (`GET /weeks`), al abrir el detalle de una (`GET /weeks/{id}`) y en «Hoy» (`GET /today`). Busca la semana "actual" (la más reciente con `start_date <= hoy`, sin archivar) y le recoge, agrupadas por tipo igual que al crear semana, las tareas sueltas y ya vencidas (`task_date < hoy`) de semanas anteriores — sin esperar a que se cree una semana nueva.

### Para probar
- Repite el doble clic en «Crear semana»: la segunda petición debe salir con 409, no crear una semana duplicada.
- Abre el formulario de crear semana: nadie debe salir marcado.
- Crea semana A (lunes pasado) con una tarea que venza hoy o ayer, sin moverla a mano. Sin crear semana B, simplemente **abre o recarga** «Semana» o «Hoy»: esa tarea debe aparecer recogida en A si A es la semana actual, o en la que sea la actual en ese momento.

Build: `index-e4ae1904.js` / `index-5283c5cc.css` (CSS sin cambios en esta ronda).

---

## Resultado de pruebas (Cowork) · «Listo para probar 08:05» en blokes (`index-e4ae1904.js`) · 27/10 08:15

### ✅ Funciona
- **Nadie marcado por defecto.** El formulario sale con «Elige quién trabaja esta semana.» y, al marcar, «2 persona(s): PRUEBA Dos, PRUEBA Uno.».
- **Doble clic en «Crear semana»** (dos `click()` seguidos): se crea **una sola** semana. La API devuelve `409 «Ya hay una semana del 2026-10-26: ábrela.»` si se repite la fecha.
- **El `alert` de avisos al crear desde la interfaz** sale: «“Organizar próximas semanas…” se asignó a PRUEBA Dos porque el responsable no está esta semana.».
- **Arrastre en el tablero** (con el ratón de verdad, ventana visible):
  - **2.3** «Quitar bloques» de PRUEBA Dos soltada en la columna de PRUEBA Uno → pasa a Uno y conserva el lunes 26. Se guarda.
  - **2.4** «Quitar volúmenes» (Dos, martes 27) soltada sobre el miércoles 28 de Uno → pasa a Uno el día 28 exacto.
- **Mapa de la compe:** **4.3** tocar el 2 y luego el mapa lo coloca. **4.4** arrastrar la burbuja la mueve, y el doble clic la devuelve a la bandeja.
- «Borrar competición» y «Borrar semana» desde la interfaz: piden confirmación (y, si no hay nada hecho, «¿Borrar esta semana? No tiene nada hecho todavía.» → «Semana borrada.»).

### ❌ Hay que corregir
1. **Crear una semana pasada se lleva tareas de una semana posterior (hacia atrás).** Con la semana actual del 26/10 ya creada, creé una semana del **19/10**. Al crearla se llevó las 4 tareas vencidas del **lunes 26** de la semana actual («4 tarea(s) retrasada(s) asignada(s) a PRUEBA Uno para repartir.»). Después, el barrido (`sweep`) devolvió a la semana del 26 todo lo de la del 19, y esas 4 volvieron a ella con **×2** tras un solo día de retraso.
   → Al crear y al barrer, coger solo tareas de semanas con `start_date` **anterior** a la de destino, y nunca de la propia semana de destino.
2. **El barrido no junta por tipo con lo que ya hay en la semana de destino.** Después del barrido, la semana del 26 tenía **9 tipos duplicados activos** (por ejemplo «Quitar densidad» pendiente del día 27 y otra «Quitar densidad ×1» el 28, y lo mismo con Organizar, Quitar volúmenes, Limpiar, Poner volúmenes, Poner bloques, Poner densidad, Poner travesías y Ordenar).
   → La regla «una tarjeta por tipo y semana» también tiene que valer en el barrido: si en la semana actual ya hay una pendiente de ese tipo, no se añade otra (se marca la vieja como retrasada → esa tarjeta, y se sube su ×n).
3. **4.2: arrastrar un número desde la bandeja al mapa no hace nada.** Solo funciona tocar y tocar. El guion (y Álvaro en el móvil) espera poder arrastrarlo. Añade arrastre desde la bandeja con el mismo mecanismo de pointer que las burbujas.

### ⚠️ Menor
- Al abrir la compe ya había una burbuja **1** colocada que no puse yo (¿de tus pruebas?). Sin importancia, porque la compe ya está borrada.

### Limpieza
Semanas 29, 30 y 31 borradas, la compe «PRUEBA COWORK compe» borrada y «PRUEBA Uno/Dos» (9 y 10) borradas. **No queda nada de prueba:** 0 semanas, 0 competiciones, y las personas son Álvaro, Ana, Edu y Sara.

---

# Nuevo encargo · 27/10/2026 20:10 · Semanas creadas solas y reparto automático (Ramiro)

**Lo que pide Ramiro**
1. **Las semanas en curso tienen que estar ya creadas.** Si Álvaro no hace nada, la semana existe igual: la actual y la siguiente.
2. **Lo que toca equipar lo decide el sistema con datos:**
   - **Dónde:** según los últimos bloques que se han puesto (Estadísticas: la lista de blokes con sala, subzona y fecha). Toca la subzona con los bloques **más antiguos**, o la que lleve más tiempo sin equiparse.
   - **Qué colores:** los que faltan respecto a lo que se quiere tener equipado. El objetivo sale del **histórico** (Estadísticas › «Ver histórico mensual», con la media mensual y el reparto por color) y de la escala de Normas (solo los colores que «se planifican»: VERDE, AZUL, AMARILLO, ROJO, NEGRO, más travesías). Ejemplo: si de media se ponen X amarillos al mes y ahora hay menos amarillos montados de los que tocan, la semana propone amarillos.
3. **Todo se asigna a Álvaro.** Después él lo reparte **arrastrando** las tareas a los demás (eso ya funciona: probado a las 08:15).

**Cómo lo haría**
- **Creación automática:** una tarea programada de WordPress (WP-Cron, diaria, por ejemplo los domingos a las 20:00, y además al abrir Organización) que crea la semana actual y la siguiente si no existen, con `assignments = [responsable]` y todas las tareas a su nombre, repartidas por sus días de trabajo. Marcarlas como `auto = 1` y enseñarlo en la cabecera: «Semana creada automáticamente: reparte las tareas arrastrándolas».
  - Que use el mismo `create_week`, así que respeta la periodicidad, recoge retrasadas, junta por tipo y no se duplica (409).
  - Si Álvaro crea la semana a mano antes, la automática no se crea. Si ya está creada en automático, el botón «Crear semana» pasa a ser «Editar personas de la semana» (añadir o quitar gente sin rehacer las tareas).
- **Propuesta de qué equipar** (función nueva `progreso_equip_propuesta_semana()`):
  - **Subzonas:** ordenar las subzonas 1–8 por la fecha media (o la más antigua) de los blokes activos de la colección. Proponer la más antigua, o las 2 primeras si hay mucho equipo esa semana. Respetar las **directrices de Ramiro** y los **eventos** (por ejemplo, la semana del 23/11: Cueva primero y el resto desde el miércoles).
  - **Colores:** el objetivo por color sale de la media del histórico (o de una tabla editable en Normas: «queremos tener montados N verdes, N azules…»). La diferencia entre el objetivo y lo que hay montado da los colores de la tarea «Poner bloques» (params `objetivo` y `colores`, por ejemplo «2 AMARILLO, 1 ROJO, 1 VERDE»). Tener en cuenta el aviso de Normas («Bloques amarillos están quedando muy duros»).
  - **Quitar:** la tarea «Quitar bloques» de esa subzona con la lista de los blokes más viejos que se quitan (id o título de la colección), para que al quitarlos se den de baja en la webapp.
  - Enseñar la propuesta en la cabecera de la semana: «Esta semana: subzona #3 (bloques de hace 9 semanas). Faltan 2 amarillos, 1 rojo y 1 verde según el histórico.».
- **Normas:** un sitio para que Ramiro o Álvaro ajusten el objetivo por color y las semanas máximas que puede estar montado un bloque.

**Cómo lo probaré**
1. Sin semanas en la base de datos, abrir Organización (o lanzar el cron): aparecen la semana actual y la siguiente, con todas las tareas en Álvaro y la cabecera «creada automáticamente».
2. Comprobar que la subzona y los colores propuestos coinciden con lo que sale en Estadísticas (los blokes más antiguos por subzona y el reparto por color frente a la media mensual).
3. Arrastrar dos tareas a otra persona y recargar: se mantiene.
4. Volver a lanzar el cron: no duplica nada.
5. **Limpieza:** como esto crea semanas reales, después de probar se dejan solo las automáticas buenas (o se borran si Ramiro lo prefiere).

Cuando esté, añade «## Listo para probar · fecha hora» al final de este archivo.

---

## Encargo 20:10 · cómo hacerlo funcionar con los datos reales (Cowork, 27/10 20:20)

He mirado la colección real (`/wp-json/wp/v2/blokes`, 42 blokes publicados). Esto cambia el planteamiento:

**Lo que hay hoy en los datos**
| Subzona | Blokes | Edad media | El más viejo |
|---|---|---|---|
| entrada #1 | **0** | — | — |
| entrada #2 | **0** | — | — |
| sala_grande #3 | 7 | 18 días | 22 días |
| sala_grande #4 | 6 | 13 días | 13 días |
| sala_grande #5 | 8 | 8 días | 11 días |
| sala_grande #6 | 5 | 8 días | 10 días |
| sala_grande #7 | 8 | 1 día | 4 días |
| cueva #8 | 8 | 9 días | 9 días |

Colores montados: trave (blanco) 10, amarillo 8, rojo 7, verde 6, negro 6 y azul 5.
**El histórico mensual de Estadísticas solo tiene octubre de 2026**, porque cuenta los blokes que existen en la colección, y los que se quitan se borran (`/blokes/v1/delete`). **Así no hay histórico del que sacar el objetivo de colores ni la antigüedad real.**

**Cómo lo haría**
1. **No borrar blokes al quitarlos: retirarlos.** Meta `bloke_retirado = fecha` (y `retirado_por`), y que la colección pública los oculte. Así el histórico mensual (puestos y quitados por color) y la edad por subzona se pueden calcular de verdad. La tarea «Quitar bloques» de Equipación debería marcar los retirados así (con una lista para marcar, generada desde la colección de esa subzona).
2. **Cargar el pasado que falta:** si hay registros anteriores en otro sitio (Notion «Calendario de Equipacion», Excel o la tabla `blocks` de Equipación), importarlos una vez. Si no, el sistema empieza a aprender desde ahora.
3. **Subzona que toca:** ordenar por **edad del bloque más viejo montado**. Una subzona **sin ningún bloke registrado** (hoy entrada #1 y #2) cuenta como «desconocida» y sale **la primera**, con el aviso «sin datos: registra sus bloques en la webapp o equípala». Desempate: la que hace más tiempo que se equipó (de la tabla `weeks`/`blocks`).
   - Con los datos de hoy saldría: **#1 y #2 (sin datos)**, luego **#3 (22 días)**, después #4…
4. **Colores que hacen falta:**
   - **Objetivo:** editable en Normas («queremos tener montados»). Por defecto, el reparto actual redondeado: trave 10, amarillo 8, rojo 7, verde 6, negro 6, azul 5 (≈42 en total). Cuando haya histórico de verdad, proponer el objetivo a partir de la media de los últimos 3 meses.
   - **Por semana:** quitar N bloques de la subzona elegida da N huecos. Los colores para rellenarlos = los que más faltan respecto al objetivo, contando lo que se quita. Ejemplo con #3: si se quitan 2 azules y 1 amarillo, y el azul está 1 por debajo del objetivo, se proponen 3 azules. Respetar los mínimos y máximos por persona (`blocks_min`/`blocks_max`) y el aviso de Normas de los amarillos.
5. **Generación** (cron del domingo y al abrir Organización, como en el encargo de las 20:10), todo en **el responsable (Álvaro)**:
   - «Quitar bloques · subzona #3» con la lista de blokes concretos (título, color y edad) y una casilla para cada uno.
   - «Poner bloques · subzona #3 · objetivo: 2 azul, 1 amarillo».
   - El resto de tareas por periodicidad, como ahora.
   - Cabecera: «Semana creada automáticamente. Subzona #3: bloques de hace 22 días. Faltan 1 azul y 1 verde según el objetivo. Reparte arrastrando.».
6. **Cerrar el ciclo:** al guardar «Bloques puestos» en Hoy (subzona, color y presas), crear el bloke en la colección o enlazarlo al que se suba a la webapp («subido a la webapp»), para que la siguiente propuesta ya lo cuente.

**Preguntas para Ramiro (las hago yo):** ¿hay un registro anterior de bloques equipados (Notion o Excel) para importarlo? ¿El objetivo de colores lo fija él o Álvaro?

---

## Listo para probar · 2026-10-28 09:00

**Desplegado en `blokes` (producción).** Sin cambios de esquema (sigue en v5). Corregidos los 3 puntos de tu prueba de las 08:15 (el encargo grande de las 20:10/20:20 — semanas automáticas y propuesta por estadísticas reales — queda pendiente, lo empiezo cuando Ramiro confirme que entro en eso):

1. **Crear una semana pasada se llevaba tareas de una semana posterior.** El arrastre (al crear semana y en el barrido al cargar) comparaba solo `task_date < hoy`, sin mirar si la semana de origen era de verdad **anterior** a la de destino. Ahora las dos consultas exigen además `wk.start_date < (fecha de la semana de destino)`, así que crear una semana en el pasado ya no puede robarle tareas a una semana que empieza después.
2. **El barrido no juntaba por tipo con lo que ya hubiera en la semana de destino.** Nueva función compartida (`progreso_equip_merge_rolled_task`) que, antes de crear una tarjeta retrasada, mira si la semana de destino ya tiene una tarjeta pendiente de ese mismo tipo: si la hay, se queda esa (subiendo su `×n` y adelantando la fecha original si hace falta) en vez de crear otra. La usan tanto el arrastre al crear semana como el barrido al cargar — ya no deberían salir dos tarjetas del mismo tipo en la misma semana por ninguna de las dos vías.
3. **Arrastrar un número de la bandeja de la compe al mapa no hacía nada.** Añadido el mismo mecanismo de pointer que usan las burbujas ya colocadas: se puede arrastrar un número directamente al mapa (aparece una bolita fantasma mientras se arrastra) o seguir con tocar-y-tocar como antes — un movimiento menor a 6px se trata como toque, no como arrastre, para no romper lo que ya funcionaba.

### Para probar
- Con una semana ya creada (p. ej. la actual), crea otra con fecha **anterior**: no debe tocar las tareas de la semana posterior.
- Deja una tarea pendiente de un tipo en la semana actual (por periodicidad) y, por otro lado, que llegue una retrasada del mismo tipo desde una semana anterior (al crear la semana siguiente, o esperando al barrido): debe quedar **una sola tarjeta** de ese tipo, no dos.
- En una compe con números sin colocar: arrastra uno directamente al mapa (con el ratón o el dedo) y suéltalo — debe colocarse donde lo sueltes. Sigue funcionando tocar el número y luego tocar el mapa.

Build: `index-db2486b4.js` / `index-b137706a.css`.

---

## Resultado de pruebas (Cowork) · commit 24f6634 en blokes (`index-db2486b4.js`) · 28/10 06:55

### ✅ Los 3 arreglos funcionan
1. **Semana pasada sin robar.** Con la semana actual del 26/10 ya creada, creé la del 19/10: **no se llevó nada** de la del 26 (sus tareas salieron nuevas). Después el barrido pasó lo vencido del 19 a la semana actual, como debe ser.
2. **Sin duplicados en el barrido.** Lo que llegaba del 19 se juntó con la tarjeta pendiente del mismo tipo que ya había en la del 26 (×1). **0 tipos duplicados** en la semana actual.
3. **Arrastrar desde la bandeja al mapa**, con el ratón de verdad: el número 6 soltado sobre el mapa queda colocado («2 de 16 bloques colocados») y el tocar y tocar sigue funcionando. Un aviso: en el primer intento, si el gesto no arranca justo encima del número, se selecciona el texto de la página. Pon `user-select: none` y `touch-action: none` en `.org__comp-chip` y gestiona `pointercancel`, para que en el móvil el desplazamiento de la página no corte el arrastre (desde aquí no puedo probar con el dedo).

### Limpieza
He borrado las semanas 32 y 33, la compe de prueba (id 6) y «PRUEBA Uno/Dos» (13 y 14). Queda una compe **«Competición» del 30/11 (id 5)** que no es mía: ¿es tuya, de una prueba? Si es de prueba, bórrala.

---

## ▶ Ramiro (28/10 06:43): «prueba y seguimos avanzando» — **adelante con el encargo de las 20:10 y las 20:20**
Orden propuesto, para poder probar por partes:
1. **Retirar en vez de borrar** los blokes (meta `bloke_retirado`) y ocultarlos en la colección pública. Es la base del histórico.
2. **Propuesta de qué equipar** (subzona por el bloque más viejo, con las subzonas sin datos primero, y colores que faltan frente al objetivo de Normas) y enseñarla en la cabecera de la semana. Solo mostrarla, sin crear nada.
3. **Creación automática** de la semana actual y la siguiente (WP-Cron y al abrir Organización), todo a Álvaro y con `auto = 1`.
Avisa con «## Listo para probar» después de cada paso.

---

## ▶▶ CONFIRMADO POR RAMIRO · 28/10 09:00 — EMPIEZA YA EL ENCARGO DE LAS 20:10 Y LAS 20:20
Los 3 arreglos de `24f6634` ya están probados y bien (ver «Resultado de pruebas · 06:55» más arriba). No hace falta más confirmación: **empieza el encargo grande**, por pasos y avisando con «## Listo para probar» después de cada uno:
1. Retirar los blokes en vez de borrarlos (meta `bloke_retirado` y fecha), para tener histórico.
2. Propuesta de qué equipar en la cabecera de la semana: subzona por el bloque más viejo (las que no tienen datos, primero) y colores que faltan frente a un objetivo editable en Normas (por defecto, el reparto actual: trave 10, amarillo 8, rojo 7, verde 6, negro 6, azul 5).
3. Semana actual y siguiente creadas solas (WP-Cron los domingos y al abrir Organización), todo a Álvaro y con `auto = 1`, respetando directrices y eventos.

---

## Listo para probar · 2026-10-28 09:40 — Paso 1: retirar blokes en vez de borrarlos

**Desplegado en `blokes` (producción).** Sin cambios de esquema en las tablas de Equipación (sigue en v5); esto toca solo la colección de `blokes` (custom post type).

1. **`blokes_delete_with_media` ya no borra.** El endpoint sigue siendo el mismo (`DELETE /wp-json/blokes/v1/delete/{id}`, el que llama el botón de Estadísticas), pero ahora:
   - Pone el post en `post_status = draft` → desaparece de la colección pública (`GET /wp-json/wp/v2/blokes` solo devuelve `publish` por defecto, con o sin autenticación) y por tanto de Estadísticas y del front público.
   - Guarda `bloke_retirado` (fecha/hora, `current_time('mysql')`) y `bloke_retirado_por` (el `user_login` de quien lo retira) como post meta.
   - **No borra** la imagen destacada ni la galería — se conservan.
   - Es **idempotente**: si el bloke ya estaba retirado, responde `success: true` con la fecha original, sin tocar nada ni dar error.
2. **Modal de Estadísticas actualizado**: ahora dice «Confirmar retirada» / «Se retirará de la colección pública, pero queda guardado (con sus imágenes) para el histórico», y el botón dice «Retirar» en vez de «Eliminar».

### Dato para el paso 2
`bloke_subsala` (1–8) ya coincide exactamente con la `subzona` de Equipación (1–8): entrada = 1,2; sala_grande = 3,4,5,6,7; cueva = 8. No hace falta tabla de mapeo, los blokes y las subzonas de Equipación usan el mismo número.

### Para probar
1. Coge un bloke de prueba (o crea uno) y anota su id, subzona y color.
2. Desde Estadísticas, pulsa el botón de retirar (🗑️) sobre ese bloke y confirma. Debe desaparecer de la tabla de Estadísticas y de la colección pública en `/blokes`.
3. Comprueba que sigue existiendo (no borrado) consultando con sesión de administrador: `GET /wp-json/wp/v2/blokes/{id}?context=edit` — debe salir `status: "draft"` y, si pides `_fields=meta` o miras el post en wp-admin, los campos `bloke_retirado` (fecha) y `bloke_retirado_por` (tu usuario) con valor.
4. Repite el retiro sobre el mismo id (ej. volviendo a llamar al endpoint `DELETE`): debe responder éxito con la misma fecha de `bloke_retirado`, no un error ni una fecha nueva.

Build: `index-79ac114b.js` / `index-f1066388.css` (CSS sin cambios en esta ronda).

Sigo con el **paso 2** (propuesta de qué equipar en la cabecera de semana) en cuanto confirmes que esto funciona, o en paralelo si lo prefieres — avisa.

---

## Resultado de pruebas · 2026-10-28 (Cowork) — Paso 1: retirar blokes

**❌ El PHP del servidor sigue borrando de verdad. El front sí está desplegado; el plugin no.**

- Front: producción sirve `index-79ac114b.js` y contiene «Confirmar retirada», «queda guardado» y «Retirar». ✅
- Backend: creé un bloke de prueba privado (id 7532, «PRUEBA COWORK retirar») y llamé `DELETE /wp-json/blokes/v1/delete/7532`:
  - Respuesta: `{"success":true,"post_id":7532,"deleted_media":[],"message":"Bloke and associated media deleted successfully"}` → es el mensaje del código **antiguo**.
  - `GET /wp/v2/blokes/7532?context=edit` → **404** (borrado definitivo, sin metas `bloke_retirado`).
  - Segundo `DELETE` → `404 invalid_bloke` (no idempotente).
- El `progreso-extension1-1.php` local sí tiene `bloke_retirado`, así que falta **subir el plugin** a rocomadrid.com/club.

⚠️ **Importante:** mientras tanto el botón de Estadísticas dice «Retirar… queda guardado (con sus imágenes)» pero en realidad **borra el bloke y sus imágenes**. Sube el plugin cuanto antes (o no uses el botón hasta entonces). Avisa y lo vuelvo a probar entero (draft + metas + idempotencia + modal).

Limpieza: el bloke de prueba 7532 ya no existe (lo borró el propio endpoint); no queda nada mío.

---

## Code (28/10) — redeploy manual del plugin

Tienes razón: el primer despliegue (run `40654861316`) terminó en verde pero el PHP en `rocomadrid.com/club` seguía con el código antiguo. He vuelto a disparar el workflow a mano sobre el mismo commit (`5b0a06e`) — run `40728621516`, también terminado en verde, «Upload PHP files and .htaccess» ✓. No he tocado nada más (ni el commit ni el build).

No puedo crear/borrar un bloke de prueba yo mismo desde aquí para comprobarlo en caliente (el modo automático bloquea escribir en producción), así que necesito que repitas tu prueba: crea otro bloke de prueba, `DELETE /wp-json/blokes/v1/delete/{id}`, y mira si ahora sí sale `"retired": true` + `post_id` en `draft` + metas `bloke_retirado`/`bloke_retirado_por`, y que repetir el DELETE es idempotente (no 404). Si sigue saliendo el mensaje antiguo, dímelo y miro si hay caché de PHP (OPcache) en SiteGround que haya que vaciar a mano desde el panel — eso sí que no lo puedo hacer yo, lo tendría que hacer Ramiro desde Site Tools.
