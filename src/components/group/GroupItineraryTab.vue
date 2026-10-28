<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { getVisitHoursWarnings } from '@/lib/openingHours'
import { fetchTravelOptions } from '@/lib/travelOptions'

const itinerary = ref(null)
const budget = computed(() => group.value?.budget_per_person ?? 0)
// Fake group votes for now. Later: group_activities joined with activities.
// The group's voted activities (loaded from Supabase by loadVotes)
const votedActivities = ref([])

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
// Voted activities that aren't in the plan right now
const notInPlan = computed(() => {
  if (!itinerary.value) return []
  const usedIds = itinerary.value.stops.map((s) => s.activity_id)
  return votedActivities.value.filter((a) => !usedIds.includes(a.activity_id))
})

// A short reason why an activity isn't in the plan
function whyNotInPlan(activity) {
  const extra = totalCost.value + activity.cost - budget.value
  if (extra > 0) return 'Over budget by $' + extra
  return "Doesn't fit the time or opening hours"
}

// ----- The group (real data from Supabase) -----
const route = useRoute()
const groupId = route.params.id // the :id in /groups/:id/itinerary

const group = ref(null) // { chosen_start, chosen_end, budget_per_person }
const loading = ref(true)
const errorMessage = ref('')

async function loadGroup() {
  const { data, error } = await supabase
    .from('groups')
    .select('chosen_start, chosen_end, budget_per_person')
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  group.value = data
}

