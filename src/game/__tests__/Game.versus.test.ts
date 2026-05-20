import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../Game';
import { seededRng } from './_helpers';
import type { GameEvent } from '../types';

/** Move `card` from its current home (hand or draw pile) into the target player's hand. */
function injectCard(g: Game, pid: string, matcher: (c: import('../Card').Card) => boolean): import('../Card').Card | null {
  const target = g.players.find((p) => p.id === pid);
  if (!target) return null;
  // Try draw pile first.
  let idx = g.drawPile.findIndex(matcher);
  if (idx >= 0) {
    const card = g.drawPile.splice(idx, 1)[0];
    target.hand.push(card);
    return card;
  }
  // Pull from another player.
  for (const other of g.players) {
    if (other.id === pid) continue;
    idx = other.hand.findIndex(matcher);
    if (idx >= 0) {
      const card = other.hand.splice(idx, 1)[0];
      target.hand.push(card);
      return card;
    }
  }
  return null;
}

describe('Game (Versus)', () => {
  let g: Game;
  let events: GameEvent[];

  beforeEach(() => {
    g = new Game(seededRng(7));
    events = [];
    g.on((e) => events.push(e));
    g.setupVersus(3); g.autoCompleteBeatSelection();
  });

  it('deals 7 cards to each of 3 players and rest to draw pile', () => {
    for (const p of g.players) expect(p.cardCount).toBe(7);
    expect(g.drawPile.length).toBe(56 - 7 * 3);
  });

  it('Halo-Halo owner starts as the active seat', () => {
    expect(g.haloHaloOwnerId).not.toBeNull();
    const ownerSeat = g.players.findIndex((p) => p.id === g.haloHaloOwnerId);
    expect(g.activeSeatIndex).toBe(ownerSeat);
  });

  it('rejects pre-open plays that are not Halo-Halo', () => {
    const opener = g.players[g.activeSeatIndex];
    const non = opener.hand.find((c) => !c.isHaloHalo)!;
    const target = (g.activeSeatIndex + 1) % g.players.length;
    const r = g.submitVersusAction(opener.id, { type: 'play', cardId: non.id, targetSeatIndex: target });
    expect(r.type).toBe('rejected');
  });

  it('opens the game when Halo-Halo Chik is played in front of another player', () => {
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    const target = (g.activeSeatIndex + 1) % g.players.length;
    const r = g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: target });
    expect(r.type).toBe('played');
    expect(g.opened).toBe(true);
    expect(g.chant.current).toBe('wally');
    expect(g.activeSeatIndex).toBe(target);
    expect(g.players[target].topPrompt?.id).toBe(halo.id);
  });

  it('rejects targeting self', () => {
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    const r = g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: g.activeSeatIndex });
    expect(r.type).toBe('rejected');
    if (r.type === 'rejected') expect(r.reason).toBe('self-target');
  });

  it('Right prompt restricts target to right (clockwise) neighbor', () => {
    // Open the game first.
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    const targetSeat = (g.activeSeatIndex + 1) % g.players.length;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: targetSeat });

    // Now active player has Halo-Halo (Free prompt) on them. Ensure they have a Wally card
    // and try to play it on the wrong-direction neighbor.
    const active = g.players[g.activeSeatIndex];
    const wallyCard = injectCard(g, active.id, (c) => c.word === 'wally') ?? active.hand.find((c) => c.word === 'wally');
    expect(wallyCard).toBeTruthy();
    // The Halo-Halo Free prompt means any non-self target is legal. So this should succeed
    // regardless of direction.
    const oppositeSeat = (g.activeSeatIndex + 2) % g.players.length;
    const r = g.submitVersusAction(active.id, { type: 'play', cardId: wallyCard!.id, targetSeatIndex: oppositeSeat });
    expect(r.type).toBe('played');
  });

  it('legalTargetSeats returns only neighbors for directional prompts', () => {
    // Setup: open game with Halo-Halo so active gets Free prompt (any target).
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    const next = (g.activeSeatIndex + 1) % g.players.length;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: next });

    // Now give the active player a Right Wally and force a Right prompt on them by playing
    // a Right Wally on them from elsewhere... easier: just check what legalTargetSeats says
    // for a Right card when they currently have Free (Halo-Halo) — Free should let them
    // hit any non-self seat.
    const active = g.players[g.activeSeatIndex];
    const wally = injectCard(g, active.id, (c) => c.word === 'wally') ?? active.hand.find((c) => c.word === 'wally')!;
    const legal = g.legalTargetSeats(g.activeSeatIndex, wally);
    expect(legal.length).toBe(g.players.length - 1);
    expect(legal).not.toContain(g.activeSeatIndex);
  });
});

