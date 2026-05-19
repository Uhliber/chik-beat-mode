<script setup lang="ts">
import { computed } from 'vue';
import { BEAT_ORDER } from '@/game/Chant';
import type { ChantWord } from '@/game/types';

const props = defineProps<{
  /**
   * Continuous virtual position of the most-recently-played beat. The ticker's CENTER cell
   * shows this word — matching the glowing card on the table. null = no slam yet.
   */
  lastPlayedPos: number | null;
  /** Continuous virtual position of the chant's NEXT REQUIRED beat. */
  nextPos: number;
}>();

interface Cell {
  vp: number;
  word: ChantWord;
  /** Slot offset relative to the center: -1 = before, 0 = current, 1 = next. */
  offset: number;
}

const CELL_WIDTH = 96;

/** The center virtual position. Before any slam we anchor to (nextPos − 1) as a soft pre-state. */
const center = computed(() =>
  props.lastPlayedPos ?? props.nextPos - 1,
);

/**
 * Render 5 cells (offsets -2..+2) but only the middle 3 (-1, 0, +1) are visible.
 * The two off-screen cells exist so the entering and leaving cells can slide in/out
 * smoothly instead of popping.
 */
const cells = computed<Cell[]>(() => {
  const out: Cell[] = [];
  for (let i = -2; i <= 2; i++) {
    const vp = center.value + i;
    const idx = ((vp % BEAT_ORDER.length) + BEAT_ORDER.length) % BEAT_ORDER.length;
    out.push({ vp, word: BEAT_ORDER[idx], offset: i });
  }
  return out;
});

const dimmedCenter = computed(() => props.lastPlayedPos === null);
</script>

<template>
  <div
    class="relative flex items-center rounded-full bg-cream-soft/95 ring-1 ring-coral/30 shadow-lg overflow-hidden"
    :style="{ width: '320px', height: '52px' }"
    data-tutorial-target="chant-ticker"
  >
    <!-- Tiny labels above to clarify what each slot means. -->
    <div class="absolute inset-x-0 -top-4 flex justify-around text-[9px] font-bold uppercase tracking-widest text-cream-soft/85 select-none pointer-events-none">
      <span>Before</span>
      <span class="text-cream-soft">Played</span>
      <span>Next</span>
    </div>

    <div
      v-for="cell in cells"
      :key="cell.vp"
      :class="['absolute font-display uppercase font-bold tracking-wider whitespace-nowrap select-none', `word-${cell.word}`]"
      :style="{
        left: '50%',
        top: '50%',
        transform: `translate(calc(-50% + ${cell.offset * CELL_WIDTH}px), -50%)`,
        color: cell.offset === 0
          ? (dimmedCenter ? 'rgba(60,40,30,0.45)' : 'var(--word-color)')
          : 'rgba(60,40,30,0.5)',
        fontSize: cell.offset === 0 ? '26px' : '14px',
        opacity: Math.abs(cell.offset) > 1 ? 0 : 1,
        transition: 'transform 320ms cubic-bezier(.2,.7,.2,1), color 220ms ease, font-size 220ms ease',
      }"
    >
      {{ cell.word }}
      <span
        v-if="cell.offset === -1"
        class="absolute -right-3 top-1/2 -translate-y-1/2 text-[14px]"
      >‹</span>
      <span
        v-if="cell.offset === 1"
        class="absolute -left-3 top-1/2 -translate-y-1/2 text-[14px]"
      >›</span>
    </div>

    <!-- Edge fades so cells leaving the strip on either side feel like they're sliding out. -->
    <div
      class="absolute top-0 bottom-0 left-0 w-12 pointer-events-none"
      style="background: linear-gradient(to right, var(--color-cream-soft), transparent)"
    />
    <div
      class="absolute top-0 bottom-0 right-0 w-12 pointer-events-none"
      style="background: linear-gradient(to left, var(--color-cream-soft), transparent)"
    />
  </div>
</template>
