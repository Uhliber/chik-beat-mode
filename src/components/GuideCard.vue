<script setup lang="ts">
import { computed, ref } from 'vue';
import GuideContent from './GuideContent.vue';

/**
 * "How to Play" card.
 *
 *  - Desktop (default): in-place card in the aside, flips + grows on hover.
 *  - Mobile (`mobile` prop): a slim TAB that PEEKS in from the right edge of the screen,
 *    with a rotated "GUIDE" label running along it. Tap → opens a near-full-screen modal
 *    teleported to body. No inline icon, no hover (no hover on touch).
 */

defineProps<{
  mobile?: boolean;
  mode?: 'simulation' | 'play' | 'solo';
  /**
   * `inline` (mobile only): drop the fixed-position bottom-right edge tab and render the
   * Guide tile in normal flow so a parent (e.g. the Solo foot bar) can lay it out.
   * Visual style and modal behaviour stay the same.
   */
  inline?: boolean;
}>();

const BACK = '/guides/guides-back.png';

const open = ref(false);
const hovering = ref(false);

const toggle = () => { open.value = !open.value; };

// ---- Desktop sizing ----
const SLOT_W = 80;
const SLOT_H = 112;
const PREVIEW_W = 120;
const PREVIEW_H = 168;
const READ_W = 420;
const READ_H = 740;

const slot = computed(() => ({
  width: (open.value ? PREVIEW_W : SLOT_W) + 'px',
  height: (open.value ? PREVIEW_H : SLOT_H) + 'px',
}));

const cardStyle = computed(() => {
  const w = open.value && hovering.value ? READ_W : (open.value ? PREVIEW_W : SLOT_W);
  const h = open.value && hovering.value ? READ_H : (open.value ? PREVIEW_H : SLOT_H);
  return {
    width: w + 'px',
    height: h + 'px',
    zIndex: open.value && hovering.value ? 50 : 'auto',
  };
});
</script>

<template>
  <!-- DESKTOP: in-place flippable card in the aside. -->
  <div
    v-if="!mobile"
    class="relative select-none"
    :style="slot"
    @pointerenter="hovering = true"
    @pointerleave="hovering = false"
  >
    <button
      type="button"
      :title="open ? 'Tap to close guide' : 'Tap to open the rules guide'"
      class="absolute top-0 left-0 focus:outline-none transition-[width,height] duration-300 ease-out cursor-pointer"
      :style="{ ...cardStyle, perspective: '1100px' }"
      @click="toggle"
    >
      <div
        class="relative w-full h-full preserve-3d transition-transform duration-500 ease-out"
        :style="{ transform: open ? 'rotateY(180deg)' : 'rotateY(0deg)' }"
      >
        <div
          class="absolute inset-0 backface-hidden rounded-lg shadow-xl ring-1 ring-black/15"
          :style="{
            backgroundImage: `url(${BACK})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }"
        />
        <div
          class="absolute inset-0 backface-hidden rounded-lg shadow-xl ring-1 ring-black/15 guide-front"
          style="transform: rotateY(180deg);"
        >
          <GuideContent :mode="mode" />
        </div>
      </div>
    </button>
    <div
      v-if="!open"
      class="absolute left-0 -bottom-4 text-[10px] font-bold uppercase tracking-widest text-cream-soft/85 drop-shadow whitespace-nowrap"
    >
      How to play
    </div>
  </div>

  <!-- MOBILE: a guides-back card peeking out from the BOTTOM-RIGHT edge, slanted.
       A small "GUIDE" label sits on the visible portion, parallel to the slant.
       Tap → opens the same full-screen guide modal.
       `inline` variant drops the fixed-position offset so a parent (e.g. Solo foot bar)
       can lay it out within its own flow — same slant + label, just absolute-in-parent. -->
  <button
    v-else
    type="button"
    aria-label="Open rules guide"
    :class="inline ? 'absolute inset-0 z-10 select-none focus:outline-none cursor-pointer' : 'fixed z-30 select-none focus:outline-none cursor-pointer'"
    :style="inline ? {
      transform: 'rotate(-12deg)',
      transformOrigin: 'bottom right',
      touchAction: 'manipulation',
    } : {
      bottom: '80px',
      right: '-60px',
      width: '70px',
      height: '100px',
      transform: 'rotate(-22deg)',
      transformOrigin: 'bottom right',
      touchAction: 'manipulation',
    }"
    @click="open = true"
  >
    <!-- The card itself -->
    <div
      class="absolute inset-0 rounded-lg ring-1 ring-black/30"
      :style="{
        backgroundImage: `url(${BACK})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: '-6px 6px 18px rgba(0,0,0,0.40)',
      }"
    />
    <!-- 'GUIDE' label on the visible (left) portion. Inherits the parent's rotation,
         so the text reads parallel to the card's edges. -->
    <span
      class="absolute font-display font-extrabold uppercase tracking-[0.18em] text-cream-soft"
      style="
        top: -15px;
        left: 5px;
        font-size: 9px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      "
    >
      Guide
    </span>
  </button>

  <!-- Mobile modal — teleported to body, near-full-screen with backdrop.
       Parent uses 100dvh (not 100vh) so it respects the browser's CURRENT visible
       viewport — no clipping into the URL bar / tab bar on iOS. -->
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="mobile && open"
        class="fixed left-0 right-0 z-200 bg-black/55 flex items-center justify-center p-4"
        style="top: 0; height: 100dvh;"
        @click="open = false"
      >
        <Transition
          enter-from-class="opacity-0 scale-90"
          enter-active-class="transition duration-300 ease-out"
          leave-active-class="transition duration-200 ease-in"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="open"
            class="relative rounded-2xl shadow-2xl ring-1 ring-black/15 guide-front"
            :style="{ width: 'min(100%, 480px)', height: 'min(88dvh, 720px)' }"
            @click.stop
          >
            <GuideContent :mode="mode" />
            <button
              type="button"
              class="absolute -top-8 right-2 z-10 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-widest text-cream-soft"
              :style="{ background: 'var(--color-coral)' }"
              @click="open = false"
            >
              Close
            </button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/*
 * Container queries keep typography readable across the small / preview / hovered sizes
 * (and across the mobile modal's natural width).
 */
