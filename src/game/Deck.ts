import { Card } from './Card';
import { CHANT_ORDER, type ChantWord } from './types';

/** Build the canonical 56-card deck for the base game (no expansions). */
export function buildBaseDeck(): Card[] {
  const cards: Card[] = [];

  // 11 Chik (standard) + 1 Halo-Halo Chik = 12 chik-word cards
  cards.push(new Card({ id: 'halohalo-chik', kind: 'halo-halo', word: 'chik', isHaloHalo: true }));
  for (let i = 0; i < 11; i++) {
    cards.push(new Card({ id: `chik-${i}`, kind: 'standard', word: 'chik' }));
  }

  // 6 of each Wally..Riki
  const otherWords: ChantWord[] = ['wally', 'hindo', 'pop', 'tambo', 'riki'];
  for (const word of otherWords) {
    for (let i = 0; i < 6; i++) {
      cards.push(new Card({ id: `${word}-${i}`, kind: 'standard', word }));
    }
  }

  // 2 Reverse Chik
  for (let i = 0; i < 2; i++) {
    cards.push(new Card({ id: `reverse-chik-${i}`, kind: 'reverse', word: 'chik' }));
  }
  // 1 Reverse for each other word
  for (const word of otherWords) {
    cards.push(new Card({ id: `reverse-${word}`, kind: 'reverse', word }));
  }

  // 2 Decoy Chik
  for (let i = 0; i < 2; i++) {
    cards.push(new Card({ id: `decoy-chik-${i}`, kind: 'decoy', word: 'chik' }));
  }
  // 1 Decoy for each other word
  for (const word of otherWords) {
    cards.push(new Card({ id: `decoy-${word}`, kind: 'decoy', word }));
  }

  if (cards.length !== 56) {
    throw new Error(`Deck build error: expected 56 cards, got ${cards.length}`);
  }
  return cards;
}

/** Fisher–Yates shuffle, with optional seedable RNG. */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export { CHANT_ORDER };
