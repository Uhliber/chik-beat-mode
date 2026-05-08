<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { GameEvent } from '@/game/types';
import type { SimMode } from '@/game/SimulationController';
import ControlPanel from '@/components/ControlPanel.vue';
import GameTable from '@/components/GameTable.vue';
import EventLog from '@/components/EventLog.vue';
import WinnerOverlay from '@/components/WinnerOverlay.vue';
import GuideCard from '@/components/GuideCard.vue';
import ChantTicker from '@/components/ChantTicker.vue';
import MobileBottomSheet from '@/components/MobileBottomSheet.vue';
import IconVolume from '@/components/icons/IconVolume.vue';
import { useGame } from '@/composables/useGame';
import { useResponsive } from '@/composables/useResponsive';
import type { Card } from '@/game/Card';
import type { Player } from '@/game/Player';
import type { BaseSlot } from '@/game/types';

const route = useRoute();
const router = useRouter();

// Mode is selected by the menu via the `?mode=` query param. Default to 'play' (Versus)
// so an unparameterised /play visit doesn't strand the user on Simulation. The
// ControlPanel (debug/dev) can still flip modes after mount.
function readModeFromRoute(): SimMode {
  const raw = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
  if (raw === 'solo' || raw === 'play' || raw === 'simulation') return raw;
  return 'play';
}

const initialMode = readModeFromRoute();

const {
  game,
  state,
  playerCount,
  failureRate,
  speed,
  mode,
  beatsPerPlayer,
  activeBeatSeatIndex,
  activeBeatTickIndex,
  activeBeatTotalTicks,
  audioMuted,
  chantVirtualPos,
  lastPlayedVirtualPos,
  soloElapsedMs,
  soloPenaltyMs,
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
  setMode,
  setBeatsPerPlayer,
  setAudioMuted,
  setPlayerHuman,
  canSeatBeHuman,
  submitHumanSlam,
} = useGame({ initialMode });

const { isMobile } = useResponsive();

// ControlPanel is a development/debug surface only. Hidden in production builds unless
// the URL includes `?debug=1`. The MobileBottomSheet that wraps the compact ControlPanel
// is gated by the same flag.
const showControlPanel = computed(() => {
  if (import.meta.env.DEV) return true;
  return route.query.debug === '1';
});

const winnerId = computed(() => game.value.winnerId);

/** Format ms as m:ss.cc (centiseconds, two digits). */
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

// Floating "+Ns" bubbles — one per soloPenalty event. They animate upward and fade out
// via CSS, then auto-prune from this list after 1.4s. The auto-finish case emits a single
// consolidated penalty so the bubble label can read e.g. "+12s" without 12 stacked pops.
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

// If player count changes while idle, rebuild the game.
watch(playerCount, () => {
  if (state.status === 'idle') initGame();
});

const onRestart = () => { initGame(); };

const onSlamFromHuman = ({ card, player, targetBase }: { card: Card; player: Player; targetBase: BaseSlot }) => {
  submitHumanSlam({
    playerId: player.id,
    cardId: card.id,
    targetBase,
    shoutedWord: game.value.getRequiredBeat(),
  });
};

const onToggleHuman = (playerId: string) => {
  const p = game.value.players.find((x) => x.id === playerId);
  if (!p) return;
  // In Play (BEAT) mode, only seat 0 (P1) is allowed to be human. Ignore other toggles.
  if (!canSeatBeHuman(playerId)) return;
  setPlayerHuman(playerId, p.isAI); // toggle: was AI -> become human
};

// ---- Mobile-only state: bottom-sheet visibility ----
const sheetOpen = ref<'none' | 'log' | 'controls'>('none');
function openSheet(which: 'log' | 'controls') { sheetOpen.value = which; }
function closeSheet() { sheetOpen.value = 'none'; }

// ---- Mobile Mode dropdown ----
const modeMenuOpen = ref(false);
const MODE_LABELS = { simulation: 'Simulate', play: 'Play', solo: 'Solo' } as const;
const modeLabel = computed(() => MODE_LABELS[mode.value]);
function pickMode(m: 'simulation' | 'play' | 'solo') {
  setMode(m);
  modeMenuOpen.value = false;
}

// Primary action label/handler — mirrors the header button.
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
  if (state.status === 'idle') start();
  else if (state.status === 'running') pause();
  else if (state.status === 'paused') resume();
  else if (state.status === 'ended') onRestart();
}

