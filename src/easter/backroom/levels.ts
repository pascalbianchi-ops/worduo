// Les niveaux du Backroom. Thème : la routine. La facilité (objets dopamine)
// ne mène nulle part, seul l'effort (les défis des bornes) fait avancer.
//
// Légende des cartes (x = colonne, y = ligne, y vers le bas) :
//   #  mur        o  pilier      .  moquette    w  moquette trempée   d  néons éteints
//   P  départ     1..4  borne de défi (numéro = ordre des défis du niveau)
//   b burger · f frites · s soda · c bonbons · n donut · t télé · p téléphone · m manette · g console
// Niveau 1 :
//   D  porte de sortie        E  lumière derrière la porte (y entrer = niveau suivant)   L  mur de lumière
//   S  passage secret vers la 1re borne (mur tant qu'il est fermé)
//   Z  ouverture vers la zone des bornes 2 et 3 (mur tant que la 1re borne n'est pas réussie)
//   *  télé de diversion, posée à l'ouverture du passage secret
// Niveau 2 :
//   H  échelle sans barreaux
//   minuscule : l'objet glisse vers le joueur qui le voit · MAJUSCULE : il surgit sur son chemin
import type { Level, ItemId, ItemSpec, FloorKind, WallKind, Apparition, ChallengeId, Gate } from './types'

const LEVEL1 = [
  '########################################',
  '#......######....m......####.........n.#',
  '#......######..o....o...####..p........#',
  '#.P..s...c..f.n.......g.####.......s...2',
  '#......######.....t.....####...o.......#',
  '#......######..o....o...####.c..f......#',
  '#############...b.....p.####.......o...#',
  '##################.#########...........#',
  '##################.######1##..b......g.#',
  '##################s######.Zp.....m.....#',
  '##################.######.##...........#',
  '##################.######S##L######3####',
  '##################..c.*....DEL##########',
  '#####################.######L###########',
  '###################.f.s.c###############',
  '###################b.....###############',
  '###################...n.m###############',
  '########################################',
]

const LEVEL2 = [
  '####################################',
  '#.........################.........#',
  '#.........################.........#',
  '1....o..................##.........3',
  '#..........C..s....................#',
  '#....m....##.............N.........#',
  '############...o....o...##....b....#',
  '############............############',
  '#......#####............############',
  '#.P......F.......b..............H###',
  '#...............................####',
  '#......#####............############',
  '############......t.....##........p#',
  '############...o....o...##.........#',
  '#.f.......##.............S.........#',
  '#..........G.........n........o....#',
  '#.......................##.........#',
  '#.........################.........#',
  '#c........################........m#',
  '#####2########################4#####',
]

const ITEM_CHARS: Record<string, ItemId> = {
  b: 'burger', f: 'frites', s: 'soda', c: 'bonbons', n: 'donut', t: 'tele', p: 'telephone', m: 'manette', g: 'console',
}

// Ombres furtives : deux ou trois par niveau, pour l'ambiance
const SHADOWS: Record<1 | 2, Apparition[]> = {
  1: [
    // depuis la salle aux piliers, une ombre s'engouffre dans le couloir sud
    { id: 'couloir', kind: 'cross', x: 18.5, y: 9.5, dx: 0, dy: 1 },
    // au fond de la réserve, elle observe puis se retire
    { id: 'reserve', kind: 'peek', x: 24.5, y: 16.5, dx: 0, dy: -1 },
    // dans la grande salle des bornes, elle fixe le joueur
    { id: 'zone', kind: 'stare', x: 37.5, y: 5.5, dx: 0, dy: 0 },
  ],
  2: [
    { id: 'hall', kind: 'cross', x: 22.5, y: 15.5, dx: 1, dy: 0 },
    { id: 'nord-est', kind: 'stare', x: 33.5, y: 1.5, dx: 0, dy: 0 },
    { id: 'sud-ouest', kind: 'peek', x: 1.5, y: 18.5, dx: 1, dy: 0 },
  ],
}

