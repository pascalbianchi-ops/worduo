import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSocket } from '../lib/socket'

type Role = 'giver' | 'guesser' | null
type Outcome = 'win' | 'lose' | null

type GameState = {
  roomId: string | null
  role: Role
  pseudo: string | null
  word: string | null
  hint: string | null
  status: 'idle' | 'running' | 'ended'
  lastGuess: string | null
  guesses: string[]
  error: string | null
  outcome: Outcome
  revealWord: string | null
  attempts: number
  maxAttempts: number
  /** Numéro de manche côté serveur (renvoyé avec chaque proposition) */
  round: number | null
  /** Nombre de joueurs présents dans le salon (fourni par le serveur) */
  players?: number
}

export const defaultState: GameState = {
  roomId: null,
  role: null,
  pseudo: null,
  word: null,
  hint: null,
  status: 'idle',
  lastGuess: null,
  guesses: [],
  error: null,
  outcome: null,
  revealWord: null,
  attempts: 0,
  maxAttempts: 5,
  round: null,
}

// Clé localStorage pour retenter automatiquement de rejoindre la même
// partie si la page est rechargée par accident (pull-to-refresh, fermeture
// d'onglet...). On ne garde que le strict nécessaire pour un game:join.
const SESSION_KEY = 'worduo:session'

type SavedSession = { roomId: string; role: 'giver' | 'guesser'; pseudo: string }

function saveSession(s: SavedSession) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { }
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.roomId && parsed?.role && parsed?.pseudo) return parsed
    return null
  } catch { return null }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch { }
}

// Chaque nouvelle version déployée repart de zéro : une session sauvegardée
// par une version précédente est oubliée dès le chargement de la page.
const VERSION_KEY = 'worduo:version'
try {
  if (localStorage.getItem(VERSION_KEY) !== __APP_VERSION__) {
    localStorage.removeItem(SESSION_KEY)
    localStorage.setItem(VERSION_KEY, __APP_VERSION__)
  }
} catch { }

// Identifiant stable du joueur (survit aux reconnexions et rechargements) :
// permet au serveur de reconnaître qu'un nouveau socket appartient au même
// joueur et de lui rendre son rôle, même si l'ancien socket n'est pas encore
// détecté comme mort (changement de réseau sur mobile, par exemple).
const PLAYER_ID_KEY = 'worduo:playerId'
let memoryPlayerId: string | null = null

export function getPlayerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem(PLAYER_ID_KEY, id)
    }
    return id
  } catch {
    if (!memoryPlayerId) memoryPlayerId = Math.random().toString(36).slice(2) + Date.now().toString(36)
    return memoryPlayerId
  }
}

type Ctx = {
  state: GameState
  setState: React.Dispatch<React.SetStateAction<GameState>>
  socket: ReturnType<typeof getSocket>
  isConnected: boolean
  /** Garantit la connexion avant d'émettre (utilise-la dans les handlers des boutons) */
  ensureConnected: () => Promise<void>
  /** À appeler juste après un game:join réussi, pour permettre la reconnexion auto */
  rememberSession: (s: SavedSession) => void
  /** Quitte le salon et revient au lobby (boutons "Quitter" / "Terminer") */
  leaveGame: () => void
}

