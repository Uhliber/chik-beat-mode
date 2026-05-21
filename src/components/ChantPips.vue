<script setup lang="ts">
/**
 * Per-player visual count for the Chant Trigger recital. Renders N pips in a shallow
 * arc above the player's prompt card; N = the active prompt's count value. As the
 * recital reaches this seat, pips light up one beat at a time until all `count` pips
 * are lit, then the recital advances to the next seat clockwise.
 *
 * The lit pip wears the chant-word color of the beat being spoken so the player can
 * see WHICH beat just landed at their seat (chik = coral, wally = gold, etc).
 *
 * Hidden when `count === 0` or `active === false`.
 */
import { computed } from 'vue';
import type { ChantWord } from '@/game/types';

const BEAT_ORDER: readonly ChantWord[] = ['chik', 'wally', 'hindo', 'pop', 'tambo', 'riki', 'chik'];

const props = defineProps<{
  /** Total pips = the player's active prompt count. 0 = no pips drawn. */
  count: number;
  /** Number of pips already lit (recital steps "spoken" at this seat). */
  lit: number;
  /** True while a Chant Trigger is in flight (otherwise hidden). */
  active: boolean;
  /** Step counter that began at the start of THIS seat's recital run — used to derive
   *  which beat word each lit pip represents. The chant beat advances monotonically
   *  across the whole recital (not just per seat), so we need the global step offset
   *  at the moment this seat's run started. */
  startStep: number;
}>();

const visible = computed(() => props.active && props.count > 0);

interface Pip {
  index: number;
  lit: boolean;
  fresh: boolean;       // just lit on this render
  word: ChantWord;
  arcX: number;         // horizontal offset for the arc
  arcY: number;         // vertical offset for the arc
  rot: number;          // mild rotation per pip
}

const pips = computed<Pip[]>(() => {
  const n = props.count;
  if (n <= 0) return [];
  // Lay out pips in a shallow arc. The arc spans up to ~140° for many pips, but
  // tightens for small counts. Center pip(s) are highest; outer pips fan down.
  const spreadDeg = Math.min(140, 18 * n);
  const radius = Math.max(40, 14 * n);
  const out: Pip[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;             // -0.5 … +0.5
    const angle = (t * spreadDeg) * (Math.PI / 180);          // radians from vertical
    const arcX = Math.sin(angle) * radius;
    const arcY = -Math.cos(angle) * radius;                   // negative = up from baseline
    // Beat word for this pip = BEAT_ORDER[(startStep + i) % 7].
    const beatIdx = (props.startStep + i) % BEAT_ORDER.length;
    out.push({
      index: i,
      lit: i < props.lit,
      fresh: i === props.lit - 1,
      word: BEAT_ORDER[beatIdx],
      arcX,
      arcY,
      rot: t * 12,
    });
  }
  return out;
});
</script>

<template>
  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition duration-200"
    leave-active-class="transition duration-200"
    leave-to-class="opacity-0"
  >
    <div v-if="visible" class="chant-pips" aria-hidden="true">
      <div
        v-for="p in pips"
        :key="p.index"
        :class="['pip', `word-${p.word}`, { 'is-lit': p.lit, 'is-fresh': p.fresh }]"
        :style="{
          transform: `translate(${p.arcX}px, ${p.arcY}px) rotate(${p.rot}deg)`,
        }"
      />
    </div>
  </Transition>
</template>

<style scoped>
/* The container has no size of its own — pips are absolutely positioned via translate
 * so they fan around a baseline anchored to the parent (PlayerSeat). The chant
 * spotlight (SVG mask in ChantTriggerOverlay) punches a hole around each seat that
 * surfaces these pips above the dim backdrop without recoloring them. */
.chant-pips {
  position: relative;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 36;
}

.pip {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: rgba(252, 246, 230, 0.32);
  border: 1.5px solid rgba(252, 246, 230, 0.7);
  margin-left: -7px;
  margin-top: -7px;
  transition: background-color 200ms ease, border-color 200ms ease, transform 280ms cubic-bezier(.2, .8, .2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.pip.is-lit {
  background: var(--word-color, var(--color-coral));
  border-color: var(--color-cream-soft);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.45),
    0 0 8px 2px var(--word-color, rgba(231, 89, 61, 0.55));
}

.pip.is-fresh {
  animation: pip-pop 380ms cubic-bezier(.2, .8, .2, 1);
}

@keyframes pip-pop {
  0%   { transform: translate(var(--arc-x, 0), var(--arc-y, 0)) scale(0.4); }
  55%  { transform: translate(var(--arc-x, 0), var(--arc-y, 0)) scale(1.6); }
  100% { transform: translate(var(--arc-x, 0), var(--arc-y, 0)) scale(1); }
}
</style>
