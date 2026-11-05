<script setup>
import { computed, onBeforeUpdate, onUpdated, ref, watch } from 'vue'
import TravelIcon from '@/components/group/TravelIcon.vue'

const props = defineProps({
  leg: { type: Object, default: null }, // { loading: true }, { options: [...] } or { error: '...' }
  mode: { type: String, default: null }, // the group's choice, e.g. 'WALK'. null = use the fastest
  editable: { type: Boolean, default: false }, // true in edit mode: shows the tabs to choose from
})
const emit = defineEmits(['choose'])

const PUBLIC_MODES = ['TRANSIT', 'MRT', 'BUS']

// While loading, the tabs and route line are already laid out (greyed out), so the row is
// its final height before the times arrive and the cards below don't jump
const loading = computed(() => !props.leg || props.leg.loading)

// The last times this row showed. While it re-checks (say after another journey's mode
// changes and every later stop moves), it keeps showing them dimmed, in the same layout,
// so the rows don't all grow and shrink at once.
const lastOptions = ref(null)
watch(
  () => props.leg,
  (leg) => {
    if (leg?.options) lastOptions.value = leg.options
  },
  { immediate: true },
)
const options = computed(() => props.leg?.options || (loading.value ? lastOptions.value : null) || [])
const stale = computed(() => loading.value && options.value.length > 0)

// If the height still changes (say walking turns out fastest, so the Best / MRT only /
// Bus only row goes), ease to the new height instead of jumping
const root = ref(null)
let startHeight = 0
onBeforeUpdate(() => {
  if (!root.value) return
  startHeight = root.value.getBoundingClientRect().height // mid-ease if still easing
  root.value.getAnimations().forEach((animation) => animation.cancel())
})
onUpdated(() => {
  const el = root.value
  if (!el || !startHeight) return
  const endHeight = el.getBoundingClientRect().height
  if (Math.abs(endHeight - startHeight) < 1) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate(
    [
      { height: startHeight + 'px', overflow: 'hidden' },
      { height: endHeight + 'px', overflow: 'hidden' },
    ],
    { duration: 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  )
})

// One mode's result, e.g. optionFor('WALK')
function optionFor(mode) {
  return options.value.find((option) => option.mode === mode) || null
}

// The mode to show: the group's choice, or else the fastest one with a route
const selectedMode = computed(() => {
  if (props.mode) return props.mode
  const available = options.value.filter((option) => option.available)
  if (available.length === 0) return 'TRANSIT'
  return available.reduce((best, option) =>
    option.durationMinutes < best.durationMinutes ? option : best,
  ).mode
})
const selected = computed(() => optionFor(selectedMode.value))
const isPublic = computed(() => PUBLIC_MODES.includes(selectedMode.value))

// The three tabs, like Google Maps. Public transport shows Best, MRT only or Bus only.
const tabs = computed(() => {
  const publicMode = isPublic.value ? selectedMode.value : 'TRANSIT'
  return [
    { mode: publicMode, icon: 'TRAIN', label: 'Public transport', active: isPublic.value },
    { mode: 'WALK', icon: 'WALK', label: 'Walk', active: selectedMode.value === 'WALK' },
    { mode: 'CYCLE', icon: 'CYCLE', label: 'Cycle', active: selectedMode.value === 'CYCLE' },
  ].map((tab) => ({
    ...tab,
    // Nothing looks chosen on a first check; a re-check keeps showing the current choice
    active: tab.active && (!loading.value || stale.value),
    option: optionFor(tab.mode),
  }))
})

// 'Walk 6 min → DT line 3 stops → Bus 106' -> one icon and short text per step
const steps = computed(() =>
  (selected.value?.summary || '')
    .split(' → ')
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('Walk ')) return { icon: 'WALK', text: part.slice(5) }
      if (part.startsWith('Cycle ')) return { icon: 'CYCLE', text: part.slice(6) }
      if (part.startsWith('Bus ')) return { icon: 'BUS', text: part.slice(4) }
      return { icon: 'TRAIN', text: part.replace(' line', '') } // 'DT line 3 stops' -> 'DT 3 stops'
    }),
)

// 150 -> '2 h 30 min'
function formatMinutes(minutes) {
  return minutes >= 60
    ? Math.floor(minutes / 60) + ' h ' + (minutes % 60) + ' min'
    : minutes + ' min'
}

// 2694 -> '2.7 km', 450 -> '450 m'
function formatDistance(meters) {
  return meters >= 1000 ? (meters / 1000).toFixed(1) + ' km' : meters + ' m'
}
</script>

<template>
  <div ref="root" class="d-flex" data-testid="itinerary-travel" :aria-busy="loading">
    <div class="travel-line" aria-hidden="true"></div>
    <div class="py-2 small flex-grow-1 travel-body" :class="{ stale }">
      <span v-if="leg?.error" class="text-muted">
        Travel times unavailable: {{ leg.error }}
      </span>
      <template v-else>
        <div v-if="editable" class="d-flex flex-wrap gap-2 mb-2" role="group" aria-label="Travel mode">
          <button
            v-for="tab in tabs"
            :key="tab.label"
            type="button"
            class="mode-tab"
            :class="{ active: tab.active }"
            :disabled="loading || !tab.option?.available"
            :aria-pressed="tab.active"
            :title="tab.label"
            :data-testid="'travel-tab-' + tab.icon.toLowerCase()"
            @click="emit('choose', tab.mode)"
          >
            <TravelIcon :kind="tab.icon" />
            <span class="visually-hidden">{{ tab.label }}</span>
            {{
              loading && !stale
                ? '…'
                : tab.option?.available
                  ? formatMinutes(tab.option.durationMinutes)
                  : '–'
            }}
          </button>
        </div>
        <div v-if="isPublic && editable" class="btn-group btn-group-sm mb-2">
          <button
            v-for="mode in PUBLIC_MODES"
            :key="mode"
            type="button"
            class="btn btn-outline-dark"
            :class="{ active: selectedMode === mode && (!loading || stale) }"
            :disabled="loading || !optionFor(mode)?.available"
            @click="emit('choose', mode)"
          >
            {{ mode === 'TRANSIT' ? 'Best' : mode === 'MRT' ? 'MRT only' : 'Bus only' }}
          </button>
        </div>

        <!-- First check only: one line of text, like the route it stands in for (its icons
             are shorter than a line). A re-check keeps showing the last route, dimmed. -->
        <div v-if="loading && !stale" class="text-muted">Checking travel times...</div>
        <div
          v-else-if="selected?.available"
          class="d-flex flex-wrap align-items-center gap-1 text-body-secondary"
          data-testid="travel-route"
        >
          <template v-for="(step, i) in steps" :key="i">
            <span v-if="i > 0" aria-hidden="true">›</span>
            <span class="d-inline-flex align-items-center gap-1">
              <TravelIcon :kind="step.icon" />{{ step.text }}
            </span>
          </template>
          <span class="ms-2">· {{ formatDistance(selected.distanceMeters) }}</span>
        </div>
        <div v-else-if="selected" class="text-muted">{{ selected.error }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Sits beside the itinerary's timeline line, between one stop's card and the next */
.travel-line {
  margin: 0 1rem 0 0.25rem;
}

/* Last times, shown while new ones are checked */
.travel-body {
  transition: opacity 0.2s ease;
}

.travel-body.stale {
  opacity: 0.5;
}

/* Google Maps-style mode tabs */
.mode-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.25rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
}
.mode-tab.active {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--on-ink);
  font-weight: 600;
}
.mode-tab:disabled {
  opacity: 0.45;
}
</style>
