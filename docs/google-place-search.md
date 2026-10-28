# Optional Google venue lookup

Implemented locally on `feature/google-place-submissions`. Nothing here has been deployed or applied to the shared database.

Signed-in users enter the existing activity name/address and an optional six-digit **text** postal code, press **Find location**, and choose a venue. No result is selected automatically. The submission stores the chosen ID or null. No listing, lookup failure, timeout, disabled configuration, and exhausted allowance all leave manual submission available. A supplied postal code must still have six digits; this does not verify an address.

The shared `GooglePlacePicker.vue` is also used on demand in the pending admin editor. Admins inspect the suggested link, find a replacement, or clear it. Editing name, address, area or postal code clears the selected ID/results and aborts pending lookup. Older responses and responses after unmount are ignored. Other edits preserve the ID. Running another search also preserves the current ID, including on failure, timeout or no match; only an explicit replacement, Clear, or changed location inputs removes or replaces it. Suggestions are not proof of verification. Existing UUID retry/recovery behavior is retained.

## Supabase: exactly what to paste, in order

1. **SQL Editor → New query:** paste the **entire** [admin review script](sql/admin_review.sql) and run it as postgres. This retains the existing review policies and transaction/row lock/retry handling, adds nullable submission fields, and updates the explicit approval column list. Existing prerequisite columns from [admin setup](admin-review.md) must already exist. It does not promote any account.
2. In another query, paste the **entire** [lookup migration](sql/google_place_search.sql) and run it. Both scripts are rerunnable. This adds validation, protected quota tables and the service-only reservation RPC. Leave its new allowance configuration null for now.
3. **Edge Functions → Create a new function → Via Editor:** name it exactly `google-place-search`. Replace **all** of `index.ts` with the **entire** [function source](../supabase/functions/google-place-search/index.ts). There are no extra files or imports to paste. Leave **Verify JWT** enabled. Deploy this function when ready. This is separate from `google-place-details`; do not replace that function.
4. **Edge Functions → Secrets:** add `GOOGLE_MAPS_API_KEY` using the existing server key if it is already restricted appropriately. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are Supabase-provided Edge environment variables; verify they exist in your environment. Never put Google/service-role secrets in `VITE_` variables or the frontend. The function uses Auth's `/user` endpoint to validate the user JWT independently of the gateway, then calls the reservation RPC with the server key.
5. Review Google billing/quotas below **before enabling lookup**. Verify that Places API (New) is available on the chosen project; this implementation does not enable services or billing. Restrict the server key to Places API (New). Check other applications/projects sharing its billing account. Agree an app monthly allowance and a per-user hourly limit.
6. Once those numbers are approved, paste this query in **SQL Editor**. Replace each `null` with the chosen positive whole number. Leaving either null keeps lookup disabled. No production spending limit is assumed by the code.

   ```sql
   update public.google_place_search_config
   set monthly_limit = null,      -- replace with the owner-approved monthly search count
       user_hourly_limit = null  -- replace with the owner-approved per-user hourly count
   where singleton = true;
   ```

7. Deploy the frontend only after both SQL scripts and the function are ready. With limits still null, confirm that **Find location** explains that lookup is disabled and manual submission succeeds. Then enable the approved limits and carry out the live checks below. Deploying the function or applying the migrations is an owner action; local files do not change Supabase.

To disable future lookups, set `monthly_limit = null` again. Do not reset usage counters to re-enable a used allowance; Google may have billed those attempts.

## Allowance and API behavior

The fixed Text Search (New) endpoint receives a POST with the supplied name, address and postal code plus Singapore context, `regionCode: SG`, English, and `pageSize: 5`. The server owns this field mask:

```text
places.id,places.displayName,places.formattedAddress,places.addressComponents,places.attributions
```

Every candidate must contain a valid ID, name, address, and exactly one country component whose `shortText` is `SG`. Missing or conflicting countries and malformed results are discarded. Region bias alone does not enforce Singapore. No ratings, reviews, photos or hours are requested; no pagination or autocomplete is added.