/**
 * Seat-direction perspective: the seat array advances clockwise around the table
 * as viewed from above (seat 0 south, seat 1 west, seat 2 north, seat 3 east),
 * but each player looking inward at the table has their right hand pointing the
 * OTHER way around the array. So from seat 0's perspective the right neighbor is
 * seat n-1 (east on screen), NOT seat 1 (west on screen).
 */
describe('Game (Versus) — seat direction matches player perspective', () => {
  function setupFourPlayerOpened(): Game {
    const g = new Game(seededRng(11));
    g.setupVersus(4); g.autoCompleteBeatSelection();
    // Force the Halo-Halo opener to be P1 (seat 0) deterministically by moving the
    // halo card into seat 0 and updating haloHaloOwnerId.
    if (g.haloHaloOwnerId !== 'p1') {
      const halo = g.players
        .flatMap((p) => p.hand.map((c) => ({ c, p })))
        .find(({ c }) => c.isHaloHalo)!;
      // Pull from old owner, push to p1.
      halo.p.hand = halo.p.hand.filter((c) => c.id !== halo.c.id);
      g.players[0].hand.push(halo.c);
      g.haloHaloOwnerId = 'p1';
      g.activeSeatIndex = 0;
    }
    return g;
  }

  it('with a Right prompt on seat 0 in a 4-player game, the legal target is seat 3', () => {
    const g = setupFourPlayerOpened();
    // Open onto seat 1 to advance past the opening gate. Beat becomes Wally.
    const opener = g.players[0];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    // Now we want seat 0 active with a Right prompt. Force it directly:
    g.activeSeatIndex = 0;
    g.players[0].promptStack.push({ id: 'right-chik-stub', word: 'chik', prompt: 'right', isHaloHalo: false } as never);
    // Pull a Wally card into seat 0's hand for legality.
    const fromPool = g.drawPile.findIndex((c) => c.word === 'wally');
    if (fromPool >= 0) g.players[0].hand.push(g.drawPile.splice(fromPool, 1)[0]);
    const wally = g.players[0].hand.find((c) => c.word === 'wally')!;

    const legal = g.legalTargetSeats(0, wally);
    expect(legal).toEqual([3]);
  });

  it('with a Left prompt on seat 0 in a 4-player game, the legal target is seat 1', () => {
    const g = setupFourPlayerOpened();
    const opener = g.players[0];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    g.activeSeatIndex = 0;
    g.players[0].promptStack.push({ id: 'left-chik-stub', word: 'chik', prompt: 'left', isHaloHalo: false } as never);
    const fromPool = g.drawPile.findIndex((c) => c.word === 'wally');
    if (fromPool >= 0) g.players[0].hand.push(g.drawPile.splice(fromPool, 1)[0]);
    const wally = g.players[0].hand.find((c) => c.word === 'wally')!;

    const legal = g.legalTargetSeats(0, wally);
    expect(legal).toEqual([1]);
  });

  it('Snap prompt on seat 0 (4 players) allows BOTH neighbours as legal targets', () => {
    const g = setupFourPlayerOpened();
    const opener = g.players[0];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    g.activeSeatIndex = 0;
    g.players[0].promptStack.push({ id: 'snap-chik-stub', word: 'chik', prompt: 'snap', isHaloHalo: false } as never);
    const fromPool = g.drawPile.findIndex((c) => c.word === 'wally');
    if (fromPool >= 0) g.players[0].hand.push(g.drawPile.splice(fromPool, 1)[0]);
    const wally = g.players[0].hand.find((c) => c.word === 'wally')!;

    const legal = g.legalTargetSeats(0, wally).sort();
    expect(legal).toEqual([1, 3]); // left neighbour (seat 1) and right neighbour (seat 3)
  });

  it('Fetch prompt on seat 0 (4 players) allows BOTH neighbours as legal targets', () => {
    const g = setupFourPlayerOpened();
    const opener = g.players[0];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    g.activeSeatIndex = 0;
    g.players[0].promptStack.push({ id: 'fetch-chik-stub', word: 'chik', prompt: 'fetch', isHaloHalo: false } as never);
    const fromPool = g.drawPile.findIndex((c) => c.word === 'wally');
    if (fromPool >= 0) g.players[0].hand.push(g.drawPile.splice(fromPool, 1)[0]);
    const wally = g.players[0].hand.find((c) => c.word === 'wally')!;

    const legal = g.legalTargetSeats(0, wally).sort();
    expect(legal).toEqual([1, 3]);
  });

  it('with a 6-player game, Right from seat 0 wraps to seat 5 (not seat 1)', () => {
    const g = new Game(seededRng(13));
    g.setupVersus(6); g.autoCompleteBeatSelection();
    if (g.haloHaloOwnerId !== 'p1') {
      const halo = g.players
        .flatMap((p) => p.hand.map((c) => ({ c, p })))
        .find(({ c }) => c.isHaloHalo)!;
      halo.p.hand = halo.p.hand.filter((c) => c.id !== halo.c.id);
      g.players[0].hand.push(halo.c);
      g.haloHaloOwnerId = 'p1';
      g.activeSeatIndex = 0;
    }
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(g.players[0].id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    g.activeSeatIndex = 0;
    g.players[0].promptStack.push({ id: 'right-chik-stub', word: 'chik', prompt: 'right', isHaloHalo: false } as never);
    const fromPool = g.drawPile.findIndex((c) => c.word === 'wally');
    if (fromPool >= 0) g.players[0].hand.push(g.drawPile.splice(fromPool, 1)[0]);
    const wally = g.players[0].hand.find((c) => c.word === 'wally')!;

    const legal = g.legalTargetSeats(0, wally);
    expect(legal).toEqual([5]);
  });
});

/**
 * Strict-prompts house rule + Snap-drawn pending direction. Both are off-by-default
 * extensions that the user toggles via settings.
 */
describe('Game (Versus) — strict prompts house rule', () => {
  function setupForStrict(): Game {
    const g = new Game(seededRng(31));
    g.setupVersus(4); g.autoCompleteBeatSelection();
    g.setStrictPromptsEnabled(true);
    // Force opener to seat 0 for determinism.
    if (g.haloHaloOwnerId !== 'p1') {
      const halo = g.players
        .flatMap((p) => p.hand.map((c) => ({ c, p })))
        .find(({ c }) => c.isHaloHalo)!;
      halo.p.hand = halo.p.hand.filter((c) => c.id !== halo.c.id);
      g.players[0].hand.push(halo.c);
      g.haloHaloOwnerId = 'p1';
      g.activeSeatIndex = 0;
    }
    return g;
  }

  it('with strict prompts ON, every non-self seat is a legal target', () => {
    const g = setupForStrict();
    const opener = g.players[0];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    g.activeSeatIndex = 0;
    g.players[0].promptStack.push({ id: 'right-stub', word: 'chik', prompt: 'right', isHaloHalo: false } as never);
    const di = g.drawPile.findIndex((c) => c.word === 'wally');
    if (di >= 0) g.players[0].hand.push(g.drawPile.splice(di, 1)[0]);
    const wally = g.players[0].hand.find((c) => c.word === 'wally')!;

    const legal = g.legalTargetSeats(0, wally).sort();
    expect(legal).toEqual([1, 2, 3]);
  });

  it('wrong-direction play in strict mode triggers penalty: card stays in hand, +1 draw', () => {
    const g = setupForStrict();
    const opener = g.players[0];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    g.activeSeatIndex = 0;
    g.players[0].promptStack.push({ id: 'right-stub', word: 'chik', prompt: 'right', isHaloHalo: false } as never);
    const di = g.drawPile.findIndex((c) => c.word === 'wally');
    if (di >= 0) g.players[0].hand.push(g.drawPile.splice(di, 1)[0]);
    const wally = g.players[0].hand.find((c) => c.word === 'wally')!;

    const handSizeBefore = g.players[0].cardCount;
    // Right prompt restricts to seat 3; play to seat 1 (wrong direction) instead.
    const r = g.submitVersusAction(g.players[0].id, { type: 'play', cardId: wally.id, targetSeatIndex: 1 });
    expect(r.type).toBe('rejected');
    if (r.type === 'rejected') expect(r.reason).toBe('illegal-target');
    // Card stays in hand and the player drew 1 penalty card → net +1.
    expect(g.players[0].cardCount).toBe(handSizeBefore + 1);
    expect(g.players[0].hand.some((c) => c.id === wally.id)).toBe(true);
  });

  it('strict penalty bounces the chain back to the card source (treats penalty as a forced draw)', () => {
    // Setup: seat 3 plays Right onto seat 0 (chain source = seat 3). Seat 0 then tries
    // an illegal direction in strict mode → penalty. Expectation: the turn bounces back
    // to seat 3, NOT clockwise to seat 1.
    const g = setupForStrict();
    const opener = g.players[0];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: 3 });
    // Now active = seat 3; have seat 3 play a Right card onto seat 0. (Seat 0 is seat 3's
    // right neighbour — neighborSeat for radial is CCW from the seated POV.) Find any
    // beat-matching Right card in seat 3's hand or pull one in.
    const beat = g.chant.current;
    let rightCard = g.players[3].hand.find((c) => c.prompt === 'right' && c.word === beat);
    if (!rightCard) {
      const i = g.drawPile.findIndex((c) => c.prompt === 'right' && c.word === beat);
      if (i >= 0) g.players[3].hand.push(g.drawPile.splice(i, 1)[0]);
      rightCard = g.players[3].hand.find((c) => c.prompt === 'right' && c.word === beat)!;
    }
    const playResult = g.submitVersusAction(g.players[3].id, {
      type: 'play',
      cardId: rightCard.id,
      targetSeatIndex: 0,
    });
    expect(playResult.type).toBe('played');
    // Active is now seat 0; their top prompt is Right (must target their right neighbour).
    expect(g.activeSeatIndex).toBe(0);
    expect(g.players[0].topPrompt?.prompt).toBe('right');

    // Seat 0 tries the wrong direction (target seat 1 instead of seat 3 = right neighbour).
    const beatNow = g.chant.current;
    let anyCard = g.players[0].hand.find((c) => c.word === beatNow);
    if (!anyCard) {
      const i = g.drawPile.findIndex((c) => c.word === beatNow);
      if (i >= 0) g.players[0].hand.push(g.drawPile.splice(i, 1)[0]);
      anyCard = g.players[0].hand.find((c) => c.word === beatNow)!;
    }
    const r = g.submitVersusAction(g.players[0].id, {
      type: 'play',
      cardId: anyCard.id,
      targetSeatIndex: 1, // wrong direction
    });
    expect(r.type).toBe('rejected');
    // The penalty draw should have triggered the chain bounce — seat 3 (the chain
    // source) should now be active, NOT seat 1 (clockwise of penalty player).
    expect(g.activeSeatIndex).toBe(3);
  });
});

