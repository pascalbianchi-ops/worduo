// Défis d'effort : une fenêtre par-dessus le labyrinthe, jouable au doigt,
// en moins d'une minute. Texte lisible (pas de pixel art), aucun son requis.
//
// Chaque défi appelle `expose` avec sa solution courante : lecture seule,
// pour le bot de test (e2e/backroom-play.mjs), via window.__backroom.challenge.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ChallengeId } from './types'

type Props = { onSolved: () => void; expose: (info: unknown) => void }

const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const C = { bg: '#1c140a', panel: '#2a1d0e', line: '#ffd27a', text: '#fff3dc', dim: '#d9c49c', ok: '#4fdc84', bad: '#ff5a4a', blue: '#5aa8ff' }

const rnd = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(a: readonly T[]) => a[rnd(a.length)]
function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

/** Réussi : bandeau vert, puis fermeture. Raté : secousse rouge. */
function useVerdict(onSolved: () => void) {
  const [state, setState] = useState<'idle' | 'win' | 'fail'>('idle')
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    state,
    win: () => { setState('win'); timer.current = window.setTimeout(onSolved, 700) },
    fail: (then?: () => void) => {
      setState('fail')
      timer.current = window.setTimeout(() => { setState('idle'); then?.() }, 650)
    },
  }
}

const btn: CSSProperties = {
  minWidth: 48, minHeight: 48, padding: '8px 12px', fontFamily: sans, fontSize: 20, fontWeight: 700,
  background: C.panel, color: C.text, border: `2px solid ${C.line}`, borderRadius: 10, cursor: 'pointer',
  touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
}

/** Contenu d'un défi : secousse et liseré rouge si raté, liseré vert si réussi */
function Box({ state, row, children }: { state: 'idle' | 'win' | 'fail'; row?: boolean; children: ReactNode }) {
  return (
    <div
      data-verdict={state}
      style={{
        display: 'flex', flexDirection: row ? 'row' : 'column', alignItems: 'center', gap: row ? 16 : 8, padding: '3px 8px', borderRadius: 10,
        outline: state === 'idle' ? 'none' : `3px solid ${state === 'win' ? C.ok : C.bad}`, animation: state === 'fail' ? 'br-shake .4s' : 'none',
      }}
    >
      {children}
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <div style={{ color: C.dim, fontSize: 15, lineHeight: 1.3, textAlign: 'center' }}>{children}</div>
}

// ————————— Formes SVG (suites, intrus, balance) —————————
type Shape = { kind: 'poly' | 'circle' | 'arrow' | 'dots' | 'star'; n?: number; rot?: number; filled?: boolean; scale?: number }

function polyPoints(n: number, r: number, rot: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (rot * Math.PI) / 180 - Math.PI / 2 + (i * 2 * Math.PI) / n
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}

function ShapeSvg({ s, size = 56, color = C.text }: { s: Shape; size?: number; color?: string }) {
  const fill = s.filled ? color : 'none'
  const r = 38 * (s.scale ?? 1)
  let body: ReactNode
  if (s.kind === 'circle') body = <circle cx={50} cy={50} r={r} fill={fill} stroke={color} strokeWidth={6} />
  else if (s.kind === 'poly') body = <polygon points={polyPoints(s.n!, r, s.rot ?? 0)} fill={fill} stroke={color} strokeWidth={6} strokeLinejoin="round" />
  else if (s.kind === 'star') body = <polygon points={Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; return `${50 + rr * Math.cos(a)},${50 + rr * Math.sin(a)}` }).join(' ')} fill={fill} stroke={color} strokeWidth={5} strokeLinejoin="round" />
  else if (s.kind === 'arrow') body = (
    <g transform={`rotate(${s.rot ?? 0} 50 50)`}>
      <path d="M50 12 L78 46 L60 46 L60 86 L40 86 L40 46 L22 46 Z" fill={color} />
    </g>
  )
  else {
    const n = s.n ?? 1
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3
    const rows = Math.ceil(n / cols)
    body = Array.from({ length: n }, (_, i) => {
      const cx = 50 + ((i % cols) - (cols - 1) / 2) * 26, cy = 50 + (Math.floor(i / cols) - (rows - 1) / 2) * 26
      return <circle key={i} cx={cx} cy={cy} r={9} fill={color} />
    })
  }
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>{body}</svg>
}

