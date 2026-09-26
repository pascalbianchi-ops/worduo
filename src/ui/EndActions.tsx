import { useState } from 'react'
import { useGame } from '../state/GameContext'

// Boutons de fin de manche, communs au meneur et au devineur :
// "Rejouer" relance une manche dans le même salon, "Terminer" ramène au lobby.
export function EndActions() {
    const { state, socket, setState, ensureConnected, leaveGame } = useGame()
    const [busy, setBusy] = useState(false)

    const replay = async () => {
        if (busy) return
        setBusy(true)
        try {
            await ensureConnected()
        } catch {
            setBusy(false)
            setState(prev => ({ ...prev, error: 'Connexion au serveur perdue, réessaie.' }))
            return
        }
        socket.emit('game:restart', { roomId: state.roomId }, (res: any) => {
            setBusy(false)
            if (!res?.ok) setState(prev => ({ ...prev, error: res?.message || 'Impossible de relancer la manche.' }))
        })
    }

    const partnerLeft = typeof state.players === 'number' && state.players < 2

    return (
        <>
            {partnerLeft && (
                <div style={{ opacity: .85, marginTop: 10, textAlign: 'center' }}>Ton partenaire a quitté le salon.</div>
            )}
            <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                <button className="btn btn-primary" onClick={replay} disabled={busy}>
                    {busy ? 'Relance…' : 'Rejouer'}
                </button>
                <button className="btn btn-ghost" onClick={leaveGame}>Terminer</button>
            </div>
        </>
    )
}
