import { test, expect } from '@playwright/test'
import { signInMockUser } from './helpers/auth'

test.beforeEach(async ({ page }) => {
  await signInMockUser(page)
})

const potteryId = 'fb4101f7-c87f-4238-ac23-800e8f2c496d'
const picnicId = 'd50c48f1-fb26-49c2-8ff5-db44e2010711'
const userId = '5adbd3ea-5d05-4301-a4e9-1da90d4bcd6c'
const groupId = '814f65a7-7837-4da7-94f6-f3dfca0082b4'

const pottery = {
  id: potteryId,
  name: 'Pottery Workshop',
  category: 'Workshops',
  price_per_person: 35,
  price_note: 'Workshop entry. Optional firing costs extra.',
  duration_min: 120,
  indoor: true,
  area: 'Tiong Bahru',
  address: 'Tiong Bahru',
  description: 'Shape a clay bowl in a hands-on pottery session.',
  image_url: '/images/detail-test.svg',
  map_embed_url: 'https://www.google.com/maps/embed?pb=mock-pottery',
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
const googlePottery = { ...pottery, google_place_id: 'test-pottery-place-id' }
const googleDetails = {
  rating: 4.6,
  userRatingCount: 6511,
  currentOpeningHours: {
    weekdayDescriptions: ['Monday: Closed', 'Tuesday: 11:00–17:00'],
  },
  regularOpeningHours: {
    weekdayDescriptions: ['Monday: 10:00–18:00', 'Tuesday: 10:00–18:00'],
  },
  attributions: [{ provider: 'Example provider', providerUri: 'https://example.com/provider' }],
}

async function mockBackend(page, options = {}) {
  const records = options.records ?? [pottery, picnic]
  const state = {
    saved: false,
    shares: [],
    failures: options.failures ?? 0,
    favouriteReads: 0,
    saveFailures: options.saveFailures ?? 0,
    groupFailures: options.groupFailures ?? 0,
    shareFailures: options.shareFailures ?? 0,
    googleRequests: [],
    googleFailures: options.googleFailures ?? 0,
  }
  const failRequest = (route) =>
    route.fulfill({
      status: 500,
      json: { message: 'Demo request failed', code: 'DEMO_FAILURE' },
    })

  await page.route('**/images/detail-test.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#bca68d"/></svg>',
    }),
  )

  // Keep iframe checks repeatable without relying on Google Maps or the network.
  await page.route('https://www.google.com/maps**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Mock activity map</title><p>Pottery map preview</p>',
    }),
  )

  await page.route('**/functions/v1/google-place-details', async (route) => {
    state.googleRequests.push(route.request().postDataJSON())
    expect(route.request().headers().authorization).toMatch(/^Bearer /)
    if (options.stallGoogle && state.googleRequests.length === 1) return
    if (options.googleGate) {
      options.onGoogleRequest()
      await options.googleGate
    }
    if (state.googleFailures > 0) {
      state.googleFailures -= 1
      return route.fulfill({ status: 502, json: { error: 'Google Places request failed' } })
    }
    return route.fulfill({ json: options.googleDetails ?? googleDetails })
  })

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    const id = url.searchParams.get('id')?.replace(/^eq\./, '')
    const method = request.method()
    const headers = { 'access-control-allow-origin': '*' }

    if (table === 'profiles') return route.fulfill({ headers, json: [] })

    if (table === 'activities') {
      expect(method).toBe('GET')
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
        if (state.saveFailures > 0) {
          state.saveFailures -= 1
          return failRequest(route)
        }
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
      if (state.groupFailures > 0) {
        state.groupFailures -= 1
        return failRequest(route)
      }
      return route.fulfill({ headers, json: options.noGroups ? [] : [{ group_id: groupId }] })
    }
    if (table === 'groups') {
      expect(url.searchParams.get('id')).toContain(groupId)
      return route.fulfill({ headers, json: [{ id: groupId, name: 'Saturday Squad' }] })
    }
    if (table === 'group_activities') {
      if (state.shareFailures > 0) {
        state.shareFailures -= 1
        return failRequest(route)
      }
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
  await expect(page.getByTestId('activity-card')).toContainText('S$35.00 / person')
  await expect(page.getByTestId('activity-description')).toHaveText(pottery.description)
  await expect(page.getByTestId('activity-card')).not.toContainText(pottery.price_note)
  await expect(page.getByTestId('activity-card')).toContainText('2 h')
  await expect(page.getByTestId('activity-card')).not.toContainText('Today:')
  await expect(page.getByTestId('activity-card')).not.toContainText('4.7')
  await page.getByRole('link', { name: 'Pottery Workshop', exact: true }).click()

  await expect(page.getByTestId('activity-detail-name')).toHaveText('Pottery Workshop')
  await expect(page.getByTestId('detail-price')).toHaveText('S$35.00')
  await expect(page.getByTestId('detail-price-note')).toHaveText(pottery.price_note)
  await expect(page.getByTestId('detail-duration')).toHaveText('2 h')
  await expect(page.getByTestId('detail-description')).toContainText('Shape a clay bowl')
  await expect(page.getByTestId('detail-photo')).toBeVisible()
  await expect(page.getByTestId('detail-rating')).toContainText('4.7')
  await expect(page.getByTestId('detail-website')).toHaveAttribute(
    'href',
    'https://example.com/pottery',
  )
  const map = page.getByTestId('detail-map')
  await expect(map).toHaveAttribute('src', pottery.map_embed_url)
  await expect(map).toHaveAttribute('title', 'Map showing Pottery Workshop')
  await map.scrollIntoViewIfNeeded()
  await expect(map).toBeVisible()
  await expect(
    page.frameLocator('[data-testid="detail-map"]').getByText('Pottery map preview'),
  ).toBeVisible()
  await expect(page.getByTestId('detail-hours-row')).toHaveCount(7)
  await expect(
    page.getByTestId('detail-location').getByText('Tiong Bahru', { exact: true }),
  ).toHaveCount(1)

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
  const state = await mockBackend(page)
  await page.goto('/activities/' + picnicId)

  await expect(page.getByTestId('detail-price')).toHaveText('Free')
  await expect(page.getByTestId('detail-photo-placeholder')).toBeVisible()
  await expect(page.getByTestId('detail-description')).toContainText("hasn't been added")
  await expect(page.getByTestId('detail-hours-unavailable')).toBeVisible()
  await expect(page.getByTestId('detail-rating')).toHaveCount(0)
  await expect(page.getByTestId('detail-rating-source')).toHaveCount(0)
  await expect(page.getByTestId('detail-website')).toHaveCount(0)
  const map = new URL(await page.getByTestId('detail-map').getAttribute('src'))
  expect(map.searchParams.get('q')).toBe('8 Marina Gardens Dr, Singapore')
  expect(map.searchParams.get('output')).toBe('embed')
  await expect(page.getByTestId('detail-tags').getByText('Outdoor', { exact: true })).toHaveCount(1)
  await expect(page.getByTestId('detail-location')).toContainText('8 Marina Gardens Dr')
  await expect(page.getByTestId('detail-location')).toContainText('Marina Bay')
  expect(state.googleRequests).toHaveLength(0)

  await page.getByTestId('activity-back').click()
  await expect(page.getByTestId('activities-page')).toBeVisible()
})

