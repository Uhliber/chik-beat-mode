<script setup lang="ts">
/**
 * Modal chooser surfaced when the human draws a Snap card matching the current chant
 * beat. The drawer may snap-play it Left or Right (overriding any prompt, including
 * Stop), or Keep it for a later turn. Auto-dismisses if the engine clears its pending
 * state (e.g. AI somehow resolved it first).
 */
import CardView from './CardView.vue';
import type { Card } from '@/game/Card';

defineProps<{
  /** The drawn Snap card. */
  card: Card | null;
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'choose', direction: 'left' | 'right' | 'keep'): void;
}>();
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && card"
        class="fixed inset-0 z-[260] bg-black/55 backdrop-blur-[2px] flex items-center justify-center px-4"
      >
        <Transition
          enter-from-class="opacity-0 scale-95 translate-y-2"
          enter-active-class="transition duration-200 ease-out"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="open"
            class="snap-card rounded-2xl px-5 pt-5 pb-4 flex flex-col items-center gap-4"
            :style="{ background: 'var(--color-cream-soft)', maxWidth: '320px' }"
          >
            <div class="text-center">
              <div class="font-display uppercase tracking-widest text-coral-deep text-sm">
                Snap drawn
              </div>
              <div class="text-xs text-stone-600 mt-1">
                Matches the current beat — play it now or keep it?
              </div>
            </div>

            <div class="my-1">
              <CardView :card="card" :face-up="true" :width="84" :static-flip="true" />
            </div>

            <div class="flex items-center gap-2 w-full">
              <button
                type="button"
                class="snap-btn flex-1"
                @click="emit('choose', 'left')"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>Left</span>
              </button>
              <button
                type="button"
                class="snap-btn flex-1"
                @click="emit('choose', 'right')"
              >
                <span>Right</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <button
              type="button"
              class="text-xs font-bold uppercase tracking-widest text-stone-500 hover:text-stone-800 transition-colors"
              @click="emit('choose', 'keep')"
            >
              Keep
            </button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.snap-card {
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
.snap-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 0;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color 120ms ease, transform 80ms ease;
}
.snap-btn:hover { background: var(--color-coral-deep); }
.snap-btn:active { transform: scale(0.97); }
</style>
