// OneMap routing: build requests, read replies, and turn them into one result shape.
// Used by the onemap-route Edge Function and its tests.

export const ONEMAP_ROUTE_URL = 'https://www.onemap.gov.sg/api/public/routingsvc/route'

// The five travel options shown between stops
export type TravelMode = 'MRT' | 'BUS' | 'TRANSIT' | 'WALK' | 'CYCLE'

export type Point = { lat: number; lng: number }

// One travel option: the same shape for every mode
export type TravelOption = {
  mode: TravelMode
  durationMinutes: number | null
  distanceMeters: number | null
  summary: string
  available: boolean
  error?: string
}

// How each of our modes maps to OneMap's request parameters
const MODE_PARAMS: Record<TravelMode, Record<string, string>> = {
  WALK: { routeType: 'walk' },
  CYCLE: { routeType: 'cycle' },
  MRT: { routeType: 'pt', mode: 'RAIL' },
  BUS: { routeType: 'pt', mode: 'BUS' },
  TRANSIT: { routeType: 'pt', mode: 'TRANSIT' },
}

// departure is Singapore time, e.g. '2026-10-30T10:00' (the same format as toSgKey)
export function buildRouteUrl(start: Point, end: Point, mode: TravelMode, departure: string) {
  const params = new URLSearchParams({
    start: start.lat + ',' + start.lng,
    end: end.lat + ',' + end.lng,
    ...MODE_PARAMS[mode],
  })
  if (MODE_PARAMS[mode].routeType === 'pt') {
    const [date, time] = departure.split('T') // '2026-10-30', '10:00'
    const [year, month, day] = date.split('-')
    params.set('date', month + '-' + day + '-' + year) // OneMap wants MM-DD-YYYY
    params.set('time', time + ':00') // and HH:MM:SS
    params.set('maxWalkDistance', '1000')
    params.set('numItineraries', '1')
  }
  return ONEMAP_ROUTE_URL + '?' + params.toString()
}

// The result for a mode with no usable route
export function unavailable(mode: TravelMode, error: string): TravelOption {
  return { mode, durationMinutes: null, distanceMeters: null, summary: '', available: false, error }
}

// Walk and cycle replies: route_summary has total_time (seconds) and total_distance (metres)
export function parseStreetRoute(mode: TravelMode, body: any): TravelOption {
  const route = body?.route_summary
  if (body?.status !== 0 || typeof route?.total_time !== 'number') {
    return unavailable(mode, 'No route found')
  }
  const minutes = Math.round(route.total_time / 60)
  return {
    mode,
    durationMinutes: minutes,
    distanceMeters: Math.round(route.total_distance),
    summary: (mode === 'WALK' ? 'Walk ' : 'Cycle ') + minutes + ' min',
    available: true,
  }
}

// One leg as text: 'Walk 6 min', 'Bus 106' or 'DT line 3 stops'
function describeLeg(leg: any) {
  if (leg.mode === 'WALK') return 'Walk ' + Math.max(1, Math.round(leg.duration / 60)) + ' min'
  if (leg.mode === 'BUS') return 'Bus ' + leg.routeShortName
  const stops = (leg.intermediateStops?.length ?? 0) + 1
  return leg.routeShortName + ' line ' + stops + (stops === 1 ? ' stop' : ' stops')
}

// MRT, bus and transit replies: plan.itineraries[0] has duration (seconds) and legs
export function parseTransitRoute(mode: TravelMode, body: any): TravelOption {
  const trip = body?.plan?.itineraries?.[0]
  if (!trip || typeof trip.duration !== 'number' || !Array.isArray(trip.legs)) {
    return unavailable(mode, 'No route found')
  }
  // Very close stops give a walk-only "route": that isn't really an MRT or bus option
  if (!trip.legs.some((leg: any) => leg.transitLeg)) return unavailable(mode, 'Walking is quicker')

  let distance = 0
  for (const leg of trip.legs) distance += leg.distance || 0 // add up every leg, not just walkDistance
  return {
    mode,
    durationMinutes: Math.round(trip.duration / 60),
    distanceMeters: Math.round(distance),
    summary: trip.legs.map(describeLeg).join(' → '),
    available: true,
  }
}

// ----- Calling OneMap -----

export const ALL_MODES: TravelMode[] = ['MRT', 'BUS', 'TRANSIT', 'WALK', 'CYCLE']

// Results we already have, so the same trip isn't asked for twice
const cache = new Map<string, TravelOption>()
export function clearTravelCache() {
  cache.clear()
}

// '2026-10-30T10:07' -> '2026-10-30T10:00' (nearest 15 minutes, never past 23:45)
export function roundTo15(departure: string) {
  const [date, time] = departure.split('T')
  const [hours, minutes] = time.split(':').map(Number)
  const total = Math.min(Math.round((hours * 60 + minutes) / 15) * 15, 23 * 60 + 45)
  const pad = (n: number) => String(n).padStart(2, '0')
  return date + 'T' + pad(Math.floor(total / 60)) + ':' + pad(total % 60)
}

// Walk and cycle don't depend on the time, so their key leaves it out
function cacheKey(start: Point, end: Point, mode: TravelMode, departure: string) {
  const when = mode === 'WALK' || mode === 'CYCLE' ? '' : departure
  return [start.lat, start.lng, end.lat, end.lng, mode, when].join('|')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Ask OneMap for one mode. Problems with this mode become "unavailable", except an
// expired token, which affects every mode and is thrown so the caller can show it.
async function fetchOption(
  start: Point,
  end: Point,
  mode: TravelMode,
  departure: string,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<TravelOption> {
  const url = buildRouteUrl(start, end, mode, departure)
  for (let attempt = 0; attempt < 3; attempt++) {
    let response
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const timedOut = (error as Error)?.name === 'TimeoutError'
      return unavailable(mode, timedOut ? 'OneMap took too long' : 'Could not reach OneMap')
    }
    if (response.status === 401) throw new Error('OneMap token expired, update ONEMAP_TOKEN in .env')
    if (response.status === 429) {
      await sleep(500 * 2 ** attempt) // wait 0.5 s, then 1 s, then 2 s
      continue
    }
    const body = await response.json().catch(() => null)
    if (response.status === 404) return unavailable(mode, body?.error || 'No route found')
    if (!response.ok) return unavailable(mode, 'OneMap error ' + response.status)
    return mode === 'WALK' || mode === 'CYCLE'
      ? parseStreetRoute(mode, body)
      : parseTransitRoute(mode, body)
  }
  return unavailable(mode, 'OneMap is busy, try again shortly')
}

// All five travel options between two stops, at most `concurrency` requests at a time
export async function getTravelOptions({
  start,
  end,
  departure,
  token,
  fetchImpl = fetch,
  timeoutMs = 8000,
  concurrency = 2,
}: {
  start: Point
  end: Point
  departure: string
  token: string | undefined
  fetchImpl?: typeof fetch
  timeoutMs?: number
  concurrency?: number
}): Promise<TravelOption[]> {
  if (!token) throw new Error('ONEMAP_TOKEN is not set in .env')
  const when = roundTo15(departure)
  const results: TravelOption[] = []
  let next = 0

  // Each worker keeps taking the next mode until none are left
  async function worker() {
    while (next < ALL_MODES.length) {
      const index = next++
      const mode = ALL_MODES[index]
      const key = cacheKey(start, end, mode, when)
      let option = cache.get(key)
      if (!option) {
        option = await fetchOption(start, end, mode, when, token as string, fetchImpl, timeoutMs)
        if (option.available) cache.set(key, option) // don't remember failures
      }
      results[index] = option
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}