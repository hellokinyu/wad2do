<template>
  <div
    class="onboarding-page container py-4 py-md-5"
    :class="{ 'has-footer': step <= 5 && !loading && !loadError, 'has-back': step > 1 && step <= 5 }"
    data-testid="onboarding-page"
  >
    <!-- Owner: Charmaine -->
    <div class="onboarding-box mx-auto">
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-dark" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <div v-else-if="loadError" class="notice" role="alert" data-testid="onboarding-load-error">
        <p>{{ loadError }}</p>
        <button type="button" class="btn btn-line" data-testid="onboarding-load-retry" @click="loadProfile">Try again</button>
      </div>

      <template v-else>
        <div
          v-if="step <= 5"
          class="step-bars mb-4"
          role="progressbar"
          aria-label="Onboarding progress"
          :aria-valuenow="progressPercent"
          aria-valuemin="0"
          aria-valuemax="100"
          data-testid="onboarding-progress"
        >
          <span v-for="n in 5" :key="n" class="step-bar" :class="{ filled: n <= step }"></span>
        </div>

        <p v-if="step <= 5" class="eyebrow mb-3">
          <span data-testid="onboarding-step-label">Step {{ step }} of 5</span>
          <span class="mx-2">·</span>
          <span>{{ stepNames[step - 1] }}</span>
        </p>

        <fieldset :disabled="saving" class="border-0 p-0 m-0">
        <Transition name="step" mode="out-in">
          <section v-if="step === 1" key="interests" data-testid="onboarding-step-interests">
            <h1 class="display-5 fw-bold title mb-3">What do you <span class="hl">love</span> doing?</h1>
            <p class="lead-text mb-4">Pick at least 3 and we'll line up hangouts that fit you.</p>
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
            <h1 class="display-5 fw-bold title mb-3">What's your usual <span class="hl">budget?</span></h1>
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
            <h1 class="display-5 fw-bold title mb-3">Which MRT station do you usually <span class="hl">start from?</span></h1>
            <p class="lead-text mb-4">Choose your usual starting station. We'll use its area for activity matches.</p>
            <MrtStationPicker :model-value="homeStationId" :disabled="saving" @update:model-value="pickStation">
              <div class="mt-3">
                <label for="home-area" class="form-label">Home area</label>
                <select id="home-area" class="form-select field" :value="homeArea" data-testid="home-area" @change="pickArea($event.target.value)">
                  <option value="">Not set</option>
                  <option v-for="area in homeAreas" :key="area" :value="area">{{ area }}</option>
                </select>
              </div>
            </MrtStationPicker>
          </section>

          <section v-else-if="step === 4" key="company" data-testid="onboarding-step-company">
            <h1 class="display-5 fw-bold title mb-3">Who do you usually <span class="hl">hang out</span> with?</h1>
            <p class="lead-text mb-4">Optional. Pick any that apply.</p>
            <div class="onboarding-choices d-flex flex-wrap gap-2">
              <template v-for="item in companyOptions" :key="item">
                <input
                  type="checkbox"
                  class="btn-check"
                  :id="'company-' + slug(item)"
                  :value="item"
                  v-model="company"
                  :data-testid="'company-' + slug(item)"
                />
                <label class="chip chip-lg" :for="'company-' + slug(item)">{{ item }}<span class="mobile-choice-mark" aria-hidden="true"></span></label>
              </template>
            </div>

          </section>

          <section v-else-if="step === 5" key="identity" data-testid="onboarding-step-identity">
            <h1 class="display-5 fw-bold title mb-3">Make it <span class="hl">yours.</span></h1>
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

          <section v-else-if="step === 6" key="done" data-testid="onboarding-step-done">
            <OnboardingCelebration :animal="avatarAnimal" />
            <p class="eyebrow mb-3">All done</p>
            <h1 class="display-5 fw-bold title mb-3">You're all <span class="hl">set.</span></h1>
            <p class="lead-text mb-4">Here's what we'll use to find your next hangout.</p>

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
              <div class="summary-row">
                <p class="eyebrow mb-1">Hangs out with</p>
                <p class="fw-semibold mb-0" data-testid="summary-company">{{ listOrNotSet(company) }}</p>
              </div>
            </div>

            <div class="d-flex flex-wrap align-items-center gap-3">
              <button type="button" class="btn btn-ink btn-lg" data-testid="onboarding-explore" @click="exploreActivities">
                Find my hangouts →
              </button>
              <span class="hint">You can change these anytime in Profile.</span>
            </div>
          </section>
        </Transition>
        </fieldset>

        <div v-if="errorMessage" class="notice mt-4" role="alert" data-testid="onboarding-error">
          <p class="mb-3">{{ errorMessage }}</p>
          <button type="button" class="btn btn-line btn-sm" :disabled="saving || !canNext" @click="saveProfile">Try again</button>
        </div>

        <div v-if="step <= 5" class="footer-bar d-flex justify-content-between align-items-center mt-5 pt-4">
          <button
            type="button"
            class="onboarding-back btn btn-line"
            :class="{ invisible: step === 1 }"
            :disabled="saving"
            data-testid="onboarding-back"
            @click="goBack"
          >
            ← Back
          </button>
          <div class="footer-actions d-flex align-items-center gap-3">
            <button
              v-if="step < 5"
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
              class="onboarding-next btn btn-ink"
              :disabled="!canNext || saving"
              data-testid="onboarding-next"
              @click="goNext"
            >
              <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
              {{ step === 5 ? 'Finish' : 'Next' }} →
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import MrtStationPicker from '@/components/MrtStationPicker.vue'
import AnimalAvatar from '@/components/AnimalAvatar.vue'
import AnimalAvatarPicker from '@/components/AnimalAvatarPicker.vue'
import OnboardingCelebration from '@/components/OnboardingCelebration.vue'
import { findProfileAnimal } from '@/data/profileAnimals'
import { homeAreas } from '@/data/homeAreas'
import { findStation } from '@/data/mrtStations'

