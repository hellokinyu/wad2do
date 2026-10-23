import { test, expect } from '@playwright/test'
import { authStorageKey, mockSession, mockUser } from './helpers/auth'

const authHeaders = {
  'X-Supabase-Api-Version': '2024-01-01',
  'Access-Control-Expose-Headers': 'X-Supabase-Api-Version',
}

test.beforeEach(async ({ page }) => {
  // Home page images should not make authentication tests depend on Unsplash.
  await page.route('https://images.unsplash.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    }),
  )
})

async function mockBackend(page) {
  const state = { requests: [], loginError: null, signupError: null, logoutError: null }
  await page.route('**/auth/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    state.requests.push({ path: url.pathname, body: request.postDataJSON(), url: request.url() })
    if (url.pathname.endsWith('/token')) {
      return state.loginError
        ? route.fulfill({ status: 400, headers: authHeaders, json: state.loginError })
        : route.fulfill({ json: mockSession })
    }
    if (url.pathname.endsWith('/signup')) {
      return state.signupError
        ? route.fulfill({ status: 422, headers: authHeaders, json: state.signupError })
        : route.fulfill({ json: { ...mockUser, identities: [] } })
    }
    if (url.pathname.endsWith('/logout')) {
      return state.logoutError
        ? route.fulfill({ status: 400, headers: authHeaders, json: state.logoutError })
        : route.fulfill({ status: 204 })
    }
    if (url.pathname.endsWith('/resend')) return route.fulfill({ json: {} })
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: mockUser })
    return route.fulfill({ status: 400, json: { message: 'Unexpected mock auth request' } })
  })
  await page.route('**/rest/v1/**', (route) => {
    const isProfile = new URL(route.request().url()).pathname.endsWith('/profiles')
    return route.fulfill({
      json: isProfile ? [{ id: mockUser.id, display_name: 'Demo User' }] : [],
    })
  })
  return state
}

async function fillLogin(page) {
  await page.getByTestId('login-email').fill(mockUser.email)
  await page.getByTestId('login-password').fill('DemoPassword123!')
}

async function fillSignup(page, confirmation = 'DemoPassword123!') {
  await page.getByTestId('signup-email').fill(mockUser.email)
  await page.getByTestId('signup-password').fill('DemoPassword123!')
  await page.getByTestId('signup-confirm-password').fill(confirmation)
}

test('signup requests email confirmation without creating an authenticated session', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/signup')
  await fillSignup(page)
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('signup-message')).toContainText('confirmation email')
  await expect(page).toHaveURL('/signup')
  expect(state.requests[0].body.email).toBe(mockUser.email)
  expect(state.requests[0].body.password).toBe('DemoPassword123!')
  expect(new URL(state.requests[0].url).searchParams.get('redirect_to')).toMatch(/\/onboarding$/)
  expect(await page.evaluate((key) => localStorage.getItem(key), authStorageKey())).toBeNull()
  await page.goto('/profile')
  await expect(page).toHaveURL('/login')
})

test('mismatched passwords do not send a signup request', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/signup')
  await fillSignup(page, 'DifferentPassword123!')
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('signup-error')).toHaveText('Your passwords do not match.')
  expect(state.requests).toHaveLength(0)
})

test('signup displays errors returned by Supabase', async ({ page }) => {
  const state = await mockBackend(page)
  state.signupError = { code: 'weak_password', message: 'Password must contain a number.' }
  await page.goto('/signup')
  await fillSignup(page)
  await page.getByTestId('signup-submit').click()
  await expect(page.getByTestId('signup-error')).toContainText('Password must contain a number.')
  await expect(page.getByTestId('signup-submit')).toBeEnabled()
})

test('login persists across refresh and redirects signed-in users away from auth forms', async ({
  page,
}) => {
  const state = await mockBackend(page)
  await page.goto('/login')
  await fillLogin(page)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: 'Explore activities' })).toBeVisible()
  expect(state.requests[0].body).toMatchObject({
    email: mockUser.email,
    password: 'DemoPassword123!',
  })
  expect(new URL(state.requests[0].url).searchParams.get('grant_type')).toBe('password')
  await page.goto('/profile')
  await expect(page.getByTestId('profile-email')).toHaveText(mockUser.email)
  await page.reload()
  await expect(page).toHaveURL('/profile')
  await expect(page.getByTestId('profile-email')).toHaveText(mockUser.email)
  await page.goto('/login')
  await expect(page).toHaveURL('/')
  await page.goto('/signup')
  await expect(page).toHaveURL('/')
  expect(state.requests.filter((request) => request.path.endsWith('/token'))).toHaveLength(1)
})

for (const [code, text] of [
  ['invalid_credentials', 'email or password is incorrect'],
  ['email_not_confirmed', 'confirm your email'],
]) {
  test('login handles ' + code, async ({ page }) => {
    const state = await mockBackend(page)
    state.loginError = { code, message: 'Supabase authentication error' }
    await page.goto('/login')
    await fillLogin(page)
    await page.getByTestId('login-submit').click()
    await expect(page.getByTestId('login-error')).toContainText(text)
    await expect(page).toHaveURL('/login')
    await expect(page.getByTestId('login-submit')).toBeEnabled()
  })
}

