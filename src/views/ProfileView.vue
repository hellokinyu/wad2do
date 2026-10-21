<template>
  <div class="container py-4 py-md-5 sky-theme" data-testid="profile-page">
    <!-- Owner: Charmaine -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="!userId" class="alert alert-warning" data-testid="profile-not-logged-in">
      Please <RouterLink to="/login">log in</RouterLink> to see your profile.
    </div>

    <template v-else>
      <div v-if="logoutError" class="alert alert-danger" role="alert" data-testid="logout-error">
        {{ logoutError }}
      </div>
      <div v-if="profileError" class="alert alert-danger" role="alert" data-testid="profile-error">
        <p class="mb-2">{{ profileError }}</p>
        <button type="button" class="btn btn-outline-danger btn-sm" @click="loadProfile">Try again</button>
      </div>

      <section class="card profile-card rounded-4 mb-4" data-testid="profile-account">
        <div class="card-body p-4 profile-banner rounded-4 d-flex flex-column flex-md-row align-items-md-center gap-3">
          <div class="avatar bg-primary text-white fw-semibold" aria-hidden="true">{{ initial }}</div>

          <div class="flex-grow-1">
            <div v-if="!editingName">
              <p class="small text-primary fw-semibold mb-0">Your profile</p>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <h1 class="h3 mb-0" data-testid="profile-name">{{ displayName || 'Add your name' }}</h1>
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 text-decoration-none"
                  data-testid="profile-edit-name"
                  :disabled="!!profileError"
                  @click="startEditName"
                >
                  Edit name
                </button>
              </div>
              <p class="text-muted mb-0" data-testid="profile-email">{{ email }}</p>
            </div>

            <div v-else class="name-edit">
              <label for="name-input" class="form-label small text-muted mb-1">Display name</label>
              <div class="input-group">
                <input
                  id="name-input"
                  type="text"
                  class="form-control"
                  v-model.trim="nameDraft"
                  maxlength="40"
                  data-testid="profile-name-input"
                  @keyup.enter="saveName"
                />
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="nameDraft === '' || savingName"
                  data-testid="profile-save-name"
                  @click="saveName"
                >
                  Save
                </button>
                <button type="button" class="btn btn-outline-secondary" @click="editingName = false">Cancel</button>
              </div>
              <p v-if="nameError" class="text-danger small mt-1 mb-0">{{ nameError }}</p>
            </div>
          </div>

          <button type="button" class="btn btn-outline-danger rounded-pill px-3 align-self-md-start" data-testid="profile-logout" :disabled="loggingOut" @click="logOut">
            {{ loggingOut ? 'Logging out…' : 'Log out' }}
          </button>
        </div>
      </section>

      <section class="card profile-card rounded-4 mb-5" data-testid="profile-preferences">
        <div class="card-body p-4">
          <div class="d-flex justify-content-between align-items-start mb-4 gap-3">
            <div>
              <h2 class="h5 mb-1">Your preferences</h2>
              <p class="text-muted small mb-0">These decide which hangouts we show you first.</p>
            </div>
            <span v-if="hasChanges" class="badge rounded-pill text-bg-warning" data-testid="profile-unsaved">Unsaved changes</span>
          </div>

          <div class="row g-4">
            <div class="col-12">
              <p class="fw-semibold mb-2">Interests</p>
              <div class="d-flex flex-wrap gap-2">
                <template v-for="item in interestOptions" :key="item">
                  <input
                    type="checkbox"
                    class="btn-check"
                    :id="'pref-interest-' + slug(item)"
                    :value="item"
                    v-model="interests"
                    :data-testid="'pref-interest-' + slug(item)"
                  />
                  <label class="btn btn-outline-primary btn-sm rounded-pill px-3" :for="'pref-interest-' + slug(item)">
                    {{ item }}
                  </label>
                </template>
              </div>
              <p v-if="interests.length < 3" class="small text-muted mt-2 mb-0">Pick at least 3 for better matches</p>
            </div>

            <div class="col-12 col-lg-6">
              <p class="fw-semibold mb-2">Budget per hangout</p>
              <div class="d-flex flex-wrap gap-2">
                <template v-for="option in budgetOptions" :key="option.id">
                  <input
                    type="radio"
                    class="btn-check"
                    name="profile-budget"
                    :id="'pref-budget-' + option.id"
                    :value="option.id"
                    v-model="budget"
                    :data-testid="'pref-budget-' + option.id"
                  />
                  <label class="btn btn-outline-primary btn-sm rounded-pill px-3" :for="'pref-budget-' + option.id">
                    {{ option.label }}
                  </label>
                </template>
              </div>
            </div>

            <div class="col-12 col-lg-6">
              <label for="pref-area" class="form-label fw-semibold mb-2">Home area</label>
              <select id="pref-area" class="form-select rounded-pill px-3" v-model="homeArea" data-testid="pref-area">
                <option value="">Not set</option>
                <option v-for="area in areaOptions" :key="area" :value="area">{{ area }}</option>
              </select>
            </div>

            <div class="col-12">
              <p class="fw-semibold mb-2">Who you hang out with</p>
              <div class="d-flex flex-wrap gap-2">
                <template v-for="item in companyOptions" :key="item">
                  <input
                    type="checkbox"
                    class="btn-check"
                    :id="'pref-company-' + slug(item)"
                    :value="item"
                    v-model="company"
                    :data-testid="'pref-company-' + slug(item)"
                  />
                  <label class="btn btn-outline-primary btn-sm rounded-pill px-3" :for="'pref-company-' + slug(item)">
                    {{ item }}
                  </label>
                </template>
              </div>
            </div>
          </div>

          <div class="d-flex flex-wrap align-items-center gap-2 mt-4 pt-3 border-top">
            <button
              type="button"
              class="btn btn-primary rounded-pill px-4"
              :disabled="!hasChanges || savingPrefs || !!profileError"
              data-testid="profile-save-prefs"
              @click="savePreferences"
            >
              <span v-if="savingPrefs" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              Save preferences
            </button>
            <button
              v-if="hasChanges"
              type="button"
              class="btn btn-link text-secondary text-decoration-none"
              data-testid="profile-undo-prefs"
              @click="undoChanges"
            >
              Undo changes
            </button>
            <span v-if="prefsMessage" class="text-success small ms-1" data-testid="profile-prefs-saved">
              ✓ {{ prefsMessage }}
            </span>
            <span v-if="prefsError" class="text-danger small ms-1" data-testid="profile-prefs-error">
              {{ prefsError }}
            </span>
          </div>
        </div>
      </section>

      <section class="mb-5" data-testid="profile-saved">
        <div class="d-flex align-items-baseline gap-2 mb-3">
          <h2 class="h4 mb-0">Saved activities</h2>
          <span v-if="savedActivities.length > 0" class="text-muted">({{ savedActivities.length }})</span>
        </div>

        <div v-if="savedError" class="alert alert-danger" role="alert">
          <p class="mb-2">{{ savedError }}</p>
          <button type="button" class="btn btn-outline-danger btn-sm" @click="loadSaved">Try again</button>
        </div>

        <div v-else-if="savedActivities.length === 0" class="empty-state text-center p-5 rounded-4" data-testid="saved-empty">
          <p class="text-muted mb-3">Nothing saved yet. Tap the heart on any activity to keep it here!</p>
          <RouterLink to="/activities" class="btn btn-primary rounded-pill px-4">Browse activities</RouterLink>
        </div>

        <div v-else class="row g-3" data-testid="saved-list">
          <div v-for="activity in savedActivities" :key="activity.id" class="col-12 col-md-6 col-lg-4">
            <div class="card saved-card h-100 rounded-4 overflow-hidden" :data-testid="'saved-card-' + activity.id">
              <img
                v-if="activity.image_url"
                :src="activity.image_url"
                class="card-img-top saved-img"
                :alt="activity.name"
              />
              <div v-else class="saved-img img-placeholder d-flex align-items-center justify-content-center text-muted">
                {{ activity.category || 'Activity' }}
              </div>
              <div class="card-body d-flex flex-column">
                <h3 class="h6 mb-2">
                  <RouterLink :to="'/activities/' + activity.id" class="stretched-link text-decoration-none text-body">
                    {{ activity.name }}
                  </RouterLink>
                </h3>
                <p class="mb-2">
                  <span v-if="activity.category" class="badge rounded-pill text-bg-light border">{{ activity.category }}</span>
                </p>
                <p class="small text-muted mb-3">
                  {{ formatPrice(activity.price_per_person) }}
                  <span v-if="activity.area"> · {{ activity.area }}</span>
                </p>
                <button
                  type="button"
                  class="btn btn-outline-secondary btn-sm rounded-pill mt-auto unsave-btn"
                  :data-testid="'unsave-' + activity.id"
                  @click="unsave(activity.id)"
                >
                  Remove from saved
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section data-testid="profile-submissions">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="h4 mb-0">My submissions</h2>
          <RouterLink v-if="submissions.length > 0" to="/activities/submit" class="btn btn-outline-primary btn-sm rounded-pill px-3">
            Submit an activity
          </RouterLink>
        </div>

        <div v-if="submissionsError" class="alert alert-danger" role="alert">
          <p class="mb-2">{{ submissionsError }}</p>
          <button type="button" class="btn btn-outline-danger btn-sm" @click="loadSubmissions">Try again</button>
        </div>

        <div v-else-if="submissions.length === 0" class="empty-state text-center p-5 rounded-4" data-testid="submissions-empty">
          <p class="text-muted mb-3">Know a great hangout spot? Share it with everyone!</p>
          <RouterLink to="/activities/submit" class="btn btn-primary rounded-pill px-4">Submit an activity</RouterLink>
        </div>

        <ul v-else class="list-group shadow-sm rounded-4 overflow-hidden" data-testid="submissions-list">
          <li
            v-for="submission in submissions"
            :key="submission.id"
            class="list-group-item py-3"
            :data-testid="'submission-' + submission.id"
          >
            <div class="d-flex justify-content-between align-items-center gap-3">
              <div>
                <p class="fw-semibold mb-0">{{ submission.name }}</p>
                <p class="small text-muted mb-0">{{ submission.category }}</p>
              </div>
              <span
                class="badge rounded-pill"
                :class="statusBadgeClass(submission.status)"
                :data-testid="'submission-status-' + submission.id"
              >
                {{ statusLabel(submission.status) }}
              </span>
            </div>
            <p v-if="submission.status === 'rejected' && submission.reject_reason" class="small text-danger mb-0 mt-2">
              Reason: {{ submission.reject_reason }}
            </p>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { authErrorMessage, useAuth } from '@/composables/useAuth'

