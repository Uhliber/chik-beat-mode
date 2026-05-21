<script setup lang="ts">
/**
 * TutorialOverlay, bottom-anchored speech card + spotlight backdrop in one component.
 *
 * Layout: portal-rendered to <body>, two layers:
 *   1. Backdrop with a `clip-path: path('evenodd')` cut-out shaped from the spotlight
 *      target's getBoundingClientRect(). Dims the table while leaving the highlighted
 *      element fully visible. Reanchors on resize + orientationchange.
 *   2. A speech card pinned to the bottom-centre (max-width 480px) with copy, icons,
 *      progress pips, Skip/Quit/Next.
 *
 * Presentation only, owns no game state. The parent (PlayView via useTutorial) feeds
 * step content + phase; this component emits player intents back.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { TutorialStep, TutorialIcon } from '@/tutorial/steps';

const props = defineProps<{
  step: TutorialStep | null;
  index: number;
  total: number;
  phase: 'intro' | 'demo' | 'awaiting-input' | 'done';
  /** Pre-resolved CSS selector for the spotlight target (controller computes this). */
  spotlightSelector?: string | null;
  /** Where the speech card should sit on screen. Controller derives this from the
   *  spotlight target's kind so it lands correctly on the first render without racing
   *  the DOM update. */
  cardPosition?: 'top' | 'bottom';
  /** When true, the controller can show the hint copy. */
  hintVisible?: boolean;
  /** Hide the overlay while another modal is on screen (snap chooser, settings sheet). */
  collapsed?: boolean;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'skip-step'): void;
  (e: 'quit'): void;
  (e: 'finish'): void;
}>();

// ---- Icon URL map ----
/** Prompt-icon URLs point at the v1.2 `/new/` set so the tutorial card glyphs
 *  match the icons the player sees on real cards mid-game (PromptPopover loads
 *  from the same files). The new prompt glyphs have directional arrows baked
 *  in, so the legacy `left-right` combo icon was retired, pair a prompt icon
 *  with itself, not with arrows. */
const ICON_URLS: Record<TutorialIcon, string> = {
  left:        '/new/prompt-left.svg',
  right:       '/new/prompt-right.svg',
  free:        '/new/prompt-free.svg',
  stop:        '/new/prompt-stop.svg',
  snap:        '/new/prompt-snap.svg',
  fetch:       '/new/prompt-fetch.svg',
  'deck-off':  '/new/prompt-fetch.svg', // legacy alias, Fetch is the off-deck prompt.
  count:       '/new/count-5.svg',
  'chant-chik': '/new/free-chant-chik-5.png',
};

// ---- Spotlight rect tracking ----
interface Rect { left: number; top: number; width: number; height: number; }
const spotRect = ref<Rect | null>(null);
const viewport = ref({
  width: typeof window !== 'undefined' ? window.innerWidth : 1024,
  height: typeof window !== 'undefined' ? window.innerHeight : 768,
});
const padding = 12; // ring around the highlighted element

