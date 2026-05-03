import type { Game, PendingSlam } from './Game';
import type { Card } from './Card';
import { CHANT_ORDER, type BaseSlot, type ChantWord, type PlayerId } from './types';

export type SimStatus = 'idle' | 'opening' | 'running' | 'paused' | 'ended';
export type SimMode = 'simulation' | 'play' | 'solo';

export interface SimOptions {
  speed: number;             // 0.25 .. 4
  failureRate: number;       // 0 .. 1
  baseDelayMs: number;       // base inter-beat delay (e.g. 1100) — Simulation mode
  beatTickMs: number;        // metronome tick (Play mode) — fixed 500 ms by spec
  beatsPerPlayer: number;    // metronome ticks per player turn (slider, 2..10)
  jitter: number;            // 0..1 — fraction of randomized variation around the delay
}

const DEFAULT_OPTS: SimOptions = {
  speed: 1,
  failureRate: 0,
  baseDelayMs: 1100,
  beatTickMs: 500,
  beatsPerPlayer: 5,
  jitter: 0.35,
};

/** Pitch of the audio cue accompanying a metronome tick. */
export type DingKind = 'middle' | 'high' | 'low';

/**
 * Play-mode hook: called once per metronome tick. The view layer uses this for audio
 * and for any per-tick visuals (e.g. a beat-counter on the active seat).
 */
export type BeatChangeHook = (info: {
  seatIndex: number;
  playerId: PlayerId;
  isHumanSeat: boolean;
  /** 0..totalTicks-1 — index of the tick we're playing right now. */
  tickIndex: number;
  /** beatsPerPlayer captured at the start of this player's turn. */
  totalTicks: number;
  /** True when this is the LAST tick of the active player's turn — pitched HIGH/LOW. */
  isFinal: boolean;
  /** Audio pitch to play for this tick. */
  dingKind: DingKind;
  /** True only the first tick of a new player's turn (so UI can flash a transition). */
  isTurnStart: boolean;
}) => void;

/**
 * Drives the Game forward in real time. Picks an AI player, schedules the next slam,
 * occasionally produces ties or miscalls based on `failureRate`.
 *
 * Players can be "taken over" by the user — those players' AI logic is skipped, and
 * the UI is expected to call submitHumanSlam() on their behalf.
 */
export class SimulationController {
  private game: Game;
  private opts: SimOptions = { ...DEFAULT_OPTS };
  private timer: number | null = null;
  private rng: () => number;
  private status: SimStatus = 'idle';
  private statusListeners: ((s: SimStatus) => void)[] = [];
  private pendingHumanSlams: PendingSlam[] = [];

  // ---- Mode + Beat state (Play mode only) ----
  private mode: SimMode = 'simulation';
  /** -1 until game opens. In Play mode, indexes the active player in `game.players`. */
  private activeBeatSeatIndex = -1;
  private beatChangeHook: BeatChangeHook | null = null;

  constructor(game: Game, rng: () => number = Math.random) {
    this.game = game;
    this.rng = rng;
  }

  // ---------- Public controls ----------

