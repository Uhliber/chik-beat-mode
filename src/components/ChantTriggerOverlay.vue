<script setup lang="ts">
/**
 * Visual layer for the Chant Trigger. When the engine emits versusChantTriggered:
 *  - the table darkens (filter applied via parent class)
 *  - a radial spotlight covers the center
 *  - the chant recites clockwise via SpeechBubbles, one beat per count
 *  - the landed beat owner's seat pulses
 *  - then ambiance restores
 *
 * The actual SpeechBubble hops are driven by the parent (GameTable) reading the shout
 * state per-seat; this overlay owns the spotlight + the on-landing pulse banner.
 */
import { computed } from 'vue';
import type { ChantWord } from '@/game/types';

const props = defineProps<{
  /** True while a Chant Trigger is in flight. */
  active: boolean;
  /** The landed beat, or 'no-winner-*' if nothing won. */
  landedBeat: ChantWord | 'no-winner-opening' | 'no-winner-unclaimed' | null;
  /** Seat that won the chant power, or null. */
  winnerSeatIndex: number | null;
  /** Total count summed across all active prompts. */
  total: number;
  /** Seat that received the Chant Chik (recital starts here). */
  receiverSeatIndex: number | null;
}>();

const landedLabel = computed(() => {
  if (!props.landedBeat) return '';
  if (props.landedBeat === 'no-winner-opening') return 'OPENING CHIK — NO WINNER';
  if (props.landedBeat === 'no-winner-unclaimed') return 'UNCLAIMED BEAT — NO WINNER';
  return props.landedBeat.toUpperCase();
});
const landedWordClass = computed(() => {
  const b = props.landedBeat;
  if (!b || b === 'no-winner-opening' || b === 'no-winner-unclaimed') return '';
  return `word-${b}`;
});
</script>

<template>
  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition duration-300"
    leave-active-class="transition duration-400"
    leave-to-class="opacity-0"
  >
    <div v-if="active" class="chant-overlay" aria-hidden="true">
      <!-- Spotlight: dark radial vignette with a clearer center over the table. -->
      <div class="chant-spotlight" />

      <!-- Top banner: announces the chant total and (after landing) the result. -->
      <div class="chant-banner">
        <div class="chant-banner-eyebrow">CHANT TRIGGER</div>
        <div class="chant-banner-total">×{{ total }}</div>
        <div v-if="landedBeat" class="chant-banner-landed" :class="landedWordClass">
          {{ landedLabel }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.chant-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}
.chant-spotlight {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 55%,
    rgba(0, 0, 0, 0) 12%,
    rgba(0, 0, 0, 0.45) 55%,
    rgba(0, 0, 0, 0.65) 100%
  );
  animation: spot-in 320ms ease-out;
}
@keyframes spot-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.chant-banner {
  position: absolute;
  left: 50%;
  top: 12%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 26px;
  border-radius: 22px;
  background: rgba(20, 14, 10, 0.78);
  color: var(--color-cream-soft);
  text-align: center;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
  animation: banner-in 360ms cubic-bezier(.2, .8, .2, 1);
}
.chant-banner-eyebrow {
  font-family: var(--font-subtitle);
  font-size: 0.7rem;
  letter-spacing: 0.32em;
  font-weight: 800;
  color: rgba(252, 246, 230, 0.7);
}
.chant-banner-total {
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
}
.chant-banner-landed {
  margin-top: 4px;
  padding: 4px 14px;
  border-radius: 9999px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.18em;
  background: var(--word-color, var(--color-coral));
  color: var(--color-cream-soft);
  animation: landed-in 320ms cubic-bezier(.2, .8, .2, 1);
}
@keyframes banner-in {
  from { opacity: 0; transform: translate(-50%, -16px) scale(0.85); }
  to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@keyframes landed-in {
  from { opacity: 0; transform: scale(0.7); }
  to   { opacity: 1; transform: scale(1); }
}
</style>
