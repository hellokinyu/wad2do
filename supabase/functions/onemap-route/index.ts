// onemap-route Edge Function: the browser sends two stops and a departure time.
// We ask OneMap here on the server (so the token never reaches the browser)
// and send back all five travel options.
import { ALL_MODES, findPlace, getTravelOptions, unavailable } from './routing.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

// A point roughly inside Singapore, so we never forward junk to OneMap
function isSingaporePoint(point: any) {
  return (
    typeof point?.lat === 'number' &&
    typeof point?.lng === 'number' &&
    point.lat > 1.1 &&
    point.lat < 1.5 &&
    point.lng > 103.5 &&
    point.lng < 104.1
  )
}

// A stop from the browser: coordinates inside Singapore, or a short address/name to look up
function isPlace(place: any) {
  if (isSingaporePoint(place)) return true
  const isText = (value: any) =>
    typeof value === 'string' && value.length > 0 && value.length <= 200
  return isText(place?.address) || isText(place?.name)
}

export function createHandler({
  env,
  fetchImpl = fetch,
}: {
  env: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}) {
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers: cors })
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })

    // Only logged-in users may use the app's OneMap allowance
    const jwt = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!jwt) return reply(401, { error: 'unauthenticated' })
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return reply(503, { error: 'unavailable' })
    try {
      const auth = await fetchImpl(env.SUPABASE_URL + '/auth/v1/user', {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + jwt },
      })
      if (!auth.ok) return reply(401, { error: 'unauthenticated' })
    } catch {
      return reply(503, { error: 'unavailable' })
    }

    // Expect { start, end, departure: '2026-10-30T10:00' }. A stop is either { lat, lng }
    // or { address, name } for us to look up.
    let body
    try {
      body = await req.json()
    } catch {
      body = null
    }
    const validTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body?.departure ?? '')
    if (!isPlace(body?.start) || !isPlace(body?.end) || !validTime) {
      return reply(400, { error: 'invalid_input' })
    }
    const token = env.ONEMAP_TOKEN
    if (!token) return reply(503, { error: 'ONEMAP_TOKEN is not set in .env' })

    // Find both stops' coordinates (saved ones, or looked up by postal code / name)
    const [start, end] = await Promise.all([
      findPlace(body.start, { token, fetchImpl }),
      findPlace(body.end, { token, fetchImpl }),
    ])
    if (!start || !end) {
      return reply(200, {
        options: ALL_MODES.map((mode) => unavailable(mode, 'Location not found')),
      })
    }

    try {
      const options = await getTravelOptions({
        start,
        end,
        departure: body.departure,
        token,
        fetchImpl,
      })
      return reply(200, { options })
    } catch (error) {
      // Missing or expired token. The message never contains the token itself.
      return reply(503, { error: (error as Error).message })
    }
  }
}

if (typeof Deno !== 'undefined') Deno.serve(createHandler({ env: Deno.env.toObject() }))
