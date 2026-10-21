# Authentication

The app uses the existing Supabase project and public key. No tables, SQL migrations,
triggers, or RLS policies were changed by this implementation.

## Local setup and confirmation emails

Keep these values in the root `.env.local` (already ignored by Git):

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

Vite exposes `VITE_` variables to the browser. Never use a secret or service-role key.
Restart `pnpm run dev` after changing environment variables.

In the Supabase dashboard, under **Authentication > URL Configuration**, verify:

- Site URL is your deployed app URL.
- Redirect URLs include `http://localhost:5173/login` and your deployed `/login` URL.
- If you run the app at another port or under a subpath, allow its actual `/login` URL too.
- When manually checking the production preview, allow `http://localhost:4173/login`.

The app requests `/login` as the confirmation email destination. Supabase handles
confirmation and returns the session in the URL. The client detects it and the
router sends the authenticated user to `/`. Failed/expired links show an error on
the login page, with a button to resend confirmation. Rate limits and password
requirements configured in Supabase still apply.

Signup success with no session means the user must check their email; it does not
grant access to protected pages. Login and confirmation both redirect to `/`.
Signed-in users see activity and group links there.

## Sessions and routes

`src/composables/useAuth.js` shares the current session and restores it using
`getSession()`. Supabase persists and refreshes tokens. The router waits for this
initial check before redirecting, including on page refresh.

Only `/`, `/signup`, `/login`, and the 404 page are public. All activity, group,
onboarding, profile, and admin routes require a session. Signing out also redirects
other open protected tabs. Login/signup redirect authenticated visitors home.

If Supabase clears the local session while returning a server logout error, the
login page displays that error so it is not lost during the redirect.

The admin route currently checks authentication only. The repository does not
define a trusted admin role field, so an admin role restriction has not been
invented. Confirm the team's role storage before implementing admin authorization.
Frontend route guards control navigation; database authorization remains the job
of the project's existing RLS policies.

## Profile creation still needs verification

Supabase Auth users and `public.profiles` are separate. Repository inspection found:

- `ProfileView.vue` reads and updates `display_name`, `interests`, `budget`,
  `home_area`, and `company`, matching `profiles.id` to the Auth user's ID.
- `OnboardingView.vue` reads and updates preferences on an existing row.
- There is no frontend profile insert, schema definition, trigger definition,
  migration, or database management connection in the repository.

This does **not** prove a database trigger is absent. The existing Supabase project's
profile creation process cannot be verified from these source files. The app does
not assume a trigger exists or attempt to insert an unverified profile shape.
The profile page displays a clear message when no row is visible. An absent row
and a row hidden by RLS can both produce that result.
Name editing and preference saving are disabled until the profile can be loaded.

Ask the teammate who configured Supabase to inspect the existing project and share:

1. The `public.profiles` columns, types, defaults, required fields, and foreign keys.
2. Any trigger on `auth.users` that creates a profile, plus its function definition.
3. Whether a signed-in user can select and, if needed, insert their own profile
   under the current policies.

If a trigger already creates profiles, keep using it. If no trigger exists, a
frontend fallback can create a missing profile **after email confirmation and
authentication**, using the verified columns and existing permissions. Do not insert
while signup has no session, overwrite an existing profile, change RLS, or add a
trigger without discussing any needed database changes first.

Until this is verified, authentication works independently, but new users may be
unable to save preferences if their profile row is not created by the database.

## Files

| File                           | Purpose                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `src/lib/supabase.js`          | Existing client, environment checks, explicit session settings.              |
| `src/composables/useAuth.js`   | Shared session, startup restoration, auth events and error messages.         |
| `src/router/index.js`          | Session-aware navigation and redirects.                                      |
| `src/views/SignUpView.vue`     | Registration, validation and email confirmation instructions.                |
| `src/views/LoginView.vue`      | Login, confirmation errors and confirmation email resend.                    |
| `src/views/ProfileView.vue`    | Logout loading/errors and unavailable-profile message.                       |
| `src/views/LandingView.vue`    | Useful homepage links for signed-in users.                                   |
| `src/components/NavBar.vue`    | Profile link for signed-in users, login link for guests.                     |
| `e2e/auth.spec.js`             | Auth tests using mocked API responses, without sending real emails.          |
| `e2e/helpers/auth.js`          | Shared fake session for existing activity tests.                             |
| Existing activity/navbar specs | Signed-in setup for the newly protected routes.                              |
| `playwright.config.js`         | Optional `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome` to test with installed Chrome. |

## Manual check with a real account

1. Register with an email you control and check that the page asks you to confirm.
2. Check that protected pages redirect to login before confirmation.
3. Follow the email link; verify the app returns home with activity/group links.
4. Open `/profile`, refresh, and verify the session remains.
5. Confirm the database created a matching profile; check saving preferences.
6. Log out, refresh, and verify `/profile` requires login again.

Automated tests mock Supabase, so they do not verify the live email delivery,
redirect allowlist, profile trigger, password rules, or RLS configuration.

References: [Signup](https://supabase.com/docs/reference/javascript/auth-signup),
[auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[user profiles](https://supabase.com/docs/guides/auth/managing-user-data).
