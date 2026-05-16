<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gsap } from 'gsap';

/**
 * Turn-indicator wisp — a single glowing blob that hops from seat to seat as the active
 * player rotates. Anchored to each seat pill via the `data-seat-index` attribute (already
 * present on PlayerSeat). One DOM element, one GSAP tween per turn change, one CSS
 * keyframe for the idle pulse — no per-frame JS.
 *
 * Renders nothing in Solo (only one player; nothing to track) or when disabled via
 * settings. Hidden when seatIndex is -1 (pre-setup).
 */

const props = defineProps<{
  /** Index of the seat the wisp should settle on. -1 = hide. */
  seatIndex: number;
  /** When false, the wisp is not rendered at all (settings toggle). */
  enabled: boolean;
}>();

const wispEl = ref<HTMLElement | null>(null);
/** Current position in viewport pixels. Translated via GSAP. */
const pos = ref<{ x: number; y: number } | null>(null);

let resizeObserver: ResizeObserver | null = null;
let activeTween: gsap.core.Tween | null = null;

/** Centre of the seat pill in viewport coordinates, or null if the element isn't mounted. */
function seatCentre(seatIdx: number): { x: number; y: number } | null {
  if (seatIdx < 0) return null;
  const el = document.querySelector<HTMLElement>(`[data-seat-index="${seatIdx}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Tween the wisp to the seat's centre. First placement is instant (no entrance flight). */
function moveTo(seatIdx: number, immediate = false): void {
  const target = seatCentre(seatIdx);
  if (!target || !wispEl.value) return;

  if (activeTween) activeTween.kill();

  if (immediate || pos.value === null) {
    gsap.set(wispEl.value, { x: target.x, y: target.y });
    pos.value = target;
    return;
  }

  pos.value = target;
  activeTween = gsap.to(wispEl.value, {
    x: target.x,
    y: target.y,
    duration: 0.55,
    ease: 'power2.inOut',
  });
}

watch(
  () => props.seatIndex,
  (next) => {
    if (next < 0) return;
    // Re-query on next paint so a freshly-rotated seat layout has settled into the DOM.
    requestAnimationFrame(() => moveTo(next));
  },
);

onMounted(() => {
  // First placement: snap to whichever seat is active right now. No flight on first paint.
  requestAnimationFrame(() => moveTo(props.seatIndex, true));

  // Re-anchor whenever the viewport changes — seat positions are computed from radius
  // which scales with min(viewport). ResizeObserver fires once per layout change.
  resizeObserver = new ResizeObserver(() => {
    if (props.seatIndex >= 0) moveTo(props.seatIndex, true);
  });
  resizeObserver.observe(document.body);
});

onBeforeUnmount(() => {
  if (activeTween) activeTween.kill();
  if (resizeObserver) resizeObserver.disconnect();
});
</script>

<template>
  <div
    v-if="enabled && seatIndex >= 0"
    ref="wispEl"
    class="turn-wisp"
    aria-hidden="true"
  >
    <!-- Outer warm bloom around the active seat. mix-blend screen lifts the coral
         background into a golden haze. -->
    <div class="wisp-glow" />
    <!-- Inner bright core — the "wisp tip" itself, gently pulsing. -->
    <div class="wisp-core" />
  </div>
</template>

<style scoped>
/**
 * The wrapper is positioned via GSAP transforms (x/y). Translate to its own centre via
 * percentage so getBoundingClientRect centres line up.
 */
.turn-wisp {
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 25;
  will-change: transform;
}

/**
 * Outer cream bloom. Plain alpha compositing (no mix-blend-mode) — the previous
 * `screen` blend was subtly changing how the element's edge composited against the
 * coral background, which read as a vertical seam when the glow box clipped to the
 * viewport edge. Plain alpha = a true zero-alpha edge is invisible regardless of
 * underlying colour. Theme cream-soft (#fcf6e6) replaces the yellow palette.
 */
.wisp-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180px;
  height: 180px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle,
    rgba(252, 246, 230, 0.55) 0%,
    rgba(252, 246, 230, 0.30) 22%,
    rgba(252, 246, 230, 0.12) 44%,
    rgba(252, 246, 230, 0.03) 68%,
    rgba(252, 246, 230, 0) 90%);
  animation: wisp-glow-pulse 1.8s ease-in-out infinite;
}

.wisp-core {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle,
    rgba(252, 246, 230, 0.98) 0%,
    rgba(252, 246, 230, 0.65) 45%,
    rgba(252, 246, 230, 0.2) 75%,
    rgba(252, 246, 230, 0) 100%);
  animation: wisp-core-pulse 1.6s ease-in-out infinite;
}

@keyframes wisp-core-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50%      { transform: translate(-50%, -50%) scale(1.18); }
}

@keyframes wisp-glow-pulse {
  0%, 100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
  50%      { opacity: 1;    transform: translate(-50%, -50%) scale(1.05); }
}
</style>