function computeSpotRect(): void {
  if (props.collapsed) {
    spotRect.value = null;
    return;
  }
  const selector = props.spotlightSelector ?? null;
  if (!selector) {
    spotRect.value = null;
    return;
  }
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) {
    spotRect.value = null;
    return;
  }
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) {
    spotRect.value = null;
    return;
  }
  spotRect.value = {
    left: r.left - padding,
    top: r.top - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

let resizeObs: ResizeObserver | null = null;
let recomputeTimer: number | null = null;
function debouncedRecompute(): void {
  if (recomputeTimer !== null) clearTimeout(recomputeTimer);
  recomputeTimer = window.setTimeout(() => {
    recomputeTimer = null;
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
    computeSpotRect();
  }, 50);
}

onMounted(() => {
  computeSpotRect();
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

watch(() => props.step?.id, () => {
  // New step, re-anchor next frame so the DOM has reflected any setup() mutations.
  requestAnimationFrame(() => computeSpotRect());
});
watch(() => props.spotlightSelector, () => requestAnimationFrame(() => computeSpotRect()));
watch(() => props.collapsed, computeSpotRect);

// ---- Mask SVG path: full viewport rect with the spot punched out using evenodd. ----
const maskPath = computed(() => {
  if (!spotRect.value) {
    // No spotlight, full-viewport dim with no hole.
    return `M0,0 H100% V100% H0 Z`;
  }
  // Build a path "outer rect" + "inner rounded rect", evenodd punches the inner hole.
  const r = spotRect.value;
  const radius = 12;
  const vw = viewport.value.width;
  const vh = viewport.value.height;
  // Cap inner rect to viewport
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  const right = Math.min(vw, r.left + r.width);
  const bottom = Math.min(vh, r.top + r.height);
  const innerW = right - left;
  const innerH = bottom - top;
  // Outer rect (clockwise) + inner rounded rect (counter-clockwise via evenodd)
  return [
    `M0,0 H${vw} V${vh} H0 Z`,
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
});

// ---- Buttons ----
const showQuitConfirm = ref(false);
function onQuitClick() { showQuitConfirm.value = true; }
function confirmQuit() { showQuitConfirm.value = false; emit('quit'); }
function cancelQuit() { showQuitConfirm.value = false; }

const skipAvailable = computed(() => {
  if (props.phase !== 'awaiting-input') return false;
  const e = props.step?.expect;
  if (!e) return false;
  return e.kind !== 'event';
});
const nextAvailable = computed(() => {
  if (props.phase !== 'intro') return false;
  return !!props.step?.canSkipForward;
});
/** Final "Back to menu" CTA, only shown on the completion celebration screen. */
const finishAvailable = computed(() => props.phase === 'done');

const icons = computed<string[]>(() => (props.step?.icons ?? []).map((i) => ICON_URLS[i]));

// Card placement: passed in from the controller (derived from the spotlight target's
// kind). Local computed just defaults to 'bottom' if the parent didn't specify.
const cardPosition = computed<'top' | 'bottom'>(() => props.cardPosition ?? 'bottom');
</script>

<template>
  <Teleport to="body">
    <div
      v-if="step && !collapsed"
      class="tutorial-root"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial"
    >
      <!-- Spotlight backdrop, full-viewport mask with the highlighted target punched out -->
      <svg
        class="tutorial-spotlight"
        :width="'100%'"
        :height="'100%'"
        :viewBox="`0 0 ${viewport.width} ${viewport.height}`"
        preserveAspectRatio="none"
      >
        <path :d="maskPath" fill="rgba(20, 14, 10, 0.62)" fill-rule="evenodd" />
      </svg>

      <!-- Speech card -->
      <div
        class="tutorial-card"
        :class="[
          { 'is-demo': phase === 'demo' },
          cardPosition === 'top' ? 'pos-top' : 'pos-bottom',
        ]"
      >
        <button
          type="button"
          class="tutorial-quit"
          aria-label="Quit tutorial"
          @click="onQuitClick"
        >×</button>

        <div class="tutorial-breadcrumb">
          <span
            v-for="i in total"
            :key="i"
            class="pip"
            :class="{ 'is-current': i - 1 === index, 'is-past': i - 1 < index }"
          />
          <span class="tutorial-step-label">Step {{ index + 1 }} / {{ total }}</span>
        </div>

        <div v-if="phase === 'done'" class="tutorial-complete-badge">
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Tutorial complete!
        </div>

        <div v-if="icons.length > 0 && phase !== 'done'" class="tutorial-icons">
          <img v-for="(src, i) in icons" :key="i" :src="src" alt="" />
        </div>

        <h3 class="tutorial-title">{{ step.copy.title }}</h3>
        <p class="tutorial-body">{{ step.copy.body }}</p>

        <p v-if="hintVisible && step.hint" class="tutorial-hint">
          <svg
            class="tutorial-hint-icon"
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12.7c.7.7 1.3 1.5 1.6 2.3h4.8c.3-.8.9-1.6 1.6-2.3A7 7 0 0 0 12 2z" />
          </svg>
          {{ step.hint }}
        </p>

        <div class="tutorial-actions">
          <button
            v-if="skipAvailable"
            type="button"
            class="tutorial-skip"
            @click="emit('skip-step')"
          >Skip step</button>
          <span class="tutorial-actions-spacer" />
          <button
            v-if="nextAvailable"
            type="button"
            class="tutorial-next"
            @click="emit('next')"
          >Next</button>
          <button
            v-else-if="finishAvailable"
            type="button"
            class="tutorial-next"
            @click="emit('finish')"
          >Back to menu</button>
          <span v-else-if="phase === 'awaiting-input'" class="tutorial-status">
            <span class="tutorial-pulse" /> Your turn
          </span>
          <span v-else-if="phase === 'demo'" class="tutorial-status">
            <span class="tutorial-pulse is-demo" /> Watch...
          </span>
        </div>
      </div>

      <!-- Quit confirm modal -->
      <div v-if="showQuitConfirm" class="tutorial-confirm" @click.self="cancelQuit">
        <div class="tutorial-confirm-card">
          <p class="tutorial-confirm-text">Quit the tutorial?</p>
          <div class="tutorial-confirm-buttons">
            <button type="button" class="tutorial-confirm-cancel" @click="cancelQuit">Keep going</button>
            <button type="button" class="tutorial-confirm-ok" @click="confirmQuit">Quit</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tutorial-root {
  position: fixed;
  inset: 0;
  z-index: 26; /* above PauseOverlay (z-25), below header (z-30) so back-arrow is reachable */
  pointer-events: none;
}
.tutorial-spotlight {
  position: absolute;
  inset: 0;
  /* The spotlight is purely VISUAL, the mask only paints a hole, but SVG still
   * captures pointer events across its full extent. Setting pointer-events:none lets
   * clicks pass through to whatever's underneath (the spotlighted card, an opponent
   * seat, etc.) so the user can actually interact with the highlighted target. */
  pointer-events: none;
}
.tutorial-card {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: min(100% - 32px, 480px);
  padding: 18px 20px 16px;
  border-radius: 18px;
  background: rgba(255, 244, 226, 0.93);
  backdrop-filter: blur(10px) saturate(120%);
  -webkit-backdrop-filter: blur(10px) saturate(120%);
  color: #2a1d12;
  box-shadow:
    0 20px 40px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(0, 0, 0, 0.06);
  pointer-events: auto;
  animation: tutorial-card-in 280ms cubic-bezier(.2, .8, .2, 1);
  transition: top 240ms cubic-bezier(.2, .7, .2, 1), bottom 240ms cubic-bezier(.2, .7, .2, 1);
}
.tutorial-card.pos-bottom {
  bottom: max(env(safe-area-inset-bottom, 0), 16px);
}
.tutorial-card.pos-top {
  /* Sit BELOW the mobile header (logo + pause/settings icons) so we don't obscure the
   * round controls. The header is ~64px tall plus its top padding; 76px clears it on
   * iOS notch / Android status bar layouts too once env(safe-area-inset-top) is added. */
  top: calc(72px + max(env(safe-area-inset-top, 0px), 0px));
}

/* Desktop: pin the card to the top-left so the table view stays clear. Logo lives at
 * (16px, 16px); the card slots in below it. The pos-top/pos-bottom variants no longer
 * move the card on desktop, the spotlight cut-out alone draws the eye. */
@media (min-width: 768px) {
  .tutorial-card,
  .tutorial-card.pos-top,
  .tutorial-card.pos-bottom {
    left: 16px;
    transform: none;
    top: 96px;
    bottom: auto;
    width: 360px;
  }
}

/* Mobile: smaller footprint + translucent card so the table is still visible
 * through it. The blurred background keeps the copy readable. */
@media (max-width: 767px) {
  .tutorial-card {
    width: min(100% - 24px, 380px);
    background: rgba(255, 244, 226, 0.86);
    padding: 14px 16px 12px;
  }
  .tutorial-title { font-size: 1.02rem; }
  .tutorial-body { font-size: 0.88rem; line-height: 1.35; }
  .tutorial-icons img { height: 30px; width: auto; max-width: 30px; }
}
.tutorial-card.is-demo {
  /* Lower opacity ring while the engine demonstrates so the player's eye goes to the table. */
  opacity: 0.92;
}
.tutorial-quit {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-coral-deep);
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.tutorial-quit:hover { background: rgba(0, 0, 0, 0.12); }

.tutorial-breadcrumb {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 10px;
  padding-right: 36px; /* clear of the quit button */
}
.pip {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: rgba(60, 40, 30, 0.18);
  transition: background-color 150ms ease, transform 150ms ease;
}
.pip.is-past { background: var(--color-coral); }
.pip.is-current {
  background: var(--color-coral-deep);
  transform: scale(1.4);
}
.tutorial-step-label {
  margin-left: auto;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(60, 40, 30, 0.5);
}

.tutorial-complete-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 6px 12px 6px 10px;
  border-radius: 9999px;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  box-shadow: 0 4px 10px rgba(231, 89, 61, 0.35);
  animation: tutorial-badge-in 320ms cubic-bezier(.2, .8, .2, 1.1) both;
}
.tutorial-icons {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.tutorial-icons img {
  /* Square prompt icons (left/right/free/stop/snap/fetch/count) fit a 36×36
   * slot. Card-art icons (chant-chik) are portrait (~0.6:1), height-only
   * sizing with `width: auto` keeps them at their natural aspect ratio
   * instead of squishing them into a square box. */
  height: 36px;
  width: auto;
  max-width: 36px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
}

.tutorial-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-coral-deep);
  letter-spacing: 0.01em;
  line-height: 1.1;
  margin: 0 0 6px;
}
.tutorial-body {
  font-size: 0.92rem;
  line-height: 1.4;
  margin: 0 0 12px;
  color: #3a2a1f;
}
.tutorial-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  line-height: 1.35;
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(231, 89, 61, 0.08);
  color: var(--color-coral-deep);
  font-weight: 600;
}
.tutorial-hint-icon {
  flex-shrink: 0;
}

