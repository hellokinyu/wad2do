// Paste this entire file into Supabase's google-place-search index.ts editor.
// No external imports: the same handler is exercised with mocked fetch in Node tests.
export const GOOGLE_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.attributions'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const validText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,255}$/.test(value)

async function readInput(req: Request, signal: AbortSignal) {
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return null
  if (!req.body) return null
  const reader = req.body.getReader()
  const cancel = () => {
    reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
  signal.throwIfAborted()
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !['name', 'address', 'postalCode'].includes(key)) ||
    !validText(body.name, 200) ||
    !validText(body.address, 500) ||
    (body.postalCode !== undefined &&
      (typeof body.postalCode !== 'string' || !/^(?:\d{6})?$/.test(body.postalCode)))
  )
    return null
  return { name: body.name.trim(), address: body.address.trim(), postalCode: body.postalCode || '' }
}

type GooglePlace = {
  id?: unknown
  displayName?: { text?: unknown }
  formattedAddress?: unknown
  addressComponents?: { types?: unknown; shortText?: unknown }[]
  attributions?: { provider?: unknown; providerUri?: unknown }[]
}

function candidatesFrom(data: { places?: GooglePlace[] }) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    (data.places !== undefined && !Array.isArray(data.places))
  )
    throw new Error('Invalid response')
  const seen = new Set()
  return (data.places || [])
    .filter((place) => {
      if (
        !validId(place?.id) ||
        seen.has(place.id) ||
        !validText(place.displayName?.text, 1000) ||
        !validText(place.formattedAddress, 2000) ||
        !Array.isArray(place.addressComponents)
      )
        return false
      const countries = place.addressComponents.filter(
        (part) => Array.isArray(part?.types) && part.types.includes('country'),
      )
      if (countries.length !== 1 || countries[0].shortText !== 'SG') return false
      seen.add(place.id)
      return true
    })
    .slice(0, 5)
    .map((place) => ({
      id: place.id,
      name: place.displayName?.text,
      address: place.formattedAddress,
      attributions: (Array.isArray(place.attributions) ? place.attributions : [])
        .filter((item) => validText(item?.provider, 1000))
        .map((item) => ({
          provider: item.provider,
          providerUri: typeof item.providerUri === 'string' ? item.providerUri : '',
        })),
    }))
}

export function createHandler({
  env,
  fetchImpl = fetch,
  timeoutMs = 8000,
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
    // A single deadline also bounds auth, body reading and quota reservation.
    const deadline = AbortSignal.timeout(timeoutMs)
    try {
      const auth = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        signal: deadline,
        redirect: 'error',
      })
      if (!auth.ok) return reply(401, { error: 'unauthenticated' })
      const user = await auth.json()
      if (
        typeof user?.id !== 'string' ||
        !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(user.id)
      )
        return reply(401, { error: 'unauthenticated' })
      let input
      // Bound a stalled upload as well as its byte size.
      try {
        input = await readInput(req, deadline)
      } catch {
        input = null
      }
      deadline.throwIfAborted()
      if (!input) return reply(400, { error: 'invalid_input' })
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
      // Never refund: a timeout or lost response may still represent a billable call.
      const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': GOOGLE_FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery: `${input.name}, ${input.address}, ${input.postalCode} Singapore`,
          regionCode: 'SG',
          languageCode: 'en',
          pageSize: 5,
        }),
        signal: deadline,
        redirect: 'error',
      })
      if (!response.ok) return reply(502, { error: 'unavailable' })
      return reply(200, { candidates: candidatesFrom(await response.json()) })
    } catch {
      return reply(503, { error: 'unavailable' })
    }
  }
}

if (typeof Deno !== 'undefined') Deno.serve(createHandler({ env: Deno.env.toObject() }))
