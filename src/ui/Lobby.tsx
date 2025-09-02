// src/ui/Lobby.tsx
import React, { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useGame } from '../state/GameContext'
import { setServerUrl, getCurrentServerUrl } from '../lib/socket'

// ===== Helpers HTTP (même base que le socket) =====
function normalizeBase(u: string) {
  return (u || '').trim().replace(/\/+$/, '')
}
function join(base: string, path: string) {
  return `${normalizeBase(base)}/${String(path).replace(/^\/+/, '')}`
}

/** Base d'API :
 *  PROD (https/onrender/github.io) => même origine ('')
 *  DEV => localStorage éventuel > origin (Vite proxy pour /api)
 */
function getApiBase(): string {
  if (typeof window === 'undefined') return ''
  const { protocol, host, origin } = window.location

  const isHostedProd = protocol === 'https:' || /onrender\.com$/i.test(host) || /github\.io$/i.test(host)
  if (isHostedProd) return '' // même origine

  const stored = (localStorage.getItem('serverUrl') || '').trim()
  if (stored && !(protocol === 'https:' && /^http:\/\/localhost/i.test(stored))) {
    return normalizeBase(stored)
  }
  return origin
}

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const base = getApiBase()
  const url = join(base, path)
  const res = await fetch(url, { cache: 'no-store', ...init })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} on ${url} – ${txt.slice(0, 160)}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Expected JSON from ${url}, got "${ct}". Body: ${txt.slice(0, 160)}`)
  }
  return res.json() as Promise<T>
}
// ===== fin helpers =====

// Presets serveur (prod = même origine)
const SERVER_PRESETS = [
  { label: 'Production (même origine)', value: '' },
  { label: 'Local (localhost:3000)', value: 'http://localhost:3000' },
  { label: 'Personnalisé…', value: 'custom' },
]

// Salons
const SALONS = [ /* … ta liste … */ ]
function randomSalon() { return SALONS[Math.floor(Math.random() * SALONS.length)] }

type RoomInfo = {
  id: string
  color: string
  host: string
  waitingFor: 'meneur' | 'devineur'
}

const tapStyle: CSSProperties = {
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  cursor: 'pointer',
}

function Fireworks() {
  const pieces = useMemo(() => {
    const icons = ['🎆','🎇','✨','💥','🌟','⭐️','🎊','🎉']
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
  const { setState, socket, ensureConnected } = useGame()

  // --- Sélection serveur ---
  const hostedProd = typeof window !== 'undefined' && (
    window.location.protocol === 'https:' ||
    /onrender\.com$/i.test(window.location.host) ||
    /github\.io$/i.test(window.location.host)
  )

  const initialUrl = hostedProd ? '' : getCurrentServerUrl()
  const initialServerPreset = hostedProd ? '' : (SERVER_PRESETS.find(p => p.value === initialUrl)?.value ?? 'custom')

  const [serverPreset, setServerPreset] = useState<string>(initialServerPreset)
  const [customServerUrl, setCustomServerUrl] = useState<string>(initialServerPreset === 'custom' ? initialUrl : '')
  const effectiveServerUrl = serverPreset === 'custom' ? customServerUrl : serverPreset

  const applyServer = () => {
    if (hostedProd) {
      try { localStorage.removeItem('serverUrl') } catch {}
      setServerUrl('')     // ignoré en prod mais on purge quand même
      window.location.reload()
      return
    }
    const url = normalizeBase(effectiveServerUrl || '')
    if (!url) return alert('URL serveur vide.')
    setServerUrl(url)
    window.location.reload()
  }

  // --- Pseudo + Jouer ---
  const [pseudo, setPseudo] = useState<string>('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const onPlay = async () => {
    const name = pseudo.trim()
    if (!name) return setError('Saisis un pseudo.')
    setError(null)
    setReady(true)
    setState(prev => ({ ...prev, pseudo: name as any }))
    try { await ensureConnected() } catch (e) {
      setError('Connexion au serveur impossible.')
      console.error(e)
    }
  }

  // --- Sélection room ---
  const savedRoomPreset = (localStorage.getItem('roomPreset') as string) || 'preset'
  const savedCustomRoom = localStorage.getItem('customRoom') || ''
  const [roomMode, setRoomMode] = useState<'preset' | 'custom'>(savedRoomPreset === 'custom' ? 'custom' : 'preset')
  const [roomPreset, setRoomPreset] = useState<string>(SALONS.includes(savedCustomRoom) ? savedCustomRoom : randomSalon())
  const [roomCustom, setRoomCustom] = useState<string>(roomMode === 'custom' ? (savedCustomRoom || '') : '')
  const room = roomMode === 'custom' ? (roomCustom || '') : roomPreset

  useEffect(() => {
    localStorage.setItem('roomPreset', roomMode)
    localStorage.setItem('customRoom', roomMode === 'custom' ? roomCustom : roomPreset)
  }, [roomMode, roomPreset, roomCustom])

  const diceRoom = () => { setRoomMode('preset'); setRoomPreset(randomSalon()) }

  // --- Liste /api/rooms ---
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [errRooms, setErrRooms] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    const load = async () => {
      try {
        const j = await api<{ rooms: RoomInfo[] }>('/api/rooms')
        if (!stop) { setRooms(j.rooms); setErrRooms(null); setLoadingRooms(false) }
      } catch (e: any) {
        if (!stop) { setErrRooms(e?.message ?? 'Erreur rooms'); setLoadingRooms(false) }
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => { stop = true; clearInterval(id) }
  }, [])

  // --- Join helpers (on garantit la connexion) ---
  const doJoin = async (roomId: string, role: 'giver' | 'guesser', name: string) => {
    try {
      await ensureConnected()
      socket.emit('game:join', { roomId, role, pseudo: name }, (res: any) => {
        if (res?.ok) {
          if (res.redirectedFrom && res.state?.roomId && res.state.roomId !== res.redirectedFrom) {
            setInfo(`Salle "${res.redirectedFrom}" complète → redirection vers "${res.state.roomId}"`)
          }
          setState(prev => ({ ...prev, ...res.state }))
        } else {
          setError(res?.message || 'Impossible de rejoindre la partie.')
        }
      })
    } catch (e) {
      console.error(e)
      setError('Connexion au serveur impossible.')
    }
  }

  const join = async () => {
    const name = pseudo.trim()
    if (!name) return setError('Saisis un pseudo.')
    if (!room.trim()) return setError('Choisis un salon ou saisis-en un.')
    setError(null); setInfo(null)
    await doJoin(room, 'giver', name)
  }

  const joinDirect = async (roomId: string, role: 'giver' | 'guesser') => {
    const name = pseudo.trim()
    if (!ready) return setError('Tape ton pseudo puis clique « Jouer ».')
    setError(null); setInfo(null)
    await doJoin(roomId, role, name)
  }

  // Entrée clavier = rejoindre
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') void join() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, pseudo, ready])

  // … Le JSX reste inchangé (ta version)
  // (je le garde tel quel ici pour rester concis)
  // ——————————————————————————————————————————————
  return (
    // … ton rendu actuel (inchangé)
    <div />
  )
}