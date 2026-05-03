import {
  defineConfig
} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base must match the subdirectory on the server: https://rocomadrid.com/blokes-dev
  base: '/blokes-dev/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})