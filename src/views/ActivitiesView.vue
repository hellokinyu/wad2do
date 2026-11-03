<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import ActivityCard from '@/components/ActivityCard.vue'
import ActivityShareDialog from '@/components/ActivityShareDialog.vue'
import BaseDialog from '@/components/BaseDialog.vue'
import { getPrice } from '@/lib/activityDisplay'
import { rankActivities, matchReasons } from '@/lib/activityRanking'
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
// Groups from the last share, so the message can link straight to voting
const sharedGroups = ref([])
let favouritesRequest = 0
let saveMessageTimer
const shareTarget = ref(null)

// Routine messages fade after a few seconds. A share message stays until it's closed,
// because it has links to follow.
function announce(text, groups = []) {
  saveError.value = ''
  saveMessage.value = text
  sharedGroups.value = groups
  clearTimeout(saveMessageTimer)
  if (!groups.length) saveMessageTimer = setTimeout(dismissMessage, 4000)
}

function dismissMessage() {
  clearTimeout(saveMessageTimer)
  saveError.value = ''
  saveMessage.value = ''
  sharedGroups.value = []
}

// The close button disappears with the message, so put keyboard focus on the results instead
function closeMessage() {
  dismissMessage()
  const target = resultsSummary.value ?? document.getElementById('activity-search')
  target?.focus({ preventScroll: true })
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
  dismissMessage()

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
  dismissMessage()

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!userId || data.user?.id !== userId) throw new Error('Your login has changed')
    const isSaved = await setActivitySaved(userId, activityId, shouldSave)
    if (request !== favouritesRequest) return

    if (isSaved) savedIds.value.add(activityId)
    else savedIds.value.delete(activityId)
    announce(isSaved ? 'Saved to your Profile.' : 'Removed from saved activities.')
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
// Remember the current filters and page, so coming back from a detail page or a reload keeps them.
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
  { value: 'name', label: 'Name: A to Z' },
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
const filterConfirm = ref(null)
const showFilters = ref(false)
const searchRow = ref(null)
const browseRow = ref(null)
const appliedFilters = ref(null)
const filtersTrigger = ref(null)

// Phones use the navbar's submit shortcut and a compact filter layout.
const phoneQuery = window.matchMedia('(max-width: 767.98px)')
const isPhone = ref(phoneQuery.matches)
function updatePhone(event) {
  isPhone.value = event.matches
}
phoneQuery.addEventListener('change', updatePhone)
onUnmounted(() => phoneQuery.removeEventListener('change', updatePhone))

// The search row is the same colour as the page, so it only shows its bottom edge once it's
// stuck under the navbar and cards are scrolling beneath it.
const searchStuck = ref(false)
let stuckFrame = 0

function checkStuck() {
  stuckFrame = 0
  const row = searchRow.value
  if (!row) return
  const top = parseFloat(getComputedStyle(row).top) || 0
  searchStuck.value = window.scrollY > 0 && row.getBoundingClientRect().top <= top + 0.5
}

function queueStuckCheck() {
  if (!stuckFrame) stuckFrame = requestAnimationFrame(checkStuck)
}

onMounted(() => {
  window.addEventListener('scroll', queueStuckCheck, { passive: true })
  window.addEventListener('resize', queueStuckCheck)
  checkStuck()
})
onUnmounted(() => {
  window.removeEventListener('scroll', queueStuckCheck)
  window.removeEventListener('resize', queueStuckCheck)
  cancelAnimationFrame(stuckFrame)
})

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

const categories = computed(() => {
  const values = activities.value.map((activity) => activity.category).filter(Boolean)
  return [...new Set(values)].sort()
})

// New chips arrive with the activities, so recheck which edges have more to scroll to
watch(categories, async () => {
  await nextTick()
  updateChipEdges()
})

// Picking a category brings its chip into view
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
const settingLabels = { indoor: 'Indoor', outdoor: 'Outdoor' }

const hasRankingPreferences = computed(() =>
  Boolean(
    (Array.isArray(profile.value?.interests) && profile.value.interests.length) ||
    priceRanges.some((range) => range.value !== 'free' && range.value === profile.value?.budget) ||
    profile.value?.home_area?.trim(),
  ),
)
// Best match is only a real ranking when there are saved preferences to rank by
const ranked = computed(() => sortBy.value === 'best-match' && hasRankingPreferences.value)

