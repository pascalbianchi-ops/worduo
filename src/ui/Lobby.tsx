import { useEffect, useMemo, useState } from 'react'
import { useGame } from '../state/GameContext'
import { setServerUrl, getCurrentServerUrl } from '../lib/socket'

// Presets serveur pour le menu déroulant
const SERVER_PRESETS = [
    { label: 'Local (localhost:3000)', value: 'http://localhost:3000' },
    { label: 'Production (api.mondomaine.com)', value: 'https://api.mondomaine.com' },
    { label: 'Staging (staging-api.mondomaine.com)', value: 'https://staging-api.mondomaine.com' },
    { label: 'Personnalisé…', value: 'custom' }
]

// Liste de salons fun
const SALONS = [
    "Salon Écarlate", "Salon Indigo", "Salon Turquoise", "Salon Citron Vert",
    "Salon Émeraude", "Salon Lavande", "Salon Safran", "Salon Cramoisi",
    "Salon Corail", "Salon Argent", "Salon Fraise", "Salon Mangue", "Salon Myrtille",
    "Salon Kiwi", "Salon Ananas", "Salon Cerise", "Salon Grenade", "Salon Pêche",
    "Salon Abricot", "Salon Banane", "Salon Galaxie", "Salon Crépuscule",
    "Salon Feu de Camp", "Salon Cascade", "Salon Neige Éternelle", "Salon Océan Pacifique",
    "Salon Forêt Tropicale", "Salon Aurore Boréale"
]

function randomSalon() {
    return SALONS[Math.floor(Math.random() * SALONS.length)]
}

type RoomInfo = {
    id: string
    color: string
    host: string
    waitingFor: 'meneur' | 'devineur'
}

