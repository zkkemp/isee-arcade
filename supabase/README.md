# ISEE Arcade Supabase setup

This directory belongs only to ISEE Arcade. Do not run these migrations in, copy
credentials from, or otherwise interact with the KEMPCO/FSM Supabase project.

1. Create a new Supabase project named `isee-arcade` (or another unmistakably
   ISEE-specific name).
2. Open that new project's SQL editor and run the migrations in filename order:
   `202607270001_initial_family_sync.sql`, then
   `202607270002_username_profiles_and_limits.sql`, then
   `202607270003_parent_center.sql`, then
   `202607270004_owner_managed_accounts.sql`.
3. Copy `.env.example` to `.env.local`.
4. From the new project's Connect/API screen, put its project URL and
   publishable key into `.env.local`.
5. Add the same two variables to the separate ISEE Arcade Vercel project.
6. Add this ISEE project's service-role key as
   `SUPABASE_SERVICE_ROLE_KEY` in Vercel. It is server-only and must never use a
   `NEXT_PUBLIC_` prefix.
7. In Supabase Authentication settings, turn **Allow new users to sign up** off.
   Parent accounts are created only from the protected owner console. The
   database invitation trigger also rejects unissued signups as a second layer.
8. Keep **Confirm email** off. The app uses a username-only experience and
   creates an internal email-shaped Auth identifier; it never sends or asks
   families to manage email.
9. In Authentication URL Configuration, set the production Site URL and add
   `http://localhost:3000/**` plus the production callback URL to the redirect
   allow list.
10. Create the one and only platform owner with the repository's
    `npm run bootstrap:owner` script. It accepts `OWNER_USERNAME` and
    `OWNER_PASSWORD` only for that one run, refuses every project except
    `hgmupcysijskaowsrgbn`, and permanently closes after an owner exists.

The service-role key is used only by authenticated server routes after they
verify that the caller is the platform owner. It is never sent to the browser.
Row Level Security keeps each family inside its own household, and suspended or
removed accounts fail the active-account check.
