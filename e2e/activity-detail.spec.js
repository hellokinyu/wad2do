import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const potteryId = 'fb4101f7-c87f-4238-ac23-800e8f2c496d'
const picnicId = 'd50c48f1-fb26-49c2-8ff5-db44e2010711'
const userId = '5adbd3ea-5d05-4301-a4e9-1da90d4bcd6c'
const groupId = '814f65a7-7837-4da7-94f6-f3dfca0082b4'

const pottery = {
  id: potteryId,
  name: 'Pottery Workshop',
  category: 'Workshops',
  price_per_person: 35,
  duration_min: 120,
  indoor: true,
  area: 'Tiong Bahru',
  address: 'Tiong Bahru',
  description: 'Shape a clay bowl in a hands-on pottery session.',
  image_url: '/images/detail-test.svg',
  source: 'community',
  rating: 4.7,
  website: 'https://example.com/pottery',
  opening_hours: {
    Mon: { closed: true },
    Tue: { open: '10:00', close: '18:00' },
    Wed: { open: '10:00', close: '18:00' },
    Thu: { open24h: true },
    Fri: { open: '10:00', close: '20:00' },
    Sat: { open: '10:00', close: '20:00' },
    Sun: { closed: true },
  },
}
const picnic = {
  id: picnicId,
  name: 'Picnic at Marina Barrage',
  category: 'Outdoor',
  price_per_person: 0,
  duration_min: 120,
  indoor: false,
  area: 'Marina Bay',
  address: '8 Marina Gardens Dr',
  source: 'curated',
}

async function signInMockUser(page) {
  // A fake session is used only with mocked Supabase endpoints.
  const url = loadEnv('test', process.cwd()).VITE_SUPABASE_URL
  const storageKey = 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token'
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const user = {
    id: userId,
    email: 'demo@example.com',
    aud: 'authenticated',
    role: 'authenticated',
  }
  const session = {
    access_token: [
      encode({ alg: 'HS256', typ: 'JWT' }),
      encode({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: 4102444800 }),
      'test-signature',
    ].join('.'),
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_at: 4102444800,
    expires_in: 3600,
    user,
  }
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    { key: storageKey, value: session },
  )
  await page.route('**/auth/v1/user*', (route) => route.fulfill({ json: user }))
}

async function mockBackend(page, options = {}) {
  const records = options.records ?? [pottery, picnic]
  const state = { saved: false, shares: [], failures: options.failures ?? 0, favouriteReads: 0 }

  await page.route('**/images/detail-test.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#bca68d"/></svg>',
    }),
  )

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    const method = request.method()
    const headers = { 'access-control-allow-origin': '*' }

    if (table === 'activities') {
      if (id && state.failures > 0) {
        state.failures -= 1
        return route.fulfill({
          status: 400,
          headers,
          json: { message: 'Demo read failed', code: 'DEMO_FAILURE' },
        })
      }
      return route.fulfill({
        headers,
        json: id ? (records.find((record) => record.id === id) ?? null) : records,
      })
    }

    if (table === 'favourites') {
      if (method === 'POST') {
        expect(request.postDataJSON()).toEqual({ user_id: userId, activity_id: potteryId })
        state.saved = true
        return route.fulfill({ status: 201, headers, json: {} })
      }
      if (method === 'DELETE') {
        expect(url.searchParams.get('user_id')).toBe('eq.' + userId)
        expect(url.searchParams.get('activity_id')).toBe('eq.' + potteryId)
        state.saved = false
        return route.fulfill({ headers, json: [{ activity_id: potteryId }] })
      }
      const savedAtRequest = state.saved
      state.favouriteReads += 1
      if (options.initialReadGate && state.favouriteReads === 1) {
        options.onInitialRead()
        await options.initialReadGate
      }
      return route.fulfill({ headers, json: savedAtRequest ? [{ activity_id: potteryId }] : [] })
    }

    if (table === 'group_members') {
      expect(url.searchParams.get('user_id')).toBe('eq.' + userId)
      return route.fulfill({ headers, json: [{ group_id: groupId }] })
    }
    if (table === 'groups') {
      expect(url.searchParams.get('id')).toContain(groupId)
      return route.fulfill({ headers, json: [{ id: groupId, name: 'Saturday Squad' }] })
    }
    if (table === 'group_activities') {
      state.shares.push(request.postDataJSON())
      return route.fulfill({ status: 201, headers, json: {} })
    }

    return route.fulfill({ status: 404, headers, json: { message: 'Unexpected mock table' } })
  })
  return state
}

