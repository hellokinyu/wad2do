<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { supabase } from '@/lib/supabase'
import ActivityCard from '@/components/ActivityCard.vue'
import ActivityShareDialog from '@/components/ActivityShareDialog.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { getPrice } from '@/lib/activityDisplay'
import { rankActivities } from '@/lib/activityRanking'
import { useAuth } from '@/composables/useAuth'
import { setActivitySaved } from '@/lib/activityFavourites'
import { beginActivitiesRender } from '@/lib/activityScroll'

const { user } = useAuth()
const profile = ref(null)
const profileLoading = ref(true)
const profileError = ref('')
const savedIds = ref(new Set())
const savingIds = ref(new Set())
const favouritesLoading = ref(true)
const favouritesError = ref('')
const saveError = ref('')
const saveMessage = ref('')
let favouritesRequest = 0
let saveMessageTimer
const shareTarget = ref(null)

function announce(text) {
  saveError.value = ''
  saveMessage.value = text
  clearTimeout(saveMessageTimer)
  saveMessageTimer = setTimeout(() => {
    saveMessage.value = ''
  }, 3000)
}

function openShare(activityId) {
  shareTarget.value = activities.value.find((activity) => activity.id === activityId) ?? null
}

async function loadFavourites() {
  const userId = user.value?.id
  const request = ++favouritesRequest
  savedIds.value = new Set()
  savingIds.value = new Set()
  favouritesLoading.value = true
  favouritesError.value = ''
  saveError.value = ''
  saveMessage.value = ''
  clearTimeout(saveMessageTimer)

  try {
    if (!userId) return
    const { data, error } = await supabase
      .from('favourites')
      .select('activity_id')
      .eq('user_id', userId)

    if (error) throw error
    if (request === favouritesRequest) {
      savedIds.value = new Set((data ?? []).map((row) => row.activity_id))
    }
  } catch {
    if (request === favouritesRequest) {
      favouritesError.value = "Couldn't load your saved activities. Try again to enable saving."
    }
  } finally {
    if (request === favouritesRequest) favouritesLoading.value = false
  }
}

watch(() => user.value?.id, loadFavourites, { immediate: true })

async function toggleSaved(activityId) {
  if (favouritesLoading.value || favouritesError.value || savingIds.value.has(activityId)) return
  const userId = user.value?.id
  const request = favouritesRequest
  const shouldSave = !savedIds.value.has(activityId)
  savingIds.value.add(activityId)
  saveError.value = ''
  saveMessage.value = ''
  clearTimeout(saveMessageTimer)

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!userId || data.user?.id !== userId) throw new Error('Your login has changed')
    const isSaved = await setActivitySaved(userId, activityId, shouldSave)
    if (request !== favouritesRequest) return

    if (isSaved) savedIds.value.add(activityId)
    else savedIds.value.delete(activityId)
    announce(isSaved ? 'Activity saved.' : 'Removed from saved activities.')
  } catch {
    if (request === favouritesRequest) {
      saveError.value = "Couldn't update your saved activities. Please try again."
    }
  } finally {
    if (request === favouritesRequest) savingIds.value.delete(activityId)
  }
}

