# WAD2Do

IS216 Web Application Development II, group G7.

Planning a weekend outing with friends usually means juggling a group chat, a poll, a shared spreadsheet and a map app, and one person ends up deciding for everyone. WAD2Do puts the whole thing in one app: each person browses Singapore activities ranked for their interests, budget and home area, shares the ones they like to a group, and votes on them. Everyone marks when they're free, and the app builds an itinerary from the group's votes and free time, checking opening hours, budget, real travel time and the weather.

## Live site

**URL:** https://wad2do.vercel.app

Test accounts (you can also sign up with any email address and confirm it):

| Role | Email | Password |
| --- | --- | --- |
| Member | See README.txt in the submission | |
| Admin (can review community submissions and manage activities) | See README.txt in the submission | |

<!-- The logins are only in the submitted README.txt, because this repo is public. -->


Please use Google Chrome. The app is built phone-first and works from iPhone 6 width (375px) up to Bootstrap's XL breakpoint (1200px) and beyond.

### Try the main flow

1. Log in with a test account (or sign up), then finish onboarding: interests, budget, home MRT station, then your name and an animal avatar.
2. **Activities**: browse activities ranked for you, open one for details, save the ones you like (heart) and share a few to a group.
3. **Groups**: create a group with a date range and budget, or join one with an invite link or 6-character code.
4. In the group, **Activities** tab: vote Keen or Not keen on the shared activities.
5. **Availability** tab: tap or drag the times you're free (tap a date to mark the whole day). Then go to step 2, pick a time on the heatmap and press **Confirm time & build itinerary**.
6. **Itinerary** tab: see the planned stops with times, cost per person, travel between stops, why each stop was picked and wet-weather alternatives. You can edit times, reorder and swap stops.
7. **Profile**: change your preferences, see your saved activities and submissions, or delete your account.

Admins also get an admin area for reviewing community submissions and managing published activities.

Votes, shares and availability update live for everyone in the group. To see this, log in with the two test accounts in two different browsers and open the same group.

## Set up and run it locally

The submitted zip contains the full source code. The app's entry page is `index.html` in the project's top folder; Vite builds it together with the files in `src/`.

