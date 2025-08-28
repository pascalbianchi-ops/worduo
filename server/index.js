// --- server/index.js (ESM) ---
import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import { createRequire } from 'module'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

// --- AJOUT tout en haut (après tes imports) ---
const BUILD_TAG = 'worduo-v10-' + new Date().toISOString();
console.log('[BOOT] starting', BUILD_TAG);

const require2 = createRequire(import.meta.url)
const wordsAll = require2('an-array-of-french-words')

console.log('=== DEVINE SERVER v8 (Render + static + API + sockets) ===')

// ---------- App / HTTP / Socket ----------
const app = express()
app.use(cors())           // si besoin, restreins origin ici
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

// Endpoint debug (vérifier que Render voit bien les fichiers)
app.get('/__debug', (_req, res) => {
    res.json({
        distDir,
        exists: fs.existsSync(distDir),
        files: fs.existsSync(distDir) ? fs.readdirSync(distDir) : []
    })
})
// AJOUT: route de test unique
app.get('/__debug_v10', (_req, res) => {
    res.json({
        ok: true,
        tag: BUILD_TAG,
        distDir,
        exists: fs.existsSync(distDir),
        files: fs.existsSync(distDir) ? fs.readdirSync(distDir) : []
    });
});

// Sert les fichiers statiques du front
if (fs.existsSync(distDir)) {
    app.use(express.static(distDir))
}

// ---------- Routes de santé ----------
app.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))

// ==================== OUTILS / JEU ====================
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}
function unique(arr) { return Array.from(new Set(arr)) }
function normalize(s) {
    return (s ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z]/g, '')
}
function hasThreeConsecutive(hint, word) {
    const H = normalize(hint), W = normalize(word)
    if (H.length === 0 || W.length < 3) return false
    for (let i = 0; i <= W.length - 3; i++) {
        if (H.includes(W.slice(i, i + 3))) return true
    }
    return false
}

// --- Filtre qualité "mots courants" ---
function isCleanWord(w, { allowHyphen, minLen = 6, maxLen = 12 }) {
    if (!w || typeof w !== 'string') return false
    const s = String(w).trim().toLowerCase()
    if (!s || s.includes(' ') || s.includes('_')) return false
    if (s.length < minLen || s.length > maxLen) return false
    if (!allowHyphen && s.includes('-')) return false
    if (s.includes("'") || s.includes('’')) return false
    if (!/^[a-zàâçéèêëîïôùûüÿœ\-]+$/i.test(s)) return false
    return true
}
const VERBISH_ENDINGS = [
    'ent', 'ons', 'ez', 'ais', 'ait', 'ions', 'iez', 'aient',
    'erai', 'eras', 'era', 'eront', 'erez', 'erais', 'erait', 'erions', 'eriez', 'eraient',
    'irai', 'iras', 'ira', 'irons', 'irez', 'irais', 'irait', 'irions', 'iriez', 'iraient',
    'ai', 'as', 'a', 'âmes', 'âtes', 'èrent', 'is', 'it', 'îmes', 'îtes', 'irent',
]
function looksConjugatedVerb(s) {
    if (!s || s.length < 6) return false
    const w = String(s).toLowerCase()
    return VERBISH_ENDINGS.some(e => w.endsWith(e))
}
function isInfinitive(s) {
    const w = String(s).toLowerCase()
    return w.endsWith('er') || w.endsWith('ir') || w.endsWith('re')
}

