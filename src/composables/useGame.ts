import { reactive, ref, shallowRef, triggerRef } from 'vue';
import { Preferences } from '@capacitor/preferences';
import type { Card } from '@/game/Card';
import { Game } from '@/game/Game';
import { SimulationController, type SimStatus, type SimMode } from '@/game/SimulationController';
import type { GameEvent, PlayerId } from '@/game/types';
import { useBeatAudio } from './useBeatAudio';

const SOLO_BEST_KEY = 'chik-solo-best-time-ms';

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
  // Fire-and-forget — Preferences.set is async but the persisted value is non-critical
  // for the current frame. Errors are swallowed so a Preferences failure can never crash
  // the win-detection codepath.
  void Preferences.set({ key: SOLO_BEST_KEY, value: String(Math.round(ms)) }).catch(() => undefined);
}

export interface UseGameOptions {
  /** Mode the game starts in. Defaults to 'simulation'. */
  initialMode?: SimMode;
}

export interface GameViewState {
  /** Reactive copy of game state — incremented to force re-reads on each event. */
  version: number;
  status: SimStatus;
  events: GameEvent[];
  recentSlam: { playerId: PlayerId; cardId: string; word: string } | null;
}

const MAX_LOG = 50;

export function useGame(opts: UseGameOptions = {}) {
  const initialMode: SimMode = opts.initialMode ?? 'simulation';

  const game = shallowRef<Game>(new Game());
  const controller = shallowRef<SimulationController>(new SimulationController(game.value));

  const state = reactive<GameViewState>({
    version: 0,
    status: 'idle',
    events: [],
    recentSlam: null,
  });

  // Solo runs at 1 seat; everything else defaults to 4. Mirrors setMode's solo-vs-not
  // playerCount swap so PlayView mounts with the right table size on first render.
  const playerCount = ref(initialMode === 'solo' ? 1 : 4);
  const failureRate = ref(0.15);
  const speed = ref(1);
  /** Simulation (free-for-all) vs. Play (BEAT mode, human auto-seated as P1). */
  const mode = ref<SimMode>(initialMode);
  /** Active beat seat in Play mode (-1 outside Play / pre-open). */
  const activeBeatSeatIndex = ref<number>(-1);
  /** Tick index within the active player's turn (0..beatsPerPlayer-1; -1 outside Play). */
  const activeBeatTickIndex = ref<number>(-1);
  /** Total ticks in the current turn (mirrors controller, used by HUD dots). */
  const activeBeatTotalTicks = ref<number>(5);
  /** Slider: how many metronome ticks per player turn. Default 5. */
  const beatsPerPlayer = ref<number>(5);
  const beatAudio = useBeatAudio();
  // ---------------------------------------------------------------------------
  // SOLO MODE state — time-attack timer + accumulated +2s penalties + persisted best.
  // The display value is `soloElapsedMs + soloPenaltyMs`; the RAF loop only mutates
  // `soloElapsedMs` so penalty hits jump the clock immediately without timer drift.
  // ---------------------------------------------------------------------------
  const soloElapsedMs = ref(0);
  const soloPenaltyMs = ref(0);
  const soloRunning = ref(false);
  const soloBestTimeMs = ref<number | null>(null);
  const soloLastFinalMs = ref<number | null>(null);
  const soloIsNewBest = ref(false);
  // Hydrate the persisted best time from Capacitor Preferences. Async — the UI shows
  // "—" until this resolves, which is fine since the only writer (winner handler) only
  // runs after the player has been on the table long enough to read the value.
  void loadSoloBestTime().then((ms) => {
    if (ms !== null) soloBestTimeMs.value = ms;
  });
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

  /** Continuous (non-wrapping) virtual position of the chant — drives the ticker animation. */
  const chantVirtualPos = ref(0);
  /**
   * Virtual position of the most-recently-played beat (the one currently highlighted on the
   * table). null until the first slam. This drives the ticker's CENTER cell, so it always
   * matches whatever card is glowing on the table.
   */
  const lastPlayedVirtualPos = ref<number | null>(null);

  let unsubGame: (() => void) | null = null;
  let unsubStatus: (() => void) | null = null;

  const handleEvent = (e: GameEvent) => {
    state.version++;
    if (e.kind === 'slam') {
      state.recentSlam = { playerId: e.playerId, cardId: e.cardId, word: e.shoutedWord };
      // 'slam' is emitted BEFORE the chant moves, so chant.virtualPos here = the beat
      // that was just played. We capture it for the ticker's center cell.
      lastPlayedVirtualPos.value = game.value.chant.virtualPos;
    }
    if (e.kind === 'chantAdvanced' || e.kind === 'chantReversed') {
      // The chant has already moved on the Game side; mirror its virtualPos here so
      // ChantTicker's slide animation triggers via Vue reactivity.
      chantVirtualPos.value = game.value.chant.virtualPos;
    }
    if (e.kind === 'beatChanged') {
      activeBeatSeatIndex.value = e.seatIndex;
    }
    // SOLO timer hooks. The clock is started/stopped by status changes (see handleStatus)
    // so pressing Start kicks the run; here we just react to penalty + winner events.
    if (mode.value === 'solo') {
      if (e.kind === 'soloPenalty') {
        soloPenaltyMs.value += e.penaltyMs;
        beatAudio.ding('low');
      }
      if (e.kind === 'winner') {
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
    }
    state.events.push(e);
    if (state.events.length > MAX_LOG) state.events.splice(0, state.events.length - MAX_LOG);
    triggerRef(game);
  };

  const handleStatus = (s: SimStatus) => {
    state.status = s;
    state.version++;
    // Solo: the timer is gated by status. Start kicks the clock; pause/end stop it.
    if (mode.value === 'solo') {
      if (s === 'running') startSoloTimer();
      else stopSoloTimer();
    }
  };

  const initGame = () => {
    if (unsubGame) unsubGame();
    if (unsubStatus) unsubStatus();
    // Stop the previous controller's metronome timer before replacing it — otherwise the
    // old setTimeout keeps firing ticks (and audio) on a Game we've already discarded.
    controller.value.stop();
    state.events = [];
    state.recentSlam = null;
    state.version = 0;
    state.status = 'idle';
    chantVirtualPos.value = 0;
    lastPlayedVirtualPos.value = null;
    activeBeatSeatIndex.value = -1;
    activeBeatTickIndex.value = -1;
    activeBeatTotalTicks.value = beatsPerPlayer.value;
    // Reset solo-run state. `soloBestTimeMs` is intentionally preserved across rounds
    // (it's the persisted record); only the in-progress run state resets.
    stopSoloTimer();
    soloElapsedMs.value = 0;
    soloPenaltyMs.value = 0;
    soloLastFinalMs.value = null;
    soloIsNewBest.value = false;

    const g = new Game();
    const ctrl = new SimulationController(g);
    ctrl.setOptions({
      speed: speed.value,
      failureRate: failureRate.value,
      beatsPerPlayer: beatsPerPlayer.value,
    });
    ctrl.setMode(mode.value);
    ctrl.setBeatChangeHook(({ seatIndex, tickIndex, totalTicks, dingKind }) => {
      // Mirror tick state into reactive refs so the UI (pie overlay + per-seat HUD) updates.
      activeBeatSeatIndex.value = seatIndex;
      activeBeatTickIndex.value = tickIndex;
      activeBeatTotalTicks.value = totalTicks;
      beatAudio.ding(dingKind);
    });
    unsubGame = g.on(handleEvent);
    unsubStatus = ctrl.onStatusChange(handleStatus);
    game.value = g;
    controller.value = ctrl;
    // Now that listeners + the reactive game ref are wired, run setup so the events are observed
    // and GameTable can subscribe to the new instance via its `watch(() => props.game)`.
    g.setup(playerCount.value);

    // In Play mode, seat 0 is auto-occupied by the human; everyone else is AI.
    if (mode.value === 'play') {
      for (let i = 0; i < g.players.length; i++) {
        ctrl.setPlayerHuman(g.players[i].id, i === 0);
      }
    }

    // Replace the freshly-dealt plain arrays with Vue reactive proxies so subsequent in-place
    // mutations (push/splice/sort during slams + penalties) trigger template re-renders.
    for (const p of g.players) {
      p.hand = reactive(p.hand) as Card[];
    }
    for (const b of g.bases.values()) {
      b.pile = reactive(b.pile) as Card[];
    }
    triggerRef(game);
    triggerRef(controller);
  };

  const start = () => {
    controller.value.start();
    // Belt-and-suspenders: also start the solo timer directly. handleStatus also calls
    // this on the 'running' transition, but startSoloTimer is idempotent (early-return
    // if already running) so the double call is harmless and protects against any race
    // where the listener hasn't been attached yet on a freshly-rebuilt controller.
    if (mode.value === 'solo') startSoloTimer();
  };
  const pause = () => controller.value.pause();
  const resume = () => controller.value.resume();
  const setSpeed = (s: number) => {
    speed.value = s;
    controller.value.setOptions({ speed: s });
  };
  const setFailureRate = (r: number) => {
    failureRate.value = r;
    controller.value.setOptions({ failureRate: r });
  };
  const setPlayerCount = (n: number) => {
    playerCount.value = Math.max(2, Math.min(6, n));
  };
  // Remembered player count from the last non-solo mode, so leaving Solo restores it
  // instead of stranding the table at 1 player. If the composable starts in Solo we
  // can't read it from playerCount (which is 1), so fall back to the default of 4.
  let lastNonSoloPlayerCount = initialMode === 'solo' ? 4 : playerCount.value;
  const setPlayerHuman = (id: PlayerId, isHuman: boolean) => {
    controller.value.setPlayerHuman(id, isHuman);
    state.version++;
    triggerRef(game);
  };
  const submitHumanSlam = (...args: Parameters<SimulationController['submitHumanSlam']>) => {
    // Solo: clicking a card before pressing Start should kick the run too — keeps the
    // control panel's primary button in sync (Idle→Running) and starts the timer. The
    // controller.start() path then no-ops once status is already 'running'.
    if (mode.value === 'solo' && state.status === 'idle') {
      start();
    }
    controller.value.submitHumanSlam(...args);
  };

  /** Switch between Simulation, Play (BEAT), and Solo modes. Resets the round. */
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

  const setBeatsPerPlayer = (n: number) => {
    const clamped = Math.max(2, Math.min(10, Math.round(n)));
    beatsPerPlayer.value = clamped;
    controller.value.setOptions({ beatsPerPlayer: clamped });
  };

  const setAudioMuted = (muted: boolean) => {
    beatAudio.setMuted(muted);
  };

  /** True when the given player ID is allowed to be human. */
  const canSeatBeHuman = (id: PlayerId) => {
    if (mode.value !== 'play') return true;
    return game.value.players[0]?.id === id;
  };

  // Start fresh.
  initGame();

  return {
    game,
    controller,
    state,
    playerCount,
    failureRate,
    speed,
    mode,
    beatsPerPlayer,
    activeBeatSeatIndex,
    activeBeatTickIndex,
    activeBeatTotalTicks,
    audioMuted: beatAudio.audioMuted,
    chantVirtualPos,
    lastPlayedVirtualPos,
    soloElapsedMs,
    soloPenaltyMs,
    soloRunning,
    soloBestTimeMs,
    soloLastFinalMs,
    soloIsNewBest,
    initGame,
    start,
    pause,
    resume,
    setSpeed,
    setFailureRate,
    setPlayerCount,
    setPlayerHuman,
    setMode,
    setBeatsPerPlayer,
    setAudioMuted,
    canSeatBeHuman,
    submitHumanSlam,
  };
}

export type UseGame = ReturnType<typeof useGame>;
