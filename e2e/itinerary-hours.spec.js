import { test, expect } from '@playwright/test'
import { mockUser } from './helpers/auth'
import { activityId, groupId, mockItinerary, week } from './helpers/itinerary'

test.use({ timezoneId: 'America/Los_Angeles' })

for (const [label, hours] of [
  ['missing', null],
  ['empty', {}],
  ['incomplete', { Fri: { open24h: true } }],
]) {
  test(`unavailable ${label} hours are skipped automatically and flagged on a saved plan`, async ({ page }) => {
    const state = await mockItinerary(page, { hours })
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Opening hours unavailable.')
    expect(state.writes).toHaveLength(0)
    state.saved = { stops: [{ activity_id: activityId, start: '20:00', end: '21:00', cost: 10, reason: 'Saved before hours were checked' }], total_cost: 10 }
    await page.reload()
    await expect(page.getByTestId('itinerary-stop-warning')).toHaveText('Opening hours unavailable.')
    expect(state.writes).toHaveLength(0)
  })
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
    end: '2026-10-30T11:00:00Z', // free 09:00–19:00, so both edits below are allowed
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
  // 19:00 is before the group's free time (20:00–23:00), so the start stays put
  await page.getByTestId('itinerary-start-time').fill('19:00')
  await page.getByTestId('itinerary-start-time').blur()
  await expect(page.getByTestId('itinerary-time-error')).toContainText('20:00–23:00')
  await expect(page.getByTestId('itinerary-start-time')).toHaveValue('20:00')
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  await page.getByTestId('itinerary-discard').click()
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-start-time').fill('21:00')
  await page.getByTestId('itinerary-start-time').blur()
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.writes).toHaveLength(2)
  expect(state.saved.stops[0]).toMatchObject({ start: '21:00', end: '22:00' })
  expect(state.saved.stops[0]).not.toHaveProperty('opening_hours')
  await page.reload()
  await expect(page.getByTestId('itinerary-stop')).toContainText('21:00–22:00')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
})

test('editing the end time changes the last stop and saves it', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open: '20:00', close: '02:00' } }),
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await page.getByTestId('itinerary-edit').click()
  const end = page.getByTestId('itinerary-end-time')
  await expect(end).toHaveValue('21:00')
  await end.fill('19:30') // before the last stop starts: not allowed
  await end.blur()
  await expect(end).toHaveValue('21:00')
  await end.fill('23:30') // after the group's free time ends at 23:00
  await end.blur()
  await expect(page.getByTestId('itinerary-time-error')).toContainText('20:00–23:00')
  await expect(end).toHaveValue('21:00')
  await end.fill('22:30')
  await end.blur()
  await expect(page.getByTestId('itinerary-time-error')).toHaveCount(0)
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–22:30')
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  await expect(end).toHaveValue('22:30')
  expect(state.saved.stops[0]).toMatchObject({ start: '20:00', end: '22:30' })
})

test('an earlier end time shortens or drops the stops that no longer fit', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(2)
  await expect(stops.nth(1)).toContainText('21:30–22:30')
  await page.getByTestId('itinerary-edit').click()
  const end = page.getByTestId('itinerary-end-time')
  // Keeps half of the second stop, so it's cut short
  await end.fill('22:00')
  await end.blur()
  await expect(stops).toHaveCount(2)
  await expect(stops.nth(1)).toContainText('21:30–22:00')
  // Would keep only 10 of its 30 minutes, so it's removed
  await end.fill('21:40')
  await end.blur()
  await expect(stops).toHaveCount(1)
  await expect(end).toHaveValue('21:00')
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Second activity')
  // Not even half of the first stop fits
  await end.fill('20:20')
  await end.blur()
  await expect(page.getByTestId('itinerary-time-error')).toContainText('too early')
  await expect(stops).toHaveCount(1)
  await expect(end).toHaveValue('21:00')
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops).toHaveLength(1)
  expect(state.saved.stops[0]).toMatchObject({ start: '20:00', end: '21:00' })
})

