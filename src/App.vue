<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router';
const route = useRoute();
</script>

<template>
  <!-- Keying the RouterView on fullPath forces a remount when the QUERY changes on the
       same route (e.g. /play?mode=versus → /play?mode=versus&tutorial=1). Without this,
       Vue Router reuses the same component instance and the setup script never re-runs,
       so things like the tutorial controller wouldn't initialize on entry. -->
  <RouterView :key="route.fullPath" />
</template>
