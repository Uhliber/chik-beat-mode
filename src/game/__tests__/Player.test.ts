import { describe, it, expect } from 'vitest';
import { Player } from '../Player';
import { Card } from '../Card';

describe('Player', () => {
  it('initializes empty with given id and seat', () => {
    const p = new Player('p1', 0);
    expect(p.id).toBe('p1');
    expect(p.seatIndex).toBe(0);
    expect(p.cardCount).toBe(0);
    expect(p.isAI).toBe(true);
    expect(p.ownedBaseWord).toBeNull();
  });

  it('addCard appends and re-sorts the hand into chant order, standards before specials', () => {
    const p = new Player('p1', 0);
    p.addCard(new Card({ id: 'reverse-chik', kind: 'reverse', word: 'chik' }));
    p.addCard(new Card({ id: 'wally-1', kind: 'standard', word: 'wally' }));
    p.addCard(new Card({ id: 'chik-1', kind: 'standard', word: 'chik' }));
    expect(p.hand.map((c) => c.id)).toEqual(['chik-1', 'reverse-chik', 'wally-1']);
  });

  it('hasCardForBeat returns the first matching card or null', () => {
    const p = new Player('p1', 0);
    const wally = new Card({ id: 'w', kind: 'standard', word: 'wally' });
    p.addCard(new Card({ id: 'c', kind: 'standard', word: 'chik' }));
    p.addCard(wally);
    expect(p.hasCardForBeat('wally')).toBe(wally);
    expect(p.hasCardForBeat('riki')).toBeNull();
  });

  it('removeCard pulls the card out and returns it; returns null if not found', () => {
    const p = new Player('p1', 0);
    const card = new Card({ id: 'c', kind: 'standard', word: 'chik' });
    p.addCard(card);
    expect(p.removeCard('c')).toBe(card);
    expect(p.cardCount).toBe(0);
    expect(p.removeCard('c')).toBeNull();
  });
});
