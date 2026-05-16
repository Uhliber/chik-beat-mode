<script setup lang="ts">
/**
 * Standalone settings route reached from the main menu. Renders the same SettingsPanel
 * used in-game so there's a single source of truth for what "settings" looks like.
 *
 * We don't have an active game here, so player count / speed / restart / back-to-menu
 * are hidden — only Audio, Display (turn indicator), and About remain meaningful.
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Preferences } from '@capacitor/preferences';
import SettingsPanel from '@/components/SettingsPanel.vue';
import { useBeatAudio } from '@/composables/useBeatAudio';

const router = useRouter();
const { audioMuted, setMuted } = useBeatAudio();

// Mirror useGame's wisp + strict-prompts persistence (without spinning up a Game) so the
// toggles are the same keys, surveyed from this view too.
const WISP_KEY = 'chik-wisp-enabled';
const STRICT_KEY = 'chik-strict-prompts';
const wispEnabled = ref(true);
const strictPrompts = ref(false);
void Preferences.get({ key: WISP_KEY }).then(({ value }) => {
  wispEnabled.value = value === null || value === undefined ? true : (value === '1' || value === 'true');
}).catch(() => undefined);
void Preferences.get({ key: STRICT_KEY }).then(({ value }) => {
  strictPrompts.value = value === '1' || value === 'true';
}).catch(() => undefined);
function setWispEnabled(v: boolean) {
  wispEnabled.value = v;
  void Preferences.set({ key: WISP_KEY, value: v ? '1' : '0' }).catch(() => undefined);
}
function setStrictPrompts(v: boolean) {
  strictPrompts.value = v;
  void Preferences.set({ key: STRICT_KEY, value: v ? '1' : '0' }).catch(() => undefined);
}

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
      <SettingsPanel
        mode="versus"
        :audio-muted="audioMuted"
        :wisp-enabled="wispEnabled"
        :strict-prompts="strictPrompts"
        :player-count="4"
        :speed="1"
        hide-game-section
        hide-round-actions
        @update:audio-muted="setMuted"
        @update:wisp-enabled="setWispEnabled"
        @update:strict-prompts="setStrictPrompts"
        @update:player-count="() => undefined"
        @update:speed="() => undefined"
        @restart="() => undefined"
        @back-to-menu="back"
      />
    </main>
  </div>
</template>
