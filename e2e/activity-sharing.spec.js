import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

const activities = Array.from({ length: 23 }, (_, index) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`,
  name: `Activity ${index + 1}`,
  category: 'Workshops',
  price_per_person: 15,
  duration_min: 60,
  indoor: true,
  area: 'Bishan',
  source: 'curated',
}))
const groups = ['Saturday Squad', 'Family Day', 'Date Ideas'].map((name, index) => ({
  id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, '0')}`,
  name,
}))

async function mockBackend(page) {
  await signInMockUser(page)
  const state = {
    groups,
    membershipReads: 0,
    groupReads: 0,
    writes: [],
    shares: new Map(),
    failures: {},
    lostResponses: {},
    groupFailures: 0,
    readFailures: 0,
    favouriteFailure: false,
    membershipGate: null,
    writeGate: null,
  }
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    const fail = (code = 'TEST_FAILURE') =>
      route.fulfill({ status: 400, json: { code, message: 'Test failure' } })
    if (table === 'profiles') return route.fulfill({ json: [] })
    if (table === 'favourites') {
      if (state.favouriteFailure) return fail()
      return route.fulfill({ json: request.headers().accept?.includes('object') ? null : [] })
    }
    if (table === 'activities') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      return route.fulfill({
        json: id ? activities.find((activity) => activity.id === id) : activities,
      })
    }
    if (table === 'group_members') {
      expect(url.searchParams.get('user_id')).toBe('eq.' + mockUser.id)
      state.membershipReads += 1
      const memberships = state.groups.map((group) => ({ group_id: group.id }))
      if (state.membershipGate) await state.membershipGate
      if (state.groupFailures-- > 0) return fail()
      return route.fulfill({ json: memberships })
    }
    if (table === 'groups') {
      state.groupReads += 1
      return route.fulfill({ json: state.groups })
    }
    if (table === 'group_activities') {
      if (request.method() === 'GET') {
        if (state.readFailures-- > 0) return fail()
        const key = [
          url.searchParams.get('group_id')?.slice(3),
          url.searchParams.get('activity_id')?.slice(3),
        ].join(':')
        const row = state.shares.get(key)
        return route.fulfill({ json: row ? { activity_id: row.activity_id } : null })
      }
      expect(request.method()).toBe('POST')
      const row = request.postDataJSON()
      expect(row.shared_by).toBe(mockUser.id)
      state.writes.push(row)
      if (state.writeGate) await state.writeGate
      if (state.failures[row.group_id]-- > 0) return fail()
      const key = [row.group_id, row.activity_id].join(':')
      if (state.shares.has(key)) return fail('23505')
      state.shares.set(key, row)
      if (state.lostResponses[row.group_id]-- > 0) return route.abort('failed')
      return route.fulfill({ status: 201, json: {} })
    }
    throw new Error('Unexpected mock table: ' + table)
  })
  return state
}

const checkbox = (page, index) => page.getByTestId('share-group-' + groups[index].id)

test('grid shares the correct paginated activity without resetting browsing state', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/activities')
  await expect(page.getByTestId('activity-card')).toHaveCount(20)
  expect(state.membershipReads).toBe(0)
  expect(state.groupReads).toBe(0)
  await expect(page.getByTestId('activity-share-dialog')).toHaveCount(1)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const card = page.getByTestId('activity-card').nth(1)
  const heartBounds = await card.getByTestId('activity-save').boundingBox()
  const share = card.getByTestId('activity-share')
  const shareBounds = await share.boundingBox()
  expect(shareBounds.y).toBeGreaterThanOrEqual(heartBounds.y + heartBounds.height + 8)
  expect(shareBounds.width).toBe(44)
  expect(shareBounds.height).toBe(44)
  await share.click()
  const dialog = page.getByTestId('activity-share-dialog')
  await expect(dialog).toContainText('Activity 22')
  await expect(page.getByTestId('share-confirm')).toBeDisabled()
  await checkbox(page, 0).check()
  await checkbox(page, 2).check()
  await expect(page.getByTestId('share-confirm')).toHaveText('Share to 2 groups')
  await page.getByTestId('share-confirm').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('activity-save-feedback')).toHaveText(
    'Shared to Saturday Squad, Date Ideas.',
  )
  expect(state.writes).toEqual(
    [0, 2].map((index) => ({
      group_id: groups[index].id,
      activity_id: activities[21].id,
      shared_by: mockUser.id,
    })),
  )
  await expect(page).toHaveURL('/activities')
  await expect(page.getByTestId('activities-count')).toContainText('21–23 of 23')
  await expect(share).toBeFocused()
  expect(state.membershipReads).toBe(1)
  await page.getByTestId('activity-search').fill('Activity 22')
  await page.getByTestId('activity-share').click()
  await expect(checkbox(page, 0)).not.toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('activity-search')).toHaveValue('Activity 22')
})

