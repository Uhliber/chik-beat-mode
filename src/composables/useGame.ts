import { computed, onUnmounted, reactive, ref, shallowRef, triggerRef } from 'vue';
import { App as CapApp } from '@capacitor/app';
import type { Card } from '@/game/Card';
import { Game } from '@/game/Game';
import { SimulationController, type SimStatus, type SimMode, type AiSkillLevel } from '@/game/SimulationController';
import type { BaseSide, CardPrompt, ChantPowerGift, ChantWord, GameEvent, PlayerId, PlaygroundComposition, SoloAction, VersusAction } from '@/game/types';
import { modeCaps } from '@/game/modes';
import { useBeatAudio } from './useBeatAudio';
import {
  DEFAULT_AI_SKILL,
  DEFAULT_AUDIO_MUTED,
  DEFAULT_EVENT_LOG_ENABLED,
  DEFAULT_GUIDE_ON_TABLE_PREF,
  DEFAULT_PLAYER_COUNT_TURN_BASED,
  DEFAULT_PLAYGROUND_COMPOSITION,
  DEFAULT_PLAYGROUND_HAND_SIZE,
  DEFAULT_PROMPT_SIZE,
  DEFAULT_PROMPT_INFO_SIZE,
  DEFAULT_CHANT_RECITAL_SPEED,
  DEFAULT_SPEED,
  DEFAULT_STRICT_PROMPTS,
  DEFAULT_WISP_ENABLED,
  clearGuideOnTable,
  loadAiSkill,
  loadEventLogEnabled,
  loadGuideOnTable,
  loadPlaygroundComposition,
  loadPlaygroundHandSize,
  loadPromptSize,
  loadPromptInfoSize,
  loadChantRecitalSpeed,
  RECITAL_STEP_MS_BY_SPEED,
  loadSoloBestTime,
  loadStrictPrompts,
  loadWispEnabled,
  saveAiSkill,
  saveEventLogEnabled,
  saveGuideOnTable,
  savePlaygroundComposition,
  savePlaygroundHandSize,
  savePromptSize,
  savePromptInfoSize,
  saveChantRecitalSpeed,
  saveSoloBestTime,
  saveStrictPrompts,
  saveWispEnabled,
  type PromptSize,
  type PromptInfoSize,
  type ChantRecitalSpeed,
} from './userPreferences';
/** Re-exported for downstream callers that historically imported `PromptSize` from
 *  `useGame`. New code should import directly from `userPreferences`. */
export type { PromptSize, PromptInfoSize };

/**
 * A queued card-flight, snapshotted at event-emission time. Carries pre-captured DOM
 * rects so the animation's start/end points are immune to the post-event layout shift
 * Vue does when the source hand re-fans / target prompt-stack grows.
 */
export interface FlightSpec {
  id: number;
  kind: 'play-versus' | 'play-solo' | 'draw';
  cardId: string;
  faceUrl: string;
  fromRect: DOMRect;
  toRect: DOMRect;
  /** For draw flights — flip back→face mid-flight so the drawer sees their card. */
  revealFace?: boolean;
  /** Shout-the-word state: the word + the seat that shouted it. Source-only events. */
  shoutWord?: ChantWord;
  shoutSeatIndex?: number;
  /** Solo-only: which base the card landed on (Left/Right). */
  baseSide?: BaseSide;
}

/** Re-exported for callers that imported `PromptSize` from this module historically. */

export interface UseGameOptions {
  initialMode?: SimMode;
}

export interface GameViewState {
  version: number;
  status: SimStatus;
  events: GameEvent[];
}

const MAX_LOG = 50;

