import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../Game';
import { Card } from '../Card';
import { seededRng } from './_helpers';
import type { GameEvent, ChantWord } from '../types';

/**
 * Targeted tests for the v1.2 Beat ownership + Chant Trigger mechanic.
 *
 * We exercise:
 *  - Deck shape: half of Chik cards are Chant Chik; the count distribution lines up
 *    with the rulebook appendix.
 *  - Beat selection: pick order is clockwise from the Halo-Halo holder; bad inputs
 *    are rejected; phase flips to 'play' when picks are exhausted.
 *  - Chant Trigger: opening Halo-Halo never triggers; closing Chant Chik fires; counts
 *    are summed across active prompts; landed beat is computed via total mod 7.
 *  - Chant Power: human-only validation of gift size + targets; auto-resolution.
 */

import { buildVersusDeck } from '../Deck';

describe('Deck (v1.2 Chant Chik split)', () => {
  it('produces exactly 8 Chant Chik cards (half of 16 Chik cards)', () => {
    const deck = buildVersusDeck();
    expect(deck.filter((c) => c.isChantChik).length).toBe(8);
    expect(deck.filter((c) => c.word === 'chik' && !c.isChantChik).length).toBe(8);
  });

  it('Halo-Halo is a regular Chik (NOT a Chant Chik)', () => {
    const deck = buildVersusDeck();
    const halo = deck.find((c) => c.isHaloHalo)!;
    expect(halo.isChantChik).toBe(false);
    expect(halo.count).toBe(5);
  });

  it('per-word count distribution matches the rulebook appendix', () => {
    const deck = buildVersusDeck();
    // Wally: 1+9 + 2+8 + 3 + 7 + 6 + 4 = 40
    const wallySum = deck.filter((c) => c.word === 'wally').reduce((sum, c) => sum + c.count, 0);
    expect(wallySum).toBe(40);
    // Riki: 0+10 + 1+9 + 2 + 8 + 3 + 7 = 40
    const rikiSum = deck.filter((c) => c.word === 'riki').reduce((sum, c) => sum + c.count, 0);
    expect(rikiSum).toBe(40);
    // Total deck count = 280 → average 5.
    const total = deck.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(280);
  });

  it('every Chant Chik mirrors the count distribution of regular Chik', () => {
    const deck = buildVersusDeck();
    const chantChikCounts = deck.filter((c) => c.isChantChik).map((c) => c.count).sort();
    const regularChikCounts = deck.filter((c) => c.word === 'chik' && !c.isChantChik).map((c) => c.count).sort();
    expect(chantChikCounts).toEqual(regularChikCounts);
  });
});

describe('Beat selection', () => {
  let g: Game;
  beforeEach(() => {
    g = new Game(seededRng(7));
    g.setupVersus(3);
  });

  it('starts in beat-selection phase after setupVersus', () => {
    expect(g.setupPhase).toBe('beat-selection');
  });

  it('the Halo-Halo holder picks first; picks advance clockwise', () => {
    const haloSeat = g.players.findIndex((p) => p.id === g.haloHaloOwnerId);
    expect(g.currentBeatPicker()).toBe(g.players[haloSeat].id);
    g.claimBeat(g.players[haloSeat].id, 'chik');
    // Next picker = (haloSeat + 1) mod n
    const nextSeat = (haloSeat + 1) % 3;
    expect(g.currentBeatPicker()).toBe(g.players[nextSeat].id);
  });

  it('rejects out-of-turn beat picks', () => {
    const haloSeat = g.players.findIndex((p) => p.id === g.haloHaloOwnerId);
    const wrongSeat = (haloSeat + 1) % 3;
    const r = g.claimBeat(g.players[wrongSeat].id, 'chik');
    expect(r.type).toBe('rejected');
    if (r.type === 'rejected') expect(r.reason).toBe('not-your-beat-pick');
  });

  it('rejects double-claiming a beat', () => {
    const haloSeat = g.players.findIndex((p) => p.id === g.haloHaloOwnerId);
    g.claimBeat(g.players[haloSeat].id, 'wally');
    const nextSeat = (haloSeat + 1) % 3;
    const r = g.claimBeat(g.players[nextSeat].id, 'wally');
    expect(r.type).toBe('rejected');
    if (r.type === 'rejected') expect(r.reason).toBe('beat-already-claimed');
  });

  it('3-player setup: each player picks twice; phase flips after 6 picks', () => {
    const beats: ChantWord[] = ['chik', 'wally', 'hindo', 'pop', 'tambo', 'riki'];
    const haloSeat = g.players.findIndex((p) => p.id === g.haloHaloOwnerId);
    // Sequence: haloSeat, haloSeat+1, haloSeat+2, haloSeat (round 2), ...
    for (let i = 0; i < 6; i++) {
      const picker = g.currentBeatPicker();
      expect(picker).not.toBeNull();
      g.claimBeat(picker!, beats[i]);
    }
    expect(g.setupPhase).toBe('play');
    expect(g.currentBeatPicker()).toBeNull();
    // The Halo-Halo holder owns 2 beats in 3p mode.
    const haloPlayerBeats = g.beatsOwnedBySeat().get(haloSeat) ?? [];
    expect(haloPlayerBeats.length).toBe(2);
  });

  it('4-player setup: each player picks once; 2 beats remain unclaimed', () => {
    const g4 = new Game(seededRng(7));
    g4.setupVersus(4);
    const beats: ChantWord[] = ['chik', 'wally', 'hindo', 'pop'];
    for (let i = 0; i < 4; i++) {
      const picker = g4.currentBeatPicker();
      g4.claimBeat(picker!, beats[i]);
    }
    expect(g4.setupPhase).toBe('play');
    const owners = g4.beatOwners;
    expect(owners.get('tambo')).toBe(-1);
    expect(owners.get('riki')).toBe(-1);
  });

  it('autoCompleteBeatSelection() fast-paths through to play phase', () => {
    g.autoCompleteBeatSelection();
    expect(g.setupPhase).toBe('play');
    expect(g.currentBeatPicker()).toBeNull();
  });
});

