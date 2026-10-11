// Logique du mini-jeu (indépendante du rendu et de React).
import type { Level, ItemId } from './types'
import { ITEM_LABEL } from './types'

export type Input = { up: boolean; down: boolean; left: boolean; right: boolean }

export type GameState = {
  x: number
  y: number
  a: number
  found: ItemId[]
  /** Texte affiché en boîte de dialogue ; bloque les déplacements jusqu'à A */
  message: string | null
  /** Action disponible avec A, affichée en bas de l'écran */
  prompt: string | null
  done: boolean
}

const MOVE_SPEED = 2.2 // cases / s
const TURN_SPEED = 2.4 // rad / s
const RADIUS = 0.22
const PICK_RANGE = 0.9
const READ_RANGE = 1.6

export function newGame(level: Level): GameState {
  return { ...level.start, found: [], message: null, prompt: null, done: false }
}

function solid(level: Level, x: number, y: number) {
  const cx = Math.floor(x), cy = Math.floor(y)
  if (cx < 0 || cy < 0 || cx >= level.w || cy >= level.h) return true
  return level.walls[cy * level.w + cx] !== 'none'
}

function blocked(level: Level, x: number, y: number) {
  return solid(level, x - RADIUS, y - RADIUS) || solid(level, x + RADIUS, y - RADIUS)
    || solid(level, x - RADIUS, y + RADIUS) || solid(level, x + RADIUS, y + RADIUS)
}

/** Mur à indice situé droit devant, à portée de lecture */
function facingClue(level: Level, s: GameState) {
  const dx = Math.cos(s.a), dy = Math.sin(s.a)
  for (let d = 0; d <= READ_RANGE; d += 0.05) {
    const cx = Math.floor(s.x + dx * d), cy = Math.floor(s.y + dy * d)
    const idx = cy * level.w + cx
    if (level.walls[idx] === 'clue') return level.clues.find((c) => c.id === level.clueAt[idx]) ?? null
    if (level.walls[idx] !== 'none') return null
  }
  return null
}

function nearItem(level: Level, s: GameState) {
  return level.items.find((it) => !s.found.includes(it.id) && Math.hypot(it.x - s.x, it.y - s.y) < PICK_RANGE) ?? null
}

export function update(level: Level, s: GameState, input: Input, dt: number) {
  if (s.done) return
  if (!s.message) {
    const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    s.a += turn * TURN_SPEED * dt
    s.a = ((s.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const move = (input.up ? 1 : 0) - (input.down ? 1 : 0)
    if (move) {
      const step = move * MOVE_SPEED * dt
      const nx = s.x + Math.cos(s.a) * step
      const ny = s.y + Math.sin(s.a) * step
      // glissement le long des murs : on tente chaque axe séparément
      if (!blocked(level, nx, s.y)) s.x = nx
      if (!blocked(level, s.x, ny)) s.y = ny
    }
  }
  const item = nearItem(level, s)
  s.prompt = s.message ? null
    : item ? `A : ramasser la ${ITEM_LABEL[item.id]}`
    : facingClue(level, s) ? 'A : lire le mur'
    : null
}

export function action(level: Level, s: GameState) {
  if (s.done) return
  if (s.message) { s.message = null; return }
  const item = nearItem(level, s)
  if (item) {
    s.found.push(item.id)
    const n = s.found.length, total = level.items.length
    if (n >= total) { s.done = true; s.prompt = null }
    else s.message = `Tu as trouvé la ${ITEM_LABEL[item.id]} ! (${n}/${total})`
    return
  }
  const clue = facingClue(level, s)
  if (clue) s.message = clue.text
}