test('a later start fits the plan into the free time instead of refusing', async ({ page }) => {
  // Free 12:00–20:00; five one-hour stops 30 minutes apart fill it until 19:00
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
    start: '2026-10-30T04:00:00Z',
    end: '2026-10-30T12:00:00Z',
  })
  for (let i = 2; i <= 5; i++) {
    state.votes.push({
      ...state.votes[0], activity_id: `77777777-7777-4777-8777-77777777777${i}`,
      activities: { ...state.votes[0].activities, name: `Activity ${i}` },
    })
  }
  await page.goto(`/groups/${groupId}/itinerary`)
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(5)
  await page.getByTestId('itinerary-edit').click()
  const start = page.getByTestId('itinerary-start-time')
  // The last stop keeps half its time, so it's cut short at 20:00
  await start.fill('13:30')
  await start.press('Enter')
  await expect(stops).toHaveCount(5)
  await expect(stops.first()).toContainText('13:30–14:30')
  await expect(stops.last()).toContainText('19:30–20:00')
  // Now the last stop would start at 20:00, so it's taken out
  await start.fill('14:00')
  await start.blur()
  await expect(stops).toHaveCount(4)
  await expect(stops.last()).toContainText('18:30–19:30')
  await expect(page.getByTestId('itinerary-time-note')).toContainText('1 stop')
  await expect(page.getByTestId('itinerary-time-error')).toHaveCount(0)
  // Before the free time starts is still refused
  await start.fill('11:00')
  await start.blur()
  await expect(page.getByTestId('itinerary-time-error')).toContainText('12:00–20:00')
  await expect(start).toHaveValue('14:00')
  await expect(stops).toHaveCount(4)
})

for (const [field, value, firstRange, lastRange] of [
  ['start', '14:00', '14:00–15:00', '18:30–19:30'],
  ['end', '17:00', '12:00–13:00', '16:30–17:00'],
]) {
  test(`an uncommitted ${field} time survives a weather refresh and retimes on blur`, async ({ page }) => {
    const state = await mockItinerary(page, {
      hours: week({ Fri: { open24h: true } }),
      start: '2026-10-30T04:00:00Z',
      end: '2026-10-30T12:00:00Z',
    })
    for (let i = 2; i <= 5; i++) {
      state.votes.push({
        ...state.votes[0], activity_id: `77777777-7777-4777-8777-77777777777${i}`,
        activities: { ...state.votes[0].activities, name: `Activity ${i}` },
      })
    }
    let release
    const ready = new Promise((resolve) => { release = resolve })
    await page.route('https://api-open.data.gov.sg/**', async (route) => {
      await ready
      await route.fulfill({ json: { data: { records: [{ forecasts: [] }] } } })
    })
    await page.clock.setFixedTime(new Date('2026-10-29T12:00:00+08:00'))
    await page.goto(`/groups/${groupId}/itinerary`)
    await page.getByTestId('itinerary-edit').click()
    const input = page.getByTestId(`itinerary-${field}-time`)
    await input.fill(value)
    release()
    await expect(page.getByTestId('itinerary-weather-unavailable')).toBeVisible()
    await expect(input).toHaveValue(value)
    await input.blur()
    const stops = page.getByTestId('itinerary-stop')
    await expect(stops).toHaveCount(4)
    await expect(stops.first()).toContainText(firstRange)
    await expect(stops.last()).toContainText(lastRange)
    await page.getByTestId('itinerary-save').click()
    await expect(page.getByTestId('itinerary-edit')).toBeVisible()
    await page.reload()
    await expect(stops).toHaveCount(4)
    await expect(stops.first()).toContainText(firstRange)
    await expect(stops.last()).toContainText(lastRange)
  })
}

