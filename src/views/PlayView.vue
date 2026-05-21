<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { GameEvent, BaseSide, CardPrompt, PlaygroundComposition } from '@/game/types';
import type { SimMode } from '@/game/SimulationController';
import { modeCaps } from '@/game/modes';
import GameTable from '@/components/GameTable.vue';
import EventLog from '@/components/EventLog.vue';
import WinnerOverlay from '@/components/WinnerOverlay.vue';
import GuideCard from '@/components/GuideCard.vue';
import GuideContent from '@/components/GuideContent.vue';
import ChantTicker from '@/components/ChantTicker.vue';
import MobileBottomSheet from '@/components/MobileBottomSheet.vue';
import SidePanel from '@/components/SidePanel.vue';
import SettingsPanel from '@/components/SettingsPanel.vue';
import SnapDrawnOverlay from '@/components/SnapDrawnOverlay.vue';
import PauseOverlay from '@/components/PauseOverlay.vue';
import TutorialOverlay from '@/components/TutorialOverlay.vue';
import BeatPickerOverlay from '@/components/BeatPickerOverlay.vue';
import ChantPowerModal from '@/components/ChantPowerModal.vue';
import IconVolume from '@/components/icons/IconVolume.vue';
import { useGame } from '@/composables/useGame';
import { useBeatAudio } from '@/composables/useBeatAudio';
import { useResponsive } from '@/composables/useResponsive';
import { FLAGS } from '@/config/flags';
import { useTutorial } from '@/composables/useTutorial';
import { loadTutorialCompletion } from '@/tutorial/persistence';

const route = useRoute();
const router = useRouter();

function readModeFromRoute(): SimMode {
  const raw = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
  if (raw === 'solo') return 'solo';
  // Playground is gated behind a build-time feature flag. If a stale URL points
  // here while the flag is off (e.g. another user opens a shared link), silently
  // coerce to Versus so they get a sensible game rather than a broken state.
  if (raw === 'playground' && FLAGS.playgroundEnabled) return 'playground';
  return 'versus';
}

const initialMode = readModeFromRoute();

const {
  game,
  controller,
  state,
  playerCount,
  speed,
  mode,
  activeSeatIndex,
  audioMuted,
  chantVirtualPos,
  lastPlayedVirtualPos,
  soloElapsedMs,
  soloPenaltyMs,
  soloBestTimeMs,
  soloLastFinalMs,
  soloIsNewBest,
  pendingFlights,
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
  playgroundComposition,
  setPlaygroundPromptCount,
  playgroundHandSize,
  setPlaygroundHandSize,
  resetPlaygroundDefaults,
  resetGeneralDefaults,
  promptSize,
  setPromptSize,
  pendingSnapDraw,
  submitSnapPlay,
  initGame,
  start,
  pause,
  resume,
  setSpeed,
  setPlayerCount,
  setAudioMuted,
  submitSoloAction,
  submitVersusAction,
  setupPhase,
  beatOwners,
  beatsBySeat,
  currentBeatPickerSeat,
  chantTrigger,
  chantRecitalStepsBySeat,
  chantRecitalCurrentSeat,
  recitalShouts,
  pendingChantPower,
  submitBeatClaim,
  submitChantPowerResolve,
  promptInfoSize,
  setPromptInfoSize,
  skipChantRecital,
  setSkipChantRecital,
} = useGame({ initialMode });

// Tutorial mode: ?tutorial=1 query flips this on. Solo and Versus each have their own
// scripted walk-through. Playground is a tutorial-less sandbox. When active, the
// SimulationController is paused on every step that expects player input; the overlay
// drives the lifecycle.
const isTutorial = computed(() => {
  if (route.query.tutorial !== '1') return false;
  return initialMode === 'solo' || initialMode === 'versus';
});

const tutorial = isTutorial.value
  ? useTutorial({
      mode: initialMode as 'solo' | 'versus',
      game,
      controller,
      pendingFlights,
    })
  : null;

// Tutorial completion flags — surfaced into the in-game GuideCard so the "Start
// tutorial" button can flip to "Replay tutorial" once done.
const tutorialCompletion = ref({ solo: false, versus: false });
void loadTutorialCompletion().then((c) => { tutorialCompletion.value = c; });

function onStartTutorialFromGuide() {
  // Re-route into PlayView with tutorial=1; the route guard re-runs setup.
  router.push({ name: 'play', query: { mode: initialMode, tutorial: '1' } });
}

// Tutorial completion: we used to auto-route on phase === 'done', but that gave the
// user no time to see the "You're ready" celebration. Now phase='done' freezes the
// overlay on the final step (with a "Back to menu" CTA); routing only happens when the
// user clicks that button via the `finish` emit.

function onTutorialQuit() {
  tutorial?.quit();
  router.push({ name: 'menu' });
}
function onTutorialFinish() {
  tutorial?.quit();
  router.push({ name: 'menu' });
}

