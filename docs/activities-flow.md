# Brendan's Activities code and flow

## What each file does

| File                                     | Responsibility                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `src/views/ActivitiesView.vue`           | Fetch the catalogue, keep search/filter choices, and display the matching cards. |
| `src/components/ActivityCard.vue`        | Display one activity and link to its detail page.                                |
| `src/views/ActivityDetailView.vue`       | Read the ID from the URL, fetch that activity, and display its full information. |
| `src/lib/activityDisplay.js`             | Shared formatting for price, duration, setting, hours, rating and location.      |
| `src/lib/activityRanking.js`             | Score saved interests, affordability and area matches; sort by highest score.    |
| `src/composables/useActivityActions.js`  | Handle saved status, Save and Detail feedback.                                   |
| `src/components/ActivityShareDialog.vue` | Share one activity to one or more groups from either page.                       |
| `src/lib/activityFavourites.js`          | Read and apply the intended saved state for both the grid and detail page.       |

A composable is an ordinary function that uses Vue's `ref` and `watch`. Keeping the action code in one file makes the detail page easier to read.

## How browsing works

1. Opening Activities calls `loadActivities()` once. It reads Supabase in batches of 200 until the catalogue is loaded, so search includes every record.
2. `v-model` updates the search and filter variables when the user changes them.
3. `filteredActivities`, a computed property, combines category, area, price, setting and keyword filters, then defaults to Best match using the signed-in user's saved interests, budget and home area. Catalogue order and numeric price sorts remain available. Unknown prices stay last in either price sort.
4. `v-for` displays one ActivityCard per matching record. The category chips and dropdown use the same variable.
5. A card's photo or name links to `/activities/:id`. The detail page uses that ID to fetch one record.
6. Back returns to the previous route. Activities restores the filters saved in this tab's `sessionStorage`.

Area options come from the catalogue. Price bands distinguish Free from unknown prices; the under-S$20 band also includes free activities. Clear filters resets all selections and restores Best match. Cards show the activity's `description` below the price when available. The detail page shows `price_note` beside the price to explain package/day/residency conditions. See [Activity prices and areas](activity-prices.md) for all 34 locations, source links and the Supabase enrichment script.

## How Save and Share work

- Save checks the authenticated user, then applies the intention shown by the heart: an empty heart saves; a filled heart removes. Both the grid and detail page use the same helper. The heart changes only after a successful write or a read-back confirms the intended state. Lost-response retries repeat the same action; duplicate saves and already-removed favourites succeed only after confirmation. Failed confirmation preserves the displayed state for another retry.
- Activity cards load the user's favourite IDs once for the grid. Each heart has its own pending state, so other cards stay usable during a save. A failed initial read disables saving until Retry succeeds; failed writes preserve the last confirmed heart state. Favourite IDs survive filtering and pagination, and are refreshed on return from Detail or Profile.
- Share opens one native dialog per page, showing the activity name and a checkbox for each of the user's groups. Memberships and group names load only when opened and refresh on each opening. Select one or more groups, then press **Share to N groups**. Each selected group gets a separate `group_activities` insert with the authenticated user's ID as `shared_by`; unselected groups are untouched.
- A signed-out user sees a Log in link. Failures show a message and allow another attempt.
- Request numbers prevent a slow, old database response from replacing newer screen state. Buttons are disabled while a write is running to prevent repeated clicks.

The reusable card emits Save/Share events. Activities handles Save and displays an always-visible white outline heart on each card. The button has a transparent background, a shadow around the icon for contrast, and a 44 × 44 px tap target. A faint dark circle appears on hover or keyboard focus, and saved hearts are filled red. An always-visible Share icon sits 8 px below the heart, with its own 44 × 44 px tap target. It opens the same picker as Activity Detail without changing filters, pagination or scroll position. Sharing stays available if favourite loading fails. Success messages wrap long group names and disappear after three seconds; failed writes show an error and allow another click to retry.

