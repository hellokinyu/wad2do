import { test, expect } from '@playwright/test'
import { activityId, groupId, mockItinerary, week } from './helpers/itinerary'

test.use({ timezoneId: 'America/Los_Angeles' })
const secondId = '77777777-7777-4777-8777-777777777777'
const thirdId = '88888888-8888-4888-8888-888888888888'

// Adds more voted activities that are open all day, like the first one
function addVotes(state, entries) {
  for (const [id, name, extra = {}] of entries) {
    state.votes.push({
      ...state.votes[0], activity_id: id,
      activities: { ...state.votes[0].activities, name, ...extra },
    })
  }
}

// Every journey can be made by public transport (30 min) or on foot (60 min)
async function mockTransitAndWalk(page) {
  await page.route('**/functions/v1/onemap-route', (route) =>
    route.fulfill({
      json: {
        options: [
          { mode: 'TRANSIT', available: true, durationMinutes: 30 },
          { mode: 'WALK', available: true, durationMinutes: 60 },
        ],
      },
    }),
  )
}

test('Discard after Re-plan brings back the saved plan, not the edits', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  addVotes(state, [[secondId, 'Second activity']])
  await page.goto(`/groups/${groupId}/itinerary`)
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(2)
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-remove').first().click()
  await expect(stops).toHaveCount(1)
  await page.getByTestId('itinerary-start-time').fill('21:00')
  await page.getByTestId('itinerary-start-time').blur()
  await expect(stops.first()).toContainText('21:00–22:00')
  await page.getByTestId('itinerary-replan').click()
  await expect(stops).toHaveCount(2)
  await page.getByTestId('itinerary-discard').click()
  await expect(stops).toHaveCount(2)
  await expect(stops.first()).toContainText('Night activity')
  await expect(stops.first()).toContainText('20:00–21:00')
  await expect(stops.nth(1)).toContainText('21:30–22:30')
  await expect(page.getByTestId('itinerary-start-time')).toHaveValue('20:00')
  expect(state.writes).toHaveLength(1)
})

test('a chosen travel mode moves the later stops and is kept after saving', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
    start: '2026-10-30T02:00:00Z',
    end: '2026-10-30T10:00:00Z', // free 10:00–18:00
  })
  addVotes(state, [[secondId, 'Second activity']])
  await mockTransitAndWalk(page)
  await page.goto(`/groups/${groupId}/itinerary`)
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops.nth(1)).toContainText('11:30–12:30')
  // Not editing: the tabs only show the times
  await page.getByTestId('travel-tab-walk').click()
  await expect(stops.nth(1)).toContainText('11:30–12:30')
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('travel-tab-walk').click()
  await expect(page.getByTestId('travel-tab-walk')).toHaveAttribute('aria-pressed', 'true')
  await expect(stops.nth(1)).toContainText('12:00–13:00')
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops[0]).toMatchObject({ travel_mode: 'WALK' })
  expect(state.saved.stops[1]).toMatchObject({ start: '12:00', end: '13:00' })
  await page.reload()
  await expect(stops.nth(1)).toContainText('12:00–13:00')
  await expect(page.getByTestId('travel-tab-walk')).toHaveAttribute('aria-pressed', 'true')
})

test('a chosen travel mode is forgotten when the next stop changes', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours: week({ Fri: { open24h: true } }),
    start: '2026-10-30T02:00:00Z',
    end: '2026-10-30T10:00:00Z', // free 10:00–18:00
  })
  addVotes(state, [[secondId, 'Second activity'], [thirdId, 'Third activity']])
  await mockTransitAndWalk(page)
  await page.goto(`/groups/${groupId}/itinerary`)
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(3)
  await page.getByTestId('itinerary-edit').click()
  // Walk from the first stop to the second
  await page.getByTestId('travel-tab-walk').first().click()
  await expect(stops.nth(2)).toContainText('13:30–14:30')
  // Without the second stop, the first one leads to the third: a new journey
  await page.getByTestId('itinerary-remove').nth(1).click()
  await expect(stops).toHaveCount(2)
  await expect(stops.nth(1)).toContainText('Third activity')
  await expect(stops.nth(1)).toContainText('11:30–12:30')
  await expect(page.getByTestId('travel-tab-walk')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops[0]).toMatchObject({ activity_id: activityId, travel_mode: null })
  expect(state.saved.stops[1]).toMatchObject({ activity_id: thirdId, start: '11:30' })
})

test('removing and adding stops moves the times and the "Also voted for" list', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  addVotes(state, [[secondId, 'Second activity']])
  await page.goto(`/groups/${groupId}/itinerary`)
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(2)
  await expect(page.getByTestId('itinerary-not-in-plan')).toHaveCount(0)
  await page.getByTestId('itinerary-edit').click()
  await expect(page.getByTestId('itinerary-move-up').first()).toBeDisabled()
  await expect(page.getByTestId('itinerary-move-down').last()).toBeDisabled()
  await page.getByTestId('itinerary-remove').first().click()
  await expect(stops).toHaveCount(1)
  await expect(stops.first()).toContainText('Second activity')
  await expect(stops.first()).toContainText('20:00–21:00')
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Night activity')
  await page.getByTestId('itinerary-add-stop').click()
  await expect(stops).toHaveCount(2)
  await expect(stops.nth(1)).toContainText('Night activity')
  await expect(stops.nth(1)).toContainText('21:30–22:30')
  await expect(page.getByTestId('itinerary-not-in-plan')).toHaveCount(0)
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops.map((stop) => stop.activity_id)).toEqual([secondId, activityId])
  expect(state.saved.stops[1]).toMatchObject({ start: '21:30', end: '22:30' })
})

test('an activity left out for budget can be added anyway and shows as over budget', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  addVotes(state, [[secondId, 'Pricey activity', { price_per_person: 60 }]])
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
  await expect(page.getByTestId('itinerary-cost')).toContainText('$10 of $50')
  await expect(page.getByTestId('itinerary-over-budget')).toHaveCount(0)
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Pricey activity ($60)')
  await expect(page.getByTestId('itinerary-not-in-plan')).toContainText('Over budget by $20')
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-add-stop').click()
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  await expect(page.getByTestId('itinerary-cost')).toContainText('$70 of $50')
  await expect(page.getByTestId('itinerary-over-budget')).toBeVisible()
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.total_cost).toBe(70)
})

test('stop names open the activity details, but not while editing', async ({ page }) => {
  await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  await page.goto(`/groups/${groupId}/itinerary`)
  const link = page.getByTestId('itinerary-stop-link')
  await expect(link).toHaveAttribute('href', `/activities/${activityId}`)
  await page.getByTestId('itinerary-edit').click()
  await expect(link).toHaveCount(0)
  await expect(page.getByTestId('itinerary-stop')).toContainText('Night activity')
  await page.getByTestId('itinerary-discard').click()
  await link.click()
  await expect(page).toHaveURL(`/activities/${activityId}`)
})

test('a saved stop the group has since voted down is left out of the plan', async ({ page }) => {
  const state = await mockItinerary(page, { hours: week({ Fri: { open24h: true } }) })
  addVotes(state, [[secondId, 'Second activity']])
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
  state.votes[0].value = -1
  await page.reload()
  const stops = page.getByTestId('itinerary-stop')
  await expect(stops).toHaveCount(1)
  await expect(stops).toContainText('Second activity')
  await expect(page.getByTestId('itinerary-not-in-plan')).toHaveCount(0)
})