test('card opens its details and Back restores the current search', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00+08:00'))
  await mockBackend(page)
  await page.goto('/activities')

  await page.getByTestId('activity-search').fill('Pottery')
  await expect(page.getByTestId('activity-card')).toHaveCount(1)
  await page.getByRole('link', { name: 'Pottery Workshop', exact: true }).click()

  await expect(page.getByTestId('activity-detail-name')).toHaveText('Pottery Workshop')
  await expect(page.getByTestId('detail-price')).toHaveText('S$35.00')
  await expect(page.getByTestId('detail-duration')).toHaveText('2 h')
  await expect(page.getByTestId('detail-description')).toContainText('Shape a clay bowl')
  await expect(page.getByTestId('detail-photo')).toBeVisible()
  await expect(page.getByTestId('detail-rating')).toContainText('4.7')
  await expect(page.getByTestId('detail-website')).toHaveAttribute(
    'href',
    'https://example.com/pottery',
  )
  await expect(page.getByTestId('detail-map')).toHaveAttribute('href', /query=Tiong%20Bahru/)
  await expect(page.getByTestId('detail-hours-row')).toHaveCount(7)

  const today = page.getByTestId('detail-hours-row').filter({ hasText: 'Tuesday' })
  await expect(today).toHaveAttribute('aria-current', 'date')
  await expect(today).toContainText('10:00–18:00')
  await expect(page.getByTestId('detail-hours-row').filter({ hasText: 'Monday' })).toContainText(
    'Closed',
  )

  await page.getByTestId('activity-back').click()
  await expect(page.getByTestId('activities-page')).toBeVisible()
  await expect(page.getByTestId('activity-search')).toHaveValue('Pottery')
  await expect(page.getByTestId('activity-card')).toHaveCount(1)
})

test('direct visit handles missing metadata and has a safe Back destination', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/activities/' + picnicId)

  await expect(page.getByTestId('detail-price')).toHaveText('Free')
  await expect(page.getByTestId('detail-photo-placeholder')).toBeVisible()
  await expect(page.getByTestId('detail-description')).toContainText("hasn't been added")
  await expect(page.getByTestId('detail-hours-unavailable')).toBeVisible()
  await expect(page.getByTestId('detail-rating')).toHaveCount(0)
  await expect(page.getByTestId('detail-website')).toHaveCount(0)

  await page.getByTestId('activity-back').click()
  await expect(page.getByTestId('activities-page')).toBeVisible()
})

test('unknown activity shows a missing-record state', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/activities/274b5b2e-534a-479d-80bf-65d554b37fd8')
  await expect(page.getByTestId('detail-not-found')).toBeVisible()
})

test('detail request failure can be retried', async ({ page }) => {
  await mockBackend(page, { failures: 1 })
  await page.goto('/activities/' + potteryId)
  await expect(page.getByTestId('detail-error')).toBeVisible()
  await page.getByTestId('detail-retry').click()
  await expect(page.getByTestId('activity-detail-name')).toHaveText('Pottery Workshop')
})

test('signed-out Save and Share show a login prompt', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/activities/' + potteryId)
  await page.getByTestId('detail-save').click()
  await expect(page.getByTestId('detail-action-error')).toContainText('Log in')
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('detail-share').click()
  await expect(page.getByTestId('detail-share-dialog')).toBeHidden()
  await expect(
    page.getByTestId('detail-action-error').getByRole('link', { name: 'Log in' }),
  ).toHaveAttribute('href', '/login')
})

test('signed-in user saves, reloads, removes and shares to their group', async ({ page }) => {
  await signInMockUser(page)
  const state = await mockBackend(page)
  await page.goto('/activities/' + potteryId)

  await page.getByTestId('detail-save').click()
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'true')
  expect(state.saved).toBe(true)

  await page.reload()
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('detail-save').click()
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'false')
  expect(state.saved).toBe(false)

  await page.getByTestId('detail-share').click()
  await expect(page.getByTestId('detail-share-dialog')).toBeVisible()
  await page.getByTestId('detail-share-group').selectOption(groupId)
  await page.getByTestId('detail-confirm-share').click()
  await expect(page.getByTestId('detail-share-dialog')).toBeHidden()
  await expect(page.getByTestId('detail-toast')).toContainText('Shared to Saturday Squad')
  expect(state.shares).toEqual([{ group_id: groupId, activity_id: potteryId, shared_by: userId }])
})

test('a delayed initial favourite read cannot undo a successful Save click', async ({ page }) => {
  await signInMockUser(page)
  let releaseRead
  let startedRead
  const initialReadGate = new Promise((resolve) => {
    releaseRead = resolve
  })
  const initialReadStarted = new Promise((resolve) => {
    startedRead = resolve
  })
  await mockBackend(page, { initialReadGate, onInitialRead: startedRead })

  await page.goto('/activities/' + potteryId)
  await initialReadStarted
  await page.getByTestId('detail-save').click()
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'true')

  const oldResponse = page.waitForResponse((response) =>
    response.url().includes('/rest/v1/favourites'),
  )
  releaseRead()
  await oldResponse
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'true')
})

test('phone detail page fits the viewport and falls back from a broken photo', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockBackend(page, {
    records: [
      { ...pottery, image_url: '/images/missing-demo-photo.jpg', website: 'javascript:alert(1)' },
    ],
  })
  await page.goto('/activities/' + potteryId)

  await expect(page.getByTestId('detail-photo-placeholder')).toBeVisible()
  await expect(page.getByTestId('detail-website')).toHaveCount(0)
  await expect(page.getByTestId('detail-share')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})
