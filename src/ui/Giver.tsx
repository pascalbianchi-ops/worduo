import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useGame } from '../state/GameContext'

// ===== Helpers HTTP (même base que le socket) =====
function normalizeBase(u: string) {
    return (u || '').trim().replace(/\/+$/, '')
}
function join(base: string, path: string) {
    return `${normalizeBase(base)}/${String(path).replace(/^\/+/, '')}`
}
function getApiBase(): string {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('serverUrl')) || ''
    return stored ? normalizeBase(stored) : (typeof window !== 'undefined' ? window.location.origin : '')
}
async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const url = join(getApiBase(), path)
    const res = await fetch(url, { cache: 'no-store', ...init })
    if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} on ${url} – ${txt.slice(0, 120)}`)
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Expected JSON from ${url}, got "${ct}". Body: ${txt.slice(0, 120)}`)
    }
    return res.json() as Promise<T>
}
// ===== fin helpers =====

function Confetti() {
    const pieces = useMemo(() => {
        const icons = ['🎉', '✨', '🎊', '💥', '🟣', '🔺', '🔵', '⭐️', '🟡', '🟢', '💫']
        return Array.from({ length: 36 }, () => ({
            icon: icons[Math.floor(Math.random() * icons.length)],
            left: Math.floor(Math.random() * 100),
        }))
    }, [])
    return (
        <div className="confetti" aria-hidden>
            {pieces.map((p, i) => (
                <span key={i} style={{ left: `${p.left}%`, animationDelay: `${(i % 12) * 0.08}s` }}>
                    {p.icon}
                </span>
            ))}
        </div>
    )
}

