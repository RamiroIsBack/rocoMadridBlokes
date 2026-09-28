// Meses 'YYYY-MM' y formatos es-ES compartidos por Horas extra (Supervisión) y Nóminas (Superadmin).

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const pad = n => String(n).padStart(2, '0')

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const currentMonth = () => todayISO().slice(0, 7)

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export function monthShort(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export const fmtHours = h => Number(h).toLocaleString('es-ES', { maximumFractionDigits: 2 })
// useGrouping 'always': en es-ES los importes de 4 cifras no llevan punto de miles por defecto (1600,00 €)
export const fmtEur   = n => n == null ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' })
