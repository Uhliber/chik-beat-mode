import { onUnmounted, reactive, ref, shallowRef, triggerRef } from 'vue';
import { App as CapApp } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import type { Card } from '@/game/Card';
import { Game } from '@/game/Game';
import { SimulationController, type SimStatus, type SimMode } from '@/game/SimulationController';
import type { BaseSide, ChantWord, GameEvent, PlayerId, SoloAction, VersusAction } from '@/game/types';
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
        if (mode.value === 'solo') {
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
      case 'winner':
        if (mode.value === 'solo') {
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
    if (mode.value === 'solo') {
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

    const g = new Game();
    const ctrl = new SimulationController(g);
    ctrl.setOptions({ speed: speed.value });
    ctrl.setMode(mode.value);
    unsubGame = g.on(handleEvent);
    unsubStatus = ctrl.onStatusChange(handleStatus);
    game.value = g;
    controller.value = ctrl;

    if (mode.value === 'solo') {
      g.setupSolo();
    } else {
      g.setupVersus(playerCount.value);
      // Seat 0 is the human in Versus; everyone else AI.
      for (let i = 0; i < g.players.length; i++) {
        ctrl.setPlayerHuman(g.players[i].id, i === 0);
      }
      activeSeatIndex.value = g.activeSeatIndex;
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
    if (mode.value === 'solo') startSoloTimer();
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

  /** Solo player input. */
  const submitSoloAction = (action: SoloAction) => {
    const isSoloIdleStart = mode.value === 'solo' && state.status === 'idle';
    if (state.status !== 'running' && !isSoloIdleStart) return;
    beatAudio.fx('tap');
    if (isSoloIdleStart) start();
    game.value.submitSoloAction(action);
  };

  /** Versus human player input. */
  const submitVersusAction = (playerId: PlayerId, action: VersusAction) => {
    if (state.status !== 'running') return;
    beatAudio.fx('tap');
    controller.value.submitVersusHumanAction(playerId, action);
  };

  const setMode = (m: SimMode) => {
    if (mode.value === m) return;
    if (m === 'solo') {
      lastNonSoloPlayerCount = playerCount.value;
      playerCount.value = 1;
    } else if (mode.value === 'solo') {
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
    submitSoloAction,
    submitVersusAction,
  };
}

export type UseGame = ReturnType<typeof useGame>;
