import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

const groupId = '44444444-4444-4444-8444-444444444444'
const friendId = '66666666-6666-4666-8666-666666666666'
const samId = '77777777-7777-4777-8777-777777777777'
const art = 'aaaaaaaa-0000-4000-8000-000000000001'
const bowling = 'aaaaaaaa-0000-4000-8000-000000000002'
const cafe = 'aaaaaaaa-0000-4000-8000-000000000003'

const group = {
  id: groupId,
  name: 'Weekend group',
  start_date: '2026-10-30',
  end_date: '2026-10-31',
  budget_per_person: 50,
  invite_code: 'ABC234',
  group_members: [{ count: 3 }],
  is_member: true,
}

function shared(id, name, sharedBy, price) {
  return {
    activity_id: id,
    shared_by: sharedBy,
    activities: { id, name, image_url: null, price_per_person: price, category: 'Leisure' },
  }
}

// Starting ranking: Art workshop (+2), Bowling night (+1), Cafe hop (+1)
async function mockBackend(page, { activities } = {}) {
  await signInMockUser(page)
  const state = {
    shared: activities ?? [
      shared(art, 'Art workshop', friendId, 20),
      shared(bowling, 'Bowling night', mockUser.id, 15),
      shared(cafe, 'Cafe hop', friendId, 0),
    ],
    votes: [
      { activity_id: art, user_id: friendId, value: 1 },
      { activity_id: art, user_id: samId, value: 1 },
      { activity_id: bowling, user_id: friendId, value: 1 },
      { activity_id: cafe, user_id: friendId, value: 1 },
    ],
    writes: [],
    failNextVote: false,
  }

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const endpoint = url.pathname.split('/').pop()
    const method = request.method()
    const eq = (name) => url.searchParams.get(name)?.replace('eq.', '')

    if (endpoint === 'profiles') return route.fulfill({ json: { is_admin: false } })
    if (endpoint === 'wad2do_group_details') return route.fulfill({ json: group })
    if (endpoint === 'get_group_member_names') {
      return route.fulfill({
        json: [
          { id: mockUser.id, display_name: 'Demo User' },
          { id: friendId, display_name: 'Friend' },
          { id: samId, display_name: 'Sam' },
        ],
      })
    }

    if (endpoint === 'group_activities') {
      if (method === 'GET') return route.fulfill({ json: state.shared })
      state.writes.push({ endpoint, method, activity_id: eq('activity_id') })
      state.shared = state.shared.filter((row) => row.activity_id !== eq('activity_id'))
      return route.fulfill({ status: 204, body: '' })
    }

    if (endpoint === 'votes') {
      if (method === 'GET') return route.fulfill({ json: state.votes })
      const body = request.postDataJSON()
      state.writes.push({ endpoint, method, activity_id: eq('activity_id'), body })
      if (state.failNextVote) {
        state.failNextVote = false
        return route.fulfill({ status: 500, json: { message: 'Simulated failure' } })
      }

      if (method === 'POST') {
        state.votes.push(
          ...[]
            .concat(body)
            .map(({ activity_id, user_id, value }) => ({ activity_id, user_id, value })),
        )
        return route.fulfill({ status: 201, body: '' })
      }
      const isMine = (v) =>
        v.activity_id === eq('activity_id') && (!eq('user_id') || v.user_id === eq('user_id'))
      if (method === 'PATCH') {
        for (const v of state.votes) if (isMine(v)) v.value = body.value
      } else if (method === 'DELETE') {
        state.votes = state.votes.filter((v) => !isMine(v))
      }
      return route.fulfill({ status: 204, body: '' })
    }

    return route.fulfill({ json: [] })
  })
  return state
}

const names = (page) => page.getByTestId('shared-activity-name')
const card = (page, name) => page.getByTestId('shared-activity').filter({ hasText: name })
const voteWrites = (state) => state.writes.filter((write) => write.endpoint === 'votes')

