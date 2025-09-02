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

function isLocalhostHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '::1'
}

/** Résout l'URL base du socket */
function resolveUrl(): string {
  // En PROD: même origine + purge toute config forcée
  if (isHostedProd()) {
    try { localStorage.removeItem('serverUrl') } catch {}
    return '' // wss://<même origine>/socket.io
  }

  // En DEV: localStorage > .env > localhost
  const stored =
    (typeof localStorage !== 'undefined' && localStorage.getItem('serverUrl')) || ''
  const env =
    (import.meta as any).env?.VITE_SOCKET_URL ||
    (import.meta as any).env?.VITE_SERVER_URL ||
    ''
  return (stored || env || 'http://localhost:3000').trim()
}

/** URL serveur actuellement utilisée */
export function getCurrentServerUrl(): string {
  return currentUrl ?? resolveUrl()
}

/** Définit une URL custom (ignoré en prod) et reset le socket */
export function setServerUrl(url: string) {
  if (!isHostedProd() && typeof localStorage !== 'undefined') {
    localStorage.setItem('serverUrl', url)
  }
  if (socket) {
    socket.disconnect()
    socket = null
  }
  currentUrl = null
}

/** Singleton Socket.IO (autoConnect: false). Appelle s.connect() ailleurs. */
export function getSocket(urlOverride?: string): Socket {
  let url = (urlOverride ?? resolveUrl()).trim()

  // 🚫 Si on n'est PAS sur un host local, interdiction totale d'un target localhost
  if (!isLocalhostHost() && /^https?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?/i.test(url)) {
    try { localStorage.removeItem('serverUrl') } catch {}
    url = '' // même origine en prod
  }

  // Log de debug (à enlever après validation)
  if (typeof window !== 'undefined') {
    console.log('[socket] location=', window.location.href, ' target=', url || '(same-origin)')
  }

  if (!socket || currentUrl !== url) {
    if (socket) socket.disconnect()
    socket = io(url, {
      autoConnect: false,
      path: SOCKET_PATH,
      // ne PAS forcer ['websocket'] → permet fallback polling
    })
    currentUrl = url
  }
  return socket
}