<script setup>
import { computed } from 'vue'

// The travel between two stops: { loading: true }, { options: [...] } or { error: '...' }
const props = defineProps({
  leg: { type: Object, default: null },
})

const LABELS = { MRT: 'MRT', BUS: 'Bus', TRANSIT: 'Transit', WALK: 'Walk', CYCLE: 'Cycle' }

// The shortest time among the modes that have a route
const fastestMinutes = computed(() => {
  const times = (props.leg?.options || [])
    .filter((option) => option.available)
    .map((option) => option.durationMinutes)
  return times.length ? Math.min(...times) : null
})

const fastest = computed(() =>
  (props.leg?.options || []).find(
    (option) => option.available && option.durationMinutes === fastestMinutes.value,
  ),
)

// 2694 -> '2.7 km', 450 -> '450 m'
function formatDistance(meters) {
  return meters >= 1000 ? (meters / 1000).toFixed(1) + ' km' : meters + ' m'
}
</script>

<template>
  <div class="d-flex" data-testid="itinerary-travel">
    <div class="travel-line" aria-hidden="true"></div>
    <div class="py-2 small">
      <span v-if="!leg || leg.loading" class="text-muted">Checking travel times...</span>
      <span v-else-if="leg.error" class="text-muted"
        >Travel times unavailable: {{ leg.error }}</span
      >
      <template v-else>
        <div class="d-flex flex-wrap gap-2">
          <span
            v-for="option in leg.options"
            :key="option.mode"
            class="badge rounded-pill"
            :class="
              !option.available
                ? 'text-bg-light text-muted'
                : option.durationMinutes === fastestMinutes
                  ? 'text-bg-success'
                  : 'text-bg-secondary'
            "
            :title="option.available ? option.summary : option.error"
            :data-testid="'travel-' + option.mode.toLowerCase()"
          >
            {{ LABELS[option.mode] }}
            <template v-if="option.available">
              {{ option.durationMinutes }} min · {{ formatDistance(option.distanceMeters) }}
            </template>
            <template v-else>–</template>
          </span>
        </div>
        <div v-if="fastest" class="text-muted mt-1">Fastest: {{ fastest.summary }}</div>
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
</style>
