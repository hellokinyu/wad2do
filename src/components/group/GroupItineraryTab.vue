<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { getGoogleVisitHours, HOURS_UNAVAILABLE, USUAL_HOURS_NOTE } from '@/lib/googleOpeningHours'
import { fetchTravelOptions } from '@/lib/travelOptions'
import { requestWithTimeout } from '@/lib/requestWithTimeout'
import { fetchForecasts, getSgToday } from '@/lib/weatherForecast'
import { useAuth } from '@/composables/useAuth'
import { getPrice, getWebsiteUrl } from '@/lib/activityDisplay'
import { formatPart } from '@/lib/groupDisplay'
import { departureAt, findFastestRoute, legKey, toMinutes, toTime } from '@/lib/routeOrder'
import ItineraryTravelOptions from '@/components/group/ItineraryTravelOptions.vue'
import ItineraryLoadingCar from '@/components/group/ItineraryLoadingCar.vue'

const TRAVEL_MINUTES = 30
const emit = defineEmits(['plan-saved'])
const itinerary = ref(null)
const loadingMessage = ref('Loading itinerary…')
const planSaved = ref(false)
const budget = computed(() => group.value?.budget_per_person ?? 0)
// The group's voted activities (loaded from Supabase by loadVotes)
const votedActivities = ref([])
// Every voted activity with its vote total, including ones with more downs than ups
const allVotedActivities = ref([])

// 20.299999999999997 -> 20.3, so adding prices can't leave stray decimals
function toCents(amount) {
  return Math.round(amount * 100) / 100
}

// Add up the cost of every stop
const totalCost = computed(() => {
  let total = 0
  for (const stop of itinerary.value.stops) {
    total += stop.cost ?? 0
  }
  return toCents(total)
})
const hasUnknownPrices = computed(() => itinerary.value?.stops.some((stop) => stop.cost === null))

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

// '09:00' -> '9:00 am', '12:10' -> '12:10 pm'
function formatClock(time) {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours % 24 >= 12 ? 'pm' : 'am'
  return (hours % 12 || 12) + ':' + String(minutes).padStart(2, '0') + ' ' + suffix
}

// '10:00', '11:00' -> '10:00 am – 11:00 am'
function formatClockRange(start, end) {
  return formatClock(start) + ' – ' + formatClock(end)
}

// '2026-10-30' -> 'Fri, 30 Oct 2026'. A saved plan with no group time has no date.
function formatPlanDate(date) {
  return date ? formatPart(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// The summary's read-only time. An empty plan has only a start, and its end draft is '-'.
const summaryTimeText = computed(() =>
  endDraft.value && endDraft.value !== '-'
    ? formatClockRange(startDraft.value, endDraft.value)
    : formatClock(startDraft.value),
)

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
  if (skippedHours.value[activity.activity_id]) return skippedHours.value[activity.activity_id]
  if (activity.cost === null) return 'Price unknown; cannot check the budget'
  const extra = toCents(totalCost.value + activity.cost - budget.value)
  if (extra > 0) return 'Over budget by $' + extra.toFixed(2)
  return "Doesn't fit the time or opening hours"
}

// How many activities Plan skipped because their live hours couldn't be checked, for the
// empty state. The lookup's cause isn't kept, so this can't say whether a limit was reached.
const unavailableHoursCount = computed(
  () => Object.values(skippedHours.value).filter((reason) => reason === 'Opening hours unavailable.').length,
)

// ----- The group (real data from Supabase) -----
const route = useRoute()
const router = useRouter()
const groupId = route.params.id // the :id in /groups/:id/itinerary
const { user } = useAuth()
const loadedUserId = user.value?.id
let savedRevision
let disposed = false
let saveController
let loadController
let hoursController = new AbortController()
let hoursRequests = new Map()
const liveHours = ref({})
const skippedHours = ref({})

function resetHours() {
  hoursController.abort()
  hoursController = new AbortController()
  hoursRequests = new Map()
  liveHours.value = {}
  skippedHours.value = {}
}

async function ensureHours(activity) {
  hoursController.signal.throwIfAborted()
  if (disposed || user.value?.id !== loadedUserId) throw new Error('Your account changed.')
  const id = activity.activity_id
  if (hoursRequests.has(id)) return hoursRequests.get(id)
  const controller = hoursController
  const pending = (async () => {
    let details = null
    const fetchedDate = getSgToday()
    if (activity.google_place_id) {
      try {
        const { data, error } = await requestWithTimeout(
          (signal) => supabase.functions.invoke('google-place-details', {
            body: { activityId: id },
            signal: AbortSignal.any([signal, controller.signal]),
          }),
          new AbortController(),
          15000,
        )
        if (!error && data && !data.error) {
          details = {
            currentOpeningHours: data.currentOpeningHours,
            regularOpeningHours: data.regularOpeningHours,
            attributions: (Array.isArray(data.attributions) ? data.attributions : [])
              .filter((item) => typeof item?.provider === 'string' && item.provider.trim())
              .map((item) => ({ name: item.provider, url: getWebsiteUrl({ website: item.providerUri }) })),
          }
        }
      } catch {
        // Failed lookups stay unavailable for this attempt; retries start with fresh hours.
      }
    }
    controller.signal.throwIfAborted()
    if (disposed || user.value?.id !== loadedUserId) throw new Error('Your account changed.')
    liveHours.value[id] = { details, fetchedDate }
  })()
  hoursRequests.set(id, pending)
  return pending
}

function visitHours(activity, date, start, end) {
  const result = liveHours.value[activity.activity_id]
  return getGoogleVisitHours(result?.details, date, start, end, result?.fetchedDate)
}

const group = ref(null) // { chosen_start, chosen_end, budget_per_person }
const loading = ref(true)
const errorMessage = ref('')

async function loadGroup(signal) {
  const { data, error } = await supabase
    .from('groups')
    .select('chosen_start, chosen_end, budget_per_person, plan_revision')
    .eq('id', groupId)
    .maybeSingle()
    .abortSignal(signal)
  signal.throwIfAborted()
  if (error) throw error
  group.value = data
  savedRevision = data?.plan_revision
  dayStart.value = data?.chosen_start ? toSgKey(data.chosen_start).slice(11) : '10:00'
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
    const forecasts = await fetchForecasts()

    // Find the day that matches our plan
    weather.value = forecasts.find((day) => day.date === itinerary.value.date) || null
  } catch (error) {
    console.log(error)
  } finally {
    weatherLoading.value = false
  }
}
// True once the plan's date has gone by in Singapore
const isPlanPast = computed(() => itinerary.value?.date < getSgToday())

