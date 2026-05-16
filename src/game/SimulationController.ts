import type { Game } from './Game';
import type { Card } from './Card';
import type { CardPrompt, PlayerId, VersusAction } from './types';

export type SimStatus = 'idle' | 'opening' | 'running' | 'paused' | 'ended';
export type SimMode = 'solo' | 'versus';

export interface SimOptions {
  speed: number;       // 0.25 .. 4 — multiplier on AI think delays
  baseDelayMs: number; // base AI think delay (Versus)
  jitter: number;      // 0..1 — fraction of randomized variation around the delay
}

const DEFAULT_OPTS: SimOptions = {
  speed: 1,
  baseDelayMs: 1100,
  jitter: 0.35,
};

/**
 * Versus-only orchestrator: schedules AI turns, calls submitVersusAction on the Game,
 * waits, repeats. Solo mode bypasses this entirely (player drives every action).
 *
 * The controller is unaware of the chain rule and prompt resolution — it just polls
 * `game.activeSeatIndex` each tick. If the active seat is a human, it parks. If it's
 * AI, it picks a legal action and calls submitVersusAction.
 */
export class SimulationController {
  private game: Game;
  private opts: SimOptions = { ...DEFAULT_OPTS };
  private timer: number | null = null;
  private rng: () => number;
  private status: SimStatus = 'idle';
  private statusListeners: ((s: SimStatus) => void)[] = [];
  private mode: SimMode = 'versus';

  constructor(game: Game, rng: () => number = Math.random) {
    this.game = game;
    this.rng = rng;
  }

  setOptions(opts: Partial<SimOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  setMode(mode: SimMode): void {
    this.mode = mode;
  }

  getStatus(): SimStatus {
    return this.status;
  }

  onStatusChange(fn: (s: SimStatus) => void): () => void {
    this.statusListeners.push(fn);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== fn);
    };
  }

  start(): void {
    if (this.status === 'ended') return;
    this.setStatus('running');
    if (this.mode === 'versus') this.scheduleNext(this.delay() * 0.6);
  }

  pause(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.status !== 'ended') this.setStatus('paused');
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.setStatus('running');
    if (this.mode === 'versus') this.scheduleNext();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setStatus('ended');
  }

  setPlayerHuman(playerId: PlayerId, isHuman: boolean): void {
    const p = this.game.players.find((pl) => pl.id === playerId);
    if (p) p.isAI = !isHuman;
  }

  /** Solo: the view layer calls submitSoloAction directly on the game; this is a pass-through. */
  /** Versus: submit a human play immediately. If the action progresses to an AI turn, the
   *  next tick will fire after the regular delay. */
  submitVersusHumanAction(playerId: PlayerId, action: VersusAction): void {
    this.game.submitVersusAction(playerId, action);
    if (this.game.winnerId) { this.setStatus('ended'); return; }
    // After a human action, the active seat may now be AI — schedule a tick to handle it.
    this.scheduleNext();
  }

  private setStatus(s: SimStatus): void {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  private delay(): number {
    const base = this.opts.baseDelayMs / Math.max(0.1, this.opts.speed);
    const j = (this.rng() * 2 - 1) * this.opts.jitter;
    return Math.max(180, base * (1 + j));
  }

  private scheduleNext(ms?: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.status !== 'running') return;
    if (this.mode !== 'versus') return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.tick();
    }, ms ?? this.delay());
  }

  private tick(): void {
    if (this.status !== 'running' || this.game.winnerId) return;

    const seat = this.game.activeSeatIndex;
    if (seat < 0 || seat >= this.game.players.length) return;
    const player = this.game.players[seat];

    // Human seat — just park. Their action via submitVersusHumanAction will re-kick.
    if (!player.isAI) return;

    // AI decision: try to play; otherwise draw.
    const action = this.chooseAIAction(player.id, seat);
    this.game.submitVersusAction(player.id, action);

    if (this.game.winnerId) { this.setStatus('ended'); return; }
    this.scheduleNext();
  }

  /**
   * AI policy (simple v1):
   *  - Pre-open: if you hold the Halo-Halo Chik, play it on a random opponent.
   *  - Post-open: scan hand for a card matching current beat AND with a legal target. Among
   *    legal options, prefer non-special cards first (save Stop/Snap/Fetch for tactical use).
   *    If none playable, draw.
   */
  private chooseAIAction(playerId: PlayerId, seat: number): VersusAction {
    const player = this.game.players.find((p) => p.id === playerId)!;

    // Pre-open: only Halo-Halo is legal.
    if (!this.game.opened) {
      const halo = player.hand.find((c) => c.isHaloHalo);
      if (!halo) return { type: 'draw' };
      const targets: number[] = [];
      for (let i = 0; i < this.game.players.length; i++) if (i !== seat) targets.push(i);
      const target = targets[Math.floor(this.rng() * targets.length)];
      return { type: 'play', cardId: halo.id, targetSeatIndex: target };
    }

    // Post-open: rank candidate plays.
    type Candidate = { card: Card; target: number; tier: number };
    const candidates: Candidate[] = [];
    const beat = this.game.getRequiredBeat();
    for (const card of player.hand) {
      if (!card.matchesBeat(beat)) continue;
      const legalTargets = this.game.legalTargetSeats(seat, card);
      if (legalTargets.length === 0) continue;
      // Tier: lower = preferred. Non-special cards first.
      const tier = (['right', 'left', 'free'] as CardPrompt[]).includes(card.prompt) ? 0 : 1;
      // Pick the target with the fewest cards if special; otherwise random.
      let target: number;
      if (tier === 1) {
        target = legalTargets.reduce((best, t) => {
          return this.game.players[t].cardCount < this.game.players[best].cardCount ? t : best;
        }, legalTargets[0]);
      } else {
        target = legalTargets[Math.floor(this.rng() * legalTargets.length)];
      }
      candidates.push({ card, target, tier });
    }

    if (candidates.length === 0) return { type: 'draw' };

    candidates.sort((a, b) => a.tier - b.tier);
    const top = candidates[0];
    return { type: 'play', cardId: top.card.id, targetSeatIndex: top.target };
  }
}
