const CLUB_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLUB_WORDPRESS_URL) || 'https://rocomadrid.com/club'
const TESTS_API = `${CLUB_URL}/wp-json/progreso/v1/training/tests`

function getAuthHeaders() {
  const nonce = window.blokesSiteData?.clubNonce || window.blokesSiteData?.nonce || ''
  return nonce ? { 'X-WP-Nonce': nonce } : {}
}

const LS_KEY = 'blokes_ctrl_tests'
const CONFIG_VERSION = 3  // bump para invalidar localStorage y aplicar nuevos defaults

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
    localStorage.setItem(LS_KEY, JSON.stringify({ ...data, version: CONFIG_VERSION }))
    window.dispatchEvent(new Event('blokes:tests-updated'))
  } catch {}
}

const INITIAL_MOCK_VALUES = {
  // ── Tren inferior ──────────────────────────────────────────
  14: 25,    // Puente glúteo       — ref 25 reps
  2:  14.1,  // Sentadilla en silla — ref 14.1 reps
  9:  8,     // Rodillas al pecho   — ref 8 reps
  10: 110,   // Apertura caderas    — ref 110 cm
  11: 6,     // Flex. frontal       — ref 6 cm de suelo
  12: 75,    // Grant Foot Raise    — ref 75 cm
  // ── Tren superior ──────────────────────────────────────────
  3:  3.5,   // Dominadas           — ref 3.5 reps
  4:  16,    // Flexiones           — ref 16 reps
  7:  45,    // Campus              — ref 45 cm
  8:  65,    // Ángulo pared        — ref 65°
  // ── Dedos ──────────────────────────────────────────────────
  5:  4,     // Resis. Flex. Prof.  — ref 4 series
  6:  24,    // Kg Máx dedos        — ref 24 kg
}

const INITIAL_CONFIG = { version: CONFIG_VERSION, tests: INITIAL_TESTS, mockValues: INITIAL_MOCK_VALUES }

export function getConfig() {
  const stored = load()
  return (stored?.version === CONFIG_VERSION) ? stored : INITIAL_CONFIG
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

// Patrones de variación: fracción del valor de referencia aplicada sobre la tendencia lineal
// El último elemento es siempre 0 para que el mes final aterrice en el valor de referencia
const JITTER = {
  A: [ 0.00, -0.04,  0.03, -0.02,  0.01,  0.00],
  B: [ 0.00,  0.03, -0.05,  0.02,  0.01,  0.00],
  C: [ 0.00, -0.02,  0.04, -0.03,  0.02,  0.00],
  D: [ 0.00,  0.02, -0.03,  0.04, -0.01,  0.00],
}
const JITTER_KEY = {
  14: 'A', 2: 'B',  9: 'C', 10: 'D',
  11: 'A', 12: 'B', 3: 'C',  4: 'D',
   7: 'A',  8: 'B', 5: 'C',  6: 'D',
}

function generateMockMonths(testId, referenceValue) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const start = referenceValue * 0.88
  const pattern = JITTER[JITTER_KEY[testId] || 'A']
  return Object.fromEntries(months.map((m, i) => {
    const trend  = start + (referenceValue - start) * (i / 5)
    const jitter = referenceValue * (pattern[i] ?? 0)
    const val    = Math.round((trend + jitter) * 10) / 10
    return [m, { avg_kg: val }]
  }))
}

// Sync test catalog from server — call on app boot; updates localStorage if server differs
export async function syncTestsFromServer() {
  try {
    const res = await fetch(TESTS_API)
    if (!res.ok) return
    const json = await res.json()
    if (!Array.isArray(json?.data?.tests)) return
    const config = getConfig()
    const updated = { ...config, tests: json.data.tests }
    if (json.data.mock_values) {
      const mv = {}
      Object.entries(json.data.mock_values).forEach(([k, v]) => { mv[Number(k)] = v })
      updated.mockValues = mv
    }
    persist(updated)
  } catch {}
}

// Save test catalog + mock values to server — supervisor only
export async function saveTestsToServer() {
  const { tests, mockValues } = getConfig()
  try {
    const res = await fetch(TESTS_API, {
      method: 'PUT',
      credentials: 'include',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tests, mock_values: mockValues }),
    })
    return res.ok
  } catch { return false }
}

export function getMockCommunityData() {
  const { mockValues } = getConfig()
  const result = {}
  Object.entries(mockValues).forEach(([tid, val]) => {
    if (val != null) result[Number(tid)] = generateMockMonths(Number(tid), val)
  })
  return result
}
