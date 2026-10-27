# Activity submission photo: audit and implementation handoff

Prepared 27 October 2026. This is a proposed implementation, not a record of a deployed feature.

## What this repo does

WAD2Do is a Vue 3 application backed by Supabase. A signed-in user suggests an activity; an admin reviews it and publishes it to the activity catalogue. This review assumes a small course project with a limited number of ordinary users and a few team admins, including simultaneous submissions and unreliable mobile connections.

Scope: the optional submission photo, its Storage permissions, retries, admin review, publication and tests. This is not a whole-repository audit.

## Existing flow and evidence

- `src/views/SubmitActivityView.vue:86`: validates the form and inserts a pending submission. It has no photo input or upload.
- `src/views/SubmitActivityView.vue:12`: creates one submission UUID for the open form. The duplicate-record recovery at line 169 verifies the record belongs to the submitting user before reporting success.
- `src/components/AdminSubmissionCard.vue:248`: already displays `submission.image_url`, with a fallback when the image fails. Admins can edit or clear that URL on a pending submission.
- `docs/sql/admin_review.sql:142` and `docs/sql/google_place_search.sql:50`: both definitions of `approve_submission` already copy `image_url` into the published activity. Preserve their admin check, row lock and retry behaviour.
- `src/components/ActivityCard.vue:57` and `src/views/ActivityDetailView.vue:203`: already display `activity.image_url`, with placeholders for missing/broken images.
- `src/views/ProfileView.vue:464`: My submissions loads names and statuses, not photos. A profile thumbnail is outside this feature.
- `e2e/submissions.spec.js`: tests pending inserts, retained input, failed saves, lost-response recovery and Google venue selection. It does not mock Storage uploads.
- `e2e/admin-review.spec.js`: its approval mock explicitly copies `image_url`, but the initial photo is null and it does not execute SQL or Storage policies.

## Audit findings

These are gaps to close in the proposed upload feature. They are not claims that an upload feature is already deployed or that live Storage is misconfigured.

### Must fix

1. **A successful upload can block a save retry.**
   - **What this is:** The suggested upload runs before the existing submission insert (`SubmitActivityView.vue:150`).
   - **Problem:** Uploading to one fixed path succeeds, then the database insert fails. Uploading to that path again on Retry can fail because the object already exists. An edited photo introduces another ambiguity about which file the retry uses.
   - **Fix:** Cache a confirmed upload for the same selected File and owner. Use a new random object path for each new upload attempt; never overwrite. Preserve the form's submission UUID and existing duplicate-record ownership check.
   - **If we skip it:** A network or database error can leave a valid form that cannot be resubmitted, or publish the wrong photo.

2. **Storage permissions must preserve the admin's photo decision.**
   - **What this is:** Approval publishes a URL pointing to the same object (`admin_review.sql:148`).
   - **Problem:** If a future owner policy allows UPDATE or DELETE, the submitter can replace or remove the bytes after approval without changing the database row. A generic authenticated upload policy can also let one user write to another user's folder.
   - **Fix:** Permit authenticated INSERT only into the user's own folder. Deny browser UPDATE and DELETE in this bucket, including requests that attempt upserts. Check existing policies as well as the new ones.
   - **If we skip it:** An approved activity can later show an unreviewed photo or a broken image.

3. **The file picker does not enforce upload limits.**
   - **What this is:** The proposed `accept` attribute helps users select files; it does not secure the upload endpoint.
   - **Problem:** A direct Storage request can bypass Vue and attempt an oversized file or a disallowed declared type.
   - **Fix:** Set the exact size and MIME allowlist on the bucket. Also validate in the form for clear feedback, and reject images the browser cannot decode. Do not claim MIME restrictions verify file contents or scan for unsafe content.
   - **If we skip it:** Disallowed files can consume storage, or users submit an image the app cannot display.

### Should fix

4. **Two separate writes need an explicit retention rule.**
   - **What this is:** Uploading an object and inserting a submission are separate requests; the SQL approval transaction cannot make them atomic.
   - **Problem:** An abandoned form can leave an unused object. Conversely, deleting an uploaded object after a database error can destroy the image of a submission that actually saved but lost its response.
   - **Fix:** Never delete from a browser error handler. Retain objects initially, document manual reconciliation, and verify both submissions and activities before any trusted cleanup. Document that public photos are accessible by URL even while pending.
   - **If we skip it:** Storage accumulates silently, or recovery breaks an already saved activity photo. Users may also misunderstand what “pending review” protects.

