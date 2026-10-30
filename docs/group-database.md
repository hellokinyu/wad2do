# Group database and privacy fixes

This batch fixes full-profile access, access to other groups, partial availability saves,
partial group creation, and partial settings/itinerary updates. Read-only inspection of
the connected WAD2Do project on 28 Oct 2026 confirmed PostgreSQL 17.11, the expected
columns and keys, and overly broad existing policies. No user records were fetched.
Database changes must be announced before they are applied.

## Planning consistency repair — 30 Oct 2026 (applied)

With explicit approval, the frontend was published on `fix/group-planning-consistency`
and `group_planning_consistency` was applied to shared WAD2Do Supabase. Teammates must
use this branch (or its eventual merge), restart their local app and refresh older tabs.
Live read-only checks confirmed the revision column, both triggers, checked-save grants,
closed direct itinerary writes and the five expected Realtime tables. Anonymous execution,
missing-identity saves and browser revision forgery are denied; row-level security remains
enabled. All seven inspected tables kept identical existing-data fingerprints, including
all five saved itineraries. No live user records were created, edited or deleted for tests.

The only added security advisory is the expected
[signed-in SECURITY DEFINER function notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
for `save_group_itinerary`. Signed-in execution is intentional; the function checks identity,
membership and revision internally, and anonymous/trigger-function execution is denied.
Existing advisories were unchanged. Validation passed: 283 Chromium tests, 40 local tests
(including isolated PostgreSQL checks), lint and production build. Successful live browser
saves and actual multi-client Realtime events remain untested.

After sharing the updated frontend, run [group_planning.sql](sql/group_planning.sql)
**last**, after the existing group scripts. It adds `groups.plan_revision`, checked
`save_group_itinerary` calls, atomic chosen-time invalidation, and Realtime publication
for availability, group members and groups. Existing plans are preserved during setup.
Older frontend tabs must refresh: direct itinerary inserts, updates and deletes are
revoked so an older client cannot bypass the revision check. Do not apply this permission
change before the updated frontend has been shared. The new frontend requires this SQL.

Every itinerary write (including admin edits/deletions), budget/date change, or chosen-time
change advances the revision. A save locks the group and rejects a stale revision with
`40001`; its draft stays visible until the member explicitly loads the latest plan.
The database derives the author and total cost. Changing the chosen start or end removes
the old plan in the same transaction. Reconfirming the same time preserves it. A failed
new generation leaves no obsolete plan attached to the new time; generation with an
unchanged chosen time still preserves the previous plan on failure.

Save waits for the latest travel calculation, and late responses cannot retime a discarded
or superseded draft. Reading a saved plan loads route information without changing its
saved stop times. Shared availability refreshes after database events and reconnects;
it preserves personal selections, pending saves, mode, selected range and pagination.
Refresh failures have their own retry message instead of replacing the editable grid.

The planning test uses an isolated PostgreSQL engine and never connects to shared Supabase:

```sh
WAD2DO_PGLITE_MODULE=file:///path/to/@electric-sql/pglite/dist/index.js pnpm exec node --test tests/groupPlanning.database.test.js
```

It checks stale saves, member/anonymous permissions, input validation, publication setup,
repeated installation, admin-write invalidation, and rollback if old-plan deletion fails.
The older SQL verification scripts below test the pre-planning setup, which allowed direct
member itinerary writes; run those before this final permission change. Browser regressions
cover conflicting editors, delayed travel, Discard, new chosen times, and real client
WebSocket handling with intercepted events. Live multi-connection/Realtime writes remain
outside these local checks.

## Rollout status — 28 Oct 2026

The `batch_1_group_transactions` migration installed the six new functions in WAD2Do
after a heads-up. It did not change existing app data or switch table policies.
The frontend changes were merged into `main` in PR #27; the team is using localhost.
After explicit rollout approval and a heads-up, `batch_1_group_privacy_policies` applied
**group_members.sql to the shared WAD2Do database on 28 Oct 2026**. The restrictive
rules are now active, including on localhost because it uses that shared database.
Everyone must pull current `main`, restart the local app, and refresh older tabs.
After a heads-up, `batch_1_require_invite_code` updated only the join function and its
execute permissions. A read-only check confirmed UUID-only joins are rejected and
anonymous/PUBLIC execution remains denied; no app data or table policies changed.
The follow-up invite fix requires the existing invite code even when joining by URL.
New invite links include `?invite=CODE`; old links without the code need to be copied
again by a member, or the recipient can use the existing code on the Groups page.

Read-only checks on the live database passed for member access, outsider denial,
private profiles, member-name lookup, bounded invite previews, and admin profile
access without access to unrelated groups. Anonymous table/function access and direct
membership/availability writes are denied; normal preference edits remain permitted.
Record counts across all seven affected tables were unchanged by the rollout. The
security advisory summary was unchanged. No test records or user-data writes were made.
Real browser create/join/save actions against the shared database remain to be checked.

Post-rollout API check: the votes-to-shortlist foreign key also exposes a second
PostgREST relationship from `group_activities` to `activities` through `votes`.
An unqualified `activities(...)` embed returns `PGRST201` (ambiguous relationship),
even though SQL permissions and function definitions match. The group shortlist now
uses `activities!group_activities_activity_id_fkey(...)` to select the direct link.
The browser mock reproduces the ambiguity to prevent this regression. The fix needs
the updated frontend; it does not require another database migration.

## Apply it yourself

Use the existing project in **Supabase → SQL Editor** as the database owner (`postgres`).
Do not put a database password or service-role key in `.env.local`.

1. Run [inspect_group_database.sql](sql/inspect_group_database.sql) if you want to inspect
   the existing columns, constraints, grants and policies first. It only reads schema
   information. It returns five rows together: columns, constraints, policies, grants and
   functions. Save all five rows with your existing schema backup. Both helper functions
   in the functions row should exist on the current installation. If the admin helper is
   missing, install the existing [admin setup](admin-review.md) first.
2. Run **all of [group_transactions.sql](sql/group_transactions.sql)**. This installs
   six functions and their execute permissions. It does not replace tables, delete
   existing data, or close profile access yet, so the old frontend can keep working.
3. Deploy or share the updated frontend from `main`. For local testing, pull current
   `main`, restart `pnpm run dev`, and refresh open tabs after step 2. The existing membership helper must be installed; on a
   fresh database, run step 4 before opening the app.
4. Only after the updated frontend is deployed/shared, run **all of
   [group_members.sql](sql/group_members.sql)**. It restricts group data to members,
   profiles to their owner/admin, and votes/shares to their author for writes. It also
   limits direct table writes and makes future shortlist removals cascade to their votes.
   Refresh all open app tabs; older clients cannot use their old direct join requests.

Each script runs in a transaction: a SQL error rolls back that script. Both scripts can
be rerun. They preserve existing groups, votes, availability, itineraries and profiles.
The frontend needs these functions: deploy the SQL before using the new forms.

## What changed

- `get_group_member_names(p_group_id)` returns only member IDs and display names.
  A caller must belong to that group; an admin does not bypass this check.
- `wad2do_group_details(p_group_id)` returns the full header for a member. A signed-in
  person with an invite-link UUID sees only the group name, dates and member count.
  Raw table reads cannot list groups the caller has not joined or expose their codes.
- `wad2do_join_group(...)` requires the invite code, locks the group, and inserts only
  the actual signed-in user's membership. A link also supplies its group UUID, which
  must match the code's group. A UUID alone is rejected: Realtime DELETE events can
  expose primary keys regardless of row-level security. Repeated joins are harmless.
- `create_group(...)` creates the group and creator membership together. The client
  keeps the same group ID while its create form is open, so retrying a lost response
  returns the original group, including its original name and settings. Reopening the
  form starts a new creation attempt.
- `replace_group_availability(p_group_id, p_slots, p_expected_user_id)` derives the user from the login,
  checks membership and Singapore half-hour slots, and replaces only that user's rows.
  It rejects an account change instead of saving the old account's selection for the new one.
  An empty array intentionally clears their availability; null is rejected. An insert
  failure rolls the deletion back. Later drags are queued; a failed request retains the
  selection and has its own retry button. Each save keeps its original group/account;
  leaving the page cancels the pending request and drops queued selections. Cancellation
  cannot undo a request already committed by the server. Lost responses are safe to retry.
- `update_group_settings(...)` checks membership and current dates under a group lock.
  If dates exclude the chosen time, explicit confirmation is required before clearing
  both that time and the itinerary in one transaction. A failure preserves both.
- Settings, availability replacement, member removal and group deletion lock the same
  group row, so these operations cannot interleave midway through their writes.

The functions run with database-owner permissions, so each checks the signed-in user
inside the function. Their search path is empty, tables are qualified, and anonymous
execution is revoked. The policy script adds restrictive member checks so older broad
policies cannot override them. Direct membership and availability writes are revoked;
the app uses the checked functions. Admin profile flags cannot be changed by a browser.
Only the group tables and profile permissions are in scope, not the whole Supabase project.

The new votes-to-shortlist foreign key uses `NOT VALID` to preserve any historical
orphan rows while checking all new writes. Future shared-activity removals delete their
votes atomically. The live preflight found zero orphan votes and zero groups missing dates.

## Check after applying

Use two ordinary test accounts in the same group, plus one account outside it.

1. Create a group. It should appear once and list its creator as a member.
2. Open Activities, Members and Availability. Member names should still show.
3. In a signed-in browser, reading your own profile should still work. A direct profile
   request for the other member's ID should return no row, even when requesting their
   `home_station_id`. The names function must reject the outside account.
4. Mark availability, reload, clear the last slot, and reload again. Mark several slots
   quickly: the latest complete selection should persist.
   With a slow save, make another selection and leave for a different group. The first
   group's queued selection must never replace availability in the second group.
5. Block `replace_group_availability` in browser developer tools and mark another slot.
   The selection must remain with a retry message. Unblock and retry; reload to confirm.
6. Change group dates so the chosen time falls outside them. Cancel the confirmation:
   nothing should change. Accept it: dates update and both time and itinerary clear.
7. Own Profile preferences and admin submission review should still work. Another
   account must not read or change another group's votes, availability or itinerary,
   forge a membership, or overwrite another member's vote/share. A real invite still joins.
   A group URL without `?invite=CODE`, a wrong code, or a code for another group must
   never grant membership. Check links copied from both group creation and Invite.

For SQL fault-injection tests, use **only a disposable database** with two ordinary
profiles, one admin and two catalogue activities. Run
[verify_group_database.sql](sql/verify_group_database.sql) and
[verify_group_access.sql](sql/verify_group_access.sql) after both scripts. They install
temporary broad policies/failing triggers, test
the real functions, and rolls everything back. Do not run that test script on the shared
project. With `psql` and `WAD2DO_DISPOSABLE_DATABASE_URL` configured, run:

```sh
pnpm exec node --test tests/groupDatabase.database.test.js
```

The local verification executes these SQL scripts in temporary PGlite/PostgreSQL with
[test fixtures](../tests/fixtures/groupDatabase.sql) based on the exported columns,
keys and policies, plus minimal Auth/activity stubs and fake accounts. Fixtures must
never be run against the real project. No fault-injection tests run on the live database.
Browser tests mock Supabase and check the UI/API contract; they do not verify deployment
or independent PostgreSQL connections running at the same time.

The follow-up checks passed: 199 Chromium tests, 25 unit tests, both disposable SQL
verification scripts (including UUID-only/mismatched-code rejection), lint and production
build. Three opt-in external-database tests were skipped; the group SQL verification
scripts were run separately in PGlite. Live checks used a read-only transaction and did
not attempt a successful join or alter any existing membership.

Supabase's [signed-in function-execution advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
also lists the new privileged RPCs. Signed-in execution is intentional: the functions
check identity/membership internally, use an empty search path, and deny anonymous and
PUBLIC execution. This warning alone is not a failed permission check. Existing signup
trigger/password-setting advisories are outside this group rollout and were not changed.
