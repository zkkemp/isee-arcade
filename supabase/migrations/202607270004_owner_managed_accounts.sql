-- Owner-issued parent accounts for ISEE Arcade.
-- Apply only to the isolated ISEE Arcade project hgmupcysijskaowsrgbn.
-- Never run this in any KEMPCO/Chemco/FSM project.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.parent_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  account_role text not null default 'parent'
    check (account_role in ('owner', 'parent')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'removed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (username ~ '^[a-z0-9_-]{3,32}$')
);

create unique index if not exists parent_accounts_username_unique
  on public.parent_accounts(lower(username));

create table if not exists public.parent_account_invites (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  auth_email text not null,
  account_role text not null default 'parent'
    check (account_role in ('owner', 'parent')),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (username ~ '^[a-z0-9_-]{3,32}$')
);

create unique index if not exists parent_account_open_invite_email_unique
  on public.parent_account_invites(lower(auth_email))
  where consumed_at is null;

create table if not exists public.owner_account_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null
    check (action in ('create', 'reset_password', 'suspend', 'activate', 'remove')),
  target_username text not null,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.parent_accounts enable row level security;
alter table public.parent_account_invites enable row level security;
alter table public.owner_account_audit enable row level security;

create or replace function public.is_platform_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user is not null
    and exists (
      select 1 from public.platform_admins where user_id = target_user
    );
$$;

create or replace function public.is_account_active(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user is not null
    and exists (
      select 1
      from public.parent_accounts
      where user_id = target_user
        and status = 'active'
    );
$$;

-- Preserve an already-created single account as the site owner. This migration
-- intentionally refuses to guess if more than one account already exists.
insert into public.parent_accounts(user_id, username, account_role, status)
select
  users.id,
  left(
    coalesce(
      nullif(
        regexp_replace(
          lower(coalesce(users.raw_user_meta_data ->> 'username', split_part(users.email, '@', 1))),
          '[^a-z0-9_-]+',
          '',
          'g'
        ),
        ''
      ),
      'owner'
    ),
    32
  ),
  case when (select count(*) from auth.users) = 1 then 'owner' else 'parent' end,
  'active'
from auth.users as users
on conflict (user_id) do nothing;

insert into public.platform_admins(user_id)
select id
from auth.users
where (select count(*) from auth.users) = 1
limit 1
on conflict (user_id) do nothing;

update public.parent_accounts
set account_role = 'owner', updated_at = now()
where user_id in (select user_id from public.platform_admins);

create or replace function public.is_household_member(target_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_account_active(auth.uid())
    and exists (
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
  if not public.is_account_active(current_user_id) then
    raise exception 'This account is not active';
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
  values (
    new_household,
    current_user_id,
    case when public.is_platform_admin(current_user_id) then 'owner' else 'parent' end
  );

  return new_household;
end;
$$;

-- Every new auth identity must match a short-lived invitation created by the
-- server-only owner API. Removing the public signup button is not the security
-- boundary; this trigger is.
create or replace function public.require_owner_issued_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_invite public.parent_account_invites%rowtype;
begin
  select *
  into matching_invite
  from public.parent_account_invites
  where lower(auth_email) = lower(coalesce(new.email, ''))
    and consumed_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if matching_invite.id is null then
    raise exception 'This parent account must be issued by the ISEE Arcade owner.';
  end if;

  if matching_invite.account_role = 'owner'
     and exists (select 1 from public.platform_admins) then
    raise exception 'The ISEE Arcade owner account already exists.';
  end if;

  update public.parent_account_invites
  set consumed_at = now()
  where id = matching_invite.id;

  new.raw_user_meta_data :=
    coalesce(new.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'username', matching_invite.username,
      'account_type', matching_invite.account_role
    );
  new.raw_app_meta_data :=
    coalesce(new.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'isee_account_role', matching_invite.account_role,
      'isee_invite_id', matching_invite.id
    );
  return new;
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
  invite_id uuid := nullif(new.raw_app_meta_data ->> 'isee_invite_id', '')::uuid;
  issued_role text := coalesce(new.raw_app_meta_data ->> 'isee_account_role', 'parent');
  issued_username text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  issuer uuid;
begin
  select created_by into issuer
  from public.parent_account_invites
  where id = invite_id;

  if issued_role = 'owner' then
    insert into public.platform_admins(user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  insert into public.parent_accounts(
    user_id,
    username,
    account_role,
    status,
    created_by
  )
  values (new.id, issued_username, issued_role, 'active', issuer);

  if not exists (
    select 1 from public.household_members where user_id = new.id
  ) then
    insert into public.households(name)
    values (case when issued_role = 'owner' then 'Owner family' else 'My family' end)
    returning id into new_household;

    insert into public.household_members(household_id, user_id, role)
    values (
      new_household,
      new.id,
      case when issued_role = 'owner' then 'owner' else 'parent' end
    );
  end if;

  update public.parent_account_invites
  set auth_user_id = new.id
  where id = invite_id;

  return new;
end;
$$;

drop trigger if exists before_auth_user_created_isee_arcade on auth.users;
create trigger before_auth_user_created_isee_arcade
  before insert on auth.users
  for each row execute procedure public.require_owner_issued_account();

drop trigger if exists on_auth_user_created_isee_arcade on auth.users;
create trigger on_auth_user_created_isee_arcade
  after insert on auth.users
  for each row execute procedure public.handle_new_parent();

drop policy if exists "owner can read own admin marker" on public.platform_admins;
create policy "owner can read own admin marker"
on public.platform_admins for select
using (user_id = auth.uid());

drop policy if exists "account can read own status" on public.parent_accounts;
create policy "account can read own status"
on public.parent_accounts for select
using (user_id = auth.uid());

grant execute on function public.is_platform_admin(uuid) to authenticated;
grant execute on function public.is_account_active(uuid) to authenticated;
revoke execute on function public.is_platform_admin(uuid) from public;
revoke execute on function public.is_account_active(uuid) from public;

revoke all on table public.parent_account_invites from anon, authenticated;
revoke all on table public.owner_account_audit from anon, authenticated;
revoke all on table public.platform_admins from anon;
revoke all on table public.parent_accounts from anon;

-- RLS decides which family rows an authenticated parent may reach. Explicit
-- table grants are still required for PostgREST to evaluate those policies.
grant select on table public.parent_accounts to authenticated;
grant select on table public.platform_admins to authenticated;
grant select on table public.household_members to authenticated;
grant select, update on table public.households to authenticated;
grant select, insert, update, delete on table public.learners to authenticated;
grant select, insert, update on table public.learner_snapshots to authenticated;
grant select, insert on table public.question_attempts to authenticated;
grant select, insert, update on table public.parent_preferences to authenticated;
