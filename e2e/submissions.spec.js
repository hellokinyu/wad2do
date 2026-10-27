import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'
import { mockPlaceSearch, placeCandidates } from './helpers/places'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

async function mockBackend(page, failures = 0) {
  const state = { attempts: [], saved: [], loseNextResponse: false, readFailures: 0 }
  await signInMockUser(page)
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    const headers = { 'access-control-allow-origin': '*' }
    if (table === 'submissions' && request.method() === 'POST') {
      const record = request.postDataJSON()
      state.attempts.push(record)
      if (failures > 0) {
        failures -= 1
        return route.fulfill({ status: 403, headers, json: { message: 'Permission denied' } })
      }
      if (state.saved.some((saved) => saved.id === record.id)) {
        return route.fulfill({
          status: 409,
          headers,
          json: { code: '23505', message: 'Duplicate ID' },
        })
      }
      state.saved.push({ ...record, id: record.id ?? crypto.randomUUID(), reject_reason: null })
      if (state.loseNextResponse) {
        state.loseNextResponse = false
        return route.abort('failed')
      }
      return route.fulfill({ status: 201, headers, body: '' })
    }
    if (table === 'submissions') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      const owner = url.searchParams.get('submitted_by')?.replace(/^eq\./, '')
      if (id && state.readFailures > 0) {
        state.readFailures -= 1
        return route.fulfill({ status: 403, headers, json: { message: 'Read denied' } })
      }
      return route.fulfill({
        headers,
        json: state.saved.filter(
          (saved) => (!id || saved.id === id) && (!owner || saved.submitted_by === owner),
        ),
      })
    }
    if (table === 'profiles') {
      return route.fulfill({ headers, json: { display_name: 'Demo', interests: [], company: [] } })
    }
    if (table === 'favourites' || table === 'activities')
      return route.fulfill({ headers, json: [] })
    return route.abort()
  })
  return state
}

async function fillActivity(page) {
  await page.getByTestId('submission-name').fill('  Weekend art studio  ')
  await page.getByTestId('submission-category').selectOption('Arts and culture')
  await page.getByTestId('submission-duration').selectOption('90')
  await page.getByTestId('submission-price').fill('25.50')
  await page.getByTestId('submission-setting').selectOption('indoor')
  await page.getByTestId('submission-address').fill('  10 Orchard Road  ')
  await page.getByTestId('submission-area').selectOption('Orchard')
  for (const day of days) await page.getByTestId(`hours-${day}-mode`).selectOption('closed')
  await page.getByTestId('hours-Sat-mode').selectOption('open')
  await page.getByTestId('hours-Sat-open').fill('10:00')
  await page.getByTestId('hours-Sat-close').fill('18:00')
  await page.getByTestId('hours-Sun-mode').selectOption('24h')
}