for (const [stateName, interact, draft, stopCount, savedEnd] of [
  ['edited', (input) => input.fill('14:30'), '14:30', 1, '13:30'],
  ['unchanged focused', (input) => input.focus(), '15:30', 2, '15:30'],
]) {
  test(`a late travel calculation keeps an ${stateName} end-time field correct`, async ({ page }) => {
    const state = await mockItinerary(page, {
      hours: week({ Fri: { open24h: true } }),
      start: '2026-10-30T04:00:00Z',
      end: '2026-10-30T12:00:00Z',
    })
    state.votes.push({
      ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
      activities: { ...state.votes[0].activities, name: 'Second activity' },
    })
    await page.goto(`/groups/${groupId}/itinerary`)
    await page.getByTestId('itinerary-edit').click()
    let release
    const ready = new Promise((resolve) => { release = resolve })
    await page.route('**/functions/v1/onemap-route', async (route) => {
      await ready
      await route.fulfill({ json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 60 }] } })
    })
    const request = page.waitForRequest('**/functions/v1/onemap-route')
    await page.getByTestId('itinerary-start-time').fill('12:30')
    await page.getByTestId('itinerary-start-time').blur()
    await request
    const end = page.getByTestId('itinerary-end-time')
    await interact(end)
    release()
    await expect(page.getByTestId('itinerary-save')).toBeEnabled()
    await expect(page.getByTestId('itinerary-stop').last()).toContainText('14:30–15:30')
    await expect(end).toHaveValue(draft)
    await end.blur()
    await expect(page.getByTestId('itinerary-stop')).toHaveCount(stopCount)
    await expect(end).toHaveValue(savedEnd)
    await page.getByTestId('itinerary-save').click()
    await expect(page.getByTestId('itinerary-edit')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('itinerary-stop')).toHaveCount(stopCount)
    await expect(end).toHaveValue(savedEnd)
  })
}

test('a generated plan is saved automatically and reopening it does not save again', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
  })
  state.votes.push({
    ...state.votes[0],
    activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  expect(state.writes).toHaveLength(1)
  expect(state.saved).toMatchObject({ group_id: groupId, total_cost: 20, updated_by: mockUser.id })
  expect(state.saved.stops.map(({ start, end }) => ({ start, end }))).toEqual([
    { start: '20:00', end: '21:00' },
    { start: '21:30', end: '22:30' },
  ])
  await page.reload()
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  expect(state.writes).toHaveLength(1)
})

test('generation waits for travel estimates and saves the times shown to members', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes.push({
    ...state.votes[0],
    activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  let releaseTravel
  const travelReady = new Promise((resolve) => { releaseTravel = resolve })
  await page.route('**/functions/v1/onemap-route', async (route) => {
    await travelReady
    await route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 15 }] },
    })
  })
  const travelRequest = page.waitForRequest('**/functions/v1/onemap-route')
  await page.goto(`/groups/${groupId}/itinerary`)
  await travelRequest
  await expect(page.getByTestId('itinerary-plan')).toHaveCount(0)
  expect(state.writes).toHaveLength(0)
  releaseTravel()
  await expect(page.getByTestId('itinerary-stop').nth(1)).toContainText('21:15–22:15')
  expect(state.writes).toHaveLength(1)
  expect(state.saved.stops[1]).toMatchObject({ start: '21:15', end: '22:15' })
})

test('Plan excludes a stop when real travel would exceed the chosen end time', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
    start: '2026-10-30T02:00:00Z',
    end: '2026-10-30T04:30:00Z',
  })
  state.votes.push({
    ...state.votes[0],
    activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.route('**/functions/v1/onemap-route', (route) =>
    route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 90 }] },
    }),
  )

  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
  await expect(page.getByTestId('itinerary-stop')).toContainText('10:00–11:00')
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Second activity')
  expect(state.saved.stops).toHaveLength(1)
  expect(state.saved.stops[0]).toMatchObject({ activity_id: activityId, end: '11:00' })
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-replan').click()
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
  await expect(page.getByTestId('itinerary-stop')).toContainText('10:00–11:00')
  await expect(page.getByTestId('itinerary-replan')).toBeFocused()
  expect(state.writes).toHaveLength(1)
})

test('Plan uses actual departures and fits shorter journeys up to the exact end time', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
    start: '2026-10-30T02:00:00Z',
    end: '2026-10-30T04:00:00Z',
  })
  state.votes[0].activities.duration_min = 30
  for (const [id, name] of [
    ['77777777-7777-4777-8777-777777777777', 'Second activity'],
    ['88888888-8888-4888-8888-888888888888', 'Third activity'],
  ]) {
    state.votes.push({
      ...state.votes[0],
      activity_id: id,
      activities: { ...state.votes[0].activities, name },
    })
  }
  const departures = []
  await page.route('**/functions/v1/onemap-route', (route) => {
    departures.push(route.request().postDataJSON().departure)
    return route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 15 }] },
    })
  })

  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(3)
  await expect(page.getByTestId('itinerary-stop').nth(2)).toContainText('11:30–12:00')
  expect(departures).toEqual(['2026-10-30T10:30', '2026-10-30T11:15'])
  expect(state.saved.stops[2]).toMatchObject({ start: '11:30', end: '12:00' })
})

