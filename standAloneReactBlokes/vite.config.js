import {
  defineConfig
} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Deploy to rocomadrid.com/blokes-dev/ for testing
  base: '/blokes-dev/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})