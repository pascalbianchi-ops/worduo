// Textures et sprites générés en code (aucune image externe).
// Pixels packés en Uint32 au format de ImageData sur machine little-endian :
// 0xAABBGGRR. La valeur 0 = transparent (sprites uniquement).
import type { ItemId } from './types'

export const TEX = 64 // murs
export const FTEX = 32 // sol / plafond
export const STEX = 32 // sprites

export function rgb(r: number, g: number, b: number): number {
  return (0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r)) >>> 0
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeTex(size: number, fn: (x: number, y: number) => [number, number, number]) {
  const t = new Uint32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b] = fn(x, y)
    t[y * size + x] = rgb(r, g, b)
  }
  return t
}

// ————————— Papier peint orange des Backrooms —————————
function wallpaper(seed: number, extra?: (x: number, y: number) => number) {
  const rand = mulberry32(seed)
  const stains = Array.from({ length: 3 }, () => ({ x: rand() * TEX, y: rand() * TEX * 0.8, r: 4 + rand() * 9 }))
  const noise = Array.from({ length: TEX * TEX }, () => rand())
  return makeTex(TEX, (x, y) => {
    // plinthe
    if (y >= 58) return y === 58 ? [70, 45, 20] : [112, 78, 38]
    let f = 1
    if (x % 16 < 2) f *= 0.88 // rayures verticales
    const dx = (x % 16) - 8, dy = (y % 16) - 8
    if (Math.abs(dx) + Math.abs(dy) === 4) f *= 0.86 // motif en losange
    f *= 0.93 + noise[y * TEX + x] * 0.1
    for (const s of stains) {
      const d = Math.hypot(x - s.x, (y - s.y) * 0.7)
      if (d < s.r) f *= 0.82 + (d / s.r) * 0.18
    }
    if (y < 3) f *= 0.85
    if (extra) f *= extra(x, y)
    return [220 * f, 158 * f, 64 * f]
  })
}

/** Texture murale + masque des pixels lumineux (insensibles au brouillard) */
export type WallTex = { tex: Uint32Array; glow: Uint8Array | null }

function fill(t: Uint32Array, x: number, y: number, w: number, h: number, c: number, glow?: Uint8Array) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (i < 0 || j < 0 || i >= TEX || j >= TEX) continue
    t[j * TEX + i] = c
    if (glow) glow[j * TEX + i] = 1
  }
}

// Porte grise ordinaire, dans un chambranle sombre
function doorTexture(): WallTex {
  const t = wallpaper(71)
  const rand = mulberry32(3)
  fill(t, 12, 4, 40, 55, rgb(62, 44, 26))
  for (let y = 7; y < 59; y++) for (let x = 15; x < 49; x++) {
    const f = 0.92 + rand() * 0.08
    t[y * TEX + x] = rgb(176 * f, 168 * f, 150 * f)
  }
  for (const [y0, y1] of [[11, 29], [35, 54]]) {
    fill(t, 19, y0, 26, 1, rgb(120, 114, 100)); fill(t, 19, y0, 1, y1 - y0, rgb(120, 114, 100))
    fill(t, 19, y1, 26, 1, rgb(205, 198, 182)); fill(t, 44, y0, 1, y1 - y0 + 1, rgb(205, 198, 182))
  }
  fill(t, 42, 31, 5, 3, rgb(60, 58, 54))
  fill(t, 42, 31, 5, 1, rgb(220, 214, 196))
  return { tex: t, glow: null }
}

// Échelle fixée au mur : deux montants, avec ou sans barreaux
function ladderTexture(rungs: boolean): WallTex {
  const t = wallpaper(83)
  const metal = rgb(150, 152, 160), shine = rgb(215, 218, 226), dark = rgb(70, 70, 78)
  for (const x of [16, 44]) {
    fill(t, x, 0, 4, 64, metal)
    fill(t, x + 1, 0, 1, 64, shine)
    fill(t, x + 3, 0, 1, 64, dark)
  }
  for (const y of [8, 30, 52]) { fill(t, 14, y, 2, 3, dark); fill(t, 48, y, 2, 3, dark) } // fixations
  if (rungs) for (let y = 4; y < 62; y += 8) { fill(t, 20, y, 24, 2, metal); fill(t, 20, y, 24, 1, shine) }
  return { tex: t, glow: null }
}

