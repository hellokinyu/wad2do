# Admin review

## Supabase setup

The extra columns (`activities.website`, `submissions.reviewed_at`, and
`submissions.activity_id`) have already been added by the user. They do not create
permissions or approval functions.

1. Run the entire [admin SQL script](sql/admin_review.sql) in the Supabase SQL Editor
   as `postgres`. Saving the file in this repository does **not** apply it.
2. In Table Editor, set `profiles.is_admin` to `true` for a trusted account. Use its
   Auth user ID to find the right profile. The script does not promote anyone.
3. After the optional [lookup migration](sql/google_place_search.sql), run
   [admin activity management](sql/admin_activity_management.sql) to enable editing
   approved activities and deleting submissions. This is a separate, rerunnable
   migration; saving it locally does not apply it to Supabase.
4. Sign in with that account. The navbar shows **Admin**. Open `/admin/submissions`.

The SQL can be rerun; it replaces only policies and functions with its own names.
It changes grants on profiles, submissions, and activities. Browser clients may
update only their own normal profile fields; creating profiles remains the job
of the existing signup trigger. Submissions can only be inserted as the user's
own pending entry with empty review fields. Admins may edit activity details on
pending submissions directly, and approved submissions through a checked function
that updates the published activity in the same transaction. Review fields and activity publishing can only be written
through the review functions. Existing group, favourite, and itinerary policies
are not changed. Existing profiles SELECT policies are preserved so group member
names can continue to work.

The added restrictive submission policies prevent older permissive policies from
granting normal users extra access. If the database already has a **restrictive**
policy that denies admins, that policy must also be adjusted in Supabase; adding
a permissive policy cannot override it. No existing policies are deleted by name
unless they belong to this script.

The [group database privacy setup](group-database.md) replaces full-profile sharing
between group members with a names-only function. Its restrictive profile read policy
preserves own-profile and admin access, including the submitter-name join on this page.

## How the code works

- `useAuth.js`: reads the signed-in user's `profiles.is_admin`. Failed checks deny
  admin access. Auth callbacks stay synchronous, avoiding Supabase auth deadlocks.
- `router/index.js`: checks the role on navigation. Signed-out visitors go to
  login; non-admins go to an access message. Failed role checks offer a retry.
- `AdminReviewView.vue`: loads a status tab, exact counts for all statuses, and ten cards
  per page. Loading failures have a retry button.
  Search matches any part of an activity name without case sensitivity, across
  all pages. The search stays active when switching status tabs, and each tab's
  count reflects matching activities. Clearing search restores the full list.
- `AdminSubmissionCard.vue`: displays all submitted activity fields, photo,
  submitter name (or ID), and submission time in Singapore time. The edit form
  saves only activity fields and keeps changes on failure. Cancel discards edits.
- **Approve** calls `approve_submission`. SQL checks the admin role, locks the
  submission, requires a valid complete week of saved opening hours, creates a
  community activity, and records the decision together.
  Retrying a completed approval returns the original result without duplicating
  the activity. The existing Activities cards already show the Community badge.
- **Reject** calls `reject_submission` with a required reason (1–300 characters).
  The existing Profile page already reads and displays `reject_reason`.

While editing, save or cancel before approving. Approved submissions can be edited
from the Approved tab; approval and rejection decisions remain limited to pending
submissions. If another admin reviews a pending card,
an attempted edit or conflicting decision fails; refresh to see its new state.
An approval uses the latest saved details in the database.

## Edit and delete activities

Pending and approved cards have **Edit**. Approved edits save the submitted details
and published catalogue entry together, retaining the published ID and review
history. A corrected venue clears old coordinates/map data; a changed price clears
the old price note. Failed edits retain the draft for retry. Rejected cards can be
deleted, but cannot be edited or published.

All tabs have **Delete**, followed by a permanent-deletion warning and Cancel.
Deleting an approved submission also deletes its published activity, favourites,
shortlist entries and votes. Saved itinerary stops for that activity are removed
and totals recomputed from the remaining stops' saved costs, preserving their
order and times. The SQL does all of this in one transaction. It does not remove
uploaded Storage objects. Existing open user pages update on reload.

The delete function locks the submission and checks the status shown when the
admin confirmed: a pending card approved by someone else cannot silently delete
the newly published activity. Retrying a completed deletion is safe. Ordinary
users and anonymous clients cannot invoke either management operation. Browser
table grants and policies are unchanged.

Verification includes mocked desktop/mobile browser cases and the opt-in
`tests/adminActivityManagement.database.test.js`. The latter runs both migrations
against an isolated PGlite PostgreSQL fixture when `WAD2DO_PGLITE_MODULE` points
to the file URL of an installed `@electric-sql/pglite/dist/index.js`; otherwise it
skips. It checks ordinary/anonymous denial, protected review fields, validated
edits, published data synchronization, cleanup, rollback and delete retries.
It does not connect to or verify the shared Supabase database.

New submissions contain `opening_hours: {}` and show **Opening hours need admin review**. Approve stays disabled until the admin edits and saves a complete week with at least one open day. Missing days remain blank in the editor; they are never silently marked Closed. Admins should verify hours from the venue's official website or by contacting it, rather than copying Google Maps content into the database. Rejection remains available without hours.

