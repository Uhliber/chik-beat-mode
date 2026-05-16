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
  /** Cream tabletop pulled from the theme tokens — `--color-table` for the main fill,
   *  `--color-table-edge` for the darker bottom edge, giving a soft far-edge falloff
   *  under the perspective tilt. */
  background:
    linear-gradient(180deg, var(--color-table) 0%, var(--color-table-edge) 100%);
  border-radius: 64px;
  transform: rotateX(34deg);
  transform-origin: center;
  box-shadow:
    0 14px 28px rgba(60, 20, 12, 0.16),
    inset 0 -3px 8px rgba(0, 0, 0, 0.06);
}
</style>
