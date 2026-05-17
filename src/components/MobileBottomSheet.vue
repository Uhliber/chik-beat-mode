<script setup lang="ts">
import { ref, watch } from 'vue';

/**
 * Reusable bottom sheet for mobile. Slides up from the bottom; drag the handle (or anywhere
 * in the header bar) downward past a threshold to dismiss. Tap the backdrop to dismiss.
 *
 * Pure pointer events (works on mouse + touch). No external animation library — CSS
 * transitions on `transform: translateY(...)` carry the slide.
 */

const props = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const dragY = ref(0);          // px the user has dragged down (>=0)
const dragging = ref(false);
const startY = ref(0);

const DISMISS_PX = 120;

function onHandleDown(ev: PointerEvent) {
  dragging.value = true;
  startY.value = ev.clientY;
  dragY.value = 0;
  (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
}
function onHandleMove(ev: PointerEvent) {
  if (!dragging.value) return;
  dragY.value = Math.max(0, ev.clientY - startY.value);
}
function onHandleUp() {
  if (!dragging.value) return;
  const shouldClose = dragY.value > DISMISS_PX;
  dragging.value = false;
  if (shouldClose) {
    emit('close');
  } else {
    dragY.value = 0; // snap back
  }
}

// Reset drag state whenever the sheet's open state flips (so a stale dragY isn't carried over).
watch(
  () => props.open,
  () => {
    dragY.value = 0;
    dragging.value = false;
  },
);
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
        v-if="open"
        class="fixed inset-0 z-[200] bg-black/45"
        @click="emit('close')"
      />
    </Transition>

    <Transition
      enter-from-class="translate-y-full"
      enter-active-class="transition-transform duration-300 ease-out"
      leave-active-class="transition-transform duration-300 ease-in"
      leave-to-class="translate-y-full"
    >
      <div
        v-if="open"
        class="fixed inset-x-0 bottom-0 z-[201] rounded-t-3xl flex flex-col"
        :style="{
          background: 'var(--color-cream-soft)',
          maxHeight: '85vh',
          boxShadow: '0 -16px 40px rgba(0,0,0,0.35)',
          transform: dragging ? `translateY(${dragY}px)` : 'translateY(0)',
          transition: dragging ? 'none' : 'transform 220ms ease-out',
        }"
        @click.stop
      >
        <!-- Drag handle area — pointer events here trigger drag-to-dismiss. -->
        <div
          class="pt-3 pb-2 px-4 cursor-grab active:cursor-grabbing select-none"
          style="touch-action: none;"
          @pointerdown="onHandleDown"
          @pointermove="onHandleMove"
          @pointerup="onHandleUp"
          @pointercancel="onHandleUp"
        >
          <div class="mx-auto w-10 h-1.5 rounded-full bg-stone-400/40" />
          <div class="mt-2 flex items-center justify-between">
            <h2
              class="font-display text-base uppercase tracking-widest"
              :style="{ color: 'var(--color-coral-deep)' }"
            >
              {{ title }}
            </h2>
            <button
              type="button"
              class="text-xs font-bold uppercase tracking-widest text-stone-500 hover:text-stone-800 transition-colors"
              @click="emit('close')"
            >
              Close
            </button>
          </div>
        </div>

        <!-- Body — scrollable. -->
        <div class="sheet-scroll flex-1 overflow-y-auto px-4 pb-4" style="touch-action: pan-y;">
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Themed scrollbar — coral-deep at low alpha against the cream sheet background, so it
 * blends with the rest of the settings UI instead of showing the browser's default
 * bright-white scrollbar. Covers Firefox + WebKit. */
.sheet-scroll {
  scrollbar-color: rgba(201, 84, 59, 0.32) transparent;
  scrollbar-width: thin;
}
.sheet-scroll::-webkit-scrollbar { width: 6px; }
.sheet-scroll::-webkit-scrollbar-track { background: transparent; }
.sheet-scroll::-webkit-scrollbar-thumb {
  background: rgba(201, 84, 59, 0.32);
  border-radius: 3px;
}
.sheet-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(201, 84, 59, 0.5);
}
</style>
