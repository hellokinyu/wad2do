# Availability to itinerary

The Availability tab has two steps: **Your availability** and **Choose group time**.
Personal answers autosave; selecting a group range is a local draft until confirmed.
The existing grid, availability replacement function and itinerary save function are reused.
No database migration is needed.

## Screen behaviour

- Step 1 explains personal marking, shows the response count and save status, and ends with
  **Choose group time**. That action waits for all queued personal saves to finish. A failed
  personal save keeps the selections and blocks planning until retried successfully.
- Step 2 puts existing all-free windows before the heatmap. Suggestions select a complete
  range; manually selecting a range requires the first and last half-hour blocks, including
  two clicks on the same block for 30 minutes. A partial draft cannot use an older saved time.
- The action summary shows the actual range, duration, people free throughout the whole
  range, and group budget. Different members being free in successive blocks do not count
  as someone who can attend the entire outing.
  🎉 marks everyone-free blocks, suggestions and selected ranges. ⭐ marks tied best blocks
  from the responses so far, even while members have not answered, and selected ranges that
  retain that many of the same members throughout. Pending responses label the result Best so far.
- A complete new range enables **Confirm time & build itinerary**. A saved time with no plan
  enables **Build itinerary**. An unchanged time with an existing plan enables **View itinerary**,
  which opens the saved plan without regenerating it. Clear selection restores the saved-time action.
- On desktop the summary sits beside the grid. On tablet and phone it stays at the bottom
  of the viewport, above the mobile navbar. Its measured height reserves space below the page;
  short viewports allow the action panel to scroll.
- The former celebration dialog is replaced by inline suggestions, so live responses do not
  interrupt marking or change the current step. Explicit step navigation moves focus to its heading.

## Request sequence and ownership

`GroupAvailabilityTab.vue` waits for a selected group time to save before navigating to
`group-itinerary?replan=1`. It retains the draft and reports save errors inline. Confirmation
locks its controls; leaving aborts the request and ignores late responses. Viewing a saved
plan uses the plain itinerary route instead.

`GroupItineraryTab.vue` owns generation and persistence. It shows real loading/building/saving
states, and reports success only after saving a nonempty plan. A generated result with no
stops offers Change time and Back to voting, and is not automatically saved. Successful
saves emit `plan-saved`, so `GroupDetailView.vue` refreshes its header stage after completion.
Stale saves return `PT409` rather than a retryable serialization error. Their drafts remain
visible and Save stays disabled until the member explicitly loads the latest plan.
Empty drafts use the confirmed outing start. Saving waits for travel calculations, then
rejects stops outside the confirmed time window while keeping the draft and showing an error.
The initial group/votes/plan/activity reads share one 30-second deadline. A stalled read
shows the retry screen; leaving or retrying aborts the previous read and ignores late responses.

The existing `group_planning.sql` trigger invalidates the previous itinerary when the
confirmed start or end changes. The summary warns before **Replace time & rebuild**.
If generation then fails, the new group time remains saved and the itinerary offers retry
or a change of time. There is no rollback of the old plan. Reusing the same confirmed time
does not invalidate it. Existing revision checks continue to protect itinerary saves.

## Verification

Run the focused checks against a production build:

```sh
pnpm run build
CI=1 pnpm exec playwright test e2e/availability-flow.spec.js e2e/group-database.spec.js e2e/itinerary-hours.spec.js e2e/itinerary-editing.spec.js e2e/itinerary-safeguards.spec.js e2e/group-stage-colour.spec.js --project=chromium --retries=0 --workers=2
```

These use intercepted Supabase, routing and weather requests. They cover phone/tablet/desktop
and phone landscape, keyboard access, failed and queued saves, deliberate range selection,
replacement warnings, navigation during confirmation, nonempty generation, saved-plan
reopening and the existing itinerary editing/conflict checks. They do not verify the shared
Supabase deployment or live third-party APIs.
