// src/ws-guard.ts
// Bloque toute tentative de WebSocket vers localhost quand la page n'est pas locale.
// Conserve le path (/socket.io/...) et la query.
if (typeof window !== 'undefined') {
  const origWS = window.WebSocket
  window.WebSocket = function (url: any, protocols?: any) {
    try {
      const raw = String(url ?? '')
      const isLocalTarget = /^ws(s)?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?/i.test(raw)
      const isLocalPage = /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname)

      if (!isLocalPage && isLocalTarget) {
        // Parse l'URL originale pour garder pathname + search
        const u = new URL(raw)
        // Remplace juste protocole + host par ceux de la page courante
        u.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        u.host = window.location.host
        const forced = u.toString()
        console.warn('[WS-guard] Blocking', raw, '→ forcing', forced)
        return new (origWS as any)(forced, protocols)
      }
    } catch {
      // no-op
    }
    return new (origWS as any)(url, protocols)
  } as any
}