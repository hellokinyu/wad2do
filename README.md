# WAD2Do

A web app for planning weekend outings in Singapore with friends. Users browse activities ranked for them, share them to a group, vote, mark when they're free, and get an itinerary built from the group's votes and availability.

IS216 Web Application Development II, group G7.

Built with Vue 3 (Vite, Vue Router), Bootstrap 5, Supabase (database, login and Realtime) and Playwright for end-to-end tests.

The full project specification, page owners and team guides are in the group's Google Doc, the **WAD2Do Handbook**.

## Run it locally

You need Node.js 24.15 or newer and pnpm. This project uses **pnpm only**. Never run `npm install`, because it creates a second lockfile.

```sh
npm install -g pnpm     # once per laptop, if you don't have pnpm yet
pnpm install            # once, and again whenever someone adds a package
```

Create a file called `.env.local` in the project's top folder with the two Supabase values (ask kinyu for them; never commit this file):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Start the app:

```sh
pnpm run dev
```

Then open http://localhost:5173. The page reloads by itself when you save a file.

See [Authentication setup](docs/authentication.md) for email confirmation redirect
URLs, session behavior, changed files, and the profile creation checks still needed.
Before using the updated group forms, follow [Group database setup](docs/group-database.md)
to install the atomic writes and names-only member lookup, then close shared profile access.

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

Tests find elements by their `data-testid` attribute, so add one to anything a test clicks or checks.

### Unit tests

```sh
pnpm run test:unit
```

These use Node's built-in test runner, so there is nothing to install. Expect 6 of them to show as **skipped**: the `*.database.test.js` files check the SQL in `docs/sql/` against a real PostgreSQL database. They only run with [`psql`](https://www.postgresql.org/download/) installed and `WAD2DO_DISPOSABLE_DATABASE_URL` set to a throwaway database with the SQL from `docs/sql/` applied (see [Group database setup](docs/group-database.md)). Never point it at the shared Supabase project, because the tests change its data.

## Other commands

| Command | What it does |
| --- | --- |
| `pnpm run build` | Builds the production version into `dist/` |
| `pnpm run preview` | Serves the built version at http://localhost:4173 |
| `pnpm run lint` | Checks the code for mistakes (oxlint and ESLint) and fixes what it can |
| `pnpm run format` | Formats everything in `src/` with Prettier |

## Project structure

```
src/
  main.js              starts the app, loads Bootstrap and the router
  App.vue              navbar + the current page
  router/index.js      every page's URL
  lib/supabase.js      the Supabase connection; import it with `import { supabase } from '@/lib/supabase'`
  views/               one file per page (e.g. ActivitiesView.vue)
  components/          reusable pieces (NavBar, ActivityCard)
    group/             the three tabs inside a group page
  assets/styles.css    shared styles
e2e/                   Playwright end-to-end tests (helpers/ holds the shared fakes)
tests/                 unit tests for src/lib, run with Node's test runner
vercel.json            makes page refreshes work after deploying to Vercel
```

## How we work

- `main` is protected. Every change goes through a pull request approved by one teammate.
- One branch per task, named after it (e.g. `activities-filters`).
- Stick to your own files. Changes to shared files (`router/index.js`, `main.js`, `App.vue`, `lib/supabase.js`) go in small, separate pull requests; mention them in the group chat first.

## Submission

The briefing asks for a `README.txt` in the submitted zip. Before submitting, copy this file to `README.txt` and add the deployed URL and any test accounts.
