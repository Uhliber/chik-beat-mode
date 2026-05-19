<script setup lang="ts">
import { computed } from 'vue';
import type { Game } from '@/game/Game';
import type { Card } from '@/game/Card';
import type { BaseSide } from '@/game/types';
import BasePile from './BasePile.vue';
import CardView from './CardView.vue';

const props = defineProps<{
  game: Game;
  /** 'solo' shows two physical bases + the draw pile. 'versus' shows only the draw pile. */
  /** 'playground' is treated identically to 'versus' here (centred deck, no Solo bases). */
  mode: 'solo' | 'versus' | 'playground';
  /** Which side is currently being aimed at (Solo only). */
  highlightedSide?: BaseSide | null;
  /** Card IDs mid-flight (hidden in the pile until they land). */
  hiddenIds?: Set<string>;
  /** ID of the most recently played card; BasePile glows it. */
  lastPlayedCardId?: string | null;
  /** Natural width of each Solo pile. The ACTIVE base scales off this value
   *  via the user's promptSize setting (S/M/L); the non-active base always
   *  renders at the natural width so the layout stays balanced. */
  promptCardWidth?: number;
  /** User's prompt-size preference. In Solo, S/M/L scale the ACTIVE base
   *  (the one holding the current prompt); XL hands off to the human's
   *  clone-above-hand rendering and leaves the bases at their natural size. */
  promptSize?: 'small' | 'medium' | 'large' | 'xl';
}>();

const emit = defineEmits<{
  (e: 'draw-deck-click'): void;
}>();

const drawPileCount = computed(() => props.game.drawPile.length);
const left = computed<Card[]>(() => props.game.soloBases.left);
const right = computed<Card[]>(() => props.game.soloBases.right);

/** Which base currently holds the active prompt. Drives the larger pile + "Prompt"
 *  label + glow on that base only. Null before the Halo-Halo opener lands.
 *
 *  `soloActiveBaseSide` is a plain field on the Game class (not a reactive proxy), so
 *  reads aren't tracked. Touching the reactive `soloBases` arrays' lengths makes this
 *  computed re-evaluate on every slam — which is exactly when the active side flips. */
const activeSide = computed<BaseSide | null>(() => {
  void props.game.soloBases.left.length;
  void props.game.soloBases.right.length;
  return props.game.soloActiveBaseSide;
});

/** Scale factor applied to the ACTIVE Solo base based on the user's prompt-size pref.
 *  XL is the only size that hands off to the clone-above-hand rendering (in GameTable),
 *  so we keep the bases at their natural size in that case. */
const SOLO_ACTIVE_SCALE: Record<'small' | 'medium' | 'large' | 'xl', number> = {
  small: 0.85,
  medium: 1,
  large: 1.4,
  xl: 1,
};
const naturalWidth = computed(() => props.promptCardWidth ?? 64);
const activeWidth = computed(() =>
  Math.round(naturalWidth.value * SOLO_ACTIVE_SCALE[props.promptSize ?? 'medium']),
);
const leftCardWidth = computed(() =>
  activeSide.value === 'left' ? activeWidth.value : naturalWidth.value,
);
const rightCardWidth = computed(() =>
  activeSide.value === 'right' ? activeWidth.value : naturalWidth.value,
);
</script>

<template>
  <div class="flex items-center justify-center gap-6 sm:gap-10">
    <BasePile
      v-if="mode === 'solo'"
      :cards="left"
      label="Left"
      :secondary-label="activeSide === 'left' ? 'Prompt' : undefined"
      base-id="left"
      :highlighted="highlightedSide === 'left'"
      :hidden-ids="hiddenIds"
      :highlight-card-id="lastPlayedCardId"
      :card-width="leftCardWidth"
    />

    <button
      type="button"
      class="relative flex flex-col items-center gap-2 focus:outline-none"
      :aria-label="`Draw pile: ${drawPileCount} cards`"
      data-base-id="deck"
      @click="emit('draw-deck-click')"
    >
      <!-- Versus / Playground only: when the pile is empty a tap on the deck just passes
           the turn (no card to draw, but the action is still legal). This hint surfaces
           that without adding a separate "Pass" button. Solo doesn't have a pass concept
           so we skip it there. -->
      <div
        v-if="drawPileCount === 0 && mode !== 'solo'"
        class="text-[9px] font-medium tracking-wide text-coral-deep/85 uppercase"
      >
        Tap to pass
      </div>
      <div
        class="relative rounded-xl ring-2 ring-cream-soft/30 active:scale-95 transition-transform overflow-hidden"
        :style="{ width: '64px', height: (64 * 1.45) + 'px' }"
      >
        <CardView v-if="drawPileCount > 0" :face-up="false" :width="64" :static-flip="true" :force-back="true" />
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center text-cream-soft/40 font-extrabold uppercase tracking-widest text-[10px]"
        >
          Empty
        </div>
      </div>
      <div
        v-if="drawPileCount > 0"
        class="absolute -top-2 -right-2 rounded-full bg-coral-deep text-cream-soft text-[10px] font-bold px-2 py-0.5 shadow"
      >
        {{ drawPileCount }}
      </div>
      <div class="font-extrabold uppercase tracking-widest text-[10px] text-cream-soft/85">
        Deck
      </div>
    </button>

    <BasePile
      v-if="mode === 'solo'"
      :cards="right"
      label="Right"
      :secondary-label="activeSide === 'right' ? 'Prompt' : undefined"
      base-id="right"
      :highlighted="highlightedSide === 'right'"
      :hidden-ids="hiddenIds"
      :highlight-card-id="lastPlayedCardId"
      :card-width="rightCardWidth"
    />
  </div>
</template>
