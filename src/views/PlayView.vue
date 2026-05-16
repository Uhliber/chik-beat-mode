<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { GameEvent, BaseSide } from '@/game/types';
import type { SimMode } from '@/game/SimulationController';
import GameTable from '@/components/GameTable.vue';
import EventLog from '@/components/EventLog.vue';
import WinnerOverlay from '@/components/WinnerOverlay.vue';
import GuideCard from '@/components/GuideCard.vue';
import ChantTicker from '@/components/ChantTicker.vue';
import MobileBottomSheet from '@/components/MobileBottomSheet.vue';
import SidePanel from '@/components/SidePanel.vue';
import SettingsPanel from '@/components/SettingsPanel.vue';
import SnapDirectionPrompt from '@/components/SnapDirectionPrompt.vue';
import PauseOverlay from '@/components/PauseOverlay.vue';
import IconVolume from '@/components/icons/IconVolume.vue';
import { useGame } from '@/composables/useGame';
import { useBeatAudio } from '@/composables/useBeatAudio';
import { useResponsive } from '@/composables/useResponsive';

const route = useRoute();
const router = useRouter();

function readModeFromRoute(): SimMode {
  const raw = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
  // Back-compat alias from earlier code: 'play' / 'simulation' both meant versus play.
  if (raw === 'solo') return 'solo';
  return 'versus';
}

const initialMode = readModeFromRoute();

const {
  game,
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
  strictPrompts,
  setStrictPrompts,
  aiSkill,
  setAiSkill,
  pendingSnapDraw,
  submitSnapDirection,
  initGame,
  start,
  pause,
  resume,
  setSpeed,
  setPlayerCount,
  setAudioMuted,
  submitSoloAction,
  submitVersusAction,
} = useGame({ initialMode });

// Reactive Card lookup for the snap-direction chooser — we hand the actual Card object
// to the prompt so it can render the art the human just drew.
const pendingSnapCard = computed(() => {
  const p = pendingSnapDraw.value;
  if (!p) return null;
  const player = game.value.players.find((pl) => pl.id === p.playerId);
  return player?.hand.find((c) => c.id === p.cardId) ?? null;
});
// Only surface the chooser when the pending snap belongs to the HUMAN seat. AI's
// pending snaps are auto-resolved by the SimulationController.
const showSnapChooser = computed(() => {
  const p = pendingSnapDraw.value;
  if (!p) return false;
  const player = game.value.players.find((pl) => pl.id === p.playerId);
  return !!player && !player.isAI;
});
function onSnapChoose(direction: 'left' | 'right' | 'keep') {
  const p = pendingSnapDraw.value;
  if (!p) return;
  submitSnapDirection(p.playerId, direction);
}

