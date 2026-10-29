import { test, expect } from '@playwright/test'
import { authStorageKey, mockSession, mockUser, signInMockUser } from './helpers/auth'
import { mockPlaceSearch, placeCandidates } from './helpers/places'
import { photoFile } from './helpers/photos'

const submissionId = '22222222-2222-4222-8222-222222222222'
const activityId = '33333333-3333-4333-8333-333333333333'
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

async function mockBackend(page, admin = true) {
  await signInMockUser(page)
  const state = {
    admin,
    roleError: false,
    loadError: false,
    actionError: false,
    stallResponse: false,
    requests: [],
    activities: [],
    submissions: [
      {
        id: submissionId,
        submitted_by: mockUser.id,
        name: 'Weekend art studio',
        category: 'Arts and culture',
        price_per_person: 25.5,
        duration_min: 90,
        indoor: true,
        address: '10 Orchard Road',
        postal_code: '012345',
        google_place_id: 'ChIJ_original',
        area: 'Orchard',
        description: 'Try a weekend art session.',
        website: 'https://example.com/studio',
        image_url: null,
        opening_hours: Object.fromEntries(
          days.map((day) => [day, { open: '10:00', close: '18:00' }]),
        ),
        status: 'pending',
        reject_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        activity_id: null,
        created_at: '2026-10-22T04:00:00Z',
        submitter: { display_name: 'Demo User' },
      },
    ],
  }
  await page.route('https://images.unsplash.com/**', (route) => route.fulfill({ status: 204 }))
  async function replyAction(route, row) {
    const response = structuredClone(row)
    if (state.stallResponse) {
      state.stallResponse = false
      await new Promise((resolve) => {
        state.releaseResponse = resolve
      })
    }
    return route.fulfill({ json: response }).catch(() => {})
  }
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const endpoint = url.pathname.split('/').pop()
    if (endpoint === 'profiles') {
      if (state.roleError) return route.fulfill({ status: 403, json: { message: 'Read denied' } })
      return route.fulfill({
        json: { is_admin: state.admin, display_name: 'Demo User', interests: [], company: [] },
      })
    }
    if (endpoint === 'submissions') {
      if (state.loadError)
        return route.fulfill({ status: 500, json: { message: 'Database unavailable' } })
      if (request.method() === 'PATCH') {
        state.requests.push({ action: 'edit', body: request.postDataJSON() })
        if (state.actionError)
          return route.fulfill({ status: 403, json: { message: 'Update denied' } })
        Object.assign(state.submissions[0], request.postDataJSON())
        return replyAction(route, state.submissions[0])
      }
      const status = url.searchParams.get('status')?.replace('eq.', '')
      const nameFilter = url.searchParams.get('name')
      const search = nameFilter
        ?.slice('ilike.%'.length, -1)
        .replace(/\\([\\%_])/g, '$1')
        .toLowerCase()
      const rows = state.submissions.filter(
        (row) =>
          (!status || row.status === status) &&
          (!search || row.name.toLowerCase().includes(search)),
      )
      const headers = {
        'access-control-expose-headers': 'content-range',
        'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
      }
      if (request.method() === 'HEAD') return route.fulfill({ headers, body: '' })
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? rows.length)
      return route.fulfill({ headers, json: rows.slice(offset, offset + limit) })
    }
    if (endpoint === 'approve_submission' || endpoint === 'reject_submission') {
      const body = request.postDataJSON()
      state.requests.push({ action: endpoint, body })
      if (state.actionError)
        return route.fulfill({ status: 403, json: { message: 'Review denied' } })
      const submission = state.submissions.find((row) => row.id === body.p_submission_id)
      if (
        (endpoint === 'approve_submission' && submission.status === 'approved') ||
        (endpoint === 'reject_submission' &&
          submission.status === 'rejected' &&
          submission.reject_reason === body.p_reason)
      ) {
        return replyAction(route, submission)
      }
      if (submission.status !== 'pending')
        return route.fulfill({ status: 409, json: { message: 'Already reviewed' } })
      submission.reviewed_by = mockUser.id
      submission.reviewed_at = '2026-10-23T04:00:00Z'
      if (endpoint === 'approve_submission') {
        submission.status = 'approved'
        submission.activity_id = activityId
        // Explicit approval contract; browser mocks still do not execute the real SQL.
        const fields = [
          'name',
          'category',
          'price_per_person',
          'duration_min',
          'indoor',
          'address',
          'area',
          'opening_hours',
          'description',
          'image_url',
          'website',
          'google_place_id',
        ]
        state.activities.push({
          ...Object.fromEntries(fields.map((key) => [key, submission[key]])),
          id: activityId,
          source: 'community',
        })
      } else {
        submission.status = 'rejected'
        submission.reject_reason = body.p_reason
      }
      return replyAction(route, submission)
    }
    if (endpoint === 'edit_approved_submission' || endpoint === 'delete_submission') {
      const body = request.postDataJSON()
      state.requests.push({ action: endpoint, body })
      if (state.actionError || !state.admin)
        return route.fulfill({ status: 403, json: { message: 'Admin action denied' } })
      const submission = state.submissions.find((row) => row.id === body.p_submission_id)
      if (endpoint === 'delete_submission') {
        if (submission && submission.status !== body.p_expected_status)
          return route.fulfill({ status: 409, json: { message: 'Status changed' } })
        state.submissions = state.submissions.filter((row) => row.id !== body.p_submission_id)
        state.activities = state.activities.filter((row) => row.id !== submission?.activity_id)
        return replyAction(route, body.p_submission_id)
      }
      if (submission?.status !== 'approved')
        return route.fulfill({ status: 409, json: { message: 'Not approved' } })
      Object.assign(submission, body.p_details)
      const activity = state.activities.find((row) => row.id === submission.activity_id)
      const { postal_code: _postalCode, ...details } = body.p_details
      Object.assign(activity, details)
      return replyAction(route, submission)
    }
    if (endpoint === 'activities') return route.fulfill({ json: state.activities })
    return route.fulfill({ json: [] })
  })
  return state
}