The request body accepts only `name` (nonblank, at most 200 characters), `address` (nonblank, at most 500), and optional `postalCode` (empty or six digits). The body is capped at 4096 bytes. Only POST and browser OPTIONS preflight are supported. A single eight-second deadline bounds authentication, body reading, quota reservation, Google and response reading. The client has a twelve-second fallback. All responses include CORS and `Cache-Control: no-store`; failures return safe codes, never upstream error bodies or credentials.

`google_place_search_config` starts disabled. `reserve_google_place_search(uuid)` locks its singleton row, checks the app/month and user/hour counters, and reserves both in one database transaction **before** Google is called. It is callable only by `service_role`, with the user ID supplied from verified Auth. RLS plus revoked browser grants protect config/counters. Reservations are never refunded for failed or uncertain requests. User limits use fixed UTC clock hours. App months use `America/Los_Angeles`, matching Google's documented midnight US Pacific reset on the first of the month. Counters persist across instances and deployments. Rerunning migrations does not reset them. Requests already in flight can finish when lookup is disabled.

As checked against Google's official documentation on 27 Oct 2026, this field selection uses **Text Search Pro**, whose current global no-cost monthly cap is **5,000 events**. This is **not** the unlimited IDs-only SKU. Free usage and volume pricing apply across projects on a billing account; the app does not own all of that allowance. Allocate less than the remaining shared allowance and leave a margin for other usage, in-flight calls around billing boundaries and uncertain billing. Other Google features, including the existing details function, have their own SKU usage to review.

In **Google Cloud → Google Maps Platform → Quotas**, select Places API (New), inspect Text Search's supported quota, and lower its per-method, per-project requests-per-minute quota appropriately. Do not assume a daily or monthly quota exists if the console does not offer one. Google quotas complement the durable app monthly cap; they do not combine other projects' usage. A billing budget/alert **does not cap spending**. If the billing owner cannot allocate a safe remaining allowance, leave lookup disabled.

