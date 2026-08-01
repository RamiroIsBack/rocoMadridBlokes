// Mock community averages for Jan–Aug 2026 (pre-season baseline).
// Temporada real arranca sep 2026; estos datos rellenan el chart hasta entonces.
// Test IDs: 2=sentadilla (reps), 3=dominadas (reps), 6=Kg Máx Der. (kg)
// Ene–Jun: índices 4–9 de communityAvg en rocomadrid.com/entrenamiento
// Jul–Aug: plateau al alza (la temporada oficial termina en jun)

const months = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']

const raw = {
  2: [12, 12, 13, 13, 14, 14, 15, 15],
  3: [2,  2,  3,  3,  3,  4,  4,  5 ],
  6: [21, 22, 22, 23, 24, 24, 25, 25],
}

export const MOCK_COMMUNITY_AVG = Object.fromEntries(
  Object.entries(raw).map(([tid, vals]) => [
    tid,
    Object.fromEntries(months.map((m, i) => [m, { avg_kg: vals[i] }])),
  ])
)
