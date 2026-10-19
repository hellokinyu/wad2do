<script setup>
import { ref, computed, onMounted } from 'vue'

// Fake data for now. Later this will come from the itineraries table.
// Each stop has the same fields we'll save: activity_id, start, end, cost, reason
// (plus name and image so we can display it).
const itinerary = ref({
  date: '2026-10-22',
  total_cost: 42,
  stops: [
    {
      activity_id: 'a1',
      name: 'Gardens by the Bay',
      image_url: '',
      start: '10:00',
      end: '12:00',
      cost: 12,
      reason: 'Most votes in the group',
      indoor: false,
      closes: '11:00',
    },
    {
      activity_id: 'a2',
      name: 'Lau Pa Sat',
      image_url: '',
      start: '12:30',
      end: '13:30',
      cost: 15,
      reason: 'Lunch close to the last stop',
      indoor: true,
      closes: '22:00',
    },
    {
      activity_id: 'a3',
      name: 'ArtScience Museum',
      image_url: '',
      start: '14:00',
      end: '16:00',
      cost: 15,
      reason: 'Indoor option everyone liked',
      indoor: true,
      closes: '19:00',
    },
  ],
})

// Fake budget for now. Later it comes from the group (budget_per_person).
const budget = ref(50)

// Fake group votes for now. Later: group_activities joined with activities.
const votedActivities = ref([
  {
    activity_id: 'a4',
    name: 'National Gallery',
    image_url: '',
    cost: 20,
    indoor: true,
    closes: '19:00',
  },
  {
    activity_id: 'a5',
    name: 'East Coast Park cycling',
    image_url: '',
    cost: 8,
    indoor: false,
    closes: '23:00',
  },
  {
    activity_id: 'a3',
    name: 'ArtScience Museum',
    image_url: '',
    cost: 15,
    indoor: true,
    closes: '19:00',
  },
])

// Add up the cost of every stop
const totalCost = computed(() => {
  let total = 0
  for (const stop of itinerary.value.stops) {
    total += stop.cost
  }
  return total
})

// The day starts at the first stop and ends at the last one
const startTime = computed(() => {
  if (itinerary.value.stops.length === 0) {
    return '-'
  }
  return itinerary.value.stops[0].start
})
const endTime = computed(() => {
  if (itinerary.value.stops.length === 0) {
    return '-'
  }
  return itinerary.value.stops[itinerary.value.stops.length - 1].end
})

const isOverBudget = computed(() => totalCost.value > budget.value)

// ----- Weather -----
const weather = ref(null) // the forecast for the plan's date, or null if we don't have one
const weatherLoading = ref(true)

async function loadWeather() {
  try {
    const response = await fetch('https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook')
    const json = await response.json()
    const forecasts = json.data.records[0].forecasts

    // Find the day that matches our plan. '2026-10-21T00:00:00+08:00' -> '2026-10-21'
    weather.value =
      forecasts.find((day) => day.timestamp.slice(0, 10) === itinerary.value.date) || null
  } catch (error) {
    console.log(error)
  } finally {
    weatherLoading.value = false
  }
}
// True when the forecast mentions showers, rain or thunder
const isRainy = computed(() => {
  if (!weather.value) return false
  const text = weather.value.forecast.text.toLowerCase()
  return text.includes('shower') || text.includes('rain') || text.includes('thunder')
})

// An indoor activity the group voted for that isn't already in the plan
function getRainAlternative(stop) {
  if (stop.indoor) return null
  const usedIds = itinerary.value.stops.map((s) => s.activity_id)
  return votedActivities.value.find((a) => a.indoor && !usedIds.includes(a.activity_id)) || null
}

// Replace an outdoor stop with the indoor alternative, keeping the same time slot
function swapStop(index, alternative) {
  const oldStop = itinerary.value.stops[index]
  itinerary.value.stops[index] = {
    ...alternative,
    start: oldStop.start,
    end: oldStop.end,
    reason: 'Indoor swap because of rain',
  }
  recalculateTimes()
}