// Reactive snap-card + drawer + legal targets for the SnapDrawnOverlay. Both human
// and AI's pending snaps surface the overlay — for the AI the chips are read-only and
// the engine's `pendingSnapPickedTarget` indicates which one the AI is about to commit.
const pendingSnapCard = computed(() => {
  const p = pendingSnapDraw.value;
  if (!p) return null;
  const player = game.value.players.find((pl) => pl.id === p.playerId);
  return player?.hand.find((c) => c.id === p.cardId) ?? null;
});
const pendingSnapHolderSeat = computed(() => {
  const p = pendingSnapDraw.value;
  if (!p) return -1;
  return game.value.players.findIndex((pl) => pl.id === p.playerId);
});
const pendingSnapIsHuman = computed(() => {
  const idx = pendingSnapHolderSeat.value;
  if (idx < 0) return false;
  return !game.value.players[idx].isAI;
});
/** Legal target seat indices for the pending snap. Recomputed reactively via state.version
 *  (which bumps on every game event) so the overlay refreshes when strict mode flips. */
const pendingSnapLegalTargets = computed<number[]>(() => {
  void state.version;
  return pendingSnapDraw.value ? game.value.pendingSnapLegalTargets() : [];
});
/** For an AI's pending snap, the controller exposes which seat the AI is about to pick.
 *  The overlay glows that chip so the player sees the AI's decision land. */
const pendingSnapAiPick = computed<number | null>(() => {
  void state.version;
  if (pendingSnapIsHuman.value) return null;
  return controller.value?.pendingSnapPickedTarget ?? null;
});
function onSnapChooseTarget(targetSeatIndex: number) {
  const p = pendingSnapDraw.value;
  if (!p) return;
  submitSnapPlay(p.playerId, targetSeatIndex);
}

// ---- v1.2 Beat picker + Chant Power UI glue ----

/** Player labels by seat index — used by both BeatPickerOverlay and ChantPowerModal. */
const playerLabels = computed(() => game.value.players.map((p) => p.id));
const playerAi = computed(() => game.value.players.map((p) => p.isAI));

/** Show the beat picker overlay during setup phase, but only after the user has
 *  hit Start — the overlay is part of "starting the game", not part of the idle
 *  table. While idle, the table sits behind the central Start CTA undisturbed. */
const beatPickerVisible = computed(
  () => setupPhase.value === 'beat-selection' && state.status === 'running',
);
const beatPickerInteractive = computed(() => {
  const seat = currentBeatPickerSeat.value;
  if (seat == null || seat < 0) return false;
  return !game.value.players[seat]?.isAI;
});
function onBeatPick(beat: import('@/game/types').ChantWord) {
  const seat = currentBeatPickerSeat.value;
  if (seat == null || seat < 0) return;
  const player = game.value.players[seat];
  if (!player) return;
  submitBeatClaim(player.id, beat);
}

/** The Chant Power modal surfaces ONLY when the winner is the human. AI winners are
 *  auto-resolved by the SimulationController. */
const chantPowerVisibleForHuman = computed(() => {
  const pending = pendingChantPower.value;
  if (!pending) return false;
  const winner = game.value.players[pending.winnerSeatIndex];
  return !!winner && !winner.isAI;
});
const chantPowerHumanHand = computed(() => {
  const pending = pendingChantPower.value;
  if (!pending) return [];
  return game.value.players[pending.winnerSeatIndex]?.hand ?? [];
});
const chantPowerRecipientSeats = computed(() => {
  const pending = pendingChantPower.value;
  if (!pending) return [];
  const winnerSeat = pending.winnerSeatIndex;
  const out: number[] = [];
  for (let i = 0; i < game.value.players.length; i++) if (i !== winnerSeat) out.push(i);
  return out;
});
function onChantPowerResolve(gifts: import('@/game/types').ChantPowerGift[]) {
  const pending = pendingChantPower.value;
  if (!pending) return;
  const winner = game.value.players[pending.winnerSeatIndex];
  if (!winner) return;
  submitChantPowerResolve(winner.id, gifts);
}

const { isMobile } = useResponsive();
const { fx } = useBeatAudio();

/** Whether to render the How-to-Play card floating on the table. Resolves the user's
 *  saved preference if any (true/false), otherwise falls back to the platform default —
 *  desktop sees the floating guide, mobile keeps the table clean. The user can override
 *  either way from Settings > Display > "Guide on table". */
const guideOnTable = computed(() => guideOnTablePref.value ?? !isMobile.value);

/** Pre-open emphasis flag for the Halo-Halo Chik. True until the game has actually
 *  been opened (= the Halo-Halo has been played for the first time). This covers Solo
 *  before the first slam, and Versus both before AND after pressing Start — so the
 *  card keeps glowing once the round begins, right up until the player plays it.
 *
 *  `game.opened` is a plain (non-reactive) field on the engine; touching `state.version`
 *  inside the computed re-runs us whenever useGame bumps the version after a play. */
const pulseHaloHalo = computed(() => {
  if (state.status === 'ended' || state.status === 'paused') return false;
  void state.version;
  return !game.value.opened;
});

/** When the user picks "How to play" from Settings, we close the settings sheet and
 *  surface the rules in a modal overlay. Independent of guideOnTable so the user can
 *  read the rules even when the floating card is hidden. */
