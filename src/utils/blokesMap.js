// Mapa de Blokes: esquema de todo lo que hay en la app, para revisarlo desde
// Superadmin y decidir qué se queda, qué se mejora y qué sobra. Las decisiones y
// notas se guardan en el servidor (superadmin/v1/blokes-map) por id: si cambias
// un id aquí, se pierde lo que se hubiera apuntado en él.
//
// who: quién lo ve — todos · alumnos · profes · gestion · socios

export const DECISIONS = [
  { id: 'keep',    label: 'Se queda',   icon: '✅' },
  { id: 'improve', label: 'Mejorar',    icon: '🛠' },
  { id: 'idea',    label: 'Idea nueva', icon: '💡' },
  { id: 'remove',  label: 'Sobra',      icon: '🗑' },
]

export const WHO = {
  todos:   'Todos',
  alumnos: 'Alumnos con sesión',
  profes:  'Profes',
  gestion: 'Gestión',
  socios:  'Socios',
}

export const BLOKES_MAP = [
  { id: 'publico', title: 'Parte pública', who: 'todos', children: [
    { id: 'cabecera', title: 'Cabecera', desc: 'Logotipo, claim «¿Hay blokes que se te resisten?», botones a clases y tecnificación, usuario y suscripción, mapa de salas con los blokes por color.' },
    { id: 'blokes', title: 'Los blokes', desc: 'Colección de blokes del rocódromo.', children: [
      { id: 'blokes-filtros',   title: 'Filtros y orden', desc: 'Por sala, subsala, color; ordenar por novedad o popularidad.' },
      { id: 'blokes-tarjeta',   title: 'Tarjeta de bloke', desc: 'Fotos, título, descripción, categoría, equipador.' },
      { id: 'blokes-tops',      title: 'Marcar TOP y valorar', desc: 'El alumno marca que lo ha encadenado y lo valora; lista de quién lo ha hecho.' },
      { id: 'blokes-insignias', title: 'Insignias', desc: 'NUEVO, Hall of Fame, primer encadenamiento (FA).' },
      { id: 'blokes-tutorial',  title: 'Tutorial de bienvenida', desc: 'Pantallas explicativas la primera vez.' },
    ] },
    { id: 'progreso', title: 'Progreso', children: [
      { id: 'progreso-mi', title: 'Mi progreso (antes Comunidad)', desc: 'Estadísticas por color, distribución de la colección, blokes más encadenados, Hall of Fame, ligas de la comunidad, progreso de entrenamiento.' },
      { id: 'progreso-clase', title: 'Mi clase', who: 'alumnos', desc: 'Para alumnos de clases dirigidas: blokes de la semana, ranking, valoraciones y tests físicos de la clase.' },
      { id: 'progreso-misblokes', title: 'Mis Blokes (antes Yo)', who: 'alumnos', desc: 'TOPs conseguidos, por color y sala, progresión mensual, logros, valoraciones y entrenamiento propio.' },
    ] },
    { id: 'ligas', title: 'Ligas', desc: 'Clasificación por ligas, ascensos y descensos con aviso.' },
    { id: 'perfil', title: 'Perfil', who: 'alumnos', desc: 'Apodo, avatar (dibujo o foto), aviso por WhatsApp.' },
    { id: 'logros', title: 'Logros y celebraciones', who: 'alumnos', desc: 'Medallas por hitos y ventana de celebración al conseguirlos.' },
    { id: 'tablet', title: 'Modo tablet', desc: 'Tablet del rocódromo: Los blokes, Progreso y Ligas sin iniciar sesión personal; elegir quién es.' },
    { id: 'app', title: 'Instalar como app (PWA)', desc: 'Se puede instalar en el móvil como una app.' },
  ] },

  { id: 'profes', title: 'Profes', who: 'profes', children: [
    { id: 'entrenamientos', title: 'Entrenamientos', children: [
      { id: 'entrena-alumno', title: 'Por alumno', desc: 'Buscar alumno, ver y apuntar sus tests físicos.' },
      { id: 'entrena-test',   title: 'Por test', desc: 'Resultados agrupados por test y por hora de clase.' },
      { id: 'entrena-defs',   title: 'Definiciones y elección de tests', desc: 'Qué tests hay y cuáles se usan.' },
    ] },
    { id: 'tareas', title: 'Tareas y setter', children: [
      { id: 'tareas-crear', title: 'Crear bloke', desc: 'Formulario para subir un bloke nuevo con fotos.' },
      { id: 'tareas-organizacion', title: 'Organización', desc: 'Catálogo de tareas, equipadores, bloques objetivo por semana.' },
      { id: 'tareas-stats', title: 'Estadísticas', desc: 'Blokes por color, sala, grado y equipador; retirar blokes.' },
    ] },
    { id: 'fichaje', title: 'Fichaje', desc: 'Registro de entrada y salida de los profes.' },
    { id: 'timeoff', title: 'Time Off', desc: 'Petición de vacaciones y ausencias.' },
  ] },

  { id: 'eventos-cal', title: 'Eventos y Calendario', children: [
    { id: 'eventos', title: 'Eventos', who: 'gestion', desc: 'Juan, gestión y socios.', children: [
      { id: 'eventos-reservas', title: 'Reservas', desc: 'Semana, lista con filtros (señal sin pagar, pendiente de cobro…), alta y edición.' },
      { id: 'eventos-disponibilidad', title: 'Disponibilidad', desc: 'Calendario del mes con huecos libres.' },
      { id: 'eventos-cobros', title: 'Cobros y rentabilidad', desc: 'Facturado, cobrado, pendiente y ganancia por mes; tarifas.' },
      { id: 'eventos-web', title: 'Reservas de la web (SSA)', desc: 'Las reservas web entran solas; los huecos de Eventos se bloquean en la web.' },
    ] },
    { id: 'calendario', title: 'Calendario', who: 'profes', desc: 'Notion (Funciones Rocomadrid) + reservas de Eventos; semana, mes y resumen. Versión reducida para profes y lista de acceso.' },
  ] },

  { id: 'supervision', title: 'Supervisión', who: 'gestion', children: [
    { id: 'sv-excelmuerte', title: 'ExcelMuerte', desc: 'Control de alumnos, clases y pagos.' },
    { id: 'sv-grupos', title: 'Grupos', desc: 'Grupos de clase: cobrar este mes, pausados, bajas, sin datos, externos.' },
    { id: 'sv-horasextra', title: 'Horas extra', desc: 'Horas extra de los profes.' },
    { id: 'sv-campanas', title: 'Campañas de WhatsApp', desc: 'Listas automáticas y envío manual; seguimiento de respuestas.' },
    { id: 'sv-timeoff', title: 'CTRL Time Off', who: 'socios', desc: 'Control de vacaciones con sueldos y P&L.' },
    { id: 'sv-historico', title: 'Histórico', who: 'socios' },
  ] },

  { id: 'superadmin', title: 'Superadmin', who: 'socios', children: [
    { id: 'sa-tesoreria', title: 'Tesorería', children: [
      { id: 'sa-ingresos', title: 'Ingresos', desc: 'Ventas de la tienda y del club.' },
      { id: 'sa-gastos', title: 'Gastos banco', desc: 'Movimientos del banco clasificados.' },
      { id: 'sa-presupuesto-anual', title: 'Presupuesto anual', desc: 'Matriz partidas × meses, presupuesto vs real.' },
      { id: 'sa-pl', title: 'P&L', desc: 'Ventas, costes fijos y resultado.' },
    ] },
    { id: 'sa-nominas', title: 'Nóminas', desc: 'Datos de los trabajadores y pagos.' },
    { id: 'sa-gestion', title: 'Gestión', children: [
      { id: 'sa-presupuestos', title: 'Presupuestos', desc: 'Presupuestos de obras y compras por zona.' },
      { id: 'sa-proyectos', title: 'Proyectos', desc: 'Parecida a Presupuestos: decidir cuál se queda.' },
    ] },
    { id: 'sa-acceso', title: 'Acceso', desc: 'Listas de socios, gestión, profes, tablets, Eventos y Calendario.' },
    { id: 'sa-vercomo', title: 'Ver como…', desc: 'Un socio puede ver la web como otro rol.' },
    { id: 'sa-mapa', title: 'Mapa de Blokes', desc: 'Este esquema.' },
  ] },

  { id: 'horarios-profes', title: 'Horarios Profes', who: 'socios', desc: 'Playground de horarios: horario base, reasignar clases, añadir horas.' },
]