test('votes keep the list still until the user taps Update rankings', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto(`/groups/${groupId}/activities`)

  await expect(names(page)).toHaveText(['Art workshop', 'Bowling night', 'Cafe hop'])
  await expect(page.getByTestId('activity-rank')).toHaveText(['1', '2', '3'])
  await expect(page.getByTestId('apply-ranking')).toHaveCount(0)

  // Cafe hop now ties first place, but it stays where it is and shows it would move up 1
  const cafe = card(page, 'Cafe hop')
  await cafe.getByTestId('upvote-button').click()
  await expect(cafe.getByTestId('keen-count')).toHaveText('2')
  await expect(cafe.getByTestId('upvote-button')).toHaveAttribute('aria-pressed', 'true')
  await expect(cafe.getByTestId('rank-move')).toContainText('1')
  await expect(page.getByTestId('apply-ranking')).toHaveText('Update rankings')

  // A second vote moves it further, and the hint shows the total
  await card(page, 'Art workshop').getByTestId('downvote-button').click()
  await expect(card(page, 'Art workshop').getByTestId('not-keen-count')).toHaveText('1')
  await expect(cafe.getByTestId('rank-move')).toContainText('2')
  await expect(names(page)).toHaveText(['Art workshop', 'Bowling night', 'Cafe hop'])

  // Tapping the button slides the cards into the new order
  await page.getByTestId('apply-ranking').click()
  await expect(names(page)).toHaveText(['Cafe hop', 'Art workshop', 'Bowling night'])
  await expect(page.getByTestId('activity-rank')).toHaveText(['1', '2', '3'])
  await expect(cafe).toHaveClass(/just-moved/)
  await expect(page.getByTestId('rank-move')).toHaveCount(0)
  await expect(page.getByTestId('apply-ranking')).toHaveCount(0)

  expect(voteWrites(state).map((write) => [write.method, write.body?.value])).toEqual([
    ['POST', 1],
    ['POST', -1],
  ])
})

test('a tie never reorders the list, and the next step links to Availability', async ({ page }) => {
  await mockBackend(page)
  await page.goto(`/groups/${groupId}/activities`)

  // Bowling night ties Art workshop, then Cafe hop ties both: nothing needs to move
  await card(page, 'Bowling night').getByTestId('upvote-button').click()
  await expect(card(page, 'Bowling night').getByTestId('keen-count')).toHaveText('2')
  await card(page, 'Cafe hop').getByTestId('upvote-button').click()
  await expect(card(page, 'Cafe hop').getByTestId('keen-count')).toHaveText('2')
  await expect(page.getByTestId('rank-move')).toHaveCount(0)
  await expect(page.getByTestId('apply-ranking')).toHaveCount(0)
  await expect(names(page)).toHaveText(['Art workshop', 'Bowling night', 'Cafe hop'])

  await expect(page.getByTestId('next-step')).toContainText('Done voting?')
  await page.getByTestId('go-to-availability').click()
  await expect(page).toHaveURL(`/groups/${groupId}/availability`)
})

test('tapping a vote again takes it back, and switching saves the right change', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto(`/groups/${groupId}/activities`)
  const bowlingCard = card(page, 'Bowling night')
  const keen = bowlingCard.getByTestId('upvote-button')
  const notKeen = bowlingCard.getByTestId('downvote-button')

  // Tapping your vote again is how you undo it
  await keen.click()
  await expect(bowlingCard.getByTestId('keen-count')).toHaveText('2')
  await expect(keen).toHaveAttribute('aria-pressed', 'true')
  await keen.click()
  await expect(bowlingCard.getByTestId('keen-count')).toHaveText('1')
  await expect(keen).toHaveAttribute('aria-pressed', 'false')

  // Thumbs down cancels out Friend's thumbs up, so it drops below Cafe hop
  await notKeen.click()
  await expect(bowlingCard.getByTestId('not-keen-count')).toHaveText('1')
  await expect(bowlingCard.getByTestId('rank-move')).toContainText('1')
  await page.getByTestId('apply-ranking').click()
  await expect(names(page)).toHaveText(['Art workshop', 'Cafe hop', 'Bowling night'])

  // Switching to thumbs up moves it back up
  await keen.click()
  await expect(notKeen).toHaveAttribute('aria-pressed', 'false')
  await expect(keen).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('apply-ranking').click()
  await expect(names(page)).toHaveText(['Art workshop', 'Bowling night', 'Cafe hop'])

  await keen.click()
  await expect(keen).toHaveAttribute('aria-pressed', 'false')
  await expect(bowlingCard.getByTestId('keen-count')).toHaveText('1')

  expect(voteWrites(state).map((write) => write.method)).toEqual([
    'POST',
    'DELETE',
    'POST',
    'PATCH',
    'DELETE',
  ])
  expect(
    voteWrites(state).every((write) => (write.activity_id ?? write.body.activity_id) === bowling),
  ).toBe(true)
})

