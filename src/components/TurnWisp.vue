<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gsap } from 'gsap';

/**
 * Turn-indicator wisp — a translucent coral dot (with a soft cream halo) that hops from
 * seat to seat as the active player rotates. Anchored to each seat pill via the
 * `data-seat-index` attribute (already present on PlayerSeat).
 *
 * Two elements, one GSAP timeline per turn change:
 *  - `.wisp-glow` is a soft cream halo (pure CSS keyframe for the idle pulse).
 *  - `.wisp-dot` is a solid coral-deep pill, white-bordered, ~75% alpha — same style as
 *    the player pills so it reads as "spotlight on this seat" rather than a generic
 *    decoration. The dot also drives the squash-and-stretch on transit: GSAP rotates it
 *    to face the motion vector, stretches it along that axis during the move, then
 *    settles it back to a round dot with a slight overshoot on arrival.
 *
 * Renders nothing in Solo or when disabled via settings. Hidden when seatIndex is -1.
 */

const props = defineProps<{
  /** Index of the seat the wisp should settle on. -1 = hide. */
  seatIndex: number;
  /** When false, the wisp is not rendered at all (settings toggle). */
  enabled: boolean;
}>();

const wispEl = ref<HTMLElement | null>(null);
const dotEl = ref<HTMLElement | null>(null);
/** Current position in GameTable-local pixels. Translated via GSAP. */
const pos = ref<{ x: number; y: number } | null>(null);

let resizeObserver: ResizeObserver | null = null;
/** gsap.core.Animation covers both Tween (gsap.to) and Timeline (squash-stretch transits). */
let activeAnim: gsap.core.Animation | null = null;

/**
 * Centre of the seat pill in coordinates LOCAL TO THE WISP'S OFFSET PARENT (GameTable's
 * root). The wisp is `position: absolute` so its GSAP x/y transforms are relative to
 * that parent — we translate the seat's viewport rect into the parent's coordinate
 * space by subtracting the parent's own rect origin.
 */
function seatCentre(seatIdx: number): { x: number; y: number } | null {
  if (seatIdx < 0 || !wispEl.value) return null;
  const seatEl = document.querySelector<HTMLElement>(`[data-seat-index="${seatIdx}"]`);
  const parent = wispEl.value.offsetParent as HTMLElement | null;
  if (!seatEl || !parent) return null;
  const seatRect = seatEl.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  return {
    x: seatRect.left + seatRect.width / 2 - parentRect.left,
    y: seatRect.top + seatRect.height / 2 - parentRect.top,
  };
}

/**
 * Move the wisp to the given seat. First placement (or `immediate=true`) snaps without
 * animation. Subsequent moves run a GSAP timeline:
 *   1. Rotate the dot to the motion vector and stretch it along that axis (squash perpendicular).
 *   2. Tween the wrapper from current position to target with a soft easing.
 *   3. Recover the dot to scale(1, 1) rotation(0) with a slight overshoot on arrival.
 */
function moveTo(seatIdx: number, immediate = false): void {
  const target = seatCentre(seatIdx);
  if (!target || !wispEl.value) return;

  if (activeAnim) activeAnim.kill();

  if (immediate || pos.value === null) {
    gsap.set(wispEl.value, { x: target.x, y: target.y });
    if (dotEl.value) gsap.set(dotEl.value, { rotation: 0, scaleX: 1, scaleY: 1 });
    pos.value = target;
    return;
  }

  const dx = target.x - pos.value.x;
  const dy = target.y - pos.value.y;
  const distance = Math.hypot(dx, dy);
  pos.value = target;

  // Tiny adjustments (e.g. resize re-anchoring): no squash, just slide.
  if (distance < 4) {
    activeAnim = gsap.to(wispEl.value, {
      x: target.x, y: target.y, duration: 0.25, ease: 'power2.inOut',
    });
    return;
  }

  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Longer travel → more stretch (capped) so a hop to the neighbour squashes less than
  // a flight across the table.
  const stretch = 1 + Math.min(0.55, distance / 500);
  const squash = 1 / stretch;

  const tl = gsap.timeline();
  // 1. Pre-stretch the dot toward the destination.
  if (dotEl.value) {
    tl.to(dotEl.value, {
      rotation: angleDeg, scaleX: stretch, scaleY: squash,
      duration: 0.12, ease: 'power2.out',
    }, 0);
  }
  // 2. Position transit on the wrapper.
  tl.to(wispEl.value, {
    x: target.x, y: target.y,
    duration: 0.55, ease: 'power2.inOut',
  }, 0);
  // 3. Recover the dot with a slight back-out overshoot — gives the arrival a tactile "settle".
  if (dotEl.value) {
    tl.to(dotEl.value, {
      rotation: 0, scaleX: 1, scaleY: 1,
      duration: 0.3, ease: 'back.out(2.2)',
    }, '>-0.12');
  }
  activeAnim = tl;
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
  if (activeAnim) activeAnim.kill();
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
    <!-- Outer cream bloom — pulses gently. Sits behind the dot, mostly there to soften
         the dot's edge against the cream table. -->
    <div class="wisp-glow" />
    <!-- Solid coral dot with cream border, ~75% alpha — same visual language as the
         player pills. Carries the squash-stretch animation during transit. -->
    <div ref="dotEl" class="wisp-dot" />
  </div>
</template>

<style scoped>
.turn-wisp {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  will-change: transform;
}

/**
 * Outer cream bloom. radial-gradient(circle closest-side, ...) so the gradient's 0-alpha
 * stop coincides with the box's closest edge — pixels outside the inscribed circle are
 * already transparent. No visible bounding-box seam regardless of stacking context.
 */
.wisp-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 180px;
  height: 180px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle closest-side,
    rgba(252, 246, 230, 0.55) 0%,
    rgba(252, 246, 230, 0.32) 25%,
    rgba(252, 246, 230, 0.14) 50%,
    rgba(252, 246, 230, 0.04) 78%,
    rgba(252, 246, 230, 0) 100%);
  animation: wisp-glow-pulse 1.8s ease-in-out infinite;
}

/**
 * Solid dot. The OUTER `.wisp-dot` element owns the centering offset (negative top/left
 * margins instead of a transform), so the GSAP-applied rotation + scale during transit
 * compose cleanly with it. No CSS transform on this element at rest = no conflict with
 * GSAP's idle state of { rotation:0, scaleX:1, scaleY:1 }.
 */
.wisp-dot {
  position: absolute;
  top: -14px;
  left: -14px;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: rgba(201, 84, 59, 0.78);
  border: 2px solid rgba(252, 246, 230, 0.92);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.18);
  will-change: transform;
}

@keyframes wisp-glow-pulse {
  0%, 100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
  50%      { opacity: 1;    transform: translate(-50%, -50%) scale(1.05); }
}
</style>
