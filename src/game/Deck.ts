import { Card } from './Card';
import { CHANT_ORDER, type CardPrompt, type ChantWord, type PlaygroundComposition } from './types';

/**
 * Per-card count assignment from the v1.2 rulebook appendix. Each (word, prompt) cell
 * is an array of count values because Right and Left have TWO cards per word (paired
 * to sum to 10 where possible); the other prompts have one card per word.
 *
 * Total count across all 56 Versus cards = 280, average 5, with each of the 7 Chant
 * Trigger outcomes hit by exactly 8 cards (per the rulebook's design note). Chant Chik
 * cards use the same counts as regular Chik.
 */
const COUNT_TABLE: Record<ChantWord, Record<CardPrompt, number[]>> = {
  chik:  { right: [4, 6],  left: [4, 6], free: [5], stop: [5], snap: [5], fetch: [5] },
  wally: { right: [1, 9],  left: [2, 8], free: [3], stop: [7], snap: [6], fetch: [4] },
  hindo: { right: [0, 10], left: [2, 8], free: [3], stop: [7], snap: [6], fetch: [4] },
  pop:   { right: [0, 10], left: [1, 9], free: [3], stop: [7], snap: [6], fetch: [4] },
  tambo: { right: [0, 10], left: [1, 9], free: [2], stop: [8], snap: [6], fetch: [4] },
  riki:  { right: [0, 10], left: [1, 9], free: [2], stop: [8], snap: [3], fetch: [7] },
};

/** Convenience for callers that want to know a card's count by (word, prompt, dup index). */
export function countFor(word: ChantWord, prompt: CardPrompt, dupIndex = 0): number {
  const arr = COUNT_TABLE[word][prompt];
  return arr[dupIndex % arr.length];
}

/**
 * Solo deck, 56 cards using only Left/Right/Free prompts.
 *
 * Counts are assigned for art-set parity even though Solo doesn't read them, the same
 * Card class is shared and assetPath would otherwise point at `…-undefined.png`. Pulls
 * from the same per-word count table; for words/prompts with two counts (Right/Left)
 * we cycle through the array; for single-count prompts (Free) we repeat.
 */
export function buildSoloDeck(): Card[] {
  const cards: Card[] = [];
  const otherWords: ChantWord[] = ['wally', 'hindo', 'pop', 'tambo', 'riki'];

  const pushSolo = (id: string, prompt: CardPrompt, word: ChantWord, dupIndex: number, isHaloHalo = false) => {
    cards.push(new Card({ id, prompt, word, isHaloHalo, count: countFor(word, prompt, dupIndex) }));
  };
  const pushSoloChantChik = (id: string, prompt: CardPrompt, dupIndex: number) => {
    cards.push(new Card({ id, prompt, word: 'chik', isChantChik: true, count: countFor('chik', prompt, dupIndex) }));
  };

  // Left: 6 Chik + 3 each of the others
  for (let i = 0; i < 6; i++) pushSolo(`solo-left-chik-${i}`, 'left', 'chik', i);
  for (const w of otherWords) {
    for (let i = 0; i < 3; i++) pushSolo(`solo-left-${w}-${i}`, 'left', w, i);
  }

  // Right: 6 Chik + 3 each of the others
  for (let i = 0; i < 6; i++) pushSolo(`solo-right-chik-${i}`, 'right', 'chik', i);
  for (const w of otherWords) {
    for (let i = 0; i < 3; i++) pushSolo(`solo-right-${w}-${i}`, 'right', w, i);
  }

  // Free: Halo-Halo Chik + 3 Chant Chik (free) + 2 each of the others.
  //
  // The 3 generic Free Chik slots use the CHANT CHIK variant because there is no
  // `free-chik-${count}.png` asset in /new/, only the Halo-Halo card carries a
  // Free + Chik (regular) face (`free-chik-halohalo-5.png`). Without this swap the
  // remaining 3 Free Chik cards would 404 their image. Solo mode doesn't use the
  // Chant Trigger so isChantChik is purely visual here.
  pushSolo('halohalo-chik', 'free', 'chik', 0, true);
  for (let i = 0; i < 3; i++) pushSoloChantChik(`solo-free-chant-chik-${i}`, 'free', i);
  for (const w of otherWords) {
    for (let i = 0; i < 2; i++) pushSolo(`solo-free-${w}-${i}`, 'free', w, i);
  }

  if (cards.length !== 56) {
    throw new Error(`Solo deck build error: expected 56, got ${cards.length}`);
  }
  return cards;
}

