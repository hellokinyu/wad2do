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

- Save checks the authenticated user and their current favourite, then inserts or deletes a `favourites` row. The heart changes only after the database operation succeeds.
- Share reads the user's memberships, loads those groups, and opens a group picker. Choosing a group inserts a `group_activities` row with the user's ID as `shared_by`.
- A signed-out user sees a Log in link. Failures show a message and allow another attempt.
- Request numbers prevent a slow, old database response from replacing newer screen state. Buttons are disabled while a write is running to prevent repeated clicks.

The reusable card emits Save/Share events for future parent pages to handle. The Activities demo currently hides those buttons; its working actions are on the detail page.

## What to explain in the demo

“I fetch the activities from Supabase and store them in a ref. Search and filters update through v-model, and a computed property selects the cards to display. Clicking a card passes its ID through the route, so the detail page fetches the right activity. Both pages use the same formatting helpers. Save and Share write to separate tables for the signed-in user.”

## Remaining work for the full specification

- The team needs to finish login, router guards, Profile and real Groups pages, and verify Save/Share with real accounts and database policies.
- Add the missing description/hours data; connect live provider details for ratings and official websites where needed.
- Activities still needs the Submit button and displaying 20 cards at a time with Load more. Area/price filters and ascending/descending price sorting are implemented.


The E2E tests use mocked Supabase responses. They check the browsing and action flows without modifying the real database.