// ————————— Niveau 1 · Puzzle de rotation —————————
// Grille 3×3 : un grand cercle découpé en 8 morceaux (la case du centre est vide).
// Un tap = un quart de tour. Les pièces ne se déplacent jamais.
const ROT_N = 3
const CIRCLE_R = 1.1

function RotationTile({ i, j, rot, onTap, done }: { i: number; j: number; rot: number; onTap: () => void; done: boolean }) {
  // repère : centre de la grille en (0, 0), une case = 1
  const x0 = i - ROT_N / 2, y0 = j - ROT_N / 2
  return (
    <button
      aria-label={`Pièce ${j * ROT_N + i + 1}`}
      data-rot={rot}
      onClick={onTap}
      style={{ ...btn, padding: 0, width: 54, height: 54, minWidth: 0, borderRadius: 6, background: '#120c05', borderColor: done ? C.ok : '#6b5634', overflow: 'hidden' }}
    >
      <svg width="100%" height="100%" viewBox={`${x0} ${y0} 1 1`} style={{ display: 'block', transform: `rotate(${rot * 90}deg)`, transition: 'transform .12s' }} aria-hidden>
        <circle cx={0} cy={0} r={CIRCLE_R} fill="none" stroke={done ? C.ok : C.line} strokeWidth={0.17} />
      </svg>
    </button>
  )
}

function Rotation({ onSolved, expose }: Props) {
  const v = useVerdict(onSolved)
  const [rots, setRots] = useState(() => {
    const r = Array(ROT_N * ROT_N).fill(0)
    const center = Math.floor((ROT_N * ROT_N) / 2)
    const cells = shuffle([...Array(ROT_N * ROT_N).keys()].filter((k) => k !== center)).slice(0, 6)
    for (const k of cells) r[k] = 1 + rnd(3)
    return r
  })
  const center = Math.floor((ROT_N * ROT_N) / 2)
  const solved = rots.every((r, k) => k === center || r % 4 === 0)
  useEffect(() => { expose({ kind: 'rotation', rots }) }, [rots, expose])
  useEffect(() => { if (solved && v.state === 'idle') v.win() }, [solved]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Box state={v.state}>
      <Hint>Touche les pièces pour les faire tourner et reforme le cercle.</Hint>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${ROT_N}, 54px)`, gap: 3 }}>
        {rots.map((r, k) => (
          <RotationTile key={k} i={k % ROT_N} j={Math.floor(k / ROT_N)} rot={r} done={solved}
            onTap={() => { if (!solved) setRots((p) => p.map((x, q) => (q === k ? (x + 1) % 4 : x))) }} />
        ))}
      </div>
    </Box>
  )
}

// ————————— Niveau 1 · Suite logique de formes —————————
type SeqPuzzle = { seq: Shape[]; answer: Shape; wrong: Shape[] }
const SEQUENCES: (() => SeqPuzzle)[] = [
  () => ({ seq: [3, 4, 5].map((n) => ({ kind: 'poly', n })), answer: { kind: 'poly', n: 6 }, wrong: [{ kind: 'poly', n: 4 }, { kind: 'circle' }, { kind: 'poly', n: 8 }] }),
  () => ({ seq: [0, 45, 90].map((rot) => ({ kind: 'arrow', rot })), answer: { kind: 'arrow', rot: 135 }, wrong: [{ kind: 'arrow', rot: 90 }, { kind: 'arrow', rot: 180 }, { kind: 'arrow', rot: 0 }] }),
  () => ({ seq: [1, 2, 4].map((n) => ({ kind: 'dots', n })), answer: { kind: 'dots', n: 8 }, wrong: [{ kind: 'dots', n: 5 }, { kind: 'dots', n: 6 }, { kind: 'dots', n: 7 }] }),
  () => ({
    seq: [{ kind: 'circle', filled: true }, { kind: 'poly', n: 4, rot: 45 }, { kind: 'circle', filled: true }, { kind: 'poly', n: 4, rot: 45 }],
    answer: { kind: 'circle', filled: true }, wrong: [{ kind: 'circle' }, { kind: 'poly', n: 4, rot: 45, filled: true }, { kind: 'poly', n: 3 }],
  }),
  () => ({ seq: [0, 90, 180].map((rot) => ({ kind: 'poly', n: 3, rot, filled: true })), answer: { kind: 'poly', n: 3, rot: 270, filled: true }, wrong: [{ kind: 'poly', n: 3, rot: 0, filled: true }, { kind: 'poly', n: 3, rot: 180, filled: true }, { kind: 'poly', n: 3, rot: 270 }] }),
  () => ({ seq: [0.4, 0.6, 0.8].map((scale) => ({ kind: 'star', scale, filled: true })), answer: { kind: 'star', scale: 1, filled: true }, wrong: [{ kind: 'star', scale: 0.5, filled: true }, { kind: 'star', scale: 1 }, { kind: 'circle', scale: 1, filled: true }] }),
]

function makeSeq(prev?: number) {
  let k = rnd(SEQUENCES.length)
  if (k === prev) k = (k + 1) % SEQUENCES.length
  const p = SEQUENCES[k]()
  const choices = shuffle([{ s: p.answer, ok: true }, ...p.wrong.map((s) => ({ s, ok: false }))])
  return { k, seq: p.seq, choices }
}

function Suite({ onSolved, expose }: Props) {
  const v = useVerdict(onSolved)
  const [p, setP] = useState(() => makeSeq())
  useEffect(() => { expose({ kind: 'suite', answer: p.choices.findIndex((c) => c.ok) }) }, [p, expose])
  return (
    <Box state={v.state}>
      <Hint>Quelle forme vient ensuite ?</Hint>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {p.seq.map((s, i) => <div key={i} style={{ padding: 4, border: `1px solid #6b5634`, borderRadius: 6 }}><ShapeSvg s={s} size={50} /></div>)}
        <div style={{ width: 58, height: 58, border: `2px dashed ${C.line}`, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: C.line }}>?</div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {p.choices.map((c, i) => (
          <button key={i} aria-label={`Choix ${i + 1}`} style={{ ...btn, padding: 6 }}
            onClick={() => { if (v.state !== 'idle') return; if (c.ok) v.win(); else v.fail(() => setP((q) => makeSeq(q.k))) }}>
            <ShapeSvg s={c.s} size={56} color={v.state === 'win' && c.ok ? C.ok : C.text} />
          </button>
        ))}
      </div>
    </Box>
  )
}

