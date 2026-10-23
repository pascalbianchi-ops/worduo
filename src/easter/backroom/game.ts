// Logique du mini-jeu (indépendante du rendu et de React).
//
// Deux jauges : la dopamine baisse en continu (à zéro, la partie est perdue) ;
// l'effort s'allume au premier défi réussi et seul lui ouvre la sortie.
import type { Level, ItemId, ItemSpec, ChallengeId } from './types'
import { loadLevel } from './levels'
import { initApparitions, updateApparitions, closestVisible, type AppState, type AppEvent } from './apparitions'

export type Input = { up: boolean; down: boolean; left: boolean; right: boolean }

/** Sons (facultatifs : chaque événement a aussi son retour visuel) */
export type GameEvent = AppEvent | 'eat' | 'refuse' | 'success' | 'open' | 'nibble' | 'pop'

export type ItemState = {
  spec: ItemSpec
  x: number
  y: number
  /** hidden : pas encore là · idle : immobile · active : glisse vers le joueur · gone : consommé */
  state: 'hidden' | 'idle' | 'active' | 'gone'
  /** secondes depuis l'apparition (éclat lumineux) */
  since: number
  /** secondes sans voir le joueur (un objet qui le perd de vue s'arrête) */
  lost: number
}

export type GateState = 'closed' | 'pending' | 'open'

export type GameState = {
  level: Level
  x: number
  y: number
  a: number
  time: number
  /** 0..1 */
  dopamine: number
  /** 0..1 ; ne dépasse jamais (bornes réussies / bornes du niveau) */
  effort: number
  effortLit: boolean
  solved: number[]
  /** nombre d'objets consommés : chaque objet rapporte moins que le précédent */
  habit: number
  /** Action disponible avec A, affichée en bas de l'écran */
  prompt: string | null
  /** défi en cours (fenêtre par-dessus le labyrinthe), bloque les déplacements */
  challenge: { borne: number; id: ChallengeId } | null
  /** play → leaving (sortie franchie, animation) → cleared ; ou dead */
  status: 'play' | 'leaving' | 'cleared' | 'dead'
  /** secondes depuis le début de la sortie */
  leavingT: number
  exitAttempts: number
  /** plus haute dopamine depuis le dernier essai à la sortie (« il est remonté à ~90 % ») */
  peakSinceAttempt: number
  /** secondes depuis le dernier refus de la sortie (porte qui tremble, dopamine barrée) */
  sinceRefused: number
  doorOpen: boolean
  /** barreaux de l'échelle apparus */
  rungs: boolean
  gates: Record<string, GateState>
  /** instant et position à l'ouverture du passage secret (vérifié par les tests) */
  secretLog: { x: number; y: number; a: number; dopamine: number; attempts: number; time: number } | null
  items: ItemState[]
  sinceEat: number
  sinceNibble: number
  sinceEffort: number
  /** secondes depuis l'ouverture de la zone (grondement) */
  sinceOpened: number
  /** plus haute dopamine atteinte juste après un objet (doit rester ≤ 90 %) */
  maxAfterItem: number
  apps: Record<string, AppState>
  /** Malaise 0..1 provoqué par les silhouettes (effets visuels et sonores) */
  dread: number
  sinceScare: number
  sinceAppear: number
  events: GameEvent[]
  closest: number
  closestId: string
}

// ————————— Équilibrage —————————
export const BALANCE = {
  /** baisse de dopamine par seconde (1/45 : 45 s pour vider une jauge pleine) */
  decay: { 1: 1 / 45, 2: 1 / 60 } as Record<1 | 2, number>,
  /** pendant un défi, la baisse est ralentie */
  challengeFactor: 0.3,
  /** jauge d'effort allumée : la baisse est fortement freinée */
  effortBrake: 0.25,
  /** gain du premier objet, puis × habit à chaque objet suivant (accoutumance) */
  gain: 0.24,
  habit: 0.94,
  /** les objets ne font jamais dépasser ce seuil */
  cap: 0.9,
  /** défi réussi : petit gain de fierté (plafonné aussi) */
  pride: 0.12,
  /** niveau 2 : un objet consommé au contact grignote l'effort */
  nibble: 0.06,
  /** passage secret : au 2e échec à la porte, si la dopamine a atteint ce seuil depuis l'essai précédent (ou au 4e échec, quoi qu'il arrive) */
  secretDopamine: 0.85,
}

