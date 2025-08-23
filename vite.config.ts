import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/worduo/',   // <-- très important pour GitHub Pages (nom exact du repo)
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
        // pas besoin de rewrite: ton backend sert déjà /api/words
      }
    }
  }
})
