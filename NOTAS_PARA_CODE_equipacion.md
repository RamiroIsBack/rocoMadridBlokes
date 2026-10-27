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