for (const width of [1280, 375]) {
  test(`partial name search filters all status tabs and resets pagination at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockBackend(page)
    const original = state.submissions[0]
    state.submissions = [
      ...Array.from({ length: 12 }, (_, index) => ({
        ...original,
        id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
        name: index === 11 ? 'Hidden River Walk' : `Studio ${index + 1}`,
      })),
      { ...original, id: 'approved-river', name: 'River cafe', status: 'approved' },
      { ...original, id: 'rejected-river', name: 'River rooftop', status: 'rejected' },
    ]
    await page.goto('/admin/submissions')
    await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (12)')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Studio 11', exact: true })).toBeVisible()
    const search = page.getByTestId('admin-search')
    await search.fill(' rIvEr ')
    await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (1)')
    await expect(page.getByTestId('admin-tab-approved')).toHaveText('Approved (1)')
    await expect(page.getByTestId('admin-tab-rejected')).toHaveText('Rejected (1)')
    await expect(
      page.getByRole('heading', { name: 'Hidden River Walk', exact: true }),
    ).toBeVisible()
    await expect(page.locator('[data-testid^="admin-submission-"]')).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: 'Submission pages' })).toHaveCount(0)
    await page.getByTestId('admin-tab-approved').click()
    await expect(page.getByRole('heading', { name: 'River cafe', exact: true })).toBeVisible()
    await expect(search).toHaveValue(' rIvEr ')
    await page.getByTestId('admin-tab-rejected').click()
    await expect(page.getByRole('heading', { name: 'River rooftop', exact: true })).toBeVisible()
    await search.fill('unfindable')
    await expect(page.getByTestId('admin-empty')).toContainText('No rejected activities match')
    await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (0)')
    await expect(page.getByTestId('admin-tab-approved')).toHaveText('Approved (0)')
    await expect(page.getByTestId('admin-tab-rejected')).toHaveText('Rejected (0)')
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'River rooftop', exact: true })).toBeVisible()
    await expect(search).toHaveValue('')
    await page.getByTestId('admin-tab-pending').click()
    await expect(page.getByRole('heading', { name: 'Studio 1', exact: true })).toBeVisible()
    await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (12)')
    await expect(page.locator('[data-testid^="admin-submission-"]')).toHaveCount(10)
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
  })
}

test('search treats percent and underscore as literal name characters', async ({ page }) => {
  const state = await mockBackend(page)
  state.submissions = ['100% Fun', '1000 Fun', 'Studio_A', 'StudioBA'].map((name, index) => ({
    ...state.submissions[0],
    id: `search-${index}`,
    name,
  }))
  await page.goto('/admin/submissions')
  const filteredRequest = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return request.method() === 'GET' && url.searchParams.get('name') === 'ilike.%\\%%'
  })
  await page.getByTestId('admin-search').fill('%')
  await filteredRequest
  await expect(page.getByRole('heading', { name: '100% Fun', exact: true })).toBeVisible()
  await expect(page.locator('[data-testid^="admin-submission-"]')).toHaveCount(1)
  await page.getByTestId('admin-search').fill('_')
  await expect(page.getByRole('heading', { name: 'Studio_A', exact: true })).toBeVisible()
  await expect(page.locator('[data-testid^="admin-submission-"]')).toHaveCount(1)
})

test('renaming a search result refreshes matching cards and counts', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/admin/submissions')
  const searchResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).searchParams.get('name') === 'ilike.%art%',
  )
  await page.getByTestId('admin-search').fill('art')
  await searchResponse
  await expect(page.getByText('Loading submissions...', { exact: true })).toHaveCount(0)
  await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (1)')
  await page.getByTestId('admin-edit').click()
  await page.getByTestId('admin-edit-name').fill('Renamed venue')
  await page.getByTestId('admin-save-edits').click()
  await expect(page.getByTestId('admin-empty')).toContainText('No pending activities match')
  await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (0)')
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Renamed venue', exact: true })).toBeVisible()
})

test('ordinary users cannot open the admin page or see its navigation link', async ({ page }) => {
  const state = await mockBackend(page, false)
  await page.goto('/admin/submissions')
  await expect(page).toHaveURL('/admin/access')
  await expect(page.getByTestId('nav-admin')).toHaveCount(0)
  await expect(page.getByText('Admin access required')).toBeVisible()
  expect(state.requests).toHaveLength(0)
})

for (const width of [1280, 375]) {
  test(`edits an approved activity and updates its published details at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockBackend(page)
    await page.goto('/admin/submissions')
    await page.getByTestId('admin-approve').click()
    await expect(page.getByTestId('admin-empty')).toBeVisible()
    await expect(page.getByTestId('admin-tab-approved')).toHaveText('Approved (1)')
    await page.getByTestId('admin-tab-approved').click()
    await expect(page.getByTestId('admin-approve')).toHaveCount(0)
    await expect(page.getByTestId('admin-reject')).toHaveCount(0)
    await page.getByTestId('admin-edit').click()
    await page.getByTestId('admin-edit-name').fill('Updated published studio')
    await page.getByTestId('admin-edit-price').fill('40')
    await page.getByTestId('admin-hours-Mon-open').fill('12:00')
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
    state.actionError = true
    await page.getByTestId('admin-save-edits').click()
    await expect(page.getByTestId('admin-action-error')).toContainText("Couldn't save changes")
    await expect(page.getByTestId('admin-edit-name')).toHaveValue('Updated published studio')
    expect(state.activities[0].name).toBe('Weekend art studio')
    state.actionError = false
    await page.getByTestId('admin-save-edits').click()
    await expect(page.getByRole('status')).toContainText('published activity')
    expect(state.activities).toHaveLength(1)
    expect(state.activities[0]).toMatchObject({
      id: activityId,
      name: 'Updated published studio',
      price_per_person: 40,
      opening_hours: { Mon: { open: '12:00', close: '18:00' } },
    })
    expect(state.submissions[0].status).toBe('approved')
    await page.goto('/activities')
    await expect(page.getByTestId('activity-card')).toContainText('Updated published studio')
    await expect(page.getByTestId('activity-card')).toContainText('40')
  })
}

