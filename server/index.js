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

// ================== In-memory ==================
/**
 * Room shape:
 * {
 *   id: string,
 *   name: string,
 *   players: number,
 *   color: string,
 *   host: string | null,
 *   roles: { giver: boolean, guesser: boolean }
 * }
 */
const rooms = new Map()

// socket -> { roomId, role, pseudo }
const socketInfo = new Map()

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: roomId,
      players: 0,
      color: roomId,
      host: null,
      roles: { giver: false, guesser: false },
    })
  }
  return rooms.get(roomId)
}

function computeWaitingFor(r) {
  // retourne le rôle manquant, ou null si complet
  if (!r.roles.giver) return 'meneur'
  if (!r.roles.guesser) return 'devineur'
  return null
}

function leaveCurrentRoom(socket) {
  const info = socketInfo.get(socket.id)
  if (!info) return
  const { roomId, role } = info
  const r = rooms.get(roomId)
  if (r) {
    r.players = Math.max(0, r.players - 1)
    if (role && r.roles[role] !== undefined) r.roles[role] = false
    if (r.players === 0) {
      rooms.delete(roomId)
    } else {
      // si l’hôte est parti, on ne recalcule pas vraiment — on laisse comme est
      // (ou on pourrait choisir le prochain connecté comme host)
    }
  }
  socket.leave(roomId)
  socketInfo.delete(socket.id)
}

// ================== API ==================
app.get('/api/health', (req, res) => res.json({ ok: true }))

// Retourne UNIQUEMENT les rooms qui attendent quelqu’un (utile pour le lobby)
app.get('/api/rooms', (req, res) => {
  const list = []
  for (const r of rooms.values()) {
    const waitingFor = computeWaitingFor(r)
    if (waitingFor) {
      list.push({
        id: r.id,
        color: r.color,
        host: r.host || '???',
        waitingFor, // 'meneur' | 'devineur'
      })
    }
  }
  res.json({ rooms: list })
})

// Optionnel: création manuelle de room (debug)
app.post('/api/rooms', (req, res) => {
  const id = String(Date.now())
  const name = req.body?.name || `Salon-${id.slice(-4)}`
  if (!rooms.has(id)) {
    rooms.set(id, {
      id, name,
      players: 0,
      color: name,
      host: null,
      roles: { giver: false, guesser: false },
    })
  }
  res.status(201).json({ id })
})

// ================== Socket.IO ==================
const server = http.createServer(app)
const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

io.on('connection', (socket) => {
  console.log('[SOCKET] client connected', socket.id)

  // Join / switch de room
  socket.on('game:join', (payload, cb) => {
    try {
      const { roomId, pseudo, role } = payload || {}
      if (!roomId || !pseudo || (role !== 'giver' && role !== 'guesser')) {
        return cb?.({ ok: false, message: 'roomId, pseudo et role requis' })
      }

      // Si le socket était déjà dans une room, on le retire proprement
      leaveCurrentRoom(socket)

      const r = ensureRoom(roomId)
      r.players += 1
      r.roles[role] = true
      if (!r.host) r.host = pseudo // premier arrivé = host par défaut

      socket.join(roomId)
      socketInfo.set(socket.id, { roomId, role, pseudo })

      // État initial
      const state = {
        roomId,
        role,
        pseudo,
        status: 'idle',
        guesses: [],
        players: r.players,
      }

      cb?.({ ok: true, state })

      // broadcast d’un petit état room (facultatif)
      io.to(roomId).emit('game:state', state)
    } catch (e) {
      console.error('[JOIN] error', e)
      cb?.({ ok: false, message: 'Erreur serveur join' })
    }
  })

  socket.on('disconnect', () => {
    console.log('[SOCKET] client disconnected', socket.id)
    leaveCurrentRoom(socket)
  })
})

// ================== Static (Vite build) ==================
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))

// ================== Catch-all SPA ==================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return res.status(404).end()
  }
  return res.sendFile(path.join(distDir, 'index.html'))
})

// ================== Start ==================
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log('🚀 Server listening on', PORT)
})