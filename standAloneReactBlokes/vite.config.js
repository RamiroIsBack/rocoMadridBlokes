import {
  defineConfig
} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Deploy to root of domain (public_html)
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})