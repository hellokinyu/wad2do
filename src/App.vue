<template>
  <NavBar v-if="route.name !== 'landing'" />
  <main>
    <RouterView />
  </main>
</template>

<script setup>
import { useRoute } from 'vue-router'
import NavBar from '@/components/NavBar.vue'

const route = useRoute()
</script>
