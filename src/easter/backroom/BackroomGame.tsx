// Overlay plein écran du mini-FPS « Backroom ».
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadLevel1 } from './level1'
import { newGame, update, action, type Input, type GameState } from './game'
import { renderFrame, type Frame, type Sprite } from './raycaster'
import { SPRITES, SPRITE_SCALE, STEX, SHADOW_FRAMES, SHADOW_SCALE } from './textures'
import { Controls } from './Controls'
import { BackroomAudio } from './audio'
import { ITEM_LABEL, type ItemId, type Level } from './types'

const RES_H = 120 // hauteur interne en pixels : rendu volontairement pixelisé
const MUTE_KEY = 'worduo:backroom:muted'

function sceneSprites(level: Level, s: GameState, time: number): Sprite[] {
  const list: Sprite[] = level.items
    .filter((it) => !s.found.includes(it.id))
    .map((it) => {
      const frames = SPRITES[it.id]
      return { tex: frames[Math.floor(time * 12) % frames.length], x: it.x, y: it.y, scale: SPRITE_SCALE[it.id], alpha: 1, bob: true, bright: false }
    })
  for (const st of Object.values(s.apps)) {
    if (st.alpha <= 0) continue
    // tressaillement irrégulier
    const f = Math.floor(time * 5 + Math.sin(time * 1.7) * 2) & 3
    list.push({ tex: SHADOW_FRAMES[f], x: st.x, y: st.y, scale: SHADOW_SCALE, alpha: st.alpha, bob: false, bright: true })
  }
  return list
}

type Hud = { found: ItemId[]; message: string | null; prompt: string | null; done: boolean }

const hudOf = (s: GameState): Hud => ({ found: [...s.found], message: s.message, prompt: s.prompt, done: s.done })
const sameHud = (a: Hud, b: Hud) =>
  a.found.length === b.found.length && a.message === b.message && a.prompt === b.prompt && a.done === b.done