const guideModalOpen = ref(false);
function onShowGuide() {
  closeSheet();           // closes both the mobile sheet and the desktop side panel
  guideModalOpen.value = true;
}
/** Mode capability flags — branch on these instead of `mode === 'versus'` etc. so
 *  adding a new mode is a one-row edit to MODE_CAPS rather than a hunt across files. */
const caps = computed(() => modeCaps(mode.value));

const winnerId = computed(() => game.value.winnerId);

function formatSoloTime(ms: number): string {
  const totalCs = Math.floor(ms / 10);
  const m = Math.floor(totalCs / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

const soloDisplayMs = computed(() => soloElapsedMs.value + soloPenaltyMs.value);
const soloDisplay = computed(() => formatSoloTime(soloDisplayMs.value));
const soloBestDisplay = computed(() =>
  soloBestTimeMs.value === null ? '—' : formatSoloTime(soloBestTimeMs.value),
);

// Floating "+Ns" bubbles — one per soloPenalty event.
const penaltyBubbles = ref<{ id: number; label: string }[]>([]);
let penaltyBubbleId = 0;
watch(
  () => state.events.length,
  (n, prev) => {
    if (!caps.value.isTimeAttack || n <= (prev ?? 0)) return;
    const ev = state.events[state.events.length - 1] as GameEvent | undefined;
    if (ev?.kind !== 'soloPenalty') return;
    const id = ++penaltyBubbleId;
    penaltyBubbles.value.push({ id, label: `+${(ev.penaltyMs / 1000).toFixed(0)}s` });
    setTimeout(() => {
      penaltyBubbles.value = penaltyBubbles.value.filter((b) => b.id !== id);
    }, 1400);
  },
);

watch(playerCount, () => {
  if (state.status === 'idle') initGame();
});

const onRestart = () => { fx('tap'); initGame(); };

const onSoloSlam = (payload: { cardId: string; baseSide: BaseSide }) => {
  submitSoloAction({ type: 'slam', cardId: payload.cardId, baseSide: payload.baseSide });
};

const onVersusPlay = (payload: { cardId: string; targetSeatIndex: number }) => {
  const human = game.value.players.find((p) => !p.isAI);
  if (!human) return;
  submitVersusAction(human.id, { type: 'play', cardId: payload.cardId, targetSeatIndex: payload.targetSeatIndex });
};

const onDrawDeckClick = () => {
  if (!caps.value.isTurnBased) {
    submitSoloAction({ type: 'draw' });
  } else {
    const human = game.value.players.find((p) => !p.isAI);
    if (!human) return;
    submitVersusAction(human.id, { type: 'draw' });
  }
};

// Mobile bottom sheets + desktop side panel both flow through these openSheet/closeSheet
// helpers — the 'controls' sheet is the new SettingsPanel (replaces the old ControlPanel).
const sheetOpen = ref<'none' | 'log' | 'controls'>('none');
function openSheet(which: 'log' | 'controls') { sheetOpen.value = which; }
function closeSheet() { sheetOpen.value = 'none'; }

// Desktop right-side panel reuses the same 'controls' state so we can have one source of
// truth for "is settings open" without juggling two refs.
const settingsOpen = computed({
  get: () => sheetOpen.value === 'controls',
  set: (v) => { sheetOpen.value = v ? 'controls' : 'none'; },
});
function onSettingsBackToMenu() {
  closeSheet();
  router.push({ name: 'menu' });
}
function onSettingsRestart() {
  closeSheet();
  onRestart();
}

// Toast for "settings change won't apply until next round". Some settings — player count
// and the Playground deck knobs — only take effect on initGame(); the engine auto-runs
// initGame() when the round is idle (see useGame: rebuildIfCustomDeckActive + the
// playerCount watch below), so during idle there's nothing to nag about. For running or
// paused rounds, we snapshot these on settings open and show a toast on close if any
// changed.
const toastMessage = ref<string | null>(null);
let toastTimer: number | null = null;
function showToast(msg: string, durationMs = 3500) {
  toastMessage.value = msg;
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = null;
    toastTimer = null;
  }, durationMs);
}

interface RestartSnapshot {
  playerCount: number;
  handSize: number;
  composition: PlaygroundComposition;
}
let settingsSnapshot: RestartSnapshot | null = null;
const COMPOSITION_KEYS: CardPrompt[] = ['right', 'left', 'free', 'stop', 'snap', 'fetch'];
watch(settingsOpen, (isOpen) => {
  if (isOpen) {
    settingsSnapshot = {
      playerCount: playerCount.value,
      handSize: playgroundHandSize.value,
      composition: { ...playgroundComposition.value },
    };
    return;
  }
  // Closing the panel — diff against the snapshot.
  if (!settingsSnapshot) return;
  const snap = settingsSnapshot;
  settingsSnapshot = null;
  if (state.status === 'idle' || state.status === 'ended') return; // auto-applies, no nag
  const changed =
    playerCount.value !== snap.playerCount ||
    playgroundHandSize.value !== snap.handSize ||
    COMPOSITION_KEYS.some((k) => playgroundComposition.value[k] !== snap.composition[k]);
  if (changed) {
    showToast('Restart the round to apply the new configuration.');
  }
});