for (const width of [1280, 375]) {
  test(`submits an activity and shows pending in Profile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    const state = await mockBackend(page)
    await page.goto('/activities')
    await page.getByTestId('submit-activity-button').click()
    await expect(page).toHaveURL(/\/activities\/submit$/)
    await expect(page.getByRole('main')).toHaveCount(1)
    await fillActivity(page)
    const free = width === 375
    await page.getByTestId('submission-free').setChecked(free)
    await expect(page.getByTestId('submission-price')).toHaveJSProperty('disabled', free)
    await page.getByTestId('submission-setting').selectOption(free ? 'outdoor' : 'indoor')
    await page
      .getByTestId('submission-description')
      .fill(free ? '' : '  Try a weekend art session.  ')
    await page.getByTestId('submission-website').fill(free ? '' : 'https://example.com/studio')
    await page.getByTestId('hours-Sat-open').fill(free ? '10:00' : '20:00')
    await page.getByTestId('hours-Sat-close').fill(free ? '18:00' : '02:00')
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    )
    await page.getByTestId('submission-submit').click()
    await expect(page.getByTestId('submission-success')).toBeVisible()
    await expect(page.getByTestId('submission-form')).toHaveCount(0)
    expect(state.attempts).toHaveLength(1)
    expect(state.saved[0]).toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      submitted_by: mockUser.id,
      name: 'Weekend art studio',
      category: 'Arts and culture',
      price_per_person: free ? 0 : 25.5,
      duration_min: 90,
      indoor: !free,
      address: '10 Orchard Road',
      postal_code: null,
      google_place_id: null,
      area: 'Orchard',
      opening_hours: {
        Mon: { closed: true },
        Tue: { closed: true },
        Wed: { closed: true },
        Thu: { closed: true },
        Fri: { closed: true },
        Sat: { open: free ? '10:00' : '20:00', close: free ? '18:00' : '02:00' },
        Sun: { open24h: true },
      },
      description: free ? null : 'Try a weekend art session.',
      website: free ? null : 'https://example.com/studio',
      status: 'pending',
      reject_reason: null,
    })
    await page.getByTestId('view-submissions').click()
    const id = state.saved[0].id
    await expect(page.getByTestId(`submission-${id}`)).toContainText('Weekend art studio')
    await expect(page.getByTestId(`submission-status-${id}`)).toHaveText('Pending')
  })
}

test('keeps entries after a failed save and allows retry', async ({ page }) => {
  const state = await mockBackend(page, 1)
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't submit")
  await expect(page.getByTestId('submission-name')).toHaveValue('  Weekend art studio  ')
  await expect(page.getByTestId('hours-Sat-open')).toHaveValue('10:00')
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
  await page.getByTestId('submission-name').fill('Updated art studio')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.attempts).toHaveLength(2)
  expect(state.saved).toHaveLength(1)
  expect(state.attempts[1].id).toBe(state.attempts[0].id)
  expect(state.saved[0].name).toBe('Updated art studio')
})

test('retry after a lost save response confirms the original without duplicating it', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.loseNextResponse = true
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  expect(state.saved).toHaveLength(1)
  await page.getByTestId('submission-name').fill('Edits after the first attempt')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.saved).toHaveLength(1)
  await expect(page.getByTestId('submission-recovered')).toContainText(
    'Any changes made since then were not submitted',
  )
  expect(state.saved[0].name).toBe('Weekend art studio')
  expect(state.attempts).toHaveLength(2)
  expect(state.attempts[1].id).toBe(state.attempts[0].id)
})

test('failed confirmation keeps the form and another retry still creates no duplicate', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.loseNextResponse = true
  state.readFailures = 1
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  await expect(page.getByTestId('submission-form')).toBeVisible()
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
  expect(state.attempts).toHaveLength(2)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.saved).toHaveLength(1)
  expect(state.attempts).toHaveLength(3)
  expect(new Set(state.attempts.map((attempt) => attempt.id)).size).toBe(1)
})

test('a duplicate error without a saved record does not show success', async ({ page }) => {
  await mockBackend(page)
  await page.route('**/rest/v1/submissions*', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({
      status: 409,
      json: { code: '23505', message: 'Other unique constraint' },
    })
  })
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  await expect(page.getByTestId('submission-success')).toHaveCount(0)
  await expect(page.getByTestId('submission-name')).toHaveValue('  Weekend art studio  ')
})

test('rejects missing fields, blank names, ambiguous hours and unsafe websites', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/activities/submit')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-name')).toBeFocused()
  await fillActivity(page)
  await page.getByTestId('submission-name').fill('   ')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText('Complete all required fields')
  await page.getByTestId('submission-name').fill('Art studio')
  await page.getByTestId('hours-Sat-close').fill('10:00')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText(
    'different opening and closing times',
  )
  await page.getByTestId('hours-Sat-close').fill('18:00')
  await page.getByTestId('submission-website').fill('javascript:alert(1)')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText('https:// or http://')
  await page.getByTestId('submission-website').fill('')
  for (const day of days) await page.getByTestId(`hours-${day}-mode`).selectOption('closed')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText('open on at least one day')
  expect(state.attempts).toHaveLength(0)
})

for (const width of [1280, 375]) {
  test(`selects an explicit venue with keyboard and saves only its ID at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 })
    const state = await mockBackend(page)
    const lookup = await mockPlaceSearch(page)
    await page.goto('/activities/submit')
    await fillActivity(page)
    await page.getByTestId('place-postal-code').fill('012345')
    await page.getByTestId('place-find').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('place-candidate')).toHaveCount(2)
    await expect(page.getByTestId('place-link')).toHaveCount(0)
    expect(state.attempts).toHaveLength(0)
    expect(lookup.requests).toEqual([
      { name: 'Weekend art studio', address: '10 Orchard Road', postalCode: '012345' },
    ])
    await expect(page.getByText('Google Maps', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Example provider' })).toHaveAttribute(
      'href',
      'https://example.com/provider',
    )
    await page.getByTestId('place-candidate').nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('place-selected')).toContainText('Google studio two')
    await expect(page.getByTestId('submission-name')).toHaveValue('  Weekend art studio  ')
    await expect(page.getByTestId('submission-address')).toHaveValue('  10 Orchard Road  ')
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    )
    await page.getByTestId('submission-submit').click()
    await expect(page.getByTestId('submission-success')).toBeVisible()
    expect(state.saved[0]).toMatchObject({
      google_place_id: placeCandidates[1].id,
      postal_code: '012345',
      name: 'Weekend art studio',
    })
    expect(JSON.stringify(state.saved)).not.toContain('Google studio')
  })
}

