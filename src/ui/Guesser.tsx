import { useMemo, useState } from 'react'
import { useGame } from '../state/GameContext'
import { EndActions } from './EndActions'
import { VersionBadge } from './VersionBadge'

function Confetti() {
    const pieces = useMemo(() => {
        const icons = ['🎉', '✨', '🎊', '💥', '🟣', '🔺', '🔵', '⭐️', '🟡', '🟢', '💫']
        return Array.from({ length: 36 }, () => ({
            icon: icons[Math.floor(Math.random() * icons.length)],
            left: Math.floor(Math.random() * 100)
        }))
    }, [])
    return (
        <div className="confetti" aria-hidden>
            {pieces.map((p, i) => (
                <span key={i} style={{ left: `${p.left}%`, animationDelay: `${(i % 12) * 0.08}s` }}>{p.icon}</span>
            ))}
        </div>
    )
}

export function Guesser() {
    const { state, socket, setState, ensureConnected, isConnected, leaveGame } = useGame()
    const [guess, setGuess] = useState('')
    const [sending, setSending] = useState(false)
    const [sentOk, setSentOk] = useState(false)

    const submit = async () => {
        if (!guess.trim() || sending) return
        setSending(true)
        setSentOk(false)

        try {
            await ensureConnected()
        } catch {
            setSending(false)
            setState(prev => ({ ...prev, error: 'Connexion au serveur perdue, réessaie.' }))
            return
        }

        // Filet de sécurité : débloque le bouton si le serveur ne répond pas.
        const timeout = setTimeout(() => {
            setSending(false)
            setState(prev => ({ ...prev, error: "Pas de réponse du serveur, réessaie." }))
        }, 5000)

        socket.emit('game:guess', { roomId: state.roomId, guess, round: state.round }, (res: any) => {
            clearTimeout(timeout)
            setSending(false)
            if (res?.ok) {
                setGuess(cur => (cur === guess ? '' : cur)) // ne pas effacer ce qui a été tapé entre-temps
                setSentOk(true)
                setState(prev => ({ ...prev, error: null }))
                setTimeout(() => setSentOk(false), 1500)
            } else {
                setState(prev => ({ ...prev, error: res?.message || 'Proposition refusée.' }))
            }
        })
    }

    const ended = state.status === 'ended' || state.outcome !== null
    const isWin = state.outcome === 'win'
    const isLose = state.outcome === 'lose'

    return (
        <>
            <div className="appbar">
                <div className="appbar-inner">
                    <div className="brand"><div className="logo" />WorDuo <VersionBadge /></div>
                    <div className="badge">Room: {state.roomId ?? '—'}</div>
                    <div className={`pill ${ended ? (isWin ? 'ok' : 'end') : state.status === 'running' ? 'run' : 'ok'}`}>
                        Statut : {state.status}
                    </div>
                    <div className={`pill ${isConnected ? 'ok' : 'end'}`}>
                        {isConnected ? '🟢 Connecté' : '🔴 Déconnecté'}
                    </div>
                    <button className="btn btn-ghost" onClick={leaveGame}>Quitter</button>
                </div>
            </div>

            <div className={`container ${isLose ? 'shake' : ''}`}>
                <div className="card pop">
                    <h2 className="card-title">Devineur</h2>
                    <div className="card-sub">Dernier indice : <b style={{ color: '#fff' }}>{state.hint ?? '—'}</b></div>
                    {state.error && (
                        <div style={{ marginTop: 12, padding: 10, border: '1px solid rgba(239,68,68,.4)', background: '#2a0f14', borderRadius: 12, color: '#FCA5A5' }}>
                            ⚠️ {state.error}
                        </div>
                    )}
                    <div className="hr" />
                    <div className="row">
                        <input
                            className="input"
                            value={guess}
                            onChange={e => setGuess(e.target.value)}
                            placeholder="Votre proposition..."
                            onKeyDown={e => e.key === 'Enter' && submit()}
                            style={{ flex: '1 1 200px', minWidth: 0 }}
                        />
                        <button className="btn btn-primary" onClick={submit} disabled={sending || !guess.trim()}>
                            {sending ? 'Envoi…' : sentOk ? '✓ Envoyé' : 'Proposer'}
                        </button>
                    </div>

                    {state.guesses.length > 0 && (
                        <>
                            <div className="hr" />
                            <div className="card-sub" style={{ marginBottom: 6 }}>Historique</div>
                            <ul className="list">
                                {state.guesses.slice().reverse().map((g, i) => <li key={i}>{g}</li>)}
                            </ul>
                        </>
                    )}
                </div>
            </div>

            {ended && (
                <div className="overlay">
                    {isWin && (
                        <div className="panel-win pop">
                            <Confetti />
                            <h3 className="boom">🎉 Gagné !</h3>
                            <div className="word">Le mot était <b>{state.revealWord ?? '—'}</b></div>
                            <EndActions />
                        </div>
                    )}
                    {isLose && (
                        <div className="panel-lose pop">
                            <h3 className="boom">💥 Perdu !</h3>
                            <div className="word">Le mot était <b>{state.revealWord ?? '—'}</b></div>
                            <EndActions />
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
