import { describe, it, expect } from 'vitest';
import { Game } from '@/game/Game';
import { seededRng } from '@/game/__tests__/_helpers';
import { applySoloScenario, applyVersusScenario } from '../scenarios';

describe('applySoloScenario', () => {
  it('pins the chant beat', () => {
    const g = new Game(seededRng(1));
    g.setupSolo();
    applySoloScenario(g, { beat: 'pop' });
    expect(g.chant.current).toBe('pop');
  });

  it('replaces seat 0 hand with specified cards', () => {
    const g = new Game(seededRng(2));
    g.setupSolo();
    applySoloScenario(g, {
      hand: [
        { word: 'wally', prompt: 'right' },
        { word: 'hindo', prompt: 'left' },
      ],
    });
    const hand = g.players[0].hand;
    expect(hand.length).toBe(2);
    expect(hand.some((c) => c.word === 'wally' && c.prompt === 'right')).toBe(true);
    expect(hand.some((c) => c.word === 'hindo' && c.prompt === 'left')).toBe(true);
  });

  it('pulls Halo-Halo from anywhere when spec is isHaloHalo', () => {
    const g = new Game(seededRng(3));
    g.setupSolo();
    applySoloScenario(g, {
      hand: [{ word: 'chik', prompt: 'free', isHaloHalo: true }],
    });
    const hand = g.players[0].hand;
    expect(hand.some((c) => c.isHaloHalo)).toBe(true);
  });

  it('plants an active prompt and pins soloActive* fields', () => {
    const g = new Game(seededRng(4));
    g.setupSolo();
    applySoloScenario(g, {
      activePrompt: { side: 'right', card: { word: 'wally', prompt: 'right' } },
    });
    expect(g.soloBases.right.length).toBe(1);
    expect(g.soloActiveBaseSide).toBe('right');
    expect(g.soloActivePrompt).toBe('right');
    expect(g.soloActiveCardId).toBeTruthy();
  });

  it('sets the `opened` flag when requested', () => {
    const g = new Game(seededRng(5));
    g.setupSolo();
    applySoloScenario(g, { opened: true });
    expect(g.opened).toBe(true);
  });
});

describe('applyVersusScenario', () => {
  it('pins chant + active seat + opened', () => {
    const g = new Game(seededRng(11));
    g.setupVersus(4);
    applyVersusScenario(g, { beat: 'tambo', activeSeatIndex: 2, opened: true });
    expect(g.chant.current).toBe('tambo');
    expect(g.activeSeatIndex).toBe(2);
    expect(g.opened).toBe(true);
  });

  it('rewrites specific seats hands without touching others', () => {
    const g = new Game(seededRng(12));
    g.setupVersus(4);
    const seat2HandBefore = [...g.players[2].hand];
    applyVersusScenario(g, {
      hands: {
        0: [
          { word: 'wally', prompt: 'right' },
          { word: 'wally', prompt: 'left' },
        ],
      },
    });
    expect(g.players[0].hand.length).toBe(2);
    // Seat 2 untouched
    expect(g.players[2].hand.length).toBe(seat2HandBefore.length);
  });

  it('pushes stubs onto promptStacks and registers fetch owners', () => {
    const g = new Game(seededRng(13));
    g.setupVersus(4);
    applyVersusScenario(g, {
      promptStacks: [
        { seatIndex: 0, card: { word: 'hindo', prompt: 'fetch' }, fetchOwnerSeatIndex: 2 },
      ],
    });
    const top = g.players[0].promptStack[0];
    expect(top.prompt).toBe('fetch');
    expect(top.word).toBe('hindo');
    // Fetch owner mapping must let pendingSnapLegalTargets-style logic find seat 2.
    const fetchOwners = (g as unknown as { fetchOwners: Map<string, number> }).fetchOwners;
    expect(fetchOwners.get(top.id)).toBe(2);
  });

  it('places deckTop card at the END of the pile (pop()-able as top)', () => {
    const g = new Game(seededRng(14));
    g.setupVersus(4);
    applyVersusScenario(g, { deckTop: { word: 'wally', prompt: 'snap' } });
    const top = g.drawPile[g.drawPile.length - 1];
    expect(top.word).toBe('wally');
    expect(top.prompt).toBe('snap');
  });

  it('sets chainSourceSeatIndex when specified', () => {
    const g = new Game(seededRng(15));
    g.setupVersus(4);
    applyVersusScenario(g, { chainSourceSeatIndex: 3 });
    expect((g as unknown as { chainSourceSeatIndex: number | null }).chainSourceSeatIndex).toBe(3);
  });
});
