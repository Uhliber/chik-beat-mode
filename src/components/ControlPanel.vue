<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SimStatus, SimMode } from '@/game/SimulationController';
import IconVolume from './icons/IconVolume.vue';

const props = defineProps<{
  playerCount: number;
  speed: number;
  status: SimStatus;
  mode: SimMode;
  audioMuted: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:player-count', n: number): void;
  (e: 'update:speed', n: number): void;
  (e: 'update:audio-muted', muted: boolean): void;
  (e: 'restart'): void;
  (e: 'start'): void;
  (e: 'pause'): void;
  (e: 'resume'): void;
}>();

const speedOptions = [0.25, 0.5, 1, 2, 4];
const playerCountOptions = [3, 4, 5, 6];

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

const collapsed = ref(false);
</script>

<template>
  <div
    :class="[
      'text-sm',
      compact
        ? 'flex flex-col gap-3 p-1'
        : 'flex flex-col gap-2 p-3 rounded-2xl bg-cream-soft/95 shadow-lg ring-1 ring-black/10',
    ]"
  >
    <div :class="compact ? 'contents' : 'flex flex-wrap items-center gap-3'">
      <button
        v-if="!compact"
        type="button"
        :aria-label="collapsed ? 'Expand controls' : 'Minimize controls'"
        class="w-7 h-7 rounded-full border border-coral/30 text-coral-deep hover:bg-coral/10 transition-colors flex items-center justify-center"
        @click="collapsed = !collapsed"
      >
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          :style="{
            transition: 'transform 220ms ease-out',
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
          }"
        >
          <polyline points="3 5 6 8 9 5" />
        </svg>
      </button>

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
        v-if="status !== 'idle' && !compact"
        type="button"
        class="px-3 py-2 rounded-full font-bold text-coral border-2 border-coral hover:bg-coral hover:text-cream-soft transition-colors"
        @click="emit('restart')"
      >
        Restart
      </button>
    </div>

    <div
      :class="compact ? 'contents' : 'flex flex-wrap items-center gap-3 overflow-hidden'"
      :style="!compact ? {
        maxHeight: collapsed ? '0px' : '200px',
        maxWidth: collapsed ? '0px' : '1200px',
        opacity: collapsed ? 0 : 1,
        marginTop: collapsed ? '-0.5rem' : '0',
        transition: 'max-height 280ms ease-out, max-width 320ms ease-out, opacity 200ms ease-out, margin-top 200ms ease-out',
      } : undefined"
    >
      <label v-if="mode !== 'solo'" class="flex items-center gap-2">
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

      <button
        type="button"
        :title="audioMuted ? 'Unmute' : 'Mute'"
        class="px-2 py-1.5 rounded-md border border-coral/30 text-coral-deep hover:bg-coral/10 transition-colors flex items-center justify-center"
        @click="emit('update:audio-muted', !audioMuted)"
      >
        <IconVolume :muted="audioMuted" :size="20" />
      </button>

      <label v-if="mode !== 'solo'" class="flex items-center gap-2">
        <span class="text-coral-deep font-bold">Players</span>
        <div class="flex rounded-md overflow-hidden border border-coral/30">
          <button
            v-for="n in playerCountOptions"
            :key="n"
            type="button"
            :class="[
              'px-2.5 py-1 text-xs font-bold transition-colors',
              n === playerCount ? 'text-cream-soft' : 'text-coral-deep hover:bg-coral/10',
            ]"
            :style="{ background: n === playerCount ? 'var(--color-coral)' : 'transparent' }"
            @click="emit('update:player-count', n)"
          >
            {{ n }}
          </button>
        </div>
      </label>
    </div>
  </div>
</template>
