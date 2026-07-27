-- ISEE Arcade cloud persistence
-- Run only in a brand-new Supabase project created specifically for ISEE Arcade.
-- Never run this migration in the KEMPCO/FSM project.

create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My family' check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'parent' check (role in ('owner', 'parent')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  local_profile_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 32),
  grade_band text not null check (grade_band in ('k', 'grade1', 'grade3', 'isee')),
  avatar_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learner_snapshots (
  learner_id uuid primary key references public.learners(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  play_session jsonb not null default '{}'::jsonb,
  recent_games jsonb not null default '[]'::jsonb,
  painting_progress jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.question_attempts (
  attempt_key text primary key,
  learner_id uuid not null references public.learners(id) on delete cascade,
  question_id text not null,
  subject text not null check (subject in ('verbal', 'quantitative', 'reading', 'math')),
  correct boolean not null,
  answered_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index learners_household_idx on public.learners(household_id);
create unique index learners_household_local_profile_idx
  on public.learners(household_id, local_profile_id);
create index attempts_learner_time_idx on public.question_attempts(learner_id, answered_at desc);
create index attempts_learner_subject_idx on public.question_attempts(learner_id, subject);

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household
      and user_id = auth.uid()
  );
$$;

create or replace function public.ensure_my_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_household uuid;
  new_household uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select household_id into existing_household
  from public.household_members
  where user_id = current_user_id
  order by joined_at
  limit 1;

  if existing_household is not null then
    return existing_household;
  end if;

  insert into public.households(name)
  values ('My family')
  returning id into new_household;

  insert into public.household_members(household_id, user_id, role)
  values (new_household, current_user_id, 'owner');

  return new_household;
end;
$$;

create or replace function public.handle_new_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household uuid;
begin
  if not exists (
    select 1 from public.household_members where user_id = new.id
  ) then
    insert into public.households(name)
    values ('My family')
    returning id into new_household;

    insert into public.household_members(household_id, user_id, role)
    values (new_household, new.id, 'owner');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_isee_arcade on auth.users;
create trigger on_auth_user_created_isee_arcade
  after insert on auth.users
  for each row execute procedure public.handle_new_parent();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.learners enable row level security;
alter table public.learner_snapshots enable row level security;
alter table public.question_attempts enable row level security;

create policy "members can read their household"
on public.households for select
using (public.is_household_member(id));

create policy "members can update their household"
on public.households for update
using (public.is_household_member(id))
with check (public.is_household_member(id));

create policy "members can read household membership"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "parents can read learners"
on public.learners for select
using (public.is_household_member(household_id));

create policy "parents can create learners"
on public.learners for insert
with check (public.is_household_member(household_id));

create policy "parents can update learners"
on public.learners for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "parents can remove learners"
on public.learners for delete
using (public.is_household_member(household_id));

create policy "parents can read learner snapshots"
on public.learner_snapshots for select
using (
  exists (
    select 1 from public.learners
    where learners.id = learner_snapshots.learner_id
      and public.is_household_member(learners.household_id)
  )
);

create policy "parents can create learner snapshots"
on public.learner_snapshots for insert
with check (
  exists (
    select 1 from public.learners
    where learners.id = learner_snapshots.learner_id
      and public.is_household_member(learners.household_id)
  )
);

create policy "parents can update learner snapshots"
on public.learner_snapshots for update
using (
  exists (
    select 1 from public.learners
    where learners.id = learner_snapshots.learner_id
      and public.is_household_member(learners.household_id)
  )
)
with check (
  exists (
    select 1 from public.learners
    where learners.id = learner_snapshots.learner_id
      and public.is_household_member(learners.household_id)
  )
);

create policy "parents can read attempts"
on public.question_attempts for select
using (
  exists (
    select 1 from public.learners
    where learners.id = question_attempts.learner_id
      and public.is_household_member(learners.household_id)
  )
);

create policy "parents can create attempts"
on public.question_attempts for insert
with check (
  exists (
    select 1 from public.learners
    where learners.id = question_attempts.learner_id
      and public.is_household_member(learners.household_id)
  )
);

grant execute on function public.ensure_my_household() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
revoke execute on function public.ensure_my_household() from public;
revoke execute on function public.is_household_member(uuid) from public;
