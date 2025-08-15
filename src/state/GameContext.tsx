import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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

const GameCtx = createContext<{
    state: GameState
    setState: React.Dispatch<React.SetStateAction<GameState>>
    socket: ReturnType<typeof getSocket>
} | null>(null)

export function GameProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<GameState>(defaultState)
    const socket = useMemo(() => getSocket(), [])

    useEffect(() => {
        console.log('[GameContext] connecting socket…')
        socket.connect()

        // === Handlers ===
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
            setState(prev => {
                console.log('[CLIENT onHint]', hint)
                return { ...prev, hint }
            })

        const onGuess = ({ guess, correct }: { guess: string; correct: boolean }) =>
            setState(prev => {
                console.log('[CLIENT onGuess]', { guess, correct })
                const next = {
                    ...prev,
                    lastGuess: guess,
                    guesses: [...prev.guesses, guess],
                }
                if (correct) {
                    return {
                        ...next,
                        status: 'ended',
                        outcome: 'win',
                        revealWord: next.revealWord ?? next.word
                    }
                }
                return next
            })

        const onError = (err: { message?: string }) =>
            setState(prev => ({ ...prev, error: err?.message || 'Erreur.' }))

        const onDisconnect = () => {
            console.log('[GameContext] socket disconnected, reset state')
            setState(defaultState)
        }

        // Brancher
        socket.on('game:state', onState)
        socket.on('game:hint', onHint)
        socket.on('game:guess', onGuess)
        socket.on('game:error', onError)
        socket.on('disconnect', onDisconnect)

        // Cleanup (compatible Fast Refresh)
        return () => {
            socket.off('game:state', onState)
            socket.off('game:hint', onHint)
            socket.off('game:guess', onGuess)
            socket.off('game:error', onError)
            socket.off('disconnect', onDisconnect)
        }
    }, [socket])

    return <GameCtx.Provider value={{ state, setState, socket }}>{children}</GameCtx.Provider>
}

export function useGame() {
    const ctx = useContext(GameCtx)
    if (!ctx) throw new Error('useGame must be used within GameProvider')
    return ctx
}