const deletionScenarios = [
  { status: 'pending', prepare: async () => {}, warning: 'permanently deletes the submission.' },
  {
    status: 'approved',
    warning: 'published activity',
    prepare: async (page) => {
      await page.getByTestId('admin-approve').click()
      await expect(page.getByTestId('admin-empty')).toBeVisible()
    },
  },
  {
    status: 'rejected',
    warning: 'permanently deletes the submission.',
    prepare: async (page) => {
      await page.getByTestId('admin-reject').click()
      await page.getByTestId('admin-reject-reason').fill('Duplicate')
      await page.getByTestId('admin-confirm-reject').click()
      await expect(page.getByTestId('admin-empty')).toBeVisible()
    },
  },
]
for (const { status, prepare, warning } of deletionScenarios) {
  test(`confirms and deletes a ${status} submission`, async ({ page }) => {
    const state = await mockBackend(page)
    await page.goto('/admin/submissions')
    await prepare(page)
    await page.getByTestId(`admin-tab-${status}`).click()
    const previousRequests = state.requests.length
    await page.getByTestId('admin-delete').click()
    await expect(page.getByTestId('admin-delete-confirmation')).toContainText(warning)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(state.requests).toHaveLength(previousRequests)
    await expect(page.getByTestId(`admin-submission-${submissionId}`)).toBeVisible()
    await page.getByTestId('admin-delete').click()
    state.actionError = true
    await page.getByTestId('admin-confirm-delete').click()
    await expect(page.getByTestId('admin-action-error')).toContainText("Couldn't delete")
    await expect(page.getByTestId('admin-confirm-delete')).toBeEnabled()
    expect(state.submissions).toHaveLength(1)
    state.actionError = false
    await page.getByTestId('admin-confirm-delete').click()
    await expect(page.getByTestId('admin-empty')).toBeVisible()
    await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (0)')
    await expect(page.getByTestId('admin-tab-approved')).toHaveText('Approved (0)')
    await expect(page.getByTestId('admin-tab-rejected')).toHaveText('Rejected (0)')
    expect(state.submissions).toHaveLength(0)
    expect(state.activities).toHaveLength(0)
    expect(state.requests.at(-1).body).toEqual({
      p_submission_id: submissionId,
      p_expected_status: status,
    })
    await page.goto('/profile')
    await expect(page.getByTestId(`submission-${submissionId}`)).toHaveCount(0)
    await page.goto('/activities')
    await expect(page.getByTestId('activity-card')).toHaveCount(0)
  })
}

