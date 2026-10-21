import { loadEnv } from 'vite'
import process from 'node:process'
import { Buffer } from 'node:buffer'

export const mockUser = {
  id: '5adbd3ea-5d05-4301-a4e9-1da90d4bcd6c',
  email: 'demo@example.com',
  aud: 'authenticated',
  role: 'authenticated',
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

export async function signInMockUser(page) {
  // Fake credentials are used only with intercepted Supabase endpoints.
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value))
    },
    { key: authStorageKey(), value: mockSession },
  )
  await page.route('**/auth/v1/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/user')) {
      return route.fulfill({ json: mockUser })
    }
    return route.fulfill({ status: 400, json: { message: 'Unexpected mock auth request' } })
  })
}
