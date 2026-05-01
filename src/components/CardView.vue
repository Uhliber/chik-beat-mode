<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '@/game/Card';

const props = defineProps<{
  card?: Card;
  faceUp?: boolean;
  /** Width in px; height computed via 5:7 aspect ratio. */
  width?: number;
  /** Disable internal flip animation; just render whichever side based on faceUp. */
  staticFlip?: boolean;
  /** Used as a fallback back image when no card is given (e.g. opponent face-down). */
  forceBack?: boolean;
}>();

const FACE_BACK = '/cards/default-back.png';

const faceUrl = computed(() =>
  props.forceBack || !props.card ? FACE_BACK : props.card.assetPath,
);

const w = computed(() => props.width ?? 80);
const h = computed(() => Math.round(w.value * 1.4));
const showFace = computed(() => !!props.faceUp && !!props.card && !props.forceBack);
</script>

<template>
  <div
    class="relative select-none rounded-lg overflow-hidden"
    :style="{
      width: w + 'px',
      height: h + 'px',
      perspective: '900px',
    }"
  >
    <div
      class="absolute inset-0 preserve-3d transition-transform duration-300"
      :style="{
        transform: showFace ? 'rotateY(180deg)' : 'rotateY(0deg)',
        transitionDuration: staticFlip ? '0ms' : '300ms',
      }"
    >
      <!-- Back -->
      <div
        class="absolute inset-0 backface-hidden rounded-lg shadow-md ring-1 ring-black/10"
        :style="{
          backgroundImage: `url(${FACE_BACK})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }"
      />
      <!-- Face -->
      <div
        class="absolute inset-0 backface-hidden rounded-lg shadow-md ring-1 ring-black/10"
        :style="{
          backgroundImage: `url(${faceUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: 'rotateY(180deg)',
        }"
      />
    </div>
    <!-- Halo-Halo glow -->
    <div
      v-if="card?.isHaloHalo && showFace"
      class="absolute inset-0 rounded-lg pointer-events-none halo-glow"
    />
  </div>
</template>
