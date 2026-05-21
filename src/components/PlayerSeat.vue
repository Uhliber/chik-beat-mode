<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardFan from './CardFan.vue';
import BasePile from './BasePile.vue';
import SpeechBubble from './SpeechBubble.vue';
import PromptPopover from './PromptPopover.vue';
import ChantPips from './ChantPips.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { Player } from '@/game/Player';
import type { Card } from '@/game/Card';
import type { ChantWord } from '@/game/types';
import type { PromptInfoSize } from '@/composables/userPreferences';

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
  /** When true, ANY Halo-Halo Chik in this seat's hand renders with a heartbeat pulse
   *  + glow to tell the player "this is what starts the game". The parent decides when
   *  to flip this on (pre-open phases of Solo/Versus); the seat just decorates. */
  pulseHaloHalo?: boolean;
  /** Beats this player owns (Versus only). Rendered as a row of word-color dots next
   *  to the player pill so the table can see who's claimed what. */
  ownedBeats?: ChantWord[];
  /** When set, this seat is currently the one being recited to during a Chant Trigger.
   *  Drives the PromptPopover's recital glow. */
  chantRecitalActive?: boolean;
  /** Number of pips already lit at this seat (recital count units already spoken here). */
  chantPipsLit?: number;
  /** Global recital step at which THIS seat's run began — lets ChantPips derive which
   *  beat word each pip represents (chik / wally / hindo / …) for color tinting. */
  chantPipsStartStep?: number;
  /** True while ANY Chant Trigger is in flight (so pips fade in/out cleanly). */
  chantTriggerInFlight?: boolean;
  /** True while it's this seat's turn to claim a Beat Card in the setup phase. */
  isBeatPicker?: boolean;
  /** Display size for the floating prompt+count popover beside the active prompt. */
  promptInfoSize?: PromptInfoSize;
  /** Degrees the parent seat container is rotated (desktop radial layout rotates
   *  opponent seats so their cards face the table). Set to 0 for the human seat and
   *  for layouts that don't rotate (mobile semicircle). Used to counter-rotate the
   *  popover + pip overlays so they stay UPRIGHT for the human player to read,
   *  regardless of where the opponent is sitting. */
  seatRotation?: number;
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

/** Card-pulse predicate for the human's hand: highlight Halo-Halo cards when the
 *  parent has asked for pre-open emphasis. Returns false for opponents' hands so the
 *  glow only ever appears on the player who's about to open the game. */
const haloHaloIds = computed<Set<string>>(() => {
  if (!props.pulseHaloHalo || !props.isHumanSeat) return new Set();
  const ids = new Set<string>();
  for (const c of props.player.hand) if (c.isHaloHalo) ids.add(c.id);
  return ids;
});
const cardPulse = (cardId: string): boolean => haloHaloIds.value.has(cardId);

/** CSS transform that counter-rotates an overlay back to the human's reading frame.
 *  Empty string = no counter-rotation needed (no parent rotation, or human seat). */
const counterRotate = computed(() => {
  const r = props.seatRotation ?? 0;
  return r === 0 ? '' : `rotate(${-r}deg)`;
});

/** Compose the count-spotlight transform: center on the seat, counter-rotate so the
 *  badge reads upright for the player, then scale up when active or hide-small when
 *  not. Single computed so the CSS transition has a continuous transform shape. */
const spotlightTransform = computed(() => {
  const scale = props.chantTriggerInFlight ? 1.7 : 0.5;
  const rotate = counterRotate.value;
  return `translate(-50%, -50%) ${rotate} scale(${scale})`.trim();
});