const MOVE_SPEED = 2.2 // cases / s
const TURN_SPEED = 2.4 // rad / s
const RADIUS = 0.22
const PICK_RANGE = 0.9
const USE_RANGE = 1.6
const CONTACT = 0.45
const CHASE_RANGE = 4.5
const CHASE_SPEED = 1.0
const AMBUSH_RANGE = 3.2
/** un objet ne s'éloigne jamais de plus de ça de sa place : on peut l'éviter en faisant un détour */
const LEASH = 3
/** demi-champ de vision du rendu (atan 0.66) + marge, pour ouvrir les passages hors champ */
const HIDE_FOV = 0.58 + 0.2
export const LEAVE_TIME = 2.2

export const ITEM_LABEL: Record<ItemId, string> = {
  burger: 'le burger', frites: 'les frites', soda: 'le soda', bonbons: 'les bonbons', donut: 'le donut',
  tele: 'la télé', telephone: 'le téléphone', manette: 'la manette', console: 'la console',
}

export function newGame(num: 1 | 2): GameState {
  const level = loadLevel(num)
  return {
    level, ...level.start, time: 0,
    dopamine: 1, effort: 0, effortLit: false, solved: [], habit: 0,
    prompt: null, challenge: null, status: 'play', leavingT: 0,
    exitAttempts: 0, peakSinceAttempt: 1, sinceRefused: Infinity, doorOpen: false, rungs: false,
    gates: Object.fromEntries(level.gates.map((g) => [g.id, 'closed' as GateState])), secretLog: null,
    items: level.items.map((spec) => ({ spec, x: spec.x, y: spec.y, state: spec.hidden || spec.behavior === 'ambush' ? 'hidden' : 'idle', since: Infinity, lost: 0 })),
    sinceEat: Infinity, sinceNibble: Infinity, sinceEffort: Infinity, sinceOpened: Infinity, maxAfterItem: 0,
    apps: initApparitions(level), dread: 0, sinceScare: Infinity, sinceAppear: Infinity, events: [], closest: Infinity, closestId: '',
  }
}

const cellAt = (level: Level, x: number, y: number) => Math.floor(y) * level.w + Math.floor(x)

function solid(level: Level, x: number, y: number) {
  const cx = Math.floor(x), cy = Math.floor(y)
  if (cx < 0 || cy < 0 || cx >= level.w || cy >= level.h) return true
  return level.walls[cy * level.w + cx] !== 'none'
}

function blocked(level: Level, x: number, y: number, r = RADIUS) {
  return solid(level, x - r, y - r) || solid(level, x + r, y - r) || solid(level, x - r, y + r) || solid(level, x + r, y + r)
}

/** Aucun mur entre deux points (la case `except` est ignorée) */
function lineOfSight(level: Level, x0: number, y0: number, x1: number, y1: number, except = -1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.08)
  for (let i = 1; i < n; i++) {
    const idx = cellAt(level, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n)
    if (idx !== except && level.walls[idx] !== 'none') return false
  }
  return true
}

const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Une case murale est-elle (même en partie) à l'écran ? */
export function cellInView(level: Level, p: { x: number; y: number; a: number }, idx: number) {
  const cx = idx % level.w, cy = Math.floor(idx / level.w)
  const pts: [number, number][] = [[cx + 0.5, cy + 0.5], [cx + 0.02, cy + 0.02], [cx + 0.98, cy + 0.02], [cx + 0.02, cy + 0.98], [cx + 0.98, cy + 0.98]]
  return pts.some(([x, y]) => Math.abs(norm(Math.atan2(y - p.y, x - p.x) - p.a)) < HIDE_FOV && lineOfSight(level, p.x, p.y, x, y, idx))
}

/** Mur spécial (borne, porte, échelle) droit devant, à portée */
function facing(level: Level, s: GameState) {
  const dx = Math.cos(s.a), dy = Math.sin(s.a)
  for (let d = 0; d <= USE_RANGE; d += 0.05) {
    const idx = cellAt(level, s.x + dx * d, s.y + dy * d)
    const k = level.walls[idx]
    if (k === 'none') continue
    if (k === 'borne') return { kind: 'borne' as const, borne: level.bornes.find((b) => b.num === level.borneAt[idx])! }
    if (k === 'door' || k === 'ladder') return { kind: 'exit' as const }
    return null
  }
  return null
}

