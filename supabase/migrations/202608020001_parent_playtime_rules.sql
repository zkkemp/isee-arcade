-- Parent-selected question interval and perfect-study reward.
-- Apply only to the isolated ISEE Arcade project hgmupcysijskaowsrgbn.
-- Never run this in any KEMPCO/FSM project.

alter table public.learners
  add column if not exists play_window_minutes integer not null default 6,
  add column if not exists perfect_block_bonus_minutes integer not null default 0;

alter table public.learners
  drop constraint if exists learners_play_window_minutes_check,
  drop constraint if exists learners_perfect_block_bonus_minutes_check;

alter table public.learners
  add constraint learners_play_window_minutes_check
    check (play_window_minutes between 1 and 60),
  add constraint learners_perfect_block_bonus_minutes_check
    check (perfect_block_bonus_minutes between 0 and 60);

comment on column public.learners.play_window_minutes is
  'Parent-selected uninterrupted play minutes before the next study block.';
comment on column public.learners.perfect_block_bonus_minutes is
  'Extra play minutes awarded only when a study block has zero wrong answers.';