// The activity_ids of stops whose rainy-day option is switched on
const showingRainy = ref([])

function toggleRainy(stop) {
  if (showingRainy.value.includes(stop.activity_id)) {
    // Switch off: keep every id except this one
    showingRainy.value = showingRainy.value.filter((id) => id !== stop.activity_id)
  } else {
    showingRainy.value.push(stop.activity_id)
  }
}

// What each card shows: the real stop, or its rainy-day alternative if the switch is on.
// "original" always points at the real stop, so the switch and Swap know which stop it is.
const displayStops = computed(() => {
  return itinerary.value.stops.map((stop) => {
    const alternative = getRainAlternative(stop)
    if (alternative && showingRainy.value.includes(stop.activity_id)) {
      return {
        ...alternative,
        start: stop.start,
        end: stop.end,
        reason: 'Rainy-day option',
        original: stop,
        isRainyView: true,
      }
    }
    return { ...stop, original: stop, isRainyView: false }
  })
})

onMounted(loadWeather)

// Returns a list of warning messages for one stop
function getStopWarnings(stop) {
  const warnings = []
  if (stop.closes && stop.end > stop.closes) {
    warnings.push('Closes at ' + stop.closes)
  }
  return warnings
}

// '10:30' -> 630 (minutes since midnight)
function toMinutes(time) {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

// 630 -> '10:30'
function toTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0')
}

// ----- Edit mode -----
const isEditing = ref(false)
let savedCopy = null // the plan as it was before editing, for Discard
const TRAVEL_MINUTES = 30 // fake travel time between stops. Later: OneMap.
const dayStart = ref('10:00') // when the first stop begins

// Give every stop a new start and end, in order, keeping each one's duration
function recalculateTimes() {
  let current = toMinutes(dayStart.value)
  for (const stop of itinerary.value.stops) {
    const duration = toMinutes(stop.end) - toMinutes(stop.start)
    stop.start = toTime(current)
    stop.end = toTime(current + duration)
    current = current + duration + TRAVEL_MINUTES
  }
}

function startEditing() {
  savedCopy = JSON.parse(JSON.stringify(itinerary.value))
  dayStart.value = itinerary.value.stops[0]?.start || '10:00'
  isEditing.value = true
}

function discardChanges() {
  itinerary.value = savedCopy
  isEditing.value = false
}

function saveChanges() {
  // Later: write to Supabase. For now, just keep the changes.
  isEditing.value = false
}

function removeStop(index) {
  itinerary.value.stops.splice(index, 1) // remove 1 item at this position
  recalculateTimes()
}

// direction is -1 (up) or +1 (down)
function moveStop(index, direction) {
  const stops = itinerary.value.stops
  const other = index + direction
  if (other < 0 || other >= stops.length) return // already at the top or bottom
  const temp = stops[index]
  stops[index] = stops[other]
  stops[other] = temp
  recalculateTimes()
}
</script>

