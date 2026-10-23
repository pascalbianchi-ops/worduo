// Joue l'easter egg « backroom » de bout en bout sur un iPhone émulé (WebKit,
// paysage, tactile) : le meneur tape « backroom », le mini-FPS s'ouvre, puis
// un bot joue les niveaux 1 et 2 avec les contrôles tactiles et résout les
// défis au doigt. Vérifie : dopamine jamais au-dessus de 90 % grâce aux objets,
// sortie jamais ouverte sans effort plein, passage secret ouvert hors champ,
// défis en moins d'une minute, mort quand la dopamine tombe à zéro.
//
// Usage : npx vite build && node e2e/backroom-play.mjs
//   SHOTS_DIR=dossier pour les captures (défaut : <tmp>/backroom-shots)
//   HEADFUL=1 pour voir le navigateur.
import { webkit, devices } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3600 + Math.floor(Math.random() * 300)
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'backroom-shots')
fs.mkdirSync(SHOTS, { recursive: true })

const problems = []
const fail = (msg) => { problems.push(msg); console.log(`   ✖ ${msg}`) }
const ok = (msg) => console.log(`   ✔ ${msg}`)

function startServer(logs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
    const onData = (buf) => {
      const text = buf.toString()
      logs.push(...text.split(/\r?\n/).filter(Boolean))
      if (text.includes('Server listening')) resolve(proc)
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', (code) => reject(new Error(`server exited (${code})`)))
  })
}

// ————————— Pilotage —————————
function makeBot(page, onAppear = async () => { }) {
  // Garde la trace du malaise maximal observé (remis à zéro par resetDread)
  // et signale chaque ombre au moment où elle se montre
  let maxDread = 0
  const seen = new Set()
  const state = async () => {
    const s = await page.evaluate(() => window.__backroom?.state)
    if (s) {
      maxDread = Math.max(maxDread, s.dread)
      for (const [id, a] of Object.entries(s.apps)) {
        if (a.phase !== 'idle' && !seen.has(id)) { seen.add(id); await onAppear(id, a, s) }
      }
    }
    return s
  }
  const resetDread = () => { maxDread = 0 }
  const getMaxDread = () => maxDread
  const btn = (name) => page.getByRole('button', { name, exact: true })

  // Appui maintenu : un vrai doigt ne peut pas être « tenu » avec l'API
  // touchscreen de Playwright, on envoie donc pointerdown / pointerup tactiles.
  let pid = 10
  async function hold(name, ms) {
    const id = pid++
    const init = { pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 }
    await btn(name).dispatchEvent('pointerdown', init)
    await page.waitForTimeout(ms)
    // le bouton peut avoir disparu entre-temps (sortie, défi) : on n'attend pas
    await btn(name).dispatchEvent('pointerup', { ...init, buttons: 0 }, { timeout: 500 }).catch(() => { })
  }

  // Tap réel (touchstart/touchend + pointer events générés par WebKit)
  async function tap(name) {
    const box = await btn(name).boundingBox()
    if (!box) throw new Error(`bouton ${name} introuvable`)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(120)
  }

  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a))

  async function turnTo(target) {
    for (let i = 0; i < 80; i++) {
      const s = await state()
      const diff = norm(target - s.a)
      if (Math.abs(diff) < 0.07) return
      await hold(diff > 0 ? 'Droite' : 'Gauche', Math.max(20, Math.min(300, (Math.abs(diff) / 2.4) * 1000 * 0.7)))
    }
    throw new Error(`impossible de s'orienter vers ${target.toFixed(2)}`)
  }

  async function walkTo(tx, ty, tol = 0.2) {
    for (let i = 0; i < 150; i++) {
      const s = await state()
      const dx = tx - s.x, dy = ty - s.y
      const dist = Math.hypot(dx, dy)
      if (dist < tol) return
      const want = Math.atan2(dy, dx)
      if (Math.abs(norm(want - s.a)) > 0.3) await turnTo(want)
      else await hold('Avancer', Math.max(40, Math.min(220, (dist / 2.2) * 1000 * 0.8)))
    }
    const s = await state()
    throw new Error(`bloqué en (${s.x.toFixed(2)}, ${s.y.toFixed(2)}) en route vers (${tx}, ${ty})`)
  }

  return { state, hold, tap, turnTo, walkTo, resetDread, getMaxDread }
}

