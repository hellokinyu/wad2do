import { test, expect } from '@playwright/test'
import { mockUser } from './helpers/auth'
import {
  finishOnboarding,
  mockPreferences,
  openLocationStep,
  pickMapStation,
} from './helpers/preferences'

test('map selection saves both fields and reloads with the station still picked', async ({
  page,
}) => {
  const state = await mockPreferences(page)
  await openLocationStep(page)
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await expect(page.getByTestId('mrt-search')).toBeVisible()
  await expect(page.getByTestId('onboarding-footer-hint')).toHaveText(
    'Pick a station or an area to continue.',
  )
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

test('Skip moves on without throwing away what was already picked', async ({ page }) => {
  const state = await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await page.goto('/onboarding')
  await page.getByTestId('onboarding-skip').click()
  await page.getByTestId('onboarding-skip').click()
  await page.getByTestId('onboarding-skip').click()
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('summary-area')).toHaveText('Tampines MRT · EW2 / DT32')
  await expect(page.getByTestId('summary-interests')).toContainText('Food')
  expect(state.saves[0].body).toMatchObject({
    home_station_id: 'tampines',
    home_area: 'Tampines',
    budget: '20-50',
    interests: ['Food', 'Cafes', 'Outdoors'],
  })
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
  const marker = page.getByTestId('mrt-marker-sembawang')
  await expect(marker).toBeFocused()
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await marker.press('Enter')
  await expect(marker).toHaveAttribute('aria-pressed', 'true')
  await expect(marker).toBeFocused()
  await expect(page.getByTestId('home-area')).toHaveValue('Sembawang')
  await expect(page.getByTestId('onboarding-step-area')).toBeVisible()
  const focused = []
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    focused.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
  }
  expect(focused).toContain('onboarding-next')
  expect(focused.some((id) => id?.startsWith('mrt-marker-'))).toBe(false)
})

for (const [route, openPage] of [
  ['/onboarding', openLocationStep],
  ['/profile', (page) => page.goto('/profile')],
]) {
  test(`arrow keys move around Jurong East without changing selection until Enter on ${route}`, async ({
    page,
  }) => {
    const state = await mockPreferences(page, {
      home_station_id: 'jurong-east',
      home_area: 'Jurong East',
    })
    await openPage(page)
    await page.getByTestId('mrt-map-viewport').focus()
    for (const [key, station] of [
      ['ArrowRight', 'clementi'],
      ['ArrowLeft', 'jurong-east'],
      ['ArrowUp', 'bukit-batok'],
      ['ArrowDown', 'jurong-east'],
      ['ArrowLeft', 'chinese-garden'],
    ]) {
      await page.keyboard.press(key)
      await expect(page.getByTestId('mrt-marker-' + station)).toBeFocused()
      await expect(page.getByTestId('mrt-marker-jurong-east')).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
    expect(state.saves).toHaveLength(0)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('mrt-marker-chinese-garden')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByTestId('mrt-confirmation')).toContainText('Chinese Garden MRT')
  })
}

test('failed onboarding save preserves the selected station for retry', async ({ page }) => {
  const state = await mockPreferences(page)
  state.failSave = true
  await openLocationStep(page)
  await pickMapStation(page, 'bishan')
  await finishOnboarding(page)
  await expect(page.getByTestId('onboarding-error')).toBeVisible()
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
    // Starts at half size, where labels are readable and markers are 24px
    await expect(page.getByTestId('mrt-zoom')).toHaveAttribute('data-zoom', '50')
    await expect(page.getByTestId('mrt-zoom-level')).toHaveText('50%')
    for (const control of ['mrt-zoom-in', 'mrt-zoom-out']) {
      const box = await page.getByTestId(control).boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    for (let current = 0.5; current !== zoom; current += zoom > current ? 0.25 : -0.25) {
      await page.getByTestId(zoom > current ? 'mrt-zoom-in' : 'mrt-zoom-out').click()
    }
    await expect(page.getByTestId('mrt-zoom')).toHaveAttribute(
      'data-zoom',
      String(Math.round(zoom * 100)),
    )
    await expect(page.getByTestId('mrt-zoom-level')).toHaveText(Math.round(zoom * 100) + '%')
    await expect(page.getByTestId('mrt-zoom-in')).toBeEnabled({ enabled: zoom < 1 })
    await expect(page.getByTestId('mrt-zoom-out')).toBeEnabled({ enabled: zoom > 0.25 })
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
    // The picked station is named above the map
    await expect(page.getByTestId('mrt-confirmation')).toContainText('Fort Canning MRT')
    await page.screenshot({
      path: test.info().outputPath(`mrt-${width}-${zoom * 100}.png`),
      fullPage: true,
    })
  })
}

