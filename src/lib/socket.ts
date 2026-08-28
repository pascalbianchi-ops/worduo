import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentUrl: string | null = null

function resolveUrl(): string {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('serverUrl')) || ''
    const env = (import.meta as any).env?.VITE_SOCKET_URL
        || (import.meta as any).env?.VITE_SERVER_URL
        || ''
    if (stored) return stored
    if (env) return env
    // En production (build servi par le serveur lui-même), on utilise l'origine courante
    // plutôt que localhost, qui ne fonctionne qu'en dev local.
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin
    }
    return 'http://localhost:3000'
}

/** URL serveur actuellement utilisée (localStorage > .env > origine courante > défaut) */
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
        socket = io(url, {
            autoConnect: false,
            // websocket en priorité, mais on autorise le repli en polling :
            // sur Safari iOS, le WebSocket peut rester "gelé" quelques secondes
            // après un retour d'arrière-plan ; le polling permet de reprendre
            // la main plus vite le temps que le WebSocket se rétablisse.
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 3000,
            timeout: 10000,
        })
        currentUrl = url
    }
    return socket
}
