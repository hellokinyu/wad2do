import { test, expect } from '@playwright/test'
import { mockPreferences } from './helpers/preferences'

// Fakes the delete_my_account database function on top of the usual Profile mocks.
async function mockDeleteAccount(page, { failures = 0 } = {}) {
  const state = { calls: 0, failures }
  await page.route('**/rest/v1/rpc/delete_my_account', (route) => {
    state.calls++
    if (state.failures > 0) {
      state.failures--
      return route.fulfill({ status: 500, json: { message: 'Delete failed' } })
    }
    return route.fulfill({ status: 204, body: '' })
  })
  return state
}

test('deleting the account needs DELETE typed, keeps the user on failure, then signs out', async ({
  page,
}) => {
  await mockPreferences(page)
  const state = await mockDeleteAccount(page, { failures: 1 })
  await page.goto('/profile')
  await page.getByTestId('profile-delete-account-open').click()
  const dialog = page.getByTestId('delete-account-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('delete-account-submit')).toBeDisabled()
  await page.getByTestId('delete-account-confirm-input').fill('delet')
  await expect(page.getByTestId('delete-account-submit')).toBeDisabled()
  await page.getByTestId('delete-account-confirm-input').fill('delete')
  await expect(page.getByTestId('delete-account-submit')).toBeEnabled()

  await page.getByTestId('delete-account-submit').click()
  await expect(page.getByTestId('delete-account-error')).toContainText("Couldn't delete your account")
  await expect(page).toHaveURL('/profile')
  await expect(dialog).toBeVisible()

  await page.getByTestId('delete-account-submit').click()
  await expect(page).toHaveURL('/login?deleted=1')
  await expect(page.getByTestId('login-message')).toHaveText('Your account has been deleted.')
  expect(state.calls).toBe(2)
  // This browser's saved login is gone (Supabase keeps it in localStorage under sb-…)
  const savedSessions = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('sb-')),
  )
  expect(savedSessions).toEqual([])
})

test('cancelling the delete dialog keeps the account', async ({ page }) => {
  await mockPreferences(page)
  const state = await mockDeleteAccount(page)
  await page.goto('/profile')
  await page.getByTestId('profile-delete-account-open').click()
  await page.getByTestId('delete-account-confirm-input').fill('DELETE')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('delete-account-dialog')).toBeHidden()
  await expect(page.getByTestId('profile-page')).toBeVisible()
  expect(state.calls).toBe(0)
  // Reopening starts fresh, so the typed confirmation doesn't carry over
  await page.getByTestId('profile-delete-account-open').click()
  await expect(page.getByTestId('delete-account-confirm-input')).toHaveValue('')
  await expect(page.getByTestId('delete-account-submit')).toBeDisabled()
})