// SpeechBubble visibility: track the latest shoutKey, show for ~800ms then hide.
//
// CRITICAL: only fire the bubble when shoutKey STRICTLY INCREASES. The parent's
// `effectiveShout` merges recital shouts (high keys, fast during the chant) with
// play shouts (older, lower keys). When the recital ends and recitalShouts clears,
// the merged value falls back to the stale play shout — which has a SMALLER key
// than the most recent recital step. Without the increase guard, every seat that
// participated in the recital would re-flash its old play bubble at cleanup time,
// producing a synchronized "everyone shouts" flash with no semantic meaning.
const showBubble = ref(false);
let bubbleTimer: number | null = null;
watch(
  () => props.shoutKey,
  (k, oldK) => {
    if (!props.shouted || !k) return;
    if (oldK !== undefined && oldK !== null && k <= oldK) return;
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
      <SpeechBubble
        :word="shouted ?? null"
        :visible="showBubble"
        :seed="(shoutKey ?? 0) * 131 + player.seatIndex"
      />
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

    <!-- Beat-owner dots row, sits between pill and prompt stack. Shows who owns which
         chant beat. The setup phase highlights the dot ring of whoever's picking right
         now (handled by the `is-picker` outer ring). -->
    <div
      v-if="ownedBeats && ownedBeats.length > 0"
      class="beat-owner-dots mt-1"
      :class="{ 'is-picker': isBeatPicker }"
      aria-hidden="true"
    >
      <span
        v-for="b in ownedBeats"
        :key="b"
        :class="`beat-dot word-${b}`"
        :title="`Beat: ${b}`"
      />
    </div>

    <!-- Chant Trigger recital pips — arc beside the player. Intentionally NOT
         counter-rotated: the pips fan around each seat in their natural orientation
         (matching the rotated prompt card), so the arc visually wraps each player
         from "their" side of the table rather than always cresting toward the
         screen-top. The popover counter-rotation handles legibility for the icons. -->
    <ChantPips
      v-if="promptStack.length > 0"
      :count="promptStack[promptStack.length - 1].count"
      :lit="chantPipsLit ?? 0"
      :active="chantTriggerInFlight ?? false"
      :start-step="chantPipsStartStep ?? 0"
    />

    <!-- Recital count spotlight — when the chant trigger fires, the count badge
         scales up + centers on the seat so the player sees how much "value" each
         seat contributes to the chant. Counter-rotated so it reads upright.
         Always rendered (when there's a prompt to spotlight); opacity + scale
         transition handles entry/exit so the badge animates in cleanly. -->
    <div
      v-if="promptStack.length > 0 && promptStack[promptStack.length - 1].count > 0"
      class="count-spotlight"
      :class="{ 'is-active': chantTriggerInFlight }"
      :style="{ transform: spotlightTransform }"
      :data-chant-spotlight="player.seatIndex"
    >
      <PromptPopover
        :card="promptStack[promptStack.length - 1]"
        size="large"
        mode="count"
        :recital-active="chantRecitalActive ?? false"
      />
    </div>

    <!-- Prompt stack: cards face-up sitting in front of this player. The top one is the
         active prompt; older cards stack underneath but are inert. The human's own pile
         is permanently ~30% larger than the opponents' piles so they can always read
         their current prompt at a glance — independent of whose turn it is.

         Layout splits by seat ownership:
         - HUMAN: prompt-icon popover LEFT of the card, count-icon popover RIGHT. Gives
           the player two large, clearly separated readouts framing their own prompt.
         - OPPONENTS: a single combined popover anchored to the right of the card,
           kept upright (never rotated to the AI's table position) so the player can
           read it without tilting their head. -->
    <div
      v-if="promptStack.length > 0"
      class="mt-1 prompt-pile-wrapper relative"
      :class="{ 'is-human': isHumanSeat }"
    >
      <div v-if="isHumanSeat" class="human-prompt-row">
        <PromptPopover
          :card="promptStack[promptStack.length - 1]"
          :size="promptInfoSize ?? 'medium'"
          mode="icon"
          :recital-active="chantRecitalActive ?? false"
        />
        <BasePile
          :cards="promptStack"
          :card-width="promptCardWidth"
          :top-card-crop-top="topCardCropTop"
          :hidden-ids="hiddenIds"
          :base-id="`seat-${player.seatIndex}`"
          :highlight-card-id="lastPlayedCardId"
        />
        <!-- The inline count badge hides during the chant trigger — the spotlight
             count below takes over so attention focuses on the per-seat count. -->
        <PromptPopover
          v-show="!chantTriggerInFlight"
          :card="promptStack[promptStack.length - 1]"
          :size="promptInfoSize ?? 'medium'"
          mode="count"
          :recital-active="chantRecitalActive ?? false"
        />
      </div>
      <template v-else>
        <BasePile
          :cards="promptStack"
          :card-width="promptCardWidth"
          :top-card-crop-top="topCardCropTop"
          :hidden-ids="hiddenIds"
          :base-id="`seat-${player.seatIndex}`"
          :highlight-card-id="lastPlayedCardId"
        />
        <!-- AI popovers: two circular badges side-by-side, anchored beside the card.
             Counter-rotated as a group so the prompt-then-count reading order stays
             intact regardless of the seat's table-facing rotation. The count badge
             hides during chant trigger — the spotlight below takes over. -->
        <div
          class="prompt-popover-anchor ai-pair"
          :style="counterRotate ? { transform: `translateY(-50%) ${counterRotate}` } : undefined"
        >
          <PromptPopover
            :card="promptStack[promptStack.length - 1]"
            :size="promptInfoSize ?? 'medium'"
            mode="icon"
            :recital-active="chantRecitalActive ?? false"
          />
          <PromptPopover
            v-show="!chantTriggerInFlight"
            :card="promptStack[promptStack.length - 1]"
            :size="promptInfoSize ?? 'medium'"
            mode="count"
            :recital-active="chantRecitalActive ?? false"
          />
        </div>
      </template>
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
          :card-pulse="cardPulse"
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

/* Beat-owner dots — one per claimed beat. The setup-phase highlight pulses the row
 * when this seat is the current picker. */
.beat-owner-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.18);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
.beat-owner-dots.is-picker {
  animation: beat-picker-pulse 1.2s ease-in-out infinite;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.25),
    0 0 0 2px rgba(252, 246, 230, 0.92);
}
@keyframes beat-picker-pulse {
  0%, 100% { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), 0 0 0 2px rgba(252, 246, 230, 0.92); }
  50%      { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25), 0 0 0 5px rgba(252, 246, 230, 0.5); }
}
.beat-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: var(--word-color, var(--color-coral));
  border: 1px solid rgba(252, 246, 230, 0.9);
}