test('search finds a station by name, code or LRT stop and shows it on the map', async ({
  page,
}) => {
  const state = await mockPreferences(page)
  await openLocationStep(page)
  const search = page.getByTestId('mrt-search')
  await search.fill('EW2')
  await expect(page.getByTestId('mrt-search-option').first()).toContainText('Tampines')
  await search.press('Enter')
  await expect(page.getByTestId('mrt-marker-tampines')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('mrt-confirmation')).toContainText('Tampines MRT · EW2 / DT32')
  await expect(search).toHaveValue('')
  // The map scrolled so the station sits inside the visible part of the map
  const inside = await page.getByTestId('mrt-map-viewport').evaluate((element) => {
    const box = element.getBoundingClientRect()
    const marker = element
      .querySelector('[data-testid="mrt-marker-tampines"]')
      .getBoundingClientRect()
    return (
      marker.left >= box.left &&
      marker.right <= box.right &&
      marker.top >= box.top &&
      marker.bottom <= box.bottom
    )
  })
  expect(inside).toBe(true)

  // LRT stops can't be picked on the map, so search uses the MRT station their line joins
  await search.fill('cheng lim')
  await expect(page.getByTestId('mrt-search-option')).toHaveText([
    /Cheng Lim LRT\s*Uses Sengkang MRT/,
  ])
  await page.getByTestId('mrt-search-option').click()
  await expect(page.getByTestId('mrt-marker-sengkang')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('home-area')).toHaveValue('Sengkang')

  await search.fill('Atlantis')
  await expect(page.getByTestId('mrt-search-empty')).toContainText('No station called “Atlantis”')
  expect(state.saves).toHaveLength(0)
})

test('a tap near a station picks the closest one, and picking never jumps the map', async ({
  page,
}) => {
  await mockPreferences(page)
  await openLocationStep(page)
  const viewport = page.getByTestId('mrt-map-viewport')
  const marker = page.getByTestId('mrt-marker-bishan')
  await marker.scrollIntoViewIfNeeded()
  const box = await marker.boundingBox()
  const before = await viewport.evaluate((element) => [element.scrollLeft, element.scrollTop])
  // 15px off-centre is outside the 24px marker but inside the 44px tap area
  await page.mouse.click(box.x + box.width / 2 + 15, box.y + box.height / 2)
  await expect(marker).toHaveAttribute('aria-pressed', 'true')
  expect(await viewport.evaluate((element) => [element.scrollLeft, element.scrollTop])).toEqual(
    before,
  )
})

test('each step moves focus to its heading and the navbar is off until onboarding is done', async ({
  page,
}) => {
  // A brand-new account, so onboarding is still owed
  await mockPreferences(page, {}, { user_metadata: {} })
  await page.goto('/onboarding')
  await expect(page.locator('nav .navbar-nav')).toHaveAttribute('inert')
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('budget')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.getByTestId('onboarding-back').click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('love')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
})

test('the finish screen previews the first matched hangouts', async ({ page }) => {
  await mockPreferences(page, { home_station_id: 'tampines', home_area: 'Tampines' })
  await page.route('**/rest/v1/activities?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'a1',
          name: 'Hawker trail',
          category: 'Food',
          area: 'Tampines',
          price_per_person: 12,
        },
        {
          id: 'a2',
          name: 'Opera night',
          category: 'Nightlife',
          area: 'Orchard',
          price_per_person: 80,
        },
        { id: 'a3', name: 'Park walk', category: 'Outdoors', area: 'Bedok', price_per_person: 0 },
      ],
    }),
  )
  await openLocationStep(page)
  await finishOnboarding(page)
  const matches = page.getByTestId('onboarding-matches')
  await expect(matches.getByRole('link')).toHaveText(['Hawker trail', 'Park walk'])
  await expect(matches).toContainText('Tampines · S$12')
})

test('a ?navTheme preview survives onboarding taking over the page', async ({ page }) => {
  await mockPreferences(page, {}, { user_metadata: {} })
  await page.goto('/onboarding?navTheme=light')
  await expect(page.getByTestId('onboarding-next')).toBeVisible()
  await expect(page).toHaveURL(/\/onboarding\?navTheme=light$/)
  await page.goto('/activities?navTheme=dark')
  await expect(page).toHaveURL(/\/onboarding\?navTheme=dark$/)
})