test('community activities with a Place ID use an address embed rather than a globe', async ({
  page,
}) => {
  const placeId = 'ChIJ6etOYDQZ2jERlLhZt3ShWI8'
  await mockBackend(page, {
    records: [
      {
        ...pottery,
        name: 'Sim Racing at Funan mall',
        source: 'community',
        google_place_id: placeId,
        address: '107 North Bridge Road',
        area: 'City / Downtown',
        map_embed_url: null,
      },
    ],
  })
  await page.goto('/activities/' + potteryId)
  const map = page.getByTestId('detail-map')
  const url = new URL(await map.getAttribute('src'))
  expect(url.searchParams.get('q')).toBe('107 North Bridge Road, Singapore')
  expect(url.searchParams.get('z')).toBe('16')
  expect(url.searchParams.get('output')).toBe('embed')
  await expect(map).toHaveAttribute('title', 'Map showing Sim Racing at Funan mall')
  await expect(page.getByTestId('detail-tags')).toContainText('Community')
})

test('Google details replace stored ratings and hours, with review count and attribution', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-13T12:00:00+08:00'))
  const state = await mockBackend(page, { records: [googlePottery] })
  await page.goto('/activities/' + potteryId)

  await expect(page.getByTestId('detail-rating')).toContainText('4.6')
  await expect(page.getByTestId('detail-rating')).toContainText('Google Maps')
  await expect(page.getByTestId('detail-review-count')).toHaveText('6,511 reviews')
  await expect(page.getByTestId('detail-hours-source')).toHaveText('Google Maps')
  const today = page.getByTestId('detail-hours-row').filter({ hasText: 'Tuesday' })
  await expect(today).toContainText('11:00–17:00')
  await expect(today).toHaveAttribute('aria-current', 'date')
  await expect(page.getByTestId('detail-google-attribution').getByRole('link')).toHaveAttribute(
    'href',
    'https://example.com/provider',
  )
  expect(state.googleRequests).toEqual([{ activityId: potteryId }])
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('weekdayDescriptions')
  await page.screenshot({ path: test.info().outputPath('google-details.png'), fullPage: true })
})

