<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <!-- Switches between the two admin pages; the current one is filled like a selected chip -->
  <nav class="admin-nav" aria-label="Admin pages">
    <RouterLink to="/admin/submissions" class="admin-nav-link" data-testid="admin-nav-submissions">
      Submissions
    </RouterLink>
    <RouterLink to="/admin/activities" class="admin-nav-link" data-testid="admin-nav-activities">
      All activities
    </RouterLink>
  </nav>
</template>

<style scoped>
.admin-nav {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 20px;
  padding: 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
}

.admin-nav-link {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 18px;
  border-radius: var(--radius-pill);
  color: var(--muted);
  font-weight: 600;
  text-decoration: none;
}

.admin-nav-link:hover {
  color: var(--ink);
}

.admin-nav-link.router-link-exact-active {
  background: var(--ink);
  color: var(--on-ink);
}
</style>
