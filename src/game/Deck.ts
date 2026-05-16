import { Card } from './Card';
import { CHANT_ORDER, type CardPrompt, type ChantWord } from './types';

/**
 * Solo deck — 56 cards using only Left/Right/Free prompts.
 *
 * Per-word counts mirror the v1.0 Versus distribution (Chik = 16, others = 8 each) so the
 * chant beat is still hit at roughly the right rate. Halo-Halo Chik is the single
 * deterministic Free card that opens the game.
 *
 *   Prompt  | Total | Chik | Wally | Hindo | Pop | Tambo | Riki
 *   --------+-------+------+-------+-------+-----+-------+------
 *   Left    | 21    |  6   |  3    |  3    |  3  |  3    |  3
 *   Right   | 21    |  6   |  3    |  3    |  3  |  3    |  3
 *   Free    | 14    |  4*  |  2    |  2    |  2  |  2    |  2     (* one is Halo-Halo Chik)
 *   Total   | 56    | 16   |  8    |  8    |  8  |  8    |  8
 */
export function buildSoloDeck(): Card[] {
  const cards: Card[] = [];
  const otherWords: ChantWord[] = ['wally', 'hindo', 'pop', 'tambo', 'riki'];

  // Left: 6 Chik + 3 each of the others
  for (let i = 0; i < 6; i++) cards.push(new Card({ id: `solo-left-chik-${i}`, prompt: 'left', word: 'chik' }));
  for (const w of otherWords) {
    for (let i = 0; i < 3; i++) cards.push(new Card({ id: `solo-left-${w}-${i}`, prompt: 'left', word: w }));
  }

  // Right: 6 Chik + 3 each of the others
  for (let i = 0; i < 6; i++) cards.push(new Card({ id: `solo-right-chik-${i}`, prompt: 'right', word: 'chik' }));
  for (const w of otherWords) {
    for (let i = 0; i < 3; i++) cards.push(new Card({ id: `solo-right-${w}-${i}`, prompt: 'right', word: w }));
  }

  // Free: Halo-Halo Chik + 3 Chik + 2 each of the others
  cards.push(new Card({ id: 'halohalo-chik', prompt: 'free', word: 'chik', isHaloHalo: true }));
  for (let i = 0; i < 3; i++) cards.push(new Card({ id: `solo-free-chik-${i}`, prompt: 'free', word: 'chik' }));
  for (const w of otherWords) {
    for (let i = 0; i < 2; i++) cards.push(new Card({ id: `solo-free-${w}-${i}`, prompt: 'free', word: w }));
  }

  if (cards.length !== 56) {
    throw new Error(`Solo deck build error: expected 56, got ${cards.length}`);
  }
  return cards;
}

/**
 * Versus deck — canonical v1.0 56-card distribution.
 *
 *   Prompt | Chik | Wally | Hindo | Pop | Tambo | Riki | Total
 *   -------+------+-------+-------+-----+-------+------+------
 *   Right  |  4   |  2    |  2    |  2  |  2    |  2   | 14
 *   Left   |  4   |  2    |  2    |  2  |  2    |  2   | 14
 *   Free   |  2*  |  1    |  1    |  1  |  1    |  1   |  7   (* one is Halo-Halo Chik)
 *   Stop   |  2   |  1    |  1    |  1  |  1    |  1   |  7
 *   Snap   |  2   |  1    |  1    |  1  |  1    |  1   |  7
 *   Fetch  |  2   |  1    |  1    |  1  |  1    |  1   |  7
 *   Total  | 16   |  8    |  8    |  8  |  8    |  8   | 56
 */
export function buildVersusDeck(): Card[] {
  const cards: Card[] = [];
  const prompts: CardPrompt[] = ['right', 'left', 'free', 'stop', 'snap', 'fetch'];
  const chikPerPrompt: Record<CardPrompt, number> = { right: 4, left: 4, free: 2, stop: 2, snap: 2, fetch: 2 };
  const otherPerPrompt: Record<CardPrompt, number> = { right: 2, left: 2, free: 1, stop: 1, snap: 1, fetch: 1 };
  const otherWords: ChantWord[] = ['wally', 'hindo', 'pop', 'tambo', 'riki'];

  for (const prompt of prompts) {
    // Chik cards for this prompt — the Free prompt has one Halo-Halo Chik baked in.
    if (prompt === 'free') {
      cards.push(new Card({ id: 'halohalo-chik', prompt: 'free', word: 'chik', isHaloHalo: true }));
      for (let i = 0; i < chikPerPrompt.free - 1; i++) {
        cards.push(new Card({ id: `free-chik-${i}`, prompt: 'free', word: 'chik' }));
      }
    } else {
      for (let i = 0; i < chikPerPrompt[prompt]; i++) {
        cards.push(new Card({ id: `${prompt}-chik-${i}`, prompt, word: 'chik' }));
      }
    }
    // Other-word cards for this prompt.
    for (const w of otherWords) {
      for (let i = 0; i < otherPerPrompt[prompt]; i++) {
        cards.push(new Card({ id: `${prompt}-${w}-${i}`, prompt, word: w }));
      }
    }
  }

  if (cards.length !== 56) {
    throw new Error(`Versus deck build error: expected 56, got ${cards.length}`);
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