test('multi-group partial failure keeps successful groups locked and retries only failures', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.failures[groups[1].id] = 1
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await checkbox(page, 0).check()
  await checkbox(page, 1).check()
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('share-error')).toContainText("Couldn't share this activity")
  await expect(checkbox(page, 0)).toBeDisabled()
  await expect(checkbox(page, 0)).toBeChecked()
  await expect(checkbox(page, 1)).toBeEnabled()
  await expect(page.getByTestId('share-group-option').nth(0)).toContainText('Shared')
  await expect(page.getByTestId('share-group-option').nth(1)).toContainText('Failed')
  expect(state.shares.size).toBe(1)
  await expect(page.getByTestId('share-confirm')).toHaveText('Share to 1 group')
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('activity-share-dialog')).toBeHidden()
  expect(state.writes.map((row) => row.group_id)).toEqual([
    groups[0].id,
    groups[1].id,
    groups[1].id,
  ])
  expect(state.shares.size).toBe(2)
  await expect(page.getByTestId('activity-save-feedback')).toHaveText(
    'Shared to Saturday Squad, Family Day.',
  )
})

test('duplicate sharing preserves the original sharer and reports mixed outcomes', async ({
  page,
}) => {
  const state = await mockBackend(page)
  const original = {
    group_id: groups[0].id,
    activity_id: activities[0].id,
    shared_by: 'another-member',
  }
  state.shares.set([original.group_id, original.activity_id].join(':'), original)
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await checkbox(page, 0).check()
  await checkbox(page, 1).check()
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('activity-share-dialog')).toBeHidden()
  await expect(page.getByTestId('activity-save-feedback')).toHaveText(
    'Shared to Family Day. Already shared to Saturday Squad.',
  )
  expect(state.shares.get([original.group_id, original.activity_id].join(':'))).toEqual(original)
})

test('a failed duplicate confirmation cannot report success, and a lost-response retry is safe', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.lostResponses[groups[0].id] = 1
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await checkbox(page, 0).check()
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('share-error')).toBeVisible()
  expect(state.shares.size).toBe(1)
  state.readFailures = 1
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('share-confirm')).toBeEnabled()
  await expect(page.getByTestId('activity-share-dialog')).toBeVisible()
  await expect(page.getByTestId('activity-save-feedback')).toHaveCount(0)
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('activity-share-dialog')).toBeHidden()
  await expect(page.getByTestId('activity-save-feedback')).toHaveText(
    'Already shared to Saturday Squad.',
  )
  expect(state.shares.size).toBe(1)
})

test('loading can be retried, and empty memberships offer the existing Groups page', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.groupFailures = 1
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await expect(page.getByTestId('share-error')).toContainText("Couldn't load your groups")
  state.groups = []
  await page.getByTestId('share-retry-groups').click()
  await expect(page.getByTestId('share-no-groups')).toBeVisible()
  await expect(page.getByTestId('share-confirm')).toHaveCount(0)
  await page.getByRole('link', { name: 'Create a new group' }).click()
  await expect(page).toHaveURL('/groups')
  expect(state.writes).toHaveLength(0)
})

test('sharing stays usable when favourites fail and validates the account before writing', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.favouriteFailure = true
  await page.goto('/activities')
  await expect(page.getByTestId('activity-save').first()).toBeDisabled()
  await page.getByTestId('activity-share').first().click()
  await checkbox(page, 0).check()
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ json: { ...mockUser, id: 'changed-account' } }),
  )
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('share-error')).toContainText('Log in again')
  await expect(page.getByTestId('share-confirm')).toBeDisabled()
  await expect(page.getByTestId('share-error').getByRole('link', { name: 'Log in' })).toBeVisible()
  expect(state.writes).toHaveLength(0)
})

test('pending sharing prevents repeated submissions and Escape dismissal', async ({ page }) => {
  const state = await mockBackend(page)
  let release
  state.writeGate = new Promise((resolve) => {
    release = resolve
  })
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await checkbox(page, 0).check()
  await checkbox(page, 1).check()
  await page.getByTestId('share-confirm').dblclick()
  await expect.poll(() => state.writes.length).toBe(2)
  await expect(page.getByTestId('share-confirm')).toBeDisabled()
  await expect(checkbox(page, 0)).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('activity-share-dialog')).toBeVisible()
  release()
  await expect(page.getByTestId('activity-share-dialog')).toBeHidden()
  expect(state.writes).toHaveLength(2)
})

