<script setup lang="ts">
defineEmits<{ (e: 'resume'): void }>();
</script>

<template>
  <!--
    Full-screen pause shield. Sits at z-25 so it's above the table and the desktop event
    log (z-20) but below the headers (z-30 / z-40), the mute button (z-30), and the solo
    HUD (z-30) — that way back-to-menu, mute, and the visible timer all stay reachable
    while the rest of the game is inert. Clicking anywhere on the shield emits 'resume'.
  -->
  <div
    class="absolute inset-0 z-[25] flex items-center justify-center pause-backdrop"
    role="button"
    tabindex="0"
    aria-label="Game paused. Tap to resume."
    @click="$emit('resume')"
    @keydown.enter.prevent="$emit('resume')"
    @keydown.space.prevent="$emit('resume')"
  >
    <div class="pause-card">
      <div class="font-display uppercase tracking-tight text-coral-deep pause-title">
        Paused
      </div>
      <div class="font-subtitle text-stone-600 pause-hint">
        Tap to resume
      </div>
    </div>
  </div>
</template>

<style scoped>
.pause-backdrop {
  background: rgba(38, 18, 12, 0.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  cursor: pointer;
  animation: pause-fade-in 180ms ease-out both;
}

.pause-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1.5rem 2.5rem;
  border-radius: 1.25rem;
  background: var(--color-cream-soft);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  ring: 1px solid rgba(0, 0, 0, 0.05);
  animation: pause-card-pop 260ms cubic-bezier(.2, .8, .2, 1) both;
  pointer-events: none;
}

.pause-title {
  font-size: clamp(2.5rem, 8vw, 4rem);
  line-height: 1;
}

.pause-hint {
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  animation: pause-hint-pulse 1.6s ease-in-out infinite;
}

@keyframes pause-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes pause-card-pop {
  from { opacity: 0; transform: scale(0.92) translateY(6px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes pause-hint-pulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .pause-backdrop,
  .pause-card { animation: none; }
  .pause-hint  { animation: none; opacity: 0.85; }
}
</style>
