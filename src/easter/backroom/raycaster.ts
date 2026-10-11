// Rendu raycasting façon Wolfenstein dans un tampon de pixels basse résolution.
import type { Level, ItemId } from './types'
import {
  TEX, FTEX, STEX, WALL_TEX, PILLAR_TEX, CLUE_TEX, CARPET_TEX, WET_TEX, CEIL_TEX, LIGHT_TEX, DEAD_LIGHT_TEX,
  SPRITES, SPRITE_SCALE,
} from './textures'

export type Camera = { x: number; y: number; a: number }
export type Frame = { w: number; h: number; buf: Uint32Array; zbuf: Float32Array }

const FOV_PLANE = 0.66

function shade(c: number, f: number): number {
  if (f >= 1) return c
  const r = (c & 0xff) * f, g = ((c >>> 8) & 0xff) * f, b = ((c >>> 16) & 0xff) * f
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
}

function fog(d: number) {
  const f = 1 / (1 + d * d * 0.045)
  return f < 0.12 ? 0.12 : f
}

const DARK_FACTOR = 0.32

export function renderFrame(frame: Frame, level: Level, cam: Camera, items: { id: ItemId; x: number; y: number }[], time: number) {
  const { w: W, h: H, buf, zbuf } = frame
  const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a)
  const planeX = -dirY * FOV_PLANE, planeY = dirX * FOV_PLANE
  // néons qui grésillent : léger scintillement global, avec de rares chutes
  const flick = Math.sin(time * 37) > 0.97 ? 0.82 : 0.97 + Math.sin(time * 5.3) * 0.03
  const half = H / 2

  // ——— Sol et plafond ———
  const rdx0 = dirX - planeX, rdy0 = dirY - planeY
  const rdx1 = dirX + planeX, rdy1 = dirY + planeY
  for (let y = Math.ceil(half); y < H; y++) {
    const p = y - half + 0.5
    const rowDist = half / p
    const stepX = (rowDist * (rdx1 - rdx0)) / W
    const stepY = (rowDist * (rdy1 - rdy0)) / W
    let fx = cam.x + rowDist * rdx0
    let fy = cam.y + rowDist * rdy0
    const light = fog(rowDist) * flick
    const ceilRow = (H - 1 - y) * W
    const floorRow = y * W
    for (let x = 0; x < W; x++) {
      const cx = Math.floor(fx), cy = Math.floor(fy)
      const tx = ((fx - cx) * FTEX) | 0, ty = ((fy - cy) * FTEX) | 0
      const t = ty * FTEX + tx
      const inside = cx >= 0 && cy >= 0 && cx < level.w && cy < level.h
      const kind = inside ? level.floors[cy * level.w + cx] : 'normal'
      const dark = kind === 'dark'
      const lamp = inside && cx % 3 === 1 && cy % 2 === 1 // une dalle-néon sur six
      const fl = dark ? light * DARK_FACTOR : light
      buf[floorRow + x] = shade(kind === 'wet' ? WET_TEX[t] : CARPET_TEX[t], fl)
      const ceil = lamp ? (dark ? DEAD_LIGHT_TEX[t] : LIGHT_TEX[t]) : CEIL_TEX[t]
      buf[ceilRow + x] = shade(ceil, lamp && !dark ? Math.min(1, fl * 1.6) : fl)
      fx += stepX
      fy += stepY
    }
  }

  // ——— Murs (DDA) ———
  for (let x = 0; x < W; x++) {
    const camX = (2 * x) / W - 1
    const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX
    let mapX = Math.floor(cam.x), mapY = Math.floor(cam.y)
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx)
    const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy)
    const stepX = rdx < 0 ? -1 : 1, stepY = rdy < 0 ? -1 : 1
    let sdx = rdx < 0 ? (cam.x - mapX) * ddx : (mapX + 1 - cam.x) * ddx
    let sdy = rdy < 0 ? (cam.y - mapY) * ddy : (mapY + 1 - cam.y) * ddy
    let side = 0
    let prev = mapY * level.w + mapX
    let idx = prev
    for (let i = 0; i < 64; i++) {
      prev = idx
      if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0 } else { sdy += ddy; mapY += stepY; side = 1 }
      if (mapX < 0 || mapY < 0 || mapX >= level.w || mapY >= level.h) break
      idx = mapY * level.w + mapX
      if (level.walls[idx] !== 'none') break
    }
    const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy)
    zbuf[x] = perp
    const kind = level.walls[idx] ?? 'wall'
    const tex = kind === 'clue' ? CLUE_TEX[level.clueAt[idx]] ?? WALL_TEX : kind === 'pillar' ? PILLAR_TEX : WALL_TEX
    let wallX = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx
    wallX -= Math.floor(wallX)
    let texX = (wallX * TEX) | 0
    if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) texX = TEX - texX - 1
    const lineH = H / perp
    const top = half - lineH / 2
    const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(top + lineH))
    const dark = level.floors[prev] === 'dark'
    const light = fog(perp) * flick * (side === 1 ? 0.8 : 1) * (dark ? DARK_FACTOR : 1)
    const texStep = TEX / lineH
    for (let y = y0; y < y1; y++) {
      // y0 est arrondi vers le haut de `top` : sans le max(0), la 1re ligne d'un
      // mur lointain lit un index négatif (pixel noir en haut du mur)
      const ty = Math.max(0, Math.min(TEX - 1, ((y - top) * texStep) | 0))
      buf[y * W + x] = shade(tex[ty * TEX + texX], light)
    }
  }

  // ——— Objets (billboards posés au sol, du plus loin au plus proche) ———
  const inv = 1 / (planeX * dirY - dirX * planeY)
  const sorted = items
    .map((it) => ({ it, d: (it.x - cam.x) ** 2 + (it.y - cam.y) ** 2 }))
    .sort((a, b) => b.d - a.d)
  for (const { it } of sorted) {
    const sx = it.x - cam.x, sy = it.y - cam.y
    const tX = inv * (dirY * sx - dirX * sy)
    const tY = inv * (-planeY * sx + planeX * sy)
    if (tY <= 0.1) continue
    const frames = SPRITES[it.id]
    const tex = frames[Math.floor(time * 12) % frames.length]
    const size = (SPRITE_SCALE[it.id] * H) / tY
    const bob = (Math.sin(time * 3 + it.x) * 0.03 * H) / tY
    const bottom = half + (0.5 * H) / tY - bob
    const top = bottom - size
    const screenX = (W / 2) * (1 + tX / tY)
    const left = screenX - size / 2
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W, Math.ceil(left + size))
    const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom))
    const cell = Math.floor(it.y) * level.w + Math.floor(it.x)
    const light = fog(tY) * flick * (level.floors[cell] === 'dark' ? 0.55 : 1)
    for (let x = x0; x < x1; x++) {
      if (tY >= zbuf[x]) continue
      const texX = Math.min(STEX - 1, (((x - left) / size) * STEX) | 0)
      for (let y = y0; y < y1; y++) {
        const texY = Math.min(STEX - 1, (((y - top) / size) * STEX) | 0)
        const c = tex[texY * STEX + texX]
        if (c !== 0) buf[y * W + x] = shade(c, light)
      }
    }
  }
}
