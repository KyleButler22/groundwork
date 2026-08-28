-- Groundwork schema — migration 0006: recipes
-- See docs/schema.md section 5. Per-serving macros are computed from
-- recipe_ingredients then denormalised onto recipes — recompute on save,
-- treat the stored value as a single-writer cache.

create table recipes (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,
  title                text not null,
  summary              text,
  servings             smallint not null,
  prep_minutes         smallint not null,
  cook_minutes         smallint not null,
  cuisine              text,
  image_url            text,
  difficulty           smallint not null default 2 check (difficulty between 1 and 3),
  kcal_per_serving     numeric(7, 2) not null,
  protein_per_serving  numeric(6, 2) not null,
  carb_per_serving     numeric(6, 2) not null,
  fat_per_serving      numeric(6, 2) not null,
  is_active            boolean not null default true,
  updated_at           timestamptz not null default now()
);
create index on recipes (kcal_per_serving, protein_per_serving) where is_active;

create table recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipes on delete cascade,
  ingredient_id uuid not null references ingredients,
  quantity      numeric(8, 2) not null,
  unit_id       smallint not null references units,
  prep_note     text,
  is_optional   boolean not null default false,
  order_index   smallint not null
);
create index on recipe_ingredients (recipe_id);
create index on recipe_ingredients (ingredient_id);

create table recipe_steps (
  recipe_id   uuid not null references recipes on delete cascade,
  step_number smallint not null,
  instruction text not null,
  primary key (recipe_id, step_number)
);

create table recipe_meal_slots (
  recipe_id uuid not null references recipes on delete cascade,
  slot      text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  primary key (recipe_id, slot)
);

create table diet_tags (
  id   smallserial primary key,
  slug text unique not null,
  name text not null
);

create table recipe_diet_tags (
  recipe_id   uuid not null references recipes on delete cascade,
  diet_tag_id smallint not null references diet_tags,
  primary key (recipe_id, diet_tag_id)
);

-- Per-user dietary constraints, applied as hard filters before any scoring.
create table user_allergens (
  user_id     uuid not null references profiles on delete cascade,
  allergen_id smallint not null references allergens,
  primary key (user_id, allergen_id)
);

create table user_diet_tags (
  user_id     uuid not null references profiles on delete cascade,
  diet_tag_id smallint not null references diet_tags,
  primary key (user_id, diet_tag_id)
);

create table user_disliked_ingredients (
  user_id       uuid not null references profiles on delete cascade,
  ingredient_id uuid not null references ingredients,
  primary key (user_id, ingredient_id)
);

create table user_pantry (
  user_id       uuid not null references profiles on delete cascade,
  ingredient_id uuid not null references ingredients,
  primary key (user_id, ingredient_id)
);
