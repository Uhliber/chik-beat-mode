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
  /** Display-size preference for the top prompt card. 'medium' is the historical default. */
  promptSize?: 'small' | 'medium' | 'large' | 'xl';
  /** Solo only: a clone of the current active prompt card. Renders between the pill and
   *  the human's hand (mirroring how Versus shows the player's own promptStack), so the
   *  player can read the active prompt without looking at the centre of the table. The
   *  parent supplies this card only when it actually wants the clone visible (e.g. at XL
   *  promptSize). */
  extraPromptCard?: Card | null;
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
const humanBumpedWidth = computed(() =>
  props.isHumanSeat ? Math.round(basePromptCardWidth.value * 1.3) : basePromptCardWidth.value,
);

/** promptSize is a USER preference that only applies to the HUMAN's own pile — AI
 *  opponents always render at their stock size so the player can't accidentally make the
 *  opposing tableau dwarf their own. Maps Small/Medium/Large/XL onto a uniform scale
 *  that's applied to every card in the human's pile (top + stack); XL additionally
 *  cues the cropped-render mode. */
const PROMPT_SCALE: Record<'small' | 'medium' | 'large' | 'xl', number> = {
  small: 0.75,
  medium: 1,
  large: 1.5,
  xl: 3,
};
const effectivePromptSize = computed<'small' | 'medium' | 'large' | 'xl'>(() =>
  props.isHumanSeat ? (props.promptSize ?? 'medium') : 'medium',
);
const promptCardWidth = computed(() =>
  Math.round(humanBumpedWidth.value * PROMPT_SCALE[effectivePromptSize.value]),
);
const topCardCropTop = computed(() => effectivePromptSize.value === 'xl');
/** When the top card is cropped (XL), pull the human's hand fan up into the faded
 *  region so the layout reclaims that vertical space. The faded slice spans 50% → 85%
 *  of the card's natural height, so ~35% of (cardWidth × 1.45) is visually empty and
 *  free to overlap. Only applies when there's an actual prompt visible above the hand
 *  (either Versus's real promptStack or the Solo clone) — otherwise we'd pull the hand
 *  up into the empty space below the pill. */
const hasPromptAboveHand = computed(
  () => promptStack.value.length > 0 || (props.isHumanSeat && !!props.extraPromptCard),
);
const topCardOverlapPx = computed(() => {
  if (!topCardCropTop.value || !hasPromptAboveHand.value) return 0;
  return Math.round(promptCardWidth.value * 1.45 * 0.35);
});

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

    <!-- Player pill. Lifted onto its own stacking context (z-index 20) so an XL prompt
         clone rendered after it can't paint over the pill if their bounding boxes overlap
         in a tight viewport. -->
    <div
      class="player-pill relative px-3 py-1 rounded-full font-bold text-sm flex items-center gap-2"
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
      :data-tutorial-target="`seat-${player.seatIndex}`"
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
        :top-card-crop-top="topCardCropTop"
        :hidden-ids="hiddenIds"
        :base-id="`seat-${player.seatIndex}`"
        :highlight-card-id="lastPlayedCardId"
      />
    </div>

    <!-- Solo clone: the active prompt mirrored in front of the human player so they can
         read it without scanning the centre of the table. Only renders when the Versus
         promptStack is empty (so it doesn't duplicate the real stack in Versus) and the
         parent has supplied a clone card (Solo + XL today). -->
    <div
      v-else-if="isHumanSeat && extraPromptCard"
      class="mt-1 prompt-pile-wrapper is-human"
    >
      <BasePile
        :cards="[extraPromptCard]"
        :card-width="promptCardWidth"
        :top-card-crop-top="topCardCropTop"
        base-id="solo-prompt-clone"
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

    <!-- Human's hand. When the prompt is XL, the hand slides up into the faded portion
         of the prompt card (mt-2 baseline minus the overlap) and pulls itself in front
         via a higher z-index, so the layout doesn't stack a giant prompt + a separate
         hand row. -->
    <template v-else-if="isHumanSeat">
      <div
        class="hand-wrapper"
        :style="{ marginTop: `${8 - topCardOverlapPx}px` }"
      >
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
/* The human's hand wrapper. Lifted onto its own stacking context with a higher z-index
 * so XL-prompt overlap (negative margin-top in the inline style) renders the fan in
 * front of the faded card edge instead of behind it. */
.hand-wrapper {
  position: relative;
  z-index: 5;
  transition: margin-top 220ms cubic-bezier(.2, .7, .2, 1);
}
.player-pill {
  z-index: 20;
}
</style>