test('Plan checks hours after travel and tries the next candidate from the last accepted stop', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
    start: '2026-10-30T02:00:00Z',
    end: '2026-10-30T06:00:00Z',
  })
  for (const [id, name, hours] of [
    [
      '77777777-7777-4777-8777-777777777777',
      'Closes early',
      week({ Fri: { open: '09:00', close: '12:30' } }),
    ],
    [
      '88888888-8888-4888-8888-888888888888',
      'Fits instead',
      week({ Fri: { open24h: true } }),
    ],
  ]) {
    state.votes.push({
      ...state.votes[0],
      activity_id: id,
      activities: { ...state.votes[0].activities, name, opening_hours: hours },
    })
  }
  const journeys = []
  await page.route('**/functions/v1/onemap-route', (route) => {
    const journey = route.request().postDataJSON()
    journeys.push(journey)
    return route.fulfill({
      json: {
        options: [{
          mode: 'TRANSIT',
          available: true,
          durationMinutes: journey.end.name === 'Closes early' ? 90 : 15,
        }],
      },
    })
  })

  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  await expect(page.getByTestId('itinerary-stop').nth(1)).toContainText('Fits instead')
  await expect(page.getByTestId('itinerary-stop').nth(1)).toContainText('11:15–12:15')
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Closes early')
  expect(journeys.map(({ start, end, departure }) => [start.name, end.name, departure])).toEqual([
    ['Night activity', 'Closes early', '2026-10-30T11:00'],
    ['Night activity', 'Fits instead', '2026-10-30T11:00'],
  ])
  expect(state.saved.stops.map((stop) => stop.activity_id)).toEqual([
    activityId,
    '88888888-8888-4888-8888-888888888888',
  ])
})

async function pickNewTimeAndPlan(page) {
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('mode-heatmap').click()
  await page.getByTestId('slot-2026-10-31T10:00').click()
  await page.getByTestId('slot-2026-10-31T11:30').click()
  await page.getByTestId('confirm-time').click()
  await expect(page).toHaveURL(/\/itinerary/)
}

for (const failure of ['request', 'no routes']) {
  test(`failed travel (${failure}) after a time change leaves the old plan invalidated and can be retried`, async ({ page }) => {
    const state = await mockItinerary(page, {
      hours: week({ Fri: { open24h: true }, Sat: { open24h: true } }),
    })
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect(page.getByTestId('itinerary-stop')).toBeVisible()
    state.votes.push({
      ...state.votes[0],
      activity_id: '77777777-7777-4777-8777-777777777777',
      activities: { ...state.votes[0].activities, name: 'Second activity' },
    })
    let attempts = 0
    await page.route('**/functions/v1/onemap-route', (route) => {
      attempts++
      if (attempts === 1) {
        return route.fulfill(failure === 'request'
          ? { status: 503, json: { error: 'unavailable' } }
          : { json: { options: [] } })
      }
      return route.fulfill({
        json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 15 }] },
      })
    })

    await pickNewTimeAndPlan(page)
    await expect(page.getByTestId('itinerary-error')).toContainText("Couldn't load the plan")
    expect(state.saved).toBeNull()
    expect(state.writes).toHaveLength(1)
    await page.getByTestId('itinerary-retry').click()
    await expect(page.getByTestId('itinerary-stop')).toContainText('10:00–11:00')
    expect(attempts).toBe(2)
    expect(state.writes).toHaveLength(2)
    expect(state.saved.stops).toHaveLength(1)
  })
}

