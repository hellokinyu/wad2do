<template>
  <div class="container py-4 py-md-5" data-testid="onboarding-page">
    <!-- Owner: Charmaine -->
    <div class="onboarding-box mx-auto">
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-dark" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <template v-else>
        <div
          v-if="step < 5"
          class="step-bars mb-4"
          role="progressbar"
          aria-label="Onboarding progress"
          :aria-valuenow="progressPercent"
          aria-valuemin="0"
          aria-valuemax="100"[]
          data-testid="onboarding-progress"
        >
          <span v-for="n in 4" :key="n" class="step-bar" :class="{ filled: n <= step }"></span>
        </div>

        <p v-if="step < 5" class="eyebrow mb-3">
          <span data-testid="onboarding-step-label">Step {{ step }} of 4</span>
          <span class="mx-2">·</span>
          <span>{{ stepNames[step - 1] }}</span>
        </p>

        <Transition name="step" mode="out-in">
          <section v-if="step === 1" key="interests" data-testid="onboarding-step-interests">
            <h1 class="display-5 fw-bold title mb-3">What do you <span class="hl">love</span> doing?</h1>
            <p class="lead-text mb-4">Pick at least 3 and we'll line up hangouts that fit you.</p>
            <div class="d-flex flex-wrap gap-2">
              <template v-for="item in interestOptions" :key="item">
                <input
                  type="checkbox"
                  class="btn-check"
                  :id="'interest-' + slug(item)"
                  :value="item"
                  v-model="interests"
                  :data-testid="'interest-' + slug(item)"
                />
                <label class="chip chip-lg" :for="'interest-' + slug(item)">{{ item }}</label>
              </template>
            </div>
            <p class="hint mt-3 mb-0" :class="{ ready: interests.length >= 3 }" data-testid="interest-count">
              {{ interestHint }}
            </p>
          </section>

          <section v-else-if="step === 2" key="budget" data-testid="onboarding-step-budget">
            <h1 class="display-5 fw-bold title mb-3">What's your usual <span class="hl">budget?</span></h1>
            <p class="lead-text mb-4">Per person, per hangout. No judgement.</p>
            <div class="row g-3">
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
            <h1 class="display-5 fw-bold title mb-3">Where do you usually <span class="hl">start?</span></h1>
            <p class="lead-text mb-4">We'll show hangouts near you first.</p>
            <input
              type="text"
              class="form-control field mb-3"
              placeholder="Search areas, e.g. Tampines"
              v-model="areaSearch"
              data-testid="area-search"
            />
            <p class="hint mb-3">
              <template v-if="homeArea">
                Starting from <strong class="text-dark" data-testid="area-selected">{{ homeArea }}</strong>
              </template>
              <template v-else>Pick one area.</template>
            </p>
            <div v-for="group in filteredGroups" :key="group.name" class="area-group">
              <p class="eyebrow mb-2">{{ group.name }}</p>
              <div class="d-flex flex-wrap gap-2">
                <button
                  v-for="area in group.areas"
                  :key="area"
                  type="button"
                  class="chip"
                  :class="{ selected: homeArea === area }"
                  :data-testid="'area-option-' + slug(area)"
                  @click="pickArea(area)"
                >
                  {{ area }}
                </button>
              </div>
            </div>
            <p v-if="filteredGroups.length === 0" class="hint mb-0">No areas match "{{ areaSearch }}".</p>
          </section>

          <section v-else-if="step === 4" key="company" data-testid="onboarding-step-company">
            <h1 class="display-5 fw-bold title mb-3">Who do you usually <span class="hl">hang out</span> with?</h1>
            <p class="lead-text mb-4">Optional. Pick any that apply.</p>
            <div class="d-flex flex-wrap gap-2">
              <template v-for="item in companyOptions" :key="item">
                <input
                  type="checkbox"
                  class="btn-check"
                  :id="'company-' + slug(item)"
                  :value="item"
                  v-model="company"
                  :data-testid="'company-' + slug(item)"
                />
                <label class="chip chip-lg" :for="'company-' + slug(item)">{{ item }}</label>
              </template>
            </div>

            <div v-if="errorMessage" class="notice mt-4" role="alert" data-testid="onboarding-error">
              <p class="fw-semibold mb-1">Something went wrong.</p>
              <p class="mb-3">{{ errorMessage }}</p>
              <button type="button" class="btn btn-line btn-sm" @click="saveProfile">Try again</button>
            </div>
          </section>

          <section v-else-if="step === 5" key="done" data-testid="onboarding-step-done">
            <p class="eyebrow mb-3">All done</p>
            <h1 class="display-5 fw-bold title mb-3">You're all <span class="hl">set.</span></h1>
            <p class="lead-text mb-4">Here's what we'll use to find your next hangout.</p>

            <div class="panel mb-4">
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
                <p class="eyebrow mb-1">Home area</p>
                <p class="fw-semibold mb-0" data-testid="summary-area">{{ homeArea || 'Not set' }}</p>
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

        <div v-if="step < 5" class="footer-bar d-flex justify-content-between align-items-center mt-5 pt-4">
          <button
            type="button"
            class="btn btn-line"
            :class="{ invisible: step === 1 }"
            :disabled="saving"
            data-testid="onboarding-back"
            @click="goBack"
          >
            ← Back
          </button>
          <div class="d-flex align-items-center gap-3">
            <button
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
              class="btn btn-ink"
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()

