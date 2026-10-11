// Silhouettes sombres : effets de surprise uniquement. Elles ne bloquent rien,
// ne touchent jamais le joueur et ne se manifestent qu'une seule fois.
import type { Level } from './types'

// in : présente · vanish : s'évanouit d'un coup · fade : s'efface lentement
export type AppPhase = 'idle' | 'in' | 'vanish' | 'fade' | 'gone'
export type AppState = { phase: AppPhase; t: number; x: number; y: number; alpha: number }
export type AppEvent = 'scare' | 'vanish' | 'glimpse'

const GUARD_TRIGGER = 2.6 // s'approcher à moins de ça d'un gardien visible le fait surgir
const GUARD_VANISH = 1.5 // insister plus près le fait s'évanouir : jamais atteignable
const GUARD_RETREAT = 4.2 // reculer plus loin le fait s'effacer lentement
const GUARD_MAX_LIFE = 9
const GLIMPSE_MIN = 2.5
const GLIMPSE_MAX = 10
const GLIMPSE_SPEED = 1.8
const HALF_FOV = 0.55
const SAFETY = 1.2 // filet de sécurité : plus près que ça, toute silhouette disparaît net

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
  const diff = Math.atan2(Math.sin(Math.atan2(y - py, x - px) - pa), Math.cos(Math.atan2(y - py, x - px) - pa))
  return Math.abs(diff) < HALF_FOV && lineOfSight(level, px, py, x, y)
}

export type Player = { x: number; y: number; a: number }

/**
 * Fait évoluer les apparitions et renvoie les événements sonores du pas.
 * `dread` (0..1) mesure le malaise : il assombrit l'écran, accélère le cœur
 * et ralentit le joueur quand il avance vers un gardien.
 */
export function updateApparitions(level: Level, apps: Record<string, AppState>, p: Player, dt: number) {
  const events: AppEvent[] = []
  let dread = 0
  let push: { x: number; y: number; k: number } | null = null

  for (const def of level.apparitions) {
    const st = apps[def.id]
    if (st.phase === 'gone') continue
    st.t += dt
    const dist = Math.hypot(st.x - p.x, st.y - p.y)

    if (st.phase === 'idle') {
      const visible = inView(level, p.x, p.y, p.a, st.x, st.y)
      if (def.kind === 'guard' && visible && dist < GUARD_TRIGGER && dist > GUARD_VANISH + 0.3) {
        st.phase = 'in'; st.t = 0; events.push('scare')
      } else if (def.kind === 'glimpse' && visible && dist > GLIMPSE_MIN && dist < GLIMPSE_MAX) {
        st.phase = 'in'; st.t = 0; events.push('glimpse')
      }
      continue
    }

    if (def.kind === 'guard') {
      if (st.phase === 'in') {
        st.alpha = Math.min(1, st.t / 0.25)
        if (dist < GUARD_VANISH) { st.phase = 'vanish'; st.t = 0; events.push('vanish') }
        else if (dist > GUARD_RETREAT || st.t > GUARD_MAX_LIFE) { st.phase = 'fade'; st.t = 0 }
      } else {
        // même en train de s'effacer, elle s'évanouit d'un coup si on approche
        if (st.phase === 'fade' && dist < GUARD_VANISH) { st.phase = 'vanish'; st.t = 0; events.push('vanish') }
        const duration = st.phase === 'vanish' ? 0.1 : 0.8
        st.alpha = Math.min(st.alpha, Math.max(0, 1 - st.t / duration))
        if (st.alpha <= 0) { st.alpha = 0; st.phase = 'gone' }
      }
      const near = Math.max(0, Math.min(1, (4.5 - dist) / 3))
      const d = st.alpha * near
      if (d > dread) dread = d
      // l'air reste épais tant qu'elle n'a pas complètement disparu
      if ((st.phase === 'in' || st.phase === 'vanish') && d > 0) push = { x: st.x, y: st.y, k: d }
    } else {
      // glimpse : se dérobe aussitôt, puis s'efface. Jamais vers le joueur :
      // si la direction prévue la rapprocherait, elle recule droit devant lui.
      const ax = (st.x - p.x) / (dist || 1), ay = (st.y - p.y) / (dist || 1)
      const [mx, my] = def.dx * ax + def.dy * ay >= 0 ? [def.dx, def.dy] : [ax, ay]
      st.x += mx * GLIMPSE_SPEED * dt
      st.y += my * GLIMPSE_SPEED * dt
      st.alpha = st.t < 0.5 ? 1 : Math.max(0, 1 - (st.t - 0.5) / 0.4)
      if (st.alpha <= 0) st.phase = 'gone'
      dread = Math.max(dread, st.alpha * 0.35)
    }

    if (st.alpha > 0 && Math.hypot(st.x - p.x, st.y - p.y) < SAFETY) { st.alpha = 0; st.phase = 'gone' }
  }
  return { events, dread, push }
}

/** Silhouette visible la plus proche du joueur (d = Infinity si aucune) */
export function closestVisible(apps: Record<string, AppState>, p: Player) {
  let best = { d: Infinity, id: '' }
  for (const [id, st] of Object.entries(apps)) {
    const d = Math.hypot(st.x - p.x, st.y - p.y)
    if (st.alpha > 0 && d < best.d) best = { d, id }
  }
  return best
}