function nearItem(s: GameState) {
  return s.items.find((it) => it.state !== 'hidden' && it.state !== 'gone' && it.spec.behavior === 'still' && Math.hypot(it.x - s.x, it.y - s.y) < PICK_RANGE) ?? null
}

function consume(s: GameState, it: ItemState) {
  it.state = 'gone'
  const gain = BALANCE.gain * BALANCE.habit ** s.habit
  s.habit++
  if (s.dopamine < BALANCE.cap) {
    s.dopamine = Math.min(BALANCE.cap, s.dopamine + gain)
    s.maxAfterItem = Math.max(s.maxAfterItem, s.dopamine)
  }
  s.sinceEat = 0
  s.events.push('eat')
  if (it.spec.behavior !== 'still') {
    // niveau 2 : la facilité grignote l'effort
    if (s.effort > 0) { s.effort = Math.max(0, s.effort - BALANCE.nibble); s.sinceNibble = 0; s.events.push('nibble') }
  }
}

function moveItem(level: Level, it: ItemState, tx: number, ty: number, speed: number, dt: number) {
  const d = Math.hypot(tx - it.x, ty - it.y) || 1
  const nx = it.x + ((tx - it.x) / d) * speed * dt, ny = it.y + ((ty - it.y) / d) * speed * dt
  if (!blocked(level, nx, it.y, 0.2)) it.x = nx
  if (!blocked(level, it.x, ny, 0.2)) it.y = ny
}

function updateItems(s: GameState, dt: number) {
  const level = s.level
  for (const it of s.items) {
    if (it.state === 'gone') continue
    it.since += dt
    const dist = Math.hypot(it.x - s.x, it.y - s.y)
    const { behavior } = it.spec
    if (behavior === 'still') continue
    const sees = dist < CHASE_RANGE && lineOfSight(level, it.x, it.y, s.x, s.y)
    if (it.state === 'hidden') {
      // surgit droit devant, sur le chemin du joueur
      const ahead = Math.abs(norm(Math.atan2(it.y - s.y, it.x - s.x) - s.a)) < 0.6
      if (dist < AMBUSH_RANGE && ahead && sees) { it.state = 'active'; it.since = 0; s.events.push('pop') }
      continue
    }
    // l'embuscade surgit puis reste sur place : un pas de côté suffit à l'éviter
    if (behavior === 'chase' && it.state === 'idle' && sees) it.state = 'active'
    if (behavior === 'chase' && it.state === 'active') {
      it.lost = sees ? 0 : it.lost + dt
      if (it.lost > 2) it.state = 'idle'
      else {
        const px = it.x, py = it.y
        moveItem(level, it, s.x, s.y, CHASE_SPEED, dt)
        if (Math.hypot(it.x - it.spec.x, it.y - it.spec.y) > LEASH) { it.x = px; it.y = py }
      }
    }
    // hors de vue, il regagne lentement sa place
    if (it.state === 'idle' && Math.hypot(it.x - it.spec.x, it.y - it.spec.y) > 0.1) moveItem(level, it, it.spec.x, it.spec.y, CHASE_SPEED * 0.5, dt)
    if (Math.hypot(it.x - s.x, it.y - s.y) < CONTACT) consume(s, it)
  }
}

function openGate(s: GameState, id: string) {
  const gate = s.level.gates.find((g) => g.id === id)
  if (!gate) return
  for (const idx of gate.cells) s.level.walls[idx] = 'none'
  s.gates[id] = 'open'
  if (id === 'secret') {
    // la télé de diversion arrive en même temps, bien voyante
    for (const it of s.items) if (it.spec.hidden && it.state === 'hidden') { it.state = 'idle'; it.since = 0 }
    s.secretLog = { x: s.x, y: s.y, a: s.a, dopamine: s.dopamine, attempts: s.exitAttempts, time: s.time }
  }
}

/** Le passage secret en attente ne s'ouvre que lorsqu'aucune de ses cases n'est à l'écran */
function updateGates(s: GameState) {
  for (const g of s.level.gates) {
    if (s.gates[g.id] !== 'pending') continue
    if (!g.cells.some((idx) => cellInView(s.level, s, idx))) openGate(s, g.id)
  }
}

