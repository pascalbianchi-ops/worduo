import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getSocket } from '../lib/socket'

type Role = 'giver' | 'guesser' | null
type Outcome = 'win' | 'lose' | null

type GameState = {
  roomId: string | null
  role: Role
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
}

const defaultState: GameState = {
  roomId: null,
  role: null,
  word: null,
  hint: null,
  status: 'idle',
  lastGuess: null,
  guesses: [],
  error: null,
  outcome: null,
  revealWord: null,
  attempts: 0,
  maxAttempts: 3,
}

type Ctx = {
  state: GameState
  setState: React.Dispatch<React.SetStateAction<GameState>>
  socket: ReturnType<typeof getSocket>
  isConnected: boolean
  /** Garantit la connexion avant d'émettre (utilise-la dans les handlers des boutons) */
  ensureConnected: () => Promise<void>
}

const GameCtx = createContext<Ctx | null>(null)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GameState>(defaultState)
  const [isConnected, setIsConnected] = useState(false)

  // Singleton socket (recréé si lib/socket change d’URL)
  const socket = useMemo(() => getSocket(), [])
  const mounted = useRef(true)

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

    return () => {
      mounted.current = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      // ne pas disconnect() ici : on veut garder la session si HMR
    }
  }, [socket])

  // ————————— Handlers “jeu” —————————
  useEffect(() => {
    const onState = (s: Partial<GameState> & { reason?: Outcome; word?: string }) =>
      setState(prev => {
        const next: GameState = { ...prev, ...s }

        if (typeof (s as any).attempts === 'number') next.attempts = (s as any).attempts as number
        if (typeof (s as any).maxAttempts === 'number') next.maxAttempts = (s as any).maxAttempts as number

        if (s.status === 'ended') {
          next.outcome = (s as any).reason ?? prev.outcome ?? null
          next.revealWord = (s as any).word ?? prev.revealWord ?? prev.word ?? null
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
    <GameCtx.Provider value={{ state, setState, socket, isConnected, ensureConnected }}>
      {children}
    </GameCtx.Provider>
  )
}

export function useGame() {
  const ctx = useContext(GameCtx)
  if (!ctx) throw new Error('useGame must be used within GameProvider')
  return ctx
}