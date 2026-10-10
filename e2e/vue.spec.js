import { test, expect } from '@playwright/test'

test('landing page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('landing-page')).toBeVisible()
})

test('navbar goes to the Activities page', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('nav-activities').click()
  await expect(page.getByTestId('activities-page')).toBeVisible()
})