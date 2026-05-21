<script setup lang="ts">
/**
 * Visual layer for the Chant Trigger. Borrows the spotlight technique used by
 * TutorialOverlay: a full-viewport SVG `<path>` with `fill-rule="evenodd"` whose
 * outer rectangle is punched out by inner rounded rectangles around the elements
 * we want to keep visible. The punched regions render at full brightness/color
 * (no filter mucking with chant-word tints); everything else sits behind a 0.62-
 * opacity dark wash.
 *
 * Spotlighted targets:
 *   - `.lottery-banner` (self) — the current chant beat readout
 *   - `[data-chant-spotlight]` — each seat's count-spotlight wrapper
 *
 * Recomputed on mount, on currentBeat change (recital may have animated new
 * spotlights into view), and on window resize / orientationchange.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import type { ChantWord } from '@/game/types';

const props = defineProps<{
  /** True while a Chant Trigger is in flight. */
  active: boolean;
  /** The beat being spoken at the current recital step. Drives the lottery banner —
   *  cycles through beats live during the recital, then naturally freezes on the
   *  LAST step's beat (which is the landed beat). */
  currentBeat: ChantWord | null;
}>();

const beatLabel = computed(() => props.currentBeat ? props.currentBeat.toUpperCase() : '');
const beatWordClass = computed(() => props.currentBeat ? `word-${props.currentBeat}` : '');

const bannerEl = ref<HTMLElement | null>(null);

/** A hole punched into the dim wash. `rect` = rounded rectangle (lottery banner);
 *  `circle` = perfect circle (count spotlights, to match the circular badges). */
type Hole =
  | { kind: 'rect'; left: number; top: number; width: number; height: number }
  | { kind: 'circle'; cx: number; cy: number; r: number };
const holes = ref<Hole[]>([]);
const viewport = ref({
  width: typeof window !== 'undefined' ? window.innerWidth : 1024,
  height: typeof window !== 'undefined' ? window.innerHeight : 768,
});
const RECT_PAD = 18;     // padding around rectangular targets (banner)
const RECT_RADIUS = 16;  // rounded-rect corner radius
const CIRCLE_PAD = 14;   // padding added to the circle hole's radius

function rectHole(el: Element | null): Hole | null {
  if (!el) return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    kind: 'rect',
    left: r.left - RECT_PAD,
    top: r.top - RECT_PAD,
    width: r.width + RECT_PAD * 2,
    height: r.height + RECT_PAD * 2,
  };
}

function circleHole(el: Element | null): Hole | null {
  if (!el) return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  // Circle radius spans the longer side so a non-square wrapper still encloses
  // the badge fully, plus a soft padding so the hole's edge doesn't kiss the
  // badge boundary.
  const radius = Math.max(r.width, r.height) / 2 + CIRCLE_PAD;
  return { kind: 'circle', cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: radius };
}

function computeHoles(): void {
  if (!props.active) { holes.value = []; return; }
  const out: Hole[] = [];
  // Lottery banner (this component's own element).
  const banner = rectHole(bannerEl.value);
  if (banner) out.push(banner);
  // Per-seat count spotlights — circular punches sized to include the orbiting
  // ChantPips (which live INSIDE the spotlight wrapper and extend its bounding
  // box). The badge + ring share one hole.
  //
  // Speech bubbles deliberately AREN'T spotlit — they sit behind the dim wash
  // and pop briefly per recital step as ambient flavor, without competing with
  // the bright spotlights for attention.
  document.querySelectorAll('[data-chant-spotlight]').forEach((el) => {
    const c = circleHole(el);
    if (c) out.push(c);
  });
  holes.value = out;
}

let resizeObs: ResizeObserver | null = null;
let recomputeTimer: number | null = null;
function debouncedRecompute(): void {
  if (recomputeTimer !== null) clearTimeout(recomputeTimer);
  recomputeTimer = window.setTimeout(() => {
    recomputeTimer = null;
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
    computeHoles();
  }, 40);
}

onMounted(() => {
  computeHoles();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(debouncedRecompute);
    resizeObs.observe(document.body);
  }
  window.addEventListener('orientationchange', debouncedRecompute);
  window.addEventListener('resize', debouncedRecompute);
});

onBeforeUnmount(() => {
  if (resizeObs) resizeObs.disconnect();
  window.removeEventListener('orientationchange', debouncedRecompute);
  window.removeEventListener('resize', debouncedRecompute);
  if (recomputeTimer !== null) clearTimeout(recomputeTimer);
});

// Re-anchor whenever the active flag toggles (count spotlights mount/unmount + the
// banner DOM appears) or when the recital ticks to a new beat (spotlight scale may
// have settled by the next frame).
watch(() => props.active, async () => {
  await nextTick();
  // Two-frame defer: the count spotlights have a CSS transform transition (380ms),
  // but their final-state rect is what we want to anchor to. requestAnimationFrame
  // chained twice lets the transition start, then settle to its final geometry
  // before we measure — without waiting the full transition duration.
  requestAnimationFrame(() => requestAnimationFrame(computeHoles));
});
watch(() => props.currentBeat, async () => {
  await nextTick();
  computeHoles();
});

