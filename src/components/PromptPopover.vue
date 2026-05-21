<script setup lang="ts">
/**
 * Floating prompt+count badge that sits beside each player's active prompt card. The
 * card art baked-in icons are tiny on screen, so this popover re-renders them at a
 * readable size, recolored to the prompt card's chant word color.
 *
 * During a Chant Trigger recital, a "counter pip" is highlighted on each player as
 * the chant counts up, `recitalStep` is the count owed to this seat so far (i.e. how
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
  /** Display size, 'off' hides the popover. */
  size?: PromptInfoSize;
  /** What to render. 'combined' = prompt icon + count icon side-by-side (AI seats).
   *  'icon' = prompt icon only (human, anchored LEFT of the prompt card).
   *  'count' = count icon only (human, anchored RIGHT of the prompt card). */
  mode?: 'combined' | 'icon' | 'count';
  /** When true, lift z-index + glow so the popover stands out during a Chant Trigger. */
  recitalActive?: boolean;
}>();

const effectiveSize = computed<PromptInfoSize>(() => props.size ?? 'medium');
const isVisible = computed(() => !!props.card && effectiveSize.value !== 'off');
const mode = computed<'combined' | 'icon' | 'count'>(() => props.mode ?? 'combined');
const showIcon = computed(() => mode.value === 'combined' || mode.value === 'icon');
const showCount = computed(() => mode.value === 'combined' || mode.value === 'count');

/** Tier scales, each step roughly 1.4× the previous. Small ≈ the legacy XS size. */
const SIZE_PX: Record<Exclude<PromptInfoSize, 'off'>, { icon: number; count: number; gap: number; padX: number; padY: number }> = {
  small:  { icon: 22, count: 20, gap: 5,  padX: 8,  padY: 5 },
  medium: { icon: 32, count: 28, gap: 7,  padX: 10, padY: 6 },
  large:  { icon: 46, count: 42, gap: 9,  padX: 14, padY: 8 },
};
const sizePx = computed(() => SIZE_PX[(effectiveSize.value === 'off' ? 'medium' : effectiveSize.value)]);

/** Inline style for the popover container.
 *  - combined (AI): horizontal pill, gap + asymmetric padding.
 *  - icon / count (HUMAN): force a circular badge with explicit symmetric dimensions
 *    matching the icon size + padding. The fixed width/height beats trying to coerce
 *    a flex pill into a circle with aspect-ratio. */
const popoverStyle = computed(() => {
  const s = sizePx.value;
  if (mode.value === 'combined') {
    return { gap: s.gap + 'px', padding: `${s.padY}px ${s.padX}px` };
  }
  // Single-icon modes: padX is also forced to padY so the result is a true circle.
  const iconPx = mode.value === 'icon' ? s.icon : s.count;
  const side = iconPx + s.padY * 2;
  return {
    width: side + 'px',
    height: side + 'px',
    padding: `${s.padY}px`,
  };
});

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
    :class="[wordClass, `mode-${mode}`, { 'is-recital': recitalActive }]"
    :style="popoverStyle"
  >
    <div
      v-if="showIcon"
      class="popover-icon"
      :style="{ width: sizePx.icon + 'px', height: sizePx.icon + 'px' }"
      v-html="promptSvg"
    />
    <div
      v-if="showCount"
      class="popover-count"
      :style="{ width: sizePx.count + 'px', height: sizePx.count + 'px' }"
      v-html="countSvg"
    />
  </div>
</template>

<style scoped>
.prompt-popover {
  display: inline-flex;
  align-items: center;
  background: var(--color-cream-soft);
  color: var(--word-color, var(--color-coral));
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  position: relative;
  transition: transform 180ms cubic-bezier(.2, .8, .2, 1), box-shadow 220ms ease;
}

/* The combined pill (AI opponents) stretches to fit both icons inside a pill shape. */
.prompt-popover.mode-combined {
  border-radius: 9999px;
}

/* Single-icon modes (HUMAN split popovers) render as a coin-style circular badge.
 * Width/height are set inline (popoverStyle) so the dimensions are guaranteed equal;
 * border-radius rounds them into a perfect circle. */
.prompt-popover.mode-icon,
.prompt-popover.mode-count {
  border-radius: 9999px;
  justify-content: center;
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

</style>