const router = useRouter()
const { user: authenticatedUser, authError } = useAuth()

const interestOptions = [
  'Food',
  'Cafes',
  'Outdoors',
  'Arts and culture',
  'Nightlife',
  'Shopping',
  'Family-friendly',
  'Wellness',
]

const budgetOptions = [
  { id: 'under-20', label: 'Under $20' },
  { id: '20-50', label: '$20–50' },
  { id: '50-100', label: '$50–100' },
  { id: '100-plus', label: '$100+' },
]

const areaOptions = [
  'Ang Mo Kio',
  'Bedok',
  'Bishan',
  'Bugis',
  'Bukit Batok',
  'Bukit Merah',
  'Bukit Panjang',
  'Bukit Timah',
  'Changi',
  'Choa Chu Kang',
  'City / Downtown',
  'Clementi',
  'Geylang',
  'Hougang',
  'Jurong East',
  'Jurong West',
  'Kallang',
  'Marine Parade',
  'Novena',
  'Orchard',
  'Paya Lebar',
  'Pasir Ris',
  'Punggol',
  'Queenstown',
  'Sembawang',
  'Sengkang',
  'Serangoon',
  'Tampines',
  'Tanjong Pagar',
  'Toa Payoh',
  'Woodlands',
  'Yishun',
]

