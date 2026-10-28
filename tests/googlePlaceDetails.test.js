import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createHandler,
  GOOGLE_FIELD_MASK,
} from '../supabase/functions/google-place-details/index.ts'

const userId = '5adbd3ea-5d05-4301-a4e9-1da90d4bcd6c'
const activityId = 'c65458a9-d2aa-4e7e-84f1-9b6b7557d858'
const env = {
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_ANON_KEY: 'public',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only',
  GOOGLE_MAPS_API_KEY: 'google-secret',
}
const details = {
  rating: 4.9,
  userRatingCount: 325,
  regularOpeningHours: { weekdayDescriptions: ['Monday: Closed'] },
  attributions: [],
}
const request = (body = { activityId }, headers = {}) =>
  new Request('https://mock/details', {
    method: 'POST',
    headers: { Authorization: 'Bearer caller', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
function setup(options = {}) {
  const calls = []
  const handler = createHandler({
    env: { ...env, ...options.env },
    timeoutMs: 100,
    fetchImpl: async (url, init) => {
      const stage = url.endsWith('/user')
        ? 'auth'
        : url.includes('/activities?')
          ? 'activity'
          : url.includes('/rpc/')
            ? 'quota'
            : 'google'
      calls.push({ stage, url, ...init })
      if (options.stall === stage)
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 500)
          const abort = () => {
            clearTimeout(timer)
            reject(new Error('secret failure'))
          }
          if (init.signal.aborted) abort()
          else init.signal.addEventListener('abort', abort, { once: true })
        })
      if (stage === 'auth')
        return Response.json(options.user ?? { id: userId }, { status: options.authStatus ?? 200 })
      if (stage === 'activity')
        return Response.json(options.activities ?? [{ google_place_id: 'ChIJ_saved_venue' }], {
          status: options.activityStatus ?? 200,
        })
      if (stage === 'quota')
        return Response.json(options.reserved ?? 'ok', { status: options.quotaStatus ?? 200 })
      if (options.failure) throw new Error('google-secret internal failure')
      return Response.json(options.details ?? details, { status: options.googleStatus ?? 200 })
    },
  })
  return { handler, calls }
}

test('details require verified authentication before catalogue reads or reservations', async () => {
  for (const options of [{ noToken: true }, { authStatus: 401 }, { user: { id: 'forged' } }]) {
    const { handler, calls } = setup(options)
    assert.equal(
      (await handler(request(undefined, options.noToken ? { Authorization: '' } : {}))).status,
      401,
    )
    assert.ok(calls.every((c) => c.stage === 'auth'))
  }
})

test('details handle CORS and reject non-POST methods without upstream work', async () => {
  const { handler, calls } = setup()
  const response = await handler(new Request('https://mock', { method: 'OPTIONS' }))
  assert.equal(response.status, 204)
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /x-supabase-client-platform/)
  assert.equal((await handler(new Request('https://mock'))).status, 405)
  assert.equal(calls.length, 0)
})

test('details reject malformed and oversized input and caller-controlled billing fields', async () => {
  for (const body of [
    null,
    [],
    {},
    { activityId: 1 },
    { activityId: 'bad' },
    { activityId, placeId: 'other' },
    { activityId, fieldMask: '*' },
    { activityId, userId },
    { activityId: 'x'.repeat(5000) },
  ]) {
    const { handler, calls } = setup()
    assert.equal((await handler(request(body))).status, 400)
    assert.equal(calls.length, 1)
  }
  const { handler, calls } = setup()
  const malformed = new Request('https://mock', {
    method: 'POST',
    headers: { Authorization: 'Bearer caller', 'Content-Type': 'application/json' },
    body: '{broken',
  })
  assert.equal((await handler(malformed)).status, 400)
  assert.equal((await handler(request(undefined, { 'Content-Type': 'text/plain' }))).status, 400)
  assert.ok(calls.every((c) => c.stage === 'auth'))
})