// Borne de défi : écran lumineux bleu (vert une fois réussie)
function borneTexture(solved: boolean): WallTex {
  const t = wallpaper(97)
  const glow = new Uint8Array(TEX * TEX)
  fill(t, 14, 6, 36, 53, rgb(48, 48, 56))
  fill(t, 14, 6, 36, 2, rgb(90, 90, 104))
  fill(t, 17, 11, 30, 24, rgb(18, 18, 24))
  const [r, g, b] = solved ? [70, 230, 120] : [70, 150, 255]
  for (let y = 13; y < 33; y++) for (let x = 19; x < 45; x++) {
    const f = y % 3 === 0 ? 0.7 : 1
    t[y * TEX + x] = rgb(r * f, g * f, b * f)
    glow[y * TEX + x] = 1
  }
  // symbole au centre de l'écran : point d'interrogation, ou coche si réussie
  const ink = rgb(235, 245, 255)
  if (solved) {
    for (let i = 0; i < 6; i++) fill(t, 25 + i, 22 + i, 2, 2, ink, glow)
    for (let i = 0; i < 10; i++) fill(t, 31 + i, 27 - i, 2, 2, ink, glow)
  } else {
    fill(t, 28, 16, 8, 2, ink, glow); fill(t, 34, 17, 2, 5, ink, glow); fill(t, 31, 22, 4, 2, ink, glow)
    fill(t, 31, 23, 2, 4, ink, glow); fill(t, 31, 29, 2, 2, ink, glow)
  }
  // clavier
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) fill(t, 20 + i * 7, 40 + j * 5, 4, 3, rgb(150, 146, 136))
  fill(t, 46, 40, 2, 13, rgb(30, 30, 36))
  return { tex: t, glow }
}

export const WALL_TEX = wallpaper(11)
export const PILLAR_TEX = wallpaper(23, (x) => (x < 4 || x > 59 ? 0.75 : 1))
export const DOOR_TEX = doorTexture()
export const LADDER_TEX = ladderTexture(false)
export const LADDER_FULL_TEX = ladderTexture(true)
export const BORNE_TEX = borneTexture(false)
export const BORNE_DONE_TEX = borneTexture(true)
/** Lumière blanche derrière la porte ouverte */
export const LIGHT_WALL_TEX: WallTex = { tex: makeTex(TEX, () => [255, 248, 228]), glow: new Uint8Array(TEX * TEX).fill(1) }

// ————————— Sol & plafond —————————
function floorTex(seed: number, color: (n: number, x: number, y: number) => [number, number, number]) {
  const rand = mulberry32(seed)
  return makeTex(FTEX, (x, y) => color(rand(), x, y))
}

export const CARPET_TEX = floorTex(5, (n, x, y) => {
  const f = 0.82 + n * 0.25 - ((x + y) % 4 === 0 ? 0.06 : 0)
  return [152 * f, 120 * f, 62 * f]
})

export const WET_TEX = floorTex(9, (n, x, y) => {
  const shine = Math.sin(x * 0.4 + y * 0.25) > 0.85 ? 1.35 : 1
  const f = (0.75 + n * 0.2) * shine
  return [78 * f, 92 * f, 104 * f]
})

export const CEIL_TEX = floorTex(13, (n, x, y) => {
  if (x === 0 || y === 0) return [130, 120, 92]
  const f = 0.92 + n * 0.08
  return [205 * f, 194 * f, 150 * f]
})

export const LIGHT_TEX = makeTex(FTEX, (x, y) => {
  if (x < 4 || x > 27 || y < 9 || y > 22) return [205, 194, 150]
  if (x === 4 || x === 27 || y === 9 || y === 22) return [170, 165, 140]
  return [255, 252, 225]
})

export const DEAD_LIGHT_TEX = makeTex(FTEX, (x, y) => {
  if (x < 4 || x > 27 || y < 9 || y > 22) return [120, 112, 88]
  return [70, 70, 66]
})

// ————————— Sprites —————————
type Painter = { px: (x: number, y: number, c: number) => void; rect: (x: number, y: number, w: number, h: number, c: number) => void; line: (x0: number, y0: number, x1: number, y1: number, c: number) => void }

function makeSprite(draw: (p: Painter) => void) {
  const t = new Uint32Array(STEX * STEX)
  const px = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < STEX && y < STEX) t[(y | 0) * STEX + (x | 0)] = c
  }
  const rect = (x: number, y: number, w: number, h: number, c: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c)
  }
  const line = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c)
  }
  draw({ px, rect, line })
  return t
}

function tvFrame(seed: number) {
  const rand = mulberry32(seed)
  return makeSprite(({ rect, line, px }) => {
    const wood = rgb(92, 62, 38), dark = rgb(48, 34, 22), knob = rgb(200, 190, 160), ant = rgb(60, 60, 60)
    line(14, 7, 8, 0, ant)
    line(17, 7, 24, 0, ant)
    rect(2, 7, 28, 20, wood)
    rect(2, 26, 28, 1, dark)
    rect(4, 9, 19, 15, dark)
    for (let y = 10; y < 23; y++) for (let x = 5; x < 22; x++) {
      const v = 60 + rand() * 190
      px(x, y, rgb(v, v, v * 1.05))
    }
    rect(25, 11, 3, 3, knob)
    rect(25, 17, 3, 3, knob)
    rect(5, 27, 3, 4, dark)
    rect(24, 27, 3, 4, dark)
  })
}

