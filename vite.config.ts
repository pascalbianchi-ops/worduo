import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        host: true,       // tu gardes
        port: 5173,       // tu gardes
        proxy: {
            '/api': {
                target: 'http://localhost:3000', // ton serveur de mots
                changeOrigin: true
                // pas besoin de rewrite: ton backend sert déjà /api/words
            }
        }
    }
})



