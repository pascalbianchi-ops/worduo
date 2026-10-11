// Easter egg : le meneur tape « backroom » comme indice → mini-FPS en overlay.
// Le jeu est chargé à la demande (chunk séparé) pour ne pas alourdir Worduo.
import { lazy } from 'react'

export const BackroomGame = lazy(() => import('./BackroomGame'))

export function isBackroomTrigger(hint: string): boolean {
  return hint.trim().toLowerCase() === 'backroom'
}