const router = useRouter()

const stepNames = ['Interests', 'Budget', 'Location', 'Company', 'Your profile']

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

const companyOptions = ['Friends', 'Family', 'Partner']

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
const company = ref([])
const displayName = ref('')
const avatarAnimal = ref('')

const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const errorMessage = ref('')

const progressPercent = computed(() => Math.round((step.value / 5) * 100))

const interestHint = computed(() => {
  const count = interests.value.length
  if (count === 0) return 'Pick 3 to continue.'
  if (count < 3) return count + ' picked. Pick ' + (3 - count) + ' more.'
  return count + ' picked. Nice!'
})

const canNext = computed(() => {
  if (step.value === 1) return interests.value.length >= 3
  if (step.value === 2) return budget.value !== ''
  if (step.value === 3) return !!selectedStation.value || homeAreas.includes(homeArea.value)
  if (step.value === 5) {
    return displayName.value.trim().length > 0 && displayName.value.trim().length <= 40 && !!findProfileAnimal(avatarAnimal.value)
  }
  return true
})

const budgetLabel = computed(() => {
  const found = budgetOptions.find((option) => option.id === budget.value)
  return found ? found.label : 'Not set'
})

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function listOrNotSet(items) {
  return items.length > 0 ? items.join(', ') : 'Not set'
}

async function loadProfile() {
  loading.value = true
  loadError.value = ''
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) throw userError || new Error('Not logged in')
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, interests, budget, home_area, home_station_id, company')
      .eq('id', userData.user.id)
      .single()

    if (error || !data) throw error || new Error('No profile row found')
    interests.value = data.interests || []
    budget.value = data.budget || ''
    homeArea.value = data.home_area || ''
    homeStationId.value = data.home_station_id || null
    company.value = data.company || []
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
  if (step.value <= 5 && canNext.value && !saving.value) goNext()
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
  if (!canNext.value || saving.value || step.value > 5) return
  errorMessage.value = ''
  if (step.value < 5) {
    step.value++
  } else {
    saveProfile()
  }
}

