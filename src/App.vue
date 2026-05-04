<script setup lang="ts">
import { computed, watch } from 'vue';
import ControlPanel from './components/ControlPanel.vue';
import GameTable from './components/GameTable.vue';
import EventLog from './components/EventLog.vue';
import WinnerOverlay from './components/WinnerOverlay.vue';
import GuideCard from './components/GuideCard.vue';
import ChantTicker from './components/ChantTicker.vue';
import { useGame } from './composables/useGame';
import type { Card } from './game/Card';
import type { Player } from './game/Player';
import type { BaseSlot } from './game/types';

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
} = useGame();

const winnerId = computed(() => game.value.winnerId);

// If player count changes while idle, rebuild the game.
watch(playerCount, () => {
  if (state.status === 'idle') initGame();
});

const onRestart = () => {
  initGame();
};

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
</script>

<template>
  <div class="relative w-screen h-screen overflow-hidden">
    <!-- Header -->
    <header class="absolute top-0 left-0 right-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-14 rounded-md ring-2 ring-cream-soft/70 shadow-md"
          style="background-image: url('/cards/default-back.png'); background-size: cover; background-position: center;"
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

    <!-- Upper-left column: rules guide + chant ticker. Stacked here so neither overlaps the
         top player's seat. The ticker's center always shows the most-recently-played beat,
         matching the highlighted card on the table. -->
    <aside class="absolute top-20 sm:top-23 left-3 sm:left-4 z-30 flex flex-col gap-5">
      <GuideCard />
      <div class="pointer-events-none">
        <ChantTicker
          :last-played-pos="lastPlayedVirtualPos"
          :next-pos="chantVirtualPos"
        />
      </div>
    </aside>

    <!-- Table -->
    <main class="absolute inset-0">
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

    <!-- Event log (right side, collapsible on mobile via opacity) -->
    <aside class="absolute bottom-3 right-3 w-[280px] max-w-[80vw] z-20 hidden md:block">
      <EventLog :events="state.events" />
    </aside>

    <!-- Mobile event log: small chip at the bottom -->
    <aside class="absolute bottom-2 left-1/2 -translate-x-1/2 md:hidden text-cream-soft/80 text-xs font-mono z-20">
      <span v-if="state.events.length">
        last:
        {{
          (() => {
            const e = state.events[state.events.length - 1];
            return e.kind;
          })()
        }}
      </span>
    </aside>

    <!-- Winner -->
    <WinnerOverlay :winner-id="winnerId" @restart="onRestart" />
  </div>
</template>
