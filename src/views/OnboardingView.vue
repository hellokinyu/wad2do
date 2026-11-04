<template>
  <div
    class="onboarding-page container py-4 py-md-5"
    :class="{ 'has-footer': step <= 4 && !loading && !loadError, 'is-done': step === 5 }"
    data-testid="onboarding-page"
  >
    <!-- Owner: Charmaine -->
    <div class="onboarding-box mx-auto">
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-body" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <div v-else-if="loadError" class="notice" role="alert" data-testid="onboarding-load-error">
        <p>{{ loadError }}</p>
        <button type="button" class="btn btn-outline-dark rounded-pill px-4 py-2" data-testid="onboarding-load-retry" @click="loadProfile">Try again</button>
      </div>

      <template v-else>
        <div
          v-if="step <= 4"
          class="step-bars mb-4"
          role="progressbar"
          aria-label="Onboarding progress"
          :aria-valuenow="step - 1"
          aria-valuemin="0"
          aria-valuemax="4"
          :aria-valuetext="`Step ${step} of 4: ${stepNames[step - 1]}`"
          data-testid="onboarding-progress"
        >
          <span v-for="n in 4" :key="n" class="step-bar" :class="{ filled: n <= step }"></span>
        </div>

        <p v-if="step <= 4" class="eyebrow mb-3">
          <span data-testid="onboarding-step-label">Step {{ step }} of 4</span>
          <span class="mx-2">·</span>
          <span>{{ stepNames[step - 1] }}</span>
        </p>

        <fieldset :disabled="saving" class="border-0 p-0 m-0">
        <!-- After each step appears, its heading takes focus so screen readers announce the new step -->
        <Transition name="step" mode="out-in" @after-enter="focusHeading">
          <section v-if="step === 1" key="interests" data-testid="onboarding-step-interests">
            <h1 class="display-5 fw-bold title mb-3" tabindex="-1">What do you <span class="hl">love</span> doing?</h1>
            <p class="lead-text mb-2">Pick at least 3 and we'll line up hangouts that fit you.</p>
            <p class="intro-note mb-4" data-testid="onboarding-intro">Four quick questions, about a minute. You can change any of it later in Profile.</p>
            <div class="onboarding-choices d-flex flex-wrap gap-2">
              <template v-for="item in interestOptions" :key="item">
                <input
                  type="checkbox"
                  class="btn-check"
                  :id="'interest-' + slug(item)"
                  :value="item"
                  v-model="interests"
                  :data-testid="'interest-' + slug(item)"
                />
                <label class="chip chip-lg" :for="'interest-' + slug(item)">{{ item }}<span class="mobile-choice-mark" aria-hidden="true"></span></label>
              </template>
            </div>
            <p class="hint mt-3 mb-0" :class="{ ready: interests.length >= 3 }" data-testid="interest-count">
              {{ interestHint }}
            </p>
          </section>

          <section v-else-if="step === 2" key="budget" data-testid="onboarding-step-budget">
            <h1 class="display-5 fw-bold title mb-3" tabindex="-1">What's your usual <span class="hl">budget?</span></h1>
            <p class="lead-text mb-4">Per person, per hangout. No judgement.</p>
            <div class="onboarding-budgets row g-3">
              <div v-for="option in budgetOptions" :key="option.id" class="col-12 col-sm-6">
                <input
                  type="radio"
                  class="btn-check"
                  name="budget"
                  :id="'budget-' + option.id"
                  :value="option.id"
                  v-model="budget"
                  :data-testid="'budget-' + option.id"
                />
                <label class="option-tile" :for="'budget-' + option.id">
                  <span class="tick" aria-hidden="true"></span>
                  <span class="d-block fs-3 fw-bold title">{{ option.label }}</span>
                  <span class="d-block tile-hint">{{ option.hint }}</span>
                </label>
              </div>
            </div>
          </section>

          <section v-else-if="step === 3" key="area" data-testid="onboarding-step-area">
            <h1 class="display-5 fw-bold title mb-3" tabindex="-1">Which MRT station do you usually <span class="hl">start from?</span></h1>
            <p class="lead-text mb-4">So we can suggest places that are an easy ride for you, and work out travel times for your group's plans.</p>
            <MrtStationPicker :model-value="homeStationId" :area="selectedStation ? '' : homeArea" :disabled="saving" @update:model-value="pickStation">
              <div class="mt-3">
                <label for="home-area" class="form-label">Not near an MRT? Pick your area instead</label>
                <select id="home-area" class="form-select field" :value="homeArea" data-testid="home-area" @change="pickArea($event.target.value)">
                  <option value="">Not set</option>
                  <option v-for="area in homeAreas" :key="area" :value="area">{{ area }}</option>
                </select>
              </div>
            </MrtStationPicker>
          </section>

          <section v-else-if="step === 4" key="identity" data-testid="onboarding-step-identity">
            <h1 class="display-5 fw-bold title mb-3" tabindex="-1">Make it <span class="hl">yours.</span></h1>
            <p class="lead-text mb-4">One last thing: add your name and pick a little face for your profile. Both are required.</p>
            <div class="mb-4">
              <label for="onboarding-name" class="form-label fw-bold">Your name <span class="text-muted">(required)</span></label>
              <input
                id="onboarding-name"
                v-model.trim="displayName"
                type="text"
                class="form-control field"
                autocomplete="nickname"
                placeholder="What should we call you?"
                maxlength="40"
                required
                aria-describedby="onboarding-name-hint"
                data-testid="onboarding-name"
                @keyup.enter.stop="goNext"
              />
              <p id="onboarding-name-hint" class="hint small mt-2">This is the name that appears on your profile. Up to 40 characters.</p>
            </div>
            <AnimalAvatarPicker v-model="avatarAnimal" :disabled="saving" />
          </section>

          <section v-else-if="step === 5" key="done" data-testid="onboarding-step-done">
            <OnboardingCelebration :animal="avatarAnimal" />
            <h1 class="display-5 fw-bold title mb-3" tabindex="-1">You're all <span class="hl">set.</span></h1>
            <p class="lead-text mb-4">Here's what we'll use to find your next hangout.</p>

            <!-- The payoff: a first look at what the answers just unlocked -->
            <div v-if="matches.length" class="matches mb-4" data-testid="onboarding-matches">
              <p class="eyebrow mb-2">First picks for you</p>
              <ul class="match-list">
                <li v-for="activity in matches" :key="activity.id">
                  <RouterLink :to="`/activities/${activity.id}`" class="match-name">{{ activity.name }}</RouterLink>
                  <span class="match-meta">{{ [activity.area, formatPrice(activity.price_per_person)].filter(Boolean).join(' · ') }}</span>
                </li>
              </ul>
            </div>

            <div class="panel mb-4">
              <div class="summary-row d-flex align-items-center gap-3">
                <AnimalAvatar :animal="avatarAnimal" :size="64" />
                <div>
                  <p class="eyebrow mb-1">Your profile</p>
                  <p class="fw-semibold mb-0" data-testid="summary-name">{{ displayName }}</p>
                </div>
              </div>
              <div class="summary-row">
                <p class="eyebrow mb-2">Interests</p>
                <div v-if="interests.length > 0" class="d-flex flex-wrap gap-2" data-testid="summary-interests">
                  <span v-for="item in interests" :key="item" class="tag">{{ item }}</span>
                </div>
                <p v-else class="mb-0" data-testid="summary-interests">Not set</p>
              </div>
              <div class="summary-row">
                <p class="eyebrow mb-1">Budget</p>
                <p class="fw-semibold mb-0" data-testid="summary-budget">{{ budgetLabel }}</p>
              </div>
              <div class="summary-row">
                <p class="eyebrow mb-1">Starting location</p>
                <p class="fw-semibold mb-0" data-testid="summary-area">{{ selectedStation ? selectedStation.name + ' MRT · ' + selectedStation.codes.join(' / ') : homeArea || 'Not set' }}</p>
              </div>
            </div>

            <div class="d-flex flex-wrap align-items-center gap-3">
              <button type="button" class="btn btn-dark rounded-pill px-4 btn-lg" data-testid="onboarding-explore" @click="exploreActivities">
                Find my hangouts →
              </button>
              <span class="hint">You can change these anytime in Profile.</span>
            </div>
          </section>
        </Transition>
        </fieldset>

        <div v-if="errorMessage" ref="errorBox" class="error-notice mt-4" role="alert" data-testid="onboarding-error">
          <p class="mb-3">{{ errorMessage }}</p>
          <button type="button" class="btn btn-outline-danger rounded-pill px-4" :disabled="saving || !canNext" @click="saveProfile">Try again</button>
        </div>

        <!-- Back, Skip and Next live together at the bottom, where a thumb reaches them on a phone -->
        <div v-if="step <= 4" class="footer-bar mt-5 pt-4">
          <button
            v-if="step > 1"
            type="button"
            class="onboarding-back"
            :disabled="saving"
            aria-label="Go back"
            data-testid="onboarding-back"
            @click="goBack"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <p class="footer-hint" aria-live="polite" data-testid="onboarding-footer-hint">{{ canNext ? '' : footerHint }}</p>
          <div class="footer-actions">
            <button
              v-if="step < 4"
              type="button"
              class="btn btn-link skip-link"
              :disabled="saving"
              data-testid="onboarding-skip"
              @click="skipStep"
            >
              Skip
            </button>
            <button
              type="button"
              class="onboarding-next btn btn-dark rounded-pill px-4 py-2"
              :disabled="!canNext || saving"
              data-testid="onboarding-next"
              @click="goNext"
            >
              <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              {{ step === 4 ? 'Finish' : 'Next' }} →
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import MrtStationPicker from '@/components/MrtStationPicker.vue'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import AnimalAvatarPicker from '@/components/AnimalAvatarPicker.vue'
import OnboardingCelebration from '@/components/OnboardingCelebration.vue'
import { findProfileAnimal } from '@/data/profileAnimals'
import { homeAreas } from '@/data/homeAreas'
import { findStation } from '@/data/mrtStations'
import { rankActivities, scoreActivity } from '@/lib/activityRanking'
import { formatPrice } from '@/lib/activityDisplay'

