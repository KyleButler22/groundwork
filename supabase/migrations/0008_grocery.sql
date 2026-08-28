-- Groundwork schema — migration 0008: grocery
-- See docs/schema.md section 7. Its own table, not a view — the list must
-- be editable and checkable with zero network once generated.

create table grocery_lists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles on delete cascade,
  meal_plan_id uuid references meal_plans on delete set null,
  title        text not null,
  status       text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- aisle_id is denormalised (copied, not joined through ingredients) so the
-- list sorts correctly straight out of the offline cache with zero joins —
-- exactly the situation you're in standing in the produce section.
create table grocery_items (
  id               uuid primary key default gen_random_uuid(),
  list_id          uuid not null references grocery_lists on delete cascade,
  ingredient_id    uuid references ingredients,
  manual_label     text,
  total_grams      numeric(10, 2),
  display_quantity numeric(8, 2),
  display_unit_id  smallint references units,
  aisle_id         smallint references aisles,
  is_checked       boolean not null default false,
  checked_at       timestamptz,
  source_entry_ids uuid[] not null default '{}',
  sort_index       smallint not null default 0,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  check (ingredient_id is not null or manual_label is not null)
);
create index on grocery_items (list_id, aisle_id, sort_index);