5. **The current tests cannot establish that uploads are secure or recoverable.**
   - **What this is:** Existing submission and admin tests use mocked database requests (`e2e/submissions.spec.js:7`, `e2e/admin-review.spec.js:9`).
   - **Problem:** Those tests can pass even when the real bucket rejects every upload, permits another user's folder, or lets a photo be overwritten after approval.
   - **Fix:** Add Storage request mocks for the browser flow and separate real Storage API checks using two ordinary test users. Keep mocked UI results distinct from verified backend permissions.
   - **If we skip it:** The page looks complete in tests but can fail or allow changes it should reject in deployment.

## Chosen implementation

One optional photo per submission. Use the installed Supabase JavaScript client and the existing `submissions.image_url` column. No new activity-photo table, package, cropper, gallery or upload service.

| Decision | Required behaviour |
| --- | --- |
| Bucket | A dedicated public bucket named `activity-images` |
| Visibility | Anyone with a photo URL can view it immediately, including before approval or after rejection. Activity catalogue publication still requires approval. |
| Allowed types | Exactly `image/jpeg`, `image/png`, `image/webp`; no SVG, GIF or HEIC in this version |
| Maximum size | 5,000,000 bytes, inclusive; reject zero-byte files |
| Object key | `<auth-user-id>/<submission-uuid>/<upload-uuid>.<extension>` |
| Extensions | Derive `jpg`, `png` or `webp` from the allowed MIME type, never the supplied filename |
| Browser permissions | Own-folder INSERT only; no UPDATE, DELETE or new bucket-list permission |
| Database value | Confirmed public URL, or null when no photo is selected |
| Save timing | Upload only when Submit for review is pressed and validation succeeds |
| Retention | Keep confirmed and uncertain uploads; use a documented trusted manual cleanup process |

This public-bucket choice is for photos intended for public activity listings. It does not implement private moderation. If private pending photos become a requirement, use private storage and controlled reads/publication as a separate design; an obscure URL is not access control.

## Step-by-step implementation

### 1. Inspect the checkout and preserve current work

Work from `WAD2DO code/wad2do`. Read the repository instructions and run `git status --short` before editing. At audit time, several auth/admin/MRT documentation and SQL files already had local changes. Preserve them; do not reset or rewrite unrelated work.

Read the submission form, its E2E tests, both approval SQL definitions, and the existing image renderers identified above. Use pnpm, as required by README. Avoid changing shared auth, routing or Supabase client setup.

### 2. Create the bucket setup migration

Add `docs/sql/activity_image_storage.sql` with setup that can be safely rerun:

1. Create only `activity-images`, with `public = true`, `file_size_limit = 5000000` and the exact three allowed MIME types.
2. If the bucket already exists, inspect its configuration before changing it. Do not silently convert an existing private bucket to public.
3. Add an authenticated INSERT policy on `storage.objects` that requires `bucket_id = 'activity-images'` and `(storage.foldername(name))[1] = (select auth.uid())::text`.
4. Add a restrictive INSERT guard scoped to this bucket, so an older broad permissive policy cannot allow another user's folder. Add the corresponding anonymous guard so older anonymous upload policies cannot admit writes here.
5. Add restrictive UPDATE and DELETE guards for `anon` and `authenticated` that reject operations targeting this bucket. For UPDATE, check both the old and the new bucket so objects cannot be moved into or out of it through a broad policy.
6. Ensure restrictive guards pass for other buckets. Do not revoke table-wide Storage grants or remove other buckets' policies.
7. Do not add a SELECT policy just to display public images. Public retrieval does not require one. Do not expose a service-role key in the frontend.

Row-level security (RLS) means the server decides which rows each account can use. Permissive policies can combine to grant access; a restrictive guard limits those grants. Inspect existing restrictive policies too, since an older denial can still prevent valid uploads.

Leave `approve_submission` unchanged. Both checked SQL definitions already copy `image_url`; copying or moving the object on approval would add a second failure-prone publication step.

### 3. Add the photo field and local preview

In `src/views/SubmitActivityView.vue`, add a labelled optional file input near Description, one preview image, and a Remove photo button with `type="button"`.