  setOptions(opts: Partial<SimOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  getOptions(): SimOptions {
    return { ...this.opts };
  }

  setMode(mode: SimMode): void {
    this.mode = mode;
    // Forward to Game so its slam-resolution logic can branch on mode (Solo treats every
    // slam as successful + emits soloPenalty on a chant mismatch).
    this.game.mode = mode;
    if (mode !== 'play') {
      // Simulation and Solo both run without the beat metronome.
      this.game.activeBeatPlayerId = null;
      this.activeBeatSeatIndex = -1;
    }
  }

  getMode(): SimMode {
    return this.mode;
  }

  /** Receive a callback whenever the active beat changes (used to ding the synth). */
  setBeatChangeHook(hook: BeatChangeHook | null): void {
    this.beatChangeHook = hook;
  }

  getActiveBeatSeatIndex(): number {
    return this.activeBeatSeatIndex;
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
    if (this.mode === 'solo') {
      // Solo is purely event-driven — every player slam is processed synchronously in
      // submitHumanSlam. No ticks, no auto-open: the Halo-Halo Chik sits in the player's
      // hand and they click it like any other card. Just flip status to 'running' so the
      // view layer's timer starts.
      this.setStatus('running');
      return;
    }
    if (!this.game.opened) {
      // Open with the Halo-Halo holder, then start ticking.
      this.setStatus('opening');
      this.scheduleNext(this.delay() * 0.6);
    } else {
      this.setStatus('running');
      this.scheduleNext();
    }
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
    // Solo is purely event-driven (player clicks). Scheduling a tick here would kick the
    // simulation/play loop and start auto-playing cards on the player's behalf.
    if (this.mode === 'solo') return;
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setStatus('ended');
  }

  /**
   * Submit a slam from a human-controlled seat.
   *  - Simulation mode: queued and drained on the next tick (matches the simultaneous model).
   *  - Play (BEAT) mode: resolved synchronously so the human's input is never lagged by
   *    the metronome interval. Game.activeBeatPlayerId already enforces out-of-turn rules.
   *
   * Special case: if this slam was the Halo-Halo opening (game.opened was false and
   * becomes true), we ALSO (a) play one indication ding, pitched for who's up next,
   * and (b) kickstart the metronome on the next clockwise seat.
   */
  submitHumanSlam(slam: PendingSlam): void {
    if (this.mode === 'solo') {
      // Solo is fully event-driven: process synchronously, no metronome to wake.
      this.game.resolveSlams([slam]);
      if (this.game.winnerId) this.setStatus('ended');
      return;
    }
    if (this.mode === 'play') {
      const wasOpened = this.game.opened;
      this.game.resolveSlams([slam]);
      if (this.game.winnerId) { this.setStatus('ended'); return; }
      if (!wasOpened && this.game.opened) {
        const haloIdx = this.game.players.findIndex((p) => p.id === this.game.haloHaloOwnerId);
        const { dingKind, nextSeat } = this.dingForOpening(haloIdx);
        if (nextSeat < 0) { this.endByTiebreak(); return; }
        // Indication ding for the Halo-Halo slam.
        const halo = haloIdx >= 0 ? this.game.players[haloIdx] : null;
        this.beatChangeHook?.({
          seatIndex: haloIdx,
          playerId: halo ? halo.id : slam.playerId,
          isHumanSeat: halo ? !halo.isAI : true,
          tickIndex: -1,
          totalTicks: this.opts.beatsPerPlayer,
          isFinal: true,
          dingKind,
          isTurnStart: false,
        });
        this.startTurn(nextSeat);
        this.scheduleNext(this.beatTickInterval());
      }
      return;
    }
    this.pendingHumanSlams.push(slam);
  }

  /** Toggle a single player between AI and human. */
  setPlayerHuman(playerId: PlayerId, isHuman: boolean): void {
    const p = this.game.players.find((pl) => pl.id === playerId);
    if (p) p.isAI = !isHuman;
  }

  // ---------- AI helpers ----------

  /**
   * Pick the base an AI player will slam onto for a given card.
   *  - Non-decoy: the legal target (matching word base if owned, else Main).
   *  - Decoy: a random base from the set of OWNED word bases plus Main. Unowned word bases
   *    live in the center as display-only references — anything aimed there piles on Main —
   *    so AI shouldn't bother targeting them.
   */
  private aiTargetForCard(card: Card): BaseSlot {
    if (card.kind === 'decoy') {
      const slots: BaseSlot[] = [];
      for (const [slot, base] of this.game.bases) {
        if (slot === 'main' || base.ownerId) slots.push(slot);
      }
      return slots[Math.floor(this.rng() * slots.length)];
    }
    return this.game.resolveTargetBase(card.word);
  }

  // ---------- Internal loop ----------

  private setStatus(s: SimStatus): void {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  private delay(): number {
    const base = this.opts.baseDelayMs / Math.max(0.1, this.opts.speed);
    const j = (this.rng() * 2 - 1) * this.opts.jitter;
    return Math.max(80, base * (1 + j));
  }

  private scheduleNext(ms?: number): void {
    if (this.timer !== null) clearTimeout(this.timer);
    const delay = ms ?? (this.mode === 'play' ? this.beatTickInterval() : this.delay());
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.tick();
    }, delay);
  }

