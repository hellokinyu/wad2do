# Google Place Details allowance

Audit 10 is fixed in the shared WAD2Do project. `google-place-details` version 2
was deployed on 28 Oct 2026 with JWT verification enabled. Its source is now
tracked in `supabase/functions/google-place-details/index.ts`.

Details and venue searches share the existing `reserve_google_place_search(uuid)`
function, `google_place_search_config`, and durable usage counters. The current
limits are **1,000 combined requests per app/month** and **20 combined requests
per user/hour**. No separate allowance was added, no counters were reset, and no
database schema, records or permissions were changed by deployment.

Each request verifies the signed-in user, accepts only an activity UUID, and
reads that activity's saved Place ID under the caller's row-level security.
It reserves allowance with the server-only RPC before making one Google call.
The caller cannot supply a user ID, Place ID, endpoint or field mask. Missing
configuration, exhausted allowance, database failures and timeouts block Google.
Failed or uncertain Google calls keep their reservation and are never retried
automatically. A 4 KB body limit and one ten-second deadline bound the operation.

The fixed field mask remains:

```text
rating,userRatingCount,currentOpeningHours,regularOpeningHours,attributions
```

Responses use `Cache-Control: no-store`. Google results remain in component memory,
never persisted to Supabase or browser storage. User/hour and app/month limits
return HTTP 429 with `user_limit` or `app_limit`; disabled configuration returns
503 `lookup_disabled`. The updated detail page explains these states and retains
saved hours, Save/Share actions and its independent map embed.

The existing limits can be changed only by the database owner using the setup in
[Google place search](google-place-search.md). Both endpoints stop reserving new
requests when either configured limit is null. Shared limits can be reached
sooner now that detail views also count. Never clear counters to restore usage.

This cap bounds future application requests, not the Google billing account.
Earlier details calls were untracked, and other projects can share its free usage.
The fixed details fields trigger the Place Details Enterprise tier, currently
listed with 1,000 no-cost monthly events. Review Google usage before treating the
app allowance as a guarantee of no charges. See [field tiers](https://developers.google.com/maps/documentation/places/web-service/place-details)
and [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing).

Verification: 35 unit/backend checks, 21 Chromium detail-page tests, Deno checking,
ESLint/Oxlint and the production build passed. Disposable PGlite/PostgreSQL checks
confirmed shared reservations, app/user denial without incrementing, disabled
configuration and denial of browser roles. Four opt-in external-database tests
were skipped. Live read-only inspection confirmed server-only reservation access,
RLS, unchanged configuration/counters, and the exact deployed source. Live OPTIONS
returned 204; a logged-out POST returned 401. No paid Google test calls were made.

The PostgreSQL cap uses the existing row lock to serialize reservations. The
separate multiple-connection concurrency test remains opt-in in
`tests/googlePlaceSearch.database.test.js`; no new concurrency mechanism was added.