- Input: `accept="image/jpeg,image/png,image/webp"`; one file only.
- Help: “JPEG, PNG or WebP. Maximum 5 MB. Photos are public by link once uploaded. Upload a photo you have permission to share.”
- Add `data-testid` values: `submission-image`, `submission-image-preview`, `submission-image-remove`, `submission-image-error`, `submission-upload-status`.
- Keep a File in component memory, not in the normal database payload, localStorage or sessionStorage.
- Use a local object URL for the preview. Revoke it on replacement, removal, unmount and success as applicable.
- Decode the image before accepting it for submission. Invalid or corrupt files show an inline error and block Submit until replaced or explicitly removed. Do not silently submit without the photo after an invalid selection.
- If selection validation is asynchronous, ignore old results after replacement, removal or unmount. A slow decode of photo A must not replace photo B's preview or clear B's error.
- Canceling the OS file picker keeps the previous selection. Removing a photo clears the native input so the same file can be selected again.
- Show the selected file's name as escaped text. Give the preview an appropriate alt text. Ensure the input, help and error are linked with `aria-describedby` and work with a keyboard.

Keep upload state in this view. A generic uploader component or global store is unnecessary for one caller.

### 4. Validate before network writes

Keep all current activity-field and opening-hour checks. For a selected photo require:

1. An allowed declared MIME type.
2. `file.size > 0 && file.size <= 5000000`.
3. Successful browser image decoding.

Do not use `accept="image/*"`, filename extensions, or client checks as the backend boundary. The bucket enforces size and declared type even if Vue is bypassed. This version does not verify file contents on a trusted server, strip metadata, resize photos or scan their content. Admin review still checks suitability; stronger ingestion belongs before a broader untrusted public launch if required.

### 5. Upload with immutable object paths

For each attempt that actually needs an upload, generate a fresh upload UUID and build the object key from the captured signed-in user ID, existing submission UUID, upload UUID and allowed extension. Use `.upload(path, file, { upsert: false, contentType: file.type })`.

Store a confirmed successful result in component memory, together with the captured owner and the exact selected File identity. A retry with that same selection and owner reuses its URL. Replacing or removing the selection invalidates reuse; changing only the activity name does not.

Only call `getPublicUrl(path)` after a confirmed upload. That method constructs a URL; it is not evidence that an upload succeeded. Do not save a preview object URL, temporary signed URL, base64 string, user-supplied filename or whole File in `image_url`.

If an upload reports an error, retain the selection and explain that the photo could not be uploaded. Do not insert the submission or show success. The server may still have received an upload whose response was lost; a later attempt uses a fresh upload UUID rather than overwriting or assuming any duplicate-path error proves success.

Bound a stalled upload with a 30-second timeout and a tested cancellation mechanism supported by the installed SDK. A timeout is an uncertain result, not proof the server did nothing. Check the actual SDK cancellation support before coding; a bare `Promise.race` must not let a late result trigger a database insert after the UI has moved on.

### 6. Extend submission retries without changing their meaning

Use the following order within one guarded submit operation:

1. Ignore double clicks while busy or after success. Capture the current user ID and set busy state for the entire operation.
2. If this open form has already sent a database insert, first read `submissions` using both its stable submission ID and captured owner. If found, show the existing recovered-success message; do not upload or overwrite with later edits. If the read fails, stop and allow another retry.
3. If no saved row was found, validate the current form and selected photo.
4. Capture the submitted values and selected File for this attempt. Do not reread editable reactive fields after awaits.
5. Reuse the confirmed upload for that File and owner, or upload it once. No selected photo means `image_url: null` and no Storage request.
6. After asynchronous steps, confirm the component is still active and the account is still the captured user before sending the database insert. Sign-out, account switching or navigation must not start a new stale write. An insert already sent to the server can still commit; do not claim client cancellation rolls it back.
7. Insert the existing payload plus `image_url`, preserving the original submission UUID, `submitted_by`, `status: 'pending'`, Google venue fields, hours and all current validation.
8. Keep the existing `23505` recovery check: verify the exact ID and owner before reporting recovered success. The early read does not replace it, because an earlier insert can still finish between that read and the new insert.
9. On an error preserve entries and selection. Keep any confirmed upload available for reuse. Do not delete or overwrite any object in the error handler.
10. In `finally`, release busy state for the active view. Keep database recovery errors distinct from a new successful submission.