test('closing during a slow load cannot replace the next activity or its groups', async ({
  page,
}) => {
  const state = await mockBackend(page)
  let release
  state.membershipGate = new Promise((resolve) => {
    release = resolve
  })
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await expect.poll(() => state.membershipReads).toBe(1)
  await expect(page.getByTestId('activity-share-dialog')).toContainText('Loading your groups')
  await page.keyboard.press('Escape')
  state.membershipGate = null
  state.groups = [groups[2]]
  await page.getByTestId('activity-share').nth(1).click()
  await expect(checkbox(page, 2)).toBeVisible()
  release()
  await expect(page.getByTestId('activity-share-dialog')).toContainText('Activity 2')
  await expect(page.getByTestId('share-group-option')).toHaveCount(1)
  await checkbox(page, 2).check()
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('activity-share-dialog')).toBeHidden()
  expect(state.writes[0].activity_id).toBe(activities[1].id)
})

test('a stalled group load reaches a retryable deadline', async ({ page }) => {
  const state = await mockBackend(page)
  let release
  state.membershipGate = new Promise((resolve) => {
    release = resolve
  })
  await page.clock.install()
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await expect.poll(() => state.membershipReads).toBe(1)
  await page.clock.fastForward(15001)
  await expect(page.getByTestId('share-retry-groups')).toBeVisible()
  state.membershipGate = null
  release()
  await page.getByTestId('share-retry-groups').click()
  await expect(checkbox(page, 0)).toBeVisible()
})

test('a stalled share times out, keeps completed groups, and safely retries the uncertain write', async ({
  page,
}) => {
  const state = await mockBackend(page)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await page.clock.install()
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await checkbox(page, 0).check()
  await checkbox(page, 1).check()
  await page.route('**/rest/v1/group_activities', async (route) => {
    const row = route.request().postDataJSON()
    if (row.group_id !== groups[1].id) return route.fallback()
    state.writes.push(row)
    state.shares.set([row.group_id, row.activity_id].join(':'), row)
    await gate
    await route.fulfill({ status: 201, json: {} })
  })
  await page.getByTestId('share-confirm').click()
  await expect.poll(() => state.shares.size).toBe(2)
  await page.clock.fastForward(15001)
  await expect(page.getByTestId('share-error')).toBeVisible()
  await expect(checkbox(page, 0)).toBeDisabled()
  await expect(checkbox(page, 1)).toBeEnabled()
  release()
  await page.unroute('**/rest/v1/group_activities')
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('activity-share-dialog')).toBeHidden()
  await expect(page.getByTestId('activity-save-feedback')).toHaveText(
    'Shared to Saturday Squad. Already shared to Family Day.',
  )
  expect(state.writes.map((row) => row.group_id).sort()).toEqual([
    groups[0].id,
    groups[1].id,
    groups[1].id,
  ])
})

test('leaving during sharing cannot show its late result on another activity', async ({ page }) => {
  const state = await mockBackend(page)
  let release
  state.writeGate = new Promise((resolve) => {
    release = resolve
  })
  await page.goto('/activities')
  await page.getByTestId('activity-share').first().click()
  await checkbox(page, 0).check()
  await page.getByTestId('share-confirm').click()
  await expect.poll(() => state.writes.length).toBe(1)
  await page.goto('/activities/' + activities[1].id)
  release()
  state.writeGate = null
  await page.getByTestId('detail-share').click()
  await expect(page.getByTestId('activity-share-dialog')).toContainText('Activity 2')
  await expect(checkbox(page, 0)).not.toBeChecked()
  await expect(page.getByTestId('detail-toast')).toHaveCount(0)
  await checkbox(page, 0).check()
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('detail-toast')).toContainText('Shared to Saturday Squad')
  expect(state.writes.map((row) => row.activity_id)).toEqual([activities[0].id, activities[1].id])
})

test('detail uses the same multi-group picker', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/activities/' + activities[0].id)
  await page.getByTestId('detail-share').click()
  await checkbox(page, 0).check()
  await checkbox(page, 1).check()
  await page.getByTestId('share-confirm').click()
  await expect(page.getByTestId('detail-toast')).toHaveText('Shared to Saturday Squad, Family Day.')
  expect(state.shares.size).toBe(2)
})

test('keyboard opens and closes the dialog with focus restored to the share button', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto('/activities')
  const share = page.getByTestId('activity-share').first()
  await share.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByTestId('activity-share-dialog')
  await expect(dialog).toBeVisible()
  await expect(checkbox(page, 0)).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(checkbox(page, 0)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(checkbox(page, 0)).toBeChecked()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Close share menu' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('link', { name: 'Create a new group' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close share menu' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(share).toBeFocused()
})

test.describe('phone sharing', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

  test('touch targets and multi-group picker fit the screen', async ({ page }) => {
    await mockBackend(page)
    await page.goto('/activities')
    await page.getByTestId('activity-share').first().tap()
    await checkbox(page, 0).tap()
    await checkbox(page, 1).tap()
    await expect(page.getByTestId('share-confirm')).toHaveText('Share to 2 groups')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await page.screenshot({ path: test.info().outputPath('multi-group-share-phone.png') })
    await page.getByTestId('share-confirm').tap()
    await expect(page.getByTestId('activity-share-dialog')).toBeHidden()
  })
})
