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
  await expect(page.getByTestId('activities-error')).toContainText('Could not load demo activities')
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
  await page.getByTestId('clear-filters').click()
  await expect(cards).toHaveCount(4)
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
