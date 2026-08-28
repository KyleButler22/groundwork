-- Groundwork schema — migration 0007: meal plans
-- See docs/schema.md section 6 and docs/mealgen.md.

create table meal_plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles on delete cascade,
  week_starts_on    date not null,
  kcal_target       int not null,
  protein_target_g  int not null,
  carb_target_g     int not null,
  fat_target_g      int not null,
  generator_version text not null,
  seed              bigint not null,
  regen_count       smallint not null default 0,
  status            text not null default 'active' check (status in ('active', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, week_starts_on)
);

-- is_locked survives a "regenerate week". leftover_of_id is the self-reference
-- that lets one cook serve two meal_plan_entries — see docs/mealgen.md section 2.
create table meal_plan_entries (
  id             uuid primary key default gen_random_uuid(),
  meal_plan_id   uuid not null references meal_plans on delete cascade,
  serve_on       date not null,
  slot           text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id      uuid not null references recipes,
  servings       numeric(4, 2) not null default 1,
  is_locked      boolean not null default false,
  leftover_of_id uuid references meal_plan_entries on delete cascade,
  unique (meal_plan_id, serve_on, slot)
);

-- One table doing three jobs: exclusion (never), personalisation (loved),
-- and variety cooldown (last_served_on). See docs/schema.md section 6.
create table user_recipe_feedback (
  user_id        uuid not null references profiles on delete cascade,
  recipe_id      uuid not null references recipes on delete cascade,
  rating         text check (rating in ('loved', 'ok', 'never')),
  last_served_on date,
  serve_count    smallint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index on meal_plan_entries (meal_plan_id, serve_on);
