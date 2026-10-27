import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createHandler,
  GOOGLE_FIELD_MASK,
} from '../supabase/functions/google-place-search/index.ts'

const userId = '5adbd3ea-5d05-4301-a4e9-1da90d4bcd6c'
const env = {
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_ANON_KEY: 'public',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only',
  GOOGLE_MAPS_API_KEY: 'google-secret',
}
const venue = {
  id: 'ChIJ_example',
  displayName: { text: 'Studio' },
  formattedAddress: 'Singapore 012345',
  addressComponents: [{ types: ['country'], shortText: 'SG' }],
  attributions: [{ provider: 'Provider', providerUri: 'https://example.com' }],
}
function request(
  body = { name: 'Studio', address: 'Orchard', postalCode: '012345' },
  headers = {},
) {
  return new Request('https://mock/search', {
    method: 'POST',
    headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
function setup(options = {}) {
  const calls = []
  const handler = createHandler({
    env: { ...env, ...options.env },
    timeoutMs: 50,
    fetchImpl: async (url, init) => {
      calls.push({ url, ...init })
      if (url.endsWith('/user'))
        return Response.json({ id: userId }, { status: options.authStatus || 200 })
      if (url.endsWith('reserve_google_place_search'))
        return Response.json(options.reserved || 'ok', { status: options.dbStatus || 200 })
      if (options.timeout) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 100)
          init.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              reject(new Error('secret failure'))
            },
            { once: true },
          )
        })
      }
      if (options.failure) throw new Error('google-secret internal failure')
      return Response.json(options.data || { places: [venue] }, {
        status: options.googleStatus || 200,
      })
    },
  })
  return { handler, calls }
}

test('requires verified authentication before reserving or calling Google', async () => {
  for (const options of [{}, { authStatus: 401 }]) {
    const { handler, calls } = setup(options)
    const response = await handler(
      request(undefined, options.authStatus ? {} : { Authorization: '' }),
    )
    assert.equal(response.status, 401)
    assert.ok(calls.every((call) => call.url.endsWith('/user')))
  }
})

test('handles browser preflight and rejects other methods', async () => {
  const { handler, calls } = setup()
  const response = await handler(new Request('https://mock', { method: 'OPTIONS' }))
  assert.equal(response.status, 204)
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /authorization/)
  assert.equal((await handler(new Request('https://mock'))).status, 405)
  assert.equal(calls.length, 0)
})

test('rejects malformed, oversized and caller-controlled input before reserving usage', async () => {
  const invalid = [
    null,
    [],
    {},
    { name: 12, address: 'Road' },
    { name: ' ', address: 'Road' },
    { name: 'x'.repeat(201), address: 'Road' },
    { name: 'Studio', address: 'x'.repeat(501) },
    { name: 'Studio', address: '' },
    { name: 'Studio', address: 'Road', postalCode: 123456 },
    { name: 'Studio', address: 'Road', postalCode: '12345' },
    { name: 'Studio', address: 'Road', postalCode: '12345x' },
    { name: 'Studio', address: 'Road', fieldMask: '*' },
    { url: 'https://evil.example' },
    { name: 'x'.repeat(5000), address: 'Road' },
  ]
  for (const body of invalid) {
    const { handler, calls } = setup()
    assert.equal((await handler(request(body))).status, 400)
    assert.equal(calls.length, 1)
  }
  const { handler, calls } = setup()
  assert.equal(
    (
      await handler(
        new Request('https://mock', {
          method: 'POST',
          headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json' },
          body: '{broken',
        }),
      )
    ).status,
    400,
  )
  assert.equal((await handler(request(undefined, { 'Content-Type': 'text/plain' }))).status, 400)
  assert.equal(calls.length, 2)
})

test('reserves first, preserves leading zero and uses a fixed endpoint, mask and first page', async () => {
  const { handler, calls } = setup()
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal(calls[1].url, env.SUPABASE_URL + '/rest/v1/rpc/reserve_google_place_search')
  assert.deepEqual(JSON.parse(calls[1].body), { p_user_id: userId })
  assert.equal(calls[2].url, 'https://places.googleapis.com/v1/places:searchText')
  assert.equal(calls[2].headers['X-Goog-FieldMask'], GOOGLE_FIELD_MASK)
  assert.doesNotMatch(GOOGLE_FIELD_MASK, /rating|review|photo|opening/i)
  assert.match(JSON.parse(calls[2].body).textQuery, /012345 Singapore/)
  assert.equal(JSON.parse(calls[2].body).pageSize, 5)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual((await response.json()).candidates, [
    {
      id: venue.id,
      name: 'Studio',
      address: 'Singapore 012345',
      attributions: venue.attributions,
    },
  ])
})

test('excludes foreign, ambiguous-country, duplicate and malformed venues', async () => {
  const { handler } = setup({
    data: {
      places: [
        null,
        {},
        { ...venue, id: 'foreign', addressComponents: [{ types: ['country'], shortText: 'MY' }] },
        { ...venue, id: 'unknown', addressComponents: [] },
        {
          ...venue,
          id: 'ambiguous',
          addressComponents: [...venue.addressComponents, { types: ['country'], shortText: 'MY' }],
        },
        { ...venue, id: 'bad/address' },
        { ...venue, displayName: null },
        venue,
        venue,
      ],
    },
  })
  assert.deepEqual(
    (await (await handler(request())).json()).candidates.map((v) => v.id),
    [venue.id],
  )
  const empty = setup({ data: {} })
  assert.deepEqual(await (await empty.handler(request())).json(), { candidates: [] })
})

test('disabled configuration, exhausted limits and database failures never call Google', async () => {
  for (const options of [
    { env: { GOOGLE_MAPS_API_KEY: '' } },
    { reserved: 'lookup_disabled' },
    { reserved: 'user_limit' },
    { reserved: 'app_limit' },
    { dbStatus: 500 },
    { reserved: 'unexpected' },
  ]) {
    const { handler, calls } = setup(options)
    assert.ok((await handler(request())).status >= 400)
    assert.ok(calls.every((call) => !call.url.includes('googleapis.com')))
  }
})

test('timeout and upstream failures are safe and never refund reserved attempts', async () => {
  for (const options of [
    { timeout: true },
    { failure: true },
    { googleStatus: 429 },
    { data: { places: 'bad' } },
  ]) {
    const { handler, calls } = setup(options)
    const response = await handler(request())
    assert.ok(response.status >= 500)
    assert.deepEqual(await response.json(), { error: 'unavailable' })
    assert.equal(calls.length, 3)
  }
})