const CHALLENGES: Record<1 | 2, ChallengeId[]> = {
  1: ['rotation', 'suite', 'intrus'],
  2: ['lumieres', 'allumettes', 'balance', 'code'],
}

function parse(num: 1 | 2, raw: string[]): Level {
  const h = raw.length
  const w = raw[0].length
  const walls: WallKind[] = []
  const floors: FloorKind[] = []
  const borneAt: number[] = []
  const bornes: Level['bornes'] = []
  const items: ItemSpec[] = []
  const gates: Gate[] = [{ id: 'secret', cells: [] }, { id: 'zone', cells: [] }]
  let exit: Level['exit'] | null = null
  let beyond: Level['beyond'] = null
  let start = { x: 1.5, y: 1.5, a: 0 }

  raw.forEach((row, y) => {
    if (row.length !== w) throw new Error(`backroom: niveau ${num}, ligne ${y} de longueur ${row.length} ≠ ${w}`)
    for (let x = 0; x < w; x++) {
      const ch = row[x]
      const idx = y * w + x
      let wall: WallKind = 'none'
      let floor: FloorKind = 'normal'
      let borne = 0
      if (ch === '#') wall = 'wall'
      else if (ch === 'o') wall = 'pillar'
      else if (ch === 'L') wall = 'light'
      else if (ch === 'S' && num === 1) { wall = 'gate'; gates[0].cells.push(idx) }
      else if (ch === 'Z') { wall = 'gate'; gates[1].cells.push(idx) }
      else if (ch === 'D') { wall = 'door'; exit = { x, y, kind: 'door' } }
      else if (ch === 'H') { wall = 'ladder'; exit = { x, y, kind: 'ladder' } }
      else if (ch === 'E') beyond = { x, y }
      else if (ch >= '1' && ch <= '9') {
        wall = 'borne'
        borne = Number(ch)
        const challenge = CHALLENGES[num][borne - 1]
        if (!challenge) throw new Error(`backroom: borne ${borne} sans défi`)
        bornes.push({ num: borne, x, y, challenge })
      } else if (ch === 'w') floor = 'wet'
      else if (ch === 'd') floor = 'dark'
      else if (ch === 'P') start = { x: x + 0.5, y: y + 0.5, a: 0 }
      else if (ch === '*') items.push({ kind: 'tele', x: x + 0.5, y: y + 0.5, behavior: 'still', hidden: true })
      else if (ITEM_CHARS[ch]) items.push({ kind: ITEM_CHARS[ch], x: x + 0.5, y: y + 0.5, behavior: num === 1 ? 'still' : 'chase' })
      else if (ITEM_CHARS[ch.toLowerCase()] && num === 2) items.push({ kind: ITEM_CHARS[ch.toLowerCase()], x: x + 0.5, y: y + 0.5, behavior: 'ambush' })
      else if (ch !== '.') throw new Error(`backroom: niveau ${num}, caractère inconnu « ${ch} » en (${x}, ${y})`)
      walls.push(wall)
      floors.push(floor)
      borneAt.push(borne)
    }
  })

  if (!exit) throw new Error(`backroom: niveau ${num} sans sortie`)
  bornes.sort((a, b) => a.num - b.num)
  const apparitions = SHADOWS[num]
  for (const a of apparitions) {
    if (walls[Math.floor(a.y) * w + Math.floor(a.x)] !== 'none') throw new Error(`backroom: ombre ${a.id} dans un mur`)
  }
  return {
    num, w, h, walls, floors, borneAt, bornes, items, gates: gates.filter((g) => g.cells.length), exit, beyond,
    start, apparitions, raw,
  }
}

/** Chaque appel renvoie une copie neuve : les murs changent en cours de partie */
export function loadLevel(num: 1 | 2): Level {
  return parse(num, num === 1 ? LEVEL1 : LEVEL2)
}

export const LAST_LEVEL = 2
