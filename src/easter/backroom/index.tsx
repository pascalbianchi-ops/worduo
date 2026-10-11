// Easter egg : le meneur tape « backroom » comme indice → mini-FPS en overlay.
// Le jeu est chargé à la demande (chunk séparé) pour ne pas alourdir Worduo.
//
// L'overlay est monté une fois pour toutes (BackroomHost, dans main.tsx) et
// non dans l'écran du meneur : le meneur quitte sa partie Worduo en lançant
// le jeu, ce qui démonte son écran sans fermer l'overlay.
import { lazy, Suspense, useEffect, useState } from 'react'

const BackroomGame = lazy(() => import('./BackroomGame'))

const listeners = new Set<(open: boolean) => void>()
let isOpen = false

function setOpen(open: boolean) {
  isOpen = open
  listeners.forEach((l) => l(open))
}

export function openBackroom() {
  setOpen(true)
}

export function isBackroomTrigger(hint: string): boolean {
  return hint.trim().toLowerCase() === 'backroom'
}

export function BackroomHost() {
  const [open, setLocalOpen] = useState(isOpen)
  useEffect(() => {
    listeners.add(setLocalOpen)
    return () => { listeners.delete(setLocalOpen) }
  }, [])
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <BackroomGame onClose={() => setOpen(false)} />
    </Suspense>
  )
}
