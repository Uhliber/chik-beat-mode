<script setup lang="ts">
import { computed } from 'vue';
import BasePile from './BasePile.vue';
import type { Game } from '@/game/Game';
import { CHANT_ORDER } from '@/game/types';

const props = defineProps<{
  game: Game;
  inFlightIds?: Set<string>;
  lastPlayedCardId?: string | null;
  /**
   * 'row'      — desktop: unclaimed bases sit in a row beside the main base.
   * 'layered'  — mobile: main base in the centre with unclaimed bases peeking out from
   *              behind it at slight angles.
   * 'solo'     — Solo mode: just the main base, larger, no unclaimed peek (every base
   *              is unclaimed in Solo, but they're hidden — the hand halos the main).
   */
  layout?: 'row' | 'layered' | 'solo';
  /**
   * Solo-mode compact flag. Mobile Solo moves the main base out of the dead centre to
   * sit just below the ChantTicker, with the U-shape card pile filling the bottom half.
   * The base is no longer the focal point, so it shrinks (~88 px instead of 110 px).
   */
  compact?: boolean;
}>();

const main = computed(() => props.game.getBase('main'));

/** Word bases that aren't claimed by a player are displayed in the center. */
const unclaimedWordBases = computed(() => {
  return CHANT_ORDER
    .filter((w) => {
      const b = props.game.getBase(w);
      return b && !b.ownerId;
    })
    .map((w) => props.game.getBase(w));
});

/**
 * For 'layered' mode: unowned bases peek out from BEHIND the main base, fanning UPWARD
 * so each one is visibly identifiable. Spread + lift scale with the count so even a
 * 5-base fan (2-player game) doesn't have any tiles fully hidden behind the main.
 */
const layeredOffsets = computed(() => {
  const n = unclaimedWordBases.value.length;
  if (n === 0) return [];
  // Wider fan + more peek for more bases — keeps every tile partially visible.
  const span = Math.min(120, n * 24);    // total fan in degrees
  const xSpread = Math.min(96, n * 22);  // horizontal peek distance per side
  const yLift = 56;                       // peek upward from behind the main base
  return unclaimedWordBases.value.map((_, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..+1
    const angle = t * (span / 2);
    return {
      transform: `translateX(${t * xSpread}px) translateY(-${yLift}px) rotate(${angle}deg)`,
      zIndex: -1,
    };
  });
});
</script>

<template>
  <!-- Solo: only the main base, sized large, no peeking unclaimed tiles. On mobile
       (`compact`) the base shrinks since it sits in the upper area, with the card pile
       below as the visual focus. -->
  <div
    v-if="layout === 'solo'"
    class="relative flex items-center justify-center"
  >
    <div :data-base-slot="'main'">
      <BasePile
        :pile="main"
        :size="compact ? 88 : 110"
        :in-flight-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
      />
    </div>
  </div>

  <div
    v-else-if="(layout ?? 'row') === 'row'"
    class="relative flex items-end gap-3"
  >
    <!-- Unclaimed word bases -->
    <div
      v-for="b in unclaimedWordBases"
      :key="b.slot"
      :data-base-slot="b.slot"
    >
      <BasePile
        :pile="b"
        :size="74"
        :in-flight-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
      />
    </div>
    <!-- Main base (always present) -->
    <div :data-base-slot="'main'">
      <BasePile
        :pile="main"
        :size="92"
        :in-flight-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
      />
    </div>
  </div>

  <!-- Layered (mobile) — main centre-front, unclaimed bases peek from behind.
       Sized close to the opponent owned-base scale (~44 px) so the central main only sits
       slightly larger and the unowned tiles fan visibly above/around it. -->
  <div
    v-else
    class="relative flex items-end justify-center"
    style="width: 220px; height: 160px;"
  >
    <!-- Unclaimed bases: absolutely positioned behind, fanned. -->
    <div
      v-for="(b, i) in unclaimedWordBases"
      :key="b.slot"
      class="absolute"
      :data-base-slot="b.slot"
      :style="{
        ...layeredOffsets[i],
        opacity: 0.9,
        filter: 'saturate(0.9)',
      }"
    >
      <BasePile
        :pile="b"
        :size="44"
        :in-flight-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
      />
    </div>
    <!-- Main base in front — only a touch larger than the owned bases on opponents. -->
    <div class="relative z-10" :data-base-slot="'main'">
      <BasePile
        :pile="main"
        :size="56"
        :in-flight-ids="inFlightIds"
        :last-played-card-id="lastPlayedCardId"
      />
    </div>
  </div>
</template>
