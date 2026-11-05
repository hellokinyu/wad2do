import { test, expect } from '@playwright/test'
import { activityId, groupId, mockItinerary, week } from './helpers/itinerary'

const secondId = '77777777-7777-4777-8777-777777777777'
const hours = week({ Fri: { open24h: true } })
const tokenExpired = 'OneMap token expired, update ONEMAP_TOKEN in .env'

function addSecondVote(state, extra = {}) {
  state.votes.push({
    ...state.votes[0],
    activity_id: secondId,
    activities: { ...state.votes[0].activities, name: 'Second activity', ...extra },
  })
}

async function mockExpiredToken(page) {
  await page.route('**/functions/v1/onemap-route', (route) =>
    route.fulfill({ status: 503, json: { error: tokenExpired } }),
  )
}

test.describe('OneMap token expired', () => {
  test('a new plan can be retried without saving unverified stops', async ({ page }) => {
    const state = await mockItinerary(page, { hours })
    addSecondVote(state)
    await mockExpiredToken(page)
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect(page.getByTestId('itinerary-error')).toBeVisible()
    const stops = page.getByTestId('itinerary-stop')
    await expect(stops).toHaveCount(0)
    expect(state.writes).toHaveLength(0)
    await page.route('**/functions/v1/onemap-route', (route) =>
      route.fulfill({
        json: { options: [{ mode: 'TRANSIT', available: true, durationMinutes: 30 }] },
      }),
    )
    await page.getByTestId('itinerary-retry').click()
    await expect(stops).toHaveCount(2)
    expect(state.writes).toHaveLength(1)
  })

  test('a saved plan shows an error and still shows its stops', async ({ page }) => {
    const state = await mockItinerary(page, { hours })
    addSecondVote(state)
    state.saved = {
      total_cost: 20,
      stops: [
        { activity_id: activityId, start: '20:00', end: '21:00', cost: 10, reason: 'Saved' },
        { activity_id: secondId, start: '21:30', end: '22:30', cost: 10, reason: 'Saved' },
      ],
    }
    await mockExpiredToken(page)
    await page.goto(`/groups/${groupId}/itinerary`)
    await expect(page.getByTestId('itinerary-travel-failed')).toBeVisible()
    await expect(page.getByTestId('itinerary-stop')).toHaveCount(2)
    await expect(page.getByTestId('itinerary-stop').first()).toContainText('8:00 pm – 9:00 pm')
    expect(state.writes).toHaveLength(0)
  })
})

test.describe('Google lookup failures', () => {
  for (const [status, code] of [[429, 'user_limit'], [503, 'unavailable']]) {
    test(`a ${code} response explains the empty plan without guessing a retry time`, async ({ page }) => {
      const state = await mockItinerary(page, { hours })
      addSecondVote(state)
      await page.route('**/functions/v1/google-place-details', (route) =>
        route.fulfill({ status, json: { error: code } }),
      )
      await page.goto(`/groups/${groupId}/itinerary`)
      const empty = page.getByTestId('itinerary-no-fit')
      await expect(empty).toContainText("We couldn't check opening hours")
      await expect(empty).toContainText('2 voted activities')
      await expect(empty).toContainText('choose Edit, then Re-plan to retry')
      await expect(empty).not.toContainText(/\bhour\b|\blimit\b/i)
      await expect(page.getByTestId('itinerary-not-in-plan')).toContainText(
        'Opening hours unavailable.',
      )
      expect(state.writes).toHaveLength(0)
    })
  }
})

test.describe('weather request problems', () => {
  // An outdoor stop with an indoor activity left over, so a rainy-day swap could be offered
  async function mockPlanWithIndoorOption(page) {
    const state = await mockItinerary(page, { hours, rainy: true })
    addSecondVote(state, { name: 'Indoor activity', price_per_person: 60, indoor: true })
    return state
  }

  for (const [name, fail] of [
    ['returns an error', (route) => route.fulfill({ status: 500, json: {} })],
    ['cannot connect', (route) => route.abort()],
  ]) {
    test(`the indoor preview remains available when the weather request ${name}`, async ({
      page,
    }) => {
      await mockPlanWithIndoorOption(page)
      await page.route('https://api-open.data.gov.sg/**', fail)
      await page.goto(`/groups/${groupId}/itinerary`)
      await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
      await expect(page.getByTestId('itinerary-weather-unavailable')).toBeVisible()
      await page.getByTestId('itinerary-rainy-toggle').check()
      await expect(page.getByTestId('itinerary-stop')).toContainText('Indoor activity')
    })
  }

  test('a plan still renders without rainy-day swaps when the weather request hangs', async ({
    page,
  }) => {
    await mockPlanWithIndoorOption(page)
    await page.route('https://api-open.data.gov.sg/**', () => {}) // never answered
    const weatherRequest = page.waitForRequest('https://api-open.data.gov.sg/**')
    await page.goto(`/groups/${groupId}/itinerary`)
    await weatherRequest
    await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
    await expect(page.getByTestId('itinerary-weather-loading')).toBeVisible()
    await expect(page.getByTestId('itinerary-rainy-toggle')).toHaveCount(0)
  })
})
