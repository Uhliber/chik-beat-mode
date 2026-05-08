import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../Game';
import { Card } from '../Card';
import { CHANT_ORDER, type GameEvent, type ChantWord } from '../types';
import { seededRng } from './_helpers';

function newGame(seed = 1): Game {
  return new Game(seededRng(seed));
}

function collectEvents(g: Game): GameEvent[] {
  const events: GameEvent[] = [];
  g.on((e) => events.push(e));
  return events;
}

describe('Game.setup', () => {
  it('rejects player counts outside 1..6', () => {
    const g = newGame();
    expect(() => g.setup(0)).toThrow();
    expect(() => g.setup(7)).toThrow();
  });

  it('creates the requested number of players and seat indices', () => {
    const g = newGame();
    g.setup(4);
    expect(g.players).toHaveLength(4);
    expect(g.players.map((p) => p.seatIndex)).toEqual([0, 1, 2, 3]);
    expect(g.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('claims word bases for the first N players (N = playerCount)', () => {
    const g = newGame();
    g.setup(3);
    const owned = g.players.map((p) => p.ownedBaseWord).filter(Boolean);
    expect(owned).toHaveLength(3);
    for (const word of owned) {
      expect(CHANT_ORDER).toContain(word);
    }
    const main = g.getBase('main');
    expect(main.ownerId).toBeNull();
  });

  it('deals all 56 cards across players', () => {
    const g = newGame();
    g.setup(4);
    const total = g.players.reduce((sum, p) => sum + p.cardCount, 0);
    expect(total).toBe(56);
  });

  it('finds the halo-halo owner among the players', () => {
    const g = newGame();
    g.setup(4);
    expect(g.haloHaloOwnerId).not.toBeNull();
    const owner = g.players.find((p) => p.id === g.haloHaloOwnerId)!;
    expect(owner.hand.some((c) => c.isHaloHalo)).toBe(true);
  });

  it('drops decoys in solo mode and skips base claims', () => {
    const g = newGame();
    g.mode = 'solo';
    g.setup(1);
    const total = g.players.reduce((sum, p) => sum + p.cardCount, 0);
    expect(total).toBe(56 - 7); // 7 decoys removed (2 chik + 5 others)
    expect(g.players[0].ownedBaseWord).toBeNull();
    for (const word of CHANT_ORDER) {
      expect(g.getBase(word).ownerId).toBeNull();
    }
  });
});

describe('Game.openGame', () => {
  it('moves the halo-halo to its target base, marks opened, and advances chant', () => {
    const g = newGame(2);
    g.setup(3);
    const events = collectEvents(g);
    const ownerId = g.haloHaloOwnerId!;
    g.openGame();

    expect(g.opened).toBe(true);
    const opened = events.find((e) => e.kind === 'gameOpened');
    expect(opened).toMatchObject({ kind: 'gameOpened', openerId: ownerId });
    expect(g.chant.current).toBe('wally');
  });
});

describe('Game.resolveSlams — single player success path', () => {
  it('clean slam removes card, advances chant, and emits success', () => {
    const g = newGame(3);
    g.setup(2);
    g.openGame();

    // Find a player holding a wally card to slam (chant is now on 'wally').
    const beat: ChantWord = 'wally';
    expect(g.chant.current).toBe(beat);
    const player = g.players.find((p) => p.hand.some((c) => c.matchesBeat(beat) && c.kind === 'standard'))!;
    const card = player.hand.find((c) => c.matchesBeat(beat) && c.kind === 'standard')!;
    const target = g.resolveTargetBase(beat);

    const before = player.cardCount;
    const results = g.resolveSlams([
      { playerId: player.id, cardId: card.id, targetBase: target, shoutedWord: beat },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: 'success', playerId: player.id });
    expect(player.cardCount).toBe(before - 1);
    expect(g.chant.current).toBe('hindo');
  });

  it('reverse card triggers a reverse step instead of an advance', () => {
    const g = newGame(4);
    g.setup(2);
    g.openGame(); // chant: chik → wally

    const player = g.players[0];
    const reverseWally = new Card({ id: 'rw-test', kind: 'reverse', word: 'wally' });
    // Wipe their hand so we control the card; preserve player object.
    // Add a filler so cardCount > 0 after the slam — otherwise applySuccess returns
    // early with a winner declaration and the chant doesn't step.
    player.hand.length = 0;
    player.addCard(reverseWally);
    player.addCard(new Card({ id: 'filler', kind: 'standard', word: 'riki' }));

    // Force chant to 'wally' (it should already be after openGame, but be explicit).
    g.chant.current = 'wally';
    // Disable beat-gate so any seat can slam.
    g.activeBeatPlayerId = null;

    const target = g.resolveTargetBase('wally');
    const beforePos = g.chant.virtualPos;
    const results = g.resolveSlams([
      { playerId: player.id, cardId: reverseWally.id, targetBase: target, shoutedWord: 'wally' },
    ]);

    expect(results[0]).toMatchObject({ type: 'success', reverseTriggered: true });
    expect(g.chant.virtualPos).toBe(beforePos - 1);
  });
});

describe('Game.resolveSlams — miscalls and ties', () => {
  it('wrong-word slam is a miscall, chant does not advance', () => {
    const g = newGame(5);
    g.setup(2);
    g.openGame();
    const beatBefore = g.chant.current;

    // Find a player holding a card whose word does NOT match the current beat.
    const player = g.players.find((p) => p.hand.some((c) => !c.matchesBeat(beatBefore)))!;
    const card = player.hand.find((c) => !c.matchesBeat(beatBefore))!;

    const results = g.resolveSlams([
      { playerId: player.id, cardId: card.id, targetBase: 'main', shoutedWord: beatBefore },
    ]);
    expect(results[0].type).toBe('miscall');
    expect(g.chant.current).toBe(beatBefore);
  });

  it('two valid slams produce a tie and apply tie penalties', () => {
    const g = newGame(6);
    g.setup(2);
    g.openGame();
    const beat = g.chant.current;

    // Force both players to hold a matching standard card and have something on a base
    // to provide penalty material.
    g.players[0].hand.length = 0;
    g.players[1].hand.length = 0;
    const c0 = new Card({ id: 't-a', kind: 'standard', word: beat });
    const c1 = new Card({ id: 't-b', kind: 'standard', word: beat });
    g.players[0].addCard(c0);
    g.players[1].addCard(c1);
    // Seed a base pile (the halo from openGame may already be there; this guarantees it).
    g.getBase('main').pile.push(new Card({ id: 'fodder', kind: 'standard', word: 'chik' }));

    const events = collectEvents(g);
    const target = g.resolveTargetBase(beat);
    const results = g.resolveSlams([
      { playerId: 'p1', cardId: c0.id, targetBase: target, shoutedWord: beat },
      { playerId: 'p2', cardId: c1.id, targetBase: target, shoutedWord: beat },
    ]);
    expect(results.every((r) => r.type === 'tie')).toBe(true);
    expect(events.some((e) => e.kind === 'tie')).toBe(true);
  });
});

describe('Game.resolveSlams — solo mode', () => {
  it('wrong-word slam emits soloPenalty and keeps the card in hand', () => {
    const g = newGame(7);
    g.mode = 'solo';
    g.setup(1);
    g.openGame();

    const beat = g.chant.current;
    const player = g.players[0];
    const wrong = player.hand.find((c) => !c.matchesBeat(beat))!;

    const events = collectEvents(g);
    const before = player.cardCount;
    g.resolveSlams([
      { playerId: player.id, cardId: wrong.id, targetBase: 'main', shoutedWord: beat },
    ]);
    expect(player.cardCount).toBe(before);
    expect(events.some((e) => e.kind === 'soloPenalty')).toBe(true);
  });

  it('matching slam in solo mode lands on main and advances chant', () => {
    const g = newGame(8);
    g.mode = 'solo';
    g.setup(1);
    g.openGame();
    const beat = g.chant.current;
    const player = g.players[0];
    const match = player.hand.find((c) => c.matchesBeat(beat) && c.kind === 'standard');
    if (!match) return; // randomly possible the seeded hand has no standard for this beat — skip

    const before = player.cardCount;
    const results = g.resolveSlams([
      { playerId: player.id, cardId: match.id, targetBase: 'main', shoutedWord: beat },
    ]);
    expect(results[0].type).toBe('success');
    expect(player.cardCount).toBe(before - 1);
  });
});

describe('Game — solo auto-finish when stuck', () => {
  it('auto-finishes the run when the only remaining cards do not match the beat', () => {
    const g = newGame(20);
    g.mode = 'solo';
    g.setup(1);
    g.opened = true; // skip opening flow
    const player = g.players[0];

    // Force chant to 'pop' and load a hand of only 'tambo' cards — no match possible.
    g.chant.current = 'pop';
    player.hand.length = 0;
    player.addCard(new Card({ id: 't-1', kind: 'standard', word: 'tambo' }));
    player.addCard(new Card({ id: 't-2', kind: 'standard', word: 'tambo' }));

    const events = collectEvents(g);
    // Wrong-word slam triggers the stuck check at the end of resolveSlams.
    g.resolveSlams([
      { playerId: player.id, cardId: 't-1', targetBase: 'main', shoutedWord: 'pop' },
    ]);

    expect(events.some((e) => e.kind === 'soloAutoFinish')).toBe(true);
    expect(events.some((e) => e.kind === 'winner')).toBe(true);
    expect(player.cardCount).toBe(0);
  });
});

describe('Game — halo-halo opening via the slam resolver (Play mode)', () => {
  it('a halo-halo slam through resolveSlams marks the game opened and emits gameOpened', () => {
    const g = newGame(21);
    g.setup(2);
    // Play-mode-style: gate slams to the halo holder and skip openGame() so the resolver runs.
    const opener = g.players.find((p) => p.id === g.haloHaloOwnerId)!;
    g.activeBeatPlayerId = opener.id;
    const halo = opener.hand.find((c) => c.isHaloHalo)!;
    const target = g.bases.get('chik')?.ownerId ? 'chik' : 'main';

    const events = collectEvents(g);
    g.resolveSlams([
      { playerId: opener.id, cardId: halo.id, targetBase: target, shoutedWord: 'chik' },
    ]);

    expect(g.opened).toBe(true);
    expect(events.some((e) => e.kind === 'gameOpened' && e.openerId === opener.id)).toBe(true);
  });
});

describe('Game.computePenaltyOrder', () => {
  it('orders penalized players by base distance forward from currentBeat+1', () => {
    const g = newGame(9);
    g.setup(3);
    // Force known ownership for deterministic ordering.
    g.players[0].ownedBaseWord = 'wally';
    g.players[1].ownedBaseWord = 'pop';
    g.players[2].ownedBaseWord = 'riki';

    // currentBeat = 'chik' → start search at 'wally'
    const order = g.computePenaltyOrder('chik', ['p3', 'p1', 'p2']);
    expect(order).toEqual(['p1', 'p2', 'p3']);
  });
});
