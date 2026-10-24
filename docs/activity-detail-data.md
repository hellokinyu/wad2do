# Activity Detail data

The detail page reads one activity from Supabase by its UUID. The page uses the handbook's monochrome style and AGENTS.md's content sections.

Descriptions for all 38 curated activities in the supplied database export are ready in `supabase/fill-activity-descriptions.sql`. See [the description preview and instructions](activity-descriptions.md). The script fills only blank descriptions by UUID and exact name, creates no helper table, and has not been applied to the live database.

Your downloaded photos are already in public/images. Use these exact paths in the corresponding activities.image_url fields:

| Activity | image_url |
|---|---|
| Cafés in Tiong Bahru | /images/tiong-bahru-cafes.jpg |
| Sunset Kayaking | /images/sunset-kayaking.jpeg |
| Picnic at Marina Barrage | /images/marina-barrage.jpeg |
| Pottery Workshop | /images/pottery-workshop.jpeg |

The three .jpeg filenames must not be entered as .jpg unless the files are renamed as well. The page does not hardcode a photo for each activity.

Opening hours can use a weekday map. Example structure only — these are not verified venue hours:

~~~json
{
  "Mon": { "closed": true },
  "Tue": { "open": "10:00", "close": "18:00" },
  "Wed": { "open": "10:00", "close": "18:00" },
  "Thu": { "open": "10:00", "close": "18:00" },
  "Fri": { "open": "10:00", "close": "20:00" },
  "Sat": { "open": "10:00", "close": "20:00" },
  "Sun": { "closed": true }
}
~~~

Long weekday names and provider weekday_text arrays such as ["Monday: Closed", "Tuesday: 10:00–18:00"] are also accepted. Provider descriptions can use full names or three-letter weekday abbreviations, case-insensitively (for example, "Sun: 18:00–06:00"). Missing days are shown as Hours unavailable. The highlighted day uses Asia/Singapore time. This helper formats display text; it does not implement the team's opening-hours checks for Plan.

Rating is displayed only when a valid value is available. Activities with a `google_place_id` now call the deployed `google-place-details` Edge Function using `supabase.functions.invoke('google-place-details', { body: { activityId: activity.id } })`. The signed-in session is sent by the shared client; the Google API key stays in the Edge Function's `GOOGLE_MAPS_API_KEY` secret. The function must validate the user, read the activity's Place ID under RLS, and return Google Place Details fields. No Google key or service-role key belongs in the frontend.

Live details load independently of the activity, so Save, Share and the rest of the page remain usable. The page shows the live rating and review count, and prefers `currentOpeningHours.weekdayDescriptions`, then `regularOpeningHours.weekdayDescriptions`, then saved activity hours. Saved fallback hours are labelled; missing Google ratings remain unavailable instead of showing a stored rating for a Google-linked activity. Google Maps attribution appears next to live content, including review counts of zero when no rating or Google hours are available, with any returned provider attributions rendered as text or safe HTTP(S) links. Today is still highlighted in Singapore time.

Failed Google requests show a separate retry alert without hiding the activity. Requests are aborted after 15 seconds so a stalled connection also offers Retry; retrying fetches only Google details. Route changes and unmounts invalidate pending responses. Activities without a Place ID skip the function. Google details are held only in component memory, never written to Supabase, localStorage or sessionStorage. The weekday descriptions are for display only; this change does not implement Plan's structured opening-hours checks or Routes travel times.

Verification: `e2e/activity-detail.spec.js` mocks the function response and covers live details, attribution, current/regular/saved hours, missing fields, independent loading, retry and late-response navigation. Run `pnpm exec playwright test e2e/activity-detail.spec.js --project=chromium` against the local dev server. This does not call Google or validate the live function deployment.

The official website button accepts a supplied website or website_url value with an HTTP(S) URL. These fields are not in the current starting activities schema, so coordinate with the database owner or provide the website from the live details response. Missing website data leaves the button hidden.

Save uses favourites(user_id, activity_id). Share lists the authenticated user's group_members and groups, then inserts group_activities(group_id, activity_id, shared_by). These tables need the team's unique constraints and row-level security policies. Signed-out visitors get a login prompt; the login page is still a teammate's placeholder in this checkout.

Back returns to the previous route, or Activities for a direct visit. The Activities page remembers search, category, setting, area, price band and sorting in this browser tab so a detail-page round trip preserves the filter choices.

Cards show the activity's `description` below the price when available. Optional `price_note` text appears below the price on the detail page only, explaining the selected experience, fees and concessions. See [Activity prices and areas](activity-prices.md) for the 34-location price research and `supabase/seed-activity-prices.sql`, which adds this nullable column and fills missing prices/areas.

Code:
- src/views/ActivityDetailView.vue — layout and record loading.
- src/lib/activityDisplay.js — price, duration, hours, rating and link formatting.
- src/composables/useActivityActions.js — saved state, group sharing and short messages.

