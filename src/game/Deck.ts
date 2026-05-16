import { Card } from './Card';
import { CHANT_ORDER, type CardPrompt, type ChantWord, type PlaygroundComposition } from './types';

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

/**
 * Playground deck builder. Caller supplies total counts per prompt — within each
 * prompt the cards are distributed with Chik weighted 2× (matches the canonical
 * v1.0 ratio). For clean integer math, total per prompt SHOULD be a multiple of 7
 * (so the split is 2N Chik + N of each other word). Non-multiples are best-effort:
 * floor-allocate the Chik portion, then fill the rest evenly across the other words.
 *
 * Free is the prompt that carries the Halo-Halo Chik. If free count is 0 we throw —
 * the engine needs at least one Halo-Halo to open the game.
 */
export function buildPlaygroundDeck(composition: PlaygroundComposition): Card[] {
  if ((composition.free ?? 0) < 1) {
    throw new Error('Playground deck: Free prompt count must be at least 1 (carries the Halo-Halo).');
  }
  const cards: Card[] = [];
  const prompts: CardPrompt[] = ['right', 'left', 'free', 'stop', 'snap', 'fetch'];
  const otherWords: ChantWord[] = ['wally', 'hindo', 'pop', 'tambo', 'riki'];

  for (const prompt of prompts) {
    const total = composition[prompt] ?? 0;
    if (total <= 0) continue;
    // Split: 2N Chik + N each of 5 other words = 7N when total = 7N. For arbitrary
    // total, distribute as evenly as possible, rounding the Chik portion to ceil(2/7).
    const chikCount = Math.max(0, Math.round((total * 2) / 7));
    let remaining = total - chikCount;
    // Spread `remaining` across 5 other words. Earlier words get one extra if it doesn't divide evenly.
    const perOther = Math.floor(remaining / otherWords.length);
    let extra = remaining - perOther * otherWords.length;

    // Chik cards — Free's first one is the Halo-Halo opener.
    if (prompt === 'free') {
      cards.push(new Card({ id: 'halohalo-chik', prompt: 'free', word: 'chik', isHaloHalo: true }));
      for (let i = 0; i < chikCount - 1; i++) {
        cards.push(new Card({ id: `free-chik-${i}`, prompt: 'free', word: 'chik' }));
      }
    } else {
      for (let i = 0; i < chikCount; i++) {
        cards.push(new Card({ id: `${prompt}-chik-${i}`, prompt, word: 'chik' }));
      }
    }

    // Other words.
    for (const w of otherWords) {
      const count = perOther + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      for (let i = 0; i < count; i++) {
        cards.push(new Card({ id: `${prompt}-${w}-${i}`, prompt, word: w }));
      }
      remaining -= count;
      if (remaining < 0) break;
    }
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
