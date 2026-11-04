import { test, expect } from '@playwright/test'
import { signInMockUser } from './helpers/auth'

const ids = {
  kayak: '44444444-4444-4444-8444-000000000001',
  cafe: '44444444-4444-4444-8444-000000000002',
  pottery: '44444444-4444-4444-8444-000000000003',
}

async function mockBackend(page, { admin = true, tagsColumn = true } = {}) {
  await signInMockUser(page)
  const state = {
    loadFailures: 0,
    saveFailure: null,
    saves: [],
    activities: [
      {
        id: ids.cafe,
        name: 'Cafés in Tiong Bahru',
        category: 'Cafés',
        tags: ['Cafés', 'Food'],
        source: 'curated',
        area: 'Tiong Bahru',
        image_url: null,
      },
      {
        id: ids.pottery,
        name: 'Pottery Workshop',
        category: 'Workshops',
        tags: ['Workshops'],
        source: 'community',
        area: 'Tiong Bahru',
        image_url: null,
      },
      {
        id: ids.kayak,
        name: 'Sunset Kayaking',
        category: 'Outdoor',
        tags: ['Outdoor', 'Sports and fitness'],
        source: 'curated',
        area: 'East Coast Park',
        image_url: null,
      },
    ],
  }
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const endpoint = url.pathname.split('/').pop()
    if (endpoint === 'profiles') {
      return route.fulfill({
        json: { is_admin: admin, display_name: 'Demo User', interests: [], company: [] },
      })
    }
    if (endpoint === 'activities') {
      if (state.loadFailures-- > 0)
        return route.fulfill({ status: 500, json: { message: 'Database unavailable' } })
      const select = url.searchParams.get('select') ?? ''
      if (!tagsColumn && select.includes('tags'))
        return route.fulfill({
          status: 400,
          json: { code: '42703', message: 'column does not exist' },
        })
      const rows = state.activities.map(({ tags, ...row }) =>
        select.includes('tags') ? { ...row, tags } : row,
      )
      return route.fulfill({ json: rows })
    }
    if (endpoint === 'admin_set_activity_tags') {
      const body = request.postDataJSON()
      state.saves.push(body)
      if (state.saveFailure) return route.fulfill({ status: 400, json: state.saveFailure })
      const activity = state.activities.find((row) => row.id === body.p_activity_id)
      activity.tags = body.p_tags
      activity.category = body.p_tags[0]
      return route.fulfill({
        json: [{ id: activity.id, category: activity.category, tags: activity.tags }],
      })
    }
    if (endpoint === 'submissions')
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    return route.fulfill({ json: [] })
  })
  return state
}

const row = (page, name) => page.getByTestId('admin-activity-row').filter({ hasText: name })
const dialog = (page) => page.getByTestId('admin-tags-dialog')
const option = (page, tag) =>
  dialog(page)
    .getByTestId('admin-tag-option')
    .and(page.getByLabel(tag, { exact: true }))

test('admins give an activity several tags, choose the main one and can undo', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/admin/activities')

  await expect(page.getByTestId('admin-activity-row')).toHaveCount(3)
  await expect(row(page, 'Cafés in Tiong Bahru').getByTestId('admin-activity-tag')).toHaveText([
    'Cafés · main',
    'Food',
  ])

  await row(page, 'Pottery Workshop').getByTestId('admin-activity-edit').click()
  await expect(dialog(page)).toBeVisible()
  await expect(option(page, 'Workshops')).toBeChecked()
  await option(page, 'Arts and culture').check()
  await option(page, 'Family-friendly').check()
  await dialog(page).getByTestId('admin-main-tag').selectOption('Arts and culture')
  await dialog(page).getByTestId('admin-tags-save').click()

  await expect(dialog(page)).toBeHidden()
  expect(state.saves).toEqual([
    { p_activity_id: ids.pottery, p_tags: ['Arts and culture', 'Workshops', 'Family-friendly'] },
  ])
  await expect(row(page, 'Pottery Workshop').getByTestId('admin-activity-tag')).toHaveText([
    'Arts and culture · main',
    'Workshops',
    'Family-friendly',
  ])
  await expect(row(page, 'Pottery Workshop').getByTestId('admin-activity-status')).toContainText(
    'Saved',
  )
  await expect(page.getByTestId('admin-activity-edit').nth(1)).toBeFocused()

  await row(page, 'Pottery Workshop').getByTestId('admin-activity-undo').click()
  await expect(row(page, 'Pottery Workshop').getByTestId('admin-activity-tag')).toHaveText([
    'Workshops · main',
  ])
  expect(state.saves[1]).toEqual({ p_activity_id: ids.pottery, p_tags: ['Workshops'] })
})

