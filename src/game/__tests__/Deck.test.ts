import { describe, it, expect } from 'vitest';
import { buildSoloDeck, buildVersusDeck, buildPlaygroundDeck, shuffle } from '../Deck';
import type { ChantWord, CardPrompt } from '../types';

describe('buildSoloDeck', () => {
  const deck = buildSoloDeck();

  it('builds exactly 56 cards', () => {
    expect(deck.length).toBe(56);
  });

  it('matches the Solo 21/21/14 prompt distribution', () => {
    const byPrompt: Record<string, number> = {};
    for (const c of deck) byPrompt[c.prompt] = (byPrompt[c.prompt] ?? 0) + 1;
    expect(byPrompt.left).toBe(21);
    expect(byPrompt.right).toBe(21);
    expect(byPrompt.free).toBe(14);
    expect(byPrompt.stop ?? 0).toBe(0);
    expect(byPrompt.snap ?? 0).toBe(0);
    expect(byPrompt.fetch ?? 0).toBe(0);
  });

  it('includes exactly one Halo-Halo Chik', () => {
    expect(deck.filter((c) => c.isHaloHalo).length).toBe(1);
  });

  it('matches the chant-word distribution (Chik=16, others=8 each)', () => {
    const byWord: Record<string, number> = {};
    for (const c of deck) byWord[c.word] = (byWord[c.word] ?? 0) + 1;
    expect(byWord.chik).toBe(16);
    for (const w of ['wally', 'hindo', 'pop', 'tambo', 'riki'] as ChantWord[]) {
      expect(byWord[w]).toBe(8);
    }
  });
});

describe('buildVersusDeck', () => {
  const deck = buildVersusDeck();

  it('builds exactly 56 cards', () => {
    expect(deck.length).toBe(56);
  });

  it('matches the v1.0 prompt distribution', () => {
    const byPrompt: Record<string, number> = {};
    for (const c of deck) byPrompt[c.prompt] = (byPrompt[c.prompt] ?? 0) + 1;
    expect(byPrompt.right).toBe(14);
    expect(byPrompt.left).toBe(14);
    expect(byPrompt.free).toBe(7);
    expect(byPrompt.stop).toBe(7);
    expect(byPrompt.snap).toBe(7);
    expect(byPrompt.fetch).toBe(7);
  });

  it('includes exactly one Halo-Halo Chik (Free)', () => {
    const halos = deck.filter((c) => c.isHaloHalo);
    expect(halos.length).toBe(1);
    expect(halos[0].prompt).toBe('free');
  });

  it('matches the v1.0 chant-word distribution (Chik=16, others=8 each)', () => {
    const byWord: Record<string, number> = {};
    for (const c of deck) byWord[c.word] = (byWord[c.word] ?? 0) + 1;
    expect(byWord.chik).toBe(16);
    for (const w of ['wally', 'hindo', 'pop', 'tambo', 'riki'] as ChantWord[]) {
      expect(byWord[w]).toBe(8);
    }
  });

  it('produces 8 complete chant sequences (per rulebook)', () => {
    // 14 Right + 14 Left + 7 Free + 7 Stop + 7 Snap + 7 Fetch = 56
    // Each chant sequence is 7 cards (one per beat). 56/7 = 8.
    expect(deck.length / 7).toBe(8);
  });

  it('every card id is unique', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });
});

describe('shuffle', () => {
  it('preserves length and members', () => {
    const arr = [1, 2, 3, 4, 5];
    const out = shuffle(arr);
    expect(out.length).toBe(arr.length);
    expect(out.sort()).toEqual(arr.sort());
  });

  it('is deterministic with a seeded rng', () => {
    const rng1 = (() => { let s = 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const rng2 = (() => { let s = 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(shuffle(arr, rng1)).toEqual(shuffle(arr, rng2));
  });
});

describe('buildPlaygroundDeck', () => {
  it('builds the canonical 56-card deck when composition matches Versus defaults', () => {
    const deck = buildPlaygroundDeck({ right: 14, left: 14, free: 7, stop: 7, snap: 7, fetch: 7 });
    expect(deck.length).toBe(56);
    expect(deck.filter((c) => c.isHaloHalo).length).toBe(1);
  });

  it('cranking Snap to 21 yields the expected per-word distribution (6 Chik + 3 each)', () => {
    const deck = buildPlaygroundDeck({ right: 14, left: 14, free: 7, stop: 7, snap: 21, fetch: 7 });
    expect(deck.length).toBe(70);
    const snaps = deck.filter((c) => c.prompt === 'snap');
    expect(snaps.length).toBe(21);
    const byWord: Record<string, number> = {};
    for (const c of snaps) byWord[c.word] = (byWord[c.word] ?? 0) + 1;
    expect(byWord.chik).toBe(6);
    for (const w of ['wally', 'hindo', 'pop', 'tambo', 'riki']) expect(byWord[w]).toBe(3);
  });

  it('zeros out an entire prompt when its count is 0', () => {
    const deck = buildPlaygroundDeck({ right: 14, left: 14, free: 7, stop: 0, snap: 7, fetch: 7 });
    expect(deck.filter((c) => c.prompt === 'stop').length).toBe(0);
    expect(deck.length).toBe(49);
  });

  it('throws if Free count is below 1 (no Halo-Halo possible)', () => {
    expect(() =>
      buildPlaygroundDeck({ right: 14, left: 14, free: 0, stop: 7, snap: 7, fetch: 7 }),
    ).toThrow();
  });
});
