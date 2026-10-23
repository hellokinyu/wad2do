import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

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
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
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
