# Brendan's Activities code and flow

## What each file does

| File                                    | Responsibility                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `src/views/ActivitiesView.vue`          | Fetch the catalogue, keep search/filter choices, and display the matching cards. |
| `src/components/ActivityCard.vue`       | Display one activity and link to its detail page.                                |
| `src/views/ActivityDetailView.vue`      | Read the ID from the URL, fetch that activity, and display its full information. |
| `src/lib/activityDisplay.js`            | Shared formatting for price, duration, setting, hours, rating and location.      |
| `src/lib/activityRanking.js`            | Score saved interests, affordability and area matches; sort by highest score.   |
| `src/composables/useActivityActions.js` | Handle saved status, Save, the group picker and Share.                           |
| `src/lib/activityFavourites.js`        | Read and apply the intended saved state for both the grid and detail page. |

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
- Share reads the user's memberships, loads those groups, and opens a group picker. Choosing a group inserts a `group_activities` row with the user's ID as `shared_by`.
- A signed-out user sees a Log in link. Failures show a message and allow another attempt.
- Request numbers prevent a slow, old database response from replacing newer screen state. Buttons are disabled while a write is running to prevent repeated clicks.

The reusable card emits Save/Share events. Activities handles Save and displays an always-visible white outline heart on each card. The button has a transparent background, a shadow around the icon for contrast, and a 44 × 44 px tap target. A faint dark circle appears on hover or keyboard focus, and saved hearts are filled red. Share is available on Activity Detail; cards hide its Share button to match the UI mockup. Success messages disappear after three seconds; failed writes show an error and allow another click to retry.

`e2e/activity-favourites.spec.js` covers card saves/removals, pagination, reloads, Detail and Profile integration, failed reads/writes, zero-row deletes, duplicate saves, repeated clicks, account-check failures, keyboard interaction and touchscreens. Lost-response tests cover successful read-back and safe retries after failed confirmation on both cards and Detail, plus stale hearts after another tab changes a favourite. These tests mock Supabase; live owner-only policies and the unique `(user_id, activity_id)` pair remain database integration checks.

## What to explain in the demo

“I fetch the activities from Supabase and store them in a ref. Search and filters update through v-model, and a computed property selects the cards to display. Clicking a card passes its ID through the route, so the detail page fetches the right activity. Both pages use the same formatting helpers. Save and Share write to separate tables for the signed-in user.”

## Remaining work for the full specification

- Verify Save/Share with real accounts and database policies, and connect Kinyu's group shortlist so shared activities appear in the group.
- Add the missing description/hours data; connect live provider details for ratings and official websites where needed.


The E2E tests use mocked Supabase responses. They check the browsing and action flows without modifying the real database.
