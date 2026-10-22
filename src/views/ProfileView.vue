<template>
  <div class="container py-4 py-md-5" data-testid="profile-page">
    <!-- Owner: Charmaine -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-dark" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="!userId" class="logged-out py-5" data-testid="profile-not-logged-in">
      <p class="eyebrow mb-3">Profile</p>
      <h1 class="display-5 fw-bold title mb-3">Log in to see your <span class="hl">profile.</span></h1>
      <p class="lead-text mb-4">Your preferences, saved activities and submissions all live here.</p>
      <div class="d-flex flex-wrap gap-2">
        <RouterLink to="/login" class="btn btn-ink">Log in →</RouterLink>
        <RouterLink to="/signup" class="btn btn-line">Sign up</RouterLink>
      </div>
    </div>

    <template v-else>
      <div v-if="logoutError" class="alert alert-danger" role="alert" data-testid="logout-error">
        {{ logoutError }}
      </div>
      <div v-if="profileError" class="alert alert-danger" role="alert" data-testid="profile-error">
        <p class="mb-2">{{ profileError }}</p>
        <button type="button" class="btn btn-line btn-sm" @click="loadProfile">Try again</button>
      </div>

      <section class="mb-4" data-testid="profile-account">
        <div class="d-flex flex-column flex-md-row align-items-md-center gap-4">
          <div class="avatar" aria-hidden="true">{{ initial }}</div>

          <div class="flex-grow-1">
            <p class="eyebrow mb-2">Your profile</p>

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
              <label for="name-input" class="visually-hidden">Display name</label>
              <div class="d-flex flex-wrap gap-2">
                <input
                  id="name-input"
                  type="text"
                  class="form-control field flex-grow-1"
                  placeholder="Your name"
                  v-model.trim="nameDraft"
                  maxlength="40"
                  data-testid="profile-name-input"
                  @keyup.enter="saveName"
                />
                <button
                  type="button"
                  class="btn btn-ink"
                  :disabled="nameDraft === '' || savingName"
                  data-testid="profile-save-name"
                  @click="saveName"
                >
                  Save
                </button>
                <button type="button" class="btn btn-line" @click="editingName = false">Cancel</button>
              </div>
              <p v-if="nameError" class="error-text small mt-2 mb-0">{{ nameError }}</p>
            </div>
          </div>

          <button type="button" class="btn btn-outline-danger rounded-pill px-3 align-self-md-start" data-testid="profile-logout" :disabled="loggingOut" @click="logOut">
            {{ loggingOut ? 'Logging out…' : 'Log out' }}
          </button>
        </div>
      </section>

      <div class="row stats g-0 mb-5">
        <div class="col-4 stat">
          <p class="stat-number mb-0" data-testid="profile-stat-saved">{{ savedActivities.length }}</p>
          <p class="stat-label mb-0">Saved</p>
        </div>
        <div class="col-4 stat">
          <p class="stat-number mb-0" data-testid="profile-stat-submissions">{{ submissions.length }}</p>
          <p class="stat-label mb-0">Submitted</p>
        </div>
        <div class="col-4 stat">
          <p class="stat-number stat-text mb-0" data-testid="profile-stat-area">{{ savedPrefs.homeArea || '—' }}</p>
          <p class="stat-label mb-0">Home area</p>
        </div>
      </div>

      <section class="mb-5" data-testid="profile-preferences">
        <div class="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-3">
          <div>
            <h2 class="h3 fw-bold title mb-1">Your preferences</h2>
            <p class="muted mb-0">These decide which hangouts we show you first.</p>
          </div>
          <span v-if="hasChanges" class="unsaved" data-testid="profile-unsaved">Unsaved changes</span>
        </div>

        <div class="panel">
          <div class="row g-4">
            <div class="col-12">
              <p class="group-label">Interests</p>
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
                  <label class="chip" :for="'pref-interest-' + slug(item)">{{ item }}</label>
                </template>
              </div>
              <p v-if="interests.length < 3" class="muted small mt-2 mb-0">Pick at least 3 for better matches.</p>
            </div>

            <div class="col-12 col-lg-7">
              <p class="group-label">Budget per hangout</p>
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
                  <label class="chip" :for="'pref-budget-' + option.id">{{ option.label }}</label>
                </template>
              </div>
            </div>

            <div class="col-12 col-lg-5">
              <label for="pref-area" class="group-label d-block">Home area</label>
              <select id="pref-area" class="form-select field" v-model="homeArea" data-testid="pref-area">
                <option value="">Not set</option>
                <option v-for="area in areaOptions" :key="area" :value="area">{{ area }}</option>
              </select>
            </div>

            <div class="col-12">
              <p class="group-label">Who you hang out with</p>
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
                  <label class="chip" :for="'pref-company-' + slug(item)">{{ item }}</label>
                </template>
              </div>
            </div>
          </div>

          <div class="d-flex flex-wrap align-items-center gap-3 mt-4 pt-4 panel-footer">
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
              class="btn btn-link text-link"
              data-testid="profile-undo-prefs"
              @click="undoChanges"
            >
              Undo changes
            </button>
            <span v-if="prefsMessage" class="fw-semibold" data-testid="profile-prefs-saved">✓ {{ prefsMessage }}</span>
            <span v-if="prefsError" class="error-text" data-testid="profile-prefs-error">{{ prefsError }}</span>
          </div>
        </div>
      </section>

      <section class="mb-5" data-testid="profile-saved">
        <div class="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-3">
          <h2 class="h3 fw-bold title mb-0">
            Saved activities
            <span v-if="savedActivities.length > 0" class="count">{{ savedActivities.length }}</span>
          </h2>
          <RouterLink v-if="savedActivities.length > 0" to="/activities" class="text-link fw-semibold">
            Browse more →
          </RouterLink>
        </div>

        <div v-if="savedError" class="notice" role="alert">
          <p class="mb-2">{{ savedError }}</p>
          <button type="button" class="btn btn-line btn-sm" @click="loadSaved">Try again</button>
        </div>

        <div v-else-if="savedActivities.length === 0" class="empty-state" data-testid="saved-empty">
          <p class="fs-5 fw-bold title mb-1">No saved activities yet</p>
          <p class="muted mb-3">Tap the heart on any activity to keep it here.</p>
          <RouterLink to="/activities" class="btn btn-ink">Browse activities →</RouterLink>
        </div>

        <div v-else class="row g-3" data-testid="saved-list">
          <div v-for="activity in savedActivities" :key="activity.id" class="col-12 col-md-6 col-lg-4">
            <div class="saved-card h-100" :data-testid="'saved-card-' + activity.id">
              <div class="saved-img-wrap">
                <img v-if="activity.image_url" :src="activity.image_url" class="saved-img" :alt="activity.name" />
                <div v-else class="saved-img img-placeholder">{{ activity.category || 'Activity' }}</div>
                <span v-if="activity.category" class="img-badge">{{ activity.category }}</span>
              </div>
              <div class="p-3 d-flex flex-column flex-grow-1">
                <h3 class="h5 fw-bold title mb-1">
                  <RouterLink :to="'/activities/' + activity.id" class="stretched-link card-link">
                    {{ activity.name }}
                  </RouterLink>
                </h3>
                <p class="fw-semibold mb-1">{{ formatPrice(activity.price_per_person) }}</p>
                <p v-if="activity.area" class="muted small mb-3">{{ activity.area }}</p>
                <button
                  type="button"
                  class="btn btn-line btn-sm mt-auto align-self-start unsave-btn"
                  :data-testid="'unsave-' + activity.id"
                  @click="unsave(activity.id)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section data-testid="profile-submissions">
        <div class="d-flex justify-content-between align-items-end flex-wrap gap-2 mb-3">
          <h2 class="h3 fw-bold title mb-0">
            My submissions
            <span v-if="submissions.length > 0" class="count">{{ submissions.length }}</span>
          </h2>
          <RouterLink v-if="submissions.length > 0" to="/activities/submit" class="text-link fw-semibold">
            Submit an activity →
          </RouterLink>
        </div>

        <div v-if="submissionsError" class="notice" role="alert">
          <p class="mb-2">{{ submissionsError }}</p>
          <button type="button" class="btn btn-line btn-sm" @click="loadSubmissions">Try again</button>
        </div>

        <div v-else-if="submissions.length === 0" class="empty-state" data-testid="submissions-empty">
          <p class="fs-5 fw-bold title mb-1">Know a great hangout spot?</p>
          <p class="muted mb-3">Share it and we'll add it for everyone once it's approved.</p>
          <RouterLink to="/activities/submit" class="btn btn-ink">Submit an activity →</RouterLink>
        </div>

        <ul v-else class="submission-list" data-testid="submissions-list">
          <li v-for="submission in submissions" :key="submission.id" class="submission-row" :data-testid="'submission-' + submission.id">
            <div class="d-flex justify-content-between align-items-center gap-3">
              <div>
                <p class="fw-bold mb-0">{{ submission.name }}</p>
                <p class="muted small mb-0">{{ submission.category }}</p>
              </div>
              <span
                class="status"
                :class="statusClass(submission.status)"
                :data-testid="'submission-status-' + submission.id"
              >
                {{ statusLabel(submission.status) }}
              </span>
            </div>
            <p v-if="submission.status === 'rejected' && submission.reject_reason" class="reason small mb-0 mt-2">
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
    .select('id')
    .single()

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
  return 'S$' + Number(price).toFixed(2) + ' / person'
}