test('the voted button opens a popup of who gave a thumbs up, thumbs down or has not voted', async ({
  page,
}) => {
  await mockBackend(page)
  await page.goto(`/groups/${groupId}/activities`)
  const bowlingCard = card(page, 'Bowling night')
  const showVoters = bowlingCard.getByTestId('show-voters')
  const dialog = page.getByTestId('voters-dialog')

  await bowlingCard.getByTestId('downvote-button').click()
  await expect(showVoters).toHaveText('2 of 3 voted')

  await showVoters.click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Bowling night')
  await expect(page.getByTestId('voters-up')).toContainText('Thumbs up 1')
  await expect(page.getByTestId('voters-up').getByRole('listitem')).toHaveText(['Friend'])
  await expect(page.getByTestId('voters-down').getByRole('listitem')).toHaveText(['You'])
  await expect(page.getByTestId('voters-waiting').getByRole('listitem')).toHaveText(['Sam'])

  // Esc closes it and puts focus back on the button that opened it
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(showVoters).toBeFocused()

  // So does the close button
  await card(page, 'Cafe hop').getByTestId('show-voters').click()
  await expect(page.getByTestId('voters-down')).toContainText('Nobody')
  await page.getByTestId('close-voters').click()
  await expect(dialog).toBeHidden()
})

test('a vote that fails to save puts the real vote back and can be retried', async ({ page }) => {
  const state = await mockBackend(page)
  state.failNextVote = true
  await page.goto(`/groups/${groupId}/activities`)
  const cafe = card(page, 'Cafe hop')

  await cafe.getByTestId('upvote-button').click()
  await expect(page.getByTestId('group-activities-toast')).toContainText(
    "Couldn't save your vote on Cafe hop",
  )
  await expect(cafe.getByTestId('keen-count')).toHaveText('1')
  await expect(cafe.getByTestId('upvote-button')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('toast-retry').click()
  await expect(cafe.getByTestId('keen-count')).toHaveText('2')
  await expect(cafe.getByTestId('upvote-button')).toHaveAttribute('aria-pressed', 'true')
  expect(voteWrites(state).map((write) => write.method)).toEqual(['POST', 'POST'])
})

test('removing an activity asks first, and only the sharer can remove it', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto(`/groups/${groupId}/activities`)

  await expect(card(page, 'Art workshop').getByTestId('remove-activity')).toHaveCount(0)
  const remove = card(page, 'Bowling night').getByTestId('remove-activity')

  await remove.click()
  await expect(page.getByTestId('cancel-remove-activity')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('remove-confirm')).toHaveCount(0)
  await expect(remove).toBeFocused()
  expect(state.writes).toHaveLength(0)

  await remove.click()
  await page.getByTestId('confirm-remove-activity').click()
  await expect(names(page)).toHaveText(['Art workshop', 'Cafe hop'])
  await expect(page.getByTestId('group-activities-toast')).toContainText(
    'Removed Bowling night from the group',
  )
  expect(state.writes.map((write) => [write.endpoint, write.method, write.activity_id])).toEqual([
    ['group_activities', 'DELETE', bowling],
    ['votes', 'DELETE', bowling],
  ])
})

test('an empty group explains how to get started', async ({ page }) => {
  await mockBackend(page, { activities: [] })
  await page.goto(`/groups/${groupId}/activities`)

  const empty = page.getByTestId('group-activities-empty')
  await expect(empty).toContainText('No activities yet')
  await empty.getByRole('link', { name: 'Browse Activities' }).click()
  await expect(page).toHaveURL('/activities')
})

test('on a phone the first card can be voted on without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await mockBackend(page)
  await page.goto(`/groups/${groupId}/activities`)

  const first = card(page, 'Art workshop')
  const keen = await first.getByTestId('upvote-button').boundingBox()
  const notKeen = await first.getByTestId('downvote-button').boundingBox()
  const cardBox = await first.boundingBox()
  expect(Math.abs(keen.y - notKeen.y)).toBeLessThan(2)
  expect(keen.height).toBeGreaterThanOrEqual(44)
  expect(notKeen.x + notKeen.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  // With the group tabs scrolled up to just under the navbar, the first card's vote buttons
  // are on screen. 'instant' skips Bootstrap's smooth scrolling so we measure the end position.
  await page.getByTestId('tab-activities').evaluate((tab) => {
    const navbar = document.querySelector('nav').getBoundingClientRect().height
    const top = tab.getBoundingClientRect().top + window.scrollY - navbar
    window.scrollTo({ top, behavior: 'instant' })
  })
  const keenNow = await first.getByTestId('upvote-button').boundingBox()
  expect(keenNow.y + keenNow.height).toBeLessThanOrEqual(667)
})