const { isMobile } = useResponsive();
const { fx } = useBeatAudio();

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
    if (mode.value !== 'solo' || n <= (prev ?? 0)) return;
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
  if (mode.value === 'solo') {
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

const primaryLabel = computed(() => {
  switch (state.status) {
    case 'opening': return '…';
    case 'running': return 'Pause';
    case 'paused':  return 'Resume';
    case 'ended':   return 'Restart';
    default:        return 'Start';
  }
});
function onPrimary() {
  fx('tap');
  if (state.status === 'idle') start();
  else if (state.status === 'running') pause();
  else if (state.status === 'paused') resume();
  else if (state.status === 'ended') onRestart();
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
            Visual Simulation · v1.0
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
        <button
          type="button"
          class="px-4 py-2 rounded-full font-extrabold uppercase tracking-wider text-cream-soft text-sm shadow-md"
          :style="{ background: 'var(--color-coral-deep)' }"
          :disabled="state.status === 'opening'"
          @click="onPrimary"
        >
          {{ primaryLabel }}
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
        type="button"
        class="px-3 py-1.5 rounded-full font-extrabold uppercase tracking-widest text-[11px] text-cream-soft shrink-0"
        :style="{ background: 'var(--color-coral-deep)', boxShadow: '0 4px 10px rgba(0,0,0,0.25)' }"
        :disabled="state.status === 'opening'"
        @click="onPrimary"
      >
        {{ primaryLabel }}
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

      <div class="flex-1" />

      <div class="flex items-center gap-1 shrink-0">
        <button
          v-if="mode === 'versus'"
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

    <div
      v-if="isMobile && mode !== 'solo'"
      class="absolute left-1/2 -translate-x-1/2 z-[20] pointer-events-none"
      style="top: 56px;"
    >
      <ChantTicker
        :last-played-pos="lastPlayedVirtualPos"
        :next-pos="chantVirtualPos"
      />
    </div>

    <GuideCard v-if="isMobile" mobile :mode="mode" />
    <button
      v-if="isMobile"
      type="button"
      :aria-label="audioMuted ? 'Unmute' : 'Mute'"
      class="fixed bottom-3 left-3 z-30 w-11 h-11 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-lg"
      @click="setAudioMuted(!audioMuted)"
    >
      <IconVolume :muted="audioMuted" :size="22" />
    </button>

    <aside
      v-if="!isMobile"
      class="absolute top-20 sm:top-23 left-3 sm:left-4 flex flex-col gap-5"
    >
      <div class="relative z-30">
        <GuideCard :mode="mode" />
      </div>
      <div v-if="mode !== 'solo'" class="relative z-[20] pointer-events-none">
        <ChantTicker
          :last-played-pos="lastPlayedVirtualPos"
          :next-pos="chantVirtualPos"
        />
      </div>
    </aside>

    <!-- Solo timer HUD -->
    <div
      v-if="mode === 'solo'"
      class="absolute left-1/2 -translate-x-1/2 z-[20] flex flex-col items-center gap-2 pointer-events-none"
      :style="{ top: isMobile ? '120px' : '20px' }"
    >
      <div
        class="relative flex items-baseline gap-3 px-5 py-2 rounded-2xl bg-cream-soft/95 shadow-lg ring-1 ring-black/10"
      >
        <span class="solo-timer text-coral-deep">{{ soloDisplay }}</span>
        <span class="flex flex-col items-start leading-tight">
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
        @solo-slam="onSoloSlam"
        @versus-play="onVersusPlay"
        @draw-deck-click="onDrawDeckClick"
      />
    </main>

    <PauseOverlay
      v-if="state.status === 'paused'"
      @resume="onPauseOverlayTap"
    />

    <aside v-if="!isMobile" class="absolute bottom-3 right-3 w-70 max-w-[80vw] z-20">
      <EventLog :events="state.events" />
    </aside>

    <MobileBottomSheet
      v-if="isMobile"
      :open="sheetOpen === 'log'"
      title="Event Log"
      @close="closeSheet"
    >
      <EventLog :events="state.events" />
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
        :strict-prompts="strictPrompts"
        :ai-skill="aiSkill"
        :player-count="playerCount"
        :speed="speed"
        @update:audio-muted="setAudioMuted"
        @update:wisp-enabled="setWispEnabled"
        @update:strict-prompts="setStrictPrompts"
        @update:ai-skill="setAiSkill"
        @update:player-count="setPlayerCount"
        @update:speed="setSpeed"
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
        :strict-prompts="strictPrompts"
        :ai-skill="aiSkill"
        :player-count="playerCount"
        :speed="speed"
        @update:audio-muted="setAudioMuted"
        @update:wisp-enabled="setWispEnabled"
        @update:strict-prompts="setStrictPrompts"
        @update:ai-skill="setAiSkill"
        @update:player-count="setPlayerCount"
        @update:speed="setSpeed"
        @restart="onSettingsRestart"
        @back-to-menu="onSettingsBackToMenu"
      />
    </SidePanel>

    <WinnerOverlay
      :winner-id="winnerId"
      :title="mode === 'solo' ? 'Cleared!' : undefined"
      :headline="mode === 'solo' && soloLastFinalMs !== null ? formatSoloTime(soloLastFinalMs) : undefined"
      :subtitle="mode === 'solo' ? (soloIsNewBest ? 'New best!' : `Best ${soloBestDisplay}`) : undefined"
      :subtitle-tone="soloIsNewBest ? 'celebrate' : 'info'"
      @restart="onRestart"
    />

    <!-- Surfaced when the human draws a Snap matching the current beat — they pick
         Left / Right / Keep. AI's pending snap auto-resolves; this only fires for the
         human. -->
    <SnapDirectionPrompt
      :card="pendingSnapCard"
      :open="showSnapChooser"
      @choose="onSnapChoose"
    />
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
</style>
