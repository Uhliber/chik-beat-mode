<script setup lang="ts">
/**
 * Desktop right-side drawer. Slides in from the right edge, backdrop click closes,
 * explicit "Done" pill in the header. Mirror API to MobileBottomSheet so PlayView can
 * pick whichever fits the viewport.
 */
defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();
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
        class="fixed inset-0 z-[200] bg-black/40"
        @click="emit('close')"
      />
    </Transition>

    <Transition
      enter-from-class="translate-x-full"
      enter-active-class="transition-transform duration-300 ease-out"
      leave-active-class="transition-transform duration-300 ease-in"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="open"
        class="fixed top-0 right-0 bottom-0 z-[201] flex flex-col"
        :style="{
          background: 'var(--color-cream-soft)',
          width: 'min(420px, 92vw)',
          boxShadow: '-16px 0 40px rgba(0,0,0,0.35)',
        }"
        @click.stop
      >
        <header class="flex items-center justify-between px-4 py-3 border-b border-black/10">
          <h2
            class="font-display text-base uppercase tracking-widest m-0"
            :style="{ color: 'var(--color-coral-deep)' }"
          >
            {{ title }}
          </h2>
          <button
            type="button"
            class="done-pill"
            @click="emit('close')"
          >
            Done
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-3 py-4">
          <slot />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.done-pill {
  padding: 6px 14px;
  border-radius: 9999px;
  background: var(--color-cream);
  color: var(--color-coral-deep);
  font-weight: 700;
  font-size: 14px;
  border: 0;
  cursor: pointer;
  transition: background-color 120ms ease, transform 120ms ease;
}
.done-pill:hover { background: var(--color-cream-soft); }
.done-pill:active { transform: scale(0.96); }
</style>
