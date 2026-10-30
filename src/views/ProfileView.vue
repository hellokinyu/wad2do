<template>
  <div class="profile-page container py-4 py-md-5" data-testid="profile-page">
    <div class="profile-theme-control">
      <NavBarTheme picker placement="profile" />
    </div>
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
      <div v-if="logoutError" class="notice mb-4" role="alert" data-testid="logout-error">
        <p class="mb-0">{{ logoutError }}</p>
      </div>

      <div v-if="profileError" class="notice mb-4" role="alert" data-testid="profile-error">
        <p class="mb-2">{{ profileError }}</p>
        <button type="button" class="btn btn-line btn-sm" @click="loadProfile">Try again</button>
      </div>

      <section class="mb-4" data-testid="profile-account">
        <div class="d-flex flex-column flex-md-row align-items-md-center gap-4">
          <div class="d-flex flex-column align-items-center gap-2">
            <AnimalAvatar :animal="avatarAnimal" :size="96" data-testid="profile-avatar" />
            <button type="button" class="btn btn-link text-body small p-0" :disabled="!!profileError || savingAvatar" data-testid="profile-edit-avatar" @click="startEditAvatar">Change picture</button>
          </div>

          <div class="flex-grow-1 text-center text-md-start">
            <p class="eyebrow mb-2">Your profile</p>

            <div v-if="!editingName">
              <h1 class="display-5 fw-bold title mb-1" data-testid="profile-name">{{ displayName || 'Add your name' }}</h1>
              <p class="muted mb-0" data-testid="profile-email">{{ email }}</p>
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
                  required
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

          <div v-if="!editingName" class="d-flex gap-2 justify-content-center justify-content-md-start align-self-md-start">
            <button
              type="button"
              class="btn btn-grey btn-sm"
              :disabled="!!profileError"
              data-testid="profile-edit-name"
              @click="startEditName"
            >
              Edit name
            </button>
            <button
              type="button"
              class="btn btn-red btn-sm"
              :disabled="loggingOut"
              data-testid="profile-logout"
              @click="logOut"
            >
              {{ loggingOut ? 'Logging out…' : 'Log out' }}
            </button>
          </div>
        </div>
        <div v-if="editingAvatar" class="panel mt-4">
          <AnimalAvatarPicker v-model="avatarDraft" :disabled="savingAvatar" />
          <div class="d-flex gap-2 mt-3">
            <button type="button" class="btn btn-ink" :disabled="!findProfileAnimal(avatarDraft) || savingAvatar" data-testid="profile-save-avatar" @click="saveAvatar">{{ savingAvatar ? 'Saving…' : 'Save picture' }}</button>
            <button type="button" class="btn btn-line" :disabled="savingAvatar" @click="editingAvatar = false">Cancel</button>
          </div>
          <p v-if="avatarError" class="error-text mt-3 mb-0" role="alert" data-testid="profile-avatar-error">{{ avatarError }}</p>
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
          <p class="stat-number stat-text mb-0" data-testid="profile-stat-area">
            <span v-if="savedPrefs.homeArea === 'City / Downtown'" class="d-md-none">City</span>
            <span :class="{ 'd-none d-md-inline': savedPrefs.homeArea === 'City / Downtown' }">{{ savedPrefs.homeArea || '—' }}</span>
          </p>
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

        <fieldset :disabled="savingPrefs" class="panel">
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

            <div class="col-12">
              <p class="group-label">Starting location</p>
              <MrtStationPicker :model-value="homeStationId" :disabled="savingPrefs" @update:model-value="pickStation">
                <div class="mt-3">
                  <label for="pref-area" class="group-label d-block">Home area</label>
                  <select id="pref-area" class="form-select field" :value="homeArea" data-testid="pref-area" @change="pickArea($event.target.value)">
                    <option value="">Not set</option>
                    <option v-for="area in homeAreas" :key="area" :value="area">{{ area }}</option>
                  </select>
                </div>
              </MrtStationPicker>
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
              class="btn btn-ink"
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
        </fieldset>
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
                <p v-if="detailsLine(activity)" class="muted small mb-3">{{ detailsLine(activity) }}</p>
                <div v-else class="mb-3"></div>
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
import MrtStationPicker from '@/components/MrtStationPicker.vue'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import AnimalAvatarPicker from '@/components/AnimalAvatarPicker.vue'
import NavBarTheme from '@/components/NavBarTheme.vue'
import { findProfileAnimal } from '@/data/profileAnimals'
import { homeAreas } from '@/data/homeAreas'
import { findStation } from '@/data/mrtStations'
import { authErrorMessage, useAuth } from '@/composables/useAuth'

