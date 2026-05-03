<script setup lang="ts">
import { computed } from 'vue';
import CardView from './CardView.vue';
import type { BasePile } from '@/game/Game';
import type { ChantWord } from '@/game/types';

const props = defineProps<{
  pile: BasePile;
  size?: number;
  /** Card IDs that are mid-flight; suppress their render in the pile until the animation lands. */
  inFlightIds?: Set<string>;
  /** ID of the most-recently slammed card across the whole table; render a glow on it if it's our top. */
  lastPlayedCardId?: string | null;
}>();

const w = computed(() => props.size ?? 90);
const h = computed(() => Math.round(w.value * 1.4));

/** Cards visible (not in-flight) on this pile. */
const visiblePile = computed(() =>
  props.inFlightIds
    ? props.pile.pile.filter((c) => !props.inFlightIds!.has(c.id))
    : props.pile.pile,
);

/** Top three (most recent) cards, rendered with a fan-style offset so the base remains visible. */
const stack = computed(() => visiblePile.value.slice(-3));

const wordClass = computed(() => {
  if (props.pile.slot === 'main') return '';
  return `word-${props.pile.slot satisfies ChantWord}`;
});

const baseImage = computed(() => {
  if (props.pile.slot === 'main') return '/cards/main-base.png';
  return `/cards/${props.pile.slot}-base.png`;
});

/** Per-card offset (in px) for the small fan: each newer card sits up + slightly right of the prior. */
const stackOffset = (i: number, n: number) => {
  // i = 0 is oldest visible, i = n-1 is newest (top).
  const step = Math.round(w.value * 0.18);
  const dx = (i - (n - 1) / 2) * (step * 0.55);
  const dy = -i * (step * 0.45);
  const rot = (i - (n - 1) / 2) * 4; // degrees
  return { dx, dy, rot };
};
</script>

<template>
  <!-- Outer area is taller than the base card itself, leaving room for the stack to fan upward. -->
  <div
    :class="['relative', wordClass]"
    :style="{
      width: w + 'px',
      height: h + Math.round(w * 0.3) + 'px',
    }"
  >
    <!-- The base card itself, anchored at the bottom of the area. -->
    <div
      class="absolute left-0 right-0 bottom-0 mx-auto rounded-lg overflow-hidden ring-2 ring-black/10 shadow-md"
      :style="{
        width: w + 'px',
        height: h + 'px',
        backgroundImage: `url(${baseImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }"
    />

    <!-- Stack of slammed cards, each offset so prior cards peek out (and the base shows beneath). -->
    <div
      v-for="(card, i) in stack"
      :key="card.id"
      class="absolute left-1/2 bottom-0"
      :data-base-card-id="card.id"
      :style="{
        transform: `translateX(calc(-50% + ${stackOffset(i, stack.length).dx}px)) translateY(${stackOffset(i, stack.length).dy}px) rotate(${stackOffset(i, stack.length).rot}deg)`,
        zIndex: 10 + i,
      }"
    >
      <div class="relative">
        <CardView :card="card" :face-up="true" :width="w" :static-flip="true" />
        <!-- Subtle glow on the most recently played card across the entire table -->
        <div
          v-if="lastPlayedCardId === card.id"
          class="pointer-events-none absolute -inset-1 rounded-xl"
          :style="{
            boxShadow: '0 0 0 3px rgba(255,255,240,0.85), 0 0 22px 8px var(--word-color, #ffd089)',
            animation: 'last-played-pulse 1.6s ease-in-out infinite',
          }"
        />
      </div>
    </div>

  </div>
</template>

<style>
@keyframes last-played-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%       { transform: scale(1.04); opacity: 0.75; }
}
</style>
