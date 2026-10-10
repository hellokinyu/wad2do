import { createRouter, createWebHistory } from 'vue-router'

import LandingView from '@/views/LandingView.vue'
import SignUpView from '@/views/SignUpView.vue'
import LoginView from '@/views/LoginView.vue'
import OnboardingView from '@/views/OnboardingView.vue'
import ActivitiesView from '@/views/ActivitiesView.vue'
import ActivityDetailView from '@/views/ActivityDetailView.vue'
import SubmitActivityView from '@/views/SubmitActivityView.vue'
import AdminReviewView from '@/views/AdminReviewView.vue'
import ProfileView from '@/views/ProfileView.vue'
import GroupsView from '@/views/GroupsView.vue'
import GroupDetailView from '@/views/GroupDetailView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

import GroupActivitiesTab from '@/components/group/GroupActivitiesTab.vue'
import GroupAvailabilityTab from '@/components/group/GroupAvailabilityTab.vue'
import GroupItineraryTab from '@/components/group/GroupItineraryTab.vue'

const routes = [
  { path: '/', name: 'landing', component: LandingView },
  { path: '/signup', name: 'signup', component: SignUpView },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/onboarding', name: 'onboarding', component: OnboardingView },

  { path: '/activities', name: 'activities', component: ActivitiesView },
  { path: '/activities/submit', name: 'submit-activity', component: SubmitActivityView },
  { path: '/activities/:id', name: 'activity-detail', component: ActivityDetailView },

  { path: '/profile', name: 'profile', component: ProfileView },
  { path: '/admin/submissions', name: 'admin-review', component: AdminReviewView },

  { path: '/groups', name: 'groups', component: GroupsView },
  {
    // One group. The three tabs are "child routes", so each tab has its own URL,
    // e.g. /groups/12/availability, and the back button works between tabs.
    path: '/groups/:id',
    component: GroupDetailView,
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

// TODO (Member 5 with Member 1): add a router.beforeEach guard so logged-out users
// are sent to /login, and only admin accounts can open /admin/submissions.

export default router