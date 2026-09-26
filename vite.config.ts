import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Même numéro de version que le serveur (à incrémenter à chaque redéploiement)
const { version } = JSON.parse(readFileSync(new URL('./server/version.json', import.meta.url), 'utf8'))

export default defineConfig({
    plugins: [react()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    base: '/', // <-- IMPORTANT pour Render (app à la racine)
    server: {
        host: true,
        port: 5173,
        proxy: {
            '/api': { target: 'http://localhost:3000', changeOrigin: true },
            '/socket.io': { target: 'http://localhost:3000', ws: true }
        }
    }
})


