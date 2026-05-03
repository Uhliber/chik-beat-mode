<script setup lang="ts">
/**
 * Pie-slice overlay drawn on the table — one wedge per player, pointing toward their seat.
 * The active wedge fills with the player's word color; inactive wedges are nearly transparent.
 *
 * Two layouts:
 *   'radial'  — desktop. Each seat gets an even slice of the full circle (existing behaviour).
 *   'half'    — mobile portrait. Top semicircle is divided into N-1 wedges (one per opponent,
 *               aligned with the semicircle seat layout); bottom semicircle is one big P1 wedge.
 *
 * Visible only in Play (BEAT) mode. Sits behind the bases / seats but above the table felt.
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
  /** Pie layout mode. */
  mode?: 'radial' | 'half';
}>();

const PADDING = 6; // small viewport padding

/**
 * Build a donut-sector SVG path.
 *
 *  - 'radial' positions are computed with the original convention:
 *      x = sin(a)·rad,  y = -cos(a)·rad   (a measured from north CCW)
 *  - 'half' positions use the semicircle convention (matches useSeatLayout's semicircle mode):
 *      x = -sin(a)·rad, y =  cos(a)·rad   (a measured from south CW)
 *
 * The arc is split at its midpoint so SVG never has to disambiguate a 180° span — both halves
 * are < 180° regardless of how wide the wedge is.
 */
function donutSectorPath(
  a1: number,
  a2: number,
  R: number,
  r: number,
  layout: 'radial' | 'half',
): string {
  const aMid = (a1 + a2) / 2;
  const toCss = (a: number, rad: number) => {
    if (layout === 'half') {
      return { x: -Math.sin(a) * rad, y: Math.cos(a) * rad };
    }
    return { x: Math.sin(a) * rad, y: -Math.cos(a) * rad };
  };
  const o1 = toCss(a1, R), oMid = toCss(aMid, R), o2 = toCss(a2, R);
  const i1 = toCss(a1, r), iMid = toCss(aMid, r), i2 = toCss(a2, r);
  return [
    `M ${i1.x} ${i1.y}`,
    `L ${o1.x} ${o1.y}`,
    `A ${R} ${R} 0 0 1 ${oMid.x} ${oMid.y}`,
    `A ${R} ${R} 0 0 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${r} ${r} 0 0 0 ${iMid.x} ${iMid.y}`,
    `A ${r} ${r} 0 0 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

const slices = computed(() => {
  const n = props.players.length;
  if (n === 0) return [];
  const layout: 'radial' | 'half' = props.mode ?? 'radial';
  const R = props.radius;
  const r = props.innerRadius;

  if (layout === 'half') {
    // Semicircle layout: P1 owns the entire bottom half; opponents share the top half.
    const opps = n - 1;
    return props.players.map((p, i) => {
      let a1: number, a2: number;
      if (i === 0) {
        // P1 bottom semicircle, from east (a=-π/2) CW through south (0) to west (π/2).
        a1 = -Math.PI / 2;
        a2 = Math.PI / 2;
      } else if (opps <= 1) {
        // Single opponent → entire top semicircle.
        a1 = Math.PI / 2;
        a2 = (3 * Math.PI) / 2;
      } else {
        // Top half divided evenly across (N-1) opponents.
        a1 = Math.PI / 2 + (i - 1) * (Math.PI / opps);
        a2 = Math.PI / 2 + i * (Math.PI / opps);
      }
      return {
        id: p.id,
        path: donutSectorPath(a1, a2, R, r, 'half'),
        word: p.ownedBaseWord ?? null,
        isActive: i === props.activeIndex,
      };
    });
  }

  // 'radial' (desktop) — even slices around the full circle.
  const halfWidth = Math.PI / n; // each slice spans 2π/n
  return props.players.map((p, i) => {
    const seatPhi = Math.PI + (i * 2 * Math.PI) / n;
    const a1 = seatPhi - halfWidth;
    const a2 = seatPhi + halfWidth;
    return {
      id: p.id,
      path: donutSectorPath(a1, a2, R, r, 'radial'),
      word: p.ownedBaseWord ?? null,
      isActive: i === props.activeIndex,
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