// Build the mask path: outer viewport rect + one inner subpath per hole. Evenodd
// fill rule turns the inner subpaths into punch-outs (the dim stops at each hole).
// Rect holes render as rounded rectangles; circle holes render as two-arc circles
// so they match the round popover badges visually.
const maskPath = computed(() => {
  const vw = viewport.value.width;
  const vh = viewport.value.height;
  let path = `M0,0 H${vw} V${vh} H0 Z`;
  for (const h of holes.value) {
    if (h.kind === 'rect') {
      const left = Math.max(0, h.left);
      const top = Math.max(0, h.top);
      const right = Math.min(vw, h.left + h.width);
      const bottom = Math.min(vh, h.top + h.height);
      const innerW = right - left;
      const innerH = bottom - top;
      if (innerW <= 0 || innerH <= 0) continue;
      const radius = Math.min(RECT_RADIUS, innerW / 2, innerH / 2);
      path += ' ' + [
        `M${left + radius},${top}`,
        `H${left + innerW - radius}`,
        `Q${left + innerW},${top} ${left + innerW},${top + radius}`,
        `V${top + innerH - radius}`,
        `Q${left + innerW},${top + innerH} ${left + innerW - radius},${top + innerH}`,
        `H${left + radius}`,
        `Q${left},${top + innerH} ${left},${top + innerH - radius}`,
        `V${top + radius}`,
        `Q${left},${top} ${left + radius},${top}`,
        `Z`,
      ].join(' ');
    } else {
      // Circle hole: SVG's "two semicircle arcs" trick. Start at the right edge,
      // sweep half a circle to the left edge, sweep the other half back. Both arcs
      // are direction-agnostic for evenodd punch-out purposes.
      if (h.r <= 0) continue;
      path += ` M${h.cx + h.r},${h.cy} A${h.r},${h.r} 0 0,1 ${h.cx - h.r},${h.cy} A${h.r},${h.r} 0 0,1 ${h.cx + h.r},${h.cy} Z`;
    }
  }
  return path;
});
</script>

<template>
  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition duration-300"
    leave-active-class="transition duration-400"
    leave-to-class="opacity-0"
  >
    <div v-if="active" class="chant-overlay" aria-hidden="true">
      <!-- Spotlight mask: full-viewport dim with rounded-rect punch-outs around the
           banner + every count spotlight. Like the tutorial overlay, this preserves
           the highlighted elements' true colors — the dim only paints the wash. -->
      <svg
        class="chant-spotlight-mask"
        :width="'100%'"
        :height="'100%'"
        :viewBox="`0 0 ${viewport.width} ${viewport.height}`"
        preserveAspectRatio="none"
      >
        <path :d="maskPath" fill="rgba(20, 14, 10, 0.62)" fill-rule="evenodd" />
      </svg>

      <!-- Lottery banner: a single big beat word that re-renders per recital step.
           The :key on the inner span forces Vue to remount the element each beat
           change so the flip animation re-fires — gives the lottery wheel its
           ticking, slot-machine feel. Once the recital ends, this freezes on
           whatever the final beat was (which IS the landed beat). -->
      <div v-if="currentBeat" ref="bannerEl" class="lottery-banner" :class="beatWordClass">
        <Transition name="lottery" mode="out-in">
          <span :key="currentBeat" class="lottery-word">{{ beatLabel }}</span>
        </Transition>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.chant-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}
.chant-spotlight-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Lottery banner — single beat word, large, centered over the table (overlapping
 * the deck area). Sits ABOVE the mask (the mask punches a hole around it via the
 * bannerEl ref) so its colors render true regardless of the wash. Centering at the
 * table center also leaves the top-of-screen seat (P3 on radial layouts) clear so
 * its count spotlight isn't covered. */
.lottery-banner {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 26px;
  border-radius: 18px;
  background: var(--color-cream-soft);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.5);
  animation: banner-in 360ms cubic-bezier(.2, .8, .2, 1);
  min-width: 200px;
  min-height: 60px;
}
.lottery-word {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 2.1rem;
  letter-spacing: 0.06em;
  line-height: 1;
  color: var(--word-color, var(--color-coral-deep));
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.08);
  display: inline-block;
}

@keyframes banner-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% - 12px)) scale(0.85); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* Per-step lottery transition — slot-machine style flip. */
.lottery-enter-active,
.lottery-leave-active {
  transition: transform 160ms cubic-bezier(.2, .8, .2, 1), opacity 140ms ease;
}
.lottery-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.9);
}
.lottery-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.95);
}
</style>