function ItemIcon({ id, found }: { id: ItemId; found: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(STEX, STEX)
    new Uint32Array(img.data.buffer).set(SPRITES[id][0])
    ctx.putImageData(img, 0, 0)
  }, [id])
  return (
    <div title={ITEM_LABEL[id]} style={{ width: 40, height: 40, background: 'rgba(0,0,0,.55)', border: `2px solid ${found ? '#ffd27a' : 'rgba(255,210,130,.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas ref={ref} width={STEX} height={STEX} style={{ width: 32, height: 32, imageRendering: 'pixelated', opacity: found ? 1 : 0.18, filter: found ? 'none' : 'grayscale(1)' }} />
    </div>
  )
}

const font = '"Courier New", ui-monospace, monospace'

export default function BackroomGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const level = useRef(loadLevel1()).current
  const game = useRef<GameState>(newGame(level))
  const input = useRef<Input>({ up: false, down: false, left: false, right: false }).current
  const [hud, setHud] = useState<Hud>(() => hudOf(game.current))
  const hudRef = useRef(hud)
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth)
  const [audio] = useState(() => new BackroomAudio())
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } })
  useEffect(() => {
    audio.setMuted(muted)
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
  }, [audio, muted])
  useEffect(() => () => audio.dispose(), [audio])

  const syncHud = () => {
    const next = hudOf(game.current)
    if (!sameHud(next, hudRef.current)) { hudRef.current = next; setHud(next) }
  }
  const doAction = () => { action(level, game.current); syncHud() }
  const restart = () => { game.current = newGame(level); syncHud() }

  // Ferme le clavier iOS (le champ d'indice avait le focus), bloque le scroll
  // et masque la page Worduo dessous : sans ça, son fond en dégradés et ses
  // flous (backdrop-filter) sont recomposés à chaque image du jeu, ce qui fait
  // tomber le rendu à ~6 images/s quand le navigateur compose en logiciel.
  // visibility (et non display) : la page garde sa mise en page et son état.
  useEffect(() => {
    const el = document.activeElement
    if (el instanceof HTMLElement) el.blur()
    const root = document.getElementById('root')
    const prev = { overflow: document.body.style.overflow, background: document.body.style.background, visibility: root?.style.visibility ?? '' }
    document.body.style.overflow = 'hidden'
    document.body.style.background = '#000'
    if (root) root.style.visibility = 'hidden'
    return () => {
      document.body.style.overflow = prev.overflow
      document.body.style.background = prev.background
      if (root) root.style.visibility = prev.visibility
    }
  }, [])

  // Boucle de jeu + rendu
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let frame: Frame | null = null
    let img: ImageData | null = null
    const resize = () => {
      const aspect = Math.min(2.4, Math.max(1, window.innerWidth / Math.max(1, window.innerHeight)))
      const w = Math.round(RES_H * aspect)
      canvas.width = w
      canvas.height = RES_H
      img = ctx.createImageData(w, RES_H)
      frame = { w, h: RES_H, buf: new Uint32Array(img.data.buffer), zbuf: new Float32Array(w) }
      setPortrait(window.innerHeight > window.innerWidth)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const s = game.current
      update(level, s, input, dt)
      for (const ev of s.events.splice(0)) audio.play(ev)
      audio.tick(s.dread)
      if (frame && img) {
        const time = now / 1000
        // une ombre se montre : les néons vacillent ; une ombre qui fixait
        // disparaît : lumière coupée un instant, puis secousse qui s'amortit
        const lights = s.sinceScare < 0.15 ? 0.12 : s.sinceAppear < 0.12 ? 0.5 : 1
        const shake = s.sinceScare < 0.4 ? (Math.random() - 0.5) * 0.05 * (1 - s.sinceScare / 0.4) : 0
        renderFrame(frame, level, { x: s.x, y: s.y, a: s.a + shake }, sceneSprites(level, s, time), time, { lights, dread: s.dread })
        ctx.putImageData(img, 0, 0)
      }
      syncHud()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clavier (ordinateur) : flèches ou ZQSD/WASD (e.code = touche physique), Espace ou E = A, Échap = quitter
  useEffect(() => {
    const keys: Record<string, keyof Input> = {
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    }
    const down = (e: KeyboardEvent) => {
      audio.unlock()
      if (e.code === 'Escape') { onClose(); return }
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) doAction(); return }
      const k = keys[e.code]
      if (k) { e.preventDefault(); input[k] = true }
    }
    const up = (e: KeyboardEvent) => {
      const k = keys[e.code]
      if (k) input[k] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  // Lecture seule de l'état, pour les tests automatisés (e2e/backroom-play.mjs)
  useEffect(() => {
    const w = window as unknown as { __backroom?: unknown }
    w.__backroom = {
      get state() {
        const s = game.current
        return {
          x: s.x, y: s.y, a: s.a, found: [...s.found], message: s.message, prompt: s.prompt, done: s.done,
          dread: s.dread, closest: s.closest, closestId: s.closestId,
          apps: Object.fromEntries(Object.entries(s.apps).map(([id, st]) => [id, { phase: st.phase, x: st.x, y: st.y, alpha: st.alpha }])),
        }
      },
      level: { raw: level.raw, items: level.items, clues: level.clues.map(({ id, x, y }) => ({ id, x, y })), apparitions: level.apparitions },
    }
    return () => { delete w.__backroom }
  }, [level])

  const overlay = (
    <div
      role="dialog"
      aria-label="Backroom"
      // iOS n'active le son qu'après un geste : le premier toucher le démarre
      onPointerDownCapture={() => audio.unlock()}
      onPointerUpCapture={() => audio.unlock()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', overflow: 'hidden', fontFamily: font, color: '#ffe2a8' }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }}
      />

      {/* Inventaire */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 'calc(env(safe-area-inset-left, 0px) + 12px)', display: 'flex', gap: 6, alignItems: 'center' }}>
        {level.items.map((it) => <ItemIcon key={it.id} id={it.id} found={hud.found.includes(it.id)} />)}
        <span style={{ marginLeft: 6, fontWeight: 700, textShadow: '1px 1px 0 #000' }}>{hud.found.length}/{level.items.length}</span>
      </div>

      <button
        aria-label={muted ? 'Activer le son' : 'Couper le son'}
        onClick={() => setMuted((m) => !m)}
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', right: 'calc(env(safe-area-inset-right, 0px) + 60px)', width: 40, height: 40, background: 'rgba(0,0,0,.55)', color: '#ffe2a8', border: '2px solid rgba(255,210,130,.5)', fontFamily: font, fontSize: 16, cursor: 'pointer' }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden style={{ display: 'block', margin: 'auto' }}>
          <path d="M3 7h3l4-3v12l-4-3H3z" fill="currentColor" />
          {muted
            ? <path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" strokeWidth="2" />
            : <path d="M13 6.5q3 3.5 0 7M15.5 4.5q5 5.5 0 11" stroke="currentColor" strokeWidth="1.6" fill="none" />}
        </svg>
      </button>

      <button
        aria-label="Quitter le niveau"
        onClick={onClose}
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', right: 'calc(env(safe-area-inset-right, 0px) + 12px)', width: 40, height: 40, background: 'rgba(0,0,0,.55)', color: '#ffe2a8', border: '2px solid rgba(255,210,130,.5)', fontFamily: font, fontSize: 18, fontWeight: 800, cursor: 'pointer' }}
      >
        ✕
      </button>

      {hud.prompt && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)', left: '50%', transform: 'translateX(-50%)', padding: '6px 12px', background: 'rgba(0,0,0,.6)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {hud.prompt}
        </div>
      )}

      {hud.message && (
        <div
          data-testid="backroom-message"
          onPointerDown={(e) => { e.preventDefault(); doAction() }}
          style={{ position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', width: 'min(440px, 56vw)', padding: '14px 16px', background: 'rgba(20, 12, 4, .88)', border: '3px solid #c0392b', boxShadow: '4px 4px 0 #000', lineHeight: 1.35, fontSize: 15 }}
        >
          {hud.message}
          <div style={{ marginTop: 8, textAlign: 'right', opacity: 0.75, fontSize: 12 }}>[A] continuer</div>
        </div>
      )}

      {!hud.done && <Controls input={input} onAction={doAction} />}

      {portrait && !hud.done && (
        <div style={{ position: 'absolute', top: 64, left: 12, right: 12, padding: 8, textAlign: 'center', background: 'rgba(0,0,0,.65)', fontSize: 13 }}>
          ↻ Tourne ton téléphone en mode paysage
        </div>
      )}

      {hud.done && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(10, 6, 0, .78)', textAlign: 'center', padding: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, color: '#ffd27a', textShadow: '3px 3px 0 #000' }}>NIVEAU 1 TERMINÉ</div>
          <div style={{ maxWidth: 420 }}>Brosse à dents, casserole et télé retrouvées. Les néons grésillent encore… Le niveau 2 t’attend quelque part.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={restart} style={{ padding: '10px 16px', fontFamily: font, fontWeight: 800, background: '#3a2a10', color: '#ffe2a8', border: '2px solid #ffd27a', cursor: 'pointer' }}>Rejouer</button>
            <button onClick={onClose} style={{ padding: '10px 16px', fontFamily: font, fontWeight: 800, background: '#c0392b', color: '#fff', border: '2px solid #000', cursor: 'pointer' }}>Retour à Worduo</button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}
