<script setup lang="ts">
import type { ChantWord } from '@/game/types';
import { computed } from 'vue';

const props = defineProps<{
  word: ChantWord | null;
  visible: boolean;
  /** Optional monotonic seed (typically the parent's shoutKey). Drives a deterministic
   *  random tilt per shout so consecutive bubbles don't all sit at the same angle. */
  seed?: number;
}>();

const wordClass = computed(() => (props.word ? `word-${props.word}` : ''));
const display = computed(() => (props.word ? props.word.toUpperCase() + '!' : ''));

/** Tiny 32-bit LCG seeded by `seed` (or 0). Returns a float in [-1, 1]. */
function pseudoRand(s: number): number {
  // Mash the seed a few times so consecutive integers produce visibly different angles
  // (a plain `(s * 1664525) % 2^32` makes step-by-step seeds look almost linear).
  let x = (s | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = (x ^ (x >>> 16)) >>> 0;
  return (x / 0xffffffff) * 2 - 1;
}

/** Per-shout tilt in degrees, deterministic from `seed`. Spans ±9° so the bubble
 *  feels casually slapped down without overshooting into "tipping over" territory. */
const tiltDeg = computed(() => {
  const r = pseudoRand(props.seed ?? 0);
  return Math.round(r * 90) / 10; // tenths of a degree, ±9°
});
</script>

<template>
  <Transition
    enter-from-class="opacity-0 scale-50 translate-y-2 rotate-12"
    enter-active-class="transition duration-200 ease-out"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="opacity-0 scale-90 -translate-y-2"
  >
    <div
      v-if="visible && word"
      :class="['relative select-none', wordClass]"
      :style="{
        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.35))',
        transform: `rotate(${tiltDeg}deg)`,
      }"
    >
      <!-- Bubble -->
      <div
        class="font-display px-5 py-1.5 uppercase font-extrabold tracking-widest leading-none"
        :style="{
          background: 'var(--word-color, var(--color-coral))',
          border: '3px solid var(--color-cream-soft)',
          color: 'var(--color-cream-soft)',
          fontSize: '26px',
          borderRadius: '22px',
          textShadow: '0 1px 0 rgba(0,0,0,0.18)',
        }"
      >
        {{ display }}
      </div>

      <!-- Tail: a square rotated 45deg. After rotation, the original RIGHT and BOTTOM edges
           form the two visible diagonals of the V pointing down. The TOP and LEFT edges sit
           inside the bubble and are hidden. We draw cream borders only on the visible edges
           so the tail looks like a stroked triangle continuing the bubble's outline. -->
      <div
        class="absolute left-1/2 -translate-x-1/2 rotate-45"
        :style="{
          bottom: '-7px',
          width: '14px',
          height: '14px',
          background: 'var(--word-color, var(--color-coral))',
          borderRight: '3px solid var(--color-cream-soft)',
          borderBottom: '3px solid var(--color-cream-soft)',
        }"
      />
    </div>
  </Transition>
</template>
