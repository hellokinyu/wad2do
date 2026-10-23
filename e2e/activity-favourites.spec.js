import { test, expect } from '@playwright/test'
import { mockUser, signInMockUser } from './helpers/auth'

const activities = Array.from({ length: 21 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name: index === 0 ? 'Pottery Workshop' : `Activity ${index + 1}`,
  category: 'Workshops',
  area: 'Tiong Bahru',
  indoor: true,
  price_per_person: 35,
  duration_min: 120,
  image_url: '/images/pottery-workshop.jpeg',
}))

async function mockBackend(page, initialIds = []) {
  await signInMockUser(page)
  const state = {
    saved: new Set(initialIds),
    writes: [],
    collectionReads: 0,
    readFailures: 0,
    saveFailures: 0,
    deleteFailures: 0,
    emptyDeletes: 0,
    duplicateSave: false,
    writeGate: null,
    loseSaveResponse: false,
    loseDeleteResponse: false,
    confirmationFailures: 0,
  }
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').pop()
    const id = url.searchParams.get('activity_id')?.replace('eq.', '')
    if (table === 'profiles')
      return route.fulfill({ json: [{ display_name: 'Demo', interests: [], company: [] }] })
    if (table === 'submissions') return route.fulfill({ json: [] })
    if (table === 'activities') {
      const activityId = url.searchParams.get('id')
      if (activityId?.startsWith('eq.'))
        return route.fulfill({ json: activities.find((a) => activityId === 'eq.' + a.id) })
      return route.fulfill({
        json: activityId ? activities.filter((a) => state.saved.has(a.id)) : activities,
      })
    }
    if (table !== 'favourites') return route.fulfill({ status: 404, json: {} })
    if (request.method() === 'GET') {
      expect(url.searchParams.get('user_id')).toBe('eq.' + mockUser.id)
      if (!id) state.collectionReads += 1
      if (state.readFailures-- > 0)
        return route.fulfill({ status: 403, json: { message: 'Read denied' } })
      return route.fulfill({
        json: [...state.saved]
          .filter((savedId) => !id || id === savedId)
          .map((activity_id) => ({ activity_id })),
      })
    }
    state.writes.push(request.method())
    if (state.writeGate) await state.writeGate
    if (request.method() === 'POST') {
      const record = request.postDataJSON()
      expect(record.user_id).toBe(mockUser.id)
      if (state.saveFailures-- > 0)
        return route.fulfill({ status: 403, json: { message: 'Insert denied' } })
      const alreadySaved = state.saved.has(record.activity_id)
      state.saved.add(record.activity_id)
      if (state.loseSaveResponse) {
        state.loseSaveResponse = false
        state.readFailures = state.confirmationFailures
        return route.abort('failed')
      }
      if (alreadySaved || state.duplicateSave)
        return route.fulfill({ status: 409, json: { code: '23505', message: 'Already saved' } })
      return route.fulfill({ status: 201, json: {} })
    }
    expect(url.searchParams.get('user_id')).toBe('eq.' + mockUser.id)
    expect(url.searchParams.get('select')).toBe('activity_id')
    if (state.deleteFailures-- > 0)
      return route.fulfill({ status: 403, json: { message: 'Delete denied' } })
    if (state.emptyDeletes-- > 0) return route.fulfill({ json: [] })
    const removed = state.saved.delete(id)
    if (state.loseDeleteResponse) {
      state.loseDeleteResponse = false
      state.readFailures = state.confirmationFailures
      return route.abort('failed')
    }
    return route.fulfill({ json: removed ? [{ activity_id: id }] : [] })
  })
  return state
}

test('card favourites persist across pages, reload, details and Profile', async ({ page }) => {
  const state = await mockBackend(page, [activities[20].id])
  await page.goto('/activities')
  const firstHeart = page.getByTestId('activity-save').first()
  await expect(firstHeart).toBeEnabled()
  expect(state.collectionReads).toBe(1)
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('activity-card').first().hover()
  await firstHeart.click()
  await expect(page).toHaveURL('/activities')
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('activity-save-feedback')).toHaveText('Activity saved.')
  await expect(firstHeart).toHaveCSS('color', 'rgb(220, 53, 69)')
  await page.reload()
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'true')
  await expect(firstHeart).toHaveAttribute('aria-label', 'Remove Activity 21 from saved activities')
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await page.getByTestId('activity-name-link').first().click()
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('detail-save').click()
  await expect(page.getByTestId('detail-save')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('activity-back').click()
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('activity-card').first().hover()
  await firstHeart.click()
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('saved-card-' + activities[0].id)).toBeVisible()
  await page.getByTestId('nav-activities').click()
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'true')
  await firstHeart.click()
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'false')
  await page.reload()
  await expect(firstHeart).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('activity-share')).toHaveCount(0)
})