const router = useRouter()

const stepNames = ['Interests', 'Budget', 'Location', 'Your profile']

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
  { id: 'under-20', label: 'Under $20', hint: 'Hawker food, parks, free events' },
  { id: '20-50', label: '$20–50', hint: 'Cafes, movies, casual dining' },
  { id: '50-100', label: '$50–100', hint: 'Nice dinners, classes, attractions' },
  { id: '100-plus', label: '$100+', hint: 'Fine dining, special experiences' },
]

// Same choices as Profile

const step = ref(1)
watch(step, () => {
  if (window.matchMedia('(max-width: 767.98px)').matches) {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
})
const interests = ref([])
const budget = ref('')
const homeArea = ref('')
const homeStationId = ref(null)
const selectedStation = computed(() => findStation(homeStationId.value))
const displayName = ref('')
const avatarAnimal = ref('')
const errorBox = ref(null)

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const errorMessage = ref('')

const interestHint = computed(() => {
  const count = interests.value.length
  if (count === 0) return 'Pick 3 to continue.'
  if (count < 3) return count + ' picked. Pick ' + (3 - count) + ' more.'
  return count + ' picked. Nice!'
})

// Says why Next is greyed out, next to the button
const footerHint = computed(() => {
  if (step.value === 1) return interestHint.value
  if (step.value === 2) return 'Pick a budget to continue.'
  if (step.value === 3) return 'Pick a station or an area to continue.'
  return 'Add your name and a face to finish.'
})

const canNext = computed(() => {
  if (step.value === 1) return interests.value.length >= 3
  if (step.value === 2) return budget.value !== ''
  if (step.value === 3) return !!selectedStation.value || homeAreas.includes(homeArea.value)
  if (step.value === 4) {
    return displayName.value.trim().length > 0 && displayName.value.trim().length <= 40 && !!findProfileAnimal(avatarAnimal.value)
  }
  return true
})

const budgetLabel = computed(() => {
  const found = budgetOptions.find((option) => option.id === budget.value)
  return found ? found.label : 'Not set'
})

// Runs when the slide-in ends, so leave focus alone if someone already clicked into the new step
function focusHeading(element) {
  if (element.contains(document.activeElement)) return
  element.querySelector('h1')?.focus({ preventScroll: true })
}

async function loadProfile() {
  loading.value = true
  loadError.value = ''
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) throw userError || new Error('Not logged in')
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, interests, budget, home_area, home_station_id')
      .eq('id', userData.user.id)
      .single()

    if (error || !data) throw error || new Error('No profile row found')
    interests.value = data.interests || []
    budget.value = data.budget || ''
    homeArea.value = data.home_area || ''
    homeStationId.value = data.home_station_id || null
    displayName.value = data.display_name || ''
    avatarAnimal.value = findProfileAnimal(userData.user.user_metadata?.avatar_animal)?.id || ''
  } catch (err) {
    console.error('Could not load saved answers:', err)
    loadError.value = "Couldn't load your saved answers. Try again before editing."
  } finally {
    loading.value = false
  }
}

