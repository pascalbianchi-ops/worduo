// src/lib/socket.ts
import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentUrl: string | null = null

const SOCKET_PATH = '/socket.io'

function isHostedProd(): boolean {
  if (typeof window === 'undefined') return false
  const { protocol, host } = window.location
  return protocol === 'https:' || /onrender\.com$/i.test(host) || /github\.io$/i.test(host)
}
function isLocalHostName(h: string) {
  return /^(localhost|127\.0\.0\.1|::1)$/i.test(h)
}

/** Résout l'URL base du socket */
function resolveUrl(): string {
  // PROD → URL ABSOLUE sur la même origine
  if (isHostedProd()) {
    try { localStorage.removeItem('serverUrl') } catch {}
    if (typeof window !== 'undefined') return window.location.origin // ex: https://worduo.onrender.com
    return ''
  }

  // DEV
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('serverUrl')) || ''
  const env =
    (import.meta as any).env?.VITE_SOCKET_URL ||
    (import.meta as any).env?.VITE_SERVER_URL || ''
  return (stored || env || 'http://localhost:3000').trim()
}

/** URL serveur actuellement utilisée */
export function getCurrentServerUrl(): string {
  return currentUrl ?? resolveUrl()
}

/** Définir l'URL custom (ignoré en prod) et reset le socket */
export function setServerUrl(url: string) {
  if (!isHostedProd() && typeof localStorage !== 'undefined') {
    localStorage.setItem('serverUrl', url)
  }
  if (socket) { socket.disconnect(); socket = null }
  currentUrl = null
}

/** Singleton Socket.IO (autoConnect: false) */
export function getSocket(urlOverride?: string): Socket {
  let url = (urlOverride ?? resolveUrl()).trim()

  // Interdiction totale de localhost quand la page n'est pas locale
  if (typeof window !== 'undefined' && !isLocalHostName(window.location.hostname)) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?/i.test(url)) {
      console.warn('[socket] Blocking localhost target on prod, forcing same-origin')
      try { localStorage.removeItem('serverUrl') } catch {}
      url = window.location.origin
    }
    // Si l'URL est vide (''), on force aussi l’origin complète
    if (url === '') url = window.location.origin
  }

  // Log de debug
  if (typeof window !== 'undefined') {
    console.log('[socket] location=', window.location.href, '→ target=', url)
  }

  if (!socket || currentUrl !== url) {
    if (socket) socket.disconnect()
    socket = io(url, {
      autoConnect: false,
      path: SOCKET_PATH,
      withCredentials: false,
      // ne pas forcer transports → laisser polling/websocket
      // transports: ['websocket'], // (laisser commenté)
    })
    currentUrl = url
  }
  return socket
}