// True when the forecast mentions showers, rain or thunder
const isRainy = computed(() => {
  if (!weather.value) return false
  const text = weather.value.forecast.text.toLowerCase()
  return text.includes('shower') || text.includes('rain') || text.includes('thunder')
})

// Offer rainy-day options when rain is forecast or there's no forecast yet, but not on a dry day
const offersRainOption = computed(
  () => !weatherLoading.value && !isPlanPast.value && (isRainy.value || !weather.value),
)

// An indoor activity the group voted for that isn't already in the plan
function getRainAlternative(stop) {
  if (stop.indoor || !offersRainOption.value) return null
  const usedIds = itinerary.value.stops.map((s) => s.activity_id)
  return votedActivities.value.find((a) => a.indoor && a.cost !== null && !usedIds.includes(a.activity_id)) || null
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
  return (itinerary.value?.stops || []).map((stop) => {
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
  if (!(stop.activity_id in liveHours.value)) return ['Checking opening hours…']
  const result = visitHours(
    stop,
    itinerary.value.date,
    toMinutes(stop.start),
    toMinutes(stop.end),
  )
  return result.warnings
}

function usesUsualHours(stop) {
  return visitHours(stop, itinerary.value.date, toMinutes(stop.start), toMinutes(stop.end)).provisional
}

const savedHoursSummary = computed(() => {
  const conflicts = []
  let checking = false
  let unavailable = false
  let provisional = false
  for (const stop of itinerary.value?.stops || []) {
    if (!(stop.activity_id in liveHours.value)) {
      checking = true
      continue
    }
    const { warnings, provisional: usesUsual } = visitHours(
      stop,
      itinerary.value.date,
      toMinutes(stop.start),
      toMinutes(stop.end),
    )
    provisional ||= usesUsual
    if (warnings.includes(HOURS_UNAVAILABLE)) unavailable = true
    else if (warnings.length) conflicts.push({ stop, warning: warnings.join(' ') })
  }
  return { conflicts, checking, unavailable, provisional }
})

async function focusStop(stop) {
  if (showingRainy.value.includes(stop.activity_id)) {
    toggleRainy(stop)
    await nextTick()
  }
  const heading = document.getElementById('itinerary-stop-' + stop.activity_id)
  heading?.focus({ preventScroll: true })
  heading?.scrollIntoView({ block: 'center' })
}

// '24:30' -> '00:30'. Stops after midnight keep counting past 24:00 so their order and
// lengths stay simple, but people should see, and time inputs need, a normal clock time.
function clockTime(time) {
  const minutes = toMinutes(time)
  return Number.isNaN(minutes) ? time : toTime(minutes % 1440)
}

// ----- Edit mode -----
const isEditing = ref(false)
const replanButton = ref(null)
let savedCopy = null // the plan as it was before editing, for Discard
const dayStart = ref('10:00') // when the first stop begins
const startField = ref(null)
const endField = ref(null)
const startDraft = ref(dayStart.value)
const endDraft = ref('-')

// Background weather/travel updates must not replace a time the user is still typing.
watch(
  [dayStart, () => itinerary.value ? endTime.value : '', isEditing],
  ([start, end, editing], [previousStart, previousEnd]) => {
    if (!editing || document.activeElement !== startField.value || startDraft.value === clockTime(previousStart ?? ''))
      startDraft.value = clockTime(start)
    if (!editing || document.activeElement !== endField.value || endDraft.value === clockTime(previousEnd ?? ''))
      endDraft.value = clockTime(end)
  },
  { immediate: true },
)

const hasUnsavedChanges = computed(() =>
  user.value?.id === loadedUserId && isEditing.value &&
  (startDraft.value !== clockTime(dayStart.value) || endDraft.value !== clockTime(endTime.value) ||
    JSON.stringify(itinerary.value?.stops) !== JSON.stringify(savedCopy?.stops)),
)

onBeforeRouteLeave(() => {
  if (hasUnsavedChanges.value && !window.confirm('Leave and discard your unsaved itinerary changes?'))
    return false
  loadController?.abort()
  hoursController.abort()
})

function warnBeforeUnload(event) {
  if (!hasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', warnBeforeUnload))

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
  return `Pick a time within the group's free time (${formatClockRange(freeTime.value.start, freeTime.value.end)}).`
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
      if (endMinutes - start >= (finish - start) / 2) kept.push({ ...stop, end: toTime(endMinutes) }) // shortened
      break // every later stop starts after this one, so it's past the end too
    }
  }
  return kept
}

// Keep only the stops that fit, and say how many were taken out
function useStops(kept) {
  const removed = itinerary.value.stops.length - kept.length
  itinerary.value.stops = kept
  endDraft.value = clockTime(endTime.value)
  timeError.value = ''
  timeNote.value = removed
    ? `${removed} ${removed === 1 ? "stop doesn't" : "stops don't"} fit any more, so ${removed === 1 ? 'it was' : 'they were'} moved to "Also voted for".`
    : ''
}

// A new start time moves every stop. A later start can push the last stops past the
// group's free time, so those are cut short or taken out, like an earlier end time.
function changeDayStart(event) {
  const typed = event.target.value
  if (typed === clockTime(dayStart.value)) return
  const before ={ dayStart: dayStart.value, stops: itinerary.value.stops.map((s) => ({ ...s })) }
  const putBack = (message) => {
    dayStart.value = before.dayStart
    itinerary.value.stops = before.stops
    event.target.value = startDraft.value = clockTime(before.dayStart)
    timeError.value = message
  }
  if (!typed) return putBack('')
  const start = toTime(planMinutes(typed))
  if (!fitsFreeTime(start, start)) return putBack(outsideFreeTimeMessage())
  dayStart.value = start
  recalculateTimes()
  if (!freeTime.value || !itinerary.value.stops.length) return useStops(itinerary.value.stops)
  const kept = stopsUntil(freeTime.value.end)
  if (!kept.length) {
    return putBack(`That's too late to fit the first stop before the group's free time ends at ${formatClock(freeTime.value.end)}.`)
  }
  useStops(kept)
}

// A later end time makes the last stop longer, but not past the group's free time.
// An earlier one cuts short or takes out the stops that no longer fit.
function changeDayEnd(event) {
  const stops = itinerary.value.stops
  const end = event.target.value
  if (end === clockTime(endTime.value)) return
  const putBack = (message) => {
    event.target.value = endDraft.value = clockTime(endTime.value)
    timeError.value = message
  }
  if (!stops.length || !end) return putBack('')
  if (!fitsFreeTime(startTime.value, end)) return putBack(outsideFreeTimeMessage())
  if (planMinutes(end) >= planMinutes(stops.at(-1).end)) {
    stops.at(-1).end = toTime(planMinutes(end))
    return useStops(stops)
  }
  const kept = stopsUntil(end)
  if (!kept.length) {
    return putBack(`That's too early to fit the first stop, which starts at ${formatClock(stops[0].start)}.`)
  }
  useStops(kept)
}

function startEditing() {
  savedCopy = JSON.parse(JSON.stringify(itinerary.value))
  dayStart.value = itinerary.value.stops[0]?.start || freeTime.value?.start || '10:00'
  timeError.value = ''
  timeNote.value = ''
  isEditing.value = true
}

function discardChanges() {
  isEditing.value = false
  timeError.value = ''
  timeNote.value = ''
  dayStart.value = savedCopy.stops[0]?.start || freeTime.value?.start || '10:00'
  itinerary.value = savedCopy
}

const saving = ref(false)
const saveError = ref('')
const saveConflict = ref(false)

// Save the plan for this group (creates the row the first time, updates it after)
async function saveChanges() {
  if (saving.value || saveConflict.value) return false
  if (hasUnknownPrices.value) {
    saveError.value = 'Remove stops with unknown prices before saving so the budget can be checked.'
    return false
  }
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
    await Promise.all(itinerary.value.stops.map(ensureHours))
    if (disposed || user.value?.id !== loadedUserId) throw new Error('Your account changed.')
    if (travelFailed.value) {
      saveError.value = "Some travel times couldn't be checked. Retry them before saving."
      return false
    }
    if (itinerary.value.stops.some((stop) => !fitsFreeTime(stop.start, stop.end))) {
      saveError.value = outsideFreeTimeMessage()
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
    planSaved.value = itinerary.value.stops.length > 0
    emit('plan-saved')
    return true
  } catch (error) {
    console.log(error)
    saveConflict.value = error?.code === 'PT409' || error?.code === '40001'
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

// Editing the plan moves like "Update rankings" on the Activities tab (FLIP: measure where
// each card is, make the change, then slide every card from its old spot to its new one).
// The times and dots stay put, since they belong to the slot rather than the stop. A card
// moving up lifts toward you and passes over; the one it swaps with sinks back underneath.
const timelineRef = ref(null)
const GLIDE_MS = 700
const EASE_OUT_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Where each stop card and travel row is on screen, by its data-flip key
function getPlaces() {
  const places = {}
  for (const el of timelineRef.value?.querySelectorAll('[data-flip]') ?? []) {
    places[el.dataset.flip] = el.getBoundingClientRect().top
  }
  return places
}

// A copy of a removed card, left where the card was so it can fade out. The stop itself is
// gone straight away, so a quick Save can't keep it.
function makeGhost(card) {
  const box = card.getBoundingClientRect()
  const list = timelineRef.value.getBoundingClientRect()
  const ghost = card.cloneNode(true)
  ghost.removeAttribute('data-flip')
  // Only a picture: no duplicate ids, labels' targets or test ids from the copied card
  for (const el of [ghost, ...ghost.querySelectorAll('[id], [for], [data-testid]')]) {
    el.removeAttribute('id')
    el.removeAttribute('for')
    el.removeAttribute('data-testid')
  }
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  Object.assign(ghost.style, {
    position: 'absolute',
    top: box.top - list.top + 'px',
    left: box.left - list.left + 'px',
    width: box.width + 'px',
    height: box.height + 'px',
    margin: '0',
    zIndex: 0,
    pointerEvents: 'none',
  })
  return ghost
}

// Runs change() (which edits the stops), then animates the cards to their new places.
// moves: data-flip key -> 1 for a card going up the plan, -1 for one going down.
// leaving: the data-flip key of a card being removed, which fades out.
async function animateStops(change, moves = {}, leaving = '') {
  if (!timelineRef.value || prefersReducedMotion()) return change()
  // Measured mid-glide if a card is still moving, so a quick second tap carries on smoothly
  const before = getPlaces()
  const leavingCard = leaving && timelineRef.value.querySelector(`[data-flip="${leaving}"]`)
  const ghost = leavingCard && makeGhost(leavingCard)
  change()
  await nextTick()

  if (ghost && timelineRef.value) {
    timelineRef.value.append(ghost)
    const fade = ghost.animate([{ opacity: 1 }, { opacity: 0, scale: '0.96' }], {
      duration: 250,
      easing: 'ease-in',
      fill: 'forwards',
    })
    fade.onfinish = fade.oncancel = () => ghost.remove()
  }

  for (const el of timelineRef.value.querySelectorAll('[data-flip]')) {
    el.getAnimations().forEach((animation) => animation.cancel())
    const key = el.dataset.flip
    if (before[key] === undefined) {
      // A stop that was just added rises into place
      el.animate(
        [{ opacity: 0, transform: 'translateY(16px)', scale: '0.97' }, { opacity: 1 }],
        { duration: 450, easing: EASE_OUT_EXPO },
      )
      continue
    }
    const dy = before[key] - el.getBoundingClientRect().top
    if (dy === 0) continue
    const move = moves[key] || 0
    el.style.position = 'relative'
    el.style.zIndex = move > 0 ? 3 : move < 0 ? 1 : 2
    const glide = el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      duration: GLIDE_MS,
      easing: EASE_OUT_EXPO,
    })
    glide.onfinish = glide.oncancel = () => {
      el.style.position = ''
      el.style.zIndex = ''
    }

    if (!move) continue
    // `scale` is separate from `transform`, so this runs on top of the glide
    const rest = { scale: '1', opacity: 1, boxShadow: getComputedStyle(el).boxShadow }
    const away =
      move > 0
        ? { scale: '1.025', opacity: 1, boxShadow: '0 28px 56px rgb(0 0 0 / 35%)' }
        : { scale: '0.975', opacity: 0.72, boxShadow: rest.boxShadow }
    el.animate([rest, { ...away, offset: 0.3 }, rest], {
      duration: GLIDE_MS,
      easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    })
  }
}

// The card fades out while the stops below glide up to close the gap
function removeStop(index) {
  const leaving = 'stop-' + itinerary.value.stops[index].activity_id
  animateStops(
    () => {
      const before = [...itinerary.value.stops]
      itinerary.value.stops.splice(index, 1) // remove 1 item at this position
      forgetChangedModes(before)
      recalculateTimes()
    },
    {},
    leaving,
  )
}

// direction is -1 (up) or +1 (down)
function moveStop(index, direction) {
  const stops = itinerary.value.stops
  const other = index + direction
  if (other < 0 || other >= stops.length) return // already at the top or bottom
  const moves = {
    ['stop-' + stops[index].activity_id]: -direction,
    ['stop-' + stops[other].activity_id]: direction,
  }
  animateStops(() => {
    const before = [...stops]
    const temp = stops[index]
    stops[index] = stops[other]
    stops[other] = temp
    forgetChangedModes(before)
    recalculateTimes()
  }, moves)
}

// Add a voted activity to the end of the plan, even if it goes over budget
function addStop(activity) {
  if (activity.cost === null) return
  animateStops(() => appendStop(activity))
}

function appendStop(activity) {
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
    google_place_id: activity.google_place_id,
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
  loadingMessage.value = 'Building your itinerary…'
  travelRequest += 1
  travelLoading.value = false
  travelPromise = Promise.resolve()
  saveError.value = ''
  resetHours()
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
async function loadSavedPlan(signal) {
  const { data, error } = await supabase
    .from('itineraries')
    .select('stops, total_cost')
    .eq('group_id', groupId)
    .maybeSingle()
    .abortSignal(signal)
  signal.throwIfAborted()
  if (error) throw error
  return data
}

const ACTIVITY_FIELDS =
  'name, image_url, price_per_person, indoor, google_place_id, duration_min, address, lat, lng'

// A row from the activities table -> what a stop or "Also voted for" item needs
function toPlanActivity(id, a) {
  return {
    activity_id: id,
    name: a.name,
    image_url: a.image_url || '',
    cost: getPrice(a.price_per_person),
    indoor: a.indoor,
    google_place_id: a.google_place_id,
    address: a.address || '',
    lat: a.lat,
    lng: a.lng,
    duration_min: a.duration_min || 60,
  }
}

// Load saved stops by id so their details survive the removal of all their votes.
async function loadPlanActivities(stops, signal) {
  const ids = [...new Set(stops.map((s) => s.activity_id))]
  if (!ids.length) return []
  const { data, error } = await supabase
    .from('activities')
    .select('id, ' + ACTIVITY_FIELDS)
    .in('id', ids)
    .abortSignal(signal)
  signal.throwIfAborted()
  if (error) throw error
  return data.map((a) => toPlanActivity(a.id, a))
}

// Turn saved stops back into full stops by adding each activity's details (name, photo...).
// Stops the group has since voted down (more downs than ups) are left out.
function useSavedPlan(saved, activities) {
  const stops = saved.stops
    .map((s) => {
      const activity = activities.find((a) => a.activity_id === s.activity_id) || {}
      return { ...activity, ...s, cost: activity.activity_id && activity.cost === null ? null : getPrice(s.cost) }
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
async function loadVotes(signal) {
  const { data, error } = await supabase
    .from('votes')
    .select('activity_id, value, activities(' + ACTIVITY_FIELDS + ')')
    .eq('group_id', groupId)
    .abortSignal(signal)
  signal.throwIfAborted()
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

// Fill the chosen time with the most-voted activities that fit the time, opening hours and budget,
// then put those stops in the order with the least travel
async function buildPlan() {
  const controller = hoursController
  if (!group.value?.chosen_start) {
    itinerary.value = null // no time picked yet -> empty state
    return
  }
  const start = toSgKey(group.value.chosen_start) // '2026-10-24T10:00'
  const date = start.slice(0, 10)
  const startMinutes = toMinutes(start.slice(11))
  // Counted from the start of the plan's day, so a time past midnight is still later: 01:00 -> 1500
  const endMinutes =
    startMinutes + (new Date(group.value.chosen_end) - new Date(group.value.chosen_start)) / 60000

  const sorted = [...votedActivities.value].sort((a, b) => b.votes - a.votes)
  let stops = []
  let legs = {}
  let current = startMinutes
  let spent = 0

  for (const activity of sorted) {
    if (activity.cost === null || current + activity.duration_min > endMinutes || spent + activity.cost > budget.value)
      continue
    const previous = stops.at(-1)
    await ensureHours(activity)
    controller.signal.throwIfAborted()
    if (visitHours(activity, start.slice(0, 10), current, current + activity.duration_min)
      .warnings.includes(HOURS_UNAVAILABLE)) {
      skippedHours.value[activity.activity_id] = HOURS_UNAVAILABLE
      continue
    }
    let arrival = current
    let options
    if (previous) {
      options = await requestWithTimeout(() =>
        fetchTravelOptions(placeOf(previous), placeOf(activity), departureAt(date, current)),
      )
      const available = options.filter((option) => option.available)
      controller.signal.throwIfAborted()
      if (!available.length) throw new Error('Travel times are unavailable right now.')
      arrival += Math.min(...available.map((option) => option.durationMinutes))
    }
    const finish = arrival + activity.duration_min
    if (finish > endMinutes) continue // runs past the chosen end time
    const hours = visitHours(activity, date, arrival, finish)
    if (hours.warnings.length) {
      skippedHours.value[activity.activity_id] = hours.warnings.join(' ')
      continue
    }
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
      google_place_id: activity.google_place_id,
      address: activity.address,
      lat: activity.lat,
      lng: activity.lng,
    })
    spent += activity.cost
    current = finish
  }

  // The vote order above already works, so a failed search only misses a shorter route
  try {
    const fastest = await requestWithTimeout(() =>
      findFastestRoute(stops, {
        date,
        start: startMinutes,
        end: endMinutes,
        getHoursWarnings: (stop, date, arrival, finish) => visitHours(stop, date, arrival, finish).warnings,
        getOptions: (from, to, departure) => {
          controller.signal.throwIfAborted()
          return fetchTravelOptions(placeOf(from), placeOf(to), departure)
        },
      }),
    )
    if (fastest) ({ stops, legs } = fastest)
  } catch (error) {
    console.log(error)
  }

  controller.signal.throwIfAborted()
  travelByLeg.value = legs
  itinerary.value = { date, total_cost: spent, stops }
  dayStart.value = stops[0]?.start || dayStart.value
}

// Load an existing plan, or build and save one before showing it.
async function loadPage() {
  loadController?.abort()
  resetHours()
  const controller = new AbortController()
  loadController = controller
  const currentLoad = () => !disposed && loadController === controller &&
    !controller.signal.aborted && user.value?.id === loadedUserId
  loading.value = true
  loadingMessage.value = 'Loading itinerary…'
  planSaved.value = false
  travelRequest += 1
  travelLoading.value = false
  travelPromise = Promise.resolve()
  errorMessage.value = ''
  saveError.value = ''
  saveConflict.value = false
  try {
    const rebuild = route.query.replan === '1'
    const { saved, activities } = await requestWithTimeout(async (signal) => {
      await loadGroup(signal)
      await loadVotes(signal)
      const saved = await loadSavedPlan(signal)
      const activities = saved && !rebuild ? await loadPlanActivities(saved.stops, signal) : []
      return { saved, activities }
    }, controller)
    if (!currentLoad()) return
    planSaved.value = !!saved?.stops.length
    if (saved && !rebuild) {
      useSavedPlan(saved, activities) // the group already has a plan: show it
      await Promise.all(itinerary.value.stops.map(ensureHours))
      await loadTravel()
    } else {
      loadingMessage.value = 'Building your itinerary…'
      await buildPlan()
      planSaved.value = false
    }
    if (!currentLoad()) return
    if (itinerary.value) {
      if ((!saved || rebuild) && itinerary.value.stops.length) {
        loadingMessage.value = 'Saving itinerary…'
        if (!(await saveChanges())) throw new Error('Generated plan could not be saved.')
      }
      if (!currentLoad()) return
      if (rebuild) {
        const query = { ...route.query }
        delete query.replan
        await router.replace({ query })
      }
      loadWeather()
    }
  } catch (error) {
    if (disposed || loadController !== controller) return
    console.log(error)
    errorMessage.value = saveError.value || "Couldn't load the plan. Please try again."
  } finally {
    if (!disposed && loadController === controller) loading.value = false
  }
}

onMounted(loadPage)
// ----- Travel between stops (OneMap, through the onemap-route Edge Function) -----
const travelByLeg = ref({}) // 'fromId>toId' -> { loading: true } or { options } or { error }
const travelLoading = ref(false)
let travelRequest = 0
let travelPromise = Promise.resolve()

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
            fetchTravelOptions(placeOf(from), placeOf(to), departureAt(plan.date, toMinutes(from.end))),
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

watch(
  [loading, () => displayStops.value.map((stop) => stop.activity_id).join(',')],
  () => { if (!loading.value) void Promise.all(displayStops.value.map(ensureHours)).catch(() => {}) },
)

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
  loadController?.abort()
  hoursController.abort()
})

watch(() => user.value?.id, (id) => {
  if (id !== loadedUserId) {
    hoursController.abort()
    liveHours.value = {}
  }
})
</script>

<template>
  <!-- Icons in this tab are adapted from Feather Icons (MIT licence), https://feathericons.com -->
  <div class="itinerary-tab" data-testid="group-itinerary-tab">
    <div class="tab-intro">
      <h2 class="h5 fw-bold mb-1">Itinerary</h2>
      <p class="text-secondary mb-0">Your day, planned from the group's votes and free time.</p>
    </div>
    <ItineraryLoadingCar v-if="loading" :message="loadingMessage" />
    <div v-else-if="errorMessage" class="alert alert-danger" role="alert" data-testid="itinerary-error">
      <p>{{ errorMessage }}</p>
      <p v-if="group?.chosen_start" class="small">Your group time is saved. Retry building the itinerary or choose another time.</p>
      <button
        class="btn btn-outline-danger rounded-pill px-4"
        data-testid="itinerary-retry"
        @click="saveConflict ? reloadLatestPlan() : loadPage()"
      >
        {{ saveConflict ? 'Load latest plan' : 'Try again' }}
      </button>
      <RouterLink :to="{ name: 'group-availability' }" class="btn btn-link text-body">Change group time</RouterLink>
    </div>

    <!-- No plan yet -->
    <div v-else-if="!itinerary" class="empty-plan" data-testid="itinerary-empty">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16" />
        </svg>
      </div>
      <p class="mb-3">No plan yet. Add your availability, then choose a group time to build your itinerary.</p>
      <RouterLink :to="{ name: 'group-availability' }" class="btn btn-dark rounded-pill px-4">
        Go to Availability
      </RouterLink>
    </div>

    <!-- There is a plan -->
    <fieldset v-else class="border-0 p-0 m-0 w-100" :disabled="saving" data-testid="itinerary-plan">
      <div v-if="!itinerary.stops.length" class="alert alert-warning" role="status" data-testid="itinerary-no-fit">
        <template v-if="unavailableHoursCount">
          <p class="fw-semibold mb-1">We couldn't check opening hours, so no activities were added.</p>
          <p class="small mb-2">
            Live opening hours weren't available for {{ unavailableHoursCount }} voted
            {{ unavailableHoursCount === 1 ? 'activity' : 'activities' }}. This may be temporary (for example,
            the hourly limit on Google lookups), so try again in about an hour: press Edit, then Re-plan.
          </p>
        </template>
        <template v-else>
          <p class="fw-semibold mb-1">No activities fit this time and budget.</p>
          <p class="small mb-2">Choose a longer time, adjust the group budget, or vote for other activities.</p>
        </template>
        <RouterLink :to="{ name: 'group-availability' }" class="btn btn-outline-dark rounded-pill me-2">Change time</RouterLink>
        <RouterLink :to="{ name: 'group-activities' }" class="btn btn-link text-body">Back to voting</RouterLink>
      </div>
      <div
        v-else-if="planSaved && !isEditing"
        class="small mb-3"
        :class="{
          'alert alert-warning': savedHoursSummary.conflicts.length || savedHoursSummary.unavailable,
          'text-success-emphasis': !savedHoursSummary.conflicts.length && !savedHoursSummary.unavailable && !savedHoursSummary.checking,
        }"
        role="status"
        data-testid="itinerary-saved-status"
      >
        <template v-if="savedHoursSummary.conflicts.length">
          <p class="fw-semibold mb-1">
            Saved itinerary · {{ savedHoursSummary.conflicts.length }}
            {{ savedHoursSummary.conflicts.length === 1 ? 'opening-hours conflict' : 'opening-hours conflicts' }}
          </p>
          <p class="mb-1">
            {{ savedHoursSummary.conflicts[0].stop.name }}
            ({{ formatClockRange(savedHoursSummary.conflicts[0].stop.start, savedHoursSummary.conflicts[0].stop.end) }})
            · {{ savedHoursSummary.conflicts[0].warning }}
            <a
              class="alert-link"
              :href="'#itinerary-stop-' + savedHoursSummary.conflicts[0].stop.activity_id"
              @click.prevent="focusStop(savedHoursSummary.conflicts[0].stop)"
            >View stop</a>
          </p>
        </template>
        <span v-else-if="savedHoursSummary.checking || savedHoursSummary.unavailable">Itinerary saved for your group.</span>
        <span v-else>✓ Itinerary saved for your group.</span>
        <p v-if="savedHoursSummary.checking" class="mb-0">Checking opening hours…</p>
        <p v-if="savedHoursSummary.unavailable" class="mb-0">Opening hours could not be verified for some stops.</p>
        <p v-if="savedHoursSummary.provisional" class="mb-0">
          {{ isPlanPast ? 'Based on current published hours.' : USUAL_HOURS_NOTE }}
        </p>
      </div>
      <div v-if="isPlanPast" class="info-banner muted" data-testid="itinerary-weather-past">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
        <span>This day has passed, so there's no forecast.</span>
      </div>
      <p v-else-if="weatherLoading" class="text-secondary small" data-testid="itinerary-weather-loading">Checking the weather...</p>
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
          <dd>{{ formatPlanDate(itinerary.date) }}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <!-- Formatted text until Edit is pressed. A native time input shows '05:00 pm', so the
               inputs stay mounted but hidden, keeping their values and listeners unchanged. -->
          <dd class="d-flex align-items-center gap-1">
            <span v-if="!isEditing" class="summary-time" data-testid="itinerary-time-text">{{ summaryTimeText }}</span>
            <input
              v-show="isEditing"
              ref="startField"
              v-model="startDraft"
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
            <span v-show="isEditing">–</span>
            <input
              v-show="isEditing"
              ref="endField"
              v-model="endDraft"
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
            <span v-if="hasUnknownPrices" class="d-block text-warning-emphasis small">
              Known subtotal only; total incomplete because a stop's price is unknown. Remove unknown-price stops before saving.
            </span>
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
            :disabled="saving || saveConflict || travelLoading || travelFailed || hasUnknownPrices"
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
      <!-- Its line is kept while editing, so the plan doesn't drop down and jump back up
           each time the travel times are re-checked -->
      <p
        v-if="isEditing && (travelLoading || !travelFailed)"
        role="status"
        class="text-secondary small travel-status"
        :class="{ shown: travelLoading }"
      >
        <span v-if="travelLoading">Checking travel times before saving…</span>
      </p>
      <div v-else-if="travelFailed" role="alert" class="d-flex flex-wrap align-items-center gap-2 mb-3"
        data-testid="itinerary-travel-failed">
        <span class="text-danger small">
          Some travel times couldn't be checked{{ isEditing ? ", so the plan can't be saved yet" : '' }}.
        </span>
        <button type="button" class="btn btn-sm btn-outline-dark rounded-pill px-3"
          data-testid="itinerary-travel-retry" @click="loadTravel">Retry</button>
      </div>
      <p v-if="saveError" class="text-danger" role="alert" data-testid="itinerary-save-error">{{ saveError }}</p>
      <button v-if="saveConflict" type="button" class="btn btn-outline-dark rounded-pill mb-3"
        data-testid="itinerary-load-latest" @click="reloadLatestPlan">Load latest plan</button>

      <ol ref="timelineRef" class="timeline list-unstyled mb-0" data-testid="itinerary-timeline">
        <template v-for="(stop, index) in displayStops" :key="stop.original.activity_id">
          <li class="timeline-row" data-testid="itinerary-stop">
            <div class="timeline-time">
              <span class="clock">{{ formatClock(stop.start) }}</span>
              <span class="length">{{ formatHours(stop.start, stop.end) }}</span>
            </div>
            <div class="timeline-rail" aria-hidden="true"><span class="timeline-dot"></span></div>
            <div
              class="stop-card surface-card"
              :class="{ rainy: stop.isRainyView }"
              :data-flip="'stop-' + stop.original.activity_id"
            >
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
                <h3 :id="'itinerary-stop-' + stop.original.activity_id" class="stop-name" tabindex="-1">
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
                <p class="stop-range small text-secondary mb-1">{{ formatClockRange(stop.start, stop.end) }}</p>
                <p class="mb-1 small fw-semibold">{{ stop.cost === null ? 'Price unknown' : '$' + stop.cost + ' per person' }}</p>
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
                <p v-if="usesUsualHours(stop)" class="small text-secondary mb-1" data-testid="itinerary-usual-hours">{{ USUAL_HOURS_NOTE }}</p>
                <p v-if="liveHours[stop.activity_id]?.details" class="small text-secondary mb-1" data-testid="itinerary-hours-source">
                  Opening hours checked with Google Maps.
                  <span v-for="provider in liveHours[stop.activity_id].details.attributions" :key="provider.name">
                    <a v-if="provider.url" :href="provider.url" target="_blank" rel="noopener noreferrer">{{ provider.name }}</a>
                    <span v-else>{{ provider.name }}</span>
                  </span>
                </p>
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
          <li
            v-if="index < displayStops.length - 1"
            class="timeline-row travel-row"
            :data-flip="'travel-' + index"
          >
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
            <span class="flex-grow-1">{{ activity.name }} ({{ activity.cost === null ? 'Price unknown' : '$' + activity.cost }})</span>
            <span class="reason-chip">{{ whyNotInPlan(activity) }}</span>
            <button
              v-if="isEditing"
              class="btn btn-sm btn-outline-dark rounded-pill px-3"
              data-testid="itinerary-add-stop"
              :disabled="activity.cost === null"
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
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem 1.5rem;
  margin-bottom: 1rem;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

/* Leave room for both time inputs, including their controls while editing. */
@media (min-width: 576px) {
  .summary-panel {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 1fr);
  }
}

@media (min-width: 992px) {
  .summary-panel {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 1.6fr) minmax(0, 1fr) minmax(0, 0.5fr);
  }
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

/* Same height as the time inputs, so the panel doesn't jump when editing starts */
.summary-time {
  line-height: 1.75rem;
  font-variant-numeric: tabular-nums;
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

/* Start the line at the first dot and stop it at the last one. "of-type" counts only the
   rows, not the fading copy of a removed stop (a div) added at the end of the list. */
.timeline-row:first-of-type .timeline-rail::before {
  top: 20px;
}

.timeline-row:last-of-type .timeline-rail::before {
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

/* One line tall even when empty; the text fades in and out instead of the line appearing */
.travel-status {
  min-height: 1.5em;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.travel-status.shown {
  opacity: 1;
}

/* Holds the fading copy of a removed stop (see makeGhost) */
.timeline {
  position: relative;
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

/* Blue with a white dot when on, instead of the usual amber */
.rainy-toggle .form-check-input:checked {
  --bs-form-switch-bg: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='-4 -4 8 8'%3e%3ccircle r='3' fill='%23fff'/%3e%3c/svg%3e");
  border-color: #0d6efd;
  background-color: #0d6efd;
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
