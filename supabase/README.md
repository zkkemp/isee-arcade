# ISEE Arcade Supabase setup

This directory belongs only to ISEE Arcade. Do not run these migrations in, copy
credentials from, or otherwise interact with the KEMPCO/FSM Supabase project.

1. Create a new Supabase project named `isee-arcade` (or another unmistakably
   ISEE-specific name).
2. Open that new project's SQL editor and run the migration in
   `supabase/migrations/202607270001_initial_family_sync.sql`.
3. Copy `.env.example` to `.env.local`.
4. From the new project's Connect/API screen, put its project URL and
   publishable key into `.env.local`.
5. Add the same two variables to the separate ISEE Arcade Vercel project.
6. In Supabase Authentication URL Configuration, set the production Site URL
   and add `http://localhost:3100/**` plus the production callback URL to the
   redirect allow list.

No service-role key is required by the app and no service-role key should ever
be exposed to the browser. Row Level Security keeps each family inside its own
household.
