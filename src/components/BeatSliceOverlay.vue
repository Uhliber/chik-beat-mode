<script setup lang="ts">
/**
 * Pie-slice overlay drawn on the table — one wedge per player, pointing toward their seat.
 * The active wedge fills with the player's word color; inactive wedges are transparent.
 *
 * Visible only in Play (BEAT) mode. Sits behind the bases / seats but above the table felt.
 *
 * Coordinate convention matches `useSeatLayout`:
 *   φ = π + (i * 2π / n) — seat 0 at the bottom, increasing clockwise.
 *   x = sin(φ) * r,  y = -cos(φ) * r   (CSS y grows downward)
 */
import { computed } from 'vue';
import type { Player } from '@/game/Player';

const props = defineProps<{
  players: Player[];
  /** Active seat index (0..players.length-1). -1 = no slice highlighted. */
  activeIndex: number;
  /** Outer radius in px — should reach close to the seats. */
  radius: number;
  /** Inner radius in px — leaves a gap at the centre so the bases stay readable. */
  innerRadius: number;
}>();

const PADDING = 6; // small viewport padding

const slices = computed(() => {
  const n = props.players.length;
  if (n === 0) return [];
  const halfWidth = Math.PI / n; // each slice spans 2π/n
  const R = props.radius;
  const r = props.innerRadius;
  return props.players.map((p, i) => {
    const seatPhi = Math.PI + (i * 2 * Math.PI) / n;
    const a1 = seatPhi - halfWidth;
    const a2 = seatPhi + halfWidth;
    // Outer arc endpoints.
    const ox1 = Math.sin(a1) * R;
    const oy1 = -Math.cos(a1) * R;
    const ox2 = Math.sin(a2) * R;
    const oy2 = -Math.cos(a2) * R;
    // Inner arc endpoints.
    const ix1 = Math.sin(a1) * r;
    const iy1 = -Math.cos(a1) * r;
    const ix2 = Math.sin(a2) * r;
    const iy2 = -Math.cos(a2) * r;
    // Donut-sector path: outer arc CW, then inner arc CCW back to start.
    const path = [
      `M ${ix1} ${iy1}`,
      `L ${ox1} ${oy1}`,
      `A ${R} ${R} 0 0 1 ${ox2} ${oy2}`,
      `L ${ix2} ${iy2}`,
      `A ${r} ${r} 0 0 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ');
    const isActive = i === props.activeIndex;
    return {
      id: p.id,
      path,
      word: p.ownedBaseWord ?? null,
      isActive,
    };
  });
});

const size = computed(() => (props.radius + PADDING) * 2);
const half = computed(() => props.radius + PADDING);
</script>

<template>
  <svg
    class="absolute pointer-events-none"
    :width="size"
    :height="size"
    :viewBox="`-${half} -${half} ${size} ${size}`"
    :style="{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }"
  >
    <g>
      <path
        v-for="s in slices"
        :key="s.id"
        :d="s.path"
        :fill="s.word ? `var(--color-${s.word})` : 'var(--color-coral)'"
        :opacity="s.isActive ? 0.32 : 0.06"
        :style="{
          transition: 'opacity 220ms ease',
        }"
      />
      <!-- Subtle center hole so the wedges always read as a donut even before any slam. -->
      <circle
        :r="innerRadius - 1"
        cx="0"
        cy="0"
        fill="none"
        stroke="rgba(60,40,30,0.10)"
        stroke-width="1"
      />
    </g>
  </svg>
</template>