You need [Node.js](https://nodejs.org) 22.18 or newer (or 24.12 or newer) and pnpm.

1. Install pnpm once, if you don't have it:

   ```sh
   npm install -g pnpm
   ```

2. In the project's top folder, install the packages:

   ```sh
   pnpm install
   ```

   This project uses **pnpm only**. Don't run `npm install`, because it creates a second lockfile.

3. Create a file called `.env.local` in the project's top folder with the two Supabase values:

   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```

   TODO: say where graders get these values (for example, a `.env.local` included in the zip).

4. Start the app:

   ```sh
   pnpm run dev
   ```

   Then open http://localhost:5173 in Chrome. Log in with a test account above.

The database, login, file storage and the server-side API calls all run on our Supabase project, so there is no server to start locally.

## Run the tests

There are two kinds of tests:

| Folder | What they test | Run with |
| --- | --- | --- |
| `e2e/` | End-to-end: the app in a real browser, clicking through each feature like a user | `pnpm run test:e2e` |
| `tests/` | Unit: the planning logic on its own (route order, opening hours, weather, ranking) | `pnpm run test:unit` |

The end-to-end tests need the same `.env.local` as the app (see above), because they start it. They don't touch the real data, though: each test replaces Supabase and the outside APIs (Google Places, OneMap, the weather forecast) with fixed fake responses, so every run gets the same data and the results don't depend on what's in the database. The unit tests need nothing set up.

### End-to-end tests

```sh
pnpm exec playwright install   # once, downloads the test browsers
pnpm run test:e2e              # starts the app and runs every test in Chromium
```

The tests run headless (no browser windows open). Results print in the terminal; to see each step and screenshots of any failure afterwards, run `pnpm exec playwright show-report`.

Useful variations:

```sh
pnpm run test:e2e:all                  # Chromium, Firefox and WebKit (Safari)
pnpm run test:e2e e2e/auth.spec.js     # one test file
pnpm run test:e2e -g "login"           # only tests whose name contains "login"
pnpm run test:e2e --headed             # watch the browser while the tests run
pnpm run test:e2e --debug              # step through a test
```

A test that fails is retried once. If the retry passes, the report lists it as **flaky** instead of failed; this can happen when all three browsers run at once on a busy laptop.

Tests find elements by their `data-testid` attribute, so they don't break when text or styling changes.

What each core user journey is tested by:

| User journey | Test files in `e2e/` |
| --- | --- |
| Landing page and navigation | `vue.spec.js` |
| Sign up, log in, log out, protected pages | `auth.spec.js` |
| Onboarding and profile (interests, budget, MRT station, avatar) | `onboarding.spec.js`, `profile-identity.spec.js`, `profile-preferences.spec.js` |
| Delete account | `profile-delete-account.spec.js` |
| Browse, filter and open activities; save favourites | `activities.spec.js`, `activity-detail.spec.js`, `activity-favourites.spec.js` |
| Share activities to a group | `activity-sharing.spec.js` |
| Create, join and manage groups | `group-database.spec.js`, `group-actions-preview.spec.js`, `group-stage-colour.spec.js` |
| Vote on the group's activities | `group-activities.spec.js` |
| Mark availability and choose the group's time | `availability-flow.spec.js`, `group-database.spec.js` |
| Build, edit and save the itinerary | `itinerary-hours.spec.js`, `itinerary-live-hours.spec.js`, `itinerary-editing.spec.js`, `itinerary-safeguards.spec.js`, `itinerary-failure-states.spec.js` |
| Submit a community activity; admin review | `submissions.spec.js`, `admin-review.spec.js`, `admin-activities.spec.js` |

### Unit tests

```sh
pnpm run test:unit
```

These use Node's built-in test runner, so there is nothing to install. Expect 6 of them to show as **skipped**: the `*.database.test.js` files check the SQL in `docs/sql/` against a real PostgreSQL database. They only run with [`psql`](https://www.postgresql.org/download/) installed and `WAD2DO_DISPOSABLE_DATABASE_URL` set to a throwaway database with the SQL from `docs/sql/` applied (see [Group database setup](docs/group-database.md)). Never point it at the shared Supabase project, because the tests change its data.

## Technologies, APIs and data

| Part | What we used |
| --- | --- |
| Front end | HTML, CSS and JavaScript with Vue 3 (Vite, Vue Router) and Bootstrap 5 |
| Data store | Supabase: PostgreSQL database, Auth for login, Storage for activity photos, Realtime for live group updates, Edge Functions for server-side API calls |
| Testing | Playwright (end-to-end) and Node's built-in test runner (unit) |
| Hosting | Vercel |

External APIs, all called with asynchronous HTTP requests:

- **Google Places API (New)**: activity search, details, photos and opening hours. Called from Supabase Edge Functions (`supabase/functions/google-place-*`) so the API key stays on the server. Only each place's ID is stored, as Google's terms require.
- **OneMap API** (Singapore Land Authority): real travel times between stops. Called from the `onemap-route` Edge Function.
- **data.gov.sg weather forecasts** (NEA): 24-hour and 4-day forecasts, used to suggest indoor alternatives when showers are expected, or when the outing is too far ahead to have a forecast yet (`src/lib/weatherForecast.js`).

Data sources: Google Places, the Singapore Tourism Board's Tourist Attractions dataset on data.gov.sg, our own curated activity data, and approved community submissions. Curated photos are in `public/images/`.

Open-source libraries we used (all free): Vue, Vue Router, Bootstrap, Supabase JS, [qrcode](https://www.npmjs.com/package/qrcode) (invite QR codes) and Playwright.

## Use of AI

Used AI to generate initial structure of application, planning of the app features. Used it to generate the test scripts. Used for code review. Used to review application design, and ask for improvements.

## Other commands

| Command | What it does |
| --- | --- |
| `pnpm run build` | Builds the production version into `dist/` |
| `pnpm run preview` | Serves the built version at http://localhost:4173 |
| `pnpm run lint` | Checks the code for mistakes (oxlint and ESLint) and fixes what it can |
| `pnpm run format` | Formats everything in `src/` with Prettier |

## Project structure

```
index.html             the entry page
src/
  main.js              starts the app, loads Bootstrap and the router
  App.vue              navbar + the current page
  router/index.js      every page's URL
  lib/                 the Supabase connection and the planning logic (ranking, route order, opening hours, weather)
  views/               one file per page (e.g. ActivitiesView.vue)
  components/          reusable pieces (NavBar, ActivityCard)
    group/             the three tabs inside a group page
  assets/styles.css    shared styles and colours
supabase/functions/    Edge Functions that call Google Places and OneMap
docs/                  setup guides and the database SQL
e2e/                   Playwright end-to-end tests (helpers/ holds the shared fakes)
tests/                 unit tests for src/lib, run with Node's test runner
vercel.json            makes page refreshes work on Vercel
```

## Deployment (Vercel)

The app is deployed on Vercel from the GitHub repo.

- **Environment variables** (Vercel → Project → Settings → Environment Variables): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the same values as `.env.local`. Redeploy after changing them, because Vite builds them into the app.
- **Page refreshes:** `vercel.json` sends every URL to `index.html`, so refreshing a page like `/groups/…/availability` works instead of showing a 404.
- **Login redirects:** in Supabase → Authentication → URL Configuration, the Site URL must be `https://wad2do.vercel.app` and `https://wad2do.vercel.app/login` must be in the Redirect URLs, or confirmation emails link to localhost (see [Authentication setup](docs/authentication.md)).
- **API keys:** the Google Places and OneMap keys are Supabase Edge Function secrets, so they never reach the browser or Vercel.

## For the team

The full project specification, page owners and team guides are in the group's Google Doc, the **WAD2Do Handbook**. For the Supabase values, ask kinyu; never commit `.env.local`.

See [Authentication setup](docs/authentication.md) for email confirmation redirect URLs and session behaviour, and [Group database setup](docs/group-database.md) for the database functions the group pages need. Profile → Delete account needs [`docs/sql/delete_account.sql`](docs/sql/delete_account.sql) run once in the Supabase SQL Editor, after `group_members.sql`.

How we work:

- `main` is protected. Every change goes through a pull request approved by one teammate.
- One branch per task, named after it (e.g. `activities-filters`).
- Stick to your own files. Changes to shared files (`router/index.js`, `main.js`, `App.vue`, `lib/supabase.js`) go in small, separate pull requests; mention them in the group chat first.

### Submission checklist (due Week 12, Friday 9am)

The zip on eLearn (Assignments → Final Project Deliverables) needs three things:

1. **The web app source**, with `index.html` in the top folder. Leave out `node_modules`, `dist`, `playwright-report`, `test-results`, `.git`, `.claude`, `.cursor`, `.vscode` and `.impeccable`.
2. **`README.txt`**: a copy of this file with the remaining TODOs filled in (where graders get the Supabase values, use of AI), and the two test account emails and passwords put into the table. Don't commit `README.txt` or the passwords, because this repo is public.
3. **Presentation slides** (.pptx or .pdf) with the YouTube link to the recorded presentation (max 12 minutes, at least 720p, unlisted or public) on the title slide.

Before submitting, check the live site in Chrome from iPhone 6 width up to 1200px, logged out and with each test account.
