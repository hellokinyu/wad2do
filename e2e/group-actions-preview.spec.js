import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

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
          json: [
            { id: mockUser.id, display_name: 'Demo User' },
            { id: memberId, display_name: 'Friend' },
          ],
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


for (const width of [1280, 375]) {
  test(`group action visual preview at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const state = await mockGroups(page)
    await page.goto('/groups')
    await expect(page.getByTestId('group-card')).toBeVisible()
    await expect(page.getByTestId('create-group-button')).toHaveAccessibleName('Create')
    await expect(page.getByTestId('join-group-button')).toHaveAccessibleName('Join')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath('group-actions.png'), fullPage: true })
    await page.getByTestId('create-group-button').click()
    await expect(page.getByTestId('create-group-form')).toBeVisible()
    await page.getByTestId('join-group-button').click()
    await expect(page.getByTestId('join-group-form')).toBeVisible()
    await expect(page.getByTestId('create-group-form')).toHaveCount(0)
    expect(state.requests.filter((request) => request.method !== 'GET')).toHaveLength(0)
  })
}
