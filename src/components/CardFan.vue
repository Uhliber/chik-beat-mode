<script setup lang="ts">
import { computed } from 'vue';
import CardView from './CardView.vue';
import type { Card } from '@/game/Card';

const props = defineProps<{
  cards: Card[];
  faceUp: boolean;
  cardWidth?: number;
  /** Maximum total fan angle in degrees (BASE — actual angle bends wider when cards crowd). */
  fanAngle?: number;
  /** Vertical lift toward the arc center (px). */
  arc?: number;
  /** Whether each card is interactive (click to slam). */
  interactive?: boolean;
  /**
   * Maximum number of cards rendered. If `cards.length` exceeds this, only the LAST
   * `maxVisible` cards are drawn and a small "+N" overflow chip appears at the end of
   * the fan. Useful for opponent compact displays where seeing every card is unnecessary.
   */
  maxVisible?: number;
  /**
   * Hard cap on the fan's total horizontal extent (px). When the natural fan would
   * exceed this width (e.g. a 14-card hand on a phone), cards are squeezed and the fan
   * angle widens so the hand curves into a tighter arc instead of clipping off-screen.
   */
  maxWidth?: number;
  /**
   * 'arc' (default): existing bottom-anchored fan.
   * 'circle': cards laid out in polar coordinates around a centre, each rotated so its
   *   top edge faces outward. Used by Solo mode (desktop) where the deck halos the central base.
   */
  fanMode?: 'arc' | 'circle';
  /** Radius for 'circle' mode in px (centre-to-card-bottom-edge). */
  circleRadius?: number;
  /**
   * Per-card clickability filter (circle mode). If provided, only cards whose id passes
   * are clickable; others render but ignore pointer events. Used to lock everything but
   * Halo-Halo during the Solo opening.
   */
  cardInteractive?: (cardId: string) => boolean;
  /**
   * Per-card pulse highlight (circle mode). If provided, cards whose id passes get a
   * heartbeat animation — used to draw the eye to Halo-Halo before the game opens.
   */
  cardPulse?: (cardId: string) => boolean;
  /**
   * Card IDs currently in-flight (e.g. mid-draw animation). Filtered out of the fan so
   * the slot doesn't appear until the GSAP flight lands — at which point the parent
   * removes the id and (optionally) adds it to `freshIds` to trigger the slide-in.
   */
  hiddenIds?: Set<string>;
  /**
   * Card IDs that just landed in the hand. The card gets a brief CSS keyframe animation
   * (translate + scale + opacity) so the player can see WHERE the new card slotted in.
   */
  freshIds?: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'card-aim-start', payload: { card: Card; el: HTMLElement; clientX: number; clientY: number }): void;
}>();

const cardW = computed(() => props.cardWidth ?? 70);
const baseFanAngle = computed(() => props.fanAngle ?? 38);
const arc = computed(() => props.arc ?? 18);

/** Cards we actually render: filter in-flight ids first, then optionally clamp to last N. */
const visibleCards = computed(() => {
  const hidden = props.hiddenIds;
  const base = hidden && hidden.size > 0
    ? props.cards.filter((c) => !hidden.has(c.id))
    : props.cards;
  if (!props.maxVisible || base.length <= props.maxVisible) return base;
  return base.slice(-props.maxVisible);
});

/** Cards hidden behind the "+N" indicator. */
const hiddenCount = computed(() => Math.max(0, props.cards.length - visibleCards.value.length));

