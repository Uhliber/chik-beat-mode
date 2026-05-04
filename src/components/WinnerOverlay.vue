<script setup lang="ts">
import IconTrophy from './icons/IconTrophy.vue';
import Confetti from './Confetti.vue';

defineProps<{ winnerId: string | null }>();
defineEmits<{ (e: 'restart'): void }>();
</script>

<template>
  <!-- Confetti renders OUTSIDE the dim overlay so the pieces fall over the whole table.
       Mounted only while a winner is set; unmount → animation stops automatically. -->
  <Confetti v-if="winnerId" />

  <Transition
    enter-from-class="opacity-0"
    enter-active-class="transition duration-300"
    leave-active-class="transition duration-300"
    leave-to-class="opacity-0"
  >
    <div
      v-if="winnerId"
      class="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto"
      style="background: rgba(0, 0, 0, 0.45)"
    >
      <div
        class="rounded-3xl p-8 max-w-md text-center"
        style="background: var(--color-cream-soft); box-shadow: 0 20px 60px rgba(0,0,0,0.4)"
      >
        <div class="text-sm uppercase tracking-widest text-coral-deep font-bold">Winner</div>
        <div
          class="flex items-center justify-center gap-3 my-3 text-5xl font-display font-black uppercase"
          style="color: var(--color-coral)"
        >
          <IconTrophy :size="48" />
          <span>{{ winnerId.toUpperCase() }}</span>
          <IconTrophy :size="48" />
        </div>
        <button
          type="button"
          class="mt-2 px-5 py-2 rounded-full font-extrabold uppercase tracking-wider text-cream-soft"
          style="background: var(--color-coral)"
          @click="$emit('restart')"
        >
          Play again
        </button>
      </div>
    </div>
  </Transition>
</template>
