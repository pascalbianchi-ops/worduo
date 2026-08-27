import { useMemo, useState } from 'react'
import { useGame } from '../state/GameContext'

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
    const { state, socket, setState } = useGame()
    const [guess, setGuess] = useState('')

    const submit = () => {
        if (!guess.trim()) return
        console.log('[Guesser] emit game:guess', { roomId: state.roomId, guess })
        socket.emit('game:guess', { roomId: state.roomId, guess })
        setGuess('')
    }

    const ended = state.status === 'ended' || state.outcome !== null
    const isWin = state.outcome === 'win'
    const isLose = state.outcome === 'lose'

    // Le devineur ne peut pas démarrer une nouvelle manche : seul le meneur
    // choisit le mot suivant. On se contente d'informer qu'on attend le meneur.
    const requestReplay = () => {
        setState(prev => ({ ...prev, lastGuess: null }))
    }

    return (
        <>
            <div className="appbar">
                <div className="appbar-inner">
                    <div className="brand"><div className="logo" />WorDuo</div>
                    <div className="badge">Room: {state.roomId ?? '—'}</div>
                    <div className={`pill ${ended ? (isWin ? 'ok' : 'end') : state.status === 'running' ? 'run' : 'ok'}`}>
                        Statut : {state.status}
                    </div>
                </div>
            </div>

            <div className={`container ${isLose ? 'shake' : ''}`}>
                <div className="card pop">
                    <h2 className="card-title">Devineur</h2>
                    <div className="card-sub">Dernier indice : <b style={{ color: '#fff' }}>{state.hint ?? '—'}</b></div>
                    <div className="hr" />
                    <div className="row">
                        <input
                            className="input"
                            value={guess}
                            onChange={e => setGuess(e.target.value)}
                            placeholder="Votre proposition..."
                            onKeyDown={e => e.key === 'Enter' && submit()}
                            style={{ flex: 1, minWidth: 260 }}
                        />
                        <button className="btn btn-primary" onClick={submit}>Proposer</button>
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
                            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                                <div style={{ opacity: .85 }}>En attente d'une nouvelle manche du meneur…</div>
                            </div>
                        </div>
                    )}
                    {isLose && (
                        <div className="panel-lose pop">
                            <h3 className="boom">💥 Perdu !</h3>
                            <div className="word">Le mot était <b>{state.revealWord ?? '—'}</b></div>
                            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                                <div style={{ opacity: .85 }}>En attente d'une nouvelle manche du meneur…</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
