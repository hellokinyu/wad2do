import { test, expect } from '@playwright/test'
import { groupId, mockItinerary, week } from './helpers/itinerary'

const hours = week({ Fri: { open24h: true } })

test('an empty itinerary starts at the confirmed time and cannot save past its end', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours, start: '2026-10-30T14:00:00+08:00', end: '2026-10-30T14:30:00+08:00',
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-no-fit')).toBeVisible()
  await page.getByTestId('itinerary-edit').click()
  await expect(page.getByTestId('itinerary-start-time')).toHaveValue('14:00')
  await page.getByTestId('itinerary-add-stop').click()
  await expect(page.getByTestId('itinerary-stop')).toContainText('14:00–15:00')
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-save-error')).toContainText('14:00–14:30')
  expect(state.writes).toHaveLength(0)
  await page.getByTestId('itinerary-end-time').fill('14:30')
  await page.getByTestId('itinerary-end-time').blur()
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-edit')).toBeVisible()
  expect(state.saved.stops[0]).toMatchObject({ start: '14:00', end: '14:30' })
})

test('adding a stop cannot save a checked journey beyond the confirmed group time', async ({ page }) => {
  const state = await mockItinerary(page, {
    hours, start: '2026-10-30T20:00:00+08:00', end: '2026-10-30T21:00:00+08:00',
  })
  state.votes.push({
    ...state.votes[0], activity_id: '77777777-7777-4777-8777-777777777777',
    activities: { ...state.votes[0].activities, name: 'Extra activity' },
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
  await page.getByTestId('itinerary-edit').click()
  await page.getByTestId('itinerary-add-stop').click()
  await expect(page.getByTestId('itinerary-stop').last()).toContainText('21:30–22:30')
  await expect(page.getByTestId('itinerary-save')).toBeEnabled()
  await page.getByTestId('itinerary-save').click()
  await expect(page.getByTestId('itinerary-save-error')).toContainText('20:00–21:00')
  expect(state.writes).toHaveLength(1)
  expect(state.saved.stops).toHaveLength(1)
})

for (const table of ['groups', 'votes', 'itineraries', 'activities']) {
  test(`a stalled ${table} read times out and can be retried`, async ({ page }) => {
    const state = await mockItinerary(page, { hours })
    state.saved = {
      group_id: groupId, total_cost: 10,
      stops: [{ activity_id: state.votes[0].activity_id, start: '20:00', end: '21:00', cost: 10 }],
    }
    await page.clock.install()
    let releaseRead
    let held = false
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const itineraryRead = table !== 'itineraries' || url.searchParams.get('select') === 'stops,total_cost'
      if (url.pathname.endsWith('/' + table) && request.method() === 'GET' && itineraryRead && !held) {
        held = true
        await new Promise((resolve) => { releaseRead = resolve })
      }
      return route.fallback()
    })
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect.poll(() => !!releaseRead).toBe(true)
    await page.clock.fastForward(30001)
    await expect(page.getByTestId('itinerary-error')).toContainText("Couldn't load the plan")
    await expect(page.getByTestId('itinerary-loading')).toHaveCount(0)
    expect(state.writes).toHaveLength(0)
    releaseRead()
    await page.getByTestId('itinerary-retry').click()
    await expect(page.getByTestId('itinerary-stop')).toContainText('20:00–21:00')
    expect(state.writes).toHaveLength(0)
  })
}

test('leaving during an itinerary read ignores its late response', async ({ page }) => {
  const state = await mockItinerary(page, { hours })
  let releaseRead
  await page.route('**/rest/v1/votes?**', async (route) => {
    await new Promise((resolve) => { releaseRead = resolve })
    return route.fallback()
  })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect.poll(() => !!releaseRead).toBe(true)
  await page.getByTestId('tab-activities').click()
  await expect(page).toHaveURL(`/groups/${groupId}/activities`)
  releaseRead()
  await expect(page.getByTestId('group-activities-tab')).toBeVisible()
  expect(state.writes).toHaveLength(0)
})
