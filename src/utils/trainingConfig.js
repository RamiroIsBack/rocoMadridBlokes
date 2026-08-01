const LS_KEY = 'blokes_ctrl_tests'

export const INITIAL_TESTS = [
  { id: 14, name: 'Puente glúteo',       unit: 'reps',   zone: 'lower'   },
  { id: 2,  name: 'Sentadilla en silla', unit: 'reps',   zone: 'lower'   },
  { id: 9,  name: 'Rodillas al pecho',   unit: 'reps',   zone: 'lower'   },
  { id: 10, name: 'Apertura caderas',    unit: 'cm',     zone: 'lower'   },
  { id: 11, name: 'Flex. frontal',       unit: 'cm',     zone: 'lower'   },
  { id: 12, name: 'Grant Foot Raise',    unit: 'cm',     zone: 'lower'   },
  { id: 3,  name: 'Dominadas',           unit: 'reps',   zone: 'upper'   },
  { id: 4,  name: 'Flexiones',           unit: 'reps',   zone: 'upper'   },
  { id: 7,  name: 'Campus',              unit: 'cm',     zone: 'upper'   },
  { id: 8,  name: 'Ángulo pared',        unit: '°',      zone: 'upper'   },
  { id: 5,  name: 'Resis. Flex. Prof.',  unit: 'series', zone: 'fingers' },
  { id: 6,  name: 'Kg Máx dedos',        unit: 'kg',     zone: 'fingers' },
]

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function persist(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
    window.dispatchEvent(new Event('blokes:tests-updated'))
  } catch {}
}

const INITIAL_MOCK_VALUES = {
  // ── Tren inferior ──────────────────────────────────────────
  14: 25,   // Puente glúteo       — ref 25 reps  (accesible, nivel bajo)
  2:  14,   // Sentadilla en silla — ref 14 reps  (comunidad marketing)
  9:  8,    // Rodillas al pecho   — ref 8 reps
  10: 110,  // Apertura caderas    — ref 110 cm
  11: 6,    // Flex. frontal       — ref 6 cm de suelo
  12: 75,   // Grant Foot Raise    — ref 75 cm
  // ── Tren superior ──────────────────────────────────────────
  3:  4,    // Dominadas           — ref 4 reps   (comunidad marketing)
  4:  16,   // Flexiones           — ref 16 reps
  7:  45,   // Campus              — ref 45 cm
  8:  65,   // Ángulo pared        — ref 65°
  // ── Dedos ──────────────────────────────────────────────────
  5:  4,    // Resis. Flex. Prof.  — ref 4 series (7s on/3s off, 20mm)
  6:  24,   // Kg Máx dedos        — ref 24 kg    (comunidad marketing)
}

export function getConfig() {
  return load() || { tests: INITIAL_TESTS, mockValues: INITIAL_MOCK_VALUES }
}

export function saveTests(tests) {
  const config = getConfig()
  persist({ ...config, tests })
}

export function setMockValue(testId, value) {
  const config = getConfig()
  persist({ ...config, mockValues: { ...config.mockValues, [testId]: value } })
}

export function clearMockValue(testId) {
  const config = getConfig()
  const mockValues = { ...config.mockValues }
  delete mockValues[testId]
  persist({ ...config, mockValues })
}

function generateMockMonths(referenceValue) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const start = referenceValue * 0.88
  return Object.fromEntries(months.map((m, i) => {
    const val = Math.round((start + (referenceValue - start) * (i / 5)) * 10) / 10
    return [m, { avg_kg: val }]
  }))
}

export function getMockCommunityData() {
  const { mockValues } = getConfig()
  const result = {}
  Object.entries(mockValues).forEach(([tid, val]) => {
    if (val != null) result[tid] = generateMockMonths(val)
  })
  return result
}
