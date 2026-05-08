<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useBeatAudio } from '@/composables/useBeatAudio';
import IconVolume from '@/components/icons/IconVolume.vue';

const router = useRouter();
const { audioMuted, setMuted } = useBeatAudio();

function back() {
  if (window.history.length > 1) router.back();
  else router.replace({ name: 'menu' });
}
</script>

<template>
  <div
    class="fixed inset-0 flex flex-col"
    style="background: var(--color-cream); height: 100dvh;"
  >
    <header class="flex items-center gap-2 px-3 py-3">
      <button
        type="button"
        aria-label="Back"
        class="w-10 h-10 rounded-full bg-cream-soft ring-1 ring-black/10 flex items-center justify-center text-coral-deep"
        @click="back"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h1 class="font-display text-coral-deep tracking-tight leading-none uppercase text-2xl">
        Settings
      </h1>
    </header>

    <main class="flex-1 px-4 pb-6 overflow-auto">
      <section class="rounded-2xl bg-cream-soft ring-1 ring-black/5 p-4 space-y-3">
        <h2 class="text-xs font-extrabold uppercase tracking-widest text-stone-500">Audio</h2>
        <label class="flex items-center justify-between gap-3 py-1">
          <span class="flex items-center gap-2 text-stone-800">
            <IconVolume :muted="audioMuted" :size="20" />
            <span class="font-semibold">Sound effects</span>
          </span>
          <button
            type="button"
            role="switch"
            :aria-checked="!audioMuted"
            class="settings-switch"
            :class="{ 'is-on': !audioMuted }"
            @click="setMuted(!audioMuted)"
          >
            <span class="settings-switch-thumb" />
          </button>
        </label>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings-switch {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 9999px;
  background: #d6cfb8;
  transition: background-color 160ms ease;
}
.settings-switch.is-on {
  background: var(--color-coral);
}
.settings-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 9999px;
  background: var(--color-cream-soft);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 160ms cubic-bezier(.2, .8, .2, 1);
}
.settings-switch.is-on .settings-switch-thumb {
  transform: translateX(20px);
}
</style>
