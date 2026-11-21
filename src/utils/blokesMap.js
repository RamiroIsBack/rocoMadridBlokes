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


// Actualizado el 20/11/2026 con todo lo que había en producción.
export const BLOKES_MAP = [
  { id: 'diario', title: 'Diario', who: 'profes', desc: 'Panel del día para los profes (y la lista de Acceso, p. ej. Carolina). En construcción.' },

  { id: 'publico', title: 'Parte pública', who: 'todos', children: [
    { id: 'cabecera', title: 'Cabecera y menú', desc: 'Logotipo, usuario y suscripción, mapa de salas con los blokes por color, menú y botón de modo claro/oscuro.' },
    { id: 'tema', title: 'Modo claro / oscuro', desc: 'Botón para cambiar entre claro y oscuro; se recuerda en cada navegador.' },
    { id: 'blokes', title: 'Colección (Los blokes)', desc: 'Colección de blokes del rocódromo.', children: [
      { id: 'blokes-filtros',   title: 'Filtros y orden', desc: 'Por sala, subsala, color; ordenar por novedad o popularidad.' },
      { id: 'blokes-tarjeta',   title: 'Tarjeta de bloke', desc: 'Fotos, título, descripción, categoría, equipador.' },
      { id: 'blokes-tops',      title: 'Marcar TOP y valorar', desc: 'El alumno marca que lo ha encadenado y lo valora; lista de quién lo ha hecho.' },
      { id: 'blokes-insignias', title: 'Insignias', desc: 'NUEVO, Hall of Fame, primer encadenamiento (FA).' },
      { id: 'blokes-tutorial',  title: 'Tutorial de bienvenida', desc: 'Pantallas explicativas la primera vez.' },
    ]},
    { id: 'progreso', title: 'Progreso', children: [
      { id: 'progreso-mi', title: 'Comunidad', desc: 'Estadísticas por color, distribución de la colección, blokes más encadenados, Hall of Fame, ligas de la comunidad, progreso de entrenamiento.' },
      { id: 'progreso-clase', title: 'Mi clase', who: 'alumnos', desc: 'Para alumnos de clases dirigidas: blokes de la semana, ranking, valoraciones y tests físicos de la clase.' },
      { id: 'progreso-misblokes', title: 'Yo (Mis Blokes)', who: 'alumnos', desc: 'TOPs conseguidos, por color y sala, progresión mensual, logros, valoraciones y entrenamiento propio.' },
    ]},
    { id: 'ligas', title: 'Ligas', desc: 'Clasificación por ligas, ascensos y descensos con aviso. Incentivos: blokes nuevos puntúan ×2, racha semanal +5 y mensaje al apuntar un top.' },
    { id: 'compe-pub', title: 'Compe', desc: 'Competición del rocódromo.', children: [
      { id: 'compe-pagina', title: 'Página de la compe', desc: 'La próxima compe real, cómo funciona, «Próximamente» con cartel y cuenta atrás, y modo compe para apuntar tops.' },
      { id: 'compe-directo', title: 'Clasificación en directo (tele)', desc: 'Pantalla para la tele del Roco: clasificación en vivo durante la compe; si no hay compe, diapositivas, cartel con QR y mapa rotando.' },
    ]},
    { id: 'perfil', title: 'Perfil', who: 'alumnos', desc: 'Apodo, avatar (dibujo o foto), aviso por WhatsApp.' },
    { id: 'logros', title: 'Logros y celebraciones', who: 'alumnos', desc: 'Medallas por hitos y ventana de celebración al conseguirlos.' },
    { id: 'tablet', title: 'Modo tablet', desc: 'Tablet del rocódromo: Colección, Progreso y Ligas sin iniciar sesión personal; elegir quién es.' },
    { id: 'app', title: 'Instalar como app (PWA)', desc: 'Página /instalar con los pasos para iPhone y Android, vídeo tutorial y aviso si se abre desde WhatsApp o Instagram.' },
    { id: 'cookies', title: 'Cookies', desc: 'Las estadísticas solo se guardan con consentimiento; fuentes alojadas en nuestro servidor.' },
  ]},

  { id: 'profes', title: 'Profes', who: 'profes', children: [
    { id: 'entrenamientos', title: 'Entrenamientos', children: [
      { id: 'entrena-alumno', title: 'Por alumno', desc: 'Buscar alumno, ver y apuntar sus tests físicos.' },
      { id: 'entrena-test',   title: 'Por test', desc: 'Resultados agrupados por test y por hora de clase.' },
      { id: 'entrena-defs',   title: 'Definiciones y elección de tests', desc: 'Qué tests hay y cuáles se usan.' },
    ]},
    { id: 'tareas', title: 'Tareas y setter', children: [
      { id: 'tareas-crear', title: 'Crear bloke', desc: 'Ficha para subir un bloke nuevo: fotos (con «Quitar foto»), equipador, presas y subzona.' },
      { id: 'tareas-organizacion', title: 'Organización', desc: 'Tablero de tareas de los equipadores.', children: [
        { id: 'org-semana', title: 'Semana', desc: 'Tareas por persona y día, «Duplicar a…» varias personas, subzonas; en el móvil «Mis tareas» con barra fija abajo.' },
        { id: 'org-normas', title: 'Normas', desc: 'Catálogo de tareas, equipadores, bloques objetivo por semana, calendario de semanas y rotación de zonas.' },
        { id: 'org-compe', title: 'Plan de la compe', desc: 'Equipación de la compe en columnas por equipador o en tabla personas × días; bloques planificados (grado y presas), fijar o intercambiar números. Editarlo es solo de Álvaro o un socio.' },
      ]},
      { id: 'tareas-stats', title: 'Estadísticas', desc: 'Blokes por color, sala, grado y equipador; retirar blokes.' },
    ]},
    { id: 'fichaje', title: 'Fichaje', desc: 'Registro de entrada y salida de los profes.' },
    { id: 'timeoff', title: 'Time Off', desc: 'Petición de vacaciones y ausencias.' },
  ]},

  { id: 'eventos-cal', title: 'Eventos y Calendario', children: [
    { id: 'eventos', title: 'Eventos', who: 'gestion', desc: 'Juan, gestión y socios.', children: [
      { id: 'eventos-reservas', title: 'Reservas', desc: 'Semana, lista con filtros (señal sin pagar, pendiente de cobro…), alta y edición.' },
      { id: 'eventos-disponibilidad', title: 'Disponibilidad', desc: 'Calendario del mes con huecos libres.' },
      { id: 'eventos-cobros', title: 'Cobros y rentabilidad', who: 'socios', desc: 'Facturado, cobrado, pendiente y ganancia por mes; tarifas.' },
      { id: 'eventos-web', title: 'Reservas de la web (SSA)', desc: 'Las reservas web entran solas; los huecos de Eventos se bloquean en la web.' },
    ]},
    { id: 'calendario', title: 'Calendario', who: 'profes', desc: 'Notion (Funciones Rocomadrid) + reservas de Eventos; semana, mes y resumen. Versión reducida para profes y lista de acceso.' },
  ]},

  { id: 'supervision', title: 'Supervisión', who: 'gestion', children: [
    { id: 'sv-excelmuerte', title: 'ExcelMuerte', desc: 'Control de alumnos y clases: activos por clase (con externos), Personas (edad del formulario) y Horario por día (niños y adolescentes separados).' },
    { id: 'sv-grupos', title: 'Grupos', desc: 'Grupos de clase con buscador común a todas las listas.', children: [
      { id: 'sv-g-grupos', title: 'Grupos', desc: 'Alumnos por clase; alta directa desde el buscador sin duplicar; clase de un solo día; cambiar de grupo; congelar meses o pausar.' },
      { id: 'sv-g-altas-bajas', title: 'Altas y Bajas', desc: 'Altas y bajas reales del mes cruzadas con el Excel; baja con diálogo y WhatsApp.' },
      { id: 'sv-g-pendientes', title: 'Pendientes de cobro', desc: 'Quién falta por pagar este mes, con buscador.' },
      { id: 'sv-g-altas-manuales', title: 'Altas manuales' },
      { id: 'sv-g-tarjeta', title: 'Tarjeta rechazada' },
      { id: 'sv-g-espera', title: 'Lista de espera', desc: 'Incluye la entrada pública desde el selector de clases.' },
      { id: 'sv-g-revisar', title: 'Revisar datos' },
      { id: 'sv-g-bajo-tarifa', title: 'Bajo tarifa', desc: 'Quién paga menos de su tarifa (anual con 10 %, hermanos con 20 %…), con motivo y «revisado». Incluye Wellhub.' },
      { id: 'sv-g-excel', title: 'Cambios del Excel', desc: 'Sincronización con el Excel de Grupos: propuestas, avisos (fila repetida, importes rotos) y herramientas para deshacer.' },
      { id: 'sv-g-nombres', title: 'Nombres por revisar', desc: 'Corregir nombres de WordPress desde Blokes.' },
    ]},
    { id: 'sv-campanas', title: 'Campañas de WhatsApp', desc: 'Listas automáticas y envío manual; enlaces con seguimiento de clics, «Se apuntó»/«Respondió» automáticos y botones de deshacer.' },
    { id: 'sv-horasextra', title: 'Horas extra', desc: 'Horas extra de los profes.' },
    { id: 'sv-tele', title: 'Tele', desc: 'Control de la tele del Roco (para Eva): diapositivas, QR, vista previa y pantalla completa.' },
    { id: 'sv-timeoff', title: 'CTRL Time Off', who: 'socios', desc: 'Control de vacaciones con sueldos y P&L.' },
    { id: 'sv-historico', title: 'Histórico', who: 'socios' },
  ]},

  { id: 'superadmin', title: 'Superadmin', who: 'socios', children: [
    { id: 'sa-tesoreria', title: 'Tesorería', children: [
      { id: 'sa-ingresos', title: 'Ingresos', desc: 'Ventas de la tienda y del club, con o sin «Uso de Rocódromo»; desglose en gráfica por clasificación.' },
      { id: 'sa-clases', title: 'Clases', desc: 'Rentabilidad por clase (ingreso real y coste real del profe), retención por clase y por profe, alumnos por año, recomendación (promocionar, hablar con el profe, juntar o cerrar) y resumen de Bajo tarifa.' },
      { id: 'sa-gastos', title: 'Gastos banco', desc: 'Movimientos del banco clasificados, nóminas reales, IVA por trimestre y cuadre de saldo por año.' },
      { id: 'sa-presupuesto-anual', title: 'Presupuesto anual', desc: 'Matriz partidas × meses, presupuesto vs real.' },
      { id: 'sa-pl', title: 'P&L', desc: 'Ventas sin IVA (con el IVA real de las facturas), costes fijos y resultado; resumen anual, variación 26/25 y cuadre de saldo del Club y la Rocoteca.' },
    ]},
    { id: 'sa-nominas', title: 'Nóminas', desc: 'Datos de los trabajadores, pagos y voluntarios (fijo o por horas).' },
    { id: 'sa-gestion', title: 'Gestión', children: [
      { id: 'sa-presupuestos', title: 'Presupuestos', desc: 'Presupuestos de obras y compras por zona, con actuaciones inmediatas.' },
      { id: 'sa-proyectos', title: 'Proyectos', desc: 'Parecida a Presupuestos: decidir cuál se queda.' },
    ]},
    { id: 'sa-acceso', title: 'Acceso', desc: 'Listas de socios, gestión, profes, tablets, Eventos y Calendario.' },
    { id: 'sa-vercomo', title: 'Ver como…', desc: 'Un socio puede ver la web como otro rol.' },
    { id: 'sa-mapa', title: 'Mapa de Blokes', desc: 'Este esquema.' },
  ]},

  { id: 'horarios-profes', title: 'Horarios Profes', who: 'socios', desc: 'Playground de horarios: horario base, reasignar clases, añadir horas.' },

  { id: 'cherifs', title: 'Cherifs', who: 'socios', desc: 'Dashboard para controlar todo el negocio. En construcción.' },
]

