// --- server/index.js ---
import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
// Le paquet expose un JSON ; en ESM strict (Node 20+), l'import direct exige
// l'attribut "with { type: 'json' }" selon la version de Node. On passe par
// createRequire (CommonJS) qui n'a pas cette contrainte et reste stable.
const frenchWords = require('an-array-of-french-words')

const app = express()
app.use(cors())
app.use(express.json())

// ================== Banque de mots ==================
// Normalise une fois au démarrage : minuscules, dédupliqué.
const ALL_WORDS = Array.from(new Set(frenchWords.map((w) => String(w).toLowerCase().trim())))

function hasHyphen(w) {
  return w.includes('-') || w.includes("'")
}

function isLikelyInfinitive(w) {
  return /(er|ir|re|oir)$/.test(w)
}

function filterWords({ minLen, maxLen, allowHyphen, onlyInfinitive, mode }) {
  return ALL_WORDS.filter((w) => {
    if (w.length < minLen || w.length > maxLen) return false
    if (!allowHyphen && hasHyphen(w)) return false
    if (onlyInfinitive && !isLikelyInfinitive(w)) return false
    // mode 'core' = on évite les mots avec accents/caractères spéciaux, plus simples à deviner à l'oral
    if (mode === 'core' && /[^a-z]/i.test(w)) return false
    return true
  })
}

function shuffleSample(arr, count) {
  const copy = arr.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

// ================== In-memory ==================
/**
 * Room shape:
 * {
 *   id: string,
 *   name: string,
 *   players: number,
 *   color: string,
 *   host: string | null,
 *   roles: { giver: boolean, guesser: boolean },
 *   game: {
 *     status: 'idle' | 'running' | 'ended',
 *     word: string | null,
 *     hint: string | null,
 *     guesses: string[],
 *     outcome: 'win' | 'lose' | null,
 *     revealWord: string | null,
 *     attempts: number
 *   }
 * }
 */
const rooms = new Map()

// socket -> { roomId, role, pseudo }
const socketInfo = new Map()

const MAX_ATTEMPTS = 6

function freshGame() {
  return {
    status: 'idle',
    word: null,
    hint: null,
    guesses: [],
    outcome: null,
    revealWord: null,
    attempts: 0,
  }
}

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      name: roomId,
      players: 0,
      color: roomId,
      host: null,
      roles: { giver: false, guesser: false },
      game: freshGame(),
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

function publicState(r, forSocketId) {
  const info = socketInfo.get(forSocketId)
  const role = info?.role
  return {
    roomId: r.id,
    role,
    pseudo: info?.pseudo,
    status: r.game.status,
    hint: r.game.hint,
    guesses: r.game.guesses,
    outcome: r.game.outcome,
    // le mot n'est révélé au devineur que si la partie est terminée
    revealWord: r.game.status === 'ended' ? r.game.revealWord : null,
    attempts: r.game.attempts,
    players: r.players,
  }
}

function broadcastState(io, r) {
  for (const [sockId, info] of socketInfo.entries()) {
    if (info.roomId === r.id) {
      io.to(sockId).emit('game:state', publicState(r, sockId))
    }
  }
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
      // si l'hôte est parti, on ne recalcule pas vraiment — on laisse comme est
      // (ou on pourrait choisir le prochain connecté comme host)
    }
  }
  socket.leave(roomId)
  socketInfo.delete(socket.id)
}

// ================== API ==================
app.get('/api/health', (req, res) => res.json({ ok: true }))

// Fournit une sélection aléatoire de mots français pour le meneur
app.get('/api/words', (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count, 10) || 200, 5000)
    const minLen = parseInt(req.query.minLen, 10) || 3
    const maxLen = parseInt(req.query.maxLen, 10) || 12
    const allowHyphen = req.query.allowHyphen === 'true'
    const onlyInfinitive = req.query.onlyInfinitive === 'true'
    const mode = req.query.mode === 'core' ? 'core' : 'all'

    const pool = filterWords({ minLen, maxLen, allowHyphen, onlyInfinitive, mode })
    if (pool.length === 0) {
      return res.status(404).json({ count: 0, words: [], message: 'Aucun mot ne correspond aux critères.' })
    }

    const words = shuffleSample(pool, count)
    res.json({ count: words.length, words })
  } catch (e) {
    console.error('[WORDS] error', e)
    res.status(500).json({ count: 0, words: [], message: 'Erreur serveur /api/words' })
  }
})

// Retourne UNIQUEMENT les rooms qui attendent quelqu'un (utile pour le lobby)
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
      game: freshGame(),
    })
  }
  res.status(201).json({ id })
})