// --- Wordset "core" embarqué (extensible via server/data/core_fr.json) ---
let CORE_WORDS = []
try {
    CORE_WORDS = require2('./data/core_fr.json')
} catch (_) {
    CORE_WORDS = [
        'maison', 'appartement', 'porte', 'fenetre', 'cle', 'chaise', 'table', 'lit', 'cuisine', 'salon', 'jardin',
        'ecole', 'bureau', 'travail', 'magasin', 'marche', 'banque', 'hopital', 'police', 'juge', 'avocat',
        'famille', 'ami', 'enfant', 'mere', 'pere', 'frere', 'soeur', 'voisin',
        'voiture', 'moteur', 'roue', 'velo', 'train', 'avion', 'bateau', 'ordinateur', 'telephone', 'internet',
        'photo', 'musique', 'film', 'jeu', 'radio', 'television', 'lampe', 'papier', 'stylo', 'livre', 'cahier',
        'pain', 'fromage', 'beurre', 'lait', 'sucre', 'sel', 'poivre', 'eau', 'cafe', 'the', 'chocolat', 'gateau',
        'pomme', 'poire', 'banane', 'orange', 'citron', 'tomate', 'carotte', 'oignon', 'poisson', 'poulet', 'viande', 'riz', 'pates',
        'soleil', 'lune', 'etoile', 'ciel', 'nuage', 'pluie', 'neige', 'vent', 'orage', 'mer', 'plage', 'montagne', 'foret', 'arbre', 'fleur', 'terre', 'feu', 'air',
        'rue', 'route', 'pont', 'parc', 'place', 'eglise', 'gare', 'hotel', 'restaurant', 'cafe', 'ecole', 'bibliotheque',
        'matin', 'midi', 'soir', 'nuit', 'jour', 'semaine', 'mois', 'annee', 'heure', 'minute',
        'manger', 'boire', 'aller', 'venir', 'faire', 'dire', 'voir', 'prendre', 'mettre', 'donner', 'parler', 'ecouter', 'lire', 'ecrire', 'jouer', 'marcher', 'courir', 'ouvrir', 'fermer',
        'acheter', 'vendre', 'payer', 'aider', 'chercher', 'trouver', 'regarder', 'voyager', 'dormir', 'rire', 'sourire', 'apprendre', 'comprendre',
        'argent', 'prix', 'cadeau', 'fete', 'idee', 'projet', 'groupe', 'equipe', 'histoire', 'image', 'couleur',
        'electricite', 'energie', 'batterie', 'lampe', 'lumiere'
    ]
}

function buildPool({ minLen = 6, maxLen = 12, allowHyphen = true, common = false, onlyInfinitive = false, exclude = new Set() }) {
    let pool = wordsAll.filter(w =>
        isCleanWord(w, { allowHyphen, minLen, maxLen }) &&
        !exclude.has(String(w).toLowerCase())
    )
    if (common) pool = pool.filter(w => !looksConjugatedVerb(String(w)))
    if (onlyInfinitive) pool = pool.filter(isInfinitive)
    shuffle(pool)
    if (common) pool.sort((a, b) => a.length - b.length)
    return pool
}
function pickWord(minLen = 6, maxLen = 10, allowHyphen = false, common = true) {
    const pool = buildPool({ minLen, maxLen, allowHyphen, common })
    if (!pool.length) return 'MYSTERE'
    return pool[Math.floor(Math.random() * pool.length)].toUpperCase()
}

// ---------- Rooms / mémoire ----------
/** roomId -> { word, status, giverId, guesserId, attempts, maxAttempts } */
const rooms = new Map()
function roomMembersOf(roomId) { return io.sockets.adapter.rooms.get(roomId) || new Set() }
function pruneGhosts(roomId) {
    const r = rooms.get(roomId); if (!r) return
    const members = roomMembersOf(roomId)
    if (r.giverId && !members.has(r.giverId)) r.giverId = null
    if (r.guesserId && !members.has(r.guesserId)) r.guesserId = null
}
const SALONS = [
    'Salon Écarlate', 'Salon Indigo', 'Salon Turquoise', 'Salon Citron Vert',
    'Salon Émeraude', 'Salon Lavande', 'Salon Safran', 'Salon Cramoisi',
    'Salon Corail', 'Salon Argent', 'Salon Fraise', 'Salon Mangue', 'Salon Myrtille',
    'Salon Kiwi', 'Salon Ananas', 'Salon Cerise', 'Salon Grenade', 'Salon Pêche',
    'Salon Abricot', 'Salon Banane', 'Salon Galaxie', 'Salon Crépuscule',
    'Salon Feu de Camp', 'Salon Cascade', 'Salon Neige Éternelle', 'Salon Océan Pacifique',
    'Salon Forêt Tropicale', 'Salon Aurore Boréale'
]
function findFreeRoomForRole(role) {
    for (const [name, r] of rooms.entries()) {
        pruneGhosts(name)
        if (role === 'giver' && !r.giverId && r.guesserId && r.status !== 'ended') return name
        if (role === 'guesser' && !r.guesserId && r.giverId && r.status !== 'ended') return name
    }
    for (const name of SALONS) {
        const r = rooms.get(name)
        if (!r || (!r.giverId && !r.guesserId)) return name
    }
    return `Salon ${Math.floor(1000 + Math.random() * 9000)}`
}