test('a delete checks the status again if another admin has approved the card', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-delete').click()
  state.submissions[0].status = 'approved'
  await page.getByTestId('admin-confirm-delete').click()
  await expect(page.getByTestId('admin-action-error')).toContainText("Couldn't delete")
  expect(state.submissions).toHaveLength(1)
})

test('a committed delete with a lost response can be retried safely', async ({ page }) => {
  const state = await mockBackend(page)
  await page.clock.install()
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-delete').click()
  state.stallResponse = true
  await page.getByTestId('admin-confirm-delete').click()
  await expect.poll(() => state.requests.length).toBe(1)
  await page.clock.fastForward(30001)
  await expect(page.getByTestId('admin-action-error')).toContainText("Couldn't delete")
  await page.getByTestId('admin-confirm-delete').click()
  await expect(page.getByTestId('admin-empty')).toBeVisible()
  state.releaseResponse()
  expect(state.submissions).toHaveLength(0)
  expect(state.activities).toHaveLength(0)
})

test('deleting the last card on a page returns to the previous page', async ({ page }) => {
  const state = await mockBackend(page)
  const original = state.submissions[0]
  state.submissions = Array.from({ length: 11 }, (_, index) => ({
    ...original,
    id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    name: `Studio ${index + 1}`,
  }))
  await page.goto('/admin/submissions')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Studio 11', exact: true })).toBeVisible()
  await page.getByTestId('admin-delete').click()
  await page.getByTestId('admin-confirm-delete').click()
  await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (10)')
  await expect(page.getByRole('heading', { name: 'Studio 1', exact: true })).toBeVisible()
  await expect(page.locator('[data-testid^="admin-submission-"]')).toHaveCount(10)
})

test('a failed role check denies access and can be retried', async ({ page }) => {
  const state = await mockBackend(page)
  state.roleError = true
  await page.goto('/admin/submissions')
  await expect(page.getByRole('alert')).toContainText("Couldn't check your admin access")
  await expect(page.getByTestId('nav-admin')).toHaveCount(0)
  state.roleError = false
  await page.getByRole('link', { name: 'Try again' }).click()
  await expect(page.getByTestId('admin-review-page')).toBeVisible()
})