function statusLabel(status) {
  if (status === 'approved') return 'Approved'
  if (status === 'rejected') return 'Rejected'
  return 'Pending'
}

function statusClass(status) {
  if (status === 'approved') return 'status-approved'
  if (status === 'rejected') return 'status-rejected'
  return 'status-pending'
}
</script>

<style scoped>
.title {
  color: #111;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.hl {
  background-color: #e6e6e1;
  border-radius: 0.5rem;
  padding: 0 0.2em;
}

.eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #6b6b6b;
}

.lead-text {
  font-size: 1.1rem;
  color: #555;
}

.muted {
  color: #6b6b6b;
}

.error-text {
  color: #b42318;
}

.logged-out {
  max-width: 640px;
}

.avatar {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
  border-radius: 50%;
  background-color: #111;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  font-weight: 700;
}

.name-edit {
  max-width: 480px;
}

.stats {
  border-top: 1px solid #e5e5e5;
  border-bottom: 1px solid #e5e5e5;
}

.stat {
  padding: 1.25rem 1rem;
  border-left: 1px solid #e5e5e5;
}

.stat:first-child {
  border-left: none;
  padding-left: 0;
}

.stat-number {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #111;
  line-height: 1.1;
}

.stat-text {
  font-size: 1.5rem;
  line-height: 1.5;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #6b6b6b;
}

