import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'
import { mockRealtime } from './helpers/realtime'

const groupId = '44444444-4444-4444-8444-444444444444'
const memberId = '66666666-6666-4666-8666-666666666666'
const activityId = '55555555-5555-4555-8555-555555555555'

async function mockGroups(page) {
  await signInMockUser(page)
  const state = {
    group: {
      id: groupId,
      name: 'Weekend group',
      start_date: '2026-10-30',
      end_date: '2026-10-31',
      budget_per_person: 50,
      invite_code: 'ABC234',
      chosen_start: null,
      chosen_end: null,
      group_members: [{ count: 2 }],
      itineraries: [],
      is_member: true,
    },
    requests: [],
    availability: [],
    members: [
      { id: mockUser.id, display_name: 'Demo User' },
      { id: memberId, display_name: 'Friend', avatar_animal: 'cat' },
    ],
    created: null,
    fail: '',
    loseCreateResponse: false,
    holdSave: false,
    releaseSave: null,
  }
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const endpoint = url.pathname.split('/').pop()
    state.requests.push({
      endpoint,
      method: request.method(),
      select: url.searchParams.get('select'),
      body: request.postDataJSON(),
    })
    if (state.fail === endpoint)
      return route.fulfill({ status: 500, json: { message: 'Simulated failure' } })
    if (endpoint === 'profiles') return route.fulfill({ json: { is_admin: false } })
    if (url.pathname.includes('/rpc/')) {
      const body = request.postDataJSON()
      if (state.fail === endpoint)
        return route.fulfill({ status: 500, json: { message: 'Simulated failure' } })
      if (endpoint === 'wad2do_group_details') return route.fulfill({ json: state.group })
      if (endpoint === 'wad2do_join_group') {
        if (body.p_invite_code !== state.group.invite_code ||
          (body.p_group_id && body.p_group_id !== state.group.id)) {
          return route.fulfill({
            status: 404,
            json: { code: 'P0002', message: 'No group with that code.' },
          })
        }
        state.group.is_member = true
        return route.fulfill({ json: state.group.id })
      }
      if (endpoint === 'get_group_member_names')
        return route.fulfill({
          json: state.members,
        })
      if (endpoint === 'create_group') {
        state.created ??= {
          ...state.group,
          id: body.p_group_id,
          name: body.p_name,
          created_by: mockUser.id,
        }
        if (state.loseCreateResponse) {
          state.loseCreateResponse = false
          return route.abort('failed')
        }
        return route.fulfill({ json: state.created })
      }
      if (endpoint === 'replace_group_availability') {
        if (state.holdSave) {
          state.holdSave = false
          await new Promise((resolve) => {
            state.releaseSave = resolve
          })
        }
        if (body.p_slots.some((slot) =>
          slot.slice(0, 10) < state.group.start_date || slot.slice(0, 10) > state.group.end_date)) {
          return route.fulfill({ status: 400, json: { code: '22023', message: 'Slot outside group dates' } })
        }
        state.availability = state.availability
          .filter((row) => row.user_id !== mockUser.id)
          .concat(body.p_slots.map((slot_start) => ({ user_id: mockUser.id, slot_start })))
        return route.fulfill({ status: 204, body: '' })
      }
      if (endpoint === 'update_group_settings') {
        Object.assign(state.group, {
          name: body.p_name,
          start_date: body.p_start_date,
          end_date: body.p_end_date,
          budget_per_person: body.p_budget_per_person,
        })
        if (body.p_clear_chosen)
          Object.assign(state.group, { chosen_start: null, chosen_end: null, itineraries: [] })
        return route.fulfill({ json: state.group })
      }
      return route.fulfill({ status: 400, json: { message: 'Unexpected function' } })
    }
    if (request.method() !== 'GET')
      return route.fulfill({
        status: 403,
        json: { message: 'Direct table writes are not part of these flows' },
      })
    if (endpoint === 'groups') return route.fulfill({ json: state.group })
    if (endpoint === 'group_members') {
      return route.fulfill({
        json:
          url.searchParams.has('user_id') && !url.searchParams.get('select').startsWith('groups(')
            ? { user_id: mockUser.id }
            : [{ groups: state.group }],
      })
    }
    if (endpoint === 'group_activities') {
      // The votes cascade also exposes a second path to activities in PostgREST.
      if (!url.searchParams.get('select')?.includes('activities!group_activities_activity_id_fkey(')) {
        return route.fulfill({
          status: 300,
          json: {
            code: 'PGRST201',
            message: "Could not embed because more than one relationship was found for 'group_activities' and 'activities'",
          },
        })
      }
      return route.fulfill({
        json: [
          {
            activity_id: activityId,
            shared_by: memberId,
            activities: {
              id: activityId,
              name: 'Art workshop',
              price_per_person: 20,
              category: 'Arts and culture',
            },
          },
        ],
      })
    }
    if (endpoint === 'availability') return route.fulfill({ json: state.availability })
    return route.fulfill({ json: [] })
  })
  return state
}

