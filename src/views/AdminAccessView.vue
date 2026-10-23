<script setup>
import { useAuth } from '@/composables/useAuth'
const { adminError } = useAuth()
</script>

<template>
  <div class="container py-5" data-testid="admin-access-page">
    <h1>{{ adminError ? 'Unable to check access' : 'Admin access required' }}</h1>
    <p role="alert">{{ adminError || 'Only accounts marked as admin can review submissions.' }}</p>
    <RouterLink v-if="adminError" to="/admin/submissions" class="btn btn-dark me-2"
      >Try again</RouterLink
    >
    <RouterLink to="/" class="btn btn-outline-dark">Back to home</RouterLink>
  </div>
</template>
