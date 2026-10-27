import { test, expect } from '@playwright/test'
import { mockUser } from './helpers/auth'
import {
  finishOnboarding,
  mockPreferences,
  openLocationStep,
  pickMapStation,
} from './helpers/preferences'

test('map selection saves both fields and reloads without redundant station inputs', async ({
  page,
}) => {
  const state = await mockPreferences(page)
  await openLocationStep(page)
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await expect(page.getByTestId('mrt-search')).toHaveCount(0)
  await expect(page.getByTestId('mrt-select')).toHaveCount(0)
  await pickMapStation(page, 'tampines')
  await expect(page.getByTestId('mrt-confirmation')).toContainText('Tampines MRT · EW2 / DT32')
  await expect(page.getByTestId('home-area')).toHaveValue('Tampines')
  await expect(page.getByTestId('onboarding-next')).toBeEnabled()
  await page.getByTestId('mrt-marker-tampines-east').click()
  await expect(page.getByTestId('mrt-marker-tampines-east')).toHaveAttribute('aria-pressed', 'true')
  await finishOnboarding(page)
  await expect(page.getByTestId('summary-area')).toHaveText('Tampines East MRT · DT33')
  expect(state.saves).toEqual([
    {
      owner: 'eq.' + mockUser.id,
      body: {
        display_name: 'Demo User',
        interests: ['Food', 'Cafes', 'Outdoors'],
        budget: '20-50',
        home_area: 'Tampines',
        home_station_id: 'tampines-east',
        company: ['Friends'],
      },
    },
  ])
  await openLocationStep(page)
  await expect(page.getByTestId('mrt-marker-tampines-east')).toHaveAttribute('aria-pressed', 'true')
  expect(state.saves).toHaveLength(1)
  await page.goto('/profile')
  await expect(page.getByTestId('mrt-marker-tampines-east')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
})

test('Skip Location clears both saved fields and shows Not set in the summary', async ({
  page,
}) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await openLocationStep(page)
  await page.getByTestId('onboarding-skip').click()
  await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('summary-area')).toHaveText('Not set')
  expect(state.saves[0].body).toMatchObject({ home_station_id: null, home_area: null })
})

for (const stationId of [null, 'retired-station']) {
  test(`saved area remains usable without inferring a station (${stationId})`, async ({ page }) => {
    const state = await mockPreferences(page, { home_station_id: stationId, home_area: 'Bishan' })
    await openLocationStep(page)
    await expect(page.locator('[data-station-id][aria-pressed="true"]')).toHaveCount(0)
    await expect(page.getByTestId('home-area')).toHaveValue('Bishan')
    await expect(page.getByTestId('onboarding-next')).toBeEnabled()
    expect(state.saves).toHaveLength(0)
    await finishOnboarding(page)
    await expect(page.getByTestId('summary-area')).toHaveText('Bishan')
    expect(state.saves[0].body).toMatchObject({ home_station_id: stationId, home_area: 'Bishan' })
  })
}

test('manual area and clear reset the station consistently', async ({ page }) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await openLocationStep(page)
  await page.getByTestId('home-area').selectOption('Bishan')
  await expect(page.locator('[data-station-id][aria-pressed="true"]')).toHaveCount(0)
  await page.getByTestId('mrt-clear').click()
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await expect(page.getByTestId('home-area')).toHaveValue('')
  await page.getByTestId('home-area').selectOption('Bedok')
  await finishOnboarding(page)
  await expect(page.getByTestId('summary-area')).toHaveText('Bedok')
  expect(state.saves[0].body).toMatchObject({ home_station_id: null, home_area: 'Bedok' })
})

test('keyboard map selection reaches Next without tabbing through every marker', async ({
  page,
}) => {
  await mockPreferences(page)
  await openLocationStep(page)
  const map = page.getByTestId('mrt-map-viewport')
  await map.focus()
  await map.press('End')
  await expect(page.getByTestId('mrt-marker-yishun')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByTestId('mrt-marker-admiralty')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  const marker = page.getByTestId('mrt-marker-aljunied')
  await expect(marker).toBeFocused()
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await marker.press('Enter')
  await expect(marker).toHaveAttribute('aria-pressed', 'true')
  await expect(marker).toBeFocused()
  await expect(page.getByTestId('home-area')).toHaveValue('Geylang')
  await expect(page.getByTestId('onboarding-step-area')).toBeVisible()
  const focused = []
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    focused.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
  }
  expect(focused).toContain('onboarding-next')
  expect(focused.some((id) => id?.startsWith('mrt-marker-'))).toBe(false)
})

test('failed onboarding save preserves the selected station for retry', async ({ page }) => {
  const state = await mockPreferences(page)
  state.failSave = true
  await openLocationStep(page)
  await pickMapStation(page, 'bishan')
  await finishOnboarding(page)
  await expect(page.getByTestId('onboarding-error')).toBeVisible()
  await page.getByTestId('onboarding-back').click()
  await page.getByTestId('onboarding-back').click()
  await expect(page.getByTestId('mrt-marker-bishan')).toHaveAttribute('aria-pressed', 'true')
  state.failSave = false
  await finishOnboarding(page)
  await expect(page.getByTestId('summary-area')).toHaveText('Bishan MRT · NS17 / CC15')
})