.tutorial-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tutorial-actions-spacer { flex: 1; }
.tutorial-skip {
  background: transparent;
  color: rgba(60, 40, 30, 0.6);
  border: 0;
  font-weight: 600;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 9999px;
}
.tutorial-skip:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(60, 40, 30, 0.85);
}
.tutorial-next {
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-weight: 800;
  font-size: 0.95rem;
  border: 0;
  padding: 10px 22px;
  border-radius: 9999px;
  cursor: pointer;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.22);
  transition: transform 120ms ease, background-color 120ms ease;
}
.tutorial-next:hover { background: var(--color-coral-deep); }
.tutorial-next:active { transform: scale(0.97); }

.tutorial-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-coral-deep);
}
.tutorial-pulse {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--color-coral-deep);
  animation: tutorial-pulse 1.2s ease-in-out infinite;
}
.tutorial-pulse.is-demo { background: rgba(60, 40, 30, 0.5); }

.tutorial-confirm {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  z-index: 1;
}
.tutorial-confirm-card {
  background: var(--color-cream-soft);
  padding: 20px 22px;
  border-radius: 16px;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
  text-align: center;
  width: min(100% - 48px, 320px);
}
.tutorial-confirm-text {
  font-family: var(--font-display);
  font-size: 1.1rem;
  margin: 0 0 16px;
  color: var(--color-coral-deep);
}
.tutorial-confirm-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.tutorial-confirm-cancel,
.tutorial-confirm-ok {
  padding: 8px 16px;
  border-radius: 9999px;
  border: 0;
  cursor: pointer;
  font-weight: 700;
}
.tutorial-confirm-cancel {
  background: rgba(0, 0, 0, 0.08);
  color: #3a2a1f;
}
.tutorial-confirm-ok {
  background: var(--color-coral);
  color: var(--color-cream-soft);
}

@keyframes tutorial-card-in {
  /* Opacity-only so it composes cleanly with the centring transform on mobile
   * (translateX(-50%)) AND the static transform: none on desktop. */
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes tutorial-badge-in {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes tutorial-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.55; }
}
</style>
