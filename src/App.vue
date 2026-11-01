<template>
  <NavBar v-if="route.name !== 'landing'" />
  <main :class="{ 'has-navbar': route.name !== 'landing' }">
    <RouterView />
  </main>
</template>

<script setup>
import { useRoute } from 'vue-router'
import NavBar from '@/components/NavBar.vue'

const route = useRoute()
</script>

<style scoped>
@media (max-width: 767.98px) {
  .has-navbar {
    padding-bottom: var(--navbar-height, calc(61px + env(safe-area-inset-bottom, 0px)));
  }
}
</style>