function onBackToMenu() {
  router.push({ name: 'menu' });
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
        <div>
          <div class="font-display text-cream-soft text-3xl sm:text-4xl tracking-tight leading-none uppercase">
            Chik!
          </div>
          <div class="font-subtitle text-cream-soft/85 text-xs sm:text-sm font-medium">
            Visual Simulation · v0.1
          </div>
        </div>
      </div>
      <ControlPanel
        v-if="showControlPanel"
        :player-count="playerCount"
        :failure-rate="failureRate"
        :speed="speed"
        :status="state.status"
        :mode="mode"
        :audio-muted="audioMuted"
        :beats-per-player="beatsPerPlayer"
        @update:player-count="setPlayerCount"
        @update:failure-rate="setFailureRate"
        @update:speed="setSpeed"
        @update:mode="setMode"
        @update:audio-muted="setAudioMuted"
        @update:beats-per-player="setBeatsPerPlayer"
        @start="start"
        @pause="pause"
        @resume="resume"
        @restart="onRestart"
      />
    </header>

    <!-- ===================== MOBILE HEADER ===================== -->
    <header
      v-else
      class="absolute top-0 left-0 right-0 z-40 flex items-center gap-2 px-3 py-2.5"
    >
      <!-- Title (text-only) — also acts as back-to-menu tap target on mobile. -->
      <button
        type="button"
        class="font-display text-cream-soft text-2xl tracking-tight leading-none uppercase shrink-0 bg-transparent"
        @click="onBackToMenu"
      >
        Chik!
      </button>

      <!-- Mode dropdown — only meaningful when ControlPanel is shown (debug/dev). In
           production the route's ?mode= query is the source of truth, so the dropdown
           is hidden alongside the rest of the debug surface. -->
      <div v-if="showControlPanel" class="relative shrink-0" @click.stop>
        <button
          type="button"
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-cream-soft/95 ring-1 ring-black/10 text-[11px] font-extrabold uppercase tracking-widest text-coral-deep"
          @click="modeMenuOpen = !modeMenuOpen"
        >
          {{ modeLabel }}
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 5 6 8 9 5" />
          </svg>
        </button>
        <Transition
          enter-from-class="opacity-0 scale-95 -translate-y-1"
          enter-active-class="transition duration-150"
          leave-active-class="transition duration-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="modeMenuOpen"
            class="absolute left-0 top-full mt-1 min-w-32 rounded-xl bg-cream-soft shadow-2xl ring-1 ring-black/10 overflow-hidden origin-top-left"
          >
            <button
              v-for="m in (['simulation', 'play', 'solo'] as const)"
              :key="m"
              type="button"
              :class="[
                'w-full px-3 py-2 text-left text-xs font-extrabold uppercase tracking-widest transition-colors',
                mode === m
                  ? 'bg-coral text-cream-soft'
                  : 'text-coral-deep hover:bg-coral/10',
              ]"
              @click="pickMode(m)"
            >
              {{ MODE_LABELS[m] }}
            </button>
          </div>
        </Transition>
      </div>

      <!-- Primary action — Start / Pause / Resume / Restart -->
      <button
        type="button"
        class="px-3 py-1.5 rounded-full font-extrabold uppercase tracking-widest text-[11px] text-cream-soft shrink-0"
        :style="{ background: 'var(--color-coral-deep)', boxShadow: '0 4px 10px rgba(0,0,0,0.25)' }"
        :disabled="state.status === 'opening'"
        @click="onPrimary"
      >
        {{ primaryLabel }}
      </button>

      <!-- Restart icon (mobile header) — only visible mid-run. -->
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

      <!-- Spacer pushes the icon buttons to the right edge. -->
      <div class="flex-1" />

      <!-- Right-side icon buttons: Log + Controls. The Controls icon is only meaningful
           when the ControlPanel is shown; hide it otherwise. -->
      <div class="flex items-center gap-1 shrink-0">
        <button
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
          v-if="showControlPanel"
          type="button"
          aria-label="Controls"
          class="w-9 h-9 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep"
          @click="openSheet('controls')"
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

    <!-- Floating ChantTicker, just below the mobile header. -->
    <div
      v-if="isMobile && mode !== 'solo'"
      class="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      style="top: 56px;"
    >
      <ChantTicker
        :last-played-pos="lastPlayedVirtualPos"
        :next-pos="chantVirtualPos"
      />
    </div>

    <!-- Mobile-only Guide tab + Mute toggle. -->
    <GuideCard v-if="isMobile && mode !== 'solo'" mobile :mode="mode" />
    <button
      v-if="isMobile && mode !== 'solo'"
      type="button"
      :aria-label="audioMuted ? 'Unmute' : 'Mute'"
      class="fixed bottom-3 left-3 z-30 w-10 h-10 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-lg"
      @click="setAudioMuted(!audioMuted)"
    >
      <IconVolume :muted="audioMuted" :size="20" />
    </button>

    <!-- Solo mobile FOOT BAR -->
    <div
      v-if="isMobile && mode === 'solo'"
      class="fixed left-0 right-0 bottom-0 z-30 flex items-center justify-between px-3 pb-3 pt-2"
      :style="{ height: '64px' }"
    >
      <button
        type="button"
        :aria-label="audioMuted ? 'Unmute' : 'Mute'"
        class="w-11 h-11 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-lg"
        @click="setAudioMuted(!audioMuted)"
      >
        <IconVolume :muted="audioMuted" :size="22" />
      </button>
      <div class="relative" style="width: 70px; height: 56px;">
        <GuideCard mobile inline :mode="mode" />
      </div>
    </div>

    <!-- Click-anywhere-outside closes the mode dropdown. -->
    <div
      v-if="isMobile && modeMenuOpen"
      class="fixed inset-0 z-20"
      @click="modeMenuOpen = false"
    />

    <!-- ============== DESKTOP UPPER-LEFT (guide + ticker) ============== -->
    <aside
      v-if="!isMobile"
      class="absolute top-20 sm:top-23 left-3 sm:left-4 z-30 flex flex-col gap-5"
    >
      <GuideCard :mode="mode" />
      <div v-if="mode !== 'solo'" class="pointer-events-none">
        <ChantTicker
          :last-played-pos="lastPlayedVirtualPos"
          :next-pos="chantVirtualPos"
        />
      </div>
    </aside>

    <!-- =============== SOLO TIMER HUD =============== -->
    <div
      v-if="mode === 'solo'"
      class="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-none"
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

    <!-- ===================== TABLE ===================== -->
    <main class="absolute inset-0" :style="{ paddingTop: isMobile ? '116px' : '0' }">
      <GameTable
        :game="game"
        :events="state.events"
        :speed="speed"
        :version="state.version"
        :mode="mode"
        :active-beat-seat-index="activeBeatSeatIndex"
        :active-beat-tick-index="activeBeatTickIndex"
        :active-beat-total-ticks="activeBeatTotalTicks"
        @slam-from-human="onSlamFromHuman"
        @toggle-human="onToggleHuman"
      />
    </main>

    <!-- =================== DESKTOP EVENT LOG =================== -->
    <aside v-if="!isMobile" class="absolute bottom-3 right-3 w-70 max-w-[80vw] z-20">
      <EventLog :events="state.events" />
    </aside>

    <!-- =================== MOBILE BOTTOM SHEETS =================== -->
    <MobileBottomSheet
      v-if="isMobile"
      :open="sheetOpen === 'log'"
      title="Event Log"
      @close="closeSheet"
    >
      <EventLog :events="state.events" />
    </MobileBottomSheet>

    <MobileBottomSheet
      v-if="isMobile && showControlPanel"
      :open="sheetOpen === 'controls'"
      title="Controls"
      @close="closeSheet"
    >
      <ControlPanel
        compact
        :player-count="playerCount"
        :failure-rate="failureRate"
        :speed="speed"
        :status="state.status"
        :mode="mode"
        :audio-muted="audioMuted"
        :beats-per-player="beatsPerPlayer"
        @update:player-count="setPlayerCount"
        @update:failure-rate="setFailureRate"
        @update:speed="setSpeed"
        @update:mode="setMode"
        @update:audio-muted="setAudioMuted"
        @update:beats-per-player="setBeatsPerPlayer"
        @start="start"
        @pause="pause"
        @resume="resume"
        @restart="onRestart"
      />
    </MobileBottomSheet>

    <!-- Winner -->
    <WinnerOverlay
      :winner-id="winnerId"
      :title="mode === 'solo' ? 'Cleared!' : undefined"
      :headline="mode === 'solo' && soloLastFinalMs !== null ? formatSoloTime(soloLastFinalMs) : undefined"
      :subtitle="mode === 'solo' ? (soloIsNewBest ? 'New best!' : `Best ${soloBestDisplay}`) : undefined"
      :subtitle-tone="soloIsNewBest ? 'celebrate' : 'info'"
      @restart="onRestart"
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
