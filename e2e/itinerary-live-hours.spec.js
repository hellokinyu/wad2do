import { test, expect } from '@playwright/test'
import { activityId, groupId, mockItinerary, week } from './helpers/itinerary'
import { authStorageKey } from './helpers/auth'

const secondId = '66666666-6666-4666-8666-666666666666'
const thirdId = '77777777-7777-4777-8777-777777777777'
function fridayHours(close = 22) {
  const openPoint = { day: 5, hour: 0, minute: 0 }
  const closePoint = { day: 5, hour: close, minute: 0 }
  const date = { year: 2026, month: 10, day: 30 }
  return {
    currentOpeningHours: {
      periods: [{ open: { ...openPoint, date }, close: { ...closePoint, date } }],
    },
    regularOpeningHours: { periods: [{ open: openPoint, close: closePoint }] },
  }
}

test('live hours override empty saved hours, check arrival plus duration, and fetch once per candidate', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours: {} })
  for (const [id, name] of [
    [secondId, 'Closes at ten'],
    [thirdId, 'Later option'],
  ]) {
    state.votes.push({
      ...state.votes[0],
      activity_id: id,
      activities: { ...state.votes[0].activities, name },
    })
  }
  state.googleDetails = {
    [activityId]: fridayHours(23),
    [secondId]: fridayHours(22),
    [thirdId]: fridayHours(23),
  }
  await page.route('**/functions/v1/onemap-route', (route) =>
    route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 27 }] },
    }),
  )
  await page.goto(`/groups/${groupId}/itinerary`)
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(2)
  await expect(stops.nth(1)).toContainText('Later option')
  await expect(stops.nth(1)).toContainText('9:27 pm – 10:27 pm')
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Closes at 22:00')
  expect(state.hoursLookups).toEqual([activityId, secondId, thirdId])
  expect(state.saved.stops.map((stop) => stop.activity_id)).toEqual([activityId, thirdId])
  expect(Object.keys(state.saved.stops[0]).sort()).toEqual([
    'activity_id',
    'cost',
    'end',
    'reason',
    'start',
    'travel_mode',
  ])
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-add-stop').click()
  await expect(stops).toHaveCount(3)
  expect(state.hoursLookups).toHaveLength(3)
})

test('reopening fetches fresh hours and adds warnings without changing or saving the schedule', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours: {} })
  state.googleDetails = { [activityId]: fridayHours(23) }
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-saved-status')).toBeVisible()
  const saved = structuredClone(state.saved)
  state.googleDetails[activityId] = {
    ...fridayHours(20),
    attributions: [{ provider: 'Venue hours provider', providerUri: 'https://example.com/hours' }],
  }
  await page.reload()
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveText('Closes at 20:00')
  await expect(page.getByTestId('itinerary-stop')).toContainText('8:00 pm – 9:00 pm')
  await expect(page.getByRole('link', { name: 'Venue hours provider' })).toHaveAttribute(
    'href',
    'https://example.com/hours',
  )
  expect(state.writes).toHaveLength(1)
  expect(state.saved).toEqual(saved)
  expect(state.hoursLookups).toEqual([activityId, activityId])
})

test('route ordering rejects a faster order that violates live Google hours', async ({ page }) => {
  const state = await mockItinerary(page, { hours: {} })
  state.votes.push({
    ...state.votes[0],
    activity_id: secondId,
    activities: { ...state.votes[0].activities, name: 'Late opener' },
  })
  const lateHours = fridayHours(23)
  lateHours.currentOpeningHours.periods[0].open.hour = 21
  lateHours.regularOpeningHours.periods[0].open.hour = 21
  state.googleDetails = { [activityId]: fridayHours(23), [secondId]: lateHours }
  await page.route('**/functions/v1/onemap-route', (route) =>
    route.fulfill({
      json: {
        options: [
          {
            mode: 'TRANSIT',
            available: true,
            durationMinutes: route.request().postDataJSON().start.name === 'Late opener' ? 1 : 30,
          },
        ],
      },
    }),
  )
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-saved-status')).toBeVisible()
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(2)
  await expect(stops.first()).toContainText('Night activity')
  await expect(stops.nth(1)).toContainText('9:30 pm – 10:30 pm')
  expect(state.saved.stops.map((stop) => stop.activity_id)).toEqual([activityId, secondId])
  expect(state.hoursLookups).toEqual([activityId, secondId])
})

