import { Buffer } from 'node:buffer'
import { photoFile } from './helpers/photos'
import { authStorageKey } from './helpers/auth'
import { test, expect } from '@playwright/test'
import { mockSession, mockUser, signInMockUser } from './helpers/auth'
import { mockPlaceSearch, placeCandidates } from './helpers/places'

async function mockBackend(page, failures = 0) {
  const state = {
    attempts: [],
    saved: [],
    loseNextResponse: false,
    readFailures: 0,
    uploads: [],
    uploadFailures: 0,
    loseUploadResponse: false,
    stallUpload: false,
  }
  await page.route('**/storage/v1/**', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.abort()
    state.uploads.push({
      path: new URL(request.url()).pathname,
      headers: request.headers(),
      size: request.postDataBuffer()?.length,
    })
    if (state.stallUpload)
      await new Promise((resolve) => {
        state.releaseUpload = resolve
      })
    if (state.loseUploadResponse) {
      state.loseUploadResponse = false
      return route.abort('failed')
    }
    if (state.uploadFailures > 0) {
      state.uploadFailures -= 1
      return route.fulfill({ status: 403, json: { message: 'Upload denied' } })
    }
    return route.fulfill({ status: 200, json: { Key: 'activity-images/test' } }).catch(() => {})
  })
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
  await page.getByTestId('submission-price').fill('25')
  await page.getByTestId('submission-setting').selectOption('indoor')
  await page.getByTestId('submission-address').fill('  10 Orchard Road  ')
  await page.getByTestId('submission-area').selectOption('Orchard')
  await page.getByTestId('submission-manual-location').check()
}

