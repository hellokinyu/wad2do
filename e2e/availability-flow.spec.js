import { test, expect } from '@playwright/test'
import { mockUser } from './helpers/auth'
import { groupId, mockItinerary, week } from './helpers/itinerary'

const hours = week({ Fri: { open24h: true }, Sat: { open24h: true } })
const slot = (page, time) => page.getByTestId('slot-2026-10-30T' + time)

for (const width of [375, 768, 1280]) {
  test(`guided availability builds and saves a plan at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const state = await mockItinerary(page, { hours, start: null, end: null })
    await page.goto(`/groups/${groupId}/availability`)
    await expect(page.getByTestId('availability-step-heading')).toHaveText('When are you free?')
    await slot(page, '10:00').click()
    await expect(page.getByTestId('availability-save-status')).toContainText('is saved')
    await page.getByTestId('availability-next').click()
    await expect(page.getByTestId('availability-step-heading')).toBeFocused()
    const heading = await page.getByTestId('availability-step-heading').boundingBox()
    const navbar = await page.locator('.navbar').boundingBox()
    expect(heading.y + heading.height <= navbar.y || heading.y >= navbar.y + navbar.height).toBe(true)
    await expect(page.getByTestId('all-free-banner')).toContainText('Times everyone can make')
    await expect(page.getByTestId('confirm-time')).toBeDisabled()
    await slot(page, '10:00').click()
    await expect(page.getByTestId('confirm-time')).toBeDisabled()
    await expect(page.getByTestId('availability-action')).toContainText(
      'Now tap or drag to the last block',
    )
    await slot(page, '11:30').click()
    await expect(page.getByTestId('availability-action')).toContainText('2 hours')
    await expect(page.getByTestId('availability-action')).toContainText('Not confirmed yet')
    await expect(page.getByTestId('confirm-time')).toHaveText('Confirm time & build itinerary')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.getByTestId('confirm-time').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: test.info().outputPath(`availability-${width}.png`),
      fullPage: false,
    })
    await page.getByTestId('confirm-time').click()
    await expect(page.getByTestId('itinerary-saved-status')).toBeVisible()
    await expect(page.getByTestId('itinerary-stop')).toContainText('10:00 am – 11:00 am')
    await expect(page.locator('.step').last().locator('.visually-hidden')).toContainText('done')
    expect(state.writes).toHaveLength(1)
    await page.reload()
    await expect(page.getByTestId('itinerary-stop')).toHaveCount(1)
    expect(state.writes).toHaveLength(1)
  })
}

test('a failed time save retains the range, and retry waits before building', async ({ page }) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  state.timeSaveFailures = 1
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  await slot(page, '10:00').click()
  await slot(page, '11:30').click()
  await page.getByTestId('confirm-time').click()
  await expect(page.getByTestId('availability-action-error')).toContainText(
    'Your selection is still here',
  )
  await expect(slot(page, '11:30')).toHaveClass(/slot-picked/)
  await expect(page.getByTestId('availability-grid')).toBeVisible()
  expect(state.writes).toHaveLength(0)
  state.holdTimeSave = true
  await page.getByTestId('confirm-time').click()
  await expect(page.getByTestId('confirm-time')).toHaveText('Saving group time…')
  await expect(page.getByTestId('mode-mine')).toBeDisabled()
  expect(state.writes).toHaveLength(0)
  state.releaseTimeSave()
  await expect(page.getByTestId('itinerary-saved-status')).toBeVisible()
  expect(state.writes).toHaveLength(1)
})

test('viewing an existing itinerary never rebuilds it and incomplete picks block the saved time', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours })
  await page.goto(`/groups/${groupId}/itinerary`)
  await expect(page.getByTestId('itinerary-stop')).toBeVisible()
  await page.getByTestId('tab-availability').click()
  await page.getByTestId('availability-next').click()
  await expect(page.getByTestId('confirm-time')).toHaveText('View itinerary')
  await slot(page, '10:00').click()
  await expect(page.getByTestId('confirm-time')).toBeDisabled()
  await slot(page, '11:30').click()
  await expect(page.getByTestId('confirm-time')).toHaveText('Replace time & rebuild')
  await expect(page.getByTestId('replace-plan-warning')).toContainText(
    'Changing the time replaces your itinerary',
  )
  await page.getByTestId('clear-time-selection').click()
  await expect(page.getByTestId('confirm-time')).toHaveText('View itinerary')
  await page.getByTestId('confirm-time').click()
  await expect(page.getByTestId('itinerary-stop')).toContainText('8:00 pm – 9:00 pm')
  expect(state.writes).toHaveLength(1)
})

test('a one-block suggestion completes a deliberate 30-minute selection', async ({ page }) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  state.availability = [{ user_id: mockUser.id, slot_start: '2026-10-30T10:00:00+08:00' }]
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  await expect(slot(page, '10:00')).toHaveAttribute('data-mark', 'all')
  await expect(page.getByTestId('all-free-banner').getByRole('button')).toContainText('30 minutes')
  await page.getByTestId('all-free-banner').getByRole('button').click()
  await expect(page.getByTestId('all-free-banner').getByRole('button')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByTestId('availability-action')).toContainText('30 minutes · Everyone free')
  await expect(page.getByTestId('confirm-time')).toBeEnabled()
  await page.getByTestId('confirm-time').click()
  await expect(page.getByTestId('itinerary-no-fit')).toContainText('No activities fit')
  await expect(page.getByTestId('itinerary-saved-status')).toHaveCount(0)
  expect(state.writes).toHaveLength(0)
})

test('stars mark tied best blocks and a range the same members can attend throughout', async ({ page }) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  const friend = '66666666-6666-4666-8666-666666666666'
  const other = '77777777-7777-4777-8777-777777777777'
  state.members = [
    { id: mockUser.id, display_name: 'Demo User' },
    { id: friend, display_name: 'Friend' },
    { id: other, display_name: 'Other friend' },
  ]
  state.availability = [
    { user_id: mockUser.id, slot_start: '2026-10-30T10:00:00+08:00' },
    { user_id: mockUser.id, slot_start: '2026-10-30T10:30:00+08:00' },
    { user_id: friend, slot_start: '2026-10-30T10:00:00+08:00' },
    { user_id: friend, slot_start: '2026-10-30T10:30:00+08:00' },
    { user_id: other, slot_start: '2026-10-30T11:00:00+08:00' },
  ]
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  await expect(slot(page, '10:00')).toHaveAttribute('data-mark', 'best')
  await expect(slot(page, '10:30')).toHaveAttribute('data-mark', 'best')
  await expect(slot(page, '11:00')).toHaveText('1')
  await slot(page, '10:00').click()
  await slot(page, '10:30').click()
  await expect(page.getByTestId('availability-action')).toContainText('2 of 3 free throughout · Best available')
})

test('stars appear on best-so-far grid blocks before everyone has responded', async ({ page }) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  const friend = '66666666-6666-4666-8666-666666666666'
  state.members = [
    { id: mockUser.id, display_name: 'Demo User' },
    { id: friend, display_name: 'Friend' },
    { id: '77777777-7777-4777-8777-777777777777', display_name: 'Not answered yet' },
  ]
  state.availability = [
    { user_id: mockUser.id, slot_start: '2026-10-30T10:00:00+08:00' },
    { user_id: mockUser.id, slot_start: '2026-10-30T10:30:00+08:00' },
    { user_id: friend, slot_start: '2026-10-30T10:00:00+08:00' },
    { user_id: friend, slot_start: '2026-10-30T10:30:00+08:00' },
  ]
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  await expect(page.getByTestId('availability-response-count')).toContainText('2 of 3')
  await expect(slot(page, '10:00')).toHaveAttribute('data-mark', 'best')
  await expect(slot(page, '10:30')).toHaveAttribute('data-mark', 'best')
  await expect(slot(page, '11:00')).toHaveText('')
  await slot(page, '10:00').click()
  await slot(page, '10:30').click()
  await expect(page.getByTestId('availability-action')).toContainText('2 of 3 free throughout')
  await expect(page.getByTestId('availability-action')).toContainText('Best so far')
  await page.screenshot({ path: test.info().outputPath('best-so-far-stars.png'), fullPage: false })
})

test('attendance counts members free for the entire range rather than changing people per block', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  const friend = '66666666-6666-4666-8666-666666666666'
  state.members = [
    { id: mockUser.id, display_name: 'Demo User' },
    { id: friend, display_name: 'Friend' },
  ]
  state.availability = [
    { user_id: mockUser.id, slot_start: '2026-10-30T10:00:00+08:00' },
    { user_id: friend, slot_start: '2026-10-30T10:30:00+08:00' },
  ]
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  await slot(page, '10:00').click()
  await slot(page, '10:30').click()
  await expect(page.getByTestId('availability-action')).toContainText('0 of 2 free throughout')
})

for (const [width, height] of [
  [375, 850],
  [667, 375],
  [768, 850],
]) {
  test(`time action remains reachable at ${width} by ${height}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await mockItinerary(page, { hours, start: null, end: null })
    await page.goto(`/groups/${groupId}/availability`)
    await page.getByTestId('availability-next').click()
    await slot(page, '22:00').click()
    await slot(page, '22:30').click()
    await expect(page.getByTestId('confirm-time')).toBeInViewport()
    const action = await page.getByTestId('availability-action').boundingBox()
    const nav = await page.locator('.navbar').boundingBox()
    const button = await page.getByTestId('confirm-time').boundingBox()
    expect(button.y).toBeGreaterThanOrEqual(action.y)
    expect(button.y + button.height).toBeLessThanOrEqual(height)
    expect(action.y + action.height <= nav.y + 1 || action.y >= nav.y + nav.height).toBe(true)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.getByTestId('confirm-time').click()
    await expect(page.getByTestId('itinerary-saved-status')).toBeVisible()
  })
}