References: [Text Search and field tiers](https://developers.google.com/maps/documentation/places/web-service/text-search), [global pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [monthly reset](https://developers.google.com/maps/billing-and-pricing/overview), [supported quotas](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), [budgets and cost controls](https://developers.google.com/maps/billing-and-pricing/manage-costs), [authenticated user validation](https://supabase.com/docs/reference/javascript/auth-getuser), [CORS](https://supabase.com/docs/guides/functions/cors).

## Storage, attribution and publishing

Only `submissions.google_place_id` and user-entered `submissions.postal_code` are new persisted fields. Nullable format checks apply to new/updated rows without invalidating old rows. INSERT/UPDATE grants include these columns; existing owner-only insertion/reading and admin-only pending editing remain under the review policies. Review fields stay protected. Place IDs are not unique. Approval copies the saved ID to `activities.google_place_id` atomically with publishing; no activities postal column is needed.

Google-returned names, addresses and provider attributions exist only in component memory. They are displayed through escaped Vue bindings in a separate preview; the form never copies them into user fields, Supabase or browser storage. The compact preview displays `Google Maps` text attribution (untranslated, unwrapped, with required typography) and provider attributions, using only safe HTTP(S) provider links. The inspect link uses Google's Maps URL with the ID and user-entered query. This feature adds no map or imported opening hours. Review the app's public Terms/Privacy pages against [Google's Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) before release; those pages are outside this feature.

Activity Detail already loads `google-place-details` whenever an activity has a Place ID, including `source: community`. Its source is absent from this checkout, and no connected Supabase deployment access is available here. Its live authentication, accepted sources, ID handling and key restrictions therefore remain unverified.

## Checks and remaining live verification

Local checks use mocked Google responses; automated browser/backend checks cannot incur Google charges. Run:

```sh
pnpm run build
pnpm exec node --test tests/googlePlaceSearch.test.js
CI=1 pnpm exec playwright test e2e/submissions.spec.js e2e/admin-review.spec.js e2e/activity-detail.spec.js --project=chromium --workers=2 --reporter=line
deno check supabase/functions/google-place-search/index.ts
```

Backend checks cover verified auth, methods/CORS, invalid types/lengths/JSON/body size, leading zeros, the fixed field mask, country filtering, usage-denied responses, timeout/upstream failures and conservative reservations. Browser checks cover explicit keyboard selection at desktop/375px, no-match/manual fallback, disabled/exhausted lookup, timeout, stale requests/navigation, input invalidation, admin replacement/clear, unchanged user-entered fields, and failed/lost-response save retries. The admin mock now copies an explicit publication field list; it still does not prove SQL correctness.

No PostgreSQL server, psql or Supabase CLI is installed here. The actual migration, grants, row locks and concurrent caps have **not** been executed locally. Verify these before enabling production lookup:

1. In SQL Editor, inspect the live schema and existing policies/functions before applying migrations; reconcile differences instead of assuming this repository matches production. Apply the scripts in the order above.
2. With one ordinary and one admin account present, paste [verify_google_place_search.sql](sql/verify_google_place_search.sql) into SQL Editor. It rolls back test inserts/approval, checks actual column grants and RLS, rejects ordinary-user editing/publishing, and asserts exact ID copying, null-ID publishing and duplicate-approval behavior. Expect a PASS notice and ROLLBACK; any error needs investigation. It never calls Google.
3. For the concurrency test, use a **disposable Supabase/Postgres database**, apply both migrations and provide its direct connection as `WAD2DO_DISPOSABLE_DATABASE_URL` in your local environment. With `psql` installed, run `pnpm exec node --test tests/googlePlaceSearch.database.test.js`. It changes counters/config in that disposable database, launches 12 concurrent real SQL calls, requires exactly one reservation at each app/user limit, and leaves lookup disabled. Never point it at the shared project. With no URL it is explicitly skipped.
4. Confirm a logged-out direct function request returns 401 and an invalid body returns 400. With limits null, a signed-in request should return 503 `lookup_disabled` and make no Google request. With tiny approved staging limits, check 429 `user_limit`/`app_limit` before further Google traffic; don't raise production limits just to test.
5. Within the owner's approved usage, submit a chosen venue with postal code `012345` (or another valid user-supplied value), inspect the saved submission ID, correct/clear it as admin, approve, and compare `activities.google_place_id` with the saved ID. Repeat approval; only one activity should exist. Confirm ordinary accounts cannot update review fields, publish activities, or call the reservation RPC directly.
6. Open the published **community** activity: in browser Network confirm `google-place-details` accepts `{ activityId }`, reads that activity's saved ID, returns live ratings/hours with attribution, and leaves the rest of the page usable on failure. Inspect the deployed details source in Supabase; ensure it does not restrict records to `source = google` or accept arbitrary client Place IDs. No source replacement for that existing function is included here.
7. Check other tabs/accounts, phone layout, a no-listing/manual submission, and Google project usage before declaring the feature deployed and verified.

Local results (27 Oct 2026): production build passed (Vite reports a >500 kB bundle warning); all 47 targeted Chromium tests passed; all 7 mocked backend tests and 4 existing ranking tests passed; ESLint, Oxlint, Deno type checking and `git diff --check` passed. The real-PostgreSQL concurrency test is skipped without a disposable database URL. Firefox/WebKit and live Google/Supabase checks were not run. No dependencies were added. The parent project AGENTS.md was updated separately; it is outside this Git repository.

Audit fix 1 (27 Oct 2026): another lookup now resets only search feedback/results, preserving the current Place ID until explicit replacement, Clear, or edited location inputs. Regression checks cover admin save/approval after quota errors, upstream errors and no matches, plus a selected submission surviving timeout and then accepting an explicit replacement. Production build, ESLint/Oxlint, `git diff --check`, and all 51 targeted Chromium tests passed. This fix is frontend-only; no SQL or Edge Function redeployment is required. Live frontend deployment was not performed.

Opening-hours revision (28 Oct 2026): the submission form no longer requests or stores Google hours. Admins enter independently verified hours before approval. Rerun the current admin SQL to install the approval guard and empty-hours insert policies; existing records remain. If the removed hours endpoint was deployed, redeploy the current search-only Edge Function. See [admin review](admin-review.md).