test('catalogue lookup uses caller permissions, then a server-only reservation precedes Google', async () => {
  const { handler, calls } = setup()
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), details)
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['auth', 'activity', 'quota', 'google'],
  )
  assert.equal(calls[1].headers.Authorization, 'Bearer caller')
  const catalogue = new URL(calls[1].url)
  assert.equal(catalogue.searchParams.get('id'), 'eq.' + activityId)
  assert.equal(catalogue.searchParams.get('select'), 'google_place_id')
  assert.equal(calls[2].url, env.SUPABASE_URL + '/rest/v1/rpc/reserve_google_place_search')
  assert.equal(calls[2].headers.Authorization, 'Bearer server-only')
  assert.deepEqual(JSON.parse(calls[2].body), { p_user_id: userId })
  assert.equal(
    calls[3].url,
    'https://places.googleapis.com/v1/places/ChIJ_saved_venue?languageCode=en',
  )
  assert.equal(calls[3].headers['X-Goog-FieldMask'], GOOGLE_FIELD_MASK)
  assert.equal(calls[3].redirect, 'error')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.doesNotMatch(JSON.stringify(details), /server-only|google-secret/)
})

test('unavailable activities never reserve usage or call Google', async () => {
  for (const options of [
    { activities: [] },
    { activities: [{}] },
    { activities: [{ google_place_id: 'bad/path' }] },
    { activityStatus: 500 },
    { activities: {} },
  ]) {
    const { handler, calls } = setup(options)
    assert.ok((await handler(request())).status >= 400)
    assert.ok(calls.every((c) => ['auth', 'activity'].includes(c.stage)))
  }
})

test('disabled, exhausted or failed allowance checks always block Google', async () => {
  for (const [options, status, error] of [
    [{ reserved: 'user_limit' }, 429, 'user_limit'],
    [{ reserved: 'app_limit' }, 429, 'app_limit'],
    [{ reserved: 'lookup_disabled' }, 503, 'lookup_disabled'],
    [{ quotaStatus: 500 }, 503, 'unavailable'],
    [{ reserved: 'unexpected' }, 503, 'unavailable'],
    [{ env: { GOOGLE_MAPS_API_KEY: '' } }, 503, 'lookup_disabled'],
    [{ env: { SUPABASE_SERVICE_ROLE_KEY: '' } }, 503, 'unavailable'],
  ]) {
    const { handler, calls } = setup(options)
    const response = await handler(request())
    assert.equal(response.status, status)
    assert.deepEqual(await response.json(), { error })
    assert.ok(calls.every((c) => c.stage !== 'google'))
  }
})

test('Google failures keep the reservation and never retry, refund or expose secrets', async () => {
  for (const options of [
    { failure: true },
    { googleStatus: 429 },
    { details: [] },
    { details: { error: 'google-secret' } },
  ]) {
    const { handler, calls } = setup(options)
    const response = await handler(request())
    assert.ok(response.status >= 500)
    assert.deepEqual(await response.json(), { error: 'unavailable' })
    assert.equal(calls.filter((c) => c.stage === 'quota').length, 1)
    assert.equal(calls.filter((c) => c.stage === 'google').length, 1)
  }
})

test('one deadline bounds auth, catalogue, reservations and Google', async () => {
  for (const stall of ['auth', 'activity', 'quota', 'google']) {
    const { handler, calls } = setup({ stall })
    assert.equal((await handler(request())).status, 503)
    assert.equal(calls.at(-1).stage, stall)
  }
})

test('a stalled request body times out without reserving usage', async () => {
  const { handler, calls } = setup()
  let cancelled = false
  const body = new ReadableStream({
    cancel() {
      cancelled = true
    },
  })
  const response = await handler(
    new Request('https://mock', {
      method: 'POST',
      headers: { Authorization: 'Bearer caller', 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    }),
  )
  assert.equal(response.status, 503)
  assert.equal(cancelled, true)
  assert.ok(calls.every((c) => c.stage === 'auth'))
})