// ==================== API HTTP ====================

// Liste de mots
app.get('/api/words', (req, res) => {
    const count = Math.min(parseInt(String(req.query.count ?? '5000'), 10) || 5000, 20000)
    const minLen = parseInt(String(req.query.minLen ?? '6'), 10) || 6
    const maxLen = parseInt(String(req.query.maxLen ?? '10'), 10) || 10
    const allowHyphen = req.query.allowHyphen !== 'false'
    const common = String(req.query.common || 'true') === 'true'
    const onlyInfinitive = String(req.query.onlyInfinitive || 'false') === 'true'
    const mode = String(req.query.mode || 'core') // 'core' | 'all'
    const excludeRaw = String(req.query.exclude || '')
    const exclude = new Set(excludeRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))

    let core = CORE_WORDS.filter(w =>
        isCleanWord(w, { allowHyphen, minLen, maxLen }) &&
        !exclude.has(String(w).toLowerCase()) &&
        (!onlyInfinitive || isInfinitive(w))
    )

    let fallback = buildPool({ minLen, maxLen, allowHyphen, common, onlyInfinitive, exclude })
    let pool = (mode === 'core') ? unique([...core, ...fallback]) : fallback
    // si pas de build:
    res.status(503).type('text/plain').send(`Frontend not built yet. ${BUILD_TAG}`);


    shuffle(pool)
    const out = pool.slice(0, count)

    res.setHeader('Cache-Control', 'no-store')
    res.json({ count: out.length, words: out })
})

