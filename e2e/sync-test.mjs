// Test de bout en bout de la synchronisation Socket.IO entre deux joueurs.
//
// Lance le serveur Worduo en local (qui sert aussi le build Vite de dist/),
// ouvre deux navigateurs headless (meneur + devineur), chacun derrière son
// propre proxy réseau (e2e/net-proxy.mjs) pour pouvoir dégrader la connexion
// d'un seul joueur, puis déroule plusieurs scénarios.
//
// Relevé pour chaque scénario :
//   - erreurs console / exceptions JS / requêtes réseau échouées
//   - déconnexions Socket.IO vues par le client
//   - désynchronisations : les deux joueurs ne voient pas le même état
//     (statut, indice, propositions, mot révélé) après un délai de grâce
//
// Usage : npm run test:e2e   (ou, après un build : node e2e/sync-test.mjs [nomDuScenario...])
//   HEADFUL=1 pour voir les navigateurs.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProxy } from './net-proxy.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_PORT = 3100 + Math.floor(Math.random() * 500)
const SYNC_TIMEOUT = Number(process.env.SYNC_TIMEOUT || 8000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ————————————————— Serveur —————————————————
function startServer(logs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const onData = (buf) => {
      const text = buf.toString()
      logs.push(...text.split(/\r?\n/).filter(Boolean))
      if (text.includes('Server listening')) resolve(proc)
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('exit', (code) => reject(new Error(`server exited early (${code})\n${logs.join('\n')}`)))
  })
}

