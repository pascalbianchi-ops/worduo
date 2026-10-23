// Simulation accélérée de l'équilibrage du Backroom (sans navigateur) : la
// vraie logique du jeu (game.ts) pilotée par des joueurs scriptés.
//   - « appliqué »  : va droit au but, fait les défis (durée humaine simulée)
//   - « mangeur »   : ne fait que manger et retente la porte
//
// Usage : npx esbuild e2e/backroom-balance.ts --bundle --platform=node --outfile=<tmp>/bal.cjs && node <tmp>/bal.cjs
//   CHALLENGE_S=secondes par défi (défaut 30, plusieurs valeurs : CHALLENGE_S=20,30,45)
import { newGame, update, action, endChallenge, type GameState, type Input } from '../src/easter/backroom/game'

const DT = 1 / 60
const input: Input = { up: false, down: false, left: false, right: false }
const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

function free(s: GameState, x: number, y: number) {
  return x >= 0 && y >= 0 && x < s.level.w && y < s.level.h && s.level.walls[y * s.level.w + x] === 'none'
}

function bfs(s: GameState, gx: number, gy: number, allowGoalWall = false) {
  const sx = Math.floor(s.x), sy = Math.floor(s.y)
  const prev = new Map<string, string | null>([[`${sx},${sy}`, null]])
  const q: [number, number][] = [[sx, sy]]
  while (q.length) {
    const [x, y] = q.shift()!
    if (x === gx && y === gy) {
      const path: [number, number][] = []
      for (let k: string | null | undefined = `${x},${y}`; k; k = prev.get(k)) path.unshift(k.split(',').map(Number) as [number, number])
      return path
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`
      if ((free(s, nx, ny) || (allowGoalWall && nx === gx && ny === gy)) && !prev.has(key)) { prev.set(key, `${x},${y}`); q.push([nx, ny]) }
    }
  }
  return null
}

class Sim {
  s: GameState
  t = 0
  log: string[] = []
  noAvoidUntil = 0
  lastPos: [number, number] | null = null
  constructor(public num: 1 | 2, public avoid = false) { this.s = newGame(num) }
  get alive() { return this.s.status === 'play' }
  tick() {
    const before = this.s.items.map((it) => it.state)
    update(this.s, input, DT)
    this.s.items.forEach((it, k) => { if (before[k] !== 'gone' && it.state === 'gone' && process.env.TRACE) this.log.push(`    · t=${this.t.toFixed(0)}s ${it.spec.kind} (${it.spec.behavior}, départ ${it.spec.x - 0.5},${it.spec.y - 0.5}) consommé, effort ${(this.s.effort * 100).toFixed(0)} %`) })
    this.t += DT
  }
  wait(sec: number) { for (let i = 0; i < sec / DT && this.alive; i++) this.tick() }
  /** Avance vers un point en tournant d'abord (comme un joueur au pouce) */
  stepTo(tx: number, ty: number, tol = 0.25) {
    for (let i = 0; i < 2000 && this.alive; i++) {
      const dx = tx - this.s.x, dy = ty - this.s.y
      if (Math.hypot(dx, dy) < tol) break
      // esquive : un objet droit devant et proche → on s'écarte de 70° du côté opposé
      let want = Math.atan2(dy, dx)
      if (this.avoid && this.t > this.noAvoidUntil) for (const it of this.s.items) {
        if (it.state !== 'active' && !(it.spec.behavior === 'ambush' && it.state === 'idle')) continue
        const d = Math.hypot(it.x - this.s.x, it.y - this.s.y)
        const rel = norm(Math.atan2(it.y - this.s.y, it.x - this.s.x) - want)
        if (d < 2 && Math.abs(rel) < 0.9) { want -= Math.sign(rel || 1) * 1.2; break }
      }
      // coincé (mur) : on arrête d'esquiver un moment
      if (i % 120 === 0) {
        if (this.lastPos && Math.hypot(this.s.x - this.lastPos[0], this.s.y - this.lastPos[1]) < 0.3) this.noAvoidUntil = this.t + 2
        this.lastPos = [this.s.x, this.s.y]
      }
      const diff = norm(want - this.s.a)
      input.left = diff < -0.08; input.right = diff > 0.08
      input.up = Math.abs(diff) < 0.5
      this.tick()
    }
    input.left = input.right = input.up = false
  }
  goCell(gx: number, gy: number) {
    const path = bfs(this.s, gx, gy)
    if (!path) throw new Error(`niveau ${this.num} : aucun chemin vers (${gx}, ${gy})`)
    for (const [x, y] of path.slice(1)) { this.stepTo(x + 0.5, y + 0.5, 0.3); if (!this.alive) return }
  }
  face(x: number, y: number) {
    for (let i = 0; i < 600 && this.alive; i++) {
      const diff = norm(Math.atan2(y + 0.5 - this.s.y, x + 0.5 - this.s.x) - this.s.a)
      if (Math.abs(diff) < 0.05) break
      input.left = diff < 0; input.right = diff > 0
      this.tick()
    }
    input.left = input.right = false
  }
  /** Se poste sur une case libre voisine du mur (x, y) et le regarde */
  approachWall(x: number, y: number) {
    const cands = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => free(this.s, nx, ny))
    const best = cands.map((c) => ({ c, p: bfs(this.s, c[0], c[1]) })).filter((o) => o.p).sort((a, b) => a.p!.length - b.p!.length)[0]
    if (!best) throw new Error(`mur (${x}, ${y}) inaccessible`)
    this.goCell(best.c[0], best.c[1])
    this.face(x, y)
  }
  /** Ramasse les objets « still » accessibles à moins de `maxSteps` cases */
  eatNearby(maxSteps: number, until = 1) {
    for (;;) {
      if (!this.alive || this.s.dopamine >= until) return
      const options = this.s.items
        .filter((it) => it.state === 'idle' && it.spec.behavior === 'still')
        .map((it) => ({ it, p: bfs(this.s, Math.floor(it.x), Math.floor(it.y)) }))
        .filter((o) => o.p && o.p.length - 1 <= maxSteps)
        .sort((a, b) => a.p!.length - b.p!.length)
      if (!options.length) return
      const { it } = options[0]
      this.goCell(Math.floor(it.x), Math.floor(it.y))
      action(this.s)
    }
  }
  doChallenge(borne: number, sec: number) {
    const b = this.s.level.bornes.find((x) => x.num === borne)!
    this.approachWall(b.x, b.y)
    if (!this.alive) return
    action(this.s)
    if (!this.s.challenge) throw new Error(`borne ${borne} : pas de défi`)
    this.wait(sec)
    if (!this.alive) return
    endChallenge(this.s, true)
    this.log.push(`  t=${this.t.toFixed(0)}s borne ${borne} réussie · dopamine ${(this.s.dopamine * 100).toFixed(0)} % · effort ${(this.s.effort * 100).toFixed(0)} %`)
  }
  tryExit() {
    const e = this.s.level.exit
    this.approachWall(e.x, e.y)
    action(this.s)
    this.log.push(`  t=${this.t.toFixed(0)}s essai sortie n°${this.s.exitAttempts} à ${(this.s.dopamine * 100).toFixed(0)} % · effort ${(this.s.effort * 100).toFixed(0)} %${this.s.secretLog?.attempts === this.s.exitAttempts ? ' → passage secret ouvert' : ''}`)
  }
  report(label: string) {
    const st = this.s.status === 'dead' ? `MORT à ${this.t.toFixed(0)} s` : this.s.status === 'play' ? `en vie à ${this.t.toFixed(0)} s` : `SORTI à ${this.t.toFixed(0)} s`
    console.log(`${label} : ${st} (max après objet : ${(this.s.maxAfterItem * 100).toFixed(1)} %, ${this.s.habit} objets)`)
    for (const l of this.log) console.log(l)
  }
}

function level1Diligent(ch: number) {
  const sim = new Sim(1)
  const e = sim.s.level.exit
  sim.eatNearby(1) // ce qui est sur le chemin
  sim.tryExit()
  // repart manger jusqu'à ~90 %, retente la porte, jusqu'à ce que le passage s'ouvre
  while (sim.alive && sim.s.gates.secret !== 'open' && sim.s.exitAttempts < 6) {
    sim.eatNearby(14, 0.88)
    sim.tryExit()
    sim.wait(0.1)
  }
  sim.doChallenge(1, ch)
  sim.eatNearby(3)
  sim.doChallenge(2, ch)
  sim.eatNearby(3)
  sim.doChallenge(3, ch)
  sim.tryExit()
  if (sim.s.doorOpen && sim.s.level.beyond) { sim.goCell(e.x, e.y); sim.stepTo(sim.s.level.beyond.x + 0.5, sim.s.level.beyond.y + 0.5) }
  sim.wait(3)
  sim.report(`Niveau 1, joueur appliqué (défis de ${ch} s)`)
  return sim
}

function level1Eater() {
  const sim = new Sim(1)
  sim.eatNearby(1)
  sim.tryExit()
  for (let k = 0; k < 6 && sim.alive; k++) {
    sim.eatNearby(40)
    if (sim.alive) sim.tryExit()
  }
  // les nouveaux objets de la zone, sans jamais faire de défi : impossible, la zone ne s'ouvre qu'avec le 1er défi
  while (sim.alive) { sim.eatNearby(80); if (!sim.alive) break; sim.tryExit(); sim.wait(5) }
  sim.report('Niveau 1, mangeur')
}

function level2Diligent(ch: number, avoid: boolean) {
  const sim = new Sim(2, avoid)
  // ordre des bornes au plus court, sans chercher à éviter les objets (pire cas)
  const order = [1, 2, 4, 3]
  for (const b of order) { sim.doChallenge(b, ch); if (!sim.alive) break }
  let replays = 0
  while (sim.alive && sim.s.effort < 1 - 1e-6 && replays < 6) { sim.doChallenge(3, ch); replays++ }
  if (sim.alive) sim.tryExit()
  sim.wait(3)
  sim.report(`Niveau 2, joueur appliqué ${avoid ? 'qui esquive' : "qui n'esquive rien"} (défis de ${ch} s, ${replays} borne(s) rejouée(s))`)
}

function level2Eater() {
  const sim = new Sim(2)
  // se promène au centre et se laisse rattraper par tout ce qui passe
  const spots = [[17, 9], [3, 3], [17, 9], [5, 16], [17, 9], [30, 3], [17, 9], [29, 15], [28, 9]]
  while (sim.alive) for (const [x, y] of spots) { sim.goCell(x, y); if (!sim.alive) break }
  sim.report('Niveau 2, mangeur')
}

const durations = (process.env.CHALLENGE_S ?? '30').split(',').map(Number)
for (const ch of durations) level1Diligent(ch)
level1Eater()
for (const ch of durations) { level2Diligent(ch, true); level2Diligent(ch, false) }
level2Eater()
