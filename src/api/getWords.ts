// src/api/getWords.ts
export async function getWords(params?: {
    count?: number
    minLen?: number
    maxLen?: number
    seed?: number
    allowHyphen?: boolean
    common?: boolean
    mode?: 'core' | 'all'
    onlyInfinitive?: boolean
    exclude?: string[]
}) {
    const qs = new URLSearchParams()
    if (params?.count) qs.set("count", String(params.count))
    if (params?.minLen) qs.set("minLen", String(params.minLen))
    if (params?.maxLen) qs.set("maxLen", String(params.maxLen))
    if (typeof params?.seed === "number") qs.set("seed", String(params.seed))
    if (params?.allowHyphen === false) qs.set("allowHyphen", "false")
    if (params?.common === true) qs.set("common", "true")
    if (params?.mode) qs.set("mode", params.mode)
    if (params?.onlyInfinitive) qs.set("onlyInfinitive", "true")
    if (params?.exclude?.length) qs.set("exclude", params.exclude.join(","))

    const res = await fetch(`/api/words?${qs.toString()}`, { cache: "no-store" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as { count: number; words: string[] }
}

// src/api/getWordsStatic.ts
export async function getWordsStatic() {
    const res = await fetch("/words_6plus.json")
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as string[]
}