const companyOptions = ['Friends', 'Family', 'Partner']

const loading = ref(true)
const userId = ref('')
const email = ref('')

const displayName = ref('')
const editingName = ref(false)
const nameDraft = ref('')
const savingName = ref(false)
const nameError = ref('')

const interests = ref([])
const budget = ref('')
const homeArea = ref('')
const company = ref([])
const savedPrefs = ref({ interests: [], budget: '', homeArea: '', company: [] })
const savingPrefs = ref(false)
const prefsMessage = ref('')
const prefsError = ref('')
const profileError = ref('')
const logoutError = ref('')
const loggingOut = ref(false)

const savedActivities = ref([])
const savedError = ref('')
const submissions = ref([])
const submissionsError = ref('')

const initial = computed(() => {
  const source = displayName.value || email.value || '?'
  return source.charAt(0).toUpperCase()
})

const hasChanges = computed(() => {
  return (
    !sameList(interests.value, savedPrefs.value.interests) ||
    budget.value !== savedPrefs.value.budget ||
    homeArea.value !== savedPrefs.value.homeArea ||
    !sameList(company.value, savedPrefs.value.company)
  )
})

onMounted(async () => {
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      userId.value = userData.user.id
      email.value = userData.user.email
      await Promise.all([loadProfile(), loadSaved(), loadSubmissions()])
    }
  } catch (err) {
    console.error('Could not check login:', err)
  } finally {
    loading.value = false
  }
})

