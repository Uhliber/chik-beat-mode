<script setup lang="ts">
import { computed, ref } from 'vue';
import GuideContent from './GuideContent.vue';

/**
 * "How to Play" card.
 *
 *  - Desktop (default): in-place card in the aside, flips + grows on hover.
 *  - Mobile (`mobile` prop): a full-size guide-back card PEEKING in from the right edge
 *    of the screen — about 40% visible, 60% off-screen — with a "GUIDE" label tucked
 *    above the tilted top edge. Tap → opens a near-full-screen modal teleported to body.
 */

defineProps<{
  mobile?: boolean;
  mode?: 'solo' | 'versus' | 'playground';
  /** When true, the GuideContent renders a "Start tutorial" CTA at the top of the body. */
  supportsTutorial?: boolean;
  /** When true, the tutorial CTA flips to "Replay tutorial" with a check. */
  tutorialCompleted?: boolean;
}>();

const emit = defineEmits<{
  (e: 'start-tutorial'): void;
}>();

function onStartTutorial() {
  open.value = false;        // close the guide so the route change isn't masked
  emit('start-tutorial');
}

const BACK = '/guides/guides-back.png';

const open = ref(false);
const hovering = ref(false);

const toggle = () => { open.value = !open.value; };

// ---- Desktop sizing ----
//
// All four card states (closed / preview / hovered) share the SAME aspect ratio so
// the visible card stays a playing-card shape across transitions. Content is rendered
// once at the read-size dimensions (READ_W × READ_H) and the surrounding scaler is
// `transform: scale()`-ed to fit whichever size we're showing. This keeps the layout
// — font sizes (via cqw), padding, gaps, the two-column grid — proportionally
// IDENTICAL whether the card is tiny or full-size. The previous approach let the
// cqw container shrink to ~120px wide, which made title fonts compute to ~7px and
// the body text essentially unreadable while breaking the relative proportions.
const ASPECT = 0.6;          // width / height
const READ_W = 420;
const READ_H = Math.round(READ_W / ASPECT); // 700
const PREVIEW_W = 130;
const PREVIEW_H = Math.round(PREVIEW_W / ASPECT); // 216
const SLOT_W = 80;
const SLOT_H = Math.round(SLOT_W / ASPECT); // 133

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

/** Scale factor for the inner GuideContent. The content is rendered at READ_W×READ_H
 *  always, then visually scaled to fit the current card size. transform-origin:
 *  top-left so the (0, 0) corner of the content lines up with the card. */
const contentScale = computed(() => {
  if (!open.value) return 0;
  const currentW = hovering.value ? READ_W : PREVIEW_W;
  return currentW / READ_W;
});
const contentStyle = computed(() => ({
  width: READ_W + 'px',
  height: READ_H + 'px',
  transform: `scale(${contentScale.value})`,
  transformOrigin: 'top left',
  transition: 'transform 300ms ease-out',
}));
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
          class="absolute inset-0 backface-hidden rounded-lg shadow-xl ring-1 ring-black/15 guide-front overflow-hidden"
          style="transform: rotateY(180deg);"
        >
          <!-- Inner scaler — fixed READ_W×READ_H so GuideContent's cqw units always
               compute against the same container width. The visible card size is
               handled by scaling THIS wrapper, not by resizing the content. -->
          <div :style="contentStyle">
            <GuideContent
              :mode="mode"
              :supports-tutorial="supportsTutorial"
              :tutorial-completed="tutorialCompleted"
              @start-tutorial="onStartTutorial"
            />
          </div>
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

  <!-- MOBILE: a full-size guide-back card peeking out from the BOTTOM-RIGHT edge,
       slanted. ~60% off-screen, ~40% visible. "GUIDE" label tucked above the tilted
       top edge. Tap → opens the same full-screen guide modal. -->
  <button
    v-else
    type="button"
    aria-label="Open rules guide"
    class="fixed z-30 select-none focus:outline-none cursor-pointer"
    :style="{
      bottom: '-50px',
      right: '-50px',
      width: '80px',
      height: '128px',
      transform: 'rotate(-12deg)',
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
        top: -18px;
        left: 8px;
        font-size: 12px;
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
            <GuideContent
            :mode="mode"
            :supports-tutorial="supportsTutorial"
            :tutorial-completed="tutorialCompleted"
            @start-tutorial="onStartTutorial"
          />
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
 * Surface styles for the flip-card front and the mobile modal panel. Typography and
 * layout for the actual guide body live inside GuideContent.vue, so the rules render
 * identically whether GuideContent is mounted inside this component or anywhere else
 * (e.g. the settings-panel "How to play" overlay in PlayView).
 */
.guide-front {
  background: var(--color-cream-soft);
}
</style>
