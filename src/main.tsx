import './ws-guard'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { GameProvider } from './state/GameContext'
import { App } from './ui/App'

// Bloque le "tirer vers le bas pour actualiser" de Safari iOS, qui recharge
// toute la page et fait perdre la partie en cours. overscroll-behavior en
// CSS ne suffit pas toujours sur Safari : on intercepte le geste tactile
// directement. On n'empêche que le tir vers le bas quand la page est déjà
// tout en haut (scrollY === 0) — le défilement normal du contenu reste
// intact partout ailleurs.
let touchStartY = 0
document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY
}, { passive: true })

document.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY
    const scrollingDown = touchY > touchStartY
    const atTop = window.scrollY <= 0
    const active = document.activeElement
    const isEditing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    if (atTop && scrollingDown && !isEditing) {
        e.preventDefault()
    }
}, { passive: false })

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <GameProvider>
            <App />
        </GameProvider>
    </React.StrictMode>
)
