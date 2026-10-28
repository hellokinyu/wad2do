# Admin review

## Supabase setup

The extra columns (`activities.website`, `submissions.reviewed_at`, and
`submissions.activity_id`) have already been added by the user. They do not create
permissions or approval functions.

1. Run the entire [admin SQL script](sql/admin_review.sql) in the Supabase SQL Editor
   as `postgres`. Saving the file in this repository does **not** apply it.
2. In Table Editor, set `profiles.is_admin` to `true` for a trusted account. Use its
   Auth user ID to find the right profile. The script does not promote anyone.
3. Sign in with that account. The navbar shows **Admin**. Open `/admin/submissions`.

The SQL can be rerun; it replaces only policies and functions with its own names.
It changes grants on profiles, submissions, and activities. Browser clients may
update only their own normal profile fields; creating profiles remains the job
of the existing signup trigger. Submissions can only be inserted as the user's
own pending entry with empty review fields. Admins may edit activity details on
pending submissions. Review fields and activity publishing can only be written
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
- `AdminReviewView.vue`: loads a status tab, an exact pending count, and ten cards
  per page. Loading failures have a retry button.
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

While editing, save or cancel before approving. Editing and reviewing completed
submissions is deliberately disabled. If another admin reviews a pending card,
an attempted edit or conflicting decision fails; refresh to see its new state.
An approval uses the latest saved details in the database.

New submissions contain `opening_hours: {}` and show **Opening hours need admin review**. Approve stays disabled until the admin edits and saves a complete week with at least one open day. Missing days remain blank in the editor; they are never silently marked Closed. Admins should verify hours from the venue's official website or by contacting it, rather than copying Google Maps content into the database. Rejection remains available without hours.

Rerun the entire [admin SQL script](sql/admin_review.sql) before deploying this frontend revision. Its insert policies require empty hours, and `approve_submission` independently validates the saved schedule before inserting an activity. It accepts overnight hours and Open 24 hours, and rejects missing days, malformed/contradictory entries, equal times and an all-closed week. Existing approved records and retry behavior are retained. The optional lookup migration contains the same approval guard; run the current admin script first if updating an older installation.

Run [verify_google_place_search.sql](sql/verify_google_place_search.sql) after both scripts, with an ordinary and admin account present. It rolls back its test data and checks the actual hours insert policy and approval guard as well as venue-ID copying. Saving these files does not apply them to Supabase.

Photo URLs stored on submissions are displayed and can be corrected or cleared in
the edit form. The submission form now supports optional photo uploads; apply the
separate [Storage setup](activity-photo-uploads.md) first. Approval copies the
saved URL without moving or modifying the uploaded object. Browser users cannot
replace/delete those immutable objects after approval.

## Verification

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