// Supabase timestamp (UTC) -> '2026-10-25T10:00' in Singapore time (UTC+8)
function toSgKey(timestamp) {
  return new Date(new Date(timestamp).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

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

// Returns a list of warning messages for one stop
function getStopWarnings(stop) {
  return getVisitHoursWarnings(
    stop.opening_hours,
    itinerary.value.date,
    toMinutes(stop.start),
    toMinutes(stop.end),
  )
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

const saving = ref(false)
const saveError = ref('')

// Save the plan for this group (creates the row the first time, updates it after)
async function saveChanges() {
  saving.value = true
  saveError.value = ''
  try {
    const { data: userData } = await supabase.auth.getUser()
    // Only save the fields from the brief. Name, photo etc. come from the activity.
    const stopsToSave = itinerary.value.stops.map((s) => ({
      activity_id: s.activity_id,
      start: s.start,
      end: s.end,
      cost: s.cost,
      reason: s.reason,
    }))

    const { error } = await supabase.from('itineraries').upsert(
      {
        group_id: groupId,
        stops: stopsToSave,
        total_cost: totalCost.value,
        updated_by: userData.user.id,
      },
      { onConflict: 'group_id' },
    )
    if (error) throw error
    isEditing.value = false // only leave edit mode if it worked
  } catch (error) {
    console.log(error)
    saveError.value = "Couldn't save the plan. Please try again."
  } finally {
    saving.value = false
  }
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

// Add a voted activity to the end of the plan, even if it goes over budget
function addStop(activity) {
  itinerary.value.stops.push({
    activity_id: activity.activity_id,
    name: activity.name,
    image_url: activity.image_url,
    start: '00:00',
    end: toTime(activity.duration_min), // so the duration is right
    cost: activity.cost,
    reason: 'Added by the group',
    indoor: activity.indoor,
    opening_hours: activity.opening_hours,
    address: activity.address,
    lat: activity.lat,
    lng: activity.lng,
  })
  recalculateTimes()
}

// Throw away the current plan and build a new one from the chosen time.
// It starts edit mode first, so Discard can still bring back the saved plan.
function replan() {
  startEditing()
  buildPlan()
  if (!itinerary.value) return
  dayStart.value = itinerary.value.stops[0]?.start || dayStart.value
}

// Load this group's saved plan, or null if nobody has saved one yet
async function loadSavedPlan() {
  const { data, error } = await supabase
    .from('itineraries')
    .select('stops, total_cost')
    .eq('group_id', groupId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Turn saved stops back into full stops by adding each activity's details (name, photo...)
function useSavedPlan(saved) {
  const stops = saved.stops.map((s) => {
    const activity = votedActivities.value.find((a) => a.activity_id === s.activity_id) || {}
    return { ...activity, ...s }
  })
  const date = group.value?.chosen_start ? toSgKey(group.value.chosen_start).slice(0, 10) : ''
  itinerary.value = { date, total_cost: saved.total_cost, stops }
}

// Load this group's votes, add them up per activity, and keep the ones with more ups than downs
async function loadVotes() {
  const { data, error } = await supabase
    .from('votes')
    .select(
      'activity_id, value, activities(name, image_url, price_per_person, indoor, opening_hours, duration_min, address, lat, lng)',
    )
    .eq('group_id', groupId)
  if (error) throw error

  const byActivity = {} // activity_id -> the activity, with its vote total
  for (const vote of data) {
    if (!byActivity[vote.activity_id]) {
      const a = vote.activities
      if (!a) continue
      byActivity[vote.activity_id] = {
        activity_id: vote.activity_id,
        name: a.name,
        image_url: a.image_url || '',
        cost: a.price_per_person ?? 0,
        indoor: a.indoor,
        opening_hours: a.opening_hours,
        address: a.address || '',
        lat: a.lat,
        lng: a.lng,
        duration_min: a.duration_min || 60,
        votes: 0,
      }
    }
    byActivity[vote.activity_id].votes += vote.value
  }

  votedActivities.value = Object.values(byActivity).filter((a) => a.votes > 0)
}

// Fill the chosen time with the most-voted activities that fit the time, opening hours and budget
function buildPlan() {
  if (!group.value?.chosen_start) {
    itinerary.value = null // no time picked yet -> empty state
    return
  }
  const start = toSgKey(group.value.chosen_start) // '2026-10-24T10:00'
  const end = toSgKey(group.value.chosen_end)
  const endMinutes = toMinutes(end.slice(11)) // '16:00' -> 960

  const sorted = [...votedActivities.value].sort((a, b) => b.votes - a.votes)
  const stops = []
  let current = toMinutes(start.slice(11))
  let spent = 0

  for (const activity of sorted) {
    const finish = current + activity.duration_min
    if (finish > endMinutes) continue // runs past the chosen end time
    if (getVisitHoursWarnings(activity.opening_hours, start.slice(0, 10), current, finish).length)
      continue
    if (spent + activity.cost > budget.value) continue // over budget
    stops.push({
      activity_id: activity.activity_id,
      name: activity.name,
      image_url: activity.image_url,
      start: toTime(current),
      end: toTime(finish),
      cost: activity.cost,
      reason: activity.votes + ' votes in the group',
      indoor: activity.indoor,
      opening_hours: activity.opening_hours,
      address: activity.address,
      lat: activity.lat,
      lng: activity.lng,
    })
    spent += activity.cost
    current = finish + TRAVEL_MINUTES
  }

  itinerary.value = { date: start.slice(0, 10), total_cost: spent, stops }
}

// Runs when the tab opens: the group first, then the weather (which needs the date)
async function loadPage() {
  loading.value = true
  errorMessage.value = ''
  try {
    await loadGroup()
    await loadVotes()
    const saved = await loadSavedPlan()
    if (saved) {
      useSavedPlan(saved) // the group already has a plan: show it
    } else {
      buildPlan() // no plan yet: make one from the chosen time
    }
    loadWeather()
  } catch (error) {
    console.log(error)
    errorMessage.value = "Couldn't load the plan. Please try again."
  } finally {
    loading.value = false
  }
}

onMounted(loadPage)
// ----- Travel between stops (OneMap, through the onemap-route Edge Function) -----
const travelByLeg = ref({}) // 'fromId>toId' -> { loading: true } or { options } or { error }

function legKey(from, to) {
  return from.activity_id + '>' + to.activity_id
}

// What the Edge Function needs to find a stop: saved coordinates, or its address and name
function placeOf(stop) {
  if (stop.lat != null && stop.lng != null) return { lat: stop.lat, lng: stop.lng }
  return { address: stop.address || '', name: stop.name || '' }
}

// Load the travel options for every pair of stops, one pair at a time
async function loadTravel() {
  const stops = itinerary.value?.stops || []
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i]
    const to = stops[i + 1]
    const key = legKey(from, to)
    travelByLeg.value[key] = { loading: true }
    try {
      const departure = itinerary.value.date + 'T' + from.end // leave when this stop ends
      const options = await fetchTravelOptions(placeOf(from), placeOf(to), departure)
      travelByLeg.value[key] = { options }
    } catch (error) {
      travelByLeg.value[key] = { error: error.message }
    }
  }
}

// Reload whenever the stops or their times change (new plan, move, remove, swap, start time)
watch(() => itinerary.value?.stops.map((s) => s.activity_id + '@' + s.end).join(','), loadTravel)
</script>

<template>
  <div data-testid="group-itinerary-tab">
    <h2 class="h4">Itinerary</h2>
    <p v-if="loading" class="text-muted">Loading plan...</p>
    <p v-else-if="errorMessage" class="text-danger" data-testid="itinerary-error">
      {{ errorMessage }}
    </p>

    <!-- No plan yet -->
    <div v-else-if="!itinerary" class="alert alert-secondary" data-testid="itinerary-empty">
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
          <button
            class="btn btn-primary"
            :disabled="saving"
            data-testid="itinerary-save"
            @click="saveChanges"
          >
            {{ saving ? 'Saving...' : 'Save changes' }}
          </button>
          <button
            class="btn btn-outline-secondary"
            data-testid="itinerary-discard"
            @click="discardChanges"
          >
            Discard
          </button>
          <button class="btn btn-outline-warning" data-testid="itinerary-replan" @click="replan">
            Re-plan
          </button>
        </template>
        <div v-if="isEditing" class="d-flex align-items-center gap-2 ms-auto">
          <label for="day-start" class="form-label mb-0">Start at</label>
          <input
            id="day-start"
            v-model="dayStart"
            type="time"
            class="form-control form-control-sm"
            data-testid="itinerary-start-time"
            @change="recalculateTimes"
          />
        </div>
      </div>
      <p v-if="saveError" class="text-danger" data-testid="itinerary-save-error">{{ saveError }}</p>

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
      <div v-if="notInPlan.length" class="mt-4" data-testid="itinerary-not-in-plan">
        <h3 class="h6">Also voted for, but not in the plan</h3>
        <ul class="list-group">
          <li
            v-for="activity in notInPlan"
            :key="activity.activity_id"
            class="list-group-item d-flex align-items-center gap-2"
          >
            <span class="flex-grow-1">{{ activity.name }} (${{ activity.cost }})</span>
            <span class="badge text-bg-light">{{ whyNotInPlan(activity) }}</span>
            <button
              v-if="isEditing"
              class="btn btn-sm btn-outline-primary"
              data-testid="itinerary-add-stop"
              @click="addStop(activity)"
            >
              Add anyway
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
