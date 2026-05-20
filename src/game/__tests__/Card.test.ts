import { describe, it, expect } from 'vitest';
import { Card } from '../Card';

describe('Card.assetPath (v1.2 /new/ art set)', () => {
  it('returns the prompt-word-count path for standard cards', () => {
    expect(new Card({ id: 'x', prompt: 'right', word: 'wally', count: 9 }).assetPath)
      .toBe('/new/right-wally-9.png');
    expect(new Card({ id: 'x', prompt: 'left', word: 'pop', count: 1 }).assetPath)
      .toBe('/new/left-pop-1.png');
    expect(new Card({ id: 'x', prompt: 'free', word: 'riki', count: 2 }).assetPath)
      .toBe('/new/free-riki-2.png');
  });

  it('uses canonical engine prompt names (no block / off-deck aliases)', () => {
    expect(new Card({ id: 'x', prompt: 'stop', word: 'hindo', count: 7 }).assetPath)
      .toBe('/new/stop-hindo-7.png');
    expect(new Card({ id: 'x', prompt: 'fetch', word: 'tambo', count: 4 }).assetPath)
      .toBe('/new/fetch-tambo-4.png');
    expect(new Card({ id: 'x', prompt: 'snap', word: 'chik', count: 5 }).assetPath)
      .toBe('/new/snap-chik-5.png');
  });

  it('Halo-Halo Chik uses the distinct opener art regardless of count', () => {
    const c = new Card({ id: 'x', prompt: 'free', word: 'chik', isHaloHalo: true, count: 5 });
    expect(c.assetPath).toBe('/new/free-chik-halohalo-5.png');
  });

  it('Chant Chik variant uses the chant-chik filename slug', () => {
    expect(new Card({ id: 'x', prompt: 'right', word: 'chik', isChantChik: true, count: 4 }).assetPath)
      .toBe('/new/right-chant-chik-4.png');
    expect(new Card({ id: 'x', prompt: 'stop', word: 'chik', isChantChik: true, count: 5 }).assetPath)
      .toBe('/new/stop-chant-chik-5.png');
  });
});

describe('Card.matchesBeat', () => {
  it('matches when word equals the current beat', () => {
    const c = new Card({ id: 'x', prompt: 'right', word: 'tambo' });
    expect(c.matchesBeat('tambo')).toBe(true);
    expect(c.matchesBeat('chik')).toBe(false);
  });

  it('Chant Chik still matches the Chik beat (it IS a Chik variant)', () => {
    const c = new Card({ id: 'x', prompt: 'right', word: 'chik', isChantChik: true });
    expect(c.matchesBeat('chik')).toBe(true);
    expect(c.matchesBeat('wally')).toBe(false);
  });
});

describe('Card.legalSoloBases', () => {
  it('left-prompt cards may only slam Left', () => {
    expect(new Card({ id: 'x', prompt: 'left', word: 'chik' }).legalSoloBases()).toEqual(['left']);
  });
  it('right-prompt cards may only slam Right', () => {
    expect(new Card({ id: 'x', prompt: 'right', word: 'chik' }).legalSoloBases()).toEqual(['right']);
  });
  it('free-prompt cards may slam either', () => {
    expect(new Card({ id: 'x', prompt: 'free', word: 'chik' }).legalSoloBases()).toEqual(['left', 'right']);
  });
});
