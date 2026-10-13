<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import ActivityCard from '@/components/ActivityCard.vue'

// Keep the original records so clearing filters can show every activity again.
const activities = ref([])
const loading = ref(true)
const errorMessage = ref('')
const keyword = ref('')
const selectedCategory = ref('')
const selectedSetting = ref('')
const filtersOpen = ref(false)

const categories = computed(() => {
  const values = activities.value.map((activity) => activity.category).filter(Boolean)
  return [...new Set(values)].sort()
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

  return activities.value.filter((activity) => {
    const text = searchText(
      [activity.name, activity.category, activity.area, activity.description].join(' '),
    )

    const matchesSearch = !search || text.includes(search)
    const matchesCategory = !selectedCategory.value || activity.category === selectedCategory.value
    const matchesSetting =
      !selectedSetting.value ||
      (selectedSetting.value === 'indoor' && activity.indoor === true) ||
      (selectedSetting.value === 'outdoor' && activity.indoor === false)

    return matchesSearch && matchesCategory && matchesSetting
  })
})

const hasFilters = computed(() =>
  Boolean(keyword.value.trim() || selectedCategory.value || selectedSetting.value),
)

function clearFilters() {
  keyword.value = ''
  selectedCategory.value = ''
  selectedSetting.value = ''
}

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
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    loading.value = false
  }
}

// Load the records when this page opens.
onMounted(loadActivities)
</script>

<template>
  <div class="container activities-page py-4 py-md-5" data-testid="activities-page">
    <header class="mb-4">
      <h1 class="fw-bold">What are we doing today?</h1>
      <p class="text-secondary mb-0">Discover activities around Singapore.</p>
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
        <div class="col-12 col-md-5">
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
        <div class="col-12 col-md-5">
          <label for="setting-filter" class="form-label">Indoor / outdoor</label>
          <select
            id="setting-filter"
            v-model="selectedSetting"
            class="form-select"
            data-testid="setting-filter"
          >
            <option value="">Indoor and outdoor</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </div>
        <div class="col-12 col-md-2">
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

    <div v-if="loading" class="py-5 text-center" role="status" data-testid="activities-loading">
      <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
      Loading activities…
    </div>

    <div v-else-if="errorMessage" class="alert alert-danger" data-testid="activities-error">
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
      <p class="text-secondary mb-3" role="status" data-testid="activities-count">
        Showing {{ filteredActivities.length }} of {{ activities.length }} activities
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
          v-for="activity in filteredActivities"
          :key="activity.id"
          class="col-12 col-md-6 col-lg-4"
        >
          <ActivityCard :activity="activity" :show-actions="false" :link-to-details="false" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
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