/** Fan layout — adapts step + angle based on maxWidth so big hands curve instead of clipping. */
const layouts = computed(() => {
  const n = visibleCards.value.length;
  if (n === 0) return [];

  const baseStep = cardW.value * 0.45;
  const idealSpread = (n - 1) * baseStep;
  const maxSpread = props.maxWidth ? Math.max(0, props.maxWidth - cardW.value) : Infinity;
  const actualSpread = Math.min(idealSpread, maxSpread);
  const step = n > 1 ? actualSpread / (n - 1) : 0;

  // Compression ratio. <1 means we squeezed; bend the fan angle wider to give the
  // crowded hand a half-circle feel instead of just stacking flat.
  const compression = idealSpread > 0 ? actualSpread / idealSpread : 1;
  const range = compression < 1
    ? Math.min(120, baseFanAngle.value / Math.max(0.35, compression))
    : baseFanAngle.value;

  return visibleCards.value.map((c, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = -range / 2 + t * range;
    const lift = Math.sin(t * Math.PI) * arc.value;
    return {
      card: c,
      transform: `translateX(${(i - (n - 1) / 2) * step}px) translateY(${-lift}px) rotate(${angle}deg)`,
      zIndex: i,
    };
  });
});

const onPointerDown = (card: Card, ev: PointerEvent) => {
  const el = (ev.currentTarget as HTMLElement);
  emit('card-aim-start', { card, el, clientX: ev.clientX, clientY: ev.clientY });
};

// ---------------------------------------------------------------------------
// CIRCLE MODE — polar layout around a centre. Cards' top edge faces outward, so
// the chant word at the top of each card peeks out around the perimeter even
// when the hand is dense (e.g. all 56 cards in Solo).
// ---------------------------------------------------------------------------
const circleRadius = computed(() => props.circleRadius ?? 200);
const circleLayouts = computed(() => {
  if (props.fanMode !== 'circle') return [];
  const cards = props.cards;
  const n = cards.length;
  if (n === 0) return [];
  const R = circleRadius.value;
  // Side length is 2*(R + cardHeight) so the cards never clip the bounding box.
  return cards.map((c, i) => {
    // Start at top (-π/2), go clockwise.
    const theta = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const x = Math.cos(theta) * R;
    const y = Math.sin(theta) * R;
    // Rotate so top edge of card faces outward away from centre.
    const rotDeg = (theta * 180) / Math.PI + 90;
    // Pre-computed outward unit vector for hover lift (CSS hovering moves outward).
    const outX = Math.cos(theta);
    const outY = Math.sin(theta);
    return {
      card: c,
      x,
      y,
      rotDeg,
      outX,
      outY,
      zIndex: i,
    };
  });
});
/** Side length of the circle bounding box — exposed so parents can centre & size it. */
const circleBoxSize = computed(() => (circleRadius.value + cardW.value * 1.6) * 2);
</script>

