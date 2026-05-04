<script setup lang="ts">
import { computed } from 'vue';
import BasePile from './BasePile.vue';
import type { Game } from '@/game/Game';
import { CHANT_ORDER } from '@/game/types';

const props = defineProps<{
  game: Game;
  inFlightIds?: Set<string>;
  lastPlayedCardId?: string | null;
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
</script>

<template>
  <div class="relative flex items-end gap-3">
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
</template>