<template>
  <div data-testid="group-itinerary-tab">
    <h2 class="h4">Itinerary</h2>

    <!-- No plan yet -->
    <div v-if="!itinerary" class="alert alert-secondary" data-testid="itinerary-empty">
      No plan yet. Pick a time on the Availability tab, then press Plan.
    </div>

    <!-- There is a plan -->
    <div v-else data-testid="itinerary-plan">
      <p v-if="weatherLoading" class="text-muted">Checking the weather...</p>
      <div v-else-if="weather" class="alert alert-info" data-testid="itinerary-weather">
        {{ weather.day }}: {{ weather.forecast.summary }}, {{ weather.temperature.low }}–{{
          weather.temperature.high
        }}°C
      </div>
      <div v-else class="alert alert-secondary" data-testid="itinerary-weather-unavailable">
        Forecast not available yet. Check back closer to the day.
      </div>
      <div class="card mb-3" data-testid="itinerary-summary">
        <div class="card-body d-flex flex-wrap gap-4">
          <div><strong>Date</strong><br />{{ itinerary.date }}</div>
          <div><strong>Time</strong><br />{{ startTime }} – {{ endTime }}</div>
          <div data-testid="itinerary-cost">
            <strong>Cost per person</strong><br />
            <span :class="{ 'text-danger': isOverBudget }">${{ totalCost }}</span> of ${{ budget }}
            <span
              v-if="isOverBudget"
              class="badge text-bg-warning ms-1"
              data-testid="itinerary-over-budget"
            >
              Over budget
            </span>
          </div>
          <div><strong>Stops</strong><br />{{ itinerary.stops.length }}</div>
        </div>
      </div>
      <div class="d-flex gap-2 mb-2">
        <button
          v-if="!isEditing"
          class="btn btn-outline-primary"
          data-testid="itinerary-edit"
          @click="startEditing"
        >
          Edit
        </button>
        <template v-else>
          <button class="btn btn-primary" data-testid="itinerary-save" @click="saveChanges">
            Save changes
          </button>
          <button
            class="btn btn-outline-secondary"
            data-testid="itinerary-discard"
            @click="discardChanges"
          >
            Discard
          </button>
        </template>
      </div>
      <ol class="list-unstyled" data-testid="itinerary-timeline">
        <li
          v-for="(stop, index) in displayStops"
          :key="stop.original.activity_id"
          class="card mb-2"
          :class="{ 'border-info border-2': stop.isRainyView }"
          data-testid="itinerary-stop"
        >
          <div class="card-body d-flex gap-3">
            <div class="fw-bold text-nowrap">{{ stop.start }}–{{ stop.end }}</div>
            <img
              v-if="stop.image_url"
              :src="stop.image_url"
              :alt="stop.name"
              class="rounded"
              width="80"
              height="80"
            />
            <div class="flex-grow-1">
              <h3 class="h6 mb-1">{{ index + 1 }}. {{ stop.name }}</h3>
              <p class="mb-1">${{ stop.cost }} per person</p>
              <p class="text-muted small mb-0">{{ stop.reason }}</p>
              <span
                v-for="warning in getStopWarnings(stop)"
                :key="warning"
                class="badge text-bg-warning me-1"
                data-testid="itinerary-stop-warning"
              >
                {{ warning }}
              </span>
              <span v-if="isRainy && !stop.original.indoor" class="badge text-bg-warning me-1"
                >Rain forecast</span
              >
              <div
                v-if="stop.isRainyView"
                class="small text-info mt-1"
                data-testid="itinerary-rain-alternative"
              >
                🌧️ Instead of {{ stop.original.name }}
                <button
                  v-if="isEditing"
                  class="btn btn-sm btn-outline-dark ms-2"
                  data-testid="itinerary-swap"
                  @click="swapStop(index, getRainAlternative(stop.original))"
                >
                  Swap
                </button>
              </div>
            </div>
            <div
              v-if="getRainAlternative(stop.original)"
              class="form-check form-switch text-nowrap"
            >
              <input
                :id="'rainy-' + stop.original.activity_id"
                class="form-check-input"
                type="checkbox"
                :checked="showingRainy.includes(stop.original.activity_id)"
                data-testid="itinerary-rainy-toggle"
                @change="toggleRainy(stop.original)"
              />
              <label class="form-check-label" :for="'rainy-' + stop.original.activity_id"
                >🌧️ Rainy option</label
              >
            </div>
            <div v-if="isEditing" class="d-flex flex-column gap-1">
              <button
                class="btn btn-sm btn-outline-secondary"
                :disabled="index === 0"
                aria-label="Move up"
                data-testid="itinerary-move-up"
                @click="moveStop(index, -1)"
              >
                ↑
              </button>
              <button
                class="btn btn-sm btn-outline-danger"
                aria-label="Remove stop"
                data-testid="itinerary-remove"
                @click="removeStop(index)"
              >
                ✕
              </button>
              <button
                class="btn btn-sm btn-outline-secondary"
                :disabled="index === itinerary.stops.length - 1"
                aria-label="Move down"
                data-testid="itinerary-move-down"
                @click="moveStop(index, 1)"
              >
                ↓
              </button>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
