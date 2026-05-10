import { describe, it, expect, beforeEach } from 'vitest';
import { Chant, BEAT_ORDER } from '../Chant';

describe('Chant', () => {
  let chant: Chant;

  beforeEach(() => {
    chant = new Chant();
  });

  it('opens on chik with virtualPos 0', () => {
    expect(chant.current).toBe('chik');
    expect(chant.virtualPos).toBe(0);
    expect(chant.currentIndex).toBe(0);
  });

  it('cycles through the 7-beat loop with two chiks per cycle', () => {
    const seen: string[] = [chant.current];
    for (let i = 0; i < 6; i++) seen.push(chant.advance());
    expect(seen).toEqual(['chik', 'wally', 'hindo', 'pop', 'tambo', 'riki', 'chik']);
    // Next advance loops back to opening chik (index 0)
    chant.advance();
    expect(chant.current).toBe('chik');
    expect(chant.currentIndex).toBe(0);
    expect(chant.virtualPos).toBe(7);
  });

  it('reverseStep walks backward and clamps the wrapped index correctly', () => {
    chant.advance(); // wally (idx 1)
    chant.reverseStep(); // chik (idx 0)
    expect(chant.current).toBe('chik');
    chant.reverseStep(); // virtualPos -1 → wraps to closing chik (idx 6)
    expect(chant.currentIndex).toBe(BEAT_ORDER.length - 1);
    expect(chant.current).toBe('chik');
  });

  it('reset returns to virtualPos 0 / opening chik', () => {
    for (let i = 0; i < 10; i++) chant.advance();
    chant.reset();
    expect(chant.virtualPos).toBe(0);
    expect(chant.current).toBe('chik');
  });

  it('setting current jumps to the first matching beat index', () => {
    chant.current = 'tambo';
    expect(chant.current).toBe('tambo');
    expect(chant.currentIndex).toBe(BEAT_ORDER.indexOf('tambo'));
  });
});
