<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { getVisitHoursWarnings } from '@/lib/openingHours'
import { fetchTravelOptions } from '@/lib/travelOptions'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import { formatPart, getStageStyle } from '@/lib/groupDisplay'
import { useAuth } from '@/composables/useAuth'
import ItineraryTravelOptions from '@/components/group/ItineraryTravelOptions.vue'
import ItineraryLoadingCar from '@/components/group/ItineraryLoadingCar.vue'

const TRAVEL_MINUTES = 30
const itinerary = ref(null)
const budget = computed(() => group.value?.budget_per_person ?? 0)
// The group's voted activities (loaded from Supabase by loadVotes)
const votedActivities = ref([])
// Every voted activity with its vote total, including ones with more downs than ups
const allVotedActivities = ref([])

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

// How full the budget bar is, as a percentage (a full bar when there's no budget to compare to)
const budgetPercent = computed(() => {
  if (budget.value <= 0) return totalCost.value > 0 ? 100 : 0
  return Math.min(100, (totalCost.value / budget.value) * 100)
})

// '2026-10-31' -> 'Sat 31 Oct'
const planDay = computed(() => {
  if (!itinerary.value?.date) return '-'
  return formatPart(itinerary.value.date, { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '')
})

// The same stub colours as the group's ticket: green once planned, grey once the day is over
const stageStyle = computed(() => getStageStyle({ ...group.value, itineraries: [true] }))

// '10:00', '11:30' -> '1h 30m'
function formatDuration(start, end) {
  const minutes = (((toMinutes(end) - toMinutes(start)) % 1440) + 1440) % 1440
  const hours = Math.floor(minutes / 60)
  if (!hours) return minutes + 'm'
  return minutes % 60 ? hours + 'h ' + (minutes % 60) + 'm' : hours + 'h'
}

// '09:00' -> '9:00 am', '12:10' -> '12:10 pm'
function formatClock(time) {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours % 24 >= 12 ? 'pm' : 'am'
  return (hours % 12 || 12) + ':' + String(minutes).padStart(2, '0') + ' ' + suffix
}

// '10:00', '11:30' -> '1.5 hr' (or '45 min' when under an hour)
function formatHours(start, end) {
  const minutes = (((toMinutes(end) - toMinutes(start)) % 1440) + 1440) % 1440
  if (minutes < 60) return minutes + ' min'
  return Math.round((minutes / 60) * 10) / 10 + ' hr'
}
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
const router = useRouter()
const groupId = route.params.id // the :id in /groups/:id/itinerary
const { user } = useAuth()
const loadedUserId = user.value?.id
let savedRevision
let disposed = false
let saveController

const group = ref(null) // { chosen_start, chosen_end, budget_per_person }
const loading = ref(true)
const errorMessage = ref('')

async function loadGroup() {
  const { data, error } = await supabase
    .from('groups')
    .select('chosen_start, chosen_end, budget_per_person, plan_revision')
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  group.value = data
  savedRevision = data?.plan_revision
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

// The end time when `activity` starts at `start`, using its own length
function endAfter(start, activity) {
  return toTime(toMinutes(start) + activity.duration_min)
}

// Replace an outdoor stop with the indoor alternative. It starts at the same time but
// lasts as long as the alternative does, then the later stops move to fit.
function swapStop(index, alternative) {
  const before = [...itinerary.value.stops]
  const oldStop = itinerary.value.stops[index]
  itinerary.value.stops[index] = {
    ...alternative,
    start: oldStop.start,
    end: endAfter(oldStop.start, alternative),
    reason: 'Indoor swap because of rain',
  }
  forgetChangedModes(before)
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
        end: endAfter(stop.start, alternative),
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
const replanButton = ref(null)
let savedCopy = null // the plan as it was before editing, for Discard
const dayStart = ref('10:00') // when the first stop begins

// Give every stop a new start and end, in order, keeping each one's duration.
// The gap after each stop is the real travel time of the chosen (or fastest) mode.
function recalculateTimes() {
  let current = toMinutes(dayStart.value)
  itinerary.value.stops.forEach((stop, index) => {
    const duration = toMinutes(stop.end) - toMinutes(stop.start)
    stop.start = toTime(current)
    stop.end = toTime(current + duration)
    current = current + duration + travelMinutesAfter(index)
  })
}

// The group's chosen free time, e.g. { start: '15:00', end: '19:00' }, or null before one is picked
const freeTime = computed(() => {
  if (!group.value?.chosen_start || !group.value?.chosen_end) return null
  return {
    start: toSgKey(group.value.chosen_start).slice(11),
    end: toSgKey(group.value.chosen_end).slice(11),
  }
})
const timeError = ref('')
const timeNote = ref('') // says when a time change took stops out of the plan

// '01:00' -> minutes on the plan's day. When the free time runs past midnight,
// a time before it starts is the next morning, so it counts after 24:00.
function planMinutes(time) {
  const minutes = toMinutes(time)
  if (!freeTime.value) return minutes
  const from = toMinutes(freeTime.value.start)
  const overnight = toMinutes(freeTime.value.end) <= from
  return overnight && minutes < from ? minutes + 24 * 60 : minutes
}

// True when the day from `start` to `end` fits inside the group's free time
function fitsFreeTime(start, end) {
  if (!freeTime.value) return true
  let to = toMinutes(freeTime.value.end)
  if (to <= toMinutes(freeTime.value.start)) to += 24 * 60 // free time runs past midnight
  return planMinutes(start) >= toMinutes(freeTime.value.start) && planMinutes(end) <= to
}

function outsideFreeTimeMessage() {
  return `Pick a time within the group's free time (${freeTime.value.start}–${freeTime.value.end}).`
}

// The stops that still fit when the day ends at `end`. A stop that runs past it
// is cut short if it keeps at least half its time, otherwise it's left out too.
function stopsUntil(end) {
  const endMinutes = planMinutes(end)
  const kept = []
  for (const stop of itinerary.value.stops) {
    const start = planMinutes(stop.start)
    const finish = planMinutes(stop.end)
    if (finish <= endMinutes) {
      kept.push(stop)
    } else {
      if (endMinutes - start >= (finish - start) / 2) kept.push({ ...stop, end }) // shortened
      break // every later stop starts after this one, so it's past the end too
    }
  }
  return kept
}

// Keep only the stops that fit, and say how many were taken out
function useStops(kept) {
  const removed = itinerary.value.stops.length - kept.length
  itinerary.value.stops = kept
  timeError.value = ''
  timeNote.value = removed
    ? `${removed} ${removed === 1 ? "stop doesn't" : "stops don't"} fit any more, so ${removed === 1 ? 'it was' : 'they were'} moved to "Also voted for".`
    : ''
}

// A new start time moves every stop. A later start can push the last stops past the
// group's free time, so those are cut short or taken out, like an earlier end time.
function changeDayStart(event) {
  const start = event.target.value
  if (start === dayStart.value) return
  const before ={ dayStart: dayStart.value, stops: itinerary.value.stops.map((s) => ({ ...s })) }
  const putBack = (message) => {
    dayStart.value = before.dayStart
    itinerary.value.stops = before.stops
    event.target.value = before.dayStart
    timeError.value = message
  }
  if (!start) return putBack('')
  if (!fitsFreeTime(start, start)) return putBack(outsideFreeTimeMessage())
  dayStart.value = start
  recalculateTimes()
  if (!freeTime.value || !itinerary.value.stops.length) return useStops(itinerary.value.stops)
  const kept = stopsUntil(freeTime.value.end)
  if (!kept.length) {
    return putBack(`That's too late to fit the first stop before the group's free time ends at ${freeTime.value.end}.`)
  }
  useStops(kept)
}

// A later end time makes the last stop longer, but not past the group's free time.
// An earlier one cuts short or takes out the stops that no longer fit.
function changeDayEnd(event) {
  const stops = itinerary.value.stops
  const end = event.target.value
  if (end === endTime.value) return
  const putBack = (message) => {
    event.target.value = endTime.value
    timeError.value = message
  }
  if (!stops.length || !end) return putBack('')
  if (!fitsFreeTime(startTime.value, end)) return putBack(outsideFreeTimeMessage())
  if (planMinutes(end) >= planMinutes(stops.at(-1).end)) {
    stops.at(-1).end = end
    return useStops(stops)
  }
  const kept = stopsUntil(end)
  if (!kept.length) {
    return putBack(`That's too early to fit the first stop, which starts at ${stops[0].start}.`)
  }
  useStops(kept)
}

function startEditing() {
  savedCopy = JSON.parse(JSON.stringify(itinerary.value))
  dayStart.value = itinerary.value.stops[0]?.start || '10:00'
  timeError.value = ''
  timeNote.value = ''
  isEditing.value = true
}

function discardChanges() {
  isEditing.value = false
  timeError.value = ''
  timeNote.value = ''
  dayStart.value = savedCopy.stops[0]?.start || '10:00'
  itinerary.value = savedCopy
}

const saving = ref(false)
const saveError = ref('')
const saveConflict = ref(false)

// Save the plan for this group (creates the row the first time, updates it after)
async function saveChanges() {
  if (saving.value) return false
  saving.value = true
  saveError.value = ''
  saveConflict.value = false
  try {
    await nextTick()
    let pending
    do {
      pending = travelPromise
      await pending
    } while (pending !== travelPromise)
    if (disposed || user.value?.id !== loadedUserId) throw new Error('Your account changed.')
    if (travelFailed.value) {
      saveError.value = "Some travel times couldn't be checked. Retry them before saving."
      return false
    }
    // Only save the fields from the brief. Name, photo etc. come from the activity.
    const stopsToSave = itinerary.value.stops.map((s) => ({
      activity_id: s.activity_id,
      start: s.start,
      end: s.end,
      cost: s.cost,
      reason: s.reason,
      travel_mode: s.travel_mode || null,
    }))
    saveController = new AbortController()
    const { data, error } = await requestWithTimeout((signal) =>
      supabase.rpc('save_group_itinerary', {
        p_group_id: groupId,
        p_expected_revision: savedRevision,
        p_expected_user_id: loadedUserId,
        p_stops: stopsToSave,
      }).abortSignal(signal),
      saveController,
    )
    if (error) throw error
    savedRevision = data
    isEditing.value = false // only leave edit mode if it worked
    return true
  } catch (error) {
    console.log(error)
    saveConflict.value = error?.code === '40001'
    saveError.value = saveConflict.value
      ? 'The plan or group time changed. Your edits are still here. Load the latest plan before saving.'
      : "Couldn't save the plan. Please try again."
    return false
  } finally {
    saving.value = false
  }
}

async function reloadLatestPlan() {
  if (isEditing.value && !confirm('Load the latest plan and discard your unsaved edits?')) return
  const query = { ...route.query }
  delete query.replan
  await router.replace({ query })
  isEditing.value = false
  await loadPage()
}

// A stop's travel_mode is for the journey to the stop after it. When that next stop
// changes, forget the choice so the new journey uses its own fastest mode.
function forgetChangedModes(before) {
  const nextOf = {}
  before.forEach((stop, i) => (nextOf[stop.activity_id] = before[i + 1]?.activity_id))
  const stops = itinerary.value.stops
  stops.forEach((stop, i) => {
    if (nextOf[stop.activity_id] !== stops[i + 1]?.activity_id) delete stop.travel_mode
  })
}

function removeStop(index) {
  const before = [...itinerary.value.stops]
  itinerary.value.stops.splice(index, 1) // remove 1 item at this position
  forgetChangedModes(before)
  recalculateTimes()
}

// direction is -1 (up) or +1 (down)
function moveStop(index, direction) {
  const stops = itinerary.value.stops
  const other = index + direction
  if (other < 0 || other >= stops.length) return // already at the top or bottom
  const before = [...stops]
  const temp = stops[index]
  stops[index] = stops[other]
  stops[other] = temp
  forgetChangedModes(before)
  recalculateTimes()
}

// Add a voted activity to the end of the plan, even if it goes over budget
function addStop(activity) {
  const before = [...itinerary.value.stops]
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
  forgetChangedModes(before)
  recalculateTimes()
}

// Throw away the current plan and build a new one from the chosen time.
// Re-plan is pressed in edit mode, and savedCopy still holds the plan from before
// editing, so Discard brings back the saved plan rather than the edits.
async function replan() {
  if (!isEditing.value) startEditing()
  timeError.value = ''
  timeNote.value = ''
  loading.value = true
  travelRequest += 1
  travelLoading.value = false
  travelPromise = Promise.resolve()
  saveError.value = ''
  try {
    await buildPlan()
  } catch {
    saveError.value = "Couldn't rebuild the plan. Please try again."
  } finally {
    loading.value = false
    await nextTick()
    replanButton.value?.focus()
  }
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

const ACTIVITY_FIELDS =
  'name, image_url, price_per_person, indoor, opening_hours, duration_min, address, lat, lng'

// A row from the activities table -> what a stop or "Also voted for" item needs
function toPlanActivity(id, a) {
  return {
    activity_id: id,
    name: a.name,
    image_url: a.image_url || '',
    cost: a.price_per_person ?? 0,
    indoor: a.indoor,
    opening_hours: a.opening_hours,
    address: a.address || '',
    lat: a.lat,
    lng: a.lng,
    duration_min: a.duration_min || 60,
  }
}

// Load the activities in a saved plan by their ids, not through votes,
// so a stop keeps its name, address and hours even when nobody votes for it any more
async function loadPlanActivities(stops) {
  const ids = [...new Set(stops.map((s) => s.activity_id))]
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('activities')
    .select('id, ' + ACTIVITY_FIELDS)
    .in('id', ids)
  if (error) throw error
  return data.map((a) => toPlanActivity(a.id, a))
}

// Turn saved stops back into full stops by adding each activity's details (name, photo...).
// Stops the group has since voted down (more downs than ups) are left out.
function useSavedPlan(saved, activities) {
  const stops = saved.stops
    .map((s) => {
      const activity = activities.find((a) => a.activity_id === s.activity_id) || {}
      return { ...activity, ...s }
    })
    .filter((stop) => {
      const voted = allVotedActivities.value.find((a) => a.activity_id === stop.activity_id)
      return !(voted?.votes < 0)
    })
  const date = group.value?.chosen_start ? toSgKey(group.value.chosen_start).slice(0, 10) : ''
  itinerary.value = { date, total_cost: saved.total_cost, stops }
  dayStart.value = stops[0]?.start || dayStart.value
}

// Load this group's votes, add them up per activity, and keep the ones with more ups than downs
async function loadVotes() {
  const { data, error } = await supabase
    .from('votes')
    .select('activity_id, value, activities(' + ACTIVITY_FIELDS + ')')
    .eq('group_id', groupId)
  if (error) throw error

  const byActivity = {} // activity_id -> the activity, with its vote total
  for (const vote of data) {
    if (!byActivity[vote.activity_id]) {
      if (!vote.activities) continue
      byActivity[vote.activity_id] = { ...toPlanActivity(vote.activity_id, vote.activities), votes: 0 }
    }
    byActivity[vote.activity_id].votes += vote.value
  }

  allVotedActivities.value = Object.values(byActivity)
  votedActivities.value = allVotedActivities.value.filter((a) => a.votes > 0)
}

// Fill the chosen time with the most-voted activities that fit the time, opening hours and budget
async function buildPlan() {
  if (!group.value?.chosen_start) {
    itinerary.value = null // no time picked yet -> empty state
    return
  }
  const start = toSgKey(group.value.chosen_start) // '2026-10-24T10:00'
  const end = toSgKey(group.value.chosen_end)
  const endMinutes = toMinutes(end.slice(11)) // '16:00' -> 960

  const sorted = [...votedActivities.value].sort((a, b) => b.votes - a.votes)
  const stops = []
  const legs = {}
  let current = toMinutes(start.slice(11))
  let spent = 0

  for (const activity of sorted) {
    if (current + activity.duration_min > endMinutes || spent + activity.cost > budget.value)
      continue
    const previous = stops.at(-1)
    let arrival = current
    let options
    if (previous) {
      options = await requestWithTimeout(() =>
        fetchTravelOptions(
          placeOf(previous),
          placeOf(activity),
          start.slice(0, 10) + 'T' + previous.end,
        ),
      )
      const available = options.filter((option) => option.available)
      if (!available.length) throw new Error('Travel times are unavailable right now.')
      arrival += Math.min(...available.map((option) => option.durationMinutes))
    }
    const finish = arrival + activity.duration_min
    if (finish > endMinutes) continue // runs past the chosen end time
    if (getVisitHoursWarnings(activity.opening_hours, start.slice(0, 10), arrival, finish).length)
      continue
    if (previous) legs[legKey(previous, activity)] = { options }
    stops.push({
      activity_id: activity.activity_id,
      name: activity.name,
      image_url: activity.image_url,
      start: toTime(arrival),
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
    current = finish
  }

  travelByLeg.value = legs
  itinerary.value = { date: start.slice(0, 10), total_cost: spent, stops }
  dayStart.value = stops[0]?.start || dayStart.value
}

// Load an existing plan, or build and save one before showing it.
async function loadPage() {
  loading.value = true
  travelRequest += 1
  travelLoading.value = false
  travelPromise = Promise.resolve()
  errorMessage.value = ''
  saveError.value = ''
  saveConflict.value = false
  try {
    await loadGroup()
    await loadVotes()
    const saved = await loadSavedPlan()
    const rebuild = route.query.replan === '1'
    if (saved && !rebuild) {
      useSavedPlan(saved, await loadPlanActivities(saved.stops)) // the group already has a plan: show it
      await loadTravel()
    } else {
      await buildPlan()
    }
    if (itinerary.value) {
      if ((!saved || rebuild) && !(await saveChanges())) {
        throw new Error('Generated plan could not be saved.')
      }
      if (rebuild) {
        const query = { ...route.query }
        delete query.replan
        await router.replace({ query })
      }
      loadWeather()
    }
  } catch (error) {
    console.log(error)
    errorMessage.value = saveError.value || "Couldn't load the plan. Please try again."
  } finally {
    loading.value = false
  }
}

onMounted(loadPage)
// ----- Travel between stops (OneMap, through the onemap-route Edge Function) -----
const travelByLeg = ref({}) // 'fromId>toId' -> { loading: true } or { options } or { error }
const travelLoading = ref(false)
let travelRequest = 0
let travelPromise = Promise.resolve()

function legKey(from, to) {
  return from.activity_id + '>' + to.activity_id
}

// The travel after the stop at this position, or null for the last stop
function legAfter(index) {
  const stops = itinerary.value.stops
  if (index >= stops.length - 1) return null
  return travelByLeg.value[legKey(stops[index], stops[index + 1])] || { loading: true }
}

// Minutes from stop `index` to the next one: the chosen mode's real time,
// or the fastest mode's, or 30 minutes while we don't know yet
function travelMinutesAfter(index) {
  const stops = itinerary.value.stops
  if (index >= stops.length - 1) return 0
  const options = travelByLeg.value[legKey(stops[index], stops[index + 1])]?.options
  return travelMinutes(options, stops[index].travel_mode)
}

function travelMinutes(options, mode) {
  const available = (options || []).filter((option) => option.available)
  if (available.length === 0) return TRAVEL_MINUTES
  const chosen = available.find((option) => option.mode === mode)
  const fastest = available.reduce((best, option) =>
    option.durationMinutes < best.durationMinutes ? option : best,
  )
  return (chosen || fastest).durationMinutes
}

// True when a journey between two stops has no real travel time (the request failed or
// found no route). The times after it are only a 30-minute guess, so the plan can't be saved.
const travelFailed = computed(() => {
  const stops = itinerary.value?.stops || []
  return stops.slice(1).some((stop, i) => {
    const leg = travelByLeg.value[legKey(stops[i], stop)]
    return leg && !leg.loading && !leg.options?.some((option) => option.available)
  })
})

// A tab was clicked in edit mode: remember the choice and move the later stops
function chooseTravelMode(index, mode) {
  itinerary.value.stops[index].travel_mode = mode
  recalculateTimes()
}

// What the Edge Function needs to find a stop: saved coordinates, or its address and name
function placeOf(stop) {
  if (stop.lat != null && stop.lng != null) return { lat: stop.lat, lng: stop.lng }
  return { address: stop.address || '', name: stop.name || '' }
}

// Load the travel options for every pair of stops, one pair at a time
function loadTravel() {
  const request = ++travelRequest
  const plan = itinerary.value
  const stops = (plan?.stops || []).map((stop) => ({ ...stop }))
  const retime = isEditing.value
  const legs = {}
  let current = toMinutes(dayStart.value)
  const currentRequest = () => !disposed && request === travelRequest && plan === itinerary.value
  travelLoading.value = true
  travelByLeg.value = {}
  travelPromise = (async () => {
    try {
      for (let i = 0; i < stops.length; i++) {
        const from = stops[i]
        if (retime) {
          const duration = toMinutes(from.end) - toMinutes(from.start)
          from.start = toTime(current)
          from.end = toTime(current + duration)
        }
        if (i === stops.length - 1) break
        const to = stops[i + 1]
        const key = legKey(from, to)
        try {
          const options = await requestWithTimeout(() =>
            fetchTravelOptions(placeOf(from), placeOf(to), plan.date + 'T' + from.end),
          )
          if (!currentRequest()) return
          legs[key] = { options }
        } catch (error) {
          if (!currentRequest()) return
          legs[key] = { error: error.message }
        }
        current = toMinutes(from.end) + travelMinutes(legs[key].options, from.travel_mode)
      }
      if (!currentRequest()) return
      travelByLeg.value = legs
      if (retime) stops.forEach((stop, index) => {
        plan.stops[index].start = stop.start
        plan.stops[index].end = stop.end
      })
    } finally {
      if (currentRequest()) travelLoading.value = false
    }
  })()
  return travelPromise
}

// Reload travel when the stops or their order change (new plan, move, remove, swap)
watch(
  () => JSON.stringify([dayStart.value, itinerary.value?.date,
    itinerary.value?.stops.map((stop) => [stop.activity_id, stop.travel_mode])]),
  () => { if (!loading.value) loadTravel() },
)

onUnmounted(() => {
  disposed = true
  travelRequest += 1
  saveController?.abort()
})
</script>

<template>
  <!-- Icons in this tab are adapted from Feather Icons (MIT licence), https://feathericons.com -->
  <div class="itinerary-tab" data-testid="group-itinerary-tab">
    <div class="tab-intro">
      <h2 class="h5 fw-bold mb-1">Itinerary</h2>
      <p class="text-secondary mb-0">Your day, planned from the group's votes and free time.</p>
    </div>
    <ItineraryLoadingCar v-if="loading" />
    <div v-else-if="errorMessage" class="alert alert-danger" role="alert" data-testid="itinerary-error">
      <p>{{ errorMessage }}</p>
      <button
        class="btn btn-outline-danger rounded-pill px-4"
        data-testid="itinerary-retry"
        @click="saveConflict ? reloadLatestPlan() : loadPage()"
      >
        {{ saveConflict ? 'Load latest plan' : 'Try again' }}
      </button>
    </div>

    <!-- No plan yet -->
    <div v-else-if="!itinerary" class="empty-plan" data-testid="itinerary-empty">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16" />
        </svg>
      </div>
      <p class="mb-3">No plan yet. Pick a time on the Availability tab, then press Plan.</p>
      <RouterLink :to="{ name: 'group-availability' }" class="btn btn-dark rounded-pill px-4">
        Go to Availability
      </RouterLink>
    </div>

    <!-- There is a plan -->
    <fieldset v-else class="border-0 p-0 m-0 w-100" :disabled="saving" data-testid="itinerary-plan">
      <p v-if="weatherLoading" class="text-secondary small">Checking the weather...</p>
      <div v-else-if="weather" class="info-banner" data-testid="itinerary-weather">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
        <span>
          {{ weather.day }}: {{ weather.forecast.summary }}, {{ weather.temperature.low }}–{{
            weather.temperature.high
          }}°C
        </span>
      </div>
      <div v-else class="info-banner muted" data-testid="itinerary-weather-unavailable">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
        <span>Forecast not available yet. Check back closer to the day.</span>
      </div>
      <dl class="summary-panel" data-testid="itinerary-summary">
        <div>
          <dt>Date</dt>
          <dd>{{ itinerary.date }}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <!-- Read-only text until Edit is pressed, so the panel doesn't change shape -->
          <dd class="d-flex align-items-center gap-1">
            <input
              :value="dayStart"
              type="time"
              class="time-input"
              :class="isEditing ? 'form-control' : 'form-control-plaintext'"
              :readonly="!isEditing"
              :min="freeTime?.start"
              :max="freeTime?.end"
              aria-label="Start time"
              aria-describedby="itinerary-time-error"
              data-testid="itinerary-start-time"
              @blur="changeDayStart"
              @keydown.enter="changeDayStart"
            />
            –
            <input
              :value="endTime"
              type="time"
              class="time-input"
              :class="isEditing ? 'form-control' : 'form-control-plaintext'"
              :readonly="!isEditing"
              :disabled="!itinerary.stops.length"
              :min="freeTime?.start"
              :max="freeTime?.end"
              aria-label="End time"
              aria-describedby="itinerary-time-error"
              data-testid="itinerary-end-time"
              @blur="changeDayEnd"
              @keydown.enter="changeDayEnd"
            />
          </dd>
        </div>
        <div data-testid="itinerary-cost">
          <dt>Cost per person</dt>
          <dd>
            <span :class="{ 'text-danger': isOverBudget }">${{ totalCost }}</span> of ${{ budget }}
            <span
              v-if="isOverBudget"
              class="badge rounded-pill text-bg-warning ms-1"
              data-testid="itinerary-over-budget"
            >
              Over budget
            </span>
          </dd>
        </div>
        <div>
          <dt>Stops</dt>
          <dd>{{ itinerary.stops.length }}</dd>
        </div>
      </dl>
      <p v-if="isEditing && timeError" id="itinerary-time-error" class="text-danger small"
        role="alert" data-testid="itinerary-time-error">{{ timeError }}</p>
      <p v-else-if="isEditing && timeNote" class="text-secondary small" role="status"
        data-testid="itinerary-time-note">{{ timeNote }}</p>
      <div class="edit-bar">
        <button
          v-if="!isEditing"
          class="btn btn-outline-dark rounded-pill px-4"
          data-testid="itinerary-edit"
          @click="startEditing"
        >
          Edit
        </button>
        <template v-else>
          <button
            class="btn btn-dark rounded-pill px-4"
            :disabled="saving || travelLoading || travelFailed"
            data-testid="itinerary-save"
            @click="saveChanges"
          >
            {{ saving ? 'Saving...' : 'Save changes' }}
          </button>
          <button
            class="btn btn-outline-dark rounded-pill px-3"
            data-testid="itinerary-discard"
            @click="discardChanges"
          >
            Discard
          </button>
          <button
            ref="replanButton"
            class="btn btn-outline-dark rounded-pill px-3"
            data-testid="itinerary-replan"
            @click="replan"
          >
            Re-plan
          </button>
        </template>
      </div>
      <p v-if="isEditing && travelLoading" role="status" class="text-secondary small">
        Checking travel times before saving…
      </p>
      <div v-else-if="travelFailed" role="alert" class="d-flex flex-wrap align-items-center gap-2 mb-3"
        data-testid="itinerary-travel-failed">
        <span class="text-danger small">
          Some travel times couldn't be checked{{ isEditing ? ", so the plan can't be saved yet" : '' }}.
        </span>
        <button type="button" class="btn btn-sm btn-outline-dark rounded-pill px-3"
          data-testid="itinerary-travel-retry" @click="loadTravel">Retry</button>
      </div>
      <p v-if="saveError" class="text-danger" data-testid="itinerary-save-error">{{ saveError }}</p>
      <button v-if="saveConflict" type="button" class="btn btn-outline-dark rounded-pill mb-3"
        data-testid="itinerary-load-latest" @click="reloadLatestPlan">Load latest plan</button>

      <ol class="timeline list-unstyled mb-0" data-testid="itinerary-timeline">
        <template v-for="(stop, index) in displayStops" :key="stop.original.activity_id">
          <li class="timeline-row" data-testid="itinerary-stop">
            <div class="timeline-time">
              <span class="clock">{{ formatClock(stop.start) }}</span>
              <span class="length">{{ formatHours(stop.start, stop.end) }}</span>
            </div>
            <div class="timeline-rail" aria-hidden="true"><span class="timeline-dot"></span></div>
            <div class="stop-card surface-card" :class="{ rainy: stop.isRainyView }">
            <div class="stop-body">
              <!-- Opens the activity's details, like the Activities tab. Not while editing,
                   so leaving the page can't throw away unsaved changes. -->
              <component
                :is="isEditing ? 'div' : 'RouterLink'"
                v-if="stop.image_url"
                :to="isEditing ? undefined : { name: 'activity-detail', params: { id: stop.activity_id } }"
                class="stop-photo-link"
                tabindex="-1"
                aria-hidden="true"
              >
                <img :src="stop.image_url" alt="" class="stop-photo" width="80" height="80" />
              </component>
              <div class="stop-main">
                <h3 class="stop-name">
                  {{ index + 1 }}.
                  <span v-if="isEditing">{{ stop.name }}</span>
                  <RouterLink
                    v-else
                    :to="{ name: 'activity-detail', params: { id: stop.activity_id } }"
                    data-testid="itinerary-stop-link"
                  >
                    {{ stop.name }}
                  </RouterLink>
                </h3>
                <p class="stop-range small text-secondary mb-1">{{ stop.start }}–{{ stop.end }}</p>
                <p class="mb-1 small fw-semibold">${{ stop.cost }} per person</p>
                <p class="text-secondary small mb-1">{{ stop.reason }}</p>
                <span
                  v-for="warning in getStopWarnings(stop)"
                  :key="warning"
                  class="badge rounded-pill text-bg-warning me-1"
                  data-testid="itinerary-stop-warning"
                >
                  {{ warning }}
                </span>
                <span
                  v-if="isRainy && !stop.original.indoor"
                  class="badge rounded-pill text-bg-warning me-1"
                  >Rain forecast</span
                >
                <div
                  v-if="stop.isRainyView"
                  class="small rain-note mt-1"
                  data-testid="itinerary-rain-alternative"
                >
                  🌧️ Instead of {{ stop.original.name }}
                  <button
                    v-if="isEditing"
                    class="btn btn-sm btn-outline-dark rounded-pill px-3 ms-2"
                    data-testid="itinerary-swap"
                    @click="swapStop(index, getRainAlternative(stop.original))"
                  >
                    Swap
                  </button>
                </div>
              </div>
              <div
                v-if="getRainAlternative(stop.original)"
                class="form-check form-switch text-nowrap small rainy-toggle"
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
              <div v-if="isEditing" class="stop-controls">
                <button
                  class="icon-button"
                  :disabled="index === 0"
                  aria-label="Move up"
                  data-testid="itinerary-move-up"
                  @click="moveStop(index, -1)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
                </button>
                <button
                  class="icon-button danger"
                  aria-label="Remove stop"
                  data-testid="itinerary-remove"
                  @click="removeStop(index)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
                <button
                  class="icon-button"
                  :disabled="index === itinerary.stops.length - 1"
                  aria-label="Move down"
                  data-testid="itinerary-move-down"
                  @click="moveStop(index, 1)"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </div>
            </div>
            </div>
          </li>
          <li v-if="index < displayStops.length - 1" class="timeline-row travel-row">
            <div class="timeline-rail" aria-hidden="true"></div>
            <ItineraryTravelOptions
              :leg="legAfter(index)"
              :mode="itinerary.stops[index].travel_mode"
              :editable="isEditing"
              @choose="chooseTravelMode(index, $event)"
            />
          </li>
        </template>
      </ol>
      <div v-if="notInPlan.length" class="mt-4" data-testid="itinerary-not-in-plan">
        <h3 class="h6 fw-bold mb-2">Also voted for, but not in the plan</h3>
        <ul class="not-in-plan">
          <li
            v-for="activity in notInPlan"
            :key="activity.activity_id"
            class="d-flex flex-wrap align-items-center gap-2"
          >
            <span class="flex-grow-1">{{ activity.name }} (${{ activity.cost }})</span>
            <span class="reason-chip">{{ whyNotInPlan(activity) }}</span>
            <button
              v-if="isEditing"
              class="btn btn-sm btn-outline-dark rounded-pill px-3"
              data-testid="itinerary-add-stop"
              @click="addStop(activity)"
            >
              Add anyway
            </button>
          </li>
        </ul>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
/* Matches the Activities page: near-black accents, pill buttons, soft grey panels
   and white cards with a light shadow */
.tab-intro {
  margin-bottom: 1.25rem;
}

.itinerary-tab svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* No plan yet */
.empty-plan {
  padding: 2.5rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  text-align: center;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: var(--surface-2);
}

.empty-icon svg {
  width: 28px;
  height: 28px;
  color: var(--ink);
}

/* Weather line */
.info-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 1rem;
  padding: 12px 16px;
  border: 1px solid var(--bs-info-border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bs-info-bg-subtle);
  color: var(--bs-info-text-emphasis);
}

.info-banner.muted {
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--bs-secondary-color);
}

/* Date, time, cost and stops */
.summary-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.summary-panel dt {
  margin-bottom: 2px;
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
  font-weight: 600;
}

.summary-panel dd {
  margin: 0;
  color: var(--bs-emphasis-color);
  font-weight: 600;
}

.edit-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 1rem;
}

.edit-bar .btn {
  min-height: 44px;
}

/* Sized to the summary text so the panel doesn't jump when editing starts */
.time-input {
  width: auto;
  height: 1.75rem;
  padding: 0 4px;
  color: inherit;
  font-weight: 600;
  border-radius: var(--radius-md);
}

.time-input.form-control-plaintext {
  padding: 0;
}

/* No clock icon while the time is read-only */
.time-input.form-control-plaintext::-webkit-calendar-picker-indicator {
  display: none;
}

/* Timeline: start time and length on the left, a dot on a thin line, then the stop card */
.timeline-row {
  display: grid;
  grid-template-columns: 4.75rem 20px minmax(0, 1fr);
  column-gap: 12px;
}

.timeline-time {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-top: 14px;
  text-align: right;
  white-space: nowrap;
}

.timeline-time .clock {
  color: var(--bs-emphasis-color);
  font-size: 0.9rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.timeline-time .length {
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
}

/* The line runs the full height of every row, so it joins up between stops */
.timeline-rail {
  position: relative;
  grid-column: 2;
}

.timeline-rail::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: var(--line);
}

/* Start the line at the first dot and stop it at the last one */
.timeline-row:first-child .timeline-rail::before {
  top: 20px;
}

.timeline-row:last-child .timeline-rail::before {
  bottom: auto;
  height: 20px;
}

.timeline-dot {
  position: absolute;
  top: 14px;
  left: 50%;
  width: 14px;
  height: 14px;
  transform: translateX(-50%);
  border: 3px solid var(--bs-success);
  border-radius: 50%;
  background: var(--surface);
}

.travel-row > :last-child {
  grid-column: 3;
}

/* One stop on the timeline, styled like the activity cards */
.stop-card {
  grid-column: 3;
  padding: 16px;
}

.stop-card.rainy {
  border: 2px solid var(--bs-info-border-subtle);
}

.stop-body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 16px;
}

.stop-range {
  font-variant-numeric: tabular-nums;
}

.stop-photo {
  flex-shrink: 0;
  border-radius: var(--radius-md);
  object-fit: cover;
}

.stop-main {
  flex: 1 1 12rem;
  min-width: 0;
}

.stop-name {
  margin-bottom: 4px;
  color: var(--bs-emphasis-color);
  font-size: 1.05rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.stop-name a {
  color: inherit;
  text-decoration: none;
}

.stop-photo-link {
  display: block;
  flex-shrink: 0;
}

.rain-note {
  color: var(--bs-info-text-emphasis);
}

.rainy-toggle .form-check-input:checked {
  border-color: var(--ink);
  background-color: var(--ink);
}

/* Move up, remove and move down while editing */
.stop-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink);
}

.icon-button:hover:not(:disabled) {
  background: var(--surface-2);
}

.icon-button.danger {
  color: var(--bs-danger);
}

.icon-button:disabled {
  opacity: 0.4;
}

/* Voted-for activities that didn't fit */
.not-in-plan {
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.not-in-plan li {
  min-height: 52px;
  padding: 8px 12px;
}

.not-in-plan li + li {
  border-top: 1px solid var(--line);
}

.reason-chip {
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--bs-secondary-color);
  font-size: 0.8rem;
}

/* Phones: a narrower time column, and the edit buttons go in a row */
@media (max-width: 575.98px) {
  .timeline-row {
    grid-template-columns: 4rem 16px minmax(0, 1fr);
    column-gap: 8px;
  }

  .timeline-time .clock {
    font-size: 0.8rem;
  }

  .stop-controls {
    flex-direction: row;
    flex-basis: 100%;
    justify-content: flex-end;
  }
}
</style>
