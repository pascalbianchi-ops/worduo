// src/Pages/HomeScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = { onStart: () => void };

export default function HomeScreen({ onStart }: Props) {
    return (
        <div style={styles.wrap}>
            <FireworksCanvas />

            {/* Contenu UI au-dessus du canvas */}
            <div style={styles.content}>
                <LogoTitle />
                <p style={styles.tagline}>
                    Un jeu de mots à deux… <b>où chaque mot compte</b> !
                </p>

                <button onClick={onStart} style={styles.cta}>
                    Jouer
                </button>

                <div style={styles.hint}>💡 Astuce : touche l’écran pour lancer un feu d’artifice</div>

                <div style={styles.footer}>
                    <p>Powered by PBI</p>
                    <p>© 2025 Pascal Bianchi. Tous droits réservés.</p>
                </div>
            </div>

            {/* Styles locaux (glow / shimmer) */}
            <style>{css}</style>
        </div>
    );
}

/* =========================
 * Canvas Fireworks (no lib)
 * ========================= */
function FireworksCanvas() {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const raf = useRef<number | null>(null);
    const rockets = useRef<Rocket[]>([]);
    const particles = useRef<Particle[]>([]);
    const last = useRef<number>(0);
    const [started, setStarted] = useState(false);

    // Config
    const cfg = useMemo(
        () => ({
            gravity: 0.22,
            air: 0.995,
            sparkAir: 0.985,
            launchEveryMs: 800,
            maxParticles: 1200,
            burstParticles: [60, 120], // min/max on burst
        }),
        []
    );

    // DPR + resize
    useEffect(() => {
        const canvas = ref.current!;
        const ctx = canvas.getContext("2d")!;
        let width = 0;
        let height = 0;

        const resize = () => {
            const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            canvas.style.width = width + "px";
            canvas.style.height = height + "px";
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener("resize", resize);
        return () => window.removeEventListener("resize", resize);
    }, []);

    // Tap/Click to burst
    useEffect(() => {
        const onTap = (e: MouseEvent | TouchEvent) => {
            const canvas = ref.current!;
            const rect = canvas.getBoundingClientRect();
            let x = window.innerWidth / 2;
            let y = window.innerHeight / 3;

            if ("touches" in e && e.touches[0]) {
                x = e.touches[0].clientX - rect.left;
                y = e.touches[0].clientY - rect.top;
            } else if ("clientX" in e) {
                x = (e as MouseEvent).clientX - rect.left;
                y = (e as MouseEvent).clientY - rect.top;
            }
            burst(x, y, particles.current, cfg);
            setStarted(true);
        };
        window.addEventListener("click", onTap);
        window.addEventListener("touchstart", onTap, { passive: true });
        return () => {
            window.removeEventListener("click", onTap);
            window.removeEventListener("touchstart", onTap);
        };
    }, [cfg]);

    // Auto rockets
    useEffect(() => {
        let timer: number | null = null;
        const loopLaunch = () => {
            const now = performance.now();
            const lastLaunch = (loopLaunch as any)._last ?? 0;
            if (!lastLaunch || now - lastLaunch > cfg.launchEveryMs) {
                (loopLaunch as any)._last = now;
                const w = window.innerWidth;
                const x = lerp(w * 0.15, w * 0.85, Math.random());
                const v = -lerp(9, 13, Math.random()); // upward
                rockets.current.push(new Rocket(x, window.innerHeight + 10, v, randHue()));
            }
            timer = window.setTimeout(loopLaunch, 120);
        };
        loopLaunch();
        return () => timer && clearTimeout(timer);
    }, [cfg.launchEveryMs]);

    // Animation
    useEffect(() => {
        const canvas = ref.current!;
        const ctx = canvas.getContext("2d")!;

        const render = (t: number) => {
            const dt = Math.min(50, t - (last.current || t));
            last.current = t;

            // trail fade
            ctx.fillStyle = "rgba(10,12,24,0.35)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // subtle background glow
            drawRadialGlow(ctx);

            // Update rockets
            for (let i = rockets.current.length - 1; i >= 0; i--) {
                const r = rockets.current[i];
                r.vy += cfg.gravity * 0.25;
                r.x += r.vx * 0.6;
                r.y += r.vy * 0.6;
                r.life -= 16;

                drawRocket(ctx, r);

                // explode condition
                if (r.vy >= -1 || r.life <= 0) {
                    burst(r.x, r.y, particles.current, cfg, r.hue);
                    rockets.current.splice(i, 1);
                    setStarted(true);
                }
            }

            // Update particles
            const p = particles.current;
            for (let i = p.length - 1; i >= 0; i--) {
                const s = p[i];
                s.vx *= cfg.sparkAir;
                s.vy *= cfg.sparkAir;
                s.vy += cfg.gravity * s.g; // per-particle gravity factor
                s.x += s.vx;
                s.y += s.vy;
                s.life -= s.fade;

                if (s.life <= 0 || s.size <= 0.5) {
                    p.splice(i, 1);
                    continue;
                }

                // draw
                drawSpark(ctx, s);
                // small shrink
                s.size *= 0.988;
            }

            // Cap particles
            if (p.length > cfg.maxParticles) {
                p.splice(0, p.length - cfg.maxParticles);
            }

            raf.current = requestAnimationFrame(render);
        };

        // First clear
        ctx.fillStyle = "rgba(10,12,24,1)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        raf.current = requestAnimationFrame(render);
        return () => {
            if (raf.current) cancelAnimationFrame(raf.current);
        };
    }, [cfg]);

    return (
        <>
            <canvas ref={ref} style={styles.canvas} aria-hidden />
            {!started && <TapPulse />}
        </>
    );
}

/* ============ Drawing helpers ============ */
function drawRadialGlow(ctx: CanvasRenderingContext2D) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w / 2;
    const cy = h * 0.35;
    const r = Math.max(w, h) * 0.6;

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(120,119,198,0.35)");
    g.addColorStop(0.45, "rgba(120,119,198,0.18)");
    g.addColorStop(1, "rgba(120,119,198,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
}

function drawRocket(ctx: CanvasRenderingContext2D, r: Rocket) {
    ctx.save();
    ctx.beginPath();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `hsl(${r.hue}, 90%, 65%)`;
    ctx.shadowColor = `hsl(${r.hue}, 90%, 60%)`;
    ctx.shadowBlur = 20;
    ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // tail
    const grad = ctx.createLinearGradient(r.x, r.y + 18, r.x, r.y);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, `hsla(${r.hue}, 90%, 75%, .9)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + 18);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
    ctx.restore();
}

function drawSpark(ctx: CanvasRenderingContext2D, s: Particle) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // outer glow
    ctx.shadowColor = `hsla(${s.hue}, 100%, 60%, ${clamp(s.life / 255, 0, 1)})`;
    ctx.shadowBlur = 18;

    // gradient body
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2);
    g.addColorStop(0, `hsla(${s.hue}, 100%, 70%, 1)`);
    g.addColorStop(0.6, `hsla(${s.hue}, 100%, 55%, .9)`);
    g.addColorStop(1, `hsla(${s.hue}, 100%, 45%, 0)`);
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/* ============ FX entities ============ */
class Rocket {
    x: number;
    y: number;
    vx: number;
    vy: number;
    hue: number;
    life: number;
    constructor(x: number, y: number, vy: number, hue: number) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 1.5;
        this.vy = vy;
        this.hue = hue;
        this.life = 1200; // ms-ish
    }
}

class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    hue: number;
    size: number;
    life: number; // 0..255
    fade: number; // per frame
    g: number; // gravity factor
    constructor(x: number, y: number, vx: number, vy: number, hue: number, size: number) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.hue = hue;
        this.size = size;
        this.life = 255;
        this.fade = lerp(2.5, 4.8, Math.random());
        this.g = lerp(0.08, 0.22, Math.random());
    }
}

/* ============ Math helpers ============ */
function randHue() {
    // palette agréable (violet/rose/bleu/or)
    const base = [265, 210, 45, 15, 180][Math.floor(Math.random() * 5)];
    return (base + Math.floor(Math.random() * 40) - 20 + 360) % 360;
}

function burst(x: number, y: number, pool: Particle[], cfg: any, hue?: number) {
    const count = Math.floor(lerp(cfg.burstParticles[0], cfg.burstParticles[1], Math.random()));
    const baseHue = hue ?? randHue();

    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.15;
        const speed = lerp(3.5, 7.5, Math.random());
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const size = lerp(1.2, 2.6, Math.random());
        const h = (baseHue + Math.random() * 40 - 20 + 360) % 360;
        pool.push(new Particle(x, y, vx, vy, h, size));
    }

    // micro core
    for (let i = 0; i < 12; i++) {
        const vx = (Math.random() - 0.5) * 1.2;
        const vy = (Math.random() - 0.5) * 1.2;
        pool.push(new Particle(x, y, vx, vy, baseHue, 1.8));
    }
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}
function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
}

/* =========================
 * UI bits
 * ========================= */
function LogoTitle() {
    return (
        <h1 style={styles.title} className="glow">
            <span className="word">Wor</span>
            <span className="word alt">Duo</span>
        </h1>
    );
}

function TapPulse() {
    return (
        <div style={styles.tapPulse} className="pulse">
            Toucher pour lancer 🎆
        </div>
    );
}

/* =========================
 * Styles
 * ========================= */
const styles: Record<string, React.CSSProperties> = {
    wrap: {
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        background:
            "radial-gradient(1200px 600px at 50% -120px, rgba(120,119,198,.25), rgba(120,119,198,0) 60%), #0a0c18",
    },
    canvas: {
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        background: "transparent",
        zIndex: 0,
    },
    content: {
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center" as const,
        color: "white",
        padding: "24px 16px",
        gap: 16,
    },
    title: {
        fontSize: "64px",
        lineHeight: 1,
        letterSpacing: 1.2,
        margin: "0 0 12px",
        fontWeight: 900,
    },
    tagline: {
        margin: "0 0 18px",
        opacity: 0.9,
        fontSize: 18,
    },
    cta: {
        fontSize: 20,
        fontWeight: 800,
        padding: "14px 28px",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,.15)",
        background:
            "linear-gradient(180deg, rgba(255,226,107,1) 0%, rgba(255,193,61,1) 60%, rgba(255,173,20,1) 100%)",
        color: "#23180a",
        boxShadow: "0 8px 24px rgba(255,193,61,.35), inset 0 1px 0 rgba(255,255,255,.4)",
        cursor: "pointer",
        transform: "translateZ(0)",
        transition: "transform .08s ease, box-shadow .2s ease",
    },
    hint: {
        marginTop: 8,
        fontSize: 13,
        opacity: 0.75,
    },
    footer: {
        position: "absolute",
        bottom: 10,
        left: 0,
        right: 0,
        textAlign: "center" as const,
        fontSize: 12,
        color: "rgba(255,255,255,.6)",
    },
    tapPulse: {
        position: "absolute",
        zIndex: 1,
        left: "50%",
        top: "58%",
        transform: "translate(-50%, -50%)",
        color: "rgba(255,255,255,.9)",
        background: "rgba(30,33,62,.5)",
        border: "1px solid rgba(255,255,255,.15)",
        borderRadius: 999,
        padding: "10px 16px",
        fontSize: 14,
        textShadow: "0 1px 2px rgba(0,0,0,.45)",
        pointerEvents: "none" as const,
    },
};

const css = `
.glow {
  --c1: 280;
  --c2: 200;
  text-shadow:
    0 0 12px hsla(var(--c1), 98%, 68%, .55),
    0 0 28px hsla(var(--c2), 98%, 60%, .35),
    0 2px 0 rgba(0,0,0,.2);
}
.glow .word { 
  background: linear-gradient(90deg, #c7a4ff, #7ad8ff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.glow .word.alt { 
  background: linear-gradient(90deg, #ffd98a, #ffd060);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

button:hover { transform: translateY(-1px); }
button:active { transform: translateY(0); }

/* subtle pulse for first tap hint */
.pulse {
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(255,255,255,.25); }
  70% { box-shadow: 0 0 0 16px rgba(255,255,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
}
`;


