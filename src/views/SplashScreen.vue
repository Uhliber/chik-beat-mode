<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const SPLASH_DURATION_MS = 1500;

onMounted(() => {
  setTimeout(() => {
    router.replace({ name: 'menu' });
  }, SPLASH_DURATION_MS);
});
</script>

<template>
  <div
    class="fixed inset-0 flex items-center justify-center"
    style="background: var(--color-coral); height: 100dvh;"
  >
    <div class="flex flex-col items-center gap-3">
      <div
        class="w-20 h-28 rounded-md ring-4 ring-cream-soft/80 shadow-2xl splash-card"
        style="background-image: url('/cards/default-back.png'); background-size: cover; background-position: center;"
      />
      <div
        class="font-display text-cream-soft tracking-tight leading-none uppercase splash-title"
      >
        Chik!
      </div>
      <div class="font-subtitle text-cream-soft/80 text-sm">
        Halo Halo Games
      </div>
    </div>
  </div>
</template>

<style scoped>
.splash-title {
  font-size: clamp(3.5rem, 14vw, 6rem);
  animation: splash-pop 700ms cubic-bezier(.2, .8, .2, 1) both;
}
.splash-card {
  animation: splash-card-in 800ms cubic-bezier(.2, .8, .2, 1) both;
}
@keyframes splash-pop {
  0%   { opacity: 0; transform: scale(0.85); }
  60%  { opacity: 1; transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes splash-card-in {
  0%   { opacity: 0; transform: translateY(12px) rotate(-6deg); }
  100% { opacity: 1; transform: translateY(0) rotate(-3deg); }
}
</style>