test('failed favourite loading disables hearts and can be retried', async ({ page }) => {
  const state = await mockBackend(page, [activities[0].id])
  state.readFailures = 1
  await page.goto('/activities')
  await expect(page.getByTestId('favourites-error')).toBeVisible()
  await expect(page.getByTestId('activity-save').first()).toBeDisabled()
  await expect(page.getByTestId('activity-card')).toHaveCount(20)
  await page.getByTestId('favourites-retry').click()
  await expect(page.getByTestId('favourites-error')).toHaveCount(0)
  await expect(page.getByTestId('activity-save').first()).toBeEnabled()
  await expect(page.getByTestId('activity-save').first()).toHaveAttribute('aria-pressed', 'true')
})

test('save and removal failures keep the confirmed heart state and allow retry', async ({
  page,
}) => {
  const state = await mockBackend(page)
  state.saveFailures = 1
  await page.goto('/activities')
  const heart = page.getByTestId('activity-save').first()
  await expect(heart).toBeEnabled()
  await page.getByTestId('activity-card').first().hover()
  await heart.click()
  await expect(page.getByTestId('activity-save-feedback')).toContainText("Couldn't update")
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  expect(state.saved.has(activities[0].id)).toBe(false)
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  state.emptyDeletes = 1
  await heart.click()
  await expect(page.getByTestId('activity-save-feedback')).toContainText("Couldn't update")
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  state.deleteFailures = 1
  await heart.click()
  await expect(heart).toBeEnabled()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  expect(state.saved.has(activities[0].id)).toBe(true)
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  expect(state.saved.has(activities[0].id)).toBe(false)
})

test('a pending save blocks repeated clicks only on that card', async ({ page }) => {
  const state = await mockBackend(page)
  let releaseWrite
  state.writeGate = new Promise((resolve) => {
    releaseWrite = resolve
  })
  await page.goto('/activities')
  const hearts = page.getByTestId('activity-save')
  await expect(hearts.first()).toBeEnabled()
  await page.getByTestId('activity-card').first().hover()
  await hearts.first().click()
  await expect.poll(() => state.writes.length).toBe(1)
  await expect(hearts.first()).toBeDisabled()
  await expect(hearts.nth(1)).toBeEnabled()
  await hearts.first().dispatchEvent('click')
  releaseWrite()
  await expect(hearts.first()).toHaveAttribute('aria-pressed', 'true')
  expect(state.writes).toEqual(['POST'])
})

test('a concurrent duplicate save is treated as saved', async ({ page }) => {
  const state = await mockBackend(page)
  state.duplicateSave = true
  await page.goto('/activities')
  const heart = page.getByTestId('activity-save').first()
  await expect(heart).toBeEnabled()
  await page.getByTestId('activity-card').first().hover()
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('activity-save-feedback')).toHaveText('Activity saved.')
})

