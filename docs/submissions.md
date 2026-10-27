# Activity submissions

`src/views/SubmitActivityView.vue` saves to the existing `public.submissions` table using the shared Supabase client and signed-in user from `useAuth()`.

- Required: name, category, price (or Free), duration, indoor/outdoor, Singapore address/place, area and a complete weekly opening schedule.
- Optional: description (300 characters) and an HTTP(S) website.
- Opening hours use the weekday map in [Activity Detail data](activity-detail-data.md). Closed days use `{ closed: true }`, 24-hour days use `{ open24h: true }`, and other days use `{ open, close }` in Singapore time. An earlier closing time indicates the following day.
- Saves explicitly use `status: 'pending'`. Review fields are omitted. The success screen links to Profile, whose existing submission query shows the new record.
- Saving disables the form. Errors preserve all entries and allow retry.
- Each open form uses one UUID across save retries. If a retry reports a duplicate ID, the form verifies that the signed-in user owns the saved record before showing success. Recovery explains that the earlier attempt was saved and later edits were not submitted. No update permission or database change is needed. This ID lasts for the current page only; leaving or reloading starts a new form.
- Photo uploads require a separate Storage bucket and policies. Admin approval is a separate flow.

The user confirmed these live database changes in the Supabase SQL Editor on 22 Oct 2026:

- RLS enabled; users can select only their own submissions.
- Inserts require the authenticated owner, pending status, and empty review fields.
- Required-field and review-status CHECK constraints were added with `NOT VALID`, preserving existing records while enforcing checks on subsequent writes.

The form does not provide database authorization. Keep the live RLS policies and constraints enabled. Category/area choices, detailed opening-hours structure and website checks in this form are client validation; the current database constraints check only basic field presence, prices/durations, opening-hours object shape, description length and review status.

Verification: `pnpm run build` and `pnpm run test:e2e e2e/submissions.spec.js --project=chromium`. Tests mock all database requests and cover desktop/mobile submission, free and paid pricing, pending status in Profile, failed-save retry, lost-response recovery without duplicate records, failed recovery reads, unrelated duplicate errors, and invalid input. They do not verify live database permissions or write real submissions.

## Optional Google location link

The form now supports an optional six-digit postal code and explicit Google venue selection. It stores the selected `google_place_id` or null alongside user-entered data. Manual submission, UUID retries and lost-response recovery remain available. Follow [the paste-ready setup and live checks](google-place-search.md) before deploying the frontend; both SQL scripts and `google-place-search` are required. Lookup stays disabled until the owner configures allowance limits.
