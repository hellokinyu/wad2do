import { mockUser, signInMockUser } from './auth'

// Shared Supabase, OneMap and weather mocks for the itinerary specs
export const groupId = '44444444-4444-4444-8444-444444444444'
export const activityId = '55555555-5555-4555-8555-555555555555'
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const week = (entries) => ({
  ...Object.fromEntries(days.map((day) => [day, { closed: true }])),
  ...entries,
})

function googleHours(hours, today) {
  if (!hours || days.some((day) => !hours[day])) return {}
  const clock = (value) => {
    const [hour, minute] = value.split(':').map(Number)
    return { hour, minute }
  }
  const periods = []
  for (const [index, day] of days.entries()) {
    const entry = hours[day]
    if (entry.closed) continue
    const weekday = (index + 1) % 7
    const open = entry.open24h ? { hour: 0, minute: 0 } : clock(entry.open)
    const close = entry.open24h ? { hour: 0, minute: 0 } : clock(entry.close)
    const nextDay = entry.open24h || entry.close < entry.open
    periods.push({
      open: { day: weekday, ...open },
      close: { day: (weekday + Number(nextDay)) % 7, ...close },
    })
  }
  const base = Date.parse(today + 'T00:00:00Z')
  const datedPoint = (offset, point) => {
    const date = new Date(base + offset * 86400000)
    return {
      ...point,
      day: date.getUTCDay(),
      date: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
    }
  }
  const current = []
  for (let offset = -1; offset < 7; offset++) {
    const weekday = new Date(base + offset * 86400000).getUTCDay()
    for (const period of periods.filter((period) => period.open.day === weekday)) {
      const overnight = period.close.day !== weekday
      if (offset === -1 && !overnight) continue
      const open =
        offset < 0 ? datedPoint(0, { hour: 0, minute: 0 }) : datedPoint(offset, period.open)
      const close =
        offset === 6 && overnight
          ? { ...datedPoint(6, { hour: 23, minute: 59 }), truncated: true }
          : datedPoint(offset + Number(overnight), period.close)
      current.push({ open, close })
    }
  }
  return { regularOpeningHours: { periods }, currentOpeningHours: { periods: current } }
}

export async function mockItinerary(
  page,
  { hours, start = '2026-10-30T12:00:00Z', end = '2026-10-30T15:00:00Z', rainy = false, backend },
) {
  await signInMockUser(page)
  await page.clock.setFixedTime(new Date('2026-10-29T12:00:00+08:00'))
  const state = backend || {
    saved: null,
    writes: [],
    saveFailures: 0,
    voteFailures: 0,
    availability: [],
    timeSaveFailures: 0,
    holdTimeSave: false,
    releaseTimeSave: null,
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
  const group = state.group || {
    id: groupId,
    name: 'Weekend group',
    start_date: '2026-10-30',
    end_date: '2026-11-02',
    budget_per_person: 50,
    plan_revision: 0,
    chosen_start: start,
    chosen_end: end,
    group_members: [{ count: 1 }],
    is_member: true,
  }
  state.group = group
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    // Every activity ever voted for stays in the catalog, even after its votes are removed
    state.catalog ??= {}
    for (const vote of state.votes) {
      if (!('google_place_id' in vote.activities)) vote.activities.google_place_id = 'mock-place'
      state.catalog[vote.activity_id] = vote.activities
    }
    const table = new URL(request.url()).pathname.split('/').pop()
    if (table === 'profiles') return route.fulfill({ json: { is_admin: false } })
    if (table === 'groups') {
      if (request.method() === 'PATCH') {
        if (state.holdTimeSave) {
          state.holdTimeSave = false
          await new Promise((resolve) => {
            state.releaseTimeSave = resolve
          })
        }
        if (state.timeSaveFailures > 0) {
          state.timeSaveFailures--
          return route.fulfill({ status: 500, json: { message: 'Time save failed' } })
        }
        const update = request.postDataJSON()
        if (update.chosen_start !== group.chosen_start || update.chosen_end !== group.chosen_end) {
          state.saved = null
          group.plan_revision++
        }
        Object.assign(group, update)
      }
      return route.fulfill({ json: group })
    }
    if (table === 'wad2do_group_details') return route.fulfill({ json: group })
    if (table === 'group_members') return route.fulfill({ json: { user_id: mockUser.id } })
    if (table === 'get_group_member_names')
      return route.fulfill({
        json: state.members || [{ id: mockUser.id, display_name: 'Demo User' }],
      })
    if (table === 'availability') return route.fulfill({ json: state.availability || [] })
    if (table === 'replace_group_availability') {
      const body = request.postDataJSON()
      state.availability = (state.availability || [])
        .filter((row) => row.user_id !== mockUser.id)
        .concat(body.p_slots.map((slot_start) => ({ user_id: mockUser.id, slot_start })))
      return route.fulfill({ status: 204, body: '' })
    }
    if (table === 'votes') {
      if (state.voteFailures > 0) {
        state.voteFailures--
        return route.fulfill({ status: 500, json: { message: 'Votes unavailable' } })
      }
      return route.fulfill({ json: state.votes })
    }
    if (table === 'save_group_itinerary') {
      const body = request.postDataJSON()
      const plan = {
        group_id: body.p_group_id,
        stops: body.p_stops,
        total_cost: body.p_stops.reduce((total, stop) => total + stop.cost, 0),
        updated_by: body.p_expected_user_id,
      }
      if (body.p_expected_revision !== group.plan_revision)
        return route.fulfill({ status: 409, json: { code: 'PT409', message: 'Plan changed' } })
      state.writes.push(plan)
      if (state.saveFailures > 0) {
        state.saveFailures--
        return route.fulfill({ status: 500, json: { message: 'Save failed' } })
      }
      state.saved = plan
      group.plan_revision++
      return route.fulfill({ json: group.plan_revision })
    }
    if (table === 'activities') {
      const ids = new URL(request.url()).searchParams.get('id')?.match(/[\w-]{36}/g) || []
      return route.fulfill({
        json: ids.filter((id) => state.catalog[id]).map((id) => ({ id, ...state.catalog[id] })),
      })
    }
    if (table === 'itineraries') {
      if (request.method() !== 'GET')
        return route.fulfill({ status: 403, json: { message: 'Use the checked save function' } })
      return route.fulfill({ json: state.saved })
    }
    return route.fulfill({ json: [] })
  })
  state.hoursLookups ??= []
  await page.route('**/functions/v1/google-place-details', async (route) => {
    const { activityId } = route.request().postDataJSON()
    state.hoursLookups.push(activityId)
    const today = await page.evaluate(() =>
      new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
    )
    return route.fulfill({
      json:
        state.googleDetails?.[activityId] ??
        googleHours(state.catalog[activityId]?.opening_hours, today),
    })
  })
  await page.route('**/functions/v1/onemap-route', (route) =>
    route.fulfill({
      json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 30 }] },
    }),
  )
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
