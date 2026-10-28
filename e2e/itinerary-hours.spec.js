import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

test.use({ timezoneId: 'America/Los_Angeles' })
const groupId = '44444444-4444-4444-8444-444444444444'
const activityId = '55555555-5555-4555-8555-555555555555'
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const week = (entries) => ({
  ...Object.fromEntries(days.map((day) => [day, { closed: true }])),
  ...entries,
})

async function mockItinerary(
  page,
  { hours, start = '2026-10-30T12:00:00Z', end = '2026-10-30T15:00:00Z', rainy = false },
) {
  await signInMockUser(page)
  const state = {
    saved: null,
    writes: [],
    votes: [
      {
        activity_id: activityId,
        value: 1,
        activities: {
          name: 'Night activity',
          indoor: !rainy,
          price_per_person: 10,
          duration_min: 60,
          opening_hours: hours,
        },
      },
    ],
  }
  const group = {
    id: groupId,
    name: 'Weekend group',
    start_date: '2026-10-30',
    end_date: '2026-11-02',
    budget_per_person: 50,
    chosen_start: start,
    chosen_end: end,
    group_members: [{ count: 1 }],
  }
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const table = new URL(request.url()).pathname.split('/').pop()
    if (table === 'profiles') return route.fulfill({ json: { is_admin: false } })
    if (table === 'groups') return route.fulfill({ json: group })
    if (table === 'group_members') return route.fulfill({ json: { user_id: mockUser.id } })
    if (table === 'votes') return route.fulfill({ json: state.votes })
    if (table === 'itineraries') {
      if (request.method() === 'POST') {
        state.saved = request.postDataJSON()
        state.writes.push(state.saved)
        return route.fulfill({ status: 201, body: '' })
      }
      return route.fulfill({ json: state.saved })
    }
    return route.fulfill({ json: [] })
  })
  await page.route('https://api-open.data.gov.sg/**', (route) =>
    route.fulfill({
      json: {
        data: {
          records: [
            {
              forecasts: rainy
                ? [
                    {
                      timestamp: '2026-10-30T00:00:00+08:00',
                      day: 'Friday',
                      forecast: { text: 'Showers', summary: 'Showers' },
                      temperature: { low: 25, high: 30 },
                    },
                  ]
                : [],
            },
          ],
        },
      },
    }),
  )
  return state
}

test('Plan accepts a Friday evening visit ending before an overnight closing time', async ({
  page,
}) => {
  await mockItinerary(page, { hours: week({ Fri: { open: '20:00', close: '02:00' } }) })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
})

test('Plan excludes a visit before opening even when its end is before closing', async ({
  page,
}) => {
  await mockItinerary(page, {
    hours: week({ Fri: { open: '10:00', close: '18:00' } }),
    start: '2026-10-30T01:00:00Z',
    end: '2026-10-30T04:00:00Z',
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-plan')).toBeVisible()
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(0)
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Night activity')
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-start-time').fill('09:00')
  await page.getByTestId('itinerary-start-time').blur()
  await page.getByTestId('itinerary-add-stop').click()
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveText('Opens at 10:00')
  await page.getByTestId('itinerary-start-time').fill('17:30')
  await page.getByTestId('itinerary-start-time').blur()
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveText('Closes at 18:00')
})

test('Saturday early morning uses Friday overnight hours even when Saturday is closed', async ({
  page,
}) => {
  await mockItinerary(page, {
    hours: week({ Fri: { open: '20:00', close: '02:00' } }),
    start: '2026-10-30T17:00:00Z',
    end: '2026-10-30T19:00:00Z',
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toContainText('01:00–02:00')
  await expect(page.getByTestId('itinerary-summary')).toContainText('2026-10-31')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
})

test('edited and reloaded plans use the same hours checks as initial planning', async ({
  page,
}) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open: '20:00', close: '02:00' } }),
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-start-time').fill('19:00')
  await page.getByTestId('itinerary-start-time').blur()
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveText('Opens at 20:00')
  await page.getByTestId('itinerary-discard').click()
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-start-time').fill('21:00')
  await page.getByTestId('itinerary-start-time').blur()
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.writes).toHaveLength(1)
  expect(state.saved.stops[0]).toMatchObject({ start: '21:00', end: '22:00' })
  expect(state.saved.stops[0]).not.toHaveProperty('opening_hours')
  await page.reload()
  await expect(page.getByTestId('itinerary-stop')).toContainText('21:00–22:00')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
})

test('rain alternatives and swaps check the replacement venue hours', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open: '20:00', close: '02:00' } }),
    rainy: true,
  })
  state.votes.push({
    activity_id: '66666666-6666-4666-8666-666666666666',
    value: 1,
    activities: {
      name: 'Indoor venue',
      indoor: true,
      price_per_person: 10,
      duration_min: 60,
      opening_hours: week({ Fri: { open: '22:00', close: '02:00' } }),
    },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-rainy-toggle').check()
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveText('Opens at 22:00')
  await page.getByTestId('itinerary-swap').click()
  await expect(page.getByTestId('itinerary-stop')).toContainText('Indoor venue')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveText('Opens at 22:00')
  await page.getByTestId('itinerary-start-time').fill('22:00')
  await page.getByTestId('itinerary-start-time').blur()
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
})