export function Giver() {
    const { state, socket, setState, ensureConnected, isConnected } = useGame()

    // --- Banque de mots ---
    const [bank, setBank] = useState<string[]>([])
    const [loadingWords, setLoadingWords] = useState(true)
    const [loadErr, setLoadErr] = useState<string | null>(null)

    // --- Saisie de l’indice ---
    const [hint, setHint] = useState('')
    const [sendingHint, setSendingHint] = useState(false)
    const [hintSentOk, setHintSentOk] = useState(false)

    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setLoadingWords(true)
                try {
                    // 1) core (mots “simples” d’abord)
                    const core = await api<{ count: number; words: string[] }>(
                        '/api/words?count=5000&minLen=4&maxLen=10&allowHyphen=false&common=true&mode=core&onlyInfinitive=false'
                    )
                    if (!cancelled) { setBank(core.words); setLoadErr(null) }
                } catch (e1: any) {
                    try {
                        // 2) fallback: corpus complet
                        const all = await api<{ count: number; words: string[] }>(
                            '/api/words?count=5000&minLen=4&maxLen=10&allowHyphen=false&common=true&mode=all&onlyInfinitive=false'
                        )
                        if (!cancelled) { setBank(all.words); setLoadErr(null) }
                    } catch (e2: any) {
                        // 3) secours local minimal (pour ne pas bloquer l'UI)
                        const fallback = ['maison', 'voiture', 'fromage', 'banane', 'internet', 'lampe', 'montagne', 'océan', 'ordinateur', 'musique']
                        if (!cancelled) {
                            setBank(fallback)
                            setLoadErr(e2?.message || e1?.message || 'Erreur de chargement des mots')
                        }
                    }
                } finally {
                    if (!cancelled) setLoadingWords(false)
                }
            })()
        return () => { cancelled = true }
    }, [])

    const pickWord = useCallback(() => {
        if (!bank.length) return null
        const w = bank[Math.floor(Math.random() * bank.length)]
        return (w || '').toUpperCase()
    }, [bank])

    const start = async () => {
        const chosen = pickWord()
        if (!chosen) return
        try {
            await ensureConnected()
        } catch {
            setState(prev => ({ ...prev, error: 'Connexion au serveur perdue, réessaie.' }))
            return
        }
        socket.emit('game:start', { roomId: state.roomId, word: chosen }, () => { })
        setState(prev => ({
            ...prev,
            word: chosen,
            hint: null,
            lastGuess: null,
            guesses: [],
            error: null,
            outcome: null,
            revealWord: null,
            status: 'running',
            attempts: 0,
        }))
    }

    // Dès que la banque de mots est chargée, si aucun mot n'est encore choisi
    // pour cette manche (arrivée du meneur, ou reconnexion), on en tire un
    // automatiquement — sans attendre un clic sur "Changer de mot".
    useEffect(() => {
        if (loadingWords) return
        if (!bank.length) return
        if (state.word) return
        start()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingWords, bank, state.word])

    const send = async () => {
        if (!hint.trim() || sendingHint) return
        setSendingHint(true)
        setHintSentOk(false)

        try {
            await ensureConnected()
        } catch {
            setSendingHint(false)
            setState(prev => ({ ...prev, error: 'Connexion au serveur perdue, réessaie.' }))
            return
        }

        // Filet de sécurité : si le serveur ne répond jamais (coupure réseau…),
        // on débloque le bouton après 5s plutôt que de rester bloqué "en cours".
        const timeout = setTimeout(() => {
            setSendingHint(false)
            setState(prev => ({ ...prev, error: "Pas de réponse du serveur, réessaie." }))
        }, 5000)

        socket.emit('game:hint', { roomId: state.roomId, hint }, (res: any) => {
            clearTimeout(timeout)
            setSendingHint(false)
            if (res?.ok) {
                setHint('')
                setHintSentOk(true)
                setState(prev => ({ ...prev, error: null }))
                setTimeout(() => setHintSentOk(false), 1500)
            } else {
                setState(prev => ({ ...prev, error: res?.message || 'Indice refusé.' }))
            }
        })
    }

    const giveup = () => socket.emit('game:giveup', { roomId: state.roomId })

    useEffect(() => {
        if (!state.error) return
        const t = setTimeout(() => setState(prev => ({ ...prev, error: null })), 2500)
        return () => clearTimeout(t)
    }, [state.error, setState])

    const ended = state.status === 'ended' || state.outcome !== null
    const isWin = state.outcome === 'win'
    const isLose = state.outcome === 'lose'

    return (
        <>
            <div className="appbar">
                <div className="appbar-inner">
                    <div className="brand"><div className="logo" />WorDuo</div>
                    <div className="badge">Room: {state.roomId ?? '—'}</div>
                    <div className={`pill ${ended ? (isWin ? 'ok' : 'end') : state.status === 'running' ? 'run' : 'ok'}`}>
                        Statut : {state.status}
                    </div>
                    <div className={`pill ${isConnected ? 'ok' : 'end'}`}>
                        {isConnected ? '🟢 Connecté' : '🔴 Déconnecté'}
                    </div>
                </div>
            </div>

            <div className={`container ${isLose ? 'shake' : ''}`}>
                <div className="card pop">
                    <h2 className="card-title">
                        Meneur — mot : <span className="gradient-text">{state.word ?? '—'}</span>
                    </h2>

                    {loadingWords && <div style={{ marginBottom: 8, opacity: 0.8 }}>Chargement des mots…</div>}
                    {loadErr && <div style={{ marginBottom: 8, color: '#FCA5A5' }}>⚠️ {loadErr}</div>}

                    <div className="card-sub">
                        Dernière réponse du devineur : <b style={{ color: '#fff' }}>{state.lastGuess ?? '—'}</b>
                    </div>

                    {state.error && (
                        <div style={{ marginTop: 12, padding: 10, border: '1px solid rgba(239,68,68,.4)', background: '#2a0f14', borderRadius: 12, color: '#FCA5A5' }}>
                            ⚠️ {state.error}
                        </div>
                    )}

                    <div className="hr" />
                    <div className="row">
                        <input
                            className="input"
                            value={hint}
                            onChange={e => setHint(e.target.value)}
                            placeholder="Écrire un indice percutant..."
                            onKeyDown={e => e.key === 'Enter' && send()}
                            style={{ flex: 1, minWidth: 260 }}
                        />
                        <button className="btn btn-primary" onClick={send} disabled={sendingHint || !hint.trim()}>
                            {sendingHint ? 'Envoi…' : hintSentOk ? '✓ Envoyé' : 'Envoyer l’indice'}
                        </button>
                        <button className="btn btn-ghost" onClick={start} disabled={loadingWords || !bank.length}>
                            Changer de mot
                        </button>
                        <button className="btn btn-ghost" onClick={giveup}>Abandonner</button>
                    </div>
                </div>

                {state.guesses.length > 0 && (
                    <div className="card pop">
                        <div className="card-title">Historique des réponses</div>
                        <ul className="list">
                            {state.guesses.slice().reverse().map((g, i) => <li key={i}>{g}</li>)}
                        </ul>
                    </div>
                )}
            </div>

            {ended && (
                <div className="overlay">
                    {isWin && (
                        <div className="panel-win pop">
                            <Confetti />
                            <h3 className="boom">🎉 Bravo !</h3>
                            <div className="word">Le mot était <b>{state.revealWord ?? '—'}</b></div>
                            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                                <button className="btn btn-primary" onClick={start}>Nouvelle manche</button>
                            </div>
                        </div>
                    )}
                    {isLose && (
                        <div className="panel-lose pop">
                            <h3 className="boom">💥 C’est raté…</h3>
                            <div className="word">Le mot était <b>{state.revealWord ?? '—'}</b></div>
                            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                                <button className="btn btn-primary" onClick={start}>Rejouer</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