test('failed Re-plan refreshes hours for retained stops it did not reach without rewriting the saved plan', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes[0].activities.duration_min = 30
  for (const [id, name] of [
    [secondId, 'Second stop'],
    [thirdId, 'Third stop'],
  ]) {
    state.votes.push({
      ...state.votes[0],
      activity_id: id,
      activities: { ...state.votes[0].activities, name },
    })
  }
  // Different saved durations keep Re-plan's first route out of the OneMap cache.
  state.saved = {
    total_cost: 30,
    stops: [
      {
        activity_id: activityId,
        start: '20:00',
        end: '20:20',
        cost: 10,
        reason: 'Previously saved',
      },
      { activity_id: secondId, start: '20:50', end: '21:10', cost: 10, reason: 'Previously saved' },
      { activity_id: thirdId, start: '21:40', end: '22:00', cost: 10, reason: 'Previously saved' },
    ],
  }
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-saved-status')).toBeVisible()
  const saved = structuredClone(state.saved)
  expect(state.hoursLookups).toEqual([activityId, secondId, thirdId])
  state.googleDetails = { [thirdId]: fridayHours(21) }
  await page.route('**/functions/v1/onemap-route', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  )
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-replan').click()
  await expect(page.getByTestId('itinerary-save-error')).toContainText("Couldn't rebuild the plan")
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(3)
  await expect(stops.nth(2)).toContainText('9:40 pm – 10:00 pm')
  await expect(stops.nth(2).getByTestId('itinerary-stop-warning')).toHaveText('Closes at 21:00')
  expect(state.hoursLookups).toEqual([activityId, secondId, thirdId, activityId, secondId, thirdId])
  expect(state.writes).toHaveLength(0)
  expect(state.saved).toEqual(saved)
})

for (const code of ['user_limit', 'app_limit', 'lookup_disabled', 'unavailable']) {
  test(`a ${code} response skips automatic candidates and preserves an existing saved plan`, async ({
    page,
  }) => {
    const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
    await page.route('**/functions/v1/google-place-details', (route) =>
      route.fulfill({ status: 429, json: { error: code } }),
    )
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect(page.getByTestId('itinerary-not-in-plan')).toContainText(
      'Opening hours unavailable.',
    )
    expect(state.writes).toHaveLength(0)
    state.saved = {
      stops: [
        {
          activity_id: activityId,
          start: '20:00',
          end: '21:00',
          cost: 10,
          reason: 'Previously saved',
        },
      ],
      total_cost: 10,
    }
    await page.reload()
    await expect(page.getByTestId('itinerary-stop-warning')).toHaveText(
      'Opening hours unavailable.',
    )
    expect(state.writes).toHaveLength(0)
  })
}

test('an activity without a Place ID is skipped even with saved hours', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes[0].activities.google_place_id = null
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText(
    'Opening hours unavailable.',
  )
  expect(state.hoursLookups).toEqual([])
  expect(state.writes).toEqual([])
})

test('date-specific closure wins over regular hours and later plans carry a provisional note', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours: {} })
  state.googleDetails = { [activityId]: { ...fridayHours(), currentOpeningHours: { periods: [] } } }
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Closed on this day')
  state.group.chosen_start = '2026-11-13T12:00:00Z'
  state.group.chosen_end = '2026-11-13T15:00:00Z'
  await page.reload()
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
  await expect(page.getByTestId('itinerary-usual-hours')).toHaveText(
    'Based on usual opening hours; holiday hours may differ.',
  )
})

test('a stalled lookup has a fifteen-second deadline and Re-plan retries with fresh hours', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours: {} })
  await page.clock.install({ time: new Date('2026-10-29T12:00:00+08:00') })
  let requested = false
  await page.route('**/functions/v1/google-place-details', async () => {
    requested = true
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect.poll(() => requested).toBe(true)
  await page.clock.fastForward(15001)
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText(
    'Opening hours unavailable.',
  )
  expect(state.writes).toEqual([])
  await page.unroute('**/functions/v1/google-place-details')
  await page.route('**/functions/v1/google-place-details', (route) =>
    route.fulfill({ json: fridayHours() }),
  )
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-replan').click()
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
})

for (const [action, leave, destination] of [
  [
    'leave',
    async (page) => {
      await page.getByTestId('tab-activities').click()
    },
    `/groups/${groupId}/activities`,
  ],
  [
    'sign out',
    async (page) => {
      await page.evaluate((key) => {
        localStorage.removeItem(key)
        const channel = new BroadcastChannel(key)
        channel.postMessage({ event: 'SIGNED_OUT', session: null })
        channel.close()
      }, authStorageKey())
    },
    '/login',
  ],
]) {
  test(`${action} during a Google lookup ignores the late result and never saves`, async ({
    page,
  }) => {
    const state = await mockItinerary(page, { hours: {} })
    let release
    let completed = false
    await page.route('**/functions/v1/google-place-details', async (route) => {
      await new Promise((resolve) => {
        release = resolve
      })
      await route.fulfill({ json: fridayHours() })
      completed = true
    })
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect.poll(() => !!release).toBe(true)
    await leave(page)
    await expect(page).toHaveURL(destination)
    release()
    await expect.poll(() => completed).toBe(true)
    expect(state.writes).toEqual([])
    await expect(page.getByTestId('itinerary-stop')).toHaveCount(0)
  })
}
