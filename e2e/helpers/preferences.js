import { signInMockUser, mockUser } from './auth'

export async function mockPreferences(page, values = {}) {
  await signInMockUser(page)
  const state = {
    profile: {
      id: mockUser.id,
      display_name: 'Demo User',
      interests: ['Food', 'Cafes', 'Outdoors'],
      budget: '20-50',
      home_area: null,
      home_station_id: null,
      company: ['Friends'],
      ...values,
    },
    saves: [],
    failSave: false,
    failLoad: false,
    saveGate: null,
  }
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.endsWith('/profiles')) return route.fulfill({ json: [] })
    if (request.method() === 'PATCH') {
      state.saves.push({ body: request.postDataJSON(), owner: url.searchParams.get('id') })
      if (state.saveGate) await state.saveGate
      if (state.failSave) return route.fulfill({ json: null })
      Object.assign(state.profile, request.postDataJSON())
    } else if (state.failLoad) {
      return route.fulfill({ status: 500, json: { message: 'Profile unavailable' } })
    }
    return route.fulfill({
      json: request.headers().accept?.includes('vnd.pgrst.object')
        ? state.profile
        : [state.profile],
    })
  })
  return state
}

export async function openLocationStep(page) {
  await page.goto('/onboarding')
  await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-next').click()
}

export async function finishOnboarding(page) {
  await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-next').click()
}

export async function pickMapStation(page, id) {
  await page.getByTestId('mrt-marker-' + id).click()
}