for (const width of [1280, 375]) {
  test(`shows submission details, tabs and empty states at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await mockBackend(page)
    await page.goto('/admin/submissions')
    await expect(page.getByTestId('nav-admin')).toHaveCount(1)
    const card = page.getByTestId(`admin-submission-${submissionId}`)
    await expect(card).toContainText('Demo User')
    await expect(card).toContainText('S$25.50')
    await expect(card).toContainText('No photo submitted')
    await expect(card.getByRole('link', { name: 'https://example.com/studio' })).toHaveAttribute(
      'href',
      'https://example.com/studio',
    )
    await card.getByText('Opening hours (Singapore time)', { exact: true }).click()
    await expect(card).toContainText('Monday: 10:00')
    await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (1)')
    await expect(page.getByTestId('admin-tab-approved')).toHaveText('Approved (0)')
    await expect(page.getByTestId('admin-tab-rejected')).toHaveText('Rejected (0)')
    await page.getByTestId('admin-tab-approved').click()
    await expect(page.getByTestId('admin-empty')).toHaveText('No approved submissions yet.')
    await page.getByTestId('admin-tab-rejected').click()
    await expect(page.getByTestId('admin-empty')).toHaveText('No rejected submissions yet.')
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
  })
}

test('edits name, price and hours before approval and publishes a Community activity', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-edit').click()
  await page.getByTestId('admin-edit-name').fill('Corrected studio name')
  await page.getByTestId('admin-edit-price').fill('30')
  await page.getByTestId('admin-hours-Mon-open').fill('11:00')
  await page.getByTestId('admin-save-edits').click()
  await expect(page.getByRole('status')).toContainText('Changes saved')
  await page.getByTestId('admin-approve').click()
  await expect(page.getByTestId('admin-empty')).toHaveText(
    'All caught up. No submissions to review.',
  )
  await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (0)')
  expect(state.requests[0].body).toMatchObject({
    name: 'Corrected studio name',
    google_place_id: null,
    price_per_person: 30,
    opening_hours: { Mon: { open: '11:00', close: '18:00' } },
  })
  expect(state.requests[0].body).not.toHaveProperty('status')
  expect(state.requests[1]).toEqual({
    action: 'approve_submission',
    body: { p_submission_id: submissionId },
  })
  await page.getByTestId('admin-tab-approved').click()
  await expect(page.getByRole('link', { name: 'View published activity' })).toHaveAttribute(
    'href',
    `/activities/${activityId}`,
  )
  await expect(page.getByTestId('admin-approve')).toHaveCount(0)
  await page.goto('/activities')
  await expect(page.getByTestId('activity-card')).toContainText('Corrected studio name')
  await expect(page.getByTestId('activity-card')).toContainText('Community')
})

for (const width of [1280, 375]) {
  test(`admin must add and save hours before approving a new submission at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mockBackend(page)
    state.submissions[0].opening_hours = {}
    await page.goto('/admin/submissions')
    await expect(page.getByTestId('admin-hours-required')).toBeVisible()
    await expect(page.getByTestId('admin-approve')).toBeDisabled()
    await page.getByTestId('admin-edit').click()
    await expect(page.getByTestId('admin-hours-Mon-open')).toHaveValue('')
    await page.getByTestId('admin-save-edits').click()
    await expect(page.getByTestId('admin-hours-Mon-open')).toBeFocused()
    expect(state.requests).toHaveLength(0)
    for (const day of days) await page.getByTestId(`admin-hours-${day}-mode`).selectOption('closed')
    await page.getByTestId('admin-save-edits').click()
    await expect(page.getByTestId('admin-action-error')).toContainText('open on at least one day')
    expect(state.requests).toHaveLength(0)
    await page.getByTestId('admin-hours-Sat-mode').selectOption('open')
    await page.getByTestId('admin-hours-Sat-open').fill('10:00')
    await page.getByTestId('admin-hours-Sat-close').fill('18:00')
    await page.getByTestId('admin-hours-Sun-mode').selectOption('24h')
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
    await page
      .getByTestId('admin-edit-form')
      .screenshot({ path: test.info().outputPath('admin-hours.png') })
    await page.getByTestId('admin-save-edits').click()
    await expect(page.getByTestId('admin-hours-required')).toHaveCount(0)
    await expect(page.getByTestId('admin-approve')).toBeEnabled()
    await page.getByTestId('admin-approve').click()
    await expect(page.getByTestId('admin-empty')).toBeVisible()
    expect(state.activities).toHaveLength(1)
    expect(state.activities[0].opening_hours).toEqual({
      Mon: { closed: true },
      Tue: { closed: true },
      Wed: { closed: true },
      Thu: { closed: true },
      Fri: { closed: true },
      Sat: { open: '10:00', close: '18:00' },
      Sun: { open24h: true },
    })
  })
}

for (const openingHours of [
  null,
  { Mon: { open24h: true } },
  Object.fromEntries(days.map((day) => [day, { closed: true }])),
  Object.fromEntries(days.map((day) => [day, { open: '09:00', close: '09:00' }])),
]) {
  test(`incomplete or invalid saved hours block approval: ${JSON.stringify(openingHours)}`, async ({
    page,
  }) => {
    const state = await mockBackend(page)
    state.submissions[0].opening_hours = openingHours
    await page.goto('/admin/submissions')
    await expect(page.getByTestId('admin-approve')).toBeDisabled()
    await expect(page.getByTestId('admin-hours-required')).toBeVisible()
    await page.getByTestId('admin-reject').click()
    await page.getByTestId('admin-reject-reason').fill('Could not verify this venue')
    await page.getByTestId('admin-confirm-reject').click()
    await expect(page.getByTestId('admin-empty')).toBeVisible()
    expect(state.activities).toHaveLength(0)
  })
}

