<script setup lang="ts">
/**
 * Subtle radial burst confetti, anchored to a specific viewport point. Used to
 * celebrate the Chant Power winner at their seat without implying they've won
 * the whole game (which uses the full screen-falling Confetti.vue).
 *
 * Differences from Confetti.vue:
 *  - Pieces burst OUTWARD from a single origin in random directions, instead
 *    of falling from the top of the viewport.
 *  - Pieces fade out where they land (don't continue to the floor).
 *  - Half the piece count and slightly shorter duration so it reads as
 *    "nice flourish" rather than "you won the game".
 *
 * Mount via v-if when a winner is revealed; unmount auto-cleans the animation.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  /** CSS selector for the burst origin element (typically a player's seat pill).
   *  Resolved on mount + on prop change; rect re-anchors on window resize. */
  anchorSelector: string;
}>();

const COLORS = [
  'var(--color-chik)',
  'var(--color-wally)',
  'var(--color-hindo)',
  'var(--color-pop)',
  'var(--color-tambo)',
  'var(--color-riki)',
  'var(--color-cream-soft)',
];

interface Piece {
  id: number;
  size: number;
  delaySec: number;
  durationSec: number;
  driftX: number;
  driftY: number;
  rotStart: number;
  rotEnd: number;
  color: string;
  rounded: boolean;
}

// ~18 pieces — half of the win confetti so it reads as a flourish, not a victory.
const PIECES: Piece[] = Array.from({ length: 18 }, (_, i): Piece => {
  // Burst in a random direction with random spread distance.
  const angle = Math.random() * Math.PI * 2;
  const distance = 80 + Math.random() * 140;
  return {
    id: i,
    size: 5 + Math.random() * 6,
    delaySec: Math.random() * 0.15,
    durationSec: 1.0 + Math.random() * 0.7,
    driftX: Math.cos(angle) * distance,
    driftY: Math.sin(angle) * distance,
    rotStart: Math.random() * 360,
    rotEnd: Math.random() * 720 - 360,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rounded: Math.random() < 0.4,
  };
});

const origin = ref<{ x: number; y: number } | null>(null);

function computeOrigin(): void {
  const el = document.querySelector<HTMLElement>(props.anchorSelector);
  if (!el) { origin.value = null; return; }
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) { origin.value = null; return; }
  origin.value = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  computeOrigin();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(computeOrigin);
    resizeObs.observe(document.body);
  }
  window.addEventListener('resize', computeOrigin);
});
onBeforeUnmount(() => {
  if (resizeObs) resizeObs.disconnect();
  window.removeEventListener('resize', computeOrigin);
});
watch(() => props.anchorSelector, () => requestAnimationFrame(computeOrigin));
</script>

<template>
  <div v-if="origin" class="chant-confetti-root" aria-hidden="true">
    <span
      v-for="p in PIECES"
      :key="p.id"
      class="chant-confetti-piece"
      :style="{
        left: origin.x + 'px',
        top: origin.y + 'px',
        width: p.size + 'px',
        height: p.size + 'px',
        background: p.color,
        borderRadius: p.rounded ? '50%' : '2px',
        animationDelay: p.delaySec + 's',
        animationDuration: p.durationSec + 's',
        ['--drift-x' as string]: p.driftX + 'px',
        ['--drift-y' as string]: p.driftY + 'px',
        ['--rot-start' as string]: p.rotStart + 'deg',
        ['--rot-end' as string]: p.rotEnd + 'deg',
      }"
    />
  </div>
</template>

<style scoped>
.chant-confetti-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 41;
  overflow: visible;
}
.chant-confetti-piece {
  position: absolute;
  transform: translate(-50%, -50%) rotate(var(--rot-start));
  animation: chant-burst cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
  will-change: transform, opacity;
}

@keyframes chant-burst {
  0% {
    transform: translate(-50%, -50%) rotate(var(--rot-start));
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  100% {
    transform:
      translate(calc(-50% + var(--drift-x)), calc(-50% + var(--drift-y)))
      rotate(var(--rot-end));
    opacity: 0;
  }
}
</style>