const sortSummary = computed(() => {
  if (sortBy.value === 'best-match' && !hasRankingPreferences.value) {
    return 'Not ranked for you yet.'
  }
  const option = sortOptions.find((option) => option.value === sortBy.value)
  return 'Sorted by ' + option.label
})

// Search logic
function searchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const currentFilters = computed(() => ({
  keyword: keyword.value,
  category: selectedCategory.value,
  area: selectedArea.value,
  price: selectedPrice.value,
  setting: selectedSetting.value,
}))

function matchesFilters(activity, filters) {
  const search = searchText(filters.keyword.trim())
  const text = searchText(
    [activity.name, activity.category, activity.area, activity.description].join(' '),
  )
  const range = priceRanges.find((option) => option.value === filters.price)
  const price = getPrice(activity.price_per_person)

  const matchesSearch = !search || text.includes(search)
  const matchesCategory = !filters.category || activity.category === filters.category
  const matchesArea = !filters.area || activity.area?.trim() === filters.area
  const matchesPrice =
    !range ||
    (price !== null &&
      (range.value === 'free' ? price === 0 : price >= range.min && price < range.max))
  const matchesSetting =
    !filters.setting ||
    (filters.setting === 'indoor' && activity.indoor === true) ||
    (filters.setting === 'outdoor' && activity.indoor === false)

  return matchesSearch && matchesCategory && matchesSetting && matchesArea && matchesPrice
}

const filteredActivities = computed(() => {
  const matches = activities.value.filter((activity) =>
    matchesFilters(activity, currentFilters.value),
  )

  if (sortBy.value === 'best-match' && profile.value) {
    return rankActivities(matches, profile.value)
  }

  if (sortBy.value === 'name') {
    matches.sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), 'en-SG', { sensitivity: 'base' }),
    )
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

function activityCount(count) {
  return `${count} ${count === 1 ? 'activity' : 'activities'}`
}

// With no matches, offer the single changes that would bring results back, most results first.
const narrowings = computed(() => {
  const price = priceRanges.find((range) => range.value === selectedPrice.value)
  return [
    keyword.value.trim() && {
      key: 'keyword',
      label: `Clear search “${keyword.value.trim()}”`,
      clear: () => (keyword.value = ''),
    },
    selectedCategory.value && {
      key: 'category',
      label: 'Show all categories',
      clear: () => (selectedCategory.value = ''),
    },
    selectedArea.value && {
      key: 'area',
      label: `Remove ${selectedArea.value}`,
      clear: () => (selectedArea.value = ''),
    },
    price && {
      key: 'price',
      label: `Remove ${price.label}`,
      clear: () => (selectedPrice.value = ''),
    },
    selectedSetting.value && {
      key: 'setting',
      label: `Remove ${settingLabels[selectedSetting.value]}`,
      clear: () => (selectedSetting.value = ''),
    },
  ].filter(Boolean)
})

