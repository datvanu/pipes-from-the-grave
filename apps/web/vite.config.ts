import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Set VITE_BASE=/repo-name/ for a GitHub Pages project site.
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/p': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
