# Authentication

The app uses the existing Supabase project and public key. Profile creation requires
the database setup described below; saving the SQL file locally does not apply it
to Supabase.

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
- Also allow `http://localhost:5173/onboarding` and your deployed `/onboarding`
  URL for signup confirmation and resends.
- If you run the app at another port or under a subpath, allow its actual `/login`
  and `/onboarding` URLs too.
- When manually checking the production preview, allow `http://localhost:4173/login`.
  Also allow `http://localhost:4173/onboarding` for signup confirmation.

Signup and confirmation resends use `/onboarding` as the email destination.
Supabase confirms the email and returns a session in the URL. The app restores
that session before opening onboarding. Failed/expired links redirect to login,
where the user can resend confirmation. Rate limits and password requirements
configured in Supabase still apply.

Signup success with no session means the user must check their email; it does not
grant access to protected pages. Signup with an immediate session goes directly
to `/onboarding`; email confirmation goes there once a session is established.
Ordinary login redirects to `/`, where signed-in users see activity and group
links. No query parameter or extra redirect helper is needed.

The pages use the same basic patterns as the Week 6 course examples:
`<script setup>`, `ref`, and `async/await` with `try/catch/finally`. Signup uses a direct
`router.replace('/onboarding')` when a session is available.

## Sessions and routes

`src/composables/useAuth.js` shares the current session and restores it using
`getSession()`. Supabase persists and refreshes tokens. The router waits for this
initial check before redirecting, including on page refresh.

Only `/`, `/signup`, `/login`, and the 404 page are public. All activity, group,
onboarding, profile, and admin routes require a session. Signing out also redirects
other open protected tabs. Login/signup redirect authenticated visitors home.

If Supabase clears the local session while returning a server logout error, the
login page displays that error so it is not lost during the redirect.

The admin route also checks `profiles.is_admin`, and the navbar shows Admin only
for admin accounts. Roles are checked on navigation. Frontend guards control
navigation; database permissions and review functions must also be installed
using the [admin setup instructions](admin-review.md).

## Profile creation

Supabase Auth users and `public.profiles` are separate:

- `ProfileView.vue` reads and updates `display_name`, `interests`, `budget`,
  `home_area`, `home_station_id`, and `company`, matching `profiles.id` to the Auth user's ID.
- `OnboardingView.vue` reads and updates preferences on an existing row.
- Signup creates an Auth account, without inserting a profile from the frontend.

Dashboard SQL results confirmed an existing Auth user had no matching profile and
there were no user-defined triggers on `auth.users`. The inspected `profiles` table
requires only `id`; preference/name fields are nullable, `is_admin` defaults to
`false`, and `created_at` has a default timestamp.

Run the entire [profile setup script](sql/create_profiles_on_signup.sql) in the
Supabase SQL Editor as the `postgres` role. It runs in a transaction and:

1. Adds a function and an `AFTER INSERT` trigger to create a profile with the new
   Auth user's ID, including when signup still requires email confirmation.
2. Creates profiles for existing Auth users who do not have one.
3. Preserves existing profiles and uses the table's defaults for omitted fields.
4. Reports `users_without_profiles`, which should be `0` after applying it.

The script can be rerun and replaces only its own named trigger. It expects `id`
to be a primary key or have a unique constraint, as required by `ON CONFLICT (id)`.
It does not change table columns or RLS policies. The trigger uses a
`SECURITY DEFINER` function with an empty search path and fully qualified tables,
following Supabase's user profile guidance.

The script was applied in the Supabase SQL Editor and reported
`users_without_profiles = 0`, confirming the existing accounts had matching
profiles. A fresh signup and profile saving still need the manual check below;
the live browser check was not run.

The profile page displays an error and disables saving when no row is visible.
If a row exists in the SQL Editor but the page still cannot load it, inspect the
existing SELECT RLS policy and table grants. The signed-in user must also be
allowed to UPDATE their profile to save preferences. MRT selection also requires a column-level
UPDATE grant on `home_station_id`; use [the small MRT repair script](sql/mrt_station_preferences.sql)
if the map works but saving fails after applying the admin setup.

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
3. Follow the email link; verify the app opens `/onboarding`. Complete the steps
   and confirm the answers save. If email confirmation is disabled, signup should
   open onboarding immediately.
4. Open `/profile`, refresh, and verify the session remains.
5. Confirm the database created a matching profile; check saving preferences.
6. Log out, refresh, and verify `/profile` requires login again.

Existing automated tests mock Supabase, so they do not verify live email delivery,
redirect allowlists, the profile trigger, password rules, or RLS configuration.
Signup tests expect confirmation links to return to `/onboarding`. Profile tests
allow the additional read-only admin role check during navigation.

References: [Signup](https://supabase.com/docs/reference/javascript/auth-signup),
[auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[user profiles](https://supabase.com/docs/guides/auth/managing-user-data).
