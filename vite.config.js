import {
  defineConfig
} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base is set via VITE_BASE_PATH env var: /blokes-dev/ (dev) or /blokes/ (prod)
  base: process.env.VITE_BASE_PATH || '/blokes-dev/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})