const stepNames = ['Interests', 'Budget', 'Location', 'Company']

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

const areaGroups = [
  {
    name: 'Central',
    areas: [
      'Bishan',
      'Bugis',
      'Bukit Merah',
      'Bukit Timah',
      'City / Downtown',
      'Geylang',
      'Kallang',
      'Marine Parade',
      'Novena',
      'Orchard',
      'Queenstown',
      'Tanjong Pagar',
      'Toa Payoh',
    ],
  },
  { name: 'East', areas: ['Bedok', 'Changi', 'Pasir Ris', 'Paya Lebar', 'Tampines'] },
  { name: 'North', areas: ['Sembawang', 'Woodlands', 'Yishun'] },
  { name: 'North-East', areas: ['Ang Mo Kio', 'Hougang', 'Punggol', 'Sengkang', 'Serangoon'] },
  {
    name: 'West',
    areas: ['Bukit Batok', 'Bukit Panjang', 'Choa Chu Kang', 'Clementi', 'Jurong East', 'Jurong West'],
  },
]

const companyOptions = ['Friends', 'Family', 'Partner']

const step = ref(1)
const interests = ref([])
const budget = ref('')
const homeArea = ref('')
const company = ref([])

const areaSearch = ref('')
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')

const progressPercent = computed(() => Math.round((step.value / 4) * 100))

const interestHint = computed(() => {
  const count = interests.value.length
  if (count === 0) return 'Pick 3 to continue.'
  if (count < 3) return count + ' picked. Pick ' + (3 - count) + ' more.'
  return count + ' picked. Nice!'
})

const filteredGroups = computed(() => {
  const text = areaSearch.value.trim().toLowerCase()
  const result = []
  for (const group of areaGroups) {
    const matches = group.areas.filter((area) => area.toLowerCase().includes(text))
    if (matches.length > 0) {
      result.push({ name: group.name, areas: matches })
    }
  }
  return result
})

const canNext = computed(() => {
  if (step.value === 1) return interests.value.length >= 3
  if (step.value === 2) return budget.value !== ''
  if (step.value === 3) return homeArea.value !== ''
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

onMounted(async () => {
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      const { data } = await supabase
        .from('profiles')
        .select('interests, budget, home_area, company')
        .eq('id', userData.user.id)
        .single()

      if (data) {
        interests.value = data.interests || []
        budget.value = data.budget || ''
        homeArea.value = data.home_area || ''
        company.value = data.company || []
      }
    }
  } catch (err) {
    console.error('Could not load saved answers:', err)
  } finally {
    loading.value = false
  }
})

function onEnterKey(event) {
  if (event.key !== 'Enter') return
  const tag = event.target.tagName
  if (tag === 'BUTTON' || tag === 'A' || event.target.type === 'text') return
  if (step.value < 5 && canNext.value && !saving.value) goNext()
}

onMounted(() => {
  document.addEventListener('keyup', onEnterKey)
})

onUnmounted(() => {
  document.removeEventListener('keyup', onEnterKey)
})

function goBack() {
  if (step.value > 1) step.value--
}

function goNext() {
  if (!canNext.value) return
  if (step.value < 4) {
    step.value++
  } else {
    saveProfile()
  }
}

function skipStep() {
  if (step.value === 1) interests.value = []
  if (step.value === 2) budget.value = ''
  if (step.value === 3) homeArea.value = ''
  if (step.value === 4) company.value = []

  if (step.value < 4) {
    step.value++
  } else {
    saveProfile()
  }
}

function pickArea(area) {
  homeArea.value = area
}

async function saveProfile() {
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
        interests: interests.value,
        budget: budget.value || null,
        home_area: homeArea.value || null,
        company: company.value,
      })
      .eq('id', userData.user.id)
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('No profile row found for this user')
    }

    step.value = 5
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

@media (prefers-reduced-motion: reduce) {
  .step-enter-active,
  .step-leave-active,
  .step-bar::after {
    transition: none;
  }
}
</style>