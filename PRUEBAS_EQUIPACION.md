# Pruebas: Plan de Equipación ("Organización") — Blokes

Este documento es un guion de pruebas para comprobar que la sección de
Organización (reparto de tareas de equipación del rocódromo) funciona
correctamente. Está pensado para seguirse paso a paso, apuntando en cada
caso si el resultado obtenido coincide con el esperado.

## Antes de empezar

- **Entorno recomendado para probar:** `https://rocomadrid.com/blokes-dev/`
  (entorno de pruebas). Tiene la misma base de datos que la app real
  (`https://rocomadrid.com/blokes/`), así que cualquier dato que se cree
  aquí también aparecerá en producción — **todo lo que se cree durante las
  pruebas hay que borrarlo al terminar** (cada test de creación indica cómo).
- **Cuenta necesaria:** inicia sesión con una cuenta que tenga rol de
  profesor, gestión o socio. Con una cuenta de alumno normal, o con el rol
  "tablet" (tablet del gimnasio), no se ve esta sección.
- **Cómo llegar:** una vez logueado, en el menú de la app pulsa **"Tareas y
  setter"** → pestaña **"Organización"**. Dentro hay 4 sub-pestañas: **Hoy**,
  **Semana**, **Normas** y **Compe**.

---

## 1. Pestaña "Hoy"

### 1.1 Elegir quién eres
- **Qué hacer:** entra en Hoy por primera vez (o pulsa "No soy yo" si ya
  hay alguien elegido). Elige un nombre de la lista (p. ej. Álvaro).
- **Resultado esperado:** la app recuerda esa elección (si recargas la
  página sigue apareciendo ese nombre) y muestra arriba "Nombre ·
  responsable" si esa persona es la responsable del equipo.

### 1.2 Tareas de hoy
- **Qué hacer:** con una persona elegida, mira la sección "Tareas de hoy".
- **Resultado esperado:**
  - Si no hay ninguna semana planificada que incluya hoy, o hoy no es día
    de trabajo de esa persona, aparece el aviso "Sin tareas para hoy...".
  - Si hay tareas, cada una aparece con su nombre y, si aplica, su
    subzona/objetivo. Marca una como hecha (checkbox) y comprueba que se
    queda marcada (se ve más apagada) tanto si recargas la página como si
    cambias de persona y vuelves.

### 1.3 Bloques puestos
- **Qué hacer:** pulsa "+ Añadir bloque". Elige una subzona, un color de
  dificultad, uno o varios juegos de presas, y marca si es travesía.
  Guarda.
- **Resultado esperado:** el bloque aparece en la lista con su color y
  subzona. Si eliges un juego de presas que ya está en uso en esa misma
  subzona esta semana, debe aparecer un aviso (⚠) pero el bloque se guarda
  igualmente.
- **Qué hacer (2):** en un bloque ya creado, marca "subido a la webapp" y
  después bórralo con la ✕.
- **Resultado esperado:** el checkbox se guarda sin recargar la página; al
  borrar, el bloque desaparece de la lista.

---

## 2. Pestaña "Semana"

### 2.1 Gestión de personas
- **Qué hacer:** pulsa "Gestionar personas". Crea una persona nueva de
  prueba (p. ej. "Prueba Cowork"), con un par de días de trabajo y un
  rango de bloques objetivo. Guarda.
- **Resultado esperado:** aparece en la lista de personas.
- **Qué hacer (2):** bórrala con la ✕.
- **Resultado esperado:** pide confirmación y, al aceptar, desaparece de
  la lista. (Avisa que no borra semanas ya creadas con esa persona —no es
  necesario comprobar esa parte.)

### 2.2 Crear una semana nueva
- **Qué hacer:** pulsa "+ Crear semana nueva". Elige un lunes (cualquier
  fecha futura), al menos una subzona, y dos o más trabajadores. Pulsa
  "Crear semana y repartir tareas".
- **Resultado esperado:** la semana aparece en la lista "Semana del
  [fecha]". Al abrirla (clic encima), aparece un tablero con una columna
  por cada trabajador elegido, y dentro, sus tareas repartidas por día
  (agrupadas bajo cada día de la semana en que trabaja esa persona).

### 2.3 Tablero de tareas: mover una tarea a otra persona
- **Qué hacer:** dentro de una semana, arrastra una tarjeta de tarea desde
  la columna de una persona hasta la columna de otra persona (suéltala en
  cualquier punto de esa columna).
- **Resultado esperado:** la tarjeta desaparece de la columna original y
  aparece en la columna destino, conservando su mismo día. Si recargas la
  página, el cambio se mantiene (no es solo visual).

### 2.4 Tablero de tareas: mover una tarea a un día concreto
- **Qué hacer:** arrastra una tarjeta y suéltala sobre un día concreto
  (dentro de la misma columna o de otra), no solo sobre la columna en
  general.
- **Resultado esperado:** la tarjeta se mueve a ese día exacto (comprobar
  que queda bajo el encabezado de ese día, no de otro).

### 2.5 Marcar tareas como hechas
- **Qué hacer:** dentro del tablero, marca el checkbox de un par de
  tarjetas.
- **Resultado esperado:** la tarjeta se ve más apagada (hecha). Al
  recargar la página, sigue marcada.

### 2.6 Tareas que faltó hacer (histórico)
- **Qué hacer:** crea una semana con fecha de **hace 2 semanas** (en el
  pasado) con uno o dos trabajadores. Ábrela y NO marques ninguna tarea
  como hecha.
