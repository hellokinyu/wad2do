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

The end-to-end tests are in the `e2e/` folder.

```sh
pnpm exec playwright install   # once, downloads the test browsers
pnpm run test:e2e              # starts the app and runs every test
```

Useful variations:

```sh
pnpm run test:e2e --project=chromium   # Chromium only (faster)
pnpm run test:e2e e2e/vue.spec.js      # one test file
pnpm run test:e2e --debug              # step through a test
```

Tests find elements by their `data-testid` attribute, so add one to anything a test clicks or checks.

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
e2e/                   Playwright tests
vercel.json            makes page refreshes work after deploying to Vercel
```

## How we work

- `main` is protected. Every change goes through a pull request approved by one teammate.
- One branch per task, named after it (e.g. `activities-filters`).
- Stick to your own files. Changes to shared files (`router/index.js`, `main.js`, `App.vue`, `lib/supabase.js`) go in small, separate pull requests; mention them in the group chat first.

## Submission

The briefing asks for a `README.txt` in the submitted zip. Before submitting, copy this file to `README.txt` and add the deployed URL and any test accounts.
