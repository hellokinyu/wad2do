import { test, expect } from '@playwright/test'
import { mockPreferences, pickMapStation } from './helpers/preferences'

test('station-only changes enable Save, Undo restores both fields and reload restores a save', async ({
  page,
}) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await page.goto('/profile')
  await expect(page.getByTestId('mrt-marker-tampines')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('mrt-zoom-level')).toHaveText('25%')
  const map = await page.getByTestId('mrt-map-canvas').boundingBox()
  expect(map.width).toBe(900)
  await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
  expect(state.saves).toHaveLength(0)
  await expect(page.getByTestId('mrt-search')).toHaveCount(0)
  await expect(page.getByTestId('mrt-select')).toHaveCount(0)
  await pickMapStation(page, 'tampines-east')
  await expect(page.getByTestId('profile-save-prefs')).toBeEnabled()
  await page.getByTestId('profile-undo-prefs').click()
  await expect(page.getByTestId('mrt-marker-tampines')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('pref-area')).toHaveValue('Tampines')
  await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
  await pickMapStation(page, 'tampines-east')
  await page.getByTestId('profile-save-prefs').click()
  await expect(page.getByTestId('profile-prefs-saved')).toBeVisible()
  expect(state.saves[0].body).toMatchObject({
    home_station_id: 'tampines-east',
    home_area: 'Tampines',
    company: ['Friends'],
    budget: '20-50',
    interests: ['Food', 'Cafes', 'Outdoors'],
  })
  await page.reload()
  await expect(page.getByTestId('mrt-marker-tampines-east')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
})

test('manual area clears station, Undo restores station and Clear resets both fields', async ({
  page,
}) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await page.goto('/profile')
  await page.getByTestId('pref-area').selectOption('Bishan')
  await expect(page.locator('[data-station-id][aria-pressed="true"]')).toHaveCount(0)
  await page.getByTestId('profile-undo-prefs').click()
  await expect(page.getByTestId('mrt-marker-tampines')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('pref-area')).toHaveValue('Tampines')
  await page.getByTestId('mrt-clear').click()
  await expect(page.locator('[data-station-id][aria-pressed="true"]')).toHaveCount(0)
  await expect(page.getByTestId('pref-area')).toHaveValue('')
  await page.getByTestId('profile-save-prefs').click()
  await expect(page.getByTestId('profile-prefs-saved')).toBeVisible()
  expect(state.saves[0].body).toMatchObject({ home_station_id: null, home_area: null })
})

test('saving disables every preference control and failed confirmation retains the draft for retry', async ({
  page,
}) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  let release
  state.saveGate = new Promise((resolve) => {
    release = resolve
  })
  state.failSave = true
  await page.goto('/profile')
  await pickMapStation(page, 'bishan')
  await page.getByTestId('profile-save-prefs').click()
  await expect(page.getByTestId('mrt-marker-tampines')).toBeDisabled()
  await expect(page.getByTestId('mrt-clear')).toBeDisabled()
  await expect(page.getByTestId('mrt-zoom-in')).toBeDisabled()
  await expect(page.getByTestId('profile-undo-prefs')).toBeDisabled()
  await expect(page.getByTestId('pref-area')).toBeDisabled()
  await expect(page.getByTestId('pref-interest-food')).toBeDisabled()
  await expect(page.getByTestId('pref-budget-under-20')).toBeDisabled()
  await expect(page.getByTestId('pref-company-friends')).toBeDisabled()
  release()
  await expect(page.getByTestId('profile-prefs-error')).toBeVisible()
  await expect(page.getByTestId('profile-prefs-saved')).toHaveCount(0)
  await expect(page.getByTestId('mrt-marker-bishan')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('pref-area')).toHaveValue('Bishan')
  await expect(page.getByTestId('profile-save-prefs')).toBeEnabled()
  state.failSave = false
  await page.getByTestId('profile-save-prefs').click()
  await expect(page.getByTestId('profile-prefs-saved')).toBeVisible()
  expect(state.saves[1].body).toEqual(state.saves[0].body)
})

for (const stationId of [null, 'retired-station']) {
  test(`Profile preserves saved area when station is ${stationId}`, async ({ page }) => {
    const state = await mockPreferences(page, { home_station_id: stationId, home_area: 'Bishan' })
    await page.goto('/profile')
    await expect(page.locator('[data-station-id][aria-pressed="true"]')).toHaveCount(0)
    await expect(page.getByTestId('pref-area')).toHaveValue('Bishan')
    await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
    expect(state.saves).toHaveLength(0)
    await pickMapStation(page, 'tampines')
    await page.getByTestId('profile-undo-prefs').click()
    await expect(page.locator('[data-station-id][aria-pressed="true"]')).toHaveCount(0)
    await expect(page.getByTestId('pref-area')).toHaveValue('Bishan')
    await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
  })
}
