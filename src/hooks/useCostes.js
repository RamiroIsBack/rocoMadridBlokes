import { useMemo } from 'react'
import { PROF_META, PROF_ORDER } from '../data/staffSchedule'
import { usePayroll } from './useOvertime'

// Coste empresa por persona, para cualquier pantalla que necesite comparar personal
// (CTRL Time Off, Playground…). Prioridad: nómina real de Supervisión › Horas extra
// (nómina base × FACTOR_COSTE + lo que se paga en efectivo); si la persona no tiene
// nómina ahí, se usa el coste de la ficha (`PROF_META.costoMes`, de marzo de 2026,
// a revisar) como último recurso.
// Coste empresa ≈ nómina × 1,395 (tabla de referencia de la ficha: 6, 7, 10 y 40 h/sem
// dan todas ese factor); lo que se paga en efectivo no lleva SS.
export const FACTOR_COSTE = 1.395

const normName = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

export function useCostes() {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data, loading, error } = usePayroll(month)

  return useMemo(() => {
    const ficha = Object.fromEntries(PROF_ORDER.map(p => [p, PROF_META[p].costoMes]))
    const nomina = {}
    ;(data?.rows || []).forEach(r => {
      const first = normName(r.name || '').split(/\s+/)[0]
      const p = PROF_ORDER.find(x => normName(x) === first)
      if (!p || r.base_nominal == null) return
      const banco = r.base_nominal
      const efectivo = r.cash_total != null ? Math.max(0, r.cash_total - banco) : 0
      nomina[p] = { banco, efectivo, coste: Math.round(banco * FACTOR_COSTE + efectivo) }
    })
    const conNomina = Object.keys(nomina).length > 0
    const mes = Object.fromEntries(PROF_ORDER.map(p => [p, nomina[p]?.coste ?? ficha[p]]))
    return { mes, ficha, nomina, conNomina, month, loading, error }
  }, [data, loading, error, month])
}
