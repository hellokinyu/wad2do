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