// ————————————————— Joueurs —————————————————
async function openPlayer(browser, { name, role, roomId, report }) {
  const proxy = createProxy({ targetPort: SERVER_PORT })
  const port = await proxy.listen()
  const baseUrl = `http://127.0.0.1:${port}`
  const context = await browser.newContext()
  const page = await context.newPage()
  const tag = `${name}/${role}`

  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') {
      // Échecs de connexion WebSocket attendus pendant une coupure volontaire
      if (!(report.expectNetErrors && text.includes('WebSocket connection'))) report.issue('console-error', tag, text)
    }
    if (text.includes('disconnected:')) report.event(tag, text)
    if (text.includes('connected, id=')) report.event(tag, text)
  })
  page.on('pageerror', (err) => report.issue('page-error', tag, err.message))
  page.on('requestfailed', (req) => {
    // Les requêtes interrompues pendant une coupure volontaire sont attendues.
    if (report.expectNetErrors) return
    report.issue('request-failed', tag, `${req.method()} ${req.url()} → ${req.failure()?.errorText}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400) report.issue('http-error', tag, `${res.status()} ${res.url()}`)
  })

  const player = { name, role, roomId, page, context, proxy, baseUrl, tag }
  await page.goto(baseUrl)
  await enterGame(player)
  return player
}

async function enterGame(player) {
  const { page } = player
  // Écran d'accueil → Lobby (ou directement le jeu si la session est restaurée)
  await page.getByRole('button', { name: 'Jouer' }).click()
  const inGame = await page.locator('.appbar').first().isVisible({ timeout: 1500 }).catch(() => false)
  if (inGame) return
  await page.getByPlaceholder('Ton pseudo…').fill(player.name)
  await page.getByRole('button', { name: 'Jouer' }).click()
  await page.getByPlaceholder('Nom du salon…').fill(player.roomId)
  await page.getByRole('button', { name: player.role === 'giver' ? '🧠 Meneur' : '🔍 Devineur' }).click()
  await page.locator('.appbar').waitFor({ timeout: 10000 })
}

/** Photographie de ce que le joueur voit à l'écran. */
async function snapshot(player) {
  return player.page.evaluate(() => {
    const txt = (el) => (el?.textContent || '').trim()
    const pills = [...document.querySelectorAll('.appbar .pill')].map(txt)
    const status = (pills.find((p) => p.startsWith('Statut')) || '').replace(/^Statut\s*:\s*/, '')
    const connected = pills.some((p) => p.includes('Connecté') && !p.includes('Déconnecté'))
    const subs = [...document.querySelectorAll('.card-sub')]
    const hintEl = subs.find((s) => txt(s).startsWith('Dernier indice'))
    const lastGuessEl = subs.find((s) => txt(s).startsWith('Dernière réponse'))
    // Liste des propositions : côté devineur "Historique", côté meneur colonne de droite
    let guesses = []
    const guessHeader = subs.find((s) => ['Historique', 'Propositions du devineur'].includes(txt(s)))
    const list = guessHeader?.parentElement?.querySelector('ul.list')
    if (list) guesses = [...list.querySelectorAll('li')].map(txt).reverse()
    const overlay = document.querySelector('.overlay')
    const outcome = overlay ? (overlay.querySelector('.panel-win') ? 'win' : overlay.querySelector('.panel-lose') ? 'lose' : '?') : null
    const reveal = overlay ? txt(overlay.querySelector('.word b')) : null
    return {
      status,
      connected,
      hint: hintEl ? txt(hintEl.querySelector('b')) : undefined,
      lastGuess: lastGuessEl ? txt(lastGuessEl.querySelector('b')) : undefined,
      word: txt(document.querySelector('.gradient-text')) || undefined,
      guesses,
      outcome,
      reveal,
    }
  })
}

// ————————————————— Actions de jeu —————————————————
async function sendHint(giver, hint) {
  const input = giver.page.getByPlaceholder('Écrire un indice percutant...')
  await input.fill(hint)
  await input.press('Enter')
}

async function sendGuess(guesser, guess) {
  const input = guesser.page.getByPlaceholder('Votre proposition...')
  await input.fill(guess)
  await input.press('Enter')
}

async function readWord(giver) {
  await giver.page.waitForFunction(() => {
    const t = document.querySelector('.gradient-text')?.textContent?.trim()
    return t && t !== '—'
  }, null, { timeout: 10000 })
  return (await snapshot(giver)).word
}

// ————————————————— Vérification de synchro —————————————————
/**
 * Attend que les deux joueurs affichent un état cohérent et conforme à
 * `expected` (clés partielles). Retourne false et consigne une
 * désynchronisation si ça n'arrive pas avant SYNC_TIMEOUT.
 */
async function expectSync(report, giver, guesser, expected, label) {
  const deadline = Date.now() + SYNC_TIMEOUT
  let g, d, problems
  while (true) {
    ;[g, d] = await Promise.all([snapshot(giver), snapshot(guesser)])
    problems = []
    if (g.status !== d.status) problems.push(`statut ${g.status} ≠ ${d.status}`)
    if (JSON.stringify(g.guesses) !== JSON.stringify(d.guesses)) problems.push(`propositions ${JSON.stringify(g.guesses)} ≠ ${JSON.stringify(d.guesses)}`)
    if (g.outcome !== d.outcome) problems.push(`issue ${g.outcome} ≠ ${d.outcome}`)
    if (g.reveal !== d.reveal) problems.push(`mot révélé ${g.reveal} ≠ ${d.reveal}`)
    if (d.guesses.length && g.lastGuess !== d.guesses.at(-1)) problems.push(`meneur "dernière réponse" = ${g.lastGuess}, attendu ${d.guesses.at(-1)}`)
    for (const [k, v] of Object.entries(expected.both || {})) {
      if (JSON.stringify(g[k]) !== JSON.stringify(v)) problems.push(`meneur.${k} = ${JSON.stringify(g[k])}, attendu ${JSON.stringify(v)}`)
      if (JSON.stringify(d[k]) !== JSON.stringify(v)) problems.push(`devineur.${k} = ${JSON.stringify(d[k])}, attendu ${JSON.stringify(v)}`)
    }
    for (const [k, v] of Object.entries(expected.giver || {})) {
      if (JSON.stringify(g[k]) !== JSON.stringify(v)) problems.push(`meneur.${k} = ${JSON.stringify(g[k])}, attendu ${JSON.stringify(v)}`)
    }
    for (const [k, v] of Object.entries(expected.guesser || {})) {
      if (JSON.stringify(d[k]) !== JSON.stringify(v)) problems.push(`devineur.${k} = ${JSON.stringify(d[k])}, attendu ${JSON.stringify(v)}`)
    }
    if (!problems.length) { report.step(`✔ ${label}`); return true }
    if (Date.now() > deadline) break
    await sleep(150)
  }
  report.issue('desync', label, problems.join(' | '), { giver: g, guesser: d })
  return false
}

// ————————————————— Scénarios —————————————————
const scenarios = {
  // Partie complète sans perturbation : indice, mauvaise réponse, bonne
  // réponse, puis nouvelle manche.
  async fullGame({ giver, guesser, report }) {
    const word = await readWord(giver)
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: [] } }, 'manche démarrée')
    await sendHint(giver, 'premier indice')
    await expectSync(report, giver, guesser, { guesser: { hint: 'premier indice' } }, 'indice reçu')
    await sendGuess(guesser, 'XYZABC')
    await expectSync(report, giver, guesser, { both: { guesses: ['XYZABC'], status: 'running' } }, 'mauvaise réponse')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word } }, 'bonne réponse → gagné')
    await giver.page.getByRole('button', { name: 'Rejouer' }).click()
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: [], outcome: null }, guesser: { hint: '—' } }, 'nouvelle manche')
    const word2 = await readWord(giver)
    // 5 mauvaises réponses → perdu
    const faux = ['FAUX1', 'FAUX2', 'FAUX3', 'FAUX4']
    for (let i = 0; i < faux.length; i++) {
      await sendGuess(guesser, faux[i])
      await expectSync(report, giver, guesser, { both: { guesses: faux.slice(0, i + 1), status: 'running' } }, `manche 2 : réponse ${i + 1}`)
    }
    await sendGuess(guesser, 'FAUX5')
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'lose', reveal: word2 } }, 'manche 2 : perdu')
  },

  // Le devineur recharge la page en pleine manche puis revient.
  async guesserReload({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendHint(giver, 'avant reload')
    await sendGuess(guesser, 'RATE')
    await expectSync(report, giver, guesser, { both: { guesses: ['RATE'] } }, 'état avant reload')
    await guesser.page.reload()
    await enterGame(guesser)
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: ['RATE'] }, guesser: { hint: 'avant reload' }, giver: { word } }, 'devineur revenu après reload')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word } }, 'gagné après reload')
  },

  // Le devineur recharge la page après la fin de la manche : rien à
  // reprendre, il doit repartir du lobby au lieu de revoir la partie finie.
  async reloadAfterEnd({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word } }, 'manche terminée')
    await guesser.page.reload()
    await guesser.page.getByRole('button', { name: 'Jouer' }).click()
    const backInLobby = await guesser.page.getByPlaceholder(/Ton pseudo…|Nom du salon…/).first()
      .waitFor({ timeout: 10000 }).then(() => true, () => false)
    const inGame = await guesser.page.locator('.appbar').isVisible()
    if (backInLobby && !inGame) report.step('✔ devineur renvoyé au lobby après reload')
    else report.issue('no-reset', guesser.tag, 'après reload d’une manche terminée, le devineur voit encore la partie')
  },

  // Fin de manche : le devineur relance avec "Rejouer", puis chacun quitte
  // avec "Terminer" et revient au lobby.
  async replayAndFinish({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendHint(giver, 'indice manche 1')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word } }, 'manche 1 gagnée')
    await guesser.page.getByRole('button', { name: 'Rejouer' }).click()
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: [], outcome: null }, guesser: { hint: '—' } }, 'manche relancée par le devineur')
    const word2 = await readWord(giver)
    const hints = await giver.page.getByText('indice manche 1').count()
    if (hints) report.issue('stale-hints', giver.tag, 'les indices de la manche précédente sont encore affichés')
    await sendHint(giver, 'indice manche 2')
    await sendGuess(guesser, word2)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word2 }, guesser: { hint: 'indice manche 2' } }, 'manche 2 gagnée')

    await giver.page.getByRole('button', { name: 'Terminer' }).click()
    const giverOut = await giver.page.getByPlaceholder(/Ton pseudo…|Nom du salon…/).first()
      .waitFor({ timeout: 5000 }).then(() => true, () => false)
    if (giverOut) report.step('✔ meneur revenu au lobby')
    else report.issue('no-finish', giver.tag, '"Terminer" n’a pas ramené le meneur au lobby')
    const noticed = await guesser.page.getByText('Ton partenaire a quitté le salon.')
      .waitFor({ timeout: 5000 }).then(() => true, () => false)
    if (noticed) report.step('✔ devineur prévenu du départ du meneur')
    else report.issue('no-notice', guesser.tag, 'le devineur n’est pas prévenu du départ du meneur')
    await guesser.page.getByRole('button', { name: 'Terminer' }).click()
    const guesserOut = await guesser.page.getByPlaceholder(/Ton pseudo…|Nom du salon…/).first()
      .waitFor({ timeout: 5000 }).then(() => true, () => false)
    if (guesserOut) report.step('✔ devineur revenu au lobby')
    else report.issue('no-finish', guesser.tag, '"Terminer" n’a pas ramené le devineur au lobby')

    // Un rechargement après "Terminer" ne doit pas ramener dans la partie.
    await guesser.page.reload()
    await guesser.page.getByRole('button', { name: 'Jouer' }).click()
    await sleep(1500)
    if (await guesser.page.locator('.appbar').isVisible()) report.issue('session-kept', guesser.tag, 'reload après "Terminer" ramène dans la partie')
    else report.step('✔ session oubliée après "Terminer"')
  },

  // Le meneur recharge la page en pleine manche : la manche en cours doit
  // être conservée (même mot, mêmes propositions).
  async giverReload({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendHint(giver, 'indice meneur')
    await sendGuess(guesser, 'RATE')
    await expectSync(report, giver, guesser, { both: { guesses: ['RATE'] } }, 'état avant reload meneur')
    await giver.page.reload()
    await enterGame(giver)
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: ['RATE'] }, giver: { word }, guesser: { hint: 'indice meneur' } }, 'meneur revenu, manche conservée')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word } }, 'gagné après reload meneur')
  },

  // Le devineur ferme son onglet (déconnexion volontaire), puis rouvre le jeu.
  async guesserLeavesAndReturns({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendHint(giver, 'indice')
    await sendGuess(guesser, 'RATE')
    await expectSync(report, giver, guesser, { both: { guesses: ['RATE'] } }, 'état avant départ')
    await guesser.page.close()
    await sleep(1500)
    // Nouvel onglet avec le même localStorage (même navigateur, onglet rouvert)
    guesser.page = await guesser.context.newPage()
    report.attach(guesser)
    await guesser.page.goto(guesser.baseUrl)
    await enterGame(guesser)
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: ['RATE'] }, guesser: { hint: 'indice' } }, 'devineur revenu dans un nouvel onglet')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win' } }, 'gagné après retour')
  },

  // Coupure réseau franche de 5 s côté devineur.
  async networkCut({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendHint(giver, 'avant coupure')
    await expectSync(report, giver, guesser, { guesser: { hint: 'avant coupure' } }, 'indice avant coupure')
    report.expectNetErrors = true
    guesser.proxy.cut(5000)
    await sleep(1000)
    // Le meneur envoie un indice pendant la coupure : il doit arriver après.
    await sendHint(giver, 'pendant coupure')
    await sleep(6000)
    report.expectNetErrors = false
    await expectSync(report, giver, guesser, { both: { status: 'running', connected: true }, guesser: { hint: 'pendant coupure' } }, 'rattrapage après coupure')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win' } }, 'gagné après coupure')
  },

  // Changement de réseau : le client perd la connexion immédiatement mais le
  // serveur garde l'ancien socket jusqu'au pingTimeout (~55 s).
  async halfDeadConnection({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendHint(giver, 'avant bascule')
    await sendGuess(guesser, 'RATE')
    await expectSync(report, giver, guesser, { both: { guesses: ['RATE'] } }, 'état avant bascule réseau')
    report.expectNetErrors = true
    guesser.proxy.halfDead()
    await sleep(3000)
    report.expectNetErrors = false
    await sendHint(giver, 'après bascule')
    await expectSync(report, giver, guesser, { both: { connected: true, guesses: ['RATE'] }, guesser: { hint: 'après bascule' } }, 'devineur resynchronisé après bascule')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win' } }, 'gagné après bascule')
  },

  // Même bascule côté meneur.
  async giverHalfDead({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendGuess(guesser, 'RATE')
    await expectSync(report, giver, guesser, { both: { guesses: ['RATE'] } }, 'état avant bascule meneur')
    report.expectNetErrors = true
    giver.proxy.halfDead()
    await sleep(3000)
    report.expectNetErrors = false
    await sendHint(giver, 'meneur revenu')
    await expectSync(report, giver, guesser, { both: { connected: true, guesses: ['RATE'] }, giver: { word }, guesser: { hint: 'meneur revenu' } }, 'meneur resynchronisé après bascule')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win' } }, 'gagné après bascule meneur')
  },

  // Latence élevée et irrégulière sur les deux joueurs, actions enchaînées vite.
  async highLatency({ giver, guesser, report }) {
    giver.proxy.setLatency(300, 400)
    guesser.proxy.setLatency(300, 400)
    const word = await readWord(giver)
    await sendHint(giver, 'lent 1')
    // Le meneur tape déjà l'indice suivant pendant que le premier est en vol :
    // l'accusé de réception du premier ne doit pas effacer sa saisie.
    const hintInput = giver.page.getByPlaceholder('Écrire un indice percutant...')
    await hintInput.fill('lent 2')
    await giver.page.getByRole('button', { name: 'Envoi…' }).waitFor({ state: 'detached', timeout: 10000 }).catch(() => { })
    const kept = await hintInput.inputValue()
    if (kept !== 'lent 2') report.issue('lost-input', 'Alice/giver', `saisie "lent 2" effacée par l'accusé du 1er indice (reste "${kept}")`)
    await expectSync(report, giver, guesser, { guesser: { hint: 'lent 1' } }, '1er indice sous latence')
    await sendHint(giver, 'lent 2')
    await expectSync(report, giver, guesser, { guesser: { hint: 'lent 2' } }, 'indices sous latence')
    await sendGuess(guesser, 'LENT')
    await expectSync(report, giver, guesser, { both: { guesses: ['LENT'] } }, 'réponse sous latence')
    // Le meneur change de mot pendant que la réponse du devineur est en vol :
    // l'ancienne réponse ne doit pas être comptée sur le nouveau mot.
    await sendGuess(guesser, word)
    await giver.page.getByRole('button', { name: 'Changer de mot' }).click({ noWaitAfter: true }).catch(() => { })
    await sleep(2500)
    const [g, d] = await Promise.all([snapshot(giver), snapshot(guesser)])
    report.step(`course "changer de mot" vs réponse : meneur=${g.status}/${g.outcome} devineur=${d.status}/${d.outcome}`)
    // Deux issues acceptables : soit la réponse est arrivée avant le changement
    // (manche gagnée puis nouvelle manche), soit après (réponse rejetée). Dans
    // les deux cas la nouvelle manche ne doit contenir aucune ancienne réponse.
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: [] } }, 'nouvelle manche vierge après course')
    giver.proxy.setLatency(0); guesser.proxy.setLatency(0)
  },

  // Course déterministe : la réponse du devineur (réseau lent) arrive au
  // serveur APRÈS que le meneur a changé de mot. Elle visait l'ancien mot et
  // ne doit donc pas être comptée comme tentative sur le nouveau.
  async staleGuessAfterNewWord({ giver, guesser, report }) {
    const word = await readWord(giver)
    guesser.proxy.setLatency(1500)
    await sendGuess(guesser, word)
    await sleep(200)
    await giver.page.getByRole('button', { name: 'Changer de mot' }).click()
    await sleep(4000)
    guesser.proxy.setLatency(0)
    const newWord = (await snapshot(giver)).word
    if (newWord === word) report.step('(nouveau mot identique par hasard)')
    await expectSync(report, giver, guesser, { both: { status: 'running', guesses: [], outcome: null } }, 'réponse périmée ignorée')
  },

  // Les deux joueurs perdent le réseau en même temps : la room tombe à 0
  // joueur côté serveur. La manche doit survivre à leur retour.
  async bothDrop({ giver, guesser, report }) {
    const word = await readWord(giver)
    await sendHint(giver, 'avant double coupure')
    await sendGuess(guesser, 'RATE')
    await expectSync(report, giver, guesser, { both: { guesses: ['RATE'] } }, 'état avant double coupure')
    report.expectNetErrors = true
    giver.proxy.cut(3000)
    guesser.proxy.cut(3500)
    await sleep(6000)
    report.expectNetErrors = false
    await expectSync(report, giver, guesser, { both: { status: 'running', connected: true, guesses: ['RATE'] }, giver: { word }, guesser: { hint: 'avant double coupure' } }, 'manche conservée après double coupure')
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word } }, 'gagné après double coupure')
  },

  // Redémarrage du serveur en pleine manche (état mémoire perdu). On ne peut
  // pas retrouver la manche, mais les deux joueurs doivent se retrouver dans
  // un état cohérent et pouvoir continuer à jouer.
  async serverRestart({ giver, guesser, report, restartServer }) {
    await readWord(giver)
    await sendHint(giver, 'avant redémarrage')
    await sendGuess(guesser, 'RATE')
    await expectSync(report, giver, guesser, { both: { guesses: ['RATE'] } }, 'état avant redémarrage')
    report.expectNetErrors = true
    await restartServer(1500)
    await sleep(5000)
    report.expectNetErrors = false
    await expectSync(report, giver, guesser, { both: { connected: true, status: 'running' } }, 'reconnectés après redémarrage')
    const word = await readWord(giver)
    await sendGuess(guesser, word)
    await expectSync(report, giver, guesser, { both: { status: 'ended', outcome: 'win', reveal: word } }, 'partie jouable après redémarrage')
  },

  // Un troisième joueur tente de prendre le rôle de devineur déjà occupé.
  async intruder({ browser, giver, guesser, report }) {
    await readWord(giver)
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await page.goto(guesser.baseUrl)
      await page.getByRole('button', { name: 'Jouer' }).click()
      await page.getByPlaceholder('Ton pseudo…').fill('Bob')
      await page.getByRole('button', { name: 'Jouer' }).click()
      await page.getByPlaceholder('Nom du salon…').fill(guesser.roomId)
      await page.getByRole('button', { name: '🔍 Devineur' }).click()
      const refused = await page.getByText('déjà pris').waitFor({ timeout: 5000 }).then(() => true, () => false)
      if (!refused) report.issue('intruder', 'Mallory', 'le rôle déjà occupé n’a pas été refusé')
      else report.step('✔ intrus refusé')
    } finally {
      await context.close()
    }
    await sendGuess(guesser, 'TOUJOURSLA')
    await expectSync(report, giver, guesser, { both: { guesses: ['TOUJOURSLA'] } }, 'devineur légitime toujours en jeu')
  },

  // Rafale : plusieurs réponses envoyées très vite (double Entrée).
  async rapidGuesses({ giver, guesser, report }) {
    guesser.proxy.setLatency(200, 100)
    await readWord(giver)
    const input = guesser.page.getByPlaceholder('Votre proposition...')
    await input.fill('RAFALE')
    await input.press('Enter')
    await input.press('Enter')
    await sleep(1500)
    await expectSync(report, giver, guesser, { both: { guesses: ['RAFALE'], status: 'running' } }, 'double envoi ne compte qu’une fois')
    guesser.proxy.setLatency(0)
  },
}