const suggestions = computed(() => {
  if (filteredActivities.value.length || !activities.value.length) return []
  return narrowings.value
    .map((item) => {
      const filters = { ...currentFilters.value, [item.key]: '' }
      const count = activities.value.filter((activity) => matchesFilters(activity, filters)).length
      return { ...item, count }
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
})

async function applySuggestion(item) {
  item.clear()
  await nextTick()
  if (showFilters.value) filterConfirm.value?.focus({ preventScroll: true })
  else resultsSummary.value?.focus({ preventScroll: true })
}

const pageCount = computed(() => Math.max(1, Math.ceil(filteredActivities.value.length / pageSize)))
const currentPage = computed(() => Math.min(requestedPage.value, pageCount.value))
const pageStart = computed(() => (isPhone.value ? 0 : (currentPage.value - 1) * pageSize))
// The catalogue is already loaded for search, so phones can show every match in one list.
const displayedActivities = computed(() =>
  isPhone.value
    ? filteredActivities.value
    : filteredActivities.value.slice(pageStart.value, pageStart.value + pageSize),
)
const visiblePages = computed(() => {
  const start = Math.max(1, Math.min(currentPage.value - 2, pageCount.value - 4))
  return Array.from({ length: Math.min(5, pageCount.value) }, (_, index) => start + index)
})

// How far down the sticky search row (and on roomy screens the chip row) reaches
function stickyBottom() {
  return [searchRow.value, browseRow.value].reduce((bottom, element) => {
    if (!element) return bottom
    const style = getComputedStyle(element)
    if (style.position !== 'sticky') return bottom
    return Math.max(bottom, (parseFloat(style.top) || 0) + element.offsetHeight)
  }, 0)
}

async function changePage(page) {
  requestedPage.value = page
  await nextTick()
  const summary = resultsSummary.value
  if (!summary) return
  summary.focus({ preventScroll: true })
  summary.style.scrollMarginTop = `${stickyBottom() + 16}px`
  summary.scrollIntoView({ block: 'start' })
}

// Save on every change rather than on leaving, so a reload keeps the filters too
watch(
  [keyword, selectedCategory, selectedSetting, selectedArea, selectedPrice, sortBy, currentPage],
  () => {
    // While loading there are no results yet, so currentPage reads 1; keep the saved page until then
    if (loading.value) return
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
  },
)

// The filter panel owns area, price and indoor/outdoor. Category has its chips, sort its own menu.
const hasFilters = computed(() =>
  Boolean(selectedArea.value || selectedPrice.value || selectedSetting.value),
)

function clearFilters() {
  selectedArea.value = ''
  selectedPrice.value = ''
  selectedSetting.value = ''
  if (showFilters.value) filtersPanel.value?.focusClose()
  else filtersTrigger.value?.focus({ preventScroll: true })
}

// The empty state's reset: everything that narrows the list, but not the sort
async function clearSearchAndFilters() {
  keyword.value = ''
  selectedCategory.value = ''
  selectedArea.value = ''
  selectedPrice.value = ''
  selectedSetting.value = ''
  await nextTick()
  resultsSummary.value?.focus({ preventScroll: true })
}

const clearEverythingLabel = computed(() => {
  const filtered = selectedCategory.value || hasFilters.value
  if (keyword.value.trim()) return filtered ? 'Clear search and filters' : 'Clear search'
  return 'Clear filters'
})

const noResultsHeading = computed(() => {
  const search = keyword.value.trim()
  if (!search) return 'No activities match these filters'
  const filtered = selectedCategory.value || hasFilters.value
  return filtered ? `Nothing matches “${search}” with these filters` : `Nothing matches “${search}”`
})

const activeFilters = computed(() =>
  [
    { key: 'area', label: selectedArea.value, value: selectedArea },
    {
      key: 'price',
      label: priceRanges.find((range) => range.value === selectedPrice.value)?.label,
      value: selectedPrice,
    },
    { key: 'setting', label: settingLabels[selectedSetting.value], value: selectedSetting },
  ].filter((filter) => filter.label),
)

// Keep keyboard focus in the chip row: move to the chip that slid into this place, or the one
// before it, and back to the Filters button once none are left
async function removeFilter(filter, index) {
  filter.value.value = ''
  await nextTick()
  const chips = appliedFilters.value?.querySelectorAll('.applied-filter') ?? []
  const next = chips[Math.min(index, chips.length - 1)]
  ;(next ?? filtersTrigger.value)?.focus({ preventScroll: true })
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
      profileError.value = "Couldn't load your preferences, so these aren't ranked for you yet."
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
    errorMessage.value = "Couldn't load activities. Check your connection."
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
        <h1 class="page-title">What are we doing this weekend?</h1>
        <p class="page-lede text-secondary mb-0">Discover activities around Singapore.</p>
      </div>
      <!-- Phones use the plus button in the bottom navbar. -->
      <RouterLink
        v-if="!isPhone"
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

    <!-- On phones this row sticks to the top; the chips scroll away with the page. -->
    <div
      ref="searchRow"
      class="search-row"
      :class="{ 'is-stuck': searchStuck }"
      role="search"
      aria-label="Search activities"
      data-testid="activity-controls"
    >
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
          placeholder="Search name, category or area"
          data-testid="activity-search"
        />
      </div>
      <button
        type="button"
        ref="filtersTrigger"
        class="filters-toggle"
        :class="{ 'has-active-filters': activeFilters.length > 0 }"
        :aria-label="activeFilters.length ? `Filters (${activeFilters.length} active)` : 'Filters'"
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

    <section ref="browseRow" class="browse-row" aria-label="Categories, sort and applied filters">
      <div class="browse-controls">
        <!-- The fades and arrows only appear on a side that has more chips to scroll to -->
        <div class="chip-strip" :class="{ 'has-before': chipsBefore, 'has-after': chipsAfter }">
          <div
            ref="chipStrip"
            class="category-chips"
            role="group"
            aria-label="Categories"
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
              All
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
        ref="appliedFilters"
        class="applied-filters"
        role="group"
        aria-label="Applied filters"
      >
        <button
          v-for="(filter, index) in activeFilters"
          :key="filter.key"
          type="button"
          class="applied-filter"
          :aria-label="`Remove ${filter.label} filter`"
          data-testid="active-filter"
          @click="removeFilter(filter, index)"
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
            <option value="">Both</option>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
          </select>
        </div>
        <div class="col-12 col-sm-6 mobile-sort-control">
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

      <!-- Results outside the dialog can't be announced while it's open, so say the count here -->
      <p class="visually-hidden" role="status">
        {{ activityCount(filteredActivities.length) }} match
      </p>

      <template #footer>
        <!-- In the footer, not the scrolling body, so it shows next to the button it explains -->
        <div
          v-if="activities.length && !filteredActivities.length"
          class="filter-hint"
          data-testid="filters-no-match"
        >
          <p class="mb-2">Nothing matches all of these.</p>
          <div v-if="suggestions.length" class="suggestions">
            <button
              v-for="item in suggestions"
              :key="item.key"
              type="button"
              class="btn btn-outline-dark btn-sm rounded-pill suggestion"
              data-testid="filter-suggestion"
              @click="applySuggestion(item)"
            >
              {{ item.label }}
              <span class="suggestion-count">{{ activityCount(item.count) }}</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-outline-dark rounded-pill"
          :disabled="!hasFilters"
          data-testid="clear-filters"
          @click="clearFilters"
        >
          Clear filters
        </button>
        <button
          ref="filterConfirm"
          type="button"
          class="btn rounded-pill flex-grow-1"
          :class="filteredActivities.length ? 'btn-dark' : 'btn-outline-dark'"
          data-testid="filter-confirm"
          @click="closeFilters"
        >
          Show {{ activityCount(filteredActivities.length) }}
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
        class="btn btn-outline-dark rounded-pill"
        :disabled="favouritesLoading"
        data-testid="favourites-retry"
        @click="loadFavourites"
      >
        Try again
      </button>
    </div>

    <div
      v-if="saveError || saveMessage"
      class="save-feedback"
      :class="{ 'is-error': saveError }"
      :role="saveError ? 'alert' : 'status'"
      data-testid="activity-toast"
    >
      <p class="feedback-text" data-testid="activity-save-feedback">
        {{ saveError || saveMessage }}
      </p>
      <RouterLink
        v-for="group in saveError ? [] : sharedGroups"
        :key="group.id"
        :to="`/groups/${group.id}/activities`"
        class="feedback-link"
        data-testid="share-go-vote"
      >
        Go vote in {{ group.name }}
      </RouterLink>
      <button
        v-if="saveError || sharedGroups.length"
        type="button"
        class="feedback-close"
        aria-label="Dismiss message"
        data-testid="activity-toast-close"
        @click="closeMessage"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
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
        class="btn btn-outline-dark rounded-pill"
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
        class="btn btn-outline-danger rounded-pill"
        data-testid="activities-retry"
        @click="loadActivities"
      >
        Try again
      </button>
    </div>

    <div
      v-else-if="activities.length === 0"
      class="empty-results text-center p-4 p-md-5"
      data-testid="activities-empty"
    >
      <h2 class="h5">No activities yet</h2>
      <p class="text-secondary mb-0">
        Know a good spot?
        <RouterLink to="/activities/submit">Submit the first one</RouterLink>
      </p>
    </div>

    <template v-else>
      <div class="results-line">
        <p
          id="activities-results-summary"
          ref="resultsSummary"
          class="results-count"
          role="status"
          tabindex="-1"
          data-testid="activities-count"
        >
          Showing {{ filteredActivities.length ? pageStart + 1 : 0 }}–{{
            pageStart + displayedActivities.length
          }}
          of {{ filteredActivities.length }} activities
        </p>
        <p
          v-if="ranked && filteredActivities.length"
          class="results-note"
          data-testid="activities-sort-description"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9Z" />
          </svg>
          Based on your saved interests, budget and home area.
        </p>
        <!-- Unranked Best match is said out loud; other sorts show on phones, where the menu is in Filters -->
        <p
          class="results-note"
          :class="{
            'visually-hidden': ranked,
            'quiet-on-wide': sortBy !== 'best-match',
          }"
          role="status"
          data-testid="activities-sort-summary"
        >
          {{ sortSummary }}
          <RouterLink
            v-if="sortBy === 'best-match' && !hasRankingPreferences && !profileError"
            to="/profile"
            data-testid="add-interests-link"
            >Add your interests</RouterLink
          >
        </p>
      </div>

      <div
        v-if="filteredActivities.length === 0"
        class="empty-results text-center p-4 p-md-5"
        data-testid="activities-no-results"
      >
        <h2 class="h5">{{ noResultsHeading }}</h2>
        <template v-if="suggestions.length">
          <p class="text-secondary">One change brings some back:</p>
          <div class="suggestions justify-content-center mb-3">
            <button
              v-for="item in suggestions"
              :key="item.key"
              type="button"
              class="btn btn-outline-dark btn-sm rounded-pill suggestion"
              data-testid="empty-suggestion"
              @click="applySuggestion(item)"
            >
              {{ item.label }}
              <span class="suggestion-count">{{ activityCount(item.count) }}</span>
            </button>
          </div>
        </template>
        <p v-else class="text-secondary">Try another search, or start again.</p>
        <button
          type="button"
          class="btn btn-dark rounded-pill px-4"
          data-testid="empty-clear-filters"
          @click="clearSearchAndFilters"
        >
          {{ clearEverythingLabel }}
        </button>
        <p v-if="!isPhone" class="small text-secondary mt-3 mb-0">
          Know a spot we're missing?
          <RouterLink to="/activities/submit" data-testid="empty-submit-activity"
            >Submit it</RouterLink
          >
        </p>
      </div>

      <div v-else class="row g-4" data-testid="activities-grid">
        <div
          v-for="activity in displayedActivities"
          :key="activity.id"
          class="col-12 col-md-6 col-lg-4"
        >
          <ActivityCard
            :activity="activity"
            :saved="savedIds.has(activity.id)"
            :saving="savingIds.has(activity.id)"
            :save-disabled="favouritesLoading || Boolean(favouritesError)"
            :reasons="ranked ? matchReasons(activity, profile) : []"
            @save="toggleSaved"
            @share="openShare"
          />
        </div>
      </div>

      <nav
        v-if="!isPhone && pageCount > 1"
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
.page-link:disabled {
  opacity: 0.45;
}

.page-link.page-current {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
}

/* ---------- Page header ---------- */
.activities-page {
  /* Height of the sticky search row: 14px + 48px search + 12px + 1px edge.
     On roomy screens the chip row sticks right under it. */
  --search-row-height: 75px;
  --navbar-top-height: var(--navbar-height, 0px);
}

.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 24px;
  margin-bottom: 10px;
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
  justify-content: center;
  gap: 6px;
  min-height: 44px;
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

/* ---------- Sticky search row ---------- */
.search-row {
  position: sticky;
  top: var(--navbar-top-height);
  z-index: 1011;
  display: flex;
  gap: 10px;
  padding: 14px 0 12px;
  /* Same colour as the page; the edge only shows once it's stuck and cards scroll under it */
  border-bottom: 1px solid transparent;
  background: var(--bg);
  transition: border-color 160ms ease;
}

.search-row.is-stuck {
  border-bottom-color: var(--line);
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

/* Search box and Filters button are one pair: same height, same pill shape, same border */
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

/* ---------- Category chips, sort and applied filters ---------- */
.browse-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}

/* With room to spare, the chips and sort stay handy under the search row too */
@media (min-width: 768px) and (min-height: 600px) {
  .browse-row {
    position: sticky;
    top: calc(var(--navbar-top-height) + var(--search-row-height));
    z-index: 1010;
  }

  .search-row.is-stuck {
    border-bottom-color: transparent;
  }
}

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

.applied-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.applied-filter {
  position: relative;
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
  min-height: 32px;
  padding: 0 8px;
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

/* Fingers need 44px. Chips scroll sideways, which clips anything outside them, so they grow;
   applied filters get a taller invisible hit area and keep their compact look. */
@media (pointer: coarse) {
  .category-chip,
  .clear-all {
    min-height: 44px;
  }

  .applied-filter::after {
    content: '';
    position: absolute;
    inset: -6px -2px;
  }
}

/* ---------- Results ---------- */
.results-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 16px;
  margin-bottom: 16px;
  color: var(--muted);
  font-size: 0.875rem;
}

.results-line p {
  margin-bottom: 0;
}

/* Plain text flow, so the icon stays on the first line when the note wraps on a phone */
.results-note svg {
  width: 14px;
  height: 14px;
  margin-right: 4px;
  vertical-align: -2px;
  fill: var(--ink);
}

.results-note a {
  margin-left: 4px;
  color: var(--ink);
  font-weight: 700;
  text-underline-offset: 3px;
}

#activities-results-summary {
  scroll-margin-top: calc(var(--navbar-top-height) + 16px);
}

.empty-results {
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.empty-results a {
  color: var(--ink);
  font-weight: 700;
  text-underline-offset: 3px;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.suggestion {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding-inline: 16px;
}

.suggestion-count {
  color: var(--muted);
  font-weight: 500;
}

.suggestion:hover .suggestion-count {
  color: inherit;
}

/* ---------- Filter panel ---------- */
/* BaseDialog does the layout; this only sets the width */
.filters-panel {
  --dialog-width: 620px;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
}

/* Takes a full row of the footer, above Clear filters and Show */
.filter-hint {
  flex: 1 1 100%;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  font-weight: 600;
}

/* ---------- Save and share messages ---------- */
.save-feedback {
  position: fixed;
  right: 1rem;
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 1080;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  max-width: min(440px, calc(100% - 2rem));
  padding: 12px 14px 12px 18px;
  border-radius: var(--radius-md);
  background: var(--ink);
  color: var(--on-ink);
  box-shadow: var(--shadow-float);
  overflow-wrap: anywhere;
}

/* Errors keep Bootstrap's danger colours, which already have light and dark versions */
.save-feedback.is-error {
  border: 1px solid var(--bs-danger-border-subtle);
  background: var(--bs-danger-bg-subtle);
  color: var(--bs-danger-text-emphasis);
}

.feedback-text {
  flex: 1 1 200px;
  margin: 0;
  font-weight: 600;
}

.feedback-link {
  color: inherit;
  font-weight: 700;
  text-underline-offset: 3px;
}

.feedback-close {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -10px -8px -10px auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: inherit;
}

.feedback-close svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

/* Inside an ink toast, an ink ring can't be seen, so the ring takes the toast's text colour */
.save-feedback :is(.feedback-link, .feedback-close):focus-visible {
  outline-color: currentColor;
}

@media (max-width: 767.98px) {
  .activities-page {
    --navbar-top-height: 0px;
  }

  .page-header {
    margin-bottom: 4px;
  }

  .page-lede {
    display: none;
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

  .save-feedback {
    left: 1rem;
    bottom: calc(var(--navbar-height, 61px) + 1rem);
    max-width: none;
  }
}

/* The sort menu shows the sort on wider screens, so only screen readers need it said */
@media (min-width: 768px) {
  .quiet-on-wide {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .category-chip,
  .filters-toggle,
  .filter-knob,
  .search-row {
    transition: none;
  }
  .filters-toggle:is(:hover, :focus-visible) .filter-knob {
    transform: none;
    transition-delay: 0s;
  }
}
</style>
