import { test, expect } from '@playwright/test'
import { signInMockUser } from './helpers/auth'

test('landing page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('landing-page')).toBeVisible()
  await expect(page.getByTestId('nav-activities')).toHaveCount(0)
})

test('navbar goes to the Activities page', async ({ page }) => {
  await signInMockUser(page)
  await page.route('**/rest/v1/activities*', (route) => route.fulfill({ json: [] }))
  // The landing page hides the app navbar; navigate from a page that shows it.
  await page.goto('/activities')
  await page.getByTestId('nav-activities').click()
  await expect(page.getByTestId('activities-page')).toBeVisible()
})