.guide-front {
  container-type: inline-size;
  background: var(--color-cream-soft);
  color: #3a2a1f;
  font-family: var(--font-body);
  text-align: left;
}

/* Desktop in-place front needs the back-flip transform; mobile modal renders un-flipped. */
.guide-front:not([data-mobile-modal]) {
  /* default — rotateY applied via parent inline style */
}

/*
 * The desktop flip puts the front in a rotateY(180deg) frame, so the front content needs
 * to be counter-rotated. We keep the existing convention: anchor `transform: rotateY(180deg)`
 * on the in-place `.guide-front` so the parent flip un-rotates it. The mobile modal's
 * `.guide-front` lives outside any flipped frame, so we override its transform there.
 */
:deep(.guide-grid) {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 3cqw;
  padding: 3.5cqw 3.5cqw 2.5cqw;
  overflow: auto;
  /* Keep scroll capability (mobile modal can have content taller than the viewport),
     but hide the scrollbar visually so the desktop preview state doesn't show one. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
:deep(.guide-grid)::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

:deep(.left-col),
:deep(.right-col) {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

:deep(.guide-title),
:deep(.chant-title) {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 6cqw;
  line-height: 1;
  color: var(--color-coral);
  text-transform: uppercase;
  margin: 0 0 2.5cqw;
  padding-bottom: 1.4cqw;
  border-bottom: 0.5cqw solid var(--color-coral);
  letter-spacing: 0.02em;
}

:deep(.section) {
  margin-bottom: 1.4cqw;
}

:deep(.section h3) {
  font-family: var(--font-display);
  font-size: 3.4cqw;
  font-weight: 700;
  color: var(--color-coral-deep);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 0.6cqw;
  line-height: 1;
}

:deep(.section p) {
  font-size: 2.65cqw;
  line-height: 1.35;
  margin: 0;
}

:deep(.section strong) {
  font-weight: 700;
  color: #2a1d12;
}

:deep(.section em) {
  font-style: italic;
  color: var(--color-coral-deep);
}

:deep(.card-name) {
  font-family: var(--font-display);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--word-color, var(--color-coral));
}

:deep(.hi-high) {
  color: var(--color-coral);
}

/* Special-cards list */
:deep(.cards-list) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1cqw;
}
:deep(.cards-list li) {
  display: flex;
  align-items: center;
  gap: 1.6cqw;
}
:deep(.mini-card) {
  width: 7cqw;
  height: auto;
  flex-shrink: 0;
  border-radius: 0.6cqw;
  box-shadow: 0 0.3cqw 0.6cqw rgba(0, 0, 0, 0.18);
}
:deep(.cards-list p) {
  margin: 0;
  font-size: 2.5cqw;
  line-height: 1.3;
  flex: 1;
}

/* Right column — chant list */
:deep(.chant-list) {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0.4cqw;
}

:deep(.chant-word) {
  font-family: var(--font-display);
  font-size: 6cqw;
  font-weight: 800;
  text-transform: uppercase;
  line-height: 1;
  color: var(--word-color);
  letter-spacing: 0.02em;
}

:deep(.chant-list-arrow) {
  font-size: 3.6cqw;
  color: var(--color-coral);
  font-weight: 800;
  line-height: 1;
  margin: -0.4cqw 0;
  opacity: 0.65;
}

:deep(.chant-loop) {
  margin-top: 1.5cqw;
  font-size: 2.5cqw;
  color: rgba(60, 40, 30, 0.45);
  font-style: italic;
}
</style>
