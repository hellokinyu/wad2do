<template>
  <nav class="navbar navbar-expand-md bg-body-tertiary border-bottom">
    <div class="container">
      <RouterLink class="navbar-brand fw-bold" to="/">WAD2Do</RouterLink>

      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#mainNav"
        aria-controls="mainNav"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/activities"
              data-testid="nav-activities"
              >Activities</RouterLink
            >
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/groups" data-testid="nav-groups"
              >Groups</RouterLink
            >
          </li>
          <li v-if="user && isAdmin" class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/admin/submissions"
              data-testid="nav-admin"
              >Admin</RouterLink
            >
          </li>
          <li v-if="user" class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/profile"
              data-testid="nav-profile"
              >Profile</RouterLink
            >
          </li>
          <li v-else class="nav-item">
            <RouterLink class="nav-link" active-class="active" to="/login" data-testid="nav-login"
              >Log in</RouterLink
            >
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { useAuth } from '@/composables/useAuth'

const { user, isAdmin } = useAuth()
</script>