const router = useRouter()
const { user: authenticatedUser, authError, avatarAnimal } = useAuth()

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

const companyOptions = ['Friends', 'Family', 'Partner']

const loading = ref(true)
const userId = ref('')
const email = ref('')

const displayName = ref('')
const editingName = ref(false)
const nameDraft = ref('')
const savingName = ref(false)
const nameError = ref('')
const editingAvatar = ref(false)
const avatarDraft = ref('')
const savingAvatar = ref(false)
const avatarError = ref('')

const interests = ref([])
const budget = ref('')
const homeArea = ref('')
const homeStationId = ref(null)
const company = ref([])
const savedPrefs = ref({ interests: [], budget: '', homeArea: '', homeStationId: null, company: [] })
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

const hasChanges = computed(() => {
  return (
    !sameList(interests.value, savedPrefs.value.interests) ||
    budget.value !== savedPrefs.value.budget ||
    homeArea.value !== savedPrefs.value.homeArea ||
    homeStationId.value !== savedPrefs.value.homeStationId ||
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
    .select('display_name, interests, budget, home_area, home_station_id, company')
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
  homeStationId.value = data.home_station_id || null
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
    .select('id, name, category, price_per_person, area, image_url, duration_min, indoor')
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
  if (savingName.value || !nameDraft.value.trim() || nameDraft.value.trim().length > 40) return
  savingName.value = true
  nameError.value = ''

  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: nameDraft.value.trim() })
    .eq('id', userId.value)
    .select()

  savingName.value = false

  if (error || !data || data.length === 0) {
    console.error('Could not save name:', error)
    nameError.value = "Couldn't save your name."
    return
  }

  displayName.value = nameDraft.value.trim()
  editingName.value = false
}

function startEditAvatar() {
  avatarDraft.value = avatarAnimal.value
  avatarError.value = ''
  editingAvatar.value = true
}

async function saveAvatar() {
  if (savingAvatar.value || !findProfileAnimal(avatarDraft.value)) return
  savingAvatar.value = true
  avatarError.value = ''
  try {
    const { error } = await supabase.auth.updateUser({
      data: { avatar_animal: avatarDraft.value },
    })
    if (error) throw error
    editingAvatar.value = false
  } catch {
    avatarError.value = "Couldn't save your picture. Please try again."
  } finally {
    savingAvatar.value = false
  }
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
    homeStationId: homeStationId.value,
    company: [...company.value],
  }
}

function undoChanges() {
  if (savingPrefs.value) return
  interests.value = [...savedPrefs.value.interests]
  budget.value = savedPrefs.value.budget
  homeArea.value = savedPrefs.value.homeArea
  homeStationId.value = savedPrefs.value.homeStationId
  company.value = [...savedPrefs.value.company]
  prefsError.value = ''
}

function pickArea(area) {
  homeStationId.value = null
  homeArea.value = area
}

function pickStation(id) {
  const station = findStation(id)
  homeStationId.value = station?.id || null
  homeArea.value = station?.area || ''
}

async function savePreferences() {
  if (savingPrefs.value || profileError.value || !hasChanges.value) return
  savingPrefs.value = true
  prefsMessage.value = ''
  prefsError.value = ''

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        interests: interests.value,
        budget: budget.value || null,
        home_area: homeArea.value || null,
        home_station_id: homeStationId.value,
        company: company.value,
      })
      .eq('id', userId.value)
      .select('id')
      .single()

    if (error || !data?.id) throw error || new Error('No profile row updated')
    rememberSavedPrefs()
    prefsMessage.value = 'Preferences saved'
    setTimeout(() => { prefsMessage.value = '' }, 3000)
  } catch (error) {
    console.error('Could not save preferences:', error)
    prefsError.value = "Couldn't save your preferences."
  } finally {
    savingPrefs.value = false
  }
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

function durationText(minutes) {
  if (!minutes) return ''
  if (minutes < 60) return minutes + ' min'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? hours + ' hr' : hours + ' hr ' + rest + ' min'
}

function settingText(activity) {
  let setting = ''
  if (activity.indoor === true) setting = 'Indoor'
  if (activity.indoor === false) setting = 'Outdoor'
  if (setting.toLowerCase() === String(activity.category || '').trim().toLowerCase()) return ''
  return setting
}