const calls = (state, endpoint) => state.requests.filter((request) => request.endpoint === endpoint)
const slot = (page, time) => page.getByTestId('slot-2026-10-30T' + time)

test('live availability, membership and time changes refresh without erasing a pending selection', async ({ page }) => {
  const state = await mockGroups(page)
  const realtime = await mockRealtime(page)
  const topic = 'group-availability-' + groupId
  await page.addInitScript((id) => localStorage.setItem('avail-popup-seen-' + id, '1'), groupId)
  await page.goto(`/groups/${groupId}/availability`)
  await expect.poll(() => realtime.channels.has('realtime:' + topic)).toBe(true)
  state.holdSave = true
  await slot(page, '10:00').click()
  await expect.poll(() => !!state.releaseSave).toBe(true)
  state.availability.push({ user_id: memberId, slot_start: '2026-10-30T10:00:00+08:00' })
  realtime.emit(topic, 'availability', 'INSERT', { group_id: groupId, user_id: memberId })
  await expect(page.getByTestId('responded-list')).toContainText('Friend')
  await expect(page.getByTestId('responded-list').locator('li.done')).toHaveCount(1)
  await expect(slot(page, '10:00')).toHaveClass(/slot-free/)
  state.releaseSave()
  await expect(page.getByTestId('responded-list').locator('li.done')).toHaveCount(2)
  await page.getByTestId('mode-heatmap').click()
  await expect(slot(page, '10:00')).toHaveText('🎉')
  await slot(page, '11:00').click()
  Object.assign(state.group, {
    chosen_start: '2026-10-30T13:00:00+08:00', chosen_end: '2026-10-30T14:00:00+08:00',
  })
  realtime.emit(topic, 'groups', 'UPDATE', { id: groupId })
  await expect(page.getByTestId('chosen-slot')).toContainText('1:00pm')
  await expect(slot(page, '11:00')).toHaveClass(/slot-picked/)
  state.members = state.members.filter((member) => member.id !== memberId)
  state.availability = state.availability.filter((row) => row.user_id !== memberId)
  realtime.emit(topic, 'group_members', 'DELETE', { group_id: groupId, user_id: memberId })
  await expect(page.getByTestId('responded-list').locator('li')).toHaveCount(1)
  await page.getByTestId('back-to-groups').click()
  await expect.poll(() => realtime.left.includes('realtime:' + topic)).toBe(true)
})

test('a failed live refresh keeps local availability and offers a retry', async ({ page }) => {
  const state = await mockGroups(page)
  const realtime = await mockRealtime(page)
  const topic = 'group-availability-' + groupId
  await page.goto(`/groups/${groupId}/availability`)
  await expect.poll(() => realtime.channels.has('realtime:' + topic)).toBe(true)
  state.fail = 'replace_group_availability'
  await slot(page, '10:00').click()
  await expect(page.getByTestId('availability-save-error')).toBeVisible()
  state.fail = 'availability'
  realtime.emit(topic, 'availability', 'DELETE', { group_id: groupId, user_id: memberId })
  await expect(page.getByTestId('availability-refresh-error')).toBeVisible()
  await expect(slot(page, '10:00')).toHaveClass(/slot-free/)
  state.fail = ''
  await page.getByTestId('availability-refresh-error').getByRole('button').click()
  await expect(page.getByTestId('availability-refresh-error')).toHaveCount(0)
  await expect(slot(page, '10:00')).toHaveClass(/slot-free/)
})

