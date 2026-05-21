import type { ChantWord } from './types';

/**
 * The chant has SEVEN beats per loop, with Chik appearing twice (opening + closing):
 *
 *   CHIK → WALLY → HINDO → POP → TAMBO → RIKI → CHIK → (loop back to opening CHIK)
 *
 * That's why two Chiks can legally be played in a row at the loop boundary.
 *
 * We track BOTH:
 *   - `currentIndex`: the wrapped position (0..6) within the 7-beat loop, used by game logic.
 *   - `virtualPos`: a monotonic counter (increments on advance) that never wraps. The view
 *     layer uses this to render a smoothly-sliding chant ticker.
 *
 * v1.0 removed the Reverse card and with it the reverse-chant mechanic, the chant only
 * ever moves forward now.
 */
export const BEAT_ORDER: readonly ChantWord[] = [
  'chik',  // 0, opening
  'wally', // 1
  'hindo', // 2
  'pop',   // 3
  'tambo', // 4
  'riki',  // 5
  'chik',  // 6, closing (loops back to 0)
] as const;

export class Chant {
  private _virtualPos = 0;

  get current(): ChantWord {
    return BEAT_ORDER[this.currentIndex];
  }

  get currentIndex(): number {
    return ((this._virtualPos % BEAT_ORDER.length) + BEAT_ORDER.length) % BEAT_ORDER.length;
  }

  get virtualPos(): number {
    return this._virtualPos;
  }

  /** Reset to the opening Chik beat, virtualPos = 0. */
  reset(): void {
    this._virtualPos = 0;
  }

  set current(word: ChantWord) {
    const idx = BEAT_ORDER.indexOf(word);
    this._virtualPos = idx >= 0 ? idx : 0;
  }

  advance(): ChantWord {
    this._virtualPos++;
    return this.current;
  }
}
