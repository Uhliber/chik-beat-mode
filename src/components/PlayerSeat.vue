<script setup lang="ts">
import { computed } from 'vue';
import CardFan from './CardFan.vue';
import BasePile from './BasePile.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { Player } from '@/game/Player';
import type { Card } from '@/game/Card';

const { width: viewportW, isMobile } = useResponsive();

const humanHandMaxWidth = computed(() => {
  if (isMobile.value) return Math.max(280, viewportW.value - 72);
  return 720;
});

const props = defineProps<{
  player: Player;
  isHumanSeat: boolean;
  /** True when it's this seat's turn to act (Versus only). */
  isActive?: boolean;
  /** True when this seat is a legal drag target (Versus, during human aim). */
  isLegalTarget?: boolean;
  /** Card IDs mid-flight; hide from prompt stack until they land. */
  hiddenIds?: Set<string>;
  /** ID of the most recently played card; BasePile glows it. */
  lastPlayedCardId?: string | null;
  /** Compact opponent rendering on mobile. */
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'card-aim-start', payload: { card: Card; el: HTMLElement; clientX: number; clientY: number; player: Player }): void;
}>();

const promptStack = computed<Card[]>(() => props.player.promptStack);

const onCardAimStart = (payload: { card: Card; el: HTMLElement; clientX: number; clientY: number }) => {
  emit('card-aim-start', { ...payload, player: props.player });
};
</script>

<template>
  <div class="flex flex-col items-center gap-1">
    <!-- Compact opponents (mobile): hand fanned above pill. -->
    <div
      v-if="compact && !isHumanSeat && player.hand.length > 0"
      class="-mb-1"
    >
      <CardFan
        :cards="player.hand"
        :face-up="false"
        :card-width="32"
        :fan-angle="32"
        :arc="6"
        :interactive="false"
        :max-visible="5"
      />
    </div>

    <!-- Player pill. -->
    <div
      class="relative px-3 py-1 rounded-full font-bold text-sm flex items-center gap-2"
      :style="{
        background: isActive ? 'var(--color-coral-deep, #c9543b)' : 'rgba(60,40,30,0.55)',
        color: 'white',
        boxShadow: isLegalTarget
          ? '0 0 0 3px rgba(255,255,255,0.95), 0 0 18px rgba(231,89,61,0.7)'
          : isActive
            ? '0 0 0 2px rgba(255,255,255,0.9), 0 4px 12px rgba(0,0,0,0.3)'
            : '0 2px 8px rgba(0,0,0,0.2)',
      }"
      :data-seat-index="player.seatIndex"
    >
      <span>{{ player.id.toUpperCase() }}</span>
      <span class="ml-1 px-1.5 rounded-full bg-black/25 text-[10px] font-mono">
        {{ player.cardCount }}
      </span>
      <span
        v-if="isHumanSeat"
        class="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/20"
      >YOU</span>
    </div>

    <!-- Prompt stack: cards face-up sitting in front of this player. The top one is the
         active prompt; older cards stack underneath but are inert. -->
    <div v-if="promptStack.length > 0" class="mt-1">
      <BasePile
        :cards="promptStack"
        :card-width="compact ? 40 : 56"
        :hidden-ids="hiddenIds"
        :base-id="`seat-${player.seatIndex}`"
        :highlight-card-id="lastPlayedCardId"
      />
    </div>

    <!-- Opponent's hand on desktop (face-down small fan). -->
    <template v-if="!compact && !isHumanSeat && player.hand.length > 0">
      <div class="mt-1">
        <CardFan
          :cards="player.hand"
          :face-up="false"
          :card-width="42"
          :fan-angle="36"
          :arc="10"
          :interactive="false"
          :max-visible="7"
        />
      </div>
    </template>

    <!-- Human's hand. -->
    <template v-else-if="isHumanSeat">
      <div class="mt-2">
        <CardFan
          :cards="player.hand"
          :face-up="true"
          :card-width="74"
          :fan-angle="42"
          :arc="20"
          :interactive="true"
          :max-width="humanHandMaxWidth"
          @card-aim-start="onCardAimStart"
        />
      </div>
    </template>
  </div>
</template>