// Rooms disponibles (pour l’accueil)
app.get('/api/rooms', (_req, res) => {
    const out = []
    for (const [id, r] of rooms.entries()) {
        if (!r || r.status === 'ended') continue
        const giver = r.giverId ? io.sockets.sockets.get(r.giverId) : null
        const guesser = r.guesserId ? io.sockets.sockets.get(r.guesserId) : null
        const host = (giver?.data?.pseudo) || (guesser?.data?.pseudo) || 'Quelqu’un'
        let waitingFor = null
        if (!r.giverId) waitingFor = 'meneur'
        else if (!r.guesserId) waitingFor = 'devineur'
        else waitingFor = 'personne'
        if (waitingFor !== 'personne') {
            const m = /^Salon\s+(.+)$/i.exec(id)
            const color = m ? m[1].toLowerCase() : String(id).toLowerCase()
            out.push({ id, color, host, waitingFor })
        }
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json({ rooms: out })
})

// ==================== Socket.IO ====================
io.on('connection', (socket) => {
    socket.on('game:join', ({ roomId, role, pseudo }, ack) => {
        if (!roomId || !role) return ack?.({ ok: false, code: 'BAD_INPUT', message: 'Room/role invalides.' })
        if (!rooms.has(roomId)) {
            rooms.set(roomId, { word: pickWord(), status: 'idle', giverId: null, guesserId: null, attempts: 0, maxAttempts: 3 })
        }
        let r = rooms.get(roomId)
        pruneGhosts(roomId)

        const roomFull = r.giverId && r.guesserId
        const roleTaken = (role === 'giver' && r.giverId) || (role === 'guesser' && r.guesserId)
        let redirectedFrom = null
        if (roomFull || roleTaken) {
            redirectedFrom = roomId
            roomId = findFreeRoomForRole(role)
            if (!rooms.has(roomId)) {
                rooms.set(roomId, { word: pickWord(), status: 'idle', giverId: null, guesserId: null, attempts: 0, maxAttempts: 3 })
            }
            r = rooms.get(roomId)
            pruneGhosts(roomId)
        }

        socket.join(roomId)
        socket.data = { roomId, role, pseudo }
        if (role === 'giver') r.giverId = socket.id
        if (role === 'guesser') r.guesserId = socket.id

        console.log('[JOIN]', { socket: socket.id, roomId, role, redirectedFrom })

        const state = {
            roomId,
            role,
            word: role === 'giver' ? r.word : null,
            hint: null,
            status: r.status,
            lastGuess: null,
            guesses: [],
            error: null,
            attempts: r.attempts,
            maxAttempts: r.maxAttempts,
        }
        return ack?.({ ok: true, state, redirectedFrom })
    })

    socket.on('game:start', ({ roomId, word } = {}) => {
        if (!roomId) return
        const prev = rooms.get(roomId) || {}
        const chosen =
            (typeof word === 'string' && word.trim().length >= 1 ? String(word).toUpperCase() : null)
            || pickWord()

        const next = {
            word: chosen,
            status: 'running',
            giverId: prev.giverId ?? null,
            guesserId: prev.guesserId ?? null,
            attempts: 0,
            maxAttempts: 3,
        }
        rooms.set(roomId, next)

        const members = io.sockets.adapter.rooms.get(roomId) || new Set()
        for (const id of members) {
            const s = io.sockets.sockets.get(id)
            const isGiver = s?.data?.role === 'giver'
            s?.emit('game:state', {
                roomId,
                role: s?.data?.role ?? null,
                word: isGiver ? next.word : null,
                hint: null,
                status: next.status,
                lastGuess: null,
                guesses: [],
                attempts: next.attempts,
                maxAttempts: next.maxAttempts,
            })
        }
    })

    socket.on('game:hint', ({ roomId, hint }, ack) => {
        if (!roomId || !hint) return ack?.({ ok: false, code: 'BAD_INPUT', message: 'Indice vide.' })
        const data = rooms.get(roomId)
        if (!data) return ack?.({ ok: false, code: 'NO_ROOM', message: 'Salle introuvable.' })

        if (data.status === 'idle') rooms.set(roomId, { ...data, status: 'running', attempts: 0 })

        const fullReveal = normalize(hint).includes(normalize(data.word))
        const threeSeq = hasThreeConsecutive(hint, data.word)
        if (fullReveal || threeSeq) {
            const message = fullReveal
                ? 'Indice trop révélateur : contient le mot.'
                : 'Indice trop révélateur : ≥ 3 lettres consécutives du mot.'
            return ack?.({ ok: false, code: fullReveal ? 'HINT_WORD_INCLUDED' : 'HINT_3SEQ_INCLUDED', message })
        }

        socket.to(roomId).emit('game:hint', hint)
        return ack?.({ ok: true })
    })

    socket.on('game:guess', ({ roomId, guess }) => {
        if (!roomId || !guess) return
        const cur = rooms.get(roomId); if (!cur) return

        if (cur.status === 'idle') rooms.set(roomId, { ...cur, status: 'running', attempts: 0 })
        const now = rooms.get(roomId); if (!now || now.status !== 'running') return

        const isCorrect = normalize(guess) === normalize(now.word)
        io.to(roomId).emit('game:guess', { guess, correct: isCorrect })

        if (isCorrect) {
            rooms.set(roomId, { ...now, status: 'ended' })
            io.to(roomId).emit('game:state', {
                status: 'ended', reason: 'win', word: now.word,
                attempts: now.attempts, maxAttempts: now.maxAttempts
            })
            return
        }

        const attempts = (now.attempts ?? 0) + 1
        const maxAttempts = now.maxAttempts ?? 3
        const next = { ...now, attempts }
        if (attempts >= maxAttempts) {
            rooms.set(roomId, { ...next, status: 'ended' })
            io.to(roomId).emit('game:state', {
                status: 'ended', reason: 'lose', word: now.word,
                attempts, maxAttempts
            })
        } else {
            rooms.set(roomId, next)
        }
    })

    socket.on('game:giveup', ({ roomId }) => {
        if (!roomId) return
        const data = rooms.get(roomId); if (!data) return
        rooms.set(roomId, { ...data, status: 'ended' })
        io.to(roomId).emit('game:state', {
            status: 'ended', reason: 'lose', word: data.word,
            attempts: data.attempts, maxAttempts: data.maxAttempts
        })
    })

    socket.on('disconnect', () => {
        const { roomId, role } = socket.data || {}
        if (!roomId) return
        const r = rooms.get(roomId); if (!r) return
        if (role === 'giver' && r.giverId === socket.id) r.giverId = null
        if (role === 'guesser' && r.guesserId === socket.id) r.guesserId = null
    })
})

// ---------- SPA fallback ----------
// Toute route qui n’est pas /api, /socket.io, /health, /__debug => index.html
app.get(/^\/(?!api|socket\.io|health|__debug).*/, (_req, res) => {
    if (fs.existsSync(distDir)) {
        res.sendFile(path.join(distDir, 'index.html'))
    } else {
        res.status(503).type('text/plain').send('Frontend not built yet.')
    }
})
app.get('/healthz', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }))
// ---------- Lancement ----------
const PORT = process.env.PORT || 3000
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`)
})