test('leaving while a group time is saving cannot navigate back when the response arrives', async ({
  page,
}) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  state.holdTimeSave = true
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  await slot(page, '10:00').click()
  await slot(page, '11:30').click()
  await page.getByTestId('confirm-time').click()
  await expect(page.getByTestId('confirm-time')).toHaveText('Saving group time…')
  await page.getByTestId('tab-activities').click()
  state.releaseTimeSave()
  await expect(page).toHaveURL(`/groups/${groupId}/activities`)
  await expect(page.getByTestId('group-activities-tab')).toBeVisible()
  expect(state.writes).toHaveLength(0)
})

test('tapping a date marks the whole day free, and tapping again clears it', async ({ page }) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('day-head-2026-10-30').click()
  await expect(slot(page, '09:00')).toHaveClass(/slot-free/)
  await expect(slot(page, '22:30')).toHaveClass(/slot-free/)
  await expect.poll(() => state.availability?.length).toBe(28)
  await expect(page.getByTestId('day-head-2026-10-30')).toHaveAccessibleName(/Clear all of/)
  await page.getByTestId('day-head-2026-10-30').click()
  await expect(slot(page, '09:00')).not.toHaveClass(/slot-free/)
  await expect.poll(() => state.availability?.length).toBe(0)
})

test('dragging across heatmap blocks picks a range on one day', async ({ page }) => {
  await mockItinerary(page, { hours, start: null, end: null })
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  const box = async (time) => (await slot(page, time).boundingBox())
  const from = await box('10:00')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  const to = await box('11:30')
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(slot(page, '10:00')).toHaveClass(/slot-picked/)
  await expect(slot(page, '11:00')).toHaveClass(/slot-picked/)
  await expect(slot(page, '11:30')).toHaveClass(/slot-picked/)
  await expect(page.getByTestId('availability-action')).toContainText('2 hours')
  await expect(page.getByTestId('slot-info')).toContainText('11:30am')
})

test('adding a day when no time works asks first and then extends the dates', async ({ page }) => {
  const state = await mockItinerary(page, { hours, start: null, end: null })
  const friend = '66666666-6666-4666-8666-666666666666'
  state.members = [
    { id: mockUser.id, display_name: 'Demo User' },
    { id: friend, display_name: 'Friend' },
  ]
  state.availability = [
    { user_id: mockUser.id, slot_start: '2026-10-30T10:00:00+08:00' },
    { user_id: friend, slot_start: '2026-10-30T11:00:00+08:00' },
  ]
  await page.goto(`/groups/${groupId}/availability`)
  await page.getByTestId('availability-next').click()
  await page.getByTestId('extend-range').click()
  await expect(page.getByTestId('extend-confirm')).toContainText('3 Nov')
  const patch = page.waitForRequest(
    (request) => request.url().includes('/groups') && request.method() === 'PATCH',
  )
  await page.getByTestId('extend-range-confirm').click()
  expect((await patch).postDataJSON()).toEqual({ end_date: '2026-11-03' })
  await expect(page.getByTestId('extend-range')).toBeVisible()
})