onMounted(loadProfile)

function onEnterKey(event) {
  if (event.key !== 'Enter' || loading.value || loadError.value) return
  const tag = event.target.tagName
  if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
  if (step.value <= 4 && canNext.value && !saving.value) goNext()
}

onMounted(() => {
  document.addEventListener('keyup', onEnterKey)
})

onUnmounted(() => {
  document.removeEventListener('keyup', onEnterKey)
})

function goBack() {
  if (saving.value) return
  errorMessage.value = ''
  if (step.value > 1) step.value--
}

function goNext() {
  if (!canNext.value || saving.value || step.value > 4) return
  errorMessage.value = ''
  if (step.value < 4) {
    step.value++
  } else {
    saveProfile()
  }
}

// Skip moves on and keeps whatever was already picked; Clear on the map is how to remove a location
function skipStep() {
  if (step.value >= 4 || saving.value) return
  step.value++
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
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

async function saveProfile() {
  if (saving.value || step.value !== 4) return
  if (!canNext.value) {
    errorMessage.value = 'Please enter your name and choose an animal before finishing.'
    return
  }
  saving.value = true
  errorMessage.value = ''

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      throw new Error('Not logged in')
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.value.trim(),
        interests: interests.value,
        budget: budget.value || null,
        home_area: homeArea.value || null,
        home_station_id: homeStationId.value,
      })
      .eq('id', userData.user.id)
      .select('id')
      .single()

    if (error) throw error
    if (!data?.id) {
      throw new Error('No profile row found for this user')
    }

    // Save the identity to Auth only after the profile row was saved successfully.
    // The router checks these fields before allowing access to the rest of the app.
    const { error: identityError } = await supabase.auth.updateUser({
      data: { display_name: displayName.value.trim(), avatar_animal: avatarAnimal.value },
    })
    if (identityError) throw identityError

    step.value = 5
    loadMatches()
  } catch (err) {
    console.error('Onboarding save failed:', err)
    errorMessage.value = "Couldn't save just now. Your answers are still here, so try again in a moment."
    await nextTick()
    errorBox.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } finally {
    saving.value = false
  }
}

