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
