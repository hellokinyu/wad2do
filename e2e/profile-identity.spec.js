import { test, expect } from '@playwright/test'
import { mockPreferences } from './helpers/preferences'

async function openIdentityStep(page) {
  await page.goto('/onboarding')
  for (let step = 1; step <= 3; step++) {
    await page.getByTestId('onboarding-skip').click()
  }
  await expect(page.getByTestId('onboarding-step-label')).toHaveText('Step 4 of 4')
}

test('name and animal are required, persist, and appear beside Profile', async ({ page }) => {
  const state = await mockPreferences(page, { display_name: null }, { user_metadata: {} })
  await openIdentityStep(page)
  await expect(page.getByTestId('onboarding-skip')).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(5)
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await page.getByTestId('onboarding-name').fill('   ')
  await page.getByTestId('avatar-panda').check()
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await page.getByTestId('onboarding-name').fill('  Alex  ')
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('summary-name')).toHaveText('Alex')
  expect(state.saves[0].body.display_name).toBe('Alex')
  expect(state.auth.updates[0].data).toEqual({ display_name: 'Alex', avatar_animal: 'panda' })
  await expect(page.getByTestId('nav-profile-avatar')).toHaveAttribute('aria-label', 'Panda avatar')
  await page.getByTestId('onboarding-explore').click()
  await expect(page).toHaveURL('/activities')
  await page.getByTestId('nav-profile').click()
  await expect(page.getByTestId('profile-name')).toHaveText('Alex')
  await expect(page.getByTestId('profile-avatar')).toHaveAttribute('aria-label', 'Panda avatar')
  await page.reload()
  await expect(page.getByTestId('nav-profile-avatar')).toHaveAttribute('aria-label', 'Panda avatar')
  await page.goto('/')
  await expect(page).toHaveURL('/activities')
})

test('entering a name alone does not enable Finish', async ({ page }) => {
  await mockPreferences(page, { display_name: null }, { user_metadata: {} })
  await openIdentityStep(page)
  await page.getByTestId('onboarding-name').fill('Alex')
  await expect(page.getByTestId('onboarding-next')).toBeDisabled()
  await page.getByTestId('onboarding-name').press('Enter')
  await expect(page.getByTestId('onboarding-step-identity')).toBeVisible()
  await page.getByTestId('avatar-dog').check()
  await expect(page.getByTestId('onboarding-next')).toBeEnabled()
})

for (const metadata of [
  {},
  { display_name: 'Alex' },
  { display_name: ' ', avatar_animal: 'dog' },
  { display_name: 'Alex', avatar_animal: 'tiger' },
]) {
  test(
    'incomplete identity cannot bypass onboarding: ' + JSON.stringify(metadata),
    async ({ page }) => {
      await mockPreferences(page, {}, { user_metadata: metadata })
      for (const path of ['/activities', '/groups', '/profile', '/', '/login']) {
        await page.goto(path)
        await expect(page).toHaveURL('/onboarding')
      }
    },
  )
}

test('failed profile save does not complete onboarding and preserves the selection for retry', async ({
  page,
}) => {
  const state = await mockPreferences(page, { display_name: null }, { user_metadata: {} })
  state.failSave = true
  await openIdentityStep(page)
  await page.getByTestId('onboarding-name').fill('Alex')
  await page.getByTestId('avatar-duck').check()
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('onboarding-error')).toBeVisible()
  expect(state.auth.updates).toHaveLength(0)
  await expect(page.getByTestId('avatar-duck')).toBeChecked()
  state.failSave = false
  await page.getByTestId('onboarding-error').getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('onboarding-step-done')).toBeVisible()
})

test('failed avatar save keeps onboarding required until retry succeeds', async ({ page }) => {
  const state = await mockPreferences(page, {}, { user_metadata: {} })
  state.auth.failUpdate = true
  await openIdentityStep(page)
  await page.getByTestId('avatar-cat').check()
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('onboarding-error')).toBeVisible()
  await page.goto('/activities')
  await expect(page).toHaveURL('/onboarding')
  state.auth.failUpdate = false
  await openIdentityStep(page)
  await page.getByTestId('avatar-cat').check()
  await page.getByTestId('onboarding-next').click()
  await expect(page.getByTestId('onboarding-step-done')).toBeVisible()
})

test('profile picture changes update the navbar and survive refresh', async ({ page }) => {
  await mockPreferences(page)
  await page.goto('/profile')
  await expect(page.getByTestId('nav-profile-avatar')).toHaveAttribute('aria-label', 'Dog avatar')
  await page.getByTestId('profile-edit-avatar').click()
  await page.getByTestId('avatar-goldfish').check()
  await page.getByTestId('profile-save-avatar').click()
  await expect(page.getByTestId('nav-profile-avatar')).toHaveAttribute(
    'aria-label',
    'Goldfish avatar',
  )
  await page.reload()
  await expect(page.getByTestId('profile-avatar')).toHaveAttribute('aria-label', 'Goldfish avatar')
})

test('navbar logo and final onboarding step fit on mobile and desktop', async ({ page }) => {
  await mockPreferences(page)
  await openIdentityStep(page)
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    // Phones use the bottom nav, which has no logo
    await expect(page.getByRole('img', { name: 'WAD2Do', exact: true })).toBeVisible({
      visible: width >= 768,
    })
    await expect(page.getByRole('radio', { name: 'Goldfish' })).toBeAttached()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false)
    await page.screenshot({
      path: test.info().outputPath(`profile-identity-${width}.png`),
      fullPage: true,
    })
  }
})
