// Horario de referencia del staff (Horario Marzo 2026.xlsx). Lo usan el
// Playground y la pestaña CTRL Time Off de Supervisión.

export const PROF_META = {
  Alvaro:  { color: '#f5c842', text: '#111', costoMes: 1715.60, horasSem: 27, clasesSem: 12, costoHClase: 14.12, equipHSem: 9,   costoHEquipar: 12 },
  Sigurd:  { color: '#60a5fa', text: '#fff', costoMes: 903,     horasSem: 9,  clasesSem: 6,  costoHClase: 18.40, equipHSem: 0, equipHMes: 10, costoHEquipar: 12 },
  'Lucía': { color: '#34d399', text: '#111', costoMes: 314,     horasSem: 6,  clasesSem: 4,  costoHClase: 12.09, equipHSem: 0,   costoHEquipar: null },
  Sara:    { color: '#f97316', text: '#fff', costoMes: 523,     horasSem: 10, clasesSem: 6,  costoHClase: 12.08, equipHSem: 1,   costoHEquipar: null },
  Ana:     { color: '#a78bfa', text: '#fff', costoMes: 400,     horasSem: 7,  clasesSem: 3,  costoHClase: 13.20, equipHSem: 2,   costoHEquipar: null },
  Eva:     { color: '#fb7185', text: '#fff', costoMes: 1424.46, horasSem: 20, clasesSem: 6,  costoHClase: 16.45, equipHSem: 0,   costoHEquipar: null },
}
export const PROF_ORDER = ['Alvaro', 'Sigurd', 'Lucía', 'Sara', 'Ana', 'Eva']

export const DAYS       = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']
export const DAY_LABEL  = { Lunes: 'Lunes', Martes: 'Martes', Miercoles: 'Miércoles', Jueves: 'Jueves', Viernes: 'Viernes' }

export const SALA = {
  Lunes:     { apertura: '13:30', cierre: '22:30', abre: 'Alvaro', cierra: 'Ana' },
  Martes:    { apertura: '09:00', cierre: '22:30', abre: 'Sara',   cierra: 'Sigurd' },
  Miercoles: { apertura: '13:30', cierre: '22:30', abre: 'Alvaro', cierra: 'Ana' },
  Jueves:    { apertura: '09:00', cierre: '22:30', abre: 'Sara',   cierra: 'Sigurd' },
  Viernes:   { apertura: '15:30', cierre: '21:30', abre: 'Eva',    cierra: 'Eva' },
}

export const BASE = {
  Alvaro: {
    Lunes:     [
      { tipo: 'equipar', start: '13:00', end: '15:00' },
      { tipo: 'comida',  start: '15:00', end: '16:00' },
      { tipo: 'equipar', start: '16:00', end: '17:30' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
    Martes:    [
      { tipo: 'equipar', start: '13:00', end: '14:00' },
      { tipo: 'clase',   start: '14:00', end: '15:30' },
      { tipo: 'equipar', start: '15:30', end: '16:30' },
      { tipo: 'clase',   start: '16:30', end: '18:00' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
    Miercoles: [
      { tipo: 'equipar', start: '13:00', end: '15:00' },
      { tipo: 'comida',  start: '15:00', end: '16:00' },
      { tipo: 'equipar', start: '16:00', end: '17:30' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
    Jueves:    [
      { tipo: 'clase',   start: '14:00', end: '15:30' },
      { tipo: 'equipar', start: '15:30', end: '16:30' },
      { tipo: 'clase',   start: '16:30', end: '18:00' },
      { tipo: 'clase',   start: '18:00', end: '19:30' },
      { tipo: 'clase',   start: '19:30', end: '21:00' },
    ],
  },
  Sigurd: {
    Martes: [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
      { tipo: 'clase', start: '20:30', end: '22:00' },
    ],
    Jueves: [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
      { tipo: 'clase', start: '20:30', end: '22:00' },
    ],
  },
  'Lucía': {
    Lunes:     [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
    ],
    Miercoles: [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '19:00', end: '20:30' },
    ],
  },
  Sara: {
    Martes: [
      { tipo: 'clase',   start: '09:00', end: '10:30' },
      { tipo: 'clase',   start: '10:30', end: '12:00' },
      { tipo: 'clase',   start: '12:00', end: '13:30' },
      { tipo: 'equipar', start: '13:30', end: '14:00' },
    ],
    Jueves: [
      { tipo: 'clase',   start: '09:00', end: '10:30' },
      { tipo: 'clase',   start: '10:30', end: '12:00' },
      { tipo: 'clase',   start: '12:00', end: '13:30' },
      { tipo: 'equipar', start: '13:30', end: '14:00' },
    ],
  },
  Ana: {
    Lunes:     [{ tipo: 'clase', start: '20:30', end: '22:00' }],
    Miercoles: [{ tipo: 'clase', start: '20:30', end: '22:00' }],
    Viernes:   [
      { tipo: 'equipar', start: '17:00', end: '19:00' },
      { tipo: 'clase',   start: '19:00', end: '21:00' },
    ],
  },
  Eva: {
    Lunes:     [{ tipo: 'gestion', start: '17:30', end: '21:00' }],
    Martes:    [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '18:30', end: '20:00' },
    ],
    Miercoles: [{ tipo: 'gestion', start: '17:30', end: '21:00' }],
    Jueves:    [
      { tipo: 'clase', start: '17:30', end: '19:00' },
      { tipo: 'clase', start: '18:30', end: '20:00' },
    ],
    Viernes:   [
      { tipo: 'gestion', start: '15:30', end: '18:00' },
      { tipo: 'clase',   start: '18:00', end: '19:00', label: 'Infantil' },
      { tipo: 'clase',   start: '19:00', end: '20:00', label: 'Adolescentes' },
      { tipo: 'gestion', start: '19:30', end: '21:30' },
    ],
  },
}