.count {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  background-color: #e6e6e1;
  font-size: 1rem;
  vertical-align: middle;
  letter-spacing: 0;
}

.unsaved {
  padding: 0.3rem 0.8rem;
  border: 1px solid #111;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.panel {
  padding: 1.5rem;
  border: 1px solid #e5e5e5;
  border-radius: 1rem;
  background-color: #f8f8f7;
}

.panel-footer {
  border-top: 1px solid #e5e5e5;
}

.group-label {
  font-weight: 700;
  margin-bottom: 0.6rem;
  color: #111;
}

.chip {
  display: inline-block;
  padding: 0.45rem 1rem;
  border: 1px solid #dcdcdc;
  border-radius: 999px;
  background-color: #fff;
  color: #111;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.chip:hover {
  background-color: #f2f2f0;
  border-color: #bdbdbd;
}

.btn-check:checked + .chip {
  background-color: #111;
  border-color: #111;
  color: #fff;
}

.btn-check:focus-visible + .chip {
  outline: 2px solid #111;
  outline-offset: 2px;
}

.field {
  padding: 0.6rem 1rem;
  border: 1px solid #dcdcdc;
  border-radius: 0.75rem;
  background-color: #fff;
}

.form-select.field {
  padding-right: 2.5rem;
}

.field:focus {
  border-color: #111;
  box-shadow: none;
}

.text-link {
  color: #111;
  text-decoration: none;
}

.text-link:hover {
  text-decoration: underline;
}

.empty-state {
  padding: 2.5rem 1.5rem;
  border: 1.5px dashed #cfcfcf;
  border-radius: 1rem;
  text-align: center;
}

.saved-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e5e5;
  border-radius: 1rem;
  background-color: #fff;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.saved-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 0.75rem 1.5rem rgba(0, 0, 0, 0.08);
}

.saved-img-wrap {
  position: relative;
}

.saved-img {
  width: 100%;
  height: 170px;
  object-fit: cover;
}

.img-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f2f2f0;
  color: #8a8a8a;
}

.img-badge {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background-color: #fff;
  color: #111;
  font-size: 0.8rem;
  font-weight: 600;
}

.card-link {
  color: #111;
  text-decoration: none;
}

.unsave-btn {
  position: relative;
  z-index: 2;
}
</style>
