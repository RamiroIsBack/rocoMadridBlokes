import { useState, useEffect } from 'react'
import { parseSheetRow } from '../utils/googleDriveUtils'

const API_KEY = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY
const SHEET_ID = import.meta.env.VITE_GOOGLE_SHEET_ID
const SHEET_RANGE = import.meta.env.VITE_GOOGLE_SHEET_RANGE || 'Sheet1!A:G'

/**
 * Custom hook that fetches and normalizes data from a public Google Sheet.
 *
 * The sheet must be shared publicly (View access) for this to work without OAuth.
 * See .env.example for the required environment variables.
 *
 * @returns {{ cards: Object[], loading: boolean, error: string|null }}
 */
export function useGoogleSheets() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      if (!API_KEY || !SHEET_ID) {
        setError('Configuración incompleta: faltan las variables de entorno VITE_GOOGLE_SHEETS_API_KEY y VITE_GOOGLE_SHEET_ID.')
        setLoading(false)
        return
      }

      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}` +
        `/values/${encodeURIComponent(SHEET_RANGE)}` +
        `?key=${API_KEY}`

      try {
        const response = await fetch(url)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const message = errorData?.error?.message || `HTTP ${response.status}`
          throw new Error(`Error al cargar datos: ${message}`)
        }

        const data = await response.json()
        const rows = data.values || []

        // Row 0 is the header row auto-created by Google Forms — skip it
        const dataRows = rows.slice(1)

        const parsedCards = dataRows
          .map((row, index) => parseSheetRow(row, index))
          .filter((card) => card.title && card.title !== 'Sin título')

        setCards(parsedCards)
      } catch (err) {
        setError(err.message || 'Error desconocido al cargar los datos.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return { cards, loading, error }
}
