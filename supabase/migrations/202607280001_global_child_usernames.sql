-- Unified sign-in requires each child username to identify exactly one learner.
-- Run only in the separate ISEE Arcade Supabase project.

create unique index if not exists learners_global_username_idx
  on public.learners(lower(username));