function Fireworks() {
    const pieces = useMemo(() => {
        const icons = ['🎆', '🎇', '✨', '💥', '🌟', '⭐️', '🎊', '🎉']
        return Array.from({ length: 40 }, () => ({
            icon: icons[Math.floor(Math.random() * icons.length)],
            left: Math.floor(Math.random() * 100),
            delay: Math.random() * 1.2,
        }))
    }, [])
    return (
        <div className="confetti" aria-hidden style={{ pointerEvents: 'none' }}>
            {pieces.map((p, i) => (
                <span key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s` }}>
                    {p.icon}
                </span>
            ))}
        </div>
    )
}

export function Lobby() {
    const { setState, socket } = useGame()

    // --- Sélection serveur ---
    const initialUrl = getCurrentServerUrl()
    const initialServerPreset = SERVER_PRESETS.find(p => p.value === initialUrl)?.value ?? 'custom'
    const [serverPreset, setServerPreset] = useState<string>(initialServerPreset)
    const [customServerUrl, setCustomServerUrl] = useState<string>(initialServerPreset === 'custom' ? initialUrl : '')
    const effectiveServerUrl = serverPreset === 'custom' ? customServerUrl : serverPreset

    const applyServer = () => {
        if (!effectiveServerUrl) return alert('URL serveur vide.')
        setServerUrl(effectiveServerUrl)
        window.location.reload() // recrée le socket sur la bonne URL
    }

    // --- Sélection room (menu déroulant + personnalisé) ---
    const savedRoomPreset = (localStorage.getItem('roomPreset') as string) || 'preset'
    const savedCustomRoom = localStorage.getItem('customRoom') || ''
    const [roomMode, setRoomMode] = useState<'preset' | 'custom'>(savedRoomPreset === 'custom' ? 'custom' : 'preset')
    const [roomPreset, setRoomPreset] = useState<string>(SALONS.includes(savedCustomRoom) ? savedCustomRoom : randomSalon())
    const [roomCustom, setRoomCustom] = useState<string>(roomMode === 'custom' ? (savedCustomRoom || '') : '')

    // valeur finale de la room à envoyer
    const room = roomMode === 'custom' ? (roomCustom || '') : roomPreset

    // persistance locale des choix de room
    useEffect(() => {
        localStorage.setItem('roomPreset', roomMode)
        localStorage.setItem('customRoom', roomMode === 'custom' ? roomCustom : roomPreset)
    }, [roomMode, roomPreset, roomCustom])

    const diceRoom = () => {
        setRoomMode('preset')
        setRoomPreset(randomSalon())
    }

    // --- Pseudo + "Jouer" (déverrouille les actions) ---
    const [pseudo, setPseudo] = useState<string>('')
    const [ready, setReady] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [info, setInfo] = useState<string | null>(null)

    const onPlay = () => {
        const name = pseudo.trim()
        if (!name) return setError('Saisis un pseudo.')
        setError(null)
        setReady(true)
        setState(prev => ({ ...prev, pseudo: name }))
    }

    // --- Liste dynamique des rooms /api/rooms ---
    const [rooms, setRooms] = useState<RoomInfo[]>([])
    const [loadingRooms, setLoadingRooms] = useState(true)
    const [errRooms, setErrRooms] = useState<string | null>(null)

    useEffect(() => {
        let stop = false
        const load = async () => {
            try {
                const r = await fetch('/api/rooms', { cache: 'no-store' })
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                const j = (await r.json()) as { rooms: RoomInfo[] }
                if (!stop) {
                    setRooms(j.rooms)
                    setErrRooms(null)
                    setLoadingRooms(false)
                }
            } catch (e: any) {
                if (!stop) {
                    setErrRooms(e?.message ?? 'Erreur rooms')
                    setLoadingRooms(false)
                }
            }
        }
        load()
        const id = setInterval(load, 5000)
        return () => { stop = true; clearInterval(id) }
    }, [])

    // --- Join helpers ---
    const join = () => {
        if (!ready) return setError('Clique d’abord sur Jouer pour valider ton pseudo.')
        if (!room.trim()) return setError('Choisis un salon ou saisis-en un.')
        setError(null); setInfo(null)
        socket.emit('game:join', { roomId: room, role: 'giver', pseudo }, (res: any) => {
            if (res?.ok) {
                if (res.redirectedFrom && res.state?.roomId && res.state.roomId !== res.redirectedFrom) {
                    setInfo(`Salle "${res.redirectedFrom}" complète → redirection vers "${res.state.roomId}"`)
                }
                setState(prev => ({ ...prev, ...res.state }))
            } else {
                setError(res?.message || 'Impossible de rejoindre la partie.')
            }
        })
    }

    const joinDirect = (roomId: string, role: 'giver' | 'guesser') => {
        if (!ready) return setError('Tape ton pseudo puis clique « Jouer ».')
        setError(null); setInfo(null)
        socket.emit('game:join', { roomId, role, pseudo }, (res: any) => {
            if (res?.ok) {
                if (res.redirectedFrom && res.state?.roomId && res.state.roomId !== res.redirectedFrom) {
                    setInfo(`Salle "${res.redirectedFrom}" complète → redirection vers "${res.state.roomId}"`)
                }
                setState(prev => ({ ...prev, ...res.state }))
            } else {
                setError(res?.message || 'Impossible de rejoindre la partie.')
            }
        })
    }

    // Entrée = Rejoindre la sélection
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') join() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, pseudo, ready])

    return (
        <div style={{ position: 'relative', minHeight: '100vh', background: 'radial-gradient(1200px 600px at 50% -100px, rgba(120,119,198,.25), transparent), #0f0f18' }}>
            <Fireworks />

            <div className="appbar">
                <div className="appbar-inner">
                    <div className="brand"><div className="logo" />WorDuo</div>
                    <div className="badge">Lobby</div>
                </div>
            </div>

            <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Accueil + Pseudo + Jouer */}
                <section className="card pop" style={{ backdropFilter: 'blur(2px)' }}>
                    <h1 className="card-title" style={{ fontSize: 36, marginTop: 0 }}>
                        Bienvenue sur <span className="gradient-text">WorDuo</span>
                    </h1>
                    <p className="card-sub" style={{ marginTop: 6 }}>
                        Choisis ton <b>pseudo</b>, applique ton <b>serveur</b> si besoin, puis clique <b>Jouer</b>.
                    </p>

                    <div className="hr" />

                    {/* Choix du serveur */}
                    <div className="card" style={{ marginTop: 0 }}>
                        <div className="row" style={{ alignItems: 'center' }}>
                            <div style={{ minWidth: 120 }} className="card-sub">Serveur</div>
                            <select
                                className="input"
                                value={serverPreset}
                                onChange={e => setServerPreset(e.target.value)}
                                style={{ minWidth: 260 }}
                            >
                                {SERVER_PRESETS.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                            {serverPreset === 'custom' && (
                                <input
                                    className="input"
                                    placeholder="https://mon-api.exemple.com"
                                    value={customServerUrl}
                                    onChange={e => setCustomServerUrl(e.target.value)}
                                    style={{ flex: 1, minWidth: 280 }}
                                />
                            )}
                            <button className="btn btn-ghost" onClick={applyServer}>Appliquer</button>
                        </div>
                        <div className="card-sub" style={{ marginTop: 8 }}>
                            Actuel : <b>{initialUrl}</b>
                        </div>
                    </div>

                    <div className="hr" />

                    {/* Pseudo + Jouer */}
                    <div className="row" style={{ alignItems: 'center' }}>
                        <div style={{ minWidth: 120 }} className="card-sub">Pseudo</div>
                        <input className="input" value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder="Ton pseudo…" style={{ flex: 1 }} />
                        <button className="btn btn-primary" onClick={onPlay} disabled={!pseudo.trim()}>
                            Jouer
                        </button>
                    </div>

                    {info && (
                        <div style={{ margin: '12px 0', padding: 12, border: '1px solid rgba(99,102,241,.35)', background: '#0b0f22', borderRadius: 12 }}>
                            ℹ️ {info}
                        </div>
                    )}
                    {error && (
                        <div style={{ margin: '12px 0', padding: 12, border: '1px solid rgba(239,68,68,.4)', background: '#2a0f14', borderRadius: 12, color: '#FCA5A5' }}>
                            ⚠️ {error}
                        </div>
                    )}
                </section>

                {/* Rooms disponibles dynamiques */}
                <aside className="card pop">
                    <h2 className="card-title" style={{ marginTop: 0 }}>Rooms disponibles</h2>

                    {loadingRooms && <div>Chargement…</div>}
                    {errRooms && <div style={{ color: '#FCA5A5' }}>Erreur : {errRooms}</div>}
                    {!loadingRooms && !errRooms && rooms.length === 0 && (
                        <div>Aucune room visible pour le moment.</div>
                    )}

                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                        {rooms.map(r => (
                            <li key={r.id} style={{ border: '1px solid #222', borderRadius: 12, padding: 12, background: '#131323' }}>
                                <div style={{ fontSize: 14 }}>
                                    <b>{r.host}</b> attend un <b>{r.waitingFor}</b> en room <b>{r.color}</b>.
                                </div>
                                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                                    <button
                                        className="btn btn-ghost"
                                        disabled={!ready}
                                        onClick={() => joinDirect(r.id, 'giver')}
                                    >
                                        Rejoindre en Meneur
                                    </button>
                                    <button
                                        className="btn btn-ghost"
                                        disabled={!ready}
                                        onClick={() => joinDirect(r.id, 'guesser')}
                                    >
                                        Rejoindre en Devineur
                                    </button>
                                </div>
                                {!ready && (
                                    <div style={{ marginTop: 6, fontSize: 12, opacity: .75 }}>
                                        Saisis ton pseudo puis clique « Jouer ».
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </aside>

                {/* Sélection manuelle (section d'origine) */}
                <section className="card pop" style={{ gridColumn: '1 / span 2' }}>
                    <h3 className="card-title">Créer ou rejoindre manuellement</h3>
                    <div className="card-sub">Choisis un salon dans la liste, ou saisis un nom personnalisé.</div>

                    <div className="hr" />

                    <div className="card" style={{ marginTop: 0 }}>
                        <div className="row" style={{ alignItems: 'center' }}>
                            <div style={{ minWidth: 120 }} className="card-sub">Salon</div>

                            <div className="segment">
                                <div
                                    className={`seg ${roomMode === 'preset' ? 'active' : ''}`}
                                    onClick={() => setRoomMode('preset')}
                                >Liste</div>
                                <div
                                    className={`seg ${roomMode === 'custom' ? 'active' : ''}`}
                                    onClick={() => setRoomMode('custom')}
                                >Personnalisé</div>
                            </div>

                            {roomMode === 'preset' ? (
                                <>
                                    <select
                                        className="input"
                                        value={roomPreset}
                                        onChange={e => setRoomPreset(e.target.value)}
                                        style={{ minWidth: 260, flex: 1 }}
                                    >
                                        {SALONS.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                    <button className="btn btn-ghost" onClick={diceRoom} title="Choisir au hasard">🎲</button>
                                </>
                            ) : (
                                <input
                                    className="input"
                                    placeholder="Tape le nom exact du salon…"
                                    value={roomCustom}
                                    onChange={e => setRoomCustom(e.target.value)}
                                    style={{ flex: 1, minWidth: 300 }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="row" style={{ marginTop: 12 }}>
                        <button className="btn btn-primary" onClick={join} disabled={!ready}>Rejoindre (Meneur)</button>
                        <span className="card-sub">Astuce : tape <span className="kbd">Entrée</span></span>
                    </div>
                    {!ready && <div style={{ marginTop: 6, fontSize: 12, opacity: .75 }}>Saisis ton pseudo puis clique « Jouer ».</div>}
                </section>
            </div>
        </div>
    )
}