// A first look at what the answers unlocked. Best effort: if it fails, the summary still shows.
const matches = ref([])
async function loadMatches() {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('id, name, category, tags, area, price_per_person')
      .limit(300)
    if (error) throw error
    const profile = { interests: interests.value, budget: budget.value, home_area: homeArea.value }
    matches.value = rankActivities(data ?? [], profile)
      .filter((activity) => scoreActivity(activity, profile) > 0)
      .slice(0, 3)
  } catch {
    matches.value = []
  }
}

function exploreActivities() {
  router.push('/activities')
}
</script>

<style scoped>
.onboarding-box {
  max-width: 720px;
}
.mobile-choice-mark {
  display: none;
}

.title {
  color: var(--ink);
  letter-spacing: -0.03em;
  line-height: 1.1;
  text-wrap: balance;
}

h1.title:focus {
  outline: none;
}

.hl {
  background-color: var(--surface-3);
  border-radius: var(--radius-sm);
  padding: 0 0.2em;
}

.eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
}

.lead-text {
  font-size: 1.1rem;
  color: var(--muted);
}

.intro-note {
  color: var(--muted);
  font-size: 0.9375rem;
}

.hint {
  color: var(--muted);
}

.hint.ready {
  color: var(--ink);
  font-weight: 600;
}