test('profile load failure requires retry before editing saved answers', async ({ page }) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  state.failLoad = true
  await page.goto('/onboarding')
  await expect(page.getByTestId('onboarding-load-error')).toBeVisible()
  await expect(page.getByTestId('onboarding-next')).toHaveCount(0)
  state.failLoad = false
  await page.getByTestId('onboarding-load-retry').click()
  await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('mrt-marker-tampines')).toHaveAttribute('aria-pressed', 'true')
  expect(state.saves).toHaveLength(0)
})

test('missing map image still allows choosing and saving a home area', async ({ page }) => {
  const state = await mockPreferences(page)
  await page.route('**/images/mrt-map.svg', (route) => route.abort())
  await openLocationStep(page)
  await expect(page.getByTestId('mrt-map-error')).toBeVisible()
  await page.getByTestId('home-area').selectOption('Bishan')
  await finishOnboarding(page)
  await expect(page.getByTestId('summary-area')).toHaveText('Bishan')
  expect(state.saves[0].body).toMatchObject({ home_station_id: null, home_area: 'Bishan' })
})

for (const [width, zoom] of [375, 1280].flatMap((width) =>
  [0.25, 0.5, 0.75, 1].map((zoom) => [width, zoom]),
)) {
  test(`map stations work at ${zoom * 100}% with aligned targets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await mockPreferences(page)
    await openLocationStep(page)
    await expect(page.getByTestId('mrt-map-image')).toBeVisible()
    await expect(page.getByTestId('mrt-zoom-level')).toHaveText('25%')
    await expect(page.getByTestId('mrt-zoom-out')).toBeDisabled()
    const zoomButton = await page.getByTestId('mrt-zoom-in').boundingBox()
    expect(zoomButton.width).toBeGreaterThanOrEqual(44)
    expect(zoomButton.height).toBeGreaterThanOrEqual(44)
    for (let current = 0.25; current < zoom; current += 0.25) {
      await page.getByTestId('mrt-zoom-in').click()
    }
    await expect(page.getByTestId('mrt-zoom-level')).toHaveText(Math.round(zoom * 100) + '%')
    await expect(page.getByTestId('mrt-marker-clarke-quay')).toBeEnabled()
    await pickMapStation(page, 'clarke-quay')
    await expect(page.getByTestId('mrt-marker-clarke-quay')).toHaveAttribute('aria-pressed', 'true')
    const geometry = await page.getByTestId('mrt-map-canvas').evaluate((canvas) => {
      const map = canvas.getBoundingClientRect()
      const image = canvas.querySelector('img').getBoundingClientRect()
      const marker = canvas
        .querySelector('[data-testid="mrt-marker-clarke-quay"]')
        .getBoundingClientRect()
      const neighbouring = canvas
        .querySelector('[data-testid="mrt-marker-fort-canning"]')
        .getBoundingClientRect()
      return {
        width: map.width,
        viewportWidth: canvas.parentElement.clientWidth,
        imageWidth: image.width,
        imageHeight: image.height,
        mapHeight: map.height,
        x: (marker.x + marker.width / 2 - map.x) / map.width,
        y: (marker.y + marker.height / 2 - map.y) / map.height,
        markerWidth: marker.width,
        overlap:
          marker.left < neighbouring.right &&
          marker.right > neighbouring.left &&
          marker.top < neighbouring.bottom &&
          marker.bottom > neighbouring.top,
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    expect(geometry.width).toBe(Math.max(3600 * zoom, geometry.viewportWidth))
    expect(geometry.imageWidth).toBe(geometry.width)
    expect(geometry.imageHeight).toBeCloseTo(geometry.mapHeight, 1)
    expect(Math.abs(geometry.x - 723.5 / 1410) * geometry.width).toBeLessThan(0.1)
    expect(Math.abs(geometry.y - 724.5 / 1007) * geometry.mapHeight).toBeLessThan(0.1)
    expect(geometry.markerWidth).toBe(48 * zoom)
    expect(geometry.overlap).toBe(false)
    expect(geometry.pageOverflow).toBe(false)
    await pickMapStation(page, 'fort-canning')
    await expect(page.getByTestId('mrt-marker-fort-canning')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.screenshot({
      path: test.info().outputPath(`mrt-${width}-${zoom * 100}.png`),
      fullPage: true,
    })
    for (let current = zoom; current < 1; current += 0.25) {
      await page.getByTestId('mrt-zoom-in').click()
    }
    await expect(page.getByTestId('mrt-zoom-in')).toBeDisabled()
    await page.getByTestId('mrt-zoom-out').click()
    await expect(page.getByTestId('mrt-zoom-level')).toHaveText('75%')
    await page.getByTestId('mrt-zoom-out').click()
    await expect(page.getByTestId('mrt-zoom-level')).toHaveText('50%')
    await page.getByTestId('mrt-zoom-out').click()
    await expect(page.getByTestId('mrt-zoom-level')).toHaveText('25%')
    await expect(page.getByTestId('mrt-zoom-out')).toBeDisabled()
    await expect(page.getByTestId('mrt-marker-fort-canning')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
}
