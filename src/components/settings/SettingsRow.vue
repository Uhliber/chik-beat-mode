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
    :class="{ 'is-button': asButton, 'is-disabled': disabled, 'has-description': !!description }"
    :disabled="asButton ? disabled : undefined"
    @click="asButton && !disabled && onRowClick()"
  >
    <div class="row-main">
      <span class="row-icon" v-if="$slots.icon">
        <slot name="icon" />
      </span>
      <span class="row-label">
        <slot name="label" />
      </span>
      <span class="row-control">
        <slot />
      </span>
    </div>
    <div v-if="description" class="row-description">{{ description }}</div>
  </component>
</template>

<style scoped>
/**
 * The row is a vertical block (main line + optional full-width description). The main
 * line is flex so icon + label + control sit on one row; the description sits beneath
 * it, indented past the icon so it lines up under the label. Putting the description
 * INSIDE the label column (as the previous version did) made it wrap into a narrow
 * gutter whenever the control was wide — like the 4-button "AI skill" segmented.
 */
.settings-row {
  display: flex;
  flex-direction: column;
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
.row-main {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 32px;
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
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  color: rgb(28, 25, 23);
  line-height: 1.25;
}
.row-control {
  /**
   * `margin-left: auto` consumes any remaining inline space in the row and converts it
   * into a left margin on this element — the canonical flex pattern for "always at the
   * end of the row, regardless of label width".
   */
  flex-shrink: 0;
  margin-left: auto;
  color: rgb(120, 113, 108);
  display: flex;
  align-items: center;
  gap: 6px;
}
.row-description {
  /* Indent past the icon column so the description aligns under the label. */
  padding-left: calc(28px + 12px);
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
  color: rgb(120, 113, 108);
}
</style>
