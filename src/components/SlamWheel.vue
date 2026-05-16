<script setup lang="ts">
import { computed } from 'vue';

export interface WheelTarget {
  /** Stable id — for Solo this is 'left' | 'right'; for Versus it's the target seat index as string. */
  id: string;
  label: string;
  /** Image to render in the chip — top card art if there's a stack, otherwise base / seat fallback. */
  chipArt: string;
  /** Whether the chip is showing a real card (vs. a placeholder). */
  hasTopCard: boolean;
  /** Center coords of this target on screen (px). */
  screenX: number;
  screenY: number;
}

const props = defineProps<{
  /** Card art (front) to render as the ghost following the cursor. */
  cardArt: string;
  /** Where the aim started (px). */
  startX: number;
  startY: number;
  /** Current cursor position (px). */
  cursorX: number;
  cursorY: number;
  targets: WheelTarget[];
  /** id of the currently highlighted target ('' = cursor in centre / no target). */
  highlightedId: string | '';
  /** Drag distance below this px → cursor is in the cancel zone. */
  threshold: number;
  /** True once the cursor has moved past the click tolerance — i.e. user is dragging. */
  hasDragged: boolean;
}>();

const RADIUS = 130;
const CHIP_W = 64;
const CHIP_H = Math.round(CHIP_W * 1.4);

const dragDistance = computed(() =>
  Math.hypot(props.cursorX - props.startX, props.cursorY - props.startY),
);
const inCancelZone = computed(() => dragDistance.value < props.threshold);

const targetLayouts = computed(() =>
  props.targets.map((t) => {
    // If the target's real screen position is RIGHT AT the press point (e.g. dragging onto
    // your own seat in Versus), fall back to a neutral angle so the chip isn't underneath
    // the cursor.
    const dx = t.screenX - props.startX;
    const dy = t.screenY - props.startY;
    const angle = Math.hypot(dx, dy) < 4 ? 0 : Math.atan2(dy, dx);
    const wx = props.startX + Math.cos(angle) * RADIUS;
    const wy = props.startY + Math.sin(angle) * RADIUS;
    return { ...t, wx, wy };
  }),
);
</script>

<template>
  <div class="fixed inset-0 pointer-events-none z-[1000]">
    <!-- Aim ring around the press point. -->
    <div
      class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
      :style="{
        left: startX + 'px',
        top: startY + 'px',
        width: threshold * 2 + 'px',
        height: threshold * 2 + 'px',
        border: '2px dashed rgba(255,255,255,0.85)',
        background: hasDragged && inCancelZone
          ? 'rgba(220,80,60,0.28)'
          : (!hasDragged ? 'rgba(255,255,255,0.12)' : 'transparent'),
        opacity: inCancelZone || !hasDragged ? 1 : 0.55,
        transition: 'background 120ms, opacity 120ms',
      }"
    >
      <div
        v-if="hasDragged && inCancelZone"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase tracking-widest text-cream-soft whitespace-nowrap select-none"
      >
        Release to cancel
      </div>
      <div
        v-else-if="!hasDragged"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-extrabold uppercase tracking-widest text-cream-soft/85 whitespace-nowrap select-none"
      >
        Drag to aim
      </div>
    </div>

    <!-- Drag indicator line from start to cursor (skipped while still in cancel zone). -->
    <svg
      v-if="!inCancelZone"
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

    <!-- Target chips placed on a circle at each target's real direction. -->
    <div
      v-for="t in targetLayouts"
      :key="t.id"
      class="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-150 ease-out"
      :class="{ 'scale-125': highlightedId === t.id }"
      :style="{
        left: t.wx + 'px',
        top: t.wy + 'px',
        filter: highlightedId === t.id
          ? 'drop-shadow(0 0 14px rgba(252,246,230,0.95))'
          : 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))',
      }"
    >
      <div
        class="relative rounded-lg overflow-hidden"
        :style="{
          width: CHIP_W + 'px',
          height: CHIP_H + 'px',
          backgroundImage: t.chipArt ? `url(${t.chipArt})` : undefined,
          backgroundColor: t.chipArt ? undefined : 'rgba(60,40,30,0.7)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: highlightedId === t.id
            ? '0 0 0 3px rgba(252,246,230,0.95), 0 0 22px 6px rgba(252,246,230,0.55)'
            : '0 0 0 2px rgba(255,255,255,0.7), 0 6px 14px rgba(0,0,0,0.35)',
        }"
      >
        <div
          v-if="!t.chipArt"
          class="absolute inset-0 flex items-center justify-center text-cream-soft font-extrabold uppercase tracking-widest text-xs"
        >
          {{ t.label }}
        </div>
      </div>
      <div
        class="mt-1 text-center text-[10px] font-extrabold uppercase tracking-wider text-cream-soft drop-shadow"
      >
        {{ t.label }}
      </div>
    </div>

    <!-- Card clone following the cursor. -->
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
