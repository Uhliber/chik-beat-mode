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

  it('deals 14 cards and puts rest in the draw pile', () => {
    expect(g.players[0].cardCount).toBe(14);
    expect(g.drawPile.length).toBe(42);
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
    const halo2 = g.players[0].hand.find((c) => c.isHaloHalo)!;
    const r = g.submitSoloAction({ type: 'slam', cardId: halo2.id, baseSide: 'right' });
    expect(r.type).toBe('opened');
    expect(g.opened).toBe(true);
    expect(g.chant.current).toBe('wally');
    expect(g.soloBases.right.at(-1)?.id).toBe(halo2.id);
    // Halo-Halo becomes the active prompt; its prompt is Free → next slam can be either base.
    expect(g.soloActiveCardId).toBe(halo2.id);
    expect(g.soloActivePrompt).toBe('free');
    expect(g.soloActiveBaseSide).toBe('right');
  });

  // The new v1.1 Solo rule: which base the next card may land on depends on the PREVIOUS
  // card's prompt, NOT on the card you're about to play.
  it('after a Left prompt is active, slamming on Right base is wrong-base', () => {
    // Open with Halo-Halo on Right. Active prompt becomes Free → next can be either.
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'right' });

    // Play a Left Wally → active prompt becomes Left.
    let leftWally = g.players[0].hand.find((c) => c.prompt === 'left' && c.word === 'wally');
    if (!leftWally) {
      const i = g.drawPile.findIndex((c) => c.prompt === 'left' && c.word === 'wally');
      if (i >= 0) g.players[0].hand.push(g.drawPile.splice(i, 1)[0]);
      leftWally = g.players[0].hand.find((c) => c.prompt === 'left' && c.word === 'wally')!;
    }
    expect(g.submitSoloAction({ type: 'slam', cardId: leftWally!.id, baseSide: 'left' }).type).toBe('success');
    expect(g.soloActivePrompt).toBe('left');
    expect(g.chant.current).toBe('hindo');

    // Now any Hindo card slammed on RIGHT base should be wrong-base.
    let hindo = g.players[0].hand.find((c) => c.word === 'hindo');
    if (!hindo) {
      const i = g.drawPile.findIndex((c) => c.word === 'hindo');
      if (i >= 0) g.players[0].hand.push(g.drawPile.splice(i, 1)[0]);
      hindo = g.players[0].hand.find((c) => c.word === 'hindo')!;
    }
    const r = g.submitSoloAction({ type: 'slam', cardId: hindo!.id, baseSide: 'right' });
    expect(r.type).toBe('penalty');
    if (r.type === 'penalty') expect(r.reason).toBe('wrong-base');
    // Card stays in hand on penalty.
    expect(g.players[0].hand.some((c) => c.id === hindo!.id)).toBe(true);
  });

  it('after a Left prompt, slamming a Right-typed Hindo on Left base is LEGAL', () => {
    // Open + plant a Left active prompt.
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });
    let leftWally = g.players[0].hand.find((c) => c.prompt === 'left' && c.word === 'wally');
    if (!leftWally) {
      const i = g.drawPile.findIndex((c) => c.prompt === 'left' && c.word === 'wally');
      if (i >= 0) g.players[0].hand.push(g.drawPile.splice(i, 1)[0]);
      leftWally = g.players[0].hand.find((c) => c.prompt === 'left' && c.word === 'wally')!;
    }
    g.submitSoloAction({ type: 'slam', cardId: leftWally!.id, baseSide: 'left' });
    expect(g.soloActivePrompt).toBe('left');

    // Pull in a RIGHT-typed Hindo and slam it on LEFT base. Card's own prompt is right -
    // but the gate is on the PREVIOUS prompt (left), so left base is required. Legal.
    let rightHindo = g.players[0].hand.find((c) => c.prompt === 'right' && c.word === 'hindo');
    if (!rightHindo) {
      const i = g.drawPile.findIndex((c) => c.prompt === 'right' && c.word === 'hindo');
      if (i >= 0) g.players[0].hand.push(g.drawPile.splice(i, 1)[0]);
      rightHindo = g.players[0].hand.find((c) => c.prompt === 'right' && c.word === 'hindo')!;
    }
    const r = g.submitSoloAction({ type: 'slam', cardId: rightHindo!.id, baseSide: 'left' });
    expect(r.type).toBe('success');
    // Active prompt now flips to right (the card we just slammed).
    expect(g.soloActivePrompt).toBe('right');
  });

  it('penalizes unnecessary draws (deck click while holding a beat-matching card)', () => {
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });

    if (!g.players[0].hand.some((c) => c.word === 'wally')) {
      const di = g.drawPile.findIndex((c) => c.word === 'wally');
      if (di >= 0) g.players[0].hand.push(g.drawPile.splice(di, 1)[0]);
    }
    const r = g.submitSoloAction({ type: 'draw' });
    expect(r.type).toBe('penalty');
    if (r.type === 'penalty') expect(r.reason).toBe('unnecessary-draw');
  });

  it('emits a soloBonus when slamming a Chant Chik on the closing chik beat', async () => {
    // Open the game with halo-halo, then fast-forward the chant to closing chik
    // (index 6). Inject a Free Chant Chik into the hand on an allowed base and
    // slam it; expect a soloBonus event of -1000ms alongside the soloSlam.
    const { Card: CardCtor } = await import('../Card');
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });
    while (g.chant.currentIndex !== 6) g.chant.advance();
    const chantChik = new CardCtor({ id: 'cc', prompt: 'free', word: 'chik', isChantChik: true, count: 5 });
    g.players[0].hand.push(chantChik);
    events.length = 0;
    // After Halo-Halo (Free prompt) any base is legal for the next slam.
    const r = g.submitSoloAction({ type: 'slam', cardId: chantChik.id, baseSide: 'left' });
    expect(r.type).toBe('success');
    const bonus = events.find((e) => e.kind === 'soloBonus');
    expect(bonus).toBeTruthy();
    if (bonus?.kind === 'soloBonus') {
      expect(bonus.reason).toBe('chant-chik-closing');
      expect(bonus.bonusMs).toBe(1000);
    }
  });

  it('does NOT emit a bonus for a non-Chant-Chik chik played on closing beat', async () => {
    const { Card: CardCtor } = await import('../Card');
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });
    while (g.chant.currentIndex !== 6) g.chant.advance();
    const plainChik = new CardCtor({ id: 'plain', prompt: 'free', word: 'chik', count: 5 });
    g.players[0].hand.push(plainChik);
    events.length = 0;
    g.submitSoloAction({ type: 'slam', cardId: plainChik.id, baseSide: 'left' });
    expect(events.find((e) => e.kind === 'soloBonus')).toBeUndefined();
  });

  it('does NOT emit a bonus for a Chant Chik played on a non-closing chik beat', async () => {
    const { Card: CardCtor } = await import('../Card');
    const halo = g.players[0].hand.find((c) => c.isHaloHalo)!;
    g.submitSoloAction({ type: 'slam', cardId: halo.id, baseSide: 'left' });
    // After halo-halo the chant is at index 1 (wally). Don't advance, play a
    // chant chik on a non-chik beat would be wrong-beat anyway, so we need to
    // land on the OPENING chik (index 0, after looping). Advance through the
    // chant once to land back on opening chik.
    while (g.chant.currentIndex !== 0) g.chant.advance();
    const chantChik = new CardCtor({ id: 'cc-open', prompt: 'free', word: 'chik', isChantChik: true, count: 5 });
    g.players[0].hand.push(chantChik);
    events.length = 0;
    g.submitSoloAction({ type: 'slam', cardId: chantChik.id, baseSide: 'left' });
    // Plays successfully (chik matches chik beat) but NO bonus, only closing chik fires it.
    expect(events.find((e) => e.kind === 'soloBonus')).toBeUndefined();
  });

  it('allows draws when no beat-matching card is in hand', () => {
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
