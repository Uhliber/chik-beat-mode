<script setup lang="ts">
/**
 * Subtle, dependency-free confetti, pure CSS animation over absolute-positioned divs.
 * The pieces are sampled once on component mount (so they don't reshuffle on re-render),
 * each falls from above the viewport with a random horizontal drift and rotation.
 *
 * Designed to be mounted on a winning event via v-if; once the parent unmounts the
 * component, the animation stops, no manual cleanup needed.
 */

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
  leftPct: number;
  size: number;
  delaySec: number;
  durationSec: number;
  driftPx: number;
  rotStart: number;
  rotEnd: number;
  color: string;
  rounded: boolean;
}

// Generated once per mount.
const PIECES: Piece[] = Array.from({ length: 42 }, (_, i): Piece => ({
  id: i,
  leftPct: Math.random() * 100,
  size: 6 + Math.random() * 8,
  delaySec: Math.random() * 0.8,
  durationSec: 2.4 + Math.random() * 1.6,
  driftPx: -120 + Math.random() * 240,
  rotStart: Math.random() * 360,
  rotEnd: 360 + Math.random() * 720,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  rounded: Math.random() < 0.35,
}));
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-40 overflow-hidden">
    <span
      v-for="p in PIECES"
      :key="p.id"
      class="confetti-piece absolute"
      :style="{
        left: p.leftPct + 'vw',
        top: '-24px',
        width: p.size + 'px',
        height: p.size + 'px',
        background: p.color,
        borderRadius: p.rounded ? '50%' : '2px',
        animationDelay: p.delaySec + 's',
        animationDuration: p.durationSec + 's',
        ['--drift' as string]: p.driftPx + 'px',
        ['--rot-start' as string]: p.rotStart + 'deg',
        ['--rot-end' as string]: p.rotEnd + 'deg',
      }"
    />
  </div>
</template>

<style>
@keyframes confetti-fall {
  0% {
    transform: translate(0, 0) rotate(var(--rot-start));
    opacity: 0;
  }
  6% {
    opacity: 1;
  }
  90% {
    opacity: 0.9;
  }
  100% {
    transform: translate(var(--drift), 110vh) rotate(var(--rot-end));
    opacity: 0;
  }
}

.confetti-piece {
  animation: confetti-fall cubic-bezier(0.25, 0.7, 0.4, 1) forwards;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  will-change: transform, opacity;
}
</style>
