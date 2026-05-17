import type { Game } from './Game';
import type { Card } from './Card';
import type { CardPrompt, GameMode, PlayerId, VersusAction } from './types';
import { modeCaps } from './modes';

export type SimStatus = 'idle' | 'opening' | 'running' | 'paused' | 'ended';
/** SimMode is just GameMode — the controller dispatches based on capability flags
 *  (hasAIOpponents), not on identity, so any turn-based mode is supported automatically. */
export type SimMode = GameMode;

/**
 * AI skill rungs (Versus). Each level is a (mistakeRate, strategyDepth) pair.
 *  - mistakeRate is the probability that an AI player attempts an ILLEGAL play
 *    (wrong direction / wrong beat) on their turn. Only meaningful when strict
 *    prompts is enabled — otherwise illegal plays are hard-rejected by the engine.
 *  - strategyDepth controls how much thought goes into target/card selection,
 *    irrespective of strict mode.
 */
export type AiSkillLevel = 1 | 2 | 3 | 4;

/** Mistake rate per skill level (only meaningful with strict prompts on). */
const MISTAKE_RATE: Record<AiSkillLevel, number> = {
  1: 0.30,
  2: 0.15,
  3: 0.05,
  4: 0.01,
};

/** Probability that a low-skill AI draws even when they have a legal play. */
const VOLUNTARY_DRAW_RATE: Record<AiSkillLevel, number> = {
  1: 0.10,
  2: 0.03,
  3: 0,
  4: 0,
};

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
  /** AI skill level. 3 (Hard) is the default — feels competent without being unfair. */
  private aiSkill: AiSkillLevel = 3;
  /** Timer for the deliberate delay before an AI commits a pending snap, so the UI
   *  can show the snap card popping up + the chosen target highlighting. */
  private pendingSnapResolveTimer: number | null = null;
  /** When an AI has picked its snap target but not yet committed, the UI reads this
   *  to highlight the chosen chip during the resolve delay. -1 / null otherwise. */
  pendingSnapPickedTarget: number | null = null;

  /**
   * Pick which seat an AI player should snap-play onto. Strict mode allows any non-self
   * target — use skill to pick strategically (leader = fewest cards). Standard mode is
   * left-or-right; high skill picks the neighbour with the fewest cards.
   */
  private chooseSnapTarget(seatIdx: number): number {
    const legal = this.game.pendingSnapLegalTargets();
    if (legal.length === 0) return seatIdx; // fallback (shouldn't happen)
    if (this.aiSkill >= 3) {
      // Pick the seat with the fewest cards in hand.
      return legal.reduce((best, t) => {
        return this.game.players[t].cardCount < this.game.players[best].cardCount ? t : best;
      }, legal[0]);
    }
    return legal[Math.floor(this.rng() * legal.length)];
  }

  constructor(game: Game, rng: () => number = Math.random) {
    this.game = game;
    this.rng = rng;
  }

  setOptions(opts: Partial<SimOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  setAiSkill(level: AiSkillLevel): void {
    this.aiSkill = level;
  }

  getAiSkill(): AiSkillLevel {
    return this.aiSkill;
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
    if (modeCaps(this.mode).hasAIOpponents) this.scheduleNext(this.delay() * 0.6);
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
    if (modeCaps(this.mode).hasAIOpponents) this.scheduleNext();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingSnapResolveTimer !== null) {
      clearTimeout(this.pendingSnapResolveTimer);
      this.pendingSnapResolveTimer = null;
      this.pendingSnapPickedTarget = null;
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
    if (!modeCaps(this.mode).hasAIOpponents) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.tick();
    }, ms ?? this.delay());
  }

  private tick(): void {
    if (this.status !== 'running' || this.game.winnerId) return;

    // Pending snap-draw: surface the SnapDrawnOverlay (visible to the human regardless
    // of who's drawing) and resolve. Humans submit via the UI; AI picks strategically
    // after a deliberate delay so the player can SEE the AI's snap before it lands.
    const pending = this.game.pendingSnapDraw;
    if (pending) {
      const holder = this.game.players.find((p) => p.id === pending.playerId);
      if (holder && holder.isAI) {
        if (this.pendingSnapResolveTimer !== null) return; // already scheduled
        const seat = this.game.players.findIndex((p) => p.id === holder.id);
        const targetSeatIndex = this.chooseSnapTarget(seat);
        this.pendingSnapPickedTarget = targetSeatIndex;
        this.pendingSnapResolveTimer = window.setTimeout(() => {
          this.pendingSnapResolveTimer = null;
          this.pendingSnapPickedTarget = null;
          this.game.submitVersusAction(holder.id, { type: 'snap-play', targetSeatIndex });
          if (this.game.winnerId) { this.setStatus('ended'); return; }
          this.scheduleNext();
        }, 900);
        return;
      }
      // Human's pending — park and wait for the UI to submit.
      return;
    }

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
   * AI policy. Skill-tiered (1 = Easy, 4 = Master). Two paths:
   *  - Mistake path (only meaningful with strict prompts on): the AI intentionally
   *    attempts an illegal play, which the engine converts to a +1 penalty draw.
   *    Mistake probability is `MISTAKE_RATE[skill]`.
   *  - Strategic path: rank candidate (card, target) pairs by tier and skill-dependent
   *    target scoring. Low-skill = random; high-skill = prefer non-specials, target
   *    leader with specials, hold Snap unless near win.
   */
  private chooseAIAction(playerId: PlayerId, seat: number): VersusAction {
    const player = this.game.players.find((p) => p.id === playerId)!;

    // Pre-open: only Halo-Halo is legal. (Mistake path can't trigger here — wrong
    // moves pre-open are silently rejected by the engine regardless of strict mode.)
    if (!this.game.opened) {
      const halo = player.hand.find((c) => c.isHaloHalo);
      if (!halo) return { type: 'draw' };
      const targets: number[] = [];
      for (let i = 0; i < this.game.players.length; i++) if (i !== seat) targets.push(i);
      const target = targets[Math.floor(this.rng() * targets.length)];
      return { type: 'play', cardId: halo.id, targetSeatIndex: target };
    }

    const skill = this.aiSkill;

    // Mistake roll. Only meaningful with strict prompts on — otherwise the engine
    // hard-rejects illegal plays and the AI's turn would be wasted to no effect.
    if (this.game.strictPromptsEnabled && this.rng() < MISTAKE_RATE[skill]) {
      const mistake = this.chooseMistakeAction(player, seat);
      if (mistake) return mistake;
      // Fall through to strategic if no illegal play exists (rare).
    }

    return this.chooseStrategicAction(player, seat, skill);
  }

  /**
   * Pick an intentionally illegal play: any card paired with a target that violates
   * either the beat or the prompt direction. Returns null only if every (card, target)
   * combination is rulebook-legal (very rare — e.g. Free prompt + multiple beat-matching
   * cards in hand).
   */
  private chooseMistakeAction(player: import('./Player').Player, seat: number): VersusAction | null {
    const beat = this.game.getRequiredBeat();
    const illegal: { cardId: string; target: number }[] = [];
    for (const card of player.hand) {
      const beatOk = card.matchesBeat(beat);
      // Strict-rulebook-legal target set for this card (ignore strict-mode widening).
      const legalSet = beatOk ? new Set(this.game.legalTargetSeats(seat, card, true)) : new Set<number>();
      for (let t = 0; t < this.game.players.length; t++) {
        if (t === seat) continue;
        if (!beatOk || !legalSet.has(t)) illegal.push({ cardId: card.id, target: t });
      }
    }
    if (illegal.length === 0) return null;
    const pick = illegal[Math.floor(this.rng() * illegal.length)];
    return { type: 'play', cardId: pick.cardId, targetSeatIndex: pick.target };
  }

  /**
   * Pick the best legal play available given the AI's skill. Strategy depth ranges
   * from "first matching card on a random legal seat" (Easy) to "tier-sorted,
   * leader-targeting, Snap-holding" (Master).
   */
  private chooseStrategicAction(player: import('./Player').Player, seat: number, skill: AiSkillLevel): VersusAction {
    const beat = this.game.getRequiredBeat();
    type Candidate = { card: Card; target: number; tier: number; score: number };
    const candidates: Candidate[] = [];

    for (const card of player.hand) {
      if (!card.matchesBeat(beat)) continue;
      // Always use rulebook-legal targets for the AI's smart path — strict mode's
      // widening is for the human's wheel, not for AI strategy.
      const legalTargets = this.game.legalTargetSeats(seat, card, true);
      if (legalTargets.length === 0) continue;
      const tier = (['right', 'left', 'free'] as CardPrompt[]).includes(card.prompt) ? 0 : 1;

      for (const t of legalTargets) {
        const target = this.game.players[t];
        // Score: higher is better. Specials (tier 1) want to hit the leader; non-specials
        // care less. Lower skill mixes in randomness so target choice feels less optimal.
        let score: number;
        if (tier === 1) {
          if (skill >= 3) score = -target.cardCount;
          else if (skill === 2) score = -target.cardCount * 0.5 + this.rng();
          else score = this.rng();
        } else {
          if (skill >= 3) score = -target.cardCount * 0.3 + this.rng() * 0.2;
          else score = this.rng();
        }
        candidates.push({ card, target: t, tier, score });
      }
    }

    if (candidates.length === 0) return { type: 'draw' };

    // Easy AI sometimes draws even when a legal play exists.
    if (this.rng() < VOLUNTARY_DRAW_RATE[skill]) return { type: 'draw' };

    // Easy: ignore tier entirely, just pick any candidate at random.
    if (skill === 1) {
      const pick = candidates[Math.floor(this.rng() * candidates.length)];
      return { type: 'play', cardId: pick.card.id, targetSeatIndex: pick.target };
    }

    // Skill 2+: sort by tier first (non-specials preferred), then by score (higher first).
    candidates.sort((a, b) => a.tier - b.tier || b.score - a.score);

    // Normal: pick from the top two so the AI is good but not deterministic.
    if (skill === 2) {
      const top2 = candidates.slice(0, 2);
      const pick = top2[Math.floor(this.rng() * top2.length)];
      return { type: 'play', cardId: pick.card.id, targetSeatIndex: pick.target };
    }

    let top = candidates[0];

    // Master: hold Snap unless near victory (≤ 2 cards). Snap-when-drawn is more
    // powerful than Snap-as-prompt, so a smart player hangs on to Snap cards.
    if (skill === 4 && top.card.prompt === 'snap' && player.cardCount > 2) {
      const nonSnap = candidates.find((c) => c.card.prompt !== 'snap');
      if (nonSnap) top = nonSnap;
    }

    return { type: 'play', cardId: top.card.id, targetSeatIndex: top.target };
  }
}
