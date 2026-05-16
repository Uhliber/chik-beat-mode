import { describe, it, expect } from 'vitest';
import { Card } from '../Card';

describe('Card.assetPath', () => {
  it('returns the prompt+word path for standard prompts', () => {
    expect(new Card({ id: 'x', prompt: 'right', word: 'wally' }).assetPath).toBe('/cards/wally-right.png');
    expect(new Card({ id: 'x', prompt: 'left', word: 'pop' }).assetPath).toBe('/cards/pop-left.png');
    expect(new Card({ id: 'x', prompt: 'free', word: 'riki' }).assetPath).toBe('/cards/riki-free.png');
  });

  it('translates engine names to art-set filename aliases', () => {
    expect(new Card({ id: 'x', prompt: 'stop', word: 'hindo' }).assetPath).toBe('/cards/hindo-block.png');
    expect(new Card({ id: 'x', prompt: 'fetch', word: 'tambo' }).assetPath).toBe('/cards/tambo-off-deck.png');
    expect(new Card({ id: 'x', prompt: 'snap', word: 'chik' }).assetPath).toBe('/cards/chik-snap.png');
  });

  it('Halo-Halo Chik uses the distinct opener art regardless of prompt field', () => {
    const c = new Card({ id: 'x', prompt: 'free', word: 'chik', isHaloHalo: true });
    expect(c.assetPath).toBe('/cards/halohalo-chik-free.png');
  });
});

describe('Card.matchesBeat', () => {
  it('matches when word equals the current beat', () => {
    const c = new Card({ id: 'x', prompt: 'right', word: 'tambo' });
    expect(c.matchesBeat('tambo')).toBe(true);
    expect(c.matchesBeat('chik')).toBe(false);
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