// ————————————————— Rapport —————————————————
function makeReport(scenario) {
  const report = {
    scenario,
    issues: [],
    events: [],
    steps: [],
    expectNetErrors: false,
    issue(kind, where, message, extra) {
      this.issues.push({ kind, where, message, extra })
      console.log(`   ✖ [${kind}] ${where}: ${message}`)
      if (extra) console.log('     ', JSON.stringify(extra))
    },
    event(where, message) { this.events.push(`${where}: ${message}`) },
    step(msg) { this.steps.push(msg); console.log(`   ${msg}`) },
    attach(player) {
      player.page.on('console', (msg) => { if (msg.type() === 'error') report.issue('console-error', player.tag, msg.text()) })
      player.page.on('pageerror', (err) => report.issue('page-error', player.tag, err.message))
    },
  }
  return report
}

async function main() {
  const only = process.argv.slice(2)
  const toRun = Object.keys(scenarios).filter((n) => !only.length || only.includes(n))
  const logs = []
  let proc = await startServer(logs)
  // Simule un redémarrage du serveur (réveil / redéploiement Render) : tout
  // l'état en mémoire est perdu, les clients doivent se reconnecter.
  const restartServer = async (downtimeMs = 1000) => {
    const exited = new Promise((r) => proc.once('exit', r))
    proc.kill()
    await exited
    await sleep(downtimeMs)
    proc = await startServer(logs)
  }
  const browser = await chromium.launch({ headless: !process.env.HEADFUL })
  const results = []
  try {
    for (const name of toRun) {
      console.log(`\n▶ ${name}`)
      const report = makeReport(name)
      const roomId = `e2e-${name}-${Date.now()}`
      const serverLogStart = logs.length
      let giver, guesser
      try {
        giver = await openPlayer(browser, { name: 'Alice', role: 'giver', roomId, report })
        guesser = await openPlayer(browser, { name: 'Bob', role: 'guesser', roomId, report })
        await scenarios[name]({ browser, giver, guesser, report, restartServer })
      } catch (e) {
        report.issue('exception', name, e.message.split('\n')[0])
      } finally {
        for (const p of [giver, guesser]) {
          if (!p) continue
          await p.context.close().catch(() => { })
          await p.proxy.close().catch(() => { })
        }
      }
      const serverErrors = logs.slice(serverLogStart).filter((l) => /error/i.test(l) && !l.includes('[SOCKET IN]'))
      for (const l of serverErrors) report.issue('server-log', 'server', l)
      if (report.events.length) console.log('   événements socket :', report.events.join(' || '))
      results.push(report)
      await sleep(300)
    }
  } finally {
    await browser.close()
    proc.kill()
  }

  console.log('\n══════ Résumé ══════')
  let failed = 0
  for (const r of results) {
    const ok = r.issues.length === 0
    if (!ok) failed++
    console.log(`${ok ? '✅' : '❌'} ${r.scenario}${ok ? '' : ` — ${r.issues.length} problème(s)`}`)
    for (const i of r.issues) console.log(`     [${i.kind}] ${i.where}: ${i.message}`)
  }
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
