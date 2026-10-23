<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { supabase } from '@/lib/supabase'
import ActivityCard from '@/components/ActivityCard.vue'
import { getPrice } from '@/lib/activityDisplay'
import { rankActivities } from '@/lib/activityRanking'
import { useAuth } from '@/composables/useAuth'

const { user } = useAuth()
const profile = ref(null)
const profileLoading = ref(true)
const profileError = ref('')

// Keep the original records so clearing filters can show every activity again.
const activities = ref([])
const loading = ref(true)
const errorMessage = ref('')
// Remember the current filters and page when opening a detail page and coming back.
function readFilters() {
  try {
    return JSON.parse(sessionStorage.getItem('wad2do.activityFilters') || '{}') || {}
  } catch {
    return {}
  }
}

const previousFilters = readFilters()
const keyword = ref(String(previousFilters.keyword ?? ''))
const selectedCategory = ref(String(previousFilters.category ?? ''))
const selectedSetting = ref(String(previousFilters.setting ?? ''))
const selectedArea = ref(String(previousFilters.area ?? ''))
const selectedPrice = ref(String(previousFilters.price ?? ''))
const allowedSorts = ['best-match', 'catalogue', 'price-asc', 'price-desc']
const sortBy = ref(
  allowedSorts.includes(previousFilters.sort) ? previousFilters.sort : 'best-match',
)
const filtersOpen = ref(false)
const pageSize = 20
const requestedPage = ref(
  Number.isSafeInteger(previousFilters.page) && previousFilters.page > 0 ? previousFilters.page : 1,
)
const resultsSummary = ref(null)

watch([keyword, selectedCategory, selectedSetting, selectedArea, selectedPrice, sortBy], () => {
  requestedPage.value = 1
})

onBeforeRouteLeave(() => {
  try {
    sessionStorage.setItem(
      'wad2do.activityFilters',
      JSON.stringify({
        keyword: keyword.value,
        category: selectedCategory.value,
        setting: selectedSetting.value,
        area: selectedArea.value,
        price: selectedPrice.value,
        sort: sortBy.value,
        page: currentPage.value,
      }),
    )
  } catch {
    // Browsing still works when browser storage is unavailable.
  }
})

const categories = computed(() => {
  const values = activities.value.map((activity) => activity.category).filter(Boolean)
  return [...new Set(values)].sort()
})

const areas = computed(() => {
  const values = activities.value.map((activity) => activity.area?.trim()).filter(Boolean)
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'en-SG'))
})

const priceRanges = [
  { value: 'free', label: 'Free', min: 0, max: 0 },
  { value: 'under-20', label: 'Under S$20', min: 0, max: 20 },
  { value: '20-50', label: 'S$20 to under S$50', min: 20, max: 50 },
  { value: '50-100', label: 'S$50 to under S$100', min: 50, max: 100 },
  { value: '100-plus', label: 'S$100 and above', min: 100, max: Infinity },
]

const hasRankingPreferences = computed(() =>
  Boolean(
    (Array.isArray(profile.value?.interests) && profile.value.interests.length) ||
    priceRanges.some((range) => range.value !== 'free' && range.value === profile.value?.budget) ||
    profile.value?.home_area?.trim(),
  ),
)

const sortSummary = computed(() => {
  if (sortBy.value === 'best-match' && !hasRankingPreferences.value) {
    return 'Showing catalogue order'
  }
  return {
    'best-match': 'Sorted by Best match',
    catalogue: 'Showing catalogue order',
    'price-asc': 'Sorted by Price: low to high',
    'price-desc': 'Sorted by Price: high to low',
  }[sortBy.value]
})