onUnmounted(() => {
  favouritesRequest += 1
  clearTimeout(saveMessageTimer)
})

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
const sortOptions = [
  { value: 'best-match', label: 'Best match' },
  { value: 'catalogue', label: 'Catalogue order' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]
const allowedSorts = sortOptions.map((option) => option.value)
const sortBy = ref(
  allowedSorts.includes(previousFilters.sort) ? previousFilters.sort : 'best-match',
)
const pageSize = 20
const requestedPage = ref(
  Number.isSafeInteger(previousFilters.page) && previousFilters.page > 0 ? previousFilters.page : 1,
)
const resultsSummary = ref(null)
const filtersPanel = ref(null)
const showFilters = ref(false)
const stickyControls = ref(null)
const filtersTrigger = ref(null)

// Category chip strip: one scrolling row. chipsBefore/chipsAfter say whether there are more chips
// off either edge, which turns on that side's fade and arrow.
const chipStrip = ref(null)
const chipsBefore = ref(false)
const chipsAfter = ref(false)
let chipResize

function updateChipEdges() {
  const strip = chipStrip.value
  if (!strip) return
  chipsBefore.value = strip.scrollLeft > 4
  chipsAfter.value = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4
}

function scrollChips(direction) {
  const strip = chipStrip.value
  if (!strip) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  strip.scrollBy({
    left: direction * strip.clientWidth * 0.8,
    behavior: reduceMotion ? 'auto' : 'smooth',
  })
}

onMounted(() => {
  chipResize = new ResizeObserver(updateChipEdges)
  if (chipStrip.value) chipResize.observe(chipStrip.value)
})
onUnmounted(() => chipResize?.disconnect())

const finishScrollRender = beginActivitiesRender()
watch([loading, profileLoading, sortBy], async ([loading, profileLoading, sort]) => {
  if (loading || (sort === 'best-match' && profileLoading)) return
  await nextTick()
  finishScrollRender()
})
onUnmounted(finishScrollRender)

// Safari doesn't focus buttons on click; focus it so BaseDialog can hand focus back on close
function openFilters(event) {
  event.currentTarget.focus({ preventScroll: true })
  showFilters.value = true
}

function closeFilters() {
  showFilters.value = false
}

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

// New chips arrive with the activities, so recheck which edges have more to scroll to
watch(categories, async () => {
  await nextTick()
  updateChipEdges()
})

// Picking a category here or in the filter panel brings its chip into view
watch(selectedCategory, async () => {
  await nextTick()
  chipStrip.value
    ?.querySelector('.category-chip.active')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  updateChipEdges()
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
  resultsSummary.value?.focus({ preventScroll: true })
  if (resultsSummary.value && stickyControls.value) {
    const controls = stickyControls.value
    const navbarHeight = parseFloat(getComputedStyle(controls).top) || 0
    resultsSummary.value.style.scrollMarginTop = `${navbarHeight + controls.getBoundingClientRect().height + 16}px`
  }
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
  if (showFilters.value) filtersPanel.value?.focusClose()
  else filtersTrigger.value?.focus({ preventScroll: true })
}

const activeFilters = computed(() =>
  [
    { key: 'category', label: selectedCategory.value, value: selectedCategory },
    { key: 'area', label: selectedArea.value, value: selectedArea },
    {
      key: 'price',
      label: priceRanges.find((range) => range.value === selectedPrice.value)?.label,
      value: selectedPrice,
    },
    {
      key: 'setting',
      label:
        selectedSetting.value === 'indoor'
          ? 'Indoor'
          : selectedSetting.value === 'outdoor'
            ? 'Outdoor'
            : '',
      value: selectedSetting,
    },
  ].filter((filter) => filter.label),
)

function removeFilter(filter) {
  filter.value.value = ''
  filtersTrigger.value?.focus({ preventScroll: true })
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
    <header class="page-header">
      <div>
        <h1 class="page-title">What are we doing today?</h1>
        <p class="text-secondary mb-0">Discover activities around Singapore.</p>
      </div>
      <RouterLink
        to="/activities/submit"
        class="btn btn-outline-dark rounded-pill submit-link"
        data-testid="submit-activity-button"
      >
        <svg viewBox="0 0 24 24" class="submit-icon" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Submit an activity
      </RouterLink>
    </header>

    <section
      ref="stickyControls"
      class="activity-controls mb-3"
      aria-label="Activity search and filters"
      data-testid="activity-controls"
    >
      <div class="search-bar">
        <div class="search-field">
          <label for="activity-search" class="visually-hidden">Search activities</label>
          <svg viewBox="0 0 24 24" class="search-icon" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
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
          ref="filtersTrigger"
          class="filters-toggle"
          :class="{ 'has-active-filters': activeFilters.length > 0 }"
          :aria-label="
            activeFilters.length ? `Filters (${activeFilters.length} active)` : 'Filters'
          "
          title="Filter activities"
          aria-haspopup="dialog"
          aria-controls="activity-filters"
          data-testid="filters-toggle"
          @click="openFilters"
        >
          <svg
            class="filters-icon"
            viewBox="0 0 28 28"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M4 6h20M4 14h20M4 22h20" />
            <circle class="filter-knob filter-knob-top" cx="9" cy="6" r="3" />
            <circle class="filter-knob filter-knob-middle" cx="20" cy="14" r="3" />
            <circle class="filter-knob filter-knob-bottom" cx="11" cy="22" r="3" />
          </svg>
          <span class="filters-label" aria-hidden="true">Filters</span>
          <span v-if="activeFilters.length" class="filters-count" aria-hidden="true">{{
            activeFilters.length
          }}</span>
        </button>
      </div>

      <div class="browse-controls">
        <!-- The fades and arrows only appear on a side that has more chips to scroll to -->
        <div class="chip-strip" :class="{ 'has-before': chipsBefore, 'has-after': chipsAfter }">
          <div
            ref="chipStrip"
            class="category-chips"
            role="group"
            aria-label="Quick category filters"
            @scroll.passive="updateChipEdges"
          >
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
          <!-- Mouse shortcuts only: keyboard users Tab through the chips, which scroll into view -->
          <button
            v-show="chipsBefore"
            type="button"
            class="chip-arrow chip-arrow-before"
            tabindex="-1"
            aria-hidden="true"
            @click="scrollChips(-1)"
          >
            <svg viewBox="0 0 24 24" focusable="false"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button
            v-show="chipsAfter"
            type="button"
            class="chip-arrow chip-arrow-after"
            tabindex="-1"
            aria-hidden="true"
            @click="scrollChips(1)"
          >
            <svg viewBox="0 0 24 24" focusable="false"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        <div class="sort-control">
          <label for="sort-filter" class="sort-label">Sort by</label>
          <select id="sort-filter" v-model="sortBy" class="form-select" data-testid="sort-filter">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <div
        v-if="activeFilters.length"
        class="applied-filters"
        role="group"
        aria-label="Applied filters"
      >
        <button
          v-for="filter in activeFilters"
          :key="filter.key"
          type="button"
          class="applied-filter"
          :aria-label="`Remove ${filter.label} filter`"
          data-testid="active-filter"
          @click="removeFilter(filter)"
        >
          {{ filter.label }}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <button
          type="button"
          class="clear-all"
          data-testid="clear-all-filters"
          @click="clearFilters"
        >
          Clear all
        </button>
      </div>
    </section>

    <BaseDialog
      id="activity-filters"
      ref="filtersPanel"
      v-model:open="showFilters"
      class="filters-panel"
      title="Filter activities"
      close-label="Close filters"
    >
      <div class="row g-3">
        <div class="col-12 col-sm-6">
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
        <div class="col-12 col-sm-6">
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
        <div class="col-12 col-sm-6">
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
        <div class="col-12 col-sm-6">
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
        <div class="col-12 mobile-sort-control">
          <label for="mobile-sort-filter" class="form-label">Sort by</label>
          <select
            id="mobile-sort-filter"
            v-model="sortBy"
            class="form-select"
            data-testid="mobile-sort-filter"
          >
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
      <template #footer>
        <button
          type="button"
          class="btn btn-outline-secondary"
          :disabled="!hasFilters"
          data-testid="clear-filters"
          @click="clearFilters"
        >
          Clear filters
        </button>
        <button
          type="button"
          class="btn btn-dark flex-grow-1"
          data-testid="filter-confirm"
          @click="closeFilters"
        >
          Show {{ filteredActivities.length }} activities
        </button>
      </template>
    </BaseDialog>

    <div
      v-if="favouritesError"
      class="alert alert-warning"
      role="alert"
      data-testid="favourites-error"
    >
      <p>{{ favouritesError }}</p>
      <button
        type="button"
        class="btn btn-outline-dark"
        :disabled="favouritesLoading"
        data-testid="favourites-retry"
        @click="loadFavourites"
      >
        Try again
      </button>
    </div>

    <div
      v-if="saveError || saveMessage"
      class="save-feedback alert mb-0"
      :class="saveError ? 'alert-danger' : 'alert-success'"
      :role="saveError ? 'alert' : 'status'"
      data-testid="activity-save-feedback"
    >
      {{ saveError || saveMessage }}
    </div>

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
      <div class="activities-sort-info" :class="{ 'mb-3': sortBy === 'best-match' }">
        <p
          :class="
            sortBy === 'best-match' && !hasRankingPreferences
              ? 'text-secondary small mb-0'
              : 'visually-hidden'
          "
          role="status"
          data-testid="activities-sort-summary"
        >
          {{ sortSummary }}
        </p>
        <p
          v-if="sortBy === 'best-match' && hasRankingPreferences"
          class="text-secondary small mb-0"
          data-testid="activities-sort-description"
        >
          Based on your saved interests, budget and home area.
        </p>
      </div>
      <p
        id="activities-results-summary"
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
          <ActivityCard
            :activity="activity"
            :saved="savedIds.has(activity.id)"
            :saving="savingIds.has(activity.id)"
            :save-disabled="favouritesLoading || Boolean(favouritesError)"
            @save="toggleSaved"
            @share="openShare"
          />
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
              class="page-link text-body"
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
              :class="page === currentPage ? 'page-current' : 'text-body'"
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
              class="page-link text-body"
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
    <ActivityShareDialog :activity="shareTarget" @close="shareTarget = null" @shared="announce" />
  </div>
</template>

<style scoped>
.save-feedback {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  max-width: calc(100% - 2rem);
  overflow-wrap: anywhere;
  z-index: 1080;
}

.page-link:disabled {
  opacity: 0.45;
}

.page-link.page-current {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}

/* ---------- Page header ---------- */
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 24px;
  margin-bottom: 24px;
}

.page-title {
  margin-bottom: 6px;
  font-size: clamp(1.9rem, 1.3rem + 2.2vw, 2.75rem);
  font-weight: 800;
  line-height: 1.05;
  text-wrap: balance;
}

.submit-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-inline: 16px 20px;
}

.submit-icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

/* ---------- Sticky search and filters ---------- */
.activity-controls {
  position: sticky;
  top: var(--navbar-height, 0px);
  z-index: 1010;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(45dvh, calc(100dvh - var(--navbar-height, 0px) - 64px));
  overflow-y: auto;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
  /* Same colour as the page, so the bar only shows its edge while cards scroll under it */
  background: var(--bg);
}

/* Search box and Filters button are one pair: same height, same pill shape, same border */
.search-bar {
  display: flex;
  gap: 10px;
}

.search-field {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-icon {
  position: absolute;
  top: 50%;
  left: 18px;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: var(--muted);
  stroke-width: 2;
  stroke-linecap: round;
  transform: translateY(-50%);
  pointer-events: none;
}

.search-field .form-control {
  min-height: 48px;
  padding-inline: 48px 18px;
  border-radius: var(--radius-pill);
}

.search-field .form-control:hover:not(:focus) {
  border-color: var(--line-strong);
}

.filters-toggle {
  --filter-knob-fill: var(--surface);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  height: 48px;
  min-width: 48px;
  padding: 0 18px 0 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.filters-toggle:hover {
  --filter-knob-fill: var(--surface-2);
  border-color: var(--line-strong);
  background: var(--surface-2);
}

/* With filters on, the button fills with ink like any selected control */
.filters-toggle.has-active-filters {
  --filter-knob-fill: var(--ink);
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}

.filters-toggle.has-active-filters:hover {
  --filter-knob-fill: var(--ink-hover);
  border-color: var(--ink-hover);
  background: var(--ink-hover);
}

.filters-icon {
  flex-shrink: 0;
  pointer-events: none;
}

.filters-count {
  display: inline-grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--on-ink);
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* The slider knobs slide across on hover: the button's one bit of play */
.filter-knob {
  fill: var(--filter-knob-fill);
  transition:
    transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2),
    fill 180ms ease;
}
.filters-toggle:is(:hover, :focus-visible) .filter-knob-top {
  transform: translateX(9px);
}
.filters-toggle:is(:hover, :focus-visible) .filter-knob-middle {
  transform: translateX(-11px);
  transition-delay: 70ms, 0ms;
}
.filters-toggle:is(:hover, :focus-visible) .filter-knob-bottom {
  transform: translateX(8px);
  transition-delay: 140ms, 0ms;
}

/* ---------- Category chips and sort ---------- */
.browse-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.chip-strip {
  position: relative;
  flex: 1;
  min-width: 0;
}

/* One row that scrolls sideways. No scrollbar: a fade on the edge with more chips says there's
   more, and the arrows (mouse only) or a swipe get there. */
.category-chips {
  --fade-before: 0px;
  --fade-after: 0px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 5px 4px; /* room for the 2px focus ring and its 2px gap */
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--fade-before),
    black calc(100% - var(--fade-after)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--fade-before),
    black calc(100% - var(--fade-after)),
    transparent 100%
  );
}