test('abbreviated Google weekdays override saved hours, including overnight and closed days', async ({
  page,
}) => {
  await mockBackend(page, {
    records: [googlePottery],
    googleDetails: {
      currentOpeningHours: {
        weekdayDescriptions: [
          'Mon: 09:00–19:00',
          'tue: Closed',
          'WED: Open 24 hours',
          'Thu: 10:00–20:00',
          'Fri: 10:00–21:00',
          'Sat: 10:00–22:00',
          'Sun: 18:00–06:00',
        ],
      },
    },
  })
  await page.goto('/activities/' + potteryId)

  await expect(page.getByTestId('detail-hours-source')).toHaveText('Google Maps')
  for (const [day, hours] of [
    ['Monday', '09:00–19:00'],
    ['Tuesday', 'Closed'],
    ['Wednesday', 'Open 24 hours'],
    ['Thursday', '10:00–20:00'],
    ['Friday', '10:00–21:00'],
    ['Saturday', '10:00–22:00'],
    ['Sunday', '18:00–06:00'],
  ]) {
    await expect(page.getByTestId('detail-hours-row').filter({ hasText: day })).toContainText(hours)
  }
  await expect(page.getByText('Showing saved activity hours.')).toHaveCount(0)
})

test('Google hours fall back to regular hours and missing ratings stay unavailable', async ({
  page,
}) => {
  await mockBackend(page, {
    records: [googlePottery],
    googleDetails: { regularOpeningHours: googleDetails.regularOpeningHours },
  })
  await page.goto('/activities/' + potteryId)

  await expect(page.getByTestId('detail-hours-source')).toBeVisible()
  await expect(page.getByTestId('detail-hours-row').filter({ hasText: 'Monday' })).toContainText(
    '10:00–18:00',
  )
  await expect(page.getByTestId('detail-rating')).toHaveCount(0)
  await expect(page.getByTestId('detail-review-count')).toHaveCount(0)
})

test('a Google review count has attribution even without a rating or Google hours', async ({
  page,
}) => {
  await mockBackend(page, {
    records: [googlePottery],
    googleDetails: { userRatingCount: 0 },
  })
  await page.goto('/activities/' + potteryId)

  const reviews = page.getByTestId('detail-review-count')
  await expect(reviews).toHaveText('0 reviews')
  await expect(page.getByTestId('detail-rating')).toHaveCount(0)
  await expect(page.getByTestId('detail-hours-source')).toHaveCount(0)
  const source = reviews.locator('..').getByTestId('detail-rating-source')
  await expect(source).toHaveText('Google Maps')
  await expect(source).toHaveAttribute('translate', 'no')
})

test('missing Google hours keep saved activity hours and unsafe attribution links stay text', async ({
  page,
}) => {
  await mockBackend(page, {
    records: [googlePottery],
    googleDetails: {
      rating: 4.2,
      userRatingCount: 0,
      attributions: [{ provider: 'Example provider', providerUri: 'javascript:alert(1)' }],
    },
  })
  await page.goto('/activities/' + potteryId)

  await expect(page.getByTestId('detail-rating')).toContainText('4.2')
  await expect(page.getByTestId('detail-review-count')).toHaveText('0 reviews')
  await expect(page.getByTestId('detail-hours-source')).toHaveCount(0)
  await expect(page.getByText('Showing saved activity hours.')).toBeVisible()
  await expect(page.getByTestId('detail-hours-row').filter({ hasText: 'Monday' })).toContainText(
    'Closed',
  )
  await expect(page.getByTestId('detail-google-attribution')).toHaveText('Example provider')
  await expect(page.getByTestId('detail-google-attribution').getByRole('link')).toHaveCount(0)
})

test('Google loading leaves the activity usable and failed requests can be retried', async ({
  page,
}) => {
  let releaseGoogle
  let startedGoogle
  const googleGate = new Promise((resolve) => {
    releaseGoogle = resolve
  })
  const googleStarted = new Promise((resolve) => {
    startedGoogle = resolve
  })
  const state = await mockBackend(page, {
    records: [googlePottery],
    googleFailures: 1,
    googleGate,
    onGoogleRequest: startedGoogle,
  })
  await page.goto('/activities/' + potteryId)
  await googleStarted

  await expect(page.getByTestId('detail-google-loading')).toBeVisible()
  await expect(page.getByTestId('activity-detail-name')).toHaveText(pottery.name)
  await expect(page.getByTestId('detail-share')).toBeEnabled()
  await expect(page.getByTestId('detail-rating')).toHaveCount(0)
  releaseGoogle()

  await expect(page.getByTestId('detail-google-error')).toBeVisible()
  await expect(page.getByTestId('detail-error')).toHaveCount(0)
  await expect(page.getByTestId('detail-hours-row').filter({ hasText: 'Monday' })).toContainText(
    'Closed',
  )
  await page.getByTestId('detail-google-retry').click()
  await expect(page.getByTestId('detail-rating')).toContainText('4.6')
  await expect(page.getByTestId('detail-google-error')).toHaveCount(0)
  expect(state.googleRequests).toEqual([{ activityId: potteryId }, { activityId: potteryId }])
})