// A dónde lleva pulsar cada elemento del mapa (ruta de la app y, si hace falta,
// la pestaña). Los que no tienen pantalla propia no llevan enlace.
const SV = '/supervision?tab=grupos&vista='
export const MAP_LINKS = {
  publico: '/', cabecera: '/', blokes: '/', 'blokes-filtros': '/', 'blokes-tarjeta': '/', 'blokes-tops': '/', 'blokes-insignias': '/',
  progreso: '/progreso/comunidad', 'progreso-mi': '/progreso/comunidad', 'progreso-clase': '/progreso/clase', 'progreso-misblokes': '/progreso/yo',
  ligas: '/ligas', logros: '/progreso/yo',
  'compe-pub': '/compe', 'compe-pagina': '/compe', 'compe-directo': '/compe/directo',
  app: '/instalar',
  profes: '/entrenamientos',
  entrenamientos: '/entrenamientos', 'entrena-alumno': '/entrenamientos?tab=alumno', 'entrena-test': '/entrenamientos?tab=test', 'entrena-defs': '/entrenamientos?tab=definiciones',
  tareas: '/tareas/crear-bloke', 'tareas-crear': '/tareas/crear-bloke', 'tareas-stats': '/tareas/estadisticas',
  'tareas-organizacion': '/tareas/organizacion?vista=semana', 'org-semana': '/tareas/organizacion?vista=semana', 'org-normas': '/tareas/organizacion?vista=normas', 'org-compe': '/tareas/organizacion?vista=compe',
  fichaje: '/fichaje', timeoff: '/time-off',
  'eventos-cal': '/eventos',
  eventos: '/eventos', 'eventos-reservas': '/eventos?tab=reservas', 'eventos-disponibilidad': '/eventos?tab=calendario', 'eventos-cobros': '/eventos?tab=cobros', 'eventos-web': '/eventos?tab=cobros',
  calendario: '/calendario',
  supervision: '/supervision?tab=excelmuerte', 'sv-excelmuerte': '/supervision?tab=excelmuerte',
  'sv-grupos': SV + 'grupos', 'sv-g-grupos': SV + 'grupos', 'sv-g-altas-bajas': SV + 'altas-bajas', 'sv-g-pendientes': SV + 'pendientes-cobro',
  'sv-g-altas-manuales': SV + 'altas-manuales', 'sv-g-tarjeta': SV + 'tarjeta-rechazada', 'sv-g-espera': SV + 'espera', 'sv-g-revisar': SV + 'revisar-datos',
  'sv-g-bajo-tarifa': SV + 'bajo-tarifa', 'sv-g-excel': SV + 'excel', 'sv-g-nombres': SV + 'nombres',
  'sv-campanas': '/supervision?tab=campanas', 'sv-horasextra': '/supervision?tab=horasextra', 'sv-tele': '/supervision?tab=tele',
  'sv-timeoff': '/supervision?tab=timeoff', 'sv-historico': '/supervision?tab=historico',
  superadmin: '/superadmin?tab=ingresos',
  'sa-tesoreria': '/superadmin?tab=ingresos', 'sa-ingresos': '/superadmin?tab=ingresos', 'sa-clases': '/superadmin?tab=clases', 'sa-gastos': '/superadmin?tab=gastos',
  'sa-presupuesto-anual': '/superadmin?tab=presupuesto-anual', 'sa-pl': '/superadmin?tab=pl', 'sa-nominas': '/superadmin?tab=nominas',
  'sa-gestion': '/superadmin?tab=presupuestos', 'sa-presupuestos': '/superadmin?tab=presupuestos', 'sa-proyectos': '/superadmin?tab=proyectos',
  'sa-acceso': '/superadmin?tab=acceso',
  'horarios-profes': '/playground',
  diario: '/diario', cherifs: '/cherifs',
}
