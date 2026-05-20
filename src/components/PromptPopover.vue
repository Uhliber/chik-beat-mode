<script setup lang="ts">
/**
 * Floating prompt+count badge that sits beside each player's active prompt card. The
 * card art baked-in icons are tiny on screen, so this popover re-renders them at a
 * readable size, recolored to the prompt card's chant word color.
 *
 * During a Chant Trigger recital, a "counter pip" is highlighted on each player as
 * the chant counts up — `recitalStep` is the count owed to this seat so far (i.e. how
 * many of this seat's count value have been "spoken" during the recital so far). The
 * pip fills cleanly to show progress; the seat with `recitalActive=true` glows.
 */
import { computed } from 'vue';
import { useInlineSvg } from '@/composables/useInlineSvg';
import type { Card } from '@/game/Card';

const props = defineProps<{
  card: Card | null;
  /** When true, lift z-index + glow so the popover stands out during a Chant Trigger. */
  recitalActive?: boolean;
  /** Step counter pip — number of count units already spoken at this seat during the
   *  active recital. -1 = inactive (no pip rendered). */
  recitalStep?: number;
}>();

const wordClass = computed(() => (props.card ? `word-${props.card.word}` : ''));
const promptUrl = computed(() => (props.card ? `/new/prompt-${props.card.prompt}.svg` : null));
const countUrl = computed(() => (props.card ? `/new/count-${props.card.count}.svg` : null));
const promptSvg = useInlineSvg(promptUrl);
const countSvg = useInlineSvg(countUrl);
</script>

<template>
  <div
    v-if="card"
    class="prompt-popover"
    :class="[wordClass, { 'is-recital': recitalActive }]"
  >
    <div class="popover-icon" v-html="promptSvg" />
    <div class="popover-count" v-html="countSvg" />
    <!-- Recital pip: appears only during a Chant Trigger recital. Shows how many
         count units have been "spoken" so far at this seat — fills toward the card's
         full count. The pip itself is a tiny circle inside the popover, lit when the
         recital lands here. -->
    <div
      v-if="recitalStep !== undefined && recitalStep > 0"
      class="popover-pip"
      :class="{ 'is-lit': recitalActive }"
    >
      <span>{{ recitalStep }}</span>
    </div>
  </div>
</template>

<style scoped>
.prompt-popover {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 6px;
  border-radius: 9999px;
  background: var(--color-cream-soft);
  color: var(--word-color, var(--color-coral));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  position: relative;
  /* Smooth re-position when the prompt card changes. */
  transition: transform 180ms cubic-bezier(.2, .8, .2, 1), box-shadow 220ms ease;
}
.prompt-popover.is-recital {
  z-index: 35;
  transform: scale(1.12);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.35),
    0 0 0 3px var(--word-muted, rgba(252, 246, 230, 0.5)),
    0 0 16px 2px var(--word-color, rgba(231, 89, 61, 0.45));
}

.popover-icon,
.popover-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.popover-icon :deep(svg) {
  width: 18px;
  height: 18px;
  display: block;
}
.popover-count :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.popover-pip {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--word-color, var(--color-coral));
  color: var(--color-cream-soft);
  font-family: var(--font-body);
  font-weight: 800;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
  border: 1.5px solid var(--color-cream-soft);
}
.popover-pip.is-lit {
  animation: pip-pop 320ms cubic-bezier(.2, .8, .2, 1);
}
@keyframes pip-pop {
  0%   { transform: scale(0.6); opacity: 0.6; }
  60%  { transform: scale(1.25); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
</style>
