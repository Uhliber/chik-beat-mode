<script setup lang="ts">
/**
 * The tabletop the game is played on. A rounded rectangle tilted around the X axis via
 * CSS 3D perspective — from the viewer's angle it reads as a trapezium with soft
 * corners (top edge foreshortened, bottom edge wider). Sits at the back of the
 * GameTable's stacking context so seats, prompt stacks, wisp, etc. paint above it.
 */
</script>

<template>
  <div class="table-surface" aria-hidden="true">
    <div class="table-top" />
  </div>
</template>

<style scoped>
.table-surface {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  perspective: 1200px;
  perspective-origin: 50% 100%;
}
.table-top {
  width: min(82%, 760px);
  height: min(78%, 540px);
  /** Warm woodish tone — slightly darker and a touch warmer than the body coral so the
   *  surface reads as a separate plane without going muddy. Vertical gradient adds a
   *  subtle far-edge shadow. */
  background:
    linear-gradient(180deg, rgba(180, 70, 55, 0.55) 0%, rgba(140, 55, 40, 0.75) 100%);
  border-radius: 64px;
  transform: rotateX(34deg);
  transform-origin: center;
  box-shadow:
    0 32px 60px rgba(60, 20, 12, 0.4),
    inset 0 -8px 18px rgba(0, 0, 0, 0.22),
    inset 0 2px 4px rgba(255, 240, 220, 0.08);
}
</style>
