<script setup lang="ts">
import { computed } from 'vue';
import type { BaseSlot } from '@/game/types';

export interface WheelTarget {
  slot: BaseSlot;
  label: string;
  /** Image to render in the chip — top card art if the pile is non-empty, otherwise the base art. */
  chipArt: string;
  /** Whether the chip is showing a card (vs. the base art). */
  hasTopCard: boolean;
  /** Center coords of this base on screen (px). */
  screenX: number;
  screenY: number;
}

const props = defineProps<{
  /** Card art (front) to preview overlaid on each base chip. */
  cardArt: string;
  /** Where the aim started (px). */
  startX: number;
  startY: number;
  /** Current cursor position (px). */
  cursorX: number;
  cursorY: number;
  targets: WheelTarget[];
  /** Slot of the currently highlighted target ('' = no chip → click→main or cancel). */
  highlightedSlot: BaseSlot | '';
  /** Drag distance below this px → no chip highlight. */
  threshold: number;
  /** True once the cursor has moved past the click tolerance — i.e. user is dragging. */
  hasDragged: boolean;
}>();

const RADIUS = 120;
const CHIP_W = 64;
const CHIP_H = Math.round(CHIP_W * 1.4);

const dragDistance = computed(() =>
  Math.hypot(props.cursorX - props.startX, props.cursorY - props.startY),
);
const isDefaulting = computed(() => dragDistance.value < props.threshold);

const targetLayouts = computed(() =>
  props.targets.map((t) => {
    const dx = t.screenX - props.startX;
    const dy = t.screenY - props.startY;
    const angle = Math.atan2(dy, dx);
    const wx = props.startX + Math.cos(angle) * RADIUS;
    const wy = props.startY + Math.sin(angle) * RADIUS;
    return { ...t, wx, wy };
  }),
);
</script>

<template>
  <div class="fixed inset-0 pointer-events-none z-[1000]">
    <!-- Aim ring around the press point. Behaviour depends on whether the user has dragged:
         - No drag yet (just a click): release commits to Main. Ring is neutral.
         - Dragging, cursor still inside the ring: release CANCELS. Ring tints red. -->
    <div
      class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      :style="{
        left: startX + 'px',
        top: startY + 'px',
        width: threshold * 2 + 'px',
        height: threshold * 2 + 'px',
        border: '2px dashed rgba(255,255,255,0.85)',
        background: hasDragged && isDefaulting
          ? 'rgba(220,80,60,0.28)'
          : (!hasDragged ? 'rgba(255,255,255,0.12)' : 'transparent'),
        opacity: isDefaulting || !hasDragged ? 1 : 0.55,
        transition: 'background 120ms, opacity 120ms',
      }"
    >
      <div
        v-if="hasDragged && isDefaulting"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase tracking-widest text-cream-soft whitespace-nowrap select-none"
      >
        Release to cancel
      </div>
      <div
        v-else-if="!hasDragged"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase tracking-widest text-cream-soft whitespace-nowrap select-none"
      >
        Tap = Main
      </div>
    </div>

    <!-- Drag indicator line -->
    <svg
      v-if="!isDefaulting"
      class="absolute inset-0 w-full h-full"
      style="overflow: visible"
    >
      <line
        :x1="startX"
        :y1="startY"
        :x2="cursorX"
        :y2="cursorY"
        stroke="rgba(255,255,255,0.55)"
        stroke-width="2"
        stroke-dasharray="3 4"
      />
    </svg>

    <!-- Target chips, one per base, placed on a circle at each base's real direction -->
    <div
      v-for="t in targetLayouts"
      :key="t.slot"
      class="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ease-out"
      :class="{
        'scale-125': highlightedSlot === t.slot,
      }"
      :style="{
        left: t.wx + 'px',
        top: t.wy + 'px',
        filter: highlightedSlot === t.slot ? 'drop-shadow(0 0 14px rgba(255,235,170,0.95))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))',
      }"
    >
      <div
        class="relative rounded-lg overflow-hidden"
        :style="{
          width: CHIP_W + 'px',
          height: CHIP_H + 'px',
          backgroundImage: `url(${t.chipArt})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: highlightedSlot === t.slot
            ? '0 0 0 3px rgba(255,235,170,0.95), 0 0 22px 6px rgba(255,235,170,0.55)'
            : '0 0 0 2px rgba(255,255,255,0.7), 0 6px 14px rgba(0,0,0,0.35)',
        }"
      />
      <div
        class="mt-1 text-center text-[10px] font-extrabold uppercase tracking-wider text-cream-soft drop-shadow"
      >
        {{ t.label }}
      </div>
    </div>

    <!-- Card clone following the cursor -->
    <div
      class="absolute -translate-x-1/2 -translate-y-1/2 rounded-lg overflow-hidden"
      :style="{
        left: cursorX + 'px',
        top: cursorY + 'px',
        width: CHIP_W + 'px',
        height: CHIP_H + 'px',
        backgroundImage: `url(${cardArt})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
        transform: 'translate(-50%, -50%) rotate(-4deg)',
      }"
    />
  </div>
</template>