describe('Chant Trigger, opening Halo-Halo never triggers', () => {
  it('opening Halo-Halo (even if Chant Chik variant existed) does not fire the trigger', () => {
    const g = new Game(seededRng(7));
    g.setupVersus(4);
    g.autoCompleteBeatSelection();
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    const target = (g.activeSeatIndex + 1) % g.players.length;
    const events: GameEvent[] = [];
    g.on((e) => events.push(e));
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: target });
    expect(events.some((e) => e.kind === 'versusChantTriggered')).toBe(false);
  });
});

describe('Chant Trigger, closing Chant Chik fires', () => {
  it('a closing Chant Chik played on beat index 6 fires the trigger', () => {
    const g = new Game(seededRng(7));
    g.setupVersus(4);
    g.autoCompleteBeatSelection();
    // Open the game so subsequent plays advance the chant.
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: (g.activeSeatIndex + 1) % 4 });

    // Force the chant to land on the closing position (index 6) and play a Chant Chik
    // on the active seat. We bypass the rulebook play path by directly invoking chant
    // advance + manually placing the Chant Chik via executeVersusPlay-equivalent logic.
    while (g.chant.currentIndex !== 6) g.chant.advance();
    expect(g.chant.currentIndex).toBe(6);

    const sourceSeat = g.activeSeatIndex;
    const targetSeat = (sourceSeat + 1) % 4;
    // Inject a Chant Chik into the source's hand (some prompt that allows targeting
    // sourceSeat → targetSeat). Use a Free Chant Chik (count 5) so any target is legal.
    const chantChik = new Card({
      id: 'test-chant-chik',
      prompt: 'free',
      word: 'chik',
      isChantChik: true,
      count: 5,
    });
    g.players[sourceSeat].hand.push(chantChik);

    const events: GameEvent[] = [];
    g.on((e) => events.push(e));
    const result = g.submitVersusAction(g.players[sourceSeat].id, {
      type: 'play',
      cardId: chantChik.id,
      targetSeatIndex: targetSeat,
    });
    expect(result.type).toBe('played');
    const trigger = events.find((e) => e.kind === 'versusChantTriggered');
    expect(trigger).toBeTruthy();
    if (trigger?.kind === 'versusChantTriggered') {
      // The Chant Chik itself contributes its count to the sum.
      expect(trigger.total).toBeGreaterThanOrEqual(5);
      expect(trigger.receiverSeatIndex).toBe(targetSeat);
    }
  });
});