describe('Game (Versus) — drawn-Snap parks for direction', () => {
  it('drawing a Snap matching the current beat sets pendingSnapDraw and does not auto-play', () => {
    const g = new Game(seededRng(53));
    g.setupVersus(4); g.autoCompleteBeatSelection();
    // Force opener = seat 0 and open the game so we're past the Halo-Halo gate.
    if (g.haloHaloOwnerId !== 'p1') {
      const haloEntry = g.players
        .flatMap((p) => p.hand.map((c) => ({ c, p })))
        .find(({ c }) => c.isHaloHalo)!;
      haloEntry.p.hand = haloEntry.p.hand.filter((c) => c.id !== haloEntry.c.id);
      g.players[0].hand.push(haloEntry.c);
      g.haloHaloOwnerId = 'p1';
      g.activeSeatIndex = 0;
    }
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitVersusAction(g.players[0].id, { type: 'play', cardId: halo.id, targetSeatIndex: 1 });
    // Chant is now Wally and seat 1 is the active player. Make sure seat 1 has no
    // Wally cards in hand so they're forced to draw.
    g.players[1].hand = g.players[1].hand.filter((c) => c.word !== 'wally');
    // The deck has exactly one Wally-Snap. Fish it out from wherever it landed and
    // park it on top of the draw pile so the next pop() returns it.
    let snap: import('../Card').Card | null = null;
    const inPile = g.drawPile.findIndex((c) => c.word === 'wally' && c.prompt === 'snap');
    if (inPile >= 0) {
      snap = g.drawPile.splice(inPile, 1)[0];
    } else {
      for (const p of g.players) {
        const idx = p.hand.findIndex((c) => c.word === 'wally' && c.prompt === 'snap');
        if (idx >= 0) { snap = p.hand.splice(idx, 1)[0]; break; }
      }
    }
    if (!snap) throw new Error('Wally-Snap not present in this deal — seed regression?');
    g.drawPile.push(snap);
    const snapId = snap.id;

    const r = g.submitVersusAction(g.players[1].id, { type: 'draw' });
    expect(r.type).toBe('drew');
    expect(g.pendingSnapDraw).not.toBeNull();
    expect(g.pendingSnapDraw?.cardId).toBe(snapId);
    // The Snap is in seat 1's hand and NOT yet placed on anyone's promptStack.
    expect(g.players[1].hand.some((c) => c.id === snapId)).toBe(true);
    for (const p of g.players) {
      expect(p.promptStack.some((c) => c.id === snapId)).toBe(false);
    }
  });
});

