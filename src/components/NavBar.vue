<template>
  <nav ref="navbar" class="navbar navbar-expand-md bg-white border-bottom">
    <div class="container">
      <RouterLink class="navbar-brand" to="/" aria-label="WAD2Do home">
        <img :src="brandLogo" alt="WAD2Do" class="brand-logo" width="180" height="60" />
      </RouterLink>

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
            >
              <svg
                class="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="m16 8-2.5 5.5L8 16l2.5-5.5z" />
              </svg>
              Activities
            </RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/groups"
              data-testid="nav-groups"
            >
              <svg
                class="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="8" r="3" />
                <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" />
              </svg>
              Groups
            </RouterLink>
          </li>
          <li v-if="user && isAdmin" class="nav-item">
            <RouterLink
              class="nav-link nav-admin-link"
              active-class="active"
              to="/admin/submissions"
              data-testid="nav-admin"
            >
              <svg
                class="nav-icon admin-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m12 3 8 3v6c0 4-3.4 7-8 9-4.6-2-8-5-8-9V6Z" />
                <path class="admin-tick" d="m8 12 2.7 2.7L16 9.5" pathLength="1" />
              </svg>
              Admin
            </RouterLink>
          </li>
          <li v-if="user" class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/profile"
              data-testid="nav-profile"
            >
              <AnimalAvatar :animal="avatarAnimal" :size="34" data-testid="nav-profile-avatar" />
              Profile
            </RouterLink>
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
import { onMounted, onUnmounted, ref } from 'vue'
import { useAuth } from '@/composables/useAuth'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import brandLogo from '@/assets/wad2do-logo.png'

const { user, isAdmin, avatarAnimal } = useAuth()
const navbar = ref(null)
let resizeObserver

onMounted(() => {
  const updateHeight = () => {
    document.documentElement.style.setProperty(
      '--navbar-height',
      `${navbar.value.getBoundingClientRect().height}px`,
    )
  }
  updateHeight()
  resizeObserver = new ResizeObserver(updateHeight)
  resizeObserver.observe(navbar.value)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  document.documentElement.style.removeProperty('--navbar-height')
})
</script>

<style scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 1020;
}

.brand-logo {
  display: block;
  width: 180px;
  height: 60px;
  object-fit: contain;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 44px;
  font-size: 1.1rem;
}
.nav-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.admin-icon {
  width: 22px;
  height: 22px;
  transition: transform 180ms ease;
}
.nav-admin-link:is(:hover, :focus-visible) .admin-icon {
  transform: rotate(-5deg);
}
.nav-admin-link:is(:hover, :focus-visible) .admin-tick {
  stroke-dasharray: 1;
  animation: admin-tick-draw 350ms ease-out;
}
@keyframes admin-tick-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .admin-icon {
    transition: none;
  }
  .nav-admin-link:is(:hover, :focus-visible) .admin-icon {
    transform: none;
  }
  .nav-admin-link:is(:hover, :focus-visible) .admin-tick {
    animation: none;
  }
}
</style>