describe('Chant Trigger, landed beat math', () => {
  // Regression: the engine used `BEAT_ORDER[total % 7]` for the landed beat, but
  // BEAT_ORDER[0] is OPENING chik (rulebook treats mod=0 as CLOSING chik). Result
  // was off-by-one, e.g. total=23 visually landed on wally (the 23rd count) but
  // awarded power to the hindo owner. These tests pin the rulebook mapping.
  //
  // Rulebook table (sum mod 7 → landed):
  //   0 → closing Chik (chik owner wins)
  //   1 → opening Chik (NO winner)
  //   2 → Wally,  3 → Hindo,  4 → Pop,  5 → Tambo,  6 → Riki

  /** Force a chant trigger with a precomputed total. Uses a 6-player game so every
   *  one of the 6 beats is claimed (no "unclaimed beat → no winner" edge case
   *  muddying the test). Beats are deterministically assigned via beatOwners so
   *  we know exactly who owns what regardless of the random pick order. */
  function runTriggerWithTotal(target: number): { landed: string; winnerSeat: number | null } {
    const g = new Game(seededRng(7));
    g.setupVersus(6);
    g.autoCompleteBeatSelection();
    // Override beat ownership deterministically: seat i owns beat i (in CHANT_ORDER).
    const beats: ChantWord[] = ['chik', 'wally', 'hindo', 'pop', 'tambo', 'riki'];
    for (let i = 0; i < beats.length; i++) g.beatOwners.set(beats[i], i);
    // Open the game so subsequent plays advance the chant.
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: (g.activeSeatIndex + 1) % 6 });
    while (g.chant.currentIndex !== 6) g.chant.advance();

    // Wipe everyone's prompt and install fake counts so the trigger sum is exact.
    // Chant chik itself contributes its count (5) to the sum, so we subtract that
    // from the target and spread the remainder onto seat 5.
    for (const p of g.players) p.promptStack.length = 0;
    const chantChikCount = 5;
    const remaining = target - chantChikCount;
    const fakeCard = (count: number): Card => new Card({ id: `fk-${Math.random()}`, prompt: 'left', word: 'wally', count });
    if (remaining > 0) g.players[5].promptStack.push(fakeCard(remaining));

    g.activeSeatIndex = 0;
    const chantChik = new Card({ id: 'cc', prompt: 'free', word: 'chik', isChantChik: true, count: chantChikCount });
    g.players[0].hand.push(chantChik);
    const events: GameEvent[] = [];
    g.on((e) => events.push(e));
    g.submitVersusAction(g.players[0].id, { type: 'play', cardId: chantChik.id, targetSeatIndex: 1 });
    const trigger = events.find((e) => e.kind === 'versusChantTriggered');
    if (trigger?.kind !== 'versusChantTriggered') throw new Error('no trigger fired');
    return { landed: String(trigger.landedBeat), winnerSeat: trigger.winnerSeatIndex };
  }

  it('total=7 lands on closing Chik (chik owner wins)', () => {
    const { landed } = runTriggerWithTotal(7);
    expect(landed).toBe('chik');
  });
  it('total=8 (mod 7 = 1) lands on OPENING Chik, no winner', () => {
    const { landed, winnerSeat } = runTriggerWithTotal(8);
    expect(landed).toBe('no-winner-opening');
    expect(winnerSeat).toBeNull();
  });
  it('total=9 lands on Wally', () => {
    const { landed } = runTriggerWithTotal(9);
    expect(landed).toBe('wally');
  });
  it('total=23 (mod 7 = 2) lands on Wally, was hindo under the off-by-one bug', () => {
    const { landed } = runTriggerWithTotal(23);
    expect(landed).toBe('wally');
  });
  it('total=18 (mod 7 = 4) lands on Pop, matches the rulebook example', () => {
    const { landed } = runTriggerWithTotal(18);
    expect(landed).toBe('pop');
  });
});

describe('Chant Power, give-cards validation', () => {
  let g: Game;
  beforeEach(() => {
    g = new Game(seededRng(7));
    g.setupVersus(3);
    g.autoCompleteBeatSelection();
  });

  it('rejects gifts totaling more than 3 cards', () => {
    // Force a pending chant power by direct assignment (we already proved the engine
    // emits it correctly above; here we just want to validate the action handler).
    g.pendingChantPower = { winnerSeatIndex: 0, receiverSeatIndex: 1, chantChikId: 'x' };
    const cardIds = g.players[0].hand.slice(0, 4).map((c) => c.id);
    const r = g.submitVersusAction(g.players[0].id, {
      type: 'chant-power-resolve',
      gifts: [{ recipientSeatIndex: 1, cardIds }],
    });
    expect(r.type).toBe('rejected');
    if (r.type === 'rejected') expect(r.reason).toBe('invalid-gift-count');
  });

  it('rejects gifts targeting the winner themselves', () => {
    g.pendingChantPower = { winnerSeatIndex: 0, receiverSeatIndex: 1, chantChikId: 'x' };
    const cardIds = [g.players[0].hand[0].id];
    const r = g.submitVersusAction(g.players[0].id, {
      type: 'chant-power-resolve',
      gifts: [{ recipientSeatIndex: 0, cardIds }],
    });
    expect(r.type).toBe('rejected');
    if (r.type === 'rejected') expect(r.reason).toBe('invalid-gift-target');
  });

  it('declares the winner when give-away empties their hand', () => {
    // Strip winner's hand down to 1 card, then give it away.
    const winner = g.players[0];
    const keep = winner.hand[0];
    winner.hand = [keep];
    g.pendingChantPower = { winnerSeatIndex: 0, receiverSeatIndex: 1, chantChikId: 'x' };
    const r = g.submitVersusAction(winner.id, {
      type: 'chant-power-resolve',
      gifts: [{ recipientSeatIndex: 1, cardIds: [keep.id] }],
    });
    expect(r.type).toBe('winner');
    if (r.type === 'winner') expect(r.playerId).toBe(winner.id);
  });

  it('resumes play with the receiver after a non-winning resolve', () => {
    g.pendingChantPower = { winnerSeatIndex: 0, receiverSeatIndex: 1, chantChikId: 'x' };
    const r = g.submitVersusAction(g.players[0].id, {
      type: 'chant-power-resolve',
      gifts: [],
    });
    expect(r.type).toBe('played');
    expect(g.activeSeatIndex).toBe(1);
    expect(g.pendingChantPower).toBeNull();
  });
});