// Search logic
function searchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const filteredActivities = computed(() => {
  const search = searchText(keyword.value.trim())

  const range = priceRanges.find((option) => option.value === selectedPrice.value)
  const matches = activities.value.filter((activity) => {
    const text = searchText(
      [activity.name, activity.category, activity.area, activity.description].join(' '),
    )

    const matchesSearch = !search || text.includes(search)
    const matchesCategory = !selectedCategory.value || activity.category === selectedCategory.value
    const matchesArea = !selectedArea.value || activity.area?.trim() === selectedArea.value
    const price = getPrice(activity.price_per_person)
    const matchesPrice =
      !range ||
      (price !== null &&
        (range.value === 'free' ? price === 0 : price >= range.min && price < range.max))
    const matchesSetting =
      !selectedSetting.value ||
      (selectedSetting.value === 'indoor' && activity.indoor === true) ||
      (selectedSetting.value === 'outdoor' && activity.indoor === false)

    return matchesSearch && matchesCategory && matchesSetting && matchesArea && matchesPrice
  })

  if (sortBy.value === 'best-match' && profile.value) {
    return rankActivities(matches, profile.value)
  }

  if (sortBy.value === 'price-asc' || sortBy.value === 'price-desc') {
    matches.sort((a, b) => {
      const first = getPrice(a.price_per_person)
      const second = getPrice(b.price_per_person)
      if (first === null && second === null) return 0
      if (first === null) return 1
      if (second === null) return -1
      return sortBy.value === 'price-asc' ? first - second : second - first
    })
  }

  return matches
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredActivities.value.length / pageSize)))
const currentPage = computed(() => Math.min(requestedPage.value, pageCount.value))
const pageStart = computed(() => (currentPage.value - 1) * pageSize)
const pagedActivities = computed(() =>
  filteredActivities.value.slice(pageStart.value, pageStart.value + pageSize),
)
const visiblePages = computed(() => {
  const start = Math.max(1, Math.min(currentPage.value - 2, pageCount.value - 4))
  return Array.from({ length: Math.min(5, pageCount.value) }, (_, index) => start + index)
})

async function changePage(page) {
  requestedPage.value = page
  await nextTick()
  resultsSummary.value?.focus()
  resultsSummary.value?.scrollIntoView({ block: 'start' })
}

const hasFilters = computed(() =>
  Boolean(
    keyword.value.trim() ||
    selectedCategory.value ||
    selectedSetting.value ||
    selectedArea.value ||
    selectedPrice.value ||
    sortBy.value !== 'best-match',
  ),
)

function clearFilters() {
  keyword.value = ''
  selectedCategory.value = ''
  selectedSetting.value = ''
  selectedArea.value = ''
  selectedPrice.value = ''
  sortBy.value = 'best-match'
}

async function loadProfile() {
  const userId = user.value?.id
  profile.value = null
  profileError.value = ''
  profileLoading.value = true

  try {
    if (!userId) return
    const { data, error } = await supabase
      .from('profiles')
      .select('interests, budget, home_area')
      .eq('id', userId)
      .maybeSingle()

    if (user.value?.id !== userId) return
    if (error) throw error
    profile.value = data
  } catch {
    if (user.value?.id === userId) {
      profileError.value = "Couldn't load your preferences. Best match is using catalogue order."
    }
  } finally {
    if (user.value?.id === userId) profileLoading.value = false
  }
}

watch(() => user.value?.id, loadProfile, { immediate: true })

async function loadActivities() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Load the small catalogue in batches so search includes records after the first 20.
    const batchSize = 200
    const records = []
    let start = 0

    while (true) {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('id')
        .range(start, start + batchSize - 1)

      if (error) throw error

      const batch = data ?? []
      records.push(...batch)

      if (batch.length < batchSize) break
      start += batchSize
    }

    activities.value = records
  } catch {
    errorMessage.value = "Couldn't load activities. Please try again."
  } finally {
    loading.value = false
  }
}

// Load the records when this page opens.
onMounted(loadActivities)
</script>