  /** Single metronome tick interval (Play mode). 500 ms by spec; clamped for safety. */
  private beatTickInterval(): number {
    return Math.max(120, this.opts.beatTickMs);
  }

  private tick(): void {
    if (this.status === 'paused' || this.status === 'ended') return;
    if (this.game.winnerId) {
      this.setStatus('ended');
      return;
    }

    if (this.mode === 'play') {
      this.tickBeat();
      return;
    }

    // ---- Simulation mode (original simultaneous logic) ----

    // Open the game if not yet opened.
    if (!this.game.opened) {
      this.game.openGame();
      this.setStatus('running');
      this.scheduleNext();
      return;
    }

    // Decide what to do this beat.
    const beat = this.game.getRequiredBeat();
    const slams: PendingSlam[] = [];

    // 1) Drain any pending human slams.
    if (this.pendingHumanSlams.length > 0) {
      slams.push(...this.pendingHumanSlams);
      this.pendingHumanSlams = [];
    } else {
      // 2) AI decision. Find candidates among AI players who hold the required card.
      const aiPlayers = this.game.players.filter((p) => p.isAI && p.cardCount > 0);
      const candidates = aiPlayers.filter((p) => p.hasCardForBeat(beat) !== null);

      if (candidates.length === 0) {
        // No AI player can play. If a human seat exists, give them more time.
        const anyHuman = this.game.players.some((p) => !p.isAI && p.cardCount > 0);
        if (anyHuman) {
          this.scheduleNext(this.delay() * 1.2);
          return;
        }
        // Stalled — nobody can play. End by tiebreak.
        this.endByTiebreak();
        return;
      }

      const r = this.rng();
      if (r < this.opts.failureRate) {
        // Error scenario.
        if (this.rng() < 0.5 && candidates.length >= 2) {
          // Tie — two candidates slam simultaneously.
          const shuffled = candidates.slice().sort(() => this.rng() - 0.5);
          const [a, b] = [shuffled[0], shuffled[1]];
          for (const p of [a, b]) {
            const card = p.hasCardForBeat(beat)!;
            slams.push({
              playerId: p.id,
              cardId: card.id,
              targetBase: this.aiTargetForCard(card),
              shoutedWord: beat,
            });
          }
        } else {
          // Miscall — primary slams a wrong card or correct card on wrong base.
          const primary = candidates[Math.floor(this.rng() * candidates.length)];
          const wrongCards = primary.hand.filter((c) => !c.matchesBeat(beat) && c.kind !== 'decoy');
          if (wrongCards.length > 0 && this.rng() < 0.7) {
            const wrong = wrongCards[Math.floor(this.rng() * wrongCards.length)];
            slams.push({
              playerId: primary.id,
              cardId: wrong.id,
              targetBase: this.aiTargetForCard(wrong),
              shoutedWord: beat,
            });
          } else {
            // Slam correct card on a wrong base (only meaningful for non-decoy).
            const card = primary.hasCardForBeat(beat)!;
            const wrongSlots = Array.from(this.game.bases.keys()).filter(
              (s) => s !== card.word && s !== 'main',
            );
            const targetBase = card.kind !== 'decoy' && wrongSlots.length > 0
              ? wrongSlots[Math.floor(this.rng() * wrongSlots.length)]
              : this.game.resolveTargetBase(card.word);
            slams.push({
              playerId: primary.id,
              cardId: card.id,
              targetBase,
              shoutedWord: beat,
            });
          }
        }
      } else {
        // Clean play — fastest player wins.
        const primary = candidates[Math.floor(this.rng() * candidates.length)];
        const card = primary.hasCardForBeat(beat)!;
        slams.push({
          playerId: primary.id,
          cardId: card.id,
          targetBase: this.aiTargetForCard(card),
          shoutedWord: beat,
        });
      }
    }

    // Resolve slams.
    this.game.resolveSlams(slams);

    if (this.game.winnerId) {
      this.setStatus('ended');
      return;
    }

    this.scheduleNext();
  }

