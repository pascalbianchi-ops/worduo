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
  if (isHostedProd()) return '' // même origine (ex: https://worduo.onrender.com)

  const stored =
    (typeof localStorage !== 'undefined' && localStorage.getItem('serverUrl')) || ''

  // Variables Vite optionnelles
  const env =
    (import.meta as any).env?.VITE_SOCKET_URL ||
    (import.meta as any).env?.VITE_SERVER_URL ||
    ''

  // Si la page est en https, on évite de retourner un http://localhost qui casserait en prod
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /^http:\/\/localhost/i.test(stored)) {
    return ''
  }

  return (stored || env || 'http://localhost:3000').trim()
}

/** URL serveur actuellement utilisée (localStorage > .env > défaut) */
export function getCurrentServerUrl(): string {
  return currentUrl ?? resolveUrl()
}

/** Définit l'URL serveur et invalide le socket courant (sera recréé au prochain getSocket) */
export function setServerUrl(url: string) {
  if (typeof localStorage !== 'undefined') {
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
  const url = (isHostedProd() ? '' : (urlOverride || resolveUrl()))
  if (!socket || currentUrl !== url) {
    if (socket) socket.disconnect()
    socket = io(url, {
      autoConnect: false,
      transports: ['websocket'],
      path: SOCKET_PATH,
      // withCredentials: false, // à activer si vous utilisez des cookies
    })
    currentUrl = url
  }
  return socket
}