# Live opening hours during planning

Plan uses `google-place-details` with the saved activity ID. The existing function,
field mask, authentication and shared allowance remain unchanged. This is a frontend
change; deploy the frontend without a SQL migration or function redeployment.

Each activity is fetched at most once per planning attempt. Activities that already
fail the duration or budget checks need no lookup. Results and lookup failures stay
in component memory during that attempt and subsequent edits. Reload or Re-plan
starts fresh; leaving or changing accounts cancels/invalidates pending results.
Each lookup has a 15-second deadline, including response parsing. No automatic
Google retry occurs.

Audit fixes (5 Nov 2026): opening and closing points require explicit valid hours
and minutes, including zero values; incomplete points are unavailable. When
Re-plan fails, finishing the loading state also fetches missing hours for retained
stops, while preserving saved visit times and making no writes.

The full visit must fit a continuous opening interval **after travel is calculated**.
Structured periods support split opening times, overnight carryover, 24-hour venues,
and date-specific exceptions. Visits within the next seven days use
`currentOpeningHours`; dates outside that coverage use `regularOpeningHours` with
“Based on usual opening hours; holiday hours may differ.” A visit crossing the end
of the seven-day coverage also needs regular hours and carries that note.
`openNow` and human-readable weekday descriptions are never used to validate visits.

Missing Place IDs, missing/invalid hours, timeouts and API/quota failures produce
“Opening hours unavailable.” Automatic planning skips these candidates and shows
the reason under “Also voted for”. Saved catalogue hours do not replace a failed
live check. This also excludes manually curated/community venues without Place IDs,
even when they have independently maintained hours.

Opening a saved itinerary fetches fresh hours and displays any warnings while
preserving stored visit times and making no writes. Reorder, retime, Add anyway,
and rainy-day swaps check the same live periods; newly displayed activities get a
lookup if needed. Existing manual-edit behavior remains: opening-hours warnings
do not prevent an intentional save. Save waits for pending hours and travel checks.
Only the existing stop fields are persisted: activity ID, start/end, cost, reason
and travel-mode selection. Google hours, provisional notes and attributions are
never saved to Supabase or browser storage.

Google lookups use the shared **20/user/hour and 1,000/app/month** allowance.
Large shortlists, retries and reopened saved plans can consume it sooner. No quota
or counter changes were made. Google Maps and any returned provider attribution
appear beside checked stops.

References: [Google structured hours](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#OpeningHours),
[Places storage and attribution policies](https://developers.google.com/maps/documentation/places/web-service/policies),
and [existing function/allowance notes](google-place-details.md).

Verification covers the late-arrival example (21:27 arrival, 22:00 closing, one-hour
visit), exact closing boundaries, split periods, overnight carryover, special
closures, usual-hours notes, absent IDs, API/quota failures, deadlines, per-attempt
lookups, edits/swaps and reopening without writes. Tests use mocked Google responses
and consume no real Google allowance.