// ————————— Niveau 1 · L'intrus —————————
type Odd = { items: (string | Shape)[]; odd: number }
const ODDS: Odd[] = [
  { items: ['Pomme', 'Poire', 'Banane', 'Carotte', 'Cerise', 'Kiwi'], odd: 3 },
  { items: ['2', '4', '8', '16', '23', '32'], odd: 4 },
  { items: ['Lundi', 'Mardi', 'Avril', 'Jeudi', 'Samedi', 'Dimanche'], odd: 2 },
  { items: ['Chat', 'Chien', 'Lapin', 'Tulipe', 'Cheval', 'Vache'], odd: 3 },
  { items: ['Rouge', 'Bleu', 'Vert', 'Table', 'Jaune', 'Violet'], odd: 3 },
  { items: ['3', '9', '15', '21', '24', '27'], odd: 4 },
  { items: [{ kind: 'poly', n: 3 }, { kind: 'poly', n: 4 }, { kind: 'poly', n: 5 }, { kind: 'circle' }, { kind: 'poly', n: 6 }, { kind: 'poly', n: 8 }], odd: 3 },
  { items: [{ kind: 'poly', n: 4, filled: true }, { kind: 'poly', n: 4, filled: true, rot: 45 }, { kind: 'poly', n: 4, filled: true }, { kind: 'poly', n: 4 }, { kind: 'poly', n: 4, filled: true, rot: 45 }, { kind: 'poly', n: 4, filled: true }], odd: 3 },
]

function makeOdd(prev?: number) {
  let k = rnd(ODDS.length)
  if (k === prev) k = (k + 1) % ODDS.length
  const order = shuffle([...ODDS[k].items.keys()])
  return { k, items: order.map((i) => ODDS[k].items[i]), odd: order.indexOf(ODDS[k].odd) }
}

function Intrus({ onSolved, expose }: Props) {
  const v = useVerdict(onSolved)
  const [p, setP] = useState(() => makeOdd())
  useEffect(() => { expose({ kind: 'intrus', answer: p.odd }) }, [p, expose])
  return (
    <Box state={v.state}>
      <Hint>Lequel n’a rien à faire là ?</Hint>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 10 }}>
        {p.items.map((it, i) => (
          <button key={i} aria-label={`Élément ${i + 1}`} style={{ ...btn, minWidth: 110, minHeight: 64, color: v.state === 'win' && i === p.odd ? C.ok : C.text }}
            onClick={() => { if (v.state !== 'idle') return; if (i === p.odd) v.win(); else v.fail(() => setP((q) => makeOdd(q.k))) }}>
            {typeof it === 'string' ? it : <ShapeSvg s={it} size={44} color={v.state === 'win' && i === p.odd ? C.ok : C.text} />}
          </button>
        ))}
      </div>
    </Box>
  )
}

