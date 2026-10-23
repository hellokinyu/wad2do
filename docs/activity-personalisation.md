# Basic activity personalisation


## Ranking rule

Best match orders activities by the sum of:

| Match | Points |
| --- | ---: |
| Category matches any saved interest | 4 |
| Known price is below the saved budget's upper limit | 2 |
| Area matches the saved home area | 1 |

Interest points are awarded once. Equal scores keep catalogue order (the activities query orders by ID). Ranking returns a new array without changing catalogue records.

Budget preferences are spending limits: `under-20` means below S$20, `20-50` below S$50, and `50-100` below S$100. Cheaper activities, including free ones, qualify. `100-plus` gives affordability points to any known nonnegative price. Missing/invalid prices and missing/unrecognised budgets receive no affordability points. Explicit price filters still use their existing lower and upper boundaries.

Category matching ignores case, accents and surrounding spaces. Initial aliases:

| Catalogue category | Onboarding interest |
| --- | --- |
| Cafés | Cafes |
| Outdoor | Outdoors |
| Workshops | Arts and culture |
| Sports and fitness | Wellness |

Other categories match their corresponding interest directly. Social games has no inferred match with Friends or Family-friendly. Company preferences do not affect ranking because the catalogue has no verified suitability fields.

Area matching ignores case and surrounding spaces, but uses the same label: Jurong does not match Jurong East or Jurong West. This is not distance-based ranking. Review catalogue and onboarding labels together before introducing wider area mappings.

## Loading and sorting

- Activities uses shared auth state and reads only `interests`, `budget` and `home_area` from the profile with the signed-in user's ID. Profile RLS remains responsible for database access control.
- Preferences and activities load independently. Best match waits for both requests to avoid flashing an unranked list first. Price and catalogue sorts show loaded activities without waiting for preferences; a later profile response does not override the selected sort.
- Best match is the default when there is no valid saved sort. Saved sorting/filter choices survive a detail-page visit.
- Filters run first. Best match ranks their results; catalogue order and either price sort override personalisation. Clear filters restores Best match.
- Above the grid, a live sort summary shows Best match with a saved-preferences explanation, the chosen price sort, or catalogue order. Missing, empty or failed preferences show catalogue order without claiming personalisation.
- Returning from Profile remounts Activities and reads the latest saved preferences. Changing signed-in accounts also reloads preferences; an older account's response cannot replace the current profile.
- Profile confirms one updated row before showing a save confirmation. A zero-row update shows an error, keeps the draft unsaved and allows a retry.
- No profile or empty preferences preserve catalogue order. A failed profile request shows a warning and retry button while browsing remains available in catalogue order for Best match.

## Expected examples

For interests Cafes, Outdoors and Wellness, budget Under S$20, home area Bishan:

| Fictional activity | Score |
| --- | ---: |
| Outdoor, Bishan, free | 7 |
| Café, Bugis, S$12 | 6 |
| Wellness, Bugis, S$40 | 4 |
| Food, Bishan, S$10 | 3 |
| Café, Bugis, unknown price | 4 |

The two scores of 4 preserve their relative catalogue order.

## Verification

`src/lib/activityRanking.js` owns scoring and sorting; `src/views/ActivitiesView.vue` loads preferences and ranks filtered activities.

Run `pnpm exec node --test tests/activityRanking.test.js` for examples, price boundaries, free/invalid prices, aliases, missing preferences, stable ties and unchanged inputs.

`e2e/activities.spec.js` uses mocked Supabase responses to check the signed-in profile ID, default ordering, filter/price-sort overrides, profile failure/retry, saving preferences through Profile, and a detail-page round trip.
