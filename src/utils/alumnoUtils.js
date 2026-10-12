// Shared helpers for anything that lists or searches alumnos (real socios +
// manual alumnos/placeholders) — Entrenamientos and the tablet's "¿quién
// eres?" picker both need the exact same rules.

// Tildes/mayúsculas no deben decidir si hay coincidencia: "Jose" tiene que
// encontrar a "José" y viceversa, sea cual sea cómo esté escrito cada lado.
export function normalizeName(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Same user_id can show up more than once (several subscriptions — e.g. an
// old on-hold one plus the current active one): collapse those into a single
// row, preferring the active subscription as the one shown. Different real
// people who just happen to share a name are NOT merged — placeholder_id
// rows (manual alumnos) are never merged into anything either.
export function consolidateAlumnos(list) {
  const byUser = new Map()
  const result = []
  for (const a of list) {
    if (!a.user_id || a.placeholder_id) { result.push(a); continue }
    const existing = byUser.get(a.user_id)
    if (!existing) {
      byUser.set(a.user_id, a)
      result.push(a)
    } else if (a.status === 'active' && existing.status !== 'active') {
      result[result.indexOf(existing)] = a
      byUser.set(a.user_id, a)
    }
  }
  return result
}
