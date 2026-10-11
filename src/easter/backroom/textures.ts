// Textures et sprites générés en code (aucune image externe).
// Pixels packés en Uint32 au format de ImageData sur machine little-endian :
// 0xAABBGGRR. La valeur 0 = transparent (sprites uniquement).

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

const QUESTION = [
  '.###.',
  '#...#',
  '....#',
  '...#.',
  '..#..',
  '.....',
  '..#..',
]

function clueTexture(seed: number) {
  const base = wallpaper(seed)
  const rand = mulberry32(seed * 7)
  const red = () => rgb(150 + rand() * 40, 18, 16)
  // gros point d'interrogation griffonné au centre
  const sx = 21, sy = 10, k = 4
  QUESTION.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] !== '#') continue
      for (let py = 0; py < k; py++) for (let px = 0; px < k; px++) {
        if (rand() < 0.15) continue
        base[(sy + gy * k + py) * TEX + sx + gx * k + px] = red()
      }
    }
  })
  // coulures
  for (let i = 0; i < 5; i++) {
    const x = sx + 2 + Math.floor(rand() * 18)
    const len = 4 + Math.floor(rand() * 14)
    for (let y = sy + 28; y < Math.min(56, sy + 28 + len); y++) base[y * TEX + x] = red()
  }
  // traits griffonnés en bas
  for (let x = 10; x < 54; x++) {
    const y = 48 + Math.round(Math.sin(x * 0.7) * 2)
    if (rand() > 0.2) base[y * TEX + x] = red()
  }
  return base
}

export const WALL_TEX = wallpaper(11)
export const PILLAR_TEX = wallpaper(23, (x) => (x < 4 || x > 59 ? 0.75 : 1))
export const CLUE_TEX: Record<number, Uint32Array> = { 1: clueTexture(31), 2: clueTexture(47), 3: clueTexture(59) }

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

const brosse = makeSprite(({ rect, px }) => {
  const blue = rgb(40, 110, 225), dark = rgb(25, 70, 160), white = rgb(245, 245, 250)
  rect(14, 9, 4, 23, blue)
  rect(14, 9, 1, 23, dark)
  rect(14, 4, 4, 6, blue)
  rect(18, 3, 3, 8, white) // poils
  for (let y = 3; y < 11; y += 2) px(21, y, white)
  px(16, 20, rgb(255, 255, 255))
})

const casserole = makeSprite(({ rect, line }) => {
  const metal = rgb(168, 170, 182), shine = rgb(225, 228, 235), shadow = rgb(105, 108, 120), black = rgb(25, 22, 22)
  rect(4, 18, 18, 11, metal)
  rect(4, 18, 18, 2, shine)
  rect(4, 27, 18, 2, shadow)
  rect(6, 21, 2, 5, shine)
  rect(22, 20, 9, 3, black)
  line(3, 18, 22, 18, shadow)
})

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

export const SPRITES: Record<'brosse' | 'casserole' | 'tele', Uint32Array[]> = {
  brosse: [brosse],
  casserole: [casserole],
  tele: [tvFrame(1), tvFrame(2), tvFrame(3), tvFrame(4)],
}

/** Hauteur à l'écran (fraction d'un mur) */
export const SPRITE_SCALE: Record<'brosse' | 'casserole' | 'tele', number> = {
  brosse: 0.42,
  casserole: 0.4,
  tele: 0.6,
}
