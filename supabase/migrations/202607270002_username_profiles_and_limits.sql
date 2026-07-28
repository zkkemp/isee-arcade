-- Username profiles, child credentials, and parent-controlled limits.
-- Run only after 202607270001_initial_family_sync.sql in the separate
-- ISEE Arcade Supabase project. Never run this in any KEMPCO/FSM project.

alter table public.learners
  drop constraint if exists learners_grade_band_check;

alter table public.learners
  add constraint learners_grade_band_check check (
    grade_band in (
      'k',
      'grade1',
      'grade2',
      'grade3',
      'grade4',
      'grade5',
      'grade6',
      'grade7',
      'grade8',
      'isee',
      'iseeMiddle',
      'iseeUpper'
    )
  );

alter table public.learners
  add column if not exists username text,
  add column if not exists password_hash text not null default '',
  add column if not exists password_salt text not null default '',
  add column if not exists daily_limit_minutes integer not null default 30,
  add column if not exists question_block_size integer not null default 8;

update public.learners
set username =
  left(
    coalesce(
      nullif(regexp_replace(lower(display_name), '[^a-z0-9_-]+', '', 'g'), ''),
      'player'
    ),
    20
  ) || '-' || left(replace(id::text, '-', ''), 5)
where username is null or username = '';

alter table public.learners
  alter column username set not null,
  add constraint learners_username_length_check check (char_length(username) between 1 and 24),
  add constraint learners_daily_limit_check check (daily_limit_minutes between 5 and 240),
  add constraint learners_question_block_check check (question_block_size between 5 and 20);

create unique index if not exists learners_household_username_idx
  on public.learners(household_id, lower(username));

comment on column public.learners.password_hash is
  'PBKDF2-SHA256 child password verifier. Plaintext passwords are never stored.';
comment on column public.learners.password_salt is
  'Random salt paired with password_hash.';