// ————————— Niveau 2 · Jeu des lumières —————————
const LN = 4

function toggle(on: boolean[], k: number) {
  const x = k % LN, y = Math.floor(k / LN)
  return on.map((v, q) => {
    const qx = q % LN, qy = Math.floor(q / LN)
    return Math.abs(qx - x) + Math.abs(qy - y) <= 1 ? !v : v
  })
}

function Lumieres({ onSolved, expose }: Props) {
  const v = useVerdict(onSolved)
  // départ : quelques appuis au hasard depuis tout éteint (donc toujours soluble)
  const [initial] = useState(() => {
    const presses = shuffle([...Array(LN * LN).keys()]).slice(0, 4)
    return { presses, on: presses.reduce(toggle, Array(LN * LN).fill(false) as boolean[]) }
  })
  const [on, setOn] = useState(initial.on)
  const [pressed, setPressed] = useState<number[]>([])
  const solved = on.every((x) => !x)
  useEffect(() => {
    // appuyer deux fois sur une case l'annule : la solution est la différence symétrique
    const rest = [...Array(LN * LN).keys()].filter((k) => initial.presses.includes(k) !== (pressed.filter((p) => p === k).length % 2 === 1))
    expose({ kind: 'lumieres', presses: rest })
  }, [pressed, initial, expose])
  useEffect(() => { if (solved && v.state === 'idle') v.win() }, [solved]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Box state={v.state}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LN}, 48px)`, gap: 4 }}>
          {on.map((lit, k) => (
            <button key={k} aria-label={`Lumière ${k + 1}`} data-on={lit ? 1 : 0}
              onClick={() => { if (solved) return; setOn((o) => toggle(o, k)); setPressed((p) => [...p, k]) }}
              style={{ ...btn, width: 48, height: 48, minWidth: 0, padding: 0, borderRadius: 8, background: lit ? '#ffe27a' : '#18120a', borderColor: lit ? '#fff3b0' : '#5b4a2c', boxShadow: lit ? '0 0 14px #ffd23a' : 'none' }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', maxWidth: 200 }}>
          <Hint>Chaque case inverse aussi ses voisines. Éteins tout.</Hint>
          <button style={{ ...btn, fontSize: 15 }} onClick={() => { setOn(initial.on); setPressed([]) }}>Recommencer</button>
        </div>
      </div>
    </Box>
  )
}

// ————————— Niveau 2 · Allumettes —————————
// Chiffres en 7 segments (a haut, b haut droit, c bas droit, d bas, e bas gauche, f haut gauche, g milieu)
const SEG = 'abcdefg'
const DIGITS: Record<string, number> = {}
;['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'].forEach((segs, d) => {
  DIGITS[[...SEG].map((s) => (segs.includes(s) ? '1' : '0')).join('')] = d
})
const digitMask = (d: number) => Object.keys(DIGITS).find((k) => DIGITS[k] === d)!
// glyphes : 0 chiffre, 1 opérateur (h, v), 2 chiffre, [=], 3 chiffre ; un emplacement = [glyphe, segment]
type Sticks = boolean[][]
const SLOTS: [number, number][] = [
  ...[...SEG].map((_, s) => [0, s] as [number, number]),
  [1, 0], [1, 1],
  ...[...SEG].map((_, s) => [2, s] as [number, number]),
  ...[...SEG].map((_, s) => [3, s] as [number, number]),
]

function evaluate(st: Sticks): boolean {
  const dig = (g: number) => DIGITS[st[g].map((b) => (b ? '1' : '0')).join('')]
  const a = dig(0), b = dig(2), c = dig(3)
  if (a === undefined || b === undefined || c === undefined || !st[1][0]) return false
  return st[1][1] ? a + b === c : a - b === c
}

function valid(st: Sticks) {
  const dig = (g: number) => DIGITS[st[g].map((x) => (x ? '1' : '0')).join('')]
  return dig(0) !== undefined && dig(2) !== undefined && dig(3) !== undefined && st[1][0]
}

function makeMatches(): { start: Sticks; move: [number, number] } {
  for (;;) {
    const plus = Math.random() < 0.5
    const a = rnd(10), b = rnd(10)
    const c = plus ? a + b : a - b
    if (c < 0 || c > 9) continue
    const sol: Sticks = [a, 0, b, c].map((d, g) => g === 1 ? [true, plus] : [...digitMask(d)].map((ch) => ch === '1'))
    // on retire une allumette de la solution et on la pose ailleurs : l'inverse est la réponse
    const from = SLOTS.filter(([g, s]) => sol[g][s] && !(g === 1 && s === 0))
    const to = SLOTS.filter(([g, s]) => !sol[g][s])
    const [fg, fs] = pick(from), [tg, ts] = pick(to)
    const start = sol.map((r) => [...r])
    start[fg][fs] = false
    start[tg][ts] = true
    if (!valid(start) || evaluate(start)) continue
    return { start, move: [SLOTS.findIndex(([g, s]) => g === tg && s === ts), SLOTS.findIndex(([g, s]) => g === fg && s === fs)] }
  }
}

// géométrie d'un chiffre : 50 × 90, segments [x1, y1, x2, y2]
const SEG_GEOM: [number, number, number, number][] = [
  [8, 6, 42, 6], [44, 8, 44, 43], [44, 47, 44, 82], [8, 84, 42, 84], [6, 47, 6, 82], [6, 8, 6, 43], [8, 45, 42, 45],
]
const OP_GEOM: [number, number, number, number][] = [[4, 45, 40, 45], [22, 27, 22, 63]]

function Allumettes({ onSolved, expose }: Props) {
  const v = useVerdict(onSolved)
  const [puzzle] = useState(makeMatches)
  const [st, setSt] = useState<Sticks>(puzzle.start)
  const [held, setHeld] = useState<number | null>(null)
  useEffect(() => { expose({ kind: 'allumettes', from: puzzle.move[0], to: puzzle.move[1] }) }, [puzzle, expose])

  const tapSlot = (k: number) => {
    if (v.state !== 'idle') return
    const [g, s] = SLOTS[k]
    if (st[g][s]) { setHeld(held === k ? null : k); return }
    if (held === null) return
    const [hg, hs] = SLOTS[held]
    const next = st.map((r) => [...r])
    next[hg][hs] = false
    next[g][s] = true
    setSt(next)
    setHeld(null)
    if (evaluate(next)) v.win()
    else v.fail(() => setSt(puzzle.start))
  }

  const glyph = (g: number, x: number) => {
    const geom = g === 1 ? OP_GEOM : SEG_GEOM
    return geom.map(([x1, y1, x2, y2], s) => {
      const k = SLOTS.findIndex(([gg, ss]) => gg === g && ss === s)
      const present = st[g][s]
      const isHeld = held === k
      return (
        <g key={`${g}-${s}`} transform={`translate(${x} 0)`} onClick={() => tapSlot(k)} style={{ cursor: 'pointer' }} data-slot={k} role="button" aria-label={`Emplacement ${k + 1}`}>
          {/* zone de toucher large (≥ 40 px à l'écran) */}
          {y1 === y2
            ? <rect x={x1 - 2} y={y1 - 16} width={x2 - x1 + 4} height={32} fill="transparent" />
            : <rect x={x1 - 16} y={y1 + 2} width={32} height={y2 - y1 - 4} fill="transparent" />}
          {present
            ? <>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={isHeld ? C.blue : v.state === 'win' ? C.ok : '#f2d7a0'} strokeWidth={6} strokeLinecap="round" />
              <circle cx={x1} cy={y1} r={4.5} fill={isHeld ? C.blue : '#d33'} />
            </>
            : held !== null && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8a7550" strokeWidth={3} strokeDasharray="4 5" />}
        </g>
      )
    })
  }
  return (
    <Box state={v.state}>
      <Hint>Déplace une seule allumette pour que l’égalité soit juste.</Hint>
      <svg viewBox="-12 -12 336 114" width={336 * 1.3} height={114 * 1.3} style={{ touchAction: 'manipulation', maxWidth: '100%' }}>
        {glyph(0, 0)}
        {glyph(1, 64)}
        {glyph(2, 116)}
        <line x1={184} y1={36} x2={216} y2={36} stroke="#f2d7a0" strokeWidth={6} strokeLinecap="round" />
        <line x1={184} y1={54} x2={216} y2={54} stroke="#f2d7a0" strokeWidth={6} strokeLinecap="round" />
        {glyph(3, 236)}
      </svg>
    </Box>
  )
}

// ————————— Niveau 2 · La balance —————————
const SYMS = { q: { ch: '■', color: '#5aa8ff' }, c: { ch: '●', color: '#ff7ab8' }, t: { ch: '▲', color: '#7be07b' } }
type Pan = (keyof typeof SYMS | number)[]

function makeBalance() {
  const q = 2 + rnd(3), c = 2 * q, t = 2 * c - q
  // ■■ = ●  ·  ● + ■ = 3q kg  ·  ▲ + ■ = ● ●   →   ▲ ?
  const weighings: [Pan, Pan][] = shuffle([
    [['q', 'q'], ['c']],
    [['c', 'q'], [3 * q]],
    [['t', 'q'], ['c', 'c']],
  ])
  const choices = shuffle([...new Set([t, t + q, t - 1, c, t + 2])].slice(0, 4))
  return { weighings, answer: t, choices }
}

function PanView({ pan }: { pan: Pan }) {
  return (
    <div style={{ display: 'flex', gap: 4, minWidth: 90, justifyContent: 'center', alignItems: 'center', padding: '4px 8px', background: '#120c05', borderRadius: 8, borderBottom: `4px solid ${C.dim}` }}>
      {pan.map((p, i) => typeof p === 'number'
        ? <span key={i} style={{ padding: '2px 6px', background: '#6b6b74', color: '#fff', borderRadius: 4, fontWeight: 800, fontSize: 16 }}>{p} kg</span>
        : <span key={i} style={{ color: SYMS[p].color, fontSize: 26, lineHeight: 1 }}>{SYMS[p].ch}</span>)}
    </div>
  )
}

function Balance({ onSolved, expose }: Props) {
  const v = useVerdict(onSolved)
  const [p, setP] = useState(makeBalance)
  useEffect(() => { expose({ kind: 'balance', answer: p.choices.indexOf(p.answer) }) }, [p, expose])
  return (
    <Box state={v.state}>
      <Hint>Les balances sont à l’équilibre. Combien pèse <span style={{ color: SYMS.t.color }}>▲</span> ?</Hint>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {p.weighings.map(([l, r], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PanView pan={l} /><span style={{ fontSize: 22, color: C.line }}>⚖</span><PanView pan={r} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 8 }}>
        {p.choices.map((n, i) => (
          <button key={i} aria-label={`${n} kg`} style={{ ...btn, minWidth: 72, color: v.state === 'win' && n === p.answer ? C.ok : C.text }}
            onClick={() => { if (v.state !== 'idle') return; if (n === p.answer) v.win(); else v.fail(() => setP(makeBalance())) }}>
            {n} kg
          </button>
        ))}
      </div>
      </div>
    </Box>
  )
}

// ————————— Niveau 2 · Code secret —————————
type Clue = { guess: string; good: number; misplaced: number }
function score(code: string, guess: string) {
  let good = 0, mis = 0
  for (let i = 0; i < 3; i++) {
    if (guess[i] === code[i]) good++
    else if (code.includes(guess[i])) mis++
  }
  return { good, misplaced: mis }
}
const ALL_CODES: string[] = []
for (let n = 0; n < 1000; n++) {
  const s = String(n).padStart(3, '0')
  if (new Set(s).size === 3) ALL_CODES.push(s)
}

function makeCode(): { code: string; clues: Clue[] } {
  for (;;) {
    const code = pick(ALL_CODES)
    const clues: Clue[] = []
    let cands = ALL_CODES
    for (let step = 0; step < 5 && cands.length > 1; step++) {
      // parmi quelques essais au hasard, l'indice qui élimine le plus de codes
      let best: { clue: Clue; left: string[] } | null = null
      for (let k = 0; k < 60; k++) {
        const guess = pick(ALL_CODES)
        if (guess === code || clues.some((c) => c.guess === guess)) continue
        const sc = score(code, guess)
        const left = cands.filter((x) => { const s = score(x, guess); return s.good === sc.good && s.misplaced === sc.misplaced })
        if (!best || left.length < best.left.length) best = { clue: { guess, ...sc }, left }
      }
      if (!best) break
      clues.push(best.clue)
      cands = best.left
    }
    // au moins 3 indices : il faut croiser les informations
    if (cands.length === 1 && clues.length >= 3) return { code, clues }
  }
}

const NUM = ['Aucun', 'Un', 'Deux', 'Trois']
function clueText({ good, misplaced }: Clue) {
  if (!good && !misplaced) return 'Rien n’est bon'
  const parts: string[] = []
  if (good) parts.push(good === 1 ? 'un chiffre bon et bien placé' : `${NUM[good].toLowerCase()} chiffres bons et bien placés`)
  if (misplaced) parts.push(misplaced === 1 ? 'un chiffre bon mais mal placé' : `${NUM[misplaced].toLowerCase()} chiffres bons mais mal placés`)
  const s = parts.join(', ')
  return s[0].toUpperCase() + s.slice(1)
}

function Code({ onSolved, expose }: Props) {
  const v = useVerdict(onSolved)
  const [p] = useState(makeCode)
  const [entry, setEntry] = useState('')
  useEffect(() => { expose({ kind: 'code', code: p.code }) }, [p, expose])
  const press = (d: string) => {
    if (v.state !== 'idle' || entry.length >= 3) return
    const next = entry + d
    setEntry(next)
    if (next.length === 3) {
      if (next === p.code) v.win()
      else v.fail(() => setEntry(''))
    }
  }
  return (
    <Box state={v.state} row>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Hint>Trouve le code à 3 chiffres (tous différents).</Hint>
        {p.clues.map((c) => (
          <div key={c.guess} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 20, fontWeight: 800, letterSpacing: 3, color: C.line }}>{c.guess}</span>
            <span>{clueText(c)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 38, height: 44, border: `2px solid ${v.state === 'win' ? C.ok : C.line}`, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>{entry[i] ?? ''}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 46px)', gap: 4 }}>
          {[...'1234567890'].map((d) => (
            <button key={d} aria-label={`Chiffre ${d}`} style={{ ...btn, minWidth: 0, minHeight: 0, width: 46, height: 46, padding: 0 }} onClick={() => press(d)}>{d}</button>
          ))}
        </div>
        <button style={{ ...btn, fontSize: 15, minHeight: 40, padding: '4px 12px' }} onClick={() => v.state === 'idle' && setEntry((e) => e.slice(0, -1))}>Effacer</button>
      </div>
    </Box>
  )
}

// ————————— Fenêtre commune —————————
const TITLES: Record<ChallengeId, string> = {
  rotation: 'Le cercle brisé', suite: 'La suite', intrus: 'L’intrus',
  lumieres: 'Les lumières', allumettes: 'Les allumettes', balance: 'La balance', code: 'Le code',
}
const VIEWS: Record<ChallengeId, (p: Props) => JSX.Element> = {
  rotation: Rotation, suite: Suite, intrus: Intrus, lumieres: Lumieres, allumettes: Allumettes, balance: Balance, code: Code,
}

export function ChallengeWindow({ id, onSolved, onAbort, expose }: { id: ChallengeId; onSolved: () => void; onAbort: () => void; expose: (info: unknown) => void }) {
  const View = VIEWS[id]
  const [won, setWon] = useState(false)
  const solved = useMemo(() => () => { setWon(true); window.setTimeout(onSolved, 350) }, [onSolved])
  return (
    <div
      role="dialog"
      aria-label={`Défi : ${TITLES[id]}`}
      data-testid="challenge"
      style={{
        position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top, 0px) + 54px)', bottom: 8, transform: 'translateX(-50%)',
        width: 'min(640px, calc(100vw - 24px))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '8px 14px', overflow: 'auto', background: 'rgba(22, 15, 6, .94)', border: `3px solid ${won ? C.ok : C.blue}`, borderRadius: 14,
        boxShadow: `0 0 28px ${won ? 'rgba(79,220,132,.5)' : 'rgba(90,168,255,.45)'}`, color: C.text, fontFamily: sans, touchAction: 'manipulation',
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800, color: won ? C.ok : C.blue }}>{won ? 'Réussi !' : TITLES[id]}</div>
        <button aria-label="Abandonner le défi" onClick={onAbort} style={{ ...btn, fontSize: 14, minHeight: 40, padding: '4px 12px' }}>Abandonner</button>
      </div>
      <style>{'@keyframes br-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}'}</style>
      <div style={{ margin: 'auto 0' }}>
        <View onSolved={solved} expose={expose} />
      </div>
    </div>
  )
}