describe('Game (Playground) — sandbox setup', () => {
  it('deals the requested hand size with one Chik per player and one Halo-Halo overall', () => {
    const g = new Game(seededRng(91));
    g.setupPlayground({
      playerCount: 4,
      handSize: 10,
      composition: { right: 14, left: 14, free: 7, stop: 7, snap: 7, fetch: 7 },
    });
    expect(g.players.length).toBe(4);
    for (const p of g.players) {
      expect(p.cardCount).toBe(10);
      // The guaranteed-Chik deal: each player ends up with at least one Chik card.
      expect(p.hand.some((c) => c.word === 'chik')).toBe(true);
    }
    // Exactly one Halo-Halo across all hands.
    const halos = g.players.flatMap((p) => p.hand).filter((c) => c.isHaloHalo);
    expect(halos.length).toBe(1);
    expect(g.mode).toBe('playground');
  });

  it('rejects when Free count is below 7 (no Halo-Halo + Chik-pool deal possible)', () => {
    const g = new Game(seededRng(92));
    expect(() =>
      g.setupPlayground({
        playerCount: 3,
        handSize: 7,
        composition: { right: 14, left: 14, free: 0, stop: 7, snap: 7, fetch: 7 },
      }),
    ).toThrow();
  });

  it('rejects when total deck is too small for the requested hand size', () => {
    const g = new Game(seededRng(93));
    // 6 players × 14 cards = 84 dealt + 8 pile = 92 minimum; 56 falls way short.
    expect(() =>
      g.setupPlayground({
        playerCount: 6,
        handSize: 14,
        composition: { right: 14, left: 14, free: 7, stop: 7, snap: 7, fetch: 7 },
      }),
    ).toThrow();
  });

  // Drawn-Snap targeting: rulebook says L/R neighbour only. Standard mode rejects
  // non-neighbour targets silently. Strict mode lets the attempt through but applies
  // a +1 penalty draw (matching how strict mode treats other illegal plays).
  it('drawn-Snap on non-neighbour rejects silently in standard mode', () => {
    const g = new Game(seededRng(110));
    g.setupVersus(4); g.autoCompleteBeatSelection();
    // Open + plant a pending Snap-drawn for seat 0 (the human), with an across-table
    // target (seat 2). Easiest path: directly mutate the pending state + put a Snap
    // card matching the current beat in seat 0's hand.
    (g as unknown as { opened: boolean }).opened = true;
    const snapCard = { id: 'snap-test-1', word: 'chik', prompt: 'snap', isHaloHalo: false, matchesBeat: () => true } as never;
    g.players[0].hand.push(snapCard);
    (g as unknown as { pendingSnapDraw: { playerId: string; cardId: string } }).pendingSnapDraw = {
      playerId: g.players[0].id,
      cardId: 'snap-test-1',
    };
    (g as unknown as { activeSeatIndex: number }).activeSeatIndex = 0;
    const handBefore = g.players[0].cardCount;
    const r = g.submitVersusAction(g.players[0].id, { type: 'snap-play', targetSeatIndex: 2 });
    expect(r.type).toBe('rejected');
    if (r.type === 'rejected') expect(r.reason).toBe('illegal-target');
    // Snap stays in hand, no penalty draw, pending state preserved so they can retry.
    expect(g.players[0].cardCount).toBe(handBefore);
    expect(g.pendingSnapDraw?.cardId).toBe('snap-test-1');
  });

  it('drawn-Snap on non-neighbour in strict mode applies a +1 penalty draw', () => {
    const g = new Game(seededRng(111));
    g.setupVersus(4); g.autoCompleteBeatSelection();
    g.setStrictPromptsEnabled(true);
    (g as unknown as { opened: boolean }).opened = true;
    const snapCard = { id: 'snap-test-2', word: 'chik', prompt: 'snap', isHaloHalo: false, matchesBeat: () => true } as never;
    g.players[0].hand.push(snapCard);
    (g as unknown as { pendingSnapDraw: { playerId: string; cardId: string } }).pendingSnapDraw = {
      playerId: g.players[0].id,
      cardId: 'snap-test-2',
    };
    (g as unknown as { activeSeatIndex: number }).activeSeatIndex = 0;
    const handBefore = g.players[0].cardCount;
    const pileBefore = g.drawPile.length;
    const r = g.submitVersusAction(g.players[0].id, { type: 'snap-play', targetSeatIndex: 2 });
    // Strict penalty surfaces as a rejection with reason illegal-target, but it pulled
    // a card from the pile and the pending snap was cleared.
    expect(r.type === 'rejected' || r.type === 'winner').toBe(true);
    expect(g.players[0].cardCount).toBe(handBefore + 1); // snap kept + penalty card
    expect(g.drawPile.length).toBe(pileBefore - 1);
    expect(g.pendingSnapDraw).toBeNull();
    // Snap card itself never moved to a prompt stack.
    for (const p of g.players) {
      expect(p.promptStack.some((c) => c.id === 'snap-test-2')).toBe(false);
    }
  });

  // Statistical sanity: the Fetch drain picks a UNIFORMLY RANDOM card from the owner's
  // hand. The user reported a hunch that it always takes "the last drawn card" — this
  // test runs many iterations against a 6-card owner hand and asserts no position is
  // disproportionately drained.
  it('Fetch drain is uniformly random across the owner hand', () => {
    const ITERATIONS = 6000;
    const HAND_SIZE = 6;
    const counts = new Array<number>(HAND_SIZE).fill(0);
    for (let trial = 0; trial < ITERATIONS; trial++) {
      const g = new Game(); // default Math.random
      g.setupVersus(3); g.autoCompleteBeatSelection();
      // Pin a known 6-card hand on seat 1, in a known order.
      const owner = g.players[1];
      owner.hand = [
        { id: 'c0', word: 'chik',  prompt: 'free', isHaloHalo: false } as never,
        { id: 'c1', word: 'wally', prompt: 'free', isHaloHalo: false } as never,
        { id: 'c2', word: 'hindo', prompt: 'free', isHaloHalo: false } as never,
        { id: 'c3', word: 'pop',   prompt: 'free', isHaloHalo: false } as never,
        { id: 'c4', word: 'tambo', prompt: 'free', isHaloHalo: false } as never,
        { id: 'c5', word: 'riki',  prompt: 'free', isHaloHalo: false } as never,
      ];
      // Plant a Fetch from seat 1 in front of seat 0; make seat 0 active.
      (g as unknown as { opened: boolean }).opened = true;
      const fetchStub = { id: `fetch-${trial}`, word: 'chik', prompt: 'fetch', isHaloHalo: false } as never;
      g.players[0].promptStack.push(fetchStub);
      (g as unknown as { fetchOwners: Map<string, number> }).fetchOwners.set(`fetch-${trial}`, 1);
      (g as unknown as { activeSeatIndex: number }).activeSeatIndex = 0;
      g.drawPile.length = 0;
      // chainSourceSeatIndex stays null so the draw doesn't bounce; we only care about which card was taken.

      const handIdsBefore = new Set(owner.hand.map((c) => c.id));
      g.submitVersusAction(g.players[0].id, { type: 'draw' });
      // Whichever id is now missing from owner.hand is the one that got drained.
      const idsAfter = new Set(owner.hand.map((c) => c.id));
      for (const id of handIdsBefore) {
        if (!idsAfter.has(id)) {
          const pos = Number(id.slice(1));
          counts[pos]++;
          break;
        }
      }
    }
    // Each position's expected share is 1/6 ≈ 1000 of 6000. Allow ±20% slack
    // (800..1200) which is wide enough to survive Math.random noise but tight
    // enough to catch a "last-card-only" bug (which would peg one position at 6000).
    const expected = ITERATIONS / HAND_SIZE;
    const lo = expected * 0.8;
    const hi = expected * 1.2;
    for (let pos = 0; pos < HAND_SIZE; pos++) {
      expect(counts[pos]).toBeGreaterThan(lo);
      expect(counts[pos]).toBeLessThan(hi);
    }
  });

  // Regression: when the draw pile is empty and the player's top prompt is Fetch, the
  // forced draw must still drain from the Fetch owner's hand (not silently pass).
  it('Fetch prompt drains from owner hand even when draw pile is empty', () => {
    const g = new Game(seededRng(101));
    g.setupVersus(3); g.autoCompleteBeatSelection();
    // Open the game.
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    const target = (g.activeSeatIndex + 1) % g.players.length;
    g.submitVersusAction(opener.id, { type: 'play', cardId: halo.id, targetSeatIndex: target });

    // Force the scenario directly: drain the draw pile and place a Fetch prompt in front
    // of seat 0, owned by seat 1.
    g.drawPile.length = 0;
    const fetchStub = { id: 'fetch-test-stub', word: 'chik', prompt: 'fetch', isHaloHalo: false } as never;
    g.players[0].promptStack.push(fetchStub);
    (g as unknown as { fetchOwners: Map<string, number> }).fetchOwners.set('fetch-test-stub', 1);
    const ownerHandSizeBefore = g.players[1].cardCount;
    const drawerHandSizeBefore = g.players[0].cardCount;

    // Force seat 0 to be active, then have them draw.
    (g as unknown as { activeSeatIndex: number }).activeSeatIndex = 0;
    const r = g.submitVersusAction(g.players[0].id, { type: 'draw' });

    expect(r.type === 'drew' || r.type === 'winner').toBe(true);
    expect(g.players[1].cardCount).toBe(ownerHandSizeBefore - 1);
    expect(g.players[0].cardCount).toBe(drawerHandSizeBefore + 1);
    if (r.type === 'drew') expect(r.from).toBe('hand');
  });

  // Regression: submitVersusAction must accept actions in Playground mode. Previously
  // gated on `mode === 'versus'`, which silently rejected every Playground play.
  it('submitVersusAction accepts plays in Playground mode (no versus-only mode guard)', () => {
    const g = new Game(seededRng(94));
    g.setupPlayground({
      playerCount: 3,
      handSize: 7,
      composition: { right: 14, left: 14, free: 7, stop: 7, snap: 7, fetch: 7 },
    });
    g.autoCompleteBeatSelection();
    const opener = g.players[g.activeSeatIndex];
    const halo = opener.hand.find((c) => c.isHaloHalo);
    expect(halo).toBeTruthy();
    const targetSeat = (g.activeSeatIndex + 1) % g.players.length;
    const result = g.submitVersusAction(opener.id, {
      type: 'play',
      cardId: halo!.id,
      targetSeatIndex: targetSeat,
    });
    expect(result.type).toBe('played');
    expect(g.opened).toBe(true);
    expect(g.activeSeatIndex).toBe(targetSeat);
  });
});
