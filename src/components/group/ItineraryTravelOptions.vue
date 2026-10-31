<script setup>
import { computed } from 'vue'
import TravelIcon from '@/components/group/TravelIcon.vue'

const props = defineProps({
  leg: { type: Object, default: null }, // { loading: true }, { options: [...] } or { error: '...' }
  mode: { type: String, default: null }, // the group's choice, e.g. 'WALK'. null = use the fastest
  editable: { type: Boolean, default: false }, // true in edit mode: the tabs can be clicked
})
const emit = defineEmits(['choose'])

const PUBLIC_MODES = ['TRANSIT', 'MRT', 'BUS']

// One mode's result, e.g. optionFor('WALK')
function optionFor(mode) {
  return props.leg?.options?.find((option) => option.mode === mode) || null
}

// The mode to show: the group's choice, or else the fastest one with a route
const selectedMode = computed(() => {
  if (props.mode) return props.mode
  const available = (props.leg?.options || []).filter((option) => option.available)
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
  ].map((tab) => ({ ...tab, option: optionFor(tab.mode) }))
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

function choose(mode) {
  if (props.editable) emit('choose', mode)
}

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
  <div class="d-flex" data-testid="itinerary-travel">
    <div class="travel-line" aria-hidden="true"></div>
    <div class="py-2 small flex-grow-1">
      <span v-if="!leg || leg.loading" class="text-muted">Checking travel times...</span>
      <span v-else-if="leg.error" class="text-muted">
        Travel times unavailable: {{ leg.error }}
      </span>
      <template v-else>
        <div class="d-flex flex-wrap gap-2 mb-2" role="group" aria-label="Travel mode">
          <button
            v-for="tab in tabs"
            :key="tab.label"
            type="button"
            class="mode-tab"
            :class="{ active: tab.active, clickable: editable }"
            :disabled="!tab.option?.available"
            :aria-pressed="tab.active"
            :title="tab.label"
            :data-testid="'travel-tab-' + tab.icon.toLowerCase()"
            @click="choose(tab.mode)"
          >
            <TravelIcon :kind="tab.icon" />
            <span class="visually-hidden">{{ tab.label }}</span>
            {{ tab.option?.available ? formatMinutes(tab.option.durationMinutes) : '–' }}
          </button>
        </div>
        <div v-if="isPublic && editable" class="btn-group btn-group-sm mb-2">
          <button
            v-for="mode in PUBLIC_MODES"
            :key="mode"
            type="button"
            class="btn btn-outline-dark"
            :class="{ active: selectedMode === mode }"
            :disabled="!optionFor(mode)?.available"
            @click="choose(mode)"
          >
            {{ mode === 'TRANSIT' ? 'Best' : mode === 'MRT' ? 'MRT only' : 'Bus only' }}
          </button>
        </div>

        <div
          v-if="selected?.available"
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
/* The dotted line joining one stop's card to the next */
.travel-line {
  border-left: 2px dotted var(--bs-secondary-color);
  margin: 0 1rem 0 1.5rem;
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
  cursor: default;
}
.mode-tab.clickable:not(:disabled) {
  cursor: pointer;
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