export function useGame(opts: UseGameOptions = {}) {
  const initialMode: SimMode = opts.initialMode ?? 'versus';

  const game = shallowRef<Game>(new Game());
  const controller = shallowRef<SimulationController>(new SimulationController(game.value));

  const state = reactive<GameViewState>({
    version: 0,
    status: 'idle',
    events: [],
  });

  // Versus defaults to 4 players; Solo is implicitly 1.
  const playerCount = ref(initialMode === 'solo' ? 1 : DEFAULT_PLAYER_COUNT_TURN_BASED);
  const speed = ref(DEFAULT_SPEED);
  const mode = ref<SimMode>(initialMode);
  const beatAudio = useBeatAudio();

  // ---- Solo timer state ----
  const soloElapsedMs = ref(0);
  const soloPenaltyMs = ref(0);
  /** Total accumulated time credit from bonuses (chant-chik closing, combo streak,
   *  etc). Subtracted from the displayed clock by PlayView. */
  const soloBonusMs = ref(0);
  const soloRunning = ref(false);
  const soloBestTimeMs = ref<number | null>(null);
  const soloLastFinalMs = ref<number | null>(null);
  const soloIsNewBest = ref(false);
  void loadSoloBestTime().then((ms) => {
    if (ms !== null) soloBestTimeMs.value = ms;
  });

  // ---- Solo combo-streak state ----
  //
  // Each consecutive legal slam refills a streak bar; the bar drains over
  // STREAK_BAR_MS wall-clock time. When the bar empties (or a penalty hits) the
  // accumulated streak converts to a time credit and the streak resets.
  //
  // Drawing a card is NEUTRAL — the bar keeps depleting but the streak doesn't
  // break. Penalties break the streak immediately. The bonus formula rewards
  // sustained play without ballooning the time savings:
  //
  //   bonus(streak) = max(0, streak - STREAK_MIN_TO_AWARD + 1) × PER_STREAK_MS
  //
  //   streak  3 →   200ms       streak 10 → 1600ms
  //   streak  5 →   600ms       streak 15 → 2600ms
  //   streak  7 →  1000ms       streak 20 → 3600ms
  const STREAK_BAR_MS = 3000;
  const STREAK_MIN_TO_AWARD = 3;
  const PER_STREAK_BONUS_MS = 200;
  const soloStreak = ref(0);
  /** Remaining bar fill in ms (0..STREAK_BAR_MS). 0 = bar empty, no streak. */
  const soloStreakBarMs = ref(0);
  let soloStreakRafId: number | null = null;
  let soloStreakLastTickAt = 0;
  /** Most recent streak bonus awarded — drives a one-shot bubble in PlayView. */
  const soloLastStreakBonus = ref<{ id: number; streak: number; bonusMs: number } | null>(null);
  let nextStreakBonusId = 1;

  function computeStreakBonus(streak: number): number {
    if (streak < STREAK_MIN_TO_AWARD) return 0;
    return (streak - STREAK_MIN_TO_AWARD + 1) * PER_STREAK_BONUS_MS;
  }

  function finalizeStreak(): void {
    const s = soloStreak.value;
    if (s >= STREAK_MIN_TO_AWARD) {
      const bonusMs = computeStreakBonus(s);
      soloBonusMs.value += bonusMs;
      soloLastStreakBonus.value = { id: nextStreakBonusId++, streak: s, bonusMs };
      beatAudio.ding('high');
    }
    soloStreak.value = 0;
    soloStreakBarMs.value = 0;
    if (soloStreakRafId !== null) {
      cancelAnimationFrame(soloStreakRafId);
      soloStreakRafId = null;
    }
  }

  function pulseStreak(): void {
    soloStreak.value += 1;
    soloStreakBarMs.value = STREAK_BAR_MS;
    soloStreakLastTickAt = performance.now();
    if (soloStreakRafId === null) {
      const tick = () => {
        if (soloStreakBarMs.value <= 0) {
          soloStreakRafId = null;
          finalizeStreak();
          return;
        }
        const now = performance.now();
        const dt = now - soloStreakLastTickAt;
        soloStreakLastTickAt = now;
        soloStreakBarMs.value = Math.max(0, soloStreakBarMs.value - dt);
        soloStreakRafId = requestAnimationFrame(tick);
      };
      soloStreakRafId = requestAnimationFrame(tick);
    }
  }

  // Turn-indicator wisp (Versus only). Persisted, default ON.
  const wispEnabled = ref(DEFAULT_WISP_ENABLED);
  void loadWispEnabled().then((on) => { wispEnabled.value = on; });
  const setWispEnabled = (on: boolean) => {
    wispEnabled.value = on;
    saveWispEnabled(on);
  };

  // Event log visibility (desktop sidebar + mobile sheet). Persisted, default ON.
  const eventLogEnabled = ref(DEFAULT_EVENT_LOG_ENABLED);
  void loadEventLogEnabled().then((on) => { eventLogEnabled.value = on; });
  const setEventLogEnabled = (on: boolean) => {
    eventLogEnabled.value = on;
    saveEventLogEnabled(on);
  };

  // Guide-on-table preference (null = use platform default in the consumer). The view
  // layer resolves null → !isMobile so desktop sees the floating guide by default and
  // mobile keeps the table clean; an explicit user toggle overrides either way.
  const guideOnTablePref = ref<boolean | null>(null);
  void loadGuideOnTable().then((v) => { guideOnTablePref.value = v; });
  const setGuideOnTable = (on: boolean) => {
    guideOnTablePref.value = on;
    saveGuideOnTable(on);
  };

  // Strict-prompts house rule (Versus only). Persisted, default OFF.
  const strictPrompts = ref(DEFAULT_STRICT_PROMPTS);
  void loadStrictPrompts().then((on) => {
    strictPrompts.value = on;
    if (game.value) game.value.setStrictPromptsEnabled(on);
  });
  const setStrictPrompts = (on: boolean) => {
    strictPrompts.value = on;
    saveStrictPrompts(on);
    if (game.value) game.value.setStrictPromptsEnabled(on);
  };

  // AI skill (Versus only). Persisted, default 3 (Hard).
  const aiSkill = ref<AiSkillLevel>(DEFAULT_AI_SKILL);
  void loadAiSkill().then((level) => {
    aiSkill.value = level;
    if (controller.value) controller.value.setAiSkill(level);
  });
  const setAiSkill = (level: AiSkillLevel) => {
    aiSkill.value = level;
    saveAiSkill(level);
    if (controller.value) controller.value.setAiSkill(level);
  };

  // Prompt-size display preference. Live — applies to the current round without restart.
  const promptSize = ref<PromptSize>(DEFAULT_PROMPT_SIZE);
  void loadPromptSize().then((v) => { promptSize.value = v; });
  const setPromptSize = (v: PromptSize) => {
    promptSize.value = v;
    savePromptSize(v);
  };

  // Floating prompt+count popover size preference. 'off' hides the popovers entirely.
  const promptInfoSize = ref<PromptInfoSize>(DEFAULT_PROMPT_INFO_SIZE);
  void loadPromptInfoSize().then((v) => { promptInfoSize.value = v; });
  const setPromptInfoSize = (v: PromptInfoSize) => {
    promptInfoSize.value = v;
    savePromptInfoSize(v);
  };

  // Speed of the Chant Trigger recital animation: slow / normal / fast / skip. The
  // controller mirrors the same setting so AI auto-resolve waits for the on-screen
  // recital to finish.
  const chantRecitalSpeed = ref<ChantRecitalSpeed>(DEFAULT_CHANT_RECITAL_SPEED);
  /** Current per-step ms derived from `chantRecitalSpeed`. 0 = skip. */
  const recitalStepMs = computed(() => RECITAL_STEP_MS_BY_SPEED[chantRecitalSpeed.value]);
  void loadChantRecitalSpeed().then((v) => {
    chantRecitalSpeed.value = v;
    controller.value.setRecitalPacing(recitalStepMs.value);
  });
  const setChantRecitalSpeed = (v: ChantRecitalSpeed) => {
    chantRecitalSpeed.value = v;
    saveChantRecitalSpeed(v);
    controller.value.setRecitalPacing(recitalStepMs.value);
  };

  // Custom-deck state (used by any mode whose caps.hasCustomDeck === true; only
  // 'playground' today). Persisted via Capacitor Preferences; default = canonical 56-card.
  const playgroundComposition = ref<PlaygroundComposition>({ ...DEFAULT_PLAYGROUND_COMPOSITION });
  const playgroundHandSize = ref<number>(DEFAULT_PLAYGROUND_HAND_SIZE);
  /** Re-run initGame iff the current mode actually consumes the custom-deck knobs
   *  AND we're idle (so we don't yank the rug out from under an in-progress round). */
  const rebuildIfCustomDeckActive = () => {
    if (modeCaps(mode.value).hasCustomDeck && state.status === 'idle') initGame();
  };
  // Async preference loads — if the game was initialized with defaults before these
  // resolve, rebuild so the persisted composition/hand size take effect.
  void loadPlaygroundComposition().then((c) => {
    playgroundComposition.value = c;
    rebuildIfCustomDeckActive();
  });
  void loadPlaygroundHandSize().then((n) => {
    playgroundHandSize.value = n;
    rebuildIfCustomDeckActive();
  });
  /** Updating either of these while idle re-runs initGame so the new deck is reflected
   *  on the table without an explicit Restart (matches the existing playerCount pattern). */
  const setPlaygroundComposition = (comp: PlaygroundComposition) => {
    playgroundComposition.value = { ...comp };
    savePlaygroundComposition(comp);
    rebuildIfCustomDeckActive();
  };
  const setPlaygroundPromptCount = (prompt: CardPrompt, count: number) => {
    setPlaygroundComposition({ ...playgroundComposition.value, [prompt]: count });
  };
  const setPlaygroundHandSize = (n: number) => {
    const clamped = Math.max(3, Math.min(14, Math.round(n)));
    playgroundHandSize.value = clamped;
    savePlaygroundHandSize(clamped);
    rebuildIfCustomDeckActive();
  };
  /** Reset both composition and hand size to the canonical v1.0 Versus defaults. */
  const resetPlaygroundDefaults = () => {
    const defaultComp = { ...DEFAULT_PLAYGROUND_COMPOSITION };
    playgroundComposition.value = defaultComp;
    playgroundHandSize.value = DEFAULT_PLAYGROUND_HAND_SIZE;
    savePlaygroundComposition(defaultComp);
    savePlaygroundHandSize(DEFAULT_PLAYGROUND_HAND_SIZE);
    rebuildIfCustomDeckActive();
  };

  /** Reset every Sound + Game + Display preference back to its canonical default.
   *  Intentionally leaves the playground deck (composition + hand size) alone — that
   *  has its own dedicated reset, so a user who built a custom deck doesn't lose it
   *  when they reach for "Reset to defaults" to undo a stray display tweak.
   *
   *  Player count only resets in turn-based modes; solo is locked to 1 by setMode and
   *  the Game group is hidden for non-turn-based modes anyway. */
  const resetGeneralDefaults = () => {
    // Sound
    beatAudio.setMuted(DEFAULT_AUDIO_MUTED);
    // Game (turn-based only — leave solo's seat count alone)
    if (modeCaps(mode.value).isTurnBased) {
      playerCount.value = DEFAULT_PLAYER_COUNT_TURN_BASED;
    }
    speed.value = DEFAULT_SPEED;
    controller.value.setOptions({ speed: DEFAULT_SPEED });
    strictPrompts.value = DEFAULT_STRICT_PROMPTS;
    saveStrictPrompts(DEFAULT_STRICT_PROMPTS);
    if (game.value) game.value.setStrictPromptsEnabled(DEFAULT_STRICT_PROMPTS);
    aiSkill.value = DEFAULT_AI_SKILL;
    saveAiSkill(DEFAULT_AI_SKILL);
    if (controller.value) controller.value.setAiSkill(DEFAULT_AI_SKILL);
    // Display
    wispEnabled.value = DEFAULT_WISP_ENABLED;
    saveWispEnabled(DEFAULT_WISP_ENABLED);
    eventLogEnabled.value = DEFAULT_EVENT_LOG_ENABLED;
    saveEventLogEnabled(DEFAULT_EVENT_LOG_ENABLED);
    promptSize.value = DEFAULT_PROMPT_SIZE;
    savePromptSize(DEFAULT_PROMPT_SIZE);
    promptInfoSize.value = DEFAULT_PROMPT_INFO_SIZE;
    savePromptInfoSize(DEFAULT_PROMPT_INFO_SIZE);
    chantRecitalSpeed.value = DEFAULT_CHANT_RECITAL_SPEED;
    saveChantRecitalSpeed(DEFAULT_CHANT_RECITAL_SPEED);
    // Guide-on-table: clear the explicit preference so it follows the platform default
    // again (desktop on, mobile off). Persistence layer treats null as "not set".
    guideOnTablePref.value = DEFAULT_GUIDE_ON_TABLE_PREF;
    clearGuideOnTable();
  };

  /**
   * Reactive mirror of game.pendingSnapDraw so the UI can show the Left/Right chooser
   * to the human. Updated synchronously inside handleEvent on versusSnapDrawnAvailable
   * (and cleared on snap-played / kept).
   */
  const pendingSnapDraw = ref<{ playerId: PlayerId; cardId: string } | null>(null);

  // ----- v1.2 Beat ownership + Chant Trigger state, mirrored for templates -----
  const setupPhase = ref<'beat-selection' | 'play'>('play');
  const beatOwners = ref<Map<ChantWord, number>>(new Map());
  const beatsBySeat = ref<Map<number, ChantWord[]>>(new Map());
  const currentBeatPickerSeat = ref<number | null>(null);

  /** Live Chant Trigger state. `active` flips true on versusChantTriggered, false on
   *  versusChantPowerResolved (or ~300ms after a no-winner trigger). The recital steps
   *  are drained one-by-one with a per-step delay so SpeechBubbles + counter pips
   *  animate sequentially around the table. */
  const chantTrigger = ref<{
    active: boolean;
    sourceSeatIndex: number;
    receiverSeatIndex: number;
    total: number;
    landedBeat: ChantWord | 'no-winner-opening' | 'no-winner-unclaimed';
    winnerSeatIndex: number | null;
    perSeatCounts: number[];
  } | null>(null);
  /** Recital step currently lit. Keyed by seat index → number of count units spoken so
   *  far AT that seat. Updated as the recital walks. */
  const chantRecitalStepsBySeat = ref<Map<number, number>>(new Map());
  /** Speech bubble fired by the recital — one shout per beat step. Mirrors the existing
   *  `shouts` pattern in GameTable so we can reuse SpeechBubble. */
  const recitalShouts = ref<Record<number, { word: ChantWord; key: number }>>({});
  /** Seat that's currently being recited at — used to glow that seat's popover. */
  const chantRecitalCurrentSeat = ref<number | null>(null);
  /** The beat word being spoken at the current recital step. Updates per step so the
   *  ChantTriggerOverlay banner can display the chant lottery-style (cycling through
   *  beats live), then freezes on the LANDED beat once the recital ends. Reset to
   *  null when a new trigger fires. */
  const chantRecitalCurrentBeat = ref<ChantWord | null>(null);
  /** Monotonic step counter for the recital (increments by 1 per step). Drives the
   *  lottery banner's <Transition> key so the flip animation re-fires even when the
   *  same beat word is spoken twice in a row (e.g. closing chik → opening chik).
   *  Without it, Vue would see no key change and skip the transition entirely. */
  const chantRecitalTick = ref(0);
  /** Once the recital finishes, this carries the winner seat index (or null if the
   *  chant landed on an unclaimed/opening beat). Drives the burst-confetti overlay
   *  and the "No beat owner" subtitle. Cleared on trigger teardown. */
  const chantRevealWinnerSeat = ref<number | null>(null);
  const chantRevealNoWinner = ref(false);
  /** Map of seat → the global recital step at which that seat's run BEGAN. Derived
   *  from the trigger's perSeatCounts + receiverSeatIndex; used by ChantPips to know
   *  which beat word each lit pip represents (chik / wally / hindo / …). Empty unless
   *  a trigger is active. */
  const chantStartStepBySeat = computed<Map<number, number>>(() => {
    const t = chantTrigger.value;
    if (!t) return new Map();
    const out = new Map<number, number>();
    const n = t.perSeatCounts.length;
    let step = 0;
    for (let i = 0; i < n; i++) {
      const seat = (t.receiverSeatIndex + i) % n;
      out.set(seat, step);
      step += t.perSeatCounts[seat] ?? 0;
    }
    return out;
  });

  /** Pending Chant Power state (mirrors game.pendingChantPower so templates can react). */
  const pendingChantPower = ref<{
    winnerSeatIndex: number;
    receiverSeatIndex: number;
    chantChikId: string;
  } | null>(null);
  let soloRafId: number | null = null;
  let soloStartedAt = 0;
  const startSoloTimer = () => {
    if (soloRunning.value) return;
    soloRunning.value = true;
    soloStartedAt = performance.now() - soloElapsedMs.value;
    const tick = () => {
      if (!soloRunning.value) return;
      soloElapsedMs.value = performance.now() - soloStartedAt;
      soloRafId = requestAnimationFrame(tick);
    };
    soloRafId = requestAnimationFrame(tick);
  };
  const stopSoloTimer = () => {
    soloRunning.value = false;
    if (soloRafId !== null) {
      cancelAnimationFrame(soloRafId);
      soloRafId = null;
    }
  };

  // ---- Chant ticker state ----
  const chantVirtualPos = ref(0);
  const lastPlayedVirtualPos = ref<number | null>(null);

  // ---- Versus turn state (mirrored from game for templates) ----
  const activeSeatIndex = ref<number>(-1);

  /**
   * Flight queue — GameTable drains this on each push and starts a GSAP timeline per spec.
   * Rects are captured here (synchronously inside the event listener) so the snapshot
   * predates Vue's post-event re-render — the source seat is still at its pre-play layout
   * when we read its bounding box.
   */
  const pendingFlights = ref<FlightSpec[]>([]);
  let nextFlightId = 1;

  function snapshotRect(selector: string): DOMRect | null {
    const el = document.querySelector<HTMLElement>(selector);
    return el ? el.getBoundingClientRect() : null;
  }

  let unsubGame: (() => void) | null = null;
  let unsubStatus: (() => void) | null = null;

  const isHumanEvent = (playerId: PlayerId): boolean => {
    const p = game.value.players.find((x) => x.id === playerId);
    return !!p && !p.isAI;
  };

  /**
   * Queue a card-flight from the winner's seat to each gift recipient's seat after
   * the Chant Power resolves. Reuses the existing 'draw' flight kind (cards landing
   * in a hand) — the engine already moved the cards into recipient.hand by the time
   * versusChantPowerResolved fires, so we look them up there for the assetPath.
   */
  function queueFlightsForChantGifts(e: Extract<GameEvent, { kind: 'versusChantPowerResolved' }>): void {
    const winnerSeat = e.winnerSeatIndex;
    const fromRect = snapshotRect(`[data-seat-index="${winnerSeat}"]`);
    if (!fromRect) return;
    for (const gift of e.gifts) {
      const toRect = snapshotRect(`[data-seat-index="${gift.recipientSeatIndex}"]`);
      if (!toRect) continue;
      const recipient = game.value.players[gift.recipientSeatIndex];
      if (!recipient) continue;
      for (const cardId of gift.cardIds) {
        const card = recipient.hand.find((c) => c.id === cardId);
        // Show the card face only when the human can plausibly want to see it: when
        // the recipient is the human (their new card lands face-up in their fan).
        const revealFace = !recipient.isAI && !!card;
        pendingFlights.value.push({
          id: nextFlightId++,
          kind: 'draw',
          cardId,
          faceUrl: card?.assetPath ?? '',
          fromRect,
          toRect,
          revealFace,
        });
      }
    }
  }

  function queueFlightForPlay(e: Extract<GameEvent, { kind: 'versusPlay' | 'soloSlam' }>): void {
    if (e.kind === 'versusPlay') {
      const sourceSeat = game.value.players.findIndex((p) => p.id === e.playerId);
      const fromRect = snapshotRect(`[data-seat-index="${sourceSeat}"]`);
      const toRect = snapshotRect(`[data-seat-index="${e.targetSeatIndex}"]`);
      if (!fromRect || !toRect) return;
      const target = game.value.players[e.targetSeatIndex];
      const card = target?.promptStack.find((c) => c.id === e.cardId);
      if (!card) return;
      pendingFlights.value.push({
        id: nextFlightId++,
        kind: 'play-versus',
        cardId: e.cardId,
        faceUrl: card.assetPath,
        fromRect,
        toRect,
        shoutWord: e.cardWord,
        shoutSeatIndex: sourceSeat,
      });
    } else {
      const human = game.value.players.find((p) => !p.isAI);
      if (!human) return;
      const fromRect = snapshotRect(`[data-seat-index="${human.seatIndex}"]`);
      const toRect = snapshotRect(`[data-base-id="${e.baseSide}"]`);
      if (!fromRect || !toRect) return;
      const pile = game.value.soloBases[e.baseSide];
      const card = pile.find((c) => c.id === e.cardId);
      if (!card) return;
      pendingFlights.value.push({
        id: nextFlightId++,
        kind: 'play-solo',
        cardId: e.cardId,
        faceUrl: card.assetPath,
        fromRect,
        toRect,
        shoutWord: e.cardWord,
        shoutSeatIndex: human.seatIndex,
        baseSide: e.baseSide,
      });
    }
  }

  function queueFlightForDraw(e: Extract<GameEvent, { kind: 'versusDraw' | 'soloDraw' }>): void {
    if (!e.cardId) return; // empty-pile "pass" — nothing to fly

    const recipientId = e.kind === 'versusDraw' ? e.playerId : 'p1';
    const recipient = game.value.players.find((p) => p.id === recipientId);
    if (!recipient) return;

    // Source: Fetch draws come FROM the Fetch owner's seat; everything else from the deck.
    let fromRect: DOMRect | null;
    if (e.kind === 'versusDraw' && e.from === 'hand' && e.fromPlayerId) {
      const ownerSeat = game.value.players.find((p) => p.id === e.fromPlayerId)?.seatIndex;
      if (ownerSeat == null) return;
      fromRect = snapshotRect(`[data-seat-index="${ownerSeat}"]`);
    } else {
      fromRect = snapshotRect('[data-base-id="deck"]');
    }
    const toRect = snapshotRect(`[data-seat-index="${recipient.seatIndex}"]`);
    if (!fromRect || !toRect) return;

    // The engine adds the drawn card to player.hand BEFORE emitting versusDraw, so this
    // lookup succeeds for both pile and Fetch draws. Use it to pull the assetPath and to
    // gate the mid-flight face-reveal: only the human-drawer sees what they drew.
    const card = recipient.hand.find((c) => c.id === e.cardId);
    const revealFace = !recipient.isAI && !!card;
    pendingFlights.value.push({
      id: nextFlightId++,
      kind: 'draw',
      cardId: e.cardId,
      faceUrl: card?.assetPath ?? '',
      fromRect,
      toRect,
      revealFace,
    });
  }

  const handleEvent = (e: GameEvent) => {
    state.version++;
    switch (e.kind) {
      case 'soloSlam':
      case 'versusPlay': {
        lastPlayedVirtualPos.value = game.value.chant.virtualPos;
        const pid = e.kind === 'versusPlay' ? e.playerId : 'p1';
        if (isHumanEvent(pid)) beatAudio.fx('success');
        // BEAT ding on every play. If a card lands in front of the HUMAN (their turn is
        // now next), use the HIGH ding as a heads-up that they're up; otherwise use the
        // MIDDLE ding so each opponent-on-opponent play still has audible rhythm and the
        // player can track who got hit.
        if (e.kind === 'versusPlay') {
          const target = game.value.players[e.targetSeatIndex];
          const targetIsHuman = !!target && !target.isAI;
          beatAudio.ding(targetIsHuman ? 'high' : 'middle');
        }
        // Solo combo streak — every successful slam pulses the streak: increment +
        // refill the depletion bar. Penalties break the streak (see soloPenalty
        // handler below). Drawing is neutral so the bar keeps depleting between
        // forced draws.
        if (e.kind === 'soloSlam') pulseStreak();
        // Snapshot flight geometry synchronously — before Vue's re-render shifts the
        // source seat's bounding box. The Game.emit happens after the card has moved
        // into its destination, so we can find the card on the target side too.
        queueFlightForPlay(e);
        break;
      }
      case 'versusDraw':
      case 'soloDraw': {
        queueFlightForDraw(e);
        break;
      }
      case 'soloPenalty':
        if (modeCaps(mode.value).isTimeAttack) {
          soloPenaltyMs.value += e.penaltyMs;
          beatAudio.fx('fail');
          // Mistake → end the streak immediately. finalizeStreak() awards any
          // pending bonus first, then resets.
          finalizeStreak();
        }
        break;
      case 'soloBonus':
        if (modeCaps(mode.value).isTimeAttack) {
          soloBonusMs.value += e.bonusMs;
          // High-pitch ding to differentiate bonus from the regular slam success.
          beatAudio.ding('high');
        }
        break;
      case 'chantAdvanced':
        chantVirtualPos.value = game.value.chant.virtualPos;
        break;
      case 'versusTurnChanged':
        activeSeatIndex.value = e.seatIndex;
        break;
      case 'versusSnapDrawnAvailable':
        pendingSnapDraw.value = { playerId: e.playerId, cardId: e.cardId };
        break;
      case 'versusSnapDrawnPlayed':
        pendingSnapDraw.value = null;
        break;
      case 'versusBeatPickerChanged':
        currentBeatPickerSeat.value = e.seatIndex;
        setupPhase.value = game.value.setupPhase;
        beatOwners.value = new Map(game.value.beatOwners);
        beatsBySeat.value = game.value.beatsOwnedBySeat();
        break;
      case 'versusBeatClaimed':
        beatOwners.value = new Map(game.value.beatOwners);
        beatsBySeat.value = game.value.beatsOwnedBySeat();
        break;
      case 'versusSetupCompleted':
        setupPhase.value = 'play';
        currentBeatPickerSeat.value = null;
        break;
      case 'versusChantTriggered': {
        chantTrigger.value = {
          active: true,
          sourceSeatIndex: e.sourceSeatIndex,
          receiverSeatIndex: e.receiverSeatIndex,
          total: e.total,
          landedBeat: e.landedBeat,
          winnerSeatIndex: e.winnerSeatIndex,
          perSeatCounts: e.perSeatCounts,
        };
        chantRecitalStepsBySeat.value = new Map();
        recitalShouts.value = {};
        chantRecitalCurrentSeat.value = null;
        chantRecitalCurrentBeat.value = null;
        chantRecitalTick.value = 0;
        chantRevealWinnerSeat.value = null;
        chantRevealNoWinner.value = false;
        // No-winner: no chant-power-resolve will fire, so we tear down the overlay
        // ourselves after the recital plus a short tail so the landed banner is seen.
        // Also release the engine's AI gate once the tail completes — the engine had
        // already setActiveSeat'd the receiver synchronously, but we hold the AI back
        // until the player has actually SEEN the recital land.
        if (e.winnerSeatIndex === null) {
          const stepMs = recitalStepMs.value;
          const recitalMs = stepMs === 0 ? 0 : e.total * stepMs;
          // Right as the recital lands on the (unclaimed) beat: surface the
          // "No beat owner" subtitle and play the penalty fail sound so the
          // player gets a clear "nothing happened" cue.
          window.setTimeout(() => {
            chantRevealNoWinner.value = true;
            beatAudio.fx('fail');
          }, recitalMs);
          window.setTimeout(() => {
            chantTrigger.value = null;
            chantRecitalStepsBySeat.value = new Map();
            chantRecitalCurrentSeat.value = null;
            chantRecitalCurrentBeat.value = null;
            chantRecitalTick.value = 0;
            chantRevealNoWinner.value = false;
            recitalShouts.value = {};
            (game.value.endChantTriggerWindow?.());
          }, recitalMs + 1100);
        } else {
          // Winner branch — schedule the burst-confetti reveal at recital end so it
          // bursts AT the moment the lottery freezes on the winning beat, not while
          // the recital is still spinning.
          const stepMs = recitalStepMs.value;
          const recitalMs = stepMs === 0 ? 0 : e.total * stepMs;
          const winnerSeat = e.winnerSeatIndex;
          window.setTimeout(() => {
            chantRevealWinnerSeat.value = winnerSeat;
          }, recitalMs);
        }
        break;
      }
      case 'versusChantRecitedBeat': {
        // Per-step animation: defer each step by the user's recital-speed step ms so
        // the bubbles + pip rows animate sequentially. Speed = 'skip' fires immediately.
        const stepDelayMs = recitalStepMs.value;
        const { seatIndex, beatWord, step } = e;
        const apply = () => {
          const next = new Map(chantRecitalStepsBySeat.value);
          next.set(seatIndex, (next.get(seatIndex) ?? 0) + 1);
          chantRecitalStepsBySeat.value = next;
          chantRecitalCurrentSeat.value = seatIndex;
          chantRecitalCurrentBeat.value = beatWord;
          // Bump the per-step tick so the lottery banner's <Transition> key
          // changes even when consecutive steps land on the same beat word
          // (e.g. closing chik → opening chik). Without this, the slot-machine
          // flip animation silently skips those repeats.
          chantRecitalTick.value = step + 1;
          const prevKey = recitalShouts.value[seatIndex]?.key ?? 0;
          recitalShouts.value = {
            ...recitalShouts.value,
            [seatIndex]: { word: beatWord, key: prevKey + 1 },
          };
        };
        if (stepDelayMs === 0) apply(); else window.setTimeout(apply, step * stepDelayMs);
        break;
      }
      case 'versusChantPowerAwarded': {
        // The engine sets pendingChantPower synchronously, but we hold the UI mirror
        // back until the recital animation completes so the user sees the chant land
        // before the give-cards picker appears. SimulationController watches the same
        // delay via its own queue so AI auto-resolve doesn't pre-empt the recital.
        const stepMs = recitalStepMs.value;
        const trigger = chantTrigger.value;
        const recitalMs = trigger && stepMs > 0 ? trigger.total * stepMs : 0;
        const awardEvent = e;
        window.setTimeout(() => {
          pendingChantPower.value = {
            winnerSeatIndex: awardEvent.winnerSeatIndex,
            receiverSeatIndex: awardEvent.receiverSeatIndex,
            chantChikId: '',
          };
        }, recitalMs + (stepMs === 0 ? 200 : 800));
        break;
      }
      case 'versusChantPowerResolved':
        pendingChantPower.value = null;
        // Animate the gifted cards flying from winner → recipients. Snap rects now,
        // before the recipient hand re-fans on the next render and the seat anchor
        // shifts. Reuses the standard 'draw' flight kind.
        queueFlightsForChantGifts(e);
        // Tear down the trigger overlay after a brief beat so the landed banner is
        // seen. Also release the engine's AI cooldown gate so SimulationController
        // resumes scheduling normal AI ticks. Without this, the no-winner & winner
        // branches would diverge: winner case has pendingChantPower handling the
        // timing, but the cleanup tail itself was unguarded — AI could fire plays
        // and shout bubbles before the trigger overlay finished fading.
        window.setTimeout(() => {
          chantTrigger.value = null;
          chantRecitalStepsBySeat.value = new Map();
          chantRecitalCurrentSeat.value = null;
          chantRecitalCurrentBeat.value = null;
          chantRecitalTick.value = 0;
          chantRevealWinnerSeat.value = null;
          chantRevealNoWinner.value = false;
          recitalShouts.value = {};
          (game.value.endChantTriggerWindow?.());
        }, 600);
        break;
      case 'versusStrictPenalty':
        // Same fail sting Solo penalties use — fires for ANY player so the human
        // can hear when an AI fumbles too (otherwise penalties are easy to miss).
        beatAudio.fx('fail');
        break;
      case 'winner':
        if (modeCaps(mode.value).isTimeAttack) {
          stopSoloTimer();
          // Cash in any in-flight streak before computing the final time. Without
          // this, a player who finished the round mid-streak would lose the
          // accumulated bonus to the bar's eventual depletion (which never fires
          // after the game ends).
          finalizeStreak();
          const final = Math.max(0, soloElapsedMs.value + soloPenaltyMs.value - soloBonusMs.value);
          soloLastFinalMs.value = final;
          if (soloBestTimeMs.value === null || final < soloBestTimeMs.value) {
            soloBestTimeMs.value = final;
            soloIsNewBest.value = true;
            saveSoloBestTime(final);
          } else {
            soloIsNewBest.value = false;
          }
        }
        break;
    }
    state.events.push(e);
    if (state.events.length > MAX_LOG) state.events.splice(0, state.events.length - MAX_LOG);
    triggerRef(game);
  };

  const handleStatus = (s: SimStatus) => {
    state.status = s;
    state.version++;
    if (modeCaps(mode.value).isTimeAttack) {
      if (s === 'running') startSoloTimer();
      else stopSoloTimer();
    }
  };

  const initGame = () => {
    if (unsubGame) unsubGame();
    if (unsubStatus) unsubStatus();
    controller.value.stop();
    state.events = [];
    state.version = 0;
    state.status = 'idle';
    chantVirtualPos.value = 0;
    lastPlayedVirtualPos.value = null;
    activeSeatIndex.value = -1;
    stopSoloTimer();
    soloElapsedMs.value = 0;
    soloPenaltyMs.value = 0;
    soloBonusMs.value = 0;
    soloLastFinalMs.value = null;
    soloIsNewBest.value = false;
    // Streak — cancel raf and zero everything so a new round starts clean.
    if (soloStreakRafId !== null) { cancelAnimationFrame(soloStreakRafId); soloStreakRafId = null; }
    soloStreak.value = 0;
    soloStreakBarMs.value = 0;
    soloLastStreakBonus.value = null;
    pendingFlights.value = [];
    pendingSnapDraw.value = null;
    setupPhase.value = 'play';
    beatOwners.value = new Map();
    beatsBySeat.value = new Map();
    currentBeatPickerSeat.value = null;
    chantTrigger.value = null;
    chantRecitalStepsBySeat.value = new Map();
    recitalShouts.value = {};
    chantRecitalCurrentSeat.value = null;
    chantRecitalCurrentBeat.value = null;
    chantRecitalTick.value = 0;
    chantRevealWinnerSeat.value = null;
    chantRevealNoWinner.value = false;
    pendingChantPower.value = null;

    const g = new Game();
    const ctrl = new SimulationController(g);
    ctrl.setOptions({ speed: speed.value });
    ctrl.setMode(mode.value);
    ctrl.setAiSkill(aiSkill.value);
    ctrl.setRecitalPacing(recitalStepMs.value);
    g.setStrictPromptsEnabled(strictPrompts.value);
    unsubGame = g.on(handleEvent);
    unsubStatus = ctrl.onStatusChange(handleStatus);
    game.value = g;
    controller.value = ctrl;

    // Per-mode setup dispatch. This is intentionally a switch on mode identity (not
    // capability flags) because each mode's setup signature differs — buildSoloDeck
    // takes nothing, setupVersus takes playerCount, setupPlayground takes the custom
    // PlaygroundSetup. Adding a new mode = add a case here and a row to MODE_CAPS.
    const assignTurnBasedSeats = () => {
      // Seat 0 is the human; everyone else is AI.
      for (let i = 0; i < g.players.length; i++) {
        ctrl.setPlayerHuman(g.players[i].id, i === 0);
      }
      activeSeatIndex.value = g.activeSeatIndex;
    };
    switch (mode.value) {
      case 'solo':
        g.setupSolo();
        break;
      case 'playground':
        // setupPlayground throws on invalid combos (Free < 7, deck too small for
        // players × handSize). We surface that as an idle game with no players;
        // the UI shows the central Start CTA but hitting Start fails until the
        // composition is fixed via Settings.
        try {
          g.setupPlayground({
            playerCount: playerCount.value,
            handSize: playgroundHandSize.value,
            composition: playgroundComposition.value,
          });
          assignTurnBasedSeats();
        } catch (err) {
          console.warn('[playground] setup rejected:', (err as Error).message);
        }
        break;
      case 'versus':
        g.setupVersus(playerCount.value);
        assignTurnBasedSeats();
        break;
    }

    // Reactive proxy hand / promptStack / drawPile / soloBases so in-place mutations trigger renders.
    for (const p of g.players) {
      p.hand = reactive(p.hand) as Card[];
      p.promptStack = reactive(p.promptStack) as Card[];
    }
    g.drawPile = reactive(g.drawPile) as Card[];
    g.soloBases = reactive(g.soloBases) as Game['soloBases'];

    // Mirror v1.2 setup state into the reactive refs so templates have it right away.
    setupPhase.value = g.setupPhase;
    beatOwners.value = new Map(g.beatOwners);
    beatsBySeat.value = g.beatsOwnedBySeat();
    currentBeatPickerSeat.value = g.setupPhase === 'beat-selection'
      ? (g.players.find((p) => p.id === g.currentBeatPicker())?.seatIndex ?? null)
      : null;

    triggerRef(game);
    triggerRef(controller);
  };

  const start = () => {
    controller.value.start();
    if (modeCaps(mode.value).isTimeAttack) startSoloTimer();
  };
  const pause = () => controller.value.pause();
  const resume = () => controller.value.resume();
  const setSpeed = (s: number) => {
    speed.value = s;
    controller.value.setOptions({ speed: s });
  };
  const setPlayerCount = (n: number) => {
    playerCount.value = Math.max(3, Math.min(6, n));
  };
  let lastNonSoloPlayerCount = initialMode === 'solo' ? 4 : playerCount.value;
  const setPlayerHuman = (id: PlayerId, isHuman: boolean) => {
    controller.value.setPlayerHuman(id, isHuman);
    state.version++;
    triggerRef(game);
  };

  /** Solo player input. Time-attack modes auto-start on the first action; everything
   *  else requires an explicit Start (controller already running). */
  const submitSoloAction = (action: SoloAction) => {
    const startsOnFirstAction = modeCaps(mode.value).isTimeAttack && state.status === 'idle';
    if (state.status !== 'running' && !startsOnFirstAction) return;
    beatAudio.fx('tap');
    if (startsOnFirstAction) start();
    game.value.submitSoloAction(action);
  };

  /** Versus human player input. */
  const submitVersusAction = (playerId: PlayerId, action: VersusAction) => {
    if (state.status !== 'running') return;
    beatAudio.fx('tap');
    controller.value.submitVersusHumanAction(playerId, action);
  };

  /** Human's snap-drawn target choice. Pass the seat index the snap should land on.
   *  Standard mode accepts only the left/right neighbours; strict mode accepts any
   *  non-self seat. The "Keep" option was deliberately removed — the holder must play
   *  a matching drawn Snap (matches the rulebook's emphasis on the Snap superpower). */
  const submitSnapPlay = (playerId: PlayerId, targetSeatIndex: number) => {
    if (state.status !== 'running') return;
    beatAudio.fx('tap');
    controller.value.submitVersusHumanAction(playerId, { type: 'snap-play', targetSeatIndex });
  };

  /** Human's beat pick during setup. */
  const submitBeatClaim = (playerId: PlayerId, beat: ChantWord) => {
    if (state.status !== 'running') return;
    beatAudio.fx('tap');
    controller.value.submitVersusHumanAction(playerId, { type: 'claim-beat', beat });
  };

  /** Human's chant-power give-cards decision. */
  const submitChantPowerResolve = (playerId: PlayerId, gifts: ChantPowerGift[]) => {
    if (state.status !== 'running') return;
    beatAudio.fx('tap');
    controller.value.submitVersusHumanAction(playerId, { type: 'chant-power-resolve', gifts });
  };

  const setMode = (m: SimMode) => {
    if (mode.value === m) return;
    const wasSingleSeat = modeCaps(mode.value).isSingleSeat;
    const isSingleSeat = modeCaps(m).isSingleSeat;
    if (isSingleSeat && !wasSingleSeat) {
      lastNonSoloPlayerCount = playerCount.value;
      playerCount.value = 1;
    } else if (!isSingleSeat && wasSingleSeat) {
      playerCount.value = lastNonSoloPlayerCount;
    }
    mode.value = m;
    initGame();
  };

  const setAudioMuted = (muted: boolean) => {
    beatAudio.setMuted(muted);
  };

  // Start fresh.
  initGame();

  // Auto-pause on app background.
  let appStateRemove: (() => void) | null = null;
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive && state.status === 'running') controller.value.pause();
  }).then((handle) => {
    appStateRemove = () => { void handle.remove(); };
  });

  onUnmounted(() => {
    controller.value.stop();
    stopSoloTimer();
    appStateRemove?.();
    if (unsubGame) unsubGame();
    if (unsubStatus) unsubStatus();
  });

  return {
    game,
    controller,
    state,
    playerCount,
    speed,
    mode,
    activeSeatIndex,
    audioMuted: beatAudio.audioMuted,
    chantVirtualPos,
    lastPlayedVirtualPos,
    soloElapsedMs,
    soloPenaltyMs,
    soloBonusMs,
    soloStreak,
    soloStreakBarMs,
    soloStreakBarMaxMs: STREAK_BAR_MS,
    soloLastStreakBonus,
    soloRunning,
    soloBestTimeMs,
    soloLastFinalMs,
    soloIsNewBest,
    pendingFlights,
    initGame,
    start,
    pause,
    resume,
    setSpeed,
    setPlayerCount,
    setPlayerHuman,
    setMode,
    setAudioMuted,
    wispEnabled,
    setWispEnabled,
    eventLogEnabled,
    setEventLogEnabled,
    guideOnTablePref,
    setGuideOnTable,
    strictPrompts,
    setStrictPrompts,
    aiSkill,
    setAiSkill,
    promptSize,
    setPromptSize,
    playgroundComposition,
    setPlaygroundComposition,
    setPlaygroundPromptCount,
    playgroundHandSize,
    setPlaygroundHandSize,
    resetPlaygroundDefaults,
    resetGeneralDefaults,
    pendingSnapDraw,
    submitSnapPlay,
    submitSoloAction,
    submitVersusAction,
    // v1.2 additions
    setupPhase,
    beatOwners,
    beatsBySeat,
    currentBeatPickerSeat,
    chantTrigger,
    chantRecitalStepsBySeat,
    chantRecitalCurrentSeat,
    chantRecitalCurrentBeat,
    chantRecitalTick,
    chantRevealWinnerSeat,
    chantRevealNoWinner,
    chantStartStepBySeat,
    recitalShouts,
    pendingChantPower,
    submitBeatClaim,
    submitChantPowerResolve,
    promptInfoSize,
    setPromptInfoSize,
    chantRecitalSpeed,
    setChantRecitalSpeed,
  };
}

export type UseGame = ReturnType<typeof useGame>;
