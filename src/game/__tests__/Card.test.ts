import { describe, it, expect } from 'vitest';
import { Card } from '../Card';

describe('Card.assetPath', () => {
  it('returns the standard path for a standard card', () => {
    const c = new Card({ id: 'x', kind: 'standard', word: 'wally' });
    expect(c.assetPath).toBe('/cards/wally.png');
  });

  it('returns the reverse path for a reverse card', () => {
    const c = new Card({ id: 'x', kind: 'reverse', word: 'pop' });
    expect(c.assetPath).toBe('/cards/pop-reverse.png');
  });

  it('returns the decoy path for a decoy card', () => {
    const c = new Card({ id: 'x', kind: 'decoy', word: 'riki' });
    expect(c.assetPath).toBe('/cards/riki-decoy.png');
  });

  it('returns the halo-halo path when isHaloHalo is true regardless of kind', () => {
    const c = new Card({ id: 'x', kind: 'halo-halo', word: 'chik', isHaloHalo: true });
    expect(c.assetPath).toBe('/cards/halohalo-chik.png');
  });
});

describe('Card.canBeSlammedOn', () => {
  it('decoys can be slammed on any base', () => {
    const c = new Card({ id: 'x', kind: 'decoy', word: 'chik' });
    expect(c.canBeSlammedOn('chik')).toBe(true);
    expect(c.canBeSlammedOn('riki')).toBe(true);
    expect(c.canBeSlammedOn('main')).toBe(true);
  });

  it('non-decoys can be slammed on a matching word base or main', () => {
    const c = new Card({ id: 'x', kind: 'standard', word: 'tambo' });
    expect(c.canBeSlammedOn('tambo')).toBe(true);
    expect(c.canBeSlammedOn('main')).toBe(true);
    expect(c.canBeSlammedOn('chik')).toBe(false);
  });
});

describe('Card.matchesBeat / isSpecial', () => {
  it('matchesBeat compares card word to beat word', () => {
    const c = new Card({ id: 'x', kind: 'standard', word: 'hindo' });
    expect(c.matchesBeat('hindo')).toBe(true);
    expect(c.matchesBeat('pop')).toBe(false);
  });

  it('standard cards are not special; reverse/decoy/halo-halo are', () => {
    expect(new Card({ id: '1', kind: 'standard', word: 'chik' }).isSpecial()).toBe(false);
    expect(new Card({ id: '2', kind: 'reverse', word: 'chik' }).isSpecial()).toBe(true);
    expect(new Card({ id: '3', kind: 'decoy', word: 'chik' }).isSpecial()).toBe(true);
    expect(new Card({ id: '4', kind: 'halo-halo', word: 'chik', isHaloHalo: true }).isSpecial()).toBe(true);
  });
});