test('a live date shrink removes hidden slots and preserves valid selections for the next save', async ({ page }) => {
  const state = await mockGroups(page)
  const realtime = await mockRealtime(page)
  const topic = 'group-availability-' + groupId
  await page.addInitScript((id) => localStorage.setItem('avail-popup-seen-' + id, '1'), groupId)
  state.availability = [
    { user_id: mockUser.id, slot_start: '2026-10-30T10:00:00+08:00' },
    { user_id: mockUser.id, slot_start: '2026-10-31T10:00:00+08:00' },
  ]
  await page.goto(`/groups/${groupId}/availability`)
  await expect.poll(() => realtime.channels.has('realtime:' + topic)).toBe(true)
  await expect(page.getByTestId('slot-2026-10-31T10:00')).toHaveClass(/slot-free/)
  state.fail = 'replace_group_availability'
  await slot(page, '11:00').click()
  await expect(page.getByTestId('availability-save-error')).toBeVisible()
  await page.getByTestId('mode-heatmap').click()
  await page.getByTestId('slot-2026-10-31T11:00').click()
  await expect(page.getByTestId('confirm-time')).toBeEnabled()
  state.group.end_date = '2026-10-30'
  realtime.emit(topic, 'groups', 'UPDATE', { id: groupId })
  await expect(page.getByTestId('slot-2026-10-31T10:00')).toHaveCount(0)
  await expect(page.getByTestId('confirm-time')).toBeDisabled()
  await page.getByTestId('mode-mine').click()
  await expect(slot(page, '10:00')).toHaveClass(/slot-free/)
  await expect(slot(page, '11:00')).toHaveClass(/slot-free/)
  state.fail = ''
  const saved = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/replace_group_availability') && response.request().method() === 'POST',
  )
  await slot(page, '12:00').click()
  expect((await saved).status()).toBe(204)
  await expect(page.getByTestId('availability-save-error')).toHaveCount(0)
  const latest = calls(state, 'replace_group_availability').at(-1).body.p_slots
  expect(latest).toEqual([
    '2026-10-30T10:00:00+08:00', '2026-10-30T11:00:00+08:00', '2026-10-30T12:00:00+08:00',
  ])
  await expect(page.getByTestId('availability-dates-notice')).toContainText('group dates changed')
})

async function fillCreate(page) {
  await page.goto('/groups')
  await page.getByTestId('create-group-button').click()
  await page.getByTestId('group-name-input').fill('New outing')
  await page.getByTestId('group-start-input').fill('2026-10-30')
  await page.getByTestId('group-end-input').fill('2026-10-31')
  await page.getByTestId('group-budget-input').fill('50')
}

test('group pages resolve activity relationships and load names without requesting other profile fields', async ({
  page,
}) => {
  const state = await mockGroups(page)
  await page.goto(`/groups/${groupId}/activities`)
  await expect(page.getByTestId('group-activities-tab')).toContainText('Shared by Friend')
  await page.getByTestId('members-button').click()
  await expect(page.getByTestId('members-panel')).toContainText('Friend')
  // Friend chose a cat; Demo User has no avatar in this mock, so keeps the initial.
  await expect(page.getByTestId('member-item').nth(1).getByTestId('member-avatar')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByTestId('member-item').first().getByTestId('member-avatar')).toHaveCount(0)
  await page.getByTestId('tab-availability').click()
  await expect(page.getByTestId('responded-list')).toContainText('Friend')
  expect(calls(state, 'get_group_member_names')).toHaveLength(3)
  expect(calls(state, 'profiles').every((request) => request.select === 'is_admin')).toBe(true)
})

test('creation uses one transaction and retry recovers the same group after a lost response', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.loseCreateResponse = true
  await fillCreate(page)
  await page.getByTestId('create-group-submit').click()
  await expect(page.getByTestId('create-group-error')).toBeVisible()
  const first = calls(state, 'create_group')[0].body
  await expect(page.getByTestId('group-name-input')).toHaveValue('New outing')
  await page.getByTestId('create-group-submit').click()
  await expect(page.getByTestId('invite-panel')).toContainText('New outing')
  expect(calls(state, 'create_group')).toHaveLength(2)
  expect(calls(state, 'create_group')[1].body.p_group_id).toBe(first.p_group_id)
  expect(first.p_invite_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  await expect(page.getByTestId('invite-qr')).toHaveAttribute(
    'data-invite-link',
    new RegExp(`/groups/${first.p_group_id}\\?invite=ABC234$`),
  )
  await expect(page.getByTestId('invite-code')).toHaveText('ABC234')
  expect(
    state.requests.filter(
      (request) =>
        request.method !== 'GET' && ['groups', 'group_members'].includes(request.endpoint),
    ),
  ).toHaveLength(0)
})