// ================== Socket.IO ==================
const server = http.createServer(app)
const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Render (et les proxys en général) peuvent couper une connexion HTTP
  // silencieuse plus vite que le défaut de Socket.IO. On élargit les délais
  // pour éviter des déconnexions prématurées pendant un simple temps de
  // réflexion du joueur (rédiger un indice, chercher un mot...).
  pingTimeout: 30000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log('[SOCKET] client connected', socket.id)

  socket.onAny((eventName, ...args) => {
    console.log('[SOCKET IN]', socket.id, eventName, JSON.stringify(args).slice(0, 200))
  })

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

      // un rôle déjà pris ne peut pas être repris par un autre joueur
      if (r.roles[role]) {
        return cb?.({ ok: false, message: `Le rôle ${role === 'giver' ? 'meneur' : 'devineur'} est déjà pris dans ce salon.` })
      }

      r.players += 1
      r.roles[role] = true
      if (!r.host) r.host = pseudo // premier arrivé = host par défaut

      socket.join(roomId)
      socketInfo.set(socket.id, { roomId, role, pseudo })

      const state = publicState(r, socket.id)
      cb?.({ ok: true, state })

      // broadcast à tous les membres de la room (chacun reçoit sa propre vue)
      broadcastState(io, r)
    } catch (e) {
      console.error('[JOIN] error', e)
      cb?.({ ok: false, message: 'Erreur serveur join' })
    }
  })

  // Le meneur démarre une manche avec un mot
  socket.on('game:start', (payload, cb) => {
    try {
      const info = socketInfo.get(socket.id)
      if (!info) return cb?.({ ok: false, message: 'Non connecté à une room.' })
      const r = rooms.get(info.roomId)
      if (!r || info.role !== 'giver') return cb?.({ ok: false, message: 'Seul le meneur peut démarrer une manche.' })

      const word = String(payload?.word || '').trim().toUpperCase()
      if (!word) return cb?.({ ok: false, message: 'Mot vide.' })

      r.game = {
        status: 'running',
        word,
        hint: payload?.hint ? String(payload.hint) : null,
        guesses: [],
        outcome: null,
        revealWord: null,
        attempts: 0,
      }

      broadcastState(io, r)
      cb?.({ ok: true })
    } catch (e) {
      console.error('[START] error', e)
      cb?.({ ok: false, message: 'Erreur serveur.' })
    }
  })

  // Le meneur envoie un indice
  socket.on('game:hint', (payload, cb) => {
    try {
      const info = socketInfo.get(socket.id)
      if (!info) return cb?.({ ok: false, message: 'Non connecté à une room.' })
      const r = rooms.get(info.roomId)
      if (!r || info.role !== 'giver') return cb?.({ ok: false, message: 'Seul le meneur peut envoyer un indice.' })
      if (r.game.status !== 'running') return cb?.({ ok: false, message: 'Aucune manche en cours.' })

      const hint = String(payload?.hint || '').trim()
      if (!hint) return cb?.({ ok: false, message: 'Indice vide.' })

      r.game.hint = hint
      broadcastState(io, r)
      cb?.({ ok: true })
    } catch (e) {
      console.error('[HINT] error', e)
      cb?.({ ok: false, message: 'Erreur serveur.' })
    }
  })

  // Le devineur propose un mot
  socket.on('game:guess', (payload, cb) => {
    try {
      const info = socketInfo.get(socket.id)
      if (!info) return cb?.({ ok: false, message: 'Non connecté à une room.' })
      const r = rooms.get(info.roomId)
      if (!r || info.role !== 'guesser') return cb?.({ ok: false, message: 'Seul le devineur peut proposer un mot.' })
      if (r.game.status !== 'running') return cb?.({ ok: false, message: 'Aucune manche en cours.' })

      const guess = String(payload?.guess || '').trim().toUpperCase()
      if (!guess) return cb?.({ ok: false, message: 'Proposition vide.' })

      r.game.guesses.push(guess)
      r.game.attempts += 1

      let correct = false
      if (guess === r.game.word) {
        correct = true
        r.game.status = 'ended'
        r.game.outcome = 'win'
        r.game.revealWord = r.game.word
      } else if (r.game.attempts >= MAX_ATTEMPTS) {
        r.game.status = 'ended'
        r.game.outcome = 'lose'
        r.game.revealWord = r.game.word
      }

      broadcastState(io, r)
      cb?.({ ok: true, correct })
    } catch (e) {
      console.error('[GUESS] error', e)
      cb?.({ ok: false, message: 'Erreur serveur.' })
    }
  })

  // Le meneur (ou le devineur) abandonne la manche en cours
  socket.on('game:giveup', () => {
    try {
      const info = socketInfo.get(socket.id)
      if (!info) return
      const r = rooms.get(info.roomId)
      if (!r || r.game.status !== 'running') return

      r.game.status = 'ended'
      r.game.outcome = 'lose'
      r.game.revealWord = r.game.word

      broadcastState(io, r)
    } catch (e) {
      console.error('[GIVEUP] error', e)
    }
  })

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] client disconnected', socket.id, 'reason:', reason)
    const info = socketInfo.get(socket.id)
    const r = info ? rooms.get(info.roomId) : null
    leaveCurrentRoom(socket)
    if (r) broadcastState(io, r)
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