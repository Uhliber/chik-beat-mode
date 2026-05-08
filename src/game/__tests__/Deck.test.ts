import { describe, it, expect } from 'vitest';
import { buildBaseDeck, shuffle } from '../Deck';
import { CHANT_ORDER } from '../types';
import { seededRng } from './_helpers';

describe('buildBaseDeck', () => {
  const deck = buildBaseDeck();

  it('produces exactly 56 cards', () => {
    expect(deck).toHaveLength(56);
  });

  it('contains exactly one Halo-Halo Chik', () => {
    expect(deck.filter((c) => c.isHaloHalo)).toHaveLength(1);
  });

  it('contains 12 chik-word cards total (11 standard + 1 halo-halo)', () => {
    const chikWord = deck.filter((c) => c.word === 'chik' && c.kind !== 'reverse' && c.kind !== 'decoy');
    expect(chikWord).toHaveLength(12);
  });

  it('contains 6 standard cards for each non-chik word', () => {
    for (const word of CHANT_ORDER.filter((w) => w !== 'chik')) {
      const standards = deck.filter((c) => c.word === word && c.kind === 'standard');
      expect(standards, `standards for ${word}`).toHaveLength(6);
    }
  });

  it('contains 2 reverse-chik and 1 reverse for each other word', () => {
    expect(deck.filter((c) => c.kind === 'reverse' && c.word === 'chik')).toHaveLength(2);
    for (const word of CHANT_ORDER.filter((w) => w !== 'chik')) {
      expect(deck.filter((c) => c.kind === 'reverse' && c.word === word), `reverse-${word}`).toHaveLength(1);
    }
  });

  it('contains 2 decoy-chik and 1 decoy for each other word', () => {
    expect(deck.filter((c) => c.kind === 'decoy' && c.word === 'chik')).toHaveLength(2);
    for (const word of CHANT_ORDER.filter((w) => w !== 'chik')) {
      expect(deck.filter((c) => c.kind === 'decoy' && c.word === word), `decoy-${word}`).toHaveLength(1);
    }
  });

  it('gives every card a unique id', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });
});

describe('shuffle', () => {
  it('preserves length and elements', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(input, seededRng(42));
    expect(out).toHaveLength(input.length);
    expect(out.slice().sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = input.slice();
    shuffle(input, seededRng(7));
    expect(input).toEqual(snapshot);
  });

  it('is deterministic given the same seed', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(123));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRng(123));
    expect(a).toEqual(b);
  });
});
