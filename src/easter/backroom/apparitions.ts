// Ombres furtives : aperçues de loin en traversant un couloir ou une salle.
// Effets de surprise uniquement : elles ne bloquent rien, ne s'approchent
// jamais du joueur et ne se manifestent qu'une seule fois par partie.
import type { Level, Apparition } from './types'

// in : visible · vanish : disparition brutale · fade : s'efface doucement
export type AppPhase = 'idle' | 'in' | 'vanish' | 'fade' | 'gone'
export type AppState = { phase: AppPhase; t: number; x: number; y: number; alpha: number }
/** appear : une ombre se montre · scare : une ombre qui fixait disparaît d'un coup */
export type AppEvent = 'appear' | 'scare'

const SEE_MIN = 3.5 // trop près, elle ne se montre pas : toujours vue de loin
const SEE_MAX = 9 // au-delà, la silhouette ne fait que quelques pixels : invisible
const SAFETY = 3 // plus près que ça, elle disparaît aussitôt
const HALF_FOV = 0.55
const STARE_LIFE = 1.8 // une ombre qui fixe le joueur reste au plus ça
const STARE_FLEE = 4.5 // ... ou disparaît si on s'avance vers elle
const CROSS_SPEED = 2.6
const PEEK_SPEED = 1.5

export function initApparitions(level: Level): Record<string, AppState> {
  return Object.fromEntries(level.apparitions.map((a) => [a.id, { phase: 'idle' as AppPhase, t: 0, x: a.x, y: a.y, alpha: 0 }]))
}

function lineOfSight(level: Level, x0: number, y0: number, x1: number, y1: number) {
  const d = Math.hypot(x1 - x0, y1 - y0)
  const n = Math.ceil(d / 0.1)
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n
    if (level.walls[Math.floor(y) * level.w + Math.floor(x)] !== 'none') return false
  }
  return true
}

function inView(level: Level, px: number, py: number, pa: number, x: number, y: number) {
  const ang = Math.atan2(y - py, x - px) - pa
  return Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < HALF_FOV && lineOfSight(level, px, py, x, y)
}

export type Player = { x: number; y: number; a: number }

/** Déplacement d'une ombre qui se dérobe : jamais vers le joueur */
function slipAway(def: Apparition, st: AppState, p: Player, speed: number, dt: number) {
  const d = Math.hypot(st.x - p.x, st.y - p.y) || 1
  const ax = (st.x - p.x) / d, ay = (st.y - p.y) / d
  // en travers (produit scalaire ~0) ou en s'éloignant : direction prévue ;
  // sinon elle recule droit devant le joueur
  const [mx, my] = def.dx * ax + def.dy * ay >= -0.35 ? [def.dx, def.dy] : [ax, ay]
  st.x += mx * speed * dt
  st.y += my * speed * dt
}

/**
 * Fait évoluer les ombres et renvoie les événements sonores du pas, ainsi que
 * le malaise (0..1) qui assombrit l'écran et accélère le cœur.
 */
export function updateApparitions(level: Level, apps: Record<string, AppState>, p: Player, dt: number) {
  const events: AppEvent[] = []
  let dread = 0

  for (const def of level.apparitions) {
    const st = apps[def.id]
    if (st.phase === 'gone') continue
    st.t += dt
    const dist = Math.hypot(st.x - p.x, st.y - p.y)

    if (st.phase === 'idle') {
      if (dist > SEE_MIN && dist < SEE_MAX && inView(level, p.x, p.y, p.a, st.x, st.y)) {
        st.phase = 'in'; st.t = 0; st.alpha = 1; events.push('appear')
      }
      continue
    }

    if (st.phase === 'in') {
      if (def.kind === 'stare') {
        // immobile, elle fixe le joueur… puis s'évanouit d'un coup
        if (st.t > STARE_LIFE || dist < STARE_FLEE) { st.phase = 'vanish'; st.t = 0; events.push('scare') }
      } else if (def.kind === 'cross') {
        // un temps d'arrêt, puis elle traverse en travers du regard
        if (st.t > 0.25) slipAway(def, st, p, CROSS_SPEED, dt)
        if (st.t > 1.9) { st.phase = 'fade'; st.t = 0 }
      } else {
        // peek : elle observe depuis un coin, puis se retire hors de vue
        if (st.t > 0.7) slipAway(def, st, p, PEEK_SPEED, dt)
        if (st.t > 1.3) { st.phase = 'fade'; st.t = 0 }
      }
    } else {
      st.alpha = Math.min(st.alpha, Math.max(0, 1 - st.t / (st.phase === 'vanish' ? 0.1 : 0.35)))
      if (st.alpha <= 0) { st.alpha = 0; st.phase = 'gone' }
    }

    if (st.alpha > 0 && Math.hypot(st.x - p.x, st.y - p.y) < SAFETY) {
      st.alpha = 0
      st.phase = 'gone'
    }

    if (st.alpha > 0) {
      const near = Math.max(0.3, Math.min(1, (SEE_MAX + 1 - dist) / 10))
      dread = Math.max(dread, st.alpha * near * (def.kind === 'stare' ? 0.55 : 0.3))
    }
  }
  return { events, dread }
}

/** Ombre visible la plus proche du joueur (d = Infinity si aucune) */
export function closestVisible(apps: Record<string, AppState>, p: Player) {
  let best = { d: Infinity, id: '' }
  for (const [id, st] of Object.entries(apps)) {
    const d = Math.hypot(st.x - p.x, st.y - p.y)
    if (st.alpha > 0 && d < best.d) best = { d, id }
  }
  return best
}
