// src/ws-guard.ts
// Bloque toute tentative de WebSocket vers localhost quand la page n'est pas locale.
// Conserve pathname + search et supprime tout port explicite.
if (typeof window !== 'undefined') {
  const origWS = window.WebSocket
  window.WebSocket = function (url: any, protocols?: any) {
    try {
      const raw = String(url ?? '')
      const isLocalTarget = /^ws(s)?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?/i.test(raw)
      const isLocalPage = /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname)

      if (!isLocalPage && isLocalTarget) {
        const u = new URL(raw)
        // remplace juste le scheme + host par ceux de la page
        u.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        u.hostname = window.location.hostname
        u.port = '' // IMPORTANT: supprime :3000 hérité de localhost
        // (on garde u.pathname et u.search intacts)
        const forced = u.toString()
        console.warn('[WS-guard] Blocking', raw, '→ forcing', forced)
        return new (origWS as any)(forced, protocols)
      }
    } catch {}
    return new (origWS as any)(url, protocols)
  } as any
}