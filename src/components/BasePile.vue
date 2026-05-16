<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '@/game/Card';
import CardView from './CardView.vue';

const props = defineProps<{
  /** Cards in this pile, oldest at the bottom, newest on top. */
  cards: Card[];
  /** Optional label below the pile ("Left", "Right", or a player's name). */
  label?: string;
  /** When true, the pile glows to indicate it's the current drop target. */
  highlighted?: boolean;
  /** Card IDs that are currently flying in — hidden until landing. */
  hiddenIds?: Set<string>;
  /** Visible card width in px. */
  cardWidth?: number;
  /** How many top cards to render. Older cards are completely hidden behind the top card. */
  visibleTop?: number;
  /** Optional dataset attribute for layout/aim queries (e.g. 'left', 'right', a seat id). */
  baseId?: string;
  /** ID of the most recently played card across the whole table. The matching card in this
   *  pile (if any) gets a pulsing glow so the player can spot where the action just was. */
  highlightCardId?: string | null;
}>();

const cardWidth = computed(() => props.cardWidth ?? 64);
/** How many cards form the "stack thickness" peek. Keep it small (3-4) so older cards
 *  don't accumulate a visible fringe; they just imply depth. */
const visibleTop = computed(() => props.visibleTop ?? 4);

const visible = computed(() => {
  const hidden = props.hiddenIds;
  const cards = hidden ? props.cards.filter((c) => !hidden.has(c.id)) : props.cards;
  return cards.slice(-visibleTop.value);
});

/** Per-card stack-thickness offset (px). Tiny — just enough to imply layering. */
const PEEK_PX = 1.5;

/**
 * Deterministic pseudo-random 0..1 from a card id. We need stable jitter per card so the
 * pile doesn't reshuffle on every re-render — `Math.random` here would visibly twitch each
 * frame Vue updates the parent. FNV-1a is fast, well-distributed, and trivially seedable.
 */
function hash01(s: string, seed = 0): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Per-card jitter ranges. Subtle — too much rotation reads as "card art is crooked" rather
 *  than "stack of real cards". */
const JITTER_ROT_DEG = 5;  // ±2.5°
const JITTER_PX = 3;       // ±1.5px

function jitterFor(id: string): { rot: number; jx: number; jy: number } {
  return {
    rot: (hash01(id, 1) - 0.5) * JITTER_ROT_DEG,
    jx:  (hash01(id, 2) - 0.5) * JITTER_PX,
    jy:  (hash01(id, 3) - 0.5) * JITTER_PX,
  };
}
</script>

<template>
  <div
    class="relative flex flex-col items-center gap-2"
    :data-base-id="baseId"
  >
    <div
      class="relative rounded-xl ring-2 transition-all"
      :class="highlighted ? 'ring-coral-deep shadow-[0_0_24px_6px_rgba(231,89,61,0.55)]' : 'ring-cream-soft/30'"
      :style="{ width: cardWidth + 'px', height: (cardWidth * 1.45) + 'px' }"
    >
      <div
        v-if="visible.length === 0"
        class="absolute inset-0 rounded-xl flex items-center justify-center text-cream-soft/40 font-extrabold uppercase tracking-widest text-[10px]"
      >
        {{ label ?? '' }}
      </div>
      <!--
        Stack layering: all cards perfectly centred (same translateX(-50%)).
        Newer cards layer IN FRONT (higher z-index). Each older card is offset DOWN-RIGHT
        by a tiny amount (PEEK_PX × layer depth) so its bottom-right edge peeks out from
        beneath the newest. The top card has zero offset; you only see card thickness, not
        a fanned-out spread.
      -->
      <!-- Each card gets a base stack-offset (down-right by PEEK_PX * layer depth) PLUS a
           deterministic per-card jitter (rotation + sub-px position) so the pile reads as
           a hand-thrown stack instead of a perfectly machined deck. The CardView's root is
           position:relative — we wrap it in an absolute container so positioning sticks. -->
      <div
        v-for="(c, i) in visible"
        :key="c.id"
        class="absolute top-0 left-1/2"
        :style="{
          transform: `translateX(calc(-50% + ${(visible.length - 1 - i) * PEEK_PX + jitterFor(c.id).jx}px)) translateY(${(visible.length - 1 - i) * PEEK_PX + jitterFor(c.id).jy}px) rotate(${jitterFor(c.id).rot}deg)`,
          zIndex: i,
        }"
      >
        <div class="relative">
          <CardView
            :card="c"
            :face-up="true"
            :width="cardWidth"
            :static-flip="true"
          />
          <!-- Glow ring on the most recently played card across the table. Scoped to ONE
               card so the pile isn't busy with multiple halos. -->
          <div
            v-if="highlightCardId === c.id"
            class="pointer-events-none absolute -inset-1 rounded-xl last-played-pulse"
          />
        </div>
      </div>
    </div>
    <div
      v-if="label"
      class="font-extrabold uppercase tracking-widest text-[10px] text-cream-soft/85"
    >
      {{ label }}
    </div>
  </div>
</template>

<style scoped>
.last-played-pulse {
  box-shadow:
    0 0 0 3px rgba(252, 246, 230, 0.92),
    0 0 22px 8px rgba(252, 246, 230, 0.55);
  animation: last-played-pulse 1.4s ease-in-out infinite;
}
@keyframes last-played-pulse {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%      { opacity: 0.6; transform: scale(1.04); }
}
</style>
