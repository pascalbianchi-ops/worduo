// Niveau 1 : retrouver la brosse à dents, la casserole et la télé.
//
// Légende de la carte (x = colonne, y = ligne, y vers le bas) :
//   #  mur            o  pilier           1 2 3  mur portant un indice
//   .  moquette       w  moquette trempée d      couloir aux néons éteints
//   P  départ         B  brosse à dents   C      casserole    T  télé
import type { Level, ItemId, FloorKind, WallKind, Apparition } from './types'

const RAW = [
  '########################',
  '#......#ddddddddddddddC#',
  '#..P...#d###############',
  '#.......d#.............#',
  '1......#d#..o...o...o..#',
  '#......#.#..o...T...o..#',
  '#......#...............#',
  '#......#.#..o...o...o..#',
  '#......#.#.............#',
  '#####.##2#####.#########',
  '#####.########.#########',
  '#####......3##.#########',
  '##############.#########',
  '#wwwwwwwwwwwww.........#',
  '#wwwwwBwwwwwww.........#',
  '#wwwwwwwwwwwww.........#',
  '#......................#',
  '########################',
]

const CLUES: Record<number, string> = {
  1: 'Griffonné en rouge : « La CASSEROLE refroidit là où les néons sont morts. Suis le noir, au nord-est. »',
  2: 'Quelqu’un a écrit : « La TÉLÉ grésille entre les piliers. Écoute le bruit blanc. »',
  3: 'Des lettres tremblantes : « La BROSSE À DENTS a glissé là où la moquette est trempée, tout au sud. »',
}

// Ombres furtives, aperçues de loin en passant dans les lieux intrigants
const FURTIVES: Apparition[] = [
  // par l'ouverture de la première salle, une ombre file vers le couloir noir
  { id: 'porte', kind: 'cross', x: 8.5, y: 3.5, dx: 0, dy: -1 },
  // tout au bout du couloir aux néons morts, près de la casserole, elle fixe
  { id: 'couloir-noir', kind: 'stare', x: 20.5, y: 1.5, dx: 0, dy: 0 },
  // au carrefour, elle s'engouffre dans le couloir sans issue de l'indice 2
  { id: 'carrefour', kind: 'cross', x: 8.5, y: 6.5, dx: 0, dy: 1 },
  // au fond de la salle aux piliers, elle passe d'un pilier à l'autre
  { id: 'piliers', kind: 'cross', x: 13.5, y: 8.5, dx: 1, dy: 0 },
  // au bout du couloir de l'indice 3, elle attend
  { id: 'impasse', kind: 'stare', x: 10.5, y: 11.5, dx: 0, dy: 0 },
  // dans le long couloir du sud, elle traverse vers la salle trempée
  { id: 'couloir-sud', kind: 'cross', x: 8.5, y: 16.5, dx: 0, dy: -1 },
  // dans un coin de la salle trempée, elle observe puis se retire
  { id: 'salle-trempee', kind: 'peek', x: 1.5, y: 13.5, dx: 0, dy: 1 },
]

const ITEM_CHARS: Record<string, { id: ItemId; floor: FloorKind }> = {
  B: { id: 'brosse', floor: 'wet' },
  C: { id: 'casserole', floor: 'dark' },
  T: { id: 'tele', floor: 'normal' },
}

export function loadLevel1(): Level {
  const h = RAW.length
  const w = RAW[0].length
  const walls: WallKind[] = []
  const floors: FloorKind[] = []
  const clueAt: number[] = []
  const items: Level['items'] = []
  const clues: Level['clues'] = []
  let start = { x: 1.5, y: 1.5, a: 0 }

  RAW.forEach((row, y) => {
    if (row.length !== w) throw new Error(`backroom: ligne ${y} de longueur ${row.length} ≠ ${w}`)
    for (let x = 0; x < w; x++) {
      const ch = row[x]
      let wall: WallKind = 'none'
      let floor: FloorKind = 'normal'
      let clue = 0
      if (ch === '#') wall = 'wall'
      else if (ch === 'o') wall = 'pillar'
      else if (ch >= '1' && ch <= '9') {
        wall = 'clue'
        clue = Number(ch)
        clues.push({ id: clue, x, y, text: CLUES[clue] })
      } else if (ch === 'w') floor = 'wet'
      else if (ch === 'd') floor = 'dark'
      else if (ch === 'P') start = { x: x + 0.5, y: y + 0.5, a: 0 }
      else if (ITEM_CHARS[ch]) {
        floor = ITEM_CHARS[ch].floor
        items.push({ id: ITEM_CHARS[ch].id, x: x + 0.5, y: y + 0.5 })
      }
      walls.push(wall)
      floors.push(floor)
      clueAt.push(clue)
    }
  })

  // Le joueur démarre tourné vers le 1er indice, pour comprendre le principe
  const first = clues.find((c) => c.id === 1)
  if (first) start.a = Math.atan2(first.y + 0.5 - start.y, first.x + 0.5 - start.x)

  for (const a of FURTIVES) {
    if (walls[Math.floor(a.y) * w + Math.floor(a.x)] !== 'none') throw new Error(`backroom: ombre ${a.id} dans un mur`)
  }

  return { w, h, walls, floors, clueAt, items, clues, start, apparitions: FURTIVES, raw: RAW }
}
