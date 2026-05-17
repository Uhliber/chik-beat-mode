import { onUnmounted, reactive, ref, shallowRef, triggerRef } from 'vue';
import { App as CapApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import type { Card } from '@/game/Card';
import { Game } from '@/game/Game';
import { SimulationController, type SimStatus, type SimMode, type AiSkillLevel } from '@/game/SimulationController';
import type { BaseSide, CardPrompt, ChantWord, GameEvent, PlayerId, PlaygroundComposition, SoloAction, VersusAction } from '@/game/types';
import { modeCaps } from '@/game/modes';
import { useBeatAudio } from './useBeatAudio';

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

const SOLO_BEST_KEY = 'chik-solo-best-time-ms';
const WISP_ENABLED_KEY = 'chik-wisp-enabled';
const STRICT_PROMPTS_KEY = 'chik-strict-prompts';
const AI_SKILL_KEY = 'chik-ai-skill';
const PLAYGROUND_COMPOSITION_KEY = 'chik-playground-composition';
const PLAYGROUND_HAND_SIZE_KEY = 'chik-playground-hand-size';
const PROMPT_SIZE_KEY = 'chik-prompt-size';
const EVENT_LOG_ENABLED_KEY = 'chik-event-log-enabled';
const GUIDE_ON_TABLE_KEY = 'chik-guide-on-table';

/** Visible-size preset for the ACTIVE prompt card (Solo's last-played card, and each
 *  Versus seat's top promptStack card). Medium is the canonical default; Extra Large
 *  crops the bottom half of the card with a soft mask so it dominates the table without
 *  overflowing layouts. */
export type PromptSize = 'small' | 'medium' | 'large' | 'xl';
const DEFAULT_PROMPT_SIZE: PromptSize = 'medium';
const PROMPT_SIZE_VALUES: readonly PromptSize[] = ['small', 'medium', 'large', 'xl'] as const;

const DEFAULT_PLAYGROUND_COMPOSITION: PlaygroundComposition = {
  right: 14, left: 14, free: 7, stop: 7, snap: 7, fetch: 7,
};
const DEFAULT_PLAYGROUND_HAND_SIZE = 7;

async function loadSoloBestTime(): Promise<number | null> {
  try {
    const { value } = await Preferences.get({ key: SOLO_BEST_KEY });
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function saveSoloBestTime(ms: number): void {
  void Preferences.set({ key: SOLO_BEST_KEY, value: String(Math.round(ms)) }).catch(() => undefined);
}

async function loadWispEnabled(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: WISP_ENABLED_KEY });
    if (value === null || value === undefined) return true; // default on
    return value === '1' || value === 'true';
  } catch {
    return true;
  }
}

function saveWispEnabled(on: boolean): void {
  void Preferences.set({ key: WISP_ENABLED_KEY, value: on ? '1' : '0' }).catch(() => undefined);
}

async function loadEventLogEnabled(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: EVENT_LOG_ENABLED_KEY });
    if (value === null || value === undefined) return true; // default on
    return value === '1' || value === 'true';
  } catch {
    return true;
  }
}

function saveEventLogEnabled(on: boolean): void {
  void Preferences.set({ key: EVENT_LOG_ENABLED_KEY, value: on ? '1' : '0' }).catch(() => undefined);
}

/** Guide-on-table preference is tri-state: explicitly true, explicitly false, or "not
 *  set" (null) — when null, the consumer falls back to a platform-aware default
 *  (desktop = on, mobile = off). Returning null lets PlayView pick the right default
 *  without baking the responsive check into the persistence layer. */
async function loadGuideOnTable(): Promise<boolean | null> {
  try {
    const { value } = await Preferences.get({ key: GUIDE_ON_TABLE_KEY });
    if (value === null || value === undefined) return null;
    return value === '1' || value === 'true';
  } catch {
    return null;
  }
}

function saveGuideOnTable(on: boolean): void {
  void Preferences.set({ key: GUIDE_ON_TABLE_KEY, value: on ? '1' : '0' }).catch(() => undefined);
}

async function loadStrictPrompts(): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: STRICT_PROMPTS_KEY });
    if (value === null || value === undefined) return false; // default OFF
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

function saveStrictPrompts(on: boolean): void {
  void Preferences.set({ key: STRICT_PROMPTS_KEY, value: on ? '1' : '0' }).catch(() => undefined);
}

async function loadAiSkill(): Promise<AiSkillLevel> {
  try {
    const { value } = await Preferences.get({ key: AI_SKILL_KEY });
    const n = Number(value);
    if (n === 1 || n === 2 || n === 3 || n === 4) return n;
    return 3; // default: Hard
  } catch {
    return 3;
  }
}

