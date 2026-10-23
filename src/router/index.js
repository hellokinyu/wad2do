import { createRouter, createWebHistory } from 'vue-router'
import { watch } from 'vue'
import { useAuth } from '@/composables/useAuth'

import LandingView from '@/views/LandingView.vue'
import SignUpView from '@/views/SignUpView.vue'
import LoginView from '@/views/LoginView.vue'
import OnboardingView from '@/views/OnboardingView.vue'
import ActivitiesView from '@/views/ActivitiesView.vue'
import ActivityDetailView from '@/views/ActivityDetailView.vue'
import SubmitActivityView from '@/views/SubmitActivityView.vue'
import AdminReviewView from '@/views/AdminReviewView.vue'
import AdminAccessView from '@/views/AdminAccessView.vue'
import ProfileView from '@/views/ProfileView.vue'
import GroupsView from '@/views/GroupsView.vue'
import GroupDetailView from '@/views/GroupDetailView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

import GroupActivitiesTab from '@/components/group/GroupActivitiesTab.vue'
import GroupAvailabilityTab from '@/components/group/GroupAvailabilityTab.vue'
import GroupItineraryTab from '@/components/group/GroupItineraryTab.vue'

const routes = [
  { path: '/', name: 'landing', component: LandingView },
  { path: '/signup', name: 'signup', component: SignUpView, meta: { guestOnly: true } },
  { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: OnboardingView,
    meta: { requiresAuth: true },
  },

  {
    path: '/activities',
    name: 'activities',
    component: ActivitiesView,
    meta: { requiresAuth: true },
  },
  {
    path: '/activities/submit',
    name: 'submit-activity',
    component: SubmitActivityView,
    meta: { requiresAuth: true },
  },
  {
    path: '/activities/:id',
    name: 'activity-detail',
    component: ActivityDetailView,
    meta: { requiresAuth: true },
  },

  { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
  {
    path: '/admin/submissions',
    name: 'admin-review',
    component: AdminReviewView,
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/access',
    name: 'admin-access',
    component: AdminAccessView,
    meta: { requiresAuth: true },
  },

  { path: '/groups', name: 'groups', component: GroupsView, meta: { requiresAuth: true } },
  {
    // One group. The three tabs are "child routes", so each tab has its own URL,
    // e.g. /groups/12/availability, and the back button works between tabs.
    path: '/groups/:id',
    component: GroupDetailView,
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'group-activities' } },
      { path: 'activities', name: 'group-activities', component: GroupActivitiesTab },
      { path: 'availability', name: 'group-availability', component: GroupAvailabilityTab },
      { path: 'itinerary', name: 'group-itinerary', component: GroupItineraryTab },
    ],
  },

  // Any other URL shows the 404 page. Keep this last.
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

const { user, isAdmin, initializeAuth, loadAdminStatus } = useAuth()

router.beforeEach(async (to) => {
  // Wait for the saved session before deciding whether to redirect after a refresh.
  await initializeAuth()
  if (to.meta.requiresAuth && !user.value) return { name: 'login' }
  if (to.meta.guestOnly && user.value) return { name: 'landing' }
  if (to.name !== 'admin-access') await loadAdminStatus()
  if (to.meta.requiresAdmin && !isAdmin.value) return { name: 'admin-access' }
})

// Also leave a protected page when the user signs out in another tab.
const stopWatching = watch(user, (currentUser) => {
  const route = router.currentRoute.value
  if (!currentUser && route.meta.requiresAuth) router.replace({ name: 'login' })
  if (currentUser && route.meta.guestOnly) router.replace({ name: 'landing' })
})

if (import.meta.hot) import.meta.hot.dispose(stopWatching)

export default router
