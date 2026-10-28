import { loadEnv } from 'vite'
import process from 'node:process'
import { Buffer } from 'node:buffer'

export const mockUser = {
  id: '5adbd3ea-5d05-4301-a4e9-1da90d4bcd6c',
  email: 'demo@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  user_metadata: { display_name: 'Demo User', avatar_animal: 'dog' },
}

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
export const mockSession = {
  access_token: [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ sub: mockUser.id, aud: 'authenticated', role: 'authenticated', exp: 4102444800 }),
    'test-signature',
  ].join('.'),
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_at: 4102444800,
  expires_in: 3600,
  user: mockUser,
}

export function authStorageKey() {
  const url = loadEnv('test', process.cwd()).VITE_SUPABASE_URL
  return 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token'
}

export async function signInMockUser(page, userOverrides = {}) {
  const state = { user: { ...mockUser, ...userOverrides }, updates: [], failUpdate: false }
  // Fake credentials are used only with intercepted Supabase endpoints.
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value))
    },
    { key: authStorageKey(), value: { ...mockSession, user: state.user } },
  )
  await page.route('**/auth/v1/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/user')) {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON()
        state.updates.push(body)
        if (state.failUpdate) {
          return route.fulfill({ status: 500, json: { message: 'Could not save account details' } })
        }
        state.user = { ...state.user, user_metadata: { ...state.user.user_metadata, ...body.data } }
      }
      return route.fulfill({ json: state.user })
    }
    return route.fulfill({ status: 400, json: { message: 'Unexpected mock auth request' } })
  })
  return state
}
