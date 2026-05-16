<script setup lang="ts">
/**
 * iOS-style switch. Lifts the look the old SettingsView used inline so we have one
 * canonical toggle component everywhere.
 */
const props = defineProps<{
  modelValue: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="props.modelValue"
    :aria-label="ariaLabel"
    class="settings-toggle"
    :class="{ 'is-on': props.modelValue }"
    @click="emit('update:modelValue', !props.modelValue)"
  >
    <span class="thumb" />
  </button>
</template>

<style scoped>
.settings-toggle {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 9999px;
  background: #d6cfb8;
  transition: background-color 160ms ease;
  flex-shrink: 0;
}
.settings-toggle.is-on {
  background: var(--color-coral);
}
.thumb {
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
.settings-toggle.is-on .thumb {
  transform: translateX(20px);
}
</style>
