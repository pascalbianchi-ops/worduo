// Objets « dopamine » : la facilité qui ne mène nulle part
export type ItemId = 'burger' | 'frites' | 'soda' | 'bonbons' | 'donut' | 'tele' | 'telephone' | 'manette' | 'console'

/**
 * gate   : mur ordinaire en apparence, qui s'efface quand un passage s'ouvre
 * door   : porte de sortie (niveau 1)   ladder : échelle de sortie (niveau 2)
 * borne  : borne de défi                light  : lumière derrière la porte
 */
export type WallKind = 'none' | 'wall' | 'pillar' | 'gate' | 'door' | 'ladder' | 'borne' | 'light'
export type FloorKind = 'normal' | 'wet' | 'dark'

export type ChallengeId = 'rotation' | 'suite' | 'intrus' | 'lumieres' | 'allumettes' | 'balance' | 'code'

/**
 * still  : posé au sol, se ramasse avec A
 * chase  : niveau 2, glisse vers le joueur quand il le voit, consommé au contact
 * ambush : niveau 2, surgit sur le chemin du joueur puis reste immobile, consommé au contact
 * Un objet `hidden` n'apparaît qu'à l'ouverture du passage secret (diversion).
 */
export type ItemSpec = { kind: ItemId; x: number; y: number; behavior: 'still' | 'chase' | 'ambush'; hidden?: boolean }

/** Murs qui s'effacent ensemble, uniquement hors du champ de vision du joueur */
export type Gate = { id: 'secret' | 'zone'; cells: number[] }

/**
 * Ombre furtive aperçue de loin, une seule fois, jamais atteignable :
 * - cross : traverse un couloir ou une salle dans la direction (dx, dy)
 * - peek  : observe depuis un coin, puis se retire dans la direction (dx, dy)
 * - stare : immobile, fixe le joueur, puis disparaît d'un coup
 */
export type Apparition = {
  id: string
  kind: 'cross' | 'peek' | 'stare'
  x: number
  y: number
  dx: number
  dy: number
}

export type Level = {
  num: 1 | 2
  w: number
  h: number
  /** index = y * w + x ; modifié en cours de partie (passages, porte) */
  walls: WallKind[]
  floors: FloorKind[]
  /** numéro de borne (1..n) pour les murs 'borne', 0 sinon */
  borneAt: number[]
  bornes: { num: number; x: number; y: number; challenge: ChallengeId }[]
  items: ItemSpec[]
  gates: Gate[]
  /** case de la porte ou de l'échelle */
  exit: { x: number; y: number; kind: 'door' | 'ladder' }
  /** case lumineuse derrière la porte : y entrer termine le niveau */
  beyond: { x: number; y: number } | null
  start: { x: number; y: number; a: number }
  apparitions: Apparition[]
  raw: string[]
}
