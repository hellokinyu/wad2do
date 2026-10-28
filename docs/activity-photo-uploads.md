# Activity photo uploads

The submission form supports one optional JPEG, PNG or WebP photo, up to 5,000,000
bytes (5 MB). It checks file size/type, decodes the image, and shows a removable
local preview. A photo uploads only when a valid form is submitted.

## Supabase setup

1. Open the intended project in Supabase, then its SQL Editor.
2. Inspect existing `storage.objects` policies and whether a bucket named
   `activity-images` already exists. Photos in this design are public by URL.
3. Run all of [activity_image_storage.sql](sql/activity_image_storage.sql) as
   `postgres`. This creates the public bucket, enforces the three declared MIME
   types and 5,000,000-byte limit, and grants authenticated own-folder uploads.
   It refuses to turn an existing private bucket public. Resolve that visibility
   decision explicitly before rerunning; do not just remove the check.
4. Check bucket settings: public, 5,000,000 bytes, `image/jpeg`, `image/png`,
   `image/webp`. The script can be rerun. It changes only its own policies and this
   bucket's type/size restrictions. Existing incompatible restrictive policies
   can still prevent uploads and must be examined separately.
5. Keep the existing submission/admin SQL installed. `image_url` and the approval
   function already support photos. No extra database column, Edge Function,
   frontend secret or new environment variable is needed.
6. Verify the actual API checks below before releasing the frontend. A checked-in
   SQL file does not mean the setup was applied to Supabase.

The Storage policies allow INSERT in `<signed-in-user-id>/` and deny browser
UPDATE/DELETE, including overwrites, upserts and moving an object between buckets.
Restrictive guards also limit older broad permissive policies. They pass for
other buckets. No general SELECT/list policy is added; public image reads work
without it. Trusted service-role operations bypass RLS; never put that key in
Vue, a `VITE_` variable, browser tests or browser storage.

## Saving and retrying

- Keys are `<user-id>/<submission-id>/<random-upload-id>.<jpg|png|webp>`. The
  extension comes from the allowed type, not the original filename.
- The installed SDK's `.upload()` does not accept an AbortSignal. This form uses
  a raw authenticated Storage POST with the existing client's session and public
  project key. Fetch is aborted after 30 seconds, on account change and when the
  view unmounts. SDK `getPublicUrl()` constructs the URL only after upload success.
- The same cancellation also stops waiting for login-session refresh. The shared
  auth request can still finish later, but it cannot resume the cancelled upload.
  The form unlocks on timeout and retains the photo and entries for retry.
- Database saves and both recovery lookups also have a 30-second deadline per
  request, including time spent waiting for SDK authentication. They receive an
  abort signal and stop affecting the form after cancellation. A timeout keeps
  the same submission ID and confirmed photo URL: retry checks for an existing
  saved row before writing again. An already-sent write may still commit.
- Upload failure prevents a database insert and keeps the selection and entries.
  If its response was lost, retry uses a new upload key rather than overwriting.
- After a confirmed upload, an insert failure retains the URL for the same File
  and owner. Retry reuses it; replacing/removing the photo invalidates reuse.
- Before retrying a database insert, the form checks its stable submission ID and
  owner. An already-saved record is recovered without uploading later edits.
  A duplicate-insert response still performs the same ownership check for races.
- Account changes/navigation stop subsequent writes. A write already sent can
  still commit; client cancellation cannot roll it back.
- An account change starts a new submission ID and clears retry, confirmed-upload
  and success state. The entered fields and selected photo stay available for the
  new account to submit; its photo is uploaded under its own ID and folder.
- No-photo submissions explicitly save `image_url: null`. Google venue linking,
  field validation, admin URL corrections and approval behaviour are preserved.
- Submission IDs and confirmed uploads last for the open form only. Refreshing
  does not restore a draft or guarantee recovery of a previous form's submission.

## Real backend verification

Use two ordinary test accounts A and B and an admin in a test project. Inspect
both responses and final object/row state; a denied DELETE may return success
with zero deleted objects. Use the normal public project key and each user's own
session token for these requests, never a service-role token.

1. Through the form, submit a valid photo as A. The upload must complete before
   the pending submission insert. Check its `image_url` matches the object key.
2. Send a direct Storage API upload as A to A's folder; it succeeds. Anonymous
   uploads and uploads by A into B's folder must fail.
3. Send direct uploads exceeding 5,000,000 bytes and declaring a disallowed MIME
   type. They must fail without relying on Vue checks.