test('invalid postal code cannot trigger a lookup or a submission', async ({ page }) => {
  const state = await mockBackend(page)
  const lookup = await mockPlaceSearch(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('place-postal-code').fill('12345x')
  await page.getByTestId('place-find').click()
  await expect(page.getByTestId('place-error')).toContainText('six-digit')
  await page.getByTestId('submission-submit').click()
  expect(lookup.requests).toHaveLength(0)
  expect(state.attempts).toHaveLength(0)
})

for (const options of [
  { candidates: [] },
  { status: 503, error: 'unavailable' },
  { status: 503, error: 'lookup_disabled' },
  { status: 429, error: 'app_limit' },
]) {
  test(`lookup ${options.error || 'no match'} preserves entries and allows manual submission`, async ({
    page,
  }) => {
    const state = await mockBackend(page)
    await mockPlaceSearch(page, options)
    await page.goto('/activities/submit')
    await fillActivity(page)
    await page.getByTestId('place-find').click()
    await expect(page.getByTestId('place-find')).toBeEnabled()
    await expect(page.getByTestId('submission-name')).toHaveValue('  Weekend art studio  ')
    await expect(page.getByTestId('hours-Sat-open')).toHaveValue('10:00')
    await expect(page.getByTestId('place-candidate')).toHaveCount(0)
    await page.getByTestId('submission-submit').click()
    await expect(page.getByTestId('submission-success')).toBeVisible()
    expect(state.saved[0].google_place_id).toBeNull()
  })
}

test('a stalled lookup times out and leaves the complete form usable', async ({ page }) => {
  await mockBackend(page)
  await mockPlaceSearch(page, { stall: true })
  await page.clock.install()
  await page.goto('/activities/submit')
  await fillActivity(page)
  const sent = page.waitForRequest('**/functions/v1/google-place-search')
  await page.getByTestId('place-find').click()
  await sent
  await page.clock.fastForward(12001)
  await expect(page.getByTestId('place-error')).toContainText("Couldn't find locations")
  await expect(page.getByTestId('submission-address')).toHaveValue('  10 Orchard Road  ')
  await expect(page.getByTestId('place-find')).toBeEnabled()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
})

test('editing each location input clears selection, and Clear never submits', async ({ page }) => {
  const state = await mockBackend(page)
  await mockPlaceSearch(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  for (const [field, value] of [
    ['submission-name', 'Another studio'],
    ['submission-address', '20 Orchard Road'],
    ['place-postal-code', '012346'],
  ]) {
    await page.getByTestId('place-find').click()
    await page.getByTestId('place-candidate').first().click()
    await page.getByTestId(field).fill(value)
    await expect(page.getByTestId('place-link')).toHaveCount(0)
    await expect(page.getByTestId('place-candidate')).toHaveCount(0)
  }
  await page.getByTestId('place-find').click()
  await page.getByTestId('place-candidate').first().click()
  await page.getByTestId('place-clear').click()
  await expect(page.getByTestId('place-link')).toHaveCount(0)
  expect(state.attempts).toHaveLength(0)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.saved[0].google_place_id).toBeNull()
})

test('old requests cannot restore results after input changes, newer searches or navigation', async ({
  page,
}) => {
  await mockBackend(page)
  const releases = []
  await page.route('**/functions/v1/google-place-search', async (route) => {
    await new Promise((resolve) => releases.push(resolve))
    await route.fulfill({ json: { candidates: [placeCandidates[0]] } }).catch(() => {})
  })
  await page.goto('/activities/submit')
  await fillActivity(page)
  const first = page.waitForRequest('**/functions/v1/google-place-search')
  await page.getByTestId('place-find').click()
  await first
  await page.getByTestId('submission-name').fill('New studio')
  const second = page.waitForRequest('**/functions/v1/google-place-search')
  await page.getByTestId('place-find').click()
  await second
  releases[0]()
  await expect(page.getByTestId('place-find')).toBeDisabled()
  await expect(page.getByTestId('place-candidate')).toHaveCount(0)
  await page.getByRole('link', { name: '← Back to Activities' }).click()
  await expect(page).toHaveURL('/activities')
  releases[1]()
  await page.getByTestId('submit-activity-button').click()
  await expect(page.getByTestId('place-candidate')).toHaveCount(0)
  await expect(page.getByTestId('place-link')).toHaveCount(0)
  await expect(page.getByTestId('place-find')).toBeEnabled()
})

test('lost-response recovery keeps the original Place ID and warns that later edits were not saved', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await mockPlaceSearch(page)
  state.loseNextResponse = true
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('place-find').click()
  await page.getByTestId('place-candidate').first().click()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  await page.getByTestId('place-clear').click()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-recovered')).toContainText('were not submitted')
  expect(state.saved).toHaveLength(1)
  expect(state.saved[0].google_place_id).toBe(placeCandidates[0].id)
  expect(state.attempts[1].id).toBe(state.attempts[0].id)
})

test('another lookup retains the chosen venue until an explicit replacement is selected', async ({
  page,
}) => {
  const state = await mockBackend(page)
  const options = {}
  await mockPlaceSearch(page, options)
  await page.clock.install()
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('place-find').click()
  await page.getByTestId('place-candidate').first().click()

  options.stall = true
  const sent = page.waitForRequest('**/functions/v1/google-place-search')
  await page.getByTestId('place-find').click()
  await sent
  await page.clock.fastForward(12001)
  await expect(page.getByTestId('place-error')).toContainText("Couldn't find locations")
  await expect(page.getByRole('link', { name: 'Inspect suggested venue' })).toHaveAttribute(
    'href',
    /query_place_id=ChIJ_studio_one/,
  )

  options.stall = false
  await page.getByTestId('place-find').click()
  await expect(page.getByTestId('place-candidate')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Inspect suggested venue' })).toHaveAttribute(
    'href',
    /query_place_id=ChIJ_studio_one/,
  )
  await expect(page.getByText('Choose a match to replace your current venue link.')).toBeVisible()
  await page.getByTestId('place-candidate').nth(1).click()
  await expect(page.getByTestId('place-selected')).toContainText('Google studio two')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.saved[0].google_place_id).toBe(placeCandidates[1].id)
})
