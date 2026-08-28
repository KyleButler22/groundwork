-- Groundwork schema — migration 0003: movement library
-- See docs/schema.md section 2. This is the progression graph — the real
-- IP of the app. Content table: authored once, read by every user, never
-- written from the client.

create table movement_patterns (
  id         smallserial primary key,
  slug       text unique not null,
  name       text not null,
  category   text not null check (category in ('push', 'pull', 'legs', 'core', 'skill')),
  sort_order smallint not null
);

create table exercises (
  id            serial primary key,
  slug          text unique not null,
  name          text not null,
  pattern_id    smallint not null references movement_patterns,
  level         numeric(4, 1) not null,
  metric_type   text not null check (metric_type in ('reps', 'time_seconds', 'distance_m')),
  rep_min       smallint,
  rep_max       smallint,
  hold_min_s    smallint,
  hold_max_s    smallint,
  distance_min_m numeric(4, 1),
  distance_max_m numeric(4, 1),
  is_unilateral boolean not null default false,
  demo_url      text,
  cues          text,
  is_active     boolean not null default true
);
create index on exercises (pattern_id, level);

create table progression_edges (
  from_exercise_id int not null references exercises on delete cascade,
  to_exercise_id   int not null references exercises on delete cascade,
  kind             text not null default 'progression'
    check (kind in ('progression', 'regression', 'lateral')),
  primary key (from_exercise_id, to_exercise_id, kind)
);

create table equipment (
  id   smallserial primary key,
  slug text unique not null,
  name text not null
);

-- alternative_group: same group means "any one of these works" (rings OR
-- parallettes OR a sturdy chair). Different groups means all are required.
create table exercise_equipment (
  exercise_id       int not null references exercises on delete cascade,
  equipment_id      smallint not null references equipment,
  alternative_group smallint not null default 0,
  primary key (exercise_id, equipment_id)
);

create table user_equipment (
  user_id      uuid not null references profiles on delete cascade,
  equipment_id smallint not null references equipment,
  primary key (user_id, equipment_id)
);

-- Injuries gate exercise selection, so exercises must declare what they load.
create table body_regions (
  id   smallserial primary key,
  slug text unique not null,
  name text not null
);

create table exercise_contraindications (
  exercise_id int not null references exercises on delete cascade,
  region_id   smallint not null references body_regions,
  severity    text not null default 'avoid' check (severity in ('avoid', 'caution')),
  primary key (exercise_id, region_id)
);

create table user_limitations (
  user_id    uuid not null references profiles on delete cascade,
  region_id  smallint not null references body_regions,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, region_id)
);
