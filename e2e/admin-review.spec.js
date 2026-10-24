import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

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
  await page.route('**/rest/v1/**', (route) => {
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
        return route.fulfill({ json: state.submissions[0] })
      }
      const status = url.searchParams.get('status')?.replace('eq.', '')
      const rows = state.submissions.filter((row) => !status || row.status === status)
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
      submission.reviewed_by = mockUser.id
      submission.reviewed_at = '2026-10-23T04:00:00Z'
      if (endpoint === 'approve_submission') {
        submission.status = 'approved'
        submission.activity_id = activityId
        state.activities.push({ ...submission, id: activityId, source: 'community' })
      } else {
        submission.status = 'rejected'
        submission.reject_reason = body.p_reason
      }
      return route.fulfill({ json: submission })
    }
    if (endpoint === 'activities') return route.fulfill({ json: state.activities })
    return route.fulfill({ json: [] })
  })
  return state
}

test('ordinary users cannot open the admin page or see its navigation link', async ({ page }) => {
  const state = await mockBackend(page, false)
  await page.goto('/admin/submissions')
  await expect(page).toHaveURL('/admin/access')
  await expect(page.getByTestId('nav-admin')).toHaveCount(0)
  await expect(page.getByText('Admin access required')).toBeVisible()
  expect(state.requests).toHaveLength(0)
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
