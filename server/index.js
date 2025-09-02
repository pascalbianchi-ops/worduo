// --- server/index.js ---
import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())
app.use(express.json())

// ==== In-memory rooms ====
const rooms = new Map() // id -> { id, name, players: number }

// ==== API ====
app.get('/api/health', (req, res) => res.json({ ok: true }))

app.get('/api/rooms', (req, res) => {
  const list = Array.from(rooms.values())
  res.json({ rooms: list })
})

app.post('/api/rooms', (req, res) => {
  const id = String(Date.now())
  const name = req.body?.name || `Salon-${id.slice(-4)}`
  rooms.set(id, { id, name, players: 0 })
  res.status(201).json({ id })
})

// ==== Socket.IO ====
const server = http.createServer(app)
const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

// Associer chaque socket à sa room courante
const socketRoom = new Map() // socket.id -> roomId

io.on('connection', (socket) => {
  console.log('[SOCKET] client connected', socket.id)

  socket.on('game:join', (payload, cb) => {
    console.log('[JOIN]', payload)

    const { roomId, pseudo, role } = payload
    if (!roomId || !pseudo) {
      return cb?.({ ok: false, message: 'roomId et pseudo requis' })
    }

    // Création ou mise à jour de la room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { id: roomId, name: roomId, players: 0 })
    }
    const r = rooms.get(roomId)
    r.players++
    socketRoom.set(socket.id, roomId)

    socket.join(roomId)

    // État initial envoyé au client qui a rejoint
    const state = {
      roomId,
      role,
      pseudo,
      status: 'idle',
      guesses: [],
      players: r.players
    }

    cb?.({ ok: true, state })

    // Notifier tous les clients de la room
    io.to(roomId).emit('game:state', state)
  })

  socket.on('disconnect', () => {
    console.log('[SOCKET] client disconnected', socket.id)
    const roomId = socketRoom.get(socket.id)
    if (roomId && rooms.has(roomId)) {
      const r = rooms.get(roomId)
      r.players = Math.max(0, r.players - 1)
      if (r.players === 0) {
        rooms.delete(roomId) // supprime la room vide
      }
    }
    socketRoom.delete(socket.id)
  })
})

// ==== Static (Vite build) ====
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))

// ==== Catch-all SPA, sauf /api et /socket.io ====
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return res.status(404).end()
  }
  return res.sendFile(path.join(distDir, 'index.html'))
})

// ==== Start ====
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log('🚀 Server listening on', PORT)
})