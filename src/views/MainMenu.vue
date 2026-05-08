<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function startSolo() {
  router.push({ name: 'play', query: { mode: 'solo' } });
}
function startVersus() {
  router.push({ name: 'play', query: { mode: 'play' } });
}
function openSettings() {
  router.push({ name: 'settings' });
}
</script>

<template>
  <div
    class="fixed inset-0 flex flex-col items-center justify-between"
    style="background: var(--color-coral); height: 100dvh;"
  >
    <!-- Top: title block -->
    <header class="flex flex-col items-center gap-2 pt-12 px-6 text-center">
      <div
        class="font-display text-cream-soft tracking-tight leading-none uppercase menu-title"
      >
        Chik!
      </div>
      <div class="font-subtitle text-cream-soft/85 text-sm sm:text-base">
        A Filipino chant card game
      </div>
    </header>

    <!-- Middle: primary actions -->
    <main class="flex flex-col items-stretch w-full max-w-xs gap-4 px-6">
      <button
        type="button"
        class="menu-btn menu-btn-primary"
        @click="startSolo"
      >
        Solo
      </button>
      <button
        type="button"
        class="menu-btn menu-btn-primary"
        @click="startVersus"
      >
        Versus
      </button>

      <!-- Login is feature-flagged off in V1 (Phase 2 ships auth). Render disabled so
           the slot is reserved for the eventual button. -->
      <button
        type="button"
        class="menu-btn menu-btn-ghost"
        disabled
        aria-disabled="true"
      >
        Login (soon)
      </button>
    </main>

    <!-- Bottom: settings + version -->
    <footer class="flex items-center justify-between w-full px-6 pb-6">
      <button
        type="button"
        aria-label="Settings"
        class="w-11 h-11 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-md"
        @click="openSettings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <span class="font-subtitle text-cream-soft/70 text-xs tracking-wider">v0.1</span>
    </footer>
  </div>
</template>

<style scoped>
.menu-title {
  font-size: clamp(4rem, 16vw, 7rem);
}
.menu-btn {
  width: 100%;
  padding: 0.95rem 1.25rem;
  border-radius: 9999px;
  font-family: var(--font-body);
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 0.95rem;
  transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}
.menu-btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.99);
}
.menu-btn-primary {
  background: var(--color-cream-soft);
  color: var(--color-coral-deep);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.22);
}
.menu-btn-ghost {
  background: transparent;
  color: var(--color-cream-soft);
  border: 2px solid rgba(252, 246, 230, 0.55);
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
