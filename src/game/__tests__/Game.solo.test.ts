import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../Game';
import { seededRng } from './_helpers';
import type { GameEvent } from '../types';

describe('Game (Solo)', () => {
  let g: Game;
  let events: GameEvent[];

  beforeEach(() => {
    g = new Game(seededRng(42));
    events = [];
    g.on((e) => events.push(e));
    g.setupSolo();
  });

  it('deals 7 cards and puts rest in the draw pile', () => {
    expect(g.players[0].cardCount).toBe(7);
    expect(g.drawPile.length).toBe(49);
  });

  it('starts unopened with the player as the Halo-Halo owner', () => {
    expect(g.opened).toBe(false);
    expect(g.haloHaloOwnerId).toBe('p1');
  });

  it('rejects opening with a non-Halo-Halo card and emits wrong-beat penalty', () => {
    const nonHalo = g.players[0].hand.find((c) => !c.isHaloHalo)!;
    const r = g.submitSoloAction({ type: 'slam', cardId: nonHalo.id, baseSide: 'left' });
    expect(r.type).toBe('penalty');
    if (r.type === 'penalty') expect(r.reason).toBe('wrong-beat');
    expect(g.opened).toBe(false);
  });

  it('opens with Halo-Halo Chik on either base', () => {
    // Force Halo-Halo into hand if not there.
    const halo = g.players[0].hand.find((c) => c.isHaloHalo);
    if (!halo) {
      // Drawing-driven Halo discovery is rare for the seeded deck. Use deterministic path:
      // pull Halo-Halo out of the draw pile to the player's hand.
      const idx = g.drawPile.findIndex((c) => c.isHaloHalo);
      if (idx >= 0) g.players[0].hand.push(g.drawPile.splice(idx, 1)[0]);
    }
    const halo2 = g.players[0].hand.find((c) => c.isHaloHalo)!;
    const r = g.submitSoloAction({ type: 'slam', cardId: halo2.id, baseSide: 'right' });
    expect(r.type).toBe('opened');
    expect(g.opened).toBe(true);
    expect(g.chant.current).toBe('wally');
    expect(g.soloBases.right.at(-1)?.id).toBe(halo2.id);
  });

  it('penalizes wrong-base slams (Right card on Left base)', () => {
    // Open first.
    const idx = g.drawPile.findIndex((c) => c.isHaloHalo);
    if (idx >= 0) g.players[0].hand.push(g.drawPile.splice(idx, 1)[0]);
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });
    expect(g.opened).toBe(true);
    expect(g.chant.current).toBe('wally');

    // Find a Right Wally and slam on left.
    const rightWally = g.players[0].hand.find((c) => c.prompt === 'right' && c.word === 'wally');
    if (!rightWally) {
      // Pull one in from the deck for the test.
      const di = g.drawPile.findIndex((c) => c.prompt === 'right' && c.word === 'wally');
      if (di >= 0) g.players[0].hand.push(g.drawPile.splice(di, 1)[0]);
    }
    const rw = g.players[0].hand.find((c) => c.prompt === 'right' && c.word === 'wally')!;
    const r = g.submitSoloAction({ type: 'slam', cardId: rw.id, baseSide: 'left' });
    expect(r.type).toBe('penalty');
    if (r.type === 'penalty') expect(r.reason).toBe('wrong-base');
    // Card stays in hand.
    expect(g.players[0].hand.some((c) => c.id === rw.id)).toBe(true);
  });

  it('penalizes unnecessary draws (deck click while holding a legal play)', () => {
    // Open and arrive at Wally beat.
    const idx = g.drawPile.findIndex((c) => c.isHaloHalo);
    if (idx >= 0) g.players[0].hand.push(g.drawPile.splice(idx, 1)[0]);
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });

    // Ensure player has a Wally card to make a legal play possible.
    if (!g.players[0].hand.some((c) => c.word === 'wally')) {
      const di = g.drawPile.findIndex((c) => c.word === 'wally');
      if (di >= 0) g.players[0].hand.push(g.drawPile.splice(di, 1)[0]);
    }
    const r = g.submitSoloAction({ type: 'draw' });
    expect(r.type).toBe('penalty');
    if (r.type === 'penalty') expect(r.reason).toBe('unnecessary-draw');
  });

  it('allows draws when no legal play is in hand', () => {
    // Open game.
    const idx = g.drawPile.findIndex((c) => c.isHaloHalo);
    if (idx >= 0) g.players[0].hand.push(g.drawPile.splice(idx, 1)[0]);
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });

    // Strip all Wally cards from hand (current beat is Wally).
    g.players[0].hand = g.players[0].hand.filter((c) => c.word !== 'wally');

    const before = g.players[0].cardCount;
    const r = g.submitSoloAction({ type: 'draw' });
    expect(r.type).toBe('drew');
    expect(g.players[0].cardCount).toBe(before + 1);
  });
});
