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
}>();

const emit = defineEmits<{
  (e: 'draw-deck-click'): void;
}>();

const drawPileCount = computed(() => props.game.drawPile.length);
const left = computed<Card[]>(() => props.game.soloBases.left);
const right = computed<Card[]>(() => props.game.soloBases.right);
</script>

<template>
  <div class="flex items-center justify-center gap-6 sm:gap-10">
    <BasePile
      v-if="mode === 'solo'"
      :cards="left"
      label="Left"
      base-id="left"
      :highlighted="highlightedSide === 'left'"
      :hidden-ids="hiddenIds"
      :highlight-card-id="lastPlayedCardId"
    />

    <button
      type="button"
      class="relative flex flex-col items-center gap-2 focus:outline-none"
      :aria-label="`Draw pile: ${drawPileCount} cards`"
      data-base-id="deck"
      @click="emit('draw-deck-click')"
    >
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
      base-id="right"
      :highlighted="highlightedSide === 'right'"
      :hidden-ids="hiddenIds"
      :highlight-card-id="lastPlayedCardId"
    />
  </div>
</template>