function skipStep() {
  if (step.value >= 5 || saving.value) return
  if (step.value === 1) interests.value = []
  if (step.value === 2) budget.value = ''
  if (step.value === 3) pickStation(null)
  if (step.value === 4) company.value = []

  step.value++
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
  if (saving.value || step.value !== 5) return
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
        company: company.value,
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

    step.value = 6
  } catch (err) {
    console.error('Onboarding save failed:', err)
    errorMessage.value = "We couldn't save your answers. Please check you're logged in and try again."
  } finally {
    saving.value = false
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

.hint {
  color: #6b6b6b;
}

.hint.ready {
  color: #111;
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
  border-radius: 999px;
  background-color: #e6e6e1;
  overflow: hidden;
}

.step-bar::after {
  content: '';
  position: absolute;
  inset: 0;
  background-color: #111;
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
  border: 1px solid #dcdcdc;
  border-radius: 999px;
  background-color: #fff;
  color: #111;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.chip-lg {
  padding: 0.65rem 1.3rem;
  font-size: 1.05rem;
}

.chip:hover {
  background-color: #f2f2f0;
  border-color: #bdbdbd;
}

.btn-check:checked + .chip,
.chip.selected {
  background-color: #111;
  border-color: #111;
  color: #fff;
}

.btn-check:focus-visible + .chip,
.btn-check:focus-visible + .option-tile {
  outline: 2px solid #111;
  outline-offset: 2px;
}

.option-tile {
  position: relative;
  display: block;
  height: 100%;
  padding: 1.25rem 1.25rem 1.1rem;
  border: 1px solid #dcdcdc;
  border-radius: 1rem;
  background-color: #fff;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.option-tile:hover {
  border-color: #111;
}

.tile-hint {
  color: #6b6b6b;
  margin-top: 0.25rem;
}

.tick {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 20px;
  height: 20px;
  border: 2px solid #c8c8c8;
  border-radius: 50%;
}

.btn-check:checked + .option-tile {
  background-color: #111;
  border-color: #111;
}

.btn-check:checked + .option-tile .title {
  color: #fff;
}

.btn-check:checked + .option-tile .tile-hint {
  color: #cfcfcf;
}

.btn-check:checked + .option-tile .tick {
  border-color: #fff;
  background-color: #fff;
  box-shadow: inset 0 0 0 4px #111;
}

.field {
  padding: 0.75rem 1rem;
  border: 1px solid #dcdcdc;
  border-radius: 0.75rem;
}

.field:focus {
  border-color: #111;
  box-shadow: none;
}

.panel {
  padding: 0.5rem 1.5rem;
  border: 1px solid #e5e5e5;
  border-radius: 1rem;
  background-color: #f8f8f7;
}

.summary-row {
  padding: 1rem 0;
  border-bottom: 1px solid #e5e5e5;
}

.summary-row:last-child {
  border-bottom: none;
}

.tag {
  display: inline-block;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  background-color: #111;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 500;
}

.notice {
  padding: 1rem 1.25rem;
  border: 1px solid #111;
  border-radius: 1rem;
  background-color: #f8f8f7;
}

.footer-bar {
  border-top: 1px solid #e5e5e5;
}

.skip-link {
  color: #6b6b6b;
  text-decoration: none;
}

.skip-link:hover {
  color: #111;
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

.area-group {
  margin-bottom: 1.25rem;
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
    padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important;
  }
  .onboarding-page.has-footer.has-back {
    padding-bottom: calc(144px + env(safe-area-inset-bottom, 0px)) !important;
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
    border-radius: 14px;
  }
  .mobile-choice-mark {
    display: inline-grid;
    place-items: center;
    flex: 0 0 22px;
    height: 22px;
    border: 1.5px solid #c8c8c8;
    border-radius: 50%;
  }
  .btn-check:checked + .chip .mobile-choice-mark {
    border-color: #fff;
    background: #fff;
    color: #111;
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
  .onboarding-box :deep(.animal-options) {
    grid-template-columns: minmax(0, 1fr);
  }
  .onboarding-box :deep(.animal-tile) {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
    padding: 12px 40px 12px 16px;
  }
  .onboarding-box :deep(.animal-tile .animal-avatar) {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
  }
  .onboarding-box :deep(.selection-mark) {
    top: 50%;
    right: 16px;
    transform: translateY(-50%);
  }
  .footer-bar {
    position: fixed;
    inset: auto 0 0;
    z-index: 1030;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
    gap: 8px 12px;
    margin-top: 0 !important;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px)) !important;
    background: #fff;
    box-shadow: 0 -4px 16px rgb(0 0 0 / 4%);
  }
  .footer-actions {
    display: contents !important;
  }
  .onboarding-back {
    grid-row: 1;
    grid-column: 1 / -1;
    justify-self: start;
    min-height: 44px;
  }
  .onboarding-back.invisible {
    display: none;
  }
  .skip-link {
    grid-column: 1;
    grid-row: 1;
    min-height: 52px;
    padding-inline: 8px;
  }
  .onboarding-next {
    grid-column: 2;
    grid-row: 1;
    min-height: 52px;
    width: 100%;
  }
  .has-back .skip-link,
  .has-back .onboarding-next {
    grid-row: 2;
  }
  .footer-actions .onboarding-next:only-child {
    grid-column: 1 / -1;
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
