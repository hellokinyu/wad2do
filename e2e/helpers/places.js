export const placeCandidates = [
  {
    id: 'ChIJ_studio_one',
    name: 'Google studio one',
    address: '1 Studio Road, Singapore 012345',
    attributions: [{ provider: 'Example provider', providerUri: 'https://example.com/provider' }],
  },
  {
    id: 'ChIJ_studio_two',
    name: 'Google studio two',
    address: '2 Studio Road, Singapore 012345',
    attributions: [],
  },
]

export async function mockPlaceSearch(page, options = {}) {
  const state = { requests: [] }
  await page.route('**/functions/v1/google-place-search', async (route) => {
    state.requests.push(route.request().postDataJSON())
    if (options.stall) return
    return route.fulfill({
      status: options.status || 200,
      json: options.error
        ? { error: options.error }
        : { candidates: options.candidates ?? placeCandidates },
    })
  })
  return state
}
