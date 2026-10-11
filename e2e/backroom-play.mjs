// Joue l'easter egg « backroom » de bout en bout sur un iPhone émulé (WebKit,
// paysage, tactile) : le meneur tape « backroom », le mini-FPS s'ouvre, puis
// un bot lit les 3 indices et ramasse les 3 objets avec les contrôles tactiles.
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
function makeBot(page) {
  const state = () => page.evaluate(() => window.__backroom?.state)
  const btn = (name) => page.getByRole('button', { name, exact: true })

  // Appui maintenu : un vrai doigt ne peut pas être « tenu » avec l'API
  // touchscreen de Playwright, on envoie donc pointerdown / pointerup tactiles.
  let pid = 10
  async function hold(name, ms) {
    const id = pid++
    const init = { pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 }
    await btn(name).dispatchEvent('pointerdown', init)
    await page.waitForTimeout(ms)
    await btn(name).dispatchEvent('pointerup', { ...init, buttons: 0 })
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

  return { state, hold, tap, turnTo, walkTo }
}

function pathfinder(raw) {
  const H = raw.length, W = raw[0].length
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !/[#o0-9]/.test(raw[y][x])
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

async function travel(bot, pf, gx, gy, label) {
  const s = await bot.state()
  const path = pf.bfs(Math.floor(s.x), Math.floor(s.y), gx, gy)
  if (!path) throw new Error(`aucun chemin vers ${label}`)
  for (const [x, y] of path.slice(1)) await bot.walkTo(x + 0.5, y + 0.5, 0.3)
  await bot.walkTo(gx + 0.5, gy + 0.5, 0.2)
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
    const bot = makeBot(page)
    const before = await bot.state()
    for (const b of ['Bouton B', 'Bouton C', 'Bouton D']) await bot.tap(b)
    const after = await bot.state()
    if (JSON.stringify(before) !== JSON.stringify(after)) fail(`B/C/D ont modifié l’état : ${JSON.stringify(after)}`)
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

    const level = await page.evaluate(() => window.__backroom.level)
    const pf = pathfinder(level.raw)
    const clue = (id) => level.clues.find((c) => c.id === id)
    const item = (id) => level.items.find((i) => i.id === id)

    async function readClue(id, keyword) {
      const c = clue(id)
      const [nx, ny] = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [c.x + dx, c.y + dy]).find(([x, y]) => pf.free(x, y))
      await travel(bot, pf, nx, ny, `indice ${id}`)
      await bot.turnTo(Math.atan2(c.y - ny, c.x - nx))
      const s = await bot.state()
      if (s.prompt !== 'A : lire le mur') fail(`indice ${id} : invite attendue « A : lire le mur », obtenu ${JSON.stringify(s.prompt)}`)
      await bot.tap('Bouton A')
      const msg = (await bot.state()).message
      if (!msg?.includes(keyword)) fail(`indice ${id} : message ${JSON.stringify(msg)}`)
      else ok(`indice ${id} lu : ${msg.slice(0, 60)}…`)
      await shot(page, `indice-${id}`)
      // Déplacement bloqué tant que le message est affiché
      const p0 = await bot.state()
      await bot.hold('Avancer', 300)
      const p1 = await bot.state()
      if (Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.01) fail('le joueur bouge alors qu’un message est affiché')
      await bot.tap('Bouton A')
      if ((await bot.state()).message) fail(`indice ${id} : le message ne se ferme pas avec A`)
    }

    async function pickUp(id, n) {
      const it = item(id)
      // Capture en approche, à deux cases, pour vérifier que l'objet est visible
      const s0 = await bot.state()
      const path = pf.bfs(Math.floor(s0.x), Math.floor(s0.y), Math.floor(it.x), Math.floor(it.y))
      if (path && path.length > 3) {
        const [ax, ay] = path[path.length - 3]
        await travel(bot, pf, ax, ay, `approche ${id}`)
        await bot.turnTo(Math.atan2(it.y - (ay + 0.5), it.x - (ax + 0.5)))
        await page.waitForTimeout(150)
        await shot(page, `approche-${id}`)
      }
      await travel(bot, pf, Math.floor(it.x), Math.floor(it.y), id)
      await shot(page, `objet-${id}`)
      const s = await bot.state()
      if (!s.prompt?.startsWith('A : ramasser')) fail(`${id} : invite de ramassage absente (${JSON.stringify(s.prompt)})`)
      await bot.tap('Bouton A')
      const s2 = await bot.state()
      if (!s2.found.includes(id)) fail(`${id} non ramassé`)
      else ok(`${id} ramassé (${s2.found.length}/3)`)
      if (n < 3) {
        if (!s2.message) fail(`${id} : pas de message de confirmation`)
        await bot.tap('Bouton A')
      }
    }

    console.log('▶ Partie')
    await readClue(1, 'CASSEROLE')
    await pickUp('casserole', 1)
    await readClue(2, 'TÉLÉ')
    await pickUp('tele', 2)
    await readClue(3, 'BROSSE')
    await pickUp('brosse', 3)

    const end = await bot.state()
    if (!end.done) fail('niveau non terminé après les 3 objets')
    await page.getByText('NIVEAU 1 TERMINÉ').waitFor({ timeout: 3000 }).then(() => ok('écran de victoire'), () => fail('écran de victoire absent'))
    await shot(page, '99-victoire')

    const fps = await page.evaluate(() => new Promise((r) => {
      let n = 0; const t0 = performance.now()
      const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(n) }
      requestAnimationFrame(f)
    }))
    console.log(`   ℹ ${fps} images/s (WebKit headless, indicatif)`)

    await page.getByRole('button', { name: 'Retour à Worduo' }).tap()
    await dialog.waitFor({ state: 'detached' })
    if (!(await lobbyVisible())) fail('« Retour à Worduo » ne mène pas au lobby')
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
  console.log(problems.length ? `❌ ${problems.length} problème(s)` : '✅ niveau 1 terminé sans problème')
  process.exit(problems.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