test('login handles connection failures', async ({ page }) => {
  await mockBackend(page)
  await page.route('**/auth/v1/token*', (route) => route.abort('failed'))
  await page.goto('/login')
  await fillLogin(page)
  await page.getByTestId('login-submit').click()
  await expect(page.getByTestId('login-error')).toContainText('check your internet connection')
  await expect(page.getByTestId('login-submit')).toBeEnabled()
})

test('expired confirmation links display an error and can be resent', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto(
    '/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  )
  await expect(page.getByTestId('login-error')).toContainText('invalid or has expired')
  await page.getByTestId('login-email').fill(mockUser.email)
  await page.getByTestId('resend-confirmation').click()
  await expect(page.getByTestId('login-message')).toContainText('check your inbox')
  const request = state.requests.find((request) => request.path.endsWith('/resend'))
  expect(request.body).toMatchObject({ type: 'signup', email: mockUser.email })
})

test('successful confirmation links establish a session and redirect home', async ({ page }) => {
  await mockBackend(page)
  const hash = new URLSearchParams({
    access_token: mockSession.access_token,
    refresh_token: mockSession.refresh_token,
    expires_in: '3600',
    token_type: 'bearer',
    type: 'signup',
  })
  await page.goto('/login#' + hash)
  await expect(page).toHaveURL('/')
  await page.goto('/profile')
  await expect(page.getByTestId('profile-email')).toHaveText(mockUser.email)
})

test('an expired saved session is refreshed before opening a protected page', async ({ page }) => {
  const state = await mockBackend(page)
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
    },
    { key: authStorageKey(), session: { ...mockSession, expires_at: 1 } },
  )
  await page.goto('/profile')
  await expect(page.getByTestId('profile-email')).toHaveText(mockUser.email)
  const request = state.requests.find((request) => request.path.endsWith('/token'))
  expect(new URL(request.url).searchParams.get('grant_type')).toBe('refresh_token')
  expect(request.body.refresh_token).toBe(mockSession.refresh_token)
})

test('an invalid saved refresh token sends the user back to login', async ({ page }) => {
  const state = await mockBackend(page)
  state.loginError = { code: 'refresh_token_not_found', message: 'Refresh token is invalid' }
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
    },
    { key: authStorageKey(), session: { ...mockSession, expires_at: 1 } },
  )
  await page.goto('/profile')
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate((key) => localStorage.getItem(key), authStorageKey())).toBeNull()
})

test('logout clears the session and redirects another open protected tab', async ({
  page,
  context,
}) => {
  await mockBackend(page)
  await page.goto('/login')
  await fillLogin(page)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('/')
  await page.goto('/profile')
  const otherTab = await context.newPage()
  await mockBackend(otherTab)
  await otherTab.goto('/profile')
  await expect(otherTab.getByTestId('profile-email')).toHaveText(mockUser.email)
  await page.getByTestId('profile-logout').click()
  await expect(page).toHaveURL('/login')
  await expect(otherTab).toHaveURL('/login')
  expect(await page.evaluate((key) => localStorage.getItem(key), authStorageKey())).toBeNull()
  await page.goto('/profile')
  await expect(page).toHaveURL('/login')
})

test('logout errors stay visible when Supabase clears the local session', async ({ page }) => {
  const state = await mockBackend(page)
  state.logoutError = {
    code: 'unexpected_failure',
    message: 'Could not log out. Please try again.',
  }
  await page.goto('/login')
  await fillLogin(page)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('/')
  await page.goto('/profile')
  await page.getByTestId('profile-logout').click()
  await expect(page).toHaveURL('/login')
  await expect(page.getByTestId('login-error')).toContainText('Could not log out')
  await expect(page.getByTestId('login-error')).toContainText('logged out on this browser')
  expect(await page.evaluate((key) => localStorage.getItem(key), authStorageKey())).toBeNull()
})

test('an unavailable profile displays a clear message without inserting a row', async ({
  page,
}) => {
  await mockBackend(page)
  const methods = []
  await page.route('**/rest/v1/profiles*', (route) => {
    methods.push(route.request().method())
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await fillLogin(page)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL('/')
  await page.goto('/profile')
  await expect(page.getByTestId('profile-error')).toContainText('contact the WAD2Do team')
  await expect(page.getByTestId('profile-edit-name')).toBeDisabled()
  await page.getByText('Food', { exact: true }).click()
  await expect(page.getByTestId('profile-save-prefs')).toBeDisabled()
  // Navigation also reads is_admin. Every profile request must still be read-only.
  expect(methods.length).toBeGreaterThan(0)
  expect(methods.every((method) => method === 'GET')).toBe(true)
})

for (const path of [
  '/onboarding',
  '/activities',
  '/activities/submit',
  '/activities/example',
  '/groups',
  '/groups/example/availability',
  '/groups/example/itinerary',
  '/profile',
  '/admin/submissions',
]) {
  test('signed-out visitors to ' + path + ' are redirected to login', async ({ page }) => {
    await mockBackend(page)
    await page.goto(path)
    await expect(page).toHaveURL('/login')
    await expect(page.getByTestId('login-page')).toBeVisible()
  })
}
