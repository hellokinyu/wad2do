import { test, expect } from '@playwright/test'

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
  await expect(page.getByTestId('activity-save')).toHaveCount(0)
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
  await expect(page.getByTestId('activities-count')).toHaveText('Showing 1 of 4 activities')

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
  await expect(page.getByTestId('sort-filter')).toHaveValue('catalogue')
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
  await expect(page.getByTestId('activities-count')).toHaveText('Showing 201 of 201 activities')

  await page.getByTestId('activity-search').fill('Last batch')
  await expect(page.getByTestId('activity-card')).toHaveCount(1)
  await expect(page.getByTestId('activity-card')).toContainText('Last batch workshop')
})
