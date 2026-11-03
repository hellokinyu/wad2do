<template>
  <nav ref="navbar" class="navbar navbar-expand-md bg-body border-bottom">
    <NavBarTheme />
    <div class="container">
      <RouterLink class="navbar-brand" to="/" aria-label="WAD2Do home">
        <img :src="brandLogo" alt="WAD2Do" class="brand-logo" width="180" height="60" />
      </RouterLink>

      <button
        ref="toggler"
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

      <div ref="menu" class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/activities"
              aria-label="Activities"
              title="Activities"
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
              <span class="nav-label">Activities</span>
            </RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/groups"
              aria-label="Groups"
              title="Groups"
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
              <span class="nav-label">Groups</span>
            </RouterLink>
          </li>
          <li class="nav-item nav-submit-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/activities/submit"
              aria-label="Submit an activity"
              title="Submit an activity"
              data-testid="nav-submit-activity"
            >
              <svg
                class="nav-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span class="nav-label">Submit an activity</span>
            </RouterLink>
          </li>
          <li v-if="user && isAdmin" class="nav-item">
            <RouterLink
              class="nav-link nav-admin-link"
              active-class="active"
              to="/admin/submissions"
              aria-label="Admin"
              title="Admin"
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
              <span class="nav-label">Admin</span>
            </RouterLink>
          </li>
          <li v-if="user" class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/profile"
              aria-label="Profile"
              title="Profile"
              data-testid="nav-profile"
            >
              <AnimalAvatar :animal="avatarAnimal" :size="34" data-testid="nav-profile-avatar" />
              <span class="nav-label">Profile</span>
            </RouterLink>
          </li>
          <li v-else class="nav-item">
            <RouterLink
              class="nav-link"
              active-class="active"
              to="/login"
              aria-label="Log in"
              title="Log in"
              data-testid="nav-login"
            >
              <svg
                class="nav-icon nav-login-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M14 4h5v16h-5M3 12h12m-4-4 4 4-4 4" />
              </svg>
              <span class="nav-label">Log in</span>
            </RouterLink>
          </li>
          <NavBarTheme picker />
        </ul>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import NavBarTheme from '@/components/NavBarTheme.vue'
import brandLogo from '@/assets/wad2do-logo.png'

const { user, isAdmin, avatarAnimal } = useAuth()
const navbar = ref(null)
const toggler = ref(null)
const menu = ref(null)
const route = useRoute()

// On phones, Bootstrap leaves the menu open after tapping a link, covering the new page.
// Close it by pressing the menu button again whenever the page changes.
watch(
  () => route.fullPath,
  () => {
    if (menu.value?.classList.contains('show')) toggler.value?.click()
  },
)
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
.nav-login-icon {
  display: none;
}
.nav-submit-item {
  display: none;
}
@media (max-width: 767.98px) {
  .navbar {
    position: fixed;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    padding-bottom: calc(var(--bs-navbar-padding-y) + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--line);
    border-bottom: 0 !important;
  }
  .navbar > .container {
    flex-wrap: nowrap;
    gap: 8px;
    padding-left: max(12px, env(safe-area-inset-left, 0px));
    padding-right: max(12px, env(safe-area-inset-right, 0px));
  }
  .navbar-brand {
    display: none;
  }
  .navbar-toggler {
    display: none;
  }
  .navbar-collapse {
    display: flex !important;
    flex: 1;
    min-width: 0;
  }
  /* Share the full bottom row, including room for an admin's fifth icon. */
  .navbar-nav {
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: space-around;
    gap: clamp(4px, 1.6vw, 8px);
  }
  .navbar-nav > .nav-item {
    flex-shrink: 0;
  }
  .nav-submit-item {
    display: list-item;
  }
  .navbar .nav-link {
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    gap: 0;
  }
  .nav-label {
    display: none;
  }
  .nav-login-icon {
    display: block;
  }
  /* Give the navigation the full mobile row; decorative art stays on desktop. */
  .navbar :deep(.nt-item),
  .navbar :deep(.nt-walker),
  .navbar :deep(.nt-picker) {
    display: none;
  }
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