function saveAiSkill(level: AiSkillLevel): void {
  void Preferences.set({ key: AI_SKILL_KEY, value: String(level) }).catch(() => undefined);
}

async function loadPlaygroundComposition(): Promise<PlaygroundComposition> {
  try {
    const { value } = await Preferences.get({ key: PLAYGROUND_COMPOSITION_KEY });
    if (!value) return { ...DEFAULT_PLAYGROUND_COMPOSITION };
    const parsed = JSON.parse(value) as Partial<PlaygroundComposition>;
    return { ...DEFAULT_PLAYGROUND_COMPOSITION, ...parsed };
  } catch {
    return { ...DEFAULT_PLAYGROUND_COMPOSITION };
  }
}

function savePlaygroundComposition(comp: PlaygroundComposition): void {
  void Preferences.set({ key: PLAYGROUND_COMPOSITION_KEY, value: JSON.stringify(comp) }).catch(() => undefined);
}

async function loadPlaygroundHandSize(): Promise<number> {
  try {
    const { value } = await Preferences.get({ key: PLAYGROUND_HAND_SIZE_KEY });
    const n = Number(value);
    if (Number.isFinite(n) && n >= 3 && n <= 14) return Math.round(n);
    return DEFAULT_PLAYGROUND_HAND_SIZE;
  } catch {
    return DEFAULT_PLAYGROUND_HAND_SIZE;
  }
}

function savePlaygroundHandSize(n: number): void {
  void Preferences.set({ key: PLAYGROUND_HAND_SIZE_KEY, value: String(n) }).catch(() => undefined);
}

async function loadPromptSize(): Promise<PromptSize> {
  try {
    const { value } = await Preferences.get({ key: PROMPT_SIZE_KEY });
    if (value && (PROMPT_SIZE_VALUES as readonly string[]).includes(value)) {
      return value as PromptSize;
    }
    return DEFAULT_PROMPT_SIZE;
  } catch {
    return DEFAULT_PROMPT_SIZE;
  }
}
function savePromptSize(v: PromptSize): void {
  void Preferences.set({ key: PROMPT_SIZE_KEY, value: v }).catch(() => undefined);
}

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
  const playerCount = ref(initialMode === 'solo' ? 1 : 4);
  const speed = ref(1);
  const mode = ref<SimMode>(initialMode);
  const beatAudio = useBeatAudio();

  // ---- Solo timer state ----
  const soloElapsedMs = ref(0);
  const soloPenaltyMs = ref(0);
  const soloRunning = ref(false);
  const soloBestTimeMs = ref<number | null>(null);
  const soloLastFinalMs = ref<number | null>(null);
  const soloIsNewBest = ref(false);
  void loadSoloBestTime().then((ms) => {
    if (ms !== null) soloBestTimeMs.value = ms;
  });

  // Turn-indicator wisp (Versus only). Persisted, default ON.
  const wispEnabled = ref(true);
  void loadWispEnabled().then((on) => { wispEnabled.value = on; });
  const setWispEnabled = (on: boolean) => {
    wispEnabled.value = on;
    saveWispEnabled(on);
  };

  // Event log visibility (desktop sidebar + mobile sheet). Persisted, default ON.
  const eventLogEnabled = ref(true);
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
  const strictPrompts = ref(false);
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
  const aiSkill = ref<AiSkillLevel>(3);
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

  /**
   * Reactive mirror of game.pendingSnapDraw so the UI can show the Left/Right chooser
   * to the human. Updated synchronously inside handleEvent on versusSnapDrawnAvailable
   * (and cleared on snap-played / kept).
   */
  const pendingSnapDraw = ref<{ playerId: PlayerId; cardId: string } | null>(null);
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
      case 'versusStrictPenalty':
        // Same fail sting Solo penalties use — fires for ANY player so the human
        // can hear when an AI fumbles too (otherwise penalties are easy to miss).
        beatAudio.fx('fail');
        break;
      case 'winner':
        if (modeCaps(mode.value).isTimeAttack) {
          stopSoloTimer();
          const final = soloElapsedMs.value + soloPenaltyMs.value;
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
    soloLastFinalMs.value = null;
    soloIsNewBest.value = false;
    pendingFlights.value = [];
    pendingSnapDraw.value = null;

    const g = new Game();
    const ctrl = new SimulationController(g);
    ctrl.setOptions({ speed: speed.value });
    ctrl.setMode(mode.value);
    ctrl.setAiSkill(aiSkill.value);
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
    pendingSnapDraw,
    submitSnapPlay,
    submitSoloAction,
    submitVersusAction,
  };
}

export type UseGame = ReturnType<typeof useGame>;