async function loadProfile() {
  profileError.value = ''
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, interests, budget, home_area, company')
    .eq('id', userId.value)
    .maybeSingle()

  if (error) {
    console.error('Could not load profile:', error)
    profileError.value = "Couldn't load your profile."
    return
  }

  if (!data) {
    profileError.value = 'Your profile is unavailable. Please contact the WAD2Do team before saving preferences.'
    return
  }

  displayName.value = data.display_name || ''
  interests.value = data.interests || []
  budget.value = data.budget || ''
  homeArea.value = data.home_area || ''
  company.value = data.company || []
  rememberSavedPrefs()
}

async function loadSaved() {
  savedError.value = ''

  const { data: favourites, error: favError } = await supabase
    .from('favourites')
    .select('activity_id')
    .eq('user_id', userId.value)

  if (favError) {
    console.error('Could not load saved activities:', favError)
    savedError.value = "Couldn't load your saved activities."
    return
  }

  if (favourites.length === 0) {
    savedActivities.value = []
    return
  }

  const ids = favourites.map((fav) => fav.activity_id)
  const { data: activities, error: actError } = await supabase
    .from('activities')
    .select('id, name, category, price_per_person, area, image_url')
    .in('id', ids)

  if (actError) {
    console.error('Could not load saved activities:', actError)
    savedError.value = "Couldn't load your saved activities."
    return
  }

  savedActivities.value = activities
}

async function loadSubmissions() {
  submissionsError.value = ''
  const { data, error } = await supabase
    .from('submissions')
    .select('id, name, category, status, reject_reason')
    .eq('submitted_by', userId.value)
    .order('id', { ascending: false })

  if (error) {
    console.error('Could not load submissions:', error)
    submissionsError.value = "Couldn't load your submissions."
    return
  }

  submissions.value = data
}

function startEditName() {
  nameDraft.value = displayName.value
  nameError.value = ''
  editingName.value = true
}

async function saveName() {
  if (nameDraft.value === '') return
  savingName.value = true
  nameError.value = ''

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: nameDraft.value })
    .eq('id', userId.value)

  savingName.value = false

  if (error) {
    console.error('Could not save name:', error)
    nameError.value = "Couldn't save your name."
    return
  }

  displayName.value = nameDraft.value
  editingName.value = false
}

async function logOut() {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  authError.value = ''
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    await router.replace('/login')
  } catch (error) {
    logoutError.value = authErrorMessage(error)
    // Some Supabase versions clear the local session even when server logout fails.
    if (!authenticatedUser.value) {
      authError.value = 'You are logged out on this browser, but we could not confirm sign-out on the server. ' + logoutError.value
      await router.replace('/login')
    }
  } finally {
    loggingOut.value = false
  }
}

function rememberSavedPrefs() {
  savedPrefs.value = {
    interests: [...interests.value],
    budget: budget.value,
    homeArea: homeArea.value,
    company: [...company.value],
  }
}

function undoChanges() {
  interests.value = [...savedPrefs.value.interests]
  budget.value = savedPrefs.value.budget
  homeArea.value = savedPrefs.value.homeArea
  company.value = [...savedPrefs.value.company]
  prefsError.value = ''
}

async function savePreferences() {
  savingPrefs.value = true
  prefsMessage.value = ''
  prefsError.value = ''

  const { error } = await supabase
    .from('profiles')
    .update({
      interests: interests.value,
      budget: budget.value || null,
      home_area: homeArea.value || null,
      company: company.value,
    })
    .eq('id', userId.value)

  savingPrefs.value = false

  if (error) {
    console.error('Could not save preferences:', error)
    prefsError.value = "Couldn't save your preferences."
    return
  }

  rememberSavedPrefs()
  prefsMessage.value = 'Preferences saved'
  setTimeout(() => {
    prefsMessage.value = ''
  }, 3000)
}