.category-chips::-webkit-scrollbar {
  display: none;
}

.has-before .category-chips {
  --fade-before: 56px;
}

.has-after .category-chips {
  --fade-after: 56px;
}

.category-chip {
  flex-shrink: 0;
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--ink);
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.category-chip:hover {
  border-color: var(--line-strong);
  background: var(--surface-2);
}

.category-chip.active {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}

/* Arrows only show for a mouse; v-show hides the one on a side with nothing more */
.chip-arrow {
  position: absolute;
  top: 50%;
  z-index: 1;
  display: none;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
  transform: translateY(-50%);
}

.chip-arrow:hover {
  background: var(--surface-2);
}

.chip-arrow-before {
  left: 0;
}

.chip-arrow-after {
  right: 0;
}

.chip-arrow svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (hover: hover) and (pointer: fine) {
  .chip-arrow {
    display: grid;
  }
}

.sort-control {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.sort-label {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
}

.sort-control .form-select {
  width: auto;
  min-height: 38px;
  padding: 0 40px 0 16px;
  border-radius: var(--radius-pill);
  background-position: right 14px center;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.sort-control .form-select:hover:not(:focus) {
  border-color: var(--line-strong);
}

.mobile-sort-control {
  display: none;
}

/* ---------- Applied filters ---------- */
.applied-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.applied-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px 0 14px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--ink);
  font-size: 0.8125rem;
  font-weight: 600;
}

