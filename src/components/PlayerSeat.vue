<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardFan from './CardFan.vue';
import BasePile from './BasePile.vue';
import SpeechBubble from './SpeechBubble.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { Player } from '@/game/Player';
import type { Card } from '@/game/Card';
import type { ChantWord } from '@/game/types';
import type { BasePile as BasePileType } from '@/game/Game';

const { width: viewportW, isMobile } = useResponsive();

/** Max fan width for the HUMAN hand. Keeps a 14-card hand from clipping off the edges. */
const humanHandMaxWidth = computed(() => {
  if (isMobile.value) {
    // Leave ~36 px breathing room on each side of a phone screen.
    return Math.max(280, viewportW.value - 72);
  }
  // Desktop: cap at a comfortable arc — wide enough to spread, narrow enough to read.
  return 720;
});

const props = defineProps<{
  player: Player;
  isHumanSeat: boolean;
  /** True when this seat owns the active beat (Play mode only). */
  isActiveBeat?: boolean;
  /** Current tick index 0..total-1 within this player's turn (-1 if not active). */
  beatTickIndex?: number;
  /** Total ticks in the current turn (drives the dot HUD). */
  beatTotalTicks?: number;
  /** The Game's base pile for this player's owned base, if any. */
  ownedBasePile?: BasePileType | null;
  shouted?: ChantWord | null;
  shoutKey?: number;
  inFlightIds?: Set<string>;
  lastPlayedCardId?: string | null;
  /**
   * Compact opponent rendering (mobile). Skips the fanned hand entirely and shrinks the
   * owned base — the player is represented by their pill + mini base only. The card-count
   * badge on the pill stands in for the hand.
   */
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'card-aim-start', payload: { card: Card; el: HTMLElement; clientX: number; clientY: number; player: Player }): void;
  (e: 'toggle-human', playerId: string): void;
}>();

const wordClass = computed(() => (props.player.ownedBaseWord ? `word-${props.player.ownedBaseWord}` : ''));

const showBubble = ref(false);
let bubbleTimer: number | null = null;

watch(
  () => props.shoutKey,
  () => {
    if (!props.shouted) return;
    showBubble.value = true;
    if (bubbleTimer !== null) clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(() => (showBubble.value = false), 800);
  },
);

const onCardAimStart = (payload: { card: Card; el: HTMLElement; clientX: number; clientY: number }) => {
  emit('card-aim-start', { ...payload, player: props.player });
};
</script>

<template>
  <div :class="['flex flex-col items-center gap-1', wordClass]">
    <!-- Speech bubble -->
    <div class="h-9 flex items-end">
      <SpeechBubble :word="shouted ?? null" :visible="showBubble" />
    </div>

    <!-- Compact opponents (mobile) draw their fanned hand ABOVE the pill so the cards
         look like they're being held above the player tag. Max 5 visible, "+N" overflow. -->
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

    <!-- Name plate (compact, no word duplication since the base art is shown below).
         The active-beat seat gets a subtle white outline; the bright BEAT visual lives on
         the pie wedge under the player's seat, so we don't need a pulsing ring here. -->
    <div
      class="relative px-3 py-1 rounded-full font-bold text-sm flex items-center gap-2"
      :style="{
        background: 'var(--word-color, #c9543b)',
        color: 'white',
        boxShadow: isActiveBeat
          ? '0 0 0 2px rgba(255,255,255,0.9), 0 4px 12px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.2)',
      }"
    >
      <span>{{ player.id.toUpperCase() }}</span>
      <span class="ml-1 px-1.5 rounded-full bg-black/25 text-[10px] font-mono">
        {{ player.cardCount }}
      </span>
      <button
        type="button"
        :title="isHumanSeat ? 'Hand back to AI' : 'Take over this seat'"
        class="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20 hover:bg-white/40 transition-colors"
        @click="emit('toggle-human', player.id)"
      >
        {{ isHumanSeat ? 'YOU' : 'AI' }}
      </button>
    </div>

    <!-- Per-tick BEAT HUD — only the active-beat seat shows it. One dot per metronome tick;
         dots fill up to (and including) `beatTickIndex`. The final tick's dot is bigger to
         signal the high/low DING. -->
    <div
      v-if="isActiveBeat && (beatTotalTicks ?? 0) > 0"
      class="flex items-center gap-1 mt-1 select-none"
      aria-hidden="true"
    >
      <span
        v-for="i in beatTotalTicks"
        :key="i"
        class="block rounded-full transition-all duration-100 ease-out"
        :style="{
          width: i === (beatTotalTicks ?? 0) ? '8px' : '6px',
          height: i === (beatTotalTicks ?? 0) ? '8px' : '6px',
          background: (beatTickIndex ?? -1) >= (i - 1)
            ? 'var(--word-color, #c9543b)'
            : 'rgba(60,40,30,0.18)',
          boxShadow: (beatTickIndex ?? -1) >= (i - 1)
            ? '0 0 6px var(--word-color, #c9543b)'
            : 'none',
        }"
      />
    </div>

    <!-- Compact opponent (mobile) — fan was rendered above the pill; mini base sits below. -->
    <template v-if="compact && !isHumanSeat">
      <div v-if="ownedBasePile" class="mt-1" :data-base-slot="player.ownedBaseWord">
        <BasePile
          :pile="ownedBasePile"
          :size="44"
          :in-flight-ids="inFlightIds"
          :last-played-card-id="lastPlayedCardId"
        />
      </div>
    </template>

    <!-- Desktop opponent: base sits between name plate and hand (cards drop onto base from above). -->
    <template v-else-if="!isHumanSeat">
      <div v-if="ownedBasePile" class="mt-1" :data-base-slot="player.ownedBaseWord">
        <BasePile
          :pile="ownedBasePile"
          :size="58"
          :in-flight-ids="inFlightIds"
          :last-played-card-id="lastPlayedCardId"
        />
      </div>
      <div class="mt-1">
        <CardFan
          :cards="player.hand"
          :face-up="false"
          :card-width="58"
          :fan-angle="38"
          :arc="14"
          :interactive="false"
          @card-aim-start="onCardAimStart"
        />
      </div>
    </template>

    <!-- Human seat: hand on top, owned base below — drag DOWN past the cards to slam on your base. -->
    <template v-else>
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
      <div v-if="ownedBasePile" class="mt-3" :data-base-slot="player.ownedBaseWord">
        <BasePile
          :pile="ownedBasePile"
          :size="74"
          :in-flight-ids="inFlightIds"
          :last-played-card-id="lastPlayedCardId"
        />
      </div>
    </template>
  </div>
</template>
