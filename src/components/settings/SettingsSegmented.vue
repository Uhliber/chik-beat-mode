<script setup lang="ts">
/**
 * Pill-bordered button group for discrete values. Used for Players (3-6) and Speed
 * (0.25x..4x) where the user picks from a small set rather than typing a number.
 */
defineProps<{
  modelValue: string | number;
  options: { label: string; value: string | number }[];
}>();

const emit = defineEmits<{ (e: 'update:modelValue', v: string | number): void }>();
</script>

<template>
  <div class="segmented">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="seg-btn"
      :class="{ 'is-on': opt.value === modelValue }"
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: inline-flex;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.06);
  padding: 2px;
}
.seg-btn {
  padding: 4px 10px;
  border: 0;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: rgb(60, 50, 40);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease;
}
.seg-btn.is-on {
  background: var(--color-cream-soft);
  color: var(--color-coral-deep);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.seg-btn:not(.is-on):hover {
  background: rgba(0, 0, 0, 0.04);
}
</style>