const GameCtx = createContext<Ctx | null>(null)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(defaultState)
  const [isConnected, setIsConnected] = useState(false)

  // Singleton socket (recréé si lib/socket change d’URL)
  const socket = useMemo(() => getSocket(), [])
  const mounted = useRef(true)
  // Vrai tant que le socket ne s'est jamais connecté depuis le chargement de
  // la page : distingue un rechargement d'une simple reconnexion réseau.
  const firstConnect = useRef(true)

  const leaveGame = useMemo(() => () => {
    socket.emit('game:leave')
    clearSession()
    setState(prev => ({ ...defaultState, pseudo: prev.pseudo }))
  }, [socket])

  // ————————— Connexion / Reconnexion —————————
  useEffect(() => {
    mounted.current = true

    const connectIfNeeded = () => {
      if (!socket.connected) {
        console.log('[GameContext] socket.connect() → target same-origin')
        socket.connect()
      }
    }

    const onConnect = () => {
      console.log('[GameContext] ✅ connected, id=', socket.id)
      if (mounted.current) setIsConnected(true)

      // Reconnexion auto : si une session a été sauvegardée (page rechargée
      // par accident pendant une partie), on retente de rejoindre la même
      // room/rôle automatiquement plutôt que de laisser l'utilisateur au
      // lobby vide.
      const saved = loadSession()
      const isReload = firstConnect.current
      firstConnect.current = false
      if (saved && mounted.current) {
        socket.emit('game:join', { ...saved, playerId: getPlayerId() }, (res: any) => {
          if (!mounted.current) return
          if (res?.ok && isReload && res.state?.status !== 'running') {
            // Page rechargée sans manche en cours (partie finie, ou salon
            // recréé vide après un redémarrage du serveur) : rien à
            // reprendre, on quitte le salon et on repart du lobby.
            leaveGame()
          } else if (res?.ok) {
            setState(prev => ({ ...prev, ...res.state, roomId: saved.roomId, role: saved.role, pseudo: saved.pseudo }))
          } else {
            // Le rôle est pris par un autre joueur : on abandonne la session
            // sauvegardée et on retombe sur le lobby, plutôt que de laisser
            // un écran de jeu dont le serveur ignore tout (actions rejetées).
            clearSession()
            setState(prev => ({ ...defaultState, pseudo: prev.pseudo, error: res?.message || 'Impossible de rejoindre la partie.' }))
          }
        })
      }
    }

    const onDisconnect = (reason: string) => {
      console.log('[GameContext] ⚠️ disconnected:', reason)
      if (mounted.current) setIsConnected(false)
      // On NE reset PAS tout l’état ici pour éviter de “perdre” l’UI sur un micro drop.
      // Si tu veux un reset dur côté UX, dé-commente la ligne suivante.
      // if (mounted.current) setState(defaultState)
    }

    const onConnectError = (err: unknown) => {
      console.warn('[GameContext] connect_error:', err)
    }

    connectIfNeeded()

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)

    // Sur Safari iOS, revenir au premier plan (changement d'onglet, verrouillage
    // d'écran) peut laisser le WebSocket "gelé" sans déclencher immédiatement
    // un event 'disconnect'. On force une vérification/reconnexion à chaque
    // retour de visibilité pour éviter les emit silencieusement perdus.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[GameContext] page visible again, checking socket…')
        connectIfNeeded()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      mounted.current = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // ne pas disconnect() ici : on veut garder la session si HMR
    }
  }, [socket])

  // ————————— Handlers “jeu” —————————
  useEffect(() => {
    const onState = (s: Partial<GameState>) =>
      setState(prev => {
        // Hors salon (retour au lobby), un état encore en vol ne doit pas
        // ramener le joueur dans la partie qu'il vient de quitter.
        if (!prev.roomId) return prev
        const next: GameState = { ...prev, ...s }

        if (typeof (s as any).attempts === 'number') next.attempts = (s as any).attempts as number
        if (typeof (s as any).maxAttempts === 'number') next.maxAttempts = (s as any).maxAttempts as number
        // Le serveur n'émet pas d'événement 'game:guess' : la dernière
        // proposition se déduit de la liste complète envoyée dans l'état.
        if (Array.isArray(s.guesses)) next.lastGuess = s.guesses.length ? s.guesses[s.guesses.length - 1] : null

        if (s.status === 'ended') {
          // Le serveur envoie directement outcome et revealWord (voir
          // server/index.js, publicState()) — la copie { ...prev, ...s }
          // plus haut les a déjà appliqués correctement. On ne fait que
          // sécuriser un repli sur l'ancienne valeur si jamais l'un des
          // deux champs manquait dans ce payload précis.
          next.outcome = s.outcome ?? prev.outcome ?? null
          next.revealWord = s.revealWord ?? prev.revealWord ?? prev.word ?? null
          console.log('[CLIENT onState] ended ->', { outcome: next.outcome, revealWord: next.revealWord })
          return next
        }

        // reset SEULEMENT quand on sort d'un 'ended'
        if (s.status && prev.status === 'ended' && s.status !== 'ended') {
          console.log('[CLIENT onState] reset for new round')
          next.outcome = null
          next.revealWord = null
          next.error = null
          next.lastGuess = null
          next.guesses = []
          next.hint = null
          next.attempts = 0
        }

        return next
      })

    const onHint = (hint: string) =>
      setState(prev => ({ ...prev, hint }))

    const onGuess = ({ guess, correct }: { guess: string; correct: boolean }) =>
      setState(prev => {
        const next = { ...prev, lastGuess: guess, guesses: [...prev.guesses, guess] }
        if (correct) {
          return { ...next, status: 'ended', outcome: 'win', revealWord: next.revealWord ?? next.word }
        }
        return next
      })

    const onError = (err: { message?: string }) =>
      setState(prev => ({ ...prev, error: err?.message || 'Erreur.' }))

    socket.on('game:state', onState)
    socket.on('game:hint', onHint)
    socket.on('game:guess', onGuess)
    socket.on('game:error', onError)

    return () => {
      socket.off('game:state', onState)
      socket.off('game:hint', onHint)
      socket.off('game:guess', onGuess)
      socket.off('game:error', onError)
    }
  }, [socket])

  // ————————— Helper: s’assurer d’être connecté avant d’émettre —————————
  const ensureConnected = useMemo(
    () => () =>
      new Promise<void>((resolve, reject) => {
        if (socket.connected) return resolve()
        console.log('[GameContext] ensureConnected(): connecting…')
        const onOk = () => {
          socket.off('connect_error', onKo)
          resolve()
        }
        const onKo = (err: unknown) => {
          socket.off('connect', onOk)
          reject(err instanceof Error ? err : new Error(String(err)))
        }
        socket.once('connect', onOk)
        socket.once('connect_error', onKo)
        socket.connect()
        // garde-fou: timeout
        setTimeout(() => {
          if (!socket.connected) {
            socket.off('connect', onOk)
            socket.off('connect_error', onKo)
            reject(new Error('Timeout de connexion socket'))
          }
        }, 6000)
      }),
    [socket]
  )

  return (
    <GameCtx.Provider value={{
      state, setState, socket, isConnected, ensureConnected,
      rememberSession: saveSession,
      leaveGame,
    }}>
      {children}
    </GameCtx.Provider>
  )
}

export function useGame() {
  const ctx = useContext(GameCtx)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}