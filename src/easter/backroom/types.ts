export type ItemId = 'brosse' | 'casserole' | 'tele'
export type WallKind = 'none' | 'wall' | 'pillar' | 'clue'
export type FloorKind = 'normal' | 'wet' | 'dark'

export const ITEM_LABEL: Record<ItemId, string> = {
  brosse: 'brosse à dents',
  casserole: 'casserole',
  tele: 'télé',
}

export type Level = {
  w: number
  h: number
  /** index = y * w + x */
  walls: WallKind[]
  floors: FloorKind[]
  /** numéro d'indice pour les murs 'clue', 0 sinon */
  clueAt: number[]
  items: { id: ItemId; x: number; y: number }[]
  clues: { id: number; x: number; y: number; text: string }[]
  start: { x: number; y: number; a: number }
  raw: string[]
}
