export const ACHIEVEMENTS = [
  // ── Entrenamiento ────────────────────────────────────────────────────────
  {
    id: 'first_training', emoji: '🏋️', title: 'Primera carga', category: 'training',
    desc: 'Registra tu primer dato de entrenamiento',
    check: ({ training }) => Object.values(training).some(e => e.length > 0),
  },
  {
    id: 'all_tests', emoji: '💪', title: 'Cuerpo completo', category: 'training',
    desc: 'Datos en los 6 tests de entrenamiento',
    check: ({ training }) => {
      const vals = Object.values(training)
      return vals.length >= 6 && vals.every(e => e.length > 0)
    },
  },
  {
    id: 'consistent', emoji: '🔥', title: 'En racha', category: 'training',
    desc: 'Entrenamiento en 3 meses o más',
    check: ({ training }) => {
      const months = new Set(
        Object.values(training).flat().map(e => e.logged_at?.slice(0, 7)).filter(Boolean)
      )
      return months.size >= 3
    },
  },
  {
    id: 'improve_10', emoji: '📈', title: '+10%', category: 'training',
    desc: 'Mejora del 10% en algún test',
    check: ({ training }) => Object.values(training).some(entries => {
      if (entries.length < 2) return false
      return ((entries.at(-1).value_kg - entries[0].value_kg) / entries[0].value_kg) * 100 >= 10
    }),
  },
  {
    id: 'improve_25', emoji: '🚀', title: '¡Despegue!', category: 'training',
    desc: 'Mejora del 25% en algún test',
    check: ({ training }) => Object.values(training).some(entries => {
      if (entries.length < 2) return false
      return ((entries.at(-1).value_kg - entries[0].value_kg) / entries[0].value_kg) * 100 >= 25
    }),
  },
  // ── Blokes ───────────────────────────────────────────────────────────────
  {
    id: 'first_bloke', emoji: '🧗', title: 'Primera vía', category: 'blokes',
    desc: 'Encadena tu primer bloke',
    check: ({ completions }) => completions.total >= 1,
  },
  {
    id: 'five_blokes', emoji: '⭐', title: 'De 5', category: 'blokes',
    desc: '5 blokes encadenados',
    check: ({ completions }) => completions.total >= 5,
  },
  {
    id: 'ten_blokes', emoji: '🎯', title: 'Doble dígito', category: 'blokes',
    desc: '10 blokes encadenados',
    check: ({ completions }) => completions.total >= 10,
  },
  {
    id: 'twenty_five', emoji: '💎', title: 'Experto', category: 'blokes',
    desc: '25 blokes encadenados',
    check: ({ completions }) => completions.total >= 25,
  },
  {
    id: 'three_colors', emoji: '🌈', title: 'Colores', category: 'blokes',
    desc: 'Blokes de 3 colores distintos',
    check: ({ completions }) => completions.colors >= 3,
  },
  {
    id: 'all_colors', emoji: '🏆', title: 'Arcoíris', category: 'blokes',
    desc: 'Blokes de 5 colores distintos',
    check: ({ completions }) => completions.colors >= 5,
  },
  // ── Comunidad ─────────────────────────────────────────────────────────────
  {
    id: 'first_rating', emoji: '👍', title: 'Tu opinión', category: 'comunidad',
    desc: 'Valora tu primer bloke',
    check: ({ ratings }) => ratings.total >= 1,
  },
  {
    id: 'critic', emoji: '🗣️', title: 'Crítico', category: 'comunidad',
    desc: 'Valora 5 blokes',
    check: ({ ratings }) => ratings.total >= 5,
  },
]

// Compute achievements for a classmate using the limited data we get from class-progress endpoint
export function computeClassmateAchievements(member) {
  const tests = member.tests || {}
  const testVals = Object.values(tests)
  const maxMonths = testVals.length ? Math.max(...testVals.map(t => t.months)) : 0
  const maxPct    = testVals.length ? Math.max(...testVals.map(t => t.pct))    : 0
  const total     = member.bloke_total ?? 0
  const colors    = Object.keys(member.bloke_by_color || {}).length

  const check = (id) => {
    switch (id) {
      case 'first_training': return testVals.length > 0
      case 'all_tests':      return testVals.length >= 6
      case 'consistent':     return maxMonths >= 3
      case 'improve_10':     return maxPct >= 10
      case 'improve_25':     return maxPct >= 25
      case 'first_bloke':    return total >= 1
      case 'five_blokes':    return total >= 5
      case 'ten_blokes':     return total >= 10
      case 'twenty_five':    return total >= 25
      case 'three_colors':   return colors >= 3
      case 'all_colors':     return colors >= 5
      default: return false
    }
  }

  return ACHIEVEMENTS
    .filter(a => a.category !== 'comunidad')
    .map(a => ({ ...a, earned: check(a.id) }))
}

export function computeAchievements(trainingHistory, completionLog, ratingLog) {
  const colors = new Set(completionLog.map(e => e.color).filter(Boolean))
  const ctx = {
    training:    trainingHistory || {},
    completions: { total: completionLog.length, colors: colors.size },
    ratings:     { total: ratingLog.length },
  }
  return ACHIEVEMENTS.map(a => ({ ...a, earned: a.check(ctx) }))
}
