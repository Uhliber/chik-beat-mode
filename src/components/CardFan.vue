<script setup lang="ts">
import { computed } from 'vue';
import CardView from './CardView.vue';
import type { Card } from '@/game/Card';

const props = defineProps<{
  cards: Card[];
  faceUp: boolean;
  cardWidth?: number;
  /** Maximum total fan angle in degrees. */
  fanAngle?: number;
  /** Vertical lift toward the arc center (px). */
  arc?: number;
  /** Whether each card is interactive (click to slam). */
  interactive?: boolean;
}>();

const emit = defineEmits<{
  (e: 'card-aim-start', payload: { card: Card; el: HTMLElement; clientX: number; clientY: number }): void;
}>();

const cardW = computed(() => props.cardWidth ?? 70);
const fanAngle = computed(() => props.fanAngle ?? 38);
const arc = computed(() => props.arc ?? 18);

const layouts = computed(() => {
  const n = props.cards.length;
  if (n === 0) return [];
  const range = fanAngle.value;
  return props.cards.map((c, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = -range / 2 + t * range;
    const lift = Math.sin(t * Math.PI) * arc.value;
    return {
      card: c,
      transform: `translateX(${(i - (n - 1) / 2) * (cardW.value * 0.45)}px) translateY(${-lift}px) rotate(${angle}deg)`,
      zIndex: i,
    };
  });
});

const onPointerDown = (card: Card, ev: PointerEvent) => {
  const el = (ev.currentTarget as HTMLElement);
  emit('card-aim-start', { card, el, clientX: ev.clientX, clientY: ev.clientY });
};
</script>

<template>
  <div class="relative flex items-end justify-center" :style="{ minHeight: (cardWidth ?? 70) * 1.6 + 'px' }">
    <div
      v-for="(layout, i) in layouts"
      :key="layout.card.id"
      class="absolute bottom-0"
      :style="{
        transform: layout.transform,
        zIndex: layout.zIndex,
        transformOrigin: 'bottom center',
        transition: 'transform 220ms cubic-bezier(.2,.7,.2,1)',
      }"
      :data-card-id="layout.card.id"
    >
      <button
        v-if="interactive"
        type="button"
        class="block hover:-translate-y-2 transition-transform duration-200 cursor-grab active:cursor-grabbing focus:outline-none"
        :style="{ touchAction: 'none' }"
        @pointerdown.prevent="onPointerDown(layout.card, $event)"
      >
        <CardView :card="layout.card" :face-up="faceUp" :width="cardW" />
      </button>
      <div v-else class="block pointer-events-none">
        <CardView :card="layout.card" :face-up="faceUp" :width="cardW" />
      </div>
    </div>
  </div>
</template>