const burger = makeSprite(({ rect, px }) => {
  const bun = rgb(214, 140, 56), bunD = rgb(170, 100, 36), seed = rgb(250, 240, 200)
  rect(7, 10, 18, 2, bun); rect(5, 12, 22, 5, bun); rect(5, 16, 22, 1, bunD)
  for (const [x, y] of [[9, 12], [14, 11], [19, 12], [12, 14], [22, 14], [17, 14]]) px(x, y, seed)
  rect(4, 17, 24, 2, rgb(80, 190, 60)) // salade
  rect(5, 19, 22, 2, rgb(250, 200, 40)); px(9, 21, rgb(250, 200, 40)); px(20, 21, rgb(250, 200, 40)) // fromage
  rect(5, 21, 22, 4, rgb(100, 52, 30)) // steak
  rect(5, 25, 22, 4, bun); rect(6, 29, 20, 1, bunD)
})

const frites = makeSprite(({ rect, line }) => {
  const fry = rgb(250, 210, 70), fryD = rgb(215, 160, 40)
  for (const [x, top] of [[10, 6], [12, 4], [14, 7], [16, 3], [18, 6], [20, 5], [22, 8], [13, 9], [19, 9]]) {
    rect(x, top, 2, 22 - top, fry); line(x + 1, top, x + 1, 20, fryD)
  }
  const red = rgb(215, 35, 35), redD = rgb(150, 20, 20)
  for (let y = 15; y < 31; y++) { const k = Math.floor((y - 15) / 4); rect(8 + k, y, 16 - 2 * k, 1, red) }
  rect(12, 20, 8, 3, fry) // logo
  line(8, 15, 11, 30, redD)
})

const soda = makeSprite(({ rect, line }) => {
  const red = rgb(220, 30, 40), redD = rgb(150, 15, 25), white = rgb(250, 250, 250), grey = rgb(190, 192, 200)
  rect(10, 6, 12, 2, grey); rect(11, 5, 10, 1, grey)
  rect(10, 8, 12, 21, red); rect(10, 8, 2, 21, redD)
  line(11, 20, 15, 16, white); line(15, 16, 21, 18, white); line(11, 21, 15, 17, white)
  rect(13, 10, 2, 5, rgb(255, 120, 120))
  rect(10, 29, 12, 2, grey)
})

const bonbons = makeSprite(({ rect, px }) => {
  const candy = (x: number, y: number, c: number, d: number) => {
    rect(x + 3, y, 6, 6, c); rect(x + 4, y - 1, 4, 8, c); px(x + 4, y + 1, rgb(255, 255, 255))
    rect(x, y + 1, 3, 4, d); rect(x + 9, y + 1, 3, 4, d) // papillotes
  }
  candy(2, 24, rgb(240, 70, 160), rgb(250, 150, 210))
  candy(18, 24, rgb(60, 170, 250), rgb(150, 210, 255))
  candy(10, 18, rgb(250, 210, 40), rgb(255, 240, 150))
  // sucette
  rect(15, 6, 2, 12, rgb(240, 240, 240))
  rect(11, 0, 10, 8, rgb(230, 50, 80)); rect(13, 2, 6, 4, rgb(255, 255, 255)); rect(14, 3, 4, 2, rgb(230, 50, 80))
})

const donut = makeSprite(({ px }) => {
  const dough = rgb(205, 145, 75), icing = rgb(245, 120, 185)
  const sprinkles = [rgb(255, 255, 255), rgb(90, 200, 250), rgb(255, 230, 60), rgb(120, 220, 90)]
  for (let y = 12; y < 31; y++) for (let x = 3; x < 29; x++) {
    const dx = (x - 15.5) / 12.5, dy = (y - 21) / 9
    if (dx * dx + dy * dy > 1) continue
    if ((dx * dx) / 0.12 + (dy * dy) / 0.08 < 1) continue // trou
    px(x, y, dy < 0.25 ? ((x * 7 + y * 13) % 11 === 0 ? sprinkles[(x + y) % 4] : icing) : dough)
  }
})