The preliminary read is needed only after an insert was attempted, not on every initial form load. Existing tests that count retry requests will need deliberate updates for this extra recovery read. Preserve their assertions about exactly one saved submission and the original values after a lost response.

During work, use “Uploading photo…” and “Submitting…” statuses, a spinner and an accessible live status. Keep the form disabled during the operation. Error text should distinguish photo upload failure from submission save failure. Retrying a failed save may still use edited fields when no record exists, as it does today.

### 7. Reuse review and publication

Admin review should show the uploaded URL through its current image element. Retain its missing/broken-image fallback and the existing admin ability to clear or correct a pending photo URL. Do not restrict all old/admin photo URLs to this bucket; existing catalogue sources and external admin links must keep working.

Approve and reject through the existing database functions. Normal users must remain unable to update review fields or publish activities. Approval should create exactly one Community activity with the saved image URL. No additional Storage operation should run during approval.

Verify the published card and detail page load the photo. Existing entries with null images must still use placeholders. Profile continues showing the submission's status; it does not need a new thumbnail for this task.

### 8. Document retention and cleanup

For this small project, leave unused and rejected uploads in place initially. Document this explicit limit with a nearby comment such as:

`shortcut: unused uploads are retained for manual cleanup; add trusted reconciliation when storage usage warrants it.`

Do not add browser delete rights, a scheduled job or a service-role key to solve cleanup. In setup documentation, describe a trusted manual process:

1. List candidate objects and their age without deleting anything.
2. Match their full URLs against both submissions and activities, across all statuses. Protect other persisted references, such as itinerary snapshots, if cleanup is ever extended to objects previously used by an activity.
3. Check that no current or retrying form will attach the candidate. Age alone and a single “not referenced” query do not close that race; initially restrict removal to known abandoned test objects or perform maintenance with uploads paused and old forms retired.
4. Delete confirmed unused objects using the Storage API or dashboard. Never delete raw `storage.objects` rows with SQL; that can leave the underlying file behind.
5. Monitor storage use. A file-size limit is not an account upload quota or protection against a user sending many files. Add server-enforced quotas/rate controls before allowing untrusted traffic at scale, not a client-only counter.

### 9. Add meaningful automated tests

Extend `e2e/submissions.spec.js` using its existing backend/auth mocks. Intercept all Storage requests used by tests so a run never uploads to the live project. Return actual small image bytes for preview/rendering tests; a fake file with a PNG MIME label is insufficient for decoding.

| Case | Required result |
| --- | --- |
| No photo | No upload; pending insert contains `image_url: null`; existing flow succeeds |
| Valid JPEG/PNG/WebP | Preview appears; upload completes before insert; insert uses its URL |
| Size boundary | Exactly 5,000,000 bytes passes size validation; 5,000,001 fails; test size separately from decode validity |
| Invalid input | Zero bytes, disallowed type and corrupt image block writes and show feedback |
| Replace/remove | Preview and payload follow the current selection; old preview URLs are revoked |
| Slow validation | Old decode result cannot revive a removed photo or replace a newer photo |
| Upload rejected | No submission insert; entries/photo remain; retry is available |
| Upload response lost/stalled | No false success or late insert; retry uses a fresh upload key |
| Upload succeeds, insert fails | Same selected photo is not reuploaded on retry |
| Photo changed after failed insert | If no saved row exists, the new photo gets a new path and its URL is saved |
| Insert response lost | Retry recovers exactly one original submission and original image; later edits are not silently applied |
| Recovery read fails | No new upload or false success until ownership can be checked |
| Duplicate without owned row | Remains an error, not recovered success |
| Concurrent clicks | One active upload/save sequence |
| Navigation/account change | No new insert after the view/user changes; no late success UI; an already-sent insert may still commit |
| Phone/keyboard | Usable at 375px and desktop widths; labelled controls; no horizontal overflow |

Extend `e2e/admin-review.spec.js` with a real-looking Storage URL, mocked image response, approval, and a published card/detail assertion. Verify rejection leaves the activity unpublished and a broken URL still shows the fallback. Keep the existing Google venue and no-photo tests.

### 10. Verify actual Storage permissions separately

Add `docs/activity-photo-uploads.md` with exact setup and a test checklist. If adding an executable integration test, follow the repository's opt-in disposable-environment convention and never point destructive tests at production.

Using two ordinary test users A and B and one admin, verify through the real Storage API:

- A can upload an allowed file into A's folder; anonymous upload and A writing into B's folder fail.
- Oversized requests and disallowed declared MIME types fail even without Vue.
- A and B cannot overwrite, upsert, delete or move existing objects in this bucket.
- The public URL loads without authentication, including while pending. That is the chosen visibility contract.
- A pending submission can be created with the URL; the admin can view and approve it; the published activity uses that same URL.
- Repeated approval yields one activity and keeps the photo accessible.
- A cannot use review RPCs to approve the submission or update its review fields.
- Setup can be rerun and unrelated buckets still obey their original policies.

Check actual returned errors and final object/row state. Some denied operations may report success with zero affected objects; the HTTP status alone does not prove deletion or modification occurred. SQL policy text checks and browser mocks do not replace these checks.

### 11. Run checks and update the specification

From `WAD2DO code/wad2do`:

```sh
pnpm run build
CI=1 pnpm run test:e2e e2e/submissions.spec.js e2e/admin-review.spec.js e2e/activity-detail.spec.js --project=chromium
```

Run the repository's lint tools in check-only mode against changed source/tests; the default `pnpm run lint` uses `--fix` and can alter unrelated files. Run any small pure-validation tests with `node --test` if a helper warranted extraction; do not create a helper only to duplicate implementation in tests.

Update `docs/submissions.md`, `docs/admin-review.md` and the parent project `AGENTS.md` photo/specification entries after implementation. State exactly which setup steps were applied and which tests ran. A saved SQL file is not an applied migration. Do not claim deployment or live permission verification based on mocked tests.

Deploy bucket configuration and policies before releasing the frontend. Check one no-photo submission and one photo submission using a phone-sized viewport after deployment.

## Files the coding agent should expect to touch

| File | Purpose |
| --- | --- |
| `src/views/SubmitActivityView.vue` | File input, validation, preview, upload and safe retry integration |
| `docs/sql/activity_image_storage.sql` (new) | Dedicated bucket configuration and scoped policies |
| `e2e/submissions.spec.js` | Mock uploads and exercise failure/recovery cases |
| `e2e/admin-review.spec.js` | Photo review and publication coverage |
| `e2e/activity-detail.spec.js` | Add or reuse targeted published-image coverage if needed |
| `docs/activity-photo-uploads.md` (new) | Setup, live permission checks, visibility and retention |
| `docs/submissions.md`, `docs/admin-review.md` | Replace obsolete upload notes with final behaviour |
| Parent `AGENTS.md` | Update the single-source project specification without touching embedded image data |

Other files should change only if a demonstrated failure requires it. No new dependency or package-script change is required. Preserve existing local changes.

## Copyable instruction for the coding agent

Implement the optional activity photo upload described in this document. Read the named source paths before editing. Use one photo, the installed Supabase client, a dedicated public activity-images bucket and the existing image_url fields. Implement the steps in order, including scoped upload-only policies, preview validation, immutable object names, lost-response recovery and tests. Preserve the current no-photo form, admin approval, Google venue links and local edits. Keep cleanup manual and document the limit. Finish with changed files, checks actually run, and setup/live checks still outstanding. Do not claim SQL was applied or a feature deployed unless you performed and verified those actions.

## Sources checked

- [Supabase bucket visibility](https://supabase.com/docs/guides/storage/buckets/fundamentals): public URLs bypass retrieval access control; writes remain controlled.
- [Bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets): server-side size and declared MIME restrictions.
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control): upload policies, folder restrictions, upsert permissions and secret-key boundaries.
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): permissive and restrictive policy composition.
- [Standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads): ordinary uploads fit this size and avoiding overwrites avoids cache inconsistency.
- [getPublicUrl](https://supabase.com/docs/reference/javascript/storage-from-getpublicurl): returns a URL for a public-bucket object; it does not confirm a successful upload.
- [Deleting objects](https://supabase.com/docs/guides/storage/management/delete-objects): delete files through Storage, not raw SQL metadata deletion.

Verdict: Reuse the existing image URL and approval flow. Finish Storage permissions and recovery semantics before adding the upload call.

Not checked: live database, bucket policies, credentials, production behaviour or runtime tests. This audit read the relevant source, configuration, SQL and tests; it did not execute the proposed feature. Public pending/rejected photos, retained unused files, no trusted content scanning and no per-account upload quota are explicit limits of this small-project design.