<template>
  <div class="container activities-page py-4 py-md-5" data-testid="activities-page">
    <header
      class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4"
    >
      <div>
        <h1 class="fw-bold">What are we doing today?</h1>
        <p class="text-secondary mb-0">Discover activities around Singapore.</p>
      </div>
      <RouterLink
        to="/activities/submit"
        class="btn btn-outline-dark rounded-pill px-4"
        data-testid="submit-activity-button"
      >
        + Submit an activity
      </RouterLink>
    </header>

    <div class="search-bar d-flex gap-2 mb-3">
      <div class="flex-grow-1">
        <label for="activity-search" class="visually-hidden">Search activities</label>
        <input
          id="activity-search"
          v-model="keyword"
          type="search"
          class="form-control"
          placeholder="Search activities, categories or areas"
          data-testid="activity-search"
        />
      </div>
      <button
        type="button"
        class="btn btn-outline-dark d-md-none"
        :aria-expanded="filtersOpen"
        aria-controls="activity-filters"
        data-testid="filters-toggle"
        @click="filtersOpen = !filtersOpen"
      >
        Filters
      </button>
    </div>

    <div class="category-chips mb-4" role="group" aria-label="Quick category filters">
      <button
        type="button"
        class="category-chip"
        :class="{ active: selectedCategory === '' }"
        :aria-pressed="selectedCategory === ''"
        data-testid="category-chip-all"
        @click="selectedCategory = ''"
      >
        All activities
      </button>

      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="category-chip"
        :class="{ active: selectedCategory === category }"
        :aria-pressed="selectedCategory === category"
        data-testid="category-chip"
        @click="selectedCategory = category"
      >
        {{ category }}
      </button>
    </div>

    <section
      id="activity-filters"
      class="filters-panel mb-4"
      :class="{ 'is-open': filtersOpen }"
      aria-label="Activity filters"
    >
      <div class="row g-3 align-items-end">
        <div class="col-12 col-md-4">
          <label for="category-filter" class="form-label">Category</label>
          <select
            id="category-filter"
            v-model="selectedCategory"
            class="form-select"
            data-testid="category-filter"
          >
            <option value="">All categories</option>
            <option v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </div>
        <div class="col-12 col-md-4">
          <label for="area-filter" class="form-label">Area</label>
          <select
            id="area-filter"
            v-model="selectedArea"
            class="form-select"
            data-testid="area-filter"
          >
            <option value="">All areas</option>
            <option v-for="area in areas" :key="area" :value="area">{{ area }}</option>
          </select>
        </div>
        <div class="col-12 col-md-4">
          <label for="price-filter" class="form-label">Price per person</label>
          <select
            id="price-filter"
            v-model="selectedPrice"
            class="form-select"
            data-testid="price-filter"
          >
            <option value="">All prices</option>
            <option v-for="range in priceRanges" :key="range.value" :value="range.value">
              {{ range.label }}
            </option>
          </select>
        </div>
        <div class="col-12 col-md-4">
          <label for="setting-filter" class="form-label">Indoor / outdoor</label>
          <select
            id="setting-filter"
            v-model="selectedSetting"
            class="form-select"
            data-testid="setting-filter"
          >
            <option value="">All</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </div>
        <div class="col-12 col-md-4">
          <label for="sort-filter" class="form-label">Sort by</label>
          <select id="sort-filter" v-model="sortBy" class="form-select" data-testid="sort-filter">
            <option value="best-match">Best match</option>
            <option value="catalogue">Catalogue order</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
        <div class="col-12 col-md-4">
          <button
            type="button"
            class="btn btn-outline-secondary w-100"
            :disabled="!hasFilters"
            data-testid="clear-filters"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </div>
    </section>

    <div
      v-if="profileError"
      class="alert alert-warning"
      role="alert"
      data-testid="preferences-error"
    >
      <p>{{ profileError }}</p>
      <button
        type="button"
        class="btn btn-outline-dark"
        data-testid="preferences-retry"
        :disabled="profileLoading"
        @click="loadProfile"
      >
        Try again
      </button>
    </div>

    <div
      v-if="loading || (sortBy === 'best-match' && profileLoading)"
      class="py-5 text-center"
      role="status"
      data-testid="activities-loading"
    >
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Loading activities…
    </div>

    <div
      v-else-if="errorMessage"
      class="alert alert-danger"
      role="alert"
      data-testid="activities-error"
    >
      <p>{{ errorMessage }}</p>
      <button
        type="button"
        class="btn btn-outline-danger"
        data-testid="activities-retry"
        @click="loadActivities"
      >
        Try again
      </button>
    </div>

    <p v-else-if="activities.length === 0" data-testid="activities-empty">
      No activities available yet.
    </p>

    <template v-else>
      <div class="mb-3" role="status" data-testid="activities-sort-summary">
        <p class="fw-semibold mb-0">{{ sortSummary }}</p>
        <p
          v-if="sortBy === 'best-match' && hasRankingPreferences"
          class="text-secondary small mb-0"
          data-testid="activities-sort-description"
        >
          Based on your saved interests, budget and home area.
        </p>
      </div>
      <p
        ref="resultsSummary"
        class="text-secondary mb-3"
        role="status"
        tabindex="-1"
        data-testid="activities-count"
      >
        Showing {{ filteredActivities.length ? pageStart + 1 : 0 }}–{{
          pageStart + pagedActivities.length
        }}
        of {{ filteredActivities.length }} activities
      </p>

      <div
        v-if="filteredActivities.length === 0"
        class="empty-results text-center p-4 p-md-5"
        data-testid="activities-no-results"
      >
        <h2 class="h5">No activities match these filters</h2>
        <p class="text-secondary">Try another search or clear your filters.</p>
        <button
          type="button"
          class="btn btn-dark rounded-pill"
          data-testid="empty-clear-filters"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>

      <div v-else class="row g-4" data-testid="activities-grid">
        <div
          v-for="activity in pagedActivities"
          :key="activity.id"
          class="col-12 col-md-6 col-lg-4"
        >
          <ActivityCard :activity="activity" :show-actions="false" />
        </div>
      </div>

      <nav
        v-if="pageCount > 1"
        class="mt-4"
        aria-label="Activity pages"
        data-testid="activities-pagination"
      >
        <ul class="pagination justify-content-center flex-wrap gap-1 mb-0">
          <li class="page-item">
            <button
              type="button"
              class="page-link text-dark"
              :disabled="currentPage === 1"
              @click="changePage(currentPage - 1)"
            >
              Previous
            </button>
          </li>
          <li v-for="page in visiblePages" :key="page" class="page-item">
            <button
              type="button"
              class="page-link"
              :class="page === currentPage ? 'bg-dark border-dark text-white' : 'text-dark'"
              :aria-label="`Page ${page}`"
              :aria-current="page === currentPage ? 'page' : undefined"
              @click="changePage(page)"
            >
              {{ page }}
            </button>
          </li>
          <li class="page-item">
            <button
              type="button"
              class="page-link text-dark"
              :disabled="currentPage === pageCount"
              @click="changePage(currentPage + 1)"
            >
              Next
            </button>
          </li>
        </ul>
        <p class="text-center text-secondary small mt-2 mb-0">
          Page {{ currentPage }} of {{ pageCount }}
        </p>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.page-link:disabled {
  opacity: 0.45;
}

.search-bar .form-control {
  min-height: 48px;
  border-radius: 12px;
}

.category-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px;
}

.category-chip {
  flex-shrink: 0;
  padding: 7px 16px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: white;
  color: #111;
  font-size: 0.875rem;
  transition: background-color 0.2s ease;
}

.category-chip:hover {
  background: #f3f3f3;
}

.category-chip.active {
  background: #111;
  border-color: #111;
  color: white;
}

.category-chip:focus-visible {
  outline: 2px solid #111;
  outline-offset: 2px;
}

.filters-panel,
.empty-results {
  border: 1px solid #e5e5e5;
  border-radius: 16px;
  background: #fafafa;
}

.filters-panel {
  padding: 20px;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
}

@media (max-width: 767.98px) {
  .filters-panel:not(.is-open) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .category-chip {
    transition: none;
  }
}
</style>
