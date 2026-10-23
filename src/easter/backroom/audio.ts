// Ambiance sonore générée en code (Web Audio) : bourdonnement des néons,
// sons de surprise, battements de cœur qui accélèrent avec le malaise.
// iOS n'autorise le son qu'après un geste de l'utilisateur : unlock() est
// appelé à chaque toucher, le premier démarre réellement l'audio.
import type { GameEvent } from './game'

type Ctx = AudioContext

export class BackroomAudio {
  private ctx: Ctx | null = null
  private master: GainNode | null = null
  private drone: GainNode | null = null
  private noise: AudioBuffer | null = null
  private nextBeat = 0
  private muted = false

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) return
        this.ctx = new AC()
        this.setup(this.ctx)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch { /* pas de son : le jeu reste jouable */ }
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  private setup(ctx: Ctx) {
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.master.connect(ctx.destination)

    // bruit blanc réutilisable
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    // bourdonnement électrique des néons (permanent, discret)
    const hum = ctx.createGain()
    hum.gain.value = 0.035
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 380
    for (const f of [60, 120.6]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.connect(lp)
      o.start()
    }
    lp.connect(hum).connect(this.master)

    // nappe grave qui monte avec le malaise
    this.drone = ctx.createGain()
    this.drone.gain.value = 0
    for (const f of [36, 37.3]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(this.drone)
      o.start()
    }
    this.drone.connect(this.master)
  }

  private noiseBurst(dur: number, from: number, to: number, gain: number, q = 1.5) {
    const ctx = this.ctx!, t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = q
    bp.frequency.setValueAtTime(from, t)
    bp.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    src.connect(bp).connect(g).connect(this.master!)
    src.start(t)
    src.stop(t + dur)
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0) {
    const ctx = this.ctx!, t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(from, t)
    o.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.master!)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  play(ev: GameEvent) {
    if (!this.ctx || this.ctx.state !== 'running') return
    try {
      if (ev === 'scare') {
        // l'ombre qui fixait disparaît : coup sec, crissement, accord qui s'effondre
        this.tone('sine', 90, 30, 0.5, 0.9)
        this.noiseBurst(0.9, 3200, 260, 0.6, 2)
        this.tone('square', 184, 92, 1.1, 0.12)
        this.tone('square', 196, 87, 1.1, 0.12)
      } else if (ev === 'eat') {
        // petit « ding » sucré
        this.tone('triangle', 880, 1320, 0.12, 0.18)
      } else if (ev === 'pop') {
        this.tone('square', 520, 1040, 0.08, 0.08)
      } else if (ev === 'nibble') {
        this.tone('sawtooth', 300, 120, 0.3, 0.12)
      } else if (ev === 'refuse') {
        // porte verrouillée : chocs sourds
        this.tone('sine', 110, 60, 0.18, 0.6)
        this.tone('sine', 100, 55, 0.18, 0.5, 0.14)
      } else if (ev === 'success') {
        this.tone('triangle', 523, 523, 0.15, 0.2)
        this.tone('triangle', 659, 659, 0.15, 0.2, 0.12)
        this.tone('triangle', 784, 784, 0.3, 0.2, 0.24)
      } else if (ev === 'open') {
        this.tone('sine', 196, 392, 1.2, 0.3)
        this.noiseBurst(1.2, 400, 3000, 0.12, 1)
      } else {
        // une ombre se montre au loin : bruit sourd et craquement lointain
        this.tone('sine', 70, 45, 0.35, 0.45)
        this.noiseBurst(0.3, 900, 450, 0.22, 6)
      }
    } catch { /* ignore */ }
  }

  /** À chaque image : nappe et battements de cœur selon le malaise */
  tick(dread: number) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running' || !this.drone) return
    this.drone.gain.setTargetAtTime(dread * 0.35, ctx.currentTime, 0.2)
    if (dread < 0.15) { this.nextBeat = 0; return }
    const now = ctx.currentTime
    if (this.nextBeat === 0) this.nextBeat = now
    if (now >= this.nextBeat) {
      const g = 0.25 + dread * 0.55
      this.tone('sine', 62, 38, 0.16, g)
      this.tone('sine', 58, 36, 0.14, g * 0.7, 0.22)
      this.nextBeat = now + (1.15 - dread * 0.6)
    }
  }

  dispose() {
    try { void this.ctx?.close() } catch { /* ignore */ }
    this.ctx = null
  }
}
