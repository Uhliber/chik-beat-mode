<script setup lang="ts">
/**
 * Visual layer for the Chant Trigger. When the engine emits versusChantTriggered:
 *  - the table darkens (filter applied via parent class)
 *  - a radial spotlight covers the center
 *  - the lottery banner spins through chant beats LIVE as the recital walks (one
 *    beat word per recital step), eventually freezing on the landed beat
 *  - then ambiance restores
 *
 * The actual SpeechBubble hops + ChantPips are driven by per-seat state pushed from
 * useGame; this overlay owns the spotlight + the lottery banner.
 */
import { computed } from 'vue';
import type { ChantWord } from '@/game/types';

const props = defineProps<{
  /** True while a Chant Trigger is in flight. */
  active: boolean;
  /** The beat being spoken at the current recital step. Drives the lottery banner —
   *  cycles through beats live during the recital, then naturally freezes on the
   *  LAST step's beat (which is the landed beat). */
  currentBeat: ChantWord | null;
}>();

const beatLabel = computed(() => props.currentBeat ? props.currentBeat.toUpperCase() : '');
const beatWordClass = computed(() => props.currentBeat ? `word-${props.currentBeat}` : '');
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

      <!-- Lottery banner: a single big beat word that re-renders per recital step.
           The :key on the inner span forces Vue to remount the element each beat
           change so the pop animation re-fires — gives the lottery wheel its
           ticking, flip-card feel. Once the recital ends, this freezes on whatever
           the final beat was (which IS the landed beat). -->
      <div v-if="currentBeat" class="lottery-banner" :class="beatWordClass">
        <Transition name="lottery" mode="out-in">
          <span :key="currentBeat" class="lottery-word">{{ beatLabel }}</span>
        </Transition>
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

/* Lottery banner — single beat word, large, centered up top. Brightness-bumped so
 * it cuts through the GameTable's darkened ambiance filter (parent has
 * brightness(0.62); banner multiplies back to ~1.0). */
.lottery-banner {
  position: absolute;
  left: 50%;
  top: 11%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px 36px;
  border-radius: 22px;
  background: rgba(20, 14, 10, 0.82);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.55);
  filter: brightness(1.6) saturate(1.15);
  animation: banner-in 360ms cubic-bezier(.2, .8, .2, 1);
  /* Reserve space so the word swap doesn't reflow the whole banner. */
  min-width: 280px;
  min-height: 78px;
}
.lottery-word {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 3rem;
  letter-spacing: 0.06em;
  line-height: 1;
  color: var(--word-color, var(--color-cream-soft));
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35);
  display: inline-block;
}

@keyframes banner-in {
  from { opacity: 0; transform: translate(-50%, -16px) scale(0.85); }
  to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
}

/* Per-step lottery transition — slot-machine style flip. */
.lottery-enter-active,
.lottery-leave-active {
  transition: transform 160ms cubic-bezier(.2, .8, .2, 1), opacity 140ms ease;
}
.lottery-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.9);
}
.lottery-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.95);
}
</style>