/** Primary action used only by the centre "Start / Play Again" CTA (Versus + Playground).
 *  Solo has no Start button — players auto-start by slamming their pulsing Halo-Halo —
 *  so this handler is intentionally Versus-shaped. */
function onPrimary() {
  fx('tap');
  if (state.status === 'idle') start();
  else if (state.status === 'ended') onRestart();
}

/** Dedicated Pause/Resume handler for the top-header pause button. Always safe to call
 *  even when status falls outside the running/paused window — the underlying useGame
 *  pause/resume are no-ops otherwise — but the button is gated in the template anyway. */
function onPauseResume() {
  fx('tap');
  if (state.status === 'running') pause();
  else if (state.status === 'paused') resume();
}

function onBackToMenu() {
  fx('tap');
  router.push({ name: 'menu' });
}

function onPauseOverlayTap() {
  fx('tap');
  resume();
}
</script>

<template>
  <div
    class="relative w-screen overflow-hidden"
    style="height: 100dvh;"
  >
    <!-- ===================== DESKTOP HEADER ===================== -->
    <header
      v-if="!isMobile"
      class="absolute top-0 left-0 right-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4"
    >
      <div class="flex items-center gap-3">
        <button
          type="button"
          aria-label="Menu"
          class="w-10 h-14 rounded-md ring-2 ring-cream-soft/70 shadow-md"
          style="background-image: url('/cards/default-back.png'); background-size: cover; background-position: center;"
          @click="onBackToMenu"
        />
        <div class="flex flex-col items-start gap-1">
          <img
            src="/logo-white.svg"
            alt="Chik!"
            class="h-9 sm:h-11 w-auto"
          />
          <div class="font-subtitle text-cream-soft/85 text-xs sm:text-sm font-medium">
            by Halohalo Games
          </div>
        </div>
      </div>
      <!-- Right-side header actions: mute / restart / primary / settings-cog.
           Replaces the old inline ControlPanel pill — players + speed now live in
           the dedicated SettingsPanel reachable via the cog. -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          :title="audioMuted ? 'Unmute' : 'Mute'"
          :aria-label="audioMuted ? 'Unmute' : 'Mute'"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-md"
          @click="setAudioMuted(!audioMuted)"
        >
          <IconVolume :muted="audioMuted" :size="18" />
        </button>
        <button
          v-if="state.status !== 'idle'"
          type="button"
          aria-label="Restart"
          title="Restart"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-md"
          @click="onRestart"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <!-- Pause / Resume — own dedicated control. Hidden in idle / opening / ended
             states (nothing to pause); flips icon based on whether we're running. -->
        <button
          v-if="state.status === 'running' || state.status === 'paused'"
          type="button"
          :aria-label="state.status === 'paused' ? 'Resume' : 'Pause'"
          :title="state.status === 'paused' ? 'Resume' : 'Pause'"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-md"
          @click="onPauseResume"
        >
          <svg v-if="state.status === 'running'" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="6,4 6,20 20,12" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-md"
          @click="openSheet('controls')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>

    <!-- ===================== MOBILE HEADER ===================== -->
    <header
      v-else
      class="absolute top-0 left-0 right-0 z-40 flex items-center gap-2 px-3 py-2.5"
    >
      <button
        type="button"
        aria-label="Menu"
        class="shrink-0 bg-transparent flex items-center"
        @click="onBackToMenu"
      >
        <img src="/logo-white.svg" alt="Chik!" class="h-7 w-auto" />
      </button>

      <button
        v-if="state.status !== 'idle'"
        type="button"
        aria-label="Restart"
        class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shrink-0"
        :style="{ boxShadow: '0 4px 10px rgba(0,0,0,0.18)' }"
        @click="onRestart"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>

      <button
        v-if="state.status === 'running' || state.status === 'paused'"
        type="button"
        :aria-label="state.status === 'paused' ? 'Resume' : 'Pause'"
        class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shrink-0"
        :style="{ boxShadow: '0 4px 10px rgba(0,0,0,0.18)' }"
        @click="onPauseResume"
      >
        <svg v-if="state.status === 'running'" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <polygon points="6,4 6,20 20,12" />
        </svg>
      </button>

      <div class="flex-1" />

      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="caps.isTurnBased"
          type="button"
          aria-label="Event log"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep"
          @click="openSheet('log')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="14" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Settings"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep"
          @click="openSheet('controls')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          v-if="false"
          type="button"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="7" x2="14" y2="7" />
            <line x1="18" y1="7" x2="20" y2="7" />
            <circle cx="16" cy="7" r="2" />
            <line x1="4" y1="17" x2="8" y2="17" />
            <line x1="12" y1="17" x2="20" y2="17" />
            <circle cx="10" cy="17" r="2" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Versus / Playground chant ticker — top-centre on both mobile and desktop. Solo
         has its own ticker inline with the timer (see below). The vertical offset is
         taller on desktop (sits below the header) and shorter on mobile (where the
         header is more compact). -->
    <div
      v-if="!caps.isSingleSeat"
      class="absolute left-1/2 -translate-x-1/2 z-[20] pointer-events-none"
      :style="{ top: isMobile ? '56px' : '20px' }"
    >
      <ChantTicker
        :last-played-pos="lastPlayedVirtualPos"
        :next-pos="chantVirtualPos"
      />
    </div>

    <GuideCard
      v-if="isMobile && !isTutorial && guideOnTable"
      mobile
      :mode="mode"
      :tutorial-completed="mode === 'solo' ? tutorialCompletion.solo : mode === 'versus' ? tutorialCompletion.versus : false"
      :supports-tutorial="mode === 'solo' || mode === 'versus'"
      @start-tutorial="onStartTutorialFromGuide"
    />

    <aside
      v-if="!isMobile && !isTutorial && guideOnTable"
      class="absolute top-20 sm:top-23 left-3 sm:left-4 flex flex-col gap-5"
    >
      <div class="relative z-30">
        <GuideCard
          :mode="mode"
          :tutorial-completed="mode === 'solo' ? tutorialCompletion.solo : mode === 'versus' ? tutorialCompletion.versus : false"
          :supports-tutorial="mode === 'solo' || mode === 'versus'"
          @start-tutorial="onStartTutorialFromGuide"
        />
      </div>
    </aside>

    <!-- Solo timer HUD -->
    <div
      v-if="caps.isTimeAttack"
      class="absolute left-1/2 -translate-x-1/2 z-[20] flex flex-col items-center gap-2 pointer-events-none"
      :style="{ top: isMobile ? '120px' : '20px' }"
    >
      <div
        class="relative flex items-center gap-3 px-5 py-2 rounded-2xl bg-cream-soft/95 shadow-lg ring-1 ring-black/10"
      >
        <span class="solo-timer text-coral-deep leading-none">{{ soloDisplay }}</span>
        <span class="flex flex-col items-start justify-center leading-tight">
          <span class="text-[10px] font-bold uppercase tracking-widest text-stone-500">Best</span>
          <span class="solo-best text-stone-700">{{ soloBestDisplay }}</span>
        </span>
        <div
          v-for="b in penaltyBubbles"
          :key="b.id"
          class="solo-penalty-bubble"
        >
          {{ b.label }}
        </div>
      </div>
      <div class="pointer-events-none">
        <ChantTicker
          :last-played-pos="lastPlayedVirtualPos"
          :next-pos="chantVirtualPos"
        />
      </div>
      <!-- Solo "slam Halo-Halo to start" hint. Sits in the HUD column right below the
           chant ticker so it doesn't fight the table for legibility. The Halo-Halo card
           itself carries the visual call to action via its heartbeat glow; this pill is
           just the verbal cue. -->
      <div
        v-if="!isTutorial && !winnerId && state.status === 'idle'"
        class="solo-start-hint"
      >
        <span>Slam your Halo-Halo Chik to start</span>
      </div>
    </div>

    <main class="absolute inset-0 isolate" :style="{ paddingTop: isMobile ? '116px' : '0' }">
      <GameTable
        :game="game"
        :events="state.events"
        :speed="speed"
        :version="state.version"
        :mode="mode"
        :active-seat-index="activeSeatIndex"
        :pending-flights="pendingFlights"
        :wisp-enabled="wispEnabled"
        :pending-snap-card="pendingSnapCard"
        :pending-snap-holder-seat="pendingSnapHolderSeat"
        :pending-snap-legal-targets="pendingSnapLegalTargets"
        :pending-snap-interactive="pendingSnapIsHuman"
        :pending-snap-ai-pick="pendingSnapAiPick"
        :prompt-size="promptSize"
        :prompt-info-size="promptInfoSize"
        :pulse-halo-halo="pulseHaloHalo"
        :beats-by-seat="beatsBySeat"
        :current-beat-picker-seat="currentBeatPickerSeat"
        :chant-trigger-active="!!chantTrigger"
        :chant-trigger-landed-beat="chantTrigger?.landedBeat ?? null"
        :chant-trigger-winner-seat="chantTrigger?.winnerSeatIndex ?? null"
        :chant-trigger-total="chantTrigger?.total ?? 0"
        :chant-trigger-receiver-seat="chantTrigger?.receiverSeatIndex ?? null"
        :chant-recital-steps-by-seat="chantRecitalStepsBySeat"
        :chant-recital-current-seat="chantRecitalCurrentSeat"
        :recital-shouts="recitalShouts"
        @solo-slam="onSoloSlam"
        @versus-play="onVersusPlay"
        @draw-deck-click="onDrawDeckClick"
        @snap-target="onSnapChooseTarget"
      />

      <!-- v1.2 Setup phase: pick your Beat Card. Surfaces above the GameTable so the
           player can see seat dots animating in as picks land. -->
      <BeatPickerOverlay
        :visible="beatPickerVisible"
        :beat-owners="beatOwners"
        :player-labels="playerLabels"
        :player-ai="playerAi"
        :current-picker-seat="currentBeatPickerSeat"
        :interactive="beatPickerInteractive"
        @pick="onBeatPick"
      />

      <!-- v1.2 Chant Power modal — only for the human winner. -->
      <ChantPowerModal
        :visible="chantPowerVisibleForHuman"
        :hand="chantPowerHumanHand"
        :recipient-seats="chantPowerRecipientSeats"
        :player-labels="playerLabels"
        @resolve="onChantPowerResolve"
      />
    </main>

    <PauseOverlay
      v-if="state.status === 'paused' && !isTutorial"
      @resume="onPauseOverlayTap"
    />

    <!-- Big central Start / Play Again CTA for Versus — only shown when nothing is in
         flight, so it never covers the deck/cards mid-game. With the top-header Start
         button removed, this is the only "begin" affordance for Versus + Playground. -->
    <div
      v-if="!isTutorial && caps.isTurnBased && !winnerId && (state.status === 'idle' || state.status === 'ended')"
      class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none font-subtitle"
    >
      <button
        type="button"
        class="center-cta pointer-events-auto"
        @click="onPrimary"
      >
        {{ state.status === 'ended' ? 'Play Again' : 'Start' }}
      </button>
    </div>


    <aside v-if="!isMobile && eventLogEnabled" class="absolute bottom-3 right-3 w-70 max-w-[80vw] z-20">
      <EventLog :events="state.events" />
    </aside>

    <MobileBottomSheet
      v-if="isMobile && eventLogEnabled"
      :open="sheetOpen === 'log'"
      title="Event Log"
      @close="closeSheet"
    >
      <EventLog :events="state.events" hide-title />
    </MobileBottomSheet>

    <!-- Mobile: settings live in a bottom sheet, opened by the cog button in the header. -->
    <MobileBottomSheet
      v-if="isMobile"
      :open="sheetOpen === 'controls'"
      title="Settings"
      @close="closeSheet"
    >
      <SettingsPanel
        :mode="mode"
        :audio-muted="audioMuted"
        :wisp-enabled="wispEnabled"
        :event-log-enabled="eventLogEnabled"
        :guide-on-table="guideOnTable"
        :prompt-size="promptSize"
        :prompt-info-size="promptInfoSize"
        :skip-chant-recital="skipChantRecital"
        :strict-prompts="strictPrompts"
        :ai-skill="aiSkill"
        :player-count="playerCount"
        :speed="speed"
        :playground-composition="playgroundComposition"
        :playground-hand-size="playgroundHandSize"
        @update:audio-muted="setAudioMuted"
        @update:wisp-enabled="setWispEnabled"
        @update:event-log-enabled="setEventLogEnabled"
        @update:guide-on-table="setGuideOnTable"
        @show-guide="onShowGuide"
        @update:prompt-size="setPromptSize"
        @update:prompt-info-size="setPromptInfoSize"
        @update:skip-chant-recital="setSkipChantRecital"
        @update:strict-prompts="setStrictPrompts"
        @update:ai-skill="setAiSkill"
        @update:player-count="setPlayerCount"
        @update:speed="setSpeed"
        @update:playground-prompt-count="(p) => setPlaygroundPromptCount(p.prompt, p.count)"
        @update:playground-hand-size="setPlaygroundHandSize"
        @reset-playground-defaults="resetPlaygroundDefaults"
        @reset-general-defaults="resetGeneralDefaults"
        @restart="onSettingsRestart"
        @back-to-menu="onSettingsBackToMenu"
      />
    </MobileBottomSheet>

    <!-- Desktop: same settings body, slides in from the right side. -->
    <SidePanel
      v-if="!isMobile"
      :open="settingsOpen"
      title="Settings"
      @close="closeSheet"
    >
      <SettingsPanel
        :mode="mode"
        :audio-muted="audioMuted"
        :wisp-enabled="wispEnabled"
        :event-log-enabled="eventLogEnabled"
        :guide-on-table="guideOnTable"
        :prompt-size="promptSize"
        :prompt-info-size="promptInfoSize"
        :skip-chant-recital="skipChantRecital"
        :strict-prompts="strictPrompts"
        :ai-skill="aiSkill"
        :player-count="playerCount"
        :speed="speed"
        :playground-composition="playgroundComposition"
        :playground-hand-size="playgroundHandSize"
        @update:audio-muted="setAudioMuted"
        @update:wisp-enabled="setWispEnabled"
        @update:event-log-enabled="setEventLogEnabled"
        @update:guide-on-table="setGuideOnTable"
        @show-guide="onShowGuide"
        @update:prompt-size="setPromptSize"
        @update:prompt-info-size="setPromptInfoSize"
        @update:skip-chant-recital="setSkipChantRecital"
        @update:strict-prompts="setStrictPrompts"
        @update:ai-skill="setAiSkill"
        @update:player-count="setPlayerCount"
        @update:speed="setSpeed"
        @update:playground-prompt-count="(p) => setPlaygroundPromptCount(p.prompt, p.count)"
        @update:playground-hand-size="setPlaygroundHandSize"
        @reset-playground-defaults="resetPlaygroundDefaults"
        @reset-general-defaults="resetGeneralDefaults"
        @restart="onSettingsRestart"
        @back-to-menu="onSettingsBackToMenu"
      />
    </SidePanel>

    <WinnerOverlay
      :winner-id="winnerId"
      :title="caps.isTimeAttack ? 'Cleared!' : undefined"
      :headline="caps.isTimeAttack && soloLastFinalMs !== null ? formatSoloTime(soloLastFinalMs) : undefined"
      :subtitle="caps.isTimeAttack ? (soloIsNewBest ? 'New best!' : `Best ${soloBestDisplay}`) : undefined"
      :subtitle-tone="soloIsNewBest ? 'celebrate' : 'info'"
      @restart="onRestart"
    />

    <!-- Snap-drawn surfaces inline on the deck via SnapDrawnOverlay (mounted INSIDE
         GameTable above) — replaces the previous modal chooser. -->

    <!-- Tutorial overlay — bottom speech card + spotlight backdrop. Only mounts when
         ?tutorial=1 is in the route. Collapses while the SnapDrawnOverlay is up so the
         chooser chips stay reachable. -->
    <TutorialOverlay
      v-if="tutorial"
      :step="tutorial.currentStep.value"
      :index="tutorial.currentStepIndex.value"
      :total="tutorial.total"
      :phase="tutorial.phase.value"
      :spotlight-selector="tutorial.spotlightSelector.value"
      :card-position="tutorial.cardPosition.value"
      :hint-visible="tutorial.hintVisible.value"
      :collapsed="!!pendingSnapCard"
      @next="tutorial.nextNarrative"
      @skip-step="tutorial.skipStep"
      @quit="onTutorialQuit"
      @finish="onTutorialFinish"
    />

    <!-- "How to play" modal — opened from Settings > Display > How to play. Renders the
         same GuideContent the floating GuideCard uses, in a centred backdrop. Lets the
         user reach the rules without the floating card cluttering the table. -->
    <Teleport to="body">
      <div
        v-if="guideModalOpen"
        class="guide-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        @click.self="guideModalOpen = false"
      >
        <div class="guide-modal-card" @click.stop>
          <GuideContent
            :mode="mode"
            :supports-tutorial="mode === 'solo' || mode === 'versus'"
            :tutorial-completed="mode === 'solo' ? tutorialCompletion.solo : mode === 'versus' ? tutorialCompletion.versus : false"
            @start-tutorial="onStartTutorialFromGuide"
          />
          <button
            type="button"
            class="guide-modal-close"
            aria-label="Close"
            @click="guideModalOpen = false"
          >Close</button>
        </div>
      </div>
    </Teleport>

    <!-- Toast: floating pill at the bottom of the viewport. Currently used only for the
         "restart to apply new config" nudge; auto-dismisses after a few seconds. -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toastMessage" class="toast-root" role="status" aria-live="polite">
          {{ toastMessage }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.solo-timer {
  font-family: ui-monospace, 'SF Mono', Menlo, 'Cascadia Mono', monospace;
  font-weight: 800;
  font-size: 2rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.solo-best {
  font-family: ui-monospace, 'SF Mono', Menlo, 'Cascadia Mono', monospace;
  font-weight: 700;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.solo-penalty-bubble {
  position: absolute;
  top: -10px;
  right: 4px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 800;
  font-size: 0.95rem;
  color: #fff8ee;
  background: var(--color-coral);
  box-shadow: 0 6px 14px rgba(220, 80, 60, 0.45);
  animation: solo-penalty-pop 1.4s cubic-bezier(.2, .7, .2, 1) forwards;
  pointer-events: none;
}
.solo-penalty-bubble::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 18px;
  width: 10px;
  height: 10px;
  background: var(--color-coral);
  transform: rotate(45deg);
}
@keyframes solo-penalty-pop {
  0%   { opacity: 0; transform: translate(0, 6px) scale(0.6); }
  18%  { opacity: 1; transform: translate(0, -2px) scale(1.08); }
  40%  { transform: translate(0, -10px) scale(1); }
  100% { opacity: 0; transform: translate(0, -42px) scale(0.95); }
}

/**
 * Central "Start / Play Again" CTA shown on the Versus table when idle or after the
 * round ends. Big enough to read at a glance with a slow cream-soft halo pulse to draw
 * the eye. Hidden during play so it never sits over the deck or active cards.
 */
.center-cta {
  background: var(--color-coral-deep);
  color: var(--color-cream-soft);
  border: 0;
  padding: 12px 40px;
  border-radius: 9999px;
  font-family: Quiapo;
  font-weight: 700;
  font-size: 2rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  box-shadow:
    0 18px 36px rgba(0, 0, 0, 0.45),
    0 0 0 5px rgba(252, 246, 230, 0.55);
  transition: transform 160ms cubic-bezier(.2, .7, .2, 1), box-shadow 160ms ease;
  animation: center-cta-pulse 2.4s ease-in-out infinite;
}
.center-cta:hover {
  transform: scale(1.04);
}
.center-cta:active {
  transform: scale(0.97);
}
@keyframes center-cta-pulse {
  0%, 100% {
    box-shadow:
      0 18px 36px rgba(0, 0, 0, 0.45),
      0 0 0 5px rgba(252, 246, 230, 0.55);
  }
  50% {
    box-shadow:
      0 18px 36px rgba(0, 0, 0, 0.45),
      0 0 0 12px rgba(252, 246, 230, 0.22);
  }
}

/* Solo's "Slam your Halo-Halo Chik to start" pill. Sits inside the HUD column under
 * the chant ticker; the Halo-Halo card in hand carries the visual emphasis (heartbeat
 * + cream/coral glow). Darker coral fill so it stands out against the regular coral
 * background but still feels part of the Halohalo palette. Subtle opacity throb in
 * lockstep with the card's heartbeat invites the eye downward to the hand. */
.solo-start-hint {
  margin-top: 2px;
  padding: 6px 14px;
  border-radius: 9999px;
  background: var(--color-coral-deep);
  color: var(--color-cream-soft);
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  pointer-events: none;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.28);
  transform-origin: top center;
  /* Three-stage animation system:
   *  1. solo-start-hint-in   — one-shot pop-in for entry (transform + opacity).
   *  2. solo-start-hint-pulse — infinite opacity throb (no transform contention).
   *  3. solo-start-hint-emphasis — every 5s, a quick wiggle nudges the eye back to the
   *     hint if the player still hasn't slammed. Delayed 5s so the first emphasis fires
   *     5s after the entrance; the keyframes are calm for ~90% of each cycle and only
   *     the last 10% does the wiggle, keeping the rest of the time visually quiet. */
  animation:
    solo-start-hint-in 520ms cubic-bezier(.2, .8, .2, 1.2) both,
    solo-start-hint-pulse 2.4s ease-in-out 520ms infinite,
    solo-start-hint-emphasis 5s ease-in-out 5s infinite;
}
@media (min-width: 768px) {
  .solo-start-hint {
    font-size: 0.72rem;
    padding: 5px 12px;
    letter-spacing: 0.1em;
  }
}
@keyframes solo-start-hint-in {
  0% {
    opacity: 0;
    transform: translateY(-14px) scale(0.7);
  }
  60% {
    opacity: 1;
    transform: translateY(0) scale(1.08);
  }
  100% {
    opacity: 0.92;
    transform: translateY(0) scale(1);
  }
}
@keyframes solo-start-hint-pulse {
  0%, 100% { opacity: 0.92; }
  50%      { opacity: 1; }
}
/* Periodic emphasis: most of the 5s cycle stays at scale(1), then a quick three-beat
 * wobble at the END nudges the eye back to the pill. Because the animation has a 5s
 * delay AND a 5s duration, the wobble lands at t=5s, t=10s, t=15s ... — once for every
 * 5s the player has been idle. */
@keyframes solo-start-hint-emphasis {
  0%, 88%, 100% { transform: scale(1); }
  91%           { transform: scale(1.12) rotate(-2.5deg); }
  94%           { transform: scale(0.96) rotate(2deg); }
  97%           { transform: scale(1.06) rotate(-1deg); }
}
@media (prefers-reduced-motion: reduce) {
  .solo-start-hint {
    animation: none;
    opacity: 1;
  }
}

.toast-root {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 200;
  max-width: calc(100vw - 32px);
  padding: 12px 20px;
  border-radius: 9999px;
  background: rgba(36, 22, 18, 0.92);
  color: var(--color-cream-soft);
  font-weight: 600;
  font-size: 0.9rem;
  letter-spacing: 0.01em;
  text-align: center;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: none;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 220ms ease, transform 260ms cubic-bezier(.2, .7, .2, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px);
}

/* Guide-from-settings modal. Reuses GuideContent at near-full-screen with a coral
 * backdrop matching the in-game palette. Close affordance is the DONE pill at the
 * top-right; clicking the backdrop also dismisses. */
.guide-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 14, 10, 0.62);
  padding: max(env(safe-area-inset-top, 0px), 32px) 16px max(env(safe-area-inset-bottom, 0px), 32px);
}
.guide-modal-card {
  position: relative;
  width: min(100%, 480px);
  height: min(88dvh, 720px);
  border-radius: 18px;
  /* No `overflow: hidden` here — the close button is absolutely positioned at `top: -32px`
   * (sitting just above the card, matching the table-guide mobile modal), and clipping
   * the card would hide it. GuideContent has no background of its own and `.guide-grid`
   * scrolls internally, so the card's rounded corners still render correctly. */
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
  background: var(--color-cream-soft);
}
/* Matches the close pill on the table-guide mobile modal in GuideCard.vue:
 *   `-top-8 right-2 px-3 py-1 rounded-full text-xs font-extrabold uppercase
 *   tracking-widest text-cream-soft` with coral background. */
.guide-modal-close {
  position: absolute;
  top: -32px;
  right: 8px;
  padding: 4px 12px;
  border-radius: 9999px;
  border: 0;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  z-index: 10;
}
.guide-modal-close:hover { background: var(--color-coral-deep); }
</style>
