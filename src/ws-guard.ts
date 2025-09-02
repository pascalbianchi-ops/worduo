// Bloque toute tentative de WebSocket vers localhost quand la page n'est pas locale.
if (typeof window !== 'undefined') {
  const origWS = window.WebSocket
  window.WebSocket = function (url: any, protocols?: any) {
    try {
      const u = String(url ?? '')
      const isLocalTarget = /^ws(s)?:\/\/(localhost|127\.0\.0\.1|::1)(:\d+)?/i.test(u)
      const isLocalPage = /^(localhost|127\.0\.0\.1|::1)$/i.test(window.location.hostname)
      if (!isLocalPage && isLocalTarget) {
        const sameOriginWS = window.location.origin.replace(/^http/, 'ws')
        console.warn('[WS-guard] Blocking', u, '→ forcing', sameOriginWS)
        return new (origWS as any)(sameOriginWS, protocols)
      }
    } catch {}
    return new (origWS as any)(url, protocols)
  } as any
}