/**
 * Versus deck, canonical v1.2 56-card distribution. Half of the 16 Chik cards are
 * Chant Chik variants (8 each); per prompt, the regular/Chant-Chik split is even so
 * the rulebook's per-prompt count distribution (Right/Left: 4 and 6; others: 5) is
 * preserved across both variants.
 *
 *   Prompt | Chik regular | Chant Chik | Wally | Hindo | Pop | Tambo | Riki | Total
 *   -------+--------------+-----------+-------+-------+-----+-------+------+------
 *   Right  |  2           |  2        |  2    |  2    |  2  |  2    |  2   | 14
 *   Left   |  2           |  2        |  2    |  2    |  2  |  2    |  2   | 14
 *   Free   |  1 (Halo-H.) |  1        |  1    |  1    |  1  |  1    |  1   |  7
 *   Stop   |  1           |  1        |  1    |  1    |  1  |  1    |  1   |  7
 *   Snap   |  1           |  1        |  1    |  1    |  1  |  1    |  1   |  7
 *   Fetch  |  1           |  1        |  1    |  1    |  1  |  1    |  1   |  7
 *   Total  | 8            |  8        |  8    |  8    |  8  |  8    |  8   | 56
 */
export function buildVersusDeck(): Card[] {
  const cards: Card[] = [];
  const prompts: CardPrompt[] = ['right', 'left', 'free', 'stop', 'snap', 'fetch'];
  // Half of each Chik prompt bucket is regular, the other half is Chant Chik. For
  // Right/Left (4 total Chik cards each), that's 2+2. For everyone else (2 Chik each),
  // that's 1+1.
  const chikPerVariant: Record<CardPrompt, number> = { right: 2, left: 2, free: 1, stop: 1, snap: 1, fetch: 1 };
  const otherPerPrompt: Record<CardPrompt, number> = { right: 2, left: 2, free: 1, stop: 1, snap: 1, fetch: 1 };
  const otherWords: ChantWord[] = ['wally', 'hindo', 'pop', 'tambo', 'riki'];

  for (const prompt of prompts) {
    // Regular Chik bucket. The single Free Chik (regular) IS the Halo-Halo opener.
    for (let i = 0; i < chikPerVariant[prompt]; i++) {
      const isHalo = prompt === 'free' && i === 0;
      const id = isHalo ? 'halohalo-chik' : `${prompt}-chik-${i}`;
      cards.push(new Card({ id, prompt, word: 'chik', isHaloHalo: isHalo, count: countFor('chik', prompt, i) }));
    }
    // Chant Chik bucket, same counts, isChantChik = true.
    for (let i = 0; i < chikPerVariant[prompt]; i++) {
      cards.push(new Card({
        id: `${prompt}-chant-chik-${i}`,
        prompt,
        word: 'chik',
        isChantChik: true,
        count: countFor('chik', prompt, i),
      }));
    }
    // Other-word cards.
    for (const w of otherWords) {
      for (let i = 0; i < otherPerPrompt[prompt]; i++) {
        cards.push(new Card({
          id: `${prompt}-${w}-${i}`,
          prompt,
          word: w,
          count: countFor(w, prompt, i),
        }));
      }
    }
  }

  if (cards.length !== 56) {
    throw new Error(`Versus deck build error: expected 56, got ${cards.length}`);
  }
  return cards;
}

/**
 * Playground deck builder. Same per-prompt totals as before; the Chik portion of each
 * prompt is split evenly between regular Chik (with the Halo-Halo being the first Free
 * Chik) and Chant Chik. Counts use the per-word table.
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
    const chikCount = Math.max(0, Math.round((total * 2) / 7));
    // Split Chik between regular and Chant Chik. Halo-Halo lives in the regular Free Chik bucket.
    const regularChik = Math.ceil(chikCount / 2);
    const chantChik = chikCount - regularChik;
    let remaining = total - chikCount;
    const perOther = Math.floor(remaining / otherWords.length);
    let extra = remaining - perOther * otherWords.length;

    // Regular Chik.
    for (let i = 0; i < regularChik; i++) {
      const isHalo = prompt === 'free' && i === 0;
      const id = isHalo ? 'halohalo-chik' : `${prompt}-chik-${i}`;
      cards.push(new Card({ id, prompt, word: 'chik', isHaloHalo: isHalo, count: countFor('chik', prompt, i) }));
    }
    // Chant Chik.
    for (let i = 0; i < chantChik; i++) {
      cards.push(new Card({
        id: `${prompt}-chant-chik-${i}`,
        prompt,
        word: 'chik',
        isChantChik: true,
        count: countFor('chik', prompt, i),
      }));
    }

    // Other words.
    for (const w of otherWords) {
      const count = perOther + (extra > 0 ? 1 : 0);
      if (extra > 0) extra--;
      for (let i = 0; i < count; i++) {
        cards.push(new Card({
          id: `${prompt}-${w}-${i}`,
          prompt,
          word: w,
          count: countFor(w, prompt, i),
        }));
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
