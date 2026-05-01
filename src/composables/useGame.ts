import { reactive, ref, shallowRef, triggerRef } from 'vue';
import type { Card } from '@/game/Card';
import { Game } from '@/game/Game';
import { SimulationController, type SimStatus, type SimMode } from '@/game/SimulationController';
import type { GameEvent, PlayerId } from '@/game/types';
import { useBeatAudio } from './useBeatAudio';

export interface GameViewState {
  /** Reactive copy of game state — incremented to force re-reads on each event. */
  version: number;
  status: SimStatus;
  events: GameEvent[];
  recentSlam: { playerId: PlayerId; cardId: string; word: string } | null;
}

const MAX_LOG = 50;

export function useGame() {
  const game = shallowRef<Game>(new Game());
  const controller = shallowRef<SimulationController>(new SimulationController(game.value));

  const state = reactive<GameViewState>({
    version: 0,
    status: 'idle',
    events: [],
    recentSlam: null,
  });

  const playerCount = ref(4);
  const failureRate = ref(0.15);
  const speed = ref(1);
  /** Simulation (free-for-all) vs. Play (BEAT mode, human auto-seated as P1). */
  const mode = ref<SimMode>('simulation');
  /** Active beat seat in Play mode (-1 outside Play / pre-open). */
  const activeBeatSeatIndex = ref<number>(-1);
  /** Tick index within the active player's turn (0..beatsPerPlayer-1; -1 outside Play). */
  const activeBeatTickIndex = ref<number>(-1);
  /** Total ticks in the current turn (mirrors controller, used by HUD dots). */
  const activeBeatTotalTicks = ref<number>(5);
  /** Slider: how many metronome ticks per player turn. Default 5. */
  const beatsPerPlayer = ref<number>(5);
  const beatAudio = useBeatAudio();
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
    state.events.push(e);
    if (state.events.length > MAX_LOG) state.events.splice(0, state.events.length - MAX_LOG);
    triggerRef(game);
  };

  const handleStatus = (s: SimStatus) => {
    state.status = s;
    state.version++;
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

  const start = () => controller.value.start();
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
  const setPlayerHuman = (id: PlayerId, isHuman: boolean) => {
    controller.value.setPlayerHuman(id, isHuman);
    state.version++;
    triggerRef(game);
  };
  const submitHumanSlam = (...args: Parameters<SimulationController['submitHumanSlam']>) => {
    controller.value.submitHumanSlam(...args);
  };

  /** Switch between Simulation (free-for-all) and Play (BEAT) modes. Resets the round. */
  const setMode = (m: SimMode) => {
    if (mode.value === m) return;
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