// Sur les murs actuels du niveau (window.__backroom.level)
function pathfinder(level) {
  const W = level.w, H = level.raw.length
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && level.walls[y * W + x] === 'none'
  function bfs(sx, sy, gx, gy) {
    const prev = new Map([[`${sx},${sy}`, null]])
    const q = [[sx, sy]]
    while (q.length) {
      const [x, y] = q.shift()
      if (x === gx && y === gy) {
        const path = []
        for (let k = `${x},${y}`; k; k = prev.get(k)) path.unshift(k.split(',').map(Number))
        return path
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`
        if (free(nx, ny) && !prev.has(key)) { prev.set(key, `${x},${y}`); q.push([nx, ny]) }
      }
    }
    return null
  }
  return { free, bfs }
}

// Une case murale est-elle (même en partie) dans le champ de vision ? Calcul
// indépendant du jeu : demi-champ du rendu (atan 0.66) et ligne de vue.
function cellVisible(level, p, idx) {
  const W = level.w
  const cx = idx % W, cy = Math.floor(idx / W)
  const pts = [[cx + 0.5, cy + 0.5], [cx + 0.02, cy + 0.02], [cx + 0.98, cy + 0.02], [cx + 0.02, cy + 0.98], [cx + 0.98, cy + 0.98]]
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a))
  return pts.some(([x, y]) => {
    if (Math.abs(norm(Math.atan2(y - p.y, x - p.x) - p.a)) > Math.atan(0.66)) return false
    const n = Math.ceil(Math.hypot(x - p.x, y - p.y) / 0.05)
    for (let i = 1; i < n; i++) {
      const k = Math.floor(p.y + ((y - p.y) * i) / n) * W + Math.floor(p.x + ((x - p.x) * i) / n)
      if (k !== idx && level.walls[k] !== 'none') return false
    }
    return true
  })
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

// Accueil (si affiché) → pseudo → salon → rôle
async function joinAs(page, name, roomId, roleButton) {
  const pseudo = page.getByPlaceholder('Ton pseudo…')
  if (!(await pseudo.isVisible())) await page.getByRole('button', { name: 'Jouer' }).tap()
  await pseudo.fill(name)
  await page.getByRole('button', { name: 'Jouer' }).tap()
  await page.getByPlaceholder('Nom du salon…').fill(roomId)
  await page.getByRole('button', { name: roleButton }).tap()
  await page.locator('.appbar').waitFor()
}

async function giverWord(page) {
  await page.waitForFunction(() => {
    const t = document.querySelector('.gradient-text')?.textContent?.trim()
    return t && t !== '—'
  })
  return (await page.locator('.gradient-text').textContent()).trim()
}

// ————————— Scénario —————————
async function main() {
  const logs = []
  const server = await startServer(logs)
  const browser = await webkit.launch({ headless: !process.env.HEADFUL })
  const context = await browser.newContext({ ...devices['iPhone 13 landscape'] })
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') fail(`console : ${m.text()}`) })
  page.on('pageerror', (e) => fail(`exception JS : ${e.message}`))

  try {
    const room = (n) => `backroom-${n}-${Date.now()}`
    const dialog = page.getByRole('dialog', { name: 'Backroom' })
    const hintInput = page.getByPlaceholder('Écrire un indice percutant...')
    const lobbyVisible = () => page.getByPlaceholder('Ton pseudo…').isVisible()
    const newGuesser = async () => {
      const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'] })
      const gp = await ctx.newPage()
      gp.on('pageerror', (e) => fail(`exception JS (devineur) : ${e.message}`))
      await gp.goto(`http://127.0.0.1:${PORT}`)
      return { ctx, gp }
    }

    console.log('▶ Entrée dans Worduo en meneur')
    await page.goto(`http://127.0.0.1:${PORT}`)
    const room1 = room(1)
    await joinAs(page, 'Alice', room1, '🧠 Meneur')
    ok(`meneur en jeu, mot : ${await giverWord(page)}`)

    // Lobby d'un autre joueur, jusqu'à la liste « Rooms disponibles »
    const openLobby = async (gp, name) => {
      await gp.getByRole('button', { name: 'Jouer' }).tap()
      await gp.getByPlaceholder('Ton pseudo…').fill(name)
      await gp.getByRole('button', { name: 'Jouer' }).tap()
      await gp.getByRole('heading', { name: 'Rooms disponibles' }).waitFor()
    }
    const listed = (gp) => gp.locator('li', { hasText: room1 })

    // Un joueur déjà au lobby voit le salon du meneur, qui attend un devineur
    const observer = await newGuesser()
    await openLobby(observer.gp, 'Carla')
    await listed(observer.gp).waitFor({ timeout: 7000 }).then(
      () => ok('avant : le salon du meneur est visible dans le lobby d’un autre joueur'),
      () => fail('avant : le salon du meneur devrait être listé dans le lobby'))

    console.log('▶ Déclenchement de l’easter egg : le meneur quitte sa partie')
    await hintInput.fill('  BackRoom ')
    await page.getByRole('button', { name: /Envoyer/ }).tap()
    await dialog.waitFor({ timeout: 5000 })
    await page.waitForFunction(() => window.__backroom)
    ok('overlay ouvert')
    await page.waitForTimeout(500)
    if (!logs.some((l) => l.includes('game:leave'))) fail('le meneur n’a pas quitté sa partie (pas de game:leave)')
    else ok('le meneur a quitté sa partie Worduo')
    await shot(page, '01-depart')

    // Le salon ne doit plus être proposé : ni à un joueur arrivé après coup,
    // ni (après rafraîchissement de la liste, toutes les 5 s) à celui déjà là
    {
      const late = await newGuesser()
      await openLobby(late.gp, 'Dan')
      await late.gp.waitForTimeout(1500) // premier chargement de la liste
      if (await listed(late.gp).count()) fail('un nouveau joueur voit encore le salon du meneur parti')
      else ok('nouveau joueur : salon du meneur absent du lobby')
      await shot(late.gp, 'lobby-nouveau-joueur')
      await late.ctx.close()
    }
    await listed(observer.gp).waitFor({ state: 'detached', timeout: 7000 }).then(
      () => ok('joueur déjà au lobby : le salon disparaît au rafraîchissement'),
      () => fail('le salon du meneur reste affiché dans le lobby d’un joueur déjà présent'))
    await observer.ctx.close()

    // Le salon est libéré : un devineur qui le rejoint arrive dans un salon
    // neuf (en attente), pas dans l'ancienne manche sans meneur.
    {
      const { ctx, gp } = await newGuesser()
      await joinAs(gp, 'Bob', room1, '🔍 Devineur')
      const status = (await gp.locator('.appbar .pill', { hasText: 'Statut' }).textContent()).split(':').pop().trim()
      if (status !== 'idle') fail('le salon du meneur n’a pas été libéré : le devineur retrouve l’ancienne manche')
      else ok(`salon libéré (le devineur arrive dans un salon neuf : ${status})`)
      await ctx.close()
    }

    // Les boutons vides ne doivent rien faire
    const appeared = []
    const bot = makeBot(page, async (id, a, s) => {
      const d = Math.hypot(a.x - s.x, a.y - s.y)
      appeared.push({ id, d })
      console.log(`   ✦ ombre « ${id} » aperçue à ${d.toFixed(1)} cases`)
      if (a.phase === 'in') await shot(page, `ombre-${id}`)
    })
    // (la dopamine et l'horloge avancent d'elles-mêmes : on compare le reste)
    const frozen = (s) => JSON.stringify({ x: s.x, y: s.y, a: s.a, prompt: s.prompt, challenge: s.challenge, attempts: s.exitAttempts, habit: s.habit, solved: s.solved })
    const before = await bot.state()
    for (const b of ['Bouton B', 'Bouton C', 'Bouton D']) await bot.tap(b)
    const after = await bot.state()
    if (frozen(before) !== frozen(after)) fail(`B/C/D ont modifié l’état : ${frozen(after)}`)
    else ok('B, C, D sans effet')

    // Fermer : retour au lobby, puis relancer depuis une nouvelle partie
    await page.getByRole('button', { name: 'Quitter le niveau' }).tap()
    await dialog.waitFor({ state: 'detached' })
    if (!(await lobbyVisible())) fail('le meneur ne revient pas au lobby en quittant le Backroom')
    else ok('fermeture → lobby')
    await joinAs(page, 'Alice', room(2), '🧠 Meneur')
    await giverWord(page)
    await hintInput.fill('backroom')
    await hintInput.press('Enter')
    await dialog.waitFor()
    await page.waitForFunction(() => window.__backroom)
    ok('relancé depuis une nouvelle partie')
    // Bouton son
    const soundBtn = page.getByRole('button', { name: /le son/ })
    const label0 = await soundBtn.getAttribute('aria-label')
    await soundBtn.tap()
    const label1 = await soundBtn.getAttribute('aria-label')
    if (label0 === label1) fail('le bouton son ne bascule pas')
    else ok(`bouton son : « ${label0} » → « ${label1} »`)
    await soundBtn.tap()

    // ————————— Partie : niveau 1 puis niveau 2 —————————
    const st = () => bot.state()
    const lvl = () => page.evaluate(() => window.__backroom.level)
    const pct = (v) => `${Math.round(v * 100)} %`

    // Surveillance continue : dopamine jamais au-dessus de 90 % grâce aux objets
    // (elle démarre à 100 % : seule une hausse compte), sortie jamais ouverte sans effort plein
    let last = null
    let maxRise = 0
    const watch = setInterval(async () => {
      const s = await page.evaluate(() => window.__backroom?.state).catch(() => null)
      if (!s) return
      // un nouveau niveau (ou une nouvelle partie) repart de 100 % : ce n'est pas une hausse
      const fresh = !last || s.level !== last.level || s.time < last.time
      if (!fresh && s.dopamine > last.dopamine + 1e-4) maxRise = Math.max(maxRise, s.dopamine)
      last = s
      if ((s.doorOpen || s.rungs) && s.effort < 1 - 1e-6) fail(`sortie ouverte avec un effort de ${pct(s.effort)}`)
    }, 100)

    // Pathfinding sur les murs actuels (les passages s'ouvrent en cours de partie)
    async function travel(gx, gy, label) {
      const L = await lvl()
      const pf = pathfinder(L)
      const s = await st()
      const path = pf.bfs(Math.floor(s.x), Math.floor(s.y), gx, gy)
      if (!path) throw new Error(`aucun chemin vers ${label}`)
      for (const [x, y] of path.slice(1)) {
        await bot.walkTo(x + 0.5, y + 0.5, 0.3)
        if ((await st()).status !== 'play') return
      }
      await bot.walkTo(gx + 0.5, gy + 0.5, 0.2)
    }

    /** Se poste devant un mur (borne, porte, échelle) et le regarde */
    async function faceWall(wx, wy, label) {
      const L = await lvl()
      const pf = pathfinder(L)
      const s = await st()
      const cands = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [wx + dx, wy + dy]).filter(([x, y]) => pf.free(x, y))
        .map((c) => ({ c, p: pf.bfs(Math.floor(s.x), Math.floor(s.y), c[0], c[1]) })).filter((o) => o.p).sort((a, b) => a.p.length - b.p.length)
      if (!cands.length) throw new Error(`${label} inaccessible`)
      const [nx, ny] = cands[0].c
      await travel(nx, ny, label)
      await bot.turnTo(Math.atan2(wy - ny, wx - nx))
    }

    async function eatUntil(target, maxSteps, label) {
      for (;;) {
        const s = await st()
        if (s.dopamine >= target) return
        const L = await lvl()
        const pf = pathfinder(L)
        const opts = s.items.filter((it) => it.state === 'idle' && it.behavior === 'still')
          .map((it) => ({ it, p: pf.bfs(Math.floor(s.x), Math.floor(s.y), Math.floor(it.x), Math.floor(it.y)) }))
          .filter((o) => o.p && o.p.length - 1 <= maxSteps).sort((a, b) => a.p.length - b.p.length)
        if (!opts.length) { if (target < 1) console.log(`   · ${label} : plus aucun objet à ${maxSteps} pas (${pct(s.dopamine)})`); return }
        const { it } = opts[0]
        await travel(Math.floor(it.x), Math.floor(it.y), `${label} : ${it.kind}`)
        const s1 = await st()
        if (!s1.prompt?.startsWith('A : prendre')) fail(`${it.kind} : invite « A : prendre » absente (${JSON.stringify(s1.prompt)})`)
        await bot.tap('Bouton A')
        const s2 = await st()
        if (s2.dopamine > 0.9 + 1e-6 && s2.dopamine > s1.dopamine) fail(`dopamine à ${pct(s2.dopamine)} après ${it.kind}`)
        console.log(`   · ${label} : ${it.kind} ${pct(s1.dopamine)} → ${pct(s2.dopamine)}${s2.items.find((x) => x.x === it.x && x.y === it.y).state === 'gone' ? '' : ' (PAS RAMASSÉ)'}`)
      }
    }

    async function tryExit(expectOpen) {
      const L = await lvl()
      await faceWall(L.exit.x, L.exit.y, L.exit.kind)
      const s0 = await st()
      const want = L.exit.kind === 'door' ? 'A : ouvrir la porte' : 'A : monter'
      if (s0.prompt !== want) fail(`invite attendue « ${want} », obtenu ${JSON.stringify(s0.prompt)}`)
      await bot.tap('Bouton A')
      const s = await st()
      const opened = L.exit.kind === 'door' ? s.doorOpen : s.rungs
      if (opened !== expectOpen) fail(`${L.exit.kind} : ${opened ? 'ouverte' : 'refusée'} avec un effort de ${pct(s.effort)}`)
      if (!opened) {
        const refused = page.getByTestId('sortie-refusee')
        if (!(await refused.isVisible())) fail('sortie refusée sans retour visuel (dopamine barrée)')
        const effortShown = await refused.getByTestId('refus-effort').count()
        if (s.effortLit && !effortShown) fail('sortie refusée : la jauge d’effort n’est pas montrée')
        if (await page.getByText(/dopamine|effort/i).count()) fail('la règle est expliquée par écrit')
      }
      ok(`${L.exit.kind} essai n°${s.exitAttempts} à ${pct(s.dopamine)} · effort ${pct(s.effort)} → ${opened ? 'OUVERTE' : 'refusée'}`)
      return s
    }

    // ——— Défis : le bot les résout au doigt (taps réels) grâce à la solution exposée ———
    async function tapEl(locator) {
      const box = await locator.boundingBox()
      if (!box) throw new Error('élément de défi introuvable')
      if (box.width < 40 || box.height < 40) smallTargets.add(`${Math.round(box.width)}×${Math.round(box.height)}`)
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(140)
    }
    const smallTargets = new Set()
    const win = page.getByTestId('challenge')

    async function solve(info) {
      if (info.kind === 'rotation') {
        for (let k = 0; k < info.rots.length; k++) {
          for (let n = 0; n < (4 - info.rots[k]) % 4; n++) await tapEl(win.getByRole('button', { name: `Pièce ${k + 1}`, exact: true }))
        }
      } else if (info.kind === 'suite') await tapEl(win.getByRole('button', { name: `Choix ${info.answer + 1}`, exact: true }))
      else if (info.kind === 'intrus') await tapEl(win.getByRole('button', { name: `Élément ${info.answer + 1}`, exact: true }))
      else if (info.kind === 'lumieres') for (const k of info.presses) await tapEl(win.getByRole('button', { name: `Lumière ${k + 1}`, exact: true }))
      else if (info.kind === 'allumettes') {
        await tapEl(win.locator(`[data-slot="${info.from}"]`))
        await tapEl(win.locator(`[data-slot="${info.to}"]`))
      } else if (info.kind === 'balance') await tapEl(win.locator('button').filter({ hasText: /kg$/ }).nth(info.answer))
      else if (info.kind === 'code') for (const d of info.code) await tapEl(win.getByRole('button', { name: `Chiffre ${d}`, exact: true }))
    }

    async function doBorne(num) {
      const L = await lvl()
      const b = L.bornes.find((x) => x.num === num)
      await faceWall(b.x, b.y, `borne ${num}`)
      const s0 = await st()
      if (s0.prompt !== 'A : utiliser la borne') fail(`borne ${num} : invite ${JSON.stringify(s0.prompt)}`)
      await bot.tap('Bouton A')
      await win.waitFor({ timeout: 3000 })
      await page.waitForTimeout(300)
      await shot(page, `defi-n${L.num}-${num}-${b.challenge}`)
      const t0 = Date.now()
      const d0 = (await st()).dopamine
      // pendant le défi la dopamine baisse, mais lentement ; la croix disparaît
      const p0 = await st()
      if (await page.getByRole('button', { name: 'Avancer', exact: true }).count()) fail('croix encore affichée pendant un défi')
      await page.waitForTimeout(2000)
      const rate = (d0 - (await st()).dopamine) / ((Date.now() - t0) / 1000)
      const info = (await st()).challengeInfo
      if (!info) throw new Error(`borne ${num} : défi sans solution exposée`)
      await solve(info)
      await win.waitFor({ state: 'detached', timeout: 4000 }).catch(() => fail(`défi ${b.challenge} : la fenêtre ne se ferme pas après la solution`))
      const s = await st()
      const secs = (Date.now() - t0) / 1000
      if (Math.hypot(s.x - p0.x, s.y - p0.y) > 0.01) fail('le joueur a bougé pendant un défi')
      if (!s.solved.includes(num)) fail(`borne ${num} non validée`)
      if (secs > 60) fail(`défi ${b.challenge} : ${secs.toFixed(0)} s`)
      ok(`défi ${b.challenge} réussi au doigt en ${secs.toFixed(1)} s · dopamine ${pct(s.dopamine)} · effort ${pct(s.effort)} (baisse pendant le défi ≈ ${(rate * 100).toFixed(2)} %/s)`)
      return s
    }

    console.log('▶ Niveau 1')
    {
      const L = await lvl()
      if (L.num !== 1) fail(`on démarre au niveau ${L.num}`)
      const s = await st()
      if (s.effortLit || s.effort !== 0) fail('jauge d’effort allumée au départ')
      if (s.dopamine < 0.95) fail(`dopamine au départ ${pct(s.dopamine)}`)
      await shot(page, 'n1-depart')
    }
    // Les bornes sont inaccessibles au départ
    {
      const L = await lvl()
      const pf = pathfinder(L)
      const s = await st()
      for (const b of L.bornes) {
        const reach = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => pf.free(b.x + dx, b.y + dy) && pf.bfs(Math.floor(s.x), Math.floor(s.y), b.x + dx, b.y + dy))
        if (reach) fail(`borne ${b.num} accessible dès le départ`)
      }
      ok('aucune borne accessible au départ')
    }
    // Parcours linéaire jusqu'à la porte, en mangeant ce qui est sur le chemin
    await eatUntil(1, 2, 'chemin')
    await tryExit(false)
    await shot(page, 'n1-porte-refusee')
    if ((await st()).gates.secret !== 'closed') fail('passage secret ouvert dès le 1er essai')
    // Il repart manger jusqu'à ~90 %, retente : échec, et le passage s'ouvre en secret
    for (let k = 0; k < 4 && (await st()).gates.secret !== 'open'; k++) {
      await eatUntil(0.89, 20, 'recharge')
      await tryExit(false)
    }
    {
      const s = await st()
      const L = await lvl()
      if (s.gates.secret !== 'open' || !s.secretLog) fail('le passage secret ne s’est pas ouvert')
      else {
        const log = s.secretLog
        if (log.attempts !== 2) fail(`passage ouvert au ${log.attempts}e essai (attendu : au 2e échec, après être remonté à ~90 %)`)
        // Vérification indépendante : aucune case du passage dans le champ de vision au moment de l'ouverture
        const gate = L.gates.find((g) => g.id === 'secret')
        const seen = gate.cells.some((idx) => cellVisible(L, log, idx))
        if (seen) fail(`passage ouvert sous les yeux du joueur (a=${log.a.toFixed(2)})`)
        else ok(`passage secret ouvert hors champ, au ${log.attempts}e essai, à ${pct(log.dopamine)} de dopamine`)
        const diversion = s.items.find((it) => it.kind === 'tele' && it.behavior === 'still' && it.state === 'idle' && Math.hypot(it.x - 22.5, it.y - 12.5) < 0.1)
        if (!diversion) fail('pas d’objet de diversion à l’ouverture du passage')
        // En repartant de la porte, le joueur voit le passage et sa lueur bleue
        await bot.turnTo(Math.PI)
        await page.waitForTimeout(250)
        await shot(page, 'n1-passage-secret-vu-en-repartant')
        const s2 = await st()
        const visible = gate.cells.some((idx) => cellVisible(L, s2, idx))
        if (!visible) fail('le passage reste invisible en repartant de la porte')
        else ok('en repartant de la porte, le passage est en vue')
      }
    }
    await doBorne(1)
    {
      const s = await st()
      if (!s.effortLit) fail('jauge d’effort éteinte après le 1er défi')
      if (s.gates.zone !== 'open') fail('la zone des défis suivants ne s’est pas ouverte')
      else ok('effort allumé, nouvelle zone ouverte')
      await shot(page, 'n1-zone-ouverte')
    }
    await tryExit(false) // la porte montre l'effort accompli (1/3)
    await shot(page, 'n1-porte-effort-1-3')
    await doBorne(2)
    await eatUntil(0.6, 4, 'zone')
    await doBorne(3)
    {
      const s = await st()
      if (s.effort < 1 - 1e-6) fail(`effort ${pct(s.effort)} après les 3 défis`)
    }
    await tryExit(true)
    await shot(page, 'n1-porte-ouverte')
    {
      const L = await lvl()
      await travel(L.exit.x, L.exit.y, 'porte ouverte')
      // droit dans la lumière, jusqu'à ce que la sortie s'enclenche
      await bot.turnTo(Math.atan2(L.beyond.y - L.exit.y, L.beyond.x - L.exit.x))
      for (let k = 0; k < 10 && (await st()).status === 'play' && (await st()).level === 1; k++) await bot.hold('Avancer', 200)
      await page.waitForFunction(() => window.__backroom.state.level === 2, null, { timeout: 8000 })
      await page.getByText('NIVEAU 2').waitFor({ timeout: 3000 }).then(() => ok('porte franchie → NIVEAU 2'), () => fail('pas d’écran « NIVEAU 2 »'))
      await shot(page, 'n2-titre')
      await page.waitForFunction(() => window.__backroom.state.between === 'none', null, { timeout: 5000 })
    }

    console.log('▶ Niveau 2')
    {
      const s = await st()
      if (s.effort !== 0 || s.effortLit) fail('niveau 2 : la jauge d’effort ne repart pas de zéro')
      if (s.dopamine < 0.99) fail(`niveau 2 : dopamine au départ ${pct(s.dopamine)}`)
      await bot.turnTo(0)
      await shot(page, 'n2-depart-echelle-au-loin')
    }
    await doBorne(1)
    await tryExit(false)
    await shot(page, 'n2-echelle-refusee')
    for (const n of [2, 4, 3]) {
      await doBorne(n)
      const s = await st()
      const lost = s.items.filter((it) => it.state === 'gone').length
      console.log(`   ℹ objets avalés jusqu’ici : ${lost}`)
    }
    // effort grignoté : on rejoue la borne la plus proche
    for (let k = 0; k < 6 && (await st()).effort < 1 - 1e-6; k++) {
      console.log(`   ℹ effort grignoté (${pct((await st()).effort)}) : borne rejouée`)
      await doBorne(3)
    }
    {
      const s = await st()
      const gone = s.items.filter((it) => it.state === 'gone')
      ok(`niveau 2 : ${gone.length} objet(s) consommé(s) au contact en chemin`)
    }
    // échelle : effort plein → barreaux d'un coup, montée, fin
    for (let k = 0; k < 4; k++) {
      const s = await tryExit((await st()).effort >= 1 - 1e-6)
      if (s.rungs) break
      await doBorne(3)
    }
    await page.waitForTimeout(500)
    await shot(page, 'n2-barreaux')
    await page.getByText('TU ES SORTI').waitFor({ timeout: 6000 }).then(() => ok('montée à l’échelle → écran de fin'), () => fail('écran de fin absent'))
    await shot(page, '99-fin')
    {
      const s = await st()
      ok(`dopamine max après un objet : ${pct(s.maxAfterItem)} (hausse max observée : ${pct(maxRise)})`)
      if (s.maxAfterItem > 0.9 + 1e-6 || maxRise > 0.9 + 1e-6) fail('dopamine au-dessus de 90 % grâce aux objets')
      if (smallTargets.size) fail(`cibles tactiles trop petites dans les défis : ${[...smallTargets].join(', ')}`)
      else ok('toutes les cibles tactiles des défis font au moins 40 px')
    }

    // Rejouer, puis se laisser mourir sans rien faire : écran d'extinction, recommencer le niveau
    console.log('▶ Mort par manque de dopamine')
    await page.getByRole('button', { name: 'Rejouer' }).tap()
    await page.waitForFunction(() => window.__backroom.state.level === 1 && window.__backroom.state.status === 'play')
    {
      const t0 = Date.now()
      await page.getByText('TU T’ES ÉTEINT').waitFor({ timeout: 70000 })
      ok(`immobile, le joueur s’éteint après ${((Date.now() - t0) / 1000).toFixed(0)} s`)
      await shot(page, 'mort')
      await page.getByRole('button', { name: 'Recommencer le niveau' }).tap()
      const s = await st()
      if (s.status !== 'play' || s.dopamine < 0.99 || s.level !== 1) fail('« Recommencer le niveau » ne relance pas le niveau')
      else ok('niveau relancé')
    }
    clearInterval(watch)

    const end = await st()
    if (end.closest < 2.8) fail(`l'ombre ${end.closestId} a été approchée à ${end.closest.toFixed(2)} case(s)`)
    const tooClose = appeared.filter((a) => a.d < 3.5)
    if (tooClose.length) fail(`ombres apparues trop près : ${tooClose.map((a) => `${a.id} à ${a.d.toFixed(1)}`).join(', ')}`)
    ok(`${appeared.length} ombre(s) aperçue(s) en chemin`)

    const fps = await page.evaluate(() => new Promise((r) => {
      let n = 0; const t0 = performance.now()
      const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n) }
      requestAnimationFrame(f)
    }))
    console.log(`   ℹ ${fps} images/s (WebKit headless, indicatif)`)

    await page.getByRole('button', { name: 'Quitter le niveau' }).tap()
    await dialog.waitFor({ state: 'detached' })
    if (!(await lobbyVisible())) fail('quitter le Backroom ne mène pas au lobby')
    else ok('retour au lobby de Worduo')
    if (await page.evaluate(() => '__backroom' in window)) fail('__backroom toujours exposé après fermeture')

    // Le serveur n'a jamais reçu « backroom » comme indice
    const leaked = logs.filter((l) => l.includes('game:hint'))
    if (leaked.length) fail(`indice envoyé au serveur : ${leaked.join(' | ')}`)
    else ok('aucun game:hint reçu par le serveur')

    console.log('▶ Avec un devineur en jeu, « backroom » est un indice normal')
    const room3 = room(3)
    await joinAs(page, 'Alice', room3, '🧠 Meneur')
    const word3 = await giverWord(page)
    const { ctx: guesserCtx, gp } = await newGuesser()
    await joinAs(gp, 'Bob', room3, '🔍 Devineur')
    await page.waitForTimeout(500) // le meneur reçoit l'arrivée du devineur
    await hintInput.fill('backroom')
    await page.getByRole('button', { name: /Envoyer/ }).tap()
    await page.waitForTimeout(1500)
    if (await dialog.isVisible()) fail('le Backroom s’est ouvert alors qu’un devineur joue')
    else ok('Backroom non déclenché')
    if (!(await page.locator('.appbar').isVisible()) || (await giverWord(page)) !== word3) fail('le meneur a quitté sa partie alors qu’un devineur joue')
    else ok('le meneur reste dans sa partie')
    if (!logs.some((l) => l.includes('game:hint'))) fail('« backroom » n’a pas été envoyé comme indice')
    const seen = await gp.locator('.card-sub', { hasText: 'Dernier indice' }).locator('b').textContent().catch(() => null)
    if (seen?.trim().toLowerCase() !== 'backroom') fail(`indice vu par le devineur : ${JSON.stringify(seen)}`)
    else ok('le devineur reçoit l’indice « backroom »')
    await guesserCtx.close()
  } catch (e) {
    fail(`exception : ${e.message.split('\n')[0]}`)
    await shot(page, 'erreur').catch(() => { })
    console.log('   état :', JSON.stringify(await page.evaluate(() => window.__backroom?.state).catch(() => null)))
  } finally {
    await browser.close()
    server.kill()
  }

  console.log(`\nCaptures : ${SHOTS}`)
  console.log(problems.length ? `❌ ${problems.length} problème(s)` : '✅ niveaux 1 et 2 terminés sans problème')
  process.exit(problems.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
