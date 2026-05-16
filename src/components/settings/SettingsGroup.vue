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
 * Thin internal dividers between rows. Inset on the left so the divider sits under the
 * label rather than the icon — matches iOS Settings.
 */
.group-card :slotted(:not(:last-child))::after {
  content: '';
  display: block;
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  margin-left: 56px;
}
</style>
