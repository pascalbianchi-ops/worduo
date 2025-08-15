import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentUrl: string | null = null

function resolveUrl(): string {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('serverUrl')) || ''
    const env = (import.meta as any).env?.VITE_SOCKET_URL
        || (import.meta as any).env?.VITE_SERVER_URL
        || ''
    return stored || env || 'http://localhost:3000'
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
    const url = urlOverride || resolveUrl()
    if (!socket || currentUrl !== url) {
        if (socket) socket.disconnect()
        socket = io(url, { autoConnect: false, transports: ['websocket'] })
        currentUrl = url
    }
    return socket
}
