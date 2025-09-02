import React, { useEffect, useState } from 'react'
import { useGame } from '../state/GameContext'

type JoinRes = { ok: boolean; message?: string; state?: any; redirectedFrom?: string }

export function Lobby() {
  const { socket, setState } = useGame()
  const [pseudo, setPseudo] = useState('')
  const [ready, setReady] = useState(false)
  const [roomId, setRoomId] = useState('Salon Turquoise')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [rooms, setRooms] = useState<Array<{id:string;color:string;host:string;waitingFor:'meneur'|'devineur'}>>([])

  // Connexion socket simple (pas d’artifice)
  useEffect(() => {
    if (!socket.connected) socket.connect()
    const onConnect = () => console.log('[Lobby] socket connected')
    const onDisconnect = () => console.log('[Lobby] socket disconnected')
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [socket])

  // Poll des rooms simples
  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const res = await fetch('/api/rooms', { cache: 'no-store' })
        const j = await res.json()
        if (!stop) setRooms(Array.isArray(j.rooms) ? j.rooms : [])
      } catch {}
    }
    load()
    const id = setInterval(load, 5000)
    return () => { stop = true; clearInterval(id) }
  }, [])

  const onPlay = () => {
    const name = pseudo.trim()
    if (!name) { setError('Saisis un pseudo.'); return }
    setError(null)
    setReady(true)
    setState(prev => ({ ...prev, pseudo: name as any }))
  }

  const join = (role: 'giver'|'guesser') => {
    if (!ready) { setError('Clique d’abord sur Jouer.'); return }
    const name = pseudo.trim()
    if (!name) { setError('Saisis un pseudo.'); return }
    if (!roomId.trim()) { setError('Saisis un salon.'); return }

    setError(null); setInfo(null)
    socket.emit('game:join', { roomId, role, pseudo: name }, (res: JoinRes) => {
      if (res?.ok) {
        if (res.redirectedFrom && res.state?.roomId && res.state.roomId !== res.redirectedFrom) {
          setInfo(`Salle "${res.redirectedFrom}" complète → redirection vers "${res.state.roomId}"`)
        }
        setState(prev => ({ ...prev, ...res.state }))
      } else {
        setError(res?.message || 'Impossible de rejoindre.')
      }
    })
  }

  return (
    <div style={{padding:20, color:'#eee', fontFamily:'system-ui, sans-serif', minHeight:'100vh', background:'#0f0f18'}}>
      <h1 style={{marginTop:0}}>WorDuo — Lobby (mode secours)</h1>

      <div style={{border:'1px solid #333', borderRadius:8, padding:12, marginBottom:16}}>
        <div style={{marginBottom:8}}>
          <label style={{display:'block', marginBottom:4}}>Pseudo</label>
          <input
            style={{width:'100%', padding:8, borderRadius:6, border:'1px solid #444', background:'#111', color:'#eee'}}
            value={pseudo}
            onChange={e=>setPseudo(e.target.value)}
            placeholder="Ton pseudo…"
          />
        </div>
        <button
          onClick={onPlay}
          disabled={!pseudo.trim()}
          style={{padding:'8px 12px', borderRadius:6, border:'1px solid #666', background:'#1f6feb', color:'#fff', cursor:'pointer'}}
        >
          Jouer
        </button>
        {ready && <span style={{marginLeft:10, color:'#9fe'}}>✅ prêt</span>}
      </div>

      <div style={{border:'1px solid #333', borderRadius:8, padding:12, marginBottom:16}}>
        <div style={{marginBottom:8}}>
          <label style={{display:'block', marginBottom:4}}>Salon</label>
          <input
            style={{width:'100%', padding:8, borderRadius:6, border:'1px solid #444', background:'#111', color:'#eee'}}
            value={roomId}
            onChange={e=>setRoomId(e.target.value)}
            placeholder="Nom exact du salon…"
          />
        </div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={()=>join('giver')} disabled={!ready}
            style={{padding:'8px 12px', borderRadius:6, border:'1px solid #666', background:'#222', color:'#fff', cursor:'pointer'}}
          >
            Rejoindre (Meneur)
          </button>
          <button onClick={()=>join('guesser')} disabled={!ready}
            style={{padding:'8px 12px', borderRadius:6, border:'1px solid #666', background:'#222', color:'#fff', cursor:'pointer'}}
          >
            Rejoindre (Devineur)
          </button>
        </div>
        {!ready && <div style={{marginTop:8, opacity:.8}}>Saisis un pseudo puis clique « Jouer ».</div>}
      </div>

      {error && <div style={{marginBottom:12, padding:10, border:'1px solid #a33', background:'#2a0f14', borderRadius:8, color:'#FCA5A5'}}>⚠️ {error}</div>}
      {info && <div style={{marginBottom:12, padding:10, border:'1px solid #5865f2', background:'#0b0f22', borderRadius:8}}>ℹ️ {info}</div>}

      <div style={{border:'1px solid #333', borderRadius:8, padding:12}}>
        <h2 style={{marginTop:0}}>Rooms disponibles</h2>
        {rooms.length === 0 && <div>Aucune room visible.</div>}
        <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:8}}>
          {rooms.map(r => (
            <li key={r.id} style={{border:'1px solid #222', borderRadius:8, padding:10}}>
              <div><b>{r.host}</b> attend un <b>{r.waitingFor}</b> — <i>{r.color}</i></div>
              <div style={{marginTop:8, display:'flex', gap:8}}>
                <button onClick={()=>join('giver')} disabled={!ready}
                  style={{padding:'6px 10px', borderRadius:6, border:'1px solid #666', background:'#222', color:'#fff', cursor:'pointer'}}
                >Rejoindre en Meneur</button>
                <button onClick={()=>join('guesser')} disabled={!ready}
                  style={{padding:'6px 10px', borderRadius:6, border:'1px solid #666', background:'#222', color:'#fff', cursor:'pointer'}}
                >Rejoindre en Devineur</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}