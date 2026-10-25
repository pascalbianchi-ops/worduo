// Overlay plein écran du mini-FPS « Backroom ».
import { useCallback, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { newGame, update, action, endChallenge, LEAVE_TIME, type Input, type GameState } from './game'
import { renderFrame, type Frame, type Sprite } from './raycaster'
import { SPRITES, SPRITE_SCALE, SHADOW_FRAMES, SHADOW_SCALE } from './textures'
import { Controls } from './Controls'
import { BackroomAudio } from './audio'
import { ChallengeWindow } from './challenges'
import { LAST_LEVEL } from './levels'
import type { ChallengeId } from './types'

const RES_H = 180 // hauteur interne en pixels : rendu pixelisé façon 16 bits
const MUTE_KEY = 'worduo:backroom:muted'
/** durée d'affichage de la porte refusée (secousse, dopamine barrée, effort) */
const REFUSED_SHOW = 2.4
/** échelle : les barreaux apparaissent, puis la montée commence */
const RUNGS_PAUSE = 0.9

function sceneSprites(s: GameState, time: number): Sprite[] {
  const list: Sprite[] = []
  for (const it of s.items) {
    if (it.state === 'hidden' || it.state === 'gone') continue
    const frames = SPRITES[it.spec.kind]
    // la télé de diversion et un objet qui surgit brillent, pour attirer l'œil
    const bright = !!it.spec.hidden || it.since < 0.5
    list.push({ tex: frames[Math.floor(time * 12) % frames.length], x: it.x, y: it.y, scale: SPRITE_SCALE[it.spec.kind], alpha: 1, bob: true, bright })
  }
  for (const st of Object.values(s.apps)) {
    if (st.alpha <= 0) continue
    // tressaillement irrégulier
    const f = Math.floor(time * 5 + Math.sin(time * 1.7) * 2) & 3
    list.push({ tex: SHADOW_FRAMES[f], x: st.x, y: st.y, scale: SHADOW_SCALE, alpha: st.alpha, bob: false, bright: true })
  }
  return list
}

/** Ce qui change rarement : React ne réaffiche que si l'un de ces champs bouge */
type Hud = {
  level: number
  prompt: string | null
  status: GameState['status']
  challenge: { borne: number; id: ChallengeId } | null
  effortLit: boolean
  refused: boolean
  eating: boolean
  nibbled: boolean
  effortUp: boolean
  low: boolean
  climbing: boolean
}
const hudOf = (s: GameState): Hud => ({
  level: s.level.num, prompt: s.prompt, status: s.status, challenge: s.challenge, effortLit: s.effortLit,
  refused: s.sinceRefused < REFUSED_SHOW, eating: s.sinceEat < 0.35, nibbled: s.sinceNibble < 0.7, effortUp: s.sinceEffort < 1.6,
  low: s.dopamine < 0.25, climbing: s.rungs && s.leavingT > RUNGS_PAUSE,
})
const sameHud = (a: Hud, b: Hud) => (Object.keys(a) as (keyof Hud)[]).every((k) => a[k] === b[k])

const font = '"Courier New", ui-monospace, monospace'

/** Bords colorés plein écran (objet avalé, effort grignoté, dopamine basse) */
const edge = (color: string): CSSProperties => ({
  position: 'absolute', inset: 0, pointerEvents: 'none', transition: 'opacity .25s', willChange: 'opacity',
  background: `radial-gradient(ellipse at center, transparent 55%, ${color} 100%)`,
})
const PINK = '#ff5fa8'
const BLUE = '#5aa8ff'

// ————————— Jauges —————————
function DopamineIcon({ size = 18 }: { size?: number }) {
  // bonbon emballé
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M1 6 L5 8 L5 12 L1 14 Z M19 6 L15 8 L15 12 L19 14 Z" fill="#ffb3d6" />
      <circle cx="10" cy="10" r="5.2" fill={PINK} />
      <circle cx="8.2" cy="8.2" r="1.4" fill="#fff" />
    </svg>
  )
}