.applied-filter:hover {
  background: var(--surface-3);
}

.applied-filter svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--muted);
  stroke-width: 2.4;
  stroke-linecap: round;
}

.clear-all {
  padding: 4px 6px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.clear-all:hover {
  color: var(--ink);
}

/* ---------- Everything else on the page ---------- */
.empty-results {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

/* BaseDialog does the layout; this only sets the width */
.filters-panel {
  --dialog-width: 620px;
}

#activities-results-summary {
  scroll-margin-top: calc(var(--navbar-height, 0px) + 16px);
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
}

@media (max-width: 767.98px) {
  /* Keep result announcements and pagination's focus target without taking space. */
  .activities-sort-info,
  #activities-results-summary {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px !important;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .save-feedback {
    left: 1rem;
    text-align: center;
  }

  .page-header {
    margin-bottom: 16px;
  }

  /* Icon-only round Filters button; the count sits on its corner */
  .filters-toggle {
    width: 48px;
    padding: 0;
    border-radius: 50%;
  }
  .filters-label {
    display: none;
  }
  .filters-count {
    position: absolute;
    top: -4px;
    right: -4px;
    box-shadow: 0 0 0 2px var(--bg);
  }

  /* Chips run edge to edge on a phone, so a swipe starts from the screen edge */
  .chip-strip {
    margin-inline: calc(var(--bs-gutter-x, 1.5rem) * -0.5);
  }
  .category-chips {
    padding-inline: calc(var(--bs-gutter-x, 1.5rem) * 0.5);
    scroll-padding-inline: calc(var(--bs-gutter-x, 1.5rem) * 0.5);
  }

  .sort-control {
    display: none;
  }
  .mobile-sort-control {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .category-chip,
  .filters-toggle,
  .filter-knob {
    transition: none;
  }
  .filters-toggle:is(:hover, :focus-visible) .filter-knob {
    transform: none;
    transition-delay: 0s;
  }
}
</style>