test('requires a rejection reason and shows it in the submitter profile', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-reject').click()
  await page.getByTestId('admin-reject-reason').fill('   ')
  await page.getByTestId('admin-confirm-reject').click()
  await expect(page.getByTestId('admin-action-error')).toContainText('Enter a rejection reason')
  expect(state.requests).toHaveLength(0)
  await page.getByTestId('admin-reject-reason').fill('  Duplicate of an existing activity  ')
  await page.getByTestId('admin-confirm-reject').click()
  await expect(page.getByTestId('admin-empty')).toBeVisible()
  await expect(page.getByTestId('admin-tab-rejected')).toHaveText('Rejected (1)')
  expect(state.requests[0].body.p_reason).toBe('Duplicate of an existing activity')
  await page.getByTestId('admin-tab-rejected').click()
  await expect(page.getByTestId(`admin-submission-${submissionId}`)).toContainText(
    'Duplicate of an existing activity',
  )
  await page.goto('/profile')
  await expect(page.getByTestId(`submission-${submissionId}`)).toContainText(
    'Duplicate of an existing activity',
  )
})

test('failed edits keep the draft, cancel discards it, and failed reviews can be retried', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-edit').click()
  await page.getByTestId('admin-edit-name').fill('Unsaved name')
  state.actionError = true
  await page.getByTestId('admin-save-edits').click()
  await expect(page.getByTestId('admin-action-error')).toContainText("Couldn't save changes")
  await expect(page.getByTestId('admin-edit-name')).toHaveValue('Unsaved name')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByTestId('admin-edit').click()
  await expect(page.getByTestId('admin-edit-name')).toHaveValue('Weekend art studio')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByTestId('admin-approve').click()
  await expect(page.getByTestId('admin-action-error')).toContainText("Couldn't approve")
  await expect(page.getByTestId('admin-approve')).toBeEnabled()
  state.actionError = false
  await page.getByTestId('admin-approve').click()
  await expect(page.getByTestId('admin-empty')).toBeVisible()
})

test('loading failures offer a retry', async ({ page }) => {
  const state = await mockBackend(page)
  state.loadError = true
  await page.goto('/admin/submissions')
  await expect(page.getByRole('alert')).toContainText("Couldn't load submissions")
  state.loadError = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (1)')
})

test('reviews the last card on a page and returns to the previous page', async ({ page }) => {
  const state = await mockBackend(page)
  const original = state.submissions[0]
  state.submissions = Array.from({ length: 11 }, (_, index) => ({
    ...original,
    id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
    name: `Studio ${index + 1}`,
  }))
  await page.goto('/admin/submissions')
  await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (11)')
  await expect(page.locator('[data-testid^="admin-submission-"]')).toHaveCount(10)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Studio 11', exact: true })).toBeVisible()
  await page.getByTestId('admin-approve').click()
  await expect(page.getByTestId('admin-tab-pending')).toHaveText('Pending (10)')
  await expect(page.getByRole('heading', { name: 'Studio 1', exact: true })).toBeVisible()
  await expect(page.locator('[data-testid^="admin-submission-"]')).toHaveCount(10)
})

const venueEdits = [
  [
    'correct',
    placeCandidates[1].id,
    async (page) => {
      await page.getByTestId('admin-edit-address').fill('20 Orchard Road')
      await expect(page.getByTestId('place-link')).toHaveCount(0)
      await page.getByTestId('place-find').click()
      await page.getByTestId('place-candidate').nth(1).click()
    },
  ],
  [
    'clear',
    null,
    async (page) => {
      await page.getByTestId('place-clear').click()
    },
  ],
]
for (const [action, expectedId, edit] of venueEdits) {
  test(`admin can ${action} a suggested venue before publishing`, async ({ page }) => {
    const state = await mockBackend(page)
    const lookup = await mockPlaceSearch(page)
    await page.goto('/admin/submissions')
    await expect(page.getByTestId('admin-place-suggestion')).toContainText('ChIJ_original')
    expect(lookup.requests).toHaveLength(0)
    await page.getByTestId('admin-edit').click()
    await expect(page.getByRole('link', { name: 'Inspect suggested venue' })).toHaveAttribute(
      'href',
      /query_place_id=ChIJ_original/,
    )
    await edit(page)
    await page.getByTestId('admin-save-edits').click()
    await expect(page.getByRole('status')).toContainText('Changes saved')
    await page.getByTestId('admin-approve').click()
    await expect(page.getByTestId('admin-empty')).toBeVisible()
    expect(state.activities).toHaveLength(1)
    expect(state.activities[0].google_place_id).toBe(expectedId)
    expect(state.activities[0]).not.toHaveProperty('postal_code')
  })
}

