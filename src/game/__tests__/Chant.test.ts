import { describe, it, expect } from 'vitest';
import { Chant, BEAT_ORDER } from '../Chant';

describe('Chant', () => {
  it('starts at the opening Chik', () => {
    const c = new Chant();
    expect(c.current).toBe('chik');
    expect(c.currentIndex).toBe(0);
    expect(c.virtualPos).toBe(0);
  });

  it('advances through the loop forward', () => {
    const c = new Chant();
    expect(c.advance()).toBe('wally');
    expect(c.advance()).toBe('hindo');
    expect(c.advance()).toBe('pop');
    expect(c.advance()).toBe('tambo');
    expect(c.advance()).toBe('riki');
    expect(c.advance()).toBe('chik'); // closing
    expect(c.advance()).toBe('chik'); // wraps to opening
    expect(c.virtualPos).toBe(7);
  });

  it('reset returns to opening Chik with virtualPos=0', () => {
    const c = new Chant();
    c.advance();
    c.advance();
    c.reset();
    expect(c.current).toBe('chik');
    expect(c.virtualPos).toBe(0);
  });

  it('has 7 beats with Chik twice', () => {
    expect(BEAT_ORDER.length).toBe(7);
    expect(BEAT_ORDER.filter((w) => w === 'chik').length).toBe(2);
  });
});