test('failed availability save keeps the selection for retry without changing the heatmap', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.fail = 'replace_group_availability'
  await page.goto(`/groups/${groupId}/availability`)
  await slot(page, '10:00').click()
  await expect(page.getByTestId('availability-save-error')).toBeVisible()
  await expect(slot(page, '10:00')).toHaveClass(/slot-free/)
  await page.getByTestId('mode-heatmap').click()
  await slot(page, '10:00').hover()
  await expect(page.getByTestId('slot-info')).toContainText('0 of 2 free')
  expect(state.availability).toHaveLength(0)
  state.fail = ''
  await page
    .getByTestId('availability-save-error')
    .getByRole('button', { name: 'Try again' })
    .click()
  await expect(page.getByTestId('availability-save-error')).toHaveCount(0)
  await expect(page.getByText('Saving...', { exact: true })).toHaveCount(0)
  await slot(page, '10:00').hover()
  await expect(page.getByTestId('slot-info')).toContainText('1 of 2 free')
  expect(calls(state, 'replace_group_availability')[1].body.p_slots).toEqual([
    '2026-10-30T10:00:00+08:00',
  ])
  expect(calls(state, 'replace_group_availability')[1].body.p_expected_user_id).toBe(mockUser.id)
})

test('availability queues later drags instead of running replacement writes together', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.holdSave = true
  await page.goto(`/groups/${groupId}/availability`)
  await slot(page, '10:00').click()
  await expect.poll(() => calls(state, 'replace_group_availability').length).toBe(1)
  await slot(page, '10:30').click()
  expect(calls(state, 'replace_group_availability')).toHaveLength(1)
  state.releaseSave()
  await expect.poll(() => calls(state, 'replace_group_availability').length).toBe(2)
  await expect(page.getByText('Saving...', { exact: true })).toHaveCount(0)
  expect(state.availability.map((row) => row.slot_start)).toEqual([
    '2026-10-30T10:00:00+08:00',
    '2026-10-30T10:30:00+08:00',
  ])
})

test('leaving availability cancels its pending save and drops queued selections before another group opens', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.holdSave = true
  await page.goto(`/groups/${groupId}/availability`)
  await slot(page, '10:00').click()
  await expect.poll(() => calls(state, 'replace_group_availability').length).toBe(1)
  await slot(page, '10:30').click()
  const cancelled = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().endsWith('/rpc/replace_group_availability'),
    timeout: 5000,
  })
  const otherGroupId = '77777777-7777-4777-8777-777777777777'
  state.group = { ...state.group, id: otherGroupId, name: 'Other group' }
  await page.getByTestId('back-to-groups').click()
  await cancelled
  await page.getByRole('link', { name: /Other group/ }).click()
  await page.getByTestId('tab-availability').click()
  await expect(slot(page, '10:00')).not.toHaveClass(/slot-free/)
  state.releaseSave()
  await slot(page, '11:00').click()
  await expect.poll(() => calls(state, 'replace_group_availability').length).toBe(2)
  await expect(page.getByText('Saving...', { exact: true })).toHaveCount(0)
  expect(calls(state, 'replace_group_availability').map((request) => request.body)).toEqual([
    {
      p_group_id: groupId,
      p_slots: ['2026-10-30T10:00:00+08:00'],
      p_expected_user_id: mockUser.id,
    },
    {
      p_group_id: otherGroupId,
      p_slots: ['2026-10-30T11:00:00+08:00'],
      p_expected_user_id: mockUser.id,
    },
  ])
})

test('clearing the last slot sends an empty replacement and excludes old out-of-range slots', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.availability = [
    { user_id: mockUser.id, slot_start: '2026-10-29T10:00:00+08:00' },
    { user_id: mockUser.id, slot_start: '2026-10-30T10:00:00+08:00' },
  ]
  await page.goto(`/groups/${groupId}/availability`)
  await expect(slot(page, '10:00')).toHaveClass(/slot-free/)
  await slot(page, '10:00').click()
  await expect.poll(() => calls(state, 'replace_group_availability').length).toBe(1)
  expect(calls(state, 'replace_group_availability')[0].body.p_slots).toEqual([])
  await expect(slot(page, '10:00')).not.toHaveClass(/slot-free/)
})

