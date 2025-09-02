// --- server/index.js (ESM) ---
import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import { createRequire } from 'module'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

// --- Tag de build ---
const BUILD_TAG = 'worduo-v10-' + new Date().toISOString()
console.log('[BOOT] starting', BUILD_TAG)

const require2 = createRequire(import.meta.url)
const wordsAll = require2('an-array-of-french-words')

console.log('=== WORDUO SERVER (Render + static + API + sockets) ===')

// ---------- App / HTTP / Socket ----------
const app = express()
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }))
app.use(express.json())

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/socket.io',
})

// --------- Trouver et servir le dossier du build Vite ---------
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDist = path.join(__dirname, '../dist')
const clientDist = path.join(__dirname, '../client/dist')
const distDir = fs.existsSync(clientDist) ? clientDist : rootDist

console.log('[STATIC] distDir =', distDir, 'exists =', fs.existsSync(distDir))

// Debug endpoints
app.get('/__debug', (_req, res) => {
  res.json({
    ok: true,
    tag: BUILD_TAG,
    distDir,
    exists: fs.existsSync(distDir),
    files: fs.existsSync(distDir) ? fs.readdirSync(distDir) : []
  })
})

// Sert les fichiers statiques du front
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
}

// ---------- Health check ----------
app.get('/health', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
)
app.get('/healthz', (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
)

// ==================== LOGIQUE DU JEU (inchangée) ====================
// … (tes fonctions shuffle, normalize, pickWord, etc.)
// … (tes routes /api/words, /api/rooms)
// … (tes sockets io.on('connection', ...))

// ---------- SPA fallback ----------
// Toute route qui n’est pas /api, /socket.io, /health, /__debug => index.html
app.get(/^\/(?!api|socket\.io|health|__debug).*/, (_req, res) => {
  if (fs.existsSync(distDir)) {
    res.sendFile(path.join(distDir, 'index.html'))
  } else {
    res.status(503).type('text/plain').send('Frontend not built yet.')
  }
})

// ---------- Lancement ----------
const PORT = process.env.PORT || 3000
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`)
})