test('unrelated admin edits preserve the saved venue ID', async ({ page }) => {
  const state = await mockBackend(page)
  await mockPlaceSearch(page)
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-edit').click()
  await page.getByTestId('admin-edit-price').fill('31')
  await page.getByTestId('admin-save-edits').click()
  await expect(page.getByRole('status')).toContainText('Changes saved')
  expect(state.submissions[0].google_place_id).toBe('ChIJ_original')
  await page.getByTestId('admin-approve').click()
  await expect(page.getByTestId('admin-empty')).toBeVisible()
  expect(state.activities[0].google_place_id).toBe('ChIJ_original')
})

for (const options of [
  { status: 429, error: 'app_limit' },
  { status: 503, error: 'unavailable' },
  { candidates: [] },
]) {
  test(`an admin keeps the existing venue after lookup ${options.error || 'no match'}`, async ({
    page,
  }) => {
    const state = await mockBackend(page)
    const lookup = await mockPlaceSearch(page, options)
    await page.goto('/admin/submissions')
    await page.getByTestId('admin-edit').click()
    await page.getByTestId('admin-edit-price').fill('31')
    await page.getByTestId('place-find').click()
    await expect(page.getByTestId('place-find')).toBeEnabled()
    expect(lookup.requests).toHaveLength(1)
    await expect(page.getByTestId('place-candidate')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Inspect suggested venue' })).toHaveAttribute(
      'href',
      /query_place_id=ChIJ_original/,
    )
    await page.getByTestId('admin-save-edits').click()
    await expect(page.getByRole('status')).toContainText('Changes saved')
    expect(state.submissions[0]).toMatchObject({
      price_per_person: 31,
      google_place_id: 'ChIJ_original',
    })
    await page.getByTestId('admin-approve').click()
    await expect(page.getByTestId('admin-empty')).toBeVisible()
    expect(state.activities[0].google_place_id).toBe('ChIJ_original')
  })
}

test('reviews a submitted photo and publishes the same image in the card and detail page', async ({
  page,
}) => {
  const state = await mockBackend(page)
  const imageUrl =
    'https://example.supabase.co/storage/v1/object/public/activity-images/owner/submission/photo.png'
  state.submissions[0].image_url = imageUrl
  state.submissions[0].google_place_id = null
  const image = await photoFile(page)
  const storageWrites = []
  await page.route('**/storage/v1/**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ contentType: image.mimeType, body: image.buffer })
    }
    storageWrites.push(route.request().method())
    return route.abort()
  })
  await page.goto('/admin/submissions')
  await expect(page.getByRole('img', { name: 'Weekend art studio' })).toHaveJSProperty(
    'naturalWidth',
    2,
  )
  await page.getByTestId('admin-approve').click()
  await expect(page.getByTestId('admin-empty')).toBeVisible()
  expect(state.activities).toHaveLength(1)
  expect(state.activities[0].image_url).toBe(imageUrl)
  await page.goto('/activities')
  await expect(page.getByTestId('activity-card').getByRole('img')).toHaveAttribute('src', imageUrl)
  await expect(page.getByTestId('activity-card').getByRole('img')).toHaveJSProperty(
    'naturalWidth',
    2,
  )
  await page.getByTestId('activity-photo-link').click()
  await expect(page.getByTestId('detail-photo')).toHaveAttribute('src', imageUrl)
  await expect(page.getByTestId('detail-photo')).toHaveJSProperty('naturalWidth', 2)
  expect(storageWrites).toHaveLength(0)
})

test('a broken submitted photo uses the fallback and rejection never publishes it', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.submissions[0].image_url =
    'https://example.supabase.co/storage/v1/object/public/activity-images/missing.png'
  await page.route('**/storage/v1/**', (route) => route.fulfill({ status: 404 }))
  await page.goto('/admin/submissions')
  await expect(page.getByText('Photo unavailable', { exact: true })).toBeVisible()
  await page.getByTestId('admin-reject').click()
  await page.getByTestId('admin-reject-reason').fill('Activity could not be verified')
  await page.getByTestId('admin-confirm-reject').click()
  await expect(page.getByTestId('admin-empty')).toBeVisible()
  expect(state.activities).toHaveLength(0)
  expect(state.submissions[0].status).toBe('rejected')
})