`e2e/activity-favourites.spec.js` covers card saves/removals, pagination, reloads, Detail and Profile integration, failed reads/writes, zero-row deletes, duplicate saves, repeated clicks, account-check failures, keyboard interaction and touchscreens. Lost-response tests cover successful read-back and safe retries after failed confirmation on both cards and Detail, plus stale hearts after another tab changes a favourite. These tests mock Supabase; live owner-only policies and the unique `(user_id, activity_id)` pair remain database integration checks.

## Multi-group sharing (29 Oct 2026)

`ActivityShareDialog.vue` owns the picker and all sharing requests. Pages supply the selected activity and receive close/success events; cards only emit the activity ID. No new dependencies, schema changes or provider calls are needed. Existing member-only RLS and `shared_by = auth.uid()` remain the write boundary, and the group's existing Realtime subscription picks up inserts.

- Select groups explicitly on each opening; the selection starts empty. Completed groups are checked and locked after partial success. Failed groups stay selected and retryable; the next submission only writes unfinished selections. Each row reports Shared, Already shared, or Failed. Successful writes are never rolled back because another group fails.
- Use plain inserts, never upsert: the original sharer and votes must survive duplicates. A `23505` result is only treated as Already shared after reading back the exact group/activity pair. A lost insert response may leave a stored row; retrying safely confirms it as already shared. Failed read-back remains an error.
- Resolve the authenticated user when loading groups and again before submitting, and require the same account as when the dialog opened. An account change closes the picker. The existing 15-second request helper bounds authentication/group loading and submission requests. Closing cancels loads, navigation cancels pending work, and request numbers prevent stale results changing a newer activity. Cancellation cannot undo an insert already committed by the server.
- While submitting, lock selection, confirmation and dismissal to prevent duplicate clicks. With partial failure, keep the dialog open and show an inline error; completed rows remain visible. With full success, close and announce both new shares and duplicates for three seconds. No groups offers the existing Create a new group link; load failures offer Try again, and expired login offers Log in.
- Native dialog focus handling supports keyboard navigation; Escape closes when not submitting. Closing restores the initiating button, with the results count as fallback if that card disappeared. After a failed submission, focus returns to the re-enabled Close button so Safari keyboard users can reach Retry or Log in. Each group label is at least 48 px high; the dialog fits narrow screens and scrolls vertically.

`e2e/activity-sharing.spec.js` mocks Supabase and covers grid/detail multi-group selection, correct activity and account IDs, partial retry, duplicate confirmation and ownership preservation, lost-response retries, loading/empty/login failures, repeated clicks, stale loads, request deadlines, focus (including keyboard retry after failure), long group names in both phone toasts, mobile targets and browsing-state preservation. Existing browsing, Detail and favourite suites also cover regressions. Real account permissions and cross-client Realtime delivery remain separate live integration checks.

### Verification — 29 Oct 2026

- Sharing suite after audit fixes 1 and 2: 16 tests each in Chromium, Firefox and WebKit (48 passed), including mobile taps and keyboard focus.
- Browsing, Activity Detail and favourites regressions: 53 passed in Chromium.
- ESLint, Oxlint and production build passed. Vite reports its bundle-size advisory.
- Screenshots checked for the card icon placement and phone picker. Supabase calls are mocked; live account permissions and cross-client Realtime were not exercised.

```sh
pnpm exec playwright test e2e/activity-sharing.spec.js --project=chromium --project=firefox --project=webkit --workers=3
pnpm exec playwright test e2e/activities.spec.js e2e/activity-detail.spec.js e2e/activity-favourites.spec.js --project=chromium --workers=2
pnpm run build
```

## What to explain in the demo

“I fetch the activities from Supabase and store them in a ref. Search and filters update through v-model, and a computed property selects the cards to display. Clicking a card passes its ID through the route, so the detail page fetches the right activity. Both pages use the same formatting helpers. Save and Share write to separate tables for the signed-in user.”

## Remaining work for the full specification

- Verify Save/Share with real accounts and database policies, including delivery to another member's open shortlist through Realtime.
- Add the missing description/hours data; connect live provider details for ratings and official websites where needed.

The E2E tests use mocked Supabase responses. They check the browsing and action flows without modifying the real database.
