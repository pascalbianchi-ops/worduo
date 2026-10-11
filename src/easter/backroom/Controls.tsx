// Contrôles tactiles façon manette : croix à gauche, 4 boutons à droite.
// Pointer events (iOS Safari 13+) : chaque bouton suit son propre doigt, on
// peut donc avancer et tourner en même temps.
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import type { Input } from './game'

type Dir = keyof Input

const pad: CSSProperties = {
  position: 'absolute',
  width: 54,
  height: 54,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(30, 22, 10, 0.55)',
  border: '2px solid rgba(255, 210, 130, 0.55)',
  color: 'rgba(255, 225, 170, 0.95)',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  WebkitTapHighlightColor: 'transparent',
  cursor: 'pointer',
}

function capture(e: PointerEvent) {
  e.preventDefault()
  // peut échouer si le pointeur n'est plus actif : sans conséquence
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
}

function Hold({ label, style, onChange, children }: { label: string; style: CSSProperties; onChange: (down: boolean) => void; children: ReactNode }) {
  const up = () => onChange(false)
  return (
    <div
      role="button"
      aria-label={label}
      style={{ ...pad, ...style }}
      onPointerDown={(e) => { capture(e); onChange(true) }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}

function Arrow({ rot }: { rot: number }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: `rotate(${rot}deg)`, pointerEvents: 'none' }}>
      <path d="M11 3 L20 17 L2 17 Z" fill="currentColor" />
    </svg>
  )
}

export function Controls({ input, onAction }: { input: Input; onAction: () => void }) {
  const set = (d: Dir) => (down: boolean) => { input[d] = down }
  const S = 54, G = 2
  const btn = (label: string, letter: string, style: CSSProperties, onPress?: () => void) => (
    <div
      role="button"
      aria-label={label}
      style={{ ...pad, borderRadius: '50%', fontWeight: 800, fontSize: 20, fontFamily: 'monospace', ...style }}
      onPointerDown={(e) => { capture(e); onPress?.() }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {letter}
    </div>
  )
  return (
    <>
      {/* Croix directionnelle */}
      <div style={{ position: 'absolute', left: 'calc(env(safe-area-inset-left, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', width: S * 3 + G * 2, height: S * 3 + G * 2 }}>
        <Hold label="Avancer" onChange={set('up')} style={{ left: S + G, top: 0, borderRadius: '10px 10px 2px 2px' }}><Arrow rot={0} /></Hold>
        <Hold label="Reculer" onChange={set('down')} style={{ left: S + G, top: (S + G) * 2, borderRadius: '2px 2px 10px 10px' }}><Arrow rot={180} /></Hold>
        <Hold label="Gauche" onChange={set('left')} style={{ left: 0, top: S + G, borderRadius: '10px 2px 2px 10px' }}><Arrow rot={-90} /></Hold>
        <Hold label="Droite" onChange={set('right')} style={{ left: (S + G) * 2, top: S + G, borderRadius: '2px 10px 10px 2px' }}><Arrow rot={90} /></Hold>
        <div style={{ ...pad, left: S + G, top: S + G, borderRadius: 2, pointerEvents: 'none' }} />
      </div>

      {/* Boutons d'action (disposition en losange) */}
      <div style={{ position: 'absolute', right: 'calc(env(safe-area-inset-right, 0px) + 18px)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', width: S * 3, height: S * 3 }}>
        {btn('Bouton D', 'D', { left: S, top: 0 })}
        {btn('Bouton C', 'C', { left: 0, top: S })}
        {btn('Bouton A', 'A', { left: S * 2, top: S, background: 'rgba(160, 40, 20, 0.7)' }, onAction)}
        {btn('Bouton B', 'B', { left: S, top: S * 2 })}
      </div>
    </>
  )
}