function EffortIcon({ size = 18, lit }: { size?: number; lit: boolean }) {
  // haltère
  const c = lit ? BLUE : '#6c6c74'
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <rect x="2" y="5" width="3" height="10" rx="1" fill={c} /><rect x="15" y="5" width="3" height="10" rx="1" fill={c} />
      <rect x="5" y="8.5" width="10" height="3" fill={c} />
    </svg>
  )
}

type BarProps = { barRef?: Ref<HTMLDivElement>; width: number; height: number; color: string; lit?: boolean; segments?: number; struck?: boolean; style?: CSSProperties; fill?: number }

function Bar({ barRef, width, height, color, lit = true, segments = 0, struck, style, fill }: BarProps) {
  return (
    <div style={{ position: 'relative', width, height, background: lit ? 'rgba(0,0,0,.6)' : 'rgba(40,40,44,.6)', border: `2px solid ${lit ? color : '#55555c'}`, boxShadow: '2px 2px 0 #000', ...style }}>
      <div ref={barRef} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(fill ?? 0) * 100}%`, background: lit ? color : 'transparent' }} />
      {Array.from({ length: Math.max(0, segments - 1) }, (_, i) => (
        <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${((i + 1) / segments) * 100}%`, width: 2, marginLeft: -1, background: lit ? 'rgba(0,0,0,.7)' : '#55555c' }} />
      ))}
      {struck && (
        <svg style={{ position: 'absolute', inset: -6, width: 'calc(100% + 12px)', height: 'calc(100% + 12px)' }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <line x1="2" y1="96" x2="98" y2="4" stroke="#ff2a2a" strokeWidth="5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}

function DoorIcon() {
  return (
    <svg width="54" height="64" viewBox="0 0 27 32" aria-hidden>
      <rect x="2" y="1" width="23" height="31" fill="#3e2c1a" />
      <rect x="4" y="3" width="19" height="29" fill="#b0a896" />
      <rect x="18" y="16" width="3" height="2" fill="#3c3a36" />
    </svg>
  )
}

function LadderIcon({ rungs }: { rungs: boolean }) {
  return (
    <svg width="44" height="64" viewBox="0 0 22 32" aria-hidden>
      <rect x="2" y="0" width="3" height="32" fill="#c8cad2" /><rect x="17" y="0" width="3" height="32" fill="#c8cad2" />
      {rungs && [3, 9, 15, 21, 27].map((y) => <rect key={y} x="5" y={y} width="12" height="2" fill="#c8cad2" />)}
    </svg>
  )
}

export default function BackroomGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const game = useRef<GameState>(newGame(1))
  const input = useRef<Input>({ up: false, down: false, left: false, right: false }).current
  const [hud, setHud] = useState<Hud>(() => hudOf(game.current))
  const hudRef = useRef(hud)
  const dopRef = useRef<HTMLDivElement>(null)
  const effRef = useRef<HTMLDivElement>(null)
  const bigDopRef = useRef<HTMLDivElement>(null)
  const bigEffRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const challengeInfo = useRef<unknown>(null)
  /** écran de transition entre les niveaux (« NIVEAU 2 ») ou fin du jeu */
  const [between, setBetween] = useState<'none' | 'title' | 'end'>('none')
  const betweenRef = useRef(between)
  betweenRef.current = between
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
  const doAction = () => { action(game.current); syncHud() }
  const startLevel = (num: 1 | 2) => {
    game.current = newGame(num)
    challengeInfo.current = null
    setBetween(num === 2 ? 'title' : 'none')
    syncHud()
  }
  const finishChallenge = (success: boolean) => {
    endChallenge(game.current, success)
    challengeInfo.current = null
    syncHud()
  }
  const expose = useCallback((info: unknown) => { challengeInfo.current = info }, [])

  // Niveau terminé : niveau suivant, ou fin du jeu
  useEffect(() => {
    if (hud.status !== 'cleared') return
    if (game.current.level.num < LAST_LEVEL) startLevel((game.current.level.num + 1) as 2)
    else setBetween('end')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hud.status])
  useEffect(() => {
    if (between !== 'title') return
    const t = window.setTimeout(() => setBetween('none'), 2200)
    return () => window.clearTimeout(t)
  }, [between])

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
      // en portrait : image 4:3 centrée plutôt qu'un carré étiré sur toute la hauteur
      const aspect = window.innerHeight > window.innerWidth ? 4 / 3 : Math.min(2.4, Math.max(1, window.innerWidth / Math.max(1, window.innerHeight)))
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
      // le jeu attend pendant l'écran « NIVEAU 2 »
      if (betweenRef.current === 'none') update(s, input, dt)
      for (const ev of s.events.splice(0)) audio.play(ev)
      audio.tick(s.dread)
      // jauges : mises à jour directement, sans repasser par React
      const dop = `${s.dopamine * 100}%`, eff = `${s.effort * 100}%`
      if (dopRef.current) dopRef.current.style.width = dop
      if (effRef.current) effRef.current.style.width = eff
      if (bigDopRef.current) bigDopRef.current.style.width = dop
      if (bigEffRef.current) bigEffRef.current.style.width = eff
      if (frame && img) {
        const time = now / 1000
        // une ombre se montre : les néons vacillent ; une ombre qui fixait
        // disparaît : lumière coupée un instant, puis secousse qui s'amortit
        const lights = s.sinceScare < 0.15 ? 0.12 : s.sinceAppear < 0.12 ? 0.5 : 1
        let shake = s.sinceScare < 0.4 ? (Math.random() - 0.5) * 0.05 * (1 - s.sinceScare / 0.4) : 0
        // la porte refuse : elle tremble à l'écran
        if (s.sinceRefused < 0.6) shake += Math.sin(s.sinceRefused * 70) * 0.025 * (1 - s.sinceRefused / 0.6)
        // un passage s'ouvre : grondement
        if (s.sinceOpened < 1) shake += Math.sin(s.sinceOpened * 45) * 0.018 * (1 - s.sinceOpened)
        renderFrame(frame, s.level, { x: s.x, y: s.y, a: s.a + shake }, sceneSprites(s, time), time, { lights, dread: s.dread, solved: s.solved, rungs: s.rungs })
        ctx.putImageData(img, 0, 0)
        // montée de l'échelle (le moteur ne sait pas monter) : la scène glisse vers le bas
        if (sceneRef.current) {
          const climb = s.rungs ? Math.max(0, s.leavingT - RUNGS_PAUSE) / (LEAVE_TIME - RUNGS_PAUSE) : 0
          const jolt = s.sinceRefused < 0.6 ? Math.sin(s.sinceRefused * 60) * 6 * (1 - s.sinceRefused / 0.6) : 0
          sceneRef.current.style.transform = climb > 0 ? `translateY(${climb * climb * 110}%)` : jolt ? `translateX(${jolt}px)` : ''
        }
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
      if (e.code === 'Escape') {
        if (game.current.challenge) finishChallenge(false)
        else onClose()
        return
      }
      if (game.current.challenge) return // le défi se joue à la souris / au doigt
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
          level: s.level.num, x: s.x, y: s.y, a: s.a, time: s.time, prompt: s.prompt, status: s.status, between: betweenRef.current,
          dopamine: s.dopamine, effort: s.effort, effortLit: s.effortLit, solved: [...s.solved], habit: s.habit, maxAfterItem: s.maxAfterItem,
          challenge: s.challenge, challengeInfo: challengeInfo.current, exitAttempts: s.exitAttempts, doorOpen: s.doorOpen, rungs: s.rungs,
          gates: { ...s.gates }, secretLog: s.secretLog, sinceRefused: s.sinceRefused,
          items: s.items.map((it) => ({ kind: it.spec.kind, behavior: it.spec.behavior, x: it.x, y: it.y, state: it.state })),
          dread: s.dread, closest: s.closest, closestId: s.closestId,
          apps: Object.fromEntries(Object.entries(s.apps).map(([id, st]) => [id, { phase: st.phase, x: st.x, y: st.y, alpha: st.alpha }])),
        }
      },
      get level() {
        const l = game.current.level
        return { num: l.num, raw: l.raw, w: l.w, bornes: l.bornes, exit: l.exit, beyond: l.beyond, gates: l.gates, apparitions: l.apparitions, walls: [...l.walls] }
      },
    }
    return () => { delete w.__backroom }
  }, [])
  const s = game.current
  const exitKind = s.level.exit.kind
  const playing = hud.status === 'play' && between === 'none'
  const topLeft: CSSProperties = { position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 'calc(env(safe-area-inset-left, 0px) + 12px)' }
  const segs = s.level.bornes.length

  const overlay = (
    <div
      role="dialog"
      aria-label="Backroom"
      // iOS n'active le son qu'après un geste : le premier toucher le démarre
      onPointerDownCapture={() => audio.unlock()}
      onPointerUpCapture={() => audio.unlock()}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', overflow: 'hidden', fontFamily: font, color: '#ffe2a8' }}
    >
      <div ref={sceneRef} style={{ position: 'absolute', inset: 0 }}>
        <canvas
          ref={canvasRef}
          style={portrait
            ? { position: 'absolute', left: 0, top: '50%', width: '100%', height: 'auto', transform: 'translateY(-50%)', imageRendering: 'pixelated' }
            : { position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }}
        />
      </div>

      {/* Calques à dégradé fixe : seule leur opacité change (animée par le compositeur, sans repeindre la scène) */}
      <div aria-hidden style={{ ...edge('rgba(0,0,0,.9)'), opacity: hud.low && !hud.eating && !hud.nibbled ? 1 : 0, animation: hud.low ? 'br-pulse 1.1s infinite' : 'none' }} />
      <div aria-hidden style={{ ...edge('rgba(255,95,168,.7)'), opacity: hud.eating ? 1 : 0 }} />
      <div aria-hidden style={{ ...edge('rgba(255,40,40,.7)'), opacity: hud.nibbled ? 1 : 0 }} />
      <style>{'@keyframes br-pulse{0%,100%{opacity:1}50%{opacity:.45}}@keyframes br-glow{0%,100%{box-shadow:0 0 0 #5aa8ff}50%{box-shadow:0 0 16px #5aa8ff}}@keyframes br-jolt{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}@keyframes br-up{from{opacity:0}to{opacity:1}}'}</style>

      {/* Jauges */}
      <div style={{ ...topLeft, display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="jauges">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="Dopamine">
          <DopamineIcon />
          <Bar barRef={dopRef} width={130} height={12} color={PINK} struck={hud.refused} fill={s.dopamine} />
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, animation: hud.nibbled ? 'br-jolt .3s 2' : hud.effortUp || (hud.refused && hud.effortLit) ? 'br-glow .8s 2' : 'none' }}
          aria-label="Effort"
        >
          <EffortIcon lit={hud.effortLit} />
          <Bar barRef={effRef} width={130} height={12} color={hud.nibbled ? '#ff4a4a' : BLUE} lit={hud.effortLit} segments={segs} fill={s.effort} />
        </div>
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

      {/* Sortie refusée : symbole de la sortie, dopamine barrée, et l'effort accompli. La règle n'est jamais écrite. */}
      {hud.refused && playing && !hud.challenge && (
        <div data-testid="sortie-refusee" aria-hidden style={{ position: 'absolute', left: '50%', top: '18%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 18, padding: '12px 18px', background: 'rgba(0,0,0,.55)', pointerEvents: 'none' }}>
          {exitKind === 'door' ? <DoorIcon /> : <LadderIcon rungs={false} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DopamineIcon size={28} />
              <Bar barRef={bigDopRef} width={170} height={20} color={PINK} struck fill={s.dopamine} />
            </div>
            {hud.effortLit && (
              <div data-testid="refus-effort" style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'br-glow .8s 3' }}>
                <EffortIcon size={28} lit />
                <Bar barRef={bigEffRef} width={170} height={20} color={BLUE} segments={segs} fill={s.effort} />
              </div>
            )}
          </div>
        </div>
      )}

      {hud.prompt && playing && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 22px)', left: '50%', transform: 'translateX(-50%)', padding: '6px 12px', background: 'rgba(0,0,0,.6)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {hud.prompt}
        </div>
      )}

      {playing && !hud.challenge && <Controls input={input} onAction={doAction} />}

      {hud.challenge && playing && (
        <ChallengeWindow
          key={`${hud.level}-${hud.challenge.borne}`}
          id={hud.challenge.id}
          onSolved={() => finishChallenge(true)}
          onAbort={() => finishChallenge(false)}
          expose={expose}
        />
      )}

      {portrait && playing && (
        <div style={{ position: 'absolute', top: 64, left: 12, right: 12, padding: 8, textAlign: 'center', background: 'rgba(0,0,0,.65)', fontSize: 13 }}>
          ↻ Tourne ton téléphone en mode paysage
        </div>
      )}

      {/* Sortie franchie : lumière blanche (porte) ou montée (échelle) */}
      {hud.status === 'leaving' && (exitKind === 'door' || hud.climbing) && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: exitKind === 'door' ? '#fff8e4' : 'linear-gradient(#fff8e4, rgba(255,248,228,.2))', animation: `br-up ${exitKind === 'door' ? 2 : 1.2}s ease-in forwards`, pointerEvents: 'none' }} />
      )}

      {between === 'title' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff8e4', color: '#3a2a10', fontSize: 34, fontWeight: 800, letterSpacing: 4, animation: 'br-pulse 2.2s' }}>
          NIVEAU {hud.level}
        </div>
      )}

      {hud.status === 'dead' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(5, 3, 0, .88)', textAlign: 'center', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <DopamineIcon size={32} />
            <Bar width={180} height={20} color={PINK} fill={0} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, color: '#ff8a8a', textShadow: '3px 3px 0 #000' }}>TU T’ES ÉTEINT</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => startLevel(hud.level as 1 | 2)} style={{ padding: '10px 16px', fontFamily: font, fontWeight: 800, background: '#3a2a10', color: '#ffe2a8', border: '2px solid #ffd27a', cursor: 'pointer' }}>Recommencer le niveau</button>
            <button onClick={onClose} style={{ padding: '10px 16px', fontFamily: font, fontWeight: 800, background: '#c0392b', color: '#fff', border: '2px solid #000', cursor: 'pointer' }}>Retour à Worduo</button>
          </div>
        </div>
      )}

      {between === 'end' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#fff8e4', color: '#3a2a10', textAlign: 'center', padding: 16, animation: 'br-up 1s' }}>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 3 }}>TU ES SORTI</div>
          <div style={{ maxWidth: 440 }}>Tu as laissé la routine en bas. Pour l’instant…</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => startLevel(1)} style={{ padding: '10px 16px', fontFamily: font, fontWeight: 800, background: '#3a2a10', color: '#ffe2a8', border: '2px solid #ffd27a', cursor: 'pointer' }}>Rejouer</button>
            <button onClick={onClose} style={{ padding: '10px 16px', fontFamily: font, fontWeight: 800, background: '#c0392b', color: '#fff', border: '2px solid #000', cursor: 'pointer' }}>Retour à Worduo</button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}
