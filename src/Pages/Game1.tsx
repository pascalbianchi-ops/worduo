// src/Pages/Game1.tsx
import { useEffect, useMemo, useState } from "react";
import { getWords, getWordsStatic } from "../api/getWords";

export default function Game1() {
    const [words, setWords] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Tirage et historique
    const [used, setUsed] = useState<Set<number>>(new Set());
    const [current, setCurrent] = useState<string | null>(null);

    // Charger 5000 mots (≥6) via l’API, sinon fallback JSON statique
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { words } = await getWords({ count: 5000, minLen: 6 });
                console.log("SOURCE = API");
                if (!cancelled) setWords(words);
            } catch {
                try {
                    const list = await getWordsStatic();
                    if (!cancelled) setWords(list);
                } catch (e: any) {
                    if (!cancelled) setError(e?.message ?? "Erreur de chargement des mots");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    // Compte restant
    const remaining = useMemo(() => Math.max(0, words.length - used.size), [words.length, used.size]);

    // Tire un mot non encore utilisé
    const drawWord = () => {
        if (!words.length || used.size >= words.length) return;

        // Essayes aléatoirement quelques indices, sinon parcours linéaire
        let idx = -1;
        for (let tries = 0; tries < 20; tries++) {
            const r = Math.floor(Math.random() * words.length);
            if (!used.has(r)) {
                idx = r;
                break;
            }
        }
        if (idx === -1) {
            // fallback linéaire
            for (let i = 0; i < words.length; i++) {
                if (!used.has(i)) {
                    idx = i;
                    break;
                }
            }
        }
        if (idx !== -1) {
            setUsed(prev => new Set(prev).add(idx));
            setCurrent(words[idx]);
        }
    };

    const resetDraw = () => {
        setUsed(new Set());
        setCurrent(null);
    };

    if (loading) return <div style={{ padding: 16 }}>Chargement des mots…</div>;
    if (error) return <div style={{ padding: 16, color: "crimson" }}>Erreur : {error}</div>;
    if (!words.length) return <div style={{ padding: 16 }}>Aucun mot reçu.</div>;

    return (
        <div style={{ padding: 16, display: "grid", gap: 12, maxWidth: 640 }}>
            <h1 style={{ margin: 0 }}>Worduo</h1>

            <div style={{ opacity: 0.8 }}>
                <strong>Banque de mots :</strong> {words.length.toLocaleString("fr-FR")} •{" "}
                <strong>Restants :</strong> {remaining.toLocaleString("fr-FR")}
            </div>

            <div
                style={{
                    padding: 20,
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    minHeight: 80,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 24,
                    fontWeight: 700,
                    background: "#fafafa",
                }}
            >
                {current ?? "— Tire un mot pour commencer —"}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <button
                    onClick={drawWord}
                    disabled={remaining === 0}
                    style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: remaining ? "#fff" : "#f3f3f3",
                        cursor: remaining ? "pointer" : "not-allowed",
                    }}
                >
                    Tirer un mot
                </button>

                <button
                    onClick={resetDraw}
                    style={{
                        padding: "10px 16px",
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        background: "#fff",
                        cursor: "pointer",
                    }}
                >
                    Réinitialiser
                </button>
            </div>

            {/* Zone debug optionnelle */}
            <details>
                <summary>Debug</summary>
                <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 8 }}>
                    used: {Array.from(used).slice(0, 10).join(", ")}
                    {used.size > 10 ? "…" : ""} / {words.length}
                </div>
            </details>
        </div>
    );
}
