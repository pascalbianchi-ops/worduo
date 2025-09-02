// src/lib/socket.ts
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentUrl: string | null = null

const SOCKET_PATH = '/socket.io'

function isHostedProd(): boolean {
  if (typeof window === 'undefined') return false
  const { protocol, host } = window.location
  return (
    protocol === 'https:' ||
    /onrender\.com$/i.test(host) ||
    /github\.io$/i.test(host)
  )
}

/**
 * Résout l'URL du serveur pour le socket.
 * - En prod (https / onrender / github.io) => même origine: ''
 * - En dev => localStorage > variables Vite > fallback localhost
 */
function resolveUrl(): string {
  // PROD : même origine + purge de toute config persistée
  if (isHostedProd()) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('serverUrl')
      }
    } catch {}
    return '' // même origine (ex: https://worduo.onrender.com)
  }

  // DEV
  const stored =
    (typeof localStorage !== 'undefined' && localStorage.getItem('serverUrl')) || ''

  const env =
    (import.meta as any).env?.VITE_SOCKET_URL ||
    (import.meta as any).env?.VITE_SERVER_URL ||
    ''

  return (stored || env || 'http://localhost:3000').trim()
}

/** URL serveur actuellement utilisée (localStorage > .env > défaut) */
export function getCurrentServerUrl(): string {
  return currentUrl ?? resolveUrl()
}

/** Définit l'URL serveur et invalide le socket courant (sera recréé au prochain getSocket) */
export function setServerUrl(url: string) {
  // En prod on ignore toute tentative de forcer l'URL
  if (!isHostedProd() && typeof localStorage !== 'undefined') {
    localStorage.setItem('serverUrl', url)
  }
  if (socket) {
    socket.disconnect()
    socket = null
  }
  currentUrl = null
}

/** Singleton Socket.IO (autoConnect: false). Appelle socket.connect() ailleurs (GameContext). */
export function getSocket(urlOverride?: string): Socket {
  const url = (urlOverride ?? resolveUrl())

  if (!socket || currentUrl !== url) {
    if (socket) socket.disconnect()
    socket = io(url, {
      autoConnect: false,
      // Ne pas forcer uniquement 'websocket' → laisse le fallback 'polling' si besoin
      path: SOCKET_PATH,
      // withCredentials: false, // à activer si vous utilisez des cookies
    })
    currentUrl = url
  }
  return socket
}