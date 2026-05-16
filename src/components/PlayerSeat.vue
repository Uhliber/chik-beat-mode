<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardFan from './CardFan.vue';
import BasePile from './BasePile.vue';
import SpeechBubble from './SpeechBubble.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { Player } from '@/game/Player';
import type { Card } from '@/game/Card';
import type { ChantWord } from '@/game/types';

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
  /** Word this player just shouted (when they played a card). Speech bubble pops above. */
  shouted?: ChantWord | null;
  /** Monotonic counter that re-triggers the bubble even if the word didn't change. */
  shoutKey?: number;
  /** Card IDs that just landed in this player's hand — CardFan plays a slide-in for each. */
  freshCardIds?: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'card-aim-start', payload: { card: Card; el: HTMLElement; clientX: number; clientY: number; player: Player }): void;
}>();

const promptStack = computed<Card[]>(() => props.player.promptStack);

/**
 * The HUMAN player's own prompt pile renders ~30% larger than the opponents' piles so
 * they can always read their current prompt at a glance — independent of whose turn it
 * is right now. The "active seat" highlight (pill colour + wisp) handles the "whose
 * turn" question; this size bump answers "what am I being told to do".
 */
const basePromptCardWidth = computed(() => (props.compact ? 40 : 56));
const promptCardWidth = computed(() =>
  props.isHumanSeat ? Math.round(basePromptCardWidth.value * 1.3) : basePromptCardWidth.value,
);

const onCardAimStart = (payload: { card: Card; el: HTMLElement; clientX: number; clientY: number }) => {
  emit('card-aim-start', { ...payload, player: props.player });
};

// SpeechBubble visibility: track the latest shoutKey, show for ~800ms then hide.
const showBubble = ref(false);
let bubbleTimer: number | null = null;
watch(
  () => props.shoutKey,
  (k) => {
    if (!props.shouted || !k) return;
    showBubble.value = true;
    if (bubbleTimer !== null) clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => { showBubble.value = false; }, 800);
  },
);
</script>

<template>
  <div class="relative flex flex-col items-center gap-1">
    <!-- Speech bubble — pops above the player when they shout a chant word as they play. -->
    <div class="absolute -top-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <SpeechBubble :word="shouted ?? null" :visible="showBubble" />
    </div>

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
        :hidden-ids="hiddenIds"
        :fresh-ids="freshCardIds"
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
         active prompt; older cards stack underneath but are inert. The human's own pile
         is permanently ~30% larger than the opponents' piles so they can always read
         their current prompt at a glance — independent of whose turn it is. -->
    <div
      v-if="promptStack.length > 0"
      class="mt-1 prompt-pile-wrapper"
      :class="{ 'is-human': isHumanSeat }"
    >
      <BasePile
        :cards="promptStack"
        :card-width="promptCardWidth"
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
          :hidden-ids="hiddenIds"
          :fresh-ids="freshCardIds"
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
          :hidden-ids="hiddenIds"
          :fresh-ids="freshCardIds"
          @card-aim-start="onCardAimStart"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
/**
 * Smooth the size change on the prompt pile when the active seat rotates. Without this
 * the pile snaps to its new size — fine but jarring. Easing the wrapper's transform-origin
 * with a soft scale also adds a hint of "pop" on the seat that just gained focus.
 */
.prompt-pile-wrapper {
  transition: transform 220ms cubic-bezier(.2, .7, .2, 1);
  transform-origin: top center;
}
.prompt-pile-wrapper.is-human {
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.22));
}
</style>