- **Resultado esperado:** todas las tarjetas de esa semana pasada aparecen
  resaltadas en rojo con la etiqueta **"FALTÓ"**, ya que su día ya pasó y
  no se marcaron como hechas.
- **Qué hacer (2):** marca una de esas tarjetas "FALTÓ" como hecha.
- **Resultado esperado:** esa tarjeta deja de mostrar la etiqueta "FALTÓ"
  inmediatamente.
- **Limpieza:** borra esta semana de prueba al terminar (no hay botón de
  borrar semana visible en la interfaz; si no lo encuentras, anótalo como
  pendiente en vez de dejar datos de prueba sueltos).

### 2.7 El sistema propone, pero no repite todo cada semana
- **Qué hacer:** crea dos semanas seguidas (la segunda una semana después
  de la primera) con las mismas personas y subzona. Mira en "Normas" si
  alguna tarea tiene periodicidad mayor que 1 semana (ver test 3.2) — si
  es así, comprueba que esa tarea NO aparece en la segunda semana si la
  primera fue hace menos tiempo del indicado.
- **Resultado esperado:** las tareas de periodicidad 1 (la mayoría)
  aparecen en ambas semanas; las de periodicidad mayor solo aparecen
  cuando ha pasado el tiempo suficiente.

---

## 3. Pestaña "Normas"

### 3.1 Consultar grados y reglas
- **Qué hacer:** entra en Normas y revisa la tabla de colores/grados y la
  lista de reglas.
- **Resultado esperado:** se ve una tabla con colores (INTRO, VERDE, AZUL,
  AMARILLO, ROJO, NEGRO, BLANCO) y un rango asociado a cada uno, y una
  lista de reglas de texto debajo.

### 3.2 Catálogo de tareas y periodicidad
- **Qué hacer:** busca la sección "Catálogo de tareas". Cambia la
  periodicidad de una tarea (p. ej. de 1 a 2 semanas) y guarda.
- **Resultado esperado:** el nuevo valor se queda guardado (recarga la
  página para comprobarlo). Esto afecta a qué tareas se proponen al crear
  una semana nueva (ver test 2.7).
- **Limpieza:** vuelve a dejar esa tarea en periodicidad 1 al terminar la
  prueba, para no afectar al reparto real.

---

## 4. Pestaña "Compe"

### 4.1 Crear una competición
- **Qué hacer:** pulsa "+ Nueva competición". Pon un nombre de prueba,
  una fecha y semanas de antelación. Crea.
- **Resultado esperado:** se abre el editor de mapa con 16 números (del 1
  al 16) sin colocar, en una bandeja arriba del mapa.

### 4.2 Colocar bloques en el mapa (arrastrando)
- **Qué hacer:** arrastra uno de los números sin colocar directamente
  sobre una zona del mapa del rocódromo.
- **Resultado esperado:** el número aparece como una burbuja en ese punto
  del mapa y desaparece de la bandeja de "sin colocar".

### 4.3 Colocar bloques en el mapa (tocar y tocar)
- **Qué hacer:** toca (clic) un número de la bandeja para seleccionarlo
  (se resalta) y después toca un punto del mapa.
- **Resultado esperado:** el número se coloca en ese punto exacto, igual
  que con arrastrar.

### 4.4 Mover y quitar una burbuja ya colocada
- **Qué hacer:** arrastra una burbuja ya colocada a otro punto del mapa.
  Después, haz doble clic sobre una burbuja.
- **Resultado esperado:** al arrastrar, la burbuja cambia de sitio. Al
  hacer doble clic, la burbuja vuelve a la bandeja de "sin colocar".

- **Limpieza:** esta competición de prueba no se puede borrar desde la
  interfaz todavía; anótala como dato de prueba pendiente de limpiar
  manualmente (dile a Ramiro qué nombre le pusiste).

---

## Resumen: checklist final

Marca cada punto según el resultado obtenido:

- [ ] 1.1 Elegir quién eres — se recuerda al recargar
- [ ] 1.2 Tareas de hoy — se pueden marcar como hechas
- [ ] 1.3 Bloques puestos — crear, aviso de duplicado, subido a webapp, borrar
- [ ] 2.1 Gestión de personas — crear y borrar
- [ ] 2.2 Crear semana — reparte tareas en un tablero por persona
- [ ] 2.3 Arrastrar tarea a otra persona — se reasigna de verdad
- [ ] 2.4 Arrastrar tarea a un día concreto — cambia de día
- [ ] 2.5 Marcar tarea como hecha en el tablero
- [ ] 2.6 Semana pasada sin marcar → aparece "FALTÓ"; se quita al marcarla
- [ ] 2.7 Periodicidad — tareas de periodicidad >1 no se repiten cada semana
- [ ] 3.1 Normas — tabla de grados y reglas visibles
- [ ] 3.2 Editar periodicidad de una tarea — se guarda
- [ ] 4.1 Crear competición — aparecen 16 números sin colocar
- [ ] 4.2 Colocar burbuja arrastrando
- [ ] 4.3 Colocar burbuja con toca-y-toca
- [ ] 4.4 Mover y quitar burbuja (doble clic)

Si algún punto no da el resultado esperado, anota: qué paso seguiste,
qué esperabas que pasara y qué pasó realmente, para poder revisarlo.
