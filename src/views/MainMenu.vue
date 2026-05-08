<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useBeatAudio } from '@/composables/useBeatAudio';

const router = useRouter();
const { fx } = useBeatAudio();

function startSolo() {
  fx('tap');
  router.push({ name: 'play', query: { mode: 'solo' } });
}
function startVersus() {
  fx('tap');
  router.push({ name: 'play', query: { mode: 'play' } });
}
function openSettings() {
  fx('tap');
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
      <img
        src="/logo-white.svg"
        alt="Chik!"
        class="menu-title menu-stagger"
        style="--stagger-delay: 60ms;"
      />
      <div
        class="font-subtitle text-cream-soft/85 text-sm sm:text-base menu-stagger"
        style="--stagger-delay: 180ms;"
      >
        A Filipino chant card game
      </div>
    </header>

    <!-- Middle: primary actions. Each item rides its own stagger delay so the menu
         lands one beat at a time — title → tagline → Solo → Versus → Login → footer. -->
    <main class="flex flex-col items-stretch w-full max-w-xs gap-4 px-6">
      <button
        type="button"
        class="menu-btn menu-btn-primary menu-stagger"
        style="--stagger-delay: 320ms;"
        @click="startSolo"
      >
        Solo
      </button>
      <button
        type="button"
        class="menu-btn menu-btn-primary menu-stagger"
        style="--stagger-delay: 420ms;"
        @click="startVersus"
      >
        Versus
      </button>

      <!-- Login is feature-flagged off in V1 (Phase 2 ships auth). Render disabled so
           the slot is reserved for the eventual button. -->
      <button
        type="button"
        class="menu-btn menu-btn-ghost menu-stagger"
        style="--stagger-delay: 520ms;"
        disabled
        aria-disabled="true"
      >
        Login (soon)
      </button>
    </main>

    <!-- Bottom: settings + version -->
    <footer
      class="flex items-center justify-between w-full px-6 pb-6 menu-stagger"
      style="--stagger-delay: 640ms;"
    >
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
  height: clamp(3.8rem, 15vw, 6.5rem);
  width: auto;
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

/* Stagger entrance: each .menu-stagger fades + slides up a beat after the previous one
   via its own `--stagger-delay` inline style. The disabled Login button keeps its 0.55
   resting opacity (set explicitly in the keyframe terminus) so the cascade doesn't pop
   it back to fully opaque. */
.menu-stagger {
  opacity: 0;
  animation: menu-stagger-in 520ms cubic-bezier(.2, .8, .2, 1) forwards;
  animation-delay: var(--stagger-delay, 0ms);
  will-change: transform, opacity;
}
.menu-btn-ghost.menu-stagger {
  animation-name: menu-stagger-in-ghost;
}
@keyframes menu-stagger-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes menu-stagger-in-ghost {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 0.55; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .menu-stagger {
    animation: none;
    opacity: 1;
  }
  .menu-btn-ghost.menu-stagger {
    opacity: 0.55;
  }
}
</style>