/* Anchor that floats the prompt popover to the right side of the prompt stack. The
 * absolute positioning + translateY centres it vertically on the top card. */
.prompt-popover-anchor {
  position: absolute;
  left: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  z-index: 25;
}

/* AI variant: two circular popovers side-by-side. Flex centers them vertically on
 * the prompt card; small gap keeps them visually distinct without crowding. */
.prompt-popover-anchor.ai-pair {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Recital count spotlight — large count badge anchored at the seat group's center.
 * The transform is computed inline so we can interpolate between "small + hidden"
 * (chant inactive) and "large + centered" (chant active) with a single CSS shape.
 * The ChantTriggerOverlay's SVG mask punches a hole around this element so it pops
 * through the dim backdrop while keeping its true chant-word color. Hidden by
 * default via opacity:0 so it doesn't overlap normal UI. */
.count-spotlight {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 40;
  pointer-events: none;
  opacity: 0;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.5));
  transform-origin: center center;
  transition: transform 380ms cubic-bezier(.2, .8, .2, 1), opacity 280ms ease;
}
.count-spotlight.is-active {
  opacity: 1;
}

/* Human's three-piece layout: [prompt-icon] [prompt-card] [count-icon]. Flex centers
 * all three vertically; the popovers sit on either side of the BasePile. Pointer
 * events stay disabled so the popovers don't intercept hand-drag gestures. */
.human-prompt-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.human-prompt-row > :deep(.prompt-popover) {
  pointer-events: none;
}
</style>
