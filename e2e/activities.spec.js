import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

test.beforeEach(async ({ page }) => {
  await signInMockUser(page)
  await page.route('**/rest/v1/profiles?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/favourites?*', (route) => route.fulfill({ json: [] }))
})

const activities = [
  {
    id: '274b5b2e-534a-479d-80bf-65d554b37fd8',
    name: 'Cafés in Tiong Bahru',
    category: 'Cafés',
    price_per_person: 25,
    duration_min: 90,
    indoor: true,
    area: 'Tiong Bahru',
    source: 'curated',
    image_url: null,
  },
  {
    id: '4df8b571-52b5-434c-9870-6a125f01a185',
    name: 'Sunset Kayaking',
    category: 'Outdoor',
    price_per_person: 20,
    duration_min: 120,
    indoor: false,
    area: 'East Coast Park',
    source: 'curated',
    image_url: null,
  },
  {
    id: 'd50c48f1-fb26-49c2-8ff5-db44e2010711',
    name: 'Picnic at Marina Barrage',
    category: 'Outdoor',
    price_per_person: 0,
    duration_min: 120,
    indoor: false,
    area: 'Marina Bay',
    source: 'curated',
    image_url: null,
  },
  {
    id: 'fb4101f7-c87f-4238-ac23-800e8f2c496d',
    name: 'Pottery Workshop',
    category: 'Workshops',
    price_per_person: 35,
    duration_min: 120,
    indoor: true,
    area: 'Tiong Bahru',
    source: 'curated',
    image_url: null,
  },
]

const apiHeaders = {
  'access-control-allow-origin': '*',
}

async function mockActivities(page, records = activities) {
  await page.route('**/rest/v1/activities?*', (route) => {
    const url = new URL(route.request().url())
    const start = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? records.length)

    return route.fulfill({
      headers: apiHeaders,
      json: records.slice(start, start + limit),
    })
  })
}