function detailsLine(activity) {
  const parts = [activity.area, durationText(activity.duration_min), settingText(activity)]
  return parts.filter((part) => part).join(' · ')
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
.profile-page {
  position: relative;
}
.profile-theme-control {
  display: none;
}
@media (max-width: 767.98px) {
  .profile-theme-control {
    display: block;
    position: absolute;
    top: 8px;
    right: calc(var(--bs-gutter-x, 1.5rem) / 2);
    z-index: 5;
  }
}

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
  overflow-wrap: anywhere;
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

@media (max-width: 767.98px) {
  .stat:last-child {
    padding-right: 0;
  }
  .stat-text {
    font-size: clamp(0.75rem, 3.5vw, 1rem);
    white-space: nowrap;
  }
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

.submission-list {
  list-style: none;
  padding: 0;
  margin: 0;
  border: 1px solid #e5e5e5;
  border-radius: 1rem;
  overflow: hidden;
}

.submission-row {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e5e5;
  background-color: #fff;
}

.submission-row:last-child {
  border-bottom: none;
}

.status {
  flex-shrink: 0;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-pending {
  border: 1px solid #cfcfcf;
  color: #6b6b6b;
}

.status-approved {
  border: 1px solid #111;
  background-color: #111;
  color: #fff;
}

.status-rejected {
  border: 1px solid #111;
  color: #111;
}

.reason {
  color: #555;
}

.notice {
  padding: 1rem 1.25rem;
  border: 1px solid #111;
  border-radius: 1rem;
  background-color: #f8f8f7;
}

.btn-ink {
  --bs-btn-color: #fff;
  --bs-btn-bg: #111;
  --bs-btn-border-color: #111;
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: #333;
  --bs-btn-hover-border-color: #333;
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: #000;
  --bs-btn-active-border-color: #000;
  --bs-btn-disabled-color: #fff;
  --bs-btn-disabled-bg: #111;
  --bs-btn-disabled-border-color: #111;
  --bs-btn-border-radius: 999px;
  --bs-btn-padding-x: 1.4rem;
  --bs-btn-padding-y: 0.6rem;
  --bs-btn-font-weight: 600;
}

.btn-line {
  --bs-btn-color: #111;
  --bs-btn-bg: #fff;
  --bs-btn-border-color: #111;
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: #111;
  --bs-btn-hover-border-color: #111;
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: #000;
  --bs-btn-active-border-color: #000;
  --bs-btn-border-radius: 999px;
  --bs-btn-padding-x: 1.2rem;
  --bs-btn-padding-y: 0.6rem;
  --bs-btn-font-weight: 600;
}

.btn-line.btn-sm {
  --bs-btn-padding-x: 0.9rem;
  --bs-btn-padding-y: 0.35rem;
  --bs-btn-font-size: 0.875rem;
}

.btn-grey {
  --bs-btn-color: #111;
  --bs-btn-bg: #ececea;
  --bs-btn-border-color: #ececea;
  --bs-btn-hover-color: #111;
  --bs-btn-hover-bg: #dcdcd8;
  --bs-btn-hover-border-color: #dcdcd8;
  --bs-btn-active-color: #111;
  --bs-btn-active-bg: #cfcfca;
  --bs-btn-active-border-color: #cfcfca;
  --bs-btn-border-radius: 999px;
  --bs-btn-padding-x: 1.2rem;
  --bs-btn-padding-y: 0.6rem;
  --bs-btn-font-weight: 600;
}

.btn-red {
  --bs-btn-color: #b42318;
  --bs-btn-bg: #fff;
  --bs-btn-border-color: #b42318;
  --bs-btn-hover-color: #fff;
  --bs-btn-hover-bg: #b42318;
  --bs-btn-hover-border-color: #b42318;
  --bs-btn-active-color: #fff;
  --bs-btn-active-bg: #8f1b12;
  --bs-btn-active-border-color: #8f1b12;
  --bs-btn-border-radius: 999px;
  --bs-btn-padding-x: 1.2rem;
  --bs-btn-padding-y: 0.6rem;
  --bs-btn-font-weight: 600;
}

.btn-grey.btn-sm,
.btn-red.btn-sm {
  --bs-btn-padding-x: 0.9rem;
  --bs-btn-padding-y: 0.35rem;
  --bs-btn-font-size: 0.875rem;
}
</style>
