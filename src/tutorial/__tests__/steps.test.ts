import { describe, it, expect } from 'vitest';
import { Game } from '@/game/Game';
import { seededRng } from '@/game/__tests__/_helpers';
import { SOLO_STEPS, VERSUS_STEPS, matchExpect, canonicalActionFor } from '../steps';
import type { GameEvent } from '@/game/types';

/**
 * Drive each step through to its canonical resolution and assert the matcher accepts
 * the resulting event. Demos are run inline (they're scripted plays the engine
 * accepts). Tests catch mis-authored steps (wrong matcher, missing setup, etc.) before
 * a single line of UI work.
 */

function setupGameForMode(mode: 'solo' | 'versus'): Game {
  const g = new Game(seededRng(101));
  if (mode === 'solo') g.setupSolo();
  else g.setupVersus(4);
  return g;
}

async function runStepAndExpectMatch(step: import('../steps').TutorialStep, mode: 'solo' | 'versus'): Promise<{ ok: boolean; event?: GameEvent; reason?: string }> {
  const g = setupGameForMode(mode);
  // Subscribe to events to capture the one that should satisfy the matcher.
  const captured: GameEvent[] = [];
  g.on((e) => captured.push(e));

  if (step.setup) step.setup(g);
  if (step.demo) await step.demo(g);

  if (!step.expect) return { ok: true };

  const canonical = canonicalActionFor(step, g, mode);
  if (!canonical) {
    return { ok: false, reason: 'canonicalActionFor returned null' };
  }

  const before = captured.length;
  if (canonical.mode === 'solo') {
    g.submitSoloAction(canonical.action as import('@/game/types').SoloAction);
  } else {
    // For snapPlay matchers we need an upstream draw event to put the engine into
    // pendingSnapDraw state. Drive that first via a plain draw, then submit snap-play.
    if (step.expect.kind === 'snapPlay') {
      g.submitVersusAction(canonical.playerId, { type: 'draw' });
      // The engine should now have pendingSnapDraw set; submit snap-play to chase it.
      const action = canonical.action as Extract<import('@/game/types').VersusAction, { type: 'snap-play' }>;
      g.submitVersusAction(canonical.playerId, action);
    } else {
      g.submitVersusAction(canonical.playerId, canonical.action as import('@/game/types').VersusAction);
    }
  }

  // Did any of the new events match?
  const newEvents = captured.slice(before);
  const match = newEvents.find((e) => matchExpect(step.expect, e, g));
  if (match) return { ok: true, event: match };
  return {
    ok: false,
    reason: `no event matched. New events: ${newEvents.map((e) => e.kind).join(', ') || '(none)'}`,
  };
}

describe('SOLO_STEPS — each step\'s canonical action satisfies its matcher', () => {
  for (const step of SOLO_STEPS) {
    it(`${step.id}`, async () => {
      const result = await runStepAndExpectMatch(step, 'solo');
      if (!result.ok) throw new Error(`${step.id}: ${result.reason}`);
      expect(result.ok).toBe(true);
    });
  }
});

describe('VERSUS_STEPS — each step\'s canonical action satisfies its matcher', () => {
  for (const step of VERSUS_STEPS) {
    it(`${step.id}`, async () => {
      const result = await runStepAndExpectMatch(step, 'versus');
      if (!result.ok) throw new Error(`${step.id}: ${result.reason}`);
      expect(result.ok).toBe(true);
    });
  }
});

describe('Full tutorial walk-through — each step\'s state is independent of prior steps', () => {
  it('Versus: all 10 steps advance cleanly in sequence with canonical actions', { timeout: 30000 }, async () => {
    const g = setupGameForMode('versus');
    for (let i = 0; i < VERSUS_STEPS.length; i++) {
      const step = VERSUS_STEPS[i];
      if (step.setup) step.setup(g);
      if (step.demo) await step.demo(g);
      if (!step.expect) continue; // narrative step, no player action needed
      const canonical = canonicalActionFor(step, g, 'versus');
      if (!canonical) {
        throw new Error(`step ${i} (${step.id}): canonicalActionFor returned null after setup. Likely a stale prompt or wrong beat.`);
      }
      let result;
      if (step.expect.kind === 'snapPlay') {
        // Snap path: draw to surface the snap, then commit the snap-play.
        g.submitVersusAction(canonical.playerId, { type: 'draw' });
        result = g.submitVersusAction(canonical.playerId, canonical.action as import('@/game/types').VersusAction);
      } else {
        result = g.submitVersusAction(canonical.playerId, canonical.action as import('@/game/types').VersusAction);
      }
      if (result.type === 'rejected') {
        throw new Error(`step ${i} (${step.id}): submitVersusAction rejected with reason "${result.reason}"`);
      }
    }
    // No exception thrown → all steps walked through cleanly.
    expect(VERSUS_STEPS.length).toBe(11);
  });

  it('Solo: all 5 steps advance cleanly in sequence with canonical actions', async () => {
    const g = setupGameForMode('solo');
    for (let i = 0; i < SOLO_STEPS.length; i++) {
      const step = SOLO_STEPS[i];
      if (step.setup) step.setup(g);
      if (step.demo) await step.demo(g);
      if (!step.expect) continue;
      const canonical = canonicalActionFor(step, g, 'solo');
      if (!canonical) {
        throw new Error(`step ${i} (${step.id}): canonicalActionFor returned null after setup.`);
      }
      const result = g.submitSoloAction(canonical.action as import('@/game/types').SoloAction);
      if (result.type === 'penalty') {
        throw new Error(`step ${i} (${step.id}): submitSoloAction returned penalty "${result.reason}"`);
      }
    }
    expect(SOLO_STEPS.length).toBe(5);
  });
});

describe('matchExpect — discriminator coverage', () => {
  it('rejects non-matching event kinds', () => {
    const g = setupGameForMode('versus');
    const fakePlay: GameEvent = {
      kind: 'versusPlay',
      playerId: 'p1',
      cardId: 'nope',
      targetSeatIndex: 1,
      cardWord: 'chik',
      cardPrompt: 'free',
    };
    expect(matchExpect({ kind: 'draw' }, fakePlay, g)).toBe(false);
    expect(matchExpect({ kind: 'slamBase' }, fakePlay, g)).toBe(false);
    expect(matchExpect({ kind: 'snapPlay' }, fakePlay, g)).toBe(false);
  });

  it('event-predicate matcher delegates entirely to the caller', () => {
    const g = setupGameForMode('versus');
    const e: GameEvent = { kind: 'setup', mode: 'versus', playerCount: 4 };
    expect(matchExpect({ kind: 'event', predicate: () => true }, e, g)).toBe(true);
    expect(matchExpect({ kind: 'event', predicate: () => false }, e, g)).toBe(false);
  });
});
