-- Groundwork schema — migration 0002: identity & intake
-- See docs/schema.md section 1 and docs/intake.md.

create table profiles (
  id             uuid primary key references auth.users on delete cascade,
  display_name   text,
  birth_year     smallint,
  sex_at_birth   text check (sex_at_birth in ('male', 'female', 'unspecified')),
  height_cm      numeric(5, 1),
  units          text not null default 'metric' check (units in ('metric', 'imperial')),
  timezone       text not null default 'UTC',
  household_size smallint not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Weight is a time series, not a column. Progress charts are retention.
create table body_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  recorded_on date not null,
  weight_kg   numeric(5, 2),
  bodyfat_pct numeric(4, 1),
  waist_cm    numeric(5, 1),
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, recorded_on)
);

-- Append-only. Never update a row; write a new one with a bumped version.
create table intake_responses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles on delete cascade,
  schema_version int not null,
  answers        jsonb not null,
  submitted_at   timestamptz not null default now()
);

-- The typed projection the generators actually read.
create table user_targets (
  user_id            uuid primary key references profiles on delete cascade,
  intake_response_id uuid references intake_responses,
  goal               text not null check (
    goal in ('fat_loss', 'muscle_gain', 'recomp', 'maintain', 'skill')
  ),
  activity_factor    numeric(3, 2) not null,
  tdee_kcal          int not null,
  kcal_target        int not null,
  protein_g          int not null,
  fat_g              int not null,
  carb_g             int not null,
  days_per_week      smallint not null check (days_per_week between 1 and 7),
  session_minutes    smallint not null,
  -- Which of the 4 meal_plan_entries slots to plan at all — an explicit
  -- per-slot choice, not a count (see docs/mealgen.md's "mealsPerDay"
  -- entry): a count plus a fixed highest-share-first priority order can
  -- express "just dinner" but never "breakfast and lunch, no dinner".
  -- Four booleans directly on this row, not a join table the way
  -- user_diet_tags/user_allergens are — the vocabulary here is a fixed
  -- 4-value enum that will never grow, unlike diet tags or allergens.
  wants_breakfast    boolean not null default true,
  wants_lunch        boolean not null default true,
  wants_dinner       boolean not null default true,
  wants_snack        boolean not null default false,
  cook_time_ceiling  smallint,
  computed_at        timestamptz not null default now(),
  constraint at_least_one_meal_slot check (
    wants_breakfast or wants_lunch or wants_dinner or wants_snack
  )
);

create index on body_metrics (user_id, recorded_on desc);
create index on intake_responses (user_id, submitted_at desc);
