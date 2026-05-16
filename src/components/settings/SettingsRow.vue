<script setup lang="ts">
/**
 * A single iOS-style settings row. Icon + label on the left, control slot on the right.
 * Sits inside a SettingsGroup card; the group renders internal dividers between rows.
 */
defineProps<{
  /** Optional label below the row title (e.g. "No ads on all 108 Season 1 levels"). */
  description?: string;
  /** When true, the row reads as a button (full-width tap target). Default false. */
  asButton?: boolean;
  /** When true, dim the row to indicate a disabled state. */
  disabled?: boolean;
}>();

const emit = defineEmits<{ (e: 'click'): void }>();

function onRowClick() {
  emit('click');
}
</script>

<template>
  <component
    :is="asButton ? 'button' : 'div'"
    :type="asButton ? 'button' : undefined"
    class="settings-row"
    :class="{ 'is-button': asButton, 'is-disabled': disabled }"
    :disabled="asButton ? disabled : undefined"
    @click="asButton && !disabled && onRowClick()"
  >
    <span class="row-icon" v-if="$slots.icon">
      <slot name="icon" />
    </span>
    <span class="row-label">
      <span class="label-text"><slot name="label" /></span>
      <span v-if="description" class="label-description">{{ description }}</span>
    </span>
    <span class="row-control">
      <slot />
    </span>
  </component>
</template>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 10px 16px;
  text-align: left;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: default;
  font: inherit;
}
.settings-row.is-button {
  cursor: pointer;
  transition: background-color 120ms ease;
}
.settings-row.is-button:hover:not(.is-disabled) {
  background: rgba(0, 0, 0, 0.04);
}
.settings-row.is-button:active:not(.is-disabled) {
  background: rgba(0, 0, 0, 0.08);
}
.settings-row.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.row-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-coral-deep);
}
.row-label {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.label-text {
  font-weight: 600;
  color: rgb(28, 25, 23);
  line-height: 1.25;
}
.label-description {
  font-size: 12px;
  color: rgb(120, 113, 108);
  margin-top: 2px;
}
.row-control {
  /**
   * `margin-left: auto` consumes any remaining inline space in the row and converts it
   * into a left margin on this element — the canonical flex pattern for "always at the
   * end of the row, regardless of label width". `.row-label`'s `flex: 1` alone wasn't
   * shrinking-and-growing the way we needed when the label's intrinsic width was small.
   */
  flex-shrink: 0;
  margin-left: auto;
  color: rgb(120, 113, 108);
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
