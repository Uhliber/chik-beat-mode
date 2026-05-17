<script setup lang="ts">
/**
 * iOS-style grouped section card. Optional title above the card. Children should be
 * SettingsRow instances — the group renders thin internal dividers between them.
 */
defineProps<{ title?: string }>();
</script>

<template>
  <section class="settings-group">
    <h3 v-if="title" class="group-title">{{ title }}</h3>
    <div class="group-card">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-group + .settings-group {
  margin-top: 24px;
}
.group-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: rgb(120, 113, 108);
  padding: 0 16px 8px;
  margin: 0;
}
.group-card {
  background: var(--color-cream-soft);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
/**
 * Thin internal dividers between rows. The previous implementation put the divider as
 * `display: block; margin-left: 56px;` inside each row via `::after` — which made the
 * pseudo-element a FLEX ITEM in the row's flex layout (because each row is `display:
 * flex`). That phantom 56px-margin flex item at the end of the row was pushing the
 * actual `.row-control` 56px short of the right edge. The fix: absolutely-positioned
 * pseudo-element so it lives in its own layer and contributes nothing to the row's
 * inline flow.
 */
.group-card :slotted(:not(:last-child)) {
  position: relative;
}
.group-card :slotted(:not(:last-child))::after {
  content: '';
  position: absolute;
  left: 56px;
  right: 0;
  bottom: 0;
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  pointer-events: none;
}
</style>