4. Attempt UPDATE/overwrite, upsert, DELETE and move against an existing photo,
   using A, B and an anonymous session. Confirm its bytes/name/bucket are unchanged.
5. Check another existing bucket still follows its own permissions. Rerun the
   setup and repeat one valid upload and one denied operation.
6. Load the photo's public URL without logging in. It is accessible while pending
   and after rejection. That is the visibility contract, not a permissions bug.
7. As admin, view and approve the submission. Check one Community activity is
   created with the same image URL, and the image loads in its card and detail.
   Repeating approval must not create a duplicate or change the photo.
8. Reject another submission; it stays out of the catalogue. The submitter sees
   the reason in Profile. Normal users still cannot approve or edit review fields.
9. Simulate an offline upload, an interrupted save and retry. Check there is one
   submission and its saved URL still loads. Also submit without a photo on a
   phone-sized viewport.

An optional additional SQL policy check is provided in
[verify_activity_image_storage.sql](sql/verify_activity_image_storage.sql).
Run only against a disposable Supabase database, as `postgres`, after setup.
It temporarily adds broad grants and a permissive test policy, exercises actual
row security under A/B/anonymous roles, and rolls back all fixtures and grants.
It creates no real files and cannot verify HTTP limits, image bytes or public
retrieval. Existing restrictive policies on other buckets can affect its control
fixture; use a dedicated disposable environment.

With `psql` installed and `WAD2DO_DISPOSABLE_DATABASE_URL` set to that disposable
database, run `node --test tests/activityImageStorage.database.test.js`.
Without that explicit variable, the integration test is skipped.

## Automated browser checks

```sh
pnpm run build
CI=1 pnpm run test:e2e e2e/submissions.spec.js e2e/admin-review.spec.js e2e/activity-detail.spec.js --project=chromium
```

The tests mock all photo uploads and public image reads they exercise. They use
real tiny image bytes for decoding, and cover allowed types, the size boundary,
bad files, preview replacement/removal, stale decoding, upload rejection/lost
response/timeout, database retry/recovery, double submission, leaving the form,
account changes and publication. These checks do not verify deployed policies.

## Retention and known limits

Uploaded files are immutable to browser users. Unused, replaced and rejected
photos are retained for trusted manual cleanup. Never delete on a client save
error: a submission may have committed even when its response was lost.

For manual cleanup, list candidates first. Check full URLs against submissions
of every status and activities. Protect other persisted references, including
itinerary snapshots, when dealing with previously published photos. A single
unreferenced query or an age cutoff does not exclude an in-flight form/retry.
Initially remove only known abandoned test files; for broader cleanup, pause
uploads and retire old forms before reconciling. Delete verified unused objects
with the Storage API/dashboard, never by deleting `storage.objects` rows in SQL.

Public photos can be viewed by anyone who has the URL before approval. There is
no trusted file-content scanning, metadata stripping, resizing or per-account
upload quota. MIME restrictions validate declared types, not image contents.
Monitor Storage usage; add trusted quotas/content processing before broader
untrusted traffic if required. Private pending-photo moderation needs a different
read/publication design.

Local verification on 27 October 2026: production build, ESLint and Oxlint on
changed source/tests, and all 71 Chromium checks across submissions, admin review
and activity detail passed. The opt-in database policy test was skipped because
no disposable database URL was configured. Setup/live checks have not been
applied or verified by this implementation. The build reports the existing
large-bundle warning; no dependency or bundling changes were made for this feature.

Follow-up timeout fix: all 38 submission checks in Chromium passed, including a
stalled login refresh that releases the form after 30 seconds, ignores the late
refresh result and allows a single successful upload/save on retry. Production
build, formatting, ESLint and Oxlint checks passed for the changed source/tests.

Follow-up account-switch fix: all 39 submission checks in Chromium passed. The
new regression confirms that after an interrupted save, switching accounts keeps
the original record intact and creates a separate submission/photo for the new
account. Production build, formatting, ESLint and Oxlint checks also passed.

Follow-up database timeout fix: all 44 submission checks in Chromium passed.
Coverage includes timed-out inserts that did/did not commit, a stalled recovery
lookup, late responses, a no-photo save blocked on authentication and account
switching during a database save. Production build, formatting, ESLint and Oxlint
checks passed. No live database/Storage verification was performed.

References: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[bucket visibility](https://supabase.com/docs/guides/storage/buckets/fundamentals),
[upload restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets),
[object deletion](https://supabase.com/docs/guides/storage/management/delete-objects).