<template>
  <!-- CIRCLE MODE (Solo) — polar halo around a centre. Cards rendered absolutely
       relative to the centre of a square box; CSS hover lifts each card OUTWARD
       along its angle vector so picking a card is tactile and exposes more of it. -->
  <div
    v-if="fanMode === 'circle'"
    class="relative"
    :style="{
      width: circleBoxSize + 'px',
      height: circleBoxSize + 'px',
    }"
  >
    <div
      v-for="layout in circleLayouts"
      :key="layout.card.id"
      class="absolute top-1/2 left-1/2"
      :style="{
        transform: `translate(-50%, -50%) translate(${layout.x}px, ${layout.y}px) rotate(${layout.rotDeg}deg)`,
        zIndex: layout.zIndex,
        transition: 'transform 240ms cubic-bezier(.2,.7,.2,1)',
      }"
      :data-card-id="layout.card.id"
    >
      <button
        v-if="interactive && (!cardInteractive || cardInteractive(layout.card.id))"
        type="button"
        class="circle-card-btn block focus:outline-none cursor-grab active:cursor-grabbing"
        :class="{
          'halo-pulse': cardPulse && cardPulse(layout.card.id),
          'is-fresh': freshIds && freshIds.has(layout.card.id),
        }"
        :style="{ touchAction: 'none' }"
        @pointerdown.prevent="onPointerDown(layout.card, $event)"
      >
        <CardView :card="layout.card" :face-up="faceUp" :width="cardW" />
      </button>
      <div
        v-else
        class="block pointer-events-none"
        :class="{
          'halo-pulse': cardPulse && cardPulse(layout.card.id),
          'is-fresh': freshIds && freshIds.has(layout.card.id),
        }"
      >
        <CardView :card="layout.card" :face-up="faceUp" :width="cardW" />
      </div>
    </div>
  </div>

  <div
    v-else
    class="relative flex items-end justify-center"
    :style="{ minHeight: (cardWidth ?? 70) * 1.6 + 'px' }"
  >
    <div
      v-for="layout in layouts"
      :key="layout.card.id"
      class="absolute bottom-0"
      :style="{
        transform: layout.transform,
        zIndex: layout.zIndex,
        transformOrigin: 'bottom center',
        transition: 'transform 220ms cubic-bezier(.2,.7,.2,1)',
      }"
      :data-card-id="layout.card.id"
    >
      <button
        v-if="interactive"
        type="button"
        class="block hover:-translate-y-2 transition-transform duration-200 cursor-grab active:cursor-grabbing focus:outline-none"
        :class="{ 'is-fresh': freshIds && freshIds.has(layout.card.id) }"
        :style="{ touchAction: 'none' }"
        @pointerdown.prevent="onPointerDown(layout.card, $event)"
      >
        <CardView :card="layout.card" :face-up="faceUp" :width="cardW" />
      </button>
      <div
        v-else
        class="block pointer-events-none"
        :class="{ 'is-fresh': freshIds && freshIds.has(layout.card.id) }"
      >
        <CardView :card="layout.card" :face-up="faceUp" :width="cardW" />
      </div>
    </div>

    <!-- Overflow chip: "+N" sits at the right end of the fan when more cards are hidden. -->
    <div
      v-if="hiddenCount > 0"
      class="absolute bottom-1 right-0 translate-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none text-cream-soft pointer-events-none"
      :style="{
        background: 'var(--color-coral-deep)',
        zIndex: 100,
        boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
      }"
    >
      +{{ hiddenCount }}
    </div>
  </div>
</template>

<style scoped>
/**
 * "Fresh card" entry animation. Applied to the INNER button/div wrapper (not the outer
 * fan-slot div which already owns the layout transform), so the keyframe's translate +
 * scale compose locally with the parent's layout transform instead of replacing it.
 * Fires for ~380ms after a newly-drawn card lands in the hand — gives the player a
 * clear visual of where in their fan the new card slotted in.
 */
.is-fresh {
  animation: card-fresh-slide-in 380ms cubic-bezier(.2, .7, .2, 1) both;
}
@keyframes card-fresh-slide-in {
  0%   { transform: translateY(-14px) scale(0.92); opacity: 0; filter: brightness(1.08); }
  60%  { transform: translateY(0)     scale(1);    opacity: 1; filter: brightness(1.06); }
  100% { transform: translateY(0)     scale(1);    opacity: 1; filter: brightness(1); }
}

/* Circle-mode hover: pull the card INWARD (toward the centre of the halo) using a
   local +Y translate. Because the wrapper has already been rotated so the card's top
   edge faces outward, +Y in local space always points back toward the centre — works
   for every card around the halo without per-card math.

   No `filter` on descendants — that would create a stacking context and disable
   preserve-3d / backface-hidden inside CardView, exposing the back face under the
   front. */
.circle-card-btn {
  transition: transform 200ms cubic-bezier(.2, .7, .2, 1);
}
.circle-card-btn:hover {
  transform: translateY(14px);
}
.circle-card-btn:hover :deep(.shadow-md) {
  box-shadow: 0 8px 14px rgba(0, 0, 0, 0.28);
}
/* Halo-Halo gets a heartbeat pulse pre-open so the player knows where the game starts. */
.halo-pulse {
  animation: halo-heartbeat 1.4s ease-in-out infinite;
  filter: drop-shadow(0 0 12px rgba(252, 246, 230, 0.6));
}
@keyframes halo-heartbeat {
  0%, 100% { transform: scale(1); }
  35%      { transform: scale(1.10); }
  70%      { transform: scale(1.04); }
}
</style>