  // ---------- Play / BEAT mode ----------

  /** Find the seat clockwise of `from` that still has cards. Returns -1 if none. */
  private nextActiveSeat(from: number): number {
    const n = this.game.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (this.game.players[idx].cardCount > 0) return idx;
    }
    return -1;
  }

  // ---------- Beat metronome state ----------

  /** Tick index within the current player's turn (0 .. beatsPerPlayer-1). */
  private beatTickIndex = 0;
  /** Total ticks captured at the start of this turn (so a mid-game slider change is harmless). */
  private currentTurnTotalTicks = 5;
  /** Which tick (0..total-1) the AI plans to slam on this turn — set per turn. -1 = skip. */
  private aiSlamTick = -1;
  /** Card the AI committed to play (chosen at the start of its turn). */
  private aiSlamCardId: string | null = null;

  /**
   * Begin a new player's turn. Writes activeBeatPlayerId on the Game (for out-of-turn
   * enforcement), resets the tick counter, and rolls the AI's plan for this turn.
   * Does NOT fire a tick or audio — the next call to tickBeat() will play tick 0.
   */
  private startTurn(seatIndex: number): void {
    this.activeBeatSeatIndex = seatIndex;
    this.beatTickIndex = -1; // will become 0 on the first metronome firing
    this.currentTurnTotalTicks = Math.max(2, Math.min(10, Math.round(this.opts.beatsPerPlayer)));
    if (seatIndex < 0 || seatIndex >= this.game.players.length) {
      this.game.activeBeatPlayerId = null;
      this.aiSlamTick = -1;
      this.aiSlamCardId = null;
      return;
    }
    const p = this.game.players[seatIndex];
    this.game.activeBeatPlayerId = p.id;
    this.game['emit']({ kind: 'beatChanged', seatIndex, playerId: p.id });

    const beat = this.game.getRequiredBeat();
    const matching = p.hasCardForBeat(beat);

    // If this player has nothing playable for the current beat, snap their turn to a
    // short window (max 2 ticks) so the metronome doesn't drag — there's nothing they
    // can do anyway, so quickly hand the BEAT to the next clockwise player.
    if (!matching) {
      this.currentTurnTotalTicks = Math.min(2, this.currentTurnTotalTicks);
    }

    // Decide AI plan once at the start of the turn so timing stays stable across ticks.
    if (p.isAI) {
      const r = this.rng();
      // Failure roll: occasionally the AI just skips the whole turn.
      if (r < this.opts.failureRate * 0.4 || !matching) {
        this.aiSlamTick = -1;
        this.aiSlamCardId = null;
      } else {
        // Decide which card (correct, or wrong as a miscall).
        const wrongCards = p.hand.filter((c) => !c.matchesBeat(beat));
        const playWrong = r < this.opts.failureRate && wrongCards.length > 0;
        const card = playWrong
          ? wrongCards[Math.floor(this.rng() * wrongCards.length)]
          : matching;
        this.aiSlamCardId = card.id;
        // Pick a tick somewhere in the middle of the window — never the final tick,
        // and avoid tick 0 so the cadence feels musical (slam between dings).
        const lastIdx = this.currentTurnTotalTicks - 1;
        const min = Math.min(1, lastIdx);
        const span = Math.max(0, lastIdx - 1 - min); // ticks 1..lastIdx-1 inclusive
        this.aiSlamTick = min + Math.floor(this.rng() * (span + 1));
      }
    } else {
      this.aiSlamTick = -1;
      this.aiSlamCardId = null;
    }
  }

  /** Returns true when no remaining player has a card matching the current chant beat. */
  private isProgressImpossible(): boolean {
    if (!this.game.opened) return false;
    const beat = this.game.getRequiredBeat();
    return !this.game.players.some(
      (p) => p.cardCount > 0 && p.hasCardForBeat(beat) !== null,
    );
  }

  /**
   * Pitch of the "card was played to open the round" ding — same rule as a final-tick
   * DING: HIGH if the next clockwise active player is human, LOW otherwise.
   * Used both for AI auto-open and the human Halo-Halo slam (via submitHumanSlam).
   */
  private dingForOpening(haloIdx: number): { dingKind: DingKind; nextSeat: number } {
    const nextSeat = this.nextActiveSeat(haloIdx >= 0 ? haloIdx : -1);
    const next = nextSeat >= 0 ? this.game.players[nextSeat] : null;
    return { dingKind: next && !next.isAI ? 'high' : 'low', nextSeat };
  }

  /**
   * Continuous BEAT metronome. Fires every `beatTickMs` (default 500 ms) regardless of
   * whether the active player slammed. Each tick:
   *  1. Plays a ding (middle / high / low pitch — final tick of a turn is high if your
   *     seat owns the beat, low otherwise).
   *  2. Fires the AI's planned slam if this is the tick they chose.
   *  3. After the LAST tick, rotates the active seat clockwise and resets the counter.
   *
   * Player slams (human) are processed synchronously in submitHumanSlam, not here — the
   * metronome is decoupled from gameplay so it never lags or skips for any reason.
   */
  private tickBeat(): void {
    // ----- Opening (game not yet opened) -----
    // If the Halo-Halo holder is AI: auto-open and start the first turn clockwise.
    // If the holder is HUMAN: pause the metronome and let them play it themselves.
    //   The wait state is exited by submitHumanSlam → kickstart on game.opened flip.
    if (!this.game.opened) {
      const haloIdx = this.game.players.findIndex((p) => p.id === this.game.haloHaloOwnerId);
      const holder = haloIdx >= 0 ? this.game.players[haloIdx] : null;
      this.setStatus('running');

      if (!holder || holder.isAI) {
        // AI auto-opens.
        this.game.openGame();
        if (this.game.winnerId) { this.setStatus('ended'); return; }
        const { dingKind, nextSeat } = this.dingForOpening(haloIdx);
        if (nextSeat < 0) { this.endByTiebreak(); return; }
        // Single ding marking the open, pitched for the next-up player (matches the
        // user's request: "play only the last beat" indication when the Halo-Halo lands).
        this.beatChangeHook?.({
          seatIndex: haloIdx,
          playerId: holder ? holder.id : this.game.players[nextSeat].id,
          isHumanSeat: holder ? !holder.isAI : false,
          tickIndex: -1,
          totalTicks: this.opts.beatsPerPlayer,
          isFinal: true,
          dingKind,
          isTurnStart: false,
        });
        this.startTurn(nextSeat);
        this.scheduleNext(this.beatTickInterval());
        return;
      }

      // Human holds Halo-Halo: park the metronome on this seat and wait for their slam.
      // We mark them as the active beat so the pie wedge lights up, but no metronome
      // ticks (and no audio) play until they actually drop the card.
      if (this.activeBeatSeatIndex !== haloIdx) {
        this.activeBeatSeatIndex = haloIdx;
        this.beatTickIndex = -1;
        this.game.activeBeatPlayerId = holder.id;
        this.game['emit']({ kind: 'beatChanged', seatIndex: haloIdx, playerId: holder.id });
      }
      // Intentionally NO scheduleNext — submitHumanSlam will resume the metronome.
      return;
    }

    // ----- Stuck check -----
    // If NO remaining player has a card for the current chant beat, no slam can ever
    // succeed — end the round now via the rulebook's tiebreak (fewest cards / fewest
    // combined points / share). Avoids the metronome ticking forever on a dead game.
    if (this.isProgressImpossible()) {
      this.endByTiebreak();
      return;
    }

    // Advance to the next tick.
    this.beatTickIndex++;
    const total = this.currentTurnTotalTicks;
    const tickIndex = this.beatTickIndex;
    const isFinal = tickIndex >= total - 1;
    const seat = this.activeBeatSeatIndex;
    const active = seat >= 0 ? this.game.players[seat] : null;

    // If the active seat somehow became invalid (e.g. they emptied their hand by slamming),
    // skip ahead to the next live seat without burning ticks.
    if (!active || active.cardCount === 0) {
      const nextSeat = this.nextActiveSeat(seat);
      if (nextSeat < 0) { this.endByTiebreak(); return; }
      this.startTurn(nextSeat);
      this.scheduleNext(this.beatTickInterval());
      return;
    }

    // Audio + visual hook for this tick. The FINAL tick's pitch is based on who's UP NEXT
    // (clockwise neighbour with cards), so the human hears the HIGH DING on the previous
    // player's final tick — a heads-up that the BEAT is rotating to them.
    let dingKind: DingKind = 'middle';
    if (isFinal) {
      const nextSeatPreview = this.nextActiveSeat(seat);
      const nextPlayer = nextSeatPreview >= 0 ? this.game.players[nextSeatPreview] : null;
      dingKind = nextPlayer && !nextPlayer.isAI ? 'high' : 'low';
    }
    this.beatChangeHook?.({
      seatIndex: seat,
      playerId: active.id,
      isHumanSeat: !active.isAI,
      tickIndex,
      totalTicks: total,
      isFinal,
      dingKind,
      isTurnStart: tickIndex === 0,
    });

    // AI's planned slam fires on its chosen tick.
    if (active.isAI && this.aiSlamCardId !== null && tickIndex === this.aiSlamTick) {
      const card = active.hand.find((c) => c.id === this.aiSlamCardId);
      if (card) {
        this.game.resolveSlams([{
          playerId: active.id,
          cardId: card.id,
          targetBase: this.aiTargetForCard(card),
          shoutedWord: this.game.getRequiredBeat(),
        }]);
        if (this.game.winnerId) { this.setStatus('ended'); return; }
      }
      // Don't slam again this turn even if there are remaining ticks.
      this.aiSlamTick = -1;
      this.aiSlamCardId = null;
    }

    // After the final tick of this turn, rotate clockwise.
    if (isFinal) {
      const nextSeat = this.nextActiveSeat(seat);
      if (nextSeat < 0) { this.endByTiebreak(); return; }
      this.startTurn(nextSeat);
    }

    this.scheduleNext(this.beatTickInterval());
  }

  private endByTiebreak(): void {
    // Fewest cards wins; tie → fewest combined points; tie → first by seat index.
    const ranked = this.game.players
      .filter((p) => p.cardCount > 0)
      .slice()
      .sort((a, b) => {
        if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount;
        const ap = a.hand.reduce((sum, c) => sum + CHANT_ORDER.indexOf(c.word) + 1, 0);
        const bp = b.hand.reduce((sum, c) => sum + CHANT_ORDER.indexOf(c.word) + 1, 0);
        if (ap !== bp) return ap - bp;
        return a.seatIndex - b.seatIndex;
      });
    if (ranked.length > 0) {
      this.game['declareWinner'](ranked[0].id);
    }
    this.setStatus('ended');
  }

  /** Read-only chant beat helper for the UI. */
  getRequiredBeat(): ChantWord {
    return this.game.getRequiredBeat();
  }
}