test('confirm and build replaces the saved plan using the latest chosen time and votes', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true }, Sat: { open24h: true } }),
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  state.votes[0].activity_id = '88888888-8888-4888-8888-888888888888'
  state.votes[0].activities.name = 'New group choice'
  await pickNewTimeAndPlan(page)
  await expect(page.getByTestId('itinerary-summary')).toContainText('2026-10-31')
  await expect(page.getByTestId('itinerary-stop')).toContainText('New group choice')
  await expect(page.getByTestId('itinerary-stop')).toContainText('10:00–11:00')
  await expect(page).toHaveURL(`/groups/${groupId}/itinerary`)
  expect(state.writes).toHaveLength(2)
  expect(state.saved.stops[0]).toMatchObject({
    activity_id: '88888888-8888-4888-8888-888888888888', start: '10:00', end: '11:00',
  })
  await page.reload()
  await expect(page.getByTestId('itinerary-stop')).toContainText('10:00–11:00')
  expect(state.writes).toHaveLength(2)
})

for (const [failure, message] of [
  ['save', "Couldn't save the plan"],
  ['vote', "Couldn't load the plan"],
]) {
  test(`a failed ${failure} request retries the new time without restoring the old plan`, async ({ page }) => {
    const state = await mockItinerary(page, {
      hours: week({ Fri: { open24h: true }, Sat: { open24h: true } }),
    })
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect(page.getByTestId('itinerary-stop')).toBeVisible()
    state[failure + 'Failures'] = 1
    await pickNewTimeAndPlan(page)
    await expect(page.getByTestId('itinerary-error')).toContainText(message)
    await expect(page.getByTestId('itinerary-plan')).toHaveCount(0)
    expect(state.saved).toBeNull()
    await page.getByTestId('itinerary-retry').click()
    await expect(page.getByTestId('itinerary-stop')).toContainText('10:00–11:00')
    await expect(page).toHaveURL(`/groups/${groupId}/itinerary`)
    expect(state.saved.stops[0]).toMatchObject({ start: '10:00', end: '11:00' })
  })
}

test('a failed first save shows an error and retry persists the generated plan', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.saveFailures = 1
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-error')).toContainText("Couldn't save the plan")
  expect(state.saved).toBeNull()
  await page.getByTestId('itinerary-retry').click()
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  expect(state.writes).toHaveLength(2)
  expect(state.saved.stops[0]).toMatchObject({ start: '20:00', end: '21:00' })
})

test('a plan for today shows the 24-hour forecast', async ({ page }) => {
  await mockItinerary(page, { hours: week({ Fri: { open: '20:00', close: '02:00' } }) })
  await page.clock.setFixedTime(new Date('2026-10-30T14:00:00+08:00'))
  await page.route('**/twenty-four-hr-forecast', (route) =>
    route.fulfill({
      json: {
        data: {
          records: [
            {
              general: {
                validPeriod: {
                  start: '2026-10-30T12:00:00+08:00',
                  end: '2026-10-31T12:00:00+08:00',
                },
                temperature: { low: 25, high: 35 },
                forecast: { code: 'HT', text: 'Heavy Thundery Showers' },
              },
            },
          ],
        },
      },
    }),
  )
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-weather')).toHaveText(
    'Friday: Heavy Thundery Showers, 25–35°C',
  )
})

test('a plan for a past day says the day has passed instead of offering a forecast', async ({
  page,
}) => {
  await mockItinerary(page, { hours: week({ Fri: { open: '20:00', close: '02:00' } }) })
  await page.clock.setFixedTime(new Date('2026-10-31T00:30:00+08:00'))
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-weather-past')).toHaveText(
    "This day has passed, so there's no forecast.",
  )
  await expect(page.getByTestId('itinerary-weather-unavailable')).toHaveCount(0)
})

test('a future plan with no forecast yet says to check back', async ({ page }) => {
  await mockItinerary(page, { hours: week({ Fri: { open: '20:00', close: '02:00' } }) })
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+08:00'))
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-weather-unavailable')).toBeVisible()
  await expect(page.getByTestId('itinerary-weather-past')).toHaveCount(0)
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
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00+08:00'))
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

test('Save waits for edited travel times and reopening preserves the saved schedule', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  await page.getByTestId('itinerary-edit').click()
  let release
  const ready = new Promise((resolve) => { release = resolve })
  await page.route('**/functions/v1/onemap-route', async (route) => {
    await ready
    await route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 60 }] },
    })
  })
  const request = page.waitForRequest('**/functions/v1/onemap-route')
  await page.getByTestId('itinerary-move-down').first().click()
  await request
  await expect(page.getByTestId('itinerary-save')).toBeDisabled()
  expect(state.writes).toHaveLength(1)
  release()
  await expect(page.getByTestId('itinerary-save')).toBeEnabled()
  await expect(page.getByTestId('itinerary-stop').nth(1)).toContainText('22:00–23:00')
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops[1]).toMatchObject({ start: '22:00', end: '23:00' })
  await page.reload()
  await expect(page.getByTestId('itinerary-stop').nth(1)).toContainText('22:00–23:00')
  expect(state.writes).toHaveLength(2)
})

