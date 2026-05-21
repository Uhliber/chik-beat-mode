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
 *
 * `size` controls the icon scale. 'off' hides the popover entirely (the user prefers
 * to read counts off the card art alone). Layout is strictly horizontal: prompt icon
 * on the LEFT, count icon on the RIGHT, never stacked.
 */
import { computed } from 'vue';
import { useInlineSvg } from '@/composables/useInlineSvg';
import type { Card } from '@/game/Card';
import type { PromptInfoSize } from '@/composables/userPreferences';

const props = defineProps<{
  card: Card | null;
  /** Display size — 'off' hides the popover. */
  size?: PromptInfoSize;
  /** When true, lift z-index + glow so the popover stands out during a Chant Trigger. */
  recitalActive?: boolean;
  /** Step counter pip — number of count units already spoken at this seat during the
   *  active recital. -1 = inactive (no pip rendered). */
  recitalStep?: number;
}>();

const effectiveSize = computed<PromptInfoSize>(() => props.size ?? 'medium');
const isVisible = computed(() => !!props.card && effectiveSize.value !== 'off');

/** Tier scales — each step roughly 1.4× the previous. Small = current legacy size. */
const SIZE_PX: Record<Exclude<PromptInfoSize, 'off'>, { icon: number; count: number; gap: number; padX: number; padY: number; pip: number; pipFont: number }> = {
  small:  { icon: 22, count: 20, gap: 5,  padX: 8,  padY: 5, pip: 22, pipFont: 12 },
  medium: { icon: 32, count: 28, gap: 7,  padX: 10, padY: 6, pip: 26, pipFont: 13 },
  large:  { icon: 46, count: 42, gap: 9,  padX: 14, padY: 8, pip: 32, pipFont: 16 },
};
const sizePx = computed(() => SIZE_PX[(effectiveSize.value === 'off' ? 'medium' : effectiveSize.value)]);

const wordClass = computed(() => (props.card ? `word-${props.card.word}` : ''));
const promptUrl = computed(() => (props.card ? `/new/prompt-${props.card.prompt}.svg` : null));
const countUrl = computed(() => (props.card ? `/new/count-${props.card.count}.svg` : null));
const promptSvg = useInlineSvg(promptUrl);
const countSvg = useInlineSvg(countUrl);
</script>

<template>
  <div
    v-if="isVisible"
    class="prompt-popover"
    :class="[wordClass, { 'is-recital': recitalActive }]"
    :style="{
      gap: sizePx.gap + 'px',
      padding: `${sizePx.padY}px ${sizePx.padX}px`,
    }"
  >
    <div
      class="popover-icon"
      :style="{ width: sizePx.icon + 'px', height: sizePx.icon + 'px' }"
      v-html="promptSvg"
    />
    <div
      class="popover-count"
      :style="{ width: sizePx.count + 'px', height: sizePx.count + 'px' }"
      v-html="countSvg"
    />
    <!-- Recital pip: appears only during a Chant Trigger recital. Shows how many
         count units have been "spoken" so far at this seat. -->
    <div
      v-if="recitalStep !== undefined && recitalStep > 0"
      class="popover-pip"
      :class="{ 'is-lit': recitalActive }"
      :style="{
        minWidth: sizePx.pip + 'px',
        height: sizePx.pip + 'px',
        fontSize: sizePx.pipFont + 'px',
      }"
    >
      <span>{{ recitalStep }}</span>
    </div>
  </div>
</template>

<style scoped>
.prompt-popover {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  background: var(--color-cream-soft);
  color: var(--word-color, var(--color-coral));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  position: relative;
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
  flex-shrink: 0;
}
.popover-icon :deep(svg),
.popover-count :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.popover-pip {
  position: absolute;
  top: -8px;
  right: -8px;
  padding: 0 6px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--word-color, var(--color-coral));
  color: var(--color-cream-soft);
  font-family: var(--font-body);
  font-weight: 800;
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