test('tags not on the list are flagged, filtered and dropped when fixed', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/admin/activities')

  const kayak = row(page, 'Sunset Kayaking')
  await expect(kayak.getByTestId('admin-activity-unofficial')).toBeVisible()
  await page.getByText('Only tags not on the list (1)').click()
  await expect(page.getByTestId('admin-activity-row')).toHaveCount(1)

  await kayak.getByTestId('admin-activity-edit').click()
  await expect(dialog(page).getByTestId('admin-tags-left-out')).toContainText('Outdoor')
  await expect(option(page, 'Sports and fitness')).toBeChecked()
  await option(page, 'Outdoors').check()
  await dialog(page).getByTestId('admin-tags-save').click()

  expect(state.saves).toEqual([
    { p_activity_id: ids.kayak, p_tags: ['Sports and fitness', 'Outdoors'] },
  ])
  // The fixed row stays on screen with its Saved message until the filter changes
  await expect(kayak.getByTestId('admin-activity-status')).toContainText('Saved')
  await expect(kayak.getByTestId('admin-activity-unofficial')).toHaveCount(0)
  await expect(page.getByText('Only tags not on the list (0)')).toBeVisible()
  // Undo can't bring back a tag that isn't on the list
  await expect(kayak.getByTestId('admin-activity-undo')).toHaveCount(0)
})

test('an activity needs at least one tag, and a failed save keeps the dialog open', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/admin/activities')
  await row(page, 'Pottery Workshop').getByTestId('admin-activity-edit').click()
  await option(page, 'Workshops').uncheck()
  await dialog(page).getByTestId('admin-tags-save').click()
  await expect(dialog(page).getByTestId('admin-tags-error')).toHaveText('Pick at least one tag.')
  expect(state.saves).toHaveLength(0)

  state.saveFailure = { code: '22023', message: 'Pick tags from the list.' }
  await option(page, 'Food').check()
  await dialog(page).getByTestId('admin-tags-save').click()
  await expect(dialog(page).getByTestId('admin-tags-error')).toHaveText('Pick tags from the list.')
  await expect(dialog(page)).toBeVisible()
  await expect(row(page, 'Pottery Workshop').getByTestId('admin-activity-tag')).toHaveText([
    'Workshops · main',
  ])
})

test('the page still loads before the database has a tags column', async ({ page }) => {
  await mockBackend(page, { tagsColumn: false })
  await page.goto('/admin/activities')
  await expect(page.getByTestId('admin-activity-row')).toHaveCount(3)
  await expect(row(page, 'Pottery Workshop').getByTestId('admin-activity-tag')).toHaveText([
    'Workshops · main',
  ])
})

test('a failed load can be retried', async ({ page }) => {
  const state = await mockBackend(page)
  state.loadFailures = 1
  await page.goto('/admin/activities')
  await expect(page.getByTestId('admin-activities-error')).toContainText("Couldn't load activities")
  await page.getByTestId('admin-activities-retry').click()
  await expect(page.getByTestId('admin-activity-row')).toHaveCount(3)
})

test('admins switch between Submissions and All activities', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-nav-activities').click()
  await expect(page).toHaveURL('/admin/activities')
  await expect(page.getByTestId('admin-nav-activities')).toHaveAttribute('aria-current', 'page')
  await page.getByTestId('admin-nav-submissions').click()
  await expect(page).toHaveURL('/admin/submissions')
})

test('non-admins cannot open the activities page', async ({ page }) => {
  const state = await mockBackend(page, { admin: false })
  await page.goto('/admin/activities')
  await expect(page).not.toHaveURL('/admin/activities')
  expect(state.saves).toHaveLength(0)
  await expect(page.getByTestId('admin-activities-page')).toHaveCount(0)
})
