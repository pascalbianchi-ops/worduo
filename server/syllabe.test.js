// Tests : node --test server/   (ou npm test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { firstSyllable, revealsFirstSyllable, sharesPrefix, containsSpace, exceedsMaxLength, MAX_HINT_LENGTH } from './syllabe.js'

test('première syllabe de mots courants', () => {
  const cases = {
    MAISON: 'MAI',
    maison: 'MAI',
    CHAPEAU: 'CHA',
    TABLE: 'TA',
    ARBRE: 'AR',
    PORTE: 'POR',
    ORCHESTRE: 'OR',
    MACHINE: 'MA',
    MONTAGNE: 'MON',
    ENFANT: 'EN',
    CHOCOLAT: 'CHO',
    GUITARE: 'GUI',
    QUILLE: 'QUI',
    POMME: 'PO',
    CAROTTE: 'CA',
    CRAYON: 'CRA',
    OISEAU: 'OI',
    ÉCOLE: 'E',
    AVION: 'A',
    ÉLÉPHANT: 'E',
    FENÊTRE: 'FE',
    CŒUR: 'COEUR',
    NOËL: 'NO',
    POÈTE: 'PO',
    AÉROPORT: 'A',
    CHAT: 'CHAT',
    PONT: 'PONT',
  }
  for (const [word, syllable] of Object.entries(cases)) {
    assert.equal(firstSyllable(word), syllable, word)
  }
})

test('refuse un indice qui donne la première syllabe', () => {
  const refused = [
    ['MAI', 'MAISON'],
    ['mai', 'MAISON'],
    ['Ça commence par « mai »', 'MAISON'],
    ['MAI-...', 'MAISON'],
    ['mai…', 'MAISON'],
    ['m a i', 'MAISON'],
    ['M.A.I.S.O.N', 'MAISON'],
    ['première syllabe : cha', 'CHAPEAU'],
    ['Chà !', 'CHAPEAU'],
    ['fé', 'FENÊTRE'],
    ['le mot est chat', 'CHAT'],
    ['po', 'POMME'],
    ['pom', 'POMME'],
    ['qui ?', 'QUILLE'],
    ['A', 'AVION'],
    ['é...', 'ÉCOLE'],
  ]
  for (const [hint, word] of refused) {
    assert.equal(revealsFirstSyllable(hint, word), true, `${hint} / ${word}`)
  }
})

test('accepte les indices qui ne donnent pas la première syllabe', () => {
  const accepted = [
    ['on y habite', 'MAISON'],
    ['manche', 'MAISON'], // commence pareil sans donner la syllabe
    ['maintenant', 'MAISON'],
    ['on le met sur la tête', 'CHAPEAU'],
    ['animal qui miaule', 'CHAT'],
    ['il y a des ailes', 'AVION'], // "a" et "y" restent utilisables
    ['on y apprend à lire', 'ÉCOLE'],
    ['m a', 'MAISON'], // épelé mais incomplet
    ['nuit', 'MAISON'],
  ]
  for (const [hint, word] of accepted) {
    assert.equal(revealsFirstSyllable(hint, word), false, `${hint} / ${word}`)
  }
})

test('entrées vides ou nulles sans erreur', () => {
  assert.equal(revealsFirstSyllable('', 'MAISON'), false)
  assert.equal(revealsFirstSyllable('indice', ''), false)
  assert.equal(revealsFirstSyllable('indice', null), false)
  assert.equal(firstSyllable(''), '')
})

test('chaque mot de la banque a une première syllabe non vide', () => {
  const require = createRequire(import.meta.url)
  const words = require('./mots-courants.json')
  for (const w of words) {
    const s = firstSyllable(w)
    assert.ok(s.length > 0, w)
    assert.ok(w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/Œ/g, 'OE').startsWith(s), `${w} → ${s}`)
    // Donner la syllabe seule doit toujours être refusé
    assert.equal(revealsFirstSyllable(s.toLowerCase(), w), true, `${w} → ${s}`)
  }
})

test('refuse un mot de l’indice qui commence par les 4 mêmes lettres', () => {
  const refused = [
    ['fluidifier', 'FLUIDE'],
    ['pour fluidifier la circulation', 'FLUIDE'],
    ['Maisonnette', 'MAISON'],
    ['chapellerie', 'CHAPEAU'],
    ['éléphanteau', 'ÉLÉPHANT'], // accents ignorés
    ['selle', 'SEL'], // mot plus court que 4 lettres : le mot entier
  ]
  for (const [hint, word] of refused) {
    assert.equal(sharesPrefix(hint, word), true, `${hint} / ${word}`)
  }
  const accepted = [
    ['maintenant', 'MAISON'], // seulement 3 lettres en commun
    ['liquide', 'FLUIDE'],
    ['on y habite', 'MAISON'],
  ]
  for (const [hint, word] of accepted) {
    assert.equal(sharesPrefix(hint, word), false, `${hint} / ${word}`)
  }
  assert.equal(sharesPrefix('indice', ''), false)
  assert.equal(sharesPrefix('', 'MAISON'), false)
})

test('refuse un indice de plusieurs mots', () => {
  const refused = ['deux mots', 'on y habite', 'mot\tavec tabulation', 'espace insécable', 'ligne\nsuivante']
  for (const hint of refused) {
    assert.equal(containsSpace(hint), true, JSON.stringify(hint))
  }
  const accepted = ['maison', 'arc-en-ciel', "aujourd'hui", 'Éléphant', 'porte-monnaie']
  for (const hint of accepted) {
    assert.equal(containsSpace(hint), false, hint)
  }
  assert.equal(containsSpace(''), false)
  assert.equal(containsSpace(null), false)
})

test('refuse un indice de plus de 25 caractères', () => {
  assert.equal(MAX_HINT_LENGTH, 25)
  assert.equal(exceedsMaxLength('anticonstitutionnellement'), false) // 25 : la limite
  assert.equal(exceedsMaxLength('anticonstitutionnellementx'), true) // 26
  assert.equal(exceedsMaxLength('a'.repeat(25)), false)
  assert.equal(exceedsMaxLength('a'.repeat(26)), true)
  // Une lettre accentuée compte pour un caractère, même décomposée (e + accent)
  assert.equal(exceedsMaxLength('é'.repeat(25)), false)
  assert.equal(exceedsMaxLength('é'.repeat(25)), false)
  assert.equal(exceedsMaxLength('é'.repeat(26)), true)
  assert.equal(exceedsMaxLength('maison'), false)
  assert.equal(exceedsMaxLength(''), false)
  assert.equal(exceedsMaxLength(null), false)
})