const stalledActions = [
  {
    action: 'edit',
    button: 'admin-save-edits',
    errorText: "Couldn't save changes",
    success: 'admin-approve',
    activityCount: 0,
    expected: { name: 'Newer saved draft', status: 'pending' },
    prepare: async (page) => {
      await page.getByTestId('admin-edit').click()
      await page.getByTestId('admin-edit-name').fill('Draft saved before timeout')
    },
    checkDraft: async (page) => {
      await expect(page.getByTestId('admin-edit-name')).toHaveValue('Draft saved before timeout')
      await page.getByTestId('admin-edit-name').fill('Newer saved draft')
    },
  },
  {
    action: 'approve_submission',
    button: 'admin-approve',
    errorText: "Couldn't approve",
    success: 'admin-empty',
    activityCount: 1,
    expected: { status: 'approved' },
    prepare: async () => {},
    checkDraft: async () => {},
  },
  {
    action: 'reject_submission',
    button: 'admin-confirm-reject',
    errorText: "Couldn't reject",
    success: 'admin-empty',
    activityCount: 0,
    expected: { status: 'rejected', reject_reason: 'Duplicate venue' },
    prepare: async (page) => {
      await page.getByTestId('admin-reject').click()
      await page.getByTestId('admin-reject-reason').fill('Duplicate venue')
    },
    checkDraft: async (page) => {
      await expect(page.getByTestId('admin-reject-reason')).toHaveValue('Duplicate venue')
    },
  },
]
for (const scenario of stalledActions) {
  test(`a stalled ${scenario.action} unlocks after 30 seconds and retries an already committed write safely`, async ({
    page,
  }) => {
    const state = await mockBackend(page)
    await page.clock.install()
    await page.goto('/admin/submissions')
    await scenario.prepare(page)
    state.stallResponse = true
    await page.getByTestId(scenario.button).click()
    await expect.poll(() => state.requests.length).toBe(1)
    await expect(page.getByTestId(scenario.button)).toBeDisabled()
    await page.clock.fastForward(30001)
    await expect(page.getByTestId('admin-action-error')).toContainText(scenario.errorText)
    await expect(page.getByTestId(scenario.button)).toBeEnabled()
    await scenario.checkDraft(page)
    await page.getByTestId(scenario.button).click()
    await expect(page.getByTestId(scenario.success)).toBeVisible()
    state.releaseResponse()
    expect(state.activities).toHaveLength(scenario.activityCount)
    expect(state.submissions[0]).toMatchObject(scenario.expected)
    await expect(page.getByTestId('admin-action-error')).toHaveCount(0)
  })
}

test('admin hours save times out while login refresh stalls and sends no late write', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.clock.install()
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-edit').click()
  await page.getByTestId('admin-hours-Mon-open').fill('11:00')
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
  await page.getByTestId('admin-save-edits').click()
  await refreshing
  await page.clock.fastForward(30001)
  await expect(page.getByTestId('admin-action-error')).toContainText("Couldn't save changes")
  await expect(page.getByTestId('admin-hours-Mon-open')).toHaveValue('11:00')
  await expect(page.getByTestId('admin-save-edits')).toBeEnabled()
  expect(state.requests).toHaveLength(0)
  await pendingRefresh.fulfill({ json: mockSession })
  await page.getByTestId('admin-save-edits').click()
  await expect(page.getByRole('status')).toContainText('Changes saved')
  expect(state.requests).toHaveLength(1)
  expect(state.submissions[0].opening_hours.Mon.open).toBe('11:00')
})

test('leaving a card while login refresh stalls cancels its pending hours save', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/admin/submissions')
  await page.getByTestId('admin-edit').click()
  await page.getByTestId('admin-hours-Mon-open').fill('11:00')
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
  await page.getByTestId('admin-save-edits').click()
  await refreshing
  await page.getByTestId('admin-tab-approved').click()
  await expect(page.getByTestId('admin-edit-form')).toHaveCount(0)
  await pendingRefresh.fulfill({ json: mockSession })
  await expect(page.getByTestId('admin-empty')).toHaveText('No approved submissions yet.')
  expect(state.requests).toHaveLength(0)
  expect(state.submissions[0].opening_hours.Mon.open).toBe('10:00')
})
