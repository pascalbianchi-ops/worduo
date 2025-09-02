import './ws-guard'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { GameProvider } from './state/GameContext'
import { App } from './ui/App'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <GameProvider>
            <App />
        </GameProvider>
    </React.StrictMode>
)
