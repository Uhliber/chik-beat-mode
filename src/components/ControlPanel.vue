<script setup lang="ts">
import { computed } from 'vue';
import type { SimStatus, SimMode } from '@/game/SimulationController';
import IconVolume from './icons/IconVolume.vue';

const props = defineProps<{
  playerCount: number;
  failureRate: number;
  speed: number;
  status: SimStatus;
  mode: SimMode;
  audioMuted: boolean;
  beatsPerPlayer: number;
}>();

const emit = defineEmits<{
  (e: 'update:player-count', n: number): void;
  (e: 'update:failure-rate', n: number): void;
  (e: 'update:speed', n: number): void;
  (e: 'update:mode', m: SimMode): void;
  (e: 'update:audio-muted', muted: boolean): void;
  (e: 'update:beats-per-player', n: number): void;
  (e: 'restart'): void;
  (e: 'start'): void;
  (e: 'pause'): void;
  (e: 'resume'): void;
}>();

const speedOptions = [0.25, 0.5, 1, 2, 4];

const primaryLabel = computed(() => {
  switch (props.status) {
    case 'idle':    return 'Start';
    case 'opening': return 'Running…';
    case 'running': return 'Pause';
    case 'paused':  return 'Resume';
    case 'ended':   return 'Restart';
  }
});

const onPrimary = () => {
  if (props.status === 'idle') emit('start');
  else if (props.status === 'running') emit('pause');
  else if (props.status === 'paused') emit('resume');
  else if (props.status === 'ended') emit('restart');
};
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-cream-soft/95 shadow-lg ring-1 ring-black/10 text-sm">
    <!-- Mode toggle: Simulation (free-for-all) vs Play (BEAT mode, P1 = you) -->
    <div class="flex rounded-full overflow-hidden border-2 border-coral">
      <button
        type="button"
        :class="[
          'px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider transition-colors',
          mode === 'simulation' ? 'text-cream-soft' : 'text-coral-deep hover:bg-coral/10',
        ]"
        :style="{ background: mode === 'simulation' ? 'var(--color-coral)' : 'transparent' }"
        @click="emit('update:mode', 'simulation')"
      >
        Simulate
      </button>
      <button
        type="button"
        :class="[
          'px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider transition-colors',
          mode === 'play' ? 'text-cream-soft' : 'text-coral-deep hover:bg-coral/10',
        ]"
        :style="{ background: mode === 'play' ? 'var(--color-coral)' : 'transparent' }"
        @click="emit('update:mode', 'play')"
      >
        Play
      </button>
    </div>

    <!-- Primary action -->
    <button
      type="button"
      class="px-4 py-2 rounded-full font-extrabold uppercase tracking-wider text-cream-soft hover:opacity-90 transition-opacity"
      :style="{ background: 'var(--color-coral)' }"
      :disabled="status === 'opening'"
      @click="onPrimary"
    >
      {{ primaryLabel }}
    </button>
    <button
      v-if="status !== 'idle'"
      type="button"
      class="px-3 py-2 rounded-full font-bold text-coral border-2 border-coral hover:bg-coral hover:text-cream-soft transition-colors"
      @click="emit('restart')"
    >
      Restart
    </button>

    <!-- Player count -->
    <label class="flex items-center gap-2">
      <span class="text-coral-deep font-bold">Players</span>
      <select
        class="px-2 py-1 rounded-md bg-cream border border-coral/30 font-bold text-coral-deep"
        :value="playerCount"
        @change="emit('update:player-count', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="n in [2, 3, 4, 5, 6]" :key="n" :value="n">{{ n }}</option>
      </select>
    </label>

    <!-- Failure rate -->
    <label class="flex items-center gap-2 min-w-[180px]">
      <span class="text-coral-deep font-bold whitespace-nowrap">Failure</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        :value="Math.round(failureRate * 100)"
        class="flex-1 accent-[var(--color-coral)]"
        @input="emit('update:failure-rate', Number(($event.target as HTMLInputElement).value) / 100)"
      />
      <span class="font-mono text-coral-deep w-10 text-right">{{ Math.round(failureRate * 100) }}%</span>
    </label>

    <!-- Beats per player (Play mode only) — controls how many metronome ticks each player
         gets before the BEAT rotates clockwise. -->
    <label v-if="mode === 'play'" class="flex items-center gap-2 min-w-[150px]">
      <span class="text-coral-deep font-bold whitespace-nowrap">Beats</span>
      <input
        type="range"
        min="2"
        max="10"
        step="1"
        :value="beatsPerPlayer"
        class="flex-1 accent-[var(--color-coral)]"
        @input="emit('update:beats-per-player', Number(($event.target as HTMLInputElement).value))"
      />
      <span class="font-mono text-coral-deep w-6 text-right">{{ beatsPerPlayer }}</span>
    </label>

    <!-- Speed -->
    <label class="flex items-center gap-2">
      <span class="text-coral-deep font-bold">Speed</span>
      <div class="flex rounded-md overflow-hidden border border-coral/30">
        <button
          v-for="s in speedOptions"
          :key="s"
          type="button"
          :class="[
            'px-2 py-1 text-xs font-bold transition-colors',
            s === speed ? 'text-cream-soft' : 'text-coral-deep hover:bg-coral/10',
          ]"
          :style="{ background: s === speed ? 'var(--color-coral)' : 'transparent' }"
          @click="emit('update:speed', s)"
        >
          {{ s }}×
        </button>
      </div>
    </label>

    <!-- Audio mute (relevant in Play mode for the beat dings, but always toggleable) -->
    <button
      type="button"
      :title="audioMuted ? 'Unmute beat sounds' : 'Mute beat sounds'"
      class="px-2 py-1.5 rounded-md border border-coral/30 text-coral-deep hover:bg-coral/10 transition-colors flex items-center justify-center"
      @click="emit('update:audio-muted', !audioMuted)"
    >
      <IconVolume :muted="audioMuted" :size="20" />
    </button>
  </div>
</template>
