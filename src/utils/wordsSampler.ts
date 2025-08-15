// src/utils/wordsSampler.ts
// AVANT
// import words from "an-array-of-french-words";

// APRÈS (ESM + JSON assertion)
// en haut du fichier
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const words = require("an-array-of-french-words") as string[]; // <-- plus d'assert


export type SamplerOptions = {
    count?: number;      // nb de mots demandés
    minLen?: number;     // longueur mini
    seed?: number;       // graine RNG (facultatif)
    allowHyphen?: boolean; // autoriser les traits d’union
};

function rngFactory(seed = Date.now()) {
    // simple LCG
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function shuffle<T>(arr: T[], rnd = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function sampleFrenchWords({
    count = 5000,
    minLen = 6,
    seed,
    allowHyphen = true,
}: SamplerOptions = {}) {
    const rnd = rngFactory(seed);

    // 1) Pool filtré + normalisé (NFD pour comparer sans accents)
    const pool = new Map<string, string>();
    for (const w of words) {
        if (typeof w !== "string") continue;
        const trimmed = w.trim();
        if (trimmed.length < minLen) continue;
        if (!allowHyphen && trimmed.includes("-")) continue;

        // garde que lettres + accents + éventuel tiret
        if (!/^[A-Za-zÀ-ÖØ-öø-ÿœŒ-]+$/.test(trimmed.replace(/-/g, ""))) continue;

        const key = trimmed.normalize("NFD").toLowerCase();
        if (!pool.has(key)) pool.set(key, trimmed);
    }

    const all = Array.from(pool.values());

    // 2) Regrouper par initiale (sans accent) pour stratifier
    const buckets = new Map<string, string[]>();
    for (const w of all) {
        const initial = w.normalize("NFD").toLowerCase().replace(/[^a-z]/g, "").charAt(0) || "#";
        if (!buckets.has(initial)) buckets.set(initial, []);
        buckets.get(initial)!.push(w);
    }

    // 3) Mélange interne de chaque bucket
    for (const list of buckets.values()) shuffle(list, rnd);

    // 4) Tirage “round-robin” entre buckets pour maximiser la variété
    const initials = Array.from(buckets.keys()).sort(); // ordre stable
    const result: string[] = [];
    let exhausted = 0;

    while (result.length < count && exhausted < initials.length) {
        exhausted = 0;
        for (const k of initials) {
            const list = buckets.get(k)!;
            if (list.length) result.push(list.pop()!);
            else exhausted++;
            if (result.length >= count) break;
        }
    }

    // 5) Au cas où il manque un peu, compléter depuis le pool global mélangé
    if (result.length < count) {
        shuffle(all, rnd);
        for (const w of all) {
            if (result.length >= count) break;
            if (!result.includes(w)) result.push(w);
        }
    }

    // 6) Mélange final
    return shuffle(result, rnd).slice(0, count);
}