test('Discard ignores a late travel response and restores the saved start time', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await page.getByTestId('itinerary-edit').click()
  let release
  const ready = new Promise((resolve) => { release = resolve })
  await page.route('**/functions/v1/onemap-route', async (route) => {
    await ready
    await route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 90 }] },
    })
  })
  const request = page.waitForRequest('**/functions/v1/onemap-route')
  const response = page.waitForResponse('**/functions/v1/onemap-route')
  await page.getByTestId('itinerary-start-time').fill('20:30')
  await page.getByTestId('itinerary-start-time').blur()
  await request
  await page.getByTestId('itinerary-discard').click()
  await expect(page.getByTestId('itinerary-stop').first()).toContainText('20:00–21:00')
  release()
  await (await response).finished()
  await expect(page.getByTestId('itinerary-stop').nth(1)).toContainText('21:30–22:30')
  await page.getByTestId('itinerary-edit').click()
  await expect(page.getByTestId('itinerary-save')).toBeEnabled()
  expect(state.writes).toHaveLength(1)
})

test('Discard after completed travel allows editing and saving again', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-start-time').fill('20:30')
  await page.getByTestId('itinerary-start-time').blur()
  await expect(page.getByTestId('itinerary-save')).toBeEnabled()
  await expect(page.getByTestId('itinerary-stop').first()).toContainText('20:30–21:30')
  await page.getByTestId('itinerary-discard').click()
  await page.getByTestId('itinerary-edit').click()
  await expect(page.getByTestId('itinerary-start-time')).toHaveValue('20:00')
  await expect(page.getByTestId('itinerary-save')).toBeEnabled()
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops[0]).toMatchObject({ start: '20:00', end: '21:00' })
})

test('a reorder sends only the final journey to the routing service', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await page.getByTestId('itinerary-edit').click()
  const journeys = []
  await page.route('**/functions/v1/onemap-route', (route) => {
    journeys.push(route.request().postDataJSON())
    return route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 30 }] },
    })
  })
  await page.getByTestId('itinerary-move-down').first().click()
  await expect(page.getByTestId('itinerary-stop').first()).toContainText('Second activity')
  await expect(page.getByTestId('itinerary-save')).toBeEnabled()
  expect(journeys.map(({ start, end }) => [start.name, end.name])).toEqual([
    ['Second activity', 'Night activity'],
  ])
})