test('a stalled Google request times out and can be retried without reloading the activity', async ({
  page,
}) => {
  await page.clock.install()
  const state = await mockBackend(page, { records: [googlePottery], stallGoogle: true })
  await page.goto('/activities/' + potteryId)

  await expect(page.getByTestId('detail-google-loading')).toBeVisible()
  await expect.poll(() => state.googleRequests.length).toBe(1)
  await page.clock.fastForward(15000)

  await expect(page.getByTestId('detail-google-error')).toBeVisible()
  await expect(page.getByTestId('detail-google-loading')).toHaveCount(0)
  await expect(page.getByTestId('detail-error')).toHaveCount(0)
  await expect(page.getByTestId('detail-share')).toBeEnabled()
  await expect(page.getByText('Showing saved activity hours.')).toBeVisible()
  await page.getByTestId('detail-google-retry').click()
  await expect(page.getByTestId('detail-rating')).toContainText('4.6')
  await expect(page.getByTestId('detail-google-error')).toHaveCount(0)
  expect(state.googleRequests).toEqual([{ activityId: potteryId }, { activityId: potteryId }])
})

test('a late Google response cannot appear on another activity', async ({ page }) => {
  let releaseGoogle
  let startedGoogle
  const googleGate = new Promise((resolve) => {
    releaseGoogle = resolve
  })
  const googleStarted = new Promise((resolve) => {
    startedGoogle = resolve
  })
  await mockBackend(page, {
    records: [googlePottery, picnic],
    googleGate,
    onGoogleRequest: startedGoogle,
  })
  await page.goto('/activities/' + potteryId)
  await googleStarted
  await page.getByRole('link', { name: 'Activities', exact: true }).click()
  await page.getByRole('link', { name: picnic.name, exact: true }).click()
  await expect(page.getByTestId('activity-detail-name')).toHaveText(picnic.name)

  const oldResponse = page.waitForResponse('**/functions/v1/google-place-details')
  releaseGoogle()
  await oldResponse
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await expect(page.getByTestId('detail-rating')).toHaveCount(0)
  await expect(page.getByTestId('detail-hours-source')).toHaveCount(0)
  await expect(page.getByTestId('detail-google-error')).toHaveCount(0)
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

test('signed-in user saves, reloads, removes and shares to their group', async ({ page }) => {
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

test('failed Save, group loading and Share can be retried without a false success', async ({
  page,
}) => {
  const state = await mockBackend(page, { saveFailures: 1, groupFailures: 1, shareFailures: 1 })
  await page.goto('/activities/' + potteryId)

  await page.getByTestId('detail-save').click()
  await expect(page.getByTestId('detail-action-error')).toContainText("Couldn't update")
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'false')
  expect(state.saved).toBe(false)
  await page.getByTestId('detail-save').click()
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('detail-share').click()
  const dialog = page.getByTestId('detail-share-dialog')
  await expect(dialog).toContainText("Couldn't load your groups")
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.getByTestId('detail-share-group').selectOption(groupId)
  await page.getByTestId('detail-confirm-share').click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("Couldn't share this activity")
  expect(state.shares).toHaveLength(0)

  await page.getByTestId('detail-confirm-share').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('detail-toast')).toContainText('Shared to Saturday Squad')
  expect(state.shares).toHaveLength(1)
})

test('a user without groups can close the share menu and reach Create group', async ({ page }) => {
  await mockBackend(page, { noGroups: true })
  await page.goto('/activities/' + potteryId)
  await page.getByTestId('detail-share').click()
  await expect(page.getByTestId('detail-no-groups')).toBeVisible()
  await expect(page.getByTestId('detail-confirm-share')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('detail-share-dialog')).toBeHidden()

  await page.getByTestId('detail-share').click()
  await expect(page.getByTestId('detail-no-groups')).toBeVisible()
  await page.getByRole('link', { name: 'Create a new group', exact: true }).click()
  await expect(page).toHaveURL(/\/groups$/)
})

test('phone detail page fits the viewport and falls back from a broken photo', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockBackend(page, {
    records: [
      {
        ...googlePottery,
        image_url: '/images/missing-demo-photo.jpg',
        website: 'javascript:alert(1)',
      },
    ],
  })
  await page.goto('/activities/' + potteryId)

  await expect(page.getByTestId('detail-photo-placeholder')).toBeVisible()
  await expect(page.getByTestId('detail-website')).toHaveCount(0)
  await expect(page.getByTestId('detail-share')).toBeVisible()
  await expect(page.getByTestId('detail-rating')).toContainText('4.6')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({
    path: test.info().outputPath('google-details-phone.png'),
    fullPage: true,
  })
})