Rerun the entire [admin SQL script](sql/admin_review.sql) before deploying this frontend revision. Its insert policies require empty hours, and `approve_submission` independently validates the saved schedule before inserting an activity. It accepts overnight hours and Open 24 hours, and rejects missing days, malformed/contradictory entries, equal times and an all-closed week. Existing approved records and retry behavior are retained. The optional lookup migration contains the same approval guard; run the current admin script first if updating an older installation.

Run [verify_google_place_search.sql](sql/verify_google_place_search.sql) after both scripts, with an ordinary and admin account present. It rolls back its test data and checks the actual hours insert policy and approval guard as well as venue-ID copying. Saving these files does not apply them to Supabase.

Photo URLs stored on submissions are displayed and can be corrected or cleared in
the edit form. The submission form now supports optional photo uploads; apply the
separate [Storage setup](activity-photo-uploads.md) first. Approval copies the
saved URL without moving or modifying the uploaded object. Browser users cannot
replace/delete those immutable objects after approval.

## Verification

### Shared database repair — 28 Oct 2026

Migration `repair_submission_pending_hours_and_approval` is applied to WAD2Do.
It removes only the nonempty-hours requirement from
`submissions_required_fields_check`, retains every other required-field check,
and installs `wad2do_valid_opening_hours` plus the guarded `approve_submission`.
The constraint stays `NOT VALID`, as before, so historical rows are preserved;
new inserts and updates still have to pass it. Approval requires a complete week
with at least one open day. Rejection can still accept hours awaiting review.

The targeted live patch did not rerun the broader setup, alter table grants or
policies, or change records. Before/after fingerprints matched for all 12 public
tables, table/column grants and public/Storage policies. Live read-only checks
confirmed the validator, approval guard and anonymous denial. Security advisory
counts were unchanged. No live test records or Google calls were made.

Both the targeted patch and rerunnable setup passed in disposable PGlite/PostgreSQL
using a copy of the live schema and fake accounts. Checks covered the original
failure, empty-hours inserts, invalid prices, ordinary-user restrictions, malformed
hours, valid overnight/24-hour schedules, exact activity copying, duplicate approval
retries and preservation of historical rows. The opt-in test is now included in
`tests/googlePlaceSearch.database.test.js`; run it only with
`WAD2DO_DISPOSABLE_DATABASE_URL` pointing to an isolated database with the admin
and lookup scripts applied. Real browser writes against shared Supabase remain
untested; browser tests use intercepted responses.

Automated browser tests mock Supabase; they do not apply SQL or verify live RLS.
The production build and ESLint checks passed. Chrome checks passed for 9 admin,
23 authentication, 7 submission, and 2 landing/navbar tests (41 total).
After applying the script, check with both an ordinary account and an admin:

1. Ordinary account: Admin link hidden; direct admin URL denied; own profile
   preferences still save; new submissions appear under My submissions.
2. Admin account: pending count and status tabs work; edit name, price and hours,
   save, then approve. The activity appears once in Activities with the saved
   details, website, photo and Community badge.
3. Reject another submission with a reason. Its owner sees the reason in Profile.
4. Try approving the same submission twice: there should still be one activity.
5. Use two admin tabs to review one submission: only the first decision succeeds.
6. Direct API requests from a normal user must fail when trying to edit
   `is_admin`, change submission status, publish activities, or call review RPCs.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[column permissions](https://supabase.com/docs/guides/database/postgres/column-level-security),
[database functions](https://supabase.com/docs/guides/database/functions).

## Suggested Google venue links

Pending submission edits reuse the optional venue picker. Inspect, replace or clear a suggested ID; editing name/address/area/postal code clears it. Lookup happens only on request. Approval now explicitly copies the saved `google_place_id`, including null, into the Community activity. Apply the additional [lookup migration and setup](google-place-search.md); normal-user restrictions and concurrent-review behavior remain in the SQL review functions. Browser publication mocks use an explicit column list and do not validate real SQL.

The profile grant list includes `home_station_id` for the MRT picker. If an older copy of this script was applied and preference saves fail, run only [mrt_station_preferences.sql](sql/mrt_station_preferences.sql) to repair that column permission. No submission policies need to be reinstalled for this repair.

Local revision checks (28 Oct 2026): all 84 targeted Chromium tests passed across submission, admin review and activity detail, including 375px layouts and the empty-hours → admin entry → save → approve flow. Nine mocked backend/unit tests, ESLint/Oxlint, Deno checking and the production build passed. Desktop/mobile admin screenshots were inspected. No live SQL, Google calls or deployment were performed.

Audit fixes (28 Oct 2026): Save, Approve and Reject now use the same 30-second whole-operation deadline as submission saves. It also bounds stalled login refresh, preserves the current edits/rejection reason on failure, and cancels pending requests when a card unmounts or the account changes. A late response cannot apply UI changes after timeout. Review retries rely on the existing atomic, idempotent SQL functions; a timeout cannot undo a server write that already committed. The shared helper is `src/lib/requestWithTimeout.js`. These fixes add no SQL or Edge Function changes beyond the earlier hours-review migration.

Audit-fix verification: 77 distinct Chromium cases passed across submissions, admin review and itinerary hours (including the corrected itinerary test setup). Tests cover committed-write retries, stalled login refresh and cancellation on card unmount. Thirteen opening-hours/backend tests, the production build, ESLint/Oxlint and diff checks passed. Browser tests intercept all backend/weather requests; live SQL, Supabase and deployment remain unchecked.
