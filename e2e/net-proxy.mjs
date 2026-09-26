// Proxy TCP de test : se place entre un navigateur et le serveur Worduo pour
// simuler des conditions réseau dégradées sur UN joueur à la fois.
//  - latence (+ gigue) dans les deux sens, en conservant l'ordre des paquets
//  - coupure franche (les deux côtés voient la connexion tomber)
//  - connexion "à moitié morte" : le client perd la connexion tout de suite
//    mais le serveur ne s'en rend compte qu'au timeout de ping (cas typique
//    d'un mobile qui passe du wifi à la 4G)
import net from 'node:net'

export function createProxy({ targetPort, targetHost = '127.0.0.1' }) {
  const pairs = new Set()
  let latency = 0
  let jitter = 0
  let refuseUntil = 0

  const delayFor = () => latency + Math.random() * jitter

  // Pipe ordonné avec retard : chaque chunk part au plus tôt à (arrivée + delay),
  // et jamais avant le chunk précédent.
  function pipeDelayed(from, to, pair) {
    let lastSendAt = 0
    from.on('data', (chunk) => {
      if (pair.frozen) return
      const d = delayFor()
      if (d <= 0) { if (!to.destroyed) to.write(chunk); return }
      const sendAt = Math.max(Date.now() + d, lastSendAt)
      lastSendAt = sendAt
      setTimeout(() => { if (!to.destroyed && !pair.frozen) to.write(chunk) }, sendAt - Date.now())
    })
  }

  const server = net.createServer((client) => {
    if (Date.now() < refuseUntil) { client.destroy(); return }
    const upstream = net.connect(targetPort, targetHost)
    const pair = { client, upstream, frozen: false }
    pairs.add(pair)
    pipeDelayed(client, upstream, pair)
    pipeDelayed(upstream, client, pair)
    const cleanup = () => {
      pairs.delete(pair)
      if (!pair.frozen) { client.destroy(); upstream.destroy() }
    }
    client.on('error', () => { })
    upstream.on('error', () => { })
    client.on('close', () => { if (!pair.frozen) cleanup() })
    upstream.on('close', () => { cleanup(); client.destroy() })
  })

  return {
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
    close: () => new Promise((resolve) => {
      for (const p of pairs) { p.client.destroy(); p.upstream.destroy() }
      server.close(() => resolve())
    }),
    setLatency(ms, jit = 0) { latency = ms; jitter = jit },
    /** Coupe toutes les connexions et refuse les nouvelles pendant `ms`. */
    cut(ms) {
      refuseUntil = Date.now() + ms
      for (const p of pairs) { p.client.destroy(); p.upstream.destroy() }
    },
    /**
     * Coupe côté client uniquement : les connexions vers le serveur restent
     * ouvertes mais muettes. Le serveur garde donc l'ancien socket "vivant"
     * jusqu'à son pingTimeout, pendant que le client se reconnecte.
     */
    halfDead() {
      for (const p of pairs) {
        p.frozen = true
        p.client.destroy()
      }
    },
  }
}