test('settings keep the draft on failure and clear the time and plan in one confirmed transaction', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.group.chosen_start = '2026-10-30T02:00:00Z'
  state.group.chosen_end = '2026-10-30T04:00:00Z'
  state.group.itineraries = [{ group_id: groupId }]
  await page.goto(`/groups/${groupId}/activities`)
  await page.getByTestId('settings-button').click()
  await page.getByTestId('settings-start-input').fill('2026-10-31')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByTestId('settings-save').click()
  expect(calls(state, 'update_group_settings')).toHaveLength(0)
  state.fail = 'update_group_settings'
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('settings-error')).toBeVisible()
  await expect(page.getByTestId('settings-start-input')).toHaveValue('2026-10-31')
  expect(state.group.chosen_start).toBe('2026-10-30T02:00:00Z')
  expect(state.group.itineraries).toHaveLength(1)
  state.fail = ''
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('group-settings-form')).toHaveCount(0)
  expect(state.group.chosen_start).toBeNull()
  expect(state.group.itineraries).toHaveLength(0)
  expect(calls(state, 'update_group_settings')[1].body.p_clear_chosen).toBe(true)
  expect(
    state.requests.some(
      (request) => request.endpoint === 'itineraries' && request.method === 'DELETE',
    ),
  ).toBe(false)
})

test('settings also confirm when only the chosen end falls outside the new dates', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.group.chosen_start = '2026-10-30T14:00:00Z'
  state.group.chosen_end = '2026-10-30T17:00:00Z'
  await page.goto(`/groups/${groupId}/activities`)
  await page.getByTestId('settings-button').click()
  await page.getByTestId('settings-end-input').fill('2026-10-30')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('settings-save').click()
  await expect(page.getByTestId('group-settings-form')).toHaveCount(0)
  expect(calls(state, 'update_group_settings')[0].body.p_clear_chosen).toBe(true)
})

test('invite-link preview joins through the checked function without direct membership writes', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.group.is_member = false
  await page.goto(`/groups/${groupId}?invite=ABC234`)
  await expect(page.getByTestId('group-join-screen')).toContainText('Weekend group')
  await expect(page.getByTestId('group-activities-tab')).toHaveCount(0)
  await page.getByTestId('join-this-group').click()
  await expect(page.getByTestId('group-activities-tab')).toBeVisible()
  expect(calls(state, 'wad2do_join_group')[0].body).toEqual({
    p_group_id: groupId,
    p_invite_code: 'ABC234',
  })
  await page.getByTestId('invite-button').click()
  await expect(page.getByTestId('invite-qr')).toHaveAttribute(
    'data-invite-link',
    new RegExp(`/groups/${groupId}\\?invite=ABC234$`),
  )
  expect(calls(state, 'group_members').filter((request) => request.method !== 'GET')).toHaveLength(
    0,
  )
})

test('a group URL without an invite code cannot join, and an invalid invite stays outside', async ({
  page,
}) => {
  const state = await mockGroups(page)
  state.group.is_member = false
  await page.goto(`/groups/${groupId}/activities`)
  await expect(page.getByTestId('group-join-screen')).toContainText('Ask a member for a new invite link')
  await expect(page.getByTestId('join-this-group')).toBeDisabled()
  expect(calls(state, 'wad2do_join_group')).toHaveLength(0)
  await page.goto(`/groups/${groupId}?invite=ZZZ999`)
  await page.getByTestId('join-this-group').click()
  await expect(page.getByTestId('group-join-screen')).toContainText('This invite link is invalid')
  expect(state.group.is_member).toBe(false)
  await expect(page.getByTestId('group-activities-tab')).toHaveCount(0)
})

test('joining by code handles a wrong code and opens the matching group without listing groups', async ({
  page,
}) => {
  const state = await mockGroups(page)
  await page.goto('/groups')
  await page.getByTestId('join-group-button').click()
  await page.getByTestId('join-code-input').fill('ZZZ999')
  await page.getByTestId('join-group-submit').click()
  await expect(page.getByTestId('join-group-error')).toHaveText('No group with that code.')
  await page.getByTestId('join-code-input').fill('abc234')
  await page.getByTestId('join-group-submit').click()
  await expect(page.getByTestId('group-header')).toContainText('Weekend group')
  expect(calls(state, 'wad2do_join_group')[1].body).toEqual({ p_invite_code: 'ABC234' })
  expect(calls(state, 'groups')).toHaveLength(0)
})