.step-bars {
  display: flex;
  gap: 6px;
}

.step-bar {
  position: relative;
  flex: 1;
  height: 6px;
  border-radius: var(--radius-pill);
  background-color: var(--surface-3);
  overflow: hidden;
}

.step-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: var(--ink);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.4s ease;
}

.step-bar.filled::after {
  transform: scaleX(1);
}

.chip {
  display: inline-block;
  padding: 0.45rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background-color: var(--surface);
  color: var(--ink);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.chip-lg {
  padding: 0.65rem 1.3rem;
  font-size: 1.05rem;
}

.chip:hover {
  background-color: var(--surface-2);
  border-color: var(--line-strong);
}

.btn-check:checked + .chip,
.chip.selected {
  background-color: var(--ink);
  border-color: var(--ink);
  color: var(--on-ink);
}

.btn-check:focus-visible + .chip,
.btn-check:focus-visible + .option-tile {
  outline: var(--focus-ring);
  outline-offset: 2px;
}

.option-tile {
  position: relative;
  display: block;
  height: 100%;
  padding: 1.25rem 1.25rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background-color: var(--surface);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.option-tile:hover {
  border-color: var(--ink);
}

.tile-hint {
  color: var(--muted);
  margin-top: 0.25rem;
}

.tick {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 20px;
  height: 20px;
  border: 2px solid var(--line-strong);
  border-radius: 50%;
}

.btn-check:checked + .option-tile {
  background-color: var(--ink);
  border-color: var(--ink);
}

.btn-check:checked + .option-tile .title {
  color: var(--on-ink);
}

/* --subtle doesn't flip against ink; a softened --on-ink stays readable (over 7:1) in both modes */
.btn-check:checked + .option-tile .tile-hint {
  color: color-mix(in srgb, var(--on-ink) 80%, var(--ink));
}

.btn-check:checked + .option-tile .tick {
  border-color: var(--surface);
  background-color: var(--surface);
  box-shadow: inset 0 0 0 4px var(--ink);
}

.field {
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.field:focus {
  border-color: var(--ink);
  box-shadow: none;
}

.matches {
  padding: 1rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background-color: var(--surface);
}

.match-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.match-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}

.match-list li:last-child {
  border-bottom: none;
}

.match-name {
  color: var(--ink);
  font-weight: 700;
  text-underline-offset: 3px;
}

.match-meta {
  color: var(--muted);
  font-size: 0.875rem;
}

.panel {
  padding: 0.5rem 1.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background-color: var(--surface-2);
}

.summary-row {
  padding: 1rem 0;
  border-bottom: 1px solid var(--line);
}

.summary-row:last-child {
  border-bottom: none;
}

.tag {
  display: inline-block;
  padding: 0.3rem 0.8rem;
  border-radius: var(--radius-pill);
  background-color: var(--ink);
  color: var(--on-ink);
  font-size: 0.875rem;
  font-weight: 500;
}

.notice {
  padding: 1rem 1.25rem;
  border: 1px solid var(--ink);
  border-radius: var(--radius-lg);
  background-color: var(--surface-2);
}

/* Errors use Bootstrap's danger colours (DESIGN.md) */
.error-notice {
  padding: 1rem 1.25rem;
  border: 1px solid var(--bs-danger-border-subtle);
  border-radius: var(--radius-lg);
  background-color: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
  scroll-margin-bottom: 120px;
}

.footer-bar {
  display: flex;
  align-items: center;
  gap: 12px 16px;
  border-top: 1px solid var(--line);
}

.footer-hint {
  flex: 1;
  margin: 0;
  color: var(--muted);
  font-size: 0.875rem;
  text-align: right;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.onboarding-back {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: transparent;
  color: inherit;
}

.onboarding-back:hover:not(:disabled) {
  background: var(--surface-2);
}

.skip-link {
  color: var(--muted);
  text-decoration: none;
}

.skip-link:hover {
  color: var(--ink);
}

.step-enter-active,
.step-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.step-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.step-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 767.98px) {
  .onboarding-page.has-footer {
    padding-bottom: calc(128px + env(safe-area-inset-bottom, 0px)) !important;
  }
  /* The finish screen has no footer, but the bottom nav still sits over the page */
  .onboarding-page.is-done {
    padding-bottom: calc(112px + env(safe-area-inset-bottom, 0px)) !important;
  }
  .onboarding-choices {
    flex-direction: column;
    align-items: stretch;
  }
  .onboarding-choices .chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 12px 16px;
    border-radius: var(--radius-md);
  }
  .mobile-choice-mark {
    display: inline-grid;
    place-items: center;
    flex: 0 0 22px;
    height: 22px;
    border: 1.5px solid var(--line-strong);
    border-radius: 50%;
  }
  .btn-check:checked + .chip .mobile-choice-mark {
    border-color: var(--surface);
    background: var(--surface);
    color: var(--ink);
  }
  .btn-check:checked + .chip .mobile-choice-mark::after {
    content: '✓';
    font-size: 14px;
    font-weight: 700;
  }
  .onboarding-budgets > div {
    flex: 0 0 100%;
    width: 100%;
  }
  .option-tile {
    padding: 16px 52px 16px 16px;
  }
  .option-tile .tick {
    top: 50%;
    transform: translateY(-50%);
  }
  /* Back, Skip and Next on one row in the thumb zone, with the reason Next is off above them */
  .footer-bar {
    position: fixed;
    inset: auto 0 0;
    z-index: 1030;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 2.4fr);
    grid-template-areas:
      'hint hint hint'
      'back skip next';
    gap: 6px 10px;
    margin-top: 0 !important;
    padding: 10px 16px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
    border-top: 1px solid var(--line);
    background: var(--surface);
  }
  .onboarding-back {
    grid-area: back;
  }
  .footer-hint {
    grid-area: hint;
    text-align: left;
  }
  .footer-hint:empty {
    display: none;
  }
  .footer-actions {
    display: contents;
  }
  .skip-link {
    grid-area: skip;
    min-height: 52px;
    padding-inline: 8px;
  }
  .onboarding-next {
    grid-area: next;
    min-height: 52px;
    width: 100%;
  }
  /* Step 4 has no Skip, so Next takes its room */
  .footer-bar:not(:has(.skip-link)) .onboarding-next {
    grid-column: 2 / -1;
  }
  .footer-bar:not(:has(.onboarding-back)) .skip-link {
    grid-column: 1 / 3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .step-enter-active,
  .step-leave-active,
  .step-bar::after {
    transition: none;
  }
}
</style>
