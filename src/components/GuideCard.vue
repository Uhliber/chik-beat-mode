<script setup lang="ts">
import { ref } from 'vue';

const FRONT = '/guides/how-to-front.png';
const BACK = '/guides/guides-back.png';

const open = ref(false);
const hovering = ref(false);

const toggle = () => {
  open.value = !open.value;
};
</script>

<template>
  <div
    class="relative select-none"
    :style="{ perspective: '1100px' }"
    @pointerenter="hovering = true"
    @pointerleave="hovering = false"
  >
    <!-- Wrapper that scales when hovered (and grows more once the card is open & being read). -->
    <button
      type="button"
      :title="open ? 'Tap to close guide' : 'Tap to open the rules guide'"
      class="block focus:outline-none transition-[width,height,transform] duration-300 ease-out cursor-pointer"
      :style="{
        width: open && hovering ? '320px' : (open ? '120px' : '70px'),
        height: open && hovering ? '450px' : (open ? '168px' : '98px'),
        transformOrigin: 'top left',
      }"
      @click="toggle"
    >
      <!-- Flip frame -->
      <div
        class="relative w-full h-full preserve-3d transition-transform duration-500 ease-out"
        :style="{
          transform: open ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }"
      >
        <!-- Back (face-down) -->
        <div
          class="absolute inset-0 backface-hidden rounded-lg shadow-xl ring-1 ring-black/15"
          :style="{
            backgroundImage: `url(${BACK})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }"
        />
        <!-- Front (rules) -->
        <div
          class="absolute inset-0 backface-hidden rounded-lg shadow-xl ring-1 ring-black/15"
          :style="{
            backgroundImage: `url(${FRONT})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            transform: 'rotateY(180deg)',
          }"
        />
      </div>
    </button>

    <!-- Subtle hint label when closed -->
    <div
      v-if="!open"
      class="mt-1 text-[10px] font-bold uppercase tracking-widest text-cream-soft/85 drop-shadow"
    >
      How to play
    </div>
  </div>
</template>