for (const [view, path, buttonId, errorId] of [
  ['cards', '/activities', 'activity-save', 'activity-save-feedback'],
  ['details', '/activities/' + activities[0].id, 'detail-save', 'detail-action-error'],
]) {
  test(`${view}: retrying Save after a lost response never removes the favourite`, async ({
    page,
  }) => {
    const state = await mockBackend(page)
    await page.goto(path)
    const heart = page.getByTestId(buttonId).first()
    await expect(heart).toBeEnabled()
    state.loseSaveResponse = true
    state.confirmationFailures = 1
    await heart.click()
    await expect(page.getByTestId(errorId)).toContainText("Couldn't update")
    expect(state.saved.has(activities[0].id)).toBe(true)
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
    await heart.click()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
    expect(state.writes).toEqual(['POST', 'POST'])
    expect(state.saved.has(activities[0].id)).toBe(true)
    await page.reload()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
  })

  test(`${view}: retrying Remove after a lost response never restores the favourite`, async ({
    page,
  }) => {
    const state = await mockBackend(page, [activities[0].id])
    await page.goto(path)
    const heart = page.getByTestId(buttonId).first()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
    state.loseDeleteResponse = true
    state.confirmationFailures = 1
    await heart.click()
    await expect(page.getByTestId(errorId)).toContainText("Couldn't update")
    expect(state.saved.has(activities[0].id)).toBe(false)
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
    await heart.click()
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
    expect(state.writes).toEqual(['DELETE', 'DELETE'])
    expect(state.saved.has(activities[0].id)).toBe(false)
    await page.reload()
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
  })
}

test('successful read-back recovers lost Save and Remove responses', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/activities')
  const heart = page.getByTestId('activity-save').first()
  await expect(heart).toBeEnabled()
  state.loseSaveResponse = true
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('activity-save-feedback')).toHaveText('Activity saved.')
  state.loseDeleteResponse = true
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('activity-save-feedback')).toHaveText(
    'Removed from saved activities.',
  )
  expect(state.writes).toEqual(['POST', 'DELETE'])
})

test('a stale heart repeats the intended action after changes from another tab', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/activities')
  const heart = page.getByTestId('activity-save').first()
  await expect(heart).toBeEnabled()
  state.saved.add(activities[0].id)
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  expect(state.saved.has(activities[0].id)).toBe(true)
  state.saved.delete(activities[0].id)
  await heart.click()
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  expect(state.saved.has(activities[0].id)).toBe(false)
  expect(state.writes).toEqual(['POST', 'DELETE'])
})

test('desktop hearts stay visible on transparent buttons and support keyboard saving', async ({
  page,
}, testInfo) => {
  await mockBackend(page)
  await page.goto('/activities')
  const heart = page.getByTestId('activity-save').first()
  await expect(heart).toBeEnabled()
  await page.mouse.move(0, 0)
  await expect(heart).toHaveCSS('opacity', '1')
  await expect(heart).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(heart.locator('svg')).toHaveCSS('stroke', 'rgb(255, 255, 255)')
  await expect(heart).toHaveCSS('width', '44px')
  await expect(heart).toHaveCSS('height', '44px')
  await page
    .getByTestId('activity-card')
    .first()
    .screenshot({ path: testInfo.outputPath('unsaved-card-desktop.png') })
  await heart.focus()
  await expect(heart).toHaveCSS('opacity', '1')
  await page.keyboard.press('Space')
  await expect(heart).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('activity-search').focus()
  await expect(heart.locator('svg')).toHaveCSS('fill', 'rgb(220, 53, 69)')
  await page
    .getByTestId('activity-card')
    .first()
    .screenshot({ path: testInfo.outputPath('saved-card-desktop.png') })
  await expect(heart).toHaveCSS('opacity', '1')
  await expect(page).toHaveURL('/activities')
})

test('an account check failure prevents favourite writes', async ({ page }) => {
  const state = await mockBackend(page)
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ status: 500, json: { message: 'Auth unavailable' } }),
  )
  await page.goto('/activities')
  const heart = page.getByTestId('activity-save').first()
  await expect(heart).toBeEnabled()
  await page.getByTestId('activity-card').first().hover()
  await heart.click()
  await expect(page.getByTestId('activity-save-feedback')).toContainText("Couldn't update")
  await expect(heart).toHaveAttribute('aria-pressed', 'false')
  expect(state.writes).toEqual([])
})

test.describe('touchscreen', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true })

  test('heart is visible without hover and a tap saves without opening details', async ({
    page,
  }, testInfo) => {
    await mockBackend(page)
    await page.goto('/activities')
    const heart = page.getByTestId('activity-save').first()
    await expect(heart).toBeEnabled()
    await expect(heart).toHaveCSS('opacity', '1')
    await heart.tap()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL('/activities')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
    await page.screenshot({ path: testInfo.outputPath('saved-card-phone.png') })
    await expect(page.getByTestId('activity-save-feedback')).toHaveCount(0)
  })
})