test('demo searches, combines filters and clears them', async ({ page }) => {
  await mockActivities(page)
  await page.goto('/activities')

  const cards = page.getByTestId('activity-card')
  await expect(cards).toHaveCount(4)
  await expect(page.getByTestId('activities-sort-summary')).toHaveText('Showing catalogue order')
  await expect(page.getByTestId('activities-sort-description')).toHaveCount(0)
  await expect(page.getByTestId('activity-save')).toHaveCount(4)
  await expect(page.getByTestId('activity-share')).toHaveCount(0)
  await expect(cards.getByRole('link')).toHaveCount(8)

  await page.getByRole('button', { name: 'Outdoor', exact: true }).click()
  await expect(cards).toHaveCount(2)
  await expect(page.getByTestId('category-filter')).toHaveValue('Outdoor')
  await expect(page.getByRole('button', { name: 'Outdoor', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByTestId('category-filter').selectOption('Workshops')
  await expect(cards).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Workshops', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByTestId('category-chip-all').click()
  await expect(cards).toHaveCount(4)
  await expect(page.getByTestId('category-filter')).toHaveValue('')

  await page.getByTestId('activity-search').fill('  POTTERY  ')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('Pottery Workshop')

  await page.getByTestId('category-filter').selectOption('Outdoor')
  await expect(page.getByTestId('activities-no-results')).toBeVisible()
  await expect(cards).toHaveCount(0)

  await page.getByTestId('empty-clear-filters').click()
  await expect(cards).toHaveCount(4)
  await expect(page.getByTestId('activity-search')).toHaveValue('')
  await expect(page.getByTestId('category-filter')).toHaveValue('')

  await page.getByTestId('category-filter').selectOption('Outdoor')
  await expect(cards).toHaveCount(2)
  await page.getByTestId('setting-filter').selectOption('indoor')
  await expect(page.getByTestId('activities-no-results')).toBeVisible()

  await page.getByTestId('setting-filter').selectOption('outdoor')
  await expect(cards).toHaveCount(2)
  await page.getByTestId('activity-search').fill('marina')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('Free')
  await expect(page.getByTestId('activities-count')).toHaveText('Showing 1–1 of 1 activities')

  await page.getByTestId('clear-filters').click()
  await page.getByTestId('activity-search').fill('cafe')
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText('Cafés in Tiong Bahru')
})

test('empty database has a different message from unmatched filters', async ({ page }) => {
  await mockActivities(page, [])
  await page.goto('/activities')

  await expect(page.getByTestId('activities-empty')).toBeVisible()
  await expect(page.getByTestId('activities-no-results')).toHaveCount(0)
})

test('failed database request can be retried', async ({ page }) => {
  let requests = 0
  await page.route('**/rest/v1/activities?*', (route) => {
    requests += 1
    if (requests === 1) {
      return route.fulfill({
        status: 400,
        headers: apiHeaders,
        json: { message: 'Could not load demo activities', code: 'DEMO_FAILURE' },
      })
    }
    return route.fulfill({ headers: apiHeaders, json: activities })
  })

  await page.goto('/activities')
  await expect(page.getByTestId('activities-error')).toContainText("Couldn't load activities")
  await page.getByTestId('activities-retry').click()

  await expect(page.getByTestId('activity-card')).toHaveCount(4)
  await expect(page.getByTestId('activities-error')).toHaveCount(0)
})

test('phone layout has one card per row and an accessible filter panel', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockActivities(page)
  await page.goto('/activities')

  const cards = page.getByTestId('activity-card')
  await expect(cards).toHaveCount(4)
  await expect(page.getByTestId('category-filter')).toBeHidden()

  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  expect(second.x).toBe(first.x)
  expect(second.y).toBeGreaterThan(first.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  await page.getByRole('button', { name: 'Outdoor', exact: true }).click()
  await expect(cards).toHaveCount(2)
  await page.getByTestId('category-chip-all').click()
  await expect(cards).toHaveCount(4)

  await page.getByTestId('filters-toggle').click()
  await expect(page.getByTestId('filters-toggle')).toHaveAttribute('aria-expanded', 'true')
  await page.getByTestId('setting-filter').selectOption('outdoor')
  await expect(cards).toHaveCount(2)
  await page.getByTestId('area-filter').selectOption('Marina Bay')
  await page.getByTestId('price-filter').selectOption('free')
  await page.getByTestId('sort-filter').selectOption('price-asc')
  await expect(cards).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.getByTestId('clear-filters').click()
  await expect(cards).toHaveCount(4)
})

test('area and price filters combine and clear with the existing filters', async ({ page }) => {
  await mockActivities(page)
  await page.goto('/activities')

  const names = page.getByTestId('activity-name-link')
  await expect(page.getByTestId('area-filter').locator('option')).toHaveText([
    'All areas',
    'East Coast Park',
    'Marina Bay',
    'Tiong Bahru',
  ])
  await page.getByTestId('area-filter').selectOption('Tiong Bahru')
  await expect(names).toHaveText(['Cafés in Tiong Bahru', 'Pottery Workshop'])
  await page.getByTestId('price-filter').selectOption('20-50')
  await page.getByTestId('sort-filter').selectOption('price-desc')
  await expect(names).toHaveText(['Pottery Workshop', 'Cafés in Tiong Bahru'])
  await page.getByTestId('category-filter').selectOption('Workshops')
  await page.getByTestId('setting-filter').selectOption('indoor')
  await page.getByTestId('activity-search').fill('pottery')
  await expect(names).toHaveText(['Pottery Workshop'])
  await page.getByTestId('price-filter').selectOption('free')
  await expect(page.getByTestId('activities-no-results')).toBeVisible()
  await page.getByTestId('empty-clear-filters').click()
  await expect(names).toHaveText(activities.map((activity) => activity.name))
  await expect(page.getByTestId('area-filter')).toHaveValue('')
  await expect(page.getByTestId('price-filter')).toHaveValue('')
  await expect(page.getByTestId('sort-filter')).toHaveValue('best-match')
})

test('price bands handle boundaries and sorting keeps missing prices last', async ({ page }) => {
  const prices = [100, null, '9.50', 0, 50, '', 20, 'unverified', -1, '   ', 19.99, 49.99, 99.99]
  const records = prices.map((price, index) => ({
    ...activities[0],
    id: 'price-' + index,
    name: 'Price ' + index,
    price_per_person: price,
  }))
  await mockActivities(page, records)
  await page.goto('/activities')

  const names = page.getByTestId('activity-name-link')
  await expect(names).toHaveCount(prices.length)
  await expect(
    page.getByTestId('activity-card').filter({ hasText: 'Price unavailable' }),
  ).toHaveCount(5)
  await page.getByTestId('sort-filter').selectOption('price-asc')
  await expect(names).toHaveText(
    [3, 2, 10, 6, 11, 4, 12, 0, 1, 5, 7, 8, 9].map((i) => 'Price ' + i),
  )
  await page.getByTestId('sort-filter').selectOption('price-desc')
  await expect(names).toHaveText(
    [0, 12, 4, 11, 6, 10, 2, 3, 1, 5, 7, 8, 9].map((i) => 'Price ' + i),
  )

  for (const [band, indices] of [
    ['free', [3]],
    ['under-20', [10, 2, 3]],
    ['20-50', [11, 6]],
    ['50-100', [12, 4]],
    ['100-plus', [0]],
  ]) {
    await page.getByTestId('price-filter').selectOption(band)
    await expect(names).toHaveText(indices.map((i) => 'Price ' + i))
  }
  await page.getByTestId('clear-filters').click()
  await expect(names).toHaveText(records.map((activity) => activity.name))
})

test('area, price and sorting survive an activity detail round trip', async ({ page }) => {
  await mockActivities(page)
  await page.route('**/rest/v1/activities?*id=eq.*', (route) =>
    route.fulfill({ headers: apiHeaders, json: activities[3] }),
  )
  await page.goto('/activities')
  await page.getByTestId('area-filter').selectOption('Tiong Bahru')
  await page.getByTestId('price-filter').selectOption('20-50')
  await page.getByTestId('sort-filter').selectOption('price-desc')
  await page.getByTestId('activity-name-link').first().click()
  await expect(page).toHaveURL('/activities/' + activities[3].id)
  await page.goBack()
  await expect(page.getByTestId('area-filter')).toHaveValue('Tiong Bahru')
  await expect(page.getByTestId('price-filter')).toHaveValue('20-50')
  await expect(page.getByTestId('sort-filter')).toHaveValue('price-desc')
  await expect(page.getByTestId('activity-name-link')).toHaveText([
    'Pottery Workshop',
    'Cafés in Tiong Bahru',
  ])
})

test('search includes activities in later database batches', async ({ page }) => {
  const catalogue = Array.from({ length: 201 }, (_, index) => ({
    ...activities[3],
    id: 'demo-' + index,
    name: index === 200 ? 'Last batch workshop' : 'Workshop ' + index,
  }))

  await mockActivities(page, catalogue)
  await page.goto('/activities')
  await expect(page.getByTestId('activities-count')).toHaveText('Showing 1–20 of 201 activities')

  await page.getByTestId('activity-search').fill('Last batch')
  await expect(page.getByTestId('activity-card')).toHaveCount(1)
  await expect(page.getByTestId('activity-card')).toContainText('Last batch workshop')
  await expect(page.getByTestId('activities-pagination')).toHaveCount(0)
})

const paginatedCatalogue = Array.from({ length: 45 }, (_, index) => ({
  ...activities[3],
  id: 'page-' + index,
  name: 'Workshop ' + index,
  price_per_person: 45 - index,
}))

for (const count of [40, 45]) {
  test(`pagination shows 20 per page with ${count} activities on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const records = paginatedCatalogue.slice(0, count)
    await mockActivities(page, records)
    await page.goto('/activities')

    const names = page.getByTestId('activity-name-link')
    const pagination = page.getByRole('navigation', { name: 'Activity pages' })
    await expect(names).toHaveText(records.slice(0, 20).map((activity) => activity.name))
    await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await expect(pagination.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await pagination.getByRole('button', { name: 'Next' }).click()
    await expect(names).toHaveText(records.slice(20, 40).map((activity) => activity.name))
    await expect(page.getByTestId('activities-count')).toBeFocused()
    await expect(page.getByTestId('activities-count')).toHaveText(
      `Showing 21–40 of ${count} activities`,
    )
    const lastPage = Math.ceil(count / 20)
    const lastStart = (lastPage - 1) * 20
    await pagination.getByRole('button', { name: `Page ${lastPage}`, exact: true }).click()
    await expect(names).toHaveText(records.slice(lastStart).map((activity) => activity.name))
    await expect(page.getByTestId('activities-count')).toHaveText(
      `Showing ${lastStart + 1}–${count} of ${count} activities`,
    )
    await expect(pagination.getByRole('button', { name: 'Next' })).toBeDisabled()
    // A visible scrollbar can reduce the document width below the viewport width.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)
    await pagination.getByRole('button', { name: 'Previous' }).click()
    await expect(names).toHaveText(
      records.slice(lastStart - 20, lastStart).map((activity) => activity.name),
    )
    await pagination.getByRole('button', { name: 'Page 1', exact: true }).click()
    await expect(names.first()).toHaveText(records[0].name)
  })
}

test('pagination survives a detail visit and resets for search, filters and sorting', async ({
  page,
}) => {
  await mockActivities(page, paginatedCatalogue)
  await page.route('**/rest/v1/activities?*id=eq.*', (route) =>
    route.fulfill({ json: paginatedCatalogue[20] }),
  )
  await page.goto('/activities')
  const pagination = page.getByRole('navigation', { name: 'Activity pages' })
  const names = page.getByTestId('activity-name-link')
  await pagination.getByRole('button', { name: 'Page 2', exact: true }).click()
  await names.first().click()
  await expect(page).toHaveURL('/activities/page-20')
  await page.goBack()
  await expect(names.first()).toHaveText('Workshop 20')
  await expect(page.getByTestId('activities-count')).toHaveText('Showing 21–40 of 45 activities')

  await page.getByTestId('sort-filter').selectOption('price-asc')
  await expect(names).toHaveText(
    paginatedCatalogue
      .slice()
      .reverse()
      .slice(0, 20)
      .map((activity) => activity.name),
  )
  await pagination.getByRole('button', { name: 'Next' }).click()
  await page.getByTestId('price-filter').selectOption('under-20')
  await expect(names).toHaveCount(19)
  await expect(pagination).toHaveCount(0)
  await expect(page.getByTestId('activities-count')).toHaveText('Showing 1–19 of 19 activities')

  await page.getByTestId('clear-filters').click()
  await pagination.getByRole('button', { name: 'Page 3', exact: true }).click()
  await page.getByTestId('activity-search').fill('Workshop 0')
  await expect(names).toHaveText(['Workshop 0'])
  await expect(pagination).toHaveCount(0)
  await page.getByTestId('activity-search').fill('no match')
  await expect(page.getByTestId('activities-no-results')).toBeVisible()
  await expect(page.getByTestId('activities-count')).toHaveText('Showing 0–0 of 0 activities')
  await page.getByTestId('empty-clear-filters').click()
  await expect(names.first()).toHaveText('Workshop 0')
  await expect(pagination.getByRole('button', { name: 'Previous' })).toBeDisabled()
})

test('Best match reads only the signed-in profile and still respects filters and other sorts', async ({
  page,
}) => {
  await mockActivities(page)
  await page.route('**/rest/v1/profiles?*', (route) => {
    expect(new URL(route.request().url()).searchParams.get('id')).toBe('eq.' + mockUser.id)
    return route.fulfill({
      json: [{ interests: ['Outdoors'], budget: 'under-20', home_area: 'East Coast Park' }],
    })
  })
  await page.goto('/activities')

  const names = page.getByTestId('activity-name-link')
  await expect(page.getByTestId('sort-filter')).toHaveValue('best-match')
  await expect(page.getByTestId('clear-filters')).toBeDisabled()
  await expect(page.getByTestId('activities-sort-summary')).toContainText('Sorted by Best match')
  await expect(page.getByTestId('activities-sort-description')).toHaveText(
    'Based on your saved interests, budget and home area.',
  )
  await expect(names).toHaveText([
    activities[2].name,
    activities[1].name,
    activities[0].name,
    activities[3].name,
  ])
  await page.getByTestId('category-filter').selectOption('Outdoor')
  await expect(names).toHaveText([activities[2].name, activities[1].name])
  await page.getByTestId('sort-filter').selectOption('price-asc')
  await expect(page.getByTestId('activities-sort-summary')).toHaveText(
    'Sorted by Price: low to high',
  )
  await expect(page.getByTestId('activities-sort-description')).toHaveCount(0)
  await page.getByTestId('sort-filter').selectOption('price-desc')
  await expect(names).toHaveText([activities[1].name, activities[2].name])
  await expect(page.getByTestId('activities-sort-summary')).toHaveText(
    'Sorted by Price: high to low',
  )
  await page.getByTestId('clear-filters').click()
  await expect(page.getByTestId('sort-filter')).toHaveValue('best-match')
  await expect(names.first()).toHaveText(activities[2].name)
  await expect(page.getByTestId('activities-sort-summary')).toContainText('Sorted by Best match')
  await page.getByTestId('sort-filter').selectOption('catalogue')
  await expect(names).toHaveText(activities.map((activity) => activity.name))
  await expect(page.getByTestId('activities-sort-summary')).toHaveText('Showing catalogue order')
  await expect(page.getByTestId('activities-sort-description')).toHaveCount(0)
})

test('price and catalogue sorts display results while preferences are still loading', async ({
  page,
}) => {
  await mockActivities(page)
  let captureProfileRequest
  const pendingProfileRequest = new Promise((resolve) => {
    captureProfileRequest = resolve
  })
  await page.route('**/rest/v1/profiles?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('select') === 'is_admin') {
      return route.fulfill({ json: [{ is_admin: false }] })
    }
    captureProfileRequest(route)
  })
  const catalogueLoaded = page.waitForResponse('**/rest/v1/activities?*')
  await page.goto('/activities')
  const profileRequest = await pendingProfileRequest
  await catalogueLoaded

  const names = page.getByTestId('activity-name-link')
  await expect(page.getByTestId('activities-loading')).toBeVisible()
  await expect(names).toHaveCount(0)

  for (const [sort, indices, summary] of [
    ['price-asc', [2, 1, 0, 3], 'Sorted by Price: low to high'],
    ['price-desc', [3, 0, 1, 2], 'Sorted by Price: high to low'],
    ['catalogue', [0, 1, 2, 3], 'Showing catalogue order'],
  ]) {
    await page.getByTestId('sort-filter').selectOption(sort)
    await expect(page.getByTestId('activities-loading')).toHaveCount(0)
    await expect(names).toHaveText(indices.map((index) => activities[index].name))
    await expect(page.getByTestId('activities-sort-summary')).toHaveText(summary)
  }

  await page.getByTestId('sort-filter').selectOption('best-match')
  await expect(page.getByTestId('activities-loading')).toBeVisible()
  await expect(names).toHaveCount(0)
  await page.getByTestId('sort-filter').selectOption('price-desc')
  await profileRequest.fulfill({
    json: [{ interests: ['Outdoors'], budget: 'under-20', home_area: 'East Coast Park' }],
  })
  await expect(names).toHaveText([3, 0, 1, 2].map((index) => activities[index].name))
  await expect(page.getByTestId('activities-sort-summary')).toHaveText(
    'Sorted by Price: high to low',
  )
  await page.getByTestId('sort-filter').selectOption('best-match')
  await expect(names).toHaveText([2, 1, 0, 3].map((index) => activities[index].name))
  await expect(page.getByTestId('activities-sort-summary')).toContainText('Sorted by Best match')
})

test('empty saved preferences show catalogue order without claiming personalisation', async ({
  page,
}) => {
  await mockActivities(page)
  await page.route('**/rest/v1/profiles?*', (route) =>
    route.fulfill({ json: [{ interests: [], budget: null, home_area: null }] }),
  )
  await page.goto('/activities')
  await expect(page.getByTestId('sort-filter')).toHaveValue('best-match')
  await expect(page.getByTestId('activities-sort-summary')).toHaveText('Showing catalogue order')
  await expect(page.getByTestId('activities-sort-description')).toHaveCount(0)
})

test('profile failure keeps the catalogue usable and can be retried', async ({ page }) => {
  await mockActivities(page)
  let requests = 0
  await page.route('**/rest/v1/profiles?*', (route) => {
    if (new URL(route.request().url()).searchParams.get('select') === 'is_admin') {
      return route.fulfill({ json: [{ is_admin: false }] })
    }
    requests += 1
    return requests === 1
      ? route.fulfill({ status: 403, json: { message: 'Profile read denied' } })
      : route.fulfill({ json: [{ interests: ['Outdoors'] }] })
  })
  await page.goto('/activities')
  const names = page.getByTestId('activity-name-link')
  await expect(page.getByTestId('preferences-error')).toContainText('catalogue order')
  await expect(page.getByTestId('activities-sort-summary')).toHaveText('Showing catalogue order')
  await expect(names).toHaveText(activities.map((activity) => activity.name))
  await page.getByTestId('activity-search').fill('pottery')
  await expect(names).toHaveText([activities[3].name])
  await page.getByTestId('preferences-retry').click()
  await expect(page.getByTestId('preferences-error')).toHaveCount(0)
  await expect(page.getByTestId('activities-sort-summary')).toContainText('Sorted by Best match')
  await page.getByTestId('clear-filters').click()
  await expect(names).toHaveText([
    activities[1].name,
    activities[2].name,
    activities[0].name,
    activities[3].name,
  ])
})

test('saving Profile preferences changes Best match on return and survives a detail visit', async ({
  page,
}) => {
  await mockActivities(page)
  let profile = {
    display_name: 'Demo User',
    interests: ['Cafes'],
    budget: '20-50',
    home_area: null,
    company: [],
  }
  await page.route('**/rest/v1/profiles?*', (route) => {
    if (route.request().method() === 'PATCH') {
      profile = { ...profile, ...route.request().postDataJSON() }
      return route.fulfill({ json: { id: mockUser.id } })
    }
    return route.fulfill({ json: [profile] })
  })
  await page.route('**/rest/v1/favourites?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/submissions?*', (route) => route.fulfill({ json: [] }))
  await page.goto('/activities')
  const names = page.getByTestId('activity-name-link')
  await expect(names.first()).toHaveText(activities[0].name)
  await page.getByTestId('nav-profile').click()
  await page.locator('label[for="pref-interest-cafes"]').click()
  await page.locator('label[for="pref-interest-outdoors"]').click()
  await page.locator('label[for="pref-budget-under-20"]').click()
  await page.getByTestId('pref-area').selectOption('Bishan')
  await page.getByTestId('profile-save-prefs').click()
  await expect(page.getByTestId('profile-prefs-saved')).toBeVisible()
  await page.getByTestId('nav-activities').click()
  await expect(names.first()).toHaveText(activities[2].name)
  await expect(page.getByTestId('sort-filter')).toHaveValue('best-match')

  await page.route('**/rest/v1/activities?*id=eq.*', (route) =>
    route.fulfill({ json: activities[2] }),
  )
  await names.first().click()
  await expect(page).toHaveURL('/activities/' + activities[2].id)
  await page.goBack()
  await expect(page.getByTestId('sort-filter')).toHaveValue('best-match')
  await expect(names.first()).toHaveText(activities[2].name)
})

test('a zero-row preference update preserves the draft and only confirms a successful retry', async ({
  page,
}) => {
  const attempts = []
  let profile = { display_name: 'Demo', interests: ['Cafes'], company: [] }
  await page.route('**/rest/v1/profiles?*', (route) => {
    const request = route.request()
    if (request.method() === 'PATCH') {
      const url = new URL(request.url())
      attempts.push({
        id: url.searchParams.get('id'),
        select: url.searchParams.get('select'),
        accept: request.headers().accept,
      })
      if (attempts.length === 1) {
        return route.fulfill({
          status: 406,
          json: {
            code: 'PGRST116',
            message: 'Cannot coerce the result to a single JSON object',
            details: 'The result contains 0 rows',
          },
        })
      }
      profile = { ...profile, ...request.postDataJSON() }
      return route.fulfill({ json: { id: mockUser.id } })
    }
    return route.fulfill({ json: [profile] })
  })
  await page.route('**/rest/v1/favourites?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/submissions?*', (route) => route.fulfill({ json: [] }))
  await page.goto('/profile')
  await page.locator('label[for="pref-interest-outdoors"]').click()
  await page.getByTestId('profile-save-prefs').click()
  await expect(page.getByTestId('profile-prefs-error')).toHaveText(
    "Couldn't save your preferences.",
  )
  await expect(page.getByTestId('profile-prefs-saved')).toHaveCount(0)
  await expect(page.getByTestId('pref-interest-outdoors')).toBeChecked()
  await expect(page.getByTestId('profile-unsaved')).toBeVisible()
  await expect(page.getByTestId('profile-save-prefs')).toBeEnabled()
  const confirmedUpdate = {
    id: 'eq.' + mockUser.id,
    select: 'id',
    accept: 'application/vnd.pgrst.object+json',
  }
  expect(attempts).toEqual([confirmedUpdate])

  await page.getByTestId('profile-save-prefs').click()
  await expect(page.getByTestId('profile-prefs-saved')).toHaveText('✓ Preferences saved')
  await expect(page.getByTestId('profile-prefs-error')).toHaveCount(0)
  await expect(page.getByTestId('profile-unsaved')).toHaveCount(0)
  await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
  expect(profile.interests).toEqual(['Cafes', 'Outdoors'])
  expect(attempts).toEqual([confirmedUpdate, confirmedUpdate])
})
