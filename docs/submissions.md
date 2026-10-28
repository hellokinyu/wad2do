# Activity submissions

`src/views/SubmitActivityView.vue` saves to the existing `public.submissions` table using the shared Supabase client and signed-in user from `useAuth()`.

- Required: name, category, price (or Free), duration, indoor/outdoor, Singapore address/place, area. Opening hours are entered by an admin during review.
- Optional: description (300 characters), an HTTP(S) website and one photo (JPEG/PNG/WebP, up to 5,000,000 bytes).
- The form has no opening-hours inputs or hours API call. It sends `opening_hours: {}` to represent hours awaiting admin review; this is neither a closed week nor assumed 24/7 access. The 28 Oct 2026 database repair allows this empty object while preserving the other required-field checks. Admins enter the full week before publishing; see [admin review](admin-review.md).
- Saves explicitly use `status: 'pending'`. Review fields are omitted. The success screen links to Profile, whose existing submission query shows the new record.
- Saving disables the form. Errors preserve all entries and allow retry.
- Each account uses one UUID across save retries while the form stays open. Switching accounts starts a new UUID and clears retry/upload/success state, while retaining the entered fields and selected photo. Before retrying an attempted insert, and after a duplicate-ID response, the form verifies whether the signed-in user owns the saved record before showing recovered success. Recovery explains that the earlier attempt was saved and later edits were not submitted. No update permission or database change is needed. This ID lasts for the current page only; leaving or reloading starts a new form.
- Photo selection includes a local preview, validation and removal. Uploads run before the pending insert, reuse confirmed URLs on save retry, and use a fresh object key for replacement or uncertain uploads. See [photo setup, permissions, live checks and retention](activity-photo-uploads.md). Apply the separate Storage SQL before deployment; admin approval already copies the URL.

The user confirmed these live database changes in the Supabase SQL Editor on 22 Oct 2026:

- RLS enabled; users can select only their own submissions.
- Inserts require the authenticated owner, pending status, and empty review fields.
- Required-field and review-status CHECK constraints were added with `NOT VALID`, preserving existing records while enforcing checks on subsequent writes.

The form does not provide database authorization. Keep the live RLS policies and constraints enabled. Category/area choices and website checks in this form are client validation; the current database constraints check only basic field presence, prices/durations, opening-hours object shape, description length and review status.

Verification: `pnpm run build` and `pnpm run test:e2e e2e/submissions.spec.js --project=chromium`. Tests mock all database requests and cover desktop/mobile submission, free and paid pricing, pending status in Profile, failed-save retry, lost-response recovery without duplicate records, failed recovery reads, unrelated duplicate errors, and invalid input. They do not verify live database permissions or write real submissions.

## Optional Google location link

The form now supports an optional six-digit postal code and explicit Google venue selection. It stores the selected `google_place_id` or null alongside user-entered data. Manual submission, UUID retries and lost-response recovery remain available. Follow [the paste-ready setup and live checks](google-place-search.md) before deploying the frontend; both SQL scripts and `google-place-search` are required. Lookup stays disabled until the owner configures allowance limits.

## Admin-owned opening hours

Before deploying this revision, rerun the entire [admin SQL script](sql/admin_review.sql) as postgres. It requires empty hours on browser inserts and rejects approval unless the saved hours contain all seven days, valid distinct opening/closing times or Closed/Open 24 hours modes, and at least one open day. Existing records are retained. The [lookup migration](sql/google_place_search.sql) preserves this approval guard if rerun later.

The old Google hours autofill and its Place Details branch were removed. The optional location search still saves only a Place ID. If you deployed the hours version of `google-place-search`, redeploy the current search-only source. Existing independently researched hours are kept; any previously imported Google hours need a manual source review rather than automatic deletion.