function phoneFrame(on: number) {
  return makeSprite(({ rect }) => {
    rect(10, 3, 12, 28, rgb(30, 30, 36))
    rect(11, 5, 10, 22, rgb(40, 120, 220))
    const colors = [rgb(250, 80, 80), rgb(80, 220, 120), rgb(250, 210, 60), rgb(250, 140, 230), rgb(255, 255, 255), rgb(100, 220, 250)]
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) rect(12 + i * 3, 7 + j * 4, 2, 2, colors[(i + j * 3 + on) % colors.length])
    rect(11, 22, 10, 3, on % 2 ? rgb(255, 60, 60) : rgb(255, 255, 255)) // notification
    rect(14, 28, 4, 1, rgb(110, 110, 120))
  })
}

const manette = makeSprite(({ rect, px }) => {
  const body = rgb(55, 55, 66), light = rgb(95, 95, 110)
  rect(5, 16, 22, 8, body); rect(3, 18, 6, 10, body); rect(23, 18, 6, 10, body); rect(5, 16, 22, 1, light)
  rect(6, 19, 5, 1, rgb(200, 200, 210)); rect(8, 17, 1, 5, rgb(200, 200, 210)) // croix
  px(22, 18, rgb(240, 70, 70)); px(24, 20, rgb(70, 200, 90)); px(20, 20, rgb(70, 140, 250)); px(22, 22, rgb(250, 210, 60))
  rect(12, 21, 3, 3, rgb(30, 30, 36)); rect(17, 21, 3, 3, rgb(30, 30, 36))
})

const consoleSprite = makeSprite(({ rect, px }) => {
  const body = rgb(196, 196, 186), dark = rgb(120, 118, 112)
  rect(9, 3, 14, 28, body); rect(22, 3, 1, 28, dark); rect(9, 30, 14, 1, dark)
  rect(10, 5, 12, 11, rgb(80, 80, 96))
  rect(12, 6, 8, 8, rgb(150, 190, 60)); rect(13, 9, 3, 2, rgb(60, 100, 40)); rect(17, 8, 2, 4, rgb(60, 100, 40))
  rect(11, 20, 5, 1, rgb(40, 40, 46)); rect(13, 18, 1, 5, rgb(40, 40, 46))
  rect(18, 21, 2, 2, rgb(170, 30, 80)); rect(20, 19, 2, 2, rgb(170, 30, 80))
  px(14, 26, dark); px(16, 26, dark)
})

export const SPRITES: Record<ItemId, Uint32Array[]> = {
  burger: [burger],
  frites: [frites],
  soda: [soda],
  bonbons: [bonbons],
  donut: [donut],
  tele: [tvFrame(1), tvFrame(2), tvFrame(3), tvFrame(4)],
  telephone: [phoneFrame(0), phoneFrame(1), phoneFrame(2), phoneFrame(3)],
  manette: [manette],
  console: [consoleSprite],
}

/** Hauteur à l'écran (fraction d'un mur) */
export const SPRITE_SCALE: Record<ItemId, number> = {
  burger: 0.42, frites: 0.42, soda: 0.4, bonbons: 0.42, donut: 0.4, tele: 0.6, telephone: 0.4, manette: 0.42, console: 0.42,
}


// ————————— Silhouette sombre —————————
// Corps presque noir aux membres trop longs, deux yeux pâles. Trois images
// légèrement différentes pour un tressaillement inquiétant.
function shadowFrame(variant: number) {
  return makeSprite(({ rect, line, px }) => {
    const body = rgb(10, 8, 8), edge = rgb(26, 20, 18), eye = rgb(235, 228, 205)
    const hx = 16 + (variant === 1 ? 1 : 0) // tête qui penche
    rect(hx - 3, 1, 6, 7, body)
    px(hx - 3, 1, 0); px(hx + 2, 1, 0) // tête arrondie
    rect(15, 8, 2, 2, body) // cou
    rect(10, 10, 12, 3, body) // épaules
    rect(11, 13, 10, 8, body) // torse qui s'amincit
    rect(12, 21, 8, 3, body)
    // bras trop longs, jusqu'aux genoux
    const sway = variant === 2 ? 1 : 0
    line(10, 11, 8 - sway, 27, body); line(11, 11, 9 - sway, 27, body)
    line(21, 11, 23 + sway, 27, body); line(20, 11, 22 + sway, 27, body)
    px(7 - sway, 28, edge); px(24 + sway, 28, edge) // doigts
    // jambes
    rect(13, 24, 2, 8, body); rect(17, 24, 2, 8, body)
    // contour un peu moins noir pour la lisibilité sur fond sombre
    line(10, 10, 21, 10, edge)
    // yeux
    px(hx - 2, 4, eye); px(hx + 1, 4, eye)
    if (variant === 2) { px(hx - 2, 5, eye); px(hx + 1, 5, eye) }
  })
}

export const SHADOW_FRAMES = [shadowFrame(0), shadowFrame(1), shadowFrame(0), shadowFrame(2)]
export const SHADOW_SCALE = 0.95
