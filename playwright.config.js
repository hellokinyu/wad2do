import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry once locally too. With three browsers in parallel, a busy laptop can make a
     timing-sensitive test miss once; a retry that passes is reported as "flaky", not hidden. */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    /* Maximum time each action such as `click()` can take. Defaults to 0 (no limit). */
    actionTimeout: 0,
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Always headless. Visible windows running side by side get throttled by the browser
       when covered, so the page's looping animations never look "stable" and clicks time
       out. Pass --headed to watch a test run. */
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: use an installed Chrome/Edge instead of downloading Chromium.
        channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    /**
     * Use the dev server by default for faster feedback loop.
     * Use the preview server on CI for more realistic testing.
     * Playwright will re-use the local server if there is already a dev-server running.
     */
    command: process.env.CI ? 'pnpm run preview' : 'pnpm run dev',
    port: process.env.CI ? 4173 : 5173,
    reuseExistingServer: !process.env.CI,
  },
})
