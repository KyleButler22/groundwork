-- Groundwork schema — migration 0004: plans & logs
-- See docs/schema.md section 3 and docs/generator.md. Three layers, never
-- collapsed: a plan (template) -> a session's plan_items (prescription) ->
-- workout_logs/set_logs (what actually happened).

create table workout_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles on delete cascade,
  name              text not null,
  split_type        text not null check (
    split_type in ('full_body', 'upper_lower', 'push_pull_legs')
  ),
  days_per_week     smallint not null,
  weeks             smallint not null default 4,
  starts_on         date not null,
  status            text not null default 'active' check (status in ('active', 'archived')),
  generator_version text not null,
  seed              bigint not null,
  created_at        timestamptz not null default now()
);

-- day_index is an ORDER within the block, not a weekday — the block slides
-- when sessions are missed rather than sticking to a calendar. Every date
-- shown in the UI derives from workout_logs.performed_at, never from
-- starts_on + arithmetic. (Decided 2026-08-27.)
create table plan_sessions (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references workout_plans on delete cascade,
  week_number smallint not null,
  day_index   smallint not null,
  name        text not null,
  week_type   text not null default 'build' check (week_type in ('build', 'peak', 'deload')),
  est_minutes smallint,
  unique (plan_id, week_number, day_index)
);

create table plan_items (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references plan_sessions on delete cascade,
  order_index       smallint not null,
  exercise_id       int not null references exercises,
  sets              smallint not null,
  target_rep_min    smallint,
  target_rep_max    smallint,
  target_seconds    smallint,
  rest_seconds      smallint not null default 90,
  tempo             text,
  superset_group    smallint,
  is_amrap_last_set boolean not null default false,
  note              text
);

create table workout_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles on delete cascade,
  plan_session_id  uuid references plan_sessions on delete set null,
  performed_at     timestamptz not null,
  duration_minutes smallint,
  session_rpe      smallint check (session_rpe between 1 and 10),
  status           text not null default 'completed'
    check (status in ('completed', 'partial', 'skipped')),
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- exercise_id is denormalised from plan_items on purpose: people substitute
-- mid-session (shoulder hurts, swap archer for diamond push-ups), and the
-- log has to record what actually happened, not what was prescribed.
create table set_logs (
  id              uuid primary key default gen_random_uuid(),
  workout_log_id  uuid not null references workout_logs on delete cascade,
  plan_item_id    uuid references plan_items on delete set null,
  exercise_id     int not null references exercises,
  set_number      smallint not null,
  reps            smallint,
  seconds         smallint,
  added_weight_kg numeric(5, 2),
  assist_band     text,
  rpe             smallint check (rpe between 1 and 10),
  completed_at    timestamptz not null default now()
);

-- The promotion engine's state. One row per pattern per user.
create table user_exercise_levels (
  user_id             uuid not null references profiles on delete cascade,
  pattern_id          smallint not null references movement_patterns,
  exercise_id         int not null references exercises,
  consecutive_success smallint not null default 0,
  consecutive_failure smallint not null default 0,
  last_evaluated_at   timestamptz,
  updated_at          timestamptz not null default now(),
  primary key (user_id, pattern_id)
);

create index on plan_items (session_id, order_index);
create index on workout_logs (user_id, performed_at desc);
create index on set_logs (workout_log_id, set_number);
