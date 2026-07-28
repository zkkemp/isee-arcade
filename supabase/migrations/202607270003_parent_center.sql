-- Parent reports, gentle adaptive practice, and reversible curriculum controls.
-- Apply only to the isolated ISEE Arcade project hgmupcysijskaowsrgbn.
-- Never run this in any KEMPCO/Chemco/FSM project.

alter table public.learners
  add column if not exists smart_practice boolean not null default true;

create table if not exists public.parent_preferences (
  household_id uuid primary key references public.households(id) on delete cascade,
  content_controls jsonb not null default '{"disabled":[],"bookmarks":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.parent_preferences enable row level security;

drop policy if exists "parents can read parent preferences" on public.parent_preferences;
create policy "parents can read parent preferences"
on public.parent_preferences for select
using (public.is_household_member(household_id));

drop policy if exists "parents can create parent preferences" on public.parent_preferences;
create policy "parents can create parent preferences"
on public.parent_preferences for insert
with check (public.is_household_member(household_id));

drop policy if exists "parents can update parent preferences" on public.parent_preferences;
create policy "parents can update parent preferences"
on public.parent_preferences for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));
