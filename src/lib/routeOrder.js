import { getVisitHoursWarnings } from './openingHours.js'

// Trying every order is only sensible for a few stops: 6 stops already means 30 journeys to look up
const MAX_STOPS_TO_REORDER = 6
// How many of the most promising orders get re-checked with their actual departure times
const ORDERS_TO_CHECK = 3
const LOOKUPS_AT_ONCE = 4

// '10:30' -> 630 (minutes since midnight)
export function toMinutes(time) {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

// 630 -> '10:30'. Times after midnight keep counting, so 1470 -> '24:30'.
export function toTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0')
}

// ('2026-10-30', 1470) -> '2026-10-31T00:30', the format OneMap's departure time needs
export function departureAt(date, totalMinutes) {
  const days = Math.floor(totalMinutes / 1440)
  const day = new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
  return day.toISOString().slice(0, 10) + 'T' + toTime(totalMinutes - days * 1440)
}

export function legKey(from, to) {
  return from.activity_id + '>' + to.activity_id
}

function fastestMinutes(options) {
  const available = (options || []).filter((option) => option.available)
  return available.length
    ? Math.min(...available.map((option) => option.durationMinutes))
    : Infinity
}

// Lay the stops out in this order from `start`, keeping each one's duration.
// Returns null if a journey has no route, or a stop misses the end time or opening hours.
export async function timeRoute(
  stops,
  {
    date,
    start,
    end,
    getOptions,
    getHoursWarnings = (stop, date, start, end) =>
      getVisitHoursWarnings(stop.opening_hours, date, start, end),
  },
) {
  const timed = []
  const legs = {}
  let current = start
  let travelMinutes = 0
  for (const stop of stops) {
    const previous = timed.at(-1)
    let arrival = current
    if (previous) {
      const options = await getOptions(previous, stop, departureAt(date, current))
      const minutes = fastestMinutes(options)
      if (minutes === Infinity) return null
      arrival += minutes
      travelMinutes += minutes
      legs[legKey(previous, stop)] = { options }
    }
    const finish = arrival + toMinutes(stop.end) - toMinutes(stop.start)
    if (finish > end || getHoursWarnings(stop, date, arrival, finish).length) {
      return null
    }
    timed.push({ ...stop, start: toTime(arrival), end: toTime(finish) })
    current = finish
  }
  return { stops: timed, legs, travelMinutes }
}

// Every order of the items, with the original order first
function allOrders(items) {
  if (items.length < 2) return [items]
  return items.flatMap((item, index) =>
    allOrders(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest]),
  )
}

// Look up the journey between every pair of stops at one departure time, a few at a time
async function lookUpJourneys(stops, departure, getOptions) {
  const pairs = stops.flatMap((from) => stops.filter((to) => to !== from).map((to) => [from, to]))
  const journeys = {}
  let next = 0
  async function worker() {
    while (next < pairs.length) {
      const [from, to] = pairs[next++]
      journeys[legKey(from, to)] = await getOptions(from, to, departure)
    }
  }
  await Promise.all(Array.from({ length: LOOKUPS_AT_ONCE }, worker))
  return journeys
}

// Find the order of these stops with the least travel. Departure times change journey times, so
// every order is ranked with one shared departure, then the best few are checked at their real
// times. Returns the new route, or null when the current order is already the fastest that fits.
export async function findFastestRoute(stops, { date, start, end, getOptions, getHoursWarnings }) {
  if (stops.length < 2 || stops.length > MAX_STOPS_TO_REORDER) return null
  const plan = { date, start, end, getHoursWarnings }
  const current = await timeRoute(stops, { ...plan, getOptions })
  const journeys = await lookUpJourneys(
    stops,
    departureAt(date, toMinutes(stops[0].end)),
    getOptions,
  )

  const estimates = []
  for (const order of allOrders(stops)) {
    const estimate = await timeRoute(order, {
      ...plan,
      getOptions: (from, to) => journeys[legKey(from, to)],
    })
    if (estimate) estimates.push({ order, travelMinutes: estimate.travelMinutes })
  }
  estimates.sort((a, b) => a.travelMinutes - b.travelMinutes) // ties stay in vote order

  let best = current
  for (const { order } of estimates.slice(0, ORDERS_TO_CHECK)) {
    const route = await timeRoute(order, { ...plan, getOptions })
    if (route && (!best || route.travelMinutes < best.travelMinutes)) best = route
  }
  return best === current ? null : best
}