for (const width of [1280, 375]) {
  test(`submits an activity and shows pending in Profile at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    const state = await mockBackend(page)
    await page.goto('/activities')
    // Phones reach the form from the bottom nav's + button instead of the page header
    await page.getByTestId(width < 768 ? 'nav-submit-activity' : 'submit-activity-button').click()
    await expect(page).toHaveURL(/\/activities\/submit$/)
    await expect(page.getByRole('main')).toHaveCount(1)
    await fillActivity(page)
    await expect(page.getByRole('group', { name: 'Opening hours' })).toHaveCount(0)
    await expect(page.locator('input[type=time]')).toHaveCount(0)
    await expect(page.getByTestId('submission-hours-note')).toContainText('before publishing')
    const free = width === 375
    await expect(page.getByTestId('submission-free')).toHaveCount(0)
    const price = page.getByTestId('submission-price')
    await price.fill('0')
    await expect(page.locator('#submission-price-help')).toHaveText('This activity is free.')
    await price.press('ArrowUp')
    await expect(price).toHaveValue('1')
    await expect(page.locator('#submission-price-help')).toHaveText('Enter 0 for a free activity.')
    await price.fill('')
    await expect(page.locator('#submission-price-help')).toHaveText('Enter 0 for a free activity.')
    await price.fill(free ? '0' : '25')
    await expect(price).toBeEnabled()
    await page.getByTestId('submission-setting').selectOption(free ? 'outdoor' : 'indoor')
    await page
      .getByTestId('submission-description')
      .fill(free ? '' : '  Try a weekend art session.  ')
    await page.getByTestId('submission-website').fill(free ? '' : 'https://example.com/studio')
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    )
    await page.getByTestId('submission-submit').click()
    await expect(page.getByTestId('submission-success')).toBeVisible()
    await expect(page.getByTestId('submission-form')).toHaveCount(0)
    expect(state.attempts).toHaveLength(1)
    expect(state.uploads).toHaveLength(0)
    expect(state.saved[0]).toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      submitted_by: mockUser.id,
      name: 'Weekend art studio',
      category: 'Arts and culture',
      price_per_person: free ? 0 : 25,
      duration_min: 90,
      indoor: !free,
      address: '10 Orchard Road',
      postal_code: null,
      google_place_id: null,
      area: 'Orchard',
      opening_hours: {},
      description: free ? null : 'Try a weekend art session.',
      website: free ? null : 'https://example.com/studio',
      image_url: null,
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
  expect(state.attempts).toHaveLength(1)
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
  expect(state.attempts).toHaveLength(1)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.saved).toHaveLength(1)
  expect(state.attempts).toHaveLength(1)
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

test('rejects missing fields, blank names and unsafe websites', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/activities/submit')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-name')).toBeFocused()
  await fillActivity(page)
  await page.getByTestId('submission-name').fill('   ')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText('Complete all required fields')
  await page.getByTestId('submission-name').fill('Art studio')
  await page.getByTestId('submission-website').fill('javascript:alert(1)')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText('https:// or http://')
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
    await page.getByTestId('place-find').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('place-candidate')).toHaveCount(2)
    await expect(page.getByTestId('place-link')).toHaveCount(0)
    expect(state.attempts).toHaveLength(0)
    expect(lookup.requests).toEqual([{ query: '10 Orchard Road' }])
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
      postal_code: null,
      name: 'Weekend art studio',
    })
    expect(state.saved[0].opening_hours).toEqual({})
    expect(lookup.requests).toHaveLength(1)
    expect(JSON.stringify(state.saved)).not.toContain('Google studio')
  })
}

test('a typed location cannot submit until a venue or manual review is explicitly chosen', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await mockPlaceSearch(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-manual-location').uncheck()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-location-error')).toContainText('Choose a location')
  expect(state.attempts).toHaveLength(0)
  await page.getByTestId('place-find').click()
  await page.getByTestId('place-candidate').first().click()
  await expect(page.getByTestId('place-map')).toHaveAttribute('src', /q=1.2914%2C103.8501/)
  await expect(page.getByTestId('submission-manual-location')).not.toBeChecked()
  await page.getByTestId('submission-name').fill('A better activity title')
  await expect(page.getByTestId('place-selected')).toContainText('Google studio one')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.saved[0].google_place_id).toBe(placeCandidates[0].id)
  expect(state.saved[0]).not.toHaveProperty('location')
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

test('editing the venue clears selection, and Clear never submits', async ({ page }) => {
  const state = await mockBackend(page)
  await mockPlaceSearch(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('place-find').click()
  await page.getByTestId('place-candidate').first().click()
  await page.getByTestId('submission-address').fill('20 Orchard Road')
  await expect(page.getByTestId('place-link')).toHaveCount(0)
  await expect(page.getByTestId('place-candidate')).toHaveCount(0)
  await page.getByTestId('place-find').click()
  await page.getByTestId('place-candidate').first().click()
  await page.getByTestId('place-clear').click()
  await expect(page.getByTestId('place-link')).toHaveCount(0)
  expect(state.attempts).toHaveLength(0)
  await page.getByTestId('submission-manual-location').check()
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
  await page.getByTestId('submission-address').fill('New studio')
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
  expect(state.attempts).toHaveLength(1)
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

for (const [type, extension] of [
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]) {
  test(`uploads a ${type} photo before saving its public URL`, async ({ page }) => {
    await page.setViewportSize({ width: extension === 'png' ? 375 : 1280, height: 900 })
    const state = await mockBackend(page)
    await page.goto('/activities/submit')
    await fillActivity(page)
    const file = await photoFile(page, type, 'untrusted.name.svg')
    await page.getByTestId('submission-image').setInputFiles(file)
    await expect(page.getByTestId('submission-image-preview')).toBeVisible()
    await expect(page.getByTestId('submission-image-preview')).toHaveJSProperty('naturalWidth', 2)
    expect(state.uploads).toHaveLength(0)
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      extension === 'png' ? 375 : 1280,
    )
    await page.getByTestId('submission-submit').click()
    await expect(page.getByTestId('submission-success')).toBeVisible()
    expect(state.uploads).toHaveLength(1)
    expect(state.uploads[0].path).toMatch(
      new RegExp(`/activity-images/${mockUser.id}/${state.saved[0].id}/[0-9a-f-]+\\.${extension}$`),
    )
    expect(state.uploads[0].headers['content-type']).toBe(type)
    expect(state.uploads[0].headers['x-upsert']).toBe('false')
    expect(state.uploads[0].headers.authorization).toMatch(/^Bearer /)
    expect(state.uploads[0].size).toBe(file.buffer.length)
    expect(state.saved[0].image_url).toContain(
      state.uploads[0].path.replace('/object/', '/object/public/'),
    )
    expect(state.saved[0].status).toBe('pending')
  })
}

test('replaces and removes a photo, revokes previews and allows selecting the same file again', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  const file = await photoFile(page)
  const imageInput = page.getByTestId('submission-image')
  await imageInput.setInputFiles(file)
  const preview = page.getByTestId('submission-image-preview')
  await expect(preview).toBeVisible()
  await expect(imageInput).toHaveValue(`C:\\fakepath\\${file.name}`)
  const first = await preview.getAttribute('src')
  await imageInput.setInputFiles({ ...file, name: 'second.png' })
  await expect(preview).toBeVisible()
  await expect(imageInput).toHaveValue('C:\\fakepath\\second.png')
  await expect(preview).not.toHaveAttribute('src', first)
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url)
        return true
      } catch {
        return false
      }
    }, first),
  ).toBe(false)
  const second = await preview.getAttribute('src')
  await page.getByTestId('submission-image-remove').focus()
  await page.keyboard.press('Enter')
  await expect(preview).toHaveCount(0)
  await expect(imageInput).toHaveValue('')
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url)
        return true
      } catch {
        return false
      }
    }, second),
  ).toBe(false)
  await imageInput.setInputFiles(file)
  await expect(preview).toBeVisible()
  await expect(imageInput).toHaveValue(`C:\\fakepath\\${file.name}`)
  await page.getByTestId('submission-image-remove').click()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads).toHaveLength(0)
  expect(state.saved[0].image_url).toBeNull()
})

test('rejects disallowed, empty, oversized and corrupt photos without writing', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  const file = await photoFile(page)
  for (const invalid of [
    { ...file, mimeType: 'image/svg+xml' },
    { ...file, buffer: Buffer.alloc(0) },
    { ...file, buffer: Buffer.alloc(5000001) },
    { ...file, buffer: Buffer.from('not an image') },
  ]) {
    await page.getByTestId('submission-image').setInputFiles(invalid)
    await expect(page.getByTestId('submission-image-error')).not.toBeEmpty()
    await expect(page.getByTestId('submission-image')).toHaveAttribute('aria-invalid', 'true')
    await page.getByTestId('submission-submit').click()
    await expect(page.getByTestId('submission-success')).toHaveCount(0)
  }
  expect(state.uploads).toHaveLength(0)
  expect(state.attempts).toHaveLength(0)
  await page.getByTestId('submission-image-remove').click()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
})

test('accepts exactly 5 MB, with valid image bytes', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  const file = await photoFile(page)
  file.buffer = Buffer.concat([file.buffer, Buffer.alloc(5000000 - file.buffer.length)])
  await page.getByTestId('submission-image').setInputFiles(file)
  await expect(page.getByTestId('submission-image-preview')).toBeVisible()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads[0].size).toBe(5000000)
})

test('a rejected upload retains entries, prevents an insert and retries with a fresh path', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.uploadFailures = 1
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't upload your photo")
  await expect(page.getByTestId('submission-image-preview')).toBeVisible()
  await expect(page.getByTestId('submission-name')).toHaveValue('  Weekend art studio  ')
  expect(state.attempts).toHaveLength(0)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads).toHaveLength(2)
  expect(state.uploads[0].path).not.toBe(state.uploads[1].path)
  expect(state.saved).toHaveLength(1)
})

test('reuses the confirmed upload after a failed database insert', async ({ page }) => {
  const state = await mockBackend(page, 1)
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't submit")
  await page.getByTestId('submission-name').fill('Changed studio')
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads).toHaveLength(1)
  expect(state.attempts[0].image_url).toBe(state.saved[0].image_url)
  expect(state.saved[0].name).toBe('Changed studio')
})

test('a new photo after a failed insert uses a different object and URL', async ({ page }) => {
  const state = await mockBackend(page, 1)
  await page.goto('/activities/submit')
  await fillActivity(page)
  const file = await photoFile(page)
  await page.getByTestId('submission-image').setInputFiles(file)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  await page.getByTestId('submission-image').setInputFiles({ ...file, name: 'replacement.png' })
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads).toHaveLength(2)
  expect(state.attempts[0].image_url).not.toBe(state.saved[0].image_url)
})

test('recovers an already-saved photo before uploading later edits, including failed recovery reads', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.loseNextResponse = true
  await page.goto('/activities/submit')
  await fillActivity(page)
  const file = await photoFile(page)
  await page.getByTestId('submission-image').setInputFiles(file)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  const savedUrl = state.saved[0].image_url
  await page.getByTestId('submission-image').setInputFiles({ ...file, name: 'later-edit.png' })
  state.readFailures = 1
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  expect(state.uploads).toHaveLength(1)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-recovered')).toContainText('were not submitted')
  expect(state.saved).toHaveLength(1)
  expect(state.saved[0].image_url).toBe(savedUrl)
  expect(state.uploads).toHaveLength(1)
  expect(state.attempts).toHaveLength(1)
})

test('a lost upload response does not insert and retry gets a new key', async ({ page }) => {
  const state = await mockBackend(page)
  state.loseUploadResponse = true
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't upload")
  expect(state.attempts).toHaveLength(0)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads).toHaveLength(2)
  expect(state.uploads[0].path).not.toBe(state.uploads[1].path)
})

test('a stalled upload times out, cancels, and cannot insert after retry succeeds', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.stallUpload = true
  await page.clock.install()
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  const sent = page.waitForRequest('**/storage/v1/object/activity-images/**')
  await page.getByTestId('submission-submit').click()
  await sent
  await expect(page.getByTestId('submission-upload-status')).toHaveText('Uploading photo…')
  await expect(page.getByTestId('submission-name')).toBeDisabled()
  await page.clock.fastForward(30001)
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't upload")
  expect(state.attempts).toHaveLength(0)
  state.stallUpload = false
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  state.releaseUpload()
  expect(state.saved).toHaveLength(1)
  expect(state.uploads).toHaveLength(2)
})

test('stalled session refresh times out without a late upload and allows retry after refresh', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.clock.install()
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  await expect(page.getByTestId('submission-image-preview')).toBeVisible()
  let pendingRefresh
  await page.route('**/auth/v1/token**', (route) => {
    pendingRefresh = route
  })
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key))
    session.expires_at = Math.floor(Date.now() / 1000) - 1
    localStorage.setItem(key, JSON.stringify(session))
  }, authStorageKey())
  const requested = page.waitForRequest('**/auth/v1/token**')
  await page.getByTestId('submission-submit').click()
  await requested
  await page.clock.fastForward(30001)
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't upload")
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
  await expect(page.getByTestId('submission-name')).toHaveValue('  Weekend art studio  ')
  await expect(page.getByTestId('submission-image-preview')).toBeVisible()
  expect(state.uploads).toHaveLength(0)
  expect(state.attempts).toHaveLength(0)
  await pendingRefresh.fulfill({ json: mockSession })
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads).toHaveLength(1)
  expect(state.saved).toHaveLength(1)
  expect(state.attempts).toHaveLength(1)
})

for (const { committed, expectedAttempts, successId, expectedName } of [
  {
    committed: false,
    expectedAttempts: 2,
    successId: 'submission-success',
    expectedName: 'Edited after timeout',
  },
  {
    committed: true,
    expectedAttempts: 1,
    successId: 'submission-recovered',
    expectedName: 'Weekend art studio',
  },
]) {
  test(`a stalled insert unlocks the form and retries safely when committed=${committed}`, async ({
    page,
  }) => {
    const state = await mockBackend(page)
    await page.clock.install()
    await page.goto('/activities/submit')
    await fillActivity(page)
    await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
    let pendingSave
    await page.route('**/rest/v1/submissions*', (route) => {
      if (route.request().method() !== 'POST' || pendingSave) return route.fallback()
      pendingSave = route
      const record = route.request().postDataJSON()
      state.attempts.push(record)
      if (committed) state.saved.push({ ...record, reject_reason: null })
    })
    const saving = page.waitForRequest(
      (request) => request.method() === 'POST' && request.url().includes('/rest/v1/submissions'),
    )
    await page.getByTestId('submission-submit').click()
    await saving
    await expect(page.getByTestId('submission-upload-status')).toHaveText('Submitting…')
    await page.clock.fastForward(30001)
    await expect(page.getByTestId('submission-error')).toContainText("Couldn't submit")
    await expect(page.getByTestId('submission-submit')).toBeEnabled()
    await expect(page.getByTestId('submission-image-preview')).toBeVisible()
    await page.getByTestId('submission-name').fill('Edited after timeout')
    await page.getByTestId('submission-submit').click()
    await expect(page.getByTestId(successId)).toBeVisible()
    await pendingSave.fulfill({ status: 201, body: '' }).catch(() => {})
    expect(state.uploads).toHaveLength(1)
    expect(state.attempts).toHaveLength(expectedAttempts)
    expect(state.saved).toHaveLength(1)
    expect(state.saved[0].id).toBe(state.attempts[0].id)
    expect(state.saved[0].image_url).toBe(state.attempts[0].image_url)
    expect(state.saved[0].name).toBe(expectedName)
  })
}

test('a stalled recovery read times out without extra writes and can be retried', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.loseNextResponse = true
  await page.clock.install()
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  const original = { ...state.saved[0] }
  let pendingRead
  await page.route('**/rest/v1/submissions*', (route) => {
    if (route.request().method() !== 'GET' || pendingRead) return route.fallback()
    pendingRead = route
  })
  const reading = page.waitForRequest(
    (request) => request.method() === 'GET' && request.url().includes('/rest/v1/submissions'),
  )
  await page.getByTestId('submission-submit').click()
  await reading
  await page.clock.fastForward(30001)
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't submit")
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
  expect(state.uploads).toHaveLength(1)
  expect(state.attempts).toHaveLength(1)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-recovered')).toBeVisible()
  await pendingRead.fulfill({ json: [] }).catch(() => {})
  expect(state.saved).toEqual([original])
  expect(state.uploads).toHaveLength(1)
  expect(state.attempts).toHaveLength(1)
})

test('a no-photo save waiting for login refresh also times out without a late insert', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.clock.install()
  await page.goto('/activities/submit')
  await fillActivity(page)
  let pendingRefresh
  await page.route('**/auth/v1/token**', (route) => {
    pendingRefresh = route
  })
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key))
    session.expires_at = Math.floor(Date.now() / 1000) - 1
    localStorage.setItem(key, JSON.stringify(session))
  }, authStorageKey())
  const refreshing = page.waitForRequest('**/auth/v1/token**')
  await page.getByTestId('submission-submit').click()
  await refreshing
  await page.clock.fastForward(30001)
  await expect(page.getByTestId('submission-error')).toContainText("Couldn't submit")
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
  expect(state.attempts).toHaveLength(0)
  await pendingRefresh.fulfill({ json: mockSession })
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.attempts).toHaveLength(1)
  expect(state.saved).toHaveLength(1)
  expect(state.uploads).toHaveLength(0)
})

test('switching accounts cancels an unfinished database save and allows the new account to submit', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  let pendingSave
  await page.route('**/rest/v1/submissions*', (route) => {
    if (route.request().method() !== 'POST' || pendingSave) return route.fallback()
    pendingSave = route
  })
  const saving = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/rest/v1/submissions'),
  )
  await page.getByTestId('submission-submit').click()
  await saving
  const oldId = pendingSave.request().postDataJSON().id
  const otherId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  await page.evaluate(
    ({ key, otherId }) => {
      const session = JSON.parse(localStorage.getItem(key))
      session.user.id = otherId
      localStorage.setItem(key, JSON.stringify(session))
      const channel = new BroadcastChannel(key)
      channel.postMessage({ event: 'SIGNED_IN', session })
      channel.close()
    },
    { key: authStorageKey(), otherId },
  )
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  await pendingSave.fulfill({ status: 201, body: '' }).catch(() => {})
  expect(state.saved).toHaveLength(1)
  expect(state.saved[0].id).not.toBe(oldId)
  expect(state.saved[0].submitted_by).toBe(otherId)
})

test('double submission while uploading sends only one request', async ({ page }) => {
  const state = await mockBackend(page)
  state.stallUpload = true
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  const sent = page.waitForRequest('**/storage/v1/object/activity-images/**')
  await page.getByTestId('submission-submit').click()
  await sent
  await page.getByTestId('submission-form').dispatchEvent('submit')
  state.releaseUpload()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  expect(state.uploads).toHaveLength(1)
  expect(state.saved).toHaveLength(1)
})

test('old photo validation cannot restore a removed photo or replace the next selection', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/activities/submit')
  await page.evaluate(() => {
    window.photoDecodes = []
    const decode = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function () {
      return new Promise((resolve, reject) =>
        window.photoDecodes.push(() => decode.call(this).then(resolve, reject)),
      )
    }
  })
  const file = await photoFile(page)
  await page.getByTestId('submission-image').setInputFiles(file)
  await expect(page.getByTestId('submission-submit')).toBeDisabled()
  await page.getByTestId('submission-image-remove').click()
  await page.getByTestId('submission-image').setInputFiles({ ...file, name: 'new.png' })
  await page.evaluate(() => window.photoDecodes[0]())
  await expect(page.getByTestId('submission-image-error')).toBeEmpty()
  await expect(page.getByTestId('submission-submit')).toBeDisabled()
  await page.evaluate(() => window.photoDecodes[1]())
  await expect(page.getByTestId('submission-image-preview')).toBeVisible()
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
})

for (const { action, leave, destination } of [
  {
    action: 'navigate',
    leave: (page) => page.getByRole('link', { name: '← Back to Activities' }).click(),
    destination: '/activities',
  },
  {
    action: 'sign out',
    leave: (page) =>
      page.evaluate((key) => {
        localStorage.removeItem(key)
        const channel = new BroadcastChannel(key)
        channel.postMessage({ event: 'SIGNED_OUT', session: null })
        channel.close()
      }, authStorageKey()),
    destination: '/login',
  },
]) {
  test(`${action} during an upload prevents a late insert`, async ({ page }) => {
    const state = await mockBackend(page)
    state.stallUpload = true
    await page.goto('/activities/submit')
    await fillActivity(page)
    await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
    const sent = page.waitForRequest('**/storage/v1/object/activity-images/**')
    await page.getByTestId('submission-submit').click()
    await sent
    await leave(page)
    await expect(page).toHaveURL(destination)
    state.releaseUpload()
    await expect(page.getByTestId('submission-success')).toHaveCount(0)
    expect(state.attempts).toHaveLength(0)
  })
}

test('switching accounts while uploading cancels the old operation even when the form stays open', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.stallUpload = true
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  const sent = page.waitForRequest('**/storage/v1/object/activity-images/**')
  await page.getByTestId('submission-submit').click()
  await sent
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key))
    session.user.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    localStorage.setItem(key, JSON.stringify(session))
    const channel = new BroadcastChannel(key)
    channel.postMessage({ event: 'SIGNED_IN', session })
    channel.close()
  }, authStorageKey())
  await expect(page.getByTestId('submission-submit')).toBeEnabled()
  state.releaseUpload()
  await expect(page.getByTestId('submission-success')).toHaveCount(0)
  expect(state.attempts).toHaveLength(0)
})

test('switching accounts after a lost save response uses a fresh submission and photo', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.loseNextResponse = true
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-image').setInputFiles(await photoFile(page))
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-error')).toBeVisible()
  const original = { ...state.saved[0] }
  const otherId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  await page.evaluate(
    ({ key, otherId }) => {
      const session = JSON.parse(localStorage.getItem(key))
      session.user.id = otherId
      localStorage.setItem(key, JSON.stringify(session))
      const channel = new BroadcastChannel(key)
      channel.postMessage({ event: 'SIGNED_IN', session })
      channel.close()
    },
    { key: authStorageKey(), otherId },
  )
  await expect(page.getByTestId('submission-error')).toHaveCount(0)
  await expect(page.getByTestId('submission-image-preview')).toBeVisible()
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-success')).toBeVisible()
  await expect(page.getByTestId('submission-recovered')).toHaveCount(0)
  expect(state.saved).toHaveLength(2)
  expect(state.saved[0]).toEqual(original)
  expect(state.saved[1].id).not.toBe(original.id)
  expect(state.saved[1].submitted_by).toBe(otherId)
  expect(state.saved[1].image_url).not.toBe(original.image_url)
  expect(state.uploads).toHaveLength(2)
  expect(state.uploads[1].path).toContain(`/${otherId}/${state.saved[1].id}/`)
})

test('a duplicate insert is recovered only when the exact owned submission can be read', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.route('**/rest/v1/submissions*', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    state.saved.push(route.request().postDataJSON())
    return route.fulfill({ status: 409, json: { code: '23505', message: 'Already saved' } })
  })
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('submission-submit').click()
  await expect(page.getByTestId('submission-recovered')).toContainText('were not submitted')
  expect(state.saved).toHaveLength(1)
})

test('a stalled lookup error body times out and permits retry', async ({ page }) => {
  await page.clock.install()
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    let stallFirst = true
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/functions/v1/google-place-search') && stallFirst) {
        stallFirst = false
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                window.__googleErrorBodyStarted = true
                init?.signal?.addEventListener(
                  'abort',
                  () => controller.error(init.signal.reason),
                  { once: true },
                )
              },
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      }
      return originalFetch(input, init)
    }
  })
  await mockBackend(page)
  await mockPlaceSearch(page)
  await page.goto('/activities/submit')
  await fillActivity(page)
  await page.getByTestId('place-find').click()
  await expect.poll(() => page.evaluate(() => window.__googleErrorBodyStarted)).toBe(true)
  await page.clock.fastForward(12001)
  await expect(page.getByTestId('place-error')).toBeVisible()
  await expect(page.getByTestId('place-find')).toBeEnabled()
  await page.getByTestId('place-find').click()
  await expect(page.getByTestId('place-candidate')).toHaveCount(2)
})
