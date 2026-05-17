import { describe, it, expect } from 'vitest';
import { MODE_CAPS, modeCaps } from '../modes';
import type { GameMode } from '../types';

describe('modeCaps', () => {
  it('returns the same object as the MODE_CAPS table', () => {
    expect(modeCaps('solo')).toBe(MODE_CAPS.solo);
    expect(modeCaps('versus')).toBe(MODE_CAPS.versus);
    expect(modeCaps('playground')).toBe(MODE_CAPS.playground);
  });

  // Soft contract: code branches on these flags throughout the codebase. If a future
  // mode redefines what 'solo' means, this test forces an explicit update.
  it('solo is the only mode that is not turn-based and not multi-seat', () => {
    expect(MODE_CAPS.solo.isTurnBased).toBe(false);
    expect(MODE_CAPS.solo.isSingleSeat).toBe(true);
    expect(MODE_CAPS.solo.hasAIOpponents).toBe(false);
    expect(MODE_CAPS.solo.isTimeAttack).toBe(true);
    expect(MODE_CAPS.solo.usesSoloBases).toBe(true);
    expect(MODE_CAPS.solo.usesPromptStacks).toBe(false);
  });

  it('versus and playground share the turn-based capability set', () => {
    const v = MODE_CAPS.versus;
    const p = MODE_CAPS.playground;
    for (const key of ['isTurnBased', 'hasAIOpponents', 'isSingleSeat', 'isTimeAttack', 'usesSoloBases', 'usesPromptStacks'] as const) {
      expect(p[key]).toBe(v[key]);
    }
  });

  it('only playground has the custom-deck capability', () => {
    expect(MODE_CAPS.solo.hasCustomDeck).toBe(false);
    expect(MODE_CAPS.versus.hasCustomDeck).toBe(false);
    expect(MODE_CAPS.playground.hasCustomDeck).toBe(true);
  });

  it('every GameMode has a row in MODE_CAPS', () => {
    const modes: GameMode[] = ['solo', 'versus', 'playground'];
    for (const m of modes) {
      expect(MODE_CAPS[m]).toBeDefined();
    }
  });
});