async function unsave(activityId) {
  const { error } = await supabase
    .from('favourites')
    .delete()
    .eq('user_id', userId.value)
    .eq('activity_id', activityId)

  if (error) {
    console.error('Could not remove saved activity:', error)
    savedError.value = "Couldn't remove that activity."
    return
  }

  savedActivities.value = savedActivities.value.filter((activity) => activity.id !== activityId)
}

function sameList(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function formatPrice(price) {
  if (price === null || price === undefined) return 'Price not set'
  if (Number(price) === 0) return 'Free'
  return '$' + price + ' per person'
}

function statusLabel(status) {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Pending'
}

function statusBadgeClass(status) {
  if (status === 'approved') return 'text-bg-success'
  if (status === 'rejected') return 'text-bg-danger'
  return 'text-bg-warning'
}
</script>

<style scoped>
.sky-theme {
  --sky: #6ec1f2;
  --sky-strong: #3aa4e6;
  --sky-text: #17608f;
  --sky-soft: #e8f5fd;
  --sky-line: #cde9f9;
  --sky-ink: #0b3a5b;
  --bs-link-color-rgb: 23, 96, 143;
  --bs-link-hover-color-rgb: 11, 58, 91;
}

.sky-theme .text-primary {
  color: var(--sky-text) !important;
}

.sky-theme .bg-primary,
.sky-theme .text-bg-primary {
  background-color: var(--sky) !important;
  color: var(--sky-ink) !important;
}

.sky-theme .btn-primary {
  --bs-btn-color: var(--sky-ink);
  --bs-btn-bg: var(--sky);
  --bs-btn-border-color: var(--sky);
  --bs-btn-hover-color: var(--sky-ink);
  --bs-btn-hover-bg: var(--sky-strong);
  --bs-btn-hover-border-color: var(--sky-strong);
  --bs-btn-active-color: var(--sky-ink);
  --bs-btn-active-bg: var(--sky-strong);
  --bs-btn-active-border-color: var(--sky-strong);
  --bs-btn-disabled-color: var(--sky-ink);
  --bs-btn-disabled-bg: var(--sky);
  --bs-btn-disabled-border-color: var(--sky);
  --bs-btn-focus-shadow-rgb: 110, 193, 242;
}

.sky-theme .btn-outline-primary {
  --bs-btn-color: var(--sky-text);
  --bs-btn-border-color: var(--sky);
  --bs-btn-hover-color: var(--sky-ink);
  --bs-btn-hover-bg: var(--sky);
  --bs-btn-hover-border-color: var(--sky);
  --bs-btn-active-color: var(--sky-ink);
  --bs-btn-active-bg: var(--sky);
  --bs-btn-active-border-color: var(--sky);
  --bs-btn-disabled-color: var(--sky-text);
  --bs-btn-disabled-border-color: var(--sky);
  --bs-btn-focus-shadow-rgb: 110, 193, 242;
}

.sky-theme .btn-link {
  --bs-btn-color: var(--sky-text);
  --bs-btn-hover-color: var(--sky-ink);
}

.sky-theme .progress {
  --bs-progress-bar-bg: var(--sky);
}

.sky-theme .list-group {
  --bs-list-group-active-bg: var(--sky);
  --bs-list-group-active-border-color: var(--sky);
  --bs-list-group-active-color: var(--sky-ink);
}

.sky-theme .form-control:focus,
.sky-theme .form-select:focus {
  border-color: var(--sky);
  box-shadow: 0 0 0 0.25rem rgba(110, 193, 242, 0.35);
}

.profile-card {
  border: 1px solid var(--sky-line);
  box-shadow: 0 0.25rem 1rem rgba(58, 164, 230, 0.12);
}

.profile-banner {
  background: var(--sky-soft);
}

.saved-card {
  border: 1px solid var(--sky-line);
  transition: box-shadow 0.15s ease;
}

.saved-card:hover {
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1);
}

.avatar {
  width: 72px;
  height: 72px;
  border: 4px solid var(--bs-body-bg);
  box-shadow: 0 0 0 2px var(--sky);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  flex-shrink: 0;
}

.name-edit {
  max-width: 420px;
}

.saved-img {
  height: 160px;
  object-fit: cover;
}

.img-placeholder {
  background-color: var(--bs-tertiary-bg);
}

.empty-state {
  border: 2px dashed var(--bs-border-color);
}

.unsave-btn {
  position: relative;
  z-index: 2;
}
</style>