// A dónde lleva pulsar cada elemento del mapa (ruta de la app y, si hace falta,
// la pestaña). Los que no tienen pantalla propia no llevan enlace.
export const MAP_LINKS = {
  publico: '/', cabecera: '/', blokes: '/', 'blokes-filtros': '/', 'blokes-tarjeta': '/', 'blokes-tops': '/', 'blokes-insignias': '/',
  progreso: '/progreso/comunidad', 'progreso-mi': '/progreso/comunidad', 'progreso-clase': '/progreso/clase', 'progreso-misblokes': '/progreso/yo',
  ligas: '/ligas', logros: '/progreso/yo',
  profes: '/entrenamientos',
  entrenamientos: '/entrenamientos', 'entrena-alumno': '/entrenamientos?tab=alumno', 'entrena-test': '/entrenamientos?tab=test', 'entrena-defs': '/entrenamientos?tab=definiciones',
  tareas: '/tareas/crear-bloke', 'tareas-crear': '/tareas/crear-bloke', 'tareas-organizacion': '/tareas/organizacion', 'tareas-stats': '/tareas/estadisticas',
  fichaje: '/fichaje', timeoff: '/time-off',
  'eventos-cal': '/eventos',
  eventos: '/eventos', 'eventos-reservas': '/eventos?tab=reservas', 'eventos-disponibilidad': '/eventos?tab=calendario', 'eventos-cobros': '/eventos?tab=cobros', 'eventos-web': '/eventos?tab=cobros',
  calendario: '/calendario',
  supervision: '/supervision?tab=excelmuerte', 'sv-excelmuerte': '/supervision?tab=excelmuerte', 'sv-grupos': '/supervision?tab=grupos&vista=grupos',
  'sv-horasextra': '/supervision?tab=horasextra', 'sv-campanas': '/supervision?tab=grupos&vista=campanas', 'sv-timeoff': '/supervision?tab=timeoff', 'sv-historico': '/supervision?tab=historico',
  superadmin: '/superadmin?tab=ingresos',
  'sa-tesoreria': '/superadmin?tab=ingresos', 'sa-ingresos': '/superadmin?tab=ingresos', 'sa-gastos': '/superadmin?tab=gastos', 'sa-presupuesto-anual': '/superadmin?tab=presupuesto-anual', 'sa-pl': '/superadmin?tab=pl',
  'sa-nominas': '/superadmin?tab=nominas', 'sa-gestion': '/superadmin?tab=presupuestos', 'sa-presupuestos': '/superadmin?tab=presupuestos', 'sa-proyectos': '/superadmin?tab=proyectos',
  'sa-acceso': '/superadmin?tab=acceso',
  'horarios-profes': '/playground',
}
