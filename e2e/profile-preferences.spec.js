import { test, expect } from '@playwright/test'
import { mockPreferences, pickMapStation } from './helpers/preferences'

test('Left from Telok Blangah stays local and Up still reaches Labrador Park', async ({ page }) => {
  const state = await mockPreferences(page, { home_station_id: 'telok-blangah' })
  await page.goto('/profile')
  await page.getByTestId('mrt-map-viewport').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('mrt-marker-telok-blangah')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByTestId('mrt-marker-labrador-park')).toBeFocused()
  await expect(page.getByTestId('mrt-marker-telok-blangah')).toHaveAttribute('aria-pressed', 'true')
  expect(state.saves).toHaveLength(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('mrt-marker-labrador-park')).toHaveAttribute('aria-pressed', 'true')
})

test('station-only changes enable Save, Undo restores both fields and reload restores a save', async ({
  page,
}) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await page.goto('/profile')
  await expect(page.getByTestId('mrt-marker-tampines')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('mrt-zoom')).toHaveAttribute('data-zoom', '25')
  const map = await page.getByTestId('mrt-map-canvas').boundingBox()
  expect(map.width).toBeGreaterThanOrEqual(900)
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

test('25% map fills the Profile panel after resizing and keeps stations aligned and centred', async ({
  page,
}) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await page.goto('/profile')
  for (const width of [1920, 1440, 1280, 768, 375, 320, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByTestId('mrt-marker-tampines')).toHaveAttribute('aria-pressed', 'true')
    const measureGeometry = () =>
      page.getByTestId('mrt-map-canvas').evaluate((canvas) => {
        const viewport = canvas.parentElement
        const map = canvas.getBoundingClientRect()
        const image = canvas.querySelector('img').getBoundingClientRect()
        const marker = canvas.querySelector('[data-station-id="tampines"]')
        const bounds = marker.getBoundingClientRect()
        const x = parseFloat(marker.style.left) / 100
        const y = parseFloat(marker.style.top) / 100
        return {
          width: map.width,
          viewportWidth: viewport.clientWidth,
          imageWidth: image.width,
          imageHeight: image.height,
          height: map.height,
          xError: Math.abs(bounds.x + bounds.width / 2 - map.x - x * map.width),
          yError: Math.abs(bounds.y + bounds.height / 2 - map.y - y * map.height),
          scrollLeft: viewport.scrollLeft,
          expectedLeft: Math.max(
            0,
            Math.min(
              x * map.width - viewport.clientWidth / 2,
              viewport.scrollWidth - viewport.clientWidth,
            ),
          ),
          scrollTop: viewport.scrollTop,
          expectedTop: Math.max(
            0,
            Math.min(
              y * map.height - viewport.clientHeight / 2,
              viewport.scrollHeight - viewport.clientHeight,
            ),
          ),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
        }
      })
    await expect
      .poll(async () => {
        const geometry = await measureGeometry()
        return Math.max(
          Math.abs(geometry.scrollLeft - geometry.expectedLeft),
          Math.abs(geometry.scrollTop - geometry.expectedTop),
        )
      })
      .toBeLessThanOrEqual(1)
    const geometry = await measureGeometry()
    // clientWidth is rounded to an integer; getBoundingClientRect preserves subpixels.
    expect(Math.abs(geometry.width - Math.max(900, geometry.viewportWidth))).toBeLessThanOrEqual(1)
    expect(geometry.imageWidth).toBe(geometry.width)
    expect(geometry.imageHeight).toBeCloseTo(geometry.height, 1)
    expect(geometry.xError).toBeLessThan(0.1)
    expect(geometry.yError).toBeLessThan(0.1)
    expect(Math.abs(geometry.scrollTop - geometry.expectedTop)).toBeLessThanOrEqual(1)
    expect(geometry.pageOverflow, `Page overflow at ${width}px`).toBe(false)
    await expect(page.getByTestId('mrt-zoom')).toHaveAttribute('data-zoom', '25')
  }
  expect(state.saves).toHaveLength(0)
  await page.screenshot({ path: test.info().outputPath('mrt-profile-wide.png'), fullPage: true })
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
  await expect(page.getByTestId('mrt-zoom')).toBeDisabled()
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
