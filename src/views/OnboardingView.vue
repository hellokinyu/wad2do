<template>
  <div class="container py-4 py-md-5 sky-theme" data-testid="onboarding-page">
    <!-- Owner: Charmaine -->
    <div class="onboarding-box mx-auto">
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <div v-else class="card onboarding-card rounded-4">
        <div class="card-body p-4 p-md-5">
          <div v-if="step < 5" class="mb-4">
            <div class="d-flex justify-content-between small text-muted mb-2">
              <span data-testid="onboarding-step-label">Step {{ step }} of 4</span>
              <span class="fw-semibold">{{ stepNames[step - 1] }}</span>
            </div>
            <div
              class="progress onboarding-progress"
              role="progressbar"
              aria-label="Onboarding progress"
              :aria-valuenow="progressPercent"
              aria-valuemin="0"
              aria-valuemax="100"
              data-testid="onboarding-progress"
            >
              <div class="progress-bar rounded-pill" :style="{ width: progressPercent + '%' }"></div>
            </div>
          </div>

          <section v-if="step === 1" data-testid="onboarding-step-interests">
            <p class="text-primary fw-semibold small mb-1">Welcome to WAD2Do</p>
            <h1 class="h3 mb-2">What do you love doing?</h1>
            <p class="text-muted mb-4">Pick at least 3 and we'll plan your next hangout.</p>
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
                <label class="btn btn-outline-primary rounded-pill px-3 py-2" :for="'interest-' + slug(item)">
                  {{ item }}
                </label>
              </template>
            </div>
            <p
              class="small mt-3 mb-0"
              :class="interests.length >= 3 ? 'text-success' : 'text-muted'"
              data-testid="interest-count"
            >
              {{ interestHint }}
            </p>
          </section>

          <section v-if="step === 2" data-testid="onboarding-step-budget">
            <h1 class="h3 mb-2">What's your usual hangout budget?</h1>
            <p class="text-muted mb-4">Per person. No judgement.</p>
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
                <label class="btn btn-outline-primary w-100 h-100 text-start p-3 rounded-4" :for="'budget-' + option.id">
                  <span class="d-block fs-5 fw-semibold">{{ option.label }}</span>
                  <span class="d-block small opacity-75">{{ option.hint }}</span>
                </label>
              </div>
            </div>
          </section>

          <section v-if="step === 3" data-testid="onboarding-step-area">
            <h1 class="h3 mb-2">Where do you usually start from?</h1>
            <p class="text-muted mb-4">We'll show hangouts near you first.</p>
            <input
              type="text"
              class="form-control form-control-lg rounded-pill px-4 mb-3"
              placeholder="Search areas, e.g. Tampines"
              v-model="areaSearch"
              data-testid="area-search"
            />
            <p v-if="homeArea" class="mb-2 small">
              Selected:
              <span class="badge rounded-pill text-bg-primary fs-6" data-testid="area-selected">{{ homeArea }}</span>
            </p>
            <div class="list-group area-list rounded-4">
              <button
                v-for="area in filteredAreas"
                :key="area"
                type="button"
                class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                :class="{ active: homeArea === area }"
                :data-testid="'area-option-' + slug(area)"
                @click="pickArea(area)"
              >
                {{ area }}
                <span v-if="homeArea === area" aria-hidden="true">✓</span>
              </button>
              <p v-if="filteredAreas.length === 0" class="text-muted p-3 mb-0">No areas match "{{ areaSearch }}".</p>
            </div>
          </section>

          <section v-if="step === 4" data-testid="onboarding-step-company">
            <h1 class="h3 mb-2">Who do you usually hang out with?</h1>
            <p class="text-muted mb-4">Optional. Pick any!</p>
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
                <label class="btn btn-outline-primary rounded-pill px-4 py-2" :for="'company-' + slug(item)">
                  {{ item }}
                </label>
              </template>
            </div>

            <div v-if="errorMessage" class="alert alert-danger mt-4 mb-0" role="alert" data-testid="onboarding-error">
              <p class="mb-2">{{ errorMessage }}</p>
              <button type="button" class="btn btn-outline-danger btn-sm" @click="saveProfile">Try again</button>
            </div>
          </section>

          <section v-if="step === 5" class="text-center" data-testid="onboarding-step-done">
            <div class="done-icon bg-primary text-white mx-auto mb-3" aria-hidden="true">✓</div>
            <h1 class="h2 mb-2">You're all set!</h1>
            <p class="text-muted mb-4">Here's your hangout profile.</p>

            <ul class="list-group text-start mb-4 rounded-4">
              <li class="list-group-item py-3">
                <p class="small text-muted mb-1">Interests</p>
                <div v-if="interests.length > 0" data-testid="summary-interests">
                  <span
                    v-for="item in interests"
                    :key="item"
                    class="badge rounded-pill text-bg-primary me-1 mb-1"
                  >
                    {{ item }}
                  </span>
                </div>
                <p v-else class="mb-0" data-testid="summary-interests">Not set</p>
              </li>
              <li class="list-group-item py-3">
                <p class="small text-muted mb-1">Budget per hangout</p>
                <p class="mb-0" data-testid="summary-budget">{{ budgetLabel }}</p>
              </li>
              <li class="list-group-item py-3">
                <p class="small text-muted mb-1">Home area</p>
                <p class="mb-0" data-testid="summary-area">{{ homeArea || 'Not set' }}</p>
              </li>
              <li class="list-group-item py-3">
                <p class="small text-muted mb-1">Hangs out with</p>
                <p class="mb-0" data-testid="summary-company">{{ listOrNotSet(company) }}</p>
              </li>
            </ul>

            <button
              type="button"
              class="btn btn-primary btn-lg rounded-pill w-100 mb-2"
              data-testid="onboarding-explore"
              @click="exploreActivities"
            >
              Find my hangouts
            </button>
            <p class="text-muted small mb-0">You can change these anytime in Profile.</p>
          </section>

          <div v-if="step < 5" class="d-flex justify-content-between align-items-center mt-5">
            <button
              type="button"
              class="btn btn-outline-secondary rounded-pill px-3"
              :class="{ invisible: step === 1 }"
              :disabled="saving"
              data-testid="onboarding-back"
              @click="goBack"
            >
              Back
            </button>
            <div class="d-flex align-items-center gap-2">
              <button
                type="button"
                class="btn btn-link text-secondary text-decoration-none"
                :disabled="saving"
                data-testid="onboarding-skip"
                @click="skipStep"
              >
                Skip
              </button>
              <button
                type="button"
                class="btn btn-primary rounded-pill px-4"
                :disabled="!canNext || saving"
                data-testid="onboarding-next"
                @click="goNext"
              >
                <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                {{ step === 4 ? 'Finish' : 'Next' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
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

const filteredAreas = computed(() => {
  const text = areaSearch.value.trim().toLowerCase()
  return areaOptions.filter((area) => area.toLowerCase().includes(text))
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
    errorMessage.value = "Couldn't save your answers. Please check you're logged in and try again."
  } finally {
    saving.value = false
  }
}

function exploreActivities() {
  router.push('/activities')
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

.onboarding-box {
  max-width: 640px;
}

.onboarding-card {
  background: linear-gradient(180deg, var(--sky-soft) 0, var(--bs-body-bg) 120px);
  border: 1px solid var(--sky-line);
  box-shadow: 0 0.25rem 1rem rgba(58, 164, 230, 0.12);
}


.onboarding-progress {
  height: 10px;
  border-radius: 999px;
}

.area-list {
  max-height: 300px;
  overflow-y: auto;
}

.done-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
}
</style>