test('a stale editor keeps its draft and must explicitly load the latest plan', async ({ page, context }) => {
  const hours = week({ Fri: { open24h: true } })
  const state = await mockItinerary(page, { hours })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  const other = await context.newPage()
  await mockItinerary(other, { hours, backend: state })
  await other.goto(`/groups/${groupId}/itinerary`)
  await expect(other.getByTestId('itinerary-stop')).toHaveCount(2)
  await other.getByTestId('itinerary-edit').click()
  await other.getByTestId('itinerary-start-time').fill('20:30')
  await other.getByTestId('itinerary-start-time').blur()
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-remove').last().click()
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  const latest = structuredClone(state.saved)
  await expect(other.getByTestId('itinerary-save')).toBeEnabled()
  await other.getByTestId('itinerary-save').click()
  await expect(other.getByTestId('itinerary-save-error')).toContainText('Your edits are still here')
  await expect(other.getByTestId('itinerary-save')).toBeDisabled()
  await expect(other.getByTestId('itinerary-stop')).toHaveCount(2)
  await expect(other.getByTestId('itinerary-start-time')).toHaveValue('20:30')
  expect(state.saved).toEqual(latest)
  other.once('dialog', (dialog) => dialog.accept())
  await other.getByTestId('itinerary-load-latest').click()
  await expect(other.getByTestId('itinerary-stop')).toHaveCount(1)
  await expect(other.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  await expect(other.getByTestId('itinerary-edit')).toBeVisible()
})

test('confirming a new time invalidates the old plan before opening the Itinerary tab', async ({ page }) => {
  await mockItinerary(page, {
    hours: week({ Fri: { open24h: true }, Sat: { open24h: true } }),
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  await page.getByTestId('tab-availability').click()
  await page.getByTestId('mode-heatmap').click()
  await page.getByTestId('slot-2026-10-31T15:00').click()
  await page.getByTestId('slot-2026-10-31T16:30').click()
  await page.getByTestId('confirm-time').click()
  await expect(page.getByTestId('itinerary-summary')).toContainText('2026-10-31')
  await expect(page.getByTestId('itinerary-stop')).toContainText('15:00–16:00')
})

test('a saved stop keeps its details after every vote for it is removed', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open: '20:00', close: '02:00' } }) })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toContainText('Night activity')
  state.votes = []
  await page.reload()
  await expect(page.getByTestId('itinerary-stop')).toContainText('Night activity')
  await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
  await expect(page.getByTestId('itinerary-stop-warning')).toHaveCount(0)
})

for (const failure of ['request', 'no routes']) {
  test(`failed travel (${failure}) while editing blocks Save until Retry succeeds`, async ({ page }) => {
    const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
    state.votes.push({
      ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
      activities: { ...state.votes[0].activities, name: 'Second activity' },
    })
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
    await page.getByTestId('itinerary-edit').click()
    let fail = true
    await page.route('**/functions/v1/onemap-route', (route) => {
      if (fail) {
        return route.fulfill(failure === 'request'
          ? { status: 503, json: { error: 'unavailable' } }
          : { json: { options: [] } })
      }
      return route.fulfill({
        json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 45 }] },
      })
    })
    await page.getByTestId('itinerary-move-down').first().click()
    await expect(page.getByTestId('itinerary-travel-failed')).toBeVisible()
    await expect(page.getByTestId('itinerary-save')).toBeDisabled()
    await expect(page.getByTestId('itinerary-stop').first()).toContainText('Second activity')
    expect(state.writes).toHaveLength(1)
    fail = false
    await page.getByTestId('itinerary-travel-retry').click()
    await expect(page.getByTestId('itinerary-travel-failed')).toHaveCount(0)
    await expect(page.getByTestId('itinerary-stop').nth(1)).toContainText('21:45–22:45')
    await page.getByTestId('itinerary-save').click()
    await expect(page.getByTestId('itinerary-edit')).toBeVisible()
    expect(state.saved.stops[1]).toMatchObject({ start: '21:45', end: '22:45' })
  })
}

test('an indoor swap uses the replacement duration and moves the later stops', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
    rainy: true,
    start: '2026-10-30T02:00:00Z',
    end: '2026-10-30T10:00:00Z', // free 10:00–18:00
  })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Second activity' },
  })
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00+08:00'))
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  // Voted for after the plan was made, so it's only a rainy-day option
  state.votes.push({
    activity_id: '66666666-6666-4666-8666-666666666666',
    value: 1,
    activities: {
      name: 'Long indoor venue', indoor: true, price_per_person: 10, duration_min: 180,
      opening_hours: week({ Fri: { open: '10:00', close: '12:30' } }),
    },
  })
  await page.reload()
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-rainy-toggle').first().check()
  await expect(page.getByTestId('itinerary-stop').first()).toContainText('10:00–13:00')
  await page.getByTestId('itinerary-swap').click()
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops.first()).toContainText('Long indoor venue')
  await expect(stops.first()).toContainText('10:00–13:00')
  await expect(stops.first().getByTestId('itinerary-stop-warning')).toHaveText('Closes at 12:30')
  await expect(stops.nth(1)).toContainText('13:30–14:30')
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops[0]).toMatchObject({ start: '10:00', end: '13:00' })
  expect(state.saved.stops[1]).toMatchObject({ start: '13:30', end: '14:30' })
})
