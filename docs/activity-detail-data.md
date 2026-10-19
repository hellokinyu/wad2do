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

Long weekday names and provider weekday_text arrays such as ["Monday: Closed", "Tuesday: 10:00–18:00"] are also accepted. Missing days are shown as Hours unavailable. The highlighted day uses Asia/Singapore time. This helper formats display text; it does not implement the team's opening-hours checks for Plan.

Rating is displayed only when a valid value is available. For Google activities, connect the team's live Edge Function details before displaying a Google rating. Do not persist Google ratings in the activities table just to fill this UI.

The official website button accepts a supplied website or website_url value with an HTTP(S) URL. These fields are not in the current starting activities schema, so coordinate with the database owner or provide the website from the live details response. Missing website data leaves the button hidden.

Save uses favourites(user_id, activity_id). Share lists the authenticated user's group_members and groups, then inserts group_activities(group_id, activity_id, shared_by). These tables need the team's unique constraints and row-level security policies. Signed-out visitors get a login prompt; the login page is still a teammate's placeholder in this checkout.

Back returns to the previous route, or Activities for a direct visit. The Activities page remembers search, category, setting, area, price band and sorting in this browser tab so a detail-page round trip preserves the filter choices.

Cards show the activity's `description` below the price when available. Optional `price_note` text appears below the price on the detail page only, explaining the selected experience, fees and concessions. See [Activity prices and areas](activity-prices.md) for the 34-location price research and `supabase/seed-activity-prices.sql`, which adds this nullable column and fills missing prices/areas.

Code:
- src/views/ActivityDetailView.vue — layout and record loading.
- src/lib/activityDisplay.js — price, duration, hours, rating and link formatting.
- src/composables/useActivityActions.js — saved state, group sharing and short messages.

