// Details and venue search share the existing server-only allowance.
export const GOOGLE_FIELD_MASK =
  'rating,userRatingCount,currentOpeningHours,regularOpeningHours,attributions'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

async function readActivityId(req: Request, signal: AbortSignal) {
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json' || !req.body)
    return null
  const reader = req.body.getReader()
  const cancel = () => {
    reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  let size = 0
  let text = ''
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
    signal.throwIfAborted()
    const body = JSON.parse(text + decoder.decode())
    return body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      Object.keys(body).length === 1 &&
      typeof body.activityId === 'string' &&
      uuid.test(body.activityId)
      ? body.activityId
      : null
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

export function createHandler({
  env,
  fetchImpl = fetch,
  timeoutMs = 10000,
}: {
  env: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}) {
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers: cors })
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' })
    const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return reply(401, { error: 'unauthenticated' })
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY)
      return reply(503, { error: 'unavailable' })
    const deadline = AbortSignal.timeout(timeoutMs)
    const userHeaders = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    try {
      const auth = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: userHeaders,
        signal: deadline,
        redirect: 'error',
      })
      if (!auth.ok) return reply(401, { error: 'unauthenticated' })
      const user = await auth.json()
      if (typeof user?.id !== 'string' || !uuid.test(user.id))
        return reply(401, { error: 'unauthenticated' })
      let activityId
      try {
        activityId = await readActivityId(req, deadline)
      } catch {
        activityId = null
      }
      deadline.throwIfAborted()
      if (!activityId) return reply(400, { error: 'invalid_input' })

      // Read the saved Place ID under the caller's existing row-level security.
      const activityResponse = await fetchImpl(
        `${env.SUPABASE_URL}/rest/v1/activities?select=google_place_id&id=eq.${activityId}&limit=1`,
        { headers: userHeaders, signal: deadline, redirect: 'error' },
      )
      if (!activityResponse.ok) return reply(503, { error: 'unavailable' })
      const activities = await activityResponse.json()
      if (!Array.isArray(activities)) return reply(503, { error: 'unavailable' })
      const placeId = activities[0]?.google_place_id
      if (typeof placeId !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(placeId))
        return reply(404, { error: 'activity_unavailable' })
      if (!env.GOOGLE_MAPS_API_KEY) return reply(503, { error: 'lookup_disabled' })

      const reservation = await fetchImpl(
        `${env.SUPABASE_URL}/rest/v1/rpc/reserve_google_place_search`,
        {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_user_id: user.id }),
          signal: deadline,
          redirect: 'error',
        },
      )
      if (!reservation.ok) return reply(503, { error: 'unavailable' })
      const reserved = await reservation.json()
      if (reserved === 'lookup_disabled') return reply(503, { error: reserved })
      if (reserved === 'user_limit' || reserved === 'app_limit')
        return reply(429, { error: reserved })
      if (reserved !== 'ok') return reply(503, { error: 'unavailable' })
      // Never refund an uncertain request, and never retry Google automatically.
      deadline.throwIfAborted()
      const response = await fetchImpl(
        'https://places.googleapis.com/v1/places/' +
          encodeURIComponent(placeId) +
          '?languageCode=en',
        {
          headers: {
            'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': GOOGLE_FIELD_MASK,
          },
          signal: deadline,
          redirect: 'error',
        },
      )
      if (!response.ok) return reply(502, { error: 'unavailable' })
      const details = await response.json()
      if (!details || typeof details !== 'object' || Array.isArray(details) || details.error)
        return reply(502, { error: 'unavailable' })
      return reply(200, details)
    } catch {
      return reply(503, { error: 'unavailable' })
    }
  }
}

if (typeof Deno !== 'undefined') Deno.serve(createHandler({ env: Deno.env.toObject() }))
