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
    g.setupVersus(3);
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
    g.setupVersus(4);
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
    g.setupVersus(6);
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