export function update(s: GameState, input: Input, dt: number) {
  if (s.status === 'dead' || s.status === 'cleared') return
  s.time += dt
  s.sinceRefused += dt
  s.sinceEat += dt
  s.sinceNibble += dt
  s.sinceEffort += dt
  s.sinceOpened += dt
  s.sinceScare += dt
  s.sinceAppear += dt
  if (s.status === 'leaving') {
    s.leavingT += dt
    if (s.leavingT >= LEAVE_TIME) s.status = 'cleared'
    return
  }
  const level = s.level

  // la dopamine baisse, moins vite pendant un défi, et bien moins avec l'effort
  const rate = BALANCE.decay[level.num] * (s.challenge ? BALANCE.challengeFactor : 1) * (s.effortLit ? BALANCE.effortBrake : 1)
  s.dopamine = Math.max(0, s.dopamine - rate * dt)
  s.peakSinceAttempt = Math.max(s.peakSinceAttempt, s.dopamine)
  if (s.dopamine <= 0) { s.status = 'dead'; s.challenge = null; s.prompt = null; return }

  const fx = updateApparitions(level, s.apps, s, dt)
  if (fx.events.includes('scare')) s.sinceScare = 0
  if (fx.events.includes('appear')) s.sinceAppear = 0
  s.events.push(...fx.events)
  s.dread = fx.dread

  if (!s.challenge) {
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
    // les objets attendent pendant un défi
    updateItems(s, dt)
  }
  updateGates(s)

  if (level.beyond && s.doorOpen && Math.floor(s.x) === level.beyond.x && Math.floor(s.y) === level.beyond.y) {
    s.status = 'leaving'; s.leavingT = 0; s.prompt = null; return
  }

  const near = closestVisible(s.apps, s)
  if (near.d < s.closest) { s.closest = near.d; s.closestId = near.id }
  const item = nearItem(s)
  const f = facing(level, s)
  s.prompt = s.challenge ? null
    : item ? `A : prendre ${ITEM_LABEL[item.spec.kind]}`
    : f?.kind === 'borne' ? 'A : utiliser la borne'
    : f?.kind === 'exit' ? (level.exit.kind === 'door' ? 'A : ouvrir la porte' : 'A : monter')
    : null
}

const effortFull = (s: GameState) => s.effort >= 1 - 1e-6

function tryExit(s: GameState) {
  s.exitAttempts++
  if (effortFull(s)) {
    s.events.push('open')
    if (s.level.exit.kind === 'door') {
      s.doorOpen = true
      s.level.walls[s.level.exit.y * s.level.w + s.level.exit.x] = 'none'
    } else {
      // tous les barreaux d'un coup, puis la montée
      s.rungs = true
      s.status = 'leaving'
      s.leavingT = 0
      s.prompt = null
    }
    return
  }
  s.sinceRefused = 0
  s.events.push('refuse')
  const peak = s.peakSinceAttempt
  s.peakSinceAttempt = s.dopamine
  if (s.level.num === 1 && s.gates.secret === 'closed'
    && s.exitAttempts >= 2 && (peak >= BALANCE.secretDopamine - 1e-6 || s.exitAttempts >= 4)) {
    s.gates.secret = 'pending'
    updateGates(s)
  }
}

export function action(s: GameState) {
  if (s.status !== 'play' || s.challenge) return
  const item = nearItem(s)
  if (item) { consume(s, item); return }
  const f = facing(s.level, s)
  if (f?.kind === 'exit' && !s.doorOpen) tryExit(s)
  else if (f?.kind === 'borne') s.challenge = { borne: f.borne.num, id: f.borne.challenge }
}

/** Fin d'un défi : réussi (true) ou abandonné (false) */
export function endChallenge(s: GameState, success: boolean) {
  const c = s.challenge
  if (!c) return
  s.challenge = null
  if (!success) return
  if (!s.solved.includes(c.borne)) s.solved.push(c.borne)
  const n = s.level.bornes.length
  // une borne déjà réussie peut être rejouée pour regagner l'effort grignoté,
  // jamais pour dépasser ce que les bornes réussies valent
  s.effort = Math.min(s.solved.length / n, s.effort + 1 / n)
  s.effortLit = true
  s.sinceEffort = 0
  if (s.dopamine < BALANCE.cap) s.dopamine = Math.min(BALANCE.cap, s.dopamine + BALANCE.pride)
  s.events.push('success')
  // l'effort ouvre la zone suivante, sous les yeux du joueur (secousse)
  if (s.gates.zone === 'closed') { openGate(s, 'zone'); s.sinceOpened = 0; s.events.push('open') }
}
