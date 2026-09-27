// --- server/syllabe.js ---
// Découpage approximatif d'un mot français en syllabes écrites, juste assez
// fiable pour trouver la première syllabe du mot à deviner et refuser un
// indice qui la donne telle quelle ("ça commence par MAI", "MAI-...").

const VOWELS = 'AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸ'
// Tréma, ou É/È juste après une voyelle : la voyelle se prononce à part
// (NOËL, MAÏS, POÈTE, AÉROPORT) et commence donc une nouvelle syllabe.
const HIATUS = 'ËÏÜÉÈ'
// Paires de consonnes qu'on ne sépare jamais (TA-BLE, AR-BRE, MA-CHINE).
const CLUSTERS = new Set(['BL', 'BR', 'CL', 'CR', 'DR', 'FL', 'FR', 'GL', 'GR', 'PL', 'PR', 'TR', 'VR', 'CH', 'PH', 'TH', 'GN'])

function prepare(s) {
  return String(s || '').toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE')
}

/** Majuscules, sans accents ni ligatures, lettres A-Z uniquement. */
export function normalize(s) {
  return prepare(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z]/g, '')
}

function isVowel(w, i) {
  const c = w[i]
  if (!c || !VOWELS.includes(c)) return false
  // Y entre deux voyelles se prononce comme une consonne : CRA-YON, RO-YAUME.
  if (c === 'Y' && VOWELS.includes(w[i - 1] || '-') && VOWELS.includes(w[i + 1] || '-')) return false
  return true
}

/**
 * Première syllabe du mot, normalisée, sous toutes les formes qu'on peut lui
 * donner : à l'oral d'abord, puis à l'écrit quand elles diffèrent
 * (POMME → ["PO", "POM"], QUILLE → ["QUI", "QUIL"]).
 */
function syllableForms(word) {
  const w = prepare(word).replace(/[^A-ZÀ-ÖØ-Þ]/g, '')
  let i = 0
  while (i < w.length && !isVowel(w, i)) i++
  if (i === w.length) return [normalize(w)]

  // Groupe de voyelles formant un seul son (AI, EAU, OU...), sauf hiatus.
  let j = i + 1
  while (j < w.length && isVowel(w, j) && !HIATUS.includes(w[j])) j++
  if (j < w.length && isVowel(w, j)) return [normalize(w.slice(0, j))] // hiatus

  let k = j
  while (k < w.length && !isVowel(w, k)) k++
  if (k === w.length) return [normalize(w)] // une seule syllabe (CHAT, PONT)

  const consonants = k - j
  // Consonne doublée : on l'écrit QUIL-LE mais on entend QUI-LLE.
  if (consonants === 2 && w[k - 2] === w[k - 1]) return [normalize(w.slice(0, k - 2)), normalize(w.slice(0, k - 1))]
  let cut
  if (consonants === 1) cut = j // MAI-SON
  else if (CLUSTERS.has(w.slice(k - 2, k))) cut = k - 2 // TA-BLE, AR-BRE
  else cut = k - 1 // POR-TE, OBS-TACLE
  return [normalize(w.slice(0, cut))]
}

/** Première syllabe du mot telle qu'on l'entend (ex. "Maison" → "MAI", "Arbre" → "AR"). */
export function firstSyllable(word) {
  return syllableForms(word)[0]
}

/**
 * Vrai si l'indice contient la première syllabe du mot comme mot à part
 * entière. On compare mot par mot, sans accents ni ponctuation, pour que
 * "Ça commence par « ma »" ou "MA-..." soient refusés, sans pour autant
 * interdire des mots qui ne font que commencer pareil ("manche" pour MAISON).
 */
export function revealsFirstSyllable(hint, word) {
  const forms = syllableForms(word).filter(Boolean)
  if (!forms.length) return false
  const tokens = prepare(hint).normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Z]+/).filter(Boolean)
  // Syllabe d'une seule lettre (A-VION, É-COLE) : "a", "à", "y" sont des mots
  // trop courants pour être interdits, on ne refuse que l'indice réduit à
  // cette lettre ("A", "a...").
  const long = forms.filter((f) => f.length > 1)
  if (tokens.length === 1 && forms.includes(tokens[0])) return true
  if (tokens.some((t) => long.includes(t))) return true
  // Syllabe épelée lettre par lettre : "M A I", "M.A.I.S.O.N".
  let spelled = ''
  for (const t of [...tokens, '']) {
    if (t.length === 1) spelled += t
    else {
      if (long.some((f) => spelled.startsWith(f))) return true
      spelled = ''
    }
  }
  return false
}

/** Nombre de premières lettres qu'un mot de l'indice ne peut pas partager avec le mot. */
export const PREFIX_LENGTH = 4

/**
 * Début du mot interdit dans l'indice : ses 4 premières lettres normalisées,
 * ou le mot entier s'il est plus court (ex. "Fluide" → "FLUI").
 */
export function forbiddenPrefix(word) {
  return normalize(word).slice(0, PREFIX_LENGTH)
}

/**
 * Vrai si un mot de l'indice commence par les mêmes 4 premières lettres que
 * le mot à deviner, dans le même ordre ("fluidifier" pour FLUIDE), ce que la
 * règle de la syllabe laisse passer.
 */
export function sharesPrefix(hint, word) {
  const prefix = forbiddenPrefix(word)
  if (!prefix) return false
  const tokens = prepare(hint).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Z]+/).filter(Boolean)
  return tokens.some((t) => t.startsWith(prefix))
}
