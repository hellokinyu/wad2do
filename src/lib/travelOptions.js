import { supabase } from '@/lib/supabase'

// Results we already have in this browser tab, so re-drawing doesn't ask again
const cache = new Map()

// Ask the onemap-route Edge Function for the five travel options between two stops.
// start and end are { lat, lng }. departure is Singapore time, e.g. '2026-10-30T10:00'.
export async function fetchTravelOptions(start, end, departure) {
  const key = [start.lat, start.lng, end.lat, end.lng, departure].join('|')
  if (cache.has(key)) return cache.get(key)

  const { data, error } = await supabase.functions.invoke('onemap-route', {
    body: { start, end, departure },
  })
  if (error) {
    // The function sends { error: '...' }, e.g. "OneMap token expired, update ONEMAP_TOKEN in .env"
    const details = await error.context?.json?.().catch(() => null)
    throw new Error(details?.error || 'Travel times are unavailable right now')
  }
  cache.set(key, data.options)
  return data.options
}