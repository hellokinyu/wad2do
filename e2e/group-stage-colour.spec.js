import { test, expect } from '@playwright/test'
import { signInMockUser } from './helpers/auth'

const groupId = '44444444-4444-4444-8444-444444444444'
const plannedGroup = {
  id: groupId,
  name: 'CCA farewell',
  start_date: '2026-11-14',
  end_date: '2026-11-16',
  budget_per_person: 40,
  chosen_start: '2026-11-15T02:00:00+00:00',
  chosen_end: '2026-11-15T06:00:00+00:00',
  group_members: [{ count: 2 }],
}

// The real wad2do_group_details function doesn't return itineraries, so the group page has to
// look the plan up itself. Otherwise a planned group is green on its Groups card but amber
// ("Time picked") in the group page hero.
test('a planned group has the same stage colour on its card and in the group page hero', async ({
  page,
}) => {
  await signInMockUser(page)
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop()
    if (endpoint === 'profiles') return route.fulfill({ json: { is_admin: false } })
    if (endpoint === 'group_members')
      return route.fulfill({
        json: [{ groups: { ...plannedGroup, itineraries: [{ group_id: groupId }] } }],
      })
    if (endpoint === 'itineraries') return route.fulfill({ json: [{ group_id: groupId }] })
    if (endpoint === 'wad2do_group_details')
      return route.fulfill({ json: { ...plannedGroup, invite_code: 'ABC234', is_member: true } })
    return route.fulfill({ json: [] })
  })

  await page.goto('/groups')
  const card = page.getByTestId('group-card')
  const cardColour = await card.evaluate((el) => el.style.getPropertyValue('--stage'))
  await card.click()

  const hero = page.getByTestId('group-header')
  await expect(hero).toBeVisible()
  expect(await hero.evaluate((el) => el.style.getPropertyValue('--stage'))).toBe(cardColour)
  // Every step is ticked once the group has a plan
  await expect(page.getByTestId('tab-itinerary')).toContainText('(done)')
})
